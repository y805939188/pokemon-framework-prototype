'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
assert.deepEqual(process.argv.slice(2),[]);
const {runCase}=require('./final-production-runner.cjs');
for(const id of ["POSE01", "POSE02", "POSE03", "POSE04", "POSE05", "POSE06", "POSE07", "POSE08", "POSE09", "POSE10", "POSE11", "POSE12", "RESOURCE", "PLAYER", "PREDICATE", "ROUTE", "FAMILIES", "RECEIPT", "FRAMES", "REPROJECT", "HOT", "READERS"])test(id+' e1-fishing-character current bound production',()=>runCase('e1-fishing-character',id));
