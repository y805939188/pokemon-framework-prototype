'use strict';
// Frozen qualitative contracts on the pinned Gen8 engine. No private state setup or reference-runtime claim.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {gateway:{BattleGateway}}=require('../../../js/engine/build/production.cjs'),plan=require('./e-damage-contracts.json');
assert.equal(plan.schema,1);assert.equal(plan.format,'gen8rpgcustomgame');assert.deepEqual(plan.seed,[1,2,3,4]);
assert.deepEqual(plan.cases.map(c=>c.id),Array.from({length:7},(_,i)=>'EDMG-'+String(i+1).padStart(2,'0')));
assert.deepEqual(plan.headings.map(h=>h.featureId),['FR-000532','FR-000534','FR-000557','FR-000564']);
assert(plan.headings.every(h=>h.completeHeading===false&&/^[a-f0-9]{64}$/.test(h.sha256)));
assert.equal(fs.readFileSync(path.resolve(__dirname,'../../../js/engine/showdown/SOURCE_SHA'),'utf8').trim(),plan.showdownSHA);
const read=gw=>({p1:structuredClone(gw.readState('p1')),p2:structuredClone(gw.readState('p2'))});
function drain(gw){const messages=gw.drain();assert(!messages.some(m=>m.kind==='error'),JSON.stringify(messages));return{messages,events:messages.flatMap(m=>m.kind==='events'?m.events:[])};}
const names={stormthrow:'Storm Throw',seismictoss:'Seismic Toss',counter:'Counter'};
function verify(c,row){
 assert.equal(row.turns.length,c.turns);
 for(const turn of row.turns){
  const a=turn.before.p1[0],b=turn.before.p2[0],afterA=turn.after.p1[0],afterB=turn.after.p2[0],move=c.player.moves[0],foeMove=c.target.moves[0];
  assert.equal(a.id,'A');assert.equal(b.id,'B');assert.equal(afterA.pp[move],a.pp[move]-1,'real use costs one PP even when the effect is refused');assert.equal(afterB.pp[foeMove],b.pp[foeMove]-1);
  assert(turn.events.some(e=>e.type==='move'&&e.args[0]==='p1a: A'&&e.args[1]===names[move]),'the requested move actually ran');
  const critical=turn.events.filter(e=>e.type==='-crit'&&e.args[0]==='p2a: B');assert.equal(critical.length,c.expected.targetCritEvents,'actual target critical-hit gate');
  const loss=b.hp-afterB.hp;
  if(c.expected.targetDamage==='positive')assert(loss>0,'a nonimmune hit actually damaged the target');
  if(Object.hasOwn(c.expected,'damagePerUse'))assert.equal(loss,c.expected.damagePerUse,'fixed effect actual HP loss, not a damage message estimate');
  if(c.expected.immune)assert(turn.events.some(e=>e.type==='-immune'&&e.args[0]==='p2a: B'));
  if(c.check==='counter-physical-loss'){
   const damage=a.hp-afterA.hp;assert(damage>0,'the opponent actually inflicted physical damage');
   const moves=turn.events.filter(e=>e.type==='move');assert.equal(moves[0].args[0],'p2a: B');assert.equal(moves[0].args[1],c.expected.firstMove);
   assert.equal(loss,Math.min(2*damage,b.hp),'Counter uses actual physical HP loss and current target HP cap');
  }
  if(c.check==='counter-without-damage'){
   assert.equal(a.hp-afterA.hp,c.expected.playerDamage);assert(turn.events.some(e=>e.type==='-fail'&&e.args[0]==='p1a: A'),'Counter failed after a real nondamaging opposing action');
  }
 }
 const last=row.turns.at(-1);assert.equal(row.nextPlayerPP,last.after.p1[0].pp[c.player.moves[0]],'the next public request agrees with the permanent PP record');
}
for(const c of plan.cases){
 assert(c.featureIds.length&&c.featureIds.every(id=>plan.headings.some(h=>h.featureId===id)));
 test(c.id+' '+c.check,async()=>{
  const team=(mon,name)=>[{...structuredClone(plan.profile),...structuredClone(mon),name}];
  const gw=await BattleGateway.create({formatid:plan.format,seed:[...plan.seed],players:[{name:'Player',team:team(c.player,'A')},{name:'Foe',team:team(c.target,'B')}]});
  assert.equal(await gw.choose('p1','team 1'),true);assert.equal(await gw.choose('p2','team 1'),true);const opening=drain(gw),initial=read(gw),turns=[];
  for(let i=0;i<c.turns;i++){
   const before=read(gw);assert.equal(await gw.choose('p1','move 1'),true);assert.deepEqual(read(gw),before,'registering a choice does not already change combat HP, PP or stages');
   assert.equal(await gw.choose('p2','move 1'),true);turns.push({before,after:read(gw),...drain(gw)});
  }
  const row={initial,opening,turns,nextPlayerPP:gw.awaitingChoice('p1').active[0].moves[0].pp};verify(c,row);
  // A wrong observed fact is a detector control, not an extra battle or a compiled product mutation.
  const wrong=structuredClone(row),last=wrong.turns.at(-1);
  if(c.check==='forced-critical')last.events=last.events.filter(e=>!(e.type==='-crit'&&e.args[0]==='p2a: B'));
  else if(c.check==='armor-prevents-forced-critical')last.events.push({type:'-crit',args:['p2a: B']});
  else if(c.check==='fixed-user-level'||c.check==='counter-physical-loss')last.after.p2[0].hp++;
  else last.after.p2[0].hp--;
  assert.throws(()=>verify(c,wrong),{name:'AssertionError'},'the same oracle rejects the controlled wrong gate/HP fact');
  console.log('E_DAMAGE_OBSERVATION '+JSON.stringify({id:c.id,featureIds:c.featureIds,format:plan.format,seed:plan.seed,trace:row,syntheticWrongReadout:'rejected',scope:plan.scope,completeHeading:false}));
 });
}
