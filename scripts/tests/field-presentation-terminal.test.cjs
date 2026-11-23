'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
assert.deepEqual(process.argv.slice(2),[]);
const {runCase}=require('./final-production-runner.cjs');
for(const id of ["TERM01", "TERM02", "TERM03", "TERM04", "TERM05", "TERM06", "TERM07", "TERM08", "TERM09", "TERM10", "TERM11", "TERM12", "TERM13", "TERM14", "TERM15", "TERM16", "TERM17", "TERM18", "TERM19", "TERM20", "TERM21", "TERM22", "TERM23", "TERM24", "TERM25", "TERM26", "TERM27", "TERM28", "TERM29", "TERM30", "TERM31", "TERM32", "TERM33", "TERM34", "TERM35", "TERM36", "TERM37"])test(id+' field-presentation-terminal current bound production',()=>runCase('field-presentation-terminal',id));
