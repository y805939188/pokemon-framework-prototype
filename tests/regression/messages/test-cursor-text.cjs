'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {cursorHost,ROOT}=require('./cursor-host.cjs');
const end={code:0,indent:0,parameters:[]};
// Independent literal expectations from sanitized WP17 §6.2.1; middot is notation for an input space.
const rows=[
 ['ABCDEFGHIJ·,.',"KLMNOPQRST·'-",'UVWXYZ·····♂♀','·············','0123456789···'],
 ['abcdefghij·,.',"klmnopqrst·'-",'uvwxyz·····♂♀','·············','0123456789···'],
 ['ÀÁÂÄÃàáâäã·Ææ','ÈÉÊË·èéêë··Çç','ÌÍÎÏ·ìíîï··Œœ','ÒÓÔÖÕòóôöõ·Ññ','ÙÚÛÜ·ùúûü··Ýý'],
 [',.:;…•!?¡¿·♂♀','“”‘’﴾﴿*~_^·ΡΚ','@#&%+-×÷/=·ΠΜ','◎○□△♠♥♦♣★✨··$','♈♌♒♐♩♪♫☽☾····'],
].map(group=>group.map(row=>row.replaceAll('·',' ')));
const open=(h,args={})=>h.show({mode:'cursor',...args});
const result=h=>h.G.$gameVariables._data[1];
function complete(h){h.frame('shift');h.frame('ok');}
function loadNative(G,file,names){const source=fs.readFileSync(path.join(ROOT,file),'utf8');for(const name of names){const a=source.indexOf(name+' = function'),b=source.indexOf('\n};',a);assert(a>=0&&b>a,name);vm.runInContext(source.slice(a,b+3),G);}}

function syntheticPad(){return{index:0,connected:true,buttons:Array.from({length:16},()=>({pressed:false})),axes:[0,0]};}
function nativeMapAction(h){
 const G=h.G,m=h.map,event=m.events()[0];
 loadNative(G,'js/reactor_objects.js',['Game_Map.prototype.isAnyEventStarting','Game_Player.prototype.triggerButtonAction','Game_Player.prototype.startMapEvent','Game_Player.prototype.checkEventTriggerHere','Game_Player.prototype.checkEventTriggerThere']);
 Object.assign(event,{x:0,y:0,isNormalPriority:()=>true});m.eventsXy=(x,y)=>x===0&&y===0?[event]:[];m.isCounter=()=>false;
 m.roundXWithDirection=(x,d)=>x+(d===6?1:d===4?-1:0);m.roundYWithDirection=(y,d)=>y+(d===2?1:d===8?-1:0);
 Object.assign(G.$gamePlayer,{x:0,y:1,getOnOffVehicle:()=>false,canStartLocalEvents:()=>true,direction:()=>8});
 return()=>G.$gamePlayer.triggerButtonAction();
}
test('gamepad handoff control: unconsumed native poll really rediscovers held button0 after clear',()=>{
 const pad=syntheticPad(),h=cursorHost({nativeInput:true,gamepads:()=>[pad]}),input=h.G.Input;
 h.map.events=()=>[];assert.equal(input.gamepadMapper[0],'ok');pad.buttons[0].pressed=true;h.frame();assert(input.isTriggered('ok'));assert(input.isPressed('ok'));
 input.clear();input.update();assert(input.isTriggered('ok'));assert.equal(input._pressedTime,0);
 pad.buttons[0].pressed=false;h.frame();assert(!input.isPressed('ok'));pad.buttons[0].pressed=true;h.frame();assert(input.isTriggered('ok'));
});
test('gamepad handoff held confirm cannot restart native map event; release then press still can',()=>{
 const pad=syntheticPad(),h=cursorHost({nativeInput:true,gamepads:()=>[pad]}),G=h.G;open(h,{initialZh:'Pad'});
 pad.buttons[2].pressed=true;h.frame();assert.equal(h.scene()._grid.index,70);pad.buttons[2].pressed=false;h.frame();
 pad.buttons[0].pressed=true;h.frame();assert.equal(result(h),'Pad');const act=nativeMapAction(h);h.transition();h.frame();assert(!h.map._interpreter.isRunning());assert(G.$gamePlayer.canMove());
 console.log('gamepad held map handoff '+JSON.stringify({pressed:G.Input.isPressed('ok'),triggered:G.Input.isTriggered('ok'),latest:G.Input._latestButton,pressedTime:G.Input._pressedTime}));
 assert.equal(act(),false,'the same held confirmation must not restart the map event after Input.clear');
 for(let i=0;i<36;i++){if(i===17)G.Input.clear();h.frame();assert(!G.Input.isRepeated('ok'));assert.equal(act(),false);assert(!h.map._interpreter.isRunning());}
 pad.buttons[0].pressed=false;h.frame();assert(!G.Input.isPressed('ok'));pad.buttons[0].pressed=true;h.frame();assert(G.Input.isTriggered('ok'));assert.equal(act(),true);assert(h.map._interpreter.isRunning());assert.equal(result(h),'Pad');assert.deepEqual(h.writes,[]);
});
test('gamepad handoff pointer OK also consumes an already held confirmation until release',()=>{
 const pad=syntheticPad(),h=cursorHost({nativeInput:true,gamepads:()=>[pad]});open(h);
 pad.buttons[0].pressed=true;h.frame();assert.equal(h.scene()._grid.text,'A');h.click(70);assert.equal(result(h),'A');const act=nativeMapAction(h);h.transition();h.frame();
 assert.equal(act(),false,'pointer finish must not turn the held gamepad confirmation into a new map action');
 pad.buttons[0].pressed=false;h.frame();pad.buttons[0].pressed=true;h.frame();assert.equal(act(),true);assert.deepEqual(h.writes,[]);
});

