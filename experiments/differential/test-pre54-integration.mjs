// Synthetic peers here validate infrastructure ONLY. No original Ruby is executed or accepted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,copyFileSync,cpSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {testRoot,worktreeRoot,experimentRoot,fixturePath} from './test-helpers.mjs';
import {readJson,sha256File,canonicalStringify,parseJson,strictStringify} from './lib/json.mjs';
import {verifyKit} from './lib/kit.mjs';
import {validateRequest,validateRawResponse,gateReferenceMetadata,gateBehaviorPackage,makeHandoff,validateNormalizer,sealRequest} from './lib/protocol.mjs';
import {executeArgv,attachRunnerResponse,DEFAULT_LIMITS} from './lib/process.mjs';
import {makeBehaviorPackage,sanitizeOutcome} from './lib/normalize.mjs';
import {compareBehaviorPackages} from './lib/compare.mjs';
import {PROFILE,DIRECTORY,REFERENCE_ROLES,generatePre54Request} from './profiles/pre54-batch2.mjs';
const kitRoot=join(testRoot,'pre54-kit');
const build=spawnSync(process.execPath,[join(experimentRoot,'build-kit.mjs'),'--core',join(worktreeRoot,'js/engine/build/core.cjs'),'--runner',join(testRoot,'compiled/runners/ts-runner.mjs'),'--out',kitRoot,'--frozen-at','2026-10-30T00:00:00Z','--source-metadata',join(testRoot,'source-metadata.json'),'--profile',PROFILE],{cwd:worktreeRoot,encoding:'utf8'});
writeFileSync(join(testRoot,'pre54-build.stdout'),build.stdout);writeFileSync(join(testRoot,'pre54-build.stderr'),build.stderr);assert.equal(build.status,0,build.stdout+build.stderr);
const kit=verifyKit(kitRoot),request=kit.request;
const candidateMetadata={source:{...kit.manifest.source,tag:null,files:[{role:'core-bundle',sha256:kit.hashes.get('core/core.cjs')},{role:'runner',sha256:kit.hashes.get('runners/ts-runner.mjs')}]},runtime:{name:'node',version:process.version,dependencies:[{name:'node',version:process.version},{name:'vite',version:'8.3.1'},{name:'typescript',version:'7.0.2'}]}};
const syntheticMetadata={source:{commit:'8c5911e4a4b07b07e832e4bb0d5d8859e88b4a9b',tree:null,tag:'v21.1',dirty:null,files:REFERENCE_ROLES.map(role=>({role,sha256:role==='fixture-directory'?kit.hashes.get('profiles/pre54-batch2.mjs'):sha256File(fixturePath)}))},runtime:{name:'reference',version:'INFRASTRUCTURE-SELF-TEST',dependencies:[{name:'reference-runtime',version:'INFRASTRUCTURE-SELF-TEST'},{name:'adapter',version:'1'}]}};
const rawExecution=await executeArgv({argv:[process.execPath,'runners/ts-runner.mjs','--request','requests/wp30-r2.json','--core','core/core.cjs'],cwd:kitRoot},DEFAULT_LIMITS);
attachRunnerResponse(rawExecution,rawExecution.stdout.toString('utf8'),response=>validateRawResponse(response,request));
writeFileSync(join(testRoot,'pre54-ts-single.stdout'),rawExecution.stdout);writeFileSync(join(testRoot,'pre54-ts-single.stderr'),rawExecution.stderr);
assert.equal(rawExecution.status,'success');
const candidate=makeBehaviorPackage({execution:rawExecution,request,freezeHash:kit.freeze.hash,publicMetadata:candidateMetadata,limits:DEFAULT_LIMITS,manifest:kit.manifest});
writeFileSync(join(testRoot,'pre54-ts-single.behavior.json'),strictStringify(candidate,true)+'\n');
function peer(){const execution={...rawExecution,role:'reference',entryId:'reference-rules-v1',response:structuredClone(rawExecution.response)};return makeBehaviorPackage({execution,request,freezeHash:kit.freeze.hash,publicMetadata:syntheticMetadata,limits:DEFAULT_LIMITS,manifest:kit.manifest});}
function compare(reference,c=candidate){return compareBehaviorPackages({reference,candidate:c,request,freeze:kit.freeze,mapping:kit.mapping,normalizer:kit.normalizer,manifest:kit.manifest});}
const cases=operation=>request.cases.filter(c=>c.operation===operation);
const result=c=>candidate.cases.find(x=>x.caseId===c.caseId).outcome;
const find=(op,predicate)=>cases(op).find(c=>predicate(c.input));
test('actual fixed TS runner executes all354 cases / six operations; no reference claim',()=>{
 assert.equal(request.cases.length,354);assert.equal(candidate.cases.length,354);assert.equal(new Set(request.cases.map(c=>c.operation)).size,6);assert.equal(rawExecution.stderrBytes,0);
 assert.ok(candidate.cases.every(c=>c.outcome.kind==='value'||c.outcome.kind==='error-object'));
 assert.equal(readJson(join(kitRoot,'requests/selection-coverage.json')).newDualRun,0);
});
test('relearning table / firstMoves retain order, duplicate and known suppression; eggs/shadow empty',()=>{
 for(const moreMoves of [false,true]){let c=find('learning.relearningCandidates',i=>i.member?.level===5&&!i.member.isEgg&&!i.shadow&&i.moreMoves===moreMoves);assert.deepEqual(result(c).value.moves,moreMoves?['cut','protect','ember']:['protect','ember']);}
 for(const c of cases('learning.relearningCandidates').filter(c=>!c.input.member||c.input.member.isEgg||c.input.shadow))assert.deepEqual(result(c).value.moves,[]);
});
test('forgetting named slot preserves survivor PP; wrapper-only qualification not falsely common',()=>{
 const c=find('learning.forgetting',i=>i.member?.moves.length===2&&i.slot===0);assert.deepEqual(result(c),{kind:'value',value:{status:'ready',moves:[{id:'growl',pp:2,maxpp:40,ppUps:0}],forgotten:'tackle'}});
 assert.ok(cases('learning.forgetting').every(c=>c.domain==='additional'&&c.additionalClass==='wrapper-qualification'));
 const one=find('learning.forgetting',i=>i.member?.moves.length===1&&i.slot===0);assert.equal(result(one).kind,'error-object');assert.equal(result(one).value.code,'last-move');
});
test('register vs recent: gender and display-name rules differ; duplicate counters count calls',()=>{
 const c=find('pokedex.recordSequence',i=>i.calls[0].source==='capture'&&i.calls[0].internalBattle);const v=result(c).value;assert.equal(v.state.capturedCounts.alpha,2);assert.equal(v.state.seenForms.alpha[0].gender,0);assert.equal(v.state.lastSeenForm.alpha.form,1);
 const non=find('pokedex.recordSequence',i=>i.calls[0].source==='capture'&&!i.calls[0].internalBattle);assert.equal(result(non).value.state.capturedCounts.alpha,undefined);assert.ok(result(non).value.state.owned.includes('alpha'));
 const recent=cases('pokedex.recentSequence')[0],r=result(recent).value;assert.deepEqual(r.state.lastSeenForm.alpha,{gender:2,form:0,shiny:false});assert.deepEqual(r.state.seen,[]);assert.deepEqual(r.state.owned,[]);assert.equal(r.steps[2].changed,false);assert.ok(r.steps.every(s=>s.refreshCalls===0));
});
test('stat25nature / explicitIV EV / baseHP1 and default vs compatibility HP remain separate',()=>{
 const c=find('stats.computeStats',i=>i.level===50&&i.nature==='hardy'&&i.ivs.hp===31&&i.evs.atk===0&&i.base.hp===45);assert.deepEqual(result(c).value,{hp:120,atk:69,def:69,spa:85,spd:85,spe:65});
 const one=find('stats.computeStats',i=>i.base.hp===1);assert.equal(result(one).value.hp,1);
 const a=find('stats.hpAfterRecalc',i=>i.hp===0&&i.newMax===120&&!i.reviveFainted),b=find('stats.hpAfterRecalc',i=>i.hp===0&&i.newMax===120&&i.reviveFainted);assert.equal(result(a).value,0);assert.equal(result(b).value,20);assert.equal(a.domain,'additional');assert.equal(b.domain,'common');assert.equal(kit.mapping.approvedDifferences.length,0);
});
test('synthetic peer equality verifies comparator only, not original execution or acceptance',()=>{const r=compare(peer());assert.equal(r.status,'PASS');assert.equal(r.summary.comparedCaseCount,354);assert.equal(r.harness.mode,'library-only-no-formal-entry-attestation');});
for(const[name,mutate]of [
 ['ordered learning list',r=>{const c=find('learning.relearningCandidates',i=>i.member?.level===5&&!i.shadow&&!i.member.isEgg&&i.moreMoves);r.cases.find(x=>x.caseId===c.caseId).outcome.value.moves.reverse();}],
 ['PP',r=>{const c=find('learning.forgetting',i=>i.member?.moves.length===2&&i.slot===0);r.cases.find(x=>x.caseId===c.caseId).outcome.value.moves[0].pp++;}],
 ['dex counter',r=>{const c=find('pokedex.recordSequence',i=>i.calls[0].source==='capture'&&i.calls[0].internalBattle);const v=r.cases.find(x=>x.caseId===c.caseId).outcome.value;v.state.capturedCounts.alpha++;v.steps.at(-1).state.capturedCounts.alpha++;}],
 ['stat rounding',r=>{const c=cases('stats.computeStats')[0];r.cases.find(x=>x.caseId===c.caseId).outcome.value.atk++;}],
])test('synthetic behavioral difference remains FAIL: '+name,()=>{const r=peer();mutate(r);assert.equal(compare(r).status,'FAIL');});
test('raw order / duplicate / missing cases and wrong profile rejected',()=>{
 for(const mode of ['reverse','duplicate','missing']){const r=structuredClone(rawExecution.response);if(mode==='reverse')r.cases.reverse();if(mode==='duplicate')r.cases[1]=r.cases[0];if(mode==='missing')r.cases.pop();assert.notEqual(validateRawResponse(r,request).status,'success');}
 const altered=structuredClone(request);altered.cases[0].operation='learning.arbitrary';assert.throws(()=>validateRequest(sealRequest({protocol:altered.protocol,selectionVersion:altered.selectionVersion,thresholdSource:altered.thresholdSource,capabilities:altered.capabilities,cases:altered.cases})));assert.throws(()=>validateRequest({...request,protocol:'ruby-ts-differential/request-v1'}));
});
test('source roles / fixture directory / version placeholders are closed before behavior',()=>{
 for(const mutate of [m=>m.source.files.pop(),m=>m.source.files.find(f=>f.role==='fixture-directory').sha256='1'.repeat(64),m=>m.runtime.version='UNKNOWN',m=>m.source.files.push({role:'growth-rules',sha256:'1'.repeat(64)})]){const m=structuredClone(syntheticMetadata);mutate(m);assert.throws(()=>gateReferenceMetadata(m,request,kit.manifest));}
});
test('private free text / partial exception state / extra raw fields cannot be sanitized',()=>{
 const c=cases('stats.computeStats')[0];assert.throws(()=>sanitizeOutcome({kind:'value',class:null,raw:{...result(c).value,private:'private'}},c));assert.throws(()=>sanitizeOutcome({kind:'raised',class:'RuntimeError',raw:{stateUnchanged:false}},c));assert.throws(()=>sanitizeOutcome({kind:'raised',class:'RuntimeError',raw:{}},c));
 const retained=sanitizeOutcome({kind:'raised',class:'RuntimeError',raw:{stateUnchanged:true,message:'private detail',stack:'private stack'}},c);assert.deepEqual(retained,{kind:'raised',class:'RuntimeError'});
 const m=structuredClone(candidate);m.source.secret='no';assert.throws(()=>gateBehaviorPackage(m,{request,freezeHash:kit.freeze.hash,role:'candidate',manifest:kit.manifest}));
});
test('formal new kit entry passes; wrong root, preload/execArgv, hash changes reject',()=>{
 const run=args=>spawnSync(process.execPath,args,{cwd:kitRoot,encoding:'utf8'});
 assert.equal(run(['verify-kit.mjs','--kit',kitRoot,'--expected-freeze',kit.freeze.hash]).status,0);
 assert.notEqual(run([join(experimentRoot,'verify-kit.mjs'),'--kit',kitRoot,'--expected-freeze',kit.freeze.hash]).status,0);
 assert.notEqual(run(['--trace-warnings','verify-kit.mjs','--kit',kitRoot,'--expected-freeze',kit.freeze.hash]).status,0);
 const copied=join(testRoot,'pre54-tampered');cpSync(kitRoot,copied,{recursive:true});writeFileSync(join(copied,'profiles/pre54-batch2.mjs'),'// altered');assert.throws(()=>verifyKit(copied,{expectedFreezeHash:kit.freeze.hash}));
});
test('new values cannot accept numeric lexical loss or legacy normalizer under new tag',()=>{
 for(const source of ['1e-400','9007199254740993','-0'])assert.throws(()=>parseJson(source));
 const n=structuredClone(kit.normalizer);n.projections[0].operation='growth.addExp';assert.throws(()=>validateNormalizer(n));
});
writeFileSync(join(testRoot,'PRE54-SELFTEST-SCOPE.json'),JSON.stringify({profile:PROFILE,TSCaseCount:354,syntheticReferenceOnly:true,originalRubyExecution:0,referenceQualifications:Object.fromEntries(['learning','pokedex','stats'].map(k=>[k,'NOT_RUN'])),newDualCoverage:0},null,2)+'\n');
let sequence=0;
function formalConfig(mode='echo',change=()=>{}){
 const parent=join(testRoot,'formal-pre54-'+sequence++);mkdirSync(parent);const response=join(parent,'response.json');writeFileSync(response,rawExecution.stdout);
 const synthetic=structuredClone(syntheticMetadata);synthetic.source.files=synthetic.source.files.map(f=>({...f,sha256:f.role==='fixture-directory'?f.sha256:sha256File(join(experimentRoot,'test-fixtures/pre54-synthetic-peer.mjs'))}));
 const config={protocol:'ruby-ts-differential/runner-config-v1',request:join(kitRoot,'requests/wp30-r2.json'),freezeHash:kit.freeze.hash,privateDirectory:join(parent,'private-synthetic'),publicDirectory:join(parent,'public-synthetic'),limits:DEFAULT_LIMITS,runners:[
 {role:'reference',entryId:'reference-rules-v1',argv:[process.execPath,join(experimentRoot,'test-fixtures/pre54-synthetic-peer.mjs'),mode,response,join(parent,'started')],cwd:parent,publicMetadata:synthetic},
 {role:'candidate',entryId:'ts-core-v1',argv:[process.execPath,'runners/ts-runner.mjs','--request','requests/wp30-r2.json','--core','core/core.cjs'],cwd:kitRoot,publicMetadata:candidateMetadata}]};change(config);
 const file=join(parent,'config.json');writeFileSync(file,strictStringify(config,true));return {parent,config,file,response};
}
function runFormal(f){const r=spawnSync(process.execPath,[join(kitRoot,'run-dual.mjs'),'--kit',kitRoot,'--expected-freeze',kit.freeze.hash,'--config',f.file],{cwd:kitRoot,encoding:'utf8'});writeFileSync(join(f.parent,'cli.stdout'),r.stdout);writeFileSync(join(f.parent,'cli.stderr'),r.stderr);return r;}
function compareFormal(f){const handoff=join(f.config.publicDirectory,'handoff.json'),out=join(f.parent,'report.json');const r=spawnSync(process.execPath,[join(kitRoot,'compare.mjs'),'--kit',kitRoot,'--expected-freeze',kit.freeze.hash,'--handoff',handoff,'--expected-handoff',sha256File(handoff),'--reference',join(f.config.publicDirectory,'reference.json'),'--candidate',join(f.config.publicDirectory,'candidate.json'),'--out',out],{cwd:kitRoot,encoding:'utf8'});writeFileSync(join(f.parent,'compare.stdout'),r.stdout);writeFileSync(join(f.parent,'compare.stderr'),r.stderr);return {r,report:existsSync(out)?readJson(out):null};}
test('actual formal new-profile producer+comparator are bound to kit; synthetic PASS not coverage',()=>{
 const f=formalConfig();assert.equal(runFormal(f).status,0);const {r,report}=compareFormal(f);assert.equal(r.status,0,r.stderr);assert.equal(report.status,'PASS');assert.equal(report.harness.mode,'formal-kit-cli');assert.equal(report.summary.comparedCaseCount,354);assert.equal(report.participants[0].runtime.version,'INFRASTRUCTURE-SELF-TEST');
});
for(const mode of ['stderr','nonzero'])test('formal process failure outranks a valid354-case JSON response: '+mode,()=>{
 const f=formalConfig(mode);assert.equal(runFormal(f).status,1);const {r,report}=compareFormal(f);assert.equal(r.status,1);assert.equal(report.status,'RUN_FAILED');assert.equal(report.summary.comparedCaseCount,0);
});
for(const[name,change]of [
 ['required original-role metadata absent',c=>c.runners[0].publicMetadata.source.files.pop()],
 ['fixture directory identity mismatch',c=>c.runners[0].publicMetadata.source.files.find(f=>f.role==='fixture-directory').sha256='1'.repeat(64)],
 ['candidate command from outside kit',c=>c.runners[1].argv[1]=join(experimentRoot,'runners/ts-runner.mts')],
 ['candidate cwd',c=>c.runners[1].cwd=testRoot],
 ['private/public physical alias',c=>c.publicDirectory=c.privateDirectory],
])test('formal zero-child rejection: '+name,()=>{const f=formalConfig('echo',change),r=runFormal(f);assert.equal(r.status,2,r.stdout+r.stderr);assert.equal(existsSync(join(f.parent,'started')),false);});
test('RNG or partial exception evidence blocks publication rather than inventing zero/no-state',()=>{
 for(const mode of ['random','partial']){
  const f=formalConfig();const data=readJson(f.response);
  if(mode==='random')data.random={seed:null,drawCount:1,draws:[{order:0,bound:2,value:1}]};
  else data.cases[0].outcome={kind:'raised',class:'RuntimeError',raw:{stateUnchanged:false}};
  writeFileSync(f.response,strictStringify(data));const r=runFormal(f);assert.equal(r.status,1);assert.equal(existsSync(join(f.config.publicDirectory,'handoff.json')),false);
 }
});
test('known default HP policy is preserved as a value difference, not auto-approved/normalized',()=>{
 const r=peer(),c=find('stats.hpAfterRecalc',i=>i.hp===0&&i.newMax===120&&!i.reviveFainted);r.cases.find(x=>x.caseId===c.caseId).outcome.value=20;const diff=compare(r);assert.equal(diff.status,'FAIL');assert.equal(diff.differences.length,1);assert.equal(diff.summary.approvedDifferenceCount,0);
});
test('exception proof includes excluded metadata and partial compound state, not only six projected fields',()=>{
 const core=join(kitRoot,'core/core.cjs'),shim=join(testRoot,'pre54-partial-core.cjs');
 writeFileSync(shim,`const core=require(${JSON.stringify(core)});module.exports={...core,pokedex:{...core.pokedex,planDexRecord(state,input){state.view.region=7;throw new Error('synthetic fault');}}};`);
 const r=spawnSync(process.execPath,[join(kitRoot,'runners/ts-runner.mjs'),'--request',join(kitRoot,'requests/wp30-r2.json'),'--core',shim],{cwd:kitRoot,encoding:'utf8'});assert.equal(r.status,0);const response=parseJson(r.stdout),c=cases('pokedex.recordSequence')[0],outcome=response.cases.find(x=>x.caseId===c.caseId).outcome;assert.equal(outcome.kind,'raised');assert.equal(outcome.raw.stateUnchanged,false);assert.throws(()=>sanitizeOutcome(outcome,c));
});
test('missing compatible core API is process failure, never354 synthetic TypeError business results',()=>{
 const file=join(testRoot,'pre54-incompatible-core.cjs');writeFileSync(file,'module.exports={};\n');const r=spawnSync(process.execPath,[join(kitRoot,'runners/ts-runner.mjs'),'--request',join(kitRoot,'requests/wp30-r2.json'),'--core',file],{cwd:kitRoot,encoding:'utf8'});assert.notEqual(r.status,0);assert.equal(r.stdout,'');assert.match(r.stderr,/PRE54_CORE_INCOMPATIBLE/);
});
