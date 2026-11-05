'use strict';
// Eight real Gateway battles. Wrong-readout controls are synthetic and never counted as extra battles.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {gateway:{BattleGateway}}=require('../../../js/engine/build/production.cjs'),plan=require('./e-ability-contracts.json');
assert.equal(plan.schema,1);assert.equal(plan.format,'gen8rpgcustomgame');assert.deepEqual(plan.seed,[1,2,3,4]);
assert.deepEqual(plan.cases.map(c=>c.id),Array.from({length:8},(_,i)=>'EABI-'+String(i+1).padStart(2,'0')));
assert.deepEqual(plan.headings.map(h=>h.featureId),['FR-000065','FR-000532','FR-000536','FR-000562','FR-000566','FR-000568']);
assert(plan.headings.every(h=>h.completeHeading===false&&/^[a-f0-9]{64}$/.test(h.sha256)));
assert.equal(fs.readFileSync(path.resolve(__dirname,'../../../js/engine/showdown/SOURCE_SHA'),'utf8').trim(),plan.showdownSHA);
const read=gw=>({p1:structuredClone(gw.readState('p1')),p2:structuredClone(gw.readState('p2'))});
function drain(gw){const messages=gw.drain();assert(!messages.some(m=>m.kind==='error'),JSON.stringify(messages));return{messages,events:messages.flatMap(m=>m.kind==='events'?m.events:[])};}
function verify(c,row){
 const before=row.opened.p2[0],after=row.after.p2[0],id=c.player.moves[0];
 assert.equal(before.id,'B');assert.equal(row.after.p1[0].id,'A');
 if(c.check==='intimidate'||c.check==='clear-body'){
  assert.equal(before.boosts.atk,c.expected.targetAttack,'actual target Attack stage after entry');
  assert(row.events.some(e=>e.type==='-ability'&&e.args[0]==='p1a: A'&&e.args[1]==='Intimidate'),'the actual entry ability ran');
  if(c.check==='intimidate')assert(row.events.some(e=>e.type==='-unboost'&&e.args[0]==='p2a: B'&&e.args[1]==='atk'&&e.args[2]==='1'));
  assert.equal(row.after.p1[0].pp[id],plan.initialPP[id],'entry did not use a move');return;
 }
 assert.equal(row.turns.length,c.turns);
 for(const turn of row.turns){assert.equal(turn.after.p1[0].pp[id],turn.before.p1[0].pp[id]-c.expected.PPPerUse,'per actual use PP cost');assert(turn.events.some(e=>e.type==='move'&&e.args[0]==='p1a: A'),'the real selected action executed');}
 switch(c.check){
  case'levitate':assert.equal(after.hp,before.hp);assert(!after.fainted);assert(row.events.some(e=>e.type==='-immune'&&e.args[0]==='p2a: B'));break;
  case'mold-breaker':assert(after.hp<before.hp,'Mold Breaker bypassed Levitate');assert(!row.events.some(e=>e.type==='-immune'&&e.args[0]==='p2a: B'));break;
  case'pressure':case'pressure-control':assert.equal(row.after.p1[0].pp.tackle,35-2*c.expected.PPPerUse);assert.equal(after.fainted,false);assert.equal(row.nextPlayerPP,row.after.p1[0].pp.tackle,'next request carries the same PP');break;
  case'sturdy':case'sturdy-control':assert.equal(before.hp,c.expected.initialTargetHP);assert.equal(before.maxhp,c.expected.initialTargetHP);assert.equal(after.hp,c.expected.targetHP);assert.equal(after.fainted,c.expected.fainted);if(c.expected.fainted)assert(row.events.some(e=>e.type==='faint'&&e.args[0]==='p2a: B'));break;
  default:throw Error('unknown frozen ability contract '+c.check);
 }
}
for(const c of plan.cases){
 assert(c.featureIds.length&&c.featureIds.every(id=>plan.headings.some(h=>h.featureId===id)));
 test(c.id+' '+c.check,async()=>{
  const team=(m,name)=>[{...structuredClone(plan.profile),...structuredClone(m),name}];
  const gw=await BattleGateway.create({formatid:plan.format,seed:[...plan.seed],players:[{name:'Player',team:team(c.player,'A')},{name:'Foe',team:team(c.target,'B')}]});
  for(const[side,id,mon]of[['p1','A',c.player],['p2','B',c.target]]){
   const live=gw.readState(side)[0];gw.seedState(side,[{id,hp:live.maxhp,moves:mon.moves.map(id=>{const pp=plan.initialPP[id];assert(Number.isSafeInteger(pp)&&pp>0);return{id,pp,maxpp:pp};})}]);
  }
  const initial=read(gw);assert.equal(initial.p2[0].boosts.atk,0,'no direct stage setup');
  assert.equal(await gw.choose('p1','team 1'),true);assert.equal(await gw.choose('p2','team 1'),true);const opening=drain(gw),opened=read(gw),turns=[];
  for(let i=0;i<c.turns;i++){
   const before=read(gw);assert.equal(await gw.choose('p1','move 1'),true);assert.deepEqual(read(gw),before,'registration alone changes no combat facts');assert.equal(await gw.choose('p2','move 1'),true);const wire=drain(gw);turns.push({before,after:read(gw),...wire});
  }
  const row={initial,opened,turns,after:read(gw),events:[...opening.events,...turns.flatMap(t=>t.events)],nextPlayerPP:c.check.startsWith('pressure')?gw.awaitingChoice('p1').active[0].moves[0].pp:null};verify(c,row);
  // Exercise this very oracle against an explicitly synthetic wrong readout.
  const wrong=structuredClone(row);
  if(c.check==='intimidate'||c.check==='clear-body')wrong.opened.p2[0].boosts.atk=c.expected.targetAttack===0?-1:0;
  else if(c.check==='pressure'||c.check==='pressure-control')wrong.turns[0].after.p1[0].pp[c.player.moves[0]]=wrong.turns[0].before.p1[0].pp[c.player.moves[0]];
  else if(c.check==='levitate')wrong.after.p2[0].hp--;
  else if(c.check==='mold-breaker')wrong.after.p2[0].hp=wrong.opened.p2[0].hp;
  else wrong.after.p2[0].hp=c.expected.targetHP===0?1:0;
  assert.throws(()=>verify(c,wrong),{name:'AssertionError'},'the same oracle rejects the controlled wrong fact');
  console.log('E_ABILITY_OBSERVATION '+JSON.stringify({id:c.id,featureIds:c.featureIds,format:plan.format,seed:plan.seed,trace:row,syntheticWrongReadout:'rejected',scope:plan.scope}));
 });
}
