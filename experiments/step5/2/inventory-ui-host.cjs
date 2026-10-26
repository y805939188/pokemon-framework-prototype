'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {E,clone,setup}=require('./ef-support.cjs');let bundles,dir;
function build(){if(bundles)return;dir=fs.mkdtempSync(path.join(os.tmpdir(),'ps52-inventory-host-'));bundles={};for(const plugin of ['PS_Management','PS_Inventory','PS_Progression','PS_Evolution']){const p=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',dir],{env:{...process.env,RR_PLUGIN:plugin},encoding:'utf8'});if(p.status!==0)throw Error(p.stdout+p.stderr);bundles[plugin]=fs.readFileSync(path.join(dir,plugin+'.js'),'utf8');}}
function disposeBuild(){if(dir)fs.rmSync(dir,{recursive:true,force:true});bundles=null;dir=null;}
function host(options={}){
 build();const x=options.application??setup({bag:{potion:3,rarecandy:2,ether:2,pokeball:20},variables:{count:()=>G.$dataSystem.variables.length-1,write:(id,value)=>G.$gameVariables.setValue(id,value)},edit:(g,c)=>{g.money=5000;g.party[0].hp=1;c.items.pokeball.price=200;c.items.pokeball.sellPrice=100;c.items.potion.price=300;c.items.potion.sellPrice=150;c.species.Charizard.learnset={51:['Slash']};options.edit?.(g,c);},...options.setup});
 // Plugin objects come from the vm realm (another Object.prototype), exactly like NW.js plugins versus the required
 // engine; the proxy only binds methods, it never clones or rewrites requests, statuses or port faults (5.2 P-01).
 const app=new Proxy(x.app,{get(target,key){const v=target[key];if(typeof v!=='function')return v;return(...args)=>v.apply(target,args);}});
 const listeners={},events={},commands={},messages=[],vars={},input={trigger:new Set(),repeat:new Set(),pressed:new Set(),keyMapper:{},isTriggered(k){return this.trigger.has(k)},isRepeated(k){return this.repeat.has(k)},isPressed(k){return this.pressed.has(k)},clear(){this.trigger.clear();this.repeat.clear();this.pressed.clear()}};
 const drawCalls=[];let windowFailures=options.windowFailures??0,attachFailures=options.attachFailures??0,destroyed=0,drawFault=null;
 function Base(){}for(const m of ['initialize','create','start','update','terminate'])Base.prototype[m]=function(){};
 Base.prototype.isStarted=()=>true;Base.prototype.clear=function(){this._waitMode='';};
 Base.prototype.addWindow=function(win){options.attachHook?.(G);if(attachFailures-->0)throw Error('injected window attachment');win.parent={removeChild(){}};};Base.prototype.setWaitMode=function(mode){this._waitMode=mode;};Base.prototype.updateWaitMode=()=>false;
 Base.prototype.popScene=function(){this.terminate();manager.popped++;if(manager._scene===this)manager._scene=new Base();};
 function Win(){this.initialize(...arguments)}Win.prototype.initialize=function(){options.windowHook?.(G);if(windowFailures-->0)throw Error('injected inventory window');this.contents={width:792,height:576,clear(){drawCalls.length=0;},fillRect(...args){drawCalls.push({op:'fillRect',args});},drawText(...args){if(drawFault?.(args[0]))throw Error('injected presentation failure');drawCalls.push({op:'drawText',args});}};};Win.prototype.activate=function(){};Win.prototype.textWidth=s=>String(s).length*10;Win.prototype.destroy=function(){destroyed++;};
 const manager={_scene:null,popped:0,isSceneChanging:()=>false,push(C){this._scene?.terminate();this._scene=new C();if(!options.deferredCreate){this._scene.create();this._scene.start();}else this.deferred=true;},goto(C){this.push(C)},updateScene(){if(this.deferred){this.deferred=false;this._scene.create();this._scene.start();}this._scene?.update();}};
 function MenuCommand(){this._list=[];this.handlers={};this.addOriginalCommands();}MenuCommand.prototype.addOriginalCommands=function(){};MenuCommand.prototype.addCommand=function(name,symbol,enabled){this._list.push({name,symbol,enabled});};MenuCommand.prototype.setHandler=function(symbol,fn){this.handlers[symbol]=fn;};MenuCommand.prototype.activate=function(){this.activated=true;};
 function Menu(){this.initialize();}Menu.prototype=Object.create(Base.prototype);Menu.prototype.create=function(){this.createCommandWindow();};Menu.prototype.createCommandWindow=function(){this._commandWindow=new MenuCommand();};
 const document={addEventListener(k,f){(listeners[k]??=new Set()).add(f)},removeEventListener(k,f){listeners[k]?.delete(f)},body:{appendChild(){}},createElement(){return {style:{},setAttribute(){},addEventListener(){},focus(){},remove(){}}}};
 const G={console,structuredClone,Date,performance:{now:()=>G.Graphics.frameCount*1000/60},Input:input,TouchInput:{clear(){},isCancelled:()=>false},Graphics:{boxWidth:816,boxHeight:624,frameCount:0},Scene_MenuBase:Base,Scene_Map:Base,Window_Base:Win,Rectangle:function(){},SceneManager:manager,PluginManager:{registerCommand(p,n,f){commands[p+':'+n]=f}},Game_Interpreter:Base,SoundManager:{playBuzzer(){},playCancel(){}},$gameMessage:{add(s){messages.push(s)},isBusy:()=>G.messageBusy},$gameSwitches:{value:()=>false},$dataMap:{meta:{}},$dataSystem:{switches:Array(36).fill(''),variables:Array(8).fill('')},$gameVariables:{setValue(id,v){vars[id]=v}},messageBusy:false};
 G.Window_MenuCommand=MenuCommand;G.Scene_Menu=Menu;
 G.PSFlow={app:()=>app,_app:app,game:()=>x.state.current(),content:()=>x.content,translator:()=>E.i18n.translatorFor(G.language??'en'),speciesName:s=>s};G.window=G;G.document=document;G.addEventListener=(k,f)=>(events[k]??=new Set()).add(f);
 Object.assign(G.PSFlow,options.flowOverrides??{});
 vm.runInNewContext(bundles.PS_Management,G);vm.runInNewContext(bundles.PS_Inventory,G);vm.runInNewContext(bundles.PS_Progression,G);vm.runInNewContext(bundles.PS_Evolution,G);
 const tick=()=>{G.Graphics.frameCount++;manager.updateScene();input.trigger.clear();input.repeat.clear();};
 const press=(key)=>{input.trigger.add(key);input.repeat.add(key);input.pressed.add(key);tick();input.pressed.delete(key);tick();};
 const ready=()=>{tick();tick();};const view=()=>G.PSInventory.current();
 const choose=key=>{ready();let n=0;while(view()?.view.items?.[view().view.cursor]?.key!==key&&n++<100){press('down');}if(view()?.view.items?.[view().view.cursor]?.key!==key)throw Error('missing UI key '+key+' in '+JSON.stringify(view()));press('ok');};
 const managementChoose=key=>{ready();let n=0;while(G.PSManagement.current()?.view.items?.[G.PSManagement.current().view.cursor]?.key!==key&&n++<100)press('down');if(n>=100)throw Error('missing management '+key);press('ok');};
 const pocket=n=>{ready();let tries=0;while(view()?.pocket!==n&&tries++<8)press('right');};
 const command=(name,args={})=>{const interpreter=new Base();commands['PS_Inventory:'+name].call(interpreter,args);return interpreter;};
 const dom=(kind,code)=>{for(const f of listeners[kind]??[])f({code,key:code==='Enter'?'Enter':code==='Escape'?'Escape':code,keyCode:code==='Enter'?13:code==='Escape'?27:0});};
 const pluginCommand=(plugin,name,args={})=>{const interpreter=new Base();commands[plugin+':'+name].call(interpreter,args);return interpreter;};
 return {...x,app,G,input,pluginCommand,drawCalls,manager,listeners,events,messages,vars,tick,press,ready,view,choose,managementChoose,pocket,command,dom,setDrawFault(f){drawFault=f;},get destroyed(){return destroyed;}};
}
module.exports={host,build,disposeBuild,E,clone};
