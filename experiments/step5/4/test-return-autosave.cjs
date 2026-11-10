'use strict';
// Compiled product host + installed Reactor transfer/autosave methods. No NW or disk-save claim.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const ROOT=process.env.PF_AUTOSAVE_TEST_ROOT||path.resolve(__dirname,'../../..');
let temp,host;
test.before(async()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-return-save-'));
 const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));
 await vite.build({configFile:false,root:ROOT,logLevel:'error',build:{outDir:temp,emptyOutDir:false,minify:false,lib:{entry:path.join(ROOT,'src/plugins/battleflow/prebattle-host.ts'),formats:['cjs'],fileName:()=> 'host.cjs'}}});
 host=require(path.join(temp,'host.cjs'));
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
const reactor=fs.readFileSync(path.join(ROOT,'js/reactor_scenes.js'),'utf8');
function method(marker){const a=reactor.indexOf(marker),b=reactor.indexOf('\n};',a);assert(a>=0&&b>a);return reactor.slice(a,b+3);}
function setup(){
 let now=0,mapId=5,requests=0,writes=0,enabled=true,valid=true,started=true,beforeSave=0;
 class Base{}class Message extends Base{start(){started=true;}}
 class MapScene extends Message{
  constructor(){super();this._spriteset={};this._messageWindow={};this._mapNameWindow={open(){}};this._transfer=true;this._lastMapWasNull=false;}
  isStarted(){return started;}isBusy(){return false;}update(){if(!p.pending())this.afterUnblockedUpdate?.();}terminate(){}fadeInForTransfer(){}needsFadeIn(){return false;}
  addChild(s){s.parent=this;}removeChild(s){s.parent=null;}
 }
 class Bitmap{fillAll(){}destroy(){}}class Sprite{constructor(){this.scale={};}destroy(){}}
 const op={},app={stateGeneration:0},flow={_op:op,_app:app,running:false,fast:false,abort(){this._op=null;}};
 const G={Scene_Base:Base,Scene_Message:Message,Scene_Map:MapScene,Scene_PSBattle:class{},Bitmap,Sprite,
  Graphics:{boxWidth:816,boxHeight:624,frameCount:0},performance:{now:()=>now},AudioManager:{},
  SceneManager:{_scene:new MapScene(),clearStack(){},push(C){this._scene=new C();}},
  $gameMap:{mapId:()=>mapId,autoplay(){}},$gamePlayer:{makeEncounterCount(){}},
  DataManager:{isBattleTest:()=>false,isEventTest:()=>false,isPlaytestCheckpointEnabled:()=>false,saveGame(slot){assert.equal(slot,0);writes++;return Promise.resolve();}},
  $gameSystem:{isAutosaveEnabled:()=>enabled,isSaveEnabled:()=>valid&&!flow.running&&!p.pending()&&!flow._app.saveBlocked,onBeforeSave(){beforeSave++;}}
 };
 vm.createContext(G);
 for(const m of ['Scene_Base.prototype.requestAutosave =','Scene_Base.prototype.isAutosaveEnabled =','Scene_Base.prototype.executeAutosave =','Scene_Base.prototype.onAutosaveSuccess =','Scene_Base.prototype.onAutosaveFailure =','Scene_Map.prototype.start =','Scene_Map.prototype.onTransferEnd =','Scene_Map.prototype.shouldAutosave ='])vm.runInContext(method(m),G);
 const original=Base.prototype.requestAutosave;Base.prototype.requestAutosave=function(...args){requests++;return original.apply(this,args);};
 const p=host.installPrebattleHost(G,flow,()=>{}),plan={version:'default-prebattle-v1',flashMs:1,mainMs:1,afterMs:1,returnMs:400};
 function at(t,scene=G.SceneManager._scene){now=t;G.Graphics.frameCount++;scene.update();}
 function returnMap({transfer=true,first=false}={}){
  const source=G.SceneManager._scene;p.open(op,plan);at(1);at(2);at(3);assert.equal(p.snapshot().phase,'battle');source.terminate();
  p.finish(op,true);flow.running=false;const scene=new MapScene();scene._transfer=transfer;scene._lastMapWasNull=first;G.SceneManager._scene=scene;scene.start();return scene;
 }
 return{G,flow,p,op,plan,at,returnMap,setEnabled(v){enabled=v;},setValid(v){valid=v;},changeMap(){mapId++;},counts:()=>({requests,writes,beforeSave})};
}
test('actual transfer request waits for owned return fade and installs one autosave through original host path',()=>{
 const h=setup(),scene=h.returnMap();assert.equal(h.p.snapshot().phase,'return');assert.deepEqual(h.counts(),{requests:0,writes:0,beforeSave:0});
 h.at(402);assert.equal(h.counts().writes,0);h.at(403);assert.equal(h.p.snapshot().phase,'done');assert.equal(h.counts().writes,0);h.at(404);assert.deepEqual(h.counts(),{requests:1,writes:1,beforeSave:1});
 h.at(900);scene.update();assert.equal(h.counts().writes,1);
});
for(const gate of ['autosave-disabled','save-disabled','app-blocked'])test('deferred autosave preserves '+gate,()=>{
 const h=setup();h.returnMap();if(gate==='autosave-disabled')h.setEnabled(false);if(gate==='save-disabled')h.setValid(false);if(gate==='app-blocked')h.flow._app.saveBlocked=true;
 h.at(403);h.at(404);assert.deepEqual(h.counts(),{requests:1,writes:0,beforeSave:0});h.setEnabled(true);h.setValid(true);h.flow._app.saveBlocked=false;h.at(900);assert.equal(h.counts().writes,0,'no unrequested later retry');
});
for(const mode of ['no-transfer','first-map'])test('no autosave invented for '+mode,()=>{
 const h=setup();h.returnMap({transfer:mode!=='no-transfer',first:mode==='first-map'});h.at(403);h.at(404);assert.deepEqual(h.counts(),{requests:0,writes:0,beforeSave:0});
});
test('ordinary requests retain their immediate host behavior outside return',()=>{
 const h=setup();h.G.SceneManager._scene.start();assert.equal(h.counts().writes,1);
});
for(const stale of ['terminate','scene','map-id','map-object','generation','app','op','cancel','new-open'])test('retire deferred request on '+stale,()=>{
 const h=setup(),scene=h.returnMap();
 if(stale==='terminate')scene.terminate();
 if(stale==='scene')h.G.SceneManager._scene=new h.G.Scene_Map();
 if(stale==='map-id')h.changeMap();
 if(stale==='map-object')h.G.$gameMap={mapId:()=>5,autoplay(){}};
 if(stale==='generation')h.flow._app.stateGeneration++;
 if(stale==='app')h.flow._app={stateGeneration:0};
 if(stale==='op')h.flow._op={};
 if(stale==='cancel')h.p.cancel();
 if(stale==='new-open'){h.flow._op={};h.p.open(h.flow._op,h.plan);}
 h.at(403,scene);h.at(900,scene);assert.equal(h.counts().writes,0);
});
test('duplicate requests while returning coalesce and callback reentry cannot repeat a consumed save',()=>{
 const h=setup(),scene=h.returnMap();scene.requestAutosave();scene.requestAutosave();
 const save=h.G.DataManager.saveGame;h.G.DataManager.saveGame=function(slot){scene.update();return save(slot);};
 h.at(403);h.at(404);assert.equal(h.counts().requests,1);assert.equal(h.counts().writes,1);
});

test('save waits for the first unblocked ordinary map update after return completion',()=>{
 const h=setup(),scene=h.returnMap();let retired=false;scene.afterUnblockedUpdate=()=>{retired=true;};
 const save=h.G.DataManager.saveGame;h.G.DataManager.saveGame=slot=>{assert(retired);return save(slot);};
 h.at(403);assert(!retired);assert.equal(h.counts().writes,0);h.at(404);assert(retired);assert.equal(h.counts().writes,1);
});
for(const stale of ['new-operation','map-transfer'])test('drop request if first unblocked update starts '+stale,()=>{
 const h=setup(),scene=h.returnMap();scene.afterUnblockedUpdate=()=>{if(stale==='new-operation')h.flow._op={};else h.changeMap();};
 h.at(403);h.at(404);assert.equal(h.counts().writes,0);
});
