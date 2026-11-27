'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {fixture:joint,flush}=require('../travel-mz-world-travel-fixture.cjs');
const {assertCurrentCompanionBootstrap}=require('./current-companion-bootstrap-support.cjs');
const root=process.env.PF_E3_NATIVE_ROOT;if(!root)throw Error('explicit native root required');
const scenes=fs.readFileSync(path.join(root,'js/reactor_scenes.js'),'utf8'),managers=fs.readFileSync(path.join(root,'js/reactor_managers.js'),'utf8');
function install(G,source,name){const a=source.indexOf(name+' = function'),b=source.indexOf('\n};',a);assert(a>=0&&b>a,name);vm.runInContext(source.slice(a,b+4),G,{filename:'actual-nontransfer:'+name});}
async function fixture(options={}){
 let ports,nativeBlackout;const captured={adoptions:[],completions:[],retirements:[],source:[],atomicErrors:[],announcements:[]};
 const h=await joint({connection:true,noSaveRequest:options.noSaveRequest,autosave:options.autosave,repel:options.repel??0,
  edit(game,content){game.steps=3;game.world.healingSpot=null;game.party[0].hp=1;game.party[0].status='psn';content.settings={...content.settings,POISON_IN_FIELD:true,POISON_FAINT_IN_FIELD:true};delete content.mapMetadata.maps[6].healingSpot;delete content.mapMetadata.maps[6].weather;options.edit?.(game,content);},
  applicationPorts(p){ports=p;const atomic=p.state.atomicWorldContent;p.state.atomicWorldContent=function(...args){try{return Reflect.apply(atomic,this,args);}catch(error){captured.atomicErrors.push(error.stack);throw error;}};const native=nativeBlackout=p.blackout;assert(native&&native.nonTransferCompleted,'full real production F ports');
   p.blackout={...native,async announce(...args){const result=await native.announce(...args);captured.announcements.push(result);return result;},armSource(o,c){const result=native.armSource(o,c);captured.source.push(["arm",result]);return result;},async waitSource(o,c){const result=await native.waitSource(o,c);captured.source.push(["wait",result]);return result;},adoptDeferredSave(o,a){const result=native.adoptDeferredSave(o,a);captured.adoptions.push({owner:o,ancestor:a,result});return result;},nonTransferCompleted(o,n){options.beforeCompletion?.(h,o,n);const result=native.nonTransferCompleted(o,n);captured.completions.push({owner:o,nonce:n,result});options.afterCompletion?.(h,o,n,result);return result;},retireSource(o,c){const result=native.retireSource(o,c);captured.retirements.push({owner:o,context:c,result});return result;}};},
  nativeSetup(n){const G=n.G;
   // Audio facade only: the real production entry invokes these methods without
   // playing audio. Game_Screen below remains the pinned native implementation.
   for(const channel of ['Bgm','Bgs']){
    G.AudioManager['_current'+channel]=null;
    G.AudioManager['stop'+channel]=function(){this['_current'+channel]=null;};
    G.AudioManager['fadeOut'+channel]=function(){this['_current'+channel]=null;};
    G.AudioManager['replay'+channel]=function(value){this['_current'+channel]=value;};
   }
   install(G,scenes,'Scene_Base.prototype.isReady');G.Scene_Message.prototype.isReady=G.Scene_Base.prototype.isReady;G.ImageManager.isReady=()=>true;G.EffectManager.isReady=()=>true;G.FontManager={isReady:()=>true};
   install(G,scenes,'Scene_Map.prototype.isReady');install(G,managers,'DataManager.isMapLoaded');install(G,managers,'DataManager.checkError');G.DataManager._errors=[];G.DataManager._checkStalledDataFiles=()=>{};
   const a=scenes.indexOf('const _reactorSceneMapOnMapLoaded ='),b=scenes.indexOf('// The database sidecar decides',a);assert(a>=0&&b>a);vm.runInContext(scenes.slice(a,b),G,{filename:'actual-nontransfer:final-Map-overlays'});
   assert.equal(typeof G.SceneManager,'function');assert.strictEqual(G.SceneManager,n.manager,'F bootstrap must keep the original native frame manager');
   const parameters=G.PluginManager.parameters;G.PluginManager.parameters=function(name){const value=parameters(name);return name==='PS_World'&&options.missingHome?{...value,CharacterHome:JSON.stringify({mapId:99,x:1,y:1,direction:8})}:value;};
   const XHR=G.XMLHttpRequest;G.XMLHttpRequest=class extends XHR{send(){if(/Map099/.test(this.url)){queueMicrotask(()=>{this.status=404;this.responseText='';this.onload();});}else super.send();}};
   options.nativeSetup?.(n);
  }});
 const G=h.G,m=G.SceneManager;
 const tick=()=>{G.Graphics.frameCount++;if(G.$gameScreen._flashDuration>0)G.$gameScreen._flashDuration--;G.$gameScreen.updateFadeOut();G.$gameScreen.updateFadeIn();m.changeScene();m.updateScene();G.Input.trigger.clear();G.Input.repeat.clear();};
 const pump=async(predicate,max=180)=>{for(let i=0;i<max;i++){if(predicate())return;G.$gameMessage.clear();tick();await flush();}throw Error('actual nontransfer pump exceeded '+JSON.stringify({map:G.$gameMap.mapId(),blocked:h.app.saveBlocked,phase:h.state().world.pendingReturn,privateFailureForDiagnosticOnly:h.app.world.blackout.entry?.result,diagnostics:G.PSWorld.diagnostics,captured:{source:captured.source,announcements:captured.announcements,atomicErrors:captured.atomicErrors,adoptions:captured.adoptions.map(x=>x.result),completions:captured.completions.map(x=>x.result)},trace:h.trace.slice(0,20)}));};
 const lifecycle=()=>ports.state.atomicWorldContent(()=>s=>({value:s.lifecycle}));
 // Reuse joint's already-completed genuine current-birth restore; do not rebootstrap a new Scene.
 assertCurrentCompanionBootstrap(h,ports);
 h.saves.length=0;h.trace.length=0;
 const run=async()=>{let result;const promise=G.PSFlow.runWorldTravel('actual-nontransfer-edge',{kind:'connection'}).then(r=>{result=r;return r;});await pump(()=>result!==undefined);return {result,promise};};
 return {...h,G,ports,nativeBlackout,captured,tick,pump,lifecycle,run};
}
module.exports={fixture,flush};
