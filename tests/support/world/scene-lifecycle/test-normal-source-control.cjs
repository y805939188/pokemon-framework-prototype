'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {fixture}=require('./normal-production-fixture.cjs');
test('actual new201 before target autosave invalidates the old F grant and preserves successor',async()=>{
 let injected=0;const h=await fixture({home:true,beforeTargetRequest(h){injected++;h.G.$gamePlayer.reserveTransfer(5,3,3,6,0);}});
 await h.run();await h.pump(()=>injected===1);const {G,app,rendering:r}=h;
 assert.equal(h.state().world.pendingReturn,null);assert.equal(app.saveBlocked,false);assert.equal(h.state().world.companions.length,0);assert.equal(h.state().stats.blacked_out_count,1);assert.equal(r.clear.length,1);assert.equal(r.clear[0].result.status,'cleared');assert.equal(r.raw.length,2);assert.equal(r.original.length,0);assert.equal(h.saves.length,0);assert.equal(G.$gamePlayer.isTransferring(),true);assert.equal(G.$gamePlayer._newMapId,5);assert.equal(G.$gamePlayer._newX,3);assert.equal(G.$gamePlayer._newY,3);assert.equal(G.$gamePlayer._newDirection,6);assert.equal(h.trace.filter(row=>row[0]==='native-reserve').length,3);assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);
});
