'use strict';
const I6 = require("../../step5/2/test-support.cjs");
// 2.3 gate, part 2: stable identity, write set, ledger, idempotent durable commit, failure boundaries.
// Simulated throws and REAL process kills are reported separately; atomicity is only claimed for the
// single-file write-temp-then-rename store implemented in js/engine/game/store.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const G = require('../../../js/engine/game/growth.cjs');
const S = require('../../../js/engine/game/state.cjs');
const { createFixtureSaveStore } = require('../../../js/engine/build/engine.cjs').fakes;
// the fixture world (content ids = Showdown names) is chosen explicitly: the store guesses no species keys (step 5.0 review F03)
const { identityKeys } = require('../../../js/engine/build/engine.cjs').speciesKey;
const { BattleSession } = require('../../../js/engine/game/session.cjs');
const { content, makeGame, foeMember } = require('./fixtures.cjs');

const madeDirs = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-wb-')); madeDirs.push(d); return d; };
test.after(() => { for (const d of madeDirs) fs.rmSync(d, { recursive: true, force: true }); });
const saveGame = (dir, game) => { const f = path.join(dir, 'save.json'); fs.writeFileSync(f, JSON.stringify(game)); return f; };

async function session(game, { battleId = 'B-1', foe, seed = [1, 2, 3, 4] } = {}) {
	return BattleSession.create({ game, battleId, content, seed, foe: foe || { kind: 'trainer', team: [foeMember('T-0001', 'Pidgey', 5)] } });
}
/** play until the battle ends, answering forced switches/learn prompts simply */
async function playOut(s, { onTurn } = {}) {
	for (let i = 0; i < 40 && !s.finished; i++) {
		if (s.pendingLearn) { await s.decideLearn(null); continue; }
		const req = s.currentRequest();
		if (onTurn && (await onTurn(s, i))) continue;
		if (req && req.forceSwitch) { const m = req.side.pokemon.find(p => !p.active && !/ fnt$/.test(p.condition)); await s.chooseForcedSwitch(m.ident.slice(4)); }
		else await s.chooseMove(1);
	}
	assert.ok(s.finished, 'battle should finish');
	return s.result();
}

test('stable identity: switching changes engine slots, not which persistent member is written', async () => {
	const game = makeGame();
	const s = await session(game); s.take();
	await s.chooseSwitch('A-0003'); // Venusaur in; party order in the engine is now different
	await s.chooseSwitch('A-0002');
	const result = await playOut(s);
	assert.equal(result.outcome.kind, 'win');
	// the engine's party order differs from the persistent one, yet results are keyed by id
	const orderInEngine = s.gw._debugBattle().getSide('p1').pokemon.map(p => p.name);
	assert.notDeepEqual(orderInEngine, game.party.map(m => m.id));
	const dir = tmp(); const store = createFixtureSaveStore(saveGame(dir, game), {}, identityKeys, content);
	store.commit(result);
	const after = store.load();
	assert.deepEqual(after.party.map(m => m.id), game.party.map(m => m.id), 'persistent order and ids unchanged');
	for (const m of game.party) { const a = after.party.find(x => x.id === m.id); assert.equal(a.species, m.species); }
	// Damage taken by A-0002 / A-0003 landed on those ids and nowhere else
	const dmg = id => game.party.find(m => m.id === id).hp - after.party.find(m => m.id === id).hp;
	assert.ok(dmg('A-0003') >= 0 && dmg('A-0002') >= 0);
});

test('write set: nothing outside the allowed fields changes; bag deltas and ledger are exact', async () => {
	const game = makeGame(); game.party[0].hp = 70;
	const s = await session(game); s.take();
	const used = await s.useItem('potion', 'A-0001'); assert.ok(used.ok);
	assert.equal(I6.bagOf(s).potion, 2, 'deducted on use');
	const result = await playOut(s);
	assert.equal(I6.bagOf(result).potion, -1);
	const dir = tmp(); const store = createFixtureSaveStore(saveGame(dir, game), {}, identityKeys, content);
	const before = store.load(); store.commit(result); const after = store.load();
	const changed = S.diffPaths(before, after);
	const allowed = [/^party\.\d\.(level|exp|hp|status|statusCount|moves|evs|friendship)(\.|$)/, /^inventory\.pockets\./, /^dex\./, /^appliedBattles\./, /^money$/];
	for (const p of changed) assert.ok(allowed.some(re => re.test(p)), `unexpected change at ${p}`);
	assert.equal(I6.bagOf(after).potion, 2);
	for (const m of after.party) for (const k of ['nickname', 'item', 'ability', 'nature', 'gender', 'ivs', 'ball', 'ot', 'species', 'id']) {
		assert.deepEqual(m[k], before.party.find(x => x.id === m.id)[k], `${m.id}.${k} must stay untouched`);
	}
	// temporary battle state never leaks into the persistent record
	for (const m of after.party) for (const k of ['boosts', 'volatiles', 'stages']) assert.ok(!(k in m));
});

