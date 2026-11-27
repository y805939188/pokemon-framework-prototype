'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,flush,command}=require('../../../experiments/step5/5/world-fishing-production-support.cjs');
test('real Inventory rod returns to Map and runs the real World parent/native atomic writer exactly once',async()=>{
 const w=await fixture({noTable:true}),handle=await w.start();assert.equal(w.state().stats.fishing_count,1);assert.equal(w.state().steps,0);assert.equal(w.app.saveBlocked,true);assert.equal(w.G.PSWorld.pending(),true);assert.equal(w.G.PSInventory.current(),null);assert.equal(w.G.SceneManager._scene instanceof w.G.Scene_Map,true);assert.throws(()=>w.app.beginInventoryOperation(),/active/);
 await w.finish();assert.equal(w.G.PSWorld.pending(),false);assert.equal(w.app.saveBlocked,false);assert.equal(w.state().stats.fishing_battles,0);assert.equal(w.state().inventory.pockets.flat().filter(x=>x.itemId==='oldrod').reduce((a,x)=>a+x.quantity,0),1);assert.equal(handle.done,true);assert.equal(handle.result.status,'committed');assert.equal(w.h.message.isBusy(),false);
});
test('production map pump advances owned nested public events while conflicting native parents pause',async()=>{
 const w=await fixture({noTable:true,beginEvent:2,beginList:[command(117,[3]),command(0)]});w.event(3,[command(355,['globalThis.childProgress=(globalThis.childProgress||0)+1;']),command(230,[2]),command(355,['globalThis.childProgress++;']),command(0)]);
 await w.start();w.h.map.updateInterpreter();new w.G.Game_Event().updateParallel();new w.G.Game_CommonEvent().update();assert.equal(w.events.includes('parent-interpreter'),false);assert.equal(w.events.includes('parallel-event'),false);assert.equal(w.events.includes('parallel-common'),false);assert.equal(w.G.SceneManager._scene.isMenuEnabled(),false);
 for(let n=0;n<5;n++){w.tick(20);await flush();}assert.equal(w.G.childProgress,2);await w.finish();assert.equal(w.app.saveBlocked,false);w.h.map.updateInterpreter();assert.equal(w.events.includes('parent-interpreter'),true);
});
test('real document focus clock pauses fishing through unfocused native SceneManager frames',async()=>{
 const w=await fixture({noTable:true});await w.start();w.tick(100);const before=w.effects.length;w.h.fire('blur');for(let i=0;i<20;i++)w.tick(1000);assert.equal(w.effects.length,before);assert.equal(w.state().stats.fishing_count,1);w.h.fire('focus');w.tick(100);assert(w.effects.length>before);await w.finish();assert.equal(w.app.saveBlocked,false);assert.equal(w.h.focusListeners,0);
});
test('caught fish hands exact App reservation out after restoration, creates one C member/session and retains source',async()=>{
 const w=await fixture();await w.start();await w.finish();assert(w.admission);assert.equal(w.state().stats.fishing_count,1);assert.equal(w.state().stats.fishing_battles,1);assert.equal(w.h.player._pattern,1);assert.equal(w.G.PSWorld.pending(),false);assert.equal(w.app.saveBlocked,true);assert.equal(w.sessions.length,0);
 await assert.rejects(w.app.startAdmittedWorldBattle({...w.admission}),/stale/);const prefix=[...w.draws];const first=w.app.startAdmittedWorldBattle(w.admission);assert.equal(first,w.app.startAdmittedWorldBattle(w.admission));await first;assert.equal(w.sessions.length,1);assert.deepEqual(w.draws,prefix);assert.deepEqual(w.sessions[0].setup.worldCapture,{fishing:true,timeOfDay:2});w.app.abortAdmittedWorldBattle(w.admission,'test-finished');assert.equal(w.app.saveBlocked,false);
});
test('cancel/new generation retain committed fishing prefix, restore owned windows, ignore late effects and leave no reservation',async()=>{
 for(const kind of ['cancel','generation']){const w=await fixture();await w.start();w.tick(200);if(kind==='generation'){w.app.stateReplacedByHost();w.G.$gamePlayer={...w.h.player,_pattern:2};}else {w.close();w.tick();w.close();w.tick();w.h.key('keydown','Escape');w.tick(1);w.h.key('keyup','Escape');}await w.finish();assert.equal(w.state().stats.fishing_count,1);assert.equal(w.state().stats.fishing_battles,0);assert.equal(w.admission,undefined);assert.equal(w.app.saveBlocked,false);assert.equal(w.G.PSWorld.pending(),false);assert.equal(w.h.focusListeners,0);assert.equal(w.G.$gamePlayer._pattern,kind==='generation'?2:1);}
});
