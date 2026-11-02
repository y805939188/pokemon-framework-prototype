'use strict';
// SYNTHETIC_CONTROL: production three plugins + real Gen8 App/Session, controlled native nodes/render/input.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const {createVictoryDriverHost}=require('./victory-music-driver-host.cjs');
const ROOT=path.resolve(__dirname,'../../..');let temp,plugins,driverText,entryText,mod;
test.before(async()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-victory-native-'));plugins={};
 for(const name of ['PS_BattleFlow','PS_SaveState','PS_Evolution','PS_BattleFlowTest']){
  const out=path.join(temp,name),r=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',out],{cwd:ROOT,env:{...process.env,RR_PLUGIN:name},encoding:'utf8'});
  assert.equal(r.status,0,r.stdout+r.stderr);const text=fs.readFileSync(path.join(out,name+'.js'),'utf8');if(name==='PS_BattleFlowTest')entryText=text;else plugins[name]=text;
 }
 const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));
 await vite.build({configFile:false,root:ROOT,logLevel:'error',build:{outDir:path.join(temp,'driver'),emptyOutDir:false,minify:false,lib:{entry:path.join(ROOT,'src/plugins/flowtest/d2-victory-music.ts'),formats:['cjs'],fileName:()=> 'entry.cjs'}}});
 driverText=fs.readFileSync(path.join(temp,'driver/entry.cjs'),'utf8');mod=require(path.join(temp,'driver/entry.cjs'));
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
function host(options={}){return createVictoryDriverHost({ROOT,work:temp,plugins,driverText,entryText,PLAN:mod.victoryMusicNativePlan,options});}
test('compiled entry retains formal evolution presenter only for the explicitly added native mode',()=>{
 const stop=Symbol('prefix'),evo={automatic:true},M={};Object.defineProperty(M,'isGameActive',{set(){throw stop;}});
 const G={window:{PSEvolution:evo},nw:{App:{argv:['--ps-flow-test=d2-victory-music','--ps-sound']}},SceneManager:M};
 try{vm.runInNewContext(entryText,G);}catch(e){if(e!==stop)throw e;}assert.equal(evo.automatic,true);
});
test('entire frozen normal six-case driver reaches actual Gen8 win/lose/run, formal evolution and sequence return',{timeout:30000},async()=>{
 const h=host({battleReadyDelayFrames:12,delayStart:10});await mod.runD2VictoryMusic(h.p);
 assert.deepEqual(h.report.results.map(r=>[r.id,r.status]),['V01','V02','V03','V04','V05','V06'].map(id=>[id,'pass']));
 assert.deepEqual(h.report.victoryMusicNative.notRunIDs,[]);assert.equal(h.report.victoryMusicNative.nativeClaim,'NOT_SELF_QUALIFIED');assert.equal(h.report.victoryMusicNative.cleanupComplete,true);
 assert(h.report.victoryMusicNative.cases.V05.value.rootFrames>60);assert(h.report.victoryMusicNative.events.some(e=>e.kind==='native-source-start'));
 assert.equal(h.report.victoryMusicNative.events.filter(e=>e.kind==='initial-title-handoff').length,1);
 assert(h.sourceNodes.every(n=>n.start===h.sourceStart));assert(h.w.created.every(b=>b.play===h.bufferMethods.play&&b.destroy===h.bufferMethods.destroy));
});
test('actual identity mismatch refuses before installing observers or starting a case',async()=>{
 const h=host({badIdentity:true}),before=[h.A.createBuffer,h.G.PluginManager.parameters,h.M.updateScene];
 await assert.rejects(mod.runD2VictoryMusic(h.p),/actual victory BGM driver/);assert.deepEqual([h.A.createBuffer,h.G.PluginManager.parameters,h.M.updateScene],before);assert.equal(h.report.results.length,0);
});
test('omitting actual product cue fails the first normal case and leaves the other five NOT_RUN',async()=>{
 const h=host();h.w.flow._victoryBattleMusic=()=>{};
 await assert.rejects(mod.runD2VictoryMusic(h.p),/actual victory registration/);
 assert.deepEqual(h.report.results.map(r=>[r.id,r.status]),[['V01','fail']]);assert.deepEqual(h.report.victoryMusicNative.notRunIDs,['V02','V03','V04','V05','V06']);
});
test('non-advancing simulated native context cannot qualify playback and preserves failure cleanup',async()=>{
 const h=host({stuckClock:true}),before=[h.A.createBuffer,h.M.updateScene];
 await assert.rejects(mod.runD2VictoryMusic(h.p),/context advances/);assert.deepEqual([h.A.createBuffer,h.M.updateScene],before);assert.equal(h.report.results.length,1);assert.equal(h.report.results[0].status,'fail');
});
