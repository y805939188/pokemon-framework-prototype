"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,flush}=require('./c1-production-fixture.cjs');
assert.equal(process.env.PF_F_NATIVE_CASE,'C1-ABA');assert.deepEqual(process.argv.slice(2),[]);
const intent=p=>({pending:p._transferring,map:p._newMapId,x:p._newX,y:p._newY,direction:p._newDirection});
test('combined genuine C1 No plus source ABA rejects cap and actual old end fallback without clearing new201',async()=>{
 let newIntent;const h=await fixture({repel:1,before(name,args,h){if(name==='nonTransferCompleted'){const p=h.player;p.reserveTransfer(6,p.x,p.y,p.direction(),0);p.clearTransferInfo();p.reserveTransfer(7,2,1,8,0);newIntent=intent(p);}}}),G=h.G;
 await h.run();await h.pump(()=>G.PSInventory.current()?.view?.kind==='menu');const old=h.lifecycle().travelLease.current.scene;
 h.choose('no');await h.pump(()=>h.phases.some(x=>x.name==='nonTransferCompleted'));const c=h.phases.find(x=>x.name==='nonTransferCompleted'),returned=G.SceneManager._scene;
 assert.notStrictEqual(old,returned);assert.equal(returned._transfer,false);assert.equal(returned._started,true);assert.equal(c.result.status,'failed');assert.equal(h.counts().original,0);assert.equal(h.counts().executions,0);
 Reflect.apply(old.onTransferEnd,old,[]);await flush();assert.deepEqual(intent(h.player),newIntent);assert.equal(h.counts().original,0);assert.equal(h.counts().executions,0);assert.equal(h.nativeBlackout.nonTransferCompleted(...c.args).status,'failed');assert.equal(h.state().steps,4);assert.equal(h.state().stats.blacked_out_count,1);assert.equal(h.replies(),1);assert.deepEqual(h.rng().increment,[]);assert.deepEqual(h.rng().nativeIncrement,[]);
 fs.writeFileSync(path.join(process.env.PF_F_NATIVE_ROOT,'combined-c1-aba-oldscene.json'),JSON.stringify({fixed:'current parent-bound source',counts:h.counts(),sourceResult:c.result,returnedIsNew:true,new201Before:newIntent,new201After:intent(h.player),rng:h.rng(),steps:h.state().steps,repel:h.state().world.repelSteps,blocked:h.app.saveBlocked,checkpoint:h.state().world.pendingReturn,oldEndCount:h.transferEnds.filter(x=>x.scene===old&&x.phase==='completed').length,newEndCount:h.transferEnds.filter(x=>x.scene===returned&&x.phase==='completed').length,disk:'NOT_RUN'},null,2)+'\n',{flag:'wx'});
});
