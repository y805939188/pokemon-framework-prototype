'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {E,D,fixture,content,clone,diag}=require('./trainer-ai-integration/fixtures.cjs');
const reference={id:'async-test',version:'1',parameters:{}};
function registry(decide,available){const r=E.composition.createTrainerAiStrategyRegistry();r.register({id:'async-test',version:'1',implementationIdentity:'test-only/async/1',validateParameters:p=>assert.deepEqual(p,{}),create:()=>({decide,...(available?{isAvailable:available}:{})})});return r;}
function choose(s,slot=2){const candidates=s.request.kind==='move'?s.request.legalMoves:s.request.legalSwitches,c=candidates.find(x=>x.slot===slot)||candidates[0];return {kind:'choose',binding:s.binding,candidateId:c.candidateId,retryOrder:[c.candidateId],diagnostics:[]};}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const journal=w=>D.trainerAiJournal(w.session),actions=w=>w.session.gw._debugBattle().sides[1].choice.actions;
class Timing {time=0;timers=new Set();now(){return this.time;}after(ms,callback){const row={at:this.time+ms,callback};this.timers.add(row);return()=>this.timers.delete(row);}advance(ms){this.time+=ms;for(const row of [...this.timers])if(row.at<=this.time){this.timers.delete(row);row.callback();}}}
test.beforeEach(t=>t.mock.method(Date,'now',()=>1793350000000));

