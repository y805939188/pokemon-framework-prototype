'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const E=require('../../../js/engine/build/engine.cjs');const S=E.state;const T=E.storage;const clone=x=>JSON.parse(JSON.stringify(x));
const read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,'../../../content/sample',f),'utf8'));
const compiled=E.contentCompile.compileContent({manifest:read('manifest.json'),sources:read('sources.json'),species:read('species.json'),overlays:read('overlays.json'),grants:read('grants.json')}).data;
const content=E.contentRuntime.assembleContent(compiled,E.dex.createDexLookup()).content;
const opts={content,speciesKey:E.speciesKey.speciesKeyResolver(content)};
const legacy3=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../fixtures/step4-saves/full.json'),'utf8'));
const legacy4=()=>{const raw=legacy3();raw.schema=4;raw.stats=E.stats.newStats();raw.steps=0;for(const m of [...raw.party,...raw.boxes]){const k=E.speciesKey.keyOfBattleName(content,m.species);m.species=k.species;m.form=k.form;}for(const key of ['seen','owned'])raw.dex[key]=[...new Set(raw.dex[key].map(n=>opts.speciesKey(n).species))];return raw;};
const migrate=raw=>{const r=E.saveSchema.migrateGame(raw,opts);assert.equal(r.ok,true,JSON.stringify(r.error));return r.state;};

