'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const selected = process.env.PF_COLD_CASE_KIND, scope = process.env.PF_COLD_CASE_ROOT;
assert(['P00', 'L01', 'L02', 'L03', 'L04'].includes(selected), 'explicit F physical-load selector');
assert.deepEqual(process.argv.slice(2), []);
const {fixture, flush} = require('./current-fixture.cjs');
const {prepareSchema11Slot} = require('./legacy-schema11-input.cjs');
const copy = value => structuredClone(value);
test(selected + ' actual pending F physical save and formal Load recovery', async () => {
  let h;
  try {
    h = await fixture({consumer: selected !== 'P00', mismatch: selected === 'L02', resourceFailure: selected === 'L03'});
    const {G, observed, io} = h;
    const file8 = path.join(io.saveRoot, 'file8.rmmzsave'), global = path.join(io.saveRoot, 'global.rmmzsave');
    if (selected === 'P00') {
      assert.equal((await h.command('RegisterEventCompanion', {eventId: '1', name: 'F pending buddy'})).status, 'completed');
      assert.equal(h.records().length, 1);
      const prefix = h.draws.slice(), nativePrefix = h.nativeDraws.slice();
      // The ordinary player/D poison pipeline creates and settles the pending CP.
      // Up stays on source map5 and avoids the two source event cells.
      // No transfer, owner, checkpoint or ACK is fabricated.
      G.Input.dir4 = 8; h.tick(); G.Input.dir4 = 0;
      await h.pump(() => !!h.state().world.pendingReturn && !h.app.saveBlocked && !G.PSFlow.companionNativePending());
      assert(observed.resourceFailures > 0, 'actual target resource failure was reached');
      assert.equal(G.$gameMap.mapId(), 5); assert.equal(h.state().steps, 4);
      assert.equal(h.state().stats.blacked_out_count, 1); assert.equal(h.state().money, 12);
      assert.equal(h.state().world.pendingReturn.selection.branch, 'center');
      assert.equal(h.records().length, 1); assert.equal(h.records()[0].visible, true);
      const before = copy(h.state());
      for (let i = 0; i < 12; i++) { h.tick(); await flush(); }
      assert.deepEqual(h.state(), before, 'stable failure never repeats F settlement');
      assert.deepEqual(h.draws, prefix); assert.deepEqual(h.nativeDraws, nativePrefix);
      G.$gameSystem.onBeforeSave(); await G.DataManager.saveGame(8);
      await io.globalInfo.waitForSaves(1, flush);
      const packed = await G.StorageManager.loadObject('file8'), metadata = await G.StorageManager.loadObject('global');
      assert(metadata[8]); assert.equal(metadata[0], null); assert.equal(metadata.length, 9);
      assert.equal(packed.system._psGame.encoding, 'pokemon-framework-json');
      const state = JSON.parse(packed.system._psGame.data);
      assert.equal(state.schema, 12, 'new manual save is current schema');
      assert.deepEqual(state, before); assert.notEqual(state.world.pendingReturn, null);
      assert.equal(packed.map.mapId(), 5); assert.equal(observed.saveGameCalls.length, 1);
      assert.deepEqual(observed.saveGameCalls.map(row => row.slot), [8]);
      assert.equal(observed.originalAutosaves.length, 0);
      assert.deepEqual(h.draws, prefix); assert.deepEqual(h.nativeDraws, nativePrefix);
      const input = {content: h.content, maps: h.maps, state, gameVersion: packed.system._versionId,
        nativeSaveCount: packed.system._saveCount, physicalMapId: packed.map.mapId(), manualSlotInfo: copy(metadata[8]),
        fileSHA256: io.sha(file8), globalSHA256: io.sha(global),
        source: {application: 'actual PSFlow.app', generation: h.app.stateGeneration,
          transport: 'actual D poison/F + snapshotForSave/PS_SaveState/DataManager/Storage/JsonEx/pako'}};
      fs.writeFileSync(path.join(scope, 'P00-input.json'), JSON.stringify(input, null, 2) + '\n', {flag: 'wx'});
      h.record('completed'); return;
    }
    assert.notEqual(h.input.state.world.pendingReturn, null, 'CPnull producers cannot stand in for F recovery');
    assert.equal(h.input.physicalMapId, 5); assert.equal(io.sha(file8), h.input.fileSHA256);
    assert.equal(io.sha(global), h.input.globalSHA256);
    assert.deepEqual(copy(G.DataManager._globalInfo[8]), h.input.manualSlotInfo);
    const original = await G.StorageManager.loadObject('file8');
    assert.deepEqual(JSON.parse(original.system._psGame.data), h.input.state);
    assert.equal(original.system._versionId, h.input.gameVersion);
    const legacy = selected === 'L04';
    const checkpoint = h.input.state.world.pendingReturn;
    if (legacy) {
      const source = await prepareSchema11Slot(G.StorageManager, 'file8', original);
      assert.deepEqual(source.world.pendingReturn, checkpoint, 'schema 11 file retains the real pending checkpoint');
      assert.notEqual(io.sha(file8), h.input.fileSHA256, 'legacy manual input has distinct physical bytes');
      assert.equal(io.sha(global), h.input.globalSHA256, 'constructing legacy input does not alter the slot index');
    }
    assert.equal(fs.existsSync(path.join(io.saveRoot, 'file0.rmmzsave')), false);
    const manualSHA256 = io.sha(file8);
    const loadTraceStart = io.trace.length;
    const prefix = h.draws.slice(), nativePrefix = h.nativeDraws.slice();
    const m = G.SceneManager; m.goto(G.Scene_Load); m.changeScene(); m.updateScene();
    const loadScene = m._scene; assert(loadScene instanceof G.Scene_Load); loadScene.executeLoad(8);
    if (selected === 'L03') {
      await h.pump(() => G.PSFlow.blackoutLoadRecoveryView()?.phase === 'stable-failed' && !h.app.saveBlocked);
      assert.equal(observed.loadSuccess, 1); assert.equal(observed.recoverCalls, 1);
      assert.notEqual(h.state().world.pendingReturn, null); h.record('first-stable-failure');
      const failure = copy(h.state()), reserves = h.nativeObserved.rawReserves.length;
      for (let i = 0; i < 12; i++) { h.tick(); await flush(); }
      assert.equal(observed.recoverCalls, 1); assert.deepEqual(h.state(), failure);
      assert.equal(h.nativeObserved.rawReserves.length, reserves, 'stable failure does not auto retry');
      assert.deepEqual(h.draws, prefix); assert.deepEqual(h.nativeDraws, nativePrefix);
      h.flags.resourceFailure = false;
      assert.equal(typeof G.PSFlow.retryBlackoutLoadRecovery, 'function', 'nullable Flow retry bridge is installed');
      await h.retryViaMenu();
      assert.equal(observed.retryMenu.inputs, 1); assert.equal(observed.retryMenu.intents, 1);
    }
    const successful = () => observed.loadSuccess === 1 && G.PSFlow._app === h.app
      && h.app.stateGeneration === observed.loadGeneration && G.$gameMap.mapId() === 7
      && h.state().world.pendingReturn === null && !h.app.saveBlocked;
    await h.pumpSuccessful(successful);
    const state = h.state(); assert.equal(G.$gameMap.mapId(), 7);
    assert.equal(state.money, 12); assert.equal(state.steps, 4); assert.equal(state.stats.blacked_out_count, 1);
    assert.equal(state.party[0].hp, h.input.state.party[0].hp);
    assert.equal(G.$gameSwitches.value(1), true, 'successful return sets current starting-over');
    assert.equal(observed.recoverCalls, selected === 'L03' ? 2 : 1); assert.equal(loadScene._loadSuccess, true);
    assert.deepEqual(observed.versions, [h.input.gameVersion, selected === 'L02' ? h.input.gameVersion + 1 : h.input.gameVersion]);
    const sources = observed.entries.filter(row => row.entry.mapId === 5);
    assert.equal(sources.length, 1); assert.equal(sources[0].entry.cause, 'load'); assert.equal(sources[0].entry.previousMapId, 5);
    assert.equal(sources[0].companions[0].visible, true);
    assert.deepEqual(sources[0].companions[0].location, h.input.state.world.companions[0].location);
    if (selected === 'L02') {
      const ids = h.nativeObserved.rawReserves.map(row => row[0]);
      assert(ids.includes(5) && ids.includes(7) && ids.indexOf(5) < ids.indexOf(7), 'actual native source reload precedes F target');
    }
    assert.equal(G.PSState.lastLoadError, null);
    const {from, to, migrated} = G.$gameSystem._psSaveInfo;
    observed.saveInfo = {from, to, migrated};
    assert.deepEqual(observed.saveInfo, {from: legacy ? 11 : 12, to: 12, migrated: legacy});
    assert.deepEqual(observed.beforeRecovery, {schema: 12, pendingReturn: checkpoint,
      hallOfFame: legacy ? null : h.input.state.hallOfFame}, 'actual Load installs the checkpoint before it is resumed');
    await h.pumpSuccessful(() => successful() && fs.existsSync(path.join(io.saveRoot, 'file0.rmmzsave')));
    await io.globalInfo.waitForSaves(1, flush);
    const raw = await G.StorageManager.loadObject('file0'), metadata = await G.StorageManager.loadObject('global');
    assert(metadata[0]); assert.deepEqual(copy(metadata[8]), h.input.manualSlotInfo);
    const saved = JSON.parse(raw.system._psGame.data); assert.deepEqual(saved, state);
    assert.equal(saved.schema, 12, 'the resumed return writes a current autosave');
    assert.equal(raw.switches?._data?.[1], true, 'formal autosave persists starting-over');
    assert.equal(saved.world.pendingReturn, null); assert.equal(saved.money, 12); assert.equal(saved.steps, 4);
    assert.equal(saved.stats.blacked_out_count, 1); assert.equal(saved.party[0].hp, h.input.state.party[0].hp);
    assert.equal(observed.originalAutosaves.length, 1); assert.equal(observed.originalAutosaves[0].map, 7);
    assert.deepEqual(observed.saveGameCalls, [{slot: 0, map: 7, phase: null}]);
    assert.deepEqual(h.draws, prefix); assert.deepEqual(h.nativeDraws, nativePrefix);
    for (let i = 0; i < 12; i++) { h.tick(); await flush(); }
    assert.equal(observed.recoverCalls, selected === 'L03' ? 2 : 1); assert.equal(observed.saveGameCalls.length, 1);
    assert.equal(io.sha(file8), manualSHA256, 'source physical pending slot remains byte-identical');
    const manualWrites = io.trace.slice(loadTraceStart).filter(row => ['writeFileSync','renameSync','unlinkSync'].includes(row.method)
      && row.targets.some(target => target.startsWith(file8)));
    assert.deepEqual(manualWrites, [], 'migration and recovery do not write to the manual source slot');
    observed.slotSHA256 = {manualBefore: manualSHA256, manualAfter: io.sha(file8), auto: io.sha(path.join(io.saveRoot, 'file0.rmmzsave'))};
    assert.equal(successful(), true, 'successful tail remains in this load generation and target');
    assert.equal(h.nativeConsumer.ready(), true, 'completed tail requires the current actual native consumption');
    assert.deepEqual(h.draws, prefix); assert.deepEqual(h.nativeDraws, nativePrefix); h.record('completed');
  } catch (error) { if (h) h.record('failure'); throw error; }
});
