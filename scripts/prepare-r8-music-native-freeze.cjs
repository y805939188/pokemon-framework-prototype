'use strict';
// Static only: never launches NW or creates a save/profile/run directory.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),PLAN=require('../experiments/step5/4/r8-music-native-plan.json'),CAPTURE=require('../experiments/step5/4/capture-me-native-plan.json');
const {manifest,canonical}=require('./prepare-capture-me-native-freeze.cjs');
const {oggTiming,DURATION_CONTRACT,PAGE_DURATION_US}=require('./prepare-music-native-assets.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),fileHash=p=>sha(fs.readFileSync(p));
const inside=(parent,child)=>{const p=path.relative(parent,child);return !!p&&!path.isAbsolute(p)&&p!=='..'&&!p.startsWith('..'+path.sep);};
function prepare(app,assets,runRoot,out){
 app=fs.realpathSync(app);assets=fs.realpathSync(assets);runRoot=path.resolve(runRoot);out=path.resolve(out);
 assert(!fs.existsSync(runRoot)&&!fs.existsSync(out),'new execution and freeze roots only');assert(!inside(app,runRoot)&&!inside(app,out),'outputs outside APP');
 for(const p of [runRoot,out])assert(!inside(app,path.join(fs.realpathSync(path.dirname(p)),path.basename(p))),'output parent cannot alias APP');
 const game=path.join(app,'Contents/Resources/app.nw'),info=JSON.parse(fs.readFileSync(path.join(game,'package-info.json'))),media=JSON.parse(fs.readFileSync(assets));
 assert.equal(info.withTests,true);assert.equal(info.workingTreeChanges,0);assert.match(info.gitHead,/^[a-f0-9]{40}$/);
 assert.equal(cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),info.gitHead);assert.equal(cp.execFileSync('git',['status','--porcelain','-uall'],{cwd:ROOT,encoding:'utf8'}).trim(),'');
 cp.execFileSync('git',['merge-base','--is-ancestor',PLAN.productCommit,info.gitHead],{cwd:ROOT});
 for(const[name,h]of Object.entries(PLAN.productPlugins))assert.equal(fileHash(path.join(game,'js/plugins',name+'.js')),h,'actual three-plugin R8 product');
 assert.equal(fileHash(path.join(game,'js/plugins/PS_BattleFlowTest.js')),fileHash(path.join(ROOT,'js/plugins/PS_BattleFlowTest.js')),'actual current R8 driver');
 for(const[p,h]of Object.entries(info.artifacts)){const f=path.join(game,p);assert(inside(game,path.resolve(f))&&inside(game,fs.realpathSync(f)),'runtime stays inside package');assert.equal(fileHash(f),h,'actual package runtime '+p);}
 assert.equal(media.version,CAPTURE.version);assert.equal(media.input,sha(Buffer.from(JSON.stringify(CAPTURE))));assert.equal(media.recipe,fileHash(path.join(ROOT,'scripts/prepare-capture-me-native-assets.cjs')));
 assert.equal(media.mediaQualificationVersion,3);assert.equal(media.pageDurationMicroseconds,PAGE_DURATION_US);
 const expected=CAPTURE.assets.map(r=>'audio/'+r.kind+'/'+CAPTURE.prefix+r.name+'.ogg').concat(CAPTURE.aliases.map(r=>r.path),CAPTURE.intentionalBadAsset);
 assert.deepEqual(media.files.map(r=>r.path).sort(),expected.sort());assert.equal(new Set(expected).size,expected.length);
 const assetDir=path.dirname(assets);
 for(const row of media.files){
  const actual=path.join(game,row.path),source=path.join(assetDir,row.path);
  assert(inside(game,path.resolve(actual))&&inside(game,fs.realpathSync(actual))&&inside(assetDir,fs.realpathSync(source)),'media within own package/source');
  assert.equal(fileHash(actual),row.sha256);assert.equal(fileHash(source),row.sha256);
  if(row.sourceWav){
   const wav=path.resolve(assetDir,row.sourceWav);assert(inside(assetDir,wav)&&inside(assetDir,fs.realpathSync(wav)),'source WAV stays within asset directory');assert.equal(fileHash(wav),row.sourceSHA256);assert.equal(row.durationContract,DURATION_CONTRACT);assert.equal(row.decodedFrames,row.containerFrames);
   assert.equal(row.probe.streams[0].codec_name,'vorbis');assert.equal(Number(row.probe.streams[0].sample_rate),CAPTURE.sampleRate);assert.equal(Number(row.probe.streams[0].channels),CAPTURE.encodedChannels);
   assert.deepEqual(row.nativeDurationRangeSeconds,[(row.containerFrames-2)/CAPTURE.sampleRate,(row.containerFrames+2)/CAPTURE.sampleRate]);
   const timing=oggTiming(fs.readFileSync(actual));assert(timing.audioPages.length>1&&!timing.audioPages[0].eos&&timing.audioPages[0].granule>0);assert.equal(timing.audioPages.at(-1).granule,row.containerFrames);assert.equal(timing.audioPayloadSHA256,row.packetTiming.audioPayloadSHA256);assert.equal(row.packetTiming.verified,true);
  }else assert.equal(row.path,CAPTURE.intentionalBadAsset);
 }
 for(const name of ['world','battle'])assert(media.files.some(r=>r.kind==='bgm'&&r.logicalName===PLAN.prefix+name));
 assert(!fs.existsSync(path.join(game,PLAN.intentionalMissingBgm)),'real missing battle BGM');
 const ids=PLAN.groups.flatMap(g=>g.ids);assert.deepEqual(ids,['R801','R802','R803','R804','R805','R806']);
 const input={version:PLAN.version,productCommit:PLAN.productCommit,productPlugins:PLAN.productPlugins,planSHA256:sha(Buffer.from(canonical(PLAN))),driverPluginSHA256:fileHash(path.join(game,'js/plugins/PS_BattleFlowTest.js')),packageHead:info.gitHead,chain:PLAN.version+'/'+sha(Buffer.from(runRoot)).slice(0,24),saveRoot:path.join(runRoot,'save'),assetsManifestSHA256:fileHash(assets),assets:media.files,scope:'R8-only supplement six cases; original ME15 package and acceptance remain separate; synthetic tones/programmatic inputs, no physical hearing claim'};
 const inputFile=path.join(out,'INPUT.json'),argv=['--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--mute-audio','--ps-sound','--ps-flow-quit','--ps-save-dir='+input.saveRoot,'--user-data-dir='+path.join(runRoot,'profile'),'--ps-r8-music-input='+inputFile,'--ps-flow-test=d2-r8-music','--ps-flow-out='+path.join(runRoot,'report.json')];
 const full=manifest(app),execution={status:'PREPARED_NOT_EXECUTED_PENDING_STATIC_REVIEW_AND_ADMISSION',productCommit:PLAN.productCommit,driverCommit:info.gitHead,app,executable:path.join(app,'Contents/MacOS/nwjs'),inputFile,inputSHA256:sha(Buffer.from(JSON.stringify(input,null,2)+'\n')),runRoot,processCount:1,scenarioCount:6,logicalModes:PLAN.groups,processes:[{name:'r8-formal-root-and-sequence',scenarioIDs:ids,cwd:game,argv,deadlineSeconds:PLAN.deadlineSeconds}],
  prerequisites:['independent static approval of this driver, full pure success chain, package and six-case scope','new exact driver-candidate CI','runtime host idle and actual execution admission; otherwise wait, never compete or bypass a refusal','create only this fresh run/save/profile/output after admission'],inheritedEnvironmentRemove:['NODE_OPTIONS','NODE_PATH','ELECTRON_RUN_AS_NODE','NW_PRE_ARGS'],
  resultGate:'One pass, six exact IDs in order, all pass, exit0, actual independent NW process/own-group receipt, no fatal or cleanup error, frozen input/product/three plugins/driver/package source/media binding and complete APP files+links unchanged before/after. Driver NOT_SELF_QUALIFIED cannot establish real execution. First failure stops; remaining IDs NOT_RUN; no rerun.',
  cleanup:'Bounded own-process-group cleanup only, original failure and cleanup errors separate, reap exact owned PID/group. No other NW/Crashpad, real saves or global environment changes.',sequenceScope:PLAN.nativeSequenceScope,sequenceNativeNotRun:PLAN.nativeSequenceNotRun,ordinarySeek:'independent prebattle actual host name/seek bounded against product memo; actual BufferSourceNode.start clock, source chunk offset and decoded native loop interval; declared tolerance2/60+2/44100 seconds, never fitted',
  originalME15:'NOT_INCLUDED: original separate two-process15 APP/manifest remains untouched. Do not claim a frozen combined3/21.',notProved:['physical input/hearing','pending/map/looped-once sequence native modes','sequence prior intra-track sample position or random history','Windows','real NW signal windows','newP4/GC or leak absence','fullD2/E/5.4'],beforeAfterAPP:'APP-MANIFEST.json'};
 fs.mkdirSync(out,{recursive:true});
 for(const[n,v]of Object.entries({'INPUT.json':input,'EXECUTION-PLAN.json':execution,'APP-MANIFEST.json':full,'RUNTIME-AUDIT.json':info.artifacts,'ASSETS.json':media,'PLAN.json':PLAN}))fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 return {head:info.gitHead,product:PLAN.productCommit,processes:1,cases:6,files:Object.keys(full.files).length,links:Object.keys(full.links).length,inputSHA256:fileHash(inputFile),appManifestSHA256:fileHash(path.join(out,'APP-MANIFEST.json')),executionPlanSHA256:fileHash(path.join(out,'EXECUTION-PLAN.json')),native:'NOT_RUN'};
}
module.exports={prepare};
if(require.main===module){assert.equal(process.argv.length,6,'usage: node scripts/prepare-r8-music-native-freeze.cjs APP CAPTURE_ASSETS_JSON NEW_RUN_ROOT NEW_FREEZE_DIR');console.log(JSON.stringify(prepare(...process.argv.slice(2)),null,2));}
