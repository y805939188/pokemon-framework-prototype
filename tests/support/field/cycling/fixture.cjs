'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),nativeFill=crypto.randomFillSync;
const {fixture:base,flush}=require('../../world/native-callers/fixture.cjs');

// The registered runner gives each CB selector a disposable one-case VM.
// Only the final VM require and the original compiled Flow.random receiver
// are observed. The App's own random port and its business algorithm stay intact.
function ordinaryEntropy(){
 assert.equal(process.env.PF_FINAL_PRODUCTION_FAMILY,'cb-cycling-parity');
 assert.equal(process.env.PF_FINAL_PRODUCTION_SELECTOR,process.env.PF_FINAL_CASE);
 assert(['CB01','CB02','CB03','CB04'].includes(process.env.PF_FINAL_CASE));
 const business=[],draws=[],rows=[];
 let G,flow,requireObserver,randomObserver,current=null,verifyPhase=null,tape=[];
 let attempts=0,imports=0,fills=0;
 const scopedCrypto=Object.freeze({randomFillSync(target){
  assert(current&&current.fills===0,'only the one original CB Flow.random may fill this buffer');
  assert.deepEqual(verifyPhase(),current.phase,'the native completed-step phase still owns this fill');
  assert.equal(Object.prototype.toString.call(target),'[object Uint32Array]');
  assert.equal(target.length,2);
  const result=Reflect.apply(nativeFill,crypto,[target]);
  assert.strictEqual(result,target);
  // Deliberately controlled host input after the genuine same-buffer Node fill.
  // Choose the middle of the requested bin, away from any bit-truncation edge.
  target[0]=Math.floor((current.expected+0.5)/current.upper*0x100000000);target[1]=0;
  current.fills++;fills++;
  return result;
 }});
 return{
  install(host,ports){
   assert(host&&!G);G=host;flow=G.PSFlow;
   assert.equal(typeof ports.random,'function');
   assert(!G.nw?.App,'this ordinary CB VM cannot use a developer launch');
   const req=Object.getOwnPropertyDescriptor(G,'require'),random=Object.getOwnPropertyDescriptor(flow,'random');
   assert.equal(typeof req?.value,'function');assert(req.writable);
   assert.equal(typeof random?.value,'function');assert(random.writable);
   const resolve=Object.getOwnPropertyDescriptor(req.value,'resolve');assert.equal(typeof resolve?.value,'function');
   requireObserver=function(...args){
    const result=Reflect.apply(req.value,this,args);
    if(args[0]!=='node:crypto'||!current)return result;
    assert.strictEqual(result,crypto);imports++;return scopedCrypto;
   };
   Object.defineProperty(requireObserver,'resolve',resolve);
   randomObserver=function(...args){
    attempts++;
    assert.strictEqual(this,flow);assert.equal(args.length,1);
    assert(attempts<=3&&verifyPhase&&!current&&tape.length>0,'unexpected ordinary CB business draw');
    const upper=args[0];assert.equal(upper,100);
    const phase=verifyPhase();
    const expected=tape.shift();assert(Number.isInteger(expected)&&expected>=0&&expected<upper);
    const row=current={upper,expected,fills:0,phase};
    try{
     const value=Reflect.apply(random.value,this,args);
     assert.equal(row.fills,1,'ordinary Flow must call the original Node entropy provider once');
     assert.equal(value,expected,'the actual original business conversion must consume the declared packet');
     assert.deepEqual(verifyPhase(),phase,'the production conversion must not alter the observed native owner');
     draws.push(upper);business.push({upper,value});
     rows.push({...row,value,mapId:G.$gameMap.mapId(),frame:G.Graphics.frameCount});
     return value;
    }finally{current=null;}
   };
   Object.defineProperty(G,'require',{...req,value:requireObserver});
   Object.defineProperty(flow,'random',{...random,value:randomObserver});
  },
  setTape(values,probe){
   assert(!verifyPhase&&!current);assert.equal(typeof probe,'function');
   assert.equal(tape.length,0,'preceding tape must be consumed');
   tape=[...values];verifyPhase=probe;
  },
  remaining:()=>[...tape],
  disarm(){verifyPhase=null;},
  snapshot(){
   assert(G);assert.strictEqual(G.PSFlow,flow);
   assert.strictEqual(G.require,requireObserver);assert.strictEqual(flow.random,randomObserver);
   return{source:'REAL_NODE_FILL_THEN_DECLARED_SYNTHETIC_TAPE',disposableVm:true,attempts,imports,fills,rows:structuredClone(rows)};
  },
  business,draws,
 };
}
async function fixture(options={}){
 const warnings=[],movement=[],snapshots=[],entropy=ordinaryEntropy(),{business,draws}=entropy;
 let vmRoot;
 const h=await base({cbObserveOrdinaryEntropyBeforeApp(ports){entropy.install(vmRoot,ports);},edit(game,content){
  game.world.repelSteps=0;
  content.world.encounters.tables.find(row=>row.mapId===5&&row.version===0).types.Land.stepChance=50;
 },nativeSetup(n){
  const G=vmRoot=n.G,nativeConsole=G.console;
  G.console={...nativeConsole,warn(...args){warnings.push(args.map(String).join(' '));return Reflect.apply(nativeConsole.warn,nativeConsole,args);}};
  if(options.cells)Object.assign(n.player,options.cells);
  const original=G.Game_Player.prototype.moveStraight;
  G.Game_Player.prototype.moveStraight=function(...args){const row={args,before:[this._x,this._y],receiver:this===G.$gamePlayer};const result=Reflect.apply(original,this,args);row.after=[this._x,this._y];row.result=result;movement.push(row);return result;};
 }});
 const {G,app}=h;
 assert.strictEqual(G,vmRoot);assert.strictEqual(G.PSFlow,h.flow);assert.strictEqual(G.PSFlow.app(),app);
 const bootstrap=G.PSFlow.initializeBlackoutCompanions();
 if(bootstrap)assert.equal((await bootstrap).status,'completed');
 for(let i=0;i<2;i++){h.tick();await flush();}
 await h.pump(()=>!app.saveBlocked&&!G.PSWorld.pending());
 // Keep bootstrap observations and every later prefix; no observation or PRNG reset.
 const legacyPrefix=[...h.draws],atBoot=entropy.snapshot();
 assert.deepEqual(legacyPrefix,[],'the inherited developer-only tape did not run during bootstrap');
 assert.deepEqual([atBoot.attempts,atBoot.imports,atBoot.fills,atBoot.rows.length],[0,0,0,0]);
 const prefix={draws:[...draws],nativeDraws:[...h.nativeDraws],saves:h.saves.length};
 const nativeArrivals=[],completedSteps=G.PSWorld.completedSteps,dispatch=completedSteps.dispatchArrival;
 let activeMove=null,sequence=0;
 function completedNativePhase(move){
  assert.strictEqual(activeMove,move);assert(move.started,'no draw during the original moveStraight start');
  assert.strictEqual(G.PSFlow.app(),app);assert.equal(app.stateGeneration,move.generation);
  assert.strictEqual(G.$gameMap,move.map);assert.equal(move.map.mapId(),5);
  assert.strictEqual(G.$gamePlayer,move.player);assert.strictEqual(h.player,move.player);
  assert.deepEqual([move.player.x,move.player.y],move.to);
  assert.deepEqual([move.player._realX,move.player._realY],move.to);
  assert.equal(move.player.isMoving(),false);assert.equal(move.player.isJumping(),false);
  const manager=G.SceneManager;
  assert.strictEqual(manager,move.manager);assert.strictEqual(manager._scene,move.scene);
  assert(move.scene instanceof G.Scene_Map);assert.equal(move.scene.isStarted(),true);
  assert.equal(manager._nextScene,null);assert.strictEqual(manager._stack,move.stack);
  assert.deepEqual(Array.from(manager._stack),move.stackPrefix);
  assert.equal(h.state().steps,move.beforeSteps+1);assert.equal(h.arrivals(),move.beforeArrivals+1);
  assert.equal(h.stepCalls.length,move.beforeStepCalls+1);
  assert(G.Graphics.frameCount>move.startFrame,'a draw cannot belong to the native move start frame');
  return{move:move.number,point:[...move.to],mapId:5,frame:G.Graphics.frameCount,steps:h.state().steps,
   arrivals:h.arrivals(),stepCalls:h.stepCalls.length,sameActor:true,moving:false,jumping:false,queueUnchanged:true};
 }
 completedSteps.dispatchArrival=function(request,...args){
  const move=activeMove;
  assert.strictEqual(this,completedSteps);
  assert(move&&move.started&&!move.arrival,'expected exactly one original arrival from the active CB move');
  const result=Reflect.apply(dispatch,this,[request,...args]);
  const phase=completedNativePhase(move);
  const step=request.step,issued=h.stepCalls.at(-1);
  // CompletedStepOperation owns a shallow-frozen copy, not the same DTO.
  assert.equal(step.id,issued.id);assert.strictEqual(step.player,move.player);assert.strictEqual(issued.player,move.player);
  assert.strictEqual(step.hostOwner,app);assert.strictEqual(issued.hostOwner,app);
  assert.strictEqual(step.map,move.map);assert.strictEqual(issued.map,move.map);
  assert.deepEqual([step.mapId,step.x,step.y,step.generation,step.sceneActive],[5,...move.to,move.generation,true]);
  assert.deepEqual([issued.mapId,issued.x,issued.y,issued.generation,issued.sceneActive],[5,...move.to,move.generation,true]);
  assert.equal(request.owner.kind,'completed-step');assert.equal(request.owner.generation,move.generation);
  assert.equal(result.status,'ordinary-opportunity','the original native dispatch returned eligibility, not a fixture-made acknowledgement');
  move.arrival={...phase,stepId:step.id,status:result.status};nativeArrivals.push(move.arrival);
  return result;
 };
 const capture=label=>{const s=h.state();const row={label,steps:s.steps,stats:{walked:s.stats.distance_walked,cycled:s.stats.distance_cycled,surfed:s.stats.distance_surfed,slid:s.stats.distance_slid_on_ice},point:[h.player.x,h.player.y],arrivals:h.arrivals(),moving:h.player.isMoving(),draws:[...draws],nativeDraws:[...h.nativeDraws],business:[...business],ordinaryEntropy:entropy.snapshot(),facts:structuredClone(app.worldFacts()),outcomes:structuredClone(h.outcomes),warnings:[...warnings]};snapshots.push(row);return row;};
 async function move(values=[]){
  assert(!activeMove);
  const before=capture('before'),manager=G.SceneManager;
  assert.equal(manager._nextScene,null);
  const native=activeMove={number:++sequence,player:h.player,map:G.$gameMap,generation:app.stateGeneration,manager,scene:manager._scene,
   stack:manager._stack,stackPrefix:Array.from(manager._stack),startFrame:G.Graphics.frameCount,
   to:[before.point[0],before.point[1]+1],beforeSteps:before.steps,beforeArrivals:before.arrivals,beforeStepCalls:h.stepCalls.length,
   started:false,arrival:null};
  try{
   entropy.setTape(values,()=>{
    const phase=completedNativePhase(native);
    assert(native.arrival,'business RNG can only run after the actual arrival dispatch returned');
    const {stepId,status,...atDispatch}=native.arrival;
    assert.deepEqual(phase,atDispatch,'the ordinary decision is synchronous with the original completed native arrival');
    return native.arrival;
   });
   const result=h.player.moveStraight(2);native.started=true;
   const start=capture('start');
   await h.pump(()=>!h.player.isMoving()&&!app.saveBlocked&&!G.PSWorld.pending());
   assert(native.arrival,'the native movement must have one observed original arrival even when cycling facts fail');
   return{before,start,completed:capture('completed'),result,unusedTape:entropy.remaining(),arrival:native.arrival};
  }finally{entropy.disarm();activeMove=null;}
 }
 function assertOrdinaryEntropy(expected){
  const end=entropy.snapshot();
  assert.deepEqual([end.attempts,end.imports,end.fills,end.rows.length],[expected,expected?1:0,expected,expected]);
  assert.deepEqual(end.rows.map(row=>row.upper),draws);
  assert.deepEqual(end.rows.map(({upper,value})=>({upper,value})),business);
  assert(end.rows.every(row=>row.mapId===5&&Number.isSafeInteger(row.frame)&&row.fills===1&&nativeArrivals.some(phase=>phase.stepId===row.phase.stepId)));
  assert.equal(nativeArrivals.length,sequence);
  assert.equal(new Set(nativeArrivals.map(phase=>phase.stepId)).size,nativeArrivals.length,'one real native step ID per CB move');
  assert.deepEqual(h.draws,legacyPrefix,'the inherited developer-only draw tape was never used');
 }
 function record(extra){fs.writeFileSync(path.join(process.env.PF_FINAL_CASE_ROOT,'observation.json'),JSON.stringify({case:process.env.PF_FINAL_CASE,prefix,snapshots,movement,nativeArrivals,business,draws,nativeDraws:h.nativeDraws,saves:h.saves.length,ordinaryEntropy:{atBoot,end:entropy.snapshot(),legacyPrefix,legacyFinal:[...h.draws]},extra},null,2)+'\n',{flag:'wx'});}
 return{...h,draws,warnings,movement,snapshots,business,prefix,capture,move,assertOrdinaryEntropy,record};
}
module.exports={fixture};
