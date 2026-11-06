'use strict';
// Offline arithmetic and identity controls only. No launcher, permit or timers.
const {compileIntentions,hash}=require('../d2-p4-runtime/workload-plan.cjs');
const {waitUnion}=require('../d2-p4-runtime/metrics.cjs');
const formalGroups=new Set(['control','candidate'].flatMap(role=>
  ['natural1','natural2','natural3','instrumentOff','GC1'].map(mode=>`${role}-${mode}`)));
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const head=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const text=value=>typeof value==='string'&&value.trim().length>0;
function number(value,label,{zero=false}={}) {
  if(!Number.isSafeInteger(value)||value<(zero?0:1))throw Error('finite integer bound required: '+label);
  return value;
}
function sum(values,label) { return number(values.reduce((total,value)=>total+value,0),label,{zero:true}); }
function basis(value) {
  if(!value||!['STATIC_ENUMERATION','OFFLINE_CONTROL','ISOLATED_NATIVE_QUALIFICATION'].includes(value.kind)||
    !hex(value.sha256)||!text(value.locator))throw Error('explicit source basis required');
  if(value.kind==='ISOLATED_NATIVE_QUALIFICATION'&&
    (value.scope!=='OUTSIDE_FORMAL_GROUPS'||!text(value.attemptId)||formalGroups.has(value.attemptId)))
    throw Error('formal run cannot be relabelled as qualification');
  // A JSON label/hash does not authenticate actual native execution or review.
  return value.kind;
}
function budget(value,label) {
  if(!value)throw Error('missing bound: '+label);
  basis(value.basis);return number(value.upperMs,label);
}
function repeated(value,label) {
  if(!value)throw Error('missing repeated bound: '+label);
  basis(value.basis);
  return number(number(value.count,label+' count',{zero:true})*
    number(value.unitUpperMs,label+' unit'),label+' total',{zero:true});
}
function branchUpper(branch) {
  if(!branch||!text(branch.id)||!Array.isArray(branch.waits))throw Error('explicit branch required');
  basis(branch.coverageBasis);
  const intervals=branch.waits.map(row=>{
    basis(row.basis);number(row.start,'wait start',{zero:true});number(row.end,'wait end',{zero:true});
    if(row.end<row.start)throw Error('inverted intentional wait');
    return {start:row.start,end:row.end};
  });
  const union=waitUnion(intervals),nonwait=repeated(branch.nonwait,'nonwait'),input=repeated(branch.input,'input');
  return {id:branch.id,waitUpperMs:number(union.milliseconds,'wait union',{zero:true}),
    waitUnion:union.intervals,nonwaitUpperMs:nonwait,inputUpperMs:input,
    upperMs:sum([union.milliseconds,nonwait,input],'branch upper')};
}
function caseBusinessHash(row) {
  return hash({id:row.id,request:row.request,seed:row.seed,setup:row.setup,expected:row.expected,intentions:row.intentions});
}
function calculateProposal(plan,pairProfile) {
  const expected=compileIntentions();
  if(!plan||plan.version!=='D2-offline-deadline-proposal-v1'||!hex(plan.pairProfileHash)||
    !text(plan.traceVersion)||!['control','candidate'].includes(plan.role)||
    !['natural','instrumentOff','GC'].includes(plan.mode))throw Error('versioned source/trace/role/mode binding required');
  if(!pairProfile||pairProfile.version!=='D2-final-pair-profile-v1'||hash(pairProfile)!==plan.pairProfileHash)
    throw Error('exact pair profile identity required');
  for(const role of ['control','candidate']) {
    const source=pairProfile[role];
    if(!source||!head(source.sourceHead)||!head(source.sourceTree)||source.clean!==true||
      source.exactCI?.head!==source.sourceHead||source.exactCI.status!=='success'||
      source.exactCI.forbiddenFrozenReplayNotRun!==true)throw Error('distinct clean exact-CI pair sources required');
  }
  if(pairProfile.control.sourceHead===pairProfile.candidate.sourceHead||plan.sourceHead!==pairProfile[plan.role].sourceHead)
    throw Error('role/source identity mismatch');
  if(plan.donorHash!==expected.donorHash||plan.presentationHash!==expected.presentationHash)
    throw Error('normal workload/presentation identity drift');
  const policy={fast:false,effects:true,exposeGC:plan.mode==='GC',forcedGCCalls:plan.mode==='GC'?10:0,fineProbes:plan.mode!=='instrumentOff'};
  if(!plan.policy||Object.keys(policy).some(key=>plan.policy[key]!==policy[key]))throw Error('normal/GC/off policy drift');
  if(!Array.isArray(plan.cases)||plan.cases.length!==100)throw Error('all100 ordered case bounds required');
  const cases=plan.cases.map((row,index)=>{
    const original=expected.cases[index];
    if(row.id!==original.id||hash(row.seed)!==hash(original.seed)||row.businessHash!==caseBusinessHash(original)||
      !text(row.traceId)||!Array.isArray(row.branches)||!row.branches.length)throw Error('case identity/trace/branch unresolved '+original.id);
    const branches=row.branches.map(branchUpper);
    if(new Set(branches.map(branch=>branch.id)).size!==branches.length)throw Error('duplicate branch identity');
    const upperMs=Math.max(...branches.map(branch=>branch.upperMs));
    return {id:row.id,traceId:row.traceId,upperMs,branches};
  });
  if(plan.idle?.gameTicks!==120)throw Error('explicit idle120 game ticks bound required');
  const components={launch:budget(plan.launch,'launch'),cases:sum(cases.map(row=>row.upperMs),'all100'),
    idle120:budget(plan.idle,'idle120'),sampling:budget(plan.sampling,'sampling'),
    verification:budget(plan.verification,'verification'),tail:budget(plan.tail,'tail')};
  if(!plan.safety||typeof plan.safety.factor!=='number'||!Number.isFinite(plan.safety.factor)||plan.safety.factor<1)
    throw Error('explicit finite safety factor >=1 required');
  basis(plan.safety.basis);
  const baseUpperMs=sum(Object.values(components),'process base');
  const proposedProcessUpperMs=number(Math.ceil(baseUpperMs*plan.safety.factor),'process upper');
  return {version:'D2-offline-deadline-calculation-v1',status:'PROPOSAL_CALCULATED_PENDING_TRACE_AND_SEMANTIC_REVIEW',
    inputSHA256:hash(plan),pairProfileHash:plan.pairProfileHash,sourceHead:plan.sourceHead,traceVersion:plan.traceVersion,role:plan.role,mode:plan.mode,
    policy,components,baseUpperMs,safetyFactor:plan.safety.factor,proposedProcessUpperMs,cases,
    branchRule:'MAX_OF_ENUMERATED_ALTERNATIVES; intentional waits use interval union within each branch',
    acceptance:'NOT_GRANTED',nativeAdmission:false,qualified:false,actualBattles:0,
    remaining:['actual trace/branch completeness and provenance independently reviewed',
      'exact final pair, mode-specific bounds and every qualification attempt frozen',
      'actual OS/interface/cleanup qualification and original host gate resolution']};
}
module.exports={calculateProposal,caseBusinessHash};
