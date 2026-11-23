'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,record}=require('./retry-fixture.cjs');
assert.equal(process.env.PF_G_RETRY_CASE,'GN09');
test('GN09 actual formal-loaded stable F failure permits saving, refuses new business and recovers',async()=>{
 const h=await fixture();await h.formalLoad();
 await h.pump(()=>h.G.PSFlow.blackoutLoadRecoveryView().phase==='stable-failed');
 assert(h.state().world.pendingReturn);assert.equal(h.app.saveBlocked,false);
 const before=structuredClone(h.state()),draws=h.draws.slice(),nativeDraws=h.nativeDraws.slice();
 const generation=h.app.stateGeneration,recover=h.observed.recover;
 await assert.rejects(h.app.startBattle({battleId:'GN09-denied',kind:'wild',seq:1,foes:[{species:'Pidgey',level:5}]}),/blackout-return-pending/);
 assert.equal(h.app.claimGrant('starter').status,'refused');
 assert.equal(h.app.receiveGift({kind:'silent',member:{species:'Pidgey',level:3}}).status,'refused');
 assert.equal(h.app.healParty().status,'refused');assert.equal(h.app.recordSteps().status,'refused');
 assert.throws(()=>h.app.beginManagement(),/blackout-return-pending/);
 assert.throws(()=>h.app.beginInventoryOperation(),/blackout-return-pending/);
 for(const intent of [{kind:'register',eventId:1},{kind:'remove',removal:{kind:'all'}}]){
  assert.deepEqual(await h.app.beginEventCompanion(intent).result,{status:'failed',reason:'blackout-return-pending'});
 }
 assert.deepEqual(await h.app.advanceEventCompanions(),{status:'failed',reason:'blackout-return-pending'});
 assert.equal(h.app.saveBlocked,false);assert.equal(h.app.stateGeneration,generation);
 assert.equal(h.observed.recover,recover);assert.deepEqual(h.state(),before);
 assert.deepEqual(h.draws,draws);assert.deepEqual(h.nativeDraws,nativeDraws);
 assert.doesNotThrow(()=>h.G.DataManager.makeSaveContents(),'stable failure remains eligible for the formal snapshot path');
 h.flags.fail=false;const command=h.command('RetryBlackoutReturn');
 const result=await h.finish(command);assert(['awaiting-arrival','arrived','completed'].includes(result.status));
 await h.pump(()=>h.G.$gameMap.mapId()===7&&h.state().world.pendingReturn===null&&!h.app.saveBlocked);
 const token=h.app.beginManagement();assert.equal(h.app.endManagement(token).status,'unchanged');
 assert.equal(h.observed.recover,recover+1);assert.deepEqual(h.draws,draws);assert.deepEqual(h.nativeDraws,nativeDraws);
 record('GN09',h,{stableFailedState:before,newBusinessRefused:true,formalSnapshotAllowed:true,retry:result});
});
