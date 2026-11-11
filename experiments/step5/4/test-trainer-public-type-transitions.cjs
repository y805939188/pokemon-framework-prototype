'use strict';
// Authored teams through real App/Session and pinned Gen8; public DTOs, not injected event fixtures.
const test=require('node:test'),assert=require('node:assert/strict');
const {E,T,D,inputs,clone}=require('./trainer-ai-integration/fixtures.cjs');
async function open({species,ability,moves=['splash'],npcMoves=['splash','thunderbolt'],npcTurns=[1]}={}){
 const raw=inputs({party:1,moves:npcMoves});
 if(!raw.species.some(s=>s.id===species))raw.species.push({id:species,showdownId:species,nameKey:'species.'+species,growth:'medium',baseExp:100,evYield:{hp:1},catchRate:45,learnset:[],source:'author-placeholder'});
 raw.species.find(s=>s.id===species).learnset=moves.map(move=>({level:1,move}));
 raw.trainers[0].aiStrategy={id:'public-types-test',version:'1',parameters:{}};
 const compiled=E.contentCompile.compileContent(raw);assert(compiled.ok,JSON.stringify(compiled.errors));
 const assembled=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(assembled.errors,[]);const content=assembled.content;
 const registry=E.composition.createTrainerAiStrategyRegistry();registry.register({id:'public-types-test',version:'1',implementationIdentity:'test/public-types/1',validateParameters(){},create(){return {decide(s){const slot=npcTurns[s.binding.turn-1]??npcTurns.at(-1),candidate=s.request.legalMoves.find(m=>m.slot===slot);return {kind:'choose',binding:s.binding,candidateId:candidate.candidateId,retryOrder:[candidate.candidateId],diagnostics:[]};}};}});
 const name=Object.keys(content.species).find(n=>n.toLowerCase().replace(/[^a-z0-9]/g,'')===species);
 const member=E.memberFactory.createMember({id:'P1',species:name,level:50,abilityIndex:0},content,()=>0);if(ability)member.ability=ability;
 const backup=E.memberFactory.createMember({id:'P2',species:'Snorlax',level:50},content,()=>0);
 const game=E.state.newGame({content,party:[member,backup].map(m=>E.speciesKey.toPersistentMember(m,content)),money:1000});game.nextMemberOrdinal='3';
 const state=T.fakes.createMemoryState(game),app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4],trainerAiStrategies:registry}),content:()=>({content}),random:()=>0,clock:()=>12345});
 const s=await app.startTrainerBattle({battleId:'public-types-'+species,trainer:{id:'c-basic',version:1},seq:1,canLose:true});return {s,state};
}
const snapshot=w=>D.captureTrainerAiRequest(w.s,w.s.gw).snapshot;
function check(w,types,move,ratio){const s=snapshot(w);assert.deepEqual(s.opponent.active[0].shownTypes,types);assert.deepEqual(w.s.gw._debugBattle().sides[0].active[0].getTypes(),types);if(move)assert.deepEqual(s.request.legalMoves.find(m=>m.moveId===move).metadata.publicTypeMultiplier,ratio);assert.equal(w.state.replaced.length,0);assert.equal(w.s.broken,null);}
async function step(w,slot=1){const out=await w.s.chooseMove(slot);assert(out.ok,JSON.stringify(out));return out;}
async function noPrivateRead(t,w){const actor=w.s.gw._debugBattle().sides[0].active[0],expected=snapshot(w);const mock=t.mock.method(actor,'getTypes',()=>{throw Error('private opposing types read');});assert.deepEqual(snapshot(w),expected);mock.mock.restore();}

test('Illusion reveal retains publicly added type and appearance across a real hit',async t=>{
 const w=await open({species:'zoroark',npcMoves:['forestscurse','tackle','thunderbolt'],npcTurns:[1,2,2]});
 await step(w);assert.deepEqual(snapshot(w).opponent.active[0].shownTypes,['Normal','Grass']);const key=snapshot(w).opponent.active[0].appearanceKey;
 const out=await step(w);assert(out.messages.flatMap(m=>m.events??[]).some(e=>e.type==='replace'));
 check(w,['Dark','Grass'],'thunderbolt',{numerator:1,denominator:2});assert.equal(snapshot(w).opponent.active[0].appearanceKey,key);await noPrivateRead(t,w);
});
test('Transform copies public target types, survives checkpoint, and clears on switch',async t=>{
 t.mock.method(Date,'now',()=>1793350000000);const w=await open({species:'ditto',moves:['transform']});await step(w);
 check(w,['Normal','Flying'],'thunderbolt',{numerator:2,denominator:1});await noPrivateRead(t,w);
 const cp=w.s._checkpoint(),before=clone(snapshot(w));await step(w);await w.s._restoreCheckpoint(cp);assert.deepEqual(snapshot(w),before);check(w,['Normal','Flying']);
 assert((await w.s.chooseSwitch('P2')).ok);assert((await w.s.chooseSwitch('P1')).ok);check(w,['Normal']);
});
test('Forecast formechange updates types through sun and natural return to Normal',async t=>{
 const w=await open({species:'castform',moves:['sunnyday','splash']});await step(w);check(w,['Fire']);await noPrivateRead(t,w);
 for(let i=0;i<5;i++)await step(w,2);check(w,['Normal']);
});
test('Mimicry typechange end restores original types after natural terrain expiry',async t=>{
 const w=await open({species:'stunfiskgalar',moves:['electricterrain','splash']});await step(w);check(w,['Electric']);await noPrivateRead(t,w);
 let ended=false;for(let i=0;i<5;i++){const out=await step(w,2);ended ||= out.messages.flatMap(m=>m.events??[]).some(e=>e.type==='-end'&&e.args[1]==='typechange');}
 assert(ended);check(w,['Ground','Steel'],'thunderbolt',{numerator:0,denominator:1});
});

test('Illusion reveal retains a public replacement type rather than reverting to species',async()=>{
 const w=await open({species:'zoroark',npcMoves:['soak','tackle','thunderbolt'],npcTurns:[1,2,2]});await step(w);await step(w);check(w,['Water'],'thunderbolt',{numerator:2,denominator:1});
});
test('Transform copies publicly added target type, including after source checkpoint restore',async t=>{
 t.mock.method(Date,'now',()=>1793350000000);const w=await open({species:'ditto',moves:['forestscurse','transform']});await step(w);const cp=w.s._checkpoint();await w.s._restoreCheckpoint(cp);await step(w,2);check(w,['Normal','Flying','Grass'],'thunderbolt',{numerator:1,denominator:1});await noPrivateRead(t,w);
});
test('Forecast changing forme clears the preceding public added type',async()=>{
 const w=await open({species:'castform',moves:['splash','sunnyday'],npcMoves:['forestscurse','splash','thunderbolt'],npcTurns:[1,2]});await step(w);check(w,['Normal','Grass']);await step(w,2);check(w,['Fire']);
});
