'use strict';
// Full fixed IIFEs and actual Session/Showdown gateway. Render/audio/input are facades;
// real Scene construction/create/controller.begin/onEnd, App/gateway/result/ledger/source remain actual.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const out=process.env.PF_E3_JOINT_OUT,root=process.env.PF_E3_NATIVE_ROOT,artifactRoot=process.env.PF_EVENT_ARTIFACT;
assert(out&&root&&artifactRoot,'explicit fixed private runtime/native/artifact required');
const E=require(path.join(out,'production.cjs')),T=require('../../../../scripts/tests/final-production-runtime.cjs').get().T;
require('../blackout-formal-load-joint/bootstrap.cjs'); // fixed production boot, no forged loadSucceeded
const {fixture:joint,flush}=require('../e3-mz-world-travel-fixture.cjs');
const scenes=fs.readFileSync(path.join(root,'js/reactor_scenes.js'),'utf8'),managers=fs.readFileSync(path.join(root,'js/reactor_managers.js'),'utf8');
function install(G,text,name){const a=text.indexOf(name+' = function'),b=text.indexOf('\n};',a);assert(a>=0&&b>a,name);vm.runInContext(text.slice(a,b+4),G,{filename:'event-defeat-actual:'+name});}
async function fixture(options={}){
 const artifact=artifactRoot.replace(/\.json$/,options.withoutF?'-disabled-F.json':options.lateGeneration?'-late-generation.json':'.json');
 const observed={factory:'actual createLegacyNoHeldBattleSessionFactory through this synthetic host session port; default Flow artifact',facades:['render/audio/input only','Scene.isReady/start/update presentation; actual initialize/create/controller.open/onEnd retained'],rawReserves:[],Freserves:[],legacyCalls:[],nativeOriginalRequests:[],completions:[],arm:[],wait:[],announcements:[],preparations:[],messages:[],engineRNG:[],worldPrefixAtStart:null};
 const ordinaryDefeat=!options.withoutF&&!options.canLose&&!options.lateGeneration;
 let sourceInterpreter,targetScene,targetMap,observing=false,inTargetUpdate=false;
 let targetMapUpdates=0,targetInterpreterUpdates=0,routeDropped=0,retired=false;
 const route=[];
 const exactTarget=(G,map)=>!!targetScene&&map===targetMap&&G.$gameMap===map&&G.SceneManager._scene===targetScene;
 const note=(G,kind,scene,detail={})=>{
  if(!observing)return;
  if(route.length>=24){routeDropped++;return;}
  route.push({kind,frame:G.Graphics.frameCount,mapId:G.$gameMap.mapId(),currentScene:G.SceneManager._scene===scene,
   sceneActive:scene?._active===true,onTailTarget:scene===targetScene&&exactTarget(G,G.$gameMap),
   prebattle:G.PSFlow.prebattleState()?.phase??null,appBlocked:G.PSFlow._app.saveBlocked,
   interpreterRunning:sourceInterpreter.isRunning(),interpreterWait:sourceInterpreter._waitMode,
   sameInterpreter:G.$gameMap._interpreter===sourceInterpreter,...detail});
 };
 observed.autosaveRoute=route;
 const stage=path.resolve(out,'../showdown'),prng=require(path.join(stage,'dist/sim/prng.js')),restore=[],ids=new WeakMap();let nextId=0;
 for(const name of ['Gen5RNG','SodiumRNG']){const p=prng[name].prototype,original=p.next;p.next=function(...args){if(!ids.has(this))ids.set(this,++nextId);const value=Reflect.apply(original,this,args);observed.engineRNG.push({engine:name,instance:ids.get(this),args:[...args],value});return value;};restore.push(()=>p.next=original);}
 let h,ports;const businessDraws=[];
 try{h=await joint({connection:false,edit(game,content){
  const fixture=structuredClone(T.fixtureContent);
  for(const name of ['Snorlax','Pidgey'])content.species[name]={...fixture.species[name],abilities:[name==='Snorlax'?'Immunity':'Keen Eye'],gender:'F50',types:[... (name==='Pidgey'?['Normal','Flying']:['Normal'])]};
  for(const name of ['A','B','C','constructor','__proto__','toString'])delete content.species[name].types;
  assert.deepEqual(Object.entries(content.species).filter(([,s])=>s.types).map(([name])=>name),['Snorlax','Pidgey']);
  content.species.Pidgey.learnset={1:['tackle']};content.abilities={...content.abilities,...fixture.abilities};content.moves.tackle={id:'tackle',name:'Tackle',pp:35};
  game.party[0]={...game.party[0],species:'Snorlax',form:0,level:2,exp:E.growth.minExp('slow',2),hp:1,status:'',statusCount:0,item:'',ability:'Immunity',abilityIndex:0,effectiveAbilityIndex:0,nature:'hardy',statNature:null,gender:'M',moves:[{id:'tackle',pp:35,maxpp:35,ppUps:0}]};
  game.money=1000;game.badges=Array(8).fill(false);game.steps=3;game.world.companions=[];game.world.recentCenter={mapId:7,x:2,y:1,direction:4};game.world.healingSpot=null;
  delete content.mapMetadata.maps[6].weather;delete content.mapMetadata.maps[6].healingSpot;
  assert.deepEqual(E.saveSchema.validateGameContent(game,content),[],'valid synthetic source state before real App composition');
 },applicationPorts(p){ports=p;
  // Composition selects a supported real producer before actual GameApplication captures it.
  p.sessions=E.composition.createLegacyNoHeldBattleSessionFactory({content:()=>p.content().content,seed:()=>[1,2,3,4]});
  p.random=n=>{businessDraws.push(n);return n===100?99:0;};
  const reserve=p.worldTravel.reserve;p.worldTravel.reserve=function(...args){observed.Freserves.push({target:structuredClone(args[1].target),blackout:h?.app.isBlackoutOwner(args[0])});return Reflect.apply(reserve,this,args);};
  const original=p.blackout;
  p.blackout={...original,async announce(...a){try{const r=await Reflect.apply(original.announce,original,a);observed.announcements.push({kind:a[0],result:r});return r;}catch(error){observed.announcements.push({kind:a[0],error:String(error.stack??error)});throw error;}},async prepare(...a){try{const r=await Reflect.apply(original.prepare,original,a);observed.preparations.push(r);return r;}catch(error){observed.preparations.push({error:String(error.stack??error)});throw error;}},armSource(...a){const r=Reflect.apply(original.armSource,original,a);observed.arm.push(r);return r;},async waitSource(...a){const r=await Reflect.apply(original.waitSource,original,a);observed.wait.push(r);return r;},transferCompleted(...a){const r=Reflect.apply(original.transferCompleted,original,a);observed.completions.push({result:r,target:structuredClone(a[1].target)});return r;}};if(options.withoutF)p.blackout=undefined;
 },nativeSetup(n,{maps}){const G=n.G;for(const data of Object.values(maps)){data.note??='';data.encounterStep??=30;}G.Reactor3D={SIDECAR_SUFFIX:'.rrmap.json',...(G.Reactor3D??{}),beginPrepare(){},isPrepared:()=>true,shouldRender3D:()=>false};const XHR=G.XMLHttpRequest;G.XMLHttpRequest=class extends XHR{send(){if(/\.rrmap\.json$/.test(this.url)){queueMicrotask(()=>{this.status=404;this.responseText='';this.onload();});return;}super.send();}};
  const core=fs.readFileSync(path.join(root,'js/reactor_core.js'),'utf8');vm.runInContext(core.slice(0,core.indexOf('function Utils()')),G,{filename:'pinned:JsExtensions-before-actual-Map-loader'});
  const mapScene=G.Scene_Map.prototype,baseScene=G.Scene_Base.prototype,nativeMap=G.Game_Map.prototype;
  // The existing Reactor Scene_Map.updateMain already calls Game_Map.update. Observe it, never add a tick.
  const update=nativeMap.update;
  nativeMap.update=function(...args){
   if(!exactTarget(G,this)||args[0]!==true||inTargetUpdate)return Reflect.apply(update,this,args);
   inTargetUpdate=true;
   try{
    if(++targetMapUpdates===1)note(G,'first-active-target-map-update',targetScene);
    return Reflect.apply(update,this,args);
   }finally{inTargetUpdate=false;}
  };
  const updateInterpreter=nativeMap.updateInterpreter;
  nativeMap.updateInterpreter=function(...args){
   if(!inTargetUpdate||!exactTarget(G,this)||this._interpreter!==sourceInterpreter)return Reflect.apply(updateInterpreter,this,args);
   targetInterpreterUpdates++;
   const wasRunning=sourceInterpreter.isRunning();
   const result=Reflect.apply(updateInterpreter,this,args);
   if(!retired&&wasRunning&&!sourceInterpreter.isRunning()&&sourceInterpreter._waitMode!=='psBattle'){
    retired=true;
    note(G,'source-interpreter-retired',targetScene);
   }
   return result;
  };
  require('../production-same-source-replay/presentation.cjs').presentation(G);
  G.$dataSystem.switches=['','StartingOver'];
  for(const name of ['loadMapData','loadDataFile','onXhrLoad','onXhrError','onLoad','isMapObject','extractMetadata','extractArrayMetadata','makeEmptyMap','loadMapSidecar'])install(G,managers,'DataManager.'+name);
  vm.runInContext(fs.readFileSync(path.join(root,'js/reactor_json.js'),'utf8'),G,{filename:'pinned:RRJson'});
  maps[1]=structuredClone(maps[5]);G.$dataMapInfos[1]={id:1,name:'Legacy Home'};
  install(G,scenes,'Scene_Base.prototype.isReady');G.Scene_Message.prototype.isReady=G.Scene_Base.prototype.isReady;G.ImageManager.isReady=()=>true;G.EffectManager.isReady=()=>true;G.FontManager={isReady:()=>true};
  install(G,scenes,'Scene_Map.prototype.isReady');install(G,managers,'DataManager.isMapLoaded');install(G,managers,'DataManager.checkError');G.DataManager._errors=[];G.DataManager._checkStalledDataFiles=()=>{};
  const a=scenes.indexOf('const _reactorSceneMapOnMapLoaded ='),b=scenes.indexOf('// The database sidecar decides',a);assert(a>=0&&b>a);vm.runInContext(scenes.slice(a,b),G,{filename:'actual-event-defeat:Map-overlays'});
  const old=G.SceneManager,cs=managers.indexOf('function SceneManager() {'),ce=managers.indexOf('\n}',cs);vm.runInContext(managers.slice(cs,ce+2),G);Object.defineProperties(G.SceneManager,Object.getOwnPropertyDescriptors(old));
  const parameters=G.PluginManager.parameters;G.PluginManager.parameters=function(name){const p=parameters(name);if(name==='PS_BattleFlow')return{...p,homeMapId:'1',homeX:'1',homeY:'1',homeDirection:'2'};if(name==='PS_World')return{...p,CharacterHome:'',GlobalHome:'',StartingOverSwitch:'1'};return p;};
  G.PluginManager._commands={};install(G,managers,'PluginManager.registerCommand');install(G,managers,'PluginManager.callCommand');
  const end=mapScene.onTransferEnd;mapScene.onTransferEnd=function(...args){note(G,'native-transfer-end',this,{transfer:this._transfer,lastMapWasNull:this._lastMapWasNull});return Reflect.apply(end,this,args);};
  const eligible=mapScene.shouldAutosave;mapScene.shouldAutosave=function(...args){const result=Reflect.apply(eligible,this,args);note(G,'native-should-autosave',this,{result});return result;};
  const request=mapScene.requestAutosave;mapScene.requestAutosave=function(...args){observed.nativeOriginalRequests.push({mapId:G.$gameMap.mapId(),args:[...args],blocked:G.PSFlow?._app?.saveBlocked});note(G,'native-original-request',this);return Reflect.apply(request,this,args);};
  const enabled=baseScene.isAutosaveEnabled;baseScene.isAutosaveEnabled=function(...args){const result=Reflect.apply(enabled,this,args);note(G,'native-autosave-enabled',this,{result,optAutosave:G.$dataSystem.optAutosave});return result;};
  const reserve=G.Game_Player.prototype.reserveTransfer;G.Game_Player.prototype.reserveTransfer=function(...args){observed.rawReserves.push({args:[...args],stack:new Error('observed raw reserve').stack});return Reflect.apply(reserve,this,args);};
 }});
 const G=h.G,m=G.SceneManager,P=G.Scene_PSBattle.prototype,originals={create:P.create,onEnd:P.onEnd};
 G.$dataActors=JSON.parse(fs.readFileSync(path.join(root,'data/Actors.json'),'utf8'));G.$dataSystem=JSON.parse(fs.readFileSync(path.join(root,'data/System.json'),'utf8'));G.$dataSystem.optAutosave=true;G.$dataSystem.versionId=0;G.$dataSystem.switches=['','StartingOver'];
 const io=require('../blackout-formal-load-joint/io-adapter.cjs').install(G,process.env.PF_CHAIN_CASE_ROOT,root,out,{saveLocation:'project'});
 G.process.mainModule={filename:path.join(io.project,'index.js')};observed.actualNativeRNG=[];G.__replayNative=(args,value)=>observed.actualNativeRNG.push({args:[...args],value});vm.runInContext('const replayNativeInt=Math.randomInt;Math.randomInt=function(...args){const value=Reflect.apply(replayNativeInt,this,args);globalThis.__replayNative(args,value);return value;};',G,{filename:'observer:actual-native-after-final-JsExtensions'});
 observed.ioTrace=io.trace;observed.formalExecutors=[];observed.formalSaveCalls=[];const exec=G.Scene_Base.prototype.executeAutosave;G.Scene_Base.prototype.executeAutosave=function(...args){observed.formalExecutors.push({map:G.$gameMap.mapId(),checkpoint:G.$gameSystem._psGame.world.pendingReturn,args:[...args]});note(G,'formal-executor',this);return Reflect.apply(exec,this,args);};const save=G.DataManager.saveGame;G.DataManager.saveGame=function(...args){observed.formalSaveCalls.push({slot:args[0],map:G.$gameMap.mapId(),checkpoint:G.$gameSystem._psGame.world.pendingReturn});return Reflect.apply(save,this,args);};
 // Presentation lifecycle is a facade; the actual create opens the actual controller/Session.
 P.isReady=function(){return !!this._controller?.ready;};P.start=function(){return G.Scene_MenuBase.prototype.start.call(this);};P.update=function(){};
 const tick=()=>{G.Graphics.frameCount++;if(G.$gameScreen._flashDuration>0)G.$gameScreen._flashDuration--;m.changeScene();m.updateScene();G.Input.trigger.clear();G.Input.repeat.clear();};
 const pump=async(predicate,max=180)=>{for(let i=0;i<max;i++){if(predicate())return;G.$gameMessage.clear();tick();await flush();}throw Error('event defeat pump bounded failure '+JSON.stringify({scene:m._scene?.constructor?.name,map:G.$gameMap.mapId(),pending:h.state().world.pendingReturn,blocked:h.app.saveBlocked,last:h.flow.lastOutcome,F:observed}));};
 m.goto(G.Scene_Map);await pump(()=>m._scene.isStarted()&&!!ports.state.atomicWorldContent(()=>s=>({value:s.lifecycle})).travelLease?.mapBirth?.frame);
 const init=G.PSFlow.initializeBlackoutCompanions();if(init)assert.equal((await init).status,'completed');await pump(()=>!h.app.saveBlocked&&!G.PSWorld.pending());
 const legacy=h.flow.returnHome;h.flow.returnHome=function(...args){const result=Reflect.apply(legacy,this,args);observed.legacyCalls.push(structuredClone(result));return result;};
 observed.worldPrefixAtStart=[...businessDraws];observed.nativePrefixAtStart=[...h.nativeDraws];
 const actual357=G.Game_Interpreter.prototype.command357;observed.command357=[];G.Game_Interpreter.prototype.command357=function(...a){try{const result=Reflect.apply(actual357,this,a);observed.command357.push({args:structuredClone(a),result});return result;}catch(error){observed.command357.push({args:structuredClone(a),error:String(error.stack??error)});throw error;}};
 const args={kind:'wild',foes:'Pidgey:30',battleId:'event-defeat-F',canLose:options.canLose?'true':'false',resultVariable:'0',defaultWeather:'',defaultTerrain:'',battleEnvironment:'',battleTime:'0',battleEffects:'on',expGain:'true',canSwitch:'true'};
 const command=(code,parameters=[])=>({code,indent:0,parameters}),interpreter=sourceInterpreter=G.$gameMap._interpreter;
 interpreter.setup([command(357,['PS_BattleFlow','StartBattle','Start battle',args]),command(0)],0);interpreter.update();
 await pump(()=>m._scene?._psBattle&&m._scene._controller?.ready);
 const scene=m._scene,session=scene._session;assert.equal(scene.create,originals.create,'real Scene.create retained');assert.equal(scene.onEnd,originals.onEnd,'real Scene.onEnd retained');
 if(scene._failure){observed.controllerOpeningFailure=String(scene._failure.stack??scene._failure);throw scene._failure;}assert(session&&h.flow._op.session===session,'actual App session published by real begin');
 observed.normalizedRequest=structuredClone(h.flow._op.request);observed.sessionFactoryHandle={class:session.constructor.name,battleId:session.battleId};observed.worldAfterCreate=[...businessDraws];
 for(let i=0;i<4&&!session.finished;i++)await session.chooseMove(1);
 assert.equal(session.finished,true,'real gateway battle ended');observed.actualBattleResult=structuredClone(session.result());assert.equal(observed.actualBattleResult.outcome.kind,'win');assert.equal(observed.actualBattleResult.outcome.winner,'Wild');
 observed.generationBeforeFinish=h.app.stateGeneration;if(options.lateGeneration)h.flow.stateReplaced();observing=ordinaryDefeat;scene.onEnd();await flush();observed.generationAfterFinish=h.app.stateGeneration;observed.lateStale=structuredClone(h.flow.lastStale);
 observed.privateRouting=typeof h.app.isBattleBlackoutRouted==='function'?h.app.isBattleBlackoutRouted(session,session.battleId):null;
 // Let the real Map/source load chain settle, retaining bounded failures as observations.
 const arrived=()=>m._scene instanceof G.Scene_Map&&m._scene.isStarted()&&!G.$gamePlayer.isTransferring()&&!h.app.saveBlocked;
 for(let i=0;i<(options.lateGeneration?2:180);i++){G.$gameMessage.clear();tick();await flush();if(arrived())break;}
 if(ordinaryDefeat){
  note(G,'old-arrival-barrier',m._scene,{arrived:arrived(),opPending:h.flow.operationPending()});
  if(arrived()&&observed.privateRouting===true&&observed.Freserves[0]?.target.mapId===G.$gameMap.mapId()){
   targetScene=m._scene;targetMap=G.$gameMap;
   const targetMapId=G.$gameMap.mapId(),limit=48;
   let done=false;
   // 400ms return cover on the fixed 60Hz fixture clock plus native interpreter and drain updates.
   // Always observe the full tail, even after the first save, so duplicated execution still fails.
   for(let i=0;i<limit;i++){
    tick();await flush();
    if(!done&&h.flow.prebattleState()?.phase==='done'){done=true;note(G,'prebattle-done',m._scene);}
   }
   const stable=exactTarget(G,G.$gameMap)&&G.$gameMap.mapId()===targetMapId&&arrived();
   observed.autosaveTail={limit,targetMapUpdates,targetInterpreterUpdates,stable,done,retired,routeDropped,opPending:h.flow.operationPending()};
   const detail=JSON.stringify({tail:observed.autosaveTail,route});
   const retiredAt=route.findIndex(row=>row.kind==='source-interpreter-retired');
   const requestAt=route.findIndex(row=>row.kind==='native-original-request'&&row.onTailTarget&&row.mapId===targetMapId);
   const enabledAt=route.findIndex(row=>row.kind==='native-autosave-enabled'&&row.onTailTarget&&row.mapId===targetMapId&&row.result===true);
   const executorAt=route.findIndex(row=>row.kind==='formal-executor'),executor=route[executorAt];
   assert(executorAt>=0,'real native autosave executor not observed '+detail);
   assert(stable&&targetMapUpdates>=2&&targetInterpreterUpdates>0&&done&&retired&&!observed.autosaveTail.opPending&&!routeDropped,
    'destination host did not complete its natural autosave tail '+detail);
   assert(retiredAt>=0&&retiredAt<executorAt&&requestAt>=0&&requestAt<enabledAt&&enabledAt<executorAt&&
    executor.mapId===targetMapId&&executor.onTailTarget&&executor.prebattle==='done'&&!executor.interpreterRunning&&executor.interpreterWait!=='psBattle',
    'autosave executor did not prove ordered native request and original event retirement '+detail);
  }else{
   observed.autosaveTail={status:'NO_PROVEN_F_DESTINATION',privateRouting:observed.privateRouting,
    expectedMapId:observed.Freserves[0]?.target.mapId??null,mapId:G.$gameMap.mapId(),
    mapScene:m._scene instanceof G.Scene_Map,started:m._scene?.isStarted?.()===true,
    transferring:G.$gamePlayer.isTransferring(),appBlocked:h.app.saveBlocked};
   throw Error('ordinary defeat requires a proven F destination before the autosave tail '+JSON.stringify(observed.autosaveTail));
  }
 }
 observed.final={mapId:G.$gameMap.mapId(),x:G.$gamePlayer.x,y:G.$gamePlayer.y,blocked:h.app.saveBlocked,pending:structuredClone(h.state().world.pendingReturn),money:h.state().money,stats:structuredClone(h.state().stats),appliedBattles:structuredClone(h.state().appliedBattles),outcome:structuredClone(h.flow.lastOutcome),legacyReturn:structuredClone(h.flow.lastReturn),diagnostics:structuredClone(G.PSWorld.diagnostics)};
 observed.worldCompletePrefix=[...businessDraws];observed.nativeCompletePrefix=[...h.nativeDraws];observed.actualSaveExecutorCalls=h.saves.length;observed.saves=h.saves.map(s=>({...s,scene:undefined}));
 fs.writeFileSync(artifact,JSON.stringify(observed,null,2)+'\n',{flag:'wx'});
 return{...h,draws:businessDraws,observed,io,pump,tick,restore(){for(const f of restore)f();}};
 }catch(error){observed.failure=error.stack;fs.writeFileSync(artifact,JSON.stringify(observed,null,2)+'\n',{flag:'wx'});for(const f of restore)f();throw error;}
}
module.exports={fixture};
