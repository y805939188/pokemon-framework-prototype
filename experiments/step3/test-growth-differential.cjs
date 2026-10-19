'use strict';
// Step 3 / C: the first real Ruby/TS differential. The cases are ORIGINAL-RUN behaviour data produced by the isolated
// reference observer (experiments/step3/reference/, delivered under its decision record); this test only consumes them.
// Every difference between the TS implementation (written from the spec) and the original is either zero or is listed,
// with a class, in reference/classification.json - never silently tolerated.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const G = require('../../js/engine/build/engine.cjs').growth;

const DIR = path.join(__dirname, 'reference');
const file = path.join(DIR, 'growth-cases.json');
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const classification = fs.existsSync(path.join(DIR, 'classification.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, 'classification.json'), 'utf8')) : { differences: [] };

const val = t => (t === undefined ? undefined : t.kind === 'nil' ? null : t.value);

/** Run one case through the TS side; returns { outcome, value?, errorClass? } in the observer's vocabulary. */
function runTs(c) {
	const level = val(c.input.level), exp = val(c.input.exp), amount = val(c.input.amount);
	try {
		switch (c.fn) {
			case 'minimumExpForLevel': { const r = G.minimumExpForLevel(c.curve, level, c.maxLevel); return r.ok ? { outcome: 'value', value: r.value } : { outcome: 'error-object', errorClass: 'invalid-level' }; }
			case 'maximumExp': return { outcome: 'value', value: G.maxExp(c.curve, c.maxLevel) };
			case 'addExp': return { outcome: 'value', value: G.addExp(c.curve, exp, amount, c.maxLevel) };
			case 'levelFromExp': return { outcome: 'value', value: G.levelForExp(c.curve, exp, c.maxLevel) };
		}
	} catch (e) { return { outcome: 'raised', errorClass: e.constructor.name }; }
	throw new Error('unknown fn ' + c.fn);
}

const same = (a, b) => a.outcome === b.outcome && (a.outcome !== 'value' || a.value === b.value);

test('the delivery package is the one that was validated (hash, schema, provenance)', () => {
	const ready = fs.readFileSync(path.join(DIR, 'READY'), 'utf8').trim();
	assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), ready);
	assert.equal(doc.schemaVersion, 1);
	assert.equal(doc.reference.commit, '8c5911e4a4b07b07e832e4bb0d5d8859e88b4a9b');
	assert.ok(doc.cases.every(c => c.evidenceType === 'original-run'));
	assert.equal(doc.cases.length, 3504);
});

test('TS growth rules == the original, case by case (differences only if classified)', () => {
	const known = new Map(classification.differences.map(d => [d.id, d]));
	const unexplained = [];
	let compared = 0, classified = 0;
	for (const c of doc.cases) {
		const ts = runTs(c);
		compared++;
		const expected = c.result.outcome === 'value' ? { outcome: 'value', value: c.result.value } : { outcome: c.result.outcome, errorClass: c.result.errorClass };
		if (same(ts, expected)) { assert.ok(!known.has(c.id), `${c.id} is classified as a difference but now matches: remove it from classification.json`); continue; }
		if (known.has(c.id)) { classified++; continue; }
		unexplained.push({ id: c.id, original: expected, ts });
	}
	assert.deepEqual(unexplained.slice(0, 10), [], `${unexplained.length} unexplained difference(s) out of ${compared}`);
	for (const id of known.keys()) assert.ok(doc.cases.some(c => c.id === id), `classification refers to unknown case ${id}`);
	console.log(`# growth differential: ${compared} original-run cases, ${compared - classified} identical, ${classified} classified differences`);
});

test('coverage: every curve, every function and every configured maximum level is exercised', () => {
	const seen = new Set(doc.cases.map(c => `${c.fn}|${c.curve}`));
	for (const fn of ['minimumExpForLevel', 'maximumExp', 'addExp', 'levelFromExp']) for (const curve of ['medium', 'fast', 'slow', 'parabolic', 'erratic', 'fluctuating']) assert.ok(seen.has(`${fn}|${curve}`), `${fn} ${curve}`);
	assert.deepEqual([...new Set(doc.cases.map(c => c.maxLevel))].sort((a, b) => a - b), [50, 100, 101, 105, 120, 200]);
	assert.ok(doc.cases.some(c => c.result.outcome === 'error-object') && doc.cases.some(c => c.result.outcome === 'raised'));
});

// The spec's static scenarios (WP30 section 12.2) were derived by hand and never run. Here they meet the original's real output.
test('the spec\'s static scenarios (derived expectations) agree with the original-run data', () => {
	const find = (fn, curve, maxLevel, input) => {
		const hit = doc.cases.filter(c => c.fn === fn && c.curve === curve && c.maxLevel === maxLevel && Object.entries(input).every(([k, v]) => val(c.input[k]) === v) && Object.keys(c.input).length === Object.keys(input).length);
		assert.equal(hit.length, 1, `exactly one original-run case for ${fn} ${curve} ${maxLevel} ${JSON.stringify(input)}, found ${hit.length}`);
		return hit[0].result;
	};
	const v = (...a) => { const r = find(...a); assert.equal(r.outcome, 'value'); return r.value; };
	// curve anchors L50 / L100
	const anchors = { medium: [125000, 1000000], fast: [100000, 800000], slow: [156250, 1250000], parabolic: [117360, 1059860], erratic: [125000, 600000], fluctuating: [142500, 1640000] };
	for (const [curve, [l50, l100]] of Object.entries(anchors)) { assert.equal(v('minimumExpForLevel', curve, 100, { level: 50 }), l50, curve + ' L50'); assert.equal(v('minimumExpForLevel', curve, 100, { level: 100 }), l100, curve + ' L100'); }
	// reverse conversion (Medium)
	assert.equal(v('levelFromExp', 'medium', 100, { exp: 0 }), 1); assert.equal(v('levelFromExp', 'medium', 100, { exp: 999999 }), 99); assert.equal(v('levelFromExp', 'medium', 100, { exp: 1000000 }), 100);
	// invalid inputs are separated: level -> error object, exp -> raised (not an error object)
	assert.equal(find('minimumExpForLevel', 'medium', 100, { level: 0 }).outcome, 'error-object');
	assert.equal(find('levelFromExp', 'medium', 100, { exp: -1 }).outcome, 'raised');
	// clamped addition
	assert.equal(v('addExp', 'medium', 100, { exp: 999990, amount: 100 }), 1000000);
	// beyond the table: default max level clamps L101 to L100; with max 101 the registered formulas apply (non-monotonic Fluctuating)
	assert.equal(v('minimumExpForLevel', 'medium', 100, { level: 101 }), 1000000);
	assert.equal(v('minimumExpForLevel', 'erratic', 101, { level: 101 }), 618474);
	assert.equal(v('minimumExpForLevel', 'fluctuating', 101, { level: 101 }), 20505);
});
