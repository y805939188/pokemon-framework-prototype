'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../../../js/engine/build/production.cjs'),G=E.gateway.BattleGateway;
async function open({species='Gengar',foe='Shuckle',wild=true,noRun=false}={}) {
 const gw=await G.create({formatid:'gen8rpgcustomgame',wild,noRun,seed:[1,2,3,4],players:[
  {name:'P1',team:[{name:'A',species,level:100,moves:['memento'],ability:'Levitate'},{name:'R',species:'Snorlax',level:100,moves:['splash'],ability:'Immunity'}]},
  {name:'P2',team:[{name:'B',species:foe,level:100,moves:['splash'],ability:'Pressure'}]}]});
 assert(await gw.choose('p1','team 12'));assert(await gw.choose('p2','team 1'));gw.drain();return gw;
}
async function faint(gw){assert(await gw.choose('p1','move 1'));assert(await gw.choose('p2','move 1'));gw.drain();assert(gw.readState('p1')[0].fainted);assert(gw.awaitingChoice('p1').forceSwitch[0]);}
const snapshot=gw=>JSON.parse(gw.snapshot());
const runEvents=gw=>gw.drain().flatMap(m=>m.events??[]).filter(e=>e.type==='rpg'&&e.args[0]==='run');
test('replacement escape is unavailable on a living move request and changes no state',async()=>{
 const gw=await open(),before=JSON.stringify(snapshot(gw));assert.equal(await gw.runAfterFaint('p1'),false);assert.equal(JSON.stringify(snapshot(gw)),before);assert.deepEqual(gw.drain(),[]);
});
test('faster fainted actor escapes immediately without incrementing attempts or executing another foe action',async()=>{
 const gw=await open();await faint(gw);const foe=gw.readState('p2'),before=snapshot(gw);assert(await gw.runAfterFaint('p1'));
 const events=runEvents(gw);assert.equal(events.length,1);assert.deepEqual(events[0].args.slice(0,5),['run','p1','ok','256','0']);assert.deepEqual(gw.readState('p2'),foe);assert.equal(snapshot(gw).turn,before.turn);
 assert.equal(snapshot(gw).rpg.outcome.kind,'run');const ended=JSON.stringify(snapshot(gw));assert.equal(await gw.runAfterFaint('p1'),false);assert.equal(JSON.stringify(snapshot(gw)),ended);
});
test('Ghost faint replacement uses the speed calculation, never normal certain-escape, and keeps attempt0',async()=>{
 const gw=await open({foe:'Regieleki'});await faint(gw);const foe=gw.readState('p2');assert(await gw.runAfterFaint('p1'));const [e]=runEvents(gw);
 assert.equal(e.args[0],'run');assert.equal(e.args[1],'p1');assert(['ok','fail'].includes(e.args[2]));assert(Number(e.args[3])>0&&Number(e.args[3])<256);assert.equal(e.args[4],'0');assert.deepEqual(gw.readState('p2'),foe);
 if(e.args[2]==='fail'){assert(gw.awaitingChoice('p1').forceSwitch[0]);assert(await gw.choose('p1','switch 2'));assert.equal(gw.activeId('p1'),'R');}
});
test('noRun replacement keeps the force request and all combat state; no extra turn or PP',async()=>{
 const gw=await open({noRun:true});await faint(gw);const before={p1:gw.readState('p1'),p2:gw.readState('p2'),request:gw.awaitingChoice('p1'),turn:snapshot(gw).turn};
 assert(await gw.runAfterFaint('p1'));assert.deepEqual(runEvents(gw)[0].args,['run','p1','denied','norun']);assert.deepEqual(gw.readState('p1'),before.p1);assert.deepEqual(gw.readState('p2'),before.p2);assert.deepEqual(gw.awaitingChoice('p1'),before.request);assert.equal(snapshot(gw).turn,before.turn);
 assert(await gw.choose('p1','switch 2'));assert.equal(gw.activeId('p1'),'R');
});
test('trainer faint cannot enter the replacement escape capability',async()=>{
 const gw=await open({wild:false});await faint(gw);const before=JSON.stringify(snapshot(gw));assert.equal(await gw.runAfterFaint('p1'),false);assert.equal(JSON.stringify(snapshot(gw)),before);assert.deepEqual(gw.drain(),[]);
});
test('replacement reuses a previous failed command escape count without incrementing it',async()=>{
 const gw=await open({species:'Shuckle',foe:'Regieleki'});assert(await gw.act('p1',{kind:'run'}));assert(await gw.choose('p2','move 1'));const [normal]=runEvents(gw);
 assert.equal(normal.args[2],'fail');assert.equal(normal.args[4],'1');await faint(gw);
 assert(await gw.runAfterFaint('p1'));const [replacement]=runEvents(gw);assert.equal(replacement.args[4],'1');assert.equal(replacement.args[3],normal.args[3],'same actors/speeds and the same accumulated attempt count');
});
