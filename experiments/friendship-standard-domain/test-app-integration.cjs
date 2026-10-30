'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture,J}=require('./integration-helpers.cjs');
test('App/Store preview zero writes, opaque authority, cancel, selected target only, byte originals and idempotence',async()=>{
 const w=fixture({game:g=>{g.party[1].friendship=257;return g;}}),before=fs.readFileSync(w.file),state=J(w.read());
 const p=await w.app.previewFriendshipMigration(w.store.friendshipMigration());assert.equal(p.status,'ready',JSON.stringify(p));assert.equal(p.outOfScope.length,1);
 assert.deepEqual(fs.readdirSync(w.dir),['player.json']);assert.equal((await w.app.confirmFriendshipMigration({})).status,'refused');
 assert.equal(w.app.cancelFriendshipMigration(p.handle).status,'cancelled');assert.equal((await w.app.confirmFriendshipMigration(p.handle)).status,'refused');assert.deepEqual(fs.readFileSync(w.file),before);
 const next=await w.app.previewFriendshipMigration(w.store.friendshipMigration());next.targets.length=0;next.planHash='forged';
 const r=await w.app.confirmFriendshipMigration(next.handle);assert.equal(r.status,'applied',JSON.stringify(r));state.party[0].friendship=255;assert.deepEqual(w.read(),state);
 assert.deepEqual(fs.readFileSync(r.persistence.bundle+'/original.raw'),before);assert.equal(w.E.store.inspectFriendshipRecovery(r.persistence.bundle).status,'new');
 assert.equal((await w.app.confirmFriendshipMigration(next.handle)).status,'already-applied');assert.equal(w.app.saveBlocked,false);
 assert.equal(w.E.friendship.planFriendshipChange(w.read().party[0],'walking',{AFFECTION_EFFECTS:false}).status==='refused',false);
});
for(const mode of ['state','content','same-content-new-object','slot','file-path','host-generation'])test('stale '+mode+' refuses before install',async()=>{
 const w=fixture(),before=fs.readFileSync(w.file),p=await w.app.previewFriendshipMigration(w.store.friendshipMigration());assert.equal(p.status,'ready',JSON.stringify(p));
 if(mode==='state')w.read().money++;
 if(mode==='content')w.content().species.Pidgey.baseExp++;
 if(mode==='same-content-new-object')w.replaceContent();
 if(mode==='slot')fs.appendFileSync(w.file,' ');
 if(mode==='file-path')w.store.file+='other';
 if(mode==='host-generation')w.app.stateReplacedByHost();
 const r=await w.app.confirmFriendshipMigration(p.handle);assert.equal(r.status,'refused',JSON.stringify(r));assert.equal(w.read().party[0].friendship,256);
 if(mode!=='slot')assert.deepEqual(fs.readFileSync(w.file),before);
});
for(const operation of ['recordSteps','healParty','recoverAll','startNewGame','stateReplacedByHost','assertHostStateReplacementAllowed','beginManagement','beginInventoryOperation','beginLearning','beginEventEvolution','beginTrade','claimGrant','receiveGift','finishBattle','commitResult'])test('caught reentry '+operation+' invalidates owner and preserves original',async()=>{
 const w=fixture(),before=fs.readFileSync(w.file),p=await w.app.previewFriendshipMigration(w.store.friendshipMigration(point=>{if(point==='before-rename')assert.throws(()=>w.app[operation](),/friendship-migration-active/);}));
 assert.equal(p.status,'ready',JSON.stringify(p));const r=await w.app.confirmFriendshipMigration(p.handle);assert.equal(r.status,'refused',JSON.stringify(r));assert.deepEqual(fs.readFileSync(w.file),before);assert.equal(w.read().party[0].friendship,256);assert.equal(w.app.saveBlocked,false);
});
test('busy and delayed old callbacks cannot replace while confirming; lock retained for indeterminate persistence',async()=>{
 const w=fixture();const token=w.app.beginManagement();assert.equal((await w.app.previewFriendshipMigration(w.store.friendshipMigration())).status,'refused');w.app.endManagement(token);
 let enter;const waiting=new Promise(r=>enter=r);let release;const resume=new Promise(r=>release=r),base=w.store.friendshipMigration();
 const p=await w.app.previewFriendshipMigration({...base,commit:async req=>{enter();await resume;req.assertCurrent();return base.commit(req);}});
 const promise=w.app.confirmFriendshipMigration(p.handle);await waiting;assert.equal(w.app.saveBlocked,true);assert.throws(()=>w.app.stateReplacedByHost(),/migration-active/);release();
 const r=await promise;assert.equal(r.status,'reload-required');assert.equal(w.read().party[0].friendship,256);assert.equal(w.app.saveBlocked,true);
});
for(const mode of ['throws-before','no-install','wrong-install','throws-after'])test('install readback '+mode,async()=>{
 const w=fixture({install:(next,set)=>{if(mode==='throws-before')throw Error('before');if(mode==='no-install')return;if(mode==='wrong-install'){next.money++;set(next);return;}set(next);throw Error('after');}});
 const p=await w.app.previewFriendshipMigration(w.store.friendshipMigration()),r=await w.app.confirmFriendshipMigration(p.handle);
 assert.equal(JSON.parse(fs.readFileSync(w.file)).party[0].friendship,255);
 assert.equal(r.status,mode==='throws-after'?'applied':'reload-required',JSON.stringify(r));assert.equal(w.app.saveBlocked,mode!=='throws-after');assert.equal(r.persistence.status,'committed');assert.ok(fs.existsSync(r.persistence.bundle+'/receipt.json'));
});
test('post rename exception is committed and verified, not a zero-write failure',async()=>{
 const w=fixture(),p=await w.app.previewFriendshipMigration(w.store.friendshipMigration(point=>{if(point==='after-rename')throw Error('post commit injected');}));
 const r=await w.app.confirmFriendshipMigration(p.handle);assert.equal(r.status,'applied',JSON.stringify(r));assert.equal(r.persistence.status,'committed');assert.match(r.persistence.error,/post commit/);
});
test('empty selection does not save or materialize omitted values; full validator remains mandatory',async()=>{
 const w=fixture(),before=fs.readFileSync(w.file),p=await w.app.previewFriendshipMigration(w.store.friendshipMigration(),[]);assert.equal(p.status,'ready');assert.equal((await w.app.confirmFriendshipMigration(p.handle)).status,'unchanged');assert.deepEqual(fs.readFileSync(w.file),before);
 w.read().money=-1;assert.equal((await w.app.previewFriendshipMigration(w.store.friendshipMigration())).status,'refused');
});
test('migration preserves an actual B paired settlement and permits the next required-source battle',async()=>{
 const {E,T,ROOT,workspace}=require('./integration-helpers.cjs'),path=require('node:path');
 const names=['manifest','sources','species','overlays','grants','regional-dex','settings','map-metadata'];
 const input=Object.fromEntries(names.filter(n=>fs.existsSync(path.join(ROOT,'content/sample',n+'.json'))).map(n=>[n.replace(/-([a-z])/g,(_,x)=>x.toUpperCase()),JSON.parse(fs.readFileSync(path.join(ROOT,'content/sample',n+'.json'),'utf8'))]));
 const compiled=E.contentCompile.compileContent(input);assert.equal(compiled.ok,true,JSON.stringify(compiled.errors));const dex=E.dex.createDexLookup(),assembled=E.contentRuntime.assembleContent(compiled.data,dex);assert.deepEqual(assembled.errors,[]);const c=assembled.content;
 let current=T.fixtures.savedFor(T.fixtures.makeGame(),c);current.party[0].friendship=256;
 const app=new E.app.GameApplication({state:{read:()=>current,replace:n=>{current=n;}},content:()=>({content:c,dex}),sessions:E.composition.createBattleSessionFactory({content:()=>c,seed:()=>[1,2,3,4]}),projection:{project(){}},random:n=>0,clock:()=>12345});
 const req={battleId:'migration-before-required',kind:'wild',seq:1,foes:[{species:'Pidgey',level:2}],canLose:true};const h=await app.startBattle(req);assert.equal((await h.run()).ok,true);const out=app.finishBattle(h,req);assert.equal(out.commit,'applied',JSON.stringify(out));
 assert.match(current.appliedBattles[req.battleId].settlement.pairHash,/^[a-f0-9]{64}$/);const before=J(current),file=path.join(workspace(),'paired.json'),store=new E.store.SaveStore(file,{},E.speciesKey.speciesKeyResolver(c),c);store.save(current);
 const p=await app.previewFriendshipMigration(store.friendshipMigration()),r=await app.confirmFriendshipMigration(p.handle);assert.equal(r.status,'applied',JSON.stringify(r));before.party[0].friendship=255;assert.deepEqual(current,before);assert.deepEqual(store.load(),before);
 assert.equal(E.friendship.deriveAffection(current.party[0]).status,'ready');assert.equal(E.friendship.planFriendshipChange(current.party[0],'faint',{AFFECTION_EFFECTS:false}).after,254);
 const req2={...req,battleId:'migration-next-required',seq:2},h2=await app.startBattle(req2);assert.equal((await h2.run()).ok,true);assert.equal(app.finishBattle(h2,req2).commit,'applied');
});

