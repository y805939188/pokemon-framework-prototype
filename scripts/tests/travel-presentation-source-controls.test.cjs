'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
assert.deepEqual(process.argv.slice(2),[]);
const {runCase}=require('./final-production-runner.cjs');
for(const id of ["SOURCE01", "SOURCE02", "SOURCE03", "SOURCE04", "SOURCE05", "SOURCE06", "SOURCE07", "SOURCE08", "SOURCE09", "SOURCE10", "SOURCE11", "SOURCE12", "SOURCE13", "SOURCE14", "SOURCE15", "SOURCE16", "SOURCE17", "SOURCE18", "SOURCE19", "SOURCE20"])test(id+' travel-presentation-source-controls current bound production',()=>runCase('travel-presentation-source-controls',id));
