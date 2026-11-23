'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
assert.deepEqual(process.argv.slice(2), []);
const {runCase} = require('./final-production-runner.cjs');
for (const id of ['P01','C01']) test(id + ' source-bound original T16 capture/file1/fresh Load', () => runCase('t16', id));
