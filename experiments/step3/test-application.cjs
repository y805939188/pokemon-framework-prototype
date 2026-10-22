'use strict';
// The game application over in-memory ports (success, refusal, failure, duplicate, state ownership) and over the real
// Showdown-backed session. The same contract is exercised in the real MZ host by the flow test scenarios T1-T12.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../js/engine/build/engine.cjs');
const golden = require('./fixtures/result-hash-golden.json');
const { GameApplication, outcomeCode } = E.app;
const K = E.fakes;
const F = E.fixtures;

const result = name => JSON.parse(JSON.stringify(golden.entries.find(e => e.name === name).result));
// Since step 4 the application creates the foes (species + level) from content that carries creation data: the
// assembled sample (the fixture party's species are in it with the same numbers) and a seeded random.
const fs = require('node:fs'); const path = require('node:path');
const SRC = path.resolve(__dirname, '../../content/sample'); const readC = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const sample = E.contentRuntime.assembleContent(E.contentCompile.compileContent({ manifest: readC('manifest.json'), sources: readC('sources.json'), species: readC('species.json'), overlays: readC('overlays.json'), grants: readC('grants.json') }).data, E.dex.createDexLookup()).content;
const lcg = seed => { let s = seed >>> 0; return n => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return Math.floor((s / 4294967296) * n); }; };
const request = r => ({ battleId: r.battleId, kind: 'wild', foes: [{ species: 'Pidgey', level: 5 }], seq: 1 });
const snapshot = state => JSON.stringify(state.current());
// the save keys members by the sample content's ids since step 5.0 (D5-3); sessions still see Showdown names
const saved = () => F.savedFor(F.makeGame(), sample);
function setup(first = result('caught with master ball'), game = saved()) {
  const state = K.createMemoryState(game), projection = K.createRecordingProjection(), sessions = K.createFakeSessions(first);
  const app = new GameApplication({ state, sessions, projection, content: () => ({ content: sample }), random: lcg(3) });
  return { state, projection, sessions, app };
}

test('success: the result is committed once, the persistent state is replaced not mutated, the host is told', async () => {
  const r = result('caught with master ball'); const { state, projection, sessions, app } = setup(r);
  const before = state.current(), beforeJson = snapshot(state);
  const handle = await app.startBattle(request(r));
  assert.equal(sessions.created.length, 1);
  assert.deepEqual(sessions.created[0].game, E.speciesKey.battleView(before, sample), 'the factory sees the battle view of the state (Showdown names), never the stored object');
  assert.notEqual(sessions.created[0].game, before);
  assert.equal(snapshot(state), beforeJson, 'starting a battle changes nothing');
  const outcome = app.finishBattle(handle, request(r));
  assert.deepEqual([outcome.code, outcome.commit, outcome.kind, outcome.projection, outcome.aborted], [2, 'applied', 'caught', 'ok', undefined]);
  assert.equal(state.replaced.length, 1); assert.notEqual(state.current(), before); assert.equal(snapshot({ current: () => before }), beforeJson, 'the previous state object is untouched');
  assert.equal(state.current().party.length, 4, 'the captured member joined'); assert.equal(state.current().bag.masterball, undefined);
  assert.equal(state.current().appliedBattles[r.battleId].hash, E.state.resultHash(r));
  assert.deepEqual(projection.outcomes.map(o => [o.code, o.commit]), [[2, 'applied']]);
  assert.deepEqual(outcome.result, r);
});

test('duplicate: finishing the same battle again is a no-op for the state; nothing is spent or granted twice', async () => {
  const r = result('caught with master ball'); const { state, app } = setup(r);
  const handle = await app.startBattle(request(r));
  app.finishBattle(handle, request(r));
  const afterFirst = snapshot(state);
  const again = app.finishBattle(handle, request(r));
  assert.equal(again.commit, 'already-applied'); assert.equal(again.code, 2);
  assert.equal(state.replaced.length, 1, 'the state was replaced exactly once'); assert.equal(snapshot(state), afterFirst);
  assert.equal(app.commitResult(r), 'already-applied');
});

