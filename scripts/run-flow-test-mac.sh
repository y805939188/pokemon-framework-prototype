#!/usr/bin/env bash
# Step 2.4: run the in-game battle-flow scenarios in NW.js (the MZ NW.js host), then restart the
# process and verify the MZ save written by the first run. NW.js is launched directly on the project,
# the same host the MZ editor's Playtest uses (this is not the editor's Playtest button).
# Usage: scripts/run-flow-test-mac.sh [evidence-dir]   (default: experiments/step2/evidence/flow)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MZ_APP="${MZ_APP:-$HOME/Library/Application Support/Steam/steamapps/common/RPG Maker MZ/RPGMZ.app}"
NW="$MZ_APP/Contents/Resources/nwjs-mac/nwjs.app/Contents/MacOS/nwjs"
EVID="${1:-$ROOT/experiments/step2/evidence/flow}"
[[ -x "$NW" ]] || { echo "NW.js not found: $NW" >&2; exit 1; }
pnpm --dir "$ROOT/src" build >/dev/null
mkdir -p "$EVID"
rm -f "$EVID"/ps-flow-*.json "$EVID"/*.png
# saves go to the evidence folder (--ps-save-dir), never to the project's save/ that a developer's Playtest uses
SAVEDIR="$EVID/saves"; rm -rf "$SAVEDIR"

wait_for() { for _ in $(seq 1 180); do [[ -f "$1" ]] && return 0; sleep 2; done; return 1; }
run() { # mode out [extra args]
  local mode="$1" out="$2"; shift 2
  "$NW" "$ROOT" "--mute-audio" "--disable-renderer-backgrounding" "--disable-background-timer-throttling" "--disable-backgrounding-occluded-windows" "--disable-features=CalculateNativeWinOcclusion" "--ps-save-dir=$SAVEDIR" "--ps-flow-test=$mode" "--ps-flow-out=$out" --ps-flow-quit "$@" >/dev/null 2>&1 &
  local pid=$!
  wait_for "$out" || { echo "timeout waiting for $out" >&2; kill "$pid" 2>/dev/null || true; exit 1; } # only our own process
  wait "$pid" 2>/dev/null || true
}
run all "$EVID/ps-flow-report.json" "--ps-flow-shots=$EVID"
run verify-save "$EVID/ps-flow-verify-save.json"
node -e '
const fs=require("fs");let bad=0;
for (const f of ["ps-flow-report.json","ps-flow-verify-save.json"]) {
  const r=JSON.parse(fs.readFileSync(process.argv[1]+"/"+f,"utf8"));
  console.log(f, r.overall, "nw", r.env.nw, "node", r.env.node);
  for (const x of r.results) { console.log("  ", x.status, x.id.slice(0,100)); if (x.status!=="pass") bad++; }
}
process.exit(bad?1:0);' "$EVID"
