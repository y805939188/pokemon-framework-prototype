'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {E,T,inputs}=require('./trainer-ai-integration/fixtures.cjs'),plan=require('./e-stages-app-contracts.json');
const clone=v=>JSON.parse(JSON.stringify(v)),events=messages=>messages.flatMap(m=>m.kind==='events'?m.events:[]);
assert.equal(plan.schema,1);assert.deepEqual(plan.seed,[1,2,3,4]);assert.equal(plan.completeHeading,false);
assert.equal(fs.readFileSync(path.resolve(__dirname,'../../../js/engine/showdown/SOURCE_SHA'),'utf8').trim(),plan.showdownSHA);
const view=s=>({p1:clone(s.gw.readState('p1')),p2:clone(s.gw.readState('p2')),active:s.gw.activeId('p1')});
const own=(v,id='STAGE-P1')=>v.p1.find(m=>m.id===id);
async function open(c){
 const input=inputs({moves:['splash']});
 for(const [id,moves]of [['cloyster',plan.playerMoves],['slowbro',['splash']]]){
  assert(!input.species.some(s=>s.id===id));input.species.push({id,showdownId:id,nameKey:'species.'+id,growth:'medium',baseExp:100,evYield:{},catchRate:45,learnset:moves.map(move=>({level:1,move})),source:'author-placeholder'});
 }
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));
 const joined=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(joined.errors,[]);const content=joined.content;
 const game=E.state.newGame({content,party:[],money:1000});game.party=Array.from({length:c.party},(_,i)=>E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:'STAGE-P'+(i+1),species:'Cloyster',level:50,nature:'hardy',abilityIndex:0},content,()=>0),content));game.nextMemberOrdinal=String(c.party+1);
 const state=T.fakes.createMemoryState(game),initial=clone(state.read());
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[...plan.seed]}),content:()=>({content}),random:()=>0,clock:()=>12345});
 const request={battleId:c.id,seq:1,kind:'wild',foes:[{species:'slowbro',level:100}],canLose:true,expGain:false};
 const s=await app.startBattle(request);s.take();const first=view(s);assert.equal(own(first).hp,110);assert.equal(first.p2[0].hp,300);assert(own(first).stats.spe>first.p2[0].stats.spe);
 return{app,s,state,initial,request,trace:[],cleanup(){app.abortBattle(request,Error('owned stat-stage cleanup'));}};
}
function unchanged(w){assert.deepEqual(w.state.read(),w.initial);assert.equal(w.state.replaced.length,0);}
function verify(row){
 const b=row.before,a=row.after,old=own(b,b.active),now=own(a,b.active),foeBefore=b.p2[0],foeAfter=a.p2[0],ev=events(row.messages);
 const identifies=(arg,side,id)=>arg===side+'a: '+id||arg===side+': '+id;
 assert.equal(foeAfter.pp.splash,foeBefore.pp.splash-1);assert.equal(old.hp,now.hp);
 if(row.op==='switch'){
  assert.equal(a.active,row.target);assert(a.p1.every(m=>Object.values(m.boosts).every(v=>v===0)));
  for(const m of b.p1)assert.deepEqual(own(a,m.id).pp,m.pp,'ordinary switches do not spend a move PP');
  assert.equal(foeAfter.hp,foeBefore.hp);assert.deepEqual(foeAfter.boosts,foeBefore.boosts);
  assert(ev.some(e=>e.type==='switch'&&identifies(e.args[0],'p1',row.target)));return;
 }
 assert.equal(a.active,b.active);assert.equal(now.pp[row.move],old.pp[row.move]-1);
 for(const [id,pp]of Object.entries(old.pp))if(id!==row.move)assert.equal(now.pp[id],pp);
 assert(ev.some(e=>e.type==='move'&&identifies(e.args[0],'p1',b.active)));
 if(row.move==='swordsdance'){
  assert.equal(now.boosts.atk,Math.min(6,old.boosts.atk+2));assert.equal(foeAfter.hp,foeBefore.hp);assert.deepEqual(foeAfter.boosts,foeBefore.boosts);
  if(old.boosts.atk===6)assert(ev.some(e=>e.type==='-fail'&&identifies(e.args[0],'p1',b.active)));
  else assert(ev.some(e=>e.type==='-boost'&&identifies(e.args[0],'p1',b.active)&&e.args[1]==='atk'&&Number(e.args[2])===2));
 }else if(row.move==='growl'){
  assert.equal(foeAfter.boosts.atk,Math.max(-6,foeBefore.boosts.atk-1));assert.deepEqual(now.boosts,old.boosts);assert.equal(foeAfter.hp,foeBefore.hp);
  assert(ev.some(e=>e.type==='-unboost'&&identifies(e.args[0],'p2',foeBefore.id)&&e.args[1]==='atk'&&Number(e.args[2])===1));
 }else if(row.move==='tackle'){
  assert(foeAfter.hp<foeBefore.hp&&foeAfter.hp>0);assert.deepEqual(now.boosts,old.boosts);assert.deepEqual(foeAfter.boosts,foeBefore.boosts);
 }else assert.fail('unfrozen move');
}
async function step(w,action){
 unchanged(w);const before=view(w.s),r=action.op==='switch'?await w.s.chooseSwitch(action.target):await w.s.chooseMove(plan.playerMoves.indexOf(action.move)+1);assert(r.ok,JSON.stringify(r));
 const row={...action,before,after:view(w.s),messages:clone(r.messages)};
 try{verify(row);}catch(e){console.log('E_STAGES_APP_FAILED_OBSERVATION '+JSON.stringify({id:w.request.battleId,initial:w.initial,...row}));throw e;}unchanged(w);w.trace.push(row);
}
for(const c of plan.cases)test(c.id+' '+c.check,async()=>{
 const w=await open(c);try{
  for(const action of c.steps)await step(w,action);
  const selected=w.trace.find(r=>r.move==='swordsdance')??w.trace[0],wrong=clone(selected);
  if(selected.move==='growl')wrong.after.p2[0].boosts.atk++;else own(wrong.after,wrong.before.active).boosts.atk++;
  assert.throws(()=>verify(wrong),assert.AssertionError,'same real-step oracle rejects a wrong temporary stage');
  if(c.check==='stage-affects-damage'){
   const attacks=w.trace.filter(r=>r.move==='tackle'),loss=r=>r.before.p2[0].hp-r.after.p2[0].hp;
   assert.equal(attacks.length,2);assert.equal(own(attacks[0].before).boosts.atk,0);assert.equal(own(attacks[1].before).boosts.atk,2);assert(loss(attacks[1])>loss(attacks[0]),'attack stage is actually consumed by the subsequent damage path, not just recorded');
  }
  const beforeEnd=view(w.s);
  if(c.exit==='abort'){
   w.app.abortBattle(w.request,Error('owned buff lifecycle abort'));const outcome=w.app.finishBattle(w.s,w.request);assert.equal(outcome.commit,'none');assert.equal(outcome.aborted,true);unchanged(w);
   console.log('E_STAGES_APP_OBSERVATION '+JSON.stringify({id:c.id,featureIds:plan.featureIds,initial:w.initial,trace:w.trace,beforeEnd,outcome,saved:clone(w.state.read()),installs:0,syntheticWrongReadout:'rejected',completeHeading:false,NW:0}));return;
  }
  const ending=await w.s.run();assert(ending.ok);assert(w.s.finished);assert.equal(w.s.ended.reason,'run');unchanged(w);
  const result=w.s.result();for(const live of beforeEnd.p1){const patch=result.members[live.id];assert.equal(patch.hp,live.hp);assert(!Object.hasOwn(patch,'boosts'));for(const m of patch.moves)assert.equal(m.pp,live.pp[m.id]);}
  const outcome=w.app.finishBattle(w.s,w.request);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));assert.equal(w.state.replaced.length,1);const saved=clone(w.state.read());
  for(const m of saved.party){const initial=w.initial.party.find(x=>x.id===m.id);assert(!Object.hasOwn(m,'boosts'));for(const key of ['ivs','evs','nature','ability','level','exp'])assert.deepEqual(m[key],initial[key]);assert.deepEqual(m.moves.map(({id,pp,maxpp})=>({id,pp,maxpp})),result.members[m.id].moves);}
  assert.equal(saved.appliedBattles[c.id].hash,E.state.resultHash(result));w.app.finishBattle(w.s,w.request);assert.equal(w.state.replaced.length,1);assert.deepEqual(w.state.read(),saved);
  let nextBattle=null;
  if(c.check==='cap-and-next-battle-reset'){
   const req={...w.request,battleId:c.id+'/next'},s=await w.app.startBattle(req);s.take();try{const initial=view(s);assert(initial.p1.every(m=>Object.values(m.boosts).every(v=>v===0)));assert.deepEqual(own(initial).pp,own(beforeEnd).pp);assert.equal(own(initial).hp,own(beforeEnd).hp);assert.deepEqual(w.state.read(),saved);w.app.abortBattle(req,Error('owned next-battle observation complete'));const retired=w.app.finishBattle(s,req);assert.equal(retired.commit,'none');assert.equal(retired.aborted,true);assert.equal(w.state.replaced.length,1);assert.deepEqual(w.state.read(),saved);nextBattle={request:req,initial,outcome:retired};}finally{w.app.abortBattle(req,Error('owned next-battle cleanup'));}
  }
  console.log('E_STAGES_APP_OBSERVATION '+JSON.stringify({id:c.id,featureIds:plan.featureIds,initial:w.initial,trace:w.trace,beforeEnd,ending:clone(ending.messages),result,outcome,saved,installs:1,nextBattle,syntheticWrongReadout:'rejected',completeHeading:false,NW:0}));
 }finally{w.cleanup();}
});
