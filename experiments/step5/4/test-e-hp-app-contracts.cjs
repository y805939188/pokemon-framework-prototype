'use strict';
// Normal production App/composition/Gen8 Session. Only owned persistence/projection ports are controlled.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {E,T,inputs}=require('./trainer-ai-integration/fixtures.cjs'),plan=require('./e-hp-app-contracts.json');
const clone=v=>JSON.parse(JSON.stringify(v));
assert.equal(plan.schema,1);assert.deepEqual(plan.seed,[1,2,3,4]);assert.equal(plan.completeHeading,false);
assert.equal(fs.readFileSync(path.resolve(__dirname,'../../../js/engine/showdown/SOURCE_SHA'),'utf8').trim(),plan.showdownSHA);
async function open(c){
 const input=inputs({moves:['splash']});
 input.species.find(s=>s.id==='snorlax').learnset=plan.playerMoves.map(move=>({level:1,move}));
 input.species.push({id:'slowbro',showdownId:'Slowbro',nameKey:'species.slowbro',growth:'medium',baseExp:100,evYield:{},catchRate:45,learnset:[{level:1,move:'splash'}],source:'author-placeholder'});
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));
 const joined=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(joined.errors,[]);const content=joined.content;
 const m=E.memberFactory.createMember({id:'HP-P1',species:'Snorlax',level:50,nature:'Hardy',abilityIndex:1},content,()=>0);
 assert.equal(m.ability,'Thick Fat');assert.equal(m.hp,plan.playerMaxHP);assert.equal(m.hp%2,0,'this finite fixture does not choose between odd-HP reference rounding variants');
 if(c.initial==='quarter')m.hp=plan.playerMaxHP/4;
 const game=E.state.newGame({content,party:[E.speciesKey.toPersistentMember(m,content)],money:1000});game.nextMemberOrdinal='2';
 const state=T.fakes.createMemoryState(game),before=clone(state.read());
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[...plan.seed]}),content:()=>({content}),random:()=>0,clock:()=>12345});
 const request={battleId:c.id,seq:1,kind:'wild',foes:[{species:'slowbro',level:50}],canLose:true,expGain:false};
 const s=await app.startBattle(request);s.take();assert.equal(s.gw.readState('p1')[0].hp,m.hp);assert.equal(s.gw.readState('p2')[0].maxhp,plan.foeMaxHP);
 assert.deepEqual(Object.keys(s.gw.readState('p2')[0].pp),['splash']);
 return{app,s,state,before,request,trace:[],cleanup(){app.abortBattle(request,Error('owned hp-app cleanup'));}};
}
function observation(w){return{p1:clone(w.s.gw.readState('p1')[0]),p2:clone(w.s.gw.readState('p2')[0])};}
function unchanged(w){assert.deepEqual(w.state.read(),w.before,'actual Session work cannot change persistent state before App finish');assert.equal(w.state.replaced.length,0);}
function verifyStep(move,row){
 const {before:b,after:a,events}=row;
 assert.equal(a.p1.pp[move],b.p1.pp[move]-1,'one PP for the actual player use');
 for(const [id,pp]of Object.entries(b.p1.pp))if(id!==move)assert.equal(a.p1.pp[id],pp);
 assert.equal(a.p2.pp.splash,b.p2.pp.splash-1,'the real foe acted in this turn');
 assert(events.some(e=>e.type==='move'&&e.args[0].startsWith('p1a:')));
 const damage=b.p2.hp-a.p2.hp;
 if(move==='recover'){
  assert.equal(damage,0);assert.equal(a.p1.hp,Math.min(b.p1.maxhp,b.p1.hp+Math.round(b.p1.maxhp/2)));
  if(b.p1.hp===b.p1.maxhp)assert(events.some(e=>e.type==='-fail'&&e.args[0].startsWith('p1a:')));
  else assert(events.some(e=>e.type==='-heal'&&e.args[0].startsWith('p1a:')));
 }else if(move==='gigadrain'){
  assert(damage>0&&a.p2.hp>0,'ordinary damage landed without ending this fixture');
  assert.equal(a.p1.hp,Math.min(b.p1.maxhp,b.p1.hp+Math.round(damage/2)),'drain uses actual HP loss, not power or theoretical damage');
  if(b.p1.hp<b.p1.maxhp)assert(events.some(e=>e.type==='-heal'&&e.args[0].startsWith('p1a:')));
 }else if(move==='doubleedge'){
  assert(damage>0&&a.p2.hp>0);assert.equal(a.p1.hp,b.p1.hp-Math.max(1,Math.round(damage/3)),'recoil uses actual target HP loss');
  assert(events.some(e=>e.type==='-damage'&&e.args[0].startsWith('p1a:')&&e.args.some(v=>/recoil/i.test(v))));
 }else assert.fail('unfrozen move');
}
for(const c of plan.cases)test(c.id+' '+c.check,async()=>{
 const w=await open(c);try{
  for(const move of c.sequence){
   const before=observation(w),slot=plan.playerMoves.indexOf(move)+1;assert(slot>0);unchanged(w);
   const r=await w.s.chooseMove(slot);assert(r.ok,JSON.stringify(r));const after=observation(w),events=r.messages.flatMap(m=>m.kind==='events'?m.events:[]);
   const row={move,before,after,messages:clone(r.messages),events:clone(events)};verifyStep(move,row);unchanged(w);w.trace.push(row);
  }
  const wrong=clone(w.trace[0]);wrong.after.p1.hp=wrong.after.p1.hp===wrong.before.p1.maxhp?wrong.after.p1.hp-1:wrong.after.p1.hp+1;
  assert.throws(()=>verifyStep(c.sequence[0],wrong),assert.AssertionError,'the same step oracle must reject one synthetic HP misread');
  const beforeEnd=observation(w);
  if(c.exit==='abort'){
   w.app.abortBattle(w.request,Error('owned normal player lifecycle exit'));unchanged(w);
   const outcome=w.app.finishBattle(w.s,w.request);assert.equal(outcome.commit,'none');assert.equal(outcome.aborted,true);unchanged(w);
   console.log('E_HP_APP_OBSERVATION '+JSON.stringify({id:c.id,featureIds:c.featureIds,initial:w.before,trace:w.trace,beforeEnd,outcome,saved:clone(w.state.read()),installs:0,syntheticWrongReadout:'rejected',completeHeading:false,NW:0}));return;
  }
  const r=await w.s.run();assert(r.ok,JSON.stringify(r));assert(w.s.finished);assert.equal(w.s.ended.reason,'run');unchanged(w);
  const result=w.s.result(),patch=result.members['HP-P1'];assert.equal(patch.hp,beforeEnd.p1.hp);assert.equal(patch.status,'');assert.equal(patch.statusCount,0);
  for(const slot of patch.moves)assert.equal(slot.pp,beforeEnd.p1.pp[slot.id]);
  const outcome=w.app.finishBattle(w.s,w.request);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));assert.equal(w.state.replaced.length,1);
  const saved=clone(w.state.read()),installed=saved.party[0];assert.equal(installed.hp,patch.hp);assert.equal(installed.status,'');
  assert.deepEqual(installed.moves.map(({id,pp,maxpp})=>({id,pp,maxpp})),patch.moves);
  assert.equal(saved.appliedBattles[c.id].hash,E.state.resultHash(result));assert.deepEqual(Object.keys(saved.appliedBattles),[c.id]);
  assert.deepEqual(saved.inventory,w.before.inventory);assert.equal(saved.money,w.before.money);assert.equal(installed.exp,w.before.party[0].exp);
  w.app.finishBattle(w.s,w.request);assert.equal(w.state.replaced.length,1);assert.deepEqual(w.state.read(),saved,'repeat finish cannot restore old HP/PP or install twice');
  console.log('E_HP_APP_OBSERVATION '+JSON.stringify({id:c.id,featureIds:c.featureIds,initial:w.before,trace:w.trace,beforeEnd,result,outcome,saved,installs:1,syntheticWrongReadout:'rejected',completeHeading:false,NW:0}));
 }finally{w.cleanup();}
});
