'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,location}=require('./travel-parent-fixture.cjs');const {readNativeTravelLease}=require(process.env.PF_E3_PARENT_BUNDLE);
for(const kind of ['content','game','source','scene'])test('real App preflight refuses changed '+kind+' before physical transfer',async()=>{
 const h=await fixture();await h.run();if(kind==='content')h.loaded.current={...h.content,settings:{BADGE_FOR_FLY:99}};if(kind==='game')h.external(s=>{s.money++;});if(kind==='source')h.player._x++;if(kind==='scene')h.root.SceneManager._scene={};assert.throws(()=>h.player.performTransfer(),/preflight/);assert.equal(h.map._mapId,1);assert.equal(h.player.isTransferring(),false);assert.equal(h.app.saveBlocked,false);assert.deepEqual(h.draws,[]);
});
test('real native reserve/clear publishes private reserved and genuine consumed arrived identities',async()=>{
 const h=await fixture(),source=h.native.transfer.nativeLeaseSource;assert.equal(readNativeTravelLease(source).current,null);await h.run();const first=readNativeTravelLease(source).current;assert.equal(first.phase,'reserved');assert.equal(first.owner,h.owner);assert.equal(first.receipt,h.receipt);assert.equal(first.player,h.player);assert.equal(first.sourceScene,h.root.SceneManager._scene);assert.equal(h.arrive().status,'arrived');const after=readNativeTravelLease(source).current;assert.equal(after.phase,'arrived');assert.equal(after.serial,first.serial);assert.equal(after.lease,first.lease);assert.equal((await h.finish()).status,'completed');
});
test('same-target raw201 invalidates private current and old snapshot cannot resurrect receipt',async()=>{
 const h=await fixture();await h.run();const source=h.native.transfer.nativeLeaseSource,old=readNativeTravelLease(source);h.player.reserveTransfer(2,1,1,6,0);assert.equal(readNativeTravelLease(source).current,null);assert.equal(Object.isFrozen(source),true);assert.throws(()=>{source.current=old.current;},TypeError);h.app.cancelWorldTravel('travel');assert.equal(readNativeTravelLease(source).current,null);h.player.performTransfer();assert.equal(h.map._mapId,2);assert.deepEqual(h.draws,[]);
});
const {sceneFixture}=require('./travel-native-scene-fixture.cjs');
for(const fallback of [false,true])test('actual native goto/changeScene and MZGlobalUpgrade '+(fallback?'fallback':'PIXI allocation')+' issue one fresh Scene proof',async()=>{
 const h=await sceneFixture({fallback});await h.run();const source=h.native.transfer.nativeLeaseSource,before=readNativeTravelLease(source).current,manager=h.root.SceneManager;manager.goto(h.root.Scene_Map);const next=manager._nextScene,after=readNativeTravelLease(source).current;assert.notEqual(next,before.sourceScene);assert.equal(after.scene,next);assert.equal(after.sourceScene,before.sourceScene);assert.equal(after.lease,before.lease);assert.equal(after.serial,before.serial);manager.changeScene();assert.equal(manager._scene,next);assert.equal(readNativeTravelLease(source).current.scene,next);assert.deepEqual(h.draws,[]);h.app.cancelWorldTravel('travel');
});
test('borrowed public initialize or old constructor calls do not change actual lease Scene identity',async()=>{
 const h=await sceneFixture(),manager=h.root.SceneManager,old=manager._scene;await h.run();const source=h.native.transfer.nativeLeaseSource,original=readNativeTravelLease(source).current;old.initialize();h.root.Scene_Map.call(old);assert.equal(readNativeTravelLease(source).current,original);assert.equal(original.scene,old);assert.equal(manager._nextScene,null);h.app.cancelWorldTravel('travel');
});
test('wrapper-swallowed partial constructor failure cannot publish Scene or sign private receipt',async()=>{
 let failing=false;
 const h=await sceneFixture({initialize(){if(failing)throw Error('partial-native-initialize');}});
 // Observe the actual parent request id; never manufacture a request or a native receipt.
 let requestId,reservation;
 const reserve=h.travel.reserve;
 h.travel.reserve=function(owner,receipt,...args){reservation={owner,receipt};return Reflect.apply(reserve,this,[owner,receipt,...args]);};
 const run=h.app.world.travel.run;
 h.app.world.travel.run=function(id,...args){requestId=id;return Reflect.apply(run,this,[id,...args]);};
 const result=await h.run(),manager=h.root.SceneManager,source=h.native.transfer.nativeLeaseSource;
 const first=readNativeTravelLease(source).current,currentScene=manager._scene;
 assert.equal(typeof requestId,'string');assert.notEqual(requestId.length,0);
 assert.notEqual(first,null);assert.equal(first.phase,'reserved');
 assert.equal(first.owner,reservation.owner);assert.equal(first.receipt,reservation.receipt);assert.equal(result.receipt,reservation.receipt);
 assert.equal(first.player,h.player);assert.equal(first.sourceScene,currentScene);assert.equal(first.scene,currentScene);
 assert.equal(h.app.isWorldTravelOwner(first.owner),true);assert.equal(h.app.isWorldTravelReceipt(first.owner,first.receipt),true);
 assert.equal(h.player.isTransferring(),true);
 assert.deepEqual([h.player._newMapId,h.player._newX,h.player._newY,h.player._newDirection],
  [first.receipt.target.mapId,first.receipt.target.x,first.receipt.target.y,first.receipt.target.direction]);
 assert.equal(h.app.saveBlocked,true);assert.equal(h.app.deferWorldTravelSave(),true);
 assert.equal(h.root.$gameSystem._psGame.stats.fly_count,1);assert.ok(h.effects.includes('fly-animation'));
 const prefix={game:h.root.$gameSystem._psGame,serialized:structuredClone(h.root.$gameSystem._psGame),draws:h.draws.slice(),effects:h.effects.slice(),
  requests:structuredClone(h.native.requests),saves:h.saves.slice(),arrivals:h.arrivals.slice()};
 failing=true;
 assert.throws(()=>manager.goto(h.root.Scene_Map),/construction/);
 assert.equal(manager._nextScene,null);assert.equal(manager._scene,currentScene);
 // The real App failure retires precisely this reservation instead of retaining a stale proof.
 assert.equal(readNativeTravelLease(source).current,null);
 assert.equal(h.app.isWorldTravelOwner(first.owner),false);assert.equal(h.app.isWorldTravelReceipt(first.owner,first.receipt),false);
 assert.equal(h.player.isTransferring(),false);
 assert.deepEqual([h.player._newMapId,h.player._newX,h.player._newY,h.player._newDirection],[0,0,0,0]);
 const terminal={status:'failed',reason:'travel-map-scene-source-invalid'};
 assert.deepEqual(h.app.cancelWorldTravel(requestId),terminal);
 assert.deepEqual(h.app.cancelWorldTravel(requestId),terminal);
 assert.equal(h.app.saveBlocked,false);assert.equal(h.app.deferWorldTravelSave(),false);
 assert.equal(h.errors.length,1);assert.match(h.errors[0],/partial-native-initialize/);
 await h.flush();
 assert.equal(h.root.$gameSystem._psGame,prefix.game);assert.deepEqual(h.root.$gameSystem._psGame,prefix.serialized);
 assert.deepEqual(h.draws,prefix.draws);assert.deepEqual(h.draws,[]);
 assert.deepEqual(h.effects,prefix.effects);assert.deepEqual(h.native.requests,prefix.requests);
 assert.deepEqual(h.saves,prefix.saves);assert.deepEqual(h.saves,[]);assert.deepEqual(h.arrivals,prefix.arrivals);
 assert.equal(manager._scene,currentScene);assert.equal(manager._nextScene,null);
 assert.equal(readNativeTravelLease(source).current,null);assert.equal(h.errors.length,1);
});
test('constructor reentry reserves foreign201 and queues successor without old publication overriding it',async()=>{
 let armed=false,successor;const h=await sceneFixture({initialize(scene,root){if(armed){armed=false;root.$gamePlayer.reserveTransfer(3,2,1,2,0);root.SceneManager.goto(function Successor(){successor=this;});}}});await h.run();armed=true;assert.throws(()=>h.root.SceneManager.goto(h.root.Scene_Map),/construction/);assert.equal(h.root.SceneManager._nextScene,successor);assert.equal(h.player.isTransferring(),true);assert.equal(h.player._newMapId,3);assert.equal(readNativeTravelLease(h.native.transfer.nativeLeaseSource).current,null);h.app.cancelWorldTravel('travel');assert.equal(h.player.isTransferring(),true);
});
