'use strict';
// Explicit current-production IIFEs + actual MZ interpreter355/Scene handoff; rendering resources are headless.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ordinaryC,ordinaryStarted,exitToMap,failedPush}=require('../../support/world/ordinary-wild-host.cjs');
const {E,copy,member}=require('../../support/world/given-wild-support.cjs');
assert(process.env.PF_GIVEN_BUNDLES,'explicit private IIFE support required');
process.env.PF_E3_JOINT_OUT=process.env.PF_GIVEN_BUNDLES;
const {fixture:base}=require('../../support/field/ui-wire-world-fixtures.cjs');
async function fixture(){
 const sessions=[],ordinary=ordinaryC({hour:23});
 const h=await base({ordinaryC:ordinary,nativeSetup(n){ordinary.nativeSetup(n.G); },edit(game,content){game.party[0].hp=20;content.moves.tackle=content.moves.Tackle;content.mapMetadata.maps[5].weather={type:'Rain',chance:100};game.world.weather.type='Rain';},applicationPorts(ports){ports.sessions={async create(request,view,setup){const handle={result(){throw Error('unfinished');}};sessions.push({request,view,setup,handle});return handle;}};}});
 // Real MZ constructors/Scene handoff remain. The session render/controller is deliberately omitted in this host-only family.
 const P=h.G.Scene_PSBattle.prototype;P.isReady=function(){return false;};
 ordinary.assertOrdinary(h.G);
 const old=h.G.SceneManager._scene;h.G.SceneManager.goto(h.G.Scene_Map);await h.pump(()=>h.G.SceneManager._scene!==old&&h.G.SceneManager._scene.isStarted()&&!h.app.saveBlocked&&!h.G.PSWorld.pending());
 const given=member(h.content),G=h.G;G.givenInput=copy(given);
 return {...h,sessions,given,ordinary,event(script){G.$gameMap._interpreter.setup([{code:355,indent:0,parameters:[script]},{code:0,indent:0,parameters:[]}],0);G.$gameMap._interpreter.update();},
 started(interpreter){return ordinaryStarted(this,G.PSFlow._op,G.SceneManager._scene,interpreter);},
 async abortAndReturn(interpreter,reason){
  const F=G.PSFlow,scene=G.SceneManager._scene,battleId=F.request.battleId;
  F.abort(Error(reason));assert.equal(F.lastOutcome.commit,'none');assert.equal(F.lastOutcome.battleId,battleId);
  assert.equal(Object.hasOwn(this.state().appliedBattles,battleId),false);
  await exitToMap(this,scene,interpreter,{aborted:true});
 },
 failedPush(trigger,options){return failedPush(this,trigger,options);}};

}
for(const mode of ['blank','inherit'])test('given actual production event355 '+mode+' uses genuine Scene handoff and zero generation',async()=>{
 const h=await fixture(),{G,app}=h,before=copy(h.given),prefix=h.draws.slice(),native=h.nativeDraws.slice();
 const fields=mode==='inherit'?", undefined, {defaultWeather:'inherit',defaultTerrain:'none',battleEnvironment:'inherit'}":'';
 h.event("PSFlow.openGivenWildBattle({battleId:'given-native',seq:1,member:givenInput}"+fields+"); this._psBattleId='given-native'; this.setWaitMode('psBattle');");
 assert.equal(app.saveBlocked,true);G.givenInput.personalID=1;G.givenInput.owner.name='external mutation';
 await h.started(G.$gameMap._interpreter);
 assert.equal(h.sessions.length,1);assert.equal(app.op.session,h.sessions[0].handle);assert(G.SceneManager._scene instanceof G.Scene_PSBattle);
 assert.deepEqual(h.sessions[0].setup.foes[0],E.speciesKey.toBattleMember(before,h.content));assert.deepEqual(h.draws,prefix);assert.deepEqual(h.nativeDraws,native);
 if(mode==='blank')assert.equal(h.sessions[0].setup.initialField,undefined);else {assert.equal(h.sessions[0].setup.initialField.weather,'rain');assert.equal(h.sessions[0].setup.initialField.environment,'grass');}
 assert.equal(G.$gameMap._interpreter._waitMode,'psBattle');assert.deepEqual(h.sessions[0].setup.worldCapture,{fishing:false,timeOfDay:2});
 await h.abortAndReturn(G.$gameMap._interpreter,'finite headless host test complete');assert.deepEqual(h.ordinary.rows,[]);
});
test('given production rejects accessor and proxy input explicitly with zero hooks/traps',async()=>{
 const h=await fixture(),{G}=h;let hooks=0,traps=0;const raw={battleId:'bad',seq:1};Object.defineProperty(raw,'member',{enumerable:true,get(){hooks++;return h.given;}});
 assert.throws(()=>G.PSFlow.openGivenWildBattle(raw),/given-wild/);assert.equal(hooks,0);
 const proxy=new Proxy({}, {getPrototypeOf(){traps++;return Object.prototype;},ownKeys(){traps++;return[];},get(){traps++;return undefined;}});
 assert.throws(()=>G.PSFlow.openGivenWildBattle(proxy),/proxy/);assert.equal(traps,0);assert.equal(h.sessions.length,0);assert.equal(h.app.saveBlocked,false);
});
test('given native reservations reject copied/foreign context and admission without factory calls',async()=>{
 const h=await fixture(),other=await fixture(),input={battleId:'given-reserved',seq:1,member:h.given};
 const result=h.app.latchLegacyBattleContext({weather:'none',terrain:'none',environment:'none'});assert.equal(result.status,'value');
 assert.throws(()=>h.app.prepareGivenWildBattle(input,{...result.value}),/stale|unissued/);assert.throws(()=>other.app.prepareGivenWildBattle(input,result.value),/stale|unissued/);
 const admitted=h.app.prepareGivenWildBattle(input,result.value);await assert.rejects(h.app.startAdmittedWorldBattle({...admitted}),/stale/);assert.throws(()=>h.app.prepareGivenWildBattle(input,result.value),/stale/);
 assert.equal(h.sessions.length,0);assert.equal(h.app.abortAdmittedWorldBattle(admitted,'test complete').status,'aborted');assert.equal(h.app.abortAdmittedWorldBattle(admitted,'duplicate').status,'duplicate');
});
test('given native source replacement during real push rejects old admission without overwriting successor transfer',async()=>{
 const h=await fixture(),{G,app}=h,p=G.$gamePlayer,prefix=h.draws.slice(),doc=JSON.stringify(h.state());
 const I=G.$gameMap._interpreter;
 const result=await h.failedPush(
  ()=>h.event("PSFlow.openGivenWildBattle({battleId:'given-late',seq:1,member:givenInput}); this._psBattleId='given-late'; this.setWaitMode('psBattle');"),
  {beforeNativePush(){p.reserveTransfer(6,3,4,8,0);}}
 );
 assert.match(String(result.error),/travel-native-idle-source-changed/);
 assert.equal(h.sessions.length,0);assert.equal(p.isTransferring(),true);assert.deepEqual([p._newMapId,p._newX,p._newY,p._newDirection],[6,3,4,8]);assert.deepEqual(h.draws,prefix);
 assert.equal(app.op,null);assert.equal(JSON.stringify(h.state()),doc);assert.deepEqual(h.ordinary.rows,[]);
 assert.strictEqual(G.$gameMap._interpreter,I);assert.equal(I.updateWaitMode(),false);assert.equal(I._waitMode,'');assert.equal(I._psBattleId,undefined);
 assert.throws(()=>G.PSFlow.openGivenWildBattle({battleId:'given-late',seq:1,member:h.given}),/capture|source|unavailable/);
 assert.equal(G.PSFlow.running,false);assert.equal(G.PSFlow.operationPending(),false);assert.equal(G.$gameSystem.isSaveEnabled(),true);assert.deepEqual([p._newMapId,p._newX,p._newY,p._newDirection],[6,3,4,8]);
});

