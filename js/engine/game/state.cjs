'use strict';
/**
 * Persistent game state model + the battle write-back contract (step 2.3).
 * Pure functions. A BattleResult (protocol v1 draft) is the only thing that crosses from the
 * battle layer into persistent state; `applyBattleResult` is the single write path.
 */
const crypto = require('crypto');

const PROTOCOL_VERSION = 1;

/** Fields of a persistent member that a battle result may change. Everything else must be untouched. */
const MEMBER_WRITE_SET = ['level', 'exp', 'hp', 'status', 'moves', 'evs', 'friendship'];

function clone(x) { return JSON.parse(JSON.stringify(x)); }

function newMember(o) {
	const m = {
		id: o.id, species: o.species, nickname: o.nickname ?? null, level: o.level, exp: o.exp, hp: o.hp, status: o.status || '',
		moves: o.moves.map(m => ({ id: m.id, pp: m.pp, maxpp: m.maxpp })),
		item: o.item || '', ability: o.ability, nature: o.nature, gender: o.gender,
		ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31, ...(o.ivs || {}) },
		evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...(o.evs || {}) },
		friendship: o.friendship ?? 70, ball: o.ball || 'pokeball', ot: o.ot || 'player',
	};
	return m;
}

function newGame({ party, bag = {}, money = 0 }) {
	return { schema: 1, party: party.map(newMember), boxes: [], bag: { ...bag }, money, dex: { seen: [], owned: [] }, appliedBattles: {} };
}

/** Stable hash of a result, used for idempotency (same battleId + same hash => no-op). */
function resultHash(result) {
	const canon = JSON.stringify(result, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v));
	return crypto.createHash('sha256').update(canon).digest('hex');
}

/**
 * Apply a BattleResult to a game state (pure). Throws on contract violations (unknown member,
 * result for another protocol version, bag going negative) without partial application.
 * Contract:
 *   result = { protocol, battleId, outcome:{kind,...}, members:{ id:{...writeSet} },
 *              bag:{ itemId: delta }, captured:[member], dex:{seen:[],owned:[]} , money }
 */
function applyBattleResult(state, result) {
	if (result.protocol !== PROTOCOL_VERSION) throw new Error(`unsupported protocol ${result.protocol}`);
	if (!result.battleId) throw new Error('result without battleId');
	const h = resultHash(result);
	const prev = state.appliedBattles[result.battleId];
	if (prev) {
		if (prev.hash === h) return { state, status: 'already-applied' };
		throw new Error(`battle ${result.battleId} already applied with a different result`);
	}
	const next = clone(state);
	for (const [id, patch] of Object.entries(result.members || {})) {
		const m = next.party.find(x => x.id === id);
		if (!m) throw new Error(`result references unknown member ${id}`);
		for (const k of Object.keys(patch)) {
			if (!MEMBER_WRITE_SET.includes(k)) throw new Error(`result tries to write ${k} outside the write set`);
			m[k] = clone(patch[k]);
		}
	}
	for (const [item, delta] of Object.entries(result.bag || {})) {
		const n = (next.bag[item] || 0) + delta;
		if (n < 0) throw new Error(`bag would go negative for ${item}`);
		if (n === 0) delete next.bag[item]; else next.bag[item] = n;
	}
	for (const c of result.captured || []) {
		if (next.party.some(x => x.id === c.id) || next.boxes.some(x => x.id === c.id)) throw new Error(`captured id ${c.id} already exists`);
		const m = newMember(c);
		if (next.party.length < 6) next.party.push(m); else next.boxes.push(m);
	}
	if (result.dex) {
		for (const k of ['seen', 'owned']) for (const sp of result.dex[k] || []) if (!next.dex[k].includes(sp)) next.dex[k].push(sp);
	}
	if (result.money) next.money = Math.max(0, next.money + result.money);
	next.appliedBattles[result.battleId] = { hash: h };
	return { state: next, status: 'applied' };
}

/** Paths that differ between two states (for "nothing outside the write set changed" assertions). */
function diffPaths(a, b, prefix = '') {
	if (a === b) return [];
	if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return [prefix];
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
	const out = [];
	for (const k of keys) out.push(...diffPaths(a[k], b[k], prefix ? `${prefix}.${k}` : k));
	return out;
}

module.exports = { PROTOCOL_VERSION, MEMBER_WRITE_SET, clone, newMember, newGame, resultHash, applyBattleResult, diffPaths };
