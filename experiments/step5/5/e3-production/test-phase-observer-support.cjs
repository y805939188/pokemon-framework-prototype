'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
assert.equal(process.version,'v22.21.1');
const {associateArrivalBirth,failedArrivalReady,countCharacterUpdates}=require('./phase-observer-support.cjs');
const {observer}=require('./native-consumer-observer.cjs');
function sample(){
 const application={},scene={},map={_mapId:6},data={},player={},registry={},birth={},owner={},receipt={generation:2};
 const current={application,generation:2,scene,map,data,player},physical={lease:{},serial:{},owner,receipt,player,scene,phase:'arrived'};
 const sample={requestId:'actual-request',receipt,reason:'configured-fly-callback-failed',current,
  request:{id:'actual-request',snapshot:current,status:'fulfilled',value:{status:'awaiting-arrival',receipt}},
  arrival:{receipt,owner,result:{status:'arrived'},snapshot:current,physical,registry,birth},
  finish:{receipt,snapshot:current,status:'fulfilled',value:{status:'failed',reason:'configured-fly-callback-failed'},sequence:5},
  lifecycle:{snapshot:current,physical,registry,birth,birthScene:scene,frame:{map,data,player,mapId:6}},
  lastFrame:{snapshot:current,sequence:6},recovery:{status:'failed',phase:'after-arrival',physical:'arrived',reasonCode:'tail-failed',retry:{enabled:true},cancel:{enabled:false}},errors:[]};
 sample.arrival.request=sample.request;sample.arrival.sequence=2;sample.lifecycle.sequence=1;sample.arrival.observation=sample.lifecycle;
 sample.arrival.birthBinding=associateArrivalBirth(sample.arrival,sample.lifecycle);return sample;
}
test('PH01 real failed-arrival observation accepts its retained arrival before successful restore',()=>{
 const s=sample();assert.equal(failedArrivalReady(s),true);
 s.reason=s.finish.value.reason='configured-fly-cleanup-failed';assert.equal(failedArrivalReady(s),true);
});
test('PH02 failure gate requires the actual request receipt and failed finish settlement',()=>{
 for(const mutate of [s=>s.request=null,s=>s.request.status='pending',s=>s.request.value.status='completed',
  s=>s.request.value.receipt={...s.receipt},s=>s.finish.receipt={...s.receipt},s=>s.arrival.receipt={...s.receipt},
  s=>s.finish.status='pending',s=>s.finish.status='rejected',s=>s.finish.value.status='completed',
  s=>s.finish.value.reason='other-error',s=>s.arrival.result.status='refused',s=>s.errors.push('observer-error')]){
  const s=sample();mutate(s);assert.equal(failedArrivalReady(s),false);
 }
});
test('PH03 wrong or stale app generation scene map data player and last frame reject',()=>{
 for(const key of ['application','scene','map','data','player']){
  const s=sample();s.current={...s.current,[key]:{}};assert.equal(failedArrivalReady(s),false,key);
 }
 for(const mutate of [s=>s.current={...s.current,generation:3},s=>s.receipt.generation++,
  s=>s.lastFrame={...s.lastFrame,sequence:5},s=>s.lastFrame={snapshot:{...s.current,scene:{}},sequence:6},
  s=>s.request.id='successor',s=>s.requestId='unknown']){
  const s=sample();mutate(s);assert.equal(failedArrivalReady(s),false);
 }
});
test('PH04 wrong retained owner receipt lease serial registry birth and target reject',()=>{
 for(const key of ['owner','receipt','lease','serial','player','scene']){
  const s=sample();s.lifecycle.physical={...s.lifecycle.physical,[key]:{}};assert.equal(failedArrivalReady(s),false,key);
 }
 for(const mutate of [s=>s.lifecycle.physical=null,s=>s.lifecycle.physical={...s.lifecycle.physical,phase:'reserved'},
  s=>s.lifecycle.registry={},s=>s.lifecycle.birth={},s=>s.lifecycle.birthScene={},s=>s.lifecycle.frame={...s.lifecycle.frame,data:{}},
  s=>s.lifecycle.handoff={},s=>s.lifecycle.frame={...s.lifecycle.frame,mapId:5}]){
  const s=sample();mutate(s);assert.equal(failedArrivalReady(s),false);
 }
});
test('PH05 pending completed unavailable and non-retryable recovery cannot act as failed arrival',()=>{
 for(const mutate of [s=>s.recovery.status='pending',s=>s.recovery.status='completed',s=>s.recovery.status='unavailable',
  s=>s.recovery.phase='awaiting-arrival',s=>s.recovery.physical='reserved',s=>s.recovery.reasonCode='source-changed',
  s=>s.recovery.retry.enabled=false,s=>s.recovery.cancel.enabled=true]){
  const s=sample();mutate(s);assert.equal(failedArrivalReady(s),false);
 }
});
test('PH06 detached old receiver increments once, new receiver does not change old identity count',()=>{
 const old={},other={},parent={children:[]},counts=new Map(),calls=[];
 const original=function(...args){calls.push({receiver:this,args});return 'native-return';};
 const wrapped=countCharacterUpdates(original,counts);
 const assertDetached=fn=>{Reflect.apply(fn,old,['tick']);assert.equal(counts.get(old),1);};
 assertDetached(wrapped);assert.equal(parent.children.length,0);assert.equal(counts.get(old),1);
 assert.equal(Reflect.apply(wrapped,other,['next']),'native-return');assert.equal(counts.get(old),1);assert.equal(counts.get(other),1);
 assert.strictEqual(calls[0].receiver,old);assert.deepEqual(calls[0].args,['tick']);
 // Exact old parent-membership condition is a negative control: the same
 // detached-call assertion must fail, rather than making old stability tautological.
 counts.clear();const oldCounter=function(...args){if(parent.children.some(s=>s._character===this))counts.set(this,(counts.get(this)||0)+1);return Reflect.apply(original,this,args);};
 assert.throws(()=>assertDetached(oldCounter),{code:'ERR_ASSERTION'});
});
test('PH07 transparent receiver wrapper preserves original return and original thrown object',()=>{
 const receiver={},arg={},returned={},error=Error('native-error'),counts=new Map();
 let seen;const normal=countCharacterUpdates(function(...args){seen={receiver:this,args};return returned;},counts);
 assert.strictEqual(Reflect.apply(normal,receiver,[arg]),returned);assert.strictEqual(seen.receiver,receiver);assert.strictEqual(seen.args[0],arg);
 const throwing=countCharacterUpdates(function(){throw error;},counts);assert.throws(()=>Reflect.apply(throwing,receiver,[]),e=>e===error);
 assert.equal(counts.get(receiver),2);
});
function fakeObserver(retry){
 const s=sample(),o=observer(),calls=[],runPromise=Promise.resolve(s.request.value),finishPromise=Promise.resolve(s.finish.value);
 const app=s.current.application;app.stateGeneration=2;app.world={travel:{recovery:id=>{calls.push(['recovery',id]);return s.recovery;}}};
 Object.assign(app,{...(retry?{retryWorldTravel:retry}:{}),runWorldTravel(...args){calls.push(['run',this,args]);return runPromise;},
  confirmWorldTravelArrival(...args){calls.push(['confirm',this,args]);return s.arrival.result;},
  finishWorldTravelArrival(...args){calls.push(['finish',this,args]);return finishPromise;},
  restoreEventCompanionsAtMap(){return Promise.resolve({status:'completed'});}});
 function SceneMap(){}SceneMap.prototype.update=function(){calls.push(['update',this]);return 'map-update-return';};
 const G={PSFlow:{_app:app,companionNativeMapFrame(){return 'frame-return';}},SceneManager:{_scene:s.current.scene},
  Scene_Map:SceneMap,$gameMap:s.current.map,$dataMap:s.current.data,$gamePlayer:s.current.player,Graphics:{frameCount:1}};
 const life={travelLease:{registry:s.lifecycle.registry,current:s.lifecycle.physical,mapBirth:{birth:s.lifecycle.birth,scene:s.current.scene,frame:s.lifecycle.frame}}};
 const ports={state:{worldLifecycle(){return life;},atomicWorldContent(prepare){return prepare()({lifecycle:life});}}};
 o.observePorts(ports);o.install(G,app);return {s,o,G,app,ports,life,calls,runPromise,finishPromise};
}
test('PH08 actual observer uses real calls and exact original Promises without issuing any work',async()=>{
 const h=fakeObserver();assert.equal(h.calls.length,0);
 assert.strictEqual(h.app.runWorldTravel(h.s.requestId,{kind:'fly'}),h.runPromise);await h.runPromise;
 assert.strictEqual(h.ports.state.worldLifecycle(),h.life);
 h.ports.state.atomicWorldContent(()=>()=>undefined);
 assert.strictEqual(h.app.confirmWorldTravelArrival(h.s.arrival.owner,h.s.receipt,{}),h.s.arrival.result);
 assert.strictEqual(h.app.finishWorldTravelArrival(h.s.receipt),h.finishPromise);await h.finishPromise;await Promise.resolve();
 assert.equal(Reflect.apply(h.G.Scene_Map.prototype.update,h.s.current.scene,[]),'map-update-return');
 assert.equal(h.o.failedArrival(h.s.requestId,h.s.receipt,h.s.reason),true);
 assert.equal(h.o.ready(),false,'a failed phase never authenticates successful native idle');
 assert.equal(h.calls.filter(x=>x[0]==='run').length,1);assert.equal(h.calls.filter(x=>x[0]==='confirm').length,1);assert.equal(h.calls.filter(x=>x[0]==='finish').length,1);
 assert.equal(h.o.failedArrival('wrong-request',h.s.receipt,h.s.reason),false);
 assert.equal(h.o.failedArrival(h.s.requestId,{...h.s.receipt},h.s.reason),false);
});
test('PH09 observer rejects a newer observed native lease and changed generation',async()=>{
 const h=fakeObserver();h.app.runWorldTravel(h.s.requestId,{});await h.runPromise;h.ports.state.worldLifecycle();
 h.ports.state.atomicWorldContent(()=>()=>undefined);
 h.app.confirmWorldTravelArrival(h.s.arrival.owner,h.s.receipt,{});h.app.finishWorldTravelArrival(h.s.receipt);await h.finishPromise;await Promise.resolve();
 Reflect.apply(h.G.Scene_Map.prototype.update,h.s.current.scene,[]);
 h.life.travelLease.current={...h.life.travelLease.current,serial:{}};h.ports.state.atomicWorldContent(()=>()=>undefined);
 assert.equal(h.o.failedArrival(h.s.requestId,h.s.receipt,h.s.reason),false);
 h.app.stateGeneration++;assert.equal(h.o.failedArrival(h.s.requestId,h.s.receipt,h.s.reason),false);
});
test('PH10 real fixtures use these shared observers; ordinary and post-retry pumps keep native ready',()=>{
 const dir=__dirname,companion=fs.readFileSync(path.join(dir,'companion-fixture.cjs'),'utf8'),joint=fs.readFileSync(path.join(dir,'../e3-mz-world-travel-fixture.cjs'),'utf8');
 assert.match(companion,/countCharacterUpdates\(character,characterUpdates\)/);assert.doesNotMatch(companion,/children\.some\(s=>s\._character===this\)/);
 assert.match(joint,/failed\?stable&&nativeConsumer\.failedArrival/);
 assert.match(joint,/:\(!stable\|\|nativeConsumer\.ready\(\)\)/);
 const body=fs.readFileSync(path.join(dir,'../test-e3-mz-world-travel-joint.cjs'),'utf8');
 assert.equal((body.match(/await h\.pumpFailedArrival/g)||[]).length,1,'only the existing callback/cleanup loop uses failed checkpoint');
 assert.match(body,/retryWorldTravel\('joint-tail-'\+failure\).*await h\.pump\(\(\)=>retried!==undefined\)/s);
});
test('PH11 successful idle still requires actual completed restore and a later matching frame with no physical lease',async()=>{
 const h=fakeObserver();assert.equal(h.o.ready(),false);
 h.life.travelLease.current=null;
 assert.equal(h.G.PSFlow.companionNativeMapFrame(),'frame-return');
 await h.app.restoreEventCompanionsAtMap(h.s.lifecycle.birth);await Promise.resolve();
 assert.equal(h.o.ready(),false,'restore settlement alone does not replace the Map.update barrier');
 h.ports.state.atomicWorldContent(()=>()=>undefined);
 Reflect.apply(h.G.Scene_Map.prototype.update,h.s.current.scene,[]);
 assert.equal(h.o.ready(),true);
 h.life.travelLease.current=h.s.lifecycle.physical;h.ports.state.atomicWorldContent(()=>()=>undefined);
 assert.equal(h.o.ready(),false,'successful idle must reject retained physical arrivals');
});
require('./test-phase-birth-support.cjs');

