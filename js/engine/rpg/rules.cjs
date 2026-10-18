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

function healRequest(spec, pokemon) {
	if (spec.amount === 'full') return pokemon.maxhp - pokemon.hp;
	if (spec.amount === 'quarter') return Math.floor(pokemon.maxhp / 4);
	return spec.amount;
}

module.exports = { HEAL_ITEMS, healRequest };
