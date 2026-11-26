'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {method,install:installIO}=require('../blackout-formal-load-joint/io-adapter.cjs');
const {prepareSchema11Slot}=require('../blackout-formal-load-joint/legacy-schema11-input.cjs');
// The consumer needs the current E3 observer and completed native Map bootstrap.
// The producer-only bootstrap replaces that fixture with its older map facade.
const {fixture:boot,flush}=require('../blackout-formal-load-joint/normal-base.cjs');
const native=process.env.PF_E3_NATIVE_ROOT,out=process.env.PF_E3_JOINT_OUT,scope=process.env.PF_CHAIN_CASE_ROOT;
assert(native&&out&&scope);const managers=fs.readFileSync(path.join(native,'js/reactor_managers.js'),'utf8'),scenes=fs.readFileSync(path.join(native,'js/reactor_scenes.js'),'utf8');
async function fixture(options={}){
 const observed={kind:'actual formal load production consumer, presentation/XHR facades',loadSuccess:0,recoverCalls:0,initializes:[],reserves:[],events:[],originalAutosaves:[],saveGameCalls:[],entries:[],versions:null,beforeLoadDraws:null,afterLoadDraws:null},flags={resourceFailure:options.resourceFailure===true};
 let h;
 h=await boot({nativeSetup(n){const G=n.G;require('../production-same-source-replay/presentation.cjs').presentation(G);G.Reactor3D={SIDECAR_SUFFIX:'.rrmap.json',...(G.Reactor3D??{}),beginPrepare(){},isPrepared:()=>true,shouldRender3D:()=>false};
  const core=fs.readFileSync(path.join(native,'js/reactor_core.js'),'utf8');
  vm.runInContext(core.slice(0,core.indexOf('function Utils()')),G,{filename:'pinned:JsExtensions-before-real-Map-loader'});
  // Define real Load/File methods before Flow installs any known-method exclusion.
  const a=scenes.indexOf('function Scene_File()'),b=scenes.indexOf('// Scene_GameEnd',a);assert(a>=0&&b>a);vm.runInContext(scenes.slice(a,b),G,{filename:'pinned:Scene_File+Save+Load'});
  G.Scene_Load.prototype.create=function(){G.Scene_MenuBase.prototype.create.call(this);this._listWindow={refresh(){observed.events.push('file-list-refresh-facade');},activate(){observed.events.push('file-list-activate-facade');}};}; // file-list presentation only
  G.Scene_Load.prototype.fadeOutAll=function(){};G.SoundManager.playLoad=()=>observed.events.push('load-sound-facade');
  for(const name of ['loadMapData','loadDataFile','onXhrLoad','onXhrError','onLoad','isMapObject','extractMetadata','extractArrayMetadata','makeEmptyMap','loadMapSidecar'])method(G,managers,'DataManager.'+name);
  vm.runInContext(fs.readFileSync(path.join(native,'js/reactor_json.js'),'utf8'),G,{filename:'pinned:RRJson'});
  // Retain the actual native map loader; the resource provider returns test JSON only.
  const XHR=G.XMLHttpRequest;G.XMLHttpRequest=class extends XHR{send(){if(/\.rrmap\.json$/.test(this.url)){queueMicrotask(()=>{this.status=404;this.responseText='';this.onload();});return;}if(flags.resourceFailure&&/Map007\.json$/.test(this.url)){observed.events.push('Map7-XHR-resource-error');queueMicrotask(()=>{this.status=0;this.onerror();});}else super.send();}};
 }});
 const {G}=h,io=installIO(G,scope,native,out,{saveLocation:'project'}),B=require(path.join(out,'production.cjs'));
 G.process.mainModule={filename:path.join(io.project,'index.js')};
 G.$dataActors=JSON.parse(fs.readFileSync(path.join(native,'data/Actors.json'),'utf8'));
 G.$dataSystem=JSON.parse(fs.readFileSync(path.join(native,'data/System.json'),'utf8'));G.$dataSystem.optAutosave=true;G.$dataSystem.switches=['','StartingOver'];
 G.$dataSystem.versionId=options.mismatch?1:0;
 const loadedState=JSON.parse(fs.readFileSync(process.env.PF_CHAIN_PRODUCER,'utf8'));
 const file0 = G.StorageManager.filePath('file0'), global = G.StorageManager.filePath('global');
 assert.equal(io.sha(file0), loadedState.files.file0.sha256);
 assert.equal(io.sha(global), loadedState.files.global.sha256);
 let expectedState = loadedState.state;
 if (options.legacy) {
   const packed = await G.StorageManager.loadObject('file0');
   const legacy = await prepareSchema11Slot(G.StorageManager, 'file0', packed);
   assert.deepEqual({...legacy, schema: 12, hallOfFame: loadedState.state.hallOfFame}, loadedState.state);
   expectedState = {...legacy, schema: 12, hallOfFame: null};
 }
 const sourceSHA256 = {file0: io.sha(file0), global: io.sha(global)};
 const loadTraceStart = io.trace.length;
 const authorContent=JSON.parse(fs.readFileSync(process.env.PF_CHAIN_CONTENT,'utf8'));Object.keys(h.content).forEach(key=>delete h.content[key]);Object.assign(h.content,authorContent);G.PSFlow._content=h.content;
 assert.deepEqual(B.saveSchema.validateGameContent(loadedState.state,h.content),[],'saved data is valid in actual fixed consumer content');
 const enter=h.app.observeWorldMapEntry;h.app.observeWorldMapEntry=function(entry){observed.entries.push({entry:structuredClone(entry),companions:structuredClone(G.$gameSystem._psGame.world.companions)});return Reflect.apply(enter,this,[entry]);};
 const originalRecover=h.app.recoverBlackoutReturn;h.app.recoverBlackoutReturn=function(...args){observed.recoverCalls++;return Reflect.apply(originalRecover,this,args);};
 const originalInitialize=h.app.initializeBlackoutCompanions;h.app.initializeBlackoutCompanions=function(...args){const value=Reflect.apply(originalInitialize,this,args);return value.then(result=>{observed.initializes.push(result);return result;});};
 const originalSave=G.DataManager.saveGame;G.DataManager.saveGame=function(...args){observed.saveGameCalls.push({slot:args[0],map:G.$gameMap.mapId(),phase:G.$gameSystem._psGame?.world?.pendingReturn?.phase??null});return Reflect.apply(originalSave,this,args);};
 const originalExecute=G.Scene_Base.prototype.executeAutosave;G.Scene_Base.prototype.executeAutosave=function(...args){observed.originalAutosaves.push({map:G.$gameMap.mapId(),phase:G.$gameSystem._psGame?.world?.pendingReturn?.phase??null});return Reflect.apply(originalExecute,this,args);};
 // Observe real native success without replacing reload/goto or calling the scheduler.
 const onLoad=G.Scene_Load.prototype.onLoadSuccess;G.Scene_Load.prototype.onLoadSuccess=function(...args){observed.loadSuccess++;observed.versions=[G.$gameSystem.versionId(),G.$dataSystem.versionId];observed.events.push(['onLoadSuccess',this instanceof G.Scene_Load]);return Reflect.apply(onLoad,this,args);};
 observed.replay={factories:0,finishes:0,grants:0,receiving:0,engineRNG:[],nativeRNG:[]};
 const prng=require(path.resolve(out,'../showdown/dist/sim/prng.js')),restore=[];for(const kind of ['Gen5RNG','SodiumRNG']){const p=prng[kind].prototype,original=p.next;p.next=function(...a){const value=Reflect.apply(original,this,a);observed.replay.engineRNG.push({kind,args:[...a],value});return value;};restore.push(()=>p.next=original);}
 G.__replayObserveNative=(args,value)=>observed.replay.nativeRNG.push({args:[...args],value});vm.runInContext('const replayRandomInt=Math.randomInt;Math.randomInt=function(...args){const value=Reflect.apply(replayRandomInt,this,args);globalThis.__replayObserveNative(args,value);return value;};',G);
 for(const [obj,key,counter]of [[h.app,'startBattle','factories'],[h.app,'finishBattle','finishes'],[h.app,'claimGrant','grants'],[h.app,'resolveReceiving','receiving']]){if(typeof obj[key]!=='function')continue;const original=obj[key];obj[key]=function(...args){observed.replay[counter]++;return Reflect.apply(original,this,args);};}
 observed.beforeLoadDraws=[...h.draws];observed.beforeNativeDraws=[...h.nativeDraws];
 const m=G.SceneManager;m.goto(G.Scene_Load);m.changeScene();m.updateScene();const loadScene=m._scene;assert(loadScene instanceof G.Scene_Load);loadScene.executeLoad(0);
 const tick=()=>{G.Graphics.frameCount++;m.changeScene();m.updateScene();G.Input.trigger.clear();G.Input.repeat.clear();};
 const pump=async(predicate,max=240)=>{for(let i=0;i<max;i++){if(predicate())return;G.$gameMessage.clear();tick();await flush();}throw Error('formal-load production bounded stop '+JSON.stringify({view:G.PSFlow.blackoutLoadRecoveryView?.(),map:G.$gameMap.mapId(),pending:G.$gameSystem._psGame?.world?.pendingReturn,blocked:G.PSFlow.operationPending(),loadError:G.PSState.lastLoadError,observed,diagnostics:G.PSWorld.diagnostics,source:h.captured.source}));};
 const snapshot=()=>({state:structuredClone(G.$gameSystem._psGame),view:G.PSFlow.blackoutLoadRecoveryView?.(),map:G.$gameMap.mapId(),point:[G.$gamePlayer.x,G.$gamePlayer.y],loaded:G.$gameSystem._psSaveInfo,saveLocation:G.PSSaveLocation,observed,nativeReserveTrace:h.trace.filter(x=>x[0]==='native-reserve'),fs:io.trace,draws:[...h.draws],nativeDraws:[...h.nativeDraws],loadSuccessFlag:loadScene._loadSuccess});
 const record=(name)=>{io.assertPaths();fs.writeFileSync(path.join(scope,name+'.json'),JSON.stringify(snapshot(),null,2)+'\n',{flag:'wx'});};
 return{...h,G,io,B,observed,flags,pump,tick,loadScene,expectedState,sourceSHA256,loadTraceStart,snapshot,record,restore(){for(const f of restore)f();}};
}
module.exports={fixture,flush};
