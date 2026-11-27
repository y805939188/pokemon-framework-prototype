'use strict';
const {diagnosticStage}=require('../authoring/author-diagnostic-stage.cjs');
const authorRows=lang=>rowHost(lang,816,624,false,G=>diagnosticStage(G));
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {rowHost,rowGeometry}=require('./message-rows-host.cjs');
const {choicesHost}=require('./choices-host.cjs');
const {ROOT}=require('./message-host.cjs');
const end={code:0,indent:0,parameters:[]};
function finish(h,key='ok'){h.until(()=>h.win.pause&&!h.win._textState&&h.win._waitCount===0);h.tick(0,key);}
for(const confirm of ['ok','cancel'])test('two authored rows pause before C; '+confirm+' resumes, finishes and releases the real event/map gate',()=>{
 const h=rowHost(),original=h.win.height,before=JSON.stringify(h.state),i=h.show('\\l[2]A\nB\nC');
 h.until(()=>h.win.pause);assert.equal(h.text(),'AB');assert(h.win._textState);assert.equal(h.win.contents.height,h.win.lineHeight()*2);assert.equal(h.win.y,624-h.win.height);
 assert.equal(i._waitMode,'message');assert(!h.G.$gamePlayer.canMove());h.tick(0,confirm);assert.equal(h.text(),'AB');h.until(()=>h.win.pause&&!h.win._textState);assert.equal(h.text(),'ABC');assert(i.isRunning());
 h.tick(0,confirm);assert(!h.G.$gameMessage.isBusy());assert(!i.isRunning());assert(h.G.$gamePlayer.canMove());assert.equal(h.win.height,original);assert.equal(JSON.stringify(h.state),before);assert.deepEqual(h.writes,[]);
});
for(const lang of ['zh','en'])for(const [width,height] of [[512,384],[640,480],[816,624]])for(const position of [0,1,2])test(lang+' '+width+'×'+height+' position '+position+' uses native row height and placement',()=>{
 const h=rowHost(lang,width,height),original=h.win.height;
 h.show('\\l[2]中\n文\n末','\\l[2]A\nB\nC',String(position));h.until(()=>h.win.pause);
 assert.equal(h.text(),lang==='zh'?'中文':'AB');assert.equal(h.win.height,96);assert.equal(h.win.contents.height,72);assert.equal(h.win.y,position*(height-96)/2);
 h.tick(0,'cancel');finish(h,'cancel');assert.equal(h.win.height,original);assert.deepEqual(h.writes,[]);
});
for(const rows of [1,2,3])test(rows+' rows admit exactly that many ordinary lines before the native page pause',()=>{
 const h=rowHost(),lines=['A','B','C','D'].slice(0,rows+1);h.show('\\l['+rows+']'+lines.join('\n'));h.until(()=>h.win.pause);
 assert.equal(h.text(),lines.slice(0,rows).join(''));assert(h.win._textState);assert.equal(h.win.contents.height,36*rows);
 h.tick(0,'ok');finish(h);assert.equal(h.text(),lines.join(''));
});
for(const separator of ['\n','\\n','<br>'])test('ordinary line separator '+JSON.stringify(separator)+' shares row capacity without rewriting source again',()=>{
 const h=rowHost();h.show('A\\l[2]'+separator+'B'+separator+'C');h.until(()=>h.win.pause);assert.equal(h.text(),'AB');h.tick(0,'ok');finish(h);assert.equal(h.text(),'ABC');
});
test('explicit native form-feed pauses early and starts a new page within the requested layout',()=>{
 const h=rowHost();h.show('\\l[3]A\fB');h.until(()=>h.win.pause);assert.equal(h.text(),'A');assert.equal(h.win.height,132);h.tick(0,'cancel');finish(h);assert.equal(h.text(),'AB');
});
test('escaped author text, uppercase spelling and identical variable/player values remain literal',()=>{
 const h=rowHost(),original=h.win.height;h.G.$gameVariables.value=()=> '\\l[1]';h.G.PSFlow.game=()=>({player:{name:'\\l[1]'},money:0});
 h.show('\\ts[]\\\\l[1]/\\L[2]/\\v[1]/\\pn');h.tick(0);assert.equal(h.text(),'\\l[1]/\\L[2]/\\l[1]/\\l[1]');assert.equal(h.win.height,original);assert.equal(h.counts.created,2);h.tick(0,'ok');
});
for(const lang of ['zh','en'])test(lang+' invalid syntax and over-screen rows fail before message admission with the existing safe author diagnostic',()=>{
 for(const text of ['\\l[]','\\l[0]','\\l[-1]','\\l[1.5]','\\l[ 2]','\\l[NaN]','\\l[9007199254740992]','\\l[2','\\l[2]\\l[3]','\\l[100]MACHINE_SECRET']){
  const h=authorRows(lang),original=h.win.height,diagnostics=[];h.G.console={error:(...v)=>diagnostics.push(v)};
  assert.throws(()=>h.show(text),e=>{assert.match(e.message,/WP07-EVENT/);assert(!e.stack.includes('MACHINE_SECRET'));return true;});
  assert(!h.G.$gameMessage.isBusy());assert.equal(h.map._interpreter._waitMode,'');assert.equal(h.win.height,original);assert.equal(h.counts.created,2);assert.equal(diagnostics.length,1);assert.equal(diagnostics[0][1].field,(lang==='zh'?'textZh':'textEn')+'.l');assert(!JSON.stringify(diagnostics).includes('MACHINE_SECRET'));assert.deepEqual(h.writes,[]);
 }
});
for(const height of [384,480,624])test('viewport '+height+' accepts the last fitting row and rejects the first over-screen row',()=>{
 const h=rowHost('zh',512,height),rows=Math.floor((height-24)/36);h.show('\\l['+rows+']A');h.tick(0);assert.equal(h.win.height,rows*36+24);assert(h.win.height<=height);finish(h);
 assert.throws(()=>h.show('\\l['+(rows+1)+']A'),/WP07-EVENT/);assert(!h.G.$gameMessage.isBusy());
});
test('missing production message window fails through the safe host diagnostic before admission',()=>{
 const h=authorRows('zh'),diagnostics=[];h.G.console={error:(...v)=>diagnostics.push(v)};delete h.G.SceneManager._scene._messageWindow;
 assert.throws(()=>h.show('\\l[2]A'),/WP07-HOST/);assert(!h.G.$gameMessage.isBusy());assert.equal(h.counts.created,2);assert.equal(diagnostics.length,1);assert.equal(diagnostics[0][1].field,null);
});
for(const forcedFlag of [false,true])test('ordinary row-parameter error hides author context even with test flag='+forcedFlag,()=>{
 const h=rowHost(),diagnostics=[];h.G.Utils.isOptionValid=key=>forcedFlag&&key==='test';h.G.console={error:(...v)=>diagnostics.push(v)};
 assert.throws(()=>h.show('\\l[PRIVATE_PATH]'),e=>{assert.match(e.message,/WP07-EVENT/);assert(!e.stack.includes('PRIVATE_PATH'));return true;});assert.deepEqual(diagnostics,[]);assert(!h.G.$gameMessage.isBusy());
});
test('typing, timed waiting, repeated keys and native page clearing allocate only on layout entry/exit',()=>{
 const h=rowHost();h.show('\\l[2]<b>A\\wt[2]B\nC\nD</b>');h.tick(0);assert.equal(h.counts.created,4);
 for(let n=0;n<8;n++)h.tick(0,'ok');assert.equal(h.text(),'A');assert.equal(h.counts.created,4);
 h.until(()=>h.win.pause);assert.equal(h.text(),'ABC');const bitmap=h.win.contents;for(let n=0;n<8;n++)h.tick(0);assert.equal(h.win.contents,bitmap);assert.equal(h.counts.created,4);
 h.tick(0,'cancel');finish(h);assert.equal(h.text(),'ABCD');assert(h.draws.every(d=>d.bold));assert.equal(h.win.contents.fontBold,false);assert.equal(h.counts.created,6);assert.equal(h.counts.destroyed,4);
});
test('closing animation retains its final page and restores layout once fully closed',()=>{
 const h=rowHost('zh',816,624,true),original=h.win.height;h.show('\\l[2]AB');h.until(()=>h.win.pause&&!h.win._textState);const bitmap=h.win.contents;
 h.tick(0,'ok');assert(h.win.isClosing());assert.equal(h.win.height,96);assert.equal(h.win.contents,bitmap);assert.equal(h.counts.created,4);
 h.tick();assert.equal(h.win.contents,bitmap);assert.equal(bitmap.visible.map(d=>d.text).join(''),'AB');assert.equal(h.win.height,96);
 h.until(()=>h.win.isClosed());assert.equal(h.win.height,original);assert.equal(h.counts.created,6);assert.equal(h.counts.destroyed,4);
});
test('a new ordinary native message during closing restores four-row geometry before it renders',()=>{
 const h=rowHost('zh',816,624,true),original=h.win.height;h.show('\\l[1]A');finish(h);assert(h.win.isClosing());
 h.enter([{code:101,indent:0,parameters:['',0,0,2,'']},{code:401,indent:0,parameters:['B\nC\nD\nE\nF']},end]);h.tick(0);h.tick(0,'ok');
 assert.equal(h.win.height,original);assert.equal(h.text(),'ABCDE');assert(h.win.pause&&h.win._textState);h.until(()=>h.win._waitCount===0);h.tick(0,'ok');finish(h);assert.equal(h.text(),'ABCDEF');assert.equal(h.counts.created,6);
});
test('adjacent scoped messages resize directly and the following untagged ShowMessage restores the original layout',()=>{
 const h=rowHost('zh',816,624,true),original=h.win.height;h.enter([h.command('\\l[2]A'),h.command('\\l[3]B'),h.command('\\ts[]C\nD\nE\nF\nG'),end]);
 h.until(()=>h.win.pause&&!h.win._textState);h.tick(0,'ok');h.until(()=>h.win.pause&&!h.win._textState);assert.equal(h.win.height,132);assert.equal(h.counts.created,6);h.tick(0,'ok');h.until(()=>h.win.pause);
 assert.equal(h.win.height,original);assert.equal(h.text(),'ABCDEF');assert.equal(h.counts.created,8);h.tick(0,'cancel');finish(h);assert.equal(h.text(),'ABCDEFG');assert(h.G.$gamePlayer.canMove());
});
test('automatic ending releases the same row layout without a confirmation',()=>{
 const h=rowHost(),original=h.win.height;h.show('\\l[1]\\ts[]A\\^');h.tick(0);assert.equal(h.text(),'A');assert(!h.G.$gameMessage.isBusy());assert(h.G.$gamePlayer.canMove());assert.equal(h.win.height,original);assert.equal(h.counts.created,6);
});
test('row-sized body finishes before the real inline choice opens, aligns, writes once and releases its interpreter',()=>{
 const h=choicesHost('zh',816,624,false,rowGeometry),original=h.win.height;h.enter([{code:357,indent:0,parameters:['PS_Management','ShowMessage','Message',{textZh:'\\l[2]A\nB\nC\\ch[13,0,Yes,No]',textEn:'unused',position:'2'}]},end]);
 h.until(()=>h.win.pause);assert.equal(h.text(),'AB');assert(!h.choice.active);h.tick(0,'ok');h.until(()=>h.choice.active);assert(h.text().startsWith('ABC'));assert.equal(h.win.height,96);assert(h.choice.y<h.win.y);assert(!h.G.$gamePlayer.canMove());
 h.tick(0,'ok');assert.equal(h.G.$gameVariables.value(13),0);assert.equal(h.refreshCount(),1);assert.equal(h.win.height,original);assert(!h.G.$gameMessage.isBusy());assert(h.G.$gamePlayer.canMove());assert.deepEqual(h.writes,[]);
});
for(const lang of ['zh','en'])for(const [width,height] of [[512,384],[640,480],[816,624]])test(lang+' '+width+'×'+height+' shipped ordinary Map005 event 17 paginates then reaches the following message, balloon and movement',()=>{
 const h=rowHost(lang,width,height),original=h.win.height,before=JSON.stringify(h.state),event=JSON.parse(fs.readFileSync(path.join(ROOT,'data/Map005.json'),'utf8')).events[17];assert.equal(event.pages[0].trigger,0);const i=h.enter(event.pages[0].list,17);assert.equal(i._eventId,17);let confirmations=0;const seen=new Set();
 for(let n=0;n<2000&&i.isRunning();n++){seen.add(h.win.height);if(h.win.pause){confirmations++;h.tick(25,'cancel');}else h.tick(25);if(h.balloon)h.releaseBalloon();}
 h.map.updateInterpreter();assert(!i.isRunning());assert(h.G.$gamePlayer.canMove());assert(confirmations>=5);assert(seen.has(96)&&seen.has(132)&&seen.has(original));assert(h.text().includes(lang==='zh'?'窗口已恢复':'Window restored'));assert.equal(JSON.stringify(h.state),before);assert.deepEqual(h.writes,[]);
});
