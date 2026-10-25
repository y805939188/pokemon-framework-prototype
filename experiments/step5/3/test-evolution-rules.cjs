'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('./fixtures/evolution/helpers.cjs');
const {value:V}=F;

test('P53-17 all 64 B method identities have explicit D execution registrations',async()=>{
  const {EVOLUTION_METHODS}=await F.data;
  assert.equal(EVOLUTION_METHODS.length,64);
  assert.deepEqual(Object.keys(F.methods).sort(),EVOLUTION_METHODS.map(row=>row.id).sort());
});
for(const [method,scenario] of Object.entries(F.methods)) {
  test(`WP31 method ${method}: named formal-derived positive and refusal`,async()=>{
    const {scanEvolution}=await F.rules;
    const input=F.methodInput(method),before=JSON.stringify(input);
    assert.equal(scanEvolution(F.freeze(input)).kind,scenario.noTarget?'no-target':'target');
    assert.equal(JSON.stringify(input),before);
    assert.equal(scanEvolution(F.methodInput(method,true)).kind,'no-target');
  });
}
for(const [method,miss] of Object.entries(F.secondaryMisses))test(`WP31 ${method}: independent secondary condition refuses at valid threshold`,async()=>{
  const {scanEvolution}=await F.rules;const input=F.methodInput(method);
  Object.assign(input.member,miss.member);Object.assign(input.facts,miss.facts);
  if(miss.party)input.party=miss.party;
  if(miss.stats)Object.assign(input.content.species.A.base,miss.stats);
  if(miss.partnerItem)input.trigger.partner.item=miss.partnerItem;
  assert.equal(scanEvolution(input).kind,'no-target');
});

test('BE07–10 / P53-17 guards precede all five families and do not read facts',async()=>{
  const {scanEvolution,planPostBattleEvolution}=await F.rules;
  let reads=0;
  for(const family of ['level','item','trade','battle','event'])for(const change of [{isEgg:true},{item:'Everstone'},{ability:'Battle Bond'},{shadow:true}]){
    const input=F.input([F.entry('LevelRain',1),F.entry('ItemDay','waterstone'),F.entry('TradeDay',undefined),F.entry('BattleDealCriticalHit',0),F.entry('Event',2)]);
    input.trigger={family,item:'waterstone',event:2};Object.assign(input.member,change);input.shadow=!!change.shadow;
    input.facts={hour:()=>{reads++;throw Error();},weather:()=>{reads++;throw Error();},criticalHits:()=>{reads++;throw Error();}};
    assert.equal(scanEvolution(input).kind,'no-target');
    assert.equal(planPostBattleEvolution({...input,levelBefore:()=>{reads++;throw Error();}}).kind,'no-target');
  }
  assert.equal(reads,0);
});

test('BE01–06 / P53-17 first-hit, current form and family isolation',async()=>{
  const {scanEvolution}=await F.rules;
  const input=F.input([F.entry('LevelRain',30,'C'),F.entry('Item','waterstone')]);
  input.facts.weather=()=>{throw Error('must not query unrelated family');};
  input.trigger={family:'item',item:'waterstone'};
  assert.equal(scanEvolution(input).target.species,'B');
  input.content=F.content([F.entry('Level',30,'B'),F.entry('LevelRain',30,'C')]);input.trigger={family:'level'};
  assert.equal(scanEvolution(input).target.species,'B');
  input.content.forms={A:{0:'A',1:'A-1'},B:{0:'B'},C:{0:'C'}};
  input.content.species['A-1']=F.species({form:1,evolutions:[F.entry('Level',30,'C')]});input.member.form=1;
  assert.equal(scanEvolution(input).target.species,'C');
  input.content.species['A-1'].evolutions=[F.entry('None',undefined),F.entry('Shedinja',undefined)];
  assert.equal(scanEvolution(input).kind,'no-target');
});

test('P53-19/20 four-state facts and necessary-condition short circuit',async()=>{
  const {scanEvolution}=await F.rules;
  const input=F.input([F.entry('LevelRain',31,'C'),F.entry('HappinessDay',undefined)]);
  let reads=0;input.facts.weather=()=>{reads++;return {status:'invalid'};};
  assert.equal(scanEvolution(input).target.species,'B');assert.equal(reads,0);
  input.member.level=31;
  for(const status of ['unavailable','invalid']){
    input.facts.weather={status};const result=scanEvolution(input);
    assert.equal(result.kind,status==='unavailable'?'context-unavailable':'invalid');assert.equal(result.entryIndex,0);
  }
  input.facts.weather=V('None');assert.equal(scanEvolution(input).target.species,'B');
  input.facts.weather=V('NonexistentWeather');assert.equal(scanEvolution(input).kind,'invalid');
  input.facts.weather={status:'absent'};assert.equal(scanEvolution(input).target.species,'B');
});

