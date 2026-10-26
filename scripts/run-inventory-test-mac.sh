#!/usr/bin/env bash
# Actual NW.js/MZ host, synthetic DOM/service input. Isolated saves/profile, exact child PID only.
# Usage: scripts/run-inventory-test-mac.sh <new evidence-dir> [inventory|all|verify-save|empty-source|perf|matrix|driver-selftest|capability|progression-data|postbattle|learning|triggered]
# PF_OWNED_REQUIRE_IDLE=1 refuses before launch if NW is already running or process inventory is unavailable.
# PF_OWNED_BACKGROUND=1 uses the programmatic test clock without requesting OS focus (not physical-input evidence).
# Package: PF_OWNED_NW=<app binary> PF_OWNED_PROJECT=<app.nw> PF_OWNED_SKIP_BUILD=1 ...
# Restart (5.2 D-03): every run records the SHA-256 of the expected-state files it wrote (launch.json producedExpected).
#   verify-save runs in its OWN new evidence directory and must name its source explicitly:
#   PF_OWNED_EXPECTED=<evidence dir of the producing run> PF_OWNED_SAVES=<that run's saves dir> ... verify-save
#   It refuses to start (exit 2, nothing launched) when the source has no record, a file is missing or a hash differs;
#   the expected files are read in place (--ps-flow-expected-dir), never copied or regenerated.
#   The producing run must have passed, and the files present must be exactly the recorded plain names.
# driver-selftest: overall is "fail" by design (injected faults); the exit code and launch.json selftestControl follow DS-99.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVID="${1:?new evidence directory required}"; MODE="${2:-inventory}"
case "$MODE" in inventory|all|verify-save|empty-source|perf|matrix|driver-selftest|capability|progression-data|postbattle|learning|triggered) ;; *) echo "unsupported mode: $MODE" >&2; exit 2;; esac
mkdir -p "$EVID"; EVID="$(cd "$EVID" && pwd)"
[[ ! -e "$EVID/report.json" && ! -e "$EVID/launch.json" ]] || { echo 'existing evidence: choose another directory' >&2; exit 2; }
NW="${PF_OWNED_NW:-$HOME/Library/Application Support/Steam/steamapps/common/RPG Maker MZ/RPGMZ.app/Contents/Resources/nwjs-mac/nwjs.app/Contents/MacOS/nwjs}"
PROJECT="${PF_OWNED_PROJECT:-$ROOT}"
[[ -x "$NW" ]] || { echo "NW.js not found: $NW" >&2; exit 1; }
if [[ "$MODE" == verify-save && ( -z "${PF_OWNED_EXPECTED:-}" || -z "${PF_OWNED_SAVES:-}" ) ]]; then
  echo 'verify-save needs PF_OWNED_EXPECTED=<producing evidence dir> and PF_OWNED_SAVES=<its saves dir>' >&2; exit 2
