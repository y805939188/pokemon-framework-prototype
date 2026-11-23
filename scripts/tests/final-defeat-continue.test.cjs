'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
assert.deepEqual(process.argv.slice(2), []);
const {runCase} = require('./final-production-runner.cjs');
for (const id of ['P01','C01']) test(id + ' source-bound original defeat/file0/fresh Load', () => runCase('defeat', id));
test('C02 source-bound defeat/file0/schema 11 migration', () => runCase('defeat', 'C02'));
