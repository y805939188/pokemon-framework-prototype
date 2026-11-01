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
