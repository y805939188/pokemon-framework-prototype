import { aggregateBag } from "../rules/inventory";
/**
 * Step 2 scenario matrix S1..S10 as one runnable module (no test framework): the same code runs under
 * Node (headless) and inside the packaged NW.js app, and every scenario returns a fingerprint of its
 * fixed-input outcome (normalized events, requests, results). Equal fingerprints in both hosts are the
 * "same state / same key events / same ending" evidence. Seeds are pinned; nothing time-dependent is hashed.
 *
 * Covers: S1 win, S2/S3 capture success/failure, S4/S5/S6 run success/failure/restricted, S7 items,
 * S8 in-battle growth, S9 write-back, S10 key doubles combinations. Not covered (also not claimed):
 * defeat/draw, multi-target throws, mega/dynamax, doubles AI, real process-kill (Node-only test).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BattleSession } from "../flow/session";
import * as G from "../rules/growth";
import * as S from "../rules/state";
import { SaveStore } from "./save-store";
import { identityKeys } from "../rules/species-key"; // the fixture world: content ids are the Showdown names
import * as F from "./fixtures/game";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Scenario code drives the session through plain JSON messages; message payloads are loosely typed on purpose.
type L = any;

// Historical fingerprints include JSON key iteration order. Project only these fixed-input reports to the
// original fixture bag order, while the runtime inventory and battle delta retain their real ordering.
const historicalBag = (bag:Record<string,number>) => Object.fromEntries([...new Set(['potion','antidote','xattack','pokeball','masterball',...Object.keys(bag)])].filter(id=>Object.hasOwn(bag,id)).map(id=>[id,bag[id]]));
const sha = (x: L) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ensure = (c: L, m: L) => { if (!c) throw new Error('assert: ' + m); };
const eq = (a: L, b: L, m: L) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`assert eq ${m}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); };
const lines = (msgs: L) => msgs.filter((m: L) => m.kind === 'events').flatMap((m: L) => m.events).map((e: L) => e.raw).filter((l: L) => !l.startsWith('|t:') && l !== '|');
const rpgLines = (msgs: L, kind: L) => lines(msgs).filter((l: L) => l.startsWith(`|rpg|${kind}|`)).map((l: L) => l.split('|'));
const kinds = (msgs: L) => msgs.map((m: L) => m.kind);

let battleCounter = 0; // deterministic ids: results (and their hashes) must not depend on randomness
async function make(game: L, foe: L, o: L = {}): Promise<L> {
	const s = await BattleSession.create({ game, battleId: o.battleId || 'M-' + (++battleCounter), content: F.content, seed: o.seed || [1, 2, 3, 4], foe, doubles: !!o.doubles });
	s.take();
	return s;
}
const wild = (sp: L, lv: L, moves?: L) => ({ kind: 'wild', team: [F.foeMember('W1-1', sp, lv, moves ? { moves } : undefined)] });
const trainer = (list: [string, number][]) => ({ kind: 'trainer', team: list.map(([sp, lv], i) => F.foeMember(`T1-${i + 1}`, sp, lv)) });
async function playOut(s: L, max = 30): Promise<L[]> {
	const all: L[] = [];
	for (let i = 0; i < max && !s.finished; i++) {
		if (s.pendingLearn) { all.push(...await s.decideLearn(null)); continue; }
		const req = s.currentRequest();
		let r;
		if (req && req.forceSwitch) { const m = req.side.pokemon.find((p: L) => !p.active && !/ fnt$/.test(p.condition)); r = await s.chooseForcedSwitch(m.ident.slice(4)); }
		else r = await s.chooseMove(1);
		all.push(...(r.messages || []));
	}
	ensure(s.finished, 'battle should finish');
	return all;
}
const finishState = (game: L, result: L) => { const r = S.applyBattleResult(game, result, undefined, identityKeys, {content:F.content}); return r.state; };

const SCENARIOS: Record<string, () => Promise<L>> = {
	async S1() { // ordinary win with exp
		const game = F.makeGame();
		const s = await make(game, trainer([['Pidgey', 5]]));
		const msgs = await playOut(s);
		const end = msgs.find((m: L) => m.kind === 'end');
		eq([end.reason, end.winner], ['win', 'Player'], 'win');
		ensure(msgs.some((m: L) => m.kind === 'growth' && m.member === 'A-0001' && m.exp > 0), 'exp paid');
		const result = s.result();
		const after = finishState(game, result);
		ensure(after.party[0].exp > game.party[0].exp, 'exp persisted');
		return { lines: lines(msgs), result };
	},
	async S2() { // capture success
		const game = F.makeGame();
		const s = await make(game, wild('Snorlax', 40, ['protect']));
		const r = await s.throwBall('masterball'); ensure(r.ok && s.finished, 'caught');
		const res = s.result();
		eq([res.outcome.kind, res.captured.length, res.captured[0].id, res.bag.masterball], ['caught', 1, 'W1-1', -1], 'caught');
		ensure(!lines(r.messages).some((l: L) => l.startsWith('|move|p2a')), 'foe does not act after the catch');
		return { lines: lines(r.messages), result: res };
	},
	async S3() { // capture failure (first failing seed of a fixed scan), battle continues
		const game = F.makeGame();
		for (let k = 1; k < 80; k++) {
			const s = await make(game, wild('Snorlax', 40, ['protect']), { seed: [k, 2, 3, 4] });
			const r = await s.throwBall('pokeball');
			if (r.ok && !s.finished) {
				const ball = rpgLines(r.messages, 'ball')[0];
				eq(ball[6], 'escaped', 'escaped');
				ensure(kinds(r.messages).includes('request'), 'next request issued');
				eq(s.bag.pokeball, 4, 'ball spent');
				return { seed: k, ball, lines: lines(r.messages) };
			}
		}
		throw new Error('no failing seed found');
	},
	async S4() { // run success
		const s = await make(F.makeGame(), wild('Pidgey', 5));
		const r = await s.run(); ensure(r.ok && s.finished, 'ran');
		const res = s.result();
		eq(res.outcome.kind, 'run', 'ran');
		eq(rpgLines(r.messages, 'run')[0].slice(3, 6), ['p1', 'ok', '256'], 'faster user: rate 256');
		return { lines: lines(r.messages), result: res };
	},
	async S5() { // run failure then success, rates follow the formula (first fixed seed whose first attempt fails)
		for (let seed = 1; seed < 80; seed++) {
			const game = F.makeGame();
			game.party = [game.party[1], game.party[0], game.party[2]]; // Blastoise leads: slower than Gengar
			const s = await make(game, wild('Gengar', 40, ['protect']), { seed: [seed, 5, 5, 5] });
			const b = s.gw._debugBattle();
			const ours = b.getSide('p1').active[0].storedStats.spe, theirs = b.getSide('p2').active[0].storedStats.spe;
			ensure(ours < theirs, 'lead is slower');
			const rates: number[] = []; let all: L[] = [];
			for (let i = 1; i <= 40 && !s.finished; i++) {
				const r = await s.run(); ensure(r.ok, 'run accepted'); all = all.concat(r.messages);
				const l = rpgLines(r.messages, 'run')[0];
				rates.push(Number(l[5])); eq(Number(l[6]), i, 'attempt counter');
			}
			if (!s.finished || rates.length < 2) continue;
			rates.forEach((rt: L, i: L) => eq(rt, Math.floor(ours * 128 / theirs) + (i + 1) * 30, 'rate formula'));
			ensure(!lines(all).some((l: L) => l.startsWith('|move|p1')), 'a failed escape consumed the action (no own move)');
			return { seed, rates, lines: lines(all) };
		}
		throw new Error('no seed with a failed first attempt followed by an escape');
	},
	async S6() { // restricted inputs
		const out: L = {};
		const t = await make(F.makeGame(), trainer([['Pidgey', 5], ['Pidgey', 5]]));
		out.trainerRun = await t.run();
		eq([out.trainerRun.reason, t.bag.pokeball], ['trainer', 5], 'a refused run consumes nothing');
		const thrown = await t.throwBall('pokeball'); // WP38 2 / CP16: thrown, spent, blocked by the trainer
		ensure(thrown.ok && !t.finished, 'the turn passes');
		eq([rpgLines(thrown.messages, 'ball')[0][6], t.bag.pokeball], ['blocked', 4], 'trainer blocks the ball, it is spent');
		out.trainerBall = { ok: true, lines: lines(thrown.messages) }; // normalized: raw messages carry the wall-clock |t:| line
		const w = await make(F.makeGame(), wild('Snorlax', 40, ['protect']));
		w.gw._debugBattle().getSide('p1').active[0].trapped = true;
		out.trapped = await w.run(); eq(out.trapped.reason, 'trapped', 'trapped');
		const m = await make(F.makeGame(), { kind: 'wild', team: [F.foeMember('W1-1', 'Pidgey', 5), F.foeMember('W1-2', 'Pidgey', 5)] });
		out.multi = await m.throwBall('pokeball'); eq(out.multi.reason, 'multiplefoes', 'two living foes');
		const e = await make(F.makeGame({ bag: { pokeball: 0 } }), wild('Snorlax', 40, ['protect']));
		out.none = await e.throwBall('pokeball'); eq(out.none.reason, 'none-left', 'no balls');
		return out;
	},
	async S7() { // items: heal/cap, no-effect refund, status cure, stat boost, staged cancel refund, none left
		const game = F.makeGame(); game.party[0].hp = 70;
		const s = await make(game, wild('Snorlax', 40, ['protect']));
		let r = await s.useItem('potion', 'A-0001'); ensure(r.ok, 'potion ok');
		const heal = rpgLines(r.messages, 'item')[0]; eq([heal[6], heal[7]], ['ok', '20'], 'healed 20');
		r = await s.useItem('potion', 'A-0002'); // full-HP bench member: refused at registration (WP28 3.5), nothing consumed
		eq([r.ok, r.reason, s.bag.potion, s.finished], [false, 'item-no-effect', 2, false], 'ineligible target refused, no turn used');
		const lead = () => s.gw._debugBattle().getSide('p1').pokemon.find((p: L) => p.name === 'A-0001');
		eq((await s.useItem('potion', 'A-0001', { commit: false })).staged, true, 'staged'); eq(s.bag.potion, 1, 'reserved');
		lead().hp = lead().maxhp; // healed meanwhile: the execution-time re-check finds no effect
		r = await s.commitTurn();
		eq(rpgLines(r.messages, 'item')[0][6], 'noeffect', 'no effect at execution'); eq(s.bag.potion, 2, 'refunded exactly once');
		lead().hp = 50;
		s.gw._debugBattle().getSide('p1').active[0].setStatus('psn');
		r = await s.useItem('antidote', 'A-0001'); eq(rpgLines(r.messages, 'item')[0][6], 'ok', 'antidote');
		r = await s.useItem('xattack', 'A-0001'); eq(rpgLines(r.messages, 'item')[0][6], 'ok', 'x attack');
		eq(s.gw._debugBattle().getSide('p1').active[0].boosts.atk, 2, '+2 Atk');
		const st = await s.useItem('potion', 'A-0001', { commit: false }); ensure(st.staged, 'staged');
		eq(s.bag.potion, 1, 'reserved'); await s.cancel(); eq(s.bag.potion, 2, 'cancel refunds'); await s.cancel(); eq(s.bag.potion, 2, 'no double refund');
		eq((await s.useItem('xattack', 'A-0001')).reason, 'none-left', 'used up');
		return { bag: historicalBag(s.bag), lines: lines(s.take()) };
	},
	async S8() { // growth inside battle: level-up, learn prompt, next request/action use new state
		const game = F.makeGame(); game.party[0].exp = G.minExp('parabolic', 51) - 1;
		const s = await make(game, trainer([['Pidgey', 5], ['Pidgey', 5]]));
		const r = await s.chooseMove(1);
		const growth = r.messages.find((m: L) => m.kind === 'growth');
		eq(growth.levelUps, [51], 'level 51');
		ensure(r.messages.some((m: L) => m.kind === 'learn-prompt'), 'learn prompt');
		const after = await s.decideLearn(3);
		const req = after.find((m: L) => m.kind === 'request' && m.side === 'p1').request;
		ensure(/L51/.test(req.side.pokemon[0].details), 'request shows L51');
		eq(req.active[0].moves.map((m: L) => m.id).slice(-1), ['slash'], 'new move offered');
		const t2 = await s.chooseMove(4);
		ensure(lines(t2.messages).some((l: L) => l.startsWith('|move|p1a: A-0001|Slash')), 'Slash used next turn');
		return { growth, req: req.side.pokemon[0], lines: lines([...r.messages, ...after, ...t2.messages]) };
	},
	async S9() { // write-back: stable identity, write set, idempotency, durable store with a thrown failure
		const game = F.makeGame(); game.party[0].hp = 70;
		const s = await make(game, trainer([['Pidgey', 5]]));
		await s.chooseSwitch('A-0003'); await s.chooseSwitch('A-0002');
		await s.useItem('potion', 'A-0001');
		const msgs = await playOut(s);
		const result = s.result();
		ensure(s.gw._debugBattle().getSide('p1').pokemon.map((p: L) => p.name).join() !== game.party.map((m: L) => m.id).join(), 'engine order differs from persistent order');
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-mx-'));
		try {
			const file = path.join(dir, 'save.json'); fs.writeFileSync(file, JSON.stringify(game));
			const crashing = new SaveStore(file, { at: (p: L) => { if (p === 'afterTmpWrite') throw new Error('injected'); } }, identityKeys, F.content);
			let threw = false; try { crashing.commit(result); } catch (e) { threw = true; }
			ensure(threw, 'injected failure surfaced');
			const mid = new SaveStore(file, {}, identityKeys, F.content).load();
			ensure(!mid.appliedBattles[result.battleId], 'old state after the failure');
			eq(new SaveStore(file, {}, identityKeys, F.content).commit(result).status, 'applied', 'retry applies');
			eq(new SaveStore(file, {}, identityKeys, F.content).commit(result).status, 'already-applied', 'second submit no-op');
			const after = new SaveStore(file, {}, identityKeys, F.content).load();
			eq(after.party.map((m: L) => m.id), game.party.map((m: L) => m.id), 'persistent order unchanged');
			const changed = S.diffPaths(game, after);
			const allowed = [/^party\.\d\.(level|exp|hp|status|statusCount|moves|evs|friendship)(\.|$)/, /^inventory\.pockets\./, /^dex\./, /^appliedBattles\./, /^money$/];
			for (const p of changed) ensure(allowed.some((re: L) => re.test(p)), 'unexpected change at ' + p);
			let tamper = false; try { const t = JSON.parse(JSON.stringify(result)); t.members['A-0001'].exp += 1; new SaveStore(file, {}, identityKeys, F.content).commit(t); } catch (e) { tamper = /different result/.test((e as Error).message); }
			ensure(tamper, 'tampered result refused');
			// Preserve the frozen historical report in its v1 bag projection; validate current paths above.
			const legacy = (s: S.GameState) => Object.fromEntries(Object.entries(s).map(([key,value])=>key==='inventory'?['bag',historicalBag(aggregateBag(s.inventory))]:[key,value]));
			return { changed: S.diffPaths(legacy(game),legacy(after)), bag: historicalBag(aggregateBag(after.inventory)), party: after.party.map((m: L) => [m.id, m.level, m.exp, m.hp]), lines: lines(msgs) };
		} finally { fs.rmSync(dir, { recursive: true, force: true }); }
	},
	async S10() { // key doubles combinations
		const game = F.makeGame(); game.party[0].hp = 60;
		const D = (foes: L) => make(game, { kind: 'wild', team: foes }, { doubles: true });
		const sn = (id: string) => F.foeMember(id, 'Snorlax', 40, { moves: ['protect'] });
		// item on the ally while the other slot attacks: item first, the item user does not move
		let s = await D([sn('W1-1'), sn('W1-2')]);
		let r = await s.chooseDoubles([{ kind: 'item', item: 'potion', target: 'A-0001' }, { move: 2, target: 1 }]);
		ensure(r.ok, 'doubles choice');
		let L = lines(r.messages);
		const iItem = L.findIndex((l: L) => l.startsWith('|rpg|item|')), iMove = L.findIndex((l: L) => l.startsWith('|move|p1b'));
		ensure(iItem >= 0 && iItem < iMove, 'item before the ally move');
		ensure(!L.some((l: L) => l.startsWith('|move|p1a')), 'item user did not also attack');
		// ball refused while two foes live
		eq(s.gw.query('p1', 'ball', 0), { allowed: false, reason: 'multiplefoes' }, 'ball refused with two foes');
		// switch and item in one turn keeps switch -> item
		s = await D([sn('W2-1'), sn('W2-2')]);
		s.gw._debugBattle().getSide('p1').pokemon[2].hp = 40;
		r = await s.chooseDoubles([{ switch: 3 }, { kind: 'item', item: 'potion', target: 'A-0003' }]);
		L = lines(r.messages);
		ensure(L.findIndex((l: L) => l.startsWith('|switch|p1a: A-0003')) < L.findIndex((l: L) => l.startsWith('|rpg|item|')), 'switch before item');
		// two KOs, both participants paid per foe
		const g2 = F.makeGame();
		const t = await make(g2, { kind: 'trainer', team: [F.foeMember('T1-1', 'Pidgey', 5), F.foeMember('T1-2', 'Pidgey', 5), F.foeMember('T1-3', 'Pidgey', 5)] }, { doubles: true });
		const k = await t.chooseDoubles([{ move: 1, target: 1 }, { move: 2, target: 2 }]);
		const paid = k.messages.filter((m: L) => m.kind === 'growth').map((m: L) => `${m.member}<-${m.foe}`);
		ensure(paid.includes('A-0001<-T1-1') && paid.includes('A-0002<-T1-1'), 'both participants paid for the first foe');
		return { lines: L, paid };
	},
};

/** Run all (or the listed) scenarios; never throws. */
async function runMatrix(only?: string[]) {
	const out: L[] = [];
	for (const [id, fn] of Object.entries(SCENARIOS)) {
		if (only && !only.includes(id)) continue;
		const t0 = Date.now();
		battleCounter = 0;
		try { const detail = await fn(); out.push({ id, status: 'pass', ms: Date.now() - t0, fingerprint: sha(detail) }); }
		catch (e) { out.push({ id, status: 'fail', ms: Date.now() - t0, error: String((e as Error)?.stack || e) }); }
	}
	return out;
}

/**
 * Identity of the built engine artifact this code is running from (the file the host loaded). Cross-host evidence
 * records it so "same code in Node and in the package" is a checked hash, not a claim.
 */
function artifactInfo(): { file: string; bytes: number; sha256: string } {
	const buf = fs.readFileSync(__filename);
	return { file: path.basename(__filename), bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}

export { runMatrix, SCENARIOS, artifactInfo };
