'use strict';
require('../../../experiments/step5/5/regular-field-action-test-runtime.cjs').prepare('leaf');
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, clone, value } = require('../../../experiments/step5/5/field-move-app-fixtures.cjs');
for (const moveId of ['cut', 'rocksmash', 'strength', 'surf', 'flash', 'sweetscent']) {
  test('T25 production rules + MZ host + App ' + moveId + ' executes once from zeroHP/zeroPP actor', async () => {
    const h = fixture({ moveId }), first = h.operation.run(); assert.equal(h.operation.run(), first);
    const result = await first; assert.equal(result.status, 'completed', JSON.stringify(result));
    assert.equal(await h.operation.run(), result); assert.equal(h.guardProviderCalls, 0);
    assert.deepEqual(h.draws, moveId === 'rocksmash' ? [100] : []); assert.equal(h.state.game.steps, 0);
    if (moveId === 'cut' || moveId === 'rocksmash') {
      assert(h.event._erased); assert.equal(h.state.records[0].kind, 'erased-event');
      assert.equal(h.state.game.stats[moveId === 'cut' ? 'cut_count' : 'rock_smash_count'], 1);
    }
    if (moveId === 'rocksmash') { assert.equal(result.encounter.type, 'RockSmash'); assert.equal(result.encounter.onBattleStartedStat, 'rock_smash_battles'); assert.equal(h.state.game.stats.rock_smash_battles, 0); }
    if (moveId === 'strength') assert(h.state.local.strengthUsed);
    if (moveId === 'surf') {
      assert(h.state.game.world.surfing); assert.equal(h.state.game.stats.surf_count, 1); assert.equal(h.player._characterName, 'surf');
      assert.deepEqual(h.state.surf, { surfBase: { mapId: 7, x: 4, y: 3 }, endingSurf: false });
      assert.equal(h.state.encounterRuntime.graceSteps, 0); assert.equal(h.state.encounterRuntime.accumulator, 0);
      assert.equal(h.player.x, 4); assert.equal(h.player.y, 3);
    }
    if (moveId === 'flash') { assert(h.state.game.world.flashUsed); assert.equal(h.state.game.stats.flash_count, 1); assert(h.maskState.expanded); }
    if (moveId === 'sweetscent') { assert.equal(result.encounter.type, 'Land'); assert.equal(result.encounter.trigger, 'skip'); assert.equal(h.writes.length, 0); }
    assert(Object.isFrozen(result)); if (result.encounter) assert(Object.isFrozen(result.encounter.business.weather.value));
  });
  for (const entry of ['party', 'shortcut']) test('T25 ' + moveId + ' ' + entry + ' rejects egg even DEBUG with zero effects/RNG', async () => {
    const h = fixture({ moveId, entry, debug: true, state: s => { s.game.party[0].isEgg = true; } });
    const result = await h.operation.run(); assert.equal(result.status, 'refused'); assert.equal(result.reason, 'move-member-required');
    assert.equal(h.writes.length, 0); assert.equal(h.trace.length, 0); assert.deepEqual(h.draws, []);
  });
}
for (const moveId of ['cut', 'rocksmash', 'strength', 'surf', 'flash']) test('T25 ' + moveId + ' requires own badge configuration', async () => {
  const h = fixture({ moveId, state: s => { s.game.badges.fill(false); } }); const result = await h.operation.run();
  assert.equal(result.status, 'refused'); assert.equal(result.reason, 'badge-required'); assert.equal(h.writes.length, 0); assert.deepEqual(h.draws, []);
});
for (const moveId of ['cut', 'rocksmash']) test('T25 ' + moveId + ' direct preserves event caller world responsibility and confirmation', async () => {
  const h = fixture({ moveId, entry: 'direct' }), result = await h.operation.run(); assert.equal(result.status, 'completed');
  assert.equal(h.event._erased, false); assert.equal(h.state.records.length, 0); assert.deepEqual(h.draws, []); assert.equal(result.encounter, undefined);
  assert(h.trace.some(t => t[0] === 'confirm-direct')); assert.equal(h.trace.some(t => t[0] === 'sound'), false);
});
test('T25 direct confirmation cancel precedes animation/statistics', async () => {
  const h = fixture({ entry: 'direct', text: false }), result = await h.operation.run();
  assert.equal(result.status, 'cancelled'); assert.equal(h.writes.length, 0); assert.equal(h.trace.some(t => t[0] === 'animate'), false);
});
test('T25 Surf rejects companions before transition and leaves all state unchanged', async () => {
  const h = fixture({ moveId: 'surf', state: s => { s.game.world.companions = [{ fixture: true }]; } }), before = clone(h.state), result = await h.operation.run();
  assert.equal(result.status, 'refused'); assert.equal(result.reason, 'companions-present'); assert.deepEqual(h.state, before); assert.deepEqual(h.draws, []);
});
for (const mode of ['weather-menu', 'weather-direct', 'no-type', 'no-table']) test('R11 SweetScent ' + mode + ' no RNG/candidate generation', async () => {
  const h = fixture({ moveId: 'sweetscent', entry: mode === 'weather-direct' ? 'direct' : 'party',
    state: s => { if (mode.startsWith('weather')) s.game.world.weather = { type: 'Rain', strength: 60, durationFrames: 0 }; },
    encounters: f => { if (mode === 'no-type') f.currentType = null; if (mode === 'no-table') delete f.tables.Land; } });
  const result = await h.operation.run(); assert.equal(result.status, 'completed'); assert.equal(result.encounter, undefined); assert.deepEqual(h.draws, []);
  if (mode.startsWith('weather')) { assert.equal(h.trace.length, 0); assert.equal(result.outcome, 'weather-blocked'); assert.equal(result.effectSuccess, mode === 'weather-direct' ? null : true); }
});
for (const gate of ['disabled', 'no-player', 'debug', 'no-chance', 'zero', 'no-slots']) test('R11 RockSmash ' + gate + ' early return consumes zero RNG', async () => {
  const h = fixture({ moveId: 'rocksmash', encounters: f => {
    if (gate === 'disabled') f.disabled = true; if (gate === 'no-player') f.playerPresent = false; if (gate === 'debug') f.debugControl = true;
    if (gate === 'no-chance') delete f.tables.RockSmash; if (gate === 'zero') f.tables.RockSmash.stepChance = 0; if (gate === 'no-slots') f.tables.RockSmash.slots = [];
  } }), result = await h.operation.run(); assert.equal(result.status, 'completed'); assert.equal(result.encounter, undefined); assert.deepEqual(h.draws, []);
  assert.equal(h.state.game.stats.rock_smash_count, 1); assert.equal(h.state.encounterRuntime.graceSteps, 5); assert.equal(h.state.encounterRuntime.accumulator, 220);
});
for (const [roll, hit] of [[49, true], [50, false], [99, false]]) test('R11 RockSmash exact single 0..99 trigger ' + roll, async () => {
  const h = fixture({ moveId: 'rocksmash', random: () => roll }), result = await h.operation.run(); assert.equal(result.status, 'completed');
  assert.equal(!!result.encounter, hit); assert.deepEqual(h.draws, [100]); assert.equal(h.state.game.stats.rock_smash_battles, 0);
});
test('R11 RockSmash effective held item wins over ability, cycling/local rate modifiers and no grace RNG', async () => {
  const h = fixture({ moveId: 'rocksmash', random: () => 19, state: s => { s.local.lowerEncounterRate = true; s.game.party[0].item = 'cleansetag'; s.game.party[0].ability = 'illuminate'; }, encounters: f => { f.business.cycling = value(true); } });
  const result = await h.operation.run(); assert.equal(result.status, 'completed'); assert.equal(result.encounter, undefined); // 50*.8*.5*2/3 = 13.333
  assert.deepEqual(h.draws, [100]); assert.equal(h.state.encounterRuntime.graceSteps, 5); assert.equal(h.state.encounterRuntime.accumulator, 220);
});
test('R11 cancel inside random retains erasure/count but issues no encounter or further draws', async () => {
  const h = fixture({ moveId: 'rocksmash', onRandom: c => { c.operation.cancel(); } }), result = await h.operation.run();
  assert.equal(result.status, 'cancelled'); assert.equal(result.encounter, undefined); assert.deepEqual(h.draws, [100]); assert.equal(h.state.game.stats.rock_smash_count, 1); assert(h.event._erased);
});
for (const roll of [-1, 100, NaN, 0.5]) test('R11 invalid RNG ' + roll + ' fails without intent while retaining prior prefix', async () => {
  const h = fixture({ moveId: 'rocksmash', random: () => roll }), result = await h.operation.run(); assert.equal(result.status, 'failed'); assert.equal(result.encounter, undefined); assert.equal(h.state.game.stats.rock_smash_count, 1);
});
for (const change of ['owner', 'generation', 'content', 'game', 'local', 'runtime', 'map', 'cancel']) test('atomic final joint guard rejects ' + change + ' without installing', async () => {
  let h; h = fixture({ onInstall: (n, c) => { if (n !== 1) return;
    if (change === 'owner') h.replaceOwner(); if (change === 'generation') h.replaceGeneration(); if (change === 'content') h.replaceContent(); if (change === 'map') h.replaceMap();
    if (change === 'game') h.external(s => { s.game.money++; }); if (change === 'local') h.external(s => { s.local.higherEncounterRate = true; });
    if (change === 'runtime') h.external(s => { s.encounterRuntime.accumulator++; }); if (change === 'cancel') c.operation.cancel();
  } });
  const result = await h.operation.run(); assert.equal(result.status, change === 'cancel' ? 'cancelled' : 'failed'); assert.equal(h.writes.length, 0); assert.equal(h.state.game.stats.cut_count, 0);
  assert.equal(h.event._erased, false); assert.equal(h.guardProviderCalls, 0); assert.deepEqual(h.draws, []);
});
test('state replacement during animation is terminal and late stage callbacks cannot write', async () => {
  let h; h = fixture({ onAnimate: () => { h.replaceGeneration(); } }); const result = await h.operation.run();
  assert.equal(result.status, 'failed'); assert.equal(h.writes.length, 0);
  assert.throws(() => h.lastHostOperation.applyStage({ kind: 'commit', stats: [{ counter: 'cut_count', delta: 1 }] }), /finished/); assert.equal(h.writes.length, 0);
});
test('cancel before run allocates no host effect and repeated cancellation returns the same outcome', async () => {
  const h = fixture(), promise = h.operation.cancel(); assert.equal(h.operation.cancel(), promise); const result = await promise;
  assert.equal(result.status, 'cancelled'); assert.equal(h.trace.length, 0); assert.equal(h.writes.length, 0); assert.deepEqual(h.draws, []);
});
for (const stage of ['mask', 'animation', 'text', 'expand']) test('T18 Flash failure at ' + stage + ' preserves the exact committed prefix', async () => {
  const h = fixture({ moveId: 'flash', animate: stage === 'animation' ? false : true, text: stage !== 'text', onExpand: stage === 'expand' ? () => { throw Error('expand-failed'); } : undefined });
  if (stage === 'mask') h.maskState.valid = false;
  const result = await h.operation.run(); assert.notEqual(result.status, 'completed'); const committed = stage === 'expand';
  assert.equal(h.state.game.world.flashUsed, committed); assert.equal(h.state.game.stats.flash_count, committed ? 1 : 0); assert.equal(h.writes.length, committed ? 1 : 0); assert.deepEqual(h.draws, []);
});
test('T25 failed Surf front jump retains business mode/count/base and reset, never counts ordinary step', async () => {
  const h = fixture({ moveId: 'surf' }); let calls = 0; h.ports.surfPassage = () => value(++calls === 1);
  const result = await h.operation.run(); assert.equal(result.status, 'failed'); assert(h.state.game.world.surfing); assert.equal(h.state.game.stats.surf_count, 1);
  assert.equal(h.state.game.steps, 0); assert.equal(h.player.x, 3); assert.deepEqual(h.state.surf.surfBase, { mapId: 7, x: 4, y: 3 }); assert.equal(h.state.encounterRuntime.accumulator, 0);
});
test('T25 Surf landing stores captured water departure and cleanup commits mode before projection/reset/BGM', async () => {
  const land = fixture({ action: { kind: 'surf-land' }, state: s => { s.game.world.surfing = true; } }); land.ports.terrain = () => value({ canSurf: false, waterfall: false, waterfallCrest: false });
  const result = await land.operation.run(); assert.equal(result.status, 'completed'); assert.equal(land.player.x, 4);
  assert.deepEqual(land.state.surf, { surfBase: { mapId: 7, x: 3, y: 3 }, endingSurf: true }); assert(land.state.game.world.surfing); assert.equal(land.state.game.steps, 0);
  const clean = fixture({ action: { kind: 'surf-cleanup' }, state: s => { s.game.world.surfing = true; s.surf = clone(land.state.surf); } });
  const done = await clean.operation.run(); assert.equal(done.status, 'completed', JSON.stringify(done)); assert.equal(clean.state.game.world.surfing, false);
  assert.deepEqual(clean.state.surf, { surfBase: null, endingSurf: false }); assert.equal(clean.state.encounterRuntime.graceSteps, 0); assert.equal(clean.state.encounterRuntime.accumulator, 0);
  assert.equal(clean.state.game.stats.surf_count, 0); assert.equal(clean.state.game.steps, 0); assert(clean.trace.some(t => t[0] === 'bgm'));
});
for (const mode of ['not-map', 'wrong-player', 'no-base', 'no-ending']) test('T25 Surf cleanup guard ' + mode + ' preserves specified prefix', async () => {
  const h = fixture({ action: { kind: 'surf-cleanup' }, wrongNotification: mode === 'wrong-player', state: s => { s.game.world.surfing = true; s.surf = { surfBase: mode === 'no-base' ? null : { mapId: 7, x: 3, y: 3 }, endingSurf: mode !== 'no-ending' }; } });
  if (mode === 'not-map') h.root.SceneManager._scene = {};
  const result = await h.operation.run(); assert.equal(result.status, 'completed'); assert(h.state.game.world.surfing); assert.equal(h.writes.length, mode === 'no-ending' ? 1 : 0);
  assert.equal(h.state.encounterRuntime.accumulator, 220); assert.equal(h.trace.some(t => t[0] === 'bgm'), false);
});
for (const mode of ['inactive', 'strict-block', 'ordinary-block', 'moved', 'no-record']) test('T25 Strength push ' + mode + ' follows strict/ordinary permission and retained prefix', async () => {
  const h = fixture({ moveId: 'strength', action: { kind: 'strength-push', playSound: true }, state: s => { s.local.strengthUsed = mode !== 'inactive'; if (mode === 'no-record') s.records = null; } });
  if (mode === 'strict-block') { h.root.$dataMap.data[(0 * 8 + 3) * 8 + 4] = 1; h.root.$dataTilesets[1].flags[1] = 1; }
  if (mode === 'ordinary-block') h.event.canPass = () => false;
  const result = await h.operation.run(); assert.equal(result.status, mode === 'strict-block' ? 'refused' : 'completed', JSON.stringify(result));
  const attempted = mode !== 'inactive' && mode !== 'strict-block'; assert.equal(h.state.game.stats.strength_push_count, attempted ? 1 : 0); assert.equal(h.state.game.steps, 0);
  assert.equal(h.event.x, mode === 'moved' || mode === 'no-record' ? 5 : 4);
  assert.equal(h.trace.some(t => t[0] === 'sound'), mode === 'moved' || mode === 'no-record');
  if (mode === 'ordinary-block') { assert.equal(h.state.records[0].position.x, 4); assert.equal(h.trace.some(t => t[0] === 'frame'), false); }
  if (mode === 'no-record') assert.equal(h.state.records, null); assert.deepEqual(h.draws, []);
});
test('no battle admission exists on App leaf or its frozen encounter intent', async () => {
  const h = fixture({ moveId: 'rocksmash' }), result = await h.operation.run(); assert.equal(typeof h.operation.beginBattle, 'undefined');
  assert.equal(Object.values(result.encounter).some(v => typeof v === 'function'), false); assert.equal(h.state.game.stats.rock_smash_battles, 0);
});
test('Surf landing already ending rejects before a second native jump; rejected ordinary landing remains ordinary movement', async () => {
  const ending = fixture({ action: { kind: 'surf-land' }, state: s => { s.game.world.surfing = true; s.surf.endingSurf = true; s.surf.surfBase = { mapId: 7, x: 2, y: 3 }; } });
  ending.ports.terrain = () => value({ canSurf: false, waterfall: false, waterfallCrest: false });
  assert.equal((await ending.operation.run()).reason, 'surf-ending-active'); assert.equal(ending.player.x, 3); assert.equal(ending.writes.length, 0);
  const refused = fixture({ action: { kind: 'surf-land' }, state: s => { s.game.world.surfing = true; } });
  refused.ports.terrain = () => value({ canSurf: false, waterfall: false, waterfallCrest: false }); refused.ports.surfPassage = () => value(false);
  const result = await refused.operation.run(); assert.equal(result.status, 'not-landed'); assert.equal(refused.writes.length, 0); assert.equal(refused.player.x, 3);
});
test('an unissued/duplicate/reentrant stage cannot write or consume the next stage', async () => {
  let h; const refusals = [];
  h = fixture({ onHost(name, args) {
    if (name !== 'run') return; const operation = args.at(-1);
    assert.throws(() => operation.applyStage({ kind: 'commit', world: { surfing: true } }), /unissued/);
  }, onInstall(n) {
    if (n !== 1) return;
    assert.throws(() => h.lastHostOperation.applyStage({ kind: 'commit', stats: [{ counter: 'cut_count', delta: 1 }] }), /outside/); refusals.push('reentrant');
  } });
  const original = h.host.run;
  h.host.run = async (plan, op) => {
    const completed = await original(plan, op);
    assert.throws(() => op.applyStage({ kind: 'commit', stats: [{ counter: 'cut_count', delta: 1 }] }), /unissued/); return completed;
  };
  const result = await h.operation.run(); assert.equal(result.status, 'completed'); assert.equal(h.state.game.stats.cut_count, 1); assert.equal(h.writes.length, 2); assert.deepEqual(refusals, ['reentrant']);
});
test('native erase failure retains the counter, reports failure, and never records or draws', async () => {
  const h = fixture({ moveId: 'rocksmash' }); h.event.erase = () => { throw Error('native-erase-failed'); };
  const result = await h.operation.run(); assert.equal(result.status, 'failed'); assert.equal(h.state.game.stats.rock_smash_count, 1); assert.equal(h.state.records.length, 0); assert.deepEqual(h.draws, []);
});
test('unavailable erasure records fail after native erasure with the count retained, never fake a registration ACK', async () => {
  const h = fixture({ state: s => { s.records = null; } }), result = await h.operation.run();
  assert.equal(result.status, 'failed'); assert.match(result.reason, /records-unavailable/); assert(h.event._erased); assert.equal(h.state.game.stats.cut_count, 1); assert.equal(h.writes.length, 1);
});
test('late resolved animation after cancellation cannot commit, erase, or create an intent', async () => {
  const h = fixture({ moveId: 'rocksmash' }); let resolve;
  h.ports.animate = () => new Promise(r => { resolve = r; }); const promise = h.operation.run();
  for (let i = 0; i < 6 && !resolve; i++) await new Promise(setImmediate);
  assert.equal(typeof resolve, 'function'); assert.equal(h.operation.cancel(), promise); resolve(true);
  const result = await promise; assert.equal(result.status, 'cancelled'); assert.equal(h.writes.length, 0); assert.equal(h.event._erased, false); assert.deepEqual(h.draws, []);
});
for (const malformed of [{ status: 'mystery', completedStages: 0 }, { status: 'completed', completedStages: -1, effectSuccess: true, outcome: 'effect' }, { status: 'completed', completedStages: 0, effectSuccess: false, outcome: 'effect' }]) test('malformed host result is a failed execution ' + JSON.stringify(malformed), async () => {
  const h = fixture({ moveId: 'sweetscent', state: s => { s.game.world.weather = { type: 'Rain', strength: 60, durationFrames: 0 }; } }); h.host.run = async () => malformed;
  const result = await h.operation.run(); assert.equal(result.status, 'failed'); assert.equal(result.reason, 'field-move-invalid-host-result'); assert.equal(h.writes.length, 0);
});
