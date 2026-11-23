'use strict';
const test=require('node:test'),assert=require('node:assert/strict');assert.deepEqual(process.argv.slice(2),[]);
const{runCase}=require('./final-production-runner.cjs');
for(const id of ["E2-CUT", "E2-ROCK", "E2-SURF", "E2-FLASH", "E2-SCENT"])test(id+' current ordinary E2 frontend',()=>runCase('e2-current-frontends',id));
