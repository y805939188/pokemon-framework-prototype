'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {compile}=require('./normal-preparation-test-support.cjs'),{createNormalInputControlHost}=require('./normal-input-control-host.cjs'),E=require('../../../js/engine/build/production.cjs');
let h,A,execute,batch,oracleFactory,tools,managementText;
test.before(async()=>{
  h=await compile();A=h.api;tools=A.createReviewedNormalTools(require);
  const vite=require(require.resolve('vite',{paths:[path.join(h.ROOT,'src')]})),entry=path.join(h.work,'execution.ts');
  fs.writeFileSync(entry,['execution','oracle'].map(n=>'export * from '+JSON.stringify(path.join(h.ROOT,'src/plugins/flowtest/d2-normal-'+n+'.ts'))+';').join('\n'));
  await vite.build({configFile:false,root:h.ROOT,logLevel:'error',build:{outDir:path.join(h.work,'execution'),emptyOutDir:false,minify:false,lib:{entry,formats:['cjs'],fileName:()=> 'entry.cjs'}}});
  const built=require(path.join(h.work,'execution/entry.cjs'));execute=built.executeOfflineNormalCase;batch=built.executeOfflineNormalWorkload;oracleFactory=built.bindNormalIntentOracle;
  const out=path.join(h.work,'PS_Management'),r=spawnSync(process.execPath,[path.join(h.ROOT,'src/node_modules/vite/bin/vite.js'),'build','--configLoader','runner','--outDir',out],{cwd:path.join(h.ROOT,'src'),env:{...process.env,RR_PLUGIN:'PS_Management'},encoding:'utf8',timeout:90000});assert.equal(r.status,0,r.stdout+r.stderr);managementText=fs.readFileSync(path.join(out,'PS_Management.js'),'utf8');
});
test.after(()=>h?.close());
async function owned(t){
  const x=createNormalInputControlHost(h,managementText);await x.p.toMapId(5);
  const fixture=A.installNormalHostFixture(E,x.G,x.G,{trainerAiTiming:{now:()=>x.G.performance.now(),after(ms,callback){const token=x.G.setTimeout(callback,ms);return ()=>x.G.clearTimeout(token);}}});
  t.after(async()=>{if(x.w.flow.running)x.w.flow.abort(Error('owned offline input cleanup'));x.M.goto(x.G.Scene_Map);await x.frames(2);assert.equal(fixture.app.saveBlocked,false);});
  const ports=()=>({deadlineKind:'TEST_HYGIENE',deadline:x.G.performance.now()+180000,now:()=>x.G.performance.now(),setTimer:(fn,ms)=>x.G.setTimeout(fn,ms),clearTimer:id=>x.G.clearTimeout(id),dispatch:tools.domDispatch(x.G.document,x.G.KeyboardEvent)});
  const save=(name,value)=>{if(process.env.PF_OFFLINE_RECEIPT_DIR){fs.mkdirSync(process.env.PF_OFFLINE_RECEIPT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.PF_OFFLINE_RECEIPT_DIR,name+'.json'),JSON.stringify(value,null,2)+'\n');}return value;};
  return Object.assign(x,{fixture,ports,save,runBatch:async(caseIdPrefix,caseCount)=>save(caseIdPrefix,await x.pump(batch(E,x.G,x.G,fixture,tools,{scope:'OFFLINE_CONTROL',caseIdPrefix,caseCount},ports))),run:async(donorCaseId,caseId)=>{
    try{return save(caseId,await x.pump(execute(E,x.G,x.G,fixture,tools,{scope:'OFFLINE_CONTROL',donorCaseId,caseId},ports())));}
    catch(error){save(caseId+'-FAIL',error.receipt??{error:String(error)});console.log('OFFLINE_FAILURE '+JSON.stringify({caseId,primary:String(error.primary),error:error.receipt?.error}));throw error;}
  }});
}
function released(x){assert(Object.values(x.G.Input._currentState).every(v=>!v));for(const n of ['chooseMove','chooseSwitch','useItem','throwBall','decideLearn','run'])assert.equal(Object.hasOwn(x.w.flow._op.session,n),false,n);assert.equal(Object.hasOwn(x.fixture.app,'startBattle'),false);}
test('stock Input→enabled Window.processOk drives real wild win and capture with one-update key release',async t=>{
  const x=await owned(t),base=x.G.SceneManager.updateMain;
  const win=await x.run('F100-001','owned-input-win');assert.equal(win.status,'OFFLINE_CASE_RESOLVED');assert.deepEqual(win.resolved.steps.map(s=>s.step),['finish-payday']);assert.equal(win.traceQualified,false);assert.equal(x.G.SceneManager.updateMain,base);released(x);
  const capture=await x.run('F100-002','owned-input-capture');assert.equal(capture.resolved.map.outcomeCode,2);assert.deepEqual(capture.resolved.steps.map(s=>s.step),['masterball']);assert.equal(x.fixture.state().party.length,3);released(x);
  assert(x.processOk>0);assert(x.dispatches.some(d=>d.type==='keydown'));assert(win.inputs.every(i=>i.status==='released'&&i.gameReleased>i.gameStart));
  assert.deepEqual(Object.keys(x.fixture.state().appliedBattles),['owned-input-win','owned-input-capture']);
  console.log('OFFLINE_INPUT_CONTROL '+JSON.stringify({scope:'OWN_ID_INPUT_CONTROL_NOT_F100_OR_QUALIFIED_TRACE',source:x.source,processOk:x.processOk,inputs:win.inputs.length+capture.inputs.length}));
});
test('five frozen trainer intentions progress only on real actions, including spent blocked ball, held facts and actual slot3 learning',async t=>{
  const x=await owned(t),workload=await x.runBatch('owned-input-prefix',3);assert.equal(workload.executedCount,3);assert.equal(workload.full100Accepted,false);
  const r=workload.cases[2];assert.equal(r.status,'OFFLINE_CASE_RESOLVED');assert.equal(r.setup.firstTrainer.hp,1);
  assert.deepEqual(r.resolved.steps.map(s=>s.step),['potion-P1','switch-P2','masterball-blocked','switch-P1','finish-payday-and-learn-slot3']);
  assert(r.resolved.actions.some(a=>a.method==='decideLearn'&&a.args[0]===3));assert.equal(x.fixture.state().party.find(m=>m.id==='P1').item,'oranberry');assert.equal(x.fixture.state().party.find(m=>m.id==='P2').item,'');released(x);
});
test('genuine D3 defeat uses the normal input path, actual healing and a requested home transfer',async t=>{
  const x=await owned(t),r=await x.run('F100-004','owned-input-defeat');assert.equal(r.resolved.map.outcomeCode,4);assert.equal(r.resolved.intentIndex,1);assert.equal(x.w.flow.lastOutcome.blackout,true);assert.equal(x.transfers.length,1);released(x);
});
test('actual owned Dex pages are acknowledged via released input pulses across Scene boundaries',async t=>{
  const x=await owned(t);assert.equal(x.fixture.app.updatePokedex({kind:'entitlement',value:true}).status,'applied');
  const r=await x.run('F100-002','owned-input-dex');assert(r.decisions.some(d=>d.decision.kind==='acknowledge'&&d.decision.layer==='entry'));assert.equal(x.fixture.app.pendingPokedex,null);released(x);
});
test('dispatch without a real Session action cannot advance a private intention oracle',async t=>{
  const x=await owned(t);x.fixture.prepareCase('F100-001');x.w.flow.openBattle({kind:'wild',battleId:'owned-oracle-no-action',seq:1,foes:[{species:'pidgey',level:1}],battleEffects:true});await x.p.inMode('main');
  const plan={...tools.compileNavigation().cases[0],id:'owned-oracle-no-action'},oracle=oracleFactory(E,x.G,x.G,x.fixture,plan);
  const dispatch=tools.domDispatch(x.G.document,x.G.KeyboardEvent);dispatch('keydown','down');await x.G.SceneManager.updateMain();dispatch('keyup','down');await x.G.SceneManager.updateMain();
  assert.equal(oracle.poll().intentIndex,0);assert.equal(oracle.poll().actionCount,0);assert.equal(oracle.dispose().restored,true);
});
test('a test deadline failure releases all keys and restores only owned clock/App/Session bindings',async t=>{
  const x=await owned(t),base=x.G.SceneManager.updateMain,p=x.ports();p.deadline=x.G.performance.now()+50;
  await assert.rejects(x.pump(execute(E,x.G,x.G,x.fixture,tools,{scope:'OFFLINE_CONTROL',donorCaseId:'F100-001',caseId:'owned-input-expiry'},p)),e=>{x.save('owned-input-expiry-FAIL',e.receipt);return e.receipt?.status==='FAIL'&&e.receipt.deadlineQualified===false;});
  assert.equal(x.G.SceneManager.updateMain,base);assert.equal(Object.hasOwn(x.fixture.app,'startBattle'),false);assert(Object.values(x.G.Input._currentState).every(v=>!v));
});

