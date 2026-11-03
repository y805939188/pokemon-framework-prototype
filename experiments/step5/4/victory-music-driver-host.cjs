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
 const world=createCompositionHostFactory({ROOT,work,plugins}),w=world({evolution:'plugin',productionTranslator:options.productionTranslator===true,prebattleWorld:options.prebattleWorld===true}),G=w.G,M=w.manager,A=w.AM,E=require(path.join(ROOT,'js/engine/build/production.cjs'));
 // Run the actual entry's presenter policy before unrelated global hooks. The
 // complete driver must inherit this policy, not assume the plugin's default.
 assert.equal(typeof entryText,'string');const stop=Symbol('entry boundary'),descriptor=Object.getOwnPropertyDescriptor(M,'isGameActive'),priorNW=G.nw;
 Object.defineProperty(M,'isGameActive',{configurable:true,set(){throw stop;}});G.nw={App:{argv:['--ps-flow-test='+(options.prebattleWorld?'d2-prebattle-wrapper':'d2-victory-music'),'--ps-sound']}};
 try{vm.runInContext(entryText,G,{filename:'actual-PS_BattleFlowTest-entry.js'});}catch(e){if(e!==stop)throw e;}finally{if(descriptor)Object.defineProperty(M,'isGameActive',descriptor);else delete M.isGameActive;if(priorNW===undefined)delete G.nw;else G.nw=priorNW;}
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
 const evoUpdate=M.updateScene,stack=[];
 const install=C=>{const prior=M._scene;prior?.terminate?.();const s=new C();if(!s.children)s.initialize();M._scene=s;s.create();if(s instanceof G.Scene_Map){s._messageWindow={};s._spriteset={};}if(s instanceof Title){s._commandWindow={isOpenAndActive:()=>true};s.isBusy=()=>false;}return s;};
 M.goto=C=>install(C);M.push=C=>{const s=M._scene;stack.push(s instanceof G.Scene_Map?G.Scene_Map:s?.constructor??G.Scene_Map);return install(C);};M.pop=()=>install(stack.pop()??G.Scene_Map);
 M.updateScene=function(){const s=this._scene;if(!s)return;if(!s.isStarted()&&s.isReady()&&(!options.delayStart||G.Graphics.frameCount>options.delayStart))s.start();if(s.isStarted())return evoUpdate.call(this);};
 M.goto(Title);
 let input={triggered:{},repeated:{},pressed:{}};
 G.PSManagement.inputFrame=()=>input;G.PSManagement.current=()=>null;
 G.Input.isTriggered=k=>!!input.triggered[k==='ok'?'use':k==='cancel'?'back':k];
 G.Input.isRepeated=G.Input.isTriggered;
 G.$gameMessage.clear=()=>{};if(!options.prebattleWorld)G.$gameMap={mapId:()=>5,_interpreter:{clear(){},isRunning:()=>false}};G.$dataMap={};
 w.flow.limits=()=>({party:6,boxes:1200,bagPerItem:999,money:999999});w.flow.app=w.applicationFactory;w.flow._app=null;w.flow.content=()=>w.flow._content;w.flow.now=()=>12345;
 const gameDir=w.root,saveRoot=path.join(work,'save-'+path.basename(gameDir));fs.mkdirSync(saveRoot);G.StorageManager={fileDirectoryPath:()=>saveRoot};
 fs.mkdirSync(path.join(gameDir,'js/plugins'),{recursive:true});
 for(const[name,code]of Object.entries({...plugins,PS_BattleFlowTest:driverText}))fs.writeFileSync(path.join(gameDir,'js/plugins',name+'.js'),code);
 const assets=[];
 for(const name of ['world','battle','victory','trainer-victory']){const rel='audio/bgm/'+PLAN.prefix+name+'.ogg',file=path.join(gameDir,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'SYNTHETIC_CONTROL placeholder '+name);assets.push({path:rel,logicalName:PLAN.prefix+name,kind:'bgm',sha256:hash(fs.readFileSync(file)),expectedNativeChannels:2,nativeDurationRangeSeconds:[duration-2/44100,duration+2/44100]});}
 const packageHead='1234567890123456789012345678901234567890';fs.writeFileSync(path.join(gameDir,'package-info.json'),JSON.stringify({gitHead:packageHead,workingTreeChanges:0}));
 const inputValue={version:PLAN.version,productCommit:PLAN.productCommit,productPlugins:PLAN.productPlugins,packageHead,driverPluginSHA256:hash(driverText),planSHA256:hash(E.contentCompile.canonicalJson(PLAN)),saveRoot,assets};
 if(options.badIdentity)inputValue.driverPluginSHA256='0'.repeat(64);
 const inputFile=path.join(gameDir,'INPUT.json');fs.writeFileSync(inputFile,JSON.stringify(inputValue));
 const args={'ps-victory-music-input':inputFile,'ps-save-dir':saveRoot};const report={env:{execution:'SYNTHETIC_CONTROL_NODE_VM'},results:[]};let progress=0;
 const frames=async(n)=>{for(let i=0;i<n;i++){
  G.Graphics.frameCount++;w.tick(1000/60);for(const b of w.created)if(!b.destroys&&!b._ready)b.load();
  M.updateScene();await flush();input={triggered:{},repeated:{},pressed:{}};
 }};
 const waitFor=async(cond,label,max=2400)=>{for(let i=0;i<max;i++){if(cond())return;await frames(1);}throw Error('bounded wait: '+label+' '+JSON.stringify({mode:M._scene?._mode,evolution:G.PSEvolution.current(),errors:w.errors,flowError:w.flow.lastOutcome?.error}));};
 const scene=()=>M._scene,battle=()=>scene()?._psBattle?scene():null;
 const press=async(key)=>{input={triggered:{[key==='ok'?'use':key==='cancel'?'back':key]:true},repeated:{},pressed:{[key==='ok'?'use':key==='cancel'?'back':key]:true}};await frames(3);await frames(3);};
 const inMode=async mode=>waitFor(()=>battle()?._mode===mode&&!battle()._busy&&battle()._queue.length===0,'mode '+mode);
 const fightUntilEnd=async()=>{
  const s=battle();for(let i=0;i<12&&!s._session.finished;i++){s.act(()=>s._session.chooseMove(1),'move');await waitFor(()=>!s._busy,'actual action');await frames(2);}
  await waitFor(()=>s._mode==='end'&&!s._busy&&s._queue.length===0,'actual terminal Scene');
 };
 const p={G,W:G,api:()=>E,fs,path,OUT:path.join(gameDir,'REPORT.json'),gameDir,arg:k=>args[k],argv:['--ps-sound'],assert:(v,label)=>assert(v,label),eq:(a,b,label)=>assert.equal(JSON.stringify(a),JSON.stringify(b),label),clone:v=>JSON.parse(JSON.stringify(v)),report,results:report.results,writeProgress:()=>progress++,frames,waitFor,scene,battle,inMode,fightUntilEnd,press,toMapId:async()=>{M.goto(G.Scene_Map);await frames(2);},nodeRequire:require};
 return {w,G,M,A,p,report,frames,waitFor,context,sourceNodes,sourceStart:Source.prototype.start,bufferMethods:{play:BP.play,destroy:BP.destroy},get progress(){return progress;},inputFile,saveRoot};
}
module.exports={createVictoryDriverHost};
