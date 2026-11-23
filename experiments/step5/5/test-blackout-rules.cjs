'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./f-blackout-fixtures.cjs');
const B = process.env.PF55_F_RULES_FILE ? require(process.env.PF55_F_RULES_FILE)
  : require(require('node:path').join(require('./regular-world-core-runtime.cjs').output(), 'blackout.js'));
assert(B, 'missing integrated blackout core export; use PF55_F_RULES_FILE for isolated author tests');
function plan(input) { const result = B.planBlackoutReturn(input); assert.equal(result.status, 'planned'); return result.plan; }
function refusal(result, reason) { assert.equal(result.status, 'refused'); assert.equal(result.reason, reason); }
function waiting(overrides = {}) { return F.pending({ stage: 'awaiting-arrival', ...overrides }); }

for (const [kind, origin] of [['field', F.field], ['battle', F.battle]]) {
  const inputs = {
    center: F.input({ origin, world: { recentCenter: F.center }, characterHome: F.characterHome, globalHome: F.globalHome }),
    home: F.input({ origin, characterHome: F.characterHome, globalHome: F.globalHome }),
    'no-home': F.input({ origin }),
    'home-map-missing': F.input({ origin, characterHome: F.characterHome, globalHome: F.globalHome, mapResource: () => ({ status: 'missing' }) }),
  };
  for (const [branch, input] of Object.entries(inputs)) test(`T14 ${kind} ${branch}: literal branch order and clearing oracle`, () => {
    const result = plan(input), oracle = F.oracle[kind][branch];
    assert.equal(result.destination.branch, branch);
    assert.deepEqual(result.settlement, oracle.settlement);
    assert.deepEqual(result.effects, oracle.effects);
    assert.deepEqual(result.clearWorldFields, oracle.clearWorldFields);
    assert.deepEqual(result.origin, origin);
    if (branch === 'center') assert.deepEqual(result.destination.target, { mapId: 2, x: 3, y: 4, direction: 2 });
    if (branch === 'home') assert.deepEqual(result.destination.target, { mapId: 3, x: 7, y: 5, direction: 8 });
    if (branch === 'home-map-missing') assert.deepEqual(result.destination.selectedHome, { mapId: 3, x: 7, y: 5, direction: 8 });
    assert.equal([...result.settlement.effects, ...result.effects].some(effect => /money|deduct|battle-money/.test(effect)), false);
    if (kind === 'battle') assert.equal([...result.settlement.effects, ...result.effects].some(effect => effect === 'heal-party' || effect === 'count-blackout'), false);
  });
}

test('T14 center lookup takes priority over both homes and healing/escape points', () => {
  const calls = [], input = F.input({ world: { recentCenter: F.center, healingSpot: F.globalHome, escapePoint: F.globalHome },
    characterHome: F.characterHome, globalHome: F.globalHome, mapResource: id => { calls.push(id); return F.map; } });
  assert.deepEqual(plan(input).destination, { branch: 'center', target: { mapId: 2, x: 3, y: 4, direction: 2 } });
  assert.deepEqual(calls, [2]);
});
test('T14 character home is used, and only missing character configuration permits global fallback', () => {
  for (const missing of [null, undefined]) {
    const calls = [];
    assert.deepEqual(plan(F.input({ characterHome: missing, globalHome: F.globalHome, mapResource: id => { calls.push(id); return F.map; } })).destination,
      { branch: 'home', target: { mapId: 4, x: 6, y: 2, direction: 4 } });
    assert.deepEqual(calls, [4]);
  }
});
test('T14 missing selected character home map keeps that branch and never looks up global home', () => {
  const calls = [], result = plan(F.input({ characterHome: F.characterHome, globalHome: F.globalHome,
    mapResource: id => { calls.push(id); return { status: 'missing' }; } }));
  assert.equal(result.destination.branch, 'home-map-missing'); assert.deepEqual(calls, [3]);
  assert.deepEqual(result.clearWorldFields, []);
});
test('T14 missing center resource refuses instead of selecting home', () => {
  const calls = [];
  refusal(B.planBlackoutReturn(F.input({ world: { recentCenter: F.center }, characterHome: F.characterHome,
    mapResource: id => { calls.push(id); return { status: 'missing' }; } })), 'map-missing');
  assert.deepEqual(calls, [2]);
});
for (const choice of ['center', 'home']) for (const throwing of [false, true]) test(`T14 ${choice} resource ${throwing ? 'throws' : 'unavailable'} never becomes missing/no-home`, () => {
  const calls = [], result = B.planBlackoutReturn(F.input({ world: { recentCenter: choice === 'center' ? F.center : null },
    characterHome: F.characterHome, globalHome: F.globalHome,
    mapResource: id => { calls.push(id); if (throwing) throw new Error('synthetic I/O failure'); return { status: 'unavailable' }; } }));
  refusal(result, 'map-unavailable'); assert.deepEqual(result.settlement, { owner: 'field', effects: ['count-blackout', 'heal-party'] });
  assert.deepEqual(calls, [choice === 'center' ? 2 : 3]);
  assert.equal(Object.hasOwn(result, 'plan'), false);
});
test('T14 no-home resolves without consulting resources or using healingSpot/escapePoint', () => {
  const result = plan(F.input({ world: { recentCenter: null, healingSpot: F.center, escapePoint: F.globalHome }, mapResource: () => { throw new Error('must not query'); } }));
  assert.deepEqual(result.destination, { branch: 'no-home' });
});
test('T14 invalid character configuration cannot silently fall back to valid global home', () => {
  let calls = 0;
  refusal(B.planBlackoutReturn(F.input({ characterHome: { ...F.characterHome, direction: 0 }, globalHome: F.globalHome,
    mapResource: () => { calls++; return F.map; } })), 'invalid-location');
  assert.equal(calls, 0);
});

