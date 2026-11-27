'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {fixture}=require('./travel-parent-fixture.cjs');
const nativeRoot=process.env.PF_E3_NATIVE_ROOT;
const managers=fs.readFileSync(path.join(nativeRoot,'js/reactor_managers.js'),'utf8'),compat=fs.readFileSync(path.join(nativeRoot,'js/libs/pixi_compat.js'),'utf8');
function method(root,name,text){const start=text.indexOf(name+' = function'),end=text.indexOf('\n};',start);assert(start>=0&&end>start,name);vm.runInContext(text.slice(start,end+4),root,{filename:'installed-native:'+name});}
async function sceneFixture(options={}){
 const errors=[];const h=await fixture({nativeSetup({root,log,nativeScenes}){
  const mapPrototype=root.Scene_Map.prototype;
  const start=nativeScenes.indexOf('function Scene_Map() {'),end=nativeScenes.indexOf('\n}',start);assert(start>=0&&end>start);
  vm.runInContext(nativeScenes.slice(start,end+2),root,{filename:'installed-native:Scene_Map-constructor'});root.Scene_Map.prototype=mapPrototype;mapPrototype.constructor=root.Scene_Map;
  function Container(){if(options.fallback)throw Error('native-pixi-args-required');this.pixiCreated=true;}
  root.PIXI={TextureSource:function(){},Container,Sprite:null,TilingSprite:null,ObjectRenderer:null};root.window=root;root.compatLog=()=>{};root.isWindowLayerClass=()=>false;root.console={error(...args){errors.push(args.map(String).join(' '));},warn(){}};
  const parent=root.Scene_Message.prototype;Object.setPrototypeOf(parent,Container.prototype);Object.setPrototypeOf(mapPrototype,parent);parent.initialize=function(){options.initialize?.(this,root);};
  method(root,'Scene_Map.prototype.initialize',nativeScenes);mapPrototype.stop=function(){this._active=false;options.stop?.(this,root);};mapPrototype.terminate=function(){};mapPrototype.create=function(){this._started=false;};
  root.SceneManager._scene=null;root.SceneManager._nextScene=null;root.SceneManager._exiting=false;root.SceneManager.isSceneChanging=function(){return this._nextScene!==null;};root.SceneManager.isCurrentSceneBusy=()=>false;root.SceneManager.onSceneTerminate=()=>{};root.SceneManager.onSceneCreate=()=>{};
  method(root,'SceneManager.goto',managers);method(root,'SceneManager.changeScene',managers);
  const u=compat.indexOf('    window.MZGlobalUpgrade = function() {'),ue=compat.indexOf('\n    };',u);assert(u>=0&&ue>u);vm.runInContext(compat.slice(u,ue+7),root,{filename:'installed-native:MZGlobalUpgrade'});
 }});
 if(options.upgrade!==false)h.root.MZGlobalUpgrade();
 h.root.SceneManager._scene=new h.root.Scene_Map();h.root.SceneManager._scene._active=true;h.root.SceneManager._scene._started=true;h.root.SceneManager._nextScene=null;
 let issued;
 return {...h,errors,async run(){
  const prepared=h.app.prepareFieldShortcutSelection('shortcut',{kind:'move',memberId:'P1',moveId:'fly'});
  assert.equal(prepared.status,'prepared',JSON.stringify(prepared));issued=prepared.request;
  const result=await h.app.executeFieldShortcut(issued,{flySelection:{regionId:0,x:5,y:6,pointIndex:0,target:{mapId:2,x:1,y:1}}});
  assert.equal(result.status,'accepted',JSON.stringify(result));assert.equal(result.result.status,'awaiting-arrival');return result.result;
 },cancel(){return h.app.cancelFieldShortcut(issued);}};
}
module.exports={sceneFixture};
