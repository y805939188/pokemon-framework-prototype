'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, clone, value } = require('./fishing-app-fixtures.cjs');
test('T16/T24 production App child counts entry/caught once, returns frozen C intent, and cannot start a battle', async () => {
  const h = fixture(), { promise } = await h.start(); assert.equal(h.operation.run(), promise);
  assert.equal(h.state.stats.fishing_count, 1); assert.equal(h.state.stats.fishing_battles, 0); assert.deepEqual(h.draws, []);
  h.window(); h.input(510, { confirm: true }); h.finish(); const result = await promise;
  assert.equal(result.status, 'completed'); assert.equal(result.completion.caught, true); assert.equal(result.cleanup, 'completed');
  assert.deepEqual(result.prefix, { countCommitted: true, battlesCommitted: true }); assert.deepEqual(h.draws, [6, 100, 6, 100]);
  assert.equal(h.state.stats.fishing_count, 1); assert.equal(h.state.stats.fishing_battles, 1); assert.equal(h.installs.length, 2);
  assert.equal(result.encounter.kind, 'fishing'); assert.equal(result.encounter.type, 'OldRod'); assert.equal(result.encounter.facingEnvironment.value, 'stillwater');
  assert(Object.isFrozen(result.encounter.business.weather.value)); h.facts.business.hour.value = 3;
  assert.equal(result.encounter.business.hour.value, 21); assert.equal((await h.operation.run()), result); assert.equal(h.installs.length, 2);
});
for (const [rod, type] of [[1, 'OldRod'], [2, 'GoodRod'], [3, 'SuperRod']]) test('R07 rod ' + rod + ' accelerated prefix and named source ' + type, async () => {
  const h = fixture({ rod, accelerated: true }), { promise } = await h.start(); h.window(); h.input(10, { cancel: true }); h.finish();
  const result = await promise; assert.equal(result.encounter.type, type); assert.deepEqual(h.draws, [6, 6, 100, 6, 100]);
});
test('R07 autoHook keeps waiting for input and skips final RNG and caught message', async () => {
  const h = fixture({ autoHook: true }), { promise } = await h.start(); h.window(); h.input(10000); assert.equal(h.pending, null);
  h.input(1, { confirm: true }); h.finish(); assert.equal((await promise).completion.caught, true); assert.deepEqual(h.draws, [6, 100, 6]);
  assert.equal(h.effects.some(e => e.kind === 'result-message'), false);
});
test('T24 no table still performs every waiting segment and only consumes segment RNG', async () => {
  const h = fixture({ noTable: true }), { promise } = await h.start(); h.waiting();
  for (let n = 0; n < 30 && (!h.pending || h.pending.kind === 'dots'); n++) h.pending ? h.ack() : h.input(400);
  h.finish(); const result = await promise; assert.equal(result.status, 'completed'); assert.equal(result.completion.caught, false);
  assert.deepEqual(h.draws, [6]); assert.equal(h.effects.filter(e => e.kind === 'dots').length, 6); assert.equal(h.state.stats.fishing_count, 1); assert.equal(h.state.stats.fishing_battles, 0); assert.equal(result.encounter, undefined);
});
for (const [name, facts] of [['not-fishable', f => { f.facingFishable = value(false); }], ['exit-blocked', f => { f.currentExitPassable = value(false); }], ['facts-unavailable', f => { f.facingFishable = { status: 'unavailable' }; }]]) test('T24 qualification ' + name + ' has no counter/RNG/presentation', async () => {
  const h = fixture({ facts }), { promise } = await h.start(), result = await promise;
  assert.equal(result.status, 'refused'); assert.equal(result.reason, name); assert.equal(h.begins, 0); assert.equal(h.installs.length, 0); assert.deepEqual(h.draws, []);
});
test('T24 Surf uses authoritative state and exempts current exit without inventing a target entry gate', async () => {
  const h = fixture({ surfing: true, facts: f => { f.currentExitPassable = value(false); } }), { promise } = await h.start();
  assert.equal(h.effects.find(e => e.kind === 'begin-presentation').surfing, true); h.waiting(); h.input(1, { confirm: true }); h.finish(); assert.equal((await promise).status, 'completed');
});
test('T24 exact ACK id and duplicates cannot reach RNG or recount', async () => {
  const h = fixture(), { promise } = await h.start(); const first = h.pending.id;
  h.raw({ sample: { monotonicMs: 0, active: true }, effect: { id: first + 99, status: 'completed' } }); assert.deepEqual(h.draws, []);
  h.ack(); h.raw({ sample: { monotonicMs: 0, active: true }, effect: { id: first, status: 'completed' } }); assert.deepEqual(h.draws, []);
  h.ack(); h.ack(); h.input(1, { cancel: true }); h.finish(); const result = await promise; assert.equal(result.completion.caught, false); assert.deepEqual(h.draws, [6]); assert.equal(h.installs.length, 1);
});
test('T24 0.500 continues, 0.510 input wins, and an unacknowledged dot blocks focused 600ms catchup', async () => {
  const h = fixture(), { promise } = await h.start(); h.window(); h.input(500); assert.equal(h.pending, null); h.input(10, { confirm: true }); h.finish(); assert((await promise).completion.caught);
  const stall = fixture(), started = await stall.start(); stall.waiting(); stall.input(600); assert.equal(stall.pending.kind, 'dots'); assert.equal(stall.pending.dots, 1);
  stall.input(600); assert.equal(stall.pending.dots, 1); stall.operation.cancel(); stall.finish(); await started.promise;
});
test('T24 blur/resume excludes inactive time and ignores its input', async () => {
  const h = fixture(), { promise } = await h.start(); h.window(); h.input(100, { active: false }); h.input(10000, { confirm: true });
  assert.equal(h.pending, null); h.input(10000, { active: true }); h.input(400); assert.equal(h.pending, null); h.input(10); h.finish();
  const result = await promise; assert.equal(result.completion.caught, false); assert.deepEqual(h.draws, [6, 100, 6]); assert.equal(h.state.stats.fishing_battles, 0);
});
for (const at of ['begin-presentation', 'open-message', 'exclamation', 'restore']) test('T24 thrown ' + at + ' retains reached prefix and reaches cleanup', async () => {
  const h = fixture({ throwEffect: at }), { promise } = await h.start();
  if (at === 'open-message') h.ack();
  if (at === 'exclamation' || at === 'restore') {
    if (at === 'exclamation') { h.waiting(); for (let n = 0; n < 30 && (!h.pending || h.pending.kind === 'dots'); n++) h.pending ? h.ack() : h.input(400); }
    else h.operation.cancel();
  }
  h.finish(); const result = await promise; assert.notEqual(result.status, 'completed'); assert.equal(h.state.stats.fishing_count, 1); assert.equal(h.state.stats.fishing_battles, 0);
  assert.equal(result.cleanup, at === 'restore' ? 'failed' : 'completed'); assert.deepEqual(h.draws, at === 'exclamation' ? [6, 100] : []);
});
test('T24 cancellation waits for exact owned restore ACK, late old ACK cannot count or settle it', async () => {
  const h = fixture(), { promise } = await h.start(), first = h.pending.id; let settled = false; promise.then(() => { settled = true; });
  assert.equal(h.operation.cancel(), promise); const restore = h.pending.id; assert.equal(h.pending.kind, 'restore'); await h.flush(); assert.equal(settled, false);
  h.raw({ sample: { monotonicMs: 0, active: true }, effect: { id: first, status: 'completed' } }); await h.flush(); assert.equal(settled, false);
  h.ack('completed', restore); const result = await promise; assert.equal(result.status, 'cancelled'); assert.equal(result.cleanup, 'completed'); assert.equal(result.prefix.countCommitted, true); assert.equal(h.state.stats.fishing_battles, 0);
});
for (const change of ['owner', 'generation', 'state', 'content']) test('T24 stale ' + change + ' cannot write caught counter; own restore still must settle', async () => {
  const h = fixture(), { promise } = await h.start(); h.window();
  if (change === 'owner') h.replaceOwner(); else if (change === 'generation') h.replaceGeneration();
  else if (change === 'state') h.external(g => { g.money++; }); else h.replaceContent({ ...h.content, settings: { FISHING_AUTO_HOOK: true } });
  const before = clone(h.state); h.input(10, { confirm: true }); assert.equal(h.pending.kind, 'restore'); h.finish(); const result = await promise;
  assert.equal(result.status, 'failed'); assert.equal(result.cleanup, 'completed'); assert.equal(result.encounter, undefined); assert.deepEqual(h.state, before); assert.equal(result.prefix.battlesCommitted, false);
});
for (const write of [1, 2]) test('T24 final actualContent guard refuses stat installation ' + write, async () => {
  let h; h = fixture({ onInstall(number) { if (number === write) h.actual({ ...h.content, settings: { FISHING_AUTO_HOOK: true } }); } });
  const { promise } = await h.start();
  if (write === 2) { h.window(); h.input(1, { confirm: true }); h.finish(); }
  const result = await promise; assert.equal(result.status, 'failed'); assert.equal(result.encounter, undefined);
  assert.equal(h.state.stats.fishing_count, write === 1 ? 0 : 1); assert.equal(h.state.stats.fishing_battles, 0); assert.equal(h.installs.length, write - 1);
});
test('T24 cancel before run enters no loop; failing host begin retains count with no owned resource', async () => {
  const before = fixture(), cancelled = await before.operation.cancel(); assert.equal(cancelled.status, 'cancelled'); assert.equal(before.installs.length, 0); assert.equal(before.begins, 0);
  const h = fixture({ throwBegin: true }), { promise } = await h.start(), result = await promise; assert.equal(result.status, 'failed'); assert.equal(result.cleanup, 'not-started'); assert.equal(h.state.stats.fishing_count, 1); assert.deepEqual(h.draws, []);
});
test('T24 content-owned presentation config and original rod remain frozen for this child', async () => {
  const h = fixture({ settings: { FISHING_BEGIN_COMMON_EVENT: 7, FISHING_END_COMMON_EVENT: 9 } }), { promise } = await h.start();
  assert.deepEqual(h.presentationConfig, { beginCommonEventId: 7, endCommonEventId: 9 }); assert(Object.isFrozen(h.presentationConfig));
  h.action.rod = 3; h.window(); h.input(1, { confirm: true }); h.finish(); const result = await promise;
  assert.equal(result.encounter.rod, 1); assert.equal(result.encounter.type, 'OldRod');
});
test('T24 malformed clock and invalid RNG preserve reached prefix and require owned restoration', async () => {
  const badClock = fixture(), a = await badClock.start(); badClock.raw({ sample: { monotonicMs: NaN, active: true } });
  assert.equal(badClock.pending.kind, 'restore'); badClock.finish(); assert.equal((await a.promise).status, 'failed'); assert.deepEqual(badClock.draws, []);
  const badRandom = fixture({ random: upper => upper }), b = await badRandom.start(); badRandom.ack(); badRandom.ack();
  assert.equal(badRandom.pending.kind, 'restore'); badRandom.finish(); assert.equal((await b.promise).status, 'failed'); assert.deepEqual(badRandom.draws, [6]);
  assert.equal(badRandom.state.stats.fishing_count, 1); assert.equal(badRandom.state.stats.fishing_battles, 0);
});
test('T24 failed restore and failing disposal are explicit cleanup failures without caught counter', async () => {
  const failed = fixture(), a = await failed.start(); failed.operation.cancel(); failed.ack('failed'); const first = await a.promise;
  assert.equal(first.cleanup, 'failed'); assert.equal(first.prefix.countCommitted, true); assert.equal(first.prefix.battlesCommitted, false);
  const dispose = fixture({ throwDispose: true }), b = await dispose.start(); dispose.window(); dispose.input(1, { confirm: true }); dispose.finish();
  const second = await b.promise; assert.equal(second.status, 'failed'); assert.equal(second.cleanup, 'failed'); assert.equal(dispose.state.stats.fishing_battles, 0); assert.equal(second.encounter, undefined);
});
test('T24 cancellation after caught input but before final restoration never issues C intent or battles count', async () => {
  const h = fixture(), { promise } = await h.start(); h.window(); h.input(1, { confirm: true });
  assert.equal(h.pending.kind, 'end-presentation'); h.operation.cancel(); assert.equal(h.pending.kind, 'restore'); h.finish();
  const result = await promise; assert.equal(result.status, 'cancelled'); assert.equal(result.encounter, undefined); assert.equal(result.prefix.countCommitted, true); assert.equal(result.prefix.battlesCommitted, false);
});
for (const write of [1, 2]) test('T24 reentrant parent cancellation at final install ' + write + ' cannot authorize that write', async () => {
  const h = fixture({ onInstall(number, context) { if (number === write) context.operation.cancel(); } }), { promise } = await h.start();
  if (write === 2) { h.window(); h.input(1, { confirm: true }); h.finish(); }
  const result = await promise; assert.equal(result.status, 'cancelled'); assert.equal(result.encounter, undefined); assert.equal(h.installs.length, write - 1); assert.equal(h.state.stats.fishing_battles, 0);
});
