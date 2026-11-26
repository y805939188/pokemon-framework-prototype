'use strict';
// Real emitted test-only Management bundle. This does not give production an author flag.
const { after }=require('node:test'),{randomBytes}=require('node:crypto'),{spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const root=fs.realpathSync(path.resolve(__dirname,'../../..'));
let stage,ownedScope;
after(()=>{if(ownedScope)fs.rmSync(ownedScope,{recursive:true,force:true});});
function prepare(){
 if(stage)return stage;
 const parent=path.join(root,'build','step6-isolated');fs.mkdirSync(parent,{recursive:true,mode:0o700});
 const scope=ownedScope=fs.mkdtempSync(path.join(parent,'diagnostic-'));
 const game=path.join(scope,'game'),profile=path.join(scope,'profile'),saves=path.join(scope,'saves');
 for(const d of ['game','game/js','game/js/plugins','profile','saves'])fs.mkdirSync(path.join(scope,d),{mode:0o700});
 fs.writeFileSync(path.join(game,'js','plugins.js'),'var $plugins = [];',{mode:0o600,flag:'wx'});
 fs.writeFileSync(path.join(scope,'.pf-isolated-stage'),randomBytes(32).toString('hex')+'\n',{mode:0o600,flag:'wx'});
 function build(name){
  const r=spawnSync('pnpm',['--dir','src','exec','vite','build'],{cwd:root,env:{...process.env,RR_PLUGIN:name,RR_ISOLATED_TEST_STAGE:scope},encoding:'utf8',timeout:40000});
  assert.ifError(r.error);assert.equal(r.status,0,r.stdout+r.stderr);
  return fs.readFileSync(path.join(game,'js','plugins',name+'.js'),'utf8');
 }
 stage={game,profile,saves,location:build('PS_SaveLocation'),management:build('PS_Management')};
 return stage;
}
function diagnosticStage(G,{wrongStorage=false}={}){
 const {game,profile,saves,location,management}=prepare();
 G.PluginManager.parameters??=()=>({});
 G.require=createRequire(path.join(game,'index.html'));
 G.process={platform:process.platform};
 G.nw={App:{argv:['--ps-isolated-test','--user-data-dir='+profile,'--ps-save-dir='+saves],dataPath:profile}};
 G.StorageManager.fileDirectoryPath=()=>{throw Error('unexpected storage before SaveLocation');};
 vm.runInContext(location,G,{filename:'isolated:PS_SaveLocation.js'});
 assert.equal(G.StorageManager.fileDirectoryPath(),saves+path.sep);
 if(wrongStorage)G.StorageManager.fileDirectoryPath=()=>game+path.sep;
 return {managementSource:management};
}
module.exports={diagnosticStage};
