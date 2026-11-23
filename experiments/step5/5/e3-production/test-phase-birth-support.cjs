 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
assert.equal(process.version,'v22.21.1');
// IR01–IR04 retain the independent source timeline and original assertions.
// Only the module path/report writer change for checked-in, read-only pure controls.
const {observer}=require('./native-consumer-observer.cjs');
const reports=[];
function ordinaryTimeline({earlyBirth=false,throwing=false,rejected=false,replaceRun=false}={}){
 let runCalls=0;
 const error=Error('independent-original-error'),owner={},receipt={generation:2},scene={},map={_mapId:6},data={},player={},registry={},birth={};
 const failed={status:'failed',reason:'configured-fly-callback-failed'},runValue={status:'awaiting-arrival',receipt};
 const runPromise=rejected?Promise.reject(error):Promise.resolve(runValue),finishPromise=rejected?Promise.reject(error):Promise.resolve(failed);
 if(rejected){void runPromise.catch(()=>{});void finishPromise.catch(()=>{});}
 const calls=[],app={stateGeneration:2,world:{travel:{recovery(id){calls.push(['recovery',id]);return {status:'failed',phase:'after-arrival',physical:'arrived',reasonCode:'tail-failed',retry:{enabled:true},cancel:{enabled:false}};}}},
  runWorldTravel(...args){calls.push(['run',this===app,args]);if(throwing)throw error;return replaceRun&&++runCalls>1?Promise.resolve({status:'awaiting-arrival',receipt}):runPromise;},
  confirmWorldTravelArrival(...args){calls.push(['confirm',this===app,args]);if(throwing)throw error;return {status:'arrived'};},
  finishWorldTravelArrival(...args){calls.push(['finish',this===app,args]);if(throwing)throw error;return finishPromise;},
  restoreEventCompanionsAtMap(){assert.fail('observer must not initiate restore');}};
 const physical={lease:{},serial:{},owner,receipt,player,scene,phase:'arrived'};
 const frame={map,data,player,mapId:6},life={travelLease:{registry,current:physical,...(earlyBirth?{mapBirth:{birth,scene,frame}}:{})}};
 function SceneMap(){}SceneMap.prototype.update=function(...args){calls.push(['update',this===scene,args]);return 'actual-fake-map-return';};
 const G={PSFlow:{_app:app,companionNativeMapFrame(){assert.fail('observer must not initiate frame');}},SceneManager:{_scene:scene},Scene_Map:SceneMap,$gameMap:map,$dataMap:data,$gamePlayer:player,Graphics:{frameCount:1}};
 const ports={state:{worldLifecycle(){return {map,mapId:6,player,scene,mapData:data};},atomicWorldContent(prepare){return prepare()({lifecycle:life});}}};
 const o=observer();o.observePorts(ports);o.install(G,app);
 return {error,owner,receipt,scene,app,life,frame,birth,G,ports,o,calls,runPromise,finishPromise};
}
async function reachFailedCheckpoint(h,mutateLate){
 const originalRun=h.app.runWorldTravel('independent-run',{kind:'fly'});assert.strictEqual(originalRun,h.runPromise);await originalRun;
 // confirm is synchronous inside original onMapLoaded/performTransfer; only its
 // already-consumed atomic frame is available, with absent materialized mapBirth.
 h.ports.state.atomicWorldContent(()=>()=>undefined);
 assert.equal(h.app.confirmWorldTravelArrival(h.owner,h.receipt,{}).status,'arrived');
 const originalFinish=h.app.finishWorldTravelArrival(h.receipt);assert.strictEqual(originalFinish,h.finishPromise);
 // The original onMapLoaded now returns, then isReady publishes a fully loaded
 // birth. This only changes our ordinary input; no native method is executed.
 h.life.travelLease.mapBirth={birth:h.birth,scene:h.scene,frame:h.frame};
 mutateLate?.(h);
 h.ports.state.atomicWorldContent(()=>()=>undefined);
 await originalFinish;await Promise.resolve();
 assert.equal(Reflect.apply(h.G.Scene_Map.prototype.update,h.scene,[]),'actual-fake-map-return');
 return h.o.failedArrival('independent-run',h.receipt,'configured-fly-callback-failed');
}
test('IR01 legitimate early absent birth then loaded birth must reach the failed checkpoint',async()=>{
 const h=ordinaryTimeline();const actual=await reachFailedCheckpoint(h);reports.push({case:'IR01',actualFailedArrivalReady:actual,expected:true,stageShape:'confirm absent materialized birth -> onMapLoaded returns -> ready fully materialized same retained lease',status:h.o.status(),observedRows:h.o.rows});
 assert.equal(actual,true,'valid production-shaped two-stage birth timeline must not wait forever before explicit retry');
});
test('IR02 early fully materialized synthetic control isolates the birth-timing distinction',async()=>{
 const h=ordinaryTimeline({earlyBirth:true});const actual=await reachFailedCheckpoint(h);reports.push({case:'IR02',actualFailedArrivalReady:actual,expected:true,status:h.o.status()});assert.equal(actual,true);
});
test('IR03 transparent observation preserves synchronous original throws',()=>{
 const h=ordinaryTimeline({throwing:true});
 for(const [method,args] of [['runWorldTravel',['independent-run',{}]],['confirmWorldTravelArrival',[h.owner,h.receipt,{}]],['finishWorldTravelArrival',[h.receipt]]])assert.throws(()=>Reflect.apply(h.app[method],h.app,args),e=>e===h.error);
 assert(h.calls.filter(x=>['run','confirm','finish'].includes(x[0])).every(x=>x[1]===true));assert.equal(h.o.status().errors.length,0);
});
test('IR04 transparent observation preserves rejected original Promise identity and error',async()=>{
 const h=ordinaryTimeline({rejected:true});const rp=h.app.runWorldTravel('independent-run',{}),fp=h.app.finishWorldTravelArrival(h.receipt);
 assert.strictEqual(rp,h.runPromise);assert.strictEqual(fp,h.finishPromise);await assert.rejects(rp,e=>e===h.error);await assert.rejects(fp,e=>e===h.error);await Promise.resolve();
 assert.equal(h.o.failedArrival('independent-run',h.receipt,'configured-fly-callback-failed'),false);assert.equal(h.o.status().errors.length,0);
});
test('BR01 missing and null late published birth never authenticate the failed checkpoint',async()=>{
 for(const mutate of [h=>delete h.life.travelLease.mapBirth,h=>h.life.travelLease.mapBirth=null,
  h=>h.life.travelLease.mapBirth.frame=null,h=>h.life.travelLease.mapBirth.birth=undefined]){
  const h=ordinaryTimeline();assert.equal(await reachFailedCheckpoint(h,mutate),false);
 }
});
test('BR02 late wrong Scene data player and map observations reject',async()=>{
 for(const mutate of [h=>h.life.travelLease.mapBirth.scene={},h=>h.life.travelLease.mapBirth.frame={...h.frame,data:{}},
  h=>h.life.travelLease.mapBirth.frame={...h.frame,player:{}},h=>h.life.travelLease.mapBirth.frame={...h.frame,map:{}},
  h=>h.life.travelLease.mapBirth.frame={...h.frame,mapId:5}]){
  const h=ordinaryTimeline();assert.equal(await reachFailedCheckpoint(h,mutate),false);
 }
});
test('BR03 late wrong receipt owner lease serial registry and generation reject',async()=>{
 for(const key of ['receipt','owner','lease','serial']){
  const h=ordinaryTimeline();assert.equal(await reachFailedCheckpoint(h,h=>{h.life.travelLease.current={...h.life.travelLease.current,[key]:{}};}),false,key);
 }
 for(const mutate of [h=>h.life.travelLease.registry={},h=>h.app.stateGeneration++,
  h=>h.G.PSFlow._app={stateGeneration:2},h=>h.life.travelLease.current={...h.life.travelLease.current,phase:'reserved'}]){
  const h=ordinaryTimeline();assert.equal(await reachFailedCheckpoint(h,mutate),false);
 }
});
test('BR04 an accepted loaded birth is bound once; another later same-frame birth cannot replace it',async()=>{
 const h=ordinaryTimeline();assert.equal(await reachFailedCheckpoint(h),true);
 h.life.travelLease.mapBirth={birth:{},scene:h.scene,frame:h.frame};h.ports.state.atomicWorldContent(()=>()=>undefined);
 Reflect.apply(h.G.Scene_Map.prototype.update,h.scene,[]);
 assert.equal(h.o.failedArrival('independent-run',h.receipt,'configured-fly-callback-failed'),false);
});
test('BR05 ordinary base worldLifecycle has no rich lease and cannot overwrite the observed atomic phase',async()=>{
 const h=ordinaryTimeline();assert.equal(await reachFailedCheckpoint(h),true);
 const base=h.ports.state.worldLifecycle();assert.equal(base.travelLease,undefined);
 assert.equal(h.o.failedArrival('independent-run',h.receipt,'configured-fly-callback-failed'),true);
 assert.equal(h.calls.filter(x=>x[0]==='run').length,1);assert.equal(h.calls.filter(x=>x[0]==='confirm').length,1);assert.equal(h.calls.filter(x=>x[0]==='finish').length,1);
});
test('BR06 late request replacement cannot reuse the prior real confirmation',async()=>{
 const h=ordinaryTimeline({replaceRun:true});assert.equal(await reachFailedCheckpoint(h),true);
 const original=h.app.runWorldTravel('independent-run',{kind:'fly'});assert.notStrictEqual(original,h.runPromise);await original;await Promise.resolve();
 assert.equal(h.o.failedArrival('independent-run',h.receipt,'configured-fly-callback-failed'),false);
});
