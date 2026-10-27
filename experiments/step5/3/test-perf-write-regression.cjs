'use strict';
// Deterministic write-cost guards: no wall-clock budget and no source-string checks.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path');
const E = require(path.resolve(__dirname, '../../../js/engine/build/engine.cjs'));
const clone = value => JSON.parse(JSON.stringify(value));

function fullWorld() {
  const full = clone(E.fixtures.makeGame()); full.party = full.party.slice(0, 1);
  const member = full.party[0]; let serial = 0;
  for (const box of full.storage.boxes) for (let i = 0; i < box.slots.length; i++) {
    box.slots[i] = { ...clone(member), id: 'SCALE-' + (serial++) };
  }
  const content = clone(E.fixtures.content), state = E.fakes.createMemoryState(full);
  const app = new E.app.GameApplication({ state, sessions: E.fakes.createFakeSessions({}), projection: E.fakes.createRecordingProjection(), content: () => ({ content }), random: () => 0, clock: () => 0 });
  const members = full.party.length + full.storage.boxes.reduce((n, box) => n + box.slots.filter(Boolean).length, 0);
  return { app, state, content, members };
}

function measure(chain) {
  const w = fullWorld(), counts = { memberDescriptorScans: 0, moveDirectoryValues: 0, stateJsonStringifyCalls: 0 };
  const descriptors = Object.getOwnPropertyDescriptors, values = Object.values, stringify = JSON.stringify;
  const isState = value => !!value && typeof value === 'object' && !Array.isArray(value) && value.schema === 7 && Array.isArray(value.party) && !!value.storage && Array.isArray(value.storage.boxes);
  try {
    Object.getOwnPropertyDescriptors = function(value) {
      const result = descriptors.call(this, value);
      if (result && Object.hasOwn(result, 'species') && Object.hasOwn(result, 'moves') && Object.hasOwn(result, 'evolutionReadiness')) counts.memberDescriptorScans++;
      return result;
    };
    Object.values = function(value) { if (value === w.content.moves) counts.moveDirectoryValues++; return values.call(this, value); };
    JSON.stringify = function(value, ...rest) {
      const result = stringify.call(this, value, ...rest);
      if (isState(value) && result !== undefined) counts.stateJsonStringifyCalls++;
      return result;
    };
    const outcome = chain === 'steps' ? w.app.recordSteps(1) : w.app.updatePokedex({ kind: 'view', value: { cursor: 1 } });
    assert.ok(['counted', 'applied', 'unchanged'].includes(outcome.status), JSON.stringify(outcome));
  } finally {
    Object.getOwnPropertyDescriptors = descriptors; Object.values = values; JSON.stringify = stringify;
  }
  return { ...counts, members: w.members };
}

test('P2-1 recordSteps keeps one strong gate without a second member view copy or per-member move directory scans', () => {
  const result = measure('steps'), violations = [];
  assert.equal(result.members, 1201);
  if (result.memberDescriptorScans > 2 * result.members) violations.push(`memberDescriptorScans=${result.memberDescriptorScans}`);
  if (result.moveDirectoryValues > 1) violations.push(`moveDirectoryValues=${result.moveDirectoryValues}`);
  assert.deepEqual(violations, [], JSON.stringify(result));
});

test('P2-1 dex view preserves both strong gates and bounds private snapshot canonicalization', () => {
  const result = measure('dex'), violations = [];
  assert.equal(result.members, 1201);
  if (result.memberDescriptorScans > 4 * result.members) violations.push(`memberDescriptorScans=${result.memberDescriptorScans}`);
  if (result.moveDirectoryValues > 2) violations.push(`moveDirectoryValues=${result.moveDirectoryValues}`);
  if (result.stateJsonStringifyCalls > 12) violations.push(`stateJsonStringifyCalls=${result.stateJsonStringifyCalls}`);
  assert.deepEqual(violations, [], JSON.stringify(result));
});

function rawWorld() {
  let state = clone(E.fixtures.makeGame()); state.party = state.party.slice(0, 1);
  const content = clone(E.fixtures.content); let writes = 0;
  const app = new E.app.GameApplication({
    state: { read: () => state, replace: next => { writes++; state = clone(next); } },
    sessions: E.fakes.createFakeSessions({}), projection: E.fakes.createRecordingProjection(),
    content: () => ({ content }), random: () => 0, clock: () => 0,
  });
  return { app, content, state: () => state, writes: () => writes };
}

test('P2-1 a same-object in-place content edit is not hidden by an identity cache', () => {
  const w = rawWorld();
  assert.equal(w.app.recordSteps(1).status, 'counted'); assert.equal(w.writes(), 1);
  const id = w.state().party[0].moves[0].id, move = Object.values(w.content.moves).find(value => value.id === id);
  assert(move); move.pp++;
  const before = clone(w.state()), outcome = w.app.recordSteps(1);
  assert.equal(outcome.status, 'refused'); assert.equal(outcome.reason, 'commit-failed');
  assert.equal(w.writes(), 1); assert.deepEqual(w.state(), before);
});

test('P2-1 an externally aliased member damaged in place is rejected with zero replacement', () => {
  const w = rawWorld();
  w.state().party[0].ability = 'missing-from-the-content';
  const before = clone(w.state()), outcome = w.app.recordSteps(1);
  assert.equal(outcome.status, 'refused'); assert.equal(outcome.reason, 'commit-failed');
  assert.equal(w.writes(), 0); assert.deepEqual(w.state(), before);
});

test('P2-1 step writes reject member accessors and JSON hooks without executing them', () => {
  for (const kind of ['accessor', 'toJSON', 'prototype']) {
    const w = rawWorld(), original = w.state(), member = original.party[0]; let calls = 0;
    if (kind === 'accessor') Object.defineProperty(member, 'nickname', { get() { calls++; return null; }, enumerable: true, configurable: true });
    if (kind === 'toJSON') Object.defineProperty(member, 'toJSON', { value() { calls++; return null; }, enumerable: true, configurable: true });
    if (kind === 'prototype') {
      const proto = Object.create(null); Object.defineProperty(proto, 'cannotTrade', { get() { calls++; return true; }, configurable: true });
      delete member.cannotTrade; Object.setPrototypeOf(member, proto);
    }
    const outcome = w.app.recordSteps(1);
    assert.equal(outcome.status, 'refused', kind); assert.equal(outcome.reason, 'commit-failed', kind);
    assert.equal(w.writes(), 0, kind); assert.equal(calls, 0, kind); assert.equal(w.state(), original, kind);
  }
});

test('P2-1 local item negatives remain per-member errors and duplicate move ids keep first base PP', () => {
  const w = rawWorld(), state = w.state();
  state.party[0].item = 'missing-item';
  state.storage.boxes[0].slots[0] = { ...clone(state.party[0]), id: 'OTHER-1' };
  const problems = E.saveSchema.validateGameContent(state, w.content);
  assert.deepEqual(problems.filter(p => p.path.endsWith('.item')).map(p => p.path), ['$.party[0].item', '$.storage.boxes[0].slots[0].item']);

  const good = rawWorld(), member = good.state().party[0], id = member.moves[0].id;
  const first = Object.values(good.content.moves).find(value => value.id === id);
  good.content.moves.Duplicate = { ...first, pp: first.pp + 1 };
  assert.deepEqual(E.saveSchema.validateGameContent(good.state(), good.content), []);
});
