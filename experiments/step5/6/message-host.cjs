'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'../../..');
function method(source,name){const a=source.indexOf(name+' = function'),b=source.indexOf('\n};',a);assert(a>=0&&b>a,name);return source.slice(a,b+3);}
function host(lang='zh',width=816,height=624,animate=false,configure=null){
 const windows=fs.readFileSync(path.join(ROOT,'js/reactor_windows.js'),'utf8'),objects=fs.readFileSync(path.join(ROOT,'js/reactor_objects.js'),'utf8'),managers=fs.readFileSync(path.join(ROOT,'js/reactor_managers.js'),'utf8');
 let clock=0,balloon=false;const keys=new Set(),draws=[],sounds=[],writes=[],calls={input:0,touch:0},state=Object.freeze({player:Object.freeze({name:'小明\\!<b>'}),money:1234567,sentinel:Object.freeze({schema:11,play_time:17})});
 const G={console,performance:{now:()=>clock},Graphics:{boxWidth:width,boxHeight:height,frameCount:0},Utils:{containsArabic:()=>false,extractFileName:s=>s},
  Window:function(){},Game_Interpreter:function(){this.initialize();},Game_Event:function(){},Game_Map:function(){},Game_Player:function(){},PluginManager:{_commands:{}},
  ColorManager:{normalColor:()=> 'white',outlineColor:()=> 'black',textColor:n=>'palette'+n},ImageManager:{faceWidth:144,faceHeight:144,loadFace:()=>({isReady:()=>true})},TextManager:{currencyUnit:'G'},
  Input:{keyMapper:{},isTriggered:k=>keys.has(k),isRepeated:k=>keys.has(k),isPressed:()=>false,clear(){keys.clear();},update(){calls.input++;keys.clear();}},
  TouchInput:{isTriggered:()=>keys.has('touch'),isRepeated:()=>keys.has('touch'),update(){calls.touch++;keys.delete('touch');}},SoundManager:{playOk:()=>sounds.push('ok')},
  $gameSystem:{mainFontFace:()=> 'Arial',mainFontSize:()=>28,lineHeight:()=>36},$gameVariables:{value:n=>n===1?42:n===2?'\\C[2]<i>':0},$gameActors:{_data:[],actor(){throw Error('unexpected lazy actor write');}},$dataActors:[null,{name:'Actor1\\!'}],
  $gameParty:{members:()=>[]},$gameTemp:{requestBalloon(){balloon=true;}},SceneManager:{_scene:null,isSceneChanging:()=>false},
  DataManager:{saveGame(){writes.push('save');}},StorageManager:{saveObject(){writes.push('storage');}},document:{addEventListener(){}},addEventListener(){}};
 G.window=G;G.PSFlow={game:()=>state,translator:()=>({lang})};
 Object.defineProperty(G.Window.prototype,'openness',{get(){return this._openness??0;},set(value){this._openness=Math.max(0,Math.min(255,value));}});
 vm.createContext(G);
 function load(source,names){for(const name of names)vm.runInContext(method(source,name),G);}
 vm.runInContext(windows.slice(windows.indexOf('function Window_Base()'),windows.indexOf('function Window_Scrollable()')),G);
 G.Window_Base.prototype.initialize=function(rect){Object.assign(this,rect,{innerWidth:rect.width-24,innerHeight:rect.height-24,openness:0,pause:false});this.contents={width:this.innerWidth,height:this.innerHeight,fontBold:false,fontItalic:false,blt(){},clear(){},measureTextWidth:t=>Array.from(t).length*10,drawText(text,x,y,w,h){if(text)draws.push({text,x,y,w,h,bold:this.fontBold,italic:this.fontItalic,color:this.textColor});}};this.resetFontSettings();};
 G.Window_Base.prototype.update=function(){if(animate){this.updateOpen();this.updateClose();}};
 if(!animate){G.Window_Base.prototype.open=function(){this.openness=255;};G.Window_Base.prototype.close=function(){this.openness=0;};G.Window_Base.prototype.isOpening=G.Window_Base.prototype.isClosing=()=>false;}
 G.Window_Base.prototype.isOpen=function(){return this.openness===255;};G.Window_Base.prototype.isClosed=function(){return this.openness===0;};G.Window_Base.prototype.setBackgroundType=()=>{};
 vm.runInContext(windows.slice(windows.indexOf('function Window_Message()'),windows.indexOf('function Window_ScrollText()')),G);
 vm.runInContext(objects.slice(objects.indexOf('function Game_Message()'),objects.indexOf('function Game_Switches()')),G);
 load(objects,['Game_Interpreter.prototype.initialize','Game_Interpreter.prototype.checkOverflow','Game_Interpreter.prototype.clear','Game_Interpreter.prototype.setup','Game_Interpreter.prototype.loadImages','Game_Interpreter.prototype.eventId','Game_Interpreter.prototype.isRunning','Game_Interpreter.prototype.update','Game_Interpreter.prototype.updateChild','Game_Interpreter.prototype.updateWait','Game_Interpreter.prototype.updateWaitCount','Game_Interpreter.prototype.updateWaitMode','Game_Interpreter.prototype.setWaitMode','Game_Interpreter.prototype.executeCommand','Game_Interpreter.prototype.checkFreeze','Game_Interpreter.prototype.currentCommand','Game_Interpreter.prototype.nextEventCode','Game_Interpreter.prototype.terminate','Game_Interpreter.prototype.command357','Game_Interpreter.prototype.command101','Game_Interpreter.prototype.command213']);
 load(objects,['Game_Event.prototype.start','Game_Event.prototype.isStarting','Game_Event.prototype.clearStartingFlag','Game_Event.prototype.isTriggerIn','Game_Map.prototype.setupStartingMapEvent','Game_Map.prototype.updateInterpreter','Game_Player.prototype.canMove']);
 load(managers,['PluginManager.registerCommand','PluginManager.callCommand']);
 G.$gameMessage=new G.Game_Message();G.$gameMap=Object.create(G.Game_Map.prototype);const map=G.$gameMap;map.mapId=()=>5;map._interpreter=new G.Game_Interpreter();map.isEventRunning=()=>map._interpreter.isRunning();map.unlockEvent=()=>{};map.setupStartingEvent=()=>map.setupStartingMapEvent();
 G.$gamePlayer=Object.assign(Object.create(G.Game_Player.prototype),{isMoveRouteForcing:()=>false,areFollowersGathering:()=>false,isInVehicle:()=>false,isBalloonPlaying:()=>balloon});
 G.Game_Interpreter.prototype.character=()=>G.$gamePlayer;
 // Remaining management presenters are dormant; messages still install from the complete compiled plugin.
 G.Window_Command=function(){};G.Window_Command.prototype={};G.Window_Options=function(){};G.Window_Options.prototype={};G.Scene_MenuBase=function(){};G.Scene_MenuBase.prototype={};G.Window_MenuCommand=function(){};G.Window_MenuCommand.prototype={};G.Scene_Menu=function(){};G.Scene_Menu.prototype={};G.Scene_Map=function(){};G.Scene_Map.prototype={start(){}};G.SceneManager._scene=new G.Scene_Map();
 const extension=configure?.(G,{load,windows,objects,managers,draws,sounds,calls})??{};
 const native={convert:G.Window_Base.prototype.convertEscapeCharacters,fast:G.Window_Message.prototype.updateShowFast};
 vm.runInContext(fs.readFileSync(path.join(ROOT,'js/plugins/PS_Management.js'),'utf8'),G,{filename:'PS_Management.js'});
 const win=new G.Window_Message(extension.rect?.()??{x:0,y:0,width,height:180}),sub={active:false,start(){},close(){}};
 G.SceneManager._scene._messageWindow=win;
 win.setGoldWindow({...sub,height:40});win.setNameBoxWindow({...sub,setName(){}});const choice=extension.choice?.(win);win.setChoiceListWindow(choice??{...sub});win.setNumberInputWindow(extension.number?.(win)??{...sub});win.setEventItemWindow({...sub});
 function enter(list,eventId=11){const event=Object.assign(Object.create(G.Game_Event.prototype),{_trigger:0,list:()=>list,eventId:()=>eventId,lock(){}});map.events=()=>[event];event.start();assert(event.isStarting());assert(map.setupStartingMapEvent());map.updateInterpreter();return map._interpreter;}
 function command(text,english=text,position='2'){return {code:357,indent:0,parameters:['PS_Management','ShowMessage','Message',{textZh:text,textEn:english,position}]};}
 function tick(ms=25,...input){clock+=ms;G.Graphics.frameCount++;keys.clear();input.forEach(k=>keys.add(k));win.update();extension.update?.();keys.clear();map.updateInterpreter();}
 function until(condition){for(let i=0;i<10000&&!condition();i++)tick();assert(condition(),'bounded host updates reached expected state');}
 function show(text,english=text,position='2'){return enter([command(text,english,position),{code:0,indent:0,parameters:[]}]);}
 return {...extension,G,win,map,draws,sounds,writes,calls,state,native,enter,command,tick,until,show,keys,setTime:n=>clock=n,get balloon(){return balloon;},releaseBalloon(){balloon=false;},text:()=>draws.map(d=>d.text).join('')};
}
module.exports={host,ROOT};
