'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const E = require('../../../js/engine/build/production.cjs'), T = require('../../../js/engine/build/testing.cjs');
const J = value => JSON.parse(JSON.stringify(value));
const source = path.resolve(__dirname, '../../../content/sample');
const read = name => JSON.parse(fs.readFileSync(path.join(source, name + '.json'), 'utf8'));
function content(extra = {}, foeMove = 'splash') {
  const input = Object.fromEntries(['manifest','sources','species','overlays','grants','regional-dex','settings','map-metadata'].filter(n => fs.existsSync(path.join(source,n+'.json'))).map(n => [n.replace(/-([a-z])/g,(_,x)=>x.toUpperCase()), read(n)]));
  input.species.find(s => s.id === 'snorlax').learnset = ['trick','payday','happyhour','splash'].map(move => ({level:1,move}));
  input.species.find(s => s.id === 'pidgey').learnset = [{level:1,move:foeMove}];
  input.items = Object.values(E.itemCatalog.legacyCatalog()).map(item=>({...item,source:'author-placeholder'}));
  for(const id of ['amuletcoin','luckincense','airballoon'])input.items.push({id,name:id,namePlural:id,pocket:1,price:0,source:'author-placeholder'});
  Object.assign(input,extra);
  const compiled = E.contentCompile.compileContent(input); assert.equal(compiled.ok,true,JSON.stringify(compiled.errors));
  const dex = E.dex.createDexLookup(), runtime = E.contentRuntime.assembleContent(compiled.data,dex); assert.deepEqual(runtime.errors,[]);
  return {content:runtime.content,dex};
}
function fixture(options = {}) {
  let supplied = options.supplied ?? content(), lastSetup, lastView, lastRequest, calls=0;
  const c = supplied.content, game = E.state.newGame({content:c,party:[],money:options.money??1000,bag:{masterball:2}});
  const member = E.memberFactory.createMember({id:'P1',species:'Snorlax',level:50},c,n=>0);
  game.party = [E.speciesKey.toPersistentMember(member,c)]; game.nextMemberOrdinal='2';
  game.party[0].item=options.item??'';
  if(options.hp !== undefined)game.party[0].hp=options.hp;
  const state=T.fakes.createMemoryState(options.game??game),projection=T.fakes.createRecordingProjection();
  const makeRaw=()=>({protocol:1,battleId:lastRequest.battleId,outcome:{kind:'win',winner:'Player'},members:{},bag:{},captured:[],dex:{seen:[],owned:[]}});
  const probe={create:async(req,view,setup)=>{lastRequest=req;lastSetup=J(setup);lastView=J(view);return{result:()=>makeRaw()};}};
  const defaultFacts=binding=>({version:1,binding:J(binding),coverage:'complete',members:[...lastView.party.map(m=>({id:m.id,side:'p1',initial:m.item,current:m.item,recovery:m.item,recycle:''})),...lastSetup.foes.map(m=>({id:m.id,side:'p2',initial:m.item,current:m.item,recovery:m.item,recycle:''}))],events:[],money:{amuletCoin:false,happyHour:false,payDay:0}});
  const normal=E.composition.createBattleSessionFactory({content:()=>supplied.content,seed:()=>[1,2,3,4]});
  const sessions=options.mode==='unknown'?probe:options.collect?T.heldDiagnostics.requiredFactoryProbe(probe,(h,b)=>{calls++;return options.collect(defaultFacts(b),{handle:h,binding:b});}):normal;
  const app=new E.app.GameApplication({state:options.port?options.port(state,c):state,projection,sessions,content:()=>supplied,random:n=>0,clock:()=>12345},
    {receivingProfile:{mode:1,naming:options.naming??1},capabilities:options.capabilities??{allowHeldItemSources:true,allowExperimentalHeldItemBattle:true},...(options.describeHeldItem?{describeHeldItem:options.describeHeldItem}:{})});
  return {app,state,projection,sessions,c,request:{battleId:options.id??'B-app',kind:'wild',seq:1,foes:[{species:'Pidgey',level:5}],canLose:true},calls:()=>calls,setContent:value=>{supplied=value;}};
}
async function finishWild(w,move=2){const h=await w.app.startBattle(w.request);assert.equal((await h.chooseMove(move)).ok,true);assert.equal(h.finished,true);return {h,raw:h.result(),out:w.app.finishBattle(h,w.request)};}

