'use strict';
const I6 = require("./2/test-support.cjs");
// Step 5.0, application layer: battles see a battle view and commit through the content mapping (D5-3); battle
// statistics are counted with the result in the same replacement (WP06 §4.2; r8 FR-000420; WP53 §183 split; WP61 §7
// blackout), never twice; the step counter (WP06 §4.1, FR-000426); and the release of a battle operation when the host
// installs another state (final review P4-2). Verification: spec-driven vectors and invariants over in-memory ports.
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
const expectedEmptyDex = { seen: [], owned: [], hasDex: false, seenForms: {}, lastSeenForm: {}, capturedCounts: {}, defeatedCounts: {}, unlocked: [true], view: { region: -1, indices: [0], mode: 0 }, layoutIdentity: content.regionalDex.layoutIdentity };
const lcg = seed => { let s = seed >>> 0; return n => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return Math.floor((s / 4294967296) * n); }; };
const battleMember = (id, species, level) => E.memberFactory.createMember({ id, species, level }, content, lcg(level));
const saved = m => E.speciesKey.toPersistentMember(m, content);
const game = (party = [saved(battleMember('A-1', 'Charmander', 9))], money = 3000) => { const g = S.newGame({ content, party: [] }); g.party = party; g.money = money; I6.setBag(g, { pokeball: 3 }); return g; };
const result = (battleId, kind, winner = null, extra = {}) => ({ protocol: 1, battleId, outcome: { kind, winner }, members: {}, bag: {}, captured: [], dex: { seen: [], owned: [] }, ...extra });

function app(initial = game(), options = {}) {
  const state = K.createMemoryState(initial), sessions = K.createFakeSessions(() => { throw new Error('unfinished'); }), projection = K.createRecordingProjection();
  return { state, sessions, projection, app: new GameApplication({ state, sessions, projection, content: () => ({ content }), random: lcg(9), clock: () => 1234567890000 }, { receivingProfile: { mode: 1, naming: 1 }, ...options }) };
}
/** One battle through the application: start (kind, canLose), finish with `r`. */
async function battle(w, r, { kind = 'wild', canLose = false } = {}) {
  w.sessions.next = r;
  const req = { battleId: r.battleId, kind, foes: [{ species: 'pidgey', level: 3 }], seq: 1, canLose };
  const h = await w.app.startBattle(req);
  for (const [i, caught] of r.captured.entries()) { caught.id = w.sessions.created.at(-1).setup.foes[i].id; r.outcome.target = caught.id; }
  return { h, req, o: w.app.finishBattle(h, req) };
}
const statsOf = w => w.state.current().stats;
const pick = (st, keys) => Object.fromEntries(keys.map(k => [k, st[k]]));
const BATTLE = ['wild_battles_won', 'wild_battles_lost', 'trainer_battles_won', 'trainer_battles_lost', 'battle_money_lost', 'blacked_out_count'];

test('the session factory gets the battle view (Showdown names); the commit stores the capture by content id + form', async () => {
  const w = app();
  const foe = battleMember('W1-1', 'Pidgey', 3);
  const r = result('wild#1', 'caught', null, { captured: [foe], bag: { pokeball: -1 }, dex: { seen: ['Pidgey'], owned: ['Pidgey'] } });
  r.outcome.target = 'W1-1'; r.outcome.ball = 'pokeball';
  const { o } = await battle(w, r);
  assert.deepEqual([o.code, o.commit], [2, 'applied']);
  assert.equal(w.sessions.created[0].game.party[0].species, 'Charmander', 'the session reads Showdown names');
  assert.equal('form' in w.sessions.created[0].game.party[0], false);
  const now = w.state.current();
  assert.deepEqual(now.party.map(m => [m.id, m.species, m.form]), [['A-1', 'charmander', 0], ['M1', 'pidgey', 0]]);
  assert.deepEqual(now.dex, { ...expectedEmptyDex, seen: ['pidgey'], owned: ['pidgey'] });
  assert.deepEqual(E.saveSchema.validateGame(now), []);
});

