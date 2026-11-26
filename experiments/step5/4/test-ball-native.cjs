'use strict';
// Full driver reachability through real compiled plugins/App/Gen8 Session. Synthetic raster/audio host, NOT NW.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {createVictoryDriverHost}=require('./victory-music-driver-host.cjs');const ROOT=path.resolve(__dirname,'../../..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');let temp,plugins,driverText,entryText,mod;
function exact(code, old, replacement) {
 assert.equal(code.split(old).length,2,'expected fixed test-driver source anchor');
 return code.replace(old,replacement);
}
// No persisted product source changes. The real native historical driver keeps its
// original expectations, while these two explicit synthetic registrations are separate.
function trialDriver(code, mode) {
 if(mode==='ordinary'){
  code=exact(code,"    } else choose(currentCase === 'B02'","    } else if(currentCase==='B02'&&h.event?.args[4]==='caught') {\n      choose('B02-natural-caught-absorb',phase==='absorb'&&progress>.2&&progress<.8&&!!target&&target.scale.x>0&&target.scale.x<1);\n    } else choose(currentCase === 'B02'");
  const branch="await throwBall(h, name); eq(h.event.args[4], outcome, 'actual ordinary negative result');";
  code=exact(code,branch,`${branch.slice(0,branch.indexOf(' eq('))}
      if(id==='B02'&&h.event.args[4]==='caught'){
        // Keep authentic eligibility and actual Gen8 result. Never claim the escape burst
        // was seen here; only the separate positively stamped B02 proves that branch.
        await wait(()=>h.scene.ballFeedbackState()?.closed,'genuine natural catch hide');
        assert(h.seen.size===1&&h.seen.has('B02-natural-caught-absorb'),'actual absorb observed');
        assert(h.session.finished&&h.scene.captureMelodyState()?.completed&&!ball(h.scene)&&!foe(h.scene),'natural capture terminal presentation');
        eq(flow.game(),h.before,'no capture installation before explicit confirmation'); await leave(h);
        eq(flow.game(),h.before,'natural B02 catch discarded after owned test cleanup');
        return {event:h.event,rows:h.rows,logs:h.logs,branch:'natural-caught-and-uncommitted'};
      }
      eq(h.event.args[4], outcome, 'actual observed negative result');`);
  code=exact(code,"[...PLAN.renderStages].sort(), 'all seven key stage pixel witnesses'","PLAN.renderStages.map(x=>x==='B02-burst'&&details.cases.B02.value.event.args[4]==='caught'?'B02-natural-caught-absorb':x).sort(), 'actual seven ordinary render witnesses'");
 }else{
  assert.equal(mode,'stamped-b02');
  code=exact(code,"eq(ids, ['B01', 'B02', 'B03', 'B04', 'B05'], 'five fixed scenarios');","eq(ids, ['B02'], 'separate positively scoped escape only');");
  code=exact(code,"    currentCase = id; const start ","    if(!ids.includes(id))return;\n    currentCase = id; const start ");
  code=exact(code,"    flow.fast = true; flow.receiveOptions","    flow.fast = false; flow.receiveOptions");
 }
 return code;
}
async function buildTrial(mode, chosen, stage) {
 const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));
 const historical=require('./ball-feedback-native-plan.json');assert.equal(historical.productCommit,'f0b54da03b1c7951d5fcc23744cab8f3f29c74b9');
 const used={...historical,productCommit:mode==='ordinary'?'SYNTHETIC_CONTROL_ONLY_CURRENT_WORKTREE':'SYNTHETIC_SCOPED_B02_ONLY_NOT_ORDINARY',productPlugins:Object.fromEntries(Object.entries(chosen).map(([name,text])=>[name,hash(text)])),
  ...(stage?{groups:[{name:'separate-stamped-b02-only',ids:['B02']}],renderStages:['B02-burst']}:{})};
 const out=fs.mkdtempSync(path.join(temp,'driver-'+mode+'-'));
 await vite.build({configFile:false,root:ROOT,logLevel:'error',plugins:[
  {name:'explicit-synthetic-current-ball-product',enforce:'pre',load(id){if(id===path.join(ROOT,'experiments/step5/4/ball-feedback-native-plan.json'))return JSON.stringify(used);}},
  {name:'explicit-test-only-ball-driver',enforce:'pre',transform(code,id){
   if(id!==path.join(ROOT,'src/plugins/flowtest/d2-ball-feedback.ts'))return;
   code=trialDriver(code,mode);
   if(process.env.PF_BALL_NATIVE_MUTATION&&mode==='ordinary'){
    assert.equal(process.env.PF_BALL_NATIVE_MUTATION,'no-pixel-gate');
    return exact(code,"assert(different > 0, 'actual composed ball pixels differ from hidden at ' + label);","assert(true, 'removed pixel witness gate');");
   }
   return code;
  }}],build:{outDir:out,emptyOutDir:false,minify:false,lib:{entry:path.join(ROOT,'src/plugins/flowtest/d2-ball-feedback.ts'),formats:['cjs'],fileName:()=> 'entry.cjs'}}});
 const driver=path.join(out,'entry.cjs');return {mod:require(driver),text:fs.readFileSync(driver,'utf8'),plugins:chosen,stage};
}
const scoped=[];
test.before(async()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-ball-native-'));plugins={};
 for(const name of ['PS_BattleFlow','PS_SaveState','PS_Evolution','PS_Management','PS_BattleFlowTest']){
  const out=path.join(temp,name),r=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',out],{cwd:ROOT,env:{...process.env,RR_PLUGIN:name},encoding:'utf8'});
  assert.equal(r.status,0,r.stdout+r.stderr);
  const text=fs.readFileSync(path.join(out,name+'.js'),'utf8');assert(!text.includes('PF-SCOPED-IIFE-v1 '),'ordinary runtime must be unstamped');if(name==='PS_BattleFlowTest')entryText=text;else plugins[name]=text;
 }
 const normal=await buildTrial('ordinary',plugins);mod=normal.mod;driverText=normal.text;
});
async function exactEscapeTrial(){
 // No re-roll or optional seed branch: these legitimately marked bytes are used only in the separate fixture.
 const stage=require('../../../scripts/tests/battle-defeat-f-isolated.cjs').prepare(ROOT,fs.mkdtempSync(path.join(temp,'b02-stamped-')));
 scoped.push(stage);const roots=require('node:vm'), opts={
  frameQueuedScenes:true,returnMapCounter:true,ordinaryAwardInput:true,scopedStatusStage:stage,beforeProduct(G){
   assert.equal(G.nw,undefined);
   const regular=G.require;
   const request=id=>id==='node:fs'||id==='node:path'?require(id):id==='os'?{homedir(){assert.fail('scoped B02 cannot access owner HOME');}}:regular(id);
   request.resolve=id=>id==='./js/plugins.js'?stage.manifest:regular.resolve(id);
   G.require=request;
   G.nw={App:{argv:[...stage.argv],dataPath:stage.profile,manifest:{name:'Scoped-B02-Gen8'}}};
   G.process={platform:process.platform};
   G.StorageManager={fileDirectoryPath(){assert.fail('B02 isolated storage unbound');}};
   roots.runInContext(fs.readFileSync(stage.artifacts.PS_SaveLocation,'utf8'),G,{filename:'stamped-PS_SaveLocation.js'});
   assert.equal(G.StorageManager.fileDirectoryPath(),stage.saves+path.sep);
  }};
 stage.verify();
 const chosen={...plugins,PS_BattleFlow:fs.readFileSync(stage.artifacts.PS_BattleFlow,'utf8'),PS_SaveLocation:fs.readFileSync(stage.artifacts.PS_SaveLocation,'utf8')};
 return {opts,...await buildTrial('stamped-b02',chosen,stage)};
}
test.after(()=>{for(const stage of scoped)stage.verify();if(temp)fs.rmSync(temp,{recursive:true,force:true});});
function host(options={},trial=null){const PLAN=(trial?.mod??mod).ballFeedbackNativePlan;
 const h=createVictoryDriverHost({ROOT,work:temp,plugins:trial?.plugins??plugins,driverText:trial?.text??driverText,entryText,PLAN,options:trial?{...trial.opts,...options}:options}),G=h.G;
 // Add explicit controlled raster/lifecycle behavior only in this new fixture.
 G.Bitmap.prototype.fillRect=function(...args){(this.rects??=[]).push(args);};G.Bitmap.prototype.destroy=function(){this.baseTexture=null;};G.Sprite.prototype.destroy=function(){this.destroyed=true;};
 G.Bitmap.snap=s=>{const visible=s.children.filter(x=>x._psBallFeedback&&x.visible&&x.opacity>0&&x.bitmap?.rects?.length===3);return{width:816,height:624,getPixel:(x,y)=>options.noPixels?'#000000':visible.some(b=>Math.abs(x-b.x)<=12*b.scale.x&&Math.abs(y-b.y)<=12*b.scale.y)?'#d54c48':'#000000',canvas:{toDataURL:()=> 'data:image/png;base64,'+Buffer.from('SYNTHETIC_CONTROL_NOT_NATIVE_PNG').toString('base64')},destroy(){}};};
 const input=JSON.parse(fs.readFileSync(h.inputFile));input.assets=input.assets.filter(a=>PLAN.requiredAssets.includes(a.path));const rel='audio/me/'+PLAN.prefix+'short.ogg',file=path.join(h.w.root,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'SYNTHETIC_CONTROL_NOT_NATIVE_OGG');input.assets.push({path:rel,kind:'me',logicalName:PLAN.prefix+'short',sha256:hash(fs.readFileSync(file))});fs.writeFileSync(h.inputFile,JSON.stringify(input));const oldArg=h.p.arg;h.p.arg=k=>k==='ps-ball-input'?h.inputFile:oldArg(k);
 if(options.badProduct){input.productPlugins={...input.productPlugins,PS_BattleFlow:'0'.repeat(64)};fs.writeFileSync(h.inputFile,JSON.stringify(input));}
 return h;}
