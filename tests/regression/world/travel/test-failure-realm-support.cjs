'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {configuredFlyFailure}=require('../../../support/world/travel/fly-failure-injection-support.cjs');
const {associateArrivalBirth,failedArrivalReady,failedArrivalSummary}=require('../../../support/world/travel/phase-observer-support.cjs');
const {observer}=require('../../../support/world/travel/native-consumer-observer.cjs');
assert.equal(process.version,'v22.21.1');
// Ordinary synthetic observations only; no App, native implementation, IIFE,
// runtime binding, business fixture or input qualification is imported here.
function sample(reason='configured-fly-callback-failed'){
 const application={},scene={},map={_mapId:6},data={},player={},registry={},birth={},owner={},receipt={generation:2};
 const current={application,generation:2,scene,map,data,player},physical={lease:{},serial:{},owner,receipt,player,scene,phase:'arrived'};
 const request={id:'synthetic',snapshot:current,status:'fulfilled',value:{status:'awaiting-arrival',receipt}};
 const lifecycle={sequence:1,snapshot:current,physical,registry,birth,birthScene:scene,frame:{map,data,player,mapId:6}};
 const arrival={sequence:2,request,receipt,owner,result:{status:'arrived'},snapshot:current,physical,registry,birth,observation:lifecycle};
 arrival.birthBinding=associateArrivalBirth(arrival,lifecycle);
 return {requestId:request.id,receipt,reason,current,request,arrival,lifecycle,
  finish:{receipt,snapshot:current,status:'fulfilled',value:{status:'failed',reason},sequence:5},lastFrame:{snapshot:current,sequence:6},
  recovery:{status:'failed',phase:'after-arrival',physical:'arrived',reasonCode:'tail-failed',retry:{enabled:true},cancel:{enabled:false}},errors:[]};
}
function syntheticObserver(){
 const s=sample(),o=observer(),calls=[],runPromise=Promise.resolve(s.request.value),finishPromise=Promise.resolve(s.finish.value);
 const app=s.current.application;app.stateGeneration=2;app.world={travel:{recovery(id){calls.push(['recovery',id]);return s.recovery;}}};
 Object.assign(app,{runWorldTravel(){calls.push(['run']);return runPromise;},confirmWorldTravelArrival(){calls.push(['confirm']);return s.arrival.result;},
  finishWorldTravelArrival(){calls.push(['finish']);return finishPromise;},restoreEventCompanionsAtMap(){calls.push(['restore']);return Promise.resolve({status:'completed'});}});
 function SceneMap(){}SceneMap.prototype.update=function(){calls.push(['update']);return 'original-update';};
 const G={PSFlow:{_app:app,companionNativeMapFrame(){calls.push(['frame']);return 'original-frame';}},SceneManager:{_scene:s.current.scene},
  Scene_Map:SceneMap,$gameMap:s.current.map,$dataMap:s.current.data,$gamePlayer:s.current.player,Graphics:{frameCount:1}};
 const life={travelLease:{registry:s.lifecycle.registry,current:s.lifecycle.physical,mapBirth:{birth:s.lifecycle.birth,scene:s.current.scene,frame:s.lifecycle.frame}}};
 const ports={state:{atomicWorldContent(prepare){calls.push(['atomic']);return prepare()({lifecycle:life});}}};
 o.observePorts(ports);o.install(G,app);return {s,o,app,G,ports,calls,runPromise,finishPromise};
}
test('OR01 both configured failures use the consumer realm and retain the thrown object and short reason',()=>{
 const context=vm.createContext({});
 const normalize=vm.runInContext('(error)=>error instanceof Error ? error.message : String(error)',context);
 const RealmError=vm.runInContext('Error',context);
 for(const phase of ['callback','cleanup']){
  const injected=configuredFlyFailure(context,phase);
  assert.equal(injected.reason,'configured-fly-'+phase+'-failed');assert(injected.error instanceof RealmError);
  assert.equal(injected.error instanceof Error,false);assert.equal(normalize(injected.error),injected.reason);
  assert.throws(()=>{throw injected.error;},error=>error===injected.error);
  const s=sample(injected.reason);s.finish.value.reason=normalize(injected.error);assert.equal(failedArrivalReady(s),true);
 }
 assert.throws(()=>configuredFlyFailure(context,'other'),/configured-fly-failure-phase/);
});
test('OR02 original cross-realm Error remains a negative control for the unchanged strict reason oracle',()=>{
 const context=vm.createContext({}),normalize=vm.runInContext('(error)=>error instanceof Error ? error.message : String(error)',context);
 for(const phase of ['callback','cleanup']){
  const expected='configured-fly-'+phase+'-failed',outerError=Error(expected),s=sample(expected);
  assert.equal(normalize(outerError),'Error: '+expected);s.finish.value.reason=normalize(outerError);
  assert.equal(failedArrivalReady(s),false);assert.equal(failedArrivalSummary(s).finish.reasonMatches,false);
 }
});
test('OR03 exact failure guards still refuse wrong reason settlement receipt owner generation and native identity',()=>{
 const mutations={reason:s=>s.finish.value.reason='other',rejected:s=>s.finish.status='rejected',receipt:s=>s.finish.receipt={},
  owner:s=>s.lifecycle.physical={...s.lifecycle.physical,owner:{}},generation:s=>s.current={...s.current,generation:3},
  data:s=>s.current={...s.current,data:{}},registry:s=>s.lifecycle={...s.lifecycle,registry:{}},
  serial:s=>s.lifecycle.physical={...s.lifecycle.physical,serial:{}},birth:s=>s.lifecycle={...s.lifecycle,birth:{}},
  handoff:s=>s.lifecycle={...s.lifecycle,handoff:{}},lateFrame:s=>s.lastFrame={...s.lastFrame,sequence:5},
  request:s=>s.request={...s.request,id:'successor'},recovery:s=>s.recovery={...s.recovery,retry:{enabled:false}}};
 assert.equal(failedArrivalReady(sample()),true);
 for(const [name,mutate]of Object.entries(mutations)){const s=sample();mutate(s);assert.equal(failedArrivalReady(s),false,name);}
});
test('OR04 failure summary contains bounded scalars and booleans even with cyclic retained identities',()=>{
 const s=sample();s.current.application.self=s.current.application;s.arrival.self=s.arrival;s.receipt.self=s.receipt;
 const summary=failedArrivalSummary(s),encoded=JSON.stringify(summary);assert(encoded.length<2600);
 assert.equal(summary.finish.reasonMatches,true);assert.equal(summary.birthBinding.present,true);assert.equal(summary.birthBinding.physical,true);
 assert.equal(summary.conditions.laterFrame,true);assert.equal(summary.conditions.handoffClear,true);assert.equal(summary.recovery.retry,true);
 assert.equal(summary.recovery.cancel,false);assert.equal(summary.errorCount,0);
 s.finish.value.reason='x'.repeat(10000);assert.equal(failedArrivalSummary(s).finish.reason.length,240);
 assert.equal(failedArrivalSummary(null),null);
});
test('OR05 cached diagnostics issue no provider or operation calls and wrappers preserve original results and Promises',async()=>{
 const h=syntheticObserver();assert.equal(h.o.failureStatus(),null);assert.equal(h.calls.length,0);
 assert.strictEqual(h.app.runWorldTravel(h.s.requestId,{}),h.runPromise);await h.runPromise;
 h.ports.state.atomicWorldContent(()=>()=>undefined);
 assert.strictEqual(h.app.confirmWorldTravelArrival(h.s.arrival.owner,h.s.receipt,{}),h.s.arrival.result);
 assert.strictEqual(h.app.finishWorldTravelArrival(h.s.receipt),h.finishPromise);await h.finishPromise;await Promise.resolve();
 assert.equal(Reflect.apply(h.G.Scene_Map.prototype.update,h.s.current.scene,[]),'original-update');
 assert.equal(h.o.failedArrival(h.s.requestId,h.s.receipt,h.s.reason),true);
 const before=h.calls.slice(),rows=h.o.rows.length;const first=h.o.failureStatus(),second=h.o.failureStatus();
 assert.deepEqual(first,second);assert.deepEqual(h.calls,before);assert.equal(h.o.rows.length,rows);
 assert.equal(first.finish.status,'fulfilled');assert.equal(first.finish.reasonMatches,true);
 for(const name of ['run','atomic','confirm','finish','update','recovery'])assert.equal(h.calls.filter(row=>row[0]===name).length,1,name);
 assert.equal(h.calls.filter(row=>row[0]==='restore'||row[0]==='frame').length,0);
});
test('OR06 original synchronous exception objects pass through observation wrappers unchanged',()=>{
 const s=sample(),o=observer(),context=vm.createContext({}),injected=configuredFlyFailure(context,'callback');
 const app={stateGeneration:2,world:{travel:{recovery(){assert.fail('diagnostics must not read recovery');}}},
  runWorldTravel(){throw injected.error;},confirmWorldTravelArrival(){throw injected.error;},finishWorldTravelArrival(){throw injected.error;},restoreEventCompanionsAtMap(){throw injected.error;}};
 function SceneMap(){}SceneMap.prototype.update=()=>undefined;
 const G={PSFlow:{_app:app,companionNativeMapFrame(){}},SceneManager:{_scene:s.current.scene},Scene_Map:SceneMap};o.install(G,app);
 for(const name of ['runWorldTravel','confirmWorldTravelArrival','finishWorldTravelArrival','restoreEventCompanionsAtMap'])
  assert.throws(()=>app[name](s.receipt),error=>error===injected.error,name);
 assert.equal(o.failureStatus(),null);
});
test('OR07 actual test wiring uses one retained realm error and compact failed timeout without loading the fixture',()=>{
 const body=fs.readFileSync(path.join(__dirname,'../../../support/world/test-mz-world-travel-joint.cjs'),'utf8');
 assert.match(body,/injected=configuredFlyFailure\(G,failure\)/);assert.equal((body.match(/throw injected\.error/g)||[]).length,2);
 assert.match(body,/receipt:result\.receipt,reason:injected\.reason/);assert.doesNotMatch(body,/throw Error\('configured-fly-/);
 const fixture=fs.readFileSync(path.join(__dirname,'../../../support/world/travel-mz-world-travel-fixture.cjs'),'utf8');
 assert.match(fixture,/failedArrival:failed\?nativeConsumer\.failureStatus\(\):null/);
 assert.match(fixture,/process\.stderr\.write\('E3_FAILED_ARRIVAL_DIAGNOSTIC_V1 '\+encoded\+'\\n'\)/);
 assert.match(fixture,/failed\?stable&&nativeConsumer\.failedArrival/);
 assert.match(fixture,/:\(!stable\|\|nativeConsumer\.ready\(\)\)/);
});
