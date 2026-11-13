'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const runtime=process.env.H3_RUNTIME_ROOT,candidateBinding=require('../../../../scripts/headless-regression-binding.cjs');
const candidate=process.env.PF_HEADLESS_REGRESSION_BINDING?candidateBinding.capture(runtime,process.env.PF_HEADLESS_REGRESSION_BINDING):null;
test.after(()=>{if(candidate)candidateBinding.verify(runtime,candidate.binding);});
test('normal held item survives disk Continue, enters and consumes without overrides; abort, take and next battle persist',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'pf-h3-held-continue-'));fs.writeFileSync(path.join(folder,'OWNED.json'),JSON.stringify({scope:'held-continue',...(candidate?{candidateBindingSHA256:candidate.sha256}:{})}));
 const records=[];
 for(const stage of ['producer','consumer','verifier']){
  const r=spawnSync(process.execPath,[path.join(__dirname,'worker.cjs'),stage,folder],{env:process.env,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024});
  fs.writeFileSync(path.join(folder,stage+'.stdout'),r.stdout??'');fs.writeFileSync(path.join(folder,stage+'.stderr'),r.stderr??'');
  assert.equal(r.status,0,stage+' '+folder+' '+r.stderr);const value=JSON.parse(r.stdout.trim());if(candidate){assert.deepEqual(value.candidateIdentity,candidate.identity);assert.match(value.contentIdentity,/^[a-f0-9]{64}$/);}records.push(value);
 }
 assert.equal(new Set(records.map(x=>x.pid)).size,3);
 assert.equal(records[1].contentIdentity,records[0].contentIdentity);assert.equal(records[2].contentIdentity,records[0].contentIdentity);
 assert.deepEqual(records[1].loaded,records[0].final,'new process receives exactly the serialized unconsumed held state');
 assert.deepEqual(records[2].loaded,records[1].final,'second Continue preserves every persisted field');
 assert.equal(records[2].slotBefore,records[2].slotAfter,'verification Continue is read-only');
 assert.equal(records[1].writes,2);assert.equal(records[1].refusal,null);
 console.log('H3_HELD_CONTINUE '+JSON.stringify({folder,pids:records.map(x=>x.pid),writes:records[1].writes,refusal:records[1].refusal,slotHashes:records.map(x=>x.slotAfter),NW:0}));
});
