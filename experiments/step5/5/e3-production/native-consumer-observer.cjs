'use strict';
// Observe calls the production consumer already makes. This supplies test-idle
// knowledge only: it issues no lifecycle query, restore, ready, frame or receipt.
const assert=require('node:assert/strict');
const {associateArrivalBirth,failedArrivalReady,failedArrivalSummary,compactFailedArrival}=require('./phase-observer-support.cjs');
function observer(){
 let G,app,sequence=0,lastFrame=null,frameCall=null,lifecycle=null,travelLifecycle=null,restore=null,failedObservation=null,lastRetry=null,observedSnapshot=null;
 let readConnectionSnapshot=null,connectionSnapshotRead=false;
 const travelRequests=new Map(),travelArrivals=new Map(),travelFinishes=new WeakMap(),retrySettlements=new Map(),errors=[];
 const rows=[],phaseRows=[],ids=new WeakMap();let serial=0,phaseDropped=0;
 const own=(value,key)=>value&&Object.getOwnPropertyDescriptor(value,key)?.value;
 const id=value=>value&&(typeof value==='object'||typeof value==='function')?(ids.has(value)?ids.get(value):(ids.set(value,++serial),serial)):value??null;
 const snapshot=()=>observedSnapshot={application:G?.PSFlow?._app,generation:G?.PSFlow?._app?.stateGeneration,manager:G?.SceneManager,content:G?.PSFlow?._content,scene:G?.SceneManager?._scene,map:G?.$gameMap,data:G?.$dataMap,player:G?.$gamePlayer};
 const record=(kind,extra={})=>{const s=snapshot(),row={sequence:++sequence,kind,frame:G?.Graphics?.frameCount,application:id(s.application),generation:s.generation,scene:id(s.scene),map:id(s.map),data:id(s.data),...extra};rows.push(row);
  const cached=travelLifecycle,frame=cached?.frame;
  // Bounded primitive-only trace of calls already made by the real consumer.
  // Own native slots avoid invoking plugin accessors for diagnostic purposes.
  const phase={...row,cacheSequence:cached?.sequence??null,cacheBirth:!!cached?.birth,cacheFrame:!!frame,
   cacheScene:cached?.birthScene===s.scene,cacheMap:!!frame&&frame.map===s.map,cacheData:!!frame&&frame.data===s.data,
   cachePlayer:!!frame&&frame.player===s.player,cacheMapId:!!frame&&frame.mapId===own(s.map,'_mapId'),
   mapLoaded:own(s.scene,'_mapLoaded')===true,started:own(s.scene,'_started')===true,active:own(s.scene,'_active')===true,
   nextScene:!!own(s.manager,'_nextScene')};
  if(phaseRows.length===512){phaseRows.shift();phaseDropped++;}phaseRows.push(phase);return row;};
 const same=(a,b)=>a.application===b.application&&a.generation===b.generation&&a.scene===b.scene&&a.map===b.map&&a.data===b.data&&a.player===b.player;
 const travelObservation=life=>{const lease=life?.travelLease,b=lease?.mapBirth;return {sequence:sequence+1,snapshot:snapshot(),registry:lease?.registry,nativeEpoch:lease?.nativeEpoch,physical:lease?.current,handoff:lease?.sourceHandoff,birth:b?.birth,birthScene:b?.scene,frame:b?.frame};};
 function observePorts(ports){
  const atomic=ports.state.atomicWorldContent;assert.equal(typeof atomic,'function');
  ports.state.atomicWorldContent=function(prepare){return Reflect.apply(atomic,this,[function(...args){const actor=Reflect.apply(prepare,this,args);return function(actual,...rest){
   const life=actual.lifecycle,lease=life?.travelLease,b=lease?.mapBirth;
   lifecycle={sequence:sequence+1,mapId:life.mapId,snapshot:snapshot(),physical:lease?.current,handoff:lease?.sourceHandoff,birth:b?.birth,birthScene:b?.scene,frame:b?.frame};
   travelLifecycle=travelObservation(life);
   for(const arrival of travelArrivals.values())if(!arrival.birthBinding)arrival.birthBinding=associateArrivalBirth(arrival,travelLifecycle);
   record('actual-atomic-consumer',{physical:id(lease?.current),handoff:id(lease?.sourceHandoff),birth:id(b?.birth),birthScene:id(b?.scene),birthMap:id(b?.frame?.map),birthData:id(b?.frame?.data)});
   return Reflect.apply(actor,this,[actual,...rest]);
  };}]);};
  // A single explicit test observation, not a lifecycle publisher. The original
  // adapter installs only when an actor returns next; this actor returns none.
  readConnectionSnapshot=()=>Reflect.apply(ports.state.atomicWorldContent,ports.state,[()=>()=>({value:undefined})]);
 }
 function observeConnectionFacts(ports){
  const host=ports.worldTravel,actual=host?.connectionStepFacts;if(typeof actual!=='function')return;
  host.connectionStepFacts=function(...args){
   const result=Reflect.apply(actual,this,args);record('actual-connection-facts-called');
   // Return the identical Promise. The observation runs before the fixture's
   // existing injected rejection without changing its value or settlement.
   void result.then(()=>{
    record('actual-connection-facts-fulfilled');
    // The fixture's intentional rejection skips the App's normal target atomic
    // read. Observe the genuinely ready native publication once at this same
    // fulfilled facts point; retain the original Promise/value and every guard.
    if(!connectionSnapshotRead){connectionSnapshotRead=true;try{
     assert.equal(typeof readConnectionSnapshot,'function');readConnectionSnapshot();record('observer-connection-snapshot-read');
    }catch(error){errors.push(String(error));record('observer-connection-snapshot-read-failed');}}
   },()=>record('actual-connection-facts-rejected'));
   return result;
  };
 }
 function install(root,application){
  G=root;app=application;
  const watch=(entry,promise,kind)=>{try{void promise.then(value=>{try{entry.status='fulfilled';entry.value=value;entry.snapshot=snapshot();entry.sequence=record(kind,{status:value?.status,receipt:id(entry.receipt)}).sequence;}catch(error){errors.push(String(error));}},error=>{try{entry.status='rejected';entry.error=error;entry.sequence=record(kind,{status:'rejected'}).sequence;}catch(observationError){errors.push(String(observationError));}});}catch(error){errors.push(String(error));}return promise;};
  const observeRun=(target,key)=>{const run=target?.[key];if(typeof run!=='function')return;
   target[key]=function(...args){const result=Reflect.apply(run,this,args),previous=travelRequests.get(args[0]);
    // App.runWorldTravel delegates to this same child. Observe its original
    // Promise once, including the direct child entry used by a real Bag rope.
    if(previous&&previous.promise===result)return result;
    const entry={id:args[0],promise:result,snapshot:snapshot(),status:'pending'};travelRequests.set(entry.id,entry);return watch(entry,result,'actual-travel-run-settled');
   };
  };
  observeRun(app,'runWorldTravel');observeRun(app.world?.travel,'run');
  const confirm=app.confirmWorldTravelArrival;
  app.confirmWorldTravelArrival=function(...args){const result=Reflect.apply(confirm,this,args),request=[...travelRequests.values()].find(entry=>entry.status==='fulfilled'&&entry.value?.receipt===args[1]);const arrival={request,owner:args[0],receipt:args[1],result,snapshot:snapshot(),physical:travelLifecycle?.physical,registry:travelLifecycle?.registry,birth:travelLifecycle?.birth,observation:travelLifecycle,sequence:sequence+1};arrival.birthBinding=associateArrivalBirth(arrival,travelLifecycle);travelArrivals.set(args[1],arrival);record('actual-travel-confirm',{status:result.status,owner:id(args[0]),receipt:id(args[1])});return result;};
  const finish=app.finishWorldTravelArrival;
  app.finishWorldTravelArrival=function(...args){const result=Reflect.apply(finish,this,args),entry={receipt:args[0],snapshot:snapshot(),status:'pending'};travelFinishes.set(args[0],entry);return watch(entry,result,'actual-travel-finish-settled');};
  const retry=app.retryWorldTravel;
  if(typeof retry==='function')app.retryWorldTravel=function(...args){
   const pending=Reflect.apply(retry,this,args),entry={settlement:'pending',payloadType:null,status:null,reason:null};retrySettlements.set(args[0],entry);lastRetry=args[0];
   // Settlement objects are not branded by this test observer. Inspecting even descriptors
   // could invoke Proxy traps; only typeof/null and primitive rejection text are diagnostic.
   void pending.then(value=>{entry.settlement='fulfilled';entry.payloadType=value===null?'null':typeof value;rows.push({sequence:++sequence,kind:'actual-travel-retry-settled',...entry});},
    error=>{entry.settlement='rejected';entry.payloadType=error===null?'null':typeof error;entry.reason=typeof error==='string'?error.slice(0,240):null;rows.push({sequence:++sequence,kind:'actual-travel-retry-settled',...entry});});
   return pending;
  };
  const native=G.PSFlow.companionNativeMapFrame;
  G.PSFlow.companionNativeMapFrame=function(...args){frameCall={snapshot:snapshot(),sequence:sequence+1};record('actual-native-map-frame');return Reflect.apply(native,this,args);};
  for(const key of ['onMapLoaded','isReady']){
   const actual=G.Scene_Map.prototype[key];if(typeof actual!=='function')continue;
   G.Scene_Map.prototype[key]=function(...args){
    record('actual-'+key+'-enter');let result;
    try{result=Reflect.apply(actual,this,args);}catch(error){record('actual-'+key+'-threw');throw error;}
    record('actual-'+key+'-returned',{resultType:typeof result,resultBoolean:typeof result==='boolean'?result:null});return result;
   };
  }
  const update=G.Scene_Map.prototype.update;
  G.Scene_Map.prototype.update=function(...args){const result=Reflect.apply(update,this,args);lastFrame={snapshot:snapshot(),sequence:sequence+1};record('actual-map-update-completed');return result;};
  const actual=app.restoreEventCompanionsAtMap;
  app.restoreEventCompanionsAtMap=function(...args){
   const entry={snapshot:snapshot(),birth:args[0],frameCall,sequence:sequence+1,status:'running'};
   record('actual-restore-call',{birth:id(entry.birth),nativeFrameSequence:entry.frameCall?.sequence??null});
   const result=Reflect.apply(actual,this,args);entry.source=travelLifecycle;restore=entry;
   void result.then(value=>{entry.status=value.status;record('actual-restore-settled',{birth:id(entry.birth),status:value.status});},error=>{entry.status='rejected';record('actual-restore-rejected',{error:String(error)});});
   return result;
  };
 }
 function ready(){
  const current=snapshot(),e=restore,l=lifecycle,f=lastFrame;
  return !!e&&e.status==='completed'&&same(current,e.snapshot)&&!!e.frameCall&&same(e.frameCall.snapshot,e.snapshot)
   &&!!f&&same(f.snapshot,e.snapshot)&&f.sequence>e.sequence
   &&!!l&&same(l.snapshot,e.snapshot)&&l.physical===null&&(l.handoff===null||l.handoff===undefined)
   &&l.birth===e.birth&&l.birthScene===current.scene&&l.frame?.map===current.map&&l.frame?.data===current.data&&l.frame?.player===current.player&&l.frame?.mapId===current.map?._mapId;
 }
 function idleSummary(){
  const current=observedSnapshot,e=restore,l=lifecycle,f=lastFrame,frame=l?.frame;
  return {observationSource:'last-production-consumer-cache',registryCurrentDirectlyQueried:false,
   physicalNull:!!l&&l.physical===null,handoffClear:!!l&&(l.handoff===null||l.handoff===undefined),
   currentBirth:!!l&&!!e&&l.birth===e.birth&&l.birthScene===current?.scene,
   restoreCompleted:!!e&&e.status==='completed',restoreSnapshot:!!e&&!!current&&same(current,e.snapshot),
   nativeFrameIdentity:!!e&&!!e.frameCall&&same(e.frameCall.snapshot,e.snapshot),
   lastFrameIdentity:!!e&&!!f&&same(f.snapshot,e.snapshot),lateFrame:!!e&&!!f&&f.sequence>e.sequence,
   lifecycleSnapshot:!!l&&!!e&&same(l.snapshot,e.snapshot),
   birthFrameIdentity:!!frame&&frame.map===current?.map&&frame.data===current?.data&&frame.player===current?.player&&frame.mapId===l.mapId};
 }
 function failedArrival(requestId,receipt,reason){
  let recovery;try{recovery=app.world.travel.recovery(requestId);}catch(error){errors.push(String(error));}
  failedObservation={requestId,receipt,reason,current:snapshot(),request:travelRequests.get(requestId),
   arrival:travelArrivals.get(receipt),finish:travelFinishes.get(receipt),lifecycle:travelLifecycle,lastFrame,recovery,errors};
  return failedArrivalReady(failedObservation);
 }
 // A cached observation for the F bootstrap assertion only. No extra native query,
 // restore, receipt or frame is produced; ready() retains its existing contract.
 function compactFailureStatus(){
  const summary=compactFailedArrival(failedObservation),targetScene=failedObservation?.current?.scene;
  const kinds=new Set(['actual-atomic-consumer','actual-travel-confirm','actual-travel-finish-settled','actual-connection-facts-called','actual-connection-facts-fulfilled','actual-connection-facts-rejected','actual-isReady-returned','actual-onMapLoaded-returned']);
  const eligible=phaseRows.filter(row=>row.scene===id(targetScene)&&kinds.has(row.kind));
  const keys=['sequence','frame','kind','cacheSequence','cacheBirth','cacheFrame','cacheScene','cacheMap','cacheData','cachePlayer','cacheMapId','status','mapLoaded','started','active','nextScene'];
  const transitions=eligible.slice(-6).map(row=>Object.fromEntries(keys.flatMap(key=>{
   const value=row[key];return typeof value==='string'?[[key,value.slice(0,64)]]:typeof value==='boolean'||value===null||typeof value==='number'&&Number.isFinite(value)?[[key,value]]:[];
  })));
  return {...summary,phase:'failed-arrival',cacheSequence:travelLifecycle?.sequence??null,lastFrameSequence:lastFrame?.sequence??null,
   finishSequence:failedObservation?.finish?.sequence??null,transitions,transitionLimit:6,transitionOmitted:Math.max(0,eligible.length-transitions.length),traceRowsDropped:phaseDropped};
 }
 function bootstrapSource(){
  const e=restore,s=e?.source;
  return e&&s?{status:e.status,...e.snapshot,registry:s.registry,nativeEpoch:s.nativeEpoch,birth:e.birth,
   observedBirth:s.birth,observedScene:s.birthScene,sourceSnapshot:s.snapshot}:null;
 }
 const requestIdForReceipt=receipt=>{const matches=[...travelRequests.values()].filter(entry=>entry.status==='fulfilled'&&entry.value?.status==='awaiting-arrival'&&entry.value.receipt===receipt);return matches.length===1?matches[0].id:null;};
 return {observePorts,observeConnectionFacts,compactFailureStatus,phaseTrace:()=>({limit:512,dropped:phaseDropped,rows:phaseRows.slice()}),install,ready,idleSummary,bootstrapSource,requestIdForReceipt,retryStatus:(requestId=lastRetry)=>{const e=retrySettlements.get(requestId);return e?{requestId:typeof requestId==='string'?requestId.slice(0,128):null,...e}:null;},failedArrival,failureStatus:()=>failedArrivalSummary(failedObservation),rows,status(){return {ready:ready(),restore:restore?{status:restore.status,birth:id(restore.birth),sequence:restore.sequence}:null,lastFrame:lastFrame?.sequence??null,travel:travelLifecycle?{physical:id(travelLifecycle.physical),lease:id(travelLifecycle.physical?.lease),serial:id(travelLifecycle.physical?.serial),owner:id(travelLifecycle.physical?.owner),receipt:id(travelLifecycle.physical?.receipt),phase:travelLifecycle.physical?.phase,birth:id(travelLifecycle.birth)}:null,errors:errors.slice()};}};
}
module.exports={observer};
