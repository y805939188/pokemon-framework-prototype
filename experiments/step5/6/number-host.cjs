'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {host,ROOT}=require('./message-host.cjs');
function numberHost({lang='zh',width=816,height=624,touchUI=false,animate=false}={}){
 let number,refreshes=0;
 const h=host(lang,width,height,animate,(G,{load,windows,objects,sounds})=>{
  vm.runInContext('Number.prototype.clamp=function(a,b){return Math.min(Math.max(this,a),b);};Number.prototype.padZero=function(n){return String(this).padStart(n,"0");};Array.prototype.clone=function(){return this.slice();};',G);
  G.Rectangle=class{constructor(x=0,y=0,width=0,height=0){Object.assign(this,{x,y,width,height});}pad(x,y=x){this.x-=x;this.y-=y;this.width+=x*2;this.height+=y*2;}};
  G.ConfigManager={touchUI};G.Sprite_Clickable=function(){};G.Sprite_Clickable.prototype.initialize=function(){};G.Sprite_Clickable.prototype.isPressed=()=>false;
  G.Sprite_Clickable.prototype.setFrame=function(x,y,width,height){Object.assign(this,{width,height});};G.ImageManager.loadSystem=()=>({isReady:()=>true,width:528});
  const sprites=fs.readFileSync(path.join(ROOT,'js/reactor_sprites.js'),'utf8');vm.runInContext(sprites.slice(sprites.indexOf('function Sprite_Button()'),sprites.indexOf('function Sprite_Character()')),G);
  G.Input.virtualClick=key=>G.Input._virtualKey=key;
  for(const name of ['Cancel','Cursor','Buzzer'])G.SoundManager['play'+name]=()=>sounds.push(name.toLowerCase());
  G.TouchInput.isHovered=G.TouchInput.isClicked=G.TouchInput.isCancelled=()=>false;
  G.ColorManager.itemBackColor1=G.ColorManager.itemBackColor2=()=>'';G.$gameSystem.windowPadding=()=>12;
  const init=G.Window_Base.prototype.initialize;
  G.Window_Base.prototype.initialize=function(rect){init.call(this,rect);this.padding=12;this.visible=true;this.active=false;
   Object.defineProperties(this,{innerWidth:{configurable:true,get(){return Math.max(0,this.width-this.padding*2);}},innerHeight:{configurable:true,get(){return Math.max(0,this.height-this.padding*2);}}});
   this.contentsBack={clear(){},gradientFillRect(){},strokeRect(){}};this.contents.clearRect=()=>{};this.contents.destroy=()=>{};
  };
  G.Window_Base.prototype.createContents=function(){};G.Window_Base.prototype.setCursorRect=function(x,y,width,height){this.cursor={x,y,width,height};};G.Window_Base.prototype.addInnerChild=function(){};
  vm.runInContext(windows.slice(windows.indexOf('function Window_Scrollable()'),windows.indexOf('function Window_HorzCommand()')),G);
  vm.runInContext(windows.slice(windows.indexOf('function Window_NumberInput()'),windows.indexOf('function Window_EventItem()')),G);
  G.Window_Scrollable.prototype.update=function(){G.Window_Base.prototype.update.call(this);};G.Window_Scrollable.prototype.updateOrigin=function(){};
  load(objects,['Game_Interpreter.prototype.command103','Game_Interpreter.prototype.setupNumInput','Game_Interpreter.prototype.command111','Game_Interpreter.prototype.command411','Game_Interpreter.prototype.skipBranch']);
  vm.runInContext(objects.slice(objects.indexOf('function Game_Variables()'),objects.indexOf('function Game_SelfSwitches()')),G);
  G.$dataSystem={variables:Array.from({length:21},(_,i)=>'Variable '+i)};G.$gameVariables=new G.Game_Variables();
  return {number(win){number=new G.Window_NumberInput();number.setMessageWindow(win);return number;},update(){number.update();}};
 });
 h.G.$gameMap.requestRefresh=()=>refreshes++;
 function command(settings=[],variable=1){return {code:357,indent:0,parameters:['PS_Management','ShowNumber','Number',{settings:JSON.stringify(settings.map(s=>JSON.stringify(s))),resultVariableId:String(variable)}]};}
 function show(settings=[],initial=0){h.G.$gameVariables.setValue(1,initial);h.enter([command(settings),{code:0,indent:0,parameters:[]}]);h.tick(0);return number;}
 return {...h,command,show,get number(){return number;},get balloon(){return h.balloon;},refreshCount:()=>refreshes,result:()=>h.G.$gameVariables.value(1),display:()=>h.draws.slice(-number.maxItems()).map(d=>d.text).join('')};
}
const setting=(operation,value,maximum)=>({operation,value:String(value),...(maximum===undefined?{}:{maximum:String(maximum)})});
module.exports={numberHost,setting,ROOT};
