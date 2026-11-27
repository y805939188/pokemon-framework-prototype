'use strict';
require('../regular-field-action-test-runtime.cjs').prepare('fishing-host');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {completedFishingPresentationFailure:check}=require(path.join(process.env.PF_FISHING_HOST_OUT,'plugins/world/fishing-messages.js'));
function valid(){return{status:'failed',reason:'host-failed',fishing:{status:'failed',reason:'host-failed',cleanup:'completed',prefix:{countCommitted:true,battlesCommitted:false},completion:{status:'interrupted',caught:false,encounterType:'OldRod',cleanupFailed:false,reason:'host-failed'}}};}
test('POSE09 completed failure formatter accepts exact closed prefix and rejects cleanup/admission/foreign result',()=>{
 assert.equal(check(valid()),true);
 for(const edit of [o=>o.fishing.cleanup='failed',o=>o.fishing.completion.cleanupFailed=true,o=>o.fishing.prefix.battlesCommitted=true,o=>o.fishing.prefix.countCommitted=false,o=>o.fishing.completion.caught=true,o=>o.fishing.encounter={},o=>o.admission={},o=>delete o.fishing,o=>o.reason='source-changed',o=>o.status='refused',o=>o.fishing.completion.encounterType={}]){const o=valid();edit(o);assert.equal(check(o),false);}
});
test('POSE09 malformed getter and hook values reject without invoking them; legal plain positive remains',()=>{
 let calls=0;for(const key of ['fishing','admission']){const o=valid();Object.defineProperty(o,key,{get(){calls++;throw Error('getter');}});assert.equal(check(o),false);}const o=valid();o.fishing.completion.encounterType={toString(){calls++;throw Error('hook');}};assert.equal(check(o),false);assert.equal(calls,0);assert.equal(check(valid()),true);
});
