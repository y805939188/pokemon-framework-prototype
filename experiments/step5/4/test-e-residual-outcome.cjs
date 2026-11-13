'use strict';
const test=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {E,T,inputs}=require('./trainer-ai-integration/fixtures.cjs'),plan=require('./e-residual-outcome.json');
const {assert,clone}=require('./e-residual-outcome-common.cjs'),{verify}=require('./e-residual-outcome-oracle.cjs');
assert.equal(plan.completeHeading,false);assert.equal(fs.readFileSync(path.resolve(__dirname,'../../../js/engine/showdown/SOURCE_SHA'),'utf8').trim(),plan.showdownSHA);
const view=s=>({p1:clone(s.gw.readState('p1')),p2:clone(s.gw.readState('p2')),active:s.gw.activeId('p1'),request:clone(s.currentRequest())});
async function open(c){
 const input=inputs({moves:['splash']});
 for(const [id,moves]of [['machamp',plan.moves],['slowbro',['toxic']],['magikarp',['splash']]]){
  let species=input.species.find(s=>s.id===id);if(!species){species={id,showdownId:id,nameKey:'species.'+id,growth:'medium',baseExp:100,evYield:{},catchRate:45,source:'author-placeholder'};input.species.push(species);}species.learnset=moves.map(move=>({level:1,move}));
 }
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));const joined=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(joined.errors,[]);const content=joined.content;
 const m=E.memberFactory.createMember({id:'RES-P1',species:'Machamp',level:50,nature:'hardy',abilityIndex:1},content,()=>0);assert.equal(m.hp,150);assert.equal(m.ability,'No Guard');assert.deepEqual(m.moves.map(v=>v.id),plan.moves);m.hp=c.initialHP;
 const game=E.state.newGame({content,party:[E.speciesKey.toPersistentMember(m,content)],money:1000});game.nextMemberOrdinal='2';const state=T.fakes.createMemoryState(game),initial=clone(state.read());
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[...plan.seed]}),content:()=>({content}),random:()=>0,clock:()=>12345});
 const request={battleId:c.id,seq:1,kind:'wild',foes:[{species:'slowbro',level:10}],canLose:true,expGain:false},s=await app.startBattle(request),opening=clone(s.take());
 assert.equal(view(s).p1[0].hp,c.initialHP);assert(view(s).p1[0].stats.spe>view(s).p2[0].stats.spe);return{app,s,state,initial,request,opening,rows:[],phase:'open'};
}
function unchanged(w){assert.equal(w.state.replaced.length,0);assert.deepEqual(w.state.read(),w.initial);}
async function action(w,move){
 unchanged(w);w.phase='move:'+move;const before=view(w.s),r=await w.s.chooseMove(plan.moves.indexOf(move)+1);assert(r.ok,JSON.stringify(r));
 const row={move,before,after:view(w.s),messages:clone(r.messages)};w.rows.push(row);unchanged(w);return row;
}
for(const c of plan.cases)test(c.id+' '+c.check,async()=>{
 let w;try{
  w=await open(c);for(const move of c.turns)await action(w,move);
  if(c.exit==='abort'){
   w.app.abortBattle(w.request,Error('owned combined residual abort'));const outcome=w.app.finishBattle(w.s,w.request);assert.equal(outcome.commit,'none');assert(outcome.aborted);unchanged(w);
   const request={...w.request,battleId:c.id+'/fresh',seq:2,foes:[{species:'magikarp',level:10}]};w.s=await w.app.startBattle(request);w.s.take();w.request=request;
   await action(w,'splash');verify(c,w.rows);w.app.abortBattle(request,Error('owned fresh residual observer complete'));const freshOutcome=w.app.finishBattle(w.s,request);assert.equal(freshOutcome.commit,'none');assert(freshOutcome.aborted);unchanged(w);
   console.log('E_RESIDUAL_OBSERVATION '+JSON.stringify({id:c.id,featureIds:c.featureIds,initial:w.initial,opening:w.opening,rows:w.rows,outcome,freshOutcome,saved:clone(w.state.read()),installs:0,completeHeading:false,NW:0}));return;
  }
  verify(c,w.rows);let end=null;
  if(c.exit==='run'){w.phase='run';end=await w.s.run();assert(end.ok);assert(w.s.finished);assert.equal(w.s.ended.reason,'run');}
  else{assert(w.s.finished);assert.equal(w.s.ended.reason,'win');assert.notEqual(w.s.ended.winner,'Player');}
  unchanged(w);const result=w.s.result(),patch=result.members['RES-P1'];assert.equal(patch.hp,c.exit==='defeat'?0:18);assert.equal(patch.status,c.exit==='defeat'?'':'psn');assert.equal(patch.statusCount,0,'fainted status clears; surviving toxic normalizes to ordinary poison');
  const outcome=w.app.finishBattle(w.s,w.request);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));assert.equal(w.state.replaced.length,1);const saved=clone(w.state.read()),p=saved.party[0];
  if(c.exit==='defeat'){
   assert.equal(p.hp,150);assert.equal(p.status,'');assert.equal(p.statusCount,0);for(const move of p.moves)assert.equal(move.pp,move.maxpp);assert.equal(saved.money,600,'D3 loss is level50 times8 even with canLose');
  }else{assert.equal(p.hp,18);assert.equal(p.status,'psn');assert.equal(p.statusCount,0);assert.equal(saved.money,1000);assert.deepEqual(p.moves.map(({id,pp,maxpp})=>({id,pp,maxpp})),patch.moves);}
  assert.deepEqual(saved.inventory,w.initial.inventory);assert.equal(saved.appliedBattles[c.id].hash,E.state.resultHash(result));w.app.finishBattle(w.s,w.request);assert.equal(w.state.replaced.length,1);assert.deepEqual(w.state.read(),saved);
  console.log('E_RESIDUAL_OBSERVATION '+JSON.stringify({id:c.id,featureIds:c.featureIds,initial:w.initial,opening:w.opening,rows:w.rows,end,result,outcome,saved,installs:1,completeHeading:false,NW:0}));
 }catch(error){console.log('E_RESIDUAL_FAILED '+JSON.stringify({id:c.id,phase:w?.phase,rows:w?.rows,error:{name:error.name,message:error.message},installs:w?.state.replaced.length}));throw error;}
 finally{if(w)w.app.abortBattle(w.request,Error('owned residual cleanup'));}
});
