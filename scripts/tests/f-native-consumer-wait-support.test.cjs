'use strict';
// Ordinary-object support controls. Extract the exact wait closures as text and
// use the existing observer interface; never import the real fixture/App/native.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {observer} = require('../../experiments/step5/5/e3-production/native-consumer-observer.cjs');
const file = path.resolve(__dirname, '../../experiments/step5/5/blackout-formal-load-joint/current-fixture.cjs');
function waits(nativeConsumer, onTick = () => {}) {
  const source = fs.readFileSync(file, 'utf8');
  const begin = source.indexOf('  const pump = async ('), end = source.indexOf('  const enter =', begin);
  assert(begin >= 0 && end > begin, 'extract the exact production-support wait closures');
  const metrics = {accepted: false, nativeReadyReads: 0, ticks: 0, flushes: 0};
  const wrapped = {ready() { metrics.nativeReadyReads++; return nativeConsumer.ready(); }, status: () => nativeConsumer.status()};
  const h = {state: () => ({world: {pendingReturn: null}}), app: {saveBlocked: false}, nativeConsumer: wrapped};
  const G = {$gameMap: {mapId: () => 7}, $gameMessage: {clear() {}}, PSFlow: {blackoutLoadRecoveryView: () => ({phase: 'completed'})}};
  const helpers = vm.runInNewContext(source.slice(begin, end) + '\n({pump,pumpSuccessful});', {
    G, h, observed: metrics,
    tick() { metrics.ticks++; onTick(); }, flush: async () => { metrics.flushes++; }
  }, {filename: file + ':exact-waits-only'});
  return {...helpers, metrics};
}
const neverReady = {ready: () => false, status: () => ({ready: false})};
async function rejectsSuccess(h) {
  const pending = h.pumpSuccessful(() => true, 2).then(value => { h.metrics.accepted = true; return value; });
  await assert.rejects(pending, /F physical load bounded stop/);
  assert.equal(h.metrics.accepted, false);
  assert.equal(h.metrics.nativeReadyReads, 2); assert.equal(h.metrics.ticks, 2); assert.equal(h.metrics.flushes, 2);
}
function ordinaryObserver() {
  // These objects model observer calls only, not MZ classes, lifecycle issuers or App behavior.
  class Scene { update() {} }
  const app = {stateGeneration: 1, calls: 0, restoreEventCompanionsAtMap() { this.calls++; return Promise.resolve({status: 'completed'}); }};
  const G = {PSFlow: {_app: app, companionNativeMapFrame() {}}, Graphics: {frameCount: 0}, Scene_Map: Scene,
    SceneManager: {_scene: new Scene()}, $gameMap: {_mapId: 7}, $dataMap: {}, $gamePlayer: {}};
  let actual;
  const ports = {state: {atomicWorldContent(prepare) { return prepare()(actual); }}};
  const native = observer(); native.observePorts(ports); native.install(G, app);
  async function consume({update = true} = {}) {
    const birth = {}, scene = G.SceneManager._scene;
    actual = {lifecycle: {travelLease: {current: null, sourceHandoff: null,
      mapBirth: {birth, scene, frame: {map: G.$gameMap, data: G.$dataMap, player: G.$gamePlayer, mapId: G.$gameMap._mapId}}}}};
    G.PSFlow.companionNativeMapFrame();
    await app.restoreEventCompanionsAtMap(birth);
    if (update) scene.update();
    ports.state.atomicWorldContent(() => () => ({value: null}));
  }
  return {G, app, native, consume, replaceBirth() {
    actual.lifecycle.travelLease.mapBirth.birth = {};
    ports.state.atomicWorldContent(() => () => ({value: null}));
  }};
}
test('F failure/pending boundaries remain reachable without successful native restore', async () => {
  for (const phase of ['pending', 'stable-failed']) {
    const h = waits(neverReady); await h.pump(() => phase === 'pending' || phase === 'stable-failed', 2);
    assert.equal(h.metrics.nativeReadyReads, 0); assert.equal(h.metrics.ticks, 0);
  }
});
test('F-SUP-R1 success refuses CP-null/save-ready when the native consumer stays unready', async () => {
  const h = waits(neverReady); await rejectsSuccess(h);
  console.log('F-SUP-R1 corrected success observation ' + JSON.stringify(h.metrics));
  assert.equal(h.metrics.accepted, false);
});
test('F success accepts the existing observer after current restore and subsequent Map update', async () => {
  const x = ordinaryObserver(); assert.equal(x.native.ready(), false); await x.consume();
  assert.equal(x.native.ready(), true); const calls = x.app.calls;
  const h = waits(x.native); await h.pumpSuccessful(() => true, 2); h.metrics.accepted = true;
  assert.equal(h.metrics.nativeReadyReads, 1); assert.equal(h.metrics.ticks, 0);
  assert.equal(x.app.calls, calls, 'the successful wait observes; it cannot initiate a restore');
});
test('F success rejects an old-generation restore and accepts the newly consumed generation', async () => {
  const x = ordinaryObserver(); await x.consume(); assert.equal(x.native.ready(), true);
  x.app.stateGeneration++; assert.equal(x.native.ready(), false);
  await rejectsSuccess(waits(x.native)); await x.consume(); assert.equal(x.native.ready(), true);
  await waits(x.native).pumpSuccessful(() => true, 2);
});
test('F success rejects old target identities, birth, or missing post-restore Map update', async () => {
  for (const change of [
    x => { x.G.SceneManager._scene = new x.G.Scene_Map(); },
    x => { x.G.$gameMap = {_mapId: 7}; }, x => { x.G.$dataMap = {}; },
    x => { x.G.$gamePlayer = {}; }, x => { x.G.$gameMap._mapId = 8; }, x => { x.replaceBirth(); }
  ]) {
    const x = ordinaryObserver(); await x.consume(); assert.equal(x.native.ready(), true);
    change(x); assert.equal(x.native.ready(), false); await rejectsSuccess(waits(x.native));
  }
  const x = ordinaryObserver(); await x.consume({update: false}); assert.equal(x.native.ready(), false);
  await rejectsSuccess(waits(x.native));
});
