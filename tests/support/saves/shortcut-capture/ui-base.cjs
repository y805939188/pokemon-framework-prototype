'use strict';
// Actual App + Flow/World/Inventory/Management IIFEs. Only render/database/XHR resources are facades.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
for(const key of ['PF_SHORTCUT_TRAVEL_FIXTURE','PF_SHORTCUT_PRODUCTION_BUNDLE','PF_MZ_RUNTIME_MANAGERS','PF_MZ_RUNTIME_SCENES'])assert(process.env[key],key+' required');
const {fixture:world,flush}=require(process.env.PF_SHORTCUT_TRAVEL_FIXTURE);
const management=fs.readFileSync(process.env.PF_SHORTCUT_PRODUCTION_BUNDLE,'utf8');
const scenes=fs.readFileSync(process.env.PF_MZ_RUNTIME_SCENES,'utf8');
const managers=fs.readFileSync(process.env.PF_MZ_RUNTIME_MANAGERS,'utf8');
function install(G,name){const a=scenes.indexOf(name+' = function'),b=scenes.indexOf('\n};',a);assert(a>=0&&b>a,name);vm.runInContext(scenes.slice(a,b+4),G,{filename:process.env.PF_MZ_RUNTIME_SCENES+':'+name});}
async function fixture(options={}){
 const windows=[],calls=[],confirmations=[];let latest;
 const h=await world({...options,nativeSetup(n,context){
  const G=n.G,p=G.Window_Base.prototype;
  G.Rectangle=function Rectangle(x,y,width,height){Object.assign(this,{x,y,width,height});};
  p.initialize=function(rect){this.x=rect?.x??0;this.y=rect?.y??0;this.width=rect?.width??816;this.height=rect?.height??624;this.innerWidth=this.width-24;this.innerHeight=this.height-24;this.padding=12;this.drawn=[];this.destroyed=false;this.visible=true;const win=this;this.contents={width:this.innerWidth,height:this.innerHeight,clear(){win.drawn=[];},fillRect(){},drawText(text){win.drawn.push(String(text));}};windows.push(this);};
  p.drawText=function(text){this.drawn.push(String(text));};p.textWidth=text=>String(text).length*8;
  p.activate=function(){};p.show=function(){this.visible=true;};p.hide=function(){this.visible=false;};p.destroy=function(){this.destroyed=true;};
  function Window(rect){this.initialize(rect);}Window.prototype=p;G.Window_Base=Window;
  G.Scene_MenuBase.prototype.addWindow=function(win){const scene=this;this._uiWindows??=[];this._uiWindows.push(win);win.parent={removeChild(child){scene._uiWindows=scene._uiWindows.filter(row=>row!==child);}};};
  function Menu(){this.initialize(...arguments);}Menu.prototype=Object.create(G.Scene_MenuBase.prototype);Menu.prototype.constructor=Menu;G.Scene_Menu=Menu;
  install(G,'Scene_Menu.prototype.initialize');install(G,'Scene_Menu.prototype.createCommandWindow');
  // Native createCommandWindow/handlers and SceneManager push/pop remain actual; decorative menu windows are omitted.
  Menu.prototype.create=function(){G.Scene_MenuBase.prototype.create.call(this);this.createCommandWindow();};
  Menu.prototype.commandWindowRect=()=>new G.Rectangle(0,0,240,600);
  for(const name of ['commandItem','commandPersonal','commandFormation','commandOptions','commandSave','commandGameEnd'])Menu.prototype[name]=function(){};
  function MenuCommand(rect){this.handlers={};this.commands=[];this.initialize(rect);this.addOriginalCommands();}
  MenuCommand.prototype=Object.create(p);MenuCommand.prototype.constructor=MenuCommand;
  MenuCommand.prototype.setHandler=function(key,fn){this.handlers[key]=fn;};MenuCommand.prototype.addCommand=function(...row){this.commands.push(row);};MenuCommand.prototype.addOriginalCommands=function(){};G.Window_MenuCommand=MenuCommand;
  G.$dataSystem.switches=Array(40).fill('');G.$dataSystem.variables=Array(20).fill('');
  G.PluginManager._commands={};G.Utils.extractFileName=name=>String(name).replace(/^.*\//,'').replace(/\.js$/,'');
  for(const name of ['PluginManager.registerCommand','PluginManager.callCommand']){const a=managers.indexOf(name+' = function'),b=managers.indexOf('\n};',a);assert(a>=0&&b>a,name);vm.runInContext(managers.slice(a,b+4),G,{filename:process.env.PF_MZ_RUNTIME_MANAGERS+':'+name});}
  G.document.hasFocus=()=>true;G.document.removeEventListener=()=>{};G.document.body={appendChild(){}};G.top=G;
  options.nativeSetup?.(n,context);
 },async beforeUpgrade(n){
  const G=n.G,app=n.app;latest=n;
  const prepare=app.prepareFieldShortcutSelection.bind(app),execute=app.executeFieldShortcut.bind(app),cancel=app.cancelFieldShortcut.bind(app),end=app.endManagement.bind(app);
  app.prepareFieldShortcutSelection=(...args)=>{const record={kind:'prepare',scene:G.SceneManager._scene,pending:G.PSManagement?.fieldPresentationPending(),blocked:app.encounterBlocked,args};calls.push(record);const result=prepare(...args);record.result=result;return result;};
  app.executeFieldShortcut=(...args)=>{const promise=execute(...args);calls.push({kind:'execute',args,promise});promise.then(result=>calls.push({kind:'outcome',result}),error=>calls.push({kind:'error',reason:String(error)}));return promise;};
  app.cancelFieldShortcut=(...args)=>{calls.push({kind:'cancel-request',args});return cancel(...args);};
  app.endManagement=(...args)=>{calls.push({kind:'end-management',args});return end(...args);};
  const choices=G.$gameMessage.setChoices;G.$gameMessage.setChoices=function(...args){confirmations.push([Array.from(args[0]),...args.slice(1)]);return Reflect.apply(choices,this,args);};
  vm.runInContext(management,G,{filename:process.env.PF_SHORTCUT_PRODUCTION_BUNDLE});
  await options.beforeUpgrade?.(n);
 }});
 assert.strictEqual(latest.app,h.app);assert(h.G.PSManagement);assert.equal(typeof h.G.PSFlow.worldFlyDestinations,'function');
 const G=h.G,input=h.input,manager=G.SceneManager;
 const nativeTick=h.tick;
 const tick=()=>{nativeTick();};
 const press=key=>{input.pressed.add(key);input.trigger.add(key);input.repeat.add(key);tick();input.pressed.delete(key);tick();};
 const settle=async(count=5)=>{for(let i=0;i<count;i++){await flush();if(!G.$gameMessage.isChoice())G.$gameMessage.clear();tick();}};
 const pump=async(predicate,max=120)=>{for(let i=0;i<max;i++){if(predicate())return;if(!G.$gameMessage.isChoice())G.$gameMessage.clear();tick();await flush();}assert.fail('shortcut-travel bounded pump exceeded '+JSON.stringify({scene:manager._scene?.constructor?.name,map:G.$gameMap.mapId(),pending:G.PSManagement.fieldPresentationPending(),save:h.app.saveBlocked,world:G.PSWorld.pending(),calls:calls.map(row=>({kind:row.kind,status:row.result?.status,reason:row.result?.reason})),diagnostics:G.PSWorld.diagnostics}));};
 const ready=()=>{tick();tick();tick();assert.equal(G.PSManagement.current()?.ready,true);};
 const choose=key=>{ready();for(let i=0;G.PSManagement.current()?.view.items[G.PSManagement.current().view.cursor]?.key!==key&&i<32;i++)press('down');assert.equal(G.PSManagement.current()?.view.items[G.PSManagement.current().view.cursor]?.key,key);press('ok');};
 const visible=()=>windows.filter(win=>!win.destroyed&&win.visible);
 const overlay=()=>visible().findLast(win=>win.drawn.some(text=>text==='Shortcuts'||text==='Field moves'));
 const picker=()=>visible().findLast(win=>win.drawn.some(text=>text.startsWith('Fly destination')));
 const openPicker=async()=>{const preparedBefore=calls.filter(row=>row.kind==='prepare').length;assert(G.PSManagement.openFieldShortcuts());tick();assert(overlay());press('ok');await settle(1);assert(picker());assert.equal(calls.filter(row=>row.kind==='prepare').length,preparedBefore);assert.equal(h.app.saveBlocked,false);};
 const event=list=>G.$gameMap._interpreter.setup(list,0);
 const command=(plugin,name,args={})=>({code:357,indent:0,parameters:[plugin,name,name,args]});
 const answer=async yes=>{await pump(()=>G.$gameMessage.isChoice());G.$gameMessage.onChoice(yes?0:1);G.$gameMessage.clear();await settle();};
 return Object.assign(h,{windows,calls,confirmations,manager,tick,press,settle,pump,ready,choose,overlay,picker,openPicker,event,command,answer,visible});
}
module.exports={fixture,flush};
