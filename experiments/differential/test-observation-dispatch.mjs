// Synthetic lifecycle metadata only; no behavior values, Ruby or private evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePre54Request} from './profiles/pre54-batch2.mjs';
import {approvedDispatchPlan,gateDispatch} from './observation-v2/dispatch.mjs';
const request=generatePre54Request(),planId='additional25-v1';
const empty=()=>request.cases.map(c=>({caseId:c.caseId,requestHash:c.requestHash,observation:{kind:'unobserved',attempted:false,reason:'NOT_RUN'}}));
function observed(id,kind,records){records.find(c=>c.caseId===id).observation=kind==='blocked'?{kind:'unobserved',attempted:true,reason:'OUTPUT_CONTRACT_UNSUPPORTED'}:{kind};}
const opts=ids=>({request,planId,handledCaseIds:ids});
test('same approved finite25 starts0061,0067,0065 while output remains original354',()=>{
 const p=approvedDispatchPlan(planId,request);assert.equal(p.length,25);assert.deepEqual(p.slice(0,3),['pre54-0061','pre54-0067','pre54-0065']);
 const r=empty();observed(p[0],'awaiting-input-not-returned',r);observed(p[1],'awaiting-input-not-returned',r);observed(p[2],'blocked',r);const bytes=JSON.stringify(r);
 assert.deepEqual(gateDispatch(r,opts(p.slice(0,3))),{planId,outputCaseCount:354,handledCaseCount:3,attemptedCaseCount:3,stopCaseId:'pre54-0065'});assert.equal(JSON.stringify(r),bytes);
 assert.equal(r.find(c=>c.caseId==='pre54-0067').observation.kind,'awaiting-input-not-returned');
});
test('cannot relabel a dispatched pre-block observation as NOT_RUN',()=>{
 const p=approvedDispatchPlan(planId,request).slice(0,3),r=empty();observed(p[0],'awaiting-input-not-returned',r);observed(p[2],'blocked',r);assert.throws(()=>gateDispatch(r,opts(p)),/HANDLED_RELABELED_NOT_RUN/);
});
test('real observation beyond a blocking dispatch is rejected',()=>{
 const p=approvedDispatchPlan(planId,request).slice(0,4),r=empty();p.forEach(id=>observed(id,'returned',r));observed(p[2],'blocked',r);assert.throws(()=>gateDispatch(r,opts(p)),/CONTINUED_AFTER_BLOCK/);
});
test('caller cannot sort dispatch by output index to move blocker',()=>{
 const p=approvedDispatchPlan(planId,request).slice(0,3),r=empty();p.forEach(id=>observed(id,'returned',r));assert.throws(()=>gateDispatch(r,opts([...p].sort())),/NOT_APPROVED_PREFIX/);
});
test('unknown/duplicate/skipped dispatch plans or entries reject',()=>{
 assert.throws(()=>approvedDispatchPlan('observer-chosen-plan',request),/PLAN_UNKNOWN/);
 const p=approvedDispatchPlan(planId,request),r=empty();
 for(const ids of [[p[0],p[0]],[p[1]],[p[0],p[2]]])assert.throws(()=>gateDispatch(r,opts(ids)),/NOT_APPROVED_PREFIX/);
});
test('output may not be rearranged to dispatch order',()=>{
 const p=approvedDispatchPlan(planId,request).slice(0,3),r=empty();p.forEach(id=>observed(id,'returned',r));r.reverse();assert.throws(()=>gateDispatch(r,opts(p)),/OUTPUT_ORDER/);
});
test('data from outside declared prefix rejects',()=>{
 const p=approvedDispatchPlan(planId,request),r=empty();observed(p[0],'returned',r);observed(p[2],'returned',r);assert.throws(()=>gateDispatch(r,opts(p.slice(0,1))),/OUTSIDE_TRACE/);
});
test('pre-invocation blocker stays unattempted, not a fake call',()=>{
 const p=approvedDispatchPlan(planId,request).slice(0,1),r=empty();r.find(c=>c.caseId===p[0]).observation={kind:'unobserved',attempted:false,reason:'ACCESS_BLOCKED'};assert.equal(gateDispatch(r,opts(p)).attemptedCaseCount,0);
});
test('empty trace truthfully leaves full354 not run',()=>assert.equal(gateDispatch(empty(),opts([])).outputCaseCount,354));
test('12/25/37 and formal354 use exact existing selection, copies cannot mutate table',()=>{
 assert.equal(approvedDispatchPlan('qualification12-v1',request).length,12);assert.equal(approvedDispatchPlan('qualification37-v1',request).length,37);assert.deepEqual(approvedDispatchPlan('formal354-v1',request),request.cases.map(c=>c.caseId));
 const p=approvedDispatchPlan(planId,request);p.reverse();assert.equal(approvedDispatchPlan(planId,request)[0],'pre54-0061');
});