test('B required app: actual default session installs main/paired held/money once, replay needs no newer content',async()=>{
  const w=fixture({item:'amuletcoin'}),{h,raw,out}=await finishWild(w);
  assert.equal(out.commit,'applied',JSON.stringify(out));assert.equal(w.state.replaced.length,1);
  assert.equal(w.state.current().money,1500);assert.equal(w.state.current().stats.battle_money_gained,500);
  assert.match(w.state.current().appliedBattles[raw.battleId].settlement.pairHash,/^[a-f0-9]{64}$/);
  assert.equal(w.app.finishBattle(h,w.request).commit,'already-applied');
  w.setContent(null);assert.equal(w.app.commitResult(raw),'already-applied');assert.equal(w.state.replaced.length,1);
});
test('HF-01 complete required mode cannot downgrade for empty/nonempty initial items or partial/malformed facts',async()=>{
  for(const item of ['', 'oranberry'])for(const mutate of [()=>null,f=>({...f,coverage:'partial'}),f=>({...f,members:[]}),f=>({...f,binding:{...f.binding,generation:99}})]){
    const w=fixture({item,collect:mutate}),before=J(w.state.current()),h=await w.app.startBattle(w.request);
    const out=w.app.finishBattle(h,w.request);assert.equal(out.commit,'none');assert.equal(out.aborted,true);
    assert.deepEqual(w.state.current(),before);assert.equal(w.state.replaced.length,0);assert.equal(w.calls(),1);
  }
});
test('HF-02/03/06 unknown handle, direct raw and retired handle cannot wash a required source',async()=>{
  const w=fixture({collect:f=>f}),before=J(w.state.current()),h=await w.app.startBattle(w.request),raw=h.result();
  w.app.abortBattle(w.request,Error('cancelled'));
  assert.equal(w.app.finishBattle(h,w.request).commit,'none');
  assert.equal(w.app.finishBattle({result:()=>raw},w.request).commit,'none');
  assert.throws(()=>w.app.commitResult(raw,{legacy:true,required:false}),/source-unknown-or-retired/);
  assert.throws(()=>E.composition.commitLegacyNoHeldResult(w.app,raw.battleId),/not-selected/);
  assert.deepEqual(w.state.current(),before);assert.equal(w.state.replaced.length,0);
});
test('HF-07 private admission cannot move to a new app/generation or a later same-id operation',async()=>{
  const w=fixture({collect:f=>f}),before=J(w.state.current()),old=await w.app.startBattle(w.request),raw=old.result();
  w.app.stateReplacedByHost();const next=await w.app.startBattle(w.request);
  assert.equal(w.app.finishBattle(old,w.request).commit,'none');
  assert.equal(w.app.finishBattle(next,w.request).commit,'applied');assert.equal(w.state.replaced.length,1);
  const other=fixture({collect:f=>f,game:before});assert.equal(other.app.finishBattle(old,w.request).commit,'none');
  assert.throws(()=>other.app.commitResult(raw),/source-unknown-or-retired/);assert.equal(other.state.replaced.length,0);
});
test('HF-08 observed content replacement then ABA permanently retires a sealed required source',async()=>{
  const w=fixture({collect:f=>f}),before=J(w.state.current()),h=await w.app.startBattle(w.request);
  w.setContent(content({settings:{MAX_MONEY:555555}}));w.app.describeParty();w.setContent({content:w.c,dex:E.dex.createDexLookup()});
  assert.equal(w.app.finishBattle(h,w.request).commit,'none');assert.deepEqual(w.state.current(),before);assert.equal(w.calls(),0);
});
test('HF-09 provided cached pair conflict is refused although the already installed main hash is identical',async()=>{
  const w=fixture({collect:f=>f}),h=await w.app.startBattle(w.request),raw=h.result();assert.equal(w.app.finishBattle(h,w.request).commit,'applied');
  const installed=J(w.state.current());const other=fixture({game:installed,collect:f=>({...f,money:{...f.money,payDay:1}})}),next=await other.app.startBattle(other.request);
  assert.equal(E.state.resultHash(next.result()),E.state.resultHash(raw));
  const out=other.app.finishBattle(next,other.request);assert.equal(out.commit,'none');assert.match(out.error,/pair conflict/);
  assert.deepEqual(other.state.current(),installed);assert.equal(other.state.replaced.length,0);
});
test('HF-10 explicit legacy producer is selected before app/operation; unregistered JSON remains unknown',()=>{
  const c=content(),g=E.state.newGame({content:c.content,party:[],money:123}),state=T.fakes.createMemoryState(g);
  let calls=0, app;const raw={protocol:1,battleId:'legacy-B',outcome:{kind:'win',winner:'Player'},members:{},bag:{},captured:[],dex:{seen:[],owned:[]}};
  const sessions=E.composition.createLegacyNoHeldResultFactory(id=>{calls++;assert.equal(id,raw.battleId);assert.equal(app.saveBlocked,true);return raw;});
  app=new E.app.GameApplication({state,sessions,content:()=>c,projection:T.fakes.createRecordingProjection()});
  const unknown = new E.app.GameApplication({state:T.fakes.createMemoryState(g),sessions:{create:async()=>({result:()=>raw})},content:()=>c,projection:T.fakes.createRecordingProjection()});
  assert.throws(()=>unknown.commitResult(raw),/source-unknown-or-retired/);assert.equal(calls,0);
  assert.equal(app.commitResult(raw),'applied');assert.equal(calls,1);assert.equal(state.replaced.length,1);
  assert.equal(app.commitResult(raw),'already-applied');assert.equal(calls,1);
});
test('HF-11 schema8 migration preserves old raw ledger; schema9 rejects bad pair fields without changing input',()=>{
  const c=content(),old=E.state.newGame({content:c.content,party:[],money:1000001});old.schema=8;
  old.appliedBattles.old={hash:'a'.repeat(64),trainer:{id:'old-trainer',version:1}};const before=J(old);
  const migrated=E.saveSchema.migrateGame(old,{content:c.content});assert.equal(migrated.ok,true,JSON.stringify(migrated));
  assert.deepEqual(old,before);assert.equal(migrated.state.schema,9);assert.deepEqual(migrated.state.appliedBattles,old.appliedBattles);assert.equal(migrated.state.money,1000001);
  for(const settlement of [{version:2,pairHash:'a'.repeat(64)},{version:1,pairHash:'bad'},{version:1,pairHash:'a'.repeat(64),extra:1}]){
    const bad=J(migrated.state);bad.appliedBattles.old.settlement=settlement;const copy=J(bad);assert.ok(E.saveSchema.validateGame(bad).length);assert.equal(E.saveSchema.migrateGame(bad,{content:c.content}).ok,false);assert.deepEqual(bad,copy);
  }
});
test('HF-12 zero-write install failure retries the same required pair; post-install projection error never repeats money',async()=>{
  const w=fixture({item:'amuletcoin'}),h=await w.app.startBattle(w.request);await h.chooseMove(2);const raw=h.result(),before=J(w.state.current());
  w.state.failReplace=Error('controlled zero write');const pending=w.app.finishBattle(h,w.request);assert.equal(pending.pending,true);assert.deepEqual(w.state.current(),before);assert.equal(w.state.replaced.length,0);
  w.state.failReplace=null;w.projection.failures=1;const done=w.app.resolveReceiving(pending.receivingToken);assert.equal(done.commit,'applied',JSON.stringify(done));assert.equal(w.state.replaced.length,1);assert.equal(w.state.current().money,1500);assert.equal(done.projection,'failed');
  assert.equal(w.app.commitResult(raw),'already-applied');assert.equal(w.state.replaced.length,1);
});
test('HF-05/M02 actual Trick-to-capture pending keeps the authenticated source; lost held permission retires it without writes',async()=>{
  for(const revoke of [false,true]){
    let allowed=true;const w=fixture({item:'leftovers',naming:0,describeHeldItem:()=>allowed?{holdable:true,mail:false}:null});
    const before=J(w.state.current()),h=await w.app.startBattle(w.request);
    assert.equal((await h.chooseMove(1)).ok,true);assert.equal((await h.throwBall('masterball')).ok,true);assert.equal(h.finished,true);
    const raw=h.result();assert.equal(raw.captured[0].item,'leftovers');
    const pending=w.app.finishBattle(h,w.request);assert.equal(pending.pending,true);assert.deepEqual(w.state.current(),before);assert.equal(w.state.replaced.length,0);
    assert.equal(w.app.finishBattle({result:()=>raw},w.request).commit,'none','clone cannot borrow pending source');assert.ok(w.app.pendingReceiving);
    if(revoke)allowed=false;
    const id=raw.captured[0].id,out=w.app.resolveReceiving(pending.receivingToken,{[id]:{nickname:{kind:'keep'}}});
    if(revoke){assert.equal(out.aborted,true);assert.match(out.error,/invalid-held-item/);assert.deepEqual(w.state.current(),before);assert.equal(w.state.replaced.length,0);allowed=true;assert.equal(w.app.finishBattle(h,w.request).commit,'none');}
    else{assert.equal(out.commit,'applied',JSON.stringify(out));assert.equal(w.state.replaced.length,1);assert.equal(w.state.current().party.find(m=>m.id===id).item,'leftovers');assert.equal(w.state.current().party.find(m=>m.id==='P1').item,'leftovers');assert.equal(w.app.commitResult(raw),'already-applied');assert.equal(w.state.replaced.length,1);}
  }
});
test('B durable Node port: actual required app candidate saves the pair; default store only queries its installed raw',async()=>{
  const os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'B-required-node-'));let store;
  try{const file=path.join(dir,'save.json'),w=fixture({item:'amuletcoin',port:(memory,c)=>{
    store=new E.store.SaveStore(file,{},E.speciesKey.speciesKeyResolver(c),c);store.save(memory.current());
    return {read:()=>store.load(),replace:next=>{store.save(next);memory.replace(next);}};
  }}),{raw,out}=await finishWild(w);assert.equal(out.commit,'applied',JSON.stringify(out));assert.equal(w.state.replaced.length,1);
  const before=fs.readFileSync(file);assert.equal(store.load().money,1500);assert.match(store.load().appliedBattles[raw.battleId].settlement.pairHash,/^[a-f0-9]{64}$/);
  assert.equal(store.commit(raw).status,'already-applied');assert.deepEqual(fs.readFileSync(file),before);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('HF-08 first state callback content observation cannot be overwritten by a later initial read/ABA',async()=>{
  let hook;const w=fixture({port:state=>({read:()=>{hook?.();return state.read();},replace:next=>state.replace(next)})}),before=J(w.state.current());
  hook=()=>{hook=null;w.setContent(content({settings:{MAX_MONEY:555555}}));w.app.describeParty();w.setContent({content:w.c,dex:E.dex.createDexLookup()});};
  await assert.rejects(w.app.startBattle(w.request),/content-identity-unavailable-or-changed/);
  assert.deepEqual(w.state.current(),before);assert.equal(w.state.replaced.length,0);assert.equal(w.app.saveBlocked,false);
});
test('B required app: moneyGain false and natural D3 loss do not award recorded Pay Day',async()=>{
  for(const loss of [false,true]){
    const w=fixture({item:'amuletcoin',...(loss?{supplied:content({},'tackle')}:{})});w.request.moneyGain=loss;
    if(loss)w.request.foes[0].level=100;
    const h=await w.app.startBattle(w.request);assert.equal((await h.chooseMove(2)).ok,true);
    if(loss){assert.equal(h.finished,false);h.gw.seedState('p1',[{id:'P1',hp:1}]);assert.equal((await h.chooseMove(3)).ok,true);}
    assert.equal(h.finished,true);const out=w.app.finishBattle(h,w.request);assert.equal(out.commit,'applied',JSON.stringify(out));
    assert.equal(w.state.replaced.length,1);assert.equal(w.state.current().stats.battle_money_gained,0);
    if(!loss)assert.equal(w.state.current().money,1000);else assert.ok(w.state.current().money<1000);
  }
});

function npcContent({cap=5000,held=''}={}){
  const trainerType={id:'held-trainer',nameKey:'trainer.held',gender:0,baseMoney:20,skillLevel:0,flags:[],items:[],battleBgm:'',victoryBgm:'',introBgm:'',openingText:'',winText:'',loseText:'',source:'author-placeholder'};
  const record={id:'held-npc',type:trainerType.id,name:'NPC',version:0,source:'author-placeholder',items:[],party:[{species:'pidgey',level:5,moves:['splash'],...(held?{item:held}:{})}]};
  return content({trainerTypes:[trainerType],trainers:[record],settings:{MAX_MONEY:cap}});
}
test('B PD6: actual trainer prize then Pay Day cap independently, multiply once, and never report or count zero/negative income',async()=>{
  for(const {money,cap,enabled,expected,income} of [{money:0,cap:5000,enabled:true,expected:1400,income:1400},{money:900,cap:1000,enabled:true,expected:1000,income:100},{money:1001,cap:1000,enabled:true,expected:1000,income:0},{money:1001,cap:1000,enabled:false,expected:1001,income:0}]){
    const w=fixture({item:'amuletcoin',money,supplied:npcContent({cap})}),req={battleId:'B-money',trainer:{id:'held-npc',version:0},seq:1,canLose:true,moneyGain:enabled};
    const h=await w.app.startTrainerBattle(req);assert.equal((await h.chooseMove(3)).ok,true);assert.equal((await h.chooseMove(2)).ok,true);assert.equal(h.finished,true);
    const out=w.app.finishBattle(h,req);assert.equal(out.commit,'applied',JSON.stringify(out));
    assert.deepEqual([w.state.current().money,w.state.current().stats.battle_money_gained,w.state.replaced.length],[expected,income,1]);
    assert.deepEqual(w.state.current().defeatedTrainers['held-npc@0'],{id:'held-npc',version:0});
    assert.ok(!(out.diagnostics??[]).some(s=>/聚宝功获得 0/.test(s)));
    const after=J(w.state.current());assert.equal(w.app.finishBattle(h,req).commit,'already-applied');assert.deepEqual(w.state.current(),after);assert.equal(w.state.replaced.length,1);
  }
});
test('B held foe/identity gate: only-foe-held is gated; canonical valid foe works; alias refuses at content gate',async()=>{
  const supplied=npcContent({held:'oranberry'}),req={battleId:'B-foe-held',trainer:{id:'held-npc',version:0},seq:1,canLose:true};
  const closed=fixture({supplied,capabilities:{allowHeldItemSources:false,allowExperimentalHeldItemBattle:false}}),before=J(closed.state.current());
  await assert.rejects(closed.app.startTrainerBattle(req),/held-item-battle-disabled/);assert.deepEqual(closed.state.current(),before);assert.equal(closed.state.replaced.length,0);
  const normal=fixture({supplied}),h=await normal.app.startTrainerBattle(req);await h.chooseMove(2);assert.equal(normal.app.finishBattle(h,req).commit,'applied');assert.equal(normal.state.replaced.length,1);
  assert.throws(()=>npcContent({held:'left-overs'}),/canonical held item id/);
});
test('B captured C and boxed old C: real Trick plus capture to box or replacement never restores a departed player by slot',async()=>{
  for(const replace of [false,true]){
    const seed=fixture({item:'leftovers'}),g=J(seed.state.current());
    for(let i=2;i<=6;i++)g.party.push(E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:'P'+i,species:'Snorlax',level:50},seed.c,n=>0),seed.c));
    g.nextMemberOrdinal='7';const w=fixture({game:g,supplied:{content:seed.c,dex:E.dex.createDexLookup()},naming:1});if(replace)w.request.forceParty=true;
    const h=await w.app.startBattle(w.request);await h.chooseMove(1);await h.throwBall('masterball');assert.equal(h.finished,true);const raw=h.result(),id=raw.captured[0].id;
    let out=w.app.finishBattle(h,w.request);
    if(replace){assert.equal(out.pending,true);assert.equal(w.state.replaced.length,0);out=w.app.resolveReceiving(out.receivingToken,{[id]:{placement:{kind:'replace',target:{id:'P1',position:{kind:'party',index:0}}}}});}
    assert.equal(out.commit,'applied',JSON.stringify(out));assert.equal(w.state.replaced.length,1);const next=w.state.current();
    const caught=E.storage.locateMember(next,id),old=E.storage.locateMember(next,'P1');assert.equal(caught.member.item,'leftovers');
    assert.equal(caught.position.kind,replace?'party':'box');assert.equal(old.position.kind,replace?'box':'party');assert.equal(old.member.item,replace?'':'leftovers');
    assert.match(next.appliedBattles[raw.battleId].settlement.pairHash,/^[a-f0-9]{64}$/);
  }
});

