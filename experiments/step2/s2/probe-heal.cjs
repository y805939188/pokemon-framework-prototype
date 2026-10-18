'use strict';
// 2.2 minimal healing-item validation through the engine-event route (act/RpgAction).
const assert = require('node:assert/strict');
const H = require('../../../js/engine/harness.cjs');
const { BattleGateway } = require('../../../js/engine/gateway.cjs');

const FORMAT = 'gen8rpgcustomgame';
const mk = (o = {}) => BattleGateway.create({ formatid: FORMAT, seed: H.fixture.seed, players: H.fixture.players, ...o });
const raw = msgs => msgs.filter(m => m.kind === 'events').flatMap(m => m.events).map(e => e.raw).filter(l => !l.startsWith('|t:'));
const drain = gw => { const o = []; while (gw._queue.length) o.push(gw._queue.shift()); return o; };

/** Play the team-preview and return a battle waiting for the turn-1 move requests. */
async function atTurn1(gw) { await H.drive(gw, { stopAtTurn: 1 }); drain(gw); return gw._debugBattle(); }

(async () => {
	const gw = await mk();
	const b = await atTurn1(gw);
	assert.ok(b.rpg && b.rpg.pending, 'rpg state created by format onBegin');
	const A1 = b.sides[0].pokemon.find(p => p.name === 'A-0001');
	A1.hp = 79; // simulate earlier damage (probe setup only)
	const maxhp = A1.maxhp;

	// ---- Potion on the active Pokemon; the opponent Protects so nothing else changes HP ----
	await gw.act('p1', { kind: 'item', item: 'potion', target: 'A-0001' });
	assert.ok(b.getSide('p1').isChoiceDone() && !b.getSide('p2').isChoiceDone(), 'p1 registered, p2 still to choose');
	await gw.choose('p2', 'move 4');
	let msgs = drain(gw); let L = raw(msgs);
	console.log(L.filter(l => /rpg|heal|move/.test(l)).join('\n'));
	const rpgLine = L.find(l => l.startsWith('|rpg|item|'));
	assert.ok(rpgLine && rpgLine.split('|')[6] === 'ok', 'item resolved ok');
	assert.deepEqual(rpgLine.split('|').slice(7, 10), ['20', '99', String(maxhp)], 'healed 20 -> 99 (end-of-turn Leftovers heals afterwards)');
	assert.ok(L.findIndex(l => l.startsWith('|rpg|item|')) < L.findIndex(l => l.startsWith('|move|')), 'item before moves');
	assert.equal(L.filter(l => l.startsWith('|move|p1a')).length, 0, 'item consumes the whole action');
	assert.equal(L.filter(l => l.startsWith('|move|p2a')).length, 1, 'opponent still acts');

	// ---- cap at missing HP: Super Potion (60) on 20 missing HP heals 20 only ----
	A1.hp = maxhp - 20;
	const ready = () => { const out = {}; for (const m of msgs) if (m.kind === 'request') out[m.side] = m.request; return out; };
	assert.ok(ready().p1, 'next-turn request was issued after the item turn');
	await gw.act('p1', { kind: 'item', item: 'superpotion', target: 'A-0001' });
	await gw.choose('p2', 'move 1'); // Shadow Ball would hurt: opponent acts after the item
	msgs = drain(gw); L = raw(msgs);
	const sp = L.find(l => l.startsWith('|rpg|item|'));
	assert.equal(sp.split('|')[7], '20', 'heal capped at missing HP');

	// ---- fresh battle: re-check at execution time (full HP => noeffect, nothing changes, id stays consumed upstream) ----
	const g2 = await mk(); const b2 = await atTurn1(g2);
	await g2.act('p1', { kind: 'item', item: 'potion', target: 'A-0001' });
	await g2.choose('p2', 'move 4');
	const nl = raw(drain(g2)).find(l => l.startsWith('|rpg|item|'));
	assert.equal(nl.split('|')[6], 'noeffect', 'full HP target => noeffect');
	// fainted/unknown target
	const g3 = await mk(); await atTurn1(g3);
	await g3.act('p1', { kind: 'item', item: 'potion', target: 'nobody' });
	await g3.choose('p2', 'move 4');
	assert.equal(raw(drain(g3)).find(l => l.startsWith('|rpg|item|')).split('|')[6], 'invalid');

	// ---- cancel before commit changes nothing and leaves no parked payload ----
	const g4 = await mk(); const b4 = await atTurn1(g4);
	b4.sides[0].pokemon[0].hp = 50;
	await g4.act('p1', { kind: 'item', item: 'maxpotion', target: 'A-0001' });
	assert.ok(b4.rpg.pending['p1:0'], 'payload parked');
	await g4.cancel('p1');
	assert.ok(!b4.rpg.pending['p1:0'] && !b4.getSide('p1').isChoiceDone(), 'cancelled cleanly');
	assert.equal(b4.sides[0].pokemon[0].hp, 50, 'no HP change after cancel');
	await g4.choose('p1', 'move 1'); await g4.choose('p2', 'move 4'); // battle continues normally
	assert.ok(raw(drain(g4)).some(l => l.startsWith('|move|p1a')), 'normal move works after cancel');

	// ---- snapshot while an action is parked; restored resolution == original ----
	const g5 = await mk(); const b5 = await atTurn1(g5);
	b5.sides[0].pokemon[0].hp = 60;
	await g5.act('p1', { kind: 'item', item: 'hyperpotion', target: 'A-0001' });
	const snap = g5.snapshot();
	assert.ok(JSON.parse(snap).rpg.pending['p1:0'], 'pending payload is in the snapshot');
	await g5.choose('p2', 'move 4');
	const orig = raw(drain(g5));
	const r = await BattleGateway.restore(snap);
	await r.choose('p2', 'move 4');
	assert.deepEqual(raw(drain(r)), orig);
	console.log('parked-action snapshot restore: identical resolution');
	console.log('HEAL PROBE PASS');
})().catch(e => { console.error('HEAL PROBE FAIL', e); process.exit(1); });
