'use strict';
// Authored teams through real App/Session and pinned Gen8, plus explicit gateway protocol-shape cases.
const test=require('node:test'),assert=require('node:assert/strict');
const {E,T,D,inputs,clone}=require('./trainer-ai-integration/fixtures.cjs');
async function open({species,ability,moves=['splash'],npcMoves=['splash','thunderbolt'],npcTurns=[1],scripted=true,hpFraction=1}={}){
 const raw=inputs({party:1,moves:npcMoves});
 if(!raw.species.some(s=>s.id===species))raw.species.push({id:species,showdownId:species,nameKey:'species.'+species,growth:'medium',baseExp:100,evYield:{hp:1},catchRate:45,learnset:[],source:'author-placeholder'});
 raw.species.find(s=>s.id===species).learnset=moves.map(move=>({level:1,move}));
 if(scripted)raw.trainers[0].aiStrategy={id:'public-types-test',version:'1',parameters:{}};
 const compiled=E.contentCompile.compileContent(raw);assert(compiled.ok,JSON.stringify(compiled.errors));
 const assembled=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(assembled.errors,[]);const content=assembled.content;
 const registry=E.composition.createTrainerAiStrategyRegistry();registry.register({id:'public-types-test',version:'1',implementationIdentity:'test/public-types/1',validateParameters(){},create(){return {decide(s){const slot=npcTurns[s.binding.turn-1]??npcTurns.at(-1),candidate=s.request.legalMoves.find(m=>m.slot===slot);return {kind:'choose',binding:s.binding,candidateId:candidate.candidateId,retryOrder:[candidate.candidateId],diagnostics:[]};}};}});
 const name=Object.keys(content.species).find(n=>n.toLowerCase().replace(/[^a-z0-9]/g,'')===species);
 const member=E.memberFactory.createMember({id:'P1',species:name,level:50,abilityIndex:0},content,()=>0);if(ability)member.ability=ability;member.hp=Math.floor(member.hp*hpFraction);
 const backup=E.memberFactory.createMember({id:'P2',species:'Snorlax',level:50},content,()=>0);
 const game=E.state.newGame({content,party:[member,backup].map(m=>E.speciesKey.toPersistentMember(m,content)),money:1000});game.nextMemberOrdinal='3';
 const state=T.fakes.createMemoryState(game),app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4],trainerAiStrategies:registry}),content:()=>({content}),random:()=>0,clock:()=>12345});
 const s=await app.startTrainerBattle({battleId:'public-types-'+species,trainer:{id:'c-basic',version:1},seq:1,canLose:true});return {s,state};
}
const snapshot=w=>D.captureTrainerAiRequest(w.s,w.s.gw).snapshot;
function check(w,types,move,ratio){const s=snapshot(w);assert.deepEqual(s.opponent.active[0].shownTypes,types);assert.deepEqual(w.s.gw._debugBattle().sides[0].active[0].getTypes(),types);if(move)assert.deepEqual(s.request.legalMoves.find(m=>m.moveId===move).metadata.publicTypeMultiplier,ratio);assert.equal(w.state.replaced.length,0);assert.equal(w.s.broken,null);}
async function step(w,slot=1){const out=await w.s.chooseMove(slot);assert(out.ok,JSON.stringify(out));return out;}
// Engine-owned type event dispatch may check whether an opponent is alive. Vary hidden positive
// health values instead: the public DTO must continue to use only the previously announced bar.
function noPrivateHealth(w){const actor=w.s.gw._debugBattle().sides[0].active[0],expected=snapshot(w),hp=actor.hp,maxhp=actor.maxhp;try{actor.hp=1;actor.maxhp=maxhp+999;assert.deepEqual(snapshot(w),expected);}finally{actor.hp=hp;actor.maxhp=maxhp;}}
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


