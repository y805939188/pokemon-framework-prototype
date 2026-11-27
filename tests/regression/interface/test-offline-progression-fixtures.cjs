'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createInventoryRunnerFixture}=require('../../support/inventory/flowtest-runner-fixture.cjs');
for(const [mode,name,value]of [['closeout-lifecycle','PF_OWNED_LIFECYCLE_GROUPS','summary-only,unknown'],['closeout-lifecycle','PF_OWNED_LIFECYCLE_GROUPS','summary-only,summary-only'],['closeout-lifecycle','PF_OWNED_LIFECYCLE_CYCLES','201'],['inventory','PF_OWNED_LIFECYCLE_CYCLES','100'],['perf','PF_OWNED_PERF_ROUNDS','26']]){
 test('I runner rejects '+name+'='+value+' before child launch',()=>{
  const fixture=createInventoryRunnerFixture();
  try{const result=fixture.run('invalid',mode,{[name]:value});
   assert.equal(result.exit,2);assert.match(result.out,new RegExp(name));assert.equal(result.launch,null);
   assert(!fs.existsSync(path.join(fixture.dir,'invalid')),'no evidence directory, launch record, or process stdout');
  }finally{fixture.cleanup();}
 });
}

test('I synthetic inventory fixture rejects host overrides and inputs outside its own directory',()=>{
 const fixture=createInventoryRunnerFixture();
 try{
  for(const [name,options,message]of [
   ['host',{PF_OWNED_NW:process.execPath},'unsupported fixture option'],
   ['checkout',{PF_OWNED_PROJECT:process.cwd()},'unsupported fixture option'],
   ['outside',{PF_OWNED_EXPECTED:process.cwd(),PF_OWNED_SAVES:path.join(fixture.dir,'game')},'outside synthetic fixture'],
  ]){
   const result=fixture.run(name,'verify-save',options);
   assert.equal(result.exit,2);assert.match(result.out,new RegExp(message));assert.equal(result.launch,null);
   assert(!fs.existsSync(path.join(fixture.dir,name)));
  }
 }finally{fixture.cleanup();}
});

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
 const loaded=module.exports.m1ConvergenceFixture(assert,vm.runInThisContext),original=require('../../support/saves/convergence.cjs');
 assert.deepEqual(Object.keys(loaded),Object.keys(original));
 for(const key of Object.keys(original))assert.equal(loaded[key].toString(),original[key].toString(),'original function source '+key);
 assert.match(code,/real default Showdown\/session\/application/,'original assertions and fixture retained in the bundle');
 assert(!code.includes("require('../fixtures"),'no runtime fixture path loader');
});