test('RO01 retry diagnostics preserve the exact original Promise, fulfillment and receiver without issuing work',async()=>{
 const value={status:'completed'},pending=Promise.resolve(value),calls=[];
 const h=fakeObserver(function(...args){calls.push({receiver:this,args});return pending;});
 assert.equal(h.calls.length,0);const actual=h.app.retryWorldTravel('passive');assert.strictEqual(actual,pending);assert.strictEqual(await actual,value);
 assert.deepEqual(h.o.retryStatus('passive'),{requestId:'passive',settlement:'fulfilled',payloadType:'object',status:null,reason:null});
 assert.strictEqual(calls[0].receiver,h.app);assert.deepEqual(calls[0].args,['passive']);assert.equal(calls.length,1);assert.equal(h.calls.length,0);
 assert.equal(h.o.rows.filter(r=>r.kind==='actual-travel-retry-settled').length,1);
});
test('RO02 rejected retry retains original Error identity and bounded diagnostic reason',async()=>{
 const original=Error('original-retry-error'),pending=Promise.reject(original),h=fakeObserver(()=>pending);
 const actual=h.app.retryWorldTravel('rejected');assert.strictEqual(actual,pending);await assert.rejects(actual,error=>error===original);
 assert.equal(h.o.retryStatus().settlement,'rejected');assert.equal(h.o.retryStatus().reason,null);assert.equal(h.o.retryStatus().payloadType,'object');assert.equal(h.calls.length,0);
});
test('RO03 finite idle diagnostic labels its cached observation and never claims a direct registry read',()=>{
 const h=fakeObserver();h.ports.state.atomicWorldContent(()=>()=>undefined);const before=h.calls.length;
 const first=h.o.idleSummary();assert.equal(first.physicalNull,false);assert.equal(first.registryCurrentDirectlyQueried,false);
 h.life.travelLease.current=null;assert.equal(h.o.idleSummary().physicalNull,false,'unobserved actual changes cannot refresh the cache');
 h.ports.state.atomicWorldContent(()=>()=>undefined);assert.equal(h.o.idleSummary().physicalNull,true);assert.equal(h.calls.length,before);
 assert(JSON.stringify(h.o.idleSummary()).length<1000);assert.equal(h.o.ready(),false,'a diagnostic is never the readiness oracle');
});

