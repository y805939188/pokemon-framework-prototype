'use strict';
// Test transport and passive save observations. This module issues no App/native permission.
const assert=require('node:assert/strict');
function singleRequestHold(Original){
 const send=Original.prototype.send;assert.equal(typeof send,'function');
 let sequence=0,armed=null,held=null;
 const serials=new WeakMap();
 class XHR extends Original{
  constructor(...args){super(...args);serials.set(this,++sequence);}
  send(...args){
   if(held?.xhr===this)throw Error('held-request-send-repeated');
   const a=armed;
   if(a&&a.current()===a.identity&&a.matches(this)){
    armed=null;held={xhr:this,sequence:serials.get(this),identity:a.identity,args:[...args],url:this.url,released:false,result:undefined,error:undefined};
    return undefined;
   }
   return Reflect.apply(send,this,args);
  }
 }
 return{XHR,
  arm(input){assert(!armed&&!held,'request hold already armed or captured');assert(input&&input.identity&&typeof input.identity==='object');assert.equal(typeof input.current,'function');assert.equal(typeof input.matches,'function');armed={...input};},
  captured(){return held;},
  release(xhr,serial){
   assert(held&&held.xhr===xhr&&held.sequence===serial,'foreign held request identity');
   assert(!held.released,'held request already released');
   held.released=true; // Reentry or a native throw must never permit a second send.
   try{return held.result=Reflect.apply(send,xhr,held.args);}catch(error){held.error=error;throw error;}
  }
 };
}
function observeAutosaves(G){
 const requests=[],executions=[],attempts=[];
 const prototype=G.Scene_Map.prototype;
 const snapshot=()=>({system:G.$gameSystem,saveCount:G.$gameSystem._saveCount,version:G.$gameSystem._versionId});
 const request=prototype.requestAutosave,execute=prototype.executeAutosave,save=G.DataManager.saveGame;
 for(const fn of[request,execute,save])assert.equal(typeof fn,'function');
 prototype.requestAutosave=function(...args){const row={receiver:this,args:[...args],before:snapshot()};requests.push(row);try{return row.result=Reflect.apply(request,this,args);}catch(error){row.error=error;throw error;}};
 prototype.executeAutosave=function(...args){const row={receiver:this,args:[...args],before:snapshot()};executions.push(row);try{return row.result=Reflect.apply(execute,this,args);}catch(error){row.error=error;throw error;}finally{row.after=snapshot();}};
 G.DataManager.saveGame=function(...args){
  const row={receiver:this,args:[...args],status:'calling'};attempts.push(row);
  try{const result=Reflect.apply(save,this,args);row.result=result;row.status='returned';
   // Observe settlement without replacing the native Promise or its caller continuation.
   if(result&&typeof result.then==='function')void result.then(value=>{row.status='fulfilled';row.value=value;},error=>{row.status='rejected';row.error=error;});
   return result;
  }catch(error){row.status='threw';row.error=error;throw error;}
 };
 return{requests,executions,attempts};
}
module.exports={singleRequestHold,observeAutosaves};
