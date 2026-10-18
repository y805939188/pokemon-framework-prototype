'use strict';
const G = require('../game/growth.cjs');
const S = require('../game/state.cjs');
const content = require('../game/content.cjs');

const PP = { flamethrower: 15, airslash: 15, dragonpulse: 10, roost: 10, hydropump: 5, icebeam: 10, flashcannon: 10, protect: 10, gigadrain: 10, sludgebomb: 10, earthquake: 10, synthesis: 5, tackle: 35, gust: 35, quickattack: 30, bodyslam: 15, shadowball: 15, crunch: 15, rest: 10 };

function member(id, species, level, { moves, nature = 'timid', evs = {}, expOffset = 0, hp, gender = 'M', ability, item = '' }) {
	const sp = content.species[species];
	const stats = G.computeStats(sp.base, { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...evs }, level, nature);
	return {
		id, species, level, exp: G.minExp(sp.growth, level) + expOffset, hp: hp ?? stats.hp, status: '', item, ability: ability || 'Blaze', nature, gender,
		evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...evs },
		moves: moves.map(m => ({ id: m, pp: PP[m], maxpp: PP[m] })),
	};
}

function makeGame(over = {}) {
	return S.newGame({
		party: [
			member('A-0001', 'Charizard', 50, { moves: ['flamethrower', 'airslash', 'dragonpulse', 'roost'], ability: 'Blaze', ...(over.charizard || {}) }),
			member('A-0002', 'Blastoise', 50, { moves: ['hydropump', 'icebeam', 'flashcannon', 'protect'], nature: 'modest', ability: 'Torrent' }),
			member('A-0003', 'Venusaur', 50, { moves: ['gigadrain', 'sludgebomb', 'earthquake', 'synthesis'], nature: 'modest', ability: 'Overgrow' }),
		],
		bag: { potion: 3, antidote: 1, xattack: 1, pokeball: 5, masterball: 1, ...(over.bag || {}) },
		money: 1000,
	});
}

function foeMember(id, species, level, { moves = ['tackle', 'gust'], nature = 'hardy', ability = 'Keen Eye', ivs, evs } = {}) {
	const sp = content.species[species];
	const stats = G.computeStats(sp.base, ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, evs || {}, level, nature);
	return { id, species, level, exp: G.minExp(sp.growth, level), hp: stats.hp, status: '', item: '', ability, nature, gender: 'M',
		moves: moves.map(m => ({ id: m, pp: PP[m], maxpp: PP[m] })) };
}

module.exports = { content, makeGame, member, foeMember, PP };
