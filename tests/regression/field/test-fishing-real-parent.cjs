'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, clone, flush } = require('../../../experiments/step5/5/fishing-real-parent-fixtures.cjs');
async function finish(h, write = 2) {
  const { promise } = await h.start();
  if (write === 2 && !h.settled) { h.window(); h.input(1, { confirm: true }); h.finish(); }
  else if (h.pending) { h.cancel(); h.finish(); }
  return promise;
}
for (const rod of [1,2,3]) for (const entry of ['bag','shortcut']) test(`real parent ${entry} rod ${rod}: one stats prefix, duplicate run, no-able C early return`, async () => {
  const h = fixture({rod,entry}); const {promise} = await h.start();
  assert.equal(h.app.saveBlocked, true); assert.equal(h.app.runFieldItemHandoff(h.token), promise);
  const owner = h.app.world.owner; assert.throws(() => h.app.assertFishingOwner({ ...owner }), /stale-fishing/);
  assert.throws(() => h.app.beginInventoryOperation(), /active/);
  h.window(); h.input(1,{confirm:true}); h.finish(); const result = await promise;
  assert.equal(result.status,'completed'); assert.equal(result.admission,undefined);
  assert.equal(result.fishing.status,'completed'); assert.equal(result.fishing.encounter.type,['OldRod','GoodRod','SuperRod'][rod-1]);
  assert.deepEqual(result.fishing.prefix,{countCommitted:true,battlesCommitted:true}); assert.equal(h.state.stats.fishing_count,1); assert.equal(h.state.stats.fishing_battles,1);
  assert.equal(h.statCommits.length,2); assert.equal(h.app.saveBlocked,false); assert.equal(h.writes.length,0,'stat update bypasses legacy replace');
  await h.app.runFieldItemHandoff(h.token); assert.equal(h.statCommits.length,2); assert.equal(h.state.inventory.pockets[7].reduce((n,r)=>n+r.quantity,0),3);
});
test('legacy state port without native atomic capability refuses fishing without writes/RNG/presentation', async () => {
  const h=fixture({noAtomic:true}), result=await finish(h,1); assert.equal(result.reason,'fishing-atomic-state-unavailable'); assert.equal(h.state.stats.fishing_count,0); assert.equal(h.statCommits.length,0); assert.deepEqual(h.draws,[]); assert.deepEqual(h.effects,[]);
});
for (const write of [1,2]) for (const stage of ['onRead','onAssert','onContent']) for (const change of ['owner','generation','content','state','cancel']) test(`real joint boundary stat ${write}: ${stage} ${change}`, async () => {
  let armed=false, changed=false, h;
  h=fixture({onInstall(number){armed=number===write;},[stage](context){if(!armed||changed)return;changed=true;
    if(change==='owner')h.replaceOwner(); else if(change==='generation')h.replaceGeneration(); else if(change==='content')h.actual({...h.content,settings:{FISHING_AUTO_HOOK:true}}); else if(change==='state')h.external(game=>{game.money=987;}); else context.operation.cancel();
  }});
  const result=await finish(h,write); assert(changed); assert.notEqual(result.fishing?.status,'completed'); assert.equal(result.fishing?.encounter,undefined);
  assert.equal(h.statCommits.length,write-1); assert.equal(h.state.stats.fishing_count,write-1); assert.equal(h.state.stats.fishing_battles,0);
  assert.deepEqual(result.fishing.prefix,{countCommitted:write===2,battlesCommitted:false}); if(change==='state')assert.equal(h.state.money,987);
});
// The historical four A1 and eight terminal-read probes map to these actual preparation callbacks:
// last host -> onAssert, final legacy usability read -> onRead. No callbacks exist in the final raw slot read.
for(const write of [1,2])test('original A1 final-parent cancellation '+write,async()=>{
 let armed=false,changed=false;const h=fixture({onInstall(n){armed=n===write;},onAssert(c){if(armed&&!changed){changed=true;c.operation.cancel();}}});
 const r=await finish(h,write);assert(changed);assert.equal(r.status,'cancelled');assert.equal(h.statCommits.length,write-1);assert.equal(r.fishing.encounter,undefined);
});
test('original A1 final-parent state change preserves foreign money',async()=>{
 let armed=false,changed=false,h;h=fixture({onInstall(){armed=true;},onAssert(){if(armed&&!changed){changed=true;h.external(g=>{g.money=123;});}}});
 const r=await finish(h,1);assert(changed);assert.equal(h.statCommits.length,0);assert.equal(h.state.money,123);assert.equal(r.fishing.prefix.countCommitted,false);
});
test('original CONTROL cancellation before final guard',async()=>{
 const h=fixture({onInstall(n,c){if(n===1)c.operation.cancel();}}),r=await finish(h,1);assert.equal(r.status,'cancelled');assert.equal(h.statCommits.length,0);
});
for(const write of [1,2])for(const change of ['owner','generation','content'])test(`original terminal read ${change} stat ${write}`,async()=>{
 let armed=false,changed=false,h;h=fixture({onInstall(n){armed=n===write;},onRead(){if(!armed||changed)return;changed=true;if(change==='owner')h.replaceOwner();else if(change==='generation')h.replaceGeneration();else h.actual({...h.content,settings:{FISHING_AUTO_HOOK:true}});}});
 const r=await finish(h,write);assert(changed);assert.equal(r.fishing.status,'failed');assert.equal(h.statCommits.length,write-1);assert.equal(r.fishing.encounter,undefined);
});
test('original CONTROL early read generation invalidation',async()=>{
 let armed=false,changed=false,h;h=fixture({onInstall(){armed=true;},onRead(){if(armed&&!changed){changed=true;h.replaceGeneration();}}});const r=await finish(h,1);assert.equal(r.fishing.status,'failed');assert.equal(h.statCommits.length,0);
});
test('original CONTROL read local cancellation',async()=>{
 let armed=false,changed=false;const h=fixture({onInstall(){armed=true;},onRead(c){if(armed&&!changed){changed=true;c.operation.cancel();}}});const r=await finish(h,1);assert.equal(r.status,'cancelled');assert.equal(h.statCommits.length,0);
});
test('same-semantic native slot/content replacements retain unrelated fields and each stat increments once',async()=>{
 let h;h=fixture({onInstall(){h.external(()=>{});h.actual(clone(h.content));}});h.external(g=>{g.money=246;g.world.visitedMaps=[3,7];g.stats.fishing_count=12;g.stats.fishing_battles=8;});
 const r=await finish(h);assert.equal(r.fishing.status,'completed');assert.equal(h.state.money,246);assert.deepEqual(h.state.world.visitedMaps,[3,7]);assert.equal(h.state.stats.fishing_count,13);assert.equal(h.state.stats.fishing_battles,9);
});
test('cancelled fishing keeps the single owner/save busy until acknowledged restoration',async()=>{
 const h=fixture(),{promise}=await h.start(),owner=h.app.world.owner;
 h.waiting();h.cancel();assert.equal(h.app.world.owner,owner);assert.equal(h.app.saveBlocked,true);assert.throws(()=>h.app.beginManagement(),/active/);
 h.finish();assert.equal((await promise).status,'cancelled');assert.equal(h.app.saveBlocked,false);assert.equal(h.state.stats.fishing_count,1);assert.equal(h.state.stats.fishing_battles,0);
});
for(const replacement of ['new-game','load'])test(replacement+' replaces generation while old host acknowledgements cannot write',async()=>{
 const h=fixture(),{promise}=await h.start(),old=h.session;
 if(replacement==='new-game')h.app.startNewGame();else{h.app.stateReplacedByHost();h.external(g=>{g.money=789;g.stats.fishing_count=0;});}
 h.tick();h.finish();const result=await promise,after=clone(h.state);old.update();old.dispose();await flush();assert.deepEqual(h.state,after);assert.equal(h.state.stats.fishing_count,0);assert.equal(h.state.stats.fishing_battles,0);assert.equal(result.fishing.encounter,undefined);
});
test('host begin cancellation restores presentation with no battle stat or extra owner',async()=>{
 let once=false;const h=fixture({onBegin(c){if(!once){once=true;c.operation.cancel();}}});const r=await finish(h,1);assert.equal(r.status,'cancelled');assert.equal(h.state.stats.fishing_count,1);assert.equal(h.state.stats.fishing_battles,0);assert.equal(h.app.saveBlocked,false);
});
test('queued map/weather notices settle before fishing count and retain FIFO captured metadata',async()=>{
 const h=fixture();h.prepare();h.h.root.$gameMap.id=8;
 assert.equal(h.app.observeWorldMapEntry({id:'8',cause:'transfer',previousMapId:7,mapId:8,rebuilt:true}).status,'queued');
 h.h.root.$gameMap.id=7;assert.equal(h.app.observeWorldMapEntry({id:'7',cause:'transfer',previousMapId:8,mapId:7,rebuilt:true}).status,'queued');
 assert.equal(h.app.setWorldWeather({type:'Storm',strength:42,durationFrames:12}).status,'queued');
 const promise=h.app.runFieldItemHandoff(h.token);await flush();assert.deepEqual(h.state.world.visitedMaps,[8,7]);assert.deepEqual(h.state.world.healingSpot,{mapId:8,x:1,y:1});assert.equal(h.state.world.weather.type,'Storm');assert.equal(h.statCommits[0].world.weather.type,'Storm');assert.equal(h.draws[0],100);
 h.cancel();h.finish();await promise;const notices=h.app.flushWorldNotices();assert.deepEqual(notices.receipts.map(r=>r.kind),['map-entry','map-entry','weather-command']);
});
for(const disruption of ['scene','map'])test('native host '+disruption+' lifetime invalidates old fishing without another stat',async()=>{
 const h=fixture(),{promise}=await h.start();h.waiting();if(disruption==='scene')h.h.root.SceneManager._scene={};else h.h.root.$gameMap={...h.h.root.$gameMap,id:8};
 h.tick();h.finish();const r=await promise;assert.notEqual(r.fishing.status,'completed');assert.equal(h.state.stats.fishing_count,1);assert.equal(h.state.stats.fishing_battles,0);assert.equal(h.app.saveBlocked,false);
});
test('absent loaded fishing type keeps no-bite prefix with no fishing battle or encounter intent',async()=>{
 const h=fixture({noTable:true}),{promise}=await h.start();h.waiting();for(let n=0;n<40&&!h.settled;n++){h.finish();h.tick(1000);await flush();}
 const r=await promise;assert.equal(r.status,'completed');assert.equal(r.fishing.completion.caught,false);assert.equal(r.fishing.encounter,undefined);assert.equal(h.state.stats.fishing_count,1);assert.equal(h.state.stats.fishing_battles,0);
});
test('provider changing map in stat preparation prevents writing on the former map',async()=>{
 let armed=false,changed=false,h;h=fixture({onInstall(n){armed=n===2;},onAssert(){if(armed&&!changed){changed=true;h.h.root.$gameMap.id=8;}}});
 const r=await finish(h);assert(changed);assert.equal(r.fishing.status,'failed');assert.equal(h.state.stats.fishing_battles,0);assert.equal(h.statCommits.length,1);
});
