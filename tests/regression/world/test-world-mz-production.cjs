'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,flush}=require('../../support/world/world-mz-production-support.cjs');
const {load}=require('../../support/field/field-host-support.cjs');
const domains=[100,1,1,65536,65536,32,32,32,32,32,32];
async function complete(h){h.complete();await flush();}
test('production formal world table is the mode authority; explicit terrain meanings are validated',async()=>{
 const M=await load('src/plugins/world/runtime-inputs-mz.ts');
 assert.equal(M.parseTerrainMeanings('{}').size,0);
 for(const value of ['[]','{"8":{}}','{"0":{"landAllowed":true,"fishable":true,"environment":"made-up"}}','{"1":{"landAllowed":"true","fishable":false,"environment":"grass"}}'])assert.throws(()=>M.parseTerrainMeanings(value));
 const h=await fixture();h.player.makeEncounterCount();assert.deepEqual(h.nativeDraws,[]);assert.equal(h.flow.content().world.encounters.tables.length,1);
});
test('real App+native completion+compiled Flow retain exact admission, create one member/session and clear click destination',async()=>{
 const h=await fixture();h.temp.destination=true;let issued;const admit=h.app.admitWorldBattle.bind(h.app);h.app.admitWorldBattle=(...args)=>{issued=admit(...args);return issued;};
 h.player.directionInput=6;h.tick();assert.equal(h.state().steps,0);h.tick();await flush();
 assert(issued);assert.equal(h.flow._op.worldAdmission,issued);assert.equal(h.flow.running,true);assert.equal(h.app.saveBlocked,true);assert.equal(h.temp.destination,false);assert.equal(h.state().steps,1);assert.deepEqual(h.draws,domains);assert.deepEqual(h.nativeDraws,[]);assert.equal(h.sessions.length,0);assert.equal(h.player.x,6);assert.equal(h.player._realX,6);
 const result=await h.flow.begin();assert.equal(result,h.handle);assert.equal(h.sessions.length,1);assert.equal(h.sessions[0].setup.foes[0].species,'A');assert.equal(h.sessions[0].request.battleId,issued.battleId);assert.equal(h.sessions[0].request.foes.length,1);assert.equal(h.flow.request.foes.length,0);assert.deepEqual(h.sessions[0].setup.worldCapture,{fishing:false,timeOfDay:2});assert.deepEqual(h.draws,domains);
 assert.equal(await h.flow.begin(),result);assert.equal(h.sessions.length,1);assert.equal(h.flow.openAdmittedWorldBattle(h.app,issued),false);h.app.abortAdmittedWorldBattle(issued,'test-finished');
});
test('ordinary command136 disabled and event arrival retain one passive step without encounter RNG',async()=>{
 for(const kind of ['disabled','event']){const h=await fixture();if(kind==='disabled')new h.G.Game_Interpreter().command136([0]);else h.map.startsEvent=true;h.nativeDraws.length=0;await complete(h);assert.equal(h.state().steps,1);assert.equal(h.flow.running,false);assert.equal(h.sessions.length,0);assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);}
});
test('missing terrain mapping preserves completed prefix and visibly refuses formal generation',async()=>{
 const h=await fixture({terrainTags:'{}'});await complete(h);assert.equal(h.state().steps,1);assert.equal(h.flow.running,false);assert.equal(h.app.saveBlocked,false);assert.deepEqual(h.draws,[]);assert.deepEqual(h.nativeDraws,[]);assert(h.G.PSWorld.diagnostics.some(x=>x.includes('encounter-terrain-unavailable')));
});
test('turn bump jump and companion movement never create ordinary opportunities',async()=>{
 const h=await fixture();h.player.setDirection(8);h.player.increaseSteps();h.player.passable=false;await complete(h);h.player.passable=true;h.player.jumping=true;h.player.increaseSteps();h.player.jumping=false;
 const other=new h.G.Game_Player();other.isNormal=()=>true;other._x++;other.increaseSteps();other.updateMove();await flush();assert.equal(h.state().steps,0);assert.deepEqual(h.draws,[]);assert.equal(h.flow.running,false);
});
test('exact admission rejects a copied ticket and real begin failure does not reroll',async()=>{
 const h=await fixture({sessionFailure:true});await complete(h);const admission=h.flow._op.worldAdmission;
 await assert.rejects(h.app.startAdmittedWorldBattle({...admission}),/stale/);await assert.rejects(h.flow.begin(),/session-failure/);assert.equal(h.sessions.length,1);assert.deepEqual(h.draws,domains);assert.equal(h.app.saveBlocked,false);
});
test('generation/scene reentry during presentation capture cannot install an obsolete host battle',async()=>{
 for(const change of ['generation','scene']){const h=await fixture();h.G.visualCapture=()=>{if(change==='generation')h.app.stateReplacedByHost();else h.manager._scene={};return{};};await complete(h);assert.equal(h.flow.running,false);assert.equal(h.sessions.length,0);assert.equal(h.app.saveBlocked,false);assert.equal(h.state().steps,1);assert.deepEqual(h.draws,domains);}
});
for(const mode of ['mz-native','legacy-note'])test('integrated C preserves native completed-frame timing '+mode,async()=>{
 const h=await fixture({mode});h.player._encounterCount=1;h.player.directionInput=6;h.tick();await flush();h.tick();await flush();assert.equal(h.offers.length,1);assert.equal(h.offers[0].x,6);assert.equal(h.offers[0].moving,false);assert.deepEqual(h.nativeDraws,[10,10]);assert.equal(h.state().steps,1);
});
