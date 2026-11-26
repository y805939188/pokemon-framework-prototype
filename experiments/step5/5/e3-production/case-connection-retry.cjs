'use strict';
const assert=require('node:assert/strict');
const {ordinaryObservers}=require('../e3-mz-world-travel-fixture.cjs');
module.exports=async function actualConnectionRetry(t){
 const {fixture,expectOrdinary,endObservation}=ordinaryObservers();t.after(endObservation);
 let fail=true,facts=0;const requestId='actual-facts-retry',reason='actual-target-facts-failed';
 const h=await fixture({connection:true,applicationPorts(ports){const host=ports.worldTravel;assert(host);const original=host.connectionStepFacts;assert.equal(typeof original,'function');ports.worldTravel={...host,connectionStepFacts(...args){facts++;return Promise.resolve(Reflect.apply(original,host,args)).then(value=>{if(fail)throw Error('actual-target-facts-failed');return value;});}};}}),G=h.G;
 let first;G.PSFlow.runWorldTravel(requestId,{kind:'connection'}).then(value=>{first=value;});await h.pump(()=>first!==undefined);assert.equal(first.status,'awaiting-arrival');await h.pumpFailedArrival(()=>!h.app.saveBlocked&&!G.PSWorld.pending(),{requestId,receipt:first.receipt,reason});
 assert.equal(h.nativeConsumer.ready(),false,'retained target-facts failure is not successful native idle');
 assert.equal(h.nativeConsumer.failedArrival(requestId,first.receipt,reason),true);
 assert.equal(h.nativeConsumer.failedArrival(requestId+'-wrong',first.receipt,reason),false);
 assert.equal(h.nativeConsumer.failedArrival(requestId,{...first.receipt},reason),false);
 assert.equal(h.nativeConsumer.failedArrival(requestId,first.receipt,reason+'-wrong'),false);
 assert.equal(h.nativeConsumer.failedArrival(requestId,first.receipt,reason),true,'read-only counterchecks preserve the current failure');
 const failed=await h.app.finishWorldTravelArrival(first.receipt);assert.equal(failed.status,'failed');assert.match(failed.reason,/actual-target-facts-failed/);assert.equal(h.state().steps,0);assert.equal(h.arrivals(),0);assert.equal(h.saves.length,0);assert.equal(G.SceneManager._scene._started,true);assert.deepEqual([G.$gameMap.mapId(),h.player.x,h.player.y],[6,0,2]);assert.equal(h.trace.filter(row=>row[0]==='native-reserve').length,1);expectOrdinary(h,[100]);
 fail=false;let recovered;const pending=h.app.retryWorldTravel('actual-facts-retry').then(value=>{recovered=value;
  // Preserve the already-returned result before the original idle barrier. This
  // adds no state/provider query and never replaces the returned value/throw.
  try{
   const data=(object,key)=>{if(object===null||typeof object!=='object')return undefined;const d=Object.getOwnPropertyDescriptor(object,key);return d&&Object.hasOwn(d,'value')?d.value:undefined;};
   const text=value=>typeof value==='string'?value.slice(0,160):null;
   const step=data(value,'step'),prefix=data(step,'prefix'),status=data(value,'status'),committed=data(prefix,'stepCommitted');
   process.stderr.write('E3_CONNECTION_RETRY_RESULT_V1 '+JSON.stringify({phase:'retry-settled-before-idle',status:text(status),statusObserved:typeof status==='string',reason:text(data(value,'reason')),stepStatus:text(data(step,'status')),stepCommitted:typeof committed==='boolean'?committed:null})+'\n');
  }catch{ /* Diagnostic I/O must not replace the original result or assertion. */ }
  return value;});await h.pump(()=>recovered!==undefined);const result=await pending;assert.equal(result.status,'completed');assert.equal(result.step.prefix.stepCommitted,true);await h.pump(()=>!h.app.saveBlocked&&!G.PSWorld.pending()&&h.saves.length===1);assert.equal(h.state().steps,1);assert.equal(h.arrivals(),1);assert.equal(h.stepCalls.length,1);assert.equal(h.trace.filter(row=>row[0]==='native-reserve').length,1);assert.equal(facts,2);expectOrdinary(h,[100]);assert.equal(h.sessions.length,0);assert.equal((await h.app.runWorldTravel('actual-facts-retry',{kind:'connection'})).status,'completed');assert.equal(h.state().steps,1);assert.equal(h.arrivals(),1);assert.equal(h.saves.length,1);
};
