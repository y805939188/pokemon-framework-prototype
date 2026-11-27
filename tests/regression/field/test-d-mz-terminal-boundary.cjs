'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {frameFixture}=require('../../../experiments/step5/5/d-mz-native-frame-support.cjs');
const flush=()=>new Promise(setImmediate);
async function completed(h){h.player._encounterCount=1;h.player.directionInput=6;h.tick();await flush();h.tick();await flush();}
for(const mode of ['mz-native','legacy-note'])test('terminal '+mode+' content callback replacing generation cannot spend old opportunity',async()=>{
 const h=await frameFixture({mode}),original=h.app.completeWorldStep.bind(h.app),content=h.G.PSFlow.content;let armed=false,replaced=false;
 h.app.completeWorldStep=step=>original(step).then(outcome=>{armed=true;return outcome;});
 h.G.PSFlow.content=()=>{if(armed){armed=false;h.app.stateReplacedByHost();replaced=true;}return content();};
 await completed(h);console.log(JSON.stringify({case:'generation-during-terminal',mode,replaced,generation:h.app.stateGeneration,offers:h.offers,nativeDraws:h.nativeDraws,diagnostics:h.G.PSWorld.diagnostics}));assert.equal(replaced,true);assert.equal(h.offers.length,0);assert.deepEqual(h.nativeDraws,[]);
});
for(const mode of ['mz-native','legacy-note'])test('terminal '+mode+' failed App post-arrival host observation cannot dispatch',async()=>{
 const h=await frameFixture({mode}),location=h.G.PSWorld.completedSteps.current,dispatch=h.G.PSWorld.completedSteps.dispatchArrival;let failNext=false,observed;
 h.G.PSWorld.completedSteps.dispatchArrival=r=>{const result=dispatch(r);failNext=true;return result;};
 h.G.PSWorld.completedSteps.current=()=>{if(failNext){failNext=false;throw Error('post-arrival-location-unavailable');}return location();};
 const complete=h.app.completeWorldStep.bind(h.app);h.app.completeWorldStep=step=>complete(step).then(result=>{observed=result;return result;});
 await completed(h);console.log(JSON.stringify({case:'failed-App-postarrival',mode,observed,offers:h.offers,nativeDraws:h.nativeDraws,diagnostics:h.G.PSWorld.diagnostics}));assert.equal(observed.status,'failed');assert.equal(h.offers.length,0);assert.deepEqual(h.nativeDraws,[]);
});
test('terminal new inventory owner during content callback stays blocked',async()=>{
 const h=await frameFixture({mode:'mz-native'}),original=h.app.completeWorldStep.bind(h.app),content=h.G.PSFlow.content;let armed=false,token;
 h.app.completeWorldStep=step=>original(step).then(outcome=>{armed=true;return outcome;});h.G.PSFlow.content=()=>{if(armed){armed=false;token=h.app.beginInventoryOperation();}return content();};await completed(h);assert(token);assert.equal(h.offers.length,0);assert.equal(h.app.encounterBlocked,true);h.app.endInventoryOperation(token);
});
test('terminal captured Map cannot dispatch after a host callback installs a different scene',async()=>{
 const h=await frameFixture({mode:'mz-native'}),complete=h.app.completeWorldStep.bind(h.app),mapScene=h.manager._scene,isActive=mapScene.isActive;let armed=false,changed=false;
 function Other(){h.G.Scene_MenuBase.call(this);}Other.prototype=Object.create(h.G.Scene_MenuBase.prototype);Other.prototype.constructor=Other;
 h.app.completeWorldStep=step=>complete(step).then(outcome=>{armed=true;return outcome;});
 mapScene.isActive=function(){const result=isActive.call(this);if(armed){armed=false;h.manager.goto(Other);h.manager.changeScene();changed=true;}return result;};
 await completed(h);console.log(JSON.stringify({case:'scene-during-terminal',changed,currentIsOldMap:h.manager._scene===mapScene,offers:h.offers,nativeDraws:h.nativeDraws}));assert.equal(changed,true);assert.equal(h.manager._scene instanceof Other,true);assert.equal(h.offers.length,0);assert.deepEqual(h.nativeDraws,[]);
});
for(const mode of ['mz-native','legacy-note'])for(const query of [2,3])test('terminal '+mode+' generation changed in mode query '+query+' stops before count RNG',async()=>{
 const h=await frameFixture({mode}),complete=h.app.completeWorldStep.bind(h.app),content=h.G.PSFlow.content;let armed=false,reads=0,changed=false;
 h.app.completeWorldStep=step=>complete(step).then(outcome=>{armed=true;return outcome;});h.G.PSFlow.content=()=>{if(armed&&++reads===query){h.app.stateReplacedByHost();changed=true;}return content();};await completed(h);assert.equal(changed,true);assert.equal(h.offers.length,0);assert.deepEqual(h.nativeDraws,[]);assert.deepEqual(h.draws,[]);h.player.directionInput=0;for(let i=0;i<3;i++){h.tick();await flush();}assert.equal(h.offers.length,0);assert.deepEqual(h.nativeDraws,[]);
});
for(const mode of ['mz-native','legacy-note'])test('terminal '+mode+' real App success followed by rejected continuation cannot dispatch or revive on idle poll',async()=>{
 const h=await frameFixture({mode}),complete=h.app.completeWorldStep.bind(h.app);h.app.completeWorldStep=step=>complete(step).then(()=>{throw Error('rejected-after-real-App-arrival');});await completed(h);h.player.directionInput=0;for(let i=0;i<3;i++){h.tick();await flush();}assert.equal(h.state().steps,1);assert.equal(h.offers.length,0);assert.deepEqual(h.nativeDraws,[]);assert.equal(h.app.saveBlocked,false);assert.equal(h.G.PSWorld.pending(),false);
});
for(const mode of ['mz-native','legacy-note'])test('terminal '+mode+' actual post-arrival App failure stays retired until a new completed step',async()=>{
 const h=await frameFixture({mode}),location=h.G.PSWorld.completedSteps.current,dispatch=h.G.PSWorld.completedSteps.dispatchArrival;let fail=false;
 h.G.PSWorld.completedSteps.dispatchArrival=r=>{const result=dispatch(r);fail=true;return result;};h.G.PSWorld.completedSteps.current=()=>{if(fail){fail=false;throw Error('post-arrival-once');}return location();};await completed(h);h.player.directionInput=0;for(let i=0;i<2;i++){h.tick();await flush();}assert.equal(h.offers.length,0);assert.deepEqual(h.nativeDraws,[]);
 h.G.PSWorld.completedSteps.current=location;h.G.PSWorld.completedSteps.dispatchArrival=dispatch;h.player.directionInput=6;h.tick();await flush();h.player.directionInput=0;h.tick();await flush();assert.equal(h.offers.length,1);assert.deepEqual([h.offers[0].x,h.offers[0].realX,h.offers[0].moving],[7,7,false]);assert.equal(h.state().steps,2);
});
test('terminal native encounterStep callback invalidates before native random draws',async()=>{
 const h=await frameFixture({mode:'mz-native'}),before=h.map.encounterStep;let changed=false;h.map.encounterStep=function(){h.app.stateReplacedByHost();changed=true;return before.call(this);};await completed(h);assert.equal(changed,true);assert.equal(h.offers.length,0);assert.deepEqual(h.nativeDraws,[]);
});
test('terminal native troop callback invalidates after the valid count prefix but before BattleManager.setup',async()=>{
 const h=await frameFixture({mode:'mz-native'});h.player.makeEncounterTroopId=function(){h.app.stateReplacedByHost();return 1;};await completed(h);assert.equal(h.offers.length,0);assert.deepEqual(h.nativeDraws,[10,10]);assert.equal(h.log.includes('native-battle'),false);
});
for(const hook of ['mapEncounters','encounter'])test('terminal compiled legacy '+hook+' callback invalidation does not install a battle',async()=>{
 const h=await frameFixture({mode:'legacy-note'}),method=h.G.PSFlow[hook],complete=h.app.completeWorldStep.bind(h.app);let armed=false,changed=false;h.app.completeWorldStep=step=>complete(step).then(outcome=>{armed=true;return outcome;});h.G.PSFlow[hook]=function(...args){if(armed){h.app.stateReplacedByHost();changed=true;}return method.apply(this,args);};await completed(h);assert.equal(changed,true);assert.equal(h.offers.length,0);assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,hook==='mapEncounters'?[]:[10,10]);
});
for(const mode of ['mz-native','legacy-note'])test('terminal '+mode+' reentrant actual Scene_Map poll during content query consumes at most the one final opportunity',async()=>{
 const h=await frameFixture({mode}),complete=h.app.completeWorldStep.bind(h.app),content=h.G.PSFlow.content;let armed=false,polls=0;
 h.app.completeWorldStep=step=>complete(step).then(outcome=>{armed=true;return outcome;});h.G.PSFlow.content=()=>{if(armed){armed=false;polls++;h.manager._scene.updateEncounter();assert.equal(h.offers.length,0);}return content();};await completed(h);assert.equal(polls,1);assert.equal(h.offers.length,1);assert.deepEqual(h.nativeDraws,[10,10]);assert.equal(h.offers[0].x,6);
});
test('terminal scoped wrappers restore exact descriptors and retain a successor content method',async()=>{
 const h=await frameFixture({mode:'mz-native'}),complete=h.app.completeWorldStep.bind(h.app),original=h.G.PSFlow.content;let armed=false;const next=()=>h.content;
 h.app.completeWorldStep=step=>complete(step).then(outcome=>{armed=true;return outcome;});h.G.PSFlow.content=()=>{if(armed){armed=false;h.G.PSFlow.content=next;h.app.stateReplacedByHost();}return original();};await completed(h);assert.equal(h.G.PSFlow.content,next);assert.equal(h.offers.length,0);assert.equal(h.app.saveBlocked,false);
});
test('negative control: treating App failed outcome as ordinary restores the forbidden native offer',async()=>{
 const h=await frameFixture({mode:'mz-native',transformWorld:source=>{const find=/\bdone\(result\);(?=\s*if \(outcome\.status === "battle-admitted"\))/;assert.match(source,find);return source.replace(find,'done("ordinary");');}}),location=h.G.PSWorld.completedSteps.current,dispatch=h.G.PSWorld.completedSteps.dispatchArrival;let fail=false;
 h.G.PSWorld.completedSteps.dispatchArrival=r=>{const result=dispatch(r);fail=true;return result;};h.G.PSWorld.completedSteps.current=()=>{if(fail){fail=false;throw Error('real-App-post-arrival-failure');}return location();};await completed(h);assert.throws(()=>assert.equal(h.offers.length,0));assert.equal(h.offers.length,1);
});
test('negative control: deleting same-step identity assertion restores the stale-generation offer',async()=>{
 const h=await frameFixture({mode:'mz-native',transformWorld:source=>{const find='if (!matches(entry)) {';assert(source.includes(find));return source.replace(find,'if (false) {');}}),complete=h.app.completeWorldStep.bind(h.app),content=h.G.PSFlow.content;let armed=false;
 h.app.completeWorldStep=step=>complete(step).then(outcome=>{armed=true;return outcome;});h.G.PSFlow.content=()=>{if(armed){armed=false;h.app.stateReplacedByHost();}return content();};await completed(h);assert.throws(()=>assert.equal(h.offers.length,0));assert.equal(h.offers.length,1);
});
