'use strict';
// 2.3 gate, part 1: growth rules vs spec vectors, stat cross-check vs Showdown, in-battle growth.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../../../js/engine/game/growth.cjs');
const S = require('../../../js/engine/game/state.cjs');
const { BattleSession } = require('../../../js/engine/game/session.cjs');
const { BattleGateway } = require('../../../js/engine/gateway.cjs');
const { content, makeGame, foeMember } = require('./fixtures.cjs');

test('curves: anchors and reverse conversion (WP30 3.2)', () => {
	const anchors = { medium: [0, 125000, 1000000], fast: [0, 100000, 800000], slow: [0, 156250, 1250000], parabolic: [0, 117360, 1059860], erratic: [0, 125000, 600000], fluctuating: [0, 142500, 1640000] };
	for (const [c, [a, b, d]] of Object.entries(anchors)) assert.deepEqual([G.minExp(c, 1), G.minExp(c, 50), G.minExp(c, 100)], [a, b, d], c);
	assert.equal(G.levelForExp('medium', 0), 1); assert.equal(G.levelForExp('medium', 1000000), 100); assert.equal(G.levelForExp('medium', 999999), 99);
	assert.equal(G.levelForExp('fast', 800000), 100); assert.equal(G.levelForExp('fast', 799999), 99);
	assert.equal(G.minExp('medium', 101), G.minExp('medium', 100), 'level clamps to max level');
});

test('battle exp: G11 CATERPIE vector and ordering of floors (WP30 4.2)', () => {
	assert.equal(G.battleExp({ foe: { level: 2, baseExp: 39 }, receiver: { level: 3 }, participants: 1 }), 13); // not 14
	// base share <= 0 returns before every later modifier (no +1)
	assert.equal(G.battleExp({ foe: { level: 0, baseExp: 39 }, receiver: { level: 3 }, participants: 1 }), 0);
	// split-among-participants on: each share floored first
	assert.equal(G.battleExp({ foe: { level: 10, baseExp: 50 }, receiver: { level: 10 }, participants: 3, rules: { scaled: false, splitAmongParticipants: true, trainerBonus: false } }), Math.floor(Math.floor(500 / 3) / 7));
});

test('HP after recalculation (WP19 5.5), incl. fainted-revival quirk', () => {
	assert.equal(G.hpAfterRecalc(100, 150, 160), 110);
	assert.equal(G.hpAfterRecalc(1, 150, 100), 1); // living members never drop to 0
	assert.equal(G.hpAfterRecalc(0, 150, 160), 10); // recorded reference behaviour: fainted + max up => delta
	assert.equal(G.hpAfterRecalc(0, 150, 150), 0);
});

test('game-rule stats equal Showdown stats for random species/levels/EVs/natures', async () => {
	const probe = await BattleGateway.create({ formatid: 'gen8rpgcustomgame', players: [{ name: 'a', team: [{ name: 'x', species: 'Pidgey', moves: ['Tackle'] }] }, { name: 'b', team: [{ name: 'y', species: 'Pidgey', moves: ['Tackle'] }] }] });
	const b = probe._debugBattle();
	let n = 0; const natures = Object.keys(G.NATURES);
	let seed = 12345; const rnd = m => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % m; };
	for (let i = 0; i < 400; i++) {
		const sp = Object.keys(content.species)[rnd(7)];
		const level = 1 + rnd(100); const nature = natures[rnd(natures.length)];
		const ivs = { hp: rnd(32), atk: rnd(32), def: rnd(32), spa: rnd(32), spd: rnd(32), spe: rnd(32) };
		const evs = { hp: rnd(253), atk: rnd(253), def: rnd(253), spa: rnd(253), spd: rnd(253), spe: rnd(253) };
		const engine = b.spreadModify(b.dex.species.get(sp).baseStats, { level, nature: nature[0].toUpperCase() + nature.slice(1), ivs, evs });
		assert.deepEqual(G.computeStats(content.species[sp].base, ivs, evs, level, nature), engine, `${sp} L${level} ${nature}`);
		n++;
	}
	assert.equal(n, 400);
	for (const [sp, c] of Object.entries(content.species)) assert.deepEqual(c.base, b.dex.species.get(sp).baseStats, `${sp} base stats fixture matches Showdown data`);
});

test('EV gain clamps per stat and in total (WP30 4.4)', () => {
	assert.deepEqual(G.gainEvs({ hp: 0, atk: 0, def: 0, spa: 250, spd: 0, spe: 0 }, { spa: 3 }).spa, 252);
	const full = { hp: 252, atk: 252, def: 6, spa: 0, spd: 0, spe: 0 };
	assert.equal(G.gainEvs(full, { spe: 3 }).spe, 0, 'total cap 510 reached');
	assert.equal(G.gainEvs({ hp: 252, atk: 252, def: 4, spa: 0, spd: 0, spe: 0 }, { spe: 3 }).spe, 2, 'only the remaining 2 fit');
});

// --------------------------------------------------------------- in-battle growth
async function trainerBattle(game, foeLevels = [5, 5], opts = {}) {
	return BattleSession.create({
		game, battleId: opts.battleId || 'B-1', content, seed: [1, 2, 3, 4],
		foe: { kind: 'trainer', team: foeLevels.map((lv, i) => foeMember(`T-000${i + 1}`, 'Pidgey', lv)) },
	});
}

