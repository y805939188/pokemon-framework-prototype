'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {sceneFixture}=require('./travel-native-scene-fixture.cjs');const {readNativeTravelLease}=require(process.env.PF_E3_PARENT_BUNDLE);
let random;test.before(()=>{random=Math.random;Math.random=()=>assert.fail('unregistered RNG');});test.after(()=>{Math.random=random;});
function ForeignScene(){this._started=false;}Object.assign(ForeignScene.prototype,{stop(){},terminate(){},create(){}});
for(const fallback of [false,true])test('actual same-source Map goto publishes one private lease; duplicate queue is idempotent '+fallback,async()=>{
 let constructed=0;const h=await sceneFixture({fallback,initialize(){constructed++;}});await h.run();const m=h.root.SceneManager,source=h.native.transfer.nativeLeaseSource,before=readNativeTravelLease(source).current;m.goto(h.root.Scene_Map);const target=m._nextScene,after=readNativeTravelLease(source).current;m.goto(h.root.Scene_Map);assert.equal(m._nextScene,target);assert.equal(constructed,2);assert.equal(readNativeTravelLease(source).current,after);assert.equal(after.scene,target);assert.equal(after.sourceScene,before.sourceScene);assert.equal(after.lease,before.lease);assert.equal(after.serial,before.serial);m.changeScene();assert.equal(m._scene,target);assert.deepEqual(h.draws,[]);h.cancel();
});
test('adapted independent real foreign Scene round trip cannot publish an old lease Map receipt',async()=>{
 const h=await sceneFixture();await h.run();const m=h.root.SceneManager,source=h.native.transfer.nativeLeaseSource,before=readNativeTravelLease(source).current;m.goto(ForeignScene);m.changeScene();const foreign=m._scene;assert(foreign instanceof ForeignScene);
 // The original fcea probe observed stale current===before. The corrected producer revokes it immediately.
 assert.equal(readNativeTravelLease(source).current,null);assert.equal(h.app.canPerformWorldTravel(h.owner,h.receipt),false);m.goto(h.root.Scene_Map);const target=m._nextScene,after=readNativeTravelLease(source).current;
 assert.equal(!!target&&after?.scene===target,false,'a genuine Map allocation from an unrelated actual source must not launder the old private transfer lease');assert.equal(h.player.isTransferring(),false);assert.equal(h.app.saveBlocked,false);assert.deepEqual(h.draws,[]);
});
test('captured real native alias queued foreign Scene cannot be overwritten by an old owned Map goto',async()=>{
 const h=await sceneFixture();await h.run();const m=h.root.SceneManager,text=fs.readFileSync(path.join(process.env.PF_E3_NATIVE_ROOT,'js/reactor_managers.js'),'utf8'),start=text.indexOf('SceneManager.goto = function'),end=text.indexOf('\n};',start);vm.runInContext(text.slice(start,end+4).replace('SceneManager.goto =','globalThis.capturedNativeGoto ='),h.root);h.root.capturedNativeGoto.call(m,ForeignScene);const foreign=m._nextScene;assert(foreign instanceof ForeignScene);m.goto(h.root.Scene_Map);assert.equal(m._nextScene,foreign);assert.equal(readNativeTravelLease(h.native.transfer.nativeLeaseSource).current,null);assert.equal(h.player.isTransferring(),false);assert.equal(h.app.saveBlocked,false);assert.deepEqual(h.draws,[]);
});
test('restoring the old source Scene object cannot re-sign an invalidated native lease',async()=>{
 const h=await sceneFixture();await h.run();const m=h.root.SceneManager,source=m._scene;m.goto(ForeignScene);m.changeScene();m._scene=source;m._nextScene=null;m.goto(h.root.Scene_Map);assert.equal(readNativeTravelLease(h.native.transfer.nativeLeaseSource).current,null);h.player.performTransfer();assert.equal(h.map._mapId,1);assert.equal(h.player.isTransferring(),false);assert.deepEqual(h.draws,[]);
});
test('a consumed Map constructor allocation cannot mint another private Scene under the same transfer',async()=>{
 const h=await sceneFixture();await h.run();const m=h.root.SceneManager;m.goto(h.root.Scene_Map);m.changeScene();m.goto(h.root.Scene_Map);assert.equal(readNativeTravelLease(h.native.transfer.nativeLeaseSource).current,null);assert.equal(h.player.isTransferring(),false);assert.equal(h.app.saveBlocked,false);
});
test('wrapper-swallowed partial initialization invalidates proof without leaving an owned queued Scene',async()=>{
 let failing=false;const h=await sceneFixture({initialize(){if(failing)throw Error('partial-native-init');}});await h.run();failing=true;assert.throws(()=>h.root.SceneManager.goto(h.root.Scene_Map),/construction/);assert.equal(h.root.SceneManager._nextScene,null);assert.equal(readNativeTravelLease(h.native.transfer.nativeLeaseSource).current,null);assert.equal(h.player.isTransferring(),false);assert.equal(h.app.saveBlocked,false);assert.equal(h.errors.length,1);
});
test('same-owner constructor reentry cannot mint either private Map receipt',async()=>{
 let armed=false;const h=await sceneFixture({initialize(_scene,root){if(armed){armed=false;root.SceneManager.goto(root.Scene_Map);}}});await h.run();armed=true;assert.throws(()=>h.root.SceneManager.goto(h.root.Scene_Map),/construction/);assert.equal(readNativeTravelLease(h.native.transfer.nativeLeaseSource).current,null);assert.equal(h.player.isTransferring(),false);assert.equal(h.app.saveBlocked,false);
});
test('raw same-target native201 and a foreign Scene survive late old construction failure',async()=>{
 let armed=false,successor;const h=await sceneFixture({initialize(_scene,root){if(armed){armed=false;root.$gamePlayer.reserveTransfer(2,1,1,6,0);root.SceneManager.goto(function Successor(){successor=this;});}}});await h.run();armed=true;assert.throws(()=>h.root.SceneManager.goto(h.root.Scene_Map),/construction/);assert.equal(h.root.SceneManager._nextScene,successor);assert.equal(h.player.isTransferring(),true);assert.equal(h.player._newMapId,2);assert.equal(readNativeTravelLease(h.native.transfer.nativeLeaseSource).current,null);h.cancel();assert.equal(h.player.isTransferring(),true);assert.deepEqual(h.draws,[]);
});
for(const kind of ['generation','serial'])test('changed '+kind+' cannot publish the preceding private Scene receipt',async()=>{
 let armed=false;const h=await sceneFixture({initialize(_scene,root){if(armed){armed=false;if(kind==='generation')h.app.stateReplacedByHost();else root.$gamePlayer.reserveTransfer(3,2,1,2,0);}}});await h.run();armed=true;assert.throws(()=>h.root.SceneManager.goto(h.root.Scene_Map),/construction/);assert.equal(readNativeTravelLease(h.native.transfer.nativeLeaseSource).current,null);assert.equal(h.player.isTransferring(),kind==='serial');if(kind==='serial')assert.equal(h.player._newMapId,3);assert.deepEqual(h.draws,[]);h.cancel();
});
test('old source failure notification cannot overwrite a later raw201 or queued successor',async()=>{
 const h=await sceneFixture();await h.run();const m=h.root.SceneManager;let successor,once=true;h.native.ports.diagnostic=()=>{if(once){once=false;h.player.reserveTransfer(3,2,1,2,0);m.goto(function Successor(){successor=this;});}};m.goto(ForeignScene);assert.equal(m._nextScene,successor);assert.equal(h.player.isTransferring(),true);assert.equal(h.player._newMapId,3);assert.equal(h.app.saveBlocked,false);assert.equal(readNativeTravelLease(h.native.transfer.nativeLeaseSource).current,null);assert.deepEqual(h.draws,[]);
});
