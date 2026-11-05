'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
// The executable freezer is loaded byte-for-byte with a small, explicitly synthetic repository
// root. CI has no MZ fonts or prebuilt plugins. Native preparation still uses its real ROOT/PLAN.
const Module=require('node:module'),ROOT=path.resolve(__dirname,'../../..'),ORIGINAL_PLAN=require('./summary-order-native-plan.json'),host=require('./summary-order-scene-host.cjs');
const sha=p=>require('node:crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex');
let root,source,PLAN,prepare,layout;
test.before(async()=>{
 root=fs.mkdtempSync(path.join(os.tmpdir(),'pf-summary-freezer-'));source=path.join(root,'SYNTHETIC_REPOSITORY');fs.mkdirSync(source);
 const git=(...a)=>cp.execFileSync('git',a,{cwd:source,encoding:'utf8'}).trim();
 fs.writeFileSync(path.join(source,'.gitignore'),'*\n!.gitignore\n!README\n');fs.writeFileSync(path.join(source,'README'),'SYNTHETIC FREEZER UNIT ROOT, NOT NATIVE PRODUCT\n');
 git('init','-q','--initial-branch=fixture','--template=');git('add','.gitignore','README');git('-c','user.name=Synthetic Fixture','-c','user.email=fixture@example.invalid','-c','core.hooksPath=/dev/null','commit','-qm','freeze synthetic identity');
 await host.prepare();const compiled=host.controls();
 const write=(n,b)=>{const f=path.join(source,n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,b);};
 for(const n of Object.keys(ORIGINAL_PLAN.productRuntime)){
  if(n.startsWith('js/plugins/'))write(n,compiled.plugins[path.basename(n,'.js')]);else write(n,fs.readFileSync(path.join(ROOT,n)));
 }
 write('js/plugins/PS_BattleFlowTest.js',compiled.entryText);
 for(const n of ORIGINAL_PLAN.worldFiles)write(n,fs.readFileSync(path.join(ROOT,n)));
 for(const n of ORIGINAL_PLAN.fontResourcePaths)write(n,'SYNTHETIC FONT/CSS IDENTITY, NOT REAL GLYPHS: '+n);
 write('js/reactor_scenes.js',fs.readFileSync(path.join(ROOT,'js/reactor_scenes.js')));
 PLAN={...ORIGINAL_PLAN,productCommit:git('rev-parse','HEAD'),productRuntime:Object.fromEntries(Object.keys(ORIGINAL_PLAN.productRuntime).map(n=>[n,sha(path.join(source,n))]))};
 write('experiments/step5/4/summary-order-native-plan.json',JSON.stringify(PLAN));
 const filename=path.join(source,'scripts/prepare-summary-order-native-freeze.cjs');fs.mkdirSync(path.dirname(filename),{recursive:true});
 const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
 const normal=m.require.bind(m);m.require=id=>id==='./prepare-capture-me-native-freeze.cjs'?require('../../../scripts/prepare-capture-me-native-freeze.cjs'):normal(id);
 m._compile(fs.readFileSync(path.join(ROOT,'scripts/prepare-summary-order-native-freeze.cjs'),'utf8'),filename);({prepare,layout}=m.exports);
});
test.after(()=>{host.cleanup();if(root)fs.rmSync(root,{recursive:true,force:true});});
function fake(){const dir=fs.mkdtempSync(path.join(root,'case-')),app=path.join(dir,'STATIC_FAKE.app'),game=path.join(app,'Contents/Resources/app.nw');fs.mkdirSync(game,{recursive:true});const names=[...Object.keys(PLAN.productRuntime),'js/plugins/PS_BattleFlowTest.js',...PLAN.worldFiles,...PLAN.fontResourcePaths,'js/reactor_scenes.js'];for(const rel of names){const out=path.join(game,rel);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(path.join(source,rel),out,fs.constants.COPYFILE_FICLONE);}fs.mkdirSync(path.join(app,'Contents/MacOS'));fs.writeFileSync(path.join(app,'Contents/MacOS/nwjs'),'STATIC_FAKE_DO_NOT_EXECUTE');const info={gitHead:PLAN.productCommit,workingTreeChanges:0,withTests:true,artifacts:PLAN.productRuntime};fs.writeFileSync(path.join(game,'package-info.json'),JSON.stringify(info));return{dir,app,game,run:path.join(dir,'run-not-created'),out:path.join(dir,'freeze')};}
test('static freezer binds source/layout/driver, reserves two-case isolation and launches nothing',()=>{const c=fake(),r=prepare(c.app,c.run,c.out);assert.equal(r.NW,'NOT_RUN');assert.equal(r.processes,1);assert.equal(r.cases,2);assert(!fs.existsSync(c.run));assert.deepEqual(r.layout.screen,[816,624]);assert.deepEqual(r.layout.summaryRect,{x:4,y:4,width:808,height:616});const p=JSON.parse(fs.readFileSync(path.join(c.out,'EXECUTION-PLAN.json')));assert.equal(p.processes[0].deadlineSeconds,180);assert.deepEqual(p.processes[0].scenarioIDs,['SS01','SS02']);assert(p.processes[0].argv.some(a=>a==='--ps-flow-test=d2-summary-order'));});
test('wrong fixed product or font bytes are rejected before a freeze is written',()=>{for(const rel of['js/plugins/PS_Management.js',PLAN.fontResourcePaths[0]]){const c=fake();fs.appendFileSync(path.join(c.game,rel),'BAD');assert.throws(()=>prepare(c.app,c.run,c.out),/fixed accepted product|actual world\/font source/);assert(!fs.existsSync(c.out)&&!fs.existsSync(c.run));}});
test('existing run root and APP-internal roots are rejected without replacing contents',()=>{for(const mode of['existing','inside']){const c=fake();if(mode==='existing'){fs.mkdirSync(c.run);fs.writeFileSync(path.join(c.run,'KEEP'),'historical');assert.throws(()=>prepare(c.app,c.run,c.out),/fresh run\/freeze/);assert.equal(fs.readFileSync(path.join(c.run,'KEEP'),'utf8'),'historical');}else assert.throws(()=>prepare(c.app,path.join(c.app,'new-run'),c.out),/outside APP/);assert(!fs.existsSync(c.out));}});
test('actual installed sizing source must match frozen derivation rather than a hardcoded rectangle',()=>{const c=fake(),f=path.join(c.game,'js/reactor_scenes.js');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('const boxMargin = 4;','const boxMargin = 7;'));assert.throws(()=>layout(c.game),/actual native box sizing/);});
