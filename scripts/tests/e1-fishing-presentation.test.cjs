'use strict';
const test=require('node:test'),assert=require('node:assert/strict');assert.deepEqual(process.argv.slice(2),[]);
const {runCase}=require('./final-production-runner.cjs');
for(const id of ['FP-BAG-ZH','FP-BAG-EN','FP-357-ZH','FP-357-EN'])test(id+' real fishing player messages',()=>runCase('e1-fishing-presentation',id));
