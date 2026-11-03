'use strict';
// Real compiled plugin/App/Gen8 paths; controlled clocks/input/raster/audio, never native evidence.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const vm=require('node:vm');
const {createVictoryDriverHost}=require('./victory-music-driver-host.cjs');
const ROOT=path.resolve(__dirname,'../../..'),E=require('../../../js/engine/build/production.cjs'),PLAN=require('./victory-music-native-plan.json');
let temp,plugins,entryText,fixture,core,adapter,host;
test.before(async()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-prebattle-'));plugins={};
 for(const name of ['PS_BattleFlow','PS_SaveState','PS_Evolution','PS_BattleFlowTest']){
  const out=path.join(temp,name),r=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',out],{cwd:ROOT,env:{...process.env,RR_PLUGIN:name},encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
  const text=fs.readFileSync(path.join(out,name+'.js'),'utf8');if(name==='PS_BattleFlowTest')entryText=text;else plugins[name]=text;
 }
 const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));
 async function load(name,file){const out=path.join(temp,name);await vite.build({configFile:false,root:ROOT,logLevel:'error',build:{outDir:out,emptyOutDir:false,minify:false,lib:{entry:path.join(ROOT,file),formats:['cjs'],fileName:()=> 'entry.cjs'}}});return require(path.join(out,'entry.cjs'));}
 fixture=await load('fixture','src/plugins/flowtest/music-native-fixture.ts');core=await load('core','src/plugins/battleflow/prebattle.ts');adapter=await load('adapter','src/plugins/battleflow/prebattle-mz.ts');host=await load('host','src/plugins/battleflow/prebattle-host.ts');
 if(process.env.PF_PREBATTLE_MUTATION){
  const code=plugins.PS_BattleFlow,mode=process.env.PF_PREBATTLE_MUTATION;
  if(mode==='early-handoff'){const marker='elapsed >= this.plan.afterMs';assert.equal(code.split(marker).length,2);plugins.PS_BattleFlow=code.replace(marker,'elapsed >= 0');}
  else if(mode==='omit-return-wait'){const marker='this.stage("return-pending", this.now());';assert.equal(code.split(marker).length,2);plugins.PS_BattleFlow=code.replace(marker,'this.stage("done", this.now());');}
  else throw Error('unknown prebattle mutation');
 }
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});

