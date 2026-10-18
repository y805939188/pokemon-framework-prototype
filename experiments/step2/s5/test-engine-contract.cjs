'use strict';
// Guards the two things that silently break the bridge: (1) the staged engine copies drifting from the sources,
// (2) Showdown internals the gateway/formats rely on disappearing or changing shape after a version bump.
// Run it first when the pinned Showdown SHA (scripts/showdown.env) changes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { BattleGateway } = require('../../../js/engine/gateway.cjs');
const W = require('../../../js/engine/fixtures/wild-1v1.json');

const ROOT = path.resolve(__dirname, '../../..');

test('staged engine extension files equal their sources (otherwise: run scripts/build-showdown.sh)', () => {
	const pairs = [
		['js/engine/rpg/custom-formats.cjs', 'js/engine/showdown/dist/config/custom-formats.js'],
		['js/engine/rpg/rules.cjs', 'js/engine/showdown/dist/config/rpg-rules.cjs'],
	];
	for (const [src, staged] of pairs) {
		assert.ok(fs.existsSync(path.join(ROOT, staged)), `${staged} missing: run scripts/build-showdown.sh`);
		assert.equal(fs.readFileSync(path.join(ROOT, staged), 'utf8'), fs.readFileSync(path.join(ROOT, src), 'utf8'), `${staged} differs from ${src}: run scripts/build-showdown.sh`);
	}
	assert.equal(fs.readFileSync(path.join(ROOT, 'js/engine/showdown/SOURCE_SHA'), 'utf8').trim(), /SHOWDOWN_SHA="([0-9a-f]+)"/.exec(fs.readFileSync(path.join(ROOT, 'scripts/showdown.env'), 'utf8'))[1], 'staged Showdown is not the pinned SHA');
});

test('Showdown internals used by gateway.cjs and custom-formats.cjs exist with the expected shape', async () => {
	const foe = (name, species) => ({ name, species, item: '', ability: 'Keen Eye', moves: ['Protect', 'Tackle'], nature: 'Hardy', evs: {}, level: 5, gender: 'M' });
	const gw = await BattleGateway.create({ formatid: 'gen8rpgdoublescustomgame', seed: [1, 2, 3, 4], wild: true, players: [{ name: 'A', team: W.playerTeam }, { name: 'W', team: [foe('W-1', 'Pidgey'), foe('W-2', 'Pidgey')] }] });
	await gw.choose('p1', 'team 123'); await gw.choose('p2', 'team 12');
	const b = gw._debugBattle();
	const problems = [];
	const fn = (o, names, what) => { for (const n of names) if (typeof o[n] !== 'function') problems.push(`${what}.${n}() missing`); };
	const has = (o, names, what) => { for (const n of names) if (!(n in o)) problems.push(`${what}.${n} missing`); };
	fn(b, ['choose', 'commitChoices', 'allChoicesDone', 'makeRequest', 'sendUpdates', 'restart', 'tie', 'undoChoice', 'getSide', 'spreadModify', 'boost', 'toJSON', 'random', 'add', 'runEvent'], 'Battle');
	assert.equal(typeof b.constructor.fromJSON, 'function', 'Battle.fromJSON');
	has(b, ['requestState', 'sentRequests', 'turn', 'log', 'ended', 'queue', 'format', 'dex', 'prngSeed', 'sides'], 'Battle');
	const side = b.sides[0];
	fn(side, ['chooseMove', 'chooseSwitch', 'getChoiceIndex', 'clearChoice', 'isChoiceDone', 'emitRequest'], 'Side');
	has(side, ['activeRequest', 'choice', 'foe', 'active', 'pokemon', 'id'], 'Side');
	if (!Array.isArray(side.choice.actions)) problems.push('Side.choice.actions not an array');
	const mon = side.active[0];
	fn(mon, ['updateMaxHp', 'getUpdatedDetails', 'cureStatus', 'heal', 'getWeight', 'getTypes', 'hasType', 'hasAbility', 'hasItem', 'isSemiInvulnerable', 'setStatus', 'removeVolatile'], 'Pokemon');
	has(mon, ['baseStoredStats', 'storedStats', 'moveSlots', 'baseMoveSlots', 'set', 'boosts', 'volatiles', 'position', 'isActive', 'trapped', 'statusState', 'level', 'details', 'maxhp', 'hp', 'fainted', 'name', 'species', 'speed'], 'Pokemon');
	has(mon.species, ['baseStats', 'tags'], 'Species');
	assert.deepEqual(problems, [], 'Showdown internals changed: update gateway.cjs/custom-formats.cjs and docs/step2/2.3 report section on internal interfaces');
	// the RPG event action: order 200 (after switches 103, megas 104/105), priority 99 (before every move)
	const [ev] = b.queue.resolveAction({ choice: 'event', event: 'RpgAction', pokemon: mon, priority: 99 });
	assert.equal(ev.order, 200); assert.equal(ev.priority, 99);
	assert.equal(typeof b.format.onRpgAction, 'function', 'custom format handler registered');
	assert.ok(b.rpg && b.rpg.pending, 'battle.rpg created by the format onBegin');
	assert.ok(gw._queue.some(m => m.kind === 'request'), 'requests are emitted after team preview');
});
