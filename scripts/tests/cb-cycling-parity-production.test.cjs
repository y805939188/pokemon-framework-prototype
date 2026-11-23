'use strict';
const test=require('node:test'),assert=require('node:assert/strict');assert.deepEqual(process.argv.slice(2),[]);
const {runCase}=require('./final-production-runner.cjs');
for(const id of ['CB01','CB02','CB03','CB04'])test(id+' production cycling facts parity',()=>runCase('cb-cycling-parity',id));
