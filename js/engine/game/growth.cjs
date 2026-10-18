'use strict';
/**
 * Game-rule side of growth (step 2.3): curves, stats, battle experience, EV, level-up.
 * Pure functions over plain records; no engine/Showdown dependency. Numbers follow the
 * clean-room specs (WP19 stat formula, WP30 curves and battle experience, defaults for Gen 8).
 * The engine is only told the outcome (see gateway.applyGrowth) and cross-checked against it.
 */

const MAX_LEVEL = 100;

// ---- WP30 3.2 curves (formulas valid for n <= 100; table authority beyond is out of scope) ----
const CURVES = {
	medium: n => n ** 3,
	fast: n => Math.floor((4 * n ** 3) / 5),
	slow: n => Math.floor((5 * n ** 3) / 4),
	parabolic: n => Math.floor((6 * n ** 3) / 5) - 15 * n ** 2 + 100 * n - 140,
	erratic: n => {
		if (n <= 50) return Math.floor((n ** 3 * (100 - n)) / 50);
		if (n <= 68) return Math.floor((n ** 3 * (150 - n)) / 100);
		if (n <= 98) return Math.floor((n ** 3 * Math.floor((1911 - 10 * n) / 3)) / 500);
		return Math.floor((n ** 3 * (160 - n)) / 100);
	},
	fluctuating: n => {
		if (n <= 15) return Math.floor((n ** 3 * (24 + Math.floor((n + 1) / 3))) / 50);
		if (n <= 35) return Math.floor((n ** 3 * (14 + n)) / 50);
		return Math.floor((n ** 3 * (32 + Math.floor(n / 2))) / 50);
	},
};

function minExp(curve, level) {
	const L = Math.min(level, MAX_LEVEL);
	if (!(L >= 1)) throw new RangeError('level must be >= 1');
	return L === 1 ? 0 : CURVES[curve](L);
}
const maxExp = curve => minExp(curve, MAX_LEVEL);

/** exp -> level: largest L with minExp(L) <= exp. */
function levelForExp(curve, exp) {
	if (!(exp >= 0)) throw new RangeError('exp must be >= 0');
	if (exp >= maxExp(curve)) return MAX_LEVEL;
	let L = 1;
	while (L < MAX_LEVEL && minExp(curve, L + 1) <= exp) L++;
	return L;
}

// ---- WP19 5.4 stats ----
const NATURES = {
	hardy: {}, docile: {}, serious: {}, bashful: {}, quirky: {},
	lonely: { atk: 110, def: 90 }, brave: { atk: 110, spe: 90 }, adamant: { atk: 110, spa: 90 }, naughty: { atk: 110, spd: 90 },
	bold: { def: 110, atk: 90 }, relaxed: { def: 110, spe: 90 }, impish: { def: 110, spa: 90 }, lax: { def: 110, spd: 90 },
	timid: { spe: 110, atk: 90 }, hasty: { spe: 110, def: 90 }, jolly: { spe: 110, spa: 90 }, naive: { spe: 110, spd: 90 },
	modest: { spa: 110, atk: 90 }, mild: { spa: 110, def: 90 }, quiet: { spa: 110, spe: 90 }, rash: { spa: 110, spd: 90 },
	calm: { spd: 110, atk: 90 }, gentle: { spd: 110, def: 90 }, sassy: { spd: 110, spe: 90 }, careful: { spd: 110, spa: 90 },
};
const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

function computeStats(base, ivs, evs, level, nature) {
	const out = {};
	const mods = NATURES[String(nature).toLowerCase()] || {};
	for (const k of STAT_KEYS) {
		const inner = Math.floor(((2 * base[k] + (ivs[k] ?? 31) + Math.floor((evs[k] ?? 0) / 4)) * level) / 100);
		if (k === 'hp') out.hp = base.hp === 1 ? 1 : inner + level + 10;
		else out[k] = Math.floor(((inner + 5) * (mods[k] ?? 100)) / 100);
	}
	return out;
}

/**
 * WP19 5.5: current HP after a recalculation (persistent rule, independent of the engine).
 * Deliberate difference (user decision 2026-10-18): the reference "revives" a 0-HP member when max HP
 * grows; we keep fainted members fainted unless `reviveFainted` (compat switch, default off).
 */
function hpAfterRecalc(curHp, oldMax, newMax, { reviveFainted = false } = {}) {
	let hp;
	if (curHp > 0) hp = Math.max(curHp + (newMax - oldMax), 1);
	else hp = reviveFainted && newMax > oldMax ? newMax - oldMax : 0;
	return Math.min(Math.max(hp, 0), newMax);
}