for(let group=0;group<4;group++)test('full plugin group '+group+' renders all65 exact characters and rejects only whole empty columns',()=>{
 const h=cursorHost(),s=open(h);h.click(65+group);
 const actual=Array.from(s._buttons.slice(0,65),b=>b.textContent);assert.deepEqual(actual,rows[group].flatMap(row=>Array.from(row)));
 assert.equal(actual.length,65);for(const row of rows[group])assert.equal(Array.from(row).length,13);
 for(let col=0;col<13;col++){const empty=rows[group].every(row=>Array.from(row)[col]===' ');for(let row=0;row<5;row++)assert.equal(s._buttons[row*13+col].disabled,empty&&col!==12);}
 assert(!s._field&&!s._cancelButton);assert.equal(h.G.Scene_Name.prototype.onInputOk,h.nativeName);assert.deepEqual(h.writes,[]);
});
test('J right skips entire empty column10; bottom9 reaches real space11 and column12 remains reachable',()=>{
 const h=cursorHost(),s=open(h);h.focus(9);h.frame('right');assert.equal(s._grid.index,11);assert.equal(s._buttons[11].textContent,',');
 h.focus(61);h.frame('right');assert.equal(s._grid.index,63);assert.equal(s._buttons[63].textContent,' ');h.frame('right');assert.equal(s._grid.index,64);h.frame('right');assert.equal(s._grid.index,52);h.frame('left');assert.equal(s._grid.index,64);
});
for(let group=0;group<4;group++)test('group'+group+' horizontal wraps skip empty columns while vertical accepts row spaces',()=>{
 const h=cursorHost(),s=open(h);h.click(65+group);
 for(let row=0;row<5;row++){h.focus(row*13+9);h.frame('right');assert.equal(s._grid.index,row*13+11);h.frame('left');assert.equal(s._grid.index,row*13+9);h.focus(row*13);h.frame('left');assert.equal(s._grid.index,row*13+12);}
 h.focus(2*13+4);h.frame('down');assert.equal(s._grid.index,3*13+4);h.frame('up');assert.equal(s._grid.index,2*13+4);
});
test('all13 edge columns select specified controls and controls return through representative columns',()=>{
 const h=cursorHost(),s=open(h),control=[0,0,1,1,2,2,3,3,4,4,4,5,5],representative=[0,2,4,6,9,11];
 for(let col=0;col<13;col++){h.focus(col);h.frame('up');assert.equal(s._grid.index,65+control[col]);h.frame('up');assert.equal(s._grid.index,52+representative[control[col]]);h.focus(52+col);h.frame('down');assert.equal(s._grid.index,65+control[col]);h.frame('down');assert.equal(s._grid.index,representative[control[col]]);}
});
test('A UP UPPER UP bottom0; controls left/right cycle six items independently of character group',()=>{
 const h=cursorHost(),s=open(h);h.frame('up');assert.equal(s._grid.index,65);h.frame('up');assert.equal(s._grid.index,52);h.frame('down');assert.equal(s._grid.index,65);h.frame('down');assert.equal(s._grid.index,0);
 h.focus(65);for(let n=1;n<=6;n++){h.frame('right');assert.equal(s._grid.index,65+n%6);}h.frame('left');assert.equal(s._grid.index,70);assert.equal(s._grid.group,0);
});
test('special cycles four groups; individual mode controls select each group with switch sound',()=>{
 const h=cursorHost(),s=open(h);for(let group=1;group<=4;group++){h.frame('control');assert.equal(s._grid.group,group%4);assert.equal(s._grid.index,0);}
 for(let group=3;group>=0;group--){h.click(65+group);assert.equal(s._grid.group,group);assert.equal(s._grid.index,65+group);}assert(h.sounds.every(s=>s==='cursor'));
});
test('direction priority LEFT RIGHT UP DOWN; actual movement consumes simultaneous USE',()=>{
 const h=cursorHost(),s=open(h);h.focus(14);h.frame('left','right','up','down','ok');assert.equal(s._grid.index,13);assert.equal(s._grid.text,'');
 h.focus(14);h.frame('right','up','down','ok');assert.equal(s._grid.index,15);h.frame('up','down','ok');assert.equal(s._grid.index,2);assert.equal(s._grid.text,'');assert(!h.sounds.includes('ok'));
});
test('ACTION+USE only locates OK without sound; next USE alone confirms',()=>{
 const h=cursorHost(),s=open(h,{initialZh:'Keep'});h.frame('shift','ok');assert.equal(s._grid.index,70);assert(s.current());assert.equal(result(h),undefined);assert.deepEqual(h.sounds,[]);h.frame('ok');assert.equal(result(h),'Keep');assert.deepEqual(h.sounds,['ok']);
});
test('SPECIAL beats ACTION BACK USE; BACK beats USE even at OK, and empty BACK never cancels',()=>{
 const h=cursorHost(),s=open(h,{initialZh:'AB'});h.frame('control','shift','cancel','ok');assert.equal(s._grid.group,1);assert.equal(s._grid.index,0);assert.equal(s._grid.text,'AB');
 h.focus(70);h.frame('cancel','ok');assert.equal(s._grid.text,'A');assert.equal(s._grid.index,70);assert(s.current());h.frame('cancel');h.frame('cancel');assert.equal(s._grid.text,'');assert(s.current());assert.equal(result(h),undefined);assert(!h.sounds.includes('ok'));
});
test('MG20 full text replaces only final character and jumps to OK',()=>{
 const h=cursorHost(),s=open(h,{initialZh:'ABCDEFG',maxLength:'7'});h.focus(7);h.frame('ok');assert.equal(s._grid.text,'ABCDEFH');assert.equal(s._grid.index,70);assert(s.current());h.frame('ok');assert.equal(result(h),'ABCDEFH');
});
test('MG21 overlong initial is retained and directly confirmable; insertion replaces one tail only',()=>{
 const h=cursorHost();open(h,{initialZh:'ABCDEFGH',minLength:'1',maxLength:'7'});complete(h);assert.equal(result(h),'ABCDEFGH');h.transition();
 const s=open(h,{initialZh:'ABCDEFGH',maxLength:'7'});h.focus(8);h.frame('ok');assert.equal(s._grid.text,'ABCDEFGI');assert.equal(s._grid.index,70);h.frame('ok');assert.equal(result(h),'ABCDEFGI');
});
for(const [index,expected]of [[0,'A'],[52,'0'],[39,' ']])test('MG22 first group insertion at position1 switches lower for '+JSON.stringify(expected),()=>{
 const h=cursorHost(),s=open(h);h.focus(index);h.frame('ok');assert.equal(s._grid.text,expected);assert.equal(s._grid.group,1);
});
test('automatic lowercase requires group0 and position1; minimum and capacity count Unicode characters',()=>{
 const h=cursorHost(),s=open(h,{initialZh:'你',maxLength:'2'});h.frame('ok');assert.equal(s._grid.text,'你A');assert.equal(s._grid.group,0);assert.equal(s._grid.index,70);h.frame('cancel');assert.equal(s._grid.text,'你');h.click(67);h.click(0);assert.equal(s._grid.text,'你À');assert.equal(s._grid.group,2);assert.equal(s._grid.index,70);
});
test('MG23 OK plays confirmation before minimum check, no buzzer and no exit; valid subsequent text completes',()=>{
 const h=cursorHost(),s=open(h,{minLength:'2'});complete(h);assert(s.current());assert.equal(result(h),undefined);assert.deepEqual(h.sounds,['ok']);assert(s._status.textContent.includes('2'));h.click(0);h.click(1);h.click(70);assert.equal(result(h),'Ab');assert(!h.sounds.includes('buzzer'));
});
test('positive max1 min0 can return empty through ACTION then USE; no cancellation marker',()=>{
 const h=cursorHost();open(h,{maxLength:'1'});h.frame('cancel');assert.equal(result(h),undefined);complete(h);assert.equal(result(h),'');assert.equal(h.G.$gameVariables.value(1),0);assert.deepEqual(h.writes,[]);
});
test('delete control and BACK both remove final Unicode character and leave editor active',()=>{
 const h=cursorHost(),s=open(h,{initialZh:'A😀你'});h.click(69);assert.equal(s._grid.text,'A😀');h.frame('cancel');assert.equal(s._grid.text,'A');h.frame('cancel');h.frame('cancel');assert.equal(s._grid.text,'');assert(s.current());assert.equal(result(h),undefined);
});
test('held BACK repeats after host wait/interval, rather than producing an exit',()=>{
 const h=cursorHost(),s=open(h,{initialZh:'ABCDE'});h.down('Escape');h.frame();assert.equal(s._grid.text,'ABCD');for(let n=0;n<23;n++)h.frame();assert.equal(s._grid.text,'ABCD');h.frame();assert.equal(s._grid.text,'ABC');for(let n=0;n<6;n++)h.frame();assert.equal(s._grid.text,'AB');h.up('Escape');assert(s.current());assert.equal(result(h),undefined);
});
test('grid has no text field: native composition, paste and ordinary B do not append text',()=>{
 const h=cursorHost(),s=open(h,{initialZh:'Safe'});h.press('KeyB');s._panel.dispatch('paste',{text:'Injected'});s._panel.dispatch('input',{data:'Injected'});s._panel.dispatch('compositionend',{data:'Injected'});assert.equal(s._grid.text,'Safe');assert.equal(h.doc.activeElement,s._panel);assert(!s._field);
});
for(const [group,index,expected]of [[2,11,'Æ'],[2,38,'œ'],[3,24,'Ρ'],[3,25,'Κ'],[3,37,'Π'],[3,38,'Μ'],[3,44,'♥'],[3,48,'✨'],[0,37,'♂'],[0,38,'♀']])test('pointer chooses literal character '+expected+' exactly once',()=>{
 const h=cursorHost(),s=open(h,{maxLength:'1'});h.click(65+group);h.click(index);assert.equal(s._grid.text,expected);assert.equal(s._grid.index,70);h.click(70);assert.equal(result(h),expected);
});
test('variable initial is a snapshot; result writes selected existing variable exactly once',()=>{
 const h=cursorHost(),G=h.G;G.$gameVariables.setValue(2,'Original');const s=open(h,{initialVariableId:'2',resultVariableId:'3'});G.$gameVariables.setValue(2,'Later');let writes=0;const set=G.$gameVariables.setValue;G.$gameVariables.setValue=function(id,value){writes++;return set.call(this,id,value);};complete(h);s.operate('confirm');s._buttons[70].dispatch('click');assert.equal(G.$gameVariables.value(3),'Original');assert.equal(G.$gameVariables.value(2),'Later');assert.equal(writes,1);
});
test('callbacks cannot act before start, after close, or on the next request',()=>{
 const h=cursorHost(),G=h.G;h.enter([h.command({mode:'cursor',initialZh:'One'}),end]);const pending=G.SceneManager._nextScene;G.SceneManager._scene=pending;G.SceneManager._nextScene=null;pending.create();const old=pending._buttons[70].listeners.click[0];old();assert.equal(result(h),undefined);pending.start();old();assert.equal(result(h),'One');h.transition();const next=open(h,{initialZh:'Two'});old();assert(next.current());assert.equal(result(h),'One');h.click(70);assert.equal(result(h),'Two');
});
for(const replacement of ['queued-scene','current-scene','variables'])test('invalidated '+replacement+' rejects grid callbacks and result writes',()=>{
 const h=cursorHost(),s=open(h,{initialZh:'Original'}),G=h.G,variables=G.$gameVariables;
 if(replacement==='queued-scene')G.SceneManager.goto(G.Scene_Map);else if(replacement==='current-scene')G.SceneManager._scene=new G.Scene_Map();else G.$gameVariables=new G.Game_Variables();
 s._buttons[70].dispatch('click');s.operate('confirm');assert.equal(variables._data[1],undefined);assert.equal(G.$gameVariables._data[1],undefined);s.terminate();assert.equal(h.doc.body.children.length,0);
});
for(const mode of ['keyboard','free'])test('held grid Z cannot type or confirm subsequent '+mode+' before keyup; fresh Z remains editable',()=>{
 const h=cursorHost({nativeInput:true}),G=h.G;h.enter([h.command({mode:'cursor',initialZh:'Grid'}),h.command({mode,initialZh:'Next'}),end]);h.transition();h.press('ShiftLeft');h.down('KeyZ');h.frame();assert.equal(result(h),'Grid');h.transition();h.frame();h.transition();const s=h.scene();assert.equal(s._field.value,'Next');
 const repeated=h.key('z',{repeat:true,hold:true});assert(repeated.prevented&&repeated.stopped);assert.equal(s._field.value,'Next');assert(s.current());h.up('KeyZ');const fresh=h.key('z');assert(!fresh.prevented);h.insert('z');h.key('Enter');assert.equal(result(h),'Nextz');h.transition();h.frame();assert(!h.map._interpreter.isRunning());assert.deepEqual(h.writes,[]);assert.equal(G.Scene_Name.prototype.onInputOk,h.nativeName);
});
test('opening held native Enter is latched; closing Enter stays consumed until keyup on map',()=>{
 const h=cursorHost({nativeInput:true}),G=h.G;h.down('Enter');G.Input.update();const s=open(h);for(let i=0;i<30;i++)h.frame();assert.equal(s._grid.text,'');h.up('Enter');h.press('Enter');assert.equal(s._grid.text,'A');h.press('ShiftLeft');h.down('Enter');h.frame();assert.equal(result(h),'A');G.Input.virtualClick('ok');G.Input.update();assert(!G.Input.isTriggered('ok'));h.up('Enter');G.Input.virtualClick('ok');G.Input.update();assert(G.Input.isTriggered('ok'));
});
test('keyboard Enter held through return cannot select a subsequent cursor character',()=>{
 const h=cursorHost(),G=h.G;h.enter([h.command({initialZh:'Typed'}),h.command({mode:'cursor'}),end]);h.transition();h.key('Enter',{hold:true});h.transition();h.frame();h.transition();const s=h.scene();for(let i=0;i<30;i++)h.frame();assert.equal(s._grid.text,'');h.up('Enter');h.press('Enter');assert.equal(s._grid.text,'A');assert.equal(G.$gameVariables.value(1),'Typed');
});
test('cursor active/message busy gate only this editor; another interpreter ordinary command remains live',()=>{
 const h=cursorHost(),s=open(h),G=h.G,other=new G.Game_Interpreter();let ran=0;other.command999=()=>{ran++;return true;};other.setup([{code:999,indent:0,parameters:[]},h.command({mode:'free'}),end],17);other.update();assert.equal(ran,1);assert.equal(other._index,1);h.click(70);h.transition();G.$gameMessage.add('Busy');other.update();assert.equal(other._index,1);G.$gameMessage.clear();other.update();assert.equal(other._index,2);h.transition();assert(h.scene()._field);h.key('Escape');h.transition();other.update();assert(!other.isRunning());assert(!s.current());
});
for(const [field,value]of [['maxLength','0'],['maxLength','-1'],['maxLength','33'],['minLength','13'],['minLength','-1'],['resultVariableId','0'],['resultVariableId','21'],['initialVariableId','21']])test('cursor rejects documented unsupported '+field+'='+value+' before scene or write',()=>{
 const h=cursorHost();assert.throws(()=>open(h,{[field]:value}),/ShowTextInput/);assert(!h.G.SceneManager._nextScene);assert.equal(h.doc.body.children.length,0);assert.equal(result(h),undefined);
});
for(const lang of ['zh','en'])for(const [width,height]of [[512,384],[640,480],[816,624]])test(lang+' '+width+'x'+height+' DOM grid layout and literal title/value',()=>{
 const h=cursorHost({lang,width,height,touchUI:true}),s=open(h,{initialZh:'<b>字\\!☺',initialEn:'<b>text\\!☺',titleZh:'字符<b>',titleEn:'Grid<b>'});assert.equal(s._panel.style.left,'5%');assert.equal(s._panel.style.width,'90%');assert.equal(s._panel.style.maxHeight,'84%');assert.equal(s._buttons.length,71);assert(s._buttons.every(b=>b.type==='button'));assert.equal(s._panel.children[0].textContent,lang==='zh'?'字符<b>':'Grid<b>');assert.equal(s._text.textContent,lang==='zh'?'<b>字\\!☺':'<b>text\\!☺');assert(!s._cancelButton);h.click(70);assert.equal(result(h),lang==='zh'?'<b>字\\!☺':'<b>text\\!☺');
});
test('idle frames do not redraw or rescan character text; terminate removes local DOM/listeners',()=>{
 const h=cursorHost(),s=open(h);let draws=0;for(const b of s._buttons){const text=b.textContent;Object.defineProperty(b,'textContent',{get:()=>text,set(){draws++;throw Error('unexpected idle character redraw');}});}for(let i=0;i<40;i++)h.frame();assert.equal(draws,0);s.terminate();assert.equal(h.doc.body.children.length,0);assert.equal(h.doc.listeners.keydown.length,1);assert.equal(h.doc.listeners.keyup.length,1);assert.equal(result(h),undefined);
});

