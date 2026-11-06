'use strict';
// Complete authored workload in controlled Node ports. Not native/F100 trace or timing qualification.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),{spawnSync}=require('node:child_process');
const {compile}=require('./normal-preparation-test-support.cjs'),{createNormalInputControlHost}=require('./normal-input-control-host.cjs'),E=require('../../../js/engine/build/production.cjs');
let h,api,tools,execution,managementText;
function artifact(name,data){if(process.env.PF_OFFLINE_RECEIPT_DIR){fs.mkdirSync(process.env.PF_OFFLINE_RECEIPT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.PF_OFFLINE_RECEIPT_DIR,name+'.json.gz'),zlib.gzipSync(JSON.stringify(data),{level:6}));}}
test.before(async()=>{
 h=await compile();api=h.api;tools=api.createReviewedNormalTools(require);
 const vite=require(require.resolve('vite',{paths:[path.join(h.ROOT,'src')]}));
 await vite.build({configFile:false,root:h.ROOT,logLevel:'error',build:{outDir:path.join(h.work,'execution'),emptyOutDir:false,minify:false,lib:{entry:path.join(h.ROOT,'src/plugins/flowtest/d2-normal-execution.ts'),formats:['cjs'],fileName:()=> 'entry.cjs'}}});
 execution=require(path.join(h.work,'execution/entry.cjs'));
 const out=path.join(h.work,'PS_Management'),r=spawnSync(process.execPath,[path.join(h.ROOT,'src/node_modules/vite/bin/vite.js'),'build','--configLoader','runner','--outDir',out],{cwd:path.join(h.ROOT,'src'),env:{...process.env,RR_PLUGIN:'PS_Management'},encoding:'utf8',timeout:90000});assert.equal(r.status,0,r.stdout+r.stderr);managementText=fs.readFileSync(path.join(out,'PS_Management.js'),'utf8');
});
test.after(()=>h?.close());
async function owned(t){
 const x=createNormalInputControlHost(h,managementText);await x.p.toMapId(5);
 x.fixture=api.installNormalHostFixture(E,x.G,x.G,{trainerAiTiming:{now:()=>x.G.performance.now(),after(ms,fn){const id=x.G.setTimeout(fn,ms);return ()=>x.G.clearTimeout(id);}}});
 t.after(async()=>{if(x.w.flow.running)x.w.flow.abort(Error('owned offline workload cleanup'));x.M.goto(x.G.Scene_Map);await x.frames(2);assert.equal(x.fixture.app.saveBlocked,false);});
 x.ports=()=>({deadlineKind:'TEST_HYGIENE',deadline:x.G.performance.now()+180000,now:()=>x.G.performance.now(),setTimer:(fn,ms)=>x.G.setTimeout(fn,ms),clearTimer:id=>x.G.clearTimeout(id),dispatch:tools.domDispatch(x.G.document,x.G.KeyboardEvent)});
 return x;
}
function released(x){assert(Object.values(x.G.Input._currentState).every(v=>!v));for(const n of ['chooseMove','chooseSwitch','useItem','throwBall','decideLearn','run'])assert.equal(Object.hasOwn(x.w.flow._op.session,n),false,n);assert.equal(Object.hasOwn(x.fixture.app,'startBattle'),false);}
test('all 100 authored cases complete once in frozen order with actual inputs/actions and carried state; qualification stays false',async t=>{
 const x=await owned(t),base=x.G.SceneManager.updateMain,donor=x.fixture.data.donor;
 let result;
 try{result=await x.pump(execution.executeOfflineNormalWorkload(E,x.G,x.G,x.fixture,tools,{scope:'OFFLINE_CONTROL',caseIdPrefix:'owned-complete'},x.ports),200000);}
 catch(error){artifact('complete-FAIL',{error:String(error),completed:error.completed,failed:error.failed});console.log('OFFLINE_WORKLOAD_FAILURE '+JSON.stringify({error:String(error),completed:error.completed?.length,failedCase:error.failed?.caseId,primary:error.failed?.error,decisions:error.failed?.decisions?.slice(-8)}));throw error;}
 artifact('complete',result);
 assert.equal(result.executedCount,100);assert.equal(result.sourceCount,100);assert.equal(result.cases.length,100);assert.equal(result.full100Accepted,false);
 const ledger=x.fixture.state().appliedBattles,keys=Object.keys(ledger),inputs=result.cases.flatMap(c=>c.inputs),actions=result.cases.flatMap(c=>c.resolved.actions);
 assert.deepEqual(keys,result.cases.map(c=>c.caseId));assert.equal(new Set(keys).size,100);assert(keys.every(k=>k.startsWith('owned-complete-')));
 for(let i=0;i<100;i++){
  const c=result.cases[i],source=donor.cases[i];assert.equal(c.donorCaseId,source.id);assert.equal(c.caseId,'owned-complete-'+String(i+1).padStart(3,'0'));assert.equal(c.status,'OFFLINE_CASE_RESOLVED');
  assert.deepEqual(c.resolved.steps.map(s=>s.step),source.steps);assert.equal(c.resolved.map.outcomeCode,source.expected.code);assert.equal(c.resolved.map.pairHash,ledger[c.caseId].settlement.pairHash);
  assert.deepEqual(c.setup.seed,source.seed);assert.equal(c.setup.firstTrainer!==null,i===2);assert(c.inputs.every(p=>p.status==='released'&&p.gameReleased>p.gameStart));
  for(const k of ['nativeAdmission','traceQualified','deadlineQualified','full100Accepted'])assert.equal(c[k],false,k);assert.equal(c.error,null);assert.deepEqual(c.cleanupErrors,[]);
 }
 const counts=Object.fromEntries([1,2,4].map(code=>[code,result.cases.filter(c=>c.resolved.map.outcomeCode===code).length]));assert.deepEqual(counts,{1:50,2:25,4:25});
 const state=x.fixture.state();artifact('complete-final-state',state);assert.deepEqual(E.saveSchema.validateGameContent(state,x.fixture.content),[]);assert.equal(new Set([...state.party,...state.storage.boxes.flatMap(b=>b.slots).filter(Boolean)].map(m=>m.id)).size,27);assert.equal(state.party.length,6);assert.equal(state.storage.boxes.flatMap(b=>b.slots).filter(Boolean).length,21);assert.equal(x.transfers.length,25);assert.equal(x.G.SceneManager.updateMain,base);released(x);
 console.log('OFFLINE_WORKLOAD_FACTS '+JSON.stringify({scope:'CONTROLLED_NODE_AUTHORED_WORKLOAD_ONLY',caseCount:100,outcomes:counts,inputPulses:inputs.length,actualActions:actions.length,party:state.party.length,boxes:state.storage.boxes.flatMap(b=>b.slots).filter(Boolean).length,pairedLedgers:keys.length,homeTransferRequests:x.transfers.length,controlledUpdates:x.updates,source:x.source,nativeAdmission:false,traceQualified:false,deadlineQualified:false,full100Accepted:false}));
});
test('a case-boundary cancellation stops the frozen sequence without opening or retrying later cases',async t=>{
 const x=await owned(t),base=x.G.SceneManager.updateMain,controller=new AbortController(),openings=[];
 const ports=(donor,id)=>{openings.push({donor,id});const p=x.ports();if(openings.length===2)controller.abort();return {...p,signal:controller.signal};};
 await assert.rejects(x.pump(execution.executeOfflineNormalWorkload(E,x.G,x.G,x.fixture,tools,{scope:'OFFLINE_CONTROL',caseIdPrefix:'owned-workload-stop',caseCount:3},ports)),error=>{
  artifact('boundary-cancel-FAIL',{error:String(error),completed:error.completed,failed:error.failed});assert.match(String(error),/stopped without retry/);assert.equal(error.completed.length,1);assert.equal(error.failed.caseId,'owned-workload-stop-002');assert.equal(error.failed.status,'FAIL');assert.match(error.failed.error.message,/cancelled/);return true;
 });
 assert.equal(openings.length,2);assert.deepEqual(Object.keys(x.fixture.state().appliedBattles),['owned-workload-stop-001']);assert.equal(x.G.SceneManager.updateMain,base);released(x);
});
