'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'../../..');
const {host:nativeHost}=require('./field-host-support.cjs');
const F=require('../../../tests/support/saves/legacy-migration/fixtures.cjs');
let built;
async function build(){
 if(built)return built;
 if(process.env.PF_D_NOTICE_BUNDLES){const out=process.env.PF_D_NOTICE_BUNDLES;built={out,E:require(path.join(out,'production.cjs')),inventory:fs.readFileSync(path.join(out,'PS_Inventory.js'),'utf8'),world:fs.readFileSync(path.join(out,'PS_World.js'),'utf8'),flow:fs.readFileSync(path.join(out,'PS_BattleFlow.js'),'utf8')};return built;}
 const compiler=process.env.PF_D_MZ_COMPILER_ROOT||ROOT,art=process.env.PF_D_MZ_ART||path.join(ROOT,'build/step5-5-development-20261115/d-mz-integration-author');
 fs.mkdirSync(art,{recursive:true});const out=fs.mkdtempSync(path.join(art,'private-bundles-'));
 const {build:vite}=await import(path.join(compiler,'src/node_modules/vite/dist/node/index.js'));
 const entries=[['production','src/framework/production.ts','cjs'],['PS_Inventory','src/plugins/PS_Inventory.ts','iife'],['PS_World','src/plugins/PS_World.ts','iife'],['PS_BattleFlow','src/plugins/PS_BattleFlow.ts','iife']];
 for(const [name,entry,format]of entries)await vite({configFile:false,root:path.join(ROOT,'src'),logLevel:'error',build:{target:'es2022',outDir:out,emptyOutDir:false,minify:false,sourcemap:true,lib:{entry:path.join(ROOT,entry),name:name+'Test',formats:[format],fileName:()=>name+(format==='cjs'?'.cjs':'.js')},rolldownOptions:{external:[/^node:/,'pixi.js']}}});
 built={out,E:require(path.join(out,'production.cjs')),inventory:fs.readFileSync(path.join(out,'PS_Inventory.js'),'utf8'),world:fs.readFileSync(path.join(out,'PS_World.js'),'utf8'),flow:fs.readFileSync(path.join(out,'PS_BattleFlow.js'),'utf8')};return built;
}
async function fixture(options={}){
 const B=await build(),E=B.E,h=nativeHost(),G=h.root,calls=[],messages=[],commands={},events={};
 const content=F.content(E);content.moves.tackle=content.moves.Tackle;content.moves.growl=content.moves.Growl;content.world={encounters:{source:'d-mz-test',tables:options.mode==='framework'||options.mode===undefined?[{mapId:5,version:0,types:{Land:{stepChance:100,slots:[{species:'A',weight:1,minLevel:5,maxLevel:5}]}}}]:[]}};
 const member=E.memberFactory.createMember({species:'A',level:5,id:'d-mz-player',owner:{id:1,name:'D',gender:0,language:2}},content,n=>0);
 let state=E.state.newGame({party:[member],bag:options.bag??{repel:2,potion:3},money:12,content});state.world.repelSteps=options.repel??0;state.world.happinessSteps=options.happinessSteps??0;options.edit?.(state,content);let writes=0;
 const draws=[];let app;
 app=new E.app.GameApplication({state:{read:()=>state,replace:next=>{writes++;state=next;}},sessions:{async create(){throw Error('no battle in D first increment');}},content:()=>({content}),projection:{project(){}},random:n=>{draws.push(n);return 0;},clock:()=>0,worldHost:{read:()=>({mapId:{status:'value',value:h.map.id},hour:{status:'value',value:20},cycling:{status:'value',value:false},diving:{status:'value',value:false}})},completedSteps:{current:()=>G.PSWorld.completedSteps.current(),openRepelSelection:r=>G.PSWorld.completedSteps.openRepelSelection(r),present:r=>G.PSWorld.completedSteps.present(r),dispatchArrival:r=>{calls.push(['arrival-parent-lock',app.encounterBlocked,app.saveBlocked]);return G.PSWorld.completedSteps.dispatchArrival(r);}}});
 const input={pressed:new Set(),trigger:new Set(),repeat:new Set(),keyMapper:{},isPressed(k){return this.pressed.has(k);},isTriggered(k){return this.trigger.has(k);},isRepeated(k){return this.repeat.has(k);},clear(){this.pressed.clear();this.trigger.clear();this.repeat.clear();}};
 function Base(){this.initialize();}for(const name of ['initialize','create','start','update','terminate'])Base.prototype[name]=function(){};Base.prototype.isStarted=()=>true;Base.prototype.addWindow=function(){};Base.prototype.popScene=function(){manager.goto(MapScene);};
 function MapScene(){this.initialize();}MapScene.prototype=Object.create(Base.prototype);MapScene.prototype.constructor=MapScene;MapScene.prototype.onMapLoaded=function(){};MapScene.prototype.update=function(){h.player.update(true);};
 function Win(){this.contents={width:792,height:576,clear(){},fillRect(){},drawText(){}};}Win.prototype.textWidth=s=>String(s).length*8;
 let manager={_scene:null,_nextScene:null,isSceneChanging:()=>false,push(C){this._scene?.terminate();this._scene=new C();this._scene.create();this._scene.onMapLoaded?.();this._scene.start();},goto(C){this.push(C);},updateScene(){this._scene?.update();}};
 if(options.functionManager){
  const source=fs.readFileSync(path.join(ROOT,'js/reactor_managers.js'),'utf8'),a=source.indexOf('function SceneManager() {'),b=source.indexOf('\n}',a);if(a<0||b<a)throw Error('pinned static SceneManager declaration missing');
  vm.runInContext(source.slice(a,b+2),G,{filename:'pinned-real-static-SceneManager'});const methods=manager;manager=G.SceneManager;Object.assign(manager,methods,{_exiting:false,isGameActive:()=>true});
  for(const name of ['updateScene','isSceneChanging']){const a=source.indexOf('SceneManager.'+name+' = function'),b=source.indexOf('\n};',a);if(a<0||b<a)throw Error('pinned static method missing');vm.runInContext(source.slice(a,b+4),G,{filename:'pinned-static-SceneManager.'+name});}
 }
 Object.assign(G.Game_Interpreter.prototype,{setWaitMode(m){this._waitMode=m;},updateWaitMode(){return false;},clear(){},terminate(){}});
 Object.assign(G,{console,structuredClone,Date,performance:{now:()=>G.Graphics.frameCount*1000/60},Input:input,TouchInput:{clear(){},isCancelled:()=>false},Graphics:{boxWidth:816,boxHeight:624,frameCount:0},Scene_MenuBase:Base,Scene_Map:MapScene,SceneManager:manager,Window_Base:Win,Rectangle:function(){},PluginManager:{parameters:()=>({}),registerCommand(p,n,f){commands[p+':'+n]=f;}},DataManager:{setupNewGame(){}},SoundManager:{playBuzzer(){},playCancel(){},playActorDamage(){calls.push(['poison-sound']);}},$dataMap:{meta:options.mode==='legacy-note'?{PSEncounter:'A,1,5'}:{},encounterList:options.mode==='mz-native'?[{troopId:1}]:[]},$gameScreen:{_flashDuration:0,changeWeather(){},startFlash(color,duration){this._flashDuration=duration;calls.push(['flash',color,duration]);}},$gameMessage:{busy:false,isBusy(){return this.busy;},add(text){if(options.messageFailure)throw Error('message-failed');messages.push(text);this.busy=true;}},document:{addEventListener(k,f){(events[k]??=[]).push(f);}},addEventListener(k,f){(events[k]??=[]).push(f);},PSFlow:{_app:app,app:()=>app,game:()=>state,content:()=>content,translator:()=>E.i18n.translatorFor('en'),speciesName:s=>s,operationPending:()=>app.saveBlocked,encounterHost:{nativeEncounter:h.nativeEncounter,legacyEncounter:h.legacyEncounter,makeCount:(p,args)=>Reflect.apply(G.Game_Player.prototype.makeEncounterCount,p,args),updateCount:(p,args)=>Reflect.apply(G.Game_Player.prototype.updateEncounterCount,p,args)}}});
 // Freeze the actual native methods before installing the production World dispatchers.
 const makeCount=G.Game_Player.prototype.makeEncounterCount,updateCount=G.Game_Player.prototype.updateEncounterCount;G.PSFlow.encounterHost.makeCount=(p,args)=>Reflect.apply(makeCount,p,args);G.PSFlow.encounterHost.updateCount=(p,args)=>Reflect.apply(updateCount,p,args);
 G.require=name=>{if(name==='node:util')return require(name);throw Error('unexpected D fixture require '+name);};
 G.window=G;G.$gamePlayer.isTransferring=()=>false;
 vm.runInContext(B.inventory,G);vm.runInContext(B.world,G);manager._scene=new MapScene();
 const tick=()=>{G.Graphics.frameCount++;if(G.$gameScreen._flashDuration>0)G.$gameScreen._flashDuration--;manager.updateScene();input.trigger.clear();input.repeat.clear();};
 const ready=()=>{tick();tick();};const press=key=>{input.pressed.add(key);input.trigger.add(key);input.repeat.add(key);tick();input.pressed.delete(key);tick();};
 const view=()=>G.PSInventory.current();const choose=key=>{ready();for(let n=0;view()?.view.items?.[view().view.cursor]?.key!==key&&n<30;n++)press('down');if(view()?.view.items?.[view().view.cursor]?.key!==key)throw Error('missing choice '+key);press('ok');};
 const settle=async()=>{await new Promise(setImmediate);tick();await new Promise(setImmediate);};
 const complete=()=>{h.player.directionInput=6;tick();h.player.directionInput=0;while(h.player.isMoving())tick();};
 return {...h,E,B,G,app,content,nativeDraws:h.draws,draws,calls,messages,manager,input,tick,ready,press,choose,view,settle,complete,state:()=>state,writes:()=>writes,quantity:id=>E.inventory.itemQuantity(state.inventory,id,content.items)};
}
module.exports={build,fixture,ROOT};
