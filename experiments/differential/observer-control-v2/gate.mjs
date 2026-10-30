// Versioned v2 metadata contract: fixed export and independent release tag are distinct.
// Clean metadata receiver only. Never opens private source/adapter/raw or starts a process.
import {join} from 'node:path';
import {canonicalStringify,sha256File} from '../lib/json.mjs';
import {validateSchema} from '../lib/schema.mjs';
import {verifyKit} from '../lib/kit.mjs';
import {gateBehaviorPackage,validateHandoff} from '../lib/protocol.mjs';
import {readPublicFile} from '../observer-control/gate.mjs';
import {OPERATIONS,REFERENCE_ROLES,PROFILE} from '../profiles/pre54-batch2.mjs';

const record=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const hash={type:'string',pattern:'^[0-9a-f]{64}$'},commit={type:'string',pattern:'^[0-9a-f]{40}$'};
const nullable=s=>({anyOf:[{type:'null'},s]}),bool={type:'boolean'},integer={type:'integer',minimum:0,maximum:354};
const identifier={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$'};
const goodHash=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x)&&x!=='0'.repeat(64);
const reject=code=>{throw Object.assign(new Error(code),{code});};
const requireGate=(v,code)=>{if(!v)reject(code);};
const schemaCheck=(s,v,code)=>requireGate(validateSchema(s,v).valid,code);
const equal=(a,b)=>canonicalStringify(a)===canonicalStringify(b);
export const bindingSchema=record({
 protocol:{const:'pre54-observer-control-binding-v2'},profile:{const:PROFILE},
 source:record({commit,tree:commit,dirty:bool}),freezeHash:hash,requestHash:hash,manifestSha256:hash,
 referenceCommit:{const:'8c5911e4a4b07b07e832e4bb0d5d8859e88b4a9b'},referenceReleaseTag:{const:'v21.1'},referenceReleaseTagCommit:{const:'ea7b5d56d2436591160983c4e641a2ceee2d875a'},
 referenceRuntime:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$'},observerRunId:identifier,auditorRunId:identifier,
 operations:{type:'array',minItems:6,maxItems:6,items:record({operation:{enum:OPERATIONS},matrixCount:integer,
  cases:{type:'array',minItems:2,maxItems:2,items:record({caseId:{type:'string',pattern:'^pre54-[0-9]{4}$'},requestHash:hash})}})}
});
const codes=['NONE','TOOL_DENIED','REFERENCE_IDENTITY_UNVERIFIED','RUBY_UNAVAILABLE','DEPENDENCY_UNSUPPORTED','UNSUPPORTED_HOST','UNSUPPORTED_INPUT_MAPPING','ACTUAL_EXECUTION_FAILED','PROTOCOL_GATE_FAILED','PUBLICATION_BLOCKED','UNEXPECTED_RANDOMNESS','CLEANROOM_BOUNDARY','REFERENCE_ADAPTER_NOT_QUALIFIED','SOURCE_TRACE_UNVERIFIED','SOURCE_PIN_MISMATCH','NODE_EXECUTION_POLICY_REJECTED','PARTIAL_STATE','OUTPUT_CONTRACT_UNSUPPORTED'];
const checks=['fixedReferenceSnapshotVerified','originalBusinessMethodsLoaded','adapterBusinessRulesNotReimplemented','sourceMethodLocationsVerified','actualLoadedFilesVerified','sourceExecutedMethodTraceVerified','nodeLoaderPolicyVerified','randomTraceVerified','privateFactsPreserved','originalSourceUnmodified'];
const evidenceKeys=['adapterSHA256','privateSourceManifestSHA256','loadedFileEvidenceSHA256','sourceMethodTraceSHA256','readinessResponseSHA256','readinessExecutionManifestSHA256','tagPrimaryFilesComparisonSHA256'];
const fileNames={readiness:'observer-readiness.json',audit:'source-audit.json',dual:'observer-dual.json'};
export function schemas(binding){
 const header={candidateSHA:{const:binding.source.commit},freezeHash:{const:binding.freezeHash},requestHash:{const:binding.requestHash},referenceTargetCommit:{const:binding.referenceCommit},referenceReleaseTag:{const:binding.referenceReleaseTag},referenceReleaseTagCommit:{const:binding.referenceReleaseTagCommit}};
 const operationProperties=Object.fromEntries(binding.operations.map(o=>[o.operation,record(Object.fromEntries(o.cases.map((c,i)=>[i===0?'normal':'boundary',record({caseId:{const:c.caseId},requestHash:{const:c.requestHash},called:bool,result:{enum:['NOT_RUN','SUCCEEDED','FAILED','BLOCKED']}})])))]));
 const comparison={enum:['IDENTICAL','DIFFERENT','NOT_CHECKED']};
 const fields={tagPrimaryFilesComparison:comparison,protocol:{const:'pre54-observer-status-v2'},...header,role:{const:'reference-observer'},runId:{const:binding.observerRunId},stage:{enum:['READINESS','FULL_DUAL']},status:{enum:['NOT_RUN','IN_PROGRESS','SEALED','BLOCKED','FAILED']},code:{enum:codes},
  observedReferenceCommit:nullable(commit),observedTagCommit:nullable(commit),referenceRuntime:nullable({const:binding.referenceRuntime}),hostMode:{enum:['UNKNOWN','ORIGINAL_CONFIG_ONLY','ORIGINAL_WITH_MINIMAL_EXTERNAL_FIXTURES']},
  checks:record(Object.fromEntries(checks.map(k=>[k,bool]))),roles:record(Object.fromEntries(REFERENCE_ROLES.map(k=>[k,nullable(hash)]))),
  evidence:record(Object.fromEntries(evidenceKeys.map(k=>[k,nullable(hash)]))),qualifications:record(operationProperties),randomDrawCount:nullable({type:'integer',minimum:0,maximum:1000000000})};
 const dual=record({acceptedAuditSHA256:hash,readinessStatusSHA256:hash,referenceCaseCount:integer,candidateCaseCount:integer,
  referenceStatus:{enum:['NOT_RUN','success','process-error','timeout','protocol-error','blocked']},candidateStatus:{enum:['NOT_RUN','success','process-error','timeout','protocol-error','blocked']},
  referenceExit:nullable({type:'integer',minimum:0,maximum:255}),candidateExit:nullable({type:'integer',minimum:0,maximum:255}),referenceSealedBeforeCandidate:bool,
  referenceBehaviorSHA256:nullable(hash),candidateBehaviorSHA256:nullable(hash),handoffSHA256:nullable(hash),producerEntrySHA256:nullable(hash),producerManifestSHA256:nullable(hash),
  fullExecutionManifestSHA256:nullable(hash),fullLoadedFileEvidenceSHA256:nullable(hash),fullSourceMethodTraceSHA256:nullable(hash),fullRandomTraceSHA256:nullable(hash)});
 return {readiness:record({...fields,stage:{const:'READINESS'}}),dual:record({...fields,stage:{const:'FULL_DUAL'},dual}),
  audit:record({protocol:{const:'pre54-source-audit-v2'},...header,role:{const:'source-auditor'},runId:{const:binding.auditorRunId},observerRunId:{const:binding.observerRunId},
   verdict:{enum:['PASS_SCOPED','NEEDS_CHANGES','BLOCKED']},code:{enum:codes},readinessStatusSHA256:hash,
   tagPrimaryFilesComparison:comparison,roles:fields.roles,evidence:fields.evidence,operations:record(Object.fromEntries(OPERATIONS.map(op=>[op,{enum:['PASS_SCOPED','NEEDS_CHANGES','BLOCKED','NOT_RUN']}])))} )};
}

