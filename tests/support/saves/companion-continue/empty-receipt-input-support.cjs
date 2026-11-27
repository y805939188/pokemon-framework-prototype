'use strict';
// Explicit test oracle support. Imports no App, fixture, native runtime or I/O.
const assert=require('node:assert/strict');
const data=(object,key)=>{const d=Object.getOwnPropertyDescriptor(object,key);assert(d&&Object.hasOwn(d,'value'),'expected own data '+key);return d.value;};
function callWithReceipt(original,receiver,args,observe,errors,metadata={}){
 if(observe===undefined)return Reflect.apply(original,receiver,args);
 const notify=row=>{try{observe({...metadata,receiver,args,...row});}catch(error){errors.push(error);}};
 let result;
 try{result=Reflect.apply(original,receiver,args);}catch(error){notify({status:'threw',error});throw error;}
 notify({status:'returned',result});return result;
}
function observeMethod(target,name,context){
 const before=Object.getOwnPropertyDescriptor(target,name),original=target[name],rows=[],errors=[];assert.equal(typeof original,'function');
 if(before)assert(Object.hasOwn(before,'value')&&before.configurable,'observable method descriptor');
 let restored=false;
 function wrapper(...args){
  const row={receiver:this,args,status:'calling'};rows.push(row);
  try{row.context=context();}catch(error){errors.push(error);}
  try{const result=Reflect.apply(original,this,args);row.status='returned';row.result=result;return result;}
  catch(error){row.status='threw';row.error=error;throw error;}
 }
 Object.defineProperty(target,name,{value:wrapper,writable:true,configurable:true,enumerable:before?.enumerable??false});
 return{rows,errors,restore(){
  if(restored)return true;
  const current=Object.getOwnPropertyDescriptor(target,name);
  if(!current||!Object.hasOwn(current,'value')||current.value!==wrapper){errors.push(Error('method-observer-ownership-lost'));return false;}
  try{if(before)Object.defineProperty(target,name,before);else if(!delete target[name])throw Error('method-observer-delete-failed');restored=true;return true;}
  catch(error){errors.push(error);return false;}
 }};
}
function readReceipt(call){
 assert.equal(call.status,'returned');const receipt=call.result;assert(receipt&&typeof receipt==='object');
 const handle=data(receipt,'handle'),promise=data(receipt,'result');assert(handle&&typeof handle==='object');assert(promise&&typeof promise.then==='function');
 return{receipt,handle,promise};
}
function assertReceiptIdentity(call,captured){
 assert.strictEqual(call.result,captured.receipt,'exact original receipt');
 assert.strictEqual(data(captured.receipt,'handle'),captured.handle,'exact original handle');
 assert.strictEqual(data(captured.receipt,'result'),captured.promise,'exact original result Promise');
}
function trackPromise(promise){
 assert(promise&&typeof promise.then==='function');const row={promise,status:'pending',settledCount:0};
 void promise.then(value=>{row.status='fulfilled';row.value=value;row.settledCount++;},error=>{row.status='rejected';row.error=error;row.settledCount++;});
 return row;
}
function sourceWindow(){
 let armed=null,used=false;const rows=[];
 return{rows,arm(input){assert(!used&&!armed);assert(input&&input.identity&&typeof input.current==='function'&&typeof input.matches==='function');used=true;armed=input;},
  observe(row){const input=armed;if(!input||input.current()!==input.identity||!input.matches(row))return;
   const selected={row,identity:input.identity,settlement:row.status==='returned'?trackPromise(row.result):null};rows.push(selected);
  },
  close(held){const input=armed;assert(input,'source selection remains armed asynchronously');assert.strictEqual(input.current(),input.identity,'source capture still belongs to the old scope');assert.equal(rows.length,1,'exactly one matching real source call');
   assert(held&&!held.released,'selected original XHR is still held');assert.strictEqual(held.identity,input.identity,'source/XHR share the original scope');
   const selected=rows[0];assert.equal(selected.row.status,'returned');assert.equal(selected.settlement.status,'pending','real source must still await the held transport');
   armed=null;return selected;
  },stop(){armed=null;}
 };
}
function observeCallback(held,observe){
 assert(held&&!held.released);const target=held.xhr,name='onload',before=Object.getOwnPropertyDescriptor(target,name);
 assert(before&&Object.hasOwn(before,'value')&&typeof before.value==='function'&&before.configurable,'selected native callback descriptor');
 const original=before.value,row={target,sequence:held.sequence,identity:held.identity,entered:0,returned:0,threw:0,errors:[],calls:[]};let restored=false;
 const notify=event=>{try{observe?.(event);}catch(error){row.errors.push(error);}};
 function wrapper(...args){
  const call={receiver:this,args,afterRelease:held.released};row.entered++;row.calls.push(call);
  notify({kind:'entered',call});
  try{const result=Reflect.apply(original,this,args);call.result=result;row.returned++;notify({kind:'returned',call});return result;}
  catch(error){call.error=error;row.threw++;notify({kind:'threw',call});throw error;}
 }
 Object.defineProperty(target,name,{...before,value:wrapper});
 row.restore=()=>{
  if(restored)return true;const current=Object.getOwnPropertyDescriptor(target,name);
  if(!current||!Object.hasOwn(current,'value')||current.value!==wrapper){row.errors.push(Error('callback-observer-ownership-lost'));return false;}
  try{Object.defineProperty(target,name,before);restored=true;return true;}catch(error){row.errors.push(error);return false;}
 };return row;
}
function assertLateCompletion({call,receipt,result,source,held,callback}){
 assertReceiptIdentity(call,receipt);assert.strictEqual(result.promise,receipt.promise);assert.equal(result.status,'fulfilled','original App Promise must fulfill');
 assert.equal(result.settledCount,1);assert(result.value&&['cancelled','failed'].includes(result.value.status),'old original call cannot complete under a new generation');
 assert(source&&source.settlement);assert.strictEqual(source.row.result,source.settlement.promise);assert(['fulfilled','rejected'].includes(source.settlement.status),'actual original source must settle');assert.equal(source.settlement.settledCount,1);
 assert.strictEqual(source.identity,held.identity);assert.equal(held.released,true,'original send released exactly once by the transport');
 assert.strictEqual(callback.target,held.xhr);assert.equal(callback.sequence,held.sequence);assert.strictEqual(callback.identity,held.identity);
 assert.equal(callback.entered,1,'selected old onload actually entered once');assert.equal(callback.returned,1,'selected old onload returned normally once');assert.equal(callback.threw,0);assert.equal(callback.errors.length,0);
 assert.strictEqual(callback.calls[0].receiver,held.xhr);assert.equal(callback.calls[0].afterRelease,true,'callback cannot precede the original send release');
}
module.exports={callWithReceipt,observeMethod,readReceipt,assertReceiptIdentity,trackPromise,sourceWindow,observeCallback,assertLateCompletion};