test('an intervening application write invalidates even an equal current snapshot',async()=>{
 const w=fixture(),p=await w.app.previewFriendshipMigration(w.store.friendshipMigration());assert.equal(w.app.recordSteps(0).status,'counted');assert.equal((await w.app.confirmFriendshipMigration(p.handle)).status,'refused');
});

test('completed durable handles cannot be cancelled, including repeats and a subsequently replaced game',async()=>{
 const w=fixture(),p=await w.app.previewFriendshipMigration(w.store.friendshipMigration());
 assert.equal((await w.app.confirmFriendshipMigration(p.handle)).status,'applied');
 const bytes=fs.readFileSync(w.file),game=J(w.read());
 for(let n=0;n<2;n++)assert.deepEqual(w.app.cancelFriendshipMigration(p.handle),{status:'refused',reason:'preview-completed'});
 assert.equal((await w.app.confirmFriendshipMigration(p.handle)).status,'already-applied');
 assert.deepEqual(fs.readFileSync(w.file),bytes);assert.deepEqual(w.read(),game);
 w.app.stateReplacedByHost();w.read().party[0].friendship=71;
 assert.deepEqual(w.app.cancelFriendshipMigration(p.handle),{status:'refused',reason:'preview-completed'});
 assert.equal((await w.app.confirmFriendshipMigration(p.handle)).status,'refused');
 assert.equal(w.read().party[0].friendship,71);assert.deepEqual(fs.readFileSync(w.file),bytes);
});
test('ordinary cancellation and repeated late cancellation perform zero persistent writes',async()=>{
 const w=fixture(),bytes=fs.readFileSync(w.file),game=J(w.read()),p=await w.app.previewFriendshipMigration(w.store.friendshipMigration());
 assert.equal(w.app.cancelFriendshipMigration(p.handle).status,'cancelled');
 assert.deepEqual(w.app.cancelFriendshipMigration(p.handle),{status:'refused',reason:'unknown-preview'});
 assert.equal((await w.app.confirmFriendshipMigration(p.handle)).status,'refused');
 assert.deepEqual(fs.readFileSync(w.file),bytes);assert.deepEqual(fs.readdirSync(w.dir),['player.json']);assert.deepEqual(w.read(),game);
});

