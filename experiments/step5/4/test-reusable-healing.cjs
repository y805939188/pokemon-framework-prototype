'use strict';
// Legitimate authored consumable:false active healing; real App/Session/Gen8, synthetic state only.
const test=require('node:test'),assert=require('node:assert/strict');
const {E,T,D,inputs}=require('./trainer-ai-integration/fixtures.cjs');
const field=require('../2/ef-support.cjs');
const clone=v=>structuredClone(v);
const active=(w,side='p1')=>w.session.gw._debugBattle().sides[side==='p1'?0:1].active[0];
const stock=w=>E.inventory.itemQuantity(w.state.read().inventory,w.authorId,w.content.items);
const diag=w=>D.trainerAiDiagnostics(w.session);
function damage(w,side='p1',hp=1){const p=active(w,side);p.hp=hp;p.fainted=false;return p;}
function event(r,side='p1'){return r.messages.flatMap(m=>m.kind==='events'?m.events:[]).find(e=>e.type==='rpg'&&e.args[0]==='item'&&e.args[1]===side);}
async function fixture({id='superpotion',alias=false,consumable=false,count=1,ai=false,parameters={amount:80,oldAmount:90},flag=true,fullHp=false,status=''}={}){
 const authorId=alias?'workshop-tonic':id;
 const source=inputs({party:1,moves:['splash'],items:ai&&count?[{item:authorId,count}]:[]});
 source.settings={...source.settings,REBALANCED_HEALING_ITEM_AMOUNTS:flag};
 source.trainers[0].party[0].level=20;
 const item=source.items.find(i=>i.id===id);item.id=authorId;item.legacyIds=[];item.consumable=consumable;
 if(id!=='fullrestore')item.effect={family:'hp',parameters};
 const c=E.contentCompile.compileContent(source);assert(c.ok,JSON.stringify(c.errors));
 const joined=E.contentRuntime.assembleContent(c.data,E.dex.createDexLookup());assert.deepEqual(joined.errors,[]);const content=joined.content;
 const mon=E.memberFactory.createMember({id:'P1',species:'Snorlax',level:50},content,()=>0);if(!fullHp)mon.hp=1;mon.status=status;
 const game=E.state.newGame({content,party:[E.speciesKey.toPersistentMember(mon,content)],bag:count?{[authorId]:count}:{},money:1000});game.nextMemberOrdinal='2';
 const state=T.fakes.createMemoryState(game),app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4]}),content:()=>({content}),random:()=>0,clock:()=>12345});
 const request={battleId:'reusable-healing',trainer:{id:'c-basic',version:1},seq:1,canLose:true,battleStyle:'set'},session=await app.startTrainerBattle(request);
 return {app,state,session,request,content,authorId,id,warnings:c.warnings};
}
async function win(w){for(let i=0;i<12&&!w.session.finished;i++)await w.session.chooseMove(2);assert(w.session.finished,'actual trainer battle ends');return w.app.finishBattle(w.session,w.request);}
for(const flag of [true,false])test(`reusable authored HP amount matches field/battle config=${flag}`,async()=>{
 const w=await fixture({flag}),expected=flag?80:90;
 assert(!w.warnings.some(x=>x.message.startsWith('nonconsumable-battle-healing-unsupported:')));
 const f=field.setup({bag:{superpotion:1},settings:{REBALANCED_HEALING_ITEM_AMOUNTS:flag},edit:(g,c)=>{g.party[0].hp=1;c.items.superpotion=clone(w.content.items.superpotion);}}),token=f.app.beginInventoryOperation();
 assert.equal(f.app.inventoryRequest(token,'field',{kind:'use-item',itemId:'superpotion',quantity:1,memberId:f.game.party[0].id}).status,'committed');f.app.endInventoryOperation(token);
 assert.equal(f.state.current().party[0].hp,1+expected);assert.equal(E.inventory.itemQuantity(f.state.current().inventory,'superpotion',f.content.items),1);
 const r=await w.session.useItem(w.id,'P1');assert(r.ok);assert.equal(Number(event(r).args[5]),expected);assert.equal(active(w).hp,1+expected);assert.equal(w.session.bag[w.id],1);assert.equal(stock(w),1);
});
test('one owned reusable copy supports repeated successful turns and commits no inventory delta',async()=>{
 const w=await fixture({alias:true}),inventory=clone(w.state.read().inventory);
 for(let i=0;i<2;i++){const r=await w.session.useItem(w.id,'P1');assert(r.ok);assert.equal(event(r).args[4],'ok');assert.equal(w.session.bag[w.id],1);assert.equal(w.session.ledger[i].state,'retained');w.session._onEvent(event(r));assert.equal(w.session.bag[w.id],1,'duplicate successful event cannot return a second copy');}
 assert.equal(active(w).hp,161);assert.deepEqual(w.state.read().inventory,inventory,'battle owns no persistent write before commit');
 const out=await win(w);assert.equal(out.commit,'applied');assert.deepEqual(w.session.result().bag,{});assert.deepEqual(w.state.read().inventory,inventory);assert.equal(stock(w),1);assert.equal(Object.keys(w.state.read().appliedBattles).length,1);
 assert.equal(w.app.finishBattle(w.session,w.request).commit,'already-applied');assert.deepEqual(w.state.read().inventory,inventory);
});
test('existing consumable healing still reserves and consumes exactly one, including authored amount',async()=>{
 const w=await fixture({consumable:true}),r=await w.session.useItem(w.id,'P1');assert(r.ok);assert.equal(Number(event(r).args[5]),80);assert.equal(w.session.bag[w.id],0);assert.equal(w.session.ledger[0].state,'consumed');assert.equal(stock(w),1);
 assert.equal((await win(w)).commit,'applied');assert.equal(stock(w),0);assert.deepEqual(w.session.result().bag,{superpotion:-1});
});
test('reusable healing still requires an owned copy and refuses full/fainted/zero-amount targets without a turn',async()=>{
 for(const options of [{count:0},{fullHp:true},{parameters:{fraction:10000}}]){const w=await fixture(options),before={snapshot:w.session.gw.snapshot(),bag:clone(w.session.bag),inventory:clone(w.state.read().inventory)};const r=await w.session.useItem(w.id,'P1');assert.equal(r.ok,false);assert.equal(w.session.gw.snapshot(),before.snapshot);assert.deepEqual(w.session.bag,before.bag);assert.deepEqual(w.state.read().inventory,before.inventory);assert.equal(w.session.ledger.length,0);}
 const w=await fixture();damage(w).hp=0;active(w).fainted=true;const turn=w.session.gw._debugBattle().turn;assert.equal((await w.session.useItem(w.id,'P1')).ok,false);assert.equal(w.session.bag[w.id],1);assert.equal(w.session.gw._debugBattle().turn,turn);
});
test('staged reusable choice borrows one copy, cancel/replace and repeated cancel never create stock',async()=>{
 const w=await fixture();assert((await w.session.useItem(w.id,'P1',{commit:false})).ok);assert.equal(w.session.bag[w.id],0);assert.equal(stock(w),1);await w.session.cancel();await w.session.cancel();assert.equal(w.session.bag[w.id],1);assert.equal(w.session.ledger[0].state,'refunded');
 assert((await w.session.useItem(w.id,'P1',{commit:false})).ok);assert((await w.session.chooseMove(1)).ok);assert.equal(w.session.bag[w.id],1);assert.equal(active(w).hp,1);assert.equal(stock(w),1);
});
test('rejected registration and execution-time no effect refund the reusable loan exactly once',async(t)=>{
 const rejected=await fixture();t.mock.method(rejected.session.gw,'act',async()=>false);assert.equal((await rejected.session.useItem(rejected.id,'P1')).ok,false);assert.equal(rejected.session.bag[rejected.id],1);assert.equal(rejected.session.ledger[0].state,'refunded');
 const w=await fixture();assert((await w.session.useItem(w.id,'P1',{commit:false})).ok);active(w).hp=active(w).maxhp;const r=await w.session.commitTurn();assert(r.ok);assert.equal(event(r).args[4],'noeffect');assert.equal(w.session.bag[w.id],1);w.session._onEvent(event(r));assert.equal(w.session.bag[w.id],1);assert.equal(w.session.ledger[0].state,'refunded');
});
test('staged checkpoint recovery retains the loan policy and replays without stock loss/inflation',async(t)=>{
 t.mock.method(Date,'now',()=>1793350000000);const w=await fixture();assert((await w.session.useItem(w.id,'P1',{commit:false})).ok);const cp=w.session._checkpoint();
 assert((await w.session.commitTurn()).ok);const after=JSON.parse(w.session.gw.snapshot());assert.equal(w.session.bag[w.id],1);
 await w.session._restoreCheckpoint(cp);assert.equal(w.session.bag[w.id],0);assert.equal(active(w).hp,1);assert((await w.session.commitTurn()).ok);assert.equal(w.session.bag[w.id],1);assert.deepEqual(JSON.parse(w.session.gw.snapshot()),after);
 await w.session._restoreCheckpoint(cp);await w.session.cancel();assert.equal(w.session.bag[w.id],1);assert.equal(stock(w),1);
});
test('exception after real player/AI effects rolls back both owned inventories and replays once',async(t)=>{
 t.mock.method(Date,'now',()=>1793350000000);const w=await fixture({ai:true});active(w,'p2').maxhp=400;damage(w,'p2');w.session.gw.refreshRequests();const before={engine:w.session.gw.snapshot(),bag:clone(w.session.bag),ai:clone(diag(w).state),inventory:clone(w.state.read().inventory)};
 const original=w.session._resolveTurn.bind(w.session);let once=true;t.mock.method(w.session,'_resolveTurn',async()=>{const r=await original();if(once){once=false;throw Error('after-effect-fault');}return r;});
 await assert.rejects(w.session.useItem(w.id,'P1'),/after-effect-fault/);assert.equal(w.session.broken,null);assert.deepEqual(JSON.parse(w.session.gw.snapshot()),JSON.parse(before.engine));assert.deepEqual(w.session.bag,before.bag);assert.deepEqual(diag(w).state,before.ai);assert.deepEqual(w.state.read().inventory,before.inventory);
 const r=await w.session.useItem(w.id,'P1');assert(r.ok);assert.equal(Number(event(r).args[5]),80);assert.equal(Number(event(r,'p2').args[5]),80);assert.equal(w.session.bag[w.id],1);assert.equal(diag(w).state.resources[0].count,1);
});
for(const staged of [true,false])test(`technical abort never writes reusable effects or inventory staged=${staged}`,async()=>{
 const w=await fixture(),before=clone(w.state.read());assert((await w.session.useItem(w.id,'P1',{commit:!staged})).ok);const out=w.app.abortBattle(w.request,Error('synthetic scene closure'));assert.equal(out.commit,'none');assert.equal(out.aborted,true);assert.deepEqual(w.state.read(),before);
 assert.equal(w.app.finishBattle(w.session,w.request).commit,'none');assert.deepEqual(w.state.read(),before);
});
test('battle ending before a staged reusable action returns the unused copy once',async()=>{
 const w=await fixture();assert((await w.session.useItem(w.id,'P1',{commit:false})).ok);w.session.gw._debugBattle().tie();w.session.gw._debugBattle().sendUpdates();w.session._ingest();await w.session._continueGrowth();assert(w.session.finished);assert.equal(w.session.bag[w.id],1);assert.deepEqual(w.session.result().bag,{});assert.equal((w.app.finishBattle(w.session,w.request)).commit,'applied');assert.equal(stock(w),1);
});
test('reusable Full Restore keeps full/status/confusion behavior and can be used again from one copy',async()=>{
 const w=await fixture({id:'fullrestore',fullHp:true,status:'par'});active(w).addVolatile('confusion');let r=await w.session.useItem(w.id,'P1');assert(r.ok);assert.equal(event(r).args[5],'0');assert.equal(active(w).status,'');assert.equal(active(w).volatiles.confusion,undefined);assert.equal(w.session.bag[w.id],1);
 damage(w);active(w).setStatus('brn');r=await w.session.useItem(w.id,'P1');assert(r.ok);assert.equal(active(w).hp,active(w).maxhp);assert.equal(active(w).status,'');assert.equal(w.session.bag[w.id],1);assert.equal((await win(w)).commit,'applied');assert.equal(stock(w),1);
});
test('trainer reusable resource is independent, uses authored estimates, repeats and restores its own stock',async(t)=>{
 t.mock.method(Date,'now',()=>1793350000000);const w=await fixture({ai:true,alias:true,flag:false});active(w,'p2').maxhp=400;damage(w,'p2');w.session.gw.refreshRequests();const capture=D.captureTrainerAiRequest(w.session,w.session.gw);assert.equal(capture.snapshot.request.legalItems[0].itemId,w.authorId);assert.equal(capture.snapshot.request.legalItems[0].estimateHp,90);const cp=w.session._checkpoint();
 let r=await w.session.chooseMove(1);assert(r.ok);assert.equal(Number(event(r,'p2').args[5]),90);assert.equal(diag(w).state.resources[0].count,1);assert.equal(diag(w).state.ledger[0].state,'retained');assert.equal(w.session.bag[w.id],1);assert.equal(stock(w),1);const after=clone(diag(w).state);assert.throws(()=>D.validateTrainerAiTicket(w.session,w.session.gw,capture.ticket,capture.snapshot.request.legalItems[0].candidateId),/revision-changed|already-submitted/);w.session._onEvent(event(r,'p2'));assert.deepEqual(diag(w).state,after);
 await w.session._restoreCheckpoint(cp);assert((await w.session.chooseMove(1)).ok);assert.deepEqual(diag(w).state,after);damage(w,'p2');w.session.gw.refreshRequests();r=await w.session.chooseMove(1);assert(r.ok);assert.equal(Number(event(r,'p2').args[5]),90);assert.equal(diag(w).state.resources[0].count,1);assert.equal(w.session.bag[w.id],1);
});
test('zero-count trainer reusable resource and zero recovery produce no item candidates',async()=>{
 for(const options of [{count:0},{parameters:{fraction:10000}}]){const w=await fixture({...options,ai:true});damage(w,'p2');w.session.gw.refreshRequests();assert.deepEqual(D.captureTrainerAiRequest(w.session,w.session.gw).snapshot.request.legalItems,[]);}
});

