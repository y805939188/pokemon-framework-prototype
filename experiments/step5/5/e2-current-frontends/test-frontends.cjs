'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./fixture.cjs');
const id=process.env.PF_E2_FRONT_CASE,scope=process.env.PF_E2_FRONT_ROOT;
const moves={'E2-CUT':'cut','E2-ROCK':'rocksmash','E2-SURF':'surf','E2-FLASH':'flash','E2-SCENT':'sweetscent'};
assert(Object.hasOwn(moves,id));assert.deepEqual(process.argv.slice(2),[]);
const rejected=r=>r.status!=='completed'&&r.status!=='accepted';
const snapshot=h=>({steps:h.state().steps,cut:h.state().stats.cut_count,rock:h.state().stats.rock_smash_count,rockBattles:h.state().stats.rock_smash_battles,surf:h.state().stats.surf_count,flash:h.state().stats.flash_count,flashUsed:h.state().world.flashUsed,surfing:h.state().world.surfing,weather:h.state().world.weather.type,appliedBattles:Object.keys(h.state().appliedBattles),blocked:h.app.saveBlocked,encounterBlocked:h.app.encounterBlocked,position:[h.player.x,h.player.y,h.player.direction()]});
test(id+' actual current E2 frontend and native facts',{timeout:120000},async()=>{
 let h,rng,authoredContent,lateContent=null,passed=false,lateMessage=false,lateFlash=false;const trace=[];
 const replaceContent=current=>{
  assert.strictEqual(current.flow,h.flow);
  assert.strictEqual(current.G,h.G);
  assert.strictEqual(current.flow._content,authoredContent);
  assert.equal(lateContent,null);
  lateContent={...authoredContent,mapMetadata:{...authoredContent.mapMetadata,source:'e2-controlled-late-content'}};
  current.flow._content=lateContent;
 };
 const record=(name,extra={})=>trace.push({sequence:trace.length+1,name,frame:h.G.Graphics.frameCount,state:snapshot(h),...extra});
 try{
  h=await fixture(moves[id],{ordinaryAuthor:true,onMessage(current){if(lateMessage&&current){lateMessage=false;replaceContent(current);}},onFlash(current){if(lateFlash&&current){lateFlash=false;replaceContent(current);}}});
  const {G,app}=h;const base=snapshot(h);rng=require('./rng-observer.cjs').install(G,process.env.PF_E3_JOINT_OUT);
  const {E}=require('../../../../scripts/tests/final-production-runtime.cjs').get();
  authoredContent=h.flow._content;
  const fingerprint=E.semantic.ownedImmutableFingerprint(authoredContent);
  assert.match(fingerprint,/^[0-9a-f]{64}$/);
  const assertAuthoredCache=()=>{
   const current=h.flow._content;
   assert.strictEqual(current,authoredContent,'only the exact originally loaded author object may serve the later positive');
   assert(Object.isFrozen(current));
   assert.equal(E.contentRuntime.validatedContentIdentity(current),h.ordinaryAuthor.contentIdentity);
   assert.equal(E.semantic.ownedImmutableFingerprint(current),fingerprint);
  };
  assertAuthoredCache();
  async function withLateContent(channel,exercise){
   assertAuthoredCache();
   assert.equal(lateContent,null);
   assert.equal(lateMessage||lateFlash,false);
   if(channel==='message')lateMessage=true;else{assert.equal(channel,'flash');lateFlash=true;}
   try{
    const result=await exercise();
    assert(lateContent,'the scoped negative must actually replace the content object');
    assert.strictEqual(h.flow._content,lateContent);
    assert.notStrictEqual(lateContent,authoredContent);
    assert.equal(E.semantic.ownedImmutableFingerprint(lateContent),undefined);
    return result;
   }finally{
    h.flow._content=authoredContent;
    lateMessage=lateFlash=false;
    lateContent=null;
   }
  }
  record('current-ordinary-installation',{sourceMode:'full ordinary Flow app()/real formal Session factory; private compiled author input and VM-local entropy/clock',author:h.ordinaryAuthor,actualGameApplication:true,actualMZGlobalUpgrade:true,companions:h.state().world.companions.length});
  if(id==='E2-CUT'){
   const positive=await h.party();assert.equal(positive.status,'completed',JSON.stringify(positive));assert.equal(positive.result.committedUpdates,2);assert.equal(G.$gameMap.event(1)._erased,true);assert.equal(h.state().stats.cut_count,base.cut+1);assert.deepEqual(h.o.erases.map(x=>x.eventId),[1]);assert.equal(app.world.records.filter(r=>r.kind==='erased-event'&&r.target.eventId===1).length,1);assert.deepEqual(h.o.sounds.map(x=>x.name),['Slash1']);record('Party-two-pops-current-Cut-positive',{outcome:positive});
   // A genuine blocked player input turns toward the second initially-authored tree.
   G.Input.dir4=2;h.tick();G.Input.dir4=0;await h.settle(2);assert.deepEqual([h.player.x,h.player.y],[2,2]);assert.equal(h.player.direction(),2);
   const negative=await withLateContent('message',async()=>{
    const negative=await h.party();assert.equal(lateMessage,false,'real used-move message reached current Content invalidation');assert(rejected(negative),JSON.stringify(negative));assert.equal(G.$gameMap.event(2)._erased,false);assert.equal(h.state().stats.cut_count,base.cut+1);assert.deepEqual(h.o.erases.map(x=>x.eventId),[1]);assert.equal(app.saveBlocked,false);return negative;
   });assertAuthoredCache();record('second-current-target-late-Content-zero-extra-erase',{outcome:negative});
  }else if(id==='E2-ROCK'){
   const prepare=app.prepareFieldShortcutSelection;let jump=true;
   app.prepareFieldShortcutSelection=function(...args){const result=Reflect.apply(prepare,this,args);if(jump&&result.status==='prepared'){jump=false;G.$gameMap.event(1).jump(0,0);}return result;};
   const negative=await h.shortcut();assert.equal(jump,false);assert(rejected(negative),JSON.stringify(negative));assert.equal(h.state().stats.rock_smash_count,base.rock);assert.equal(h.state().stats.rock_smash_battles,base.rockBattles);assert.equal(h.o.erases.length,0);assert.equal(h.o.sessionStarts.length,0);await h.closeOverlay();await h.pump(()=>!G.$gameMap.event(1).isJumping());record('357-late-current-native-jump-refuses-before-effects',{outcome:negative});
   assertAuthoredCache();const positive=await h.shortcut();assert.equal(positive.status,'accepted',JSON.stringify(positive));const battle=await h.battleAccepted();assert.equal(h.state().stats.rock_smash_count,base.rock+1);assert.equal(h.state().stats.rock_smash_battles,base.rockBattles+1);assert.equal(G.$gameMap.event(1)._erased,true);assert.deepEqual(h.o.erases.map(x=>x.eventId),[1]);assert(h.o.sounds.some(x=>x.name==='Crash'));record('357-current-Rock-real-accepted-Session-and-formal-abort',{battle});
  }else if(id==='E2-SURF'){
   const prepare=app.prepareFieldShortcutSelection;let unavailable=true;
   app.prepareFieldShortcutSelection=function(...args){const result=Reflect.apply(prepare,this,args);if(unavailable&&result.status==='prepared'){unavailable=false;h.bitmap._loadingState='loading';}return result;};
   const negative=await h.party();assert.equal(unavailable,false);assert(rejected(negative),JSON.stringify(negative));assert.equal(h.state().world.surfing,false);assert.equal(h.state().stats.surf_count,base.surf);assert.deepEqual([h.player.x,h.player.y],[2,2]);assert.equal(app.saveBlocked,false);record('Party-late-real-bitmap-notready-no-Surf',{outcome:negative});
   h.bitmap._loadingState='loaded';await h.genuineMap();assertAuthoredCache();const positive=await h.party();assert.equal(positive.status,'completed',JSON.stringify(positive));await h.pump(()=>!h.player.isJumping()&&!app.saveBlocked&&!G.PSWorld.pending());assert.equal(h.state().world.surfing,true);assert.equal(h.state().stats.surf_count,base.surf+1);assert.deepEqual([h.player.x,h.player.y],[3,2]);assert.equal(h.player.characterName(),'SurfFixture');assert.equal(h.state().steps,base.steps);assert.equal(h.state().world.companions.length,0);record('Party-current-resources-Surf-positive',{outcome:positive});const beforeCleanup=h.cleanup.length,beforeOrdinary=h.ordinary.length,beforeNativeArrivals=h.o.nativeArrivals.length,beforeArrivals=h.arrivals(),landingDraws=h.draws.slice();
   G.Input.dir4=4;h.tick();G.Input.dir4=0;await h.pump(()=>!h.player.isJumping()&&!h.player.isMoving()&&!app.saveBlocked&&!G.PSWorld.pending());assert.deepEqual([h.player.x,h.player.y],[2,2]);assert.equal(h.state().world.surfing,false);assert.equal(app.worldFieldRuntime().endingSurf,false);assert.equal(h.player.characterName(),'WalkFixture');assert.equal(h.state().steps,base.steps+1);assert.equal(h.cleanup.length,beforeCleanup+1);assert.equal(h.ordinary.length,beforeOrdinary+1,'real landing D runs its ordinary subscriber');assert.deepEqual(h.draws,[...landingDraws,100]);assert.equal(h.arrivals(),beforeArrivals+1);assert.equal(h.o.nativeArrivals.length,beforeNativeArrivals+1,'early native arrival is held until the one D dispatch');assert.equal(h.o.completedSteps.length,1);assert.equal(h.o.completedSteps[0].kind,'completed-step');assert.equal(h.o.completedSteps[0].status,'no-encounter');assert.equal(h.o.completedSteps[0].reason,'grace');assert.equal(h.o.completedSteps[0].prefix.stepCommitted,true);assert.equal(app.worldEncounterRuntime().graceSteps,1);assert.throws(()=>h.replayLandingCompletion(),/surf-landing-completion-unissued/);assert.equal(h.state().steps,base.steps+1);assert.equal(h.cleanup.length,beforeCleanup+1);record('native-executeMove-shore-D-child-cleanup-once',{cleanup:h.cleanup.map(x=>({steps:x.steps,ending:x.ending,surfing:x.surfing}))});
  }else if(id==='E2-FLASH'){
   const negative=await withLateContent('message',async()=>{
    const negative=await h.shortcut();assert.equal(lateMessage,false,'actual Flash text reached before commit');assert(rejected(negative),JSON.stringify(negative));assert.equal(h.state().world.flashUsed,false);assert.equal(h.state().stats.flash_count,base.flash);assert(!h.o.radii.includes(176));assert.equal(app.saveBlocked,false);return negative;
   });assertAuthoredCache();record('357-current-default-mask-late-Content-zero-write',{outcome:negative});
   await h.closeOverlay();const old=G.SceneManager._scene,layer=old.children.find(c=>c.bitmap);await h.genuineMap();assert.equal(layer.destroyed,true);const current=G.SceneManager._scene;assert(current.children.some(c=>c.bitmap));assertAuthoredCache();const positive=await h.shortcut();assert.equal(positive.status,'completed',JSON.stringify(positive));assert.equal(h.state().world.flashUsed,true);assert.equal(h.state().stats.flash_count,base.flash+1);assert(h.o.radii.includes(176));assert.equal(h.player.isAnimationPlaying(),false);assert.equal(app.saveBlocked,false);record('357-fresh-default-mask-real-animation-Flash-positive',{outcome:positive,effects:h.o.effects});
  }else{
   const weather=async type=>{h.event([{code:236,indent:0,parameters:[type,type==='none'?0:5,0,false]},{code:0,indent:0,parameters:[]}]);h.tick();await h.settle(2);assert.equal(h.state().world.weather.type,type==='none'?'None':'Rain');};
   await weather('rain');const rainDraws=h.draws.slice(),flashes=h.o.flashes.length;const rain=await h.shortcut();assert.equal(rain.status,'completed',JSON.stringify(rain));assert.equal(rain.result.outcome,'weather-blocked');assert.equal(h.o.flashes.length,flashes);assert.equal(h.o.sessionStarts.length,0);assert.deepEqual(h.draws,rainDraws);await h.closeOverlay();record('real236-business-Rain-blocks-before-screen-and-RNG',{outcome:rain});
   await weather('none');const lateDraws=h.draws.slice();
   const late=await withLateContent('flash',async()=>{
    const late=await h.shortcut();assert.equal(lateFlash,false);assert(rejected(late),JSON.stringify(late));assert(h.o.flashes.length>flashes);await h.pump(()=>G.$gameScreen._flashDuration===0&&!app.saveBlocked);assert.deepEqual(h.draws,lateDraws);assert.equal(h.o.sessionStarts.length,0);return late;
   });assertAuthoredCache();await h.closeOverlay();record('real-red-screen-late-Content-no-Session',{outcome:late});
   await h.genuineMap();assertAuthoredCache();const positive=await h.shortcut();assert.equal(positive.status,'accepted',JSON.stringify(positive));const battle=await h.battleAccepted();assert.equal(h.state().stats.rock_smash_battles,base.rockBattles);assert.equal(h.state().stats.fishing_battles,0);assert.equal(h.state().stats.wild_battles_won,0);assert.equal(h.state().stats.wild_battles_lost,0);assert(h.o.screenUpdates>0&&h.o.flashUpdates>0);record('default-shortcut-native-red-screen-real-Scent-Session',{battle,flashes:h.o.flashes,screenUpdates:h.o.screenUpdates,flashUpdates:h.o.flashUpdates});
  }
  assert.equal(h.saves.length,0);assert.equal(app.saveBlocked,false);assert.equal(G.PSFlow.running,false);assert.equal(h.state().steps,base.steps+(id==='E2-SURF'?1:0));assert.equal(h.o.sessionStarts.filter(x=>x.status==='accepted').length,id==='E2-ROCK'||id==='E2-SCENT'?1:0);
  passed=true;
 }finally{
  if(h)fs.writeFileSync(path.join(scope,'RESULT.json'),JSON.stringify({id,status:passed?'PASS':'FAIL',trace,state:snapshot(h),observed:{...h.o,animationSprites:undefined},births:h.births,calls:h.calls.map(x=>({kind:x.kind,status:x.result?.status,reason:x.result?.reason,entry:x.kind==='prepare'?x.args[0]:undefined})),draws:h.draws,nativeDraws:h.nativeDraws,RNG:rng?.rows,businessEntropy:h.businessEntropy,saveExecutions:h.saves.length,diagnostics:h.G.PSWorld.diagnostics},(_key,value)=>typeof value==='bigint'?String(value):value,2)+'\n',{flag:'wx'});
  rng?.restore();
 }
});