test('item ledger: cancel refunds once, ineligible use is refused up front, execution-time no-effect refunds once (also at the end), failed throw is spent', async () => {
	const damaged = () => { const g = makeGame(); g.party[0].hp = 70; return g; };
	const wildSnorlax = () => ({ kind: 'wild', team: [foeMember('W-0001', 'Snorlax', 40, { moves: ['protect'] })] });
	// staged then cancelled: the reserved item goes back, nothing was applied
	const s1 = await session(damaged(), { foe: wildSnorlax() }); s1.take();
	const staged = await s1.useItem('potion', 'A-0001', { commit: false });
	assert.ok(staged.staged); assert.equal(I6.bagOf(s1).potion, 2, 'reserved at registration');
	await s1.cancel();
	assert.equal(I6.bagOf(s1).potion, 3, 'cancel returns the item'); assert.equal(s1.ledger[0].why, 'cancelled');
	await s1.cancel(); assert.equal(I6.bagOf(s1).potion, 3, 'a second cancel cannot refund twice');
	const next = await s1.chooseMove(1); assert.ok(next.ok); // after a cancel the same turn can still be played normally
	// WP28 3.5: an item that cannot work is refused BEFORE registration: stays in the menu, nothing consumed, no turn used
	const s2 = await session(makeGame(), { foe: wildSnorlax() }); s2.take();
	assert.deepEqual(await s2.useItem('potion', 'A-0001'), { ok: false, reason: 'item-no-effect' });
	assert.equal(I6.bagOf(s2).potion, 3); assert.equal(s2.ledger.length, 0); assert.deepEqual(s2.take(), [], 'no turn was played');
	assert.deepEqual(await s2.useItem('antidote', 'A-0001'), { ok: false, reason: 'item-no-effect' }, 'wrong/no status');
	assert.deepEqual(await s2.useItem('potion', 'Z-9999'), { ok: false, reason: 'unknown-target' });
	// execution-time no-effect (state changed after registration): refunded once, and NOT again at the end of the battle
	const g3 = damaged();
	const s3 = await session(g3, { foe: { kind: 'wild', team: [foeMember('W-0001', 'Pidgey', 5, { moves: ['tackle'] })] } }); s3.take();
	assert.ok((await s3.useItem('potion', 'A-0001', { commit: false })).staged);
	const mon = s3.gw._debugBattle().getSide('p1').pokemon.find(p => p.name === 'A-0001'); mon.hp = mon.maxhp; // healed by something else meanwhile
	const r3 = await s3.commitTurn(); assert.ok(r3.ok);
	assert.equal(s3.ledger[0].state, 'refunded'); assert.equal(s3.ledger[0].why, 'noeffect'); assert.equal(I6.bagOf(s3).potion, 3);
	await playOut(s3);
	assert.equal(I6.bagOf(s3.result()).potion, undefined, 'WP42 6.0 anomaly NOT reproduced: the bag delta for the refunded potion is 0 after the whole battle');
	assert.equal(I6.bagOf(s3).potion, 3);
	// unknown / none left are refused up front and consume nothing
	const s4 = await session(damaged(), { foe: wildSnorlax() }); s4.take();
	assert.deepEqual(await s4.useItem('rarecandy', 'A-0001'), { ok: false, reason: 'unknown-item' });
	assert.equal((await s4.useItem('xattack', 'A-0001')).ok, true);
	assert.deepEqual(await s4.useItem('xattack', 'A-0001'), { ok: false, reason: 'none-left' });
	// a failed throw spends the ball
	let spent = null;
	for (let k = 1; k < 60 && !spent; k++) {
		const w = await session(makeGame(), { seed: [k, 2, 3, 4], foe: wildSnorlax() }); w.take();
		const t = await w.throwBall('pokeball');
		if (t.ok && !w.finished) spent = w;
	}
	assert.ok(spent, 'some seed fails the throw');
	assert.equal(I6.bagOf(spent).pokeball, 4, 'ball spent, never refunded');
});