test('FR-000420 battle statistics (WP53 §183 split): wild win or catch = won; run, loss or draw = lost; trainer win = won, loss = lost', async () => {
  const cases = [
    ['wild', result('a#1', 'win', 'Player'), { wild_battles_won: 1 }],
    ['wild', { ...result('a#2', 'caught'), outcome: { kind: 'caught', winner: null, target: 'W1-1', ball: 'pokeball' }, captured: [battleMember('W1-1', 'Pidgey', 3)], dex: { seen: ['Pidgey'], owned: ['Pidgey'] } }, { wild_battles_won: 1 }],
    ['wild', result('a#3', 'run'), { wild_battles_lost: 1 }],
    ['wild', result('a#4', 'win', 'Wild'), { wild_battles_lost: 1, battle_money_lost: 72, blacked_out_count: 1 }],
    ['wild', result('a#5', 'tie'), { wild_battles_lost: 1, battle_money_lost: 72, blacked_out_count: 1 }],
    ['trainer', result('a#6', 'win', 'Player'), { trainer_battles_won: 1 }],
    ['trainer', result('a#7', 'win', 'Trainer'), { trainer_battles_lost: 1, battle_money_lost: 72, blacked_out_count: 1 }],
  ];
  for (const [kind, r, want] of cases) {
    const w = app();
    const { o } = await battle(w, r, { kind });
    assert.equal(o.commit, 'applied', r.battleId);
    const expected = Object.fromEntries(BATTLE.map(k => [k, want[k] ?? 0]));
    assert.deepEqual(pick(statsOf(w), BATTLE), expected, `${kind} ${r.outcome.kind}/${r.outcome.winner}`);
    assert.equal(statsOf(w).total_exp_gained, 0, 'not counted in 5.0 (growth batch)');
  }
});

test('WP61 §7: a defeat the author allowed (canLose) is not a blackout, but its money loss is counted', async () => {
  const w = app();
  await battle(w, result('story#1', 'win', 'Trainer'), { kind: 'trainer', canLose: true });
  assert.deepEqual(pick(statsOf(w), BATTLE), { wild_battles_won: 0, wild_battles_lost: 0, trainer_battles_won: 0, trainer_battles_lost: 1, battle_money_lost: 72, blacked_out_count: 0 });
});

test('statistics are part of the one commit: a repeat counts nothing, a failed write counts nothing, a direct commit counts no battle', async () => {
  const w = app();
  const r = result('rep#1', 'win', 'Wild');
  const { h, req } = await battle(w, r);
  assert.equal(w.state.replaced.length, 1);
  assert.equal(w.app.finishBattle(h, req).commit, 'already-applied');
  assert.deepEqual([statsOf(w).wild_battles_lost, statsOf(w).blacked_out_count, w.state.replaced.length], [1, 1, 1]);
  const f = app(); f.state.failReplace = new Error('store refused');
  const failed = await battle(f, result('fail#1', 'win', 'Player'));
  assert.deepEqual([failed.o.commit, failed.o.pending, f.state.current().stats.wild_battles_won], ['none', true, 0]);
  f.state.failReplace = null;
  f.app.abortBattle(failed.req, new Error("explicitly abandon pending session before testing a standalone commit"));
  assert.equal(f.app.commitResult(result('fail#1', 'win', 'Player')), 'applied', 'the retry commits the result ...');
  assert.equal(f.state.current().stats.wild_battles_won, 0, '... but a direct commit knows no battle kind and counts no battle');
});

test('FR-000426 the step counter: counted, wraps at 2^31 (WP06 §4.1), refused while a battle is open or the state is unusable', async () => {
  const w = app();
  assert.deepEqual(w.app.recordSteps(1), { status: 'counted', steps: 1 });
  assert.deepEqual(w.app.recordSteps(4), { status: 'counted', steps: 5 });
  assert.equal(w.state.current().steps, 5);
  assert.equal(E.stats.addSteps(2147483646, 1), 2147483647);
  assert.equal(E.stats.addSteps(2147483647, 1), 0, 'wraps to 0, not saturating');
  assert.throws(() => E.stats.addSteps(0, -1), /non-negative integer/);
  assert.deepEqual([w.app.recordSteps(-1).status, w.app.recordSteps(-1).reason], ['refused', 'invalid']);
  const before = w.state.current();
  const g = w.state.current();
  w.sessions.next = () => { throw new Error('unfinished'); };
  const h = await w.app.startBattle({ battleId: 'open#1', kind: 'wild', foes: [{ species: 'pidgey', level: 3 }], seq: 1 });
  assert.deepEqual([w.app.recordSteps(1).status, w.app.recordSteps(1).reason], ['refused', 'battle-active']);
  assert.equal(w.state.current(), g); assert.equal(before, g);
  w.app.abortBattle({ battleId: 'open#1' }, new Error('x'));
  assert.equal(w.app.recordSteps(1).steps, 6);
  void h;
  w.state.failRead = new Error('unusable');
  assert.equal(w.app.recordSteps(1).reason, 'state-unusable');
});

