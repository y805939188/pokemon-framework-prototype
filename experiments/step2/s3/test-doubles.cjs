'use strict';
// 2.3 gate, part 3: representative doubles combinations (engine level). Not an exhaustive doubles
// matrix: multi-target catching, Safari-style rules, mega/dynamax and doubles AI are NOT covered.
const test = require('node:test');
const assert = require('node:assert/strict');
const { BattleGateway } = require('../../../js/engine/gateway.cjs');
const W = require('../../../js/engine/fixtures/wild-1v1.json');

const drain = gw => { const o = []; while (gw._queue.length) o.push(gw._queue.shift()); return o; };
const lines = msgs => msgs.filter(m => m.kind === 'events').flatMap(m => m.events).map(e => e.raw).filter(l => !l.startsWith('|t:'));
const rpg = (L, kind) => L.filter(l => l.startsWith(`|rpg|${kind}|`)).map(l => l.split('|'));
const idx = (L, re) => L.findIndex(l => re.test(l));

const OURS = [...W.playerTeam, { name: 'A-0004', species: 'Snorlax', item: '', ability: 'Immunity', moves: ['Protect', 'Rest', 'Body Slam', 'Crunch'], nature: 'Adamant', evs: {}, level: 50, gender: 'M' }];
const foe = (name, species, level, moves = ['Protect', 'Tackle']) => ({ name, species, item: '', ability: 'Keen Eye', moves, nature: 'Hardy', evs: {}, level, gender: 'M' });

async function doubles({ foes, wild = true, seed = [1, 2, 3, 4] }) {
	const gw = await BattleGateway.create({ formatid: 'gen8rpgdoublescustomgame', seed, wild, players: [{ name: 'Alice', team: OURS }, { name: 'Foe', team: foes }] });
	await gw.choose('p1', 'team 1234'); await gw.choose('p2', 'team ' + foes.map((_, i) => i + 1).join(''));
	drain(gw);
	return gw;
}
const foeChoose = (gw, text) => gw.choose('p2', text);

test('D1 item on an ally while the other slot attacks: both resolve, item first', async () => {
	const gw = await doubles({ foes: [foe('W-1', 'Snorlax', 40, ['Protect']), foe('W-2', 'Snorlax', 40, ['Protect'])] });
	const b = gw._debugBattle(); b.getSide('p1').pokemon[1].hp = 60; // A-0002 is slot 1
	assert.ok(await gw.chooseSlots('p1', [{ kind: 'item', item: 'potion', target: 'A-0002' }, { move: 2, target: 1 }]));
	await foeChoose(gw, 'move 1, move 1');
	const L = lines(drain(gw));
	const item = rpg(L, 'item')[0]; assert.equal(item[6], 'ok'); assert.equal(item[5], 'A-0002');
	assert.ok(idx(L, /^\|rpg\|item\|/) < idx(L, /^\|move\|p1b/), 'item before the ally move');
	assert.equal(L.filter(l => l.startsWith('|move|p1a')).length, 0, 'the item user (slot 0) does not also move');
	assert.equal(L.filter(l => l.startsWith('|move|p1b')).length, 1, 'slot 1 still moves');
});

test('D2 balls: refused while two foes live; allowed for the last foe; success ends the battle before the ally moves', async () => {
	const gw = await doubles({ foes: [foe('W-1', 'Pidgey', 5), foe('W-2', 'Pidgey', 5)] });
	assert.deepEqual(gw.query('p1', 'ball', 0), { allowed: false, reason: 'multiplefoes' });
	// KO foe 1 with slot 0 (Flamethrower) while slot 1 uses Protect (A-0002 move 4)
	await gw.chooseSlots('p1', [{ move: 1, target: 1 }, { move: 4 }]);
	await foeChoose(gw, 'move 2 1, move 2 1'); // Tackle on our slot a
	const msgs = drain(gw);
	assert.ok(lines(msgs).some(l => l.startsWith('|faint|p2')), 'one foe fainted');
	const reqs = {}; for (const m of msgs) if (m.kind === 'request') reqs[m.side] = m.request;
	assert.ok(!reqs.p2.forceSwitch, 'no bench for the foe: no forced switch');
	assert.deepEqual(gw.query('p1', 'ball', 0), { allowed: true });
	// the survivor is whichever foe is still standing: throw a Master Ball with slot 0, the ally attacks it
	const alive = gw._debugBattle().getSide('p2').pokemon.find(p => !p.fainted);
	const slotOfAlive = gw._debugBattle().getSide('p2').active.indexOf(alive);
	assert.ok(await gw.chooseSlots('p1', [{ kind: 'ball', ball: 'masterball', target: alive.name, catchRate: 255 }, { move: 1, target: slotOfAlive === 0 ? 1 : 2 }]));
	await foeChoose(gw, slotOfAlive === 0 ? 'move 2 1, pass' : 'pass, move 2 1');
	const out = drain(gw); const L = lines(out);
	assert.equal(rpg(L, 'ball')[0][6], 'caught');
	assert.equal(L.filter(l => l.startsWith('|move|')).length, 0, 'ally move never runs once the capture ends the battle (item phase precedes moves)');
	assert.equal(out.find(m => m.kind === 'end').reason, 'caught');
});