test('B private expected mode cannot be downgraded by caller properties; unknown actual engine mutation is zero-write',async()=>{
  const missing=fixture({collect:()=>null}),before=J(missing.state.current()),h=await missing.app.startBattle(missing.request);
  Object.assign(missing.app,{currentSettlementAdmission:{source:{mode:'legacy-no-held'}},settlementFactoryRoot:{mode:'legacy-no-held'},settlementAdmissions:new WeakMap()});
  assert.equal(missing.app.finishBattle(h,missing.request).commit,'none');assert.deepEqual(missing.state.current(),before);assert.equal(missing.state.replaced.length,0);
  const real=fixture(),r=await real.app.startBattle(real.request),original=J(real.state.current());
  r.gw._debugBattle().sides[0].active[0].item='oranberry';await r.chooseMove(2);assert.equal(r.finished,true);
  const out=real.app.finishBattle(r,real.request);assert.equal(out.commit,'none');assert.match(out.error,/required-held-facts-unavailable/);assert.deepEqual(real.state.current(),original);assert.equal(real.state.replaced.length,0);
});
test('B required factory kind/id belong to the captured operation despite request mutation in an earlier host callback',async()=>{
  let hook;const w=fixture({port:state=>({read:()=>{hook?.();return state.read();},replace:next=>state.replace(next)})});
  hook=()=>{hook=null;w.request.kind='trainer';};
  const h=await w.app.startBattle(w.request);assert.equal(h.foe.kind,'wild');await h.chooseMove(2);assert.equal(w.app.finishBattle(h,w.request).commit,'applied');assert.equal(w.state.replaced.length,1);
});

