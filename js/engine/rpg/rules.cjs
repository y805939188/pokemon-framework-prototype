'use strict';
/**
 * RPG-side rules executed inside the engine turn (step 2.2 experiment).
 * Numbers come from the clean-room specs (WP28 heal table "rebalanced" column, WP38 capture
 * math, WP41 escape math). Randomness goes through the battle's own PRNG (`battle.random`)
 * so results are reproducible from the seed and survive snapshot/restore.
 */

/** WP28 §5.1 active HP request table (配置真 column). `full` = missing HP at use time. */
const HEAL_ITEMS = {
	potion: { amount: 20 },
	berryjuice: { amount: 20 },
	sweetheart: { amount: 20 },
	superpotion: { amount: 60 },
	hyperpotion: { amount: 120 },
	maxpotion: { amount: 'full' },
	freshwater: { amount: 30 },
	sodapop: { amount: 50 },
	lemonade: { amount: 70 },
	moomoomilk: { amount: 100 },
	oranberry: { amount: 10 },
	sitrusberry: { amount: 'quarter' },
};

/** Status cures: `cures` lists persistent statuses it removes ('all' = any; confusion handled separately). */
const STATUS_ITEMS = {
	antidote: { cures: ['psn', 'tox'] },
	paralyzeheal: { cures: ['par'] },
	awakening: { cures: ['slp'] },
	burnheal: { cures: ['brn'] },
	iceheal: { cures: ['frz'] },
	fullheal: { cures: 'all', confusion: true },
};

/** Battle stat items (step 2.2 sample; stage amounts follow the modern +2 convention, WP28 5.5 to confirm). */
const STAT_ITEMS = {
	xattack: { boosts: { atk: 2 } },
	xdefense: { boosts: { def: 2 } },
	xspeed: { boosts: { spe: 2 } },
	xspatk: { boosts: { spa: 2 } },
	xspdef: { boosts: { spd: 2 } },
};

function healRequest(spec, pokemon) {
	if (spec.amount === 'full') return pokemon.maxhp - pokemon.hp;
	if (spec.amount === 'quarter') return Math.floor(pokemon.maxhp / 4);
	return spec.amount;
}

// ---------------------------------------------------------------------------------------------
// WP38 capture math. Pure functions (no engine access) so the spec vectors can test them directly.
// ---------------------------------------------------------------------------------------------

const cap255 = r => Math.min(r, 255);

/**
 * Ball -> modified catch rate. `ctx` carries what only the game knows (owned species, area...).
 * Returns { rate, certain }. Only a representative subset of the 26 balls (step 2.2 scope).
 * newGenRates mirrors the spec's "new-style ball rates" switch (default on).
 */
function ballRate(ballId, rate, c) {
	const n = c.newGenRates !== false;
	switch (ballId) {
		case 'masterball': return { rate, certain: true };
		case 'greatball': case 'safariball': case 'sportball': return { rate: rate * 1.5 };
		case 'ultraball': return { rate: rate * 2 };
		case 'netball': return { rate: c.targetTypes && (c.targetTypes.includes('Bug') || c.targetTypes.includes('Water')) ? rate * (n ? 3.5 : 3) : rate };
		case 'diveball': return { rate: c.underwater ? rate * 3.5 : rate };
		case 'nestball': return { rate: c.targetLevel <= 30 ? rate * Math.max((41 - c.targetLevel) / 10, 1) : rate };
		case 'repeatball': return { rate: c.speciesOwned ? rate * (n ? 3.5 : 3) : rate };
		case 'timerball': return { rate: rate * Math.min(1 + 0.3 * c.turn, 4) };
		case 'duskball': return { rate: c.timeOfDay === 2 ? rate * (n ? 3 : 3.5) : rate };
		case 'quickball': return { rate: c.turn === 0 ? rate * 5 : rate };
		case 'fastball': return { rate: c.targetBaseSpeed >= 100 ? cap255(rate * 4) : rate };
		case 'levelball': {
			const m = c.userMaxLevel, t = c.targetLevel;
			const f = m >= t * 4 ? 8 : m >= t * 2 ? 4 : m > t ? 2 : 1;
			return { rate: cap255(rate * f) };
		}
		case 'lureball': return { rate: c.fishing ? cap255(rate * (n ? 5 : 3)) : rate };
		case 'loveball': return { rate: c.sameSpeciesOppositeGender ? cap255(rate * 8) : rate };
		case 'moonball': return { rate: c.moonStoneFamily ? cap255(rate * 4) : rate };
		case 'dreamball': return { rate: c.asleepLike ? rate * 4 : rate };
		case 'beastball': return { rate: c.ultraBeast ? rate * 5 : Math.floor(rate / 10) };
		case 'heavyball': {
			if (rate === 0) return { rate: 0 };
			const w = c.weightHg;
			const d = n ? (w >= 3000 ? 30 : w >= 2000 ? 20 : w < 1000 ? -20 : 0)
				: (w >= 4096 ? 40 : w >= 3072 ? 30 : w >= 2048 ? 20 : -20);
			return { rate: Math.min(Math.max(rate + d, 1), 255) };
		}
		default: return { rate }; // pokeball / premierball / luxuryball / ...: no modifier
	}
}

