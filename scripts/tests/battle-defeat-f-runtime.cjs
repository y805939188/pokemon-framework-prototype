'use strict';
// Only the existing regular binding can admit runtime inputs. No compiler, fallback
// builder, private author artifact, or independent plugin registry is created here.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{pathToFileURL}=require('node:url');
const H=require('../headless-regression-binding.cjs');
const inputs=require('./battle-defeat-f-inputs.json');
const root=fs.realpathSync(path.resolve(__dirname,'../..'));
let prepared,captured;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function pinnedNative(){
 const pin=JSON.parse(fs.readFileSync(path.join(root,'scripts/reactor-source-manifest.json'),'utf8'));
 const versions=fs.readFileSync(path.join(root,'scripts/versions.env'),'utf8');
 const version=name=>{const m=versions.match(new RegExp('^'+name+'="([^"\\n]+)"$','m'));assert(m,'missing project version '+name);return m[1];};
 assert.equal(pin.schema,1);assert.equal(pin.repository,version('REACTOR_REPO'));assert.equal(pin.commit,version('REACTOR_COMMIT'));
 for(const file of inputs.pinnedNativeFiles){
  const absolute=path.join(root,file);assert(fs.lstatSync(absolute).isFile(),'native input must be a regular file: '+file);
  assert.equal(sha(fs.readFileSync(absolute)),pin.runtime['runtime/'+file.slice(3)],'installed native input differs from project pin: '+file);
 }
 return {repository:pin.repository,commit:pin.commit,files:inputs.pinnedNativeFiles};
}
async function loadInputs(){
 if(!prepared)prepared=(async()=>{
  assert.equal(process.version,inputs.nodeVersion,'use the project Node 22.21.1');
  assert.equal(fs.realpathSync(process.env.H3_RUNTIME_ROOT||root),root,'regular source/runtime root must be the suite root');
  for(const name of ['PF_E3_JOINT_OUT','PF_E3_NATIVE_ROOT','PF_EVENT_ARTIFACT','PF_D_NOTICE_BUNDLES','PF_D_MZ_COMPILER_ROOT','PF_D_MZ_ART'])
   assert.equal(process.env[name],undefined,'private artifact override is not a regular input: '+name);
  captured=H.capture(root,process.env.PF_HEADLESS_REGRESSION_BINDING);
  const files=H.boundFiles(captured,[...inputs.controlledInputs,...inputs.pluginBundles]);
  const native=pinnedNative();
  const showdownSHA=require('../check-showdown-staging.cjs').checkShowdownStaging(root);
  assert.equal(showdownSHA,captured.identity.showdownSHA);
  const nativeObjects=path.join(root,'js/reactor_objects.js');
  if(process.env.PF_MZ_RUNTIME)assert.equal(fs.realpathSync(process.env.PF_MZ_RUNTIME),nativeObjects,'foreign native source refused');
  process.env.PF_MZ_RUNTIME=nativeObjects;
  const out=path.join(root,'js/engine/build'),stage=path.join(root,'js/engine/showdown');
  const E=require(path.join(root,inputs.runtimeEntry));
  // Data-only fixture graph, through the existing Node22 test source loader.
  // Do not require testing.cjs (its unrelated historical matrices are not inputs).
  require('./ts-source-loader.cjs');
  const T=await import(pathToFileURL(path.join(root,inputs.dataOnlySourceEntry)).href);
  const B={out,E,inventory:fs.readFileSync(path.join(root,'js/plugins/PS_Inventory.js'),'utf8'),world:fs.readFileSync(path.join(root,'js/plugins/PS_World.js'),'utf8'),flow:fs.readFileSync(path.join(root,'js/plugins/PS_BattleFlow.js'),'utf8')};
  const {fixture:joint,flush}=require('./battle-defeat-f-native.cjs').createNativeFixture({root,B});
  const parent=path.join(root,'build/headless-battle-defeat-f');fs.mkdirSync(parent,{recursive:true});
  const output=fs.mkdtempSync(path.join(parent,captured.binding.runId+'-'));
  fs.writeFileSync(path.join(output,'INPUT-BINDING.json'),JSON.stringify({scope:inputs.scope,parentBindingSHA256:captured.sha256,identity:captured.identity,files,native,sourceEntriesCoveredByDistributionFingerprint:inputs.sourceEntriesCoveredByDistributionFingerprint,sourceMode:inputs.sourceMode,saveObservations:inputs.saveObservations},null,2)+'\n');
  return {E,T,root,stage,joint,flush,artifactRoot:path.join(output,'observed-P01.json')};
 })();
 return prepared;
}
function verifyInputs(){
 if(captured)H.capture(root,process.env.PF_HEADLESS_REGRESSION_BINDING,captured.sha256);
}
module.exports={loadInputs,verifyInputs};
