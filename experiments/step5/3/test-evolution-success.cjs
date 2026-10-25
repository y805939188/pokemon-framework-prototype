'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('./fixtures/evolution/helpers.cjs');
const {value:V}=F;
const resources=(extra={})=>({partySize:5,partyCapacity:6,pokeBall:{id:'pokeball',quantity:1},...extra});
async function selected(input){const {scanEvolution}=await F.rules;const selection=scanEvolution(input);assert.equal(selection.kind,'target');return selection;}
async function plan(input,options={}){const {planEvolutionSuccess}=await F.success;return planEvolutionSuccess({member:input.member,content:input.content,selection:await selected(input),...options});}

test('BE16–20/26 / P53-23 exact metadata retention and exp27000 Medium->Slow L27, HP0 remains 0',async()=>{
  const {computeStats}=await F.growth;
  for(const hp of [0,40]){
    const input=F.input([F.entry('Level',30)]);input.member.hp=hp;
    input.content.species.B=F.species({growth:'slow',base:{hp:100,atk:80,def:60,spa:90,spd:75,spe:90},learnset:{0:['Evolution One','Evolution Two'],27:['At Reassigned Level'],28:['Wrong Future'],30:['Wrong Old Level']}});
    const selection=await selected(input),before=JSON.stringify(input);
    const {planEvolutionSuccess}=await F.success;
    const out=planEvolutionSuccess(F.freeze({member:input.member,content:input.content,selection}));
    assert.equal(out.kind,'ready');assert.equal(out.member.exp,27000);assert.equal(out.member.level,27);
    const oldMax=computeStats(input.content.species.A.base,input.member.ivs,input.member.evs,30,'hardy').hp;
    const newMax=computeStats(input.content.species.B.base,input.member.ivs,input.member.evs,27,'hardy').hp;
    assert.equal(out.member.hp,hp===0?0:Math.max(1,Math.min(newMax,hp+newMax-oldMax)));
    for(const key of ['id','personalID','owner','origin','ownerCompatibilityDefault','nickname','nature','statNature','gender','ivs','evs','shiny','superShiny','ball','markings','ribbons','firstMoves','status','statusCount','moves','friendship','cannotStore','cannotRelease','cannotTrade','mail'])assert.deepEqual(out.member[key],input.member[key],key);
    assert.equal(out.member.readyToEvolve,false);assert.equal(out.member.evolutionReadiness,'known');
    assert.deepEqual(out.learning,{source:'evolution',moves:['Evolution One','Evolution Two','At Reassigned Level']});
    assert.equal(out.evolutionCount,1);assert.equal(JSON.stringify(input),before);
    out.member.owner.name='changed';out.member.moves[0].pp=0;assert.equal(input.member.owner.name,'Old OT');assert.equal(input.member.moves[0].pp,7);
    assert.equal('friendshipChange' in out,false);assert.equal('nextEvolution' in out,false);
  }
});

test('BE19/20 / P53-23 target form priority and fixed gender, normal gender retained',async()=>{
  for(const [entryForm,defaultForm,recordForm,oldForm,expected] of [[undefined,3,0,2,3],[2,undefined,2,1,2],[undefined,undefined,0,2,2],[0,undefined,0,2,2]]){
    const input=F.input([F.entry('Level',30,'B',{...(entryForm===undefined?{}:{form:entryForm})})]);input.member.form=oldForm;
    Object.assign(input.content.species.B,{form:recordForm,...(defaultForm===undefined?{}:{defaultForm})});
    const out=await plan(input);assert.equal(out.kind,'ready');assert.equal(out.member.form,expected);assert.equal(out.member.gender,'M');
  }
  for(const gender of ['F','M','N']){
    const input=F.input([F.entry('Level',30)]);input.content.species.B.gender=gender;
    assert.equal((await plan(input)).member.gender,gender);
  }
});

