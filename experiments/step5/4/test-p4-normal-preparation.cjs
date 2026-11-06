'use strict';
// Preparation/source wiring controls only: real App/Session/compiled Scene in an isolated Node VM.
// Never executes F100, old replay, D1 benchmark, qualification Python, NW or host process inspection.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {compile}=require('./normal-preparation-test-support.cjs'),E=require('../../../js/engine/build/production.cjs');
const {createVictoryDriverHost}=require('./victory-music-driver-host.cjs'),PLAN=require('./victory-music-native-plan.json');
let h,A,tools;
const req=id=>id==='./js/engine/build/production.cjs'?E:require(id);
test.before(async()=>{h=await compile();A=h.api;tools=A.createReviewedNormalTools(require);});
test.after(()=>h?.close());
const plain=v=>JSON.parse(JSON.stringify(v));
function entry(argv,nodeRequire=()=>{throw Error('unexpected require');}){
  const focus=()=>false,play=()=>{},update=()=>{},W={PSEvolution:{automatic:true}},G={window:W,nw:{App:{argv}},require:nodeRequire,
    SceneManager:{isGameActive:focus,update},AudioManager:{playBgm:play},setTimeout(){throw Error('unexpected timer');}};
  vm.createContext(G);let error;
  try{vm.runInContext(h.entryText,G,{filename:'compiled-normal-entry.js'});}catch(e){error=e;}
  assert.equal(W.PSEvolution.automatic,true);assert.equal(G.SceneManager.isGameActive,focus);assert.equal(G.SceneManager.update,update);assert.equal(G.AudioManager.playBgm,play);
  return {G,W,error};
}
test('compiled inactive, unsupported and ambiguous routes cannot install legacy hooks',()=>{
  assert.equal(entry([]).error,undefined);
  for(const argv of [['--ps-flow-test=unknown'],['--ps-flow-test='],['--ps-flow-test=d2-normal-f100','--ps-flow-test=all']])assert.match(String(entry(argv).error),/unsupported|ambiguous/);
});
test('explicit legacy allowlist exactly preserves root dispatcher modes without running any',()=>{
  const text=fs.readFileSync(path.join(h.ROOT,'src/plugins/PS_BattleFlowTest.ts'),'utf8'),dispatch=text.slice(text.indexOf('try { if(mode ==='));
  assert(dispatch.length<30000&&dispatch.includes('runAll'));
  const expected=[...new Set(['all',...dispatch.matchAll(/mode\s*===?\s*["']([^"']+)["']/g)].map(x=>typeof x==='string'?x:x[1]))].sort();
  assert.deepEqual([...A.LEGACY_FLOW_MODES].sort(),expected);
  for(const m of expected)assert.deepEqual(A.classifyFlowTestRoute(['--ps-flow-test='+m]),{kind:'legacy',mode:m});
});
test('normal execution without an offline stage blocks before require or host changes',()=>{
  const r=entry(['--ps-flow-test=d2-normal-f100']);assert.equal(r.error,undefined);assert.equal(r.W.PSNormalD2.status,'BLOCKED_BEFORE_EXECUTION');
  assert.equal(r.W.PSNormalD2.nativeAdmission,false);assert.equal(r.W.PSNormalD2.actualBattles,0);assert.equal(r.W.PSNormalD2.actualTrace,null);
});
test('bundled reviewed tools work away from author source and load only three builtins',()=>{
  const seen=[],old=process.cwd();process.chdir(h.work);
  try{
    const t=A.createReviewedNormalTools(id=>{seen.push(id);return require(id);}),policy=t.compileNavigation();
    assert.deepEqual(seen,['node:crypto','node:path','node:vm']);assert.equal(policy.cases.length,100);
    assert.equal(policy.status,'CONCRETE_POLICY_BINDINGS_PENDING_NOT_EXECUTABLE');assert.equal(policy.actualBattles,0);
    assert(policy.cases.every((x,i)=>x.id==='F100-'+String(i+1).padStart(3,'0')&&x.qualifiedDeadlineMs===null&&x.resolvedNormalActions===null));
    assert.equal(t.donorHash,'93507d4bca39de181c462158240b87691fea1b09588d10494ad9c6692425ec4e');
    const detached=A.normalDonorInput();detached.cases[0].seed[0]=999;assert.equal(t.compileNavigation().cases[0].seed[0],1);
    assert.equal(typeof t.NormalDriver,'function');assert.equal(typeof t.installGameFrames,'function');
  }finally{process.chdir(old);}
});
test('compiled offline entry constructs owned formal fixture only, with zero inputs and no host attachment',()=>{
  const r=entry(['--ps-flow-test=d2-normal-f100','--ps-d2-normal-stage=offline-prepare'],req);assert.equal(r.error,undefined);
  const out=r.W.PSNormalD2;assert.equal(out.status,'OFFLINE_PREPARED_EXECUTION_BLOCKED');assert.equal(out.policyCases,100);
  for(const key of ['nativeAdmission','P4Acceptance','stateHostAttached','normalDriverInstalled','actualInputSent'])assert.equal(out[key],false,key);
  assert.equal(out.fixture.engineWallClock,'NOT_INSTALLED');assert.equal(out.actualBattles,0);assert.equal(out.finalPair,null);assert.equal(out.qualifiedDeadline,null);
  assert.equal(r.G.$gameSystem,undefined);
});
test('offline route rejects partial legacy selectors, unknown or duplicate stages before work',()=>{
  for(const tail of [['--ps-d1-count=1','--ps-d2-normal-stage=offline-prepare'],['--ps-flow-only=T1','--ps-d2-normal-stage=offline-prepare'],['--ps-d2-normal-stage=execute'],['--ps-d2-normal-stage=offline-prepare','--ps-d2-normal-stage=offline-prepare']])
    assert.match(String(entry(['--ps-flow-test=d2-normal-f100',...tail]).error),/partial|unsupported|ambiguous/);
});
test('formal fixture is a production GameApplication with exact authored initial boundaries',()=>{
  const f=A.createFormalNormalFixture(E),s=f.state();assert(f.app instanceof E.app.GameApplication);assert.equal(f.app.saveBlocked,false);
  assert.deepEqual(s.party.map(m=>m.id),['P1','P2']);assert.equal(s.money,100000);assert(s.badges.every(Boolean));
  for(const m of s.party){assert.equal(m.level,50);assert.equal(m.item,'oranberry');assert.deepEqual(m.moves.map(x=>x.id),['payday','splash','memento','roost']);}
  assert.equal(s.party[1].hp,1);assert.equal(s.party[1].exp,E.growth.minExp('slow',51)-1);
  assert.deepEqual(f.describe().receivingProfile,{mode:1,naming:1});assert.equal(f.describe().presentation.fast,false);assert.equal(f.describe().presentation.battleEffects,true);
  assert.equal(f.worldDraws(),0);assert.deepEqual(E.saveSchema.validateGameContent(s,f.content),[]);s.party[0].hp=0;assert(f.state().party[0].hp>0);
});
test('authored setup uses actual App healing and declared inventory/HP writes without opening a battle',()=>{
  const f=A.createFormalNormalFixture(E),initial=f.state();const a=f.prepareCase('F100-001');assert.deepEqual(a.before,initial);assert.equal(a.battleStartedByThisCall,false);
  const b=f.prepareCase('F100-004');assert.equal(b.case.kind,'trainer-loss-D3');assert.equal(b.after.party[1].hp,0);assert(b.after.party[0].hp>initial.party[0].hp);
  const c=f.prepareCase('F100-005');assert(c.after.party[1].hp>0);assert.deepEqual(c.seed,c.case.seed);assert.equal(f.app.saveBlocked,false);assert.equal(f.worldDraws(),0);
  assert.throws(()=>f.prepareCase('UNKNOWN'),/unknown authored/);
});
test('prepared first trainer admission applies the exact owned pre-input HP recipe, then aborts without actions/results',async()=>{
  const f=A.createFormalNormalFixture(E);await assert.rejects(f.startPreparedBattle(),/prepared idle/);const setup=f.prepareCase('F100-003');let opened;
  try{
    opened=await f.startPreparedBattle();assert.equal(opened.battleSetup,'engine.p2.firstMember.hp=1');
    assert.equal(opened.session.battleId,'F100-003');assert.equal(opened.session.gw.readState('p2')[0].hp,1);
    assert.deepEqual(f.state(),setup.after);assert.deepEqual(Object.keys(f.state().appliedBattles),[]);
    await assert.rejects(f.startPreparedBattle(),/prepared idle/);
  }finally{if(opened)f.app.abortBattle(opened.request,Error('owned admission-only fixture control cleanup'));}
  assert.equal(f.app.saveBlocked,false);assert.deepEqual(f.state(),setup.after);
  await assert.rejects(f.startPreparedBattle(),/prepared idle/);
});
test('formal fixture preserves required production factory authority through real trainer admission and AI turn',async()=>{
  const f=A.createFormalNormalFixture(E),before=f.state();
  // A single renamed, aborted source control, never an F100 run or measured trace.
  const request={battleId:'owned-normal-formal-trainer-control',seq:1,kind:'trainer',trainer:{id:'d1-win',version:1},canLose:true};
  let session;
  try {
    session=await f.app.startTrainerBattle(request);assert.equal(f.app.saveBlocked,true);assert(session instanceof E.session.BattleSession);
    assert.equal(session.currentRequest().active[0].moves[1].id,'splash');await session.chooseMove(2);
    assert.equal(session.finished,false);assert.equal(session.currentRequest().active[0].moves[1].id,'splash');
    assert.throws(()=>f.prepareCase('F100-001'),/active operation/);assert.deepEqual(f.state(),before);
  }finally{f.app.abortBattle(request,Error('owned formal source control cleanup'));}
  assert.equal(f.app.saveBlocked,false);assert.deepEqual(f.state(),before);
});
test('explicit isolated attachment restores previous host identities and retires old state ports',()=>{
  const oldGame={old:true},oldApp={saveBlocked:false},flow={_app:oldApp,fast:true,lang:'zh',setLanguage(x){this.lang=x;this._tr=null;},projectOutcome(){throw Error('unexpected projection');}},G={$gameSystem:{_psGame:oldGame}},W={PSFlow:flow};
  const f=A.installNormalHostFixture(E,G,W);assert(f.app instanceof E.app.GameApplication);assert.equal(flow.fast,false);assert.equal(flow.lang,'en');assert.notEqual(G.$gameSystem._psGame,oldGame);
  f.prepareCase('F100-001');assert.equal(flow._app,f.app);f.restore();assert.equal(G.$gameSystem._psGame,oldGame);assert.equal(flow._app,oldApp);assert.equal(flow.fast,true);assert.equal(flow.lang,'zh');
  assert.throws(()=>f.prepareCase('F100-002'),/retired/);
});
test('isolated fixture refuses active host and changed host generation',()=>{
  assert.throws(()=>A.installNormalHostFixture(E,{$gameSystem:{}},{PSFlow:{running:true}}),/idle/);
  const G={$gameSystem:{}},flow={setLanguage(){},projectOutcome(){}},f=A.installNormalHostFixture(E,G,{PSFlow:flow});
  f.app.stateReplacedByHost();assert.throws(()=>f.prepareCase('F100-001'),/owner changed/);
});
test('isolated state-port ownership rejects raw replacement and restores absence of old state exactly',()=>{
  const make=()=>{const G={$gameSystem:{}},flow={setLanguage(){},projectOutcome(){}};return {G,flow,f:A.installNormalHostFixture(E,G,{PSFlow:flow})};};
  const a=make();a.f.restore();assert.equal(Object.hasOwn(a.G.$gameSystem,'_psGame'),false);
  const b=make();b.G.$gameSystem._psGame={foreign:true};assert.throws(()=>b.f.prepareCase('F100-001'),/owner changed/);assert.throws(()=>b.f.restore(),/owner changed/);assert.deepEqual(b.G.$gameSystem._psGame,{foreign:true});
});
async function force(t){
  const host=createVictoryDriverHost({...h,driverText:'SYNTHETIC_UNUSED',PLAN,options:{productionTranslator:true}}),flow=host.w.flow;
  const content=h.music.musicNativeContent(E,assert),game=E.state.newGame({content,party:[],money:1000});
  game.party=['P2','P1','P3'].map(id=>E.speciesKey.toPersistentMember(E.memberFactory.createMember({id,species:'Snorlax',level:50},content,()=>0),content));
  for(const m of game.party)m.moves=[{id:'memento',pp:10,maxpp:10},{id:'splash',pp:40,maxpp:40}];game.nextMemberOrdinal='4';
  flow.stateReplaced();flow._app=null;flow._content=content;flow._dex=E.dex.createDexLookup();flow.setLanguage('en');flow.seed=[1,2,3,4];flow.rng=()=>0;flow.fast=false;host.G.$gameSystem._psGame=game;
  await host.p.toMapId(5);flow.app();const before=JSON.stringify(flow.game());
  flow.openBattle({kind:'wild',battleId:'owned-normal-source-control',seq:1,foes:[{species:'pidgey',level:50}],expGain:false,battleEffects:true});
  await host.p.inMode('main');const scene=host.p.battle(),session=scene._session;scene.act(()=>session.chooseMove(1),'move');
  await host.p.inMode('wild-faint');await host.frames(2);scene._menu.select(0);scene.onMenuOk();await host.p.inMode('party-forced');await host.frames(2);
  t.after(()=>flow.abort(Error('owned normal-source control cleanup')));
  const binding=A.bindNormalBattle(tools,E,host.G,host.G,{gameTick:()=>host.G.Graphics.frameCount});
  const plan={id:session.battleId,policy:[{kind:'moveUntilEnd',move:'splash',legacyMenuKey:1}],expected:{code:1}},context={caseId:session.battleId,intentIndex:0};
  return {...host,flow,scene,session,before,binding,plan,context};
}
async function selectP1(x){const i=x.scene._menu._items.findIndex(x=>x.ext==='P1');assert(i>=0);x.scene._menu.select(i);x.scene.onMenuOk();await x.p.inMode('party-command');await x.frames(2);}
test('actual App→Session→Scene source feeds bundled navigation across forced two-layer selection',async t=>{
  const x=await force(t),first=x.binding.decide(x.plan,x.context);assert.deepEqual(first.decision,{kind:'choose',phase:'party-forced',key:'P1'});
  assert.equal(first.snapshot.forcedRequestToken,E.session.readSessionRequestContext(x.session).source.occurrenceId);assert.equal(first.context.intentIndex,0);
  await selectP1(x);const second=x.binding.decide(x.plan,{...first.context,forcedReplacement:{forged:true}});
  assert.deepEqual(second.decision,{kind:'choose',phase:'party-command',key:'switch-in'});assert.equal(second.context.forcedReplacement.memberId,'P1');assert.equal(second.context.intentIndex,0);
  assert.equal(JSON.stringify(x.flow.game()),x.before,'observations/navigation do not submit an action or write persistent state');
  assert.throws(()=>x.binding.decide({...x.plan,id:'wrong'},x.context),/case\/session mismatch/);
});
test('skipped first layer cannot be authorized by a caller-supplied forced continuation',async t=>{
  const x=await force(t);await selectP1(x);const snapshot=x.binding.read();
  assert.throws(()=>x.binding.decide(x.plan,{...x.context,forcedReplacement:{caseId:x.plan.id,intentIndex:0,memberId:'P1',ownerToken:snapshot.ownerToken,requestToken:snapshot.forcedRequestToken}}),/source unavailable/);
  assert.equal(x.session.gw.activeId('p1'),'P2');
});
test('real restore retires bound normal owner even while logical forced source is preserved',async t=>{
  const x=await force(t),old=x.binding.decide(x.plan,x.context).snapshot,cp=x.session._checkpoint();await x.session._restoreCheckpoint(cp);
  assert.equal(x.scene.requestObservationState().source.occurrenceId,old.forcedRequestToken);assert.equal(x.binding.read().current,false);
  assert.throws(()=>x.binding.decide(x.plan,x.context),/owner retired/);assert.equal(x.context.intentIndex,0);
});
test('restore starting between adapter snapshot and source sample cannot authorize the old normal decision',async t=>{
  const x=await force(t),cp=x.session._checkpoint(),menu=x.scene._menu,old=menu.maxCols;let calls=0,pending;
  menu.maxCols=function(){if(++calls===3)pending=x.session._restoreCheckpoint(cp);return old.call(this);};
  try{assert.throws(()=>x.binding.decide(x.plan,x.context),/source unavailable|owner retired/);assert(pending);}
  finally{menu.maxCols=old;if(pending)await pending;}
  assert.equal(x.binding.read().current,false);assert.equal(x.context.intentIndex,0);
});