for(const unchanged of [false,true])for(const repeat of [false,true])test(`completed ${unchanged?'unchanged':'applied'} ${repeat?'repeat':'first'} returns detached public facts`,async t=>{
 let installs=0;
 const w=fixture({install:(next,set)=>{installs++;set(next);throw Error('installed-with-diagnostic');}});
 const port=w.store.friendshipMigration(point=>{if(point==='after-rename')throw Error('persisted-with-diagnostic');});
 const p=await w.app.previewFriendshipMigration(port,unchanged?[]:undefined);
 assert.equal(p.status,'ready');
 const first=await w.app.confirmFriendshipMigration(p.handle);assert.equal(first.status,unchanged?'unchanged':'applied');
 if(!unchanged){assert.match(first.error,/installed-with-diagnostic/);assert.match(first.persistence.error,/persisted-with-diagnostic/);}
 const expected={...J(first),status:unchanged?'unchanged':'already-applied'},bytes=fs.readFileSync(w.file),state=J(w.read());
 let returned=repeat?await w.app.confirmFriendshipMigration(p.handle):first;
 for(const field of ['status','reason','error','persistence.rawHash','persistence.bundle','persistence.status','persistence.error']){
  const parts=field.split('.'),object=parts.length===2?returned.persistence:returned;
  assert.equal(Object.isFrozen(object),false,'public values remain mutable');
  object[parts.at(-1)]='caller-mutated-'+field;
  const next=await w.app.confirmFriendshipMigration(p.handle);
  assert.deepEqual(next,expected,field+' must not alter private completion facts');
  assert.notStrictEqual(next.persistence,returned.persistence);
  t.diagnostic(field+': mutable public value; subsequent complete result matches original facts');
  returned=repeat?next:first;
 }
 assert.equal(installs,unchanged?0:1);assert.deepEqual(w.read(),state);assert.deepEqual(fs.readFileSync(w.file),bytes);
 assert.deepEqual(w.app.cancelFriendshipMigration(p.handle),{status:'refused',reason:'preview-completed'});
 assert.deepEqual(await w.app.confirmFriendshipMigration(p.handle),expected);assert.equal(w.app.saveBlocked,false);
});

