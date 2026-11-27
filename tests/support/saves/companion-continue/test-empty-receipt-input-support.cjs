'use strict';
// Pure synthetic methods/Promises/transport only. Never imports an App or fixture.
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('./empty-receipt-input-support.cjs'),{singleRequestHold}=require('./empty-load-input-support.cjs');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
async function harness(value={status:'cancelled',diagnostics:[]}){
 const appResult=deferred(),sourceResult=deferred(),identity={},argument={payload:'original'},native=[];let current=identity;
 class NativeXHR{open(method,url){this.url=url;}send(...args){native.push({receiver:this,args});queueMicrotask(()=>{this.status=0;this.responseText='synthetic';this.onload(...args);});}}
 const hold=singleRequestHold(NativeXHR),sources=S.sourceWindow(),errors=[];
 const scope=()=>current;
 sources.arm({identity,current:scope,matches:row=>row.args[0].originEventId===1});hold.arm({identity,current:scope,matches:xhr=>xhr.url==='Map005.json'});
 const receipt=Object.freeze({handle:Object.freeze({}),result:appResult.promise}),originalCallback=function(...args){sourceResult.resolve({status:'unavailable'});appResult.resolve(value);return argument;};
 const originalSource=function(origin){const xhr=new hold.XHR();xhr.open('GET','Map005.json');xhr.onload=originalCallback;xhr.send(argument,7);return sourceResult.promise;};
 const proto={beginEventCompanion(intent){queueMicrotask(()=>S.callWithReceipt(originalSource,this,[{originMapId:5,originEventId:1}],row=>sources.observe(row),errors));return receipt;}};
 const app=Object.create(proto),o=S.observeMethod(app,'beginEventCompanion',()=>identity),intent={kind:'register',eventId:1};
 const returned=app.beginEventCompanion(intent);assert.strictEqual(returned,receipt);assert.equal(o.restore(),true);assert.equal(Object.hasOwn(app,'beginEventCompanion'),false);
 const call=o.rows[0],captured=S.readReceipt(call),result=S.trackPromise(captured.promise);
 assert.equal(sources.rows.length,0,'source window survives synchronous App observer restoration');await Promise.resolve();
 const held=hold.captured(),source=sources.close(held),callback=S.observeCallback(held);
 const gate=()=>S.assertLateCompletion({call,receipt:captured,result,source,held,callback});
 return{app,o,call,captured,result,source,held,callback,gate,hold,sources,errors,receipt,intent,argument,native,appResult,sourceResult,
  setCurrent(value){current=value;},release(){return hold.release(held.xhr,held.sequence);},async finish(){this.release();await flush();}};
}
test('RC01 real synthetic async source remains selectable after synchronous App restoration',async()=>{
 const h=await harness();assert.equal(h.o.rows.length,1);assert.strictEqual(h.call.receiver,h.app);assert.strictEqual(h.call.args[0],h.intent);assert.strictEqual(h.captured.receipt,h.receipt);assert.strictEqual(h.captured.handle,h.receipt.handle);assert.strictEqual(h.captured.promise,h.receipt.result);
 assert.strictEqual(h.source.row.result,h.sourceResult.promise);assert.equal(h.source.settlement.status,'pending');await h.finish();h.gate();assert.equal(h.callback.restore(),true);assert.equal(h.errors.length,0);
});
test('RC02 getter absence is irrelevant only when all actual completion gates pass',async()=>{
 const h=await harness();h.app.getterDiagnostic=undefined;await h.finish();assert.equal(h.app.getterDiagnostic,undefined);h.gate();h.callback.restore();
});
test('RC03 a misleading completed publication cannot replace the cancelled raw receipt',async()=>{
 const h=await harness();h.app.getterDiagnostic={status:'completed'};await h.finish();h.gate();assert.equal(h.result.value.status,'cancelled');h.callback.restore();
});
for(const [id,value]of[['RC04',{status:'completed'}],['RC05',{status:'duplicate'}],['RC06',undefined],['RC07',{status:'refused'}]])test(id+' non-rejecting-looking getter cannot excuse an invalid original terminal',async()=>{
 const h=await harness(value===undefined?null:value);h.app.getterDiagnostic={status:'cancelled'};await h.finish();assert.throws(h.gate,/old original call/);h.callback.restore();
});
test('RC08 raw Promise rejection is recorded and never translated to a failed DTO',async()=>{
 const h=await harness(),error=Error('original rejection');h.appResult.reject(error);await h.finish();assert.equal(h.result.status,'rejected');assert.strictEqual(h.result.error,error);assert.throws(h.gate,/must fulfill/);h.callback.restore();
});
test('RC09 send release and wait=false cannot stand in for callback/source completion',async()=>{
 const h=await harness();h.appResult.resolve({status:'cancelled',diagnostics:[]});await Promise.resolve();h.release();const wait=false;
 assert.equal(h.held.released,true);assert.equal(wait,false);assert.equal(h.callback.entered,0);assert.throws(h.gate,/source must settle/);await flush();h.gate();h.callback.restore();
});
test('RC10 delivered callback alone cannot stand in for original source continuation',async()=>{
 const h=await harness();await h.finish();const pending={...h.source,settlement:{promise:h.source.row.result,status:'pending',settledCount:0}};
 assert.throws(()=>S.assertLateCompletion({call:h.call,receipt:h.captured,result:h.result,source:pending,held:h.held,callback:h.callback}),/source must settle/);h.callback.restore();
});
test('RC11 wrong receipt, handle and result Promise identities are each rejected',async()=>{
 const h=await harness();for(const changed of[{...h.captured,receipt:{}},{...h.captured,handle:{}},{...h.captured,promise:Promise.resolve({status:'cancelled'})}])assert.throws(()=>S.assertReceiptIdentity(h.call,changed),/exact original/);
 await h.finish();h.callback.restore();
});
test('RC12 foreign same-URL XHR or sequence cannot satisfy selected delivery',async()=>{
 const h=await harness();await h.finish();for(const callback of[{...h.callback,target:{}},{...h.callback,sequence:h.callback.sequence+1},{...h.callback,identity:{}}])assert.throws(()=>S.assertLateCompletion({call:h.call,receipt:h.captured,result:h.result,source:h.source,held:h.held,callback}));h.callback.restore();
});
test('RC13 source selection rejects missing/duplicate matches and a foreign generation scope',()=>{
 for(const count of[0,2]){const w=S.sourceWindow(),identity={},p=deferred();w.arm({identity,current:()=>identity,matches:()=>true});for(let i=0;i<count;i++)w.observe({status:'returned',result:p.promise,args:[]});assert.throws(()=>w.close({identity,xhr:{},sequence:1,released:false}),/exactly one/);w.stop();p.resolve({});}
 const w=S.sourceWindow(),identity={},other={},p=deferred();let current=identity;w.arm({identity,current:()=>current,matches:()=>true});w.observe({status:'returned',result:p.promise,args:[]});current=other;assert.throws(()=>w.close({identity,xhr:{},sequence:1,released:false}),/old scope/);w.stop();p.resolve({});
});
test('RC14 foreign input scope cannot create a source receipt and foreign hold cannot close it',()=>{
 const w=S.sourceWindow(),identity={},other={},p=deferred();let current=other;w.arm({identity,current:()=>current,matches:()=>true});w.observe({status:'returned',result:p.promise,args:[]});assert.equal(w.rows.length,0);current=identity;w.observe({status:'returned',result:p.promise,args:[]});assert.throws(()=>w.close({identity:other,xhr:{},sequence:1,released:false}),/original scope/);w.stop();p.resolve({});
});
test('RC15 default source passthrough preserves receiver, exact args, Promise and throw',()=>{
 const receiver={},arg={},p=deferred(),error=Error('source original'),errors=[];
 assert.strictEqual(S.callWithReceipt(function(...args){assert.strictEqual(this,receiver);assert.strictEqual(args[0],arg);return p.promise;},receiver,[arg],undefined,errors),p.promise);
 assert.throws(()=>S.callWithReceipt(()=>{throw error;},receiver,[],undefined,errors),e=>e===error);assert.deepEqual(errors,[]);p.resolve({});
});
test('RC16 throwing source observer does not replace successful return or original error',()=>{
 const observerError=Error('observer'),nativeError=Error('native'),p=deferred(),errors=[],observe=()=>{throw observerError;};
 assert.strictEqual(S.callWithReceipt(()=>p.promise,{},[],observe,errors),p.promise);
 assert.throws(()=>S.callWithReceipt(()=>{throw nativeError;},{},[],observe,errors),e=>e===nativeError);assert.deepEqual(errors,[observerError,observerError]);p.resolve({});
});
test('RC17 App context observer error is separate from raw return/throw',()=>{
 const observerError=Error('context'),nativeError=Error('begin'),receipt={handle:{},result:Promise.resolve({status:'cancelled'})},target={begin(){return receipt;}};
 let o=S.observeMethod(target,'begin',()=>{throw observerError;});assert.strictEqual(target.begin(),receipt);assert.strictEqual(o.errors[0],observerError);o.restore();
 target.begin=()=>{throw nativeError;};o=S.observeMethod(target,'begin',()=>{throw observerError;});assert.throws(()=>target.begin(),e=>e===nativeError);assert.strictEqual(o.rows[0].error,nativeError);o.restore();
});
test('RC18 method restoration preserves a later legitimate hook and reports lost ownership',()=>{
 const original=function(){},target={begin:original},o=S.observeMethod(target,'begin',()=>({})),successor=function(){};target.begin=successor;
 assert.equal(o.restore(),false);assert.strictEqual(target.begin,successor);assert.match(String(o.errors[0]),/ownership-lost/);
});
test('RC19 method restore failure is recorded without throwing or overwriting result',()=>{
 const value={},target={begin(){return value;}},o=S.observeMethod(target,'begin',()=>({}));assert.strictEqual(target.begin(),value);
 Object.defineProperty(target,'begin',{configurable:false,writable:false});assert.equal(o.restore(),false);assert.equal(o.errors.length,1);assert.strictEqual(o.rows[0].result,value);
});
test('RC20 callback observer preserves actual native arguments/return and full descriptor',()=>{
 const arg={},value={},calls=[],target={onload:function(...args){calls.push({receiver:this,args});return value;},send(...args){return this.onload(...args);}},before=Object.getOwnPropertyDescriptor(target,'onload'),held={xhr:target,sequence:7,identity:{},released:false};
 const o=S.observeCallback(held);held.released=true;assert.strictEqual(target.send(arg,9),value);assert.strictEqual(calls[0].receiver,target);assert.strictEqual(calls[0].args[0],arg);assert.deepEqual(calls[0].args,[arg,9]);assert.equal(o.entered,1);assert.equal(o.returned,1);assert.equal(o.restore(),true);assert.deepEqual(Object.getOwnPropertyDescriptor(target,'onload'),before);
});
test('RC21 callback/observer errors retain original error identity and are distinct',()=>{
 const originalError=Error('onload'),observerError=Error('observer'),target={onload(){throw originalError;},send(){return this.onload();}},held={xhr:target,sequence:1,identity:{},released:false};
 const o=S.observeCallback(held,()=>{throw observerError;});held.released=true;assert.throws(()=>target.send(),e=>e===originalError);assert.strictEqual(o.calls[0].error,originalError);assert.equal(o.threw,1);assert.equal(o.returned,0);assert.deepEqual(o.errors,[observerError,observerError]);o.restore();
});
test('RC22 callback observer error cannot replace a normal native return',()=>{
 const value={},error=Error('observer'),target={onload(){return value;},send(){return this.onload();}},held={xhr:target,sequence:1,identity:{},released:false};
 const o=S.observeCallback(held,()=>{throw error;});held.released=true;assert.strictEqual(target.send(),value);assert.equal(o.returned,1);assert.deepEqual(o.errors,[error,error]);o.restore();
});
test('RC23 callback restoration keeps successor hooks and records restoration errors',()=>{
 const target={onload(){}},held={xhr:target,sequence:1,identity:{},released:false},o=S.observeCallback(held),successor=function(){};target.onload=successor;assert.equal(o.restore(),false);assert.strictEqual(target.onload,successor);
 const another={onload(){}},p=S.observeCallback({...held,xhr:another});Object.defineProperty(another,'onload',{configurable:false,writable:false});assert.equal(p.restore(),false);assert.equal(p.errors.length,1);
});
test('RC24 raw App result can finish while source/callback are still pending',async()=>{
 const h=await harness();h.appResult.resolve({status:'failed',reason:'stale'});await Promise.resolve();assert.equal(h.result.status,'fulfilled');assert.equal(h.source.settlement.status,'pending');assert.equal(h.callback.entered,0);assert.throws(h.gate,/source must settle/);await h.finish();h.gate();h.callback.restore();
});
test('RC25 callback that preceded release cannot satisfy late delivery even with a later release bool',async()=>{
 const h=await harness();await h.finish();const callback={...h.callback,calls:[{...h.callback.calls[0],afterRelease:false}]};
 assert.throws(()=>S.assertLateCompletion({call:h.call,receipt:h.captured,result:h.result,source:h.source,held:h.held,callback}),/cannot precede/);h.callback.restore();
});
test('RC26 original source rejection remains distinct from the fulfilled cancelled App result',async()=>{
 const h=await harness(),error=Error('original guarded source rejected');h.sourceResult.reject(error);await h.finish();
 assert.equal(h.source.settlement.status,'rejected');assert.strictEqual(h.source.settlement.error,error);assert.equal(h.result.status,'fulfilled');h.gate();h.callback.restore();
});
test('RC27 completed source/callback cannot excuse an original App Promise that remains pending',async()=>{
 const h=await harness(),resolve=h.appResult.resolve;h.appResult.resolve=()=>{};await h.finish();
 assert.equal(h.source.settlement.status,'fulfilled');assert.equal(h.callback.returned,1);assert.equal(h.result.status,'pending');assert.throws(h.gate,/must fulfill/);h.callback.restore();resolve({status:'cancelled',diagnostics:[]});await Promise.resolve();
});
