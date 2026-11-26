'use strict';
// Full fixed IIFEs and actual Session/Showdown gateway. Render/audio/input are facades;
// real Scene construction/create/controller.begin/onEnd, App/gateway/result/ledger/source remain actual.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
async function loadInputs(){const B=require('./final-production-runtime.cjs').get(),{root,E,T}=B;const {fixture:joint,flush}=require('./battle-defeat-f-native.cjs').createNativeFixture({root,B});return{root,E,T,joint,flush,stage:path.join(root,'js/engine/showdown'),artifactRoot:path.join(process.env.PF_F_BRANCH_ROOT,'battle-observation.json')};}
function install(G,text,name){const a=text.indexOf(name+' = function'),b=text.indexOf('\n};',a);assert(a>=0&&b>a,name);vm.runInContext(text.slice(a,b+4),G,{filename:'event-defeat-actual:'+name});}
// This oracle is for the normal Map scheduler, not the isolated fast mode or a disk write.
function assertBattleSaveSettlement(expectedMap, expectedSaves, settled, idle) {
 assert(Number.isSafeInteger(settled.retiredFrame),'missing post-cover ordinary Map update');
 assert.deepEqual(idle.state,settled.state,'idle frames do not replay settled F state');
 assert.deepEqual(idle.autosaves,settled.autosaves,'idle frames do not repeat an autosave request, executor or terminal');
 assert.equal(idle.saveCount,settled.saveCount,'late native frames do not replay a retired save');
 assert.equal(settled.saveCount,expectedSaves,'exact save facade calls after ordinary settlement');
 assert.deepEqual(settled.autosaves.map(e=>e.kind),expectedSaves?['request','execute','success']:[],
   'one original request, one formal executor, one success, no failure; nontransfer has none');
 for(const e of settled.autosaves) {
  assert.equal(e.mapId,expectedMap,'autosave belongs to the actual returned map');
  assert.equal(e.safe,true,'autosave must not enter before cover and interpreter/operation retirement');
  assert(e.frame>=settled.retiredFrame,'no autosave before the first post-cover ordinary Map update');
 }
}
async function fixture(options={}){
 const {E,T,root,stage,joint,flush,artifactRoot}=await loadInputs();
 const scenes=fs.readFileSync(path.join(root,'js/reactor_scenes.js'),'utf8'),managers=fs.readFileSync(path.join(root,'js/reactor_managers.js'),'utf8');
 const artifact=artifactRoot.replace(/\.json$/,options.withoutF?'-disabled-F.json':options.lateGeneration?'-late-generation.json':options.canLose?'-canLose.json':'.json');
 const observed={factory:'actual createLegacyNoHeldBattleSessionFactory through this synthetic host session port; default Flow artifact',facades:['render/audio/input only','Scene.isReady/start/update presentation; actual initialize/create/controller.open/onEnd retained'],rawReserves:[],Freserves:[],legacyCalls:[],nativeOriginalRequests:[],completions:[],arm:[],wait:[],announcements:[],preparations:[],messages:[],nonTransfers:[],retirements:[],preloads:[],engineRNG:[],worldPrefixAtStart:null};
 const prng=require(path.join(stage,'dist/sim/prng.js')),restore=[],ids=new WeakMap();let nextId=0;
 for(const name of ['Gen5RNG','SodiumRNG']){const p=prng[name].prototype,original=p.next;p.next=function(...args){if(!ids.has(this))ids.set(this,++nextId);const value=Reflect.apply(original,this,args);observed.engineRNG.push({engine:name,instance:ids.get(this),args:[...args],value});return value;};restore.push(()=>p.next=original);}
 let h,ports;const businessDraws=[], autosaves=[];
 let returning=false,battleId,retiredFrame=null,postCoverUpdates=0,mapUpdates=0,activeMapUpdates=0;
 const hasWaiter=G=>{
  for(let node=G.$gameMap?._interpreter,depth=0;node&&depth<100;node=node._childInterpreter,depth++)
   if(node._waitMode==='psBattle'&&node._psBattleId===battleId)return true;
  return false;
 };
 const ordinaryMap=(G,scene)=>G.SceneManager._scene===scene&&scene instanceof G.Scene_Map&&scene.isStarted()&&
    !G.$gamePlayer.isTransferring()&&G.PSFlow.prebattleState()?.phase==='done';
 const retired=(G,scene)=>ordinaryMap(G,scene)&&!hasWaiter(G)&&!G.PSFlow.operationPending();
 const lifecycle=()=>ports.state.atomicWorldContent(()=>s=>({value:s.lifecycle})).travelLease;
 function observeAutosave(G,scene,kind){
  if(returning)autosaves.push({kind,mapId:G.$gameMap.mapId(),frame:G.Graphics.frameCount,safe:!!retired(G,scene)});
 }
 try{h=await joint({connection:false,edit(game,content){
  const fixture=structuredClone(T.fixtureContent);
  for(const name of ['Snorlax','Pidgey'])content.species[name]={...fixture.species[name],abilities:[name==='Snorlax'?'Immunity':'Keen Eye'],gender:'F50',types:[... (name==='Pidgey'?['Normal','Flying']:['Normal'])]};
  for(const name of ['A','B','C','constructor','__proto__','toString'])delete content.species[name].types;
  assert.deepEqual(Object.entries(content.species).filter(([,s])=>s.types).map(([name])=>name),['Snorlax','Pidgey']);
  content.species.Pidgey.learnset={1:['tackle']};content.abilities={...content.abilities,...fixture.abilities};content.moves.tackle={id:'tackle',name:'Tackle',pp:35};
  game.party[0]={...game.party[0],species:'Snorlax',form:0,level:2,exp:E.growth.minExp('slow',2),hp:1,status:'',statusCount:0,item:'',ability:'Immunity',abilityIndex:0,effectiveAbilityIndex:0,nature:'hardy',statNature:null,gender:'M',moves:[{id:'tackle',pp:35,maxpp:35,ppUps:0}]};
  game.money=1000;game.badges=Array(8).fill(false);game.steps=3;game.world.companions=[];game.world.recentCenter={mapId:7,x:2,y:1,direction:4};game.world.healingSpot=null;
  if(options.destination)game.world.recentCenter=null;
  delete content.mapMetadata.maps[6].weather;delete content.mapMetadata.maps[6].healingSpot;
  assert.deepEqual(E.saveSchema.validateGameContent(game,content),[],'valid synthetic source state before real App composition');
 },applicationPorts(p){ports=p;
  // Composition selects a supported real producer before actual GameApplication captures it.
  p.sessions=E.composition.createLegacyNoHeldBattleSessionFactory({content:()=>p.content().content,seed:()=>[1,2,3,4]});
  p.random=n=>{businessDraws.push(n);return n===100?99:0;};
  const preload=p.worldTravel.preload;p.worldTravel.preload=async function(...args){const result=await Reflect.apply(preload,this,args);observed.preloads.push({target:structuredClone(args[1]),result:{...result,handle:result.handle?'actual-opaque-handle':undefined}});return result;};
  const reserve=p.worldTravel.reserve;p.worldTravel.reserve=function(...args){observed.Freserves.push({target:structuredClone(args[1].target),blackout:h?.app.isBlackoutOwner(args[0])});return Reflect.apply(reserve,this,args);};
  const original=p.blackout;
  p.blackout={...original,nonTransferCompleted(...a){
   const before=lifecycle(),claim=before?.sourceHandoff,birth=before?.mapBirth;
   const result=Reflect.apply(original.nonTransferCompleted,original,a);
   const after=lifecycle(),next=after?.mapBirth;
   observed.nonTransfers.push({result,authorized:h.app.isBlackoutNonTransferComplete(a[0],a[1]),
    exactReadySource:!!birth?.frame&&claim?.phase==='ready'&&claim.owner===a[0]&&claim.target===birth,
    noPhysical:before?.current===null&&after?.current===null,
    // Atomic snapshots rematerialize the row after registry publication; compare its native witnesses.
    sameLoadedBirth:!!birth?.frame&&!!next?.frame&&birth.manager===next.manager&&birth.scene===next.scene&&
     birth.birth===next.birth&&birth.queue===next.queue&&birth.frame.map===next.frame.map&&birth.frame.mapId===next.frame.mapId&&
     birth.frame.player===next.frame.player&&birth.frame.data===next.frame.data,
    sourceRetired:after?.sourceHandoff===null});
   return result;
  },retireSource(...a){const result=Reflect.apply(original.retireSource,original,a);observed.retirements.push(result);return result;},async announce(...a){try{const r=await Reflect.apply(original.announce,original,a);observed.announcements.push({kind:a[0],checkpoint:structuredClone(a[1]),result:r});return r;}catch(error){observed.announcements.push({kind:a[0],error:String(error.stack??error)});throw error;}},async prepare(...a){try{const r=await Reflect.apply(original.prepare,original,a);observed.preparations.push(r);return r;}catch(error){observed.preparations.push({error:String(error.stack??error)});throw error;}},armSource(...a){const r=Reflect.apply(original.armSource,original,a);observed.arm.push(r);return r;},async waitSource(...a){const r=await Reflect.apply(original.waitSource,original,a);observed.wait.push(r);return r;},transferCompleted(...a){const r=Reflect.apply(original.transferCompleted,original,a);observed.completions.push({result:r,target:structuredClone(a[1].target)});return r;}};if(options.withoutF)p.blackout=undefined;
 },nativeSetup(n,{maps}){const G=n.G;
  require('../../experiments/step5/5/production-same-source-replay/presentation.cjs').presentation(G);
  G.$dataSystem.switches=['','StartingOver','PostBattleTail','ParallelEnabled','ParallelPulse'];
  G.$dataSystem.variables=Array.from({length:22},(_,id)=>id===21?'BattleResult':'');
  maps[1]=structuredClone(maps[5]);G.$dataMapInfos[1]={id:1,name:'Legacy Home'};
  install(G,scenes,'Scene_Base.prototype.isReady');G.Scene_Message.prototype.isReady=G.Scene_Base.prototype.isReady;G.ImageManager.isReady=()=>true;G.EffectManager.isReady=()=>true;G.FontManager={isReady:()=>true};
  install(G,scenes,'Scene_Map.prototype.isReady');install(G,managers,'DataManager.isMapLoaded');install(G,managers,'DataManager.checkError');G.DataManager._errors=[];G.DataManager._checkStalledDataFiles=()=>{};
  const a=scenes.indexOf('const _reactorSceneMapOnMapLoaded ='),b=scenes.indexOf('// The database sidecar decides',a);assert(a>=0&&b>a);vm.runInContext(scenes.slice(a,b),G,{filename:'actual-event-defeat:Map-overlays'});
  const old=G.SceneManager,cs=managers.indexOf('function SceneManager() {'),ce=managers.indexOf('\n}',cs);vm.runInContext(managers.slice(cs,ce+2),G);Object.defineProperties(G.SceneManager,Object.getOwnPropertyDescriptors(old));
  const parameters=G.PluginManager.parameters;G.PluginManager.parameters=function(name){const p=parameters(name);if(name==='PS_BattleFlow')return{...p,homeMapId:'1',homeX:'1',homeY:'1',homeDirection:'2'};if(name==='PS_World')return{...p,CharacterHome:options.destination==='home'?JSON.stringify({mapId:7,x:1,y:1,direction:8}):options.destination==='missing'?JSON.stringify({mapId:99,x:1,y:1,direction:8}):'',GlobalHome:options.destination==='home'||options.destination==='missing'?JSON.stringify({mapId:5,x:2,y:2,direction:2}):'',TravelDebug:options.destination==='missing'?'true':'false',StartingOverSwitch:'1'};return p;};
  G.PluginManager._commands={};install(G,managers,'PluginManager.registerCommand');install(G,managers,'PluginManager.callCommand');
  const add=G.$gameMessage.add;
  G.$gameMessage.add=function(text){observed.messages.push(text);return Reflect.apply(add,this,[text]);};
  const actualMapUpdate=G.Game_Map.prototype.update;
  G.Game_Map.prototype.update=function(active,...args){
   if(returning){mapUpdates++;if(active)activeMapUpdates++;}
   return Reflect.apply(actualMapUpdate,this,[active,...args]);
  };
  const request=G.Scene_Map.prototype.requestAutosave;G.Scene_Map.prototype.requestAutosave=function(...args){
   observed.nativeOriginalRequests.push({mapId:G.$gameMap.mapId(),args:[...args],blocked:G.PSFlow?._app?.saveBlocked});
   observeAutosave(G,this,'request');return Reflect.apply(request,this,args);
  };
  const reserve=G.Game_Player.prototype.reserveTransfer;G.Game_Player.prototype.reserveTransfer=function(...args){observed.rawReserves.push({args:[...args],stack:new Error('observed raw reserve').stack});return Reflect.apply(reserve,this,args);};
 }});
 const G=h.G,m=G.SceneManager,P=G.Scene_PSBattle.prototype,originals={create:P.create,onEnd:P.onEnd};
 for(const [name,kind]of [['executeAutosave','execute'],['onAutosaveSuccess','success'],['onAutosaveFailure','failure']]){
  const base=G.Scene_Base.prototype[name];assert.equal(typeof base,'function',name+' uses the installed Reactor body');
  G.Scene_Base.prototype[name]=function(...args){observeAutosave(G,this,kind);return Reflect.apply(base,this,args);};
 }
 const update=G.Scene_Map.prototype.update;
 G.Scene_Map.prototype.update=function(...args){
  const afterCover=returning&&ordinaryMap(G,this);
  const result=Reflect.apply(update,this,args);
  if(afterCover){
   postCoverUpdates++;
   if(retired(G,this)&&retiredFrame===null)retiredFrame=G.Graphics.frameCount;
  }
  return result;
 };
 // Presentation lifecycle is a facade; the actual create opens the actual controller/Session.
 P.isReady=function(){return !!this._controller?.ready;};P.start=function(){return G.Scene_MenuBase.prototype.start.call(this);};P.update=function(){};
 const tick=()=>{G.Graphics.frameCount++;if(G.$gameScreen._flashDuration>0)G.$gameScreen._flashDuration--;m.changeScene();m.updateScene();G.Input.trigger.clear();G.Input.repeat.clear();};
 const pump=async(predicate,max=180)=>{for(let i=0;i<max;i++){if(predicate())return;G.$gameMessage.clear();tick();await flush();}throw Error('event defeat pump bounded failure '+JSON.stringify({scene:m._scene?.constructor?.name,map:G.$gameMap.mapId(),pending:h.state().world.pendingReturn,blocked:h.app.saveBlocked,last:h.flow.lastOutcome,F:observed}));};
 m.goto(G.Scene_Map);await pump(()=>m._scene.isStarted()&&!!lifecycle()?.mapBirth?.frame);
 const init=G.PSFlow.initializeBlackoutCompanions();if(init)assert.equal((await init).status,'completed');
 await pump(()=>!h.app.saveBlocked&&!G.PSWorld.pending()&&!G.PSFlow.companionNativePending());
 const legacy=h.flow.returnHome;h.flow.returnHome=function(...args){const result=Reflect.apply(legacy,this,args);observed.legacyCalls.push(structuredClone(result));return result;};
 const args={kind:'wild',foes:'Pidgey:30',battleId:'event-defeat-F',canLose:options.canLose?'true':'false',resultVariable:'21',defaultWeather:'',defaultTerrain:'',battleEnvironment:'',battleTime:'0',battleEffects:'on',expGain:'true',canSwitch:'true'};
 const command=(code,parameters=[])=>({code,indent:0,parameters}),interpreter=G.$gameMap._interpreter;
 let parallel,parallelInterpreter;
 if(options.destination!=='home'){
  // A genuine independent parallel CE remains on the unchanged map across the nontransfer.
  G.$dataCommonEvents[1]={id:1,name:'parallel-proof',switchId:3,trigger:2,list:[command(230,[1]),command(121,[4,4,0]),command(0)]};
  G.$gameSwitches.setValue(3,true);parallel=new G.Game_CommonEvent(1);parallelInterpreter=parallel._interpreter;
  G.$gameMap._commonEvents.push(parallel);
  assert(parallelInterpreter&&!G.$gameSwitches.value(4),'independent CE is enrolled before the battle');
 }
 G.$gameVariables.setValue(21,1);assert.equal(G.$gameVariables.value(21),1,'fixture starts from an old win');
 interpreter.setup([command(122,[21,21,0,0,0]),command(357,['PS_BattleFlow','StartBattle','Start battle',args]),
  command(121,[2,2,0]),command(0)],0);
 assert.equal(interpreter.executeCommand(),true);assert.equal(G.$gameVariables.value(21),0,'the actual source event clears its own result');
 observed.worldPrefixAtStart=[...businessDraws];observed.nativePrefixAtStart=[...h.nativeDraws];
 interpreter.update();
 assert.equal(h.flow._op?.prebattleMode,'default-map','this oracle is bound to the normal Map scheduler');
 battleId=h.flow._op.request.battleId;
 await pump(()=>m._scene?._psBattle&&m._scene._controller?.ready);
 const scene=m._scene,session=scene._session;assert.equal(scene.create,originals.create,'real Scene.create retained');assert.equal(scene.onEnd,originals.onEnd,'real Scene.onEnd retained');
 if(scene._failure){observed.controllerOpeningFailure=String(scene._failure.stack??scene._failure);throw scene._failure;}assert(session&&h.flow._op.session===session,'actual App session published by real begin');
 observed.normalizedRequest=structuredClone(h.flow._op.request);observed.sessionFactoryHandle={class:session.constructor.name,battleId:session.battleId};observed.worldAfterCreate=[...businessDraws];
 for(let i=0;i<4&&!session.finished;i++)await session.chooseMove(1);
 assert.equal(session.finished,true,'real gateway battle ended');observed.actualBattleResult=structuredClone(session.result());assert.equal(observed.actualBattleResult.outcome.kind,'win');assert.equal(observed.actualBattleResult.outcome.winner,'Wild');
 observed.generationBeforeFinish=h.app.stateGeneration;if(options.lateGeneration)h.flow.stateReplaced();
 assert.equal(h.saves.length,0,'no save before ordinary battle settlement');
 assert.equal(observed.nativeOriginalRequests.length,0,'no original request before ordinary battle settlement');
 returning=true;scene.onEnd();await flush();observed.generationAfterFinish=h.app.stateGeneration;observed.lateStale=structuredClone(h.flow.lastStale);
 observed.privateRouting=typeof h.app.isBattleBlackoutRouted==='function'?h.app.isBattleBlackoutRouted(session,session.battleId):null;
 // An app/Map-ready frame can precede delivery of the deferred request. Require a full
 // ordinary update after cover completion and the actual autosave terminal, not a grace delay.
 const expectsTransfer=options.destination==='home',expectedMap=expectsTransfer?7:5,expectedSaves=expectsTransfer?1:0;
 const sample=()=>({retiredFrame,state:structuredClone(h.state()),autosaves:structuredClone(autosaves),saveCount:h.saves.length});
 const settled=()=>retiredFrame!==null&&retired(G,m._scene)&&G.$gameMap.mapId()===expectedMap&&
   h.state().world.pendingReturn===null&&!G.PSFlow.companionNativePending()&&(expectedSaves===0||autosaves.some(e=>e.kind==='success'||e.kind==='failure'));
 try{await pump(settled);}catch(error){
  observed.settlement=sample();
  observed.settlementProgress={frame:G.Graphics.frameCount,phase:G.PSFlow.prebattleState()?.phase,
   postCoverUpdates,mapUpdates,activeMapUpdates,sceneActive:m._scene?.isActive(),ownMapUpdate:Object.hasOwn(G.$gameMap,'update'),
   waiter:hasWaiter(G),flowRunning:G.PSFlow.running,operationPending:G.PSFlow.operationPending(),
   companionPending:G.PSFlow.companionNativePending?.(),authorPending:G.PSFlow.worldAuthorInputPending?.(),
   recoveryPending:G.PSFlow.blackoutLoadPending?.(),applicationRecoveryPending:h.app.blackoutRecoveryPending,
   worldPending:G.PSWorld.pending(),transferring:G.$gamePlayer.isTransferring(),
   interpreterEntries:h.trace.filter(row=>row[0]==='interpreter-enter').length};
  throw error;
 }
 const terminal=sample();observed.settlement=terminal;
 observed.final={party:structuredClone(h.state().party),escapePoint:structuredClone(h.state().world.escapePoint),companions:structuredClone(h.state().world.companions),switch1:G.$gameSwitches.value(1),mapId:G.$gameMap.mapId(),x:G.$gamePlayer.x,y:G.$gamePlayer.y,blocked:h.app.saveBlocked,pending:structuredClone(h.state().world.pendingReturn),money:h.state().money,stats:structuredClone(h.state().stats),appliedBattles:structuredClone(h.state().appliedBattles),outcome:structuredClone(h.flow.lastOutcome),legacyReturn:structuredClone(h.flow.lastReturn),diagnostics:structuredClone(G.PSWorld.diagnostics)};
 observed.worldCompletePrefix=[...businessDraws];observed.nativeCompletePrefix=[...h.nativeDraws];observed.actualSaveExecutorCalls=h.saves.length;observed.saves=h.saves.map(s=>({...s,scene:undefined}));
 for(let i=0;i<12;i++){G.$gameMessage.clear();tick();await flush();}
 observed.idleSettlement=sample();observed.idleFrames=12;
 assertBattleSaveSettlement(expectedMap,expectedSaves,terminal,observed.idleSettlement);
 observed.eventTerminal={result:G.$gameVariables.value(21),tail:G.$gameSwitches.value(2),sourceInterpreterRunning:interpreter.isRunning(),
  companionPending:G.PSFlow.companionNativePending(),stillWaiting:hasWaiter(G)};
 if(parallel)observed.concurrentInterpreter={same:G.$gameMap._commonEvents.includes(parallel)&&parallel._interpreter===parallelInterpreter,
  distinct:parallelInterpreter!==interpreter,pulsed:G.$gameSwitches.value(4)};
 const missingHome=G.PSFlow.translator().t('world.blackout.missingHome');
 observed.playerMissingHomeMessages=observed.messages.filter(text=>text===missingHome).length;
 fs.writeFileSync(artifact,JSON.stringify(observed,null,2)+'\n');
 return{...h,draws:businessDraws,observed,restore(){for(const f of restore)f();}};
 }catch(error){observed.failure=error.stack;fs.writeFileSync(artifact,JSON.stringify(observed,null,2)+'\n');for(const f of restore)f();throw error;}
}
module.exports={fixture,assertBattleSaveSettlement};
