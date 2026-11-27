'use strict';
// Actual production App + Inventory + World + completed native player methods. Graphics/input are deterministic fakes.
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,build}=require('../../../experiments/step5/5/d-mz-integration-support.cjs');
const {load}=require('../../../experiments/step5/5/field-host-support.cjs');
const flush=()=>new Promise(setImmediate);

test('D actual completed interpolation writes once, locks through arrival ack and reports C unavailable',async()=>{
 const h=await fixture();h.player.directionInput=6;h.tick();h.player.directionInput=0;assert.equal(h.state().steps,0);assert.equal(h.player.isMoving(),true);h.tick();await h.settle();
 assert.equal(h.state().steps,1);assert.deepEqual(h.calls.filter(x=>x[0]==='arrival-parent-lock'),[['arrival-parent-lock',true,true]]);assert.equal(h.log.filter(x=>x==='arrival').length,1);
 assert.equal(h.G.PSWorld.diagnostics.includes('ordinary-encounter-handler-unavailable'),true);assert.equal(h.app.saveBlocked,false);assert.equal(h.G.PSWorld.pending(),false);assert.deepEqual(h.nativeDraws,[]);assert.deepEqual(h.draws,[]);
 for(let i=0;i<10;i++)h.tick();assert.equal(h.state().steps,1);
});
test('D turn wall jump companion and forced route have zero ordinary prefixes/RNG',async()=>{
 const h=await fixture();h.player.setDirection(8);h.player.increaseSteps();h.player.passable=false;h.complete();h.player.passable=true;h.player.jumping=true;h.player.increaseSteps();h.player.jumping=false;h.player._forcing=true;h.complete();await h.settle();
 const companion=new h.G.Game_Player();companion._x++;companion.increaseSteps();companion.updateMove();companion.updateNonmoving(true,true);
 assert.equal(h.state().steps,0);assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);
});
test('D actual arrival event wins after passive prefix and stops ordinary',async()=>{
 const h=await fixture({happinessSteps:127});let stepsAtArrival=-1;const before=h.map.setupStartingEvent;h.map.setupStartingEvent=function(){stepsAtArrival=h.state().steps;return before.call(this);};h.map.startsEvent=true;h.complete();await h.settle();
 assert.equal(stepsAtArrival,1);assert.equal(h.state().steps,1);assert.equal(h.map.running,true);assert.equal(h.G.PSWorld.diagnostics.includes('ordinary-encounter-handler-unavailable'),false);assert.deepEqual(h.draws,[2]);assert.deepEqual(h.nativeDraws,[]);
});
test('D actual triggerAction acknowledgement is distinct and keeps parent barrier during native action',async()=>{
 const h=await fixture();h.player.triggerAction=function(){h.calls.push(['action',h.app.saveBlocked,this.canMove()]);return true;};h.complete();await h.settle();
 assert.deepEqual(h.calls.find(x=>x[0]==='action'),['action',true,true]);assert.equal(h.G.PSWorld.diagnostics.includes('ordinary-encounter-handler-unavailable'),false);assert.equal(h.app.saveBlocked,false);
});
test('D owned renewal opens despite total parent lock, real ticket consumed once and arrival waits for map return',async()=>{
 const h=await fixture({repel:1});h.map.startsEvent=true;h.complete();await flush();assert.equal(h.state().steps,1);assert.equal(h.state().world.repelSteps,0);assert.equal(h.app.saveBlocked,true);assert.equal(h.G.PSInventory.showBag(),null);assert.equal(h.map.running,false);
 assert.equal(h.view().view.kind,'menu');h.choose('yes');assert.equal(h.view().view.kind,'bag');h.ready();h.press('ok');await h.settle();
 assert.equal(h.quantity('repel'),1);assert.equal(h.state().world.repelSteps,100);assert.equal(h.state().stats.repel_count,1);assert.equal(h.state().steps,1);assert.equal(h.map.running,true);assert.equal(h.app.saveBlocked,false);assert.deepEqual(h.nativeDraws,[]);assert.deepEqual(h.draws,[]);
 h.tick();await flush();assert.equal(h.quantity('repel'),1);
});
test('D renewal cancel preserves completed prefix, no consumption, arrival dispatched once',async()=>{
 const h=await fixture({repel:1});h.complete();await flush();h.choose('no');await h.settle();assert.equal(h.state().steps,1);assert.equal(h.state().world.repelSteps,0);assert.equal(h.quantity('repel'),2);assert.equal(h.log.filter(x=>x==='arrival').length,1);assert.equal(h.app.saveBlocked,false);
});
test('D forged owner/selection objects cannot bypass own-child guard without a competing UI',async()=>{
 const h=await fixture({repel:1});let request,reply;h.G.PSWorld.completedSteps.openRepelSelection=r=>{request=r;return new Promise(resolve=>{reply=resolve;});};h.complete();await flush();assert(request);assert.equal(h.view(),null);
 assert.equal(h.G.PSInventory.selectOwnedRepel({...request.owner},request.selection,()=>assert.fail('fake callback')),null);assert.equal(h.G.PSInventory.selectOwnedRepel(request.owner,{...request.selection},()=>assert.fail('fake callback')),null);assert.equal(h.app.isOwnedRepelSelection(request.owner,{...request.selection,child:{...request.selection.child}}),false);
 reply({status:'cancelled'});await h.settle();assert.equal(h.quantity('repel'),2);assert.equal(h.state().steps,1);
});
test('D unrelated scene closure cancels own pending UI and late reply cannot dispatch arrival',async()=>{
 const h=await fixture({repel:1});h.complete();await flush();const queued=h.manager._scene;function Other(){h.G.Scene_MenuBase.call(this);}Other.prototype=Object.create(h.G.Scene_MenuBase.prototype);Other.prototype.constructor=Other;h.manager.goto(Other);h.tick();await flush();h.tick();await flush();
 assert.equal(h.state().steps,1);assert.equal(h.quantity('repel'),2);assert.equal(h.app.saveBlocked,false);assert.equal(h.G.PSWorld.pending(),false);assert.equal(h.log.includes('arrival'),false);queued._controller?.request.ownedRepel.reply({status:'cancelled'});await flush();assert.equal(h.log.includes('arrival'),false);
});
test('D host arrival failure stops retries; message failure retains prefix and resumes arrival only',async()=>{
 const h=await fixture();h.player.checkEventTriggerHere=()=>{throw Error('arrival-host-error');};h.complete();await h.settle();assert.equal(h.state().steps,1);assert.equal(h.app.saveBlocked,false);assert.equal(h.G.PSWorld.diagnostics.some(reason=>reason.endsWith('arrival-host-error')),true);h.tick();assert.equal(h.state().steps,1);
 const p=await fixture({repel:1,bag:{potion:3},messageFailure:true});p.complete();await p.settle();assert.equal(p.state().steps,1);assert.equal(p.app.saveBlocked,false);assert.equal(p.log.filter(value=>value==='arrival').length,1);assert.equal(p.log.includes('native-encounter'),false);assert.equal(p.log.includes('legacy-encounter'),false);
});
test('D four production modes derive from actual map facts; conflict never falls back native',async()=>{
 const M=await load('src/plugins/world/encounter-mode-host.ts');
 for(const mode of ['framework','legacy-note','mz-native','none']){const h=await fixture({mode});assert.equal(M.resolveMZEncounterMode(5,h.content,h.G.$dataMap).mode,mode);h.player.makeEncounterCount();assert.deepEqual(h.nativeDraws,mode==='legacy-note'||mode==='mz-native'?[10,10]:[]);}
 const h=await fixture();h.G.$dataMap.meta.PSEncounter='A,1,5';assert.equal(M.resolveMZEncounterMode(5,h.content,h.G.$dataMap).status,'unavailable');assert.equal(h.player.executeEncounter(),false);assert.deepEqual(h.nativeDraws,[]);
});
test('D ice adapter explicit tags default empty, validates capabilities and native tag range',async()=>{
 const M=await load('src/plugins/world/completed-step-mz.ts');const app={stateGeneration:0,completeWorldStep:async s=>{seen.push(s.ice);return{status:'ordinary-unhandled',reason:'ordinary-encounter-handler-unavailable',prefix:{}};},cancelCompletedWorldStep(){},isOwnedRepelSelection:()=>false},player={x:1,y:1},map={mapId:()=>5},root={$gamePlayer:player,$gameMap:map};let seen=[];
 const run=async(options,tag,method)=>{if(method==='absent')delete player.isOnIce;else player.isOnIce=method;const host=M.createCompletedStepMZ(root,()=>app,()=>null,()=>{},options);host.run({id:'step',owner:{owner:app,generation:0,map,mapId:5},player,x:1,y:1,regionId:0,terrainTag:tag,sceneActive:true},()=>{});await flush();};
 await run({},7,'absent');await run({iceTerrainTags:[3]},3,'absent');await run({iceTerrainTags:[3]},3,()=>false);await run({},1,()=>true);assert.deepEqual(seen,[false,true,false,true]);
 assert.throws(()=>M.createCompletedStepMZ(root,()=>app,()=>null,()=>{},{iceTerrainTags:[12]}),/invalid-ice/);await assert.rejects(()=>run({},8,'absent'),/invalid-native-terrain/);await assert.rejects(()=>run({},0,()=>undefined),/terrain-ice-fact-unavailable/);await assert.rejects(()=>run({},0,()=>{throw Error('ice-unavailable');}),/ice-unavailable/);
});
test('D negative controls detect restored start writer and a total-lock renewal gate',async()=>{
 const h=await fixture(),original=h.player.increaseSteps;h.player.increaseSteps=function(){original.call(this);h.app.recordSteps(1);};h.complete();await h.settle();assert.throws(()=>assert.equal(h.state().steps,1),/2 !== 1/);
 const p=await fixture({repel:1});const select=p.G.PSInventory.selectOwnedRepel;p.G.PSInventory.selectOwnedRepel=(...args)=>p.app.encounterBlocked?null:select(...args);p.complete();await p.settle();assert.throws(()=>assert.equal(p.view()?.view.kind,'menu'));assert.equal(p.quantity('repel'),2);assert.equal(p.state().steps,1);
});
test('D built Flow migrates old move-start writer and exports explicit native/legacy references',async()=>{
 const B=await build();assert.equal(/PSFlow\.steps\(1\)/.test(B.flow),false);assert.match(B.flow,/nativeEncounter:/);assert.match(B.flow,/legacyEncounter:/);assert.match(B.flow,/completedSteps:/);
});
test('D poison production feedback waits exact flash completion, emits sound once and retains prefix on full faint',async()=>{
 const h=await fixture({edit(g,c){g.steps=3;g.party[0].hp=1;g.party[0].status='psn';c.settings={POISON_IN_FIELD:true,POISON_FAINT_IN_FIELD:true,AFFECTION_EFFECTS:false};}});h.complete();await flush();assert.equal(h.state().steps,4);assert.equal(h.app.saveBlocked,true);assert.equal(h.state().party[0].hp,1);assert.equal(h.calls.filter(x=>x[0]==='poison-sound').length,1);assert.equal(h.calls.filter(x=>x[0]==='flash').length,1);
 for(let i=0;i<8;i++)h.tick();await flush();assert.equal(h.state().party[0].hp,0);assert.equal(h.app.saveBlocked,true);assert.equal(h.messages.length,1);assert.equal(h.log.includes('arrival'),false);h.G.$gameMessage.busy=false;h.tick();await h.settle();assert.equal(h.app.saveBlocked,false);assert.equal(h.G.PSWorld.diagnostics.includes('field-blackout-handler-unavailable'),true);assert.equal(h.state().steps,4);assert.deepEqual(h.draws,[]);
});
test('D generation replacement during owned renewal retires only old child without late writes',async()=>{
 const h=await fixture({repel:1});let request;const original=h.G.PSWorld.completedSteps.openRepelSelection;h.G.PSWorld.completedSteps.openRepelSelection=r=>{request=r;return original(r);};h.complete();await flush();h.app.stateReplacedByHost();h.tick();await h.settle();assert.equal(h.app.saveBlocked,false);assert.equal(h.quantity('repel'),2);assert.equal(h.state().steps,1);assert.equal(h.app.isOwnedRepelSelection(request.owner,request.selection),false);assert.equal(h.log.includes('arrival'),false);
});
test('D owned UI never calls public inventory begin/finish/end mutation APIs',async()=>{
 const h=await fixture({repel:1});for(const key of ['beginInventoryOperation','finishItemSelection','endInventoryOperation','inventoryRequest','beginInventorySort'])h.app[key]=()=>assert.fail('public inventory mutation '+key);h.complete();await flush();h.choose('yes');h.ready();h.press('ok');await h.settle();assert.equal(h.quantity('repel'),1);assert.equal(h.state().stats.repel_count,1);assert.equal(h.app.saveBlocked,false);
});
test('D forced-route origin stays excluded even when route ends before interpolation',async()=>{
 const h=await fixture();h.player._forcing=true;h.player.directionInput=6;h.tick();h.player.directionInput=0;h.player._forcing=false;h.tick();await h.settle();assert.equal(h.state().steps,0);assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);
});
test('D real map-entry wrapper retires old step before App entry admission',async()=>{
 const h=await fixture({repel:1});h.manager._scene.onMapLoaded();h.complete();await flush();h.map.id=6;h.manager.goto(h.G.Scene_Map);await h.settle();assert.equal(h.app.saveBlocked,false);assert.equal(h.G.PSWorld.pending(),false);assert.equal(h.state().world.visitedMaps.includes(6),true);assert.equal(h.quantity('repel'),2);assert.equal(h.log.includes('arrival'),false);
});

