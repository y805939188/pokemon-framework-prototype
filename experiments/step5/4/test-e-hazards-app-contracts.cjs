'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {E,T,inputs}=require('./trainer-ai-integration/fixtures.cjs'),plan=require('./e-hazards-app-contracts.json');
const clone=x=>JSON.parse(JSON.stringify(x)),events=ms=>ms.flatMap(m=>m.kind==='events'?m.events:[]);
assert.equal(plan.schema,1);assert.deepEqual(plan.seed,[1,2,3,4]);assert.equal(plan.completeHeading,false);
assert.equal(fs.readFileSync(path.resolve(__dirname,'../../../js/engine/showdown/SOURCE_SHA'),'utf8').trim(),plan.showdownSHA);
const view=s=>({p1:clone(s.gw.readState('p1')),p2:clone(s.gw.readState('p2')),active:s.gw.activeId('p1')});
const member=(v,id)=>v.p1.find(m=>m.id===id),isP1=a=>a==='p1'||/^p1: /.test(a),norm=s=>s.replace(/^move: /,'').replace(/[^A-Za-z]/g,'').toLowerCase();
async function open(c){
 const input=inputs({moves:[c.hazard]});
 for(const [id,moves]of [['cloyster',['splash']],['slowbro',[c.hazard]]]){
  assert(!input.species.some(s=>s.id===id));input.species.push({id,showdownId:id,nameKey:'species.'+id,growth:'medium',baseExp:100,evYield:{},catchRate:45,learnset:moves.map(move=>({level:1,move})),source:'author-placeholder'});
 }
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));const joined=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(joined.errors,[]);const content=joined.content;
 const game=E.state.newGame({content,party:[],money:1000}),creation=[];
 for(let i=1;i<=2;i++){
  const draws=[],values=[0,0,4,0,0,0,0,0],ranges=[65536,65536,32,32,32,32,32,32];
  const m=E.memberFactory.createMember({id:'HAZ-P'+i,species:'Cloyster',level:50,form:0,nature:'hardy',abilityIndex:0},content,n=>{const at=draws.length;assert.equal(n,ranges[at]);const v=values[at];draws.push({n,v});return v;});
  assert.equal(draws.length,8);assert.equal(m.hp,112);assert.equal(m.ivs.hp,4);creation.push({id:m.id,draws});game.party.push(E.speciesKey.toPersistentMember(m,content));
 }
 game.nextMemberOrdinal='3';const state=T.fakes.createMemoryState(game),initial=clone(state.read());
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[...plan.seed]}),content:()=>({content}),random:()=>0,clock:()=>12345});
 const request={battleId:c.id,seq:1,kind:'wild',foes:[{species:'slowbro',level:60}],canLose:true,expGain:false},s=await app.startBattle(request);s.take();
 const first=view(s);assert(first.p1.every(m=>m.hp===112&&m.status===''));assert(member(first,'HAZ-P1').stats.spe*2/3>first.p2[0].stats.spe);
 return{app,s,state,request,initial,creation,first,trace:[],phase:'open'};
}
function unchanged(w){assert.equal(w.state.replaced.length,0);assert.deepEqual(w.state.read(),w.initial);}
function verifyEntry(row,c){
 const b=row.before,a=row.after,m=member(a,'HAZ-P2');assert.equal(b.active,'HAZ-P1');assert.equal(a.active,'HAZ-P2');assert.equal(member(b,'HAZ-P2').hp,112);
 assert.equal(m.hp,c.expected.hp);assert.equal(m.status,c.expected.status);assert.equal(m.statusCount,c.expected.statusCount);assert.equal(m.boosts.spe,c.expected.speedStage);
 assert.equal(member(a,'HAZ-P1').hp,112);assert.equal(member(a,'HAZ-P1').status,'');
 for(const old of b.p1)assert.deepEqual(member(a,old.id).pp,old.pp,'switch does not spend player move PP');
 assert.equal(a.p2[0].pp[c.hazard],b.p2[0].pp[c.hazard]-1);assert.equal(a.p2[0].hp,b.p2[0].hp);
 const ev=events(row.messages),target=e=>e.args[0]==='p1a: HAZ-P2'||e.args[0]==='p1: HAZ-P2';
 assert(ev.some(e=>e.type==='switch'&&target(e)));
 const hp=ev.filter(e=>e.type==='-damage'&&target(e));
 if(c.expected.hp===112)assert.equal(hp.length,0);else{assert.equal(hp.length,1);assert.equal(Number(hp[0].args[1].match(/^\d+/)[0]),c.expected.hp);}
 if(c.hazard==='toxicspikes')assert(ev.some(e=>e.type==='-status'&&target(e)&&e.args[1]==='psn'));
 if(c.hazard==='stickyweb')assert(ev.some(e=>e.type==='-unboost'&&target(e)&&e.args[1]==='spe'&&Number(e.args[2])===1));
}
for(const c of plan.cases)test(c.id+' '+c.check,async()=>{
 let w;try{
  w=await open(c);
  for(let n=0;n<c.layers;n++){
   w.phase='place-'+(n+1);unchanged(w);const before=view(w.s),r=await w.s.chooseMove(1);assert(r.ok,JSON.stringify(r));const after=view(w.s),ev=events(r.messages);
   assert.equal(after.active,'HAZ-P1');assert.equal(member(after,'HAZ-P1').pp.splash,member(before,'HAZ-P1').pp.splash-1);assert.equal(after.p2[0].pp[c.hazard],before.p2[0].pp[c.hazard]-1);
   assert(after.p1.every(m=>m.hp===112&&m.status===''&&Object.values(m.boosts).every(v=>v===0)));
   assert(ev.some(e=>e.type==='-sidestart'&&isP1(e.args[0])&&norm(e.args[1])===c.hazard),'actual opponent move established the intended p1 side hazard');
   unchanged(w);w.trace.push({before,after,messages:clone(r.messages)});
  }
  w.phase='entry';const before=view(w.s),r=await w.s.chooseSwitch('HAZ-P2');assert(r.ok,JSON.stringify(r));const entry={before,after:view(w.s),messages:clone(r.messages)};verifyEntry(entry,c);unchanged(w);
  const wrong=clone(entry);member(wrong.after,'HAZ-P2').hp++;assert.throws(()=>verifyEntry(wrong,c),assert.AssertionError);
  const wrongStatus=clone(entry);member(wrongStatus.after,'HAZ-P2').status=c.expected.status?'':'psn';assert.throws(()=>verifyEntry(wrongStatus,c),assert.AssertionError);
  const wrongStage=clone(entry);member(wrongStage.after,'HAZ-P2').boosts.spe++;assert.throws(()=>verifyEntry(wrongStage,c),assert.AssertionError);
  if(c.exit==='abort'){
   w.phase='abort';w.app.abortBattle(w.request,Error('owned hazard observation abort'));const outcome=w.app.finishBattle(w.s,w.request);assert.equal(outcome.commit,'none');assert(outcome.aborted);unchanged(w);
   console.log('E_HAZARDS_APP_OBSERVATION '+JSON.stringify({id:c.id,initial:w.initial,creation:w.creation,first:w.first,trace:w.trace,entry,outcome,saved:clone(w.state.read()),installs:0,syntheticWrongReadouts:3,completeHeading:false,NW:0}));return;
  }
  w.phase='run';const ending=await w.s.run();assert(ending.ok);assert(w.s.finished);assert.equal(w.s.ended.reason,'run');unchanged(w);
  const result=w.s.result();for(const m of entry.after.p1){const p=result.members[m.id];assert.equal(p.hp,m.hp);assert.equal(p.status,m.status);assert.equal(p.statusCount,m.statusCount);assert(!Object.hasOwn(p,'boosts'));for(const slot of p.moves)assert.equal(slot.pp,m.pp[slot.id]);}
  w.phase='finish';const outcome=w.app.finishBattle(w.s,w.request);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));assert.equal(w.state.replaced.length,1);const saved=clone(w.state.read());
  for(const m of saved.party){const old=w.initial.party.find(x=>x.id===m.id),p=result.members[m.id];assert.equal(m.hp,p.hp);assert.equal(m.status,p.status);assert.equal(m.statusCount,p.statusCount);assert(!Object.hasOwn(m,'boosts'));assert.deepEqual(m.moves.map(({id,pp,maxpp})=>({id,pp,maxpp})),p.moves);for(const [key,value]of Object.entries(old))if(!['hp','status','statusCount','moves'].includes(key))assert.deepEqual(m[key],value,key);}
  assert.deepEqual(saved.inventory,w.initial.inventory);assert.equal(saved.money,w.initial.money);assert.equal(saved.appliedBattles[c.id].hash,E.state.resultHash(result));w.app.finishBattle(w.s,w.request);assert.equal(w.state.replaced.length,1);assert.deepEqual(w.state.read(),saved);
  let nextBattle=null;
  if(c.check==='rocks-next-battle-reset'){
   w.phase='next-battle';const req={...w.request,battleId:c.id+'/next'},s=await w.app.startBattle(req);s.take();try{
    const initial=view(s);assert.equal(initial.active,'HAZ-P1');assert.equal(member(initial,'HAZ-P2').hp,c.expected.hp);const choice=await s.chooseSwitch('HAZ-P2');assert(choice.ok);const after=view(s);assert.equal(after.active,'HAZ-P2');assert.equal(member(after,'HAZ-P2').hp,c.expected.hp,'old rocks must not damage the next battle before its first fresh placement');assert(!events(choice.messages).some(e=>e.type==='-damage'&&(e.args[0]==='p1a: HAZ-P2'||e.args[0]==='p1: HAZ-P2')));
    assert.deepEqual(w.state.read(),saved);w.app.abortBattle(req,Error('owned next-battle hazard observation complete'));const retired=w.app.finishBattle(s,req);assert.equal(retired.commit,'none');assert(retired.aborted);assert.equal(w.state.replaced.length,1);assert.deepEqual(w.state.read(),saved);nextBattle={request:req,initial,after,messages:clone(choice.messages),outcome:retired};
   }finally{w.app.abortBattle(req,Error('owned next-battle cleanup'));}
  }
  w.phase='observed';console.log('E_HAZARDS_APP_OBSERVATION '+JSON.stringify({id:c.id,initial:w.initial,creation:w.creation,first:w.first,trace:w.trace,entry,ending:clone(ending.messages),result,outcome,saved,installs:1,nextBattle,syntheticWrongReadouts:3,completeHeading:false,NW:0}));
 }catch(error){if(w)console.log('E_HAZARDS_APP_FAILED_OBSERVATION '+JSON.stringify({id:c.id,phase:w.phase,initial:w.initial,creation:w.creation,first:w.first,trace:w.trace,current:view(w.s),saved:clone(w.state.read()),installs:w.state.replaced.length,error:{name:error.name,message:error.message}}));throw error;
 }finally{if(w)w.app.abortBattle(w.request,Error('owned hazard cleanup'));}
});
