'use strict';
// 2.2 gate: item / catch / run through the engine-event route, plus spec-vector checks of the math.
// Run: node --test experiments/step2/s2/test-actions.cjs
// Spec vectors are DERIVED expectations from the clean-room catalog (CP/etc.), not Ruby-executed output.
const test = require('node:test');
const assert = require('node:assert/strict');
const { BattleGateway } = require('../../../js/engine/gateway.cjs');
const R = require('../../../js/engine/rpg/rules.cjs');
const F = require('../../../js/engine/fixtures/wild-1v1.json');

const drain = gw => { const o = []; while (gw._queue.length) o.push(gw._queue.shift()); return o; };
const lines = msgs => msgs.filter(m => m.kind === 'events').flatMap(m => m.events).map(e => e.raw).filter(l => !l.startsWith('|t:'));
const rpgLine = (L, kind) => (L.find(l => l.startsWith(`|rpg|${kind}|`)) || '').split('|');

async function wild(key, { lead = '123', seed = F.seed, wildOpt = true, foes } = {}) {
	const team = foes ? foes.map(k => F.wilds[k].set) : [F.wilds[key].set];
	const gw = await BattleGateway.create({ formatid: F.formatid, seed, wild: wildOpt, players: [{ name: 'Alice', team: F.playerTeam }, { name: 'Wild', team }] });
	await gw.choose('p1', 'team ' + lead);
	await gw.choose('p2', 'team ' + team.map((_, i) => i + 1).join(''));
	drain(gw);
	return gw;
}

// ------------------------------------------------------------------ pure math vs spec vectors
test('capture math: spec vectors CP01-CP05, CP07, CP10', () => {
	const n = o => R.captureNumbers(o);
	assert.deepEqual([n({ ballId: 'pokeball', baseRate: 45, maxHp: 100, hp: 100 }).x, n({ ballId: 'pokeball', baseRate: 45, maxHp: 100, hp: 100 }).y], [15, 38527]); // CP01
	const cp2 = n({ ballId: 'pokeball', baseRate: 45, maxHp: 200, hp: 1, status: 'slp' });
	assert.deepEqual([cp2.x, cp2.y], [112, 56167]); // CP02 (single rounding at the end; early rounding would give 110)
	const cp3 = n({ ballId: 'pokeball', baseRate: 45, maxHp: 100, hp: 100, status: 'par' });
	assert.deepEqual([cp3.x, cp3.y], [22, 41395]); // CP03
	const cp4 = n({ ballId: 'pokeball', baseRate: 1, maxHp: 100, hp: 100 });
	assert.deepEqual([cp4.x, cp4.y], [1, 23187]); // CP04 floor of 1
	const cp5 = n({ ballId: 'timerball', baseRate: 100, maxHp: 100, hp: 1, ctx: { turn: 10 } });
	assert.deepEqual([cp5.x, cp5.certain], [397, true]); // CP05
	const cp7 = n({ ballId: 'nestball', baseRate: 45, maxHp: 100, hp: 100, ctx: { targetLevel: 21 } });
	assert.deepEqual([cp7.rate, cp7.x, cp7.y], [90, 30, 43874]); // CP07
	assert.ok(Math.abs(n({ ballId: 'nestball', baseRate: 45, maxHp: 100, hp: 100, ctx: { targetLevel: 30 } }).rate - 49.5) < 1e-9);
	assert.equal(n({ ballId: 'nestball', baseRate: 45, maxHp: 100, hp: 100, ctx: { targetLevel: 31 } }).rate, 45);
	// CP10 heavy ball, new tier, rate 45
	for (const [w, want] of [[2999, 65], [3000, 75], [999, 25], [1000, 45], [1999, 45], [2000, 65]])
		assert.equal(R.ballRate('heavyball', 45, { weightHg: w }).rate, want, `weight ${w}`);
	assert.equal(R.ballRate('heavyball', 0, { weightHg: 5000 }).rate, 0); // rate 0 returns early
	// CP06 beast
	assert.equal(R.ballRate('beastball', 45, { ultraBeast: true }).rate, 225);
	assert.equal(R.captureNumbers({ ballId: 'pokeball', baseRate: 45, maxHp: 100, hp: 100, ctx: { ultraBeast: true } }).rate, 4);
	assert.equal(R.ballRate('beastball', 45, { ultraBeast: false }).rate, 4);
	// CP08 quick/timer
	assert.equal(R.ballRate('quickball', 45, { turn: 0 }).rate, 225);
	assert.ok(Math.abs(R.ballRate('timerball', 45, { turn: 3 }).rate - 85.5) < 1e-9);
	assert.equal(R.ballRate('timerball', 45, { turn: 10 }).rate, 180);
});