// ---- WP30 4.2 battle experience (Gen 8 defaults: scaled formula on, split off, trainer bonus off) ----
const DEFAULT_RULES = { scaled: true, splitAmongParticipants: false, trainerBonus: false };

/**
 * @param foe {level, baseExp}; receiver {level, foreign?:{id|lang}}; ctx {participants, sharers, role}
 * Only the paths step 2.3 exercises: participant/sharer share, trainer bonus, scaling, +1.
 * Returns the integer exp for one receiver (0 => nothing happens).
 */
function battleExp({ foe, receiver, participants, rules = DEFAULT_RULES, trainer = false, luckyEgg = false }) {
	let a = foe.level * foe.baseExp;
	// shares: participants only (no shared-exp holders in this path)
	let share = rules.splitAmongParticipants ? Math.floor(a / participants) : a;
	if (share <= 0) return 0; // early return before every later modifier
	if (trainer && rules.trainerBonus) share = Math.floor(share * 1.5);
	if (rules.scaled) {
		share = Math.floor(share / 5);
		const factor = Math.pow((2 * foe.level + 10) / (receiver.level + foe.level + 10), 2.5);
		share = Math.floor(share * factor) + 1; // +1 for participants/sharers
	} else {
		share = Math.floor(share / 7);
	}
	if (luckyEgg) share = Math.floor((share * 3) / 2);
	return share;
}

/** WP30 4.4 EV gain: per stat clamp to per-stat and total caps. Returns a NEW evs object. */
function gainEvs(evs, yieldTable, { perStat = 252, total = 510, multiplier = 1 } = {}) {
	const out = { ...evs };
	for (const k of STAT_KEYS) {
		const add = (yieldTable[k] || 0) * multiplier;
		if (!add) continue;
		const sum = STAT_KEYS.reduce((s, x) => s + (out[x] || 0), 0);
		const room = Math.max(0, Math.min(perStat - (out[k] || 0), total - sum));
		out[k] = (out[k] || 0) + Math.max(0, Math.min(add, room));
	}
	return out;
}

/**
 * Apply an exp gain to a persistent member record (pure: returns a new record plus the change log).
 * `content` supplies base stats, growth curve and learnset for the species.
 */
function applyExp(member, amount, content) {
	const sp = content.species[member.species];
	const curve = sp.growth;
	const maxE = maxExp(curve);
	const before = { level: member.level, exp: member.exp, hp: member.hp, stats: computeStats(sp.base, member.ivs, member.evs, member.level, member.nature) };
	const exp = Math.min(Math.max(member.exp + amount, 0), maxE);
	const delta = exp - member.exp;
	const rec = { ...member, exp };
	const log = { gained: delta, levels: [], learned: [], pendingMoves: [] };
	if (delta <= 0) return { member: rec, log, before, after: before };
	const newLevel = levelForExp(curve, exp);
	if (newLevel < member.level) throw new Error('new level below current level (data contradiction)');
	let cur = rec;
	let oldStats = before.stats;
	for (let L = member.level + 1; L <= newLevel; L++) {
		const stats = computeStats(sp.base, cur.ivs, cur.evs, L, cur.nature);
		cur = { ...cur, level: L, hp: hpAfterRecalc(cur.hp, oldStats.hp, stats.hp) };
		log.levels.push({ level: L, maxhp: stats.hp, hp: cur.hp, stats });
		for (const mv of (sp.learnset[L] || [])) log.pendingMoves.push({ level: L, move: mv });
		oldStats = stats;
	}
	// non-level-up case: stats recalculated against the same level (EV gain), HP follows rule too
	const after = { level: cur.level, exp: cur.exp, hp: cur.hp, stats: computeStats(sp.base, cur.ivs, cur.evs, cur.level, cur.nature) };
	if (newLevel === member.level && after.stats.hp !== before.stats.hp) cur = { ...cur, hp: hpAfterRecalc(cur.hp, before.stats.hp, after.stats.hp) };
	return { member: cur, log, before, after: { ...after, hp: cur.hp } };
}

module.exports = {
	MAX_LEVEL, CURVES, minExp, maxExp, levelForExp, NATURES, STAT_KEYS, computeStats, hpAfterRecalc,
	DEFAULT_RULES, battleExp, gainEvs, applyExp,
};
