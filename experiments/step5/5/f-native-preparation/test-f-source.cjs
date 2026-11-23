'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceFixture,flush}=require('./f-source-fixture.cjs');let random;test.before(()=>{random=Math.random;Math.random=()=>assert.fail('unregistered RNG');});test.after(()=>{Math.random=random;});
const claim=h=>h.lifecycle().travelLease.sourceHandoff;
const reserveCount=h=>h.trace.filter(x=>x[0]==='native-reserve').length;
test('actual F private owner binds an already genuine Map after a true native frame and source FIFO prefix',async()=>{
 const h=await sourceFixture(),birth=h.lifecycle().travelLease.mapBirth,p=h.begin();assert(h.app.isBlackoutOwner(h.owner));assert(h.app.isBlackoutSourceContext(h.owner,h.context));assert.equal(h.app.isBlackoutSourceContext(h.owner,{...h.context}),false);assert.equal(h.app.observeWorldMapEntry({id:'source-fifo',cause:'load',mapId:5,previousMapId:5,rebuilt:true}).status,'queued');await h.pump(()=>h.announced===1);const c=claim(h);assert.equal(c.phase,'ready');assert.equal(c.owner,h.owner);assert.equal(c.context,h.context);assert.equal(c.target.birth,birth.birth);assert.equal(c.target.frame.data,h.G.$dataMap);assert(h.state().world.visitedMaps.includes(5));assert.equal(h.state().world.pendingReturn.phase,'announce');assert.equal(reserveCount(h),0);assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);await h.stop(p);
});
test('actual F resume context from a bounded Menu source binds one freshly constructed real Map',async()=>{
 const h=await sourceFixture({menu:true}),source=h.G.SceneManager._scene,p=h.begin();assert.equal(claim(h).phase,'armed');assert.equal(claim(h).target,null);assert.equal(h.context.scene,source);h.go();await h.pump(()=>h.announced===1);const c=claim(h);assert.equal(c.phase,'ready');assert.notEqual(c.target.scene,source);assert.equal(c.sourceScene,source);assert.equal(c.target.scene,h.G.SceneManager._scene);assert.equal(c.target.frame.map,h.G.$gameMap);assert.equal(reserveCount(h),0);assert.deepEqual(h.draws,[]);await h.stop(p);
});
test('an App-issued cold context cannot be cloned or replaced by an accessor DTO',async()=>{
 const h=await sourceFixture(),p=h.begin();let getter=0;const clone={...h.context};Object.defineProperty(clone,'map',{get(){getter++;throw Error('must not execute');},enumerable:true});assert.equal(h.source.armSource(h.owner,clone).status,'failed');assert.equal(h.source.armSource({},h.context).status,'failed');assert.equal(getter,0);assert.equal(claim(h).owner,h.owner);await h.stop(p);assert.equal(reserveCount(h),0);
});
test('raw same-point reserve-clear ABA after actual F arm invalidates its source without a transfer',async()=>{
 const h=await sourceFixture(),p=h.begin();h.player.reserveTransfer(5,2,2,6,0);h.player.clearTransferInfo();const result=await p;assert.equal(result.status,'failed');assert.equal(h.announced,0);assert.equal(h.waitResult.status,'failed');assert(!claim(h));assert.equal(h.player.isTransferring(),false);assert.equal(reserveCount(h),1);assert.deepEqual(h.draws,[]);
});
test('generation retirement cannot clear a later raw201 or publish a stale F ready claim',async()=>{
 const h=await sourceFixture({menu:true}),p=h.begin();h.app.stateReplacedByHost();h.player.reserveTransfer(7,1,1,8,0);const result=await p;assert.equal(result.status,'failed');assert.equal(result.reason,'blackout-native-source-stale');assert.equal(h.announced,0);assert.equal(h.player.isTransferring(),true);assert.equal(h.player.newMapId(),7);assert(!claim(h));assert.equal(reserveCount(h),1);assert.deepEqual(h.draws,[]);
});
test('a normal goto reusing the old Map cannot satisfy an App-owned source handoff',async()=>{
 const h=await sourceFixture(),old=h.G.SceneManager._scene;h.G.SceneManager.goto(h.G.Scene_MenuBase);h.tick();await flush();const p=h.begin();h.G.SceneManager.goto(function Reuse(){return old;});await h.pump(()=>h.waitResult!==undefined);const result=await p;assert.equal(result.status,'failed');assert.equal(h.announced,0);assert(!claim(h));assert.equal(reserveCount(h),0);assert.deepEqual(h.nativeDraws,[]);
});
test('foreign queued Scene cannot be washed back into the prior F source after genuine arm',async()=>{
 const h=await sourceFixture({menu:true}),p=h.begin();h.G.SceneManager.goto(h.G.Scene_MenuBase);h.G.SceneManager.goto(h.G.Scene_Map);const result=await p;assert.equal(result.status,'failed');assert.equal(h.announced,0);assert(!claim(h));assert.equal(reserveCount(h),0);assert.deepEqual(h.draws,[]);
});

test('App-owned constructor partial failure cannot publish a Map birth or retain the F gate',async()=>{
 const h=await sourceFixture({menu:true}),p=h.begin(),prototype=h.G.Scene_Map.prototype,init=prototype.initialize;
 prototype.initialize=function(...args){Reflect.apply(init,this,args);throw Error('controlled-F-partial-init');};
 assert.throws(()=>h.go(),/construction/);const result=await p;assert.equal(result.status,'failed');assert.equal(h.announced,0);assert(!claim(h));assert.equal(h.G.SceneManager._nextScene,null);assert.equal(h.app.saveBlocked,false);assert.equal(reserveCount(h),0);assert.deepEqual(h.nativeDraws,[]);
});
test('reentrant raw201 during genuine F construction invalidates its candidate and preserves the foreign reservation',async()=>{
 const h=await sourceFixture({menu:true}),p=h.begin(),prototype=h.G.Scene_Map.prototype,init=prototype.initialize;let entered=false;
 prototype.initialize=function(...args){Reflect.apply(init,this,args);if(!entered){entered=true;h.player.reserveTransfer(7,1,1,8,0);}};
 assert.throws(()=>h.go(),/construction/);const result=await p;assert.equal(result.status,'failed');assert.equal(h.announced,0);assert(!claim(h));assert.equal(h.player.isTransferring(),true);assert.equal(h.player.newMapId(),7);assert.equal(h.app.saveBlocked,false);assert.equal(reserveCount(h),1);assert.deepEqual(h.draws,[]);
});