test('capture rolls: CP13 / CP14 / CP24 sequencing', () => {
	assert.equal(R.critCoefficient(700, true), 10); // 5 x 2 with charm
	const nums = R.captureNumbers({ ballId: 'pokeball', baseRate: 45, maxHp: 100, hp: 100 });
	// CP24: 31 owned -> coef 1 -> c = floor(15*1/12) = 1; gate roll 0 < 1 enters critical, one 65536 roll below y => caught
	const seq = vals => { const q = [...vals]; const calls = []; return { random: n => { calls.push(n); return q.shift(); }, calls }; };
	let s = seq([0, 0]);
	let r = R.rollCapture(nums, { ownedCount: 31 }, s.random);
	assert.deepEqual([r.shakes, r.critical, s.calls], [4, true, [256, 65536]]);
	// only the 256 roll differs: gate misses, fall back to ordinary rolls; first failure stops
	s = seq([1, 0, 0, 65535]);
	r = R.rollCapture(nums, { ownedCount: 31 }, s.random);
	assert.deepEqual([r.shakes, r.critical, s.calls], [2, false, [256, 65536, 65536, 65536]]); // CP14: pass, pass, fail => 2
	// critical, but the single 65536 roll fails => 0 shakes
	s = seq([0, 65535]);
	assert.equal(R.rollCapture(nums, { ownedCount: 31 }, s.random).shakes, 0);
	// critical capture off (setting) => no gate roll at all
	s = seq([0, 0, 0, 0]);
	assert.deepEqual([R.rollCapture(nums, { ownedCount: 31, critical: false }, s.random).shakes, s.calls.length], [4, 4]);
});

test('escape math (WP41 7.2)', () => {
	assert.equal(R.escapeRate(100, 99, 1), 256);
	// constants worked out by hand from WP41 7.2: floor(98*128/178) = 70, plus 30 per attempt
	assert.equal(R.escapeRate(98, 178, 1), 100);
	assert.equal(R.escapeRate(98, 178, 2), 130);
	assert.equal(R.escapeRate(98, 178, 3), 160);
	assert.equal(R.escapeRate(100, 100, 1), 158); // equal speed is NOT "faster": floor(100*128/100)+30
});

// ------------------------------------------------------------------ engine scenarios
test('S2 catch success: Master Ball ends the battle as "caught" before the foe acts, identity preserved', async () => {
	const gw = await wild('snorlax');
	assert.deepEqual(gw.query('p1', 'ball'), { allowed: true });
	await gw.act('p1', { kind: 'ball', ball: 'masterball', target: 'W-0001', catchRate: F.wilds.snorlax.catchRate });
	await gw.choose('p2', 'move 3'); // Body Slam would be the foe's action if the battle continued
	const msgs = drain(gw); const L = lines(msgs);
	const l = rpgLine(L, 'ball');
	assert.equal(l[6], 'caught');
	assert.equal(L.filter(x => x.startsWith('|move|p2a')).length, 0, 'foe never acts once the ball succeeds');
	const end = msgs.find(m => m.kind === 'end');
	assert.equal(end.reason, 'caught');
	assert.equal(end.winner, null, 'engine tie/win is not the business meaning');
	assert.equal(end.outcome.mon.id, 'W-0001');
	assert.equal(end.outcome.mon.species, 'Snorlax');
	assert.equal(end.outcome.ball, 'masterball');
	assert.ok(end.outcome.mon.hp > 0 && end.outcome.mon.maxhp > 0);
});

