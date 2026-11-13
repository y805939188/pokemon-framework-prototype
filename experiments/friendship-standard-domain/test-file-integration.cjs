'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {fixture,J}=require('./integration-helpers.cjs');
const points=['prepared','backup','candidate','receipt','bundle-ready','temp','before-rename','after-rename'];
for(const mode of ['kill','throw'])for(const point of points)test(`real subprocess ${mode} at ${point}: complete old/new and explicit restart recovery`,()=>{
 const w=fixture(),original=fs.readFileSync(w.file),r=spawnSync(process.execPath,[path.join(__dirname,'file-child.cjs'),w.file,point,mode],{encoding:'utf8'});
 assert.equal(fs.readFileSync(w.file+'.reached','utf8'),point,r.stderr);if(mode==='kill')assert.equal(r.signal,'SIGKILL');else assert.equal(r.status,0,r.stderr);
 const after=point==='after-rename',loaded=w.store.load();assert.equal(loaded.party[0].friendship,after?255:256);if(!after)assert.deepEqual(fs.readFileSync(w.file),original);
 const parent=w.file+'.friendship',bundles=fs.readdirSync(parent).filter(s=>/^[a-f0-9]{64}$/.test(s));
 if(bundles.length){
  const b=path.join(parent,bundles[0]);assert.deepEqual(fs.readFileSync(b+'/original.raw'),original);assert.equal(w.E.store.inspectFriendshipRecovery(b).status,after?'new':'old');
  assert.equal(w.E.store.recoverFriendshipFile(b,'complete').status,'new');assert.equal(w.store.load().party[0].friendship,255);
  assert.equal(w.E.store.recoverFriendshipFile(b,'complete').status,'new');assert.equal(w.E.store.recoverFriendshipFile(b,'restore-original').status,'old');assert.deepEqual(fs.readFileSync(w.file),original);
 }else assert.equal(after,false);
 if(mode==='throw'){const out=JSON.parse(fs.readFileSync(w.file+'.result'));assert.equal(out.status,after?'applied':'refused',JSON.stringify(out));}
});
test('unknown file after commit is never blindly restored or completed; bundle tampering is rejected',async()=>{
 const w=fixture(),p=await w.app.previewFriendshipMigration(w.store.friendshipMigration()),r=await w.app.confirmFriendshipMigration(p.handle),b=r.persistence.bundle;
 fs.writeFileSync(w.file,'foreign-new-write');for(const action of ['inspect','complete','restore-original'])assert.equal(w.E.store.recoverFriendshipFile(b,action).status,'unknown');assert.equal(fs.readFileSync(w.file,'utf8'),'foreign-new-write');
 fs.appendFileSync(b+'/original.raw',' ');assert.throws(()=>w.E.store.inspectFriendshipRecovery(b),/hash-mismatch/);
});
test('unrelated fields, paired held ledger, source identity and unknown >255 values retain exact semantics',async()=>{
 const w=fixture(),state=J(w.read());state.party[1].friendship=Number.MAX_SAFE_INTEGER;w.set(state);fs.writeFileSync(w.file,JSON.stringify(state));const expected=J(state);expected.party[0].friendship=255;
 const p=await w.app.previewFriendshipMigration(w.store.friendshipMigration()),r=await w.app.confirmFriendshipMigration(p.handle);assert.equal(r.status,'applied',JSON.stringify(r));assert.deepEqual(w.read(),expected);assert.deepEqual(w.store.load(),expected);
});
