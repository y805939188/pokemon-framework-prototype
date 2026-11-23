'use strict';
// Installed Reactor method bodies, production PS_Management bundle; bitmap, sound and devices are controlled.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'../../..');
const {host}=require('./message-host.cjs');

function speedHost(setting){
 const h=host('zh',816,624,false,(G,{managers})=>{
  G.AudioManager={};
  vm.runInContext(managers.slice(managers.indexOf('function ConfigManager()'),managers.indexOf('function StorageManager()')),G);
  G.ConfigManager.readVolume=()=>100;
 });
 h.G.ConfigManager.applyData(setting);return h;
}
for(const [setting,delay] of [[{psTextSpeed:0},50],[{},25],[{psTextSpeed:1},25],[{psTextSpeed:2},12.5],[{psTextSpeed:'3'},25]])test('WP17 ShowMessage reads device speed '+JSON.stringify(setting)+' at message start',()=>{
 const h=speedHost(setting);h.show('A😀BC');h.tick(0);assert.equal(h.text(),'A');
 h.tick(delay-.5,'ok');assert.equal(h.text(),'A');assert.equal(h.win._showFast,false);
 h.tick(.5);assert.equal(h.text(),'A😀');h.G.ConfigManager.applyData({psTextSpeed:3});
 h.tick(delay-.5,'cancel');assert.equal(h.text(),'A😀');h.tick(.5);assert.equal(h.text(),'A😀B');
 h.tick(delay);assert.equal(h.text(),'A😀BC');assert(h.win.pause);
 h.tick(0,'ok');h.show('NEXT');h.tick(0);assert.equal(h.text(),'A😀BCNEXT');assert(h.win.pause);assert.deepEqual(h.writes,[]);
});
test('WP17 instant preference still obeys author speed override, wait, pause and final confirm; native text is unchanged',()=>{
 const h=speedHost({psTextSpeed:3});h.show('AB\\!C\\wt[2]D\\ts[4]EF');h.tick(0);assert.equal(h.text(),'AB');assert(h.win.pause);
 h.tick(0,'cancel');assert.equal(h.text(),'AB');h.tick(0);assert.equal(h.text(),'ABC');
 h.tick(99,'ok');assert.equal(h.text(),'ABC');h.tick(1);assert.equal(h.text(),'ABCDE');h.tick(49.5,'ok');assert.equal(h.text(),'ABCDE');
 h.tick(.5);assert.equal(h.text(),'ABCDEF');assert(h.win.pause);h.tick(0,'ok');
 h.enter([{code:101,indent:0,parameters:['',0,0,2,'']},{code:401,indent:0,parameters:['Native text']},{code:0,indent:0,parameters:[]}]);
 h.tick(0);assert.equal(h.text(),'ABCDEFN');h.tick(0,'ok');assert.equal(h.text(),'ABCDEFNative text');assert.equal(h.win._showFast,true);assert.deepEqual(h.writes,[]);
});

