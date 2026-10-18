'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runMatrix } = require('../../../js/engine/matrix.cjs');

test('matrix S1..S10 passes and its fingerprints are reproducible', async () => {
	const a = await runMatrix();
	for (const r of a) assert.equal(r.status, 'pass', `${r.id}: ${r.error}`);
	assert.deepEqual(a.map(r => r.id), ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10']);
	const b = await runMatrix();
	assert.deepEqual(b.map(r => r.fingerprint), a.map(r => r.fingerprint), 'same inputs => same fingerprints');
});
