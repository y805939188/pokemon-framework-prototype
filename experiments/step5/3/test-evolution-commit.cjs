'use strict';
// Approved 5.3 r3 §7.2 / E2b. Formal-spec-derived expectations; no Ruby or host-runtime claims.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {resolve}=require('node:path');
const F=require('./fixtures/evolution/helpers.cjs'); // Registers the Node 22 TS source loader, never a shared build.
const leaf=name=>import(pathToFileURL(resolve(__dirname,'../../../src/framework/rules',name+'.ts')));
const loaded=Promise.all(['evolution-commit','evolution','evolution-success','state','dex-state','save-schema','inventory','growth'].map(leaf));
const clone=value=>JSON.parse(JSON.stringify(value));
const item=(id,battleId,battleUse='ball')=>({id,name:id,namePlural:id,pocket:battleUse==='ball'?3:1,order:1,price:1,sellPrice:0,
  flags:battleUse==='ball'?['PokeBall']:[],fieldUse:'none',battleUse,...(battleId===undefined?{}:{battleId}),legacyIds:[],consumable:true,source:'spec-derived-e2b'});
const normal=()=>[F.entry('Level',30,'target-species')];
const split=()=>[F.entry('Ninjask',30,'target-species'),F.entry('Shedinja',undefined,'extra-species')];
async function fixture({entries=normal(),partySize=1,balls=2}={}){
  const [C,D,Success,S,Dex,V,I,G]=await loaded;
  const content={species:{
    SourceMon:F.species({contentId:'origin-species',form:0,evolutions:entries}),
    TargetMon:F.species({contentId:'target-species',form:0,base:{hp:95,atk:80,def:70,spa:100,spd:85,spe:90},abilities:['Target A','Target B'],hiddenAbilities:['Target H'],learnset:{0:['Target zero'],27:['Target twenty-seven'],30:['Target thirty']}}),
    ExtraMon:F.species({contentId:'extra-species',form:0,base:{hp:1,atk:90,def:45,spa:30,spd:30,spe:40},abilities:['Wonder Guard'],gender:'N'}),
  },forms:{'origin-species':{0:'SourceMon'},'target-species':{0:'TargetMon'},'extra-species':{0:'ExtraMon'}},
    speciesKeys:{SourceMon:{species:'origin-species',form:0},TargetMon:{species:'target-species',form:0},ExtraMon:{species:'extra-species',form:0}},
    moves:Object.fromEntries([['Bubble','bubble',30],['Growl','growl',40],['Tackle','tackle',35],['Splash','splash',40],['Target zero','targetzero',10],['Target twenty-seven','target27',15],['Target thirty','target30',20]].map(([name,id,pp])=>[name,{name,id,pp}])),
    abilities:Object.fromEntries(['Run Away','Adaptability','Anticipation','Target A','Target B','Target H','Trusted','Wonder Guard'].map(name=>[name,{id:name.toLowerCase().replaceAll(' ',''),name}])),
    items:{'plain-sphere':item('plain-sphere','pokeball'),'luxury-sphere':item('luxury-sphere','luxuryball'),'master-sphere':item('master-sphere','masterball'),
      'supply-a':item('supply-a',undefined,'none'),'supply-b':item('supply-b',undefined,'none')},
  };
  const layout={national:['origin-species','target-species','extra-species'],regions:[]};
  content.regionalDex={...layout,layoutIdentity:Dex.dexLayoutIdentity(layout)};
  const state=S.newGame({party:Array.from({length:partySize},(_,i)=>F.member({id:'M'+(i+1),species:'origin-species',ball:'luxury-sphere',item:'supply-a'})),
    content,bag:balls?{'plain-sphere':balls}:{},money:117});
  state.stats.evolution_count=7;state.steps=88;state.appliedBattles.prior={hash:'a'.repeat(64)};
  state.dex.seen=['origin-species'];state.dex.owned=['origin-species'];state.dex.capturedCounts['origin-species']=5;
  const f={C,D,Success,S,Dex,V,I,G,content,state};
  assert.deepEqual(V.validateGameContent(state,content),[],'the starting fixture must pass the real schema/content gate');
  f.select=()=>{const selection=D.scanEvolution({member:state.party[0],content,trigger:{family:'level'},facts:F.facts(),party:state.party});assert.equal(selection.kind,'target');return selection;};
  f.commit=(selection=f.select(),options={})=>C.planEvolutionCommit({state,memberId:'M1',selection,content,...options});
  return f;
}
function ready(f,result){assert.equal(result.status,'ready',JSON.stringify(result));assert.deepEqual(f.V.validateGameContent(result.state,f.content),[]);return result.state;}
function noPatch(f,result,original){assert.equal(result.status,'refused',JSON.stringify(result));assert.equal('state'in result,false);assert.equal('patch'in result,false);assert.equal(JSON.stringify(f.state),original);}