test('conflict: a different result for an already applied battle is refused, the state stays as it is', async () => {
  const r = result('wild run'); const { state, projection, app } = setup(r);
  const handle = await app.startBattle(request(r)); app.finishBattle(handle, request(r));
  const afterFirst = snapshot(state);
  const other = { ...r, bag: { potion: -1 } };
  const outcome = app.finishBattle({ result: () => other }, request(r));
  assert.deepEqual([outcome.code, outcome.commit, outcome.aborted], [0, 'none', true]);
  assert.match(outcome.error, /already applied with a different result/);
  assert.equal(snapshot(state), afterFirst); assert.equal(state.replaced.length, 1);
  assert.equal(projection.outcomes.at(-1).code, 0, 'the host is told it was aborted');
});

test('a result that breaks the contract aborts without any partial change (unknown member, bag below zero, wrong protocol)', () => {
  for (const [label, mutate, message] of [
    ['unknown member', r => { r.members['A-9999'] = { level: 5 }; }, /unknown member/],
    ['bag below zero', r => { r.bag = { potion: -50 }; }, /bag would go negative/],
    ['wrong protocol', r => { r.protocol = 99; }, /unsupported protocol/],
    ['write outside the write set', r => { r.members['A-0001'].species = 'Mew'; }, /outside the write set/],
  ]) {
    const r = result('wild run'); mutate(r); const { state, app } = setup(r); const before = snapshot(state);
    const outcome = app.finishBattle({ result: () => r }, request(r));
    assert.deepEqual([outcome.code, outcome.commit, outcome.aborted], [0, 'none', true], label); assert.match(outcome.error, message, label);
    assert.equal(snapshot(state), before, label); assert.equal(state.replaced.length, 0, label);
  }
});

test('an unfinished or closed session aborts: no result can be committed from it', async () => {
  const r = result('wild run'); const { state, projection, sessions, app } = setup(() => { throw new Error('battle not finished'); });
  const handle = await app.startBattle(request(r)); const before = snapshot(state);
  const outcome = app.finishBattle(handle, request(r));
  assert.deepEqual([outcome.code, outcome.commit, outcome.aborted, outcome.error], [0, 'none', true, 'battle not finished']);
  assert.equal(snapshot(state), before); assert.equal(state.replaced.length, 0); assert.equal(projection.outcomes.length, 1);
  sessions.next = result('wild run'); // the same app can run the next battle normally
  assert.equal(app.finishBattle(await app.startBattle(request(r)), request(r)).commit, 'applied');
});

test('committed but the host projection fails: the commit stands, is reported, and a retry neither repeats nor loses it', async () => {
  const r = result('caught with master ball'); const { state, projection, app } = setup(r);
  const handle = await app.startBattle(request(r));
  projection.failures = 1;
  const outcome = app.finishBattle(handle, request(r));
  assert.deepEqual([outcome.commit, outcome.aborted, outcome.projection, outcome.projectionError], ['applied', undefined, 'failed', 'host projection failed']);
  assert.equal(state.replaced.length, 1); assert.equal(state.current().party.length, 4);
  const retry = app.finishBattle(handle, request(r));
  assert.deepEqual([retry.commit, retry.projection], ['already-applied', 'ok']);
  assert.equal(state.replaced.length, 1, 'no second commit'); assert.equal(state.current().party.length, 4, 'no second capture');
});

test('an abort whose projection also fails still reports the abort and never throws', () => {
  const { projection, app } = setup(); projection.failures = 1;
  const outcome = app.abortBattle({ battleId: 'x#1' }, new Error('scene closed'));
  assert.equal(outcome.battleId, 'x#1');
  assert.deepEqual([outcome.code, outcome.commit, outcome.error, outcome.projection], [0, 'none', 'scene closed', 'failed']);
  assert.equal(app.abortBattle(null, 'plain string').error, 'plain string');
  assert.equal(app.abortBattle(null, 'plain string').battleId, null);
});

