'use strict';
// Synthetic raster/clock/input with actual compiled Scene/App/Gen8; not native qualification.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const {createVictoryDriverHost}=require('./victory-music-driver-host.cjs');
const ROOT=path.resolve(__dirname,'../../..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
let temp,plugins,entryText,driverText,mod,legacyDriverText,legacyMod;
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
  const legacy=fs.readFileSync(path.join(__dirname,'opening-render-1e964fb.txt'),'utf8');assert.equal(hash(legacy),'97be482766902cb3dc3646501b55016f7bf7a0e9f1a1f161fa546493120067de','exact prior render function without CI history dependency');
  async function compile(variant){
    const out=path.join(temp,variant);
    await vite.build({configFile:false,root:ROOT,logLevel:'error',plugins:[{name:'explicit-synthetic-opening-product',enforce:'pre',load(id){if(id===path.join(ROOT,'experiments/step5/4/trainer-opening-native-plan.json'))return JSON.stringify(synthetic);}},{name:'opening-render-controls',enforce:'pre',transform(code,id){
      if(id!==path.join(ROOT,'src/plugins/flowtest/d2-trainer-opening.ts'))return;
      if(variant==='legacy'){const a=code.indexOf('  const render = '),b=code.indexOf('  const run = ',a);assert(a>=0&&b>a);return code.slice(0,a)+legacy+code.slice(b);}
      if(process.env.PF_OPENING_NATIVE_MUTATION){assert.equal(process.env.PF_OPENING_NATIVE_MUTATION,'no-arrow-pixel-gate');const marker="assert(textPixels > 0 && arrowPixels > 0, 'actual text window and arrow composed pixels');";assert.equal(code.split(marker).length,2);return code.replace(marker,"assert(textPixels > 0, 'removed arrow pixel gate');");}
    }}],build:{outDir:out,emptyOutDir:false,minify:false,lib:{entry:path.join(ROOT,'src/plugins/flowtest/d2-trainer-opening.ts'),formats:['cjs'],fileName:()=> 'entry.cjs'}}});
    return {text:fs.readFileSync(path.join(out,'entry.cjs'),'utf8'),mod:require(path.join(out,'entry.cjs'))};
  }
  const current=await compile('driver');driverText=current.text;mod=current.mod;
  const old=await compile('legacy');legacyDriverText=old.text;legacyMod=old.mod;

});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
function host(options={}){
  const PLAN=mod.trainerOpeningNativePlan,h=createVictoryDriverHost({ROOT,work:temp,plugins,driverText:options.legacy?legacyDriverText:driverText,entryText,PLAN,options:{...options,productionTranslator:true}}),G=h.G;
  // Run the installed Window.onRender -> updateTransform -> _updatePauseSign chain.
  const core=fs.readFileSync(path.join(ROOT,'js/reactor_core.js'),'utf8'),compat=fs.readFileSync(path.join(ROOT,'js/libs/pixi_compat.js'),'utf8');
  const exact=label=>{const a=core.indexOf(label+' = function'),b=core.indexOf('\n};',a);assert(a>=0&&b>a);return core.slice(a+label.length+3,b+2);};
  const updatePause=vm.runInNewContext('('+exact('Window.prototype._updatePauseSign')+')'),updateTransform=vm.runInNewContext('('+exact('Window.prototype.updateTransform')+')',{PIXI:{TextureSource:true}});
  const match=compat.match(/this\.onRender = function\(\) \{[\s\S]*?\n\s*\};/);assert(match&&match[0].includes('this.updateTransform()'));const onRender=vm.runInNewContext('('+match[0].slice(match[0].indexOf('function'),-1)+')');
  const init=G.Window_Base.prototype.initialize;
  G.Window_Base.prototype.initialize=function(...args){init.apply(this,args);this.visible=true;this.openness=255;this._pauseSignSprite={visible:true,renderable:true,alpha:.65,setFrame(){}};this._animationCount=32;this.isOpen=()=>true;this._updatePauseSign=updatePause;this.updateTransform=updateTransform;this.onRender=onRender;for(const k of ['_updateClientArea','_updateFrame','_updateContentsBack','_updateCursor','_updateContents','_updateArrows','_updateFilterArea','_localizeFilterArea'])this[k]=()=>{};};
  h.renderTrace=[];h.rgbBuffers=[];h.pixelReads={bulk:0,single:0};
  G.Bitmap.snap=s=>{
    const log=s._log,arrow=log._pauseSignSprite,before={visible:arrow.visible,renderable:arrow.renderable,alpha:arrow.alpha};if(log.visible)log.onRender();
    h.renderTrace.push({before,after:{visible:arrow.visible,renderable:arrow.renderable,alpha:arrow.alpha},logVisible:log.visible});
    const visible=log.visible,hasArrow=arrow.visible&&arrow.renderable!==false,width=816,height=624,data=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;data[i+3]=255;if(options.noPixels||!visible)continue;if(x>=400&&x<424&&y>=380&&y<404&&!options.noArrowPixels&&hasArrow)data[i]=255;else if(y>=140&&y<170)data[i]=data[i+1]=data[i+2]=255;}
    h.rgbBuffers.push(data);
    return {width,height,context:{getImageData(x,y,w,hgt){assert.deepEqual([x,y,w,hgt],[0,0,width,height]);h.pixelReads.bulk++;return {data};}},getPixel(x,y){h.pixelReads.single++;const i=(y*width+x)*4;return '#'+Array.from(data.slice(i,i+3),v=>v.toString(16).padStart(2,'0')).join('');},canvas:{toDataURL:()=> 'data:image/png;base64,'+Buffer.from('SYNTHETIC_OPENING_NOT_NATIVE_PNG '+JSON.stringify({visible,hasArrow})).toString('base64')},destroy(){}};
  };
  const input=JSON.parse(fs.readFileSync(h.inputFile));input.productRuntime=PLAN.productRuntime;
  for(const name of ['engine','production']){const rel='js/engine/build/'+name+'.cjs',f=path.join(h.w.root,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.copyFileSync(path.join(ROOT,rel),f);}
  if(options.badIdentity)input.productRuntime={...input.productRuntime,'js/engine/build/production.cjs':'0'.repeat(64)};
  fs.writeFileSync(h.inputFile,JSON.stringify(input));const arg=h.p.arg;h.p.arg=k=>k==='ps-opening-input'?h.inputFile:arg(k);
  return h;
}
test('complete four ordinary opening paths from cold Title through actual bilingual Scene, pause, send-outs and cancel',async()=>{
  const h=host({battleReadyDelayFrames:12,delayStart:10}),start=h.G.Scene_PSBattle.prototype.start;await mod.runD2TrainerOpening(h.p);const d=h.report.trainerOpeningNative;
  assert.deepEqual(h.report.results.map(r=>[r.id,r.status]),['O01','O02','O03','O04'].map(id=>[id,'pass']));assert.equal(d.nativeClaim,'NOT_SELF_QUALIFIED');assert.equal(d.renders.length,6);assert(d.renders.every(r=>r.textPixels===6264&&r.arrowPixels===144&&r.hiddenFirstPortraits&&r.installs===0));assert.deepEqual(h.pixelReads,{bulk:18,single:0});assert(d.renders.every(r=>r.sampling.gridCells===61200&&r.sampling.bulkReadbacks===3&&r.sampling.channelsCompared==='RGB'&&r.sampling.elapsedMs>=0&&Object.values(r.sampling.cleanup).every(Boolean)));assert.equal(d.renders.flatMap(r=>[r,...r.comparisonPNGs]).filter(r=>fs.existsSync(path.join(h.w.root,r.file))).length,18);assert(h.renderTrace.filter((_,i)=>i%3===0).every(r=>r.before.alpha===.65));assert(h.renderTrace.filter((_,i)=>i%3===1).every(r=>r.after.visible&&r.after.renderable===false));
  assert.deepEqual(d.renders.map(r=>r.id),mod.trainerOpeningNativePlan.renderStages);assert.deepEqual(d.notRunIDs,[]);assert(d.cleanupComplete&&!d.remainingRootLocked);assert(Object.values(d.cases).every(c=>c.installs.length===0&&c.returnedToMap&&c.beforeSHA256===c.afterSHA256));assert.equal(d.cases.O02.language,'zh');
  assert.equal(h.G.Scene_PSBattle.prototype.start,start);assert.equal(Object.getOwnPropertyDescriptor(h.G.$gameSystem,'_psGame').get,undefined);
});
test('missing actual text/arrow pixels stops first case and preserves NOT_RUN remainder',async()=>{
  const h=host({noPixels:true});await assert.rejects(mod.runD2TrainerOpening(h.p),/actual text window and arrow composed pixels/);assert.deepEqual(h.report.results.map(r=>[r.id,r.status]),[['O01','fail']]);assert.deepEqual(h.report.trainerOpeningNative.notRunIDs,['O02','O03','O04']);assert(h.report.trainerOpeningNative.cleanupComplete);assert.equal(Object.getOwnPropertyDescriptor(h.G.$gameSystem,'_psGame').get,undefined);assert(!h.w.flow._app.saveBlocked);const row=h.report.trainerOpeningNative.renders[0];assert.equal(row.textPixels,0);assert.equal(row.arrowPixels,0);assert.equal(row.pixelGate,'fail');assert.equal(row.comparisonPNGs.length,2);assert([row,...row.comparisonPNGs].every(r=>fs.existsSync(path.join(h.w.root,r.file))));assert(Object.values(row.sampling.cleanup).every(Boolean));
});
test('window pixels alone cannot borrow an arrow that was never composed',async()=>{
  const h=host({noArrowPixels:true});await assert.rejects(mod.runD2TrainerOpening(h.p),/actual text window and arrow composed pixels/);assert.equal(h.report.results[0].status,'fail');const row=h.report.trainerOpeningNative.renders[0];assert.equal(row.arrowPixels,0);assert(row.textPixels>0);assert.equal(row.pixelGate,'fail');assert.equal(row.comparisonPNGs.length,2);assert([row,...row.comparisonPNGs].every(r=>fs.existsSync(path.join(h.w.root,r.file))));assert(Object.values(row.sampling.cleanup).every(Boolean));
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

test('old frozen render fails the same installed onRender chain without retained PNGs; new draw gate survives it',async()=>{
  const h=host({legacy:true});await assert.rejects(legacyMod.runD2TrainerOpening(h.p),/actual text window and arrow composed pixels/);assert.deepEqual(h.report.results.map(r=>[r.id,r.status]),[['O01','fail']]);assert.deepEqual(h.report.trainerOpeningNative.notRunIDs,['O02','O03','O04']);assert.equal(h.report.trainerOpeningNative.renders.length,0);assert.equal(h.renderTrace[1].before.visible,false);assert.equal(h.renderTrace[1].after.visible,true);assert.deepEqual(h.rgbBuffers[0],h.rgbBuffers[1]);assert.notDeepEqual(h.rgbBuffers[0],h.rgbBuffers[2]);assert.deepEqual(h.pixelReads,{bulk:0,single:244800});assert(!h.w.flow._app.saveBlocked);
});