test('given prepublication failure preserves original error and unrelated host state',async()=>{
 const h=await fixture(),{G}=h,error=new Error('presentation parameters failed'),before={op:G.PSFlow._op,request:G.PSFlow.request,running:G.PSFlow.running,perf:G.PSFlow.perf.cur,outcome:G.PSFlow.lastOutcome};
 const parameters=G.PluginManager.parameters;G.PluginManager.parameters=()=>{throw error;};
 assert.throws(()=>G.PSFlow.openGivenWildBattle({battleId:'given-prepublish',seq:1,member:h.given}),actual=>actual===error);G.PluginManager.parameters=parameters;
 assert.equal(G.PSFlow._op,before.op);assert.equal(G.PSFlow.request,before.request);assert.equal(G.PSFlow.running,before.running);assert.equal(G.PSFlow.perf.cur,before.perf);assert.equal(G.PSFlow.lastOutcome,before.outcome);assert.equal(h.app.saveBlocked,false);assert.equal(G.PSFlow.operationPending(),false);assert.equal(G.$gameSystem.isSaveEnabled(),true);assert.equal(h.sessions.length,0);
});
test('given second public request fails before publication without clearing a real current owner',async()=>{
 const h=await fixture(),{G}=h;G.PSFlow.openGivenWildBattle({battleId:'given-current',seq:1,member:h.given});await h.started();
 const current=G.PSFlow._op,request=G.PSFlow.request,session=h.app.op.session,measurement=G.PSFlow.perf.cur;
 assert.throws(()=>G.PSFlow.openGivenWildBattle({battleId:'given-intruder',seq:2,member:h.given}),/capture|active|unavailable/);
 assert.equal(G.PSFlow._op,current);assert.equal(G.PSFlow.request,request);assert.equal(G.PSFlow.perf.cur,measurement);assert.equal(h.app.op.session,session);assert.equal(G.PSFlow.running,true);assert.equal(G.PSFlow.operationPending(),true);assert.equal(G.$gameSystem.isSaveEnabled(),false);assert.equal(h.sessions.length,1);
 await h.abortAndReturn(undefined,'test complete');assert.deepEqual(h.ordinary.rows,[]);
});
for(const phase of ['app-abort','music-cleanup'])test('given old failure preserves a genuine public successor during '+phase,async()=>{
 const h=await fixture(),{G,app}=h,error=new Error('synthetic host push failure'),doc=JSON.stringify(h.state());
 let successor,successorRequest,measurement,appOwner;
 const next={battleId:'given-successor',seq:2,member:{...h.given,id:'Successor1'}};
 const result=await h.failedPush(()=>G.PSFlow.openGivenWildBattle({battleId:'given-old',seq:1,member:h.given}),{
  beforeNativePush(){throw error;},
  ...(phase==='music-cleanup'?{onOldMusic({op,error:actual}){
   assert.strictEqual(error,actual);assert.strictEqual(G.PSFlow._op,op);
   assert.equal(app.saveBlocked,true);
   assert.throws(()=>G.PSFlow.openGivenWildBattle(next),/capture|active|unavailable/);
   assert.strictEqual(G.PSFlow._op,op);
  }}:{}),
  retired(){
   G.PSFlow.openGivenWildBattle(next);successor=G.PSFlow._op;successorRequest=G.PSFlow.request;
   measurement=G.PSFlow.perf.cur;appOwner=app.op;
  }
 });
 assert.strictEqual(result.error,error);assert(successor);assert.notStrictEqual(result.old,successor);
 assert.strictEqual(G.PSFlow._op,successor);assert.strictEqual(G.PSFlow.request,successorRequest);assert.strictEqual(G.PSFlow.perf.cur,measurement);
 assert.equal(G.PSFlow.running,true);assert.equal(G.PSFlow.operationPending(),true);assert.equal(G.$gameSystem.isSaveEnabled(),false);
 assert.strictEqual(app.op,appOwner);assert.equal(app.saveBlocked,true);assert.equal(G.$gamePlayer.isTransferring(),false);
 assert.equal(JSON.stringify(h.state()),doc);
 await h.started();assert.equal(h.sessions.length,1);assert.equal(app.op.session,h.sessions[0].handle);assert.equal(G.PSFlow._op,successor);assert.equal(G.PSFlow.lastOutcome,null);
 await h.abortAndReturn(undefined,'finite successor complete');assert.deepEqual(h.ordinary.rows,[]);
});
