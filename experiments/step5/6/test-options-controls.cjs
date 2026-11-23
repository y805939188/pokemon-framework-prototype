'use strict';
// FR-000639/640/641/644. Compiled production adapters plus actual installed MZ Scene_Options,
// Window_Options, ConfigManager and menu entry bodies. Rendering devices / clock / storage are controlled.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'../../..'),OUT=path.join(ROOT,'build/step5-6-options-controls');
let modules,E;const layouts=[];
test.after(()=>fs.writeFileSync(path.join(OUT,'layout-measurements.json'),JSON.stringify({scope:'Native host button construction and line heights; controlled devices, no NW or pixel observation',layouts},null,2)+'\n'));
test.before(async()=>{
 const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));modules={};
 for(const [name,source] of Object.entries({navigation:'navigation/options-controls',style:'battleflow/battle-style-settings',effects:'battleflow/battle-effects-settings'})){
  await vite.build({configFile:false,root:ROOT,logLevel:'error',build:{outDir:path.join(OUT,name),emptyOutDir:false,minify:false,lib:{entry:path.join(ROOT,'src/plugins',source+'.ts'),formats:['cjs'],fileName:()=>'adapter.cjs'}}});
  modules[name]=require(path.join(OUT,name,'adapter.cjs'));
 }
 E=require(path.join(ROOT,'js/engine/build/production.cjs'));
});
function method(source,name){const a=source.indexOf(name+' = function'),b=source.indexOf('\n};',a);assert(a>=0&&b>a,name);return source.slice(a,b+3);}
function host(lang='en',width=816,height=624,production=false,touchUI=true){
 const managers=fs.readFileSync(path.join(ROOT,'js/reactor_managers.js'),'utf8'),windows=fs.readFileSync(path.join(ROOT,'js/reactor_windows.js'),'utf8'),scenes=fs.readFileSync(path.join(ROOT,'js/reactor_scenes.js'),'utf8');
 let now=0,measures=0,paints=0,cursorSounds=0;const keys=new Set(),commands={},writes=[],audio=[],created=[],pops=[],stack=[];
 const G={performance:{now:()=>now},Graphics:{boxWidth:width,boxHeight:height},Input:{isTriggered:k=>keys.has(k),isRepeated:k=>keys.has(k),virtualClick:k=>keys.add(k)},TouchInput:{isCancelled:()=>keys.has('touchBack'),isTriggered:()=>keys.has('tap')},
  PluginManager:{registerCommand:(plugin,command,callback)=>commands[plugin+':'+command]=callback},
  StorageManager:{saveObject:(name,data)=>{assert.equal(name,'config');writes.push(JSON.parse(JSON.stringify(data)));return Promise.resolve();}},
  AudioManager:{},TextManager:{},$gameSystem:Object.freeze({lineHeight:()=>36,windowPadding:()=>12,_psGame:Object.freeze({sentinel:'read-only player state'})}),
  Rectangle:function(x,y,width,height){Object.assign(this,{x,y,width,height});},
  Window_Base:function(r){this.initialize(r);},Window_Command:function(){},Window_Selectable:function(){},Scene_MenuBase:function(){},Scene_Title:function(){},Scene_Menu:function(){},
  SceneManager:{push(C){stack.push(C);},snapForBackground(){this.snapshots=(this.snapshots||0)+1;},snapshots:0},
 };
 for(const name of ['bgmVolume','bgsVolume','meVolume','seVolume']){let value=100;Object.defineProperty(G.AudioManager,name,{get:()=>value,set:n=>{value=n;G.AudioManager['_'+name]=n;audio.push({name,value:n});},configurable:true});}
 G.Window_Base.prototype={initialize(r){this.rect=r;this.contents={width:r.width-24,height:r.height-24,fontSize:28,draws:[],clear(){this.draws=[];},clearRect(x,y){this.draws=this.draws.filter(row=>row.x!==x||row.y!==y);},drawText(text,x,y,w,h){paints++;this.draws.push({text,x,y,w,h,size:this.fontSize});}};created.push(this);},textWidth(text){measures++;return Array.from(text).reduce((n,c)=>n+(c.charCodeAt(0)>255?this.contents.fontSize:this.contents.fontSize*.52),0);},resetFontSettings(){this.contents.fontSize=28;},update(){}};
 G.Window_Command.prototype=Object.create(G.Window_Base.prototype);
 Object.assign(G.Window_Command.prototype,{initialize(r){G.Window_Base.prototype.initialize.call(this,r);this._list=[];this._index=0;this.active=true;this.handlers={};this.makeCommandList();},index(){return this._index;},select(n){this._index=n;this.callUpdateHelp();},setHandler(n,f){this.handlers[n]=f;},processCancel(){this.active=false;this.handlers.cancel();},redrawItem(){},playCursorSound(){cursorSounds++;},isCommandEnabled(i){return this._list[i].enabled;},commandSymbol(i){return this._list[i]?.symbol;},addCommand(name,symbol,enabled=true){this._list.push({name,symbol,enabled});},findSymbol(s){return this._list.findIndex(r=>r.symbol===s);}});
 G.Window_Selectable.prototype=G.Window_Command.prototype;
 G.Scene_MenuBase.prototype={initialize(){},create(){this.children=[];this.createButtons();},start(){},update(){},terminate(){this.terminated=true;},addWindow(w){this.children.push(w);},popScene(){pops.push(this);},updateColorFilter(){this.renderedFade=this._fadeOpacity;}};
 vm.createContext(G);vm.runInContext('Number.prototype.clamp=function(min,max){return Math.min(Math.max(this,min),max);};',G);
 // R56-P2-01: exact installed host sizing and live cancel-button creation, not an empty button layer.
 G.Window_Scrollable={prototype:G.Window_Base.prototype};G.Scene_Base={prototype:{}};
 for(const name of ['lineHeight','itemHeight','fittingHeight'])vm.runInContext(method(windows,'Window_Base.prototype.'+name),G);
 for(const name of ['itemHeight','isCancelTriggered'])vm.runInContext(method(windows,'Window_Selectable.prototype.'+name),G);
 for(const name of ['isBottomButtonMode','buttonAreaTop','buttonAreaBottom','buttonAreaHeight','buttonY','calcWindowHeight']){
  vm.runInContext(method(scenes,'Scene_Base.prototype.'+name),G);G.Scene_MenuBase.prototype[name]=G.Scene_Base.prototype[name];
 }
 const sprites=fs.readFileSync(path.join(ROOT,'js/reactor_sprites.js'),'utf8');
 G.Sprite_Button=function(type){this._buttonType=type;const data=this.buttonData();this.width=data.w*this.blockWidth();this.height=this.blockHeight();};
 for(const name of ['buttonData','blockWidth','blockHeight','onClick'])vm.runInContext(method(sprites,'Sprite_Button.prototype.'+name),G);
 for(const name of ['createButtons','needsCancelButton','createCancelButton','needsPageButtons'])vm.runInContext(method(scenes,'Scene_MenuBase.prototype.'+name),G);

 vm.runInContext(managers.slice(managers.indexOf('function ConfigManager()'),managers.indexOf('function StorageManager()')),G);
 for(const name of ['setHelpWindow','callUpdateHelp'])vm.runInContext(method(windows,'Window_Selectable.prototype.'+name),G);
 vm.runInContext(windows.slice(windows.indexOf('function Window_Options()'),windows.indexOf('function Window_SavefileList(')),G);
 vm.runInContext(scenes.slice(scenes.indexOf('function Scene_Options()'),scenes.indexOf('function Scene_File()')),G);
 for(const name of ['Scene_Title','Scene_Menu'])vm.runInContext(method(scenes,name+'.prototype.commandOptions'),G);
 const tr=E.i18n.translatorFor(lang);modules.style.installBattleStyleSettings(G,()=>tr);modules.effects.installBattleEffectsSettings(G,()=>tr);G.ConfigManager.applyData({touchUI});
 const original={make:G.ConfigManager.makeData,apply:G.ConfigManager.applyData,save:G.ConfigManager.save,terminate:G.Scene_Options.prototype.terminate};
 if(production){
  G.window=G;G.console=console;G.PSFlow={translator:()=>tr};G.document={addEventListener(){}};G.addEventListener=()=>{};
  G.Input.keyMapper={};G.Input.isPressed=()=>false;G.Input.isRepeated=()=>false;G.Game_Interpreter=function(){};G.Game_Interpreter.prototype.updateWaitMode=()=>false;G.Scene_Map=function(){};G.Scene_Map.prototype.start=()=>{};
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js/plugins/PS_Management.js'),'utf8'),G,{filename:'compiled-PS_Management.js'});
 }else modules.navigation.installOptionsControls(G,()=>tr);
 return {G,tr,original,writes,audio,commands,created,pops,stack,keys,stats:()=>({measures,paints,cursorSounds}),tick(ms=0,...input){now+=ms;keys.clear();input.forEach(k=>keys.add(k));},options(){const s=new G.Scene_Options();s.create();return s;},controls(){commands['PS_Management:ShowControls']();assert.equal(stack.at(-1),G.Scene_PSControls);const s=new G.Scene_PSControls();s.create();s.start();return s;}};
}
for(const lang of ['zh','en'])test('FR-000644 '+lang+' compiled real Options: labels, descriptions, settings, Close and original persistence',()=>{
 const h=host(lang),{G,tr}=h,s=h.options(),w=s._optionsWindow;
 assert.equal(w._list.length,11);assert.equal(s.maxCommands(),11);assert.equal(new Set(w._list.map(r=>r.symbol)).size,11);
 for(const [i,row] of w._list.entries()){w.select(i);assert(!row.name.includes('[missing:'));assert(s._helpWindow.contents.draws.some(r=>r.text));assert(w.statusText(i)!==undefined);}
 assert.equal(w._list[0].name,tr.t('navigation.options.alwaysDash'));w.select(0);w.processOk();assert.equal(G.ConfigManager.alwaysDash,true);assert.equal(w.statusText(0),tr.t('navigation.on'));
 for(const [symbol,next] of [['psBattleStyle','set'],['psBattleEffects',false]]){w.select(w.findSymbol(symbol));w.cursorRight();assert.equal(G.ConfigManager[symbol],next);}
 w.select(w.findSymbol('bgmVolume'));w.cursorLeft();assert.equal(G.AudioManager.bgmVolume,80);assert(h.audio.some(r=>r.name==='bgmVolume'&&r.value===80));w.cursorRight();w.cursorRight();assert.equal(G.AudioManager.bgmVolume,100);w.processOk();assert.equal(G.AudioManager.bgmVolume,0);
 const before=JSON.stringify(G.ConfigManager.makeData()),close=w._list.length-1;w.select(close);w.cursorLeft();w.cursorRight();assert.equal(w.statusText(close),'');assert.equal(JSON.stringify(G.ConfigManager.makeData()),before);w.processOk();assert.deepEqual(h.pops,[s]);assert.equal(h.writes.length,0);s.terminate();assert.equal(h.writes.length,1);assert.equal(h.writes[0].psBattleStyle,'set');assert(!Object.hasOwn(h.writes[0],'psOptionsClose'));
 const {psTextSpeed,...retained}=G.ConfigManager.makeData();assert.equal(psTextSpeed,1);assert.deepEqual(retained,h.original.make.call(G.ConfigManager));
 assert.equal(G.ConfigManager.save,h.original.save);assert.equal(G.Scene_Options.prototype.terminate,h.original.terminate);
 assert.equal(G.$gameSystem._psGame.sentinel,'read-only player state');assert.deepEqual(tr.diagnostics(),{missingKeys:[],missingParams:[]});
});
test('FR-000644 title, pause and event Options use the existing scene; Back preserves changes and same single native config save',()=>{
 const h=host(),{G}=h;new G.Scene_Menu().commandOptions();assert.equal(h.stack.pop(),G.Scene_Options);new G.Scene_Title().commandOptions.call({_commandWindow:{close(){}}});assert.equal(h.stack.pop(),G.Scene_Options);h.commands['PS_Management:ShowOptions']();assert.equal(h.stack.pop(),G.Scene_Options);
 const s=h.options(),w=s._optionsWindow;w.select(0);w.cursorRight();w.processCancel();s.terminate();assert.equal(h.writes.length,1);assert.equal(h.writes[0].alwaysDash,true);
 const make=G.ConfigManager.makeData,apply=G.ConfigManager.applyData;modules.navigation.installOptionsControls(G,()=>h.tr);
 assert.equal(h.options()._optionsWindow._list.length,11);assert.equal(G.ConfigManager.makeData,make);assert.equal(G.ConfigManager.applyData,apply);
});
for(const lang of ['zh','en'])test('FR-000639/640/641 '+lang+' actual Controls scene: four pages, timed fades, priority, final return',()=>{
 const h=host(lang),{G}=h,config=JSON.stringify(G.ConfigManager.makeData()),s=h.controls();assert.equal(s.needsCancelButton(),false);
 function ready(){h.tick(500,'ok');s.update();assert.equal(s._phase,'in');assert.equal(s._window.contentsOpacity,0);h.tick(500,'ok');s.update();assert.equal(s._phase,'ready');assert.equal(s._window.contentsOpacity,255);}
 ready();
 for(let page=1;page<=4;page++){
  assert.equal(s._page,page);assert(s._window.contents.draws.some(r=>r.text===h.tr.t('navigation.controls.title',{page})));
  h.tick(1,'cancel','ok');s.update();assert.equal(s._page,page);assert.equal(s._phase,'ready');
  for(const key of ['cancel','shift','left','right','up','down','touchBack']){h.tick(1,key);s.update();assert.equal(s._phase,'ready');}
  h.tick(1,page%2?'ok':'tap');s.update();
  if(page<4){assert.equal(s._page,page+1);assert.equal(s._phase,'out');h.tick(250,'ok');s.update();assert.equal(s._page,page+1);assert.equal(s._window.contentsOpacity,127.5);h.tick(250);s.update();assert.equal(s._phase,'in');h.tick(500);s.update();assert.equal(s._phase,'ready');}
 }
 assert.equal(s._phase,'exit');assert.equal(G.SceneManager.snapshots,1);h.tick(399,'ok');s.update();assert.equal(h.pops.length,0);h.tick(1);s.update();assert.equal(h.pops.length,1);assert.equal(s.renderedFade,255);s.update();assert.equal(h.pops.length,1);s.terminate();assert.equal(s.terminated,true);
 assert.equal(h.writes.length,0);assert.equal(JSON.stringify(G.ConfigManager.makeData()),config);assert.deepEqual(h.tr.diagnostics(),{missingKeys:[],missingParams:[]});
});
for(const [width,height] of [[512,384],[640,480],[816,624]])for(const touchUI of [true,false])test('R56-P2-01 / FR-000639/644 native touch layout '+width+'x'+height+' touch='+touchUI+' in both languages',()=>{
 for(const lang of ['en','zh']){
  const h=host(lang,width,height,false,touchUI),s=h.options(),w=s._optionsWindow,r=w.rect,help=s._helpWindow.rect,button=s._cancelButton;
  const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
  const cancel=button?{x:button.x,y:button.y,width:button.width,height:button.height}:null;
  layouts.push({lang,width,height,touchUI,options:{...r},help:{...help},cancel,itemHeight:w.itemHeight(),fullListHeight:s.calcWindowHeight(11,true),overlapArea:cancel?overlap(r,cancel):0});
  assert.equal(w.itemHeight(),44);assert.equal(s.calcWindowHeight(11,true),508);assert.equal(w._list.length,11);
  assert(r.x>=0&&r.y>=0);assert(r.x+r.width<=width);assert(r.y+r.height<=help.y);assert(help.y+help.height<=height);
  if(touchUI){assert(button);assert.equal(button.width,96);assert.equal(button.height,48);assert.equal(overlap(r,cancel),0,JSON.stringify(layouts.at(-1)));assert.equal(overlap(help,cancel),0);}
  else {assert.equal(button,undefined);assert.equal(r.y,Math.max(0,(height-120-508)/2));assert.equal(r.height,Math.min(508,height-120));}
  for(let i=0;i<w._list.length;i++){w.select(i);check(s._helpWindow);}
  const c=h.controls();for(let page=1;page<=4;page++){c._page=page;c.drawPage();check(c._window);}
  if(button){const before=JSON.stringify(h.G.ConfigManager.makeData());button.onClick();assert(w.isCancelTriggered());w.processCancel();assert.equal(h.pops.at(-1),s);assert.equal(JSON.stringify(h.G.ConfigManager.makeData()),before);assert.equal(h.writes.length,0);s.terminate();assert.equal(h.writes.length,1);}
  function check(win){for(const row of win.contents.draws){assert(row.y>=0&&row.y+row.h<=win.contents.height,JSON.stringify({lang,row,height:win.contents.height}));assert(win.textWidth(row.text)<=row.w,JSON.stringify({lang,row}));}}
 }
});
test('FR-000639 help claims correspond to installed MZ host bindings; sample and full plugin wiring expose the event command',()=>{
 const core=fs.readFileSync(path.join(ROOT,'js/reactor_core.js'),'utf8');for(const [code,semantic] of [[13,'ok'],[32,'ok'],[90,'ok'],[27,'escape'],[88,'escape'],[16,'shift'],[17,'control']])assert(core.includes(code+': "'+semantic+'"'));
 for(const k of ['case 113: // F2','case 114: // F3','case 115: // F4'])assert(core.includes(k));
 const map=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Map005.json'))),event=map.events.find(e=>e?.id===10);assert.equal(event.pages[0].list[0].parameters[1],'ShowControls');assert.equal(event.x,8);assert.equal(event.y,10);
 const h=host('zh',816,624,true);assert.equal(typeof h.G.PSManagement.openParty,'function');const s=h.options();assert.equal(s._optionsWindow._list.length,11);const c=h.controls();h.tick(500);c.update();h.tick(500);c.update();assert.equal(c._phase,'ready');assert(c._window.contents.draws.some(r=>r.text==='操作帮助　1 / 4'));assert.equal(h.writes.length,0);
});

