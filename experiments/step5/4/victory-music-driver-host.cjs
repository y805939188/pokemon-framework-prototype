'use strict';
// SYNTHETIC_CONTROL: real compiled three plugins, original AudioManager and real
// Gen8 App/Session. Rendering, keyboard, audio nodes and clocks are controlled.
// These reports never qualify native execution; the native freezer rejects the
// placeholder media and an external NW supervisor is still required.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm');
const {createCompositionHostFactory}=require('./battle-music-composition-host.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function createVictoryDriverHost({ROOT,work,plugins,driverText,entryText,PLAN,options={}}){
 let input={triggered:{},repeated:{},pressed:{}};
 // Connect the original controlled frames before product hooks capture Input.
 // Replacing these getters afterwards would discard nativeConsumed suppression.
 const beforeProduct=function(G){
  options.beforeProduct?.call(this,G);
  const key=k=>k==='ok'?'use':k==='cancel'||options.prebattleWorld&&k==='menu'?'back':k;
  G.Input.isPressed=k=>!!input.pressed[key(k)];
  G.Input.isTriggered=k=>!!input.triggered[key(k)];
  G.Input.isRepeated=G.Input.isTriggered;
  require('./victory-native-scenes.cjs').install(G,ROOT);
 };
 // A seeded status characterization may load only verified staged Flow in its own VM; never
 // copy its bytes into the ordinary game tree or replace SaveLocation's verified storage.
 const statusStage=options.scopedStatusStage;
 if(statusStage){assert.equal(statusStage.scope,'EXPLICIT_ISOLATED_LEGACY_FIXTURE_NOT_ORDINARY');statusStage.verify();}
 const vmPlugins=statusStage?{...plugins,PS_BattleFlow:fs.readFileSync(statusStage.artifacts.PS_BattleFlow,'utf8')}:plugins;
 const world=createCompositionHostFactory({ROOT,work,plugins:vmPlugins}),w=world({evolution:'plugin',productionTranslator:options.productionTranslator===true,prebattleWorld:options.prebattleWorld===true,legacyDefeatCompat:options.legacyDefeatCompat===true,beforeProduct}),G=w.G,M=w.manager,A=w.AM,E=require(path.join(ROOT,'js/engine/build/production.cjs'));
 // Run the actual entry's presenter policy before unrelated global hooks. The
 // complete driver must inherit this policy, not assume the plugin's default.
 assert.equal(typeof entryText,'string');const stop=Symbol('entry boundary'),descriptor=Object.getOwnPropertyDescriptor(M,'isGameActive'),priorNW=G.nw;
 Object.defineProperty(M,'isGameActive',{configurable:true,set(){throw stop;}});G.nw={App:{argv:['--ps-flow-test='+(options.prebattleWorld?'d2-prebattle-wrapper':'d2-victory-music'),'--ps-sound']}};
 try{vm.runInContext(entryText,G,{filename:'actual-PS_BattleFlowTest-entry.js'});}catch(e){if(e!==stop)throw e;}finally{if(descriptor)Object.defineProperty(M,'isGameActive',descriptor);else delete M.isGameActive;if(priorNW===undefined)delete G.nw;else G.nw=priorNW;}
 if(options.prebattleWorld){function Menu(){this.initialize();}Menu.prototype=Object.create(G.Scene_MenuBase.prototype);Menu.prototype.constructor=Menu;G.Scene_Menu=Menu;G.Window_MenuCommand={initCommandPosition(){}};}
 const duration=2.0259410430839,clipRate=44100;
 class AudioBuffer {get [Symbol.toStringTag](){return 'AudioBuffer';}constructor(){this.duration=options.badDuration?1:duration;this.sampleRate=clipRate;this.numberOfChannels=2;}}
 class Source {get [Symbol.toStringTag](){return 'AudioBufferSourceNode';}constructor(){this.buffer=null;this.loop=false;this.loopStart=0;this.loopEnd=0;this.playbackRate={value:1,setValueAtTime(v){this.value=v;}};}start(when,offset,d){this.started={when,offset,d};}stop(){this.stopped=true;}connect(){}}
 const sourceNodes=[];const context={state:'running',get currentTime(){return options.stuckClock?0:G.performance.now()/1000;},createBufferSource(){const n=new Source();sourceNodes.push(n);return n;}};G.WebAudio._context=context;
 const BP=G.WebAudio.prototype;
 BP.play=function(loop,offset=0){
  this._loop=loop;this._pos=offset;if(!this.isReady()){this._pending={loop,offset};return;}
  this._buffers??=[new AudioBuffer()];this._loopStartTime=0;this._loopLengthTime=this._buffers[0].duration;this._startTime=context.currentTime-offset/this.pitch;
  const source=context.createBufferSource();source.buffer=this._buffers[0];source.loop=loop;source.loopStart=0;source.loopEnd=this._loopLengthTime;source.playbackRate.value=this.pitch;source.start(context.currentTime,options.badSourceOffset?0:offset);
  this._sourceNodes=[source];this._isPlaying=true;this.plays.push({loop,offset,at:G.performance.now(),frame:G.Graphics.frameCount});w.hook?.('play',this);
  if(!loop)this._endTimer=G.setTimeout(()=>this.stop(),(this._loopLengthTime-offset)/this.pitch*1000);
 };
 const oldLoad=BP.load,oldStop=BP.stop;
 BP.load=function(){this._ready=true;this._buffers??=[new AudioBuffer()];if(this._pending){const p=this._pending;this._pending=null;this.play(p.loop,p.offset);}return oldLoad.call(this);};
 BP.seek=function(){return this._startTime===undefined?0:((context.currentTime-this._startTime)*this.pitch)%this._loopLengthTime;};
 BP.stop=function(){if(this._endTimer!==undefined){G.clearTimeout(this._endTimer);this._endTimer=undefined;}for(const s of this._sourceNodes??[])s.stop();this._sourceNodes=[];this._pending=null;return oldStop.call(this);};
 const Base=G.Scene_MenuBase,oldInit=Base.prototype.initialize;
 Base.prototype.initialize=function(...a){oldInit.apply(this,a);this._started=false;};Base.prototype.start=function(){this._started=true;};Base.prototype.isStarted=function(){return this._started;};Base.prototype.popScene=function(){M.pop();};
 function Title(){this.initialize();}Title.prototype=Object.create(Base.prototype);Title.prototype.constructor=Title;G.Scene_Title=Title;
  const titleSource=fs.readFileSync(path.join(ROOT,'js/reactor_scenes.js'),'utf8'),titleBegin=titleSource.indexOf('Scene_Title.prototype.playTitleMusic = function'),titleEnd=titleSource.indexOf('\n};',titleBegin);
  assert(titleBegin>=0&&titleEnd>titleBegin);vm.runInContext(titleSource.slice(titleBegin,titleEnd+3),G,{filename:'installed-reactor_scenes.js#playTitleMusic'});
  G.$dataSystem.titleBgm=JSON.parse(fs.readFileSync(path.join(ROOT,'data/System.json'),'utf8')).titleBgm;
  Title.prototype.start=function(){Base.prototype.start.call(this);this.playTitleMusic();};
  const battleReady=G.Scene_PSBattle.prototype.isReady,seenReady=new WeakMap();
  G.Scene_PSBattle.prototype.isReady=function(...a){const ready=battleReady.apply(this,a);if(!seenReady.has(this))seenReady.set(this,G.Graphics.frameCount);return ready&&G.Graphics.frameCount-seenReady.get(this)>=(options.battleReadyDelayFrames??0);};
 const evoUpdate=M.updateScene,queuedGoto=M.goto;
 // Delegate the already-installed production allocation hooks, then consume the
 // genuine native queue. Never construct a replacement Scene behind those hooks.
 // Some older probes expect synchronous scene selection. Where ownership is
 // tested, use the original queued goto and the stock changeScene/update order.
 if(!options.frameQueuedScenes)M.goto=function(C){const result=queuedGoto.call(this,C);this.changeScene();return result;};
 Title.prototype.create=function(){Base.prototype.create.call(this);this._commandWindow={isOpenAndActive:()=>true};this.isBusy=()=>false;};
 M.updateScene=function(){if(options.frameQueuedScenes)this.changeScene();const s=this._scene;if(!s)return;if(!s.isStarted()&&options.delayStart&&G.Graphics.frameCount<=options.delayStart)return;return evoUpdate.call(this);};
 M.goto(Title);
 G.PSManagement.inputFrame=()=>input;G.PSManagement.current=()=>null;
 G.$gameMessage.clear=()=>{};if(!options.prebattleWorld)G.$gameMap={_mapId:5,mapId(){return this._mapId;},_interpreter:{clear(){},isRunning:()=>false}};G.$dataMap={};
 if(options.returnMapCounter){
  assert(!options.prebattleWorld);const native=fs.readFileSync(path.join(ROOT,'js/reactor_objects.js'),'utf8');
  const body=name=>{const k=name+' = ',start=native.indexOf(k),end=native.indexOf('\n};',start);assert(start>=0&&end>start);return vm.runInContext('('+native.slice(start+k.length,end+2)+')',G);};
  G.$dataMap.encounterStep=20;G.$gameMap.encounterStep=body('Game_Map.prototype.encounterStep');G.$gamePlayer.makeEncounterCount=body('Game_Player.prototype.makeEncounterCount');
  const realmMath=vm.runInContext('Math',G);w.nativeEncounterBounds=[];
  realmMath.randomInt=n=>{assert.equal(n,20);w.nativeEncounterBounds.push(n);return 0;};
 }
 w.flow.limits=()=>({party:6,boxes:1200,bagPerItem:999,money:999999});w.flow.app=w.applicationFactory;w.flow._app=null;w.flow.content=()=>w.flow._content;w.flow.now=()=>12345;
 const gameDir=w.root,saveRoot=statusStage?.saves??path.join(work,'save-'+path.basename(gameDir));
 if(statusStage){assert.equal(G.StorageManager.fileDirectoryPath(),statusStage.saves+path.sep);statusStage.verify();}
 else{fs.mkdirSync(saveRoot);G.StorageManager={fileDirectoryPath:()=>saveRoot};}
 fs.mkdirSync(path.join(gameDir,'js/plugins'),{recursive:true});
 for(const[name,code]of Object.entries({...plugins,PS_BattleFlowTest:driverText}))fs.writeFileSync(path.join(gameDir,'js/plugins',name+'.js'),code);
 const assets=[];
 for(const name of ['world','battle','victory','trainer-victory']){const rel='audio/bgm/'+PLAN.prefix+name+'.ogg',file=path.join(gameDir,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'SYNTHETIC_CONTROL placeholder '+name);assets.push({path:rel,logicalName:PLAN.prefix+name,kind:'bgm',sha256:hash(fs.readFileSync(file)),expectedNativeChannels:2,nativeDurationRangeSeconds:[duration-2/44100,duration+2/44100]});}
 const packageHead='1234567890123456789012345678901234567890';fs.writeFileSync(path.join(gameDir,'package-info.json'),JSON.stringify({gitHead:packageHead,workingTreeChanges:0}));
 const inputValue={version:PLAN.version,productCommit:PLAN.productCommit,productPlugins:PLAN.productPlugins,packageHead,driverPluginSHA256:hash(driverText),planSHA256:hash(E.contentCompile.canonicalJson(PLAN)),saveRoot,assets};
 if(options.badIdentity)inputValue.driverPluginSHA256='0'.repeat(64);
 const inputFile=path.join(gameDir,'INPUT.json');fs.writeFileSync(inputFile,JSON.stringify(inputValue));
 const args={'ps-victory-music-input':inputFile,'ps-save-dir':saveRoot};const report={env:{execution:'SYNTHETIC_CONTROL_NODE_VM'},results:[]};let progress=0;
 const awardTexts=new WeakMap(),pulseFor=new WeakMap();
 function witnessTerminalScene(){
  const b=M._scene;if(!b?._psBattle||!options.ordinaryAwardInput)return;
  if(!awardTexts.has(b)){
   const whitelist=new Set();awardTexts.set(b,whitelist);const publish=b.pushMessages;
   b.pushMessages=function(messages,...rest){
    if(Array.isArray(messages)&&this._D)for(const m of messages){
     if(m.kind==='growth'){
      for(const line of this._D.message({...m,levelUps:[]}))whitelist.add(line);
      for(const level of m.levelUps)for(const line of this._D.message({...m,exp:0,levelUps:[level]}))whitelist.add(line);
     }else if(m.kind==='end'&&m.reason==='caught')for(const line of this._D.message(m))whitelist.add(line);
    }
    return Reflect.apply(publish,this,[messages,...rest]);
   };
  }
  const view=b.ordinaryMessageState?.(),text=b._log?._lines?.join(' '),panel=b.levelStatsState?.();
  if(options.onOrdinarySample)options.onOrdinarySample({frame:G.Graphics.frameCount,mode:b._mode,ball:b.ballFeedbackState?.()?.frame?.phase,closed:b.ballFeedbackState?.()?.closed,hide:b.ballFeedbackState?.()?.hideSampledUpdate,melody:b.captureMelodyState?.()?.completed,view:view?.phase,text,panel:panel?.phase,queued:b._queue?.length,finished:b._session?.finished,stamp:view?.fullyShownAt});
  if(!b._session?.finished||panel||view?.implementation!=='paused-message-v1'||view.phase!=='full'||!awardTexts.get(b).has(text)||pulseFor.get(b)===view.fullyShownAt)return;
  pulseFor.set(b,view.fullyShownAt);input.triggered.use=true;input.pressed.use=true;
  (report.ordinaryAwardConfirmations??=[]).push({frame:G.Graphics.frameCount,text,stamp:view.fullyShownAt});
 }
 // Ordinary receiving owns user-visible input after a caught battle, even when the
 // old fixture's debug receiveOptions is ignored. Follow only this owned operation.
 let lastReceivePulse=-Infinity,lastSignature=null,receiveOwner=null;
 if(options.ordinaryReceivingInput){
  assert(options.frameQueuedScenes && typeof plugins.PS_Management==='string');
  G.Input.keyMapper??={};G.TouchInput.isCancelled??=()=>false;
  vm.runInContext(plugins.PS_Management,G,{filename:'ordinary-PS_Management.js'});
 }
 function witnessReceivingScene(){
  if(!options.ordinaryReceivingInput)return;
  const menu=G.PSManagement.current(),dex=G.PSEvolution.current(),pending=w.flow._app?.pendingReceiving;
  let role,key,choice,owner;
  if(menu?.ready&&menu.view.kind==='menu'&&pending){
   assert.deepEqual(Array.from(menu.view.items,r=>r.key),['yes','no']);role='nickname';owner=pending.token;receiveOwner=owner;
   const cursor=menu.view.cursor;assert(cursor===0||cursor===1);key=cursor===1?'ok':'down';choice=menu.view.items[cursor].key;
  }else if(dex?.ready&&['dex-message','entry'].includes(dex.layer)&&dex.owner===receiveOwner){role=dex.layer;owner=dex.owner;key='ok';choice=role;}
  else return;
  assert.match(owner,/^receive:/);const sig=[owner,role,choice,key].join(':');
  if(sig===lastSignature||G.Graphics.frameCount-lastReceivePulse<5)return;
  lastSignature=sig;lastReceivePulse=G.Graphics.frameCount;const raw=key==='ok'?'use':key;
  input.triggered[raw]=true;input.pressed[raw]=true;(report.ordinaryReceivingInputs??=[]).push({frame:G.Graphics.frameCount,role,owner,choice,key});
 }
 const frames=async(n)=>{for(let i=0;i<n;i++){
  witnessTerminalScene();witnessReceivingScene();
  G.Graphics.frameCount++;w.tick(1000/60);for(const b of w.created)if(!b.destroys&&!b._ready)b.load();
  M.updateScene();await flush();input={triggered:{},repeated:{},pressed:{}};
 }};
 const waitFor=async(cond,label,max=2400)=>{for(let i=0;i<max;i++){if(cond())return;await frames(1);}throw Error('bounded wait: '+label+' '+JSON.stringify({mode:M._scene?._mode,message:M._scene?.ordinaryMessageState?.(),lines:M._scene?._log?._lines,stats:M._scene?.levelStatsState?.(),queue:M._scene?._queue?.map(m=>m?.kind),evolution:G.PSEvolution.current(),errors:w.errors,flowError:w.flow.lastOutcome?.error}));};
 const scene=()=>M._scene,battle=()=>scene()?._psBattle?scene():null;
 const press=async(key)=>{input={triggered:{[key==='ok'?'use':key==='cancel'?'back':key]:true},repeated:{},pressed:{[key==='ok'?'use':key==='cancel'?'back':key]:true}};await frames(3);await frames(3);};
 // Stock Window_Base has destroy; this controlled host models that lifecycle too.
 G.Window_Base.prototype.destroy??=function(){this._destroyed=true;this.visible=false;};
 const waitBattlePresentation=async(condition,label)=>{for(let count=0;count<200;count++){await waitFor(()=>condition()||!!battle()?.levelStatsState?.(),label);if(condition())return;const b=battle(),page=b.levelStatsState();await frames(1);await press('ok');(report.levelStatsConfirmations??=[]).push({level:page.level,phase:page.phase,frame:G.Graphics.frameCount,after:b.levelStatsState?.()?.phase??null});}throw Error('bounded level stats confirmations: '+label);};
 const inMode=async mode=>waitBattlePresentation(()=>battle()?._mode===mode&&!battle()._busy&&battle()._queue.length===0,'mode '+mode);
 const fightUntilEnd=async()=>{
  const s=battle();for(let i=0;i<12&&!s._session.finished;i++){s.act(()=>s._session.chooseMove(1),'move');await waitFor(()=>!s._busy,'actual action');await frames(2);}
  await waitBattlePresentation(()=>s._mode==='end'&&!s._busy&&s._queue.length===0,'actual terminal Scene');
 };
 const p={G,W:G,api:()=>E,fs,path,OUT:path.join(gameDir,'REPORT.json'),gameDir,arg:k=>args[k],argv:['--ps-sound'],assert:(v,label)=>assert(v,label),eq:(a,b,label)=>assert.equal(JSON.stringify(a),JSON.stringify(b),label),clone:v=>JSON.parse(JSON.stringify(v)),report,results:report.results,writeProgress:()=>progress++,frames,waitFor,scene,battle,inMode,fightUntilEnd,press,toMapId:async(id=5,x=8,y=9)=>{G.$gameMap._mapId=id;Object.assign(G.$gamePlayer,{_x:x,_realX:x,_y:y,_realY:y});M.goto(G.Scene_Map);await frames(2);},nodeRequire:require};
 return {w,G,M,A,p,report,frames,waitFor,context,sourceNodes,sourceStart:Source.prototype.start,bufferMethods:{play:BP.play,destroy:BP.destroy},get progress(){return progress;},inputFile,saveRoot};
}
module.exports={createVictoryDriverHost};
