#!/usr/bin/env bash
# Actual NW.js/MZ host, synthetic DOM/service input. Isolated saves/profile, exact child PID only.
# Usage: scripts/run-inventory-test-mac.sh <new evidence-dir> [inventory|all|verify-save|empty-source|perf|matrix]
# Package: PF_OWNED_NW=<app binary> PF_OWNED_PROJECT=<app.nw> PF_OWNED_SKIP_BUILD=1 ...
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVID="${1:?new evidence directory required}"; MODE="${2:-inventory}"
case "$MODE" in inventory|all|verify-save|empty-source|perf|matrix) ;; *) echo "unsupported mode: $MODE" >&2; exit 2;; esac
mkdir -p "$EVID"; EVID="$(cd "$EVID" && pwd)"
[[ ! -e "$EVID/report.json" && ! -e "$EVID/launch.json" ]] || { echo 'existing evidence: choose another directory' >&2; exit 2; }
NW="${PF_OWNED_NW:-$HOME/Library/Application Support/Steam/steamapps/common/RPG Maker MZ/RPGMZ.app/Contents/Resources/nwjs-mac/nwjs.app/Contents/MacOS/nwjs}"
PROJECT="${PF_OWNED_PROJECT:-$ROOT}"
[[ -x "$NW" ]] || { echo "NW.js not found: $NW" >&2; exit 1; }
if [[ "${PF_OWNED_SKIP_BUILD:-0}" != 1 ]]; then pnpm --dir "$ROOT/src" build >"$EVID/build.log" 2>&1; fi
export PF_OWNED_EVID="$EVID" PF_OWNED_BINARY="$NW" PF_OWNED_GAME="$PROJECT" PF_OWNED_MODE="$MODE"
python3 - <<'PY'
from pathlib import Path
import subprocess,os,json,time,datetime
out=Path(os.environ['PF_OWNED_EVID']); mode=os.environ['PF_OWNED_MODE'];report=out/'report.json'
save=Path(os.environ.get('PF_OWNED_SAVES',str(out/'saves')))
args=[os.environ['PF_OWNED_BINARY'],os.environ['PF_OWNED_GAME'],'--mute-audio','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion','--user-data-dir='+str(out/'profile'),'--ps-save-dir='+str(save),'--ps-flow-test='+mode,'--ps-flow-out='+str(report),'--ps-flow-shots='+str(out/'shots'),'--ps-t0='+str(int(time.time()*1000)),'--ps-flow-quit']
start={'command':args,'startedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'concurrency':'UNVERIFIED; read-only process inventory unavailable; never terminates other processes','input':'synthetic DOM/service events in actual host; not hardware input'}
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
 start.update(exit=p.returncode,timedOut=timed_out,finishedUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),reportExists=report.exists(),ownedProcessEnded=True)
 if report.exists():
  data=json.loads(report.read_text());start['overall']=data.get('overall');start['results']=[{'id':r['id'],'status':r['status']}for r in data.get('results',[])]
 (out/'launch.json').write_text(json.dumps(start,indent=2)+'\n');print(json.dumps(start,indent=2))
 raise SystemExit(0 if not timed_out and p.returncode==0 and report.exists()and start.get('overall')=='pass'else 1)
PY
