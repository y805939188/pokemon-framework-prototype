'use strict';
require('./regular-field-action-test-runtime.cjs').prepare('fishing-composed');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const out = process.env.PF_FISHING_COMPOSED_OUT;
assert(out, 'PF_FISHING_COMPOSED_OUT is the private root compiler output');
const { FishingOperation } = require(process.env.PF_FISHING_OPERATION_BUNDLE || path.join(out, 'src/framework/app/fishing-operation.js'));
const { readFishingHostFacts } = require(path.join(out, 'src/plugins/world/fishing-host.js'));
const { composeFishingPresentation } = require(path.join(out, 'experiments/step5/5/fishing-composed-port.js'));
const { newGame } = require(path.join(out, 'src/framework/rules/state.js'));
const { dexLayoutIdentity } = require(path.join(out, 'src/framework/rules/dex-state.js'));
const { worldWeatherCategory } = require(path.join(out, 'src/framework/rules/world-data.js'));
const { bumpStat } = require(path.join(out, 'src/framework/rules/stats.js'));
const { runtime, nativeMessages, nativeMoveRoutes } = require('./fishing-host-fixtures.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const value = value => ({ status: 'value', value });
const flush = () => new Promise(setImmediate);
function install(root, source, constructor, names) {
  root[constructor] ??= function() {};
  for (const name of names) {
    const start = source.indexOf(constructor + '.prototype.' + name + ' = function'), end = source.indexOf('\n};', start);
    assert(start >= 0 && end > start, constructor + '.' + name);
    vm.runInContext(source.slice(start, end + 4), root, { filename: 'composed-installed-MZ:' + constructor + '.' + name });
  }
  return root[constructor].prototype;
}
function composed(options = {}) {
  const h = runtime(), ui = nativeMessages(h); nativeMoveRoutes(h);
  const objects = fs.readFileSync(process.env.PF_MZ_OBJECTS, 'utf8');
  const animation = install(h.root, objects, 'Game_CharacterBase', ['startAnimation', 'endAnimation', 'isAnimationPlaying']);
  for (const key of ['startAnimation', 'endAnimation', 'isAnimationPlaying']) h.player[key] = animation[key];
  h.player._animationPlaying = false;
  h.root.$gameTemp.requestAnimation = install(h.root, objects, 'Game_Temp', ['requestAnimation']).requestAnimation;
  let now = 0, owner = {}, generation = 1, current, session, pending = null, emit, settled;
  h.root.performance.now = () => now;
  const regionalDex = { national: [], regions: [] }; regionalDex.layoutIdentity = dexLayoutIdentity(regionalDex);
  const content = { species: {}, regionalDex, settings: { ...options.settings } };
  let actualContent = content, held = newGame({ party: [], content }); held.world.surfing = !!options.surfing;
  if (options.accelerated) held.party = [{ id: 'egg', isEgg: true, ability: 'Sticky Hold' }, { id: 'first', isEgg: false, hp: 0, ability: 'Sticky Hold' }];
  held = freeze(held);
  const effects = [], advances = [], installs = [], draws = [], sessions = [], configs = [], trace = [];
  const parentGuard = (candidate, expectedGeneration, expectedMap, expectedPlayer, expectedScene, expectedMapId) => {
    if (candidate !== owner || generation !== expectedGeneration || h.root.$gameMap !== expectedMap || h.root.$gamePlayer !== expectedPlayer ||
      h.root.SceneManager._scene !== expectedScene || expectedMap.mapId() !== expectedMapId) throw Error('stale-composed-parent');
  };
  const create = (extra = {}) => {
    const owned = owner, issuedGeneration = generation, map = h.root.$gameMap, player = h.root.$gamePlayer, scene = h.root.SceneManager._scene, id = map.mapId();
    const guard = () => parentGuard(owned, issuedGeneration, map, player, scene, id);
    const realPort = composeFishingPresentation(h.root, h.input, candidate => { assert.equal(candidate, owned); guard(); }, {
      characters:h.characterHost,
    session(actual) { session = actual; sessions.push(actual); },
      effect(effect) { effects.push(effect); trace.push('effect:' + effect.kind); if ('id' in effect) pending = effect; else if (effect.kind === 'finished') pending = null; },
      advance(advance) { advances.push(advance); if (advance.effect && pending?.id === advance.effect.id) pending = null; },
    });
    const observation = () => ({ owner, generation, game: held, content: actualContent });
    current = new FishingOperation({ owner: owned, generation: issuedGeneration, action: { kind: 'fishing', rod: extra.rod ?? options.rod ?? 1 },
      observe() { guard(); return observation(); },
      commitStat(key, check) {
        options.beforeCommit?.(key);
        guard();
        // All reentrant host/lifetime checks are complete. The final leaf check and install use
        // actual joint parent facts and contain no port calls or host callbacks.
        const actual = observation(), next = clone(actual.game); next.stats = bumpStat(next.stats, key);
        check(actual); held = freeze(next); installs.push(clone(next)); trace.push('install:' + next.stats.fishing_count + ':' + next.stats.fishing_battles);
        return held;
      },
      facts() {
        guard(); const facing = readFishingHostFacts(h.root, tag => ({ fishable: options.fishable !== false && tag === 7, environment: 'stillwater' }), () => held.world.surfing);
        return { ...facing, business: { mapId: value(h.root.$gameMap.mapId()), hour: value(options.hour ?? 21), cycling: value(false), diving: value(false),
          surfing: value(held.world.surfing), mapMetadata: value({ environment: 'cave' }), weather: value({ ...clone(held.world.weather), category: worldWeatherCategory(held.world.weather.type) }) } };
      },
      hasEncounterType(type) { guard(); trace.push('table:' + type); return !options.noTable; },
      host: { begin(candidate, receive, config) { configs.push(config); emit = receive; return realPort.begin(candidate, receive, config); } },
      random(upper) { guard(); draws.push(upper); trace.push('random:' + upper); return options.random ? options.random(upper, draws.length) : 0; },
    });
    settled = undefined;
    return current;
  };
  create();
  return {
    h, ui, content, effects, advances, installs, draws, sessions, configs, trace,
    get operation() { return current; }, get session() { return session; }, get pending() { return pending; }, get state() { return held; }, get now() { return now; }, get settled() { return settled; },
    async start() { const operation = current, promise = operation.run(); promise.then(outcome => { settled = outcome; }); await flush(); return { operation, promise }; },
    next(extra) { owner = {}; generation++; return create(extra); },
    replaceOwner() { owner = {}; }, replaceGeneration() { generation++; },
    replaceContent(next) { actualContent = next; }, external(change) { const next = clone(held); change(next); held = freeze(next); },
    tick(ms = 0, keys = []) { now += ms; h.root.Graphics.frameCount++; h.root.Input.keys = new Set(keys); session.update(); },
    routeTick() { const player = h.root.$gamePlayer; if (player.isMoveRouteForcing?.()) player.updateRoutineMove(); },
    fire(kind, ms = 0) { now += ms; h.fire(kind); },
    input(kind, code) { h.key(kind, code); },
    closeMessage() { h.window.terminateMessage(); },
    endAnimation() { h.player.endAnimation(); h.root.$gameTemp._animationQueue.length = 0; },
    inject(advance) { emit(advance); },
    event(id, list) { h.root.$dataCommonEvents[id] = vm.runInContext('(' + JSON.stringify({ list }) + ')', h.root); },
    waiting() {
      this.tick(200); assert.equal(pending?.kind, 'open-message'); this.closeMessage(); this.tick(); assert.equal(pending?.kind, 'dots');
      this.closeMessage(); this.tick(); assert.equal(pending, null);
    },
    window() {
      this.waiting();
      for (let n = 0; n < 30 && (!pending || pending.kind === 'dots'); n++) { if (pending) { this.closeMessage(); this.tick(); } else this.tick(400); }
      assert.equal(pending?.kind, 'exclamation'); this.endAnimation(); this.tick(); assert.equal(pending?.kind, 'bite-message'); this.closeMessage(); this.tick(); assert.equal(pending, null);
    },
    finish() {
      for (let n = 0; pending && n < 16; n++) {
        if (['open-message', 'dots', 'bite-message', 'result-message'].includes(pending.kind)) this.closeMessage();
        if (pending.kind === 'exclamation') this.endAnimation();
        this.tick(200);
      }
      assert.equal(pending, null);
    },
    flush,
  };
}
const command = (code, parameters = []) => ({ code, indent: 0, parameters });
module.exports = { composed, command, flush };
