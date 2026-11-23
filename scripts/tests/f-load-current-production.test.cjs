'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
assert.deepEqual(process.argv.slice(2),[]);
const {runCase}=require('./final-production-runner.cjs');
for(const id of ["P00", "L01", "L02", "L03"])test(id+' current F source-bound production',()=>runCase('f-load-current',id));
test('L04 source-bound F pending recovery from schema 11 file8', () => runCase('f-load-current', 'L04'));