test('P53-23 complete main plan delegates individual conversion to D, bumps one statistic and uses F evolution registration',async()=>{
  const f=await fixture(),selection=f.select(),before=clone(f.state),source=clone(f.state.party[0]);
  const direct=f.Success.planEvolutionSuccess({member:f.state.party[0],selection,content:f.content});assert.equal(direct.kind,'ready');
  const result=f.commit(selection),next=ready(f,result),member=next.party[0];
  assert.deepEqual(member,direct.member);assert.equal(member.species,'target-species');assert.equal(member.id,source.id);assert.equal(member.personalID,source.personalID);
  for(const key of ['owner','origin','nickname','nature','statNature','ivs','evs','shiny','superShiny','ball','markings','ribbons','firstMoves','friendship','moves','status','statusCount','exp'])assert.deepEqual(member[key],source[key],key);
  assert.equal(member.readyToEvolve,false);assert.equal(member.evolutionReadiness,'known');assert.equal(member.ability,'Target A');
  assert.deepEqual(result.learning,{source:'evolution',moves:['Target zero','Target thirty']});assert.equal(member.moves.some(m=>m.id==='targetzero'),false,'learning is an intent, not an installed choice');
  assert.equal(next.stats.evolution_count,8);assert.equal(next.nextMemberOrdinal,before.nextMemberOrdinal);assert.deepEqual(next.inventory,before.inventory);
  assert.deepEqual(next.dex.seen,['origin-species','target-species']);assert.deepEqual(next.dex.owned,['origin-species','target-species']);
  assert.deepEqual(next.dex.seenForms['target-species'],[{gender:0,form:0,shiny:true}]);assert.deepEqual(next.dex.lastSeenForm['target-species'],{gender:0,form:0,shiny:true});
  assert.deepEqual(next.dex.capturedCounts,before.dex.capturedCounts);assert.deepEqual(next.dex.defeatedCounts,before.dex.defeatedCounts);assert.deepEqual(next.appliedBattles,before.appliedBattles);
  assert.deepEqual(f.state,before);assert.equal('extraMemberId'in result,false);
});

test('P53-23 cross-curve exp27000 remains fixed, derives Slow L27 and learning uses that current level',async()=>{
  const f=await fixture();f.content.species.TargetMon.growth='slow';const before=JSON.stringify(f.state);
  const result=f.commit(),next=ready(f,result),member=next.party[0];
  assert.equal(member.exp,27000);assert.equal(member.level,27);assert.equal(f.G.minExp('slow',28),27440);
  const old=f.G.computeStats(f.content.species.SourceMon.base,member.ivs,member.evs,30,'hardy');
  const target=f.G.computeStats(f.content.species.TargetMon.base,member.ivs,member.evs,27,'hardy');
  assert.equal(member.hp,f.G.hpAfterRecalc(40,old.hp,target.hp));assert.equal(member.friendship,220);
  assert.deepEqual(result.learning.moves,['Target zero','Target twenty-seven']);assert.equal(JSON.stringify(f.state),before);
});

test('P53-23 HP0 stays zero and success clears an existing unknown readiness barrier',async()=>{
  const f=await fixture();f.state.party[0].hp=0;f.state.party[0].evolutionReadiness='unknown';
  const next=ready(f,f.commit());assert.equal(next.party[0].hp,0);assert.equal(next.party[0].readyToEvolve,false);assert.equal(next.party[0].evolutionReadiness,'known');
});

