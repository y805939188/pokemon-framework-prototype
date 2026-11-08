'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('unconsumed held item survives disk Continue without granting default capability; take and next required battle persist',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'pf-h3-held-continue-'));fs.writeFileSync(path.join(folder,'OWNED.json'),JSON.stringify({scope:'held-continue'}));
 const records=[];
 for(const stage of ['producer','consumer','verifier']){
  const r=spawnSync(process.execPath,[path.join(__dirname,'worker.cjs'),stage,folder],{env:process.env,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024});
  fs.writeFileSync(path.join(folder,stage+'.stdout'),r.stdout??'');fs.writeFileSync(path.join(folder,stage+'.stderr'),r.stderr??'');
  assert.equal(r.status,0,stage+' '+folder+' '+r.stderr);const value=JSON.parse(r.stdout.trim());records.push(value);
 }
 assert.equal(new Set(records.map(x=>x.pid)).size,3);
 assert.deepEqual(records[1].loaded,records[0].final,'new process receives exactly the serialized unconsumed held state');
 assert.deepEqual(records[2].loaded,records[1].final,'second Continue preserves every persisted field');
 assert.equal(records[2].slotBefore,records[2].slotAfter,'verification Continue is read-only');
 assert.equal(records[1].writes,2);assert.match(records[1].refusal,/held-item-battle-disabled/);
 console.log('H3_HELD_CONTINUE '+JSON.stringify({folder,pids:records.map(x=>x.pid),writes:records[1].writes,refusal:records[1].refusal,slotHashes:records.map(x=>x.slotAfter),NW:0}));
});