test('X2 real async Session uses only public frozen values and commits local RNG once',async()=>{
 const pending=deferred(),timing=new Timing();let input,random,calls=0;
 const w=await fixture({timing,recordStrategy:reference,registry:registry((s,p,r)=>{calls++;input=s;random=r;assert.ok(Object.isFrozen(s.own.party[0].moves));r(19);return pending.promise;})});
 const world=w.worldDraws(),task=w.session.chooseMove(1);await flush();assert.ok(input);assert.equal(diag(w).state.random.draws,0);assert.equal(journal(w).pending,true);assert.equal(journal(w).entries.length,0);
 pending.resolve(choose(input));assert.equal((await task).ok,true);assert.equal(calls,1);assert.equal(diag(w).state.random.draws,1);assert.equal(journal(w).entries.length,1);assert.equal(w.worldDraws(),world);assert.equal(timing.timers.size,0);assert.throws(()=>random(9),/random-closed/);
});
test('X3 timeout discards private draws, falls back once and ignores late resolve/reject/random',async()=>{
 const pending=deferred(),timing=new Timing();let input,random,calls=0;
 const w=await fixture({timing,recordStrategy:reference,registry:registry((s,p,r)=>{calls++;input=s;random=r;r(9);return pending.promise;})});
 const task=D.runTrainerAi(w.session,w.session.gw);await flush();assert.equal(diag(w).state.random.draws,0);timing.advance(1000);assert.equal(await task,true);assert.equal(actions(w)[0].moveid,'tackle');assert.equal(calls,1);assert.equal(diag(w).state.random.draws,0);assert.match(journal(w).entries[0].fallbackReason,/timeout/);const engine=w.session.gw.snapshot(),after=clone(diag(w));
 assert.throws(()=>random(3),/random-closed/);pending.resolve(choose(input));await flush();assert.equal(w.session.gw.snapshot(),engine);assert.deepEqual(diag(w),after);assert.equal(journal(w).entries.length,1);
});
for(const mode of ['throw','reject','invalid-output','thenable-getter'])test('X4 '+mode+' is one source-qualified zero-draw fallback, not a fabricated action',async()=>{
 let calls=0,getters=0,retained;const timing=new Timing();
 const w=await fixture({timing,recordStrategy:reference,registry:registry((s,p,r)=>{calls++;retained=r;r(11);if(mode==='throw')throw Error('trainer-ai-source-mismatch');if(mode==='reject')return Promise.reject(Error('test strategy rejection'));if(mode==='thenable-getter')return Object.defineProperty({},'then',{enumerable:true,get(){getters++;throw Error('then getter');}});return {...choose(s),candidateId:'forged'};})});
 assert.equal(await D.runTrainerAi(w.session,w.session.gw),true);assert.equal(actions(w)[0].moveid,'tackle');assert.equal(calls,1);assert.equal(getters,0);assert.equal(diag(w).state.random.draws,0);assert.equal(journal(w).entries.length,1);assert.throws(()=>retained(2),/random-closed/);
});
test('X4 invalid fulfilled intent getter executes zero times and yields one actual fallback',async()=>{
 let getters=0;const w=await fixture({timing:new Timing(),recordStrategy:reference,registry:registry(s=>Promise.resolve(Object.defineProperty(choose(s),'candidateId',{enumerable:true,get(){getters++;throw Error('getter');}}))) });
 await D.runTrainerAi(w.session,w.session.gw);assert.equal(getters,0);assert.equal(actions(w)[0].moveid,'tackle');assert.equal(diag(w).state.random.draws,0);
});
test('X4 malformed collector is a barrier before provider/random/fallback',async()=>{
 let calls=0;const w=await fixture({recordStrategy:reference,registry:registry(s=>{calls++;return choose(s);})});w.session.gw._debugBattle().sides[1].active[0].types=['invalid-type'];const before=w.session.gw.snapshot();
 await assert.rejects(D.runTrainerAi(w.session,w.session.gw),/invalid-public-snapshot/);assert.equal(calls,0);assert.equal(actions(w).length,0);assert.equal(diag(w).state.random.draws,0);assert.equal(journal(w).entries.length,0);assert.equal(w.session.gw.snapshot(),before);
});
test('X3 content replacement while awaiting rejects rather than fallback or publish RNG',async()=>{
 const pending=deferred();let input,random;const w=await fixture({timing:new Timing(),recordStrategy:reference,registry:registry((s,p,r)=>{input=s;random=r;r(13);return pending.promise;})});const task=D.runTrainerAi(w.session,w.session.gw);await flush();w.setContent(content({skill:0}));pending.resolve(choose(input));await assert.rejects(task,/content-source-retired/);assert.equal(actions(w).length,0);assert.equal(diag(w).state.random.draws,0);assert.equal(journal(w).entries.length,0);assert.throws(()=>random(3),/random-closed/);
});
for(const mode of ['generation','abort'])test('X3 App '+mode+' retires old work before a successor and late results cannot write',async()=>{
 const pending=deferred();let input,random;const w=await fixture({timing:new Timing(),recordStrategy:reference,registry:registry((s,p,r)=>{input=s;random=r;return pending.promise;})});const task=w.session.chooseMove(1).then(v=>({v}),error=>({error}));await flush();
 if(mode==='generation')w.app.stateReplacedByHost();else w.app.abortBattle(w.request,Error('controlled host abort'));
 const next=await w.app.startTrainerBattle({...w.request,battleId:'successor',seq:2});const completed=await task;assert.ok(completed.error);assert.throws(()=>random(3),/random-closed/);const before=next.gw.snapshot();pending.resolve(choose(input));await flush();assert.equal(next.gw.snapshot(),before);assert.equal(w.app.healParty().reason,'battle-active');assert.equal(diag(w).state.random.draws,0);assert.equal(journal(w).entries.length,0);assert.equal(w.state.replaced.length,0);
});
test('X3 Session cancel interrupts pending inference, rolls back before cancelling and permits a fresh operation',async()=>{
 const pending=deferred();let calls=0,input,random;const w=await fixture({timing:new Timing(),recordStrategy:reference,registry:registry((s,p,r)=>{calls++;if(calls>1)return choose(s);input=s;random=r;r(5);return pending.promise;})});
 const task=w.session.chooseMove(1).catch(error=>error);await flush();await w.session.cancel();assert.match((await task).message,/cancelled/);assert.equal(w.session.broken,null);assert.equal(w.session._operation,false);assert.equal(diag(w).state.random.draws,0);assert.equal(journal(w).entries.length,0);assert.throws(()=>random(3),/random-closed/);pending.resolve(choose(input));await flush();assert.equal((await w.session.chooseMove(1)).ok,true);assert.equal(calls,2);
});
test('N2 foreign checkpoint does not cancel legitimate pending inference or invoke the actual restorer',async t=>{
 const pending=deferred();let input,random;const w=await fixture({timing:new Timing(),recordStrategy:reference,registry:registry((s,p,r)=>{input=s;random=r;return pending.promise;})}),other=await fixture(),foreign=other.session._checkpoint();
 const sim=w.session.gw._env.sim,original=sim.Battle.fromJSON;let restores=0;t.mock.method(sim.Battle,'fromJSON',function(...args){restores++;return original.apply(this,args);});
 const task=w.session.chooseMove(1);await flush();const before=journal(w),engine=w.session.gw.snapshot();await assert.rejects(w.session._restoreCheckpoint(foreign),/checkpoint-owner-mismatch/);assert.equal(restores,0);assert.equal(w.session.gw.snapshot(),engine);assert.deepEqual(journal(w),before);random(3);pending.resolve(choose(input));assert.equal((await task).ok,true);assert.equal(diag(w).state.random.draws,1);
});
test('N2 own restore retires a pending epoch; late provider cannot release the successor operation',async()=>{
 const promises=[deferred(),deferred()],inputs=[],randoms=[];let calls=0;const w=await fixture({timing:new Timing(),recordStrategy:reference,registry:registry((s,p,r)=>{inputs.push(s);randoms.push(r);return promises[calls++].promise;})}),cp=w.session._checkpoint();
 const first=w.session.chooseMove(1).catch(error=>error);await flush();await w.session._restoreCheckpoint(cp);assert.ok(await first);assert.equal(w.session.broken,null);
 const second=w.session.chooseMove(1);await flush();assert.equal(calls,2);assert.equal(w.session._operation,true);promises[0].resolve(choose(inputs[0]));await flush();assert.equal(w.session._operation,true);assert.equal(journal(w).pending,true);assert.throws(()=>randoms[0](7),/random-closed/);promises[1].resolve(choose(inputs[1]));assert.equal((await second).ok,true);assert.equal(journal(w).entries.length,1);
});
test('X6 checkpoint before an alternating decision reuses its actual plan/RNG, not another inference',async()=>{
 let calls=0;const w=await fixture({recordStrategy:reference,registry:registry((s,p,r)=>{r(17);return choose(s,++calls%2?2:1);})}),cp=w.session._checkpoint();
 assert.equal((await w.session.chooseMove(1)).ok,true);const first=JSON.parse(w.session.gw.snapshot()),after=clone(diag(w).state);
 for(let i=0;i<3;i++){await w.session._restoreCheckpoint(cp);assert.equal(journal(w).entries.length,1);assert.equal((await w.session.chooseMove(1)).ok,true);assert.deepEqual(JSON.parse(w.session.gw.snapshot()),first);assert.deepEqual(diag(w).state,after);assert.equal(calls,1);}
 const exposed=journal(w);exposed.entries[0].plan.candidateId='forged';assert.notEqual(journal(w).entries[0].plan.candidateId,'forged');
});
test('N1 actual accepted driver action followed by error keeps inference through rollback and retry',async()=>{
 const proto=E.gateway.BattleGateway.prototype,original=proto.choose;let calls=0,fail=true;proto.choose=async function(side,choice){const accepted=await original.call(this,side,choice);if(side==='p2'&&choice==='move 2'&&fail){fail=false;throw Error('controlled after accepted');}return accepted;};let w;
 try{w=await fixture({recordStrategy:reference,registry:registry((s,p,r)=>{r(7);return choose(s,++calls%2?2:1);})});}finally{proto.choose=original;}
 await assert.rejects(w.session.chooseMove(1),/controlled after accepted/);assert.equal(w.session.broken,null);assert.equal(diag(w).state.random.draws,0);assert.equal(journal(w).entries.length,1);assert.equal((await w.session.chooseMove(1)).ok,true);assert.equal(calls,1);assert.equal(diag(w).state.random.draws,1);
});
test('X6 missing replay record rejects preflight with zero actual restore and no state/RNG write',async t=>{
 const w=await fixture(),beforeDecision=w.session._checkpoint();D.inspectTrainerAiRequest(w.session,w.session.gw);D.faultTrainerAiJournalForTest(w.session,'missing-record');let restores=0;const sim=w.session.gw._env.sim,old=sim.Battle.fromJSON;t.mock.method(sim.Battle,'fromJSON',function(...args){restores++;return old.apply(this,args);});const before=clone(diag(w)),engine=w.session.gw.snapshot();await assert.rejects(w.session._restoreCheckpoint(beforeDecision),/replay-record-missing/);assert.equal(restores,0);assert.equal(w.session.gw.snapshot(),engine);assert.deepEqual(diag(w),before);
});
test('X6 full journal refuses a new genuine request before another provider or draw',async()=>{
 let calls=0;const w=await fixture({recordStrategy:reference,registry:registry(s=>{calls++;return choose(s);})});D.inspectTrainerAiRequest(w.session,w.session.gw);D.faultTrainerAiJournalForTest(w.session,'full');w.session.gw._debugBattle().sides[1].active[0].hp--;w.session.gw.refreshRequests();const engine=w.session.gw.snapshot();await assert.rejects(D.runTrainerAi(w.session,w.session.gw),/journal-full/);assert.equal(calls,1);assert.equal(w.session.gw.snapshot(),engine);assert.equal(actions(w).length,0);
});
test('X7 unavailable pinned implementation rejects restore before any engine write and preserves checkpoint',async t=>{
 let available=true;const w=await fixture({recordStrategy:reference,registry:registry(s=>choose(s),()=>available)}),cp=w.session._checkpoint();const sim=w.session.gw._env.sim,old=sim.Battle.fromJSON;let restores=0;t.mock.method(sim.Battle,'fromJSON',function(...args){restores++;return old.apply(this,args);});const before=clone(diag(w)),engine=w.session.gw.snapshot();available=false;await assert.rejects(w.session._restoreCheckpoint(cp),/strategy-unavailable/);assert.equal(restores,0);assert.equal(w.session.gw.snapshot(),engine);assert.deepEqual(diag(w),before);available=true;await w.session._restoreCheckpoint(cp);assert.equal(restores,1);assert.equal(w.session.broken,null);
});
test('X8 asynchronous FullRestore journal replays with owned stock/ledger and no player bag consumption',async()=>{
 let calls=0;const w=await fixture({timing:new Timing(),items:[{item:'fullrestore',count:1}],recordStrategy:reference,registry:registry(async(s,p,r)=>{calls++;r(5);const item=s.request.legalItems[0];return {kind:'choose',binding:s.binding,candidateId:item.candidateId,retryOrder:[item.candidateId],diagnostics:[]};})});const actor=w.session.gw._debugBattle().sides[1].active[0];actor.hp=20;w.session.gw.refreshRequests();const cp=w.session._checkpoint(),bag=clone(w.session.bag);
 for(let i=0;i<2;i++){if(i)await w.session._restoreCheckpoint(cp);assert.equal((await w.session.chooseMove(1)).ok,true);assert.equal(calls,1);assert.equal(diag(w).state.resources[0].count,0);assert.equal(diag(w).state.ledger[0].state,'consumed');assert.equal(diag(w).state.random.draws,1);assert.deepEqual(w.session.bag,bag);assert.equal(w.session.gw._debugBattle().sides[1].active[0].hp,w.session.gw._debugBattle().sides[1].active[0].maxhp);}
});