for(const unchanged of [false,true])test(`real Store ${unchanged?'unchanged':'applied'} raw whitespace change stays refused after old public facts are mutated`,async t=>{
 let installs=0;
 const w=fixture({install:(next,set)=>{installs++;set(next);}}),original=fs.readFileSync(w.file);
 const p=await w.app.previewFriendshipMigration(w.store.friendshipMigration(),unchanged?[]:undefined);
 assert.equal(p.status,'ready');
 const first=await w.app.confirmFriendshipMigration(p.handle),repeat=await w.app.confirmFriendshipMigration(p.handle);
 assert.equal(first.status,unchanged?'unchanged':'applied');assert.equal(repeat.status,unchanged?'unchanged':'already-applied');
 const state=J(w.read()),bundle=first.persistence.bundle,receipt=bundle&&fs.readFileSync(bundle+'/receipt.json');
 fs.appendFileSync(w.file,' \n');const bytes=fs.readFileSync(w.file),rawHash=w.E.store.friendshipRawHash(bytes);
 assert.notEqual(rawHash,repeat.persistence.rawHash);assert.deepEqual(w.store.load(),state);
 const refused=async label=>{const r=await w.app.confirmFriendshipMigration(p.handle);assert.equal(r.status,'refused',JSON.stringify(r));assert.match(r.error,/friendship-replay-stale/);t.diagnostic(label+': '+JSON.stringify(r));};
 await refused('normal raw identity control');
 for(const [label,returned]of [['first',first],['repeat',repeat]]){
  returned.status='unchanged';returned.error='caller-error';
  Object.assign(returned.persistence,{rawHash,bundle:'caller-bundle',status:'committed',error:'caller-persistence-error'});
  await refused(label+' public rawHash/bundle/status/error mutated');
 }
 await refused('repeated stale confirmation');
 assert.deepEqual(w.app.cancelFriendshipMigration(p.handle),{status:'refused',reason:'preview-completed'});
 assert.equal(installs,unchanged?0:1);assert.deepEqual(w.read(),state);assert.deepEqual(fs.readFileSync(w.file),bytes);assert.equal(w.app.saveBlocked,false);
 if(bundle){assert.deepEqual(fs.readFileSync(bundle+'/original.raw'),original);assert.deepEqual(fs.readFileSync(bundle+'/receipt.json'),receipt);}
 else assert.equal(fs.existsSync(w.file+'.friendship'),false);
});
