'use strict';
// Synthetic authored records, real pinned Gen8 opening, permanent PP items and App settlement.
// WP21 §4.2: Iron Head -> Behemoth move clamps current PP, retains PP Ups, and reverts at battle end.
const test = require('node:test'), assert = require('node:assert/strict');
const {E,T,inputs} = require('./trainer-ai-integration/fixtures.cjs');
const G = E.gateway.BattleGateway;
const DOGS = [['Zacian','rustedsword','behemothblade'],['Zamazenta','rustedshield','behemothbash']];
const clone = v => structuredClone(v);
const state = (gw,id='A',side='p1') => gw.readState(side).find(m=>m.id===id);
const actor = (gw,id='A',side='p1') => gw._debugBattle().getSide(side).pokemon.find(m=>m.name===id);
const request = gw => gw.awaitingChoice('p1');
async function start(gw) { assert(await gw.choose('p1','team 12')); assert(await gw.choose('p2','team 1')); gw.drain(); }
async function turn(gw,choice) { assert(await gw.choose('p1',choice)); assert(await gw.choose('p2','move 1')); return gw.drain(); }
async function gateway([species,item],{pp=2,ups=0,moves=['ironhead','splash'],preview=false,seed=true,foeMoves=['protect']}={}) {
 const gw=await G.create({formatid:'gen8rpgcustomgame',seed:[1,2,3,4],players:[
  {name:'Player',team:[{name:'A',species,item,level:50,moves},{name:'R',species:'Snorlax',level:100,moves:['splash'],ability:'Immunity'}]},
  {name:'Foe',team:[{name:'B',species:'Snorlax',level:100,moves:foeMoves,ability:'Immunity'}]}
 ]});
 if(seed) gw.seedState('p1',[{id:'A',hp:999,moves:[{id:moves[0],pp,maxpp:15+3*ups}]}]);
 if(!preview) await start(gw);
 return gw;
}
for(const dog of DOGS)for(const ups of [0,1,2,3])for(const amount of ['zero','low','full'])test(dog[0]+' opening '+amount+' PP, PP Ups='+ups,async()=>{
 const saved=amount==='zero'?0:amount==='low'?2:15+3*ups,cap=5+ups;
 const gw=await gateway(dog,{pp:saved,ups}),p=actor(gw),live=request(gw).active[0].moves[0];
 assert.equal(p.baseMoveSlots[0].id,dog[2]);assert.equal(p.ppUps[0],ups);
 assert.equal(live.id,dog[2]);assert.equal(live.maxpp,cap);assert.equal(live.pp,Math.min(saved,cap));assert.equal(live.disabled,saved===0);
 assert.equal(state(gw).pp.ironhead,Math.min(saved,cap));assert.equal(state(gw).pp[dog[2]],undefined);assert.equal(state(gw).ppMax.ironhead,cap);
 assert.equal(gw.permanentMoveSlot('p1','A','ironhead'),0);assert.equal(gw.permanentMoveSlot('p1','A',dog[2]),null);
 const old=state(gw).pp.ironhead;
 if(saved) {await turn(gw,'move 1');assert.equal(state(gw).pp.ironhead,old-1);assert.equal(request(gw).active[0].moves[0].pp,old-1);}
 else {assert.equal(await gw.choose('p1','move 1'),false);assert.equal(state(gw).pp.ironhead,0);}
});
for(const dog of DOGS)test(dog[0]+' opening mapping survives preview and live checkpoints, bench recovery and switch-back',async()=>{
 let gw=await gateway(dog,{pp:1,ups:2,preview:true});gw=await G.fromCheckpoint(gw.checkpoint());await start(gw);
 assert.equal(state(gw).pp.ironhead,1);assert.equal(request(gw).active[0].moves[0].maxpp,7);
 await turn(gw,'move 1');gw=await G.fromCheckpoint(gw.checkpoint());assert.equal(state(gw).pp.ironhead,0);
 await turn(gw,'switch 2');assert(await gw.act('p1',{kind:'item',item:'maxether',target:'A',moveSlot:gw.permanentMoveSlot('p1','A','ironhead')}));assert(await gw.choose('p2','move 1'));gw.drain();
 assert.equal(state(gw).pp.ironhead,7);gw=await G.fromCheckpoint(gw.checkpoint());
 const back=request(gw).side.pokemon.findIndex(m=>m.ident==='p1: A')+1;await turn(gw,'switch '+back);
 assert.equal(request(gw).active[0].moves[0].id,dog[2]);assert.equal(request(gw).active[0].moves[0].pp,7);assert.equal(gw.permanentMoveSlot('p1','A','ironhead'),0);
});
for(const dog of DOGS)test(dog[0]+' a native no-seed opener maps identity without increasing its native full PP',async()=>{
 const gw=await gateway(dog,{seed:false});assert.equal(state(gw).pp.ironhead,8);assert.equal(request(gw).active[0].moves[0].maxpp,8);
});
for(const dog of DOGS)test(dog[0]+' absent or wrong item does not alias an unchanged Iron Head',async()=>{
 for(const item of ['',dog[1]==='rustedsword'?'rustedshield':'rustedsword']) {
  const gw=await gateway([dog[0],item],{pp:2,ups:3});assert.equal(request(gw).active[0].moves[0].id,'ironhead');assert.equal(state(gw).pp.ironhead,2);assert.equal(state(gw).ppMax,undefined);
 }
});
test('unrelated permanent Behemoth move and copied Behemoth move never gain an Iron Head identity',async()=>{
 const gw=await G.create({formatid:'gen8rpgcustomgame',seed:[1,2,3,4],players:[{name:'P',team:[{name:'A',species:'Ditto',moves:['transform']}]},{name:'F',team:[{name:'B',species:'Zacian',item:'rustedsword',moves:['ironhead','splash']}]}]});
 assert(await gw.choose('p1','team 1'));assert(await gw.choose('p2','team 1'));gw.drain();
 assert(await gw.choose('p1','move 1'));assert(await gw.choose('p2','move 2'));gw.drain();
 assert.equal(request(gw).active[0].moves[0].id,'behemothblade');assert.equal(state(gw).pp.ironhead,undefined);assert.equal(state(gw).pp.behemothblade,undefined);assert.equal(gw.permanentMoveSlot('p1','A','ironhead'),null);
 assert.equal(state(gw,'B','p2').pp.ironhead,8);
 const plain=await gateway(['Snorlax',''],{seed:false,moves:['behemothblade','splash']});assert.equal(state(plain).pp.behemothblade,8);assert.equal(state(plain).pp.ironhead,undefined);assert.equal(plain.permanentMoveSlot('p1','A','behemothblade'),0);
});
for(const mode of ['transform','mimic'])test('crowned permanent PP and '+mode+' copies remain separate through recovery and restore',async()=>{
 let gw=await gateway(DOGS[0],{pp:1,moves:['ironhead',mode],foeMoves:['splash']});
 // Natural actions produce the temporary copy; no private slot mutation.
 if(mode==='mimic')await turn(gw,'move 1');
 await turn(gw,'move 2');const copied=request(gw).active[0].moves.find(m=>m.id==='splash');assert(copied);
 const before=clone(copied),old=state(gw).pp.ironhead;
 gw=await G.fromCheckpoint(gw.checkpoint());assert(await gw.act('p1',{kind:'item',item:'maxether',target:'A',moveSlot:0}));assert(await gw.choose('p2','move 1'));gw.drain();
 assert.equal(state(gw).pp.ironhead,5);assert.equal(request(gw).active[0].moves.find(m=>m.id==='splash').pp,before.pp);assert(old<5);
 assert.equal(state(gw).pp.splash,undefined);assert.equal(gw.permanentMoveSlot('p1','A','splash'),null);
});
test('growth replacement resolves the original Iron Head identity and removes its mapping',async()=>{
 let gw=await gateway(DOGS[0]);gw=await G.fromCheckpoint(gw.checkpoint());
 gw.applyGrowth('p1','A',{level:50,newMoves:['Rest'],replaceSlot:1,replaceMoveId:'ironhead'});gw.refreshRequests();
 assert.equal(gw.permanentMoveSlot('p1','A','ironhead'),null);assert.equal(gw.permanentMoveSlot('p1','A','rest'),0);
 assert.deepEqual(Object.keys(state(gw).pp),['rest','splash']);assert.equal(state(gw).ppMax,undefined);assert.equal(request(gw).active[0].moves[0].id,'rest');
});
async function appWorld(dog,{pp=2,ups=0,item='ether'}={}) {
 const [species,held]=dog,input=inputs({party:1,moves:['splash']});
 input.species.push({id:species.toLowerCase(),showdownId:species.toLowerCase(),nameKey:'species.'+species.toLowerCase(),growth:'slow',baseExp:335,evYield:{},catchRate:10,learnset:['ironhead','splash'].map(move=>({level:1,move})),source:'author-placeholder'});
 if(!input.items.some(i=>i.id===held))input.items.push({id:held,name:held,namePlural:held,pocket:1,price:0,source:'author-placeholder'});
 input.trainers[0].party[0].level=3;
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));
 const dex=E.dex.createDexLookup(),joined=E.contentRuntime.assembleContent(compiled.data,dex);assert.deepEqual(joined.errors,[]);const content=joined.content;
 const mon=E.memberFactory.createMember({id:'A',species,level:50},content,()=>0);mon.item=held;mon.moves[0].maxpp=15+ups*3;mon.moves[0].ppUps=ups;mon.moves[0].pp=pp;
 const game=E.state.newGame({content,party:[E.speciesKey.toPersistentMember(mon,content)],bag:{[item]:2},money:1000});game.nextMemberOrdinal='2';
 const port=T.fakes.createMemoryState(game),initial=clone(port.read());
 const app=new E.app.GameApplication({state:port,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4]}),content:()=>({content,dex}),random:()=>0,clock:()=>12345});
 const req={battleId:'crowned-pp-'+species,trainer:{id:'c-basic',version:1},seq:1,canLose:true,expGain:false,moneyGain:false};
 const s=await app.startTrainerBattle(req);s.take();return {s,app,port,initial,req};
}
for(const dog of DOGS)for(const item of ['ether','maxether','leppaberry','elixir','maxelixir'])test(dog[0]+' sorted Summary '+item+' recovery, full refusal and authenticated final writeback',async()=>{
 const w=await appWorld(dog,{pp:0,ups:3,item}),{s}=w;
 try {
  assert.equal(s.party[0].moves[0].pp,0);const engine=s.gw.snapshot();assert.equal(await E.session.reorderBattleSummaryMoves(s,'A',0,1,['ironhead','splash']),true);assert.equal(s.gw.snapshot(),engine);
  assert.deepEqual(s.party[0].moves.map(m=>m.id),['splash','ironhead']);assert.equal(s.gw.permanentMoveSlot('p1','A','ironhead'),0);
  const slot=['elixir','maxelixir'].includes(item)?undefined:1;
  assert((await s.useItem(item,'A',{moveSlot:slot,commit:false})).ok);await s.cancel();assert.equal(s.bag[item],2);assert.equal(state(s.gw).pp.ironhead,0);
  assert((await s.useItem(item,'A',{moveSlot:slot})).ok);assert.equal(state(s.gw).pp.ironhead,8);assert.equal(s.party[0].moves[1].pp,8);assert.equal(s.party[0].moves[1].maxpp,24);assert.equal(s.bag[item],1);
  await s._restoreCheckpoint(s._checkpoint());const snap=s.gw.snapshot(),ledger=clone(s.ledger);
  assert.deepEqual(s.canUseItem(item,'A',slot),{ok:false,reason:'item-no-effect'});assert.deepEqual(await s.useItem(item,'A',{moveSlot:slot}),{ok:false,reason:'item-no-effect'});
  assert.equal(s.gw.snapshot(),snap);assert.deepEqual(s.ledger,ledger);assert.equal(s.bag[item],1);assert.deepEqual(w.port.read(),w.initial);assert.equal(w.port.replaced.length,0);
  assert((await s.chooseMove(1)).ok);assert(s.finished);const result=s.result();assert.deepEqual(result.members.A.moves,[{id:'splash',pp:40,maxpp:40},{id:'ironhead',pp:7,maxpp:24}]);
  const outcome=w.app.finishBattle(s,w.req);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));assert.equal(w.port.replaced.length,1);const saved=clone(w.port.read());
  assert.deepEqual(saved.party[0].moves.map(({id,pp,maxpp})=>({id,pp,maxpp})),result.members.A.moves);assert.equal(saved.party[0].moves[1].ppUps,3);assert.equal(saved.party[0].species,dog[0].toLowerCase());assert.equal(saved.party[0].item,dog[1]);
  assert.equal(saved.appliedBattles[w.req.battleId].hash,E.state.resultHash(result));w.app.finishBattle(s,w.req);assert.equal(w.port.replaced.length,1);assert.deepEqual(w.port.read(),saved);
 } finally {w.app.abortBattle(w.req,Error('owned crowned PP test cleanup'));}
});
for(const dog of DOGS)for(const finish of ['commit','abort'])test(dog[0]+' low-PP App move is spent with '+finish+' preservation',async()=>{
 const w=await appWorld(dog,{pp:2});try {
  assert((await w.s.chooseMove(1)).ok);assert.equal(w.s.result().members.A.moves[0].pp,1);
  if(finish==='commit') {const result=w.app.finishBattle(w.s,w.req);assert.equal(result.commit,'applied',JSON.stringify(result));assert.equal(w.port.read().party[0].moves[0].pp,1);assert.equal(w.port.read().party[0].moves[0].maxpp,15);assert.equal(w.port.read().party[0].moves[0].ppUps,0);}
  else {w.app.abortBattle(w.req,Error('owned abort'));assert.deepEqual(w.port.read(),w.initial);assert.equal(w.port.replaced.length,0);}
 }finally{w.app.abortBattle(w.req,Error('cleanup'));}
});
for(const dog of DOGS)test(dog[0]+' zero PP only move exposes real Struggle, never a refilled signature move',async()=>{
 const gw=await gateway(dog,{pp:0,moves:['ironhead']});assert.deepEqual(request(gw).active[0].moves.map(m=>m.id),['struggle']);assert.equal(state(gw).pp.ironhead,0);
 await turn(gw,'move 1');assert.equal(state(gw).pp.ironhead,0);
});
