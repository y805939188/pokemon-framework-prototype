'use strict';
// Every probe enters the actual runtime in a fresh Node. Matrix rows stay within
// their named TAP case; these are input controls, not executed game abilities.
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), cp = require('node:child_process');
const root = path.resolve(__dirname, '../..'), H = require('../headless-regression-binding.cjs');
assert.equal(process.version, 'v22.21.1'); assert.deepEqual(process.argv.slice(2), []);
const captured = H.capture(root, process.env.PF_HEADLESS_REGRESSION_BINDING);
H.boundFiles(captured, ['scripts/tests/e1-character-runtime-inputs.test.cjs', 'scripts/tests/e1-character-runtime-input-probe.cjs', 'scripts/tests/final-production-runtime.cjs', 'scripts/tests/e1-character-inputs.cjs']);
const {KEYS, STALE} = require('./e1-character-inputs.cjs');
function probe(scenario, key) {
 const result = cp.spawnSync(process.execPath, [path.join(__dirname, 'e1-character-runtime-input-probe.cjs'), scenario, ...(key ? [key] : [])], {cwd: root, env: {...process.env}, encoding: 'utf8', timeout: 120000});
 assert.ifError(result.error); assert.equal(result.signal, null); assert.equal(result.status, 0, result.stderr + result.stdout);
 const observed = JSON.parse(result.stdout.trim()); assert.equal(observed.scenario, scenario); assert.equal(observed.businessLoaded, false);
 assert.equal(observed.counters.compilerCalls, 0); assert.equal(observed.counters.productImports, 0);
 console.log('runtime-input-observed ' + JSON.stringify(observed));
}
test('RA01 absent group lets formal producer prepare both actual profiles explicitly', () => probe('empty'));
test('RA02 complete current own group prepares both actual profiles explicitly', () => probe('complete'));
test('RA03 every singleton including the original host-only partial rejects before writes or profiles', () => { for (const key of KEYS) probe('single', key); });
test('RA04 every one-key omission rejects before writes or profiles', () => { for (const key of KEYS) probe('missing', key); });
test('RA05 every foreign path rejects before writes or profiles', () => { for (const key of KEYS) probe('foreign', key); });
test('RA06 mixed parent layout and byte-equal foreign source reject before writes or profiles', () => { probe('mixed'); probe('equal-foreign'); });
test('RA07 current binding source mismatch rejects before writes or profiles', () => probe('binding-source'));
test('RA08 every legacy builder override rejects before writes or profiles', () => { for (const key of STALE) probe('stale', key); });
test('RA09 prepared-promise reentry still rejects partial and foreign inputs', () => { probe('warm-partial'); probe('warm-foreign'); });
test('RA10 prepared-promise reentry still rejects changed binding and family', () => { probe('warm-binding'); probe('warm-family'); });
test.after(() => H.capture(root, process.env.PF_HEADLESS_REGRESSION_BINDING, captured.sha256));
