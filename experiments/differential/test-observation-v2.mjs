// Infrastructure controls ONLY: no Ruby source, adapter or actual dual observations.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,copyFileSync,symlinkSync,linkSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256Json,sha256Text,parseJson,strictStringify} from './lib/json.mjs';
import {validateSchema} from './lib/schema.mjs';
import {schemas} from './lib/protocol.mjs';
import {REFERENCE_ROLES} from './profiles/pre54-batch2.mjs';
import {RAW,PUBLIC,shape,gatePackage,normalizeResponse,normalizeFailure,validateRaw,comparePackages,counts,gateAdmission} from './observation-v2/protocol.mjs';
import {approvedDispatchPlan} from './observation-v2/dispatch.mjs';
import {buildBundle,verifyBundle,byteHash,readRegular,LEGACY_FREEZE,REQUEST_BYTES} from './observation-v2/bundle.mjs';
const tmp=mkdtempSync(join(realpathSync(tmpdir()),'pre54-observation-v2-'));
after(()=>rmSync(tmp,{recursive:true,force:true}));
const legacy=process.env.PF_PRE54_LEGACY_KIT;
assert.ok(legacy,'explicit PF_PRE54_LEGACY_KIT required; no residual/global fallback');
const context={...buildBundle(legacy,join(tmp,'bundle')),dispatchPlanId:'formal354-v1'},kit=context.kit,request=kit.request;
const H='1'.repeat(64),clone=structuredClone;
const execution={status:'success',startedAtUTC:'2026-10-31T00:00:00Z',endedAtUTC:'2026-10-31T00:00:01Z',durationMs:1000,exitCode:0,signal:null,timeoutMs:5000,maxStdoutBytes:1048576,maxStderrBytes:1000,stdoutBytes:100,stderrBytes:0,stdoutSha256:H,stderrSha256:sha256Text(''),timedOut:false,outputLimitExceeded:false};
const metadata=role=>role==='reference'?{role,entryId:'reference-rules-v1',source:{commit:'8c5911e4a4b07b07e832e4bb0d5d8859e88b4a9b',tree:null,tag:'v21.1',dirty:null,files:REFERENCE_ROLES.map(role=>({role,sha256:role==='fixture-directory'?kit.hashes.get('profiles/pre54-batch2.mjs'):H}))},runtime:{name:'reference',version:'INFRASTRUCTURE-SELF-TEST',dependencies:[{name:'reference-runtime',version:'SYNTHETIC'},{name:'adapter',version:'SYNTHETIC-V2'}]}}:{role,entryId:'ts-core-v1',source:{...kit.manifest.source,tag:null,files:[{role:'core-bundle',sha256:kit.hashes.get('core/core.cjs')},{role:'runner',sha256:kit.hashes.get('runners/ts-runner.mjs')}]},runtime:{name:'node',version:process.version,dependencies:[{name:'node',version:process.version}]}};
function value(c){
 if(c.operation==='learning.relearningCandidates')return {moves:[]};
 if(c.operation==='learning.forgetting')return {status:'pending',moves:clone(c.input.member?.moves??[]),forgotten:null};
 if(c.operation.endsWith('Sequence')){const steps=(c.input.calls??c.input.individuals).map(()=>({changed:false,refreshCalls:0,state:clone(c.input.initial)}));return {steps,state:clone(steps.at(-1).state)};}
 if(c.operation==='stats.computeStats')return {hp:1,atk:1,def:1,spa:1,spd:1,spe:1};
 return 1;
}
function raw(){return {protocol:RAW,requestHash:request.requestHash,observationFreezeHash:context.freezeHash,dispatch:{planId:context.dispatchPlanId,handledCaseIds:approvedDispatchPlan(context.dispatchPlanId,request)},random:{seed:null,drawCount:0,draws:[]},cases:request.cases.map(c=>({caseId:c.caseId,requestHash:c.requestHash,observation:{kind:'returned',outcome:{kind:'value',raw:value(c)}}}))};}
function pack(role='reference',response=raw(),ctx=context){return normalizeResponse({response,metadata:metadata(role),execution:clone(execution),observedAtUTC:'2026-10-31T00:00:02Z'},ctx);}
const index=request.cases.findIndex(c=>c.operation==='learning.forgetting'&&c.input.slot==='pending'&&c.input.member?.moves.length===2);
const chosen=request.cases[index];
function wait(c=chosen){const delivered=c.input.slot==='pending'?0:1,state={member:clone(c.input.member)};return {kind:'awaiting-input-not-returned',boundary:{id:'learning.forgetting.move-selection-v1',ordinal:delivered+1,deliveredInputCount:delivered},state,proof:{boundaryEvidenceSHA256:H,stateSHA256:sha256Json(state),fullStateEvidenceSHA256:H,sourceTraceSHA256:H,cleanupEvidenceSHA256:H,backgroundQuiescent:true,fullStateProjection:true},cleanup:{method:'observer-unwind',completed:true,nativeReturned:false,businessException:false}};}
function withWait(role='reference'){const r=raw();r.cases[index].observation=wait();return pack(role,r);}
function badWait(mutator){const p=withWait();mutator(p.cases[index].observation,p);assert.throws(()=>gatePackage(p,{...context,role:'reference'}));}
function notrunTail(p,start,reason='UNSUPPORTED_ENTRY_SEMANTICS'){p.dispatch.handledCaseIds=request.cases.slice(0,start+1).map(c=>c.caseId);for(let i=start;i<p.cases.length;i++)p.cases[i].observation={kind:'unobserved',attempted:i===start,reason:i===start?reason:'NOT_RUN'};return p;}
function files(reference=pack(),candidate=pack('candidate')){
 const root=join(mkdtempSync(join(tmp,'public-')),'public-observation-v2-1-0001');mkdirSync(root);
 const rb=Buffer.from(strictStringify(reference)+'\n'),cb=Buffer.from(strictStringify(candidate)+'\n');
 const a={protocol:'pre54-observation-execution-audit-v2.1',dispatchPlanId:reference.dispatch?.planId??context.dispatchPlanId,observationFreezeHash:context.freezeHash,sourceQualificationSHA256:H,privateExecutionAuditSHA256:H,referencePackageSHA256:byteHash(rb),candidatePackageSHA256:byteHash(cb),referenceAdapterSHA256:H,observerTaskId:'01a18dc0-6ef3-74fe-ae95-0aae9e4350eb',auditorTaskId:'01a190ab-cc58-75b1-88c0-6bdae55f403f',verdict:'PASS_SCOPED',scope:'final-v2.1-adapter-source-and-execution-projection',freshV2Qualification:true,stableBoundaryAndCleanupAudited:true};
 writeFileSync(join(root,'reference-observations.json'),rb);writeFileSync(join(root,'candidate-observations.json'),cb);writeFileSync(join(root,'execution-audit.json'),strictStringify(a)+'\n');return {root,a};
}
function cli(f,name='receive.mjs',opts={}){const audit=byteHash(readFileSync(join(f.root,'execution-audit.json')));return spawnSync(process.execPath,[join(context.root,'tools/observation-v2',name),'--bundle',context.root,'--expected-freeze',context.freezeHash,'--public-root',f.root,'--expected-audit',audit],{encoding:'utf8',...opts});}
test('fixed354 request bytes, old freeze and all37 payload hashes survive bundle',()=>{
 assert.equal(byteHash(readFileSync(join(context.root,'legacy-kit/requests/wp30-r2.json'))),REQUEST_BYTES);assert.equal(kit.freeze.hash,LEGACY_FREEZE);assert.equal(request.cases.length,354);assert.equal(kit.manifest.files.length,37);assert.equal(verifyBundle(context.root,context.freezeHash).freezeHash,context.freezeHash);
});
test('v1 cannot express a native not-returned wait; upgrade never rewrites it',()=>{
 const v1={kind:'awaiting-input-not-returned',state:{member:chosen.input.member}};
 const legacySchema=schemas.behavior(request);assert.equal(validateSchema({$ref:'#/$defs/outcome'},v1,legacySchema).valid,false);
 assert.equal(validateSchema({$ref:'#/$defs/outcome'},{kind:'value',value:{status:'pending',moves:chosen.input.member.moves,forgotten:null}},legacySchema).valid,true);
});
test('returned pending retains actual PP/order rather than filling input',()=>{
 const r=raw(),o=r.cases[index].observation.outcome;o.raw.moves[0].pp++;o.raw.moves.reverse();const p=pack('reference',r);
 assert.deepEqual(p.cases[index].observation.outcome.value.moves,o.raw.moves);assert.notDeepEqual(o.raw.moves,chosen.input.member.moves);
});
test('wait is observed but never returned/completed; exact state remains public',()=>{
 const p=withWait(),n=counts(p);assert.equal(n.total,354);assert.equal(n.observed,354);assert.equal(n.returned,353);assert.equal(n.awaitingInput,1);assert.equal(n.nativeCompleted,353);assert.equal(p.cases[index].observation.kind,'awaiting-input-not-returned');
});
test('equal waits are equivalent observations, not completed calls',()=>{
 const r=comparePackages(withWait(),withWait('candidate'),context);assert.equal(r.status,'PASS_OBSERVATIONAL');assert.equal(r.awaitingInputPairCount,1);assert.equal(r.equivalentNativeCompletedCaseCount,353);assert.equal(r.harness,'library-only-not-formal-receive');
});
test('returned pending versus not-returned wait remains lifecycle difference',()=>{
 const r=comparePackages(withWait(),pack('candidate'),context);assert.equal(r.status,'FAIL');assert.equal(r.differences.length,1);assert.deepEqual(r.differences[0].fields,['native-lifecycle']);
});
for(const [name,mutate]of [['PP',w=>w.state.member.moves[0].pp++],['order',w=>w.state.member.moves.reverse()]])test('partial '+name+' at stable boundary is compared, not normalized away',()=>{
 const p=withWait('candidate'),w=p.cases[index].observation;mutate(w);w.proof.stateSHA256=sha256Json(w.state);const r=comparePackages(withWait(),p,context);assert.equal(r.status,'FAIL');assert.equal(r.differences.length,1);
});
test('technical proof/cleanup implementation hashes are evidence identities, not state equality',()=>{
 const p=withWait('candidate'),w=p.cases[index].observation;w.proof.boundaryEvidenceSHA256='2'.repeat(64);w.cleanup.method='isolated-process-disposal';assert.equal(comparePackages(withWait(),p,context).status,'PASS_OBSERVATIONAL');
});
test('actual one-choice then next stable request records ordinal2 without changing input',()=>{
 const i=request.cases.findIndex(c=>c.operation==='learning.forgetting'&&c.input.slot===4&&c.input.member?.moves.length===2),r=raw();r.cases[i].observation=wait(request.cases[i]);assert.equal(pack('reference',r).cases[i].observation.boundary.ordinal,2);assert.equal(request.cases[i].input.slot,4);
});
for(const [name,change]of [
 ['missing actual request proof',w=>delete w.proof.boundaryEvidenceSHA256],['zero proof',w=>w.proof.boundaryEvidenceSHA256='0'.repeat(64)],['wrong state hash',w=>w.proof.stateSHA256=H],
 ['background work',w=>w.proof.backgroundQuiescent=false],['incomplete projection',w=>w.proof.fullStateProjection=false],['cleanup not complete',w=>w.cleanup.completed=false],
 ['fake native return',w=>w.cleanup.nativeReturned=true],['technical stop as business exception',w=>w.cleanup.businessException=true],['timeout label',w=>w.cleanup.method='timeout'],
 ['invented input',w=>w.boundary.deliveredInputCount=1],['wrong boundary ordinal',w=>w.boundary.ordinal=2],['unknown boundary',w=>w.boundary.id='other'],
 ['opaque pending value',w=>w.outcome={kind:'value',value:'pending'}],['free text leak',w=>w.note='private text'],['member field leak',w=>w.state.member.secret='x'],
 ['unknown move',w=>w.state.member.moves[0].id='private-method-name'],['bad PP',w=>{w.state.member.moves[0].pp=64;w.proof.stateSHA256=sha256Json(w.state);}],['bad ppUps',w=>w.state.member.moves[0].ppUps=4]
])test('reject wait: '+name,()=>badWait(change));
test('other operations cannot smuggle a wait through the new protocol',()=>{
 const p=pack();p.cases[0].observation=wait();assert.throws(()=>gatePackage(p,{...context,role:'reference'}));
});
test('both unsupported stays BLOCKED with total354, observed prefix only',()=>{
 const p=notrunTail(pack(),index);const c=notrunTail(pack('candidate'),index);const r=comparePackages(p,c,context);assert.equal(r.status,'BLOCKED');assert.equal(r.totalCaseCount,354);assert.equal(r.comparedCaseCount,index);assert.equal(r.uncomparableCaseCount,354-index);assert.equal(r.counts.reference.unsupported,1);assert.equal(r.counts.reference.notRun,353-index);
});
test('timeout is technical/uncomparable even if observer transport exits0',()=>{
 const p=notrunTail(pack(),index,'TIMEOUT');p.random=null;const r=comparePackages(p,pack('candidate'),context);assert.equal(r.status,'BLOCKED');assert.equal(r.counts.reference.awaitingInput,0);assert.equal(r.counts.reference.technicalFailure,1);
});
test('cannot continue actual business observations after mandatory blocker',()=>{
 const p=pack();p.cases[index].observation={kind:'unobserved',attempted:true,reason:'UNSUPPORTED_ENTRY_SEMANTICS'};assert.throws(()=>gatePackage(p,{...context,role:'reference'}),/CONTINUED_AFTER_BLOCK/);
});
test('top process timeout cannot carry a normal wait or claim no attempted calls',()=>{
 const p=withWait();p.execution={...p.execution,status:'timeout',timedOut:true,exitCode:null,signal:'SIGTERM'};assert.throws(()=>gatePackage(p,{...context,role:'reference'}));p.cases=[];p.random=null;p.dispatch=null;const r=comparePackages(p,pack('candidate'),context);assert.equal(r.status,'BLOCKED');assert.equal(r.counts.reference.attempted,null);assert.equal(r.counts.reference.notRun,null);assert.equal(r.totalCaseCount,354);
});
test('raised business exception remains distinct and unchanged proof mandatory',()=>{
 const r=raw();r.cases[index].observation={kind:'raised',outcome:{kind:'raised',class:'RangeError',raw:{stateUnchanged:true}}};const p=pack('reference',r);assert.equal(counts(p).raised,1);assert.equal(comparePackages(p,pack('candidate'),context).status,'FAIL');r.cases[index].observation.outcome.raw.stateUnchanged=false;assert.throws(()=>pack('reference',r));
});
for(const [name,mutate]of [
 ['v1 protocol',p=>p.protocol='ruby-ts-differential/behavior-pre54-batch2-v1'],['old observation freeze',p=>p.observationFreezeHash=LEGACY_FREEZE],['changed request',p=>p.requestHash=H],
 ['missing case',p=>p.cases.pop()],['duplicate case',p=>p.cases[1]=clone(p.cases[0])],['order change',p=>p.cases.reverse()],['unknown root field',p=>p.privateRaw='x'],
 ['RNG nonzero',p=>p.random.drawCount=1],['fake process success',p=>p.execution.exitCode=1],['unclean stderr',p=>p.execution.stderrBytes=1],['reference wrong commit',p=>p.source.commit='1'.repeat(40)]
])test('whole-package rejection: '+name,()=>{
 const p=pack();mutate(p);assert.throws(()=>gatePackage(p,{...context,role:'reference'}));
});
test('raw version mismatch and raw private field reject before projection',()=>{
 const r=raw();r.protocol='ruby-ts-differential/runner-response-v1';assert.throws(()=>validateRaw(r,context));r.protocol=RAW;r.cases[index].observation.outcome.raw.secret='x';assert.throws(()=>pack('reference',r));
});
test('getter/toJSON never executes during gate',()=>{
 const p=pack();let hit=0;Object.defineProperty(p,'source',{get(){hit++;throw Error('read');},enumerable:true});assert.throws(()=>gatePackage(p,{...context,role:'reference'}));assert.equal(hit,0);
});
test('normalizer config cannot silently choose lifecycle equivalence',()=>{
 const n={protocol:'pre54-observation-normalizer-v2',arrayOrder:'preserve',lifecycleEquality:'returned-wait-equal',waitProjection:'forgetting-member-moves-v2',unobservedPolicy:'retain-total-never-equivalent',returnedProjection:'pre54-batch2-v1-unchanged'};assert.throws(()=>shape('normalizer',n));
});
test('formal gate receives only parent-pinned audited closed packages',()=>{
 const f=files(withWait(),withWait('candidate')),p=cli(f);assert.equal(p.status,0,p.stdout+p.stderr);assert.equal(parseJson(p.stdout).status,'VALID_CLOSED_OBSERVATIONS');assert.equal(parseJson(p.stdout).counts.reference.nativeCompleted,353);assert.equal(p.stderr,'');
});
test('formal compare lifecycle mismatch exit1, not fake pass',()=>{
 const p=cli(files(withWait(),pack('candidate')),'compare.mjs');assert.equal(p.status,1,p.stdout+p.stderr);assert.equal(parseJson(p.stdout).status,'FAIL');assert.equal(parseJson(p.stdout).differences[0].fields[0],'native-lifecycle');
});
test('formal compare unsupported exit3, denominator retained',()=>{
 const p=cli(files(notrunTail(pack(),index),pack('candidate')),'compare.mjs');assert.equal(p.status,3,p.stdout+p.stderr);assert.equal(parseJson(p.stdout).totalCaseCount,354);
});
for(const [name,mutate]of [
 ['extra field',a=>a.privateReport='x'],['old audit protocol',a=>a.protocol='pre54-source-audit-v1'],['wrong final adapter',a=>a.referenceAdapterSHA256='2'.repeat(64)],
 ['wrong new freeze',a=>a.observationFreezeHash=LEGACY_FREEZE],['reused qualification',a=>a.freshV2Qualification=false],['wrong O identity',a=>a.observerTaskId='other'],['wrong package pin',a=>a.referencePackageSHA256=H]
])test('formal reject audit: '+name,()=>{
 const f=files();mutate(f.a);writeFileSync(join(f.root,'execution-audit.json'),strictStringify(f.a));const p=cli(f);assert.equal(p.status,2,p.stdout+p.stderr);assert.equal(parseJson(p.stdout).status,'REJECTED_WHOLE_PACKAGE');assert.ok(!p.stdout.includes('privateReport'));
});
test('formal input duplicate JSON keys rejects instead of accepting a parser alias',()=>{
 const f=files();const a=readFileSync(join(f.root,'execution-audit.json'),'utf8');writeFileSync(join(f.root,'execution-audit.json'),a.replace('{','{"verdict":"PASS_SCOPED",'));assert.equal(cli(f).status,2);
});
test('formal bundle tamper rejects even if public audit is valid',()=>{
 const f=files(),path=join(context.root,'tools/observation-v2/normalizer.json'),b=readFileSync(path);writeFileSync(path,Buffer.concat([b,Buffer.from(' ')]));try{assert.equal(cli(f).status,2);}finally{writeFileSync(path,b);}
});
test('formal loader environment and inline launcher reject',()=>{
 const f=files();assert.equal(cli(f,'receive.mjs',{env:{...process.env,NODE_OPTIONS:'--trace-warnings'}}).status,2);
});
test('formal extra file, symlink and hardlink reject without content disclosure',()=>{
 const f=files(),extra=join(f.root,'raw.json');writeFileSync(extra,'private');assert.equal(cli(f).status,2);rmSync(extra);
 const path=join(f.root,'candidate-observations.json'),temp=join(tmp,'candidate-copy.json');copyFileSync(path,temp);rmSync(path);symlinkSync(temp,path);assert.equal(cli(f).status,2);rmSync(path);copyFileSync(temp,path);
 const hard=join(tmp,'hard.json');linkSync(path,hard);assert.equal(cli(f).status,2);rmSync(hard);
});
test('builder refuses existing output rather than rewriting an old seal',()=>assert.throws(()=>buildBundle(legacy,context.root)));

