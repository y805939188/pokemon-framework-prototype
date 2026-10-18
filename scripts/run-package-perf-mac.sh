#!/usr/bin/env bash
# Step 2.5 measurements inside the packaged app (3 separate process launches by default).
# Usage: scripts/run-package-perf-mac.sh [runs] [evidence-dir]
# Needs the package built with tests: scripts/package-mac.sh --with-tests  (run-package-tests-mac.sh does it).
# The game window must be allowed to take focus; do not switch apps while it runs (a blurred window is
# throttled by Chromium and would distort the numbers).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNS="${1:-3}"
EVID="${2:-$ROOT/experiments/step2/evidence/package}"
APP="$ROOT/build/package/PokemonFrameworkPrototype.app"
[[ -d "$APP" ]] || { echo "build the package first (scripts/package-mac.sh --with-tests)" >&2; exit 1; }
mkdir -p "$EVID/perf"; rm -f "$EVID"/perf/run*.json
now_ms() { python3 -c 'import time;print(int(time.time()*1000))'; }
for i in $(seq 1 "$RUNS"); do
  OUT="$EVID/perf/run$i.json"; rm -rf "$APP/Contents/Resources/app.nw/save"
  T0="$(now_ms)"
  open -n "$APP" --args "--ps-flow-test=perf" "--ps-flow-out=$OUT" "--ps-t0=$T0" --ps-flow-quit
  for _ in $(seq 1 300); do [[ -f "$OUT" ]] && break; sleep 2; done
  [[ -f "$OUT" ]] || { echo "timeout on run $i" >&2; pkill -f "PokemonFrameworkPrototype.app/Contents/MacOS" || true; exit 1; }
  sleep 3
done
pkill -f "PokemonFrameworkPrototype.app/Contents/MacOS" 2>/dev/null || true
node -e '
const fs=require("fs"); const dir=process.argv[1]+"/perf"; const os=require("os");
const runs=fs.readdirSync(dir).filter(f=>/^run\d+\.json$/.test(f)).sort().map(f=>JSON.parse(fs.readFileSync(dir+"/"+f,"utf8")));
const med=a=>{const b=[...a].filter(x=>x!=null).sort((x,y)=>x-y);return b.length?b[Math.floor(b.length/2)]:null};
const rng=a=>{const b=a.filter(x=>x!=null);return b.length?[Math.min(...b),Math.max(...b)]:null};
const col=f=>runs.map(r=>{try{return f(r.perf)}catch(e){return null}});
const row=(label,a)=>({label, median:med(a), range:rng(a), samples:a});
const sum={
  env:{host:os.hostname()===""?"":"local", platform:process.platform, arch:process.arch, cpu:os.cpus()[0].model, mem_gb:Math.round(os.totalmem()/2**30), os:os.release(), nw:runs[0].env.nw, node:runs[0].env.node, chromium:runs[0].env.chromium, gitHead:(runs[0].env.packageInfo||{}).gitHead, runs:runs.length, window:runs[0].perf.window},
  method:runs[0].perf.method,
  rows:[
    row("cold start: launch -> plugins loaded (ms)",col(p=>p.coldStart.launchToPluginMs)),
    row("cold start: launch -> map ready (ms)",col(p=>p.coldStart.launchToMapReadyMs)),
    row("engine modules load, first battle only (ms)",col(p=>p.engineLoadMs)),
    row("first battle: session create (ms)",col(p=>p.firstBattle.sessionMs)),
    row("first battle: event start -> first menu (ms)",col(p=>p.firstBattle.firstMenuMs)),
    row("later battles: session create, median (ms)",col(p=>p.laterBattles.sessionMsMedian)),
    row("later battles: event start -> first menu, median (ms)",col(p=>p.laterBattles.firstMenuMsMedian)),
    row("later battles: event start -> first menu, worst, all (ms)",col(p=>p.laterBattles.firstMenuMsMax)),
    row("later battles: event start -> first menu, worst, window focused throughout (ms)",col(p=>p.laterBattles.firstMenuMsMaxFocused)),
    row("later battles overlapping a focus loss (count of 23)",col(p=>p.laterBattles.blurredN)),
    row("focus-loss events during the run",col(p=>p.focus.blurEvents)),
    row("frames skipped while unfocused",col(p=>p.focus.framesSkippedUnfocused)),
    ...["move","run","item","ball","switch","learn"].map(k=>row("action latency p50 "+k+" (ms)",col(p=>p.actionMs[k]&&p.actionMs[k].p50))),
    ...["move","run","item","ball"].map(k=>row("action latency max "+k+" (ms)",col(p=>p.actionMs[k]&&p.actionMs[k].max))),
    row("frames in battle scene: p50 (ms)",col(p=>p.frames.battleScene.p50)),
    row("frames in battle scene: p95 (ms)",col(p=>p.frames.battleScene.p95)),
    row("frames in battle scene: max (ms)",col(p=>p.frames.battleScene.max)),
    row("frames in battle scene: count >50ms",col(p=>p.frames.battleScene.over50)),
    row("frames in battle scene: count >100ms",col(p=>p.frames.battleScene.over100)),
    row("frames on map (idle/event): p95 (ms)",col(p=>p.frames.mapScene.p95)),
    row("frames on map: max (ms)",col(p=>p.frames.mapScene.max)),
    row("memory: app RSS at map ready (MB)",col(p=>p.memory[0].appRssMb)),
    row("memory: app RSS after 4 battles (MB)",col(p=>p.memory[1].appRssMb)),
    row("memory: app RSS after 12 battles (MB)",col(p=>p.memory[2].appRssMb)),
    row("memory: app RSS after 24 battles (MB)",col(p=>p.memory[3].appRssMb)),
    row("memory: JS heap after 4 battles (MB)",col(p=>p.memory[1].jsHeapUsedMb)),
    row("memory: JS heap after 24 battles (MB)",col(p=>p.memory[3].jsHeapUsedMb)),
  ],
  errors: runs.flatMap(r=>r.perf.errors||[]),
};
fs.writeFileSync(process.argv[1]+"/perf-summary.json",JSON.stringify(sum,null,2)+"\n");
for (const r of sum.rows) console.log(String(r.median).padStart(8), " ", r.label, "  range", JSON.stringify(r.range));
console.log("errors:", sum.errors.length, "| battles per run:", runs.map(r=>r.perf.battles).join(","));
' "$EVID"