test('actual event → native interpreter wait → production typing, confirm, next command and map movement',()=>{
 const h=host(),i=h.show('AB\\!CD');assert.equal(i._waitMode,'message');assert(!h.G.$gamePlayer.canMove());h.tick(0);assert.equal(h.text(),'A');
 h.tick(0,'ok');assert.equal(h.text(),'A');assert.equal(h.win._showFast,false);h.tick(25,'cancel');assert.equal(h.text(),'AB');h.tick(25);assert(h.win.pause&&h.win._textState);
 h.tick(0,'ok');assert(!h.win.pause);assert.equal(h.text(),'AB');assert(i.isRunning());h.tick(0);assert.equal(h.text(),'ABC');h.until(()=>h.win.pause&&!h.win._textState);assert.equal(h.text(),'ABCD');assert(i.isRunning());
 h.tick(0,'cancel');assert(!h.G.$gameMessage.isBusy());assert(!i.isRunning());assert(h.G.$gamePlayer.canMove());assert.deepEqual(h.sounds,['ok','ok']);assert(h.calls.input>=3&&h.calls.touch===1);assert.deepEqual(h.writes,[]);
});
test('wall-clock text delay and waits: early USE/BACK never bypass delay or timed guard',()=>{
 const h=host();h.show('A\\.B\\|C\\wt[3]D');h.tick(0);h.tick(25);assert.equal(h.text(),'A');
 h.tick(249,'ok');assert.equal(h.text(),'A');h.tick(1);assert.equal(h.text(),'AB');h.tick(25);h.tick(999,'cancel');assert.equal(h.text(),'AB');h.tick(1);assert.equal(h.text(),'ABC');h.tick(25);h.tick(149,'ok');assert.equal(h.text(),'ABC');h.tick(1);assert.equal(h.text(),'ABCD');assert(h.win.pause);
});
test('speed tag N/80 seconds, empty speed immediate, Unicode pair and automatic endings',()=>{
 const h=host();h.show('\\ts[4]A😀B');h.tick(0);assert.equal(h.text(),'A');h.tick(49,'ok');assert.equal(h.text(),'A');h.tick(1);assert.equal(h.text(),'A😀');h.tick(50);assert.equal(h.text(),'A😀B');h.tick(0,'ok');
 h.show('\\ts[]instant\\^');h.tick(0);assert.equal(h.text(),'A😀Binstant');assert(!h.G.$gameMessage.isBusy());
 h.show('A\\wtnp[2]B');h.tick(0);h.tick(25);h.tick(99,'cancel');assert(h.G.$gameMessage.isBusy());h.tick(1);assert(h.text().endsWith('AB'));assert(!h.G.$gameMessage.isBusy());assert(h.G.$gamePlayer.canMove());
});
test('typing follows elapsed time across late host updates; timed waits and pauses start a fresh text cadence',()=>{
 const h=host();h.show('ABCDEFGHIJ\\!KLMN');h.tick(0);h.tick(100);assert.equal(h.text(),'ABCDE');h.tick(125);assert.equal(h.text(),'ABCDEFGHIJ');h.tick(25);assert(h.win.pause);h.tick(1000,'ok');h.tick(0);assert.equal(h.text(),'ABCDEFGHIJK');h.tick(25);assert.equal(h.text(),'ABCDEFGHIJKL');
});
test('native opening animation finishes before the first character starts its elapsed-time cadence',()=>{
 const h=host('zh',816,624,true);h.show('ABCDEFGHIJKLM');h.tick(0);assert(h.win.isOpening());assert.equal(h.text(),'');
 for(let n=0;n<7;n++){h.tick(25);assert.equal(h.text(),'');}
 h.tick(25);assert(!h.win.isOpening());assert.equal(h.text(),'A');h.tick(25);assert.equal(h.text(),'AB');
});
test('literal values, authored tags, nested bold/italic restoration, entities, native palette and newline',()=>{
 const h=host();h.show('\\ts[]<b>A<b>B</b>C</b>D<i>E</i>F<br>\\pn/\\pm/\\v[1]/\\v[2]/\\n[1]/\\\\pn/\\c[2]G &lt;&amp;lt;&m;&f;');h.tick(0);
 assert.equal(h.text(),'ABCDEF小明\\!<b>/1,234,567/42/\\C[2]<i>/Actor1\\!/\\pn/G <&lt;♂♀');
 const chars=h.draws.flatMap(d=>Array.from(d.text).map(c=>({...d,c})));for(const c of 'ABC')assert(chars.find(d=>d.c===c).bold);for(const c of 'DF')assert(!chars.find(d=>d.c===c).bold);assert(chars.find(d=>d.c==='E').italic);assert(!chars.find(d=>d.c==='F').italic);assert(chars.find(d=>d.c==='G').color==='palette2');assert(h.draws.some(d=>d.y>0));
});
test('WP17 pause alias, unsupported vocabulary remains visible and empty translation still waits',()=>{
 const h=host();h.show('A\\1B');h.until(()=>h.win.pause);assert.equal(h.text(),'A');h.tick(0,'cancel');h.until(()=>h.win.pause);assert.equal(h.text(),'AB');h.tick(0,'ok');
 h.show('\\ts[]<u>X</u>\\se[a]');h.tick(0);assert(h.text().endsWith('<u>X</u>\\se[a]'));h.tick(0,'ok');
 h.show('中文','English');h.until(()=>h.win.pause);h.tick(0,'ok');const e=host('en');e.show('中文','');e.tick(0);assert.equal(e.text(),'');assert(e.win.pause&&e.G.$gameMessage.isBusy());e.tick(0,'ok');assert(!e.G.$gameMessage.isBusy());
});
test('busy message keeps second event command pending; another interpreter still executes ordinary commands',()=>{
 const h=host();h.show('A');const other=new h.G.Game_Interpreter();let advanced=0;other.command999=()=>{advanced++;return true;};other.setup([{code:999,indent:0,parameters:[]},h.command('B')],99);other.update();assert.equal(advanced,1);assert.equal(other._index,1);assert.equal(h.G.$gameMessage.allText(),'A');
 h.until(()=>h.win.pause);h.tick(0,'ok');other.update();assert.equal(other._index,2);assert.equal(other._waitMode,'message');h.until(()=>h.win.pause);assert(h.text().endsWith('AB'));h.tick(0,'ok');other.update();assert(!other.isRunning());
});
test('native unowned text and business-message literal escaping retain stock fast-forward and methods',()=>{
 const h=host();assert.equal(h.G.Window_Base.prototype.convertEscapeCharacters,h.native.convert);h.enter([{code:101,indent:0,parameters:['',0,0,2,'']},{code:401,indent:0,parameters:['A longer business message']},{code:0,indent:0,parameters:[]}]);h.tick(0);assert.equal(h.text(),'A');h.tick(0,'ok');assert.equal(h.text(),'A longer business message');assert.equal(h.win._showFast,true);
 const native=h.native.convert.call(h.win,'Name: \\\\C[2]');assert.equal(native,'Name: \\C[2]');
});
test('native full-page pause is retained; scoped styles never leak into the next ordinary message',()=>{
 const h=host();h.show('\\ts[]<b>A\nB\nC\nD\nE');h.tick(0);assert(h.win.pause&&h.win._textState);assert(!h.text().includes('E'));h.tick(0,'ok');h.tick(0);assert(h.text().endsWith('E'));h.tick(0,'ok');
 assert.equal(h.win.contents.fontBold,false);assert.equal(h.win.contents.fontItalic,false);
 h.enter([{code:101,indent:0,parameters:['',0,0,2,'']},{code:401,indent:0,parameters:['Native']},{code:0,indent:0,parameters:[]}]);h.tick(0);assert.equal(h.draws.at(-1).bold,false);
});
for(const lang of ['zh','en'])for(const [width,height] of [[512,384],[640,480],[816,624]])test(lang+' '+width+'×'+height+' shipped Map005 event reaches second message, balloon and native movement gate',()=>{
 const h=host(lang,width,height),event=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Map005.json'),'utf8')).events[11],before=JSON.stringify(h.state);assert.equal(event.pages[0].trigger,0);h.enter(event.pages[0].list);let confirmations=0;
 for(let n=0;n<2000&&h.map._interpreter.isRunning();n++){if(h.win.pause){confirmations++;h.tick(25,'ok');}else h.tick(25);if(h.balloon)h.releaseBalloon();}
 h.map.updateInterpreter();assert(!h.map._interpreter.isRunning());assert(h.G.$gamePlayer.canMove());assert(confirmations>=3);assert(h.text().includes(lang==='zh'?'事件继续到了这里':'event continued here'));assert.equal(JSON.stringify(h.state),before);assert.deepEqual(h.writes,[]);
});