test('S3 catch failure: battle continues, foe acts, next request issued, shakes recorded', async () => {
	// full-HP Snorlax (rate 25) with a Poke Ball: x=8, a failure is the likely outcome; scan fixed seeds for the first failure
	let found = null;
	for (let k = 1; k < 40 && !found; k++) {
		const gw = await wild('snorlax', { seed: [k, 2, 3, 4] });
		await gw.act('p1', { kind: 'ball', ball: 'pokeball', target: 'W-0001', catchRate: 25 });
		await gw.choose('p2', 'move 1'); // Protect: harmless
		const msgs = drain(gw); const L = lines(msgs); const l = rpgLine(L, 'ball');
		if (l[6] === 'escaped') found = { gw, msgs, L, l, k };
	}
	assert.ok(found, 'some seed must fail a 7% capture');
	const { msgs, L, l } = found;
	const shakes = Number(l[7]);
	assert.ok(shakes >= 0 && shakes <= 3);
	assert.equal(l[9], '8'); // x
	assert.equal(l[10], '34243'); // y for x=8 (floor(65536 / (255/8)^0.1875))
	assert.equal(L.filter(x => x.startsWith('|move|p2a')).length, 1, 'foe acts after a failed throw');
	assert.ok(!msgs.some(m => m.kind === 'end'), 'battle continues');
	assert.ok(msgs.some(m => m.kind === 'request' && m.side === 'p1' && m.request.active), 'next move request issued');
});

test('S2/S3 statistics: engine-level success rate matches the closed form', async () => {
	// x=8 => y=34243 => p(4 shakes) = (y/65536)^4, minus nothing (ownedCount 0 => no crit)
	const y = 34243; const p = Math.pow(y / 65536, 4);
	const N = 1500; let ok = 0;
	for (let i = 0; i < N; i++) {
		const gw = await wild('snorlax', { seed: [i + 1, 7, 11, 13] });
		await gw.act('p1', { kind: 'ball', ball: 'pokeball', target: 'W-0001', catchRate: 25 });
		await gw.choose('p2', 'move 1');
		if (rpgLine(lines(drain(gw)), 'ball')[6] === 'caught') ok++;
	}
	const sd = Math.sqrt(N * p * (1 - p));
	assert.ok(Math.abs(ok - N * p) < 4.5 * sd, `successes ${ok}, expected ${(N * p).toFixed(1)} +- ${(4.5 * sd).toFixed(1)}`);
});

test('S4 run success: faster user escapes with rate 256, foe does not act', async () => {
	const gw = await wild('snorlax'); // Charizard (Spe 167) vs Snorlax: faster
	assert.deepEqual(gw.query('p1', 'run'), { allowed: true });
	await gw.act('p1', { kind: 'run' });
	await gw.choose('p2', 'move 3');
	const msgs = drain(gw); const L = lines(msgs); const l = rpgLine(L, 'run');
	assert.deepEqual(l.slice(4, 6), ['ok', '256']);
	assert.equal(L.filter(x => x.startsWith('|move|')).length, 0);
	const end = msgs.find(m => m.kind === 'end');
	assert.equal(end.reason, 'run');
	assert.equal(end.winner, null);
});

test('S5 run failure: action consumed, foe acts, attempts raise the rate by 30 each time', async () => {
	const gw = await wild('gengar', { lead: '213' }); // Blastoise (slower) vs Gengar
	const b = gw._debugBattle();
	const ours = b.sides[0].active[0].storedStats.spe, theirs = b.sides[1].active[0].storedStats.spe;
	assert.ok(ours < theirs);
	const rates = []; let ended = null; let foeActs = 0;
	for (let attempt = 1; attempt <= 30 && !ended; attempt++) {
		await gw.act('p1', { kind: 'run' });
		await gw.choose('p2', 'move 1'); // Protect
		const msgs = drain(gw); const L = lines(msgs); const l = rpgLine(L, 'run');
		rates.push(Number(l[5]));
		assert.equal(Number(l[6]), attempt);
		foeActs += L.filter(x => x.startsWith('|move|p2a')).length;
		ended = msgs.find(m => m.kind === 'end');
		if (!ended) assert.equal(l[4], 'fail');
	}
	rates.forEach((r, i) => assert.equal(r, R.escapeRate(ours, theirs, i + 1)));
	assert.ok(rates.length > 1 || ended, 'sequence recorded');
	assert.ok(ended && ended.reason === 'run', 'eventually escapes as the rate climbs');
	assert.equal(foeActs, rates.length - 1, 'foe acted once per failed attempt only');
});

