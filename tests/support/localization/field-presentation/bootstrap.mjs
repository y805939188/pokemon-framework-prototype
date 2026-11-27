import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..'),H=require(path.join(root,'scripts/headless-regression-binding.cjs'));
const captured=H.capture(root,process.env.PF_HEADLESS_REGRESSION_BINDING);
H.boundFiles(captured,require(path.join(root,'scripts/tests/final-production-inputs.json')).controlledInputs);
const {parent}=require(path.join(root,'scripts/tests/c-regular-runtime.cjs')).verify(root,captured.binding);
const expected={PF_FIELD_MOVE_APP_OUT:path.join(parent,'out/src'),PF_FIELD_MOVE_APP_BUNDLE:path.join(parent,'bundles/field-move-operation.cjs'),PF_E2_PARENT_OUT:path.join(parent,'out'),PF_E2_PARENT_ENGINE:path.join(root,'js/engine/build/production.cjs'),PF_MZ_RUNTIME_OBJECTS:path.join(root,'js/reactor_objects.js'),PF_MZ_BATTLE_SOURCE:path.join(root,'src/plugins/PS_BattleFlow.ts'),PF_MZ_BATTLE_COMPILED:path.join(root,'js/plugins/PS_BattleFlow.js')};
for(const[k,v]of Object.entries(expected)){assert.equal(process.env[k],undefined);process.env[k]=v;}
assert.equal(require(path.join(root,'tests/support/field/regular-field-action-test-runtime.cjs')).prepare('world-scene').mode,'explicit');
process.env.PF_FINAL_PRODUCTION_FAMILY='e2-current-frontends';
const own=path.dirname(fileURLToPath(import.meta.url)),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files=Object.fromEntries(fs.readdirSync(own).filter(f=>fs.statSync(path.join(own,f)).isFile()).map(f=>[f,hash(path.join(own,f))]));
const runtime=require(path.join(root,'scripts/tests/final-production-runtime.cjs'));await runtime.prepare();
require('node:test').after(()=>{runtime.verify();H.capture(root,process.env.PF_HEADLESS_REGRESSION_BINDING,captured.sha256);for(const[f,digest]of Object.entries(files))assert.equal(hash(path.join(own,f)),digest);fs.writeFileSync(path.join(process.env.PF_PRESENTATION_OUTPUT,'BOUND-INPUTS.json'),JSON.stringify({source:captured.identity.source,parentBindingSHA256:captured.sha256,explicitGroup:expected,ownFiles:files,postVerified:true},null,2)+'\n',{flag:'wx'});});
require('./test-presentation.cjs');
