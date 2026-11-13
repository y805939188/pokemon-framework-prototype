'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {sha}=require('./mz-slot-host.cjs'),PLAN=require('./e-hp-mz-continue-contracts.json'),ROOT=path.resolve(__dirname,'../../..'),clone=v=>JSON.parse(JSON.stringify(v));
const hostRoot=process.env.PF_MZ_SLOT_HOST_ROOT,productRoot=process.env.PF_MZ_SLOT_PRODUCT_ROOT;assert(hostRoot&&productRoot,'explicit installed host and accepted product are mandatory; local acceptance only, no skip/fallback');
function verifyLoaded(producer,consumer){assert.deepEqual(consumer.loaded,producer.final,'actual full prior result must be loaded through Continue');assert.equal(consumer.loadedHash,producer.finalHash);assert.equal(consumer.slotBefore,producer.slotAfter);assert.deepEqual(consumer.before,producer.final);assert.equal(consumer.initialLive.p1.hp,producer.final.party[0].hp);assert.deepEqual(consumer.initialLive.p1.pp,Object.fromEntries(producer.final.party[0].moves.map(m=>[m.id,m.pp])));}
function child(c,stage,folder){
 const argv=[path.join(__dirname,'hp-mz-continue-worker.cjs'),stage,c.id,folder,hostRoot,productRoot,path.join(__dirname,'e-hp-mz-continue-contracts.json')],start=Date.now(),r=spawnSync(process.execPath,argv,{cwd:ROOT,encoding:'utf8',timeout:20000,maxBuffer:8*1024*1024});
 const receipt={argv,stage,pid:r.pid,parentPID:process.pid,elapsedMs:Date.now()-start,exit:r.status,signal:r.signal,error:r.error?String(r.error):null,stdout:r.stdout??'',stderr:r.stderr??''};fs.writeFileSync(path.join(folder,stage+'-execution.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 if(r.error||r.signal||r.status!==0)console.log('E_HP_MZ_CONTINUE_FAILED_CHILD '+JSON.stringify({id:c.id,receipt,ownedSlots:Object.fromEntries(['file1.rmmzsave','global.rmmzsave'].filter(n=>fs.existsSync(path.join(folder,n))).map(n=>[n,fs.readFileSync(path.join(folder,n)).toString('base64')]))}));
 assert.equal(r.error,undefined,JSON.stringify(receipt));assert.equal(r.signal,null);assert.equal(r.status,0,JSON.stringify(receipt));const row=JSON.parse(r.stdout);assert.equal(row.id,c.id);assert.equal(row.stage,stage);assert.equal(row.pid,r.pid);assert.equal(row.ppid,process.pid);assert.equal(row.scope,PLAN.scope);assert.equal(row.NW,0);return{row,receipt};
}
for(const c of PLAN.cases)test(c.id+' '+c.check,async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'pf-e-mz-slot-'));fs.writeFileSync(path.join(folder,'OWNED.json'),JSON.stringify({planVersion:PLAN.version,caseId:c.id}),{flag:'wx'});const rows=[],receipts=[];
 try{
  let part=child(c,'producer',folder);rows.push(part.row);receipts.push(part.receipt);const producer=part.row,slot=fs.readFileSync(path.join(folder,'file1.rmmzsave')),global=fs.readFileSync(path.join(folder,'global.rmmzsave'));
  assert.equal(producer.loaded,null);assert.equal(producer.installs,1);assert.equal(producer.before.party[0].hp,c.effect==='recover'?55:220);assert.deepEqual(Object.keys(producer.final.appliedBattles),[c.id+'/first']);assert.equal(sha(slot),producer.slotAfter);
  part=child(c,'consumer',folder);rows.push(part.row);receipts.push(part.receipt);const consumer=part.row;assert.notEqual(producer.pid,consumer.pid);verifyLoaded(producer,consumer);
  for(const kind of ['hp','pp','ledger']){const wrong=clone(consumer);if(kind==='hp')wrong.loaded.party[0].hp++;else if(kind==='pp')wrong.loaded.party[0].moves[0].pp++;else delete wrong.loaded.appliedBattles[c.id+'/first'];assert.throws(()=>verifyLoaded(producer,wrong),assert.AssertionError);}
  if(c.abortConsumer){
   assert.equal(consumer.installs,0);assert.equal(consumer.outcome.commit,'none');assert(consumer.outcome.aborted);assert.deepEqual(consumer.final,producer.final);assert.deepEqual(consumer.writes,[]);assert.equal(consumer.slotAfter,producer.slotAfter);assert(fs.readFileSync(path.join(folder,'file1.rmmzsave')).equals(slot));assert(fs.readFileSync(path.join(folder,'global.rmmzsave')).equals(global));
   part=child(c,'verify-third',folder);rows.push(part.row);receipts.push(part.receipt);assert(![producer.pid,consumer.pid].includes(part.row.pid));verifyLoaded(producer,part.row);assert.equal(part.row.installs,1);assert.deepEqual(Object.keys(part.row.final.appliedBattles),[c.id+'/first',c.id+'/third']);
  }else{assert.equal(consumer.installs,1);assert.deepEqual(Object.keys(consumer.final.appliedBattles),[c.id+'/first',c.id+'/second']);assert.notEqual(consumer.slotAfter,producer.slotAfter);}
  const last=rows.at(-1);if(c.effect==='recover'){assert.equal(producer.final.party[0].hp,165);assert.equal(last.final.party[0].hp,220);}else{assert(producer.final.party[0].hp<220);assert(last.final.party[0].hp<producer.final.party[0].hp);}
  assert.equal(last.final.party[0].moves[0].pp,10-(c.effect==='recover'?2:0));assert.equal(last.final.party[0].moves[1].pp,15-(c.effect==='recoil'?2:0));
  console.log('E_HP_MZ_CONTINUE_OBSERVATION '+JSON.stringify({id:c.id,scope:PLAN.scope,featureIds:PLAN.featureIds,completeHeading:false,processes:rows.length,rows,executions:receipts,syntheticWrongLoadedReadouts:3,NW:0}));
 }catch(error){console.log('E_HP_MZ_CONTINUE_FAILED_OBSERVATION '+JSON.stringify({id:c.id,rows,executions:receipts,error:{name:error.name,message:error.message},ownedSlots:Object.fromEntries(['file1.rmmzsave','global.rmmzsave'].filter(n=>fs.existsSync(path.join(folder,n))).map(n=>[n,fs.readFileSync(path.join(folder,n)).toString('base64')]))}));throw error;
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
