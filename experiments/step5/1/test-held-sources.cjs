'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..');const E=require('../../../js/engine/build/engine.cjs');
const inputs=()=>Object.fromEntries(['manifest','sources','species','overlays','grants'].map(k=>[k,JSON.parse(fs.readFileSync(path.join(ROOT,'content/sample',k+'.json'),'utf8'))]));
if(process.argv[2]==='--child'){
 const mode=process.argv[3];const source=inputs();source.species=[];source.grants=[];source.overlays=[];const compiled=E.contentCompile.compileContent(source).data;
 compiled.grants=[{id:'unusable',members:[{species:'missing',level:3,item:'leftovers'}],items:{},money:0,source:'author-placeholder'}];
 const sd=compiled.sources.find(s=>s.kind==='showdown');if(mode==='denied')sd.usageCheck.decision='not-allowed';if(mode==='missing')delete sd.usageCheck;if(mode==='unregistered')compiled.sources=compiled.sources.filter(s=>s!==sd);if(mode==='malformed')sd.usageCheck={decision:'internal-use'};
 assert.equal(Object.keys(require.cache).filter(k=>k.includes('/showdown/dist/data/')).length,0);
 const r=E.contentRuntime.assembleContent(compiled,E.dex.createDexLookup(),{allowHeldItemSources:true});assert.ok(r.errors.length);assert.equal(Object.keys(require.cache).filter(k=>k.includes('/showdown/dist/data/')).length,0,'even enabled held sources in empty content require external provenance BEFORE the lookup');console.log(JSON.stringify({mode,dataModules:0,errors:r.errors.map(e=>e.path)}));
}else{
 test('P51-12/23: held grant sources compile/runtime independently default off; controlled injection is not serialized',()=>{
  const source=inputs();source.grants[0].members[0].item='leftovers';const denied=E.contentCompile.compileContent(source);assert.equal(denied.ok,false);assert.ok(denied.errors.some(e=>/held-item-source-disabled/.test(e.message)));
  const compiled=E.contentCompile.compileContent(source,{allowHeldItemSources:true});assert.equal(compiled.ok,true,JSON.stringify(compiled.errors));assert.equal(JSON.stringify(compiled.data).includes('allowHeldItemSources'),false);
  let calls=0;const fakeDex=new Proxy({}, {get(){return()=>{calls++;throw Error('lookup before gate');};}});assert.ok(E.contentRuntime.assembleContent(compiled.data,fakeDex).errors.some(e=>/held-item-source-disabled/.test(e.message)));assert.equal(calls,0);
  const allowed=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup(),{allowHeldItemSources:true});assert.deepEqual(allowed.errors,[]);assert.equal(allowed.content.grants.starter.members[0].item,'leftovers');
  const state=E.fakes.createMemoryState(E.state.newGame({party:[]}));let draws=0;const app=new E.app.GameApplication({state,sessions:E.fakes.createFakeSessions({}),projection:E.fakes.createRecordingProjection(),content:()=>({content:allowed.content}),random:()=>{draws++;return 0;},clock:()=>1000},{receivingProfile:{mode:1,naming:1}});
  assert.equal(app.claimGrant('starter').reason,'held-item-source-disabled');assert.equal(draws,0);assert.equal(state.replaced.length,0);
 });
 for(const mode of ['denied','missing','unregistered','malformed'])test(`P51-12/F05: empty held source ${mode} refuses before external data load`,()=>{const r=spawnSync(process.execPath,[__filename,'--child',mode],{cwd:ROOT,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(JSON.parse(r.stdout.trim()).dataModules,0);});
}
