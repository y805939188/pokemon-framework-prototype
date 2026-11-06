'use strict';
// Stock installed Input and selected Window command methods inside a Node VM; rendering/DOM/gamepad/Scene lifecycle are controlled ports.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createVictoryDriverHost}=require('./victory-music-driver-host.cjs'),PLAN=require('./victory-music-native-plan.json');
function createNormalInputControlHost(compiled,managementText){
  let savedInput,frames=0,processOk=0;const dispatches=[],transfers=[];
  const core=fs.readFileSync(path.join(compiled.ROOT,'js/reactor_core.js'),'utf8'),windows=fs.readFileSync(path.join(compiled.ROOT,'js/reactor_windows.js'),'utf8');
  const start=core.indexOf('\nfunction Input() {'),end=core.indexOf('\nfunction TouchInput() {',start);assert(start>=0&&end>start);const inputSource=core.slice(start+1,end);
  const method=(type,name)=>{const key=type+'.prototype.'+name+' = function',a=windows.indexOf(key);assert(a>=0,key);const b=windows.indexOf('\n};',a);assert(b>a);return windows.slice(a,b+3);};
  const chosen=[];
  const x=createVictoryDriverHost({...compiled,driverText:'OFFLINE_INPUT_CONTROL_UNUSED',PLAN,options:{productionTranslator:true,beforeProduct(G){
    const listeners=new Map(),add=(n,f)=>{if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f);},remove=(n,f)=>listeners.get(n)?.delete(f);
    G.document={addEventListener:add,removeEventListener:remove,dispatchEvent(e){dispatches.push({type:e.type,keyCode:e.keyCode,frame:G.Graphics.frameCount});for(const f of [...(listeners.get(e.type)??[])])f(e);return true;},createElement(){throw Error('unexpected text editor in frozen mode1/naming1 control');}};
    G.addEventListener=add;G.removeEventListener=remove;G.navigator={language:'en',getGamepads:()=>[]};G.KeyboardEvent=function(type,data){Object.assign(this,{type,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}},data);};
    vm.runInContext(inputSource,G,{filename:'installed-reactor_core.js#Input'});G.Input.initialize();savedInput={isTriggered:G.Input.isTriggered,isRepeated:G.Input.isRepeated};
    G.TouchInput.update=()=>{};G.TouchInput.isCancelled=()=>false;G.Bitmap.prototype.fillRect=function(){};
    const Base=G.Window_Base;
    function Selectable(rect){this.initialize(rect);}Selectable.prototype=Object.create(Base.prototype);Selectable.prototype.constructor=Selectable;
    function Command(rect){this.initialize(rect);}Command.prototype=Object.create(Selectable.prototype);Command.prototype.constructor=Command;
    G.Window_Selectable=Selectable;G.Window_Command=Command;
    Command.prototype.initialize=function(rect){Base.prototype.initialize.call(this,rect);this._handlers={};this._list=[];this.refresh();};
    Object.assign(Selectable.prototype,{setHandler(n,f){(this._handlers??={})[n]=f;},isHandled(n){return !!this._handlers?.[n];},callHandler(n){this._handlers?.[n]?.();},smoothSelect(i){this.select(i);},clearScrollStatus(){},maxCols(){return 1;},isHorizontal(){return false;},playOkSound(){},playBuzzerSound(){},playCursorSound(){},cursorPageup(){},cursorPagedown(){}});
    const select=['isCursorMovable','processCursorMove','processHandling','processOk','processCancel','callOkHandler','callCancelHandler','isOkEnabled','isCancelEnabled','isOkTriggered','isCancelTriggered','updateInputData','cursorDown','cursorUp','cursorLeft','cursorRight'];
    const command=['maxItems','currentData','isCurrentItemEnabled','isCommandEnabled','currentSymbol','callOkHandler'];
    for(const[type,names]of [['Window_Selectable',select],['Window_Command',command]])for(const name of names){const source=method(type,name);chosen.push(source);vm.runInContext(source,G,{filename:'installed-reactor_windows.js#'+type+'.'+name});}
    const ok=Selectable.prototype.processOk;Selectable.prototype.processOk=function(){processOk++;return ok.call(this);};
    G.Scene_MenuBase.prototype.addWindow=function(win){(this._controlWindows??=[]).push(win);};
    G.Scene_MenuBase.prototype.update=function(){for(const win of this._controlWindows??[])if(win instanceof Command){win.processCursorMove();win.processHandling();}};
    for(const name of ['playCursor','playOk','playCancel'])G.SoundManager[name]=()=>{};
    const parameters=G.PluginManager.parameters;G.PluginManager.parameters=function(name){return {...parameters(name),...(name==='PS_BattleFlow'?{homeMapId:'5',homeX:'8',homeY:'9',homeDirection:'2'}:{})};};
    G.$dataMapInfos={5:{id:5,name:'owned control home'}};
    G.$gamePlayer={reserveTransfer(...args){transfers.push(args);}};
  }}});
  Object.assign(x.G.Input,savedInput); // The inherited semantic-only host replaces these two functions; restore stock Input before tests.
  vm.runInContext(managementText,x.G,{filename:'current-PS_Management.js'});
  x.G.SceneManager.updateMain=function(){frames++;x.G.Graphics.frameCount++;x.w.tick(1000/60);for(const b of x.w.created)if(!b.destroys&&!b._ready)b.load();x.G.Input.update();return x.M.updateScene();};
  const bridge={...x,dispatches,transfers,get processOk(){return processOk;},get updates(){return frames;},
    source:{inputSHA256:crypto.createHash('sha256').update(inputSource).digest('hex'),windowMethodsSHA256:crypto.createHash('sha256').update(chosen.join('\n')).digest('hex'),methodCount:chosen.length},
    async pump(promise,limit=40000){let done=false,value,error;promise.then(v=>{done=true;value=v;},e=>{done=true;error=e;});for(let i=0;i<limit&&!done;i++){try{x.G.SceneManager.updateMain();}catch(frameError){await new Promise(resolve=>setImmediate(resolve));if(!done)throw frameError;}await new Promise(resolve=>setImmediate(resolve));}assert(done,'offline test hygiene update limit, not a qualified deadline');if(error)throw error;return value;},
  };
  return bridge;
}
module.exports={createNormalInputControlHost};