for (const [label, patch] of [
  ['map zero', { mapId: 0 }], ['negative map', { mapId: -1 }], ['map fraction', { mapId: 1.5 }],
  ['map string', { mapId: '3' }], ['unsafe map', { mapId: 9007199254740992 }], ['map NaN', { mapId: NaN }],
  ['x fraction', { x: 1.5 }], ['unsafe x', { x: 9007199254740992 }], ['y Infinity', { y: Infinity }],
  ['direction zero', { direction: 0 }], ['direction diagonal', { direction: 3 }], ['direction string', { direction: '8' }],
]) test('target structural refusal: ' + label, () => {
  refusal(B.validateBlackoutTarget({ ...F.characterHome, ...patch }, F.map), 'invalid-location');
  let queried = false;
  refusal(B.planBlackoutReturn(F.input({ world: { recentCenter: { ...F.characterHome, ...patch } },
    characterHome: F.globalHome, mapResource: () => { queried = true; return F.map; } })), 'invalid-location');
  assert.equal(queried, false);
});
for (const patch of [{ x: -1 }, { y: -1 }, { x: 12 }, { y: 10 }]) test('geometry refuses without clamp/wrap: ' + JSON.stringify(patch), () => {
  refusal(B.validateBlackoutTarget({ ...F.characterHome, ...patch }, F.map), 'target-out-of-bounds');
  refusal(B.planBlackoutReturn(F.input({ characterHome: { ...F.characterHome, ...patch }, globalHome: F.globalHome })), 'target-out-of-bounds');
});
for (const direction of [2, 4, 6, 8]) test('all cardinal directions and both geometry edges are accepted: ' + direction, () => {
  for (const [x, y] of [[0, 0], [11, 9]]) assert.deepEqual(B.validateBlackoutTarget({ mapId: 1, x, y, direction }, F.map),
    { status: 'valid', target: { mapId: 1, x, y, direction } });
});
for (const resource of [null, {}, { status: 'other' }, { status: 'exists', width: 0, height: 10 },
  { status: 'exists', width: 12, height: -1 }, { status: 'exists', width: '12', height: 10 },
  { status: 'exists', width: 12.5, height: 10 }, { status: 'exists', width: 12, height: NaN },
  { status: 'missing', width: 12 }, { status: 'unavailable', reason: 'extra' }]) test('invalid map resource is refused: ' + JSON.stringify(resource), () => {
  refusal(B.validateBlackoutTarget(F.characterHome, resource), 'invalid-map-resource');
});
test('external location data rejects accessors, inherited fields and extra keys without invoking getters', () => {
  let calls = 0;
  const getter = { ...F.characterHome }; Object.defineProperty(getter, 'x', { enumerable: true, get() { calls++; return 7; } });
  for (const invalid of [getter, Object.create(F.characterHome), { ...F.characterHome, token: 'runtime' }, [], null]) refusal(B.validateBlackoutTarget(invalid, F.map), 'invalid-location');
  assert.equal(calls, 0);
  const resource = { status: 'exists', height: 10 }; Object.defineProperty(resource, 'width', { enumerable: true, get() { calls++; return 12; } });
  refusal(B.validateBlackoutTarget(F.characterHome, resource), 'invalid-map-resource'); assert.equal(calls, 0);
});
test('missing recentCenter field is invalid and cannot act as an absent center', () => {
  refusal(B.planBlackoutReturn(F.input({ world: {}, characterHome: F.characterHome })), 'invalid-location');
});
test('invalid origin is refused before resource reads or settlement planning', () => {
  let calls = 0;
  for (const invalid of [{ kind: 'battle', battleId: 'b', rawHash: 'pair-hash' }, { ...F.field, generation: 3 },
    { kind: 'field', sourceId: '' }, { kind: 'battle', battleId: 'b', rawHash: F.battle.rawHash, sourceId: 's' }]) {
    const result = B.planBlackoutReturn(F.input({ origin: invalid, characterHome: F.characterHome, mapResource: () => { calls++; return F.map; } }));
    refusal(result, 'invalid-origin'); assert.equal(Object.hasOwn(result, 'settlement'), false);
  }
  assert.equal(calls, 0);
});
test('T14 battle planning and checkpoints carry raw result identity without a second settlement ledger', () => {
  const result = plan(F.input({ origin: F.battle, characterHome: F.characterHome }));
  assert.deepEqual(B.createBlackoutCheckpoint('return-battle', result), { status: 'ready', pending: {
    id: 'return-battle', origin: { kind: 'battle', battleId: 'battle-19', rawHash: 'abcdef0123456789'.repeat(4) },
    branch: 'home', target: { mapId: 3, x: 7, y: 5, direction: 8 }, stage: 'ready',
  } });
  assert.deepEqual(B.blackoutSettlementPlan('battle'), { owner: 'battle', effects: [] });
  assert.deepEqual(B.blackoutSettlementPlan('field'), { owner: 'field', effects: ['count-blackout', 'heal-party'] });
});
test('input mutation cannot change a planned destination or an installed checkpoint snapshot', () => {
  const input = F.input({ origin: structuredClone(F.battle), characterHome: { ...F.characterHome } }), result = plan(input);
  input.characterHome.x = 1; input.origin.battleId = 'different';
  assert.deepEqual(result.destination.target, { mapId: 3, x: 7, y: 5, direction: 8 });
  assert.equal(result.origin.battleId, 'battle-19');
  const ready = B.createBlackoutCheckpoint('return-17', result); result.destination.target.y = 1; result.origin.rawHash = 'f'.repeat(64);
  assert.equal(ready.pending.target.y, 5); assert.equal(ready.pending.origin.rawHash, F.battle.rawHash);
});
for (const branch of ['no-home', 'home-map-missing']) test('T20 synchronous ' + branch + ' does not persist a fake target-null return', () => {
  const result = plan(F.input(branch === 'no-home' ? {} : { characterHome: F.characterHome, mapResource: () => ({ status: 'missing' }) }));
  assert.deepEqual(B.createBlackoutCheckpoint('return-17', result), { status: 'complete', pending: null });
});
test('T20 create ready checkpoint, reserve without arrival, and repeat reserve preserve intent/target', () => {
  const result = plan(F.input({ characterHome: F.characterHome }));
  const ready = B.createBlackoutCheckpoint('return-17', result);
  assert.equal(ready.status, 'ready'); assert.deepEqual(ready.pending, F.pending());
  const before = structuredClone(ready.pending), reserve = B.markBlackoutReserved(ready.pending, 'return-17');
  assert.equal(reserve.status, 'awaiting-arrival'); assert.deepEqual(reserve.pending, waiting());
  assert.deepEqual(ready.pending, before);
  assert.deepEqual(B.markBlackoutReserved(reserve.pending, 'return-17'), { status: 'duplicate', pending: waiting() });
  refusal(B.markBlackoutReserved(reserve.pending, 'old-return'), 'return-id-mismatch');
});
test('T20 ready checkpoint cannot be cleared merely because the player already has target coordinates', () => {
  const before = F.pending(), result = B.confirmBlackoutArrival(before, F.observation());
  refusal(result, 'arrival-not-awaited'); assert.deepEqual(result.pending, before);
});
test('T20 exact real map/x/y/d arrival and no pending transfer clears only the checkpoint result', () => {
  const before = waiting();
  assert.deepEqual(B.confirmBlackoutArrival(before, F.observation()), { status: 'arrived', pending: null });
  assert.deepEqual(before, waiting());
});
for (const [field, value] of [['mapId', 4], ['x', 6], ['y', 4], ['direction', 2]]) test('T20 late arrival at wrong ' + field + ' preserves frozen target', () => {
  const before = waiting(), result = B.confirmBlackoutArrival(before, F.observation({ actual: { ...F.characterHome, [field]: value } }));
  refusal(result, 'arrival-target-mismatch'); assert.deepEqual(result.pending, before);
  result.pending.target.x = 0; assert.equal(before.target.x, 7);
});
test('T20 old-return callback, host pending transfer and malformed actual snapshot cannot confirm', () => {
  const before = waiting();
  for (const [patch, reason] of [[{ returnId: 'old-return' }, 'return-id-mismatch'], [{ transferPending: true }, 'host-transfer-pending'],
    [{ transferPending: 0 }, 'invalid-transfer-observation'], [{ actual: { ...F.characterHome, direction: 0 } }, 'invalid-location']]) {
    const result = B.confirmBlackoutArrival(before, F.observation(patch)); refusal(result, reason); assert.deepEqual(result.pending, before);
  }
});
for (const [resource, reason] of [[{ status: 'unavailable' }, 'map-unavailable'], [{ status: 'missing' }, 'map-missing'],
  [{ status: 'exists', width: 7, height: 10 }, 'target-out-of-bounds']]) test('T20 arrival revalidates frozen target resource: ' + reason, () => {
  const before = waiting(), result = B.confirmBlackoutArrival(before, F.observation({ targetMap: resource }));
  refusal(result, reason); assert.deepEqual(result.pending, before);
});
test('T20 cold resume refuses an existing host transfer and preserves ready/awaiting checkpoints', () => {
  for (const pending of [F.pending(), waiting()]) {
    const result = B.planBlackoutResume(pending, F.observation({ transferPending: true }));
    refusal(result, 'host-transfer-pending'); assert.deepEqual(result.pending, pending);
  }
});
test('T20 resume awaiting-arrival checks real arrival before asking to reserve again', () => {
  assert.deepEqual(B.planBlackoutResume(waiting(), F.observation()), { status: 'arrived', pending: null });
  const pending = waiting(), result = B.planBlackoutResume(pending, F.observation({ actual: F.center }));
  assert.deepEqual(result, { status: 'reserve', pending: waiting(), target: { mapId: 3, x: 7, y: 5, direction: 8 } });
  assert.deepEqual(pending, waiting());
  assert.deepEqual(B.planBlackoutResume(F.pending(), F.observation()), { status: 'reserve', pending: F.pending(), target: F.characterHome });
});
test('T20 retry after resource/reserve/perform failure has only the frozen transfer, no settlement replay', () => {
  const persisted = JSON.parse(JSON.stringify(waiting()));
  refusal(B.planBlackoutResume(persisted, F.observation({ targetMap: { status: 'unavailable' } })), 'map-unavailable');
  const retry = B.planBlackoutResume(persisted, F.observation({ actual: F.globalHome }));
  assert.deepEqual(Object.keys(retry).sort(), ['pending', 'status', 'target']);
  assert.deepEqual(retry.target, { mapId: 3, x: 7, y: 5, direction: 8 });
  assert.equal(retry.pending.stage, 'awaiting-arrival');
  assert.deepEqual(B.markBlackoutReserved(retry.pending, 'return-17'), { status: 'duplicate', pending: waiting() });
});
test('T20 checkpoints reject impossible/unknown phases, origin mixing, runtime fields and accessors', () => {
  let getterCalls = 0;
  const getter = F.pending(); Object.defineProperty(getter, 'target', { enumerable: true, get() { getterCalls++; return F.characterHome; } });
  for (const invalid of [null, F.pending({ stage: 'completed' }), F.pending({ branch: 'no-home' }), F.pending({ target: null }),
    F.pending({ origin: { ...F.field, rawHash: F.battle.rawHash } }), F.pending({ id: '' }), F.pending({ token: 'not-persistent' }),
    F.pending({ generation: 4 }), F.pending({ lock: true }), F.pending({ callback: () => {} }), getter]) {
    refusal(B.markBlackoutReserved(invalid, 'return-17'), 'invalid-checkpoint');
    refusal(B.confirmBlackoutArrival(invalid, F.observation()), 'invalid-checkpoint');
    refusal(B.planBlackoutResume(invalid, F.observation()), 'invalid-checkpoint');
  }
  assert.equal(getterCalls, 0);
});
test('pure return planning/checkpoints consume no RNG or clock and mutate no world state', () => {
  const originalRandom = Math.random, originalNow = Date.now, input = F.input({ characterHome: F.characterHome });
  const worldBefore = structuredClone(input.world);
  try {
    Math.random = () => { throw new Error('unexpected random consumer'); }; Date.now = () => { throw new Error('unexpected clock consumer'); };
    const result = plan(input), ready = B.createBlackoutCheckpoint('return-17', result), reserved = B.markBlackoutReserved(ready.pending, 'return-17');
    assert.equal(B.confirmBlackoutArrival(reserved.pending, F.observation()).status, 'arrived');
    assert.equal(B.planBlackoutResume(reserved.pending, F.observation({ actual: F.center })).status, 'reserve');
    assert.deepEqual(input.world, worldBefore);
  } finally { Math.random = originalRandom; Date.now = originalNow; }
});
