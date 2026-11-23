'use strict';
// Native fixture adaptation from fixed 18f e3-mz-world-travel-fixture.cjs.
// Receives only the verified regular inputs; never compiles or searches private outputs.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function createNativeFixture({root,B}) {
 const support=require('../../experiments/step5/5/d-mz-integration-support.cjs');
 support.build=async()=>B; // Install before any downstream support captures build().
 const {frameFixture}=require('../../experiments/step5/5/d-mz-native-frame-support.cjs');
 const flush=()=>new Promise(setImmediate);
 // Same fixed full-Scene adapter, with require.resolve pointing to the real regular
 // production file. Preserve its actual App constructor/private issuer and callbacks.
async function fullFixture(options={}){
 const h=await frameFixture({withoutWorld:true,integrated:true,terrainTags:JSON.stringify({'0':{landAllowed:true,fishable:false,environment:'grass'}}),edit(game,content){
  for(const[name,species]of Object.entries(content.species)){species.ruleSpecies='Fixture'+name;species.types=['Normal'];}
  content.settings={AFFECTION_EFFECTS:false};content.mapMetadata={source:'literal',maps:{5:{environment:'cave'}}};options.edit?.(game,content);
 }}),G=h.G,E=B.E;
 G.$gameSystem._psGame=h.state();h.map._mapId=5;
 const managers=fs.readFileSync(path.join(path.dirname(process.env.PF_MZ_RUNTIME),'reactor_managers.js'),'utf8');
 const marker='SceneManager.isNextScene = function',start=managers.indexOf(marker),end=managers.indexOf('\n};',start);assert(start>=0&&end>start);
 vm.runInContext(managers.slice(start,end+4),G,{filename:'installed-MZ:SceneManager.isNextScene'});
 const windows=G.Window_Base.prototype;
 windows.initialize=function(rect){this.x=rect?.x||0;this.y=rect?.y||0;this.width=rect?.width||816;this.height=rect?.height||120;this.innerWidth=this.width-24;this.innerHeight=this.height-24;this.padding=12;this.contents={clear(){},fillRect(){},paintOpacity:255};};
 windows.resetFontSettings=function(){};windows.lineHeight=()=>36;windows.drawText=function(){};
 G.Window_Command=function(){};G.Window_Command.prototype=Object.create(windows);
 for(const key of ['setHandler','deactivate','hide','refresh'])G.Window_Command.prototype[key]=function(){};
 G.ConfigManager={makeData(){return{};},applyData(){}};
 await options.nativeSetup?.(h);
 const fieldPorts=await options.fieldPorts?.(h);
 const runtime={...E,...(fieldPorts||options.applicationPorts?{app:{...E.app,GameApplication:function(ports,settings){
  if(fieldPorts)assert.equal(Object.hasOwn(fieldPorts,'worldBattleScene'),false,'fixture must retain the actual private production issuer');
  const actual=fieldPorts?{...ports,fieldMoves:fieldPorts.fieldMoves,fieldEncounters:fieldPorts.fieldEncounters}:ports;
  options.applicationPorts?.(actual);
  return new E.app.GameApplication(actual,settings);
 }}}:{})};
 const req=name=>name==='./js/engine/build/production.cjs'?runtime:require(name);
 req.resolve=name=>name==='./js/engine/build/production.cjs'?path.join(root,'js/engine/build/production.cjs'):require.resolve(name);G.require=req;
 // The complete compiled IIFE owns constructor/issuer/ports. No extracted construction method or hand-issued test ticket.
 vm.runInContext(B.flow,G,{filename:'full-private-production:PS_BattleFlow.js'});
 const flow=G.PSFlow;flow._content=h.content;flow._dex={move:id=>h.content.moves[id]||null,species:()=>null,levelUpMoves:()=>null,sha:()=> 'fixture-only'};
 h.flow=flow;
 const game=flow.game,content=flow.content;
 if(options.onRead)flow.game=function(){const value=game.call(this);options.onRead(h);return value;};
 if(options.onContent)flow.content=function(){const value=content.call(this);options.onContent(h);return value;};
 flow.fast=true;flow.rng=n=>{h.draws.push(n);return 0;};flow.clock=()=>0;
 if(options.worldSource)await options.worldSource(G);else vm.runInContext(B.world,G,{filename:'full-private-production:PS_World.js'});
 const app=flow.app();h.app=app;
 return{...h,G,flow,app,flush,state:()=>G.$gameSystem._psGame};
}
 require('../../experiments/step5/5/world-scene-full-production-support.cjs').fixture=fullFixture;
 const {fixture:base}=require('../../experiments/step5/5/surf-production-native-support.cjs');
 const native=path.join(root,'js'),objects=fs.readFileSync(path.join(native,'reactor_objects.js'),'utf8'),scenes=fs.readFileSync(path.join(native,'reactor_scenes.js'),'utf8'),compat=fs.readFileSync(path.join(native,'libs/pixi_compat.js'),'utf8');
