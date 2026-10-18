'use strict';
/**
 * Scripted smoke harness shared by Node (headless) and the NW.js plugin so both
 * environments execute exactly the same checks against the same fixture.
 * Pure CommonJS; paths are resolved relative to this file.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { BattleGateway, PROTOCOL_VERSION } = require('./gateway.cjs');

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'gen8-3v3.json'), 'utf8'));
const GOLDEN_FILE = path.join(FIXTURE_DIR, 'golden-gen8-3v3-seed1234.json');

function create(overrides = {}) {
	return BattleGateway.create({ formatid: fixture.formatid, seed: fixture.seed, players: fixture.players, ...overrides });
}

/** Deterministic scripted policy: team order, then first usable move; forced switch -> first healthy bench slot. */
function decide(req) {
	if (req.wait) return null;
	if (req.teamPreview) return 'team ' + req.side.pokemon.map((_, i) => i + 1).join('');
	if (req.forceSwitch) {
		const idx = req.side.pokemon.findIndex(p => !p.active && !/ fnt$/.test(p.condition));
		return 'switch ' + (idx + 1);
	}
	const mv = req.active[0].moves;
	return 'move ' + (mv.findIndex(m => !m.disabled && m.pp > 0) + 1);
}

/**
 * Drive a gateway with the scripted policy until the battle ends or a move request at
 * turn >= stopAtTurn is pending. Returns { msgs, pending } (pending = unanswered requests by side).
 */
async function drive(gw, { initial = [], stopAtTurn } = {}) {
	const msgs = [];
	let pending = {};
	for (const r of initial) pending[r.side] = r.request;
	for (;;) {
		if (!gw._queue.length && Object.keys(pending).length) {
			const turn = gw._debugBattle().turn;
			const live = Object.values(pending).filter(r => !r.wait);
			if (stopAtTurn !== undefined && turn >= stopAtTurn && live.some(r => r.active)) return { msgs, pending };
			const reqs = pending; pending = {};
			for (const [side, req] of Object.entries(reqs)) {
				const c = decide(req);
				if (c) await gw.choose(side, c);
			}
			continue;
		}
		const m = await gw.next();
		if (!m) break;
		msgs.push(m);
		if (m.kind === 'request') pending[m.side] = m.request;
		if (m.kind === 'end') break;
	}
	return { msgs, pending: {} };
}

/** Canonical text of a run: event lines (minus wall-clock `|t:|`) + request JSON + end, in order. */
function normalize(msgs) {
	const out = [];
	for (const m of msgs) {
		if (m.kind === 'events') {
			for (const e of m.events) if (e.type !== 't:') out.push(e.raw);
		} else if (m.kind === 'request') out.push(`#request ${m.side} ${JSON.stringify(m.request)}`);
		else if (m.kind === 'end') out.push(`#end ${m.winner} ${m.turn} ${m.reason}`);
		else if (m.kind === 'error') out.push(`#error ${m.side} ${m.message}`);
	}
	return out;
}
const sha = lines => crypto.createHash('sha256').update(lines.join('\n')).digest('hex');

function summarize(msgs) {
	const end = msgs.find(m => m.kind === 'end');
	const lines = normalize(msgs);
	return { winner: end.winner, turn: end.turn, reason: end.reason, lines: lines.length, sha256: sha(lines) };
}

