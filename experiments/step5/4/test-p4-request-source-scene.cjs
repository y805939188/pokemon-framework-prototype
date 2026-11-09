'use strict';
// Actual App/Session and compiled Scene; controlled Node host, not NW/input/rendering/trace/performance qualification.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..'),E=require('../../../js/engine/build/production.cjs');
const {createVictoryDriverHost}=require('./victory-music-driver-host.cjs'),PLAN=require('./victory-music-native-plan.json');
let work,plugins,entryText,fixture,observer;
test.before(async()=>{
  work=fs.mkdtempSync(path.join(os.tmpdir(),'pf-request-source-scene-'));plugins={};
  for(const name of ['PS_BattleFlow','PS_SaveState','PS_Evolution','PS_BattleFlowTest']){
    const out=path.join(work,name),r=spawnSync(process.execPath,[path.join(ROOT,'src/node_modules/vite/bin/vite.js'),'build','--configLoader','runner','--outDir',out],{cwd:path.join(ROOT,'src'),env:{...process.env,RR_PLUGIN:name},encoding:'utf8'});
    assert.equal(r.status,0,r.stdout+r.stderr);const text=fs.readFileSync(path.join(out,name+'.js'),'utf8');if(name==='PS_BattleFlowTest')entryText=text;else plugins[name]=text;
  }
  const vite=require(require.resolve('vite',{paths:[path.join(ROOT,'src')]}));
  for(const[name,source]of [['fixture','src/plugins/flowtest/music-native-fixture.ts'],['observer','src/plugins/flowtest/forced-request-observer.ts']])
    await vite.build({configFile:false,root:ROOT,logLevel:'error',build:{outDir:path.join(work,name),emptyOutDir:false,minify:false,lib:{entry:path.join(ROOT,source),formats:['cjs'],fileName:()=> 'entry.cjs'}}});
  fixture=require(path.join(work,'fixture/entry.cjs'));observer=require(path.join(work,'observer/entry.cjs'));
});
test.after(()=>{if(work)fs.rmSync(work,{recursive:true,force:true});});
async function host(t){
  const h=createVictoryDriverHost({ROOT,work,plugins,entryText,driverText:'SYNTHETIC_UNUSED',PLAN,options:{productionTranslator:true}}),flow=h.w.flow;
  const content=fixture.musicNativeContent(E,assert),game=E.state.newGame({content,party:[],money:1000});
  game.party=[1,2,3].map(n=>E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:'P'+n,species:'Snorlax',level:50},content,()=>0),content));
  for(const m of game.party)m.moves=[{id:'memento',pp:10,maxpp:10},{id:'splash',pp:40,maxpp:40}];game.nextMemberOrdinal='4';
  flow.stateReplaced();flow._app=null;flow._content=content;flow._dex=E.dex.createDexLookup();flow.setLanguage('en');flow.seed=[1,2,3,4];flow.rng=()=>0;flow.fast=false;h.G.$gameSystem._psGame=game;
  await h.p.toMapId(5);flow.app();const before=JSON.stringify(flow.game());
  flow.openBattle({kind:'wild',battleId:'source-scene',seq:1,foes:[{species:'pidgey',level:50}],expGain:false,battleEffects:true});
  await h.p.inMode('main');const scene=h.p.battle(),session=scene._session;
  // Real public player action; normal Scene presents its actual returned messages.
  scene.act(()=>session.chooseMove(1),'move');
  await h.p.inMode('wild-faint');await h.frames(2);scene._menu.select(0);scene.onMenuOk();await h.p.inMode('party-forced');await h.frames(2);
  t.after(()=>flow.abort(Error('owned request-source test cleanup')));
  return {...h,flow,scene,session,before};
}
const intent=()=>({caseId:'owned-source-case',intentIndex:2,memberId:'P2'});
async function selectP2(h){const index=h.scene._menu._items.findIndex(i=>i.ext==='P2');assert(index>=0);h.scene._menu.select(index);h.scene.onMenuOk();await h.p.inMode('party-command');await h.frames(2);}

