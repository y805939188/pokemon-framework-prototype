'use strict';
// Native menu/selectable/stack/interpreter method bodies; bitmap, device delivery and scene scheduling are controlled.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {textHost,ROOT}=require('./text-host.cjs'),{E,setup}=require('../2/ef-support.cjs');
function navigationHost(options={}){
 let x,app,virtual=null;
 const h=textHost({...options,configure(G,{load,objects,managers,scenes,sounds}){
  x=setup({bag:{potion:3},edit(g,c){g.dex.hasDex=options.hasDex??true;g.dex.seen=['Charizard'];g.dex.owned=['Charizard'];options.edit?.(g,c);},...options.ports});
  app=new Proxy(x.app,{get(t,k){const v=t[k];return typeof v==='function'?(...a)=>v.apply(t,a):v;}});
  G.structuredClone=structuredClone;G.PSFlow={game:()=>x.state.current(),content:()=>x.content,app:()=>app,_app:app,translator:()=>E.i18n.translatorFor(options.lang??'zh'),speciesName:s=>s,operationPending:()=>app.saveBlocked};
  G.DataManager.isEventTest=()=>false;Object.assign(G.$gameSystem,{isSaveEnabled:()=>options.saveEnabled!==false,isFormationEnabled:()=>true});
  Object.assign(G.$gameParty,{exists:()=>false,size:()=>0,gold:()=>0,menuActor:()=>null});Object.assign(G.$dataSystem,{menuCommands:Array(6).fill(true),switches:Array(40).fill('')});
  G.$gameSwitches={value:()=>false};G.$dataMap={meta:{}};
  G.TextManager={item:'Item',skill:'Skill',equip:'Equip',status:'Status',formation:'Formation',options:'Options',save:'Save',gameEnd:'Game End',currencyUnit:'G'};
  for(const k of ['Ok','Cancel','Buzzer','Cursor'])G.SoundManager['play'+k]=()=>sounds.push(k.toLowerCase());
  G.Input.update=()=>{};G.TouchInput.update=()=>{};
  G.Input.virtualClick=key=>{virtual=key;};
  const base=G.Window_Base.prototype,init=base.initialize;
  base.initialize=function(r){init.call(this,r);this.openness=255;this.visible=true;this.contents.fillRect=()=>{};};
  base.activate=function(){this.active=true;return this;};base.deactivate=function(){this.active=false;return this;};base.hide=function(){this.visible=false;};base.show=function(){this.visible=true;};base.destroy=function(){};
  const windows=fs.readFileSync(path.join(ROOT,'js/reactor_windows.js'),'utf8');
  G.Window_Scrollable=G.Window_Base;
  vm.runInContext(windows.slice(windows.indexOf('function Window_Selectable()'),windows.indexOf('// Window_MenuStatus')),G);
  const select=G.Window_Selectable.prototype;
  // Drawing/scroll primitives have no GPU; selection, command processing and handler dispatch remain native.
  select.refresh=function(){};select.refreshCursor=function(){};select.ensureCursorVisible=function(){};select.clearScrollStatus=function(){};
  select.update=function(){this.processCursorMove();this.processHandling();};select.setCursorRect=function(){};
  G.Window_Command.prototype.itemTextAlign=()=> 'left';
  G.Window_Gold=function(r){base.initialize.call(this,r);};G.Window_Gold.prototype=Object.create(base);G.Window_Gold.prototype.refresh=function(){};
  G.Window_MenuStatus=G.Window_Gold;
  G.Window_MenuStatus.prototype.setHandler=function(){};
  vm.runInContext(windows.slice(windows.indexOf('function Window_Options()'),windows.indexOf('function Window_SavefileList()')),G);
  vm.runInContext(scenes.slice(scenes.indexOf('function Scene_Options()'),scenes.indexOf('function Scene_File()')),G);
  Object.assign(G.ConfigManager,{alwaysDash:false,commandRemember:false,bgmVolume:100,bgsVolume:100,meVolume:100,seVolume:100,save(){}});
  vm.runInContext(scenes.slice(scenes.indexOf('function Scene_Menu()'),scenes.indexOf('function Scene_ItemBase()')),G);
  G.Scene_MenuBase.prototype.calcWindowHeight=(n)=>n*36+24;G.Scene_MenuBase.prototype.mainCommandWidth=()=>240;
  G.Scene_MenuBase.prototype.isStarted=()=>true;
  load(scenes,['Scene_Base.prototype.isBottomHelpMode','Scene_Base.prototype.isRightInputMode','Scene_Base.prototype.buttonAreaBottom']);
  G.Scene_Base.prototype.startFadeIn=function(n){this._fadeDuration=n;};G.Scene_Base.prototype.startFadeOut=function(n){this._fadeDuration=n;};G.Scene_Base.prototype.fadeSpeed=()=>24;G.Scene_Base.prototype.isBusy=function(){return (this._fadeDuration??0)>0;};
  const oldUpdate=G.Scene_Base.prototype.update;G.Scene_Base.prototype.update=function(){oldUpdate.call(this);if(this._fadeDuration>0)this._fadeDuration--;};
  G.SceneManager.updateScene=function(){this._scene?.update?.();};
  // The earlier BattleFlow registrar is exercised verbatim; its battle engine is outside this navigation fixture.
  const battle=fs.readFileSync(path.join(ROOT,'src/plugins/PS_BattleFlow.ts'),'utf8'),a=battle.indexOf('    const baseOriginal = G.Window_MenuCommand'),b=battle.indexOf('\n  }\n  bindIsolatedTestBattleFlow(',a);
  assert(a>=0&&b>a,'current BattleFlow navigation registrar boundary');
  const registrar=battle.slice(a,b).replace(/function \(this: any\)/g,'function ()');
  vm.runInContext('const PSFlow=window.PSFlow; const W=window; const G=globalThis;'+registrar,G);
  // Production Map entry/cancel guards and invocation, with rendering/movement clocks controlled.
  load(scenes,['Scene_Map.prototype.updateCallMenu','Scene_Map.prototype.isMenuEnabled','Scene_Map.prototype.isMenuCalled','Scene_Map.prototype.callMenu']);
  G.Scene_Map.prototype.isActive=()=>true;G.Scene_Map.prototype.isBusy=()=>false;G.Scene_Map.prototype.hideMenuButton=function(){};G.Scene_Map.prototype.callMenu=G.Scene_Map.prototype.callMenu;
  G.SceneManager._scene._mapNameWindow={hide(){}};G.SceneManager._scene.children=[];
  G.$gameSystem.isMenuEnabled=()=>true;G.$gameTemp.clearDestination=()=>{};G.$gamePlayer.isMoving=()=>false;G.$gameMap.isEventRunning=()=>h?.map?._interpreter.isRunning()??false;
  return {};
 }});
 const G=h.G;
 for(const plugin of ['PS_Inventory','PS_Pokedex'])vm.runInContext(fs.readFileSync(path.join(ROOT,'js/plugins/'+plugin+'.js'),'utf8'),G,{filename:plugin+'.js'});
 function transition(){if(G.SceneManager._nextScene)G.SceneManager._nextScene.children??=[];h.transition();}
 function frame(...keys){transition();G.Graphics.frameCount++;h.keys.clear();keys.forEach(k=>h.keys.add(k));if(virtual){h.keys.add(virtual);virtual=null;}G.SceneManager.updateScene();h.keys.clear();}
 function ready(){frame();frame();}
 function press(key){frame(key);frame();}
 function openMenu(){h.keys.add('menu');G.Scene_Map.prototype.updateCallMenu.call(h.scene());h.keys.clear();transition();ready();return h.scene();}
 function choose(symbol){const s=h.scene(),w=s._commandWindow??s._commands;w.selectSymbol(symbol);press('ok');return h.scene();}
 function managementChoose(key){ready();for(let n=0;n<30;n++){const v=G.PSManagement.current()?.view;if(v?.items?.[v.cursor]?.key===key){press('ok');return;}press('down');}throw Error('missing management '+key);}
 return {...h,G,x,app,transition,frame,ready,press,openMenu,choose,managementChoose,get balloon(){return h.balloon;}};
}
module.exports={navigationHost,ROOT,E};
