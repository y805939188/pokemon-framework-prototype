'use strict';
// Deterministic test author content. Uses only the pinned Gen 8 Showdown public Dex and real compiler.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function corpus(root=process.cwd()){
 const E=require(path.join(root,'js/engine/build/engine.cjs'));
 const {Dex}=require(path.join(root,'js/engine/showdown/dist/sim'));
 const dex=Dex.mod('gen8');
 const bases=dex.species.all().filter(s=>s.exists&&s.num>0&&s.gen<=8&&!s.forme).sort((a,b)=>a.num-b.num||a.id.localeCompare(b.id));
 const rotom=bases.find(s=>s.id==='rotom');if(!rotom)throw Error('pinned Gen8 Rotom absent');
 const sha=fs.readFileSync(path.join(root,'js/engine/showdown/SOURCE_SHA'),'utf8').trim();
 const sources=JSON.parse(fs.readFileSync(path.join(root,'content/sample/sources.json'),'utf8'));
 return [8,128,900].map(rows=>{
  const selected=[rotom,...bases.filter(s=>s!==rotom)].slice(0,rows-2);
  if(selected.length!==rows-2)throw Error('insufficient lawful base identities');
  const record=(s,form=0,showdownId=s.id)=>({id:s.id,...(form?{form}:{}),showdownId,nameKey:'scale.'+s.id,growth:'medium',baseExp:64,evYield:{},catchRate:45,learnset:[{level:1,move:'tackle'}],source:'author-placeholder',heightDm:10,weightHg:100,categoryKey:'scale.category',entryKey:'scale.entry',dexSortKeys:{zh:s.id.toUpperCase()}});
  const species=selected.map(s=>record(s));species.push(record(rotom,1,'rotomheat'),record(rotom,2,'rotomwash'));
  const national=selected.map(s=>s.id);
  const inputs={manifest:{schema:1,id:'scale-'+rows,title:'Deterministic legal test content, author placeholder numeric fields'},sources,species,overlays:[],grants:[],regionalDex:{source:'author-placeholder',regions:[{id:0,nameKey:'region.scale.a',species:national},{id:1,nameKey:'region.scale.b',species:national.filter((_,i)=>i%2===0)}]}};
  const compiled=E.contentCompile.compileContent(inputs,{}, {showdownSha:sha});if(!compiled.ok)throw Error(JSON.stringify(compiled.errors));
  const runtime=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());if(runtime.errors.length)throw Error(JSON.stringify(runtime.errors));
  if(runtime.content.meta.showdownSourceChecked!==true)throw Error('actual source not checked');
  return {rows,baseSpecies:national.length,forms:species.filter(s=>s.form).length,regions:2,showdownSha:sha,contentIdentity:runtime.content.meta.contentIdentity,compiledSha256:crypto.createHash('sha256').update(E.contentCompile.canonicalJson(compiled.data)).digest('hex'),compiled:compiled.data};
 });
}
if(require.main===module){const out=process.argv[2];if(!out)throw Error('new output JSON required');if(fs.existsSync(out))throw Error('will not overwrite existing corpus');fs.mkdirSync(path.dirname(out),{recursive:true});const data=corpus();fs.writeFileSync(out,JSON.stringify(data)+'\n');console.log(JSON.stringify(data.map(({compiled,...x})=>x),null,2));}
module.exports={corpus};
