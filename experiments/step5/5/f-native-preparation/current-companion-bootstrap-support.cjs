'use strict';
const assert = require('node:assert/strict');

// joint() has already waited for a genuine current Map restore and a later Map
// update. Observe that boundary; a second goto/rebootstrap changes its source.
// This helper never advances a frame or calls initialize/restore/projection.
function assertCurrentCompanionBootstrap(h, ports) {
  const {G, app, manager, nativeConsumer} = h;
  const generation = app.stateGeneration;
  assert.strictEqual(G.PSFlow._app, app, 'F bootstrap current App');
  assert.strictEqual(G.SceneManager, manager, 'F bootstrap original native frame manager');
  assert.equal(nativeConsumer.ready(), true, 'F bootstrap completed current-birth restore and later Map update');
  const restored = nativeConsumer.bootstrapSource();
  assert.equal(restored?.status, 'completed', 'F bootstrap actual restore settled');
  const actual = ports.state.atomicWorldContent(() => snapshot => ({value: snapshot}));
  const life = actual.lifecycle, lease = life.travelLease, birth = lease?.mapBirth, frame = birth?.frame;
  assert.strictEqual(actual.game, G.$gameSystem._psGame, 'F bootstrap current game slot');
  assert.strictEqual(actual.content, h.content, 'F bootstrap joint Content');
  assert.strictEqual(actual.content, G.PSFlow._content, 'F bootstrap installed Content');
  assert.strictEqual(life.application, app, 'F bootstrap atomic App');
  assert(ports.worldTravel.nativeLeaseSource, 'F bootstrap registered native source');
  assert.strictEqual(lease?.registry, ports.worldTravel.nativeLeaseSource, 'F bootstrap current registry');
  assert.strictEqual(restored.registry, lease.registry, 'F bootstrap restore registry');
  assert.strictEqual(restored.nativeEpoch, lease.nativeEpoch, 'F bootstrap restore native epoch');
  assert.strictEqual(restored.content, actual.content, 'F bootstrap restore Content');
  assert.strictEqual(restored.application, app, 'F bootstrap restore App');
  assert.strictEqual(restored.generation, generation, 'F bootstrap restore generation');
  assert.strictEqual(restored.manager, manager, 'F bootstrap restore manager');
  assert.strictEqual(restored.birth, birth?.birth, 'F bootstrap restore current birth');
  assert.strictEqual(restored.observedBirth, birth?.birth, 'F bootstrap actual restore source birth');
  assert.strictEqual(restored.observedScene, life.scene, 'F bootstrap actual restore source Scene');
  for (const key of ['application', 'generation', 'manager', 'content', 'scene', 'map', 'data', 'player'])
    assert.strictEqual(restored.sourceSnapshot[key], restored[key], 'F bootstrap restore atomic source ' + key);
  assert.strictEqual(lease.current, null, 'F bootstrap has no physical owner');
  assert(lease.sourceHandoff == null, 'F bootstrap has no source handoff');
  assert(lease.nativeEpoch && birth?.birth && birth.queue && frame, 'F bootstrap loaded native birth and epoch');
  assert.strictEqual(life.scene, manager._scene, 'F bootstrap current Scene');
  assert.strictEqual(birth.manager, manager, 'F bootstrap birth manager');
  assert.strictEqual(birth.scene, life.scene, 'F bootstrap birth Scene');
  assert.strictEqual(life.map, G.$gameMap, 'F bootstrap current map');
  assert.strictEqual(life.player, G.$gamePlayer, 'F bootstrap current player');
  assert.strictEqual(life.mapData, G.$dataMap, 'F bootstrap current data');
  assert.strictEqual(frame.map, life.map, 'F bootstrap frame map');
  assert.strictEqual(frame.mapId, life.mapId, 'F bootstrap frame map id');
  assert.strictEqual(frame.player, life.player, 'F bootstrap frame player');
  assert.strictEqual(frame.data, life.mapData, 'F bootstrap frame data');
  assert.strictEqual(life.sceneTransition?.manager, manager, 'F bootstrap transition manager');
  assert.strictEqual(life.sceneTransition.prototype, Object.getPrototypeOf(life.scene), 'F bootstrap Scene prototype');
  assert.strictEqual(life.sceneTransition.started, true, 'F bootstrap started Scene');
  assert.strictEqual(life.sceneTransition.nextScene, null, 'F bootstrap no queued successor');
  assert.strictEqual(life.travelPlayer?.transferring, false, 'F bootstrap no player transfer');
  assert.strictEqual(G.PSFlow._app, app, 'F bootstrap App survives observation');
  assert.strictEqual(app.stateGeneration, generation, 'F bootstrap generation survives observation');
  assert.strictEqual(G.SceneManager, manager, 'F bootstrap manager survives observation');
  assert.equal(app.saveBlocked, false, 'F bootstrap save boundary idle');
  assert.equal(app.encounterBlocked, false, 'F bootstrap encounter boundary idle');
  assert.equal(G.PSWorld.pending(), false, 'F bootstrap world boundary idle');
  assert.equal(G.PSFlow.companionNativePending(), false, 'F bootstrap companion boundary idle');
  assert.equal(G.PSFlow.worldAuthorInputPending(), false, 'F bootstrap author boundary idle');
  assert(actual.game.world.pendingReturn == null, 'F bootstrap no pending field return');
  assert.equal(nativeConsumer.ready(), true, 'F bootstrap observed restore still current');
  return actual;
}
module.exports = {assertCurrentCompanionBootstrap};
