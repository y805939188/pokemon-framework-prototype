'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const E=require('../../../js/engine/build/production.cjs'),T=require('../../../js/engine/build/testing.cjs');
const raw=id=>({protocol:1,battleId:id,outcome:{kind:'run',winner:null},members:{},bag:{potion:-1},captured:[],dex:{seen:[],owned:[]}});
function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'B-held-store-'));try{const file=path.join(dir,'save.json'),content=T.fixtures.content,store=new E.store.SaveStore(file,{},E.speciesKey.identityKeys,content);store.save(T.fixtures.makeGame());return fn({dir,file,content,store});}finally{fs.rmSync(dir,{recursive:true,force:true});}}
const files=dir=>Object.fromEntries(fs.readdirSync(dir).sort().map(f=>[f,fs.readFileSync(path.join(dir,f),'utf8')]));
test('B installer audit: normal SaveStore cannot turn an unknown fresh raw into a durable battle',()=>fixture(({dir,store})=>{
  const before=files(dir);assert.throws(()=>store.commit(raw('unknown')),/store-battle-source-unknown/);assert.deepEqual(files(dir),before);
  assert.throws(()=>store.commit(raw('unknown'),{legacy:true,required:false}),/store-battle-source-unknown/);assert.deepEqual(files(dir),before);
}));
test('B store: explicitly preselected legacy producer commits once; normal replay needs no producer',()=>fixture(({dir,file,content,store})=>{
  let calls=0;const input=raw('old-controlled'),legacy=E.store.createLegacyNoHeldSaveStore(file,id=>{calls++;assert.equal(id,input.battleId);assert.throws(()=>legacy.commit(input),/store-commit-active/);assert.throws(()=>legacy.save(legacy.load()),/store-commit-active/);return input;},{},E.speciesKey.identityKeys,content);
  assert.equal(legacy.commit(input).status,'applied');assert.equal(calls,1);const before=files(dir);
  assert.equal(store.commit(input).status,'already-applied');assert.deepEqual(files(dir),before);assert.equal(calls,1);
  assert.throws(()=>store.commit({...input,bag:{potion:-2}}),/different result/);assert.deepEqual(files(dir),before);
}));
test('B store: legacy producer mismatch/held state are rejected without installing or backing up',()=>fixture(({dir,file,content,store})=>{
  const input=raw('legacy-mismatch'),bad=E.store.createLegacyNoHeldSaveStore(file,()=>raw('other'),{},E.speciesKey.identityKeys,content),before=files(dir);
  assert.throws(()=>bad.commit(input),/producer-result-mismatch/);assert.deepEqual(files(dir),before);
  const game=store.load();game.party[0].item='leftovers';store.save(game);const held=files(dir);let calls=0;
  const blocked=E.store.createLegacyNoHeldSaveStore(file,()=>{calls++;return input;},{},E.speciesKey.identityKeys,content);
  assert.throws(()=>blocked.commit(input),/legacy-no-held-store-source-gate/);assert.equal(calls,0);assert.deepEqual(files(dir),held);
}));