test('WP16 caller category/location/day-night default table and wall-clock targets',()=>{
 const expected=[
  [['SnakeSquares','DiagonalBubbleTL','DiagonalBubbleBR','RisingSplash'],['TwoBallPass','ThreeBallDown','BallDown','WavyThreeBallUp']],
  [['SnakeSquares','DiagonalBubbleBR','DiagonalBubbleBR','RisingSplash'],['SpinBallSplit','BallDown','BallDown','WavySpinBall']],
 ];
 for(const night of [false,true])for(let category=0;category<4;category++)for(let location=0;location<4;location++){
  const p=core.prebattlePlan('trainer',{transition:{category,location,night}},{},0);
  assert.equal(p.referenceEffect,category===3?'FourBallBurst':expected[Number(night)][category%2][location]);
  assert.equal(p.flashColour,night||location===2?'black':'white');assert.equal(p.flashMs,800);assert.equal(p.afterMs,100);assert.equal(p.returnMs,400);assert(Object.isFrozen(p));
 }
 assert.equal(core.prebattlePlan('trainer',{}, {},0).category,1);assert.equal(core.prebattlePlan('wild',{}, {},0).category,0);
 assert.equal(core.prebattlePlan('trainer',{transition:{category:0}},{},0).referenceEffect,'SnakeSquares','explicit category is not inferred from trainer/music');
 assert.equal(core.prebattlePlan('trainer',{transition:{location:1}},{},0).mainMs,2000);
 assert.equal(core.prebattlePlan('wild',{}, {},0).contextSource,'explicit-or-default-not-inferred');
 for(const transition of [null,[],{category:4},{location:-1},{night:'false'}])assert.throws(()=>core.prebattlePlan('wild',{transition},{},0));
});
function clockOperation(overrides={}){
 let now=0,frame=0,current=true;const layers=[],errors=[],counts={pause:0,restore:0,prepare:0,enter:0,reset:0};
 const ports={current:()=>current,now:()=>now,frame:()=>frame,overlay(map){const l={map,paints:[],disposed:0,paint(c,o){this.paints.push([c,o]);},dispose(){this.disposed++;}};layers.push(l);return l;},captureBGS:()=>({pause(){counts.pause++;},restore(){counts.restore++;}}),prepareAudio(){counts.prepare++;},enterBattle(){counts.enter++;},resetEncounter(){counts.reset++;},failed:e=>errors.push(e),...overrides};
 const op=new core.PrebattleOperation(core.prebattlePlan('wild',{}, {},0),ports),map={};
 return{op,map,layers,counts,errors,ports,at(t,m=map){now=t;frame++;op.tick(m);},stale(){current=false;}};
}
test('two flash cycles, complete black handoff, owned Map disposal and 400ms return barrier',()=>{
 const h=clockOperation();h.op.start(h.map);assert.equal(h.counts.prepare,1);assert.equal(h.counts.pause,1);
 for(const t of [200,600]){h.at(t);assert.deepEqual(h.layers[0].paints.at(-1),['white',1]);}
 h.at(800);assert.equal(h.op.phaseName,'transition');h.at(2049);assert.equal(h.counts.enter,0);h.at(2050);assert.equal(h.op.phaseName,'after');assert.deepEqual(h.layers[0].paints.at(-1),['black',1]);
 h.at(2149);assert.equal(h.counts.enter,0);h.at(2150);assert.equal(h.counts.enter,1);assert(!h.op.pending());assert.equal(h.layers[0].disposed,0,'black cover held until actual map termination');
 h.op.mapTerminated(h.map);assert.equal(h.layers[0].disposed,1);h.op.finish(true);h.op.finish(true);assert(h.op.pending());assert.equal(h.counts.restore,1);
 const next={};h.at(2160,next);assert.equal(h.counts.reset,1);assert.deepEqual(h.layers[1].paints.at(-1),['black',1]);h.at(2559,next);assert(h.op.pending());h.at(2560,next);assert(!h.op.pending());assert.equal(h.layers[1].disposed,1);h.op.finish(true);assert.equal(h.counts.reset,1);
 const snapshot=h.op.snapshot();snapshot.stages[0].at=999;assert.equal(h.op.snapshot().stages[0].at,0);
});
test('ordinary abort/state replacement never enters late and releases only the owned cover',()=>{
 for(const stale of [false,true]){const h=clockOperation();h.op.start(h.map);if(stale)h.stale();h.op.cancel(!stale);h.at(5000);assert.equal(h.counts.enter,0);assert.equal(h.layers[0].disposed,1);assert.equal(h.counts.restore,stale?0:1);assert(!h.op.pending());}
});
test('allocation, drawing and scene handoff failures preserve the first failure and release the barrier',()=>{
 for(const step of ['overlay','paint','enterBattle']){
  const primary=Error('actual '+step),h=clockOperation(step==='overlay'?{overlay(){throw primary;}}:step==='enterBattle'?{enterBattle(){throw primary;}}:{});
  if(step==='paint')h.ports.overlay=map=>{const l={map,disposed:0,paint(){throw primary;},dispose(){this.disposed++;}};h.layers.push(l);return l;};
  h.op.start(h.map);if(step==='enterBattle'){h.at(800);h.at(2050);h.at(2150);}
  assert.equal(h.op.phaseName,'failed');assert.equal(h.errors[0],primary);assert(!h.op.pending());if(h.layers.length)assert.equal(h.layers[0].disposed,1);
 }
});
function world(){return createVictoryDriverHost({ROOT,work:temp,plugins,entryText,driverText:'SYNTHETIC_UNUSED_DRIVER',PLAN,options:{productionTranslator:true}});}
test('actual installed AudioManager BGS stop/resume does not overwrite a later channel',()=>{
 const h=world(),A=h.A,G=h.G,track={name:'Rain',volume:75,pitch:100,pan:0};
 A.playBgs(track);const pause=adapter.capturePrebattleBGSMZ(G,()=>true);assert(pause);pause.pause();assert.equal(A._bgsBuffer,null);pause.restore();assert.equal(A._currentBgs.name,'Rain');const resumed=A._bgsBuffer;pause.restore();assert.equal(A._bgsBuffer,resumed);
 const next=adapter.capturePrebattleBGSMZ(G,()=>true);next.pause();A.playBgs({...track,name:'River'});const successor=A._bgsBuffer;next.restore();assert.equal(A._bgsBuffer,successor);A.stopBgs();next.restore();assert.equal(A._bgsBuffer,null,'retired ownership cannot revive an old track');
 assert.equal(adapter.capturePrebattleBGSMZ(G,()=>true),null);h.w.flow.stateReplaced();
});
async function ready({trainer=false,fast=false,intro=false}={}){
 const h=world(),G=h.G,flow=h.w.flow,content=fixture.musicNativeContent(E,assert);
 if(intro){const type=content.trainerTypes['music-type-normal'];type.introBgm='Intro';type.battleBgm='Authored';}
 flow.stateReplaced();flow._app=null;flow._content=content;flow._dex=E.dex.createDexLookup();flow.seed=[1,2,3,4];flow.rng=()=>0;flow.fast=fast;G.$gameSystem._psGame=fixture.musicNativeState(E,content);
 const app=flow.app(),calls=[];for(const method of ['startBattle','startTrainerBattle']){const original=app[method];app[method]=function(...args){calls.push(method);return original.apply(this,args);};}
 await h.p.toMapId(5,8,9);const before=JSON.stringify(flow.game()),source=h.M._scene;
 return{...h,flow,app,calls,before,source,open(){flow.openBattle({kind:trainer?'trainer':'wild',...(trainer?{trainer:{id:'music-normal',version:1}}:{foes:[{species:'Pidgey',level:3}]}),battleId:'prebattle-'+path.basename(h.w.root),seq:1,canLose:true});},cleanup(){if(flow.running)flow.abort(Error('owned wrapper test cleanup'));flow.stateReplaced();}};
}
for(const trainer of [false,true])test((trainer?'trainer':'wild')+' real App/Gen8 compiled Map entry waits for the complete wrapper and creates one session',async()=>{
 const h=await ready({trainer});try{
  h.open();assert(h.M._scene===h.source,'actual Scene remains the owned source Map');assert.equal(h.flow._op.prebattleMode,'default-map');assert.equal(h.flow.prebattleState().phase,'flash');assert(h.source.isBusy());assert.equal(h.calls.length,0);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(h.G.$gameSystem.isSaveEnabled(),false);
  const delay=trainer?1900:2150,start=h.G.performance.now();await h.frames(Math.floor((delay-40)/(1000/60)));assert(h.M._scene===h.source,'actual Scene remains the owned source Map');assert.equal(h.calls.length,0);
  await h.waitFor(()=>!!h.p.battle()?._session,'real post-wrapper Session');assert(h.G.performance.now()-start>=delay);assert.equal(h.calls.filter(x=>x===(trainer?'startTrainerBattle':'startBattle')).length,1);assert.equal(JSON.stringify(h.flow.game()),h.before);assert(!h.source.children.some(x=>x.bitmap?.width===1&&x.bitmap?.height===1),'cover removed when actual Map terminates');
  const phases=Array.from(h.flow.prebattleState().stages,x=>x.phase);assert.deepEqual(phases,['flash','transition','after','battle']);
 }finally{h.cleanup();}
});
test('real normal settlement returns under cover; save and interpreter wait release only after the Map fade',async()=>{
 const h=await ready();try{
  let resets=0;h.G.$gamePlayer={makeEncounterCount(){resets++;}};
  h.open();await h.waitFor(()=>!!h.p.battle()?._session,'real Session');await h.p.inMode('main');await h.p.fightUntilEnd();const s=h.p.battle();
  // The normal result confirmation remains authoritative, then the wrapper owns only host presentation.
  await h.waitFor(()=>s._resultFeedback?.ready?.()||s._mode==='end','result');
  await h.frames(2);s.onEnd();await h.waitFor(()=>h.M._scene instanceof h.G.Scene_Map,'return Map');
  assert.equal(h.flow.running,false);assert.equal(h.flow.prebattleState().phase,'return-pending');assert(h.flow.operationPending());assert.equal(h.G.$gameSystem.isSaveEnabled(),false);
  const interpreter=new h.G.Game_Interpreter();interpreter._waitMode='psBattle';assert.equal(interpreter.updateWaitMode(),true);
  await h.frames(1);assert.equal(h.flow.prebattleState().phase,'return');assert(h.M._scene.isBusy());const settled=JSON.stringify(h.flow.game()),start=h.G.performance.now();await h.frames(20);assert(h.flow.operationPending());
  await h.waitFor(()=>h.flow.prebattleState().phase==='done','400ms return');assert(h.G.performance.now()-start>=400);assert(!h.flow.operationPending());assert.equal(interpreter.updateWaitMode(),false);assert.equal(h.G.$gameSystem.isSaveEnabled(),true);assert.equal(JSON.stringify(h.flow.game()),settled);assert.equal(resets,1);
 }finally{h.cleanup();}
});
test('real pre-entry abort and load replacement do not create sessions or persistent writes',async()=>{
 for(const action of ['abort','replace']){const h=await ready();try{h.open();await h.frames(5);if(action==='abort')h.flow.abort(Error('ordinary cancellation'));else h.flow.stateReplaced();await h.frames(180);assert.equal(h.calls.length,0);assert(h.M._scene===h.source,'actual Scene remains the owned source Map');assert.equal(JSON.stringify(h.flow.game()),h.before);assert(!h.flow.operationPending());assert(!h.source.isBusy());assert(!h.source.children.some(x=>x.bitmap?.width===1&&x.bitmap?.height===1));}finally{h.cleanup();}}
});
test('real normal allocation failure releases root and reports the error without opening a session',async()=>{
 const h=await ready(),Bitmap=h.G.Bitmap;try{h.G.Bitmap=function(w,height){if(w===1&&height===1)throw Error('cover allocation unavailable');return new Bitmap(w,height);};h.open();await h.frames(150);assert.equal(h.calls.length,0);assert(h.M._scene===h.source,'actual Scene remains the owned source Map');assert(!h.flow.operationPending());assert.equal(h.flow.prebattleState().primaryError,'cover allocation unavailable');assert(h.flow.lastOutcome.aborted);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.G.Bitmap=Bitmap;h.cleanup();}
});
test('real scene handoff and session initialization errors abort without a late session or state write',async()=>{
 for(const failure of ['handoff','session']){
  const h=await ready();try{
   if(failure==='handoff'){const push=h.M.push;h.M.push=function(C){if(C===h.G.Scene_PSBattle)throw Error('actual handoff unavailable');return push.call(this,C);};}
   else h.app.startBattle=async()=>{h.calls.push('startBattle');throw Error('actual session unavailable');};
   h.open();await h.waitFor(()=>h.flow.lastOutcome?.aborted,'ordinary opening failure');await h.frames(10);assert(!h.flow.operationPending());assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(h.flow.lastOutcome.commit,'none');assert.equal(h.flow.prebattleState().phase,failure==='handoff'?'failed':'cancelled');assert.equal(h.calls.length,failure==='handoff'?0:1);
  }finally{h.cleanup();}
 }
});
test('wrapper does not add game RNG draws or alter the actual Gen8 initial request',async()=>{
 const requests=[],draws=[];
 for(const fast of [false,true]){const h=await ready({fast});try{let count=0;h.flow.rng=()=>{count++;return 0;};h.open();await h.waitFor(()=>!!h.p.battle()?._session,'same seeded Session');requests.push(JSON.stringify(h.p.battle()._session.currentRequest()));draws.push(count);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}}
 assert.equal(requests[0],requests[1]);assert.equal(draws[0],draws[1]);
});
test('explicit Map intro retains the world memo across the wrapper and BattleScene.start',async()=>{
 const h=await ready({trainer:true,intro:true});try{
  h.w.playWorld('Map',1.5);
  const token=h.flow.playTrainerIntro('music-normal',1);await h.waitFor(()=>h.flow.isTrainerIntroReady(token),'separate accepted map intro stage');assert.equal(h.w.plays().filter(x=>x.name==='Intro').length,1);
  h.open();await h.frames(2);assert.equal(h.calls.length,0);assert.equal(h.A._currentBgm.name,'Authored','battle song begins while the Map wrapper owns the host');
  await h.waitFor(()=>!!h.p.battle()?._session,'post-wrapper Session');await h.p.inMode('main');assert.equal(h.w.plays().filter(x=>x.name==='Intro').length,1,'one intro across both host phases');assert.equal(h.A._currentBgm.name,'Authored');
  assert.equal(h.flow.musicState().player.memo.track.name,'Map');
 }finally{h.cleanup();}
});
test('host input/interpreter gates are local and release after cancellation',()=>{
 class MapScene{isStarted(){return true;}isBusy(){return false;}update(){}start(){}terminate(){}}class Player{canMove(){return true;}}class MapWorld{updateInterpreter(){return 42;}}class Event{updateParallel(){return 43;}}
 let generation=0;const app={get stateGeneration(){return generation;}},flow={_app:app,_op:null,running:false,fast:false},scene=new MapScene();scene._spriteset={};scene._messageWindow={};scene.addChild=()=>{};
 class Bitmap{fillAll(){}destroy(){}}class Sprite{constructor(){this.scale={};}destroy(){}}
 const G={Scene_Map:MapScene,Game_Player:Player,Game_Map:MapWorld,Game_Event:Event,Bitmap,Sprite,Graphics:{boxWidth:800,boxHeight:600,frameCount:0},performance:{now:()=>0},SceneManager:{_scene:scene},$gamePlayer:{},AudioManager:{}};
 const p=host.installPrebattleHost(G,flow,()=>{}),op={};flow._op=op;flow.running=true;assert(p.open(op,core.prebattlePlan('wild',{}, {},0)));assert.equal(new Player().canMove(),false);assert.equal(new MapWorld().updateInterpreter(),undefined);assert.equal(new Event().updateParallel(),undefined);
 p.cancel();flow.running=false;assert.equal(new Player().canMove(),true);assert.equal(new MapWorld().updateInterpreter(),42);assert.equal(new Event().updateParallel(),43);assert(!scene.isBusy());generation++;
});

