'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {E, world, clone} = require('./contracts/fixtures.cjs');
const vectors = require('./contracts/field-potion-vectors.json');

for (const vector of vectors.cases) test('PV01 shared field Potion vector: ' + vector.id, () => {
  const w = world(), initial = clone(w.state.read());
  initial.party[0].hp = vector.fainted ? 0 : initial.party[0].hp - vector.missingHp;
  w.state.replace(initial); w.state.replaced.length = 0;
  const before = clone(w.state.read()), expected = vector.expected;
  const intent = {itemId: 'potion', quantity: vector.quantity, memberId: 'P1'};
  let plan;
  try { plan = E.itemEffects.planItemUse(before, w.content, intent, vector.answers, {mapId: 5}); }
  catch (error) { plan = {status: 'refused', reason: error.reason}; }
  assert.equal(plan.status, expected.plan);
  if (expected.reason) assert.equal(plan.reason, expected.reason);
  assert.deepEqual(w.state.read(), before, 'pure planning never writes the state port');
  assert.deepEqual(before, initial, 'pure planning never mutates its input');
  const token = w.app.beginInventoryOperation();
  const request = {kind: 'use-item', ...intent, ...(vector.answers ? {answers: vector.answers} : {})};
  const result = w.app.inventoryRequest(token, vector.id, request);
  assert.equal(result.status, expected.application, JSON.stringify(result));
  if (expected.reason) assert.equal(result.reason, expected.reason);
  const after = w.state.read();
  assert.equal(after.party[0].hp - before.party[0].hp, expected.hpGain);
  assert.equal(E.inventory.itemQuantity(before.inventory, 'potion', w.content.items) - E.inventory.itemQuantity(after.inventory, 'potion', w.content.items), expected.spent);
  if (plan.status === 'ready') {
    assert.deepEqual(after, plan.state, 'application installs the same pure plan');
    assert.equal(w.app.inventoryRequest(token, vector.id, request).status, 'duplicate');
  } else assert.deepEqual(after, before);
  assert.equal(w.state.replaced.length, expected.spent ? 1 : 0);
  assert.equal(w.app.endInventoryOperation(token).status, 'unchanged');
});
