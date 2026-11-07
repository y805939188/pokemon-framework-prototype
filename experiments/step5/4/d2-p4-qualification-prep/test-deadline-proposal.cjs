'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {calculateProposal,caseBusinessHash}=require('./deadline-proposal.cjs');
const {compileIntentions,hash}=require('../d2-p4-runtime/workload-plan.cjs');
const input=compileIntentions();
const pair={version:'D2-final-pair-profile-v1',...Object.fromEntries(['control','candidate'].map((role,index)=>{
  const sourceHead=String(index+1).repeat(40);
  return [role,{sourceHead,sourceTree:String(index+3).repeat(40),clean:true,
    exactCI:{head:sourceHead,status:'success',forbiddenFrozenReplayNotRun:true}}];
}))}; // synthetic source/CI declarations only, never a qualified pair
const calculate=plan=>calculateProposal(plan,pair);
const provenance=()=>({kind:'OFFLINE_CONTROL',sha256:'a'.repeat(64),locator:'synthetic arithmetic fixture; not a native trace'});
const budget=upperMs=>({upperMs,basis:provenance()});
function fixture() {
  return {version:'D2-offline-deadline-proposal-v1',pairProfileHash:hash(pair),sourceHead:pair.candidate.sourceHead,traceVersion:'SYNTHETIC-NOT-A-NATIVE-TRACE',
    role:'candidate',mode:'natural',donorHash:input.donorHash,presentationHash:input.presentationHash,
    policy:{fast:false,effects:true,exposeGC:false,forcedGCCalls:0,fineProbes:true},
    cases:input.cases.map(c=>({id:c.id,seed:c.seed,businessHash:caseBusinessHash(c),traceId:'synthetic/'+c.id,
      branches:[{id:'fixture-branch',coverageBasis:provenance(),
        waits:[{start:0,end:10,basis:provenance()},{start:5,end:15,basis:provenance()}],
        nonwait:{count:2,unitUpperMs:5,basis:provenance()},input:{count:3,unitUpperMs:2,basis:provenance()}}]})),
    launch:budget(20),idle:{...budget(600),gameTicks:120},sampling:budget(10),verification:budget(20),tail:budget(50),
    safety:{factor:1.2,basis:provenance()}};
}
test('synthetic100 arithmetic unions overlapping waits and retains every row; never qualifies',()=>{
  const plan=fixture(),before=hash(plan),result=calculate(plan);
  assert.equal(result.cases.length,100);assert.equal(result.cases[0].branches[0].waitUpperMs,15);
  assert.equal(result.components.cases,3100);assert.equal(result.baseUpperMs,3800);assert.equal(result.proposedProcessUpperMs,4560);
  assert.equal(result.inputSHA256,before);assert.equal(hash(plan),before);
  assert.equal(result.qualified,false);assert.equal(result.nativeAdmission,false);assert.equal(result.actualBattles,0);
});
test('mutually exclusive branches use max, not a sum; late case affects process bound',()=>{
  const plan=fixture(),branch=structuredClone(plan.cases.at(-1).branches[0]);branch.id='late-growing-branch';
  branch.waits=[{start:0,end:115,basis:provenance()}];plan.cases.at(-1).branches.push(branch);
  const result=calculate(plan);assert.equal(result.cases.at(-1).upperMs,131);
  assert.equal(result.components.cases,3200);assert.equal(result.proposedProcessUpperMs,4680);
});
test('missing, reordered or duplicated later rows and altered seed/business are rejected',()=>{
  for(const edit of [p=>p.cases.pop(),p=>p.cases.reverse(),p=>p.cases[99]=structuredClone(p.cases[0]),
    p=>p.cases[99].seed=[1,2,3,999],p=>p.cases[99].businessHash='f'.repeat(64)]) {
    const plan=fixture();edit(plan);assert.throws(()=>calculate(plan),/all100|case identity/);
  }
});
test('empty branch/trace, duplicate branches or absent coverage sources cannot produce a bound',()=>{
  for(const edit of [p=>p.cases[99].branches=[],p=>p.cases[99].traceId=null,
    p=>p.cases[99].branches.push(structuredClone(p.cases[99].branches[0])),p=>p.cases[99].branches[0].coverageBasis=null]) {
    const plan=fixture();edit(plan);assert.throws(()=>calculate(plan));
  }
});
test('every finite bound and safety factor is explicit; no inherited 900s/default or extension',()=>{
  for(const edit of [p=>p.launch=null,p=>p.tail.upperMs=0,p=>p.sampling.upperMs=Infinity,p=>p.verification.upperMs=-1,
    p=>p.safety=null,p=>p.safety.factor=.9,p=>p.safety.factor=Infinity,p=>p.safety.factor=Number.MAX_VALUE,
    p=>p.cases[99].branches[0].nonwait.count=Number.MAX_SAFE_INTEGER]) {
    const plan=fixture();edit(plan);assert.throws(()=>calculate(plan));
  }
});
test('inverted waits, noninteger times/counts, missing/hashless bases and idle frame substitution reject',()=>{
  for(const edit of [p=>p.cases[99].branches[0].waits[0].end=-1,
    p=>p.cases[99].branches[0].waits[0].start=11,p=>p.cases[99].branches[0].input.count=.5,
    p=>p.cases[99].branches[0].input.basis=null,p=>p.launch.basis.sha256='missing',
    p=>p.idle.gameTicks=119]) {const plan=fixture();edit(plan);assert.throws(()=>calculate(plan));}
});
test('workload, normal policy and source/trace identity cannot silently drift',()=>{
  for(const edit of [p=>p.donorHash='c'.repeat(64),p=>p.presentationHash='c'.repeat(64),p=>p.pairProfileHash=null,
    p=>p.traceVersion=null,p=>p.policy.fast=true,p=>p.policy.effects=false,p=>p.role='legacy-D1',p=>p.mode='legacy900']) {
    const plan=fixture();edit(plan);assert.throws(()=>calculate(plan));
  }
});
test('off keeps oracle budgets, fine probes off; GC exact ten calls is separately bound',()=>{
  const off=fixture();off.mode='instrumentOff';off.policy.fineProbes=false;
  assert.equal(calculate(off).policy.fineProbes,false);off.policy.forcedGCCalls=1;assert.throws(()=>calculate(off),/policy/);
  const gc=fixture();gc.mode='GC';gc.policy.exposeGC=true;gc.policy.forcedGCCalls=10;
  assert.equal(calculate(gc).mode,'GC');gc.policy.forcedGCCalls=2;assert.throws(()=>calculate(gc),/policy/);
});
test('formal process IDs or scope cannot be relabelled as isolated qualification',()=>{
  for(const [scope,attemptId] of [['FORMAL','qualification-1'],['OUTSIDE_FORMAL_GROUPS','candidate-natural1'],
    ['OUTSIDE_FORMAL_GROUPS','control-GC1']]) {
    const plan=fixture();plan.launch.basis={...provenance(),kind:'ISOLATED_NATIVE_QUALIFICATION',scope,attemptId};
    assert.throws(()=>calculate(plan),/relabelled/);
  }
});
test('even a correctly shaped native-labelled source is no authority or qualification',()=>{
  const plan=fixture();plan.launch.basis={...provenance(),kind:'ISOLATED_NATIVE_QUALIFICATION',scope:'OUTSIDE_FORMAL_GROUPS',attemptId:'qualification-1'};
  const result=calculate(plan);assert.equal(result.qualified,false);assert.equal(result.acceptance,'NOT_GRANTED');
});
test('default real template remains blocked with no fabricated trace or finite deadlines',()=>{
  const plan=require('./deadline-template.json');assert.equal(plan.cases,null);assert.equal(plan.launch,null);
  assert.equal(plan.qualified,false);assert.throws(()=>calculate(plan));
});
test('pair drift, missing/dirty/same source, CI mismatch/HOLD and role reassignment reject',()=>{
  for(const edit of [p=>p.candidate=null,p=>p.candidate.clean=false,p=>p.candidate.exactCI.status='HOLD',
    p=>p.candidate.exactCI.head='5'.repeat(40),p=>p.candidate.exactCI.forbiddenFrozenReplayNotRun=false,
    p=>p.candidate=structuredClone(p.control),p=>p.candidate.sourceTree=null]) {
    const changed=structuredClone(pair);edit(changed);const plan=fixture();plan.pairProfileHash=hash(changed);
    assert.throws(()=>calculateProposal(plan,changed));
  }
  const drift=fixture();drift.pairProfileHash='f'.repeat(64);assert.throws(()=>calculate(drift),/pair profile identity/);
  const role=fixture();role.role='control';assert.throws(()=>calculate(role),/role\/source/);
  assert.throws(()=>calculateProposal(fixture()),/pair profile identity/);
});
