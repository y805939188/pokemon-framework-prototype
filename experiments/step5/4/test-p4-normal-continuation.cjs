'use strict';
// Own-ID App/Gen8/compiled Scene controls. Semantic handlers/keys and rendering are a Node VM port, never native qualification.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const {compile}=require('./normal-preparation-test-support.cjs'),{createVictoryDriverHost}=require('./victory-music-driver-host.cjs');
const E=require('../../../js/engine/build/production.cjs'),PLAN=require('./victory-music-native-plan.json');
let h,A,tools,continuation,managementText,sequence=0;
test.before(async()=>{
  h=await compile();A=h.api;tools=A.createReviewedNormalTools(require);
  const vite=require(require.resolve('vite',{paths:[path.join(h.ROOT,'src')]}));
  await vite.build({configFile:false,root:h.ROOT,logLevel:'error',build:{outDir:path.join(h.work,'continuation'),emptyOutDir:false,minify:false,lib:{entry:path.join(h.ROOT,'src/plugins/flowtest/d2-normal-continuation.ts'),formats:['cjs'],fileName:()=> 'entry.cjs'}}});
  continuation=require(path.join(h.work,'continuation/entry.cjs'));
  const out=path.join(h.work,'PS_Management'),r=spawnSync(process.execPath,[path.join(h.ROOT,'src/node_modules/vite/bin/vite.js'),'build','--configLoader','runner','--outDir',out],{cwd:path.join(h.ROOT,'src'),env:{...process.env,RR_PLUGIN:'PS_Management'},encoding:'utf8',timeout:90000});
  assert.equal(r.status,0,r.stdout+r.stderr);managementText=fs.readFileSync(path.join(out,'PS_Management.js'),'utf8');
});
test.after(()=>h?.close());
async function owned(t,{dex=false,learning=false}={}){
  const x=createVictoryDriverHost({...h,driverText:'SYNTHETIC_UNUSED',PLAN,options:{productionTranslator:true}}),G=x.G,flow=x.w.flow,oldInput=G.PSManagement.inputFrame;
  const listeners=new Map(),add=(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},remove=(name,fn)=>listeners.get(name)?.delete(fn);
  G.document={addEventListener:add,removeEventListener:remove,createElement(){throw Error('unexpected native nickname editor in mode1/naming1 control');}};
  G.addEventListener=add;G.removeEventListener=remove;
  G.Bitmap.prototype.fillRect=function(){};G.Input.keyMapper={};G.Input.isPressed=k=>!!oldInput().pressed[k==='ok'?'use':['cancel','escape','menu'].includes(k)?'back':k];G.TouchInput.isCancelled=()=>false;
  vm.runInContext(managementText,G,{filename:'current-PS_Management.js'});
  await x.p.toMapId(5);const fixture=A.installNormalHostFixture(E,G,G);
  if(dex)assert.equal(fixture.app.updatePokedex({kind:'entitlement',value:true}).status,'applied','explicit own-control public entitlement, not a frozen F100 initial');
  fixture.prepareCase('F100-001');
  const id='owned-normal-continuation-'+(++sequence),program=tools.compileNavigation(),source=learning?program.cases[2]:program.cases[1];
  const policy=learning?source.policy.filter(p=>p.learnSlot===3):source.policy;
  assert.equal(policy.length,1);const plan={id,policy,expected:{code:learning?1:2}},context={caseId:id,intentIndex:0};
  flow.openBattle({kind:'wild',battleId:id,seq:sequence,foes:[{species:'pidgey',level:1}],expGain:learning,battleEffects:true,canLose:true});
  await x.p.inMode('main');const scene=x.p.battle(),session=scene._session;
  t.after(async()=>{
    if(flow.running)flow.abort(Error('owned continuation control cleanup'));
    await x.waitFor(()=>!flow.running&&!fixture.app.saveBlocked,'owned continuation root stopped');
    x.M.goto(G.Scene_Map); // private VM exits with this Node control; no guard bypass or native host restoration.
  });
  const attach=()=>continuation.bindNormalContinuation(tools,E,G,G,fixture,plan,{gameTick:()=>G.Graphics.frameCount});
  return {...x,flow,fixture,scene,session,plan,context,attach};
}
async function select(x,phase,key){
  await x.p.inMode(phase);const s=x.p.battle(),dto=s.inputState();assert.equal(dto.ready,true);
  const found=s._menu._items.map((item,index)=>({item,index})).filter(x=>x.item.ext===key&&x.item.enabled!==false);assert.equal(found.length,1,phase+'/'+key);
  s._menu.select(found[0].index);s.onMenuOk();await x.frames(2);
}
async function caught(x,run){
  let observed;
  x.scene.act(()=>{
    const action=x.session.throwBall('masterball');
    if(run){try{observed={view:E.session.readSessionRequestContext(x.session),out:run.decide(x.context)};}catch(error){observed={error:String(error)};}}
    return action;
  },'ball');
  await x.p.inMode('end');
  if(run){assert(observed);assert.equal(observed.error,undefined);assert.equal(observed.view.reason,'request-view-busy');assert.equal(observed.out.decision.kind,'wait');}
}
async function drain(x,run,{untilContinuation=false}={}){
  const seen=[];
  for(let i=0;i<3000;i++){
    const out=run.decide(x.context);seen.push({scene:out.snapshot.sceneKind,decision:out.decision.kind,layer:out.decision.layer??null});
    if(untilContinuation&&out.snapshot.sceneKind==='continuation')return {out,seen};
    if(out.decision.kind==='mapReady')return {out,seen};
    if(out.decision.kind==='blocked')throw Error('unexpected planner block: '+out.decision.reason);
    if(out.decision.kind==='choose')await select(x,out.decision.phase,out.decision.key);
    else if(['acknowledge','ackPaused','ackStats'].includes(out.decision.kind))await x.p.press('ok');
    else {assert.equal(out.decision.kind,'wait');await x.frames(1);}
  }
  throw Error('owned continuation test hygiene limit, not a qualified normal deadline');
}
test('unchanged mode1/naming1 fixture completes actual capture/automatic receiving and returns one paired Map receipt',async t=>{
  const x=await owned(t),run=x.attach(),initial=x.fixture.state();assert.equal(initial.dex.hasDex,false);
  await caught(x,run);const terminal=run.decide({...x.context,observedOutcomeCode:4});
  assert.equal(terminal.snapshot.observedOutcomeCode,2);assert.deepEqual(terminal.decision,{kind:'choose',phase:'end',key:'end'});
  const {out,seen}=await drain(x,run);assert.equal(out.snapshot.sceneKind,'map');assert.equal(out.decision.outcomeCode,2);assert.equal(out.nativeAdmission,false);
  const state=x.fixture.state();assert.equal(state.party.length,3);assert.equal(state.party[2].species,'pidgey');assert.deepEqual(Object.keys(state.appliedBattles),[x.plan.id]);
  assert.equal(state.appliedBattles[x.plan.id].settlement.pairHash,out.decision.pairHash);assert.equal(x.context.intentIndex,0);
  console.log('NORMAL_CONTINUATION_CONTROL '+JSON.stringify({id:x.plan.id,scope:'OWN_ID_OFFLINE_CONTROL_NOT_F100_OR_QUALIFIED_TRACE',dexEntitlement:false,seen,complete:out.decision}));
});
test('actual entitled capture crosses owned Dex message/entry with a later-update ACK barrier and natural return to Map',async t=>{
  const x=await owned(t,{dex:true}),run=x.attach();await caught(x);await drain(x,run,{untilContinuation:true});
  const before=x.fixture.app.pendingPokedex,a=run.decide(x.context),b=run.decide(x.context);
  assert.equal(a.snapshot.sceneKind,'continuation');assert.equal(a.decision.kind,'wait');assert.equal(b.decision.kind,'wait');assert.deepEqual(x.fixture.app.pendingPokedex,before);
  await x.frames(1);const ack=run.decide(x.context);assert.equal(ack.decision.kind,'acknowledge');assert.equal(ack.decision.layer,'dex-message');assert.deepEqual(x.fixture.app.pendingPokedex,before,'decision alone neither acknowledges nor advances the domain');
  const {out,seen}=await drain(x,run);assert.equal(out.decision.kind,'mapReady');assert(seen.some(s=>s.layer==='entry'));
  assert.equal(x.fixture.app.pendingPokedex,null);assert.equal(x.fixture.app.saveBlocked,false);assert.equal(x.context.intentIndex,0);
});
test('real P2 growth/learning uses the existing normal battle decision path before a same-root Map completion',async t=>{
  const x=await owned(t,{learning:true});await select(x,'main','party');await select(x,'party','P2');await select(x,'party-command','switch-in');await x.p.inMode('main');
  const run=x.attach(),{out,seen}=await drain(x,run);assert.equal(out.decision.outcomeCode,1);assert(seen.some(s=>s.decision==='ackStats'));
  const learned=x.fixture.state().party.find(m=>m.id==='P2');assert.equal(learned.level,51);assert(learned.moves.some(m=>m.id==='growl'));assert.equal(x.context.intentIndex,0);
});
test('actual abort reaching Map has no paired completion even with caller-supplied success metadata',async t=>{
  const x=await owned(t),run=x.attach();x.flow.abort(Error('owned deliberate abort control'));await x.waitFor(()=>!x.flow.running&&!x.fixture.app.saveBlocked,'actual abort');x.M.goto(x.G.Scene_Map);await x.frames(2);
  const out=run.decide({...x.context,observedOutcomeCode:2});assert.equal(out.decision.kind,'blocked');assert.match(out.decision.reason,/did not commit/);assert.deepEqual(Object.keys(x.fixture.state().appliedBattles),[]);
});
test('Title stops the old coordinator permanently without issuing a new command on return to Map',async t=>{
  const x=await owned(t),run=x.attach();x.M.goto(x.G.Scene_Title);const out=run.decide(x.context);assert.equal(out.decision.kind,'stopped');assert.equal(out.snapshot.current,false);
  x.M.goto(x.G.Scene_Map);await x.frames(2);assert.equal(run.decide(x.context).decision.kind,'blocked');assert.deepEqual(Object.keys(x.fixture.state().appliedBattles),[]);
});
test('normal continuation rejects a synchronous actual App generation change during presenter projection',async t=>{
  const x=await owned(t,{dex:true}),run=x.attach();await caught(x);await drain(x,run,{untilContinuation:true});
  const before=JSON.stringify(x.G.$gameSystem._psGame),original=x.G.PSEvolution.normalObservationState;
  x.G.PSEvolution.normalObservationState=()=>{x.fixture.app.stateReplacedByHost();return original();};
  const out=run.decide(x.context);assert.equal(out.decision.kind,'blocked');assert.equal(out.snapshot.current,false);assert.equal(JSON.stringify(x.G.$gameSystem._psGame),before);
  x.G.PSEvolution.normalObservationState=original;
});
test('an actual normal party Scene after the case is a separate presenter and cannot receive stale case commands',async t=>{
  const x=await owned(t),run=x.attach();await caught(x);await drain(x,run);
  assert.equal(x.G.PSManagement.openParty(),true);await x.frames(3);
  const view=x.G.PSManagement.normalObservationState();assert.equal(view.status,'available');assert.equal(view.current,true);assert.equal(view.requestKind,'party');
  const out=run.decide(x.context);assert.equal(out.decision.kind,'blocked');assert.match(out.decision.reason,/unrelated management/);
  await x.p.press('cancel');await x.waitFor(()=>!x.fixture.app.saveBlocked,'actual party presenter closed');
});
test('a new production App at the same generation cannot be driven by the old case coordinator',async t=>{
  const x=await owned(t),run=x.attach(),fresh=A.createFormalNormalFixture(E),before=fresh.state(),old=x.flow._app;
  assert.equal(fresh.app.stateGeneration,old.stateGeneration);x.flow._app=fresh.app;
  try{assert.equal(run.decide(x.context).decision.kind,'blocked');assert.deepEqual(fresh.state(),before);assert.equal(fresh.app.saveBlocked,false);}
  finally{x.flow._app=old;}
  assert.equal(run.decide(x.context).decision.kind,'blocked','retired coordinator cannot revive when the old App returns');
});
test('a trusted Session restore retires the same-App coordinator rather than treating the new observation epoch as busy',async t=>{
  const x=await owned(t),run=x.attach(),cp=x.session._checkpoint(),before=x.fixture.state();
  await x.session._restoreCheckpoint(cp);const out=run.decide(x.context);
  assert.equal(out.decision.kind,'blocked');assert.match(out.decision.reason,/observation generation retired/);
  assert.deepEqual(x.fixture.state(),before);assert.equal(x.context.intentIndex,0);
});
