'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'../../..');
const {host:nativeHost}=require('./field-host-support.cjs');
const {createNativeSceneManager,createNativeFrameTick}=require('./native-frame-manager-support.cjs');
const F=require('../../../tests/support/saves/legacy-migration/fixtures.cjs');
let built;
async function build(){return require('./d-mz-integration-support.cjs').build();}
async function fixture(options={}){
 const B=await build(),E=B.E,h=nativeHost(),G=h.root,calls=[],messages=[],commands={},events={};
 const content=F.content(E);content.moves.tackle=content.moves.Tackle;content.moves.growl=content.moves.Growl;content.world={encounters:{source:'d-mz-test',tables:options.mode==='framework'||options.mode===undefined?[{mapId:5,version:0,types:{Land:{stepChance:100,slots:[{species:'A',weight:1,minLevel:5,maxLevel:5}]}}}]:[]}};
 const member=E.memberFactory.createMember({species:'A',level:5,id:'d-mz-player',owner:{id:1,name:'D',gender:0,language:2}},content,n=>0);
 let state=E.state.newGame({party:[member],bag:options.bag??{repel:2,potion:3},money:12,content});state.world.repelSteps=options.repel??0;state.world.happinessSteps=options.happinessSteps??0;options.edit?.(state,content);let writes=0;
 const draws=[],sessions=[];const handle={result(){throw Error('unfinished-session');}};let app;
 app=new E.app.GameApplication({wildGeneration:{switchOn:()=>({status:'value',value:false})},state:{read:()=>state,replace:next=>{writes++;state=next;}},sessions:{async create(request,state,setup){if(!options.integrated)throw Error('no battle in D first increment');sessions.push({request,state,setup});return options.sessionFailure?Promise.reject(Error('session-failure')):handle;}},content:()=>({content:G.PSFlow?G.PSFlow.content():content}),projection:{project(){}},random:n=>G.PSFlow.random(n),clock:()=>0,worldHost:{read:()=>({mapId:{status:'value',value:h.map.id},hour:{status:'value',value:20},cycling:{status:'value',value:false},diving:{status:'value',value:false}})},...(options.integrated?{ordinaryEncounters:{read:step=>G.PSWorld.runtimeInputs.ordinary.read(step)}}:{}),completedSteps:{current:()=>G.PSWorld.completedSteps.current(),openRepelSelection:r=>G.PSWorld.completedSteps.openRepelSelection(r),present:r=>G.PSWorld.completedSteps.present(r),dispatchArrival:r=>{calls.push(['arrival-parent-lock',app.encounterBlocked,app.saveBlocked]);return G.PSWorld.completedSteps.dispatchArrival(r);}}});
 const input={pressed:new Set(),trigger:new Set(),repeat:new Set(),keyMapper:{},isPressed(k){return this.pressed.has(k);},isTriggered(k){return this.trigger.has(k);},isRepeated(k){return this.repeat.has(k);},clear(){this.pressed.clear();this.trigger.clear();this.repeat.clear();}};
 function Base(){this.initialize();}for(const name of ['initialize','create','start','update','terminate'])Base.prototype[name]=function(){};Base.prototype.isStarted=()=>true;Base.prototype.addWindow=function(){};Base.prototype.popScene=function(){manager.goto(MapScene);};
 function MapScene(){this.initialize();}MapScene.prototype=Object.create(Base.prototype);MapScene.prototype.constructor=MapScene;MapScene.prototype.onMapLoaded=function(){};MapScene.prototype.update=function(){h.player.update(true);};
 function Win(){this.contents={width:792,height:576,clear(){},fillRect(){},drawText(){}};}Win.prototype.textWidth=s=>String(s).length*8;
 const runtime=path.dirname(process.env.PF_MZ_RUNTIME||path.join(ROOT,'js/reactor_objects.js'))+path.sep;
 const manager=createNativeSceneManager(G,fs.readFileSync(runtime+'reactor_managers.js','utf8'));
 Object.assign(G.Game_Interpreter.prototype,{setWaitMode(m){this._waitMode=m;},updateWaitMode(){return false;},clear(){},terminate(){}});
 Object.assign(G,{console,structuredClone,Date,performance:{now:()=>G.Graphics.frameCount*1000/60},Input:input,TouchInput:{clear(){},isCancelled:()=>false},Graphics:{boxWidth:816,boxHeight:624,frameCount:0},Scene_MenuBase:Base,Scene_Map:MapScene,SceneManager:manager,Window_Base:Win,Rectangle:function(){},PluginManager:{parameters:()=>({TerrainTags:options.terrainTags??'{}'}),registerCommand(p,n,f){commands[p+':'+n]=f;}},DataManager:{setupNewGame(){}},SoundManager:{playBuzzer(){},playCancel(){},playActorDamage(){calls.push(['poison-sound']);}},$dataMap:{meta:options.mode==='legacy-note'?{PSEncounter:'A,1,5'}:{},encounterList:options.mode==='mz-native'?[{troopId:1}]:[]},$gameScreen:{_flashDuration:0,changeWeather(){},startFlash(color,duration){this._flashDuration=duration;calls.push(['flash',color,duration]);}},$gameMessage:{busy:false,isBusy(){return this.busy;},add(text){if(options.messageFailure)throw Error('message-failed');messages.push(text);this.busy=true;}},document:{addEventListener(k,f){(events[k]??=[]).push(f);}},addEventListener(k,f){(events[k]??=[]).push(f);},PSFlow:{random:n=>{draws.push(n);return 0;},_app:app,app:()=>app,game:()=>state,content:()=>content,translator:()=>E.i18n.translatorFor('en'),speciesName:s=>s,operationPending:()=>app.saveBlocked,encounterHost:{nativeEncounter:h.nativeEncounter,legacyEncounter:h.legacyEncounter,makeCount:(p,args)=>Reflect.apply(G.Game_Player.prototype.makeEncounterCount,p,args),updateCount:(p,args)=>Reflect.apply(G.Game_Player.prototype.updateEncounterCount,p,args)}}});
 // Freeze the actual native methods before installing the production World dispatchers.
 const makeCount=G.Game_Player.prototype.makeEncounterCount,updateCount=G.Game_Player.prototype.updateEncounterCount;G.PSFlow.encounterHost.makeCount=(p,args)=>Reflect.apply(makeCount,p,args);G.PSFlow.encounterHost.updateCount=(p,args)=>Reflect.apply(updateCount,p,args);
 G.$gameTemp.isPlaytest=()=>false;G.require=name=>{if(name==='node:util')return require(name);throw Error('unexpected D fixture require '+name);};G.window=G;G.$gamePlayer.isTransferring=()=>false;

 const install=(file,name)=>{const source=fs.readFileSync(file,'utf8'),start=source.indexOf(name+' = function'),end=source.indexOf('\n};',start);if(start<0||end<=start)throw Error('missing native '+name);vm.runInContext(source.slice(start,end+4),G,{filename:'native-independent:'+name});};
 Base.prototype.initialize=function(){this._started=false;};Base.prototype.start=function(){this._started=true;};Base.prototype.stop=function(){this._started=false;};Base.prototype.isStarted=function(){return this._started;};Base.prototype.isReady=()=>true;Base.prototype.isBusy=()=>false;Base.prototype.destroy=function(){};Base.prototype.popScene=function(){manager.pop();};
 MapScene.prototype.isReady=function(){if(!this._loaded){this._loaded=true;this.onMapLoaded();}return true;};
 G.Scene_Base=Base;for(const name of ['start','stop','isStarted','isActive','popScene'])install(runtime+'reactor_scenes.js','Scene_Base.prototype.'+name);MapScene.prototype.update=function(){h.player.update(this.isActive());};
 G.Game_Character.prototype.increaseSteps=function(){calls.push(['native-character-increase']);};G.$gameParty.increaseSteps=()=>calls.push(['native-party-increase']);
 h.player.isNormal=()=>true;h.player.areFollowersGathering=()=>false;h.player.getInputDirection=()=>h.player.directionInput||0;h.player.executeMove=function(d){this.moveStraight(d);};h.player.getOnOffVehicle=()=>false;h.player.checkEventTriggerThere=()=>{};h.temp.isDestinationValid=()=>false;
 for(const name of ['increaseSteps','canMove','moveByInput','triggerAction','triggerButtonAction','triggerTouchAction'])install(runtime+'reactor_objects.js','Game_Player.prototype.'+name);
 vm.runInContext(B.inventory,G);if(!options.withoutWorld)vm.runInContext(options.transformWorld?options.transformWorld(B.world):B.world,G);manager._scene=new MapScene();manager._scene.isReady();manager._scene.start();

 const tick=createNativeFrameTick(G,manager,input);
 const ready=()=>{tick();tick();};const press=key=>{input.pressed.add(key);input.trigger.add(key);input.repeat.add(key);tick();input.pressed.delete(key);tick();};
 const view=()=>G.PSInventory.current();const choose=key=>{ready();for(let n=0;view()?.view.items?.[view().view.cursor]?.key!==key&&n<30;n++)press('down');if(view()?.view.items?.[view().view.cursor]?.key!==key)throw Error('missing choice '+key);press('ok');};
 const settle=async()=>{await new Promise(setImmediate);tick();await new Promise(setImmediate);};
 const complete=()=>{h.player.directionInput=6;tick();h.player.directionInput=0;while(h.player.isMoving())tick();};
 return {...h,E,B,G,app,content,eventListeners:events,nativeDraws:h.draws,draws,sessions,handle,calls,messages,manager,input,tick,ready,press,choose,view,settle,complete,state:()=>state,writes:()=>writes,quantity:id=>E.inventory.itemQuantity(state.inventory,id,content.items)};
}


