'use strict';
// NATIVE-MOVEMENT-DISTANCE / IMPLEMENTATION_GAP. Preserved original red assertion; outside finite E3 acceptance.
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./e3-parent-fixture.cjs');
test('Surf connection uses target-only production Surf native passage and preserves business mode for its single target step',async()=>{
 const h=await fixture({surf:true,editState:s=>{s.world.surfing=true;}});h.player._x=3;h.player._y=1;h.player._direction=6;const result=await h.run('connection');assert.equal(result.status,'awaiting-arrival');assert.equal(h.arrive().status,'arrived');const done=await h.finish();assert.equal(done.step.status,'completed');assert.equal(h.state.steps,1);assert.equal(h.state.stats.distance_surfed,1);assert.equal(h.state.world.surfing,true);assert.equal(h.arrivals.length,1);assert.equal(h.arrivals[0].mapId,2);assert.deepEqual(h.draws,[100]);
});
