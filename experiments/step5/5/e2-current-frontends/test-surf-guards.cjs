'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./fixture.cjs');
const id=process.env.PF_E2_FRONT_CASE,scope=process.env.PF_E2_FRONT_ROOT;
assert(['E2-SURF-PRE','E2-SURF-GEN'].includes(id));assert.deepEqual(process.argv.slice(2),[]);
const state=h=>({generation:h.app.stateGeneration,steps:h.state().steps,surf:h.state().stats.surf_count,surfing:h.state().world.surfing,position:[h.player.x,h.player.y],save:h.app.saveBlocked,encounter:h.app.encounterBlocked,saves:h.saves.length});
test(id+' real Party Surf lifecycle control',{timeout:120000},async()=>{
 let h,rng,restoreWarn,passed=false;const trace=[],warnings=[];
 try{
  h=await fixture('surf',{edit(game){if(id==='E2-SURF-GEN')game.party.push({...structuredClone(game.party[0]),id:'surf-next-member'});},nativeSetup(n){
   // Install before the production plugins. Observe the real Management channel
   // while delegating the original receiver, argument values and return value.
   const output=n.G.console,warn=output.warn;
   function observedWarn(...args){warnings.push(args.slice());return Reflect.apply(warn,this,args);}
   output.warn=observedWarn;restoreWarn=()=>{if(output.warn===observedWarn)output.warn=warn;};
  }});
  const {G,app}=h,base=state(h);rng=require('./rng-observer.cjs').install(G,process.env.PF_E3_JOINT_OUT);
  if(id==='E2-SURF-PRE'){
   // Execute() calls the real resolver on the returned Map after setting the UI
   // stage, before any request is prepared. The native mutation is an explicit
   // adversarial input, not a permit/START or a claim of ordinary player input.
   const queries=app.fieldShortcutQueries;let armed=true;
   app.fieldShortcutQueries=function(...args){const q=Reflect.apply(queries,this,args),resolve=q.resolve;q.resolve=function(...values){const result=Reflect.apply(resolve,this,values);if(armed&&G.SceneManager._scene instanceof G.Scene_Map){armed=false;trace.push({kind:'before-unpublished-native-jump',frame:G.Graphics.frameCount,result:result.status,prepared:h.calls.filter(x=>x.kind==='prepare').length,state:state(h)});G.$gamePlayer.jump(0,1);}return result;};return q;};
   await h.waitIdle('guard-before-fresh-Party');G.SceneManager.push(G.Scene_Menu);h.tick();G.SceneManager._scene._commandWindow.handlers.psParty();h.ready();h.press('ok');h.choose('field-actions');assert(h.overlay());h.press('ok');await h.pump(()=>!armed);await h.pump(()=>!h.player.isJumping());await h.settle(4);
   assert.equal(armed,false);assert.equal(trace[0].result,'available');assert.equal(trace[0].prepared,0);assert.equal(h.calls.filter(x=>x.kind==='prepare').length,0);assert.equal(h.calls.filter(x=>x.kind==='execute').length,0);assert(warnings.some(args=>args.length===3&&args[0]==='PS_Management'&&args[1]==='field shortcut:'&&args[2]==='shortcut-source-changed'));assert.deepEqual([h.player.x,h.player.y],[2,3]);assert.equal(h.state().stats.surf_count,base.surf);assert.equal(h.state().world.surfing,false);assert.equal(h.state().steps,base.steps);assert.equal(app.saveBlocked,false);trace.push({kind:'unpublished-source-change-refused',state:state(h)});
  }else{
   // Retire the real host timeline only after the original owned native jump.
   // A true management-held successor then owns its own save barrier while the
   // old native frames, UI finally and original request cancellation settle.
   const boarding=await h.party();assert.equal(boarding.status,'completed');assert.deepEqual([h.player.x,h.player.y],[3,2]);
   const beforeArrivals=h.o.nativeArrivals.length,run=app.runFieldMove;let landOutcome,landId;
   app.runFieldMove=function(...args){const pending=Reflect.apply(run,this,args);if(args[1]?.kind==='surf-land'&&landId===undefined){landId=args[0];pending.then(result=>{landOutcome=result;},error=>{landOutcome={status:'failed',reason:String(error)};});}return pending;};
   const jump=G.Game_Player.prototype.jump;let armed=true,token;
   G.Game_Player.prototype.jump=function(...args){const result=Reflect.apply(jump,this,args);if(armed&&this===G.$gamePlayer){armed=false;assert(landId);trace.push({kind:'published-owned-landing-jump-before-host-retirement',frame:G.Graphics.frameCount,state:state(h)});G.PSFlow.stateReplaced();token=app.beginManagement();const held=app.manage(token,'surf-successor-hold',{kind:'pick-up',source:{id:'surf-next-member',position:{kind:'party',index:1}}});assert.equal(held.status,'held');trace.push({kind:'real-new-generation-held-successor',state:state(h),held:app.heldMemberReference(token)});}return result;};
   G.Input.dir4=4;h.tick();G.Input.dir4=0;await h.pump(()=>landOutcome!==undefined);assert.equal(armed,false);assert.notEqual(landOutcome.status,'completed');assert.notEqual(landOutcome.status,'accepted');assert.equal(app.stateGeneration,base.generation+1);assert.equal(app.saveBlocked,true);assert.equal(app.encounterBlocked,true);assert.equal(app.heldMemberReference(token).id,'surf-next-member');assert.equal(h.state().stats.surf_count,base.surf+1);assert.deepEqual([h.player.x,h.player.y],[2,2]);
   await h.pump(()=>!h.player.isJumping());await h.settle(6);const late=app.cancelFieldMove(landId);assert.equal(late.status,'refused');assert.equal(app.saveBlocked,true);assert.equal(app.encounterBlocked,true);assert.equal(app.heldMemberReference(token).id,'surf-next-member');assert.equal(h.state().stats.surf_count,base.surf+1);assert.equal(h.state().steps,base.steps);assert.equal(h.o.nativeArrivals.length,beforeArrivals,'retired landing motion never dispatches arrival under successor');trace.push({kind:'old-native-and-request-cannot-clear-successor',outcome:landOutcome,late,state:state(h),held:app.heldMemberReference(token)});
   assert.equal(app.manage(token,'surf-successor-cancel',{kind:'cancel-held'}).status,'cancelled');assert.equal(app.endManagement(token).status,'unchanged');assert.equal(app.saveBlocked,false);
   // The retired motion guard belongs only to that old jump. A genuinely new
   // landing and then a normal completed walk remain live on this generation.
   await h.waitIdle('new-generation-before-fresh-landing');G.Input.dir4=2;h.tick();G.Input.dir4=0;await h.pump(()=>!h.player.isMoving()&&!h.player.isJumping()&&!app.saveBlocked&&!G.PSWorld.pending());assert.deepEqual([h.player.x,h.player.y],[2,3]);assert.equal(h.state().world.surfing,false);assert.equal(h.state().steps,base.steps+1);
   await h.waitIdle('new-generation-before-fresh-walk');G.Input.dir4=8;h.tick();G.Input.dir4=0;await h.pump(()=>!h.player.isMoving()&&!h.player.isJumping()&&!app.saveBlocked&&!G.PSWorld.pending());assert.deepEqual([h.player.x,h.player.y],[2,2]);assert.equal(h.state().steps,base.steps+2);assert.equal(h.o.nativeArrivals.length,beforeArrivals+2);trace.push({kind:'new-generation-landing-and-walk-are-not-masked',state:state(h)});
   // One certified same-source handoff refusal: terminal-only Field ownership
   // must block reentrant admission through the native location reader and still
   // deliver arrival once, without creating D or an ordinary opportunity.
   await h.waitIdle('before-finite-handoff-refusal');
   // The preceding genuine walk ended facing north. This second Surf caller
   // needs the original east-side water, so turn through the real native method.
   const beforeTurn=state(h);h.player.setDirection(6);assert.equal(h.player.direction(),6);assert.deepEqual([h.player.x,h.player.y],beforeTurn.position);assert.equal(h.state().steps,beforeTurn.steps);assert.equal(h.state().stats.surf_count,beforeTurn.surf);trace.push({kind:'native-turn-prepares-second-Party-water',before:beforeTurn,after:state(h),direction:h.player.direction()});
   // Passive diagnostics for the second real Party caller. Observe calls that
   // already occur; do not issue another query, input, current() read or frame.
   const watches=[];let watching=true;
   const watch=(owner,key,observe)=>{if(watches.some(row=>row.owner===owner&&row.key===key))return;const before=Object.getOwnPropertyDescriptor(owner,key),original=owner[key];function wrapper(...args){const result=Reflect.apply(original,this,args);if(watching){try{observe(args,result);}catch{/* Logging cannot replace the original call. */}}return result;}owner[key]=wrapper;watches.push({owner,key,before,wrapper});};
   watch(G.PSManagement,'current',(args,result)=>trace.push({kind:'second-party-existing-current-read',args,result:result&&{generation:result.generation,ready:result.ready,heldId:result.heldId,text:result.text,view:result.view}}));
   watch(app,'fieldShortcutQueries',(_args,query)=>watch(query,'snapshot',(args,result)=>trace.push({kind:'second-party-existing-snapshot-read',args,status:result.status,reason:result.reason,moves:result.moves,items:result.items})));
   try{assert.equal((await h.party()).status,'completed');}finally{const manager=G.SceneManager,scene=Object.getOwnPropertyDescriptor(manager,'_scene')?.value,request=scene&&Object.getOwnPropertyDescriptor(scene,'_request')?.value;trace.push({kind:'second-party-native-slots-at-return',frame:G.Graphics.frameCount,requestKind:request?.kind,fieldReturnPresent:!!request?.fieldReturn,direction:Object.getOwnPropertyDescriptor(h.player,'_direction')?.value,windows:h.windows.map(win=>({visible:win.visible,destroyed:win.destroyed,drawn:win.drawn})),state:state(h)});watching=false;for(const {owner,key,before,wrapper}of watches.reverse())if(owner[key]===wrapper){if(before)Object.defineProperty(owner,key,before);else delete owner[key];}}
   const failBase=state(h),beforeNative=h.o.nativeArrivals.length,beforeD=h.o.completedSteps.length,beforeRead=h.ordinary.length,beforeDraws=h.draws.slice();
   const gateway=G.PSWorld.surfLandings,hold=gateway.hold,map=G.$gameMap,mapId=map.mapId,runAgain=app.runFieldMove;let refusal,terminalActive=false,attempted=false;
   map.mapId=function(...args){const result=Reflect.apply(mapId,this,args);if(terminalActive&&!attempted){attempted=true;assert.throws(()=>app.beginManagement(),/operation-active/);trace.push({kind:'terminal-owner-blocked-native-reader-reentry',state:state(h)});}return result;};
   gateway.hold=function(...args){const actual=Reflect.apply(hold,this,args);return{...actual,prepare(){throw Error('controlled-surf-handoff-refusal');},arrivalOnly(ticket){terminalActive=true;try{return Reflect.apply(actual.arrivalOnly,actual,[ticket]);}finally{terminalActive=false;}}};};
   app.runFieldMove=function(...args){const pending=Reflect.apply(runAgain,this,args);if(args[1]?.kind==='surf-land')pending.then(result=>{refusal=result;},error=>{refusal={status:'failed',reason:String(error)};});return pending;};
   G.Input.dir4=4;h.tick();G.Input.dir4=0;await h.pump(()=>refusal!==undefined&&!app.saveBlocked&&!G.PSWorld.pending());
   assert.equal(refusal.status,'failed');assert.equal(refusal.reason,'controlled-surf-handoff-refusal');assert.equal(refusal.committedUpdates,1);assert.equal(attempted,true);assert.deepEqual([h.player.x,h.player.y],[2,2]);assert.equal(h.state().stats.surf_count,failBase.surf);assert.equal(h.state().steps,failBase.steps);assert.equal(h.o.completedSteps.length,beforeD);assert.equal(h.cleanup.length,1);assert.equal(h.ordinary.length,beforeRead);assert.deepEqual(h.draws,beforeDraws);assert.equal(h.o.nativeArrivals.length,beforeNative+1);assert.equal(app.worldFieldRuntime().endingSurf,true);assert.equal(h.state().world.surfing,true);assert.equal(app.saveBlocked,false);trace.push({kind:'same-source-refusal-arrival-only-once-no-D',outcome:refusal,state:state(h)});
   gateway.hold=hold;map.mapId=mapId;

   // Frozen independent vectors fbde7e45: finite contexts within this original
   // GEN worker/binding, after every original GEN assertion above has completed.
   const context=async(label,options,exercise)=>{
    const row={kind:label,status:'RUNNING',trace:[]};trace.push(row);let next,random;
    try{next=await fixture('surf',options);random=require('./rng-observer.cjs').install(next.G,process.env.PF_E3_JOINT_OUT);await exercise(next,row.trace,random);assert.equal(next.saves.length,0);assert.equal(next.G.PSFlow.running,false);assert.equal(next.app.saveBlocked,false);row.status='PASS';}
    finally{if(next){row.state=state(next);row.arrivals=next.o.nativeArrivals;row.steps=next.o.completedSteps;row.RNG=random?.rows;}random?.restore();}
   };
   await context('SL-R1-real-mapId-Scene-retirement',{},async(n,observed,random)=>{
    const {G,app}=n;assert.equal((await n.party()).status,'completed');
    const gateway=G.PSWorld.surfLandings,hold=gateway.hold,map=G.$gameMap,mapId=map.mapId,run=app.runFieldMove;
    const before=state(n),arrivals=n.o.nativeArrivals.length,steps=n.o.completedSteps.length,cleanup=n.cleanup.length,ordinary=n.ordinary.length,draws=n.draws.slice(),channels=random.counts();
    let outcome,terminal=false,armed=true,injections=0,readCalls=0;
    map.mapId=function(...args){const result=Reflect.apply(mapId,this,args);if(terminal){readCalls++;if(armed){armed=false;injections++;G.SceneManager.push(G.Scene_Menu);observed.push({kind:'native-mapId-queued-original-Menu',originalResult:result,generation:app.stateGeneration,pending:!!G.SceneManager._nextScene,position:[n.player.x,n.player.y]});}}return result;};
    gateway.hold=function(...args){const actual=Reflect.apply(hold,this,args);return{...actual,prepare(){throw Error('controlled-surf-handoff-refusal');},arrivalOnly(ticket){terminal=true;try{return Reflect.apply(actual.arrivalOnly,actual,[ticket]);}finally{terminal=false;}}};};
    app.runFieldMove=function(...args){const pending=Reflect.apply(run,this,args);if(args[1]?.kind==='surf-land')pending.then(result=>{outcome=result;});return pending;};
    try{
     await n.waitIdle('N1-before-real-landing');G.Input.dir4=4;n.tick();G.Input.dir4=0;await n.pump(()=>outcome!==undefined&&!app.saveBlocked&&!G.PSWorld.pending());
     assert.equal(injections,1);assert(readCalls>=1);assert.equal(outcome.status,'failed');assert.equal(outcome.reason,'controlled-surf-handoff-refusal');assert.equal(outcome.committedUpdates,1);assert.equal(app.stateGeneration,before.generation);assert.deepEqual([n.player.x,n.player.y],[2,2]);
     assert.equal(n.o.nativeArrivals.length,arrivals);assert.equal(n.o.completedSteps.length,steps);assert.equal(n.cleanup.length,cleanup);assert.equal(n.ordinary.length,ordinary);assert.deepEqual(n.draws,draws);assert.deepEqual(random.counts(),channels);assert.equal(n.state().steps,before.steps);assert.equal(n.state().world.surfing,true);assert.equal(app.worldFieldRuntime().endingSurf,true);observed.push({kind:'retired-source-no-old-arrival-or-D',outcome,state:state(n)});
    }finally{gateway.hold=hold;map.mapId=mapId;app.runFieldMove=run;}
    await n.genuineMap();await n.waitIdle('N1-new-genuine-Map');G.Input.dir4=2;n.tick();G.Input.dir4=0;await n.pump(()=>!n.player.isMoving()&&!n.player.isJumping()&&!app.saveBlocked&&!G.PSWorld.pending());assert.equal(n.state().world.surfing,false);assert.equal(n.state().steps,before.steps+1);
    await n.waitIdle('N1-next-normal-walk');G.Input.dir4=8;n.tick();G.Input.dir4=0;await n.pump(()=>!n.player.isMoving()&&!n.player.isJumping()&&!app.saveBlocked&&!G.PSWorld.pending());assert.equal(n.state().steps,before.steps+2);assert.equal(n.o.nativeArrivals.length,arrivals+2);observed.push({kind:'new-real-landing-and-walk-stay-live',state:state(n)});
   });
   for(const retire of[false,true])await context(retire?'SL-R2-native-true-then-held-successor':'SL-R2-native-true-positive',{
    edit(game){game.party.push({...structuredClone(game.party[0]),id:'surf-next-member'});},
    nativeSetup(n,context){const G=n.G;context.maps[5].events[1]={id:1,name:'terminal-touch',x:2,y:3,pages:[{conditions:{switch1Valid:false,switch2Valid:false,variableValid:false,selfSwitchValid:false,itemValid:false,actorValid:false},image:{tileId:0,characterName:'',characterIndex:0,direction:2,pattern:1},priorityType:0,through:false,trigger:1,moveType:0,moveSpeed:3,moveFrequency:3,walkAnime:true,stepAnime:false,directionFix:false,list:[{code:230,indent:0,parameters:[1]},{code:0,indent:0,parameters:[]}]}]};G.$gameMap._events[1]=new G.Game_Event(5,1);},
   },async(n,observed,random)=>{
    const {G,app}=n,map=G.$gameMap,player=n.player,setup=map.setupStartingEvent,action=player.triggerAction,count=player.updateEncounterCount;
    const before=state(n),arrivals=n.o.nativeArrivals.length,ordinary=n.ordinary.length,draws=n.draws.slice(),channels=random.counts();let armed=true,trueReturns=0,targetFrame=-1,actionsAfter=0,countsAfter=0,token;
    map.setupStartingEvent=function(...args){const result=Reflect.apply(setup,this,args);if(result===true&&player.x===2&&player.y===3){trueReturns++;observed.push({kind:'actual-native-setup-true',result,frame:G.Graphics.frameCount});if(armed){armed=false;targetFrame=G.Graphics.frameCount;if(retire){G.PSFlow.stateReplaced();token=app.beginManagement();assert.equal(app.manage(token,'N2-held-successor',{kind:'pick-up',source:{id:'surf-next-member',position:{kind:'party',index:1}}}).status,'held');observed.push({kind:'formal-retirement-held-successor',state:state(n)});}}}return result;};
    player.triggerAction=function(...args){if(G.Graphics.frameCount===targetFrame)actionsAfter++;return Reflect.apply(action,this,args);};
    player.updateEncounterCount=function(...args){if(G.Graphics.frameCount===targetFrame)countsAfter++;return Reflect.apply(count,this,args);};
    try{
     await n.waitIdle('N2-before-authored-touch-step');G.Input.dir4=2;n.tick();G.Input.dir4=0;await n.pump(()=>trueReturns===1);await n.settle(4);
     assert.equal(trueReturns,1);assert.equal(actionsAfter,0);assert.equal(countsAfter,0);assert.equal(n.o.nativeArrivals.length,arrivals+1);assert.equal(n.state().steps,before.steps+1);assert.equal(n.ordinary.length,ordinary);assert.deepEqual(n.draws,draws);assert.deepEqual(random.counts(),channels);
     assert.equal(app.stateGeneration,before.generation+(retire?1:0));
     if(retire){assert.equal(app.saveBlocked,true);assert.equal(app.encounterBlocked,true);assert.equal(app.heldMemberReference(token).id,'surf-next-member');const old=n.o.completedSteps.at(-1);assert(old);assert(['refused','duplicate'].includes(app.cancelCompletedWorldStep(old.id).status));assert.equal(app.saveBlocked,true);assert.equal(app.heldMemberReference(token).id,'surf-next-member');assert.equal(app.manage(token,'N2-release-successor',{kind:'cancel-held'}).status,'cancelled');assert.equal(app.endManagement(token).status,'unchanged');}
     observed.push({kind:'original-true-no-following-action-or-count-boundary',trueReturns,actionsAfter,countsAfter,state:state(n)});
    }finally{map.setupStartingEvent=setup;player.triggerAction=action;player.updateEncounterCount=count;}
    await n.pump(()=>!map.isEventRunning()&&!app.saveBlocked&&!G.PSWorld.pending());await n.waitIdle('N2-next-normal-step');G.Input.dir4=8;n.tick();G.Input.dir4=0;await n.pump(()=>!player.isMoving()&&!player.isJumping()&&!app.saveBlocked&&!G.PSWorld.pending());assert.equal(n.state().steps,before.steps+2);assert.equal(n.o.nativeArrivals.length,arrivals+2);observed.push({kind:'next-normal-step-live',state:state(n)});
   });

  }
  assert.equal(h.saves.length,0);assert.equal(G.PSFlow.running,false);passed=true;
 }finally{
  try{if(h)fs.writeFileSync(path.join(scope,'RESULT.json'),JSON.stringify({id,status:passed?'PASS':'FAIL',trace,state:state(h),births:h.births,calls:h.calls.map(x=>({kind:x.kind,status:x.result?.status,reason:x.result?.reason})),diagnostics:h.G.PSWorld.diagnostics,warnings,RNG:rng?.rows},(_key,value)=>typeof value==='bigint'?String(value):value,2)+'\n',{flag:'wx'});}finally{restoreWarn?.();rng?.restore();}
 }
});
