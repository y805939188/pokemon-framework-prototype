'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../../..'), E=require(path.join(root,'js/engine/build/production.cjs'));
const released={allowHeldItemSources:true,allowExperimentalHeldItemBattle:true};
test('normal production policy remains released and immutable',()=>{
 const first=E.config.runtimeCapabilities();assert.deepEqual(first,released);assert(Object.isFrozen(first));
 assert.throws(()=>{first.allowHeldItemSources=false;},TypeError);assert.deepEqual(E.config.runtimeCapabilities(),released);
});
for(const source of [false,true])for(const battle of [false,true])test(`existing explicit developer override stays compatible ${source}/${battle}`,()=>{
 const input={allowHeldItemSources:source,allowExperimentalHeldItemBattle:battle};
 assert.deepEqual(E.config.runtimeCapabilities(input),released);assert.deepEqual(E.config.developmentCapabilities(input),input);
 input.allowHeldItemSources=!source;assert.deepEqual(E.config.runtimeCapabilities(),released);
});
for(const bad of [null,[],true,{ordinaryHeldItems:true},{allowHeldItemSources:'true'},{allowExperimentalHeldItemBattle:1}])test(`invalid policy override is still rejected: ${JSON.stringify(bad)}`,()=>{
 assert.throws(()=>E.config.runtimeCapabilities(bad));assert.deepEqual(E.config.runtimeCapabilities(),released);
});
function input(){
 const names=['manifest','sources','species','overlays','grants','regional-dex','settings','map-metadata'];
 const dir=path.join(root,'content/sample');const i=Object.fromEntries(names.filter(n=>fs.existsSync(path.join(dir,n+'.json'))).map(n=>[n.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),JSON.parse(fs.readFileSync(path.join(dir,n+'.json'),'utf8'))]));
 i.grants=[{id:'policy-held',source:'author-placeholder',members:[{species:'snorlax',level:10,item:'leftovers'}],items:{},money:0}];return i;
}
test('compiler and runtime assembly admit normal held sources without developer input',()=>{
 const i=input(), compiled=E.contentCompile.compileContent(i);assert.equal(compiled.ok,true,JSON.stringify(compiled.errors));
 const dex=E.dex.createDexLookup(), assembled=E.contentRuntime.assembleContent(compiled.data,dex);assert.deepEqual(assembled.errors,[]);
 for(const item of ['left-overs','notarealitem']){const bad=input();bad.grants[0].members[0].item=item;const c=E.contentCompile.compileContent(bad);if(c.ok)assert(E.contentRuntime.assembleContent(c.data,dex).errors.length);else assert(c.errors.length);}
});
test('all production admission consumers use the same resolver; experimental label retains developer-only semantics',()=>{
 for(const name of ['src/framework/content/compile.ts','src/framework/flow/content-runtime.ts','src/framework/app/game-application.ts']){
  const s=fs.readFileSync(path.join(root,name),'utf8');assert(s.includes('runtimeCapabilities('),name);if(!name.endsWith('game-application.ts'))assert(!s.includes('developmentCapabilities('),name);
 }
 const plugin=fs.readFileSync(path.join(root,'src/plugins/PS_BattleFlow.ts'),'utf8');
 assert.match(plugin,/assertBattleAllowed\(\).*runtimeCapabilities\(PSFlow.developerCapabilities\)/);
 assert.match(plugin,/developmentCapabilities\(PSFlow.developerCapabilities\).*management.experimental/);
});
