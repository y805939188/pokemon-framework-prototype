'use strict';
// M1 cross-module intersections. Not all 48 scenarios/560 reference vectors, and not a Ruby oracle.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../../../js/engine/build/engine.cjs'),sourceSha=fs.readFileSync(path.resolve(__dirname,'../../../js/engine/showdown/SOURCE_SHA'),'utf8').trim();
const {actualDamage,unknownReadiness}=require('./fixtures/m1/convergence.cjs');
test('M1/P53-21,27,31,39,43 core: actual D62 survives primary capture/Info, grants known R and later event eligibility once',async()=>{const r=await actualDamage(E,sourceSha);assert.equal(r.damage,62);});
test('M1/P53-21,27,31,39,43 core: missing authority keeps capture/Info and unknown R through deposit, withdraw and recovery',async()=>{const r=await unknownReadiness(E,sourceSha);assert.equal(r.calls,0);});

for(const outgoingD of [0,49])for(const capacity of [3,6])test(`M1/P53-28 CX22/CX23/CX39 core synthetic receipt: A D${outgoingD}, capacity ${capacity} retains K/D/L0 by ID across capture placement`,async()=>{
 const c=JSON.parse(JSON.stringify(E.fixtures.content)),dex=E.dex.createDexLookup(),copy=x=>JSON.parse(JSON.stringify(x));
 for(const [id,sp]of Object.entries(c.species)){const d=dex.species(id);Object.assign(sp,{abilities:d.abilities,hiddenAbilities:d.hiddenAbilities,gender:d.gender,learnset:{}});}
 c.species.Charizard.evolutions=[{method:'EventAfterDamageTaken',parameter:7,target:'Blastoise'}];
 c.species.Blastoise.evolutions=[{method:'Level',parameter:1,target:'Snorlax'},{method:'EventAfterDamageTaken',parameter:7,target:'Venusaur'},{method:'BattleDealCriticalHit',parameter:3,target:'Venusaur'}];
 c.moves.Tackle=dex.move('tackle');c.species.Pidgey.learnset={1:['Tackle']};
 c.species.Pidgey.evolutions=[{method:'Level',parameter:1,target:'Snorlax'}];
 const inputsHash=E.digest.sha256Hex(E.contentCompile.canonicalJson(c)),compiledSemantics=E.contentSchema.COMPILED_SCHEMA_VERSION;c.meta={kind:'fixture',id:'M1-placement',inputsHash,compiledSemantics,showdownSha:sourceSha,contentIdentity:E.digest.sha256Hex(E.contentCompile.canonicalJson({inputsHash,compiledSemantics,showdownSha:sourceSha}))};
 const party=['Charizard','Blastoise','Venusaur'].map((species,i)=>E.memberFactory.createMember({id:['A','B','C'][i],species,level:[10,20,30][i]},c,()=>0)),state=E.fakes.createMemoryState(E.state.newGame({party,content:c,bag:{masterball:1}}));
 let made,calls=0;const complete=value=>({status:'complete',value}),faint=()=>({coverage:{status:'complete'},positiveOccurrences:[]});
 const sessions={async create(request,view,setup){const foe=setup.foes[0],raw={protocol:1,battleId:request.battleId,outcome:{kind:'caught',winner:null,target:foe.id,ball:'masterball'},members:{},bag:{masterball:-1},captured:[E.state.protocolMember({...foe,ball:'masterball'})],dex:{seen:['Pidgey'],owned:['Pidgey']}};made={view,setup,raw};return{result:()=>copy(raw)};},effects(h,binding){calls++;return{version:2,binding:{...binding},context:{playerIds:['A','B','C'],L0:{A:10,B:20,C:30},engineRosterIds:['A','B','C'],foeIds:[made.setup.foes[0].id],internalBattle:true},observer:{appearances:{},defeats:{},members:Object.fromEntries(party.map((m,i)=>[m.id,{critical:complete([1,3,0][i]),damage:complete({total:[outgoingD,49,5][i],resetCoverage:'complete'}),faint:faint()}]))},control:{members:Object.fromEntries(party.map(m=>[m.id,{friendship:complete({before:m.friendship,current:m.friendship,changes:[]}),faint:faint()}]))}};}};
 const app=new E.app.GameApplication({state,content:()=>({content:c}),sessions,projection:{project:()=>{}},random:()=>0,clock:()=>0},{limits:{...E.limits.DEFAULT_LIMITS,party:capacity},receivingProfile:{mode:2,naming:1}}),request={battleId:'M1-capacity-'+capacity,kind:'wild',seq:1,foes:[{species:'Pidgey',level:5}]},h=await app.startBattle(request);
 let done=app.finishBattle(h,request);const incoming=made.setup.foes[0].id;
 if(capacity===3){assert(done.receivingToken);assert.equal(state.replaced.length,0);done=app.resolveReceiving(done.receivingToken,{[incoming]:{placement:{kind:'replace',target:{id:'A',position:{kind:'party',index:0}}}}});}
 assert.equal(done.commit,'applied');assert.deepEqual(state.current().party.map(m=>m.id),capacity===3?['B','C',incoming]:['A','B','C',incoming]);
 assert.equal(app.pendingEvolution.memberId,'B','critical receipt follows B after compaction');assert.equal(app.pendingEvolution.selection.family,'battle');
 assert.equal(state.current().party.find(m=>m.id==='B').readyToEvolve,true,'B also consumes its own D49 before the critical-hit target');
 const old=capacity===3?state.current().storage.boxes[0].slots[0]:state.current().party[0];assert.equal(old.id,'A');assert.equal(old.readyToEvolve,capacity===6&&outgoingD===49,'boxed A must not earn fresh R after leaving the current team');
 const newcomer=state.current().party.at(-1);assert.equal(newcomer.readyToEvolve,false);assert.equal(newcomer.species,'Pidgey');assert.equal(newcomer.level,5);assert.equal(state.current().dex.capturedCounts.Pidgey,1);assert.equal(calls,1);
 const p=app.pendingEvolution;app.resolveEvolution(p.token,p.revision,{kind:'cancel'});assert(!app.pendingEvolution&&!app.saveBlocked,'newcomer with level1 evolution never borrows a snapshot');assert.equal(app.commitResult(made.raw),'already-applied');assert.equal(calls,1);assert.deepEqual(E.saveSchema.validateGameContent(state.current(),c),[]);
});