// D-ARRIVAL-ACTION: one input at the genuine parent-owned nonmoving boundary.
const {nativeAction}=require('../../../experiments/step5/5/d-native-action-fixture.cjs');
for(const kind of ['button','touch']){
 test('D real '+kind+' without parent is a positive native action control',async()=>{const r=await nativeAction(kind,false);assert.equal(r.event,true);assert.equal(r.steps,0);});
 test('D real '+kind+' completed arrival executes once while keeping its parent barrier',async()=>{const r=await nativeAction(kind,true);assert.equal(r.steps,1);assert.equal(r.event,true);assert.equal(r.trace.filter(x=>x.triggers?.includes(0)).length,1);const first=r.trace.find(x=>x.at==='triggerAction');assert.equal(first.blocked,true);assert.equal(first.result,true);assert.equal(r.saveBlocked,false);assert.equal(r.h.app.isOwnedCompletedStepArrival(r.request.owner,r.request.step.id),false,'a retired stack cannot grant native input');});
}
for(const fault of ['cancel-successor','generation','scene','map-data','content','native-blocked','recovery','companion','field-ui'])test('D exact arrival exception refuses '+fault+' before the real button action',async()=>{
 let successor,changed=false;
 const r=await nativeAction('button',true,{beforeAction(h,request){
  if(changed)return;changed=true;
  assert.equal(h.app.isOwnedCompletedStepArrival({...request.owner},request.step.id),false,'copied permit never authenticates');
  if(fault==='cancel-successor'){h.app.cancelCompletedWorldStep(request.step.id);successor=h.app.beginInventoryOperation();}
  else if(fault==='generation')h.app.stateReplacedByHost();
  else if(fault==='scene')h.G.SceneManager._scene={update(){}};
  else if(fault==='map-data')h.G.$dataMap={...h.G.$dataMap};
  else if(fault==='content')h.content.settings={...h.content.settings,AFFECTION_EFFECTS:false};
  else if(fault==='native-blocked')h.map.running=true;
  else if(fault==='recovery')h.G.PSFlow.blackoutLoadPending=()=>true;
  else if(fault==='companion')h.G.PSFlow.companionNativePending=()=>true;
  else h.G.PSManagement={fieldPresentationPending:()=>true};
 }});
 assert(changed);assert.equal(r.steps,1);assert.equal(r.trace.find(x=>x.at==='triggerAction').result,false);assert.equal(r.trace.filter(x=>x.triggers?.includes(0)).length,0);
 if(successor){assert.equal(r.h.app.encounterBlocked,true);assert.equal(r.h.app.endInventoryOperation(successor).status,'unchanged');}
});

