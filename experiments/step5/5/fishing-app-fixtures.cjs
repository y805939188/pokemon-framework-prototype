'use strict';
require('./regular-field-action-test-runtime.cjs').prepare('fishing-app');
const assert = require('node:assert/strict'), path = require('node:path');
assert(process.env.PF_FISHING_APP_OUT, 'PF_FISHING_APP_OUT is the private compiler output');
const out = process.env.PF_FISHING_APP_OUT;
const { FishingOperation } = require(process.env.PF_FISHING_OPERATION_BUNDLE || path.join(out, 'app/fishing-operation.js'));
const { newGame } = require(path.join(out, 'rules/state.js'));
const { newStats, bumpStat } = require(path.join(out, 'rules/stats.js'));
const { newWorldState } = require(path.join(out, 'rules/world-state.js'));
const { dexLayoutIdentity } = require(path.join(out, 'rules/dex-state.js'));
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const flush = () => new Promise(setImmediate);
const value = value => ({ status: 'value', value });
function fixture(options = {}) {
  const regionalDex = { national: [], regions: [] }; regionalDex.layoutIdentity = dexLayoutIdentity(regionalDex);
  const owner = {}, action = { kind: 'fishing', rod: options.rod ?? 1 }, content = { species: {}, regionalDex, settings: { FISHING_AUTO_HOOK: !!options.autoHook, ...options.settings } };
  let actualContent = content, generation = 1, activeOwner = owner, held = newGame({ party: [], content });
  held.party = options.accelerated ? [{ id: 'egg', isEgg: true, ability: 'Sticky Hold' }, { id: 'lead', isEgg: false, hp: 0, ability: 'Sticky Hold' }] : [];
  held.stats = newStats(); held.world = newWorldState(); held.world.surfing = !!options.surfing; held = freeze(held);
  let now = 0, active = true, send, pending = null, operation, disposed = 0, begins = 0, writes = 0, presentationConfig, installing = false, contentReadsDuringInstall = 0, checking = false, providerCalls = 0;
  const effects = [], advances = [], draws = [], installs = [], statRequests = [], guardProviderCalls = [];
  const facts = {
    facingFishable: value(true), currentExitPassable: value(true), facingEnvironment: value('stillwater'),
    business: { mapId: value(7), hour: value(21), cycling: value(false), diving: value(false), surfing: value(!!options.surfing),
      mapMetadata: value({ environment: 'cave' }), weather: value({ type: 'None', category: 'None', strength: 0, durationFrames: 0 }) },
  };
  if (options.facts) options.facts(facts);
  const context = () => ({ operation, effects, facts, state: held, content, owner, installing });
  const callback = fn => { assert.equal(checking, false, 'leaf final guard must not call a provider'); providerCalls++; fn?.(context()); };
  const parent = () => {
    callback(options.onAssert);
    if (activeOwner !== owner || generation !== 1) throw Error('stale-parent');
  };
  const readContent = () => { if (installing) contentReadsDuringInstall++; callback(options.onContent); };
  // Preserve the old three parent callbacks/two reads as adversarial preparation points for the
  // unchanged regression probes. Only the last plain-data capture is the new atomic observation.
  const prepare = () => {
    parent(); callback(options.onRead); parent();
    if (!installing) readContent();
    parent(); callback(options.onRead);
    options.beforeObservation?.(context());
  };
  const observe = () => ({ owner: activeOwner, generation,
    game: options.cloneReads ? clone(held) : held,
    content: options.cloneContentReads ? clone(actualContent) : actualContent });
  const session = {
    run(effect) {
      effects.push(effect);
      if ('id' in effect) pending = effect;
      options.onEffect?.(effect, context());
      if (options.throwEffect === effect.kind) throw Error('synthetic-' + effect.kind);
    },
    sample() { if (options.throwSample) throw Error('synthetic-clock'); return { monotonicMs: now, active }; },
    dispose() { disposed++; if (options.throwDispose) throw Error('synthetic-dispose'); },
  };
  operation = new FishingOperation({
    owner, generation: 1, action,
    observe() { assert.equal(checking, false, 'leaf final guard must not observe recursively'); prepare(); return observe(); },
    commitStat(key, guard) {
      assert(['fishing_count', 'fishing_battles'].includes(key)); assert.equal(typeof guard, 'function'); statRequests.push(key);
      installing = true;
      try {
        writes++; options.onInstall?.(writes, context());
        prepare();
        if (options.failInstall === writes) throw Error('synthetic-install');
        const actual = observe(), next = clone(actual.game); next.stats = bumpStat(next.stats, key);
        const beforeGuardCalls = providerCalls;
        checking = true;
        try { guard(actual); } finally { checking = false; guardProviderCalls.push(providerCalls - beforeGuardCalls); }
        installs.push(clone(next)); held = freeze(clone(next));
        return held;
      } finally { installing = false; }
    },
    facts() { options.onFacts?.(context()); return facts; },
    hasEncounterType(type) { assert(['OldRod', 'GoodRod', 'SuperRod'].includes(type)); options.onTable?.(context()); return !options.noTable; },
    host: { begin(candidate, receive, config) {
      begins++; assert.equal(candidate, owner); if (options.throwBegin) throw Error('synthetic-begin');
      presentationConfig = config;
      send = input => { advances.push(input); receive(input); }; return session;
    } },
    random(upper) { draws.push(upper); options.onRandom?.(context()); return options.random ? options.random(upper, draws.length) : 0; },
  });
  return {
    operation, owner, action, content, facts, effects, advances, draws, installs, statRequests, guardProviderCalls,
    get state() { return held; }, get pending() { return pending; }, get disposed() { return disposed; }, get begins() { return begins; },
    get presentationConfig() { return presentationConfig; },
    get contentReadsDuringInstall() { return contentReadsDuringInstall; },
    get providerCalls() { return providerCalls; },
    async start() { const promise = operation.run(); await flush(); return { promise }; },
    input(ms = 0, buttons = {}) { now += ms; if (buttons.active !== undefined) active = buttons.active; send({ sample: { monotonicMs: now, active }, confirm: buttons.confirm, cancel: buttons.cancel }); },
    raw(input) { send(input); },
    ack(status = 'completed', id = pending?.id) { assert(id, 'pending effect required'); const sample = { monotonicMs: now, active }; pending = null; send({ sample, effect: { id, status } }); },
    replaceOwner() { activeOwner = {}; }, replaceGeneration() { generation++; }, replaceContent(next) { actualContent = next; },
    actual(next) { actualContent = next; }, external(change) { const next = clone(held); change(next); held = freeze(next); },
    waiting() { this.ack(); this.ack(); this.ack(); },
    window() {
      this.waiting();
      for (let n = 0; n < 30 && (!pending || pending.kind === 'dots'); n++) { if (pending) this.ack(); else this.input(400); }
      assert.equal(pending.kind, 'exclamation'); this.ack(); assert.equal(pending.kind, 'bite-message'); this.ack();
    },
    finish() { for (let n = 0; pending && n < 12; n++) this.ack(); },
    flush,
  };
}
module.exports = { fixture, clone, flush, value };
