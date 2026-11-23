'use strict';
// One fixed current-source worker per input, using the regular production binding.
const test=require('node:test'),assert=require('node:assert/strict');
assert.deepEqual(process.argv.slice(2),[]);
const {runCase,workerInput}=require('./final-production-runner.cjs');
test('F/G unknown selectors refuse before child or product entry',()=>{
 for(const [family,selector] of [['unknown-family','x'],['f-field-entry','unknown-selector'],['g-native-commands','unknown-selector']])assert.throws(()=>runCase(family,selector),/unknown production/);
});
test('F/G stale selector env refuses before creating a family run',()=>{
 for(const [key,family,selector] of [['PF_F_FIELD_CASE','f-field-entry','ENTRY-ORDER'],['PF_G_COMMAND_CASE','g-native-commands','GN01']]){
  assert.equal(process.env[key],undefined);process.env[key]='stale';try{assert.throws(()=>runCase(family,selector),/stale case input refused/);}finally{delete process.env[key];}
 }
});
test('F/G foreign worker scope refuses before entry',()=>{
 for(const [family,selector] of [['f-field-entry','ENTRY-ORDER'],['g-native-commands','GN01']])assert.throws(()=>workerInput({PF_FINAL_PRODUCTION_FAMILY:family,PF_FINAL_PRODUCTION_SELECTOR:selector,PF_FINAL_PRODUCTION_RUN:'/tmp/foreign-field-entry-run'}),/output leaves current private root/);
});
for(const id of ["ENTRY-ORDER", "ENTRY-HOME", "ENTRY-NOHOME", "ENTRY-MISSING", "DIRECT-EMPTY", "DIRECT-DEAD", "DIRECT-CAPABLE", "DIRECT-BUSY", "DUPLICATE", "D-NOT-EXTINCT", "D-POISON-OFF", "WAIT-SAVE", "CANCEL-MESSAGE", "CANCEL-FADE", "FAIL-MESSAGE", "FAIL-AUDIO", "FAIL-SCREEN", "CONTENT-CHANGE", "OWNER-CHANGE", "LOAD-LATE", "NEWGAME-LATE", "SUCCESSOR", "NEWER-FADE", "NEWER-AUDIO", "ZH-NOHOME", "ZH-MISSING", "INVALID-REQUEST", "D-REPEAT", "CONTENT-FADE", "SOURCE-CHANGE", "NEWGAME-FADE", "LOAD-FADE", "FAIL-RETURN-MESSAGE", "HOOK-GETTER", "SNAPSHOT-GETTER", "RESTORE-RETRY", "SCRIPT-EMPTY", "SCRIPT-DEAD", "SCRIPT-CAPABLE", "SCRIPT-BUSY", "SCRIPT-LATE", "SCRIPT-FOREIGN", "SCRIPT-CHILD"])
 test(id+' current real field blackout entry',()=>runCase('f-field-entry',id));
