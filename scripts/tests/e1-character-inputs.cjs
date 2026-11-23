'use strict';
// Formal E1 input admission only. Standalone legacy profile defaults are unchanged.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const H=require('../headless-regression-binding.cjs');
const ROOT=fs.realpathSync(path.resolve(__dirname,'../..'));
const KEYS=['PF_FIELD_MOVE_APP_OUT','PF_E2_PARENT_OUT','PF_FIELD_MOVE_APP_BUNDLE','PF_E2_PARENT_ENGINE','PF_MZ_RUNTIME_OBJECTS','PF_MZ_BATTLE_SOURCE','PF_MZ_BATTLE_COMPILED','PF_FISHING_HOST_OUT','PF_MZ_OBJECTS','PF_E3_JOINT_OUT'];
const STALE=['PF_FISHING_APP_OUT','PF_FISHING_COMPOSED_OUT','PF_E1_PARENT_OUT','PF_E1_PARENT_ENGINE','PF_SHORTCUT_UI_BUNDLE','PF_SHORTCUT_UI_OUT','PF_D_NOTICE_BUNDLES','PF_D_MZ_COMPILER_ROOT','PF_D_MZ_ART'];
const EMITTED=['plugins/world/fishing-host.js','framework/rules/fishing.js','plugins/host-input.js','plugins/world/fishing-character-mz.js','plugins/world/fishing-messages.js'];
function desired(root,captured){
 assert.equal(fs.realpathSync(root),ROOT,'foreign character checkout');
 const actual=H.capture(ROOT,process.env.PF_HEADLESS_REGRESSION_BINDING,captured.sha256);
 assert.deepEqual(captured.binding,actual.binding,'foreign character parent binding');
 assert.deepEqual(captured.identity,actual.identity,'foreign character source identity');
 // H.capture verifies own cGenerationSupport, its complete strict output inventory,
 // Node/tool/source hashes and native pins before any profile/helper/product load.
 H.boundFiles(actual,['scripts/tests/e1-character-inputs.cjs','experiments/step5/5/regular-field-action-test-runtime.cjs','experiments/step5/5/fishing-host-fixtures.cjs','experiments/step5/5/ui-wire-e3-fixtures.cjs']);
 const parent=path.join(ROOT,actual.binding.cGenerationSupport.parent.directory),typed=path.join(parent,'out/src');
 for(const name of EMITTED)assert(fs.lstatSync(path.join(typed,name)).isFile(),'missing bound character callee: '+name);
 return{PF_FIELD_MOVE_APP_OUT:typed,PF_E2_PARENT_OUT:path.join(parent,'out'),PF_FIELD_MOVE_APP_BUNDLE:path.join(parent,'bundles/field-move-operation.cjs'),PF_E2_PARENT_ENGINE:path.join(ROOT,'js/engine/build/production.cjs'),PF_MZ_RUNTIME_OBJECTS:path.join(ROOT,'js/reactor_objects.js'),PF_MZ_BATTLE_SOURCE:path.join(ROOT,'src/plugins/PS_BattleFlow.ts'),PF_MZ_BATTLE_COMPILED:path.join(ROOT,'js/plugins/PS_BattleFlow.js'),PF_FISHING_HOST_OUT:typed,PF_MZ_OBJECTS:path.join(ROOT,'js/reactor_objects.js'),PF_E3_JOINT_OUT:path.join(ROOT,'js/engine/build')};
}
function match(key,value,target){
 assert.equal(typeof value,'string','missing character input: '+key);
 assert.equal(path.resolve(value),target,'foreign character input: '+key);
 assert.equal(fs.realpathSync(value),fs.realpathSync(target),'foreign character realpath: '+key);
}
function rejectStale(env){for(const key of STALE)assert.equal(env[key],undefined,'stale character input refused: '+key);}
function environment(root,captured,env=process.env){
 rejectStale(env);
 const inherited=KEYS.filter(key=>env[key]!==undefined);
 assert(inherited.length===0||inherited.length===KEYS.length,'partial character input group');
 const wanted=desired(root,captured);
 for(const key of KEYS)if(env[key]!==undefined)match(key,env[key],wanted[key]);
 return wanted;
}
function prepare(root,captured){
 rejectStale(process.env);
 for(const key of KEYS)assert.equal(typeof process.env[key],'string','missing character input: '+key);
 const wanted=desired(root,captured);
 for(const key of KEYS)match(key,process.env[key],wanted[key]);
 // No default prepare/import/compiler can be reached before the full group passes.
 const runtime=require('../../experiments/step5/5/regular-field-action-test-runtime.cjs');
 const world=runtime.prepare('world-scene'),host=runtime.prepare('fishing-host');
 assert.equal(world.mode,'explicit','character world-scene must be explicit');
 assert.equal(host.mode,'explicit','character fishing-host must be explicit');
 return world;
}
module.exports={KEYS,STALE,EMITTED,environment,prepare};
