'use strict';
// 2.2 probe: mid-battle level-up. Applies a level change to the engine state through the same
// primitives Showdown itself uses (spreadModify + updateMaxHp), re-issues requests, and checks
// that the NEXT request and the NEXT actual turn use the new state.
// Control = a fresh battle where the Pokemon is created at the new level with the same seed.
const assert = require('node:assert/strict');
const path = require('path');
const H = require('../../../js/engine/harness.cjs');
const { BattleGateway } = require('../../../js/engine/gateway.cjs');
H.BattleGateway = BattleGateway;

/** Candidate bridge primitive (probe-grade): returns {before, after} for the log. */
function applyLevelUp(battle, sideId, name, newLevel) {
	const side = battle.sides.find(s => s.id === sideId);
	const p = side.pokemon.find(x => x.name === name);
	assert.ok(p, 'pokemon not found by stable id ' + name);
	const before = { level: p.level, maxhp: p.maxhp, hp: p.hp, stats: { ...p.baseStoredStats } };
	p.set.level = newLevel;
	p.level = newLevel;
	const stats = battle.spreadModify(p.species.baseStats, p.set);
	p.baseStoredStats = stats;
	for (const k of Object.keys(p.storedStats)) p.storedStats[k] = stats[k];
	p.speed = p.storedStats.spe;
	p.updateMaxHp(); // keeps "HP missing" constant, i.e. current HP rises by the max-HP delta
	p.details = p.getUpdatedDetails ? p.getUpdatedDetails() : p.details;
	return { before, after: { level: p.level, maxhp: p.maxhp, hp: p.hp, stats: { ...p.baseStoredStats } } };
}

async function toFirstMoveRequest(overrides) {
	const gw = await H.create(overrides);
	const r = await H.drive(gw, { stopAtTurn: 1 });
	return { gw, pending: r.pending };
}

(async () => {
	// ---- experimental battle: level 50 Charizard -> 70 right before turn 1 ----
	const { gw, pending } = await toFirstMoveRequest();
	const b = gw._debugBattle();
	const reqBefore = JSON.parse(JSON.stringify(pending.p1));
	const delta = applyLevelUp(b, 'p1', 'A-0001', 70);
	console.log('level-up', JSON.stringify(delta));
	// Re-issue requests so the NEXT request reflects the new state.
	b.makeRequest(b.requestState);
	b.sendUpdates();
	const fresh = {};
	while (gw._queue.length) { const m = gw._queue.shift(); if (m.kind === 'request') fresh[m.side] = m.request; }
	assert.ok(fresh.p1 && fresh.p2, 'requests re-issued');
	const mon = fresh.p1.side.pokemon.find(p => p.ident === 'p1: A-0001');
	console.log('request details/stats before:', reqBefore.side.pokemon[0].details, JSON.stringify(reqBefore.side.pokemon[0].stats));
	console.log('request details/stats after :', mon.details, JSON.stringify(mon.stats));
	assert.match(mon.details, /L70/);
	assert.notDeepEqual(mon.stats, reqBefore.side.pokemon[0].stats);

	// ---- play turn 1 in the experimental battle ----
	const exp = await H.drive(gw, { initial: Object.entries(fresh).map(([side, request]) => ({ side, request })), stopAtTurn: 2 });
	const expLines = H.normalize(exp.msgs).filter(l => !l.startsWith('#request'));

	// ---- control: Charizard created at L70, same seed ----
	const fx = JSON.parse(JSON.stringify(H.fixture));
	fx.players[0].team[0].level = 70;
	const ctl = await H.BattleGateway.create({ formatid: fx.formatid, seed: fx.seed, players: fx.players });
	const c0 = await H.drive(ctl, { stopAtTurn: 1 });
	const c1 = await H.drive(ctl, { initial: Object.entries(c0.pending).map(([side, request]) => ({ side, request })), stopAtTurn: 2 });
	const ctlLines = H.normalize(c1.msgs).filter(l => !l.startsWith('#request'));

	// both message lists hold only what the engine emitted while resolving turn 1
	const a = expLines.filter(l => !l.startsWith('|t:'));
	const c = ctlLines.filter(l => !l.startsWith('|t:'));
	const moves = a.filter(l => l.startsWith('|move|')).map(l => l.split('|')[2]);
	console.log('first mover in experimental turn 1:', moves[0], '| control:', c.filter(l => l.startsWith('|move|'))[0].split('|')[2]);
	console.log('identical turn-1 log vs control:', JSON.stringify(a) === JSON.stringify(c), `(${a.length} lines)`);
	assert.deepEqual(a, c);
	// At L50 Charizard (Spe 167) is slower than Gengar (178); at L70 it must move first.
	assert.match(moves[0], /^p1a: A-0001$/);

	// ---- partial HP: current HP rises by the max-HP delta ----
	const { gw: g2, pending: p2 } = await toFirstMoveRequest();
	const b2 = g2._debugBattle();
	const mon2 = b2.sides[0].pokemon.find(x => x.name === 'A-0001');
	mon2.hp = 40; // pretend damage
	const d = applyLevelUp(b2, 'p1', 'A-0001', 51);
	console.log('partial HP:', JSON.stringify({ before: { hp: d.before.hp, maxhp: d.before.maxhp }, after: { hp: d.after.hp, maxhp: d.after.maxhp } }));
	assert.equal(d.after.hp, 40 + (d.after.maxhp - d.before.maxhp));

	// ---- snapshot after level-up restores to the same state ----
	const snap = g2.snapshot();
	const r2 = await H.BattleGateway.restore(snap);
	const m3 = r2._debugBattle().sides[0].pokemon.find(x => x.name === 'A-0001');
	assert.equal(m3.level, 51); assert.equal(m3.maxhp, d.after.maxhp); assert.equal(m3.hp, d.after.hp);
	assert.deepEqual(m3.baseStoredStats, d.after.stats);
	console.log('snapshot restore keeps level/maxhp/hp/stats: ok');
	console.log('PROBE PASS');
})().catch(e => { console.error('PROBE FAIL', e); process.exit(1); });
