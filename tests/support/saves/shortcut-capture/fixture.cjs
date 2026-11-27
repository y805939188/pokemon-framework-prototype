'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const out=process.env.PF_E3_JOINT_OUT,native=process.env.PF_E3_NATIVE_ROOT,scope=process.env.PF_T16_CASE_ROOT;assert(out&&native&&scope);
const E=require(path.join(out,'production.cjs')),T=require('../../../../scripts/tests/final-production-runtime.cjs').get().T,{method,inside,install:installIO}=require('../companion-continue/io-adapter.cjs');
const {fixture:base,flush}=require('./ui-base.cjs');const scenes=fs.readFileSync(native+'/js/reactor_scenes.js','utf8'),managers=fs.readFileSync(native+'/js/reactor_managers.js','utf8'),core=fs.readFileSync(native+'/js/reactor_core.js','utf8');
async function fixture({consumer=false}={}){
 const input=consumer?JSON.parse(fs.readFileSync(process.env.PF_T16_PRODUCER,'utf8')):null,observed={publicCalls:{claimGrant:0,resolveReceiving:0,openReceiving:0},mathRNG:[],nativeRNG:[],businessRNG:[],engineRNG:[],factory:[],fieldAdmissions:[],ballCalls:[],grant:[],saveCalls:[],saveSuccess:0,loadSuccess:0,recover:0,entries:[],restores:[],mapLoads:[],sceneEnds:0},clock={now:new Date(2026,10,16,21).getTime()};let maps,sourceState,priorSceneManager;
 const h=await base({edit(game,content){
  if(input){Object.keys(content).forEach(k=>delete content[k]);Object.assign(content,input.content);Object.assign(game,E.state.newGame({content,party:[],money:1000}));return;}
  for(const name of ['Snorlax','Pidgey'])content.species[name]={...structuredClone(T.fixtureContent.species[name]),ruleSpecies:name,wildItemCommon:[],wildItemUncommon:[],wildItemRare:[],abilities:[name==='Snorlax'?'Immunity':'Keen Eye'],gender:128,types:name==='Snorlax'?['Normal']:['Normal','Flying'],learnset:{1:name==='Snorlax'?['tackle','sweetscent']:['tackle']}};
  content.species=Object.fromEntries(['Snorlax','Pidgey'].map(key=>[key,content.species[key]]));
  content.abilities={...content.abilities,...T.fixtureContent.abilities};content.moves.tackle={id:'tackle',name:'Tackle',pp:35};content.moves.sweetscent={id:'sweetscent',name:'Sweet Scent',pp:20};
  content.items.oldrod={...content.items.pokeball,id:'oldrod',name:'Old Rod',namePlural:'Old Rods',legacyIds:['oldrod'],pocket:8,price:0,fieldUse:'field',battleUse:'none',flags:['KeyItem'],consumable:false,source:'t16-own-author',effect:{family:'fishing',parameters:{rod:1}}};delete content.items.oldrod.battleId;
  content.regionalDex={national:['Snorlax','Pidgey'],regions:[{id:0,nameKey:'t16.region',species:['Snorlax','Pidgey']}]};content.regionalDex.layoutIdentity=E.dexState.dexLayoutIdentity(content.regionalDex);
  content.settings={...content.settings,GAIN_EXP_FOR_CAPTURE:false};content.mapMetadata.maps[5]={outdoor:true,environment:'grass',mapPosition:{regionId:0,x:0,y:0}};
  content.world.encounters={source:'t16-own-author',tables:[{mapId:5,version:0,types:{Land:{stepChance:100,slots:[{species:'Pidgey',weight:1,minLevel:5,maxLevel:5}]}}}]};
  content.grants={...(content.grants??{}),'t16-start':{members:Array.from({length:6},()=>({species:'Snorlax',level:5})),items:{oldrod:1,masterball:1},money:0}};
  // Legal source initialization only; runtime new game and receipt-bearing grant follow below.
  const source=E.state.newGame({content,party:[],money:1000});Object.assign(game,source);sourceState=structuredClone(source);
 },applicationPorts(p){const factory=E.composition.createLegacyNoHeldBattleSessionFactory({content:()=>p.content().content,seed:()=>[17,29,43,71]});const create=factory.create;factory.create=async function(...args){const r={request:structuredClone(args[0]),worldCapture:structuredClone(args[2].worldCapture),field:structuredClone(args[2].initialField),stateBefore:structuredClone(args[1])};observed.factory.push(r);try{const result=await Reflect.apply(create,this,args);r.class=result.constructor.name;return result;}catch(error){r.error=String(error.stack??error);throw error;}};p.sessions=factory;},
 nativeSetup(n,context){const G=n.G;maps=context.maps;G.__t16WallClock=()=>clock.now;
  vm.runInContext('Date=class extends Date{ static now(){return globalThis.__t16WallClock();} };',G,{filename:'T16 synthetic host wall clock'});
  require('../../world/scene-replay/presentation.cjs').presentation(G);
  vm.runInContext(core.slice(0,core.indexOf('function Utils()')),G,{filename:'pinned:JsExtensions-first'});G.__replayMathObserve=(args,value)=>observed.mathRNG.push({args:[...args],value});vm.runInContext('const replayActualMathRandom=Math.random;globalThis.__t16NativeRandom=function(...args){const value=Reflect.apply(replayActualMathRandom,this,args);globalThis.__replayMathObserve(args,value);return value;};',G);
  for(const data of Object.values(maps)){data.note??='';data.encounterStep??=30;}G.Reactor3D={SIDECAR_SUFFIX:'.rrmap.json',...(G.Reactor3D??{}),beginPrepare(){},isPrepared:()=>true,shouldRender3D:()=>false};
  const XHR=G.XMLHttpRequest;G.XMLHttpRequest=class extends XHR{send(){if(/\.rrmap\.json$/.test(this.url)){queueMicrotask(()=>{this.status=404;this.responseText='';this.onload();});return;}super.send();}};
  for(const name of ['loadMapData','loadDataFile','onXhrLoad','onXhrError','onLoad','isMapObject','extractMetadata','extractArrayMetadata','makeEmptyMap','loadMapSidecar','isMapLoaded','checkError'])method(G,managers,'DataManager.'+name);G.DataManager._errors=[];G.DataManager._checkStalledDataFiles=()=>{};vm.runInContext(fs.readFileSync(native+'/js/reactor_json.js','utf8'),G,{filename:'pinned:RRJson'});
  for(const name of ['setupNewGame','selectSavefileForNewGame','emptySavefileId','earliestSavefileId','maxSavefiles','isSkill','isItem','isWeapon','isArmor'])method(G,managers,'DataManager.'+name);
  method(G,scenes,'Scene_Base.prototype.isReady');G.Scene_Message.prototype.isReady=G.Scene_Base.prototype.isReady;G.ImageManager.isReady=()=>true;G.EffectManager.isReady=()=>true;G.FontManager={isReady:()=>true};method(G,scenes,'Scene_Map.prototype.isReady');
  const a=scenes.indexOf('function Scene_File()'),b=scenes.indexOf('// Scene_GameEnd',a);vm.runInContext(scenes.slice(a,b),G,{filename:'pinned:FileSaveLoad'});for(const C of [G.Scene_Save,G.Scene_Load])C.prototype.create=function(){G.Scene_MenuBase.prototype.create.call(this);this._listWindow={refresh(){},activate(){}};};G.Scene_Load.prototype.fadeOutAll=function(){};G.SoundManager.playLoad=()=>{};G.SoundManager.playSave=()=>{};
  const old=G.SceneManager,ma=managers.indexOf('function SceneManager() {'),mb=managers.indexOf('\n}',ma);priorSceneManager=old;vm.runInContext(managers.slice(ma,mb+2),G);Object.defineProperties(G.SceneManager,Object.getOwnPropertyDescriptors(old));for(const key of ['changeScene','updateScene'])old[key]=(...args)=>Reflect.apply(G.SceneManager[key],G.SceneManager,args);
  // The prior T16 clearStack stand-in has the same body; bind the pinned native method on the actual manager.
  if(!consumer)method(G,managers,'SceneManager.clearStack');
 },beforeUpgrade(n){const random=n.flow.random;n.flow.random=function(...args){const value=Reflect.apply(random,this,args);observed.businessRNG.push({n:args[0],value});return value;};}});
 const {G}=h;assert.equal(G.PSFlow.now(),clock.now,'ordinary Flow reads the host wall clock');const io=installIO(G,scope,native,out,{saveLocation:'project'});G.process.mainModule={filename:path.join(io.project,'index.js')};G.$dataActors=JSON.parse(fs.readFileSync(native+'/data/Actors.json','utf8'));G.$dataSystem=JSON.parse(fs.readFileSync(native+'/data/System.json','utf8'));G.$dataSystem.optAutosave=false;G.$dataSystem.startMapId=5;G.$dataSystem.startX=2;G.$dataSystem.startY=2;G.$dataSystem.startDirection=6;G.$dataSystem.versionId=0;G.$dataSystem.switches=Array(40).fill('');G.$dataSystem.variables=Array(20).fill('');for(const name of ['Classes','Skills','Weapons','Armors','States','Items','Enemies','Troops'])G['$data'+name]=JSON.parse(fs.readFileSync(native+'/data/'+name+'.json','utf8'));
 G.__t16ObserveNativeInt=(args,value)=>observed.nativeRNG.push({args:[...args],value});vm.runInContext('const t16ActualRandomInt=Math.randomInt;Math.randomInt=function(...args){const value=Reflect.apply(t16ActualRandomInt,this,args);globalThis.__t16ObserveNativeInt(args,value);return value;};',G,{filename:'observer:actual-native-Math.randomInt'});
 for(const [target,key]of [[h.app,'claimGrant'],[h.app,'resolveReceiving'],[G.PSManagement,'openReceiving']]){const original=target[key];assert.equal(typeof original,'function',key+' actual public observer');target[key]=function(...args){observed.publicCalls[key]++;return Reflect.apply(original,this,args);};}
 const load=G.Scene_Load.prototype.onLoadSuccess;G.Scene_Load.prototype.onLoadSuccess=function(...args){observed.loadSuccess++;return Reflect.apply(load,this,args);};const save=G.DataManager.saveGame;G.DataManager.saveGame=function(...args){observed.saveCalls.push({slot:args[0],map:G.$gameMap.mapId(),blocked:h.app.saveBlocked});return Reflect.apply(save,this,args);};
 const manager=G.SceneManager,saveObservers=[],saveTrace={rows:[],truncated:false,observerFailed:false,successReturned:0,successThrew:0,failureEntered:0,successReturnedOnSaveReceiver:0};
 let saveObserved=false,saveReceiver;
 const saveReadiness=()=>{const scene=manager._scene,map=scene instanceof G.Scene_Map;return {
  sameManager:G.SceneManager===manager,map,started:map&&scene.isStarted()===true,active:map&&scene.isActive()===true,
  sceneIdle:map&&scene.isBusy()===false,noTransition:manager.isSceneChanging()===false,
  playerIdle:G.$gamePlayer.isTransferring()===false&&G.$gamePlayer.isMoving()===false,
  eventIdle:G.$gameMap.isEventRunning()===false,messageIdle:G.$gameMessage.isBusy()===false,
  flowIdle:G.PSFlow.operationPending()===false,companionIdle:G.PSFlow.companionNativePending()===false,
  worldIdle:!G.PSWorld.pending(),managementIdle:!G.PSManagement.current()&&!G.PSManagement.presentationPending(),
  bagIdle:!G.PSInventory.current(),applicationIdle:!h.app.pendingReceiving&&!h.app.saveBlocked,
  nativeSaveEnabled:G.$gameSystem.isSaveEnabled()===true,
 };};
 const saveMapReady=()=>Object.values(saveReadiness()).every(value=>value===true);
 if(!consumer)observed.saveLifecycle=saveTrace;
 const idsForSaveTrace=new WeakMap();let nextSaveTraceId=0;
 const traceId=object=>{if(!object||!['object','function'].includes(typeof object))return null;if(!idsForSaveTrace.has(object))idsForSaveTrace.set(object,++nextSaveTraceId);return idsForSaveTrace.get(object);};
 const sceneKind=scene=>scene instanceof G.Scene_Map?'map':scene instanceof G.Scene_Save?'save':scene?'other':'none';
 const stackKind=ctor=>ctor===G.Scene_Map?'map':ctor===G.Scene_Save?'save':ctor?'other':'none';
 const noteSave=(edge,phase,receiver,sampledManager,error)=>{
  if(!saveObserved)return;
  if(saveTrace.rows.length>=64){saveTrace.truncated=true;return;}
  try{
   const { _scene:scene,_nextScene:next,_stack:stack }=sampledManager,depth=Array.isArray(stack)?stack.length:null;
   const errorKind=phase!=='throw'?null:error?.name==='TypeError'?'TypeError':error?.name==='Error'?'Error':'other';
   saveTrace.rows.push({edge,phase,frame:G.Graphics.frameCount,receiver:traceId(receiver),manager:traceId(sampledManager),
    activeManager:sampledManager===G.SceneManager,receiverIsCurrentScene:receiver===scene,receiverIsSaveScene:receiver===saveReceiver&&!!saveReceiver,
    scene:sceneKind(scene),sceneID:traceId(scene),mapStarted:scene instanceof G.Scene_Map&&scene.isStarted()===true,
    mapActive:scene instanceof G.Scene_Map&&scene.isActive()===true,next:sceneKind(next),nextID:traceId(next),
    stack:traceId(stack),stackDepth:depth===null?null:Math.min(depth,65),stackTop:depth?stackKind(stack[depth-1]):'none',
    exitCallable:typeof sampledManager.exit==='function',errorKind,...(phase==='sample'?{readiness:saveReadiness()}:{}),
   });
  }catch{saveTrace.observerFailed=true;}
 };
 const observeSaveStep=edge=>{
  saveObserved=true;
  if(edge==='before-execute-save')saveReceiver=manager._scene;
  noteSave(edge,'sample',manager,manager);
 };
 function observeSaveMethod(holder,key,edge,sampledManager){
  const original=holder[key];assert.equal(typeof original,'function',edge);
  const wrapped=function(...args){
   if(edge==='onSaveSuccess')observed.saveSuccess++;
   if(edge==='onSaveFailure')saveTrace.failureEntered++;
   const actualManager=sampledManager?this:manager;
   noteSave(edge,'entry',this,actualManager);
   try{
    const result=Reflect.apply(original,this,args);
    if(edge==='onSaveSuccess'){saveTrace.successReturned++;if(this===saveReceiver)saveTrace.successReturnedOnSaveReceiver++;}
    noteSave(edge,'return',this,actualManager);
    return result;
   }catch(error){if(edge==='onSaveSuccess')saveTrace.successThrew++;noteSave(edge,'throw',this,actualManager,error);throw error;}
  };
  holder[key]=wrapped;
  saveObservers.push(()=>{if(holder[key]===wrapped)holder[key]=original;});
 }
 if(!consumer){
  for(const own of [manager,priorSceneManager]){
   for(const key of ['push','clearStack','pop'])observeSaveMethod(own,key,key,true);
  }
  observeSaveMethod(G.Scene_Save.prototype,'onSaveFailure','onSaveFailure',false);
 }
 // Keep C01's existing onSaveSuccess count even though only the producer emits the lifecycle trace.
 observeSaveMethod(G.Scene_Save.prototype,'onSaveSuccess','onSaveSuccess',false);
 for(const name of ['recoverBlackoutReturn','observeWorldMapEntry','restoreEventCompanionsAtMap']){const original=h.app[name];h.app[name]=function(...args){if(name==='recoverBlackoutReturn')observed.recover++;if(name==='observeWorldMapEntry')observed.entries.push(structuredClone(args[0]));if(name==='restoreEventCompanionsAtMap')observed.restores.push('called');return Reflect.apply(original,this,args);};}
 const open=G.PSFlow.openAdmittedWorldBattle;G.PSFlow.openAdmittedWorldBattle=function(...args){observed.fieldAdmissions.push({application:args[0]===h.app,request:G.PSFlow.request,admissionType:typeof args[1]});return Reflect.apply(open,this,args);};
 // Actual engine PRNG observers preserve results and do not reset or choose draws.
 const prng=require(path.resolve(out,'../showdown/dist/sim/prng.js')),restore=[],ids=new WeakMap();let next=0;
 for(const key of ['Gen5RNG','SodiumRNG']){const proto=prng[key].prototype,original=proto.next;proto.next=function(...args){const result=Reflect.apply(original,this,args);if(!ids.has(this))ids.set(this,++next);observed.engineRNG.push({kind:key,instance:ids.get(this),args:[...args],value:result});return result;};restore.push(()=>proto.next=original);}
 const P=G.Scene_PSBattle.prototype,actualCreate=P.create,actualEnd=P.onEnd;P.isReady=function(){return !!this._controller?.ready;};P.start=function(){return G.Scene_MenuBase.prototype.start.call(this);};P.update=function(){};P.onEnd=function(...args){observed.sceneEnds++;return Reflect.apply(actualEnd,this,args);};
 const tick=()=>{G.Graphics.frameCount++;G.SceneManager.changeScene();G.SceneManager.updateScene();G.Input.trigger.clear();G.Input.repeat.clear();};
 const pump=async(predicate,max=320)=>{for(let i=0;i<max;i++){if(predicate())return;if(!G.$gameMessage.isChoice())G.$gameMessage.clear();tick();await flush();}throw Error('T16 finite pump '+JSON.stringify({scene:G.SceneManager._scene?.constructor?.name,blocked:h.app.saveBlocked,world:G.PSWorld.pending(),ui:G.PSManagement.current(),inventory:G.PSInventory.current(),calls:h.calls.map(x=>({kind:x.kind,status:x.result?.status,reason:x.result?.reason})),diagnostics:G.PSWorld.diagnostics}));};
 const press=key=>{h.input.pressed.add(key);h.input.trigger.add(key);h.input.repeat.add(key);tick();h.input.pressed.delete(key);tick();};
 async function grant(){const r=h.app.claimGrant('t16-start');observed.grant.push(structuredClone(r));assert.equal(r.status,'pending');assert(G.PSManagement.openReceiving());for(let i=0;i<6;i++){await pump(()=>G.PSManagement.current()?.ready&&G.PSManagement.current()?.view.items?.some(x=>x.key==='no'));h.choose('no');await flush();}await pump(()=>G.SceneManager._scene instanceof G.Scene_Map&&G.SceneManager._scene.isStarted()&&!G.SceneManager.isSceneChanging()&&!G.$gameMessage.isBusy()&&!h.app.pendingReceiving&&!h.app.saveBlocked&&!G.PSManagement.presentationPending()&&!G.PSFlow.companionNativePending());assert(h.state().claims['t16-start']);assert.equal(h.state().party.length,6);assert.equal(h.quantity('masterball'),1);assert.equal(h.quantity('oldrod'),1);}
 const snapshot=()=>({state:structuredClone(h.state()),content:h.content,maps,observed,fs:io.trace,draws:[...h.draws],nativeDraws:[...h.nativeDraws],point:[G.$gameMap.mapId(),G.$gamePlayer.x,G.$gamePlayer.y],diagnostics:G.PSWorld.diagnostics,technical:{scene:G.SceneManager._scene?.constructor?.name,started:G.SceneManager._scene?.isStarted?.(),sceneFailure:String(G.SceneManager._scene?._failure?.stack??G.SceneManager._scene?._failure??''),changing:G.SceneManager.isSceneChanging(),message:G.$gameMessage.isBusy(),saveBlocked:h.app.saveBlocked,management:G.PSManagement.current(),managementPending:G.PSManagement.presentationPending(),worldPending:G.PSWorld.pending(),visible:h.windows.filter(w=>!w.destroyed&&w.visible).map(w=>w.drawn)}});
 const record=name=>{assert(['completed','failure'].includes(name));io.assertPaths();fs.writeFileSync(inside(path.join(scope,name+'.json'),scope),JSON.stringify(snapshot(),null,2)+'\n',{flag:'wx',mode:0o600});};
 return{...h,G,io,observed,clock,tick,press,pump,grant,snapshot,record,input,actualCreate,actualEnd,saveMapReady,observeSaveStep,
  restore(){for(const f of saveObservers.reverse())f();for(const f of restore)f();},sourceState};
}
module.exports={fixture,flush};
