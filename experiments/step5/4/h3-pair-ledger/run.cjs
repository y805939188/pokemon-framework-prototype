"use strict";
// Local-only, serial, fail-stop runner. Requires explicitly selected host/product/evidence locations.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {pairHash,verifyChain}=require('./oracle.cjs'),PLAN=require('./plan.json');
const ROOT=path.resolve(__dirname,'../../../..'),PLAN_FILE=path.join(__dirname,'plan.json');
const [hostRoot,productRoot,outArg]=process.argv.slice(2);assert(hostRoot&&productRoot&&outArg,'explicit host, product and evidence paths required');
const out=fs.realpathSync(outArg),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
assert(!fs.existsSync(path.join(out,'RESULT.json')),'never overwrite an earlier run');
const summary={status:'RUNNING',scope:PLAN.scope,base:PLAN.base,started:new Date().toISOString(),pid:process.pid,node:process.version,nodeSHA256:sha(fs.readFileSync(process.execPath)),cases:[],controls:[],NW:0};
const save=()=>fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(summary,null,2)+'\n');
const childEnv={...process.env};for(const key of ['NODE_OPTIONS','NODE_PATH','ELECTRON_RUN_AS_NODE'])delete childEnv[key];
function child(stage,c,dir){
 const argv=[path.join(__dirname,'worker.cjs'),stage,c.id,dir,hostRoot,productRoot,PLAN_FILE],started=new Date().toISOString();
 const r=spawnSync(process.execPath,argv,{cwd:ROOT,env:childEnv,encoding:'utf8',timeout:20000,killSignal:'SIGKILL',maxBuffer:4*1024*1024});
 const prefix=path.join(out,c.id+'-'+stage);
 fs.writeFileSync(prefix+'.stdout.json',r.stdout??'');fs.writeFileSync(prefix+'.stderr.log',r.stderr??'');
 const receipt={started,ended:new Date().toISOString(),argv,pid:r.pid,status:r.status,signal:r.signal,error:r.error?String(r.error):null,stdoutSHA256:sha(r.stdout??''),stderrSHA256:sha(r.stderr??'')};
 fs.writeFileSync(prefix+'.execution.json',JSON.stringify(receipt,null,2)+'\n');
 assert.equal(r.error,undefined,r.error?.message);assert.equal(r.signal,null);assert.equal(r.status,0,(r.stdout??'')+(r.stderr??''));
 const observation=JSON.parse(r.stdout);assert.equal(observation.pid,r.pid);assert.equal(observation.ppid,process.pid);assert.equal(observation.id,c.id);assert.equal(observation.stage,stage);
 return observation;
}
try{
 save();assert.equal(process.version,'v22.21.1');assert.equal(summary.nodeSHA256,'8179f1d4a920be531d81edef7a26df5cc5c9cb11c8b5a28fb336aa030fbfe3df');
 for(const [relative,expected]of Object.entries(PLAN.engine))assert.equal(sha(fs.readFileSync(path.join(ROOT,relative))),expected,'frozen runtime '+relative);
 const E=require(path.join(ROOT,'js/engine/build/production.cjs'));
 assert.deepEqual(E.config.runtimeCapabilities(),{allowHeldItemSources:true,allowExperimentalHeldItemBattle:true});summary.controls.push('actual default production capabilities are released');
 for(const c of PLAN.cases){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-e-mz-slot-'));
  fs.writeFileSync(path.join(dir,'OWNED.json'),JSON.stringify({planVersion:PLAN.version,caseId:c.id}));
  const a=child('producer',c,dir),b=child('consumer',c,dir);assert.notEqual(a.pid,b.pid);assert.equal(a.installs,1);
  const firstPair=verifyChain(a,b);
  assert.deepEqual(a.requiredObservation.facts.money,{amuletCoin:false,happyHour:false,payDay:0});
  const fact=a.requiredObservation.facts.members.find(m=>m.id==='MZ-SLOT-P1');assert(fact);
  if(c.kind==='consume'){
   assert.deepEqual([fact.initial,fact.current,fact.recovery,fact.recycle],['oranberry','','','oranberry']);
   assert(a.requiredObservation.facts.events.some(e=>e.id===fact.id&&e.reason==='consume'));
  }else{
   assert.deepEqual([fact.initial,fact.current,fact.recovery,fact.recycle],['leftovers','','leftovers','']);
   assert(a.requiredObservation.facts.events.some(e=>e.id===fact.id&&e.reason==='temporary-remove'));
  }
  if(c.abort){assert.equal(b.installs,0);assert.equal(b.slotAfter,a.slotAfter);assert.deepEqual(b.writes,[]);assert.equal(b.requiredObservation,undefined);}
  else{const next=pairHash(b.requiredObservation.facts);assert.equal(b.final.appliedBattles[b.result.battleId].settlement.pairHash,next);assert.equal(b.savedPairHash,next);assert.equal(b.installs,1);assert.equal(b.final.party[0].moves[0].pp,38);assert.equal(Object.keys(b.final.appliedBattles).length,2);assert.notEqual(b.slotAfter,a.slotAfter);}
  // Controls change only detached test observations. They never modify a real session or a save.
  for(const [name,mutate]of [
   ['facts money',(x,y)=>{x.requiredObservation.facts.money.payDay++;}],
   ['installed pair',(x,y)=>{x.final.appliedBattles[x.result.battleId].settlement.pairHash='0'.repeat(64);}],
   ['saved pair',(x,y)=>{x.savedPairHash='0'.repeat(64);}],
   ['fresh-loaded pair',(x,y)=>{y.loaded.appliedBattles[x.result.battleId].settlement.pairHash='0'.repeat(64);}],
   ['different slot bytes',(x,y)=>{y.slotBefore='0'.repeat(64);}]
  ]){const x=JSON.parse(JSON.stringify(a)),y=JSON.parse(JSON.stringify(b));mutate(x,y);assert.throws(()=>verifyChain(x,y),assert.AssertionError);summary.controls.push(c.id+': rejects changed '+name);}
  summary.cases.push({id:c.id,status:'PASS',firstPair,producerPID:a.pid,consumerPID:b.pid,ownedSaveDirectory:dir,settlements:c.abort?1:2,consumerAbort:!!c.abort});save();
 }
 assert.deepEqual(E.config.runtimeCapabilities(),{allowHeldItemSources:true,allowExperimentalHeldItemBattle:true});
 for(const [relative,expected]of Object.entries(PLAN.engine))assert.equal(sha(fs.readFileSync(path.join(ROOT,relative))),expected,'runtime unchanged '+relative);
 summary.status='PASS_CONTROLLED_CHAIN_ONLY';summary.ended=new Date().toISOString();save();console.log(JSON.stringify(summary,null,2));
}catch(error){summary.status='FAIL_STOP';summary.error=String(error.stack??error);summary.ended=new Date().toISOString();save();console.error(summary.error);process.exitCode=1;}
