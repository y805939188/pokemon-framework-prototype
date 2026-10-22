'use strict';const test=require('node:test'),assert=require('node:assert/strict');const {propose,project}=require('./probes/held-contract-model.cjs');
const event=(id,previous,current,reason,eventId='e1')=>({id,previous,current,reason,eventId});
test('P51-13/proposal: consumption, temporary Knock Off and wild acquisition have different restoration semantics',()=>{
 const consumed=propose({A:'sitrusberry'},[event('A','sitrusberry','','consumed')]);assert.equal(consumed.restore.A,'');
 const knock=propose({A:'leftovers'},[event('A','leftovers','','knocked-off')]);assert.equal(knock.current.A,'');assert.equal(knock.restore.A,'leftovers');
 const stolen=propose({A:''},[event('A','','leftovers','wild-acquired')],{wild:true});assert.equal(stolen.restore.A,'leftovers');assert.throws(()=>propose({A:''},[event('A','','leftovers','wild-acquired')]),/not-wild/);
});
test('P51-13/proposal: stable IDs survive reordered party; newly boxed members use current item and remove restoration eligibility',()=>{
 const p=propose({A:'leftovers',B:'sitrusberry'},[event('A','leftovers','','knocked-off'),event('B','sitrusberry','','consumed','e2')]);assert.deepEqual(project(p,[{id:'B',to:'party'},{id:'A',to:'box'}]).writes,{B:'',A:''});assert.deepEqual(project(p,[{id:'A',to:'party'}]).writes,{A:'leftovers'});assert.deepEqual(project(p,[],true),{status:'duplicate'});
});
test('P51-13/proposal: unknown reason, stale or duplicate event and unresolved Trick permanence all fail closed, originals unchanged',()=>{
 const initial={A:'leftovers'},before=JSON.stringify(initial);for(const events of [[event('A','leftovers','','unknown')],[event('A','wrong','','consumed')],[event('A','leftovers','','knocked-off'),event('A','','','consumed')],[event('A','leftovers','sitrusberry','transferred')]])assert.throws(()=>propose(initial,events));assert.equal(JSON.stringify(initial),before);
});
