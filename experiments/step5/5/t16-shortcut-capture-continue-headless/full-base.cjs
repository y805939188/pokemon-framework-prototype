'use strict';
const path=require('node:path'),vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const {build}=require('../d-mz-integration-support.cjs'),{frameFixture}=require('../d-mz-native-frame-support.cjs');
const flush=()=>new Promise(setImmediate);
async function fixture(options={}){
 const h=await frameFixture({withoutWorld:true,integrated:true,terrainTags:JSON.stringify({'0':{landAllowed:true,fishable:false,environment:'grass'}}),edit(game,content){
  for(const[name,species]of Object.entries(content.species)){species.ruleSpecies='Fixture'+name;species.types=['Normal'];}
  content.settings={AFFECTION_EFFECTS:false};content.mapMetadata={source:'literal',maps:{5:{environment:'cave'}}};options.edit?.(game,content);
 }}),G=h.G,B=await build(),E=B.E,sessions=[],retired=[],handle={result(){throw Error('unfinished-session');}};
 const factory={async create(request,game,setup){const owned=sessions.length?{result(){throw Error('unfinished-successor-session');}}:handle;sessions.push({request,game,setup,scene:G.SceneManager._scene,handle:owned});await options.factory?.(h);return owned;},retire(actual,reason){assert(sessions.some(row=>row.handle===actual));retired.push({handle:actual,reason});options.retire?.(h);}};
 G.$gameSystem._psGame=h.state();h.map._mapId=5;
 const managers=fs.readFileSync(path.join(path.dirname(process.env.PF_MZ_RUNTIME),'reactor_managers.js'),'utf8');
 const marker='SceneManager.isNextScene = function',start=managers.indexOf(marker),end=managers.indexOf('\n};',start);assert(start>=0&&end>start);
 vm.runInContext(managers.slice(start,end+4),G,{filename:'installed-MZ:SceneManager.isNextScene'});
 const windows=G.Window_Base.prototype;
 windows.initialize=function(rect){this.x=rect?.x||0;this.y=rect?.y||0;this.width=rect?.width||816;this.height=rect?.height||120;this.innerWidth=this.width-24;this.innerHeight=this.height-24;this.padding=12;this.contents={clear(){},fillRect(){},paintOpacity:255};};
 windows.resetFontSettings=function(){};windows.lineHeight=()=>36;windows.drawText=function(){};
 G.Window_Command=function(){};G.Window_Command.prototype=Object.create(windows);
 for(const key of ['setHandler','deactivate','hide','refresh'])G.Window_Command.prototype[key]=function(){};
 G.ConfigManager={makeData(){return{};},applyData(){}};
 await options.nativeSetup?.(h);
 const fieldPorts=await options.fieldPorts?.(h);
 const runtime={...E,...(fieldPorts||options.applicationPorts?{app:{...E.app,GameApplication:function(ports,settings){
  if(fieldPorts)assert.equal(Object.hasOwn(fieldPorts,'worldBattleScene'),false,'fixture must retain the actual private production issuer');
  const actual=fieldPorts?{...ports,fieldMoves:fieldPorts.fieldMoves,fieldEncounters:fieldPorts.fieldEncounters}:ports;
  options.applicationPorts?.(actual);
  return new E.app.GameApplication(actual,settings);
 }}}:{}),composition:{...E.composition,createBattleSessionFactory:()=>factory,createLegacyNoHeldBattleSessionFactory:()=>factory}};
 const req=name=>name==='./js/engine/build/production.cjs'?runtime:require(name);
 req.resolve=name=>name==='./js/engine/build/production.cjs'?path.join(B.out,'runtime/production.cjs'):require.resolve(name);G.require=req;
 // The complete compiled IIFE owns constructor/issuer/ports. No extracted construction method or hand-issued test ticket.
 vm.runInContext(B.flow,G,{filename:'full-private-production:PS_BattleFlow.js'});
 const flow=G.PSFlow;flow._content=h.content;flow._dex={move:id=>h.content.moves[id]||null,species:()=>null,levelUpMoves:()=>null,sha:()=> 'fixture-only'};
 h.flow=flow;
 const game=flow.game,content=flow.content;
 if(options.onRead)flow.game=function(){const value=game.call(this);options.onRead(h);return value;};
 if(options.onContent)flow.content=function(){const value=content.call(this);options.onContent(h);return value;};
 flow.fast=true;flow.rng=n=>{h.draws.push(n);return 0;};flow.clock=()=>0;
 if(options.worldSource)await options.worldSource(G);else vm.runInContext(B.world,G,{filename:'full-private-production:PS_World.js'});
 const app=flow.app();h.app=app;h.sessions=sessions;h.handle=handle;h.retired=retired;
 return{...h,G,flow,app,sessions,retired,handle,flush,state:()=>G.$gameSystem._psGame};
}
async function prepare(h){h.complete();await flush();if(!h.flow._op?.worldAdmission)throw Error('missing actual App admission: '+JSON.stringify(h.G.PSWorld.diagnostics));return h.flow._op.worldAdmission;}
module.exports={fixture,prepare,flush};
