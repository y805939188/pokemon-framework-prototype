// Closed pre54 observation upgrade. No business algorithm or reference implementation.
import {readFileSync} from 'node:fs';
import {assertJsonValue, canonicalStringify, parseJson, sha256Json} from '../lib/json.mjs';
import {validateSchema} from '../lib/schema.mjs';
import {GateError, gateReferenceMetadata} from '../lib/protocol.mjs';
import {approvedDispatchPlan,gateDispatch,frozenPlanIds} from './dispatch.mjs';
import {gatePre54Outcome, sanitizePre54Outcome} from '../profiles/pre54-batch2.mjs';
export const RAW='ruby-ts-differential/runner-pre54-observation-v2.1';
export const PUBLIC='ruby-ts-differential/behavior-pre54-observation-v2.1';
export const schema=parseJson(readFileSync(new URL('./schema.json',import.meta.url),'utf8'));
export const requireV2=(condition,code)=>{if(!condition)throw new GateError('OBS2_'+code);};
export function shape(name,value){
 assertJsonValue(value);
 requireV2(validateSchema({$ref:'#/$defs/'+name},value,schema).valid,name.toUpperCase()+'_SHAPE');
 return value;
}
function nonzeroHashes(value){
 if(value===null||typeof value!=='object')return;
 for(const [key,v]of Object.entries(value)){
  if(/SHA256$/.test(key))requireV2(v!=='0'.repeat(64),'ZERO_EVIDENCE_HASH');
  else if(typeof v==='object')nonzeroHashes(v);
 }
}
export const isIntegerReturn=o=>o.kind==='returned'&&o.representation==='native-integer-and-state-v1';
function stateGate(o){
 requireV2(sha256Json(o.state)===o.proof.stateSHA256,'STATE_HASH');
 for(const m of o.state.member?.moves??[])requireV2(m.pp<=m.maxpp,'STATE_PP_RANGE');
}
function recordGate(observation,c,{raw=false}={}){
 shape(raw?'rawObservation':'observation',observation);
 nonzeroHashes(observation);
 if(observation.kind==='unobserved'){
  if(observation.reason==='NOT_RUN')requireV2(!observation.attempted,'NOT_RUN_WAS_ATTEMPTED');
  if(observation.reason==='TIMEOUT')requireV2(observation.attempted,'TIMEOUT_WITHOUT_ATTEMPT');
  return;
 }
 if(isIntegerReturn(observation)){
  requireV2(c.operation==='learning.forgetting','RETURN_STATE_OPERATION_UNSUPPORTED');
  requireV2(sha256Json(observation.nativeReturn)===observation.proof.nativeReturnSHA256,'NATIVE_RETURN_HASH');
  stateGate(observation);return;
 }
 if(observation.kind==='awaiting-input-not-returned'){
  requireV2(c.operation==='learning.forgetting','WAIT_OPERATION_UNSUPPORTED');
  const budget=c.input.slot==='pending'?0:1;
  requireV2(observation.boundary.deliveredInputCount===budget,'WAIT_INPUT_BUDGET');
  requireV2(observation.boundary.ordinal===budget+1,'WAIT_BOUNDARY_ORDER');
  requireV2(sha256Json(observation.state)===observation.proof.stateSHA256,'WAIT_STATE_HASH');
  for(const m of observation.state.member?.moves??[])requireV2(m.pp<=m.maxpp,'WAIT_PP_RANGE');
  return;
 }
 if(raw){sanitizePre54Outcome(observation.outcome,c);return;}
 gatePre54Outcome(observation.outcome,c);
}
export function validateRaw(response,{kit,freezeHash,dispatchPlanId}){
 shape('raw',response);
 requireV2(response.requestHash===kit.request.requestHash,'RAW_REQUEST_MISMATCH');
 requireV2(response.observationFreezeHash===freezeHash,'RAW_VERSION_MISMATCH');
 recordList(response.cases,kit,response.dispatch,dispatchPlanId,true);randomGate(response);
 return response;
}
function randomGate(p){
 const unavailable=p.cases.some(c=>c.observation.kind==='unobserved'&&['UNSUPPORTED_RANDOM','TECHNICAL_FAILURE','TIMEOUT','ACCESS_BLOCKED'].includes(c.observation.reason));
 requireV2(unavailable?p.random===null:p.random!==null,'RANDOM_KNOWLEDGE_STATE');
}
function recordList(cases,kit,dispatch,dispatchPlanId,raw=false){
 requireV2(dispatch!==null&&dispatch.planId===dispatchPlanId,'DISPATCH_PLAN_MISMATCH');
 requireV2(cases.length===kit.request.cases.length,'CASE_COUNT');
 for(let i=0;i<cases.length;i++){
  const r=cases[i],c=kit.request.cases[i];
  requireV2(r.caseId===c.caseId&&r.requestHash===c.requestHash,'CASE_ORDER_OR_HASH');
  recordGate(r.observation,c,{raw});
 }
 gateDispatch(cases,{request:kit.request,planId:dispatchPlanId,handledCaseIds:dispatch.handledCaseIds});
}
function provenance(p,kit){
 if(p.role==='reference'){gateReferenceMetadata(p,kit.request,kit.manifest);return;}
 const s=p.source,roles=s.files.map(f=>f.role),deps=p.runtime.dependencies.map(d=>d.name);
 requireV2(p.runtime.name==='node'&&s.tag===null&&s.commit===kit.manifest.source.commit&&s.tree===kit.manifest.source.tree&&s.dirty===kit.manifest.source.dirty,'CANDIDATE_SOURCE');
 requireV2(new Set(roles).size===2&&roles.length===2,'CANDIDATE_ROLE_SET');
 requireV2(new Set(deps).size===deps.length,'DEPENDENCY_DUPLICATE');
 for(const [role,path]of [['core-bundle','core/core.cjs'],['runner','runners/ts-runner.mjs']])requireV2(s.files.find(f=>f.role===role)?.sha256===kit.hashes.get(path),'CANDIDATE_ARTIFACT');
}
// Structural gate alone is NOT source or execution acceptance. Formal receive also requires
// a parent-pinned independent A receipt binding BOTH final public package byte hashes.
export function gatePackage(p,{kit,freezeHash,role,dispatchPlanId}){
 shape('behavior',p);nonzeroHashes(p);
 requireV2(p.role===role,'ROLE');
 requireV2(p.entryId===(role==='reference'?'reference-rules-v1':'ts-core-v1'),'ENTRY');
 requireV2(p.requestHash===kit.request.requestHash&&p.freezeHash===kit.freeze.hash,'LEGACY_BINDING');
 requireV2(p.observationFreezeHash===freezeHash,'OBSERVATION_VERSION');
 requireV2(Number.isFinite(Date.parse(p.observedAtUTC)),'OBSERVED_TIME');
 const e=p.execution;
 requireV2(Number.isFinite(Date.parse(e.startedAtUTC))&&Number.isFinite(Date.parse(e.endedAtUTC))&&Date.parse(e.startedAtUTC)<=Date.parse(e.endedAtUTC),'EXECUTION_TIME');
 provenance(p,kit);
 if(e.status==='success'){
  // Success here is the observer process/transport status, never a business-return count.
  requireV2(e.exitCode===0&&e.signal===null&&!e.timedOut&&!e.outputLimitExceeded&&e.stderrBytes===0,'PROCESS_SUCCESS_PREDICATE');
  recordList(p.cases,kit,p.dispatch,dispatchPlanId);randomGate(p);
 }else{
  requireV2(p.cases.length===0,'FAILED_PROCESS_HAS_CASES');
  requireV2(p.dispatch===null,'FAILED_DISPATCH_UNAVAILABLE');
  requireV2(p.random===null,'FAILED_RANDOM_UNAVAILABLE');
  if(e.status==='timeout')requireV2(e.timedOut,'TIMEOUT_FLAG');
  if(e.outputLimitExceeded)requireV2(e.status==='process-error','OUTPUT_LIMIT_FLAG');
 }
 return p;
}
export function normalizeResponse({response,metadata,execution,observedAtUTC},context){
 validateRaw(response,context);
 const cases=response.cases.map((r,i)=>({caseId:r.caseId,requestHash:r.requestHash,observation:!isIntegerReturn(r.observation)&&['returned','raised'].includes(r.observation.kind)?{kind:r.observation.kind,outcome:sanitizePre54Outcome(r.observation.outcome,context.kit.request.cases[i])}:structuredClone(r.observation)}));
 // Metadata is gated before this object can be published. Unknown fields are rejected,
 // not silently removed, and no exception text/stack/path is projected.
 const result={protocol:PUBLIC,role:metadata.role,entryId:metadata.entryId,requestHash:response.requestHash,freezeHash:context.kit.freeze.hash,observationFreezeHash:context.freezeHash,observedAtUTC,source:structuredClone(metadata.source),runtime:structuredClone(metadata.runtime),execution:structuredClone(execution),random:structuredClone(response.random),dispatch:structuredClone(response.dispatch),cases};
 return gatePackage(result,{...context,role:metadata.role});
}
export function normalizeFailure({metadata,execution,observedAtUTC},context){
 requireV2(execution.status!=='success','FAILURE_PROCESS_REQUIRED');
 const result={protocol:PUBLIC,role:metadata.role,entryId:metadata.entryId,requestHash:context.kit.request.requestHash,freezeHash:context.kit.freeze.hash,observationFreezeHash:context.freezeHash,observedAtUTC,source:structuredClone(metadata.source),runtime:structuredClone(metadata.runtime),execution:structuredClone(execution),random:null,dispatch:null,cases:[]};
 return gatePackage(result,{...context,role:metadata.role});
}
// Must finish before parsing either behavior JSON. Only trusted context and closed
// audit metadata are inspected here; final adapter cross-binding remains below.
export function gateAdmissionMetadata(a,{freezeHash,kit,dispatchPlanId}){
 shape('admission',a);nonzeroHashes(a);
 requireV2(a.observationFreezeHash===freezeHash,'AUDIT_VERSION');
 approvedDispatchPlan(a.dispatchPlanId,kit.request);
 if(dispatchPlanId!==undefined)requireV2(a.dispatchPlanId===dispatchPlanId,'AUDIT_DISPATCH_PLAN');
 return a;
}
export function gateAdmission(a,{freezeHash,kit,dispatchPlanId,referenceHash,candidateHash,reference}){
 gateAdmissionMetadata(a,{freezeHash,kit,dispatchPlanId});
 requireV2(a.referencePackageSHA256===referenceHash&&a.candidatePackageSHA256===candidateHash,'AUDIT_PACKAGE_BINDING');
 requireV2(a.referenceAdapterSHA256===reference.source.files.find(f=>f.role==='adapter')?.sha256,'AUDIT_ADAPTER_BINDING');
 return a;
}
export function counts(p,total=354){
 if(p.execution.status!=='success')return {total,processStatus:p.execution.status,attempted:null,observed:0,returned:0,raised:0,awaitingInput:0,nativeCompleted:0,businessIncomplete:0,returnedStateFacts:0,businessCompletionUnattested:0,nativeCompletionUnattested:null,plannedCaseCount:null,dispatchHandled:null,plannedNotRun:null,outsidePlanNotRun:null,unobserved:total,notRun:null,technicalFailure:null,unsupported:null};
 const plan=frozenPlanIds(p.dispatch.planId),selected=new Set(plan);
 const n={total,plannedCaseCount:plan.length,dispatchHandled:p.dispatch.handledCaseIds.length,plannedNotRun:0,outsidePlanNotRun:0,returnedStateFacts:0,businessCompletionUnattested:0,nativeCompletionUnattested:0,processStatus:'success',attempted:0,observed:0,returned:0,raised:0,awaitingInput:0,nativeCompleted:0,businessIncomplete:0,unobserved:0,notRun:0,technicalFailure:0,unsupported:0};
 for(const c of p.cases){const o=c.observation;
  if(o.kind==='unobserved'){n.unobserved++;if(o.attempted){n.attempted++;n.nativeCompletionUnattested++;}if(o.reason==='NOT_RUN'){n.notRun++;if(selected.has(c.caseId))n.plannedNotRun++;else n.outsidePlanNotRun++;}else if(['TIMEOUT','TECHNICAL_FAILURE','ACCESS_BLOCKED'].includes(o.reason))n.technicalFailure++;else n.unsupported++;continue;}
  n.attempted++;n.observed++;
  if(o.kind==='returned'){n.returned++;n.nativeCompleted++;if(isIntegerReturn(o)){n.returnedStateFacts++;n.businessCompletionUnattested++;}else if(o.outcome.kind==='value'&&o.outcome.value?.status==='pending')n.businessIncomplete++;}
  if(o.kind==='raised'){n.raised++;n.nativeCompleted++;}
  if(o.kind==='awaiting-input-not-returned'){n.awaitingInput++;n.businessIncomplete++;}
 }
 return n;
}
function comparableView(o){
 if(isIntegerReturn(o))return {kind:o.kind,representation:o.representation,nativeReturn:o.nativeReturn,state:o.state};
 if(o.kind==='awaiting-input-not-returned')return {kind:o.kind,boundary:o.boundary,state:o.state};
 return {kind:o.kind,outcome:o.outcome};
}
export function comparePackages(reference,candidate,context){
 gatePackage(reference,{...context,role:'reference'});gatePackage(candidate,{...context,role:'candidate'});
 const total=context.kit.request.cases.length;
 const report={protocol:'pre54-observation-comparison-v2.1',observationFreezeHash:context.freezeHash,requestHash:context.kit.request.requestHash,dispatchPlanId:context.dispatchPlanId,status:'BLOCKED',totalCaseCount:total,comparedCaseCount:0,equivalentObservedCaseCount:0,equivalentNativeCompletedCaseCount:0,awaitingInputPairCount:0,uncomparableCaseCount:0,counts:{reference:counts(reference,total),candidate:counts(candidate,total)},differences:[],uncomparable:[],harness:'library-only-not-formal-receive',scope:'strict-reviewed-observations-not-business-success-or-whole-feature-equivalence'};
 if(reference.execution.status!=='success'||candidate.execution.status!=='success'){report.uncomparableCaseCount=total;return report;}
 for(let i=0;i<total;i++){
  const c=context.kit.request.cases[i],r=reference.cases[i].observation,t=candidate.cases[i].observation;
  if(r.kind==='unobserved'||t.kind==='unobserved'){
   report.uncomparable.push({caseId:c.caseId,requestHash:c.requestHash,reference:r.kind==='unobserved'?r.reason:null,candidate:t.kind==='unobserved'?t.reason:null});continue;
  }
  report.comparedCaseCount++;
  const fields=[];
  if(r.kind!==t.kind)fields.push('native-lifecycle');
  if(canonicalStringify(comparableView(r))!==canonicalStringify(comparableView(t))){
   if(r.kind===t.kind){
    if(isIntegerReturn(r)!==isIntegerReturn(t))fields.push('return-representation');
    else if(isIntegerReturn(r)){if(canonicalStringify(r.nativeReturn)!==canonicalStringify(t.nativeReturn))fields.push('native-return');if(canonicalStringify(r.state)!==canonicalStringify(t.state))fields.push('state');}
    else fields.push('observed-state-or-outcome');
   }
   report.differences.push({caseId:c.caseId,requestHash:c.requestHash,fields,reference:comparableView(r),candidate:comparableView(t)});
  }else{report.equivalentObservedCaseCount++;if(r.kind==='awaiting-input-not-returned')report.awaitingInputPairCount++;else report.equivalentNativeCompletedCaseCount++;}
 }
 report.uncomparableCaseCount=report.uncomparable.length;
 report.status=report.uncomparableCaseCount?'BLOCKED':report.differences.length?'FAIL':'PASS_OBSERVATIONAL';
 return report;
}
