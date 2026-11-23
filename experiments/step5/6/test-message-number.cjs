'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {numberHost,setting:s,ROOT}=require('./number-host.cjs');
const end={code:0,indent:0,parameters:[]};
function ready(h){h.until(()=>h.number.isOpenAndActive());}
for(const [settings,initial,expected,text] of [
 [[s('range',3,3)],99,3,'3'],[[s('range',8,2)],1,8,'8'],[[s('range',-9,-3)],-6,0,'0'],
 [[s('range',-9,-3),s('negative',1)],-6,-6,'-6'],[[s('digits',2)],-12,0,'00'],
 [[s('digits',2),s('negative',1)],-12,-12,'-12'],[[s('digits',2)],-123,0,'00'],
 [[s('digits',2),s('negative',1)],-123,-99,'-99'],[[s('digits',2)],'not numeric',0,'00'],
 [[s('digits',2),s('negative',1)],'not numeric',0,'+00'],[[s('digits',1),s('range',12,123)],999,123,'123'],
 [[s('range',-25,25),s('digits',1),s('negative',1)],-12,-9,'-9']
])test('parameter range/digits/sign and initial '+JSON.stringify([settings,initial]),()=>{
 const h=numberHost();h.show(settings,initial);assert.equal(h.display(),text);assert.equal(h.number.maxItems(),text.length);h.tick(0,'ok');assert.equal(h.result(),expected);assert(!h.G.$gameMessage.isBusy());assert.deepEqual(h.sounds,['ok']);
});
for(const [settings,expected] of [
 [[s('range',3,3),s('initial',99)],3],[[s('range',3,3),s('cancel',-71),s('initial',99)],-71],
 [[s('range',3,3),s('cancel',-71),s('default',99)],3],[[s('range',3,3),s('default',99),s('cancel',-71)],-71],
 [[s('range',3,3),s('cancel',3)],3],[[s('range',-9,-3),s('cancel',-6)],-6],
 [[s('digits',1),s('cancel',99),s('initialVariable',2)],99]
])test('BACK raw value and ordered default/initial setters '+JSON.stringify(settings),()=>{
 const h=numberHost();h.G.$gameVariables.setValue(2,7);h.show(settings,2);h.tick(0,'up');h.tick(0,'cancel');assert.equal(h.result(),expected);assert.deepEqual(h.sounds,['cursor','cancel']);assert(!h.G.$gameMessage.isBusy());
});
test('digit cursor wraps on left/right repeats; each digit cycles 0..9 independently, sign toggles, negative zero edits',()=>{
 const h=numberHost();h.show([s('digits',2),s('negative',1)],0);h.tick(0,'up');assert.equal(h.display(),'-00');h.tick(0,'right');h.tick(0,'down');assert.equal(h.display(),'-90');h.tick(0,'up');assert.equal(h.display(),'-00');h.tick(0,'left');h.tick(0,'left');assert.equal(h.number.index(),2);h.tick(0,'down');assert.equal(h.display(),'-09');h.tick(0,'up');assert.equal(h.display(),'-00');h.tick(0,'up');assert.equal(h.display(),'-01');h.tick(0,'ok');assert.equal(h.result(),-1);
 const c=numberHost();c.show([s('digits',2)],1);c.G.Input.isTriggered=k=>c.keys.has(k);c.G.Input.isRepeated=k=>c.keys.has(k)||c.keys.has('repeat:'+k);c.tick(0,'repeat:left');assert.equal(c.number.index(),1);c.tick(0,'repeat:right');assert.equal(c.number.index(),0);c.tick(0,'cancel');assert.equal(c.result(),1);
});
test('UP/DOWN and cursor edits occur before USE, USE outranks BACK; result writes before event continues',()=>{
 for(const input of [['ok','cancel'],['up','ok','cancel'],['down','ok'],['right','up','ok']]){
  const h=numberHost();let after=0;h.G.Game_Interpreter.prototype.command999=function(){assert(!h.G.$gameMessage.isBusy());assert(!h.number.active);after++;return true;};
  h.G.$gameVariables.setValue(1,1);h.enter([h.command([s('digits',1),s('cancel',-1)]),{code:999,indent:0,parameters:[]},end]);assert.equal(h.map._interpreter._waitMode,'message');assert.equal(after,0);assert(!h.G.$gamePlayer.canMove());h.tick(0);h.tick(0,...input);assert.equal(h.result(),input.includes('up')?2:input.includes('down')?0:1);assert.equal(after,1);assert(h.G.$gamePlayer.canMove());assert(h.calls.input>=1&&h.calls.touch>=1);assert.deepEqual(h.writes,[]);
 }
});
test('out-of-range USE buzzes, consumes same-round BACK, waits without writing, later valid edit confirms',()=>{
 const h=numberHost();h.show([s('range',3,3),s('cancel',-1)],3);const refresh=h.refreshCount();h.tick(0,'up','ok','cancel');assert.equal(h.number._number,4);assert.equal(h.result(),3);assert(h.G.$gameMessage.isBusy());assert(h.number.active);assert.equal(h.refreshCount(),refresh);assert.deepEqual(h.sounds,['cursor','buzzer']);h.tick(0,'down','ok');assert.equal(h.result(),3);assert(!h.G.$gameMessage.isBusy());assert.deepEqual(h.sounds,['cursor','buzzer','cursor','ok']);
 h.show([s('range',3,3),s('cancel',-1)],3);h.tick(0,'up','ok','cancel');h.tick(0,'cancel');assert.equal(h.result(),-1);
});
test('initialVariable reads current MZ value; default/initial nonnumeric become zero before range clamp',()=>{
 for(const op of ['default','initial']){const h=numberHost();h.show([s('digits',2),s(op,'text')],25);assert.equal(h.display(),'00');h.tick(0,'cancel');assert.equal(h.result(),0);}
 const h=numberHost();h.G.$gameVariables.setValue(2,-12);h.show([s('digits',2),s('negative',1),s('initialVariable',2)],3);assert.equal(h.display(),'-12');h.tick(0,'ok');assert.equal(h.result(),-12);
});
test('busy number command stays at original index; another interpreter ordinary command runs; requests do not overwrite',()=>{
 const h=numberHost();h.show([s('digits',1)],1);const other=new h.G.Game_Interpreter();let calls=0;other.command999=()=>{calls++;return true;};other.setup([{code:999,indent:0,parameters:[]},h.command([s('digits',2),s('default',12)]),end],14);other.update();assert.equal(calls,1);assert.equal(other._index,1);assert.equal(h.display(),'1');h.tick(0,'cancel');other.update();h.tick(0);assert.equal(h.display(),'12');h.tick(0,'ok');other.update();assert(!other.isRunning());
});
test('native command103, merged101+103 retain unsigned/no-cancel, native same-round edit order; no leaked WP17 ownership',()=>{
 const h=numberHost();h.show([s('digits',1),s('cancel',-99)],1);h.tick(0,'cancel');h.G.$gameVariables.setValue(1,1);
 h.enter([{code:103,indent:0,parameters:[1,1]},end]);h.tick(0);assert.equal(h.number.isCancelEnabled(),false);h.tick(0,'cancel');assert(h.G.$gameMessage.isBusy());h.tick(0,'up','ok');assert.equal(h.result(),1);assert(!h.G.$gameMessage.isBusy());
 h.enter([{code:101,indent:0,parameters:['',0,0,2,'']},{code:401,indent:0,parameters:['Native text']},{code:103,indent:0,parameters:[1,2]},end]);ready(h);assert(h.text().includes('Native text'));h.tick(0,'ok');assert.equal(h.result(),1);assert(!h.map._interpreter.isRunning());
});
for(const [field,value] of [['resultVariableId','0'],['settings','{}'],['settings','[null]'],['settings',JSON.stringify([s('digits',0)])],['settings',JSON.stringify([s('digits',16)])],['settings',JSON.stringify([s('range',0,10**15)])],['settings',JSON.stringify([s('cancel',1.5)])],['settings',JSON.stringify([s('negative',2)])],['settings',JSON.stringify([s('unknown',1)])]])test('invalid author parameter fails before ownership/write: '+field+' '+value,()=>{
 const h=numberHost(),c=h.command();c.parameters[3][field]=value;assert.throws(()=>h.enter([c,end]),/ShowNumber/);assert(!h.G.$gameMessage.isBusy());assert.equal(h.refreshCount(),0);
});
for(const touchUI of [false,true])for(const [width,height] of [[512,384],[640,480],[816,624]])test('adaptive 15-digit signed window '+width+'×'+height+' touch='+touchUI,()=>{
 const h=numberHost({width,height,touchUI});h.show([s('digits',15),s('negative',1),s('default',-123)]);const w=h.number;assert.equal(w.maxItems(),16);assert(w.x>=0&&w.y>=0&&w.x+w.width<=width&&w.y+w.height<=height);assert.equal(h.display(),'-000000000000123');
 for(let i=0;i<w.maxItems();i++){const r=w.itemLineRect(i);assert(r.x>=0&&r.x+r.width<=w.innerWidth);}
 if(touchUI){assert.equal(w._buttons.length,4);for(const b of w._buttons)assert(b.x>=0&&b.x+b.width<=w.innerWidth&&b.y+b.height<=w.innerHeight);w._buttons[3].onClick();}else h.tick(0,'cancel');assert(!h.G.$gameMessage.isBusy());assert.equal(h.result(),-123);
});
test('touch digit selection and native Sprite_Button handlers edit/confirm/cancel; stale callbacks and native reuse',()=>{
 const h=numberHost({touchUI:true,animate:true});h.show([s('digits',2),s('negative',1),s('cancel',-99)],12);const w=h.number;assert(!w.isOpen());const openingCallback=w._buttons[2]._clickHandler;openingCallback();assert(h.G.$gameMessage.isBusy());ready(h);
 h.G.TouchInput.isTriggered=()=>true;w.hitIndex=()=>2;h.tick(0);assert.equal(w.index(),2);h.G.TouchInput.isTriggered=()=>false;w._buttons[1].onClick();assert.equal(h.display(),'+13');const old=w._buttons.map(b=>b._clickHandler),cancelButton=w._buttons[3];w._buttons[2].onClick();assert.equal(h.result(),13);assert(!h.G.$gameMessage.isBusy());assert.equal(w._buttons.length,3);assert.equal(cancelButton.visible,false);const count=h.refreshCount();for(const call of old)call();assert.equal(h.refreshCount(),count);
 h.until(()=>w.isClosed());h.show([s('digits',1),s('cancel',-71)],3);ready(h);for(const call of old)call();assert(h.G.$gameMessage.isBusy());w._buttons[3].onClick();assert.equal(h.result(),-71);h.until(()=>w.isClosed());
 h.G.$gameVariables.setValue(1,5);h.enter([{code:103,indent:0,parameters:[1,1]},end]);ready(h);assert.equal(w._buttons.length,3);assert.equal(w.isCancelEnabled(),false);w._buttons[0].onClick();assert.equal(w._number,4);w._buttons[2].onClick();assert.equal(h.result(),4);
});
for(const lang of ['zh','en'])for(const exit of ['ok','cancel','invalid-then-ok'])test(lang+' shipped Map005 event13 follows real branch/message/balloon/event exit '+exit,()=>{
 const h=numberHost({lang,animate:true}),map=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Map005.json'),'utf8')),e=map.events[13],state=JSON.stringify(h.state);assert.equal(e.x,14);assert.equal(e.y,10);assert.equal(e.pages[0].trigger,0);h.enter(e.pages[0].list);let entries=0;
 for(let n=0;n<2500&&h.map._interpreter.isRunning();n++){
  if(h.number.isOpenAndActive()){
   entries++;if(exit==='cancel')h.tick(25,'cancel');else if(exit==='invalid-then-ok'&&entries===1){h.number.select(1);h.tick(25,'up');}else if(exit==='invalid-then-ok'&&entries===2)h.tick(25,'up','ok');else if(exit==='invalid-then-ok'&&entries===3)h.tick(25,'down','ok');else h.tick(25,'ok');
  }else if(h.win.pause)h.tick(25,'ok');else h.tick(25);if(h.balloon)h.releaseBalloon();
 }
 if(exit==='invalid-then-ok'){assert.equal(entries,3);assert(h.sounds.includes('buzzer'));}
 assert(!h.map._interpreter.isRunning());assert(!h.G.$gameMessage.isBusy());assert(h.G.$gamePlayer.canMove());assert.equal(h.G.$gameVariables.value(11),exit==='cancel'?-99:exit==='invalid-then-ok'?22:12);assert(h.text().includes(lang==='zh'?(exit==='cancel'?'取消结果：-99':'确认结果：'+(exit==='ok'?12:22)):(exit==='cancel'?'BACK result: -99':'OK result: '+(exit==='ok'?12:22))));assert.equal(JSON.stringify(h.state),state);assert.deepEqual(h.writes,[]);
});
function loadNative(G,file,names){const source=fs.readFileSync(path.join(ROOT,file),'utf8');for(const name of names){const a=source.indexOf(name+' = function'),b=source.indexOf('\n};',a);assert(a>=0&&b>a,name);vm.runInContext(source.slice(a,b+3),G);}}
test('normal keyboard keyMapper → native keydown/update/repeat/keyup → digit editor; confirmation does not spill into next message',()=>{
 const h=numberHost({animate:true}),G=h.G,core=fs.readFileSync(path.join(ROOT,'js/reactor_core.js'),'utf8');
 loadNative(G,'js/reactor_core.js',['Input.clear','Input.update','Input.isTriggered','Input.isRepeated','Input.isPressed','Input._isEscapeCompatible','Input._onKeyDown','Input._onKeyUp','Input._shouldPreventDefault','Input.virtualClick']);
 vm.runInContext(core.slice(core.indexOf('Input.keyMapper = {'),core.indexOf('Input.gamepadMapper = {')),G);G.Input._pollGamepads=()=>{};G.Input._updateDirection=()=>{};G.Input.keyRepeatWait=24;G.Input.keyRepeatInterval=6;G.Input.clear();
 G.$gameVariables.setValue(1,1);h.enter([h.command([s('digits',1)]),{code:357,indent:0,parameters:['PS_Management','ShowMessage','Message',{textZh:'After number',textEn:'After number',position:'2'}]},end]);ready(h);
 const down=keyCode=>G.Input._onKeyDown({keyCode,preventDefault(){}}),up=keyCode=>G.Input._onKeyUp({keyCode});
 down(38);G.Input.update();h.tick(0);assert.equal(h.number._number,2);for(let i=0;i<24;i++){G.Input.update();h.tick(0);}assert.equal(h.number._number,3);up(38);G.Input.update();h.tick(0);
 down(13);G.Input.update();h.tick(0);assert.equal(h.result(),3);for(let i=0;i<100;i++){G.Input.update();h.tick(25);}assert(h.win.pause);assert(h.map._interpreter.isRunning());up(13);G.Input.update();h.tick(0);down(90);G.Input.update();h.tick(0);up(90);G.Input.update();h.tick(0);assert(!h.map._interpreter.isRunning());
 h.until(()=>h.win.isClosed());h.show([s('digits',1),s('cancel',-71)],1);ready(h);down(27);G.Input.update();h.tick(0);up(27);G.Input.update();assert.equal(h.result(),-71);assert(!G.$gameMessage.isBusy());
});
test('native virtual click remains available on ordinary numeric buttons after WP17 touch ownership clears',()=>{
 const h=numberHost({touchUI:true}),G=h.G;h.show([s('digits',1),s('cancel',-71)],1);h.number._buttons[3].onClick();assert.equal(h.result(),-71);h.G.$gameVariables.setValue(1,5);h.enter([{code:103,indent:0,parameters:[1,1]},end]);h.tick(0);
 loadNative(G,'js/reactor_core.js',['Input.clear','Input.update','Input.isTriggered','Input.isRepeated','Input._isEscapeCompatible','Input.virtualClick']);G.Input._pollGamepads=()=>{};G.Input._updateDirection=()=>{};G.Input.clear();
 // Restored native button callbacks edit/confirm directly, just as before the owned request.
 h.number._buttons[1].onClick();assert.equal(h.number._number,6);h.number._buttons[2].onClick();assert.equal(h.result(),6);assert(!G.$gameMessage.isBusy());assert(!G.Input.isTriggered('ok'));
 G.Input.virtualClick('ok');G.Input.update();assert(G.Input.isTriggered('ok'));G.Input.update();assert(!G.Input.isTriggered('ok'));
});
test('Map005 real tile passage and event collision → action-key event13 → result → message → balloon → movement',()=>{
 const h=numberHost(),G=h.G,system=JSON.parse(fs.readFileSync(path.join(ROOT,'data/System.json'),'utf8')),map=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Map005.json'),'utf8')),tiles=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Tilesets.json'),'utf8'));
 assert.equal(system.startMapId,5);G.$dataMap=map;const m=G.$gameMap;
 loadNative(G,'js/reactor_objects.js',['Game_Map.prototype.checkPassage','Game_Map.prototype.tileId','Game_Map.prototype.layeredTiles','Game_Map.prototype.allTiles','Game_Map.prototype.isPassable','Game_Map.prototype.isAnyEventStarting','Game_Player.prototype.triggerButtonAction','Game_Player.prototype.startMapEvent','Game_Player.prototype.checkEventTriggerHere','Game_Player.prototype.checkEventTriggerThere']);
 m.tilesetFlags=()=>tiles[map.tilesetId].flags;m.tileEventsXy=()=>[];m.isCounter=()=>false;m.roundXWithDirection=(x,d)=>x+(d===6?1:d===4?-1:0);m.roundYWithDirection=(y,d)=>y+(d===2?1:d===8?-1:0);
 const events=map.events.filter(Boolean).map(e=>{assert.equal(e.pages.length,1);const p=e.pages[0];assert(!Object.entries(p.conditions).some(([k,v])=>k.endsWith('Valid')&&v));return Object.assign(Object.create(G.Game_Event.prototype),{x:e.x,y:e.y,_trigger:p.trigger,list:()=>p.list,eventId:()=>e.id,lock(){},isNormalPriority:()=>p.priorityType===1,_page:p});});m.events=()=>events;m.eventsXy=(x,y)=>events.filter(e=>e.x===x&&e.y===y);
 const start=[system.startX,system.startY],target=map.events[13],queue=[start],parent=new Map([[start.join(','),null]]);let goal;
 for(let i=0;i<queue.length;i++){const [x,y]=queue[i];if(Math.abs(x-target.x)+Math.abs(y-target.y)===1){goal=[x,y];break;}
  for(const d of [2,4,6,8]){const nx=m.roundXWithDirection(x,d),ny=m.roundYWithDirection(y,d),key=nx+','+ny;if(nx<0||ny<0||nx>=map.width||ny>=map.height||parent.has(key))continue;if(events.some(e=>e.x===nx&&e.y===ny&&e.isNormalPriority()&&!e._page.through))continue;if(!m.isPassable(x,y,d)||!m.isPassable(nx,ny,10-d))continue;parent.set(key,[x,y]);queue.push([nx,ny]);}}
 assert(goal,'normal-priority non-through events and native tiles permit an adjacent approach');
 const route=[];for(let p=goal;p;p=parent.get(p.join(',')))route.unshift(p);console.log('WP17-C Map005 approach '+JSON.stringify({start,route,approach:goal,event:[target.x,target.y]}));
 Object.assign(G.$gamePlayer,{x:goal[0],y:goal[1],getOnOffVehicle:()=>false,canStartLocalEvents:()=>true,direction:()=>target.x>goal[0]?6:target.x<goal[0]?4:target.y>goal[1]?2:8});h.keys.add('ok');assert(G.$gamePlayer.triggerButtonAction());h.keys.clear();assert(m._interpreter.isRunning());m.updateInterpreter();assert.equal(m._interpreter._eventId,13);let inputs=0;
 for(let n=0;n<2500&&m._interpreter.isRunning();n++){if(h.number.isOpenAndActive()){inputs++;h.tick(25,'cancel');}else if(h.win.pause)h.tick(25,'ok');else h.tick(25);if(h.balloon)h.releaseBalloon();}
 assert.equal(inputs,1);assert.equal(G.$gameVariables.value(11),-99);assert(!m._interpreter.isRunning());assert(!G.$gameMessage.isBusy());assert(G.$gamePlayer.canMove());assert.deepEqual(h.writes,[]);
});
