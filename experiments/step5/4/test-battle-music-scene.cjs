'use strict';
// Compiled production plugins and real filesystem; MZ renderer/audio/clock/session ports are controlled.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..'),E=require('../../../js/engine/build/production.cjs');let temp,plugin,savePlugin,Operations,config;
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
test.before(()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-battle-music-scene-'));const root=path.join(ROOT,'src/plugins/battleflow');
 fs.writeFileSync(path.join(temp,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'CommonJS',strict:true,types:[],lib:['ES2022'],rootDir:root,outDir:path.join(temp,'pure'),noEmitOnError:true},files:[path.join(root,'battle-music-operation.ts')]}));
 const typed=spawnSync('pnpm',['--dir','src','exec','tsc','-p',path.join(temp,'tsconfig.json')],{cwd:ROOT,encoding:'utf8'});assert.equal(typed.status,0,typed.stdout+typed.stderr);
 Operations=require(path.join(temp,'pure/battle-music-operation.js')).BattleMusicOperations;config=require(path.join(temp,'pure/battle-music.js')).battleMusicConfig;
 for(const name of ['PS_BattleFlow','PS_SaveState']){const r=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',path.join(temp,name)],{cwd:ROOT,env:{...process.env,RR_PLUGIN:name},encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);const s=fs.readFileSync(path.join(temp,name,name+'.js'),'utf8');if(name==='PS_BattleFlow')plugin=s;else savePlugin=s;}
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});