test('technical failure normalizer preserves unavailable RNG and counts without fake cases',()=>{const p=normalizeFailure({metadata:metadata('reference'),execution:{...execution,status:'timeout',timedOut:true,exitCode:null,signal:'SIGTERM'},observedAtUTC:'2026-10-31T00:00:02Z'},context);assert.equal(p.random,null);assert.equal(p.cases.length,0);assert.equal(counts(p).attempted,null);p.random={seed:null,drawCount:0,draws:[]};assert.throws(()=>gatePackage(p,{...context,role:'reference'}));});
test('unsupported random never becomes a fictitious zero trace',()=>{const p=notrunTail(pack(),index,'UNSUPPORTED_RANDOM');assert.throws(()=>gatePackage(p,{...context,role:'reference'}));p.random=null;assert.doesNotThrow(()=>gatePackage(p,{...context,role:'reference'}));assert.equal(comparePackages(p,pack('candidate'),context).status,'BLOCKED');});
test('unknown random cannot accompany otherwise fully observed success',()=>{const p=pack();p.random=null;assert.throws(()=>gatePackage(p,{...context,role:'reference'}));});

// OBS2-ULTRA-01: an invalid parent-pinned audit must fail before behavior parsing,
// not merely before returning PASS. Bad JSON distinguishes parse order from gates.
for(const [fault,expected]of [
 ['old-freeze','OBS2_AUDIT_VERSION'],
 ['zero-qualification','OBS2_ZERO_EVIDENCE_HASH'],
 ['extra-audit-field','OBS2_ADMISSION_SHAPE']
])for(const body of ['bad-json','wrong-role'])test('pre-parse audit '+fault+' precedes '+body+' in receive and compare',()=>{
 for(const entry of ['receive.mjs','compare.mjs']){
  const f=files();
  if(fault==='old-freeze')f.a.observationFreezeHash=LEGACY_FREEZE;
  if(fault==='zero-qualification')f.a.sourceQualificationSHA256='0'.repeat(64);
  if(fault==='extra-audit-field')f.a.unapproved='synthetic';
  let b;
  if(body==='bad-json')b='{not-json';
  else{const p=pack();p.role='candidate';b=strictStringify(p)+'\n';}
  writeFileSync(join(f.root,'reference-observations.json'),b);f.a.referencePackageSHA256=byteHash(Buffer.from(b));writeFileSync(join(f.root,'execution-audit.json'),strictStringify(f.a)+'\n');
  const p=cli(f,entry);assert.equal(p.status,2,p.stdout+p.stderr);assert.equal(parseJson(p.stdout).code,expected,entry+' consumed behavior before rejecting the audit');
 }
});
for(const field of ['privateExecutionAuditSHA256','referenceAdapterSHA256','referencePackageSHA256','candidatePackageSHA256'])test('pre-parse nonzero evidence check covers '+field,()=>{
 for(const entry of ['receive.mjs','compare.mjs']){
  const f=files();writeFileSync(join(f.root,'reference-observations.json'),'{not-json');f.a.referencePackageSHA256=byteHash(Buffer.from('{not-json'));f.a[field]='0'.repeat(64);writeFileSync(join(f.root,'execution-audit.json'),strictStringify(f.a));
  const p=cli(f,entry);assert.equal(p.status,2);assert.equal(parseJson(p.stdout).code,'OBS2_ZERO_EVIDENCE_HASH');
 }
});
for(const body of ['bad-reference-json','bad-candidate-json','wrong-role'])test('valid audit still rejects '+body+' after admission',()=>{
 for(const entry of ['receive.mjs','compare.mjs']){
  const f=files(),role=body==='bad-candidate-json'?'candidate':'reference';let b;
  if(body.startsWith('bad-'))b='{not-json';else{const p=pack();p.role='candidate';b=strictStringify(p)+'\n';}
  writeFileSync(join(f.root,role+'-observations.json'),b);f.a[role+'PackageSHA256']=byteHash(Buffer.from(b));writeFileSync(join(f.root,'execution-audit.json'),strictStringify(f.a));
  const p=cli(f,entry);assert.equal(p.status,2);assert.equal(parseJson(p.stdout).code,body==='wrong-role'?'OBS2_ROLE':'JSON_STRING_EXPECTED');
 }
});
test('pre-parse byte binding rejects mismatch before bad behavior JSON',()=>{
 for(const entry of ['receive.mjs','compare.mjs']){
  const f=files();writeFileSync(join(f.root,'reference-observations.json'),'{not-json');
  const p=cli(f,entry);assert.equal(p.status,2);assert.equal(parseJson(p.stdout).code,'OBS2_AUDIT_PACKAGE_BYTES');
 }
});

