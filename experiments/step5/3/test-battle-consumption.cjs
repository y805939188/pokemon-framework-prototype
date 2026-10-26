'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {register}=require('node:module');
const {pathToFileURL}=require('node:url');
const {resolve}=require('node:path');
register('data:text/javascript,'+encodeURIComponent(`import {readFile} from 'node:fs/promises'; import {stripTypeScriptTypes} from 'node:module'; export async function load(url,context,next){if(url.endsWith('.ts'))return {format:'module',source:stripTypeScriptTypes(await readFile(new URL(url),'utf8'),{sourceUrl:url}),shortCircuit:true};return next(url,context);}`),pathToFileURL(__filename));
const moduleUnderTest=import(pathToFileURL(resolve(__dirname,'../../../src/framework/rules/battle-consumption.ts')));
const complete=value=>({status:'complete',value});
const unavailable=()=>({status:'unavailable',reason:'observer-interrupted'});
const coverage=()=>({status:'complete'});
const faint=(source,memberId='P1',extra={})=>({memberId,source,occurrenceOrdinal:1,sourceOrder:4,hookKey:'faint-1',...extra});
const faintCell=(values=[])=>({positiveOccurrences:values,coverage:coverage()});
function fixture(){
  const expectedBinding={battleId:'B1',generation:2,rawHash:'a'.repeat(64),contentIdentity:'b'.repeat(64)};
  const expectedContext={playerIds:['P1','P2','Egg'],L0:{P1:20,P2:21,Egg:1},engineRosterIds:['P1','P2'],foeIds:['F1','F2'],internalBattle:true};
  const display={battleSpecies:'Snorlax-Gmax',gender:0,shiny:true};
  const member=()=>({critical:complete(3),damage:complete({total:49,resetCoverage:'complete'}),faint:faintCell()});
  const control=before=>({friendship:complete({before,current:before+5,changes:[{method:'levelup',before,after:before+5}]}),faint:faintCell()});
  return {expectedBinding,expectedContext,membersBefore:[{id:'P1',friendship:100},{id:'P2',friendship:120},{id:'Egg',friendship:50}],seal:{version:2,binding:{...expectedBinding},context:structuredClone(expectedContext),observer:{appearances:{F1:complete([{memberId:'F1',sourceOrder:1,display}])},defeats:{F1:complete([{memberId:'F1',sourceOrder:3,occurrenceOrdinal:1,hookKey:'foe-faint',display}])},members:{P1:member(),P2:member()}},control:{members:{P1:control(100),P2:control(120)}}}};
}
test('V2 complete positive projection is detached and preserves actual display identity',async()=>{
  const {resolveBattleEffects}=await moduleUnderTest;const input=fixture();const before=JSON.stringify(input);
  const result=resolveBattleEffects(input);
  assert.equal(result.binding.contentIdentity,input.expectedBinding.contentIdentity);
  assert.equal(result.appearances[0].display.battleSpecies,'Snorlax-Gmax');
  assert.equal(result.defeats.length,1);assert.equal(result.critical.P1.value,3);assert.equal(result.damage.P1.value.total,49);
  assert.equal(result.friendshipReplacements.P1,105);assert.equal(result.friendshipReplacements.P2,125);
  assert.equal(result.faint.P1.coverage.status,'complete');assert.equal(result.faint.Egg.coverage.status,'complete');
  result.appearances[0].display.battleSpecies='Changed';result.critical.P1.value=999;
  assert.equal(JSON.stringify(input),before);
});
test('bad D is local: K, display, independent friend and reliable faint remain consumable',async()=>{
  const {resolveBattleEffects}=await moduleUnderTest;const input=fixture();
  input.seal.observer.members.P1.damage=complete({total:49,resetCoverage:'unavailable'});
  input.seal.control.members.P1.faint=faintCell([faint('control')]);
  const r=resolveBattleEffects(input);assert.equal(r.damage.P1.status,'invalid');assert.equal(Object.hasOwn(r.damage.P1,'value'),false);
  assert.equal(r.critical.P1.value,3);assert.equal(r.friendshipReplacements.P1,105);assert.equal(r.appearances.length,1);assert.equal(r.faint.P1.positiveOccurrences.length,1);
});
test('observer identity failure leaves independent complete control friendship and faint',async()=>{
  const {resolveBattleEffects}=await moduleUnderTest;
  for(const corrupt of [i=>{i.seal.observer.members=null;},i=>{i.seal.observer.members=Object.assign([],{P1:i.seal.observer.members.P1});}]){
    const input=fixture();corrupt(input);input.seal.control.members.P1.faint=faintCell([faint('control')]);const r=resolveBattleEffects(input);
    assert.equal(r.critical.P1.status,'unavailable');assert.equal(r.friendshipReplacements.P1,105);assert.equal(r.faint.P1.positiveOccurrences[0].source,'control');
  }
});
test('an unreadable source slot never becomes a shared binding failure or executes its getter',async()=>{
  const {resolveBattleEffects}=await moduleUnderTest;let reads=0;
  const observerFailure=fixture();observerFailure.seal.control.members.P1.faint=faintCell([faint('control')]);
  Object.defineProperty(observerFailure.seal,'observer',{enumerable:true,get(){reads++;throw Error('observer');}});
  const control=resolveBattleEffects(observerFailure);
  assert.notEqual(control.binding,null);assert.equal(control.friendshipReplacements.P1,105);assert.equal(control.faint.P1.positiveOccurrences.length,1);assert.equal(control.critical.P1.status,'unavailable');
  const controlFailure=fixture();controlFailure.seal.observer.members.P1.faint=faintCell([faint('observer')]);
  Object.defineProperty(controlFailure.seal,'control',{enumerable:true,get(){reads++;throw Error('control');}});
  const observer=resolveBattleEffects(controlFailure);
  assert.notEqual(observer.binding,null);assert.equal(observer.critical.P1.value,3);assert.equal(observer.appearances.length,1);assert.equal(observer.faint.P1.positiveOccurrences.length,1);assert.equal(Object.hasOwn(observer.friendshipReplacements,'P1'),false);
  const displayFailure=fixture();
  Object.defineProperty(displayFailure.seal.observer,'appearances',{enumerable:true,get(){reads++;throw Error('display');}});
  const members=resolveBattleEffects(displayFailure);
  assert.equal(members.appearances.length,0);assert.equal(members.critical.P1.value,3);assert.equal(members.damage.P1.status,'complete');assert.equal(members.friendshipReplacements.P1,105);assert.equal(reads,0);
});
test('real hook positive survives interrupted prefix and contrary complete-zero coverage',async()=>{
  const {resolveBattleEffects}=await moduleUnderTest;const input=fixture();
  input.seal.observer.members.P1.faint={positiveOccurrences:[faint('observer')],coverage:unavailable()};
  const r=resolveBattleEffects(input);assert.equal(r.faint.P1.positiveOccurrences.length,1);assert.equal(r.faint.P1.sources.control.coverage.status,'invalid');
  assert.equal(r.faint.P1.coverage.status,'unavailable');
});
test('unverifiable faint identity is not a positive or a proof of zero',async()=>{
  const {resolveBattleEffects,planBattleReadiness}=await moduleUnderTest;const input=fixture();
  input.seal.observer.members.P1.faint=faintCell([faint('observer','P2')]);
  const r=resolveBattleEffects(input);assert.equal(r.faint.P1.positiveOccurrences.length,0);assert.notEqual(r.faint.P1.coverage.status,'complete');
  assert.deepEqual(planBattleReadiness({member:{id:'P1',hp:10,readyToEvolve:true,evolutionReadiness:'known'},faint:r.faint.P1}),{readyToEvolve:true,evolutionReadiness:'unknown'});
});
test('source ordinals alone never correlate occurrences across sources',async()=>{
  const {resolveBattleEffects}=await moduleUnderTest;const input=fixture();
  input.seal.observer.members.P1.faint=faintCell([faint('observer')]);
  input.seal.control.members.P1.faint=faintCell([faint('control','P1',{hookKey:'other-real-hook'})]);
  const r=resolveBattleEffects(input);assert.equal(r.faint.P1.positiveOccurrences.length,2);
});
test('actor whitelist and ambiguous hook identities reject only their associated observations',async()=>{
  const {resolveBattleEffects}=await moduleUnderTest;const input=fixture();
  input.seal.observer.appearances.Stranger=complete([{memberId:'Stranger',sourceOrder:7,display:{battleSpecies:'Zoroark',gender:0,shiny:false}}]);
  input.seal.observer.defeats.F2=complete([{...input.seal.observer.defeats.F1.value[0],memberId:'F2'}]);
  input.seal.observer.members.P1.faint=faintCell([faint('observer')]);
  input.seal.control.members.P2.faint=faintCell([faint('control','P2')]);
  const r=resolveBattleEffects(input);assert.equal(r.appearances.length,1);assert.equal(r.defeats.length,0);
  for(const id of ['P1','P2']){assert.equal(r.faint[id].positiveOccurrences.length,0);assert.notEqual(r.faint[id].coverage.status,'complete');assert.equal(r.friendshipReplacements[id],id==='P1'?105:125);}
});
test('the existing 24-foe capacity is independent of the six-player faint coverage domain',async()=>{
  const {resolveBattleEffects}=await moduleUnderTest;const input=fixture();
  input.expectedContext.foeIds=Array.from({length:24},(_,i)=>'F'+(i+1));input.seal.context=structuredClone(input.expectedContext);
  input.seal.observer.appearances.F24=complete([{memberId:'F24',sourceOrder:24,display:{battleSpecies:'Zoroark',gender:0,shiny:false}}]);
  const r=resolveBattleEffects(input);assert.equal(r.appearances.length,2);assert.equal(Object.hasOwn(r.faint,'F24'),false);assert.equal(r.faint.P1.coverage.status,'complete');
});
test('friend chain failure and illegal prior value reject only that member whole friend group',async()=>{
  const {resolveBattleEffects}=await moduleUnderTest;
  for(const corrupt of [i=>{i.seal.control.members.P1.friendship.value.changes[0].before=99;},i=>{i.membersBefore[0].friendship=256;},i=>{i.seal.control.members.P1.friendship.value.before=99;}]){
    const input=fixture();corrupt(input);const r=resolveBattleEffects(input);
    assert.equal(Object.hasOwn(r.friendshipReplacements,'P1'),false);assert.equal(r.friendshipReplacements.P2,125);assert.equal(r.critical.P1.value,3);
  }
});
test('shared content/battle binding mismatch closes all auxiliary consumption',async()=>{
  const {resolveBattleEffects}=await moduleUnderTest;
  for(const [field,value] of [['contentIdentity','c'.repeat(64)],['generation',3],['rawHash','d'.repeat(64)],['battleId','B2']]){
    const input=fixture();input.seal.binding[field]=value;const r=resolveBattleEffects(input);
    assert.equal(r.binding,null);assert.deepEqual(r.appearances,[]);assert.deepEqual(r.friendshipReplacements,{});assert.equal(r.critical.P1.status,'unavailable');assert.notEqual(r.faint.P1.coverage.status,'complete');
  }
});
test('finite cells reject sparse/duplicate receipt data and do not execute caller getters',async()=>{
  const {resolveBattleEffects}=await moduleUnderTest;let getterCalls=0;const input=fixture();
  Object.defineProperty(input.seal.observer.members.P1.critical,'value',{get(){getterCalls++;throw Error('getter');}});
  input.seal.control.members.P1.friendship.value.changes=Array(1);
  input.seal.observer.members.P2.faint=faintCell([faint('observer','P2'),faint('observer','P2')]);
  const r=resolveBattleEffects(input);assert.equal(getterCalls,0);assert.equal(r.critical.P1.status,'invalid');assert.equal(Object.hasOwn(r.friendshipReplacements,'P1'),false);assert.equal(r.faint.P2.sources.observer.coverage.status,'invalid');assert.equal(r.friendshipReplacements.P2,125);
});
test('faint and reset completeness are separate; final HP cannot erase positive facts',async()=>{
  const {resolveBattleEffects,planBattleReadiness}=await moduleUnderTest;const input=fixture();
  input.seal.observer.members.P1.faint=faintCell([faint('observer')]);
  input.seal.control.members.P1.faint={positiveOccurrences:[faint('control')],coverage:unavailable()};
  const r=resolveBattleEffects(input);const member={id:'P1',hp:10,readyToEvolve:true,evolutionReadiness:'unknown'};
  assert.deepEqual(planBattleReadiness({member,faint:r.faint.P1}),{readyToEvolve:false,evolutionReadiness:'known'});
  assert.deepEqual(planBattleReadiness({member,faint:r.faint.P1,damage:r.damage.P1,scan:{status:'complete',permitsNewReady:true}}),{readyToEvolve:true,evolutionReadiness:'known'});
});
test('a real hook omitted by complete observer faint coverage invalidates D reset proof and new R only',async()=>{
  const {resolveBattleEffects,planBattleReadiness}=await moduleUnderTest;
  for(const hasOtherHook of [false,true]){
    const input=fixture();
    if(hasOtherHook)input.seal.observer.members.P1.faint=faintCell([faint('observer','P1',{hookKey:'other-real-hook'})]);
    input.seal.control.members.P1.faint=faintCell([faint('control')]);
    const r=resolveBattleEffects(input);
    assert.equal(r.damage.P1.status,'invalid');assert.equal(Object.hasOwn(r.damage.P1,'value'),false);
    assert.equal(r.critical.P1.value,3);assert.equal(r.friendshipReplacements.P1,105);assert.equal(r.appearances.length,1);
    assert.equal(r.damage.P2.status,'complete');assert.equal(r.faint.P1.positiveOccurrences.length,hasOtherHook?2:1);
    assert.deepEqual(planBattleReadiness({member:{id:'P1',hp:10,readyToEvolve:false,evolutionReadiness:'known'},faint:r.faint.P1,damage:r.damage.P1,scan:{status:'complete',permitsNewReady:true}}),{readyToEvolve:false,evolutionReadiness:'known'});
    assert.equal(r.dispositions.filter(d=>d.memberId==='P1'&&d.group==='damage').length,1);
  }
});
test('R clear/unknown/no-new rules require complete D >=49, reset and actual scan permission',async()=>{
  const {planBattleReadiness}=await moduleUnderTest;const member={id:'P1',hp:10,readyToEvolve:true,evolutionReadiness:'known'};
  const missing={positiveOccurrences:[],coverage:unavailable()};
  assert.deepEqual(planBattleReadiness({member,faint:missing}),{readyToEvolve:true,evolutionReadiness:'unknown'});
  assert.deepEqual(planBattleReadiness({member:{...member,readyToEvolve:false},faint:missing}),{readyToEvolve:false,evolutionReadiness:'known'});
  for(const change of [{healed:true},{evolved:true},{member:{...member,hp:0}}])assert.deepEqual(planBattleReadiness({member,faint:missing,...change}),{readyToEvolve:false,evolutionReadiness:'known'});
  for(const damage of [complete({total:48,resetCoverage:'complete'}),unavailable(),complete({total:49,resetCoverage:'unavailable'})])assert.deepEqual(planBattleReadiness({member:{...member,readyToEvolve:false},faint:missing,damage,scan:{status:'complete',permitsNewReady:true}}),{readyToEvolve:false,evolutionReadiness:'known'});
  assert.deepEqual(planBattleReadiness({member:{...member,readyToEvolve:false},faint:missing,damage:complete({total:49,resetCoverage:'complete'})}),{readyToEvolve:false,evolutionReadiness:'known'});
});