test('P4-2: the host installs another state while a battle is open: the operation is released, and that battle commits nothing', async () => {
  const w = app();
  w.sessions.next = result('old#1', 'win', 'Player');
  const req = { battleId: 'old#1', kind: 'wild', foes: [{ species: 'pidgey', level: 3 }], seq: 1 };
  const old = await w.app.startBattle(req);
  assert.equal(w.app.healParty().reason, 'battle-active', 'the battle holds the operation');
  // a save is loaded: the host installs that state and tells the application
  const loaded = game([saved(battleMember('L-1', 'Pidgey', 4))], 100);
  w.state.replace(loaded); const writes = w.state.replaced.length;
  w.app.stateReplacedByHost();
  assert.equal(w.app.healParty().status, 'unchanged', 'grants, heals and battles are possible again (this party is already healthy)');
  const late = w.app.finishBattle(old, req);
  assert.deepEqual([late.code, late.commit, late.aborted, late.projection], [0, 'none', true, undefined]);
  assert.match(late.error, /state was replaced while this battle was open/);
  assert.equal(w.state.replaced.length, writes, 'nothing was written: the old result was not committed');
  assert.equal(w.state.current().appliedBattles['old#1'], undefined);
  assert.deepEqual(w.projection.outcomes, [], 'nothing was projected into the new state');
  // the next battle starts and commits normally, also under the same battle id
  w.sessions.next = result('old#1', 'run');
  const { o } = await battle(w, result('old#1', 'run'));
  assert.deepEqual([o.commit, w.state.current().stats.wild_battles_lost], ['applied', 1]);
  w.app.stateReplacedByHost(); // without an open battle: nothing to release
});

test('P4-2 while the session is still being created: the late session is not used and the new state is not touched', async () => {
  const w = app();
  let resolve; const pending = new Promise(r => { resolve = r; });
  w.sessions.create = async () => { await pending; return { result: () => result('slow#1', 'win', 'Player') }; };
  const start = w.app.startBattle({ battleId: 'slow#1', kind: 'wild', foes: [{ species: 'pidgey', level: 3 }], seq: 1 });
  w.app.stateReplacedByHost();
  resolve();
  await assert.rejects(start, /aborted while its session was being created/);
  assert.equal(w.app.claimGrant('starter').status, 'applied', 'the operation was released');
});

// ---- review of 1960b92 (2026-10-22): F11 the injected time source (prompt §4.4, WP06 §3; r8 FR-000425 subset)
test('F11: the application reads the wall clock only through its injected clock port; none configured or a bad answer is refused', () => {
  const mk = clock => new GameApplication({ state: K.createMemoryState(game()), sessions: K.createFakeSessions(() => { throw new Error('x'); }), projection: K.createRecordingProjection(), content: () => ({ content }), ...(clock ? { clock } : {}) });
  assert.equal(mk(() => 1700000000000).now(), 1700000000000);
  let t = 5; const ticking = mk(() => t++);
  assert.deepEqual([ticking.now(), ticking.now()], [5, 6], 'read at every call, never cached');
  assert.throws(() => mk(null).now(), /no clock is configured/);
  for (const bad of [NaN, -1, Infinity, '12']) assert.throws(() => mk(() => bad).now(), /not a time in milliseconds/, String(bad));
});

test('F11: the core and the application never read the host clock or randomness themselves (they get them injected)', () => {
  const root = path.resolve(__dirname, '../../src/framework');
  const offenders = [];
  for (const dir of ['rules', 'app']) for (const f of fs.readdirSync(path.join(root, dir)).filter(n => n.endsWith('.ts'))) {
    const text = fs.readFileSync(path.join(root, dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const re of [/\bDate\.now\s*\(/, /\bnew\s+Date\s*\(/, /\bMath\.random\s*\(/, /\bperformance\.now\s*\(/, /\bprocess\.hrtime/]) if (re.test(text)) offenders.push(`${dir}/${f}: ${re}`);
  }
  assert.deepEqual(offenders, []);
});
