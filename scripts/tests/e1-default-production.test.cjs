'use strict';
// One regular suite, fresh process/profile per finite scenario; the actual Flow
// installer and its default entropy branch remain production-owned.
const test = require('node:test'), assert = require('node:assert/strict');
assert.deepEqual(process.argv.slice(2), []);
const {runCase} = require('./final-production-runner.cjs');
for (const id of ['unit', 'bag', 'visual', 'shortcut-cancel', 'entropy-failure', 'injected-missing', 'travel-priority'])
  test('E1 source-bound default production ' + id, () => runCase('e1', id));
