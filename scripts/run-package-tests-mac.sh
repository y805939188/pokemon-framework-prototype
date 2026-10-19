#!/usr/bin/env bash
# Step 2.5: run the in-game flow scenarios (and later the matrix/perf runs) INSIDE the packaged app,
# launched through LaunchServices (`open -n --args`, i.e. like a double click), then restart it to
# verify the save written by the first process.
# Usage: scripts/run-package-tests-mac.sh [evidence-dir]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVID="${1:-$ROOT/experiments/step2/evidence/package}"
mkdir -p "$EVID" && EVID="$(cd "$EVID" && pwd)"  # the game process writes its reports itself: needs an absolute path
APP="$ROOT/build/package/PokemonFrameworkPrototype.app"
SAVEDIR="$EVID/saves"
USERDIR="$HOME/Library/Application Support/PokemonFrameworkPrototype"
# a running packaged app (e.g. someone playing it) must not be killed by this script: refuse to start instead
if pgrep -f "PokemonFrameworkPrototype.app/Contents/MacOS" >/dev/null 2>&1; then
  echo "PokemonFrameworkPrototype is running: close it first (this script would kill it when a run times out)" >&2; exit 1
fi
"$ROOT/scripts/package-mac.sh" --with-tests ${PF_PACKAGE_ARGS:-} | tail -4
mkdir -p "$EVID"
# every result file is removed first, so a stale one can never satisfy wait_for or the summary
rm -f "$EVID"/ps-flow-*.json "$EVID"/ps-matrix-*.json "$EVID"/ps-saveloc.json "$EVID"/*.png
rm -rf "$SAVEDIR"

wait_for() { for _ in $(seq 1 240); do [[ -f "$1" ]] && return 0; sleep 2; done; return 1; }
launch() { # mode out [extra args]
  local mode="$1" out="$2"; shift 2
  open -n "$APP" --args "--mute-audio" "--disable-renderer-backgrounding" "--disable-background-timer-throttling" "--disable-backgrounding-occluded-windows" "--disable-features=CalculateNativeWinOcclusion" "--ps-save-dir=$SAVEDIR" "--ps-flow-test=$mode" "--ps-flow-out=$out" --ps-flow-quit "$@"
  wait_for "$out" || { echo "timeout waiting for $out" >&2; pkill -f "PokemonFrameworkPrototype.app/Contents/MacOS" || true; exit 1; }
  sleep 3
}
launch all "$EVID/ps-flow-report.json" "--ps-flow-shots=$EVID"
# the save must survive REPLACING the app with a fresh build (it lives outside the bundle)
"$ROOT/scripts/package-mac.sh" --with-tests ${PF_PACKAGE_ARGS:-} | tail -1
launch verify-save "$EVID/ps-flow-verify-save.json"
launch matrix "$EVID/ps-matrix-package.json"
node -e 'const m=require(process.argv[1]+"/js/engine/matrix.cjs"); m.runMatrix().then(r=>require("fs").writeFileSync(process.argv[2],JSON.stringify({host:"node "+process.version,engineArtifact:m.artifactInfo(),results:r},null,2)))' "$ROOT" "$EVID/ps-matrix-node.json"
pkill -f "PokemonFrameworkPrototype.app/Contents/MacOS" 2>/dev/null || true
# default location (no override): a packaged app saves under ~/Library/Application Support/<name>/save.
# The run writes ONE free high slot (99 downwards) and puts everything back; it never touches slots a player may have.
# If the user folder did not exist before, it is removed again afterwards.
HAD_USERDIR=0; [[ -d "$USERDIR" ]] && HAD_USERDIR=1
open -n "$APP" --args "--mute-audio" "--ps-flow-test=saveloc" "--ps-flow-out=$EVID/ps-saveloc.json" --ps-flow-quit
wait_for "$EVID/ps-saveloc.json" || { echo "timeout (saveloc)" >&2; pkill -f "PokemonFrameworkPrototype.app/Contents/MacOS" 2>/dev/null || true; exit 1; }
sleep 3; pkill -f "PokemonFrameworkPrototype.app/Contents/MacOS" 2>/dev/null || true
if [[ "$HAD_USERDIR" -eq 0 ]]; then rm -rf "$USERDIR"; fi
# nothing inside the bundle may have been modified by the runs: the ad-hoc seal must still verify
codesign --verify --deep --strict "$APP" 2>&1 && echo "bundle seal still valid after the runs" || { echo "BUNDLE MODIFIED BY THE RUNS" >&2; exit 1; }
node -e '
const fs=require("fs");let bad=0;
for (const f of ["ps-flow-report.json","ps-flow-verify-save.json","ps-matrix-package.json","ps-saveloc.json"]) {
  const r=JSON.parse(fs.readFileSync(process.argv[1]+"/"+f,"utf8"));
  console.log(f, r.overall, "nw", r.env.nw, "node", r.env.node);
  for (const x of r.results) { console.log("  ", x.status, x.id.slice(0,100)); if (x.status!=="pass") bad++; }
}

// Node vs packaged app: same fixed inputs must give the same fingerprints
const pk=JSON.parse(fs.readFileSync(process.argv[1]+"/ps-matrix-package.json","utf8"));
const nd=JSON.parse(fs.readFileSync(process.argv[1]+"/ps-matrix-node.json","utf8"));
console.log("matrix in package (nw", pk.env.nw+", node", pk.env.node+") vs", nd.host);
// the two hosts must have loaded the SAME engine bundle (hash), not just produced equal results
const ha=pk.engineArtifact&&pk.engineArtifact.sha256, hb=nd.engineArtifact&&nd.engineArtifact.sha256;
if (!ha || ha!==hb) { console.log("ENGINE ARTIFACT MISMATCH: package", ha, "node", hb); bad++; } else console.log("same engine artifact in both hosts:", ha.slice(0,16)+"...", pk.engineArtifact.bytes, "bytes");
for (const r of pk.matrix) {
  const n=nd.results.find(x=>x.id===r.id);
  const same = r.status==="pass" && n && n.status==="pass" && r.fingerprint===n.fingerprint;
  console.log("  ", r.id, same ? "same fingerprint "+r.fingerprint.slice(0,12) : "MISMATCH/FAIL "+(r.error||""));
  if (!same) bad++;
}
if (!pk.env.execPath.includes("PokemonFrameworkPrototype.app")) { console.log("NOT RUN FROM THE PACKAGE:", pk.env.execPath); bad++; }
console.log("host:", pk.env.execPath.replace(/.*Contents\//,"Contents/"), "| package:", JSON.stringify(pk.env.packageInfo));
// every report must come from the build under test: the first run used build #1, the three later runs build #2 (the app was replaced in between)
const built = f => { const r=JSON.parse(fs.readFileSync(process.argv[1]+"/"+f,"utf8")); return r.env.packageInfo && r.env.packageInfo.builtAt; };
const b1=built("ps-flow-report.json"), b2=["ps-flow-verify-save.json","ps-matrix-package.json","ps-saveloc.json"].map(built);
if (!b1 || b2.some(b=>!b) || new Set(b2).size!==1 || b2[0]===b1) { console.log("BUILD MISMATCH: reports are not from the expected two builds", b1, b2); bad++; }
else console.log("builds: flow run", b1, "-> replaced -> verify/matrix/saveloc runs", b2[0]);
const sl=JSON.parse(fs.readFileSync(process.argv[1]+"/ps-saveloc.json","utf8")).saveLocation;
console.log("default save location:", sl.dir, "(", sl.chosen.why, ") slot", sl.slot, "written by this run:", sl.writtenByThisRun, "cleaned up:", sl.cleanedUp);
if (!sl.dir.includes("Library/Application Support/PokemonFrameworkPrototype/save") || sl.dir.includes(".app/")) { console.log("SAVE LOCATION WRONG"); bad++; }
process.exit(bad?1:0);' "$EVID"
