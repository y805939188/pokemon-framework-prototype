
'use strict';
// Real App/Gen8/compiled Scene, installed processOk/onRender; synthetic clock/input/raster/font/audio. Never native qualification.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const {createVictoryDriverHost}=require('./victory-music-driver-host.cjs');
const ROOT=path.resolve(__dirname,'../../..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');let temp,plugins,entryText,driverText,mod;
const SYNTHETIC_FONT='fonts/pf-author-control-only.txt',CONTROL_FONT_BYTES='SYNTHETIC_CONTROL_BYTES_NOT_A_FONT_NOT_NATIVE';
const controlPlan={...require('./author-dialogue-native-plan.json'),productCommit:'SYNTHETIC_CONTROL_ONLY_CURRENT_WORKTREE',fontResourcePaths:['data/System.json',SYNTHETIC_FONT]};
test.before(async()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-author-dialogue-native-'));plugins={};
 for(const name of ['PS_BattleFlow','PS_SaveState','PS_Evolution','PS_BattleFlowTest']){const out=path.join(temp,name),r=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',out],{cwd:ROOT,env:{...process.env,RR_PLUGIN:name},encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);const code=fs.readFileSync(path.join(out,name+'.js'),'utf8');if(name==='PS_BattleFlowTest')entryText=code;else plugins[name]=code;}
 const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));await vite.build({configFile:false,root:ROOT,logLevel:'error',plugins:[{name:'explicit-synthetic-font-resources',enforce:'pre',load(id){if(id===path.join(ROOT,'experiments/step5/4/author-dialogue-native-plan.json'))return JSON.stringify(controlPlan);}},{name:'author-dialogue-pixel-control',enforce:'pre',transform(code,id){
  if(id!==path.join(ROOT,'src/plugins/flowtest/d2-author-dialogue.ts')||!process.env.PF_AUTHOR_NATIVE_MUTATION)return;
  const mutations={
   'omit-glyph-gate':["assert(textPixels > 0 && arrowPixels > 0 && glyphPixels > 0 && fits, 'actual dialogue glyphs/window/arrow pixels and measured layout');","assert(textPixels > 0 && arrowPixels > 0 && fits, 'actual dialogue glyphs/window/arrow pixels and measured layout');"],
   'omit-one-page-evidence':["const original = { logVisible: log.visible, visible: arrow.visible, renderable: arrow.renderable, alpha: arrow.alpha };","if (id === 'L01-opening-1') return { id };\n    const original = { logVisible: log.visible, visible: arrow.visible, renderable: arrow.renderable, alpha: arrow.alpha };"],
   'duplicate-one-page-evidence':["d.renders.push(row); writeProgress();","d.renders.push(row); if (id === 'L01-opening-1') d.renders.push(row); writeProgress();"]
  };
  const mutation=mutations[process.env.PF_AUTHOR_NATIVE_MUTATION];assert(mutation,'known finite native control mutation');const [marker,replacement]=mutation;assert.equal(code.split(marker).length,2);return code.replace(marker,replacement);
 }}],build:{outDir:path.join(temp,'driver'),emptyOutDir:false,minify:false,lib:{entry:path.join(ROOT,'src/plugins/flowtest/d2-author-dialogue.ts'),formats:['cjs'],fileName:()=> 'entry.cjs'}}});driverText=fs.readFileSync(path.join(temp,'driver/entry.cjs'),'utf8');mod=require(path.join(temp,'driver/entry.cjs'));
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
function host(options={}){
  const PLAN=mod.authorDialogueNativePlan,h=createVictoryDriverHost({ROOT,work:temp,plugins,driverText:driverText,entryText,PLAN,options:{...options,productionTranslator:true}}),G=h.G;
  // Run the installed Window.onRender -> updateTransform -> _updatePauseSign chain.
  const core=fs.readFileSync(path.join(ROOT,'js/reactor_core.js'),'utf8'),compat=fs.readFileSync(path.join(ROOT,'js/libs/pixi_compat.js'),'utf8');
  const exact=label=>{const a=core.indexOf(label+' = function'),b=core.indexOf('\n};',a);assert(a>=0&&b>a);return core.slice(a+label.length+3,b+2);};
  const updatePause=vm.runInNewContext('('+exact('Window.prototype._updatePauseSign')+')'),updateTransform=vm.runInNewContext('('+exact('Window.prototype.updateTransform')+')',{PIXI:{TextureSource:true}});
  const match=compat.match(/this\.onRender = function\(\) \{[\s\S]*?\n\s*\};/);assert(match&&match[0].includes('this.updateTransform()'));const onRender=vm.runInNewContext('('+match[0].slice(match[0].indexOf('function'),-1)+')');
  const init=G.Window_Base.prototype.initialize;
  G.Window_Base.prototype.initialize=function(...args){init.apply(this,args);this.visible=true;this.openness=255;this._pauseSignSprite={visible:true,renderable:true,alpha:.65,setFrame(){}};this._animationCount=32;this.contents.fontFace='SYNTHETIC_HALF_FULL_WIDTH';this.contents.fontSize=26;this.contents.width=this.innerWidth;this.contents.height=this.innerHeight;this.contents.context={getImageData:(x,y,width,height)=>{const data=new Uint8ClampedArray(width*height*4);if(!options.noGlyphPixels)for(let i=3;i<Math.min(data.length,800);i+=4)data[i]=255;return{data};}};this.isOpen=()=>true;this._updatePauseSign=updatePause;this.updateTransform=updateTransform;this.onRender=onRender;for(const k of ['_updateClientArea','_updateFrame','_updateContentsBack','_updateCursor','_updateContents','_updateArrows','_updateFilterArea','_localizeFilterArea'])this[k]=()=>{};};
  h.renderTrace=[];h.rgbBuffers=[];h.pixelReads={bulk:0,single:0};
  G.Bitmap.snap=s=>{
    const log=s._log,arrow=log._pauseSignSprite,before={visible:arrow.visible,renderable:arrow.renderable,alpha:arrow.alpha};if(log.visible)log.onRender();
    h.renderTrace.push({before,after:{visible:arrow.visible,renderable:arrow.renderable,alpha:arrow.alpha},logVisible:log.visible});
    const visible=log.visible,hasArrow=arrow.visible&&arrow.renderable!==false,width=816,height=624,data=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;data[i+3]=255;if(options.noPixels||!visible)continue;if(x>=400&&x<424&&y>=380&&y<404&&!options.noArrowPixels&&hasArrow)data[i]=255;else if(y>=140&&y<170)data[i]=data[i+1]=data[i+2]=255;}
    h.rgbBuffers.push(data);
    return {width,height,context:{getImageData(x,y,w,hgt){assert.deepEqual([x,y,w,hgt],[0,0,width,height]);h.pixelReads.bulk++;return {data};}},getPixel(x,y){h.pixelReads.single++;const i=(y*width+x)*4;return '#'+Array.from(data.slice(i,i+3),v=>v.toString(16).padStart(2,'0')).join('');},canvas:{toDataURL:()=> 'data:image/png;base64,'+Buffer.from('SYNTHETIC_OPENING_NOT_NATIVE_PNG '+JSON.stringify({visible,hasArrow})).toString('base64')},destroy(){}};
  };
  G.Window_Base.prototype.textWidth=text=>Array.from(String(text)).reduce((n,c)=>n+(c.codePointAt(0)<128?13:26),0);G.Window_Base.prototype.lineHeight=()=>36;
  const input=JSON.parse(fs.readFileSync(h.inputFile));input.productRuntime=PLAN.productRuntime;input.fontAssets=PLAN.fontResourcePaths.map(rel=>{const file=path.join(h.w.root,rel);fs.mkdirSync(path.dirname(file),{recursive:true});if(rel===SYNTHETIC_FONT)fs.writeFileSync(file,CONTROL_FONT_BYTES);else{assert.equal(rel,'data/System.json','only tracked layout data is read by this synthetic font fixture');fs.copyFileSync(path.join(ROOT,rel),file);}return{path:rel,sha256:hash(fs.readFileSync(file))};});
  for(const name of ['engine','production']){const rel='js/engine/build/'+name+'.cjs',f=path.join(h.w.root,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.copyFileSync(path.join(ROOT,rel),f);}
  if(options.badIdentity)input.productRuntime={...input.productRuntime,'js/engine/build/production.cjs':'0'.repeat(64)};
  fs.writeFileSync(h.inputFile,JSON.stringify(input));const arg=h.p.arg;h.p.arg=k=>k==='ps-author-dialogue-input'?h.inputFile:arg(k);
  // The generic host intentionally has no Window handlers: use the actual installed processOk to model ordinary confirmation.
  const windows=fs.readFileSync(path.join(ROOT,'js/reactor_windows.js'),'utf8'),start=windows.indexOf('Window_Selectable.prototype.processOk = function() {'),end=windows.indexOf('\n};',start);assert(start>=0&&end>start);
  const body=windows.slice(start,end+3).split(' = ')[1],processOk=vm.runInNewContext('('+body.slice(0,-1)+')'),press=h.p.press;h.dispatched=[];
  h.p.press=async(key,...args)=>{const s=h.p.battle();if(key==='ok'&&s?.inputState().ready){const menu=s._menu;menu.isCurrentItemEnabled=()=>menu._items[menu.index()]?.enabled!==false;menu.playOkSound=menu.updateInputData=()=>{};menu.callOkHandler=()=>s.onMenuOk();h.dispatched.push({phase:s._mode,key:s.inputState().items[menu.index()]?.key});processOk.call(menu);}return press(key,...args);};
  G.PSEvolution.automatic=false;return h;
}

