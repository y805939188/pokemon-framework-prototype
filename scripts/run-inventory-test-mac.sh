#!/usr/bin/env bash
# Actual NW.js/MZ host, synthetic DOM/service input. Isolated saves/profile, exact child PID only.
# Usage: scripts/run-inventory-test-mac.sh <new evidence-dir> [inventory|all|verify-save|empty-source|perf|matrix|driver-selftest]
# Package: PF_OWNED_NW=<app binary> PF_OWNED_PROJECT=<app.nw> PF_OWNED_SKIP_BUILD=1 ...
# Restart (5.2 D-03): every run records the SHA-256 of the expected-state files it wrote (launch.json producedExpected).
#   verify-save runs in its OWN new evidence directory and must name its source explicitly:
#   PF_OWNED_EXPECTED=<evidence dir of the producing run> PF_OWNED_SAVES=<that run's saves dir> ... verify-save
#   It refuses to start (exit 2, nothing launched) when the source has no record, a file is missing or a hash differs;
#   the expected files are read in place (--ps-flow-expected-dir), never copied or regenerated.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVID="${1:?new evidence directory required}"; MODE="${2:-inventory}"
case "$MODE" in inventory|all|verify-save|empty-source|perf|matrix|driver-selftest) ;; *) echo "unsupported mode: $MODE" >&2; exit 2;; esac
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
import subprocess,os,json,time,datetime,hashlib
out=Path(os.environ['PF_OWNED_EVID']); mode=os.environ['PF_OWNED_MODE'];report=out/'report.json'
save=Path(os.environ.get('PF_OWNED_SAVES',str(out/'saves')))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
expected=lambda d:{p.name:sha(p) for p in sorted(d.glob('ps-flow-expected*.json'))}
start={'startedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'concurrency':'UNVERIFIED; read-only process inventory unavailable; never terminates other processes','input':'synthetic DOM/service events in actual host; not hardware input'}
extra=[]
if mode=='verify-save':
 src=Path(os.path.abspath(os.environ['PF_OWNED_EXPECTED']))
 def refuse(reason):
  start.update(status='preflight-refused',reason=reason,expectedSource=str(src),saves=str(save));(out/'launch.json').write_text(json.dumps(start,indent=2)+'\n');print(reason,flush=True);raise SystemExit(2)
 if src.resolve()==out.resolve(): refuse('the producing evidence directory must differ from this verify-save directory')
 try: produced=json.loads((src/'launch.json').read_text()).get('producedExpected') or {}
 except (OSError,ValueError) as error: refuse(f'no readable producing record {src/"launch.json"}: {error}')
 if not produced: refuse(f'{src} recorded no expected-state files')
 for name,digest in produced.items():
  if not (src/name).is_file(): refuse(f'expected-state file missing: {src/name}')
  if sha(src/name)!=digest: refuse(f'expected-state file changed since it was produced: {src/name}')
 if not save.is_dir() or not any(save.iterdir()): refuse(f'saves directory missing or empty: {save}')
 start['expectedSource']={'dir':str(src),'files':produced};start['savesBefore']={p.name:sha(p) for p in sorted(save.iterdir()) if p.is_file()}
 extra=['--ps-flow-expected-dir='+str(src)]
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
 (out/'launch.json').write_text(json.dumps(start,indent=2)+'\n');print(json.dumps(start,indent=2))
 raise SystemExit(0 if not timed_out and p.returncode==0 and report.exists()and start.get('overall')=='pass'else 1)
PY
