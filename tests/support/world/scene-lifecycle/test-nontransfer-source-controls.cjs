'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./nontransfer-production-fixture.cjs');
test('actual foreign samepoint reserve-clear ABA rejects old NoTransfer source and preserves successor201',async()=>{
 const h=await fixture({beforeCompletion(h){const p=h.G.$gamePlayer;p.reserveTransfer(6,p.x,p.y,p.direction(),0);p.clearTransferInfo();p.reserveTransfer(7,1,1,8,0);}});
 await h.run();await h.pump(()=>h.captured.completions.length===1);
 const {G,app}=h,{owner,nonce,result}=h.captured.completions[0];assert.equal(result.status,'failed');assert.match(result.reason,/epoch|changed|stale/);
 assert.equal(app.isBlackoutNonTransferComplete(owner,nonce),true,'core nonce alone cannot bless a changed native source');assert.equal(h.saves.length,0);assert.equal(h.trace.filter(r=>r[0]==='native-request-autosave').length,0);assert.equal(G.$gamePlayer.isTransferring(),true);assert.equal(G.$gamePlayer._newMapId,7);assert.equal(G.$gamePlayer._newDirection,8);
 const before={map:G.$gamePlayer._newMapId,x:G.$gamePlayer._newX,y:G.$gamePlayer._newY,d:G.$gamePlayer._newDirection};assert.equal(h.nativeBlackout.nonTransferCompleted(owner,nonce).status,'failed');assert.deepEqual({map:G.$gamePlayer._newMapId,x:G.$gamePlayer._newX,y:G.$gamePlayer._newY,d:G.$gamePlayer._newDirection},before);assert.equal(h.saves.length,0);assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);
});
test('actual new generation and late original nonce cannot consume old closure or clear a new201',async()=>{
 const h=await fixture({beforeCompletion(h){h.app.stateReplacedByHost();h.G.$gamePlayer.reserveTransfer(7,2,1,4,0);}});
 await h.run();await h.pump(()=>h.captured.completions.length===1);
 const {G,app}=h,{owner,nonce,result}=h.captured.completions[0];assert.equal(result.status,'failed');assert.match(result.reason,/unissued|stale|changed/);assert.equal(app.isBlackoutNonTransferComplete(owner,nonce),false);assert.equal(app.isBlackoutNonTransferComplete(owner,{}),false);assert.equal(h.saves.length,0);assert.equal(h.trace.filter(r=>r[0]==='native-request-autosave').length,0);
 assert.equal(G.$gamePlayer.isTransferring(),true);assert.equal(G.$gamePlayer._newMapId,7);assert.equal(G.$gamePlayer._newX,2);assert.equal(G.$gamePlayer._newDirection,4);assert.equal(h.nativeBlackout.nonTransferCompleted(owner,nonce).status,'failed');assert.equal(G.$gamePlayer.isTransferring(),true);assert.equal(G.$gamePlayer._newMapId,7);assert.equal(G.$gamePlayer._newX,2);assert.equal(G.$gamePlayer._newDirection,4);assert.equal(h.saves.length,0);assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);
});
