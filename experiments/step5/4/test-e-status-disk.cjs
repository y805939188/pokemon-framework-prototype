'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const PLAN=require('./e-status-disk-contracts.json'),{content,newState,storeFor,stateHash}=require('./status-disk-worker.cjs');
const worker=path.join(__dirname,'status-disk-worker.cjs'),dirs=[],clone=v=>JSON.parse(JSON.stringify(v)),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
test.after(()=>{for(const d of dirs)fs.rmSync(d,{recursive:true,force:true});});
function owned(c){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-e-status-disk-'));dirs.push(dir);fs.writeFileSync(path.join(dir,'OWNED-STATUS-DISK-TEST.json'),JSON.stringify({version:PLAN.version,caseId:c.id}),{flag:'wx'});return dir;}
function step(c,folder,stage){
 const argv=[worker,stage,c.id,folder],start=Date.now(),r=cp.spawnSync(process.execPath,argv,{cwd:path.resolve(__dirname,'../../..'),encoding:'utf8',timeout:20000,killSignal:'SIGTERM',env:{...process.env,NODE_OPTIONS:''}});
 const receipt={argv,expectedCase:c.id,stage,pid:r.pid,parentPID:process.pid,elapsedMs:Date.now()-start,exit:r.status,signal:r.signal,stdout:r.stdout??'',stderr:r.stderr??'',error:r.error?String(r.error):null};
 fs.writeFileSync(path.join(folder,stage+'-execution.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 assert.equal(r.error,undefined,JSON.stringify(receipt));assert.equal(r.status,0,JSON.stringify(receipt));assert.equal(r.signal,null);const row=JSON.parse(r.stdout);assert.equal(row.id,c.id);assert.equal(row.stage,stage);assert.equal(row.pid,r.pid);assert.equal(row.ppid,process.pid);assert.notEqual(row.pid,process.pid);assert.equal(row.NW,0);
 assert.equal(row.loadedSHA256,stateHash(row.loaded));assert.equal(row.finalSHA256,stateHash(row.final));assert.equal(row.finalRawSHA256,hash(path.join(folder,'game.json')));assert.deepEqual(row.saveFiles,['game.json']);assert.equal(row.scope,'HEADLESS_APP_SAVESTORE_NEW_NODE_NOT_MZ_CONTINUE');return row;
}
function preservesUnrelated(before,after){
 const a=clone(before),b=clone(after);for(const v of[a,b]){v.party[0].hp=0;v.party[0].status='';v.party[0].statusCount=0;v.party[0].moves[0].pp=0;delete v.appliedBattles;delete v.stats;delete v.dex;}
 assert.deepEqual(b,a,'saving/next battle preserves all unrelated state and permanent member metadata');
}
for(const c of PLAN.cases)test(c.id+' '+c.check,()=>{
 const dir=owned(c),first=step(c,dir,'produce'),afterFirst=fs.readFileSync(path.join(dir,'game.json'));
 assert.equal(first.setupSaves,1);assert.equal(first.installs.length,1);assert.equal(first.battles.length,1);assert.equal(first.final.party[0].moves[0].ppUps,c.ppUps);assert.deepEqual(Object.keys(first.final.appliedBattles),[c.id+'/first']);
 const second=step(c,dir,'consume');assert.notEqual(second.pid,first.pid,'consumer is a fresh Node process');assert.equal(second.setupSaves,0);assert.deepEqual(second.loaded,first.final,'the complete prior committed state is loaded from real disk');assert.equal(second.loadedRawSHA256,first.finalRawSHA256);assert.equal(second.loadedSHA256,first.finalSHA256);
 const rows=[first,second];
 if(c.check==='abort-consumer-preserves-saved-first'){
  assert.equal(second.ownedRetirement,true);assert.equal(second.installs.length,0);assert.deepEqual(second.final,first.final);assert(fs.readFileSync(path.join(dir,'game.json')).equals(afterFirst));assert.equal(second.battles[0].result,null);
  const third=step(c,dir,'verify-third');assert.notEqual(third.pid,second.pid);assert.notEqual(third.pid,first.pid);assert.deepEqual(third.loaded,first.final);assert.equal(third.loadedRawSHA256,first.finalRawSHA256);assert.equal(third.installs.length,1);assert.equal(third.final.party[0].status,'');assert.deepEqual(Object.keys(third.final.appliedBattles),[c.id+'/first',c.id+'/third']);rows.push(third);
 }else{
  assert.equal(second.installs.length,c.check==='heal-and-PPUps-after-read'?2:1);assert.deepEqual(Object.keys(second.final.appliedBattles),[c.id+'/first',c.id+'/second']);assert.equal(second.final.party[0].moves[0].pp,c.first==='sleep'?38:c.ppUps===3?63:37);assert.equal(second.final.party[0].status,c.check==='ordinary-poison-after-read'?'psn':'');assert.equal(second.final.party[0].statusCount,0);
 }
 const last=rows.at(-1);preservesUnrelated(first.final,last.final);assert.equal(last.final.party[0].moves[0].ppUps,c.ppUps);
 console.log('E_STATUS_DISK_OBSERVATION '+JSON.stringify({id:c.id,scope:PLAN.scope,featureIds:PLAN.featureIds,completeHeading:false,processes:rows.length,rows}));
});
test('invalid on-disk document is refused without writing over its bytes',()=>{
 const c=PLAN.cases[0],dir=owned(c),file=path.join(dir,'game.json'),ct=content();fs.writeFileSync(file,'{damaged synthetic state\n');const raw=fs.readFileSync(file);assert.throws(()=>storeFor(file,ct).load(),e=>e.info?.code==='corrupt');assert(fs.readFileSync(file).equals(raw));assert.deepEqual(fs.readdirSync(dir).sort(),['OWNED-STATUS-DISK-TEST.json','game.json']);
});
test('a failure before rename keeps the previously saved complete document authoritative',()=>{
 const c=PLAN.cases[0],dir=owned(c),file=path.join(dir,'game.json'),ct=content(),store=storeFor(file,ct),game=newState(ct,c);store.save(game);const before=fs.readFileSync(file),changed=clone(game);changed.party[0].hp--;
 const failing=storeFor(file,ct,{at:point=>{if(point==='beforeRename')throw Error('controlled disk write failure before rename');}});assert.throws(()=>failing.save(changed),/controlled disk write failure/);assert(fs.readFileSync(file).equals(before));assert.deepEqual(store.load(),game);assert(!fs.existsSync(file+'.tmp'));
});
