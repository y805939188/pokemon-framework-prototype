'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
assert.deepEqual(process.argv.slice(2),[]);
const{runCase}=require('./final-production-runner.cjs');
for(const id of ["APP", "JOINT", "FAILURE", "LEASE", "PRODUCER", "RETIRE", "SCENE", "R6", "ROPE", "VEHICLE", "UI", "EDGES"])test(id+' current E3 source-bound production',()=>runCase('e3-travel-current',id));
