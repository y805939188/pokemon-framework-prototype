'use strict';
// Policy generation and decisions only. Never opens a battle or dispatches input.
const {compileIntentions}=require('../d2-p4-runtime/workload-plan.cjs');
const routes={
  'potion-P1':{kind:'item',item:'potion',member:'P1'},
  'masterball':{kind:'ball',item:'masterball'},
  'masterball-blocked':{kind:'ball',item:'masterball',expected:'blocked'},
  'switch-P2':{kind:'switch',member:'P2'},
  'switch-P1':{kind:'switch',member:'P1'},
  'finish-payday':{kind:'moveUntilEnd',move:'payday',legacyMenuKey:1},
  'finish-payday-and-learn-slot3':{kind:'moveUntilEnd',move:'payday',legacyMenuKey:1,learnSlot:3},
  'memento-or-genuine-defeat':{kind:'moveUntilEnd',move:'memento',legacyMenuKey:3}
};
function compileNavigation() {
  const intentions=compileIntentions();
  return {version:'D2-normal-navigation-policy-v1',status:'CONCRETE_POLICY_BINDINGS_PENDING_NOT_EXECUTABLE',
    donorHash:intentions.donorHash,presentationHash:intentions.presentationHash,
    inheritedBattleActionGuard:16,
    progressRule:'Advance intent index only after actual corresponding event/state oracle; not because input was sent.',
    presentation:'Normal typing/brief/dwell/animations wait; explicit paused/stat confirmations only after ready and independent sample.',
    cases:intentions.cases.map(c=>({...c,policy:c.intentions.map(x=>{
      if(!routes[x.step])throw Error('unsupported donor step');return {step:x.step,...routes[x.step]};
    }),qualifiedDeadlineMs:null,resolvedNormalActions:null})),
    bindings:{catalogPockets:null,activeFoeStableIds:null,formalAppAndFixture:null,receivingPublicAdapter:null,
      mapAndTitleAdapters:null,fullTraceOracle:null,qualifiedDeadlines:null},
    receivingPolicy:'Retain mode1/naming1; if actual normal nickname/destination question exists, explicit No/box intent requires current profile/public adapter review; never guess keys or skip handoff.',
    actualBattles:0};
}
const choose=(phase,key)=>({kind:'choose',phase,key});
const missing=detail=>({kind:'NEEDS_BINDING',detail});
const token=value=>typeof value==='string'&&value.length>0||Number.isSafeInteger(value)&&value>0;
function forcedFields(casePlan,context,snapshot) {
  if(context.caseId!==casePlan.id||!Number.isSafeInteger(context.intentIndex)||!casePlan.policy[context.intentIndex])throw Error('invalid forced replacement intent');
  if(snapshot.sceneKind!=='battle'||snapshot.current!==true||snapshot.fast!==false||snapshot.effects!==true||snapshot.ready!==true)throw Error('forced replacement not current/ready');
  if(!token(context.ownerToken)||snapshot.ownerToken!==context.ownerToken||!token(snapshot.forcedRequestToken))throw Error('forced replacement owner/request binding missing or stale');
  return {caseId:casePlan.id,intentIndex:context.intentIndex,ownerToken:context.ownerToken,
    requestToken:snapshot.forcedRequestToken,memberId:'P1'};
}
function uniqueEnabled(snapshot,key) {
  return Array.isArray(snapshot.items)&&snapshot.items.filter(item=>item.key===key&&item.enabled===true).length===1;
}
// Called by the future observer only after the first selection actually entered
// the forced command layer. Sending a key alone never creates this continuation.
function observeForcedSelection(casePlan,context,before,after) {
  const first=forcedFields(casePlan,context,before),second=forcedFields(casePlan,context,after);
  if(before.phase!=='party-forced'||before.partySub!=='forced'||!uniqueEnabled(before,'P1')||
    after.phase!=='party-command'||after.partySub!=='forced'||after.selectedMemberId!=='P1'||
    !uniqueEnabled(after,'switch-in')||JSON.stringify(first)!==JSON.stringify(second))throw Error('forced selection transition mismatch');
  return {...context,forcedReplacement:Object.freeze(first)};
}
function nextDecision(casePlan,context,snapshot) {
  if(context.caseId!==casePlan.id)throw Error('wrong case context');
  if(snapshot.fast!==false||snapshot.effects!==true)throw Error('normal policy changed');
  if(snapshot.current!==true)throw Error('stale normal owner');
  if(snapshot.sceneKind!=='battle')return {kind:'NEEDS_ADAPTER',scene:snapshot.sceneKind};
  if(snapshot.stats)return {kind:'ackStats',level:snapshot.stats.level,phase:snapshot.stats.phase};
  if(snapshot.message?.implementation==='paused-message-v1'&&snapshot.message.phase==='full'&&snapshot.logPaused)
    return {kind:'ackPaused'}; // reviewed core enforces full text and later update
  if(snapshot.ready!==true)return {kind:'wait',reason:'normal presentation/barrier'};
  if(snapshot.phase==='end') {
    if(context.observedOutcomeCode===undefined)return missing('observed terminal outcome');
    if(context.observedOutcomeCode!==casePlan.expected.code)throw Error('unexpected terminal outcome');
    return choose('end','end');
  }
  if(snapshot.phase==='learn-initial')return choose('learn-initial','forget-move');
  if(snapshot.phase==='learn') {
    if(casePlan.policy.some(p=>p.learnSlot===3))return choose('learn',3);
    return missing('unexpected later learning choice requires frozen trace');
  }
  if(snapshot.phase==='learn-giveup')throw Error('unexpected give-up branch; no implicit declined learning');
  if(snapshot.phase==='replacement-question')return choose('replacement-question','replace-no');
  if(snapshot.phase==='wild-faint')return choose('wild-faint','next');
  if(snapshot.phase==='party-forced') {
    forcedFields(casePlan,context,snapshot);
    if(snapshot.partySub!=='forced'||!uniqueEnabled(snapshot,'P1'))throw Error('unknown/unavailable forced member');
    return choose('party-forced','P1');
  }
  if(snapshot.phase==='party-command'&&snapshot.partySub==='forced') {
    const expected=forcedFields(casePlan,context,snapshot),prior=context.forcedReplacement;
    if(!prior||Object.keys(expected).some(key=>prior[key]!==expected[key])||
      snapshot.selectedMemberId!==expected.memberId||!uniqueEnabled(snapshot,'switch-in'))throw Error('forced command missing/mismatched selection cause');
    return choose('party-command','switch-in');
  }
  if(!Number.isSafeInteger(context.intentIndex)||context.intentIndex<0)throw Error('intent index');
  const intent=casePlan.policy[context.intentIndex];
  if(!intent)throw Error('extra command after completed business intentions');
  if(snapshot.phase==='main')return choose('main',intent.kind==='switch'?'party':intent.kind==='moveUntilEnd'?'fight':'bag');
  if(snapshot.phase==='moves'&&intent.kind==='moveUntilEnd') {
    if(snapshot.moveIds?.[intent.legacyMenuKey]!==intent.move)return missing('actual current move id and donor slot mapping');
    return choose('moves',intent.legacyMenuKey);
  }
  if(snapshot.phase==='party'&&intent.kind==='switch')return choose('party',intent.member);
  if(snapshot.phase==='party-command'&&intent.kind==='switch') {
    if(snapshot.partySub!=='switch'||snapshot.selectedMemberId!==intent.member)throw Error('ordinary switch command cause mismatch');
    return choose('party-command','switch-in');
  }
  if(['item','ball'].includes(intent.kind)) {
    if(snapshot.phase==='bag') {
      const pocket=context.catalogPockets?.[intent.item];
      if(!Number.isSafeInteger(pocket)||pocket<=0)return missing('frozen catalog pocket '+intent.item);
      if(snapshot.bag?.pocket!==pocket)return {kind:'NEEDS_ADAPTER',adapter:'bag-pocket-pulse',targetPocket:pocket};
      return choose('bag',intent.item);
    }
    if(snapshot.phase==='bag-command')return choose('bag-command','use');
    if(snapshot.phase==='bag-members'&&intent.member)return choose('bag-members',intent.member);
    if(snapshot.phase==='bag-foes')return context.activeFoeStableId?choose('bag-foes',context.activeFoeStableId):missing('frozen publicly observed active foe stable ID');
  }
  throw Error('unresolved normal phase/intent '+snapshot.phase+'/'+intent.kind);
}
module.exports={compileNavigation,nextDecision,observeForcedSelection};
