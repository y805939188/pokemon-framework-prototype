'use strict';
// Actual formal App/AI/Gen8 ports. No replacement pause override or direct action-queue injection.
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('./trainer-ai-integration/fixtures.cjs'),{E,T,D}=F,clone=v=>JSON.parse(JSON.stringify(v));
const read=s=>E.session.readTrainerReplacement?.(s)??null;
const resolve=(s,v,id)=>E.session.resolveTrainerReplacement(s,v.offerId,id);
const target=(s,v,id)=>E.session.readTrainerReplacementTarget(s,v.offerId,id);
function choose(snapshot){const list=snapshot.request.kind==='force-switch'?snapshot.request.legalSwitches:snapshot.request.legalMoves,c=list[0];return {kind:'choose',binding:snapshot.binding,candidateId:c.candidateId,retryOrder:[c.candidateId],diagnostics:[]};}
async function open({enabled=true,canSwitch=true,members=2,ownMoves=['tackle'],decide,illusion=false,initialField,battleStyle}={}){
 const registry=E.composition.createTrainerAiStrategyRegistry();let calls=0,onContent=null;
 const ref=decide?{id:'switch-test',version:'1',parameters:{}}:undefined;
 if(decide)registry.register({id:'switch-test',version:'1',implementationIdentity:'test-only/switch-port/1',validateParameters(){},create(){return {decide(s,p,r){calls++;return decide(s,p,r);}};}});
 const input=F.inputs({party:illusion?3:2,moves:['splash'],recordStrategy:ref});input.species.find(s=>s.id==='snorlax').learnset=ownMoves.map(move=>({level:1,move}));for(const mon of input.trainers[0].party)mon.level=1;
 if(illusion){input.trainers[0].party[1].species='snorlax';input.trainers[0].party[1].ability='illusion';}
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));const assembled=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(assembled.errors,[]);const content=assembled.content,dex=E.dex.createDexLookup();
 const game=E.state.newGame({content,party:[],money:1000});game.party=['P1','R'].slice(0,members).map(id=>{const m=E.memberFactory.createMember({id,species:'Snorlax',level:50},content,()=>0);m.moves=ownMoves.map(id=>({id,pp:dex.move(id).pp,maxpp:dex.move(id).pp}));return E.speciesKey.toPersistentMember(m,content);});game.nextMemberOrdinal=String(members+1);
 const state=T.fakes.createMemoryState(game),before=JSON.stringify(state.read()),projection=T.fakes.createRecordingProjection(),options={replacementOffers:enabled,trainerAiStrategies:registry,content:()=>{onContent?.();return content;},seed:()=>[1,2,3,4]},factory=E.composition.createBattleSessionFactory(options);
 const app=new E.app.GameApplication({state,projection,sessions:factory,content:()=>({content}),random:()=>0,clock:()=>12345}),request={battleId:'replacement-ports',trainer:{id:'c-basic',version:1},seq:1,canLose:true,canSwitch,...(initialField?{initialField}:{}),...(battleStyle?{battleStyle}:{})};
 const s=await app.startTrainerBattle(request),oldFoe=s.gw.activeId('p2');s.take();return{s,app,request,state,before,oldFoe,options,calls:()=>calls,onContent:f=>{onContent=f;},cleanup(){app.abortBattle(request,Error('owned test cleanup'));if(!state.replaced.length)assert.equal(JSON.stringify(state.read()),before);}};
}
const events=r=>r.messages.flatMap(m=>m.kind==='events'?m.events:[]),journal=s=>D.trainerAiJournal(s).entries;
async function finish(w){assert((await w.s.chooseMove(1)).ok);assert(w.s.finished);assert.equal(w.state.replaced.length,0);const outcome=w.app.finishBattle(w.s,w.request);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));assert.equal(w.state.replaced.length,1);w.app.finishBattle(w.s,w.request);assert.equal(w.state.replaced.length,1);}
test('SSP01 formal opt-in pauses before the selected foe actually replaces; projection and target reads are pure',async()=>{
 const w=await open();try{const r=await w.s.chooseMove(1);assert(r.ok);const v=read(w.s);assert(v,'actual new replacement offer must exist');assert.equal(w.s.gw.activeId('p2'),w.oldFoe);assert(w.s.gw.readState('p2').find(m=>m.id===w.oldFoe).fainted);assert(w.s.gw.awaitingChoice('p2').forceSwitch[0]);assert.equal(w.s.currentRequest(),undefined);assert.deepEqual(v.candidates,['R']);assert.equal(v.playerId,'P1');assert.equal(v.opponentSpecies,'Pidgey');const snap=w.s.gw.snapshot(),j=clone(journal(w.s));
 for(let n=0;n<3;n++){assert.deepEqual(read(w.s),v);assert.deepEqual(target(w.s,v,'R'),{ok:true});}v.candidates.push('foreign');assert.deepEqual(read(w.s).candidates,['R']);assert.deepEqual(await w.s.chooseMove(1),{ok:false,reason:'choice-rejected'});assert.deepEqual(await w.s.chooseSwitch('R'),{ok:false,reason:'choice-rejected'});assert.deepEqual(await w.s.useItem('potion','P1'),{ok:false,reason:'choice-rejected'});await w.s.cancel();assert.equal(read(w.s).offerId,v.offerId,'ordinary staged-choice cancel does not answer the new offer');assert.equal(w.s.gw.snapshot(),snap);assert.deepEqual(journal(w.s),j);assert.equal(JSON.stringify(w.state.read()),w.before);
 }finally{w.cleanup();}
});
test('SSP02 Yes executes native player switch before the same prepared foe, spends no extra PP, and saves once',async()=>{
 const w=await open();try{assert((await w.s.chooseMove(1)).ok);const v=read(w.s),j=clone(journal(w.s)),rng=clone(D.trainerAiDiagnostics(w.s).state.random),before=w.s.gw.readState('p1').map(m=>[m.id,m.pp.tackle]);const r=await resolve(w.s,v,'R');assert(r.ok);assert.deepEqual(events(r).filter(e=>e.type==='switch').map(e=>e.args[0].slice(0,2)),['p1','p2']);assert.equal(events(r).filter(e=>e.type==='move').length,0);assert.deepEqual(w.s.gw.readState('p1').map(m=>[m.id,m.pp.tackle]).sort(),before.sort());assert.equal(w.s.gw.activeId('p1'),'R');assert.equal(read(w.s),null);assert.deepEqual(journal(w.s).map(({lastAcceptedCandidate,...x})=>x),j.map(({lastAcceptedCandidate,...x})=>x));assert.deepEqual(D.trainerAiDiagnostics(w.s).state.random,rng);assert.deepEqual(await resolve(w.s,v,'R'),{ok:false,reason:'choice-rejected'});assert.equal(w.state.replaced.length,0);await finish(w);assert.equal(w.state.read().party.find(m=>m.id==='R').moves[0].pp,34);
 }finally{w.cleanup();}
});
test('SSP03 No or member-list cancel resumes the recorded foe without switching or re-inference',async()=>{
 let calls=0;const w=await open({decide:(s,p,r)=>{calls++;r(17);return choose(s);}});try{assert((await w.s.chooseMove(1)).ok);const v=read(w.s),n=calls,rng=clone(D.trainerAiDiagnostics(w.s).state.random);const r=await resolve(w.s,v,null);assert(r.ok);assert.equal(calls,n);assert.deepEqual(D.trainerAiDiagnostics(w.s).state.random,rng);assert.deepEqual(events(r).filter(e=>e.type==='switch').map(e=>e.args[0].slice(0,2)),['p2']);assert.equal(events(r).filter(e=>e.type==='move').length,0);assert.equal(w.s.gw.activeId('p1'),'P1');assert.equal(w.s.gw.readState('p1').find(m=>m.id==='P1').pp.tackle,34);await finish(w);
 }finally{w.cleanup();}
});
test('SSP04 canSwitch false does not remove the offer but blocks optional selection and permits No',async()=>{
 const w=await open({canSwitch:false});try{assert((await w.s.chooseMove(1)).ok);const v=read(w.s);assert(v);assert.equal(v.allowSwitch,false);const snap=w.s.gw.snapshot();assert.deepEqual(target(w.s,v,'R'),{ok:false,reason:'switch-disabled'});assert.deepEqual(await resolve(w.s,v,'R'),{ok:false,reason:'choice-rejected'});assert.equal(w.s.gw.snapshot(),snap);assert((await resolve(w.s,v,null)).ok);
 }finally{w.cleanup();}
});
test('SSP05 real Ingrain still offers; native trapping query is pure and rejection can be cancelled normally',async()=>{
 const w=await open({ownMoves:['ingrain','tackle']});try{assert((await w.s.chooseMove(1)).ok);assert.equal(read(w.s),null);assert((await w.s.chooseMove(2)).ok);const v=read(w.s);assert(v);const snap=w.s.gw.snapshot();assert.deepEqual(target(w.s,v,'R'),{ok:false,reason:'trapped'});assert.deepEqual(await resolve(w.s,v,'R'),{ok:false,reason:'choice-rejected'});assert.equal(w.s.gw.snapshot(),snap);assert((await resolve(w.s,v,null)).ok);assert.equal(w.s.gw.activeId('p1'),'P1');
 }finally{w.cleanup();}
});
test('SSP06 a real Outrage KO suppresses the offer and preserves the native lock',async()=>{
 const w=await open({ownMoves:['outrage']});try{assert((await w.s.chooseMove(1)).ok);assert.equal(read(w.s),null);assert(w.s.gw._debugBattle().sides[0].active[0].volatiles.lockedmove);assert.notEqual(w.s.gw.activeId('p2'),w.oldFoe);
 }finally{w.cleanup();}
});
test('SSP07 a real player switch followed by foe poison KO does not offer another switch in that turn',async()=>{
 const w=await open();try{const foe=w.s.gw.readState('p2').find(m=>m.id===w.oldFoe);w.s.gw.seedState('p2',[{id:foe.id,hp:1,status:'psn',statusCount:0}]);assert((await w.s.chooseSwitch('R')).ok);assert.equal(read(w.s),null);assert.equal(w.s.gw.activeId('p1'),'R');assert.notEqual(w.s.gw.activeId('p2'),w.oldFoe);
 }finally{w.cleanup();}
});
for(const options of [{enabled:false},{members:1}])test('SSP08 '+JSON.stringify(options)+' retains the existing automatic replacement path',async()=>{
 const w=await open(options);try{assert((await w.s.chooseMove(1)).ok);assert.equal(read(w.s),null);assert.notEqual(w.s.gw.activeId('p2'),w.oldFoe);assert(w.s.currentRequest().active);
 }finally{w.cleanup();}
});
test('SSP09 announcement uses native Illusion appearance and the actual switch matches it',async()=>{
 const w=await open({illusion:true,decide:choose});try{assert((await w.s.chooseMove(1)).ok);const v=read(w.s);assert.equal(v.opponentSpecies,'Pidgey');const r=await resolve(w.s,v,null);assert(r.ok);const actual=events(r).find(e=>e.type==='switch'&&e.args[0].startsWith('p2'));assert(actual.args[1].startsWith(v.opponentSpecies));const mon=w.s.gw._debugBattle().sides[1].active[0];assert.equal(mon.species.name,'Snorlax');assert.equal(mon.illusion.species.name,'Pidgey');
 }finally{w.cleanup();}
});
test('SSP10 stale or foreign offer selector cannot target another session; changed live state invalidates the source',async()=>{
 const a=await open(),b=await open();try{await a.s.chooseMove(1);await b.s.chooseMove(1);const av=read(a.s),bv=read(b.s),snap=b.s.gw.snapshot();assert.notEqual(av.offerId,bv.offerId);assert.deepEqual(await resolve(b.s,av,'R'),{ok:false,reason:'choice-rejected'});assert.equal(b.s.gw.snapshot(),snap);const lead=a.s.gw.readState('p1').find(m=>m.id==='P1');a.s.gw.seedState('p1',[{id:lead.id,hp:lead.hp-1}]);const changed=a.s.gw.snapshot();await assert.rejects(resolve(a.s,av,'R'),/replacement-offer-stale/);assert.equal(a.s.gw.snapshot(),changed);
 }finally{a.cleanup();b.cleanup();}
});
test('SSP11 checkpoint restores prepared choice without new inference, and old UI selectors are rejected',async()=>{
 const w=await open({decide:(s,p,r)=>{r(11);return choose(s);}});try{await w.s.chooseMove(1);const old=read(w.s),cp=w.s._checkpoint(),rng=clone(D.trainerAiDiagnostics(w.s).state.random),calls=w.calls();assert((await resolve(w.s,old,'R')).ok);await w.s._restoreCheckpoint(cp);const v=read(w.s);assert(v);assert.notEqual(v.offerId,old.offerId);assert.equal(w.calls(),calls);assert.deepEqual(D.trainerAiDiagnostics(w.s).state.random,rng);const snap=w.s.gw.snapshot();assert.deepEqual(await resolve(w.s,old,null),{ok:false,reason:'choice-rejected'});assert.equal(w.s.gw.snapshot(),snap);assert((await resolve(w.s,v,null)).ok);assert.equal(w.calls(),calls);assert.equal(w.s.gw.activeId('p1'),'P1');
 }finally{w.cleanup();}
});
test('SSP12 an actual content-port failure after native staging rolls back queue and prepared rights before retry',async()=>{
 const w=await open();try{await w.s.chooseMove(1);const old=read(w.s),snapshot=w.s.gw.snapshot();let fired=false;w.onContent(()=>{if(!fired&&w.s.gw._debugBattle().sides[0].choice.actions.some(a=>a.order===2.5)){fired=true;assert.equal(read(w.s),null,'a submitting operation exposes no interactive offer');throw Error('controlled replacement commit failure');}});await assert.rejects(resolve(w.s,old,'R'),/controlled replacement commit failure/);assert(fired);assert.deepEqual(JSON.parse(w.s.gw.snapshot()),JSON.parse(snapshot));const fresh=read(w.s);assert(fresh);assert.notEqual(fresh.offerId,old.offerId);assert.equal(w.s.gw._debugBattle().sides[0].choice.actions.length,0);assert.equal(w.state.replaced.length,0);w.onContent(null);assert((await resolve(w.s,fresh,'R')).ok);
 }finally{w.cleanup();}
});
test('SSP13 abort during asynchronous forced replacement preparation prevents a late offer or action',async()=>{
 let release,input;const deferred=new Promise(resolve=>{release=resolve;}),w=await open({decide:s=>{if(s.request.kind==='force-switch'){input=s;return deferred;}return choose(s);}});try{const task=w.s.chooseMove(1).then(v=>({v}),error=>({error}));await new Promise(resolve=>setImmediate(resolve));assert(input);w.app.abortBattle(w.request,Error('controlled replacement abort'));const snapshot=w.s.gw.snapshot();release(choose(input));assert((await task).error);await new Promise(resolve=>setImmediate(resolve));assert.equal(read(w.s),null);assert.equal(w.s.gw.snapshot(),snapshot);assert.equal(w.state.replaced.length,0);
 }finally{w.cleanup();}
});
test('SSP14 opt-in is captured once and invalid or legacy factories are rejected',async()=>{
 const w=await open();try{w.options.replacementOffers=false;assert((await w.s.chooseMove(1)).ok);assert(read(w.s));}finally{w.cleanup();}
 assert.throws(()=>E.composition.createBattleSessionFactory({content:()=>null,replacementOffers:'true'}),/replacement-offers/);assert.throws(()=>E.composition.createBattleSessionFactory({content:()=>null,replacementOffers:true,driver:{}}),/replacement-offers/);
});

