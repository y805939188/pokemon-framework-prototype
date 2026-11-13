'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {E, world, clone} = require('./contracts/fixtures.cjs');

test('AC01 an old real battle completion cannot read its result or disturb a new management inventory child after host replacement', async () => {
  const w = world(), session = await w.app.startBattle(w.request);
  assert.equal((await session.run()).ok, true);
  const generation = w.app.stateGeneration;
  const loaded = clone(w.state.read()); loaded.money = 4321;
  w.state.replace(loaded); w.app.stateReplacedByHost();
  assert.equal(w.app.stateGeneration, generation + 1);
  const parent = w.app.beginManagement(), child = w.app.beginInventoryOperation('item', {token: parent, memberId: 'P1'});
  const before = clone(w.state.read()), writes = w.state.replaced.length, projections = w.projection.outcomes.length;
  let reads = 0; session.result = () => {reads++; throw Error('old producer must not run');};
  const refused = w.app.finishBattle(session, w.request);
  assert.equal(refused.commit, 'none'); assert.equal(refused.aborted, true);
  assert.match(refused.error, /game state was replaced/);
  assert.equal(reads, 0); assert.equal(w.projection.outcomes.length, projections);
  assert.deepEqual(w.state.read(), before); assert.equal(w.state.replaced.length, writes);
  assert.equal(w.app.saveBlocked, true); assert.equal(w.app.endManagement(parent).reason, 'child-operation-active');
  assert.equal(w.app.queryInventoryItemQuantity(child, 'potion'), 3, 'current child remains usable');
  assert.equal(w.app.endInventoryOperation(child).status, 'unchanged');
  assert.equal(w.app.saveBlocked, false); assert.equal(w.app.endManagement(parent).status, 'unchanged');
});

test('AC02 old inventory cleanup cannot release a later management learning child; invalid parent refusal leaves the current lease intact', () => {
  const w = world(), oldParent = w.app.beginManagement();
  const oldChild = w.app.beginInventoryOperation('item', {token: oldParent, memberId: 'P1'});
  w.app.stateReplacedByHost();
  const parent = w.app.beginManagement(), before = clone(w.state.read());
  const invalid = w.app.beginLearning({kind: 'forget', memberId: 'P1'}, {kind: 'management', token: oldParent});
  assert.equal(invalid.status, 'refused'); assert.equal(invalid.reason, 'stale-operation');
  assert.equal(w.app.pendingLearning, null); assert.equal(w.app.saveBlocked, false);
  const started = w.app.beginLearning({kind: 'forget', memberId: 'P1'}, {kind: 'management', token: parent});
  assert.equal(started.status, 'pending');
  const owner = clone(w.app.pendingLearning);
  assert.equal(w.app.endInventoryOperation(oldChild).reason, 'stale-operation');
  assert.equal(w.app.endManagement(oldParent).status, 'refused');
  assert.deepEqual(w.app.pendingLearning, owner); assert.equal(w.app.saveBlocked, true);
  assert.equal(w.app.endManagement(parent).reason, 'child-operation-active');
  assert.equal(w.app.resolveLearning(owner.token, owner.revision, {kind: 'technical-terminate'}).status, 'technically-terminated');
  assert.equal(w.app.saveBlocked, false); assert.equal(w.app.endManagement(parent).status, 'unchanged');
  assert.deepEqual(w.state.read(), before); assert.equal(w.state.replaced.length, 0);
});

test('AC03 new game is an explicit generation change that retires a learning child rather than a routine conflicting write', () => {
  const w = world(), parent = w.app.beginManagement();
  assert.equal(w.app.beginLearning({kind: 'forget', memberId: 'P1'}, {kind: 'management', token: parent}).status, 'pending');
  const owner = clone(w.app.pendingLearning), generation = w.app.stateGeneration;
  assert.equal(w.app.healParty().status, 'refused'); assert.equal(w.app.claimGrant('starter').status, 'refused');
  assert.equal(w.app.saveBlocked, true);
  assert.equal(w.app.startNewGame().status, 'started');
  assert.equal(w.app.stateGeneration, generation + 1); assert.equal(w.app.pendingLearning, null);
  const newParent = w.app.beginManagement(), before = clone(w.state.read());
  assert.equal(w.app.resolveLearning(owner.token, owner.revision, {kind: 'forget', slot: 0}).status, 'refused');
  assert.equal(w.app.endManagement(parent).reason, 'stale-operation');
  assert.deepEqual(w.state.read(), before); assert.equal(w.state.replaced.length, 1);
  assert.equal(w.app.endManagement(newParent).status, 'unchanged'); assert.equal(w.app.saveBlocked, false);
});