test('D53-04c null ability slot uses D unique/ambiguous recovery and preserves a known trusted override',async()=>{
  for(const mode of ['unique','ambiguous','trusted']){
    const f=await fixture();f.state.party[0].abilityIndex=null;f.state.party[0].effectiveAbilityIndex=null;
    if(mode==='ambiguous'){f.content.species.SourceMon.abilities=['Run Away','Run Away'];f.content.species.SourceMon.hiddenAbilities=['Run Away'];}
    if(mode==='trusted')f.state.party[0].ability='Trusted';
    const result=f.commit(),member=ready(f,result).party[0];
    assert.equal(member.abilityIndex,mode==='trusted'?null:0);assert.equal(member.effectiveAbilityIndex,mode==='trusted'?null:0);
    assert.equal(member.ability,mode==='trusted'?'Trusted':'Target A');
    if(mode==='ambiguous')assert.ok(result.diagnostics.includes('ambiguous-ability-slot:using-0'));
    if(mode==='trusted')assert.ok(result.diagnostics.includes('trusted-ability-override-retained'));
  }
});

test('P53-23 a missing hidden ability retains the requested slot while D records its actual fallback slot',async()=>{
  const f=await fixture();f.state.party[0].abilityIndex=3;f.state.party[0].personalID=1;
  const member=ready(f,f.commit()).party[0];assert.equal(member.abilityIndex,3);assert.equal(member.effectiveAbilityIndex,1);assert.equal(member.ability,'Target B');
});

test('P53-24 real D split draft becomes one fresh party entity with copied PID, healed body, ball debit and dex in the same clone',async()=>{
  const f=await fixture({entries:split()}),selection=f.select(),before=clone(f.state),source=before.party[0];
  const direct=f.Success.planEvolutionSuccess({member:f.state.party[0],selection,content:f.content,resources:{partySize:1,partyCapacity:6,pokeBall:{id:'plain-sphere',quantity:2}}});
  assert.equal(direct.afterAction.kind,'extra-member');assert.equal('id'in direct.afterAction.draft.member,false);
  const result=f.commit(selection),next=ready(f,result),extra=next.party[1];
  assert.equal(result.extraMemberId,'M2');assert.equal(extra.id,'M2');assert.equal(next.nextMemberOrdinal,'3');assert.notEqual(extra.id,source.id);assert.equal(extra.personalID,source.personalID);
  assert.deepEqual(extra,{...direct.afterAction.draft.member,id:'M2'});assert.equal(extra.species,'extra-species');assert.equal(extra.ball,'plain-sphere');assert.equal(extra.gender,'N');
  assert.equal(extra.hp,1);assert.equal(extra.status,'');assert.equal(extra.statusCount,0);assert.equal(extra.moves[0].pp,30);assert.equal(extra.nickname,null);
  assert.equal(extra.item,'');assert.deepEqual(extra.markings,[]);assert.deepEqual(extra.ribbons,[]);assert.deepEqual(extra.owner,source.owner);assert.deepEqual(extra.firstMoves,source.firstMoves);
  assert.equal(f.I.aggregateBag(next.inventory)['plain-sphere'],1);assert.equal(next.stats.evolution_count,8);assert.deepEqual(next.dex.owned,['origin-species','target-species','extra-species']);
  assert.deepEqual(next.dex.seenForms['extra-species'],[{gender:0,form:0,shiny:true}]);assert.deepEqual(next.dex.lastSeenForm['extra-species'],{gender:0,form:0,shiny:true});
  assert.deepEqual(next.dex.capturedCounts,before.dex.capturedCounts);assert.deepEqual(next.storage,before.storage);assert.deepEqual(f.state,before);
  assert.equal('id'in direct.afterAction.draft.member,false,'planning never mutates D draft with its allocated identity');
});

test('P53-24 allocator checks collisions in both current party and boxes and advances decimal ordinal once',async()=>{
  const f=await fixture({entries:split(),partySize:2});f.state.nextMemberOrdinal='1';
  f.state.storage.boxes[0].slots[0]={...clone(f.state.party[0]),id:'M3'};
  const result=f.commit(),next=ready(f,result);assert.equal(result.extraMemberId,'M4');assert.equal(next.nextMemberOrdinal,'5');assert.equal(next.party.length,3);
  assert.deepEqual(next.storage,f.state.storage);assert.equal(next.stats.evolution_count,8);assert.equal(f.I.aggregateBag(next.inventory)['plain-sphere'],1);
});