test('capture: caught member gets a stable id, exp is paid for the capture, dex updated, ball consumed once', async () => {
	const game = makeGame();
	const template = require('../../../js/engine/build/engine.cjs').state.newGame({party:[foeMember('W-0001', 'Snorlax', 40, {moves:['protect']})]}).party[0];
	const receiveOptions = {templates:{'W-0001':template},profile:{mode:1,naming:1}};
	const s = await session(game, { battleId: 'B-cap', foe: { kind: 'wild', team: [foeMember('W-0001', 'Snorlax', 40, { moves: ['protect'] })] } }); s.take();
	const before = s.party[0].exp;
	const t = await s.throwBall('masterball'); assert.ok(t.ok);
	assert.ok(s.finished);
	const result = s.result();
	assert.equal(result.outcome.kind, 'caught');
	assert.equal(result.captured.length, 1);
	const c = result.captured[0];
	assert.equal(c.id, 'W-0001'); assert.equal(c.species, 'Snorlax'); assert.equal(c.ball, 'masterball');
	assert.equal(c.exp, G.minExp('slow', 40), 'fresh exp for the caught level');
	assert.ok(result.members['A-0001'].exp > before, 'exp for the capture (setting on) is paid to the participant');
	assert.equal(I6.bagOf(result).masterball, -1);
	assert.deepEqual(result.dex.owned, ['Snorlax']);
	const dir = tmp(); const store = createFixtureSaveStore(saveGame(dir, game), {}, identityKeys, content);
	store.commit(result, receiveOptions);
	const after = store.load();
	assert.equal(after.party.length, 4); assert.equal(after.party[3].id, 'W-0001');
	assert.ok(!I6.bagOf(after).masterball);
	assert.ok(after.dex.owned.includes('Snorlax'));
	// duplicate submit does nothing more
	assert.equal(store.commit(result, receiveOptions).status, 'already-applied');
	assert.deepEqual(store.load(), after);
});

test('idempotency: same result twice applies once; a different result for the same battleId is refused', async () => {
	const game = makeGame(); game.party[0].hp = 70;
	const s = await session(game); s.take(); await s.useItem('potion', 'A-0001');
	const result = await playOut(s);
	const dir = tmp(); const store = createFixtureSaveStore(saveGame(dir, game), {}, identityKeys, content);
	assert.equal(store.commit(result).status, 'applied');
	const once = store.load();
	assert.equal(store.commit(JSON.parse(JSON.stringify(result))).status, 'already-applied');
	assert.deepEqual(store.load(), once);
	assert.equal(I6.bagOf(once).potion, 2, 'potion deducted exactly once');
	const tampered = JSON.parse(JSON.stringify(result)); tampered.members['A-0001'].exp += 1;
	assert.throws(() => store.commit(tampered), /different result/);
	assert.deepEqual(store.load(), once);
	// contract violations leave the file untouched
	const bad = { ...result, battleId: 'B-bad', members: { 'Z-9999': { hp: 1 } } };
	assert.throws(() => store.commit(bad), /unknown member/);
	const badField = { ...result, battleId: 'B-bad2', members: { 'A-0001': { nickname: 'hax' } } };
	assert.throws(() => store.commit(badField), /invalid battle result \$\.members\.A-0001\.nickname: unknown field/);
	const neg = { ...result, battleId: 'B-bad3', bag: { potion: -99 } };
	assert.throws(() => store.commit(neg), /not-enough-items/);
	assert.deepEqual(store.load(), once);
});

test('abandoned battle (no result) leaves the save byte-identical', async () => {
	const game = makeGame(); const dir = tmp(); const f = saveGame(dir, game);
	const bytes = fs.readFileSync(f);
	const s = await session(game); s.take();
	await s.useItem('potion', 'A-0001'); await s.chooseMove(1);
	const mid = await session(game); mid.take();
	assert.throws(() => mid.result(), /not finished/, 'no result exists before the battle ends');
	assert.ok(bytes.equals(fs.readFileSync(f)), 'nothing persisted before commit');
	assert.deepEqual(I6.bagOf(game), I6.bagOf(makeGame()), 'input game object is never mutated by the session');
});

async function makeResult() {
	const game = makeGame(); game.party[0].hp = 70;
	const s = await session(game, { battleId: 'B-crash' }); s.take(); await s.useItem('potion', 'A-0001');
	return { game, result: await playOut(s) };
}
const POINTS = ['start', 'beforeSave', 'afterTmpWrite', 'beforeRename', 'afterRename'];
const COMMITTED_AFTER = new Set(['afterRename']);

test('failure boundary (simulated throws): old-or-new state at every point, retry applies exactly once', async () => {
	const { game, result } = await makeResult();
	for (const point of POINTS) {
		const dir = tmp(); const f = saveGame(dir, game);
		const crashing = createFixtureSaveStore(f, { at: p => { if (p === point) throw new Error('injected ' + point); } }, identityKeys, content);
		assert.throws(() => crashing.commit(result), /injected/);
		const recovered = createFixtureSaveStore(f, {}, identityKeys, content).load();
		const isNew = !!recovered.appliedBattles['B-crash'];
		assert.equal(isNew, COMMITTED_AFTER.has(point), `state after throw at ${point}`);
		assert.ok(!fs.existsSync(f + '.tmp'), 'interrupted temp file cleaned on load');
		const retry = createFixtureSaveStore(f, {}, identityKeys, content).commit(result);
		assert.equal(retry.status, isNew ? 'already-applied' : 'applied');
		const fin = createFixtureSaveStore(f, {}, identityKeys, content).load();
		assert.equal(I6.bagOf(fin).potion, 2, `potion deducted once after retry (${point})`);
		assert.equal(Object.keys(fin.appliedBattles).length, 1);
	}
});

