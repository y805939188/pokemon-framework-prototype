'use strict';
// Executes bound installed methods. Constructors, windows, sounds and the scene manager are non-rendering adapters.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createHost,section,sha}=require('./mz-slot-host.cjs');
function createContinueHost(hostRoot,productRoot,folder,content,manifest){
 const h=createHost(hostRoot,productRoot,folder,content,manifest),g=h.context,trace=[];
 function read(name){const bytes=fs.readFileSync(path.join(hostRoot,name));assert.equal(sha(bytes),manifest[name],'bound Continue host bytes '+name);h.hashes[name]=sha(bytes);return bytes.toString('utf8');}
 const scenes=read('js/reactor_scenes.js'),windows=read('js/reactor_windows.js');
 let completion=null;
 g.recordContinue=(kind,...args)=>trace.push({kind,args});
 g.SceneManager={push(type){trace.push({kind:'push',scene:type.name});},goto(type){trace.push({kind:'goto',scene:type.name});if(completion)completion('success');}};
 g.SoundManager={playLoad(){trace.push({kind:'load-sound'});},playBuzzer(){trace.push({kind:'buzzer'});if(completion)completion('failure');}};
 g.TextManager={newGame:'New Game',continue_:'Continue',options:'Options',loadMessage:'Load which file?'};
 vm.runInContext(`
 function Scene_Base(){this.initialize(...arguments);}
 Scene_Base.prototype.initialize=function(){};
 Scene_Base.prototype.terminate=function(){recordContinue('base-terminate');};
 Scene_Base.prototype.fadeOutAll=function(){recordContinue('fade-out-request');};
 function Scene_MenuBase(){this.initialize(...arguments);}
 Scene_MenuBase.prototype=Object.create(Scene_Base.prototype);
 Scene_MenuBase.prototype.initialize=Scene_Base.prototype.initialize;
 function Scene_Map(){}
 function Window_Command(){}
 Window_Command.prototype.addCommand=function(name,symbol,enabled=true){this.commands.push({name,symbol,enabled});};
 function Window_Selectable(){}
 Window_Selectable.prototype.index=function(){return this._index;};
 Window_Selectable.prototype.activate=function(){this.active=true;recordContinue('load-list-activate');};
 Game_System.prototype.versionId=function(){return 544;};
 Game_System.prototype.onAfterLoad=function(){recordContinue('game-system-after-load');};
 `,g,{filename:'explicit-nonrendering-continue-adapters'});
 for(const [source,begin,end]of [[scenes,'function Scene_Title()','function Scene_Map()'],[scenes,'function Scene_File()','function Scene_Save()'],[scenes,'function Scene_Load()','function Scene_GameEnd()'],[windows,'function Window_TitleCommand()','function Window_GameEnd()'],[windows,'function Window_SavefileList()','function Window_ShopCommand()']]){
  vm.runInContext(section(source,begin,end),g,{filename:'bound-installed-'+begin.match(/\w+(?=\(\))/)[0]+'.js'});
 }
 g.$dataSystem.versionId=544;
 const reads=[];const baseLoad=g.StorageManager.loadObject;
 g.StorageManager.loadObject=function(...args){const p=baseLoad.apply(this,args);reads.push(p);return p;};
 const baseLoadGame=g.DataManager.loadGame;
 g.DataManager.loadGame=function(slot){trace.push({kind:'load-game-call',slot});return baseLoadGame.call(this,slot).then(value=>{trace.push({kind:'load-game-return',value});return value;});};
 async function readGlobal(){
  g.DataManager._globalInfo=null;
  const start=reads.length;g.DataManager.loadGlobalInfo();
  await Promise.allSettled(reads.slice(start));await Promise.resolve();
  assert(g.DataManager.isGlobalInfoLoaded(),'actual boot-style global loader completed');
  trace.push({kind:'global-read',slots:g.DataManager._globalInfo.filter(Boolean).length});
 }
 function commands(){const titleCommands=Object.create(g.Window_TitleCommand.prototype);titleCommands.commands=[];titleCommands.makeCommandList();return titleCommands.commands;}
 async function continueSlot(slot){
  assert(commands().find(c=>c.symbol==='continue')?.enabled,'Continue is enabled by the real global-info query');
  const title=new g.Scene_Title();title._commandWindow={close(){trace.push({kind:'title-command-close'});}};
  title.commandContinue();assert.equal(trace.at(-1).kind,'push');assert.equal(trace.at(-1).scene,'Scene_Load');
  const load=new g.Scene_Load(),list=Object.create(g.Window_SavefileList.prototype);list._mode='load';list._autosave=false;list._index=list.savefileIdToIndex(slot);list.active=false;load._listWindow=list;
  assert.equal(load.firstSavefileId(),slot,'actual global-info latest file is selected');assert.equal(load.savefileId(),slot,'actual save-list index maps to ordinary slot identity');
  let timer;
  const finished=new Promise((resolve,reject)=>{completion=resolve;timer=setTimeout(()=>reject(Error('owned Continue method chain did not settle')),2000);});
  try{load.onSavefileOk();const outcome=await finished;await Promise.resolve();load.terminate();return{outcome,loadSuccess:load._loadSuccess,listActive:list.active,trace:JSON.parse(JSON.stringify(trace)),commands:JSON.parse(JSON.stringify(commands()))};}
  finally{completion=null;clearTimeout(timer);}
 }
 return{...h,trace,readGlobal,commands,continueSlot};
}
module.exports={createContinueHost};
