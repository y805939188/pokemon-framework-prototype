'use strict';
const test=require('node:test'),assert=require('node:assert/strict');assert.deepEqual(process.argv.slice(2),[]);
const{runCase}=require('./final-production-runner.cjs');
for(const id of ["HOST3-01", "HOST3-02", "HOST3-03"])test(id+' current ordinary Flow/App/native production',()=>runCase('e3-host3',id));
