'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,flush}=require('./companion-fixture.cjs');
const kind=process.env.PF_CASE_KIND,scope=path.resolve(process.env.PF_CASE_ROOT),E=path.resolve(process.env.PF_FINAL_PRODUCTION_RUN);
assert(scope.startsWith(E+path.sep));assert(['control','all-sourceclose','all-projectthrow','all-cancel','partial-sourceclose','partial-projectthrow','partial-cancel'].includes(kind));
const clone=x=>structuredClone(x),ids=h=>h.state().world.companions.map(c=>c.originEventId);
const view=h=>({generation:h.app.stateGeneration,currentApp:h.G.PSFlow._app===h.app,records:clone(h.records()),native:h.visual.parent.children.filter(s=>!s.destroyed).map(s=>({x:s._character._x,y:s._character._y,transparent:s._character._transparent})),authorVisible:h.G.$gamePlayer.followers()._visible,effectiveVisible:h.G.$gamePlayer.followers().isVisible(),saveBlocked:h.app.saveBlocked,encounterBlocked:h.app.encounterBlocked,prepareCount:h.prepareCount,repair:clone(h.service.projectionRepair),saves:h.saves.length,frameworkRNG:h.draws.slice(),nativeRNG:h.nativeDraws.slice()});
test(kind+' final5631 actual App + full Flow + production native postcommit removal',async()=>{
 let h,receipt,successor=null,armed=false,faults=0,realConnection=null,actualPorts=null,beforeGame,beforeGeneration;
 const trace=[],preparations=[],projects=[],sourceReads=[];let rng;
 const partial=kind.startsWith('partial-'),fault=kind==='control'?null:kind.slice(kind.indexOf('-')+1),expected=partial?[2]:[];
 function event(name,data={}){trace.push({sequence:trace.length+1,name,...data});}
 try{
  h=await fixture({observePorts(ports){actualPorts=ports;},connected(c){realConnection=c.connection;},
   afterPrepare({intent,result}){preparations.push({kind:intent.kind,status:result.status,eventId:intent.eventId??null});},
   sourceRead({prepared,args}){sourceReads.push({action:prepared.action.kind,origin:clone(args[0])});},
   beforeProject({h:actual,visual,prepared,binding,real}){
    const row={action:prepared.action.kind,generation:binding.generation,bindingCurrent:binding.isOperationCurrent(binding.owner,binding.generation),records:ids(actual),nativeCount:visual.parent.children.filter(s=>!s.destroyed).length};projects.push(row);
    if(!armed||prepared.action.kind!=='remove')return;
    armed=false;faults++;assert.equal(faults,1);assert.strictEqual(actual.app,h.app);assert.strictEqual(actual.G.PSFlow._app,h.app);assert.equal(h.app.stateGeneration,beforeGeneration);assert.deepEqual(ids(h),expected);assert.notStrictEqual(h.state(),beforeGame,'actual authoritative App state replaced before fault');assert.equal(row.nativeCount,2,'old native projection exists at postcommit fault');assert.equal(row.bindingCurrent,true);
    event('authoritative-commit-observed-before-fault',{fault,...view(h),preparedKind:prepared.action.kind,actualProductionConnection:realConnection.application===h.app});
    new h.G.Game_Interpreter().command216([1]);assert.equal(h.G.$gamePlayer.followers()._visible,false);event('latest216-hidden');
    if(fault==='sourceclose'){Reflect.apply(real.companions.close,real.companions,[prepared]);event('actual-production-preparation-closed');}
    else if(fault==='projectthrow'){event('controlled-project-throw');throw Error('CONTROLLED_POSTCOMMIT_PROJECTION_THROW');}
    else if(fault==='cancel'){
     assert(receipt);const outcome=h.app.cancelEventCompanion(receipt.handle);assert.equal(outcome.status,'cancelled');successor=h.app.beginManagement();assert.equal(typeof successor,'string');assert.doesNotThrow(()=>h.app.managementSnapshot(successor));assert.equal(h.app.encounterBlocked,true);event('actual-cancel-and-management-successor',{outcome,token:successor,...view(h)});
    }
   },afterProject({prepared}){event('actual-project-completed',{action:prepared.action.kind});}});
  assert(actualPorts&&realConnection);assert.strictEqual(realConnection.application,h.app);assert.strictEqual(realConnection.service,h.service);assert(actualPorts.worldTravel.nativeLeaseSource);assert.equal(h.G.PSFlow._app,h.app);assert.equal(h.channelCount,1,'one actual Flow production connect');
  rng=require('../travel-host/rng-observer.cjs').install(h.G,process.env.PF_E3_JOINT_OUT);
  const originalEvents=h.G.$gameMap._events.slice();const originalMap=h.G.$gameMap,originalData=h.G.$dataMap,originalScene=h.G.SceneManager._scene;
  for(const id of [1,2]){const r=h.app.beginEventCompanion({kind:'register',eventId:id,name:'buddy'+id});assert.equal((await h.settle(r.result)).status,'completed');}
  assert.deepEqual(ids(h),[1,2]);assert.equal(h.visual.parent.children.length,2);assert.equal(h.G.$gamePlayer.followers()._visible,true);assert.equal(h.G.$gamePlayer.followers().isVisible(),false);
  const before=view(h),prepareBaseline=preparations.length,projectBaseline=projects.length,saveBaseline=h.saves.length,drawBaseline=h.draws.slice(),nativeBaseline=h.nativeDraws.slice(),stateBaseline=clone(h.state());beforeGame=h.state();beforeGeneration=h.app.stateGeneration;
  event('registered-two-via-actual-App-production-channel',before);
  if(kind==='control'){
   for(const removal of [{kind:'origin',originMapId:5,originEventId:1},{kind:'all'}]){const r=h.app.beginEventCompanion({kind:'remove',removal});assert.equal((await h.settle(r.result)).status,'completed');}
   assert.deepEqual(ids(h),[]);assert.equal(h.visual.parent.children.length,0);assert.equal(h.G.$gamePlayer.followers().isVisible(),true);assert.equal(faults,0);
  }else{
   armed=true;receipt=h.app.beginEventCompanion({kind:'remove',removal:partial?{kind:'origin',originMapId:5,originEventId:1}:{kind:'all'}});
   const outcome=await h.settle(receipt.result);event('original-remove-promise-settled',{outcome,...view(h)});assert.equal(faults,1,'fault actually executed after commit');assert.equal(outcome.status,fault==='cancel'?'cancelled':'failed');
   if(fault==='cancel'){
    assert(successor);assert.doesNotThrow(()=>h.app.managementSnapshot(successor),'old failure did not revoke real successor');assert.equal(h.app.encounterBlocked,true);assert.equal(preparations.slice(prepareBaseline).filter(x=>x.kind==='recover').length,0,'busy successor blocks repair without consuming attempt');
    const ended=h.app.endManagement(successor);assert.equal(ended.status,'unchanged');event('formal-endManagement-triggered-ready',{ended});
    for(let n=0;n<24&&h.service.projectionRepair.status!=='clean';n++)await flush();
   }
   assert.equal(h.app.stateGeneration,beforeGeneration);assert.deepEqual(ids(h),expected);assert.equal(h.visual.parent.children.length,expected.length);assert.equal(h.service.projectionRepair.status,'clean');assert.equal(h.app.encounterBlocked,false);assert.equal(h.app.saveBlocked,false);assert.equal(h.G.$gamePlayer.followers()._visible,false,'latest216 intent not restored from old snapshot');assert(h.visual.parent.children.every(s=>s._character._transparent===true));
   assert.equal(projects.length-projectBaseline,2,'one failed original project + one formal current-generation recovery');assert.equal(preparations.slice(prepareBaseline).filter(x=>x.kind==='recover').length,1,'one bounded automatic repair');
   assert.equal((await h.app.recoverEventCompanionProjection()).status,'idle','explicit public read confirms already clean; it does not perform repair');
   event('current-generation-recovery-completed',view(h));
   new h.G.Game_Interpreter().command216([0]);h.tick();await flush();assert.equal(h.G.$gamePlayer.followers()._visible,true);assert.equal(h.G.$gamePlayer.followers().isVisible(),!partial,'no permanent obsolete mask');assert(h.visual.parent.children.every(s=>s._character._transparent===false));
  }
  const expectedGame=clone(stateBaseline);expectedGame.world.companions=kind==='control'?[]:stateBaseline.world.companions.filter(c=>partial&&c.originEventId===2);assert.deepEqual(h.state(),expectedGame,'committed removals alone alter domain state; no rollback or ancillary write');
  assert.strictEqual(h.G.$gameMap,originalMap);assert.strictEqual(h.G.$dataMap,originalData);assert.strictEqual(h.G.SceneManager._scene,originalScene);for(const id of [1,2])assert.strictEqual(h.G.$gameMap._events[id],originalEvents[id],'original source event remains');
  const settled=view(h),stable=clone(h.state()),counts={preparations:preparations.length,projects:projects.length};for(let n=0;n<12;n++){h.tick();await flush();}
  assert.deepEqual(h.state(),stable);assert.equal(preparations.length,counts.preparations);assert.equal(projects.length,counts.projects);assert.equal(h.saves.length,saveBaseline);assert.deepEqual(h.draws,drawBaseline);assert.deepEqual(h.nativeDraws,nativeBaseline);assert.deepEqual(rng.counts(),{mathRandom:0,mathRandomInt:0,business:0,engine:0});assert.equal(h.G.PSFlow.companionNativePending(),false);assert.equal(h.G.PSWorld.pending(),false);assert.equal(h.channelCount,1);
  event('stable-after-12-genuine-map-frames',{counts,...view(h)});
  fs.writeFileSync(path.join(scope,'RESULT.json'),JSON.stringify({kind,status:'PASS_SCOPED_CURRENT_FLOW_NATIVE_REMOVE',before,settled,after:view(h),trace,preparations,projects,sourceReads,actualRNG:rng.rows,noUserMovement:true,saveDelta:h.saves.length-saveBaseline},null,2)+'\n',{flag:'wx'});
 }finally{
  if(h)fs.writeFileSync(path.join(scope,'LAST-OBSERVATION.json'),JSON.stringify({kind,faults,trace,preparations,projects,sourceReads,last:view(h),diagnostics:h.G.PSWorld.diagnostics,actualRNG:rng?.rows??null},null,2)+'\n',{flag:'wx'});
  rng?.restore();
 }
});
