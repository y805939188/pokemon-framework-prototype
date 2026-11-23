'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
assert.deepEqual(process.argv.slice(2),[]);
const {runCase}=require('./final-production-runner.cjs');
for(const id of ["TEXT01", "TEXT02", "TEXT03", "TEXT04", "TEXT05", "TEXT06", "TEXT07", "TEXT08", "TEXT09", "TEXT10", "TEXT11", "TEXT12", "TEXT13", "TEXT14", "TEXT15", "TEXT16", "TEXT17", "TEXT18", "TEXT19", "TEXT20", "TEXT21", "TEXT22", "TEXT23", "TEXT24", "TEXT25", "TEXT26", "TEXT27", "TEXT28", "TEXT29", "TEXT30", "TEXT31", "TEXT32", "TEXT33", "TEXT34", "TEXT35", "TEXT36", "TEXT37", "TEXT38", "TEXT39", "TEXT40", "TEXT41", "TEXT42", "TEXT43", "TEXT44", "TEXT45", "TEXT46", "TEXT47", "TEXT48", "TEXT49", "TEXT50"])test(id+' field-presentation-i18n current bound production',()=>runCase('field-presentation-i18n',id));
