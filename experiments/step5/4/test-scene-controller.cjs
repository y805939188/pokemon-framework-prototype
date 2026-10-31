'use strict';
// Real controller/compiled host code, controlled render/session ports. Native MZ evidence is separate.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..');let dir,Controller,plugin;
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
});
test.after(()=>{if(dir)fs.rmSync(dir,{recursive:true,force:true});});
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

function host({opening}={}){
 const counts={abort:0,finish:0,pop:0,hide:0,choose:0},session={party:[],foeTeam:[],bag:{},finished:false,pendingLearn:null,take:()=>[],currentRequest:()=>({active:[{moves:[{move:'Splash',id:'splash',pp:40,maxpp:40}]}]}),gw:{readState:()=>[]},chooseMove:()=>{counts.choose++;return {messages:[]};}};
 function Base(){}Base.prototype={initialize(){},create(){},start(){},update(){},terminate(){},isReady(){return true;},addWindow(){},popScene(){counts.pop++;}};
 function Window(){}Window.prototype={initialize(rect){this.innerWidth=rect.width-24;this.innerHeight=rect.height-24;this.contents={clear(){}};this._index=0;this.active=false;this.visible=false;},resetFontSettings(){},lineHeight:()=>24,textWidth:x=>String(x).length*8,drawText(){},refresh(){this._list=[];this.makeCommandList?.();},addCommand(name,symbol,enabled,ext){this._list.push({name,symbol,enabled,ext});},select(i){this._index=i;},index(){return this._index;},setHandler(){},show(){this.visible=true;},hide(){this.visible=false;counts.hide++;},activate(){this.active=true;},deactivate(){this.active=false;},isOpenAndActive(){return this.visible&&this.active;}};
 function System(){}System.prototype.isSaveEnabled=()=>true;
 const req=p=>{if(p==='path'||p==='fs')return require(p);if(p.includes('production.cjs'))return require(path.join(ROOT,'js/engine/build/production.cjs'));throw Error('unexpected require '+p);};req.resolve=p=>path.resolve(ROOT,p);
 const G={Error,performance,require:req,console:{log(){},warn(){},error(){}},PluginManager:{parameters:()=>({}),registerCommand(){}},Game_Interpreter:Base,Game_System:System,Window_Base:Window,Window_Command:Window,Scene_MenuBase:Base,SceneManager:{_scene:null,push(){},isSceneChanging:()=>false},Graphics:{boxWidth:816,boxHeight:624,frameCount:0},Rectangle:function(x,y,width,height){Object.assign(this,{x,y,width,height});},Utils:{extractFileName:x=>x},Input:{isTriggered:()=>false},SoundManager:{playBuzzer(){}},$gameSystem:new System(),$gameMessage:{isBusy:()=>false,add(){}},$gameVariables:{setValue(){}}};
 G.window=G;vm.createContext(G);vm.runInContext(plugin,G);
 const flow=G.PSFlow,app={stateGeneration:0,saveBlocked:false,pendingEvolution:null,pendingReceiving:null,pendingPokedex:null,stateReplacedByHost(){this.stateGeneration++;},finishBattle(){counts.finish++;return {code:1,commit:'applied',battleId:'scene#1'};},abortBattle(request,error){counts.abort++;return {code:0,commit:'none',battleId:request.battleId,aborted:true,error:String(error)};}};
 flow._app=app;flow._op={request:{battleId:'scene#1',canLose:true},session};flow.request=flow._op.request;flow.running=true;flow.perf.cur={battleId:'scene#1',t0:0,actions:[]};flow.begin=()=>opening??Promise.resolve(session);
 const scene=new G.Scene_PSBattle();G.SceneManager._scene=scene;
 return{G,flow,app,scene,session,counts,async ready(){scene.create();await flush();assert(scene.isReady());scene.start();scene.updateQueue();assert.equal(scene._mode,'main');return this;}};
}
test('compiled scene exposes detached semantic-ready DTO; MZ-deactivated handler can act once',async()=>{
 const h=await host().ready(),s=h.scene;const view=s.inputState();assert.equal(view.implementation,'d1-controller-v1');assert(view.ready);view.items[0].enabled=false;assert.notEqual(s._menu._items[0].enabled,false);
 s.onMenuOk();assert.equal(s._mode,'moves');s._menu.deactivate();assert(!s.inputState().ready);s.onMenuOk();s.onMenuOk();await flush();assert.equal(h.counts.choose,1);s.updateQueue();assert(s.inputState().ready);
});
for(const result of ['resolve','reject'])test(`compiled scene ignores ${result} after load/new owner, including perf and global pop`,async()=>{
 const h=await host().ready(),d=deferred(),s=h.scene;s.act(()=>d.promise,'move');await flush();
 h.flow.stateReplaced();const successor={request:{battleId:'successor'},session:{}};h.flow._op=successor;h.flow.running=true;h.flow.perf.cur={battleId:'successor',actions:[]};const nextScene={};h.G.SceneManager._scene=nextScene;
 const hides=h.counts.hide;d[result](result==='resolve'?{messages:[]}:Error('late'));await flush();s.terminate();s.onEnd();assert.equal(h.flow._op,successor);assert(h.flow.running);assert.equal(h.counts.pop,0);assert.equal(h.counts.abort,0);assert.equal(h.counts.hide,hides);assert.equal(h.flow.perf.cur.actions.length,0);assert.equal(h.G.SceneManager._scene,nextScene);
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
test('compiled cancel navigation preserves bag/party intent and is blocked while action is pending',async()=>{
 const h=await host().ready(),s=h.scene,d=deferred();s.showMoves();s.onMenuCancel();assert.equal(s._mode,'main');s.showBag();s.onMenuCancel();assert.equal(s._mode,'main');s._pendingItem='potion';s.show('party',[]);s.onMenuCancel();assert.equal(s._pendingItem,null);assert.equal(s._mode,'bag');s.onMenuCancel();s.act(()=>d.promise);await flush();const phase=s._mode;s.onMenuCancel();assert.equal(s._mode,phase);assert(s._busy);d.resolve({messages:[]});await flush();s.updateQueue();assert.equal(s._mode,'main');
});
test('compiled postcommit message failure preserves committed outcome and never aborts application state',async()=>{
 const h=await host().ready();h.session.finished=true;h.scene.showEnd(false);h.app.finishBattle=()=>{h.counts.finish++;return {code:1,commit:'applied',battleId:'scene#1',trainerReward:{actual:10,normalizationLoss:0}};};h.G.$gameMessage.add=()=>{throw Error('message after commit');};h.scene.onMenuOk();assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(h.flow.lastOutcome.code,1);assert.equal(h.counts.abort,0);assert.equal(h.counts.finish,1);assert.equal(h.flow.lastOutcome.hostErrors[0].step,'trainer-reward-message');assert.equal(h.counts.pop,1);assert(!h.flow.running);
});
