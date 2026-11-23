'use strict';
const assert = require('node:assert/strict'), path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
assert.equal(process.version, 'v22.21.1');
assert.deepEqual(process.argv.slice(2), []);
const H = require('../headless-regression-binding.cjs');
const captured = H.capture(ROOT, process.env.PF_HEADLESS_REGRESSION_BINDING);
H.boundFiles(captured, ['scripts/tests/e3-data-observer-support.test.cjs',
  'experiments/step5/5/companion-cold-native-joint/data-observer.cjs',
  'experiments/step5/5/companion-cold-native-joint/test-data-observer.cjs']);
require('./c-regular-runtime.cjs').verify(ROOT, captured.binding);
require('node:test').after(() => H.capture(ROOT, process.env.PF_HEADLESS_REGRESSION_BINDING, captured.sha256));
require('../../experiments/step5/5/companion-cold-native-joint/test-data-observer.cjs');