test('N2 pending inference forbids a checkpoint before any engine checkpoint callback',async t=>{
 const p=deferred();let input;const w=await fixture({timing:new Timing(),recordStrategy:reference,registry:registry(s=>{input=s;return p.promise;})});let captures=0;const old=w.session.gw.checkpoint;t.mock.method(w.session.gw,'checkpoint',function(...a){captures++;return old.apply(this,a);});const task=D.runTrainerAi(w.session,w.gw);await flush();assert.throws(()=>w.session._checkpoint(),/checkpoint-pending/);assert.equal(captures,0);await assert.rejects(w.session.chooseMove(1),/checkpoint-pending/);p.resolve(choose(input));await task;
});
test('N2 driver submission window forbids checkpoint even after the immutable decision exists',async()=>{
 const p=deferred(),proto=E.gateway.BattleGateway.prototype,old=proto.choose;let entered=0;
 proto.choose=async function(side,choice){if(side==='p2'&&choice==='move 2'){entered++;await p.promise;}return old.call(this,side,choice);};let w;try{w=await fixture({recordStrategy:reference,registry:registry(s=>choose(s))});}finally{proto.choose=old;}
 const task=w.session.chooseMove(1);await flush();assert.equal(entered,1);assert.equal(journal(w).entries.length,1);assert.equal(journal(w).pending,false);assert.throws(()=>w.session._checkpoint(),/checkpoint-pending/);assert.equal((await w.session.chooseMove(1)).reason,'choice-rejected');p.resolve();assert.equal((await task).ok,true);
});
test('X3 expired resolution still times out when the timer callback has not run',async()=>{
 const p=deferred(),timing=new Timing();let input,random;const w=await fixture({timing,recordStrategy:reference,registry:registry((s,_p,r)=>{input=s;random=r;r(7);return p.promise;})});const task=D.runTrainerAi(w.session,w.gw);await flush();timing.time=1001;assert.throws(()=>random(7),/timeout/);p.resolve(choose(input));await task;assert.equal(actions(w)[0].moveid,'tackle');assert.match(journal(w).entries[0].fallbackReason,/timeout/);assert.equal(diag(w).state.random.draws,0);
});
test('X3 late rejection after timeout is observed once without a second fallback or write',async()=>{
 const p=deferred(),timing=new Timing();const w=await fixture({timing,recordStrategy:reference,registry:registry(()=>p.promise)});const task=D.runTrainerAi(w.session,w.gw);await flush();timing.advance(1000);await task;const before=clone(diag(w)),engine=w.gw.snapshot();p.reject(Error('controlled late reject'));await flush();assert.deepEqual(diag(w),before);assert.equal(w.gw.snapshot(),engine);assert.equal(journal(w).entries.length,1);
});
test('X3 genuine revision discards stale inference and permits only one fresh revision',async()=>{
 const p=deferred();let calls=0,input;const w=await fixture({timing:new Timing(),recordStrategy:reference,registry:registry((s,_p,r)=>{calls++;r(17);if(calls===1){input=s;return p.promise;}return choose(s,1);})});const task=D.runTrainerAi(w.session,w.gw);await flush();w.gw._debugBattle().sides[1].activeRequest.active[0].moves[0].disabled=true;p.resolve(choose(input));await task;assert.equal(calls,2);assert.equal(actions(w)[0].moveid,'growl');assert.equal(diag(w).state.random.draws,1);assert.equal(journal(w).entries.length,1);assert.equal(journal(w).entries[0].before.draws,0);
});
test('X3 terminal engine request rejects a late strategy without creating an action or journal',async()=>{
 const p=deferred();let input,random;const w=await fixture({timing:new Timing(),recordStrategy:reference,registry:registry((s,_p,r)=>{input=s;random=r;r(9);return p.promise;})});const task=D.runTrainerAi(w.session,w.gw);await flush();w.gw._debugBattle().win('p1');const end=w.gw.snapshot();p.resolve(choose(input));await assert.rejects(task,/original-request-mismatch/);assert.equal(w.gw.snapshot(),end);assert.equal(diag(w).state.random.draws,0);assert.equal(journal(w).entries.length,0);assert.throws(()=>random(2),/random-closed/);
});
test('X4 strategy fault on a real forced switch uses the actual legal bench and zero random',async()=>{
 let calls=0;const w=await fixture({recordStrategy:reference,registry:registry(()=>{calls++;throw Error('controlled force fault');})});w.gw._debugBattle().sides[1].active[0].hp=1;await w.gw.choose('p1','move 2');await w.gw.choose('p2','move 1');assert.deepEqual(w.gw.awaitingChoice('p2').forceSwitch,[true]);await D.runTrainerAi(w.session,w.gw);assert.equal(w.gw.activeId('p2'),'M3');assert.equal(calls,1);assert.equal(diag(w).state.random.draws,0);assert.equal(journal(w).entries[0].plan.kind,'fallback');
});
test('X4 Struggle fallback is exclusively the engine supplied candidate, never a healing item',async()=>{
 let calls=0;const w=await fixture({items:[{item:'fullrestore',count:1}],recordStrategy:reference,registry:registry(()=>{calls++;throw Error('controlled auto fault');})});const actor=w.gw._debugBattle().sides[1].active[0];for(const m of actor.moveSlots)m.pp=0;actor.hp=20;w.gw.refreshRequests();const snapshot=D.captureTrainerAiRequest(w.session,w.gw).snapshot;assert.equal(snapshot.request.legalMoves[0].moveId,'struggle');await D.runTrainerAi(w.session,w.gw);assert.equal(calls,1);assert.equal(actions(w)[0].moveid,'struggle');assert.equal(diag(w).state.resources[0].count,1);assert.equal(diag(w).state.random.draws,0);
});
test('X5 finite callback budget and synchronous deadline discard all attempt draws',async()=>{
 for(const mode of ['budget','deadline']){const timing=new Timing();let calls=0;const w=await fixture({timing,recordStrategy:reference,registry:registry((s,_p,r)=>{calls++;if(mode==='budget')for(let i=0;i<257;i++)r(11);else {r(11);timing.time=1000;}return choose(s);})});await D.runTrainerAi(w.session,w.gw);assert.equal(calls,1);assert.equal(actions(w)[0].moveid,'tackle');assert.equal(diag(w).state.random.draws,0);assert.match(journal(w).entries[0].fallbackReason,mode==='budget'?/random-budget/:/timeout/);}
});
test('X6 safe no-effect refusal records actual decision once, replays retries without reinference',async t=>{
 const proto=E.gateway.BattleGateway.prototype,old=proto.choose;let attempts=[],calls=0;
 proto.choose=async function(side,choice){if(side==='p2'&&choice.startsWith('move')){attempts.push(choice);if(choice==='move 2')return false;}return old.call(this,side,choice);};t.after(()=>{proto.choose=old;});const w=await fixture({recordStrategy:reference,registry:registry((s,_p,r)=>{calls++;r(3);return choose(s);})});
 const cp=w.session._checkpoint();for(let i=0;i<2;i++){if(i)await w.session._restoreCheckpoint(cp);assert.equal((await w.session.chooseMove(1)).ok,true);assert.equal(calls,1);assert.equal(diag(w).state.random.draws,1);assert.equal(diag(w).cache.submitted,true);}assert.deepEqual(attempts,['move 2','move 1','move 2','move 1']);assert.match(journal(w).entries[0].lastAcceptedCandidate,/:m:0$/);
});
test('X7 active registration change during pending inference cannot replace the held implementation',async()=>{
 const p=deferred(),r=registry(s=>{input=s;return p.promise;});let input,newCalls=0;const w=await fixture({timing:new Timing(),registry:r,recordStrategy:{id:'async-test',parameters:{}}}),cp=w.session._checkpoint();const task=w.session.chooseMove(1);await flush();r.register({id:'async-test',version:'2',implementationIdentity:'test-only/async/2',validateParameters(){},create(){return {decide(s){newCalls++;return choose(s,1);}};}});const next=await fixture({registry:r,recordStrategy:{id:'async-test',parameters:{}}});p.resolve(choose(input));await task;assert.equal(diag(w).strategyBinding.version,'1');assert.equal(newCalls,0);await w.session._restoreCheckpoint(cp);await w.session.chooseMove(1);assert.equal(newCalls,0);await D.runTrainerAi(next.session,next.gw);assert.equal(newCalls,1);assert.equal(diag(next).strategyBinding.version,'2');assert.equal(actions(next)[0].moveid,'tackle');
});
test('X8 native Promise own then getter is never read and normalized output has no retained alias',async()=>{
 let getters=0,out;const p=deferred();Object.defineProperty(p.promise,'then',{get(){getters++;throw Error('then accessor');}});const w=await fixture({timing:new Timing(),registry:registry(s=>{out=choose(s);return p.promise;}),recordStrategy:reference});const task=D.runTrainerAi(w.session,w.gw);await flush();p.resolve(out);await task;out.retryOrder.length=0;out.binding={...out.binding,generation:999};assert.equal(getters,0);assert.equal(actions(w)[0].moveid,'growl');assert.equal(journal(w).entries[0].plan.retryOrder.length,1);assert.equal(journal(w).entries[0].plan.binding.generation,0);
});
test('X6 conflicting record rejects genuine pre-decision checkpoint before the actual restorer',async t=>{
 const w=await fixture(),cp=w.session._checkpoint();D.inspectTrainerAiRequest(w.session,w.gw);D.faultTrainerAiJournalForTest(w.session,'conflict-record');let restores=0;const sim=w.gw._env.sim,old=sim.Battle.fromJSON;t.mock.method(sim.Battle,'fromJSON',function(...args){restores++;return old.apply(this,args);});const before=clone(diag(w)),engine=w.gw.snapshot();await assert.rejects(w.session._restoreCheckpoint(cp),/replay-conflict/);assert.equal(restores,0);assert.equal(w.gw.snapshot(),engine);assert.deepEqual(diag(w),before);
});
test('X7 backend retirement while pending is a source barrier, never fallback or RNG publication',async()=>{
 let available=true,input,random;const p=deferred(),w=await fixture({timing:new Timing(),recordStrategy:reference,registry:registry((s,_p,r)=>{input=s;random=r;r(7);return p.promise;},()=>available)}),cp=w.session._checkpoint();const task=D.runTrainerAi(w.session,w.gw);await flush();available=false;p.resolve(choose(input));await assert.rejects(task,/strategy-unavailable/);assert.equal(actions(w).length,0);assert.equal(diag(w).state.random.draws,0);assert.equal(journal(w).entries.length,0);assert.throws(()=>random(9),/random-closed/);available=true;await w.session._restoreCheckpoint(cp);assert.equal(w.session.broken,null);
});