test('an invalid outcome is rejected before any commit, including direct commits and retries', () => {
  for (const invalid of [undefined, null, {}, [], { kind: 3, winner: null }, { kind: '', winner: null }, { kind: 'win', winner: 3 }, { kind: 'caught' }]) { // the last one: no winner at all
    const r = result('caught with master ball'); r.outcome = invalid;
    const { state, projection, app } = setup(r); const before = snapshot(state);
    for (let attempt = 0; attempt < 2; attempt++) {
      const outcome = app.finishBattle({ result: () => r }, request(r));
      assert.deepEqual([outcome.battleId, outcome.code, outcome.commit, outcome.aborted, outcome.projection], [r.battleId, 0, 'none', true, 'ok']);
      assert.match(outcome.error, /invalid battle outcome/);
      assert.equal(snapshot(state), before, 'no partial capture, bag, reward or ledger entry');
      assert.equal(state.replaced.length, 0);
      assert.equal(projection.outcomes.at(-1).code, 0);
    }
    assert.throws(() => app.commitResult(r), /invalid battle outcome/);
    r.outcome = result('caught with master ball').outcome;
    const first = app.finishBattle({ result: () => r }, request(r));
    const after = snapshot(state);
    assert.equal(first.commit, 'applied');
    assert.equal(app.finishBattle({ result: () => r }, request(r)).commit, 'already-applied');
    assert.equal(snapshot(state), after); assert.equal(state.replaced.length, 1, 'a corrected result can be committed exactly once');
  }
});

test('an unusable state (a save that could not be read) refuses to start and to finish, and nothing is installed', async () => {
  const r = result('wild run'); const { state, sessions, app } = setup(r);
  state.failRead = new Error('the save state is not usable (corrupt)');
  await assert.rejects(app.startBattle(request(r)), /not usable/); assert.equal(sessions.created.length, 0);
  const outcome = app.finishBattle({ result: () => r }, request(r));
  assert.deepEqual([outcome.commit, outcome.aborted], ['none', true]); assert.match(outcome.error, /not usable/); assert.equal(state.replaced.length, 0);
  state.failRead = null; state.failReplace = new Error('store refused');
  const refused = app.finishBattle({ result: () => r }, request(r));
  assert.deepEqual([refused.commit, refused.aborted, refused.error], ['none', true, 'store refused']);
});

test('a save that refers to content that no longer exists is explained before any session exists', async () => {
  const game = F.makeGame(); game.party[1].species = 'Missingno'; game.party[0].moves[0].id = 'notamove';
  const r = result('wild run'); const { sessions, app } = setup(r, game);
  const dex = E.dex.createDexLookup();
  const withDex = new GameApplication({ state: K.createMemoryState(game), sessions, projection: K.createRecordingProjection(), content: () => ({ content: F.content, dex }) });
  await assert.rejects(withDex.startBattle(request(r)), err => /the save refers to content that no longer exists/.test(err.message) && /species "Missingno"/.test(err.message) && /notamove/.test(err.message));
  assert.equal(sessions.created.length, 0);
});

test('outcome codes: win by the player 1, caught 2, ran 3, anything else 4', () => {
  const o = (kind, winner) => ({ outcome: { kind, winner } });
  assert.deepEqual([outcomeCode(o('win', 'Player')), outcomeCode(o('win', 'Trainer')), outcomeCode(o('win', 'Wild')), outcomeCode(o('caught', null)), outcomeCode(o('run', null)), outcomeCode(o('tie', null))], [1, 4, 4, 2, 3, 4]);
});

