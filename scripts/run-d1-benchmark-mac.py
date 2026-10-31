#!/usr/bin/env python3
"""D1 same-workload bridge/controller comparison, owned native processes and isolated fixture data.
Usage: python3 scripts/run-d1-benchmark-mac.py CONTROL.app CANDIDATE.app NEW_OUT
--groups NAME... --pilot-count N is qualification only, never a formal P-4 result.
"""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import math
import os
import signal
import subprocess
import sys
import time

GROUPS = ['control-natural1', 'candidate-natural1', 'control-natural2', 'candidate-natural2',
          'control-natural3', 'candidate-natural3', 'control-instrumentOff', 'candidate-instrumentOff',
          'control-GC1', 'candidate-GC1']


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def write(file, value):
    temp=file.with_name(file.name+'.partial')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(file)


def payload(app):
    root = app / 'Contents/Resources/app.nw'
    return {p.relative_to(root).as_posix(): sha(p) for p in sorted(root.rglob('*')) if p.is_file()}


def app_memory(main_pid, app, request):
    """No system-wide process table or substring sum: enumerate only this launched PID's descendants."""
    result = dict(id=request['id'], collectorUTC=utc(), collectorMonotonic=time.monotonic(),
                  appRssBytes=None, appRssStatus='UNKNOWN', appRssReason=None, processes=[])
    try:
        pending, pids = [main_pid], set()
        while pending:
            parent = pending.pop()
            if parent in pids:
                continue
            pids.add(parent)
            if len(pids) > 64:
                raise RuntimeError('owned process tree exceeds bounded sample')
            children = subprocess.run(['pgrep', '-P', str(parent)], capture_output=True, text=True)
            if children.returncode not in [0, 1]:
                raise RuntimeError('direct-child enumeration denied/failed: ' + children.stderr.strip())
            pending.extend(int(p) for p in children.stdout.split())
        sample = subprocess.run(['ps', '-p', ','.join(map(str, sorted(pids))), '-o', 'pid=,ppid=,rss=,comm='],
                                capture_output=True, text=True)
        if sample.returncode:
            raise RuntimeError('owned PID sample denied/failed: ' + sample.stderr.strip())
        for line in sample.stdout.splitlines():
            pid, parent, rss, command = line.strip().split(None, 3)
            row = dict(pid=int(pid), parent=int(parent), rssBytes=int(rss)*1024, executable=command)
            if row['pid'] not in pids or str(app) + '/' not in command:
                raise RuntimeError('PID identity changed or executable not in owned app')
            result['processes'].append(row)
        sampled = {p['pid'] for p in result['processes']}
        if sampled != pids or request['rendererPid'] not in sampled:
            raise RuntimeError('partial process tree/renderer identity sample')
        if any(p['pid'] != main_pid and p['parent'] not in sampled for p in result['processes']):
            raise RuntimeError('process lineage changed during sample')
        result.update(appRssBytes=sum(p['rssBytes'] for p in result['processes']), appRssStatus='value')
    except (OSError, ValueError, RuntimeError) as error:
        result['appRssReason'] = str(error)
    return result


