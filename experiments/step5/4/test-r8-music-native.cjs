'use strict';
// SYNTHETIC_CONTROL. Real compiled Scene/evolution/AudioManager and Gen8 App/
// Session; native nodes, clock, rendering and keyboard are controlled doubles.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {createR8DriverHost}=require('./r8-music-driver-host.cjs');
const ROOT=path.resolve(__dirname,'../../..');let temp,plugins,driverText,mod;
test.before(async()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-r8-native-'));plugins={};
 for(const name of ['PS_BattleFlow','PS_SaveState','PS_Evolution']){
  const out=path.join(temp,name),r=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',out],{cwd:ROOT,env:{...process.env,RR_PLUGIN:name},encoding:'utf8'});
  assert.equal(r.status,0,r.stdout+r.stderr);plugins[name]=fs.readFileSync(path.join(out,name+'.js'),'utf8');
 }
 const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));
 await vite.build({configFile:false,root:ROOT,logLevel:'error',build:{outDir:path.join(temp,'driver'),emptyOutDir:false,minify:false,lib:{entry:path.join(ROOT,'src/plugins/flowtest/d2-r8-music.ts'),formats:['cjs'],fileName:()=> 'entry.cjs'}}});
 driverText=fs.readFileSync(path.join(temp,'driver/entry.cjs'),'utf8');mod=require(path.join(temp,'driver/entry.cjs'));
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
function host(options={}){return createR8DriverHost({ROOT,work:temp,plugins,driverText,PLAN:mod.r8MusicNativePlan,options});}
test('full six-case driver reaches formal UI normal/cancel/technical, next battle and real native-method sequence controls',{timeout:30000},async()=>{
 const h=host();await mod.runD2R8Music(h.p);
 assert.deepEqual(h.report.results.map(r=>[r.id,r.status]),['R801','R802','R803','R804','R805','R806'].map(id=>[id,'pass']));
 assert.deepEqual(h.report.r8MusicNative.notRunIDs,[]);assert.equal(h.report.r8MusicNative.cleanupComplete,true);assert.equal(h.report.r8MusicNative.nativeClaim,'NOT_SELF_QUALIFIED');
 assert.equal(h.report.r8MusicNative.sequenceScope,'active library track+silence restart only');
 for(const id of ['R801','R802','R803']){assert(h.report.r8MusicNative.cases[id].value.rootFrames>60);assert.equal(h.report.r8MusicNative.events.filter(e=>e.case===id&&e.kind==='independent-prebattle-memo').length,2,'each formal outcome checks the next battle too');}
 assert(h.report.r8MusicNative.events.some(e=>e.kind==='native-source-start'));assert(h.report.r8MusicNative.cases.R806.value.stopCalls>=2);
 assert(h.sourceNodes.every(n=>n.start===h.sourceStart));assert(h.w.created.every(b=>b.play===h.bufferMethods.play&&b.destroy===h.bufferMethods.destroy));
 if(process.env.PF_R8_CONTROL_REPORT){
  const out=path.resolve(process.env.PF_R8_CONTROL_REPORT);assert(path.relative(ROOT,out).startsWith('..'),'control evidence outside tracked tree');
  const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
  fs.writeFileSync(out,JSON.stringify({scope:'SYNTHETIC_CONTROL_NODE_VM_NOT_NATIVE',head:spawnSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).stdout.trim(),plugins:Object.fromEntries(Object.entries(plugins).map(([k,v])=>[k,hash(v)])),controlModuleSHA256:hash(driverText),report:h.report},null,2)+'\n',{flag:'wx'});
 }
});
test('seek oracle is circular and rejects invalid actual-clock samples',()=>{
 assert(Math.abs(mod.r8SeekError(1.9,0.1,2)-0.2)<1e-10);assert.equal(mod.r8SeekError(2.25,0.25,2),0);
 for(const v of [[NaN,0,2],[0,Infinity,2],[0,0,0],[0,0,-1]])assert.throws(()=>mod.r8SeekError(...v));
});
test('payload mismatch refuses before any observer or audio side effect',async()=>{
 const h=host({badIdentity:true}),before=[h.A.createBuffer,h.G.PluginManager.parameters,h.M.updateScene,h.context.createBufferSource];
 await assert.rejects(mod.runD2R8Music(h.p),/actual R8 driver/);assert.deepEqual([h.A.createBuffer,h.G.PluginManager.parameters,h.M.updateScene,h.context.createBufferSource],before);assert.equal(h.w.created.length,0);
});
test('cold Title and delayed Scene.start reach all six cases without treating allocated windows as ready',async()=>{
 const h=host({delayStart:10});await mod.runD2R8Music(h.p);assert.equal(h.report.results.length,6);assert(h.report.r8MusicNative.events.find(e=>e.kind==='source-play').frame>10);
});
for(const [options,pattern]of [[{badDuration:true},/frozen media duration/],[{stuckClock:true},/context advances/],[{badSourceOffset:true},/actual SourceNode start/]])test('native evidence control rejects '+JSON.stringify(options),async()=>{
 const h=host(options),before=[h.A.createBuffer,h.M.updateScene,h.context.createBufferSource];await assert.rejects(mod.runD2R8Music(h.p),pattern);
 assert.deepEqual(h.report.results.map(r=>[r.id,r.status]),[['R801','fail']]);assert.deepEqual(h.report.r8MusicNative.notRunIDs,['R802','R803','R804','R805','R806']);
 assert.deepEqual([h.A.createBuffer,h.M.updateScene,h.context.createBufferSource],before);assert(h.sourceNodes.every(n=>n.start===h.sourceStart));
});
test('falsy primary rejection is retained and cannot be replaced by cleanup success',async()=>{
 const h=host(),before=[h.A.createBuffer,h.M.updateScene];h.p.waitFor=async()=>{throw 0;};
 await assert.rejects(mod.runD2R8Music(h.p),e=>e===0);assert.equal(h.report.r8MusicNative.primaryError,'0');assert.equal(h.report.results[0].status,'fail');assert.deepEqual([h.A.createBuffer,h.M.updateScene],before);
});
test('independent host seek rejects a corrupted product memo rather than trusting DTO as its own oracle',async()=>{
 const h=host(),read=h.w.flow.musicState;h.w.flow.musicState=function(...a){const s=read.apply(this,a);if(s?.phase==='battle'&&s.player?.memo?.track?.name===mod.r8MusicNativePlan.prefix+'world')s.player.memo.position+=0.5;return s;};
 await assert.rejects(mod.runD2R8Music(h.p),/memo seek matches independent/);assert.equal(h.report.results[0].status,'fail');
});
test('unexpected real host successor during pending formal evolution is preserved on first failure',async()=>{
 const h=host(),update=h.M.updateScene;let foreign;
 h.M.updateScene=function(...a){const v=update.apply(this,a);if(!foreign&&h.G.PSEvolution.current()?.timeline?.phase==='animation'){h.A.playBgm({name:'Authored',volume:100,pitch:100,pan:0});foreign=h.A._bgmBuffer;}return v;};
 await assert.rejects(mod.runD2R8Music(h.p),/music changed while the formal root/);assert(foreign);assert.equal(h.A._bgmBuffer,foreign);assert.equal(foreign.destroys,0);assert.equal(h.report.r8MusicNative.cleanupRoot,'pending-domain-left-locked');
 assert.equal(h.report.results.length,1);assert.equal(foreign.play,h.bufferMethods.play);assert.equal(foreign.destroy,h.bufferMethods.destroy);
});
test('a refused partial formal decision stays locked, fails the case and never receives automatic retry/technical ACK',async()=>{
 const h=host(),f=h.w.flow,resolve=f.resolveEvolution,calls=[];f.resolveEvolution=function(t,r,d){calls.push(d.kind);if(d.kind==='complete')return {status:'refused',reason:'controlled-partial'};return resolve.call(this,t,r,d);};
 await assert.rejects(mod.runD2R8Music(h.p),/controlled-partial/);assert.deepEqual(calls,['complete']);assert(f.app().saveBlocked&&f.app().pendingEvolution);assert.equal(h.report.r8MusicNative.cleanupRoot,'pending-domain-left-locked');assert.equal(h.report.results.length,1);
});
test('cleanup failure is separate and does not mask the first native-qualification failure',async()=>{
 const h=host({badDuration:true});h.w.hook=(kind,b)=>{if(kind==='play'&&String(b._url).endsWith('/world.ogg'))h.A.stopBgm=function(){throw Error('controlled-cleanup-error');};};
 await assert.rejects(mod.runD2R8Music(h.p),/frozen media duration/);assert.match(h.report.r8MusicNative.primaryError,/frozen media duration/);assert(h.report.r8MusicNative.cleanupErrors.some(e=>/controlled-cleanup-error/.test(e.error)));assert.equal(h.report.r8MusicNative.cleanupComplete,false);
});
test('fixture compilation failure before the first case still restores all installed observers and preserves falsy primary',async()=>{
 const h=host(),E=h.p.api(),before=[h.A.createBuffer,h.M.updateScene,h.G.PluginManager.parameters];
 h.p.api=()=>({...E,contentCompile:{...E.contentCompile,compileContent(){throw false;}}});
 await assert.rejects(mod.runD2R8Music(h.p),e=>e===false);
 assert.equal(h.report.r8MusicNative.primaryError,'false');assert.equal(h.report.results.length,0);assert.equal(h.report.r8MusicNative.notRunIDs.length,6);assert.deepEqual([h.A.createBuffer,h.M.updateScene,h.G.PluginManager.parameters],before);
});
test('observer installation failure is also inside primary/cleanup protection',async()=>{
 const h=host(),before=[h.A.createBuffer,h.M.updateScene,h.G.PluginManager.parameters],volume=h.A.bgmVolume;
 Object.defineProperty(h.A,'bgmVolume',{configurable:true,get:()=>volume,set(){throw 0;}});
 await assert.rejects(mod.runD2R8Music(h.p),e=>e===0);assert.equal(h.report.r8MusicNative.primaryError,'0');assert.equal(h.report.results.length,0);assert(h.report.r8MusicNative.cleanupErrors.some(e=>e.name==='restore volume'));assert.deepEqual([h.A.createBuffer,h.M.updateScene,h.G.PluginManager.parameters],before);
});
for(const [variant,plugin,needle,replacement,failedID,pattern]of [
 ['evolution','PS_Evolution','if (!(!!this.request.battleOp','if (!(false && !!this.request.battleOp','R801',/music changed while the formal root/],
 ['memo','PS_BattleFlow','const track = audio?._bgmSequence || audio?._pendingBgmSequence ? audio.saveBgm() : audio?._currentBgm;','const track = audio?._currentBgm;','R804',/independently saved native sequence/],
 ['none-strict','PS_BattleFlow','if (lost() || !stoppedChannel(none)) throw interrupted;','if (lost() || audio._bgmBuffer || audio._currentBgm || audio._bgmSequence || audio._pendingBgmSequence) throw interrupted;','R805',/same None permits sequence return/],
 ['none-loose','PS_BattleFlow','audio._currentBgm === none && none?.name === ""','audio._currentBgm?.name === ""','R806',/never publishes over successor/]
])test('actual product regression is caught by complete driver: '+variant,async()=>{
 const bytes=plugins[plugin];assert.equal(bytes.split(needle).length-1,1);const changed=bytes.replace(needle,replacement),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 // Match the temporary test-module plan to the mutant payload so the assertion
 // exercises business/lifecycle evidence rather than failing the hash header.
 const expected=mod.r8MusicNativePlan.productPlugins[plugin];assert.equal(driverText.split(expected).length-1,1);const text=driverText.replace(expected,hash(changed)),file=path.join(temp,'driver',variant+'.cjs');fs.writeFileSync(file,text);const m=require(file);
 const h=createR8DriverHost({ROOT,work:temp,plugins:{...plugins,[plugin]:changed},driverText:text,PLAN:m.r8MusicNativePlan});
 await assert.rejects(m.runD2R8Music(h.p),pattern);assert.equal(h.report.results.at(-1).id,failedID);assert.equal(h.report.results.at(-1).status,'fail');assert(h.report.results.slice(0,-1).every(r=>r.status==='pass'));
 console.log(JSON.stringify({variant,plugin,before:hash(bytes),after:hash(changed),failedID,earlierPass:h.report.results.length-1,temporaryPlanPinPatched:true,native:'NOT_RUN'}));
});
