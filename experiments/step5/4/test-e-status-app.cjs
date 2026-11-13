'use strict';
// Real production App/composition/Gen8 Session; only the owned state/projection ports are controlled.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const F=require('./trainer-ai-integration/fixtures.cjs'),{E,T}=F,plan=require('./e-status-app-contracts.json');
const clone=v=>JSON.parse(JSON.stringify(v));
assert.equal(plan.schema,1);assert.deepEqual(plan.seed,[1,2,3,4]);assert.equal(plan.completeHeading,false);
assert.equal(fs.readFileSync(path.resolve(__dirname,'../../../js/engine/showdown/SOURCE_SHA'),'utf8').trim(),plan.showdownSHA);
async function open(c){
 const input=F.inputs({moves:['splash']});
 // Synthetic author content chooses ordinary canonical species and moves, not an engine mutation.
 const foeId=c.foe.toLowerCase();let spec=input.species.find(s=>s.id===foeId);
 if(!spec){spec={id:foeId,showdownId:foeId,nameKey:'species.'+foeId,growth:'medium',baseExp:100,evYield:{},catchRate:45,learnset:[],source:'author-placeholder'};input.species.push(spec);}
 spec.learnset=[{level:1,move:c.move}];
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));
 const joined=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(joined.errors,[]);const content=joined.content;
 const game=E.state.newGame({content,party:[],money:1000,bag:{antidote:2}});
 game.party=Array.from({length:c.check==='benched-cure'?2:1},(_,i)=>{
  const member=E.memberFactory.createMember({id:'STATUS-P'+(i+1),species:c.player,level:plan.playerLevel,abilityIndex:plan.playerAbilityIndex[c.player]},content,()=>0);
  assert.equal(member.ability,c.player==='Snorlax'?'Thick Fat':'Overgrow','the positive fixture must not accidentally carry Immunity');
  member.moves=[{id:'splash',pp:40,maxpp:40}];return E.speciesKey.toPersistentMember(member,content);
 });game.nextMemberOrdinal=String(game.party.length+1);
 const state=T.fakes.createMemoryState(game),before=JSON.stringify(state.read()),factory=E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[...plan.seed]});
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:factory,content:()=>({content}),random:()=>0,clock:()=>12345});
 const request={battleId:c.id,seq:1,kind:'wild',foes:[{species:foeId,level:plan.foeLevel}],canLose:true,expGain:false};
 const s=await app.startBattle(request);s.take();assert(!s.party.some(m=>m.status));assert(!s.gw.readState('p1').some(m=>m.status));
 return{app,s,state,before,request,trace:[],cleanup(){app.abortBattle(request,Error('owned status-app cleanup'));}};
}
const events=r=>r.messages.flatMap(m=>m.kind==='events'?m.events:[]);
const live=(w,id='STATUS-P1')=>w.s.gw.readState('p1').find(m=>m.id===id);
function unchanged(w){assert.equal(JSON.stringify(w.state.read()),w.before,'no game-state install before final application commit');assert.equal(w.state.replaced.length,0);}
function record(w,step,r){assert(r.ok,JSON.stringify(r));w.trace.push({step,messages:clone(r.messages),live:clone(w.s.gw.readState('p1'))});unchanged(w);return events(r);}
for(const c of plan.cases)test(c.id+' '+c.check,async()=>{
 const w=await open(c);try{
  const first=record(w,'actual-status-move',await w.s.chooseMove(1)),m=live(w);
  assert.equal(m.status,c.status,'actual source move applied or was type-immune');assert.equal(m.pp.splash,39,'the player actually acted before the slower foe');
  assert.equal(w.s.gw.readState('p2')[0].pp[c.move],w.s.gw.moveInfo(c.move).pp-1,'source PP must be consumed');
  if(c.status){assert(first.some(e=>e.type==='-status'&&e.args[0].startsWith('p1a:')&&e.args[1]===c.status));}
  if(c.status==='tox'){assert.equal(m.statusCount,1);assert.equal(m.hp,m.maxhp-Math.floor(m.maxhp/16));}
  if(c.status==='par'){assert.equal(m.statusCount,0);assert.equal(m.hp,m.maxhp);}
  if(c.status==='slp'){assert(Number.isInteger(m.statusCount)&&m.statusCount>=2&&m.statusCount<=4,'actual initial sleep duration, not a forced duration');assert.equal(m.hp,m.maxhp);}
  if(c.check==='poison-immunity'){
   assert(first.some(e=>e.type==='-immune'&&e.args[0].startsWith('p1a:')));assert(!first.some(e=>e.type==='-status'&&e.args[0].startsWith('p1a:')));assert.equal(m.hp,m.maxhp);assert.equal(m.statusCount,0);
  }
  if(c.check==='abort-after-status'){
   w.app.abortBattle(w.request,Error('owned player lifecycle exit'));unchanged(w);
   const outcome=w.app.finishBattle(w.s,w.request);assert.equal(outcome.commit,'none');assert.equal(outcome.aborted,true,'a retired changed Session cannot install a result');unchanged(w);
   console.log('E_STATUS_APP_OBSERVATION '+JSON.stringify({id:c.id,featureIds:plan.featureIds,initial:JSON.parse(w.before),trace:w.trace,aborted:true,installs:0,scope:plan.scope,completeHeading:false}));return;
  }
  if(c.check==='benched-cure'){
   record(w,'switch-to-reserve',await w.s.chooseSwitch('STATUS-P2'));assert.equal(w.s.gw.activeId('p1'),'STATUS-P2');assert.equal(live(w).status,'tox');
   const cure=record(w,'cure-benched-original',await w.s.useItem('antidote','STATUS-P1'));
   assert.equal(live(w).status,'');assert.equal(live(w).statusCount,0);assert.equal(live(w).hp,m.hp,'benched member takes no further toxic residual');
   assert.equal(live(w,'STATUS-P2').status,'tox','another member is not accidentally cured');assert.equal(w.s.bag.antidote,1);assert(cure.some(e=>e.type==='-curestatus'&&e.args[1]==='tox'));
  }
  const beforeEnd=clone(w.s.gw.readState('p1'));record(w,'normal-run',await w.s.run());assert(w.s.finished);assert.equal(w.s.ended.reason,'run');
  const result=w.s.result(),patch=result.members['STATUS-P1'],before=beforeEnd.find(m=>m.id==='STATUS-P1');
  assert.equal(patch.status,c.savedStatus);assert.equal(patch.statusCount,c.savedCount==='remaining'?before.statusCount:c.savedCount);assert.equal(patch.hp,before.hp);
  assert.equal(result.bag.antidote,c.check==='benched-cure'?-1:undefined);
  for(const original of beforeEnd){const row=result.members[original.id];assert.equal(row.hp,original.hp);assert.equal(row.status,original.status==='tox'?'psn':original.status);assert.equal(row.statusCount,original.status==='slp'?original.statusCount:0);assert.equal(row.moves[0].pp,original.pp.splash);}
  const outcome=w.app.finishBattle(w.s,w.request);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));assert.equal(w.state.replaced.length,1);
  const saved=w.state.read();for(const row of beforeEnd){const savedMember=saved.party.find(m=>m.id===row.id),expected=result.members[row.id];assert.equal(savedMember.status,expected.status);assert.equal(savedMember.statusCount,expected.statusCount);assert.equal(savedMember.hp,expected.hp);assert.equal(savedMember.moves[0].pp,expected.moves[0].pp);}
  const antidote=saved.inventory.pockets.flat().find(item=>item.itemId==='antidote');assert.equal(antidote?.quantity,c.check==='benched-cure'?1:2,'the real installed inventory matches the one-use result');
  const installed=JSON.stringify(saved);w.app.finishBattle(w.s,w.request);assert.equal(w.state.replaced.length,1);assert.equal(JSON.stringify(w.state.read()),installed);
  console.log('E_STATUS_APP_OBSERVATION '+JSON.stringify({id:c.id,featureIds:plan.featureIds,initial:JSON.parse(w.before),trace:w.trace,beforeEnd,result,saved:clone(saved),installs:1,scope:plan.scope,completeHeading:false}));
 }finally{w.cleanup();}
});
