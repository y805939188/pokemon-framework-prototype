'use strict';
// The same application contract with a scripted battle engine behind the BattleDriver seam: no Showdown is loaded.
// (Showdown itself is covered by the contract, matrix and integration suites; the real MZ host by the flow scenarios.)
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../js/engine/build/engine.cjs');
const F = E.fixtures;
const K = E.fakes;
const { GameApplication } = E.app;

const WIN = { events: ['|move|p1a: A-0001|Flamethrower|p2a: W1-1', '|-damage|p2a: W1-1|0 fnt', '|faint|p2a: W1-1'], damage: { 'W1-1': 9999 }, end: { winner: 'Player', reason: 'win' } };
const req = (id, kind = 'trainer') => ({ battleId: id, kind, foes: [{ species: 'Pidgey', level: 5 }], seq: 1 });
function world(script, game = F.makeGame()) {
  const factory = E.scripted.createScriptedFactory(script);
  const state = K.createMemoryState(game), projection = K.createRecordingProjection();
  const sessions = E.composition.createBattleSessionFactory({ content: () => F.content, driver: factory });
  const app = new GameApplication({ state, sessions, projection, content: () => ({ content: F.content }) });
  return { factory, state, projection, app };
}
const snapshot = state => JSON.stringify(state.current());

test('a won battle runs end to end on the scripted engine and commits once; a repeat does nothing', async () => {
  const { state, projection, app } = world({ turns: [WIN] });
  const before = state.current(), r = req('scripted-win#1');
  const session = await app.startBattle(r);
  assert.equal((await session.chooseMove(1)).ok, true); assert.equal(session.finished, true);
  const outcome = app.finishBattle(session, r);
  assert.deepEqual([outcome.code, outcome.commit, outcome.kind, outcome.projection], [1, 'applied', 'win', 'ok']);
  assert.ok(state.current().party[0].exp > before.party[0].exp, 'the winner received experience from the awarded growth');
  assert.equal(state.current().party[0].level, 50); assert.deepEqual(state.current().bag, before.bag);
  assert.equal(state.replaced.length, 1); assert.equal(state.current().appliedBattles['scripted-win#1'].hash, E.state.resultHash(outcome.result));
  assert.equal(app.finishBattle(session, r).commit, 'already-applied'); assert.equal(state.replaced.length, 1);
  assert.deepEqual(projection.outcomes.map(o => o.code), [1, 1]);
  assert.equal(Object.keys(require.cache).some(k => /showdown/i.test(k) && /dist/.test(k)), false, 'Showdown was never loaded');
});

test('an item used in battle is reserved, consumed by the engine line, and spent exactly once in the committed result', async () => {
  const game = F.makeGame({ bag: { potion: 3 } }); game.party[0].hp = 70;
  const { state, app } = world({ maxhp: { 'A-0001': 153 }, turns: [{ events: ['|rpg|item|p1|potion|A-0001|ok|20', ...WIN.events], damage: { 'A-0001': -20, 'W1-1': 9999 }, end: WIN.end }] }, game);
  const r = req('scripted-item#1'); const s = await app.startBattle(r);
  assert.equal((await s.useItem('potion', 'A-0001')).ok, true);
  assert.equal(state.current().bag.potion, 3, 'the persistent bag is not touched while the battle runs');
  const outcome = app.finishBattle(s, r);
  assert.equal(outcome.commit, 'applied'); assert.equal(state.current().bag.potion, 2); assert.equal(state.current().party[0].hp, 90);
});

test('running ends the battle as "ran" with nothing else changed', async () => {
  const { state, app } = world({ turns: [{ events: ['|rpg|run|p1|ok'], end: { winner: null, reason: 'run', outcome: { kind: 'run' } } }] });
  const before = snapshot(state), r = req('scripted-run#1', 'wild'); const s = await app.startBattle(r);
  assert.equal((await s.run()).ok, true);
  const outcome = app.finishBattle(s, r);
  assert.deepEqual([outcome.code, outcome.kind, outcome.commit], [3, 'run', 'applied']);
  const after = JSON.parse(snapshot(state)); const was = JSON.parse(before);
  assert.deepEqual(after.party.map(m => [m.id, m.level, m.hp]), was.party.map(m => [m.id, m.level, m.hp])); assert.deepEqual(after.bag, was.bag);
});

test('an engine failure after the engine accepted a choice is rolled back through the driver checkpoint; the retry gives the clean result', async () => {
  const clean = world({ turns: [WIN] }), hit = world({ turns: [WIN] });
  const rc = req('scripted-retry#1'), rh = req('scripted-retry#1');
  const sc = await clean.app.startBattle(rc); await sc.chooseMove(1);
  const sh = await hit.app.startBattle(rh);
  hit.factory.failNext('choose', new Error('engine hiccup'), 1, true);
  await assert.rejects(sh.chooseMove(1), /engine hiccup/);
  assert.equal(sh.broken, null); assert.equal(sh.finished, false); assert.ok(sh.currentRequest(), 'the pending request is back');
  assert.equal(hit.factory.drivers.length, 2, 'a second driver was opened from the checkpoint');
  assert.equal((await sh.chooseMove(1)).ok, true);
  const oc = clean.app.finishBattle(sc, rc), oh = hit.app.finishBattle(sh, rh);
  assert.equal(E.state.resultHash(oh.result), E.state.resultHash(oc.result)); assert.equal(snapshot(hit.state), snapshot(clean.state));
});

test('a failure whose rollback also fails closes the session; the application aborts and the persistent state is untouched', async () => {
  const { factory, state, projection, app } = world({ turns: [WIN] });
  const r = req('scripted-broken#1'); const s = await app.startBattle(r); const before = snapshot(state);
  factory.failNext('choose', new Error('engine failed'), 1, true); factory.failRestore = new Error('checkpoint unusable');
  await assert.rejects(s.chooseMove(1), e => e instanceof E.session.SessionBrokenError && /engine failed/.test(e.message) && /checkpoint unusable/.test(e.message));
  await assert.rejects(s.chooseMove(1), e => e === s.broken);
  const outcome = app.finishBattle(s, r);
  assert.deepEqual([outcome.code, outcome.commit, outcome.aborted], [0, 'none', true]); assert.match(outcome.error, /engine failed.*checkpoint unusable/);
  assert.equal(snapshot(state), before); assert.equal(state.replaced.length, 0); assert.equal(projection.outcomes.at(-1).code, 0);
});

test('the driver seam is narrow: the scripted driver implements exactly the operations the session uses', async () => {
  const { factory, app } = world({ turns: [WIN] });
  await app.startBattle(req('scripted-seam#1'));
  const seam = ['choose', 'act', 'chooseSlots', 'cancel', 'query', 'readState', 'seedState', 'applyGrowth', 'moveInfo', 'refreshRequests', 'activeId', 'awaitingChoice', 'drain', 'discardQueued', 'checkpoint'];
  for (const name of seam) assert.equal(typeof factory.drivers[0][name], 'function', name);
  const extras = Object.getOwnPropertyNames(Object.getPrototypeOf(factory.drivers[0])).filter(n => n !== 'constructor' && !seam.includes(n) && !['emit', 'guard', 'request', 'issueRequests', 'resolveIfReady', 'owner'].includes(n));
  assert.deepEqual(extras, [], 'nothing beyond the seam is public on the fake');
});