test('B PD6 capture: Pay Day waits for the same authenticated receiving decisions and installs with capture once',async()=>{
 const w=fixture({item:'amuletcoin',naming:0});w.request.foes=[{species:'Snorlax',level:100}];const before=J(w.state.current()),h=await w.app.startBattle(w.request);
 assert.equal((await h.chooseMove(2)).ok,true);assert.equal(h.finished,false);assert.equal((await h.throwBall('masterball')).ok,true);assert.equal(h.finished,true);
 const raw=h.result(),pending=w.app.finishBattle(h,w.request);assert.equal(pending.pending,true);assert.deepEqual(w.state.current(),before);assert.equal(w.state.replaced.length,0);
 const id=raw.captured[0].id,done=w.app.resolveReceiving(pending.receivingToken,{[id]:{nickname:{kind:'keep'}}});assert.equal(done.commit,'applied',JSON.stringify(done));
 assert.deepEqual([w.state.current().money,w.state.current().stats.battle_money_gained,w.state.replaced.length],[1500,500,1]);assert.ok(E.storage.locateMember(w.state.current(),id));
 const after=J(w.state.current());assert.equal(w.app.commitResult(raw),'already-applied');assert.deepEqual(w.state.current(),after);assert.equal(w.state.replaced.length,1);
});

