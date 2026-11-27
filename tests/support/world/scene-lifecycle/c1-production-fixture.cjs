'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {fixture:joint,flush}=require('../travel-mz-world-travel-fixture.cjs');
const {assertCurrentCompanionBootstrap}=require('./current-companion-bootstrap-support.cjs');
const native=process.env.PF_E3_NATIVE_ROOT;
const scenes=fs.readFileSync(path.join(native,'js/reactor_scenes.js'),'utf8'),managers=fs.readFileSync(path.join(native,'js/reactor_managers.js'),'utf8');
function method(G,source,name){const begin=source.indexOf(name+' = function'),end=source.indexOf('\n};',begin);assert(begin>=0&&end>begin,name);vm.runInContext(source.slice(begin,end+4),G,{filename:'independent-pinned:'+name});}
async function fixture(options={}){
 let ports,nativeBlackout,h;const phases=[],originalCalls=[],executions=[],transferEnds=[];
 const result=await joint({connection:true,noSaveRequest:options.noRequest,autosave:options.autosave,repel:options.repel??0,
 edit(game,content){game.steps=3;game.party[0].hp=1;game.party[0].status='psn';game.world.healingSpot=null;content.settings={...content.settings,POISON_IN_FIELD:true,POISON_FAINT_IN_FIELD:true};delete content.mapMetadata.maps[6].weather;delete content.mapMetadata.maps[6].healingSpot;options.edit?.(game,content);},
 applicationPorts(p){ports=p;nativeBlackout=p.blackout;const b=p.blackout;
 const lifecycle=()=>p.state.atomicWorldContent(()=>s=>({value:s.lifecycle}));
 const wrap=(name)=>function(...args){const before=lifecycle();options.before?.(name,args,h);const value=Reflect.apply(b[name],b,args);if(value&&typeof value.then==='function')return value.then(v=>{phases.push({name,args,result:v,before,after:lifecycle()});options.after?.(name,args,v,h);return v;});phases.push({name,args,result:value,before,after:lifecycle()});options.after?.(name,args,value,h);return value;};
 p.blackout={...b,...Object.fromEntries(['armSource','waitSource','adoptDeferredSave','nonTransferCompleted','retireSource','announce','prepare'].map(name=>[name,wrap(name)]))};
 },nativeSetup(n){const G=n.G;
 // Presentation-only audio facade; Game_Screen fade progression stays native.
 for(const channel of ['Bgm','Bgs']){G.AudioManager['_current'+channel]=null;G.AudioManager['stop'+channel]=function(){this['_current'+channel]=null;};G.AudioManager['fadeOut'+channel]=function(){this['_current'+channel]=null;};G.AudioManager['replay'+channel]=function(value){this['_current'+channel]=value;};}

 method(G,scenes,'Scene_Base.prototype.isReady');G.Scene_Message.prototype.isReady=G.Scene_Base.prototype.isReady;G.ImageManager.isReady=()=>true;G.EffectManager.isReady=()=>true;G.FontManager={isReady:()=>true};
 method(G,scenes,'Scene_Map.prototype.isReady');method(G,managers,'DataManager.isMapLoaded');method(G,managers,'DataManager.checkError');G.DataManager._errors=[];G.DataManager._checkStalledDataFiles=()=>{};
 const a=scenes.indexOf('const _reactorSceneMapOnMapLoaded ='),b=scenes.indexOf('// The database sidecar decides',a);assert(a>=0&&b>a);vm.runInContext(scenes.slice(a,b),G,{filename:'independent-pinned:Map-overlays'});
 assert.equal(typeof G.SceneManager,'function');assert.strictEqual(G.SceneManager,n.manager,'C1 bootstrap must keep the original native frame manager');
 const params=G.PluginManager.parameters;G.PluginManager.parameters=function(name){const value=Reflect.apply(params,this,[name]);return name==='PS_World'&&options.missingHome?{...value,CharacterHome:'{"mapId":99,"x":1,"y":1,"direction":8}'}:value;};
 const XHR=G.XMLHttpRequest;G.XMLHttpRequest=class extends XHR{send(){if(/Map099/.test(this.url)){queueMicrotask(()=>{this.status=404;this.responseText='';this.onload();});}else super.send();}};
 const nativeEnd=G.Scene_Map.prototype.onTransferEnd;G.Scene_Map.prototype.onTransferEnd=function(...args){const row={scene:this,args,phase:'running'};transferEnds.push(row);try{const value=Reflect.apply(nativeEnd,this,args);row.phase='completed';return value;}catch(error){row.phase='failed';throw error;}};
 const original=G.Scene_Map.prototype.requestAutosave;
 G.Scene_Map.prototype.requestAutosave=function(...args){originalCalls.push({scene:this,args});if(options.originalThrow)throw Error('independent-original-throw');return Reflect.apply(original,this,args);};
 const save=G.DataManager.saveGame;G.DataManager.saveGame=function(...args){executions.push({args,scene:G.SceneManager._scene});options.execute?.(h,args);if(options.executorThrow)throw Error('independent-executor-throw');return Reflect.apply(save,this,args);};
 options.nativeSetup?.(n);
 }});
 const G=result.G,m=G.SceneManager;
 const tick=()=>{G.Graphics.frameCount++;if(G.$gameScreen._flashDuration>0)G.$gameScreen._flashDuration--;G.$gameScreen.updateFadeOut();G.$gameScreen.updateFadeIn();m.changeScene();m.updateScene();G.Input.trigger.clear();G.Input.repeat.clear();};
 const pump=async(predicate,max=200)=>{for(let i=0;i<max;i++){if(predicate())return;G.$gameMessage.clear();tick();await flush();}throw Error('independent pump timeout '+JSON.stringify({phases:phases.map(x=>[x.name,x.result]),blocked:result.app.saveBlocked,inventory:G.PSInventory.current()?.view?.kind,diagnostics:G.PSWorld.diagnostics,map:G.$gameMap._mapId,trace:result.trace.slice(-12)}));};
 const lifecycle=()=>ports.state.atomicWorldContent(()=>s=>({value:s.lifecycle}));
 h={...result,G,ports,nativeBlackout,phases,originalCalls,executions,transferEnds,tick,pump,lifecycle};
 // joint already established this current birth through the production ingress.
 assertCurrentCompanionBootstrap(h,ports);
 h.initialCounts={original:originalCalls.length,executions:executions.length,save:h.saves.length,trace:h.trace.length,draws:h.draws.length,nativeDraws:h.nativeDraws.length};
 const ready=()=>{tick();tick();};
 const press=key=>{G.Input.pressed.add(key);G.Input.trigger.add(key);G.Input.repeat.add(key);tick();G.Input.pressed.delete(key);tick();};
 const choose=key=>{ready();for(let i=0;G.PSInventory.current()?.view.items?.[G.PSInventory.current().view.cursor]?.key!==key&&i<30;i++)press('down');assert.equal(G.PSInventory.current()?.view.items?.[G.PSInventory.current().view.cursor]?.key,key,'actual static-manager C1 choice');press('ok');};
 h.ready=ready;h.press=press;h.choose=choose;
 h.initialLifecycle=lifecycle();
 h.run=async()=>{let outcome;const promise=G.PSFlow.runWorldTravel('independent-nt',{kind:'connection'}).then(v=>{outcome=v;return v;});await pump(()=>outcome!==undefined);return {outcome,promise};};
 h.finish=async()=>{await h.run();await pump(()=>phases.some(x=>x.name==='nonTransferCompleted'));await flush();return phases.find(x=>x.name==='nonTransferCompleted');};
 h.counts=()=>({original:originalCalls.length-h.initialCounts.original,executions:executions.length-h.initialCounts.executions,saves:h.saves.length-h.initialCounts.save,reserves:h.trace.slice(h.initialCounts.trace).filter(x=>x[0]==='native-reserve').length});
 h.rng=()=>({full:[...h.draws],increment:h.draws.slice(h.initialCounts.draws),nativeFull:[...h.nativeDraws],nativeIncrement:h.nativeDraws.slice(h.initialCounts.nativeDraws)});
 return h;
}
module.exports={fixture,flush};
