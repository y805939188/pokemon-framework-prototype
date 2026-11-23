'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
assert.deepEqual(process.argv.slice(2), []);
const {runCase} = require('./final-production-runner.cjs');
for (const id of ['GN06', 'GN07', 'GN08', 'GN09'])
  test(id + ' source-bound original RetryBlackoutReturn357', () => runCase('g-retry', id));
