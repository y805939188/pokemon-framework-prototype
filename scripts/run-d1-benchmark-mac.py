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
import re
import signal
import subprocess
import sys
import time
import importlib.util

sys.dont_write_bytecode=True
_host_spec=importlib.util.spec_from_file_location('d1_host_identity',Path(__file__).with_name('d1_host_identity.py'))
_host=importlib.util.module_from_spec(_host_spec);_host_spec.loader.exec_module(_host)

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


def verify_report_hashes(raw,core=None):
    env=dict(os.environ)
    for name in ['NODE_OPTIONS', 'NODE_PATH', 'NPM_TOKEN', 'NODE_AUTH_TOKEN']:
        env.pop(name,None)
    try:
        command=['node',str(Path(__file__).with_name('d1-report-hashes.cjs'))]
        if core is not None:command.extend(['--game-core',str(core)])
        checked=subprocess.run(command,
                               input=raw,capture_output=True,env=env,timeout=30)
    except (OSError,subprocess.TimeoutExpired) as error:
        raise RuntimeError('report hash verifier unavailable: '+str(error)) from error
    if checked.returncode:
        raise RuntimeError(checked.stderr.decode('utf8',errors='replace').strip())
    hashes=json.loads(checked.stdout)
    if hashes['reportSHA256'] != hashlib.sha256(raw).hexdigest():
        raise RuntimeError('hash verifier did not bind the exact report bytes')
    return hashes


def cleanup_owned(process):
    errors=[]
    process.poll()  # Reap an exited leader before querying its group (macOS zombie EPERM).
    def exists():
        try:os.killpg(process.pid,0);return True
        except ProcessLookupError:return False
        except PermissionError as error:errors.append(str(error));return None
    present=exists();attempted=present is True
    if present:
        try:os.killpg(process.pid,signal.SIGTERM)
        except (ProcessLookupError,PermissionError)as error:errors.append(str(error))
        for _ in range(25):
            process.poll()
            if not exists():break
            time.sleep(.1)
        else:
            try:os.killpg(process.pid,signal.SIGKILL)
            except (ProcessLookupError,PermissionError)as error:errors.append(str(error))
    try:process.wait(timeout=5)
    except (subprocess.TimeoutExpired,PermissionError)as error:errors.append(str(error))
    final=exists()
    if final is not False:errors.append('owned process group remains or cannot be verified')
    return attempted,errors


def same_json(left,right):
    # Python otherwise equates true with 1; frozen JSON input and declared case numbers retain their types.
    if type(left) is not type(right):
        return False
    if isinstance(left,dict):
        return left.keys()==right.keys() and all(same_json(value,right[key])for key,value in left.items())
    if isinstance(left,list):
        return len(left)==len(right) and all(same_json(a,b)for a,b in zip(left,right))
    return left==right


