'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../../../js/engine/game/describe.cjs').make({ 'A-0001': 'Charizard', 'W-1': 'Pidgey' });
const ev = (type, ...args) => ({ type, args, raw: '' });

test('describe: typical battle lines', () => {
	assert.deepEqual(D.message({ kind: 'events', events: [ev('move', 'p1a: A-0001', 'Flamethrower', 'p2a: W-1'), ev('faint', 'p2a: W-1')] }), ['Charizard used Flamethrower!', "The foe's Pidgey fainted!"]);
	assert.deepEqual(D.message({ kind: 'events', events: [ev('rpg', 'item', 'p1', 'potion', 'A-0001', 'ok', '20', '99', '154')] }), ['Used Potion on Charizard. Recovered 20 HP.']);
	assert.deepEqual(D.message({ kind: 'events', events: [ev('rpg', 'item', 'p1', 'potion', 'A-0001', 'noeffect')] }), ["It won't have any effect. (Potion was not used up)"]);
	assert.deepEqual(D.message({ kind: 'events', events: [ev('rpg', 'run', 'p1', 'denied', 'trainer')] }), ["No! There's no running from a trainer battle!"]);
	assert.deepEqual(D.message({ kind: 'events', events: [ev('rpg', 'run', 'p1', 'ok', '256', '1')] }), ['Got away safely!']);
	assert.deepEqual(D.message({ kind: 'events', events: [ev('rpg', 'ball', 'p1', 'masterball', 'W-1', 'caught', '4', '0', '255', '-')] }), ['You threw a Master Ball!', 'Gotcha! Pidgey was caught!']);
	assert.deepEqual(D.message({ kind: 'events', events: [ev('rpg', 'ball', 'p1', 'pokeball', 'W-1', 'escaped', '1', '0', '8', '34243')] }), ['You threw a Poke Ball!', 'Aww! It appeared to be caught!']);
	assert.deepEqual(D.message({ kind: 'events', events: [ev('-boost', 'p1a: A-0001', 'atk', '2')] }), ["Charizard's Attack rose sharply!"]);
});
test('describe: growth, learning, end, unknown events', () => {
	assert.deepEqual(D.message({ kind: 'growth', member: 'A-0001', exp: 3, levelUps: [51] }), ['Charizard gained 3 Exp. Points!', 'Charizard grew to Lv. 51!']);
	assert.deepEqual(D.message({ kind: 'learned', member: 'A-0001', move: 'slash', replaced: 3 }), ['Charizard forgot an old move and learned slash!']);
	assert.deepEqual(D.message({ kind: 'end', reason: 'caught', winner: null }), ['The wild Pokémon is yours!']);
	assert.deepEqual(D.message({ kind: 'events', events: [ev('upkeep'), ev('turn', '2'), ev('t:', '1')] }), []);
	assert.deepEqual(D.message({ kind: 'request', side: 'p1', request: {} }), []);
});
