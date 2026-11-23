'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,clone,location,flush}=require('./e3-parent-fixture.cjs');
let random;test.before(()=>{random=Math.random;Math.random=()=>assert.fail('unregistered RNG');});test.after(()=>{Math.random=random;});
test('actual GameApplication + native transfer host reserves only; authentic arrival installs B once before retirement',async()=>{
 const h=await fixture();const sourceMap=h.root.$dataMap,source=clone(h.state);const run=await h.run();
 assert.equal(run.status,'awaiting-arrival');assert.equal(h.app.saveBlocked,true);assert.equal(h.map._mapId,1);assert.equal(h.root.$dataMap,sourceMap);assert.equal(h.state.stats.fly_count,1);assert.equal(source.stats.fly_count,0);assert.deepEqual(h.draws,[]);
 assert.equal(h.arrive().status,'arrived');assert.equal(h.state.world.weather.type,'Rain');assert.deepEqual(h.state.world.healingSpot,{mapId:2,x:2,y:1});assert.equal(h.app.saveBlocked,true);assert.deepEqual(h.draws,[100]);assert.equal(h.state.world.escapePoint.mapId,3);
 assert.equal(h.app.observeWorldMapEntry({id:'mz-native-entry',cause:'transfer',previousMapId:1,mapId:2,rebuilt:true}).status,'duplicate');assert.deepEqual(h.draws,[100]);
 const result=await h.finish();assert.equal(result.status,'completed');assert.equal(h.app.saveBlocked,false);assert.equal(h.state.world.escapePoint,null);assert.equal(h.state.stats.fly_count,1);assert.deepEqual(h.effects,['fly-animation','map-bgm','refresh','fly-callback','wait:250']);assert.deepEqual(h.legacyWrites,[]);
 h.player.performTransfer();assert.deepEqual(h.draws,[100]);assert.equal((await h.finish()).status,'completed');
});
test('Fly async callback then actual 250ms wait retains save gate; one deferred request consumed after final install',async()=>{
 let finish;const h=await fixture({wait(ms){assert.equal(ms,250);return new Promise(resolve=>{finish=resolve;});}});await h.run();h.arrive();assert.equal(h.app.deferWorldTravelSave(),true);assert.equal(h.app.deferWorldTravelSave(),true);
 const tail=h.finish();await flush();assert.equal(h.app.saveBlocked,true);assert.ok(h.state.world.escapePoint);assert.deepEqual(h.saves,[]);finish({status:'done'});assert.equal((await tail).status,'completed');assert.equal(h.app.saveBlocked,false);assert.equal(h.state.world.escapePoint,null);assert.deepEqual(h.saves,['resume']);await h.finish();assert.deepEqual(h.saves,['resume']);
});
for(const move of ['dig','teleport'])test('actual '+move+' asks confirmation; cancelled prompt has no prefix or reserve',async()=>{
 const h=await fixture({move,confirm:()=> 'cancelled'}),before=clone(h.state);assert.equal((await h.run(move)).status,'cancelled');assert.deepEqual(h.state,before);assert.equal(h.player.isTransferring(),false);assert.equal(h.app.saveBlocked,false);assert.deepEqual(h.effects,['confirm:'+move]);
});
for(const move of ['dig','teleport'])test('actual '+move+' commits only tail after genuine arrival and clears escape',async()=>{
 const h=await fixture({move});assert.equal((await h.run(move)).status,'awaiting-arrival');assert.equal(h.state.stats.fly_count,0);assert.ok(h.state.world.escapePoint);assert.equal(h.arrive().status,'arrived');assert.equal((await h.finish()).status,'completed');assert.equal(h.state.world.escapePoint,null);assert.equal(h.app.saveBlocked,false);
});
test('same-map explicit transfer preserves B local state, no entry reroll, and requires native perform proof',async()=>{
 const h=await fixture();h.app.world.local.strengthUsed=true;const result=await h.run({kind:'transfer',target:location(1,0,0,2),preserveSurfing:true});assert.equal(result.status,'awaiting-arrival');assert.equal(h.app.isWorldTravelReceipt(h.owner,{...result.receipt}),false);assert.equal(h.app.confirmWorldTravelArrival({},result.receipt,{actual:location(1,0,0,2),transferPending:false,loadedGeometry:{mapId:1,width:4,height:3}}).status,'refused');assert.equal(h.arrive().status,'arrived');assert.equal(h.app.world.localState.strengthUsed,true);assert.deepEqual(h.draws,[]);assert.equal(h.app.saveBlocked,false);
});
test('opaque map handle cannot be cloned to reserve and a structural receipt is never authority',async()=>{
 const h=await fixture();await h.run();const resource=await h.native.transfer.preload(h.owner,location());assert.equal(h.native.transfer.reserve(h.owner,{...h.receipt},resource).reason,'receipt-stale');assert.equal(h.native.transfer.reserve(h.owner,h.receipt,{...resource}).reason,'map-resource-stale');
});
test('request retry is bounded and duplicate id cannot repeat effects or conflict with another destination',async()=>{
 const h=await fixture(),a=await h.run(),b=await h.run();assert.equal(a.receipt,b.receipt);assert.deepEqual(h.effects,['fly-animation']);assert.equal((await h.run({kind:'transfer',target:location(3),preserveSurfing:false})).reason,'travel-request-conflict');h.arrive();await h.finish();assert.equal((await h.run()).status,'completed');assert.equal(h.state.stats.fly_count,1);
});
for(const failure of ['missing','invalid','unavailable'])test('preload '+failure+' returns explicit failure and releases without target assignment',async()=>{
 const h=await fixture();if(failure==='missing')h.root.$dataMapInfos[2]=null;else h.native.responses.set(2,failure==='invalid'?{text:'{'}:{network:true});const before=clone(h.state),map=h.root.$dataMap;const result=await h.run();assert.equal(result.status,'failed');assert.equal(h.player.isTransferring(),false);assert.equal(h.root.$dataMap,map);assert.deepEqual(h.state,before);assert.equal(h.app.saveBlocked,false);
});
test('missing native joint Content capability refuses before side effects',async()=>{const h=await fixture({noAtomic:true});assert.equal((await h.run()).status,'failed');assert.deepEqual(h.effects,[]);assert.equal(h.player.isTransferring(),false);});
for(const mutate of ['game','content','source','scene','generation'])test('preload continuation refuses changed '+mutate+' with no Fly stat or reserve',async()=>{
 const h=await fixture();h.native.responses.set(2,{defer:true});const run=h.run();await flush();assert.equal(h.native.deferred.length,1);
 if(mutate==='game')h.external(s=>{s.money++;});if(mutate==='content')h.loaded.current={...h.content,settings:{BADGE_FOR_FLY:99}};if(mutate==='source')h.player._x++;if(mutate==='scene')h.root.SceneManager._scene={};if(mutate==='generation')h.app.stateReplacedByHost();
 h.native.deferred.shift()();const result=await run;assert.equal(result.status,mutate==='generation'?'cancelled':'failed');assert.equal(h.state.stats.fly_count,0);assert.equal(h.player.isTransferring(),false);
});
test('late native arrival after new game cannot confirm or mutate replacement',async()=>{
 const h=await fixture();await h.run();const receipt=h.receipt,owner=h.owner;h.app.stateReplacedByHost();const before=clone(h.state);h.player.performTransfer();assert.equal(h.app.isWorldTravelReceipt(owner,receipt),false);assert.deepEqual(h.state,before);assert.equal(h.app.saveBlocked,false);
});
test('final native install rechecks source after reentrant weather draw; historical stat prefix remains once',async()=>{
 const h=await fixture({onRandom(actual){actual.player._x++;}});await h.run();assert.throws(()=>h.arrive(),/confirm/);assert.equal(h.state.world.weather.type,'None');assert.equal(h.state.stats.fly_count,1);assert.equal(h.state.world.escapePoint.mapId,3);assert.deepEqual(h.draws,[100]);
});
test('failed Fly callback retains prefix and explicit retry resumes tail without reserve/stat/entry replay',async()=>{
 let fail=true;const h=await fixture({effect(kind){return kind==='fly-callback'&&fail?{status:'failed',reason:'callback-failed'}:{status:'done'};}});await h.run();h.arrive();assert.equal((await h.finish()).reason,'callback-failed');assert.equal(h.app.saveBlocked,false);assert.ok(h.state.world.escapePoint);const before=[...h.effects];fail=false;const result=await h.app.retryWorldTravel('travel');assert.equal(result.status,'completed');assert.deepEqual(h.effects.slice(before.length),['fly-callback','wait:250']);assert.equal(h.state.stats.fly_count,1);assert.deepEqual(h.draws,[100]);assert.equal(h.state.world.escapePoint,null);
});
test('native connection counts exactly one target step, observes B first and never source encounter',async()=>{
 const h=await fixture();h.player._x=3;h.player._y=1;h.player._direction=6;const prior=h.state.steps;const run=await h.run('connection');assert.equal(run.status,'awaiting-arrival');assert.equal(h.state.steps,prior);assert.equal(h.arrive().status,'arrived');const result=await h.finish();assert.equal(result.status,'completed');assert.equal(result.step.status,'completed');assert.equal(h.state.steps,prior+1);assert.equal(h.arrivals.length,1);assert.equal(h.arrivals[0].mapId,2);assert.equal(h.arrivals[0].x,0);assert.equal(h.state.world.weather.durationFrames,20);assert.deepEqual(h.draws,[100]);assert.equal(h.app.saveBlocked,false);h.player.performTransfer();await h.finish();assert.equal(h.state.steps,prior+1);
});
test('Surf connection explicitly refuses without target Surf provider and never degrades to walking',async()=>{
 const h=await fixture({editState:s=>{s.world.surfing=true;}});h.player._x=3;h.player._y=1;h.player._direction=6;const result=await h.run('connection');assert.equal(result.status,'failed');assert.match(result.reason,/surf/);assert.equal(h.player.isTransferring(),false);assert.equal(h.state.steps,0);assert.equal(h.state.world.surfing,true);
});
test('Fly destinations derive current region/first valid records/visited maps without independent unlock state',async()=>{
 const h=await fixture();assert.deepEqual(h.app.worldFlyDestinations().destinations.map(x=>x.target.mapId),[2]);h.content.world.regionMaps.regions[0].points.unshift({x:5,y:6,switchId:0});assert.deepEqual(h.app.worldFlyDestinations().destinations,[]);assert.equal((await h.run()).reason,'stale-fly-selection');assert.equal(h.state.stats.fly_count,0);
});

