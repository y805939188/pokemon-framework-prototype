'use strict';
// Expectations are derived from formal WP60 and R6-FS01..11, not original-runtime observations.
const test = require('node:test'), assert = require('node:assert/strict');
const { fishing: F, fishingHarness: harness, member } = require('./e1-fixtures.cjs');

for (const [rod, plain, accelerated, threshold] of [[1, 45, 68, 67.5], [2, 70, 100, 105], [3, 95, 100, 142.5]]) {
  test('rod ' + rod + ': enumerate all 100 bite rolls, including accelerated threshold', () => {
    assert.equal(F.fishingBiteThreshold(rod, true), threshold);
    const count = speed => Array.from({ length: 100 }, (_, roll) => F.fishingBite(rod, speed, roll)).filter(Boolean).length;
    assert.equal(count(false), plain); assert.equal(count(true), accelerated);
  });
}
test('first non-egg ability includes fainted members and excludes later eligible abilities', () => {
  assert(F.fishingAccelerated([member('egg', [], { isEgg: true }), member('dead', [], { hp: 0, ability: 'Sticky Hold' })]));
  assert(F.fishingAccelerated([member('first', [], { ability: 'suctioncups' })]));
  assert.equal(F.fishingAccelerated([member('first', []), member('second', [], { ability: 'StickyHold' })]), false);
  assert.equal(F.fishingAccelerated([member('egg', [], { isEgg: true, ability: 'StickyHold' })]), false);
});
test('qualification uses facing fishability and current outgoing edge; Surf alone exempts the edge', () => {
  const value = value => ({ status: 'value', value });
  const facts = { facingFishable: value(true), currentExitPassable: value(false), surfing: value(false), diving: value(true) };
  assert.deepEqual(F.fishingEligibility(facts), { allowed: false, reason: 'exit-blocked' });
  assert.deepEqual(F.fishingEligibility({ ...facts, currentExitPassable: value(true), targetPassable: value(false) }), { allowed: true });
  assert.deepEqual(F.fishingEligibility({ ...facts, surfing: value(true), currentExitPassable: { status: 'unavailable' } }), { allowed: true });
  assert.deepEqual(F.fishingEligibility({ ...facts, surfing: value(true), facingFishable: value(false) }), { allowed: false, reason: 'not-fishable' });
  for (const status of ['absent', 'unavailable', 'invalid']) assert.equal(F.fishingEligibility({ ...facts, surfing: { status } }).allowed, false);
  assert.equal(F.fishingEligibility({ ...facts, surfing: value(1) }).reason, 'facts-invalid');
});
for (const [draw, segments] of [[0, 6], [5, 11]]) test('waiting draw ' + draw + ' produces ' + segments + ' observable segments', () => {
  const h = harness({ allowBite: false }, [[6, draw]]); h.waiting(); h.waited(); h.finish();
  assert.deepEqual(h.effects.filter(e => e.kind === 'dots').map(e => e.dots), Array.from({ length: segments }, (_, i) => i));
  assert.equal(h.now, segments * 400); assert.deepEqual(h.trace, [6]);
});
test('R6-FS01/02 no table performs waiting; speed takes the minimum of two draws', () => {
  const h = harness({ allowBite: false, accelerated: true }, [[6, 3], [6, 0]]); h.waiting(); h.waited();
  assert.equal(h.state.segmentCount, 6); assert.deepEqual(h.trace, [6, 6]); assert.equal(h.finish().caught, false);
});
test('R6-FS03 bite failure only consumes waiting and bite draws', () => {
  const h = harness({}, [[6, 0], [100, 99]]); h.waiting(); h.waited();
  assert.deepEqual(h.trace, [6, 100]); assert.equal(h.state.result, 'no-bite'); h.finish();
});
for (const accelerated of [false, true]) for (const key of ['confirm', 'cancel']) for (const segment of [0, 3]) {
  test('R6-FS04 waiting ' + key + ' segment ' + segment + ' accelerated=' + accelerated, () => {
    const h = harness({ accelerated }, accelerated ? [[6, 3], [6, 0]] : [[6, 0]]); h.waiting();
    for (let i = 0; i < segment; i++) { h.step({ ms: 400 }); h.ack(); }
    h.step({ ms: 10, [key]: true }); assert.equal(h.state.result, 'no-bite');
    assert.deepEqual(h.trace, accelerated ? [6, 6] : [6]); assert.equal(h.finish().caught, false);
  });
}
test('R6-FS05 strict cutoff: 0.490/0.500 continue, 0.510 without input escapes', () => {
  const h = harness(); h.window(); h.step({ ms: 490 }); assert.equal(h.state.phase, 'bite-window');
  h.step({ ms: 10 }); assert.equal(h.state.phase, 'bite-window'); h.step({ ms: 10 }); assert.equal(h.state.result, 'escaped');
  assert.deepEqual(h.trace, [6, 100, 6]); assert.equal(h.finish().caught, false);
});
for (const ms of [490, 500, 510, 10000]) for (const key of ['confirm', 'cancel']) test('R6-FS06 input first at ' + ms + 'ms (' + key + ')', () => {
  const h = harness(); h.window(); const out = h.step({ ms, [key]: true });
  assert.equal(h.state.result, 'caught'); assert.deepEqual(h.trace, [6, 100, 6, 100]);
  assert.deepEqual(out.effects.map(e => e.kind), ['shake', 'shake', 'end-presentation']);
  assert.equal(h.finish().caught, true);
});
test('R6-FS07 auto hook still needs input, never expires or draws final random, omits caught message', () => {
  const h = harness({ autoHook: true }); h.window(); h.step({ ms: 10000 }); assert.equal(h.state.phase, 'bite-window');
  h.step({ confirm: true }); assert.deepEqual(h.trace, [6, 100, 6]); assert(h.finish().caught);
  assert.equal(h.effects.some(e => e.kind === 'result-message'), false);
});
test('accelerated caught prefix contains both waiting draws and the true rod source', () => {
  for (const [rod, type] of [[1, 'OldRod'], [2, 'GoodRod'], [3, 'SuperRod']]) {
    const h = harness({ rod, accelerated: true }, [[6, 5], [6, 0], [100, 0], [6, 0], [100, 99]]);
    h.window(); h.step({ confirm: true }); const done = h.finish();
    assert.deepEqual(h.trace, [6, 6, 100, 6, 100]); assert.equal(done.encounterType, type); assert(done.caught);
    assert.equal(h.effects.filter(e => e.kind === 'started').length, 1); assert.equal(h.effects.filter(e => e.kind === 'finished').length, 1);
    assert.equal(h.effects.some(e => /battle|encounter-request/.test(e.kind)), false);
  }
});
test('accelerated no-bite, timeout and auto-hook retain their exact shorter prefixes', () => {
  const miss = harness({ accelerated: true }, [[6, 3], [6, 0], [100, 68]]);
  miss.waiting(); miss.waited(); assert.equal(miss.finish().caught, false); assert.deepEqual(miss.trace, [6, 6, 100]);
  const timeout = harness({ accelerated: true }, [[6, 3], [6, 0], [100, 67], [6, 0]]);
  timeout.window(); timeout.step({ ms: 501 }); assert.equal(timeout.finish().caught, false); assert.deepEqual(timeout.trace, [6, 6, 100, 6]);
  const auto = harness({ accelerated: true, autoHook: true }, [[6, 3], [6, 0], [100, 67], [6, 0]]);
  auto.window(); auto.step({ ms: 10000, confirm: true }); assert(auto.finish().caught); assert.deepEqual(auto.trace, [6, 6, 100, 6]);
});
test('all six window draws produce 500..1000ms without rounding the strict boundary', () => {
  for (let roll = 0; roll < 6; roll++) {
    const h = harness({}, [[6, 0], [100, 0], [6, roll]]); h.window();
    assert.equal(h.state.windowMs, 500 + roll * 100);
    h.step({ ms: 500 + roll * 100 }); assert.equal(h.state.phase, 'bite-window');
    h.step({ ms: 0.001 }); assert.equal(h.state.result, 'escaped');
  }
});
test('window draw waits for successful exclamation; every display waits for its acknowledgement', () => {
  const h = harness(); h.waiting(); h.waited(); assert.deepEqual(h.trace, [6, 100]);
  h.step({ ms: 10000 }); assert.equal(h.state.pending.kind, 'exclamation'); assert.deepEqual(h.trace, [6, 100]);
  h.ack(); assert.equal(h.state.pending.kind, 'bite-message'); assert.deepEqual(h.trace, [6, 100, 6]);
  h.step({ ms: 10000 }); assert.equal(h.state.pending.kind, 'bite-message'); h.ack();
  assert.equal(h.state.stageStartedMs, h.state.clock.elapsedMs);
});
test('focused stall retains full elapsed time without skipping an undisplayed dot', () => {
  const h = harness(); h.waiting(); h.step({ ms: 10000 });
  assert.equal(h.state.clock.elapsedMs, 10000); assert.equal(h.state.pending.kind, 'dots'); assert.equal(h.state.pending.dots, 1);
  h.step({ ms: 10000 }); assert.equal(h.state.pending.dots, 1); assert.deepEqual(h.trace, [6]);
});
test('blur pauses window clock and ignores input; resume does not charge the paused interval', () => {
  const h = harness(); h.window(); h.step({ ms: 100, active: false });
  const elapsed = h.state.clock.elapsedMs; h.step({ ms: 10000, confirm: true }); assert.equal(h.state.clock.elapsedMs, elapsed); assert.equal(h.state.phase, 'bite-window');
  h.step({ ms: 10000, active: true }); assert.equal(h.state.clock.elapsedMs, elapsed);
  h.step({ ms: 400 }); assert.equal(h.state.phase, 'bite-window'); h.step({ ms: 10 }); assert.equal(h.state.result, 'escaped');
});
test('clock is monotonic, does not read world epoch time, and validates samples', () => {
  const c = { monotonicMs: 100, active: true, elapsedMs: 0 };
  assert.deepEqual(F.sampleFishingClock(c, { monotonicMs: 10100, active: true }), { monotonicMs: 10100, active: true, elapsedMs: 10000 });
  for (const monotonicMs of [99, NaN, Infinity, -1]) assert.throws(() => F.sampleFishingClock(c, { monotonicMs, active: true }), RangeError);
});
test('eight shake slots and 1.6 second repeat', () => {
  assert.deepEqual(Array.from({ length: 16 }, (_, i) => F.fishingShakeFrame(i * 200)), [1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0]);
});
test('R6-FS08 failed start preserves zero RNG prefix and emits owned cleanup', () => {
  const h = harness(); h.ack('failed'); assert.deepEqual(h.trace, []); assert.equal(h.state.pending.kind, 'restore');
  assert.deepEqual(h.effects.map(e => e.kind), ['started', 'begin-presentation', 'restore']);
  assert.equal(h.finish().reason, 'host-failed');
});
test('message-open failure is before all RNG; R6-FS09 dot failure is after the waiting draw', () => {
  const h = harness(); h.ack(); h.ack('failed'); assert.deepEqual(h.trace, []); h.finish();
  const w = harness(); w.ack(); w.ack(); w.ack('failed'); assert.deepEqual(w.trace, [6]); assert.equal(w.finish().caught, false);
});
test('R6-FS10 failed exclamation does not pre-draw the window', () => {
  const h = harness(); h.waiting(); h.waited(); h.ack('failed'); assert.deepEqual(h.trace, [6, 100]); h.finish();
});
test('R6-FS11 failed ending message keeps RNG prefix and skips normal-result completion', () => {
  const h = harness({ allowBite: false }, [[6, 0]]); h.waiting(); h.waited(); h.ack();
  assert.equal(h.state.pending.kind, 'result-message'); h.ack('failed'); assert.deepEqual(h.trace, [6]); assert.equal(h.finish().status, 'interrupted');
});
for (const at of ['begin', 'waiting', 'exclamation', 'window', 'ending']) test('scene close during ' + at + ' requests restore without further draw', () => {
  const h = harness({ surfing: true });
  if (at !== 'begin') h.waiting();
  if (['exclamation', 'window', 'ending'].includes(at)) h.waited();
  if (['window', 'ending'].includes(at)) { h.ack(); h.ack(); }
  if (at === 'ending') h.step({ confirm: true });
  const trace = [...h.trace]; h.step({ interrupt: 'scene-closed' }); assert.equal(h.state.pending.kind, 'restore');
  assert.equal(h.state.pending.surfing, true); assert.equal(h.state.pending.interrupted, true); assert.deepEqual(h.trace, trace);
  const done = h.finish(); assert.equal(done.caught, false); assert.equal(done.reason, 'scene-closed');
  assert.equal(h.effects.filter(e => e.kind === 'restore').length, 1);
});
test('normal ordering: end presentation, final message, restore, finished; cleanup failure ends once', () => {
  const h = harness(); h.window(); h.step({ confirm: true }); h.finish();
  assert.deepEqual(h.effects.slice(-4).map(e => e.kind), ['end-presentation', 'result-message', 'restore', 'finished']);
  const failed = harness(); failed.step({ interrupt: 'scene-closed' }); failed.ack('failed');
  assert.equal(failed.state.completion.cleanupFailed, true); assert.equal(failed.state.phase, 'done');
  assert.deepEqual(failed.step({ interrupt: 'host-failed' }).effects, []);
});
test('stale acknowledgement is inert and cannot duplicate a draw', () => {
  const h = harness(); const id = h.state.pending.id; h.ack(); h.step({ effect: { id, status: 'completed' } });
  assert.equal(h.state.pending.kind, 'open-message'); assert.deepEqual(h.trace, []); h.ack(); assert.deepEqual(h.trace, [6]);
  h.step({ effect: { id, status: 'completed' }, confirm: true }); assert.deepEqual(h.trace, [6]); assert.equal(h.state.pending.kind, 'dots');
});
test('invalid RNG domains/options/inputs are rejected, never silently clamped', () => {
  for (const roll of [-1, 100, 0.5, NaN]) assert.throws(() => F.fishingBite(1, false, roll), RangeError);
  assert.throws(() => F.fishingBiteThreshold(4, false), RangeError);
  const h = harness(); h.ack();
  for (const value of [-1, 6, 0.5, NaN]) assert.throws(() => F.advanceFishing(h.state, { sample: { monotonicMs: 0, active: true }, effect: { id: h.state.pending.id, status: 'completed' } }, () => value), RangeError);
  assert.throws(() => F.startFishing({ rod: 1, allowBite: 1, accelerated: false, autoHook: false, surfing: false }, { monotonicMs: 0, active: true }), RangeError);
  assert.throws(() => F.advanceFishing(h.state, { sample: { monotonicMs: 0, active: true }, confirm: 1 }, () => 0), RangeError);
});
function pendingAt(h, kind) {
  if (kind === 'open-message') h.ack();
  if (kind === 'dots') { h.ack(); h.ack(); }
  if (['exclamation', 'bite-message'].includes(kind)) { h.waiting(); h.waited(); if (kind === 'bite-message') h.ack(); }
  if (['end-presentation', 'result-message', 'restore'].includes(kind)) {
    h.window(); h.step({ confirm: true });
    if (['result-message', 'restore'].includes(kind)) h.ack();
    if (kind === 'restore') h.ack();
  }
  assert.equal(h.state.pending.kind, kind);
}
for (const kind of ['begin-presentation', 'open-message', 'dots', 'exclamation', 'bite-message', 'end-presentation', 'result-message']) {
  test('blurred one-shot ' + kind + ' acknowledgement resumes once without replay or paused RNG', () => {
    const h = harness(); pendingAt(h, kind);
    const id = h.state.pending.id, prefix = [...h.trace];
    h.step({ ms: 10, active: false }); const elapsed = h.state.clock.elapsedMs;
    assert.deepEqual(h.ack('completed', { ms: 100 }).effects, []);
    assert.deepEqual(h.trace, prefix); assert.equal(h.state.clock.elapsedMs, elapsed);
    assert.deepEqual(h.step({ ms: 10000 }).effects, []);
    assert.deepEqual(h.trace, prefix); assert.equal(h.state.clock.elapsedMs, elapsed);
    h.step({ ms: 10000, active: true });
    assert.notEqual(h.state.pending?.id, id, 'resume consumes the completed effect without another callback');
    assert.equal(h.state.clock.elapsedMs, elapsed);
    const afterResume = [...h.trace];
    assert.deepEqual(afterResume, kind === 'open-message' || kind === 'exclamation' ? [...prefix, 6] : prefix);
    assert.deepEqual(h.step({ ms: 16, effect: { id, status: 'completed' } }).effects, []);
    assert.deepEqual(h.trace, afterResume);
    if (kind === 'dots' || kind === 'bite-message') assert.equal(h.state.stageStartedMs, elapsed);
  });
}
test('a paused completed message followed by scene close cannot carry queued progress into cleanup', () => {
  const h = harness(); pendingAt(h, 'open-message'); h.step({ active: false }); h.ack();
  h.step({ interrupt: 'scene-closed' }); assert.equal(h.state.pending.kind, 'restore');
  assert.deepEqual(h.trace, []); h.step({ ms: 10000, active: true });
  assert.equal(h.state.pending.kind, 'restore'); assert.deepEqual(h.trace, []);
  assert.equal(h.finish().status, 'interrupted');
});
test('duplicate completion while paused is held once, including a duplicate arriving on resume', () => {
  const h = harness(); pendingAt(h, 'open-message'); const id = h.state.pending.id;
  h.step({ active: false }); h.ack(); h.ack(); assert.deepEqual(h.trace, []);
  h.step({ ms: 10000, active: true, effect: { id, status: 'completed' } });
  assert.equal(h.state.pending.kind, 'dots'); assert.deepEqual(h.trace, [6]);
  assert.deepEqual(h.step({ effect: { id, status: 'completed' } }).effects, []); assert.deepEqual(h.trace, [6]);
});
test('failed presentation acknowledgement during blur starts cleanup immediately without RNG', () => {
  const h = harness(); h.step({ active: false }); h.ack('failed');
  assert.equal(h.state.pending.kind, 'restore'); assert.deepEqual(h.trace, []);
  assert.equal(h.finish().reason, 'host-failed');
});
for (const reason of ['scene-closed', 'cancelled', 'host-failed']) for (const status of ['completed', 'failed']) {
  test('restore interrupted by ' + reason + ' retains one cleanup request with late ' + status, () => {
    const h = harness(); pendingAt(h, 'restore'); const id = h.state.pending.id, prefix = [...h.trace];
    h.step({ interrupt: reason }); assert.equal(h.state.pending.id, id);
    h.step({ interrupt: reason === 'scene-closed' ? 'cancelled' : 'scene-closed' }); assert.equal(h.state.pending.id, id);
    const done = h.ack(status).state.completion;
    assert.equal(done.status, 'interrupted'); assert.equal(done.reason, reason); assert.equal(done.caught, false);
    assert.equal(done.cleanupFailed, status === 'failed'); assert.deepEqual(h.trace, prefix);
    assert.equal(h.effects.filter(e => e.kind === 'restore').length, 1);
    assert.deepEqual(h.step({ effect: { id, status: 'completed' } }).effects, []);
    assert.equal(h.effects.filter(e => e.kind === 'started').length, 1);
    assert.equal(h.effects.filter(e => e.kind === 'finished').length, 1);
  });
}
