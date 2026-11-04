'use strict';
// Real controller/compiled host code, controlled render/session ports. Native MZ evidence is separate.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..');let dir,Controller,plugin,backdropFixture,backdropPrefix;
const advanceSceneClock=new WeakMap();
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
test.before(()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-d1-controller-'));
 const config={compilerOptions:{target:'ES2022',module:'CommonJS',strict:true,types:[],lib:['ES2022'],rootDir:path.join(ROOT,'src/plugins/battleflow'),outDir:path.join(dir,'pure'),noEmitOnError:true},files:[path.join(ROOT,'src/plugins/battleflow/controller.ts')]};
 fs.writeFileSync(path.join(dir,'tsconfig.json'),JSON.stringify(config));
 const typed=spawnSync('pnpm',['--dir','src','exec','tsc','-p',path.join(dir,'tsconfig.json')],{cwd:ROOT,encoding:'utf8'});assert.equal(typed.status,0,typed.stdout+typed.stderr);
 Controller=require(path.join(dir,'pure/controller.js')).BattleSceneController;
 const built=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',path.join(dir,'plugin')],{cwd:ROOT,env:{...process.env,RR_PLUGIN:'PS_BattleFlow'},encoding:'utf8'});assert.equal(built.status,0,built.stdout+built.stderr);
 plugin=fs.readFileSync(path.join(dir,'plugin/PS_BattleFlow.js'),'utf8');
 const parent=path.join(ROOT,'img/pokemon/battlebacks/__tests__');fs.mkdirSync(parent,{recursive:true});
 backdropFixture=fs.mkdtempSync(path.join(parent,'scene-ready-'));backdropPrefix='__tests__/'+path.basename(backdropFixture)+'/pending';
 // Real filesystem resolution; decoding is an explicitly controlled Image port.
 for(const suffix of ['_bg','_message','_stone_base0','_stone_base1'])fs.writeFileSync(path.join(backdropFixture,'pending'+suffix+'.png'),'controlled Image fixture, not a decoded PNG');
});
test.after(()=>{if(backdropFixture)fs.rmSync(backdropFixture,{recursive:true,force:true});if(dir)fs.rmSync(dir,{recursive:true,force:true});});
function fixture(){
 const f={current:true,active:true,trace:[],aborts:[],time:0};
 const ports={current:()=>f.current,active:()=>f.active,closedFailure:()=>Error('external end'),hideInput:()=>f.trace.push('hide'),appendLine:x=>f.trace.push(x),refreshStatus:()=>f.trace.push('status'),afterMessages:()=>{f.trace.push('route');f.c.phase='main';},abort:e=>{f.aborts.push(e);f.active=false;},unusableView:()=>f.trace.push('unusable'),now:()=>++f.time,actionMeasured:(k,t)=>f.trace.push(['measure',k,t])};
 f.c=new Controller(ports);f.ports=ports;f.c.ready=true;f.c.phase='main';return f;
}
test('pure module compiles with ES2022 only, owns no battle view, and opens exactly once',async()=>{
 const f=fixture(),d=deferred();f.c.ready=false;f.c.phase='boot';let calls=0;
 assert(f.c.open(()=>{calls++;return d.promise;}));assert(!f.c.open(()=>{calls++;return{};}));assert.equal(calls,1);assert(!f.c.ready);
 const handle=Object.freeze({opaque:'session'});d.resolve(handle);await flush();assert.equal(f.c.session,handle);assert(f.c.ready);assert.deepEqual(f.trace,[]);
});
for(const ending of ['dispose','replace'])for(const result of ['resolve','reject'])test(`opening ${result} after ${ending} cannot publish a session/error`,async()=>{
 const f=fixture(),d=deferred();f.c.ready=false;f.c.open(()=>d.promise);if(ending==='dispose')f.c.dispose();else f.current=false;
 d[result](result==='resolve'?{}:Error('late'));await flush();assert.equal(f.c.session,null);assert.equal(f.c.failure,null);assert(!f.c.ready);assert.equal(f.aborts.length,0);assert.deepEqual(f.trace,[]);
});
for(const mode of ['throw','reject','throw-falsy'])test(`${mode} action releases busy once and contains reentrant abort`,async()=>{
 const f=fixture();f.ports.abort=e=>{f.aborts.push(e);f.c.fail(Error('nested'));f.active=false;};
 f.c.run(()=>{if(mode==='reject')return Promise.reject(Error('reject'));throw mode==='throw-falsy'?0:Error('throw');},()=>assert.fail('failed result delivered'));
 await flush();assert(!f.c.busy);assert(f.c.failure);assert.equal(f.aborts.length,1);assert.equal(f.c.phase,'messages');assert.equal(f.c.queue.length,0);
});
test('duplicate input cannot start a second pending action; measured/result callbacks remain reserved',async()=>{
 const f=fixture(),d=deferred();let calls=0,delivered=0;
 f.ports.actionMeasured=()=>{assert(!f.c.input(()=>assert.fail('reentrant input')));assert(!f.c.run(()=>assert.fail('nested action'),()=>{}));};
 assert(f.c.run(()=>{calls++;return d.promise;},()=>{delivered++;f.c.enqueue(['result']);},'move'));
 assert(!f.c.run(()=>calls++,()=>{}));await flush();assert.equal(calls,1);assert(f.c.busy);
 d.resolve({ok:true});await flush();assert.equal(delivered,1);assert(!f.c.busy);assert.deepEqual(f.c.queue,['result']);assert(!f.c.canChoose());
});
for(const ending of ['dispose','replace','external-close'])for(const result of ['resolve','reject'])test(`pending action ${result} after ${ending} has no successor effects`,async()=>{
 const f=fixture(),d=deferred();f.c.run(()=>d.promise,()=>f.trace.push('delivered'));await flush();
 if(ending==='dispose')f.c.dispose();else if(ending==='replace')f.current=false;else{f.active=false;f.c.tick(false,0);}
 const before=JSON.stringify(f.trace);d[result](result==='resolve'?{messages:['late']}:Error('late'));await flush();assert.equal(JSON.stringify(f.trace),before);assert.equal(f.aborts.length,0);
});
test('disposal before deferred action invocation prevents the action itself',async()=>{
 const f=fixture();let calls=0;f.c.run(()=>calls++,()=>{});f.c.dispose();await flush();assert.equal(calls,0);assert.equal(f.aborts.length,0);
});
test('message pacing preserves one-line waits and next-tick routing',()=>{
 const f=fixture();f.c.enqueue(['one','two']);f.c.tick(false,1);assert.deepEqual(f.trace,['hide','one']);
 f.c.tick(false,1);assert.deepEqual(f.trace,['hide','one']);f.c.tick(false,1);assert.deepEqual(f.trace,['hide','one','two']);
 f.c.tick(false,1);assert.deepEqual(f.trace,['hide','one','two','status','route']);assert(f.c.canChoose());
});
test('fast forward drains its original batch, while renderer reentry cannot loop or consume new text',()=>{
 const f=fixture();f.ports.appendLine=x=>{f.trace.push(x);if(x==='one'){f.c.enqueue(['later']);f.c.tick(true,0);}};
 f.c.enqueue(['one','two']);f.c.tick(true,0);assert.deepEqual(f.c.queue,['later']);assert.deepEqual(f.trace.filter(x=>x==='one'||x==='two'||x==='later'),['one','two']);
 f.c.tick(true,0);assert.equal(f.c.queue.length,0);assert.equal(f.trace.at(-1),'later');
});
test('status callback replacing owner cannot route an old menu',()=>{const f=fixture();f.c.enqueue([]);f.ports.refreshStatus=()=>{f.current=false;};f.c.tick(false,0);assert(!f.trace.includes('route'));});
test('append callback replacing owner cannot append another line',()=>{const f=fixture();f.ports.appendLine=x=>{f.trace.push(x);f.current=false;};f.c.enqueue(['one','two']);f.c.tick(true,0);assert(!f.trace.includes('two'));});
test('input reentry is rejected and a closed host cannot choose',()=>{const f=fixture();assert(f.c.input(()=>{assert(!f.c.input(()=>assert.fail('nested')));}));f.active=false;assert(!f.c.input(()=>assert.fail('closed')));});
test('formatting failure aborts once; a broken error view retires without a busy/save deadlock',()=>{
 const f=fixture();f.c.present(()=>{throw Error('format');});assert.equal(f.aborts.length,1);assert(!f.c.busy);
 f.ports.afterMessages=()=>{throw Error('broken error view');};f.c.tick(false,0);assert.equal(f.trace.at(-1),'unusable');assert.equal(f.aborts.length,1);assert(!f.c.isCurrent());
});
test('an error thrown after owner replacement never aborts the successor',()=>{const f=fixture();assert(!f.c.present(()=>{f.current=false;throw Error('late view');}));assert.equal(f.aborts.length,0);});