test('KO -> exp/EV/level-up -> learn prompt -> next request and next action use the new state', async () => {
	// Charizard one exp short of level 51; full move set so the new move needs a replace decision
	const game = makeGame({ charizard: { expOffset: 0 } });
	const c = game.party[0]; c.exp = G.minExp('parabolic', 51) - 1;
	const s = await trainerBattle(game);
	s.take();
	const r = await s.chooseMove(1); // Flamethrower KOs Pidgey L5
	assert.ok(r.ok);
	const msgs = r.messages;
	const growth = msgs.find(m => m.kind === 'growth');
	assert.ok(growth, 'growth reported');
	assert.equal(growth.member, 'A-0001');
	assert.deepEqual(growth.levelUps, [51]);
	const expected = G.battleExp({ foe: { level: 5, baseExp: 50 }, receiver: { level: 50 }, participants: 1, trainer: true });
	assert.equal(growth.exp, expected);
	const prompt = msgs.find(m => m.kind === 'learn-prompt');
	assert.ok(prompt && prompt.move.id === 'slash', 'new level learns Slash and the full move set asks for a decision');
	assert.ok(!msgs.some(m => m.kind === 'request'), 'requests are withheld until the decision is made');
	const after = await s.decideLearn(3); // replace Roost
	assert.ok(after.some(m => m.kind === 'learned' && m.move === 'slash' && m.replaced === 3));
	const req = after.find(m => m.kind === 'request' && m.side === 'p1').request;
	const mon = req.side.pokemon.find(p => p.ident === 'p1: A-0001');
	assert.match(mon.details, /L51/);
	assert.deepEqual(req.active[0].moves.map(m => m.id), ['flamethrower', 'airslash', 'dragonpulse', 'slash']);
	// stats in the request equal the game rules' computation
	const want = G.computeStats(content.species.Charizard.base, { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, s.party[0].evs, 51, 'timid');
	assert.deepEqual(mon.stats, { atk: want.atk, def: want.def, spa: want.spa, spd: want.spd, spe: want.spe });
	// the very next action really uses the learned move
	const t2 = await s.chooseMove(4);
	const lines = t2.messages.filter(m => m.kind === 'events').flatMap(m => m.events.map(e => e.raw));
	assert.ok(lines.some(l => l.startsWith('|move|p1a: A-0001|Slash')), 'Slash executed on the next turn');
	assert.ok(s.party[0].evs.spe >= 1 && s.party[0].evs.spa === 0, 'EV yield of the defeated foe (Pidgey: Speed) written');
});

test('declining a learn keeps the move set; exp/level changes remain', async () => {
	const game = makeGame(); game.party[0].exp = G.minExp('parabolic', 51) - 1;
	const s = await trainerBattle(game); s.take();
	await s.chooseMove(1);
	const after = await s.decideLearn(null);
	assert.ok(!after.some(m => m.kind === 'learned'));
	assert.deepEqual(s.party[0].moves.map(m => m.id), ['flamethrower', 'airslash', 'dragonpulse', 'roost']);
	assert.equal(s.party[0].level, 51);
});

test('free slot learns immediately without a prompt; partial HP follows the HP rule', async () => {
	const game = makeGame(); const c = game.party[0];
	c.moves = c.moves.slice(0, 3); c.exp = G.minExp('parabolic', 51) - 1; c.hp = 100;
	const s = await trainerBattle(game); s.take();
	const r = await s.chooseMove(1);
	assert.ok(!r.messages.some(m => m.kind === 'learn-prompt'));
	assert.ok(r.messages.some(m => m.kind === 'learned' && m.move === 'slash'));
	const iv = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
	const oldMax = G.computeStats(content.species.Charizard.base, iv, c.evs, 50, 'timid').hp;
	const newMax = G.computeStats(content.species.Charizard.base, iv, s.party[0].evs, 51, 'timid').hp;
	s._syncWorkingFromEngine();
	assert.equal(s.party[0].hp, 100 + (newMax - oldMax), 'current HP rises by the max-HP delta (engine and game rule agree)');
});

test('bench members get nothing; fainted participants get nothing; paid once per foe', async () => {
	const game = makeGame(); const s = await trainerBattle(game); s.take();
	const before = s.party.map(m => m.exp);
	await s.chooseMove(1); // KO foe 1
	assert.equal(s.party[1].exp, before[1]); assert.equal(s.party[2].exp, before[2]);
	assert.ok(s.party[0].exp > before[0]);
	const e1 = s.party[0].exp;
	await s.chooseMove(1); // KO foe 2, paid separately
	assert.ok(s.party[0].exp > e1);
});

test('two participants both receive exp (default rules: no splitting)', async () => {
	const game = makeGame(); const s = await trainerBattle(game, [30]); s.take();
	await s.chooseSwitch('A-0002'); // A-0001 participated (on the field at the start), then Blastoise comes in
	const st = s.party.map(m => m.exp);
	const r = await s.chooseMove(2); // Ice Beam
	void r;
	// participants: both A-0001 (was active while foe was in) and A-0002
	assert.ok(s.party[0].exp > st[0], 'the lead was on the field while the foe was: participant');
	assert.ok(s.party[1].exp > st[1], 'the switched-in member also participated');
	assert.equal(s.party[2].exp, st[2], 'bench member untouched');
});