test('actual App→Session→compiled Scene atomically carries source/owner/epoch and actual two-layer selection',async t=>{
  const h=await host(t),i=intent(),o=observer.createForcedSelectionObserver(()=>h.G.SceneManager._scene);
  const a=o.sample(i);assert.equal(a.status,'selection');assert.equal(a.snapshot.partySub,'forced');assert.equal(a.snapshot.fast,false);assert.equal(a.snapshot.effects,true);
  assert.deepEqual(JSON.parse(JSON.stringify(a.snapshot.request)),h.session.currentRequest());assert.equal(a.snapshot.source.occurrenceId,E.session.readSessionRequestContext(h.session).source.occurrenceId);
  await selectP2(h);const b=o.sample(i);assert.equal(b.status,'confirmation');assert.equal(b.snapshot.selectedMemberId,'P2');assert.equal(b.continuation.intentIndex,2);assert.equal(i.intentIndex,2,'input and observation never advance business intent');
  assert.equal(b.snapshot.ownerToken,a.snapshot.ownerToken);assert.equal(b.snapshot.source.occurrenceId,a.snapshot.source.occurrenceId);
  const index=h.scene._menu._items.findIndex(x=>x.ext==='switch-in');h.scene._menu.select(index);h.scene.onMenuOk();await h.p.inMode('main');
  assert.equal(h.session.gw.activeId('p1'),'P2');assert.equal(h.scene.requestObservationState().status,'none');assert.equal(JSON.stringify(h.flow.game()),h.before,'no persistent replacement before result commit');
});
test('same Scene/App after internal restore has a new observer owner; old continuation cannot confirm',async t=>{
  const h=await host(t),i=intent(),o=observer.createForcedSelectionObserver(()=>h.G.SceneManager._scene);
  const a=o.sample(i);await selectP2(h);assert.equal(o.sample(i).status,'confirmation');const cp=h.session._checkpoint();
  await h.session._restoreCheckpoint(cp);const b=h.scene.requestObservationState();
  assert.equal(b.source.occurrenceId,a.snapshot.source.occurrenceId);assert(b.requestViewEpoch>a.snapshot.requestViewEpoch);assert.notEqual(b.ownerToken,a.snapshot.ownerToken);
  assert.equal(o.sample(i).status,'blocked');
  h.scene.onMenuCancel();await h.p.inMode('party-forced');assert.equal(o.sample(i).status,'selection');await selectP2(h);assert.equal(o.sample(i).status,'confirmation');
});
test('cancel/reopen same occurrence retires previous menu cause; a fresh observed selection is required',async t=>{
  const h=await host(t),i=intent(),o=observer.createForcedSelectionObserver(()=>h.G.SceneManager._scene);const a=o.sample(i);
  await selectP2(h);const first=o.sample(i);assert.equal(first.status,'confirmation');
  h.scene.onMenuCancel();await h.p.inMode('party-forced');await h.frames(2);await selectP2(h);
  assert.equal(h.scene.requestObservationState().source.occurrenceId,a.snapshot.source.occurrenceId);
  assert.equal(o.sample(i).status,'blocked','cannot skip observing the intervening first layer');
  h.scene.onMenuCancel();await h.p.inMode('party-forced');assert.equal(o.sample(i).status,'selection');await selectP2(h);assert.equal(o.sample(i).status,'confirmation');
});
test('changed case/intent/member and retired App/Scene block strict observer without mutating player state',async t=>{
  const h=await host(t),i=intent(),o=observer.createForcedSelectionObserver(()=>h.G.SceneManager._scene);o.sample(i);await selectP2(h);
  assert.equal(o.sample({...i,intentIndex:3}).status,'blocked');assert.equal(o.sample(i).status,'blocked');
  const before=JSON.stringify(h.flow.game());h.flow.stateReplaced();assert.equal(h.scene.requestObservationState().status,'unavailable');assert.equal(o.sample(i).status,'blocked');assert.equal(JSON.stringify(h.flow.game()),before);
});
test('atomic Session view with unavailable source blocks only observer; legacy Scene/input and real player switch still work',async t=>{
  const h=await host(t),original=h.session._evidence.restore,cp=h.session._checkpoint();
  h.session._evidence.restore=()=>{throw Error('controlled external restore failure');};
  await assert.rejects(h.session._restoreCheckpoint(cp),/controlled external restore failure/);h.session._evidence.restore=original;
  assert.equal(h.scene.requestObservationState().status,'unavailable');assert.equal(h.scene.inputState().ready,true);
  await selectP2(h);const index=h.scene._menu._items.findIndex(x=>x.ext==='switch-in');h.scene._menu.select(index);h.scene.onMenuOk();await h.p.inMode('main');assert.equal(h.session.gw.activeId('p1'),'P2');
});
test('menu projection triggering actual restore synchronously cannot publish the pre-restore Session context',async t=>{
  const h=await host(t),before=h.scene.requestObservationState(),cp=h.session._checkpoint(),menu=h.scene._menu,original=menu.maxCols;
  let pending;menu.maxCols=function(){menu.maxCols=original;pending=h.session._restoreCheckpoint(cp);return original.call(this);};
  try {const sampled=h.scene.requestObservationState();assert.equal(sampled.status,'unavailable');assert.equal(sampled.source,undefined);}
  finally {menu.maxCols=original;if(pending)await pending;}
  const after=h.scene.requestObservationState();assert.equal(after.status,'available');assert(after.requestViewEpoch>before.requestViewEpoch);assert.notEqual(after.ownerToken,before.ownerToken);
});
