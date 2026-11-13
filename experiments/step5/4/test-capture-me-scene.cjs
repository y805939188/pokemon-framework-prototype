'use strict';
// Actual compiled Scene and selected installed MZ audio bodies; renderer,
// decoder/source, clock and application persistence remain controlled ports.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..'),E=require('../../../js/engine/build/production.cjs');let temp,createHost,Step,planOf,config;
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
test.before(()=>{
 let PLUGIN_ROOT=process.env.PF_CAPTURE_SYNC_PRODUCT_ROOT||ROOT; // local: sibling suites extract this initializer into their explicit VM hosts
 if(process.env.PF_HEADLESS_REGRESSION_BINDING){
  const bound=require(path.join(ROOT,'scripts/headless-regression-binding.cjs')).capture(ROOT,process.env.PF_HEADLESS_REGRESSION_BINDING);
  assert.equal(fs.realpathSync(PLUGIN_ROOT),bound.binding.root,'bound capture product root must match the parent binding');
  PLUGIN_ROOT=bound.binding.root; // Consume the canonical bound root after accepting a same-realpath alias.
 }
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-capture-me-scene-'));const root=path.join(ROOT,'src/plugins/battleflow');
 const cfg={compilerOptions:{target:'ES2022',module:'CommonJS',strict:true,types:[],lib:['ES2022'],rootDir:root,outDir:path.join(temp,'pure'),noEmitOnError:true},files:[path.join(root,'capture-me-scene.ts')]};fs.writeFileSync(path.join(temp,'tsconfig.json'),JSON.stringify(cfg));
 const typed=spawnSync('pnpm',['--dir','src','exec','tsc','-p',path.join(temp,'tsconfig.json')],{cwd:ROOT,encoding:'utf8'});assert.equal(typed.status,0,typed.stdout+typed.stderr);
 Step=require(path.join(temp,'pure/capture-me-scene.js')).CaptureMelodySceneStep;planOf=require(path.join(temp,'pure/capture-melody.js')).captureMelodyPlan;config=require(path.join(temp,'pure/battle-music.js')).battleMusicConfig;
 const built={};for(const name of ['PS_BattleFlow','PS_SaveState']){const r=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',path.join(temp,name)],{cwd:PLUGIN_ROOT,env:{...process.env,RR_PLUGIN:name},encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);built[name]=fs.readFileSync(path.join(temp,name,name+'.js'),'utf8');}
 const mutation=process.env.PF_CAPTURE_SCENE_MUTATION;
 if(mutation){const variants={duration:['var CAPTURE_ME_WAIT_MS = 3500;','var CAPTURE_ME_WAIT_MS = 0;',1],stop:['const view = this.lease.snapshot();','if (this.wait.advance(now).stopRequired) { this.wait.acknowledgeStop(); this.completed = true; return true; } const view = this.lease.snapshot();',1],cancel:['?.captureMelody?.cancel();','?.captureMelody;',2],end:['if (!this._aborted && !this._failure && this._captureMelody?.pending()) return;','if (false) return;',1]},row=variants[mutation];assert(row,'known explicit compiled-Scene mutation');const before=built.PS_BattleFlow;assert.equal(before.split(row[0]).length-1,row[2],'exact compiled gate occurrences');built.PS_BattleFlow=before.split(row[0]).join(row[1]);const hash=s=>require('node:crypto').createHash('sha256').update(s).digest('hex');console.log('compiled Scene mutation',mutation,hash(before),hash(built.PS_BattleFlow));}
 const parse=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]})).parseAst;
 const fn=(file,name)=>{const s=fs.readFileSync(path.join(__dirname,file),'utf8'),n=parse(s).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(n,file+':'+name);return s.slice(n.start,n.end);};
 // Reuse explicit test host constructors only; do not execute the other suites.
 const box={require,fs,path,os,vm,assert,E,ROOT,temp,plugin:built.PS_BattleFlow,savePlugin:built.PS_SaveState,flush,parse,make:()=>({})};vm.createContext(box);
 vm.runInContext(fn('test-capture-me-port.cjs','install')+';'+fn('test-capture-me-port.cjs','host').replace('function host(','function audioHost(')+';'+fn('test-battle-music-scene.cjs','host').replace('function host(','function sceneHost(')+';this.hosts={audioHost,sceneHost};',box);
 createHost=({late=false,missing=false,settings={presets:{capture:'Capture:70:120'}}}={})=>{
  let audio;
  const f=box.hosts.sceneHost({settings,beforePlugins(G,f){audio=box.hosts.audioHost({ready:true});Object.defineProperty(audio,'time',{get:()=>f.time,set:n=>f.time=n});Object.defineProperty(audio.audio,'bgmVolume',{get:()=>audio.audio._bgmVolume});audio.bgm.position=17;audio.audio._currentBgm.pos=17;G.AudioManager=audio.audio;f.write('World');if(late)audio.hook=(event,b)=>{if(event==='create'&&b.folder==='me/')b.ready=false;};}});
  fs.mkdirSync(path.join(f.root,'audio/me'),{recursive:true});if(!missing)fs.writeFileSync(path.join(f.root,'audio/me/Capture.ogg'),'controlled decoder existence only');
  // Preserve the original immediate-text fixture; ME/ball clocks and their gates remain real.
  f.flow.fast=true;f.audioHost=audio;f.audio=audio.audio;f.lines=[];f.tick=now=>{f.advance(now);f.G.Graphics.frameCount++;f.currentScene.update();};
  f.ready=async(trainer=false,session=null)=>{if(session){f.session=session;f.app.startBattle=async()=>{f.starts++;f.app.saveBlocked=true;return session;};}f.open(trainer);await f.scene();const s=f.currentScene,add=s._log.add;s._log.add=function(line){f.lines.push({line,time:f.time});return add.call(this,line);};f.G.Input.isTriggered=()=>true;for(let i=0;i<100&&s._mode==='messages';i++)f.tick(f.time+100);assert.equal(s._failure,null);assert(s.inputState().ready);assert.equal(f.flow.musicState().player.requests.at(-1).state,'requested');return s;};
  f.caught=(messages=[{kind:'events',events:[{type:'rpg',args:['ball','p1','masterball','F-1','caught']}]},{kind:'end',reason:'caught',outcome:{target:'F-1',ball:'masterball'},winner:null}])=>{f.currentScene.pushMessages(messages);f.tick(f.time);for(let i=0;i<80&&!f.lines.some(x=>x.line==='ball.caught');i++)f.tick(f.time+50);assert(f.lines.some(x=>x.line==='ball.caught'));assert.equal(f.currentScene.captureMelodyState()?.started,false);const started=f.time;f.tick(started);return started;};
  f.me=()=>audio.buffers.filter(b=>b.folder==='me/');f.cleanup=()=>{f.flow.abort(Error('controlled fixture cleanup'));f.currentScene?.terminate();};return f;
 };
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
test('compiled Scene shows Gotcha before requesting ME, keeps3500ms/save lock and blocks premature onEnd',async()=>{
 const f=createHost(),s=await f.ready();try{const start=f.caught();assert.equal(f.me().length,1);assert.equal(f.me()[0].plays.length,1);assert.equal(s.captureMelodyState().wait.remainingMs,3500);assert.equal(f.app.saveBlocked,true);assert.equal(f.G.$gameSystem.isSaveEnabled(),false);s.onEnd();assert.equal(f.finishes,0);f.tick(start+3499);assert(s.captureMelodyState().wait.busy);assert(!f.lines.some(x=>x.line==='end.caught'));f.tick(start+3500);assert(s.captureMelodyState().completed);assert.equal(f.me()[0].destroyed,1);assert(!f.lines.some(x=>x.line==='end.caught'),'completion update does not drain suffix');f.tick(start+3500);assert(f.lines.some(x=>x.line==='end.caught'));s.onEnd();assert.equal(f.finishes,1);assert.equal(f.app.saveBlocked,false);}finally{f.cleanup();}
});
test('compiled Scene does not infer successful capture from localized text, failed shakes, enemy side or trainer',async()=>{
 for(const mode of ['text','failed','enemy','trainer']){const f=createHost(),s=await f.ready(mode==='trainer');try{const args=['ball',mode==='enemy'?'p2':'p1','masterball','F-1',mode==='failed'?'breakout':'caught'];s.pushMessages(mode==='text'?[{kind:'end',reason:'caught',outcome:null,winner:null}]:[{kind:'events',events:[{type:'rpg',args}]}]);for(let i=0;i<4;i++)f.tick(f.time+100);assert.equal(s.captureMelodyState(),null);assert.equal(f.me().length,0);}finally{f.cleanup();}}
});
test('missing ME still holds the full logical3500ms without requesting another resource',async()=>{
 const f=createHost({missing:true}),s=await f.ready();try{const start=f.caught();assert.equal(s.captureMelodyState().lease.status,'missing');f.tick(start+3499);assert(!s.captureMelodyState().completed);f.tick(start+3500);assert(s.captureMelodyState().completed);assert.equal(f.me().length,0);}finally{f.cleanup();}
});
test('late decode at the exact deadline cannot play and does not restart the3500ms wait',async()=>{
 const f=createHost({late:true}),s=await f.ready();try{const start=f.caught(),b=f.me()[0];f.time=start+3500;f.audioHost.resolve(b);assert.equal(b.plays.length,0);f.tick(start+3500);assert(s.captureMelodyState().completed);assert.equal(b.destroyed,1);f.audioHost.late(b);assert.equal(b.plays.length,0);}finally{f.cleanup();}
});
test('early end and decode failure remain ordinary media states until logical deadline',async()=>{
 for(const mode of ['end','decode']){const f=createHost({late:mode==='decode'}),s=await f.ready();try{const start=f.caught(),b=f.me()[0];if(mode==='end')f.audioHost.end(b);else b.error=true;f.tick(start+100);assert(!s.captureMelodyState().completed);f.tick(start+3499);assert(!s.captureMelodyState().completed);f.tick(start+3500);assert(s.captureMelodyState().completed);}finally{f.cleanup();}}
});
test('fast input and Battle Effects off do not skip the capture melody step',async()=>{
 const f=createHost(),s=await f.ready();try{f.flow.fast=true;f.G.ConfigManager={battleEffects:false};const start=f.caught();for(let i=0;i<20;i++)f.tick(start);assert(!s.captureMelodyState().completed);assert.equal(f.me().length,1);f.tick(start+3500);assert(s.captureMelodyState().completed);}finally{f.cleanup();}
});
test('duplicate successful events and newer presets cannot replay or replace the frozen stage',async()=>{
 const f=createHost(),s=await f.ready();try{const start=f.caught();f.flow.setNextBattleMusic({capture:'Next capture'});s.pushMessages([{kind:'events',events:[{type:'rpg',args:['ball','p1','masterball','F-1','caught']}]}]);assert.equal(f.me().length,1);assert.equal(s.captureMelodyState().track.name,'Capture');f.tick(start+3500);for(let i=0;i<8;i++)f.tick(start+3500);assert.equal(f.me().length,1);s.onEnd();assert.equal(f.flow._nextBattleMusic.presets.capture.name,'Next capture');}finally{f.cleanup();}
});
test('abort during loading immediately cancels own ME and suppresses all late callbacks',async()=>{
 const f=createHost({late:true}),s=await f.ready();const start=f.caught(),b=f.me()[0];f.flow.abort(Error('user abort'));assert(s.captureMelodyState().cancelled);assert.equal(b.destroyed,1);f.audioHost.resolve(b);f.tick(start+9000);assert.equal(b.plays.length,0);assert.equal(f.finishes,0);s.terminate();
});
test('load/newgame replacement and Scene termination revoke old permission without late playback',async()=>{
 for(const mode of ['replacement','newgame','terminate']){const f=createHost({late:true}),s=await f.ready();const start=f.caught(),b=f.me()[0];if(mode==='replacement')f.flow.stateReplaced();else if(mode==='newgame')f.G.DataManager.setupNewGame();else s.terminate();assert(s.captureMelodyState().cancelled);assert.equal(b.destroyed,1);f.audioHost.resolve(b);f.advance(start+9000);assert.equal(b.plays.length,0);assert.equal(f.finishes,0);s.terminate();}
});
test('an external successor ME is preserved through the old capture deadline and release',async()=>{
 const f=createHost({late:true}),s=await f.ready();try{const start=f.caught(),old=f.me()[0];f.audio.playMe({name:'External',volume:100,pitch:100,pan:0});const next=f.audio._meBuffer;f.audioHost.resolve(old);assert.equal(old.plays.length,0);f.tick(start+3500);assert(s.captureMelodyState().completed);assert.equal(f.audio._meBuffer,next);assert.equal(next.destroyed,0);}finally{f.cleanup();}
});
test('unconfirmed stop aborts the Scene instead of acknowledging or committing a result',async()=>{
 const f=createHost(),s=await f.ready();const start=f.caught(),b=f.me()[0];b.failDestroy=Infinity;f.tick(start+3500);assert(s._failure);assert.equal(f.finishes,0);assert.equal(f.aborts,1);assert(!s.captureMelodyState().completed);assert(!s.captureMelodyState().lease.stopConfirmed);assert(s.captureMelodyState().error);s.onEnd();assert.equal(f.finishes,0);b.failDestroy=0;s.terminate();
});
test('abort reentered from the actual ME play call cannot leak an in-flight lease',async()=>{
 const f=createHost(),s=await f.ready();const before=f.time;s.pushMessages([{kind:'events',events:[{type:'rpg',args:['ball','p1','masterball','F-1','caught']}]}]);f.tick(before);f.audioHost.hook=(event,b)=>{if(event==='play'&&b.folder==='me/')f.flow.abort(Error('reentered'));};f.tick(before);const b=f.me()[0];assert(s.captureMelodyState().cancelled);assert(!s.captureMelodyState().completed);assert.equal(b.destroyed,1);assert.equal(f.audio._meBuffer,null);assert.equal(f.finishes,0);s.terminate();
});
test('pure step cancellation during request cannot acknowledge an unreturned/unconfirmed handle',()=>{
 let stage,observed,released=0;const lease={snapshot:()=>({fault:'controlled stop failure',stopConfirmed:false}),release(){released++;return this.snapshot();}};stage=new Step(planOf('wild',config({})),{current:()=>true,request(){stage.cancel();observed=stage.snapshot();return lease;}});assert.equal(stage.advance(0),false);assert(observed.wait.stopRequired);assert(stage.snapshot().wait.stopRequired);assert(stage.snapshot().error);assert(released>0);
});
test('Scene capture diagnostics are detached from the active wait, track and lease state',async()=>{
 const f=createHost(),s=await f.ready();try{const start=f.caught(),view=s.captureMelodyState();view.track.name='mutated';view.wait.remainingMs=0;view.lease.errors.push('forged');view.lease.track.name='changed';assert.equal(s.captureMelodyState().track.name,'Capture');assert.equal(s.captureMelodyState().wait.remainingMs,3500);assert.equal(s.captureMelodyState().lease.errors.length,0);assert.equal(s.captureMelodyState().lease.track.name,'Capture');f.tick(start+3500);assert(s.captureMelodyState().completed);}finally{f.cleanup();}
});
test('replacement operation and its ME survive all old Scene callbacks and termination',async()=>{
 const f=createHost({late:true}),oldScene=await f.ready();f.caught();const old=f.me()[0];f.flow.stateReplaced();await f.ready();const op=f.flow._op;f.audio.playMe({name:'New owner ME',volume:100,pitch:100,pan:0});const next=f.audio._meBuffer;try{f.audioHost.resolve(old);oldScene.onEnd();oldScene.terminate();assert.equal(f.flow._op,op);assert(f.flow.running);assert.equal(f.audio._meBuffer,next);assert.equal(next.destroyed,0);assert.equal(old.plays.length,0);assert.equal(f.finishes,0);}finally{f.audio.stopMe();f.cleanup();}
});
test('real Session capture messages reach the compiled Scene in Gotcha-ME-growth order',async()=>{
 const{BattleSession}=require(path.join(ROOT,'js/engine/game/session.cjs')),F=require(path.join(ROOT,'experiments/step2/s3/fixtures.cjs'));const game=F.makeGame();const session=await BattleSession.create({game,battleId:'capture-scene-real',content:F.content,seed:[1,2,3,4],foe:{kind:'wild',team:[F.foeMember('F-1','Pidgey',5)]}});const f=createHost(),s=await f.ready(false,session);try{const result=await session.throwBall('masterball');assert(result.ok);const growth=result.messages.find(m=>m.kind==='growth');assert(growth,'actual captured-target growth message required');const expected=s._D.message(growth)[0],start=f.caught(result.messages);assert(!f.lines.some(x=>x.line===expected));assert(f.flow.operationPending());f.tick(start+3500);for(let i=0;i<100&&!f.lines.some(x=>x.line===expected);i++)f.tick(start+3500+i*100);assert(f.lines.some(x=>x.line===expected));assert(s.captureMelodyState().completed);}finally{f.cleanup();}
});
async function normalCapture(f,s,messages,input=false){
 f.flow.fast=false;f.G.Input.isTriggered=()=>input;const observed={full:null,start:null,end:null,visibleFrames:0},before=f.time;
 s.pushMessages(messages??[{kind:'events',events:[{type:'rpg',args:['ball','p1','masterball','F-1','caught']}]},{kind:'end',reason:'caught',outcome:{target:'F-1',ball:'masterball'},winner:null}]);
 for(let i=0;i<900;i++){
  f.tick(before+(i+1)*1000/60);
  const full=f.lines.find(r=>r.line==='ball.caught');if(full&&observed.full===null)observed.full=full.time;
  const cap=s.captureMelodyState();if(cap?.started&&observed.start===null){observed.start=f.time;assert(observed.full!==null,'Gotcha must fully paint before ME');assert(f.time-observed.full<=1000/60+0.01,'ME starts the update after full Gotcha, without an extra one-second dwell');}
  if(cap?.started&&!cap.completed){assert(s._log._lines.includes('ball.caught'),'Gotcha stays visible throughout the capture melody');assert.equal(s.ordinaryMessageState()?.phase,'full');observed.visibleFrames++;s.onEnd();assert.equal(f.finishes,0,'cannot finish during the capture block');}
  if(cap?.completed){observed.end=f.time;break;}
 }
 assert(observed.start!==null&&observed.end!==null,'normal capture block completes');assert(observed.end-observed.start>=3500,'mandatory3500ms unchanged');assert(observed.visibleFrames>200);return observed;
}
for(const input of[false,true])test('production pacing '+(input?'with repeated advance':'without input')+' synchronizes full Gotcha and keeps it visible for the mandatory ME block',async()=>{
 const f=createHost(),s=await f.ready();try{const r=await normalCapture(f,s,undefined,input);assert.equal(f.me().length,1);assert.equal(f.me()[0].plays.length,1);assert(s.captureMelodyState().completed);assert.equal(f.app.saveBlocked,true);assert.equal(f.finishes,0);assert(r.end-r.start>=3500);}finally{f.cleanup();}
});
test('real Session Master Ball success uses the normal full-text synchronization before growth without releasing the operation early',async()=>{
 const{BattleSession}=require(path.join(ROOT,'js/engine/game/session.cjs')),F=require(path.join(ROOT,'experiments/step2/s3/fixtures.cjs'));const game=F.makeGame(),session=await BattleSession.create({game,battleId:'normal-capture-sync',content:F.content,seed:[1,2,3,4],foe:{kind:'wild',team:[F.foeMember('F-1','Pidgey',5)]}}),f=createHost(),s=await f.ready(false,session);
 try{const result=await session.throwBall('masterball');assert(result.ok);const growth=result.messages.find(m=>m.kind==='growth');assert(growth);const text=s._D.message(growth)[0];await normalCapture(f,s,result.messages);assert(!f.lines.some(r=>r.line===text),'growth must not precede ME completion');assert(f.flow.operationPending());for(let i=0;i<250&&!f.lines.some(r=>r.line===text);i++)f.tick(f.time+1000/60);assert(f.lines.some(r=>r.line===text),'ordinary growth continues after the block');assert.equal(f.finishes,0);}finally{f.cleanup();}
});
test('missing capture media still preserves full Gotcha throughout the unchanged normal wait',async()=>{
 const f=createHost({missing:true}),s=await f.ready();try{await normalCapture(f,s);assert.equal(f.me().length,0);assert(s.captureMelodyState().completed);assert.equal(s.captureMelodyState().lease.status,'missing');}finally{f.cleanup();}
});
test('normal capture text and stage retire together after an owner abort and old callbacks cannot paint or finish',async()=>{
 const f=createHost(),s=await f.ready();f.flow.fast=false;f.G.Input.isTriggered=()=>false;s.pushMessages([{kind:'events',events:[{type:'rpg',args:['ball','p1','masterball','F-1','caught']}]}]);
 for(let i=0;i<600&&!s.captureMelodyState()?.started;i++)f.tick(f.time+1000/60);assert(s.captureMelodyState()?.started);const owned=s._queue[0];f.flow.abort(Error('normal capture cancelled'));f.tick(f.time+1000/60);assert(s.captureMelodyState().cancelled);assert.equal(s.ordinaryMessageState(),null);const lines=JSON.stringify(s._log._lines);owned.advance(f.time+9000);assert.equal(JSON.stringify(s._log._lines),lines);assert.equal(f.finishes,0);s.terminate();
});
