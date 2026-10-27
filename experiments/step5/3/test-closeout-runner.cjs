'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
for(const [mode,name,value]of [['closeout-lifecycle','PF_OWNED_LIFECYCLE_GROUPS','summary-only,unknown'],['closeout-lifecycle','PF_OWNED_LIFECYCLE_GROUPS','summary-only,summary-only'],['closeout-lifecycle','PF_OWNED_LIFECYCLE_CYCLES','201'],['inventory','PF_OWNED_LIFECYCLE_CYCLES','100'],['perf','PF_OWNED_PERF_ROUNDS','26']]){
 test('I runner rejects '+name+'='+value+' before child launch',()=>{const out=fs.mkdtempSync(path.join(os.tmpdir(),'ps53-runner-'));try{const result=spawnSync('bash',['scripts/run-inventory-test-mac.sh',out,mode],{encoding:'utf8',env:{...process.env,PF_OWNED_NW:process.execPath,PF_OWNED_SKIP_BUILD:'1',PF_OWNED_REQUIRE_IDLE:'0',[name]:value}});assert.notEqual(result.status,0);assert.match(result.stdout+result.stderr,new RegExp(name));assert(!fs.existsSync(path.join(out,'launch.json')),'no child launch record');assert(!fs.existsSync(path.join(out,'host.log')),'no process stdout opened');}finally{fs.rmSync(out,{recursive:true,force:true});}});
}

test('I offline progression donor bundles actual registered JSON inputs, needs no runtime filesystem and returns independent copies',async()=>{
 const{pathToFileURL}=require('node:url'),vm=require('node:vm'),root=process.cwd();
 const{build}=await import(pathToFileURL(path.join(root,'src/node_modules/vite/dist/node/index.js')).href);
 const built=await build({configFile:false,root:path.join(root,'src'),logLevel:'silent',build:{write:false,minify:false,lib:{entry:path.join(root,'src/plugins/flowtest/source-fixture.ts'),formats:['cjs'],name:'Donor'}}});
 const output=(Array.isArray(built)?built[0]:built).output.find(x=>x.type==='chunk').code,module={exports:{}};
 vm.runInNewContext(output,{module,exports:module.exports},{timeout:5000}); // no require/fs/process in the offline evaluation realm
 const donor=module.exports.progressionDonorInputs,a=donor(),expected=Object.fromEntries(['manifest','sources','species','overlays','grants'].map(k=>[k,JSON.parse(fs.readFileSync(path.join(root,'content/sample',k+'.json'),'utf8'))]));
 assert.deepEqual(JSON.parse(JSON.stringify(a)),expected,'same actual donor, not fabricated empty data');a.species.pop();a.sources[0].id='changed';assert.deepEqual(JSON.parse(JSON.stringify(donor())),expected,'one scenario cannot corrupt the next');
});

test('I offline M1 uses the exact existing fixture functions with only Node assert and no runtime experiment path',async()=>{
 const{pathToFileURL}=require('node:url'),vm=require('node:vm'),root=process.cwd();
 const{build}=await import(pathToFileURL(path.join(root,'src/node_modules/vite/dist/node/index.js')).href);
 const built=await build({configFile:false,root:path.join(root,'src'),logLevel:'silent',build:{write:false,minify:false,lib:{entry:path.join(root,'src/plugins/flowtest/source-fixture.ts'),formats:['cjs'],name:'Donor'}}});
 const code=(Array.isArray(built)?built[0]:built).output.find(x=>x.type==='chunk').code,module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports},{timeout:5000});
 const loaded=module.exports.m1ConvergenceFixture(assert,vm.runInThisContext),original=require('./fixtures/m1/convergence.cjs');
 assert.deepEqual(Object.keys(loaded),Object.keys(original));
 for(const key of Object.keys(original))assert.equal(loaded[key].toString(),original[key].toString(),'original function source '+key);
 assert.match(code,/real default Showdown\/session\/application/,'original assertions and fixture retained in the bundle');
 assert(!code.includes("require('../fixtures"),'no runtime fixture path loader');
});
