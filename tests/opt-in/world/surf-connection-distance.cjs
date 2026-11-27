'use strict';
// Opt-in diagnostic: also requires the application to account for the Surf distance at the map boundary.
const test=require('node:test'),assert=require('node:assert/strict');
let prepared = false;
const runtime = require('../../../scripts/tests/final-production-runtime.cjs');
test.before(async () => {
  assert.ok(process.env.PF_HEADLESS_REGRESSION_BINDING, 'A current same-checkout regular binding with its cold outputs is required');
  assert.ok(!process.env.PF_FINAL_PRODUCTION_FAMILY || process.env.PF_FINAL_PRODUCTION_FAMILY === 'e3-travel-diagnostic', 'incompatible runtime family');
  process.env.PF_FINAL_PRODUCTION_FAMILY = 'e3-travel-diagnostic';
  assert.equal(process.env.PF_E3_CASE_ROOT, undefined, 'do not reuse a previous case directory');
  assert.equal(process.env.PF_E3_MAPSOURCE_RESULTS, undefined, 'do not reuse previous observations');
  process.env.PF_E3_CASE_ROOT = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'surf-connection-distance-'));
  console.log('Native diagnostic output:', process.env.PF_E3_CASE_ROOT);
  await runtime.prepare(); prepared = true;
});
test.after(() => { if (prepared) runtime.verify(); });
test('Surf connection uses target-only production Surf native passage and preserves business mode for its single target step',async()=>{
 const {fixture}=require('../../support/world/travel-parent-fixture.cjs');
 const h=await fixture({surf:true,editState:s=>{s.world.surfing=true;}});h.player._x=3;h.player._y=1;h.player._direction=6;const result=await h.run('connection');assert.equal(result.status,'awaiting-arrival');assert.equal(h.arrive().status,'arrived');const done=await h.finish();assert.equal(done.step.status,'completed');assert.equal(h.state.steps,1);assert.equal(h.state.stats.distance_surfed,1);assert.equal(h.state.world.surfing,true);assert.equal(h.arrivals.length,1);assert.equal(h.arrivals[0].mapId,2);assert.deepEqual(h.draws,[100]);
});
