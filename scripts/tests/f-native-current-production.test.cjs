'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
assert.deepEqual(process.argv.slice(2),[]);
const {runCase}=require('./final-production-runner.cjs');
for(const id of ["NORMAL-CENTER", "NORMAL-HOME", "NT-NOHOME", "NT-MISSING", "NT-DTO", "C1-NO", "C1-YES", "N11-OLD", "C1-ABA", "C1-LATE-YES"])test(id+' current F source-bound production',()=>runCase('f-native-current',id));