function host({opening,display=false,audio,exists,now,exp=125000}={}){
 let sceneTime=0;
 const commands={};
 const counts={abort:0,finish:0,pop:0,hide:0,choose:0},session={party:[],foeTeam:[],bag:{},finished:false,pendingLearn:null,take:()=>[],currentRequest:()=>({active:[{moves:[{move:'Splash',id:'splash',pp:40,maxpp:40}]}]}),gw:{readState:()=>[]},chooseMove:()=>{counts.choose++;return {messages:[]};}};
 counts.paint=[];
 if(display){session.party=[{id:'P',species:'Pidgey',exp}];session.foeTeam=[{id:'F',species:'Pidgey'}];session.content={species:{Pidgey:{growth:'medium'}}};session.gw.readState=side=>[{id:side==='p1'?'P':'F',level:50,hp:100,maxhp:100,status:'',active:true}];}
 function Base(){}Base.prototype={initialize(){this.children=[];},create(){this._windowLayer={};this.children.push(this._windowLayer);},start(){},update(){},terminate(){},isReady(){return true;},addWindow(){},addChild(s){this.children.push(s);s.parent=this;},addChildAt(s,i){this.children.splice(i,0,s);s.parent=this;},removeChild(s){this.children.splice(this.children.indexOf(s),1);s.parent=null;},popScene(){counts.pop++;}};
 counts.bitmaps=[];counts.sprites=[];
 class Bitmap{constructor(w,h){this.width=w;this.height=h;this.context={drawImage(){}};this.destroys=0;counts.bitmaps.push(this);}fillAll(){}blt(){}drawText(){}destroy(){this.destroys++;}}
 class Sprite{constructor(bitmap){this.bitmap=bitmap;this.anchor={x:0,y:0};this.scale={x:1,y:1};this.opacity=255;this.visible=true;this.destroys=0;counts.sprites.push(this);}destroy(){this.destroys++;this.destroyed=true;}}
 function Window(){}Window.prototype={initialize(rect){this.innerWidth=rect.width-24;this.innerHeight=rect.height-24;this.contents={clear(){},fillRect(...args){counts.paint.push(args);}};this._index=0;this.active=false;this.visible=false;},resetFontSettings(){},lineHeight:()=>24,textWidth:x=>String(x).length*8,drawText(){},refresh(){this._list=[];this.makeCommandList?.();},addCommand(name,symbol,enabled,ext){this._list.push({name,symbol,enabled,ext});},select(i){this._index=i;},index(){return this._index;},setHandler(){},show(){this.visible=true;},hide(){this.visible=false;counts.hide++;},activate(){this.active=true;},deactivate(){this.active=false;},isOpenAndActive(){return this.visible&&this.active;}};
 function System(){}System.prototype.isSaveEnabled=()=>true;
 // This VM has no audio decoder. Its explicit media view is missing; local
 // developer/NW PCM fixtures must not change this controlled host's contract.
 const realFS=require('fs'),audioRoot=path.join(ROOT,'audio','se')+path.sep;counts.faintAudioPaths=[];
 const controlledFS={...realFS,...(exists?{existsSync:exists}:{}),statSync(file,...args){
  if(typeof file==='string'&&path.resolve(file).startsWith(audioRoot)){counts.faintAudioPaths.push(file);const error=Error('controlled audio absence');error.code='ENOENT';throw error;}
  return realFS.statSync(file,...args);
 }};
 const req=p=>{if(p==='fs')return controlledFS;if(p==='path'||p==='url')return require(p);if(p.includes('production.cjs'))return require(path.join(ROOT,'js/engine/build/production.cjs'));throw Error('unexpected require '+p);};req.resolve=p=>path.resolve(ROOT,p);
 const G={Error,performance,require:req,console:{log(){},warn(){},error(){}},PluginManager:{parameters:()=>({}),registerCommand(plugin,name,fn){commands[name]=fn;}},Game_Interpreter:Base,Game_System:System,Window_Base:Window,Window_Command:Window,Scene_MenuBase:Base,SceneManager:{_scene:null,push(){},isSceneChanging:()=>false},Graphics:{boxWidth:816,boxHeight:624,frameCount:0},Rectangle:function(x,y,width,height){Object.assign(this,{x,y,width,height});},Utils:{extractFileName:x=>x},Input:{isTriggered:()=>false},SoundManager:{playBuzzer(){}},$gameSystem:new System(),$gameMessage:{isBusy:()=>false,add(){}},$gameVariables:{setValue(){}}};
 G.Bitmap=Bitmap;G.Sprite=Sprite;G.AudioManager=audio;G.Utils.hasEncryptedAudio=()=>false;G.performance={now:now??(()=>sceneTime)};
 G.window=G;vm.createContext(G);vm.runInContext(plugin,G);
 const flow=G.PSFlow,app={stateGeneration:0,saveBlocked:false,pendingEvolution:null,pendingReceiving:null,pendingPokedex:null,stateReplacedByHost(){this.stateGeneration++;},finishBattle(){counts.finish++;return {code:1,commit:'applied',battleId:'scene#1'};},abortBattle(request,error){counts.abort++;return {code:0,commit:'none',battleId:request.battleId,aborted:true,error:String(error)};}};
 // This host isolates pictures/controller lifecycle from ordinary text pacing.
 flow.fast=true;flow._app=app;flow._op={request:{battleId:'scene#1',canLose:true},session};flow.request=flow._op.request;flow.running=true;flow.perf.cur={battleId:'scene#1',t0:0,actions:[]};flow.begin=()=>opening??Promise.resolve(session);if(display)flow.speciesName=x=>x;
 const scene=new G.Scene_PSBattle();G.SceneManager._scene=scene;
 advanceSceneClock.set(scene,delta=>{sceneTime+=delta;});
 return{G,flow,app,scene,session,counts,commands,async ready(){scene.create();await flush();assert(scene.isReady());scene.start();for(let i=0;i<8&&!scene.inputState().ready;i++)scene.updateQueue();assert.equal(scene._mode,'main',String(scene._failure||''));assert(scene.inputState().ready);return this;}};
}
test('compiled scene exposes detached semantic-ready DTO; MZ-deactivated handler can act once',async()=>{
 const h=await host().ready(),s=h.scene;const view=s.inputState();assert.equal(view.implementation,'d2-menu-grid-v1');assert(view.ready);view.items[0].enabled=false;assert.notEqual(s._menu._items[0].enabled,false);
 s.onMenuOk();assert.equal(s._mode,'moves');s._menu.deactivate();assert(!s.inputState().ready);s.onMenuOk();s.onMenuOk();await flush();assert.equal(h.counts.choose,1);s.updateQueue();assert(s.inputState().ready);
});
test('compiled real status window paints late EXP flash for 200ms and releases only owned media',async()=>{
 let time=0;const created=[],files=[],parameters=[];
 const audio={seVolume:60,audioFileExt:()=>'.ogg',createBuffer(folder,name){const record={folder,name,plays:0,stops:0,destroys:0};created.push(record);return{play(){record.plays++;},stop(){record.stops++;},destroy(){record.destroys++;}};},updateBufferParameters(buffer,volume,input){parameters.push({volume,...input});},stopSe(){assert.fail('global SE cleanup');}};
 const h=await host({display:true,audio,exists:file=>{files.push(file);return true;},now:()=>time}).ready(),s=h.scene;
 // Presentation-only late-clock control; real Session metadata is exercised by growth-display and native S02.
 s._controller.enqueue([s._display.experience('P',{level:50,from:0,to:1}),s._display.growth('P',{toLevel:50,hp:100,maxhp:100,ratio:1})]);
 s.updateQueue();time=9000;s.updateQueue();assert(s.presentationState().cards.find(c=>c.id==='P').flash);assert(!s.inputState().ready);assert(h.counts.paint.some(row=>row[1]===72&&row.at(-1)==='#ffffff'));
 time=9199;s.updateQueue();assert(!s.inputState().ready);time=9200;s.updateQueue();assert(!s.presentationState().cards.find(c=>c.id==='P').flash);s.updateQueue();s.updateQueue();assert(s.inputState().ready);
 assert.equal(created.length,2);assert(created.every(r=>r.folder==='se/'&&r.plays===1));assert(files.every(f=>f.endsWith('.ogg')&&!f.endsWith('.ogg_')));assert(parameters.every(p=>p.volume===80));
 s.terminate();assert(created.every(r=>r.stops===1&&r.destroys===1));s.terminate();assert(created.every(r=>r.stops===1));
});
test('compiled media absence keeps basic EXP feedback and does not attempt missing loads',async()=>{
 let time=0,loads=0;const audio={audioFileExt:()=>'.ogg',createBuffer(){loads++;throw Error('must not load missing media');},updateBufferParameters(){}};
 const h=await host({display:true,audio,exists:()=>false,now:()=>time}).ready(),s=h.scene;
 s._controller.enqueue([s._display.experience('P',{level:50,from:.5,to:1})]);s.updateQueue();time=875;s.updateQueue();assert(s.presentationState().cards[0].flash);assert(!s.inputState().ready);time=1075;s.updateQueue();s.updateQueue();assert(s.inputState().ready);assert.equal(loads,0);assert.deepEqual(Array.from(s.presentationState().audio,row=>row.status),['missing','missing']);
});
for(const result of ['resolve','reject'])test(`compiled scene ignores ${result} after load/new owner, including perf and global pop`,async()=>{
 const h=await host().ready(),d=deferred(),s=h.scene;s.act(()=>d.promise,'move');await flush();
 h.flow.stateReplaced();const successor={request:{battleId:'successor'},session:{}};h.flow._op=successor;h.flow.running=true;h.flow.perf.cur={battleId:'successor',actions:[]};const nextScene={};h.G.SceneManager._scene=nextScene;
 const hides=h.counts.hide;d[result](result==='resolve'?{messages:[]}:Error('late'));await flush();s.abort(Error('late explicit abort'));assert.equal(h.flow.lastStale.what,'abort');s.terminate();s.onEnd();assert.equal(h.flow._op,successor);assert(h.flow.running);assert.equal(h.counts.pop,0);assert.equal(h.counts.abort,0);assert.equal(h.counts.hide,hides);assert.equal(h.flow.perf.cur.actions.length,0);assert.equal(h.G.SceneManager._scene,nextScene);
});
test('compiled scene captures application generation even when root op identity is unchanged',async()=>{const h=await host().ready(),d=deferred();h.scene.act(()=>d.promise);await flush();h.app.stateGeneration++;const hides=h.counts.hide;d.resolve({messages:[]});await flush();h.scene.onEnd();h.scene.terminate();assert.equal(h.counts.abort,0);assert.equal(h.counts.finish,0);assert.equal(h.counts.pop,0);assert.equal(h.counts.hide,hides);});
for(const result of ['resolve','reject'])test(`compiled opening ${result} after termination cannot install or touch UI`,async()=>{
 const d=deferred(),h=host({opening:d.promise});h.scene.create();h.scene.terminate();assert.equal(h.counts.abort,1);assert(!h.flow.running);const hides=h.counts.hide;d[result](result==='resolve'?h.session:Error('late'));await flush();assert.equal(h.scene._session,null);assert.equal(h.counts.hide,hides);assert.equal(h.counts.abort,1);assert.equal(h.counts.pop,0);
});
test('compiled finish is one-shot and cannot pop a successor created during commit',async()=>{
 const h=await host().ready();h.session.finished=true;h.scene.showEnd(false);h.app.finishBattle=()=>{h.counts.finish++;h.flow.stateReplaced();h.flow._op={request:{battleId:'new'}};h.flow.running=true;return {code:1,commit:'applied',battleId:'scene#1'};};h.scene.onEnd();h.scene.onEnd();assert.equal(h.counts.finish,1);assert.equal(h.counts.pop,0);assert.equal(h.flow._op.request.battleId,'new');
});
for(const transfer of ['receiving','evolution'])test(`compiled ${transfer} handoff retains its root save/wait owner`,async()=>{
 const h=await host().ready();h.session.finished=true;h.scene.showEnd(false);
 h.app.finishBattle=()=>{h.counts.finish++;if(transfer==='receiving')h.app.pendingReceiving={token:'r'};else h.app.pendingEvolution={token:'e'};return {code:1,commit:'none',battleId:'scene#1',pending:true,...(transfer==='evolution'?{continuationToken:'e'}:{})};};
 if(transfer==='receiving')h.G.PSManagement={replaceBattleWithReceiving:()=>true};h.scene.onEnd();h.scene.terminate();assert(h.flow.running);assert(!h.G.$gameSystem.isSaveEnabled());assert.equal(h.counts.abort,0);assert.equal(h.counts.finish,1);
});
test('compiled abort releases only the battle mask and leaves the end menu usable',async()=>{const h=await host().ready();assert(!h.G.$gameSystem.isSaveEnabled());h.scene.abort(Error('action fault'));h.scene.updateQueue();assert.equal(h.scene._mode,'end');assert(h.scene.inputState().ready);assert(h.G.$gameSystem.isSaveEnabled());h.scene.onMenuOk();assert.equal(h.counts.pop,1);assert.equal(h.counts.abort,1);});
for(const pending of ['idle','resolve','reject'])test(`actual Scene.update observes external abort while ${pending} without a second application abort`,async()=>{
 const h=await host().ready(),s=h.scene,d=deferred();
 if(pending!=='idle'){s.act(()=>d.promise);await flush();assert(s._busy);}
 h.flow.abort(Error('external owner close'));
 if(pending!=='idle'){d[pending](pending==='resolve'?{messages:[]}:Error('late rejected'));await flush();}
 for(let i=0;i<3;i++)s.update();assert.equal(s._mode,'end');assert(!s._busy);assert(s.inputState().ready);assert(h.G.$gameSystem.isSaveEnabled());assert.equal(h.counts.abort,1);assert.equal(h.counts.finish,0);s.onMenuOk();assert.equal(h.counts.pop,1);assert.equal(h.counts.abort,1);
});
for(const phase of ['opening','messages','end'])test(`actual Scene.update external abort adjacent ${phase} remains usable`,async()=>{
 const d=deferred(),h=phase==='opening'?host({opening:d.promise}):await host().ready(),s=h.scene;
 if(phase==='opening')s.create();else if(phase==='messages')s.pushMessages([]);else s.showEnd(false);
 h.flow.abort(Error('external adjacent'));if(phase==='opening'){d.resolve(h.session);await flush();assert(s.isReady());s.start();}
 for(let i=0;i<3;i++)s.update();assert.equal(s._mode,'end');assert(s.inputState().ready);s.onMenuCancel();assert(s.inputState().ready);assert.equal(h.counts.pop,0);s.onMenuOk();assert.equal(h.counts.pop,1);assert.equal(h.counts.abort,1);assert.equal(h.counts.finish,0);
});
test('external abort before an end handler cannot finish the closed application before the next update',async()=>{
 const h=await host().ready(),s=h.scene;s.showEnd(false);h.flow.abort(Error('close before input'));s.onMenuOk();assert.equal(h.counts.finish,0);assert.equal(h.counts.pop,0);s.update();s.update();assert(s.inputState().ready);s.onMenuOk();assert.equal(h.counts.pop,1);assert.equal(h.counts.abort,1);assert.equal(h.counts.finish,0);
});
for(const mode of ['reject','throw-falsy'])test(`compiled ${mode} opening becomes an owned, usable aborted end`,async()=>{
 const d=deferred(),h=host({opening:d.promise});if(mode==='throw-falsy')h.flow.begin=()=>{throw 0;};h.scene.create();if(mode==='reject')d.reject(Error('opening rejected'));await flush();assert(h.scene.isReady());h.scene.start();h.scene.updateQueue();assert.equal(h.scene._mode,'end');assert(h.scene.inputState().ready);assert.equal(h.counts.abort,1);assert(!h.flow.running);assert(h.G.$gameSystem.isSaveEnabled());
});
for(const choice of [0,null])test(`compiled terminal learning ${choice===null?'decline':'accept'} settles once after messages`,async()=>{
 const h=await host().ready(),s=h.scene;h.session.party=[{id:'P1',moves:[{id:'splash'}]}];h.session.pendingLearn={memberId:'P1',move:{name:'Growl'}};
 let learned;h.session.decideLearn=async slot=>{learned=slot;h.session.pendingLearn=null;h.session.finished=true;return [];};s.pushMessages([]);s.updateQueue();assert.equal(s._mode,'learn');s._menu.select(s._menu._items.findIndex(x=>x.ext===choice));s.onMenuOk();await flush();assert.equal(learned,choice);s.updateQueue();assert.equal(s._mode,'end');s.onMenuOk();s.onMenuOk();assert.equal(h.counts.finish,1);assert.equal(h.counts.pop,1);assert(!h.flow.running);
});
test('compiled forced replacement stays mandatory and submits the legal member once',async()=>{
 const h=await host().ready(),s=h.scene;h.flow.speciesName=x=>x;h.session.party=[{id:'P1',species:'Snorlax'},{id:'P2',species:'Snorlax'}];h.session.gw.readState=()=>[{id:'P1',active:true,fainted:true,level:50,hp:0,maxhp:100},{id:'P2',active:false,fainted:false,level:50,hp:100,maxhp:100}];let forced=true,chosen;
 h.session.currentRequest=()=>({forceSwitch:forced,active:[{moves:[]}]});h.session.chooseForcedSwitch=member=>{chosen=member;forced=false;return {messages:[]};};s.pushMessages([]);s.updateQueue();assert.equal(s._mode,'party-forced');s.onMenuCancel();assert.equal(s._mode,'party-forced');s._menu.select(1);s.onMenuOk();s.onMenuOk();await flush();assert.equal(chosen,'P2');s.updateQueue();assert.equal(s._mode,'main');assert.equal(h.flow.perf.cur.actions.length,1);
});
test('compiled menu redraw replacing host cannot activate obsolete input',async()=>{
 const h=await host().ready(),s=h.scene;s._menu.deactivate();s._menu.hide();const next={request:{battleId:'next'}};
 s._menu.setItems=()=>{h.flow.stateReplaced();h.flow._op=next;h.flow.running=true;};s.showMain();assert.equal(h.flow._op,next);assert(!s._menu.active);assert(!s._menu.visible);assert(!s.inputState().ready);
});
function publishBagMember(h) {
 // This controller-only host otherwise has no party. Publish the valid stable
 // identity now required by the bag consumer, without changing navigation assertions.
 h.session.party=[{id:'P',species:'Pidgey',moves:[]}];
 h.session.gw.readState=side=>side==='p1'?[{id:'P',active:true,hp:10,maxhp:10}]:[];
}
test('compiled cancel navigation preserves bag/party intent and is blocked while action is pending',async()=>{
 const h=await host().ready(),s=h.scene,d=deferred();publishBagMember(h);s.showMoves();s.onMenuCancel();assert.equal(s._mode,'main');s.showBag();s.onMenuCancel();assert.equal(s._mode,'main');s._pendingItem='potion';s.show('party',[]);s.onMenuCancel();assert.equal(s._pendingItem,null);assert.equal(s._mode,'bag');s.onMenuCancel();s.act(()=>d.promise);await flush();const phase=s._mode;s.onMenuCancel();assert.equal(s._mode,phase);assert(s._busy);d.resolve({messages:[]});await flush();s.updateQueue();assert.equal(s._mode,'main');
});
test('compiled postcommit message failure preserves committed outcome and never aborts application state',async()=>{
 const h=await host().ready();h.session.finished=true;h.scene.showEnd(false);h.app.finishBattle=()=>{h.counts.finish++;return {code:1,commit:'applied',battleId:'scene#1',trainerReward:{actual:10,normalizationLoss:0}};};h.G.$gameMessage.add=()=>{throw Error('message after commit');};h.scene.onMenuOk();assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(h.flow.lastOutcome.code,1);assert.equal(h.counts.abort,0);assert.equal(h.counts.finish,1);assert.equal(h.flow.lastOutcome.hostErrors[0].step,'trainer-reward-message');assert.equal(h.counts.pop,1);assert(!h.flow.running);
});

