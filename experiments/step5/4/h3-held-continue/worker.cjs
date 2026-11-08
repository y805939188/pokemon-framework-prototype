'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const runtime=process.env.H3_RUNTIME_ROOT,plan=require('./plan.json'),sha=v=>crypto.createHash('sha256').update(v).digest('hex');
assert(runtime,'explicit frozen product runtime required');
for(const [p,h]of Object.entries(plan.files))assert.equal(sha(fs.readFileSync(path.join(runtime,p))),h,p);
const {fixture,acquireReady,E,T,clone,capabilities}=require(path.join(runtime,'experiments/step5/4/h3-production-policy/support.cjs'));
const {createContinueHost}=require(path.join(runtime,'experiments/step5/4/continue-host.cjs'));
async function run(stage,folder){
 folder=fs.realpathSync(folder);assert(path.basename(folder).startsWith('pf-h3-held-continue-'));assert.equal(JSON.parse(fs.readFileSync(path.join(folder,'OWNED.json'))).scope,'held-continue');
 const seed=fixture('give');const host=createContinueHost(runtime,runtime,folder,seed.content,plan.files),g=host.context;let loaded=null,route=null;
 const slot=path.join(folder,'file1.rmmzsave');let slotBefore=null;
 if(stage==='producer'){
  await acquireReady(seed);assert.equal(seed.state.read().party[0].item,'lumberry');g.$gameSystem._psGame=clone(seed.state.read());
  // Host fields from a controlled test process are serialized but confer no future application capability.
  g.$gameSystem.developerCapabilities={...capabilities};g.$gameSystem._psDeveloperCapabilities={...capabilities};
 }else{
  slotBefore=sha(fs.readFileSync(slot));await host.readGlobal();route=await host.continueSlot(1);assert.equal(route.outcome,'success');assert.equal(g.PSFlow.replacements,1);assert.equal(host.io.length,0);assert.equal(sha(fs.readFileSync(slot)),slotBefore);
  loaded=clone(g.$gameSystem._psGame);assert.deepEqual(clone(g.$gameSystem.developerCapabilities),capabilities);
 }
 let writes=0,refusal=null,raw=null,afterTake=null;
 if(stage==='consumer'){
  assert.equal(loaded.party[0].item,'lumberry');assert.deepEqual(loaded.appliedBattles,{});
  const state={read:()=>g.$gameSystem._psGame,replace:next=>{writes++;g.$gameSystem._psGame=next;}};
  const app=new E.app.GameApplication({state,content:()=>({content:seed.content,dex:seed.dex}),sessions:E.composition.createBattleSessionFactory({content:()=>seed.content,seed:()=>[1,2,3,4]}),projection:T.fakes.createRecordingProjection(),random:()=>0,clock:()=>12345});
  assert.equal(app.heldItemSourcesEnabled(),false);
  const request={battleId:'H3-CONTINUE-DEFAULT',seq:1,trainer:{id:'h3-npc',version:1},canLose:true,expGain:false,moneyGain:false};
  await assert.rejects(()=>app.startTrainerBattle(request),error=>{refusal=error.message;return /held-item-battle-disabled/.test(error.message);});
  assert.equal(writes,0);assert.deepEqual(state.read(),loaded);assert.equal(app.saveBlocked,false);
  const token=app.beginManagement(),bagBefore=E.inventory.aggregateBag(loaded.inventory),take={kind:'take-item',source:{id:loaded.party[0].id,position:{kind:'party',index:0}}};
  try{
   assert.equal(app.manage(token,'H3-CONTINUE-TAKE',take).status,'applied');assert.equal(writes,1);afterTake=clone(state.read());
   const expected=clone(loaded);expected.party[0].item='';
   assert.deepEqual({...afterTake,inventory:loaded.inventory},expected,'only held slot and inventory change');
   assert.deepEqual(E.inventory.aggregateBag(afterTake.inventory),{...bagBefore,lumberry:(bagBefore.lumberry??0)+1});
   assert.equal(app.manage(token,'H3-CONTINUE-TAKE',take).status,'applied');assert.equal(writes,1);assert.deepEqual(state.read(),afterTake);
   assert.equal(app.manage(token,'H3-CONTINUE-TAKE-EMPTY',take).status,'unchanged');assert.equal(writes,1);
  }finally{app.endManagement(token);}
  const s=await app.startTrainerBattle(request);assert(s.party.every(m=>!m.item));assert(s.foeTeam.every(m=>!m.item));
  assert((await s.chooseMove(3)).ok);assert(s.finished);raw=clone(s.result());assert.deepEqual(state.read(),afterTake);assert.equal(writes,1);
  const out=app.finishBattle(s,request);assert.equal(out.commit,'applied');assert.equal(writes,2);assert.equal(app.saveBlocked,false);
  const final=clone(state.read());assert.match(final.appliedBattles[raw.battleId].settlement.pairHash,/^[a-f0-9]{64}$/);assert.equal(final.appliedBattles[raw.battleId].hash,E.state.resultHash(raw));
  assert.deepEqual(E.inventory.aggregateBag(final.inventory),E.inventory.aggregateBag(afterTake.inventory));assert.equal(final.party[0].item,'');
  assert.equal(app.finishBattle(s,request).commit,'already-applied');assert.equal(writes,2);assert.deepEqual(state.read(),final);
 }else if(stage==='verifier'){
  assert.equal(loaded.party[0].item,'');assert.deepEqual(Object.keys(loaded.appliedBattles),['H3-CONTINUE-DEFAULT']);
  assert.match(loaded.appliedBattles['H3-CONTINUE-DEFAULT'].settlement.pairHash,/^[a-f0-9]{64}$/);
 }else assert.equal(stage,'producer');
 const final=clone(g.$gameSystem._psGame);
 if(stage!=='verifier'){
  assert.equal(await g.DataManager.saveGame(1),0);await host.drain();const decoded=await g.StorageManager.loadObject('file1');assert.deepEqual(JSON.parse(decoded.system._psGame.data),final);
 }
 return {stage,pid:process.pid,loaded,final,afterTake,refusal,writes,route,slotBefore,slotAfter:sha(fs.readFileSync(slot)),raw,NW:0};
}
run(...process.argv.slice(2)).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e);process.exitCode=1;});
