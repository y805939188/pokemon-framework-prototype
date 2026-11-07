'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../../..'), E=require(path.join(root,'js/engine/build/production.cjs'));
const closed={allowHeldItemSources:false,allowExperimentalHeldItemBattle:false};
test('normal production policy remains closed and immutable',()=>{
 const first=E.config.runtimeCapabilities();assert.deepEqual(first,closed);assert(Object.isFrozen(first));
 assert.throws(()=>{first.allowHeldItemSources=true;},TypeError);assert.deepEqual(E.config.runtimeCapabilities(),closed);
});
for(const source of [false,true])for(const battle of [false,true])test(`existing explicit developer override stays compatible ${source}/${battle}`,()=>{
 const input={allowHeldItemSources:source,allowExperimentalHeldItemBattle:battle};
 assert.deepEqual(E.config.runtimeCapabilities(input),input);assert.deepEqual(E.config.developmentCapabilities(input),input);
 input.allowHeldItemSources=!source;assert.deepEqual(E.config.runtimeCapabilities(),closed);
});
for(const bad of [null,[],true,{ordinaryHeldItems:true},{allowHeldItemSources:'true'},{allowExperimentalHeldItemBattle:1}])test(`invalid policy override fails closed: ${JSON.stringify(bad)}`,()=>{
 assert.throws(()=>E.config.runtimeCapabilities(bad));assert.deepEqual(E.config.runtimeCapabilities(),closed);
});
function input(){
 const names=['manifest','sources','species','overlays','grants','regional-dex','settings','map-metadata'];
 const dir=path.join(root,'content/sample');const i=Object.fromEntries(names.filter(n=>fs.existsSync(path.join(dir,n+'.json'))).map(n=>[n.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),JSON.parse(fs.readFileSync(path.join(dir,n+'.json'),'utf8'))]));
 i.grants=[{id:'policy-held',source:'author-placeholder',members:[{species:'snorlax',level:10,item:'leftovers'}],items:{},money:0}];return i;
}
test('compiler and runtime assembly agree on closed production and existing explicit source capability',()=>{
 const i=input(), no=E.contentCompile.compileContent(i);assert.equal(no.ok,false);assert(no.errors.some(e=>e.message.includes('held-item-source-disabled')));
 const yes=E.contentCompile.compileContent(i,{allowHeldItemSources:true});assert.equal(yes.ok,true,JSON.stringify(yes.errors));
 const dex=E.dex.createDexLookup();const noAssembly=E.contentRuntime.assembleContent(yes.data,dex);assert(noAssembly.errors.some(e=>e.message.includes('held-item-source-disabled')));
 const yesAssembly=E.contentRuntime.assembleContent(yes.data,dex,{allowHeldItemSources:true});assert.deepEqual(yesAssembly.errors,[]);
});
test('all production admission consumers use the same resolver; experimental label retains developer-only semantics',()=>{
 for(const name of ['src/framework/content/compile.ts','src/framework/flow/content-runtime.ts','src/framework/app/game-application.ts']){
  const s=fs.readFileSync(path.join(root,name),'utf8');assert(s.includes('runtimeCapabilities('),name);assert(!s.includes('developmentCapabilities('),name);
 }
 const plugin=fs.readFileSync(path.join(root,'src/plugins/PS_BattleFlow.ts'),'utf8');
 assert.match(plugin,/assertBattleAllowed\(\).*runtimeCapabilities\(PSFlow.developerCapabilities\)/);
 assert.match(plugin,/developmentCapabilities\(PSFlow.developerCapabilities\).*management.experimental/);
});
