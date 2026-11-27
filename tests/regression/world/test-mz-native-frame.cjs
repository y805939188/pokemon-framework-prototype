'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {frameFixture}=require('../../support/world/mz-native-frame-support.cjs');
const flush=()=>new Promise(setImmediate);
async function frames(h,count=4){for(let i=0;i<count;i++){h.tick();await flush();}}
async function due(options={}){const h=await frameFixture(options);h.player._encounterCount=1;h.player.directionInput=6;return h;}
for(const mode of ['mz-native','legacy-note'])test('R1 full native frames: '+mode+' dispatches at completed tile before held input starts another grid',async()=>{
 const baseline=await due({mode,withoutWorld:true});if(mode==='legacy-note')baseline.G.Game_Player.prototype.executeEncounter=function(){return baseline.G.PSFlow.encounterHost.legacyEncounter(this);};await frames(baseline,2);
 const h=await due({mode});h.tick();await flush();assert.equal(h.offers.length,0);h.tick();assert.equal(h.app.saveBlocked,true);assert.equal(h.G.PSWorld.pending(),true);assert.equal(h.player.canMove(),false);await flush();
 assert.equal(h.offers.length,1);assert.deepEqual([h.offers[0].frame,h.offers[0].x,h.offers[0].realX,h.offers[0].moving],[2,6,6,false]);assert.deepEqual([h.offers[0].appPending,h.offers[0].hostPending],[false,false]);assert.deepEqual(h.nativeDraws,[10,10]);assert.equal(h.state().steps,1);
 assert.deepEqual([baseline.offers[0].frame,baseline.offers[0].x,baseline.offers[0].realX,baseline.offers[0].moving],[2,6,6,false]);assert.deepEqual(h.nativeDraws,baseline.nativeDraws);await frames(h,3);assert.equal(h.offers.length,1);assert.equal(h.player.x,6);assert.equal(h.player.isMoving(),false);assert.equal(h.state().steps,1);
});
for(const mode of ['mz-native','legacy-note'])test('R1 '+mode+' nonexpired counter permits the next completed grid without an early draw',async()=>{
 const h=await frameFixture({mode});h.player._encounterCount=3;h.player.directionInput=6;await frames(h,2);assert.equal(h.offers.length,0);assert.equal(h.player._encounterCount,2);assert.deepEqual(h.nativeDraws,[]);h.tick();assert.equal(h.player.x,7);assert.equal(h.player.isMoving(),true);h.player.directionInput=0;await frames(h,1);assert.equal(h.state().steps,2);assert.equal(h.offers.length,0);assert.deepEqual(h.nativeDraws,[]);
});
for(const mode of ['mz-native','legacy-note','none','framework'])test('R1 '+mode+' event arrival has priority and no terminal encounter draw',async()=>{
 const h=await due({mode});h.map.startsEvent=true;await frames(h,3);assert.equal(h.map.running,true);assert.equal(h.state().steps,1);assert.equal(h.offers.length,0);assert.deepEqual(h.nativeDraws,[]);assert.deepEqual(h.draws,[]);assert.equal(h.player.x,6);
});
for(const mode of ['none','framework'])test('R1 '+mode+' ordinary completion never calls native dispatch or consumes native RNG',async()=>{
 const h=await due({mode});h.player.directionInput=0;h.complete();await flush();assert.equal(h.offers.length,0);assert.deepEqual(h.nativeDraws,[]);assert.deepEqual(h.draws,[]);assert.equal(h.state().steps,1);
});
for(const mode of ['mz-native','legacy-note'])test('R1 '+mode+' actual command136 disables random branch while keeping completed passives',async()=>{
 const h=await due({mode});new h.G.Game_Interpreter().command136([0]);h.nativeDraws.length=0;h.player.directionInput=0;h.complete();await flush();assert.equal(h.offers.length,0);assert.equal(h.state().steps,1);assert.deepEqual(h.nativeDraws,[]);assert.equal(h.system.enabled,false);
});
for(const mode of ['mz-native','legacy-note'])test('R1 '+mode+' held click destination is dispatched before the next destination-derived move',async()=>{
 const h=await due({mode});h.player.directionInput=0;h.temp.isDestinationValid=()=>true;h.temp.destinationX=()=>9;h.temp.destinationY=()=>5;h.player.findDirectionTo=()=>6;await frames(h,3);assert.equal(h.offers.length,1);assert.deepEqual([h.offers[0].x,h.offers[0].realX,h.offers[0].moving],[6,6,false]);assert.equal(h.player.x,6);
});
for(const change of ['new-generation','new-ui-owner','other-scene','message'])test('R1 terminal continuation '+change+' prevents stale native dispatch and preserves its successor',async()=>{
 const h=await due({mode:'mz-native'}),complete=h.app.completeWorldStep.bind(h.app);let successor;
 h.app.completeWorldStep=step=>complete(step).then(outcome=>{if(change==='new-generation')h.app.stateReplacedByHost();if(change==='new-ui-owner'){successor=h.G.PSInventory.showBag();assert(successor);}if(change==='other-scene'){function Other(){h.G.Scene_MenuBase.call(this);}Other.prototype=Object.create(h.G.Scene_MenuBase.prototype);Other.prototype.constructor=Other;h.manager.goto(Other);}if(change==='message')h.G.$gameMessage.busy=true;return outcome;});
 await frames(h,2);assert.equal(h.offers.length,0);assert.deepEqual(h.nativeDraws,[]);assert.equal(h.state().steps,1);assert.equal(h.G.PSWorld.pending(),false);
 if(change==='new-ui-owner'){assert.equal(successor.done,false);assert.equal(h.G.PSFlow.operationPending(),true);await frames(h,1);assert.equal(h.player.x,6);assert.equal(h.view()?.view.kind,'bag');}if(change==='other-scene'){await frames(h,1);assert.equal(h.player.x,6);}if(change==='message'){assert.equal(h.player.canMove(),false);assert.equal(h.player.x,6);}
});
test('R1 new App owner acquired between App terminal and host done remains blocked from native polling',async()=>{
 const h=await due({mode:'mz-native'}),complete=h.app.completeWorldStep.bind(h.app);let token;h.app.completeWorldStep=step=>complete(step).then(outcome=>{token=h.app.beginInventoryOperation();return outcome;});await frames(h,2);assert(token);assert.equal(h.offers.length,0);assert.equal(h.app.encounterBlocked,true);h.player.executeEncounter();assert.equal(h.offers.length,0);assert.deepEqual(h.nativeDraws,[]);assert.equal(h.app.endInventoryOperation(token).status,'unchanged');
});
test('R1 own cancellation before App terminal never schedules native encounter',async()=>{
 const h=await due({mode:'mz-native',repel:1});await frames(h,2);assert.equal(h.app.saveBlocked,true);assert.equal(h.offers.length,0);assert.deepEqual(h.nativeDraws,[]);h.G.PSWorld.stepStateReplaced();await flush();assert.equal(h.app.saveBlocked,false);assert.equal(h.G.PSWorld.pending(),false);assert.equal(h.offers.length,0);assert.equal(h.state().steps,1);
});
for(const mode of ['mz-native','legacy-note'])test('R1 negative control '+mode+' removing terminal dispatch restores the wrong next-grid battle',async()=>{
 const h=await due({mode,transformWorld:source=>{const find='ports.dispatchEncounter?.(entry.step)';assert.equal(source.split(find).length,2);return source.replace(find,'void entry.step');}});await frames(h,3);assert.equal(h.offers.length,1);assert.deepEqual([h.offers[0].x,h.offers[0].moving],[7,true]);assert.throws(()=>assert.deepEqual([h.offers[0].x,h.offers[0].moving],[6,false]));assert.deepEqual(h.nativeDraws,[10,10]);
});