test('compiled initial view does not abort or normalize author EXP outside the held level interval',async()=>{
 for(const exp of [0,200000]){const h=await host({display:true,exp}).ready(),card=h.scene.presentationState().cards.find(x=>x.side==='p1');assert.equal(card.ratio,null);assert.equal(card.experienceUnavailable,'outside-level-interval');assert.equal(h.session.party[0].exp,exp);assert.equal(h.counts.abort,0);assert(h.scene.inputState().ready);h.scene.terminate();}
});

test('compiled command window uses two columns with occupied-grid edges and detached column metadata',async()=>{
 const h=await host().ready(),s=h.scene,m=s._menu;assert.equal(m.maxCols(),2);const view=s.inputState();view.columns=9;assert.equal(s.inputState().columns,2);
 for(const [method,index]of [['cursorRight',1],['cursorDown',3],['cursorRight',3],['cursorLeft',2],['cursorUp',0],['cursorLeft',0]]){m[method](true);assert.equal(m.index(),index);}
 assert.equal(h.counts.choose,0);assert(s.inputState().ready);
});
test('compiled Scene keeps command and move cursors separate across cancel and bag return',async()=>{
 const h=await host().ready(),s=h.scene;publishBagMember(h);s._session.currentRequest=()=>({active:[{moves:['A','B','C','D'].map(id=>({id,move:id,pp:5,maxpp:5}))}]});
 s.showMoves();s._menu.select(3);s.onMenuCancel();assert.equal(s._mode,'main');assert.equal(s._menu.index(),0);s._menu.select(1);s.onMenuOk();assert.equal(s._mode,'bag');assert.equal(s._menu.maxCols(),1);s.onMenuCancel();assert.equal(s._menu.index(),1);s._menu.select(0);s.onMenuOk();assert.equal(s._mode,'moves');assert.equal(s._menu.index(),3);assert.equal(s._menu.maxCols(),2);assert.equal(h.counts.choose,0);
});

