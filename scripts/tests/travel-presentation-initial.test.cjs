'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
assert.deepEqual(process.argv.slice(2),[]);
const {runCase}=require('./final-production-runner.cjs');
for(const id of ["TRAVEL01", "TRAVEL02", "TRAVEL03", "TRAVEL04", "TRAVEL05", "TRAVEL06", "TRAVEL07", "TRAVEL08", "TRAVEL09", "TRAVEL10", "TRAVEL11", "TRAVEL12", "TRAVEL13", "TRAVEL14", "TRAVEL15", "TRAVEL16", "TRAVEL17", "TRAVEL18", "TRAVEL19", "TRAVEL20", "TRAVEL21", "TRAVEL22", "TRAVEL23", "TRAVEL24", "TRAVEL25", "TRAVEL26", "TRAVEL27", "TRAVEL28", "TRAVEL29", "TRAVEL30", "TRAVEL31", "TRAVEL32", "TRAVEL33", "TRAVEL34", "TRAVEL35", "TRAVEL36", "TRAVEL37", "TRAVEL38", "TRAVEL39", "TRAVEL40", "TRAVEL41", "TRAVEL42", "TRAVEL43", "TRAVEL44", "TRAVEL45", "TRAVEL46", "TRAVEL47", "TRAVEL48"])test(id+' travel-presentation-initial current bound production',()=>runCase('travel-presentation-initial',id));
