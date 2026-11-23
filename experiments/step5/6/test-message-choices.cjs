'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {host,ROOT}=require('./message-host.cjs');
const {choicesHost}=require('./choices-host.cjs');
test('native event wait and zero-based default result → ordinary interpreter conditional branch → movement',()=>{
 const h=choicesHost();let taken=0,after=0;h.G.Game_Interpreter.prototype.command998=()=>{taken++;return true;};h.G.Game_Interpreter.prototype.command999=()=>{after++;return true;};
 h.enter([h.command({initial:1}),{code:111,indent:0,parameters:[1,1,0,1,0]},{code:998,indent:1,parameters:[]},{code:412,indent:0,parameters:[]},{code:999,indent:0,parameters:[]},{code:0,indent:0,parameters:[]}]);
 assert.equal(h.map._interpreter._waitMode,'message');assert(!h.G.$gamePlayer.canMove());assert.equal(after,0);h.tick(0);assert.equal(h.choice.index(),1);h.tick(0,'ok');assert.equal(h.result(),1);assert.equal(taken,1);assert.equal(after,1);assert(h.G.$gamePlayer.canMove());assert.equal(h.refreshCount(),1);assert.deepEqual(h.writes,[]);
});
for(const cancel of [2,1,9,-1,-7,0])test('cancel encoding '+cancel+' and same-round BACK/USE priority',()=>{
 const h=choicesHost();h.show({cancel});h.tick(0,'cancel','ok');assert.equal(h.result(),cancel>0?cancel-1:cancel<0?cancel:0);assert(!h.G.$gameMessage.isBusy());assert.deepEqual(h.sounds,[cancel===0?'ok':'cancel']);assert(h.calls.input>=2&&h.calls.touch>=2);
});
test('BACK=0 alone stays busy; direction is applied before same-round USE or BACK',()=>{
 const h=choicesHost();h.show();h.tick(0,'cancel');assert(h.G.$gameMessage.isBusy());h.tick(0,'down','ok','cancel');assert.equal(h.result(),1);assert(!h.G.$gameMessage.isBusy());
 const c=choicesHost();c.show({cancel:-3});c.tick(0,'down','ok','cancel');assert.equal(c.choice.index(),1);assert.equal(c.result(),-3);
});
test('help is initialized at default, tracks cursor before exit, and is hidden/restored on native clear',()=>{
 const h=choicesHost();h.show({initial:1,helpZh:['帮助甲','帮助乙'],cancel:-1});assert.equal(h.help()._text,'帮助乙');h.tick(0,'up');assert.equal(h.choice.index(),0);assert.equal(h.help()._text,'帮助甲');
 const seen=[];const set=h.G.$gameVariables.setValue;h.G.$gameVariables.setValue=function(id,value){seen.push(h.help()._text);set.call(this,id,value);};h.tick(0,'down','ok','cancel');assert.deepEqual(seen,['帮助乙']);assert.equal(h.result(),-1);assert.equal(h.help().visible,false);assert.equal(h.choice._helpWindow,null);
 h.show({helpZh:['再次甲','再次乙']});assert.equal(h.windowsAdded.length,1);assert.equal(h.help()._text,'再次甲');h.tick(0,'ok');h.show();assert.equal(h.help().visible,false);
});
test('nil ordinary choices return 0 immediately; [] opens/waits, ignores direction, USE returns 0',()=>{
 const h=choicesHost();h.show({zh:null});assert.equal(h.result(),0);assert(!h.map._interpreter.isRunning());assert(!h.choice.active);assert(!h.G.$gameMessage.isBusy());assert.equal(h.windowsAdded.length,0);
 h.show({zh:[]});assert(h.choice.active&&h.G.$gameMessage.isBusy());h.tick(0,'down');assert.equal(h.choice.index(),0);assert(h.G.$gameMessage.isBusy());h.tick(0,'ok');assert.equal(h.result(),0);assert(!h.G.$gameMessage.isBusy());
 for(const cancel of [2,-4]){h.show({zh:[],cancel});h.tick(0,'cancel');assert.equal(h.result(),cancel>0?cancel-1:cancel);}
});
test('native trigger/repeat edge wrapping, page navigation and missing/empty help entry',()=>{
 const h=choicesHost();h.show({initial:1,helpZh:['only first']});h.G.Input.isRepeated=k=>h.keys.has(k)||h.keys.has('repeat:'+k);h.tick(0,'repeat:down');assert.equal(h.choice.index(),1);h.tick(0,'down');assert.equal(h.choice.index(),0);assert.equal(h.help()._text,'only first');h.tick(0,'down');assert.equal(h.help()._text,'');h.tick(0,'ok');
 h.show({zh:Array.from({length:30},(_,i)=>'Item '+i)});h.tick(0,'pagedown');assert(h.choice.index()>0);h.tick(0,'ok');assert(h.result()>0);
});
test('ordinary/serious confirmations use one entry and explicit Yes position; BACK always maps to No',()=>{
 for(const serious of [false,true]){const h=choicesHost('en'),en=serious?['No','Yes']:['Yes','No'],cancel=serious?1:2;h.show({en,cancel});h.tick(0,'ok');assert.equal(h.result(),0);assert.equal(en[h.result()],serious?'No':'Yes');h.show({en,cancel});h.tick(0,'cancel');assert.equal(en[h.result()],'No');}
});
test('busy choice command waits without overwriting, other interpreter ordinary command still runs',()=>{
 const h=choicesHost();h.show({helpZh:['first','second']});const other=new h.G.Game_Interpreter();let calls=0;other.command999=()=>{calls++;return true;};other.setup([{code:999,indent:0,parameters:[]},h.command({zh:['later']})],12);other.update();assert.equal(calls,1);assert.equal(other._index,1);assert.equal(h.choice.maxItems(),2);h.tick(0,'ok');other.update();assert.equal(other._waitMode,'message');h.tick(0);assert.equal(h.choice.maxItems(),1);h.tick(0,'ok');other.update();assert(!other.isRunning());
});
test('literal labels/help retain slash controls and HTML text without executing them',()=>{
 const h=choicesHost(),label='Name\\V[1]\\C[2]<b>😀';h.show({zh:[label],helpZh:[label]});assert(h.text().includes(label));assert.equal(h.help()._text,'Name\\\\V[1]\\\\C[2]<b>😀');h.tick(0,'ok');
});
test('unowned native MZ choices retain native branch coding and confirm-first; WP17-B clears ownership',()=>{
 const h=choicesHost();h.show({cancel:-1,helpZh:['A','B']});h.tick(0,'cancel');let branch=0;h.G.Game_Interpreter.prototype.command998=()=>{branch++;return true;};
 h.enter(vm.runInContext('('+JSON.stringify([{code:102,indent:0,parameters:[['native A','native B'],-2,0,2,0]},{code:402,indent:0,parameters:[0,'native A']},{code:998,indent:1,parameters:[]},{code:402,indent:0,parameters:[1,'native B']},{code:403,indent:0,parameters:[]},{code:404,indent:0,parameters:[]},{code:0,indent:0,parameters:[]}])+')',h.G));h.tick(0);h.tick(0,'ok','cancel');assert.equal(branch,1);assert.equal(h.map._interpreter._branch[0],0);assert.equal(h.help().visible,false);assert(!h.G.$gameMessage.isBusy());
});
test('invalid author arrays/default/result variable fail before taking ownership or changing variables',()=>{
 for(const [field,value] of [['choicesZh','{}'],['choicesZh','[1]'],['defaultIndex','2'],['resultVariableId','0'],['cancelValue','1.5']]){const h=choicesHost(),command=h.command();command.parameters[3][field]=value;assert.throws(()=>h.enter([command,{code:0,indent:0,parameters:[]}]),/ShowChoices/);assert(!h.G.$gameMessage.isBusy());assert.equal(h.refreshCount(),0);}
});
for(const lang of ['zh','en'])for(const exit of ['a','b','cancel'])test(lang+' shipped Map005 event 12 reaches actual result branches for '+exit+', balloon and movement',()=>{
 const h=choicesHost(lang),event=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Map005.json'),'utf8')).events[12],before=JSON.stringify(h.state);assert.equal(event.pages[0].trigger,0);assert.equal(event.x,12);assert.equal(event.y,10);
 h.enter(event.pages[0].list);let choices=0;for(let n=0;n<2000&&h.map._interpreter.isRunning();n++){
  if(h.choice.active){choices++;if(choices===1)h.tick(25,'ok');else if(exit==='cancel')h.tick(25,'cancel');else if(exit==='b')h.tick(25,'down','ok');else h.tick(25,'ok');}
  else if(h.win.pause)h.tick(25,'ok');else h.tick(25);if(h.balloon)h.releaseBalloon();
 }
 assert.equal(choices,2);assert(!h.map._interpreter.isRunning());assert(h.G.$gamePlayer.canMove());assert.equal(h.G.$gameVariables.value(10),exit==='a'?0:exit==='b'?1:-1);assert(h.text().includes(lang==='zh'?'普通选项：选择或取消到乙':'Ordinary choice: B or BACK'));
 assert(h.text().includes(lang==='zh'?'帮助选项结果：'+(exit==='a'?'甲':exit==='b'?'乙':'取消'):'Help choice result: '+(exit==='a'?'A':exit==='b'?'B':'BACK')));assert.equal(JSON.stringify(h.state),before);assert.deepEqual(h.writes,[]);
});
for(const lang of ['zh','en'])for(const [width,height] of [[512,384],[640,480],[816,624]])for(const touch of [false,true])test(lang+' '+width+'×'+height+' touch='+touch+' adaptive list/help/button bounds and exits',()=>{
 const h=choicesHost(lang,width,height,touch);h.show({zh:['中文'.repeat(50),'乙'],en:['English'.repeat(30),'B'],helpZh:['说明','帮助'],helpEn:['First help','Second help'],cancel:-1});
 const w=h.choice,help=h.help();assert.equal(w.itemHeight(),44);assert(w.x>=0&&w.y>=0&&w.x+w.width<=width&&w.y+w.height<=help.y);assert(help.y>=0&&help.y+help.height<=height);assert.equal(help.width,width);assert.equal(help._text,lang==='zh'?'说明':'First help');
 if(touch){const b=w._cancelButton;w.updateCancelButton();assert.equal(b.width,96);assert.equal(b.height,48);assert(b.visible);assert(w.x+b.x>=0&&w.x+b.x+b.width<=width);assert(w.y+b.y>=0&&w.y+b.y+b.height<=help.y);b.onClick();assert.equal(h.G.Input._virtualKey,'cancel');}
 h.tick(0,'down');assert.equal(help._text,lang==='zh'?'帮助':'Second help');h.tick(0,'ok');assert.equal(h.result(),1);assert(!help.visible);
});