async function rememberBoth(s) {
 s.showMoves();s._menu.select(3);s.onMenuCancel();s._menu.select(2);s.onMenuOk();s.onMenuCancel();
 assert.equal(s._menu.index(),2);assert.equal(s._menuCursor.index('moves',4),3);
}
function drainScene(s) {
 for(let i=0;i<1000&&!s.inputState().ready;i++){advanceSceneClock.get(s)?.(50);s.update();}
 assert(s.inputState().ready,String(s._failure));
}
for(const roar of [false,true])test(`real Session compiled Scene resets both cursors after ${roar?'same-turn A-B-A Roar':'ordinary A-B switch'}`,async()=>{
 const {BattleSession}=require(path.join(ROOT,'js/engine/game/session.cjs')),F=require(path.join(ROOT,'experiments/step2/s3/fixtures.cjs'));
 const game=F.makeGame();game.party=game.party.slice(0,2);
 const foe=F.foeMember('F-1','Snorlax',50);foe.moves=[roar?{id:'roar',pp:20,maxpp:20}:{id:'splash',pp:40,maxpp:40}];
 const session=await BattleSession.create({game,battleId:'menu-reset-'+roar,content:F.content,seed:[1,2,3,4],foe:{kind:'trainer',team:[foe]}});
 const h=host({display:true});h.flow.begin=()=>Promise.resolve(session);h.flow._op.session=session;
 const s=h.scene,painted=[],emitted=[];
 try {
  s.create();await flush();assert(s.isReady());s.start();drainScene(s);
  const refresh=s._status.refresh;s._status.refresh=function(...args){const r=refresh.apply(this,args);const id=s.presentationState().cards.find(c=>c.side==='p1'&&c.active)?.id;if(painted.at(-1)!==id)painted.push(id);return r;};
  const push=s.pushMessages;s.pushMessages=function(messages){emitted.push(...JSON.parse(JSON.stringify(messages)));return push.call(this,messages);};
  await rememberBoth(s);s.onMenuOk();assert.equal(s._mode,'party');
  s._menu.select(s._menu._items.findIndex(x=>x.ext===game.party[1].id));s.onMenuOk();
  for(let i=0;i<100&&s._busy;i++)await flush();assert(!s._busy);assert.equal(s._failure,null);drainScene(s);
  assert.equal(s._mode,'main');assert.equal(s._menu.index(),0);s.onMenuOk();assert.equal(s._mode,'moves');assert.equal(s._menu.index(),0);
  assert(painted.includes(game.party[1].id));assert.equal(painted.at(-1),game.party[roar?0:1].id);
  const switches=emitted.filter(m=>m.kind==='events').flatMap(m=>m.events).filter(e=>['switch','drag'].includes(e.type));
  assert(switches.some(e=>e.type==='switch'&&e.args[0].includes(game.party[1].id)));
  if(roar)assert(switches.some(e=>e.type==='drag'&&e.args[0].includes(game.party[0].id)));
 } finally {s.terminate();}
});
async function projectionMenuHost() {
 const h=host({display:true});h.session.party.push({id:'Q',species:'Pidgey',exp:125000});h.session.foeTeam.push({id:'G',species:'Pidgey'});
 h.session.gw.readState=side=>(side==='p1'?['P','Q']:['F','G']).map((id,i)=>({id,level:50,hp:100,maxhp:100,status:'',active:i===0}));
 h.session.currentRequest=()=>({active:[{moves:['A','B','C','D'].map(id=>({id,move:id,pp:5,maxpp:5}))}]});
 await h.ready();await rememberBoth(h.scene);return h;
}
const sendOut=(side,id,type='switch')=>({kind:'events',events:[{type,args:[side+'a: '+id,'Pidgey, L50','100/100']}]});
test('production Scene.update owns the picture ordinal; repeated queue reads cannot advance an endpoint',async()=>{
 let time=0;const h=await host({display:true,now:()=>time}).ready(),s=h.scene;
 const before=JSON.stringify(h.session.party);s.pushMessages([sendOut('p1','P')]);s.update();
 const body=h.counts.sprites.find(x=>x._psPictureKey==='p1:P'&&x._psPictureRole==='body');
 assert.equal(s._pictureUpdate,1);assert.equal(body.scale.x,0);assert.equal(body.opacity,0);assert(!s.inputState().ready);
 time=500;for(let i=0;i<5;i++)s.updateQueue();
 assert.equal(s._pictureUpdate,1);assert.equal(body.scale.x,0);assert.equal(s.pictureState().runningGroups,1);
 s.update();assert.equal(s._pictureUpdate,2);assert.equal(body.scale.x,1);assert.equal(body.opacity,255);assert.equal(s.pictureState().runningGroups,1);
 for(let i=0;i<5;i++)s.updateQueue();assert.equal(s.pictureState().runningGroups,1);assert(!s.inputState().ready);
 s.update();assert.equal(s._pictureUpdate,3);assert.equal(s.pictureState().runningGroups,0);
 drainScene(s);assert(s.inputState().ready);assert.equal(h.counts.choose,0);assert.equal(JSON.stringify(h.session.party),before);s.terminate();
});
test('compiled picture recall precedes public replacement, without an early full-size successor paint',async()=>{
 let time=0;
 // Install the same published-card shape as a real two-member Session. No model reads occur during the animation.
 const next=host({display:true,now:()=>time});next.session.party.push({id:'Q',species:'Pidgey',exp:125000});
 next.session.gw.readState=side=>(side==='p1'?['P','Q']:['F']).map((id,i)=>({id,level:50,hp:100,maxhp:100,status:'',active:i===0}));
 await next.ready();const scene=next.scene;scene.pushMessages([sendOut('p1','Q')]);scene.update();
 const old=next.counts.sprites.find(x=>x._psPictureKey==='p1:P'&&x._psPictureRole==='body');
 assert.equal(old.scale.x,1);assert(!next.counts.sprites.some(x=>x._psPictureKey==='p1:Q'));
 time=125;scene.update();assert.equal(old.scale.x,.5);time=250;scene.update();assert.equal(old.scale.x,0);
 assert.equal(scene.presentationState().cards.find(c=>c.side==='p1'&&c.active).id,'P');
 scene.update();scene.update();
 const replacement=next.counts.sprites.find(x=>x._psPictureKey==='p1:Q'&&x._psPictureRole==='body');
 assert.equal(old.destroys,1);assert.equal(replacement.scale.x,0);assert.equal(replacement.opacity,0);assert.equal(scene.presentationState().cards.find(c=>c.side==='p1'&&c.active).id,'Q');
 time=750;scene.update();scene.update();drainScene(scene);assert(next.scene.inputState().ready);next.scene.terminate();
});
test('compiled Scene cancels owned pictures on external abort and late visual callbacks cannot touch a successor',async()=>{
 const h=await host({display:true}).ready(),old=h.scene;old.pushMessages([sendOut('p1','P')]);old.update();
 const late=old._queue[0],owned=h.counts.sprites.filter(x=>x._psPictureRole),bitmaps=owned.map(x=>x.bitmap);
 h.flow.abort(Error('picture cancellation'));old.update();assert(owned.every(x=>x.destroys===1));assert(bitmaps.every(x=>x.destroys===1));
 const successor={untouched:true};h.G.SceneManager._scene=successor;const created=h.counts.sprites.length;
 late.advance(1000);late.cancel();old.terminate();old.terminate();
 assert.equal(h.counts.sprites.length,created);assert.equal(h.G.SceneManager._scene,successor);assert(owned.every(x=>x.destroys===1));assert(bitmaps.every(x=>x.destroys===1));assert.equal(h.counts.abort,1);
});
test('invalid picture ordinal fails visibly and keeps the owned aborted-end menu usable',async()=>{
 const h=await host({display:true}).ready(),s=h.scene,images=h.counts.sprites.filter(x=>x._psPictureRole);
 s._pictureUpdate=Number.MAX_SAFE_INTEGER;s.update();s.update();assert.equal(h.counts.abort,1);assert.equal(s._mode,'end');assert(s.inputState().ready);assert(images.every(x=>x.destroys===1));s.onMenuOk();assert.equal(h.counts.pop,1);s.terminate();
});
test('compiled Scene flashes two public damage targets together while HP keeps its full second and input gate',async()=>{
 let time=0;const h=await host({display:true,now:()=>time}).ready(),s=h.scene,before=JSON.stringify(h.session.party);
 s.pushMessages([{kind:'events',events:[{type:'-sethp',args:['p1a: P','50/100','p2a: F','25/100']}]}]);s.update();time=75;s.update();
 const bodies=h.counts.sprites.filter(x=>x._psPictureRole==='body'),shadows=h.counts.sprites.filter(x=>x._psPictureRole==='shadow');assert.equal(bodies.length,2);assert(bodies.every(x=>x.opacity===0&&!x.visible));assert(shadows.every(x=>x.opacity===255&&x.visible));const ordinal=s._pictureUpdate;
 for(let i=0;i<4;i++)s.updateQueue();assert.equal(s._pictureUpdate,ordinal);assert(bodies.every(x=>x.opacity===0));time=150;s.update();assert(bodies.every(x=>x.opacity===255&&x.visible));
 time=600;s.update();s.update();assert.equal(s.pictureState().runningGroups,0);assert(!s.inputState().ready);assert(s.presentationState().cards.find(x=>x.id==='P').hp>50);
 time=1000;s.update();drainScene(s);assert(s.inputState().ready);assert.equal(s.presentationState().cards.find(x=>x.id==='P').hp,50);assert.equal(s.presentationState().cards.find(x=>x.id==='F').hp,25);assert.equal(h.counts.choose,0);assert.equal(JSON.stringify(h.session.party),before);s.terminate();
});
test('compiled HP0 retains its image for the later faint while damage still owes its completion observation',async()=>{
 let time=0;const h=await host({display:true,now:()=>time}).ready(),s=h.scene,body=h.counts.sprites.find(x=>x._psPictureKey==='p1:P'&&x._psPictureRole==='body');
 s.pushMessages([{kind:'events',events:[{type:'-damage',args:['p1a: P','0 fnt']}]}]);s.update();time=9000;s.update();assert.equal(body.destroys,0);assert.equal(body.opacity,255);assert.equal(s.pictureState().runningGroups,1);const count=h.counts.sprites.length;
 for(let i=0;i<5;i++)s.updateQueue();assert.equal(s.pictureState().runningGroups,1);assert(!s.inputState().ready);assert.equal(h.counts.sprites.length,count);s.update();assert.equal(s.pictureState().runningGroups,0);drainScene(s);assert(s.inputState().ready);s.terminate();assert.equal(body.destroys,1);
});
test('compiled faint preserves HP0 portrait, fades its own box in parallel, and waits for the next actual update',async()=>{
 let time=0;const h=await host({display:true,now:()=>time}).ready(),s=h.scene,before=JSON.stringify(h.session.party),body=h.counts.sprites.find(x=>x._psPictureKey==='p1:P'&&x._psPictureRole==='body'),shadow=h.counts.sprites.find(x=>x._psPictureKey==='p1:P'&&x._psPictureRole==='shadow');
 s.pushMessages([{kind:'events',events:[{type:'faint',args:['p1a: P']}]}]);s.update();assert(h.counts.faintAudioPaths.some(file=>file.includes('Pidgey_faint')));assert.equal(body.destroys,0);assert.equal(body.opacity,255);assert(!s.inputState().ready);
 time=125;s.update();assert.equal(s.presentationState().cards.find(x=>x.id==='P').boxOpacity,.5);assert.equal(body.opacity,255);
 time=250;s.update();assert.equal(s.presentationState().cards.find(x=>x.id==='P').boxOpacity,0);assert.equal(body.destroys,0);assert.equal(shadow.opacity,255);
 time=600;s.update();assert.equal(shadow.opacity,0);assert.equal(body.opacity,255);const y=body.y;
 time=850;s.update();assert.equal(body.y,y+40);assert.equal(body.opacity,128);time=1100;s.update();assert.equal(body.opacity,0);assert.equal(body.destroys,0);assert.equal(s.pictureState().runningGroups,1);
 const epoch=s._pictureUpdate;for(let i=0;i<3;i++)s.updateQueue();assert.equal(s._pictureUpdate,epoch);assert.equal(body.destroys,0);assert(!s.inputState().ready);
 s.update();assert.equal(body.destroys,1);assert.equal(shadow.destroys,1);drainScene(s);assert(s.inputState().ready);assert.equal(s.presentationState().cards.find(x=>x.id==='P').portraitVisible,false);assert.equal(JSON.stringify(h.session.party),before);
 assert.equal(s.presentationState().audio.length,0,'faint requests must not pollute the accepted EXP cue list');
 assert.deepEqual(Array.from(s.presentationState().faintAudio,row=>row.kind),['faint-cry','faint-effect']);
 s.terminate();assert.equal(body.destroys,1);
});
for(const variant of [{name:'natural',reverse:false,prelude:false,fast:true},{name:'reversed-with-prefix',reverse:true,prelude:true,fast:true},{name:'paced-prefix',reverse:false,prelude:true,fast:false}])test(`real Session opening ${variant.name} keeps each queued first portrait hidden until its own send-out`,async()=>{
 const {BattleSession}=require(path.join(ROOT,'js/engine/game/session.cjs')),F=require(path.join(ROOT,'experiments/step2/s3/fixtures.cjs'));
 const saved=F.makeGame();saved.party=saved.party.slice(0,2);const foe=F.foeMember('F-1','Snorlax',50);foe.moves=[{id:'splash',pp:40,maxpp:40}];
 const session=await BattleSession.create({game:saved,battleId:'r5-opening-'+variant.name,content:F.content,seed:[1,2,3,4],foe:{kind:'trainer',team:[foe]}});
 const state=JSON.stringify(session.gw.snapshot()),take=session.take.bind(session);let takes=0;
 session.take=()=>{takes++;return take().map(message=>{
  if(!variant.reverse||message.kind!=='events')return message;
  // Explicit public presentation-order control; domain state and seed stay fixed.
  const positions=message.events.map((e,i)=>e.type==='switch'?i:-1).filter(i=>i>=0),values=positions.map(i=>message.events[i]).reverse(),events=[...message.events];
  positions.forEach((position,i)=>events[position]=values[i]);return {...message,events};
 });};
 let now=0;const h=host({display:true,now:()=>now}),s=h.scene;h.flow.fast=variant.fast;h.flow.begin=()=>Promise.resolve(session);h.flow._op.session=session;
 const started=new Map(),middle=new Set(),targets=['p1:A-0001','p2:F-1'];
 try{
  s.create();await flush();assert(s.isReady());
  const push=s.pushMessages;if(variant.prelude)s.pushMessages=function(messages){this._controller.enqueue(['Opening prefix']);return push.call(this,messages);};
  s.start();s.pushMessages=push;
  const step=s._pictures.step.bind(s._pictures);s._pictures.step=function(kind,member){if(kind==='send-out')started.set(member.side+':'+member.id,s._pictureUpdate);return step(kind,member);};
  for(let i=0;i<400&&!s.inputState().ready;i++){
   now+=1000/60;s.update();
   for(const sprite of h.counts.sprites.filter(x=>x._psPictureRole&&!x.destroyed&&targets.includes(x._psPictureKey))){
    const start=started.get(sprite._psPictureKey);
    if(start===undefined||s._pictureUpdate<start)assert(!sprite.parent||!sprite.visible||sprite.scale.x===0,'queued portrait painted before its public send-out: '+sprite._psPictureKey);
    if(sprite._psPictureRole==='body'&&sprite.parent&&sprite.visible&&sprite.scale.x>0&&sprite.scale.x<1)middle.add(sprite._psPictureKey);
   }
  }
  assert(s.inputState().ready,'opening drained');assert.equal(takes,1,'consume published opening exactly once');assert.deepEqual([...middle].sort(),targets.slice().sort(),'both actual send-outs have intermediate poses');
  for(const key of targets){const bodies=h.counts.sprites.filter(x=>x._psPictureKey===key&&!x.destroyed);assert.equal(bodies.length,2);assert(bodies.every(x=>x.parent&&x.visible&&x.scale.x===1&&x.opacity===255));}
  assert.equal(JSON.stringify(session.gw.snapshot()),state,'presentation never changes domain active state or consumes engine RNG');
 }finally{s.terminate();}
});
test('an established display without queued opening switches still shows its current portraits',async()=>{
 const h=await host({display:true}).ready();try{const images=h.counts.sprites.filter(x=>x._psPictureRole&&!x.destroyed);assert.equal(images.length,4);assert(images.every(x=>x.parent&&x.visible&&x.scale.x===1&&x.opacity===255));}finally{h.scene.terminate();}
});
test('compiled abort cancels both damage pictures and their late composite work cannot change a successor',async()=>{
 let time=0;const h=await host({display:true,now:()=>time}).ready(),old=h.scene;old.pushMessages([{kind:'events',events:[{type:'-sethp',args:['p1a: P','50/100','p2a: F','25/100']}]}]);old.update();time=75;old.update();const late=old._queue[0],images=h.counts.sprites.filter(x=>x._psPictureRole);
 h.flow.abort(Error('damage cancel'));old.update();assert(images.every(x=>x.destroys===1));assert.equal(old.pictureState().runningGroups,0);const snapshot=JSON.stringify(old.pictureState());h.G.SceneManager._scene={successor:true};assert(late.advance(9000));late.cancel();old.updateQueue();old.terminate();assert.equal(JSON.stringify(old.pictureState()),snapshot);assert(images.every(x=>x.destroys===1));assert.equal(h.counts.abort,1);
});
test('compiled forced drag resets only when its sequential public projection is shown',async()=>{
 const h=await projectionMenuHost(),s=h.scene;s.pushMessages([sendOut('p1','Q','drag'),sendOut('p1','P','drag')]);
 assert.equal(s._menuCursor.index('main',4),2);assert.equal(s._menuCursor.index('moves',4),3);
 // The old actor first finishes its owned recall. Cursor reset still occurs at the first actual public projection of Q.
 for(let i=0;i<30&&s.presentationState().cards.find(c=>c.side==='p1'&&c.active).id!=='Q';i++){advanceSceneClock.get(s)(50);s.update();}
 assert.equal(s.presentationState().cards.find(c=>c.side==='p1'&&c.active).id,'Q');assert.equal(s._menuCursor.index('main',4),0);assert.equal(s._menuCursor.index('moves',4),0);
 drainScene(s);assert.equal(s._menu.index(),0);s.onMenuOk();assert.equal(s._menu.index(),0);s.terminate();
});
test('opponent switch and drag preserve both player menu memories',async()=>{
 const h=await projectionMenuHost(),s=h.scene;s.pushMessages([sendOut('p2','G'),sendOut('p2','F','drag')]);drainScene(s);
 assert.equal(s._menu.index(),2);s._menu.select(0);s.onMenuOk();assert.equal(s._menu.index(),3);s.terminate();
});
test('same-member status repaint preserves separate command and move memories',async()=>{
 const h=await projectionMenuHost(),s=h.scene;s.pushMessages([{kind:'events',events:[{type:'-status',args:['p1a: P','par']},{type:'-curestatus',args:['p1a: P','par']}]}]);drainScene(s);
 assert.equal(s._menu.index(),2);s._menu.select(0);s.onMenuOk();assert.equal(s._menu.index(),3);s.terminate();
});
test('late old send-out visual and message callbacks cannot reset successor Scene memories',async()=>{
 const h=await projectionMenuHost(),old=h.scene;old.pushMessages([sendOut('p1','Q','drag')]);const late=old._queue[0];
 h.flow.stateReplaced();h.flow._op={request:{battleId:'new-menu-owner',canLose:true},session:h.session};h.flow.request=h.flow._op.request;h.flow.running=true;
 const s=new h.G.Scene_PSBattle();h.G.SceneManager._scene=s;s.create();await flush();assert(s.isReady());s.start();drainScene(s);await rememberBoth(s);
 late.advance(performance.now());old.pushMessages([sendOut('p1','Q','drag')]);old.updateQueue();old.terminate();
 assert.equal(s._menuCursor.index('main',4),2);assert.equal(s._menuCursor.index('moves',4),3);assert.equal(s.presentationState().cards.find(c=>c.side==='p1'&&c.active).id,'P');assert(s.inputState().ready);s.terminate();
});
test('compiled author commands pass image/transition choices separately from application battle requests',()=>{
 const h=host(),calls=[];h.flow.running=false;h.flow.nextSeq=()=>9;h.app.trainerRecord=()=>({});h.flow.tryOpenBattle=(request,presentation)=>{calls.push({request,presentation});return true;};
 const interpreter={setWaitMode(mode){assert.equal(mode,'psBattle');}};
 for(const name of ['StartBattle','StartTrainerBattle'])for(const prebattleLocation of [undefined,'','3'])h.commands[name].call(interpreter,{trainerId:'trainer',version:'1',battleBackground:'woods',battlePlatform:'water',battleTime:'2',prebattleLocation});
 assert.equal(calls.length,6);calls.forEach((c,index)=>{assert.deepEqual(JSON.parse(JSON.stringify(c.presentation)),{background:'woods',platform:'water',time:'2',transition:index%3===2?{location:'3'}:{}});assert(!('visualContext'in c.request));assert(!('background'in c.request));assert(!('transition'in c.request));assert(!('prebattleLocation'in c.request));});
});
test('compiled openBattle freezes only host presentation while preserving the original request object',()=>{
 const h=host(),request={battleId:'visual-context'},visual={background:'woods',platform:'water',time:2};h.flow.running=false;h.flow._op=null;h.G.$gameSystem._psSaveError='controlled test skips unrelated domain eligibility';h.flow.openBattle(request,visual);
 assert.equal(h.flow._op.request,request);assert(Object.isFrozen(h.flow._op.visualContext));visual.background='changed';assert.equal(h.flow._op.visualContext.background,'woods');assert(!('visualContext'in request));h.flow.stateReplaced();
});

