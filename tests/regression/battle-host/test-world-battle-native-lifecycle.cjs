'use strict';
require('../../support/field/regular-field-action-test-runtime.cjs').prepare('world-scene');
// App-only controlled issuer units; the full production constructor proof remains the separate joint suite.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm'),{types}=require('node:util');
const {fixture}=require('../../support/field/field-move-real-parent-fixtures.cjs');
const {installNativePhase}=require('../../support/battle-host/world-battle-native-phase-fixture.cjs');
const {createWorldBattleSceneMZ}=require(path.join(process.env.PF_E2_PARENT_OUT,'src/plugins/world/world-battle-scene-mz.js'));
const {createMZAtomicStatePort}=require(path.join(process.env.PF_E2_PARENT_OUT,'src/plugins/world/atomic-state-mz.js'));
for(const native of ['map','player','scene'])test('source native '+native+' changed after admission refuses before any factory',async()=>{
 let calls=0,retired=0;const h=fixture({moveId:'rocksmash',sessions:{async create(){calls++;return {};},retire(){retired++;}}}),r=await h.run();
 if(native==='scene')h.root.SceneManager._scene=new h.root.Scene_Map();else{const key=native==='map'?'$gameMap':'$gamePlayer';h.root[key]=Object.assign(Object.create(Object.getPrototypeOf(h.root[key])),h.root[key]);}
 await assert.rejects(h.app.startAdmittedWorldBattle(r.admission),/native-source-changed|owned-scene-required/);assert.equal(calls,0);assert.equal(retired,0);assert.equal(h.state.stats.rock_smash_battles,0);assert.equal(h.state.stats.rock_smash_count,1);assert.equal(h.app.saveBlocked,false);
});
for(const native of ['map','player','scene'])test('factory cannot bless replacement '+native+' by returning an otherwise valid handle',async()=>{
 let h,retired=0;h=fixture({moveId:'rocksmash',sessions:{async create(){if(native==='scene')h.root.SceneManager._scene=new h.root.Scene_Map();else{const key=native==='map'?'$gameMap':'$gamePlayer';h.root[key]=Object.assign(Object.create(Object.getPrototypeOf(h.root[key])),h.root[key]);}return {};},retire(){retired++;}}});const r=await h.run();await assert.rejects(h.app.startAdmittedWorldBattle(r.admission),/native-lifecycle-changed/);assert.equal(retired,1);assert.equal(h.state.stats.rock_smash_battles,0);assert.equal(h.state.stats.rock_smash_count,1);assert.equal(h.app.saveBlocked,false);
});