test('failure boundary (REAL process kill): same guarantees when the process dies mid-commit', async () => {
	const { game, result } = await makeResult();
	for (const point of POINTS.slice(1)) {
		const dir = tmp(); const f = saveGame(dir, game); const rf = path.join(dir, 'result.json');
		fs.writeFileSync(rf, JSON.stringify(result));
		const child = spawnSync(process.execPath, [path.join(__dirname, 'crash-child.cjs'), f, rf], { env: { ...process.env, CRASH_AT: point }, encoding: 'utf8' });
		assert.equal(child.signal, 'SIGKILL', `child must really die at ${point}`);
		const recovered = createFixtureSaveStore(f, {}, identityKeys, content).load();
		assert.equal(!!recovered.appliedBattles['B-crash'], COMMITTED_AFTER.has(point), `state after kill at ${point}`);
		createFixtureSaveStore(f, {}, identityKeys, content).commit(result);
		const fin = createFixtureSaveStore(f, {}, identityKeys, content).load();
		assert.equal(I6.bagOf(fin).potion, 2); assert.equal(Object.keys(fin.appliedBattles).length, 1);
	}
});

test('persistent status survives, temporary boosts do not', async () => {
	const game = makeGame();
	const s = await session(game, { foe: { kind: 'wild', team: [foeMember('W-0001', 'Snorlax', 40, { moves: ['protect'] })] } }); s.take();
	await s.useItem('xattack', 'A-0001');
	const mon = s.gw._debugBattle().getSide('p1').active[0]; assert.equal(mon.boosts.atk, 2);
	mon.setStatus('psn');
	const run = await s.run(); assert.ok(run.ok);
	assert.ok(s.finished);
	const res = s.result();
	assert.deepEqual([res.members['A-0001'].status, res.members['A-0001'].statusCount], ['psn', 0]);
	assert.ok(!('boosts' in res.members['A-0001']));
	assert.equal(res.outcome.kind, 'run');
	assert.equal(I6.bagOf(res).xattack, -1);
});

test('member ids must survive Showdown nickname handling (<=18 safe chars)', async () => {
	const game = makeGame();
	await assert.rejects(() => session(game, { foe: { kind: 'wild', team: [foeMember('W-this-id-is-way-too-long-1', 'Pidgey', 5)] } }), /not usable as a battle id/);
	await assert.rejects(() => session(game, { foe: { kind: 'wild', team: [foeMember('bad|id', 'Pidgey', 5)] } }), /not usable as a battle id/);
	const ok = await session(game, { foe: { kind: 'wild', team: [foeMember('W123456-1', 'Pidgey', 5)] } });
	assert.ok(ok.currentRequest());
});

test('statusCount is a write-set field: validated, applied, and bad poison is stored as plain poison after a battle', async () => {
	const game = makeGame();
	const S2 = require('../../../js/engine/game/state.cjs');
	assert.ok(S2.MEMBER_WRITE_SET.includes('statusCount'));
	const base = { protocol: 1, battleId: 'SC-1', outcome: { kind: 'run', winner: null }, members: {}, bag: {}, captured: [], dex: { seen: [], owned: [] } };
	const before = S2.clone(game);
	for (const bad of [-1, 1.5, '2', null]) {
		assert.throws(() => S2.applyBattleResult(game, { ...base, battleId: 'SC-bad', members: { 'A-0001': { statusCount: bad } } }), /invalid battle result \$\.members\.A-0001\.statusCount: expected a safe integer/);
		assert.deepEqual(game, before, 'structural rejection leaves the input and ledger untouched');
	}
	const ok = S2.applyBattleResult(game, { ...base, members: { 'A-0001': { status: 'slp', statusCount: 2 } } });
	assert.deepEqual([ok.state.party[0].status, ok.state.party[0].statusCount], ['slp', 2]);
	// badly poisoned at the end of a battle becomes plain poison with a cleared counter (WP20 / WP39 after_battle)
	const s = await session(game, { foe: { kind: 'wild', team: [foeMember('W-0001', 'Snorlax', 40, { moves: ['protect'] })] } }); s.take();
	s.gw._debugBattle().getSide('p1').active[0].setStatus('tox');
	assert.equal(s.gw.readState('p1')[0].statusCount, 1, 'engine view: badly poisoned = 1');
	await s.run(); assert.ok(s.finished);
	const m = s.result().members['A-0001'];
	assert.deepEqual([m.status, m.statusCount], ['psn', 0]);
});
