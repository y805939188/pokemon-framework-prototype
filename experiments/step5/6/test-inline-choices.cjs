'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {choicesHost,ROOT}=require('./choices-host.cjs');
const end={code:0,indent:0,parameters:[]};
function fixture(lang='zh',width=816,height=624,touch=false){
 const h=choicesHost(lang,width,height,touch),writes=[],set=h.G.$gameVariables.setValue;
 h.G.$gameVariables.setValue=function(id,value){if(id>0&&id<h.G.$dataSystem.variables.length)writes.push({id,value});return set.call(this,id,value);};
 const message=(zh,en=zh)=>({code:357,indent:0,parameters:['PS_Management','ShowMessage','Message',{textZh:zh,textEn:en,position:'2'}]});
 const untilChoice=()=>h.until(()=>h.choice.active);
 return {...h,message,untilChoice,resultWrites:writes,get balloon(){return h.balloon;}};
}
test('one production message becomes a native choice without a final text confirmation, then the event continues',()=>{
 const h=fixture();let next=0;h.G.Game_Interpreter.prototype.command999=()=>{next++;return true;};
 h.enter([h.message('AB\\!C\\wt[2]D\\ch[13,2,"是","否"]'),{code:999,indent:0,parameters:[]},end]);
 h.tick(0);assert.equal(h.text(),'A');assert(!h.choice.active);h.tick(25);h.tick(25);assert(h.win.pause);assert(!h.choice.active);assert.equal(next,0);
 h.tick(0,'ok');h.tick(0);h.tick(25);assert(!h.choice.active);h.tick(99,'ok');assert(!h.choice.active);h.tick(1);h.untilChoice();
 assert.equal(h.win.pause,false);assert(h.G.$gameMessage.isBusy());assert(!h.G.$gamePlayer.canMove());assert.deepEqual(h.resultWrites,[]);assert.equal(h.choice.maxItems(),2);assert(!h.text().includes('\\ch['));
 h.tick(0,'down','ok');assert.deepEqual(h.resultWrites,[{id:13,value:1}]);assert.equal(next,1);assert(!h.G.$gameMessage.isBusy());assert(h.G.$gamePlayer.canMove());assert.deepEqual(h.writes,[]);
});
for(const [cancel,input,expected] of [['2',['cancel','ok'],1],['-7',['cancel','ok'],-7],['0',['cancel'],null],['none',['cancel'],null],['取消',['cancel'],null]])test('inline cancel '+cancel,()=>{
 const h=fixture();h.enter([h.message('\\ts[]Q\\ch[13,'+cancel+',A,B]'),end]);h.untilChoice();h.tick(0,...input);
 if(expected===null){assert(h.G.$gameMessage.isBusy());assert.deepEqual(h.resultWrites,[]);h.tick(0,'down','ok');}
 assert.deepEqual(h.resultWrites,[{id:13,value:expected===null?1:expected}]);assert(!h.G.$gameMessage.isBusy());
});
test('variable zero is accepted and uses the ordinary host no-write behavior',()=>{const h=fixture();h.enter([h.message('\\ts[]\\ch[0,2,Yes,No]'),end]);h.untilChoice();h.tick(0,'ok');assert.deepEqual(h.resultWrites,[]);assert.equal(h.refreshCount(),0);assert(!h.map._interpreter.isRunning());});
test('author CSV fields preserve quoted comma, bracket, empty label and literal controls',()=>{
 const h=fixture();h.enter([h.message('\\ts[]Q\\ch[13,2,"A, B]",,"\\v[1]<b>&lt;\\ch[0,0,x]"]'),end]);h.untilChoice();
 assert.equal(h.choice.maxItems(),3);assert.equal(h.G.$gameMessage.choices()[0],'A, B]');assert.equal(h.G.$gameMessage.choices()[1],'');assert(h.text().includes('\\v[1]<b>&lt;\\ch[0,0,x]'));assert.deepEqual(h.resultWrites,[]);h.tick(0,'ok');assert.equal(h.G.$gameVariables.value(13),0);
});
test('escaped, uppercase and replacement-value controls never create an inline request',()=>{
 const h=fixture();h.G.$gameVariables.setValue(1,'\\ch[13,2,X,Y]');h.resultWrites.length=0;h.enter([h.message('\\ts[]\\\\ch[13,2,A,B]/\\CH[13,2,C,D]/\\v[1]'),end]);h.until(()=>h.win.pause);assert(!h.choice.active);assert(h.text().includes('\\ch[13,2,A,B]/\\CH[13,2,C,D]/\\ch[13,2,X,Y]'));assert.deepEqual(h.resultWrites,[]);h.tick(0,'ok');
});
for(const text of ['\\ch[13,0]','\\ch[13,0,A','\\ch[13,0,"A]','\\ch[13,0,"A" x,B]','\\ch[13,0,A"B,C]','\\ch[-1,0,A]','\\ch[99,0,A]','\\ch[13,1.5,A]','\\ch[13,2tail,A]','\\ch[13,0,A]\\ch[13,0,B]','\\ch[13,0,"A\nB"]'])test('unsupported author syntax fails before ownership: '+JSON.stringify(text),()=>{
 const h=fixture();assert.throws(()=>h.enter([h.message(text),end]),/ShowMessage/);assert(!h.G.$gameMessage.isBusy());assert(!h.choice.active);assert.deepEqual(h.resultWrites,[]);
});
test('captured result callback is inert before selection, after clear, after replacement and after scene loss',()=>{
 const h=fixture();h.enter([h.message('Longer question\\ch[13,2,A,B]'),end]);const early=h.G.$gameMessage._choiceCallback;early(1);assert.deepEqual(h.resultWrites,[]);h.untilChoice();const old=h.G.$gameMessage._choiceCallback;h.tick(0,'ok');assert.deepEqual(h.resultWrites,[{id:13,value:0}]);old(1);assert.equal(h.resultWrites.length,1);
 h.enter([h.message('\\ts[]Next\\ch[13,-9,C,D]'),end]);h.untilChoice();old(1);assert.equal(h.resultWrites.length,1);assert(h.G.$gameMessage.isBusy());const lost=h.G.$gameMessage._choiceCallback,scene=h.G.SceneManager._scene,changing=h.G.SceneManager.isSceneChanging;h.G.SceneManager.isSceneChanging=()=>true;lost(1);assert.equal(h.resultWrites.length,1,'queued scene change rejects old result');h.G.SceneManager.isSceneChanging=changing;h.G.SceneManager._scene={};lost(1);assert.equal(h.resultWrites.length,1);h.G.SceneManager._scene=scene;h.tick(0,'cancel');assert.deepEqual(h.resultWrites.at(-1),{id:13,value:-9});lost(1);assert.equal(h.resultWrites.length,2);
});
test('result variable host replacement refuses old callback writes and event continuation',()=>{const h=fixture();h.enter([h.message('\\ts[]Q\\ch[13,2,A,B]'),end]);h.untilChoice();const old=h.G.$gameMessage._choiceCallback;let foreign=0;h.G.$gameVariables={value:()=>0,setValue:()=>foreign++};old(1);h.tick(0,'ok');assert.equal(foreign,0);assert.deepEqual(h.resultWrites,[]);assert(h.G.$gameMessage.isBusy());assert(h.map._interpreter.isRunning());});
test('request-bound touch cancellation cannot cancel a later inline or native request',()=>{
 const h=fixture('zh',816,624,true);h.enter([h.message('\\ts[]First\\ch[13,2,A,B]'),end]);h.untilChoice();const old=h.choice._cancelButton._clickHandler;h.tick(0,'ok');h.enter([h.message('\\ts[]Second\\ch[13,-8,C,D]'),end]);h.untilChoice();old();assert.equal(h.G.Input._virtualKey,undefined);assert(h.G.$gameMessage.isBusy());h.choice._cancelButton.onClick();assert.equal(h.G.Input._virtualKey,'cancel');h.tick(0,'cancel');assert.deepEqual(h.resultWrites.at(-1),{id:13,value:-8});
 h.show();old();assert(h.G.$gameMessage.isBusy());h.tick(0,'ok');
});
test('body completion input is consumed and choice completion does not enter the next message',()=>{
 const h=fixture();h.enter([h.message('A\\ch[13,2,A,B]'),h.message('NEXT'),end]);h.tick(0,'ok','touch');h.untilChoice();assert.deepEqual(h.resultWrites,[]);h.tick(0,'ok');assert.equal(h.resultWrites.length,1);h.until(()=>h.win.pause);assert(h.G.$gameMessage.isBusy());h.tick(0,'ok');assert(!h.map._interpreter.isRunning());
});
test('instant device speed reveals the body without transferring reveal input to the inline choice',()=>{
 const h=fixture();h.G.ConfigManager={psTextSpeed:3};
 h.enter([h.message('AB\\ch[13,2,A,B]'),end]);h.tick(0,'ok','touch');assert.equal(h.draws[0].text,'AB');assert(h.choice.active);
 assert.deepEqual(h.resultWrites,[]);assert(h.map._interpreter.isRunning());h.tick(0,'down','ok');
 assert.deepEqual(h.resultWrites,[{id:13,value:1}]);assert(!h.map._interpreter.isRunning());assert.deepEqual(h.writes,[]);
});
test('real native keyboard trigger and hold cannot cross the body-to-choice boundary',()=>{
 const h=fixture(),core=fs.readFileSync(ROOT+'/js/reactor_core.js','utf8');h.G.navigator={getGamepads:()=>[]};vm.runInContext(core.slice(core.indexOf('function Input()'),core.indexOf('function TouchInput()')),h.G);h.G.Input.initialize();
 const press=code=>h.G.Input._onKeyDown({keyCode:code,preventDefault(){}}),release=code=>h.G.Input._onKeyUp({keyCode:code}),frame=()=>{h.G.Input.update();h.tick(25);};
 h.enter([h.message('A\\ch[13,2,A,B]'),end]);press(90);for(let i=0;i<8;i++)frame();assert(h.choice.active);assert.deepEqual(h.resultWrites,[]);release(90);frame();press(40);frame();release(40);frame();press(90);frame();assert.deepEqual(h.resultWrites,[{id:13,value:1}]);release(90);frame();
});
test('native virtual touch cancellation is request-bound and returns to native choices unchanged',()=>{
 const h=fixture('zh',816,624,true),core=fs.readFileSync(ROOT+'/js/reactor_core.js','utf8');h.G.navigator={getGamepads:()=>[]};vm.runInContext(core.slice(core.indexOf('function Input()'),core.indexOf('function TouchInput()')),h.G);h.G.Input.initialize();const frame=()=>{h.G.Input.update();h.tick(25);},ready=()=>{for(let n=0;n<100&&!h.choice.active;n++)frame();assert(h.choice.active);};
 h.enter([h.message('\\ts[]First\\ch[13,2,A,B]'),end]);ready();const old=h.choice._cancelButton._clickHandler;h.choice._cancelButton.onClick();frame();assert.deepEqual(h.resultWrites,[{id:13,value:1}]);
 h.enter([h.message('\\ts[]Second\\ch[13,-8,C,D]'),end]);ready();old();frame();assert.equal(h.resultWrites.length,1);assert(h.G.$gameMessage.isBusy());h.choice._cancelButton.onClick();frame();assert.deepEqual(h.resultWrites.at(-1),{id:13,value:-8});
 const list=[{code:102,indent:0,parameters:[['Native A','Native B'],-2,0,2,0]},end];h.enter(vm.runInContext('('+JSON.stringify(list)+')',h.G));ready();assert.equal(h.choice._cancelButton._clickHandler,null);old();frame();assert(h.G.$gameMessage.isBusy());h.choice._cancelButton.onClick();frame();assert.equal(h.map._interpreter._branch[0],-2);assert.equal(h.resultWrites.length,2);assert(!h.G.$gameMessage.isBusy());
});
test('stable choice frames do not read the original command text or rewrite the result',()=>{
 const h=fixture(),args=h.message('\\ts[]Q\\ch[13,2,A,B]');h.enter([args,end]);h.untilChoice();Object.defineProperty(args.parameters[3],'textZh',{get(){throw Error('reparse on idle');}});for(let i=0;i<8;i++)h.tick(25);assert.deepEqual(h.resultWrites,[]);h.tick(0,'ok');assert.equal(h.resultWrites.length,1);
});
test('replacement text and removed author controls never form a second parse pass',()=>{
 const h=fixture();h.G.$gameVariables.setValue(1,'\\ch[0,0,INJECT]');h.resultWrites.length=0;h.enter([h.message('\\ts[]\\v[1]/\\p\\ch[13,2,A,B]n'),end]);h.untilChoice();assert(h.text().includes('\\ch[0,0,INJECT]/\\pn'));assert.equal(h.choice.maxItems(),2);h.tick(0,'ok');assert.deepEqual(h.resultWrites,[{id:13,value:0}]);
});
for(const text of ['\\ch[13,2,A,B]','\\ts[]Q\\^\\ch[13,2,A,B]','\\ts[]Q\\wtnp[2]\\ch[13,2,A,B]'])test('empty body and automatic-ending controls still wait for the selection: '+JSON.stringify(text),()=>{
 const h=fixture();h.enter([h.message(text),end]);h.untilChoice();assert(h.G.$gameMessage.isBusy());assert.deepEqual(h.resultWrites,[]);h.tick(0,'cancel');assert.deepEqual(h.resultWrites,[{id:13,value:1}]);
});
test('accepted language/list snapshot survives language changes during text display',()=>{
 const h=fixture();let lang='zh';h.G.PSFlow.translator=()=>({lang});h.enter([h.message('中文\\ch[13,2,甲,乙]','English\\ch[13,2,A,B]'),end]);lang='en';h.untilChoice();assert.deepEqual(Array.from(h.G.$gameMessage.choices()),['甲','乙']);assert(h.text().includes('中文'));h.tick(0,'ok');
});
test('inline syntax diagnostics identify the author field without exposing the text or stack',()=>{
 const h=fixture(),logs=[];h.G.Utils.isOptionValid=key=>key==='test';h.G.console={error:(...a)=>logs.push(a)};const command=h.message('secret-token\\ch[13,0,"bad]');let error;try{h.enter([command,end]);}catch(e){error=e;}assert(error);assert.match(error.message,/WP07-EVENT/);assert.equal(logs.length,1);assert.equal(logs[0][1].field,'textZh.ch');assert.equal(logs[0][1].mapId,5);assert.equal(logs[0][1].eventId,11);assert(!/secret-token|\/Users\//.test(JSON.stringify(logs)+error.stack));assert.deepEqual(h.resultWrites,[]);
});
for(const lang of ['zh','en'])for(const [width,height] of [[512,384],[640,480],[816,624]])test(lang+' '+width+'x'+height+' complete current-language event with native condition and balloon',()=>{
 const h=fixture(lang,width,height,true);let branch=0;h.G.Game_Interpreter.prototype.command998=()=>{branch++;return true;};
 h.enter([h.message('\\ts[]中文？\\ch[13,2,是,否]','\\ts[]English?\\ch[13,2,Yes,No]'),{code:111,indent:0,parameters:[1,13,0,1,0]},{code:998,indent:1,parameters:[]},{code:412,indent:0,parameters:[]},{code:213,indent:0,parameters:[-1,1,true]},end]);h.untilChoice();assert(h.text().includes(lang==='zh'?'中文？':'English?'));assert(h.choice.x>=0&&h.choice.x+h.choice.width<=width);assert(h.choice.y>=0&&h.choice.y+h.choice.height<=height);h.tick(0,'down','ok');assert.equal(branch,1);assert(h.balloon);h.releaseBalloon();h.map.updateInterpreter();assert(!h.map._interpreter.isRunning());assert(h.G.$gamePlayer.canMove());assert.deepEqual(h.resultWrites,[{id:13,value:1}]);assert.deepEqual(h.writes,[]);
});
for(const lang of ['zh','en'])for(const exit of ['first','second','back'])test(lang+' shipped Map005 event15 reaches native branch and balloon for '+exit,()=>{
 const h=fixture(lang),map=JSON.parse(fs.readFileSync(ROOT+'/data/Map005.json','utf8')),event=map.events[15],before=JSON.stringify(h.state);assert.equal(event.id,15);assert.equal(event.x,16);assert.equal(event.y,8);h.enter(event.pages[0].list);let choices=0;
 for(let n=0;n<2000&&h.map._interpreter.isRunning();n++){if(h.choice.active){choices++;h.tick(25,...(exit==='first'?['ok']:exit==='second'?['down','ok']:['cancel']));}else if(h.win.pause)h.tick(25,'ok');else h.tick(25);if(h.balloon)h.releaseBalloon();}
 assert.equal(choices,1);assert(!h.map._interpreter.isRunning());assert(h.G.$gamePlayer.canMove());assert.deepEqual(h.resultWrites,[{id:13,value:exit==='first'?0:1}]);assert(h.text().includes(lang==='zh'?(exit==='first'?'你选择了继续。':'你选择了返回；事件继续。'):(exit==='first'?'Continue selected.':'Back selected; the event continues.')));assert.equal(JSON.stringify(h.state),before);assert.deepEqual(h.writes,[]);
});
test('Map005 native tile/event collision and action key reach shipped inline-choice event15',()=>{
 const h=fixture(),G=h.G,map=JSON.parse(fs.readFileSync(ROOT+'/data/Map005.json','utf8')),system=JSON.parse(fs.readFileSync(ROOT+'/data/System.json','utf8')),tiles=JSON.parse(fs.readFileSync(ROOT+'/data/Tilesets.json','utf8')),source=fs.readFileSync(ROOT+'/js/reactor_objects.js','utf8');G.$dataMap=map;const m=G.$gameMap;
 for(const name of ['Game_Map.prototype.checkPassage','Game_Map.prototype.tileId','Game_Map.prototype.layeredTiles','Game_Map.prototype.allTiles','Game_Map.prototype.isPassable','Game_Map.prototype.isAnyEventStarting','Game_Player.prototype.triggerButtonAction','Game_Player.prototype.startMapEvent','Game_Player.prototype.checkEventTriggerHere','Game_Player.prototype.checkEventTriggerThere']){const a=source.indexOf(name+' = function'),b=source.indexOf('\n};',a);assert(a>=0&&b>a);vm.runInContext(source.slice(a,b+3),G);}
 m.tilesetFlags=()=>tiles[map.tilesetId].flags;m.tileEventsXy=()=>[];m.isCounter=()=>false;m.roundXWithDirection=(x,d)=>x+(d===6?1:d===4?-1:0);m.roundYWithDirection=(y,d)=>y+(d===2?1:d===8?-1:0);
 const events=map.events.filter(Boolean).map(e=>{const p=e.pages[0];return Object.assign(Object.create(G.Game_Event.prototype),{x:e.x,y:e.y,_trigger:p.trigger,list:()=>p.list,eventId:()=>e.id,lock(){},isNormalPriority:()=>p.priorityType===1,_page:p});});m.events=()=>events;m.eventsXy=(x,y)=>events.filter(e=>e.x===x&&e.y===y);
 const start=[system.startX,system.startY],target=map.events[15],queue=[start],parent=new Map([[start.join(','),null]]);let goal;
 for(let i=0;i<queue.length;i++){const [x,y]=queue[i];if(Math.abs(x-target.x)+Math.abs(y-target.y)===1){goal=[x,y];break;}for(const d of [2,4,6,8]){const nx=m.roundXWithDirection(x,d),ny=m.roundYWithDirection(y,d),key=nx+','+ny;if(nx<0||ny<0||nx>=map.width||ny>=map.height||parent.has(key)||events.some(e=>e.x===nx&&e.y===ny&&e.isNormalPriority()&&!e._page.through))continue;if(!m.isPassable(x,y,d)||!m.isPassable(nx,ny,10-d))continue;parent.set(key,[x,y]);queue.push([nx,ny]);}}
 assert(goal);const route=[];for(let p=goal;p;p=parent.get(p.join(',')))route.unshift(p);console.log('WP17 inline Map005 approach '+JSON.stringify({start,route,approach:goal,event:[target.x,target.y]}));Object.assign(G.$gamePlayer,{x:goal[0],y:goal[1],getOnOffVehicle:()=>false,canStartLocalEvents:()=>true,direction:()=>target.x>goal[0]?6:target.x<goal[0]?4:target.y>goal[1]?2:8});h.keys.add('ok');assert(G.$gamePlayer.triggerButtonAction());h.keys.clear();m.updateInterpreter();assert.equal(m._interpreter._eventId,15);
 for(let n=0;n<2000&&m._interpreter.isRunning();n++){if(h.choice.active)h.tick(25,'ok');else if(h.win.pause)h.tick(25,'ok');else h.tick(25);if(h.balloon)h.releaseBalloon();}assert(!m._interpreter.isRunning());assert(G.$gamePlayer.canMove());assert.deepEqual(h.resultWrites,[{id:13,value:0}]);assert.deepEqual(h.writes,[]);
});
