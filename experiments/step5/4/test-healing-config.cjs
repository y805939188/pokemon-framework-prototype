'use strict';
// WP28 §5.1 and WP51 default data over synthetic author content; no reference replay or player save.
const test=require('node:test'),assert=require('node:assert/strict');
const {E,D,inputs,fixture}=require('./trainer-ai-integration/fixtures.cjs');
const field=require('../2/ef-support.cjs');
const rows=[['potion',20,20],['berryjuice',20,20],['sweetheart',20,20],['superpotion',60,50],['hyperpotion',120,200],['freshwater',30,50],['sodapop',50,60],['lemonade',70,80],['moomoomilk',100,100],['oranberry',10,10]];
function content(flag,items=[]){
 const source=inputs({items,moves:['splash'],party:1});
 source.settings={...source.settings};
 if(flag===undefined)delete source.settings.REBALANCED_HEALING_ITEM_AMOUNTS;
 else source.settings={...source.settings,REBALANCED_HEALING_ITEM_AMOUNTS:flag};
 const compiled=E.contentCompile.compileContent(source);assert.equal(compiled.ok,true,JSON.stringify(compiled.errors));
 const result=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(result.errors,[]);return result.content;
}
async function battle(flag,items=[]){return fixture({content:content(flag,items)});}
const active=(w,side='p1')=>w.session.gw._debugBattle().sides[side==='p1'?0:1].active[0];
function hp(w,side,current,max=400){const p=active(w,side);p.maxhp=max;p.hp=current;p.fainted=false;return p;}
function itemEvent(result,side,item){
 const event=result.messages.flatMap(m=>m.kind==='events'?m.events:[]).find(e=>e.type==='rpg'&&e.args[0]==='item'&&e.args[1]===side&&e.args[2]===item);
 assert.ok(event,`${side} ${item} executed`);assert.equal(event.args[4],'ok');return event;
}
for(const flag of [true,false]){
 test(`WP28 field application commits supported HP amounts config=${flag}`,()=>{
  for(const [id,on,off]of rows){
   const x=field.setup({bag:{[id]:2},settings:{REBALANCED_HEALING_ITEM_AMOUNTS:flag},edit:(g,c)=>{c.species.Charizard.base.hp=255;g.party[0].hp=1;}});
   const token=x.app.beginInventoryOperation(),intent={kind:'use-item',itemId:id,quantity:1,memberId:x.game.party[0].id};
   const result=x.app.inventoryRequest(token,'heal',intent),amount=flag?on:off;
   assert.equal(result.status,'committed',id);assert.equal(x.state.current().party[0].hp,1+amount,id);
   assert.equal(E.inventory.itemQuantity(x.state.current().inventory,id,x.content.items),1,id);
   x.app.endInventoryOperation(token);
  }
 });
 test(`WP28 player battle actual HP and consumption config=${flag}`,async()=>{
  const w=await battle(flag);
  for(const [id,on,off]of rows){
   hp(w,'p1',1);w.session.bag[id]=2;
   const result=await w.session.useItem(id,active(w).name),amount=flag?on:off;
   assert.equal(result.ok,true,id);const event=itemEvent(result,'p1',id);
   assert.equal(Number(event.args[5]),amount,id);assert.equal(active(w).hp,1+amount,id);assert.equal(w.session.bag[id],1,id);
  }
 });
 test(`WP51 trainer AI estimates follow config=${flag}, Sitrus remains 1`,async()=>{
  const ids=[...rows.map(row=>row[0]),'maxpotion','sitrusberry'],w=await battle(flag,ids.map(item=>({item,count:1})));
  hp(w,'p2',1);w.session.gw.refreshRequests();
  const snapshot=D.captureTrainerAiRequest(w.session,w.session.gw).snapshot;assert.equal(snapshot.request.kind,'move');
  const amounts=Object.fromEntries(snapshot.request.legalItems.map(item=>[item.itemId,item.estimateHp]));
  for(const [id,on,off]of rows)assert.equal(amounts[id],flag?on:off,id);
  assert.equal(amounts.maxpotion,999);assert.equal(amounts.sitrusberry,1);
 });
 test(`WP28 trainer actual heal follows config=${flag}`,async()=>{
  const w=await battle(flag,[{item:'hyperpotion',count:1}]);hp(w,'p2',1);w.session.gw.refreshRequests();
  const result=await w.session.chooseMove(1);assert.equal(result.ok,true);
  assert.equal(Number(itemEvent(result,'p2','hyperpotion').args[5]),flag?120:200);
  assert.equal(D.trainerAiDiagnostics(w.session).state.resources[0].count,0);
 });
}
test('omitted setting retains true-column player effect and AI estimate',async()=>{
 const w=await battle(undefined,[{item:'superpotion',count:1}]);hp(w,'p1',1);hp(w,'p2',1);w.session.bag.superpotion=1;w.session.gw.refreshRequests();
 const snapshot=D.captureTrainerAiRequest(w.session,w.session.gw).snapshot;
 assert.equal(snapshot.request.legalItems.find(item=>item.itemId==='superpotion').estimateHp,60);
 const result=await w.session.useItem('superpotion',active(w).name);assert.equal(result.ok,true);assert.equal(Number(itemEvent(result,'p1','superpotion').args[5]),60);
});
test('both configurations cap live missing HP, preserve Sitrus floor and Max Potion full heal',async()=>{
 for(const flag of [true,false]){
  const w=await battle(flag);
  for(const [id,current,max,amount]of [['hyperpotion',397,400,3],['sitrusberry',1,101,25],['sitrusberry',1,105,26],['maxpotion',1,400,399]]){
   hp(w,'p1',current,max);w.session.bag[id]=1;const result=await w.session.useItem(id,active(w).name);assert.equal(result.ok,true);
   assert.equal(Number(itemEvent(result,'p1',id).args[5]),amount,`${id} ${max} ${flag}`);assert.equal(active(w).hp,current+amount);assert.equal(w.session.bag[id],0);
  }
 }
});
test('false configuration survives engine snapshot restore; old snapshots retain true default',async()=>{
 const w=await battle(false);hp(w,'p1',1);const snapshot=w.session.gw.snapshot();
 const restored=await E.gateway.BattleGateway.restore(snapshot,{rebalancedHealingItemAmounts:true});
 await restored.act('p1',{kind:'item',item:'hyperpotion',target:restored.activeId('p1')});await restored.choose('p2','move 1');assert.equal(restored.readState('p1')[0].hp,201);
 const old=JSON.parse(snapshot);delete old.rpg.rebalancedHealingItemAmounts;
 const legacy=await E.gateway.BattleGateway.restore(JSON.stringify(old));
 await legacy.act('p1',{kind:'item',item:'hyperpotion',target:legacy.activeId('p1')});await legacy.choose('p2','move 1');assert.equal(legacy.readState('p1')[0].hp,121);
});
test('false configuration and AI estimate survive session checkpoint replay',async(t)=>{
 t.mock.method(Date,'now',()=>1793350000000);
 const w=await battle(false,[{item:'hyperpotion',count:1}]);hp(w,'p1',1);hp(w,'p2',1);w.session.bag.superpotion=1;w.session.gw.refreshRequests();
 const before=D.captureTrainerAiRequest(w.session,w.session.gw).snapshot,checkpoint=w.session._checkpoint();
 assert.equal(before.request.legalItems[0].estimateHp,200);
 const first=await w.session.useItem('superpotion',active(w).name);assert.equal(first.ok,true);assert.equal(Number(itemEvent(first,'p1','superpotion').args[5]),50);
 const after=w.session.gw.snapshot(),diagnostics=D.trainerAiDiagnostics(w.session);
 await w.session._restoreCheckpoint(checkpoint);assert.deepEqual(D.captureTrainerAiRequest(w.session,w.session.gw).snapshot,before);
 const second=await w.session.useItem('superpotion',active(w).name);assert.equal(second.ok,true);assert.equal(Number(itemEvent(second,'p1','superpotion').args[5]),50);
 assert.deepEqual(JSON.parse(w.session.gw.snapshot()),JSON.parse(after));assert.deepEqual(D.trainerAiDiagnostics(w.session),diagnostics);
});
test('field-only healing families remain unsupported battle items',async()=>{
 const w=await battle(false,[{item:'energypowder',count:1},{item:'energyroot',count:1}]);hp(w,'p1',1);hp(w,'p2',1);w.session.gw.refreshRequests();
 for(const id of ['energypowder','energyroot']){w.session.bag[id]=1;assert.equal((await w.session.useItem(id,active(w).name)).reason,'unknown-item');assert.equal(w.session.bag[id],1);}
 assert.deepEqual(D.captureTrainerAiRequest(w.session,w.session.gw).snapshot.request.legalItems,[]);
});
// F1 follow-up: authored HP amounts are shared by field use, actual turns and AI estimates.
function customContent(flag,id,parameters){
 const source=inputs({party:1,moves:['splash'],items:[{item:id,count:2}]});source.settings={...source.settings,REBALANCED_HEALING_ITEM_AMOUNTS:flag};
 source.items.find(i=>i.id===id).effect={family:'hp',parameters};
 const compiled=E.contentCompile.compileContent(source);assert(compiled.ok,JSON.stringify(compiled.errors));
 assert(!compiled.warnings.some(w=>w.message.startsWith('battle-healing-parameters-differ:')));
 const result=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(result.errors,[]);return result.content;
}
for(const flag of [true,false])test(`author fixed HP is identical through field, player, trainer and AI config=${flag}`,async()=>{
 const c=customContent(flag,'superpotion',{amount:80,oldAmount:90}),amount=flag?80:90;
 const x=field.setup({bag:{superpotion:2},settings:{REBALANCED_HEALING_ITEM_AMOUNTS:flag},edit:(g,c2)=>{c2.items.superpotion=structuredClone(c.items.superpotion);c2.species.Charizard.base.hp=255;g.party[0].hp=1;}});
 const token=x.app.beginInventoryOperation();assert.equal(x.app.inventoryRequest(token,'custom-heal',{kind:'use-item',itemId:'superpotion',quantity:1,memberId:x.game.party[0].id}).status,'committed');assert.equal(x.state.current().party[0].hp,1+amount);x.app.endInventoryOperation(token);
 const w=await fixture({content:c});hp(w,'p1',1);hp(w,'p2',1);w.session.bag.superpotion=2;w.session.gw.refreshRequests();
 assert.equal(D.captureTrainerAiRequest(w.session,w.session.gw).snapshot.request.legalItems[0].estimateHp,amount);
 const r=await w.session.useItem('superpotion',active(w).name);assert(r.ok);assert.equal(Number(itemEvent(r,'p1','superpotion').args[5]),amount);assert.equal(Number(itemEvent(r,'p2','superpotion').args[5]),amount);assert.equal(w.session.bag.superpotion,1);assert.equal(D.trainerAiDiagnostics(w.session).state.resources[0].count,1);
});
test('author HP true amount is also false fallback when oldAmount is omitted',async()=>{
 for(const flag of [true,false]){const w=await fixture({content:customContent(flag,'superpotion',{amount:80})});hp(w,'p1',1);hp(w,'p2',1);w.session.bag.superpotion=1;w.session.gw.refreshRequests();assert.equal(D.captureTrainerAiRequest(w.session,w.session.gw).snapshot.request.legalItems[0].estimateHp,80);assert.equal(Number(itemEvent(await w.session.useItem('superpotion',active(w).name),'p1','superpotion').args[5]),80);}
});
for(const flag of [true,false])test(`author fraction/full/fixed profiles preserve field and battle capping config=${flag}`,async()=>{
 for(const [id,parameters,current,max,expected,estimate]of [['sitrusberry',{fraction:8},1,105,13,1],['potion',{fraction:3},1,101,33,1],['superpotion',{full:true},1,101,100,999],['maxpotion',{full:true},99,101,2,999],['maxpotion',{amount:80,oldAmount:90},1,201,flag?80:90,flag?80:90],['superpotion',{amount:80,oldAmount:90},397,400,3,flag?80:90]]){
  const c=customContent(flag,id,parameters),w=await fixture({content:c});hp(w,'p1',current,max);hp(w,'p2',1);w.session.bag[id]=1;w.session.gw.refreshRequests();
  assert.equal(D.captureTrainerAiRequest(w.session,w.session.gw).snapshot.request.legalItems[0].estimateHp,estimate,id);const r=await w.session.useItem(id,active(w).name);assert(r.ok);assert.equal(Number(itemEvent(r,'p1',id).args[5]),expected,id);assert.equal(active(w).hp,current+expected,id);assert.equal(w.session.bag[id],0,id);
  const x=field.setup({bag:{[id]:2},settings:{REBALANCED_HEALING_ITEM_AMOUNTS:flag},edit:(g,c2)=>{c2.items[id]=structuredClone(c.items[id]);g.party[0].hp=1;}}),maxField=field.maxHp(x.game.party[0],x.content);
  const token=x.app.beginInventoryOperation();assert.equal(x.app.inventoryRequest(token,'profile',{kind:'use-item',itemId:id,quantity:1,memberId:x.game.party[0].id}).status,'committed');
  const requested=parameters.full?maxField:parameters.fraction?Math.floor(maxField/parameters.fraction):(flag?parameters.amount:parameters.oldAmount??parameters.amount);assert.equal(x.state.current().party[0].hp,Math.min(maxField,1+requested));x.app.endInventoryOperation(token);
 }
});
test('custom healing snapshots own copied values; restore options never rebind; legacy snapshots retain original profile',async()=>{
 const w=await fixture({content:customContent(false,'superpotion',{amount:80,oldAmount:90})});hp(w,'p1',1);const saved=w.session.gw.snapshot();assert.equal(JSON.parse(saved).rpg.activeHpRecovery.superpotion.amount,90);
 const restored=await E.gateway.BattleGateway.restore(saved,{activeHpRecovery:{superpotion:{amount:2}},rebalancedHealingItemAmounts:true});await restored.act('p1',{kind:'item',item:'superpotion',target:restored.activeId('p1')});await restored.choose('p2','move 1');assert.equal(restored.readState('p1')[0].hp,91);
 const old=JSON.parse(saved);delete old.rpg.activeHpRecovery;const legacy=await E.gateway.BattleGateway.restore(JSON.stringify(old),{activeHpRecovery:{superpotion:{amount:2}}});await legacy.act('p1',{kind:'item',item:'superpotion',target:legacy.activeId('p1')});await legacy.choose('p2','move 1');assert.equal(legacy.readState('p1')[0].hp,51);
 delete old.rpg.rebalancedHealingItemAmounts;const ancient=await E.gateway.BattleGateway.restore(JSON.stringify(old));await ancient.act('p1',{kind:'item',item:'superpotion',target:ancient.activeId('p1')});await ancient.choose('p2','move 1');assert.equal(ancient.readState('p1')[0].hp,61);
});
test('custom HP profile and AI catalog survive exact session checkpoint replay',async(t)=>{
 t.mock.method(Date,'now',()=>1793350000000);const w=await fixture({content:customContent(false,'superpotion',{amount:80,oldAmount:90})});hp(w,'p1',1);hp(w,'p2',1);w.session.bag.superpotion=2;w.session.gw.refreshRequests();
 const aiBefore=D.captureTrainerAiRequest(w.session,w.session.gw).snapshot,checkpoint=w.session._checkpoint();assert.equal(aiBefore.request.legalItems[0].estimateHp,90);
 const first=await w.session.useItem('superpotion',active(w).name);assert(first.ok);assert.equal(Number(itemEvent(first,'p1','superpotion').args[5]),90);const after=JSON.parse(w.session.gw.snapshot()),diagnostics=D.trainerAiDiagnostics(w.session);
 await w.session._restoreCheckpoint(checkpoint);assert.deepEqual(D.captureTrainerAiRequest(w.session,w.session.gw).snapshot,aiBefore);const second=await w.session.useItem('superpotion',active(w).name);assert(second.ok);assert.equal(Number(itemEvent(second,'p1','superpotion').args[5]),90);assert.deepEqual(JSON.parse(w.session.gw.snapshot()),after);assert.deepEqual(D.trainerAiDiagnostics(w.session),diagnostics);
});
test('invalid HP snapshot profiles are rejected rather than silently falling back',async()=>{
 const w=await battle(true),saved=JSON.parse(w.session.gw.snapshot());
 for(const profile of [null,[],{potion:{amount:0}},{potion:{amount:'80'}},{potion:{fraction:0}},{potion:{full:false}},{potion:{amount:80,full:true}},{potion:{amount:80,extra:1}},{unknown:{amount:80}}]){const bad=structuredClone(saved);bad.rpg.activeHpRecovery=profile;await assert.rejects(E.gateway.BattleGateway.restore(JSON.stringify(bad)),/invalid active HP recovery/);await assert.rejects(E.gateway.BattleGateway.create({formatid:'gen8rpgcustomgame',activeHpRecovery:profile}),/invalid active HP recovery/);}
});
test('default content does not rebind HP profiles; full restore retains canonical semantics',async()=>{
 const w=await battle(false);assert.equal(JSON.parse(w.session.gw.snapshot()).rpg.activeHpRecovery,undefined);hp(w,'p1',1);w.session.bag.fullrestore=1;active(w).status='par';const r=await w.session.useItem('fullrestore',active(w).name);assert(r.ok);assert.equal(active(w).hp,400);assert.equal(active(w).status,'');
});
test('author identity maps to the supported battle identity for both player healing and trainer estimates',async()=>{
 const source=inputs({party:1,moves:['splash'],items:[{item:'tonic',count:1}]});const item=source.items.find(i=>i.id==='superpotion');item.id='tonic';item.legacyIds=[];item.effect={family:'hp',parameters:{amount:80}};
 const compiled=E.contentCompile.compileContent(source);assert(compiled.ok,JSON.stringify(compiled.errors));const joined=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(joined.errors,[]);
 const w=await fixture({content:joined.content});hp(w,'p1',1);hp(w,'p2',1);w.session.bag.superpotion=1;w.session.gw.refreshRequests();const legal=D.captureTrainerAiRequest(w.session,w.session.gw).snapshot.request.legalItems[0];assert.equal(legal.itemId,'tonic');assert.equal(legal.estimateHp,80);assert.equal(Number(itemEvent(await w.session.useItem('superpotion',active(w).name),'p1','superpotion').args[5]),80);
});
test('full-HP and fainted targets still refuse custom HP items before spending inventory',async()=>{
 const w=await fixture({content:customContent(true,'superpotion',{amount:80})});w.session.bag.superpotion=2;
 for(const current of [400,0]){hp(w,'p1',current);if(!current)active(w).fainted=true;const before=w.session.bag.superpotion;const result=await w.session.useItem('superpotion',active(w).name);assert.equal(result.ok,false);assert.equal(w.session.bag.superpotion,before);}
});

test('explicitly different field families retain a compiler diagnosis rather than silently changing special battle semantics',()=>{
 for(const [id,effect,warn]of [['potion',{family:'status',parameters:{status:'par'}},true],['fullrestore',{family:'hp',parameters:{amount:80}},true],['fullrestore',{family:'full-restore',parameters:{}},false]]){
  const source=inputs(),item=source.items.find(i=>i.id===id);item.effect=effect;const r=E.contentCompile.compileContent(source);assert(r.ok,JSON.stringify(r.errors));assert.equal(r.warnings.some(w=>w.message.startsWith('battle-healing-family-mismatch:')),warn,id);
 }
});
