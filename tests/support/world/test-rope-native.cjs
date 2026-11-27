'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ropeFixture,flush}=require('./travel-rope-native-fixture.cjs');let original;test.before(()=>{original=Math.random;Math.random=()=>assert.fail('unregistered RNG');});test.after(()=>{Math.random=original;});
const reserveCount=h=>h.trace.filter(row=>row[0]==='native-reserve').length;
async function admission(h,item){await h.pump(()=>item.handle.done);assert.equal(item.handle.result.status,'selected',JSON.stringify(item.handle.result));assert.equal(item.handle.result.result.travelAdmitted,true);assert.equal(item.handle.result.result.consumed,false);assert.equal(item.handle.result.result.fieldHandoff,item.token);assert.equal(h.fieldResults.at(-1).result.status,'travel-admitted');assert.equal(h.fieldResults.at(-1).result.consumed,false);assert.equal(h.fieldResults.at(-1).result.travel.status,'awaiting-arrival');assert.equal(h.G.$gameMap.mapId(),5);assert.equal(reserveCount(h),1);assert.equal(h.app.saveBlocked,true);}
test('actual Bag to fresh Map and E3 arrival consumes one rope only after genuine final commit',async()=>{
 const h=await ropeFixture(),G=h.G;const item=await h.bag();await admission(h,item);assert.equal(h.ropeQuantity(),2);assert(h.state().world.escapePoint);await h.pump(()=>!h.app.saveBlocked&&h.saves.length===1);assert.equal(G.$gameMap.mapId(),7);assert.equal(h.player.direction(),8);assert.equal(h.ropeQuantity(),1);assert.equal(h.state().world.escapePoint,null);assert.equal(h.state().steps,0);assert.equal(reserveCount(h),1);assert.equal(h.trace.filter(row=>row[0]==='native-request-autosave').length,1);assert.equal((await h.app.runFieldItemHandoff(item.token)).status,'duplicate');assert.equal(h.ropeQuantity(),1);assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);
});
test('actual Bag KeyItem rope retains quantity and reports final consumed false',async()=>{
 const h=await ropeFixture({keyItem:true,quantity:1}),item=await h.bag();await admission(h,item);await h.pump(()=>!h.app.saveBlocked&&h.saves.length===1);assert.equal(h.ropeQuantity(),1);const done=await h.app.runFieldItemHandoff(item.token);assert.equal(done.status,'duplicate');assert.equal(done.consumed,false);assert(h.state().inventory.registeredItems.includes('escaperope'));assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);
});
test('last real Bag rope removes its inventory slot, retains registration and preserves terminal receipt',async()=>{
 const h=await ropeFixture({quantity:1}),item=await h.bag();await admission(h,item);await h.pump(()=>!h.app.saveBlocked&&h.saves.length===1);assert.equal(h.ropeQuantity(),0);assert(!h.state().inventory.pockets.flat().some(row=>row.itemId==='escaperope'));assert(h.state().inventory.registeredItems.includes('escaperope'));assert.equal(h.app.fieldShortcutQueries().resolve({kind:'item',itemId:'escaperope'}).status,'refused');assert.equal((await h.app.runFieldItemHandoff(item.token)).status,'duplicate');assert.equal((await h.G.PSFlow.retryFieldItemTravel(item.token)).status,'failed');assert.equal((await h.G.PSFlow.retryFieldItemTravel(item.token)).status,'failed');assert.equal((await h.app.runFieldItemHandoff(item.token)).status,'duplicate');assert.equal(h.ropeQuantity(),0);assert.equal(reserveCount(h),1);assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);
});
test('actual boarded boat returns from Bag then rope uses genuine native dismount before transfer',async()=>{
 const h=await ropeFixture(),v=await h.board(),draws=h.draws.length,steps=h.state().steps,item=await h.bag();await admission(h,item);assert.equal(h.player.isInVehicle(),false);assert.equal(v._driving,false);assert.equal(v._mapId,5);assert.equal(h.player.isTransparent(),false);await h.pump(()=>!h.app.saveBlocked&&h.saves.length===1);assert.equal(h.G.$gameMap.mapId(),7);assert.equal(h.ropeQuantity(),1);assert.equal(h.state().steps,steps);assert.equal(h.draws.length,draws);assert.deepEqual(h.nativeDraws,[]);
});
test('actual native post-arrival refresh failure keeps rope and token; explicit retry uses same physical proof without another reserve',async()=>{
 const h=await ropeFixture(),G=h.G,refresh=h.player.refresh;let fail=true,failures=0;
 h.player.refresh=function(...args){const result=Reflect.apply(refresh,this,args);if(fail&&G.$gameMap.mapId()===7&&!this.isTransferring()){failures++;throw Error('rope-native-tail-refresh-failed');}return result;};const item=await h.bag();await admission(h,item);
 const receipt=h.fieldResults.at(-1).result.travel.receipt,requestId=h.nativeConsumer.requestIdForReceipt(receipt),reason='Error: rope-native-tail-refresh-failed';
 assert.equal(typeof requestId,'string');assert.notEqual(requestId.length,0);
 await h.pumpFailedArrival(()=>failures===1&&!h.app.saveBlocked,{requestId,receipt,reason});
 assert.equal(failures,1);assert.equal(h.nativeConsumer.ready(),false,'retained failed arrival must not satisfy ordinary completed restore');
 assert.equal(h.nativeConsumer.failedArrival(requestId,receipt,reason),true);
 assert.equal(h.nativeConsumer.failedArrival(requestId+'-wrong',receipt,reason),false);
 assert.equal(h.nativeConsumer.failedArrival(requestId,undefined,reason),false);
 assert.equal(h.nativeConsumer.failedArrival(requestId,{...receipt},reason),false);
 assert.equal(h.nativeConsumer.failedArrival(requestId,receipt,'rope-native-tail-refresh-failed'),false,'consumer realm reason remains strict');
 assert.equal(h.nativeConsumer.failedArrival(requestId,receipt,reason),true,'read-only counterchecks preserve the genuine current failure');
 assert.equal(h.ropeQuantity(),2);assert(h.state().world.escapePoint);assert.equal(h.saves.length,0);assert.equal(reserveCount(h),1);fail=false;const recovered=await G.PSFlow.retryFieldItemTravel(item.token);assert.equal(recovered.status,'completed');assert.equal(recovered.consumed,true);assert.equal(h.ropeQuantity(),1);assert.equal(h.state().world.escapePoint,null);assert.equal(h.saves.length,1);assert.equal(reserveCount(h),1);assert.equal((await h.app.runFieldItemHandoff(item.token)).status,'duplicate');assert.equal((await G.PSFlow.retryFieldItemTravel(item.token)).status,'failed');assert.equal((await h.app.runFieldItemHandoff(item.token)).status,'duplicate');assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);
});
for(const foreign of [false,true])test('real rope message '+(foreign?'foreign same-point201':'cancel')+' retains item and never clears a later native request',async()=>{
 const h=await ropeFixture(),G=h.G,item=await h.bag();await h.pump(()=>G.$gameMessage.isBusy());assert.equal(h.ropeQuantity(),2);assert.equal(reserveCount(h),0);
 if(foreign)h.player.reserveTransfer(7,1,1,8,0);else G.PSWorld.cancelFieldItem(item.token);
 if(foreign){assert.equal(h.player.isTransferring(),true);assert.equal(h.player.newMapId(),7);}
 await h.pump(()=>item.handle.done&&!h.app.saveBlocked&&!G.PSWorld.pending());assert.equal(h.ropeQuantity(),2);assert(h.state().world.escapePoint);assert.equal(item.handle.result.status,foreign?'refused':'cancelled');assert.equal(reserveCount(h),foreign?1:0);if(foreign)assert(h.player.isTransferring()||G.$gameMap.mapId()===7);assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);
});
test('generation invalidation during actual rope message cannot let old Bag callback consume or clear a fresh Bag successor',async()=>{
 const h=await ropeFixture(),G=h.G,old=await h.bag();await h.pump(()=>G.$gameMessage.isBusy());h.app.stateReplacedByHost();await h.pump(()=>old.handle.done&&!h.app.saveBlocked&&!G.PSWorld.pending());assert.equal(h.ropeQuantity(),2);assert.equal(reserveCount(h),0);const fresh=await h.bag();assert.notEqual(fresh.token,old.token);await admission(h,fresh);await h.pump(()=>!h.app.saveBlocked&&h.saves.length===1);assert.equal(h.ropeQuantity(),1);assert.equal(reserveCount(h),1);assert.equal((await G.PSFlow.retryFieldItemTravel(old.token)).status,'refused');assert.equal((await h.app.runFieldItemHandoff(fresh.token)).status,'duplicate');assert.equal(h.ropeQuantity(),1);assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);
});
