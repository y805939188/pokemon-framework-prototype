import { aggregateBag } from "../rules/inventory";
/**
 * Scripted smoke harness shared by Node (headless) and the NW.js plugin so both
 * environments execute exactly the same checks against the same fixture.
 * Pure CommonJS; paths are resolved relative to this file.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BattleGateway, PROTOCOL_VERSION } from "../battle/gateway";
import { isSelectableMove } from "../battle/move-requests";
import { BattleSession } from "../flow/session";
import * as G from "../rules/growth";
import { SaveStore } from "./save-store";
import { createFixtureSaveStore } from "./fakes";
import { identityKeys } from "../rules/species-key"; // the fixture world: content ids are the Showdown names
import * as F from "./fixtures/game";

/* eslint-disable @typescript-eslint/no-explicit-any */
type L = any;

// The built artifact lives in js/engine/build/; fixtures and the staged engine sit next to it in js/engine/.
const ENGINE_DIR = path.join(__dirname, '..');
const FIXTURE_DIR = path.join(ENGINE_DIR, 'fixtures');
const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'gen8-3v3.json'), 'utf8'));
const GOLDEN_FILE = path.join(FIXTURE_DIR, 'golden-gen8-3v3-seed1234.json');

function create(overrides = {}) {
	return BattleGateway.create({ formatid: fixture.formatid, seed: fixture.seed, players: fixture.players, ...overrides });
}

/** Deterministic scripted policy: team order, then first usable move; forced switch -> first healthy bench slot. */
function decide(req: L): string | null {
	if (req.wait) return null;
	if (req.teamPreview) return 'team ' + req.side.pokemon.map((_: L, i: number) => i + 1).join('');
	if (req.forceSwitch) {
		const idx = req.side.pokemon.findIndex((p: L) => !p.active && !/ fnt$/.test(p.condition));
		return 'switch ' + (idx + 1);
	}
	const i = req.active[0].moves.findIndex(isSelectableMove);
	if (i < 0) throw new Error('request has no selectable move');
	return 'move ' + (i + 1);
}

/**
 * Drive a gateway with the scripted policy until the battle ends or a move request at
 * turn >= stopAtTurn is pending. Returns { msgs, pending } (pending = unanswered requests by side).
 */