test('P53-23 requested/effective ability slots preserve missing hidden fallback and legal empty slots',async()=>{
  const input=F.input([F.entry('Level',30)]);input.member.abilityIndex=3;input.member.personalID=1;
  input.content.species.B=F.species({abilities:['Target A','Target B'],hiddenAbilities:['Target H']});
  const fallback=await plan(input);assert.equal(fallback.kind,'ready');assert.equal(fallback.member.ability,'Target B');assert.equal(fallback.member.abilityIndex,3);assert.equal(fallback.member.effectiveAbilityIndex,1);
  input.member.abilityIndex=2;const hidden=await plan(input);assert.equal(hidden.member.ability,'Target H');assert.equal(hidden.member.effectiveAbilityIndex,2);
  for(const abilities of [[],[null]]){
    input.content.species.B=F.species({abilities,hiddenAbilities:[]});input.member.abilityIndex=0;
    const empty=await plan(input);assert.equal(empty.kind,'ready');assert.equal(empty.member.ability,'');assert.equal(empty.member.abilityIndex,0);assert.equal(empty.member.effectiveAbilityIndex,null);
  }
});

test('D53-04c / P53-23 null ability unique, ambiguous minimum, trusted override and unknown rejection',async()=>{
  const input=F.input([F.entry('Level',30)]);input.member.abilityIndex=null;input.member.effectiveAbilityIndex=null;
  input.content.species.B=F.species({abilities:['Target A','Target B'],hiddenAbilities:['Target H']});
  let out=await plan(input);assert.equal(out.kind,'ready');assert.equal(out.member.abilityIndex,0);assert.equal(out.member.ability,'Target A');
  input.content.species.A.abilities=['Run Away','Run Away'];input.content.species.A.hiddenAbilities=['Run Away'];
  out=await plan(input);assert.equal(out.member.abilityIndex,0);assert.ok(out.diagnostics.includes('ambiguous-ability-slot:using-0'));
  input.member.ability='Trusted';out=await plan(input);assert.equal(out.kind,'ready');assert.equal(out.member.ability,'Trusted');assert.equal(out.member.abilityIndex,null);assert.equal(out.member.effectiveAbilityIndex,null);
  input.member.ability='Unknown Override';out=await plan(input);assert.equal(out.kind,'invalid');assert.equal(out.reason,'unknown-trusted-ability-override');
  assert.equal(input.member.abilityIndex,null);assert.equal(input.member.ability,'Unknown Override');
});

test('BE25/35 / P53-21/23 post consumption matches actual target and current held item, not old condition',async()=>{
  const input=F.input([F.entry('DayHoldItem','waterstone','B'),F.entry('HoldItem','waterstone','C')]);
  const selection=await selected(input),{planEvolutionSuccess}=await F.success;
  input.facts.hour=V(23); // selection latched; successful post action does not recheck day.
  let out=planEvolutionSuccess({member:input.member,content:input.content,selection});
  assert.equal(out.member.item,'');assert.equal(out.afterAction.kind,'consume-held-item');assert.equal(out.afterAction.entryIndex,0);
  input.member.item='firestone';out=planEvolutionSuccess({member:input.member,content:input.content,selection});assert.equal(out.member.item,'firestone');assert.equal(out.afterAction.kind,'none');
  input.member.item='waterstone';input.content.species.A.evolutions.unshift(F.entry('HoldItem','waterstone','C'));
  const newSelection=await selected(input); // first entry C now wins.
  out=planEvolutionSuccess({member:input.member,content:input.content,selection:newSelection});assert.equal(out.afterAction.entryIndex,0);assert.equal(out.member.species,'C');
  const trade=F.input([F.entry('TradeItem','waterstone')],{trigger:{family:'trade',partner:F.member({id:'M2',item:'other'})}});
  const tradeOut=await plan(trade);assert.equal(tradeOut.member.item,'');assert.equal(trade.trigger.partner.item,'other');
});

test('BE22/CX37 / P53-24 Shedinja body uses old individual, has no ID/ordinal, heals and clears specific fields',async()=>{
  const input=F.input([F.entry('Ninjask',30),F.entry('Shedinja',undefined,'Extra')]);
  const original=JSON.stringify(input),out=await plan(input,{resources:resources()});
  assert.equal(out.kind,'ready');assert.equal(out.member.species,'B');assert.equal(out.member.nickname,'Buddy');assert.equal(out.member.item,'waterstone');
  assert.equal(out.afterAction.kind,'extra-member');const draft=out.afterAction.draft.member;
  assert.equal(draft.species,'Extra');assert.equal('id' in draft,false);assert.equal('nextMemberOrdinal' in out,false);
  assert.equal(draft.personalID,input.member.personalID);assert.deepEqual(draft.owner,input.member.owner);assert.deepEqual(draft.origin,input.member.origin);
  assert.equal(draft.nickname,null);assert.deepEqual(draft.markings,[]);assert.deepEqual(draft.ribbons,[]);assert.equal(draft.item,'');assert.equal(draft.ball,'pokeball');
  assert.equal(draft.hp,1);assert.equal(draft.status,'');assert.equal(draft.statusCount,0);assert.equal(draft.moves[0].pp,30);assert.equal(draft.moves[0].ppUps,0);
  assert.equal(draft.readyToEvolve,false);assert.equal(draft.evolutionReadiness,'known');assert.deepEqual(draft.firstMoves,input.member.firstMoves);
  assert.deepEqual(out.afterAction.draft.ballCost,{item:'pokeball',quantity:1});assert.equal(JSON.stringify(input),original);
  draft.owner.name='independent';assert.equal(input.member.owner.name,'Old OT');assert.equal(out.member.owner.name,'Old OT');
});