test('RO04 arbitrary fulfilled accessors are never read and original value/Promise identities remain',async()=>{
 let getters=0;const original={};for(const key of ['status','reason'])Object.defineProperty(original,key,{get(){getters++;throw Error('getter must remain untouched');}});
 const pending=Promise.resolve(original),h=fakeObserver(()=>pending),actual=h.app.retryWorldTravel('accessors');assert.strictEqual(actual,pending);
 await actual.then(value=>assert.strictEqual(value,original));assert.equal(getters,0);assert.equal(h.o.retryStatus().payloadType,'object');assert.equal(h.o.retryStatus().status,null);assert.equal(h.calls.length,0);
});
test('RO05 fulfilled Proxy is opaque: observer performs zero getter/descriptor/prototype/key traps',async()=>{
 let hooks=0;const original=new Proxy({},{get(){hooks++;return undefined;},getOwnPropertyDescriptor(){hooks++;throw Error('no descriptor reflection');},ownKeys(){hooks++;throw Error('no key enumeration');},getPrototypeOf(){hooks++;throw Error('no prototype reflection');}});
 const pending=Promise.resolve(original);assert.equal(hooks,1,'native Promise resolution itself reads then at the pre-observer API boundary');hooks=0;
 const h=fakeObserver(()=>pending),actual=h.app.retryWorldTravel('proxy');assert.strictEqual(actual,pending);await actual.then(value=>assert.strictEqual(value,original));assert.equal(hooks,0);assert.equal(h.o.retryStatus().payloadType,'object');
});
test('RO06 rejected arbitrary value is never coerced or reflected and retains exact rejection identity',async()=>{
 let hooks=0;const original={};for(const key of ['status','reason','toString','valueOf',Symbol.toPrimitive])Object.defineProperty(original,key,{get(){hooks++;throw Error('no coercion');}});
 const pending=Promise.reject(original),h=fakeObserver(()=>pending),actual=h.app.retryWorldTravel('opaque-rejection');assert.strictEqual(actual,pending);
 await assert.rejects(actual,value=>value===original);assert.equal(hooks,0);assert.equal(h.o.retryStatus().settlement,'rejected');assert.equal(h.o.retryStatus().reason,null);
});
test('RO07 primitive rejection text is bounded without object inspection',async()=>{
 const original='x'.repeat(500),pending=Promise.reject(original),h=fakeObserver(()=>pending),actual=h.app.retryWorldTravel('text-rejection');
 await assert.rejects(actual,value=>value===original);assert.equal(h.o.retryStatus().reason.length,240);assert.equal(h.o.retryStatus().payloadType,'string');
});
