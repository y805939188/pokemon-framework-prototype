'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const base=require('../../2/inventory-ui-host.cjs'),{world,E,clone}=require('../fixtures/postbattle/helpers.cjs');let dir,bundle;
function setup(options={}){
 const w=world({port:options.port,extraContent:c=>{c.regionalDex.regions=options.regions??[];c.regionalDex.layoutIdentity=E.dexState.dexLayoutIdentity(c.regionalDex);for(const x of Object.values(c.species)){x.heightDm=10;x.weightHg=100;x.categoryKey='test.category';x.entryKey='test.entry';}options.content?.(c);}}),g=clone(w.state.current());
 g.dex.layoutIdentity=w.content.regionalDex.layoutIdentity;g.dex.hasDex=options.hasDex??true;g.dex.seen=['Charizard','Venusaur'];g.dex.owned=['Charizard'];g.dex.unlocked=Array(w.content.regionalDex.regions.length+1).fill(true);g.dex.view={region:-1,mode:0,indices:Array(w.content.regionalDex.regions.length+1).fill(0)};g.dex.lastSeenForm={Charizard:{form:0,gender:0,shiny:true}};g.dex.seenForms={Charizard:[{form:0,gender:0,shiny:true},{form:0,gender:1,shiny:false}]};options.state?.(g);w.state.replace(g);w.state.replaced.length=0;
 const h=base.host({application:w,...options.host}),G=h.G;G.PSFlow.operationPending=()=>!!w.app.saveBlocked;G.PSFlow.stateReplaced=()=>w.app.stateReplacedByHost();
 if(fs.existsSync('src/plugins/PS_Pokedex.ts')){
  if(!bundle){dir=fs.mkdtempSync(path.join(os.tmpdir(),'ps53-dex-host-'));const p=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',dir],{env:{...process.env,RR_PLUGIN:'PS_Pokedex'},encoding:'utf8'});if(p.status!==0)throw Error(p.stdout+p.stderr);bundle=fs.readFileSync(path.join(dir,'PS_Pokedex.js'),'utf8');}
  vm.runInNewContext(bundle,G);
 }
 return{...w,...h,p:()=>G.PSPokedex?.current(),open:()=>{const api=G.PSPokedex;if(!api)throw Error('formal PSPokedex API absent');const r=api.open();h.ready();h.ready();return r;}};
}
function dispose(){base.disposeBuild();if(dir)fs.rmSync(dir,{recursive:true,force:true});dir=bundle=null;}
module.exports={setup,dispose,E,clone};
