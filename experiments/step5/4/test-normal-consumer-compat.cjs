'use strict';
// Pure compatibility controls. No native backend, launch, input or hundred-battle execution.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'../../..');let work,A,text;
test.before(async()=>{
 work=fs.mkdtempSync(path.join(os.tmpdir(),'normal-consumer-compat-'));
 const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));
 const aggregate=path.join(work,'entry.ts');
 fs.writeFileSync(aggregate,['entry','route','tools'].map(n=>`export * from ${JSON.stringify(path.join(ROOT,'src/plugins/flowtest/d2-normal-'+n+'.ts'))};`).join('\n'));
 await vite.build({configFile:false,root:ROOT,logLevel:'error',build:{outDir:path.join(work,'api'),minify:false,lib:{entry:aggregate,formats:['cjs'],fileName:()=> 'entry.cjs'}}});
 A=require(path.join(work,'api/entry.cjs'));
 const {spawnSync}=require('node:child_process');
 const out=path.join(work,'plugin'),r=spawnSync(process.execPath,[path.join(ROOT,'src/node_modules/vite/bin/vite.js'),'build','--configLoader','runner','--outDir',out],{cwd:path.join(ROOT,'src'),env:{...process.env,RR_PLUGIN:'PS_BattleFlowTest'},encoding:'utf8',timeout:90000});
 assert.equal(r.status,0,r.stdout+r.stderr);text=fs.readFileSync(path.join(out,'PS_BattleFlowTest.js'),'utf8');
});
test.after(()=>{if(work)fs.rmSync(work,{recursive:true,force:true});});
function entry(argv,req=()=>{throw Error('unexpected require');}){
 const focus=()=>false,play=()=>{},update=()=>{},W={PSEvolution:{automatic:true}},G={window:W,nw:{App:{argv}},require:req,SceneManager:{isGameActive:focus,update},AudioManager:{playBgm:play},setTimeout(){throw Error('unexpected timer');}};
 vm.createContext(G);let error;try{vm.runInContext(text,G);}catch(e){error=e;}
 assert.equal(W.PSEvolution.automatic,true);assert.equal(G.SceneManager.isGameActive,focus);assert.equal(G.SceneManager.update,update);assert.equal(G.AudioManager.playBgm,play);
 return {G,W,error};
}
test('inactive and unknown/ambiguous modes cannot enter legacy side effects',()=>{
 assert.equal(entry([]).error,undefined);
 for(const argv of [['--ps-flow-test=unknown'],['--ps-flow-test='],['--ps-flow-test=d2-normal-f100','--ps-flow-test=all']])assert.match(String(entry(argv).error),/unsupported|ambiguous/);
});
test('normal route without stage remains closed before requires or hooks',()=>{
 const r=entry(['--ps-flow-test=d2-normal-f100']);assert.equal(r.error,undefined);assert.equal(r.W.PSNormalD2.status,'BLOCKED_BEFORE_EXECUTION');assert.equal(r.W.PSNormalD2.actualBattles,0);assert.equal(r.W.PSNormalD2.nativeAdmission,false);
});
test('partial selectors, formal and unknown stage fail closed',()=>{
 for(const args of [['--ps-flow-only=T1','--ps-d2-normal-stage=offline-prepare'],['--ps-d2-normal-stage=formal'],['--ps-d2-normal-stage=native-preflight','--ps-d2-normal-stage=native-qualification']])assert.match(String(entry(['--ps-flow-test=d2-normal-f100',...args]).error),/partial|unsupported|ambiguous/);
});
test('native qualification without binding never creates a consumer',()=>{
 const r=entry(['--ps-flow-test=d2-normal-f100','--ps-d2-normal-stage=native-qualification'],require);assert.equal(r.error,undefined);assert.equal(r.W.PSNormalD2.status,'BLOCKED_NATIVE_BINDING_MISSING');assert.equal(r.W.PSNormalD2.consume,undefined);
});
test('offline authored100 policy and fixture compile against exact current production without attachment',()=>{
 const E=require('../../../js/engine/build/production.cjs');
 const r=entry(['--ps-flow-test=d2-normal-f100','--ps-d2-normal-stage=offline-prepare'],id=>id==='./js/engine/build/production.cjs'?E:require(id));
 assert.equal(r.error,undefined);assert.equal(r.W.PSNormalD2.policyCases,100);assert.equal(r.W.PSNormalD2.actualBattles,0);assert.equal(r.W.PSNormalD2.stateHostAttached,false);assert.equal(r.G.$gameSystem,undefined);
 assert.equal(r.W.PSNormalD2.sourceObserver,'UNAVAILABLE_PRODUCT_SESSION_SEAM');
 assert.equal(typeof E.session.readSessionRequestContext,'undefined','44ca source seam remains an honest blocker');
});
test('legacy route allowlist matches current dispatcher without executing legacy modes',()=>{
 const source=fs.readFileSync(path.join(ROOT,'src/plugins/PS_BattleFlowTest.ts'),'utf8'),dispatch=source.slice(source.indexOf('try { if(mode ==='));
 const expected=[...new Set(['all',...dispatch.matchAll(/mode\s*===?\s*["']([^"']+)["']/g)].map(x=>typeof x==='string'?x:x[1]))].sort();assert.deepEqual([...A.LEGACY_FLOW_MODES].sort(),expected);
});
test('valid binding bytes cannot substitute missing product source observation or acquire authority',()=>{
 const tools=A.createReviewedNormalTools(require),file=path.join(work,'binding.json'),nonce='1'.repeat(32);
 const b={version:'D2-native-qualification-binding-v1',stage:'QUALIFICATION',role:'candidate',mode:'natural',nonce,groupId:'qualification-candidate-'+nonce,sourceHead:'44ca0c2d008f929b990f65917a8965a6efed69a0',sourceTree:'30ce29df3d033ce1d083bfa4b6c037cd46dc9643',pairBytesSHA256:'2'.repeat(64),packageInventorySHA256:'3'.repeat(64),sharedBridgeSHA256:'4'.repeat(64),donorHash:tools.donorHash,presentationHash:tools.presentationHash,appRoot:'/compat/app',profileRoot:'/compat/profile',saveRoot:'/compat/save',outputRoot:'/compat/output',caseIds:tools.compileNavigation().cases.map(c=>c.id),budget:{caseMs:1000,runMs:100000},view:{width:816,height:624,dpr:2}};
 fs.writeFileSync(file,JSON.stringify(b));const E=require('../../../js/engine/build/production.cjs');
 const r=entry(['--ps-flow-test=d2-normal-f100','--ps-d2-normal-stage=native-qualification','--ps-d2-native-binding='+file],id=>id==='./js/engine/build/production.cjs'?E:require(id));
 assert.equal(r.error,undefined);let binds=0,writes=0;
 assert.throws(()=>r.W.PSNormalD2.consume({bindGroup(){binds++;}},{append(){writes++;}}),/source observation unavailable/);
 assert.equal(binds,0);assert.equal(writes,0);assert.equal(r.G.$gameSystem,undefined);assert.equal(r.W.PSNormalD2.nativeAdmission,false);
});