// ---- the same contract with the real adapters (Showdown-backed session) in Node
const real = () => {
  const state = K.createMemoryState(F.savedFor(F.makeGame({ bag: { potion: 3, pokeball: 3 } }), sample)), projection = K.createRecordingProjection();
  const sessions = E.composition.createBattleSessionFactory({ content: () => sample, seed: () => [1, 2, 3, 4] });
  return { state, projection, app: new GameApplication({ state, sessions, projection, content: () => ({ content: sample, dex: E.dex.createDexLookup() }), random: lcg(3) }) };
};
const req = (id, foes = [{ species: 'Pidgey', level: 5 }], kind = 'wild') => ({ battleId: id, kind, foes, seq: 1 });

test('real session: a run is committed once through the application and a repeat does nothing', async () => {
  const { state, projection, app } = real();
  const r = req('real-run#1'); const session = await app.startBattle(r);
  assert.equal((await session.run()).ok, true);
  const outcome = app.finishBattle(session, r);
  assert.deepEqual([outcome.code, outcome.commit, outcome.kind, outcome.projection], [3, 'applied', 'run', 'ok']);
  const again = app.finishBattle(session, r);
  assert.equal(again.commit, 'already-applied'); assert.equal(state.replaced.length, 1);
  assert.deepEqual(projection.outcomes.map(o => o.code), [3, 3]);
});

test('real session: a won trainer battle with a level-up and an item commits the session working copy as one change', async () => {
  const game = F.savedFor(F.makeGame({ bag: { potion: 3 } }), sample); game.party[0].exp = E.growth.minExp('parabolic', 51) - 1; game.party[0].hp = 70;
  const state = K.createMemoryState(game), projection = K.createRecordingProjection();
  const sessions = E.composition.createBattleSessionFactory({ content: () => sample, seed: () => [1, 2, 3, 4] });
  const app = new GameApplication({ state, sessions, projection, content: () => ({ content: sample }), random: lcg(3) });
  const r = req('real-win#1', [{ species: 'Pidgey', level: 5 }], 'trainer'); const s = await app.startBattle(r);
  assert.equal((await s.useItem('potion', 'A-0001')).ok, true);
  assert.equal(state.current().bag.potion, 3, 'the persistent bag is untouched while the battle runs (the session works on a copy)');
  assert.equal(state.current().party[0].level, 50);
  for (let i = 0; i < 8 && !s.finished; i++) { if (s.pendingLearn) { await s.decideLearn(null); continue; } await s.chooseMove(1); }
  const outcome = app.finishBattle(s, r);
  assert.deepEqual([outcome.code, outcome.commit, outcome.kind], [1, 'applied', 'win']);
  assert.equal(state.current().party[0].level, 51); assert.equal(state.current().bag.potion, 2); assert.equal(state.replaced.length, 1);
});

test('real session: a session closed by a failed rollback aborts and leaves the persistent state exactly as it was', async () => {
  const game = F.savedFor(F.makeGame({ bag: { potion: 3 } }), sample); game.party[0].hp = 50;
  const state = K.createMemoryState(game), projection = K.createRecordingProjection();
  const sessions = E.composition.createBattleSessionFactory({ content: () => sample, seed: () => [1, 2, 3, 4] });
  const app = new GameApplication({ state, sessions, projection, content: () => ({ content: sample }), random: lcg(3) });
  const r = req('real-broken#1'); const s = await app.startBattle(r); const before = snapshot(state);
  const act = s.gw.act.bind(s.gw);
  s.gw.act = async (...a) => { await act(...a); throw new Error('operation failed'); }; // fails after the engine accepted the choice ...
  s._driver = { ...s._driver, fromCheckpoint: async () => { throw new Error('rollback failed'); } }; // ... and the rollback fails too
  await assert.rejects(s.useItem('potion', 'A-0001'), e => e instanceof E.session.SessionBrokenError);
  const outcome = app.finishBattle(s, r);
  assert.deepEqual([outcome.code, outcome.commit, outcome.aborted], [0, 'none', true]); assert.match(outcome.error, /operation failed.*rollback failed/);
  assert.equal(snapshot(state), before); assert.equal(state.replaced.length, 0);
  assert.equal(projection.outcomes.at(-1).code, 0);
});
