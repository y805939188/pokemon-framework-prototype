#!/usr/bin/env bash
# Step 2.5: run the in-game flow scenarios (and later the matrix/perf runs) INSIDE the packaged app,
# launched through LaunchServices (`open -n --args`, i.e. like a double click), then restart it to
# verify the save written by the first process.
# Usage: scripts/run-package-tests-mac.sh [evidence-dir]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVID="${1:-$ROOT/experiments/step2/evidence/package}"
APP="$ROOT/build/package/PokemonFrameworkPrototype.app"
SAVE="$APP/Contents/Resources/app.nw/save"
"$ROOT/scripts/package-mac.sh" --with-tests | tail -3
mkdir -p "$EVID"
rm -f "$EVID"/ps-flow-*.json "$EVID"/ps-matrix-*.json "$EVID"/*.png
rm -rf "$SAVE"

wait_for() { for _ in $(seq 1 240); do [[ -f "$1" ]] && return 0; sleep 2; done; return 1; }
launch() { # mode out [extra args]
  local mode="$1" out="$2"; shift 2
  open -n "$APP" --args "--ps-flow-test=$mode" "--ps-flow-out=$out" --ps-flow-quit "$@"
  wait_for "$out" || { echo "timeout waiting for $out" >&2; pkill -f "PokemonFrameworkPrototype.app/Contents/MacOS" || true; exit 1; }
  sleep 3
}
launch all "$EVID/ps-flow-report.json" "--ps-flow-shots=$EVID"
launch verify-save "$EVID/ps-flow-verify-save.json"
launch matrix "$EVID/ps-matrix-package.json"
node -e 'require(process.argv[1]+"/js/engine/matrix.cjs").runMatrix().then(r=>require("fs").writeFileSync(process.argv[2],JSON.stringify({host:"node "+process.version,results:r},null,2)))' "$ROOT" "$EVID/ps-matrix-node.json"
pkill -f "PokemonFrameworkPrototype.app/Contents/MacOS" 2>/dev/null || true
node -e '
const fs=require("fs");let bad=0;
for (const f of ["ps-flow-report.json","ps-flow-verify-save.json","ps-matrix-package.json"]) {
  const r=JSON.parse(fs.readFileSync(process.argv[1]+"/"+f,"utf8"));
  console.log(f, r.overall, "nw", r.env.nw, "node", r.env.node);
  for (const x of r.results) { console.log("  ", x.status, x.id.slice(0,100)); if (x.status!=="pass") bad++; }
}

// Node vs packaged app: same fixed inputs must give the same fingerprints
const pk=JSON.parse(fs.readFileSync(process.argv[1]+"/ps-matrix-package.json","utf8"));
const nd=JSON.parse(fs.readFileSync(process.argv[1]+"/ps-matrix-node.json","utf8"));
console.log("matrix in package (nw", pk.env.nw+", node", pk.env.node+") vs", nd.host);
for (const r of pk.matrix) {
  const n=nd.results.find(x=>x.id===r.id);
  const same = r.status==="pass" && n && n.status==="pass" && r.fingerprint===n.fingerprint;
  console.log("  ", r.id, same ? "same fingerprint "+r.fingerprint.slice(0,12) : "MISMATCH/FAIL "+(r.error||""));
  if (!same) bad++;
}
if (!pk.env.execPath.includes("PokemonFrameworkPrototype.app")) { console.log("NOT RUN FROM THE PACKAGE:", pk.env.execPath); bad++; }
console.log("host:", pk.env.execPath.replace(/.*Contents\//,"Contents/"), "| package:", JSON.stringify(pk.env.packageInfo));
process.exit(bad?1:0);' "$EVID"
