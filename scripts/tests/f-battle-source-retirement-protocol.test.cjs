'use strict';
// Private publisher/consumer protocol controls. This is not a battle, physical save, or native run.
require('./ts-source-loader.cjs');
// This source graph includes a constructor parameter property. Keep the shared
// resolver, but transform TS only inside this test's source tree instead of
// changing production syntax or the strip-only loader used by other suites.
const {register} = require('node:module');
const {pathToFileURL} = require('node:url');
const sourceRoot = pathToFileURL(require('node:path').resolve(__dirname, '../../src') + '/').href;
register(`data:text/javascript,${encodeURIComponent(`
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
export async function load(url, context, next) {
  if (url.startsWith(${JSON.stringify(sourceRoot)}) && url.endsWith('.ts')) return {
    format: 'module',
    source: stripTypeScriptTypes(await readFile(new URL(url), 'utf8'), {mode: 'transform', sourceUrl: url}),
    shortCircuit: true,
  };
  return next(url, context);
}
`)}`, pathToFileURL(__filename));
const test=require('node:test'),assert=require('node:assert/strict'),{types}=require('node:util');
const modules=Promise.all([
 import('../../src/plugins/world/blackout-source-mz.ts'),
 import('../../src/plugins/world/blackout-save-mz.ts'),
 import('../../src/plugins/world/travel-lease-registry-mz.ts')
]);
async function protocol({kind='battle',ancestor=null,arrived=false}={}){
 const [{createBlackoutSourceMZ},{createBlackoutSaveMZ},{createNativeTravelLeaseRegistry,readNativeTravelLease}]=await modules;
 const registry=createNativeTravelLeaseRegistry(),read=()=>readNativeTravelLease(registry.source);
 class MapScene {constructor(){this._started=true;this._active=true;}}
 const scene=new MapScene(),manager={_scene:scene,_nextScene:null},map={_mapId:5},player={_x:2,_y:2,_transferring:false},data={};
 const root={Scene_Map:MapScene,SceneManager:manager,$gameMap:map,$gamePlayer:player,$dataMap:data};
 let holder,active,context,terminal,retained=null,epoch={},takes=0;
 const app={stateGeneration:1,
  isBlackoutOwner:o=>o===active,
  isBlackoutSourceContext:(o,c)=>o===active&&c===context,
  isBlackoutTransferAncestor:()=>false,isBlackoutReturnComplete:()=>false,deferWorldTravelSave:()=>false,
  isBlackoutNonTransferComplete:(o,n)=>terminal?.owner===o&&terminal.nonce===n&&terminal.generation===app.stateGeneration};
 const captureEpoch=()=>{const token=epoch;return()=>{if(epoch!==token)throw Error('controlled-native-epoch-changed');};};
 const source=createBlackoutSourceMZ(root,registry,()=>holder,types.isProxy,captureEpoch);
 const coordinator=createBlackoutSaveMZ({root,application:()=>holder,source:registry.source,isProxy:types.isProxy,
  captureNativeEpoch:captureEpoch,captureNonTransferSource:o=>source.captureNonTransferSource(o),diagnostic(){},
  collector:{current:()=>retained,take(){takes++;throw Error('no fixture original may be consumed');}}});
 const birth={},queue={};holder=app;
 source.observation.queued(scene,birth,queue);source.observation.activated(scene,birth,queue);
 source.observation.loaded(scene,birth,queue);source.observation.ready(scene,birth,queue);
 if(arrived)registry.publish({lease:{},owner:{},receipt:{},player,serial:{},sourceScene:{},scene,phase:'arrived'});
 const arm=async()=>{
  const owner={};active=owner;
  context=Object.freeze({generation:app.stateGeneration,kind,map,mapId:5,player,scene,x:2,y:2,data,birth,battleHandle:{},ancestor});
  assert.deepEqual(source.armSource(owner,context),{status:'done'});assert.deepEqual(await source.waitSource(owner,context,guard=>guard()),{status:'done'});
  return owner;
 };
 const owner=await arm();
 const complete=(o=owner)=>{active=null;const nonce={};terminal={owner:o,nonce,generation:app.stateGeneration};return nonce;};
 const preserveMovement=()=>{
  const frame=read().mapBirth;
  return registry.publishMovementStart({kind:'straight',permit:{},observation:{},manager,scene,birth:frame.birth,queue:frame.queue,map,mapId:5,player,data,
   from:{x:2,y:2},to:{x:3,y:2},mode:{},geometry:{},cells:[]});
 };
 return {source,coordinator,read,owner,arm,complete,preserveMovement,retain:()=>{retained={};},takes:()=>takes,
  queueSuccessor:()=>{manager._nextScene={};},changeGeneration:()=>{app.stateGeneration++;},nativeABA:()=>{epoch={};}};
}
test('direct no-request retirement requires its exact completed nonce, and is once-only',async()=>{
 const h=await protocol(),initial=h.read(),observation=h.source.captureNonTransferSource(h.owner);
 assert.equal(h.coordinator.nonTransferCompleted(h.owner,{}).status,'failed','active source is not a terminal');
 assert.throws(()=>observation.retireIdleBattleSource({}),/terminal-unissued/);
 assert.strictEqual(h.read(),initial);
 const done=h.complete();
 assert.equal(h.coordinator.nonTransferCompleted(h.owner,{}).status,'failed','foreign nonce must not retire exact live source');
 assert.strictEqual(h.read(),initial);
 assert.deepEqual(h.coordinator.nonTransferCompleted(h.owner,done),{status:'done'});
 const retired=h.read();assert.equal(retired.sourceHandoff,null);assert.strictEqual(retired.mapBirth,initial.mapBirth);
 assert.equal(retired.current,null);assert.notEqual(retired.nativeEpoch,initial.nativeEpoch);assert.equal(h.takes(),0);
 assert.deepEqual(h.coordinator.nonTransferCompleted(h.owner,done),{status:'done'});
 assert.strictEqual(h.read(),retired,'duplicate does not publish another empty epoch');
});
test('existing movement, an active physical arrival, and nonbattle scopes are not retired',async()=>{
 const direct=await protocol(),movement=direct.preserveMovement(),before=direct.read();
 assert.deepEqual(direct.coordinator.nonTransferCompleted(direct.owner,direct.complete()),{status:'done'});
 assert.strictEqual(direct.read(),before);assert.strictEqual(direct.read().movementStart,movement);
 for(const h of [await protocol({kind:'field'}),await protocol({ancestor:{},arrived:true})]){
  const initial=h.read();
  assert.equal(h.source.captureNonTransferSource(h.owner).retireIdleBattleSource,undefined);
  assert.deepEqual(h.coordinator.nonTransferCompleted(h.owner,h.complete()),{status:'done'});
  assert.strictEqual(h.read(),initial,'the old source and its current physical proof survive intact');assert.equal(h.takes(),0);
 }
});
test('an existing original request or native successor cannot be consumed/cleared by this seam',async()=>{
 const retained=await protocol(),before=retained.read();retained.retain();
 assert.equal(retained.coordinator.nonTransferCompleted(retained.owner,retained.complete()).status,'failed','unadopted original is not available to this completion');
 assert.strictEqual(retained.read(),before);assert.equal(retained.takes(),0);
 for(const change of ['queueSuccessor','changeGeneration','nativeABA']){
  const h=await protocol(),done=h.complete(),initial=h.read();
  h[change]();assert.equal(h.coordinator.nonTransferCompleted(h.owner,done).status,'failed');
  assert.strictEqual(h.read(),initial);assert.equal(h.takes(),0);
 }
 const swapped=await protocol(),old=swapped.source.captureNonTransferSource(swapped.owner),oldNonce=swapped.complete();
 const successor=await swapped.arm(),next=swapped.read();assert.equal(next.sourceHandoff.owner,successor);
 assert.throws(()=>old.retireIdleBattleSource(oldNonce),/source-stale|terminal-unissued/);
 assert.strictEqual(swapped.read(),next);
});
