'use strict';
// Test-only player-data prerequisite. No App, fixture, native source or I/O is imported.
const assert=require('node:assert/strict');
function observeGlobalInfo(G){
 const manager=G.DataManager,storage=G.StorageManager,loads=[],saves=[];
 const nativeLoad=manager.loadGlobalInfo,nativeLoaded=manager.isGlobalInfoLoaded;
 assert.equal(typeof nativeLoad,'function');assert.equal(typeof nativeLoaded,'function');
 for(const [name,rows]of[['loadObject',loads],['saveObject',saves]]){
  const original=storage[name];assert.equal(typeof original,'function');
  storage[name]=function(...args){
   if(args[0]!=='global')return Reflect.apply(original,this,args);
   const row={receiver:this,args:[...args],status:'calling'};rows.push(row);
   try{const promise=Reflect.apply(original,this,args);row.promise=promise;row.status='returned';
    assert(promise&&typeof promise.then==='function','native global Storage call must return its Promise');
    void promise.then(value=>{row.status='fulfilled';row.value=value;},error=>{row.status='rejected';row.error=error;});
    return promise; // Keep the exact native Promise and caller continuation.
   }catch(error){row.status='threw';row.error=error;throw error;}
  };
 }
 async function until(predicate,wait,message){
  assert.equal(typeof wait,'function');
  for(let n=0;n<80;n++){if(predicate())return;await wait();}
  assert(predicate(),message);
 }
 let boot;
 return{loads,saves,get boot(){return boot;},
  async loadForPlayerData({required,wait}){
   assert.equal(typeof required,'boolean');assert.equal(boot,undefined,'player-data prerequisite runs once');
   assert.equal(manager._globalInfo,null,'start at the pinned native null, never a truthy empty cache');
   assert.equal(Reflect.apply(nativeLoaded,manager,[]),false);
   assert.equal(loads.length,0,'no earlier global read may stand in for the native prerequisite');
   boot={initial:null,required,status:'loading'};
   boot.returned=Reflect.apply(nativeLoad,manager,[]);
   await until(()=>Reflect.apply(nativeLoaded,manager,[])===true,wait,'native globalInfo readiness did not settle');
   assert.equal(loads.length,1,'native loadGlobalInfo must issue exactly one actual Storage global read');
   const row=loads[0];assert.strictEqual(row.receiver,storage);assert.deepEqual(row.args,['global']);
   assert(Array.isArray(manager._globalInfo),'native readiness must expose a global-info array');
   if(required){
    assert.equal(row.status,'fulfilled','consumer cannot accept the native missing/failed-global fallback');
    assert.strictEqual(manager._globalInfo,row.value,'use the object installed by native Storage loading');
   }else{
    assert.equal(row.status,'rejected','fresh producer must begin with no physical global');
    assert.equal(manager._globalInfo.length,0,'native fresh-profile fallback is empty');
   }
   boot.status='ready';boot.storageLoad=row;
   return boot;
  },
  async waitForSaves(expected,wait){
   assert(Number.isSafeInteger(expected)&&expected>0);
   await until(()=>{
    assert(saves.length<=expected,'unexpected extra global save');
    for(const row of saves)assert(!['rejected','threw'].includes(row.status),'native global write failed');
    return saves.length===expected&&saves.every(row=>row.status==='fulfilled');
   },wait,'native asynchronous global write did not settle');
   return saves;
  }
 };
}
module.exports={observeGlobalInfo};
