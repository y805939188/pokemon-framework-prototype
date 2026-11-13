'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {fixture,acquireReady,E,clone,runtime,capabilities,currentCommit}=require('./support.cjs'),plan=require('./host-plan.json');
const current=require('../capture-run-current-headless-runtime.json');assert.equal(Object.keys(current.pluginBundles).length,4);
const currentFiles={...plan.files,...current.pluginBundles};
for(const [name,expected]of Object.entries(currentFiles))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(runtime,name))).digest('hex'),expected,name);
const {createVictoryDriverHost}=require(path.join(runtime,'experiments/step5/4/victory-music-driver-host.cjs'));
const {assertTakeConserved}=require('./take-conservation-oracle.cjs');
const basePlan=require(path.join(runtime,'experiments/step5/4/victory-music-native-plan.json'));
const plugins=Object.fromEntries(['PS_BattleFlow','PS_SaveState','PS_Evolution'].map(n=>[n,fs.readFileSync(path.join(runtime,'js/plugins',n+'.js'),'utf8')]));
const entryText=fs.readFileSync(path.join(runtime,'js/plugins/PS_BattleFlowTest.js'),'utf8');
async function host(source){
 const seed=fixture(source),work=fs.mkdtempSync(path.join(os.tmpdir(),'pf-h3-compiled-host-'));
 const PLAN={...basePlan,productCommit:currentCommit,productPlugins:Object.fromEntries(Object.keys(plugins).map(n=>[n,currentFiles['js/plugins/'+n+'.js']]))};
 const h=createVictoryDriverHost({ROOT:runtime,work,plugins,entryText,driverText:'H3_SYNTHETIC_CONTROL_NOT_NATIVE',PLAN,options:{productionTranslator:true}});
 const flow=h.w.flow,G=h.G;flow.stateReplaced();flow._app=null;flow._content=seed.content;flow._dex=seed.dex;flow.seed=[1,2,3,4];flow.rng=()=>0;flow.fast=true;flow.receiveOptions={mode:1,naming:1};flow.developerCapabilities={};
 let current=clone(seed.state.read());const replaced=[];
 Object.defineProperty(G.$gameSystem,'_psGame',{configurable:true,enumerable:true,get:()=>current,set:next=>{current=next;replaced.push(clone(next));}});
 const state={read:()=>current,current:()=>current,replaced};const app=flow.app();await h.p.toMapId(5);
 const w={app,state,source,content:seed.content,dex:seed.dex};await acquireReady(w);
 return {...h,flow,w,work,commands:h.w.commands};
}
function start(h,label){const interpreter={setWaitMode(mode){this.mode=mode;}};h.commands['PS_BattleFlow:StartTrainerBattle'].call(interpreter,{trainerId:'h3-npc',version:'1',battleId:label,canLose:'true',expGain:'false',moneyGain:'false'});return interpreter;}
async function action(h,slot){const s=h.p.battle();let observed;s.act(async()=>{observed=await s._session.chooseMove(slot);return observed;},'move');await h.waitFor(()=>!s._busy,'Scene actual action completion');await h.frames(2);assert(observed?.ok,'actual Scene command succeeded');return observed;}
function consumed(result){const rows=result.messages.flatMap(m=>m.kind==='events'?m.events:[]).filter(e=>e.type==='-enditem'&&e.args[1]==='Lum Berry');assert.equal(rows.length,1,'one actual Lum Berry consumption before finish or abort');}
for(const source of plan.sources)test('H3 compiled formal host '+source+' -> Scene consumption -> terminal owner commit',async()=>{
 const h=await host(source),{flow,w,G}=h,before=clone(flow.game()),writes=w.state.replaced.length;
 try{
 const interpreter=start(h,'H3-HOST-'+source);assert.equal(interpreter.mode,'psBattle');assert.equal(flow.running,true);await h.p.inMode('main');
 const scene=h.p.battle(),session=scene._session;assert(session);assert.equal(session.party[0].item,'lumberry');assert.equal(G.$gameSystem.isSaveEnabled(),false);assert.deepEqual(flow.game(),before);
 await action(h,1);await h.p.inMode('main');assert(session.gw.readState('p1')[0].hp<before.party[0].hp);
 consumed(await action(h,2));await h.p.inMode('main');assert.equal(session.gw.readState('p1')[0].status,'');assert.deepEqual(flow.game(),before);assert.equal(w.state.replaced.length,writes);
 await action(h,3);await h.p.inMode('end');assert(session.finished);assert.deepEqual(flow.game(),before);assert.equal(w.state.replaced.length,writes);
 for(let i=0;i<20&&flow.running;i++){scene.onEnd();await h.frames(2);}
 assert.equal(flow.running,false);assert.equal(flow.lastOutcome.commit,'applied',JSON.stringify(flow.lastOutcome));assert.equal(w.state.replaced.length,writes+1);assert.equal(flow.game().party[0].item,'');assert.equal(G.$gameSystem.isSaveEnabled(),true);
 const installed=clone(flow.game()),raw=session.result();assert.equal(installed.appliedBattles[raw.battleId].hash,E.state.resultHash(raw));assert.match(installed.appliedBattles[raw.battleId].settlement.pairHash,/^[a-f0-9]{64}$/);
 assert.equal(installed.stats.trainer_battles_won,before.stats.trainer_battles_won+1);assert.equal(installed.dex.defeatedCounts.pidgey,(before.dex.defeatedCounts.pidgey??0)+1);
 assert.equal(flow.commit(raw),'already-applied');assert.deepEqual(flow.game(),installed);assert.equal(w.state.replaced.length,writes+1);
 console.log('H3_COMPILED_HOST '+JSON.stringify({source,work:h.work,kind:plan.scope,battleId:raw.battleId,writes:1,sceneEnded:!flow.running,initialItem:'lumberry',finalItem:installed.party[0].item,NW:0}));
 }finally{if(flow.running)flow.abort(Error('owned H3 host cleanup'));}
});
test('H3 compiled normal host enters held battle without developer overrides',async()=>{
 const h=await host('give'),before=clone(h.flow.game()),writes=h.w.state.replaced.length;
 assert.deepEqual(h.flow.developerCapabilities,{});try{start(h,'H3-HOST-RELEASED');await h.p.inMode('main');assert(h.flow.running);assert.equal(h.p.battle()._session.party[0].item,'lumberry');assert.deepEqual(h.flow.game(),before);assert.equal(h.w.state.replaced.length,writes);}finally{if(h.flow.running)h.flow.abort(Error('owned normal entry cleanup'));}
});
test('H3 compiled Scene abort retires consumed working item without persistent changes',async()=>{
 const h=await host('give'),before=clone(h.flow.game()),writes=h.w.state.replaced.length;
 try{start(h,'H3-HOST-ABORT');await h.p.inMode('main');const session=h.p.battle()._session;await action(h,1);await h.p.inMode('main');consumed(await action(h,2));await h.p.inMode('main');h.flow.abort(Error('owned H3 abort after consumption'));await h.frames(2);assert.deepEqual(h.flow.game(),before);assert.equal(h.w.state.replaced.length,writes);assert.equal(h.flow.running,false);assert.equal(h.G.$gameSystem.isSaveEnabled(),true);assert.equal(h.flow.lastOutcome.commit,'none');}
 finally{if(h.flow.running)h.flow.abort(Error('owned H3 cleanup'));}
});