async function drive(gw: L, { initial = [], stopAtTurn }: { initial?: { side: string; request: L }[]; stopAtTurn?: number } = {}): Promise<{ msgs: L[]; pending: L }> {
	const msgs: L[] = [];
	let pending: L = {};
	for (const r of initial) pending[r.side] = r.request;
	for (;;) {
		if (!gw._queue.length && Object.keys(pending).length) {
			const turn = gw._debugBattle().turn;
			const live = Object.values(pending).filter((r: L) => !r.wait);
			if (stopAtTurn !== undefined && turn >= stopAtTurn && live.some((r: L) => r.active)) return { msgs, pending };
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
function normalize(msgs: L[]): string[] {
	const out: string[] = [];
	for (const m of msgs) {
		if (m.kind === 'events') {
			for (const e of m.events) if (e.type !== 't:') out.push(e.raw);
		} else if (m.kind === 'request') out.push(`#request ${m.side} ${JSON.stringify(m.request)}`);
		else if (m.kind === 'end') out.push(`#end ${m.winner} ${m.turn} ${m.reason}`);
		else if (m.kind === 'error') out.push(`#error ${m.side} ${m.message}`);
	}
	return out;
}
const sha = (lines: L) => crypto.createHash('sha256').update(lines.join('\n')).digest('hex');

function summarize(msgs: L[]) {
	const end = msgs.find((m: L) => m.kind === 'end');
	const lines = normalize(msgs);
	return { winner: end.winner, turn: end.turn, reason: end.reason, lines: lines.length, sha256: sha(lines) };
}

function ensure(cond: unknown, msg: string): void { if (!cond) throw new Error(msg); }
function deepEq(a: unknown, b: unknown, what: string): void { ensure(JSON.stringify(a) === JSON.stringify(b), `${what} mismatch: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); }

const ids = new Set(fixture.players.flatMap((p: L, i: L) => p.team.map((t: L) => `p${i + 1}: ${t.name}`)));
const idOf = (s: L) => s.replace(/^(p\d)[a-z]?: /, '$1: ');

const CHECKS = {
	async 's1.structure'() {
		const { msgs } = await drive(await create());
		ensure(msgs.filter((m: L) => m.kind === 'error').length === 0, 'engine reported errors');
		ensure(msgs.filter((m: L) => m.kind === 'end').length === 1, 'expected exactly one end');
		ensure(msgs.find((m: L) => m.kind === 'request').request.teamPreview === true, 'first request should be team preview');
		for (const m of msgs.filter((m: L) => m.kind === 'request'))
			for (const p of m.request.side.pokemon) ensure(ids.has(p.ident), `unknown ident ${p.ident}`);
		const events = msgs.filter((m: L) => m.kind === 'events').flatMap((m: L) => m.events);
		for (const e of events.filter((e: L) => e.type === 'switch' || e.type === 'faint'))
			ensure(ids.has(idOf(e.args[0])), `unknown ident in ${e.raw}`);
		const end = msgs.find((m: L) => m.kind === 'end');
		const win = events.find((e: L) => e.type === 'win');
		ensure(win && win.args[0] === end.winner, 'win event must match end.winner');
		const loser = end.winner === 'Alice' ? 'p2' : 'p1';
		const faints = new Set(events.filter((e: L) => e.type === 'faint' && e.args[0].startsWith(loser)).map((e: L) => idOf(e.args[0])));
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
			ensure(msgs.filter((m: L) => m.kind === 'error').length === 0, 'engine reported errors');
			const end = msgs.find((m: L) => m.kind === 'end');
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

	/** 2.2: item / ball / run resolved inside the turn by the RPG format (same engine build in every runtime). */
	async 'rpg-actions'() {
		const W = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'wild-1v1.json'), 'utf8'));
		const mk = async (key: L, lead: L) => {
			const gw = await BattleGateway.create({ formatid: W.formatid, seed: W.seed, wild: true, players: [{ name: 'A', team: W.playerTeam }, { name: 'W', team: [W.wilds[key].set] }] });
			await gw.choose('p1', 'team ' + lead); await gw.choose('p2', 'team 1'); gw._queue.length = 0;
			return gw;
		};
		const run = async (gw: L, payload: L, foeChoice: L) => {
			await gw.act('p1', payload); await gw.choose('p2', foeChoice);
			const msgs = gw._queue.splice(0);
			return { msgs, lines: msgs.filter((m: L) => m.kind === 'events').flatMap((m: L) => m.events).map((e: L) => e.raw), end: msgs.find((m: L) => m.kind === 'end') };
		};
		const g1 = await mk('snorlax', '123');
		const b = g1._debugBattle(); b.sides[0].pokemon[0].hp = 60;
		const heal = await run(g1, { kind: 'item', item: 'potion', target: 'A-0001' }, 'move 1');
		ensure(heal.lines.some((l: L) => l.startsWith('|rpg|item|p1|potion|A-0001|ok|20|80|')), 'potion should heal 20');
		const g2 = await mk('snorlax', '123');
		const ball = await run(g2, { kind: 'ball', ball: 'masterball', target: 'W-0001', catchRate: 25 }, 'move 3');
		ensure(ball.end && ball.end.reason === 'caught' && ball.end.outcome.mon.id === 'W-0001', 'master ball should catch with stable id');
		ensure(!ball.lines.some((l: L) => l.startsWith('|move|p2a')), 'foe must not act after a catch');
		const g3 = await mk('snorlax', '123');
		const esc = await run(g3, { kind: 'run' }, 'move 3');
		ensure(esc.end && esc.end.reason === 'run', 'faster user escapes');
		return { potion: 'ok', ball: ball.end.outcome.mon, run: esc.end.reason };
	},

	/** 2.3: exp/level-up/learn inside a battle, then an idempotent durable write-back (temp file, committed twice). */
	async 'growth-writeback'() {
		const game = F.makeGame(); game.party[0].exp = G.minExp('parabolic', 51) - 1; game.party[0].hp = 70;
		const s: L = await BattleSession.create({ game, battleId: 'smoke-1', content: F.content, seed: [1, 2, 3, 4], foe: { kind: 'trainer', team: [F.foeMember('T-1', 'Pidgey', 5)] } });
		s.take();
		ensure((await s.useItem('potion', 'A-0001')).ok, 'potion registered');
		const r = await s.chooseMove(1);
		ensure(r.messages.some((m: L) => m.kind === 'growth' && m.levelUps.includes(51)), 'level-up reported');
		if (s.pendingLearn) await s.decideLearn(3);
		ensure(s.finished, 'battle finished');
		const result = s.result();
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-smoke-'));
		const file = path.join(dir, 'save.json'); fs.writeFileSync(file, JSON.stringify(game));
    const store = createFixtureSaveStore(file, {}, identityKeys, F.content);
		ensure(store.commit(result).status === 'applied', 'first commit applies');
		ensure(store.commit(result).status === 'already-applied', 'second commit is a no-op');
		const saved = store.load();
		ensure(saved.party[0].level === 51 && aggregateBag(saved.inventory).potion === 2, 'level and bag written exactly once');
		fs.rmSync(dir, { recursive: true, force: true });
		return { level: saved.party[0].level, potion: aggregateBag(saved.inventory).potion, moves: saved.party[0].moves.map((m: L) => m.id) };
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
			checks.push({ id, status: 'fail', ms: Date.now() - t0, error: String((e as Error)?.stack || e) });
		}
	}
	let engineSha = 'unknown';
	try { engineSha = fs.readFileSync(path.join(ENGINE_DIR, 'showdown', 'SOURCE_SHA'), 'utf8').trim(); } catch (e) { /* leave unknown */ }
	return {
		protocolVersion: PROTOCOL_VERSION,
		fixtureId: fixture.fixtureId,
		engineSha,
		env: {
			processVersions: process.versions,
			platform: process.platform,
			arch: process.arch,
			execPath: process.execPath,
			harnessDir: ENGINE_DIR,
			...extraEnv,
		},
		overall: checks.every((c: L) => c.status === 'pass') ? 'pass' : 'fail',
		checks,
	};
}

export { fixture, create, drive, decide, normalize, sha, summarize, runSmoke, GOLDEN_FILE, CHECKS };