/** Parent-owned admission, not observer output. The parent also pins controlCandidate
 * and actual native task identity out of band. Schema validity cannot prove isolation. */
export function auditorAdmissionSchema(binding,bindingSHA256){
 const proof={type:'string',pattern:'^(?!0{64}$)[0-9a-f]{64}$'};
 return record({
  protocol:{const:'pre54-native-auditor-admission-v2'},state:{const:'READY_FOR_INDEPENDENT_SOURCE_AUDIT'},
  controlCandidate:{type:'string',pattern:'^(?!0{40}$)[0-9a-f]{40}$'},businessCandidate:{const:binding.source.commit},
  bindingSHA256:{const:bindingSHA256},freezeHash:{const:binding.freezeHash},requestHash:{const:binding.requestHash},
  referenceTargetCommit:{const:binding.referenceCommit},referenceReleaseTag:{const:binding.referenceReleaseTag},
  referenceReleaseTagCommit:{const:binding.referenceReleaseTagCommit},
  observerTaskId:{type:'string',pattern:'^[A-Za-z0-9_:-]{1,128}$'},
  observerTurnId:{type:'string',pattern:'^[A-Za-z0-9_:-]{1,128}$'},
  parentCreatedUTC:{type:'string',pattern:'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z?$'},
  parentReceiverExit:{const:0},parentReceiverStatus:{const:'SEALED'},
  parentReceiverScope:{const:'READINESS_METADATA_NOT_SOURCE_ACCEPTANCE'},parentReadinessArtifactSHA256:proof,
  observerPrivateRoot:{const:'/Users/dingshinn/Desktop/pokemon-framework/observation-pre54-batch2-8c9951c-20261030'},
  observerReadinessManifestPath:{const:'/Users/dingshinn/Desktop/pokemon-framework/observation-pre54-batch2-8c9951c-20261030/readiness-v2-sealed-20261030/manifest.json'},
  tagPrimaryFilesComparison:{enum:['IDENTICAL','DIFFERENT']},
  observerEvidence:record(Object.fromEntries(evidenceKeys.map(k=>[k,proof]))),
  roles:record(Object.fromEntries(REFERENCE_ROLES.map(k=>[k,proof]))),
  nativeIsolation:record({noHistoryInherited:{const:true},rawTaskOutputsNotReadByClean:{const:true},
   oneShotDedicatedContext:{const:true},osSandboxClaimed:{const:false}}),
  sourceAuditAcceptance:{const:'NOT_YET_ACCEPTED'}
 });
}

