'use strict';
// Each C gate runs the actual formal App/composition/Showdown/session implementation; no frozen expected vector is executed as the SUT.
const test=require('node:test'),assert=require('node:assert/strict');
const {E,T,D,clone,fixture,inspect,diag}=require('./trainer-ai-integration/fixtures.cjs');
const capture=w=>D.captureTrainerAiRequest(w.session,w.session.gw);
const active=w=>w.session.gw._debugBattle().sides[1].active[0];
const player=w=>w.session.gw._debugBattle().sides[0].active[0];
const draws=w=>diag(w).state.random.draws;
const resources=w=>diag(w).state.resources;
const candidate=v=>v.snapshot.request.kind==='move'?v.snapshot.request.legalMoves[0].candidateId:v.snapshot.request.legalSwitches[0].candidateId;
function normalize(value){const x=clone(value);delete x.binding;return x;}
function state(p,{hp=100,maxhp=100,status='',confusion=0}={}){p.maxhp=maxhp;p.hp=hp;p.fainted=hp===0;p.status=status;p.statusState={id:status,target:p};if(confusion)p.volatiles.confusion={id:'confusion',target:p,time:confusion};else delete p.volatiles.confusion;}
const cases=[['C-FR01',{hp:50},100],['C-FR02',{status:'psn'},0],['C-FR03',{confusion:1},0],['C-FR04',{hp:50,status:'brn',confusion:3},100]];
for(const [id,input,hpRequest]of cases)test(id+' actual formal trainer FullRestore RpgAction, exact request and one consumption',async()=>{
 const w=await fixture({items:[{item:'fullrestore',count:2}]}),bag=clone(w.session.bag);state(active(w),input);
 const pre=inspect(w);assert.match(pre.plan.candidateId,/:i:/);assert.equal(pre.snapshot.request.legalItems[0].estimateHp,999);
 const result=await w.session.chooseMove(1);assert.equal(result.ok,true);
 const p=active(w);assert.equal(p.hp,100);assert.equal(p.status,'');assert.equal(!!p.volatiles.confusion,false);
 const event=result.messages.flatMap(m=>m.kind==='events'?m.events:[]).find(e=>e.type==='rpg'&&e.args[0]==='item'&&e.args[1]==='p2');
 assert.ok(event);assert.equal(event.args[4],'ok');assert.equal(Number(event.args[8]),hpRequest);
 assert.equal(resources(w)[0].count,1);assert.equal(diag(w).state.ledger.length,1);assert.equal(diag(w).state.ledger[0].state,'consumed');assert.deepEqual(w.session.bag,bag);
 w.session._onEvent(event);assert.equal(resources(w)[0].count,1,'duplicate callback is not another consumption/refund');
});
for(const [id,input]of [['C-FR05',{}],['C-FR06',{hp:0}]])test(id+' actual trainer eligibility refusal, no reservation or revival',async()=>{
 const w=await fixture({items:[{item:'fullrestore',count:1}]}),bag=clone(w.session.bag);state(active(w),input);
 assert.equal(E.rules.itemEligibility('fullrestore',w.gw.readState('p2')[0]).ok,false);
 if(input.hp===0)assert.throws(()=>capture(w),/invalid-move-request/);else assert.deepEqual(capture(w).snapshot.request.legalItems,[]);
 assert.equal(resources(w)[0].count,1);assert.equal(diag(w).state.ledger.length,0);assert.deepEqual(w.session.bag,bag);assert.equal(active(w).hp,input.hp??100);
});
async function visibility(mutator){const a=await fixture(),b=await fixture();await mutator(b);const x=inspect(a),y=inspect(b);assert.deepEqual(normalize(x.snapshot),normalize(y.snapshot));assert.deepEqual(x.plan,y.plan);assert.deepEqual(diag(a).state.random,diag(b).state.random);assert.notEqual(x.ticket,y.ticket);assert.throws(()=>D.validateTrainerAiTicket(a.session,b.gw,x.ticket,candidate(x)),/source-mismatch/);return {a,b,x,y};}
test('C-V01 real locked driver p1 current choice mutation is invisible, source binding separately refused',()=>visibility(w=>{const s=w.gw._debugBattle().sides[0];s.choice.actions=[{choice:'move',moveid:'protect',pokemon:s.active[0]}];}));
test('C-V02 real pending ball/medicine/reservation and player inventory do not affect observation or RNG',()=>visibility(w=>{const b=w.gw._debugBattle();b.rpg.pending['p1:0']={kind:'ball',ball:'masterball',target:'secret',count:777};w.session.bag.masterball=987;w.session.ledger.push({kind:'item',itemId:'potion',target:'P1',state:'reserved'});}));
test('C-V03 hidden opponent moves/PP/ability/item/IV/EV/stats never enter fresh public collection',()=>visibility(w=>{const p=player(w);p.moveSlots[0].pp=0;p.moveSlots[1].id='explosion';p.ability='wonderguard';p.item='choiceband';p.set.ivs.atk=31;p.set.evs.atk=252;p.storedStats.atk=999;}));
test('C-V04 public Illusion appearance/type/bar unchanged despite private true identity and types',()=>visibility(w=>{const p=player(w);p.illusion={fullname:p.fullname,species:p.species};p.species=w.gw._debugBattle().dex.species.get('Zoroark');p.types=['Dark'];p.storedStats.def=999;}));
test('C-V05 actual debug health is projected to integer54/100 before AI, 269/500 versus268/500',async()=>{
 const a=await fixture(),b=await fixture();for(const [w,hp]of [[a,269],[b,268]]){const p=player(w);p.maxhp=500;p.hp=hp;w.gw._debugBattle().add('-damage',p,p.getHealth);w.gw._pump();}
 const x=inspect(a),y=inspect(b);assert.deepEqual(normalize(x.snapshot),normalize(y.snapshot));assert.deepEqual(x.snapshot.opponent.active[0].hpBar,{parts:54,scale:100});assert.equal('hp' in x.snapshot.opponent.active[0],false);assert.equal('maxhp' in x.snapshot.opponent.active[0],false);
});
test('C-V06 adding an unrevealed actual opposing bench member is invisible',()=>visibility(w=>{const p=player(w);w.gw._debugBattle().sides[0].pokemon.push(p);}));
test('C-V07 real public item reveal changes observation and remains a positive control',async()=>{
 const w=await fixture(),x=capture(w);w.gw._debugBattle().add('-item',player(w),'Leftovers');w.gw._pump();const y=capture(w);assert.notDeepEqual(normalize(x.snapshot),normalize(y.snapshot));assert.equal(y.snapshot.opponent.active[0].revealedItem,'leftovers');assert.equal(x.snapshot.opponent.active[0].revealedItem,null);
});
test('C-V08 detached driver DTO and returned diagnostics; accessor/extra key reject with zero getter calls',async()=>{
 const w=await fixture(),x=capture(w),before=clone(x.snapshot);x.snapshot.own.party[0].hp=0;x.snapshot.opponent.active[0].shownTypes.push('Dark');assert.deepEqual(capture(w).snapshot,before);
 const d=diag(w);d.state.resources.push({resourceKey:'forged',itemId:'fullrestore',count:999});assert.equal(resources(w).length,0);
 let getters=0,calls=0;const policy=E.trainerAi.createTrainerAiPolicy({gen:8,moves:{tackle:{family:'basic-damage',moveType:'Normal',basePower:40,accuracy:{kind:'percent',value:100}}},types:{Normal:{Normal:{numerator:1,denominator:1}}},items:{}});
 // The production catalog is separately tested below; these rejected DTOs exercise its common descriptor boundary before metadata lookup.
 for(const mutate of [s=>Object.defineProperty(s,'schema',{enumerable:true,get(){getters++;throw Error('getter');}}),s=>s.extra='secret']){const s=clone(before);mutate(s);assert.equal(policy.decide(s,()=>{calls++;return 0;}).reason,'invalid-snapshot');}assert.equal(getters,0);assert.equal(calls,0);
});
test('C-L01 same actual request capture/refresh/decide repeats one entitlement; repeated submit refused',async()=>{
 const w=await fixture({moves:['tackle']});const x=capture(w);assert.equal(draws(w),0);w.gw.refreshRequests();const y=capture(w);assert.equal(y.ticket,x.ticket);const first=inspect(w),second=inspect(w);assert.deepEqual(first,second);assert.equal(draws(w),1);
 assert.equal(await D.runTrainerAi(w.session,w.gw),true);const after=draws(w);await assert.rejects(D.runTrainerAi(w.session,w.gw),/already-submitted/);assert.equal(draws(w),after);assert.equal(w.gw._debugBattle().sides[1].choice.actions.length,1);
});
test('C-L02 same-value cloned JSON ticket/binding have no source and zero draws/actions',async()=>{
 const w=await fixture(),x=capture(w);assert.throws(()=>D.validateTrainerAiTicket(w.session,w.gw,clone(x.ticket),candidate(x)),/unknown-source/);assert.throws(()=>D.validateTrainerAiTicket(w.session,w.gw,clone(x.snapshot.binding),candidate(x)),/unknown-source/);assert.equal(draws(w),0);assert.equal(w.gw._debugBattle().sides[1].choice.actions.length,0);
});
test('C-L03 application generation replacement refuses late ticket and preserves the successor operation',async()=>{
 const w=await fixture(),x=capture(w);w.app.stateReplacedByHost();assert.throws(()=>D.validateTrainerAiTicket(w.session,w.gw,x.ticket,candidate(x)),/stale-generation/);assert.equal(draws(w),0);
 const next=await w.app.startTrainerBattle({...w.request,battleId:'successor',seq:2});assert.ok(next);assert.throws(()=>inspect(w),/stale-generation/);assert.equal(w.app.healParty().reason,'battle-active');
});
test('C-L04 independent same-state real driver cannot borrow original ticket/decision',async()=>{const a=await fixture(),b=await fixture(),x=capture(a);assert.equal(a.gw.snapshot(),b.gw.snapshot());assert.throws(()=>D.validateTrainerAiTicket(a.session,b.gw,x.ticket,candidate(x)),/source-mismatch/);assert.throws(()=>D.validateTrainerAiTicket(b.session,b.gw,x.ticket,candidate(x)),/unknown-source/);assert.equal(draws(a)+draws(b),0);});
test('C-L05 one opaque engine checkpoint pairs AI cache/RNG/reveals/resources, repeated full session replay exact',async()=>{
 const w=await fixture({items:[{item:'fullrestore',count:2}]});state(active(w),{hp:20,status:'psn',confusion:2});capture(w);const cp=w.session._checkpoint(),before=diag(w);const first=await w.session.chooseMove(1);assert.equal(first.ok,true);const engine=w.session.gw.snapshot(),after=diag(w);
 for(let i=0;i<3;i++){await w.session._restoreCheckpoint(cp);assert.deepEqual(diag(w),before);assert.equal((await w.session.chooseMove(1)).ok,true);assert.equal(w.session.gw.snapshot(),engine);assert.deepEqual(diag(w),after);}assert.equal(resources(w)[0].count,1);
});
test('C-L06 caller restorer substitution and cross-source opaque checkpoint cannot authorize restore',async()=>{
 const a=await fixture(),b=await fixture(),cp=a.session._checkpoint(),other=b.session._checkpoint();let called=0;a.session._driver={...a.session._driver,fromCheckpoint:async()=>{called++;return b.gw;}};
 await assert.rejects(a.session._restoreCheckpoint({...cp,engine:other.engine}),/checkpoint-owner-mismatch/);await assert.rejects(a.session._restoreCheckpoint({...cp,engine:{}}),/checkpoint-owner-mismatch/);assert.equal(called,0);await a.session._restoreCheckpoint(cp);assert.equal(called,0);assert.equal((await a.session.chooseMove(1)).ok,true);
});
test('C-L07 trusted exact no-effect refusal tries each cached candidate once, no extra draw',async()=>{
 const proto=E.gateway.BattleGateway.prototype,original=proto.choose;let attempts=0;
 proto.choose=async function(side,choice){if(side==='p2'&&choice.startsWith('move')&&++attempts===1)return false;return original.call(this,side,choice);};let w;try{w=await fixture({skill:0});}finally{proto.choose=original;}
 inspect(w);const n=draws(w);assert.equal((await w.session.chooseMove(1)).ok,true);assert.equal(attempts,2);assert.equal(draws(w),n);assert.equal(diag(w).cache.attempted.length,2);
});
test('C-L08 partial/unknown execution plus rollback failure keeps broken barrier, no fallback success',async()=>{
 const proto=E.gateway.BattleGateway.prototype,original=proto.choose;let attempts=0;
 proto.choose=async function(side,choice){const ok=await original.call(this,side,choice);if(side==='p2'&&choice.startsWith('move')){attempts++;throw Error('unknown after real engine action');}return ok;};let w;try{w=await fixture();}finally{proto.choose=original;}
 w.session._restoreCheckpoint=async()=>{throw Error('injected actual rollback failure');};await assert.rejects(w.session.chooseMove(1),/unusable/);assert.ok(w.session.broken);await assert.rejects(w.session.chooseMove(1),/unusable/);assert.equal(attempts,1);assert.equal(w.app.finishBattle(w.session,w.request).commit,'none');assert.equal(w.state.replaced.length,0);
});
test('C-L09 prevalidation consumes zero; actual reserve/noeffect refunds exactly once, player bag unchanged',async()=>{
 const proto=E.gateway.BattleGateway.prototype,original=proto.act;let registrations=0,reservedCount;
 proto.act=async function(side,payload,...rest){if(side==='p2'&&payload.kind==='item'){registrations++;reservedCount=resources(w)[0].count;state(this._debugBattle().sides[1].active[0],{});}return original.call(this,side,payload,...rest);};let w;try{w=await fixture({items:[{item:'fullrestore',count:1}]});}finally{proto.act=original;}
 capture(w);assert.equal(resources(w)[0].count,1);state(active(w),{hp:20});const bag=clone(w.session.bag);const cp=w.session._checkpoint();assert.equal((await w.session.chooseMove(1)).ok,true);assert.equal(registrations,1);assert.equal(reservedCount,0);assert.equal(resources(w)[0].count,1);assert.equal(diag(w).state.ledger[0].state,'refunded');
 const event={type:'rpg',args:['item','p2','fullrestore',active(w).name,'noeffect'],raw:''};w.session._onEvent(event);w.session._onEvent(event);assert.equal(resources(w)[0].count,1);assert.deepEqual(w.session.bag,bag);await w.session._restoreCheckpoint(cp);assert.equal(resources(w)[0].count,1);
});
test('C-L10 real forceSwitch [true] is an active mask; only actual owner bench switch, zero move/struggle/draw',async()=>{
 const w=await fixture();active(w).hp=1;await w.gw.choose('p1','move 2');await w.gw.choose('p2','move 1');assert.deepEqual(w.gw.awaitingChoice('p2').forceSwitch,[true]);const x=inspect(w);assert.equal(x.snapshot.request.kind,'force-switch');assert.equal(x.snapshot.request.legalSwitches.length,1);const replacement=x.snapshot.request.legalSwitches[0].memberId;assert.equal(x.plan.candidateId,x.snapshot.request.legalSwitches[0].candidateId);assert.equal(draws(w),0);await D.runTrainerAi(w.session,w.gw);assert.equal(w.gw.activeId('p2'),replacement);
});
test('C-L11 trainer resource revision invalidates old actual item ticket without another consumption',async()=>{
 const w=await fixture({items:[{item:'fullrestore',count:2}]});state(active(w),{hp:20});const x=inspect(w);assert.equal((await w.session.chooseMove(1)).ok,true);const before=clone(diag(w).state);assert.equal(before.resourceRevision,1);assert.throws(()=>D.validateTrainerAiTicket(w.session,w.session.gw,x.ticket,x.plan.candidateId),/revision-changed|already-submitted/);assert.deepEqual(diag(w).state,before);
});
test('C-L12 original resolved seed domain stream is independent of current engine RNG/player choice/world',async()=>{
 const a=await fixture(),b=await fixture();for(let i=0;i<12;i++)b.gw._debugBattle().random(100);b.gw._debugBattle().sides[0].choice.actions=[{choice:'pass'}];const beforeA=a.gw.snapshot(),beforeB=b.gw.snapshot(),world=[a.worldDraws(),b.worldDraws()];const x=inspect(a),y=inspect(b);assert.deepEqual(x.plan,y.plan);assert.deepEqual(diag(a).state.random,diag(b).state.random);assert.equal(a.gw.snapshot(),beforeA);assert.equal(b.gw.snapshot(),beforeB);assert.deepEqual([a.worldDraws(),b.worldDraws()],world);
 const c=await fixture({unseeded:true});const resolved=c.gw.prngSeed(),before=c.gw.snapshot();inspect(c);assert.equal(c.gw.snapshot(),before);assert.ok(resolved);assert.match(diag(c).state.random.root,/^[a-f0-9]{64}$/);
});
test('C-L13 revision variant: same owner request gets at most one rebuild, a second change is a controlled error',async()=>{
 const w=await fixture({moves:['tackle','growl','splash'],skill:0});capture(w);let checks=0;w.setOnContent(()=>{checks++;if(checks===2||checks===3){const req=w.gw._debugBattle().sides[1].activeRequest;req.active[0].moves[checks-2].disabled=true;}});
 await assert.rejects(D.runTrainerAi(w.session,w.gw),/request-revision-changed/);assert.equal(w.gw._debugBattle().sides[1].choice.actions.length,0);assert.equal(draws(w),2);w.setOnContent(null);
});
test('C-L13 content ABA variant: observed changed content permanently retires original operation, zero draws',async()=>{
 const w=await fixture(),x=capture(w),original=w.content,changed=clone(original);changed.meta.contentIdentity='0'.repeat(64);w.setContent(changed);assert.throws(()=>inspect(w),/content-source-retired/);w.setContent(original);assert.throws(()=>D.validateTrainerAiTicket(w.session,w.gw,x.ticket,candidate(x)),/content-source-retired/);assert.throws(()=>inspect(w),/content-source-retired/);assert.equal(draws(w),0);
});
test('production catalog uses complete pinned Gen8 metadata, bound author items; no score seams in public SDK',async()=>{
 const w=await fixture({items:[{item:'fullrestore',count:1},{item:'ether',count:1}]});const d=diag(w);assert.ok(d.moveCount>800);assert.equal(d.typeCount,18);assert.match(d.catalogIdentity,/^[a-f0-9]{64}$/);assert.match(d.authorIdentity,/^[a-f0-9]{64}$/);assert.deepEqual(Object.keys(E.trainerAi),['createTrainerAiPolicy']);const x=inspect(w);assert.ok(x.plan.diagnostics.includes('unsupported-trainer-item-family'));
});
test('first reentrant callback cannot draw/submit another entitlement',async()=>{
 const w=await fixture();let attempts=0;w.setOnContent(()=>{attempts++;assert.throws(()=>inspect(w),/operation-in-progress/);});const x=inspect(w);assert.equal(x.plan.kind,'choose');assert.equal(attempts,1);assert.equal(draws(w),1);w.setOnContent(null);
});
