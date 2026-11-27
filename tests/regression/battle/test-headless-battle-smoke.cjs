'use strict';
// Headless battle smoke test. Run: node --test tests/regression/battle/test-headless-battle-smoke.cjs
// Regenerate golden (deliberate): UPDATE_GOLDEN=1 node tests/tools/battle/update-golden.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { CHECKS } = require('../../../js/engine/harness.cjs');

for (const [id, fn] of Object.entries(CHECKS)) {
	test(id, async t => {
		const detail = await fn();
		t.diagnostic(JSON.stringify(detail));
		assert.ok(detail);
	});
}
