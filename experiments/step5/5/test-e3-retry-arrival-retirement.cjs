'use strict';
// Ordinary App + real native lease producer controls. No IIFE or formal business-run claim.
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,flush,clone}=require('./e3-parent-fixture.cjs');
const E=require(process.env.PF_E3_PARENT_BUNDLE);
const read=h=>E.readNativeTravelLease(h.native.transfer.nativeLeaseSource);
async function failed(options={}){
 let failing=true;
 const h=await fixture({...options,effect(kind,actual){
  if(kind==='fly-callback'&&failing)return {status:'failed',reason:'retry-original-tail-failed'};
  return options.effect?.(kind,actual)??{status:'done'};
 }});
 const run=await h.run();assert.equal(run.status,'awaiting-arrival');h.arrive();
 assert.equal(h.app.deferWorldTravelSave(),true);
 assert.equal((await h.finish()).reason,'retry-original-tail-failed');
 const original=read(h),prefix=structuredClone(h.state),effects=h.effects.slice(),draws=h.draws.slice(),requests=h.native.requests.length;
 assert.equal(original.current.phase,'arrived');assert(original.mapBirth.frame);assert.equal(h.saves.length,0);
 return {h,original,prefix,effects,draws,requests,allow(){failing=false;}};
}
function prefixOnce(c){
 assert.equal(c.h.state.stats.fly_count,1);assert.deepEqual(c.h.draws,c.draws);assert.deepEqual(c.draws,[100]);
 assert.equal(c.h.native.requests.length,c.requests);assert.equal(c.h.native.log.filter(x=>x==='locate').length,1);
}
test('RR01 actual after-arrival Retry retires original lease exactly once, with one original save and no prefix replay',async()=>{
 const c=await failed(),{h}=c;let calls=0;const native=h.travel.releaseRecoveredArrival;
 h.travel.releaseRecoveredArrival=function(owner,physical,birth,guard){calls++;assert.strictEqual(physical,c.original.current);assert.strictEqual(birth.birth,c.original.mapBirth.birth);assert.strictEqual(birth.queue,c.original.mapBirth.queue);assert.notStrictEqual(owner,physical.owner);return Reflect.apply(native,this,[owner,physical,birth,guard]);};
 c.allow();const result=await h.app.retryWorldTravel('travel');assert.equal(result.status,'completed');assert.equal(calls,1);
 assert.equal(read(h).current,null);assert.strictEqual(read(h).mapBirth,c.original.mapBirth);assert.equal(h.state.world.escapePoint,null);assert.equal(h.saves.length,1);prefixOnce(c);
 assert.deepEqual(h.effects.slice(c.effects.length),['fly-callback','wait:250']);
 assert.equal((await h.app.retryWorldTravel('travel')).reason,'travel-not-retryable');assert.equal(calls,1);assert.equal(h.saves.length,1);
 assert.equal(h.native.transfer.releaseRecoveryArrival(c.original.current,c.original.mapBirth,()=>{}).status,'failed');
});
test('RR02 failed retry retains original arrival, original save request and committed prefix',async()=>{
 const c=await failed(),{h}=c;assert.equal((await h.app.retryWorldTravel('travel')).reason,'retry-original-tail-failed');
 assert.strictEqual(read(h).current,c.original.current);assert.equal(h.saves.length,0);assert(h.state.world.escapePoint);prefixOnce(c);
 c.allow();assert.equal((await h.app.retryWorldTravel('travel')).status,'completed');assert.equal(read(h).current,null);assert.equal(h.saves.length,1);prefixOnce(c);
});
test('RR03 real ingress remains blocked by retained arrival and uses its normal frame after exact retirement',async()=>{
 const c=await failed(),{h}=c,calls=[];
 const app={get stateGeneration(){return h.app.stateGeneration;},get saveBlocked(){return h.app.saveBlocked;},get encounterBlocked(){return h.app.encounterBlocked;},
  async initializeBlackoutCompanions(){calls.push('initialize');return {status:'completed'};},
  async restoreEventCompanionsAtMap(birth){calls.push(['restore',birth]);return {status:'completed'};}};
 const ingress=E.createCompanionIngressMZ({root:h.root,source:h.native.transfer.nativeLeaseSource,isProxy:require('node:util').types.isProxy,
  application:()=>app,runtime:()=>null,loadPending:()=>false,diagnostic:reason=>assert.fail(reason)});
 ingress.mapFrame();await flush();assert.deepEqual(calls,[]);
 c.allow();assert.equal((await h.app.retryWorldTravel('travel')).status,'completed');assert.deepEqual(calls,[],'retirement does not forge restore');
 ingress.mapFrame();await flush();assert.deepEqual(calls,['initialize',['restore',c.original.mapBirth.birth]]);assert.equal(ingress.pending(),false);
 ingress.mapFrame();await flush();assert.equal(calls.length,2);prefixOnce(c);
});
for(const key of ['owner','receipt','lease','serial','player','scene','sourceScene'])test('RR04 native producer refuses foreign '+key+' without retiring original',async()=>{
 const c=await failed(),{h}=c;
 assert.equal(h.native.transfer.releaseRecoveryArrival({...c.original.current,[key]:{}},c.original.mapBirth,()=>{}).status,'failed');
 assert.strictEqual(read(h).current,c.original.current);prefixOnce(c);
});
test('RR05 native producer refuses cloned birth and guard exception with original Error identity at the call boundary',async()=>{
 const c=await failed(),{h}=c,original=Error('original-host-guard');let caught;
 const result=h.native.transfer.releaseRecoveryArrival(c.original.current,c.original.mapBirth,()=>{try{throw original;}catch(error){caught=error;throw error;}});
 assert.strictEqual(caught,original);assert.equal(result.reason,original.message);assert.strictEqual(read(h).current,c.original.current);
 assert.equal(h.native.transfer.releaseRecoveryArrival(c.original.current,{...c.original.mapBirth},()=>{}).status,'failed');assert.strictEqual(read(h).current,c.original.current);
});
for(const kind of ['generation','content','equal-content','source','scene','raw-successor'])test('RR06 release preflight refuses reentrant '+kind+' and preserves successor/native state',async()=>{
 let changed=false;
 const c=await failed({onRecoveryRelease(h){changed=true;if(kind==='generation')h.app.stateReplacedByHost();if(kind==='content')h.loaded.current={...h.content,settings:{BADGE_FOR_FLY:99}};
  if(kind==='equal-content')h.loaded.current=structuredClone(h.content);if(kind==='source')h.player._x++;if(kind==='scene')h.root.SceneManager._scene={};if(kind==='raw-successor')h.player.reserveTransfer(3,2,1,8,0);}}),{h}=c;
 c.allow();const result=await h.app.retryWorldTravel('travel');assert.equal(changed,true);assert.equal(result.status,'failed');prefixOnce(c);
 assert.equal(h.state.world.escapePoint,null,'already committed tail never rolls back');
 if(kind==='raw-successor'){assert.equal(h.player.isTransferring(),true);assert.equal(h.player._newMapId,3);assert.equal(h.player._newX,2);assert.equal(h.player._newDirection,8);}
 else assert.strictEqual(read(h).current,c.original.current);
});
test('RR07 release hook failure retains physical proof; explicit retry retires without replaying already committed tail',async()=>{
 let reject=true;const c=await failed({onRecoveryRelease(){if(reject)throw Error('release-host-failed');}}),{h}=c;
 c.allow();assert.equal((await h.app.retryWorldTravel('travel')).reason,'release-host-failed');assert.strictEqual(read(h).current,c.original.current);
 const effects=h.effects.slice(),saves=h.saves.length;reject=false;assert.equal((await h.app.retryWorldTravel('travel')).status,'completed');
 assert.equal(read(h).current,null);assert.deepEqual(h.effects,effects);assert.equal(h.saves.length,saves);prefixOnce(c);
});
test('RR08 dishonest done without native retirement is rejected by canonical App postcheck',async()=>{
 const c=await failed(),{h}=c,release=h.travel.releaseRecoveredArrival;c.allow();h.travel.releaseRecoveredArrival=()=>({status:'done'});
 assert.equal((await h.app.retryWorldTravel('travel')).reason,'travel-recovery-retirement-not-completed');assert.strictEqual(read(h).current,c.original.current);
 h.travel.releaseRecoveredArrival=release;assert.equal((await h.app.retryWorldTravel('travel')).status,'completed');assert.equal(read(h).current,null);prefixOnce(c);
});
for(const mode of ['cancel','newgame','load'])test('RR09 late tail after '+mode+' cannot retire original or a successor',async()=>{
 let waiting=false,resolve;const c=await failed({wait(){if(waiting)return new Promise(done=>{resolve=done;});return {status:'done'};}}),{h}=c;
 c.allow();waiting=true;const pending=h.app.retryWorldTravel('travel');await flush();assert.equal(typeof resolve,'function');
 if(mode==='cancel')assert.equal(h.app.cancelWorldTravel('travel').status,'cancelled');else h.app.stateReplacedByHost();
 h.player.reserveTransfer(3,2,1,8,0);resolve({status:'done'});assert.equal((await pending).status,'cancelled');assert.equal(h.player.isTransferring(),true);assert.equal(h.player._newMapId,3);prefixOnce(c);
 assert.equal(h.saves.length,0);
});
test('RR10 duplicate retry while active executes one tail and one exact retirement',async()=>{
 let waiting=false,resolve;const c=await failed({wait(){if(waiting)return new Promise(done=>{resolve=done;});return {status:'done'};}}),{h}=c;
 c.allow();waiting=true;const pending=h.app.retryWorldTravel('travel');await flush();assert.equal((await h.app.retryWorldTravel('travel')).reason,'travel-not-retryable');
 resolve({status:'done'});assert.equal((await pending).status,'completed');assert.equal(read(h).current,null);assert.equal(h.saves.length,1);prefixOnce(c);
});
test('RR11 genuine reentrant App successor keeps its own new reservation when old completion returns',async()=>{
 let successor;const c=await failed({onRecoveryRelease(h){successor=h.app.runWorldTravel('new-app-owner',{kind:'transfer',target:{mapId:3,x:2,y:1,direction:8},preserveSurfing:false});}}),{h}=c;
 c.allow();assert.equal((await h.app.retryWorldTravel('travel')).status,'failed');const next=await successor;
 assert.equal(next.status,'awaiting-arrival');assert.strictEqual(read(h).current.receipt,next.receipt);assert.notStrictEqual(read(h).current.owner,c.original.current.owner);
 assert.equal(h.player.isTransferring(),true);assert.equal(h.player._newMapId,3);assert.equal(h.player._newX,2);assert.equal(h.state.stats.fly_count,1);assert.deepEqual(h.draws,[100]);
});
test('RR12 a raw successor after exact release survives the old App postcheck and is never cleared',async()=>{
 const c=await failed(),{h}=c,release=h.travel.releaseRecoveredArrival;c.allow();
 h.travel.releaseRecoveredArrival=function(...args){const result=Reflect.apply(release,this,args);assert.equal(result.status,'done');h.player.reserveTransfer(3,2,1,8,0);return result;};
 assert.equal((await h.app.retryWorldTravel('travel')).status,'failed');assert.equal(h.player.isTransferring(),true);assert.equal(h.player._newMapId,3);assert.equal(h.player._newX,2);assert.equal(h.state.world.escapePoint,null);assert.deepEqual(h.draws,[100]);
});
test('RR13 older host without the new optional completion port explicitly refuses; later supported retry does not replay tail',async()=>{
 const c=await failed(),{h}=c,release=h.travel.releaseRecoveredArrival;c.allow();delete h.travel.releaseRecoveredArrival;
 assert.equal((await h.app.retryWorldTravel('travel')).reason,'travel-recovery-retirement-unavailable');assert.strictEqual(read(h).current,c.original.current);
 const effects=h.effects.slice();h.travel.releaseRecoveredArrival=release;assert.equal((await h.app.retryWorldTravel('travel')).status,'completed');assert.deepEqual(h.effects,effects);assert.equal(h.saves.length,1);prefixOnce(c);
});
const successorIntent={kind:'transfer',target:{mapId:3,x:2,y:1,direction:8},preserveSurfing:false};
async function deferredSuccessor(options={}){
 let successor;const c=await failed({...options,onSave(h){h.native.responses.set(3,{defer:true,...options.response});successor=h.app.runWorldTravel('save-hook-successor',successorIntent);}});
 c.allow();const result=await c.h.app.retryWorldTravel('travel');await flush();assert.equal(c.h.native.deferred.length,1);
 assert.equal(result.status,'failed');assert.strictEqual(read(c.h).current,c.original.current);assert.equal(c.h.app.saveBlocked,true);
 return {...c,result,successor,finishResource(){c.h.native.deferred.shift()();}};
}
test('TP01 IR01 exact save-hook App successor immediately cancelled retires the genuine completed original',async()=>{
 let successor,cancelled;const c=await failed({onSave(h){successor=h.app.runWorldTravel('save-hook-successor',successorIntent);cancelled=h.app.cancelWorldTravel('save-hook-successor');}}),{h}=c;
 c.allow();const result=await h.app.retryWorldTravel('travel');assert.equal(result.status,'completed');assert.equal(cancelled.status,'cancelled');assert.equal((await successor).status,'cancelled');
 assert.equal(read(h).current,null);assert.equal(h.saves.length,1);assert.equal(h.state.world.escapePoint,null);prefixOnce(c);
 const restores=[],app={get stateGeneration(){return h.app.stateGeneration;},get saveBlocked(){return h.app.saveBlocked;},get encounterBlocked(){return h.app.encounterBlocked;},
  async initializeBlackoutCompanions(){restores.push('initialize');return {status:'completed'};},async restoreEventCompanionsAtMap(birth){restores.push(birth);return {status:'completed'};}};
 const ingress=E.createCompanionIngressMZ({root:h.root,source:h.native.transfer.nativeLeaseSource,isProxy:require('node:util').types.isProxy,application:()=>app,runtime:()=>null,loadPending:()=>false,diagnostic:reason=>assert.fail(reason)});
 for(let i=0;i<3;i++){ingress.mapFrame();await flush();}assert.deepEqual(restores,['initialize',c.original.mapBirth.birth]);
 assert.equal((await h.app.retryWorldTravel('travel')).reason,'travel-not-retryable');assert.equal(h.saves.length,1);prefixOnce(c);
});
test('TP02 still-active no-native descendant blocks old cleanup; later cancel performs one event-driven retirement',async()=>{
 let releases=0;const c=await deferredSuccessor({onRecoveryRelease(){releases++;}}),{h}=c;
 assert.equal(h.app.world.travel.recovery('travel').retry.enabled,false);assert.equal((await h.app.retryWorldTravel('travel')).reason,'operation-active');assert.equal(releases,0);
 assert.equal(h.app.cancelWorldTravel('save-hook-successor').status,'cancelled');assert.equal(read(h).current,null);assert.equal(releases,1);
 c.finishResource();assert.equal((await c.successor).status,'cancelled');assert.equal(releases,1);assert.equal(h.saves.length,1);assert.equal(h.state.stats.fly_count,1);assert.deepEqual(h.draws,[100]);assert.equal(h.native.log.filter(x=>x==='locate').length,1);
});
test('TP03 later no-native preload failure completes the exact retained obligation without replaying original work',async()=>{
 let releases=0;const c=await deferredSuccessor({response:{network:true},onRecoveryRelease(){releases++;}}),{h}=c;
 c.finishResource();assert.equal((await c.successor).status,'failed');assert.equal(read(h).current,null);assert.equal(releases,1);assert.equal(h.saves.length,1);assert.deepEqual(h.draws,[100]);assert.equal(h.state.stats.fly_count,1);
 assert.equal(h.native.log.filter(x=>x==='locate').length,1);assert.equal(h.state.world.escapePoint,null);
});
test('TP04 a short lineage of genuine cancelled no-native admissions cannot lose or duplicate the original retirement',async()=>{
 const jobs=[];const c=await failed({onSave(h){for(let i=0;i<3;i++){const id='cancelled-lineage-'+i;jobs.push(h.app.runWorldTravel(id,successorIntent));assert.equal(h.app.cancelWorldTravel(id).status,'cancelled');}}}),{h}=c;
 c.allow();assert.equal((await h.app.retryWorldTravel('travel')).status,'completed');for(const job of jobs)assert.equal((await job).status,'cancelled');assert.equal(read(h).current,null);assert.equal(h.saves.length,1);prefixOnce(c);
});
test('TP05 failed terminal-event cleanup is attempted once; original explicit Retry remains a reachable cleanup-only entrance',async()=>{
 let reject=true,releases=0,issuedOwner;const c=await deferredSuccessor({onRecoveryRelease(h,owner){releases++;issuedOwner??=owner;assert.strictEqual(owner,issuedOwner);if(reject)throw Error('event-cleanup-failed');}}),{h}=c;
 assert.equal(h.app.cancelWorldTravel('save-hook-successor').status,'cancelled');assert.strictEqual(read(h).current,c.original.current);assert.equal(releases,1);
 c.finishResource();assert.equal((await c.successor).status,'cancelled');assert.equal(releases,1,'late publication is not a second automatic attempt');assert.equal(h.app.world.travel.recovery('travel').retry.enabled,true);
 const effects=h.effects.slice(),saves=h.saves.length;let capturedOwner;reject=false;assert.equal((await h.app.world.travel.retry('travel',owner=>{capturedOwner=owner;assert.equal(h.app.world.travel.isRetryExecutionCurrent('travel',owner),true);})).status,'completed');assert.strictEqual(capturedOwner,issuedOwner);assert.equal(read(h).current,null);assert.equal(releases,2);assert.deepEqual(h.effects,effects);assert.equal(h.saves.length,saves);assert.deepEqual(h.draws,[100]);
});
test('TP06 a genuinely reserved new App/native successor is protected from original pending retirement',async()=>{
 let successor,releases=0;const c=await failed({onSave(h){successor=h.app.runWorldTravel('native-successor',successorIntent);},onRecoveryRelease(){releases++;}}),{h}=c;
 c.allow();assert.equal((await h.app.retryWorldTravel('travel')).status,'failed');const next=await successor;assert.equal(next.status,'awaiting-arrival');assert.strictEqual(read(h).current.receipt,next.receipt);
 assert.equal((await h.app.retryWorldTravel('travel')).reason,'travel-not-retryable','genuine new native publication revoked the old credential');assert.strictEqual(read(h).current.receipt,next.receipt);assert.equal(releases,0);
 assert.equal(h.app.cancelWorldTravel('native-successor').status,'cancelled');assert.equal(read(h).current,null,'only the new owner cancels its own native reservation');assert.equal(releases,0);assert.equal(h.saves.length,1);assert.deepEqual(h.draws,[100]);
});
test('TP07 raw201 supersession during a pending obligation survives late descendant cancel and cleanup',async()=>{
 let releases=0;const c=await deferredSuccessor({onRecoveryRelease(){releases++;}}),{h}=c;
 h.player.reserveTransfer(3,3,1,8,0);assert.equal(h.app.cancelWorldTravel('save-hook-successor').status,'cancelled');assert.equal(h.player.isTransferring(),true);assert.equal(h.player._newX,3);assert.equal(releases,0);
 c.finishResource();assert.equal((await c.successor).status,'cancelled');assert.equal(h.player._newX,3);assert.equal(releases,0);assert.equal(h.app.world.travel.recovery('travel').retry.enabled,false);assert.equal(h.saves.length,1);assert.deepEqual(h.draws,[100]);
});
for(const cause of ['newgame','load'])test('TP08 '+cause+' shared generation invalidation revokes old obligation before late descendant settlement',async()=>{
 let releases=0;const c=await deferredSuccessor({onRecoveryRelease(){releases++;}}),{h}=c;
 h.app.stateReplacedByHost();h.player.reserveTransfer(3,3,1,8,0);c.finishResource();assert.equal((await c.successor).status,'cancelled');
 assert.equal(h.player.isTransferring(),true);assert.equal(h.player._newX,3);assert.equal(releases,0);assert.equal(h.app.world.travel.recovery('travel').retry.enabled,false);assert.deepEqual(h.draws,[100]);
});
for(const cause of ['content','equal-content','position','scene'])test('TP09 late '+cause+' change cannot borrow old obligation or re-sign its native birth',async()=>{
 let releases=0;const c=await deferredSuccessor({onRecoveryRelease(){releases++;}}),{h}=c;
 if(cause==='content')h.loaded.current={...h.content,settings:{BADGE_FOR_FLY:99}};if(cause==='equal-content')h.loaded.current=structuredClone(h.content);if(cause==='position')h.player._x++;if(cause==='scene')h.root.SceneManager._scene={};
 assert.equal(h.app.cancelWorldTravel('save-hook-successor').status,'cancelled');assert.strictEqual(read(h).current,c.original.current);assert.equal(releases,0);c.finishResource();assert.equal((await c.successor).status,'cancelled');
 assert.strictEqual(read(h).current,c.original.current);assert.equal(releases,0);assert.equal(h.app.world.travel.recovery('travel').retry.enabled,false);assert.equal(h.saves.length,1);assert.deepEqual(h.draws,[100]);
});
test('TP10 another request id and cancelling the completed original cannot borrow successor ownership',async()=>{
 let releases=0;const c=await deferredSuccessor({onRecoveryRelease(){releases++;}}),{h}=c;
 assert.equal((await h.app.retryWorldTravel('other-request')).reason,'travel-not-retryable');assert.equal(h.app.cancelWorldTravel('travel').reason,'stale-travel-request');assert.strictEqual(read(h).current,c.original.current);assert.equal(releases,0);
 h.app.cancelWorldTravel('save-hook-successor');c.finishResource();await c.successor;assert.equal(releases,1);assert.equal(read(h).current,null);assert.equal(h.saves.length,1);
});
async function ropeItem(options={}){
 let failing=true;const h=await fixture({...options,editState(game){game.inventory.pockets[0]=[{itemId:'escaperope',quantity:2}];options.editState?.(game);},
  effect(kind){return kind==='refresh'&&failing?{status:'failed',reason:'rope-original-refresh-failed'}:{status:'done'};}});
 assert(h.content.items.escaperope);const inventory=h.app.beginInventoryOperation(),view=h.app.inventorySnapshot(inventory),pocket=view.pockets.findIndex(rows=>rows.some(r=>r.item.id==='escaperope'));
 const row=view.pockets[pocket].find(r=>r.item.id==='escaperope'),ticket=h.app.inventoryTicket(inventory,pocket+1,row.index),handoff=h.app.prepareFieldItemHandoff(inventory,'ordinary-rope',ticket);
 assert.equal(handoff.status,'handoff');h.app.endInventoryOperation(inventory);const token=handoff.handoff.token,admitted=await h.app.runFieldItemHandoff(token);
 assert.equal(admitted.status,'travel-admitted');assert.equal(admitted.travel.status,'awaiting-arrival');h.arrive();assert.equal(h.app.deferWorldTravelSave(),true);assert.equal((await h.finish()).reason,'rope-original-refresh-failed');
 return {h,token,allow(){failing=false;},quantity:()=>h.E.inventory.itemQuantity(h.state.inventory,'escaperope',h.content.items)};
}
test('RP01 genuine Rope World retry consumer then remaining cleanup-only retry retains receipt and consumes once',async()=>{
 let reject=true,releases=0,issuedOwner;const c=await ropeItem({onRecoveryRelease(h,owner){releases++;issuedOwner??=owner;if(reject)throw Error('rope-cleanup-failed');}}),{h}=c;c.allow();
 const validator=h.app.world.travel.isRetryExecutionCurrent,validated=[];h.app.world.travel.isRetryExecutionCurrent=function(id,owner){const result=Reflect.apply(validator,this,[id,owner]);validated.push({id,owner,result});return result;};
 assert.equal((await h.app.retryFieldItemTravel(c.token)).reason,'rope-cleanup-failed');assert.equal(c.quantity(),1);assert.equal(h.state.world.escapePoint,null);assert.equal((await h.app.runFieldItemHandoff(c.token)).status,'duplicate');
 const requestId=validated[0].id;assert.equal(validated[0].result,true);assert.equal(h.app.world.travel.hasPendingArrivalRetirement(requestId),true);assert.equal(h.app.world.travel.hasPendingArrivalRetirement(requestId+'-wrong'),false);assert.equal(Reflect.apply(validator,h.app.world.travel,[requestId,{}]),false);
 const effects=h.effects.slice(),saves=h.saves.length,requests=h.native.requests.length;reject=false;const result=await h.app.retryFieldItemTravel(c.token);
 assert.equal(result.status,'completed');assert.equal(result.consumed,true);assert.strictEqual(validated.at(-1).owner,issuedOwner);assert.equal(validated.at(-1).result,true);assert.equal(read(h).current,null);
 assert.equal((await h.app.runFieldItemHandoff(c.token)).status,'duplicate');assert.equal(c.quantity(),1);assert.equal((await h.app.retryFieldItemTravel(c.token)).reason,'travel-not-retryable');assert.equal(releases,2);assert.equal(h.saves.length,saves);assert.deepEqual(h.effects,effects);assert.equal(h.native.requests.length,requests);assert.deepEqual(h.draws,[]);
});
test('RP02 wrong cleanup callback owner fails the real World validator and cannot overwrite the completed Rope receipt',async()=>{
 let reject=true;const c=await ropeItem({onRecoveryRelease(){if(reject)throw Error('rope-cleanup-failed');}}),{h}=c;c.allow();await h.app.retryFieldItemTravel(c.token);
 const retry=h.app.world.travel.retry,validator=h.app.world.travel.isRetryExecutionCurrent,results=[],foreign={};
 h.app.world.travel.retry=function(id,callback){return Reflect.apply(retry,this,[id,()=>callback(foreign)]);};h.app.world.travel.isRetryExecutionCurrent=function(...args){const result=Reflect.apply(validator,this,args);results.push(result);return result;};
 reject=false;assert.equal((await h.app.retryFieldItemTravel(c.token)).status,'completed','real cleanup result still belongs to its actual operation');assert.deepEqual(results,[false]);assert.equal(read(h).current,null);
 const receipt=await h.app.runFieldItemHandoff(c.token);assert.equal(receipt.status,'duplicate');assert.equal(receipt.consumed,true);assert.equal(c.quantity(),1);assert.equal((await h.app.retryFieldItemTravel(c.token)).reason,'travel-not-retryable');assert.deepEqual(h.draws,[]);
});
test('RP03 Rope terminal gate cannot delegate old cleanup over an active real App/native successor',async()=>{
 let reject=true;const c=await ropeItem({onRecoveryRelease(){if(reject)throw Error('rope-cleanup-failed');}}),{h}=c;c.allow();await h.app.retryFieldItemTravel(c.token);reject=false;
 const next=await h.app.runWorldTravel('rope-successor',successorIntent);assert.equal(next.status,'awaiting-arrival');assert.equal((await h.app.retryFieldItemTravel(c.token)).reason,'travel-not-retryable');assert.strictEqual(read(h).current.receipt,next.receipt);assert.equal(c.quantity(),1);assert.equal((await h.app.runFieldItemHandoff(c.token)).status,'duplicate');
 h.app.cancelWorldTravel('rope-successor');assert.deepEqual(h.draws,[]);
});
test('RP04 real generation invalidation closes the Rope completed cleanup observation and formal retry entry',async()=>{
 const c=await ropeItem({onRecoveryRelease(){throw Error('rope-cleanup-failed');}}),{h}=c;c.allow();await h.app.retryFieldItemTravel(c.token);h.app.stateReplacedByHost();
 assert.equal((await h.app.retryFieldItemTravel(c.token)).status,'refused');assert.equal(c.quantity(),1);assert.deepEqual(h.draws,[]);
});
test('RP05 ordinary successful Rope World retry has no remaining cleanup capability and duplicate use never consumes again',async()=>{
 const c=await ropeItem(),{h}=c;c.allow();assert.equal((await h.app.retryFieldItemTravel(c.token)).status,'completed');assert.equal(read(h).current,null);assert.equal(c.quantity(),1);assert.equal((await h.app.runFieldItemHandoff(c.token)).status,'duplicate');assert.equal((await h.app.retryFieldItemTravel(c.token)).reason,'travel-not-retryable');assert.equal(c.quantity(),1);assert.deepEqual(h.draws,[]);
});