/** Spec 3, steps 2-6: returns { rate, x, y, certain } for HP A (max), B (current). */
function captureNumbers({ ballId, baseRate, maxHp, hp, status, ctx = {} }) {
	let rate = baseRate;
	// The unconditional ball (Master Ball) always catches (WP38 3.5/4): it is decided by the ball alone and
	// must survive the Ultra Beast pre-gate, which only divides the rate.
	let certain = ballRate(ballId, rate, ctx).certain === true;
	if (ctx.ultraBeast && ballId !== 'beastball') rate = Math.floor(rate / 10); // pre-gate, integer division
	else { rate = ballRate(ballId, rate, ctx).rate; }
	let m = ((3 * maxHp - 2 * hp) * rate) / (3 * maxHp); // keep float; the ONLY rounding is the final floor
	if (status === 'slp' || status === 'frz') m *= 2.5;
	else if (status) m *= 1.5;
	const x = Math.max(Math.floor(m), 1);
	if (certain || x >= 255) return { rate, x, y: null, certain: true };
	const y = Math.floor(65536 / Math.pow(255 / x, 0.1875));
	return { rate, x, y, certain: false };
}

/** Spec 3 step 7: critical-capture coefficient from owned-species count. */
function critCoefficient(owned, charm) {
	const k = owned > 600 ? 5 : owned > 450 ? 4 : owned > 300 ? 3 : owned > 150 ? 2 : owned > 30 ? 1 : 0;
	return charm ? k * 2 : k;
}

/** Roll shakes with an injected random(n) (battle PRNG in-engine). Returns { shakes, critical, rolls }. */
function rollCapture(nums, ctx, random) {
	if (nums.certain) return { shakes: 4, critical: false, rolls: 0 };
	const coef = critCoefficient(ctx.ownedCount || 0, ctx.catchingCharm);
	const c = Math.floor((nums.x * coef) / 12);
	let rolls = 0;
	if (ctx.critical !== false && c > 0) {
		rolls++;
		if (random(256) < c) {
			rolls++;
			return { shakes: random(65536) < nums.y ? 4 : 0, critical: true, rolls };
		}
	}
	let shakes = 0;
	for (let i = 0; i < 4; i++) {
		rolls++;
		if (random(65536) < nums.y) shakes++; else break; // first failure stops
	}
	return { shakes, critical: false, rolls };
}

// ---------------------------------------------------------------------------------------------
// WP41 7.2 escape math.
// ---------------------------------------------------------------------------------------------
function escapeRate(ownSpeed, foeSpeed, attempts) {
	if (ownSpeed > foeSpeed) return 256;
	return Math.floor((ownSpeed * 128) / foeSpeed) + attempts * 30;
}

/**
 * Registration-time eligibility of a battle item for one target (WP28 3.5: "can it be used" is evaluated BEFORE
 * the choice is registered; a refusal stays in the menu and consumes nothing). `mon` is the readState() record.
 * The in-turn handler (custom-formats.cjs resolveItem) re-checks at execution time as a safety net.
 */
function itemEligibility(item, mon) {
	if (!mon) return { ok: false, reason: 'unknown-target' };
	if (mon.fainted || mon.hp <= 0) return { ok: false, reason: 'item-no-effect' };
	if (HEAL_ITEMS[item]) return mon.hp < mon.maxhp ? { ok: true } : { ok: false, reason: 'item-no-effect' };
	const st = STATUS_ITEMS[item];
	if (st) {
		const cures = st.cures === 'all' ? !!mon.status : st.cures.includes(mon.status);
		const confused = !!(st.confusion && mon.active && mon.confused);
		return cures || confused ? { ok: true } : { ok: false, reason: 'item-no-effect' };
	}
	const stat = STAT_ITEMS[item];
	if (stat) {
		const capped = Object.keys(stat.boosts).every(k => (mon.boosts && mon.boosts[k] >= 6));
		return mon.active && !capped ? { ok: true } : { ok: false, reason: 'item-no-effect' };
	}
	return { ok: false, reason: 'unknown-item' };
}

module.exports = { HEAL_ITEMS, STATUS_ITEMS, STAT_ITEMS, itemEligibility, healRequest, ballRate, captureNumbers, critCoefficient, rollCapture, escapeRate };