test('S6 restrictions: trainer battle, trapped, balls disabled, multiple foes', async () => {
	// trainer: running is refused (forcing it is refused inside the turn and consumes the action); a ball CAN be thrown
	// (WP38 2 / CP16, decided 2026-10-18): the menu allows it, the trainer blocks it at execution
	const t = await wild('snorlax', { wildOpt: false });
	assert.equal(t.query('p1', 'run').allowed, false);
	assert.deepEqual(t.query('p1', 'run'), { allowed: false, reason: 'trainer' });
	assert.deepEqual(t.query('p1', 'ball'), { allowed: true });
	await t.act('p1', { kind: 'run' }); await t.choose('p2', 'move 1');
	let msgs = drain(t); assert.equal(rpgLine(lines(msgs), 'run')[4], 'denied');
	assert.ok(!msgs.some(m => m.kind === 'end'));
	// trainer blocks a ball that was thrown anyway
	const t2 = await wild('snorlax', { wildOpt: false });
	await t2.act('p1', { kind: 'ball', ball: 'masterball', target: 'W-0001', catchRate: 25 }); await t2.choose('p2', 'move 1');
	assert.equal(rpgLine(lines(drain(t2)), 'ball')[6], 'blocked');
	// trapped user cannot run
	const w = await wild('snorlax');
	w._debugBattle().sides[0].active[0].trapped = true;
	assert.deepEqual(w.query('p1', 'run'), { allowed: false, reason: 'trapped' });
	await w.act('p1', { kind: 'run' }); await w.choose('p2', 'move 1');
	assert.equal(rpgLine(lines(drain(w)), 'run')[4], 'denied');
	// balls disabled by battle rule
	const nb = await BattleGateway.create({ formatid: F.formatid, seed: F.seed, wild: true, noBall: true, players: [{ name: 'A', team: F.playerTeam }, { name: 'W', team: [F.wilds.snorlax.set] }] });
	await nb.choose('p1', 'team 123'); await nb.choose('p2', 'team 1'); drain(nb);
	assert.deepEqual(nb.query('p1', 'ball'), { allowed: false, reason: 'ballsdisabled' });
	// more than one living foe: menu refuses (legality only; nothing consumed)
	const m = await wild(null, { foes: ['snorlax', 'gengar'] });
	assert.deepEqual(m.query('p1', 'ball'), { allowed: false, reason: 'multiplefoes' });
});

test('snapshot with a parked ball: restored resolution and PRNG draws are identical', async () => {
	const gw = await wild('snorlax', { seed: [5, 6, 7, 8] });
	await gw.act('p1', { kind: 'ball', ball: 'pokeball', target: 'W-0001', catchRate: 25 });
	const snap = gw.snapshot();
	assert.ok(JSON.parse(snap).rpg.pending['p1:0']);
	await gw.choose('p2', 'move 1');
	const a = lines(drain(gw));
	const r = await BattleGateway.restore(snap);
	await r.choose('p2', 'move 1');
	assert.deepEqual(lines(drain(r)), a);
});