function nativeIntroEventHost({decodeError=null,waitError=null,clearError=null,successor=false,rejectNull=false,source=fs.readFileSync(path.join(ROOT,'src/plugins/flowtest/d2-music.ts'),'utf8')}={}){
 // Real interpreter commands and compiled PSFlow; decode/render/session ports stay controlled.
 const PLAN=require('./music-native-plan.json'),named=x=>PLAN.prefix+x,f=host({ready:false,intro:named('intro')}),G={Graphics:f.G.Graphics,$gameMap:{mapId:()=>5},PluginManager:{},Utils:{extractFileName:x=>x}},details={};
 fs.mkdirSync(path.join(f.root,'audio/bgm',PLAN.prefix),{recursive:true});for(const name of ['world','intro','trainer'])f.write(named(name));f.projection.presentation.battleBgm=named('trainer');
 function Interpreter(){this.clear();}G.Game_Interpreter=Interpreter;vm.createContext(G);
 const objects=fs.readFileSync(path.join(ROOT,'js/reactor_objects.js'),'utf8');
 for(const name of ['clear','setup','loadImages','currentCommand','nextEventCode','command115','command355','command357','setWaitMode']){
  const m=objects.match(new RegExp('Game_Interpreter\\.prototype\\.'+name+' = function\\([^)]*\\) \\{[\\s\\S]*?\\n\\};'));assert(m,name);vm.runInContext(m[0],G);
 }
 Interpreter.prototype.updateWaitMode=f.G.Game_Interpreter.prototype.updateWaitMode;
 const interpreter=new Interpreter(),baseClear=interpreter.clear;interpreter.clear=function(){if(clearError&&this._list&&this._index>=this._list.length)throw clearError;return baseClear.call(this);};G.$gameMap._interpreter=interpreter;
 const parseAst=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]})).parseAst,nodes=[];
 (function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;}nodes.push(n);for(const v of Object.values(n))walk(v);})(parseAst(source,{lang:'ts'}));
 const cleanup=nodes.find(n=>n.type==='VariableDeclarator'&&n.id.name==='retireIntroEvent');assert(cleanup,'actual event retirement helper');
 const retire=vm.runInNewContext('(({G,flow,details})=>(event,hadPrimary)=>'+source.slice(cleanup.init.body.start,cleanup.init.body.end)+')')({G,flow:f.flow,details});
 const m03=nodes.find(n=>n.type==='CallExpression'&&n.callee.name==='run'&&n.arguments[0]?.value==='M03');assert(m03);
 const {stripTypeScriptTypes}=require('node:module'),records=[];let gate;
 const create=f.audio.createBuffer;f.audio.createBuffer=function(folder,name){const b=create.call(this,folder,name),rec={buffer:b,name,folder,plays:[]},play=b.play;b.play=function(...args){rec.plays.push({frame:f.G.Graphics.frameCount});return play.apply(this,args);};records.push(rec);if(gate&&!gate.assigned&&name===gate.name){gate.assigned=true;gate.row=rec;}return b;};
 let starts=0;
 G.PluginManager.callCommand=(i,_plugin,command)=>{if(command==='PlayTrainerIntro'){i._psMusicIntro=f.flow.playTrainerIntro('npc',1);i.setWaitMode('psBattleIntro');}else if(command==='StartTrainerBattle'){starts++;f.open(true);}else assert.fail(command);};
 const dispatch=()=>{const row=interpreter.currentCommand();if(row.code===355)interpreter.command355();else if(row.code===357)interpreter.command357(row.parameters);interpreter._index++;};
 const drain=()=>{for(let n=0;interpreter._list&&interpreter._index<interpreter._list.length&&n<8;n++){if(interpreter.currentCommand().code===0)break;dispatch();}};
 const installSuccessor=()=>{const fn=()=>{f.successorCalls=(f.successorCalls??0)+1;},list=[{code:355,parameters:['globalThis.__psMusicNativeMark();']},{code:0,parameters:[]}];interpreter.setup(list,0);G.__psMusicNativeMark=fn;const token=f.flow.playTrainerIntro('npc',1);interpreter._psMusicIntro=token;f.successor={fn,list,token};};
 const body=source.slice(m03.arguments[1].body.start,m03.arguments[1].body.end),code='(async ({reset,world,holdNext,named,G,flow,waitFor,nativeReady,assert,release,eq,inMode,active,player,activeRow,abortScene,retireIntroEvent,PLAN})=>{let ordinal=0;return await(async()=>'+body+')();})';
 const execute=vm.runInNewContext(stripTypeScriptTypes(code)) ;
 const actions={PLAN,reset:async()=>f.app,world:async()=>{f.audio._currentBgm.name=named('world');},holdNext:name=>(gate={name,assigned:false,row:null}),named,G,flow:f.flow,waitFor:async predicate=>{if(waitError)throw waitError;dispatch();assert(predicate());},nativeReady:async()=>{if(successor)installSuccessor();if(rejectNull)throw null;if(decodeError)throw decodeError;},assert,release:g=>f.load(g.row.buffer),eq:assert.deepEqual,inMode:async()=>{f.G.Graphics.frameCount++;assert.equal(interpreter.updateWaitMode(),false);dispatch();dispatch();await f.scene();},active:async name=>{const r=records.at(-1);assert.equal(r.name,name);f.load(r.buffer);return r;},player:()=>f.flow.musicState().player,activeRow:()=>records.at(-1),abortScene:async()=>{f.flow.abort(Error('controlled normal M03 abort'));f.currentScene?.terminate();interpreter.clear();},retireIntroEvent:retire};
 Object.assign(f,{G,details,interpreter,records,runM03:()=>execute(actions),drain,eventStarts:()=>starts,late:()=>{if(gate?.row)f.load(gate.row.buffer);},retire});
 return f;
}
for(const kind of ['decode assertion','wait cancellation'])test('actual M03 '+kind+' retires its native interpreter before hook removal and preserves first error',async()=>{
 const failure=Object.assign(Error(kind),{code:kind}),f=nativeIntroEventHost(kind==='decode assertion'?{decodeError:failure}:{waitError:failure});
 await assert.rejects(f.runM03(),e=>e===failure);assert.doesNotThrow(f.drain);const played=f.plays.length;if(f.records.length)assert(f.records[0].buffer.destroyed>0,'owned pending native resource retired');f.late();assert.equal(f.plays.length,played,'late decode cannot play after retirement');assert.equal(f.eventStarts(),0);assert.equal(f.G.__psMusicNativeMark,undefined);assert(!f.flow.musicState()?.current);assert.equal(f.details.cleanupErrors?.length??0,0);
});
test('normal actual M03 completes original assertions and teardown without a second state replacement',async()=>{
 const f=nativeIntroEventHost(),result=await f.runM03();assert(result.marker.frame>result.settled);assert.equal(f.eventStarts(),1);assert.equal(f.G.__psMusicNativeMark,undefined);assert.equal(f.app.stateGeneration,0);assert.doesNotThrow(f.drain);
});
test('actual M03 cleanup preserves the first decode error when interpreter clear also fails',async()=>{
 const first=Error('first decode assertion'),cleanup=Error('clear failure'),f=nativeIntroEventHost({decodeError:first,clearError:cleanup});
 await assert.rejects(f.runM03(),e=>e===first);assert.equal(f.details.cleanupErrors[0].kind,'intro-event');assert.match(f.details.cleanupErrors[0].error,/clear failure/);assert.doesNotThrow(f.drain);assert.equal(f.eventStarts(),0);assert.equal(f.G.__psMusicNativeMark,undefined);
});
test('a null rejection still remains the first M03 failure when cleanup also fails',async()=>{
 const f=nativeIntroEventHost({rejectNull:true,clearError:Error('cleanup')});let caught=Symbol('not rejected');try{await f.runM03();}catch(error){caught=error;}assert.equal(caught,null);assert.equal(f.details.cleanupErrors.length,1);assert.doesNotThrow(f.drain);
});
test('cleanup failure without a primary failure cannot be reported as success',()=>{
 const f=nativeIntroEventHost({clearError:Error('cleanup')}),list=[{code:0,parameters:[]}],hook=()=>{};f.interpreter.setup(list,0);f.G.__psMusicNativeMark=hook;f.interpreter._psMusicIntro=f.flow.playTrainerIntro('npc',1);
 assert.throws(()=>f.retire({interpreter:f.interpreter,list,hook,app:f.app,generation:0,retired:false},false),/cleanup failed/);assert.doesNotThrow(f.drain);assert.equal(f.G.__psMusicNativeMark,undefined);
});
test('genuine successor interpreter list, callback and intro token survive old M03 failure cleanup',async()=>{
 const failure=Error('old decode'),f=nativeIntroEventHost({decodeError:failure,successor:true});await assert.rejects(f.runM03(),e=>e===failure);
 assert.equal(f.interpreter._list,f.successor.list);assert.equal(f.G.__psMusicNativeMark,f.successor.fn);assert.equal(f.flow.musicState().token,f.successor.token);assert(f.flow.musicState().current);assert.doesNotThrow(f.drain);assert.equal(f.successorCalls,1);
});
test('restoring old queued-event teardown revives the real command355 callback fatal',async()=>{
 const source=fs.readFileSync(path.join(ROOT,'src/plugins/flowtest/d2-music.ts'),'utf8'),marker="trace.ownedList = true; token = event.interpreter._psMusicIntro;";assert.equal(source.split(marker).length,2);
 // Restore the old combination: a queued consumer plus unconditional hook deletion.
 const broken=source.replace('if (event.interpreter._list === event.list) {\n        '+marker,'if (false) {\n        '+marker).replace("if (event.interpreter._list === event.list && event.interpreter._index < event.list.length) throw Error('owned intro event did not retire');",'');
 const f=nativeIntroEventHost({decodeError:Error('original'),source:broken});await assert.rejects(f.runM03(),/original/);assert.throws(f.drain,/__psMusicNativeMark/);
});
test('native duration checker keeps exact granule boundary rejection, including shortened and mismatched decoded audio',async()=>{
 const source=fs.readFileSync(path.join(ROOT,'src/plugins/flowtest/d2-music.ts'),'utf8'),from=source.indexOf('  const nativeReady = async '),a=source.indexOf('=> {',from)+4,b=source.indexOf('\n  };',a),body=source.slice(a,b);
 const asset={logicalName:'synthetic',kind:'bgm',expectedNativeChannels:2,nativeDurationRangeSeconds:[(4000-2)/44100,(4000+2)/44100]},value={error:false,ready:true,decoded:[{tag:'[object AudioBuffer]',duration:4000/44100,sampleRate:44100,channels:2}]};
 const run=vm.runInNewContext(require('node:module').stripTypeScriptTypes('(async({assert,waitFor,readNative,input,mark,row})=>{'+body+'})'));
 const check=v=>run({assert,waitFor:async p=>assert(p()),readNative:()=>v,input:{assets:[asset]},mark(){},row:{name:'synthetic',folder:'bgm/',buffer:{isError:()=>v.error},ready:()=>true}});
 await check(value);for(const duration of [(4000-2)/44100,(4000+2)/44100])await check({...value,decoded:[{...value.decoded[0],duration}]});
 for(const duration of [(4000-3)/44100,(4000+3)/44100,(4000-1024)/44100,8000/44100])await assert.rejects(check({...value,decoded:[{...value.decoded[0],duration}]}),/native duration fits/);
 await assert.rejects(check({...value,error:true}),/decoder ready/);await assert.rejects(check({...value,decoded:[{...value.decoded[0],channels:1}]}),/channel count/);
});


