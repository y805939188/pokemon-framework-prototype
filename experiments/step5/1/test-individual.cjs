'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const E = require('../../../js/engine/build/engine.cjs');
const C = require('../../../js/engine/build/core.cjs');
const I = C.memberIdentity;
const clone = x => JSON.parse(JSON.stringify(x));
const sp = { base: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 }, growth: 'medium', baseExp: 64, evYield: {}, catchRate: 255, learnset: { 1: ['Tackle'] }, abilities: ['Overgrow', null], hiddenAbilities: [null, 'Chlorophyll'], gender: 128, happiness: 256 };
const content = { species: { Bulbasaur: sp }, moves: { Tackle: { id: 'tackle', name: 'Tackle', pp: 35 } } };
const scripted = (values=[]) => { const calls=[]; const fn=n=>{calls.push(n);return values.length ? values.shift() : 0;}; fn.calls=calls; return fn; };
const create = (input={}, c=content, random=scripted()) => C.memberFactory.createMember({ id:'M1', species:'Bulbasaur', level:5, owner:{ id:0x12345678, name:'原名', gender:1, language:1 }, context:{ map:9, receivedAt:123456789 }, ...input },c,random);

test('P51-01: entity IDs are separate from colliding PIDs; ordinal is exact beyond safe integers',()=>{
  assert.equal(create().personalID, create({id:'M2'}).personalID);
  assert.notEqual(create().id,create({id:'M2'}).id);
  assert.equal(I.initialOrdinal(['W991-3','A-0002','X9007199254740993']), '9007199254740994');
  assert.deepEqual(I.allocateMemberId('35',new Set(['Mz'])), {id:'M10',nextMemberOrdinal:'37'});
  assert.throws(()=>I.allocateMemberId('01',new Set()),/canonical/);
  assert.throws(()=>I.allocateMemberId(String(36n**17n),new Set()),/exhausted/);
});
test('P51-02: fixed random order and injected origin; no clock/RNG in metadata reads',()=>{
  const rng=scripted([0x1234,0x5678,31,0,1,2,3,4]); const m=create({},content,rng);
  assert.equal(m.personalID,0x12345678);assert.deepEqual(rng.calls,[65536,65536,32,32,32,32,32,32]);
  assert.deepEqual(m.origin,{method:0,map:9,text:'',level:5,receivedAt:123456789,hatchedMap:0,hatchedAt:null,compatibilityDefault:false});
  assert.deepEqual(m.firstMoves,[]);assert.deepEqual(m.markings,[]);assert.equal(m.friendship,256);
  assert.deepEqual(create({context:{receivedAt:0,fateful:true}}).origin.method,4);
  assert.throws(()=>create({context:{receivedAt:-1}}),/receivedAt/);
});
test('P51-03: gender/nature boundary and sparse hidden slots, selection retained through fallback',()=>{
  assert.equal(I.deriveIndividual(127,{...sp}).gender,'F');assert.equal(I.deriveIndividual(128,{...sp}).gender,'M');
  for(const gender of ['M','F','N']) assert.equal(I.deriveIndividual(0,{...sp,gender}).gender,gender);
  assert.deepEqual(I.resolveAbility(1,sp,2),{ability:'Overgrow',abilityIndex:2,effectiveAbilityIndex:0});
  assert.deepEqual(I.resolveAbility(1,sp,3),{ability:'Chlorophyll',abilityIndex:3,effectiveAbilityIndex:3});
  assert.deepEqual(I.resolveAbility(0,{abilities:[null,'Second']},0),{ability:'',abilityIndex:0,effectiveAbilityIndex:null});
  for(let n=0;n<25;n++) assert.equal(I.deriveIndividual(n,sp).nature,C.memberFactory.NATURE_ORDER[n]);
});
test('P51-03: shiny threshold 15/16/0 and independent trusted caches',()=>{
  assert.deepEqual(I.shinyFromPersonalId(15,0),{shiny:true,superShiny:false});
  assert.deepEqual(I.shinyFromPersonalId(16,0),{shiny:false,superShiny:false});
  assert.deepEqual(I.shinyFromPersonalId(0xffffffff,0xffffffff),{shiny:true,superShiny:true});
  const m=create({shiny:false,superShiny:true});assert.equal(m.shiny,false);assert.equal(m.superShiny,true);
});
test('P51-03/04: migration defaults deterministic and only missing values are filled',()=>{
  const old=E.state.protocolMember(create());delete old.nature;delete old.gender;delete old.ability;
  const canonical=JSON.stringify(Object.fromEntries(Object.keys(old).sort().map(k=>[k,old[k]])));
  // Full nested canonicalisation is independently computed, not imported from the implementation.
  const canon=v=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
  const expected=parseInt(crypto.createHash('sha256').update('legacy-personal-id-v1\n'+JSON.stringify(canon(old))).digest('hex').slice(0,8),16);
  const a=I.completeIndividual(old,sp),b=I.completeIndividual(clone(old),sp);
  assert.equal(a.personalID,expected);assert.deepEqual(a,b);assert.equal(a.shiny,false);assert.equal(a.superShiny,false);
  assert.deepEqual(a.owner,{id:0,name:'原名',gender:2,language:2});assert.equal(a.origin.receivedAt,null);assert.equal(a.origin.map,null);
  const trusted={...old,nature:'bold',gender:'M',ability:'Author Override',shiny:false,superShiny:true};
  const fixed=I.completeIndividual(trusted,sp);assert.deepEqual([fixed.nature,fixed.gender,fixed.ability,fixed.shiny,fixed.superShiny],['bold','M','Author Override',false,true]);
  assert.equal(fixed.abilityIndex,null);assert.equal(fixed.effectiveAbilityIndex,null);assert.equal(fixed.ot,undefined);
});
test('P51-04: owner public/secret ID, foreign names, language from initial context only',()=>{
  assert.equal(I.publicIdText(0),'00000');assert.equal(I.publicId(0x12345678),0x5678);assert.equal(I.secretId(0x12345678),0x1234);
  assert.equal(I.isForeign({id:1,name:'A'},{id:1,name:'B'}),true);assert.equal(I.isForeign({id:1,name:'A'},{id:1,name:'A'}),false);
  assert.deepEqual(['ja','en-US','fr','it','de','es','ko','zh-CN'].map(I.ownerLanguage),[1,2,3,4,5,7,8,2]);
});
test('P51-05: characteristic uses PID-rotated spec order including Speed before SpAtk',()=>{
  const all={hp:31,atk:31,def:31,spe:31,spa:31,spd:31};
  assert.deepEqual(I.characteristic(3,all),{stat:'spe',variant:1});assert.deepEqual(I.characteristic(4,all),{stat:'spa',variant:1});
  assert.deepEqual(I.characteristic(0,{hp:1,spe:30,spa:30}),{stat:'spe',variant:0});
});
const forms=(name,ns)=>{const species={},record={};for(const n of ns){const key=n?`${name}${n}`:name;species[key]={...clone(sp),contentId:name.toLowerCase(),form:n};record[n]=key;}return {species,forms:{[name.toLowerCase()]:record},moves:content.moves};};
test('P51-02: complete B-family boundary table and copies',()=>{
  const F=C.creationForms.creationForm;
  for(const [name,roll,want] of [['UNOWN',27,27],['PUMPKABOO',4,3],['PUMPKABOO',5,2],['GOURGEIST',19,2],['GOURGEIST',20,1],['PUMPKABOO',64,1],['PUMPKABOO',65,0],['MINIOR',6,13],['SINISTEA',9,1],['SINISTEA',10,0],['POLTEAGEIST',9,1],['ALCREMIE',62,62],['URSHIFU',1,1]]) assert.equal(F(name,'hardy',0,()=>roll),want,name+roll);
  for(const name of ['BURMY','WORMADAM']) for(const [env,want] of [[null,2],['rock',1],['sand',1],['cave',1],['grass',0]]) assert.equal(F(name,'hardy',0,()=>0,{environment:env}),want);
  for(const name of ['SCATTERBUG','SPEWPA','VIVILLON']) assert.equal(F(name,'hardy',19*65536,()=>0),1);
  for(const [timeOfDay,want] of [['day',0],['dusk',2],['night',1]]) assert.equal(F('LYCANROC','hardy',0,()=>0,{timeOfDay}),want);
  const low=['lonely','bold','relaxed','timid','serious','modest','mild','quiet','bashful','calm','gentle','careful'];
  for(const name of ['TOXEL','TOXTRICITY']) for(const nature of C.memberFactory.NATURE_ORDER) assert.equal(F(name,nature,0,()=>0),low.includes(nature)?1:0);
});
test('P51-02: explicit form zero skips B draw; unspecified rechecks, missing form refuses',()=>{
  const c=forms('Unown',[0,1,27]);const rng=scripted([0,0,0,0,0,0,0,0,27]);
  const m=create({species:'Unown'},c,rng);assert.equal(m.form,27);assert.equal(m.species,'Unown27');assert.equal(rng.calls.at(-1),28);
  const fixed=scripted();assert.equal(create({species:'Unown',form:0},c,fixed).form,0);assert.equal(fixed.calls.length,8);
  assert.equal(create({species:'Unown',form:1},c).species,'Unown1');
  assert.throws(()=>create({species:'Unown',form:2},c),/form 2.*missing/);
});
test('P51-05/24: constructors clone metadata; frozen protocol projection has exactly the prior 18 fields',()=>{
  const m=create();const copied=E.state.newMember(m);copied.owner.name='changed';copied.origin.map=0;copied.markings.push(1);
  assert.equal(m.owner.name,'原名');assert.equal(m.origin.map,9);assert.deepEqual(m.markings,[]);
  const p=E.state.protocolMember(m);assert.equal(Object.keys(p).length,18);for(const key of ['personalID','owner','origin','form','shiny','firstMoves','markings']) assert.equal(key in p,false,key);
  assert.equal(p.ot,'原名');assert.equal(p.friendship,256);
});
test('P51-23: explicit legacy PBS Happiness accepts 256, rejects malformed values without output',()=>{
  const input='[BULBASAUR]\nGrowthRate = Medium\nBaseExp = 64\nEVs = SPECIAL_ATTACK,1\nMoves = 1,TACKLE\nHappiness = ';
  const good=E.pbsImport.importPbsSpecies(input+'256','author',1);assert.equal(good.ok,true);assert.equal(good.species[0].happiness,256);
  for(const value of ['-1','1.5','9007199254740992']) { const bad=E.pbsImport.importPbsSpecies(input+value,'author');assert.equal(bad.ok,false);assert.deepEqual(bad.species,[]); }
});
test('P51-05: pinned Gen8 session calculation bounds friendship but result leaves persistent 256 intact',async()=>{
  const game=E.fixtures.makeGame();game.party[0].friendship=256;
  const foe=E.fixtures.foeMember('P51-foe','Pidgey',3);
  const session=await E.session.BattleSession.create({game,battleId:'P51-friendship-256',foe:{kind:'wild',team:[foe]},content:E.fixtures.content,seed:[1,2,3,4]});
  assert.equal((await session.run()).ok,true);
  const result=session.result();assert.equal(result.members[game.party[0].id].friendship,undefined);
  const applied=E.state.applyBattleResult(game,result);assert.equal(applied.state.party[0].friendship,256);
});
