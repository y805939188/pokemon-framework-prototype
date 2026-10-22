'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const E=require('../../../js/engine/build/engine.cjs');
let builtPlugin='',builtDir;test.before(()=>{builtDir=fs.mkdtempSync(path.join(os.tmpdir(),'ps51-management-host-'));const built=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',builtDir],{env:{...process.env,RR_PLUGIN:'PS_Management'},encoding:'utf8'});assert.equal(built.status,0,built.stdout+built.stderr);builtPlugin=fs.readFileSync(path.join(builtDir,'PS_Management.js'),'utf8');});test.after(()=>{if(builtDir)fs.rmSync(builtDir,{recursive:true,force:true});});
function host(options={}){
 const state=E.fakes.createMemoryState(E.fixtures.savedFor(E.fixtures.makeGame(),E.fixtures.content));
 const app=new E.app.GameApplication({state,sessions:E.fakes.createFakeSessions({}),content:()=>({content:E.fixtures.content}),projection:E.fakes.createRecordingProjection(),random:n=>Math.min(n-1,7),clock:()=>1000},options);
 const listeners={},commands={},input={trigger:new Set(),repeat:new Set(),pressed:new Set(),keyMapper:{},isTriggered(k){return this.trigger.has(k)},isRepeated(k){return this.repeat.has(k)},isPressed(k){return this.pressed.has(k)},clear(){this.trigger.clear();this.repeat.clear();this.pressed.clear()}};
 function Base(){}Base.prototype.initialize=function(){};Base.prototype.create=function(){};Base.prototype.start=function(){};Base.prototype.update=function(){};Base.prototype.terminate=function(){};Base.prototype.popScene=function(){manager.popped++;};
 let windowFailures=options.windowFailures??0;function Win(){}Win.prototype.initialize=function(){if(windowFailures-->0)throw Error('injected window resource failure');this.contents={width:792,height:576,clear(){},fillRect(){},drawText(){}}};Win.prototype.activate=function(){};Base.prototype.addWindow=function(){};
 const manager={_scene:null,popped:0,isSceneChanging:()=>false,push(C){this._scene=new C();this._scene.create();this._scene.start();},goto(C){this.push(C)}};
 const document={addEventListener(k,fn){(listeners[k]??=new Set()).add(fn)},removeEventListener(k,fn){listeners[k]?.delete(fn)},body:{appendChild(){}},createElement(){const local={};return {style:{},setAttribute(){},addEventListener(k,fn){local[k]=fn},focus(){},remove(){this.removed=true},events:local,value:''}}};
 const G={console,structuredClone,Date,Input:input,TouchInput:{clear(){},isCancelled:()=>false},Graphics:{boxWidth:816,boxHeight:624,frameCount:0},Scene_MenuBase:Base,Scene_Map:Base,Window_Base:Win,Rectangle:function(){},SceneManager:manager,PluginManager:{registerCommand(p,n,f){commands[p+':'+n]=f}},Game_Interpreter:Base,SoundManager:{playBuzzer(){},playCancel(){}},$gameMessage:{add(){}},$gameSwitches:{value:()=>false},$dataMap:{meta:{}},$dataSystem:{switches:Array(36).fill('')},PSFlow:{app:()=>app,_app:app,translator:()=>E.i18n.translatorFor('en'),speciesName:s=>s,resolveReceiving:(...a)=>app.resolveReceiving(...a)}};
 G.window=G;G.document=document;vm.runInNewContext(builtPlugin,G);
 const tick=()=>{G.Graphics.frameCount++;manager._scene.update();input.trigger.clear();input.repeat.clear();};
 const press=(k)=>{input.trigger.add(k);input.repeat.add(k);input.pressed.add(k);tick();input.pressed.delete(k);tick();};
 const ready=()=>{tick();tick();assert.equal(G.PSManagement.current()?.ready,true)};
 const down=()=>press('down'),use=()=>press('ok'),back=()=>press('cancel');
 const choose=key=>{ready();let n=0;while(G.PSManagement.current().view.items[G.PSManagement.current().view.cursor]?.key!==key&&n++<50)down();assert.equal(G.PSManagement.current().view.items[G.PSManagement.current().view.cursor]?.key,key);use();};
 return {G,app,state,input,listeners,manager,document,tick,press,ready,choose,down,use,back};
}
test('P51-18/T24: real built scene does not accept inputs until start/layout boundary; rapid held trigger cannot select next view',()=>{
 const h=host();h.G.PSManagement.openParty();assert.equal(h.G.PSManagement.current().ready,false);h.use();assert.equal(h.G.PSManagement.current().view.kind,'party');h.ready();h.use();assert.equal(h.G.PSManagement.current().view.kind,'menu');h.ready();assert.equal(h.G.PSManagement.current().view.kind,'menu');h.choose('summary');h.ready();assert.equal(h.G.PSManagement.current().view.kind,'summary');h.back();h.ready();assert.equal(h.G.PSManagement.current().view.kind,'party');
});
test('P51-10a/UI: held member survives box metadata edits; explicit cancel only drops movement, never rolls back box name',()=>{
 const h=host();h.G.PSManagement.openStorage();h.choose('organize');h.ready();h.press('up');h.use();h.choose('name');const c=h.manager._scene._controller;assert.equal(c.top().kind,'text');c.input.value='A箱';c.input.events.keydown({key:'Enter',preventDefault(){},stopPropagation(){}});h.ready();assert.equal(h.state.current().storage.boxes[0].name,'A箱');
 h.press('down');h.press('down'); // from header to slot 8
 h.back();h.choose('no');h.ready();assert.equal(h.G.PSManagement.current().view.kind,'menu');
});
test('P51-16/UI: IME composition does not submit; box-name Escape keeps value and removes native input',()=>{
 const h=host();h.G.PSManagement.openStorage();h.choose('organize');h.ready();h.press('up');h.use();h.choose('name');const c=h.manager._scene._controller,e=c.input;e.value='组合中';e.events.compositionstart();e.events.keydown({key:'Enter',preventDefault(){},stopPropagation(){}});assert.equal(c.top().kind,'text');e.events.compositionend();e.events.keydown({key:'Escape',preventDefault(){},stopPropagation(){}});assert.equal(h.state.current().storage.boxes[0].name,'');assert.equal(e.removed,true);
});
test('P51-12/UI: normal gift asks nickname, No preserves it and commits exactly once; receiving cannot close prematurely',()=>{
 const h=host();const out=h.app.receiveGift({kind:'normal',member:{existing:{...E.state.clone(h.state.current().party[0]),id:'GIFT'}}});assert.equal(out.status,'pending');const count=h.state.current().party.length;h.G.PSManagement.openReceiving();h.choose('no');assert.equal(h.state.current().party.length,count+1);assert.equal(h.app.pendingReceiving,null);assert.equal(h.app.saveBlocked,false);assert.equal(h.manager.popped,1);
});
test('P51-12/UI: full party force mode has no cancel/box exit; normal full party can choose party summary and box',()=>{
 const h=host({receivingProfile:{mode:2,naming:1}}),s=E.state.clone(h.state.current());while(s.party.length<6){const m=E.state.clone(s.party[0]);m.id='F'+s.party.length;s.party.push(m)}h.state.replace(s);const out=h.app.receiveGift({kind:'normal',member:{existing:{...E.state.clone(h.state.current().party[0]),id:'GIFT'}}});assert.equal(out.status,'pending');h.G.PSManagement.openReceiving();h.ready();h.back();assert.equal(h.app.saveBlocked,true);assert.equal(h.manager.popped,0);assert.ok(!h.G.PSManagement.current().view.items.some(x=>x.key==='box'));h.choose('party');h.ready();h.use();assert.equal(h.app.pendingReceiving,null);assert.equal(E.storage.boxedMembers(h.state.current()).length,1);
});
test('P51-18/UI: load generation invalidates old callback, keeps new state and removes all owned input listeners',()=>{
 const h=host();h.G.PSManagement.openStorage();h.choose('organize');h.ready();h.press('up');h.use();h.choose('name');const c=h.manager._scene._controller,e=c.input,before=JSON.stringify(h.state.current());h.app.stateReplacedByHost();e.value='late';e.events.keydown({key:'Enter',preventDefault(){},stopPropagation(){}});assert.equal(JSON.stringify(h.state.current()),before);h.manager._scene.terminate();assert.equal(h.listeners.keydown.size,0);assert.equal(h.listeners.keyup.size,0);assert.equal(e.removed,true);
});
test('P51-18/UI: 100 open/close lifecycles release management owner and native listeners',()=>{
 const h=host();for(let i=0;i<100;i++){assert.equal(h.G.PSManagement.openParty(),true);h.ready();h.back();h.manager._scene.terminate();assert.equal(h.G.PSManagement.current(),null);assert.equal(h.app.saveBlocked,false);assert.equal(h.listeners.keydown.size,0)}
});
test('P51-21/UI: a replacement application starting at generation zero cannot share an old scene token or cleanup ownership',()=>{
 const h=host();h.G.PSManagement.openParty();h.ready();const old=h.manager._scene;
 const state=E.fakes.createMemoryState(E.fixtures.makeGame()),newApp=new E.app.GameApplication({state,sessions:E.fakes.createFakeSessions({}),content:()=>({content:E.fixtures.content}),projection:E.fakes.createRecordingProjection()});
 const token=newApp.beginManagement(),m=state.current().party[0];newApp.manage(token,'pick',{kind:'pick-up',source:{id:m.id,position:{kind:'party',index:0}}});assert.equal(newApp.saveBlocked,true);h.G.PSFlow.app=()=>newApp;assert.equal(old._controller.valid(),false,'application identity is part of validity even when both generations are zero');old.terminate();assert.equal(newApp.saveBlocked,true);assert.equal(newApp.manage(token,'cancel',{kind:'cancel-held'}).status,'cancelled');
});
test('P51-10/UI: inherited MZ cancel button must respect held member and ask explicit cancellation',()=>{
 const h=host();h.G.PSManagement.openStorage();h.choose('organize');h.ready();const c=h.manager._scene._controller;c.push({kind:'panel',cursor:0,mode:'organize',box:0});h.ready();h.press('shift');h.ready();assert.ok(h.G.PSManagement.current().heldId);h.manager._scene.popScene();assert.equal(h.G.PSManagement.current().view.kind,'menu');assert.equal(h.manager.popped,0);assert.equal(h.app.saveBlocked,true);h.choose('no');h.ready();assert.ok(h.G.PSManagement.current().heldId);h.manager._scene.popScene();h.choose('yes');assert.equal(h.app.saveBlocked,false);
});
test('P51-14/UI: actual window creation fails twice, then explicit rebuild-failed fallback commits once and preserves destination notice',()=>{
 const h=host({windowFailures:2}),gift={...E.state.clone(h.state.current().party[0]),id:'FAILED-UI'};assert.equal(h.app.receiveGift({kind:'normal',member:{existing:gift}}).status,'pending');h.G.PSManagement.openReceiving();assert.equal(h.app.pendingReceiving,null);assert.equal(h.app.saveBlocked,false);assert.equal(h.state.current().party.filter(m=>m.id==='FAILED-UI').length,1);assert.equal(h.app.receivingNotifications.length,1);assert.equal(h.manager.popped,1);h.manager._scene.terminate();assert.equal(h.app.receivingNotifications.length,1,'notice waits for healthy map presentation');
});