test('D3 run from slot 1: failure consumes only that slot, slot 0 still acts; success ends the battle', async () => {
	// slot 1 = Blastoise (slower than a Gengar foe): the first attempt can fail; scan seeds for a failing start
	let proved = false;
	for (let k = 1; k < 40 && !proved; k++) {
		const gw = await doubles({ foes: [foe('W-1', 'Gengar', 40, ['Protect']), foe('W-2', 'Gengar', 40, ['Protect'])], seed: [k, 3, 3, 3] });
		let failed = false, ended = false;
		for (let i = 0; i < 25 && !ended; i++) {
			assert.deepEqual(gw.query('p1', 'run', 1), { allowed: true });
			await gw.chooseSlots('p1', [{ move: 4 }, { kind: 'run' }]); // slot 0: Roost (harmless)
			await foeChoose(gw, 'move 1, move 1');
			const msgs = drain(gw); const L = lines(msgs); const run = rpg(L, 'run')[0];
			if (run[4] === 'fail') {
				failed = true;
				assert.equal(L.filter(l => l.startsWith('|move|p1a')).length, 1, 'slot 0 still used its move');
				assert.equal(L.filter(l => l.startsWith('|move|p1b')).length, 0, 'the run slot did not attack');
			}
			if (msgs.find(m => m.kind === 'end')) { ended = true; assert.equal(run[4], 'ok'); assert.equal(msgs.find(m => m.kind === 'end').reason, 'run'); }
		}
		proved = failed && ended;
	}
	assert.ok(proved, 'a seed with failed attempts followed by an escape exists');
});

test('D4/D5 two item slots, and switch + item in one turn keeps the spec order (switch -> item)', async () => {
	const gw = await doubles({ foes: [foe('W-1', 'Snorlax', 40, ['Protect']), foe('W-2', 'Snorlax', 40, ['Protect'])] });
	const b = gw._debugBattle(); const side = b.getSide('p1');
	side.pokemon[0].hp = 50; side.pokemon[1].hp = 50; side.pokemon[2].hp = 40; // A-0003 on the bench
	await gw.chooseSlots('p1', [{ kind: 'item', item: 'potion', target: 'A-0001' }, { kind: 'item', item: 'potion', target: 'A-0002' }]);
	await foeChoose(gw, 'move 1, move 1');
	let L = lines(drain(gw));
	assert.equal(rpg(L, 'item').length, 2); assert.ok(rpg(L, 'item').every(r => r[6] === 'ok'));
	assert.equal(L.filter(l => l.startsWith('|move|p1')).length, 0);
	// D5: slot 0 switches to A-0003 while slot 1 heals A-0003 (bench at selection time)
	await gw.chooseSlots('p1', [{ switch: 3 }, { kind: 'item', item: 'potion', target: 'A-0003' }]);
	await foeChoose(gw, 'move 1, move 1');
	L = lines(drain(gw));
	assert.ok(idx(L, /^\|switch\|p1a: A-0003/) >= 0 && idx(L, /^\|rpg\|item\|/) > idx(L, /^\|switch\|p1a: A-0003/), 'switch resolves before the item');
	assert.equal(rpg(L, 'item')[0][6], 'ok');
	assert.equal(side.pokemon.find(p => p.name === 'A-0003').hp, 60, 'healed after being switched in');
});

test('D6 re-choosing replaces the staged choice: no leftover payload, nothing applied', async () => {
	const gw = await doubles({ foes: [foe('W-1', 'Snorlax', 40, ['Protect']), foe('W-2', 'Snorlax', 40, ['Protect'])] });
	const b = gw._debugBattle(); b.getSide('p1').pokemon[0].hp = 50;
	await gw.chooseSlots('p1', [{ kind: 'item', item: 'potion', target: 'A-0001' }, { move: 4 }]);
	assert.ok(b.rpg.pending['p1:0']);
	await gw.cancel('p1');
	assert.ok(!Object.keys(b.rpg.pending).length && !b.getSide('p1').isChoiceDone());
	assert.equal(b.getSide('p1').pokemon[0].hp, 50);
	await gw.chooseSlots('p1', [{ move: 4 }, { move: 4 }]); // different plan after the cancel
	assert.ok(!Object.keys(b.rpg.pending).length);
	await foeChoose(gw, 'move 1, move 1');
	assert.equal(rpg(lines(drain(gw)), 'item').length, 0);
	// an invalid replacement does not leave the old payload behind either
	await gw.chooseSlots('p1', [{ kind: 'item', item: 'potion', target: 'A-0001' }, { move: 4 }]);
	assert.equal(await gw.chooseSlots('p1', [{ move: 99 }, { move: 4 }]), false);
	assert.ok(!Object.keys(b.rpg.pending).length, 'failed re-choice clears parked payloads');
});

