'use strict';
// WP65 TC01/04/05/06: production card + installed native menu/stack/fade/button method bodies.
// Window bitmap and input devices are controlled; this suite does not launch NW or read player saves.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'../../..'),OUT=path.join(ROOT,'build/step5-6-trainer-card');
let adapter,E;
test.before(async()=>{
 const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));
 await vite.build({configFile:false,root:ROOT,logLevel:'error',build:{outDir:OUT,emptyOutDir:false,minify:false,lib:{entry:path.join(ROOT,'src/plugins/navigation/trainer-card.ts'),formats:['cjs'],fileName:()=>'adapter.cjs'}}});
 adapter=require(path.join(OUT,'adapter.cjs'));E=require(path.join(ROOT,'js/engine/build/engine.cjs'));
});
function method(source,name){const a=source.indexOf(name+' = function'),b=source.indexOf('\n};',a);assert(a>=0&&b>a,name);return source.slice(a,b+3);}
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
function host(lang='en',width=816,height=624,touchUI=true,production=false){
 const windows=fs.readFileSync(path.join(ROOT,'js/reactor_windows.js'),'utf8'),scenes=fs.readFileSync(path.join(ROOT,'js/reactor_scenes.js'),'utf8'),managers=fs.readFileSync(path.join(ROOT,'js/reactor_managers.js'),'utf8'),sprites=fs.readFileSync(path.join(ROOT,'js/reactor_sprites.js'),'utf8');
 let state=freeze({player:{id:0x1234002a,name:'小明\\C[2]',gender:1,language:2},money:1234567,dex:{hasDex:false,seen:['a','b','c'],owned:['a'],unlocked:[false,false]},badges:Array.from({length:16},(_,i)=>[0,3,7,8,10].includes(i)),stats:{play_time:3661},sentinel:{schema:11,history:'unchanged'}});
 let content=freeze({regionalDex:{national:['a','b','c','d'],regions:[{id:0,species:['a']},{id:1,species:['b']}]},mapMetadata:{maps:{5:{mapPosition:{regionId:0,x:1,y:2}},6:{mapPosition:{regionId:1,x:1,y:2}},7:{}}}}),mapId=5;
 const keys=new Set(),sounds=[],writes=[],created=[],tr=E.i18n.translatorFor(lang);
 const G={console,performance:{now:()=>0},Graphics:{boxWidth:width,boxHeight:height},ConfigManager:{touchUI},TextManager:{},Input:{isTriggered:k=>keys.has(k),isRepeated:k=>keys.has(k),keyMapper:{},isPressed:()=>false},TouchInput:{isCancelled:()=>keys.has('touchBack')},
  SoundManager:{playOk:()=>sounds.push('ok'),playCancel:()=>sounds.push('cancel')},$gameMap:{mapId:()=>mapId},$gameParty:{exists:()=>false,size:()=>0},$dataSystem:{menuCommands:[true,true,true,true,true,true]},DataManager:{isEventTest:()=>false,saveGame:()=>writes.push('save')},StorageManager:{saveObject:()=>writes.push('storage')},$gameSystem:{isSaveEnabled:()=>true,isFormationEnabled:()=>true},
  Rectangle:function(x,y,width,height){Object.assign(this,{x,y,width,height});},Window_Base:function(r){this.initialize(r);},Window_Command:function(){},Window_Selectable:function(){},Scene_Base:function(){},Scene_MenuBase:function(){},Scene_Menu:function(){this.initialize();},
  SceneManager:{_stack:[],exit(){throw Error('unexpected exit');}},PluginManager:{registerCommand(){}},document:{addEventListener(){}},addEventListener(){}};
 Object.defineProperty(G.$gameSystem,'_psGame',{get:()=>state,set:()=>{throw Error('state write');}});
 G.PSFlow={game:()=>state,content:()=>content,translator:()=>tr};G.window=G;
 G.Window_Base.prototype={initialize(rect){this.rect=rect;this.contents={width:rect.width-24,height:rect.height-24,draws:[],clear(){this.draws=[];},drawText(text,x,y,w,h,align){this.draws.push({text,x,y,w,h,align,font:this.fontFace});}};created.push(this);},resetFontSettings(){this.contents.fontSize=28;},textWidth(t){return t.length*12;}};
 G.Window_Command.prototype=Object.create(G.Window_Base.prototype);
 Object.assign(G.Window_Command.prototype,{initialize(rect){G.Window_Base.prototype.initialize.call(this,rect);this._list=[];this.handlers={};this.active=true;this.makeCommandList();},addCommand(name,symbol,enabled=true){this._list.push({name,symbol,enabled});},setHandler(k,f){this.handlers[k]=f;},callHandler(k){this.handlers[k]();},isHandled(k){return !!this.handlers[k];},select(i){this._index=i;},findSymbol(s){return this._list.findIndex(r=>r.symbol===s);},currentData(){return this._list[this._index];},deactivate(){this.active=false;},activate(){this.active=true;},playOkSound(){sounds.push('menu-ok');},updateInputData(){keys.clear();}});
 G.Window_Selectable.prototype=G.Window_Command.prototype;
 G.Scene_MenuBase.prototype={initialize(){this.children=[];this._fadeDuration=0;},create(){this.createButtons();},start(){},update(){this.updateFade();},stop(){},terminate(){},addWindow(w){this.children.push(w);},addChild(n){this.children.push(n);},fadeSpeed(){return 24;}};
 G.Scene_Menu.prototype=Object.create(G.Scene_MenuBase.prototype);G.Scene_Menu.prototype.constructor=G.Scene_Menu;
 for(const name of ['commandItem','commandPersonal','commandFormation','commandOptions','commandSave','commandGameEnd'])G.Scene_Menu.prototype[name]=()=>{};
 G.Scene_Menu.prototype.commandWindowRect=()=>new G.Rectangle(0,0,300,500);
 G.Scene_Menu.prototype.mainAreaTop=()=>52;G.Scene_Menu.prototype.mainAreaHeight=()=>height-52;
 vm.createContext(G);
 function load(source,names){for(const name of names)vm.runInContext(method(source,name),G);}
 G.Window_Command.prototype.ensureCursorVisible=()=>{};
 G.Input.virtualClick=k=>keys.add(k);
 G.Scene_MenuBase.prototype.updateColorFilter=function(){this.renderedFade=this._fadeOpacity;};
 load(windows,['Window_Selectable.prototype.forceSelect','Window_Selectable.prototype.processOk','Window_Command.prototype.currentSymbol','Window_Command.prototype.isCurrentItemEnabled','Window_Command.prototype.selectSymbol','Window_Command.prototype.callOkHandler']);
 vm.runInContext(windows.slice(windows.indexOf('function Window_MenuCommand()'),windows.indexOf('// Window_MenuStatus')),G);
 load(scenes,['Scene_Menu.prototype.initialize','Scene_Menu.prototype.createCommandWindow','Scene_MenuBase.prototype.createButtons','Scene_MenuBase.prototype.needsCancelButton','Scene_MenuBase.prototype.createCancelButton','Scene_MenuBase.prototype.needsPageButtons']);
 load(scenes,['Scene_Base.prototype.startFadeIn','Scene_Base.prototype.startFadeOut','Scene_Base.prototype.updateFade','Scene_Base.prototype.isBusy','Scene_Base.prototype.isFading','Scene_Base.prototype.popScene','Scene_Base.prototype.isBottomButtonMode','Scene_Base.prototype.buttonAreaTop','Scene_Base.prototype.buttonAreaHeight','Scene_Base.prototype.buttonY']);
 for(const name of ['startFadeIn','startFadeOut','updateFade','isBusy','isFading','popScene','isBottomButtonMode','buttonAreaTop','buttonAreaHeight','buttonY'])G.Scene_MenuBase.prototype[name]=G.Scene_Base.prototype[name];
 G.Sprite_Button=function(type){this._buttonType=type;const d=this.buttonData();this.width=d.w*this.blockWidth();this.height=this.blockHeight();};
 load(sprites,['Sprite_Button.prototype.buttonData','Sprite_Button.prototype.blockWidth','Sprite_Button.prototype.blockHeight','Sprite_Button.prototype.setClickHandler','Sprite_Button.prototype.onClick']);
 load(managers,['SceneManager.goto','SceneManager.push','SceneManager.pop']);
 if(production){G.Game_Interpreter=function(){};G.Game_Interpreter.prototype.updateWaitMode=()=>false;G.Scene_Map=function(){};G.Scene_Map.prototype.start=()=>{};vm.runInContext(fs.readFileSync(path.join(ROOT,'js/plugins/PS_Management.js'),'utf8'),G,{filename:'PS_Management.js'});}
 else adapter.installTrainerCard(G,()=>G.PSFlow);
 function menu(){const m=new G.Scene_Menu();G.SceneManager._scene=m;m.createCommandWindow();return m;}
 function enter(){const m=menu(),w=m._commandWindow;w.selectSymbol('psTrainerCard');w.processOk();const s=G.SceneManager._nextScene;assert.equal(s.constructor,G.Scene_PSTrainerCard);G.SceneManager._scene=s;s.create();s.start();return {m,s};}
 function tick(s,n=1,...input){keys.clear();input.forEach(k=>keys.add(k));for(let i=0;i<n;i++)s.update();keys.clear();}
 return {G,tr,keys,sounds,writes,created,menu,enter,tick,get state(){return state;},get content(){return content;},setState(x){state=freeze(x);},setContent(x){content=freeze(x);},map(id){mapId=id;}};
}
const texts=s=>s._window.contents.draws.map(d=>d.text);
for(const lang of ['en','zh'])test(lang+' normal native pause entry → read-only card → native menu stack, bilingual fields and no writes',()=>{
 const h=host(lang),before=JSON.stringify(h.state),{m,s}=h.enter();assert.equal(m._commandWindow.currentData().name,h.state.player.name);assert.equal(m._commandWindow.currentData().enabled,true);assert.equal(m._commandWindow.active,false);
 const out=texts(s);for(const value of [h.tr.t('navigation.trainerCard.title'),h.state.player.name,'00042','1,234,567','1 / 3'])assert(out.includes(value),value);
 assert.equal(out.filter(t=>t==='—').length,2);assert(!out.includes('1h 1m'));assert.deepEqual(out.filter(t=>/^[1-8]$/.test(t)),['1','4','8']);
 h.tick(s,24);h.tick(s,1,'cancel');assert.equal(s._closing,true);assert(s.isBusy());assert.equal(h.G.SceneManager._stack.length,1);h.tick(s,24);assert.equal(h.G.SceneManager._nextScene.constructor,h.G.Scene_Menu);assert.equal(h.G.SceneManager._stack.length,0);
 const returned=h.G.SceneManager._nextScene;returned.createCommandWindow();assert.equal(returned._commandWindow.currentData().symbol,'psTrainerCard');assert(returned._commandWindow.active);assert.deepEqual(h.sounds,['menu-ok','ok','cancel']);assert.equal(JSON.stringify(h.state),before);assert.deepEqual(h.writes,[]);assert.deepEqual(h.tr.diagnostics(),{missingKeys:[],missingParams:[]});
});
for(const lang of ['en','zh'])test(lang+' confirm/action/directions do nothing; BACK, simultaneous BACK+OK and native touch Back close',()=>{
 const h=host(lang),{s}=h.enter(),draws=JSON.stringify(s._window.contents.draws);h.tick(s,24);
 for(const key of ['ok','shift','left','right','up','down','tap']){h.tick(s,1,key);assert.equal(s._closing,false);assert.equal(JSON.stringify(s._window.contents.draws),draws);}
 h.tick(s,1,'cancel','ok');assert.equal(s._closing,true);h.tick(s,24);
 const next=h.enter().s;h.tick(next,24);next._cancelButton.onClick();next.update();assert(next._closing);h.tick(next,24);assert.equal(h.G.SceneManager._nextScene.constructor,h.G.Scene_Menu);
 const touch=h.enter().s;h.tick(touch,24);h.tick(touch,1,'touchBack');assert(touch._closing);assert.deepEqual(h.writes,[]);
});
for(const [width,height] of [[512,384],[640,480],[816,624]])for(const touch of [true,false])test(width+'×'+height+' touch='+touch+' keeps all bilingual text and badge positions inside card, clear of native button',()=>{
 for(const lang of ['zh','en']){const h=host(lang,width,height,touch),{s}=h.enter(),w=s._window,r=w.rect;assert.equal(!!s._cancelButton,touch);if(touch)assert(r.y>=s._cancelButton.y+s._cancelButton.height);
 for(const d of w.contents.draws){assert(d.x>=0&&d.y>=0&&d.x+d.w<=w.contents.width+.001&&d.y+d.h<=w.contents.height,d.text+JSON.stringify(d));}
 const badges=w.contents.draws.filter(d=>/^[1-8]$/.test(d.text));assert.deepEqual(badges.map(d=>d.text),['1','4','8']);assert.equal((badges[1].x-badges[0].x)/(badges[2].x-badges[0].x),3/7);}
});
test('current-region query, eight-slot offset, absent position defaults to region zero; national dex count ignores viewing/unlock gates',()=>{
 const h=host();h.map(6);let s=h.enter().s;assert.deepEqual(texts(s).filter(t=>/^[1-8]$/.test(t)),['1','3']);assert(texts(s).includes('1 / 3'));
 h.map(7);s=h.enter().s;assert.deepEqual(texts(s).filter(t=>/^[1-8]$/.test(t)),['1','4','8']);h.map(99);s=h.enter().s;assert(texts(s).includes('Badges — region 0'));
});
test('snapshot is drawn once, reopening reflects current authorities, time/date stay deferred without lazy writes',()=>{
 const h=host(),{s}=h.enter(),before=JSON.stringify(h.state),draws=JSON.stringify(s._window.contents.draws);h.tick(s,200);assert.equal(JSON.stringify(h.state),before);assert.equal(JSON.stringify(s._window.contents.draws),draws);
 h.setState({...h.state,player:{...h.state.player,name:'Renamed',id:65535},money:999,dex:{...h.state.dex,owned:['a','b']},badges:Array(16).fill(false),stats:{play_time:98765}});h.tick(s,1);assert.equal(JSON.stringify(s._window.contents.draws),draws);const newer=h.enter().s;assert(texts(newer).includes('Renamed'));assert(texts(newer).includes('65535'));assert(texts(newer).includes('999'));assert(texts(newer).includes('2 / 3'));assert.equal(texts(newer).filter(t=>t==='—').length,2);assert.deepEqual(h.writes,[]);
});
test('full compiled PS_Management connects the native pause command to this card',()=>{
 const h=host('zh',816,624,true,true),before=JSON.stringify(h.state),{s}=h.enter();assert(texts(s).includes('训练家卡'));h.tick(s,24);h.tick(s,1,'cancel');h.tick(s,24);assert.equal(h.G.SceneManager._nextScene.constructor,h.G.Scene_Menu);assert.equal(JSON.stringify(h.state),before);assert.deepEqual(h.writes,[]);
});
