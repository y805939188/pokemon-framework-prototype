'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('../../support/world/generated-event-native-support.cjs');
const domains=[65536,65536,32,32,32,32,32,32];
function actualDraws(h,want=domains){
 assert.deepEqual(h.draws,want);
 assert.deepEqual(h.ordinary.rows.map(x=>x.bound),want);
 assert(h.ordinary.rows.every(x=>x.fills===1));
}
for(const mode of ['none','inherit'])test('generated native actual running355 '+mode+' allows disabled encounters/repel/no table with no selection draws',async()=>{
 const h=await fixture(),{G}=h;h.open(mode==='inherit'?",undefined,{defaultWeather:'inherit',defaultTerrain:'none',battleEnvironment:'inherit'}":'');await h.started(G.$gameMap._interpreter);assert.equal(h.sessions.length,1);actualDraws(h);assert.deepEqual(structuredClone(h.observed),[{same:true,running:true,event:true,disabled:true,repel:50}]);assert.equal(h.state().world.repelSteps,50);
 if(mode==='none')assert.equal(h.sessions[0].setup.initialField,undefined);else{assert.equal(h.sessions[0].setup.initialField.weather,'rain');assert.equal(h.sessions[0].setup.initialField.environment,'grass');}assert.deepEqual(h.sessions[0].setup.worldCapture,{timeOfDay:0,fishing:false});await h.abortAndReturn(G.$gameMap._interpreter,'finite native test complete');
});
for(const [shiny,fateful]of [[false,false],[true,false],[false,true],[true,true]])test('generated native actual31/32 '+shiny+'/'+fateful+' keeps source prefix',async()=>{
 const h=await fixture({shiny,fateful}),{G}=h;h.open();await h.started(G.$gameMap._interpreter);actualDraws(h);assert.equal(h.sessions[0].setup.foes[0].shiny,shiny);assert.equal(h.sessions[0].setup.foes[0].origin.method,fateful?4:0);await h.abortAndReturn(G.$gameMap._interpreter,'finite native test complete');
});
for(const kind of ['missing','invalid'])test('generated native '+kind+' switch fact refuses before generation and leaves no barriers',async()=>{
 const h=await fixture(),{G}=h;if(kind==='missing')G.$gameSwitches=null;else G.$gameSwitches._data[31]='invalid';assert.throws(()=>h.open(),/switch/);actualDraws(h,[]);assert.equal(h.sessions.length,0);assert.equal(h.app.saveBlocked,false);assert.equal(G.PSFlow.running,false);assert.equal(G.PSFlow.operationPending(),false);assert.equal(G.$gameSystem.isSaveEnabled(),true);
});
test('generated native registration remains after source failure and all owned host barriers retire',async()=>{
 const h=await fixture({edit(game,c){c.species.B.ruleSpecies='Espurr';c.species.B.contentId='B';c.species.B.form=0;c.species.B.gender='F';c.species.B1={...structuredClone(c.species.B),form:1,formName:'Female'};c.forms=Object.fromEntries(['A','B','C'].map(id=>[id,{'0':id}]));c.forms.B['1']='B1';c.speciesKeys=Object.fromEntries(Object.keys(c.species).map(id=>[id,{species:id==='B1'?'B':id,form:id==='B1'?1:0}]));}}),{G}=h,p=G.$gamePlayer;
 const interpreter=G.$gameMap._interpreter;
 const result=await h.failedPush(()=>h.open(),{beforeNativePush(){p.reserveTransfer(6,3,4,8,0);}});
 assert.match(String(result.error),/travel-native-idle-source-changed/);actualDraws(h);
 assert.deepEqual(h.state().dex.seenForms.B,[{gender:1,form:1,shiny:false}]);assert.equal(h.state().dex.owned.includes('B'),false);
 assert.equal(h.sessions.length,0);assert.equal(h.app.saveBlocked,false);
 assert.equal(Object.hasOwn(h.state().appliedBattles,'native-generated'),false);
 assert.strictEqual(G.$gameMap._interpreter,interpreter);assert.equal(interpreter.updateWaitMode(),false);
 assert.equal(interpreter._waitMode,'');assert.equal(interpreter._psBattleId,undefined);
 assert.deepEqual([p._newMapId,p._newX,p._newY,p._newDirection],[6,3,4,8]);
});
test('generated native old failure cannot clear a genuine new public generated successor',async()=>{
 const h=await fixture(),{G,app}=h,error=new Error('synthetic old push failure');let successor,appOwner;
 const result=await h.failedPush(()=>h.open(),{
  beforeNativePush(){throw error;},
  retired(){G.PSFlow.openGeneratedWildBattle({battleId:'native-successor',seq:2,species:'B',level:2});successor=G.PSFlow._op;appOwner=app.op;}
 });
 assert.strictEqual(result.error,error);assert(successor);assert.notStrictEqual(result.old,successor);
 assert.strictEqual(G.PSFlow._op,successor);assert.strictEqual(app.op,appOwner);
 assert.equal(G.PSFlow.running,true);assert.equal(app.saveBlocked,true);assert.equal(G.PSFlow.lastOutcome,null);
 await h.started(G.$gameMap._interpreter);assert.equal(h.sessions.length,1);
 actualDraws(h,[...domains,...domains]);assert.equal(G.PSFlow.request.battleId,'native-successor');
 await h.abortAndReturn(G.$gameMap._interpreter,'finite successor complete');
});