for(const mode of ['refused','noeffect'])test(`trainer reusable ${mode} returns only its own reserved copy once`,async()=>{
 const proto=E.gateway.BattleGateway.prototype,original=proto.act;let w,calls=0,reserved;
 proto.act=async function(side,payload,...rest){if(side==='p2'&&payload.kind==='item'){calls++;reserved=diag(w).state.resources[0].count;if(mode==='refused')return false;const p=this._debugBattle().sides[1].active[0];p.hp=p.maxhp;}return original.call(this,side,payload,...rest);};
 try{w=await fixture({ai:true});}finally{proto.act=original;}
 damage(w,'p2');w.session.gw.refreshRequests();assert((await w.session.chooseMove(1)).ok);assert.equal(calls,1);assert.equal(reserved,0);assert.equal(diag(w).state.resources[0].count,1);assert.equal(diag(w).state.ledger[0].state,'refunded');assert.equal(w.session.bag[w.id],1);assert.equal(stock(w),1);
 if(mode==='noeffect'){const e={type:'rpg',args:['item','p2',w.id,active(w,'p2').name,'noeffect'],raw:''};w.session._onEvent(e);assert.equal(diag(w).state.resources[0].count,1);}
});
test('trainer reusable Full Restore keeps canonical full/status/confusion semantics and stock',async()=>{
 const w=await fixture({ai:true,id:'fullrestore'});damage(w,'p2');active(w,'p2').setStatus('par');active(w,'p2').addVolatile('confusion');w.session.gw.refreshRequests();const r=await w.session.chooseMove(1);assert(r.ok);assert.equal(event(r,'p2').args[4],'ok');assert.equal(active(w,'p2').hp,active(w,'p2').maxhp);assert.equal(active(w,'p2').status,'');assert.equal(active(w,'p2').volatiles.confusion,undefined);assert.equal(diag(w).state.resources[0].count,1);assert.equal(w.session.bag[w.id],1);assert.equal(stock(w),1);
});
test('reusable HP snapshot captures authored effect while old engine snapshots retain their fixed fallback',async()=>{
 const w=await fixture({flag:false}),saved=JSON.parse(w.session.gw.snapshot());assert.deepEqual(saved.rpg.activeHpRecovery.superpotion,{amount:90});
 for(const legacy of [false,true]){const data=clone(saved);if(legacy)delete data.rpg.activeHpRecovery;const g=await E.gateway.BattleGateway.restore(JSON.stringify(data));assert(await g.act('p1',{kind:'item',item:w.id,target:'P1'}));assert(await g.choose('p2','move 1'));assert.equal(g.readState('p1')[0].hp,legacy?51:91);}assert.equal(stock(w),1);
});

