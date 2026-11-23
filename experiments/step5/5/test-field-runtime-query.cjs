'use strict';
require('./regular-field-action-test-runtime.cjs').prepare('parent');
const {test}=require('node:test'),assert=require('node:assert/strict');const {fixture}=require('./field-move-real-parent-fixtures.cjs');
test('public Surf runtime projects the actual start/landing/cleanup prefixes and carries no write authority',async()=>{
 const h=fixture({moveId:'surf'});assert.deepEqual(h.app.worldFieldRuntime(),{surfBase:null,endingSurf:false});assert.equal((await h.run()).status,'completed');
 const snapshot=h.app.worldFieldRuntime();assert.equal(snapshot.surfBase.mapId,7);snapshot.surfBase.x=999;snapshot.endingSurf=true;assert.equal(h.app.worldFieldRuntime().endingSurf,false);assert.notEqual(h.app.worldFieldRuntime().surfBase.x,999);
 h.native.ports.terrain=()=>({status:'value',value:{canSurf:false,waterfall:false,waterfallCrest:false}});assert.equal((await h.run({kind:'surf-land'},'land')).status,'completed');assert.equal(h.app.worldFieldRuntime().endingSurf,true);assert.equal(h.state.world.surfing,true);
 assert.equal((await h.run({kind:'surf-cleanup'},'cleanup')).status,'completed');assert.deepEqual(h.app.worldFieldRuntime(),{surfBase:null,endingSurf:false});assert.equal(h.state.world.surfing,false);assert.equal(h.state.steps,0);assert.deepEqual(h.draws,[]);
});
