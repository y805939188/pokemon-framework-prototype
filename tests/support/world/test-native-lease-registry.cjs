'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createNativeTravelLeaseRegistry,readNativeTravelLease}=require(process.env.PF_E3_PARENT_BUNDLE);
const current=()=>({lease:{},owner:{},receipt:{},player:{},serial:{},sourceScene:{},scene:{},phase:'reserved'});
test('opaque registered source has no public mutable cell; forged source cannot replay current',()=>{
 const r=createNativeTravelLeaseRegistry(),first=current();r.publish(first);const snapshot=readNativeTravelLease(r.source);
 assert.deepEqual(Reflect.ownKeys(r.source),[]);assert.equal(Object.isFrozen(r.source),true);assert.equal(Object.isFrozen(snapshot),true);assert.equal(Object.isFrozen(snapshot.current),true);assert.equal(snapshot.current.receipt,first.receipt);
 assert.equal(readNativeTravelLease({}),undefined);assert.equal(readNativeTravelLease({...r.source}),undefined);assert.equal(readNativeTravelLease({owner:r.source,key:'current',current:snapshot.current}),undefined);
 r.publish(null);assert.equal(readNativeTravelLease(r.source).current,null);assert.throws(()=>{r.source.current=snapshot.current;},TypeError);assert.equal(readNativeTravelLease(r.source).current,null);
});
test('known pure reader never executes own getters or hooks on arbitrary source',()=>{
 let calls=0;const forged={};for(const key of ['registry','current','owner','key'])Object.defineProperty(forged,key,{get(){calls++;throw Error('must not execute');}});assert.equal(readNativeTravelLease(forged),undefined);assert.equal(calls,0);
});
test('private current replacement and separate registered source preserve exact record identities',()=>{
 const a=createNativeTravelLeaseRegistry(),b=createNativeTravelLeaseRegistry(),first=current(),second=current();a.publish(first);b.publish(second);const old=readNativeTravelLease(a.source);a.publish({...first,serial:{},phase:'performing'});assert.notEqual(readNativeTravelLease(a.source),old);assert.notEqual(readNativeTravelLease(a.source).current.serial,old.current.serial);assert.equal(readNativeTravelLease(b.source).current.serial,second.serial);assert.equal(readNativeTravelLease(a.source).registry,a.source);
});
