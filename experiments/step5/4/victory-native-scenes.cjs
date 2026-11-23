'use strict';
// Pinned native scene scheduling around controlled render/preloaded-map ports.
// Install before product hooks so their actual constructor receipts stay intact.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function install(G,ROOT){
 const managers=fs.readFileSync(path.join(ROOT,'js/reactor_managers.js'),'utf8'),scenes=fs.readFileSync(path.join(ROOT,'js/reactor_scenes.js'),'utf8'),objects=fs.readFileSync(path.join(ROOT,'js/reactor_objects.js'),'utf8');
 const section=(text,name)=>{const a=text.indexOf(name+' = function'),b=text.indexOf('\n};',a);assert(a>=0&&b>a,name);return text.slice(a,b+4);};
 const base=G.Scene_MenuBase.prototype,oldMap=G.Scene_Map.prototype;
 G.Scene_Map=function Scene_Map(){this.initialize();this._mapLoaded=false;this._transfer=false;};G.Scene_Map.prototype=oldMap;oldMap.constructor=G.Scene_Map;
 base.stop??=function(){this._active=false;};
 const start=base.start;base.start=function(...args){const result=start.apply(this,args);this._active=true;return result;};
 oldMap.create=function(){base.create.call(this);this._messageWindow={};this._spriteset={};};oldMap.createDisplayObjects=function(){this._messageWindow={};this._spriteset={};};
 // A caller may already have installed the pinned Message -> Base busy chain.
 // Retain that constructor/prototype and add only the missing readiness seam.
 G.Scene_Message??=function(){};G.Scene_Message.prototype.isReady??=()=>true;
 G.DataManager.isMapLoaded=()=>true;
 for(const name of ['isReady','onMapLoaded'])vm.runInContext(section(scenes,'Scene_Map.prototype.'+name),G,{filename:'pinned-victory:Scene_Map.'+name});
 Object.assign(G.SceneManager,{_nextScene:null,_stack:[],isSceneChanging(){return this._nextScene!==null;},isCurrentSceneBusy:()=>false,isGameActive:()=>true,
  onSceneTerminate(){},onSceneCreate(){},onBeforeSceneStart(){},onSceneStart(){},terminate(){}});
 for(const name of ['goto','push','pop','changeScene','updateScene'])vm.runInContext(section(managers,'SceneManager.'+name),G,{filename:'pinned-victory:SceneManager.'+name});
 const push=G.SceneManager.push;G.SceneManager.push=function(C){this.pushed.push(C);return push.call(this,C);};
 G.Game_Player??=function Game_Player(){};
 G.Game_Player.prototype.reserveTransfer??=function(){throw Error('missing native reserve');};
 vm.runInContext(section(objects,'Game_Player.prototype.reserveTransfer'),G,{filename:'pinned-victory:Game_Player.reserveTransfer'});
 G.$gamePlayer??=new G.Game_Player();
 for(const[key,value]of Object.entries({_x:8,_y:9,_realX:8,_realY:9,_direction:2,_transferring:false,_vehicleType:'walk',_moveRouteForcing:false}))if(!Object.hasOwn(G.$gamePlayer,key))G.$gamePlayer[key]=value;
 G.$dataMap??={};
}
module.exports={install};
