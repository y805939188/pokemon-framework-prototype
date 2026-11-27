'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {textHost,ROOT}=require('./text-host.cjs');
const end={code:0,indent:0,parameters:[]};
for(const mode of ['keyboard','free'])test(mode+' ordinary insertion, selection replacement, middle editing and bounded paste',()=>{
 const h=textHost(),s=h.show({mode,maxLength:'5',initialZh:'AB'}),f=s._field;assert.equal(h.doc.activeElement,f);
 h.insert('CDEFG');assert.equal(f.value,'ABCDE');f.setSelectionRange(1,3);h.insert('xyzz');assert.equal(f.value,'AxyDE');
 f.setSelectionRange(2,2);h.insert('!');assert.equal(f.value,'AxyDE');h.edit('AxDE',2);h.insert('你');assert.equal(f.value,'Ax你DE');
 const e=h.key('Enter');assert(e.prevented&&e.stopped);assert.equal(h.G.$gameVariables.value(1),'Ax你DE');assert.equal(h.doc.body.children.length,0);assert.deepEqual(h.sounds,['ok']);
});
for(const mode of ['keyboard','free'])test(mode+' overlong initial is retained and can confirm; insertion denied, deletion can reduce it',()=>{
 const h=textHost(),s=h.show({mode,initialZh:'ABCDEF',maxLength:'3'});assert.equal(s._field.value,'ABCDEF');h.insert('!');assert.equal(s._field.value,'ABCDEF');h.key('Enter');assert.equal(h.G.$gameVariables.value(1),'ABCDEF');
 h.transition();h.show({mode,initialZh:'ABCDEF',maxLength:'3'});h.edit('ABCDE');assert.equal(h.scene()._field.value,'ABCDE');h.key('Enter');assert.equal(h.G.$gameVariables.value(1),'ABCDE');
});
for(const [mode,min,initial,expected]of [['keyboard','0','Start',''],['free','0','Start','Start'],['free','0','','']])test(mode+' Escape result '+JSON.stringify([initial,expected]),()=>{
 const h=textHost();h.show({mode,minLength:min,initialZh:initial});h.edit('Edited');h.key('Escape');assert.equal(h.G.$gameVariables._data[1],expected);assert.equal(h.G.$gameVariables.value(1),expected||0);assert.deepEqual(h.sounds,['cancel']);h.transition();h.tick();assert(!h.map._interpreter.isRunning());
});
test('keyboard minimum gates Enter, disables Escape and cancel button, then allows valid input',()=>{
 const h=textHost({touchUI:true}),s=h.show({minLength:'2'});assert(!s._cancelButton);h.key('Enter');h.key('Escape');assert.equal(h.G.$gameVariables.value(1),0);assert(s.current());assert.equal(h.sounds.length,0);assert(s._status.textContent.includes('2'));h.insert('你好');h.key('Enter');assert.equal(h.G.$gameVariables.value(1),'你好');
});
test('empty Enter is valid at min zero; Z/X/Space remain text rather than scene confirmation/cancellation',()=>{
 const h=textHost();h.show();for(const c of ['z','x',' ']){const e=h.key(c);assert(e.stopped&&!e.prevented);h.insert(c);assert(h.scene().current());}h.key('Enter');assert.equal(h.G.$gameVariables.value(1),'zx ');h.transition();h.show();h.key('Enter');assert.equal(h.G.$gameVariables._data[1],'');assert.equal(h.G.$gameVariables.value(1),0);
});
test('ordinary composition does not confirm mid-composition; composition end applies the insert capacity',()=>{
 const h=textHost(),s=h.show({maxLength:'2'}),f=s._field;f.dispatch('compositionstart');h.edit('你好呀');h.key('Enter',{isComposing:true});s._okButton?.onClick();assert(s.current());f.dispatch('compositionend');assert.equal(f.value,'你好');h.key('Enter');assert.equal(h.G.$gameVariables.value(1),'你好');
});
test('variable initial uses a snapshot; free cancel writes original, not external or edited text',()=>{
 const h=textHost();h.G.$gameVariables.setValue(2,'Original');h.show({mode:'free',initialVariableId:'2',resultVariableId:'3'});h.G.$gameVariables.setValue(2,'External');h.edit('Edited');h.key('Escape');assert.equal(h.G.$gameVariables.value(3),'Original');assert.equal(h.G.$gameVariables.value(2),'External');
});
test('local interpreter waits through scene return, result is written once before following message and balloon',()=>{
 const h=textHost(),G=h.G;let after=0;G.Game_Interpreter.prototype.command999=function(){after++;assert.equal(G.$gameVariables.value(1),'Note');return true;};
 h.enter([h.command(),{code:999,indent:0,parameters:[]},h.command({mode:'free',initialVariableId:'1'}),end]);assert.equal(h.map._interpreter._waitMode,'psEventText');assert.equal(after,0);assert(!G.$gamePlayer.canMove());const pending=G.SceneManager._nextScene;pending.finish(false);assert.equal(G.$gameVariables.value(1),0);
 h.transition();h.insert('Note');const old=h.scene(),oldHandler=old._keydown;h.key('Enter');h.map.updateInterpreter();assert.equal(after,0);old.finish(true);oldHandler({key:'Escape'});assert.equal(G.$gameVariables.value(1),'Note');h.transition();h.tick();assert.equal(after,1);h.transition();assert.equal(h.scene()._field.value,'Note');h.key('Escape');h.transition();h.tick();assert(!h.map._interpreter.isRunning());assert(G.$gamePlayer.canMove());assert.equal(G.SceneManager._stack.length,0);assert.equal(h.doc.listeners.keydown.length,1);assert.deepEqual(h.writes,[]);
});
for(const touchUI of [false,true])for(const [width,height]of [[512,384],[640,480],[816,624]])test('native buttons and DOM panel '+width+'x'+height+' touch='+touchUI,()=>{
 const h=textHost({width,height,touchUI}),s=h.show({initialZh:'Touch'});assert.equal(s._panel.style.left,'10%');assert.equal(s._panel.style.width,'80%');
 if(touchUI){for(const b of [s._okButton,s._cancelButton])assert(b.x>=0&&b.y>=0&&b.x+b.width<=width&&b.y+b.height<=height);s._okButton.onClick();}else {assert(!s._okButton&&!s._cancelButton);h.key('Enter');}
 assert.equal(h.G.$gameVariables.value(1),'Touch');
});
test('native touch OK/cancel callbacks do not act before start, after close, or on a later request',()=>{
 const h=textHost({touchUI:true});h.enter([h.command({initialZh:'First'}),end]);const s=h.G.SceneManager._nextScene;h.G.SceneManager._scene=s;h.G.SceneManager._nextScene=null;s.create();const oldOK=s._okButton._clickHandler,oldCancel=s._cancelButton._clickHandler;oldOK();assert.equal(h.G.$gameVariables.value(1),0);s.start();h.edit('Edited');oldCancel();assert.equal(h.G.$gameVariables._data[1],'');assert.equal(h.G.$gameVariables.value(1),0);h.transition();h.show({mode:'free',initialZh:'Second'});oldOK();oldCancel();assert(h.scene().current());h.edit('Changed');h.scene()._cancelButton.onClick();assert.equal(h.G.$gameVariables.value(1),'Second');
});
test('busy message and active editor defer only this command, ordinary commands on another interpreter still run',()=>{
 const h=textHost();h.show();const other=new h.G.Game_Interpreter();let count=0;other.command999=()=>{count++;return true;};other.setup([{code:999,indent:0,parameters:[]},h.command(),end],15);other.update();assert.equal(count,1);assert.equal(other._index,1);h.key('Enter');h.transition();h.G.$gameMessage.add('Busy');other.update();assert.equal(other._index,1);h.G.$gameMessage.clear();other.update();assert.equal(other._index,2);h.transition();h.key('Escape');h.transition();other.update();assert(!other.isRunning());
});
for(const [field,value]of [['mode','unsupported'],['maxLength','0'],['maxLength','-1'],['maxLength','33'],['minLength','13'],['minLength','-1'],['minLength','NaN'],['resultVariableId','0'],['resultVariableId','21'],['initialVariableId','21']])test('invalid author parameter before scene/write '+field+'='+value,()=>{
 const h=textHost();assert.throws(()=>h.enter([h.command({[field]:value}),end]),/ShowTextInput/);assert(!h.G.SceneManager._nextScene);assert.equal(h.doc.body.children.length,0);assert.equal(h.G.$gameVariables.value(1),0);
});
test('free min must be zero, no hidden keyboard naming policy',()=>{const h=textHost();assert.throws(()=>h.show({mode:'free',minLength:'1'}),/ShowTextInput/);});
for(const lang of ['zh','en'])for(const cancel of [false,true])test(lang+' shipped event14 text→two editors→message→balloon→map return cancel='+cancel,()=>{
 const h=textHost({lang,touchUI:true}),map=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Map005.json'),'utf8')),e=map.events[14],state=JSON.stringify(h.state);assert.deepEqual([e.x,e.y,e.pages[0].trigger],[16,10,0]);h.enter(e.pages[0].list);let entries=0,last=null;
 for(let n=0;n<2500&&h.map._interpreter.isRunning();n++){
  h.transition();const s=h.scene();if(s._field&&s!==last){last=s;entries++;assert(s._panel.children[0].textContent.includes(lang==='zh'?'留言':'note'));if(entries===1){h.edit(lang==='zh'?'地图留言':'Map note');h.key('Enter');}else {h.edit('Edit');s[cancel?'_cancelButton':'_okButton'].onClick();}}
  else if(h.win.pause)h.tick(25,'ok');else h.tick();if(h.balloon)h.releaseBalloon();
 }
 assert.equal(entries,2);assert(!h.map._interpreter.isRunning());assert.equal(h.G.$gameVariables.value(12),cancel?(lang==='zh'?'地图留言':'Map note'):'Edit');assert(h.text().includes(lang==='zh'?'事件继续':'Event continued'));assert.equal(JSON.stringify(h.state),state);assert.deepEqual(h.writes,[]);assert.equal(h.doc.body.children.length,0);assert(h.G.$gamePlayer.canMove());
});
test('native Scene_Name still owns its original actor naming function; event text does not invoke it or persistence',()=>{
 const h=textHost(),native=h.G.Scene_Name.prototype.onInputOk;assert.equal(native,h.nativeName);h.show();h.insert('Local');h.key('Enter');assert.equal(native,h.G.Scene_Name.prototype.onInputOk);assert.deepEqual(h.writes,[]);
});
function loadNative(G,file,names){const source=fs.readFileSync(path.join(ROOT,file),'utf8');for(const name of names){const a=source.indexOf(name+' = function'),b=source.indexOf('\n};',a);assert(a>=0&&b>a,name);vm.runInContext(source.slice(a,b+3),G);}}
test('DOM editing keys keep browser defaults; held Enter cannot spill to native Input until keyup',()=>{
 const h=textHost(),G=h.G,core=fs.readFileSync(path.join(ROOT,'js/reactor_core.js'),'utf8');
 // The production host-input adapter already wrapped queries; use native methods behind that adapter.
 loadNative(G,'js/reactor_core.js',['Input.clear','Input.update','Input.isRepeated','Input.isPressed','Input._isEscapeCompatible','Input._onKeyDown','Input._onKeyUp','Input._shouldPreventDefault','Input.virtualClick']);
 vm.runInContext(core.slice(core.indexOf('Input.keyMapper = {'),core.indexOf('Input.gamepadMapper = {')),G);G.Input._pollGamepads=()=>{};G.Input._updateDirection=()=>{};G.Input.keyRepeatWait=24;G.Input.keyRepeatInterval=6;
 G.document.addEventListener('keydown',e=>G.Input._onKeyDown(e));G.document.addEventListener('keyup',e=>G.Input._onKeyUp(e));G.Input.clear();
 const mapper=JSON.stringify(G.Input.keyMapper);h.show();for(const key of ['ArrowLeft','ArrowRight','Backspace','z','x',' ']){const event=h.key(key);assert(event.stopped&&!event.prevented);assert(h.scene().current());}
 h.insert('ZX');h.key('Enter',{hold:true});assert.equal(G.$gameVariables.value(1),'ZX');G.Input.virtualClick('ok');G.Input.update();h.keys.add('ok');assert(!G.Input.isTriggered('ok'));h.doc.dispatch('keyup',{key:'Enter',code:'Enter',keyCode:13});assert(G.Input.isTriggered('ok'));h.keys.clear();assert.equal(JSON.stringify(G.Input.keyMapper),mapper);
});
test('Map005 real tile passage and event collision → action-key event14 → result → message → balloon → movement',()=>{
 const h=textHost(),G=h.G,system=JSON.parse(fs.readFileSync(path.join(ROOT,'data/System.json'),'utf8')),map=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Map005.json'),'utf8')),tiles=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Tilesets.json'),'utf8'));
 assert.equal(system.startMapId,5);G.$dataMap=map;const m=G.$gameMap;
 loadNative(G,'js/reactor_objects.js',['Game_Map.prototype.checkPassage','Game_Map.prototype.tileId','Game_Map.prototype.layeredTiles','Game_Map.prototype.allTiles','Game_Map.prototype.isPassable','Game_Map.prototype.isAnyEventStarting','Game_Player.prototype.triggerButtonAction','Game_Player.prototype.startMapEvent','Game_Player.prototype.checkEventTriggerHere','Game_Player.prototype.checkEventTriggerThere']);
 m.tilesetFlags=()=>tiles[map.tilesetId].flags;m.tileEventsXy=()=>[];m.isCounter=()=>false;m.roundXWithDirection=(x,d)=>x+(d===6?1:d===4?-1:0);m.roundYWithDirection=(y,d)=>y+(d===2?1:d===8?-1:0);
 const events=map.events.filter(Boolean).map(e=>{assert.equal(e.pages.length,1);const p=e.pages[0];assert(!Object.entries(p.conditions).some(([k,v])=>k.endsWith('Valid')&&v));return Object.assign(Object.create(G.Game_Event.prototype),{x:e.x,y:e.y,_trigger:p.trigger,list:()=>p.list,eventId:()=>e.id,lock(){},isNormalPriority:()=>p.priorityType===1,_page:p});});m.events=()=>events;m.eventsXy=(x,y)=>events.filter(e=>e.x===x&&e.y===y);
 const start=[system.startX,system.startY],target=map.events[14],queue=[start],parent=new Map([[start.join(','),null]]);let goal;
 for(let i=0;i<queue.length;i++){const [x,y]=queue[i];if(Math.abs(x-target.x)+Math.abs(y-target.y)===1){goal=[x,y];break;}
  for(const d of [2,4,6,8]){const nx=m.roundXWithDirection(x,d),ny=m.roundYWithDirection(y,d),key=nx+','+ny;if(nx<0||ny<0||nx>=map.width||ny>=map.height||parent.has(key))continue;if(events.some(e=>e.x===nx&&e.y===ny&&e.isNormalPriority()&&!e._page.through))continue;if(!m.isPassable(x,y,d)||!m.isPassable(nx,ny,10-d))continue;parent.set(key,[x,y]);queue.push([nx,ny]);}}
 assert(goal,'normal-priority non-through events and native tiles permit an adjacent approach');
 const route=[];for(let p=goal;p;p=parent.get(p.join(',')))route.unshift(p);console.log('WP17-D Map005 approach '+JSON.stringify({start,route,approach:goal,event:[target.x,target.y]}));
 Object.assign(G.$gamePlayer,{x:goal[0],y:goal[1],getOnOffVehicle:()=>false,canStartLocalEvents:()=>true,direction:()=>target.x>goal[0]?6:target.x<goal[0]?4:target.y>goal[1]?2:8});h.keys.add('ok');assert(G.$gamePlayer.triggerButtonAction());h.keys.clear();assert(m._interpreter.isRunning());m.updateInterpreter();assert.equal(m._interpreter._eventId,14);let inputs=0,last=null;
 for(let n=0;n<2500&&m._interpreter.isRunning();n++){h.transition();const scene=h.scene();if(scene._field&&scene!==last){last=scene;inputs++;if(inputs===1){h.edit('Typed');h.key('Enter');}else h.key('Escape');}else if(h.win.pause)h.tick(25,'ok');else h.tick(25);if(h.balloon)h.releaseBalloon();}
 assert.equal(inputs,2);assert.equal(G.$gameVariables.value(12),'Typed');assert(!m._interpreter.isRunning());assert(!G.$gameMessage.isBusy());assert(G.$gamePlayer.canMove());assert.deepEqual(h.writes,[]);
});
