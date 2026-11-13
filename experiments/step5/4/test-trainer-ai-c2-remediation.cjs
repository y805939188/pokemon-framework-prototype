'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {E,D,fixture,diag,clone}=require('./trainer-ai-integration/fixtures.cjs');
const ref={id:'callback-test',version:'1',parameters:{}};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function choose(s,slot=2){const c=s.request.legalMoves.find(x=>x.slot===slot);return {kind:'choose',binding:s.binding,candidateId:c.candidateId,retryOrder:[c.candidateId],diagnostics:[]};}
function registry(decide,isAvailable=()=>true){const r=E.composition.createTrainerAiStrategyRegistry();r.register({id:'callback-test',version:'1',implementationIdentity:'test/callback-ownership/1',validateParameters(){},create(){return {decide,isAvailable};}});return r;}
test.beforeEach(t=>t.mock.method(Date,'now',()=>1793350000000));

for(const mode of ['async-content','async-content-fallback','async-availability','sync-content','async-timing','async-timer-cleanup'])test('C2-01 '+mode+' cancellation before publication discards inference and retry calls provider anew',async t=>{
 const pending=deferred();let w,input,random,calls=0,armed=false,contentReads=0,cancelTask=null;
 const cancel=()=>{if(!armed)return;armed=false;w.setOnContent(null);cancelTask=w.session.cancel().then(()=>({ok:true}),error=>({error:error.message}));};
 const timing={now(){if(mode==='async-timing')cancel();return 0;},after(){return()=>{if(mode==='async-timer-cleanup')cancel();};}};
 const r=registry((s,_p,rng)=>{calls++;input=s;random=rng;rng(11);if(calls>1)return choose(s,1);if(mode==='sync-content'){armed=true;return choose(s);}return pending.promise;},()=>{if(mode==='async-availability')cancel();return true;});
 w=await fixture({timing,registry:r,recordStrategy:ref});const engineBefore=JSON.parse(w.gw.snapshot());
 w.setOnContent(()=>{if(!armed||!mode.includes('content'))return;if(++contentReads===(mode==='async-content-fallback'?2:1))cancel();});
 const task=w.session.chooseMove(1).then(value=>({value}),error=>({error:error.message}));
 if(mode!=='sync-content'){await flush();assert.equal(D.trainerAiJournal(w.session).pending,true);armed=true;const plan=choose(input);pending.resolve(mode==='async-content-fallback'?{...plan,candidateId:'forged'}:plan);}
 const completed=await task;assert.ok(cancelTask,'the actual port must reenter Session.cancel');assert.deepEqual(await cancelTask,{ok:true});
 const afterCancel={journal:D.trainerAiJournal(w.session),ai:diag(w),engine:JSON.parse(w.session.gw.snapshot()),calls,broken:w.session.broken,operation:w.session._operation,storeWrites:w.state.replaced.length};
 assert.throws(()=>random(3),/random-closed/);const retry=await w.session.chooseMove(1);
 t.diagnostic(JSON.stringify({mode,completed,journalAfterCancel:afterCancel.journal.entries.length,callsAfterCancel:afterCancel.calls,callsAfterRetry:calls,drawsAfterCancel:afterCancel.ai.state.random.draws,drawsAfterRetry:diag(w).state.random.draws}));
 assert.match(completed.error,/decision-cancelled/);assert.equal(afterCancel.journal.entries.length,0);assert.equal(afterCancel.ai.state.random.draws,0);assert.deepEqual(afterCancel.engine,engineBefore);assert.equal(afterCancel.broken,null);assert.equal(afterCancel.operation,false);assert.equal(afterCancel.storeWrites,0);assert.equal(retry.ok,true);assert.equal(calls,2);assert.equal(D.trainerAiJournal(w.session).entries.length,1);assert.equal(diag(w).state.random.draws,1);
});

for(const port of ['content','availability'])test('C2-02 '+port+' preflight reentry admits only the newer restore and preserves its entire state',async t=>{
 let callback=null;const w=await fixture({registry:registry(s=>choose(s),()=>{callback?.();return true;}),recordStrategy:ref}),oldCheckpoint=w.session._checkpoint();await w.session.chooseMove(1);const newer=w.session._checkpoint(),expected=JSON.parse(w.session.gw.snapshot()),ai=clone(diag(w));
 const sim=w.session.gw._env.sim,fromJSON=sim.Battle.fromJSON;let restores=0;t.mock.method(sim.Battle,'fromJSON',function(...args){restores++;return fromJSON.apply(this,args);});
 let inner=null,innerResult=null,atInnerCompletion=null;const reenter=()=>{callback=null;w.setOnContent(null);inner=w.session._restoreCheckpoint(newer).then(()=>{innerResult={ok:true};atInnerCompletion=JSON.parse(w.session.gw.snapshot());},error=>{innerResult={error:error.message};});};
 if(port==='content')w.setOnContent(reenter);else callback=reenter;
 const outer=await w.session._restoreCheckpoint(oldCheckpoint).then(()=>({ok:true}),error=>({error:error.message}));assert.ok(inner);await inner;
 t.diagnostic(JSON.stringify({port,outer,inner:innerResult,restores,turn:w.session.gw._debugBattle().turn}));
 assert.match(outer.error,/restore.*progress|operation.*retired/);assert.deepEqual(innerResult,{ok:true});assert.equal(restores,1);assert.deepEqual(atInnerCompletion,expected);assert.deepEqual(JSON.parse(w.session.gw.snapshot()),expected);assert.deepEqual(diag(w),ai);assert.equal(w.session._restoring,false);assert.equal(w.session._operation,false);assert.equal(w.session.broken,null);
});