test('P53-24 capacity precedes ball role resolution and a full party only skips the split body',async()=>{
  const f=await fixture({entries:split(),partySize:6});const before=clone(f.state);
  const result=f.commit(f.select(),{ordinaryBallId:'master-sphere'}),next=ready(f,result);
  assert.ok(result.diagnostics.includes('extra-member-skipped:party-full'));assert.equal(next.party.length,6);assert.equal(next.party[0].species,'target-species');
  assert.equal(next.nextMemberOrdinal,before.nextMemberOrdinal);assert.deepEqual(next.inventory,before.inventory);assert.equal(next.dex.owned.includes('extra-species'),false);assert.equal(next.stats.evolution_count,8);
});

test('P53-24 empty inventory and explicit no-ball skip only the split body without spending an ordinal',async()=>{
  for(const mode of ['empty','null']){
    const f=await fixture({entries:split(),balls:mode==='empty'?0:2}),before=clone(f.state);
    const result=f.commit(f.select(),mode==='null'?{ordinaryBallId:null}:{}),next=ready(f,result);
    assert.ok(result.diagnostics.includes('extra-member-skipped:no-poke-ball'));assert.equal(next.party.length,1);assert.equal(next.party[0].species,'target-species');
    assert.equal(next.nextMemberOrdinal,before.nextMemberOrdinal);assert.deepEqual(next.inventory,before.inventory);assert.equal(next.stats.evolution_count,8);
  }
});

test('P53-24 ordinary ball resolves by the catalog role, never the author ID spelling, and ambiguous roles skip the split',async()=>{
  for(const mode of ['wrong-id','ambiguous']){
    const f=await fixture({entries:split()});f.content.items.pokeball=item('pokeball','masterball');
    if(mode==='wrong-id'){delete f.content.items['plain-sphere'].battleId;}
    else f.content.items['other-plain']=item('other-plain','pokeball');
    f.state.inventory.pockets[2].push({itemId:'pokeball',quantity:5});const before=clone(f.state);
    const result=f.commit(),next=ready(f,result);assert.equal(next.party.length,1);assert.deepEqual(next.inventory,before.inventory);assert.equal(next.nextMemberOrdinal,before.nextMemberOrdinal);
    assert.ok(result.diagnostics.includes(mode==='wrong-id'?'ordinary-ball-role-unavailable':'ordinary-ball-role-ambiguous'));
    assert.ok(result.diagnostics.includes('extra-member-skipped:no-poke-ball'));
  }
});

test('P53-24 trusted owner role injection supports an unmapped battle role but refuses a contradictory Master Ball role',async()=>{
  const f=await fixture({entries:split()});delete f.content.items['plain-sphere'].battleId;
  const result=f.commit(f.select(),{ordinaryBallId:'plain-sphere'});assert.equal(ready(f,result).party[1].ball,'plain-sphere');
  const before=JSON.stringify(f.state),bad=f.commit(f.select(),{ordinaryBallId:'master-sphere'});noPatch(f,bad,before);assert.equal(bad.reason,'invalid-ordinary-ball-role');
});

test('P53-24 an exhausted entity namespace refuses the entire new plan with no ball, stat, dex or member patch',async()=>{
  const f=await fixture({entries:split()});f.state.nextMemberOrdinal=String(36n**18n);const before=JSON.stringify(f.state);
  const result=f.commit();noPatch(f,result,before);assert.equal(result.reason,'evolution-plan-failed');assert.ok(result.diagnostics.some(d=>d.includes('namespace exhausted')));
});

test('P53-23 consume-held after-action is applied by D exactly once without touching inventory or the partner',async()=>{
  const f=await fixture({entries:[F.entry('HoldItem','supply-a','target-species')],partySize:2}),before=clone(f.state);
  const result=f.commit(),next=ready(f,result);assert.equal(next.party[0].item,'');assert.equal(next.party[1].item,'supply-a');assert.deepEqual(next.inventory,before.inventory);
  assert.equal(next.stats.evolution_count,8);assert.equal(next.nextMemberOrdinal,before.nextMemberOrdinal);assert.equal(next.party.length,2);
  const changed=await fixture({entries:[F.entry('HoldItem','supply-a','target-species')]});const selection=changed.select();changed.state.party[0].item='supply-b';
  assert.equal(ready(changed,changed.commit(selection)).party[0].item,'supply-b','latched selection consumes only the actually matching current item');
});