test('P53-19 Eevee metadata absent allows later happiness; unavailable/invalid cannot guess',async()=>{
  const {scanEvolution}=await F.rules;
  const input=F.input([F.entry('LocationFlag','MossRock','C'),F.entry('HappinessDay',undefined)]);
  input.facts.mapMetadata={status:'absent'};
  assert.equal(scanEvolution(input).target.species,'B');
  for(const [fact,kind] of [[{status:'unavailable'},'context-unavailable'],[{status:'invalid'},'invalid'],[V({flags:'MossRock'}),'invalid']]){
    input.facts.mapMetadata=fact;assert.equal(scanEvolution(input).kind,kind);
  }
  input.facts.mapMetadata=V({flags:['mOsSrOcK']});assert.equal(scanEvolution(input).target.species,'C');
  for(const method of ['LevelDarkness','Region']){
    input.content=F.content([F.entry(method,method==='Region'?0:30)]);input.facts.mapMetadata={status:'absent'};
    assert.equal(scanEvolution(input).kind,'no-target');
  }
  input.content=F.content([F.entry('Location',0)]);input.facts.mapId={status:'absent'};assert.equal(scanEvolution(input).kind,'invalid');
  input.facts.mapId=V(0);assert.equal(scanEvolution(input).kind,'invalid');
});

test('CX01–05 / P53-19 hour boundaries use explicit clock without host time',async()=>{
  const {scanEvolution}=await F.rules;
  const expected={Day:[5,6,9,10,13,14,16,17,19],Night:[0,4,20,23],Morning:[5,6,9],Afternoon:[14,16],Evening:[17,19]};
  for(const [period,hit] of Object.entries(expected))for(const hour of [0,4,5,6,9,10,13,14,16,17,19,20,23]){
    const input=F.input([F.entry('Level'+period,30)]);input.facts.hour=V(hour);
    assert.equal(scanEvolution(input).kind,hit.includes(hour)?'target':'no-target',`${period} at ${hour}`);
  }
  for(const hour of [-1,24,NaN,1.5])assert.equal(scanEvolution(F.input([F.entry('LevelDay',30)],{facts:{hour:V(hour)}})).kind,'invalid');
});

test('CX06–08 / P53-19 exact world weather mapping, missing system is never None',async()=>{
  const {scanEvolution}=await F.rules;
  for(const [weather,method] of Object.entries({None:'LevelNoWeather',Sun:'LevelSun',Rain:'LevelRain',Storm:'LevelRain',HeavyRain:'LevelRain',Fog:'LevelRain',Snow:'LevelSnow',Blizzard:'LevelSnow',Sandstorm:'LevelSandstorm'})){
    const input=F.input([F.entry(method,30)]);input.facts.weather=V(weather);assert.equal(scanEvolution(input).kind,'target');
  }
  assert.equal(scanEvolution(F.input([F.entry('LevelNoWeather',30)],{facts:{}})).kind,'context-unavailable');
});

test('P53-18 threshold equality, soft cap and Max255 keep h256 raw',async()=>{
  const {scanEvolution}=await F.rules;
  for(const [friendship,softCap,expected] of [[159,true,false],[160,true,true],[219,false,false],[220,false,true],[256,false,true]]){
    const input=F.input([F.entry('Happiness',undefined)],{member:F.member({friendship}),friendshipSoftCap:softCap});
    assert.equal(scanEvolution(input).kind,expected?'target':'no-target');
  }
  assert.equal(scanEvolution(F.input([F.entry('MaxHappiness',undefined)],{member:F.member({friendship:256})})).kind,'no-target');
  const pidA=F.input([F.entry('Silcoon',30)]),pidB=F.input([F.entry('Cascoon',30)]);
  for(const [pid,which] of [[10000*65536,'A'],[10005*65536,'B'],[0,'A']]){
    pidA.member.personalID=pid;pidB.member.personalID=pid;assert.equal(scanEvolution(which==='A'?pidA:pidB).kind,'target');
  }
});