for(const injection of ['plugin-parameters','saved-host-fields'])test('H3 normal host does not derive production policy from '+injection,async()=>{
 const h=await host('give'),before=clone(h.flow.game()),writes=h.w.state.replaced.length;
 h.flow.developerCapabilities={};h.flow._app=null;
 if(injection==='plugin-parameters'){const parameters=h.G.PluginManager.parameters;h.G.PluginManager.parameters=name=>({...parameters(name),allowHeldItemSources:'true',allowExperimentalHeldItemBattle:'true',developerCapabilities:JSON.stringify(capabilities)});}
 else {h.G.$gameSystem.developerCapabilities={...capabilities};h.G.$gameSystem._psDeveloperCapabilities={...capabilities};}
 try{start(h,'H3-POLICY-RELEASED');await h.p.inMode('main');assert(h.flow.running);assert.deepEqual(h.flow.game(),before);assert.equal(h.w.state.replaced.length,writes);}finally{if(h.flow.running)h.flow.abort(Error('owned policy injection cleanup'));}
});
test('H3 normal released policy permits taking old held item then an all-empty required battle',async()=>{
 const h=await host('give'),flow=h.flow;flow.developerCapabilities={};flow._app=null;
 const takeBefore=clone(flow.game()),takeWrites=h.w.state.replaced.length;
 const app=flow.app(),token=app.beginManagement(),takeRequest={kind:'take-item',source:{id:'P1',position:{kind:'party',index:0}}};
 try{
 assert.equal(app.manage(token,'H3-SAFE-TAKE',takeRequest).status,'applied');
 assertTakeConserved(takeBefore,flow.game());assert.equal(h.w.state.replaced.length,takeWrites+1,'take installs once');
 assertTakeConserved(takeBefore,h.w.state.replaced[takeWrites]);
 const taken=clone(flow.game());
 assert.equal(app.manage(token,'H3-SAFE-TAKE',takeRequest).status,'applied');
 assert.deepEqual(flow.game(),taken,'same receipt replay is inert');assert.equal(h.w.state.replaced.length,takeWrites+1);
 assert.equal(app.manage(token,'H3-SAFE-TAKE-EMPTY',takeRequest).status,'unchanged');
 assert.deepEqual(flow.game(),taken,'fresh empty take is inert');assert.equal(h.w.state.replaced.length,takeWrites+1);
 }finally{app.endManagement(token);}
 assertTakeConserved(takeBefore,flow.game());assert.equal(h.w.state.replaced.length,takeWrites+1);
 const before=clone(flow.game()),writes=h.w.state.replaced.length;assert.equal(before.party[0].item,'');
 try{const interpreter=start(h,'H3-EMPTY-REQUIRED');assert.equal(interpreter.mode,'psBattle');await h.p.inMode('main');const scene=h.p.battle(),session=scene._session;assert(session.party.every(m=>!m.item));assert(session.foeTeam.every(m=>!m.item));await action(h,3);await h.p.inMode('end');assert.deepEqual(flow.game(),before);assert.equal(h.w.state.replaced.length,writes);
 for(let i=0;i<20&&flow.running;i++){scene.onEnd();await h.frames(2);}assert.equal(flow.lastOutcome.commit,'applied');assert.equal(h.w.state.replaced.length,writes+1);const raw=session.result();assert.match(flow.game().appliedBattles[raw.battleId].settlement.pairHash,/^[a-f0-9]{64}$/,'all-empty normal production factory still supplies required held pair');
 }finally{if(flow.running)flow.abort(Error('owned normal empty cleanup'));}
});