test('P53-24 original entry order selects only the first successful post-handler',async()=>{
  for(const extraFirst of [true,false]){
    const held=F.entry('HoldItem','supply-a','target-species'),extra=F.entry('Shedinja',undefined,'extra-species');
    const f=await fixture({entries:extraFirst?[extra,held]:[held,extra]});const result=f.commit(),next=ready(f,result);
    assert.equal(next.party.length,extraFirst?2:1);assert.equal(next.party[0].item,extraFirst?'supply-a':'');assert.equal(f.I.aggregateBag(next.inventory)['plain-sphere'],extraFirst?1:2);
    assert.equal(next.stats.evolution_count,8);
  }
});

test('selected stable ID must still be in the current party, independent of its former slot',async()=>{
  const f=await fixture({partySize:2}),selection=f.select();f.state.party.reverse();
  const next=ready(f,f.commit(selection));assert.equal(next.party[0].id,'M2');assert.equal(next.party[0].species,'origin-species');assert.equal(next.party[1].id,'M1');assert.equal(next.party[1].species,'target-species');
  f.state.storage.boxes[0].slots[0]=f.state.party.splice(1,1)[0];const before=JSON.stringify(f.state),result=f.commit(selection);noPatch(f,result,before);assert.equal(result.reason,'member-not-in-party');
});

test('stale source identity or selected entry is refused with no state/patch and no input mutation',async()=>{
  for(const mode of ['wrong-id','wrong-source','entry-target','entry-method','entry-parameter']){
    const f=await fixture(),selection=clone(f.select());
    if(mode==='wrong-id')selection.memberId='M2';
    if(mode==='wrong-source')selection.source.species='extra-species';
    if(mode==='entry-target')f.content.species.SourceMon.evolutions[0].target='extra-species';
    if(mode==='entry-method')f.content.species.SourceMon.evolutions[0].method='LevelDay';
    if(mode==='entry-parameter')f.content.species.SourceMon.evolutions[0].parameter=31;
    const before=JSON.stringify(f.state),result=f.commit(selection);noPatch(f,result,before);
    assert.ok(['invalid-evolution-selection','stale-source-member','stale-selected-entry'].includes(result.reason),result.reason);
  }
});

test('missing selected target or exact source form refuses before any fallback can create a false form0 registration',async()=>{
  for(const mode of ['target-record','target-form','source-form']){
    const f=await fixture(),selection=clone(f.select());
    if(mode==='target-record')delete f.content.species.TargetMon;
    if(mode==='target-form')selection.target.form=4;
    if(mode==='source-form'){f.state.party[0].form=4;selection.source.form=4;}
    const before=JSON.stringify(f.state),result=f.commit(selection);noPatch(f,result,before);
    assert.ok(['invalid-current-state','unknown-evolution-target-form','unknown-evolution-source-form'].includes(result.reason),result.reason);
  }
});

test('exact registration protects both primary and split PokedexForm aliases, allowing only existing explicit alias forms',async()=>{
  for(const body of ['TargetMon','ExtraMon']){
    const f=await fixture({entries:split()});f.content.species[body].pokedexForm=5;
    const before=JSON.stringify(f.state),result=f.commit();noPatch(f,result,before);assert.equal(result.reason,body==='TargetMon'?'unknown-evolution-appearance':'unknown-extra-member-appearance');
  }
  const f=await fixture();f.content.species.TargetMon.pokedexForm=2;f.content.forms['target-species'][2]='TargetNamed';
  f.content.species.TargetNamed={...clone(f.content.species.TargetMon),form:2,formName:'Named'};
  const next=ready(f,f.commit());assert.deepEqual(next.dex.seenForms['target-species'],[{gender:0,form:2,shiny:true}]);assert.equal(next.party[0].form,0);
});

test('split exact body form must exist; full party or no-ball short circuits before that optional target is inspected',async()=>{
  const f=await fixture({entries:split()});f.content.species.ExtraMon.defaultForm=3;
  const before=JSON.stringify(f.state),result=f.commit();noPatch(f,result,before);assert.equal(result.reason,'unknown-extra-member-appearance');
  const skipped=f.commit(f.select(),{ordinaryBallId:null});assert.equal(ready(f,skipped).party.length,1);assert.ok(skipped.diagnostics.includes('extra-member-skipped:no-poke-ball'));
});

