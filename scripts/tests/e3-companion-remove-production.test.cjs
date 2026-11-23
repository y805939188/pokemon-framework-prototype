'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
assert.deepEqual(process.argv.slice(2),[]);
const{runCase}=require('./final-production-runner.cjs');
for(const id of ["control", "all-sourceclose", "all-projectthrow", "all-cancel", "partial-sourceclose", "partial-projectthrow", "partial-cancel", "persistent-partial"])test(id+' current E3 source-bound production',()=>runCase('e3-companion-remove',id));
