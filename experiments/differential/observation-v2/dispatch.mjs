// Pure metadata check. Caller must bind planId to the parent-approved run/audit.
// This module does not admit a package, inspect values or execute any test case.
import {readFileSync} from 'node:fs';
import {assertJsonValue,parseJson} from '../lib/json.mjs';
import {validateRequest,GateError} from '../lib/protocol.mjs';
const plans=parseJson(readFileSync(new URL('./dispatch-plans.json',import.meta.url),'utf8'));
const need=(ok,code)=>{if(!ok)throw new GateError('OBS21_'+code);};
export function approvedDispatchPlan(planId,request){
 validateRequest(request);
 need(request.requestHash===plans.requestHash&&request.cases.length===354,'DISPATCH_REQUEST');
 need(Object.hasOwn(plans.plans,planId),'DISPATCH_PLAN_UNKNOWN');
 const p=plans.plans[planId],ids=new Set(request.cases.map(c=>c.caseId));
 need(new Set(p).size===p.length&&p.every(id=>ids.has(id)),'DISPATCH_PLAN_CONTENT');
 return [...p];
}
export function gateDispatch(records,{request,planId,handledCaseIds}){
 assertJsonValue({records,handledCaseIds});
 const plan=approvedDispatchPlan(planId,request);
 need(Array.isArray(handledCaseIds)&&handledCaseIds.length<=plan.length,'DISPATCH_TRACE_SHAPE');
 need(handledCaseIds.every((id,i)=>id===plan[i]),'DISPATCH_NOT_APPROVED_PREFIX');
 need(Array.isArray(records)&&records.length===354,'DISPATCH_OUTPUT_COUNT');
 const byId=new Map();
 for(let i=0;i<records.length;i++){
  const r=records[i],c=request.cases[i];
  need(r.caseId===c.caseId&&r.requestHash===c.requestHash,'DISPATCH_OUTPUT_ORDER');
  need(['returned','raised','awaiting-input-not-returned','unobserved'].includes(r.observation?.kind),'DISPATCH_RECORD_KIND');
  if(r.observation.kind==='unobserved')need(typeof r.observation.attempted==='boolean','DISPATCH_ATTEMPT_FLAG');
  byId.set(r.caseId,r);
 }
 const selected=new Set(handledCaseIds);
 for(const r of records){
  if(!selected.has(r.caseId))need(r.observation.kind==='unobserved'&&r.observation.reason==='NOT_RUN'&&!r.observation.attempted,'DISPATCH_OUTSIDE_TRACE');
 }
 let attempted=0,stopCaseId=null;
 // Output remains in the original354 order. Only THIS approved dispatch prefix
 // decides what occurred before a blocker; never rewrite an earlier observation.
 for(let i=0;i<handledCaseIds.length;i++){
  const id=handledCaseIds[i],o=byId.get(id).observation;
  need(!(o.kind==='unobserved'&&o.reason==='NOT_RUN'),'DISPATCH_HANDLED_RELABELED_NOT_RUN');
  if(o.kind!=='unobserved'||o.attempted)attempted++;
  if(o.kind==='unobserved'){
   need(i===handledCaseIds.length-1,'DISPATCH_CONTINUED_AFTER_BLOCK');stopCaseId=id;
  }
 }
 return {planId,outputCaseCount:354,handledCaseCount:handledCaseIds.length,attemptedCaseCount:attempted,stopCaseId};
}
