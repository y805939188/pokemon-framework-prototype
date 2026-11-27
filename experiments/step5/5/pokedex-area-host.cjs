'use strict';
// Explicit current artifacts only. No builder, NW, fallback or cleanup is owned by this fixture.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{types}=require('node:util');
const ROOT=path.resolve(__dirname,'../../..'),OUT=path.join(ROOT,'js/engine/build');
const inputs=require('../../../scripts/tests/pokedex-runtime-binding.cjs').capturePokedexInputs(ROOT,{pluginRoot:process.env.PF_POKEDEX_PLUGIN_ROOT??path.join(ROOT,'js/plugins')});
const regular=inputs.captured?require('./regular-field-action-test-runtime.cjs'):null;
if(regular)for(const key of ['PF_AREA_NATIVE_OUT','PF_E2_PARENT_OUT'])assert.equal(process.env[key],undefined,'unbound Area native output refused: '+key);
const nativeReceipt=regular?regular.prepare('query'):null;
if(!regular&&!process.env.PF_AREA_NATIVE_OUT)require('./regular-field-action-test-runtime.cjs').prepare('query');
const nativeRoot=process.env.PF_AREA_NATIVE_OUT??process.env.PF_E2_PARENT_OUT;assert(nativeRoot&&path.isAbsolute(nativeRoot),'private native output required');
const {createMZAtomicStatePort}=require(path.join(nativeRoot,'src/plugins/world/atomic-state-mz.js'));
const E=require(path.join(OUT,'engine.cjs')),P=require(path.join(OUT,'production.cjs'));
assert.equal(E.app.GameApplication,P.app.GameApplication,'fixture and production must share the actual App constructor');
const clone=x=>JSON.parse(JSON.stringify(x));
const {world}=require('../3/fixtures/postbattle/helpers.cjs'),base=require('../../../tests/support/inventory/inventory-ui-host.cjs');
const plugins=Object.fromEntries(['PS_Management','PS_Inventory','PS_Progression','PS_Evolution','PS_Pokedex'].map(name=>[name,fs.readFileSync(path.join(inputs.pluginRoot,name+'.js'),'utf8')]));
function authorWorld(c){
 c.world={encounters:{source:'area-test',tables:[{mapId:1,version:0,types:{Land:{stepChance:21,slots:[{species:'Charizard',weight:100,minLevel:5,maxLevel:5}]}}}]},regionMaps:{source:'area-test',regions:[{id:7,nameKey:'test.area.region',points:[{x:13,y:12,nameKey:'test.area.point',healingSpot:{mapId:1,x:0,y:0}}]}]}};
 c.mapMetadata={maps:{1:{region:0,mapPosition:{regionId:7,x:13,y:12}}}};
 c.regionalDex.regions=[];c.regionalDex.layoutIdentity=E.dexState.dexLayoutIdentity(c.regionalDex);
}
async function setup(options={}){
 const w=world({extraContent:c=>{authorWorld(c);options.content?.(c);}}),game=clone(w.state.current());
 game.dex.hasDex=true;game.dex.seen=['Charizard','Venusaur'];game.dex.owned=['Charizard'];game.dex.layoutIdentity=w.content.regionalDex.layoutIdentity;game.dex.unlocked=Array(w.content.regionalDex.regions.length+1).fill(true);game.dex.view={region:-1,mode:0,indices:Array(w.content.regionalDex.regions.length+1).fill(0)};game.world.visitedMaps=[1];options.state?.(game);
 const h=base.host({application:w,pluginBundles:plugins}),G=h.G;G.$gameSystem={_psGame:game};G.$gameMap={_mapId:1,mapId(){return this._mapId;}};G.$gamePlayer={_x:0,_y:0};G.$gameSwitches={_data:[]};G.SceneManager._scene=new G.Scene_Map();G.PSFlow._content=w.content;
 let writes=0,draws=0,reads=0,readHook=null,contentHook=null;const drawTrace=[];
 const state=createMZAtomicStatePort(G,{read(){reads++;const fn=readHook;readHook=null;fn?.();return G.$gameSystem._psGame;},replace(next){writes++;G.$gameSystem._psGame=next;}},types.isProxy,{owner:G.PSFlow,key:'_content'});
 const app=new P.app.GameApplication({state,content:()=>{const fn=contentHook;contentHook=null;fn?.();return{content:G.PSFlow._content,dex:E.dex.createDexLookup()};},sessions:E.composition.createLegacyNoHeldSessionFactory({async create(){assert.fail('Area cannot open a battle');}}),projection:w.projection,random(n){drawTrace.push(n);draws++;return 0;},clock:()=>0,worldTravel:{facts(){return{characterHome:null,globalHome:null,debug:false};}}});
 G.PSFlow._app=app;G.PSFlow.app=()=>app;G.PSFlow.content=()=>G.PSFlow._content;G.PSFlow.game=()=>G.$gameSystem._psGame;G.PSFlow.operationPending=()=>app.saveBlocked;G.PSFlow.stateReplaced=()=>app.stateReplacedByHost();
 for(const name of ['beginEvolutionItem','resolveTriggeredEvolution','resolveEvolution','resolvePokedex'])G.PSFlow[name]=(...args)=>app[name](...args);
 const translator=G.PSFlow.translator;G.PSFlow.translator=()=>{const t=translator();return{...t,tOr:(k,f)=>k==='test.area.region'?'Test Coast':t.tOr(k,f)};};
 vm.runInNewContext(plugins.PS_Pokedex,G);
 return{...h,E,P,app,state,G,content:()=>G.PSFlow._content,game:()=>G.$gameSystem._psGame,clone,p:()=>G.PSPokedex.current(),get writes(){return writes;},get draws(){return draws;},drawTrace,get reads(){return reads;},setReadHook(f){readHook=f;},setContentHook(f){contentHook=f;},open(){const r=G.PSPokedex.open();h.ready();h.ready();return r;},area(){h.press('ok');h.press('right');assert.equal(G.PSPokedex.current()?.view.page,1);return G.PSPokedex.current();},menu(){const menu=new G.Scene_Menu();menu.createCommandWindow();menu._commandWindow.handlers.psPokedex();h.ready();h.ready();},summary(){G.PSManagement.openSummary(G.$gameSystem._psGame.party[0].id);h.ready();h.press('ok');h.managementChoose('pokedex');h.ready();h.press('right');return G.PSPokedex.current();}};
}
function verify(){inputs.verify();if(regular){const after=regular.prepare('query');assert.equal(after.directory,nativeReceipt.directory);assert.equal(after.inputHash,nativeReceipt.inputHash);}}
module.exports={setup,authorWorld,clone,verify};