function pendingBackdropHost(options={}){
 const h=host({display:true,...options}),images=[];
 h.flow._op.visualContext=Object.freeze({background:backdropPrefix,platform:'stone',time:0});
 h.G.Image=class{constructor(){images.push(this);this.naturalWidth=0;this.naturalHeight=0;this.onload=null;this.onerror=null;}set src(value){this._src=value;}get src(){return this._src;}};
 return{...h,images,decode(index){const image=images[index];image.naturalWidth=4;image.naturalHeight=4;assert.equal(typeof image.onload,'function');image.onload();}};
}
test('compiled Scene is not ready while any real local backdrop decision is pending',async()=>{
 const h=pendingBackdropHost(),s=h.scene;
 try{
  s.create();await flush();assert.equal(s.isReady(),false);assert.equal(h.images.length,4);
  for(let i=0;i<3;i++)assert.equal(s.isReady(),false);
  assert.equal(h.counts.choose,0);assert.equal(s._menu.active,false);
  for(const index of [2,0,3]){h.decode(index);assert.equal(s.isReady(),false,'the remaining role must still hold readiness');}
  h.decode(1);assert.equal(s.isReady(),true);assert.equal(s.battlebackState().rows.filter(x=>x.status==='ready').length,4);
  s.start();drainScene(s);assert(s.inputState().ready);assert.equal(h.counts.choose,0);
 }finally{s.terminate();}
});
test('compiled Scene decode errors remain gated until every other role has a declared outcome',async()=>{
 const h=pendingBackdropHost(),s=h.scene;
 try{
  s.create();await flush();assert.equal(s.isReady(),false);h.images[0].onerror();assert.equal(s.isReady(),false);
  h.decode(1);h.decode(3);assert.equal(s.isReady(),false);h.images[2].onerror();assert.equal(s.isReady(),true);
  const rows=s.battlebackState().rows;assert.equal(rows.filter(x=>x.status==='fallback'&&x.reason==='load-error').length,2);assert.equal(rows.filter(x=>x.status==='ready').length,2);
 }finally{s.terminate();}
});
test('compiled Scene holds pending decode at 4999ms and uses explicit timeout at 5000ms',async()=>{
 let time=0;const h=pendingBackdropHost({now:()=>time}),s=h.scene;
 try{
  s.create();await flush();assert.equal(s.isReady(),false);time=4999;assert.equal(s.isReady(),false);
  time=5000;assert.equal(s.isReady(),true);assert(s.battlebackState().rows.every(x=>x.status==='fallback'&&x.reason==='timeout'));
  assert(h.images.every(x=>x.onload===null&&x.onerror===null));s.start();drainScene(s);assert(s.inputState().ready);
 }finally{s.terminate();}
});
test('compiled Scene terminate during decode prevents late listeners allocating or painting a successor',async()=>{
 const h=pendingBackdropHost(),s=h.scene;let allocations=0;const Base=h.G.Bitmap;h.G.Bitmap=class extends Base{constructor(...args){super(...args);allocations++;}};
 try{
  s.create();await flush();assert.equal(s.isReady(),false);const late=h.images.map(image=>image.onload);s.terminate();const before=allocations,paint=JSON.stringify(h.counts.paint);
  h.G.SceneManager._scene={successor:true};for(let i=0;i<late.length;i++){h.images[i].naturalWidth=4;h.images[i].naturalHeight=4;assert.equal(h.images[i].onload,null);late[i]();}
  assert.equal(allocations,before);assert.equal(JSON.stringify(h.counts.paint),paint);assert.equal(s.battlebackState().ownedAssets,0);assert(s.battlebackState().retired);
 }finally{s.terminate();}
});