test('B required composition pins its selected real driver before app construction; options cannot swap it later',async()=>{
 const w=fixture(),options={content:()=>w.c,seed:()=>[1,2,3,4]},sessions=E.composition.createBattleSessionFactory(options);let calls=0;
 const app=new E.app.GameApplication({state:w.state,content:()=>({content:w.c,dex:E.dex.createDexLookup()}),sessions,projection:w.projection,random:n=>0,clock:()=>12345},{receivingProfile:{mode:1,naming:1},capabilities:{allowHeldItemSources:true,allowExperimentalHeldItemBattle:true}});
 options.driver={...E.gateway.showdownDriverFactory,create:opts=>{calls++;return E.gateway.showdownDriverFactory.create({...opts,wild:false});}};
 const h=await app.startBattle(w.request);assert.equal(calls,0);await h.chooseMove(2);assert.equal(app.finishBattle(h,w.request).commit,'applied');assert.equal(w.state.replaced.length,1);
});

// Original independent HF06/HF11 regressions; assertions retained.
function legacyWorld() {
  const c=content(),state=T.fakes.createMemoryState(E.state.newGame({content:c.content,party:[],money:123}));let produced=0;
  const raw={protocol:1,battleId:'legacy-abort',outcome:{kind:'win',winner:'Player'},members:{},bag:{},captured:[],dex:{seen:[],owned:[]}};
  const sessions=E.composition.createLegacyNoHeldResultFactory(id=>{produced++;assert.equal(id,raw.battleId);return J(raw);});
  const projection=T.fakes.createRecordingProjection(),app=new E.app.GameApplication({state,sessions,projection,content:()=>c});
  return {app,state,raw,projection,produced:()=>produced};
}