// Frame order is copied from the installed MZ methods, including moveByInput before Scene_Map.updateEncounter.
function installFullMapFrame(h){
 const G=h.G,p=G.Scene_Map.prototype,source=fs.readFileSync(path.join(path.dirname(process.env.PF_MZ_RUNTIME||path.join(ROOT,'js/reactor_objects.js')),'reactor_scenes.js'),'utf8');
 G.Input.isLongPressed=()=>false;G.TouchInput.isLongPressed=()=>false;G.Scene_Message={prototype:{update(){}}};G.$gameTimer={update(){}};h.map.update=()=>{};G.$gameScreen.update=()=>{};
 for(const name of ['updateDestination','updateMenuButton','updateMapNameWindow','updateWaitCount','checkGameover','updateCallMenu','updateCallDebug','updateEncounterEffect'])p[name]=()=>{};
 p.isFading=()=>false;
 for(const name of ['update','updateMainMultiply','updateMain','isPlayerActive','isFastForward','isSceneChangeOk','updateScene','updateTransferPlayer','updateEncounter']){const marker='Scene_Map.prototype.'+name+' = function',start=source.indexOf(marker),end=source.indexOf('\n};',start);if(start<0||end<=start)throw Error('missing native map '+name);vm.runInContext(source.slice(start,end+4),G,{filename:'native-d-r1:Scene_Map.'+name});}
 function Battle(){G.Scene_MenuBase.call(this);}Battle.prototype=Object.create(G.Scene_MenuBase.prototype);Battle.prototype.constructor=Battle;G.Scene_Battle=Battle;
 return h;
}
// This fixture executes a slice of the compiled plugin. Keep its lexical
// capability dependencies from that same build, rather than granting test mode
// or substituting a function that always authorizes/denies capabilities.
function legacyScope(source) {
 const one=(regex,label)=>{const hits=[...source.matchAll(regex)];if(hits.length!==1)throw Error('compiled legacy scope identity: '+label);return hits[0][0];};
 const region=name=>one(new RegExp('^\\s*//\\#region (?:src/)?plugins/'+name+'\\.ts\\r?$[\\s\\S]*?^\\s*//\\#endregion\\r?$','gm'),name);
 const declaration=name=>one(new RegExp('^\\s*const '+name+' = [^\\n]+;\\r?$','gm'),name);
 return [region('isolated-profile-contract'),region('isolated-test-scope'),declaration('testScope'),declaration('canTest'),declaration('battleCapabilities'),
   'if(testScope!==null||canTest())throw Error("unexpected isolated authority in ordinary legacy fixture");'].join('\n')+'\n';
}
async function frameFixture(options={}){
 const h=installFullMapFrame(await fixture(options));h.offers=[];
 const observe=kind=>({kind,frame:h.G.Graphics.frameCount,x:h.player.x,realX:h.player._realX,moving:h.player.isMoving(),appPending:h.app.saveBlocked,hostPending:!!h.G.PSWorld?.pending(),nativeDraws:[...h.nativeDraws],draws:[...h.draws]});
 const native=h.G.BattleManager.setup;h.G.BattleManager.setup=function(...args){h.offers.push(observe('native'));return native.apply(this,args);};
 if(options.mode==='legacy-note'){
  // Exercise the real compiled legacy handler and real App.prepareEncounter; only the final scene handoff is a fake.
  const B=await build(),start=B.flow.indexOf('const legacyExecuteEncounter = function()'),end=B.flow.indexOf('\n\t\tif (G.Game_Player) {',start);if(start<0||end<=start)throw Error('compiled legacy handler unavailable');
  const flow=h.G.PSFlow;let seq=0;Object.assign(flow,{running:false,perf:{},nextSeq:()=>++seq,mapEncounters:()=>({data:{table:{regions:[],slots:[{species:'A',weight:1,minLevel:5,maxLevel:5}]},problems:[]}}),encounter:(table,region)=>h.app.prepareEncounter(table,region),tryOpenBattle(request){if(h.app.encounterBlocked||this.operationPending())throw Error('legacy-external-operation-gate');h.offers.push({...observe('legacy'),request});this.running=true;h.G.SceneManager.push(h.G.Scene_Battle);return true;}});
  vm.runInContext('(function(G,PSFlow){let heldEncounterGate=null;const baseExecuteEncounter=()=>false;'+legacyScope(B.flow)+B.flow.slice(start,end)+';PSFlow.encounterHost.legacyEncounter=player=>Reflect.apply(legacyExecuteEncounter,player,[]);})(globalThis,globalThis.PSFlow);',h.G,{filename:'compiled-production:legacyExecuteEncounter'});
 }
 return h;
}
module.exports={build,fixture,frameFixture,ROOT};
