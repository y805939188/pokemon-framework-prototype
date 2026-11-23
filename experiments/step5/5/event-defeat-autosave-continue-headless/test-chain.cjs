'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const selected=process.env.PF_CHAIN_CASE,scope=process.env.PF_CHAIN_CASE_ROOT;assert(['P01','C01','C02'].includes(selected));assert(scope);assert.deepEqual(process.argv.slice(2),[]);
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const record=(name,data)=>fs.writeFileSync(path.join(scope,name+'.json'),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
test(selected+' actual event defeat/formal autosave/fresh formal Continue',async()=>{
 if(selected==='P01'){
  const {fixture}=require('./producer-fixture.cjs');let h;
  try{
   h=await fixture();const {G,observed:o,io}=h;assert.equal(o.final.outcome.code,4);assert.equal(o.final.outcome.commit,'applied');assert.equal(o.privateRouting,true);assert.equal(o.legacyCalls.length,0);assert.equal(Object.keys(o.final.appliedBattles).length,1);assert.equal(o.final.money,984);assert.equal(o.final.stats.blacked_out_count,1);assert.equal(o.final.stats.wild_battles_lost,1);assert.equal(o.final.stats.battle_money_lost,16);assert.equal(o.final.outcome.defeat.healed,true);
   assert.deepEqual(o.Freserves.map(r=>r.target),[{mapId:7,x:2,y:1,direction:4}]);assert.equal(o.final.mapId,7);assert.equal(o.final.pending,null);assert.equal(h.state().world.pendingReturn,null);assert.equal(h.state().party[0].status,'');assert(h.state().party[0].hp>1);assert(h.state().party[0].moves.every(m=>m.pp===m.maxpp));
   assert.equal(o.formalExecutors.length,1,'actual target executeAutosave exactly once');assert.equal(o.formalExecutors[0].map,7);assert.equal(o.formalExecutors[0].checkpoint,null);assert.deepEqual(o.formalSaveCalls,[{slot:0,map:7,checkpoint:null}]);assert.equal(h.saves.length,0,'old saveGame facade is never used');
   assert.deepEqual(o.worldAfterCreate.slice(o.worldPrefixAtStart.length),[65536,65536,32,32,32,32,32,32]);assert.deepEqual(o.worldCompletePrefix,o.worldAfterCreate);assert.equal(o.command357.length,1);assert.equal(o.command357[0].result,true);assert.equal(o.command357[0].error,undefined);assert.deepEqual(o.actualNativeRNG,[],'actual native Math.randomInt observer after final JsExtensions');
   const file=G.StorageManager.filePath('file0'),global=G.StorageManager.filePath('global');let saved,metadata;
   for(let i=0;i<40;i++){await new Promise(setImmediate);if(!fs.existsSync(file)||!fs.existsSync(global))continue;saved=await G.StorageManager.loadObject('file0');metadata=await G.StorageManager.loadObject('global');if(metadata[0])break;}
   assert(saved&&metadata?.[0]);const state=JSON.parse(saved.system._psGame.data);assert.deepEqual(JSON.parse(JSON.stringify(state)),JSON.parse(JSON.stringify(h.state())));assert.deepEqual(h.observed.final.appliedBattles,state.appliedBattles);assert.equal(saved.system._versionId,0);assert.equal(state.world.pendingReturn,null);assert.equal(state.money,984);assert.equal(state.stats.blacked_out_count,1);assert.equal(Object.keys(state.appliedBattles).length,1);io.assertPaths();
   assert.equal(state.schema, 12, 'new formal autosave is current schema');
   record('content',h.content);record('completed',{kind:'actual battle producer formal autosave',state,observed:o,fs:io.trace,files:{file0:{path:file,size:fs.statSync(file).size,sha256:sha(file)},global:{path:global,size:fs.statSync(global).size,sha256:sha(global)}},contentSHA256:sha(path.join(scope,'content.json')),worldDraws:h.draws,nativeDraws:h.nativeDraws});
  }catch(error){if(h)record('failure',{error:String(error.stack??error),state:h.state(),observed:h.observed,fs:h.io?.trace});throw error;}finally{h?.restore();}
 }else{
  const {fixture,flush}=require('./consumer-fixture.cjs');let h;
  try{
   const legacy = selected === 'C02';
   h=await fixture({legacy});const {G,observed:o}=h;await h.pump(()=>o.loadSuccess===1&&G.SceneManager._scene instanceof G.Scene_Map&&G.SceneManager._scene.isStarted()&&!G.$gamePlayer.isTransferring()&&!h.app.saveBlocked);
   const state=G.$gameSystem._psGame;assert.equal(h.loadScene._loadSuccess,true);assert.equal(G.$gameMap.mapId(),7);assert.deepEqual([G.$gamePlayer.x,G.$gamePlayer.y],[2,1]);assert.equal(state.world.pendingReturn,null);assert.equal(o.recoverCalls,0,'CPnull Continue never invokes F recover');assert.equal(o.saveGameCalls.length,0);assert.equal(o.originalAutosaves.length,0);assert.deepEqual(o.versions,[0,0]);assert.equal(G.PSState.lastLoadError,null);
   const {from, to, migrated} = G.$gameSystem._psSaveInfo;
   assert.deepEqual({from, to, migrated}, {from: legacy ? 11 : 12, to: 12, migrated: legacy});
   assert.equal(state.money,984);assert.equal(state.stats.blacked_out_count,1);assert.equal(Object.keys(state.appliedBattles).length,1);assert.deepEqual(JSON.parse(JSON.stringify(state)),h.expectedState,'formal restored game has no repeated settlement or state rewrite');assert.deepEqual(h.draws,o.beforeLoadDraws,'no additional business RNG on CPnull Continue');assert.deepEqual(h.nativeDraws,o.beforeNativeDraws,'no additional native RNG on CPnull Continue');
   const readyFullState=JSON.parse(JSON.stringify(state));const entries=o.entries.filter(x=>x.entry.mapId===7);assert.equal(entries.length,1);assert.equal(entries[0].entry.cause,'load');assert.equal(entries[0].entry.previousMapId,7);assert.equal(entries[0].entry.rebuilt,false);for(let i=0;i<12;i++){h.tick();await flush();}assert.equal(o.recoverCalls,0);assert.equal(G.$gameSystem._psGame.money,984);assert.deepEqual(h.draws,o.beforeLoadDraws);assert.deepEqual(h.nativeDraws,o.beforeNativeDraws);assert.equal(G.PSFlow.blackoutLoadRecoveryView().phase,'idle');assert.deepEqual(JSON.parse(JSON.stringify(G.$gameSystem._psGame)),readyFullState,'all GameState unchanged over 12 bounded frames');assert.deepEqual(o.replay.engineRNG,[]);assert.deepEqual(o.replay.nativeRNG,[]);assert.equal(o.replay.factories,0);assert.equal(o.replay.finishes,0);assert.equal(o.replay.grants,0);assert.equal(o.replay.receiving,0);assert.equal(h.sessions.length,0);assert.equal(o.saveGameCalls.length,0);assert.equal(o.originalAutosaves.length,0);
   const file=G.StorageManager.filePath('file0'),global=G.StorageManager.filePath('global');
   assert.equal(sha(file),h.sourceSHA256.file0);assert.equal(sha(global),h.sourceSHA256.global);
   assert(!h.io.trace.slice(h.loadTraceStart).some(row => ['writeFileSync','renameSync','unlinkSync'].includes(row.method)), 'CPnull Continue performs no physical save writes');
   h.io.assertPaths();record('completed',{kind:'new Node/VM/profile formal Scene_Load CPnull Continue',state,saveInfo:{from,to,migrated},sourceSHA256:h.sourceSHA256,observed:o,view:G.PSFlow.blackoutLoadRecoveryView(),point:[G.$gameMap.mapId(),G.$gamePlayer.x,G.$gamePlayer.y],fs:h.io.trace,files:{file0:{path:file,size:fs.statSync(file).size,sha256:sha(file)},global:{path:global,size:fs.statSync(global).size,sha256:sha(global)}},draws:h.draws,nativeDraws:h.nativeDraws,loadSuccessFlag:h.loadScene._loadSuccess});
  }catch(error){if(h)record('failure',{error:String(error.stack??error),snapshot:h.snapshot()});throw error;}finally{h?.restore();}
 }
});