for(const [lang,title,labels] of [['en','Text Speed',['Slow','Mid','Fast','Instant']],['zh','文字速度',['慢','中','快','即时']]])test('WP65 '+lang+' speed row: bounded input, exact live preview and native config round trip',()=>{
 const h=host(lang,816,624,true),{G,tr}=h,s=h.options(),w=s._optionsWindow,help=s._helpWindow,index=w.findSymbol('psTextSpeed'),description=tr.t('options.textSpeed.help');
 const displayed=()=>help.contents.draws.map(row=>row.text).join('');
 const tick=ms=>{h.tick(ms);help.update();};
 assert.equal(w._list[index].name,title);w.select(index);assert.equal(w.statusText(index),labels[1]);assert.equal(displayed(),description);
 w.cursorLeft();assert.equal(w.statusText(index),labels[0]);assert.equal(displayed(),description.slice(0,1));
 const idle=h.stats();w.cursorLeft();w.processOk();w.select(index);tick(49);assert.deepEqual(h.stats(),idle);assert.equal(displayed(),description.slice(0,1));
 tick(1);assert.equal(displayed(),description.slice(0,2));assert.equal(h.stats().measures,idle.measures);
 w.cursorRight();assert.equal(w.statusText(index),labels[1]);tick(25);assert.equal(displayed(),description.slice(0,2));
 w.cursorRight();assert.equal(w.statusText(index),labels[2]);tick(12.5);assert.equal(displayed(),description.slice(0,2));
 w.cursorRight();assert.equal(w.statusText(index),labels[3]);assert.equal(displayed(),description);
 const instant=h.stats();w.cursorRight();w.processOk();tick(10000);assert.deepEqual(h.stats(),instant);
 w.cursorLeft();w.select(w.findSymbol('alwaysDash'));const other=displayed();tick(1000);assert.equal(displayed(),other);
 w.select(index);w.cursorRight();w.processCancel();assert.deepEqual(h.pops,[s]);assert.equal(h.writes.length,0);
 s.terminate();assert.equal(h.writes.length,1);assert.equal(h.writes[0].psTextSpeed,3);assert.equal(G.$gameSystem._psGame.sentinel,'read-only player state');
 const reboot=host(lang,816,624,true);reboot.G.ConfigManager.applyData(h.writes[0]);const next=reboot.options()._optionsWindow;
 assert.equal(next.statusText(next.findSymbol('psTextSpeed')),labels[3]);assert.equal(reboot.writes.length,0);
});