function nativeColdStartup(source=fs.readFileSync(path.join(ROOT,'src/plugins/flowtest/d2-music.ts'),'utf8')){
 // Actual Boot/Title/Map and driver control flow. Music/session/render ports are controlled: reachability only.
 const f=nativeMapLifecycle(source),G=f.G,parseAst=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]})).parseAst;
 const scenes=fs.readFileSync(path.join(ROOT,'js/reactor_scenes.js'),'utf8'),managers=fs.readFileSync(path.join(ROOT,'js/reactor_managers.js'),'utf8'),core=fs.readFileSync(path.join(ROOT,'js/reactor_core.js'),'utf8'),ui=fs.readFileSync(path.join(ROOT,'js/reactor_ui.js'),'utf8');
 function select(text,predicate){const found=[];function visit(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(visit);return;}if(predicate(n,text))found.push(n);for(const value of Object.values(n))visit(value);}visit(parseAst(text,{lang:'ts'}));return found;}
 const assignments=(text,left)=>select(text,(n,s)=>n.type==='AssignmentExpression'&&s.slice(n.left.start,n.left.end)===left).map(n=>text.slice(n.start,n.end)+';');
 const install=(text,left)=>{const value=assignments(text,left)[0];assert(value,left);vm.runInContext(value,G);};
 const declaration=name=>select(source,n=>n.type==='VariableDeclarator'&&n.id.name===name)[0];
 const initializer=name=>{const node=declaration(name);return node?source.slice(node.init.start,node.init.end):null;};
 Object.assign(f,{sceneFrames:0,titleClosing:false,titleActive:true,holdTitleStart:false,holdMapStart:false,newGames:0,fixtureResets:0,transfers:0,battles:0,presses:[]});
 function Title(){this.initialize();const self=this;this._commandWindow={isClosing:()=>f.titleClosing,isOpenAndActive:()=>self.isStarted()&&f.titleActive};}Title.prototype=Object.create(G.Scene_Base.prototype);
 Object.assign(Title.prototype,{adjustBackground(){},playTitleMusic(){},startFadeIn(){},fadeSpeed:()=>24});
 function Boot(){this.initialize();}Boot.prototype=Object.create(G.Scene_Base.prototype);Object.assign(Boot.prototype,{checkPlayerLocation(){},resizeScreen(){},updateDocumentTitle(){}});
 Object.assign(G,{Scene_Title:Title,Scene_Boot:Boot,Scene_Battle:function(){},Utils:{isNwjs:()=>true},location:{search:''},nw:{App:{argv:['--ps-sound','--ps-flow-test=d2-music','--ps-flow-quit']}},Game_Action:{installMultiElementShim(){}},SoundManager:{preloadImportantSounds(){}},Window_TitleCommand:{initCommandPosition(){}},ConfigManager:{},$dataSystem:JSON.parse(fs.readFileSync(path.join(ROOT,'data/System.json'))),ReactorUI:{installSceneRouting(){},CAPTURE_OPTION:'rrcapture',CAPTURE_SCENES:{}},$gameSystem:{},$gameMessage:{clear(){}},$gameMap:{mapId:()=>5,_interpreter:{clear(){}}}});
 Object.assign(G.DataManager,{isBattleTest:()=>false,isEventTest:()=>false,setupNewGame(){f.newGames++;}});
 G.$gamePlayer.reserveTransfer=()=>{f.transfers++;};
 G.SceneManager.goto=Type=>{G.SceneManager._scene=new Type();f.sceneFrames=0;G.SceneManager._scene.create?.();};
 for(const [text,left]of [[core,'Utils.isOptionValid'],[managers,'DataManager.isTitleSkip'],[scenes,'Scene_Title.prototype.start'],[scenes,'Scene_Title.prototype.isBusy'],[scenes,'Scene_Boot.prototype.startNormalGame'],[scenes,'Scene_Boot.prototype.start']])install(text,left);
 const wrap=(body,alias,member)=>vm.runInContext('(function(){const '+alias+'=Scene_Boot.prototype.'+member+';'+body+'})();',G);
 wrap(assignments(scenes,'Scene_Boot.prototype.startNormalGame').at(-1),'_startNormalGame','startNormalGame');
 wrap(assignments(scenes,'Scene_Boot.prototype.start').at(-1),'_start','start');
 for(const name of ['launchTokens','captureRequest','bootInterfaceId'])install(ui,'ReactorUI.'+name);
 wrap(assignments(ui,'Scene_Boot.prototype.start')[0],'_Scene_Boot_start','start');
 assert.equal(require(path.join(ROOT,'package.json')).main,'index.html');assert.equal(G.$dataSystem.rrSkipTitle,undefined);assert.equal(G.ReactorUI.bootInterfaceId(),0);assert.equal(G.ReactorUI.captureRequest(),null);
 new G.Scene_Boot().start();assert.equal(G.DataManager.isTitleSkip(),false);assert(f.scene() instanceof Title);assert.equal(f.newGames,1);
 const step=()=>{f.sceneFrames++;const current=f.scene();if(current instanceof Title){if(f.sceneFrames>=2&&!f.holdTitleStart)current.start();}else if(current instanceof G.Scene_Map){if(f.sceneFrames===1){f.loaded=true;assert(current.isReady());}else if(f.sceneFrames>=2&&!f.holdMapStart)current.start();}};
 const waitFor=async predicate=>{for(let i=0;i<12;i++){if(f.waitFailure)throw f.waitFailure;if(predicate())return;step();}throw Object.assign(Error('bounded native driver lifecycle wait'),{code:'WAIT_DRIVER_LIFECYCLE'});};
 const frames=async count=>{for(let i=0;i<count;i++)step();},scene=f.scene;
 const parent=fs.readFileSync(path.join(ROOT,'src/plugins/PS_BattleFlowTest.ts'),'utf8'),transferNode=select(parent,n=>n.type==='FunctionDeclaration'&&n.id?.name==='toMapId')[0];
 const toMapId=vm.runInNewContext('(({G,waitFor,scene,frames})=>async(mapId,x,y)=>'+parent.slice(transferNode.body.start,transferNode.body.end)+')')({G,waitFor,scene,frames});
 const flow={stateReplaced(){f.fixtureResets++;},app:()=>({}),abort(){f.aborts=(f.aborts??0)+1;}},PLAN=require('./music-native-plan.json'),deps={G,scene,flow,waitFor,assert,E:{dex:{createDexLookup:()=>({})}},content:{},PLAN,musicNativeState:()=>({controlledFixture:true}),toMapId,press:async key=>f.presses.push(key)};
 const resetNode=declaration('reset'),body=source.slice(resetNode.init.body.start,resetNode.init.body.end);
 const factory='(({G,scene,flow,waitFor,assert,E,content,PLAN,musicNativeState,toMapId,press})=>{let randomState=0,draws=0,settings={};const random=()=>0;let firstReset='+(initializer('firstReset')??'true')+';const clearMessages='+initializer('clearMessages')+';const mapReady='+initializer('mapReady')+';'+(initializer('titleReady')?'const titleReady='+initializer('titleReady')+';':'')+'const reset=async(kind="normal",options={})=>'+body+';const abortScene='+initializer('abortScene')+';return{reset,abortScene,mapReady};})';
 f.actions=vm.runInNewContext(factory) (deps);f.waitFor=waitFor;
 f.runM01=async()=>{const call=select(source,n=>n.type==='CallExpression'&&n.callee.name==='run'&&n.arguments[0]?.value==='M01')[0],body=source.slice(call.arguments[1].body.start,call.arguments[1].body.end),objects=[];
 const named=name=>PLAN.prefix+name,world=async()=>{assert(f.actions.mapReady(),'world setup occurs only after a started Map');},open=async trainer=>{assert(f.actions.mapReady());f.battles++;f.song=trainer?named('trainer'):'Battle wild';objects.push({name:f.song,plays:[{}]});G.SceneManager.goto(G.Scene_Battle);return{request:{kind:trainer?'trainer':'wild'}};};
 return vm.runInNewContext('(async({reset,world,open,active,player,last,objects,abortScene,named,eq,assert})=>'+body+')')({...f.actions,world,open,active:async name=>assert.equal(f.song,name),player:()=>({logical:{name:f.song}}),last:()=>({state:'requested'}),objects,named,eq:assert.deepEqual,assert});};
 return f;
}
test('normal installed Boot and wrappers reach actual M01 reset and both battles without tskip or a preplaced Map',async()=>{
 const f=nativeColdStartup();assert.equal(f.scene().isStarted(),false);
 const result=await f.runM01();assert.equal(result.wild.kind,'wild');assert.equal(result.trainer.kind,'trainer');
 assert.equal(f.newGames,1);assert.equal(f.fixtureResets,2);assert.equal(f.transfers,2);assert.equal(f.battles,2);assert.equal(f.aborts,2);assert(f.actions.mapReady());assert.deepEqual(f.presses,['shift','shift']);
});
test('cold reset does not install a fixture before the actual Title has started',async()=>{
 const f=nativeColdStartup();f.holdTitleStart=true;await assert.rejects(f.actions.reset(),{code:'WAIT_DRIVER_LIFECYCLE'});assert.equal(f.fixtureResets,0);assert.equal(f.transfers,0);
});
test('initial Title exception is consumed once and cannot admit a later Title or queued successor',async()=>{
 const f=nativeColdStartup();await f.actions.reset();f.G.SceneManager.goto(f.G.Scene_Title);f.scene().start();
 await assert.rejects(f.actions.reset(),{code:'WAIT_DRIVER_LIFECYCLE'});assert.equal(f.fixtureResets,1);assert.equal(f.transfers,1);
 const pending=nativeColdStartup();pending.scene().start();pending.G.SceneManager._nextScene=new pending.G.Scene_Map();
 await assert.rejects(pending.actions.reset(),{code:'WAIT_DRIVER_LIFECYCLE'});assert.equal(pending.fixtureResets,0);
});
test('initial and successor unfinished Maps still wait for real start and never borrow the Title exception',async()=>{
 for(const afterFirst of [false,true]){const f=nativeColdStartup();if(afterFirst)await f.actions.reset();const before=f.fixtureResets;f.G.SceneManager.goto(f.G.Scene_Map);f.holdMapStart=true;
 await assert.rejects(f.actions.reset(),{code:'WAIT_DRIVER_LIFECYCLE'});assert.equal(f.fixtureResets,before);}
});
test('cold reset propagates wait cancellation before fixture or transfer side effects',async()=>{
 const f=nativeColdStartup(),failure=Object.assign(Error('controlled wait cancellation'),{code:'CANCELLED'});f.waitFailure=failure;
 await assert.rejects(f.actions.reset(),error=>error===failure);assert.equal(f.fixtureResets,0);assert.equal(f.transfers,0);
});
test('disabling the actual first-Title exception revives the cold M01 reachability failure',async()=>{
 const source=fs.readFileSync(path.join(ROOT,'src/plugins/flowtest/d2-music.ts'),'utf8'),marker='let firstReset = true;';assert.equal(source.split(marker).length,2);
 const f=nativeColdStartup(source.replace(marker,'let firstReset = false;'));
 await assert.rejects(f.runM01(),{code:'WAIT_DRIVER_LIFECYCLE'});assert.equal(f.fixtureResets,0);assert.equal(f.transfers,0);assert.equal(f.battles,0);
});


