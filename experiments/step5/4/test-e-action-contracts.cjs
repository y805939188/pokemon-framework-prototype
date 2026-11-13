'use strict';
// Six bounded groups, eight real Gateway battles. No App/UI/native/reference-runtime claim.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {gateway:{BattleGateway}}=require('../../../js/engine/build/production.cjs');
const plan=require('./e-action-contracts.json');
assert.equal(plan.schema,1);assert.equal(plan.format,'gen8rpgcustomgame');assert.deepEqual(plan.seed,[1,2,3,4]);
assert.deepEqual(plan.cases.map(c=>c.id),Array.from({length:6},(_,i)=>'EACT-'+String(i+1).padStart(2,'0')));
assert.deepEqual(plan.headings.map(h=>h.featureId),['FR-000013','FR-000018','FR-000019','FR-000028']);
assert(plan.headings.every(h=>h.completeHeading===false&&/^[0-9a-f]{64}$/.test(h.sha256)));
assert.equal(fs.readFileSync(path.resolve(__dirname,'../../../js/engine/showdown/SOURCE_SHA'),'utf8').trim(),plan.showdownSHA);
const observations=gw=>({p1:structuredClone(gw.readState('p1')),p2:structuredClone(gw.readState('p2'))});
const member=(state,side,id)=>state[side].find(m=>m.id===id);
function drain(gw,acceptErrors=false){const messages=gw.drain();if(!acceptErrors)assert(!messages.some(m=>m.kind==='error'),JSON.stringify(messages.filter(m=>m.kind==='error')));return{messages,events:messages.flatMap(m=>m.kind==='events'?m.events:[])};}
async function open(c,variant={}){
 const gw=await BattleGateway.create({formatid:plan.format,seed:[...plan.seed],players:[{name:'Player',team:structuredClone(c.player)},{name:'Foe',team:structuredClone(c.foe)}]});
 for(const[side,team]of [['p1',c.player],['p2',c.foe]]){
  const visible=gw.readState(side),records=team.map(mon=>{
   const live=visible.find(m=>m.id===mon.name);assert(live);const hp=side==='p1'&&mon.name==='R'&&variant.benchHP!==undefined?variant.benchHP:side==='p1'&&mon.name==='A'&&c.missingHP?live.maxhp-c.missingHP:live.maxhp;
   return{id:mon.name,hp,moves:mon.moves.map(id=>{const pp=plan.ppSetup[id];assert(Number.isSafeInteger(pp)&&pp>0);return{id,pp,maxpp:pp};})};
  });gw.seedState(side,records);
 }
 assert.equal(await gw.choose('p1','team '+c.player.map((_,i)=>i+1).join('')),true);assert.equal(await gw.choose('p2','team '+c.foe.map((_,i)=>i+1).join('')),true);drain(gw);return gw;
}
async function round(gw,ours='move 1',theirs='move 1'){
 const before=observations(gw);assert.equal(await gw.choose('p1',ours),true);assert.deepEqual(observations(gw),before,'registration alone cannot change HP/PP/active members');assert.equal(await gw.choose('p2',theirs),true);const wire=drain(gw);return{before,after:observations(gw),...wire};
}
function perUse(gw,row,c){
 for(const side of ['p1','p2']){const id=side==='p1'?'A':'B',move=(side==='p1'?c.player:c.foe)[0].moves[0];assert.equal(member(row.after,side,id).pp[move],member(row.before,side,id).pp[move]-c.expected.PPPerUse,'actual per-round permanent PP');assert.equal(gw.awaitingChoice(side).active[0].moves[0].pp,member(row.after,side,id).pp[move],'published next request agrees with permanent PP');}
}
for(const c of plan.cases){
 assert(c.featureIds.length&&c.featureIds.every(id=>plan.headings.some(h=>h.featureId===id)));
 test(c.id+' '+c.check,async()=>{
  const trace=[];
  if(c.check==='switch-refusals'){
   for(const variant of c.variants){const gw=await open(c,variant),before=observations(gw);assert.equal(await gw.choose('p1',variant.choice),c.expected.registered);const wire=drain(gw,true);assert.deepEqual(observations(gw),before);assert.equal(gw.activeId('p1'),'A');assert(!wire.events.some(e=>e.type==='move'||e.type==='switch'));const choice=JSON.parse(gw.snapshot()).sides[0].choice;assert(Array.isArray(choice.actions));assert.equal(choice.actions.length,0,'refused registration leaves no hidden action');trace.push({variant:variant.name,before,after:observations(gw),...wire});}
  }else{
   const gw=await open(c),initial=observations(gw);
   switch(c.check){
    case'move-priority':case'normal-speed':{
     const own=member(initial,'p1','A').stats.spe,foe=member(initial,'p2','B').stats.spe;
     if(c.expected.playerIsSlower)assert(own<foe);if(c.expected.playerIsFaster)assert(own>foe);
     for(let i=0;i<c.turns;i++){const row=await round(gw);const moves=row.events.filter(e=>e.type==='move');assert.equal(moves.length,2);assert.equal(moves[0].args[0],c.expected.firstActor);assert.equal(moves[0].args[1],c.expected.firstMove);perUse(gw,row,c);trace.push(row);}break;
    }
    case'switch-before-move':{
     const row=await round(gw,'switch 2'),sw=row.events.findIndex(e=>e.type==='switch'&&e.args[0]==='p1a: R'),mv=row.events.findIndex(e=>e.type==='move'&&e.args[0]==='p2a: B');assert(sw>=0&&mv>sw);assert.equal(row.events[mv].args[2],c.expected.moveTarget);assert.equal(gw.activeId('p1'),c.expected.activeAfter);assert.equal(member(row.after,'p1','A').hp,member(row.before,'p1','A').hp);assert(member(row.after,'p1','R').hp<member(row.before,'p1','R').hp);for(const id of ['A','R'])assert.equal(member(row.after,'p1',id).pp.tackle,35);assert.equal(member(row.after,'p2','B').pp.tackle,34);trace.push(row);break;
    }
    case'cancel-switch':{
     assert.equal(await gw.choose('p1','switch 2'),true);assert.equal(gw.activeId('p1'),c.expected.activeWhileRegistered);assert.deepEqual(observations(gw),initial);await gw.cancel('p1');assert.equal(gw.activeId('p1'),c.expected.activeAfterCancel);assert.deepEqual(observations(gw),initial);const cancelled=drain(gw);assert(!cancelled.events.some(e=>e.type==='switch'));const row=await round(gw);assert(!row.events.some(e=>e.type==='switch'));assert.equal(gw.activeId('p1'),'A');assert.equal(member(row.after,'p1','R').hp,member(initial,'p1','R').hp);assert.equal(member(row.after,'p1','A').pp.tackle,c.expected.movePPAfterActualRound);assert.equal(member(row.after,'p2','B').pp.tackle,c.expected.movePPAfterActualRound);trace.push({initial,cancelled,...row});break;
    }
    case'item-before-move':{
     assert.equal(await gw.act('p1',{kind:'item',item:'potion',target:'A'}),true);assert.deepEqual(observations(gw),initial,'item registration is not effect execution');assert.equal(await gw.choose('p2','move 1'),true);const wire=drain(gw),used=wire.events.findIndex(e=>e.type==='rpg'&&e.args.slice(0,5).join(',')==='item,p1,potion,A,ok'),mv=wire.events.findIndex(e=>e.type==='move'&&e.args[0]==='p2a: B');assert(used>=0&&mv>used);const event=wire.events[used],after=observations(gw);assert.equal(Number(event.args[5]),c.expected.healed);assert.equal(Number(event.args[6]),member(initial,'p1','A').hp+c.expected.healed);assert(member(after,'p1','A').hp<Number(event.args[6]),'actual following attack damages the restored actor');assert.equal(member(after,'p1','A').pp.tackle,35);assert.equal(member(after,'p2','B').pp.tackle,c.expected.foePPAfter);trace.push({before:initial,after,...wire});break;
    }
    default:throw Error('unknown frozen action contract '+c.check);
   }
  }
  console.log('E_ACTION_OBSERVATION '+JSON.stringify({id:c.id,featureIds:c.featureIds,seed:plan.seed,format:plan.format,trace,scope:plan.scope}));
 });
}
