// 5.2 D-01: virtual-time model of the real-host driver against the Reactor main loop and the product InputLatch.
// Run with: node --experimental-strip-types experiments/step5/2/flowtest-sim.mjs   (prints one JSON object)
// Modelled from js/reactor_managers.js (SceneManager.update/determineRepeatNumber/updateMain, initial smoothing 1/0)
// and js/reactor_core.js (Input.update, isTriggered, isRepeated with keyRepeatWait 24 / keyRepeatInterval 6); the UI
// follows PS_Inventory's boundary/ready/latch order. A controllable model of refresh/update ratios, NOT a real display.
import { pressKey, waitGameFrames, waitUntil } from '../../../src/plugins/flowtest/timing.ts';
import { InputLatch } from '../../../src/plugins/management/model.ts';

const flush = () => new Promise((r) => setImmediate(r));

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

function createInput() {
  const input = { current: {}, previous: {}, latest: null, pressedTime: 0 };
  input.update = () => {
    if (input.current[input.latest]) input.pressedTime++; else input.latest = null;
    for (const name in input.current) {
      if (input.current[name] && !input.previous[name]) { input.latest = name; input.pressedTime = 0; }
      input.previous[name] = input.current[name];
    }
  };
  input.isPressed = (k) => !!input.current[k];
  input.isTriggered = (k) => input.latest === k && input.pressedTime === 0;
  input.isRepeated = (k) => input.latest === k && (input.pressedTime === 0 || (input.pressedTime >= 24 && input.pressedTime % 6 === 0));
  return input;
}

function createUi(input) {
  const ui = { view: 'bag', cursor: 0, ready: false, boundaryFrame: 0, latch: new InputLatch(), events: [] };
  const sample = () => ({
    pressed: { use: input.isPressed('ok'), back: input.isPressed('cancel'), down: input.isPressed('down'), up: input.isPressed('up') },
    triggered: { use: input.isTriggered('ok'), back: input.isTriggered('cancel') },
    repeated: { down: input.isRepeated('down'), up: input.isRepeated('up') },
  });
  ui.boundary = (frame) => { ui.ready = false; ui.boundaryFrame = frame; ui.latch.arm(sample().pressed); };
  const enter = (view, frame) => { ui.view = view; ui.cursor = 0; ui.boundary(frame); };
  ui.update = (frame) => {
    if (ui.view === 'closed' || (!ui.ready && frame <= ui.boundaryFrame)) return;
    const f = ui.latch.filter(sample());
    if (!ui.ready) { ui.ready = true; return; } // the first ready frame only samples
    if (f.triggered.back) { ui.events.push(`${ui.view}:back`); if (ui.view === 'bag') ui.view = 'closed'; else enter('bag', frame); return; }
    if (f.triggered.use) { ui.events.push(`${ui.view}:use`); enter(ui.view === 'bag' ? 'menu' : ui.view === 'menu' ? 'target' : 'bag', frame); return; }
    const d = f.repeated.down ? 'down' : f.repeated.up ? 'up' : null;
    if (d) { ui.cursor += d === 'down' ? 1 : -1; ui.events.push(`${ui.view}:${d}`); }
  };
  return ui;
}

/** schedule: [[fromMs, hz], ...] (hz 0 = no display ticks); hitches: [[atMs, extraMs], ...]. */
async function simulate({ schedule, jitter = 0, seed = 1, hitches = [], countTicks = false, script, limitMs = 120000 }) {
  let now = 0, seq = 0, lastTick = 0, smooth = 1, elapsed = 0;
  const timers = [], random = rng(seed), pending = hitches.map(([at, ms]) => ({ at, ms }));
  const sleep = (ms) => new Promise((resolve) => { timers.push({ t: now + Math.max(1, ms), seq: seq++, resolve }); timers.sort((a, b) => a.t - b.t || a.seq - b.seq); });
  const counts = { game: 0, ticks: 0 };
  const clock = countTicks ? { get game() { return counts.ticks; }, get ticks() { return counts.ticks; } } : { get game() { return counts.game; }, get ticks() { return counts.ticks; } };
  const ports = { clock, sleep, now: () => now };
  const input = createInput(), ui = createUi(input);
  const hz = (t) => { let r = schedule[0][1]; for (const [from, v] of schedule) if (t >= from) r = v; return r; };
  const nextTickAfter = (t) => {
    const r = hz(t); if (!r) return Infinity;
    let dt = (1000 / r) * (1 + jitter * (random() * 2 - 1));
    for (const h of pending) if (!h.used && h.at <= t + dt) { h.used = true; dt += h.ms; }
    return t + dt;
  };
  const repeat = (deltaTime) => { // SceneManager.determineRepeatNumber
    smooth *= 0.8; smooth += Math.min(deltaTime, 2) * 0.2;
    if (smooth >= 0.9) { elapsed = 0; return Math.round(smooth); }
    elapsed += deltaTime; if (elapsed >= 1) { elapsed -= 1; return 1; } return 0;
  };
  const tick = () => {
    const deltaTime = (now - lastTick) * 60 / 1000; lastTick = now; counts.ticks++;
    for (let i = repeat(deltaTime); i > 0; i--) { counts.game++; input.update(); ui.update(counts.game); } // updateMain
  };
  ui.boundary(0);
  const press = (k, hold) => pressKey(ports, (type) => { input.current[k] = type === 'keydown'; }, hold);
  let settled = false, error = null;
  script({ ports, ui, press }).then(() => { settled = true; }, (e) => { settled = true; error = String(e && e.message || e); });
  await flush();
  let nextTick = nextTickAfter(0);
  while (!settled && now < limitMs) {
    const nt = timers.length ? timers[0].t : Infinity;
    if (nextTick === Infinity && nt === Infinity) break;
    if (nextTick <= nt) { now = nextTick; tick(); nextTick = nextTickAfter(now); }
    else { now = nt; timers.shift().resolve(); }
    await flush();
  }
  return { settled, error, events: ui.events, cursor: ui.cursor, view: ui.view, game: counts.game, ticks: counts.ticks, virtualMs: Math.round(now) };
}

