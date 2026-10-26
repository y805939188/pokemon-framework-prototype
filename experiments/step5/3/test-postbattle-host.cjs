'use strict';
// Actual built adapter + actual GameApplication in a small Node VM host, following the existing step4 host contract.
// This is host-lifecycle automation, not a real MZ/NW or physical-input claim.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const{world,E,clone}=require('./fixtures/postbattle/helpers.cjs'),ROOT=path.resolve(__dirname,'../../..');
let plugin='',dir;
test.before(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'ps53-postbattle-host-'));const built=spawnSync('pnpm',['--dir','src','exec','vite','build','--outDir',dir],{cwd:ROOT,env:{...process.env,RR_PLUGIN:'PS_BattleFlow'},encoding:'utf8'});assert.equal(built.status,0,built.stdout+built.stderr);plugin=fs.readFileSync(path.join(dir,'PS_BattleFlow.js'),'utf8');});
test.after(()=>{if(dir)fs.rmSync(dir,{recursive:true,force:true});});
function host(w,session){
 const ctor=()=>{function C(){}C.prototype={initialize(){},terminate(){}};return C;};
 function System(){this._saveEnabled=true;}System.prototype.isSaveEnabled=function(){return this._saveEnabled;};
 const sys=new System();sys._psGame=w.state.current();const errors=[];
 const req=p=>{if(p==='path'||p==='fs')return require(p);if(/engine\.cjs$/.test(p))return E;if(/fixtures\/game\.cjs$/.test(p))return require(path.join(ROOT,'js/engine/fixtures/game.cjs'));if(/game\/describe\.cjs$/.test(p))return require(path.join(ROOT,'js/engine/game/describe.cjs'));throw Error('unexpected require '+p);};req.resolve=p=>path.resolve(ROOT,p);
 const G={Error,performance,require:req,console:{log(){},warn(){},error:(...args)=>errors.push(args.map(String).join(' '))},PluginManager:{parameters:()=>({}),registerCommand(){}},Game_Interpreter:ctor(),Window_Base:ctor(),Window_Command:ctor(),Scene_MenuBase:ctor(),Game_System:System,SceneManager:{push(){},isSceneChanging:()=>false},Graphics:{frameCount:0},Utils:{extractFileName:x=>x},$gameSystem:sys,$gameVariables:{setValue(){},value:()=>0},$gameMap:{mapId:()=>5,isEventRunning:()=>false},$gamePlayer:{reserveTransfer(){}},$dataMapInfos:[], $dataCommonEvents:[],$gameMessage:{isBusy:()=>false,add(){}}};G.window=G;vm.createContext(G);vm.runInContext(plugin,G,{filename:'PS_BattleFlow.js (built)'});
 const flow=G.PSFlow;flow._app=w.app;flow._content=w.content;flow._op={request:w.request,session};flow.running=true;
 const waiter=new G.Game_Interpreter();waiter._waitMode='psBattle';return{flow,waiter,sys,errors};
}
test('host pending close cannot release a continuation; presentation abort technically terminates with primary intact',async()=>{
 const w=world(),h=await w.app.startBattle(w.request),hosted=host(w,h),out=hosted.flow.finish(h,hosted.flow._op);assert(out.pending);const before=clone(w.state.current());assert(hosted.waiter.updateWaitMode());hosted.flow.close(out.code,hosted.flow._op);assert(hosted.flow.running);assert(hosted.waiter.updateWaitMode());
 hosted.flow.abort(Error('synthetic failed presentation'),hosted.flow._op);assert.equal(w.app.pendingEvolution,null);assert.equal(w.app.saveBlocked,false);assert.equal(hosted.flow.running,false);assert.equal(hosted.waiter.updateWaitMode(),false);assert.equal(hosted.flow.lastOutcome.commit,'applied');assert(hosted.flow.lastOutcome.hostErrors.some(e=>e.step==='after-commit'));assert.deepEqual(w.state.current(),before);assert.equal(w.state.replaced.length,1);assert.equal(w.state.current().stats.evolutions_cancelled,0);assert(hosted.sys.isSaveEnabled());
});
test('host abort during learning preserves committed species and abandons only remaining lessons',async()=>{
 const w=world({targetMoves:['Tackle','Gust']}),h=await w.app.startBattle(w.request),hosted=host(w,h);hosted.flow.finish(h,hosted.flow._op);let p=w.app.pendingEvolution;hosted.flow.resolveEvolution(p.token,p.revision,{kind:'complete'});assert.equal(w.app.pendingEvolution.phase,'learning');const before=clone(w.state.current());
 hosted.flow.abort(Error('synthetic learning presentation failure'),hosted.flow._op);assert.deepEqual(w.state.current(),before);assert.equal(w.state.current().party[0].species,'Blastoise');assert.equal(w.state.current().stats.evolution_count,1);assert.equal(w.state.replaced.length,2);assert.equal(w.app.saveBlocked,false);assert.equal(hosted.flow.running,false);assert.equal(hosted.waiter.updateWaitMode(),false);assert.equal(hosted.flow.lastOutcome.commit,'applied');assert(hosted.flow.lastOutcome.hostErrors.length);
});
test('host indeterminate installed progress keeps root wait/save owner instead of pretending termination succeeded',async()=>{
 let partial=false;const w=world({port:state=>({read:()=>state.read(),replace:next=>{if(partial){const bad=clone(state.current());bad.money++;state.replace(bad);throw Error('synthetic partial write');}state.replace(next);}})}),h=await w.app.startBattle(w.request),hosted=host(w,h);hosted.flow.finish(h,hosted.flow._op);const primary=clone(w.state.current());partial=true;let p=w.app.pendingEvolution;hosted.flow.resolveEvolution(p.token,p.revision,{kind:'complete'});assert(w.app.pendingEvolution.reloadRequired);const writes=w.state.replaced.length;
 hosted.flow.abort(Error('synthetic abort with unproved state'),hosted.flow._op);assert(hosted.flow.running);assert(hosted.waiter.updateWaitMode());assert(w.app.saveBlocked);assert.equal(hosted.sys.isSaveEnabled(),false);assert(w.app.pendingEvolution);assert.equal(w.state.replaced.length,writes);assert(hosted.flow.lastOutcome.hostErrors.some(e=>e.step==='continuation-termination'));hosted.flow.close(0,hosted.flow._op);assert(hosted.flow.running);
 w.state.replace(primary);hosted.flow.stateReplaced();assert.equal(w.app.pendingEvolution,null);assert.equal(hosted.flow.running,false);assert.equal(hosted.waiter.updateWaitMode(),false);assert.equal(w.app.saveBlocked,false);
});