test('HF06 independent explicitly registered unowned legacy handle loses fresh permission on abort',()=>{
  const w=legacyWorld(),before=J(w.state.current()),h=E.composition.createLegacyNoHeldBattleHandle(w.app,w.raw.battleId);
  const aborted=w.app.abortBattle({battleId:w.raw.battleId},Error('caller cancelled before producer'));
  assert.equal(aborted.aborted,true);
  const late=w.app.finishBattle(h,{battleId:w.raw.battleId});
  assert.equal(late.commit,'none','abort must retire the original unowned fresh source');
  assert.deepEqual(w.state.current(),before);assert.equal(w.state.replaced.length,0);assert.equal(w.app.saveBlocked,false);
});


test('HF11 independent installed required handle remains an exact no-op if post-install projection observed new content',async()=>{
  const w=fixture({item:'amuletcoin'}),B=content({settings:{MAX_MONEY:555555}});
  w.projection.project=()=>{w.setContent(B);w.app.describeParty();};
  const {h,raw,out}=await finishWild(w);assert.equal(out.commit,'applied');const installed=J(w.state.current());
  assert.equal(w.app.finishBattle(h,w.request).commit,'already-applied','installed pair replay must precede retired-fresh source checks');
  assert.equal(w.app.commitResult(raw),'already-applied');assert.equal(w.state.replaced.length,1);assert.deepEqual(w.state.current(),installed);
});


test('HF06 legacy abort retires only its reservation; old callback cannot release same-id successor',()=>{
  const w=legacyWorld(), old=E.composition.createLegacyNoHeldBattleHandle(w.app,w.raw.battleId);
  assert.equal(w.app.abortBattle({battleId:w.raw.battleId},Error('cancel')).aborted,true);
  assert.equal(w.app.saveBlocked,false);assert.equal(w.produced(),0);
  const next=E.composition.createLegacyNoHeldBattleHandle(w.app,w.raw.battleId);
  assert.equal(w.app.finishBattle(old,{battleId:w.raw.battleId}).commit,'none');assert.equal(w.app.saveBlocked,true);
  assert.equal(w.app.finishBattle(next,{battleId:w.raw.battleId}).commit,'applied');assert.equal(w.produced(),1);
  assert.equal(w.state.replaced.length,1);assert.equal(w.app.saveBlocked,false);
});
