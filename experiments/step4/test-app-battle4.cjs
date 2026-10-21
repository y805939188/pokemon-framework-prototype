'use strict';
// Step 4 / B, the battle side of the application: foes are created from the content (no fixture), a battle needs an
// able member, balls are disabled when a catch would have nowhere to go (D1), a lost or drawn battle settles money and
// heal in the same replacement (D3) exactly once, and encounters are decided by the application. The first half uses
// in-memory ports; the second half real Showdown-backed sessions with controlled state and seeds.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../../js/engine/build/engine.cjs');
const { GameApplication } = E.app;
const K = E.fakes;
const S = E.state;

const SRC = path.resolve(__dirname, '../../content/sample');
const read = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const content = E.contentRuntime.assembleContent(E.contentCompile.compileContent({ manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json'), grants: read('grants.json') }).data, E.dex.createDexLookup()).content;
const lcg = seed => { let s = seed >>> 0; return n => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return Math.floor((s / 4294967296) * n); }; };
const clone = x => JSON.parse(JSON.stringify(x));
const mk = (id, species, level, extra = {}) => ({ ...E.memberFactory.createMember({ id, species, level }, content, lcg(level * 7 + id.length)), ...extra });
const gameOf = (party, { bag = { pokeball: 5, potion: 2 }, money = 3000, boxes = [] } = {}) => { const g = S.newGame({ party: [] }); g.party = party; g.bag = bag; g.money = money; g.boxes = boxes; return g; };
const req = (id, foes = [{ species: 'pidgey', level: 3 }], kind = 'wild', seq = 1) => ({ battleId: id, kind, foes, seq });

function fakeApp(game, { first, limits, noMoneyLoss, random = lcg(9) } = {}) {
  const state = K.createMemoryState(game), sessions = K.createFakeSessions(first || (() => { throw new Error('unfinished'); })), projection = K.createRecordingProjection();
  const app = new GameApplication({ state, sessions, projection, content: () => ({ content }), random }, { limits, noMoneyLoss });
  return { state, sessions, projection, app };
}

test('startBattle creates the foes from the content: ids W<seq>-<n>, creation rules, author species ids resolved; nothing persistent changes', async () => {
  const { state, sessions, app } = fakeApp(gameOf([mk('G-starter-1', 'Charmander', 5)]));
  const before = JSON.stringify(state.current());
  await app.startBattle(req('wild#4', [{ species: 'pidgey', level: 3 }, { species: 'Caterpie', level: 4 }], 'wild', 4));
  const { setup } = sessions.created[0];
  assert.deepEqual(setup.foes.map(f => [f.id, f.species, f.level, f.moves.map(m => m.id)]), [['W4-1', 'Pidgey', 3, ['tackle']], ['W4-2', 'Caterpie', 4, ['tackle', 'stringshot']]]);
  for (const f of setup.foes) { assert.deepEqual(E.saveSchema.validateGame({ ...gameOf([]), party: [f] }), []); assert.ok(Object.values(f.ivs).every(v => v >= 0 && v <= 31)); }
  assert.deepEqual([setup.noRun, setup.noBall, setup.storageFull], [false, false, false]);
  assert.equal(JSON.stringify(state.current()), before);
  const again = fakeApp(gameOf([mk('G-starter-1', 'Charmander', 5)]));
  await again.app.startBattle(req('wild#4', [{ species: 'pidgey', level: 3 }, { species: 'Caterpie', level: 4 }], 'wild', 4));
  assert.deepEqual(again.sessions.created[0].setup.foes, setup.foes, 'same seed, same foes');
});

test('startBattle refuses before any session exists: nobody able to battle, unknown species, a foe without moves, no random', async () => {
  const cases = [
    ['no able member', fakeApp(gameOf([mk('A', 'Charmander', 5, { hp: 0 })])), req('x#1'), /no party member can battle/],
    ['unknown species', fakeApp(gameOf([mk('A', 'Charmander', 5)])), req('x#1', [{ species: 'mew', level: 5 }]), /species "mew" is not in the content/],
    ['no foes', fakeApp(gameOf([mk('A', 'Charmander', 5)])), req('x#1', []), /at least one foe/],
  ];
  const tooLow = clone(content); tooLow.species.Pidgey.learnset = { 10: ['Gust'] };
  const st = K.createMemoryState(gameOf([mk('A', 'Charmander', 5)])), ss = K.createFakeSessions(() => { throw new Error('x'); });
  cases.push(['foe knows no move', { app: new GameApplication({ state: st, sessions: ss, projection: K.createRecordingProjection(), content: () => ({ content: tooLow }), random: lcg(1) }), sessions: ss }, req('x#1'), /knows no move in the content/]);
  const st2 = K.createMemoryState(gameOf([mk('A', 'Charmander', 5)])), ss2 = K.createFakeSessions(() => { throw new Error('x'); });
  cases.push(['no random', { app: new GameApplication({ state: st2, sessions: ss2, projection: K.createRecordingProjection(), content: () => ({ content }) }), sessions: ss2 }, req('x#1'), /no random source/]);
  for (const [label, w, r, re] of cases) { await assert.rejects(w.app.startBattle(r), re, label); assert.equal(w.sessions.created.length, 0, label); }
});

test('D1: with the party and the boxes full the ball is disabled at the start (author flags pass through)', async () => {
  const party = Array.from({ length: 6 }, (_, i) => mk(`P${i}`, 'Caterpie', 3));
  const full = fakeApp(gameOf(party, { boxes: [mk('B0', 'Pidgey', 2)] }), { limits: { ...E.limits.DEFAULT_LIMITS, boxes: 1 } });
  await full.app.startBattle(req('x#1'));
  assert.deepEqual([full.sessions.created[0].setup.noBall, full.sessions.created[0].setup.storageFull], [true, true]);
  const room = fakeApp(gameOf(party), { limits: { ...E.limits.DEFAULT_LIMITS, boxes: 1 } });
  await room.app.startBattle({ ...req('x#2'), noRun: true });
  assert.deepEqual([room.sessions.created[0].setup.noBall, room.sessions.created[0].setup.noRun], [false, true], 'one free box slot: balls stay usable');
});

const lost = (battleId, members = {}) => ({ protocol: 1, battleId, outcome: { kind: 'win', winner: 'Wild' }, members, bag: {}, captured: [], dex: { seen: ['Pidgey'], owned: [] } });

test('D3: a defeat is settled with the result in one replacement (money, heal), and never twice', () => {
  const g = gameOf([mk('A', 'Charmander', 9), mk('B', 'Caterpie', 4)], { money: 1000 });
  const { state, projection, app } = fakeApp(g);
  const r = lost('wild#7', { A: { hp: 0, status: '' }, B: { hp: 3, status: 'psn', statusCount: 0 } });
  const o = app.finishBattle({ result: () => r }, { battleId: 'wild#7' });
  assert.deepEqual([o.code, o.commit, o.defeat], [4, 'applied', { moneyLost: 72, healed: true }]);
  assert.equal(state.replaced.length, 1, 'result and settlement are one replacement');
  const now = state.current();
  assert.equal(now.money, 1000 - 72);
  for (const m of now.party) { assert.ok(m.hp > 0); assert.equal(m.status, ''); }
  assert.ok(now.appliedBattles['wild#7']);
  const again = app.finishBattle({ result: () => r }, { battleId: 'wild#7' });
  assert.deepEqual([again.commit, again.defeat], ['already-applied', undefined]);
  assert.equal(state.current().money, 1000 - 72, 'no second deduction'); assert.equal(state.replaced.length, 1);
  assert.equal(app.commitResult(r), 'already-applied');
  assert.deepEqual(projection.outcomes.map(x => x.code), [4, 4]);
  const tie = fakeApp(gameOf([mk('A', 'Charmander', 9)], { money: 1000 }));
  const t = tie.app.finishBattle({ result: () => ({ ...lost('t#1'), outcome: { kind: 'tie', winner: null } }) }, { battleId: 't#1' });
  assert.deepEqual([t.code, t.defeat && t.defeat.moneyLost], [4, 72], 'a draw is settled like a defeat (WP42 6.1)');
  const free = fakeApp(gameOf([mk('A', 'Charmander', 9, { hp: 1 })], { money: 1000 }), { noMoneyLoss: true });
  const f = free.app.finishBattle({ result: () => lost('n#1') }, { battleId: 'n#1' });
  assert.deepEqual([f.defeat.moneyLost, free.state.current().money], [0, 1000]); assert.ok(free.state.current().party[0].hp > 1, 'still healed');
  const won = fakeApp(gameOf([mk('A', 'Charmander', 9, { hp: 1 })], { money: 1000 }));
  const w = won.app.finishBattle({ result: () => ({ ...lost('w#1'), outcome: { kind: 'win', winner: 'Player' } }) }, { battleId: 'w#1' });
  assert.deepEqual([w.code, w.defeat, won.state.current().money, won.state.current().party[0].hp], [1, undefined, 1000, 1], 'a win settles nothing');
});

test('a defeat whose store write fails installs nothing; the retry settles exactly once', () => {
  const { state, app } = fakeApp(gameOf([mk('A', 'Charmander', 9, { hp: 2 })], { money: 500 }));
  state.failReplace = new Error('store refused');
  const r = lost('wild#8');
  const o = app.finishBattle({ result: () => r }, { battleId: 'wild#8' });
  assert.deepEqual([o.code, o.commit, o.aborted], [0, 'none', true]); assert.equal(state.current().money, 500); assert.equal(state.current().party[0].hp, 2);
  state.failReplace = null;
  assert.equal(app.finishBattle({ result: () => r }, { battleId: 'wild#8' }).defeat.moneyLost, 72);
  assert.equal(app.finishBattle({ result: () => r }, { battleId: 'wild#8' }).commit, 'already-applied');
  assert.equal(state.current().money, 500 - 72);
});

test('the capacity backstop: a capture that cannot be stored aborts the whole result (nothing dropped)', () => {
  const party = Array.from({ length: 6 }, (_, i) => mk(`P${i}`, 'Caterpie', 3));
  const { state, app } = fakeApp(gameOf(party), { limits: { ...E.limits.DEFAULT_LIMITS, boxes: 0 } });
  const before = JSON.stringify(state.current());
  const r = { protocol: 1, battleId: 'c#1', outcome: { kind: 'caught', winner: null, target: 'W1-1', ball: 'pokeball' }, members: {}, bag: { pokeball: -1 }, captured: [mk('W1-1', 'Pidgey', 3)], dex: { seen: ['Pidgey'], owned: ['Pidgey'] } };
  const o = app.finishBattle({ result: () => r }, { battleId: 'c#1' });
  assert.deepEqual([o.code, o.commit, o.aborted], [0, 'none', true]); assert.match(o.error, /no room for captured member W1-1/);
  assert.equal(JSON.stringify(state.current()), before);
});

const TABLE = { regions: [1], slots: [{ species: 'pidgey', weight: 60, minLevel: 2, maxLevel: 4 }, { species: 'caterpie', weight: 40, minLevel: 2, maxLevel: 4 }] };

test('encounters are decided by the application: region, table, able members, content; never throws', () => {
  const { app } = fakeApp(gameOf([mk('A', 'Charmander', 5)]), { random: lcg(2) });
  assert.deepEqual(app.prepareEncounter(TABLE, 2), { ok: false, reason: 'not-here' });
  const ok = app.prepareEncounter(TABLE, 1);
  assert.equal(ok.ok, true); assert.ok(['Pidgey', 'Caterpie'].includes(ok.foe.species)); assert.ok(ok.foe.level >= 2 && ok.foe.level <= 4);
  assert.equal(app.prepareEncounter({ regions: [], slots: [] }, 1).reason, 'invalid-table');
  assert.equal(app.prepareEncounter({ regions: [], slots: [{ species: 'mew', weight: 1, minLevel: 1, maxLevel: 1 }] }, 1).reason, 'unknown-species');
  assert.equal(fakeApp(gameOf([mk('A', 'Charmander', 5, { hp: 0 })])).app.prepareEncounter(TABLE, 1).reason, 'no-able-member');
  const broken = fakeApp(gameOf([mk('A', 'Charmander', 5)])); broken.state.failRead = new Error('unusable');
  assert.equal(broken.app.prepareEncounter(TABLE, 1).reason, 'state-unusable');
});

// ---- real Showdown-backed sessions (acceptance 4, 6, 7): controlled state, pinned engine seed, seeded creation
function realApp(game, { seed = [1, 2, 3, 4], random = lcg(21), limits } = {}) {
  const state = K.createMemoryState(game), projection = K.createRecordingProjection();
  const sessions = E.composition.createBattleSessionFactory({ content: () => content, seed: () => seed });
  return { state, app: new GameApplication({ state, sessions, projection, content: () => ({ content, dex: E.dex.createDexLookup() }), random }, { limits }) };
}
const engineOf = (s, id) => s.gw.readState('p1').find(x => x.id === id);

test('real: a won wild battle writes back HP, PP, status, exp, a level-up and a learned move; a repeat changes nothing', async () => {
  const starter = mk('G-starter-1', 'Charmander', 7); starter.exp = E.growth.minExp('parabolic', 8) - 1; starter.hp -= 3;
  const { state, app } = realApp(gameOf([starter]));
  const r = req('wild#11', [{ species: 'pidgey', level: 2 }], 'wild', 11);
  const s = await app.startBattle(r);
  for (let i = 0; i < 10 && !s.finished; i++) { if (s.pendingLearn) { await s.decideLearn(null); continue; } assert.equal((await s.chooseMove(3)).ok, true); } // Ember
  const live = engineOf(s, 'G-starter-1');
  const o = app.finishBattle(s, r);
  assert.deepEqual([o.code, o.commit, o.kind], [1, 'applied', 'win']);
  const m = state.current().party[0];
  assert.equal(m.level, 8); assert.ok(m.exp >= E.growth.minExp('parabolic', 8));
  assert.deepEqual(m.moves.map(x => x.id), ['scratch', 'growl', 'ember', 'smokescreen'], 'the level 8 move is learned into the free slot (same learnset as creation)');
  assert.equal(m.hp, live.hp, 'HP from the engine'); assert.equal(m.status, live.status || '');
  assert.equal(m.moves[2].pp, live.pp.ember, 'used PP written back'); assert.ok(m.moves[2].pp < m.moves[2].maxpp);
  assert.ok(state.current().dex.seen.includes('Pidgey'));
  const after = JSON.stringify(state.current());
  assert.equal(app.finishBattle(s, r).commit, 'already-applied'); assert.equal(JSON.stringify(state.current()), after);
});

test('real: with four moves a level-up prompts, and the answer replaces the chosen slot', async () => {
  const starter = mk('G-starter-1', 'Charmander', 11); starter.exp = E.growth.minExp('parabolic', 12) - 1;
  assert.deepEqual(starter.moves.map(x => x.id), ['scratch', 'growl', 'ember', 'smokescreen']);
  const { state, app } = realApp(gameOf([starter]));
  const r = req('wild#12', [{ species: 'caterpie', level: 3 }], 'wild', 12);
  const s = await app.startBattle(r);
  let prompted = false;
  for (let i = 0; i < 10 && !s.finished; i++) { if (s.pendingLearn) { prompted = true; assert.equal(s.pendingLearn.move.id, 'dragonbreath'); await s.decideLearn(1); continue; } await s.chooseMove(3); }
  assert.ok(prompted);
  app.finishBattle(s, r);
  assert.deepEqual(state.current().party[0].moves.map(x => x.id), ['scratch', 'dragonbreath', 'ember', 'smokescreen']);
});

async function runUntil(app, game, seedList, want) {
  for (const seed of seedList) {
    const w = realApp(clone(game), { seed });
    const s = await w.app.startBattle(req(`run#${seed.join('')}`, [{ species: 'pidgey', level: 30 }], 'wild', 5));
    const first = await s.run();
    if (want(s, first)) return { ...w, s, first, seed };
  }
  return null;
}

test('real: running can fail (a slower member) and succeed; a failed attempt spends the turn and changes nothing persistent', async () => {
  const slow = gameOf([mk('A', 'Snorlax', 30)]); // slower than a level 30 Pidgey, and survives its Tackle
  const seeds = Array.from({ length: 12 }, (_, i) => [i + 1, 2, 3, 4]);
  const failed = await runUntil(null, slow, seeds, s => !s.finished);
  assert.ok(failed, 'some seed gives a failed escape for Snorlax L30 against Pidgey L30');
  assert.ok(failed.first.messages.some(m => m.kind === 'events' && m.events.some(e => /\|rpg\|run\|p1\|fail/.test(e.raw))), 'the failure is reported in the log');
  assert.equal(failed.state.replaced.length, 0, 'nothing persistent while the battle runs');
  for (let i = 0; i < 6 && !failed.s.finished; i++) await failed.s.run(); // a later attempt gets better odds (WP41 7.2)
  if (failed.s.finished) { const o = failed.app.finishBattle(failed.s, req('x')); assert.ok([3, 4].includes(o.code)); assert.equal(failed.state.replaced.length, 1); }
  const fast = await runUntil(null, gameOf([mk('A', 'Charmander', 40)]), [[1, 2, 3, 4]], s => s.finished);
  assert.ok(fast); const o = fast.app.finishBattle(fast.s, req('run#1234'));
  assert.deepEqual([o.code, o.kind], [3, 'run']);
});

test('real: a ball can fail and succeed; the caught member is the created foe; used balls are spent; a potion is used once, then refused when none is left', async () => {
  for (let k = 1; k <= 20; k++) {
    const g = gameOf([mk('A', 'Charmander', 20, { hp: 10 })], { bag: { pokeball: 6, potion: 1 } });
    const w = realApp(g, { seed: [k, 9, 9, 9], random: lcg(k) });
    const r = req(`ball#${k}`, [{ species: 'pidgey', level: 3 }], 'wild', 40 + k);
    const s = await w.app.startBattle(r);
    const foe = clone(s.foeTeam[0]);
    assert.equal((await s.useItem('potion', 'A')).ok, true);
    assert.deepEqual(await s.useItem('potion', 'A'), { ok: false, reason: 'none-left' }, 'none left: refused, nothing consumed');
    let thrown = 0, fails = 0;
    while (!s.finished && thrown < 6) { const t = await s.throwBall('pokeball'); thrown++; if (!s.finished) fails++; assert.equal(t.ok, true); }
    if (!fails || !s.finished) continue; // need at least one failed throw before the catch
    const o = w.app.finishBattle(s, r);
    assert.deepEqual([o.code, o.kind, o.commit], [2, 'caught', 'applied']);
    const now = w.state.current();
    assert.equal(now.bag.pokeball, 6 - thrown); assert.equal(now.bag.potion, undefined, 'the potion was used once');
    const c = now.party[1];
    assert.deepEqual([c.id, c.species, c.level, c.nature, c.ability, c.gender, c.ivs, c.ball], [foe.id, 'Pidgey', 3, foe.nature, foe.ability, foe.gender, foe.ivs, 'pokeball']);
    assert.ok(now.dex.owned.includes('Pidgey'));
    assert.equal(w.app.finishBattle(s, r).commit, 'already-applied'); assert.equal(w.state.current().party.length, 2, 'not received twice');
    return;
  }
  assert.fail('no seed in 1..20 gave a failed throw followed by a catch');
});

test('real: a full party sends a catch to the boxes; with the boxes full too the ball is refused before anything is spent', async () => {
  const party = Array.from({ length: 6 }, (_, i) => mk(`P${i}`, 'Charmander', 20));
  const roomy = realApp(gameOf(clone(party), { bag: { masterball: 1 } }));
  const s = await roomy.app.startBattle(req('box#1', [{ species: 'pidgey', level: 3 }], 'wild', 61));
  await s.throwBall('masterball');
  roomy.app.finishBattle(s, req('box#1'));
  assert.deepEqual([roomy.state.current().party.length, roomy.state.current().boxes.map(m => m.id)], [6, ['W61-1']]);
  const full = realApp(gameOf(clone(party), { bag: { masterball: 1 }, boxes: [mk('B0', 'Pidgey', 2)] }), { limits: { ...E.limits.DEFAULT_LIMITS, boxes: 1 } });
  const t = await full.app.startBattle(req('box#2', [{ species: 'pidgey', level: 3 }], 'wild', 62));
  assert.deepEqual(await t.throwBall('masterball'), { ok: false, reason: 'ballsdisabled' });
  assert.equal(t.bag.masterball, 1, 'nothing spent');
  assert.equal((await t.run()).ok, true); assert.equal(full.app.finishBattle(t, req('box#2')).code, 3);
});

test('real: a lost wild battle is settled (money, full heal) and committed once', async () => {
  const g = gameOf([mk('A', 'Caterpie', 2, { hp: 1 })], { money: 1000 });
  const { state, app } = realApp(g);
  const r = req('lose#1', [{ species: 'pidgey', level: 12 }], 'wild', 71);
  const s = await app.startBattle(r);
  for (let i = 0; i < 10 && !s.finished; i++) await s.chooseMove(1);
  const o = app.finishBattle(s, r);
  assert.deepEqual([o.code, o.kind, o.defeat], [4, 'win', { moneyLost: 16, healed: true }]);
  const m = state.current().party[0];
  assert.equal(state.current().money, 984); assert.ok(m.hp > 1); assert.equal(m.status, '');
  assert.equal(app.finishBattle(s, r).commit, 'already-applied'); assert.equal(state.current().money, 984);
});

test('while a battle it opened is not finished, the application refuses grants and heals (its result would overwrite them); finish or abort ends that', async () => {
  const m = mk('A', 'Charmander', 40, { hp: 1 });
  const { state, app } = realApp(gameOf([m], { bag: {} }));
  const r = req('live#1', [{ species: 'pidgey', level: 3 }], 'wild', 91);
  const s = await app.startBattle(r);
  const before = JSON.stringify(state.current());
  assert.deepEqual([app.healParty().reason, app.claimGrant('starter').reason], ['battle-active', 'battle-active']);
  assert.equal(JSON.stringify(state.current()), before, 'nothing written while the battle is open');
  await s.run(); const o = app.finishBattle(s, r);
  assert.deepEqual([o.code, o.commit, state.current().party[0].hp], [3, 'applied', 1], 'the battle result is the only write');
  assert.equal(app.healParty().status, 'healed', 'after the finish the heal is allowed again');
  assert.equal(app.claimGrant('starter').status, 'applied');
  const t = await app.startBattle(req('live#2', [{ species: 'pidgey', level: 3 }], 'wild', 92));
  assert.equal(app.healParty().reason, 'battle-active');
  app.abortBattle({ battleId: 'live#2' }, new Error('scene closed')); assert.ok(t);
  assert.equal(app.healParty().status, 'unchanged', 'an abort ends the open battle too');
});

test('prepareEncounter never throws: an unusable content port or random source is a refusal', () => {
  const state = K.createMemoryState(gameOf([mk('A', 'Charmander', 5)]));
  const sessions = K.createFakeSessions(() => { throw new Error('x'); });
  const badContent = new GameApplication({ state, sessions, projection: K.createRecordingProjection(), content: () => { throw new Error('content unreadable'); }, random: lcg(1) });
  assert.deepEqual(badContent.prepareEncounter(TABLE, 1), { ok: false, reason: 'invalid-content', error: 'content unreadable' });
  const badRandom = new GameApplication({ state, sessions, projection: K.createRecordingProjection(), content: () => ({ content }), random: () => 7.5 });
  const b = badRandom.prepareEncounter(TABLE, 1); assert.deepEqual([b.ok, b.reason], [false, 'invalid-content']); assert.match(b.error, /random\(100\) returned 7\.5/);
});

test('D3 under a battle id that is also "__proto__" or "constructor": a failed store write leaves nothing, then the defeat is settled once, also after a save round trip', () => {
  for (const id of ['__proto__', 'constructor']) {
    const { state, app } = fakeApp(gameOf([mk('A', 'Charmander', 9, { hp: 2 })], { money: 1000, bag: { potion: 2 } }));
    const r = { ...lost(id, { A: { hp: 0 } }), bag: { potion: -1 } };
    state.failReplace = new Error('store refused');
    const failed = app.finishBattle({ result: () => r }, { battleId: id });
    assert.deepEqual([failed.code, failed.commit], [0, 'none'], id);
    assert.deepEqual([state.current().money, state.current().bag.potion, state.current().party[0].hp, Object.keys(state.current().appliedBattles)], [1000, 2, 2, []], `${id}: nothing left by the failed write`);
    state.failReplace = null;
    const o = app.finishBattle({ result: () => r }, { battleId: id });
    assert.deepEqual([o.commit, o.defeat], ['applied', { moneyLost: 72, healed: true }], id);
    assert.equal(app.commitResult(r), 'already-applied', id);
    const reloaded = fakeApp(JSON.parse(JSON.stringify(state.current())));
    assert.equal(reloaded.app.commitResult(r), 'already-applied', `${id}: still a repeat after a save round trip`);
    const now = reloaded.state.current();
    assert.deepEqual([now.money, now.bag.potion, reloaded.state.replaced.length], [928, 1, 0], `${id}: money, item and heal settled once`);
    assert.ok(Object.hasOwn(now.appliedBattles, id));
  }
});

// ---- the battle operation while its session is being created (controlled promises; no engine)
function controlledSessions() {
  const calls = [];
  return { calls, create(request, game, setup) { return new Promise((resolve, reject) => calls.push({ request, game, setup, resolve, reject })); } };
}
/** A promise that must settle soon: a regression that leaves it pending fails here instead of being cancelled at exit. */
const soon = (p, ms = 500) => { let t; return Promise.race([p, new Promise((_, reject) => { t = setTimeout(() => reject(new Error(`still pending after ${ms} ms`)), ms); })]).finally(() => clearTimeout(t)); };
const handleFor = (battleId, extra = {}) => ({ result: () => ({ protocol: 1, battleId, outcome: { kind: 'run', winner: null }, members: {}, bag: {}, captured: [], dex: { seen: [], owned: [] }, ...extra }) });
function pendingApp(game = gameOf([mk('A', 'Charmander', 5, { hp: 1 })])) {
  const state = K.createMemoryState(game), sessions = controlledSessions();
  return { state, sessions, app: new GameApplication({ state, sessions, projection: K.createRecordingProjection(), content: () => ({ content }), random: lcg(3) }) };
}

test('a battle is open from the start of startBattle: while its session is being created grants, heals and a second battle are refused; the result is the only write', async () => {
  const w = pendingApp();
  const p = w.app.startBattle(req('p#1'));
  assert.equal(w.sessions.calls.length, 1);
  assert.deepEqual([w.app.healParty().reason, w.app.claimGrant('starter').reason], ['battle-active', 'battle-active'], 'pending: refused');
  await assert.rejects(soon(w.app.startBattle(req('p#2'))), /a battle is already open \(p#1\)/);
  assert.equal(w.sessions.calls.length, 1, 'no second session requested');
  w.sessions.calls[0].resolve(handleFor('p#1', { members: { A: { hp: 1 } } }));
  const h = await p;
  assert.equal(w.app.healParty().reason, 'battle-active', 'active: refused');
  assert.deepEqual([w.app.finishBattle(h, req('p#1')).commit, w.state.current().party[0].hp, w.state.replaced.length], ['applied', 1, 1]);
  assert.equal(w.app.healParty().status, 'healed', 'after the finish: allowed');
  // a later battle is ended only by its own session or its own battle id
  const q = w.app.startBattle(req('p#3'));
  assert.equal(w.app.finishBattle(h, req('p#1')).commit, 'already-applied', 'a stale finish of the old session commits nothing');
  w.app.abortBattle(null, new Error('no battle named')); w.app.abortBattle({ battleId: 'other#9' }, new Error('another battle'));
  assert.equal(w.app.healParty().reason, 'battle-active', 'pending p#3: a stale finish, a null abort or another id do not release it');
  w.sessions.calls[1].resolve(handleFor('p#3'));
  const h3 = await q;
  w.app.finishBattle(h, req('p#1')); w.app.abortBattle(null, new Error('no battle named'));
  assert.equal(w.app.healParty().reason, 'battle-active', 'active p#3: still not released by them');
  assert.equal(w.app.finishBattle(h3, req('p#3')).commit, 'applied');
  assert.equal(w.app.healParty().status, 'unchanged', 'released by its own finish');
});

test('a failed creation releases its own operation, and the next battle can start', async () => {
  const w = pendingApp();
  const p = w.app.startBattle(req('f#1'));
  w.sessions.calls[0].reject(new Error('engine failed to start'));
  await assert.rejects(p, /engine failed to start/);
  assert.equal(w.app.claimGrant('starter').status, 'applied', 'released');
  const q = w.app.startBattle(req('f#2')); w.sessions.calls[1].resolve(handleFor('f#2'));
  const h = await q; assert.equal(w.app.abortBattle(req('f#2'), new Error('scene closed')).commit, 'none');
  assert.equal(w.app.healParty().status, 'healed', 'after an abort: allowed');
});

test('an abort while the session is being created ends that operation; its late session or late failure is not used and never releases or replaces a later battle', async () => {
  const w = pendingApp();
  const p1 = w.app.startBattle(req('a#1'));
  w.app.abortBattle({ battleId: 'a#1' }, new Error('scene closed while opening'));
  assert.equal(w.app.healParty().status, 'healed', 'the cancelled operation no longer blocks');
  const p2 = w.app.startBattle(req('a#2'));
  w.app.abortBattle({ battleId: 'a#1' }, new Error('late cleanup of the old battle'));
  assert.equal(w.app.healParty().reason, 'battle-active', "the old battle's abort does not end a#2");
  w.sessions.calls[0].resolve(handleFor('a#1'));
  await assert.rejects(p1, /a#1 was aborted while its session was being created/, 'the late session is not handed out');
  assert.equal(w.app.healParty().reason, 'battle-active', 'and it neither revives a#1 nor releases a#2');
  w.sessions.calls[1].resolve(handleFor('a#2'));
  const h2 = await p2;
  assert.equal(w.app.finishBattle(h2, req('a#2')).commit, 'applied');
  assert.notEqual(w.app.healParty().reason, 'battle-active');
  const p3 = w.app.startBattle(req('a#3'));
  w.app.abortBattle({ battleId: 'a#3' }, new Error('cancelled'));
  const p4 = w.app.startBattle(req('a#4'));
  w.sessions.calls[2].reject(new Error('late failure of a#3'));
  await assert.rejects(p3, /late failure of a#3/);
  assert.equal(w.app.claimGrant('starter').reason, 'battle-active', "a#3's late failure does not release a#4");
  w.sessions.calls[3].resolve(handleFor('a#4'));
  const h4 = await p4;
  assert.equal(w.app.abortBattle(req('a#4'), new Error('scene closed')).commit, 'none');
  assert.equal(w.app.claimGrant('starter').status, 'applied', 'released by its own abort');
  assert.equal(w.state.replaced.length, 3, 'the only writes: the heal after a#1 was cancelled, the finished a#2, the grant'); assert.ok(h4);
});
