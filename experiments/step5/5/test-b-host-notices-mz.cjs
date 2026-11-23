'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./b-host-notices-support.cjs');
require('../../../scripts/tests/ts-source-loader.cjs');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const coordinator=()=>import(pathToFileURL(path.resolve(__dirname,'../../../src/plugins/world/world-entry-mz.ts')).href);const flush=()=>new Promise(setImmediate);
const world=h=>h.state.read().world;
const receipts=h=>{const all=[],method=h.app.flushWorldNotices.bind(h.app);h.app.flushWorldNotices=()=>{const result=method();all.push(...result.receipts);return result;};return all;};
test('NEW-A prepared handoff across1->2->3 captures each real entry and flushes map2 facts in order',async()=>{
 const h=await fixture();h.newGame();const out=receipts(h),handoff=h.prepare();h.enter(2);h.enter(3);assert.deepEqual(world(h).visitedMaps,[1]);assert.deepEqual(h.draws,[]);assert.equal(h.app.saveBlocked,true);h.app.cancelFieldItemHandoff(handoff.token);h.tick();
 assert.deepEqual(world(h).visitedMaps,[1,2,3]);assert.deepEqual(world(h).healingSpot,{mapId:2,x:4,y:5});assert.equal(world(h).weather.type,'Snow');assert.equal(world(h).flashUsed,false);assert.deepEqual(h.draws,[100,100]);assert.equal(h.screen().type,'snow');assert.deepEqual(out.map(r=>[r.kind,r.mapId]),[['map-entry',2],['map-entry',3]]);assert.deepEqual(h.installs.filter(g=>g.world.visitedMaps.includes(2)).map(g=>g.world.visitedMaps),[[1,2],[1,2,3]]);
 const count=h.weather.length;h.tick();h.enter(3,false);h.tick();assert.equal(h.weather.length,count);assert.deepEqual(h.draws,[100,100]);assert.equal(h.app.saveBlocked,false);
});
test('NEW-A original initial-map mismatch failure releases owner and still applies queued map2 before map3',async()=>{
 const h=await fixture();h.newGame();const handoff=h.prepare();h.enter(2);const result=await h.app.runFieldItemHandoff(handoff.token);assert.equal(result.status,'failed');assert.equal(result.reason,'field-map-changed');h.enter(3);h.tick();assert.deepEqual(world(h).visitedMaps,[1,2,3]);assert.deepEqual(world(h).healingSpot,{mapId:2,x:4,y:5});assert.deepEqual(h.draws,[100,100]);
});
test('NEW-A running handler may cross twice without losing intermediate map facts or consuming its cancelled item',async()=>{
 const h=await fixture();h.newGame();const handoff=h.prepare(),run=h.app.runFieldItemHandoff(handoff.token);await flush();assert(h.execution());h.enter(2);h.enter(3);assert.deepEqual(world(h).visitedMaps,[1]);h.release({status:'cancelled'});assert.equal((await run).status,'cancelled');h.tick();assert.deepEqual(world(h).visitedMaps,[1,2,3]);assert.deepEqual(world(h).healingSpot,{mapId:2,x:4,y:5});assert.deepEqual(h.draws,[100,100]);assert.equal(h.E.inventory.itemQuantity(h.state.read().inventory,'honey',h.content.items),2);
});
for(const finalCommand of [false,true])test('NEW-A/B unified map/236 FIFO finalCommand='+finalCommand+' keeps business and native projection ordered',async()=>{
 const h=await fixture();h.newGame();const out=receipts(h),handoff=h.prepare();h.enter(2);if(!finalCommand)h.command('storm',5,60,true);h.enter(3);if(finalCommand)h.command('storm',5,60,true);h.advance(10);const before=h.screen(),weatherCalls=h.weather.length;h.app.cancelFieldItemHandoff(handoff.token);h.tick();assert.deepEqual(world(h).visitedMaps,[1,2,3]);assert.deepEqual(h.draws,[100,100]);assert.deepEqual(out.map(r=>r.kind),finalCommand?['map-entry','map-entry','weather-command']:['map-entry','weather-command','map-entry']);assert.equal(world(h).weather.type,finalCommand?'Storm':'Snow');assert.equal(h.screen().type,finalCommand?'storm':'snow');if(finalCommand){assert.deepEqual(h.screen(),before);assert.equal(h.weather.length,weatherCalls);}else assert.equal(h.weather.length,weatherCalls+1);
});
test('NEW-B consecutive refused-window236 intents preserve original wait/return and only latest business/fade survives',async()=>{
 const h=await fixture();h.newGame();const handoff=h.prepare(),a=h.command('rain',5,120,true),b=h.command('snow',2,60,true);assert.equal(a.result,true);assert.equal(a.interpreter._waitCount,120);assert.equal(b.result,true);assert.equal(b.interpreter._waitCount,60);assert.equal(world(h).weather.type,'None');assert.equal(h.screen().type,'snow');h.advance(30);const before=h.screen(),count=h.weather.length;h.app.cancelFieldItemHandoff(handoff.token);h.tick();assert.deepEqual(world(h).weather,{type:'Snow',strength:18,durationFrames:60});assert.deepEqual(h.screen(),before);assert.equal(h.weather.length,count);assert.deepEqual(h.draws,[]);assert.equal(h.G.PSWorld.diagnostics.length,0);
});
test('same-type map weather draw never restarts an active236 fade',async()=>{
 const h=await fixture({content(c){c.mapMetadata.maps[3].weather={type:'Rain',chance:100};}});h.newGame();h.command('rain',9,120,false);h.advance(30);const before=h.screen(),count=h.weather.length;h.enter(2);h.enter(3);assert.deepEqual(h.draws,[100,100]);assert.deepEqual(h.screen(),before);assert.equal(h.weather.length,count);assert.equal(world(h).weather.type,'Rain');
});
test('queued map2 Rain followed by same-type map3 still projects final Rain once',async()=>{
 const h=await fixture({content(c){c.mapMetadata.maps[3].weather={type:'Rain',chance:100};}});h.newGame();const handoff=h.prepare();h.enter(2);h.enter(3);const count=h.weather.length;h.app.cancelFieldItemHandoff(handoff.token);h.tick();assert.equal(world(h).weather.type,'Rain');assert.equal(h.screen().type,'rain');assert.equal(h.weather.length,count+1);assert.deepEqual(h.draws,[100,100]);
});
for(const rebuild of [false,true])test('load/reload enters exactly once without R08 and menu return is not another entry; rebuild='+rebuild,async()=>{
 const h=await fixture();h.newGame();h.command('rain',9,120,false);h.advance(30);const before=h.screen(),count=h.weather.length;h.load(rebuild);h.enter(1,false);h.tick();assert.deepEqual(h.screen(),before);assert.equal(h.weather.length,count);assert.deepEqual(h.draws,[]);assert.deepEqual(world(h).visitedMaps,[1]);
});
test('new game discards queued maps/weather and old command notices are not replayed',async()=>{
 const h=await fixture();h.newGame();h.prepare();h.enter(2);h.enter(3);h.command('storm',5,120,false);h.app.startNewGame();h.G.$gameSystem={};h.G.$gameScreen=new h.G.Game_Screen();h.enter(1);h.G.DataManager.setupNewGame();h.enter(1);h.tick();assert.deepEqual(world(h).visitedMaps,[1]);assert.equal(world(h).weather.type,'None');assert.equal(world(h).healingSpot,null);assert.equal(h.screen().type,'none');assert.deepEqual(h.draws.filter(n=>n===100),[]);
});
test('formal generation replacement plus load drops old pending intent and records only restored current map',async()=>{
 const h=await fixture();h.newGame();h.prepare();h.enter(2);h.enter(3);h.command('storm',5,120,false);h.app.stateReplacedByHost();h.G.$gameSystem={};h.G.$gameScreen=new h.G.Game_Screen();h.load(true);h.tick();assert.deepEqual(world(h).visitedMaps,[1,3]);assert.equal(world(h).healingSpot,null);assert.equal(world(h).weather.type,'None');assert.equal(h.screen().type,'none');assert.deepEqual(h.draws,[]);
});
test('battle236 preserves native skip and does not flush old notice outbox as a side effect',async()=>{
 const h=await fixture();h.newGame();const handoff=h.prepare();h.enter(2);h.app.cancelFieldItemHandoff(handoff.token);const count=h.weather.length;h.G.$gameParty.battle=true;const r=h.command('storm',5,60,true);assert.equal(r.result,true);assert.equal(r.interpreter._waitCount,undefined);assert.equal(h.weather.length,count);h.G.$gameParty.battle=false;h.tick();assert.equal(h.screen().type,'rain');
});
test('late old flush result cannot project over a newer236 or clear its new App receipt',async()=>{
 const h=await fixture();h.newGame();const handoff=h.prepare();h.enter(2);h.app.cancelFieldItemHandoff(handoff.token);const method=h.app.flushWorldNotices.bind(h.app);let once=true;h.app.flushWorldNotices=()=>{const result=method();if(once){once=false;h.command('storm',4,120,false);}return result;};h.tick();assert.equal(world(h).weather.type,'Storm');assert.equal(h.screen().type,'storm');h.advance(20);const before=h.screen();h.tick();assert.deepEqual(h.screen(),before);assert.equal(world(h).weather.type,'Storm');
});
test('native236 callback replacing generation cannot deliver old intent into the new game',async()=>{
 let h,armed=false;h=await fixture({onProject(args,G,app){if(armed){armed=false;app.startNewGame();G.$gameSystem={};G.$gameScreen=new G.Game_Screen();G.DataManager.setupNewGame();h.enter(1);}}});h.newGame();armed=true;const r=h.command('rain',9,60,true);assert.equal(r.result,true);assert.equal(r.interpreter._waitCount,60);h.tick();assert.equal(world(h).weather.type,'None');assert.equal(h.screen().type,'none');assert.deepEqual(world(h).visitedMaps,[1]);assert(h.G.PSWorld.diagnostics.includes('stale-world-command'));
});
test('each queued entry applies local/grace semantics before the next historical map entry',async()=>{
 const observed=[];const h=await fixture({beforeReplace(next,app){if(next.world.visitedMaps.at(-1)===3)observed.push({local:app.world.localState,runtime:app.world.encounterRuntime});}});h.newGame();h.app.world.local={strengthUsed:true,lowerEncounterRate:true,higherEncounterRate:true,lowerWildLevel:true,higherWildLevel:true};h.app.world.runtime={...h.app.world.runtime,graceSteps:9,accumulator:7};const handoff=h.prepare();h.enter(2);h.enter(3);h.app.cancelFieldItemHandoff(handoff.token);h.tick();assert.equal(observed.length,1);assert(Object.values(observed[0].local).every(value=>value===false));assert.equal(observed[0].runtime.currentMapId,2);assert.equal(observed[0].runtime.graceSteps,0);assert.equal(observed[0].runtime.accumulator,7);assert.equal(h.app.world.encounterRuntime.currentMapId,3);assert.equal(h.app.world.encounterRuntime.graceSteps,0);
});
test('coordinator late accepted load does not clear a newer load notice raised during its callback',async()=>{
 const {createWorldEntryCoordinator}=await coordinator(),c=createWorldEntryCoordinator(),entries=[];let again=true;const app={stateGeneration:0,observeWorldMapEntry(entry){entries.push(entry);if(again){again=false;c.loaded();}return{status:'committed'};}};c.loaded();c.mapLoaded(app,1,false,true);c.mapLoaded(app,1,false,false);assert.deepEqual(entries.map(e=>e.cause),['load','load']);assert.notEqual(entries[0].id,entries[1].id);
});
test('coordinator records physical previous map before a reentrant later map observation',async()=>{
 const {createWorldEntryCoordinator}=await coordinator(),c=createWorldEntryCoordinator(),entries=[];const app={stateGeneration:0,observeWorldMapEntry(entry){entries.push(entry);if(entry.mapId===2)c.mapLoaded(app,3,false,true);return{status:'committed'};}};c.newGame();c.mapLoaded(app,1,false,true);c.mapLoaded(app,2,false,true);assert.equal(c.mapLoaded(app,3,false,false),null);assert.deepEqual(entries.map(e=>[e.mapId,e.previousMapId]),[[1,null],[2,1],[3,2]]);
});
test('late old flush return does not erase a new-generation map receipt',async()=>{
 const h=await fixture();h.newGame();const handoff=h.prepare();h.enter(2);h.app.cancelFieldItemHandoff(handoff.token);const method=h.app.flushWorldNotices.bind(h.app);let once=true;h.app.flushWorldNotices=()=>{const result=method();if(once){once=false;h.app.startNewGame();h.G.$gameSystem={};h.G.$gameScreen=new h.G.Game_Screen();h.G.DataManager.setupNewGame();h.enter(1);}return result;};h.tick();h.tick();assert.deepEqual(world(h).visitedMaps,[1]);assert.equal(world(h).weather.type,'None');assert.equal(h.screen().type,'none');assert.equal(h.app.flushWorldNotices().pending,0);
});
test('queued map receipts wait for a safe Map scene update without inventing menu entry',async()=>{
 const h=await fixture();h.newGame();const handoff=h.prepare();h.enter(2);h.enter(3);h.app.cancelFieldItemHandoff(handoff.token);const count=h.weather.length;h.G.SceneManager._scene=new h.G.Scene_MenuBase();h.tick();assert.equal(h.weather.length,count);h.enter(3,false);h.tick();assert.equal(h.screen().type,'snow');assert.deepEqual(world(h).visitedMaps,[1,2,3]);assert.deepEqual(h.draws,[100,100]);
});
test('negative control: using old immediate enter loses the busy intermediate map',async()=>{
 const h=await fixture({transformWorld:source=>{const find='application.observeWorldMapEntry(entry)';assert(source.includes(find));return source.replace(find,'application.enterWorldMap(entry)');}});h.newGame();const handoff=h.prepare();h.enter(2);h.enter(3);h.app.cancelFieldItemHandoff(handoff.token);h.tick();assert.throws(()=>assert.deepEqual(world(h).visitedMaps,[1,2,3]));assert.equal(world(h).visitedMaps.includes(2),false);
});
test('negative control: deleting native-command revision guard lets a late map receipt overwrite new236',async()=>{
 const h=await fixture({transformWorld:source=>{const find='commandRevision === displayedCommand &&';assert(source.includes(find));return source.replace(find,'');}});h.newGame();const handoff=h.prepare();h.enter(2);h.app.cancelFieldItemHandoff(handoff.token);const method=h.app.flushWorldNotices.bind(h.app);let once=true;h.app.flushWorldNotices=()=>{const result=method();if(once){once=false;h.command('storm',4,120,false);}return result;};h.tick();assert.equal(world(h).weather.type,'Storm');assert.equal(h.screen().type,'rain');assert.throws(()=>assert.equal(h.screen().type,'storm'));
});

