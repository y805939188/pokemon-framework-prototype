'use strict';
// Offline Node-only compilation. No native backend, package launcher or aggregate test entry.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..');
async function compile(){
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'pf-normal-preparation-')),plugins={};let entryText;
  try {
    for(const name of ['PS_BattleFlow','PS_SaveState','PS_Evolution','PS_BattleFlowTest']){
      const out=path.join(work,name),r=spawnSync(process.execPath,[path.join(ROOT,'src/node_modules/vite/bin/vite.js'),'build','--configLoader','runner','--outDir',out],{cwd:path.join(ROOT,'src'),env:{...process.env,RR_PLUGIN:name},encoding:'utf8',timeout:90000});
      assert.equal(r.status,0,r.stdout+r.stderr);const text=fs.readFileSync(path.join(out,name+'.js'),'utf8');if(name==='PS_BattleFlowTest')entryText=text;else plugins[name]=text;
    }
    const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]})),entry=path.join(work,'aggregate.ts');
    fs.writeFileSync(entry,['route','entry','fixture','battle','tools'].map(n=>'export * from '+JSON.stringify(path.join(ROOT,'src/plugins/flowtest/d2-normal-'+n+'.ts'))+';').join('\n'));
    await vite.build({configFile:false,root:ROOT,logLevel:'error',build:{outDir:path.join(work,'bundle'),emptyOutDir:false,minify:false,lib:{entry,formats:['cjs'],fileName:()=> 'entry.cjs'}}});
    await vite.build({configFile:false,root:ROOT,logLevel:'error',build:{outDir:path.join(work,'music'),emptyOutDir:false,minify:false,lib:{entry:path.join(ROOT,'src/plugins/flowtest/music-native-fixture.ts'),formats:['cjs'],fileName:()=> 'entry.cjs'}}});
    return {ROOT,work,plugins,entryText,api:require(path.join(work,'bundle/entry.cjs')),music:require(path.join(work,'music/entry.cjs')),close:()=>fs.rmSync(work,{recursive:true,force:true})};
  }catch(e){fs.rmSync(work,{recursive:true,force:true});throw e;}
}
module.exports={compile};
