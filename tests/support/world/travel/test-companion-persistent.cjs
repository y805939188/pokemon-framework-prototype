'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,flush}=require('./companion-fixture.cjs');
const scope=path.resolve(process.env.PF_CASE_ROOT);assert(scope.startsWith(path.resolve(process.env.PF_FINAL_PRODUCTION_RUN)+path.sep));
const clone=x=>structuredClone(x),ids=h=>h.state().world.companions.map(c=>c.originEventId);
test('persistent partial remove: actual committed domain, real successor, one exhausted automatic repair',async()=>{
 let h,receipt,successor,realConnection,ports,rng,armed=false,throws=0,firstKey,firstGame,firstGeneration;
 const projects=[],preparations=[],trace=[],bindings=[];
 const event=(name,data={})=>trace.push({sequence:trace.length+1,name,...data});
 const view=()=>({generation:h.app.stateGeneration,records:clone(h.records()),repair:clone(h.service.projectionRepair),nativeCount:h.visual.parent.children.filter(s=>!s.destroyed).length,authorVisible:h.G.$gamePlayer.followers()._visible,effectiveVisible:h.G.$gamePlayer.followers().isVisible(),saveBlocked:h.app.saveBlocked,encounterBlocked:h.app.encounterBlocked,flowNativePending:h.G.PSFlow.companionNativePending(),worldPending:h.G.PSWorld.pending(),channelCount:h.channelCount,mapFrames:h.mapFrames,saves:h.saves.length});
 try{
  h=await fixture({observePorts(p){ports=p;},connected(c){realConnection=c.connection;},afterPrepare({intent,result}){preparations.push({kind:intent.kind,status:result.status});},beforeProject({h:actual,visual,prepared,binding}){
   const repair=clone(realConnection.service.projectionRepair),key=`${repair.generation}:${repair.revision}`;
   projects.push({kind:prepared.action.kind,key,repair,bindingCurrent:binding.isOperationCurrent(binding.owner,binding.generation),records:ids(actual),nativeCount:visual.parent.children.filter(s=>!s.destroyed).length});
   if(!armed)return;
   assert(['remove','recover'].includes(prepared.action.kind));assert.strictEqual(actual.app,h.app);assert.strictEqual(h.G.PSFlow._app,h.app);assert.equal(h.app.stateGeneration,firstGeneration);assert.deepEqual(ids(h),[2]);assert.equal(binding.isOperationCurrent(binding.owner,binding.generation),true);bindings.push(binding);
   if(throws===0){
    assert.equal(prepared.action.kind,'remove');assert.notStrictEqual(h.state(),firstGame);assert.equal(visual.parent.children.length,2,'fault follows real domain commit while old native projection still exists');firstKey=key;
    new h.G.Game_Interpreter().command216([1]);assert.equal(h.G.$gamePlayer.followers()._visible,false);
    const cancelled=h.app.cancelEventCompanion(receipt.handle);assert.equal(cancelled.status,'cancelled');successor=h.app.beginManagement();assert.equal(typeof successor,'string');assert.doesNotThrow(()=>h.app.managementSnapshot(successor));
    event('postcommit-original-project-fault-with-real-cancel-successor',{key,repair,cancelled,...view()});
   }else{
    assert.equal(prepared.action.kind,'recover');assert.equal(key,firstKey,'real generation/revision unchanged, no manufactured retry key');assert.equal(repair.attempts,1);event('automatic-repair-persistent-fault',{key,repair,...view()});
   }
   throws++;throw Error('CONTROLLED_PERSISTENT_POSTCOMMIT_PROJECT_FAILURE_'+throws);
  }});
  assert.strictEqual(realConnection.application,h.app);assert.strictEqual(realConnection.service,h.service);assert.equal(h.channelCount,1);
  rng=require('../travel-host/rng-observer.cjs').install(h.G,process.env.PF_E3_JOINT_OUT);
  for(const eventId of [1,2]){const r=h.app.beginEventCompanion({kind:'register',eventId,name:'buddy'+eventId});assert.equal((await h.settle(r.result)).status,'completed');}
  assert.deepEqual(ids(h),[1,2]);assert.equal(h.visual.parent.children.length,2);
  const stateBefore=clone(h.state()),prepareBase=preparations.length,projectBase=projects.length,saveBase=h.saves.length,draws=h.draws.slice(),nativeDraws=h.nativeDraws.slice();
  const identity={map:h.G.$gameMap,data:h.G.$dataMap,scene:h.G.SceneManager._scene,player:h.G.$gamePlayer,content:h.content,source:ports.worldTravel.nativeLeaseSource,controller:h.controller};
  firstGame=h.state();firstGeneration=h.app.stateGeneration;armed=true;
  receipt=h.app.beginEventCompanion({kind:'remove',removal:{kind:'origin',originMapId:5,originEventId:1}});
  const original=await h.settle(receipt.result);assert.equal(original.status,'cancelled');assert.equal(throws,1);assert(successor);assert.doesNotThrow(()=>h.app.managementSnapshot(successor),'old projection throw must not revoke actual successor');assert.equal(h.app.encounterBlocked,true);assert.equal(preparations.slice(prepareBase).filter(x=>x.kind==='recover').length,0);
  const ended=h.app.endManagement(successor);assert.equal(ended.status,'unchanged');event('formal-endManagement-invokes-ready',{ended});
  for(let i=0;i<32&&(throws!==2||h.G.PSFlow.companionNativePending()||h.app.saveBlocked);i++)await flush();
  assert.equal(throws,2);assert.equal(projects.length-projectBase,2);assert.equal(preparations.slice(prepareBase).filter(x=>x.kind==='recover').length,1);
  const exhausted=clone(h.service.projectionRepair);assert.equal(exhausted.status,'failed');assert.equal(exhausted.attempts,1);assert.equal(`${exhausted.generation}:${exhausted.revision}`,firstKey);assert.equal(h.app.encounterBlocked,false);assert.equal(h.app.saveBlocked,false);
  const expected=clone(stateBefore);expected.world.companions=expected.world.companions.filter(c=>c.originEventId===2);assert.deepEqual(h.state(),expected,'remaining ID2 persists, no manual domain edit or rollback');assert.equal(h.G.$gamePlayer.followers()._visible,false);
  const beforeSettled=view(),counts={project:projects.length,prepare:preparations.length,frames:h.mapFrames},ready=[];
  for(let i=0;i<12;i++){h.tick();await flush();if([0,5,11].includes(i)){const r=await h.app.recoverEventCompanionProjection();ready.push(r);assert.equal(r.status,'exhausted','formal public ready reports exhausted, never direct host.project');}}
  assert.equal(h.mapFrames-counts.frames,12);assert.equal(projects.length,counts.project);assert.equal(preparations.length,counts.prepare);assert.equal(throws,2);assert.deepEqual(h.state(),expected);assert.equal(h.service.projectionRepair.generation,exhausted.generation);assert.equal(h.service.projectionRepair.revision,exhausted.revision);assert.equal(h.service.projectionRepair.attempts,1);assert.equal(h.service.projectionRepair.status,'failed');
  assert.strictEqual(h.G.$gameMap,identity.map);assert.strictEqual(h.G.$dataMap,identity.data);assert.strictEqual(h.G.SceneManager._scene,identity.scene);assert.strictEqual(h.G.$gamePlayer,identity.player);assert.strictEqual(h.content,identity.content);assert.strictEqual(ports.worldTravel.nativeLeaseSource,identity.source);assert.strictEqual(h.controller,identity.controller);assert.strictEqual(h.G.PSFlow._app,h.app);
  assert.equal(h.G.PSFlow.companionNativePending(),false);assert.equal(h.G.PSWorld.pending(),false);assert.equal(h.channelCount,1);assert.equal(h.saves.length,saveBase);assert.deepEqual(h.draws,draws);assert.deepEqual(h.nativeDraws,nativeDraws);assert.deepEqual(rng.counts(),{mathRandom:0,mathRandomInt:0,business:0,engine:0});assert.equal(h.G.$gamePlayer.followers()._visible,false);assert(bindings.every(b=>b.isOperationCurrent(b.owner,b.generation)===false),'terminal old bindings retired');
  event('exhausted-stable-after-12-real-map-frames',{beforeSettled,after:view(),ready,actualKey:firstKey,observedAttempts:exhausted.attempts,oneRepairBudgetFromProductionContract:1,sameNativeSource:true,noPlayerMovement:true});
  fs.writeFileSync(path.join(scope,'RESULT.json'),JSON.stringify({status:'PASS_SCOPED_PERSISTENT_FAILURE_BOUNDED',trace,projects,preparations,throws,ready,after:view(),actualRNG:rng.rows,doesNotProveProjectionRecovered:true},null,2)+'\n',{flag:'wx'});
 }finally{
  if(h)fs.writeFileSync(path.join(scope,'LAST-OBSERVATION.json'),JSON.stringify({throws,trace,projects,preparations,last:view(),actualRNG:rng?.rows??null,diagnostics:h.G.PSWorld.diagnostics},null,2)+'\n',{flag:'wx'});
  rng?.restore();
 }
});
