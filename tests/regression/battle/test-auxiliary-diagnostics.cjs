'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{resolve}=require('node:path');
require('../../../scripts/tests/ts-source-loader.cjs');
const loaded=import(pathToFileURL(resolve(__dirname,'../../../src/framework/rules/battle-effects-writeback.ts')));
const row=(group,status,reason)=>({group,status,memberId:'P1',...(reason===undefined?{}:{reason})});
const cases=[
 ['friendship','skipped','legal-primary-friendship-wins','primary-wins'],
 ['readiness','skipped','awaiting-complete-ordered-evolution-scan','later-scan'],
 ['readiness','applied','awaiting-complete-ordered-evolution-scan','later-scan'],
 ['readiness','skipped','reliable-hp-zero','no-op'],
 ['readiness','applied','known-faint','complete'],
 ['appearance','skipped',undefined,'no-op'],
 ['capture-owned','applied',undefined,'complete'],
 ['capture-count','skipped','not-internal-battle','no-op'],
 ['readiness','skipped','faint-coverage-or-prior-readiness-unknown','degraded'],
 ['readiness','skipped','evolution-scan-unavailable-or-invalid','degraded'],
 ['appearance','applied','display-form-unavailable','degraded'],
 ['capture-appearance','applied','capture-form-unavailable','degraded'],
 ['capture-count','invalid','counter-overflow','degraded'],
 ['appearance','skipped','new-unknown-reason','degraded'],
 ['readiness','invalid','awaiting-complete-ordered-evolution-scan','degraded'],
 ['appearance','skipped','legal-primary-friendship-wins','degraded'],
 ['friendship','applied','legal-primary-friendship-wins','degraded'],
 ['readiness','skipped','not-internal-battle','degraded'],
];
for(const [group,status,reason,category]of cases)test(`auxiliary classify ${group}/${status}/${reason}`,async()=>{
 const {classifyBattleEffectDispositions:f}=await loaded;const d=Object.freeze(row(group,status,reason));const result=f([],Object.freeze([d]));
 assert.equal(result.entries[0].category,category);assert.equal(result.degraded,category==='degraded');assert.equal(result.entries[0].reason,reason);
});
for(const status of ['unavailable','invalid'])test('true '+status+' remains degraded alongside legal no-ops',async()=>{
 const {classifyBattleEffectDispositions:f}=await loaded;
 const d=Object.freeze({source:'observer',group:'faint',memberId:'P1',status,reason:'source-interrupted'});
 const result=f([d],[row('readiness','skipped','awaiting-complete-ordered-evolution-scan'),row('friendship','skipped','legal-primary-friendship-wins')]);
 assert(result.degraded);assert.deepEqual(result.entries.map(d=>d.category),['degraded','later-scan','primary-wins']);assert.equal(result.entries[0].reason,'source-interrupted');
});
test('classifier detaches records and never grants facts or mutation',async()=>{
 const {classifyBattleEffectDispositions:f}=await loaded;const resolved=Object.freeze({source:'observer',group:'damage',memberId:'P1',status:'complete'});
 const result=f([resolved],[]);result.entries[0].group='changed';assert.equal(resolved.group,'damage');assert.equal(result.degraded,false);
});
