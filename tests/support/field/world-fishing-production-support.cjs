'use strict';
require('../world/regular-world-test-runtime.cjs').prepare(['PF_FISHING_HOST_OUT', 'PF_MZ_OBJECTS']);
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{types}=require('node:util');
const {build}=require('../world/mz-integration-support.cjs');
const {createMZAtomicStatePort}=require(path.join(process.env.PF_FISHING_HOST_OUT,'plugins/world/atomic-state-mz.js'));
const {runtime,nativeMessages,nativeMoveRoutes}=require('./fishing-host-fixtures.cjs');
const F=require('../saves/legacy-migration/fixtures.cjs');
const flush=()=>new Promise(setImmediate),value=value=>({status:'value',value});
async function fixture(options={}){
 const B=await build(),E=B.E,h=runtime(),ui=nativeMessages(h);nativeMoveRoutes(h);const G=h.root,events=[],effects=[],draws=[],sessions=[];let now=0,pending=null,settled,admission;
 G.performance.now=()=>now;h.map._mapId=h.map.id=7;h.player.isTransferring=()=>false;G.$dataMap={meta:{},encounterList:[]};G.TouchInput.clear=()=>{};G.Input.isRepeated=function(key){return this.keys.has(key);};
 const content=F.content(E);content.moves.tackle=content.moves.Tackle;
 for(const[name,species]of Object.entries(content.species)){species.ruleSpecies='Fixture'+name;species.types=['Normal'];}
 content.settings={AFFECTION_EFFECTS:false,FISHING_AUTO_HOOK:true,FISHING_BEGIN_COMMON_EVENT:options.beginEvent??0,FISHING_END_COMMON_EVENT:options.endEvent??0,...options.settings};
 content.mapMetadata={source:'test',maps:{7:{environment:'cave'}}};content.world={encounters:{source:'test',tables:[{mapId:7,version:0,types:options.noTable?{}:{OldRod:{stepChance:0,slots:[{species:'A',weight:1,minLevel:5,maxLevel:5}]}}}]}};
 G.$gameSystem._psGame=E.state.newGame({party:[F.member('P1',{hp:20})],content,bag:{oldrod:1}});
 const state=()=>G.$gameSystem._psGame;
 const port=createMZAtomicStatePort(G,{read:state,replace:next=>{G.$gameSystem._psGame=next;}},types.isProxy);
 let app;app=new E.app.GameApplication({wildGeneration:{switchOn:()=>({status:'value',value:false})},state:port,content:()=>({content}),sessions:{async create(request,state,setup){sessions.push({request,state,setup});return {result(){throw Error('unfinished');}};}},projection:{project(){}},
  random:n=>{draws.push(n);return 0;},clock:()=>1000,worldHost:{read:()=>({mapId:value(h.map.id),hour:value(21),cycling:value(false),diving:value(false)})},
  fishing:{facts:()=>G.PSWorld.runtimeInputs.fishing.facts(),presentation:{begin:(...args)=>G.PSWorld.runtimeInputs.fishing.presentation.begin(...args)}}});
 function Base(){this.initialize();}for(const key of ['initialize','create','start','update','terminate'])Base.prototype[key]=function(){};Base.prototype.isStarted=()=>true;Base.prototype.addWindow=function(){};Base.prototype.popScene=function(){manager.goto(MapScene);};
 function MapScene(){this.initialize();this._messageWindow=h.window;this._scrollTextWindow=ui.scroll;}MapScene.prototype=Object.create(Base.prototype);MapScene.prototype.constructor=MapScene;MapScene.prototype.onMapLoaded=function(){};
 MapScene.prototype.update=function(){events.push('native-map-frame');};MapScene.prototype.isMenuEnabled=()=>true;
 function Win(){this.contents={width:792,height:576,clear(){},fillRect(){},drawText(){}};}Win.prototype.textWidth=s=>String(s).length*8;
 const manager=G.SceneManager;Object.assign(manager,{_scene:new MapScene(),_nextScene:null,isGameActive:()=>G.document.hasFocus(),isSceneChanging:()=>false,
  push(C){this._scene?.terminate?.();this._scene=new C();this._scene.create?.();this._scene.onMapLoaded?.();this._scene.start?.();},goto(C){this.push(C);},pop(){this.goto(MapScene);}});
 const source=fs.readFileSync(path.join(path.dirname(process.env.PF_MZ_OBJECTS),'reactor_managers.js'),'utf8'),start=source.indexOf('SceneManager.updateScene = function'),end=source.indexOf('\n};',start);vm.runInContext(source.slice(start,end+4),G);
 Object.assign(G,{console,structuredClone,Date,window:G,Graphics:{frameCount:0,boxWidth:816,boxHeight:624},Scene_MenuBase:Base,Scene_Map:MapScene,Window_Base:Win,Rectangle:function(){},DataManager:{setupNewGame(){}},
  PluginManager:{parameters:()=>({...h.characters.profiles,TerrainTags:JSON.stringify({'7':{landAllowed:false,fishable:true,environment:'stillwater'}})}),registerCommand(){}},
  SoundManager:{playBuzzer(){events.push('buzzer');},playCancel(){},playOk(){}},
  PSFlow:{_app:app,app:()=>app,game:state,content:()=>content,translator:()=>E.i18n.translatorFor('en'),speciesName:s=>s,operationPending:()=>app.saveBlocked,
   openAdmittedWorldBattle(actual,receipt){assert.equal(actual,app);admission=receipt;events.push('admitted-to-scene');return true;}}});
 // Parent native interpreter surface is paused; the real fishing-owned child is updated directly by the leaf.
 G.Game_Map=function(){};G.Game_Map.prototype.updateInterpreter=function(){events.push('parent-interpreter');};Object.setPrototypeOf(h.map,G.Game_Map.prototype);
 G.Game_Event=function(){};G.Game_Event.prototype.updateParallel=function(){events.push('parallel-event');};G.Game_CommonEvent=function(){};G.Game_CommonEvent.prototype.update=function(){events.push('parallel-common');};
 vm.runInContext(B.inventory,G);vm.runInContext(B.world,G);
 const presentation=G.PSWorld.runtimeInputs.fishing.presentation,begin=presentation.begin;
 presentation.begin=(owner,emit,config)=>{const session=begin(owner,emit,config);return{sample:session.sample,dispose:session.dispose,run(effect){effects.push(effect);pending='id'in effect?effect:null;session.run(effect);}};};
 const tick=(ms=0,keys=[])=>{now+=ms;G.Graphics.frameCount++;G.Input.keys=new Set(keys);manager.updateScene();};
 const ready=()=>{tick();tick();};const press=key=>{tick(0,[key]);tick();};
 const view=()=>G.PSInventory.current();const choose=key=>{ready();for(let i=0;view()?.view.items?.[view().view.cursor]?.key!==key&&i<30;i++)press('down');assert.equal(view()?.view.items?.[view().view.cursor]?.key,key);press('ok');};
 const event=(id,list)=>{G.$dataCommonEvents[id]=vm.runInContext('('+JSON.stringify({list})+')',G);};
 if(options.beginList)event(options.beginEvent,options.beginList);
 return {B,E,h,G,app,content,events,effects,draws,sessions,state,view,tick,ready,press,choose,flush,event,ui,
  get pending(){return pending;},get settled(){return settled;},get admission(){return admission;},
  async start(){const handle=G.PSInventory.showBag();assert(handle);ready();const pocket=E.itemCatalog.itemOf(E.itemCatalog.catalogOf(content),'oldrod').pocket;for(let i=0;view()?.pocket!==pocket&&i<12;i++)press('right');assert.equal(view()?.pocket,pocket);press('ok');choose('use');for(let i=0;!(manager._scene instanceof MapScene)&&i<5;i++)tick();await flush();handle.promise?.then(v=>{settled=v;});return handle;},
  close(){h.window.terminateMessage();},endAnimation(){h.player.animation=false;h.player._animationPlaying=false;G.$gameTemp._animationQueue.length=0;},
  async finish(){for(let i=0;i<180&&G.PSWorld.pending();i++){if(['open-message','dots','bite-message','result-message'].includes(pending?.kind))this.close();if(pending?.kind==='exclamation')this.endAnimation();tick(400,effects.at(-1)?.kind==='shake'?['ok']:[]);await flush();}},
 };
}
module.exports={fixture,flush,command:(code,parameters=[])=>({code,indent:0,parameters})};