test('S7 items: status cure, stat boost, restricted inputs', async () => {
	const gw = await wild('snorlax');
	const b = gw._debugBattle(); const mon = b.sides[0].active[0];
	// Antidote on a poisoned user
	mon.setStatus('psn');
	await gw.act('p1', { kind: 'item', item: 'antidote', target: 'A-0001' }); await gw.choose('p2', 'move 1');
	let L = lines(drain(gw));
	assert.equal(rpgLine(L, 'item')[6], 'ok'); assert.equal(mon.status, '');
	assert.ok(L.some(l => l.startsWith('|-curestatus|p1a: A-0001') && !l.includes('[silent]')));
	// wrong status: Awakening on a healthy mon changes nothing and is reported as noeffect
	await gw.act('p1', { kind: 'item', item: 'awakening', target: 'A-0001' }); await gw.choose('p2', 'move 1');
	L = lines(drain(gw)); assert.equal(rpgLine(L, 'item')[6], 'noeffect');
	// X Attack raises Atk by 2 stages; a second use at +4 -> +6 -> then capped
	await gw.act('p1', { kind: 'item', item: 'xattack', target: 'A-0001' }); await gw.choose('p2', 'move 1');
	L = lines(drain(gw)); assert.equal(rpgLine(L, 'item')[6], 'ok'); assert.equal(mon.boosts.atk, 2);
	assert.ok(L.some(l => l.startsWith('|-boost|p1a: A-0001|atk|2')));
	mon.boosts.atk = 6;
	await gw.act('p1', { kind: 'item', item: 'xattack', target: 'A-0001' }); await gw.choose('p2', 'move 1');
	L = lines(drain(gw)); assert.equal(rpgLine(L, 'item')[6], 'noeffect', 'already +6: no effect, battle goes on');
	// Full Heal clears a bench Pokemon's status; stat items on a bench Pokemon do nothing
	Object.assign(b.sides[0].pokemon[1], { status: 'brn', statusState: { id: 'brn' } }); // bench Pokemon: set directly
	await gw.act('p1', { kind: 'item', item: 'fullheal', target: 'A-0002' }); await gw.choose('p2', 'move 1');
	L = lines(drain(gw)); assert.equal(rpgLine(L, 'item')[6], 'ok'); assert.equal(b.sides[0].pokemon[1].status, '');
	await gw.act('p1', { kind: 'item', item: 'xattack', target: 'A-0002' }); await gw.choose('p2', 'move 1');
	assert.equal(rpgLine(lines(drain(gw)), 'item')[6], 'noeffect');
});

// ---------------------------------------------------------------- review follow-ups
test('review #8: the Master Ball always catches, also against an Ultra Beast (decided by the ball alone)', () => {
	const ub = { ballId: 'masterball', baseRate: 45, maxHp: 100, hp: 100, ctx: { ultraBeast: true } };
	assert.equal(R.captureNumbers(ub).certain, true);
	assert.equal(R.captureNumbers({ ...ub, ctx: {} }).certain, true);
	assert.equal(R.captureNumbers({ ...ub, ballId: 'pokeball' }).certain, false);
	assert.equal(R.rollCapture(R.captureNumbers(ub), {}, () => { throw new Error('no random roll for a certain catch'); }).shakes, 4);
});

test('review: remaining spec vectors CP09, CP11, CP12 and the critical-capture tiers', () => {
	assert.equal(R.ballRate('fastball', 45, { targetBaseSpeed: 100 }).rate, 180); // CP09
	assert.equal(R.ballRate('fastball', 100, { targetBaseSpeed: 100 }).rate, 255); // x4 then capped at 255 before entering x
	assert.equal(R.ballRate('fastball', 45, { targetBaseSpeed: 99 }).rate, 45);
	assert.equal(R.ballRate('loveball', 45, { sameSpeciesOppositeGender: true }).rate, 255); // CP11: 360 capped
	assert.equal(R.ballRate('moonball', 45, { moonStoneFamily: true }).rate, 180);
	assert.equal(R.ballRate('duskball', 45, { timeOfDay: 2 }).rate, 135); // CP12 (new-style rates on)
	assert.equal(R.ballRate('diveball', 45, { underwater: true }).rate, 157.5);
	assert.equal(R.ballRate('lureball', 45, { fishing: true }).rate, 225);
	assert.equal(R.ballRate('netball', 45, { targetTypes: ['Bug'] }).rate, 157.5);
	for (const [owned, want] of [[30, 0], [31, 1], [150, 1], [151, 2], [300, 2], [301, 3], [450, 3], [451, 4], [600, 4], [601, 5]]) assert.equal(R.critCoefficient(owned, false), want, `owned ${owned}`);
	// CP13: 700 owned + charm => coefficient 10; x=15 => c = floor(15*10/12) = 12; the gate roll must be < 12
	const nums = R.captureNumbers({ ballId: 'pokeball', baseRate: 45, maxHp: 100, hp: 100 });
	const gate = v => { const q = [v, 0]; const calls = []; const r = R.rollCapture(nums, { ownedCount: 700, catchingCharm: true }, n => { calls.push(n); return q.shift(); }); return { r, calls }; };
	assert.equal(gate(11).r.critical, true);
	assert.equal(gate(12).r.critical, false, '12 is not < 12');
});

