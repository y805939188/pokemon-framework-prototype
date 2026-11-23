'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, flush } = require('./fixture.cjs');
const id = process.env.PF_FINAL_CASE;
assert(['X1', 'X2'].includes(id), 'explicit X1/X2 case required');

// Regression input: independent ABC-R1 probe, ae3ca9c4e6a7b01e831f38f8f227a591588460f9fb5d54a43980916bf1023763.
// The actual 357, upgraded Scene constructor, foe generation and composition Session remain in the path.
test(id + ' legacy native source survives the foe RNG callback', async () => {
  const h = await fixture({ realSession: true });
  const { G, app, o } = h;
  const source = { data: G.$dataMap, map: G.$gameMap, player: G.$gamePlayer,
    app: G.PSFlow._app, generation: app.stateGeneration, content: h.ports.content().content, game: h.state() };
  const originalData = JSON.stringify(source.data);
  const random = G.PSFlow.rng;
  const calls = [];
  let changed = false, callbackScene, callbackOperation, callbackAdmission;
  const identities = () => ({ dataSame: G.$dataMap === source.data, mapSame: G.$gameMap === source.map,
    playerSame: G.$gamePlayer === source.player, appSame: G.PSFlow._app === source.app,
    generationSame: app.stateGeneration === source.generation, contentSame: h.ports.content().content === source.content,
    gameSame: h.state() === source.game, sceneSame: G.SceneManager._scene === callbackScene,
    operationSame: G.PSFlow._op === callbackOperation, admissionSame: G.PSFlow._op?.worldAdmission === callbackAdmission });
  G.PSFlow.rng = function (...args) {
    callbackScene ??= G.SceneManager._scene;
    callbackOperation ??= G.PSFlow._op;
    callbackAdmission ??= callbackOperation.worldAdmission;
    const before = identities();
    const result = Reflect.apply(random, this, args);
    if (id === 'X2' && !changed) { changed = true; G.$dataMap = { ...G.$dataMap }; }
    calls.push({ sameThis: this === G.PSFlow, args, result, sessionCount: o.sessions.length,
      before, after: identities(), equalData: JSON.stringify(G.$dataMap) === originalData });
    return result;
  };
  const args = { kind: 'wild', foes: 'Pidgey:5', battleId: 'review-native-mapdata', defaultWeather: 'none',
    defaultTerrain: 'none', battleEnvironment: 'none', battleTime: '0', battleEffects: 'on', canLose: 'true' };
  h.event([h.command('PS_BattleFlow', 'StartBattle', args)]);
  for (let i = 0; i < 180; i++) {
    if (G.SceneManager._scene?._controller?.ready || G.SceneManager._scene?._failure) break;
    G.$gameMessage.clear(); h.tick(); await flush();
  }
  const scene = G.SceneManager._scene;
  const failure = scene?._failure;
  const observation = { id, changed, identities: identities(), equalData: JSON.stringify(G.$dataMap) === originalData,
    actualSessionClass: scene?._session?.constructor?.name ?? null, sessions: o.sessions.length, calls,
    request: callbackOperation?.request, sessionRequest: o.sessions[0]?.request ?? null,
    lastOutcome: G.PSFlow.lastOutcome, draws: h.draws, diagnostics: G.PSWorld.diagnostics,
    failure: failure ? { name: failure.name, message: failure.message, stack: failure.stack } : null,
    saveBlocked: app.saveBlocked };
  fs.writeFileSync(path.join(process.env.PF_FINAL_CASE_ROOT, 'observation.json'), JSON.stringify(observation, null, 2) + '\n', { flag: 'wx' });
  assert(calls.length > 0, 'the actual foe generation RNG callback must run');
  assert(callbackAdmission && callbackScene?._controller, 'real admission and upgraded BattleScene must reach generation');
  for (const call of calls) {
    assert.equal(call.sameThis, true); assert.equal(call.sessionCount, 0); assert.equal(call.equalData, true);
    assert.deepEqual(call.before, Object.fromEntries(Object.keys(call.before).map(key => [key, true])));
    assert.deepEqual(call.after, { ...call.before, dataSame: id === 'X1' });
  }
  assert.equal(observation.equalData, true);
  // The existing command owns the sequence suffix; Session must receive that same accepted id.
  const acceptedBattleId = args.battleId + '#1';
  assert.equal(observation.request.kind, args.kind); assert.equal(observation.request.battleId, acceptedBattleId);
  assert.equal(observation.request.foes.length, 1);
  assert.deepEqual(Object.keys(observation.request.foes[0]).sort(), ['level', 'species']);
  assert.equal(observation.request.foes[0].species, 'Pidgey'); assert.equal(observation.request.foes[0].level, 5);
  if (id === 'X1') {
    assert.equal(changed, false); assert.equal(observation.identities.dataSame, true);
    assert.equal(failure, null); assert.equal(o.sessions.length, 1); assert.equal(observation.actualSessionClass, 'BattleSession');
    assert.equal(G.PSFlow._op.session, scene._session);
    assert.equal(observation.sessionRequest.kind, args.kind); assert.equal(observation.sessionRequest.battleId, acceptedBattleId);
    assert.deepEqual(observation.sessionRequest.foes, [{ species: 'Pidgey', level: 5 }]);
    assert.equal(o.sessions[0].setup.initialField, undefined);
    assert.deepEqual(o.sessions[0].setup.worldCapture, { timeOfDay: 2, fishing: false });
  } else {
    assert.equal(changed, true); assert.equal(observation.identities.dataSame, false);
    assert.equal(calls.length, 1, 'the first changed-source callback must stop further foe generation');
    assert.equal(o.sessions.length, 0, 'changed native map data must refuse before the real Session factory');
    assert.equal(observation.actualSessionClass, null);
    assert.equal(failure?.name, 'Error'); assert.equal(failure?.message, 'legacy-battle-native-lifecycle-changed');
    assert.equal(app.saveBlocked, false, 'the failed reservation must release the App battle owner');
  }
});
