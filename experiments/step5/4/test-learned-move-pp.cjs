'use strict';
// Actual Gateway/Session use after learning; no direct writes to engine objects.
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../../../js/engine/build/production.cjs'),F=require('../../../js/engine/fixtures/game.cjs');
const G=E.gateway.BattleGateway,read=(gw,id='A')=>gw.readState('p1').find(m=>m.id===id);
const mon=(name,species,moves,ability='Immunity')=>({name,species,level:100,moves,ability});
async function open(team=[mon('A','Snorlax',['growl','splash','tackle','protect'])],foe=mon('B','Snorlax',['tackle'])){
 const gw=await G.create({formatid:'gen8rpgcustomgame',seed:[1,2,3,4],players:[{name:'P1',team},{name:'P2',team:[foe]}]});
 assert(await gw.choose('p1',team.length===1?'team 1':'team 12'));assert(await gw.choose('p2','team 1'));gw.drain();return gw;
}
async function turn(gw,choice,foe='move 1'){
 assert(await gw.choose('p1',choice));assert(await gw.choose('p2',foe));
 const messages=gw.drain();assert(!messages.some(m=>m.kind==='error'));return messages.flatMap(m=>m.kind==='events'?m.events:[]);
}
const request=gw=>gw.awaitingChoice('p1');
function learnRest(gw,replaceSlot){gw.applyGrowth('p1','A',{level:100,newMoves:['Rest'],...(replaceSlot===undefined?{}:{replaceSlot})});gw.refreshRequests();}
for(const mode of ['replace','append'])test('ordinary learned Rest '+mode+' PP matches the published request after actual healing',async()=>{
 const gw=await open(mode==='append'?[mon('A','Snorlax',['growl'])]:undefined);await turn(gw,'move 1');
 assert(read(gw).hp<read(gw).maxhp);learnRest(gw,mode==='replace'?1:undefined);assert.equal(request(gw).active[0].moves[1].pp,10);
 const events=await turn(gw,'move 2');assert(events.some(e=>e.type==='move'&&e.args[1]==='Rest'));assert.equal(read(gw).status,'slp');
 assert.equal(request(gw).active[0].moves[1].pp,9);assert.equal(read(gw).pp.rest,9,'permanent PP must reflect the actual newly learned use');
});
test('a real Session automatic append consumes the learned Rest in working data without writing the input game',async()=>{
 const content=structuredClone(F.content);content.species.Snorlax.learnset[51]=['Rest'];
 const game=E.state.newGame({content,party:[F.member('LEARNER','Snorlax',50,{moves:['tackle'],ability:'Immunity'})],bag:{},money:1000});
 game.party[0].exp=E.growth.minExp(content.species.Snorlax.growth,51)-1;game.party[0].hp-=20;const before=JSON.stringify(game);
 const s=await E.session.BattleSession.create({game,content,battleId:'learned-pp-append',seed:[1,2,3,4],foe:{kind:'trainer',team:[F.foeMember('F1','Pidgey',3,{moves:['tackle']}),F.foeMember('F2','Pidgey',4,{moves:['tackle']})]}});s.take();
 const first=await s.chooseMove(1);assert(first.ok);assert.equal(s.ended,null);assert.equal(s.pendingLearn,null);assert.equal(s.party[0].moves[1].id,'rest');
 const used=await s.chooseMove(2);assert(used.ok);assert(used.messages.flatMap(m=>m.events??[]).some(e=>e.type==='move'&&e.args[1]==='Rest'));
 assert.equal(s.currentRequest().active[0].moves[1].pp,9);assert.equal(s.gw.readState('p1')[0].pp.rest,9);assert.equal(s.party[0].moves[1].pp,9);assert.equal(JSON.stringify(game),before);
});
test('checkpoint restore retains normal learned PP use',async()=>{
 let gw=await open();await turn(gw,'move 1');learnRest(gw,1);gw=await G.fromCheckpoint(gw.checkpoint());
 assert.equal(request(gw).active[0].moves[1].pp,10);await turn(gw,'move 2');assert.equal(request(gw).active[0].moves[1].pp,9);assert.equal(read(gw).pp.rest,9);
});
test('actual Transform temporary PP stays separate from learned permanent PP and switch-back use',async()=>{
 const gw=await open([mon('A','Ditto',['transform'],'Limber'),mon('R','Snorlax',['splash'])],mon('B','Snorlax',['splash']));
 const originalTransform=read(gw).pp.transform;learnRest(gw);await turn(gw,'move 1');
 assert.equal(request(gw).active[0].moves[0].id,'splash');assert.equal(request(gw).active[0].moves[0].pp,5);await turn(gw,'move 1');
 assert.equal(request(gw).active[0].moves[0].pp,4);assert.equal(read(gw).pp.rest,10);assert.equal(read(gw).pp.transform,originalTransform-1);assert.equal(read(gw).pp.splash,undefined);
 await turn(gw,'switch 2');const back=request(gw).side.pokemon.findIndex(m=>m.ident==='p1: A');assert(back>=0);await turn(gw,'switch '+(back+1));
 assert.equal(request(gw).active[0].moves[1].id,'rest');const events=await turn(gw,'move 2');assert(events.some(e=>e.type==='move'&&e.args[1]==='Rest'));
 // Full-HP Rest may fail to heal here, but its actual use still spends one PP; main cases prove healing.
 assert.equal(request(gw).active[0].moves[1].pp,9);assert.equal(read(gw).pp.rest,9);assert.equal(read(gw).pp.splash,undefined);
});
test('actual Mimic copy consumes temporary Tackle while permanent Mimic and learned Rest remain distinct',async()=>{
 const gw=await open([mon('A','Snorlax',['mimic','growl'])],mon('B','Pidgey',['tackle'],'Keen Eye'));learnRest(gw,1);const mimic=read(gw).pp.mimic;
 await turn(gw,'move 1');assert.equal(request(gw).active[0].moves[0].id,'tackle');assert.equal(read(gw).pp.mimic,mimic-1);const copied=request(gw).active[0].moves[0].pp;
 await turn(gw,'move 1');assert.equal(request(gw).active[0].moves[0].pp,copied-1);assert.equal(read(gw).pp.mimic,mimic-1);assert.equal(read(gw).pp.tackle,undefined);
 const events=await turn(gw,'move 2');assert(events.some(e=>e.type==='move'&&e.args[1]==='Rest'));assert.equal(read(gw).status,'slp');assert.equal(request(gw).active[0].moves[1].pp,9);
 assert.equal(read(gw).pp.rest,9);assert.equal(read(gw).pp.mimic,mimic-1);assert.equal(read(gw).pp.tackle,undefined);
});


