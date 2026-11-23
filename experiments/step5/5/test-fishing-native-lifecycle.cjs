'use strict';
require('./regular-field-action-test-runtime.cjs').prepare('fishing');
const { test } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), { types } = require('node:util');
const { fixture } = require('./fishing-real-parent-fixtures.cjs');
const { createMZAtomicStatePort } = require(path.join(process.env.PF_E1_PARENT_OUT, 'src/plugins/world/atomic-state-mz.js'));
async function finish(h, write) {
  const { promise } = await h.start();
  if (write === 2 && !h.settled) { h.window(); h.input(1, { confirm: true }); h.finish(); }
  else if (h.pending) { h.cancel(); h.finish(); }
  return promise;
}
for (const write of [1, 2]) for (const stage of ['onRead','onContent']) for (const change of ['map-id','map','player','scene']) test(`final native ${stage} ${change} before stat ${write}`, async () => {
  let armed = false, changed = false, h;
  h = fixture({ onInstall(n) { armed = n === write; }, [stage]() {
    if (!armed || changed) return; changed = true;
    const r = h.h.root;
    if (change === 'map-id') r.$gameMap._mapId = 8;
    else if (change === 'map') r.$gameMap = { ...r.$gameMap };
    else if (change === 'player') r.$gamePlayer = { ...r.$gamePlayer };
    else r.SceneManager._scene = {};
  } });
  const result = await finish(h, write);
  assert(changed); assert.equal(h.statCommits.length, write - 1); assert.equal(h.state.stats.fishing_count, write - 1);
  assert.equal(h.state.stats.fishing_battles, 0); assert.equal(result.fishing.encounter, undefined);
  assert.deepEqual(result.fishing.prefix, { countCommitted: write === 2, battlesCommitted: false });
});
for (const change of ['map-getter','scene-getter','map-proxy','player-proxy','scene-proxy','manager-proxy']) test('native world rejects unsafe lifecycle '+change+' without invoking it', () => {
  let calls = 0, finished = false;
  const root = { $gameSystem: { _psGame: {} }, $gameMap: { _mapId: 7 }, $gamePlayer: {}, SceneManager: { _scene: {} } };
  const port = createMZAtomicStatePort(root, { read: () => root.$gameSystem._psGame, replace() { assert.fail('legacy replace'); } }, types.isProxy);
  assert.throws(() => port.atomicWorld(() => {
    if (change === 'map-getter') Object.defineProperty(root.$gameMap, '_mapId', { get() { calls++; return 7; } });
    else if (change === 'scene-getter') Object.defineProperty(root.SceneManager, '_scene', { get() { calls++; return {}; } });
    else {
      const proxy = target => new Proxy(target, { get() { calls++; throw Error('trap'); }, getOwnPropertyDescriptor() { calls++; throw Error('trap'); } });
      if (change === 'map-proxy') root.$gameMap = proxy(root.$gameMap);
      else if (change === 'player-proxy') root.$gamePlayer = proxy(root.$gamePlayer);
      else if (change === 'scene-proxy') root.SceneManager._scene = proxy(root.SceneManager._scene);
      else root.SceneManager = proxy(root.SceneManager);
    }
    return () => { finished = true; return { value: 1 }; };
  }), /atomic-state-/);
  assert.equal(calls, 0); assert.equal(finished, false);
});
test('native world observes static MZ SceneManager and the final slot after providers; legacy atomic needs no world', () => {
  function SceneManager() {} SceneManager._scene = {};
  const old = {}, root = { $gameSystem: { _psGame: old }, $gameMap: { _mapId: 7 }, $gamePlayer: {}, SceneManager };
  const port = createMZAtomicStatePort(root, { read: () => root.$gameSystem._psGame, replace(next) { root.$gameSystem._psGame = next; } }, types.isProxy);
  const next = {}; const result = port.atomicWorld(() => { root.$gameMap._mapId = 8; root.$gameSystem._psGame = next; return actual => {
    assert.equal(actual.game, next); assert.equal(actual.lifecycle.mapId, 8); assert.equal(actual.lifecycle.scene, SceneManager._scene); return { value: actual.lifecycle };
  }; });
  assert.equal(result.map, root.$gameMap); assert.equal(result.player, root.$gamePlayer);
  const legacy = createMZAtomicStatePort({ $gameSystem: { _psGame: old } }, { read: () => old, replace() {} }, types.isProxy);
  assert.equal(legacy.atomic(() => game => ({ value: game })), old);
});
