'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {birthFixture}=require('./map-birth-fixture.cjs');
const observations=[];const record=row=>{observations.push(row);fs.writeFileSync(process.env.PF_F_MAP_CONTROLS_OUTPUT,JSON.stringify(observations,null,2)+'\n');};
let random;test.before(()=>{random=Math.random;Math.random=()=>assert.fail('unregistered RNG');});test.after(()=>{Math.random=random;});
test('loaded old Map readiness cannot authorize replacement map data without another actual onMapLoaded body',async()=>{
 const h=await birthFixture(),prototype=h.G.Scene_Map.prototype,onMapLoaded=prototype.onMapLoaded;let loadedCalls=0;
 prototype.onMapLoaded=function(...args){loadedCalls++;return Reflect.apply(onMapLoaded,this,args);};
 const first=await h.fresh(),scene=h.G.SceneManager._scene;assert.equal(loadedCalls,1);const before=h.lifecycle().travelLease,oldData=h.G.$dataMap,replacement={...oldData,meta:{...oldData.meta}};h.G.$dataMap=replacement;
 assert.equal(scene.isReady(),true);const after=h.lifecycle().travelLease,actual=after?.mapBirth;
 record({name:'replacement-data-without-native-load',loadedCalls,sceneUnchanged:h.G.SceneManager._scene===scene,oldFrameHadOldData:first.frame.data===oldData,rawDataReplaced:h.G.$dataMap===replacement,receiptChanged:after!==before,sameBirthToken:actual?.birth===first.birth,sameQueueToken:actual?.queue===first.queue,afterFrameMatchesReplacement:actual?.frame?.data===replacement,mapLoadedFlag:scene._mapLoaded,draws:[...h.draws],nativeDraws:[...h.nativeDraws]});
 assert.equal(loadedCalls,1);assert.equal(actual?.frame?.data===replacement,false,'a prior load receipt must not authorize new data via readiness-only polling');assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);
});
test('two actual native create calls inside one changeScene cannot issue an authorized loaded Map birth',async()=>{
 const h=await birthFixture();h.go();const target=h.G.SceneManager._nextScene,create=target.create;let calls=0;
 target.create=function(...args){calls++;Reflect.apply(create,this,args);calls++;return Reflect.apply(create,this,args);};
 h.G.SceneManager.changeScene();assert.equal(h.G.SceneManager._scene,target);target.isReady();const birth=h.lifecycle().travelLease?.mapBirth;
 record({name:'duplicate-native-create',calls,actualTargetInstalled:h.G.SceneManager._scene===target,hasLoadedBirth:!!birth?.frame,draws:[...h.draws],nativeDraws:[...h.nativeDraws]});
 assert.equal(calls,2);assert.equal(!!birth?.frame,false);assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);
});
test('restoring a preceding fully loaded actual Map object cannot replay its loaded birth after a new native birth',async()=>{
 const h=await birthFixture(),first=await h.fresh(),second=await h.fresh();assert.notStrictEqual(second.scene,first.scene);assert.notStrictEqual(second.birth,first.birth);h.G.SceneManager._scene=first.scene;h.G.SceneManager._nextScene=null;first.scene.isReady();const birth=h.lifecycle().travelLease?.mapBirth;
 record({name:'restore-old-loaded-scene',restoredActualOldScene:h.G.SceneManager._scene===first.scene,newAndOldBirthDiffer:second.birth!==first.birth,oldBirthReissued:birth?.birth===first.birth,hasLoadedBirth:!!birth?.frame,draws:[...h.draws],nativeDraws:[...h.nativeDraws]});
 assert.equal(!!birth?.frame,false);assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);
});
