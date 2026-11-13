'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.env.H3_RUNTIME_ROOT;assert(root,'explicit frozen runtime required');
const current=require('../capture-run-current-headless-runtime.json');assert.match(current.helperFiles['experiments/step5/4/h3-production-policy/support.cjs'],/^[a-f0-9]{64}$/);
for(const [p,h]of Object.entries({...require('./plan.json'),...current.helperFiles}))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex'),h,p);
const {fixture,acquireReady,E,T,clone,capabilities}=require(path.join(root,'experiments/step5/4/h3-production-policy/support.cjs'));
for(const mode of ['complete-then-throw','party-only-then-throw'])test('H3 consumed Lum required settlement handles '+mode,async()=>{
 const seed=fixture('give');await acquireReady(seed);let current=clone(seed.state.read()),writes=0,candidate;
 const before=clone(current);assert.equal(before.party[0].item,'lumberry');
 const state={read:()=>current,replace:next=>{writes++;candidate=clone(next);current=mode==='complete-then-throw'?clone(next):{...clone(current),party:clone(next.party)};throw Error('controlled '+mode);}};
 const app=new E.app.GameApplication({state,content:()=>({content:seed.content,dex:seed.dex}),sessions:E.composition.createBattleSessionFactory({content:()=>seed.content,seed:()=>[1,2,3,4]}),projection:T.fakes.createRecordingProjection(),random:()=>0,clock:()=>12345});
 const request={battleId:'H3-INSTALL-'+mode,seq:1,trainer:{id:'h3-npc',version:1},canLose:true,expGain:false,moneyGain:true};
 const s=await app.startTrainerBattle(request);assert((await s.chooseMove(1)).ok);const rest=await s.chooseMove(2);assert(rest.ok);
 assert.equal(rest.messages.flatMap(m=>m.kind==='events'?m.events:[]).filter(e=>e.type==='-enditem'&&e.args[1]==='Lum Berry').length,1);
 assert((await s.chooseMove(3)).ok);assert(s.finished);const raw=clone(s.result());assert.deepEqual(current,before);assert.equal(writes,0);
 const out=app.finishBattle(s,request);assert.equal(writes,1);assert.equal(candidate.party[0].item,'');assert(candidate.money>before.money);
 assert.equal(candidate.appliedBattles[raw.battleId].hash,E.state.resultHash(raw));assert.match(candidate.appliedBattles[raw.battleId].settlement.pairHash,/^[a-f0-9]{64}$/);
 if(mode==='complete-then-throw'){
  assert.equal(out.commit,'applied');assert(out.diagnostics.some(x=>x.includes('状态已完整安装')));assert.equal(app.saveBlocked,false);assert.deepEqual(current,candidate);
  assert.equal(app.finishBattle(s,request).commit,'already-applied');assert.equal(app.commitResult(raw),'already-applied');assert.equal(writes,1);assert.deepEqual(current,candidate);
 }else{
  assert.equal(out.commit,'none');assert.equal(out.pending,true);assert.equal(app.saveBlocked,true);assert.equal(current.party[0].item,'');assert.equal(current.money,before.money);assert.deepEqual(current.appliedBattles,before.appliedBattles);
  const partial=clone(current);assert.equal(app.resolveReceiving(out.receivingToken).commit,'none');assert.equal(writes,1);assert.deepEqual(current,partial);
  assert.equal(app.terminateBattleCommit(out.receivingToken).status,'reload-required');assert.equal(app.saveBlocked,true);
  app.abortBattle(request,Error('technical end cannot release partial install'));assert.equal(app.saveBlocked,true);assert.equal(writes,1);assert.deepEqual(current,partial);
  await assert.rejects(()=>app.startTrainerBattle({...request,battleId:'H3-BLOCKED-NEXT'}));assert.equal(writes,1);assert.deepEqual(current,partial);
 }
 console.log('H3_INSTALL_OUTCOME '+JSON.stringify({mode,before,raw,candidate,current,out,writes,saveBlocked:app.saveBlocked,NW:0}));
});