test('WP65 speed accepts only its four integer indices and keeps the other native/device fields',()=>{
 const h=host(),config=h.G.ConfigManager;
 for(const value of [0,1,2,3,undefined,null,'3',true,1.5,-1,4,NaN,Infinity]){
  config.applyData({psTextSpeed:value,bgmVolume:80,alwaysDash:true,psBattleStyle:'set',psBattleEffects:false});
  assert.equal(config.makeData().psTextSpeed,[0,1,2,3].includes(value)?value:1);
  assert.equal(config.bgmVolume,80);assert.equal(config.alwaysDash,true);assert.equal(config.psBattleStyle,'set');assert.equal(config.psBattleEffects,false);
 }
 config.applyData(Object.create({psTextSpeed:0}));assert.equal(config.psTextSpeed,1);assert.equal(h.writes.length,0);
});

test('WP65 multi-line speed preview wraps once and an update draws only newly visible text',()=>{
 const h=host('en',300,384,true,false),s=h.options(),w=s._optionsWindow,help=s._helpWindow;w.select(w.findSymbol('psTextSpeed'));
 const full=help.contents.draws.map(row=>row.text);assert(full.length>1);
 w.cursorLeft();const measures=h.stats().measures;
 h.tick(full[0].length*50);help.update();assert.deepEqual(help.contents.draws.map(row=>row.text),[full[0],full[1][0]]);
 h.tick(5000);help.update();assert.deepEqual(help.contents.draws.map(row=>row.text),full);
 assert.equal(h.stats().measures,measures);
});