test('D7 snapshot with parked actions in both slots resumes identically', async () => {
	const gw = await doubles({ foes: [foe('W-1', 'Snorlax', 40, ['Protect']), foe('W-2', 'Snorlax', 40, ['Protect'])], seed: [9, 9, 9, 9] });
	const b = gw._debugBattle(); b.getSide('p1').pokemon[0].hp = 50; b.getSide('p1').pokemon[1].hp = 50;
	await gw.chooseSlots('p1', [{ kind: 'item', item: 'superpotion', target: 'A-0001' }, { kind: 'item', item: 'potion', target: 'A-0002' }]);
	const snap = gw.snapshot();
	assert.deepEqual(Object.keys(JSON.parse(snap).rpg.pending).sort(), ['p1:0', 'p1:1']);
	await foeChoose(gw, 'move 1, move 1'); const a = lines(drain(gw));
	const r = await BattleGateway.restore(snap);
	await r.choose('p2', 'move 1, move 1');
	assert.deepEqual(lines(drain(r)), a);
});

// ------------------------------------------------------------------ session level (growth in doubles)
const G = require('../../../js/engine/game/growth.cjs');
const { BattleSession } = require('../../../js/engine/game/session.cjs');
const { content, makeGame, foeMember } = require('./fixtures.cjs');

test('D8 doubles growth: two KOs, two participants each paid per foe, level-up + learn, next request/action use the new state', async () => {
	const game = makeGame(); game.party[0].exp = G.minExp('parabolic', 51) - 1;
	const s = await BattleSession.create({ game, battleId: 'B-d8', content, seed: [1, 2, 3, 4], doubles: true,
		foe: { kind: 'trainer', team: [foeMember('T-1', 'Pidgey', 5), foeMember('T-2', 'Pidgey', 5), foeMember('T-3', 'Pidgey', 5)] } });
	s.take();
	const before = s.party.map(m => m.exp);
	const r = await s.chooseDoubles([{ move: 1, target: 1 }, { move: 2, target: 2 }]); // A-0001 Flamethrower, A-0002 Ice Beam (both 100% accurate)
	assert.ok(r.ok);
	assert.equal(r.messages.filter(m => m.kind === 'growth').length, 2, 'first foe paid to both participants, then the learn prompt blocks the queue');
	assert.ok(r.messages.some(m => m.kind === 'learn-prompt' && m.move.id === 'slash'));
	assert.ok(!r.messages.some(m => m.kind === 'request'), 'requests wait for the decision');
	const after = await s.decideLearn(3);
	const growth = [...r.messages, ...after].filter(m => m.kind === 'growth');
	assert.equal(growth.filter(g => g.member === 'A-0001').length, 2, 'A-0001 paid for both foes');
	assert.equal(growth.filter(g => g.member === 'A-0002').length, 2, 'A-0002 paid for both foes');
	assert.ok(!growth.some(g => g.member === 'A-0003'), 'bench member gets nothing');
	assert.equal(s.party[2].exp, before[2]);
	const req = after.find(m => m.kind === 'request' && m.side === 'p1').request;
	assert.match(req.side.pokemon.find(p => p.ident === 'p1: A-0001').details, /L51/);
	assert.equal(req.active.length, 2, 'both slots still need a choice');
	assert.deepEqual(req.active[0].moves.map(m => m.id).slice(-1), ['slash']);
	const t2 = await s.chooseDoubles([{ move: 4, target: 1 }, { move: 4 }]);
	const L = lines(t2.messages);
	assert.ok(L.some(l => l.startsWith('|move|p1a: A-0001|Slash')), 'learned move used on the next turn');
});

test('D9 doubles ledger: item reserved per spec, refund on refused choice, spent ball on failure', async () => {
	const game = makeGame(); game.party[0].hp = 60;
	const s = await BattleSession.create({ game, battleId: 'B-d9', content, seed: [1, 2, 3, 4], doubles: true,
		foe: { kind: 'wild', team: [foeMember('W-1', 'Snorlax', 40, ['protect']), foeMember('W-2', 'Snorlax', 40, ['protect'])] } });
	s.take();
	// refused choice (bad move index) => reservation returned
	const bad = await s.chooseDoubles([{ kind: 'item', item: 'potion', target: 'A-0001' }, { move: 99 }]);
	assert.equal(bad.ok, false); assert.equal(s.bag.potion, 3);
	// real use: reserved then consumed
	const good = await s.chooseDoubles([{ kind: 'item', item: 'potion', target: 'A-0001' }, { move: 4 }]);
	assert.ok(good.ok); assert.equal(s.bag.potion, 2); assert.equal(s.ledger.at(-1).state, 'consumed');
	// ball refused with two living foes: nothing reserved
	assert.deepEqual(s.gw.query('p1', 'ball', 0), { allowed: false, reason: 'multiplefoes' });
});