function ensure(cond, msg) { if (!cond) throw new Error(msg); }
function deepEq(a, b, what) { ensure(JSON.stringify(a) === JSON.stringify(b), `${what} mismatch: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); }

const ids = new Set(fixture.players.flatMap((p, i) => p.team.map(t => `p${i + 1}: ${t.name}`)));
const idOf = s => s.replace(/^(p\d)[a-z]?: /, '$1: ');

const CHECKS = {
	async 's1.structure'() {
		const { msgs } = await drive(await create());
		ensure(msgs.filter(m => m.kind === 'error').length === 0, 'engine reported errors');
		ensure(msgs.filter(m => m.kind === 'end').length === 1, 'expected exactly one end');
		ensure(msgs.find(m => m.kind === 'request').request.teamPreview === true, 'first request should be team preview');
		for (const m of msgs.filter(m => m.kind === 'request'))
			for (const p of m.request.side.pokemon) ensure(ids.has(p.ident), `unknown ident ${p.ident}`);
		const events = msgs.filter(m => m.kind === 'events').flatMap(m => m.events);
		for (const e of events.filter(e => e.type === 'switch' || e.type === 'faint'))
			ensure(ids.has(idOf(e.args[0])), `unknown ident in ${e.raw}`);
		const end = msgs.find(m => m.kind === 'end');
		const win = events.find(e => e.type === 'win');
		ensure(win && win.args[0] === end.winner, 'win event must match end.winner');
		const loser = end.winner === 'Alice' ? 'p2' : 'p1';
		const faints = new Set(events.filter(e => e.type === 'faint' && e.args[0].startsWith(loser)).map(e => idOf(e.args[0])));
		ensure(faints.size === 3, `loser should have 3 distinct faints, got ${faints.size}`);
		return { winner: end.winner, turn: end.turn };
	},

	async 's1.golden-and-repeat'() {
		const a = summarize((await drive(await create())).msgs);
		const b = summarize((await drive(await create())).msgs);
		deepEq(a, b, 'repeat run');
		const g = JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8'));
		deepEq({ fixtureId: g.fixtureId, seed: g.seed, winner: g.winner, turn: g.turn, reason: g.reason, lines: g.lines, sha256: g.sha256 },
			{ fixtureId: fixture.fixtureId, seed: fixture.seed, ...a }, 'golden');
		return a;
	},

	async 'default-random'() {
		const seeds = new Set();
		const ends = [];
		for (let i = 0; i < 5; i++) {
			const gw = await create({ seed: undefined });
			const seed = String(gw.prngSeed());
			ensure(/^sodium,[0-9a-f]+$/.test(seed), `default PRNG seed should be sodium, got ${seed}`);
			seeds.add(seed);
			const { msgs } = await drive(gw);
			ensure(msgs.filter(m => m.kind === 'error').length === 0, 'engine reported errors');
			const end = msgs.find(m => m.kind === 'end');
			ensure(end && (end.reason === 'win' || end.reason === 'tie'), 'no valid end');
			ends.push(`${end.winner}@${end.turn}`);
		}
		ensure(seeds.size === 5, 'default seeds should differ');
		return { runs: 5, distinctSeeds: seeds.size, ends };
	},

	async 'snapshot-roundtrip'() {
		const gw = await create();
		const head = await drive(gw, { stopAtTurn: 3 });
		ensure(Object.keys(head.pending).length > 0, 'expected pending requests at turn 3');
		const snap = gw.snapshot();
		const pendingAtSnap = gw.pendingRequests();
		const orig = normalize((await drive(gw, { initial: Object.entries(head.pending).map(([side, request]) => ({ side, request })) })).msgs);
		for (let i = 0; i < 2; i++) {
			const r = await BattleGateway.restore(snap);
			deepEq(r.pendingRequests(), pendingAtSnap, 'pending requests after restore');
			deepEq(normalize((await drive(r, { initial: r.pendingRequests() })).msgs), orig, `restored run #${i + 1}`);
		}
		return { snapshotBytes: snap.length, tailLines: orig.length };
	},
};

/** Run all checks, never throwing. Returns a JSON-serializable report. */
async function runSmoke(extraEnv = {}) {
	const checks = [];
	for (const [id, fn] of Object.entries(CHECKS)) {
		const t0 = Date.now();
		try {
			const detail = await fn();
			checks.push({ id, status: 'pass', ms: Date.now() - t0, detail });
		} catch (e) {
			checks.push({ id, status: 'fail', ms: Date.now() - t0, error: String(e && e.stack || e) });
		}
	}
	let engineSha = 'unknown';
	try { engineSha = fs.readFileSync(path.join(__dirname, 'showdown', 'SOURCE_SHA'), 'utf8').trim(); } catch (e) { /* leave unknown */ }
	return {
		protocolVersion: PROTOCOL_VERSION,
		fixtureId: fixture.fixtureId,
		engineSha,
		env: {
			processVersions: process.versions,
			platform: process.platform,
			arch: process.arch,
			execPath: process.execPath,
			harnessDir: __dirname,
			...extraEnv,
		},
		overall: checks.every(c => c.status === 'pass') ? 'pass' : 'fail',
		checks,
	};
}

module.exports = { fixture, create, drive, decide, normalize, sha, summarize, runSmoke, GOLDEN_FILE, CHECKS };