// RR-R2: the real public shortcut/Inventory/Rope consumer, with a lawful terminal
// no-native successor. No fixture writes private travel, receipt or lineage state.
async function publicRopeRecovery(options={}) {
 let failing=true,reject=true,releases=0,successor,cancelled;
 const calls={read:0,content:0,facts:0,random:0};
 const h=await fixture({
  editState(game){game.inventory.pockets[0]=[{itemId:'escaperope',quantity:2}];game.inventory.registeredItems=['escaperope'];},
  effect(kind){return kind==='refresh'&&failing?{status:'failed',reason:'public-rope-refresh'}:{status:'done'};},
  onRead(h){calls.read++;options.onRead?.(h);},onContent(){calls.content++;},onFacts(){calls.facts++;},onRandom(){calls.random++;},
  onSave(h){successor=h.app.runWorldTravel('public-rope-successor',successorIntent);cancelled=h.app.cancelWorldTravel('public-rope-successor');},
  onRecoveryRelease(h,...args){releases++;if(reject)throw Error('public-rope-cleanup');options.onRecoveryRelease?.(h,...args);},
 });
 const prepared=h.app.prepareFieldShortcutSelection('shortcut',{kind:'item',itemId:'escaperope'});assert.equal(prepared.status,'prepared');const request=prepared.request;
 const admitted=await h.app.executeFieldShortcut(request);assert.equal(admitted.status,'accepted');assert.equal(admitted.result.status,'travel-admitted');assert.equal(admitted.result.travel.status,'awaiting-arrival');
 h.arrive();assert.equal(h.app.deferWorldTravelSave(),true);assert.equal((await h.finish()).reason,'public-rope-refresh');assert.equal(h.app.fieldShortcutRecovery(request).retry.enabled,true);
 const ids=[],retry=h.app.world.travel.retry;h.app.world.travel.retry=function(id,...args){ids.push(id);return Reflect.apply(retry,this,[id,...args]);};
 failing=false;const first=await h.app.retryFieldShortcutRecovery(request);assert.equal(first.status,'failed');assert.equal((await successor).status,'cancelled');assert.equal(cancelled.status,'cancelled');assert.equal(releases,2);
 assert.equal(h.app.fieldShortcutRecovery(request).retry.enabled,true);
 const quantity=()=>E.inventory.itemQuantity(h.state.inventory,'escaperope',h.content.items);
 assert.equal(quantity(),1);assert.equal(h.saves.length,1);assert.equal(h.native.requests.length,1);assert.deepEqual(h.draws,[]);
 return {h,request,calls,ids,first,quantity,get releases(){return releases;},allow(){reject=false;},
  once(){assert.equal(quantity(),1);assert.equal(h.saves.length,1);assert.deepEqual(h.draws,[]);},
 };
}
test('ST01 actual public Rope second recovery completes the consumed original behind a cancelled no-native successor',async()=>{
 const c=await publicRopeRecovery(),{h,request}=c,baseline={...c.calls};
 assert.equal(h.app.world.travel.hasPendingArrivalRetirement(c.ids[0]),true);assert.equal(h.app.world.travel.hasPendingArrivalRetirement(c.ids[0]+'-foreign'),false);assert.deepEqual(c.calls,baseline,'pending query remains provider-free');
 const effects=h.effects.slice();c.allow();const second=await h.app.retryFieldShortcutRecovery(request);
 assert.equal(second.status,'completed');assert.equal(second.snapshot.status,'completed');assert.equal(second.snapshot.retry.enabled,false);assert.equal(read(h).current,null);assert.equal(c.releases,3);c.once();assert.equal(h.native.requests.length,1);assert.deepEqual(h.effects,effects);
 assert.equal((await h.app.executeFieldShortcut(request)).status,'accepted','the original once execution is unchanged');
 assert.equal((await h.app.retryFieldShortcutRecovery(request)).status,'refused');assert.equal(c.releases,3);c.once();
});
test('ST02 copied and foreign-App public requests cannot acquire the original cleanup call',async()=>{
 const c=await publicRopeRecovery(),other=await fixture(),{h}=c;c.allow();const physical=read(h).current;
 assert.equal((await h.app.retryFieldShortcutRecovery({...c.request})).status,'refused');assert.equal((await other.app.retryFieldShortcutRecovery(c.request)).status,'refused');
 assert.strictEqual(read(h).current,physical);assert.equal(c.releases,2);c.once();assert.equal((await h.app.retryFieldShortcutRecovery(c.request)).status,'completed');
});
test('ST03 wrong World callback owner cannot certify an otherwise authentic completed cleanup',async()=>{
 const c=await publicRopeRecovery(),{h}=c,retry=h.app.world.travel.retry;c.allow();
 h.app.world.travel.retry=function(id,onAdmitted,onRetired){return Reflect.apply(retry,this,[id,()=>onAdmitted({}),onRetired]);};
 assert.equal((await h.app.retryFieldShortcutRecovery(c.request)).status,'refused');assert.equal(read(h).current,null);assert.equal(c.releases,3);c.once();
});
for(const cause of ['generation','content','equal-content','raw-native','app-native'])test('ST04 before cleanup '+cause+' cannot borrow the old public request',async()=>{
 const c=await publicRopeRecovery(),{h}=c;c.allow();let successor;
 if(cause==='generation')h.app.stateReplacedByHost();
 if(cause==='content')h.loaded.current={...h.content,settings:{BADGE_FOR_FLY:99}};
 if(cause==='equal-content')h.loaded.current=structuredClone(h.content);
 if(cause==='raw-native')h.player.reserveTransfer(3,3,1,8,0);
 if(cause==='app-native')successor=await h.app.runWorldTravel('public-new-native',successorIntent);
 const physical=read(h).current,point=h.player._newX,result=await h.app.retryFieldShortcutRecovery(c.request);
 assert.notEqual(result.status,'completed');assert.strictEqual(read(h).current,physical);assert.equal(h.player._newX,point);assert.equal(c.releases,2);c.once();
 if(successor)assert.strictEqual(read(h).current.receipt,successor.receipt);
});
for(const cause of ['generation','content','equal-content','raw-native','app-native','position','scene'])test('ST05 after release and before public await '+cause+' rejects the old completion proof',async()=>{
 const c=await publicRopeRecovery(),{h}=c,retry=h.app.world.travel.retry;c.allow();let changed=false,next;
 h.app.world.travel.retry=function(...args){return Reflect.apply(retry,this,args).then(async result=>{
  if(!changed&&result.status==='completed'){
   changed=true;
   if(cause==='generation')h.app.stateReplacedByHost();
   if(cause==='content')h.loaded.current={...h.content,settings:{BADGE_FOR_FLY:99}};
   if(cause==='equal-content')h.loaded.current=structuredClone(h.content);
   if(cause==='raw-native')h.player.reserveTransfer(3,3,1,8,0);
   if(cause==='app-native')next=await h.app.runWorldTravel('public-late-native',successorIntent);
   if(cause==='position')h.player._x++;
   if(cause==='scene')h.root.SceneManager._scene={};
  }
  return result;
 });};
 const result=await h.app.retryFieldShortcutRecovery(c.request);assert.equal(changed,true);assert.equal(result.status,'refused');assert.equal(c.releases,3);c.once();
 if(next)assert.strictEqual(read(h).current.receipt,next.receipt);else if(cause==='raw-native'){assert.equal(h.player.isTransferring(),true);assert.equal(h.player._newX,3);}else assert.equal(read(h).current,null);
});
test('ST06 one in-flight public recovery is shared and its post-await check is consumed once',async()=>{
 const c=await publicRopeRecovery(),{h}=c,retry=h.app.world.travel.retry;c.allow();let issuedCheck,issuedId,issuedOwner,issued=0;
 h.app.world.travel.retry=function(id,onAdmitted,onRetired){return Reflect.apply(retry,this,[id,owner=>{issuedOwner=owner;onAdmitted(owner);},current=>{issued++;issuedCheck=current;issuedId=id;onRetired(current);}]);};
 const first=h.app.retryFieldShortcutRecovery(c.request),second=h.app.retryFieldShortcutRecovery(c.request);assert.strictEqual(first,second);
 assert.equal((await first).status,'completed');assert.equal(issued,1);assert.equal(issuedCheck(issuedId,issuedOwner),false,'the call-local check is not reusable');assert.equal(c.releases,3);c.once();
});
test('ST07 an unused previous request completion check cannot be substituted into another genuine public recovery',async()=>{
 const first=await publicRopeRecovery(),retry1=first.h.app.world.travel.retry;first.allow();let oldCheck;
 first.h.app.world.travel.retry=function(id,onAdmitted,onRetired){return Reflect.apply(retry1,this,[id,onAdmitted,current=>{oldCheck=current;}]);};
 assert.equal((await first.h.app.retryFieldShortcutRecovery(first.request)).status,'refused','the first public call did not receive its internal proof');
 const next=await publicRopeRecovery(),retry2=next.h.app.world.travel.retry;next.allow();
 next.h.app.world.travel.retry=function(id,onAdmitted,onRetired){return Reflect.apply(retry2,this,[id,onAdmitted,()=>onRetired(oldCheck)]);};
 assert.equal((await next.h.app.retryFieldShortcutRecovery(next.request)).status,'refused');assert.equal(read(next.h).current,null);next.once();first.once();
});
test('ST08 an arbitrary completed DTO without the authenticated retirement callback never reports completed',async()=>{
 const c=await publicRopeRecovery(),{h}=c,physical=read(h).current;c.allow();h.app.world.travel.retry=async()=>({status:'completed'});
 assert.notEqual((await h.app.retryFieldShortcutRecovery(c.request)).status,'completed');assert.strictEqual(read(h).current,physical);assert.equal(c.releases,2);c.once();
});