for(const lang of ['zh','en'])test(lang+' Map005 event16 grid→keyboard→free→message→balloon returns to movement without state or persistence writes',()=>{
 const h=cursorHost({lang,touchUI:true}),G=h.G,map=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Map005.json'),'utf8')),event=map.events[16],state=JSON.stringify(h.state);assert.deepEqual([event.x,event.y,event.pages[0].trigger],[16,6,0]);h.enter(event.pages[0].list);let cursor=0,keyboard=0,free=0,last;
 for(let n=0;n<2500&&h.map._interpreter.isRunning();n++){
  h.transition();const s=h.scene();if(s!==last&&s._grid){last=s;cursor++;assert(!G.$gamePlayer.canMove());h.click(70);}
  else if(s!==last&&s._field){last=s;if(s._request.mode==='keyboard'){keyboard++;h.edit(lang==='zh'?'网格后键入':'Typed after grid');h.key('Enter');}else{free++;h.edit('Discard me');h.key('Escape');}}
  else if(h.win.pause)h.frame('ok');else h.frame();if(h.balloon)h.releaseBalloon();
 }
 assert.deepEqual([cursor,keyboard,free],[1,1,1]);assert(!h.map._interpreter.isRunning());assert.equal(G.$gameVariables.value(14),lang==='zh'?'网格后键入':'Typed after grid');assert(h.text().includes(lang==='zh'?'事件继续':'Event continued'));assert(G.$gamePlayer.canMove());assert.equal(JSON.stringify(h.state),state);assert.deepEqual(h.writes,[]);assert.equal(h.doc.body.children.length,0);assert.equal(G.Scene_Name.prototype.onInputOk,h.nativeName);
});
test('real map tiles/event collision and action-key can reach event16, then result precedes following event command',()=>{
 const h=cursorHost(),G=h.G,map=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Map005.json'),'utf8')),system=JSON.parse(fs.readFileSync(path.join(ROOT,'data/System.json'),'utf8')),tiles=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Tilesets.json'),'utf8'));G.$dataMap=map;const m=G.$gameMap;
 loadNative(G,'js/reactor_objects.js',['Game_Map.prototype.checkPassage','Game_Map.prototype.tileId','Game_Map.prototype.layeredTiles','Game_Map.prototype.allTiles','Game_Map.prototype.isPassable','Game_Map.prototype.isAnyEventStarting','Game_Player.prototype.triggerButtonAction','Game_Player.prototype.startMapEvent','Game_Player.prototype.checkEventTriggerHere','Game_Player.prototype.checkEventTriggerThere']);
 m.tilesetFlags=()=>tiles[map.tilesetId].flags;m.tileEventsXy=()=>[];m.isCounter=()=>false;m.roundXWithDirection=(x,d)=>x+(d===6?1:d===4?-1:0);m.roundYWithDirection=(y,d)=>y+(d===2?1:d===8?-1:0);
 const events=map.events.filter(Boolean).map(e=>{assert.equal(e.pages.length,1);const p=e.pages[0];assert(!Object.entries(p.conditions).some(([k,v])=>k.endsWith('Valid')&&v));return Object.assign(Object.create(G.Game_Event.prototype),{x:e.x,y:e.y,_trigger:p.trigger,list:()=>p.list,eventId:()=>e.id,lock(){},isNormalPriority:()=>p.priorityType===1,_page:p});});m.events=()=>events;m.eventsXy=(x,y)=>events.filter(e=>e.x===x&&e.y===y);
 const start=[system.startX,system.startY],target=map.events[16],queue=[start],parent=new Map([[start.join(','),null]]);let goal;
 for(let i=0;i<queue.length;i++){const[x,y]=queue[i];if(Math.abs(x-target.x)+Math.abs(y-target.y)===1){goal=[x,y];break;}for(const d of[2,4,6,8]){const nx=m.roundXWithDirection(x,d),ny=m.roundYWithDirection(y,d),key=nx+','+ny;if(nx<0||ny<0||nx>=map.width||ny>=map.height||parent.has(key))continue;if(events.some(e=>e.x===nx&&e.y===ny&&e.isNormalPriority()&&!e._page.through))continue;if(!m.isPassable(x,y,d)||!m.isPassable(nx,ny,10-d))continue;parent.set(key,[x,y]);queue.push([nx,ny]);}}
 assert(goal);const route=[];for(let p=goal;p;p=parent.get(p.join(',')))route.unshift(p);console.log('WP17 cursor Map005 approach '+JSON.stringify({start,route,approach:goal,event:[target.x,target.y]}));Object.assign(G.$gamePlayer,{x:goal[0],y:goal[1],getOnOffVehicle:()=>false,canStartLocalEvents:()=>true,direction:()=>target.x>goal[0]?6:target.x<goal[0]?4:target.y>goal[1]?2:8});h.keys.add('ok');assert(G.$gamePlayer.triggerButtonAction());h.keys.clear();m.updateInterpreter();assert.equal(m._interpreter._eventId,16);
 let grid=0,editors=0,last;
 for(let n=0;n<2500&&m._interpreter.isRunning();n++){h.transition();const s=h.scene();if(s!==last&&s._grid){last=s;grid++;h.click(0);h.click(70);}else if(s!==last&&s._field){last=s;editors++;h.key('Enter');}else if(h.win.pause)h.frame('ok');else h.frame();if(h.balloon)h.releaseBalloon();}
 assert.equal(grid,1);assert.equal(editors,2);assert(!m._interpreter.isRunning());assert(G.$gamePlayer.canMove());assert.deepEqual(h.writes,[]);
});