test('Reflect Type with unchanged base types uses public target metadata and continues the real default AI',async t=>{
 const w=await open({species:'doduo',moves:['reflecttype','splash'],npcMoves:['splash'],scripted:false});
 const out=await step(w);const events=out.messages.flatMap(m=>m.events??[]).filter(e=>e.type==='-start'&&e.args[1]==='typechange');
 assert.equal(events.length,1);assert.deepEqual(events[0].args.slice(2),['[from] move: Reflect Type','[of] p2a: M3']);
 await step(w,2);check(w,['Normal','Flying']);await noPrivateRead(t,w);await step(w);await step(w,2);check(w,['Normal','Flying']);
});
test('Reflect Type with different base types accepts the subsequent real silent type announcement',async t=>{
 const w=await open({species:'snorlax',moves:['reflecttype','splash']});const out=await step(w);
 assert(out.messages.flatMap(m=>m.events??[]).some(e=>e.type==='-start'&&e.args[1]==='typechange'&&e.args[3]==='[silent]'));
 check(w,['Normal','Flying'],'thunderbolt',{numerator:2,denominator:1});await noPrivateRead(t,w);await step(w,2);
});
test('Reflect Type copies a public added target type without a corrective silent base event',async t=>{
 const w=await open({species:'doduo',moves:['forestscurse','reflecttype','splash']});await step(w);const out=await step(w,2);
 assert.equal(out.messages.flatMap(m=>m.events??[]).filter(e=>e.type==='-start'&&e.args[1]==='typechange').length,1);
 check(w,['Normal','Flying','Grass'],'thunderbolt',{numerator:1,denominator:1});await noPrivateRead(t,w);await step(w,3);
});
test('Reflect Type replaces the user added type with the public target added type',async t=>{
 const w=await open({species:'doduo',moves:['forestscurse','reflecttype','splash'],npcMoves:['trickortreat','splash','thunderbolt'],npcTurns:[1,2]});
 await step(w);check(w,['Normal','Flying','Ghost']);await step(w,2);check(w,['Normal','Flying','Grass'],'thunderbolt',{numerator:1,denominator:1});await noPrivateRead(t,w);await step(w,3);
});
test('Reflect Type clears the user added type when the public target has none',async()=>{
 const w=await open({species:'doduo',moves:['splash','reflecttype'],npcMoves:['forestscurse','splash','thunderbolt'],npcTurns:[1,2]});
 await step(w);check(w,['Normal','Flying','Grass']);await step(w,2);check(w,['Normal','Flying'],'thunderbolt',{numerator:2,denominator:1});await step(w);
});
test('Reflect Type public types survive checkpoint replay and clear on switching',async t=>{
 t.mock.method(Date,'now',()=>1793350000000);const w=await open({species:'doduo',moves:['forestscurse','reflecttype','splash']});await step(w);await step(w,2);
 const cp=w.s._checkpoint(),before=clone(snapshot(w));await step(w,3);await w.s._restoreCheckpoint(cp);assert.deepEqual(snapshot(w),before);check(w,['Normal','Flying','Grass']);
 await step(w,3);assert((await w.s.chooseSwitch('P2')).ok);assert((await w.s.chooseSwitch('P1')).ok);check(w,['Normal','Flying']);
});
for(const species of ['ditto','doduo'])test('NPC Reflect Type remains a public source for the next player Transform: '+species,async t=>{
 const w=await open({species,moves:['splash','transform'],npcMoves:['reflecttype','splash','thunderbolt'],npcTurns:[1,2]});
 await step(w);await step(w,2);check(w,species==='ditto'?['Normal']:['Normal','Flying'],'thunderbolt',{numerator:species==='ditto'?1:2,denominator:1});await noPrivateRead(t,w);await step(w);
});


test('real Pain Split refreshes the public health bar before the next trainer decision',async t=>{
 const w=await open({species:'gengar',moves:['painsplit','splash'],npcMoves:['splash'],scripted:false,hpFraction:1/3});
 const before=snapshot(w).opponent.active[0].hpBar.parts,out=await step(w);
 const events=out.messages.flatMap(m=>m.events??[]).filter(e=>e.type==='-sethp');assert.equal(events.length,2);assert(events.every(e=>e.args[2]==='[from] move: Pain Split'));
 const player=w.s.gw._debugBattle().sides[0].active[0],expected=Math.ceil(100*player.hp/player.maxhp);assert(expected>before);
 assert.deepEqual(snapshot(w).opponent.active[0].hpBar,{parts:expected,scale:100});noPrivateHealth(w);await noPrivateRead(t,w);await step(w,2);assert.equal(w.state.replaced.length,0);
});
for(const order of ['single-player','single-npc','player-first','player-second'])test('public sethp projection accepts protocol health pairs without consuming tags: '+order,async()=>{
 const w=await open({species:'snorlax'}),battle=w.s.gw._debugBattle(),player=battle.sides[0].active[0],npc=battle.sides[1].active[0];
 const args=order==='single-player'?[player,'80/120 par']:order==='single-npc'?[npc,'30/120']:
  order==='player-first'?[player,'80/120 par',npc,'30/120']:[npc,'30/120',player,'80/120 par'];
 battle.add('-sethp',...args,'[from] move: Pain Split','[of] p1a: P1','[silent]');w.s.gw._pump();
 const observed=snapshot(w).opponent.active[0];assert.deepEqual(observed.hpBar,{parts:order==='single-npc'?100:67,scale:100});assert.equal(observed.status,order==='single-npc'?'none':'par');assert.equal(observed.fainted,false);assert.equal(w.state.replaced.length,0);
});

test('real Pain Split tracks the active public Illusion alias through its later reveal',async()=>{
 const w=await open({species:'zoroark',moves:['painsplit','splash'],npcMoves:['splash','tackle'],npcTurns:[1,2],hpFraction:1/3});const appearance=snapshot(w).opponent.active[0].appearanceKey;
 const out=await step(w),events=out.messages.flatMap(m=>m.events??[]).filter(e=>e.type==='-sethp');assert(events.some(e=>e.args[0]==='p1a: P2'));
 const player=w.s.gw._debugBattle().sides[0].active[0];assert.deepEqual(snapshot(w).opponent.active[0].hpBar,{parts:Math.ceil(100*player.hp/player.maxhp),scale:100});noPrivateHealth(w);
 const next=await step(w,2);assert(next.messages.flatMap(m=>m.events??[]).some(e=>e.type==='replace'&&e.args[0]==='p1a: P1'));
 const shown=snapshot(w).opponent.active[0];assert.equal(shown.appearanceKey,appearance);assert.equal(shown.displayedSpecies,'zoroark');assert.deepEqual(shown.hpBar,{parts:Math.ceil(100*player.hp/player.maxhp),scale:100});assert.equal(w.state.replaced.length,0);
});