test('complete synthetic current-product Title to five-case real Gen8/compiled Scene chain is reachable with natural delays',async()=>{const traces=[];const h=host({battleReadyDelayFrames:12,delayStart:10,returnMapCounter:true,ordinaryAwardInput:true,frameQueuedScenes:true,ordinaryReceivingInput:true,onOrdinarySample(row){if(traces.length&&JSON.stringify({...row,frame:0})===JSON.stringify({...traces.at(-1),frame:0}))return;traces.push(row);if(traces.length>8)traces.shift();}});try{await mod.runD2BallFeedback(h.p);}catch(err){console.error('ORDINARY_BALL_STALL',JSON.stringify(traces));throw err;}assert.deepEqual(h.report.results.map(r=>[r.id,r.status]),['B01','B02','B03','B04','B05'].map(id=>[id,'pass']));const d=h.report.ballFeedbackNative;assert.equal(d.nativeClaim,'NOT_SELF_QUALIFIED');assert.equal(d.cleanupComplete,true);assert.deepEqual(d.notRunIDs,[]);assert.equal(d.renders.length,7);assert(d.renders.every(r=>r.differentPixels>0&&fs.existsSync(path.join(h.w.root,r.file))));assert(d.cases.B01.value.growth.length>0);const actualB02=d.cases.B02.value.event.args[4];assert(['caught','escaped'].includes(actualB02));assert(d.renders.some(r=>r.label===(actualB02==='caught'?'B02-natural-caught-absorb':'B02-burst')));console.log('ORDINARY_B02_OBSERVED '+actualB02);const inputs=h.report.ordinaryReceivingInputs;assert(inputs.some(r=>r.key==='ok'&&r.role==='nickname'&&r.choice==='no'&&/^receive:/.test(r.owner)),'normal nickname decision made by visible player input');assert.equal(h.w.flow.game().party.length,1,'last cancelled root did not install capture');});
test('missing actual pixel differences fail at first intermediate frame, stop cases and restore hooks',async()=>{const h=host({noPixels:true}),before=[h.G.SceneManager.updateScene,h.G.PluginManager.parameters];await assert.rejects(mod.runD2BallFeedback(h.p),/actual composed ball pixels/);assert.deepEqual(h.report.results.map(r=>[r.id,r.status]),[['B01','fail']]);assert.deepEqual(h.report.ballFeedbackNative.notRunIDs,['B02','B03','B04','B05']);assert.equal(h.report.ballFeedbackNative.cleanupComplete,true);assert.equal(h.G.SceneManager.updateScene,before[0]);assert.equal(h.G.PluginManager.parameters,before[1]);assert.equal(h.w.flow._app.saveBlocked,false);});
test('different actual product identity refuses before cases or observer installation',async()=>{const h=host({badProduct:true}),before=h.G.SceneManager.updateScene;await assert.rejects(mod.runD2BallFeedback(h.p),/product plugin identities/);assert.equal(h.report.results.length,0);assert.equal(h.G.SceneManager.updateScene,before);});
test('mutated production payload is rejected even when its report input claims the original product',async()=>{const old=plugins.PS_BattleFlow,marker='if (!frame.resultReady) return false;';assert.equal(old.split(marker).length,2);plugins.PS_BattleFlow=old.replace(marker,'if (false) return false;');try{const h=host();const input=JSON.parse(fs.readFileSync(h.inputFile));input.productPlugins.PS_BattleFlow=mod.ballFeedbackNativePlan.productPlugins.PS_BattleFlow;fs.writeFileSync(h.inputFile,JSON.stringify(input));await assert.rejects(mod.runD2BallFeedback(h.p),/actual product PS_BattleFlow/);}finally{plugins.PS_BattleFlow=old;}});