def run_group(app, info, out, group, count, formal, source_input):
    out.mkdir()
    report = out / 'report.json'
    gc, off = 'GC' in group, 'instrumentOff' in group
    args = [str(app / 'Contents/MacOS/nwjs'), '--user-data-dir='+str(out/'profile'), '--mute-audio',
            '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion',
            '--ps-flow-test=d1-benchmark', '--ps-flow-out='+str(report), '--ps-save-dir='+str(out/'saves'),
            '--ps-flow-quit', '--ps-d1-count='+str(count), '--ps-d1-sensors='+('off' if off else 'on')]
    if formal:
        args.append('--ps-d1-formal')
    if gc:
        args.extend(['--ps-d1-gc', '--js-flags=--expose-gc'])
    if not off:
        args.append('--ps-d1-rss-handshake')
    env = dict(os.environ)
    for name in ['NODE_OPTIONS', 'NODE_PATH', 'NPM_TOKEN', 'NODE_AUTH_TOKEN']:
        env.pop(name, None)
    row = dict(group=group, argv=args, startedUTC=utc(), deadlineSeconds=900, gc=gc, detailed=not off)
    before = payload(app)
    write(out/'PAYLOAD-BEFORE.json', before)
    samples, replied, last_progress, last_count = [], None, None, 0
    with (out/'native.log').open('x') as log:
        process = subprocess.Popen(args, cwd=app/'Contents/Resources/app.nw', env=env,
                                   stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        row['pid'] = process.pid
        write(out/'EXECUTION.json', row)
        deadline = time.monotonic()+900
        try:
            while process.poll() is None:
                if time.monotonic() > deadline:
                    row['timeout'] = True
                    raise RuntimeError(group+' timed out')
                fatal = out/'report.json.fatal.json'
                if fatal.exists():
                    raise RuntimeError(group+' fatal recorded; stop this run, retain evidence')
                request = out/'report.json.memory-request.json'
                if request.exists():
                    req = json.loads(request.read_text())
                    if req['id'] != replied:
                        answer = app_memory(process.pid, app, req)
                        samples.append(answer)
                        write(out/'report.json.memory-reply.json', answer)
                        write(out/'OWNED-APP-MEMORY.json', samples)
                        replied = req['id']
                progress = out/'report.json.benchmark-progress.json'
                if progress.exists() and progress.stat().st_mtime_ns != last_progress:
                    last_progress = progress.stat().st_mtime_ns
                    data = json.loads(progress.read_text())
                    completed = sum(r.get('status') == 'pass' for r in data['rows'])
                    if completed//10 > last_count//10:
                        print(group, str(completed)+'/'+str(count), flush=True)
                    last_count = completed
                time.sleep(.05)
            row['exit'] = process.returncode
        finally:
            row['ownGroupCleanup'] = False
            try:
                os.killpg(process.pid, 0)
                row['ownGroupCleanup'] = True
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            for _ in range(25):
                try:
                    os.killpg(process.pid, 0)
                except ProcessLookupError:
                    break
                time.sleep(.2)
            else:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
            row['finishedUTC'] = utc()
            row['reportExists'] = report.is_file()
            row['logSHA256'] = sha(out/'native.log')
            write(out/'EXECUTION.json', row)
    if row.get('exit') != 0 or not report.is_file():
        raise RuntimeError(group+' process/report failed')
    result = json.loads(report.read_text())
    benchmark = result.get('d1', {})
    tests = result.get('results', [])
    if result.get('overall') != 'pass' or len(tests) != 1 or tests[0].get('status') != 'pass' or not tests[0].get('id', '').startswith('D1-F100 '):
        raise RuntimeError(group+' scenario failed/missing; stop, do not replace sample')
    rows = benchmark.get('rows', [])
    if benchmark.get('status') != 'pass' or benchmark.get('errors') or len(rows) != count:
        raise RuntimeError(group+' workload failed/incomplete')
    if benchmark.get('input') != source_input or [r['id'] for r in rows] != [r['id'] for r in source_input['cases'][:count]]:
        raise RuntimeError(group+' frozen input/order mismatch')
    for actual, expected in zip(rows, source_input['cases']):
        if actual.get('status') != 'pass' or actual['seed'] != expected['seed'] or actual.get('resolvedSeed') != ','.join(map(str,expected['seed'])) or actual['outcome']['code'] != expected['expected']['code']:
            raise RuntimeError(group+' actual case outcome/seed failed')
    if result.get('env', {}).get('packageInfo') != info or not result['env'].get('nw'):
        raise RuntimeError(group+' native package identity mismatch')
    if formal and benchmark.get('kind') != 'FORMAL_F100':
        raise RuntimeError(group+' is not a formal100 run')
    expected_impl = 'legacy text-scene bridge' if group.startswith('control') else 'd1-controller-v1'
    if formal and benchmark.get('presentationImplementation') != expected_impl:
        raise RuntimeError(group+' wrong actual presentation implementation')
    if benchmark['instrumentation']['detailed'] == off:
        raise RuntimeError(group+' instrumentation mode mismatch')
    if not off and (len(benchmark['memory']) != 5 or any(m['gcForced'] != gc for m in benchmark['memory'])):
        raise RuntimeError(group+' memory/GC sample contract mismatch')
    if not off:
        if [m['id'] for m in benchmark['memory']] != ['initial-map','after4','after50','after100','after-idle120']:
            raise RuntimeError(group+' wrong memory sample order')
        frames=benchmark.get('frameSamples', [])
        if {f.get('kind') for f in frames} != {'updateMain','rAF'} or any(
                not isinstance(f.get('dt'), (int,float)) or not math.isfinite(f['dt']) or f['dt'] < 0 for f in frames):
            raise RuntimeError(group+' missing/invalid real game/rAF clock samples')
        for memory in benchmark['memory']:
            if memory.get('appRssStatus') == 'value' and (not memory.get('processes') or not isinstance(memory.get('appRssBytes'),int) or memory['appRssBytes'] <= 0):
                raise RuntimeError(group+' invalid claimed whole app RSS')
            if memory.get('appRssStatus') == 'UNKNOWN' and memory.get('appRssBytes') is not None:
                raise RuntimeError(group+' UNKNOWN app RSS must stay null')
            if memory.get('appRssStatus') not in ['value','UNKNOWN'] or memory.get('appRssStatus') == 'UNKNOWN' and not memory.get('appRssReason'):
                raise RuntimeError(group+' missing explicit app RSS qualification/reason')
    elif benchmark.get('frameSamples') or benchmark.get('memory'):
        raise RuntimeError(group+' instrument-off unexpectedly sampled detailed probes')
    after = payload(app)
    write(out/'PAYLOAD-AFTER.json', after)
    if before != after:
        raise RuntimeError(group+' runtime payload changed')
    return dict(group=group, count=count, finalStateHash=benchmark['finalStateHash'], inputHash=benchmark['inputHash'],
                foreground=all(r['focusStart'] and r['focusEnd'] and r['visibleStart']=='visible' and r['visibleEnd']=='visible' for r in rows)
                and all(s['focus'] and s['visibility']=='visible' for s in benchmark['frameSamples']),
                appRssStatus='UNKNOWN' if any(m.get('appRssStatus') != 'value' for m in benchmark['memory']) else ('NOT_SAMPLED' if off else 'value'),
                environment=result['env'], execution=row, reportSHA256=sha(report))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('control');parser.add_argument('candidate');parser.add_argument('out')
    parser.add_argument('--groups', nargs='+', choices=GROUPS, default=GROUPS)
    parser.add_argument('--pilot-count', type=int, default=0)
    args=parser.parse_args()
    if sys.platform != 'darwin':
        raise SystemExit('actual macOS host required')
    out=Path(args.out).absolute()
    if out.exists() or out.is_symlink():
        raise SystemExit('use a new output directory; retain previous attempts')
    out.mkdir(parents=True);out=out.resolve()
    apps={'control':Path(args.control).resolve(strict=True),'candidate':Path(args.candidate).resolve(strict=True)}
    infos={key:json.loads((app/'Contents/Resources/app.nw/package-info.json').read_text()) for key,app in apps.items()}
    formal=args.groups==GROUPS and args.pilot_count==0
    count=args.pilot_count or 100
    if not 1<=count<=100:
        raise SystemExit('bounded count1..100')
    if any(not i.get('withTests') or i.get('workingTreeChanges') != 0 for i in infos.values()):
        raise SystemExit('only clean fixed test packages')
    if formal and infos['control']['gitHead']==infos['candidate']['gitHead']:
        raise SystemExit('formal comparison requires distinct bridge/controller commits')
    manifests={key:payload(app) for key,app in apps.items()}
    allowed={'package-info.json','package.json','js/plugins/PS_BattleFlow.js'}
    differences=[p for p in set(manifests['control'])|set(manifests['candidate']) if manifests['control'].get(p)!=manifests['candidate'].get(p)]
    if any(p not in allowed for p in differences):
        raise SystemExit('unexpected bridge/controller payload differences: '+repr(differences))
    source_input=json.loads((Path(__file__).resolve().parent.parent/'experiments/step5/4/d1/f100-v1.json').read_text())
    summary=dict(kind='FORMAL_TEN_GROUPS' if formal else 'QUALIFICATION_NOT_P4',startedUTC=utc(),packages=infos,
                 allowedPayloadDifferences=differences,input=source_input,groups=[],status='running')
    write(out/'SUMMARY.json', summary)
    try:
        for group in args.groups:
            key=group.split('-')[0]
            result=run_group(apps[key],infos[key],out/group,group,count,formal,source_input)
            summary['groups'].append(result)
            write(out/'SUMMARY.json', summary)
        if len({r['finalStateHash'] for r in summary['groups']}) != 1:
            raise RuntimeError('complete final framework state differs; retain difference, do not normalize it away')
        summary.update(status='AUTHOR_EXECUTED',finishedUTC=utc(),totalBattles=count*len(args.groups),
                       limitations='P-4 performance acceptance requires report/review; foreground loss/UNKNOWN and historical WARN remain explicit')
    except BaseException as error:
        summary.update(status='FAIL_STOP',error=str(error),finishedUTC=utc())
        raise
    finally:
        write(out/'SUMMARY.json', summary)
    print(summary['kind'],summary['status'],summary['totalBattles'],flush=True)


if __name__=='__main__':
    main()
