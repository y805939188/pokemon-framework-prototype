'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {E,T,inputs}=require('./trainer-ai-integration/fixtures.cjs'),plan=require('./e-locked-turn-app-contracts.json');
const {clone,view,events,normalRequest,verifyTurn}=require('./locked-turn-app-fixture.cjs');
assert.equal(plan.schema,1);assert.equal(plan.completeHeading,false);assert.deepEqual(plan.seed,[1,2,3,4]);
assert.equal(fs.readFileSync(path.resolve(__dirname,'../../../js/engine/showdown/SOURCE_SHA'),'utf8').trim(),plan.showdownSHA);
async function open(c){
 const input=inputs({moves:['splash']});input.species.find(s=>s.id==='snorlax').learnset=plan.playerMoves.map(m=>({level:1,move:m.id}));
 assert(!input.species.some(s=>s.id===plan.foe.species));input.species.push({id:plan.foe.species,showdownId:plan.foe.species,nameKey:'species.'+plan.foe.species,growth:'medium',baseExp:100,evYield:{},catchRate:45,learnset:plan.foe.moves.map(move=>({level:1,move})),source:'author-placeholder'});
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));const joined=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(joined.errors,[]);const content=joined.content;
 const {maxhp,...creation}=plan.player,m=E.memberFactory.createMember(creation,content,()=>0);assert.equal(m.hp,maxhp);assert.equal(m.ability,'Thick Fat');assert.deepEqual(m.moves,plan.playerMoves);
 const game=E.state.newGame({content,party:[E.speciesKey.toPersistentMember(m,content)],money:1000});game.nextMemberOrdinal='2';const state=T.fakes.createMemoryState(game),initial=clone(state.read());
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[...plan.seed]}),content:()=>({content}),random:()=>0,clock:()=>12345});
 const request={battleId:c.id,seq:1,kind:'wild',foes:[{species:plan.foe.species,level:plan.foe.level}],canLose:true,expGain:false},s=await app.startBattle(request);s.take();normalRequest(view(s));
 return{app,s,state,initial,request,trace:[],phase:'open'};
}
function unchanged(w){assert.equal(w.state.replaced.length,0);assert.deepEqual(w.state.read(),w.initial,'battle work must remain private until commit');}
async function turn(w,phase,slot){
 w.phase=phase;unchanged(w);const before=view(w.s),r=await w.s.chooseMove(slot);assert(r.ok,JSON.stringify(r));const row={phase,slot,before,after:view(w.s),messages:clone(r.messages)};w.trace.push(row);verifyTurn(row);unchanged(w);
 // Reuse the same oracle on incorrect observations, not an alternative weak assertion.
 const pp=clone(row);pp.after.p1.pp.dig++;assert.throws(()=>verifyTurn(pp),assert.AssertionError);
 const hp=clone(row);hp.after.p2.hp=phase==='dig-attack'||phase==='hyper-attack'?hp.before.p2.hp:hp.before.p2.hp-1;assert.throws(()=>verifyTurn(hp),assert.AssertionError);
 const work=clone(row);work.after.work.moves[0].pp++;assert.throws(()=>verifyTurn(work),assert.AssertionError);
 return row;
}
for(const c of plan.cases)test(c.id+' '+c.check,async()=>{
 let w;try{
  w=await open(c);const first=await turn(w,c.kind==='dig'?'dig-charge':'hyper-attack',c.kind==='dig'?1:2);
  if(c.exit==='abort'){
   w.phase='abort-pending';w.app.abortBattle(w.request,Error('owned normal locked-turn cancellation'));const outcome=w.app.finishBattle(w.s,w.request);assert.equal(outcome.commit,'none');assert(outcome.aborted);unchanged(w);
   const request={...w.request,battleId:c.id+'/next',seq:2},s=await w.app.startBattle(request);s.take();
   try{
    const initial=view(s);normalRequest(initial);for(const m of plan.playerMoves)assert.equal(initial.p1.pp[m.id],m.pp,'aborted work PP never persisted');
    const next={...w,s,request,trace:[]};await turn(next,'splash',3);w.app.abortBattle(request,Error('owned fresh battle observation complete'));const retired=w.app.finishBattle(s,request);assert.equal(retired.commit,'none');assert(retired.aborted);unchanged(w);
    console.log('E_LOCKED_TURN_APP_OBSERVATION '+JSON.stringify({id:c.id,featureIds:['FR-000556'],initial:w.initial,trace:w.trace,outcome,saved:clone(w.state.read()),installs:0,nextBattle:{request,initial,trace:next.trace,outcome:retired},completeHeading:false,NW:0}));
   }finally{w.app.abortBattle(request,Error('owned next battle cleanup'));}
   return;
  }
  if(c.kind==='dig')await turn(w,'dig-attack',1);else{await turn(w,'hyper-recharge',1);await turn(w,'splash',3);}
  const beforeEnd=view(w.s),exitTrace=[];w.phase='run';
  for(let attempt=1;!w.s.finished&&attempt<=plan.maxEscapeAttempts;attempt++){
   const r=await w.s.run();assert(r.ok,JSON.stringify(r));const after=view(w.s);assert.equal(after.p1.hp,beforeEnd.p1.hp);assert.deepEqual(after.p1.pp,beforeEnd.p1.pp);unchanged(w);exitTrace.push({attempt,messages:clone(r.messages),after,finished:w.s.finished});
  }
  assert(w.s.finished,'bounded legal escape choices must finish this fixed fixture');assert.equal(w.s.ended.reason,'run');unchanged(w);
  const result=w.s.result(),patch=result.members[plan.player.id];assert.equal(patch.hp,beforeEnd.p1.hp);assert.equal(patch.status,'');assert.equal(patch.statusCount,0);assert(!Object.hasOwn(patch,'volatiles'));
  for(const m of patch.moves)assert.equal(m.pp,beforeEnd.p1.pp[m.id]);
  w.phase='finish';const outcome=w.app.finishBattle(w.s,w.request);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));assert.equal(w.state.replaced.length,1);const saved=clone(w.state.read()),installed=saved.party[0];
  assert.deepEqual(installed.moves.map(({id,pp,maxpp})=>({id,pp,maxpp})),patch.moves);assert.equal(installed.hp,patch.hp);assert.equal(installed.status,'');assert.equal(installed.statusCount,0);
  for(const [key,value]of Object.entries(w.initial.party[0]))if(!['hp','status','statusCount','moves'].includes(key))assert.deepEqual(installed[key],value,key);
  assert.deepEqual(saved.inventory,w.initial.inventory);assert.equal(saved.money,w.initial.money);assert.equal(saved.appliedBattles[c.id].hash,E.state.resultHash(result));assert.deepEqual(Object.keys(saved.appliedBattles),[c.id]);
  w.app.finishBattle(w.s,w.request);assert.equal(w.state.replaced.length,1);assert.deepEqual(w.state.read(),saved,'repeated finish cannot install twice');
  console.log('E_LOCKED_TURN_APP_OBSERVATION '+JSON.stringify({id:c.id,featureIds:['FR-000556'],initial:w.initial,trace:w.trace,beforeEnd,exitTrace,result,outcome,saved,installs:1,completeHeading:false,NW:0}));
 }catch(error){if(w)console.log('E_LOCKED_TURN_APP_FAILED_OBSERVATION '+JSON.stringify({id:c.id,phase:w.phase,initial:w.initial,trace:w.trace,current:view(w.s),saved:clone(w.state.read()),installs:w.state.replaced.length,error:{name:error.name,message:error.message}}));throw error;
 }finally{if(w)w.app.abortBattle(w.request,Error('owned locked-turn cleanup'));}
});