test('independently stamped B02 verifies one real deterministic Gen8 escape and burst, not ordinary',async()=>{
 const trial=await exactEscapeTrial(),h=host({},trial);
 // Prove the real plugin accepts its scoped RNG on this same profile and storage.
 const flow=h.G.PSFlow,before=flow.rng;let hits=0;
 flow.rng=n=>{hits++;assert.equal(n,8);return 3;};
 assert.equal(flow.random(8),3);assert.equal(hits,1);flow.rng=before;
 await trial.mod.runD2BallFeedback(h.p);
 const d=h.report.ballFeedbackNative,v=d.cases.B02.value;
 assert.deepEqual(h.report.results.map(x=>[x.id,x.status]),[['B02','pass']]);
 assert.equal(v.event.args[4],'escaped');assert.equal(v.event.args[2],'pokeball');
 assert.deepEqual(d.renders.map(x=>x.label),['B02-burst']);assert(d.renders[0].differentPixels>0);assert(v.rows.length>0);
 assert(d.cleanupComplete&&!d.remainingRootLocked);assert.equal(h.G.PSFlow.game().party.length,1);trial.stage.verify();
 console.log('STAMPED_B02_OBSERVED '+JSON.stringify({outcome:v.event.args[4],shakes:v.event.args[5],seed:trial.mod.ballFeedbackNativePlan.seed,storageAttested:h.G.StorageManager.fileDirectoryPath()===trial.stage.saves+path.sep}));
});
test('independently stamped B02 escape without a real composed burst rejects and retires its owner',async()=>{
 const trial=await exactEscapeTrial(),h=host({noPixels:true},trial);
 await assert.rejects(trial.mod.runD2BallFeedback(h.p),/actual composed ball pixels.*B02-burst/);
 assert.deepEqual(h.report.results.map(x=>[x.id,x.status]),[['B02','fail']]);assert(h.report.ballFeedbackNative.cleanupComplete);
 assert(!h.G.PSFlow._app.saveBlocked);trial.stage.verify();
});