for(const queued of [false,true])test('NEW-B consumer barrier publishes native236 before Honey handler; queued='+queued,async()=>{
 const h=await fixture();h.newGame();if(!queued)h.command('rain',5,40,true);const handoff=h.prepare();let native;if(queued)native=h.command('rain',5,40,true);const count=h.weather.length,run=h.app.runFieldItemHandoff(handoff.token);assert.equal(run,h.app.runFieldItemHandoff(handoff.token));await flush();
 assert(h.execution());assert.equal(h.app.worldFacts().weather.value.type,'Rain');assert.deepEqual(h.state.read().world.weather,{type:'Rain',strength:36,durationFrames:40});assert.equal(h.app.saveBlocked,true);assert.equal(h.screen().type,'rain');assert.equal(h.weather.length,count);assert.deepEqual(h.draws,[]);if(native){assert.equal(native.result,true);assert.equal(native.interpreter._waitCount,40);}
 h.release({status:'completed'});assert.equal((await run).status,'completed');assert.equal(h.E.inventory.itemQuantity(h.state.read().inventory,'honey',h.content.items),1);assert.equal((await h.app.runFieldItemHandoff(handoff.token)).status,'duplicate');h.tick();assert.equal(h.weather.length,count);assert.equal(h.app.saveBlocked,false);
});
test('NEW-B consumer barrier uses latest native236 and preserves fade progress',async()=>{
 const h=await fixture();h.newGame();const handoff=h.prepare();h.command('rain',5,100,true);h.command('snow',2,60,true);h.advance(10);const before=h.screen(),count=h.weather.length,run=h.app.runFieldItemHandoff(handoff.token);await flush();assert(h.execution());assert.equal(h.app.worldFacts().weather.value.type,'Snow');assert.deepEqual(h.screen(),before);h.release({status:'cancelled'});assert.equal((await run).status,'cancelled');h.tick();assert.deepEqual(h.screen(),before);assert.equal(h.weather.length,count);assert.deepEqual(h.draws,[]);
});
test('NEW-B consumer barrier drains map and236 FIFO before refusing the old-map item without a handler or debit',async()=>{
 const h=await fixture();h.newGame();const handoff=h.prepare();h.enter(2);h.command('rain',5,40,true);h.enter(3);h.command('storm',4,60,true);const result=await h.app.runFieldItemHandoff(handoff.token);assert.deepEqual(result,{status:'failed',reason:'field-map-changed'});assert.equal(h.execution(),undefined);assert.deepEqual(h.installs.slice(1).map(s=>s.world.weather.type),['Rain','Rain','Snow','Storm']);assert.deepEqual(h.state.read().world.visitedMaps,[1,2,3]);assert.deepEqual(h.state.read().world.healingSpot,{mapId:2,x:4,y:5});assert.deepEqual(h.draws,[100,100]);assert.equal(h.E.inventory.itemQuantity(h.state.read().inventory,'honey',h.content.items),2);h.tick();assert.equal(h.screen().type,'storm');assert.equal(h.app.saveBlocked,false);
});
test('NEW-B new236 reentry while an earlier notice installs is included before consumer admission',async()=>{
 let h,armed=false;h=await fixture({afterReplace(next){if(armed){armed=false;h.command('snow',2,60,true);}}});h.newGame();const handoff=h.prepare();h.command('rain',5,40,true);armed=true;const run=h.app.runFieldItemHandoff(handoff.token);await flush();assert(h.execution());assert.equal(h.app.worldFacts().weather.value.type,'Snow');assert.deepEqual(h.installs.slice(1).map(s=>s.world.weather.type),['Rain','Snow']);assert.equal(h.screen().type,'snow');h.release({status:'cancelled'});await run;h.tick();assert.equal(h.screen().type,'snow');
});
