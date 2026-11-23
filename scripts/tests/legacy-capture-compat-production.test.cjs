'use strict';
const test=require('node:test'),assert=require('node:assert/strict');assert.deepEqual(process.argv.slice(2),[]);
const {runCase}=require('./final-production-runner.cjs');
for(const id of ["IF-WILD-META", "IF-TRAINER-META", "IF-WILD-SESSION", "IF-TRAINER-SESSION", "IF-WILD-ARGS", "IF-TRAINER-ARGS", "IF-SOURCE", "IF-CONTENT", "IF-GENERATION", "IF-HOUR", "IF-INVALID-META", "IF-BUSY-APIS"])test(id+' real legacy capture compatibility',()=>runCase('legacy-capture-compat',id));