test('ST09 native reentry during the final real atomic proof read preserves the successor and refuses completion',async()=>{
 const c=await publicRopeRecovery(),{h}=c,travel=h.app.world.travel,retry=travel.retry,atomic=travel.options.atomic;c.allow();let armed=false,reentered=0;
 travel.options.atomic=prepare=>atomic(()=>{const finish=prepare();if(armed){armed=false;reentered++;h.player.reserveTransfer(3,3,1,8,0);}return finish;});
 travel.retry=function(...args){return Reflect.apply(retry,this,args).then(result=>{armed=result.status==='completed';return result;});};
 assert.equal((await h.app.retryFieldShortcutRecovery(c.request)).status,'refused');assert.equal(reentered,1);assert.equal(h.player.isTransferring(),true);assert.equal(h.player._newX,3);assert.equal(c.releases,3);c.once();
});
test('ST10 the internal unused retirement proof is bound to its exact original request and issued owner',async()=>{
 const c=await publicRopeRecovery(),{h}=c,retry=h.app.world.travel.retry;c.allow();let proof,id,owner;
 h.app.world.travel.retry=function(request,onAdmitted,onRetired){id=request;return Reflect.apply(retry,this,[request,issued=>{owner=issued;onAdmitted(issued);},current=>{proof=current;}]);};
 assert.equal((await h.app.retryFieldShortcutRecovery(c.request)).status,'refused');assert.equal(read(h).current,null);
 assert.equal(proof(id+'-foreign',owner),false);assert.equal(proof(id,{}),false);assert.equal(proof(id,owner),true);assert.equal(proof(id,owner),false);assert.equal(c.releases,3);c.once();
});

