'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {fixture, clone, location} = require('./e3-parent-fixture.cjs');
let random;
test.before(()=>{random=Math.random;Math.random=()=>assert.fail('unregistered RNG');});
test.after(()=>{Math.random=random;});
test('real App cancel retires own native reserve before late perform without moving player',async()=>{
 const h=await fixture();await h.run();assert.equal(h.app.cancelWorldTravel('travel').status,'cancelled');
 assert.equal(h.player.isTransferring(),false);h.player.performTransfer();assert.equal(h.map._mapId,1);assert.equal(h.player._x,0);assert.deepEqual(h.draws,[]);assert.equal(h.app.saveBlocked,false);
});
test('new generation retires old own reserve and late perform stays on current source',async()=>{
 const h=await fixture();await h.run();h.app.stateReplacedByHost();const before=clone(h.state);h.player.performTransfer();assert.equal(h.map._mapId,1);assert.equal(h.player.isTransferring(),false);assert.deepEqual(h.state,before);assert.deepEqual(h.draws,[]);
});
for(const target of [location(),location(3,2,1,2)])test('same/different target raw native201 survives cancelled owned receipt '+target.mapId,async()=>{
 const h=await fixture();await h.run();h.player.reserveTransfer(target.mapId,target.x,target.y,target.direction,0);assert.equal(h.app.cancelWorldTravel('travel').status,'cancelled');assert.equal(h.player.isTransferring(),true);h.player.performTransfer();assert.equal(h.map._mapId,target.mapId);assert.equal(h.player._x,target.x);assert.equal(h.player._y,target.y);assert.deepEqual(h.draws,[]);assert.equal(h.app.saveBlocked,false);
});
test('old receipt cannot clear newly issued same-target App successor',async()=>{
 const h=await fixture();await h.run();const owner=h.owner,receipt=h.receipt;h.app.cancelWorldTravel('travel');const next=await h.run('fly','next');assert.equal(next.status,'awaiting-arrival');assert.notEqual(h.receipt,receipt);assert.equal(h.native.transfer.retireTransfer(owner,receipt).status,'done');assert.equal(h.player.isTransferring(),true);h.arrive();assert.equal((await h.finish()).status,'completed');assert.deepEqual(h.draws,[100]);
});
test('clone or wrong-owner receipt cannot acquire retirement rights over live pending',async()=>{
 const h=await fixture();await h.run();assert.equal(h.native.transfer.retireTransfer(h.owner,{...h.receipt}).status,'done');assert.equal(h.native.transfer.retireTransfer({},h.receipt).status,'done');assert.equal(h.player.isTransferring(),true);h.arrive();assert.equal((await h.finish()).status,'completed');assert.deepEqual(h.draws,[100]);
});
test('isTransferring provider reentry raw201 supersedes private lease before own native movement',async()=>{
 const h=await fixture();await h.run();const native=h.player.isTransferring;let once=true;h.player.isTransferring=function(){if(once){once=false;this.reserveTransfer(3,2,1,2,0);}return native.call(this);};h.player.performTransfer();assert.equal(h.map._mapId,3);assert.equal(h.player._x,2);assert.deepEqual(h.draws,[]);assert.equal(h.app.saveBlocked,false);
});
test('raw201 reserved during native refresh survives old native clear and App failure',async()=>{
 const h=await fixture();await h.run();const refresh=h.player.refresh;let once=true;h.player.refresh=function(){refresh.call(this);if(once){once=false;this.reserveTransfer(3,2,1,2,0);}};h.player.performTransfer();assert.equal(h.map._mapId,2);assert.equal(h.player.isTransferring(),true);assert.equal(h.player._newMapId,3);assert.equal(h.app.saveBlocked,false);h.player.performTransfer();assert.equal(h.map._mapId,3);assert.deepEqual(h.draws,[]);
});
test('unknown native slot conflict refuses cleanup and keeps formal save gate until explicit recovery',async()=>{
 const h=await fixture();await h.run();const descriptor=Object.getOwnPropertyDescriptor(h.player,'_newMapId');Object.defineProperty(h.player,'_newMapId',{...descriptor,value:3});const result=h.app.cancelWorldTravel('travel');assert.equal(result.status,'failed');assert.match(result.reason,/retirement/);assert.equal(h.app.saveBlocked,true);assert.equal(h.player.isTransferring(),true);Object.defineProperty(h.player,'_newMapId',descriptor);assert.equal(h.app.cancelWorldTravel('travel').status,'failed');assert.equal(h.player.isTransferring(),false);assert.equal(h.app.saveBlocked,false);
});
test('native isTransferring same-owner reentry cannot duplicate arrival or weather draw',async()=>{
 const h=await fixture();await h.run();const native=h.player.isTransferring;let once=true;h.player.isTransferring=function(){if(once){once=false;this.performTransfer();}return native.call(this);};assert.equal(h.arrive().status,'arrived');assert.equal((await h.finish()).status,'completed');assert.deepEqual(h.draws,[100]);
});
