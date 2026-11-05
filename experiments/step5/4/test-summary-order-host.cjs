'use strict';
// Full outer Boot/Map flow under explicit controlled host/raster; never native admission.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto');
const host=require('./summary-order-scene-host.cjs'),{createVictoryDriverHost}=require('./victory-music-driver-host.cjs'),{installRaster}=require('./summary-order-raster-model.cjs');
const ROOT=path.resolve(__dirname,'../../..'),E=require('../../../js/engine/build/production.cjs'),sourcePlan=require('./summary-order-native-plan.json'),hash=x=>crypto.createHash('sha256').update(x).digest('hex');let temp,normal,plan,code;
test.before(async()=>{
 await host.prepare();const c=host.controls();temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-summary-host-'));plan={...sourcePlan,productRuntime:{...sourcePlan.productRuntime}};
 for(const n of Object.keys(c.plugins))if('js/plugins/'+n+'.js'in plan.productRuntime)plan.productRuntime['js/plugins/'+n+'.js']=hash(c.plugins[n]);
 const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));await vite.build({configFile:false,root:ROOT,logLevel:'error',plugins:[{name:'explicit-controlled-plan',enforce:'pre',load(id){if(id===path.join(ROOT,'experiments/step5/4/summary-order-native-plan.json'))return JSON.stringify(plan);}}],build:{outDir:path.join(temp,'driver'),emptyOutDir:false,minify:false,lib:{entry:path.join(ROOT,'src/plugins/flowtest/d2-summary-order-host.ts'),formats:['cjs'],fileName:()=> 'entry.cjs'}}});normal=require(path.join(temp,'driver/entry.cjs'));code=fs.readFileSync(path.join(temp,'driver/entry.cjs'),'utf8');
});test.after(()=>{host.cleanup();if(temp)fs.rmSync(temp,{recursive:true,force:true});});
async function make(options={}){
 const c=host.controls(),h=createVictoryDriverHost({ROOT,work:temp,plugins:c.plugins,entryText:c.entryText,driverText:code,PLAN:{...plan,prefix:'summary_control/'},options:{productionTranslator:true,prebattleWorld:true}}),G=h.G;
 G.Input.keyMapper??={};G.Input.isPressed??=()=>false;G.TouchInput.isCancelled??=()=>false;const listeners=new Map();G.document={addEventListener(k,f){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(f);},removeEventListener(k,f){listeners.get(k)?.delete(f);}};G.addEventListener=()=>{};
 h.w.flow._content=host.makeContent();h.w.flow._dex=E.dex.createDexLookup();vm.runInContext(c.plugins.PS_Management,G,{filename:'actual-PS_Management.js'});installRaster(G,{blank:options.blank});
 G.Scene_Map.prototype.create=function(){this._messageWindow={};this._spriteset={};};
 function Title(){this.initialize();}Title.prototype=Object.create(G.Scene_MenuBase.prototype);Title.prototype.constructor=Title;Title.prototype.create=function(){this._commandWindow={isOpenAndActive:()=>true};};Title.prototype.isBusy=()=>false;G.Scene_Title=Title;
 if(options.cold!==false){h.M.goto(Title);await h.frames(2);}else await h.p.toMapId(5,8,9);
 let transitions=0;const toMap=h.p.toMapId;h.p.toMapId=async(...a)=>{transitions++;await toMap(...a);};
 for(const rel of[...plan.worldFiles,...plan.fontResourcePaths]){const out=path.join(h.w.root,rel);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,rel.endsWith('.json')?fs.readFileSync(path.join(ROOT,rel)):'SYNTHETIC_CONTROL_FONT_LAYOUT');}
 for(const rel of['js/engine/build/engine.cjs','js/engine/build/production.cjs']){const out=path.join(h.w.root,rel);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(path.join(ROOT,rel),out);}
 const input=JSON.parse(fs.readFileSync(h.inputFile));input.productRuntime=plan.productRuntime;input.planSHA256=hash(E.contentCompile.canonicalJson(plan));for(const key of['worldFiles','fontFiles'])input[key]=Object.fromEntries((key==='worldFiles'?plan.worldFiles:plan.fontResourcePaths).map(n=>[n,hash(fs.readFileSync(path.join(h.w.root,n)))]));fs.writeFileSync(h.inputFile,JSON.stringify(input));const arg=h.p.arg;h.p.arg=k=>k==='ps-summary-order-input'?h.inputFile:arg(k);
 return{...h,get transitions(){return transitions;}};
}
test('cold Title then later Map reaches both ordered normal Scene cases and six raster pairs',async()=>{
 const h=await make();await normal.runD2SummaryOrder(h.p);assert.deepEqual(h.report.results.map(r=>[r.id,r.status]),[['SS01','pass'],['SS02','pass']]);const d=h.report.summaryOrderNative;assert.equal(h.transitions,2);assert.equal(d.renders.length,6);assert(d.renders.every(r=>r.changed>0&&r.sampling.cleanup&&r.sampling.rect.x===4&&r.sampling.rect.y===4));assert(d.cleanupComplete&&!d.remainingRootLocked);assert.deepEqual(d.notRunIDs,[]);for(const row of Object.values(d.cases)){assert(row.checks.some(r=>r.label==='after-confirmation'&&r.installs===1));assert(row.checks.filter(r=>r.label==='before-confirmation').length>5);assert.equal(row.resultSHA256,E.state.resultHash(row.result));}console.log('SUMMARY_OUTER_CONTROL '+JSON.stringify(d));
});
test('no glyph difference stops first case, saves both PNGs, and restores the owned observer',async()=>{
 const h=await make({blank:true});await assert.rejects(normal.runD2SummaryOrder(h.p),/actual Summary raster differs/);const d=h.report.summaryOrderNative;assert.deepEqual(h.report.results.map(r=>[r.id,r.status]),[['SS01','fail']]);assert.deepEqual(d.notRunIDs,['SS02']);assert.equal(d.renders.length,1);for(const n of[d.renders[0].file,d.renders[0].comparisonPNG.file])assert(fs.existsSync(path.join(path.dirname(h.p.OUT),n)));assert(d.renders[0].sampling.cleanup&&d.cleanupComplete&&!d.remainingRootLocked);assert.equal(Object.getOwnPropertyDescriptor(h.G.$gameSystem,'_psGame').get,undefined);
});
test('product, font and isolated storage substitutions reject before any case',async()=>{
 for(const kind of['product','font','storage']){const h=await make();if(kind==='product')fs.appendFileSync(path.join(h.w.root,'js/plugins/PS_Management.js'),'BAD');if(kind==='font')fs.appendFileSync(path.join(h.w.root,plan.fontResourcePaths[0]),'BAD');if(kind==='storage')h.G.StorageManager.fileDirectoryPath=()=>h.w.root;await assert.rejects(normal.runD2SummaryOrder(h.p),/actual product|actual css|actual isolated storage/);assert.equal(h.report.results.length,0);}
});
test('delayed Map start is awaited before the real battle opens',async()=>{
 const h=await make();const start=h.G.Scene_Map.prototype.start;let early=0;h.G.Scene_Map.prototype.start=function(){start.call(this);this._summaryStartAt??=h.G.Graphics.frameCount+4;this._started=h.G.Graphics.frameCount>=this._summaryStartAt;};const open=h.w.flow.openBattle;h.w.flow.openBattle=function(...a){if(!h.p.scene().isStarted())early++;return open.apply(this,a);};await normal.runD2SummaryOrder(h.p);assert.equal(early,0);assert.equal(h.report.results.filter(r=>r.status==='pass').length,2);
});
