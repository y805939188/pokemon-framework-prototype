'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=process.env.PF_CARRIED_FAINT_ROOT||path.resolve(__dirname,'../../..');
const E=require(path.join(root,'js/engine/build/production.cjs')),T=require(path.join(root,'js/engine/build/testing.cjs'));
const {inputs}=require('./trainer-ai-integration/fixtures.cjs');
async function setup(deadIds=[],ids=['P1','P2']){
 const input=inputs({moves:['tackle'],party:1});input.species.find(x=>x.id==='snorlax').learnset=[{level:1,move:'memento'}];
 const compiled=E.contentCompile.compileContent(input);assert.equal(compiled.ok,true);const assembled=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(assembled.errors,[]);const content=assembled.content;
 const game=E.state.newGame({content,party:[],money:1000});game.badges.fill(true);
 for(const id of ids){const member=E.speciesKey.toPersistentMember(E.memberFactory.createMember({id,species:'Snorlax',level:50},content,()=>0),content);if(deadIds.includes(id))member.hp=0;game.party.push(member);}game.nextMemberOrdinal='20';
 const state=T.fakes.createMemoryState(game),app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),content:()=>({content}),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,7]}),random:()=>0,clock:()=>1793350000000});
 const request={battleId:'carried-faint',seq:1,trainer:{id:'c-basic',version:1},canLose:false},session=await app.startTrainerBattle(request);return {session,app,request,state,game};
}
function finish(w){const result=w.session.result(),out=w.app.finishBattle(w.session,w.request);assert.equal(out.code,4);assert.equal(out.commit,'applied');assert.equal(out.defeat.healed,true);assert.ok(w.state.read().party.every(p=>p.hp>0&&!p.status));assert.ok(w.state.read().appliedBattles[result.battleId].settlement.pairHash);const installed=JSON.stringify(w.state.read());assert.equal(w.app.commitResult(result),'already-applied');assert.equal(JSON.stringify(w.state.read()),installed);}
test('carried faint control: single living member reaches actual defeat and one D3 installation',async()=>{const w=await setup([],['P1']);assert.equal((await w.session.chooseMove(1)).ok,true);assert.equal(w.session.finished,true);finish(w);});
for(const ids of [['P1','P2'],['P2','P1','P3']])test('carried faints keep living roster coherent, preserve original IDs and finish D3: '+ids.join(','),async()=>{
 const dead=ids.filter(x=>x!=='P1'),w=await setup(dead,ids),side=w.session.gw._debugBattle().sides[0];assert.equal(side.pokemonLeft,1);assert.equal(side.totalFainted,0,'carried faints are not new battle KOs');assert.deepEqual(w.session.party.map(x=>x.id),ids,'persistent party order preserved');
 const step=await w.session.chooseMove(1);assert.equal(step.ok,true);assert.equal(w.session.finished,true,'last actual living member ends battle, no phantom reserve');assert.equal(side.totalFainted,1);const faints=step.messages.flatMap(x=>x.kind==='events'?x.events:[]).filter(x=>x.type==='faint');assert.equal(faints.length,1);assert.match(faints[0].args[0],/P1$/);finish(w);
});
test('carried faint seeding is idempotent, emits no extra KO/XP and preserves engine state',async()=>{const w=await setup(['P2']),before=w.session.gw.snapshot();w.session.gw.seedState('p1',w.session.party);assert.equal(w.session.gw.snapshot(),before);w.session.gw.seedState('p1',w.session.party);assert.equal(w.session.gw.snapshot(),before);assert.equal((await w.session.chooseMove(1)).ok,true);assert.equal(w.session.finished,true);finish(w);});
test('two genuinely living members are not prematurely defeated; real forced replacement remains available',async()=>{const w=await setup();assert.equal((await w.session.chooseMove(1)).ok,true);assert.equal(w.session.finished,false);assert.ok(w.session.currentRequest().forceSwitch);assert.equal((await w.session.chooseForcedSwitch('P2')).ok,true);assert.equal((await w.session.chooseMove(1)).ok,true);assert.equal(w.session.finished,true);finish(w);});
