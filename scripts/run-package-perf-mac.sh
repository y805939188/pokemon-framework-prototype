#!/usr/bin/env bash
# Step 2.5 measurements inside the packaged app (3 separate process launches by default).
# Usage: scripts/run-package-perf-mac.sh [runs] [evidence-dir]
# Needs the package built with tests: scripts/package-mac.sh --with-tests  (run-package-tests-mac.sh does it).
# Extra game arguments: PF_PERF_ARGS="--ps-perf-rounds=25 --js-flags=--expose-gc [--ps-fix=no-texture,no-batcher]"
#   (100 battles with forced GC, with or without the runtime fixes; see docs/step2/runtime-issues.md).
# Focus: the driver keeps running while the window is unfocused (docs/step2/runtime-issues.md section 3), and the
# "focused throughout" rows are computed separately; still keep the machine otherwise idle, because CPU contention
# and a window that is not frontmost distort the timing rows.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNS="${1:-3}"
EVID="${2:-$ROOT/experiments/step2/evidence/package}"
mkdir -p "$EVID" && EVID="$(cd "$EVID" && pwd)"  # the game process writes its reports itself: needs an absolute path
APP="$ROOT/build/package/PokemonFrameworkPrototype.app"
[[ -d "$APP" ]] || { echo "build the package first (scripts/package-mac.sh --with-tests)" >&2; exit 1; }
mkdir -p "$EVID/perf"; rm -f "$EVID"/perf/run*.json
now_ms() { python3 -c 'import time;print(int(time.time()*1000))'; }
EXTRA=(); [[ -n "${PF_PERF_ARGS:-}" ]] && read -r -a EXTRA <<< "$PF_PERF_ARGS"
if pgrep -f "PokemonFrameworkPrototype.app/Contents/MacOS" >/dev/null 2>&1; then echo "PokemonFrameworkPrototype is running: close it first" >&2; exit 1; fi
# Exact-PID process handling: only the instance THIS script launched is ever stopped (never pkill -f a pattern).
main_pids() { pgrep -f "PokemonFrameworkPrototype.app/Contents/MacOS" 2>/dev/null || true; }
LAST_PID=""
launch_app() { # args for the game; sets LAST_PID to the main process that `open -n` started
  local before; before="$(main_pids)"
  open -n "$APP" --args "$@"
  LAST_PID=""
  for _ in $(seq 1 100); do
    for p in $(main_pids); do grep -qx "$p" <<< "$before" || LAST_PID="$p"; done
    [[ -n "$LAST_PID" ]] && return 0; sleep 0.2
  done
  echo "warning: could not identify the launched app's PID" >&2
}
stop_app() { # stop the instance we launched (it normally quits itself with --ps-flow-quit)
  [[ -n "$LAST_PID" ]] || return 0
  for _ in $(seq 1 50); do kill -0 "$LAST_PID" 2>/dev/null || { LAST_PID=""; return 0; }; sleep 0.2; done
  kill "$LAST_PID" 2>/dev/null || true; LAST_PID=""
}
for i in $(seq 1 "$RUNS"); do
  OUT="$EVID/perf/run$i.json"; rm -rf "$EVID/saves"
  T0="$(now_ms)"
  launch_app "--mute-audio" "--disable-renderer-backgrounding" "--disable-background-timer-throttling" "--disable-backgrounding-occluded-windows" "--disable-features=CalculateNativeWinOcclusion" "--ps-save-dir=$EVID/saves" "--ps-flow-test=perf" "--ps-flow-out=$OUT" "--ps-t0=$T0" --ps-flow-quit ${EXTRA[@]+"${EXTRA[@]}"}
  for _ in $(seq 1 300); do [[ -f "$OUT" ]] && break; sleep 2; done
  [[ -f "$OUT" ]] || { echo "timeout on run $i" >&2; stop_app; exit 1; }
  sleep 3; stop_app
done
stop_app
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
    row("step 4: map encounter -> first battle menu, median (ms)",col(p=>p.step4.encounterToFirstMenuMs.p50)),
    row("step 4: map encounter -> first battle menu, worst (ms)",col(p=>p.step4.encounterToFirstMenuMs.max)),
    row("step 4: save (DataManager.saveGame), median (ms)",col(p=>p.step4.saveMs.p50)),
    row("step 4: save, worst (ms)",col(p=>p.step4.saveMs.max)),
    row("step 4: load (DataManager.loadGame), median (ms)",col(p=>p.step4.loadMs.p50)),
    row("step 4: load, worst (ms)",col(p=>p.step4.loadMs.max)),
  ],
  errors: runs.flatMap(r=>r.perf.errors||[]),
};
fs.writeFileSync(process.argv[1]+"/perf-summary.json",JSON.stringify(sum,null,2)+"\n");
for (const r of sum.rows) console.log(String(r.median).padStart(8), " ", r.label, "  range", JSON.stringify(r.range));
console.log("errors:", sum.errors.length, "| battles per run:", runs.map(r=>r.perf.battles).join(","));
' "$EVID"
