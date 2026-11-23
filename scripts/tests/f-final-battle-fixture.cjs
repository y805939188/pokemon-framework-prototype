'use strict';
// Full fixed IIFEs and actual Session/Showdown gateway. Render/audio/input are facades;
// real Scene construction/create/controller.begin/onEnd, App/gateway/result/ledger/source remain actual.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
async function loadInputs(){const B=require('./final-production-runtime.cjs').get(),{root,E,T}=B;const {fixture:joint,flush}=require('./battle-defeat-f-native.cjs').createNativeFixture({root,B});return{root,E,T,joint,flush,stage:path.join(root,'js/engine/showdown'),artifactRoot:path.join(process.env.PF_F_BRANCH_ROOT,'battle-observation.json')};}
function install(G,text,name){const a=text.indexOf(name+' = function'),b=text.indexOf('\n};',a);assert(a>=0&&b>a,name);vm.runInContext(text.slice(a,b+4),G,{filename:'event-defeat-actual:'+name});}
async function fixture(options={}){
 const {E,T,root,stage,joint,flush,artifactRoot}=await loadInputs();
 const scenes=fs.readFileSync(path.join(root,'js/reactor_scenes.js'),'utf8'),managers=fs.readFileSync(path.join(root,'js/reactor_managers.js'),'utf8');
 const artifact=artifactRoot.replace(/\.json$/,options.withoutF?'-disabled-F.json':options.lateGeneration?'-late-generation.json':options.canLose?'-canLose.json':'.json');
 const observed={factory:'actual createLegacyNoHeldBattleSessionFactory/default real Showdown; explicit contentSource fixture',facades:['render/audio/input only','Scene.isReady/start/update presentation; actual initialize/create/controller.open/onEnd retained'],rawReserves:[],Freserves:[],legacyCalls:[],nativeOriginalRequests:[],completions:[],arm:[],wait:[],announcements:[],preparations:[],messages:[],nonTransfers:[],retirements:[],preloads:[],engineRNG:[],worldPrefixAtStart:null};
 const prng=require(path.join(stage,'dist/sim/prng.js')),restore=[],ids=new WeakMap();let nextId=0;
 for(const name of ['Gen5RNG','SodiumRNG']){const p=prng[name].prototype,original=p.next;p.next=function(...args){if(!ids.has(this))ids.set(this,++nextId);const value=Reflect.apply(original,this,args);observed.engineRNG.push({engine:name,instance:ids.get(this),args:[...args],value});return value;};restore.push(()=>p.next=original);}
 let h,ports;
 try{h=await joint({connection:false,edit(game,content){
  const fixture=structuredClone(T.fixtureContent);
  for(const name of ['Snorlax','Pidgey'])content.species[name]={...fixture.species[name],abilities:[name==='Snorlax'?'Immunity':'Keen Eye'],gender:'F50',types:[... (name==='Pidgey'?['Normal','Flying']:['Normal'])]};
  for(const name of ['A','B','C','constructor','__proto__','toString'])delete content.species[name].types;
  assert.deepEqual(Object.entries(content.species).filter(([,s])=>s.types).map(([name])=>name),['Snorlax','Pidgey']);
  content.species.Pidgey.learnset={1:['tackle']};content.abilities={...content.abilities,...fixture.abilities};content.moves.tackle={id:'tackle',name:'Tackle',pp:35};
  game.party[0]={...game.party[0],species:'Snorlax',form:0,level:2,exp:E.growth.minExp('slow',2),hp:1,status:'',statusCount:0,item:'',ability:'Immunity',abilityIndex:0,effectiveAbilityIndex:0,nature:'hardy',statNature:null,gender:'M',moves:[{id:'tackle',pp:35,maxpp:35,ppUps:0}]};
  game.money=1000;game.badges=Array(8).fill(false);game.steps=3;game.world.companions=[];game.world.recentCenter={mapId:7,x:2,y:1,direction:4};game.world.healingSpot=null;
  if(options.destination)game.world.recentCenter=null;
  delete content.mapMetadata.maps[6].weather;delete content.mapMetadata.maps[6].healingSpot;
  assert.deepEqual(E.saveSchema.validateGameContent(game,content),[],'valid synthetic source state before real App composition');
 },applicationPorts(p){ports=p;
  // Composition selects a supported real producer before actual GameApplication captures it.
  p.sessions=E.composition.createLegacyNoHeldBattleSessionFactory({content:()=>p.content().content,seed:()=>[1,2,3,4]});
  const preload=p.worldTravel.preload;p.worldTravel.preload=async function(...args){const result=await Reflect.apply(preload,this,args);observed.preloads.push({target:structuredClone(args[1]),result:{...result,handle:result.handle?'actual-opaque-handle':undefined}});return result;};
  const reserve=p.worldTravel.reserve;p.worldTravel.reserve=function(...args){observed.Freserves.push({target:structuredClone(args[1].target),blackout:h?.app.isBlackoutOwner(args[0])});return Reflect.apply(reserve,this,args);};
  const original=p.blackout;
  p.blackout={...original,nonTransferCompleted(...a){const result=Reflect.apply(original.nonTransferCompleted,original,a);observed.nonTransfers.push({result,authorized:h.app.isBlackoutNonTransferComplete(a[0],a[1])});return result;},retireSource(...a){const result=Reflect.apply(original.retireSource,original,a);observed.retirements.push(result);return result;},async announce(...a){try{const r=await Reflect.apply(original.announce,original,a);observed.announcements.push({kind:a[0],checkpoint:structuredClone(a[1]),result:r});return r;}catch(error){observed.announcements.push({kind:a[0],error:String(error.stack??error)});throw error;}},async prepare(...a){try{const r=await Reflect.apply(original.prepare,original,a);observed.preparations.push(r);return r;}catch(error){observed.preparations.push({error:String(error.stack??error)});throw error;}},armSource(...a){const r=Reflect.apply(original.armSource,original,a);observed.arm.push(r);return r;},async waitSource(...a){const r=await Reflect.apply(original.waitSource,original,a);observed.wait.push(r);return r;},transferCompleted(...a){const r=Reflect.apply(original.transferCompleted,original,a);observed.completions.push({result:r,target:structuredClone(a[1].target)});return r;}};if(options.withoutF)p.blackout=undefined;
 },nativeSetup(n,{maps}){const G=n.G;
  G.$dataSystem.switches=['','StartingOver'];
  maps[1]=structuredClone(maps[5]);G.$dataMapInfos[1]={id:1,name:'Legacy Home'};
  install(G,scenes,'Scene_Base.prototype.isReady');G.Scene_Message.prototype.isReady=G.Scene_Base.prototype.isReady;G.ImageManager.isReady=()=>true;G.EffectManager.isReady=()=>true;G.FontManager={isReady:()=>true};
  install(G,scenes,'Scene_Map.prototype.isReady');install(G,managers,'DataManager.isMapLoaded');install(G,managers,'DataManager.checkError');G.DataManager._errors=[];G.DataManager._checkStalledDataFiles=()=>{};
  const a=scenes.indexOf('const _reactorSceneMapOnMapLoaded ='),b=scenes.indexOf('// The database sidecar decides',a);assert(a>=0&&b>a);vm.runInContext(scenes.slice(a,b),G,{filename:'actual-event-defeat:Map-overlays'});
  const old=G.SceneManager,cs=managers.indexOf('function SceneManager() {'),ce=managers.indexOf('\n}',cs);vm.runInContext(managers.slice(cs,ce+2),G);Object.defineProperties(G.SceneManager,Object.getOwnPropertyDescriptors(old));
  const parameters=G.PluginManager.parameters;G.PluginManager.parameters=function(name){const p=parameters(name);if(name==='PS_BattleFlow')return{...p,contentSource:'fixture',homeMapId:'1',homeX:'1',homeY:'1',homeDirection:'2'};if(name==='PS_World')return{...p,CharacterHome:options.destination==='home'?JSON.stringify({mapId:7,x:1,y:1,direction:8}):options.destination==='missing'?JSON.stringify({mapId:99,x:1,y:1,direction:8}):'',GlobalHome:options.destination==='home'||options.destination==='missing'?JSON.stringify({mapId:5,x:2,y:2,direction:2}):'',StartingOverSwitch:'1'};return p;};
  G.PluginManager._commands={};install(G,managers,'PluginManager.registerCommand');install(G,managers,'PluginManager.callCommand');
  const request=G.Scene_Map.prototype.requestAutosave;G.Scene_Map.prototype.requestAutosave=function(...args){observed.nativeOriginalRequests.push({mapId:G.$gameMap.mapId(),args:[...args],blocked:G.PSFlow?._app?.saveBlocked});return Reflect.apply(request,this,args);};
  const reserve=G.Game_Player.prototype.reserveTransfer;G.Game_Player.prototype.reserveTransfer=function(...args){observed.rawReserves.push({args:[...args],stack:new Error('observed raw reserve').stack});return Reflect.apply(reserve,this,args);};
 }});
 const G=h.G,m=G.SceneManager,P=G.Scene_PSBattle.prototype,originals={create:P.create,onEnd:P.onEnd};
 // Presentation lifecycle is a facade; the actual create opens the actual controller/Session.
 P.isReady=function(){return !!this._controller?.ready;};P.start=function(){return G.Scene_MenuBase.prototype.start.call(this);};P.update=function(){};
 const tick=()=>{G.Graphics.frameCount++;if(G.$gameScreen._flashDuration>0)G.$gameScreen._flashDuration--;m.changeScene();m.updateScene();G.Input.trigger.clear();G.Input.repeat.clear();};
 const pump=async(predicate,max=180)=>{for(let i=0;i<max;i++){if(predicate())return;G.$gameMessage.clear();tick();await flush();}throw Error('event defeat pump bounded failure '+JSON.stringify({scene:m._scene?.constructor?.name,map:G.$gameMap.mapId(),pending:h.state().world.pendingReturn,blocked:h.app.saveBlocked,last:h.flow.lastOutcome,F:observed}));};
 m.goto(G.Scene_Map);await pump(()=>m._scene.isStarted()&&!!ports.state.atomicWorldContent(()=>s=>({value:s.lifecycle})).travelLease?.mapBirth?.frame);
 const init=G.PSFlow.initializeBlackoutCompanions();if(init)assert.equal((await init).status,'completed');await pump(()=>!h.app.saveBlocked&&!G.PSWorld.pending());
 const legacy=h.flow.returnHome;h.flow.returnHome=function(...args){const result=Reflect.apply(legacy,this,args);observed.legacyCalls.push(structuredClone(result));return result;};
 h.flow.seed=[1,2,3,4];observed.worldPrefixAtStart=[...h.draws];observed.nativePrefixAtStart=[...h.nativeDraws];
 const args={kind:'wild',foes:'Pidgey:30',battleId:'event-defeat-F',canLose:options.canLose?'true':'false',resultVariable:'0',defaultWeather:'',defaultTerrain:'',battleEnvironment:'',battleTime:'0',battleEffects:'on',expGain:'true',canSwitch:'true'};
 const command=(code,parameters=[])=>({code,indent:0,parameters}),interpreter=G.$gameMap._interpreter;
 interpreter.setup([command(357,['PS_BattleFlow','StartBattle','Start battle',args]),command(0)],0);interpreter.update();
 await pump(()=>m._scene?._psBattle&&m._scene._controller?.ready);
 const scene=m._scene,session=scene._session;assert.equal(scene.create,originals.create,'real Scene.create retained');assert.equal(scene.onEnd,originals.onEnd,'real Scene.onEnd retained');
 if(scene._failure){observed.controllerOpeningFailure=String(scene._failure.stack??scene._failure);throw scene._failure;}assert(session&&h.flow._op.session===session,'actual App session published by real begin');
 observed.normalizedRequest=structuredClone(h.flow._op.request);observed.sessionFactoryHandle={class:session.constructor.name,battleId:session.battleId};observed.worldAfterCreate=[...h.draws];
 for(let i=0;i<4&&!session.finished;i++)await session.chooseMove(1);
 assert.equal(session.finished,true,'real gateway battle ended');observed.actualBattleResult=structuredClone(session.result());assert.equal(observed.actualBattleResult.outcome.kind,'win');assert.equal(observed.actualBattleResult.outcome.winner,'Wild');
 observed.generationBeforeFinish=h.app.stateGeneration;if(options.lateGeneration)h.flow.stateReplaced();scene.onEnd();await flush();observed.generationAfterFinish=h.app.stateGeneration;observed.lateStale=structuredClone(h.flow.lastStale);
 observed.privateRouting=typeof h.app.isBattleBlackoutRouted==='function'?h.app.isBattleBlackoutRouted(session,session.battleId):null;
 // Let the real Map/source load chain settle, retaining bounded failures as observations.
 for(let i=0;i<(options.lateGeneration?2:180);i++){G.$gameMessage.clear();tick();await flush();if(m._scene instanceof G.Scene_Map&&m._scene.isStarted()&&!G.$gamePlayer.isTransferring()&&!h.app.saveBlocked)break;}
 observed.final={party:structuredClone(h.state().party),escapePoint:structuredClone(h.state().world.escapePoint),companions:structuredClone(h.state().world.companions),switch1:G.$gameSwitches.value(1),mapId:G.$gameMap.mapId(),x:G.$gamePlayer.x,y:G.$gamePlayer.y,blocked:h.app.saveBlocked,pending:structuredClone(h.state().world.pendingReturn),money:h.state().money,stats:structuredClone(h.state().stats),appliedBattles:structuredClone(h.state().appliedBattles),outcome:structuredClone(h.flow.lastOutcome),legacyReturn:structuredClone(h.flow.lastReturn),diagnostics:structuredClone(G.PSWorld.diagnostics)};
 observed.worldCompletePrefix=[...h.draws];observed.nativeCompletePrefix=[...h.nativeDraws];observed.actualSaveExecutorCalls=h.saves.length;observed.saves=h.saves.map(s=>({...s,scene:undefined}));
 const terminal=structuredClone(h.state());for(let i=0;i<12;i++){G.$gameMessage.clear();tick();await flush();}assert.deepEqual(h.state(),terminal,'idle frames do not replay settled F state');assert.equal(h.saves.length,observed.actualSaveExecutorCalls,'late native frames do not replay a retired save');observed.idleFrames=12;
 fs.writeFileSync(artifact,JSON.stringify(observed,null,2)+'\n');
 return{...h,observed,restore(){for(const f of restore)f();}};
 }catch(error){observed.failure=error.stack;fs.writeFileSync(artifact,JSON.stringify(observed,null,2)+'\n');for(const f of restore)f();throw error;}
}
module.exports={fixture};