const ready = (ports, ui, kind) => waitUntil(ports, () => ui.ready && ui.view === kind, () => `ui ${kind}`);
// U52-01 shape: OK opens the menu, OK again must choose Use (the swallowed press of the real failure), then direction
// presses, confirm, cancel.
const flow = async ({ ports, ui, press }) => {
  await ready(ports, ui, 'bag'); await press('ok'); await ready(ports, ui, 'menu'); await press('ok'); await ready(ports, ui, 'target');
  for (let i = 0; i < 3; i++) await press('down');
  await press('ok'); await ready(ports, ui, 'bag'); await press('cancel');
  await waitUntil(ports, () => ui.view === 'closed', () => 'closed');
};
const FLOW = ['bag:use', 'menu:use', 'target:down', 'target:down', 'target:down', 'target:use', 'bag:back'];
// A 40-frame hold repeats at pressedTime 0, 24, 30 and 36: four moves only if the hold is counted in game frames.
const repeatHold = async ({ ports, ui, press }) => { await ready(ports, ui, 'bag'); await press('down', 40); };
const REPEAT = ['bag:down', 'bag:down', 'bag:down', 'bag:down'];

const out = { flow: [], repeat: [], scheduled: [], control: [], stopped: [] };
for (const rate of [20, 30, 48, 60, 75, 90, 120, 144, 165, 240]) for (const jitter of [0, 0.25]) {
  const f = await simulate({ schedule: [[0, rate]], jitter, seed: rate, script: flow });
  const r = await simulate({ schedule: [[0, rate]], jitter, seed: rate + 7, script: repeatHold });
  out.flow.push({ rate, jitter, ok: !f.error && JSON.stringify(f.events) === JSON.stringify(FLOW), ...f });
  out.repeat.push({ rate, jitter, ok: !r.error && JSON.stringify(r.events) === JSON.stringify(REPEAT), ...r });
}
for (const [name, schedule, hitches] of [
  ['120->60->144->30 Hz', [[0, 120], [600, 60], [1200, 144], [1800, 30]], []],
  ['120 Hz with 250 ms and 600 ms stalls', [[0, 120]], [[300, 250], [1500, 600]]],
  ['20 Hz with a 400 ms stall', [[0, 20]], [[500, 400]]],
]) {
  const f = await simulate({ schedule, hitches, jitter: 0.2, seed: 99, script: flow });
  out.scheduled.push({ name, ok: !f.error && JSON.stringify(f.events) === JSON.stringify(FLOW), ...f });
}
// Control, paired on identical cases: the pre-fix driver counted display ticks. At 60 Hz ticks equal game updates and it
// passes. Near 120 Hz with real-display tick jitter the accumulator sometimes runs no game update for three ticks, so a
// two-tick release can go unsampled and the latch rightly swallows the next OK (the real U52-01 failure); counting
// game updates never does. Strict 120 Hz without jitter alternates exactly and hides the problem.
for (const [rate, jitter] of [[60, 0], [120, 0.05], [120, 0.1], [121, 0.05], [121, 0.2]]) for (let seed = 1; seed <= 10; seed++) {
  for (const countTicks of [true, false]) {
    const f = await simulate({ schedule: [[0, rate]], jitter, seed, countTicks, script: flow, limitMs: 60000 });
    out.control.push({ rate, jitter, seed, countTicks, matchesExpected: !f.error && JSON.stringify(f.events) === JSON.stringify(FLOW), error: f.error, events: f.events });
  }
}
// A stopped game loop must fail the wait with both counters, within its bounded wall time.
for (const [name, schedule] of [['no display ticks', [[0, 0]]], ['ticks stop after 500 ms', [[0, 120], [500, 0]]]]) {
  const f = await simulate({ schedule, script: async ({ ports }) => { await waitGameFrames(ports, 60, 'sixty frames'); await waitGameFrames(ports, 3, 'key hold'); }, limitMs: 60000 });
  out.stopped.push({ name, ...f });
}
process.stdout.write(JSON.stringify(out));
