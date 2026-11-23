'use strict';
// Bounded initial native lifecycle. Only decorative resource/renderer hooks are facades.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function install({root:G,maps,nativeScenes}){
 const managers=fs.readFileSync(path.join(process.env.PF_E3_NATIVE_ROOT,'js/reactor_managers.js'),'utf8'),compat=fs.readFileSync(path.join(process.env.PF_E3_NATIVE_ROOT,'js/libs/pixi_compat.js'),'utf8');
 function method(name,text=nativeScenes){const a=text.indexOf(name+' = function'),b=text.indexOf('\n};',a);assert(a>=0&&b>a,name);vm.runInContext(text.slice(a,b+4),G,{filename:'pinned-initial-source:'+name});}
 function ctor(name){const a=nativeScenes.indexOf('function '+name+'() {'),b=nativeScenes.indexOf('\n}',a);assert(a>=0&&b>a,name);vm.runInContext(nativeScenes.slice(a,b+2),G,{filename:'pinned-initial-source:'+name});}
 G.Stage={prototype:{initialize(){}}};G.ImageManager={isReady:()=>true,clear(){}};G.EffectManager={isReady:()=>true,clear(){}};G.FontManager={isReady:()=>true};
 ctor('Scene_Base');G.Scene_Base.prototype=Object.create(G.Stage.prototype);G.Scene_Base.prototype.constructor=G.Scene_Base;G.Scene_Base.prototype.createColorFilter=function(){};G.Scene_Base.prototype.terminate=function(){};
 for(const name of['initialize','start','stop','isStarted','isActive','isReady'])method('Scene_Base.prototype.'+name);
 ctor('Scene_Message');G.Scene_Message.prototype=Object.create(G.Scene_Base.prototype);G.Scene_Message.prototype.constructor=G.Scene_Message;method('Scene_Message.prototype.initialize');G.Scene_Message.prototype.create=function(){};
 const previous=G.Scene_Map.prototype;ctor('Scene_Map');Object.setPrototypeOf(previous,G.Scene_Message.prototype);G.Scene_Map.prototype=previous;previous.constructor=G.Scene_Map;
 const display=previous.createDisplayObjects;previous.createDisplayObjects=function(...args){const result=Reflect.apply(display,this,args);this._mapNameWindow={open(){}};return result;};
 for(const name of['initialize','create','isReady','onTransfer'])method('Scene_Map.prototype.'+name);
 G.DataManager.loadMapData=id=>{assert(Object.hasOwn(maps,id));G.$dataMap=maps[id];};G.DataManager.isMapLoaded=()=>G.$dataMap!==null;
 Object.assign(G.SceneManager,{_scene:null,_nextScene:null,_exiting:false,isSceneChanging(){return this._nextScene!==null;},isCurrentSceneBusy:()=>false,onSceneTerminate(){},onSceneCreate(){},onBeforeSceneStart(){},onSceneStart(){}});
 for(const name of['goto','changeScene','updateScene'])method('SceneManager.'+name,managers);
 function Container(){}G.PIXI={TextureSource:function(){},Container,Sprite:null,TilingSprite:null,ObjectRenderer:null};G.window=G;G.compatLog=()=>{};G.isWindowLayerClass=()=>false;
 const a=compat.indexOf('    window.MZGlobalUpgrade = function() {'),b=compat.indexOf('\n    };',a);assert(a>=0&&b>a);vm.runInContext(compat.slice(a,b+7),G,{filename:'pinned-initial-source:MZGlobalUpgrade'});
}
function start(G){G.MZGlobalUpgrade();G.SceneManager.goto(G.Scene_Map);G.SceneManager.changeScene();G.SceneManager.updateScene();assert(G.SceneManager._scene instanceof G.Scene_Map);assert.equal(G.SceneManager._scene._started,true);assert.equal(G.SceneManager._nextScene,null);}
module.exports={install,start};