test('F registration retains existing first last-seen form history and never increments capture/defeat counters',async()=>{
  const f=await fixture({entries:split()});f.state.dex.owned.push('target-species');f.state.dex.lastSeenForm['target-species']={gender:1,form:0,shiny:false};
  f.state.dex.capturedCounts['target-species']=3;f.state.dex.defeatedCounts['extra-species']=2;const before=clone(f.state.dex);
  const next=ready(f,f.commit());assert.deepEqual(next.dex.lastSeenForm['target-species'],before.lastSeenForm['target-species']);assert.deepEqual(next.dex.capturedCounts,before.capturedCounts);assert.deepEqual(next.dex.defeatedCounts,before.defeatedCounts);
  assert.equal(next.dex.owned.filter(id=>id==='target-species').length,1);assert.deepEqual(next.dex.seenForms['target-species'],[{gender:0,form:0,shiny:true}]);
});

test('schema7 current-state and final-content references are real gates; malformed inputs and unknown effective ability refuse zero-patch',async()=>{
  const f=await fixture();f.state.schema=6;let before=JSON.stringify(f.state),result=f.commit();noPatch(f,result,before);assert.equal(result.reason,'invalid-current-state');
  const g=await fixture();g.content.species.TargetMon.abilities=['Missing Ability'];before=JSON.stringify(g.state);result=g.commit();noPatch(g,result,before);assert.equal(result.reason,'invalid-evolved-state');assert.ok(result.diagnostics.some(d=>d.includes('unmapped ability')));
});

test('complete plans are fully detached, frozen inputs work, and there is no second evolution or persistent workflow record',async()=>{
  const f=await fixture({entries:split()}),selection=f.select(),before=JSON.stringify({state:f.state,content:f.content,selection});
  f.content.species.TargetMon.evolutions=[F.entry('Level',1,'origin-species')];
  F.freeze(f.state);F.freeze(f.content);F.freeze(selection);
  const result=f.commit(selection),next=ready(f,result);assert.equal(next.party[0].species,'target-species');assert.equal(next.stats.evolution_count,8);
  next.party[0].owner.name='main-change';next.party[1].owner.name='extra-change';next.party[0].moves[0].pp=0;next.storage.boxes[0].name='changed';
  next.stats.gym_leader_attempts[0]=99;next.dex.owned.push('later');next.inventory.pockets[2][0].quantity=77;result.learning.moves.push('later');
  assert.equal(f.state.party[0].owner.name,'Old OT');assert.equal(f.state.party[0].moves[0].pp,7);assert.equal(f.state.storage.boxes[0].name,'');assert.equal(f.state.stats.gym_leader_attempts[0],0);
  assert.equal(f.state.dex.owned.includes('later'),false);assert.equal(f.I.aggregateBag(f.state.inventory)['plain-sphere'],2);assert.equal(f.content.species.TargetMon.learnset[0].includes('later'),false);
  const expected=JSON.parse(before);expected.content.species.TargetMon.evolutions=[F.entry('Level',1,'origin-species')];assert.deepEqual({state:f.state,content:f.content,selection},expected);
  assert.deepEqual(Object.keys(next).sort(),Object.keys(f.state).sort());assert.deepEqual(next.appliedBattles,f.state.appliedBattles);
});

test('reusing the old selected entry after a committed evolution refuses, and failed overflow plans do not spend resources',async()=>{
  const f=await fixture({entries:split()}),selection=f.select(),first=f.commit(selection),next=ready(f,first),before=JSON.stringify(next);
  const again=f.C.planEvolutionCommit({state:next,memberId:'M1',selection,content:f.content});assert.equal(again.status,'refused');assert.equal(again.reason,'stale-source-member');assert.equal(JSON.stringify(next),before);assert.equal('state'in again,false);
  f.state.stats.evolution_count=Number.MAX_SAFE_INTEGER;const original=JSON.stringify(f.state),overflow=f.commit();noPatch(f,overflow,original);assert.equal(overflow.reason,'evolution-count-overflow');
});
