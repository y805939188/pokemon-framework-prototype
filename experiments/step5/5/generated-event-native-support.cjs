'use strict';
// Complete production engine/IIFEs supplied by the explicit private recipe; native Scene/Interpreter remain pinned.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
assert(process.env.PF_GIVEN_BUNDLES,'explicit generated production bundles required');process.env.PF_E3_JOINT_OUT=process.env.PF_GIVEN_BUNDLES;
const E=require(path.join(process.env.PF_GIVEN_BUNDLES,'production.cjs')),{fixture:base,flush}=require('./ui-wire-e3-fixtures.cjs');
const {realContent}=require('./given-wild-support.cjs');
const {ordinaryC,ordinaryStarted,exitToMap,failedPush}=require('./c-ordinary-wild-host.cjs');
async function fixture(options={}){
 const sessions=[],seedCalls=[],observed=[];let setupGame;
 let pid=0;
 const ordinary=ordinaryC({hour:12,valueForBound:n=>n===65536?(++pid===2?(options.real?8:65535):0):0});
 const sample=options.real?realContent():null;
 const registrations=[];let h,restoreRegistration;
 try{h=await base({ordinaryC:ordinary,nativeSetup(n){
  ordinary.nativeSetup(n.G);
  const P=n.G.PluginManager,register=P.registerCommand;
  P.registerCommand=function(...args){registrations.push(args);return Reflect.apply(register,this,args);};
  restoreRegistration=()=>{P.registerCommand=register;};
 },edit(game,content){
  if(sample){const world=content.world,maps=content.mapMetadata;Object.assign(content,structuredClone(sample.content));content.world=world;content.mapMetadata=maps;const wild=Object.values(content.species).find(sp=>sp.contentId==='milcery-test');assert(wild);wild.wildItemCommon=wild.wildItemUncommon=wild.wildItemRare=['ribbonsweet'];const party=Array.from({length:options.fullParty?6:1},(_,i)=>E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:'P'+(i+1),species:'Snorlax',level:50},content,()=>0),content));Object.assign(game,E.state.newGame({content,party,bag:{masterball:1}}));}
  game.world.repelSteps=50;game.party.forEach(m=>m.hp=Math.max(1,m.hp));content.mapMetadata.maps[5].environment='grass';content.mapMetadata.maps[5].weather={type:'Rain',chance:100};game.world.weather.type='Rain';content.world.encounters.tables=[];
  options.edit?.(game,content);setupGame=game;
 },applicationPorts(ports){
  if(options.real){const factory=E.composition.createBattleSessionFactory({content:()=>ports.content().content,seed(){seedCalls.push([1,2,3,4]);return[1,2,3,4];}});ports.sessions=factory;}
  else ports.sessions={async create(request,view,setup){const handle={result(){throw Error('unfinished opaque session');}};sessions.push({request,view,setup,handle});if(options.sessionFailure)throw Error('fixture-session-start-failed');return handle;}};
 }});}finally{restoreRegistration?.();}
 const G=h.G;if(sample)G.PSFlow._dex=sample.dex;const managerSource=fs.readFileSync(path.join(process.env.PF_E3_NATIVE_ROOT,'js/reactor_managers.js'),'utf8');G.PluginManager._commands={};for(const name of ['registerCommand','callCommand']){const key='PluginManager.'+name,a=managerSource.indexOf(key+' = function'),b=managerSource.indexOf('\n};',a);assert(a>=0&&b>a);vm.runInContext(managerSource.slice(a,b+4),G,{filename:'pinned-native:'+key});}assert(registrations.some(([p,n])=>p==='PS_BattleFlow'&&n==='StartBattle'));for(const args of registrations){G.PluginManager.registerCommand(...args);assert.equal(G.PluginManager._commands[args[0]+':'+args[1]],args[2]);}
 // The earlier source harness deliberately omits battle raster/start. Actual
 // construction/create, real MZ queue, native Map stages and Session stay live.
 G.Scene_PSBattle.prototype.isReady=function(){return false;};
 ordinary.assertOrdinary(G);
 const old=G.SceneManager._scene;G.SceneManager.goto(G.Scene_Map);await h.pump(()=>G.SceneManager._scene!==old&&G.SceneManager._scene.isStarted()&&!h.app.saveBlocked&&!G.PSWorld.pending());
 G.$gameSystem.disableEncounter();assert.equal(G.$gameSystem.isEncounterEnabled(),false);G.$dataSystem.switches=Array.from({length:33},(_,id)=>'FixtureSwitch'+id);G.$gameSwitches.setValue(31,!!options.shiny);G.$gameSwitches.setValue(32,!!options.fateful);
 G.entryObservation=observed;G.generatedInput={battleId:'native-generated',seq:1,species:options.real?'milcery-test':'B',level:2};
 return {...h,E,G,sessions,ordinary,seedCalls,observed,setupGame,event(script){const I=G.$gameMap._interpreter;I.setup([{code:355,indent:0,parameters:[script]},{code:0,indent:0,parameters:[]}],0);assert.equal(I.isRunning(),true);assert.equal(G.$gameMap.isEventRunning(),true);I.update();},open(fields=''){this.event("entryObservation.push({same:this===$gameMap._interpreter,running:this.isRunning(),event:$gameMap.isEventRunning(),disabled:!$gameSystem.isEncounterEnabled(),repel:$gameSystem._psGame.world.repelSteps});PSFlow.openGeneratedWildBattle(generatedInput"+fields+");this._psBattleId=generatedInput.battleId;this.setWaitMode('psBattle');");},async started(interpreter){
  const F=G.PSFlow;return ordinaryStarted(this,F._op,G.SceneManager._scene,interpreter);
 },async abortAndReturn(interpreter,reason){
  const F=G.PSFlow,scene=G.SceneManager._scene,battleId=F.request.battleId;
  F.abort(Error(reason));assert.equal(F.lastOutcome.commit,'none');assert.equal(F.lastOutcome.battleId,battleId);
  assert.equal(Object.hasOwn(this.state().appliedBattles,battleId),false);
  await exitToMap(this,scene,interpreter,{aborted:true});
 },exitToMap(interpreter){return exitToMap(this,G.SceneManager._scene,interpreter);},
 failedPush(trigger,options){return failedPush(this,trigger,options);}};
}
module.exports={fixture,E,flush};
