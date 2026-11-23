'use strict';
const test=require('node:test');
const {runCase}=require('./final-production-runner.cjs');
for(const id of ['E2-SURF-PRE','E2-SURF-GEN'])test(id+' current Party Surf guard',()=>runCase('e2-party-surf-guards',id));