// ---- engine-level: deterministic escape, noRun, invulnerable target, redirect, carried-in sleep
const bigTeam = (first) => [first, ...F.playerTeam.slice(1)];
async function battleWith(team0, { wildKey = 'snorlax', ...opts } = {}) {
	const gw = await BattleGateway.create({ formatid: F.formatid, seed: F.seed, wild: true, ...opts, players: [{ name: 'A', team: bigTeam(team0) }, { name: 'W', team: [F.wilds[wildKey].set] }] });
	await gw.choose('p1', 'team 123'); await gw.choose('p2', 'team 1'); drain(gw);
	return gw;
}
const lead = (over) => ({ ...F.playerTeam[0], ...over });

test('review #9: Ghost / Run Away / Smoke Ball escape for sure, before trapping, without counting an attempt', async () => {
	const variants = [
		['ghost type', lead({ species: 'Gengar', ability: 'Cursed Body', moves: ['Shadow Ball'] })],
		['Run Away ability', lead({ ability: 'Run Away' })],
		['Smoke Ball', lead({ item: 'Smoke Ball' })],
	];
	for (const [name, mon] of variants) {
		const gw = await battleWith(mon, { wildKey: 'gengar' }); // the foe is faster than a Charizard-based lead; certainty must not depend on speed
		gw._debugBattle().sides[0].active[0].trapped = true; // trapping must NOT matter
		assert.deepEqual(gw.query('p1', 'run'), { allowed: true }, name);
		await gw.act('p1', { kind: 'run' }); await gw.choose('p2', 'move 1');
		const msgs = drain(gw); const l = rpgLine(lines(msgs), 'run');
		assert.deepEqual(l.slice(4, 7), ['ok', 'certain', '0'], name);
		assert.equal(msgs.find(m => m.kind === 'end').reason, 'run', name);
	}
	// a normal lead that is trapped still cannot run; and the battle rule can forbid running altogether
	const t = await battleWith(lead({}));
	t._debugBattle().sides[0].active[0].trapped = true;
	assert.deepEqual(t.query('p1', 'run'), { allowed: false, reason: 'trapped' });
	const nr = await battleWith(lead({ ability: 'Run Away' }), { noRun: true });
	assert.deepEqual(nr.query('p1', 'run'), { allowed: false, reason: 'norun' });
	await nr.act('p1', { kind: 'run' }); await nr.choose('p2', 'move 1');
	assert.equal(rpgLine(lines(drain(nr)), 'run')[4], 'denied');
});

test('review #6: a semi-invulnerable target refuses the ball at the menu; a fainted target is redirected to a companion ON THE FIELD only', async () => {
	const gw = await battleWith(lead({}));
	const foe = gw._debugBattle().sides[1].active[0];
	assert.deepEqual(gw.query('p1', 'ball'), { allowed: true });
	foe.volatiles.fly = { id: 'fly', target: foe };
	assert.deepEqual(gw.query('p1', 'ball'), { allowed: false, reason: 'invulnerable' });
	// redirect: two foes, the second one on the bench; the active target is already fainted when the ball resolves
	const g2 = await BattleGateway.create({ formatid: F.formatid, seed: F.seed, wild: true, players: [{ name: 'A', team: F.playerTeam }, { name: 'W', team: [F.wilds.snorlax.set, { ...F.wilds.pidgey.set, name: 'W-0002' }] }] });
	await g2.choose('p1', 'team 123'); await g2.choose('p2', 'team 12'); drain(g2);
	const b = g2._debugBattle();
	const active = b.sides[1].active[0]; active.hp = 0; active.fainted = true;
	b.rpg.pending['p1:0'] = { kind: 'ball', ball: 'masterball', target: active.name, catchRate: 25 };
	b.format.onRpgAction.call(b, b.sides[0].active[0]);
	const out = b.log.filter(l => l.startsWith('|rpg|ball|'));
	assert.equal(out.length, 1);
	assert.equal(out[0].split('|')[6], 'notarget', 'the benched companion must not be caught');
	assert.ok(!b.rpg.outcome);
});

