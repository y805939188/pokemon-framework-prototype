'use strict';
// Independent WP36 arithmetic; no production imports and no observations used as expected values.
const assert = require('node:assert/strict');
const clone = value => structuredClone(value);
function initial() { return { graceSteps: 0, accumulator: 0, currentMapId: null, loadedVersion: null }; }
function transition(before, action) {
  const runtime = clone(before), draws = [];
  const draw = n => { const row = action.tape[draws.length]; assert(row, 'oracle tape exhausted'); assert.equal(row.n, n); assert(Number.isSafeInteger(row.value) && row.value >= 0 && row.value < n); draws.push(clone(row)); return row.value; };
  let reason = null;
  if (action.kind === 'enter') {
    if (action.cause === 'transfer' && action.previousMapId === action.mapId) reason = 'unchanged';
    else {
      runtime.graceSteps = 0;
      if (action.cause === 'new-game' || action.cause === 'load') runtime.accumulator = 0;
      runtime.currentMapId = action.mapId; runtime.loadedVersion = action.version;
      if (action.weatherDraw) draw(100);
      reason = 'committed';
    }
  } else if (action.kind === 'step') {
    // All fixture leads are healthy, neutral, level5, no egg/item/ability modifiers; no cycling.
    const chance = action.base + Math.floor(runtime.accumulator / 200);
    const minimum = Math.max(0, Math.min(8, 8 - action.base / 10));
    if (runtime.graceSteps < minimum) {
      runtime.graceSteps++;
      if (draw(100) >= chance * 5 / (action.base + Math.floor(runtime.accumulator / 200))) reason = 'grace';
    }
    if (reason === null && draw(100) >= chance) { runtime.accumulator = action.repelActive ? 0 : runtime.accumulator + action.base; reason = 'miss'; }
    if (reason === null) {
      draw(100); draw(1); // one weight100 slot, singleton level interval
      if (action.repelActive && 5 > action.level) { runtime.accumulator = 0; reason = 'repel'; }
      else {
        draw(65536); draw(65536); for (let i = 0; i < 6; i++) draw(32);
        runtime.graceSteps = 0; runtime.accumulator = 0; reason = 'battle-admitted';
      }
    }
  } else if (action.kind === 'version') {
    reason = action.version === action.beforeVersion ? 'unchanged' : 'committed';
    if (reason === 'committed' && runtime.currentMapId !== null) { runtime.graceSteps = 0; runtime.loadedVersion = action.version; }
  } else if (action.kind === 'event-start' || action.kind === 'surf-start' || action.kind === 'surf-end') {
    if (action.kind === 'event-start') { draw(65536); draw(65536); for (let i = 0; i < 6; i++) draw(32); }
    runtime.graceSteps = 0; runtime.accumulator = 0; reason = 'completed';
  } else if (action.kind === 'session-start') reason = 'started';
  else if (action.kind === 'session-finish') reason = 'applied';
  else if (action.kind === 'duplicate-step') reason = 'battle-admitted';
  else if (action.kind === 'repel-item') reason = 'completed';
  else if (action.kind === 'surf-start-cleanup' || action.kind === 'surf-land') reason = 'completed';
  else throw Error('unknown oracle action ' + action.kind);
  assert.equal(draws.length, action.tape.length, 'oracle unused tape: ' + action.id);
  return { runtime, reason, draws };
}
module.exports = { initial, transition };