def run_group(app, info, out, group, count, formal, source_input, *, synthetic=False):
    out.mkdir()
    if not synthetic:
        # Normal measurement must launch a native Mach-O host, never a Python/shell fixture child.
        with (app/'Contents/MacOS/nwjs').open('rb') as launcher:
            if launcher.read(4) not in [b'\xcf\xfa\xed\xfe',b'\xfe\xed\xfa\xcf',b'\xca\xfe\xba\xbe',b'\xbe\xba\xfe\xca',b'\xca\xfe\xba\xbf',b'\xbf\xba\xfe\xca']:
                raise RuntimeError('native Mach-O launcher required; use explicit synthetic-controls mode for tool fixtures')
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
    app_before=_host.complete_app(app)
    write(out/'APP-BEFORE.json',app_before)
    samples, replied, last_progress, last_count = [], None, None, 0
    with (out/'native.log').open('x') as log:
        process = subprocess.Popen(args, cwd=app/'Contents/Resources/app.nw', env=env,
                                   stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        row['pid'] = process.pid
        write(out/'EXECUTION.json', row)
        deadline = time.monotonic()+900
        original_error=None
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
            if (out/'report.json.fatal.json').exists():
                raise RuntimeError(group+' fatal recorded at exit; retain evidence')
        except BaseException as error:
            original_error=error;row['failure']=dict(type=type(error).__name__,message=str(error));raise
        finally:
            row['ownGroupCleanup'],row['cleanupErrors']=cleanup_owned(process)
            row['exit']=process.returncode
            row['finishedUTC'] = utc()
            row['reportExists'] = report.is_file()
            row['logSHA256'] = sha(out/'native.log')
            try:
                write(out/'APP-AFTER.json',_host.complete_app(app))
                write(out/'PAYLOAD-AFTER.json',payload(app))
            except (OSError,RuntimeError)as error:row['cleanupErrors'].append('post-exit manifest: '+str(error))
            write(out/'EXECUTION.json', row)
            if row['cleanupErrors']and original_error is None:raise RuntimeError(group+' cleanup failed: '+repr(row['cleanupErrors']))
    if row.get('exit') != 0 or not report.is_file():
        raise RuntimeError(group+' process/report failed')
    if (out/'report.json.fatal.json').exists():raise RuntimeError(group+' fatal recorded before final acceptance')
    report_bytes=report.read_bytes()
    result = json.loads(report_bytes)
    hashes=verify_report_hashes(report_bytes,app/'Contents/Resources/app.nw/js/engine/build/core.cjs')
    write(out/'HASH-VERIFICATION.json',hashes)
    benchmark = result.get('d1', {})
    if benchmark.get('version')!='D1-F100-output-v2' or benchmark.get('driverVersion')!='D1-driver-v2-port-order':
        raise RuntimeError(group+' driver/output version mismatch')
    tests = result.get('results', [])
    if result.get('overall') != 'pass' or len(tests) != 1 or tests[0].get('status') != 'pass' or not tests[0].get('id', '').startswith('D1-F100 '):
        raise RuntimeError(group+' scenario failed/missing; stop, do not replace sample')
    rows = benchmark.get('rows', [])
    if benchmark.get('status') != 'pass' or benchmark.get('errors') or len(rows) != count or not same_json(benchmark.get('requestedCount'),count):
        raise RuntimeError(group+' workload failed/incomplete')
    if not same_json(benchmark.get('input'),source_input) or [r['id'] for r in rows] != [r['id'] for r in source_input['cases'][:count]]:
        raise RuntimeError(group+' frozen input/order mismatch')
    for actual, expected in zip(rows, source_input['cases']):
        if actual.get('status') != 'pass' or not same_json(actual['seed'],expected['seed']) or actual.get('resolvedSeed') != ','.join(map(str,expected['seed'])) or not same_json(actual['outcome']['code'],expected['expected']['code']) or actual['outcome'].get('commit')!='applied' or actual['outcome'].get('battleId')!=actual['id']:
            raise RuntimeError(group+' actual case outcome/seed failed')
    if result.get('env', {}).get('packageInfo') != info or not result['env'].get('nw'):
        raise RuntimeError(group+' native package identity mismatch')
    if not synthetic and (not re.fullmatch(r'\d+\.\d+\.\d+',str(result['env']['nw']))
                          or result['env'].get('platform') != 'darwin' or result['env'].get('arch') != 'arm64'):
        raise RuntimeError(group+' actual native runtime identity missing/unsupported')
    if formal and benchmark.get('kind') != 'FORMAL_F100':
        raise RuntimeError(group+' is not a formal100 run')
    expected_impl = 'legacy text-scene bridge' if group.startswith('control') else 'd1-controller-v1'
    if formal and benchmark.get('presentationImplementation') != expected_impl:
        raise RuntimeError(group+' wrong actual presentation implementation')
    if benchmark['instrumentation']['detailed'] == off:
        raise RuntimeError(group+' instrumentation mode mismatch')
    sample_ids=['initial-map']+['after'+str(n) for n in [4,50,100] if n<=count]+['after-idle120']
    if not off and (len(benchmark['memory']) != len(sample_ids) or any(m['gcForced'] != gc for m in benchmark['memory'])):
        raise RuntimeError(group+' memory/GC sample contract mismatch')
    if not off:
        if [m['id'] for m in benchmark['memory']] != sample_ids:
            raise RuntimeError(group+' wrong memory sample order')
        if samples and [m['id']for m in samples]!=sample_ids:raise RuntimeError(group+' collector sample ID/order mismatch')
        frames=benchmark.get('frameSamples', [])
        if {f.get('kind') for f in frames} != {'updateMain','rAF'} or any(
                not isinstance(f.get('dt'), (int,float)) or not math.isfinite(f['dt']) or f['dt'] < 0 for f in frames):
            raise RuntimeError(group+' missing/invalid real game/rAF clock samples')
        for memory in benchmark['memory']:
            sampled=next((s for s in samples if s['id']==memory['id']),None)
            if sampled is None:
                if not synthetic or memory.get('appRssStatus')=='value':raise RuntimeError(group+' app RSS has no collector sample')
            elif any(not same_json(memory.get(k),sampled.get(k))for k in ['appRssStatus','appRssBytes','processes','appRssReason']):
                raise RuntimeError(group+' app RSS differs from collector sample')
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
    app_after=_host.complete_app(app);write(out/'APP-AFTER.json',app_after)
    if app_before!=app_after:raise RuntimeError(group+' complete app changed')
    return dict(group=group, count=count, finalStateHash=hashes['finalStateHash'], inputHash=hashes['inputHash'],
                initialStateHash=hashes['initialStateHash'],stateHashesVerified=True,
                evidenceKind='SYNTHETIC_TOOLING_NOT_NATIVE_NOT_P4' if synthetic else 'NATIVE_QUALIFICATION' if not formal else 'NATIVE_FORMAL_WORKLOAD',
                foreground=all(r['focusStart'] and r['focusEnd'] and r['visibleStart']=='visible' and r['visibleEnd']=='visible' for r in rows)
                and all(s['focus'] and s['visibility']=='visible' for s in benchmark['frameSamples']),
                appRssStatus='UNKNOWN' if any(m.get('appRssStatus') != 'value' for m in benchmark['memory']) else ('NOT_SAMPLED' if off else 'value'),
                environment=result['env'], execution=row, reportSHA256=hashes['reportSHA256'])


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('control');parser.add_argument('candidate');parser.add_argument('out')
    parser.add_argument('--groups', nargs='+', choices=GROUPS, default=GROUPS)
    parser.add_argument('--pilot-count', type=int, default=0)
    parser.add_argument('--synthetic-controls',action='store_true',help='tooling fixtures only; never records native execution/P-4')
    args=parser.parse_args()
    if sys.platform != 'darwin'and not args.synthetic_controls:
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
    summary=dict(kind='SYNTHETIC_TOOLING_NOT_NATIVE_NOT_P4' if args.synthetic_controls else 'FORMAL_TEN_GROUPS' if formal else 'QUALIFICATION_NOT_P4',startedUTC=utc(),packages=infos,
                 allowedPayloadDifferences=differences,input=source_input,groups=[],status='running')
    write(out/'SUMMARY.json', summary)
    previous={};cancelled=False
    def cancel(signum,frame):
        nonlocal cancelled
        if not cancelled:cancelled=True;raise RuntimeError('benchmark cancelled by signal '+str(signum))
    for signum in [signal.SIGTERM,signal.SIGHUP]:previous[signum]=signal.signal(signum,cancel)
    try:
        if not args.synthetic_controls:
            summary['hostIdentity']=_host.require_pair(apps['control'],apps['candidate'])
            write(out/'SUMMARY.json',summary)
        for group in args.groups:
            key=group.split('-')[0]
            result=run_group(apps[key],infos[key],out/group,group,count,formal,source_input,synthetic=args.synthetic_controls)
            summary['groups'].append(result)
            write(out/'SUMMARY.json', summary)
            if not args.synthetic_controls:
                summary['runtimeIdentity']=_host.require_runtime(summary.get('runtimeIdentity'),result['environment'])
        for field in ['initialStateHash','finalStateHash']:
            if len({r[field] for r in summary['groups']}) != 1:
                raise RuntimeError('complete framework state differs ('+field+'); retain difference, do not normalize it away')
        summary.update(status='SYNTHETIC_CONTROLS_EXECUTED' if args.synthetic_controls else 'AUTHOR_EXECUTED',finishedUTC=utc(),totalBattles=0 if args.synthetic_controls else count*len(args.groups),
                       syntheticCaseRecords=count*len(args.groups) if args.synthetic_controls else 0,
                       limitations='P-4 performance acceptance requires report/review; foreground loss/UNKNOWN and historical WARN remain explicit')
    except BaseException as error:
        summary.update(status='FAIL_STOP',error=str(error),finishedUTC=utc())
        raise
    finally:
        write(out/'SUMMARY.json', summary)
        for signum,handler in previous.items():signal.signal(signum,handler)
    print(summary['kind'],summary['status'],summary['totalBattles'],flush=True)


if __name__=='__main__':
    main()
