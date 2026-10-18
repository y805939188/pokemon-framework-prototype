'use strict';
/**
 * FIXTURE content for step 2.3 only. Base stats come from Showdown's gen8 data (cross-checked in
 * tests); growth rate / base exp / EV yield / catch rate are stand-in values entered by hand,
 * and learnsets are SYNTHETIC (chosen to exercise level-up learning), not authoritative data.
 * Real content data is a framework content-pipeline question (Showdown has no exp/catch data).
 */
module.exports = {
	species: {
		Charizard: { base: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 }, growth: 'parabolic', baseExp: 267, evYield: { spa: 3 }, catchRate: 45,
			learnset: { 51: ['Slash'], 52: ['Outrage'], 53: ['Heat Wave'] } },
		Blastoise: { base: { hp: 79, atk: 83, def: 100, spa: 85, spd: 105, spe: 78 }, growth: 'parabolic', baseExp: 265, evYield: { spd: 3 }, catchRate: 45,
			learnset: { 51: ['Waterfall'] } },
		Venusaur: { base: { hp: 80, atk: 82, def: 83, spa: 100, spd: 100, spe: 80 }, growth: 'parabolic', baseExp: 263, evYield: { spa: 2, spd: 1 }, catchRate: 45,
			learnset: { 51: ['Power Whip'] } },
		Snorlax: { base: { hp: 160, atk: 110, def: 65, spa: 65, spd: 110, spe: 30 }, growth: 'slow', baseExp: 189, evYield: { hp: 2 }, catchRate: 25, learnset: {} },
		Gengar: { base: { hp: 60, atk: 65, def: 60, spa: 130, spd: 75, spe: 110 }, growth: 'parabolic', baseExp: 250, evYield: { spa: 3 }, catchRate: 45, learnset: {} },
		Pidgey: { base: { hp: 40, atk: 45, def: 40, spa: 35, spd: 35, spe: 56 }, growth: 'parabolic', baseExp: 50, evYield: { spe: 1 }, catchRate: 255, learnset: {} },
		Caterpie: { base: { hp: 45, atk: 30, def: 35, spa: 20, spd: 20, spe: 45 }, growth: 'medium', baseExp: 39, evYield: { hp: 1 }, catchRate: 255, learnset: {} },
	},
};
