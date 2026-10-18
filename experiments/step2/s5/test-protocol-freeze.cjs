'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { observe, FILE } = require('./protocol-freeze.cjs');
const { BattleSession } = require('../../../js/engine/game/session.cjs');

test('protocol v1: observed shapes equal the frozen contract', async () => {
	const frozen = JSON.parse(fs.readFileSync(FILE, 'utf8'));
	const now = await observe();
	assert.deepEqual(now, frozen);
});

test('protocol v1: session exposes every frozen call', () => {
	const frozen = JSON.parse(fs.readFileSync(FILE, 'utf8'));
	for (const c of frozen.sessionCalls) assert.equal(typeof BattleSession.prototype[c], 'function', c);
});
