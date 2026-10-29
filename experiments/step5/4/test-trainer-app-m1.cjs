'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../../../js/engine/build/engine.cjs');
const K = E.fakes;

const SRC = path.resolve(__dirname, '../../../content/sample');
const read = file => JSON.parse(fs.readFileSync(path.join(SRC, file), 'utf8'));
const optional = file => fs.existsSync(path.join(SRC, file)) ? read(file) : undefined;
const inputs = () => Object.fromEntries(Object.entries({ manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json'), grants: optional('grants.json'), regionalDex: optional('regional-dex.json'), settings: optional('settings.json'), items: optional('items.json'), shops: optional('shops.json'), mapMetadata: optional('map-metadata.json') }).filter(([, value]) => value !== undefined));
const type = { id: 'youngster', nameKey: 'trainer.type.youngster', gender: 0, baseMoney: 20, skillLevel: 3, flags: ['NoName'], items: [{ item: 'potion', count: 1 }], battleBgm: 'Battle trainer', victoryBgm: '', introBgm: 'Intro', openingText: 'Hello', winText: 'I won', loseText: 'I lost', source: 'author-placeholder' };
const record = { id: 'route-1-rival', type: 'youngster', name: 'Avery', version: 2, source: 'author-placeholder', items: [{ item: 'potion', count: 2 }], party: [{ species: 'pidgey', level: 19, moves: ['tackle'] }, { species: 'caterpie', level: 10 }] };
const clone = value => JSON.parse(JSON.stringify(value));
const lcg = seed => { let state = seed >>> 0; return n => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return Math.floor((state / 4294967296) * n); }; };

function contentWith(npc = record) {
  const compiled = E.contentCompile.compileContent({ ...inputs(), trainerTypes: [type], trainers: [npc] });
  assert.equal(compiled.ok, true, JSON.stringify(compiled.errors));
  const assembled = E.contentRuntime.assembleContent(compiled.data, E.dex.createDexLookup());
  assert.deepEqual(assembled.errors, []);
  return assembled.content;
}
function gameWith(content, money = 1000) {
  const game = E.state.newGame({ content, party: [], money });
  const member = E.memberFactory.createMember({ id: 'P1', species: 'Charmander', level: 12 }, content, lcg(5));
  game.party = [E.speciesKey.toPersistentMember(member, content)];
  game.nextMemberOrdinal = '2';
  return game;
}
function request(id = 'trainer#1', npc = record) {
  return { battleId: id, trainer: { id: npc.id, version: npc.version }, seq: 1, canLose: true };
}
function win(id = 'trainer#1', winner = 'Player') {
  return { protocol: 1, battleId: id, outcome: { kind: 'win', winner }, members: {}, bag: {}, captured: [], dex: { seen: [], owned: [] } };
}
function fakeApp({ content = contentWith(), game, result = win(), random = lcg(9) } = {}) {
  const state = K.createMemoryState(game ?? gameWith(content));
  const sessions = K.createFakeSessions(result);
  const projection = K.createRecordingProjection();
  const app = new E.app.GameApplication({ state, sessions, projection, content: () => ({ content }), random, clock: () => 1234567 });
  return { app, state, sessions, projection, content };
}

for (const timing of ['factory', 'after-start']) test(`AM1-ULTRA-01 private reward facts survive ${timing} setup mutation`, async () => {
  const w = fakeApp();
  const original = w.sessions.create;
  let escaped;
  const corrupt = setup => {
    Object.assign(setup.trainer, { id: 'forged-trainer', version: 7, baseMoney: 2000 });
    setup.foes[0].level = 100;
    setup.trainer.ai.items[0].count = 999;
  };
  w.sessions.create = function(req, game, setup) {
    escaped = setup;
    if (timing === 'factory') corrupt(setup);
    req.moneyGain = false; // The host cannot change the qualification captured before this callback either.
    return original.call(this, req, game, setup);
  };
  const req = request(); const session = await w.app.startTrainerBattle(req);
  if (timing === 'after-start') corrupt(escaped);
  const out = w.app.finishBattle(session, req), next = w.state.current();
  assert.equal(out.commit, 'applied');
  assert.equal(next.money, 1380);
  assert.deepEqual(next.defeatedTrainers, { 'route-1-rival@2': { id: record.id, version: 2 } });
  assert.deepEqual(next.appliedBattles[req.battleId].trainer, { id: record.id, version: 2 });
  assert.equal(w.state.replaced.length, 1);
  assert.equal(w.app.finishBattle(session, req).commit, 'already-applied');
  assert.equal(w.state.replaced.length, 1);
});

test('AM1-ULTRA-02 disabled money gain is sealed, does not normalize old wallets, and preserves atomic retry/replay', async () => {
  for (const money of [0, 1000, 1000000]) {
    const content = contentWith(), w = fakeApp({ content, game: gameWith(content, money) });
    const original = w.sessions.create;
    w.sessions.create = function(req, game, setup) { req.moneyGain = true; return original.call(this, req, game, setup); };
    const req = { ...request(), moneyGain: false }, session = await w.app.startTrainerBattle(req);
    const before = clone(w.state.current());
    w.state.failReplace = new Error('money-disabled-zero-write');
    const failed = w.app.finishBattle(session, req);
    assert.equal(failed.commit, 'none'); assert.equal(failed.pending, true);
    assert.deepEqual(w.state.current(), before);
    w.state.failReplace = null;
    const out = w.app.finishBattle(session, req), next = w.state.current();
    assert.equal(out.commit, 'applied');
    assert.equal(out.trainerReward, undefined, 'no amount or normalization message is projected');
    assert.equal(next.money, money);
    assert.equal(next.stats.battle_money_gained, before.stats.battle_money_gained);
    assert.deepEqual(next.defeatedTrainers['route-1-rival@2'], { id: record.id, version: 2 });
    assert.equal(w.state.replaced.length, 1);
    assert.equal(w.app.finishBattle(session, req).commit, 'already-applied');
    assert.equal(w.state.replaced.length, 1);
    assert.deepEqual(E.saveSchema.validateGame(next), []);
  }
});

test('AM1-ULTRA-02 validates the public money-gain qualification before invoking ports', async () => {
  const w = fakeApp(); let reads = 0; const original = w.state.read;
  w.state.read = function() { reads++; return original.call(this); };
  for (const moneyGain of ['false', 0, null]) await assert.rejects(w.app.startTrainerBattle({ ...request(), moneyGain }), /moneyGain must be boolean/);
  assert.equal(reads, 0);
  assert.equal(w.sessions.created.length, 0);
  assert.equal(w.state.replaced.length, 0);
  await w.app.startTrainerBattle({ ...request(), moneyGain: true });
  assert.equal(w.sessions.created.length, 1);
});

test('A-M1 trainer query/start uses NPC owner, deterministic team, projections and authoritative obedience context', async () => {
  const w = fakeApp();
  const before = JSON.stringify(w.state.current());
  const projection = w.app.trainerRecord(record.id, record.version);
  assert.equal(projection.baseMoney, 20);
  assert.deepEqual(projection.ai, { skillLevel: 3, flags: ['NoName'], items: [{ item: 'potion', count: 2 }] });
  assert.equal(projection.presentation.introBgm, 'Intro');
  assert.equal(w.app.trainerRecord(record.id, 99), null);
  const session = await w.app.startTrainerBattle(request());
  assert.ok(session);
  const created = w.sessions.created[0];
  assert.equal(created.request.kind, 'trainer');
  assert.equal(created.setup.foes.length, 2);
  assert.ok(created.setup.foes.every(member => member.owner.id !== 0 && member.owner.name === 'Avery' && member.owner.gender === 0));
  assert.notDeepEqual(created.setup.foes[0].owner, created.game.player, 'NPC owner must not come from game.player');
  assert.equal(created.setup.trainer.id, record.id);
  assert.equal(created.setup.obedience.player.id, created.game.player.id);
  assert.deepEqual(Object.keys(created.setup.obedience.members), ['P1']);
  assert.equal(created.setup.obedience.badges, 0);
  assert.equal(created.setup.obedience.anyHighLevel, false);
  assert.equal(created.setup.obedience.foreignHighLevel, true);
  assert.equal(JSON.stringify(w.state.current()), before);
  const again = fakeApp();
  await again.app.startTrainerBattle(request());
  assert.deepEqual(again.sessions.created[0].setup.foes, created.setup.foes);
});

test('A-M1 missing records and held NPC data fail before session creation; the original held gates stay closed', async () => {
  const missing = fakeApp();
  const before = JSON.stringify(missing.state.current());
  await assert.rejects(missing.app.startTrainerBattle(request('missing#1', { ...record, version: 99 })), /missing trainer record/);
  assert.equal(missing.sessions.created.length, 0);
  assert.equal(JSON.stringify(missing.state.current()), before);
  const heldNpc = { ...record, party: [{ species: 'pidgey', level: 19, item: 'leftovers', moves: ['tackle'] }] };
  const heldContent = contentWith(heldNpc), heldState = K.createMemoryState(gameWith(heldContent));
  const heldSessions = E.composition.createBattleSessionFactory({ content: () => heldContent, seed: () => [1, 2, 3, 4] });
  const heldApp = new E.app.GameApplication({ state: heldState, sessions: heldSessions, projection: K.createRecordingProjection(), content: () => ({ content: heldContent, dex: E.dex.createDexLookup() }), random: lcg(9), clock: () => 1234567 });
  const heldBefore = JSON.stringify(heldState.current());
  await assert.rejects(heldApp.startTrainerBattle(request('held#1', heldNpc)), /held-item-battle-disabled/);
  assert.equal(JSON.stringify(heldState.current()), heldBefore);
  const ordinary = fakeApp();
  await ordinary.app.startTrainerBattle(request('missing#2', { ...record, version: 99 })).catch(() => {});
  await ordinary.app.startTrainerBattle(request('ordinary#2'));
  assert.equal(ordinary.sessions.created.length, 1, 'a failed reservation is released without blocking a valid successor');
});

test('A-M1 trainer victory commits primary result, actual prize, defeat record and ledger in one replace; rematches are allowed', async () => {
  const w = fakeApp();
  const req = request();
  const session = await w.app.startTrainerBattle(req);
  const outcome = w.app.finishBattle(session, req);
  assert.equal(outcome.commit, 'applied');
  assert.deepEqual(outcome.trainerReward, { id: record.id, version: 2, nominal: 380, before: 1000, after: 1380, actual: 380, normalizationLoss: 0 });
  assert.equal(w.state.replaced.length, 1);
  const now = w.state.current();
  assert.equal(now.money, 1380);
  assert.equal(now.stats.battle_money_gained, 380);
  assert.equal(now.stats.trainer_battles_won, 1);
  assert.deepEqual(now.defeatedTrainers['route-1-rival@2'], { id: record.id, version: 2 });
  assert.deepEqual(now.appliedBattles['trainer#1'].trainer, { id: record.id, version: 2 });
  assert.deepEqual(E.saveSchema.validateGame(now), []);
  const after = JSON.stringify(now);
  assert.equal(w.app.finishBattle(session, req).commit, 'already-applied');
  assert.equal(JSON.stringify(w.state.current()), after);
  assert.equal(w.state.replaced.length, 1);
  const rematch = request('trainer#rematch');
  w.sessions.next = win('trainer#rematch');
  const second = await w.app.startTrainerBattle(rematch);
  assert.equal(w.app.finishBattle(second, rematch).trainerReward.actual, 380);
  assert.equal(w.state.current().money, 1760, 'an intentional rematch can win another base prize');
  assert.deepEqual(Object.keys(w.state.current().defeatedTrainers), ['route-1-rival@2']);
  assert.equal(w.state.replaced.length, 2);
});

test('A-M1 cap, zero actual delta and old-over-cap normalization are distinct', async () => {
  const capped = fakeApp({ game: gameWith(contentWith(), 999990) });
  const req = request();
  const session = await capped.app.startTrainerBattle(req);
  const outcome = capped.app.finishBattle(session, req);
  assert.deepEqual(outcome.trainerReward, { id: record.id, version: 2, nominal: 380, before: 999990, after: 999999, actual: 9, normalizationLoss: 0 });
  assert.equal(capped.state.current().stats.battle_money_gained, 9);
  const rich = fakeApp({ game: gameWith(contentWith(), 1000000) });
  const richSession = await rich.app.startTrainerBattle(req);
  const richOutcome = rich.app.finishBattle(richSession, req);
  assert.deepEqual(richOutcome.trainerReward, { id: record.id, version: 2, nominal: 380, before: 1000000, after: 999999, actual: 0, normalizationLoss: 1 });
  assert.equal(rich.state.current().stats.battle_money_gained, 0);
  assert.ok(richOutcome.diagnostics.some(line => line.includes('规范化下降 1')));
});

test('A-M1 defeat/abort has no prize or new defeated record; projection failure never rolls back an installed result', async () => {
  const lost = fakeApp({ result: win('trainer#1', 'Trainer') });
  const req = request();
  const lostSession = await lost.app.startTrainerBattle(req);
  const loss = lost.app.finishBattle(lostSession, req);
  assert.equal(loss.code, 4);
  assert.equal(loss.trainerReward, undefined);
  assert.deepEqual(lost.state.current().defeatedTrainers, {});
  const w = fakeApp();
  w.projection.failures = 1;
  const session = await w.app.startTrainerBattle(req);
  const outcome = w.app.finishBattle(session, req);
  assert.equal(outcome.projection, 'failed');
  assert.equal(outcome.commit, 'applied');
  assert.equal(w.state.current().money, 1380);
  assert.deepEqual(w.state.current().defeatedTrainers['route-1-rival@2'], { id: record.id, version: 2 });
});

test('A-M1 replace failure is zero-write and a same-context retry settles once', async () => {
  const w = fakeApp();
  const req = request();
  const session = await w.app.startTrainerBattle(req);
  w.state.failReplace = new Error('injected replace failure');
  const pending = w.app.finishBattle(session, req);
  assert.equal(pending.commit, 'none');
  assert.equal(pending.pending, true);
  assert.equal(w.state.current().money, 1000);
  assert.deepEqual(w.state.current().defeatedTrainers, {});
  w.state.failReplace = null;
  const done = w.app.finishBattle(session, req);
  assert.equal(done.commit, 'applied');
  assert.equal(done.trainerReward.actual, 380);
  assert.equal(w.state.current().money, 1380);
  assert.equal(w.app.finishBattle(session, req).commit, 'already-applied');
  assert.equal(w.state.replaced.length, 1);
});

test('A-M1 late session after abort cannot install or clear a successor reservation', async () => {
  const content = contentWith(), game = gameWith(content), state = K.createMemoryState(game), projection = K.createRecordingProjection();
  let release;
  const sessions = { create: () => new Promise(resolve => { release = () => resolve({ result: () => win() }); }) };
  const app = new E.app.GameApplication({ state, sessions, projection, content: () => ({ content }), random: lcg(9), clock: () => 1234567 });
  const req = request();
  const pending = app.startTrainerBattle(req);
  app.abortBattle(req, new Error('cancelled while creating'));
  release();
  await assert.rejects(pending, /late session/);
  assert.equal(state.current().money, 1000);
  assert.deepEqual(state.current().defeatedTrainers, {});
});
