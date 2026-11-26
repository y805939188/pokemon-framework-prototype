'use strict';
// True installed IIFE/App/atomic adapter; formal IF does not replace the App or factory.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture,record,flush,method}=require('./commands-fixture.cjs');
const runtime=require('../../../../scripts/tests/final-production-runtime.cjs');
const ordinaryAuthor=require('./ordinary-if-author.cjs');
const ids=["IF-WILD-META", "IF-TRAINER-META", "IF-WILD-SESSION", "IF-TRAINER-SESSION", "IF-WILD-ARGS", "IF-TRAINER-ARGS", "IF-SOURCE", "IF-CONTENT", "IF-GENERATION", "IF-HOUR", "IF-INVALID-META", "IF-BUSY-APIS"];
const id=process.env.PF_G_COMMAND_CASE;assert(ids.includes(id),'unknown legacy capture control');
const choices={weather:'none',terrain:'none',environment:'none'};
// The separate historical compatibility family keeps its old fixture. Formal G uses the ordinary route below.
async function legacyBusyHost(extra={}){
 const counts={factoryCalls:0,factorySuccess:0,atomicInstalls:0,legacyReplaces:0},handles=[],entryFailures=[];
 const E=require('../../../../scripts/tests/final-production-runtime.cjs').get().E,dex=E.dex.createDexLookup();
 let nativeReflect;
 const h=await fixture({
  edit(game,content){
   // Registered content IDs retain real supported Showdown rule species for positive Sessions.
   const rules={A:'Pidgey',B:'Rattata',C:'Pidgeotto'},canonical={},forms={},speciesKeys={},speciesIds={};
   for(const [id,name]of Object.entries(rules)){assert(Object.hasOwn(rules,id));assert.equal(typeof name,'string');const definition=dex.species(name);assert(definition);canonical[name]={...content.species[id],contentId:id,form:0,ruleSpecies:name,base:{...definition.baseStats},types:[...definition.types],abilities:['Keen Eye'],gender:'M'};forms[id]={'0':name};speciesKeys[name]={species:id,form:0};speciesIds[id]=name;}
   // Formal species-key contract: storage uses ABC; content.species/Session use actual engine battle names.
   content.species=canonical;content.forms=forms;content.speciesKeys=speciesKeys;content.speciesIds=speciesIds;
   content.abilities.keeneye={id:'keeneye',name:'Keen Eye'};
   // Authored initial member, before the measured request; no acceptance sampling.
   game.party[0]=E.speciesKey.toPersistentMember(E.memberFactory.createMember({species:'Pidgey',level:5,id:game.party[0].id,owner:game.player},content,()=>0),content);
   game.party[0].moves=[{id:'tackle',pp:35,maxpp:35,ppUps:0}];
   content.trainerTypes={ace:{id:'ace',nameKey:'type.ace',gender:0,baseMoney:10,skillLevel:0,flags:[],items:[],source:'literal'}};
   content.registrationOrder=Object.keys(rules).map(species=>({species,form:0}));content.trainerTypeOrder=['ace'];content.trainers={npc:[{id:'npc',type:'ace',name:'Tester',version:0,party:[{species:'A',level:5,moves:['tackle']}],source:'literal'}]};
  },
  applicationPorts(ports){
   const actual=ports.sessions,create=actual.create;
   // Legacy no-held composition explicitly observes dynamic create on this exact private factory key.
   actual.create=async function(...args){counts.factoryCalls++;try{const handle=await Reflect.apply(create,actual,args);counts.factorySuccess++;handles.push(handle);return handle;}catch(error){entryFailures.push({at:'real-factory',error:String(error?.stack??error)});throw error;}};assert.equal(ports.sessions,actual);
   const replace=ports.state.replace;ports.state.replace=function(...args){counts.legacyReplaces++;return Reflect.apply(replace,this,args);};
  },
  nativeSetup(n){
   const parameters=n.G.PluginManager.parameters;
   // Synthetic authored content uses the existing explicit real-engine no-held fixture root.
   n.G.PluginManager.parameters=function(name){const current=Reflect.apply(parameters,this,[name]);return name==='PS_BattleFlow'?{...current,contentSource:'fixture'}:current;};
   nativeReflect=vm.runInContext('Reflect',n.G);const define=nativeReflect.defineProperty;
   nativeReflect.defineProperty=function(target,key,descriptor){if(target===n.G.$gameSystem&&key==='_psGame')counts.atomicInstalls++;return Reflect.apply(define,this,[target,key,descriptor]);};
  },
  afterPrepare:extra.afterPrepare,
 });
 const begin=h.flow.begin;h.flow.begin=async function(...args){try{return await Reflect.apply(begin,this,args);}catch(error){entryFailures.push({at:'real-flow-begin',error:String(error?.stack??error)});throw error;}};
 h.flow._dex=dex;assert(h.app.trainerRecord('npc',0),'actual legal Trainer must be registered');
 assert.equal(h.sessions.length,0,'fixture fake sessions are not the production Session factory');
 return {...h,counts,handles,entryFailures,ruleSpeciesTypes:Object.entries(h.content.species).map(([name,species])=>({name,type:typeof species.ruleSpecies}))};
}
function snapshot(h){return{game:structuredClone(h.state()),identity:h.state(),op:h.flow._op,running:h.flow.running,blocked:h.app.saveBlocked,generation:h.app.stateGeneration,seq:h.G.$gameSystem._psBattleSeq||0,counts:{...h.counts}};}
function delta(h,b){return Object.fromEntries(Object.keys(h.counts).map(k=>[k,h.counts[k]-b.counts[k]]));}
function unchanged(h,b,{generationChanged=false}={}){
 assert.equal(h.counts.factoryCalls-b.counts.factoryCalls,0);assert.equal(h.counts.factorySuccess-b.counts.factorySuccess,0);
 assert.equal(h.counts.atomicInstalls-b.counts.atomicInstalls,0);assert.equal(h.counts.legacyReplaces-b.counts.legacyReplaces,0);
 assert.equal(h.flow._op,b.op);assert.equal(h.flow.running,b.running);assert.equal(h.state(),b.identity);assert.deepEqual(h.state(),b.game);
 if(!generationChanged){assert.equal(h.app.saveBlocked,b.blocked);assert.equal(h.app.stateGeneration,b.generation);}
}
function args(trainer){return{battleId:id,...(trainer?{trainerId:'npc',version:'0'}:{foes:'pidgey:5'}),canLose:'false',canSwitch:'true',battleStyle:'set',expGain:'true',battleEffects:'inherit',noRun:'false',noBall:'false'};}
function invoke(h,trainer,overrides={}){return h.command(trainer?'StartTrainerBattle':'StartBattle',{...args(trainer),...overrides},new h.G.Game_Interpreter(),'PS_BattleFlow');}
function save(h,b,extra={}){record(id,h,{fixtureRuleSpeciesTypes:h.ruleSpeciesTypes,sessionMode:'real-engine legacy-no-held fixture content; original registered factory identity preserved',realFactoryAndNativeAtomicCounts:{before:b.counts,after:{...h.counts},delta:delta(h,b)},hostSequence:{before:b.seq,after:h.G.$gameSystem._psBattleSeq||0},actualAppGeneration:{before:b.generation,after:h.app.stateGeneration},...extra});}

