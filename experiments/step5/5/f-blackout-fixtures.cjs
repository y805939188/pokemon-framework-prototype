'use strict';
// Literal oracle derived from WP61 §7, FP17–20 and the approved 5.5 settlement integration.
const center = { mapId: 2, x: 3, y: 4, direction: 2 };
const characterHome = { mapId: 3, x: 7, y: 5, direction: 8 };
const globalHome = { mapId: 4, x: 6, y: 2, direction: 4 };
const field = { kind: 'field', sourceId: 'completed-step-17' };
const battle = { kind: 'battle', battleId: 'battle-19', rawHash: 'abcdef0123456789'.repeat(4) };
const map = { status: 'exists', width: 12, height: 10 };
const transferEffects = ['show-return-message', 'cancel-vehicles', 'clear-event-companions', 'set-starting-over',
  'set-transfer-target', 'get-off-vehicle', 'transfer-if-map-scene', 'request-map-refresh', 'clear-escape-point'];
const fieldSettlement = { owner: 'field', effects: ['count-blackout', 'heal-party'] };
const battleSettlement = { owner: 'battle', effects: [] };
const oracle = {
  field: {
    center: { settlement: fieldSettlement, effects: transferEffects, clearWorldFields: ['surfing', 'companions', 'escapePoint'] },
    home: { settlement: fieldSettlement, effects: transferEffects, clearWorldFields: ['surfing', 'companions', 'escapePoint'] },
    'no-home': { settlement: fieldSettlement, effects: ['show-return-message', 'heal-party', 'clear-escape-point'], clearWorldFields: ['escapePoint'] },
    'home-map-missing': { settlement: fieldSettlement, effects: ['debug-missing-home', 'heal-party'], clearWorldFields: [] },
  },
  battle: {
    center: { settlement: battleSettlement, effects: transferEffects, clearWorldFields: ['surfing', 'companions', 'escapePoint'] },
    home: { settlement: battleSettlement, effects: transferEffects, clearWorldFields: ['surfing', 'companions', 'escapePoint'] },
    'no-home': { settlement: battleSettlement, effects: ['show-return-message', 'clear-escape-point'], clearWorldFields: ['escapePoint'] },
    'home-map-missing': { settlement: battleSettlement, effects: ['debug-missing-home'], clearWorldFields: [] },
  },
};
function input(overrides = {}) {
  return { origin: structuredClone(field), world: { recentCenter: null }, characterHome: null, globalHome: null,
    mapResource: () => ({ ...map }), ...overrides };
}
function pending(overrides = {}) {
  return { id: 'return-17', origin: structuredClone(field), branch: 'home', target: { ...characterHome }, stage: 'ready', ...overrides };
}
function observation(overrides = {}) {
  return { returnId: 'return-17', actual: { ...characterHome }, transferPending: false, targetMap: { ...map }, ...overrides };
}
module.exports = { center, characterHome, globalHome, field, battle, map, oracle, input, pending, observation };
