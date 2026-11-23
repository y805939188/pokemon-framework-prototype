'use strict';
// Explicit arithmetic/prefix vectors against the existing production selector/trigger. No statistical harness.
const test=require('node:test'),assert=require('node:assert/strict');
const E=require(process.env.PF_FLUTE_ENGINE||'../../../js/engine/build/production.cjs'),R=E.encounterSelection,T=E.encounterTrigger;
const slot=(min=50,max=min)=>({species:'A',weight:100,minLevel:min,maxLevel:max});
function tape(values){let at=0;const calls=[];const random=n=>{assert(at<values.length,'extra draw '+n);const v=values[at++];assert(v>=0&&v<n);calls.push([n,v]);return v;};random.calls=calls;random.done=()=>assert.equal(at,values.length);return random;}
const lead=ability=>({isEgg:false,hp:10,level:5,ability,item:''});
for(const [flag,sign,bound]of [['lowerWildLevel',-1,1],['higherWildLevel',1,100]])test('flute consumer '+flag+' every delta and clamped limit retain exact range4 draw',()=>{
 for(let delta=0;delta<4;delta++)for(const base of [50,bound]){const rng=tape([0,delta]);assert.equal(R.selectEncounterLevel(slot(base),[],{lowerWildLevel:false,higherWildLevel:false,[flag]:true},rng),Math.max(1,Math.min(100,base+sign*(delta+1))));assert.deepEqual(rng.calls,[[1,0],[4,delta]]);rng.done();}
});
test('flute consumer base -> supported lead ability -> effect order and lower-first both flag branch',()=>{
 for(const ability of ['Hustle','Pressure','Vital Spirit'])for(const flags of [{lowerWildLevel:true,higherWildLevel:false},{lowerWildLevel:false,higherWildLevel:true},{lowerWildLevel:true,higherWildLevel:true}]){const rng=tape([0,0,3]);assert.equal(R.selectEncounterLevel(slot(5,8),[lead(ability)],flags,rng),flags.lowerWildLevel?4:12);assert.deepEqual(rng.calls,[[4,0],[100,0],[4,3]]);rng.done();}
 const rng=tape([2,49,0]);assert.equal(R.selectEncounterLevel(slot(5,8),[lead('Hustle')],{higherWildLevel:true,lowerWildLevel:false},rng),9);assert.deepEqual(rng.calls,[[4,2],[100,49],[4,0]]);
});
test('flute inactive or rate-only local effects add no level draw and Guts adds no ability draw',()=>{
 for(const flags of [{},{lowerEncounterRate:true},{higherEncounterRate:true},{lowerEncounterRate:true,higherEncounterRate:true}]){const rng=tape([2]);assert.equal(R.selectEncounterLevel(slot(5,8),[lead('Guts')],{lowerWildLevel:false,higherWildLevel:false,...flags},rng),7);assert.deepEqual(rng.calls,[[4,2]]);rng.done();}
});
test('flute selected table prefix retains weighted slot, base, lead and effect ranges',()=>{
 const rng=tape([99,1,50,2]),table={stepChance:20,slots:[slot(5,8)]};const actual=R.selectEncounterCandidate(table,{party:[lead('Pressure')],moreAbilities:true,registeredTypes:[],speciesTypes:{A:['Normal']},local:{higherWildLevel:true,lowerWildLevel:false}},rng);
 assert.deepEqual(actual,{species:'A',level:9});assert.deepEqual(rng.calls,[[100,99],[4,1],[100,50],[4,2]]);rng.done();
});
test('flute rate colors retain probability/minimum steps, lower priority and grace rejection prefixes',()=>{
 const base={type:'Land',table:{stepChance:20,slots:[slot()]},runtime:{accumulator:0,graceSteps:0},party:[],weatherCategory:'None',moreAbilities:false,disabled:false,playerPresent:true,debugControl:false,fromStep:true,cycling:false,repelActive:false};
 for(const [local,chance,minimum,threshold]of [[{lowerEncounterRate:true,higherEncounterRate:false},10,12,2.5],[{lowerEncounterRate:false,higherEncounterRate:true},30,3,7.5],[{lowerEncounterRate:true,higherEncounterRate:true},10,12,2.5]]){
  const input={...base,local};assert.deepEqual(T.encounterProbability(input),{chance,minimumSteps:minimum,graceThreshold:threshold});const rng=tape([99]);const result=T.checkEncounterTrigger(input,rng);assert.equal(result.triggered,false);assert.equal(result.reason,'grace');assert.deepEqual(result.runtime,{accumulator:0,graceSteps:1});assert.deepEqual(rng.calls,[[100,99]]);rng.done();
 }
});