function assertPageEvidence(h,d){
 const expected=[];
 for(const c of mod.authorDialogueNativePlan.cases){
  const actual=d.cases[c.id];
  expected.push({id:c.id+'-challenge'});
  for(const [section,pages]of [['opening',actual.openingPages],['terminal',actual.terminalPages]]){
   pages.forEach((page,index)=>{const id=c.id+'-'+section+'-'+(index+1);assert.equal(page.image,id,'each page names its own evidence');expected.push({id,rows:page.rows});});
  }
 }
 // Derive the total from observed pages; never promote the synthetic font's page count to a native expectation.
 assert.deepEqual(d.renders.map(row=>row.id),expected.map(page=>page.id),'every challenge and authored page has exactly one ordered render');
 const files=new Set();
 expected.forEach((page,index)=>{
  const row=d.renders[index];if(page.rows)assert.deepEqual(row.lines,page.rows,'render rows equal the corresponding displayed page');
  assert.equal(row.comparisonPNGs.length,2,'each page retains both controls');
  const images=[row,...row.comparisonPNGs],suffixes=['','-no-arrow','-no-window'];
  assert.deepEqual(row.comparisonPNGs.map(image=>image.kind),['no-arrow','no-window']);
  images.forEach((image,role)=>{
   assert.equal(image.file,page.id+suffixes[role]+'.png','each page and image role has its own file');
   assert(!files.has(image.file),'no image file is reused by another page');files.add(image.file);
   assert.equal(hash(fs.readFileSync(path.join(h.w.root,image.file))),image.sha256,'every declared page image exists with its actual bytes');
  });
 });
}