for(const row of [{parameters:{fraction:4},expected:55,estimate:1},{parameters:{full:true},expected:219,estimate:999},{parameters:{amount:80},current:215,expected:5,estimate:80}])test(`reusable HP preserves actual capping and trainer estimate ${JSON.stringify(row.parameters)}`,async()=>{
 const w=await fixture({parameters:row.parameters,ai:true});if(row.current!==undefined)damage(w,'p1',row.current);active(w,'p2').maxhp=400;damage(w,'p2');w.session.gw.refreshRequests();assert.equal(D.captureTrainerAiRequest(w.session,w.session.gw).snapshot.request.legalItems[0].estimateHp,row.estimate);
 const r=await w.session.useItem(w.id,'P1');assert(r.ok);assert.equal(Number(event(r).args[5]),row.expected);assert.equal(w.session.bag[w.id],1);assert.equal(diag(w).state.resources[0].count,1);assert.equal(stock(w),1);
});
test('default reusable Potion keeps native amount and default snapshot shape',async()=>{
 const w=await fixture({id:'potion',parameters:{amount:20}});assert.equal(JSON.parse(w.session.gw.snapshot()).rpg.activeHpRecovery,undefined);const r=await w.session.useItem(w.id,'P1');assert(r.ok);assert.equal(Number(event(r).args[5]),20);assert.equal(w.session.bag[w.id],1);assert.equal(stock(w),1);
});
