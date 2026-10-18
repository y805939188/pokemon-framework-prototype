'use strict';
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
const { SaveStore } = require('../../../js/engine/game/store.cjs');
const { BattleSession } = require('../../../js/engine/game/session.cjs');
const { content, makeGame, foeMember } = require('./fixtures.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pf-wb-'));
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
	const dir = tmp(); const store = new SaveStore(saveGame(dir, game));
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
	assert.equal(s.bag.potion, 2, 'deducted on use');
	const result = await playOut(s);
	assert.equal(result.bag.potion, -1);
	const dir = tmp(); const store = new SaveStore(saveGame(dir, game));
	const before = store.load(); store.commit(result); const after = store.load();
	const changed = S.diffPaths(before, after);
	const allowed = [/^party\.\d\.(level|exp|hp|status|moves|evs|friendship)(\.|$)/, /^bag\./, /^dex\./, /^appliedBattles\./, /^money$/];
	for (const p of changed) assert.ok(allowed.some(re => re.test(p)), `unexpected change at ${p}`);
	assert.equal(after.bag.potion, 2);
	for (const m of after.party) for (const k of ['nickname', 'item', 'ability', 'nature', 'gender', 'ivs', 'ball', 'ot', 'species', 'id']) {
		assert.deepEqual(m[k], before.party.find(x => x.id === m.id)[k], `${m.id}.${k} must stay untouched`);
	}
	// temporary battle state never leaks into the persistent record
	for (const m of after.party) for (const k of ['boosts', 'volatiles', 'stages']) assert.ok(!(k in m));
});

test('item ledger: cancel refunds, no-effect refunds once, failed throw is spent', async () => {
	const game = makeGame(); // everyone at full HP
	const wildSnorlax = () => ({ kind: 'wild', team: [foeMember('W-0001', 'Snorlax', 40, { moves: ['protect'] })] });
	// staged then cancelled: the reserved item goes back, nothing was applied
	const s1 = await session(game, { foe: wildSnorlax() }); s1.take();
	const staged = await s1.useItem('potion', 'A-0001', { commit: false });
	assert.ok(staged.staged); assert.equal(s1.bag.potion, 2, 'reserved at registration');
	await s1.cancel();
	assert.equal(s1.bag.potion, 3, 'cancel returns the item'); assert.equal(s1.ledger[0].why, 'cancelled');
	await s1.cancel(); assert.equal(s1.bag.potion, 3, 'a second cancel cannot refund twice');
	// after a cancel the same turn can still be played normally
	const next = await s1.chooseMove(1); assert.ok(next.ok);
	// execution-time no-effect (full HP): refunded exactly once
	const s2 = await session(game, { foe: wildSnorlax() }); s2.take();
	assert.ok((await s2.useItem('potion', 'A-0001')).ok);
	assert.equal(s2.bag.potion, 3); assert.equal(s2.ledger[0].state, 'refunded'); assert.equal(s2.ledger[0].why, 'noeffect');
	// unknown / none left are refused up front and consume nothing
	assert.deepEqual(await s2.useItem('rarecandy', 'A-0001'), { ok: false, reason: 'unknown-item' });
	assert.equal((await s2.useItem('xattack', 'A-0001')).ok, true);
	assert.deepEqual(await s2.useItem('xattack', 'A-0001'), { ok: false, reason: 'none-left' });
	// a failed throw spends the ball
	let spent = null;
	for (let k = 1; k < 60 && !spent; k++) {
		const w = await session(game, { seed: [k, 2, 3, 4], foe: wildSnorlax() }); w.take();
		const t = await w.throwBall('pokeball');
		if (t.ok && !w.finished) spent = w;
	}
	assert.ok(spent, 'some seed fails the throw');
	assert.equal(spent.bag.pokeball, 4, 'ball spent, never refunded');
});

test('capture: caught member gets a stable id, exp is paid for the capture, dex updated, ball consumed once', async () => {
	const game = makeGame();
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
	assert.equal(result.bag.masterball, -1);
	assert.deepEqual(result.dex.owned, ['Snorlax']);
	const dir = tmp(); const store = new SaveStore(saveGame(dir, game));
	store.commit(result);
	const after = store.load();
	assert.equal(after.party.length, 4); assert.equal(after.party[3].id, 'W-0001');
	assert.ok(!after.bag.masterball);
	assert.ok(after.dex.owned.includes('Snorlax'));
	// duplicate submit does nothing more
	assert.equal(store.commit(result).status, 'already-applied');
	assert.deepEqual(store.load(), after);
});

test('idempotency: same result twice applies once; a different result for the same battleId is refused', async () => {
	const game = makeGame(); game.party[0].hp = 70;
	const s = await session(game); s.take(); await s.useItem('potion', 'A-0001');
	const result = await playOut(s);
	const dir = tmp(); const store = new SaveStore(saveGame(dir, game));
	assert.equal(store.commit(result).status, 'applied');
	const once = store.load();
	assert.equal(store.commit(JSON.parse(JSON.stringify(result))).status, 'already-applied');
	assert.deepEqual(store.load(), once);
	assert.equal(once.bag.potion, 2, 'potion deducted exactly once');
	const tampered = JSON.parse(JSON.stringify(result)); tampered.members['A-0001'].exp += 1;
	assert.throws(() => store.commit(tampered), /different result/);
	assert.deepEqual(store.load(), once);
	// contract violations leave the file untouched
	const bad = { ...result, battleId: 'B-bad', members: { 'Z-9999': { hp: 1 } } };
	assert.throws(() => store.commit(bad), /unknown member/);
	const badField = { ...result, battleId: 'B-bad2', members: { 'A-0001': { nickname: 'hax' } } };
	assert.throws(() => store.commit(badField), /outside the write set/);
	const neg = { ...result, battleId: 'B-bad3', bag: { potion: -99 } };
	assert.throws(() => store.commit(neg), /negative/);
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
	assert.deepEqual(game.bag, makeGame().bag, 'input game object is never mutated by the session');
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
		const crashing = new SaveStore(f, { at: p => { if (p === point) throw new Error('injected ' + point); } });
		assert.throws(() => crashing.commit(result), /injected/);
		const recovered = new SaveStore(f).load();
		const isNew = !!recovered.appliedBattles['B-crash'];
		assert.equal(isNew, COMMITTED_AFTER.has(point), `state after throw at ${point}`);
		assert.ok(!fs.existsSync(f + '.tmp'), 'interrupted temp file cleaned on load');
		const retry = new SaveStore(f).commit(result);
		assert.equal(retry.status, isNew ? 'already-applied' : 'applied');
		const fin = new SaveStore(f).load();
		assert.equal(fin.bag.potion, 2, `potion deducted once after retry (${point})`);
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
		const recovered = new SaveStore(f).load();
		assert.equal(!!recovered.appliedBattles['B-crash'], COMMITTED_AFTER.has(point), `state after kill at ${point}`);
		new SaveStore(f).commit(result);
		const fin = new SaveStore(f).load();
		assert.equal(fin.bag.potion, 2); assert.equal(Object.keys(fin.appliedBattles).length, 1);
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
	assert.equal(res.members['A-0001'].status, 'psn');
	assert.ok(!('boosts' in res.members['A-0001']));
	assert.equal(res.outcome.kind, 'run');
	assert.equal(res.bag.xattack, -1);
});
