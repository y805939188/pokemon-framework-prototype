'use strict';
// Production message/window geometry and createContents; only bitmap rendering and frame refresh are controlled.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {host,ROOT}=require('./message-host.cjs');
function rowGeometry(G,{load,draws,windows}){
  const core=fs.readFileSync(path.join(ROOT,'js/reactor_core.js'),'utf8'),scenes=fs.readFileSync(path.join(ROOT,'js/reactor_scenes.js'),'utf8');
  for(const name of ['width','height','innerWidth','innerHeight']){
   const a=core.indexOf('Object.defineProperty(Window.prototype, "'+name+'",'),b=core.indexOf('\n});',a);assert(a>=0&&b>a,name);vm.runInContext(core.slice(a,b+4),G);
  }
  G.Window.prototype._refreshAllParts=function(){};load(core,['Window.defaultMargin']);
  G.Rectangle=function(x=0,y=0,width=0,height=0){Object.assign(this,{x,y,width,height});};
  G.Rectangle.prototype.pad=function(x,y=x){this.x-=x;this.y-=y;this.width+=x*2;this.height+=y*2;};
  const counts={created:0,destroyed:0,cleared:0};
  G.Bitmap=function(w,h){counts.created++;Object.assign(this,{width:w,height:h,fontBold:false,fontItalic:false,visible:[]});};
  G.Bitmap.prototype={destroy(){counts.destroyed++;},blt(){},clearRect(){},gradientFillRect(){},strokeRect(){},clear(){counts.cleared++;this.visible=[];},measureTextWidth:t=>Array.from(t).length*10,
   drawText(text,x,y,w,h){if(text){this.visible.push({text,x,y});draws.push({text,x,y,w,h,bold:this.fontBold,italic:this.fontItalic,color:this.textColor});}}};
  G.$gameSystem.windowPadding=()=>12;G.$dataSystem={variables:Array(32).fill('result'),...G.$dataSystem,advanced:{windowMargin:4}};
  load(windows,['Window_Base.prototype.createContents']);
  G.Window_Base.prototype.initialize=function(rect){Object.assign(this,{_width:0,_height:0,_padding:12,padding:12,visible:true,active:false,openness:0,pause:false},rect);this.createContents();};
  G.Scene_Base=function(){};G.Scene_Message=function(){};load(scenes,['Scene_Base.prototype.calcWindowHeight','Scene_Message.prototype.messageWindowRect']);
  const scene=G.SceneManager._scene;scene.calcWindowHeight=G.Scene_Base.prototype.calcWindowHeight;
  return {counts,rect:()=>G.Scene_Message.prototype.messageWindowRect.call(scene)};
}
function rowHost(lang='zh',width=816,height=624,animate=false){return host(lang,width,height,animate,rowGeometry);}
module.exports={rowHost,rowGeometry};