for(const target of ['B','X','stale-B'])test(`M1-RCV-01 multi-member placement metadata follows final identities: later target ${target}`,()=>{
 const initial=E.fixtures.makeGame(),copy=x=>JSON.parse(JSON.stringify(x));initial.party.forEach((m,i)=>m.id=['A','B','C'][i]);const before=copy(initial),members=['X','Y'].map(id=>({...copy(initial.party[1]),id})),context={content:E.fixtures.content,limits:{...E.limits.DEFAULT_LIMITS,party:3},profile:{mode:2,naming:1}};
 const decisions={X:{placement:{kind:'replace',target:{id:'A',position:{kind:'party',index:0}}}},Y:{placement:{kind:'replace',target:{id:target==='X'?'X':'B',position:{kind:'party',index:target==='X'?2:target==='B'?0:1}}}}};
 if(target==='stale-B'){assert.throws(()=>E.receiving.receiveMembers(initial,members,decisions,context));assert.deepEqual(initial,before);return;}
 const out=E.receiving.receiveMembers(initial,members,decisions,context);assert.deepEqual(out.state.party.map(m=>m.id),target==='B'?['C','X','Y']:['B','C','Y']);assert.deepEqual(initial,before);
 for(const placement of out.placed){const actual=E.storage.locateMember(out.state,placement.id);assert.deepEqual(placement.position,actual.position);assert.equal(placement.to,actual.position.kind==='party'?'party':'boxes');if(actual.position.kind==='box')assert.equal(placement.boxName,out.state.storage.boxes[actual.position.box].name);else assert(!Object.hasOwn(placement,'boxName'));}
});
