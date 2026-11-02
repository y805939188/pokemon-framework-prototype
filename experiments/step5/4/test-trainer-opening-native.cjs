'use strict';
// Synthetic raster/clock/input with actual compiled Scene/App/Gen8; not native qualification.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {createVictoryDriverHost}=require('./victory-music-driver-host.cjs');
const ROOT=path.resolve(__dirname,'../../..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
let temp,plugins,entryText,driverText,mod;
test.before(async()=>{
  temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-opening-native-'));plugins={};
  for(const name of ['PS_BattleFlow','PS_SaveState','PS_Evolution','PS_BattleFlowTest']){
    const out=path.join(temp,name),r=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',out],{cwd:ROOT,env:{...process.env,RR_PLUGIN:name},encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
    const code=fs.readFileSync(path.join(out,name+'.js'),'utf8');if(name==='PS_BattleFlowTest')entryText=code;else plugins[name]=code;
  }
  const historical=require('./trainer-opening-native-plan.json'),productRuntime={...historical.productRuntime};
  for(const [name,code]of Object.entries(plugins))productRuntime['js/plugins/'+name+'.js']=hash(code);
  for(const name of ['engine','production'])productRuntime['js/engine/build/'+name+'.cjs']=hash(fs.readFileSync(path.join(ROOT,'js/engine/build',name+'.cjs')));
  const synthetic={...historical,productCommit:'SYNTHETIC_CONTROL_ONLY_CURRENT_WORKTREE',productRuntime},vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));
  await vite.build({configFile:false,root:ROOT,logLevel:'error',plugins:[{name:'explicit-synthetic-opening-product',enforce:'pre',load(id){if(id===path.join(ROOT,'experiments/step5/4/trainer-opening-native-plan.json'))return JSON.stringify(synthetic);}},{name:'opening-pixel-mutation',enforce:'pre',transform(code,id){if(process.env.PF_OPENING_NATIVE_MUTATION&&id===path.join(ROOT,'src/plugins/flowtest/d2-trainer-opening.ts')){assert.equal(process.env.PF_OPENING_NATIVE_MUTATION,'no-arrow-pixel-gate');const marker="assert(textPixels > 0 && arrowPixels > 0, 'actual text window and arrow composed pixels');";assert.equal(code.split(marker).length,2);return code.replace(marker,"assert(textPixels > 0, 'removed arrow pixel gate');");}}}],build:{outDir:path.join(temp,'driver'),emptyOutDir:false,minify:false,lib:{entry:path.join(ROOT,'src/plugins/flowtest/d2-trainer-opening.ts'),formats:['cjs'],fileName:()=> 'entry.cjs'}}});
  driverText=fs.readFileSync(path.join(temp,'driver/entry.cjs'),'utf8');mod=require(path.join(temp,'driver/entry.cjs'));
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
function host(options={}){
  const PLAN=mod.trainerOpeningNativePlan,h=createVictoryDriverHost({ROOT,work:temp,plugins,driverText,entryText,PLAN,options:{...options,productionTranslator:true}}),G=h.G;
  const init=G.Window_Base.prototype.initialize;
  G.Window_Base.prototype.initialize=function(...args){init.apply(this,args);this.visible=true;this.openness=255;this._pauseSignSprite={visible:true,alpha:1};};
  G.Bitmap.snap=s=>{const visible=s._log.visible,arrow=s._log._pauseSignSprite.visible;return({width:816,height:624,getPixel:(x,y)=>{
    if(options.noPixels||!visible)return '#000000';
    if(x>=400&&x<424&&y>=380&&y<404&&!options.noArrowPixels&&arrow)return '#ff0000';
    return y>=140&&y<170?'#ffffff':'#000000';
  },canvas:{toDataURL:()=> 'data:image/png;base64,'+Buffer.from('SYNTHETIC_OPENING_NOT_NATIVE_PNG').toString('base64')},destroy(){}});};
  const input=JSON.parse(fs.readFileSync(h.inputFile));input.productRuntime=PLAN.productRuntime;
  for(const name of ['engine','production']){const rel='js/engine/build/'+name+'.cjs',f=path.join(h.w.root,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.copyFileSync(path.join(ROOT,rel),f);}
  if(options.badIdentity)input.productRuntime={...input.productRuntime,'js/engine/build/production.cjs':'0'.repeat(64)};
  fs.writeFileSync(h.inputFile,JSON.stringify(input));const arg=h.p.arg;h.p.arg=k=>k==='ps-opening-input'?h.inputFile:arg(k);
  return h;
}
test('complete four ordinary opening paths from cold Title through actual bilingual Scene, pause, send-outs and cancel',async()=>{
  const h=host({battleReadyDelayFrames:12,delayStart:10}),start=h.G.Scene_PSBattle.prototype.start;await mod.runD2TrainerOpening(h.p);const d=h.report.trainerOpeningNative;
  assert.deepEqual(h.report.results.map(r=>[r.id,r.status]),['O01','O02','O03','O04'].map(id=>[id,'pass']));assert.equal(d.nativeClaim,'NOT_SELF_QUALIFIED');assert.equal(d.renders.length,6);assert(d.renders.every(r=>r.textPixels>0&&r.arrowPixels>0&&r.hiddenFirstPortraits&&r.installs===0));
  assert.deepEqual(d.renders.map(r=>r.id),mod.trainerOpeningNativePlan.renderStages);assert.deepEqual(d.notRunIDs,[]);assert(d.cleanupComplete&&!d.remainingRootLocked);assert(Object.values(d.cases).every(c=>c.installs.length===0&&c.returnedToMap&&c.beforeSHA256===c.afterSHA256));assert.equal(d.cases.O02.language,'zh');
  assert.equal(h.G.Scene_PSBattle.prototype.start,start);assert.equal(Object.getOwnPropertyDescriptor(h.G.$gameSystem,'_psGame').get,undefined);
});
test('missing actual text/arrow pixels stops first case and preserves NOT_RUN remainder',async()=>{
  const h=host({noPixels:true});await assert.rejects(mod.runD2TrainerOpening(h.p),/actual text window and arrow composed pixels/);assert.deepEqual(h.report.results.map(r=>[r.id,r.status]),[['O01','fail']]);assert.deepEqual(h.report.trainerOpeningNative.notRunIDs,['O02','O03','O04']);assert(h.report.trainerOpeningNative.cleanupComplete);assert.equal(Object.getOwnPropertyDescriptor(h.G.$gameSystem,'_psGame').get,undefined);assert(!h.w.flow._app.saveBlocked);
});
test('window pixels alone cannot borrow an arrow that was never composed',async()=>{
  const h=host({noArrowPixels:true});await assert.rejects(mod.runD2TrainerOpening(h.p),/actual text window and arrow composed pixels/);assert.equal(h.report.results[0].status,'fail');assert.equal(h.report.trainerOpeningNative.renders.length,0);
});
test('declared product identity mismatch fails before cases or observers',async()=>{
  const h=host({badIdentity:true});await assert.rejects(mod.runD2TrainerOpening(h.p),/product runtime identities/);assert.equal(h.report.results.length,0);
});
test('actual product bytes cannot borrow the declared fixed hash',async()=>{
  const h=host();fs.appendFileSync(path.join(h.w.root,'js/engine/build/production.cjs'),'\n// explicit mismatch');await assert.rejects(mod.runD2TrainerOpening(h.p),/actual opening product/);assert.equal(h.report.results.length,0);
});

test('same-value real state-port installation cannot pass the opening zero-write gate',async()=>{
  const h=host(),start=h.G.Scene_PSBattle.prototype.start;h.G.Scene_PSBattle.prototype.start=function(...args){const result=start.apply(this,args);h.G.$gameSystem._psGame=structuredClone(h.w.flow.game());return result;};
  await assert.rejects(mod.runD2TrainerOpening(h.p),/zero state writes during opening/);assert.deepEqual(h.report.results.map(r=>[r.id,r.status]),[['O01','fail']]);assert(!h.w.flow._app.saveBlocked);assert.equal(Object.getOwnPropertyDescriptor(h.G.$gameSystem,'_psGame').get,undefined);
});
