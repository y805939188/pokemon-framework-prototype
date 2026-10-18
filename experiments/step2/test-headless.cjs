'use strict';
// Node headless gate for step 2.1. Run: node --test experiments/step2/test-headless.cjs
// Regenerate golden (deliberate): UPDATE_GOLDEN=1 node experiments/step2/update-golden.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { CHECKS } = require('../../js/engine/harness.cjs');

for (const [id, fn] of Object.entries(CHECKS)) {
	test(id, async t => {
		const detail = await fn();
		t.diagnostic(JSON.stringify(detail));
		assert.ok(detail);
	});
}
