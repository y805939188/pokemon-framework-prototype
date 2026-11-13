'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {E,D,fixture,diag,clone}=require('./trainer-ai-integration/fixtures.cjs');
const parse=vm.runInNewContext('JSON.parse'),foreignPromise=vm.runInNewContext('(json)=>Promise.resolve(JSON.parse(json))');
const ref=parse('{"id":"realm-test","version":"1","parameters":{"slot":2}}');
function choose(s,slot=2){const c=s.request.legalMoves.find(x=>x.slot===slot);return {kind:'choose',binding:s.binding,candidateId:c.candidateId,retryOrder:[c.candidateId],diagnostics:[]};}
function registry(decide){const r=E.composition.createTrainerAiStrategyRegistry();r.register({id:'realm-test',version:'1',implementationIdentity:'test/realm/1',validateParameters(p){assert.deepEqual(p,{slot:2});},create(){return {decide};}});return r;}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('NW realm contract: foreign plain JSON reference is copied and validated, never a class allowance',()=>{
 const r=registry(s=>choose(s)),pin=r.resolve(ref);assert.deepEqual(pin.parameters,{slot:2});assert.notEqual(pin.parameters,ref.parameters);assert.equal(pin.binding.version,'1');
 for(const make of ['()=>new (class Object {constructor(){this.slot=2;}})()','()=>new (class Values extends Array {})(2)','()=>Object.create({slot:2})']){const p=vm.runInNewContext(make)();assert.throws(()=>r.resolve({id:'realm-test',parameters:p}),/invalid-data/);}
});
test('NW realm contract: foreign synchronous intent is normalized and submits preferred actual move',async()=>{
 const w=await fixture({registry:registry(s=>parse(JSON.stringify(choose(s)))),recordStrategy:ref});assert.equal(await D.runTrainerAi(w.session,w.gw),true);assert.equal(w.gw._debugBattle().sides[1].choice.actions[0].moveid,'growl');assert.equal(D.trainerAiJournal(w.session).entries[0].fallbackReason,null);
});
test('NW realm contract: foreign native Promise is awaited, normalized and publishes one local draw',async()=>{
 let calls=0;const w=await fixture({registry:registry((s,p,r)=>{calls++;r(19);return foreignPromise(JSON.stringify(choose(s)));}),recordStrategy:ref});assert.equal((await w.session.chooseMove(1)).ok,true);assert.equal(calls,1);assert.equal(diag(w).state.random.draws,1);assert.equal(D.trainerAiJournal(w.session).entries[0].fallbackReason,null);assert.match(D.trainerAiJournal(w.session).entries[0].plan.candidateId,/:m:1$/);
});
test('NW realm contract: foreign native Promise own then getter and foreign intent getter execute zero times',async()=>{
 let thenGets=0,intentGets=0;const good=await fixture({recordStrategy:ref,registry:registry(s=>{const p=foreignPromise(JSON.stringify(choose(s)));Object.defineProperty(p,'then',{get(){thenGets++;throw Error('then getter');}});return p;})});await D.runTrainerAi(good.session,good.gw);assert.equal(thenGets,0);assert.equal(good.gw._debugBattle().sides[1].choice.actions[0].moveid,'growl');
 const bad=await fixture({recordStrategy:ref,registry:registry(s=>{const intent=parse(JSON.stringify(choose(s)));Object.defineProperty(intent,'candidateId',{enumerable:true,get(){intentGets++;throw Error('intent getter');}});return intent;})});await D.runTrainerAi(bad.session,bad.gw);assert.equal(intentGets,0);assert.equal(bad.gw._debugBattle().sides[1].choice.actions[0].moveid,'tackle');assert.equal(diag(bad).state.random.draws,0);
});
test('NW realm contract: a foreign thenable getter is not a native Promise and is never assimilated',async()=>{
 let gets=0;const w=await fixture({recordStrategy:ref,registry:registry(()=>Object.defineProperty(parse('{}'),'then',{enumerable:true,get(){gets++;throw Error('thenable getter');}}))});await D.runTrainerAi(w.session,w.gw);assert.equal(gets,0);assert.equal(w.gw._debugBattle().sides[1].choice.actions[0].moveid,'tackle');assert.equal(diag(w).state.random.draws,0);
});
test('NW realm contract: a fulfilled foreign native Promise cannot assimilate a late intent then getter',async()=>{
 let gets=0;const w=await fixture({recordStrategy:ref,registry:registry(s=>{const value=parse(JSON.stringify(choose(s)));const resolveForeign=vm.runInNewContext('value=>Promise.resolve(value)');const p=resolveForeign(value);Object.defineProperty(value,'then',{enumerable:true,get(){gets++;throw Error('late intent then getter');}});return p;})});
 await D.runTrainerAi(w.session,w.gw);assert.equal(gets,0);assert.equal(w.gw._debugBattle().sides[1].choice.actions[0].moveid,'tackle');assert.equal(diag(w).state.random.draws,0);
});
test('NW realm contract: pending foreign inference cancels and its late result cannot publish or release a successor',async()=>{
 const pending=vm.runInNewContext('(()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};})()');let calls=0,input,random;const w=await fixture({recordStrategy:ref,registry:registry((s,p,r)=>{calls++;input=s;random=r;r(13);return calls===1?pending.promise:parse(JSON.stringify(choose(s,1)));})});const task=w.session.chooseMove(1).catch(error=>error);await flush();assert.equal(D.trainerAiJournal(w.session).pending,true);await w.session.cancel();assert.match((await task).message,/decision-cancelled/);assert.equal(D.trainerAiJournal(w.session).entries.length,0);assert.equal(diag(w).state.random.draws,0);assert.throws(()=>random(7),/random-closed/);pending.resolve(parse(JSON.stringify(choose(input))));await flush();assert.equal((await w.session.chooseMove(1)).ok,true);assert.equal(calls,2);assert.equal(diag(w).state.random.draws,1);assert.equal(D.trainerAiJournal(w.session).entries.length,1);
});