test('BE23/24 / P53-24 space before ball; full/no-ball skip copy and keep primary success',async()=>{
  const input=F.input([F.entry('Ninjask',30),F.entry('Shedinja',undefined,'Extra')]);
  const full={partySize:6,partyCapacity:6,get pokeBall(){throw Error('full must short circuit inventory');}};
  const out=await plan(input,{resources:full});assert.equal(out.kind,'ready');assert.equal(out.afterAction.extraSkipped,'party-full');assert.equal(out.member.species,'B');
  const noBall=await plan(input,{resources:resources({pokeBall:{id:'pokeball',quantity:0}})});assert.equal(noBall.kind,'ready');assert.equal(noBall.afterAction.extraSkipped,'no-poke-ball');
  const unknown=await plan(input);assert.equal(unknown.kind,'context-unavailable');
  assert.equal(input.member.species,'A');
});

test('BE16/25 / P53-24 old-order first successful post handler wins',async()=>{
  for(const extraFirst of [true,false]){
    const held=F.entry('HoldItem','waterstone'),extra=F.entry('Shedinja',undefined,'Extra');
    const input=F.input(extraFirst?[extra,held]:[held,extra]);
    const out=await plan(input,{resources:resources()});assert.equal(out.kind,'ready');
    assert.equal(out.afterAction.kind,extraFirst?'extra-member':'consume-held-item');assert.equal(out.member.item,extraFirst?'waterstone':'');
  }
});

test('P53-19/23 selected destination remains latched and stale member/entry refuses without writes',async()=>{
  const input=F.input([F.entry('LevelDay',30)]);input.content.species.A.ruleSpecies='Pikachu';
  const selection=await selected(input),{planEvolutionSuccess}=await F.success;
  input.facts.hour=()=>{throw Error('must not re-read');};input.facts.mapMetadata={status:'unavailable'};
  let out=planEvolutionSuccess({member:input.member,content:input.content,selection});assert.equal(out.kind,'ready');assert.equal(out.member.form,1);
  const original=JSON.stringify(input.member);out=planEvolutionSuccess({member:{...input.member,id:'M2'},content:input.content,selection});assert.equal(out.kind,'invalid');
  input.content.species.A.evolutions[0].parameter=31;out=planEvolutionSuccess({member:input.member,content:input.content,selection});assert.equal(out.kind,'invalid');assert.equal(JSON.stringify(input.member),original);
});

test('BE11/12/21 / P53-22 pure completion permission: cancel has no success plan; technical abort not cancellation',async()=>{
  const {decideEvolutionCompletion}=await F.success;
  for(const family of ['level','battle','event','item','trade']){
    const method=family==='level'?'Level':family==='battle'?'BattleDealCriticalHit':family==='event'?'Event':family==='item'?'Item':'Trade';
    const parameter=family==='item'?'waterstone':family==='trade'?undefined:family==='event'?2:family==='battle'?3:30;
    const input=F.input([F.entry(method,parameter)],{trigger:{family,item:'waterstone',event:2}});const selection=await selected(input),before=JSON.stringify(input);
    assert.deepEqual(decideEvolutionCompletion(selection,'cancel'),{kind:['item','trade'].includes(family)?'continue':'cancelled',cancellationCount:['item','trade'].includes(family)?0:1});
    assert.deepEqual(decideEvolutionCompletion(selection,'technical-terminate'),{kind:'technically-terminated',cancellationCount:0});
    assert.deepEqual(decideEvolutionCompletion(selection,'complete'),{kind:'success',cancellationCount:0});assert.equal(JSON.stringify(input),before);
  }
});
