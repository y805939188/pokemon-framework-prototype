'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {ordinaryCurrentFixture,flush}=require('./companion-fixture.cjs');
const nativeManagers=fs.readFileSync(process.env.PF_E3_NATIVE_ROOT+'/js/reactor_managers.js','utf8');
function nativeCommands(n){
 const G=n.G;G.PluginManager._commands={};
 for(const name of ['PluginManager.registerCommand','PluginManager.callCommand']){
  const start=nativeManagers.indexOf(name+' = function'),end=nativeManagers.indexOf('\n};',start);assert(start>=0&&end>start,name);
  vm.runInContext(nativeManagers.slice(start,end+4),G,{filename:'pinned-Reactor:'+name});
 }
}
async function command(h,args){const I=new h.G.Game_Interpreter();I.setup([{code:357,indent:0,parameters:['PS_World','RegisterEventCompanion','Register',args]},{code:0,indent:0,parameters:[]}],0);assert.equal(I.executeCommand(),true);for(let n=0;n<100;n++){await flush();if(!I.updateWaitMode())return I._psWorldAuthorOutcome;h.tick();}throw Error('bounded actual RegisterEventCompanion wait');}
test('current actual357 same-name companions preserve distinct origins and duplicate registration stable identity',async t=>{
 const h=await ordinaryCurrentFixture(t,'CURRENT',{nativeSetup:nativeCommands}),prefix=h.draws.slice();assert.equal(typeof h.G.PluginManager.callCommand,'function');assert.equal(typeof h.G.PluginManager._commands['PS_World:RegisterEventCompanion'],'function','production World registered into the actual native dispatcher');assert.equal((await command(h,{eventId:'1',name:'same'})).status,'completed');assert.equal((await command(h,{eventId:'2',name:'same'})).status,'completed');const records=structuredClone(h.records());assert.deepEqual(records.map(c=>[c.originMapId,c.originEventId,c.name]),[[5,1,'same'],[5,2,'same']]);assert.equal((await command(h,{eventId:'1',name:'same'})).status,'duplicate');assert.deepEqual(h.records(),records);assert.equal(h.visual.parent.children.length,2);assert.deepEqual(h.draws,prefix);h.ordinaryEntropy.expect(h.ordinaryEntropy.boot,[]);
});
test('current native F2 passage planning observes the already committed actual F1 position',async t=>{
 let armed=false,observed=0,h;
 h=await ordinaryCurrentFixture(t,'CURRENT',{nativeSetup(n,{maps}){for(const[id,x]of[[1,1],[2,0]]){maps[5].events[id].x=x;maps[5].events[id].y=2;maps[5].events[id].pages[0].through=true;n.G.$gameMap._events[id].locate(x,2);n.G.$gameMap._events[id].setThrough(true);assert.equal(n.G.$gameMap._events[id].isThrough(),true);}n.player.locate(2,2);},beforeCanEnter({args}){if(armed&&args[0].x===1&&args[0].y===2){const first=h.records()[0],native=h.visual.parent.children.find(s=>s._character._x===2&&s._character._y===2);assert.deepEqual(first.location,{mapId:5,x:2,y:2,direction:6});assert(native,'F1 actual native location exists before F2 passage read');observed++;}}});
 for(const eventId of[1,2])assert.equal((await h.settle(h.app.beginEventCompanion({kind:'register',eventId}).result)).status,'completed');h.ordinaryEntropy.expect(h.ordinaryEntropy.boot,[]);const before=h.state().steps,prefix=h.draws.slice();armed=true;h.G.Input.dir4=6;h.tick();h.G.Input.dir4=0;await h.pump(()=>!h.player.isMoving()&&!h.G.PSWorld.pending()&&!h.G.PSFlow.companionNativePending()&&!h.app.saveBlocked);assert(observed>0);assert.deepEqual(h.records().map(c=>[c.location.x,c.location.y]),[[2,2],[1,2]]);assert.equal(h.state().steps,before+1);assert.deepEqual(h.draws.slice(prefix.length),[100]);h.ordinaryEntropy.expect(h.ordinaryEntropy.boot,[['ordinary-encounter',5]]);
});
