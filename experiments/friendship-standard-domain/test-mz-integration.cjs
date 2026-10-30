'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');const {host}=require('./mz-host.cjs');const {J}=require('./integration-helpers.cjs');
test.before(()=>{const r=require('node:child_process').spawnSync('pnpm',['--dir','src','exec','vite','build'],{cwd:require('./helpers.cjs').ROOT,env:{...process.env,RR_PLUGIN:'PS_SaveState'},encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);});
test('actual JsonEx/compression/slot: preview/cancel zero writes; one-file commit retains host/globalInfo and byte original; ordinary load reads 255',async()=>{
 const h=host(),G=h.ctx;await h.save(1);const before=fs.readFileSync(h.file(1)),global=fs.readFileSync(G.StorageManager.filePath('global')),old=J(G.$gameSystem._psGame),other=J(G.$gameParty);
 const p=await G.PSState.previewFriendshipMigration(1);assert.equal(p.status,'ready',JSON.stringify(p));assert.equal(G.PSState.cancelFriendshipMigration(p.handle).status,'cancelled');assert.deepEqual(fs.readFileSync(h.file(1)),before);
 const p2=await G.PSState.previewFriendshipMigration(1),r=await G.PSState.confirmFriendshipMigration(p2.handle);assert.equal(r.status,'applied',JSON.stringify(r));assert.equal(G.$gameSystem._psGame.party[0].friendship,255);old.party[0].friendship=255;assert.deepEqual(J(G.$gameSystem._psGame),old);
 assert.deepEqual(fs.readFileSync(r.persistence.bundle+'/original.raw'),before);assert.deepEqual(fs.readFileSync(G.StorageManager.filePath('global')),global);assert.deepEqual(J(G.$gameParty),other);
 assert.equal((await G.PSState.confirmFriendshipMigration(p2.handle)).status,'already-applied');assert.equal(fs.existsSync(h.file(1)+'_'),false);
 const contents=await G.StorageManager.loadObject(G.DataManager.makeSavename(1));assert.equal(contents.system.constructor.name,'Game_System');assert.equal(contents.system._psGame.encoding,'pokemon-framework-json');assert.equal(contents.system._psGame.version,1);
 await G.DataManager.loadGame(1);assert.equal(G.$gameSystem._psGame.party[0].friendship,255);assert.equal(G.$gameSystem._psSaveError,undefined);
});
for(const kind of ['wrong-slot','memory-progress','slot-bytes','slot-location','late-load','normal-save','ordinary-make','new-game'])test('real codec port refuses '+kind+' without overwriting target',async()=>{
 const h=host(),G=h.ctx;await h.save(1);const originalFile=h.file(1),before=fs.readFileSync(originalFile);
 if(kind==='wrong-slot'){await h.save(2);G.$gameSystem._psGame.money++;const p=await G.PSState.previewFriendshipMigration(2);assert.equal(p.status,'refused');return;}
 const p=await G.PSState.previewFriendshipMigration(1);assert.equal(p.status,'ready',JSON.stringify(p));
 if(kind==='memory-progress')G.$gameParty.progress++;
 if(kind==='slot-bytes')fs.appendFileSync(h.file(1),' ');
 if(kind==='slot-location')G.StorageManager.fileDirectoryPath=()=>h.dir+'/other/';
 if(['late-load','normal-save','ordinary-make','new-game'].includes(kind)){
  const original=G.StorageManager.zipToJson;let once=false;
  G.StorageManager.zipToJson=async zip=>{const result=await original(zip);if(!once){once=true;
   if(kind==='late-load')assert.throws(()=>G.DataManager.createGameObjects(),/migration-active/);
   if(kind==='normal-save')await assert.rejects(G.DataManager.saveGame(2),/migration-active/);
   if(kind==='ordinary-make')assert.throws(()=>G.DataManager.makeSaveContents(),/operation-pending/);
   if(kind==='new-game')assert.throws(()=>h.app.startNewGame(),/migration-active/);
  }return result;};
 }
 const r=await G.PSState.confirmFriendshipMigration(p.handle);assert.equal(r.status,'refused',JSON.stringify(r));assert.equal(G.$gameSystem._psGame.party[0].friendship,256);if(kind!=='slot-bytes')assert.deepEqual(fs.readFileSync(originalFile),before);
});
for(const after of [false,true])test('real slot rename '+(after?'postcommit':'precommit')+' fault reports physical outcome honestly',async()=>{
 const h=host(),G=h.ctx;await h.save(1);const before=fs.readFileSync(h.file(1)),p=await G.PSState.previewFriendshipMigration(1),rename=fs.renameSync;
 fs.renameSync=function(a,b){if(b===h.file(1)){if(after)rename(a,b);throw Error(after?'after-slot-rename':'before-slot-rename');}return rename(a,b);};
 let r;try{r=await G.PSState.confirmFriendshipMigration(p.handle);}finally{fs.renameSync=rename;}
 assert.equal(r.status,after?'applied':'refused',JSON.stringify(r));if(!after)assert.deepEqual(fs.readFileSync(h.file(1)),before);
 else{assert.equal(G.PSState.inspectFriendshipRecovery(r.persistence.bundle).status,'new');assert.equal(G.PSState.recoverFriendshipMigration(r.persistence.bundle,'restore-original').status,'old');assert.deepEqual(fs.readFileSync(h.file(1)),before);await G.DataManager.loadGame(1);assert.equal(G.$gameSystem._psGame.party[0].friendship,256);}
});
test('a pending ordinary save/load blocks preview; its late callback cannot race migration',async()=>{
 const h=host(),G=h.ctx;await h.save(1);
 const save=G.DataManager.saveGame(2);assert.equal((await G.PSState.previewFriendshipMigration(1)).status,'refused');await save;
 const load=G.DataManager.loadGame(1);assert.equal((await G.PSState.previewFriendshipMigration(1)).status,'refused');await load;
 assert.equal(G.$gameSystem._psGame.party[0].friendship,256);
});

test('duplicate confirmation refuses host progress after the original verified commit',async()=>{
 const h=host(),G=h.ctx;await h.save(1);const p=await G.PSState.previewFriendshipMigration(1);assert.equal((await G.PSState.confirmFriendshipMigration(p.handle)).status,'applied');G.$gameParty.progress++;
 assert.equal((await G.PSState.confirmFriendshipMigration(p.handle)).status,'refused');
});
test('official confirmation reports a committed slot and recovery bundle when host installation fails',async()=>{
 const h=host(),G=h.ctx;await h.save(1);const messages=[];let choose;
 G.$gameMessage={add:s=>messages.push(s),setChoices(){},setChoiceCallback:fn=>{choose=fn;}};
 const interpreter={setWaitMode(){}};h.commands.MigrateFriendship.call(interpreter,{slot:'1'});
 for(let n=0;n<100&&!choose;n++)await new Promise(r=>setImmediate(r));assert.equal(typeof choose,'function');
 const original=G.$gameSystem._psGame;
 Object.defineProperty(G.$gameSystem,'_psGame',{configurable:true,enumerable:true,get:()=>original,set:()=>{throw Error('host install failure');}});
 choose(0);for(let n=0;n<100&&interpreter._psFriendshipMigrationPending;n++)await new Promise(r=>setImmediate(r));
 assert.equal(G.PSState.lastMigration.status,'reload-required',JSON.stringify(G.PSState.lastMigration));assert.equal(G.PSState.lastMigration.persistence.status,'committed');
 assert.ok(fs.existsSync(G.PSState.lastMigration.persistence.bundle+'/receipt.json'));assert.match(messages.at(-1),/存档已写入.*重新启动/);assert.equal(h.app.saveBlocked,true);
 const raw=await G.StorageManager.loadObject(G.DataManager.makeSavename(1));assert.equal(JSON.parse(raw.system._psGame.data).party[0].friendship,255);assert.equal(original.party[0].friendship,256);
});