test('CX09–10 / P53-18 party includes self and fainted, excludes eggs, uses current content types',async()=>{
  const {scanEvolution}=await F.rules;
  for(const method of ['HasInParty','LevelDarkInParty']){
    const input=F.input([F.entry(method,method==='HasInParty'?'A':30)]);
    input.party=[F.member({hp:0})];assert.equal(scanEvolution(input).kind,'target');
    input.party=[F.member({isEgg:true})];assert.equal(scanEvolution(input).kind,'no-target');
    input.party=undefined;assert.equal(scanEvolution(input).kind,'context-unavailable');
  }
});

test('CX30–34 / P53-21 TradeSpecies compares incoming self and only reads partner after self match',async()=>{
  const {scanEvolution}=await F.rules;
  const input=F.input([F.entry('TradeSpecies','C')],{trigger:{family:'trade',partner:null}});
  assert.equal(scanEvolution(input).kind,'no-target');
  input.content.species.A.evolutions=[F.entry('TradeSpecies','A')];assert.equal(scanEvolution(input).kind,'invalid');
  input.trigger.partner=F.member({species:'C',item:''});assert.equal(scanEvolution(input).kind,'target');
  input.trigger.partner.item='everstone';assert.equal(scanEvolution(input).kind,'no-target');
  assert.equal(input.trigger.partner.item,'everstone');
});

test('BE29/CX29 / P53-20 complete battle plan owns tentative R; unknown never leaks it',async()=>{
  const {scanEvolution,planPostBattleEvolution}=await F.rules;
  const input=F.input([F.entry('EventAfterDamageTaken',2),F.entry('BattleDealCriticalHit',3)],{member:F.member({readyToEvolve:false}),trigger:{family:'battle'}});
  input.facts.criticalHits={status:'unavailable'};
  assert.equal(scanEvolution(input).kind,'context-unavailable');assert.equal(scanEvolution(input).readiness,undefined);assert.equal(input.member.readyToEvolve,false);
  input.facts.criticalHits=V(2);assert.deepEqual(scanEvolution(input).readiness,{readyToEvolve:true,evolutionReadiness:'known'});
  input.facts.damageTaken=V(48);assert.equal(scanEvolution(input).readiness,undefined);
  input.content.species.A.evolutions.unshift(F.entry('LevelRain',30));input.facts.damageTaken=V(49);input.facts.weather={status:'unavailable'};
  assert.equal(planPostBattleEvolution({...input,levelBefore:V(29)}).kind,'context-unavailable');
  assert.equal(planPostBattleEvolution({...input,levelBefore:V(30)}).readiness.readyToEvolve,true);
  input.facts.weather=V('Rain');assert.equal(planPostBattleEvolution({...input,levelBefore:V(29)}).family,'level');
  input.content.species.A.evolutions=[F.entry('BattleDealCriticalHit',3),F.entry('EventAfterDamageTaken',2)];input.facts.criticalHits=V(3);input.facts.damageTaken={status:'invalid'};
  assert.equal(scanEvolution(input).kind,'target');
});

test('P53-19/20 unavailable and invalid are explicit; thrown/malformed providers cannot become false',async()=>{
  const {scanEvolution}=await F.rules;
  const input=F.input([F.entry('LevelRain',30),F.entry('Level',30,'C')]);
  for(const fact of [()=>{throw Error('world failure');},V(0),{status:'bogus'},V('Unknown')]){
    input.facts.weather=fact;assert.equal(scanEvolution(input).kind,'invalid');
  }
  input.facts.weather=undefined;assert.equal(scanEvolution(input).kind,'context-unavailable');
  input.content.species.A.evolutions=[F.entry('Level',-1)];assert.equal(scanEvolution(input).kind,'invalid');
  input.content.species.A.evolutions=[F.entry('UnknownMethod',0)];assert.equal(scanEvolution(input).kind,'invalid');
  const lowHappy=F.input([F.entry('HappinessMoveType','Water')],{member:F.member({friendship:159}),friendshipSoftCap:true});
  lowHappy.facts.moveTypes=()=>{throw Error('known low happiness must short circuit');};assert.equal(scanEvolution(lowHappy).kind,'no-target');
});

