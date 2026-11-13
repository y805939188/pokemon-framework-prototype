#!/usr/bin/env python3
"""Run the C trainer-AI MZ producer and a fresh Title/Continue process.

Usage: python3 scripts/run-trainer-ai-test-mac.py PREBUILT_APP NEW_EVIDENCE_DIR
Build first with scripts/package-mac.sh --with-tests. Uses only new test saves,
profiles and process groups; no user saves, global NW changes or package deletion.
"""
from pathlib import Path
import datetime
import hashlib
import json
import os
import signal
import subprocess
import sys
import time


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def main():
    if len(sys.argv) != 3 or sys.platform != 'darwin':
        raise SystemExit('usage on macOS: run-trainer-ai-test-mac.py APP NEW_EVIDENCE_DIR')
    root = Path(__file__).resolve().parent.parent
    app = Path(sys.argv[1]).resolve(strict=True)
    out = Path(sys.argv[2]).absolute()
    if out.exists() or out.is_symlink():
        raise SystemExit('evidence directory must be new; preserve previous runs')
    out.mkdir(parents=True)
    out = out.resolve(strict=True)
    runtime = app / 'Contents/Resources/app.nw'
    executable = app / 'Contents/MacOS/nwjs'
    info_file = runtime / 'package-info.json'
    info = json.loads(info_file.read_text())
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    if info.get('gitHead') != head or info.get('workingTreeChanges') != 0 or not info.get('withTests'):
        raise SystemExit('need a clean fixed-HEAD package with test plugins')
    artifacts = info.get('artifacts', {})
    if not artifacts or 'js/plugins/PS_BattleFlowTest.js' not in artifacts:
        raise SystemExit('missing package artifact manifest')

    def verify_package():
        for name, expected in artifacts.items():
            file = (runtime / name).resolve(strict=True)
            if not file.is_relative_to(runtime.resolve()) or digest(file) != expected:
                raise RuntimeError('package artifact mismatch: ' + name)
        if digest(info_file) != info_hash:
            raise RuntimeError('package identity changed during run')

    info_hash = digest(info_file)
    verify_package()
    env = dict(os.environ)
    for name in ['NODE_OPTIONS', 'NODE_PATH', 'NPM_TOKEN', 'NODE_AUTH_TOKEN']:
        env.pop(name, None)
    receipts = []
    saves = out / 'saves'
    saves.mkdir()
    common = ['--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
              '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion',
              '--ps-save-dir=' + str(saves), '--ps-flow-quit']

    def run(mode, count, prefix):
        report = out / (mode + '.json')
        args = [str(executable), '--user-data-dir=' + str(out / ('profile-' + mode)), *common,
                '--ps-flow-test=' + mode, '--ps-flow-out=' + str(report),
                '--ps-flow-shots=' + str(out / ('shots-' + mode)), '--ps-flow-expected-dir=' + str(out)]
        row = dict(mode=mode, argv=args, startedUTC=now())
        receipts.append(row)
        with (out / (mode + '.log')).open('x') as log:
            process = subprocess.Popen(args, cwd=runtime, env=env, stdout=log, stderr=subprocess.STDOUT,
                                       start_new_session=True)
            row['pid'] = process.pid
            (out / 'EXECUTION.json').write_text(json.dumps(receipts, indent=2) + '\n')
            try:
                row['exit'] = process.wait(timeout=180)
            except subprocess.TimeoutExpired:
                row['timeout'] = True
                raise RuntimeError(mode + ' timed out')
            finally:
                # Only our new process group; also reap on interruption/failure.
                row['ownGroupCleanup'] = False
                for _ in range(25):
                    try:
                        os.killpg(process.pid, 0)
                    except ProcessLookupError:
                        break
                    time.sleep(.2)
                else:
                    row['ownGroupCleanup'] = True
                    try:
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
                row['finishedUTC'] = now()
                row['reportExists'] = report.is_file()
                row['logSHA256'] = digest(out / (mode + '.log'))
                (out / 'EXECUTION.json').write_text(json.dumps(receipts, indent=2) + '\n')
        if row.get('exit') != 0 or not report.is_file():
            raise RuntimeError(mode + ' process failed')
        result = json.loads(report.read_text())
        tests = result.get('results', [])
        if result.get('overall') != 'pass' or len(tests) != count or any(
                t.get('status') != 'pass' or not t.get('id', '').startswith(prefix) for t in tests):
            raise RuntimeError(mode + ' failed or missing required scenarios; see report')
        if result.get('env', {}).get('packageInfo') != info or not result['env'].get('nw'):
            raise RuntimeError(mode + ' did not report the intended native package')
        verify_package()
        print(mode, str(count) + '/' + str(count), 'nw', result['env']['nw'], 'node', result['env']['node'])

    run('trainer-ai', 6, 'C-HOST-')
    expected = out / 'ps-flow-expected-C-ai.json'
    expected_hash = digest(expected)
    checkpoint = json.loads(expected.read_text())['checkpoint']
    save_files = {p.relative_to(saves).as_posix(): digest(p) for p in saves.rglob('*') if p.is_file()}
    run('trainer-ai-continue', 1, 'C-CONTINUE ')
    if digest(expected) != expected_hash or save_files != {
            p.relative_to(saves).as_posix(): digest(p) for p in saves.rglob('*') if p.is_file()}:
        raise RuntimeError('Continue changed producer save/expected bytes')
    result = dict(status='AUTHOR_PASS', gitHead=head, packageInfoSHA256=info_hash,
                  expectedSHA256=expected_hash, slot=checkpoint['slot'], saveFiles=save_files,
                  scenarios=7, receipts=receipts, finishedUTC=now(),
                  limits='macOS actual NW/MZ; synthetic DOM/service inputs; Windows/physical input NOT_RUN')
    (out / 'RESULT.json').write_text(json.dumps(result, indent=2) + '\n')
    print('C native host AUTHOR_PASS; evidence', out)


if __name__ == '__main__':
    main()