test('a wrong real business action permanently poisons the private oracle, including repeat polling',async t=>{
  const x=await owned(t);x.fixture.prepareCase('F100-003');x.w.flow.openBattle({kind:'trainer',trainer:x.fixture.data.donor.cases[2].request.trainer,battleId:'owned-oracle-wrong-item',seq:3,battleEffects:true});await x.p.inMode('main');
  const plan={...tools.compileNavigation().cases[2],id:'owned-oracle-wrong-item'},oracle=oracleFactory(E,x.G,x.G,x.fixture,plan);
  const actual=await x.w.flow._op.session.useItem('potion','P2');assert.equal(actual.ok,true);
  assert.throws(()=>oracle.poll(),/actual item effect/);assert.throws(()=>oracle.poll(),/actual item effect/);assert.equal(oracle.context().intentIndex,0);assert.equal(oracle.observations().history.length,1);assert.equal(oracle.dispose().restored,true);
});
test('real terminal actions plus forged Map metadata cannot bypass actual App settlement and ready Map',async t=>{
  const x=await owned(t);x.fixture.prepareCase('F100-001');x.w.flow.openBattle({kind:'wild',battleId:'owned-oracle-forged-map',seq:1,foes:[{species:'pidgey',level:1}],battleEffects:true});await x.p.inMode('main');
  const plan={...tools.compileNavigation().cases[0],id:'owned-oracle-forged-map'},oracle=oracleFactory(E,x.G,x.G,x.fixture,plan),session=x.w.flow._op.session;
  const result=await session.chooseMove(1);assert.equal(result.ok,true);assert.equal(session.finished,true);assert.equal(oracle.poll().complete,true);assert.deepEqual(x.fixture.state().appliedBattles,{});
  assert.throws(()=>oracle.finish({kind:'mapReady',caseId:plan.id,pairHash:'a'.repeat(64)}),/actual committed ready Map/);assert.throws(()=>oracle.poll(),/actual committed ready Map/);assert.equal(oracle.dispose().restored,true);
});
test('one release port failure retains failure details and performs cleanup without replaying business',async t=>{
  const x=await owned(t),base=x.G.SceneManager.updateMain,p=x.ports(),dispatch=p.dispatch;let held=false,injected=false;
  p.dispatch=(type,key)=>{dispatch(type,key);if(type==='keydown')held=true;if(type==='keyup'&&held&&!injected){injected=true;throw Error('owned keyup port failure');}};
  await assert.rejects(x.pump(execute(E,x.G,x.G,x.fixture,tools,{scope:'OFFLINE_CONTROL',donorCaseId:'F100-001',caseId:'owned-input-release-failure'},p)),e=>{x.save('owned-input-release-failure-FAIL',e.receipt);assert.equal(e.receipt.status,'FAIL');assert.match(JSON.stringify(e.receipt.error),/owned keyup port failure/);assert.equal(e.receipt.observations?.history.length??0,0);return true;});
  assert(injected);assert.equal(x.G.SceneManager.updateMain,base);released(x);assert.deepEqual(x.fixture.state().appliedBattles,{});
});
test('cancellation at a keydown releases keys and retires the case without a successor keydown',async t=>{
  const x=await owned(t),base=x.G.SceneManager.updateMain,p=x.ports(),dispatch=p.dispatch,controller=new AbortController();let cancelledAt=-1;
  p.signal=controller.signal;p.dispatch=(type,key)=>{dispatch(type,key);if(type==='keydown'&&cancelledAt<0){cancelledAt=x.dispatches.length;controller.abort();}};
  await assert.rejects(x.pump(execute(E,x.G,x.G,x.fixture,tools,{scope:'OFFLINE_CONTROL',donorCaseId:'F100-001',caseId:'owned-input-cancel'},p)),e=>{x.save('owned-input-cancel-FAIL',e.receipt);assert.match(e.receipt.error.message,/offline input cancelled/);assert.equal(e.receipt.status,'FAIL');return true;});
  assert(cancelledAt>0);assert(x.dispatches.slice(cancelledAt).every(d=>d.type==='keyup'));assert.equal(x.G.SceneManager.updateMain,base);released(x);assert.deepEqual(x.fixture.state().appliedBattles,{});
});
