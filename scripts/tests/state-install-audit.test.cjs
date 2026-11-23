'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{types}=require('node:util');
const {observeStateInstalls}=require('../../src/plugins/flowtest/state-install-audit.ts');
function fixture(replace){const system={_psGame:{id:'before'}},root={$gameSystem:system},reflection={defineProperty:Reflect.defineProperty},port={replace:replace??function(next){system._psGame=next;return 19;}};return{system,root,reflection,port,application:{battleStatePort:port}};}
function observe(h){const records=[];return{records,audit:observeStateInstalls(h.root,h.application,h.system,h.reflection,types.isProxy,state=>records.push(state))};}
test('plain data, real replace result/receiver and one actual write survive the observer',()=>{const h=fixture(),d=Object.getOwnPropertyDescriptor(h.system,'_psGame'),o=observe(h),next={id:'next'};assert.equal(h.port.replace(next),19);assert.deepEqual(o.records,[next]);assert.equal(Object.getOwnPropertyDescriptor(h.system,'_psGame').get,undefined);assert.equal(Object.getOwnPropertyDescriptor(h.system,'_psGame').writable,d.writable);o.audit.dispose();assert.deepEqual(o.audit.errors,[]);});
test('a failed non-install preserves its original throw and records no install',()=>{const error=Error('original'),h=fixture(()=>{throw error;}),o=observe(h);assert.throws(()=>h.port.replace({}),e=>e===error);assert.deepEqual(o.records,[]);o.audit.dispose();});
test('exact atomic slot is counted, foreign target/key are ignored, a nested replace is not double counted',()=>{let h;h=fixture(function(next){return h.reflection.defineProperty(h.system,'_psGame',{value:next,writable:true,configurable:true});});const o=observe(h),next={id:'next'};assert.equal(h.port.replace(next),true);assert.deepEqual(o.records,[next]);h.reflection.defineProperty({},'_psGame',{value:{}});h.reflection.defineProperty(h.system,'other',{value:{}});assert.equal(o.records.length,1);o.audit.dispose();});
test('actual repeated install boundary is visible; arbitrary same-reference assignment is outside this audit',()=>{const h=fixture(),o=observe(h),next={};h.port.replace(next);h.port.replace(next);assert.equal(o.records.length,2);h.system._psGame=h.system._psGame;assert.equal(o.records.length,2);o.audit.dispose();});
test('accessor input is rejected before getter or any business call',()=>{const h=fixture();let calls=0;Object.defineProperty(h.system,'_psGame',{get(){calls++;throw Error('getter');},configurable:true});assert.throws(()=>observe(h),/own-data/);assert.equal(calls,0);});
test('cleanup does not overwrite successor hooks and deactivates only its own record callback',()=>{const h=fixture(),original=h.reflection.defineProperty,o=observe(h),ours=h.reflection.defineProperty,successor=function(...args){return Reflect.apply(ours,this,args);};h.reflection.defineProperty=successor;o.audit.dispose();assert.equal(h.reflection.defineProperty,successor);assert.notEqual(successor,original);h.reflection.defineProperty(h.system,'_psGame',{value:{},writable:true,configurable:true});assert.equal(o.records.length,0);});
test('actual general state replacement is observed in addition to the battle boundary',()=>{const h=fixture(),state={replace(next){h.system._psGame=next;return 23;}};h.application.ports={state};const o=observe(h),next={id:'general'};assert.equal(state.replace(next),23);assert.deepEqual(o.records,[next]);o.audit.dispose();});
test('second-port accessor rejects before getters or any partial hook install',()=>{
 const h=fixture(),battle=h.port.replace,general={},reflection=h.reflection.defineProperty;let getters=0;
 Object.defineProperty(general,'replace',{configurable:true,get(){getters++;throw Error('getter');}});h.application.ports={state:general};
 assert.throws(()=>observe(h),/state-audit-own-data-required:replace/);assert.equal(getters,0);assert.equal(h.port.replace,battle);assert.equal(h.reflection.defineProperty,reflection);
});
test('a second noninstallable descriptor rejects before changing the first port',()=>{
 const h=fixture(),battle=h.port.replace,general=Object.freeze({replace(){}});h.application.ports={state:general};
 assert.throws(()=>observe(h),/state-audit-hook-not-installable/);assert.equal(h.port.replace,battle);
});
for(const fault of ['second-before','second-after','reflection-after','successor'])test('installation rollback preserves native calls and later hook ownership: '+fault,()=>{
 const h=fixture(),original=h.port.replace,general={replace(next){h.system._psGame=next;return 23;}},generalOriginal=general.replace,reflection=h.reflection.defineProperty;
 h.application.ports={state:general};const records=[],expected=Error('actual install failure'),native=Object.defineProperty;let injected=false,successor;
 const hook=function(owner,key,descriptor){
  const target=fault==='reflection-after'?h.reflection:general,name=fault==='reflection-after'?'defineProperty':'replace';
  if(!injected&&owner===target&&key===name){injected=true;
   if(fault==='successor'){const prior=h.port.replace;successor=function(...args){return Reflect.apply(prior,this,args);};native(h.port,'replace',{value:successor,writable:true,configurable:true,enumerable:true});}
   if(fault==='second-after'||fault==='reflection-after')Reflect.apply(native,this,[owner,key,descriptor]);
   throw expected;
  }return Reflect.apply(native,this,[owner,key,descriptor]);
 };
 Object.defineProperty=hook;
 try{assert.throws(()=>observeStateInstalls(h.root,h.application,h.system,h.reflection,types.isProxy,state=>records.push(state)),error=>error===expected);}
 finally{if(Object.defineProperty===hook)Object.defineProperty=native;}
 assert(injected);assert.equal(h.port.replace,successor??original);assert.equal(general.replace,generalOriginal);assert.equal(h.reflection.defineProperty,reflection);
 const next={id:'after-rejection'};assert.equal(h.port.replace(next),19);assert.equal(h.system._psGame,next);assert.deepEqual(records,[],'rejected observer is inactive even inside a later successor wrapper');
});
