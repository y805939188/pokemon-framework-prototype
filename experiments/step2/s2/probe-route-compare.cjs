'use strict';
// 2.2 route comparison on one scenario: p1 uses a Potion while p2 switches in the same turn.
//  Route C (chosen): engine event action resolved inside the turn queue (priority 99).
//  Route A (rejected): bridge mutates state before commit and gives the engine a 'pass'.
// Spec order (WP40 5.1): switches, then items, then moves.
const assert = require('node:assert/strict');
const H = require('../../../js/engine/harness.cjs');
const { BattleGateway } = require('../../../js/engine/gateway.cjs');
const mk = () => BattleGateway.create({ formatid: 'gen8rpgcustomgame', seed: H.fixture.seed, players: H.fixture.players });
const raw = gw => { const o = []; while (gw._queue.length) o.push(gw._queue.shift()); return o.filter(m => m.kind === 'events').flatMap(m => m.events).map(e => e.raw).filter(l => !l.startsWith('|t:')); };
const idx = (L, re) => L.findIndex(l => re.test(l));

(async () => {
	// ---- Route C ----
	const c = await mk(); await H.drive(c, { stopAtTurn: 1 }); raw(c);
	const bc = c._debugBattle(); bc.sides[0].pokemon[0].hp = 79;
	await c.act('p1', { kind: 'item', item: 'potion', target: 'A-0001' });
	await c.choose('p2', 'switch 2');
	const Lc = raw(c);
	// ---- Route A ----
	const a = await mk(); await H.drive(a, { stopAtTurn: 1 }); raw(a);
	const ba = a._debugBattle(); const A1 = ba.sides[0].pokemon[0]; A1.hp = 79;
	const hpBeforeCommit = A1.hp;
	const s = ba.getSide('p1'); s.clearChoice();
	A1.heal(20); ba.add('rpg', 'item', 'p1', 'potion', 'A-0001', 'ok', 20, A1.hp, A1.maxhp); // effect applied NOW
	const hpAfterBridgeApply = A1.hp;
	s.choice.actions.push({ choice: 'pass' });
	await a.choose('p2', 'switch 2');
	const La = raw(a);

	const order = L => ({ item: idx(L, /^\|rpg\|item\|/), sw: idx(L, /^\|switch\|p2a/) });
	console.log('Route C order  (item, opp switch):', JSON.stringify(order(Lc)));
	console.log('Route A order  (item, opp switch):', JSON.stringify(order(La)));
	assert.ok(order(Lc).sw < order(Lc).item, 'C: switch resolves before the item (spec order)');
	assert.ok(order(La).item < order(La).sw, 'A: item resolves before the switch (deviates from spec order)');
	assert.equal(hpBeforeCommit, 79); assert.equal(hpAfterBridgeApply, 99);
	console.log('A mutated HP before the turn was committed (79 -> 99): a cancel/undo would need an explicit rollback; C drops a parked payload instead.');
	console.log('ROUTE COMPARE PASS');
})().catch(e => { console.error('ROUTE COMPARE FAIL', e); process.exit(1); });