// RR-R3: canonical current source identity must be this GameApplication constructor,
// including when a different genuine App has the same generation and ordinary state.
for(const source of ['replacement','missing'])test('SA01 cleanup completed before public await rejects '+source+' actual Application',async()=>{
 const c=await publicRopeRecovery(),{h}=c,retry=h.app.world.travel.retry,replacement=await fixture();c.allow();
 assert.notStrictEqual(replacement.app,h.app);assert.equal(replacement.app.stateGeneration,h.app.stateGeneration);
 let changed=0;const effects=h.effects.slice(),replacementState=clone(replacement.state);
 h.app.world.travel.retry=function(...args){return Reflect.apply(retry,this,args).then(result=>{
  if(result.status==='completed'){changed++;if(source==='replacement')h.root.PSFlow._app=replacement.app;else delete h.root.PSFlow._app;}
  return result;
 });};
 const result=await h.app.retryFieldShortcutRecovery(c.request);
 assert.equal(changed,1);assert.equal(h.app.stateGeneration,0);assert.equal(read(h).current,null);assert.equal(c.releases,3);c.once();assert.equal(h.native.requests.length,1);assert.deepEqual(h.effects,effects);
 assert.deepEqual(replacement.state,replacementState);assert.equal(result.status,'refused');assert.notEqual(result.snapshot.status,'completed');
 assert.equal((await h.app.retryFieldShortcutRecovery(c.request)).status,'refused');assert.equal(c.releases,3);c.once();
});
test('SA02 final atomic prepare reentry replaces App without borrowing an equal generation',async()=>{
 const c=await publicRopeRecovery(),{h}=c,travel=h.app.world.travel,retry=travel.retry,atomic=travel.options.atomic,replacement=await fixture();c.allow();let armed=false,reentered=0;
 travel.options.atomic=prepare=>atomic(()=>{const finish=prepare();if(armed){armed=false;reentered++;h.root.PSFlow._app=replacement.app;}return finish;});
 travel.retry=function(...args){return Reflect.apply(retry,this,args).then(result=>{armed=result.status==='completed';return result;});};
 const result=await h.app.retryFieldShortcutRecovery(c.request);assert.equal(reentered,1);assert.strictEqual(h.root.PSFlow._app,replacement.app);assert.equal(result.status,'refused');assert.equal(read(h).current,null);assert.equal(c.releases,3);c.once();
});
test('SA03 final provider read reentry replaces App and cannot certify the original constructor',async()=>{
 let armed=false,reentered=0,replacement;
 const c=await publicRopeRecovery({onRead(h){if(armed){armed=false;reentered++;h.root.PSFlow._app=replacement.app;}}}),{h}=c,retry=h.app.world.travel.retry;replacement=await fixture();c.allow();
 h.app.world.travel.retry=function(...args){return Reflect.apply(retry,this,args).then(result=>{armed=result.status==='completed';return result;});};
 assert.equal((await h.app.retryFieldShortcutRecovery(c.request)).status,'refused');assert.equal(reentered,1);assert.strictEqual(h.root.PSFlow._app,replacement.app);assert.equal(read(h).current,null);assert.equal(c.releases,3);c.once();
});
for(const source of ['replacement','missing'])test('SA04 initial admission refuses '+source+' Application before any prefix or provider effect',async()=>{
 const h=await fixture(),replacement=await fixture(),before=clone(h.state);assert.equal(h.app.stateGeneration,replacement.app.stateGeneration);
 if(source==='replacement')h.root.PSFlow._app=replacement.app;else delete h.root.PSFlow._app;
 const result=await h.run();assert.equal(result.status,'failed');assert.equal(result.reason,'travel-application-stale');assert.deepEqual(h.state,before);assert.deepEqual(h.effects,[]);assert.deepEqual(h.draws,[]);assert.equal(h.native.requests.length,0);assert.equal(read(h).current,null);
});
for(const source of ['replacement','missing'])test('SA05 release provider '+source+' Application retains original physical proof and cannot return success',async()=>{
 let replacement;
 const c=await publicRopeRecovery({onRecoveryRelease(h){if(source==='replacement')h.root.PSFlow._app=replacement.app;else delete h.root.PSFlow._app;}}),{h}=c;replacement=await fixture();c.allow();const physical=read(h).current;
 assert.notEqual((await h.app.retryFieldShortcutRecovery(c.request)).status,'completed');assert.strictEqual(read(h).current,physical);assert.equal(c.releases,3);c.once();assert.equal(h.native.requests.length,1);
});
test('SA06 equal-generation unrelated App does not reject the still-current original App normal completion',async()=>{
 const c=await publicRopeRecovery(),{h}=c,replacement=await fixture();assert.equal(replacement.app.stateGeneration,h.app.stateGeneration);c.allow();
 const one=h.app.retryFieldShortcutRecovery(c.request),two=h.app.retryFieldShortcutRecovery(c.request);assert.strictEqual(one,two);assert.equal((await one).status,'completed');assert.strictEqual(h.root.PSFlow._app,h.app);assert.equal(read(h).current,null);assert.equal(c.releases,3);c.once();assert.equal(h.native.requests.length,1);
});
test('SA07 wrong request or owner cannot borrow a proof across source replacement and its failed check stays consumed',async()=>{
 const c=await publicRopeRecovery(),{h}=c,retry=h.app.world.travel.retry,replacement=await fixture();c.allow();let proof,id,owner;
 h.app.world.travel.retry=function(request,onAdmitted,onRetired){id=request;return Reflect.apply(retry,this,[request,issued=>{owner=issued;onAdmitted(issued);},current=>{proof=current;}]);};
 assert.equal((await h.app.retryFieldShortcutRecovery(c.request)).status,'refused');assert.equal(read(h).current,null);h.root.PSFlow._app=replacement.app;
 assert.equal(proof(id+'-foreign',owner),false);assert.equal(proof(id,{}),false);assert.equal(proof(id,owner),false);h.root.PSFlow._app=h.app;assert.equal(proof(id,owner),false);assert.equal(c.releases,3);c.once();
});
test('SA08 replaced source before Retry preserves both original physical and the real new App native successor',async()=>{
 const c=await publicRopeRecovery(),{h}=c,replacement=await fixture();const next=await replacement.run();assert.equal(next.status,'awaiting-arrival');const old=read(h).current,newPhysical=read(replacement).current;c.allow();h.root.PSFlow._app=replacement.app;
 const retry=h.app.world.travel.retry,results=[];h.app.world.travel.retry=function(...args){return Reflect.apply(retry,this,args).then(result=>{results.push(result);return result;});};
 assert.equal((await h.app.retryFieldShortcutRecovery(c.request)).status,'failed');assert.equal(results.length,1);assert.equal(results[0].status,'failed');assert.equal(results[0].reason,'travel-application-stale');assert.strictEqual(read(h).current,old);assert.strictEqual(read(replacement).current,newPhysical);assert.equal(replacement.app.isWorldTravelReceipt(replacement.owner,next.receipt),true);assert.equal(c.releases,2);c.once();
});
