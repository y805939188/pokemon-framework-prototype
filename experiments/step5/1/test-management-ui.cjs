'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const E=require('../../../js/engine/build/engine.cjs');
let builtPlugin='',builtDir;test.before(()=>{builtDir=fs.mkdtempSync(path.join(os.tmpdir(),'ps51-management-host-'));const built=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',builtDir],{env:{...process.env,RR_PLUGIN:'PS_Management'},encoding:'utf8'});assert.equal(built.status,0,built.stdout+built.stderr);builtPlugin=fs.readFileSync(path.join(builtDir,'PS_Management.js'),'utf8');});test.after(()=>{if(builtDir)fs.rmSync(builtDir,{recursive:true,force:true});});
function host(options={}){
 const state=E.fakes.createMemoryState(E.fixtures.savedFor(E.fixtures.makeGame(),E.fixtures.content));
 const app=new E.app.GameApplication({state,sessions:E.fakes.createFakeSessions({}),content:()=>({content:E.fixtures.content}),projection:E.fakes.createRecordingProjection(),random:n=>Math.min(n-1,7),clock:()=>1000},options);
 const listeners={},windowEvents={},commands={},input={trigger:new Set(),repeat:new Set(),pressed:new Set(),keyMapper:{},isTriggered(k){return this.trigger.has(k)},isRepeated(k){return this.repeat.has(k)},isPressed(k){return this.pressed.has(k)},clear(){this.trigger.clear();this.repeat.clear();this.pressed.clear()}};
 function Base(){}Base.prototype.initialize=function(){};Base.prototype.create=function(){};Base.prototype.start=function(){};Base.prototype.update=function(){};Base.prototype.terminate=function(){};Base.prototype.popScene=function(){manager.popped++;};
 let windowFailures=options.windowFailures??0;function Win(){}Win.prototype.initialize=function(){if(windowFailures-->0)throw Error('injected window resource failure');this.contents={width:792,height:576,clear(){},fillRect(){},drawText(text){this.drawn??=[];this.drawn.push({text,color:this.textColor})}}};Win.prototype.textWidth=s=>String(s).length*10;Win.prototype.activate=function(){};let attachFailures=options.attachFailures??0;Base.prototype.addWindow=function(){if(attachFailures-->0)throw Error('injected attachment failure')};
 const manager={_scene:null,popped:0,isSceneChanging:()=>false,push(C){this._scene=new C();this._scene.create();this._scene.start();},goto(C){this.push(C)}};
 const document={addEventListener(k,fn){(listeners[k]??=new Set()).add(fn)},removeEventListener(k,fn){listeners[k]?.delete(fn)},body:{appendChild(){}},createElement(){const local={};return {style:{},setAttribute(){},addEventListener(k,fn){local[k]=fn},focus(){},remove(){this.removed=true},events:local,value:''}}};
 const G={console,structuredClone,Date,Input:input,TouchInput:{clear(){},isCancelled:()=>false},Graphics:{boxWidth:816,boxHeight:624,frameCount:0},Scene_MenuBase:Base,Scene_Map:Base,Window_Base:Win,Rectangle:function(){},SceneManager:manager,PluginManager:{registerCommand(p,n,f){commands[p+':'+n]=f}},Game_Interpreter:Base,SoundManager:{playBuzzer(){},playCancel(){}},$gameMessage:{add(){}},$gameSwitches:{value:()=>false},$dataMap:{meta:{}},$dataSystem:{switches:Array(36).fill('')},PSFlow:{app:()=>app,_app:app,translator:()=>E.i18n.translatorFor('en'),speciesName:s=>s,resolveReceiving:(...a)=>app.resolveReceiving(...a)}};
 G.window=G;G.addEventListener=(key,fn)=>{(windowEvents[key]??=new Set()).add(fn)};G.document=document;vm.runInNewContext(builtPlugin,G);
 const tick=()=>{G.Graphics.frameCount++;manager._scene.update();input.trigger.clear();input.repeat.clear();};
 const press=(k)=>{input.trigger.add(k);input.repeat.add(k);input.pressed.add(k);tick();input.pressed.delete(k);tick();};
 const ready=()=>{tick();tick();assert.equal(G.PSManagement.current()?.ready,true)};
 const down=()=>press('down'),use=()=>press('ok'),back=()=>press('cancel');
 const choose=key=>{ready();let n=0;while(G.PSManagement.current().view.items[G.PSManagement.current().view.cursor]?.key!==key&&n++<50)down();assert.equal(G.PSManagement.current().view.items[G.PSManagement.current().view.cursor]?.key,key);use();};
 const releaseNative=key=>{for(const fn of listeners.keyup??[])fn({key,code:key,keyCode:key==='Enter'?13:27})};
 return {G,app,state,input,listeners,windowEvents,manager,document,tick,press,ready,choose,down,use,back,releaseNative};
}
test('P51-18/T24: real built scene does not accept inputs until start/layout boundary; rapid held trigger cannot select next view',()=>{
 const h=host();h.G.PSManagement.openParty();assert.equal(h.G.PSManagement.current().ready,false);h.use();assert.equal(h.G.PSManagement.current().view.kind,'party');h.ready();h.use();assert.equal(h.G.PSManagement.current().view.kind,'menu');h.ready();assert.equal(h.G.PSManagement.current().view.kind,'menu');h.choose('summary');h.ready();assert.equal(h.G.PSManagement.current().view.kind,'summary');h.back();h.ready();assert.equal(h.G.PSManagement.current().view.kind,'party');
});
test('P51-10a/UI: held member survives box metadata edits; explicit cancel only drops movement, never rolls back box name',()=>{
 const h=host();h.G.PSManagement.openStorage();h.choose('organize');h.ready();h.press('up');h.use();h.choose('name');const c=h.manager._scene._controller;assert.equal(c.top().kind,'text');c.input.value='A箱';c.input.events.keydown({key:'Enter',preventDefault(){},stopPropagation(){}});h.releaseNative('Enter');h.ready();assert.equal(h.state.current().storage.boxes[0].name,'A箱');
 h.press('down');h.press('down'); // from header to slot 8
 h.back();h.choose('no');h.ready();assert.equal(h.G.PSManagement.current().view.kind,'menu');
});
test('P51-16/UI: IME composition does not submit; box-name Escape keeps value and removes native input',()=>{
 const h=host();h.G.PSManagement.openStorage();h.choose('organize');h.ready();h.press('up');h.use();h.choose('name');const c=h.manager._scene._controller,e=c.input;e.value='组合中';e.events.compositionstart();e.events.keydown({key:'Enter',preventDefault(){},stopPropagation(){}});assert.equal(c.top().kind,'text');e.events.compositionend();e.events.keydown({key:'Escape',preventDefault(){},stopPropagation(){}});h.releaseNative('Escape');assert.equal(h.state.current().storage.boxes[0].name,'');assert.equal(e.removed,true);
});
test('P51-12/UI: normal gift asks nickname, No preserves it and commits exactly once; receiving cannot close prematurely',()=>{
 const h=host();const out=h.app.receiveGift({kind:'normal',member:{existing:{...E.state.clone(h.state.current().party[0]),id:'GIFT'}}});assert.equal(out.status,'pending');const count=h.state.current().party.length;h.G.PSManagement.openReceiving();h.choose('no');assert.equal(h.state.current().party.length,count+1);assert.equal(h.app.pendingReceiving,null);assert.equal(h.app.saveBlocked,false);assert.equal(h.manager.popped,1);
});
test('P51-12/UI: full party force mode has no cancel/box exit; normal full party can choose party summary and box',()=>{
 const h=host({receivingProfile:{mode:2,naming:1}}),s=E.state.clone(h.state.current());while(s.party.length<6){const m=E.state.clone(s.party[0]);m.id='F'+s.party.length;s.party.push(m)}h.state.replace(s);const out=h.app.receiveGift({kind:'normal',member:{existing:{...E.state.clone(h.state.current().party[0]),id:'GIFT'}}});assert.equal(out.status,'pending');h.G.PSManagement.openReceiving();h.ready();h.back();assert.equal(h.app.saveBlocked,true);assert.equal(h.manager.popped,0);assert.ok(!h.G.PSManagement.current().view.items.some(x=>x.key==='box'));h.choose('party');h.ready();h.use();assert.equal(h.app.pendingReceiving,null);assert.equal(E.storage.boxedMembers(h.state.current()).length,1);
});
test('P51-18/UI: load generation invalidates old callback, keeps new state and removes all owned input listeners',()=>{
 const h=host();h.G.PSManagement.openStorage();h.choose('organize');h.ready();h.press('up');h.use();h.choose('name');const c=h.manager._scene._controller,e=c.input,before=JSON.stringify(h.state.current());h.app.stateReplacedByHost();e.value='late';e.events.keydown({key:'Enter',preventDefault(){},stopPropagation(){}});assert.equal(JSON.stringify(h.state.current()),before);h.manager._scene.terminate();assert.equal(h.listeners.keydown.size,1);assert.equal(h.listeners.keyup.size,1,'one plugin-lifetime native release listener, no scene listener retained');assert.equal(e.removed,true);
});
test('P51-18/UI: 100 open/close lifecycles release management owner and native listeners',()=>{
 const h=host();for(let i=0;i<100;i++){assert.equal(h.G.PSManagement.openParty(),true);h.ready();h.back();h.manager._scene.terminate();assert.equal(h.G.PSManagement.current(),null);assert.equal(h.app.saveBlocked,false);assert.equal(h.listeners.keydown.size,1)}
});
test('P51-21/UI: a replacement application starting at generation zero cannot share an old scene token or cleanup ownership',()=>{
 const h=host();h.G.PSManagement.openParty();h.ready();const old=h.manager._scene;
 const state=E.fakes.createMemoryState(E.fixtures.makeGame()),newApp=new E.app.GameApplication({state,sessions:E.fakes.createFakeSessions({}),content:()=>({content:E.fixtures.content}),projection:E.fakes.createRecordingProjection()});
 const token=newApp.beginManagement(),m=state.current().party[0];newApp.manage(token,'pick',{kind:'pick-up',source:{id:m.id,position:{kind:'party',index:0}}});assert.equal(newApp.saveBlocked,true);h.G.PSFlow.app=()=>newApp;assert.equal(old._controller.valid(),false,'application identity is part of validity even when both generations are zero');old.terminate();assert.equal(newApp.saveBlocked,true);assert.equal(newApp.manage(token,'cancel',{kind:'cancel-held'}).status,'cancelled');
});
test('P51-10/UI: inherited MZ cancel button must respect held member and ask explicit cancellation',()=>{
 const h=host();h.G.PSManagement.openStorage();h.choose('organize');h.ready();const c=h.manager._scene._controller;c.push({kind:'panel',cursor:0,mode:'organize',box:0});h.ready();h.press('shift');h.ready();assert.equal(h.G.PSManagement.current().heldId,null);h.use();h.ready();assert.ok(h.G.PSManagement.current().heldId);h.manager._scene.popScene();assert.equal(h.G.PSManagement.current().view.kind,'menu');assert.equal(h.manager.popped,0);assert.equal(h.app.saveBlocked,true);h.choose('no');h.ready();assert.ok(h.G.PSManagement.current().heldId);h.manager._scene.popScene();h.choose('yes');assert.equal(h.app.saveBlocked,false);
});
test('P51-14/UI: actual window creation fails twice, then explicit rebuild-failed fallback commits once and preserves destination notice',()=>{
 const h=host({windowFailures:2}),gift={...E.state.clone(h.state.current().party[0]),id:'FAILED-UI'};assert.equal(h.app.receiveGift({kind:'normal',member:{existing:gift}}).status,'pending');h.G.PSManagement.openReceiving();assert.equal(h.app.pendingReceiving,null);assert.equal(h.app.saveBlocked,false);assert.equal(h.state.current().party.filter(m=>m.id==='FAILED-UI').length,1);assert.equal(h.app.receivingNotifications.length,1);assert.equal(h.manager.popped,1);h.manager._scene.terminate();assert.equal(h.app.receivingNotifications.length,1,'notice waits for healthy map presentation');
});
test('P51-18/UI: native nickname Enter repeats cannot choose the next full-party action until that physical key releases',()=>{
 const h=host(),g=E.state.clone(h.state.current());while(g.party.length<6){const m=E.state.clone(g.party[0]);m.id='HOLD'+g.party.length;g.party.push(m)}h.state.replace(g);h.app.receiveGift({kind:'normal',member:{existing:{...E.state.clone(g.party[0]),id:'NATIVE-HOLD'}}});h.G.PSManagement.openReceiving();h.choose('yes');const c=h.manager._scene._controller;c.input.value='Nickname';c.input.events.keydown({key:'Enter',code:'Enter',keyCode:13,preventDefault(){},stopPropagation(){}});h.ready();
 for(const fn of h.listeners.keydown)fn({code:'Enter',keyCode:13,repeat:true});h.input.trigger.add('ok');h.input.pressed.add('ok');h.tick();assert.equal(h.G.PSManagement.current().view.kind,'menu');assert.ok(h.app.pendingReceiving);assert.equal(h.app.saveBlocked,true);
 h.releaseNative('KeyZ');assert.equal(h.G.Input.isTriggered('ok'),false,'an alias release does not release the held native Enter');h.releaseNative('Enter');h.tick();h.use();assert.equal(h.G.PSManagement.current().view.kind,'party');
});
test('P51-18/UI: native completion barrier survives scene disposal and has a bounded plugin lifetime; blur only resets input',()=>{
 const h=host();h.app.receiveGift({kind:'normal',member:{existing:{...E.state.clone(h.state.current().party[0]),id:'NATIVE-MAP'}}});h.G.PSManagement.openReceiving();h.choose('yes');const c=h.manager._scene._controller;c.input.events.keydown({key:'Enter',code:'Enter',keyCode:13,preventDefault(){},stopPropagation(){}});h.manager._scene.terminate();assert.equal(h.listeners.keydown.size,1);assert.equal(h.listeners.keyup.size,1);h.input.trigger.add('ok');assert.equal(h.G.Input.isTriggered('ok'),false);const before=JSON.stringify(h.state.current());for(const fn of h.windowEvents.blur)fn();assert.equal(JSON.stringify(h.state.current()),before);assert.equal(h.G.Input.isTriggered('ok'),true);assert.equal(h.windowEvents.blur.size,1);
});

for(const key of ['ok','cancel','down'])test(`J01: gamepad ${key} held across entry releases without DOM keyup, then accepts the next press`,()=>{
 const h=host();h.input.pressed.add(key);h.G.PSManagement.openParty();
 const sample=(down,trigger=false)=>{h.input.pressed[down?'add':'delete'](key);if(trigger){h.input.trigger.add(key);h.input.repeat.add(key)}h.tick()};
 sample(true);sample(true,true);assert.equal(h.G.PSManagement.current().view.kind,'party');assert.equal(h.G.PSManagement.current().view.cursor,0);assert.equal(h.manager.popped,0);
 sample(false);h.press(key);if(key==='ok')assert.equal(h.G.PSManagement.current().view.kind,'menu');if(key==='cancel')assert.equal(h.manager.popped,1);if(key==='down')assert.equal(h.G.PSManagement.current().view.cursor,2);
});
test('J01: two physical aliases require both releases; blur clears both registries without editing the save',()=>{
 const h=host(),fire=(name,code,keyCode)=>{for(const f of h.listeners[name])f({code,keyCode})};fire('keydown','Enter',13);fire('keydown','KeyZ',90);h.input.pressed.add('ok');h.G.PSManagement.openParty();h.ready();fire('keyup','KeyZ',90);h.use();assert.equal(h.G.PSManagement.current().view.kind,'party');fire('keyup','Enter',13);h.use();assert.equal(h.G.PSManagement.current().view.kind,'menu');const before=JSON.stringify(h.state.current());for(const f of h.windowEvents.blur)f();assert.equal(JSON.stringify(h.state.current()),before);
});
for(const phase of ['begin','snapshot','draw'])for(const persistent of [false,true])test(`J02: ${phase} ${persistent?'persistent':'transient'} failure cannot leave empty-ready stack or management owner`,()=>{
 const h=host();let calls=0;
 if(phase==='draw'){const original=h.app.describeIndividual.bind(h.app);h.app.describeIndividual=(...a)=>{if(persistent||calls++===0)throw Error('injected draw');return original(...a)}}
 else{const name=phase==='begin'?'beginManagement':'managementSnapshot',original=h.app[name].bind(h.app);h.app[name]=(...a)=>{if(persistent||calls++===0)throw Error('injected '+phase);return original(...a)}}
 assert.doesNotThrow(()=>h.G.PSManagement.openParty());assert.doesNotThrow(()=>{h.tick();h.tick()});
 if(persistent){assert.equal(h.manager._scene._initialFailure,true);assert.notEqual(h.G.PSManagement.current()?.ready,true);h.back();assert.equal(h.manager.popped,1)}else{h.ready();assert.equal(h.G.PSManagement.current().view.kind,'party');h.back()}
 h.manager._scene.terminate();assert.equal(h.listeners.keydown.size,1);assert.equal(h.listeners.keyup.size,1);const token=h.app.beginManagement; // replace failing seam before proving a fresh owner
 if(phase==='begin')delete h.app.beginManagement;
 const t=h.app.beginManagement();assert.equal(h.app.endManagement(t).status,'unchanged');assert.equal(h.app.saveBlocked,false);
});
for(const entry of ['openParty','openStorage','openSummary'])test(`J02: unusable T1 state at ${entry} presents a contained exit, including app constructor failure`,()=>{
 const h=host();h.G.PSFlow.app=()=>{throw Error('the save state is not usable (capacity-exceeded)')};assert.doesNotThrow(()=>h.G.PSManagement[entry]('X'));assert.doesNotThrow(()=>{h.tick();h.tick();h.back();h.manager._scene.terminate()});assert.equal(h.manager.popped,1);assert.equal(h.listeners.keydown.size,1);
});
test('J05/J08: all nature colors use percent100, HP stays neutral; malformed read model never crashes five pages',()=>{
 const h=host();h.G.PSManagement.openSummary(h.state.current().party[0].id);h.ready();const c=h.manager._scene._controller,original=h.app.describeIndividual.bind(h.app);
 const natures=require('../../../js/engine/build/core.cjs').growth?.NATURES??E.growth.NATURES;assert.equal(Object.keys(natures).length,25);
 for(const [nature,modifiers]of Object.entries(natures)){h.app.describeIndividual=id=>({...original(id),modifiers});c.top().page=2;c.window.contents.drawn=[];c.draw();for(const [key,label]of Object.entries({hp:'HP',atk:'Attack',def:'Defense',spa:'Sp. Atk',spd:'Sp. Def',spe:'Speed'})){const row=c.window.contents.drawn.find(x=>x.text.startsWith(label+':'));assert.ok(row,nature+label);assert.equal(row.color,(modifiers[key]??100)>100?'#ffb0b0':(modifiers[key]??100)<100?'#aabfff':'#fff',nature+label)}}
 h.app.describeIndividual=id=>{const v=original(id);delete v.modifiers;return v};for(let page=0;page<5;page++){c.top().page=page;assert.doesNotThrow(()=>c.draw())}
});
test('J06: organizer ACTION toggles only, USE picks/swaps/places, SPECIAL selects header; menu retains search',()=>{
 const h=host(),g=E.state.clone(h.state.current());g.storage.boxes[0].slots[0]={...E.state.clone(g.party[0]),id:'BOX0'};g.storage.boxes[0].slots[1]={...E.state.clone(g.party[0]),id:'BOX1'};h.state.replace(g);h.G.PSManagement.openStorage();h.choose('organize');h.ready();const c=h.manager._scene._controller,before=JSON.stringify(h.state.current()),writes=h.state.replaced.length;
 h.press('shift');h.ready();assert.equal(c.storageQuick,true);assert.equal(h.G.PSManagement.current().heldId,null);assert.equal(JSON.stringify(h.state.current()),before);assert.equal(h.state.replaced.length,writes);h.use();h.ready();assert.equal(h.G.PSManagement.current().heldId,'BOX0');h.press('right');h.use();h.ready();assert.equal(h.G.PSManagement.current().heldId,'BOX1');h.press('right');h.use();h.ready();assert.equal(h.G.PSManagement.current().heldId,null);
 h.press('shift');h.ready();assert.equal(c.storageQuick,false);h.press('control');assert.equal(c.top().cursor,-1);h.use();h.choose('search');assert.ok(c.top().items.some(i=>i.key==='find'));
});
for(const mode of ['withdraw','deposit'])test(`J06: ${mode} ignores ACTION and keeps USE menu semantics`,()=>{
 const h=host(),g=E.state.clone(h.state.current());g.storage.boxes[0].slots[0]={...E.state.clone(g.party[0]),id:'BOX'};h.state.replace(g);h.G.PSManagement.openStorage();h.choose(mode);h.ready();const c=h.manager._scene._controller;h.press('shift');assert.equal(c.storageQuick,false);assert.equal(h.G.PSManagement.current().heldId,null);h.use();assert.equal(c.top().kind,'menu');
});
for(const last of [1,29])test(`J07: sparse summary returns stable box member at slot ${last}, without reordering`,()=>{
 const h=host(),g=E.state.clone(h.state.current());for(const [i,id]of [[0,'BOX0'],[last,'BOXLAST']])g.storage.boxes[0].slots[i]={...E.state.clone(g.party[0]),id};h.state.replace(g);h.G.PSManagement.openStorage();h.choose('organize');h.ready();h.use();h.choose('summary');h.ready();h.down();h.back();h.ready();assert.equal(h.G.PSManagement.current().view.cursor,last);assert.equal(h.state.current().storage.boxes[0].slots[last].id,'BOXLAST');
});
test('J07: summary return follows moved stable member and safely retains cursor when member disappeared',()=>{
 const h=host(),g=E.state.clone(h.state.current());g.storage.boxes[0].slots[0]={...E.state.clone(g.party[0]),id:'BOX'};h.state.replace(g);h.G.PSManagement.openStorage();h.choose('organize');h.ready();h.use();h.choose('summary');h.ready();let latest=E.state.clone(h.state.current());latest.storage.boxes[3].slots[29]=latest.storage.boxes[0].slots[0];latest.storage.boxes[0].slots[0]=null;h.state.replace(latest);h.back();h.ready();assert.deepEqual([h.G.PSManagement.current().view.box,h.G.PSManagement.current().view.cursor],[3,29]);h.use();h.choose('summary');h.ready();latest=E.state.clone(h.state.current());latest.storage.boxes[3].slots[29]=null;h.state.replace(latest);assert.doesNotThrow(()=>h.back());h.ready();assert.equal(h.G.PSManagement.current().view.cursor,29);
});
test('J09: direct last-able release refuses before any confirmation, but held release keeps its explicit exception',()=>{
 const h=host(),g=E.state.clone(h.state.current());g.party.forEach((m,i)=>m.hp=i?0:1);h.state.replace(g);h.G.PSManagement.openStorage();h.choose('organize');h.ready();const c=h.manager._scene._controller;c.push({kind:'panel',cursor:0,mode:'organize',box:0});h.ready();h.use();h.choose('release');assert.equal(c.top().kind,'panel');assert.match(c.error,/last able/);assert.equal(h.state.replaced.length,1);
 const latest=E.state.clone(h.state.current());latest.party[1].hp=1;h.state.replace(latest);c.refresh();h.press('shift');h.ready();h.use();h.ready();const newer=E.state.clone(h.state.current());newer.party[1].hp=0;h.state.replace(newer);h.press('shift');h.ready();h.use();h.choose('release');assert.ok(c.top().items.some(i=>i.key==='yes'),'held release still confirms');
});
for(const mode of ['organize','withdraw','deposit'])test(`J06: same-frame ACTION/USE and SPECIAL/USE priorities in ${mode}`,()=>{
 const h=host(),g=E.state.clone(h.state.current());g.storage.boxes[0].slots[0]={...E.state.clone(g.party[0]),id:'BOX'};h.state.replace(g);h.G.PSManagement.openStorage();h.choose(mode);h.ready();const c=h.manager._scene._controller;
 h.input.trigger.add('shift');h.input.trigger.add('ok');h.tick();if(mode==='organize'){assert.equal(c.top().kind,'box');assert.equal(c.storageQuick,true);assert.equal(h.G.PSManagement.current().heldId,null);h.ready();h.input.trigger.add('control');h.input.trigger.add('ok');h.tick();assert.equal(c.top().kind,'box');assert.equal(c.top().cursor,-1)}else assert.equal(c.top().kind,'menu','disabled ACTION does not swallow USE');
});
test('J07: ordinary party/panel summaries write final member cursor, held single-member summary preserves destination',()=>{
 for(const kind of ['party','panel','held']){const h=host();h.G.PSManagement.openParty();h.ready();const c=h.manager._scene._controller;if(kind==='panel')c.push({kind:'panel',cursor:0,mode:'organize',box:0});const parent=c.top();if(kind==='held'){c.summary([h.state.current().party[0].id],0,true);parent.cursor=2;}else c.summary(h.state.current().party.map(m=>m.id),0);h.ready();h.down();h.back();h.ready();assert.equal(c.top().cursor,kind==='held'?2:1);}
});

for(const failures of [1,2])test(`J02: window attachment fails ${failures} times, only an attached presentation becomes ready`,()=>{
 const h=host({attachFailures:failures});h.G.PSManagement.openParty();h.tick();h.tick();if(failures===1){h.ready();assert.equal(h.G.PSManagement.current().view.kind,'party');h.back()}else{assert.equal(h.manager._scene._initialFailure,true);assert.notEqual(h.G.PSManagement.current()?.ready,true);h.back()}h.manager._scene.terminate();assert.equal(h.manager.popped,1);const t=h.app.beginManagement();h.app.endManagement(t);
});
test('J06: leaving organizer resets quick mode before entering another storage mode',()=>{
 const h=host();h.G.PSManagement.openStorage();h.choose('organize');h.ready();h.press('shift');h.ready();assert.equal(h.manager._scene._controller.storageQuick,true);h.back();h.choose('no');h.choose('deposit');h.ready();assert.equal(h.manager._scene._controller.storageQuick,false);
});