// Initial-field callbacks are runtime-only. All real replacement ticket operations must use
// the gateway's field-aware serializer and recreate those callbacks only on isolated probes.
function hookIdentity(b){
 const table=b.events,rows=Object.entries(table??{}).map(([key,value])=>[key,value,[...value]]);
 return()=>{assert.equal(b.events,table);for(const[key,array,records]of rows){assert.equal(table[key],array);assert.deepEqual(array,records);}};
}
const initialFields=[['rain',{weather:'rain'}],['grassy',{terrain:'grassy'}],['cave',{environment:'cave'}]];
for(const[name,initialField]of initialFields)for(const answer of ['R',null])test('SSF01 '+name+' default Switch complete offer lifecycle '+(answer??'No/list-cancel'),async()=>{
 const w=await open({initialField,decide:choose});try{
  assert.equal(w.request.battleStyle,undefined,'exercise default Switch');assert((await w.s.chooseMove(1)).ok);const v=read(w.s);assert(v);assert.equal(v.opponentSpecies,'Pidgey');assert.equal(w.s.gw.activeId('p2'),w.oldFoe);
  const b=w.s.gw._debugBattle(),hooks=hookIdentity(b),snapshot=w.s.gw.snapshot(),rng=b.prng.getSeed(),j=clone(journal(w.s)),calls=w.calls();
  for(let i=0;i<3;i++){assert.deepEqual(read(w.s),v);assert.deepEqual(target(w.s,v,'R'),{ok:true});assert.deepEqual(target(w.s,v,'missing'),{ok:false,reason:'invalid-target'});hooks();}
  assert.deepEqual(await resolve(w.s,v,'missing'),{ok:false,reason:'choice-rejected'});await w.s.cancel();assert.deepEqual(read(w.s),v);assert.equal(w.s.gw.snapshot(),snapshot);assert.equal(b.prng.getSeed(),rng);assert.deepEqual(journal(w.s),j);assert.equal(JSON.stringify(w.state.read()),w.before);
  const r=await resolve(w.s,v,answer);assert(r.ok);assert.deepEqual(events(r).filter(e=>e.type==='switch').map(e=>e.args[0].slice(0,2)),answer?['p1','p2']:['p2']);assert.equal(events(r).filter(e=>e.type==='move').length,0);assert.equal(w.s.gw.activeId('p1'),answer??'P1');assert.equal(w.calls(),calls);assert.equal(read(w.s),null);assert.deepEqual(await resolve(w.s,v,answer),{ok:false,reason:'choice-rejected'});hooks();await finish(w);
 }finally{w.cleanup();}
});
for(const[name,initialField]of initialFields)test('SSF02 '+name+' pending offer checkpoint restoration rejects old selector without repeating AI',async()=>{
 const w=await open({initialField,decide:(s,p,r)=>{r(11);return choose(s);}});try{
  assert((await w.s.chooseMove(1)).ok);const old=read(w.s),cp=w.s._checkpoint(),before=w.s.gw.snapshot(),rng=clone(D.trainerAiDiagnostics(w.s).state.random),calls=w.calls();assert((await resolve(w.s,old,'R')).ok);await w.s._restoreCheckpoint(cp);const v=read(w.s);assert(v);assert.notEqual(v.offerId,old.offerId);assert.deepEqual(JSON.parse(w.s.gw.snapshot()),JSON.parse(before));assert.equal(w.calls(),calls);assert.deepEqual(D.trainerAiDiagnostics(w.s).state.random,rng);assert.equal(w.s.gw._debugBattle().events.onSetWeather.length,1);assert.deepEqual(await resolve(w.s,old,null),{ok:false,reason:'choice-rejected'});assert((await resolve(w.s,v,null)).ok);await finish(w);
 }finally{w.cleanup();}
});
for(const[name,initialField]of initialFields)test('SSF03 '+name+' actual staged failure restores offer rights and field hooks before retry',async()=>{
 const w=await open({initialField});try{
  assert((await w.s.chooseMove(1)).ok);const old=read(w.s),snapshot=w.s.gw.snapshot(),rng=clone(D.trainerAiDiagnostics(w.s).state.random);let fired=false;
  w.onContent(()=>{if(!fired&&w.s.gw._debugBattle().sides[0].choice.actions.some(a=>a.order===2.5)){fired=true;throw Error('controlled field replacement commit failure');}});
  await assert.rejects(resolve(w.s,old,'R'),/controlled field replacement commit failure/);assert(fired);assert.deepEqual(JSON.parse(w.s.gw.snapshot()),JSON.parse(snapshot));assert.deepEqual(D.trainerAiDiagnostics(w.s).state.random,rng);const v=read(w.s);assert(v);assert.notEqual(v.offerId,old.offerId);assert.equal(w.s.gw._debugBattle().events.onSetWeather.length,1);assert.equal(w.s.gw._debugBattle().sides[0].choice.actions.length,0);assert.equal(w.state.replaced.length,0);w.onContent(null);assert((await resolve(w.s,v,'R')).ok);await finish(w);
 }finally{w.cleanup();}
});
for(const[name,initialField]of [['none',{weather:'none',terrain:'none',environment:'none'}],...initialFields])test('SSF04 '+name+' explicit Set retains automatic replacement',async()=>{
 const w=await open({initialField,battleStyle:'set'});try{assert((await w.s.chooseMove(1)).ok);assert.equal(read(w.s),null);assert.notEqual(w.s.gw.activeId('p2'),w.oldFoe);await finish(w);}finally{w.cleanup();}
});
test('SSF05 all-none default Switch remains supported',async()=>{
 const w=await open({initialField:{weather:'none',terrain:'none',environment:'none'}});try{assert((await w.s.chooseMove(1)).ok);assert((await resolve(w.s,read(w.s),'R')).ok);await finish(w);}finally{w.cleanup();}
});
test('SSF06 both native preview clones have exactly one field hook set before evaluation; live query stays pure',async()=>{
 const w=await open({initialField:{weather:'harshsun',terrain:'grassy',environment:'cave'},illusion:true,decide:choose});
 const Sim=require('../../../js/engine/showdown/dist/sim'),original=Sim.Battle.fromJSON;let previews=0,traps=0;
 Sim.Battle.fromJSON=function(...args){const b=original.apply(this,args),nativeSwitch=b.actions.switchIn,nativeEvent=b.runEvent;
  const attached=()=>{assert.equal(b.events?.onSetWeather?.length,1);assert.equal(b.events?.onModifyMove?.length,1);assert.equal(b.events?.onModifySecondaries?.length,1);};
  b.actions.switchIn=function(...a){previews++;attached();return nativeSwitch.apply(this,a);};
  b.runEvent=function(...a){if(a[0]==='TrapPokemon'){traps++;attached();}return nativeEvent.apply(this,a);};return b;
 };
 try{assert((await w.s.chooseMove(1)).ok);const v=read(w.s);assert.equal(v.opponentSpecies,'Pidgey');const snapshot=w.s.gw.snapshot();assert.deepEqual(target(w.s,v,'R'),{ok:true});assert.equal(w.s.gw.snapshot(),snapshot);assert(previews>0);assert(traps>0);}
 finally{Sim.Battle.fromJSON=original;w.cleanup();}
});
test('SSF07 field serialization fault restores exact live hook identities; captured snapshot cannot be replaced by caller',async()=>{
 const w=await open({initialField:{weather:'rain',environment:'cave'}});try{
  assert((await w.s.chooseMove(1)).ok);const v=read(w.s),b=w.s.gw._debugBattle(),original=b.toJSON,restore=hookIdentity(b);
  b.toJSON=function(){throw Error('controlled replacement serializer fault');};try{assert.throws(()=>read(w.s),/controlled replacement serializer fault/);}finally{b.toJSON=original;}restore();
  const snapshot=w.s.gw.snapshot,at=snapshot.call(w.s.gw);w.s.gw.snapshot=()=>{throw Error('caller snapshot must not be used');};try{assert.deepEqual(read(w.s),v);assert.deepEqual(target(w.s,v,'R'),{ok:true});}finally{w.s.gw.snapshot=snapshot;}assert.equal(w.s.gw.snapshot(),at);restore();
 }finally{w.cleanup();}
});
test('SSF08 field trapping and changed-state stale guards remain fail closed',async()=>{
 const w=await open({initialField:{weather:'rain',terrain:'grassy',environment:'cave'},ownMoves:['ingrain','tackle']});try{
  assert((await w.s.chooseMove(1)).ok);assert((await w.s.chooseMove(2)).ok);const v=read(w.s),snapshot=w.s.gw.snapshot();assert.deepEqual(target(w.s,v,'R'),{ok:false,reason:'trapped'});assert.deepEqual(await resolve(w.s,v,'R'),{ok:false,reason:'choice-rejected'});assert.equal(w.s.gw.snapshot(),snapshot);
  const lead=w.s.gw.readState('p1').find(m=>m.id==='P1');w.s.gw.seedState('p1',[{id:lead.id,hp:lead.hp-1}]);const changed=w.s.gw.snapshot();assert.throws(()=>read(w.s),/replacement-offer-stale/);assert.equal(w.s.gw.snapshot(),changed);
 }finally{w.cleanup();}
});
test('SSF09 initial field abort during async preparation prevents a late offer or action',async()=>{
 let release,input;const deferred=new Promise(r=>{release=r;}),w=await open({initialField:{weather:'rain',terrain:'grassy',environment:'cave'},decide:s=>{if(s.request.kind==='force-switch'){input=s;return deferred;}return choose(s);}});try{
  const task=w.s.chooseMove(1).then(v=>({v}),error=>({error}));await new Promise(r=>setImmediate(r));assert(input);w.app.abortBattle(w.request,Error('controlled field replacement abort'));const snapshot=w.s.gw.snapshot();release(choose(input));assert((await task).error);await new Promise(r=>setImmediate(r));assert.equal(read(w.s),null);assert.equal(w.s.gw.snapshot(),snapshot);assert.equal(w.state.replaced.length,0);
 }finally{w.cleanup();}
});
test('SSF10 replacement serialization does not discard unrelated event registrations',async()=>{
 const w=await open({initialField:{weather:'rain',environment:'cave'}});try{
  assert((await w.s.chooseMove(1)).ok);const b=w.s.gw._debugBattle();b.onEvent('ModifyMove',b.format,3,()=>{});const restore=hookIdentity(b);
  assert.throws(()=>read(w.s),/Unsupported type Format/,'foreign native callback must still fail serialization, not silently disappear');restore();
 }finally{w.cleanup();}
});
