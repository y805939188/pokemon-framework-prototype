'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
assert.deepEqual(process.argv.slice(2),[]);
const {runCase}=require('./final-production-runner.cjs');
for(const id of ['P00','E01','E02','E03'])test(id+' current formal empty companion production',()=>runCase('e3-companion-empty-formal',id));