function nativeMapLifecycle(source=fs.readFileSync(path.join(ROOT,'src/plugins/flowtest/d2-music.ts'),'utf8')){
 // Actual installed MZ/Reactor lifecycle methods; only renderer and map I/O are controlled.
 const scenes=fs.readFileSync(path.join(ROOT,'js/reactor_scenes.js'),'utf8'),managers=fs.readFileSync(path.join(ROOT,'js/reactor_managers.js'),'utf8');
 const method=(text,type,name)=>{const escaped=type.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),m=text.match(new RegExp(escaped+'\\.'+name+' = function\\([^)]*\\) \\{[\\s\\S]*?\\n\\};'));assert(m,type+'.'+name);return m[0];};
 function Base(){}Base.prototype.initialize=function(){this._started=false;};Base.prototype.create=function(){};Base.prototype.isBusy=()=>false;
 function Scene_Message(){}Scene_Message.prototype=Object.create(Base.prototype);Object.assign(Scene_Message.prototype,{initialize:Base.prototype.initialize,create:Base.prototype.create,isReady:()=>true});
 function Scene_Map(){this.initialize();}Scene_Map.prototype=Object.create(Scene_Message.prototype);
 const f={loaded:false,cleared:[],polls:[],starts:0},G={Scene_Base:Base,Scene_Message,Scene_Map,$gamePlayer:{isTransferring:()=>false},$dataMap:{},$gameMap:{mapId:()=>5},DataManager:{loadMapData(){f.loaded=false;},isMapLoaded:()=>f.loaded}};
 G.SceneManager={_scene:null,_nextScene:null,isSceneChanging(){return !!this._nextScene;},clearStack(){},goto(Type){this._scene=new Type();this._scene.create();}};
 vm.createContext(G);
 for(const [type,name]of [['Scene_Base.prototype','start'],['Scene_Base.prototype','isStarted'],['Scene_Map.prototype','initialize'],['Scene_Map.prototype','create'],['Scene_Map.prototype','isReady'],['Scene_Map.prototype','onMapLoaded'],['Scene_Map.prototype','start'],['Scene_Map.prototype','isBusy'],['Scene_Message.prototype','isMessageWindowClosing']])vm.runInContext(method(scenes,type,name),G);
 Scene_Message.prototype.start=Base.prototype.start;
 Object.assign(Scene_Map.prototype,{needsFadeIn:()=>false,createDisplayObjects(){this._messageWindow={isClosing:()=>false};this._spriteset={};}});
 vm.runInContext(method(managers,'SceneManager','isCurrentSceneBusy'),G);
 const scene=()=>G.SceneManager._scene,flow={abort(){}},clearMessages=()=>f.cleared.push({started:scene().isStarted(),windows:!!scene()._messageWindow,spriteset:!!scene()._spriteset});
 const waitFor=async predicate=>{for(let frame=0;frame<5;frame++){f.polls.push({frame,started:scene().isStarted(),windows:!!scene()._messageWindow});if(predicate())return;if(frame===0){f.loaded=true;assert(scene().isReady());}if(frame===2){scene().start();f.starts++;}}throw Error('controlled map lifecycle deadline');};
 const ready=source.match(/  const mapReady = \(\) => \{[\s\S]*?\n  \};/),abort=source.match(/  const abortScene = async \(\) => \{[\s\S]*?\};/);
 assert(abort,'execute actual native abort action');
 const actions=vm.runInNewContext('(({G,scene,flow,waitFor,clearMessages})=>{'+(ready?.[0]??'')+abort[0]+';return {abortScene,mapReady:typeof mapReady==="undefined"?null:mapReady};})')({G,scene,flow,waitFor,clearMessages});
 Object.assign(f,{G,scene,actions});return f;
}
test('native driver waits for actual Map start before a second transfer can query message-window busy',async()=>{
 const f=nativeMapLifecycle();await f.actions.abortScene();
 f.G.SceneManager._nextScene=new f.G.Scene_Map();
 assert.doesNotThrow(()=>f.G.SceneManager.isCurrentSceneBusy(),'a created but unready Map must never escape the abort wait');
 assert.equal(f.starts,1);assert.deepEqual(f.cleared,[{started:true,windows:true,spriteset:true}]);
});
test('native driver does not accept loaded windows while actual Map start is still delayed',async()=>{
 const f=nativeMapLifecycle();await f.actions.abortScene();
 assert(f.polls.some(p=>p.windows&&!p.started),'actual isReady created windows before delayed start');
 assert.equal(f.polls.at(-1).started,true,'wait consumes the later real start, not just data readiness');
});
test('native map predicate rejects each incomplete lifecycle component and a queued successor',async()=>{
 const f=nativeMapLifecycle();await f.actions.abortScene();const map=f.scene(),ready=f.actions.mapReady;
 assert.equal(typeof ready,'function');assert.equal(ready(),true);
 for(const key of ['_messageWindow','_spriteset']){const old=map[key];map[key]=undefined;assert.equal(ready(),false,key+' is required');map[key]=old;}
 map._started=false;assert.equal(ready(),false);map.start();f.G.SceneManager._nextScene=new f.G.Scene_Map();assert.equal(ready(),false);
 f.G.SceneManager._nextScene=null;assert.equal(ready(),true);f.G.SceneManager._scene={isStarted:()=>true,_messageWindow:{},_spriteset:{}};assert.equal(ready(),false,'non-Map is not a lifecycle substitute');
});
test('removing the actual native abort lifecycle gate revives the real host isClosing failure',async()=>{
 const source=fs.readFileSync(path.join(ROOT,'src/plugins/flowtest/d2-music.ts'),'utf8'),marker="await waitFor(mapReady, 'leave cancelled Scene');";
 assert.equal(source.split(marker).length,2,'mutate exactly the production test-driver abort gate');
 const f=nativeMapLifecycle(source.replace(marker,"await waitFor(() => scene() instanceof G.Scene_Map && !G.SceneManager.isSceneChanging(), 'leave cancelled Scene');"));
 await f.actions.abortScene();assert.equal(f.scene().isStarted(),false);f.G.SceneManager._nextScene=new f.G.Scene_Map();
 assert.throws(()=>f.G.SceneManager.isCurrentSceneBusy(),/isClosing/);
});

