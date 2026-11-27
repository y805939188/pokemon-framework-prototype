'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,flush}=require('./nontransfer-production-fixture.cjs');
const selected=process.env.PF_F_NATIVE_CASE;if(selected)assert(['NT-NOHOME','NT-MISSING','NT-DTO'].includes(selected),'explicit nontransfer selector');
for(const missingHome of [false,true].filter(value=>!selected||selected===(value?'NT-MISSING':'NT-NOHOME')))test('actual Flow static manager / connection poison / '+(missingHome?'missing-home':'no-home')+' preserves one inherited native closure',async()=>{
 const h=await fixture({missingHome}),{G,app}=h;
 const before=structuredClone(h.state()),vehicle=G.$gamePlayer._vehicleType,startingOver=G.$gameSwitches.value(1);
 const {result}=await h.run();assert.equal(result.status,'awaiting-arrival');
 await h.pump(()=>!app.saveBlocked&&h.captured.completions.length===1);
 assert.equal(h.captured.adoptions.length,1);assert.equal(h.captured.adoptions[0].result.status,'done');assert.equal(h.captured.completions[0].result.status,'done');
 assert.equal(h.saves.length,1);assert.equal(h.saves[0].blocked,false);assert.equal(h.state().steps,4);assert.equal(h.state().world.pendingReturn,null);assert.equal(h.state().stats.blacked_out_count,1);assert.equal(h.trace.filter(r=>r[0]==='native-reserve').length,1);assert.equal(h.trace.filter(r=>r[0]==='native-request-autosave').length,1);assert.equal(typeof G.SceneManager,'function');assert.equal(G.$gameMap.mapId(),6);assert.deepEqual(h.nativeDraws,[]);assert.deepEqual(h.draws,[]);
 const healedFields=party=>party.map(({id,hp,status,statusCount,moves})=>({id,hp,status,statusCount,moves:moves.map(({id,pp,maxpp})=>({id,pp,maxpp}))}));
 assert.deepEqual(healedFields(h.state().party),healedFields(before.party.map(member=>h.E.heal.healMember(member,h.content))),'nontransfer field branch fully heals HP/status/PP once');
 assert.equal(h.state().money,before.money,'field blackout never owns battle money');
 assert.deepEqual(h.state().world.escapePoint,missingHome?before.world.escapePoint:null,'missing-home returns early; no-home clears escape');
 assert.equal(G.$gameSwitches.value(1),startingOver,'nontransfer branches do not set starting-over');
 assert.equal(h.state().world.surfing,before.world.surfing);assert.deepEqual(h.state().world.companions,before.world.companions);
 assert.equal(G.$gamePlayer._vehicleType,vehicle,'nontransfer branches do not cancel vehicles');
 const {owner,nonce}=h.captured.completions[0];assert.equal(app.isBlackoutNonTransferComplete(owner,nonce),true);assert.equal(app.isBlackoutNonTransferComplete(owner,{}),false);assert.equal(app.isBlackoutNonTransferComplete({},nonce),false);
 for(let i=0;i<5;i++){h.tick();await flush();}assert.equal(h.saves.length,1);
});
if(!selected||selected==='NT-DTO')test('actual F checkpoint DTO ingress rejects Proxy/accessor without executing unknown code',async()=>{
 const h=await fixture(),before=structuredClone(h.state());let calls=0;
 const accessor=Object.defineProperty({},'phase',{enumerable:true,get(){calls++;throw Error('unknown getter');}});
 const proxy=new Proxy({},{ownKeys(){calls++;throw Error('unknown ownKeys');},get(){calls++;throw Error('unknown get');},getPrototypeOf(){calls++;throw Error('unknown prototype');}});
 for(const raw of [accessor,proxy]){
  await assert.rejects(h.ports.blackout.announce('show-return-message',raw,{}),/field-move-dto/);
  await assert.rejects(h.ports.blackout.prepare(raw,{}),/field-move-dto/);
 }
 assert.equal(calls,0);assert.deepEqual(h.state(),before);assert.equal(h.saves.length,0);assert.equal(h.app.saveBlocked,false);assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);
});