test('P51-06/08: fixed slots have one authority, current box first, then 0; holes never compact',()=>{
 const g=S.newGame({party:[],content});assert.equal(g.schema,7);assert.equal('boxes'in g,false);assert.equal(g.storage.boxes.length,40);
 assert.ok(g.storage.boxes.every(b=>b.slots.length===30&&b.slots.every(m=>m===null)));
 const m=migrate(legacy4()).party[0];g.storage.currentBox=39;const p=T.placeInBox(g.storage,m);assert.deepEqual(p,{kind:'box',box:39,slot:0});
 assert.equal(T.locateMember(g,m.id).position.box,39);g.storage.boxes[39].slots.fill(m);assert.deepEqual(T.firstFreeBox(g.storage),{kind:'box',box:0,slot:0});
 assert.equal(T.validPosition({kind:'box',box:40,slot:0}),false);assert.throws(()=>T.memberAt(g,{kind:'box',box:0,slot:30}),/bounds/);
 g.storage.boxes[0].wallpaper=999;const before=clone(g);assert.equal(T.displayWallpaper(g.storage,0),0);assert.deepEqual(g,before);
});
test('P51-06/07: 0/29/30/31/1199/1200 map exactly; 1201 refuses entire migration with full diagnostic',()=>{
 const template=legacy4().party[0];
 for(const count of [0,29,30,31,1199,1200,1201]){
  const raw=legacy4();raw.boxes=Array.from({length:count},(_,i)=>({...clone(template),id:`B-${i}`}));const bytes=JSON.stringify(raw);const r=E.saveSchema.migrateGame(raw,opts);assert.equal(JSON.stringify(raw),bytes);
  if(count===1201){assert.equal(r.ok,false);assert.deepEqual([r.error.code,r.error.found,r.error.partyCount,r.error.boxMemberCount,r.error.limit,r.error.recovery],['capacity-exceeded',4,6,1201,1200,'none-in-5.1']);assert.equal(r.error.problems[0].path,'$.boxes[1200]');assert.match(r.error.message,/cannot continue.*No recovery tool/);}
  else{assert.equal(r.ok,true,JSON.stringify(r.error));assert.equal(T.boxedMembers(r.state).length,count);raw.boxes.forEach((m,i)=>assert.equal(r.state.storage.boxes[Math.floor(i/30)].slots[i%30].id,m.id));assert.deepEqual(E.saveSchema.validateGame(r.state),[]);}
 }
});
test('P51-07/08: all declared old schemas migrate deterministically, trusted values survive and raw remains unchanged',()=>{
 for(const version of [1,2,3,4]){
  const raw=version===4?legacy4():legacy3();raw.schema=version;if(version<3)delete raw.claims;if(version===1)for(const m of [...raw.party,...raw.boxes])delete m.statusCount;
  const before=clone(raw);const one=migrate(raw),two=migrate(raw);assert.deepEqual(one,two);assert.deepEqual(raw,before);assert.equal(one.schema,7);
  const old=[...raw.party,...raw.boxes],fresh=T.allMembers(one);assert.deepEqual(old.map(m=>m.id),fresh.map(m=>m.id));
  old.forEach((m,i)=>{for(const key of ['nature','gender','ability','ivs','evs','moves','friendship','hp','ball','nickname'])assert.deepEqual(key==='moves'?fresh[i][key].map(({ppUps,...move})=>move):fresh[i][key],m[key],key);assert.equal(fresh[i].owner.name,m.ot);assert.equal(fresh[i].shiny,false);assert.equal(fresh[i].origin.receivedAt,null);});
  assert.deepEqual(E.saveSchema.migrateGame(one,opts).state,one);assert.equal(E.saveSchema.migrateGame(one,opts).migrated,false);
 }
});
test('P51-07: missing content, unknown species, duplicate IDs and malformed new metadata cannot become a usable save',()=>{
 const raw=legacy4();assert.equal(E.saveSchema.migrateGame(raw).error.code,'needs-content');
 const unknown=clone(raw);unknown.party[0].species='unknown';assert.equal(E.saveSchema.migrateGame(unknown,opts).error.code,'unmapped-species');
 const dup=clone(raw);dup.boxes[0].id=dup.party[0].id;assert.equal(E.saveSchema.migrateGame(dup,opts).error.code,'invalid');
 const good=migrate(raw);for(const mutate of [g=>g.storage.boxes.pop(),g=>g.storage.boxes[0].slots.pop(),g=>g.storage.currentBox=40,g=>g.party[0].personalID=-1,g=>g.party[0].owner.id=2**32,g=>g.party[0].origin.map=-1,g=>g.party[0].ot='second authority',g=>g.nextMemberOrdinal='01',g=>g.party[0].friendship=Number.MAX_SAFE_INTEGER+1,g=>g.storage.boxes[39].slots[29]=clone(g.party[0])]){const bad=clone(good);mutate(bad);assert.equal(E.saveSchema.migrateGame(bad,opts).error.code,'invalid');}
 assert.equal(E.saveSchema.migrateGame({...good,schema:99}).error.code,'unknown-version');
});
test('P51-07: failed 1201 load/commit keeps every store slot byte-for-byte and writes no backup',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p51-capacity-'));const file=path.join(dir,'slot1.json');
 const raw=legacy4();raw.boxes=Array.from({length:1201},(_,i)=>({...clone(raw.party[0]),id:`B-${i}`}));
 const bytes=JSON.stringify(raw);fs.writeFileSync(file,bytes);fs.writeFileSync(path.join(dir,'slot2.json'),'another slot');
 const before=Object.fromEntries(fs.readdirSync(dir).map(f=>[f,fs.readFileSync(path.join(dir,f),'utf8')]));
 const store=new E.store.SaveStore(file,{},opts.speciesKey,content);assert.throws(()=>store.load(),e=>e.info.code==='capacity-exceeded');assert.throws(()=>store.commit({}),e=>e.info.code==='capacity-exceeded');
 assert.deepEqual(Object.fromEntries(fs.readdirSync(dir).map(f=>[f,fs.readFileSync(path.join(dir,f),'utf8')])),before);fs.rmSync(dir,{recursive:true});
});
test('P51-08: sparse old derived fields fill once; PID uses original member, never slot/time',()=>{
 const raw=legacy4();const m=raw.party[0];delete m.nature;delete m.gender;delete m.ability;m.id='W999999999999999-8';const old=clone(m);
 const result=migrate(raw);assert.equal(result.nextMemberOrdinal,'1000000000000000');assert.equal(result.party[0].personalID,E.memberIdentity.legacyPersonalId(old));
 const moved=clone(raw);moved.boxes.push(moved.party.shift());assert.equal(migrate(moved).storage.boxes[0].slots[raw.boxes.length].personalID,result.party[0].personalID);
});
test('P51-06/23: non-40 author configuration rejected by compile and runtime before any Dex use',()=>{
 const input={manifest:read('manifest.json'),sources:read('sources.json'),species:read('species.json'),overlays:[],settings:{NUM_STORAGE_BOXES:41}};
 const r=E.contentCompile.compileContent(input);assert.equal(r.ok,false);assert.ok(r.errors.some(e=>e.file==='settings.json'&&/actual value: 41/.test(e.message)));
 const tampered={...compiled,settings:{NUM_STORAGE_BOXES:1}};let calls=0;const dex=new Proxy({}, {get(){return()=>{calls++;throw Error('must not load');};}});
 assert.throws(()=>E.contentRuntime.loadCompiled(tampered),/5.0 supported 1–1000/);assert.ok(E.contentRuntime.assembleContent(tampered,dex).errors.length);assert.equal(calls,0);
 for(const p of [1,3,6])assert.equal(E.config.resolveConfig({MAX_PARTY_SIZE:p}).MAX_PARTY_SIZE,p);
});