// Reuse v1's unchanged bounded, no-link, fixed-six-name public reader.
export {readPublicFile} from '../observer-control/gate.mjs';

/** binding and acceptedAuditSHA256 are trusted, independently pinned caller inputs, never observer fields. */
export function createControlGate({kitRoot,binding,publicRoot,acceptedAuditSHA256=null}){
 schemaCheck(bindingSchema,binding,'CONTROL_BINDING_SCHEMA_REJECTED');
 for(const k of ['freezeHash','requestHash','manifestSha256'])requireGate(goodHash(binding[k]),'CONTROL_BINDING_HASH_REJECTED');
 requireGate(binding.observerRunId!==binding.auditorRunId,'ROLE_IDS_MUST_DIFFER');
 requireGate(acceptedAuditSHA256===null||goodHash(acceptedAuditSHA256),'ACCEPTED_AUDIT_HASH_REJECTED');
 const b=structuredClone(binding),kit=verifyKit(kitRoot,{expectedFreezeHash:b.freezeHash});
 requireGate(equal(kit.manifest.source,b.source)&&kit.request.requestHash===b.requestHash&&sha256File(join(kit.root,'artifacts.manifest.json'))===b.manifestSha256,'CONTROL_KIT_BINDING_MISMATCH');
 requireGate(b.operations.map(o=>o.operation).join('|')===OPERATIONS.join('|'),'CONTROL_OPERATION_SET_MISMATCH');
 const ids=new Set();for(const o of b.operations){
  requireGate(kit.request.cases.filter(c=>c.operation===o.operation).length===o.matrixCount,'CONTROL_DENOMINATOR_MISMATCH');
  for(const c of o.cases){const actual=kit.request.cases.find(x=>x.caseId===c.caseId);requireGate(actual?.operation===o.operation&&actual.requestHash===c.requestHash&&!ids.has(c.caseId),'CONTROL_QUALIFICATION_BINDING_MISMATCH');ids.add(c.caseId);}
 }
 requireGate(kit.request.cases.length===354&&ids.size===12,'CONTROL_MATRIX_MISMATCH');
 const s=schemas(b),fixtureHash=kit.manifest.files.find(f=>f.path==='profiles/pre54-batch2.mjs').sha256;
 const hashRecord=r=>{for(const v of Object.values(r))requireGate(v===null||goodHash(v),'CONTROL_EVIDENCE_HASH_REJECTED');};
 function checkObserver(v,kind){
  schemaCheck(s[kind],v,'OBSERVER_STATUS_SCHEMA_REJECTED');hashRecord(v.roles);hashRecord(v.evidence);
  requireGate(v.tagPrimaryFilesComparison==='NOT_CHECKED'||goodHash(v.evidence.tagPrimaryFilesComparisonSHA256),'COMPLETED_COMPARISON_EVIDENCE_REQUIRED');
  if(v.roles['fixture-directory']!==null)requireGate(v.roles['fixture-directory']===fixtureHash,'CONTROL_FIXTURE_HASH_MISMATCH');
  requireGate(!['BLOCKED','FAILED'].includes(v.status)||v.code!=='NONE','FAILURE_CODE_REQUIRED');
  if(v.randomDrawCount>0)requireGate(['BLOCKED','FAILED'].includes(v.status)&&v.code==='UNEXPECTED_RANDOMNESS','RANDOMNESS_MUST_BLOCK');
  const qs=Object.values(v.qualifications).flatMap(x=>Object.values(x));
  for(const q of qs)requireGate(q.called||['NOT_RUN','BLOCKED'].includes(q.result),'UNCALLED_QUALIFICATION_RESULT');
  if(v.status==='NOT_RUN'&&kind==='readiness')requireGate(qs.every(q=>!q.called&&q.result==='NOT_RUN')&&v.randomDrawCount===null,'NOT_RUN_EXECUTION_CLAIM');
  if(v.status==='SEALED'){
   requireGate(v.code==='NONE'&&qs.every(q=>q.called&&q.result==='SUCCEEDED')&&v.randomDrawCount===0&&checks.every(k=>v.checks[k])&&v.observedReferenceCommit===b.referenceCommit&&v.observedTagCommit===b.referenceReleaseTagCommit&&v.tagPrimaryFilesComparison!=='NOT_CHECKED'&&v.referenceRuntime===b.referenceRuntime&&v.hostMode!=='UNKNOWN','READINESS_PREDICATE_REJECTED');
   requireGate([...Object.values(v.roles),...Object.values(v.evidence)].every(goodHash),'READINESS_EVIDENCE_REQUIRED');
   requireGate(v.roles.adapter===v.evidence.adapterSHA256,'ADAPTER_EVIDENCE_MISMATCH');
  }
  return v;
 }
 function readiness(){const a=readPublicFile(publicRoot,fileNames.readiness);if(a)checkObserver(a.value,'readiness');return a;}
 function audit(){
  const a=readPublicFile(publicRoot,fileNames.audit);if(!a)return null;schemaCheck(s.audit,a.value,'AUDIT_SCHEMA_REJECTED');hashRecord(a.value.roles);hashRecord(a.value.evidence);
  const r=readiness();requireGate(r&&a.value.readinessStatusSHA256===r.sha256&&equal(a.value.roles,r.value.roles)&&equal(a.value.evidence,r.value.evidence)&&a.value.tagPrimaryFilesComparison===r.value.tagPrimaryFilesComparison,'AUDIT_READINESS_BINDING_MISMATCH');
  if(a.value.verdict==='PASS_SCOPED')requireGate(r.value.status==='SEALED'&&a.value.code==='NONE'&&Object.values(a.value.operations).every(x=>x==='PASS_SCOPED'),'AUDIT_PASS_PREDICATE_REJECTED');
  else requireGate(a.value.code!=='NONE'&&Object.values(a.value.operations).some(x=>x!=='PASS_SCOPED'),'AUDIT_FAILURE_CODE_REQUIRED');
  return a;
 }
 function dual(){
  requireGate(goodHash(acceptedAuditSHA256),'PARENT_ACCEPTED_AUDIT_REQUIRED');
  const a=audit();requireGate(a&&a.sha256===acceptedAuditSHA256&&a.value.verdict==='PASS_SCOPED','PARENT_ACCEPTED_AUDIT_MISMATCH');
  const r=readiness(),d=readPublicFile(publicRoot,fileNames.dual);if(!d)return null;const v=checkObserver(d.value,'dual');
  requireGate(r&&r.sha256===a.value.readinessStatusSHA256,'AUDITED_READINESS_CHANGED');
  hashRecord(Object.fromEntries(Object.entries(v.dual).filter(([k])=>k.endsWith('SHA256'))));
  requireGate(v.dual.acceptedAuditSHA256===acceptedAuditSHA256&&v.dual.readinessStatusSHA256===r.sha256&&equal(v.evidence,r.value.evidence)&&equal(v.roles,r.value.roles)&&equal(v.qualifications,r.value.qualifications)&&v.tagPrimaryFilesComparison===r.value.tagPrimaryFilesComparison,'DUAL_QUALIFIED_SOURCE_CHANGED');
  if(v.status==='NOT_RUN')requireGate(v.dual.referenceCaseCount===0&&v.dual.candidateCaseCount===0&&v.dual.referenceStatus==='NOT_RUN'&&v.dual.candidateStatus==='NOT_RUN'&&v.dual.referenceExit===null&&v.dual.candidateExit===null&&v.randomDrawCount===null&&Object.entries(v.dual).filter(([k])=>k.endsWith('SHA256')&&!['acceptedAuditSHA256','readinessStatusSHA256'].includes(k)).every(([,x])=>x===null),'NOT_RUN_EXECUTION_CLAIM');
  if(v.status==='SEALED'){
   for(const k of ['observedReferenceCommit','observedTagCommit','referenceRuntime','hostMode','checks','randomDrawCount'])requireGate(equal(v[k],r.value[k]),'DUAL_QUALIFIED_SOURCE_CHANGED');
   const f=v.dual;requireGate(f.referenceCaseCount===354&&f.candidateCaseCount===354&&f.referenceStatus==='success'&&f.candidateStatus==='success'&&f.referenceExit===0&&f.candidateExit===0&&f.referenceSealedBeforeCandidate,'DUAL_COMPLETE_PREDICATE_REJECTED');
   requireGate(Object.entries(f).filter(([k])=>k.endsWith('SHA256')).every(([,x])=>goodHash(x)),'DUAL_EVIDENCE_REQUIRED');
   const handoff=readPublicFile(publicRoot,'handoff.json',1048576);requireGate(handoff&&handoff.sha256===f.handoffSHA256,'DUAL_HANDOFF_HASH_MISMATCH');
   validateHandoff(handoff.value,{request:kit.request,freezeHash:b.freezeHash,manifest:kit.manifest,manifestSha256:b.manifestSha256});
   requireGate(f.producerEntrySHA256===kit.hashes.get('run-dual.mjs')&&f.producerManifestSHA256===b.manifestSha256,'DUAL_PRODUCER_MISMATCH');
   for(const role of ['reference','candidate']){
    const data=readPublicFile(publicRoot,role+'.json',16777216),declared=role==='reference'?f.referenceBehaviorSHA256:f.candidateBehaviorSHA256;
    requireGate(data&&data.sha256===declared&&handoff.value.artifacts.find(x=>x.role===role).sha256===data.sha256,'DUAL_BEHAVIOR_HASH_MISMATCH');
    gateBehaviorPackage(data.value,{request:kit.request,freezeHash:b.freezeHash,role,manifest:kit.manifest});
    requireGate(data.value.execution.status==='success','DUAL_EXECUTION_NOT_SUCCESS');
    if(role==='reference')requireGate(data.value.source.commit===b.referenceCommit&&data.value.source.tag===b.referenceReleaseTag&&data.value.runtime.version===b.referenceRuntime&&equal(Object.fromEntries(data.value.source.files.map(x=>[x.role,x.sha256])),v.roles),'DUAL_REFERENCE_AUDIT_MISMATCH');
   }
  }
  return d;
 }
 return {inspect(kind){
  requireGate(Object.hasOwn(fileNames,kind),'CONTROL_KIND_REJECTED');const x=({readiness,audit,dual})[kind]();
  if(!x)return {metadataGate:'NOT_YET_PUBLISHED',kind,referenceQualification:'NOT_ATTESTED',actualDualRun:'NOT_ATTESTED'};
  const value=x.value;return {metadataGate:'VALID_CLOSED_METADATA',kind,status:value.status??value.verdict,artifactSHA256:x.sha256,candidateSHA:b.source.commit,freezeHash:b.freezeHash,
   scope:kind==='dual'?(value.status==='SEALED'?'DUAL_ARTIFACTS_READY_NOT_EQUIVALENCE':'DUAL_STATUS_NOT_COMPLETION'):kind==='audit'?'AUDIT_RECEIPT_REQUIRES_PARENT_ACCEPTANCE':'READINESS_METADATA_NOT_SOURCE_ACCEPTANCE',
   independentContextVerifiedByMetadata:false,equivalenceAccepted:false};
 }};
}
