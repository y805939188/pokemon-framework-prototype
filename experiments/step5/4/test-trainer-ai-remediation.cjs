'use strict';
// Replays public contracts on the real App/session/locked engine. An optional fixed reviewtree
// lets this same regression suite preserve its pre-fix failures without changing that tree.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=process.env.C_REMEDIATION_SUT_ROOT||path.resolve(__dirname,'../../..');
const {E,T,D,inputs,fixture,inspect,diag,clone}=require(path.join(root,'experiments/step5/4/trainer-ai-integration/fixtures.cjs'));
const actions=w=>w.session.gw._debugBattle().sides[1].choice.actions;
function assemble(raw){const built=E.contentCompile.compileContent(raw);assert.equal(built.ok,true,JSON.stringify(built.errors));const out=E.contentRuntime.assembleContent(built.data,E.dex.createDexLookup());assert.deepEqual(out.errors,[]);return out.content;}
function selected(snapshot,slot=2,full=false){const list=snapshot.request.kind==='move'?snapshot.request.legalMoves:snapshot.request.legalSwitches,c=list.find(m=>m.slot===slot)||list[0];return {kind:'choose',binding:snapshot.binding,candidateId:c.candidateId,retryOrder:full?[c.candidateId,...list.filter(m=>m!==c).map(m=>m.candidateId)]:[c.candidateId],diagnostics:[]};}
function strategy(decide){const r=E.composition.createTrainerAiStrategyRegistry();r.register({id:'repair-test',version:'1',implementationIdentity:'test-only/C1-remediation',validateParameters(p){assert.deepEqual(p,{});},create(){return {decide};}});return r;}
const ref={id:'repair-test',version:'1',parameters:{}};
async function terminal(t,{learns=['amnesia'],durable=false}={}){
  const raw=inputs({party:1,moves:['splash']});for(const move of learns)raw.species.find(s=>s.id==='snorlax').learnset.push({level:51,move});
  const content=assemble(raw),game=E.state.newGame({content,party:[],money:1000}),member=E.memberFactory.createMember({id:'P1',species:'Snorlax',level:50},content,()=>0);
  member.exp=E.growth.minExp(content.species.Snorlax.growth,51)-1;member.item='leftovers';game.party=[E.speciesKey.toPersistentMember(member,content)];game.nextMemberOrdinal='2';
  const initialFriendship=game.party[0].friendship,memory=T.fakes.createMemoryState(game);let state=memory,store,file,failWrite=false;
  if(durable){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'C1-terminal-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));file=path.join(dir,'save.json');store=new E.store.SaveStore(file,{at(point){if(failWrite&&point==='beforeRename')throw Error('controlled store before rename');}},E.speciesKey.speciesKeyResolver(content),content);store.save(game);state={read:()=>store.load(),replace(next){store.save(next);memory.replace(next);}};}
  const sessions=E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4]});
  const dex=E.dex.createDexLookup();
  const app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions,content:()=>({content,dex}),itemWorld:()=>({mapId:0}),random:()=>0,clock:()=>12345},{capabilities:{allowHeldItemSources:true,allowExperimentalHeldItemBattle:true}});
  const request={battleId:'C1-terminal',trainer:{id:'c-basic',version:1},seq:1,canLose:true},session=await app.startTrainerBattle(request);
  session.gw._debugBattle().sides[1].active[0].hp=1;assert.equal((await session.chooseMove(2)).ok,true);assert.equal(session.ended.reason,'win');assert.equal(session.gw._debugBattle().sides[1].activeRequest,null);
  return {app,request,session,memory,store,file,initialFriendship,failWrite:v=>{failWrite=v;}};
}
function finishOnce(w){const out=w.app.finishBattle(w.session,w.request);assert.equal(out.commit,'applied',JSON.stringify(out));const after=clone(w.memory.current());assert.equal(w.memory.replaced.length,1);assert.match(after.appliedBattles[w.request.battleId].settlement.pairHash,/^[a-f0-9]{64}$/);assert.equal(after.party[0].item,'leftovers');assert.equal(after.party[0].friendship,w.initialFriendship+6);assert.equal(w.app.finishBattle(w.session,w.request).commit,'already-applied');assert.deepEqual(w.memory.current(),after);assert.equal(w.memory.replaced.length,1);return after;}
for(const [name,answer]of [['accept',0],['decline',null]])test('C1-01 terminal '+name+' completes real growth, durable Store and paired settlement once',async t=>{
  const w=await terminal(t,{durable:true});assert.equal(w.session.pendingLearn.move.id,'amnesia');const before=fs.readFileSync(w.file);await w.session.decideLearn(answer);assert.equal(w.session.finished,true);assert.deepEqual(fs.readFileSync(w.file),before);const after=finishOnce(w);assert.equal(after.party[0].moves.some(m=>m.id==='amnesia'),answer===0);assert.deepEqual(w.store.load(),after);const installed=fs.readFileSync(w.file);assert.equal(w.store.commit(w.session.result()).status,'already-applied');assert.deepEqual(fs.readFileSync(w.file),installed);
});
test('C1-01 multiple terminal prompts preserve decline/replace order and commit once',async t=>{
  const w=await terminal(t,{learns:['amnesia','rest']});assert.equal(w.session.pendingLearn.move.id,'amnesia');await w.session.decideLearn(null);assert.equal(w.session.pendingLearn.move.id,'rest');assert.equal(w.memory.replaced.length,0);await w.session.decideLearn(0);assert.equal(w.session.finished,true);const after=finishOnce(w);assert.equal(after.party[0].moves[0].id,'rest');assert.ok(!after.party[0].moves.some(m=>m.id==='amnesia'));
});
test('C1-01 real terminal engine-write failure restores prompt, no live ticket, then permits retry',async t=>{
  t.mock.method(Date,'now',()=>1793350000000);const w=await terminal(t),before=clone(w.session.party),random=clone(D.trainerAiDiagnostics(w.session).state.random);const original=w.session.gw.applyGrowth;
  w.session.gw.applyGrowth=function(...args){original.apply(this,args);throw Error('controlled after real growth');};
  await assert.rejects(w.session.decideLearn(0),/controlled after real growth/);assert.equal(w.session.broken,null);assert.equal(w.session.pendingLearn.move.id,'amnesia');assert.deepEqual(w.session.party,before);assert.equal(w.session.gw._debugBattle().sides[1].activeRequest,null);assert.deepEqual(D.trainerAiDiagnostics(w.session).state.random,random);assert.equal(D.trainerAiDiagnostics(w.session).cache,null);assert.equal(w.memory.replaced.length,0);
  await w.session.decideLearn(0);assert.equal(w.session.finished,true);finishOnce(w);
});
test('C1-01 terminal Store pre-rename failure leaves original bytes, retry installs same pair once',async t=>{
  const w=await terminal(t,{durable:true});await w.session.decideLearn(0);const before=fs.readFileSync(w.file);w.failWrite(true);const pending=w.app.finishBattle(w.session,w.request);assert.equal(pending.commit,'none');assert.equal(pending.pending,true);assert.deepEqual(fs.readFileSync(w.file),before);assert.equal(w.memory.replaced.length,0);w.failWrite(false);const retried=w.app.resolveReceiving(pending.receivingToken);assert.equal(retried.commit,'applied',JSON.stringify(retried));assert.equal(w.memory.replaced.length,1);const installed=fs.readFileSync(w.file);assert.equal(w.app.finishBattle(w.session,w.request).commit,'already-applied');assert.deepEqual(fs.readFileSync(w.file),installed);
});
test('C1-01 no-new-move control still finalizes once',async t=>{const w=await terminal(t,{learns:[]});assert.equal(w.session.pendingLearn,null);assert.equal(w.session.finished,true);finishOnce(w);});
test('C1-01 terminal checkpoint cannot borrow another owner or survive generation retirement',async t=>{
  const a=await terminal(t),b=await terminal(t),cp=a.session._checkpoint(),foreign=b.session._checkpoint();await assert.rejects(a.session._restoreCheckpoint(foreign),/checkpoint-owner-mismatch/);assert.equal(a.session.pendingLearn.move.id,'amnesia');await a.session._restoreCheckpoint(cp);assert.equal(a.session.gw._debugBattle().sides[1].activeRequest,null);a.app.stateReplacedByHost();await assert.rejects(a.session.decideLearn(null),/stale-generation/);assert.equal(a.memory.replaced.length,0);
});
test('C1-05 custom registry resolve method retains its actual receiver and function pin',async()=>{
  const registry={backing:E.composition.createTrainerAiStrategyRegistry(),register(...args){return this.backing.register(...args);},setActive(...args){return this.backing.setActive(...args);},resolve(reference){return this.backing.resolve(reference);}};
  const w=await fixture({registry});await D.runTrainerAi(w.session,w.gw);assert.equal(actions(w).length,1);
});
for(const method of ['validateParameters','create'])test('C1-05 registration '+method+' supports private class fields and captured function identity',async()=>{
  class Registration{#slot=2;id='receiver-test';version='1';implementationIdentity='test-only/receiver/'+method;validateParameters(p){if(method==='validateParameters')assert.equal(p.slot,this.#slot);}create(){const slot=method==='create'?this.#slot:2;return {decide:s=>selected(s,slot)};}}
  const entry=new Registration(),r=E.composition.createTrainerAiStrategyRegistry();r.register(entry);entry.create=()=>{throw Error('replacement create must not run');};entry.validateParameters=()=>{throw Error('replacement validator must not run');};const w=await fixture({registry:r,recordStrategy:{id:entry.id,version:'1',parameters:{slot:2}}});await D.runTrainerAi(w.session,w.gw);assert.equal(actions(w)[0].moveid,'growl');
});
async function refusing(chooseHook,decide=(s)=>selected(s)){
  const proto=E.gateway.BattleGateway.prototype,original=proto.choose,attempts=[];let calls=0;const registry=strategy(s=>{calls++;return decide(s);});
  proto.choose=async function(side,choice){if(side==='p2'&&/^(move|switch) /.test(choice)){attempts.push(choice);const response=await chooseHook.call(this,choice,attempts.length,original);if(response!==undefined)return response;}return original.call(this,side,choice);};let w;try{w=await fixture({registry,recordStrategy:ref,party:3});}finally{proto.choose=original;}return {w,attempts,calls:()=>calls};
}
test('C1-04 safe subset refusal tries original untried first legal move once, no reroll',async()=>{
  const {w,attempts,calls}=await refusing((_choice,n)=>n===1?false:undefined);await D.runTrainerAi(w.session,w.gw);assert.deepEqual(attempts,['move 2','move 1']);assert.equal(actions(w)[0].moveid,'tackle');assert.equal(calls(),1);assert.equal(diag(w).state.random.draws,0);await assert.rejects(D.runTrainerAi(w.session,w.gw),/already-submitted/);assert.equal(attempts.length,2);
});
test('C1-04 overlapping full retry list is deduplicated and bounded on all-refused',async()=>{
  const {w,attempts,calls}=await refusing(()=>false,s=>selected(s,2,true));await assert.rejects(D.runTrainerAi(w.session,w.gw),/legal-candidates-exhausted/);assert.deepEqual(attempts,['move 2','move 1']);assert.equal(calls(),1);assert.equal(actions(w).length,0);assert.equal(diag(w).state.random.draws,0);
});
test('C1-04 actual action then false or throw is never followed by another candidate',async()=>{
  for(const mode of ['false','throw']){const {w,attempts,calls}=await refusing(async function(choice,n,original){if(n!==1)return;await original.call(this,'p2',choice);if(mode==='throw')throw Error('controlled after action');return false;});await assert.rejects(D.runTrainerAi(w.session,w.gw),/unknown-effects|controlled after action/);assert.equal(attempts.length,1);assert.equal(calls(),1);assert.equal(diag(w).state.random.draws,0);}
});
test('C1-04 forced subset rejection uses only untried original bench members, no move or draw',async()=>{
  const {w,attempts,calls}=await refusing((choice,n)=>choice.startsWith('switch')&&n===1?false:undefined,s=>selected(s));
  w.gw._debugBattle().sides[1].active[0].hp=1;await w.gw.choose('p1','move 2');await w.gw.choose('p2','move 1');
  const req=D.captureTrainerAiRequest(w.session,w.gw).snapshot.request;assert.equal(req.kind,'force-switch');assert.equal(req.legalSwitches.length,2);await D.runTrainerAi(w.session,w.gw);assert.equal(attempts.length,2);assert.ok(attempts.every(x=>x.startsWith('switch ')));assert.equal(new Set(attempts).size,2);assert.equal(calls(),1);assert.equal(diag(w).state.random.draws,0);
});
test('C1-04 source changed during safe refusal is not swallowed into a fallback action',async()=>{
  let w;const setup=await refusing(()=>{w.setContent(assemble(inputs({skill:0})));return false;});w=setup.w;await assert.rejects(D.runTrainerAi(w.session,w.gw),/content-source-retired/);assert.equal(setup.attempts.length,1);assert.equal(actions(w).length,0);assert.equal(setup.calls(),1);
});
test('C1-04 refused item registration refunds once and then tries an original move without reroll',async()=>{
  const proto=E.gateway.BattleGateway.prototype,original=proto.act;let registrations=0,calls=0;proto.act=async function(side,payload,...rest){if(side==='p2'&&payload.kind==='item'){registrations++;return false;}return original.call(this,side,payload,...rest);};let w;
  try{w=await fixture({items:[{item:'fullrestore',count:1}],registry:strategy(s=>{calls++;const c=s.request.legalItems[0];return {kind:'choose',binding:s.binding,candidateId:c.candidateId,retryOrder:[c.candidateId],diagnostics:[]};}),recordStrategy:ref});}finally{proto.act=original;}
  const p=w.gw._debugBattle().sides[1].active[0];p.hp=10;const bag=clone(w.session.bag);await D.runTrainerAi(w.session,w.gw);assert.equal(registrations,1);assert.equal(calls,1);assert.equal(diag(w).state.resources[0].count,1);assert.equal(diag(w).state.ledger[0].state,'refunded');assert.equal(diag(w).state.resourceRevision,0);assert.equal(diag(w).state.random.draws,0);assert.equal(actions(w).length,1);assert.equal(actions(w)[0].moveid,'tackle');assert.deepEqual(w.session.bag,bag);
});
for(const [moves,slot]of [[['hyperbeam'],1],[['splash','outrage'],2],[['splash','growl','outrage'],3]])test('C1-02 real '+moves[slot-1]+' slot'+slot+' automatic turn and next turn use correct request, zero extra AI draws',async t=>{
  t.mock.method(Date,'now',()=>1793350000000);let calls=0;const w=await fixture({moves,registry:strategy(s=>{calls++;return selected(s,slot);}),recordStrategy:ref});assert.equal((await w.session.chooseMove(1)).ok,true);assert.equal(calls,1);
  const actor=w.session.gw._debugBattle().sides[1].active[0],pp=actor.moveSlots.find(m=>m.id===moves[slot-1]).pp,raw=w.session.gw.awaitingChoice('p2').active[0].moves;assert.equal(raw.length,1);assert.equal(raw[0].id,moves[0]==='hyperbeam'?'recharge':'outrage');assert.equal(raw[0].pp,undefined);
  const before=w.session.gw.snapshot(),random=clone(diag(w).state.random),world=w.worldDraws();const x=inspect(w);assert.equal(x.snapshot.request.kind,'wait');assert.equal(x.plan.kind,'none');assert.deepEqual(JSON.parse(w.session.gw.snapshot()),JSON.parse(before));assert.deepEqual(diag(w).state.random,random);assert.equal(calls,1);
  assert.equal((await w.session.chooseMove(1)).ok,true);assert.equal(calls,1);assert.equal(actor.moveSlots.find(m=>m.id===moves[slot-1]).pp,pp);assert.deepEqual(diag(w).state.random,random);assert.equal(w.worldDraws(),world);assert.equal((await w.session.chooseMove(1)).ok,true);assert.equal(w.session.broken,null);
});
for(const moves of [['hyperbeam'],['splash','outrage']])test('C1-02 automatic '+moves.at(-1)+' matches direct fixed engine control including PRNG',async t=>{
  t.mock.method(Date,'now',()=>1793350000000);const slot=moves.length,create=()=>fixture({moves,registry:strategy(s=>selected(s,slot)),recordStrategy:ref}),a=await create(),b=await create();await a.session.chooseMove(1);await b.session.chooseMove(1);assert.deepEqual(JSON.parse(a.session.gw.snapshot()),JSON.parse(b.session.gw.snapshot()));
  await a.session.chooseMove(1);assert.equal(await b.session.gw.choose('p1','move 1'),true);assert.equal(await b.session.gw.choose('p2','move 1'),true);assert.deepEqual(JSON.parse(a.session.gw.snapshot()),JSON.parse(b.session.gw.snapshot()));assert.deepEqual(diag(a).state.random,diag(b).state.random);
});
test('C1-02 compressed request without a genuine owner lock refuses with no action or RNG',async()=>{
  let calls=0;const w=await fixture({moves:['tackle'],registry:strategy(s=>{calls++;return selected(s,1);}),recordStrategy:ref}),r=w.gw._debugBattle().sides[1].activeRequest;r.active[0].moves=[{move:'Tackle',id:'tackle'}];r.active[0].trapped=true;const before=w.gw.snapshot();await assert.rejects(D.runTrainerAi(w.session,w.gw),/invalid-automatic-request/);assert.equal(w.gw.snapshot(),before);assert.equal(actions(w).length,0);assert.equal(calls,0);assert.equal(diag(w).state.random.draws,0);
});
test('C1-02 automatic response requires original ticket/source and rechecks an expired actual lock',async()=>{
  const w=await fixture({moves:['hyperbeam']});await w.session.chooseMove(1);const x=D.captureTrainerAiRequest(w.session,w.session.gw),id=x.snapshot.binding.requestKey+':'+x.snapshot.binding.requestRevision+':automatic:recharge',other=await fixture();
  assert.throws(()=>D.validateTrainerAiTicket(w.session,w.session.gw,{},id),/unknown-source/);assert.throws(()=>D.validateTrainerAiTicket(w.session,other.gw,x.ticket,id),/source-mismatch/);delete w.session.gw._debugBattle().sides[1].active[0].volatiles.mustrecharge;const before=w.session.gw.snapshot(),random=clone(diag(w).state.random);assert.throws(()=>D.validateTrainerAiTicket(w.session,w.session.gw,x.ticket,id),/revision-changed/);await assert.rejects(D.runTrainerAi(w.session,w.session.gw),/revision-changed|invalid-automatic-request/);assert.equal(w.session.gw.snapshot(),before);assert.deepEqual(diag(w).state.random,random);assert.equal(actions(w).length,0);
});
test('C1-02 genuine PP-less Struggle remains engine-auto-struggle, ordinary single move still calls policy',async()=>{
  let calls=0;const a=await fixture({moves:['tackle'],registry:strategy(s=>{calls++;return selected(s,1);}),recordStrategy:ref});await D.runTrainerAi(a.session,a.gw);assert.equal(calls,1);
  const b=await fixture({moves:['tackle']});for(const m of b.gw._debugBattle().sides[1].active[0].moveSlots)m.pp=0;b.gw.refreshRequests();const x=inspect(b);assert.equal(x.snapshot.request.kind,'move');assert.equal(x.snapshot.request.legalMoves[0].mode,'engine-auto-struggle');assert.equal((await b.session.chooseMove(1)).ok,true);
});
test('C1-03 actual Gen8 Burn Up typeless owner accepts subsequent decision and engine action',async()=>{
  const raw=inputs({moves:['burnup','ember']});raw.trainers[0].party.forEach(p=>p.species='charmander');raw.trainers[0].aiStrategy=ref;let calls=0;const w=await fixture({content:assemble(raw),registry:strategy(s=>selected(s,++calls===1?1:2))});assert.equal((await w.session.chooseMove(1)).ok,true);assert.deepEqual(w.session.gw._debugBattle().sides[1].active[0].getTypes(),['???']);const before=w.session.gw.snapshot(),s=D.captureTrainerAiRequest(w.session,w.session.gw).snapshot;assert.deepEqual(s.own.party.find(m=>m.active).types,['???']);assert.equal(w.session.gw.snapshot(),before);assert.equal((await w.session.chooseMove(1)).ok,true);assert.equal(calls,2);assert.equal(w.session.broken,null);
});
test('C1-03 exact public typeless sentinel is neutral and does not reveal a hidden real type',async()=>{
  const a=await fixture(),b=await fixture();for(const w of [a,b]){const battle=w.gw._debugBattle();battle.add('-start',battle.sides[0].active[0],'typechange','???');w.gw._pump();}b.gw._debugBattle().sides[0].active[0].types=['Ghost'];const x=inspect(a),y=inspect(b);assert.deepEqual(x.snapshot,y.snapshot);assert.deepEqual(x.plan,y.plan);assert.deepEqual(x.snapshot.opponent.active[0].shownTypes,['???']);for(const c of x.snapshot.request.legalMoves)assert.deepEqual(c.metadata.publicTypeMultiplier,{numerator:1,denominator:1});
});
test('C1-03 no-type owner gets no Fire STAB; the eighteen-type chart stays unchanged',async()=>{
  let catalog;const registry=E.composition.createTrainerAiStrategyRegistry();registry.register({id:'catalog-check',version:'1',implementationIdentity:'test-only/catalog-typeless',validateParameters(){},create(c){catalog=clone(c);return {decide:s=>selected(s,1)};}});const raw=inputs({moves:['burnup','ember']});raw.trainers[0].party.forEach(p=>p.species='charmander');raw.trainers[0].aiStrategy={id:'catalog-check',version:'1',parameters:{}};const w=await fixture({content:assemble(raw),registry});await w.session.chooseMove(1);const plain=D.captureTrainerAiRequest(w.session,w.session.gw).snapshot;plain.request.legalMoves=plain.request.legalMoves.filter(m=>m.moveId==='ember');plain.profile.flags=['ScoreMoves'];const fire=clone(plain);fire.own.party.find(m=>m.active).types=['Fire'];const policy=E.trainerAi.createTrainerAiPolicy(catalog),a=[],b=[];assert.equal(policy.decide(plain,n=>{a.push(n);return 0;}).kind,'choose');assert.equal(policy.decide(fire,n=>{b.push(n);return 0;}).kind,'choose');assert.deepEqual(a,[7]);assert.deepEqual(b,[8]);assert.equal(Object.keys(catalog.types).length,18);assert.equal(Object.hasOwn(catalog.types,'???'),false);
});
for(const invalid of ['Mystery','???x',''])test('C1-03 invalid type '+JSON.stringify(invalid)+' still rejects before strategy/random',async()=>{
  let calls=0;const w=await fixture({registry:strategy(s=>{calls++;return selected(s);}),recordStrategy:ref});w.gw._debugBattle().sides[1].active[0].types=[invalid];await assert.rejects(D.runTrainerAi(w.session,w.gw),/invalid-public-snapshot/);assert.equal(calls,0);assert.equal(diag(w).state.random.draws,0);assert.equal(actions(w).length,0);
});
test('C1-03 Burn Up on dual Fire/Flying retains Flying STAB alongside exact typeless component',async()=>{
  let catalog;const r=E.composition.createTrainerAiStrategyRegistry();r.register({id:'dual-types',version:'1',implementationIdentity:'test-only/dual-typeless',validateParameters(){},create(c){catalog=clone(c);return {decide:s=>selected(s,1)};}});
  const raw=inputs({moves:['burnup','wingattack']});raw.trainers[0].party.forEach(p=>p.species='charizard');raw.trainers[0].aiStrategy={id:'dual-types',parameters:{}};
  const w=await fixture({content:assemble(raw),registry:r});await w.session.chooseMove(1);const s=D.captureTrainerAiRequest(w.session,w.session.gw).snapshot;assert.deepEqual(s.own.party.find(m=>m.active).types,['???','Flying']);s.request.legalMoves=s.request.legalMoves.filter(m=>m.moveId==='wingattack');s.profile.flags=['ScoreMoves'];const none=clone(s);none.own.party.find(m=>m.active).types=['???'];const a=[],b=[],policy=E.trainerAi.createTrainerAiPolicy(catalog);assert.equal(policy.decide(s,n=>{a.push(n);return 0;}).kind,'choose');assert.equal(policy.decide(none,n=>{b.push(n);return 0;}).kind,'choose');assert.deepEqual(a,[10]);assert.deepEqual(b,[8]);assert.equal((await w.session.chooseMove(1)).ok,true);
});