function host({ready=true,settings={},intro='Intro',emptyBgm=false}={}){
 const root=fs.mkdtempSync(path.join(temp,'world-'));fs.mkdirSync(path.join(root,'audio/bgm'),{recursive:true});
 const f={root,time:0,timers:new Map(),seq:0,buffers:[],plays:[],queries:[],commands:{},hook:null,starts:0,finishes:0,aborts:0};
 f.write=name=>fs.writeFileSync(path.join(root,'audio/bgm',name+'.ogg'),'controlled decoder existence fixture');
 for(const name of ['Battle wild','Battle trainer','Intro','Authored','Map','Next','Default','Custom'])f.write(name);
 const initial={seek:()=>17,destroyed:0,destroy(){this.destroyed++;f.hook?.('initial-destroy');}};
 const audio={_bgmBuffer:emptyBgm?null:initial,_currentBgm:{name:emptyBgm?'':'Map',volume:80,pitch:100,pan:0,pos:17},_meBuffer:null,bgmVolume:50,audioFileExt:()=>'.ogg',
 createBuffer(folder,name){assert.equal(folder,'bgm/');const b={name,ready:typeof ready==='function'?ready(name):ready,error:false,listeners:[],destroyed:0,isReady(){return this.ready;},isError(){return this.error;},addLoadListener(fn){this.listeners.push(fn);if(this.ready)fn();},play(loop,pos){f.plays.push({name:this.name,loop,pos,frame:G.Graphics.frameCount});f.hook?.('play');},seek:()=>24,destroy(){this.destroyed++;f.hook?.('destroy');}};f.buffers.push(b);f.hook?.('create');return b;},
 updateBufferParameters(buffer,volume,track){f.hook?.('parameters');buffer.params={volume:volume*track.volume/100,pitch:track.pitch};},stopBgm(){if(this._bgmBuffer){this._bgmBuffer.destroy();this._bgmBuffer=null;this._currentBgm=null;}f.hook?.('stop');}};
 function Base(){}Base.prototype={initialize(){this.children=[];},create(){this._windowLayer={};this.children.push(this._windowLayer);},start(){},update(){},terminate(){},isReady:()=>true,addWindow(){},addChild(s){this.children.push(s);s.parent=this;},addChildAt(s,i){this.children.splice(i,0,s);s.parent=this;},removeChild(s){this.children.splice(this.children.indexOf(s),1);s.parent=null;},popScene(){},updateWaitMode:()=>false,updateChild:()=>false,clear(){this._waitMode='';},setWaitMode(mode){this._waitMode=mode;}};
 function Win(){}Win.prototype={initialize(rect){this.innerWidth=rect.width-24;this.innerHeight=rect.height-24;this.contents={clear(){},fillRect(){}};this._index=0;},resetFontSettings(){},lineHeight:()=>24,textWidth:t=>String(t).length*8,drawText(){},refresh(){this._list=[];this.makeCommandList?.();},addCommand(name,symbol,enabled,ext){this._list.push({name,symbol,enabled,ext});},select(i){this._index=i;},index(){return this._index;},setHandler(){},show(){this.visible=true;},hide(){this.visible=false;},activate(){this.active=true;},deactivate(){this.active=false;},isOpenAndActive(){return this.active&&this.visible;}};
 class Bitmap{constructor(w,h){this.width=w;this.height=h;this.context={drawImage(){}};}fillAll(){}blt(){}drawText(){}destroy(){}}
 class Sprite{constructor(bitmap){this.bitmap=bitmap;this.anchor={x:0,y:0};this.scale={x:1,y:1};}destroy(){}}
 function System(){}System.prototype.isSaveEnabled=()=>true;
 const req=name=>{if(['fs','path','url'].includes(name))return require(name);if(name.includes('production.cjs'))return E;throw Error('unexpected require '+name);};req.resolve=()=>path.join(root,'js/engine/build/production.cjs');
 const G={Error,performance:{now:()=>f.time},require:req,console:{log(){},warn(){},error(){}},setTimeout(cb,ms){const id=++f.seq;f.timers.set(id,{cb,at:f.time+ms});return id;},clearTimeout(id){f.timers.delete(id);},
 PluginManager:{parameters:()=>({battleMusic:JSON.stringify(settings)}),registerCommand(_plugin,name,fn){f.commands[name]=fn;}},Game_Interpreter:Base,Game_System:System,Window_Base:Win,Window_Command:Win,Scene_MenuBase:Base,
 SceneManager:{_scene:null,push(type){f.pushed=type;},isSceneChanging:()=>false},Graphics:{boxWidth:816,boxHeight:624,frameCount:0},Rectangle:function(x,y,width,height){Object.assign(this,{x,y,width,height});},Utils:{hasEncryptedAudio:()=>false},Input:{isTriggered:()=>false},SoundManager:{playBuzzer(){}},Bitmap,Sprite,AudioManager:audio,$gameSystem:new System(),$gameMessage:{isBusy:()=>false,add(){}},$gameVariables:{setValue(){}},
 DataManager:{setupNewGame(){},extractSaveContents(contents){G.$gameSystem=contents.system;},saveGame:async()=>true,makeSaveContents:()=>({system:G.$gameSystem})}};
 G.window=G;vm.createContext(G);vm.runInContext(plugin,G);vm.runInContext(savePlugin,G);
 const flow=G.PSFlow,projection={id:'npc',version:1,presentation:{battleBgm:'Authored',victoryBgm:'V',introBgm:intro}};
 const session={party:[],foeTeam:[],content:{},bag:{},finished:false,pendingLearn:null,take:()=>[],currentRequest:()=>({active:[{moves:[{id:'splash',move:'Splash',pp:40,maxpp:40}]}]}),gw:{readState:()=>[]}};
 const app={stateGeneration:0,saveBlocked:false,pendingEvolution:null,pendingReceiving:null,pendingPokedex:null,assertHostStateReplacementAllowed(){f.hook?.('replacement-check');},stateReplacedByHost(){this.stateGeneration++;this.saveBlocked=false;this.pendingEvolution=this.pendingReceiving=this.pendingPokedex=null;},startNewGame(){f.newGames=(f.newGames||0)+1;},trainerRecord(id,version){f.queries.push({id,version});f.hook?.('trainer-query');return projection;},async startBattle(request){f.starts++;this.saveBlocked=true;f.hook?.('session-start');return f.opening??session;},async startTrainerBattle(request){return this.startBattle(request);},finishBattle(s,r){f.finishes++;if(f.pending){this[f.pending]={token:'pending',revision:1};return{code:2,commit:'none',battleId:r.battleId,pending:true,...(f.pending==='pendingEvolution'?{continuationToken:'pending'}:{})};}this.saveBlocked=false;return{code:1,commit:'applied',battleId:r.battleId};},abortBattle(r,error){f.aborts++;this.saveBlocked=false;return{code:0,commit:'none',battleId:r.battleId,aborted:true,error:String(error)};},resolveReceiving(){this.pendingReceiving=null;this.saveBlocked=false;return{code:1,commit:'applied',battleId:flow._op.request.battleId};},resolveEvolution(){this.pendingEvolution=null;this.saveBlocked=false;return{code:1,commit:'applied',battleId:flow._op.request.battleId};}};
 G.$gameSystem._psGame={party:[],storage:{boxes:[]}};flow._app=app;flow.app=()=>f.app;flow.content=()=>({});flow.game=()=>G.$gameSystem._psGame;flow.limits=()=>({party:6,boxes:1200});flow.speciesName=x=>x;flow.translator=()=>({t:key=>key,tOr:(_key,fallback)=>fallback,has:()=>false});
 Object.assign(f,{G,flow,app,session,projection,audio,initial});
 f.advance=now=>{f.time=now;for(let n=0;n<1000;n++){const pair=[...f.timers].find(([,v])=>v.at<=now);if(!pair)return;f.timers.delete(pair[0]);pair[1].cb();}assert.fail('unbounded timer loop');};
 f.load=(b=f.buffers.at(-1))=>{b.ready=true;for(const cb of [...b.listeners])cb();};
 f.open=(trainer=false,presentation)=>flow.openBattle({kind:trainer?'trainer':'wild',...(trainer?{trainer:{id:'npc',version:1}}:{}),foes:[],seq:1,battleId:'music#'+(++f.seq),canLose:true},presentation);
 f.scene=async()=>{const scene=new G.Scene_PSBattle();G.SceneManager._scene=scene;scene.create();await flush();assert(scene.isReady());scene.start();assert.equal(scene._failure,null);f.currentScene=scene;return scene;};
 f.interpreter=()=>new G.Game_Interpreter();f.names=()=>f.plays.map(x=>x.name);return f;
}
test('compiled real Scene starts a single declared BGM and normal root completion restores original position after Scene exit',async()=>{
 const f=host({ready:name=>name!=='Map'});f.open();const s=await f.scene();assert.deepEqual(f.names(),['Battle wild']);f.flow._startBattleMusic(f.flow._op);assert.equal(f.plays.length,1);
 s.onEnd();assert.equal(f.flow.running,false);assert.equal(f.flow.musicState().phase,'return');s.terminate();f.G.SceneManager._scene={world:true};assert.deepEqual(f.names(),['Battle wild']);const pending=f.buffers.at(-1);f.load(pending);assert.deepEqual(f.names(),['Battle wild','Map']);assert.equal(f.plays.at(-1).pos,17);s.terminate();assert.equal(pending.destroyed,0);
});
for(const ready of [false,true])test(`compiled Scene plays after host None and returns to silence (cached=${ready})`,async()=>{
 const f=host({ready,emptyBgm:true});f.open();const s=await f.scene();if(!ready)f.load();
 assert.deepEqual(f.names(),['Battle wild']);assert.equal(f.flow.musicState().player.requests.at(-1).state,'requested');assert.equal(f.flow.musicState().player.memo.track,null);
 s.onEnd();s.terminate();assert.equal(f.flow.running,false);assert.equal(f.flow.musicState().player.requests.at(-1).state,'requested');assert.equal(f.audio._bgmBuffer,null);assert.equal(f.audio._currentBgm,null);assert.equal(f.buffers[0].destroyed,1);assert.equal(f.timers.size,0);
});
test('public trainer projection and author metadata are frozen before async session creation; config changes cannot replace the selected song',async()=>{
 const f=host();let release;f.opening=new Promise(r=>release=r);const context={music:{map:{trainerBattle:'M'},global:{trainerBattle:'G'},presets:{battle:'Custom:70:120'}}};f.open(true,context);const scene=new f.G.Scene_PSBattle();f.G.SceneManager._scene=scene;scene.create();await flush();f.projection.presentation.battleBgm='mutated';context.music.presets.battle='mutated';release(f.session);await flush();assert(scene.isReady());scene.start();assert.deepEqual(f.names(),['Custom']);assert.equal(f.buffers[0].params.volume,35);assert.equal(f.buffers[0].params.pitch,120);assert.deepEqual(f.queries,[{id:'npc',version:1}]);f.flow.abort(Error('cleanup'));
});
test('authored trainer BGM is consumed from the public query in the real begin path',async()=>{
 const f=host();f.open(true);await f.scene();assert.deepEqual(f.names(),['Authored']);f.flow.abort(Error('cleanup'));
});
test('PlayTrainerIntro event holds loading and same-frame completion, then starts the battle in a later stage with original memo',async()=>{
 const f=host({ready:name=>name!=='Intro'}),i=f.interpreter();f.commands.PlayTrainerIntro.call(i,{trainerId:'npc',version:'1'});assert.equal(i._waitMode,'psBattleIntro');assert(i.updateWaitMode());assert.throws(()=>f.open(true),/trainer-intro-not-ready/);assert.equal(f.flow.running,false);
 f.load();assert.deepEqual(f.names(),['Intro']);assert(i.updateWaitMode());assert(i.updateWaitMode());f.G.Graphics.frameCount++;assert(!i.updateWaitMode());f.open(true);await f.scene();assert.deepEqual(f.names(),['Intro','Authored']);assert(f.plays[1].frame>f.plays[0].frame);assert.equal(f.flow.musicState().player.memo.track.name,'Map');f.flow.close(1);assert.equal(f.plays.at(-1).name,'Map');assert.equal(f.plays.at(-1).pos,17);
});
test('empty intro neither changes memory/current track nor creates an interpreter wait',()=>{
 for(const intro of [null,'']){const f=host({intro}),i=f.interpreter();f.commands.PlayTrainerIntro.call(i,{trainerId:'npc',version:'1'});assert.equal(i._waitMode,undefined);assert.equal(f.flow.musicState(),null);assert.equal(f.audio._bgmBuffer,f.initial);}
});
test('missing intro and decode timeout settle with diagnostics and never deadlock the event or force a late sound',()=>{
 for(const kind of ['missing','timeout']){const f=host({ready:false,intro:kind==='missing'?'Absent':'Intro'}),i=f.interpreter();f.commands.PlayTrainerIntro.call(i,{trainerId:'npc',version:'1'});if(kind==='timeout')f.advance(5000);assert.equal(f.flow.musicState().player.requests.at(-1).state,kind);assert(i.updateWaitMode());f.G.Graphics.frameCount++;assert(!i.updateWaitMode());if(kind==='timeout')f.load();assert.equal(f.plays.length,0);f.flow.stateReplaced();}
});
for(const phase of ['battle','return'])for(const action of ['abort','load','newgame'])test(`${action} during pending ${phase} cancels own buffer; retained callback never plays over the successor`,async()=>{
 const f=host({ready:name=>phase==='battle'?false:name!=='Map'});f.open();const s=await f.scene();if(phase==='return')s.onEnd();const old=f.buffers.at(-1);
 if(action==='abort')f.flow.abort(Error('cancelled'));else if(action==='load')f.G.DataManager.extractSaveContents({system:new f.G.Game_System()});else f.G.DataManager.setupNewGame();assert.equal(old.destroyed,1);assert.equal(f.timers.size,0);
 const foreign={destroy(){assert.fail('foreign cleanup');}};f.audio._bgmBuffer=foreign;f.audio._currentBgm={name:'New world'};const before=f.plays.length;f.load(old);assert.equal(f.plays.length,before);assert.equal(f.audio._bgmBuffer,foreign);assert.equal(old.destroyed,1);assert.equal(f.timers.size,0);
});
for(const pending of ['pendingReceiving','pendingEvolution'])test(`${pending} keeps battle music through Scene teardown and restores only after the root continuation completes`,async()=>{
 const f=host();f.pending=pending;f.G.PSManagement={replaceBattleWithReceiving:()=>true};f.open();const scene=await f.scene();scene.onEnd();scene.terminate();f.flow.close(1);assert(f.flow.running);assert.deepEqual(f.names(),['Battle wild']);assert.equal(f.flow.musicState().phase,'battle');f.pending=null;
 if(pending==='pendingReceiving')f.flow.resolveReceiving('pending');else f.flow.resolveEvolution('pending',1,{});assert(!f.flow.running);assert.deepEqual(f.names(),['Battle wild','Map']);assert.equal(f.flow.musicState().phase,'return');
});
test('a following battle retires pending return, keeps the original world memo and old callbacks cannot affect the new BGM',async()=>{
 const f=host({ready:name=>name!=='Map'});f.open();(await f.scene()).onEnd();const old=f.buffers.at(-1);f.open(true);await f.scene();f.load(old);assert.deepEqual(f.names(),['Battle wild','Authored']);assert.equal(f.flow.musicState().player.memo.track.name,'Map');f.flow.close(1);f.load();assert.equal(f.plays.at(-1).name,'Map');assert.equal(f.plays.at(-1).pos,17);
});
test('normal completion consumes only the captured preset version; abort preserves it and future settings survive older completion',async()=>{
 const f=host();f.flow.setNextBattleMusic({battle:'Custom',victory:'V',capture:'C'});f.open();await f.scene();assert.equal(f.plays[0].name,'Custom');f.flow.setNextBattleMusic({battle:'Next'});f.currentScene.onEnd();f.open();await f.scene();assert.equal(f.plays.at(-1).name,'Next');f.flow.abort(Error('abort'));f.open();await f.scene();assert.equal(f.plays.at(-1).name,'Next');f.currentScene.onEnd();f.open();await f.scene();assert.equal(f.plays.at(-1).name,'Battle wild');f.flow.abort(Error('cleanup'));
});
test('default override with initially silent world retains its output on normal return and old Scene cleanup cannot stop it',async()=>{
 const f=host({settings:{defaultBgm:'Default'}});f.audio._bgmBuffer=null;f.audio._currentBgm=null;f.open();const scene=await f.scene();assert.equal(f.flow.musicState().player.logical.name,'Battle wild');assert.deepEqual(f.names(),['Default']);const output=f.audio._bgmBuffer;scene.onEnd();scene.terminate();assert.equal(f.audio._bgmBuffer,output);assert.equal(output.destroyed,0);assert.match(f.flow.musicState().player.requests.at(-1).detail,/suppresses/);
});
test('foreign music takeover prevents normal return from overwriting it; a stale Scene close cannot terminate a later battle',async()=>{
 const f=host();f.open();const old=await f.scene();const foreign={destroy(){assert.fail('foreign teardown');}};f.audio._bgmBuffer=foreign;f.audio._currentBgm={name:'Foreign'};old.onEnd();assert.equal(f.audio._bgmBuffer,foreign);f.open(true);await f.scene();const op=f.flow._op;old.onEnd();old.terminate();assert.equal(f.flow._op,op);assert(f.flow.running);f.flow.abort(Error('cleanup'));
});
test('replacement reservation rejects reentrant open/intro during old audio cleanup, without leaving a new op or wait owner',async()=>{
 const f=host();f.open();await f.scene();let hits=0;f.hook=event=>{if(event==='destroy'){hits++;assert.throws(()=>f.open(),/operation-active|already running/);assert.throws(()=>f.flow.playTrainerIntro('npc',1),/operation-active/);}};f.flow.stateReplaced();assert.equal(hits,1);assert.equal(f.flow._op,null);assert.equal(f.flow.running,false);
});
test('invalid author JSON refuses before publication or music side effects and leaves the earlier world song intact',()=>{
 const f=host();for(const music of ['{',null,[],{presets:3},{map:{wildBattle:2}},{defaultBgm:7}])assert.throws(()=>f.open(false,{music}));assert.equal(f.flow._op,null);assert(!f.flow.running);assert.equal(f.buffers.length,0);assert.equal(f.audio._bgmBuffer,f.initial);
});
test('the real application/Showdown Session begins through the compiled host and supplies the authored trainer projection',async()=>{
 const F=require('./trainer-ai-integration/fixtures.cjs'),input=F.inputs({party:1});input.trainerTypes[0].battleBgm='Authored';const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));const content=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup()).content;
 const w=await F.fixture({content,battleId:'music-real-initial'});w.app.abortBattle(w.request,Error('retire setup'));const f=host();f.app=w.app;f.flow._app=w.app;f.flow.game=()=>w.state.current();f.G.$gameSystem._psGame=w.state.current();f.flow.content=()=>content;
 f.flow.openBattle({kind:'trainer',trainer:{id:'c-basic',version:1},foes:[],seq:2,battleId:'music-real-second',canLose:true});await f.scene();const session=f.flow._op.session;assert(session.currentRequest().active.length);assert.deepEqual(f.names(),['Authored']);assert.equal(f.flow._op.musicPlan.trainers[0].battleBgm,'Authored');f.flow.abort(Error('cleanup'));assert(!w.app.saveBlocked);
});
test('an application generation change without host notification blocks a late decoded battle song',async()=>{
 const f=host({ready:false});f.open();await f.scene();const old=f.buffers[0];f.app.stateGeneration++;f.load(old);assert.equal(f.plays.length,0);assert.equal(old.destroyed,1);assert.equal(f.timers.size,0);f.flow.stateReplaced();
});
test('abort reentry during synchronous music creation stops Scene startup before display allocation',async()=>{
 const f=host();f.hook=event=>{if(event==='create')f.flow.abort(Error('synchronous cancellation'));};f.open();const scene=await f.scene();assert(!f.flow.running);assert.equal(scene._display,null);assert.equal(f.buffers[0].destroyed,1);assert.equal(f.plays.length,0);scene.terminate();
});
test('the compiled successful load path cancels the old timeline before installing the validated document',async()=>{
 const F=require('./trainer-ai-integration/fixtures.cjs'),content=F.content({party:1}),f=host({ready:false});f.open();await f.scene();const old=f.buffers[0];f.flow.content=()=>content;f.flow.speciesKeyResolver=()=>E.speciesKey.speciesKeyResolver(content);
 const system=new f.G.Game_System();system._psGame=E.state.newGame({content,party:[],money:123});f.G.DataManager.extractSaveContents({system});assert.equal(f.G.$gameSystem._psSaveError,undefined);assert.equal(f.G.$gameSystem._psGame.money,123);assert.equal(old.destroyed,1);f.load(old);assert.equal(f.plays.length,0);assert.equal(f.flow._op,null);
});
test('public trainer query reentry that replaces state cannot publish a projection or start a session',async()=>{
 const f=host();f.hook=event=>{if(event==='trainer-query')f.flow.stateReplaced();};f.open(true);await assert.rejects(f.flow.begin(),/stale-battle-opening/);assert.equal(f.starts,0);assert.equal(f.buffers.length,0);assert.equal(f.flow._op,null);
});
test('repeated intro replaces pending work but keeps the original world memo and invalidates only the older wait token',()=>{
 for(const ready of [true,false]){const f=host({ready}),first=f.flow.playTrainerIntro('npc',1),old=f.buffers[0],next=f.flow.playTrainerIntro('npc',1);assert.notEqual(first,next);assert(f.flow.isTrainerIntroReady(first));assert.equal(old.destroyed,1);assert.equal(f.flow.musicState().player.memo.track.name,'Map');assert.equal(f.flow.musicState().player.memo.position,17);if(!ready){f.load(old);assert.equal(f.plays.length,0);f.load();}assert(!f.flow.isTrainerIntroReady(next));f.G.Graphics.frameCount++;assert(f.flow.isTrainerIntroReady(next));f.flow.stateReplaced();}
});
test('native M13 actual action block establishes world after abort without resetting the preserved preset',async()=>{
 // Execute the driver's own actions against the compiled production Scene/music path.
 // Renderer/session/audio remain controlled; this is not a native playback claim.
 const source=fs.readFileSync(path.join(ROOT,'src/plugins/flowtest/d2-music.ts'),'utf8'),start="await run('M13', async () => {",end="\n      });\n      await run('M14'";
 assert.equal(source.split(start).length,2);const from=source.indexOf(start)+start.length,to=source.indexOf(end,from);assert(to>from);const body=source.slice(from,to);
 const plan=require('./music-native-plan.json'),named=name=>plan.prefix+name;
 async function execute(text){
  let f,resets=0,worlds=0;const selected=[];
  const actions={named,flow:new Proxy({},{get(_target,key){const value=f.flow[key];return typeof value==='function'?value.bind(f.flow):value;}}),
   async reset(){resets++;f=host();fs.mkdirSync(path.join(f.root,'audio/bgm',plan.prefix),{recursive:true});for(const name of ['world','preset','next'])f.write(named(name));},
   async world(){worlds++;f.audio.stopBgm();const buffer=f.audio.createBuffer('bgm/',named('world'));f.audio._bgmBuffer=buffer;f.audio._currentBgm={name:named('world'),volume:100,pitch:100,pan:0,pos:0};buffer.play(true,0);},
   async open(){f.open();await f.scene();},
   async active(name){assert.equal(f.audio._currentBgm?.name??null,name,'M13 requires its declared live song');selected.push(name);},
   async finish(){const old=f.currentScene;old.onEnd();old.terminate();f.G.SceneManager._scene={map:true};},
   async abortScene(){f.flow.abort(Error('M13 explicit abort'));f.currentScene.terminate();f.G.SceneManager._scene={map:true};assert.equal(f.audio._bgmBuffer,null,'abort does not restore a world song');assert.equal(f.audio._currentBgm,null,'same-map return without transfer/autoplay stays silent');}};
  const run=vm.runInThisContext('(async ({reset,world,flow,open,active,finish,abortScene,named})=>{'+text+'})',{filename:'native-M13-action-block'}),result=await run(actions);
  return {result,resets,worlds,selected};
 }
 const actual=await execute(body);assert.deepEqual(actual,{result:{futureSurvived:true,abortPreserved:true,normalConsumed:true},resets:1,worlds:2,selected:[named('preset'),named('world'),named('next'),named('next'),named('world'),'Battle wild']});
 const establish='        await world(); // M13 re-establish world explicitly without clearing the preserved preset.\n';assert.equal(body.split(establish).length,2);
 await assert.rejects(execute(body.replace(establish,'')),error=>error.code==='ERR_ASSERTION'&&error.actual===null&&error.expected===named('world'),'removing the new precondition must expose the old actual-null/expected-world mismatch');
});
