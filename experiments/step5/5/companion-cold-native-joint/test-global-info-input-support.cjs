'use strict';
// Synthetic support mechanics only: no project fixture/App/native runtime is imported.
const test=require('node:test'),assert=require('node:assert/strict');
const{observeGlobalInfo}=require('./global-info-input-support.cjs');
const wait=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function synthetic(read){
 const calls={load:[],save:[],native:0};
 const G={StorageManager:{
  loadObject(...args){calls.load.push({receiver:this,args});return read(...args);},
  saveObject(...args){const pending=deferred();calls.save.push({receiver:this,args,...pending});return pending.promise;}
 },DataManager:{_globalInfo:null,
  loadGlobalInfo(){calls.native++;if(this._globalInfo)return this._globalInfo;
   G.StorageManager.loadObject('global').then(value=>{this._globalInfo=value;return 0;}).catch(()=>{this._globalInfo=[];});
  },isGlobalInfoLoaded(){return !!this._globalInfo;}
 }};
 return{G,calls};
}
test('consumer waits for the actual read and retains native object/Promise identity',async()=>{
 const d=deferred(),{G,calls}=synthetic(()=>d.promise),o=observeGlobalInfo(G),value=[null,{title:'manual',timestamp:7}];
 let ready=false;const pending=o.loadForPlayerData({required:true,wait}).then(()=>{ready=true;});
 assert.equal(G.DataManager._globalInfo,null);assert.equal(ready,false);assert.equal(calls.native,1);
 assert.strictEqual(o.loads[0].promise,d.promise);assert.strictEqual(calls.load[0].receiver,G.StorageManager);
 d.resolve(value);await pending;
 assert.equal(ready,true);assert.strictEqual(G.DataManager._globalInfo,value);assert.strictEqual(o.boot.storageLoad.value,value);
 assert.equal(o.boot.status,'ready');assert.equal(o.boot.returned,undefined);assert.equal(calls.load.length,1);
});
test('truthy empty cache is rejected before native admission',async()=>{
 const{G,calls}=synthetic(()=>Promise.resolve([]));G.DataManager._globalInfo=[];const o=observeGlobalInfo(G);
 await assert.rejects(o.loadForPlayerData({required:true,wait}),/pinned native null/);
 assert.equal(calls.native,0);assert.equal(calls.load.length,0);
});
test('consumer rejects native failed-global fallback even when loaded becomes true',async()=>{
 const error=Error('synthetic missing global'),{G}=synthetic(()=>Promise.reject(error)),o=observeGlobalInfo(G);
 await assert.rejects(o.loadForPlayerData({required:true,wait}),/consumer cannot accept/);
 assert.equal(G.DataManager.isGlobalInfoLoaded(),true);assert.equal(o.loads[0].status,'rejected');assert.strictEqual(o.loads[0].error,error);
});
test('fresh producer accepts only the native empty-profile fallback',async()=>{
 const{G}=synthetic(()=>Promise.reject(Error('fresh profile'))),o=observeGlobalInfo(G);
 await o.loadForPlayerData({required:false,wait});assert.deepEqual(G.DataManager._globalInfo,[]);assert.equal(o.boot.status,'ready');
});
test('producer refuses a pre-existing global instead of reusing a foreign profile',async()=>{
 const{G}=synthetic(()=>Promise.resolve([null,{title:'foreign'}])),o=observeGlobalInfo(G);
 await assert.rejects(o.loadForPlayerData({required:false,wait}),/fresh producer/);
});
test('native readiness alone cannot stand in for an actual Storage read',async()=>{
 const{G,calls}=synthetic(()=>Promise.resolve([]));G.DataManager.loadGlobalInfo=function(){this._globalInfo=[];};const o=observeGlobalInfo(G);
 await assert.rejects(o.loadForPlayerData({required:true,wait}),/exactly one actual Storage/);assert.equal(calls.load.length,0);
});
test('native installation must retain the object returned by Storage',async()=>{
 const{G}=synthetic(()=>Promise.resolve([null,{title:'manual'}]));
 G.DataManager.loadGlobalInfo=function(){G.StorageManager.loadObject('global').then(value=>{this._globalInfo=[...value];});};
 const o=observeGlobalInfo(G);await assert.rejects(o.loadForPlayerData({required:true,wait}),/object installed by native Storage/);
});
test('unsettled readiness stops after its bounded support wait',async()=>{
 const d=deferred(),{G}=synthetic(()=>d.promise),o=observeGlobalInfo(G);let waits=0;
 await assert.rejects(o.loadForPlayerData({required:true,wait:async()=>{waits++;}}),/readiness did not settle/);
 assert.equal(waits,80);assert.equal(G.DataManager._globalInfo,null);d.resolve([]);await wait();
});
test('a completed prerequisite cannot be reset or invoked twice',async()=>{
 const{G,calls}=synthetic(()=>Promise.resolve([null,{title:'manual'}])),o=observeGlobalInfo(G);
 await o.loadForPlayerData({required:true,wait});await assert.rejects(o.loadForPlayerData({required:true,wait}),/runs once/);assert.equal(calls.native,1);
});
test('global write wait observes the original Promise and its real completion',async()=>{
 const{G,calls}=synthetic(()=>Promise.resolve([])),o=observeGlobalInfo(G),value=[{title:'auto'},{title:'manual'}];
 const nativePromise=G.StorageManager.saveObject('global',value);assert.strictEqual(nativePromise,calls.save[0].promise);assert.strictEqual(o.saves[0].promise,nativePromise);
 let ready=false;const pending=o.waitForSaves(1,wait).then(()=>{ready=true;});await Promise.resolve();assert.equal(ready,false);
 assert.strictEqual(calls.save[0].receiver,G.StorageManager);assert.strictEqual(calls.save[0].args[1],value);
 calls.save[0].resolve(0);await pending;assert.equal(ready,true);assert.equal(o.saves[0].status,'fulfilled');
});
test('asynchronous global rejection fails independently of file save fulfillment',async()=>{
 const{G,calls}=synthetic(()=>Promise.resolve([])),o=observeGlobalInfo(G),error=Error('global write failed');
 G.StorageManager.saveObject('global',[]);const pending=o.waitForSaves(1,wait);calls.save[0].reject(error);
 await assert.rejects(pending,/native global write failed/);assert.strictEqual(o.saves[0].error,error);
});
test('extra global writes cannot satisfy the one-write oracle',async()=>{
 const{G,calls}=synthetic(()=>Promise.resolve([])),o=observeGlobalInfo(G);
 G.StorageManager.saveObject('global',[]);G.StorageManager.saveObject('global',[]);
 await assert.rejects(o.waitForSaves(1,wait),/unexpected extra global save/);for(const row of calls.save)row.resolve(0);await wait();
});
test('non-global Storage calls keep receiver/arguments/Promise and are not counted',()=>{
 const d=deferred(),{G,calls}=synthetic(()=>d.promise),o=observeGlobalInfo(G);
 assert.strictEqual(G.StorageManager.loadObject('file1'),d.promise);assert.equal(o.loads.length,0);
 const p=G.StorageManager.saveObject('file0',{system:'synthetic'});assert.strictEqual(p,calls.save[0].promise);assert.equal(o.saves.length,0);
 assert.strictEqual(calls.load[0].receiver,G.StorageManager);assert.deepEqual(calls.load[0].args,['file1']);
 d.resolve({});calls.save[0].resolve(0);
});
test('a synchronous native Storage error remains a failure',async()=>{
 const error=Error('synthetic synchronous load error'),{G}=synthetic(()=>{throw error;}),o=observeGlobalInfo(G);
 await assert.rejects(o.loadForPlayerData({required:true,wait}),error);
 assert.equal(o.loads[0].status,'threw');assert.strictEqual(o.loads[0].error,error);assert.equal(G.DataManager._globalInfo,null);
});
