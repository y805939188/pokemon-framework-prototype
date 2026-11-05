'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {E,T,inputs}=require('./trainer-ai-integration/fixtures.cjs'),plan=require('./e-multihit-app-contracts.json');
const clone=v=>JSON.parse(JSON.stringify(v)),ev=messages=>messages.flatMap(m=>m.kind==='events'?m.events:[]);
assert.equal(plan.schema,1);assert.deepEqual(plan.seed,[1,2,3,4]);assert.equal(plan.completeHeading,false);
assert.equal(fs.readFileSync(path.resolve(__dirname,'../../../js/engine/showdown/SOURCE_SHA'),'utf8').trim(),plan.showdownSHA);
async function open(c){
 const input=inputs({moves:['splash']});
 for(const [id,moves]of [['cloyster',plan.playerMoves],['slowbro',['splash']]]){
  assert(!input.species.some(s=>s.id===id));
  input.species.push({id,showdownId:id,nameKey:'species.'+id,growth:'medium',baseExp:100,evYield:{},catchRate:45,learnset:moves.map(move=>({level:1,move})),source:'author-placeholder'});
 }
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));
 const joined=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(joined.errors,[]);const content=joined.content;
 const m=E.memberFactory.createMember({id:'MH-P1',species:'Cloyster',level:50,nature:'hardy',abilityIndex:c.abilityIndex},content,()=>0);
 assert.equal(m.ability,c.ability);assert.equal(m.hp,plan.playerMaxHP);
 const game=E.state.newGame({content,party:[E.speciesKey.toPersistentMember(m,content)],money:1000});game.nextMemberOrdinal='2';
 const state=T.fakes.createMemoryState(game),initial=clone(state.read());
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[...plan.seed]}),content:()=>({content}),random:()=>0,clock:()=>12345});
 const request={battleId:c.id,seq:1,kind:'wild',foes:[{species:c.foe,level:c.foeLevel}],canLose:true,expGain:false};
 const s=await app.startBattle(request);s.take();const before=observation(s);
 assert.equal(before.p2.maxhp,c.foeMaxHP);assert(before.p1.stats.spe>before.p2.stats.spe,'the ordinary run fixtures have strictly higher unmodified speed; no first-escape assumption at equal speed');
 assert.deepEqual(Object.keys(before.p2.pp),['splash']);
 return{app,s,state,request,initial,before,cleanup(){app.abortBattle(request,Error('owned multihit App cleanup'));}};
}
function observation(s){return{p1:clone(s.gw.readState('p1')[0]),p2:clone(s.gw.readState('p2')[0])};}
function unchanged(w){assert.deepEqual(w.state.read(),w.initial);assert.equal(w.state.replaced.length,0);}
function verify(c,o){
 const b=o.before,a=o.after,events=ev(o.messages),hits=events.filter(e=>e.type==='-damage'&&e.args[0].startsWith('p2a:'));
 assert.equal(events.filter(e=>e.type==='move'&&e.args[0].startsWith('p1a:')).length,1,'one move use, not one use per hit');
 assert.equal(a.p1.pp[c.move],b.p1.pp[c.move]-1,'one actual PP consumed for the entire use');
 for(const [id,pp]of Object.entries(b.p1.pp))if(id!==c.move)assert.equal(a.p1.pp[id],pp);
 assert.equal(a.p1.hp,b.p1.hp);assert(hits.length>=c.minHits&&hits.length<=c.maxHits,'actual completed hit count');
 const count=events.filter(e=>e.type==='-hitcount'&&e.args[0].startsWith('p2a:'));
 if(c.ko){assert.equal(o.finished,true);assert.equal(o.endReason,'win');assert(count.length<=1,'terminal metadata must not duplicate counts');}
 else assert.equal(count.length,1,'a surviving-target multihit use retains its summary');
 if(count.length)assert.equal(Number(count[0].args[1]),hits.length,'reported count equals actual target HP submissions');
 let hp=b.p2.hp;
 for(const hit of hits){const m=/^(\d+)(?:\/(\d+))?(?:\s|$)/.exec(hit.args[1]);assert(m,'actual HP wire required');const next=Number(m[1]);if(m[2])assert.equal(Number(m[2]),b.p2.maxhp);assert(next<hp&&next>=0);hp=next;}
 assert.equal(a.p2.hp,hp);assert.equal(a.p2.hp===0,c.ko,'a KO stops remaining planned strikes');
 assert.equal(a.p2.pp.splash,b.p2.pp.splash-(c.ko?0:1),'the living foe acts once; a first-hit KO prevents its move');
 assert.equal(events.filter(e=>e.type==='faint'&&e.args[0].startsWith('p2a:')).length,c.ko?1:0);
}
for(const c of plan.cases)test(c.id+' '+c.check,async()=>{
 const w=await open(c);try{
  unchanged(w);const r=await w.s.chooseMove(plan.playerMoves.indexOf(c.move)+1);assert(r.ok,JSON.stringify(r));
  const row={before:w.before,after:observation(w.s),messages:clone(r.messages),finished:w.s.finished,endReason:w.s.finished?w.s.ended.reason:null};
  try{verify(c,row);}catch(error){console.log('E_MULTIHIT_APP_FAILED_OBSERVATION '+JSON.stringify({id:c.id,initial:w.initial,...row}));throw error;}unchanged(w);
  const wrong=clone(row);wrong.after.p1.pp[c.move]=wrong.before.p1.pp[c.move];assert.throws(()=>verify(c,wrong),assert.AssertionError,'same oracle rejects a missed PP charge');
  if(c.exit==='abort'){
   w.app.abortBattle(w.request,Error('owned normal lifecycle abort'));unchanged(w);const outcome=w.app.finishBattle(w.s,w.request);assert.equal(outcome.commit,'none');assert.equal(outcome.aborted,true);unchanged(w);
   console.log('E_MULTIHIT_APP_OBSERVATION '+JSON.stringify({id:c.id,featureIds:plan.featureIds,initial:w.initial,...row,outcome,saved:clone(w.state.read()),installs:0,syntheticWrongReadout:'rejected',completeHeading:false,NW:0}));return;
  }
  let ending=[];
  if(!c.ko){const finish=await w.s.run();assert(finish.ok,JSON.stringify(finish));ending=clone(finish.messages);}
  assert(w.s.finished);assert.equal(w.s.ended.reason,c.ko?'win':'run');unchanged(w);
  const result=w.s.result(),patch=result.members['MH-P1'];assert.equal(patch.hp,row.after.p1.hp);
  for(const slot of patch.moves)assert.equal(slot.pp,row.after.p1.pp[slot.id]);
  const outcome=w.app.finishBattle(w.s,w.request);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));assert.equal(w.state.replaced.length,1);
  const saved=clone(w.state.read()),installed=saved.party[0];assert.equal(installed.hp,patch.hp);assert.equal(installed.exp,w.initial.party[0].exp);assert.deepEqual(installed.evs,w.initial.party[0].evs);
  assert.deepEqual(installed.moves.map(({id,pp,maxpp})=>({id,pp,maxpp})),patch.moves);assert.equal(saved.appliedBattles[c.id].hash,E.state.resultHash(result));assert.deepEqual(Object.keys(saved.appliedBattles),[c.id]);
  assert.deepEqual(saved.inventory,w.initial.inventory);assert.equal(saved.money,w.initial.money);
  w.app.finishBattle(w.s,w.request);assert.equal(w.state.replaced.length,1);assert.deepEqual(w.state.read(),saved);
  console.log('E_MULTIHIT_APP_OBSERVATION '+JSON.stringify({id:c.id,featureIds:plan.featureIds,initial:w.initial,...row,ending,result,outcome,saved,installs:1,syntheticWrongReadout:'rejected',completeHeading:false,NW:0}));
 }finally{w.cleanup();}
});
