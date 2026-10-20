import sys, os, json, hashlib, pathlib, subprocess, datetime, platform
root = pathlib.Path('<workspace>/.worktrees/step3-batch-fixes-20261020')
base = pathlib.Path('<workspace>/.verify/step3-batch-fixes-20261020')
phase = sys.argv[1]
evid = base / phase
evid.mkdir(parents=True, exist_ok=False)
app = root / 'build/package/PokemonFrameworkPrototype.app'
nw = pathlib.Path.home() / 'Library/Application Support/Steam/steamapps/common/RPG Maker MZ/RPGMZ.app/Contents/Resources/nwjs-mac/nwjs.app/Contents/MacOS/nwjs' if phase.startswith('dev') else app / 'Contents/MacOS/nwjs'
runtime = root if phase.startswith('dev') else app / 'Contents/Resources/app.nw'
files = ['js/engine/build/engine.cjs', 'js/engine/build/core.cjs', 'js/engine/build/custom-formats.cjs', 'js/engine/showdown/dist/config/custom-formats.js', 'js/plugins/PS_BattleFlow.js', 'js/plugins/PS_BattleFlowTest.js', 'index.html', 'js/plugins.js']
def git(*args): return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()
def identity():
    return dict(recordedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), phase=phase, gitHead=git('rev-parse', 'HEAD'), workingTreeStatus=git('status', '--porcelain=v1'), diffSha256=hashlib.sha256(subprocess.check_output(['git','-C',str(root),'diff','HEAD'])).hexdigest(), runtime=str(runtime), executable=str(nw), executableSha256=hashlib.sha256(nw.read_bytes()).hexdigest(), platform=platform.platform(), showdownSha=(runtime/'js/engine/showdown/SOURCE_SHA').read_text().strip(), artifacts={f:hashlib.sha256((runtime/f).read_bytes()).hexdigest() for f in files})
first = identity()
(evid/'identity-before.json').write_text(json.dumps(first, indent=2)+'\n')
summary=[]
for mode, name in [('all','ps-flow-report.json'),('verify-save','ps-flow-verify-save.json')] + ([('matrix','ps-matrix-package.json')] if not phase.startswith('dev') else []):
    out=evid/name
    args=[str(nw)] + ([str(root)] if phase.startswith('dev') else []) + ['--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion', '--user-data-dir='+str(evid/'chromium-profile'), '--ps-save-dir='+str(evid/'saves'), '--ps-flow-test='+mode, '--ps-flow-out='+str(out), '--ps-flow-quit']
    with (evid/(mode+'.log')).open('w') as log:
        proc=subprocess.Popen(args, cwd=root, stdout=log, stderr=subprocess.STDOUT)
        (evid/(mode+'-process.json')).write_text(json.dumps(dict(pid=proc.pid,args=args,startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat()),indent=2)+'\n')
        print('started',phase,mode,'pid',proc.pid,flush=True)
        try: code=proc.wait(timeout=300)
        except subprocess.TimeoutExpired:
            proc.terminate()
            try: proc.wait(timeout=5)
            except subprocess.TimeoutExpired: proc.kill(); proc.wait()
            raise RuntimeError('timed out; stopped only child PID '+str(proc.pid))
    if not out.exists(): raise RuntimeError(str(out)+' missing; exit '+str(code))
    report=json.loads(out.read_text())
    failed=[r for r in report['results'] if r['status']!='pass']
    summary.append(dict(mode=mode,exitCode=code,overall=report['overall'],results=len(report['results']),failed=failed))
    print(json.dumps(summary[-1]),flush=True)
last=identity()
(evid/'identity-after.json').write_text(json.dumps(last,indent=2)+'\n')
assert first['gitHead']==last['gitHead'] and first['workingTreeStatus']==last['workingTreeStatus']==''
assert first['artifacts']==last['artifacts']
(evid/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
if any(r['failed'] or r['exitCode'] for r in summary): sys.exit(1)
