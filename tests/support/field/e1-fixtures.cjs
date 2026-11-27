'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
function rules(name, file) {
  if (process.env.PF55_E1_RULES_DIR) return require(path.join(process.env.PF55_E1_RULES_DIR, file + '.cjs'));
  const core = require('../../../js/engine/build/core.cjs');
  assert(core[name], 'missing integrated core export ' + name);
  return core[name];
}
const fishing = rules('fishing', 'fishing');
function fishingHarness(options = {}, tape = [[6, 0], [100, 0], [6, 0], [100, 0]]) {
  let now = 0, active = true;
  let state;
  const trace = [], effects = [];
  const random = n => {
    trace.push(n);
    const draw = tape[trace.length - 1];
    assert(draw, 'unexpected draw ' + trace.join(','));
    assert.equal(n, draw[0], 'draw domain at ' + trace.length);
    return draw[1];
  };
  const accept = result => { state = result.state; effects.push(...result.effects); return result; };
  accept(fishing.startFishing({ rod: 1, allowBite: true, accelerated: false, autoHook: false, surfing: false, ...options }, { monotonicMs: now, active }));
  function step(input = {}) {
    now += input.ms ?? 0;
    active = input.active ?? active;
    return accept(fishing.advanceFishing(state, { sample: { monotonicMs: now, active }, confirm: input.confirm, cancel: input.cancel,
      effect: input.effect, interrupt: input.interrupt }, random));
  }
  function ack(status = 'completed', input = {}) {
    assert(state.pending, 'expected pending effect');
    return step({ ...input, effect: { id: state.pending.id, status } });
  }
  function waiting() { ack(); ack(); ack(); assert.equal(state.phase, 'waiting'); assert.equal(state.pending, null); }
  function waited() {
    for (let i = 0; state.phase === 'waiting' && i < 30; i++) state.pending ? ack() : step({ ms: 400 });
    assert.notEqual(state.phase, 'waiting');
  }
  function window() { waiting(); waited(); assert.equal(state.pending.kind, 'exclamation'); ack(); ack(); assert.equal(state.phase, 'bite-window'); }
  function finish() { for (let i = 0; state.pending && i < 12; i++) ack(); assert.equal(state.phase, 'done'); return state.completion; }
  return { get state() { return state; }, get now() { return now; }, trace, effects, step, ack, waiting, waited, window, finish };
}
function item(id, overrides = {}) {
  return { id, name: id, namePlural: id, pocket: 8, order: 0, price: 0, sellPrice: 0, flags: [], fieldUse: 'none', battleUse: 'none',
    legacyIds: [], consumable: true, source: 'synthetic-e1', ...overrides };
}
function inventory(...rows) {
  return { pockets: [[], [], [], [], [], [], [], rows.map(([itemId, quantity]) => ({ itemId, quantity }))], lastPocket: 1, indices: Array(8).fill(0), registeredItems: [] };
}
function member(id, moves, overrides = {}) {
  return { id, species: 'synthetic', level: 5, exp: 0, hp: 10, status: '', moves: moves.map(id => ({ id, pp: 0, maxpp: 10 })), item: '', ability: '', nature: 'Hardy', gender: 'N', ...overrides };
}
module.exports = { rules, fishing, fishingHarness, item, inventory, member };
