'use strict';
const test=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {E,T,inputs}=require('./trainer-ai-integration/fixtures.cjs');
const plan=require('./e-position-entry.json'),{assert,clone,member}=require('./e-position-entry-common.cjs'),{verify}=require('./e-position-entry-oracle.cjs');
assert.equal(plan.completeHeading,false);assert.equal(fs.readFileSync(path.resolve(__dirname,'../../../js/engine/showdown/SOURCE_SHA'),'utf8').trim(),plan.showdownSHA);
const view=s=>({p1:clone(s.gw.readState('p1')),p2:clone(s.gw.readState('p2')),active:s.gw.activeId('p1'),request:clone(s.currentRequest()),caps:Object.fromEntries(s.party.map(m=>[m.id,Object.fromEntries(m.moves.map(x=>[x.id,x.maxpp]))]))});
async function open(c){
 const input=inputs({moves:['splash']});input.species.find(s=>s.id==='snorlax').learnset=c.moves.map(move=>({level:1,move}));
 input.species.push({id:'slowbro',showdownId:'slowbro',nameKey:'species.slowbro',growth:'medium',baseExp:100,evYield:{},catchRate:45,learnset:[{level:1,move:'splash'}],source:'author-placeholder'});
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));const joined=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(joined.errors,[]);const content=joined.content;
 const party=[];for(let n=1;n<=2;n++){
  const m=E.memberFactory.createMember({id:'POS-P'+n,species:'Snorlax',level:50,nature:'hardy',abilityIndex:1},content,()=>0);
  assert.equal(m.hp,220);assert.equal(m.ability,'Thick Fat');assert.deepEqual(m.moves.map(v=>v.id),c.moves);
  m.hp=n===1?55:c.receiverHP;if(n===2){m.status=c.receiverStatus;m.statusCount=0;if(c.receiverPP===1)for(const move of m.moves)move.pp=1;}
  party.push(E.speciesKey.toPersistentMember(m,content));
 }
 const game=E.state.newGame({content,party,money:1000});game.nextMemberOrdinal='3';const state=T.fakes.createMemoryState(game),initial=clone(state.read());
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[...plan.seed]}),content:()=>({content}),random:()=>0,clock:()=>12345});
 const request={battleId:c.id,seq:1,kind:'wild',foes:[{species:'slowbro',level:10}],canLose:true,expGain:false},s=await app.startBattle(request);const opening=clone(s.take());
 assert.equal(view(s).p1[0].maxhp,220);return{app,s,state,initial,request,opening,rows:[],phase:'open'};
}
function unchanged(w){assert.equal(w.state.replaced.length,0);assert.deepEqual(w.state.read(),w.initial);}
async function action(w,kind,value){
 unchanged(w);const before=view(w.s);w.phase=kind+':'+value;const r=kind==='move'?await w.s.chooseMove(value):await w.s.chooseSwitch(value);assert(r.ok,JSON.stringify(r));
 const row={kind,value,before,after:view(w.s),messages:clone(r.messages)};w.rows.push(row);unchanged(w);return row;
}
for(const c of plan.cases)test(c.id+' '+c.check,async()=>{
 let w;try{
  w=await open(c);await action(w,'move',1);
  if(c.exit==='abort'){
   w.app.abortBattle(w.request,Error('owned pending Wish abort'));const outcome=w.app.finishBattle(w.s,w.request);assert.equal(outcome.commit,'none');assert(outcome.aborted);unchanged(w);
   const req={...w.request,battleId:c.id+'/fresh',seq:2};w.s=await w.app.startBattle(req);w.s.take();w.request=req;
   await action(w,'move',c.moves.indexOf('splash')+1);verify(c,w.rows);
   w.app.abortBattle(req,Error('owned fresh position observation complete'));const freshOutcome=w.app.finishBattle(w.s,req);assert.equal(freshOutcome.commit,'none');assert(freshOutcome.aborted);unchanged(w);
   console.log('E_POSITION_OBSERVATION '+JSON.stringify({id:c.id,featureIds:c.featureIds,initial:w.initial,opening:w.opening,rows:w.rows,outcome,freshOutcome,saved:clone(w.state.read()),installs:0,completeHeading:false,NW:0}));return;
  }
  await action(w,'switch','POS-P2');if(c.id==='EPE-02')await action(w,'move',c.moves.indexOf('substitute')+1);verify(c,w.rows);
  w.phase='run';const preEnd=view(w.s),end=await w.s.run();assert(end.ok,JSON.stringify(end));assert(w.s.finished,'strictly faster player exits without another residual turn');assert.equal(w.s.ended.reason,'run');unchanged(w);
  const result=w.s.result();for(const m of preEnd.p1){const p=result.members[m.id];assert.equal(p.hp,m.hp);assert.equal(p.status,m.status);for(const move of p.moves)assert.equal(move.pp,m.pp[move.id]);}
  w.phase='finish';const outcome=w.app.finishBattle(w.s,w.request);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));assert.equal(w.state.replaced.length,1);const saved=clone(w.state.read());
  for(const m of saved.party){const p=result.members[m.id];assert.equal(m.hp,p.hp);assert.equal(m.status,p.status);assert.deepEqual(m.moves.map(({id,pp,maxpp})=>({id,pp,maxpp})),p.moves);}
  assert.equal(saved.money,w.initial.money);assert.deepEqual(saved.inventory,w.initial.inventory);assert.equal(saved.appliedBattles[c.id].hash,E.state.resultHash(result));
  w.app.finishBattle(w.s,w.request);assert.equal(w.state.replaced.length,1);assert.deepEqual(w.state.read(),saved);
  console.log('E_POSITION_OBSERVATION '+JSON.stringify({id:c.id,featureIds:c.featureIds,initial:w.initial,opening:w.opening,rows:w.rows,end:clone(end.messages),result,outcome,saved,installs:1,completeHeading:false,NW:0}));
 }catch(error){console.log('E_POSITION_FAILED '+JSON.stringify({id:c.id,phase:w?.phase,rows:w?.rows,error:{name:error.name,message:error.message},installs:w?.state.replaced.length}));throw error;}
 finally{if(w)w.app.abortBattle(w.request,Error('owned position cleanup'));}
});
