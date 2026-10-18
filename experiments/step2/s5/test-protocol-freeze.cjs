'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { observe, observeAll, FILE, NOT_PROVOKED } = require('./protocol-freeze.cjs');
const { BattleSession, END_REASONS, REFUSAL_REASONS } = require('../../../js/engine/game/session.cjs');

const frozen = () => JSON.parse(fs.readFileSync(FILE, 'utf8'));

test('protocol v1: observed shapes and vocabularies equal the frozen contract', async () => {
	assert.deepEqual(await observe(), frozen());
});

test('protocol v1: session exposes every frozen call and nothing public is unfrozen', () => {
	const f = frozen();
	for (const c of f.sessionCalls) assert.equal(typeof BattleSession.prototype[c], 'function', c);
	const pub = Object.getOwnPropertyNames(BattleSession.prototype).filter(n => n !== 'constructor' && !n.startsWith('_') && typeof BattleSession.prototype[n] === 'function').sort();
	assert.deepEqual(pub, f.sessionCalls);
});

test('protocol v1: every reason observed in the scenarios is declared, and every declared one was provoked', async () => {
	const o = await observeAll();
	for (const r of o.endReasons) assert.ok(END_REASONS.includes(r), `end reason "${r}" is not declared in END_REASONS`);
	for (const r of o.refusals) assert.ok(REFUSAL_REASONS.includes(r), `refusal reason "${r}" is not declared in REFUSAL_REASONS`);
	const unprovoked = [...END_REASONS.filter(r => !o.endReasons.has(r)), ...REFUSAL_REASONS.filter(r => !o.refusals.has(r))].sort();
	assert.deepEqual(unprovoked, Object.keys(NOT_PROVOKED).sort(), 'declared reasons nothing provoked (add a scenario, or justify in NOT_PROVOKED)');
	// a defeat is reported with the winner so the game can tell it from a victory
	assert.deepEqual([o.outcomes.win.outcome.winner, o.outcomes.defeat.outcome.winner, o.outcomes.caught.outcome.winner, o.outcomes.run.outcome.winner], ['Player', 'Trainer', null, null]);
});