for(const kind of ['button','touch'])test('D actual pinned function SceneManager '+kind+' arrival retains native action',async()=>{const r=await nativeAction(kind,true,{functionManager:true});assert.equal(typeof r.h.G.SceneManager,'function');assert.equal(r.trace.find(x=>x.at==='triggerAction').result,true);assert.equal(r.trace.filter(x=>x.triggers?.includes(0)).length,1);assert.equal(r.steps,1);assert.equal(r.saveBlocked,false);});

for(const replaceApp of [false,true])test('D final owned query rechecks current App after real Content callback; replace='+replaceApp,async()=>{
 let injected=false,successorApp,successor,calls=0;
 const r=await nativeAction('button',true,{functionManager:true,beforeAction(h){
  const query=h.app.isOwnedCompletedStepArrival,content=h.app.ports.content;let inQuery=false;
  h.app.isOwnedCompletedStepArrival=function(...args){calls++;inQuery=calls===2;try{return Reflect.apply(query,this,args);}finally{inQuery=false;}};
  h.app.ports.content=function(...args){const view=Reflect.apply(content,this,args);
   if(inQuery&&!injected){injected=true;if(replaceApp){let game=structuredClone(h.state());
    successorApp=new h.E.app.GameApplication({state:{read:()=>game,replace:next=>{game=next;}},content:()=>view,sessions:{async create(){throw Error('unexpected replacement battle');}},projection:{project(){}}});
    successor=successorApp.beginInventoryOperation();assert(successor);assert.equal(successorApp.stateGeneration,h.app.stateGeneration);
    h.G.PSFlow._app=successorApp;h.G.PSFlow.app=()=>successorApp;
   }}return view;
  };
 }});
 assert(injected);assert.equal(r.steps,1);assert.equal(r.trace.find(x=>x.at==='triggerAction').result,!replaceApp);
 assert.equal(r.trace.filter(x=>x.triggers?.includes(0)).length,Number(!replaceApp));
 if(replaceApp){assert.equal(r.h.G.PSFlow._app,successorApp);assert.equal(successorApp.encounterBlocked,true);assert.equal(successorApp.endInventoryOperation(successor).status,'unchanged');}
});
