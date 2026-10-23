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
const {createFakeReceiver}=require('./probes/held-contract-model.cjs');
for(const to of ['party','box'])test(`J10/fake: new captured stable ID sent to ${to} has explicit current and correct restoration eligibility`,()=>{
 const receiver=createFakeReceiver(),result={battleId:'capture',initial:{A:'leftovers'},events:[event('A','leftovers','','knocked-off')],captured:[{id:'NEW',current:'sitrusberry'}],placements:[{id:'NEW',to},{id:'A',to:'party'}],bag:{masterball:-1}};let installed;const out=receiver.apply(result,p=>installed=p);assert.deepEqual(installed.writes,{NEW:'sitrusberry',A:'leftovers'});assert.deepEqual(out.restoreEligible,to==='party'?['A','NEW']:['A']);assert.deepEqual(installed.bag,{masterball:-1});
});
test('J10/fake: full party replacement removes old ID eligibility and registers new ID, never restores by replaced slot',()=>{
 const receiver=createFakeReceiver(),initial={A:'leftovers',B:'sitrusberry',C:'',D:'',E:'',F:''},result={battleId:'replace',initial,events:[event('A','leftovers','','knocked-off'),event('B','sitrusberry','','consumed','e2')],captured:[{id:'NEW',current:'ironball'}],placements:[{id:'NEW',to:'party'},...['F','E','D','C','B'].map(id=>({id,to:'party'})),{id:'A',to:'box'}]};const out=receiver.apply(result,()=>{});assert.equal(out.writes.A,'');assert.equal(out.writes.NEW,'ironball');assert.equal(out.writes.B,'');assert.deepEqual(out.restoreEligible,['B','C','D','E','F','NEW']);
});
test('J10/fake: failed atomic installation has no receipt, original result retries once; duplicate/conflict never installs',()=>{
 const receiver=createFakeReceiver(),result={battleId:'retry',initial:{A:'sitrusberry'},events:[event('A','sitrusberry','','consumed')],placements:[{id:'A',to:'party'}],bag:{potion:-1}},before=JSON.stringify(result);let installs=0,state={writes:{A:'sitrusberry'},bag:{potion:1}};
 assert.throws(()=>receiver.apply(result,()=>{throw Error('disk failed before atomic replace')}),/disk failed/);assert.equal(receiver.receiptCount,0);assert.equal(state.writes.A,'sitrusberry');assert.equal(receiver.apply(result,p=>{installs++;state=p}).status,'applied');assert.equal(state.writes.A,'');assert.equal(receiver.apply(result,()=>installs++).status,'duplicate');assert.equal(installs,1);assert.throws(()=>receiver.apply({...result,bag:{}},()=>installs++),/result-conflict/);assert.equal(installs,1);assert.equal(JSON.stringify(result),before);
});
test('J10/fake: missing terminal item, reused capture identity and duplicate/missing/unknown placements reject before install',()=>{
 const base={battleId:'bad',initial:{A:'leftovers'},events:[],captured:[{id:'NEW',current:''}],placements:[{id:'A',to:'party'},{id:'NEW',to:'box'}]};
 for(const change of [r=>delete r.captured[0].current,r=>r.captured[0].id='A',r=>r.placements[1].id='A',r=>r.placements.pop(),r=>r.placements[1].id='UNKNOWN',r=>r.placements[1].to='overflow']){const r=structuredClone(base);change(r);const receiver=createFakeReceiver();let installed=0;assert.throws(()=>receiver.apply(r,()=>installed++));assert.equal(installed,0);assert.equal(receiver.receiptCount,0)}
});