test('Surf connection uses target-only production Surf native passage and preserves business mode for its single target step',async()=>{
 const h=await fixture({surf:true,editState:s=>{s.world.surfing=true;}});h.player._x=3;h.player._y=1;h.player._direction=6;const result=await h.run('connection');assert.equal(result.status,'awaiting-arrival');assert.equal(h.arrive().status,'arrived');const done=await h.finish();assert.equal(done.step.status,'completed');assert.equal(h.state.steps,1);assert.equal(h.state.world.surfing,true);assert.equal(h.arrivals.length,1);assert.equal(h.arrivals[0].mapId,2);assert.deepEqual(h.draws,[100]);
});
for(const kind of ['content','direction','pending'])test('arrival final native boundary rejects '+kind+' changed by B weather RNG',async()=>{
 const h=await fixture({onRandom(actual){if(kind==='content')actual.loaded.current={...actual.content,settings:{BADGE_FOR_FLY:99}};if(kind==='direction')actual.player._direction=8;if(kind==='pending')actual.player.reserveTransfer(3,1,1,2,0);}});await h.run();assert.throws(()=>h.arrive(),/confirm/);assert.equal(h.state.world.weather.type,'None');assert.equal(h.state.world.escapePoint.mapId,3);assert.equal(h.state.stats.fly_count,1);assert.deepEqual(h.draws,[100]);
});
test('actual switch slot invalidates Fly selection during preload; no host snapshot DTO can authorize it',async()=>{
 const h=await fixture({editContent(c){c.world.regionMaps.regions[0].points[0].switchId=1;},switches:{1:{status:'value',value:true}}});h.root.$gameSwitches._data[1]=true;h.native.responses.set(2,{defer:true});const promise=h.run();await flush();h.root.$gameSwitches._data[1]=false;h.native.deferred.shift()();const result=await promise;assert.equal(result.status,'failed');assert.equal(h.state.stats.fly_count,0);assert.equal(h.player.isTransferring(),false);
});
test('real switch values authorize Fly even if a separate stale DTO says false; inactive/negative records remain hidden',async()=>{
 const h=await fixture({editContent(c){c.world.regionMaps.regions[0].points[0].switchId=1;},switches:{1:{status:'value',value:false}}});h.root.$gameSwitches._data[1]=true;assert.equal(h.app.worldFlyDestinations().destinations.length,1);assert.equal((await h.run()).status,'awaiting-arrival');
});
test('public request own getter is rejected without executing it or a host provider',async()=>{
 let getter=0,host=0;const h=await fixture({onFacts(){host++;}});const request={kind:'fly'};Object.defineProperty(request,'selection',{enumerable:true,get(){getter++;throw Error('must not run');}});const result=await h.run(request);assert.equal(result.status,'failed');assert.equal(getter,0);assert.equal(host,0);assert.deepEqual(h.effects,[]);
});
test('unknown public request kind/field and malformed target never reserve',async()=>{
 for(const request of [{kind:'other'},{kind:'connection',stepId:'forged'},{kind:'transfer',target:{mapId:2,x:1,y:1},preserveSurfing:false},{kind:'fly',selection:{regionId:0,x:5,y:6,pointIndex:0,target:{mapId:0,x:1,y:1}}}]){const h=await fixture();assert.equal((await h.run(request)).status,'failed');assert.equal(h.player.isTransferring(),false);assert.deepEqual(h.effects,[]);}
});
test('cancelled preload late completion cannot retire or change the fresh successor lease',async()=>{
 const h=await fixture();h.native.responses.set(2,{defer:true});const old=h.run();await flush();assert.equal(h.app.cancelWorldTravel('travel').status,'cancelled');h.native.responses.delete(2);const successor=await h.run('fly','successor');assert.equal(successor.status,'awaiting-arrival');const owner=h.owner,receipt=h.receipt;h.native.deferred.shift()();assert.equal((await old).status,'cancelled');assert.equal(h.app.isWorldTravelOwner(owner),true);assert.equal(h.app.isWorldTravelReceipt(owner,receipt),true);assert.equal(h.app.cancelWorldTravel('travel').status,'failed');assert.equal(h.state.stats.fly_count,1);assert.equal(h.app.saveBlocked,true);
});
test('native connection target-facts failure retains authentic arrival and explicit retry performs no second transfer or B entry',async()=>{
 let fail=true;const h=await fixture({onStepFacts(){if(fail)throw Error('target-facts-failed');}});h.player._x=3;h.player._y=1;h.player._direction=6;await h.run('connection');assert.throws(()=>h.arrive(),/confirm/);assert.equal(h.state.steps,0);assert.equal(h.map._mapId,2);assert.deepEqual(h.draws,[100]);
 const beforeRecovery={state:clone(h.state),draws:h.draws.slice(),effects:h.effects.slice(),requests:h.native.requests.length};
 const unavailable=h.app.world.travel.recovery('travel-wrong');assert.equal(unavailable.status,'unavailable');assert.equal(unavailable.retry.enabled,false);assert.equal(unavailable.cancel.enabled,false);
 const recovery=h.app.world.travel.recovery('travel');assert.equal(recovery.status,'failed');assert.equal(recovery.phase,'after-arrival');assert.equal(recovery.physical,'arrived');assert.equal(recovery.reasonCode,'tail-failed');assert.equal(recovery.retry.enabled,true);assert.equal(recovery.cancel.enabled,false);
 assert.deepEqual({state:h.state,draws:h.draws,effects:h.effects,requests:h.native.requests.length},beforeRecovery,'pure recovery query must not replay or change the retained arrival');
 fail=false;const requests=h.native.requests.length;const result=await h.app.retryWorldTravel('travel');assert.equal(result.status,'completed');assert.equal(result.step.status,'completed');assert.equal(h.state.steps,1);assert.equal(h.arrivals.length,1);assert.equal(h.native.requests.length,requests);assert.deepEqual(h.draws,[100]);
});
test('cleanup failure is explicit and keeps save gate; it cannot silently become a completed cancellation',async()=>{
 const h=await fixture({onRetire(){return {status:'failed',reason:'own-pending-unsafe'};}});await h.run();const result=h.app.cancelWorldTravel('travel');assert.equal(result.status,'failed');assert.match(result.reason,/travel-retirement-failed/);assert.equal(h.app.saveBlocked,true);assert.equal(h.player.isTransferring(),true);assert.equal((await h.run('fly','successor')).reason,'operation-active');
});
test('unsafe native travel direction accessor is rejected before production observation executes it',async()=>{
 let getter=0;const h=await fixture();Object.defineProperty(h.player,'_direction',{configurable:true,get(){getter++;return 2;}});const result=await h.run();assert.equal(result.status,'failed');assert.equal(getter,0);assert.equal(h.state.stats.fly_count,0);assert.deepEqual(h.effects,[]);
});
test('Fly inherited switch getter is unavailable with zero invocation, never native false or stale host true',async()=>{
 let getter=0;const h=await fixture({editContent(c){c.world.regionMaps.regions[0].points[0].switchId=1;},switches:{1:{status:'value',value:true}}});const prototype=Object.create(Array.prototype);Object.defineProperty(prototype,'1',{get(){getter++;return true;}});Object.setPrototypeOf(h.root.$gameSwitches._data,prototype);assert.equal(h.app.worldFlyDestinations().status,'blocked');assert.equal((await h.run()).status,'failed');assert.equal(getter,0);assert.deepEqual(h.effects,[]);
});

// Same current App/native producer, registered nested ordinary recovery controls.
require('./test-e3-retry-arrival-retirement.cjs');
