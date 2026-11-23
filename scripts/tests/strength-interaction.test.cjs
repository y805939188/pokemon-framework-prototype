'use strict';
const test=require('node:test'),assert=require('node:assert/strict');assert.deepEqual(process.argv.slice(2),[]);
const{runCase}=require('./final-production-runner.cjs');
for(const id of ["S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08", "S09"])test(id+' current native Strength interaction',()=>runCase('strength',id));
