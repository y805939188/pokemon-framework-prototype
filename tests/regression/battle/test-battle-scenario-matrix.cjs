'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runMatrix } = require('../../../js/engine/matrix.cjs');
const BASELINE = require('../../../js/engine/fixtures/matrix-fingerprints.json');

test('matrix S1..S10 passes, is reproducible and equals the committed fingerprint baseline', async () => {
	const a = await runMatrix();
	for (const r of a) assert.equal(r.status, 'pass', `${r.id}: ${r.error}`);
	assert.deepEqual(a.map(r => r.id), ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10']);
	const b = await runMatrix();
	assert.deepEqual(b.map(r => r.fingerprint), a.map(r => r.fingerprint), 'same inputs => same fingerprints');
	// a behaviour change shows up here; if intended, run experiments/step2/s5/update-matrix-baseline.cjs and review the diff
	assert.deepEqual(Object.fromEntries(a.map(r => [r.id, r.fingerprint])), BASELINE.fingerprints, 'fingerprints differ from js/engine/fixtures/matrix-fingerprints.json');
});