test('C2-02 ordinary restore still uses one actual B/Showdown restorer and releases its flags',async t=>{
 const w=await fixture(),cp=w.session._checkpoint(),expected=JSON.parse(w.gw.snapshot());await w.session.chooseMove(1);const sim=w.session.gw._env.sim,old=sim.Battle.fromJSON;let restores=0;t.mock.method(sim.Battle,'fromJSON',function(...args){restores++;return old.apply(this,args);});await w.session._restoreCheckpoint(cp);assert.equal(restores,1);assert.deepEqual(JSON.parse(w.session.gw.snapshot()),expected);assert.equal(w.session._restoring,false);assert.equal(w.session._operation,false);
});
test('C2-02 rejected nested foreign preflight does not steal a valid outer restore',async t=>{
 const w=await fixture(),other=await fixture(),cp=w.session._checkpoint(),foreign=other.session._checkpoint(),expected=JSON.parse(w.gw.snapshot());await w.session.chooseMove(1);let nested=null;w.setOnContent(()=>{w.setOnContent(null);nested=w.session._restoreCheckpoint(foreign).catch(error=>error);});const sim=w.session.gw._env.sim,old=sim.Battle.fromJSON;let restores=0;t.mock.method(sim.Battle,'fromJSON',function(...args){restores++;return old.apply(this,args);});await w.session._restoreCheckpoint(cp);assert.match((await nested).message,/checkpoint-owner-mismatch/);assert.equal(restores,1);assert.deepEqual(JSON.parse(w.session.gw.snapshot()),expected);assert.equal(w.session.broken,null);
});
test('C2-02 an operation started during preflight retires the outer restore without any engine restoration',async t=>{
 const w=await fixture(),cp=w.session._checkpoint();await w.session.chooseMove(1);let nested=null;w.setOnContent(()=>{w.setOnContent(null);nested=w.session.chooseMove(1);});const sim=w.session.gw._env.sim,old=sim.Battle.fromJSON;let restores=0;t.mock.method(sim.Battle,'fromJSON',function(...args){restores++;return old.apply(this,args);});const outer=await w.session._restoreCheckpoint(cp).then(()=>({ok:true}),error=>({error:error.message}));const operation=await nested.then(value=>({value}),error=>({error:error.message}));assert.match(outer.error,/operation.*retired/);assert.equal(operation.value.ok,true);assert.equal(restores,0);assert.equal(w.session.gw._debugBattle().turn,3);assert.equal(w.session._operation,false);assert.equal(w.session._restoring,false);assert.equal(w.session.broken,null);
});
test('C2-02 a preflight port exception leaves legitimate pending inference and operation owner unchanged',async t=>{
 const pending=deferred();let input;const w=await fixture({timing:{now:()=>0,after:()=>()=>{}},registry:registry(s=>{input=s;return pending.promise;}),recordStrategy:ref}),cp=w.session._checkpoint();const task=w.session.chooseMove(1);await flush();const before={epoch:w.session._operationEpoch,done:w.session._operationDone,engine:w.session.gw.snapshot(),ai:clone(diag(w)),journal:D.trainerAiJournal(w.session)};
 let restores=0;const sim=w.session.gw._env.sim,old=sim.Battle.fromJSON;t.mock.method(sim.Battle,'fromJSON',function(...args){restores++;return old.apply(this,args);});w.setOnContent(()=>{throw Error('controlled preflight port exception');});await assert.rejects(w.session._restoreCheckpoint(cp),/controlled preflight port exception/);w.setOnContent(null);assert.equal(restores,0);assert.equal(w.session._operationEpoch,before.epoch);assert.equal(w.session._operationDone,before.done);assert.equal(w.session.gw.snapshot(),before.engine);assert.deepEqual(diag(w),before.ai);assert.deepEqual(D.trainerAiJournal(w.session),before.journal);assert.equal(w.session._restoring,false);pending.resolve(choose(input));assert.equal((await task).ok,true);assert.equal(w.session.broken,null);
});
