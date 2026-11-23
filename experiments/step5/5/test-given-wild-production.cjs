'use strict';
// Explicit current-production IIFEs + actual MZ interpreter355/Scene handoff; rendering resources are headless.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {E,copy,member}=require('./given-wild-support.cjs');
assert(process.env.PF_GIVEN_BUNDLES,'explicit private IIFE support required');
process.env.PF_E3_JOINT_OUT=process.env.PF_GIVEN_BUNDLES;
const {fixture:base,flush}=require('./ui-wire-e3-fixtures.cjs');
async function fixture(){
 const sessions=[];
 const h=await base({nativeSetup(n){
  const G=n.G,source=fs.readFileSync(path.join(process.env.PF_E3_NATIVE_ROOT,'js/reactor_scenes.js'),'utf8'),name='Scene_Map.prototype.isReady';
  const a=source.indexOf(name+' = function'),b=source.indexOf('\n};',a);assert(a>=0&&b>a);vm.runInContext(source.slice(a,b+4),G,{filename:'pinned-native:'+name});
  G.Scene_Message.prototype.isReady=()=>true;G.DataManager.isMapLoaded=()=>!!G.$dataMap;
  const display=G.Scene_Map.prototype.createDisplayObjects;G.Scene_Map.prototype.createDisplayObjects=function(...args){const value=Reflect.apply(display,this,args);this.children=[];this._windowLayer={};this._messageWindow={};return value;};
 },edit(game,content){game.party[0].hp=20;content.moves.tackle=content.moves.Tackle;content.mapMetadata.maps[5].weather={type:'Rain',chance:100};game.world.weather.type='Rain';},applicationPorts(ports){ports.sessions={async create(request,view,setup){const handle={result(){throw Error('unfinished');}};sessions.push({request,view,setup,handle});return handle;}};}});
 // Real MZ constructors/Scene handoff remain. The session render/controller is deliberately omitted in this host-only family.
 const P=h.G.Scene_PSBattle.prototype;P.isReady=function(){return false;};
 h.G.PSFlow.fast=true;h.G.PSFlow.clock=()=>new Date(2026,10,17,23,0,0).getTime();
 const old=h.G.SceneManager._scene;h.G.SceneManager.goto(h.G.Scene_Map);await h.pump(()=>h.G.SceneManager._scene!==old&&h.G.SceneManager._scene.isStarted()&&!h.app.saveBlocked&&!h.G.PSWorld.pending());
 const given=member(h.content),G=h.G;G.givenInput=copy(given);
 return {...h,sessions,given,event(script){G.$gameMap._interpreter.setup([{code:355,indent:0,parameters:[script]},{code:0,indent:0,parameters:[]}],0);G.$gameMap._interpreter.update();}};
}
for(const mode of ['blank','inherit'])test('given actual production event355 '+mode+' uses genuine Scene handoff and zero generation',async()=>{
 const h=await fixture(),{G,app}=h,before=copy(h.given),prefix=h.draws.slice(),native=h.nativeDraws.slice();
 const fields=mode==='inherit'?", undefined, {defaultWeather:'inherit',defaultTerrain:'none',battleEnvironment:'inherit'}":'';
 h.event("PSFlow.openGivenWildBattle({battleId:'given-native',seq:1,member:givenInput}"+fields+"); this._psBattleId='given-native'; this.setWaitMode('psBattle');");
 assert.equal(app.saveBlocked,true);G.givenInput.personalID=1;G.givenInput.owner.name='external mutation';
 await h.pump(()=>h.sessions.length===1);await flush();
 assert.equal(h.sessions.length,1);assert.equal(app.op.session,h.sessions[0].handle);assert(G.SceneManager._scene instanceof G.Scene_PSBattle);
 assert.deepEqual(h.sessions[0].setup.foes[0],E.speciesKey.toBattleMember(before,h.content));assert.deepEqual(h.draws,prefix);assert.deepEqual(h.nativeDraws,native);
 if(mode==='blank')assert.equal(h.sessions[0].setup.initialField,undefined);else {assert.equal(h.sessions[0].setup.initialField.weather,'rain');assert.equal(h.sessions[0].setup.initialField.environment,'grass');}
 assert.equal(G.$gameMap._interpreter._waitMode,'psBattle');assert.deepEqual(h.sessions[0].setup.worldCapture,{fishing:false,timeOfDay:2});
 app.abortBattle({battleId:'given-native'},Error('finite headless host test complete'));
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
 const h=await fixture(),{G}=h,p=G.$gamePlayer,prefix=h.draws.slice();let aborts=0,closes=0;
 const abort=h.app.abortAdmittedWorldBattle;h.app.abortAdmittedWorldBattle=function(...args){aborts++;return Reflect.apply(abort,this,args);};const close=G.PSFlow._closeBattleMusic;G.PSFlow._closeBattleMusic=function(...args){closes++;return Reflect.apply(close,this,args);};
 let original;const push=G.SceneManager.push;G.SceneManager.push=function(C){p.reserveTransfer(6,3,4,8,0);try{return Reflect.apply(push,this,[C]);}catch(error){original=error;throw error;}};
 assert.throws(()=>G.PSFlow.openGivenWildBattle({battleId:'given-late',seq:1,member:h.given}),error=>error===original&&/travel-native-idle-source-changed/.test(String(error)));
 assert.equal(h.sessions.length,0);assert.equal(p.isTransferring(),true);assert.deepEqual([p._newMapId,p._newX,p._newY,p._newDirection],[6,3,4,8]);assert.deepEqual(h.draws,prefix);assert.equal(h.app.saveBlocked,false);assert.equal(h.app.op,null);assert.equal(G.PSFlow.running,false);assert.equal(G.PSFlow.operationPending(),false);assert.equal(G.$gameSystem.isSaveEnabled(),true);assert.equal(G.PSFlow._op,null);assert.equal(G.PSFlow.request,null);assert.equal(G.PSFlow.lastOutcome.aborted,true);assert.equal(aborts,1);assert.equal(closes,1);
 assert.throws(()=>G.PSFlow.openGivenWildBattle({battleId:'given-late',seq:1,member:h.given}),/capture|source|unavailable/);assert.equal(aborts,1);assert.equal(closes,1);assert.equal(G.PSFlow.running,false);assert.equal(G.PSFlow.operationPending(),false);assert.equal(G.$gameSystem.isSaveEnabled(),true);assert.deepEqual([p._newMapId,p._newX,p._newY,p._newDirection],[6,3,4,8]);
});

