'use strict';
// Low-level scheduler/observer protocol controls. No full fixture, GameApplication,
// plugin IIFE, world-travel/F operation, save executor, qualification or builder.
require('./ts-source-loader.cjs');
// This source graph includes a constructor parameter property. Keep the shared
// resolver, but transform TS only inside this test's source tree instead of
// changing production syntax or the strip-only loader used by other suites.
const {register} = require('node:module');
const {pathToFileURL} = require('node:url');
const sourceRoot = pathToFileURL(require('node:path').resolve(__dirname, '../../src') + '/').href;
register(`data:text/javascript,${encodeURIComponent(`
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
export async function load(url, context, next) {
  if (url.startsWith(${JSON.stringify(sourceRoot)}) && url.endsWith('.ts')) return {
    format: 'module',
    source: stripTypeScriptTypes(await readFile(new URL(url), 'utf8'), {mode: 'transform', sourceUrl: url}),
    shortCircuit: true,
  };
  return next(url, context);
}
`)}`, pathToFileURL(__filename));
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {types} = require('node:util');
const {createNativeSceneManager, createNativeFrameTick} = require('../../tests/support/world/native-frame-manager-support.cjs');
const {observer} = require('../../tests/support/world/travel/native-consumer-observer.cjs');
const {assertCurrentCompanionBootstrap: check} = require('../../tests/support/world/scene-lifecycle/current-companion-bootstrap-support.cjs');
const root = path.resolve(__dirname, '../..');
const nativePath = path.join(path.dirname(process.env.PF_MZ_RUNTIME || path.join(root, 'js/reactor_objects.js')), 'reactor_managers.js');
const nativeSource = fs.readFileSync(nativePath, 'utf8');
const modules = Promise.all([
  import('../../src/plugins/world/event-companion-ingress-mz.ts'),
  import('../../src/plugins/world/travel-lease-registry-mz.ts'),
  import('../../src/plugins/world/world-travel-scene-mz.ts'),
  import('../../src/plugins/world/atomic-state-mz.ts')
]);
const flush = () => new Promise(setImmediate);
async function protocol({holdRestore = false} = {}) {
  const [{createCompanionIngressMZ}, {createNativeTravelLeaseRegistry, readNativeTravelLease},
    {installTravelSceneAllocation}, {createMZAtomicStatePort}] = await modules;
  const calls = {init: 0, restore: [], updates: 0, frames: 0}, pending = [], diagnostics = [];
  const G = vm.createContext({Graphics: {frameCount: 0}, $gameScreen: {_flashDuration: 0}});
  const manager = createNativeSceneManager(G, nativeSource), registry = createNativeTravelLeaseRegistry();
  const input = {trigger: new Set(), repeat: new Set()}, tick = createNativeFrameTick(G, manager, input);
  let ingress, ports;
  function MapScene() { this._started = false; this._active = false; this._mapLoaded = false; }
  Object.assign(MapScene.prototype, {
    create() {}, onMapLoaded() { this._mapLoaded = true; },
    isReady() { if (!this._mapLoaded) this.onMapLoaded(); return this._mapLoaded; },
    start() { this._started = true; this._active = true; },
    stop() { this._started = false; this._active = false; },
    terminate() {}, isStarted() { return this._started; }, isBusy() { return false; },
    update() { calls.updates++; G.PSFlow.companionNativeMapFrame(); ports.state.atomicWorldContent(() => () => ({value: null})); }
  });
  G.Scene_Map = MapScene;
  // A controlled App endpoint supplies scheduler settlements, not product proofs.
  // Every restore observes the real atomic native slot before its controlled Promise.
  const app = {stateGeneration: 1, saveBlocked: false, encounterBlocked: false,
    initializeBlackoutCompanions() { calls.init++; return Promise.resolve({status: 'completed'}); },
    restoreEventCompanionsAtMap(birth) {
      ports.state.atomicWorldContent(() => () => ({value: null})); calls.restore.push(birth);
      if (!holdRestore) return Promise.resolve({status: 'completed'});
      return new Promise(resolve => pending.push({birth, resolve}));
    },
    runWorldTravel() { throw Error('business forbidden'); }, confirmWorldTravelArrival() { throw Error('business forbidden'); },
    finishWorldTravelArrival() { throw Error('business forbidden'); }
  };
  const content = {marker: 'protocol-only'}, game = {world: {companions: [{name: 'nonempty-protocol-record'}], pendingReturn: null}};
  G.PSFlow = {_app: app, _content: content, companionNativeMapFrame() { calls.frames++; ingress.mapFrame(); },
    companionNativePending: () => ingress.pending(), worldAuthorInputPending: () => false};
  G.PSWorld = {pending: () => false};
  G.$gameSystem = {_psGame: game}; G.$gameMap = {_mapId: 5}; G.$dataMap = {};
  G.$gamePlayer = {_direction: 2, _transferring: false, _x: 1, _y: 1};
  manager._scene = new MapScene(); manager._scene.start();
  const publish = (scene, birth, queue, loaded) => registry.publishMapBirth({manager, scene, birth, queue,
    frame: loaded ? {map: G.$gameMap, mapId: G.$gameMap._mapId, player: G.$gamePlayer, data: G.$dataMap} : null});
  // Genuine native ctor/goto/create/readiness observations; no E3/F permit.
  installTravelSceneAllocation(G, {current: () => null, accepted() { throw Error('permit forbidden'); },
    invalidated() { throw Error('permit forbidden'); }, observation: {
      queued: (s,b,q) => publish(s,b,q,false), activated: (s,b,q) => publish(s,b,q,false),
      loaded: (s,b,q) => publish(s,b,q,true), ready() {}, invalid() { registry.publishMapBirth(null); }, lost() { registry.publishMapBirth(null); }
    }});
  const state = createMZAtomicStatePort(G, {read: () => G.$gameSystem._psGame, replace() { throw Error('write forbidden'); }},
    types.isProxy, {owner: G.PSFlow, key: '_content'}, registry.source);
  ports = {state, worldTravel: {nativeLeaseSource: registry.source}};
  const nativeConsumer = observer(); nativeConsumer.observePorts(ports); nativeConsumer.install(G, app);
  ingress = createCompanionIngressMZ({root: G, source: registry.source, isProxy: types.isProxy,
    application: () => G.PSFlow._app, runtime: () => null, loadPending: () => false, diagnostic: s => diagnostics.push(s)});
  const h = {G, app, manager, content, nativeConsumer};
  const frame = async () => { tick(); await flush(); };
  const settle = async () => { const entry = pending.shift(); assert(entry, 'one controlled restore settlement'); entry.resolve({status: 'completed'}); await flush(); return entry; };
  const enter = async () => { manager.goto(G.Scene_Map); await frame(); await frame(); if (!holdRestore) await frame(); };
  return {h, G, app, ports, registry, read: () => readNativeTravelLease(registry.source), calls, pending, diagnostics, frame, enter, settle};
}
function unchanged(x, action) {
  const lease = x.read(), next = x.h.manager._nextScene;
  const counts = {init: x.calls.init, restore: x.calls.restore.length, frames: x.G.Graphics.frameCount};
  action();
  assert.strictEqual(x.read(), lease, 'support cannot publish or clear registry');
  assert.strictEqual(x.h.manager._nextScene, next, 'support preserves queued successor');
  assert.deepEqual({init: x.calls.init, restore: x.calls.restore.length, frames: x.G.Graphics.frameCount}, counts,
    'support cannot initialize, restore, project or advance frames');
}
test('F bootstrap observes the completed current native birth without another goto or rebootstrap', async () => {
  const x = await protocol(); assert.throws(() => check(x.h, x.ports));
  await x.enter(); assert.equal(x.calls.init, 1); assert.equal(x.calls.restore.length, 1);
  const scene = x.h.manager._scene, birth = x.read().mapBirth.birth;
  unchanged(x, () => { check(x.h, x.ports); check(x.h, x.ports); });
  assert.strictEqual(x.h.manager._scene, scene); assert.strictEqual(x.read().mapBirth.birth, birth);
  assert.equal(x.G.$gameSystem._psGame.world.companions.length, 1, 'support preserves nonempty records');
  assert.equal(x.diagnostics.length, 0);
});
test('a new native Scene restores its new birth once and does not reinitialize the same generation', async () => {
  const x = await protocol(); await x.enter(); const old = x.read().mapBirth.birth;
  x.h.manager.goto(x.G.Scene_Map); const next = x.h.manager._nextScene;
  unchanged(x, () => assert.throws(() => check(x.h, x.ports)));
  await x.frame(); assert.throws(() => check(x.h, x.ports), /restore|bootstrap/);
  await x.frame(); check(x.h, x.ports);
  assert.strictEqual(x.h.manager._scene, next); assert.notStrictEqual(x.read().mapBirth.birth, old);
  assert.equal(x.calls.init, 1); assert.equal(x.calls.restore.length, 2);
});
test('a late completed old restore cannot satisfy or clear its queued successor', async () => {
  const x = await protocol({holdRestore: true}); await x.enter(); const old = x.pending[0].birth;
  x.h.manager.goto(x.G.Scene_Map); const successor = x.h.manager._nextScene;
  unchanged(x, () => assert.throws(() => check(x.h, x.ports)));
  await x.frame(); await x.frame(); assert.strictEqual(x.h.manager._scene, successor);
  assert.equal((await x.settle()).birth, old); unchanged(x, () => assert.throws(() => check(x.h, x.ports)));
  await x.frame(); assert.equal(x.calls.restore.length, 2); assert.notStrictEqual(x.pending[0].birth, old);
  assert.throws(() => check(x.h, x.ports)); await x.settle(); await x.frame(); check(x.h, x.ports);
  assert.equal(x.calls.init, 1); assert.strictEqual(x.h.manager._scene, successor);
});
test('a new generation rejects the old restore until ingress consumes the current generation', async () => {
  const x = await protocol(); await x.enter(); x.app.stateGeneration++;
  unchanged(x, () => assert.throws(() => check(x.h, x.ports)));
  await x.frame(); await x.frame(); check(x.h, x.ports);
  assert.equal(x.calls.init, 2); assert.equal(x.calls.restore.length, 2);
});
for (const [name, change] of [
  ['App', x => { x.G.PSFlow._app = {...x.app}; }],
  ['Content', x => { x.G.PSFlow._content = {...x.h.content}; }],
  ['manager', x => { x.G.SceneManager = {_scene: x.h.manager._scene, _nextScene: {successor: true}}; }],
  ['registered source', x => { x.ports.worldTravel.nativeLeaseSource = {}; }],
  ['map', x => { x.G.$gameMap = {_mapId: 5}; }],
  ['data', x => { x.G.$dataMap = {}; }],
  ['player', x => { x.G.$gamePlayer = {...x.G.$gamePlayer}; }],
  ['birth', x => { x.registry.publishMapBirth({...x.read().mapBirth, birth: {}}); }],
  ['owner', x => { x.registry.publish({owner: {}, receipt: {}, lease: {}, serial: {}, sourceScene: x.h.manager._scene,
    scene: x.h.manager._scene, player: x.G.$gamePlayer, phase: 'reserved'}); }],
  ['idle ABA', x => { const b = x.read().mapBirth; x.registry.publishMapBirth(null); x.registry.publishMapBirth(b); }],
  ['source handoff', x => { x.registry.publishSourceHandoff({owner: {}, context: {}, generation: 1, serial: {},
    sourceScene: x.h.manager._scene, phase: 'armed', target: null}); }],
  ['author pending', x => { x.G.PSFlow.worldAuthorInputPending = () => true; }],
  ['world pending', x => { x.G.PSWorld.pending = () => true; }],
  ['save blocked', x => { x.app.saveBlocked = true; }],
  ['encounter blocked', x => { x.app.encounterBlocked = true; }],
  ['pending return', x => { x.G.$gameSystem._psGame.world.pendingReturn = {phase: 'protocol-pending'}; }]
]) test('F bootstrap refuses changed ' + name + ' and preserves current successor/registry', async () => {
  const x = await protocol(); await x.enter(); check(x.h, x.ports); change(x);
  unchanged(x, () => assert.throws(() => check(x.h, x.ports)));
});
