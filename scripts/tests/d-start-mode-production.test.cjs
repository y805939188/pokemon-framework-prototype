'use strict';
const test=require('node:test'),assert=require('node:assert/strict');assert.deepEqual(process.argv.slice(2),[]);
const {runCase}=require('./final-production-runner.cjs');
for(const id of ['DM01','DM02','DM03','DM04','DM05'])test(id+' current production START mode',()=>runCase('d-start-mode',id));
