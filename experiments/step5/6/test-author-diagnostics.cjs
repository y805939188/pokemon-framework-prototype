'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {choicesHost,ROOT}=require('./choices-host.cjs');
const {numberHost}=require('./number-host.cjs');
const {textHost}=require('./text-host.cjs');
const end={code:0,indent:0,parameters:[]};
function capture(h,author=true){const logs=[],display=[];h.G.Utils.isOptionValid=key=>author&&key==='test';h.G.console={error:(...a)=>logs.push(a),warn:(...a)=>logs.push(a),log(){}};
 const source=fs.readFileSync(ROOT+'/js/reactor_managers.js','utf8');
 for(const name of ['SceneManager.catchException','SceneManager.catchNormalError']){const a=source.indexOf(name+' = function'),b=source.indexOf('\n};',a);vm.runInContext(source.slice(a,b+3),h.G);}
 h.G.Graphics.printError=(name,message,error)=>display.push({name,message,stack:error.stack});h.G.AudioManager={stopAll(){}};h.G.SceneManager.stop=()=>{};
 return {logs,display,fail(run){let error;try{run();}catch(e){error=e;}assert(error,'failure must propagate to the real host');h.G.SceneManager.catchException(error);return error;}};
}
for(const [name,make,edit,field] of [
 ['choices JSON',choicesHost,c=>c.parameters[3].choicesZh='["secret-token /Users/private/game"] broken','choicesZh'],
 ['choices index',choicesHost,c=>c.parameters[3].defaultIndex='9','defaultIndex'],
 ['number JSON',numberHost,c=>c.parameters[3].settings='["secret-token /Users/private/game"] broken','settings'],
 ['number nested JSON',numberHost,c=>c.parameters[3].settings='["secret-token /Users/private/game"]','settings[0]'],
 ['number digits',numberHost,c=>c.parameters[3].settings='[{"operation":"digits","value":16}]','settings[0].value'],
 ['text limit',textHost,c=>c.parameters[3].maxLength='33','maxLength'],
])test(name+' identifies the actual map event command without exposing input',()=>{
 const h=make(),c=h.command();edit(c);const x=capture(h);const list=[{code:230,indent:0,parameters:[0]},c,end];h.G.$dataMap={events:[]};h.G.$dataMap.events[11]={pages:[{list:[]},{list}]};
 x.fail(()=>h.enter(list));const author=x.logs.find(a=>a[0]==='PS_Management author command');assert(author,'author report is not silent');
 const d=author[1];assert.equal(d.command,c.parameters[1]);assert.equal(d.field,field);assert.equal(d.mapId,5);assert.equal(d.eventId,11);assert.equal(d.page,2);assert.equal(d.commandNumber,2);assert.equal(d.commonEventId,null);assert(d.hint);
 assert(!/secret-token|\/Users\/|SyntaxError|\bat .*\.js/.test(JSON.stringify(x.logs)+JSON.stringify(x.display)));
 assert.match(x.display[0].message,/WP07-EVENT/);assert(!h.G.$gameMessage.isBusy());assert.equal(h.refreshCount?.()??0,0);assert.deepEqual(h.writes,[]);
});
test('ordinary runtime gets a safe error through the actual SceneManager consumer',()=>{const h=choicesHost(),x=capture(h,false),c=h.command();c.parameters[3].choicesZh='["secret-token /Users/private/game"] broken';x.fail(()=>h.enter([c,end]));assert.equal(x.logs.length,1,'only the host prints the sanitized error');assert.match(x.display[0].message,/WP07-EVENT/);assert(!/secret-token|\/Users\/|choicesZh|mapId|SyntaxError/.test(JSON.stringify(x.display)+JSON.stringify(x.logs)));});
test('common event source comes from list identity, not an inherited map event ID',()=>{const h=choicesHost(),x=capture(h),c=h.command();c.parameters[3].defaultIndex='9';const list=[c,end];h.G.$dataCommonEvents=[null,{id:1,list}];x.fail(()=>h.enter(list));const d=x.logs.find(a=>a[0]==='PS_Management author command')[1];assert.equal(d.commonEventId,1);assert.equal(d.page,null);});
test('corrected event succeeds; idle host updates do no diagnostic/source work',()=>{const h=choicesHost(),x=capture(h),c=h.command();let reads=0;Object.defineProperty(h.G,'$dataMap',{get(){reads++;throw Error('source lookup on success');}});Object.defineProperty(h.G,'$dataCommonEvents',{get(){reads++;throw Error('source lookup on success');}});h.G.Utils.isOptionValid=()=>{throw Error('diagnostic mode read on success');};h.enter([c,end]);h.tick(0);for(let i=0;i<8;i++)h.tick(25);h.tick(0,'ok');h.until(()=>!h.map._interpreter.isRunning());assert.equal(h.result(),0);assert.equal(reads,0);assert.deepEqual(x.logs,[]);assert.deepEqual(h.writes,[]);});

test('unexpected host failure is located without copying its exception, stack or values',()=>{const h=choicesHost(),x=capture(h),c=h.command();h.G.$gameMessage.setChoices=()=>{throw Error('credential=secret-token /Users/private/game');};x.fail(()=>h.enter([c,end]));const d=x.logs.find(a=>a[0]==='PS_Management author command')[1];assert.equal(d.field,null);assert(d.hint.includes('host'));assert.match(x.display[0].message,/WP07-HOST/);assert(!/credential|secret-token|\/Users\//.test(JSON.stringify(x.logs)+JSON.stringify(x.display)));});
test('script/direct caller reports unknown source rather than inventing a map page',()=>{const h=choicesHost(),x=capture(h),c=h.command();c.parameters[3].resultVariableId='0';const self={setWaitMode(){}};x.fail(()=>h.G.PluginManager.callCommand(self,'PS_Management','ShowChoices',c.parameters[3]));const d=x.logs.find(a=>a[0]==='PS_Management author command')[1];for(const key of ['mapId','eventId','page','commonEventId','commandNumber'])assert.equal(d[key],null);});