// ---- persistent status counters (WP20 statusCount): sleep = remaining turns, poison = 0 plain / 1 badly poisoned
async function sleeper(game) {
	const { BattleSession } = require('../../../js/engine/game/session.cjs');
	const FX = require('../../../js/engine/fixtures/game.cjs');
	const sess = await BattleSession.create({ game, battleId: 'SC' + Math.random().toString(36).slice(2, 6), content: FX.content, seed: [1, 2, 3, 4], foe: { kind: 'wild', team: [FX.foeMember('W1-1', 'Snorlax', 40, { moves: ['protect'] })] } });
	sess.take();
	return sess;
}
const FXG = () => require('../../../js/engine/fixtures/game.cjs');

test('statusCount: a carried-in sleep keeps its remaining turns, ticks down in battle and is written back', async () => {
	const game = FXG().makeGame(); game.party[0].status = 'slp'; game.party[0].statusCount = 3;
	const sess = await sleeper(game);
	assert.equal(sess.gw.readState('p1').find(x => x.id === 'A-0001').statusCount, 3, 'seeded exactly');
	// Showdown decrements once per move attempt and wakes at 0: time 3 = two turns lost, the member acts on the third
	const acted = [];
	for (let i = 0; i < 3; i++) { const r = await sess.chooseMove(1); acted.push(lines(r.messages).some(l => l.startsWith('|move|p1a: A-0001'))); }
	assert.deepEqual(acted, [false, false, true]);
	// and when the battle ends while still asleep, the remaining turns go back into the record
	const g2 = FXG().makeGame(); g2.party[0].status = 'slp'; g2.party[0].statusCount = 4;
	const s2 = await sleeper(g2);
	await s2.chooseMove(1); // one lost turn: 4 -> 3
	await s2.run(); assert.ok(s2.finished);
	const m = s2.result().members['A-0001'];
	assert.deepEqual([m.status, m.statusCount], ['slp', 3]);
});

test('statusCount: a legacy record without a counter still wakes up (fresh duration); poison counters are cleared after battle', async () => {
	const legacy = FXG().makeGame(); legacy.party[0].status = 'slp'; delete legacy.party[0].statusCount;
	const sess = await sleeper(legacy);
	let moved = false;
	for (let i = 0; i < 10 && !moved && !sess.finished; i++) moved = lines((await sess.chooseMove(1)).messages).some(l => l.startsWith('|move|p1a: A-0001'));
	assert.ok(moved, 'woke within 10 turns');
	// badly poisoned flag (psn + 1) seeds toxic with its accumulation at 0; at the end it is plain poison with count 0 (WP39 after_battle)
	const g = FXG().makeGame(); g.party[0].status = 'psn'; g.party[0].statusCount = 1;
	const s = await sleeper(g);
	const mon = s.gw._debugBattle().getSide('p1').pokemon[0];
	assert.equal(mon.status, 'tox'); assert.equal(mon.statusState.stage, 0);
	assert.equal(s.gw.readState('p1')[0].statusCount, 1);
	await s.run(); assert.ok(s.finished);
	const m = s.result().members['A-0001'];
	assert.deepEqual([m.status, m.statusCount], ['psn', 0]);
	const plain = FXG().makeGame(); plain.party[0].status = 'psn'; plain.party[0].statusCount = 0;
	const sp = await sleeper(plain);
	assert.equal(sp.gw._debugBattle().getSide('p1').pokemon[0].status, 'psn');
});
