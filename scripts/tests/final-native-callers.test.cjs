'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
assert.deepEqual(process.argv.slice(2), []);
const {runCase} = require('./final-production-runner.cjs');
for (const id of ['A1','A2','B1','B2','B3','C1','C2','C3','C4','X1','X2'])
  test(id + ' source-bound original Native production case', () => runCase('native', id));
