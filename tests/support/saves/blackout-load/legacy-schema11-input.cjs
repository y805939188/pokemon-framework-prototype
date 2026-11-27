'use strict';
const assert = require('node:assert/strict');

// Use the real StorageManager codec on the worker's private producer copy.
// DataManager.saveGame is the current writer, so it must never generate this input.
async function prepareSchema11Slot(storage, slot, packed) {
  const blob = packed.system._psGame;
  assert.equal(blob.encoding, 'pokemon-framework-json');
  const state = JSON.parse(blob.data);
  assert.equal(state.schema, 12);
  assert(Object.hasOwn(state, 'hallOfFame'));
  state.schema = 11;
  delete state.hallOfFame;
  blob.data = JSON.stringify(state);
  await storage.saveObject(slot, packed);
  const readback = await storage.loadObject(slot);
  assert.deepEqual(JSON.parse(readback.system._psGame.data), state);
  return state;
}

module.exports = {prepareSchema11Slot};