// v2.1 carriers are synthetic type/state controls, not observations or expected answers.
function returnedInteger(n=17,c=chosen){
 const nativeReturn={kind:'safe-integer',value:n},state={member:clone(c.input.member)};
 return {kind:'returned',representation:'native-integer-and-state-v1',nativeReturn,state,proof:{nativeReturnSHA256:sha256Json(nativeReturn),returnEvidenceSHA256:H,stateSHA256:sha256Json(state),fullStateEvidenceSHA256:H,sourceTraceSHA256:H,fullStateProjection:true}};
}
function withInteger(role='reference',n=17){const r=raw();r.cases[index].observation=returnedInteger(n);return pack(role,r);}
function badInteger(change){const p=withInteger();change(p.cases[index].observation,p);assert.throws(()=>gatePackage(p,{...context,role:'reference'}));}
for(const n of [-Number.MAX_SAFE_INTEGER,-7,0,7,Number.MAX_SAFE_INTEGER])test('native safe integer '+n+' remains a returned fact and actual state',()=>{
 const p=withInteger('reference',n),o=p.cases[index].observation;assert.equal(o.nativeReturn.value,n);assert.deepEqual(o.state.member,chosen.input.member);assert.equal(Object.hasOwn(o,'outcome'),false);assert.equal(counts(p).nativeCompleted,354);assert.equal(counts(p).businessCompletionUnattested,1);assert.equal(counts(p).returnedStateFacts,1);
});
test('native returned integer never infers ready/cancel/error from its sign or zero',()=>{
 for(const n of [-1,0,1,4]){const o=withInteger('reference',n).cases[index].observation;assert.equal(Object.hasOwn(o,'status'),false);assert.equal(Object.hasOwn(o,'class'),false);assert.equal(Object.hasOwn(o,'forgotten'),false);assert.equal(Object.hasOwn(o,'outcome'),false);}
});
for(const [name,change]of [
 ['fraction',o=>o.nativeReturn.value=0.5],['unsafe positive',o=>o.nativeReturn.value=Number.MAX_SAFE_INTEGER+1],['unsafe negative',o=>o.nativeReturn.value=-Number.MAX_SAFE_INTEGER-1],['NaN',o=>o.nativeReturn.value=NaN],['Infinity',o=>o.nativeReturn.value=Infinity],['negative zero',o=>o.nativeReturn.value=-0],
 ['boolean',o=>o.nativeReturn.value=true],['string',o=>o.nativeReturn.value='17'],['array',o=>o.nativeReturn.value=[]],['guessed status',o=>o.status='ready'],['guessed error',o=>o.outcome={kind:'error-object',class:null,value:{code:'invalid-slot',stateUnchanged:true}}],
 ['stale return hash',o=>o.nativeReturn.value++],['stale actual state',o=>o.state.member.moves[0].pp++],['extra actual state',o=>o.state.money=1],['incomplete actual state',o=>o.proof.fullStateProjection=false],['missing return evidence',o=>delete o.proof.returnEvidenceSHA256],['zero return evidence',o=>o.proof.returnEvidenceSHA256='0'.repeat(64)],['PP above max',o=>{o.state.member.moves[0].pp=64;o.proof.stateSHA256=sha256Json(o.state);}]
])test('native return/state rejects '+name,()=>badInteger(change));
test('native integer branch is limited to the stated forgetting operation',()=>{
 const p=pack();p.cases[0].observation=returnedInteger();assert.throws(()=>gatePackage(p,{...context,role:'reference'}),/RETURN_STATE_OPERATION_UNSUPPORTED/);
});
test('normalizer preserves actual returned state PP/order instead of input',()=>{
 const r=raw(),o=returnedInteger();o.state.member.moves[0].pp++;o.state.member.moves.reverse();o.proof.stateSHA256=sha256Json(o.state);r.cases[index].observation=o;
 const p=pack('reference',r);assert.deepEqual(p.cases[index].observation,o);assert.notDeepEqual(p.cases[index].observation.state.member,chosen.input.member);
});
test('native integer result and state differences are both compared',()=>{
 const a=withInteger(),b=withInteger('candidate');b.cases[index].observation.nativeReturn.value++;b.cases[index].observation.proof.nativeReturnSHA256=sha256Json(b.cases[index].observation.nativeReturn);b.cases[index].observation.state.member.moves.reverse();b.cases[index].observation.proof.stateSHA256=sha256Json(b.cases[index].observation.state);
 const d=comparePackages(a,b,context);assert.equal(d.status,'FAIL');assert.deepEqual(d.differences[0].fields,['native-return','state']);
});
test('integer/state versus legacy returned result is a representation difference, not a lifecycle rewrite',()=>{
 const d=comparePackages(withInteger(),pack('candidate'),context);assert.equal(d.status,'FAIL');assert.deepEqual(d.differences[0].fields,['return-representation']);
});
test('integer/state versus waiting remains native lifecycle difference',()=>assert.deepEqual(comparePackages(withInteger(),withWait('candidate'),context).differences[0].fields,['native-lifecycle']));
function finite25(handled=3,block=false,role='reference'){
 const ctx={...context,dispatchPlanId:'additional25-v1'},ids=approvedDispatchPlan(ctx.dispatchPlanId,request).slice(0,handled),r=raw();
 r.dispatch={planId:ctx.dispatchPlanId,handledCaseIds:ids};for(const c of r.cases)c.observation={kind:'unobserved',attempted:false,reason:'NOT_RUN'};
 for(let j=0;j<ids.length;j++){
  const i=request.cases.findIndex(c=>c.caseId===ids[j]);r.cases[i].observation=j<2?wait(request.cases[i]):returnedInteger(17,request.cases[i]);
 }
 if(block){const last=r.cases.find(c=>c.caseId===ids.at(-1));last.observation={kind:'unobserved',attempted:true,reason:'OUTPUT_CONTRACT_UNSUPPORTED'};}
 return {p:pack(role,r,ctx),ctx};
}
test('finite25 order keeps two prior waits and one real return in original354 output',()=>{
 const {p}=finite25(),n=counts(p);assert.equal(p.cases[60].caseId,'pre54-0061');assert.equal(p.cases[64].caseId,'pre54-0065');assert.equal(p.cases[66].caseId,'pre54-0067');assert.equal(p.cases[66].observation.kind,'awaiting-input-not-returned');assert.equal(p.cases[64].observation.nativeReturn.value,17);
 assert.equal(n.total,354);assert.equal(n.plannedCaseCount,25);assert.equal(n.attempted,3);assert.equal(n.returned,1);assert.equal(n.awaitingInput,2);assert.equal(n.plannedNotRun,22);assert.equal(n.outsidePlanNotRun,329);assert.equal(n.businessCompletionUnattested,1);
});
test('finite25 blocker cannot erase a previously dispatched higher-index wait',()=>{
 const {p,ctx}=finite25(3,true),before=JSON.stringify(p);assert.doesNotThrow(()=>gatePackage(p,{...ctx,role:'reference'}));assert.equal(JSON.stringify(p),before);assert.equal(p.cases[66].observation.kind,'awaiting-input-not-returned');
 const d=comparePackages(p,finite25(3,true,'candidate').p,ctx);assert.equal(d.status,'BLOCKED');assert.equal(d.totalCaseCount,354);assert.equal(d.comparedCaseCount,2);assert.equal(d.counts.reference.plannedNotRun,22);
});
test('partial qualification observations do not become full354 equivalence',()=>{
 const {p,ctx}=finite25(),d=comparePackages(p,finite25(3,false,'candidate').p,ctx);assert.equal(d.status,'BLOCKED');assert.equal(d.comparedCaseCount,3);assert.equal(d.uncomparableCaseCount,351);assert.equal(d.equivalentNativeCompletedCaseCount,1);
});
test('parent-pinned plan must agree with public package and original approved sequence',()=>{
 const {p,ctx}=finite25();assert.throws(()=>gatePackage(p,{...context,role:'reference'}),/DISPATCH_PLAN_MISMATCH/);
 const bad=clone(p);bad.dispatch.handledCaseIds.sort();assert.throws(()=>gatePackage(bad,{...ctx,role:'reference'}),/DISPATCH_NOT_APPROVED_PREFIX/);
 const erased=clone(p);erased.cases[66].observation={kind:'unobserved',attempted:false,reason:'NOT_RUN'};assert.throws(()=>gatePackage(erased,{...ctx,role:'reference'}),/HANDLED_RELABELED_NOT_RUN/);
});
test('formal gate accepts truthful finite observations with exact audit plan but compare remains BLOCKED',()=>{
 const a=finite25(),b=finite25(3,false,'candidate'),f=files(a.p,b.p),got=cli(f);assert.equal(got.status,0,got.stdout+got.stderr);assert.equal(parseJson(got.stdout).counts.reference.plannedNotRun,22);const d=cli(f,'compare.mjs');assert.equal(d.status,3);assert.equal(parseJson(d.stdout).totalCaseCount,354);
});
test('wrong or unknown admitted plan rejects before behavior parsing in both entries',()=>{
 for(const entry of ['receive.mjs','compare.mjs']){const f=files();f.a.dispatchPlanId='observer-chosen-plan';writeFileSync(join(f.root,'reference-observations.json'),'{not-json');f.a.referencePackageSHA256=byteHash(Buffer.from('{not-json'));writeFileSync(join(f.root,'execution-audit.json'),strictStringify(f.a));const p=cli(f,entry);assert.equal(p.status,2);assert.equal(parseJson(p.stdout).code,'OBS2_ADMISSION_SHAPE');}
});
test('oldv2 observation and audit versions are not silently upgraded',()=>{
 const p=pack();p.protocol='ruby-ts-differential/behavior-pre54-observation-v2';assert.throws(()=>gatePackage(p,{...context,role:'reference'}));
 const r=raw();r.protocol='ruby-ts-differential/runner-pre54-observation-v2';assert.throws(()=>validateRaw(r,context));
 const f=files();f.a.protocol='pre54-observation-execution-audit-v2';writeFileSync(join(f.root,'execution-audit.json'),strictStringify(f.a));assert.equal(cli(f).status,2);
});