// Use the installed Reactor scheduling/qualification bodies, not a replacement
// updateEvents that might accidentally omit the parallel-common-event route.
// Interpreter update is a counted stand-in: no real event commands, raster or NW claim.
function actualReactorEvents(legacy){
 const source=fs.readFileSync(path.join(ROOT,'js/reactor_objects.js'),'utf8');
 function method(marker){const a=source.indexOf(marker),b=source.indexOf('\n};',a);assert(a>=0&&b>a,marker);return source.slice(a,b+3);}
 const a=source.indexOf('function Game_CommonEvent() {'),b=source.indexOf('// Game_CharacterBase',a);assert(a>=0&&b>a);
 const actual=['Game_Map.prototype.update = function(sceneActive)','Game_Map.prototype.updateEvents = function()','Game_Map.prototype.updateInterpreter = function()','Game_Event.prototype.update = function()','Game_Event.prototype.updateParallel = function()'].map(method).join('\n')+'\n'+source.slice(a,b);
 const counts={main:0,mapParallel:0,common:0,character:0,scroll:0,vehicles:0,parallax:0},order=[];
 function Interpreter(role='common'){this.role=role;this.running=false;this._index=0;this._waitCount=0;this.setups=0;}
 Interpreter.prototype.isRunning=function(){return this.running;};Interpreter.prototype.setup=function(list){this.list=list;this.running=true;this._index=0;this.setups++;};Interpreter.prototype.update=function(){counts[this.role]++;order.push(this.role);if(this._waitCount>0)this._waitCount--;else this._index++;};
 function MapWorld(){this._events=[];this._commonEvents=[];this._interpreter=new Interpreter('main');this._interpreter.running=true;}
 MapWorld.prototype.events=function(){return this._events;};MapWorld.prototype.refreshIfNeeded=()=>{};
 for(const[name,key]of [['updateScroll','scroll'],['updateVehicles','vehicles'],['updateParallax','parallax']])MapWorld.prototype[name]=()=>counts[key]++;
 function Event(){this._eventId=1;this._interpreter=new Interpreter('mapParallel');}Event.prototype.checkEventTriggerAuto=()=>{};Event.prototype.list=()=>[{code:0}];
 function Character(){}Character.prototype.update=()=>counts.character++;
 const C={Game_Map:MapWorld,Game_Event:Event,Game_Character:Character,Game_Interpreter:Interpreter,$dataSystem:{rrLegacyEventOrder:legacy},$dataCommonEvents:[null,{id:1,trigger:2,switchId:1,list:[{code:0}]}],$gameSwitches:{value:id=>id===1}};
 vm.createContext(C);vm.runInContext(actual,C,{filename:'installed-reactor_objects.js#actual-Map-Event-CommonEvent'});
 const map=new MapWorld(),event=new Event(),common=new C.Game_CommonEvent(1);map._events=[event];map._commonEvents=[common];
 class MapScene{constructor(){this._spriteset={};this._messageWindow={};}isStarted(){return true;}isBusy(){return false;}update(){}start(){}terminate(){}addChild(s){s.parent=this;}removeChild(s){s.parent=null;}}
 class Bitmap{fillAll(){}destroy(){}}class Sprite{constructor(bitmap){this.bitmap=bitmap;this.scale={};}destroy(){}}
 let now=0;const op={},flow={_app:{stateGeneration:0},_op:op,running:false,fast:false},G={...C,Scene_Map:MapScene,Scene_PSBattle:class BattleScene{},SceneManager:{_scene:new MapScene(),push(Type){this._scene=new Type();}},Bitmap,Sprite,Graphics:{boxWidth:816,boxHeight:624,frameCount:0},performance:{now:()=>now},AudioManager:{},$gamePlayer:{makeEncounterCount(){}}};
 const p=host.installPrebattleHost(G,flow,()=>{}),refs=[map._interpreter,event._interpreter,common._interpreter];
 function sample(){const before={...counts};map.update(true);return Object.fromEntries(Object.keys(counts).map(k=>[k,counts[k]-before[k]]));}
 const advances={main:1,mapParallel:1,common:1,character:1,scroll:1,vehicles:1,parallax:1},held={...advances,main:0,mapParallel:0,common:0};
 assert.deepEqual(sample(),advances,'non-wrapper map retains normal event/graphics updates');assert.deepEqual(order,legacy?['main','common','mapParallel']:['main','mapParallel','common']);
 refs.forEach(i=>{i._waitCount=2;});const saved=refs.map(i=>({index:i._index,wait:i._waitCount,setups:i.setups,list:i.list}));
 function unchanged(){assert.equal(map._interpreter,refs[0]);assert.equal(event._interpreter,refs[1]);assert.equal(common._interpreter,refs[2]);refs.forEach((i,k)=>{assert.equal(i._index,saved[k].index);assert.equal(i._waitCount,saved[k].wait);assert.equal(i.setups,saved[k].setups);assert.equal(i.list,saved[k].list);});}
 return{G,flow,p,op,sample,advances,open(){flow.running=true;assert(p.open(op,core.prebattlePlan('wild',{}, {},0)));assert.equal(p.snapshot().phase,'flash');},held(label){assert(p.pending());assert.deepEqual(sample(),held,label);unchanged();},at(t){now=t;G.Graphics.frameCount++;G.SceneManager._scene.update();},resume(label){assert(!p.pending());assert.deepEqual(sample(),advances,label);refs.forEach((i,k)=>{assert.equal(i._waitCount,1);assert.equal(i._index,saved[k].index);assert.equal(i.setups,saved[k].setups);assert.equal(i.list,saved[k].list);});}};
}
for(const legacy of [false,true]){
 test('actual Reactor '+(legacy?'legacy':'ordinary')+' parallel common events pause through entry and return, then continue',()=>{
  const h=actualReactorEvents(legacy);h.open();h.held('flash holds every interpreter while characters/graphics continue');h.at(800);h.held('main transition holds every interpreter');h.at(2050);h.held('black handoff wait holds every interpreter');const source=h.G.SceneManager._scene;h.at(2150);assert.equal(h.p.snapshot().phase,'battle');source.terminate();
  h.p.finish(h.op,true);h.flow.running=false;h.held('return-pending holds every interpreter');h.G.SceneManager._scene=new h.G.Scene_Map();h.G.SceneManager._scene.start();assert.equal(h.p.snapshot().phase,'return');h.held('return fade holds every interpreter');h.at(2549);h.held('return does not release early');h.at(2550);assert.equal(h.p.snapshot().phase,'done');h.resume('normal completion continues the same interpreter/index/wait');
 });
 test('actual Reactor '+(legacy?'legacy':'ordinary')+' cancellation resumes the same parallel common-event interpreter',()=>{
  const h=actualReactorEvents(legacy);h.open();h.held('entry pauses all three event routes');h.p.cancel();h.flow.running=false;h.resume('cancel resumes without reset or lost wait');
 });
}
