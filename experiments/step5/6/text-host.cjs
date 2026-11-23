'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {host,ROOT}=require('./message-host.cjs');
// DOM selection/default editing and device delivery are controlled; scene/interpreter/button methods are installed host code.
function textHost({lang='zh',width=816,height=624,touchUI=false,configure=null}={}){
 let doc;
 const h=host(lang,width,height,false,(G,{load,objects,managers,sounds})=>{
  class Element{
   constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.style={};this.value='';this.selectionStart=this.selectionEnd=0;this.textContent='';}
   appendChild(e){this.children.push(e);e.parent=this;return e;}
   remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
   addEventListener(k,f){(this.listeners[k]??=[]).push(f);}
   removeEventListener(k,f){this.listeners[k]=(this.listeners[k]??=[]).filter(x=>x!==f);}
   setAttribute(k,v){this[k]=v;}
   focus(){doc.activeElement=this;}
   setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}
   dispatch(k,e={}){e.stopPropagation=()=>e.stopped=true;e.preventDefault=()=>e.prevented=true;for(const f of [...this.listeners[k]??[]])f(e);if(!e.stopped&&this!==doc)doc.dispatch(k,e);return e;}
  }
  doc=new Element('document');doc.body=new Element('body');doc.createElement=tag=>new Element(tag);G.document=doc;
  G.Rectangle=class{constructor(x=0,y=0,width=0,height=0){Object.assign(this,{x,y,width,height});}};
  G.ConfigManager={touchUI};G.TouchInput.clear=()=>{};G.TouchInput.isCancelled=()=>false;
  for(const n of ['Cancel','Cursor','Buzzer'])G.SoundManager['play'+n]=()=>sounds.push(n.toLowerCase());
  vm.runInContext(objects.slice(objects.indexOf('function Game_Variables()'),objects.indexOf('function Game_SelfSwitches()')),G);
  load(objects,['Game_Interpreter.prototype.command111','Game_Interpreter.prototype.command411','Game_Interpreter.prototype.skipBranch']);
  G.$dataSystem={variables:Array.from({length:21},(_,i)=>'Variable '+i)};G.$gameVariables=new G.Game_Variables();G.$gameMap.requestRefresh=()=>{};
  G.Scene_Base=function(){};G.Scene_Base.prototype.initialize=function(){this.children=[];};G.Scene_Base.prototype.addWindow=function(x){this.children.push(x);};
  const scenes=fs.readFileSync(path.join(ROOT,'js/reactor_scenes.js'),'utf8');
  load(scenes,['Scene_Base.prototype.create','Scene_Base.prototype.start','Scene_Base.prototype.stop','Scene_Base.prototype.terminate','Scene_Base.prototype.popScene','Scene_Base.prototype.buttonY','Scene_Base.prototype.buttonAreaTop','Scene_Base.prototype.buttonAreaHeight','Scene_Base.prototype.isBottomButtonMode']);
  G.Scene_Base.prototype.update=function(){for(const x of this.children)x.update?.();};G.Scene_Base.prototype.createWindowLayer=function(){};
  vm.runInContext(scenes.slice(scenes.indexOf('function Scene_MenuBase()'),scenes.indexOf('function Scene_Menu()')),G);
  G.Scene_MenuBase.prototype.createBackground=function(){};
  G.Scene_Map.prototype=Object.create(G.Scene_Base.prototype);G.Scene_Map.prototype.constructor=G.Scene_Map;G.Scene_Map.prototype.start=function(){};
  G.SceneManager._scene=new G.Scene_Map();G.SceneManager._stack=[];G.SceneManager._nextScene=null;
  load(managers,['SceneManager.goto','SceneManager.push','SceneManager.pop','SceneManager.isSceneChanging','SceneManager.prepareNextScene']);
  G.Sprite_Clickable=function(){};Object.assign(G.Sprite_Clickable.prototype,{initialize(){},isPressed:()=>false,update(){},setFrame(x,y,width,height){Object.assign(this,{width,height});}});
  G.ImageManager.loadSystem=()=>({isReady:()=>true,width:576});const sprites=fs.readFileSync(path.join(ROOT,'js/reactor_sprites.js'),'utf8');
  vm.runInContext(sprites.slice(sprites.indexOf('function Sprite_Button()'),sprites.indexOf('function Sprite_Character()')),G);
  // Native naming definitions remain dormant and must keep their original methods.
  vm.runInContext(scenes.slice(scenes.indexOf('function Scene_Name()'),scenes.indexOf('function Scene_Debug()')),G);
  const nativeName=G.Scene_Name.prototype.onInputOk;
  return {nativeName,...configure?.(G,{load,objects,managers,scenes,sprites,sounds})};
 });
 function transition(){const m=h.G.SceneManager;if(!m._nextScene)return;const next=m._nextScene;m._scene.terminate?.();m._scene=next;m._nextScene=null;if(next.constructor!==h.G.Scene_Map){next.create();next.start();}}
 const scene=()=>h.G.SceneManager._scene;
 function command(args={}){return {code:357,indent:0,parameters:['PS_Management','ShowTextInput','Text',{mode:'keyboard',resultVariableId:'1',initialVariableId:'0',initialZh:'',initialEn:'',minLength:'0',maxLength:'12',...args}]};}
 function show(args={}){h.enter([command(args),{code:0,indent:0,parameters:[]}]);transition();return scene();}
 function edit(value,a=value.length,b=a){const f=scene()._field;f.value=value;f.setSelectionRange(a,b);f.dispatch('input');return f.value;}
 function insert(value){const f=scene()._field,a=f.selectionStart,b=f.selectionEnd;return edit(f.value.slice(0,a)+value+f.value.slice(b),a+value.length);}
 function key(key,extra={}){const e={key,code:key==='Enter'||key==='Escape'?key:'Key'+key.toUpperCase(),keyCode:key==='Enter'?13:key==='Escape'?27:0,...extra};const result=scene()._field.dispatch('keydown',e);if(!extra.hold)doc.dispatch('keyup',e);return result;}
 function tick(ms=25,...keys){transition();if(scene().constructor===h.G.Scene_Map)h.tick(ms,...keys);else {h.G.Graphics.frameCount++;scene().update();}}
 return {...h,command,show,transition,scene,doc,edit,insert,key,tick,get balloon(){return h.balloon;}};
}
module.exports={textHost,ROOT};