function install(G,name,text=scenes){const a=text.indexOf(name+' = function'),b=text.indexOf('\n};',a);assert(a>=0&&b>a,name);vm.runInContext(text.slice(a,b+4),G,{filename:'actual-native-e3:'+name});}
function mapData(id){return {width:10,height:8,tilesetId:1,scrollType:0,data:Array(10*8*6).fill(0),events:[null],meta:{},encounterList:[],disableDashing:false,autoplayBgm:false,autoplayBgs:false,parallaxLoopX:false,parallaxLoopY:false,parallaxSx:0,parallaxSy:0};}
function arrivalEvent(){return {id:1,name:'arrival',x:0,y:2,pages:[{conditions:{switch1Valid:false,switch2Valid:false,variableValid:false,selfSwitchValid:false,itemValid:false,actorValid:false},image:{tileId:0,characterName:'',characterIndex:0,direction:2,pattern:1},priorityType:0,through:false,trigger:1,moveType:0,moveSpeed:3,moveFrequency:3,moveRoute:{list:[{code:0,parameters:[]}],repeat:true,skippable:false,wait:false},walkAnime:true,stepAnime:false,directionFix:false,list:[{code:230,indent:0,parameters:[1]},{code:0,indent:0,parameters:[]}]}]};}
async function fixture(options={}){
 const trace=[],saves=[],requests=[],maps={5:mapData(5),6:mapData(6),7:mapData(7)};if(options.connection){maps[6].events[1]=arrivalEvent();if(options.autorun)maps[6].events[1].pages[0].trigger=3;}let h;
 h=await base({applicationPorts:options.applicationPorts,edit(game,content){
  content.moves.fly={id:'fly',name:'Fly',pp:15};content.moves.dig={id:'dig',name:'Dig',pp:10};content.moves.teleport={id:'teleport',name:'Teleport',pp:20};game.party[0].moves=[{id:options.move??'fly',pp:10,maxpp:{fly:15,dig:10,teleport:20}[options.move??'fly'],ppUps:0}];game.badges=Array(8).fill(true);game.world.visitedMaps=[5,6,7];game.world.escapePoint={mapId:7,x:1,y:1,direction:8};game.world.healingSpot={mapId:6,x:1,y:2};game.world.repelSteps=options.repel??0;
  content.mapMetadata={source:'joint-fixture',maps:{5:{outdoor:true,mapPosition:{regionId:0,x:0,y:0}},6:{outdoor:true,healingSpot:{mapId:6,x:0,y:2},weather:{type:'Rain',chance:100}},7:{outdoor:true}}};
  content.world.regionMaps={source:'joint-fixture',regions:[{id:0,nameKey:'r0',points:[{x:1,y:1,healingSpot:{mapId:6,x:1,y:2}}]}]};content.world.mapConnections={source:'joint-fixture',connections:[{a:{mapId:5,anchor:'E',offset:0},b:{mapId:6,anchor:'W',offset:0}}]};
  content.world.encounters.tables.push({mapId:6,version:0,types:{Land:{stepChance:1,slots:[{species:'A',weight:1,minLevel:5,maxLevel:5}]}}});options.edit?.(game,content);
 },async nativeSetup(n){
  const G=n.G,p=G.Scene_Map.prototype,oldPrototype=p;
  install(G,'Number.prototype.clamp',fs.readFileSync(path.join(native,'reactor_core.js'),'utf8'));
  const a=scenes.indexOf('function Scene_Map() {'),b=scenes.indexOf('\n}',a);assert(a>=0&&b>a);vm.runInContext(scenes.slice(a,b+2),G,{filename:'actual-native:Scene_Map-constructor'});G.Scene_Map.prototype=oldPrototype;oldPrototype.constructor=G.Scene_Map;
  G.Stage={prototype:{initialize(){}}};G.Scene_Base.prototype.createColorFilter=function(){};install(G,'Scene_Base.prototype.initialize');
  G.Scene_Message.prototype.initialize=G.Scene_MenuBase.prototype.initialize;G.Scene_Message.prototype.create=G.Scene_MenuBase.prototype.create;G.Scene_Message.prototype.start=G.Scene_MenuBase.prototype.start;
  for(const name of ['initialize','create','onMapLoaded','start','onTransferEnd','shouldAutosave','onTransfer'])install(G,'Scene_Map.prototype.'+name);
  for(const name of ['requestAutosave','isAutosaveEnabled','executeAutosave','onAutosaveSuccess','onAutosaveFailure'])install(G,'Scene_Base.prototype.'+name);
  const nativeStart=p.start;p.start=function(...args){const before=trace.filter(row=>row[0]==='interpreter-enter').length;if(options.startProbe)G.$gameMap.updateInterpreter();trace.push(['before-native-start',G.$gameMap.mapId(),G.PSWorld?.pending(),G.PSFlow?._app?.saveBlocked,G.$gameSystem._psGame.steps,trace.filter(row=>row[0]==='interpreter-enter').length-before]);return Reflect.apply(nativeStart,this,args);};
  const nativeInterpreter=G.Game_Map.prototype.updateInterpreter;G.Game_Map.prototype.updateInterpreter=function(...args){trace.push(['interpreter-enter',this.mapId(),G.$gameSystem._psGame.steps,G.PSFlow?._app?.saveBlocked]);return Reflect.apply(nativeInterpreter,this,args);};
  if(options.noSaveRequest)p.shouldAutosave=()=>false;
  G.SceneManager.clearStack=function(){this._stack=[];};G.SceneManager.isNextScene=function(C){return this._nextScene instanceof C;};
  p.createDisplayObjects=function(){this._mapNameWindow={open(){trace.push(['map-name']);}};trace.push(['display',G.$gameMap.mapId(),G.$gameSystem._psGame.world.visitedMaps.slice(),G.$gameSystem._psGame.world.weather.type]);};p.fadeInForTransfer=function(){};p.needsFadeIn=()=>false;
  G.ImageManager.clear=()=>{};G.EffectManager={clear(){}};
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
 G.PSWorld.loadSucceeded();G.SceneManager._scene.onMapLoaded();
 const app=h.app;const draw=h.flow.rng;h.flow.rng=n=>{trace.push(['rng',n,new Error().stack]);return draw(n);};let arrivals=0,selected,replyCount=0;const dispatch=G.PSWorld.completedSteps.dispatchArrival;G.PSWorld.completedSteps.dispatchArrival=function(...args){arrivals++;return Reflect.apply(dispatch,this,args);};
 const nativeStep=h.app.world.completeStep.bind(h.app.world);const outcomes=[],stepCalls=[];h.app.world.completeStep=(...args)=>{stepCalls.push(args[0]);return nativeStep(...args).then(outcome=>{outcomes.push(outcome);return outcome;});};
 const select=G.PSInventory.selectOwnedRepel;G.PSInventory.selectOwnedRepel=function(owner,selection,reply,hooks){selected={owner,selection,hooks};const handle=Reflect.apply(select,this,[owner,selection,value=>{replyCount++;return reply(value);},hooks]);selected.handle=handle;return handle;};
 const pump=async(predicate,max=140)=>{for(let i=0;i<max;i++){if(predicate())return;G.$gameMessage.clear();h.tick();await flush();}throw Error('E3 real IIFE joint pump exceeded: '+JSON.stringify({point:[G.$gameMap.mapId(),h.player.x,h.player.y],save:app.saveBlocked,pending:G.PSWorld.pending(),scene:G.SceneManager._scene?.constructor?.name,next:G.SceneManager._nextScene?.constructor?.name,inventory:G.PSInventory.current()?.view?.kind,diagnostics:G.PSWorld.diagnostics,trace}));};
 return {...h,G,app,trace,saves,maps,requests,pump,outcomes,stepCalls,quantity:id=>B.E.inventory.itemQuantity(G.$gameSystem._psGame.inventory,id,h.content.items),arrivals:()=>arrivals,selected:()=>selected,replies:()=>replyCount,state:()=>G.$gameSystem._psGame};
}
return {fixture,flush};
}
module.exports={createNativeFixture};
