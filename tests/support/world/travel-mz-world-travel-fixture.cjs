'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const out=process.env.PF_E3_JOINT_OUT;if(!out||!fs.existsSync(path.join(out,'production.cjs')))throw Error('explicit prebuilt joint bundle required');
const B={out,E:require(path.join(out,'production.cjs')),inventory:fs.readFileSync(require('../../../scripts/tests/final-production-runtime.cjs').pluginFile('PS_Inventory'),'utf8'),world:fs.readFileSync(require('../../../scripts/tests/final-production-runtime.cjs').pluginFile('PS_World'),'utf8'),flow:fs.readFileSync(require('../../../scripts/tests/final-production-runtime.cjs').pluginFile('PS_BattleFlow'),'utf8')};
require('./mz-integration-support.cjs').build=async()=>B; // Never invoke an automatic/shared/default builder.
const {fixture:base,flush}=require('../field/surf-production-native-support.cjs');
const native=path.join(process.env.PF_E3_NATIVE_ROOT,'js'),objects=fs.readFileSync(path.join(native,'reactor_objects.js'),'utf8'),scenes=fs.readFileSync(path.join(native,'reactor_scenes.js'),'utf8'),compat=fs.readFileSync(path.join(native,'libs/pixi_compat.js'),'utf8');
function install(G,name,text=scenes){const a=text.indexOf(name+' = function'),b=text.indexOf('\n};',a);assert(a>=0&&b>a,name);vm.runInContext(text.slice(a,b+4),G,{filename:'actual-native-e3:'+name});}
function mapData(id){return {width:10,height:8,tilesetId:1,scrollType:0,data:Array(10*8*6).fill(0),events:[null],meta:{},encounterList:[],disableDashing:false,autoplayBgm:false,autoplayBgs:false,parallaxLoopX:false,parallaxLoopY:false,parallaxSx:0,parallaxSy:0};}
function arrivalEvent(){return {id:1,name:'arrival',x:0,y:2,pages:[{conditions:{switch1Valid:false,switch2Valid:false,variableValid:false,selfSwitchValid:false,itemValid:false,actorValid:false},image:{tileId:0,characterName:'',characterIndex:0,direction:2,pattern:1},priorityType:0,through:false,trigger:1,moveType:0,moveSpeed:3,moveFrequency:3,moveRoute:{list:[{code:0,parameters:[]}],repeat:true,skippable:false,wait:false},walkAnime:true,stepAnime:false,directionFix:false,list:[{code:230,indent:0,parameters:[1]},{code:0,indent:0,parameters:[]}]}]};}
async function fixture(options={}){
 const nativeConsumer=require('./travel/native-consumer-observer.cjs').observer();
 const trace=[],saves=[],requests=[],maps={5:mapData(5),6:mapData(6),7:mapData(7)};if(options.connection){maps[6].events[1]=arrivalEvent();if(options.autorun)maps[6].events[1].pages[0].trigger=3;}let h;
 h=await base({applicationPorts(ports){nativeConsumer.observeConnectionFacts(ports);options.applicationPorts?.(ports);nativeConsumer.observePorts(ports);},edit(game,content){
  content.moves.fly={id:'fly',name:'Fly',pp:15};content.moves.dig={id:'dig',name:'Dig',pp:10};content.moves.teleport={id:'teleport',name:'Teleport',pp:20};game.party[0].moves=[{id:options.move??'fly',pp:10,maxpp:{fly:15,dig:10,teleport:20}[options.move??'fly'],ppUps:0}];game.badges=Array(8).fill(true);game.world.visitedMaps=[5,6,7];game.world.escapePoint={mapId:7,x:1,y:1,direction:8};game.world.healingSpot={mapId:6,x:1,y:2};game.world.repelSteps=options.repel??0;
  content.mapMetadata={source:'joint-fixture',maps:{5:{outdoor:true,mapPosition:{regionId:0,x:0,y:0}},6:{outdoor:true,healingSpot:{mapId:6,x:0,y:2},weather:{type:'Rain',chance:100}},7:{outdoor:true}}};
  content.world.regionMaps={source:'joint-fixture',regions:[{id:0,nameKey:'r0',points:[{x:1,y:1,healingSpot:{mapId:6,x:1,y:2}}]}]};content.world.mapConnections={source:'joint-fixture',connections:[{a:{mapId:5,anchor:'E',offset:0},b:{mapId:6,anchor:'W',offset:0}}]};
  content.world.encounters.tables.push({mapId:6,version:0,types:{Land:{stepChance:1,slots:[{species:'A',weight:1,minLevel:5,maxLevel:5}]}}});options.edit?.(game,content);
 },async nativeSetup(n,{bitmap}){
  const G=n.G,p=G.Scene_Map.prototype,oldPrototype=p;
  install(G,'Number.prototype.clamp',fs.readFileSync(path.join(native,'reactor_core.js'),'utf8'));
  const a=scenes.indexOf('function Scene_Map() {'),b=scenes.indexOf('\n}',a);assert(a>=0&&b>a);vm.runInContext(scenes.slice(a,b+2),G,{filename:'actual-native:Scene_Map-constructor'});G.Scene_Map.prototype=oldPrototype;oldPrototype.constructor=G.Scene_Map;
  G.Stage={prototype:{initialize(){}}};G.Scene_Base.prototype.createColorFilter=function(){};install(G,'Scene_Base.prototype.initialize');
  G.Scene_Message.prototype.initialize=G.Scene_MenuBase.prototype.initialize;G.Scene_Message.prototype.create=G.Scene_MenuBase.prototype.create;G.Scene_Message.prototype.start=G.Scene_MenuBase.prototype.start;
  for(const name of ['initialize','create','isReady','onMapLoaded','start','onTransferEnd','shouldAutosave','onTransfer'])install(G,'Scene_Map.prototype.'+name);
  for(const name of ['requestAutosave','isAutosaveEnabled','executeAutosave','onAutosaveSuccess','onAutosaveFailure'])install(G,'Scene_Base.prototype.'+name);
  const nativeStart=p.start;p.start=function(...args){const before=trace.filter(row=>row[0]==='interpreter-enter').length;if(options.startProbe)G.$gameMap.updateInterpreter();trace.push(['before-native-start',G.$gameMap.mapId(),G.PSWorld?.pending(),G.PSFlow?._app?.saveBlocked,G.$gameSystem._psGame.steps,trace.filter(row=>row[0]==='interpreter-enter').length-before]);return Reflect.apply(nativeStart,this,args);};
  const nativeInterpreter=G.Game_Map.prototype.updateInterpreter;G.Game_Map.prototype.updateInterpreter=function(...args){trace.push(['interpreter-enter',this.mapId(),G.$gameSystem._psGame.steps,G.PSFlow?._app?.saveBlocked]);return Reflect.apply(nativeInterpreter,this,args);};
  if(options.noSaveRequest)p.shouldAutosave=()=>false;
  G.SceneManager.clearStack=function(){this._stack=[];};G.SceneManager.isNextScene=function(C){return this._nextScene instanceof C;};
  p.createDisplayObjects=function(){this._mapNameWindow={open(){trace.push(['map-name']);}};trace.push(['display',G.$gameMap.mapId(),G.$gameSystem._psGame.world.visitedMaps.slice(),G.$gameSystem._psGame.world.weather.type]);};p.fadeInForTransfer=function(){};p.needsFadeIn=()=>false;
  G.ImageManager.clear=()=>{};G.EffectManager={clear(){}};
  // Exact pinned query/error methods; only transport/render resources remain bounded facades.
  const managerText=fs.readFileSync(path.join(native,'reactor_managers.js'),'utf8');
  assert(managerText.includes('DataManager._errors = [];'));vm.runInContext('DataManager._errors = [];',G,{filename:'actual-native-e3:DataManager-initial-errors'});
  for(const name of ['isMapLoaded','checkError'])install(G,'DataManager.'+name,managerText);
  // Restore the actual Scene_Message -> Scene_Base readiness chain (the old frame facade had only update).
  Object.setPrototypeOf(G.Scene_Message.prototype,G.Scene_Base.prototype);install(G,'Scene_Base.prototype.isReady');
  const coreText=fs.readFileSync(path.join(native,'reactor_core.js'),'utf8');
  for(const name of ['Bitmap._sweepStalledLoads','Bitmap.prototype.retry'])install(G,name,coreText);
  const urlStart=coreText.indexOf('Object.defineProperty(Bitmap.prototype, "url", {'),urlEnd=coreText.indexOf('\n});',urlStart);assert(urlStart>=0&&urlEnd>urlStart);vm.runInContext(coreText.slice(urlStart,urlEnd+4),G,{filename:'actual-native-e3:Bitmap.url'});
  G.ImageManager._cache={owned:bitmap};G.ImageManager._system={};
  for(const name of ['isReady','_checkStalledBitmap','skipsMissingImages','throwLoadError'])install(G,'ImageManager.'+name,managerText);
  G.EffectManager._cache={};G.EffectManager._errorUrls=[];
  for(const name of ['isReady','checkErrors','throwLoadError'])install(G,'EffectManager.'+name,managerText);
  G.FontManager={_states:{},_urls:{}};
  for(const name of ['isReady','throwLoadError'])install(G,'FontManager.'+name,managerText);

  G.DataManager.loadMapData=id=>{trace.push(['native-load-map',id]);G.$dataMap=maps[id];};G.DataManager.isBattleTest=()=>false;G.DataManager.isEventTest=()=>false;G.DataManager.isPlaytestCheckpointEnabled=()=>false;
  G.DataManager.saveGame=slot=>{saves.push({slot,frame:G.Graphics.frameCount,steps:G.$gameSystem._psGame.steps,escape:G.$gameSystem._psGame.world.escapePoint,blocked:G.PSFlow._app.saveBlocked,scene:G.SceneManager._scene});return Promise.resolve(true);};
  G.$dataSystem.optAutosave=options.autosave!==false;G.$dataSystem.versionId=1;
  const previous=G.$gameSystem._psGame;G.$gameSystem=new G.Game_System();G.$gameSystem._psGame=previous;
  G.AudioManager.saveBgm=()=>({name:''});G.AudioManager.saveBgs=()=>({name:''});
  const nativeRequest=p.requestAutosave;p.requestAutosave=function(...args){trace.push(['native-request-autosave',G.Graphics.frameCount,G.PSFlow._app?.saveBlocked]);return Reflect.apply(nativeRequest,this,args);};
  const nativeReserve=G.Game_Player.prototype.reserveTransfer;G.Game_Player.prototype.reserveTransfer=function(...args){trace.push(['native-reserve',...args]);return Reflect.apply(nativeReserve,this,args);};
  const autoplay=G.Game_Map.prototype.autoplay;G.Game_Map.prototype.autoplay=function(...args){trace.push(['native-autoplay',this.mapId()]);return Reflect.apply(autoplay,this,args);};
  G.$dataMap=maps[5];G.$dataMapInfos=[];for(const id of [5,6,7])G.$dataMapInfos[id]={id,name:'Map'+id};
  class XMLHttpRequest{open(method,url){this.url=url;requests.push([method,url]);}overrideMimeType(){}send(){const id=Number(this.url.match(/Map(\d+)\.json/)[1]);queueMicrotask(()=>{this.status=0;this.responseText=JSON.stringify(maps[id]);this.onload();});}}
  G.XMLHttpRequest=XMLHttpRequest;
  G.$gamePlayer._x=options.connection?9:2;G.$gamePlayer._realX=G.$gamePlayer._x;G.$gamePlayer._y=2;G.$gamePlayer._realY=2;G.$gamePlayer._direction=6;
  function Container(){}Container.prototype=G.Scene_MenuBase.prototype;G.PIXI={TextureSource:function(){},Container,Sprite:null,TilingSprite:null,ObjectRenderer:null};G.compatLog=()=>{};G.isWindowLayerClass=()=>false;
  const u=compat.indexOf('    window.MZGlobalUpgrade = function() {'),ue=compat.indexOf('\n    };',u);assert(u>=0&&ue>u);vm.runInContext(compat.slice(u,ue+7),G,{filename:'actual-native:MZGlobalUpgrade'});
  options.nativeSetup?.(n,{trace,saves,maps});
 }});
 const G=h.G;vm.runInContext('Math.random=()=>{throw Error("unregistered native RNG");};',G);G.MZGlobalUpgrade();
 nativeConsumer.install(G,h.app);
 const bootstrap=G.SceneManager._scene;G.PSWorld.loadSucceeded();G.SceneManager.goto(G.Scene_Map);
 const app=h.app;const draw=h.flow.rng;h.flow.rng=n=>{trace.push(['rng',n,new Error().stack]);return draw(n);};let arrivals=0,selected,replyCount=0;const dispatch=G.PSWorld.completedSteps.dispatchArrival;G.PSWorld.completedSteps.dispatchArrival=function(...args){arrivals++;return Reflect.apply(dispatch,this,args);};
 const nativeStep=h.app.world.completeStep.bind(h.app.world);const outcomes=[],stepCalls=[];h.app.world.completeStep=(...args)=>{stepCalls.push(args[0]);return nativeStep(...args).then(outcome=>{outcomes.push(outcome);return outcome;});};
 const select=G.PSInventory.selectOwnedRepel;G.PSInventory.selectOwnedRepel=function(owner,selection,reply,hooks){selected={owner,selection,hooks};const handle=Reflect.apply(select,this,[owner,selection,value=>{replyCount++;return reply(value);},hooks]);selected.handle=handle;return handle;};
 const pumpUntil=async(predicate,max=140,failed)=>{
  let barrier=null;const generation=app.stateGeneration,phase=failed?'failed-arrival':nativeConsumer.retryStatus()?'retry':'ordinary';
  for(let i=0;i<max;i++){
   const matched=predicate();
   if(matched){
    const scene=G.SceneManager._scene,stable=G.PSFlow._app===app&&app.stateGeneration===generation&&scene instanceof G.Scene_Map&&scene._started&&!app.saveBlocked&&!G.PSWorld.pending();
    const companions=stable&&G.PSFlow.companionNativePending(),author=stable&&G.PSFlow.worldAuthorInputPending();
    barrier={phase,predicate:true,barrierEvaluated:true,stable:!!stable,companions:!!companions,author:!!author,...nativeConsumer.idleSummary()};
    if((failed||!companions)&&!author&&(failed?stable&&nativeConsumer.failedArrival(failed.requestId,failed.receipt,failed.reason):(!stable||nativeConsumer.ready())))return;
   }else barrier={phase,predicate:false,barrierEvaluated:false,stable:null,companions:null,author:null,...nativeConsumer.idleSummary()};
   G.$gameMessage.clear();h.tick();await flush();
  }
  // Preserve the cached failure assessment independently of Node's Error
  // inspect truncation. The existing runner retains both streams in raw.tap.
  // Diagnostics must never replace the original failing assertion/throw.
  if(failed)try{
   const diagnostic={schema:'e3-failed-arrival-diagnostic-v1',...nativeConsumer.compactFailureStatus(),barrier:{phase:barrier?.phase,predicate:barrier?.predicate,stable:barrier?.stable,companions:barrier?.companions,author:barrier?.author}};
   let encoded=JSON.stringify(diagnostic);
   if(Buffer.byteLength(encoded,'utf8')>8192)encoded=JSON.stringify({...diagnostic,transitions:[],transitionOmitted:diagnostic.transitionOmitted+diagnostic.transitions.length,budgetDroppedTransitions:true});
   if(Buffer.byteLength(encoded,'utf8')<=8192)process.stderr.write('E3_FAILED_ARRIVAL_DIAGNOSTIC_V1 '+encoded+'\n');
  }catch{ /* Keep the original failure even if diagnostic projection/output fails. */ }
  throw Error('E3 real IIFE joint pump exceeded: '+JSON.stringify({barrier,failedArrival:failed?nativeConsumer.failureStatus():null,
   retry:{callback:nativeConsumer.retryStatus('joint-tail-callback'),cleanup:nativeConsumer.retryStatus('joint-tail-cleanup')},
   point:[G.$gameMap.mapId(),h.player.x,h.player.y],save:app.saveBlocked,pending:G.PSWorld.pending(),
   scene:G.SceneManager._scene?.constructor?.name,next:G.SceneManager._nextScene?.constructor?.name,
   diagnostics:G.PSWorld.diagnostics.slice(-8).map(value=>typeof value==='string'?value.slice(0,240):'<non-text-diagnostic>')}));
 };
 const pump=(predicate,max=140)=>pumpUntil(predicate,max);
 const pumpFailedArrival=(predicate,failed,max=140)=>pumpUntil(predicate,max,failed);
 await pump(()=>{const companions=G.PSFlow.companionNativePending(),author=G.PSFlow.worldAuthorInputPending();trace.push(['bootstrap-owned-pending',companions,author]);return G.SceneManager._scene!==bootstrap&&G.SceneManager._scene?._started&&!companions&&!author&&!G.PSWorld.pending()&&!app.saveBlocked;});
 return {...h,G,app,trace,saves,maps,requests,pump,pumpFailedArrival,outcomes,stepCalls,nativeConsumer,quantity:id=>B.E.inventory.itemQuantity(G.$gameSystem._psGame.inventory,id,h.content.items),arrivals:()=>arrivals,selected:()=>selected,replies:()=>replyCount,state:()=>G.$gameSystem._psGame};
}
function ordinaryObservers(baseFixture=fixture){
// Observe the ordinary plugin port inside each private VM; neither choose nor publish entropy words.
const crypto=require('node:crypto'),nodeFill=crypto.randomFillSync,ordinary=new WeakMap(),footThresholds=new WeakMap();
let finishObservation=null;
function endObservation(){try{finishObservation?.();}finally{finishObservation=null;}}

async function observedFixture(options={}){
 assert.equal(finishObservation,null);
 let G,flow,request=null,loads=0;
 const rows=[],thresholds=[];
 const h=await baseFixture({...options,nativeSetup(n,m){G=n.G;return options.nativeSetup?.(n,m);},applicationPorts(ports){
  assert(G&&!G.nw?.App);flow=G.PSFlow;
  const load=Object.getOwnPropertyDescriptor(G,'require'),rand=Object.getOwnPropertyDescriptor(flow,'random');
  assert(load?.writable&&rand?.writable);
  const scoped=Object.freeze({randomFillSync(target){
   assert(request&&request.fills===0);assert.equal(Object.prototype.toString.call(target),'[object Uint32Array]');assert.equal(target.length,2);
   const filled=Reflect.apply(nodeFill,crypto,[target]);assert.strictEqual(filled,target);request.fills++;return filled;
  }});
  function readModule(...args){const real=Reflect.apply(load.value,this,args);if(args[0]!=='node:crypto'||!request)return real;
   assert.strictEqual(real,crypto);loads++;return scoped;}
  Object.defineProperty(readModule,'resolve',Object.getOwnPropertyDescriptor(load.value,'resolve'));
  function readDraw(bound){
   assert.equal(arguments.length,1);assert.strictEqual(this,flow);assert(!request&&rows.length<16);assert(Number.isSafeInteger(bound)&&bound>0);
   const stack=new Error().stack,w=/\bdrawEntryWeather\b/.test(stack),ec=/\b(?:checkEncounterTrigger|selectEncounterCandidate|selectEncounterLevel|prepareOrdinaryEncounter)\b/.test(stack);
   assert.notEqual(w,ec,'unexpected or ambiguous caller of ordinary world entropy');
   const row={origin:w?'weather':'encounter',map:G.$gameMap.mapId(),bound,fills:0};
   request=row;try{const actual=Reflect.apply(rand.value,this,[bound]);assert(Number.isSafeInteger(actual)&&actual>=0&&actual<bound);
    assert.equal(row.fills,1);if(ec&&row.map===5&&bound===100)thresholds.push({belowFive:actual<5,belowOne:actual<1});
    rows.push(row);return actual;
   }finally{request=null;}
  }
  Object.defineProperty(G,'require',{...load,value:readModule});Object.defineProperty(flow,'random',{...rand,value:readDraw});
  finishObservation=()=>{assert.strictEqual(G.require,readModule);assert.strictEqual(flow.random,readDraw);assert.equal(loads,rows.length?1:0,'the ordinary plugin caches its lazily resolved Node entropy provider');Object.defineProperty(G,'require',load);Object.defineProperty(flow,'random',rand);};
  return options.applicationPorts?.(ports);
 }});
 assert.strictEqual(h.G,G);assert.strictEqual(h.flow,flow);assert.equal(rows.length,0,'no world RNG at bootstrap');ordinary.set(h.G,rows);footThresholds.set(h.G,thresholds);return h;
}
function expectOrdinary(h,bounds,origin='weather',expectedNative=[]){
 assert.deepEqual(h.draws,[],'ordinary mode must ignore the legacy test RNG');assert.deepEqual(h.nativeDraws,expectedNative,'only the explicitly expected native encounter counter draws');
 assert.deepEqual(ordinary.get(h.G),bounds.map(bound=>({origin,map:origin==='weather'?6:5,bound,fills:1})));
}
function expectFoot(h,chance){
 assert.equal(h.outcomes.length,1);const outcome=h.outcomes[0];assert.equal(outcome.status,'no-encounter');
 const flags=footThresholds.get(h.G);assert(flags.length>0);
 if(chance===1){
  const passedGrace=flags[0].belowFive;assert.equal(flags.length,passedGrace?2:1);
  const reason=passedGrace?(flags[1].belowOne?'repel':'miss'):'grace';assert.equal(outcome.reason,reason);
  expectOrdinary(h,{grace:[100],miss:[100,100],repel:[100,100,1,1]}[reason],'encounter');
 }else{
  assert.equal(flags.length,1);assert.equal(outcome.reason,'repel');
  expectOrdinary(h,[100,1,1],'encounter');
 }
}
return {fixture:observedFixture,expectOrdinary,expectFoot,endObservation,receipt:h=>ordinary.get(h.G).map(row=>({...row}))};
}
module.exports={fixture,flush,ordinaryObservers};
