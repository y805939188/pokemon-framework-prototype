'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {host,ROOT}=require('./message-host.cjs');
function choicesHost(lang='zh',width=816,height=624,touchUI=false,configure=null){
 let choice,windowsAdded=[],refreshes=0;
 const h=host(lang,width,height,false,(G,context)=>{
  const {load,windows,objects,sounds}=context;
  // Native cursor, help, command, result and interpreter bodies; only Pixi/window surfaces and devices are controlled.
  vm.runInContext('Number.prototype.clamp=function(a,b){return Math.min(Math.max(this,a),b);};Array.prototype.clone=function(){return this.slice();};',G);
  G.Rectangle=class{constructor(x=0,y=0,width=0,height=0){Object.assign(this,{x,y,width,height});}pad(x,y=x){this.x-=x;this.y-=y;this.width+=x*2;this.height+=y*2;}};
  G.ConfigManager={touchUI};G.Sprite_Clickable=function(){};G.Sprite_Clickable.prototype.initialize=function(){};G.Sprite_Clickable.prototype.isPressed=()=>false;
  G.Sprite_Clickable.prototype.setFrame=function(x,y,width,height){Object.assign(this,{width,height});};G.ImageManager.loadSystem=()=>({isReady:()=>true,width:528});
  const sprites=fs.readFileSync(path.join(ROOT,'js/reactor_sprites.js'),'utf8');vm.runInContext(sprites.slice(sprites.indexOf('function Sprite_Button()'),sprites.indexOf('function Sprite_Character()')),G);
  G.Input.virtualClick=key=>G.Input._virtualKey=key;
  G.SoundManager.playCancel=()=>sounds.push('cancel');G.SoundManager.playCursor=()=>sounds.push('cursor');G.SoundManager.playBuzzer=()=>sounds.push('buzzer');
  G.TouchInput.isHovered=G.TouchInput.isClicked=G.TouchInput.isCancelled=()=>false;
  G.ColorManager.itemBackColor1=G.ColorManager.itemBackColor2=()=>'';
  G.$gameSystem.windowPadding=()=>12;
  const init=G.Window_Base.prototype.initialize;
  G.Window_Base.prototype.initialize=function(rect){init.call(this,rect);this.padding=12;this.visible=true;this.active=false;
   Object.defineProperties(this,{innerWidth:{configurable:true,get(){return Math.max(0,this.width-this.padding*2);}},innerHeight:{configurable:true,get(){return Math.max(0,this.height-this.padding*2);}}});
   this.contentsBack={clear(){},gradientFillRect(){},strokeRect(){}};this.contents.clearRect=()=>{};this.contents.destroy=()=>{};
  };
  G.Window_Base.prototype.createContents=function(){};G.Window_Base.prototype.setCursorRect=function(x,y,width,height){this.cursor={x,y,width,height};};G.Window_Base.prototype.addChild=function(){};
  G.Window_Base.prototype.show=function(){this.visible=true;};G.Window_Base.prototype.hide=function(){this.visible=false;};
  vm.runInContext(windows.slice(windows.indexOf('function Window_Scrollable()'),windows.indexOf('function Window_HorzCommand()')),G);
  vm.runInContext(windows.slice(windows.indexOf('function Window_Help()'),windows.indexOf('function Window_Gold()')),G);
  vm.runInContext(windows.slice(windows.indexOf('function Window_ChoiceList()'),windows.indexOf('function Window_NumberInput()')),G);
  // Geometry/bitmap updates are recorded above; no rendering engine is started.
  G.Window_Scrollable.prototype.update=function(){G.Window_Base.prototype.update.call(this);};G.Window_Scrollable.prototype.updateOrigin=function(){};
  load(objects,['Game_Interpreter.prototype.command102','Game_Interpreter.prototype.setupChoices','Game_Interpreter.prototype.command402','Game_Interpreter.prototype.command403','Game_Interpreter.prototype.command111','Game_Interpreter.prototype.command411','Game_Interpreter.prototype.skipBranch']);
  vm.runInContext(objects.slice(objects.indexOf('function Game_Variables()'),objects.indexOf('function Game_SelfSwitches()')),G);
  G.$dataSystem={variables:Array.from({length:21},(_,i)=>'Variable '+i)};G.$gameVariables=new G.Game_Variables();
  const extension=configure?.(G,context)??{};
  return {choice(win){choice=new G.Window_ChoiceList();choice.setMessageWindow(win);return choice;},update(){choice.update();},windowsAdded,...extension};
 });
 h.G.$gameMap.requestRefresh=()=>refreshes++;h.G.SceneManager._scene.addWindow=win=>windowsAdded.push(win);
 function command({zh=['甲','乙'],en=['A','B'],helpZh=[],helpEn=[],initial=0,cancel=0,variable=1}={}){return {code:357,indent:0,parameters:['PS_Management','ShowChoices','Choices',{choicesZh:JSON.stringify(zh),choicesEn:JSON.stringify(en),helpZh:JSON.stringify(helpZh),helpEn:JSON.stringify(helpEn),defaultIndex:String(initial),cancelValue:String(cancel),resultVariableId:String(variable)}]};}
 function show(options){h.enter([command(options),{code:0,indent:0,parameters:[]}]);h.tick(0);return choice;}
 return {...h,command,show,get balloon(){return h.balloon;},get choice(){return choice;},help:()=>windowsAdded.at(-1),refreshCount:()=>refreshes,result:()=>h.G.$gameVariables.value(1)};
}
module.exports={choicesHost,ROOT};