fi
if [[ "${PF_OWNED_SKIP_BUILD:-0}" != 1 ]]; then pnpm --dir "$ROOT/src" build >"$EVID/build.log" 2>&1; fi
export PF_OWNED_EVID="$EVID" PF_OWNED_BINARY="$NW" PF_OWNED_GAME="$PROJECT" PF_OWNED_MODE="$MODE"
python3 - <<'PY'
from pathlib import Path
import subprocess,os,json,time,datetime,hashlib,re
out=Path(os.environ['PF_OWNED_EVID']); mode=os.environ['PF_OWNED_MODE'];report=out/'report.json'
save=Path(os.environ.get('PF_OWNED_SAVES',str(out/'saves')))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
expected=lambda d:{p.name:sha(p) for p in sorted(d.glob('ps-flow-expected*.json'))}
start={'startedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'concurrency':'UNVERIFIED; read-only process inventory unavailable; never terminates other processes','input':'synthetic DOM/service events in actual host; not hardware input'}
extra=[]
if mode in ('capability','progression-data','postbattle','learning','triggered') or os.environ.get('PF_OWNED_BACKGROUND')=='1':extra.append('--ps-flow-background')
if mode=='progression-data':
 layout=os.environ.get('PF_OWNED_PROGRESSION_LAYOUT','regional')
 if layout not in ('regional','national'): raise SystemExit('PF_OWNED_PROGRESSION_LAYOUT must be regional or national')
 extra.append('--ps-progression-layout='+layout)
if mode=='verify-save':
 src=Path(os.path.abspath(os.environ['PF_OWNED_EXPECTED']))
 def refuse(reason):
  start.update(status='preflight-refused',reason=reason,expectedSource=str(src),saves=str(save));(out/'launch.json').write_text(json.dumps(start,indent=2)+'\n');print(reason,flush=True);raise SystemExit(2)
 if src.resolve()==out.resolve(): refuse('the producing evidence directory must differ from this verify-save directory')
 try: record=json.loads((src/'launch.json').read_text())
 except (OSError,ValueError) as error: refuse(f'no readable producing record {src/"launch.json"}: {error}')
 if not isinstance(record,dict): refuse(f'producing record is not an object: {src/"launch.json"}')
 if record.get('exit')!=0 or record.get('timedOut') is not False or record.get('overall')!='pass': refuse(f'the producing run did not pass (exit {record.get("exit")}, timedOut {record.get("timedOut")}, overall {record.get("overall")})')
 produced=record.get('producedExpected')
 if not isinstance(produced,dict) or not produced: refuse(f'{src} recorded no expected-state files')
 if any(not isinstance(n,str) or not re.fullmatch(r'ps-flow-expected[A-Za-z0-9._-]*\.json',n) or not isinstance(d,str) for n,d in produced.items()): refuse('recorded expected-state entries must be plain ps-flow-expected*.json names with a digest')
 present={p.name for p in src.glob('ps-flow-expected*.json')}
 if present!=set(produced): refuse(f'expected-state files present {sorted(present)} differ from the recorded {sorted(produced)}')
 for name,digest in produced.items():
  if not (src/name).is_file(): refuse(f'expected-state file missing: {src/name}')
  if sha(src/name)!=digest: refuse(f'expected-state file changed since it was produced: {src/name}')
 if not save.is_dir() or not any(save.iterdir()): refuse(f'saves directory missing or empty: {save}')
 start['expectedSource']={'dir':str(src),'files':produced};start['savesBefore']={p.name:sha(p) for p in sorted(save.iterdir()) if p.is_file()}
 extra.append('--ps-flow-expected-dir='+str(src))
if mode in ('capability','progression-data','postbattle','learning','triggered') or os.environ.get('PF_OWNED_REQUIRE_IDLE')=='1':
 try:
  inventory=subprocess.run(['/bin/ps','-axo','pid=,comm='],capture_output=True,text=True,check=True).stdout
  running=[line.strip() for line in inventory.splitlines() if 'nwjs' in line.casefold()]
 except (OSError,subprocess.CalledProcessError) as error:
  start.update(status='preflight-refused',reason='process inventory unavailable: '+str(error));(out/'launch.json').write_text(json.dumps(start,indent=2)+'\n');raise SystemExit(2)
 (out/'nw-processes-before.txt').write_text('\n'.join(running)+'\n')
 if running:
  start.update(status='preflight-refused',reason='existing NW process; no process signalled',processes=running);(out/'launch.json').write_text(json.dumps(start,indent=2)+'\n');raise SystemExit(2)
 start['concurrency']='VERIFIED: no NW processes before launch; only the exact owned child may be terminated'
args=[os.environ['PF_OWNED_BINARY'],os.environ['PF_OWNED_GAME'],'--mute-audio','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion','--user-data-dir='+str(out/'profile'),'--ps-save-dir='+str(save),'--ps-flow-test='+mode,'--ps-flow-out='+str(report),'--ps-flow-shots='+str(out/'shots'),'--ps-t0='+str(int(time.time()*1000)),'--ps-flow-quit',*extra]
start={'command':args,**start}
with (out/'host.log').open('w')as log:
 try:p=subprocess.Popen(args,stdout=log,stderr=subprocess.STDOUT,cwd=os.environ['PF_OWNED_GAME'])
 except OSError as error:
  start.update(status='launch-failed',error=str(error));(out/'launch.json').write_text(json.dumps(start,indent=2)+'\n');raise SystemExit(1)
 start['pid']=p.pid;(out/'launch.json').write_text(json.dumps(start,indent=2)+'\n');deadline=time.monotonic()+900;timed_out=False
 while p.poll()is None:
  if time.monotonic()>deadline:
   timed_out=True;p.terminate()
   try:p.wait(timeout=10)
   except subprocess.TimeoutExpired:p.kill();p.wait()
   break
  time.sleep(1)
 start.update(exit=p.returncode,timedOut=timed_out,finishedUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),reportExists=report.exists(),ownedProcessEnded=True,producedExpected=expected(out))
 if report.exists():
  data=json.loads(report.read_text());start['overall']=data.get('overall');start['results']=[{'id':r['id'],'status':r['status']}for r in data.get('results',[])]
 # driver-selftest injects failures, so its overall is "fail" by design; the DS-99 control scenario decides
 passed=start.get('overall')=='pass'
 if mode=='driver-selftest':
  control=[r['status'] for r in start.get('results',[]) if r['id'].startswith('DS-99 ')];start['selftestControl']=control[0] if len(control)==1 else 'missing';passed=start['selftestControl']=='pass'
 (out/'launch.json').write_text(json.dumps(start,indent=2)+'\n');print(json.dumps(start,indent=2))
 raise SystemExit(0 if not timed_out and p.returncode==0 and report.exists()and passed else 1)
PY