test(id+' actual installed consumer preserves private busy distinction and nonbusy rejection',async()=>{
 if(id==='IF-BUSY-APIS'&&process.env.PF_FINAL_PRODUCTION_FAMILY==='legacy-capture-compat'){
  let armed=false,release;const h=await legacyBusyHost({afterPrepare({result}){if(armed&&result.status==='value'){armed=false;return new Promise(r=>release=r);}}});
  armed=true;const pending=h.command('RegisterEventCompanion',{eventId:'1'});for(let i=0;i<30&&!release;i++)await flush();assert(release);const b=snapshot(h);
  const actual=h.app.latchLegacyBattleContext(choices),fields=h.app.latchLegacyBattleFields({weather:'inherit',terrain:'none',environment:'none'}),generated=h.app.latchGeneratedWildBattleContext(choices);
  assert.equal(actual.status,'busy');assert.equal(fields.status,'unavailable');assert.equal(generated.status,'unavailable');unchanged(h,b);assert.equal(h.flow.worldAuthorInputPending(),true);
  const observed={actual,fields,generated};save(h,b,{observed,unrelatedOwnerPreserved:true});pending.interpreter.clear();release();await flush();return;
 }
 await runOrdinaryIF();
});

function nativePlayerObserver(sim){
 const prototype=sim.Battle.prototype,original=Object.getOwnPropertyDescriptor(prototype,'setPlayer'),rows=[];
 assert(typeof original?.value==='function'&&original.writable);
 let attempts=0;
 function observe(...args){
  attempts++;
  const result=Reflect.apply(original.value,this,args);
  if(rows.length<12)rows.push({battle:this,slot:args[0],name:args[1]?.name,packedTeam:args[1]?.team});
  return result;
 }
 Object.defineProperty(prototype,'setPlayer',{...original,value:observe});
 return {rows,attempts:()=>attempts,restore(){
  Object.defineProperty(prototype,'setPlayer',original);
  assert.deepEqual(Object.getOwnPropertyDescriptor(prototype,'setPlayer'),original);
 }};
}
function sessionRows(h){return h.flow.logger.entries().filter(row=>row.kind==='session.create');}
function normal(h){
 h.author.stable(h.flow.content(),h.state());
 assert.strictEqual(h.flow._content,h.loaded);
 assert.strictEqual(h.flow.app(),h.app);
 assert.strictEqual(h.app.ports.sessions,h.factory);
 assert.strictEqual(h.factory.create,h.create);
 assert.equal(h.flow.clock,null);assert.equal(h.flow.rng,null);
}
function observeState(h){
 const gameSystem=h.G.$gameSystem,slot=Object.getOwnPropertyDescriptor(gameSystem,'_psGame');
 assert.strictEqual(slot?.value,h.state());
 return{game:structuredClone(slot.value),gameSystem,slot,op:h.flow._op,appOp:h.app.op,
  running:h.flow.running,blocked:h.app.saveBlocked,generation:h.app.stateGeneration,
  seq:gameSystem._psBattleSeq||0,installs:h.installs(),players:h.native.attempts(),sessions:sessionRows(h).length};
}
function assertUnchanged(h,b,{generationChanged=false}={}){
 assert.equal(h.installs(),b.installs,'zero native _psGame installs');
 assert.equal(h.native.attempts(),b.players,'zero real Showdown setPlayer entries including dry probes');
 assert.equal(sessionRows(h).length,b.sessions,'zero real Session publications');
 assert.strictEqual(h.G.$gameSystem,b.gameSystem);
 assert.deepEqual(Object.getOwnPropertyDescriptor(b.gameSystem,'_psGame'),b.slot);
 assert.strictEqual(h.state(),b.slot.value,'no replacement via either state exposure');
 assert.deepEqual(h.state(),b.game,'no in-place business effect');
 assert.strictEqual(h.flow._op,b.op);assert.strictEqual(h.app.op,b.appOp);assert.equal(h.flow.running,b.running);
 if(!generationChanged){assert.equal(h.app.saveBlocked,b.blocked);assert.equal(h.app.stateGeneration,b.generation);}
}
function withLateContent(h,late,run){
 normal(h);
 assert.notStrictEqual(late,h.loaded);
 assert.equal(h.E.semantic.ownedImmutableFingerprint(late),undefined);
 try{run(late);}
 finally{h.flow._content=h.loaded;normal(h);}
}
function ordinaryRecord(h,b,extra){
 normal(h);
 record(id,h,{authorInput:h.author.evidence,fixtureRuleSpeciesTypes:Object.entries(h.loaded.species).map(([name,species])=>({name,type:typeof species.ruleSpecies})),
  sessionMode:'ordinary c355 IIFE and real required engine; no factory or App replacement',
  observedCommitAndEngineDeltas:{atomicInstalls:h.installs()-b.installs,showdownSetPlayer:h.native.attempts()-b.players,
   sessionPublications:sessionRows(h).length-b.sessions,stateObjectUnchanged:h.state()===b.slot.value},
  hostSequence:{before:b.seq,after:h.G.$gameSystem._psBattleSeq||0},
  actualAppGeneration:{before:b.generation,after:h.app.stateGeneration},...extra});
}
// R2 failed at the idle read, before command357: app.ports.state is only the business facade.
// This installed WorldOperation adapter reaches the same native registry without taking an owner.
function busyLeaseReader(h){
 const own=(owner,key)=>{
  const slot=Object.getOwnPropertyDescriptor(owner,key);
  assert(slot&&Object.hasOwn(slot,'value'),'expected installed own data slot: '+key);
  return slot.value;
 };
 const app=h.app,world=own(app,'world'),options=own(world,'options'),atomic=own(options,'blackoutAtomic');
 const travel=own(options,'travel'),source=own(travel,'nativeLeaseSource');
 assert.equal(typeof atomic,'function');
 assert.strictEqual(travel,own(own(app,'ports'),'worldTravel'));
 return (expectedGame,expectedGeneration)=>{
  assert.strictEqual(own(h.flow,'_app'),app);
  assert.strictEqual(own(app,'world'),world);assert.strictEqual(own(world,'options'),options);
  assert.strictEqual(own(options,'blackoutAtomic'),atomic);assert.strictEqual(own(travel,'nativeLeaseSource'),source);
  const system=h.G.$gameSystem,installs=h.installs();
  assert.strictEqual(own(system,'_psGame'),expectedGame);
  const proof=Reflect.apply(atomic,options,[()=>actual=>({value:{
   sameGame:actual.game===expectedGame,sameContent:actual.content===h.loaded,
   application:actual.lifecycle.application,generation:actual.generation,lease:actual.lifecycle.travelLease,
  }})]); // No next: observation only, including while the companion owner is active.
  assert.equal(h.installs(),installs,'observer cannot install state');
  assert.strictEqual(h.G.$gameSystem,system);assert.strictEqual(own(system,'_psGame'),expectedGame);
  assert.equal(proof.sameGame,true);assert.equal(proof.sameContent,true);
  assert.strictEqual(proof.application,app);assert.equal(proof.generation,expectedGeneration);
  assert.strictEqual(proof.lease?.registry,source);
  return proof.lease;
 };
}
async function realBusyAPIs(h,b,localXHR){
 const {G}=h,manager=G.SceneManager,scene=manager._scene,map=G.$gameMap,player=G.$gamePlayer,data=h.maps[5];
 const interpreter=map._interpreter,event=map.event(1),raw=data.events[1],url='data/Map005.json';
 const readLease=busyLeaseReader(h),initialLease=readLease(b.slot.value,b.generation),initialBirth=initialLease.mapBirth;
 assert.strictEqual(G.XMLHttpRequest,localXHR.ctor,'only the captured synthetic local map transport may be used');
 assert(scene instanceof G.Scene_Map&&scene.isStarted()&&manager._nextScene===null&&map.mapId()===5);
 assert(interpreter instanceof G.Game_Interpreter&&!interpreter.isRunning());
 assert.equal(interpreter._waitMode,'');assert.equal(interpreter._psWorldAuthorOutcome,undefined);
 assert(event instanceof G.Game_Event);assert.strictEqual(event.event(),raw);
 assert.strictEqual(G.$dataMap,data);assert.strictEqual(localXHR.data,data);
 assert(initialBirth?.frame&&initialLease.nativeEpoch&&initialLease.companionPreparedOrigin==null);
 assert.strictEqual(initialBirth.manager,manager);assert.strictEqual(initialBirth.scene,scene);
 assert.strictEqual(initialBirth.frame.map,map);assert.equal(initialBirth.frame.mapId,5);
 assert.strictEqual(initialBirth.frame.player,player);assert.strictEqual(initialBirth.frame.data,data);
 assert.equal(initialLease.current,null);assert.equal(h.flow.worldAuthorInputPending(),false);
 assert.equal(h.flow.companionNativePending(),false);assert.equal(G.PSWorld.pending(),false);
 assert.equal(h.records().length,0);
 const rawMap=JSON.stringify(data),requestsAtStart=h.requests.length;
 const assertWait=()=>{
  assert.strictEqual(manager._scene,scene);assert.equal(manager._nextScene,null);
  assert.strictEqual(G.$gameMap,map);assert.strictEqual(G.$gamePlayer,player);assert.strictEqual(G.$dataMap,data);
  assert.strictEqual(map._interpreter,interpreter);assert.strictEqual(map.event(1),event);assert.strictEqual(event.event(),raw);
  assert.equal(interpreter._eventId,1);assert(interpreter.isRunning());
  assert.equal(interpreter._waitMode,'psWorldAuthor');assert.equal(interpreter._psWorldAuthorOutcome,undefined);
  assert.equal(h.flow.worldAuthorInputPending(),true);assert.equal(h.app.saveBlocked,true);assert.equal(h.flow.running,false);
 };
 const preparedAtSend=()=>{
  assertWait();assertUnchanged(h,{...b,blocked:true});
  assert.equal(h.G.$gameSystem._psBattleSeq||0,b.seq);assert.equal(h.records().length,0);
  const lease=readLease(b.slot.value,b.generation),birth=lease.mapBirth,origin=lease.companionPreparedOrigin;
  assert(origin?.prepared?.action&&birth?.frame,'no native post-prepare registration publication for this request');
  assert.strictEqual(lease.registry,initialLease.registry);assert.strictEqual(lease.nativeEpoch,initialLease.nativeEpoch);
  assert.equal(lease.current,null);assert.strictEqual(birth.birth,initialBirth.birth);assert.strictEqual(birth.queue,initialBirth.queue);
  assert.strictEqual(origin.manager,manager);assert.strictEqual(origin.scene,scene);
  assert.strictEqual(origin.birth,birth.birth);assert.strictEqual(origin.queue,birth.queue);assert.strictEqual(origin.epoch,lease.nativeEpoch);
  assert.strictEqual(origin.map,map);assert.equal(origin.mapId,5);assert.strictEqual(origin.player,player);assert.strictEqual(origin.data,data);
  assert.strictEqual(origin.application,h.app);assert.equal(origin.generation,b.generation);
  assert.strictEqual(origin.origin.nativeEvent,event);assert.strictEqual(origin.origin.rawEvent,raw);assert.equal(origin.origin.originEventId,1);
  const action=origin.prepared.action;
  assert.equal(action.kind,'register');assert.equal(action.candidate.originMapId,5);assert.equal(action.candidate.originEventId,1);
  assert.equal(origin.actionIdentity,h.E.semantic.semanticFingerprint(action));
  return origin;
 };
 // Only this selector, after bootstrap. The pinned fixture's original send queues the real local
 // response from maps[5]; do not construct a replacement response or invoke onload ourselves.
 const proto=localXHR.ctor.prototype,open=localXHR.open,send=localXHR.send,exact=new WeakSet(),later=[];
 assert.deepEqual(Object.getOwnPropertyDescriptor(proto,'open'),open);
 assert.deepEqual(Object.getOwnPropertyDescriptor(proto,'send'),send);
 let held,proofFailure,releases=0,receipt;
 function watchOpen(...args){
  const result=Reflect.apply(open.value,this,args);
  exact.delete(this);if(args.length===2&&args[0]==='GET'&&args[1]===url)exact.add(this);
  return result;
 }
 function watchSend(...args){
  if(!exact.has(this))return Reflect.apply(send.value,this,args);
  if(releases){
   later.push({receiver:this,installs:h.installs()-b.installs});
   return Reflect.apply(send.value,this,args);
  }
  try{
   assert(!held,'unexpected second exact source send while registration is held');
   assert.equal(args.length,0);assert.equal(this.url,url);assert.equal(typeof this.onload,'function');
   assert.equal(this.status,undefined);assert.equal(this.responseText,undefined);
   const origin=preparedAtSend();
   held={receiver:this,args,origin,onload:this.onload,frame:G.Graphics.frameCount};
   return; // The original synthetic send returns undefined; its reply has not been queued yet.
  }catch(error){proofFailure??=error;return Reflect.apply(send.value,this,args);}
 }
 const command='RegisterEventCompanion';
 try{
  Object.defineProperty(proto,'open',{...open,value:watchOpen});
  Object.defineProperty(proto,'send',{...send,value:watchSend});
  interpreter.setup([{code:357,indent:0,parameters:['PS_World',command,command,{eventId:'1'}]},{code:0,indent:0,parameters:[]}],1);
  h.tick(); // The original Scene_Map/Game_Map interpreter loop enters command357.
  for(let i=0;i<30&&!held&&!proofFailure;i++)await flush();
  if(proofFailure)throw proofFailure;
  assert(held,'no held native registration source request from ordinary command357');
  assert.equal(G.Graphics.frameCount,held.frame,'no native frame advance after the source wait');
  assert.strictEqual(preparedAtSend(),held.origin);
  const whileHeld=observeState(h);
  const actual=h.app.latchLegacyBattleContext(choices),fields=h.app.latchLegacyBattleFields({weather:'inherit',terrain:'none',environment:'none'}),generated=h.app.latchGeneratedWildBattleContext(choices);
  assert.equal(actual.status,'busy');assert.equal(fields.status,'unavailable');assert.equal(generated.status,'unavailable');
  assertUnchanged(h,whileHeld);assert.strictEqual(preparedAtSend(),held.origin);normal(h);
  assert.strictEqual(held.receiver.onload,held.onload);assert.equal(held.receiver.responseText,undefined);
  assert.deepEqual(h.requests.slice(requestsAtStart),[['GET',url]]);
  const paused={nativeOriginStillHeld:true,waitMode:interpreter._waitMode,frame:held.frame,
   atomicInstalls:h.installs()-b.installs,showdownSetPlayer:h.native.attempts()-b.players,sessionPublications:sessionRows(h).length-b.sessions};

  releases++;
  Reflect.apply(send.value,held.receiver,held.args);
  await flush();
  const finished=()=>interpreter._psWorldAuthorOutcome!==undefined&&!interpreter.isRunning()&&!h.app.saveBlocked;
  for(let i=0;i<48&&!finished();i++){h.tick();await flush();}
  assert(finished(),'ordinary Map did not retire its same command357 waiter: '+JSON.stringify({wait:interpreter._waitMode,
   outcome:interpreter._psWorldAuthorOutcome,pending:h.flow.worldAuthorInputPending(),blocked:h.app.saveBlocked}));
  const outcome=interpreter._psWorldAuthorOutcome;
  assert.equal(outcome.command,command);assert.equal(outcome.status,'completed',JSON.stringify(outcome));
  assert.equal(interpreter._waitMode,'');assert.strictEqual(map._interpreter,interpreter);assert.strictEqual(manager._scene,scene);
  assert.equal(h.flow.worldAuthorInputPending(),false);assert.equal(h.flow.companionNativePending(),false);
  assert.equal(readLease(h.state(),b.generation).companionPreparedOrigin,null);
  assert.equal(held.receiver.status,0);assert.equal(held.receiver.responseText,rawMap);assert.strictEqual(held.receiver.onload,held.onload);
  assert(later.length>0,'ordinary post-install projection must also consume its native source');
  for(const row of later){
   assert.notStrictEqual(row.receiver,held.receiver);assert.equal(row.installs,1);
   assert.equal(row.receiver.status,0);assert.equal(row.receiver.responseText,rawMap);
  }
  assert.deepEqual(h.requests.slice(requestsAtStart),Array.from({length:1+later.length},()=>['GET',url]));
  assert.equal(releases,1);assert.equal(h.installs()-b.installs,1);assert.notStrictEqual(h.state(),b.slot.value);
  const expected=structuredClone(b.game);expected.world.companions.push(structuredClone(held.origin.prepared.action.candidate));
  assert.deepEqual(structuredClone(h.state()),expected,'only the originally prepared companion registration committed');
  assert.equal(h.native.attempts(),b.players);assert.equal(sessionRows(h).length,b.sessions);assert.equal(h.G.$gameSystem._psBattleSeq||0,b.seq);
  assert.equal(h.app.stateGeneration,b.generation);assert.equal(h.flow.running,false);
  receipt={observed:{actual,fields,generated},unrelatedOwnerPreserved:true,whileHeld:paused,
   prepared:{action:'register',mapId:5,eventId:1,actionIdentity:held.origin.actionIdentity},
   transport:{method:'GET',url,heldOriginalReleases:releases,postInstallDelegates:later.length,sameLocalRawResponse:true},
   nativeWait:{sameMapInterpreter:true,retired:true,outcome},postStateAssertionsReached:true};
 }finally{
  Object.defineProperty(proto,'open',open);Object.defineProperty(proto,'send',send);
  assert.deepEqual(Object.getOwnPropertyDescriptor(proto,'open'),open);
  assert.deepEqual(Object.getOwnPropertyDescriptor(proto,'send'),send);
 }
 ordinaryRecord(h,b,receipt);
}
// Renderer boundary for the two real Map→battle IF controls. No scene readiness,
// clock, Map/battle transition, App or session method is replaced here.
function sessionRenderer(G,root){
 const core=fs.readFileSync(path.join(root,'js/reactor_core.js'),'utf8');
 const handles=new WeakMap(),Sprite=G.Sprite;
 G.Sprite=function HeadlessIFSprite(bitmap){
  Reflect.apply(Sprite,this,[]);this.bitmap=bitmap??null;
 };
 G.Sprite.prototype=Sprite.prototype;
 const spriteDestroy=Sprite.prototype.destroy;
 Sprite.prototype.destroy=function(...args){
  const result=Reflect.apply(spriteDestroy,this,args),row=handles.get(this);
  if(row)row.spriteDisposals++;
  return result;
 };
 G.Bitmap=function HeadlessIFBitmap(width,height){
  assert(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0);
  const row={width,height,paints:[],spriteDisposals:0,bitmapDisposals:0};
  handles.set(this,row);
  this.width=width;this.height=height;
  this.context={save(){},restore(){},fillRect(x,y,w,h){row.paints.push([x,y,w,h,this.fillStyle]);}};
  this._baseTexture={update(){}};
 };
 for(const name of ['fillAll','fillRect'])method(G,core,'Bitmap.prototype.'+name);
 G.Bitmap.prototype.destroy=function(){handles.get(this).bitmapDisposals++;};
 G.Bitmap.prototype.drawText=function(){};
 G.Rectangle=function(x,y,width,height){Object.assign(this,{x,y,width,height});};
 const commands=G.Window_Command.prototype;
 if(typeof commands.initialize!=='function')commands.initialize=function(...args){
  return Reflect.apply(G.Window_Base.prototype.initialize,this,args);
 };
 function container(target){
  target.children??=[];
  target.addChildAt=function(child,index){
   if(child.parent)child.parent.removeChild(child);
   this.children.splice(index,0,child);child.parent=this;
   const row=handles.get(child.bitmap);
   if(row)handles.set(child,row);
   return child;
  };
  target.addChild=function(child){return this.addChildAt(child,this.children.length);};
  target.removeChild=function(child){
   const index=this.children.indexOf(child);
   assert(index>=0&&child.parent===this);
   this.children.splice(index,1);child.parent=null;return child;
  };
 }
 const map=G.Scene_Map.prototype,createMapDisplay=map.createDisplayObjects;
 map.createDisplayObjects=function(...args){
  const out=Reflect.apply(createMapDisplay,this,args);
  container(this);
  // The donor omits visual message window creation. The existing Map/start,
  // busy and update paths still decide whether/when Prebattle may start.
  this._messageWindow={isClosing:()=>false};
  return out;
 };
 const menu=G.Scene_MenuBase.prototype,createMenu=menu.create;
 menu.create=function(...args){
  const out=Reflect.apply(createMenu,this,args);
  if(this._psBattle===true){
   container(this);this._windowLayer={};container(this._windowLayer);this.addChild(this._windowLayer);
   this.addWindow=function(win){return this._windowLayer.addChild(win);};
  }
  return out;
 };
 return {inspect(sprite){return handles.get(sprite);}};
}
async function runOrdinaryIF(){
 const current=runtime.get(),{E,root}=current;
 const sim=require(path.join(root,'js/engine/showdown/dist/sim'));
 let author,restoreAtomic,atomicInstalls=0,native,renderer,localXHR,h;
 try{
  const fixtureHost=await fixture({
   ordinaryAuthorInput(){assert(author,'author input must precede the ordinary IIFE');return author;},
   edit(game,content){
    author=ordinaryAuthor.prepare(current,id,game.party[0].id);
    for(const key of Object.keys(content))delete content[key];
    Object.assign(content,author.initialContent);
    author.seedGame(game);
   },
   nativeSetup(n,host){
    if(id.endsWith('-SESSION'))renderer=sessionRenderer(n.G,root);
    if(id==='IF-BUSY-APIS'){
     const ctor=n.G.XMLHttpRequest;
     const open=Object.getOwnPropertyDescriptor(ctor.prototype,'open'),send=Object.getOwnPropertyDescriptor(ctor.prototype,'send');
     assert(typeof open?.value==='function'&&typeof send?.value==='function'&&open.configurable&&send.configurable);
     localXHR={ctor,open,send,data:host.maps[5]};
    }
    const reflect=vm.runInContext('Reflect',n.G),original=Object.getOwnPropertyDescriptor(reflect,'defineProperty');
    function observe(...args){
     if(args[0]===n.G.$gameSystem&&args[1]==='_psGame')atomicInstalls++;
     return Reflect.apply(original.value,this,args);
    }
    Object.defineProperty(reflect,'defineProperty',{...original,value:observe});
    restoreAtomic=()=>{Object.defineProperty(reflect,'defineProperty',original);assert.deepEqual(Object.getOwnPropertyDescriptor(reflect,'defineProperty'),original);};
   },
  });
  assert.strictEqual(Object.getPrototypeOf(fixtureHost.app),E.app.GameApplication.prototype);
  const loaded=fixtureHost.flow.content(),factory=fixtureHost.app.ports.sessions;
  assert.equal(typeof factory.create,'function');
  assert(fixtureHost.app.trainerRecord('npc',0),'actual legal compiled Trainer must be registered');
  assert.equal(fixtureHost.sessions.length,0,'fixture fake sessions are not the production Session factory');
  native=nativePlayerObserver(sim);
  h={...fixtureHost,author,loaded,factory,create:factory.create,E,native,renderer,installs:()=>atomicInstalls};
  normal(h);
  const trainer=id.startsWith('IF-TRAINER'),b=observeState(h);
  assert.equal(b.blocked,false);assert.equal(b.running,false);
  if(id==='IF-BUSY-APIS'){await realBusyAPIs(h,b,localXHR);return;}
  if(id.endsWith('-META')&&id!=='IF-INVALID-META'){
   const late={...h.loaded};delete late.mapMetadata;
   withLateContent(h,late,invalid=>{
    h.flow._content=invalid;assert.strictEqual(h.flow.content(),invalid);
    assert.throws(()=>invoke(h,trainer),/map metadata: world-provider-unavailable/);
    assertUnchanged(h,b);assert.equal(h.G.$gameSystem._psBattleSeq,b.seq+1);
   });
   ordinaryRecord(h,b,{postStateAssertionsReached:true,legalTrainer:trainer,lateMetadata:'absent-runtime-slot',originalRestored:true});
   return;
  }
  if(id.endsWith('-ARGS')){
   assert.throws(()=>invoke(h,trainer,{battleEnvironment:'unknown-environment'}),/unsupported world battle environment/);
   assertUnchanged(h,b);assert.equal(h.G.$gameSystem._psBattleSeq||0,b.seq);
   ordinaryRecord(h,b,{unknownValueRejectedBeforeSequenceAndCapture:true});return;
  }
  if(id.endsWith('-SESSION')){
   await realSession(h,b,trainer,sim);return;
  }
  if(id==='IF-GENERATION'){
   const issued=h.app.latchLegacyBattleContext(choices);assert.equal(issued.status,'value');h.flow.stateReplaced();assert(h.app.stateGeneration>b.generation);
   assert.equal(h.app.isLegacyBattleFieldCurrent(issued.value),false);
   const accepted=h.flow.tryOpenBattle({battleId:id,kind:'wild',foes:[{species:'pidgey',level:5}],seq:1},undefined,issued.value);assert.equal(accepted,false);
   assertUnchanged(h,b,{generationChanged:true});
   ordinaryRecord(h,b,{actualStateReplaced:true,genuineOldLatchRejected:true,consumer:'real PSFlow.tryOpenBattle'});return;
  }
  if(id==='IF-HOUR'){
   h.author.withClockFault(()=>NaN,()=>assert.throws(()=>invoke(h,false),/world hour/));
   assertUnchanged(h,b);ordinaryRecord(h,b,{unknownHourRejected:true});return;
  }
  if(id==='IF-INVALID-META'){
   const mapMetadata=h.loaded.mapMetadata,maps={...mapMetadata.maps,[5]:{...mapMetadata.maps[5],environment:'unknown-environment'}};
   withLateContent(h,{...h.loaded,mapMetadata:{...mapMetadata,maps}},invalid=>{
    h.flow._content=invalid;assert.strictEqual(h.flow.content(),invalid);
    assert.throws(()=>invoke(h,false),/legacy-world-capture:invalid map battle environment/);
    assertUnchanged(h,b);
   });
   ordinaryRecord(h,b,{invalidMetadataRejected:true,lateMetadata:'malformed-runtime-slot',originalRestored:true});return;
  }
  if(id==='IF-SOURCE'||id==='IF-CONTENT'){
   const fault=edit=>h.author.withClockFault(()=>{edit();return h.G.Date.now();},()=>{
    assert.throws(()=>invoke(h,false),/legacy-world-(?:capture|source|business|weather)|atomic-/);
    assertUnchanged(h,b);
   });
   if(id==='IF-SOURCE'){
    const x=h.player._x;
    try{fault(()=>{h.player._x=x+1;assert.equal(h.player.x,x+1);});}
    finally{h.player._x=x;assert.equal(h.player.x,x);}
   }else{
    const late={...h.loaded};
    assert.equal(E.semantic.semanticFingerprint(late),E.semantic.ownedImmutableFingerprint(h.loaded));
    withLateContent(h,late,invalid=>fault(()=>{h.flow._content=invalid;assert.strictEqual(h.flow.content(),invalid);}));
   }
   ordinaryRecord(h,b,{actualTrustedClockFault:id,realSourceOrContentChanged:true,originalRestored:true});return;
  }
  throw Error('unimplemented explicit legacy control '+id);
 }finally{
  try{native?.restore();}
  finally{try{restoreAtomic?.();}finally{author?.dispose();}}
 }
}
async function realSession(h,b,trainer,sim){
 const {G}=h,manager=G.SceneManager,map=manager._scene,stackDepth=manager._stack.length;
 assert(map instanceof G.Scene_Map&&map.isStarted()&&map._spriteset&&map._messageWindow);
 const battleId=id+'#'+(b.seq+1),kind=trainer?'trainer':'wild';
 let op,matched,c,scene,backdrop,cover,proof,popped=false;
 try{
  c=invoke(h,trainer);
  assert.equal(c.returned,true);assert.equal(c.interpreter._waitMode,'psBattle');
  assert.equal(c.interpreter._psBattleId,battleId);
  assert.strictEqual(manager._scene,map);
  assert.equal(h.flow._op.prebattleMode,'default-map');
  assert.equal(h.flow.prebattleState().phase,'flash');
  assert.equal(map.isBusy(),true);
  assert.equal(h.native.attempts(),b.players,'no Showdown before the Map transition');
  cover=map.children.find(child=>{const row=h.renderer.inspect(child);return row?.width===1&&row.height===1;});
  assert(cover&&cover.parent===map&&cover.bitmap);
  const coverRow=h.renderer.inspect(cover);
  await h.pump(()=>{
   const observed=h.flow.prebattleState();
   assert.equal(observed.primaryError,null);
   if(observed.phase!=='battle'){
    assert.strictEqual(manager._scene,map);
    assert.strictEqual(cover.parent,map);
    assert.equal(h.native.attempts(),b.players);
   }
   return !!h.flow._op?.session&&manager._scene?._psBattle===true&&manager._scene.isStarted();
  },200);
  op=h.flow._op;scene=manager._scene;
  assert.strictEqual(scene._psOp,op);
  assert.strictEqual(scene._session,op.session);
  assert.equal(scene._failure,null);
  const phases=h.flow.prebattleState(),stages=Array.from(phases.stages);
  assert.deepEqual(stages.map(stage=>stage.phase),['flash','transition','after','battle']);
  assert.deepEqual(stages.map(stage=>stage.targetMs),[800,trainer?1000:1250,100,0]);
  for(let i=1;i<stages.length;i++){
   assert(stages[i].frame>stages[i-1].frame);
   assert(stages[i].at-stages[i-1].at>=stages[i-1].targetMs);
  }
  assert.equal(cover.parent,null);assert.equal(cover.bitmap,null);
  assert.equal(map.children.includes(cover),false);
  assert.equal(coverRow.spriteDisposals,1);assert.equal(coverRow.bitmapDisposals,1);
  assert(coverRow.paints.some(row=>row[4]==='#ffffff')&&coverRow.paints.some(row=>row[4]==='#000000'));
  const ready=scene.battlebackState();assert.equal(ready?.ready,true);assert.equal(ready.retired,false);
  backdrop=scene.children.find(child=>{const row=h.renderer.inspect(child);return row?.width===G.Graphics.boxWidth&&row.height===G.Graphics.boxHeight;});
  assert(backdrop?.parent===scene&&backdrop.bitmap);
  proof={frames:stages.map(stage=>stage.frame),stages:stages.map(({phase,at,targetMs})=>({phase,at,targetMs})),
   ownedSourceMapCoverRetired:true,actualBattleSceneStarted:true,backdropReady:true};
  assert.equal(op.request.battleId,battleId);assert.equal(op.request.kind,kind);
  assert.equal(op.worldAdmission.battleId,battleId);
  assert.strictEqual(Object.getPrototypeOf(op.session),h.E.session.BattleSession.prototype);
  assert.equal(op.session.battleId,battleId);assert.strictEqual(op.session.content,h.loaded);
  assert.strictEqual(h.app.op.session,op.session);assert.equal(h.app.op.battleId,battleId);
  assert.equal(h.app.bornIn.get(op.session),b.generation);
  assert.equal(h.app.battleContexts.get(op.session).generation,b.generation);
  assert.equal(h.sessions.length,0);assert.equal(h.flow.running,true);assert.equal(h.G.$gameSystem._psBattleSeq,b.seq+1);
  assert.equal(c.interpreter.updateWaitMode(),true);
  const gameRows=sessionRows(h).slice(b.sessions);
  assert.equal(gameRows.length,1);assert.equal(gameRows[0].battleId,battleId);
  assert.equal(gameRows[0].data.format,'gen8rpgcustomgame');assert.equal(gameRows[0].data.foe.kind,kind);
  assert.equal(gameRows[0].data.seed,null,'normal session seed must not be forced');
  const request=h.flow.logger.entries().find(row=>row.battleId===battleId&&row.kind==='request'&&row.data.side==='p1'&&!row.data.wait);
  assert(request,'real Session ingested an actual player request');
  const {gw}=op.session;
  assert.strictEqual(Object.getPrototypeOf(gw),h.E.gateway.BattleGateway.prototype);
  assert.strictEqual(gw._env.sim,sim);
  const receiver=gw._debugBattle(),rows=h.native.rows.slice(b.players);
  assert.equal(h.native.attempts()-b.players,4);assert.equal(rows.length,4);
  const probes=rows.filter(row=>row.battle!==receiver);matched=rows.filter(row=>row.battle===receiver);
  assert.deepEqual(probes.map(({slot,name})=>[slot,name]),[['p1','p'],['p2','q']]);
  assert.strictEqual(probes[0].battle,probes[1].battle);
  assert.deepEqual(matched.map(({slot,name})=>[slot,name]),[['p1','Player'],['p2',trainer?'Trainer':'Wild']]);
  assert(matched.every(row=>typeof row.packedTeam==='string'&&row.packedTeam.length>0));
  assert.strictEqual(Object.getPrototypeOf(receiver),sim.Battle.prototype);
  assert.strictEqual(receiver.setPlayer,receiver.format.battle.setPlayer);
  assert.equal(receiver.gen,8);assert.equal(receiver.format.id,'gen8rpgcustomgame');
  assert.equal(receiver.started,true);assert.equal(receiver.ended,false);
  assert.deepEqual(receiver.sides.map(side=>side.pokemon.map(member=>member.species.id)),[['pidgey'],['pidgey']]);
  const seed=gw.prngSeed();assert.equal(seed,receiver.prngSeed);assert.match(seed,/^sodium,[0-9a-f]{32}$/);
  proof={...proof,entry:{positiveRealSession:true,kind,sessionFactoryFulfilled:true,hostSessionSameActualHandle:true,
   battleId,nativeWait:c.interpreter._waitMode,realShowdown:{gen:receiver.gen,format:receiver.format.id,
    slots:matched.map(({slot,name})=>({slot,name})),separateNativeMoveProbeCalls:probes.length,seed,actualPlayerRequest:request.n}}};
 }catch(error){
  ordinaryRecord(h,b,{positiveControlFailure:String(error),lastOutcome:h.flow.lastOutcome??null,
   lastPrebattle:h.flow.prebattleState(),matchedNativeCalls:matched?.length??null,actualPublishedSession:!!h.flow._op?.session});
  throw error;
 }finally{
  const owned=h.flow._op;
  if(owned&&owned.request.battleId===battleId){
   h.app.abortBattle({battleId},Error('bounded-positive-control-stop'));
   h.flow.close(0,owned,false);
   const active=manager._scene;
   if(active?._psOp===owned&&active._psBattle===true){
    assert(manager._stack.length===stackDepth+1);
    active.popScene();
    await h.pump(()=>manager._scene instanceof G.Scene_Map&&manager._scene!==map&&manager._scene.isStarted(),30);
    assert.equal(manager._stack.length,stackDepth);
    popped=true;
   }
   assert.equal(h.flow.running,false);
  }
 }
 assert(popped&&backdrop&&scene);
 const row=h.renderer.inspect(backdrop);
 assert.equal(backdrop.parent,null);assert.equal(backdrop.bitmap,null);
 assert.equal(scene.children.includes(backdrop),false);
 assert.equal(row.spriteDisposals,1);assert.equal(row.bitmapDisposals,1);
 assert.equal(scene.battlebackState().retired,true);
 assert.equal(c.interpreter.updateWaitMode(),false);
 const {entry,...prebattle}=proof;
 ordinaryRecord(h,b,{...entry,prebattle:{...prebattle,actualBattleScenePopped:true,ownedBackdropRetired:true}});
}