test('N2 late accepted driver cannot append execution metadata after a valid restore',async()=>{
 let release,entered=0;const pending=new Promise(resolve=>{release=resolve;}),proto=E.gateway.BattleGateway.prototype,old=proto.choose;
 proto.choose=async function(side,choice){if(side==='p2'&&choice==='move 2'){entered++;await pending;}return old.call(this,side,choice);};
 const registry=E.composition.createTrainerAiStrategyRegistry();registry.register({id:'late',version:'1',implementationIdentity:'control/late/1',validateParameters(){},create(){return {decide(s){const c=s.request.legalMoves[1];return {kind:'choose',binding:s.binding,candidateId:c.candidateId,retryOrder:[c.candidateId],diagnostics:[]};}};}});let w;try{w=await fixture({registry,recordStrategy:{id:'late',version:'1',parameters:{}}});}finally{proto.choose=old;}
 const cp=w.session._checkpoint(),task=D.runTrainerAi(w.session,w.gw).catch(error=>error);await new Promise(resolve=>setImmediate(resolve));assert.equal(entered,1);await w.session._restoreCheckpoint(cp);const before=clone(D.trainerAiJournal(w.session)),engine=w.session.gw.snapshot(),state=clone(diag(w));release();assert.match((await task).message,/restore-retired-attempt/);assert.equal(w.session.gw.snapshot(),engine);assert.deepEqual(diag(w),state);assert.deepEqual(D.trainerAiJournal(w.session),before);
});
