'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
assert.deepEqual(process.argv.slice(2),[]);
const{runCase}=require('./final-production-runner.cjs');
for(const id of ["INGRESS", "INGRESS-ADJACENT", "CONNECTION", "CONNECTION-C1", "CURRENT"])test(id+' current E3 source-bound production',()=>runCase('e3-companion-current',id));
