'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {birthFixture}=require('./map-birth-fixture.cjs');const {sourceFixture}=require('./f-source-fixture.cjs');const {ropeFixture}=require('../travel-rope-native-fixture.cjs');
let random;test.before(()=>{random=Math.random;Math.random=()=>assert.fail('unregistered RNG');});test.after(()=>{Math.random=random;});
const read=h=>h.lifecycle().travelLease;
const zero=h=>{assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);};
test('idle raw reserve publishes a null epoch before same-point clear ABA can restore the old source',async()=>{
 const h=await birthFixture();await h.fresh();const before=read(h),birth=before.mapBirth;assert.equal(before.current,null);
 h.player.reserveTransfer(5,h.player.x,h.player.y,h.player.direction(),0);const reserved=read(h);assert.notEqual(reserved,before,'an actual nonowned reserve must publish a new canonical epoch even when current was already null');assert.equal(reserved.current,null);assert(h.player.isTransferring());
 h.player.clearTransferInfo();const cleared=read(h);assert.notEqual(cleared,before);assert.equal(cleared,reserved,'ordinary clear does not invent a second reserve epoch');assert.equal(cleared.mapBirth.birth,birth.birth);assert.equal(cleared.mapBirth.queue,birth.queue);assert.equal(h.player.isTransferring(),false);zero(h);
});
test('each idle foreign reserve publishes its own epoch and old App retirement preserves the later native201',async()=>{
 const h=await birthFixture();await h.fresh();const before=read(h);h.player.reserveTransfer(5,h.player.x,h.player.y,6,0);const first=read(h);h.player.reserveTransfer(7,1,1,8,0);const second=read(h);assert.notEqual(first,before);assert.notEqual(second,first);assert.equal(second.current,null);h.app.stateReplacedByHost();assert.equal(h.player.isTransferring(),true);assert.equal(h.player.newMapId(),7);assert.equal(read(h),second);zero(h);
});
test('an ordinary unowned native201 still constructs and performs its real transfer',async()=>{
 const h=await birthFixture();await h.fresh();h.player.reserveTransfer(7,1,1,8,0);h.go();await h.pump(()=>h.G.$gameMap.mapId()===7&&!h.player.isTransferring()&&h.G.SceneManager._scene.isStarted());assert.equal(h.player.x,1);assert.equal(h.player.y,1);assert.equal(h.player.direction(),8);assert.equal(read(h).current,null);assert.equal(read(h).mapBirth.frame.mapId,7);zero(h);
});
test('a preexisting cold raw201 can finish naturally after genuine F arm without pretending it was a new reservation',async()=>{
 const h=await sourceFixture({menu:true});h.player.reserveTransfer(5,h.player.x,h.player.y,h.player.direction(),0);const p=h.begin();h.go();await h.pump(()=>h.announced===1);assert.equal(h.waitResult.status,'done');assert.equal(h.player.isTransferring(),false);assert.equal(read(h).sourceHandoff.phase,'ready');assert.equal(read(h).current,null);assert.equal(h.trace.filter(x=>x[0]==='native-reserve').length,1);zero(h);await h.stop(p);
});
test('actual owned Bag rope reserve and final consume retain the original one-reserve path',async()=>{
 const h=await ropeFixture(),item=await h.bag();await h.pump(()=>item.handle.done);assert.equal(item.handle.result.status,'selected');assert.equal(item.handle.result.result.travelAdmitted,true);assert.equal(h.G.$gameMap.mapId(),5);assert.equal(h.trace.filter(x=>x[0]==='native-reserve').length,1);await h.pump(()=>!h.app.saveBlocked&&h.saves.length===1);assert.equal(h.G.$gameMap.mapId(),7);assert.equal(h.ropeQuantity(),1);assert.equal(h.trace.filter(x=>x[0]==='native-reserve').length,1);zero(h);
});
