'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,flush}=require('./fixture.cjs');
const {ownData,trustedRealms,captureSource,assertSourceUnchanged,observeMapLoads,assertLoadedSource}=require('./data-observer.cjs');
const {singleRequestHold,observeAutosaves}=require('./empty-load-input-support.cjs');
const {observeMethod,readReceipt,trackPromise,sourceWindow,observeCallback,assertLateCompletion}=require('./empty-receipt-input-support.cjs');
const kind=process.env.PF_COLD_CASE_KIND,scope=process.env.PF_COLD_CASE_ROOT;
assert(['P00','E01','E02','E03'].includes(kind));
const copy=value=>structuredClone(value);
test(kind+' actual physical empty-record load retires existing native companions',async()=>{
 const consumer=kind!=='P00';let transport;
 let authoredVisibility,mapLoads,phase='before-fixture',h,appCallObservation,callbackObservation;
 let late,lateOutcome,lateDiagnosticView,lateCall,lateReceipt,lateResult,lateSource,lastLateWait,lateDiagnosticRead=false;
 const sources=sourceWindow();
 try{
 h=await fixture({consumer,mismatch:kind==='E02',globalInfoProfile:'formal-empty-load',sourceReceipt:kind==='E03'?row=>sources.observe(row):undefined,nativeSetup(n){
  // This runs after pinned Game_Followers construction, before the full Flow IIFE.
  const descriptor=Object.getOwnPropertyDescriptor(n.G.Game_Followers.prototype,'isVisible');
  assert(descriptor&&Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='function');
  authoredVisibility=descriptor.value;
  mapLoads=observeMapLoads(n.G,()=>({application:h?.app,generation:h?.app.stateGeneration,map:ownData(n.G,'$gameMap')}));
  transport=singleRequestHold(n.G.XMLHttpRequest);n.G.XMLHttpRequest=transport.XHR;
 }});const G=h.G;phase='fixture-current-native-consumer-settled';
 const write=(name,value)=>fs.writeFileSync(path.join(scope,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 const idle=()=>h.nativeConsumer.ready()&&!h.app.saveBlocked&&!G.PSWorld.pending()&&!G.PSFlow.companionNativePending()&&!G.PSFlow.worldAuthorInputPending();
 await h.pump(idle);
 assert.deepEqual(h.records(),[]);
 assert.equal(h.state().world.pendingReturn,null);
 if(!consumer){
  new G.Game_Interpreter().command216([1]);
  assert.equal(G.$gamePlayer.followers()._visible,false);
  const before=copy(h.state()),draws=h.draws.slice(),nativeDraws=h.nativeDraws.slice();
  G.$gameSystem.onBeforeSave();await G.DataManager.saveGame(1);
  await h.io.globalInfo.waitForSaves(1,flush);
  const globalFile=path.join(h.io.saveRoot,'global.rmmzsave'),physicalGlobal=await G.StorageManager.loadObject('global');
  assert.equal(h.io.globalInfo.boot.status,'ready');assert.equal(h.io.globalInfo.boot.storageLoad.status,'rejected','fresh producer uses native empty-profile fallback');
  assert(physicalGlobal[1],'manual slot1 index exists after its actual asynchronous global write');
  assert.deepEqual(copy(physicalGlobal[1]),copy(G.DataManager._globalInfo[1]));
  assert.equal(physicalGlobal[0],null);assert.equal(physicalGlobal.length,2);
  const file=path.join(h.io.saveRoot,'file1.rmmzsave'),packed=await G.StorageManager.loadObject('file1');
  assert.deepEqual(Object.keys(packed.system._psGame).sort(),['data','encoding','version']);
  assert.equal(packed.system._psGame.encoding,'pokemon-framework-json');assert.equal(packed.system._psGame.version,1);
  const savedState=JSON.parse(packed.system._psGame.data);
  assert.deepEqual(savedState.world.companions,[],'verify actual physical Storage/JsonEx payload');
  assert.deepEqual(savedState,h.state(),'decoded physical snapshot matches the actual current App');
  assert.equal(packed.system._versionId,G.$gameSystem.versionId());assert.equal(packed.system._saveCount,G.$gameSystem._saveCount);
  assert(Number.isSafeInteger(packed.system._saveCount)&&packed.system._saveCount>0);
  assert.equal(packed.player.followers()._visible,false,'saved author visibility is independent of a companion mask');
  assert.deepEqual(h.state(),before);assert.deepEqual(h.draws,draws);assert.deepEqual(h.nativeDraws,nativeDraws);
  assert.equal(packed.map.mapId(),G.$gameMap.mapId(),'physical file carries the actual producer map identity');
  write('P00-input.json',{content:h.content,maps:h.maps,state:copy(savedState),nativeVisible:packed.player.followers()._visible,physicalMapId:packed.map.mapId(),
   fileSHA256:h.io.sha(file),fileBytes:fs.statSync(file).size,gameVersion:G.$gameSystem.versionId(),nativeSaveCount:packed.system._saveCount,
   globalSHA256:h.io.sha(globalFile),globalBytes:fs.statSync(globalFile).size,manualSlotInfo:copy(physicalGlobal[1]),
   source:{application:'actual PSFlow.app',generation:h.app.stateGeneration,map:G.$gameMap.mapId(),birth:h.nativeConsumer.status(),transport:'actual Game_System.onBeforeSave/PS_SaveState/DataManager/SaveLocation/Storage/JsonEx/pako'}});
  h.record('P00-result');write('P00-consumers.json',{kind,rows:h.nativeConsumer.rows});return;
 }
 const file=path.join(h.io.saveRoot,'file1.rmmzsave');
 assert.equal(h.io.sha(file),h.input.fileSHA256,'only this run physical P00 file is accepted');
 assert.deepEqual(h.input.state.world.companions,[]);
 assert.equal(h.io.sha(path.join(h.io.saveRoot,'global.rmmzsave')),h.input.globalSHA256,'native prerequisite reads the same-run P00 physical global');
 assert.equal(h.io.globalInfo.boot.status,'ready');assert.equal(h.io.globalInfo.boot.initial,null);
 assert.equal(h.io.globalInfo.boot.storageLoad.status,'fulfilled','consumer must not accept a failed-global empty fallback');
 assert.strictEqual(G.DataManager._globalInfo,h.io.globalInfo.boot.storageLoad.value);
 assert(G.DataManager._globalInfo[1],'native global loading preserves the existing manual-slot index');
 assert.deepEqual(copy(G.DataManager._globalInfo[1]),h.input.manualSlotInfo,'slot1 is loaded before Scene_Load, not synthesized after autosave');
 const manualBefore=await G.StorageManager.loadObject('file1');
 assert.equal(manualBefore.system._psGame.encoding,'pokemon-framework-json');assert.equal(manualBefore.system._psGame.version,1);
 assert.deepEqual(JSON.parse(manualBefore.system._psGame.data),h.input.state,'pre-load manual file has the full producer framework state');
 assert.equal(manualBefore.system._versionId,h.input.gameVersion);assert.equal(manualBefore.system._saveCount,h.input.nativeSaveCount);
 const oldPlayer=G.$gamePlayer,oldFollowers=oldPlayer.followers(),authorMethod=authoredVisibility,inactiveMaskMethod=oldFollowers.isVisible;
 assert.strictEqual(Object.getPrototypeOf(oldFollowers).isVisible,authorMethod,'captured pinned author prototype remains installed');
 assert.equal(oldFollowers._visible,true);assert.equal(oldFollowers.isVisible(),true,'bootstrap empty surface mask is inactive');
 const oldActorData=oldFollowers._data.slice(),actorIds=oldActorData.map(x=>x._memberIndex);
 const sourceEvents=G.$gameMap._events.slice(),realms=trustedRealms(G);
 const source=captureSource({G,application:h.app,generation:h.app.stateGeneration,map:G.$gameMap,mapId:G.$gameMap.mapId(),eventIds:[1,2],realms});
 assertSourceUnchanged(source,realms);
 for(const eventId of [1,2])assert.equal((await h.command('RegisterEventCompanion',{eventId:String(eventId),name:'preload-'+eventId})).status,'completed');
 const oldSprites=h.visual.parent.children.slice(),oldCharacters=oldSprites.map(s=>s._character);
 assert.equal(oldSprites.length,2);assert.equal(new Set(oldCharacters).size,2);
 assert.equal(oldFollowers._visible,true);assert.equal(oldFollowers.isVisible(),false,'actual native mask installed');
 assert.notStrictEqual(oldFollowers.isVisible,authorMethod);
 assert.strictEqual(oldFollowers.isVisible,inactiveMaskMethod,'same genuine surface wrapper changes only active-mask semantics');
 assert.strictEqual(Object.getPrototypeOf(oldFollowers).isVisible,authorMethod,'registration preserves author hook');
 phase='two-357-native-sprites-active-mask';
 for(const id of [1,2])assert.strictEqual(G.$gameMap._events[id],sourceEvents[id]);
 assert.deepEqual(oldFollowers._data,oldActorData,'companion registration cannot replace actor follower data');
 assert(oldCharacters.every(c=>!oldActorData.includes(c)&&!sourceEvents.includes(c)));
 const autosaves=observeAutosaves(G);
 const before={generation:h.app.stateGeneration,draws:h.draws.slice(),nativeDraws:h.nativeDraws.slice(),saves:h.observed.saves.length,reserves:h.observed.rawReserves.length};
 if(kind==='E03'){
  // A real duplicate author command still performs its normal per-record source read.
  const I=new G.Game_Interpreter();I.setup([{code:357,indent:0,parameters:['PS_World','RegisterEventCompanion','RegisterEventCompanion',{eventId:'1',name:'preload-1'}]},{code:0,indent:0,parameters:[]}],0);
  late=I;const oldRequestScope={application:h.app,generation:before.generation,map:source.map,data:source.data,interpreter:I};
  const current=()=>G.PSFlow._app===oldRequestScope.application&&h.app.stateGeneration===oldRequestScope.generation&&G.$gameMap===oldRequestScope.map&&G.$dataMap===oldRequestScope.data&&late===oldRequestScope.interpreter?oldRequestScope:null;
  sources.arm({identity:oldRequestScope,current,matches:row=>ownData(row.args[0],'originMapId')===source.mapId&&ownData(row.args[0],'originEventId')===1});
  transport.arm({identity:oldRequestScope,current,matches:xhr=>/Map005\.json$/.test(xhr.url)});
  appCallObservation=observeMethod(h.app,'beginEventCompanion',()=>({application:G.PSFlow._app,generation:h.app.stateGeneration,map:ownData(G,'$gameMap'),data:ownData(G,'$dataMap'),interpreter:I}));
  try{assert.equal(I.executeCommand(),true);}finally{appCallObservation.restore();}
  assert.equal(appCallObservation.errors.length,0);assert.equal(appCallObservation.rows.length,1,'the exact old 357 calls the real public App once');
  lateCall=appCallObservation.rows[0];assert.strictEqual(lateCall.receiver,h.app);
  for(const key of ['application','generation','map','data','interpreter'])assert.strictEqual(lateCall.context[key],oldRequestScope[key]);
  assert.equal(lateCall.args.length,1);assert.deepEqual(copy(lateCall.args[0]),{kind:'register',eventId:1,name:'preload-1'});
  lateReceipt=readReceipt(lateCall);lateResult=trackPromise(lateReceipt.promise);
  // App observation is already restored. Source selection stays armed across the
  // actual async preparation until both its original Promise and XHR are captured.
  for(let n=0;n<40&&(!transport.captured()||sources.rows.length!==1);n++)await flush();
  const held=transport.captured();assert(held,'delay a genuine old source XHR, not a fabricated completion');
  assert.strictEqual(held.identity,oldRequestScope);assert.equal(held.released,false);
  assert.equal(h.sourceReceiptErrors.length,0);lateSource=sources.close(held);
  assert.strictEqual(lateSource.row.h.app,h.app);assert(lateSource.row.prepared&&typeof lateSource.row.prepared==='object','opaque prepared value from the real bind');
  assert.equal(lateSource.row.args.length,1);assert.equal(ownData(lateSource.row.args[0],'originMapId'),source.mapId);assert.equal(ownData(lateSource.row.args[0],'originEventId'),1);
  assert.equal(lateResult.status,'pending','the held old call has not completed before formal load');
  callbackObservation=observeCallback(held);
  assert.equal(I.updateWaitMode(),true);
 }
 const loadStart=mapLoads.length;
 const m=G.SceneManager;m.goto(G.Scene_Load);m.changeScene();m.updateScene();assert(m._scene instanceof G.Scene_Load);
 const scene=m._scene,loadSuccess=scene.onLoadSuccess;let successes=0,reloadSource;phase='actual-Scene_Load-executeLoad';
 scene.onLoadSuccess=function(...args){successes++;reloadSource={mapId:G.$gameMap.mapId(),x:G.$gamePlayer.x,y:G.$gamePlayer.y,direction:G.$gamePlayer.direction(),savedVersion:G.$gameSystem.versionId(),currentVersion:G.$dataSystem.versionId};return Reflect.apply(loadSuccess,this,args);};scene.executeLoad(1);
 await h.pump(()=>successes===1&&m._scene instanceof G.Scene_Map&&m._scene._started&&idle());
 assert.equal(h.observed.loads,1);assert.equal(h.app.stateGeneration,before.generation+1);assert.strictEqual(G.PSFlow.app(),h.app);
 // E02's real version reload invokes native onTransferEnd once. It is not an F
 // inherited request; valid, idle ordinary-save gates pass before the first Map.update.
 // The frozen oracle is derived in E23-empty-load-input-oracle.zh.md, not from a run.
 const expectedAutosaves=kind==='E02'?1:0;
 assert.equal(reloadSource.savedVersion,h.input.gameVersion);
 assert.equal(reloadSource.savedVersion!==reloadSource.currentVersion,kind==='E02');
 if(expectedAutosaves){
  await h.pump(()=>autosaves.attempts.length===1&&autosaves.attempts[0].status==='fulfilled');
  const physical=await G.StorageManager.loadObject('file0');
  assert.equal(physical.system._psGame.encoding,'pokemon-framework-json');
  assert.deepEqual(JSON.parse(physical.system._psGame.data),h.input.state,'actual successful file0 contains the unchanged full framework state');
  assert.equal(physical.system._versionId,reloadSource.currentVersion);
  assert.equal(physical.system._saveCount,autosaves.executions[0].before.saveCount+1);
  assert.equal(G.PSState.lastSave.savefileId,0);assert.equal(G.PSState.lastSaveError,null);
  assert.equal(autosaves.executions[0].before.saveCount,h.input.nativeSaveCount);
  assert.equal(autosaves.executions[0].before.version,h.input.gameVersion);
  assert.equal(physical.system._saveCount,h.input.nativeSaveCount+1);
  await h.io.globalInfo.waitForSaves(1,flush);
  const physicalGlobal=await G.StorageManager.loadObject('global');
  assert(physicalGlobal[0],'ordinary version-reload autosave has a physical slot0 index');
  assert(physicalGlobal[1],'manual slot1 index survives the ordinary slot0 rewrite');
  assert.equal(physicalGlobal.length,2);assert.deepEqual(Object.keys(physicalGlobal),['0','1']);
  assert.deepEqual(copy(physicalGlobal[0]),copy(G.DataManager._globalInfo[0]));
  assert.deepEqual(copy(physicalGlobal[1]),h.input.manualSlotInfo);
  assert.deepEqual(copy(G.DataManager._globalInfo[1]),h.input.manualSlotInfo);
  assert.equal(h.io.sha(file),h.input.fileSHA256,'slot0 autosave leaves the same-run manual file byte-identical');
  const manualAfter=await G.StorageManager.loadObject('file1');
  assert.equal(manualAfter.system._psGame.encoding,'pokemon-framework-json');assert.equal(manualAfter.system._psGame.version,1);
  assert.deepEqual(JSON.parse(manualAfter.system._psGame.data),h.input.state);
  assert.equal(manualAfter.system._versionId,h.input.gameVersion);assert.equal(manualAfter.system._saveCount,h.input.nativeSaveCount);
  write('E02-global-index-result.json',{boundary:'controlled native loadGlobalInfo/isGlobalInfoLoaded prerequisite; not full Boot or cold Continue',
   initial:h.io.globalInfo.boot.initial,nativeStorageRead:h.io.globalInfo.boot.storageLoad.status,
   globalWrites:h.io.globalInfo.saves.map(row=>({args:[row.args[0]],status:row.status})),indices:Object.keys(physicalGlobal),
   manualSlotInfo:copy(physicalGlobal[1]),globalSHA256:h.io.sha(path.join(h.io.saveRoot,'global.rmmzsave')),file1SHA256:h.io.sha(file),
   native:{manualVersion:manualAfter.system._versionId,manualSaveCount:manualAfter.system._saveCount,autosaveVersion:physical.system._versionId,autosaveSaveCount:physical.system._saveCount},
   completeFrameworkEqual:true,manualFileUnchanged:true});
 }
 function cleared(){
  assert.deepEqual(h.records(),[]);assert.equal(h.state().world.pendingReturn,null);
  assert.equal(h.visual.parent.children.length,0,'current native owned sprite/character projection empty');
  assert.equal(oldCharacters.filter(c=>c.isMoving()||c.isJumping()).length,0,'old native owned motions idle after actual retirement');
  assert(oldSprites.every(s=>s.destroyed&&s.parent===null),'all old owned native sprites detached and destroyed');
  assert.strictEqual(oldFollowers.isVisible,authorMethod,'old surface mask is detached without overriding author method');
  assert.equal(Object.hasOwn(oldFollowers,'isVisible'),false);
  assert.strictEqual(Object.getPrototypeOf(G.$gamePlayer.followers()).isVisible,authorMethod,'formal load preserves same author prototype hook');
  assert.equal(G.$gamePlayer.followers().isVisible(),authorMethod.call(G.$gamePlayer.followers()),'loaded surface mask is inactive');
  assert.equal(G.$gamePlayer.followers()._visible,h.input.nativeVisible);
  assert.equal(G.$gamePlayer.followers().isVisible(),h.input.nativeVisible);
  assert.deepEqual(oldFollowers._data,oldActorData);assert.deepEqual(G.$gamePlayer.followers()._data.map(x=>x._memberIndex),actorIds);
  // Old Game_Event.event() looks up the current global $dataMap. Preserve and
  // compare the actual old data reference, then check current XHR data separately.
  assertSourceUnchanged(source,realms);
  assertLoadedSource({G,application:h.app,generation:h.app.stateGeneration,physicalMapId:h.input.physicalMapId,
   producer:h.input,source,loads:mapLoads,loadStart,realms});
  assert.deepEqual(h.state(),h.input.state,'ordinary empty load does not create F, steps, weather, stats, visits or another write');
  assert.deepEqual(h.draws,before.draws);assert.deepEqual(h.nativeDraws,before.nativeDraws);
  assert.deepEqual(h.observed.rawReserves.slice(before.reserves).map(r=>r[0]),kind==='E02'?[5]:[],'only genuine reloadMapIfUpdated raw201');
  if(kind==='E02'){
   assert.deepEqual(h.observed.rawReserves.slice(before.reserves),[[reloadSource.mapId,reloadSource.x,reloadSource.y,reloadSource.direction,0]],'the one real version reload reservation preserves native arguments');
   assert.equal(h.observed.saves.length,before.saves+1,'one valid ordinary version-reload autosave reaches DataManager once');
  }else assert.equal(h.observed.saves.length,before.saves,'ordinary empty load does not invent an autosave request');
  assert.equal(autosaves.requests.length,expectedAutosaves,'native request count is distinct from a DataManager attempt');
  assert.equal(autosaves.executions.length,expectedAutosaves,'formal gates pass only the one ordinary E02 request');
  assert.equal(autosaves.attempts.length,expectedAutosaves);
  for(const row of autosaves.requests){assert.strictEqual(row.receiver,m._scene);assert.deepEqual(row.args,[]);assert.equal(row.error,undefined);}
  for(const row of autosaves.executions){assert.strictEqual(row.receiver,m._scene);assert.deepEqual(row.args,[]);assert.equal(row.after.saveCount,row.before.saveCount+1);assert.equal(row.after.version,reloadSource.currentVersion);assert.equal(row.error,undefined);}
  for(const row of autosaves.attempts){assert.strictEqual(row.receiver,G.DataManager);assert.deepEqual(row.args,[0]);assert.equal(row.status,'fulfilled');assert.equal(row.value,0);assert.equal(row.error,undefined);}
 }
 cleared();phase='formal-load-current-generation-cleared';
 // A hidden saved intent alone cannot distinguish an inactive mask. Use real216
 // to prove the current mask allows the author to show, then restore file intent.
 new G.Game_Interpreter().command216([0]);h.tick();await flush();
 assert.equal(G.$gamePlayer.followers()._visible,true);assert.equal(G.$gamePlayer.followers().isVisible(),true);
 new G.Game_Interpreter().command216([h.input.nativeVisible?0:1]);h.tick();await flush();cleared();
 const oldUpdateCounts=oldCharacters.map(c=>h.characterUpdates.get(c)||0);
 if(late){
  const token=h.app.beginManagement();assert.equal(typeof token,'string');
  const held=transport.captured();assert(held&&!held.released);transport.release(held.xhr,held.sequence);assert.equal(held.released,true);
  for(let n=0;n<40;n++){await flush();lastLateWait=late.updateWaitMode();if(lateResult.status!=='pending'&&lateSource.settlement.status!=='pending'&&callbackObservation.returned===1)break;}
  lateDiagnosticView=late._psWorldAuthorOutcome;lateDiagnosticRead=true; // Latest publication is diagnostic, never the old receipt.
  assert.equal(h.sourceReceiptErrors.length,0);
  assertLateCompletion({call:lateCall,receipt:lateReceipt,result:lateResult,source:lateSource,held,callback:callbackObservation});
  assert.equal(lastLateWait,false);lateOutcome=lateResult.value;
  assert.equal(callbackObservation.restore(),true);assert.equal(callbackObservation.errors.length,0);
  assert.doesNotThrow(()=>h.app.managementSnapshot(token),'late failure cannot revoke legal current successor');
  cleared();assert.equal(h.app.endManagement(token).status,'unchanged');
 }
 for(let n=0;n<8;n++){h.tick();await flush();cleared();}
 const oldUpdateCountsAfter=oldCharacters.map(c=>h.characterUpdates.get(c)||0);
 assert.deepEqual(oldUpdateCountsAfter,oldUpdateCounts,'retired owned characters/motions never resume native updates');
 assert.equal(h.observed.restores.filter(r=>r.status==='completed').length,1,'genuine current birth restore completed once');
 // Calibrate the same installed native wrapper after the unchanged eight-frame
 // stability window. Intentional calls below are separate from host-driven updates.
 assert(oldSprites.every(s=>s.parent===null),'the old counter must still count detached native receivers');
 const counterState=copy(h.state()),counterDraws=h.draws.slice(),counterNativeDraws=h.nativeDraws.slice();
 const update=G.Game_Character.prototype.update,newCharacter=new G.Game_Character();
 Reflect.apply(update,oldCharacters[0],[]);
 assert.equal(h.characterUpdates.get(oldCharacters[0]),oldUpdateCountsAfter[0]+1,'one forced detached old native update must be observed');
 Reflect.apply(update,newCharacter,[]);
 assert.equal(h.characterUpdates.get(newCharacter),1,'a new native receiver has its separate identity count');
 const calibratedOldCounts=oldCharacters.map(c=>h.characterUpdates.get(c)||0);
 assert.deepEqual(calibratedOldCounts,oldUpdateCountsAfter.map((count,index)=>count+(index===0?1:0)),'new native receiver must not increment any old identity');
 assert.deepEqual(h.state(),counterState);assert.deepEqual(h.draws,counterDraws);assert.deepEqual(h.nativeDraws,counterNativeDraws);cleared();
 write(kind+'-result.json',{kind,status:'PASS_SCOPED_FORMAL_EMPTY_NATIVE',before,after:h.snapshot(),
  nativeRetirement:{oldSprites:oldSprites.length,destroyed:oldSprites.filter(s=>s.destroyed).length,currentOwnedSprites:h.visual.parent.children.length,
   currentOwnedCharacters:h.visual.parent.children.map(s=>s._character).length,oldNativeUpdatesStable:oldUpdateCountsAfter.every((count,index)=>count===oldUpdateCounts[index]),
   oldUpdateCountsBefore:oldUpdateCounts,oldUpdateCountsAfter,counterCalibration:{oldAfter:calibratedOldCounts,newReceiverCount:h.characterUpdates.get(newCharacter),forcedOldCalls:1,forcedNewCalls:1},maskDetached:true,
   motionObservation:'no owned character updates after actual disposal; private host motion Map is not exposed'},
  sourceObservation:{oldMapId:source.mapId,oldGeneration:source.generation,currentMapId:h.input.physicalMapId,currentGeneration:h.app.stateGeneration,
   oldDataReferenceUnchanged:true,currentDataFromSameRunXHR:true,oldEvents:source.rows.map(row=>({eventId:row.eventId,snapshot:row.before}))},
  late:{held:transport.captured()?[{url:transport.captured().url,sequence:transport.captured().sequence}]:[],released:transport.captured()?.released?1:0,outcome:lateOutcome??null,
   oracle:late?{input:'explicit original-receipt/source/callback oracle, not passive diagnosis',appCalls:appCallObservation.rows.length,originalReceiptIdentity:true,originalHandleIdentity:true,originalResultPromiseIdentity:true,
    resultStatus:lateResult.status,sourceStatus:lateSource.settlement.status,sourceError:lateSource.settlement.status==='rejected'?String(lateSource.settlement.error):null,
    callbackEntered:callbackObservation.entered,callbackReturned:callbackObservation.returned,lastWait:lastLateWait,getterDiagnostic:{read:lateDiagnosticRead,type:typeof lateDiagnosticView,value:lateDiagnosticView??null},callbackRestored:true}:null},autosave:{expected:expectedAutosaves,nativeRequests:autosaves.requests.length,executions:autosaves.executions.length,dataManagerAttempts:autosaves.attempts.map(row=>({args:row.args,status:row.status,value:row.value})),nativeSystem:autosaves.executions.map(row=>({saveCountBefore:row.before.saveCount,saveCountAfter:row.after.saveCount,versionBefore:row.before.version,versionAfter:row.after.version})),physicalFile0:expectedAutosaves===1},consumerTrace:h.nativeConsumer.rows});
 h.io.assertPaths();phase='completed';
 }finally{sources.stop();appCallObservation?.restore();callbackObservation?.restore();if(h)fs.writeFileSync(path.join(scope,'LAST-OBSERVATION.json'),JSON.stringify({kind,phase,snapshot:h.snapshot(),nativeConsumer:h.nativeConsumer.rows,
  lateOracle:late?{appCalls:appCallObservation?.rows.length??0,appCallStatuses:appCallObservation?.rows.map(row=>({status:row.status,error:row.status==='threw'?String(row.error):null}))??[],appObserverErrors:appCallObservation?.errors.map(String)??[],sourceReceiptErrors:h.sourceReceiptErrors.map(String),
   resultStatus:lateResult?.status??'NOT_CAPTURED',result:lateResult?.status==='fulfilled'?lateResult.value:null,resultError:lateResult?.status==='rejected'?String(lateResult.error):null,
   sourceStatus:lateSource?.settlement.status??'NOT_CAPTURED',sourceError:lateSource?.settlement.status==='rejected'?String(lateSource.settlement.error):null,
   sourceSelections:sources.rows.map(selected=>({callStatus:selected.row.status,error:selected.row.status==='threw'?String(selected.row.error):null,settlement:selected.settlement?.status??'NO_PROMISE'})),
   callbackEntered:callbackObservation?.entered??0,callbackReturned:callbackObservation?.returned??0,callbackThrew:callbackObservation?.threw??0,callbackErrors:callbackObservation?.errors.map(String)??[],
   getterDiagnostic:{read:lateDiagnosticRead,type:lateDiagnosticRead?typeof lateDiagnosticView:'NOT_READ',value:lateDiagnosticView??null},lastWait:lastLateWait??null}:null},null,2)+'\n',{flag:'wx'});}
});
