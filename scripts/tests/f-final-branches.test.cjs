'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
assert.deepEqual(process.argv.slice(2),[]);
const {runCase}=require('./final-production-runner.cjs');
for(const id of ["F-FIELD-HOME-C", "F-FIELD-HOME-G", "F-FIELD-MISSING", "F-BATTLE-HOME", "F-BATTLE-NOHOME", "F-BATTLE-MISSING"])
 test(id+' current real F destination branch',()=>runCase('f-branches',id));

require('./f-final-battle-settlement-oracle.test.cjs');
require('./f-battle-source-retirement-protocol.test.cjs');