test('App-only controlled initialize/create/begin and ticket leaf authorize the pre-factory Scene transition',async()=>{
 let port,creates=0;const bridge={assertCurrent(admission,scene){port.assertCurrent(admission,scene);}},h=fixture({moveId:'rocksmash',worldBattleScene:bridge,sessions:{async create(){creates++;assert.equal(h.root.SceneManager._scene._psOp,h.root.PSFlow._op);return {};}}});const native=installNativePhase(h,()=>createWorldBattleSceneMZ(h.root,types.isProxy));port=native.port;const r=await h.run();assert.equal(native.flow.openAdmittedWorldBattle(h.app,r.admission),true);await native.opening;assert.equal(creates,1);assert.equal(native.starts,0,'actual P.start is not required before the create-stage factory');assert.equal(h.state.stats.rock_smash_battles,1);h.app.abortAdmittedWorldBattle(r.admission,'done');assert.equal(h.app.saveBlocked,false);
});
test('copied scene marker/op do not obtain the controlled leaf scene binding',async()=>{
 let port,creates=0;const h=fixture({moveId:'rocksmash',worldBattleScene:{assertCurrent(a,s){port.assertCurrent(a,s);}},sessions:{async create(){creates++;return {};}}});const native=installNativePhase(h,()=>createWorldBattleSceneMZ(h.root,types.isProxy));port=native.port;const r=await h.run(),op={worldAdmission:r.admission};Object.assign(native.flow,{_op:op,running:true});h.root.SceneManager._scene={_psBattle:true,_psOp:op};await assert.rejects(h.app.startAdmittedWorldBattle(r.admission),/world-battle-scene-stale/);assert.equal(creates,0);assert.equal(h.app.saveBlocked,false);assert.equal(h.state.stats.rock_smash_battles,0);
});
test('owned stage callback replacement cannot clear the newer generation battle',async()=>{
 let h,next;h=fixture({moveId:'rocksmash',worldBattleScene:{assertCurrent(){h.replaceGeneration();next=h.app.startBattle({battleId:'successor',kind:'wild',foes:[{species:'A',level:5}],seq:0});}}});const r=await h.run();await assert.rejects(h.app.startAdmittedWorldBattle(r.admission),/start-lifecycle-changed/);await next;assert.equal(h.app.op.battleId,'successor');assert(h.app.saveBlocked);assert.equal(h.state.stats.rock_smash_battles,0);h.app.abortBattle({battleId:'successor'},Error('done'));
});
test('foreign already bound handle is never retired by a rejected factory owner',async()=>{
 const handle={},first=fixture({moveId:'rocksmash',sessions:{async create(){return handle;}}}),r1=await first.run();await first.app.startAdmittedWorldBattle(r1.admission);let retired=0;const second=fixture({moveId:'rocksmash',sessions:{async create(){return handle;},retire(){retired++;}}}),r2=await second.run();await assert.rejects(second.app.startAdmittedWorldBattle(r2.admission),/already-bound/);assert.equal(retired,0);assert.equal(first.app.op.session,handle);assert.equal(first.state.stats.rock_smash_battles,1);assert.equal(second.state.stats.rock_smash_battles,0);assert.equal(second.app.saveBlocked,false);first.app.abortAdmittedWorldBattle(r1.admission,'done');
});
for(const interruption of ['abort','generation'])test('late unique factory handle is retired once after '+interruption+' without clearing a successor',async()=>{
 let resolve,retired=0,next;const waiting=new Promise(done=>{resolve=done;}),handle={},h=fixture({moveId:'rocksmash',sessions:{async create(request){if(request.battleId==='successor')return {};return waiting;},retire(actual){if(actual===handle)retired++;}}}),r=await h.run(),opening=h.app.startAdmittedWorldBattle(r.admission);await h.flush();
 if(interruption==='abort')h.app.abortAdmittedWorldBattle(r.admission,'before-late-factory');else{h.replaceGeneration();next=h.app.startBattle({battleId:'successor',kind:'wild',foes:[{species:'A',level:5}],seq:0});await next;}
 resolve(handle);await assert.rejects(opening,/aborted|late session/);assert.equal(retired,1);assert.equal(h.state.stats.rock_smash_battles,0);assert.equal(h.state.stats.rock_smash_count,1);if(next){assert.equal(h.app.op.battleId,'successor');assert(h.app.saveBlocked);h.app.abortBattle({battleId:'successor'},Error('done'));}else assert.equal(h.app.saveBlocked,false);
});
test('native lifecycle snapshot is descriptor-only and never calls legacy state providers',()=>{
 let reads=0;function SceneManager(){}SceneManager._scene={};const root={$gameMap:{_mapId:7},$gamePlayer:{},SceneManager,$gameSystem:{_psGame:{}}},port=createMZAtomicStatePort(root,{read(){reads++;throw Error('must not read state');},replace(){assert.fail('replace');}},types.isProxy),life=port.worldLifecycle();assert.equal(reads,0);assert.equal(life.map,root.$gameMap);assert.equal(life.player,root.$gamePlayer);assert.equal(life.scene,SceneManager._scene);let getters=0;Object.defineProperty(SceneManager,'_scene',{get(){getters++;return {};}});assert.throws(()=>port.worldLifecycle(),/atomic-state-data-slot-required/);assert.equal(getters,0);
});
