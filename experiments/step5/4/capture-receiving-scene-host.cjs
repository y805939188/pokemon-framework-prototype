'use strict';
// Production compiled plugins + App/Gen8, with explicit controlled renderer,
// input/audio/clock/SceneManager ports. This is not an NW or disk-save host.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto'),{spawnSync,execFileSync}=require('node:child_process');
const {createVictoryDriverHost}=require('./victory-music-driver-host.cjs');
const ROOT=path.resolve(__dirname,'../../..'),E=require('../../../js/engine/build/production.cjs'),PLAN=require('./victory-music-native-plan.json');
const clone=v=>JSON.parse(JSON.stringify(v)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
let temp,plugins,entryText,fixture,cache,sourceTree,pluginHashes;
async function prepare(){
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-capture-receiving-scene-'));plugins={};pluginHashes={};
 cache=process.env.PF_CAPTURE_RECEIVING_REUSE_ROOT||null;
 const git=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
 sourceTree=git(ROOT,'rev-parse','HEAD:src');
 if(cache){assert.equal(git(cache,'rev-parse','HEAD:src'),sourceTree,'reused plugins must have the identical tracked product source tree');assert.equal(git(ROOT,'status','--porcelain=v1','-uall'),'');assert.equal(git(cache,'status','--porcelain=v1','-uall'),'');}
 for(const name of ['PS_BattleFlow','PS_SaveState','PS_Evolution','PS_Management','PS_BattleFlowTest']){
  let file;
  if(cache)file=path.join(cache,'js/plugins',name+'.js');
  else{
   const out=path.join(temp,name),r=spawnSync('pnpm',['--dir','src','exec','vite','build','--configLoader','runner','--outDir',out],{cwd:ROOT,env:{...process.env,RR_PLUGIN:name},encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);file=path.join(out,name+'.js');
  }
  const code=fs.readFileSync(file,'utf8');pluginHashes[name]=sha(code);if(process.env.PF_CAPTURE_RECEIVING_EVIDENCE){const out=path.join(process.env.PF_CAPTURE_RECEIVING_EVIDENCE,'compiled');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,name+'.js'),code);}if(name==='PS_BattleFlowTest')entryText=code;else plugins[name]=code;
 }
 const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));
 await vite.build({configFile:false,root:ROOT,logLevel:'error',build:{outDir:path.join(temp,'fixture'),minify:false,lib:{entry:path.join(ROOT,'src/plugins/flowtest/music-native-fixture.ts'),formats:['cjs'],fileName:()=> 'entry.cjs'}}});
 fixture=require(path.join(temp,'fixture/entry.cjs'));
}
function dispose(){
 if(cache)for(const [name,digest]of Object.entries(pluginHashes))assert.equal(sha(fs.readFileSync(path.join(cache,'js/plugins',name+'.js'))),digest,'reused plugin remains unchanged');
 if(temp){assert(path.basename(temp).startsWith('pf-capture-receiving-scene-'));fs.rmSync(temp,{recursive:true,force:true});}
}
async function open({lang,members,caseId}){
 const h=createVictoryDriverHost({ROOT,work:temp,plugins,entryText,driverText:'SYNTHETIC_UNUSED_DRIVER',PLAN,options:{productionTranslator:true}}),G=h.G,flow=h.w.flow;
 const content=fixture.musicNativeContent(E,assert),parameters=G.PluginManager.parameters;
 G.Bitmap.prototype.fillRect=()=>{};
 G.PluginManager.parameters=function(name){const p=parameters.call(this,name);return name==='PS_BattleFlow'?{...p,language:lang}:p;};
 flow.setLanguage(null);flow.stateReplaced();flow._app=null;flow._content=content;flow._dex=E.dex.createDexLookup();flow.seed=[1,2,3,4];flow.rng=()=>0;flow.fast=false;flow.receiveOptions={mode:0,naming:0};
 const state=fixture.musicNativeState(E,content,'receiving');state.party=state.party.slice(0,members);state.nextMemberOrdinal=String(members+1);state.dex.hasDex=false;
 state.inventory=E.inventory.inventoryFromBag({masterball:2},E.itemCatalog.catalogOf(content));G.$gameSystem._psGame=state;
 // Evolution already installed the shared sampler on these controlled event
 // targets. The receiving presenter must observe the same document and blur.
 const listeners=h.w.documentListeners,globals=h.w.windowListeners;
 vm.runInContext(plugins.PS_Management,G,{filename:'actual-PS_Management.js'});
 if(process.env.PF_CAPTURE_RECEIVING_OMIT_HANDOFF==='1')G.PSManagement.replaceBattleWithReceiving=()=>false; // Explicit negative seam control, never product code.
 await h.p.toMapId(5,8,9);
 // Stock MZ goto schedules the next Scene; terminating synchronously inside
 // replaceBattleWithReceiving would retire the owner before its caller returns.
 // Preserve that ordering in this explicit model without claiming full MZ Boot.
 const manager=h.M,update=manager.updateScene;
 manager.isSceneChanging=function(){return!!this._nextScene;};
 manager.goto=function(C){this._nextScene=C?new C():null;this._scene?.stop?.();};
 manager.updateScene=function(){
  if(this._nextScene){const next=this._nextScene;this._scene?.terminate?.();this._scene=next;this._nextScene=null;next.create();if(next instanceof G.Scene_Map){next._messageWindow={};next._spriteset={};}}
  return update.call(this);
 };
 flow.openBattle({kind:'wild',foes:[{species:'Pidgey',level:3}],battleId:caseId,seq:1,canLose:true});await h.p.inMode('main');const scene=h.p.battle(),app=flow.app(),before=clone(flow.game());let document=G.$gameSystem._psGame,installs=0;
 Object.defineProperty(G.$gameSystem,'_psGame',{configurable:true,get:()=>document,set:value=>{document=value;installs++;}});
 return{...h,G,flow,app,s:scene,before,listeners,globals,installs:()=>installs,product:{sourceTree,pluginHashes:clone(pluginHashes),reuseRoot:cache,rendering:'CONTROLLED_NODE_VM',APP:0,NW:0},cleanup(){if(flow.running)flow.abort(Error('owned capture receiving cleanup'));manager._scene?.terminate?.();if(manager._scene!==scene)scene.terminate();}};
}
async function battlePick(h,key){
 await h.waitFor(()=>h.s.inputState().ready&&h.s.inputState().items.some(row=>row.key===key),'interactive battle command '+key);
 const index=h.s.inputState().items.findIndex(row=>row.key===key);assert(index>=0,'stable battle command '+key+' in '+h.s._mode);h.s._menu.select(index);h.s.onMenuOk();await h.frames(2);
}
async function receivingPick(h,key){
 for(let i=0;i<8;i++){
  const c=h.G.PSManagement.current();assert(c&&c.ready&&c.view.kind==='menu','real receiving menu must be ready');const index=c.view.items.findIndex(row=>row.key===key);assert(index>=0,'stable receiving command '+key);
  if(c.view.cursor===index){await h.p.press('ok');return;}await h.p.press('down');
 }
 assert.fail('bounded receiving command selection '+key);
}
module.exports={prepare,dispose,open,battlePick,receivingPick,E,clone};