test('complete cold Title then Map bilingual long-page chain uses real stable command/Continue dispatch and single final commit',async()=>{
 assert.equal(mod.authorDialogueNativePlan.productCommit,'SYNTHETIC_CONTROL_ONLY_CURRENT_WORKTREE');assert.deepEqual(mod.authorDialogueNativePlan.fontResourcePaths,['data/System.json',SYNTHETIC_FONT]);
 const h=host({battleReadyDelayFrames:12,delayStart:10});await mod.runD2AuthorDialogue(h.p);const d=h.report.authorDialogueNative;
 assert.deepEqual(h.report.results.map(r=>[r.id,r.status]),[['L01','pass'],['L02','pass']]);assert.equal(d.nativeClaim,'NOT_SELF_QUALIFIED');assert.deepEqual(d.notRunIDs,[]);assert(d.cleanupComplete&&!d.remainingRootLocked);
 for(const c of Object.values(d.cases)){assert(c.openingPages.length>=2&&c.terminalPages.length>=2);assert.equal(c.installs.length,1);assert.equal(c.rewardCount,1);assert(c.returnedToMap);assert(c.commands.some(x=>x.phase==='main'&&x.key==='fight'));assert(c.commands.some(x=>x.phase==='moves'&&x.key===1));assert(c.commands.filter(x=>x.phase==='end').length===c.terminalPages.length);}
 assertPageEvidence(h,d);assert(d.renders.every(r=>r.pixelGate==='pass'&&r.glyphPixels>0&&r.fits&&r.installs===0&&r.fontFace==='SYNTHETIC_HALF_FULL_WIDTH'));assert(d.renders.every(r=>Object.values(r.sampling.cleanup).every(Boolean)));assert(h.dispatched.filter(r=>r.phase==='end').length>=4);
});
for(const [name,options]of [['no scene pixels',{noPixels:true}],['window without arrow',{noArrowPixels:true}],['window without glyphs',{noGlyphPixels:true}]])test(name+' rejects after saving three diagnostic images and leaves second case NOT_RUN',async()=>{
 const h=host(options);await assert.rejects(mod.runD2AuthorDialogue(h.p),/actual dialogue glyphs\/window\/arrow pixels and measured layout/);const d=h.report.authorDialogueNative;assert.deepEqual(h.report.results.map(r=>[r.id,r.status]),[['L01','fail']]);assert.deepEqual(d.notRunIDs,['L02']);assert(d.cleanupComplete&&!d.remainingRootLocked);assert.equal(d.renders[0].pixelGate,'fail');assert([d.renders[0],...d.renders[0].comparisonPNGs].every(r=>fs.existsSync(path.join(h.w.root,r.file))));assert(Object.values(d.renders[0].sampling.cleanup).every(Boolean));
});
test('declared product mismatch stops before cases',async()=>{const h=host({badIdentity:true});await assert.rejects(mod.runD2AuthorDialogue(h.p),/product runtime identities/);assert.equal(h.report.results.length,0);});
test('font bytes cannot borrow the frozen declaration',async()=>{const h=host(),input=JSON.parse(fs.readFileSync(h.inputFile)),font=input.fontAssets.find(r=>r.path===SYNTHETIC_FONT);assert(font);assert.equal(fs.readFileSync(path.join(h.w.root,font.path),'utf8'),CONTROL_FONT_BYTES);fs.appendFileSync(path.join(h.w.root,font.path),' ');await assert.rejects(mod.runD2AuthorDialogue(h.p),/actual font\/layout resource/);assert.equal(h.report.results.length,0);});
test('same-value actual state installation while reading is refused rather than mistaken for unchanged state',async()=>{const h=host(),start=h.G.Scene_PSBattle.prototype.start;h.G.Scene_PSBattle.prototype.start=function(...args){const result=start.apply(this,args);h.G.$gameSystem._psGame=structuredClone(h.w.flow.game());return result;};await assert.rejects(mod.runD2AuthorDialogue(h.p),/zero actual state installs before tail confirmation/);assert.deepEqual(h.report.results.map(r=>[r.id,r.status]),[['L01','fail']]);assert(!h.w.flow._app.saveBlocked);assert.equal(Object.getOwnPropertyDescriptor(h.G.$gameSystem,'_psGame').get,undefined);});
