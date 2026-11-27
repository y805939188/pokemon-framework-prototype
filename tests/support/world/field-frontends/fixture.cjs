'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const frame=require('../mz-native-frame-support.cjs'), originalFrame=frame.frameFixture;
// Only remove the donor driver's artificial flash decrement. Actual Map.updateMain
// now owns the single native Screen.update/updateFlash per frame.
frame.frameFixture=async(...args)=>{
 const h=await originalFrame(...args),G=h.G;
 h.tick=()=>{G.Graphics.frameCount++;G.SceneManager.changeScene();G.SceneManager.updateScene();h.input.trigger.clear();h.input.repeat.clear();};
 return h;
};
const {fixture:base,flush}=require('../../field/ui-wire-travel-fixtures.cjs');
const {renderer}=require('./native-renderer.cjs');
const runtime=require('../../../../scripts/tests/final-production-runtime.cjs');
const fieldIds=['cut','rocksmash','surf','flash','sweetscent'];
function event(id,name,x,y){return{id,name,x,y,pages:[{conditions:{switch1Valid:false,switch2Valid:false,variableValid:false,selfSwitchValid:false,itemValid:false,actorValid:false},image:{tileId:0,characterName:'Actor2',characterIndex:0,direction:2,pattern:1},priorityType:1,through:false,trigger:0,moveType:0,moveSpeed:4,moveFrequency:3,walkAnime:true,stepAnime:false,directionFix:false,list:[{code:0,indent:0,parameters:[]}]}]};}
async function fixture(move,options={}){
 assert(fieldIds.includes(move));const {E,T}=runtime.get();const family=process.env.PF_FINAL_PRODUCTION_FAMILY;
 const presentation=['field-presentation-terminal','field-presentation-i18n','travel-presentation-initial','travel-presentation-source-controls'].includes(family);
 const ordinaryAuthor=presentation||options.ordinaryAuthor===true, authorMove=presentation?(options.presentationMove??move):move;
 const o={effectNames:[],effects:0,radii:[],sounds:[],buffers:[],audioHardwareCalls:0,clears:0,erases:[],flashes:[],screenUpdates:0,flashUpdates:0,sessionStarts:[],openings:0,messages:[],idle:[],messageCompletions:[],nativeArrivals:[],completedSteps:[]};
 let h,author;
 h=await base({defaultProduction:true,autosave:false,move,
  ...(ordinaryAuthor?{ordinaryAuthorInput(){assert(author,'case author input must be compiled before installing the ordinary IIFE');return author;}}:{}),
  edit(game,content){
   if(ordinaryAuthor){
    author=require('./ordinary-author-input.cjs').prepare(runtime.get(),authorMove);
    Object.keys(content).forEach(key=>delete content[key]);Object.assign(content,author.initialContent);
    const encounter=move==='rocksmash'||move==='sweetscent';
    const member=E.speciesKey.toPersistentMember(E.memberFactory.createMember({
     species:'Snorlax',level:5,id:encounter?'e2-player':game.party[0].id,owner:encounter?{id:1,name:'E2',gender:0,language:2}:game.player
    },content,n=>Math.floor(n*.23)),content);
    member.moves=member.moves.filter(row=>row.id===authorMove);assert.equal(member.moves.length,1);member.item='';
    if(!encounter)member.hp=20;
    const before=game.world;
    const initial=E.state.newGame({content,party:[member],money:12,...(!encounter?{bag:{repel:2,potion:3}}:{})});
    if(!encounter)Object.assign(initial.world,{visitedMaps:before.visitedMaps,escapePoint:before.escapePoint,healingSpot:before.healingSpot});
    Object.assign(game,initial);game.badges=Array(8).fill(true);game.world.companions=[];
    options.edit?.(game,content);
    assert.deepEqual(E.saveSchema.validateGameContent(game,content),[],'legal compiled form0/empty-held ordinary input');
    return;
   }
   if(move==='rocksmash'||move==='sweetscent'){
    // The direct-battle donor's legacy fixture has no ordinary wild rule-family
    // identity. Use the same formal compile/assemble path as the accepted E1
    // production fixture; ruleSpecies, canonical gender and static forms are
    // derived by production code, never invented by this test.
    const root=runtime.get().root,read=name=>JSON.parse(fs.readFileSync(path.join(root,'content/sample',name+'.json'),'utf8'));
    const species=read('species').filter(row=>['snorlax','pidgey'].includes(row.id)).map(row=>({...row,abilities:[row.id==='snorlax'?'immunity':'keeneye'],hiddenAbilities:[],wildItemCommon:[],wildItemUncommon:[],wildItemRare:[],learnset:[{level:1,move},{level:1,move:'tackle'}],evolutions:[]}));
    const slots=[{species:'pidgey',weight:1,minLevel:5,maxLevel:5}];
    const inputs={manifest:{...read('manifest'),id:'e2-current-'+move},sources:read('sources'),species,overlays:[],settings:{AFFECTION_EFFECTS:false},regionalDex:{source:'author-placeholder',national:['snorlax','pidgey'],regions:[]},mapMetadata:{source:'author-placeholder',maps:{5:{outdoor:false,environment:'grass'},6:{outdoor:true},7:{outdoor:true}}},encounters:{source:'author-placeholder',tables:[{mapId:5,version:0,types:{Land:{stepChance:1,slots},RockSmash:{stepChance:100,slots}}}]}};
    const compiled=E.contentCompile.compileContent(inputs);assert.equal(compiled.ok,true,JSON.stringify(compiled.errors));const assembled=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(assembled.errors,[]);
    Object.keys(content).forEach(key=>delete content[key]);Object.assign(content,assembled.content);assert(E.contentRuntime.validatedContentIdentity(content));
    const member=E.speciesKey.toPersistentMember(E.memberFactory.createMember({species:'Snorlax',level:5,id:'e2-player',owner:{id:1,name:'E2',gender:0,language:2}},content,n=>Math.floor(n*.23)),content);member.moves=member.moves.filter(row=>row.id===move);assert.equal(member.moves.length,1);member.item='';
    Object.assign(game,E.state.newGame({content,party:[member],money:12}));game.badges=Array(8).fill(true);game.world.companions=[];
    const file=path.join(process.env.PF_E2_FRONT_ROOT,'INITIAL-CONTENT.json');fs.writeFileSync(file,JSON.stringify({inputs,compiled:compiled.data,validatedIdentity:content.meta,party:game.party},null,2)+'\n',{flag:'wx'});
    options.edit?.(game,content);assert.deepEqual(E.saveSchema.validateGameContent(game,content),[]);return;
   }
   const fixture=T.fixtureContent;
   for(const name of ['Snorlax','Pidgey'])content.species[name]={...structuredClone(fixture.species[name]),abilities:[name==='Snorlax'?'Immunity':'Keen Eye'],gender:'F50',types:name==='Snorlax'?['Normal']:['Normal','Flying']};
   for(const name of ['A','B','C','constructor','__proto__','toString'])delete content.species[name].types;
   content.species.Pidgey.learnset={1:['tackle']};content.abilities={...content.abilities,...fixture.abilities};
   const pp={cut:30,rocksmash:15,surf:15,flash:20,sweetscent:20};for(const id of fieldIds)content.moves[id]={id,name:{cut:'Cut',rocksmash:'Rock Smash',surf:'Surf',flash:'Flash',sweetscent:'Sweet Scent'}[id],pp:pp[id]};
   content.moves.tackle={id:'tackle',name:'Tackle',pp:35};
   game.party[0]={...game.party[0],species:'Snorlax',form:0,level:5,exp:E.growth.minExp('slow',5),hp:20,item:'',ability:'Immunity',abilityIndex:0,effectiveAbilityIndex:0,nature:'hardy',statNature:null,gender:'M',moves:[{id:move,pp:pp[move],maxpp:pp[move],ppUps:0}]};
   game.world.companions=[];game.world.weather.type='None';game.world.flashUsed=false;game.badges=Array(8).fill(true);
   content.registrationOrder=[{species:'Snorlax',form:0},{species:'Pidgey',form:0}];
   content.mapMetadata.maps[5]={outdoor:false,environment:'grass',darkMap:move==='flash'};
   content.world.encounters.tables.find(t=>t.mapId===5).types={Land:{stepChance:1,slots:[{species:'Pidgey',weight:1,minLevel:5,maxLevel:5}]},RockSmash:{stepChance:100,slots:[{species:'Pidgey',weight:1,minLevel:5,maxLevel:5}]}};
   options.edit?.(game,content);
   assert.deepEqual(E.saveSchema.validateGameContent(game,content),[],'legal supported form0/empty-held initial input');
  },
  nativeSetup(n,context){
   const G=n.G;
   const scenes=fs.readFileSync(path.join(runtime.get().root,'js/reactor_scenes.js'),'utf8'),name='Scene_Map.prototype.isReady',a=scenes.indexOf(name+' = function'),b=scenes.indexOf('\n};',a);assert(a>=0&&b>a);
   vm.runInContext(scenes.slice(a,b+4),G,{filename:'pinned-current-e2:Scene_Map.isReady'});
   G.Scene_Message.prototype.isReady=()=>true;G.DataManager.isMapLoaded=()=>G.$dataMap!==null;
   // Preserve the original sibling harness inputs without opting those workers into E2 author content.
   if(!ordinaryAuthor){
    const parameters=G.PluginManager.parameters;
    G.PluginManager.parameters=function(name){const p=Reflect.apply(parameters,this,[name]);return name==='PS_BattleFlow'?{...p,contentSource:'fixture'}:p;};
   }
   renderer(G,o);
   const raw=context.maps[5];
   if(move==='surf')for(let y=0;y<8;y++)for(let x=3;x<=5;x++)raw.data[(3*8+y)*10+x]=1;
   if(move==='cut'){raw.events[1]=event(1,'cuttree primary',3,2);raw.events[2]=event(2,'cuttree late target',2,3);}
   if(move==='rocksmash')raw.events[1]=event(1,'smashrock current',3,2);
   G.$gameMap._events=[];for(let id=1;id<raw.events.length;id++)if(raw.events[id])G.$gameMap._events[id]=new G.Game_Event(5,id);
   const checkHere=G.Game_Player.prototype.checkEventTriggerHere;
   G.Game_Player.prototype.checkEventTriggerHere=function(...args){try{o.nativeArrivals.push({frame:G.Graphics.frameCount,args:structuredClone(args),currentPlayer:this===G.$gamePlayer});}catch{/* Passive observation cannot replace native dispatch. */}return Reflect.apply(checkHere,this,args);};
   const erase=G.Game_Event.prototype.erase;G.Game_Event.prototype.erase=function(...args){o.erases.push({eventId:this.eventId(),mapId:G.$gameMap.mapId(),frame:G.Graphics.frameCount});return Reflect.apply(erase,this,args);};
   for(const key of ['startFlash','update','updateFlash']){const original=G.Game_Screen.prototype[key];G.Game_Screen.prototype[key]=function(...args){if(key==='startFlash')o.flashes.push({frame:G.Graphics.frameCount,args:structuredClone(args)});else if(key==='update')o.screenUpdates++;else o.flashUpdates++;const result=Reflect.apply(original,this,args);if(key==='startFlash')options.onFlash?.(h,args);return result;};}
   const add=G.$gameMessage.add;G.$gameMessage.add=function(...args){o.messages.push(String(args[0]));options.onMessage?.(h,args[0]);return Reflect.apply(add,this,args);};
   options.nativeSetup?.(n,context,o);
  },
  beforeUpgrade(n){
   if(ordinaryAuthor){
    assert.equal(n.flow.rng,null);assert.equal(n.flow.clock,null);assert.equal(n.flow.seed,undefined);assert.equal(n.flow.fast,false);
   }else{
    n.flow.rng=size=>{n.draws.push(size);return move==='surf'&&size===100?99:0;};
    n.flow.clock=()=>0;n.flow.seed=[1,2,3,4];n.flow.fast=true;
   }
   options.beforeUpgrade?.(n);
  }
 });
 const {G,app}=h,m=G.SceneManager;
 assert(app instanceof E.app.GameApplication);assert.strictEqual(G.PSFlow.app(),app);
 if(ordinaryAuthor){
  assert.notEqual(G.PluginManager.parameters('PS_BattleFlow').contentSource,'fixture');
  assert.equal(author.reads,1);assert.equal(E.contentRuntime.validatedContentIdentity(h.flow.content()),author.evidence.contentIdentity);
 }else assert.equal(G.PluginManager.parameters('PS_BattleFlow').contentSource,'fixture');
 assert(/orig\.apply/.test(String(G.Scene_Map)));
 const P=G.Scene_PSBattle.prototype;
 P.isReady=function(){return !!this._controller?.ready;};P.start=function(){return G.Scene_MenuBase.prototype.start.call(this);};P.update=function(){};
 const open=G.PSFlow.openAdmittedWorldBattle;G.PSFlow.openAdmittedWorldBattle=function(...args){o.openings++;return Reflect.apply(open,this,args);};
 const start=app.startAdmittedWorldBattle;app.startAdmittedWorldBattle=function(...args){const row={frame:G.Graphics.frameCount,status:'starting'};o.sessionStarts.push(row);const result=Reflect.apply(start,this,args);return result.then(session=>{row.status='accepted';row.class=session.constructor.name;return session;},error=>{row.status='failed';row.error=String(error);throw error;});};
 let landingReplay;
 const nativeLand=G.PSWorld.fieldMoves.landSurf;
 G.PSWorld.fieldMoves.landSurf=function(operation,...args){
  const record=operation.recordSurfLandingCompletion;
  if(typeof record==='function')operation.recordSurfLandingCompletion=function(...values){landingReplay={context:this,callback:record,receipt:values[0]};return Reflect.apply(record,this,values);};
  return Reflect.apply(nativeLand,this,[operation,...args]);
 };
 const runStep=app.world.runCompletedStep;
 app.world.runCompletedStep=function(...args){const pending=Reflect.apply(runStep,this,args);pending.then(result=>{try{o.completedSteps.push({kind:args[0].kind,id:args[0].step.id,status:result.status,reason:result.reason,prefix:structuredClone(result.prefix)});}catch{/* Passive observation cannot change the real D promise. */}},()=>{});return pending;};
 const replayLandingCompletion=()=>{assert(landingReplay);return Reflect.apply(landingReplay.callback,landingReplay.context,[landingReplay.receipt]);};
 const births=[],publicRefs=new WeakMap();let nextPublicRef=0;
 const publicRef=value=>{if(value===null||(typeof value!=='object'&&typeof value!=='function'))return null;if(!publicRefs.has(value))publicRefs.set(value,++nextPublicRef);return publicRefs.get(value);};
 const observeBirth=(label,receiver)=>{
  // Passive public observations only. Private native leases are not observable
  // through the narrowed World snapshot and are deliberately UNKNOWN here.
  // An observer failure must never prevent the original native movement call.
  try{const scene=m._scene;births.push({label,frame:G.Graphics.frameCount,actualLoadedFlag:scene?._mapLoaded,sceneRef:publicRef(scene),mapRef:publicRef(G.$gameMap),dataRef:publicRef(G.$dataMap),playerRef:publicRef(G.$gamePlayer),receiverIsCurrentPlayer:receiver===undefined?undefined:receiver===G.$gamePlayer,privateLease:'UNKNOWN'});}
  catch(error){births.push({label,observation:'UNKNOWN',error:String(error)});}
 };
 const nativeJump=G.Game_Player.prototype.jump;G.Game_Player.prototype.jump=function(...args){observeBirth('actual-owned-native-jump',this);return Reflect.apply(nativeJump,this,args);};
 const genuineMap=async()=>{const old=m._scene;G.PSWorld.loadSucceeded();m.goto(G.Scene_Map);await h.pump(()=>m._scene!==old&&m._scene instanceof G.Scene_Map&&m._scene.isStarted());await h.pump(()=>!app.saveBlocked&&!G.PSWorld.pending()&&!G.PSFlow.companionNativePending());observeBirth('explicit-genuine-Map');return m._scene;};
 await genuineMap();
 const outcomes=()=>h.calls.filter(x=>x.kind==='outcome');
 const waitIdle=async label=>{
  let stable=0;
  for(let attempt=0;attempt<60;attempt++){
   // No input or flag clearing: allow the actual UI/World/Map continuations to
   // release themselves before a new action is authored.
   await flush();h.tick();
   const scene=m._scene,row={label,attempt,frame:G.Graphics.frameCount,canMove:G.$gamePlayer.canMove()===true,messageBusy:G.$gameMessage.isBusy(),messageText:G.$gameMessage.allText(),eventRunning:G.$gameMap.isEventRunning(),routeForcing:G.$gamePlayer.isMoveRouteForcing(),followersGathering:G.$gamePlayer.areFollowersGathering(),vehicleGettingOn:G.$gamePlayer._vehicleGettingOn,vehicleGettingOff:G.$gamePlayer._vehicleGettingOff,inVehicle:G.$gamePlayer.isInVehicle(),sceneActive:scene?.isActive()===true,save:app.saveBlocked,encounter:app.encounterBlocked,world:G.PSWorld.pending(),companions:G.PSFlow.companionNativePending(),ui:G.PSManagement.fieldPresentationPending(),changing:m.isSceneChanging(),map:scene instanceof G.Scene_Map,started:scene?.isStarted()===true};
   o.idle.push(row);const idle=row.canMove&&!row.save&&!row.encounter&&!row.world&&!row.companions&&!row.ui&&!row.changing&&row.map&&row.started;
   stable=idle?stable+1:0;if(stable===2)return;
  }
  assert.fail('E2 bounded actual input-idle never released '+JSON.stringify(o.idle.slice(-10)));
 };
 const windows=fs.readFileSync(path.join(runtime.get().root,'js/reactor_windows.js'),'utf8'),marker='Window_Message.prototype.terminateMessage = ',from=windows.indexOf(marker),to=windows.indexOf('\n};',from);assert(from>=0&&to>from);
 const terminateMessage=vm.runInContext('('+windows.slice(from+marker.length,to+2)+')',G,{filename:'pinned-current-e2:Window_Message.terminateMessage'});
 const acknowledgeVisibleMessage=label=>{
  const message=G.$gameMessage;if(!message.hasText())return;
  assert.equal(message.isChoice(),false);assert.equal(message.isNumberInput(),false);assert.equal(message.isItemChoice(),false);
  const row={label,frame:G.Graphics.frameCount,text:message.allText(),beforeBusy:message.isBusy(),close:0,goldClose:0,protocol:'pinned Window_Message.terminateMessage with controlled message-renderer backend; no hardware input claim'};
  const view={close(){row.close++;},_goldWindow:{close(){row.goldClose++;}}};
  Reflect.apply(terminateMessage,view,[]);assert.strictEqual(G.$gameMessage,message);row.afterBusy=message.isBusy();assert.equal(row.close,1);assert.equal(row.goldClose,1);assert.equal(row.afterBusy,false);o.messageCompletions.push(row);
 };
 const closeOverlay=async()=>{acknowledgeVisibleMessage('normal-message-completion-before-next-input');if(h.overlay())h.press('cancel');await h.settle(2);};
 const shortcut=async()=>{await waitIdle('before-new-357');const count=outcomes().length;h.event([h.command('PS_Management','ShowFieldShortcuts'),{code:230,indent:0,parameters:[2]},{code:0,indent:0,parameters:[]}]);h.tick();await h.pump(()=>!!h.overlay());h.press('ok');await h.pump(()=>outcomes().length>count);return outcomes().at(-1).result;};
 const party=async()=>{
  await waitIdle('before-new-Party');const count=outcomes().length,old=m._scene;m.push(G.Scene_Menu);h.tick();const menu=m._scene;menu._commandWindow.handlers.psParty();h.ready();h.press('ok');h.choose('field-actions');assert(h.overlay());const party=m._scene;
  h.press('ok');await h.pump(()=>outcomes().length>count);
  const preparation=h.calls.findLast(x=>x.kind==='prepare');assert(preparation);assert(preparation.scene instanceof G.Scene_Map);for(const prior of[old,menu,party])assert.notStrictEqual(preparation.scene,prior);
  assert(h.calls.findIndex(x=>x.kind==='end-management')<h.calls.findIndex(x=>x===preparation));assert.equal(preparation.blocked,false);observeBirth('Party-returned-current-Map');const outcome=outcomes().at(-1).result;if(outcome.status==='completed')await waitIdle('after-successful-Party-before-new-input');return outcome;
 };
 const battleAccepted=async()=>{
  // At 60 Hz the ordinary wild Map wrapper needs at least 129 frames for
  // 800 + 1250 + 100 ms, before native scene change / Session readiness.
  // Allow 3 s of the existing frame clock here; keep the shared UI pump bound.
  const ready=()=>m._scene?._controller?.ready&&o.sessionStarts.some(x=>x.status==='accepted');
  if(ordinaryAuthor){
   const frameLimit=180;
   const handoff=o.battleHandoff={frameLimit,firstFrame:G.Graphics.frameCount,mode:G.PSFlow._op?.prebattleMode??null,
    firstPhase:G.PSFlow.prebattleState()?.phase??null};
   try{await h.pump(ready,frameLimit);}
   finally{
    const current=m._scene,outcome=G.PSFlow.lastOutcome;
    Object.assign(handoff,{lastFrame:G.Graphics.frameCount,prebattle:G.PSFlow.prebattleState(),
     scene:current?.constructor?.name??null,nextScene:m._nextScene?.constructor?.name??null,
     actualBattleScene:current?._psBattle===true,controllerReady:current?._controller?.ready===true,
     controllerFailure:current?._controller?.failure?String(current._controller.failure):null,
     lastOutcome:outcome?{aborted:outcome.aborted,commit:outcome.commit,error:outcome.error}:null});
   }
   assert.equal(handoff.mode,'default-map');assert.equal(handoff.actualBattleScene,true);
   assert.equal(handoff.prebattle?.primaryError,null);assert.equal(handoff.prebattle.phase,'battle');
   const stages=Array.from(handoff.prebattle.stages);
   assert.deepEqual(stages.map(stage=>stage.phase),['flash','transition','after','battle']);
   assert.deepEqual(stages.map(stage=>stage.targetMs),[800,1250,100,0]);
   for(let i=1;i<stages.length;i++){
    assert(stages[i].frame>stages[i-1].frame);
    assert(stages[i].at-stages[i-1].at>=stages[i-1].targetMs);
   }
  }else await h.pump(ready);
  const scene=m._scene,session=scene._session;assert(session);assert.equal(session.constructor.name,'BattleSession');assert.strictEqual(G.PSFlow._op.session,session);assert.equal(session.finished,false);assert.equal(o.sessionStarts.filter(x=>x.status==='accepted').length,1);
  const observation={class:session.constructor.name,source:G.PSFlow._op.request.kind,battleId:session.battleId,sessionActual:true,unfinished:!session.finished,...(ordinaryAuthor?{engineSeed:session.gw.prngSeed()}:{})};
  G.PSFlow.abort(Error('finite E2 accepted-session verification complete'));m.pop();await h.pump(()=>m._scene instanceof G.Scene_Map&&!app.saveBlocked&&!G.PSFlow.running);assert.equal(Object.keys(h.state().appliedBattles).length,0);return observation;
 };
 return{...h,o,births,...(ordinaryAuthor?{ordinaryAuthor:author.evidence,businessEntropy:author.entropyRows}:{}),genuineMap,outcomes,waitIdle,closeOverlay,shortcut,party,battleAccepted,replayLandingCompletion,flush};
}
// Adversarial display-only input: the actual author artifact has already been
// loaded and frozen. A detached, documented host port represents third-party
// display data, not an author-file capability or in-place product mutation.
function displayNamePort(h,move,value){
 const allowed={TEXT25:'Author blade',TEXT26:'Author blade',TEXT27:'cut',TEXT28:'cut',TEXT46:'',TEXT47:17,TRAVEL35:'dig',TRAVEL36:'dig',SOURCE17:'Dig'};
 const sel=process.env.PF_FINAL_PRODUCTION_SELECTOR;
 assert(Object.hasOwn(allowed,sel)&&Object.is(allowed[sel],value),'unregistered display control');
 const flow=h.G.PSFlow,original=flow.content(),dictionary=original.moves;
 assert(h.ordinaryAuthor&&Object.isFrozen(original)&&Object.isFrozen(dictionary));
 const keys=Object.keys(dictionary).filter(key=>dictionary[key].id===move);
 assert(keys.length&&keys.every(key=>Object.isFrozen(dictionary[key])));
 const originalName=dictionary[keys[0]].name,copy={...dictionary[keys[0]],name:value},moves={...dictionary};
 for(const key of keys)moves[key]=copy;
 const port={...original,moves};flow._content=port;
 assert.strictEqual(flow._content,port);assert.equal(original.moves[keys[0]].name,originalName);
 h.o.controlledDisplay={selector:sel,move,originalName,label:value,kind:'detached display port; ordinary file unchanged'};
 return copy;
}
module.exports={fixture,flush,displayNamePort};