test('P53-20 damaged expected L0 differs from legal captured absence and independent members',async()=>{
  const {planPostBattleEvolution}=await F.rules;
  const input=F.input([F.entry('LevelRain',30),F.entry('BattleDealCriticalHit',3)]);
  input.facts.weather={status:'unavailable'};
  assert.equal(planPostBattleEvolution({...input,levelBefore:{status:'unavailable'}}).kind,'context-unavailable');
  input.facts.criticalHits={status:'absent'};input.facts.damageTaken={status:'absent'};
  assert.equal(planPostBattleEvolution({...input,levelBefore:{status:'absent'}}).kind,'no-target');
  const independent=F.input([F.entry('Level',30)]);
  assert.equal(planPostBattleEvolution({...independent,levelBefore:V(29)}).kind,'target');
});

test('CX27–29 / P53-20 faint eligibility accepts caller logical HP and default checks fainted',async()=>{
  const {planPostBattleEvolution}=await F.rules;
  const input=F.input([F.entry('Level',30)]);
  assert.equal(planPostBattleEvolution({...input,levelBefore:V(29),checkFainted:false,eligibleHp:0}).kind,'no-target');
  assert.equal(planPostBattleEvolution({...input,levelBefore:V(29),checkFainted:false,eligibleHp:40}).kind,'target');
  input.member.hp=0;assert.equal(planPostBattleEvolution({...input,levelBefore:V(29)}).kind,'target');
});

test('CX30–31 / P53-21 event number can repeat and R unknown only blocks matching R-dependent event',async()=>{
  const {scanEvolution}=await F.rules;
  const input=F.input([F.entry('EventAfterDamageTaken',2),F.entry('Event',0,'C')],{trigger:{family:'event',event:2}});
  assert.equal(scanEvolution(input).kind,'target');assert.equal(scanEvolution(input).kind,'target');
  input.member.evolutionReadiness='unknown';assert.equal(scanEvolution(input).kind,'context-unavailable');
  input.trigger={family:'event'};assert.equal(scanEvolution(input).target.species,'C');
  input.trigger.event=-1;assert.equal(scanEvolution(input).kind,'invalid');
});

test('P53-19/23 regional destinations use ruleSpecies, metadata absence and stored >=2 lock',async()=>{
  const {scanEvolution}=await F.rules;
  const input=F.input([F.entry('Level',30)]);input.content.species.A.ruleSpecies='Pikachu';
  assert.equal(scanEvolution(input).target.form,1);
  input.facts.mapMetadata={status:'absent'};assert.equal(scanEvolution(input).target.form,0);
  input.facts.mapMetadata={status:'unavailable'};assert.equal(scanEvolution(input).kind,'context-unavailable');
  input.member.form=2;assert.equal(scanEvolution(input).target.form,2);
  input.member.form=0;input.content.species.B.defaultForm=3;assert.equal(scanEvolution(input).target.form,3);
  delete input.content.species.B.defaultForm;input.content.species.A.ruleSpecies='Koffing';input.facts.mapMetadata=V({region:2});assert.equal(scanEvolution(input).target.form,1);
});

test('CX11–19 / P53-44 normalized facts include substitute/confusion and reset D without clearing K',async()=>{
  const {applyEvolutionBattleFact:step}=await F.rules;
  const empty=F.freeze({criticalHits:0,damageTaken:0});
  const crit={kind:'critical-hit',playerOwned:true,critical:true,unaffected:false,absorbed:false};
  let record=step(empty,crit);record=step(record,crit);record=step(record,crit);assert.equal(record.criticalHits,3);
  for(const partial of [{absorbed:true},{unaffected:true},{playerOwned:false},{critical:false}])assert.deepEqual(step(record,{...crit,...partial}),record);
  record=step(record,{kind:'direct-damage',playerOwned:true,hpLost:30});record=step(record,{kind:'direct-damage',playerOwned:true,hpLost:19});assert.equal(record.damageTaken,49);
  record=step(record,{kind:'other-hp-loss'});assert.equal(record.damageTaken,49);
  record=step(record,{kind:'faint',playerOwned:true});assert.deepEqual(record,{criticalHits:3,damageTaken:0});
  record=step(record,{kind:'direct-damage',playerOwned:true,hpLost:12});assert.equal(record.damageTaken,12);
  assert.deepEqual(empty,{criticalHits:0,damageTaken:0});
  assert.throws(()=>step(record,{kind:'direct-damage',playerOwned:true,hpLost:-1}),RangeError);
  assert.throws(()=>step({criticalHits:Number.MAX_SAFE_INTEGER,damageTaken:0},crit),RangeError);
});
