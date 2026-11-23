'use strict';
require('./regular-field-action-test-runtime.cjs').prepare('fishing');
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), vm = require('node:vm'), { types } = require('node:util');
const out = process.env.PF_E1_PARENT_OUT;
assert(out, 'PF_E1_PARENT_OUT required');
const load = file => require(path.join(out, 'src', file));
const { GameApplication } = process.env.PF_E1_PARENT_ENGINE ? require(process.env.PF_E1_PARENT_ENGINE).app : load('framework/app/game-application.js');
const { createMZAtomicStatePort } = load('plugins/world/atomic-state-mz.js');
const { readFishingHostFacts } = load('plugins/world/fishing-host.js');
const { composeFishingPresentation } = require(path.join(out, 'experiments/step5/5/fishing-composed-port.js'));
const { runtime, nativeMessages, nativeMoveRoutes } = require('./fishing-host-fixtures.cjs');
const F = require('../3/fixtures-migration7/fixtures.cjs');
const E = { itemCatalog: load('framework/rules/item-catalog.js'), state: load('framework/rules/state.js') };
const clone = value => structuredClone(value), value = value => ({ status: 'value', value }), flush = () => new Promise(setImmediate);
function fixture(options = {}) {
  const h = runtime(), ui = nativeMessages(h); nativeMoveRoutes(h);
  if (options.shortcutRead) {
    // Model the native own coordinate slots for the UI's captured source identity.
    h.player._x = h.player.x; h.player._y = h.player.y;
    for (const key of ['x', 'y']) Object.defineProperty(h.player, key, { configurable: true, get() { return this['_' + key]; }, set(value) { this['_' + key] = value; } });
  }
  // Use MZ's actual own-data map slot. The id alias keeps the shared host probes unchanged.
  h.root.$gameMap._mapId = 7;
  Object.defineProperty(h.root.$gameMap, 'id', { configurable: true, get() { return this._mapId; }, set(value) { this._mapId = value; } });
  const objects = fs.readFileSync(process.env.PF_MZ_OBJECTS, 'utf8');
  function install(constructor, names) {
    h.root[constructor] ??= function() {};
    for (const name of names) {
      const start = objects.indexOf(constructor + '.prototype.' + name + ' = function'), end = objects.indexOf('\n};', start);
      assert(start >= 0 && end > start); vm.runInContext(objects.slice(start, end + 4), h.root);
    }
    return h.root[constructor].prototype;
  }
  const animation = install('Game_CharacterBase', ['startAnimation', 'endAnimation', 'isAnimationPlaying']);
  for (const key of ['startAnimation', 'endAnimation', 'isAnimationPlaying']) h.player[key] = animation[key];
  h.player._animationPlaying = false;
  h.root.$gameTemp.requestAnimation = install('Game_Temp', ['requestAnimation']).requestAnimation;
  let now = 0, app, token, session, pending, send, contentView, installing = false, statAttempts = 0, atomicDepth = 0, inFinish = false, settled;
  const content = options.content ?? F.content(E); if (!options.content) content.settings = { ...options.settings };
  if (!options.content) content.mapMetadata = { source: 'fixture', maps: { 7: { environment: 'cave' }, 8: { weather: { type: 'Rain', chance: 100 }, healingSpot: { mapId: 8, x: 1, y: 1 } } } };
  if (!options.content) content.world = { encounters: { source: 'fixture', tables: [{ mapId: 7, version: 0, types: options.noTable ? {} : Object.fromEntries(['OldRod', 'GoodRod', 'SuperRod'].map(type => [type, { stepChance: 0, slots: [{ species: 'A', minLevel: 5, maxLevel: 5, weight: 100 }] }])) }] } };
  options.editContent?.(content); contentView = content;
  h.root.$gameSystem = { _psGame: E.state.newGame({ content, party: options.party ?? [], bag: { oldrod: 1, goodrod: 1, superrod: 1, ...options.bag }, money: 100 }) };
  options.editState?.(h.root.$gameSystem._psGame);
  const writes = [], effects = [], draws = [], advances = [], statCommits = [], trace = [], sessions = [];
  const state = () => h.root.$gameSystem._psGame;
  const context = () => ({ app, operation: { cancel: () => app.cancelFieldItemHandoff(token) }, state: state(), content, installing });
  const callback = fn => { assert.equal(inFinish, false, 'no provider in final atomic finisher'); fn?.(context()); };
  const legacy = { read() { callback(options.onRead); return state(); }, replace(next) { writes.push(next); h.root.$gameSystem._psGame = next; } };
  const loadedContent = { current: contentView };
  const native = createMZAtomicStatePort(h.root, legacy, types.isProxy, { owner: loadedContent, key: 'current' });
  // This wrapper only observes the pure result; all tested invalidations occur before native's final observation.
  const atomicWorld = prepare => native.atomicWorld(() => {
    atomicDepth++; const finish = prepare(); atomicDepth--;
    return game => {
      inFinish = true;
      try { const result = finish(game); if (result.next) { statCommits.push(result.next); trace.push('stat:' + result.next.stats.fishing_count + ':' + result.next.stats.fishing_battles); } return result; }
      finally { inFinish = false; }
    };
  });
  const real = composeFishingPresentation(h.root, h.input, owner => app.assertFishingOwner(owner), {
    characters:h.characterHost,
    session(actual) { session = actual; }, effect(effect) { effects.push(effect); pending = 'id' in effect ? effect : null; callback(options.onEffect && (() => options.onEffect(effect, context()))); },
    advance(advance) { advances.push(advance); if (advance.effect?.id === pending?.id) pending = null; },
  });
  h.root.performance.now = () => now;
  app = new GameApplication({wildGeneration:{switchOn:options.wildSwitch??(()=>({status:'value',value:false}))}, state: { ...legacy, ...(options.noAtomic ? {} : { atomicWorld, worldLifecycle: native.worldLifecycle, ...(options.shortcutRead ? { atomicFieldQuery: native.atomicFieldQuery } : {}) }) },
    content: () => { callback(options.onContent); return { content: loadedContent.current, dex: options.dex }; },
    projection: { project() {} }, sessions: options.sessionFactory ?? { async create(request, game, setup) { const handle = {}; sessions.push({ request, game, setup, handle }); return handle; } }, clock: () => options.clock ?? 1000,
    random(upper) { draws.push(upper); callback(options.onRandom); return options.random ? options.random(upper, draws.length) : 0; },
    worldHost: { read() { callback(options.onAssert); return { mapId: value(h.root.$gameMap.mapId()), hour: value(options.hour ?? 21), cycling: value(false), diving: value(false) }; } },
    fishing: { facts() { callback(options.onFacts); return readFishingHostFacts(h.root, tag => ({ fishable: options.fishable !== false && tag === 7, environment: 'stillwater' }), () => state().world.surfing); },
      presentation: { begin(owner, emit, config) { send = emit; callback(options.onBegin); return real.begin(owner, emit, config); } } },
  });
  // Probe the real child's stat-call entry; retain the complete production parent/native writer below it.
  const originalRun = app.world.runFishing.bind(app.world);
  app.world.runFishing = (owner, action) => {
    const result = originalRun(owner, action), child = owner.fishing;
    if (child) {
      const originalCommit = child.options.commitStat;
      child.options.commitStat = (key, guard) => {
        installing = true; statAttempts++;
        try { callback(options.onInstall && (() => options.onInstall(statAttempts, context()))); return originalCommit(key, guard); }
        finally { installing = false; }
      };
    }
    return result;
  };
  function prepare(rod = options.rod ?? 1) {
    const id = ['oldrod', 'goodrod', 'superrod'][rod - 1], inventory = app.beginInventoryOperation(), snapshot = app.inventorySnapshot(inventory);
    const pocket = snapshot.pockets.findIndex(rows => rows.some(row => row.item.id === id)); assert(pocket >= 0, id);
    const row = snapshot.pockets[pocket].find(row => row.item.id === id), ticket = app.inventoryTicket(inventory, pocket + 1, row.index);
    const outcome = app.prepareFieldItemHandoff(inventory, 'rod-' + (options.entry || 'bag'), ticket, options.entry || 'bag'); assert.equal(outcome.status, 'handoff');
    token = outcome.handoff.token; app.endInventoryOperation(inventory); return token;
  }
  const result = { h, ui, app, content, effects, draws, advances, writes, statCommits, trace,
    get state() { return state(); }, get token() { return token; }, get session() { return session; }, get pending() { return pending; }, get settled() { return settled; },
    sessions, get inAtomicPrepare() { return atomicDepth > 0; }, get installing() { return installing; },
    prepare, async start() { prepare(); const promise = app.runFieldItemHandoff(token); promise.then(value => { settled = value; }); await flush(); return { promise }; },
    input(ms = 0, buttons = {}) { now += ms; send({ sample: { monotonicMs: now, active: buttons.active ?? true }, confirm: buttons.confirm, cancel: buttons.cancel }); },
    inject: advance => send(advance), cancel: () => app.cancelFieldItemHandoff(token),
    external(change) { const next = clone(state()); change(next); h.root.$gameSystem._psGame = next; },
    actual(next) { loadedContent.current = next; }, replaceOwner() { app.world.owner = null; }, replaceGeneration() { app.stateReplacedByHost(); },
    tick(ms = 0) { now += ms; h.root.Graphics.frameCount++; session?.update(); },
    routeTick() { if (h.player.isMoveRouteForcing?.()) h.player.updateRoutineMove(); },
    closeMessage() { h.window.terminateMessage(); }, endAnimation() { h.player.endAnimation(); h.root.$gameTemp._animationQueue.length = 0; },
    waiting() { this.tick(200); assert.equal(pending?.kind, 'open-message'); this.closeMessage(); this.tick(); assert.equal(pending?.kind, 'dots'); this.closeMessage(); this.tick(); },
    window() { this.waiting(); for (let n = 0; n < 30 && (!pending || pending.kind === 'dots'); n++) { if (pending) { this.closeMessage(); this.tick(); } else this.tick(400); } assert.equal(pending?.kind, 'exclamation'); this.endAnimation(); this.tick(); assert.equal(pending?.kind, 'bite-message'); this.closeMessage(); this.tick(); },
    finish() { for (let n = 0; pending && n < 20; n++) { if (['open-message','dots','bite-message','result-message'].includes(pending.kind)) this.closeMessage(); if (pending.kind === 'exclamation') this.endAnimation(); this.tick(200); } }, flush,
  };
  return result;
}
module.exports = { fixture, clone, flush };