test('generated native given and old StartBattle stay outside31/32 generation corrections',async()=>{
 const h=await fixture({shiny:true,fateful:true}),{G}=h;const given={...structuredClone(h.state().party[0]),id:'GivenFixed',shiny:false,superShiny:false,origin:{...h.state().party[0].origin,method:2}};G.provided=given;
 h.event("PSFlow.openGivenWildBattle({battleId:'native-given',seq:1,member:provided});");await h.started();actualDraws(h,[]);assert.equal(h.sessions[0].setup.foes[0].shiny,false);assert.equal(h.sessions[0].setup.foes[0].origin.method,2);await h.abortAndReturn(undefined,'finite given complete');
 const legacy=await fixture({shiny:true,fateful:true}),L=legacy.G;L.$gameMap._interpreter.setup([{code:357,indent:0,parameters:['PS_BattleFlow','StartBattle','StartBattle',{battleId:'old-event',kind:'wild',foes:'B:2',defaultWeather:'',defaultTerrain:'none',battleEnvironment:'none',battleEffects:'on',canLose:'true'}]},{code:0,indent:0,parameters:[]}],0);L.$gameMap._interpreter.update();const I=L.$gameMap._interpreter;await legacy.started(I);actualDraws(legacy);assert.equal(legacy.sessions[0].setup.initialField,undefined);assert.equal(legacy.sessions[0].setup.foes[0].shiny,false);assert.equal(legacy.sessions[0].setup.foes[0].origin.method,0);await legacy.abortAndReturn(I,'finite legacy complete');
});
for(const fullParty of [false,true])test('generated capture actual355 -> production Session -> formal receiving '+(fullParty?'full-party box':'party')+' preserves generated identity once',async()=>{
 const h=await fixture({real:true,fullParty,shiny:true,fateful:true}),{G}=h;h.open();const interpreter=G.$gameMap._interpreter,s=await h.started(interpreter);assert.equal(s.constructor.name,'BattleSession');assert(G.SceneManager._scene instanceof G.Scene_PSBattle);actualDraws(h);assert.equal(h.seedCalls.length,1);s.take();assert.equal((await s.throwBall('masterball')).ok,true);assert.equal(s.finished,true);
 const raw=s.result();let out=G.PSFlow.finish(s);assert.equal(out.pending,true,JSON.stringify(out));out=G.PSFlow.resolveReceiving(out.receivingToken,{[raw.captured[0].id]:{nickname:{kind:'keep'},placement:{kind:fullParty?'box':'party'}}});assert.equal(out.commit,'applied',JSON.stringify(out));const stored=[...h.state().party,...h.state().storage.boxes.flatMap(b=>b.slots)].find(m=>m?.id===raw.captured[0].id);assert(stored);assert.equal(stored.species,'milcery-test');assert.equal(stored.form,62);assert.equal(stored.personalID,8);assert.equal(stored.item,'ribbonsweet');assert.equal(stored.shiny,true);assert.equal(stored.origin.method,4);assert.equal(h.state().party.length,fullParty?6:2);assert.equal(h.state().dex.capturedCounts['milcery-test'],1);assert.equal(G.PSFlow.finish(s).commit,'already-applied');assert.equal(h.state().dex.capturedCounts['milcery-test'],1);actualDraws(h);assert.equal(h.seedCalls.length,1);await h.exitToMap(interpreter);
});

test('generated native private context rejects borrowed/copied permissions and preserves the actual current owner',async()=>{
 const h=await fixture(),other=await fixture(),q={battleId:'permission-generated',seq:1,species:'B',level:2},choice={weather:'none',terrain:'none',environment:'none'};
 const old=h.app.latchLegacyBattleContext(choice);assert.equal(old.status,'value');assert.throws(()=>h.app.prepareGeneratedWildBattle(q,old.value),/context-unissued/);actualDraws(h,[]);
 const cap=h.app.latchGeneratedWildBattleContext(choice);assert.equal(cap.status,'value');assert.throws(()=>h.app.prepareGeneratedWildBattle(q,{...cap.value}),/stale/);assert.throws(()=>other.app.prepareGeneratedWildBattle(q,cap.value),/stale/);actualDraws(h,[]);actualDraws(other,[]);
 const admission=h.app.prepareGeneratedWildBattle(q,cap.value),owner=h.app.op;await assert.rejects(h.app.startAdmittedWorldBattle({...admission}),/stale/);assert.throws(()=>h.app.prepareGeneratedWildBattle(q,cap.value),/stale/);assert.throws(()=>h.G.PSFlow.openGeneratedWildBattle({...q,battleId:'intruder'}),/capture|active|unavailable/);assert.equal(h.app.op,owner);assert.equal(h.app.saveBlocked,true);assert.equal(h.sessions.length,0);actualDraws(h);assert.equal(h.app.abortAdmittedWorldBattle(admission,'finite permission test complete').status,'aborted');assert.equal(h.app.abortAdmittedWorldBattle(admission,'duplicate').status,'duplicate');assert.equal(h.app.saveBlocked,false);
});