test('learning while already Transformed keeps temporary PP off the permanent slot through restore and switch-back',async()=>{
 let gw=await open([mon('A','Ditto',['transform'],'Limber'),mon('R','Snorlax',['splash'])],mon('B','Snorlax',['splash']));
 const events=await turn(gw,'move 1');assert(events.some(e=>e.type==='-transform'));assert.equal(request(gw).active[0].moves[0].id,'splash');
 learnRest(gw,0);gw=await G.fromCheckpoint(gw.checkpoint());assert.equal(request(gw).active[0].moves[0].id,'rest');assert.equal(read(gw).pp.rest,10);
 await turn(gw,'move 1');assert.equal(request(gw).active[0].moves[0].pp,9);assert.equal(read(gw).pp.rest,10,'a use while transformed is temporary, even after a public growth installation');
 await turn(gw,'switch 2');const back=request(gw).side.pokemon.findIndex(m=>m.ident==='p1: A');await turn(gw,'switch '+(back+1));
 assert.equal(request(gw).active[0].moves[0].id,'rest');assert.equal(request(gw).active[0].moves[0].pp,10);assert.equal(read(gw).pp.rest,10);
});

// G-1 regression: real Summary order command, natural KO/growth and real App finish/abort.
// These are explicit author HM classifications, not claims about official Gen8 HM lists.
const G1_ORDER=['tackle','growl','splash','protect'],copyG1=v=>JSON.parse(JSON.stringify(v));
async function sortedHmWorld(hmMove){
 const {T,inputs}=require('./trainer-ai-integration/fixtures.cjs');
 const input=inputs({moves:['splash'],party:2});
 input.species.find(s=>s.id==='snorlax').learnset=[...G1_ORDER.map(move=>({level:1,move})),{level:51,move:'rest'}];
 for(const trainer of input.trainers)for(const member of trainer.party)member.level=3;
 input.items.push({id:'g1-synthetic-hm',name:'Synthetic HM',namePlural:'Synthetic HMs',pocket:4,fieldUse:'hm',move:hmMove,flags:['HM'],consumable:false,source:'author-placeholder'});
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));
 const joined=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(joined.errors,[]);const content=joined.content;
 const m=E.memberFactory.createMember({id:'G1-P1',species:'Snorlax',level:50,nature:'hardy',abilityIndex:1},content,()=>0);assert.deepEqual(m.moves.map(x=>x.id),G1_ORDER);
 const game=E.state.newGame({content,party:[E.speciesKey.toPersistentMember(m,content)],money:1000});game.party[0].exp=E.growth.minExp(content.species.Snorlax.growth,51)-1;game.nextMemberOrdinal='2';
 const state=T.fakes.createMemoryState(game),initial=copyG1(state.read());
 const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4]}),content:()=>({content}),random:()=>0,clock:()=>12345});
 const request={battleId:'G1-order-'+hmMove,seq:1,trainer:{id:'c-basic',version:1},canLose:true},s=await app.startTrainerBattle(request);s.take();
 return{app,state,initial,request,s,id:m.id};
}
for(const hmMove of ['tackle','growl'])test('summary sorted '+hmMove+' HM is protected at its new slot while ordinary replacement follows identity',async()=>{
 const w=await sortedHmWorld(hmMove),{app,s,state,initial,id}=w;
 try{
  const calls=[],apply=s.gw.applyGrowth.bind(s.gw);
  s.gw.applyGrowth=(...args)=>{calls.push(copyG1(args));return apply(...args);}; // G1_DELEGATE_UNCHANGED
  const unchanged=()=>{assert.deepEqual(state.read(),initial);assert.equal(state.replaced.length,0);};
  const oldEngine=s.gw.snapshot();assert.deepEqual(s.currentRequest().active[0].moves.map(m=>m.id),G1_ORDER);
  assert.equal(await E.session.reorderBattleSummaryMoves(s,id,0,1,G1_ORDER),true);
  const sortedOrder=['growl','tackle','splash','protect'];assert.deepEqual(s.party[0].moves.map(m=>m.id),sortedOrder);
  assert.equal(s.gw.snapshot(),oldEngine,'the real sort command leaves the independent battle wrapper order unchanged');
  assert.deepEqual(s.currentRequest().active[0].moves.map(m=>m.id),G1_ORDER);unchanged();
  const ko=await s.chooseMove(1);assert(ko.ok,JSON.stringify(ko));assert.equal(s.party[0].level,51);assert.equal(s.pendingLearn.memberId,id);assert.equal(s.pendingLearn.move.id,'rest');
  const hmSlot=sortedOrder.indexOf(hmMove),normalSlot=hmSlot===0?1:0,normalMove=sortedOrder[normalSlot];
  assert.deepEqual(E.battlePresentation.readBattleLearnProtection(s,hmSlot),{version:1,memberId:id,slot:hmSlot,moveId:hmMove,reason:'hm-protected'});
  assert.equal(E.battlePresentation.readBattleLearnProtection(s,normalSlot),null,'the ordinary move must not inherit protection from the old engine slot');
  const checkpoint=JSON.stringify(s._checkpoint()),pending=s.pendingLearn,beforeRefusals=copyG1(s.party[0]);
  for(let retry=0;retry<2;retry++){
   assert.deepEqual(await s.decideLearn(hmSlot),[]);assert.equal(s.pendingLearn,pending);assert.equal(JSON.stringify(s._checkpoint()),checkpoint);unchanged();
  }
  const learned=await s.decideLearn(normalSlot);assert.equal(s.pendingLearn,null);assert(learned.some(x=>x.kind==='learned'&&x.move==='rest'));
  const afterLearning=copyG1(s.party[0]),enginePP=copyG1(read(s.gw,id).pp);
  assert.equal(afterLearning.moves[hmSlot].id,hmMove);assert.equal(afterLearning.moves[normalSlot].id,'rest');
  assert.equal(enginePP[normalMove],undefined,'only the selected ordinary identity is removed from the independently ordered engine');
  assert.equal(enginePP[hmMove],hmMove==='tackle'?34:40,'HM and its spent PP survive the other-slot replacement');assert.equal(enginePP.rest,10);
  const replacementCalls=calls.filter(x=>x[2].newMoves?.includes('Rest'));assert.equal(replacementCalls.length,1);
  assert.equal(replacementCalls[0][2].replaceSlot,normalSlot);assert.equal(replacementCalls[0][2].replaceMoveId,normalMove);unchanged();
  let result=null,outcome;
  if(hmMove==='tackle'){
   const slot=s.currentRequest().active[0].moves.findIndex(m=>m.id==='tackle')+1;assert(slot>0);assert((await s.chooseMove(slot)).ok);assert(s.finished);unchanged();
   result=s.result();outcome=app.finishBattle(s,w.request);assert.equal(outcome.commit,'applied');assert.equal(state.replaced.length,1);
   const saved=copyG1(state.read()),member=saved.party.find(m=>m.id===id);assert.deepEqual(member.moves.map(m=>m.id),['rest','tackle','splash','protect']);
   assert.equal(member.moves.find(m=>m.id==='tackle').pp,33);assert.equal(member.moves.find(m=>m.id==='rest').pp,10);assert.equal(read(s.gw,id).pp.tackle,33);
   assert.equal(saved.appliedBattles[w.request.battleId].hash,E.state.resultHash(result));assert.deepEqual(Object.keys(saved.appliedBattles),[w.request.battleId]);
   app.finishBattle(s,w.request);assert.equal(state.replaced.length,1);assert.deepEqual(state.read(),saved);
  }else{
   app.abortBattle(w.request,Error('owned G1 ordinary replacement observation complete'));outcome=app.finishBattle(s,w.request);assert.equal(outcome.commit,'none');assert(outcome.aborted);unchanged();
  }
  console.log('G1_HM_ORDER_OBSERVATION '+JSON.stringify({hmMove,normalMove,initial,sortedOrder,beforeRefusals,afterLearning,enginePP,replacementCall:replacementCalls[0],refusals:2,result,outcome,saved:copyG1(state.read()),installs:state.replaced.length,NW:0}));
 }finally{app.abortBattle(w.request,Error('owned G1 sorted HM regression cleanup'));}
});
