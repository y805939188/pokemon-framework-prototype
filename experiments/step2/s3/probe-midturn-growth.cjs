'use strict';
// 2.3 probe: can growth be applied INSIDE the turn (right after the KO), so a later action of the
// same turn already uses the new level? Compares two timings on the same seed/scenario:
//   POST  = growth after the turn (what BattleSession does by default)
//   MID   = growth from a faint hook inside the turn
const assert = require('node:assert/strict');
const { BattleGateway } = require('../../../js/engine/gateway.cjs');
const G = require('../../../js/engine/game/growth.cjs');
const { content, makeGame, foeMember } = require('./fixtures.cjs');
const W = require('../../../js/engine/fixtures/wild-1v1.json');

const drain = gw => { const o = []; while (gw._queue.length) o.push(gw._queue.shift()); return o; };
const lines = msgs => msgs.filter(m => m.kind === 'events').flatMap(m => m.events).map(e => e.raw).filter(l => !l.startsWith('|t:'));
const mkTeamSet = (m, name) => ({ name: m.id, species: m.species, item: '', ability: m.ability, nature: m.nature, gender: 'M', level: m.level, evs: m.evs, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, moves: name });
const foeSet = (id, species, level, moves) => ({ name: id, species, item: '', ability: 'Keen Eye', moves, nature: 'Hardy', evs: {}, level, gender: 'M' });

async function scenario(mode) {
	const game = makeGame();
	const players = [{ name: 'A', team: game.party.map((m, i) => mkTeamSet(m, [['Flamethrower', 'Air Slash', 'Dragon Pulse', 'Roost'], ['Hydro Pump', 'Ice Beam', 'Flash Cannon', 'Protect'], ['Giga Drain', 'Sludge Bomb', 'Earthquake', 'Synthesis']][i])) },
		{ name: 'F', team: [foeSet('T-1', 'Pidgey', 5, ['Protect', 'Tackle']), foeSet('T-2', 'Snorlax', 60, ['Protect', 'Tackle'])] }];
	const gw = await BattleGateway.create({ formatid: 'gen8rpgdoublescustomgame', seed: [4, 4, 4, 4], players });
	await gw.choose('p1', 'team 123'); await gw.choose('p2', 'team 12'); drain(gw);
	let levelledAt = null;
	const grow = () => {
		// artificial large jump (50 -> 70) so the timing difference is visible in one hit; the exact
		// exp amount is irrelevant to the question being probed (WHEN the engine sees the new stats)
		const m = game.party[1];
		gw.applyGrowth('p1', m.id, { level: 70, evs: m.evs });
		levelledAt = gw._debugBattle().log.length;
		return 70;
	};
	if (mode === 'MID') gw.setFaintHook(h => { if (h.side === 'p2' && h.id === 'T-1' && levelledAt === null) grow(); });
	// slot 0 (fast Charizard) KOs Pidgey; slot 1 (Blastoise, slower) Ice Beams the Snorlax in the same turn
	await gw.chooseSlots('p1', [{ move: 1, target: 1 }, { move: 2, target: 2 }]);
	await gw.choose('p2', 'move 2 1, move 2 1');
	const L = lines(drain(gw));
	if (mode === 'POST') grow();
	const ice = L.findIndex(l => l.startsWith('|move|p1b: A-0002|Ice Beam'));
	const dmg = L[ice + 2] || L.slice(ice, ice + 4).find(l => l.startsWith('|-damage|p2b'));
	const hpLine = L.slice(ice).find(l => l.startsWith('|-damage|p2b'));
	const hpAfter = Number(hpLine.split('|')[3].split('/')[0]); // percent HP of the target after the hit
	return { L, hpAfter, level: gw._debugBattle().getSide('p1').pokemon[1].level, order: L.findIndex(l => l.startsWith('|faint|p2a')) < ice, dmg };
}

(async () => {
	const post = await scenario('POST');
	const mid = await scenario('MID');
	console.log('KO precedes the slower ally move:', mid.order && post.order);
	console.log('Snorlax HP% after Ice Beam  POST:', post.hpAfter, ' MID:', mid.hpAfter);
	assert.ok(post.order && mid.order, 'scenario valid: slot 0 KOs first, slot 1 moves later in the same turn');
	assert.ok(mid.hpAfter < post.hpAfter, 'mid-turn growth makes the later ally move stronger (lower remaining HP)');
	assert.equal(post.level, 70); assert.equal(mid.level, 70);
	console.log('MIDTURN PROBE PASS: gap is real and a faint hook closes it');
})().catch(e => { console.error('MIDTURN PROBE FAIL', e); process.exit(1); });
