// Synthetic metadata/transport controls only. No original Ruby or external model is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,unlinkSync,symlinkSync,linkSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createControlGate,readPublicFile,schemas} from './observer-control/gate.mjs';
import {makeHandoff} from './lib/protocol.mjs';
import {compareBehaviorPackages} from './lib/compare.mjs';
import {strictStringify,sha256File} from './lib/json.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
export function registerObserverControlTests({testRoot,experimentRoot,kitRoot,kit,candidate,syntheticPeer}){
 let n=0;const qualification=JSON.parse(readFileSync(join(experimentRoot,'requests/pre54-qualification.json'),'utf8'));
 const checks=['referenceVersionVerified','tagPrimaryFilesIdentical','originalBusinessMethodsLoaded','adapterBusinessRulesNotReimplemented','sourceMethodLocationsVerified','actualLoadedFilesVerified','sourceExecutedMethodTraceVerified','nodeLoaderPolicyVerified','randomTraceVerified','privateFactsPreserved','originalSourceUnmodified'];
 const evidenceKeys=['adapterSHA256','privateSourceManifestSHA256','loadedFileEvidenceSHA256','sourceMethodTraceSHA256','readinessResponseSHA256','readinessExecutionManifestSHA256'];
 const save=(path,v)=>writeFileSync(path,strictStringify(v,true)+'\n');
 function fixture(){
  const root=join(testRoot,'observer-control-'+n++);mkdirSync(root);const ref=syntheticPeer();
  assert.equal(ref.runtime.version,'INFRASTRUCTURE-SELF-TEST');
  const binding={protocol:'pre54-observer-control-binding-v1',profile:'pre54-batch2-v1',source:structuredClone(kit.manifest.source),freezeHash:kit.freeze.hash,requestHash:kit.request.requestHash,manifestSha256:sha256File(join(kitRoot,'artifacts.manifest.json')),
   referenceCommit:ref.source.commit,referenceTag:ref.source.tag,referenceRuntime:ref.runtime.version,observerRunId:'SYNTHETIC_OBSERVER',auditorRunId:'SYNTHETIC_AUDITOR',operations:qualification.operations.map(o=>({operation:o.operation,matrixCount:kit.request.cases.filter(c=>c.operation===o.operation).length,cases:structuredClone(o.normalAndBoundaryProbes)}))};
  const roles=Object.fromEntries(ref.source.files.map(f=>[f.role,f.sha256])),evidence=Object.fromEntries(evidenceKeys.map(k=>[k,hash('SYNTHETIC-'+k)]));evidence.adapterSHA256=roles.adapter;
  const qualifications=Object.fromEntries(binding.operations.map(o=>[o.operation,Object.fromEntries(o.cases.map((c,i)=>[i===0?'normal':'boundary',{...c,called:true,result:'SUCCEEDED'}]))]));
  const header={candidateSHA:binding.source.commit,freezeHash:binding.freezeHash,requestHash:binding.requestHash,referenceTargetCommit:binding.referenceCommit,referenceTargetTag:binding.referenceTag};
  const ready={protocol:'pre54-observer-status-v1',...header,role:'reference-observer',runId:binding.observerRunId,stage:'READINESS',status:'SEALED',code:'NONE',observedReferenceCommit:ref.source.commit,observedTagCommit:ref.source.commit,referenceRuntime:ref.runtime.version,hostMode:'ORIGINAL_WITH_MINIMAL_EXTERNAL_FIXTURES',checks:Object.fromEntries(checks.map(k=>[k,true])),roles,evidence,qualifications,randomDrawCount:0};
  save(join(root,'observer-readiness.json'),ready);
  const audit={protocol:'pre54-source-audit-v1',...header,role:'source-auditor',runId:binding.auditorRunId,observerRunId:binding.observerRunId,verdict:'PASS_SCOPED',code:'NONE',readinessStatusSHA256:sha256File(join(root,'observer-readiness.json')),roles:structuredClone(roles),evidence:structuredClone(evidence),operations:Object.fromEntries(binding.operations.map(o=>[o.operation,'PASS_SCOPED']))};save(join(root,'source-audit.json'),audit);
  const dual={...structuredClone(ready),stage:'FULL_DUAL',dual:{acceptedAuditSHA256:sha256File(join(root,'source-audit.json')),readinessStatusSHA256:sha256File(join(root,'observer-readiness.json')),referenceCaseCount:354,candidateCaseCount:354,referenceStatus:'success',candidateStatus:'success',referenceExit:0,candidateExit:0,referenceSealedBeforeCandidate:true,referenceBehaviorSHA256:hash('placeholder-ref'),candidateBehaviorSHA256:hash('placeholder-candidate'),handoffSHA256:hash('placeholder-handoff'),producerEntrySHA256:kit.hashes.get('run-dual.mjs'),producerManifestSHA256:binding.manifestSha256,fullExecutionManifestSHA256:hash('SYNTHETIC-full-execution'),fullLoadedFileEvidenceSHA256:hash('SYNTHETIC-full-loaded'),fullSourceMethodTraceSHA256:hash('SYNTHETIC-full-trace'),fullRandomTraceSHA256:hash('SYNTHETIC-full-random')}};
  const cand=structuredClone(candidate);
  const producer={policy:'verified-kit-cli-v1',entryRole:'run-dual',entrySha256:kit.hashes.get('run-dual.mjs'),manifestSha256:binding.manifestSha256,dependencyPolicy:'verified-relative-payload-v1',environmentPolicy:'node-loader-free-v1',nodeOptions:'absent-or-empty',nodePath:'absent-or-empty',execArgv:'none'};
  function republish(){
   save(join(root,'reference.json'),ref);save(join(root,'candidate.json'),cand);
   const handoff=makeHandoff({request:kit.request,freezeHash:kit.freeze.hash,producer,artifacts:[{role:'reference',entryId:'reference-rules-v1',sha256:sha256File(join(root,'reference.json'))},{role:'candidate',entryId:'ts-core-v1',sha256:sha256File(join(root,'candidate.json'))}]});save(join(root,'handoff.json'),handoff);
   dual.dual.referenceBehaviorSHA256=sha256File(join(root,'reference.json'));dual.dual.candidateBehaviorSHA256=sha256File(join(root,'candidate.json'));dual.dual.handoffSHA256=sha256File(join(root,'handoff.json'));save(join(root,'observer-dual.json'),dual);
  }
  republish();const bindingFile=join(root,'trusted-binding.json');save(bindingFile,binding);
  assert.equal(createControlGate({kitRoot,binding,publicRoot:root,acceptedAuditSHA256:sha256File(join(root,'source-audit.json'))}).inspect('dual').scope,'DUAL_ARTIFACTS_READY_NOT_EQUIVALENCE','every negative fixture starts from a working full positive control');
  return {root,binding,bindingFile,ready,audit,dual,ref,cand,republish,writeReady:()=>save(join(root,'observer-readiness.json'),ready),writeAudit:()=>save(join(root,'source-audit.json'),audit),writeDual:()=>save(join(root,'observer-dual.json'),dual),gate:(accepted=null)=>createControlGate({kitRoot,binding,publicRoot:root,acceptedAuditSHA256:accepted}),accepted:()=>sha256File(join(root,'source-audit.json'))};
 }
 const fail=(fn,code)=>assert.throws(fn,e=>e.code===code,code);
 test('observer control: distributed closed schemas match the actual production binding, not a new business kit',()=>{const base=join(experimentRoot,'observer-control'),binding=JSON.parse(readFileSync(join(base,'binding.json'),'utf8'));for(const [kind,s]of Object.entries(schemas(binding)))assert.deepEqual(JSON.parse(readFileSync(join(base,kind+'.schema.json'),'utf8')),s);assert.equal(binding.source.commit,'8c9951c16cad74a595dfd30ac63aa307a5d13eae');assert.equal(binding.freezeHash,'ebda61d9abdbc43cb7d3b27857b9b9a0deb5da6877068db105959b41c151555d');});
 test('observer control: missing publication and NOT_RUN cannot attest execution',()=>{
  const f=fixture();unlinkSync(join(f.root,'observer-readiness.json'));assert.equal(f.gate().inspect('readiness').metadataGate,'NOT_YET_PUBLISHED');
  f.ready.status='NOT_RUN';for(const op of Object.values(f.ready.qualifications))for(const c of Object.values(op)){c.called=false;c.result='NOT_RUN';}f.ready.randomDrawCount=null;f.writeReady();assert.equal(f.gate().inspect('readiness').status,'NOT_RUN');
  f.ready.randomDrawCount=0;f.writeReady();fail(()=>f.gate().inspect('readiness'),'NOT_RUN_EXECUTION_CLAIM');
 });
 test('observer control: sealed12 metadata is not independent source acceptance',()=>{const f=fixture(),v=f.gate().inspect('readiness');assert.equal(v.scope,'READINESS_METADATA_NOT_SOURCE_ACCEPTANCE');assert.equal(v.independentContextVerifiedByMetadata,false);assert.equal(v.equivalenceAccepted,false);});
 test('observer control: exact six operations/twelve case bindings and denominator are required',()=>{
  for(const mutate of [b=>b.operations.pop(),b=>b.operations[0].cases[0].requestHash='1'.repeat(64),b=>b.operations[0].matrixCount--,b=>b.observerRunId=b.auditorRunId]){const f=fixture();mutate(f.binding);assert.throws(()=>f.gate());}
  for(const mutate of [r=>delete r.qualifications['learning.forgetting'],r=>r.qualifications['learning.forgetting'].normal.called=false,r=>r.qualifications['learning.forgetting'].boundary.caseId='pre54-9999']){const f=fixture();mutate(f.ready);f.writeReady();assert.throws(()=>f.gate().inspect('readiness'));}
 });
 test('observer control: private/free text/extra fields and old-batch identities reject whole status',()=>{
  for(const mutate of [r=>r.privatePath='/PRIVATE/SENTINEL',r=>r.evidence.sourceSnippet='PRIVATE',r=>r.protocol='ruby-ts-differential/observer-status-v2',r=>r.candidateSHA='1'.repeat(40),r=>r.freezeHash='1'.repeat(64),r=>r.checks.selfApproved=true]){const f=fixture();mutate(f.ready);f.writeReady();fail(()=>f.gate().inspect('readiness'),'OBSERVER_STATUS_SCHEMA_REJECTED');}
 });
 test('observer control: proof/hash/runtime/fixture gates cannot be self-filled placeholders',()=>{
  for(const mutate of [r=>r.evidence.loadedFileEvidenceSHA256='0'.repeat(64),r=>r.checks.originalBusinessMethodsLoaded=false,r=>r.roles['fixture-directory']=qualification.directoryIdentity,r=>r.evidence.adapterSHA256='1'.repeat(64),r=>r.referenceRuntime='UNKNOWN',r=>r.observedReferenceCommit='1'.repeat(40)]){const f=fixture();mutate(f.ready);f.writeReady();assert.throws(()=>f.gate().inspect('readiness'));}
 });
 test('observer control: actual nonzero randomness and blocked errors cannot be published as ready',()=>{const f=fixture();f.ready.randomDrawCount=1;f.writeReady();fail(()=>f.gate().inspect('readiness'),'RANDOMNESS_MUST_BLOCK');f.ready.status='BLOCKED';f.ready.code='UNEXPECTED_RANDOMNESS';f.writeReady();assert.equal(f.gate().inspect('readiness').status,'BLOCKED');f.ready.code='NONE';f.writeReady();fail(()=>f.gate().inspect('readiness'),'FAILURE_CODE_REQUIRED');});
 test('observer control: audit self-report cannot authorize dual without external parent hash',()=>{const f=fixture();assert.equal(f.gate().inspect('audit').scope,'AUDIT_RECEIPT_REQUIRES_PARENT_ACCEPTANCE');fail(()=>f.gate().inspect('dual'),'PARENT_ACCEPTED_AUDIT_REQUIRED');f.ready.acceptedAuditSHA256=f.accepted();f.writeReady();fail(()=>f.gate(f.accepted()).inspect('dual'),'OBSERVER_STATUS_SCHEMA_REJECTED');});
 test('observer control: audit must bind actual readiness bytes and source evidence',()=>{
  for(const mutate of [a=>a.readinessStatusSHA256='1'.repeat(64),a=>a.evidence.adapterSHA256='1'.repeat(64),a=>a.roles.adapter='1'.repeat(64),a=>a.operations['learning.forgetting']='NOT_RUN',a=>a.role='reference-observer']){const f=fixture();mutate(f.audit);f.writeAudit();assert.throws(()=>f.gate(f.accepted()).inspect('dual'));}
  const f=fixture();writeFileSync(join(f.root,'observer-readiness.json'),readFileSync(join(f.root,'observer-readiness.json'),'utf8')+' ');fail(()=>f.gate(f.accepted()).inspect('dual'),'AUDIT_READINESS_BINDING_MISMATCH');
 });
 test('observer control: parent accepted bound synthetic audit permits354 artifact checks only',()=>{const f=fixture(),v=f.gate(f.accepted()).inspect('dual');assert.equal(v.scope,'DUAL_ARTIFACTS_READY_NOT_EQUIVALENCE');assert.equal(v.equivalenceAccepted,false);assert.equal(v.independentContextVerifiedByMetadata,false);writeFileSync(join(f.root,'SYNTHETIC-SCOPE.json'),JSON.stringify({referenceRuntime:f.binding.referenceRuntime,originalRubyExecuted:0,actualDual:0,metadataTransportOnly:true}));});
 test('observer control: valid transported differences remain comparison FAIL, never metadata equivalence',()=>{const f=fixture(),c=kit.request.cases.find(c=>c.operation==='stats.computeStats');f.ref.cases.find(x=>x.caseId===c.caseId).outcome.value.atk++;f.republish();assert.equal(f.gate(f.accepted()).inspect('dual').equivalenceAccepted,false);const diff=compareBehaviorPackages({reference:f.ref,candidate:f.cand,request:kit.request,freeze:kit.freeze,mapping:kit.mapping,normalizer:kit.normalizer,manifest:kit.manifest});assert.equal(diff.status,'FAIL');assert.equal(diff.differences.length,1);});
 test('observer control: post-audit full NOT_RUN uses null unknown artifacts, not invented hashes or qualification reset',()=>{const f=fixture();f.dual.status='NOT_RUN';f.dual.randomDrawCount=null;Object.assign(f.dual.dual,{referenceCaseCount:0,candidateCaseCount:0,referenceStatus:'NOT_RUN',candidateStatus:'NOT_RUN',referenceExit:null,candidateExit:null,referenceSealedBeforeCandidate:false});for(const k of Object.keys(f.dual.dual))if(k.endsWith('SHA256')&&!['acceptedAuditSHA256','readinessStatusSHA256'].includes(k))f.dual.dual[k]=null;f.writeDual();const v=f.gate(f.accepted()).inspect('dual');assert.equal(v.status,'NOT_RUN');assert.equal(v.scope,'DUAL_STATUS_NOT_COMPLETION');f.dual.dual.referenceCaseCount=354;f.writeDual();fail(()=>f.gate(f.accepted()).inspect('dual'),'NOT_RUN_EXECUTION_CLAIM');});
 test('observer control: stale parent acceptance, partial count, retagging and changed qualified source reject',()=>{
  const f=fixture();fail(()=>f.gate('1'.repeat(64)).inspect('dual'),'PARENT_ACCEPTED_AUDIT_MISMATCH');
  for(const mutate of [d=>d.dual.referenceCaseCount=12,d=>d.dual.referenceExit=1,d=>d.observedTagCommit='1'.repeat(40),d=>d.hostMode='ORIGINAL_CONFIG_ONLY',d=>d.dual.fullSourceMethodTraceSHA256='0'.repeat(64),d=>d.dual.acceptedAuditSHA256='1'.repeat(64)]){const x=fixture();mutate(x.dual);x.writeDual();assert.throws(()=>x.gate(x.accepted()).inspect('dual'));}
 });
 test('observer control: formal behavior source/outcome/process gates remain after consistent rehash',()=>{
  for(const mutate of [r=>r.source.tag='v21.2',r=>r.source.files.pop(),r=>r.cases.pop(),r=>r.cases.reverse(),r=>r.cases[0].outcome.private='PRIVATE',r=>r.execution.stderrBytes=1]){const f=fixture();mutate(f.ref);f.republish();assert.throws(()=>f.gate(f.accepted()).inspect('dual'));}
  const f=fixture();f.ref.execution.status='process-error';f.ref.execution.exitCode=1;f.ref.cases=[];f.republish();fail(()=>f.gate(f.accepted()).inspect('dual'),'DUAL_EXECUTION_NOT_SUCCESS');
 });
 test('observer control: undeclared producer, handoff/body byte tampering and missing artifacts reject',()=>{
  const f=fixture();f.dual.dual.producerEntrySHA256='1'.repeat(64);f.writeDual();fail(()=>f.gate(f.accepted()).inspect('dual'),'DUAL_PRODUCER_MISMATCH');
  const g=fixture();writeFileSync(join(g.root,'candidate.json'),readFileSync(join(g.root,'candidate.json'),'utf8')+' ');fail(()=>g.gate(g.accepted()).inspect('dual'),'DUAL_BEHAVIOR_HASH_MISMATCH');
  const h=fixture();unlinkSync(join(h.root,'handoff.json'));fail(()=>h.gate(h.accepted()).inspect('dual'),'DUAL_HANDOFF_HASH_MISMATCH');
 });
 test('observer control: fixed public names, symlinks, hardlinks, aliases and size limits reject',()=>{
  const f=fixture();fail(()=>readPublicFile(f.root,'../PRIVATE'),'FIXED_PUBLIC_NAME_REQUIRED');const file=join(f.root,'observer-readiness.json'),copy=join(f.root,'sentinel.json');writeFileSync(copy,readFileSync(file));unlinkSync(file);symlinkSync(copy,file);fail(()=>f.gate().inspect('readiness'),'PUBLIC_FILE_REJECTED');unlinkSync(file);linkSync(copy,file);fail(()=>f.gate().inspect('readiness'),'PUBLIC_FILE_REJECTED');
  const alias=join(testRoot,'observer-alias');symlinkSync(f.root,alias);fail(()=>createControlGate({kitRoot,binding:f.binding,publicRoot:alias}).inspect('readiness'),'PUBLIC_ROOT_REJECTED');
  const g=fixture();writeFileSync(join(g.root,'observer-readiness.json'),' '.repeat(131073));fail(()=>g.gate().inspect('readiness'),'PUBLIC_FILE_REJECTED');
 });
 test('observer control CLI: external binding pin, closed output and bare Node are mandatory',()=>{
  const f=fixture(),entry=join(experimentRoot,'observer-control/receive.mjs'),args=['--binding',f.bindingFile,'--expected-binding',sha256File(f.bindingFile),'--kit',kitRoot,'--public-root',f.root,'--kind','readiness'];
  const run=(argv,env=process.env)=>spawnSync(process.execPath,argv,{cwd:kitRoot,env,encoding:'utf8'});let r=run([entry,...args]);assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(JSON.parse(r.stdout).metadataGate,'VALID_CLOSED_METADATA');assert.equal(r.stdout.includes('PRIVATE'),false);
  const bad=[...args];bad[3]='1'.repeat(64);r=run([entry,...bad]);assert.equal(r.status,2);assert.equal(JSON.parse(r.stdout).code,'CONTROL_BINDING_EXTERNAL_HASH_MISMATCH');
  r=run(['--trace-warnings',entry,...args]);assert.equal(r.status,2);assert.equal(JSON.parse(r.stdout).code,'CONTROL_NODE_POLICY_REJECTED');
  r=run([entry,...args],{...process.env,NODE_OPTIONS:'--trace-warnings'});assert.equal(r.status,2);assert.equal(JSON.parse(r.stdout).code,'CONTROL_NODE_POLICY_REJECTED');
 });
 test('observer control CLI: lexical numeric loss rejects without raw diagnostic disclosure',()=>{const f=fixture(),entry=join(experimentRoot,'observer-control/receive.mjs'),args=[entry,'--binding',f.bindingFile,'--expected-binding',sha256File(f.bindingFile),'--kit',kitRoot,'--public-root',f.root,'--kind','readiness'];assert.equal(spawnSync(process.execPath,args,{encoding:'utf8'}).status,0);writeFileSync(join(f.root,'observer-readiness.json'),strictStringify(f.ready).replace('"randomDrawCount":0','"randomDrawCount":1e-400'));const r=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(r.status,2);assert.equal(r.stderr,'');assert.equal(JSON.parse(r.stdout).code,'JSON_NUMERIC_PRECISION_LOSS');assert.equal(r.stdout.includes(f.root),false);});
}