test('given prepublication failure preserves original error and unrelated host state',async()=>{
 const h=await fixture(),{G}=h,error=new Error('presentation parameters failed'),before={op:G.PSFlow._op,request:G.PSFlow.request,running:G.PSFlow.running,perf:G.PSFlow.perf.cur,outcome:G.PSFlow.lastOutcome};
 const parameters=G.PluginManager.parameters;G.PluginManager.parameters=()=>{throw error;};
 assert.throws(()=>G.PSFlow.openGivenWildBattle({battleId:'given-prepublish',seq:1,member:h.given}),actual=>actual===error);G.PluginManager.parameters=parameters;
 assert.equal(G.PSFlow._op,before.op);assert.equal(G.PSFlow.request,before.request);assert.equal(G.PSFlow.running,before.running);assert.equal(G.PSFlow.perf.cur,before.perf);assert.equal(G.PSFlow.lastOutcome,before.outcome);assert.equal(h.app.saveBlocked,false);assert.equal(G.PSFlow.operationPending(),false);assert.equal(G.$gameSystem.isSaveEnabled(),true);assert.equal(h.sessions.length,0);
});
test('given second public request fails before publication without clearing a real current owner',async()=>{
 const h=await fixture(),{G}=h;G.PSFlow.openGivenWildBattle({battleId:'given-current',seq:1,member:h.given});await h.pump(()=>h.sessions.length===1);await flush();
 const current=G.PSFlow._op,request=G.PSFlow.request,session=h.app.op.session,measurement=G.PSFlow.perf.cur;
 assert.throws(()=>G.PSFlow.openGivenWildBattle({battleId:'given-intruder',seq:2,member:h.given}),/capture|active|unavailable/);
 assert.equal(G.PSFlow._op,current);assert.equal(G.PSFlow.request,request);assert.equal(G.PSFlow.perf.cur,measurement);assert.equal(h.app.op.session,session);assert.equal(G.PSFlow.running,true);assert.equal(G.PSFlow.operationPending(),true);assert.equal(G.$gameSystem.isSaveEnabled(),false);assert.equal(h.sessions.length,1);
 G.PSFlow.abort(Error('test complete'),current);
});
for(const phase of ['app-abort','music-cleanup'])test('given old failure preserves a genuine public successor during '+phase,async()=>{
 const h=await fixture(),{G,app}=h,error=new Error('synthetic host push failure');let successor,successorRequest,measurement,reentered=false;
 const push=G.SceneManager.push;
 // The failure callback is synthetic; the successor uses the actual public entry, original close, issued latch and real Scene handoff.
 const publish=()=>{if(reentered)return;reentered=true;const old=G.PSFlow._op;G.PSFlow.close(0,old,false);G.SceneManager.push=push;G.PSFlow.openGivenWildBattle({battleId:'given-successor',seq:2,member:{...h.given,id:'Successor1'}});successor=G.PSFlow._op;successorRequest=G.PSFlow.request;measurement=G.PSFlow.perf.cur;};
 if(phase==='app-abort'){const abort=app.abortAdmittedWorldBattle;app.abortAdmittedWorldBattle=function(...args){const result=Reflect.apply(abort,this,args);publish();return result;};}
 else {const close=G.PSFlow._closeBattleMusic;G.PSFlow._closeBattleMusic=function(...args){const result=Reflect.apply(close,this,args);if(!reentered){G.PSFlow._closeBattleMusic=close;publish();}return result;};}
 G.SceneManager.push=function(){throw error;};
 assert.throws(()=>G.PSFlow.openGivenWildBattle({battleId:'given-old',seq:1,member:h.given}),actual=>actual===error);
 assert(reentered);assert.equal(G.PSFlow._op,successor);assert.equal(G.PSFlow.request,successorRequest);assert.equal(G.PSFlow.perf.cur,measurement);assert.equal(G.PSFlow.running,true);assert.equal(G.PSFlow.operationPending(),true);assert.equal(G.$gameSystem.isSaveEnabled(),false);assert(app.op);assert.equal(app.saveBlocked,true);assert.equal(G.$gamePlayer.isTransferring(),false);
 await h.pump(()=>h.sessions.length===1);await flush();assert.equal(h.sessions.length,1);assert.equal(app.op.session,h.sessions[0].handle);assert.equal(G.PSFlow._op,successor);assert.equal(G.PSFlow.request.battleId,'given-successor');assert.equal(G.PSFlow.lastOutcome,null);G.PSFlow.abort(Error('test complete'),successor);
});
