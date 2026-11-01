'use strict';
// Formal logical requests, not reference execution or actual media playback.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..'),vectors=require('./battle-audio-selection-cases.json');let dir,select;
test.before(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-audio-selection-'));const source=path.join(ROOT,'src/plugins/battleflow');fs.writeFileSync(path.join(dir,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'CommonJS',strict:true,types:[],lib:['ES2022'],rootDir:source,outDir:path.join(dir,'out'),noEmitOnError:true},files:[path.join(source,'battle-audio-selection.ts')]}));const r=spawnSync('pnpm',['--dir','src','exec','tsc','-p',path.join(dir,'tsconfig.json')],{cwd:ROOT,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);select=require(path.join(dir,'out/battle-audio-selection.js')).selectBattleAudio;});
test.after(()=>{if(dir)fs.rmSync(dir,{recursive:true,force:true});});
const clone=x=>structuredClone(x);
const wildEntries=['wild-battle','wild-victory','wild-capture'],slots=['battle','victory','capture'],wildKeys=['wildBattle','wildVictory','wildCapture'];
const trainerEntries=['trainer-battle','trainer-victory'],trainerKeys=['trainerBattle','trainerVictory'];
const metadata=(keys,values)=>Object.fromEntries(keys.map((key,i)=>[key,Array.isArray(values)?values[i]:values]));
function check(input,logicalName,origin,slot,trainerIndex=null){const before=clone(input),r=select(input);assert.deepEqual(r,{version:'battle-audio-selection-v1',entry:input.entry,slot,logicalName,origin,trainerIndex});assert.deepEqual(input,before,'selection never consumes presets or writes input');return r;}
test('formal vector denominator is frozen and does not silently include unimplemented intro memory',()=>{
 assert.deepEqual(vectors.cases.map(x=>x.id),[...Array.from({length:17},(_,i)=>'PT-'+(i+41)),'PT-63']);
 assert.deepEqual(vectors.excludedIDs,Array.from({length:5},(_,i)=>'PT-'+(i+58)));
 const requests=vectors.cases.reduce((n,row)=>n+({ 'trainer-pair':2,'from-type':1,'wild-triple':3,'wild-defaults':6,'wild-independent':9 }[row.kind]??0),0);assert.equal(requests,47);
});
for(const row of vectors.cases)test(`${row.id} formal ${row.kind}`,()=>{
 if(row.kind==='trainer-pair')for(const [i,entry]of trainerEntries.entries())check({entry,trainers:row.types.map(v=>({battleBgm:v,victoryBgm:v})),context:{presets:row.presets,map:row.map===null?null:metadata(trainerKeys,row.map),global:metadata(trainerKeys,row.globalName)}},row.expectedNames?.[i]??row.expectedName??(i?'Battle victory':'Battle trainer'),row.origin,slots[i],row.index);
 else if(row.kind==='from-type')check({entry:'trainer-type-battle',trainer:{battleBgm:row.typeName},context:{map:{trainerBattle:row.map},global:{trainerBattle:row.globalName}}},row.expectedName,row.origin,'battle');
 else if(row.kind==='wild-triple')for(const [i,entry]of wildEntries.entries())check({entry,context:{presets:row.presets,map:row.map===null?null:metadata(wildKeys,row.map),global:metadata(wildKeys,row.globalNames)}},row.expectedNames[i],row.origin,slots[i]);
 else if(row.kind==='wild-defaults')for(const missing of row.missingVariants)for(const [i,entry]of wildEntries.entries())check({entry,context:{map:metadata(wildKeys,missing),global:metadata(wildKeys,missing)}},row.expectedNames[i],'default',slots[i]);
 else if(row.kind==='wild-independent')for(const [variant,presets]of row.presetsVariants.entries())for(const [i,entry]of wildEntries.entries())check({entry,context:{presets,map:metadata(wildKeys,['W','V','C']),global:metadata(wildKeys,'G')}},row.expectedVariants[variant][i],slots[i]in presets?'preset':'map',slots[i]);
 else assert.fail('unknown formal vector kind');
});
test('last non-null trainer field and fallback precedence over a finite exhaustive domain',()=>{
 const alphabet=[null,'','A','B'],arrays=[[]];for(let length=1;length<=3;length++){const build=prefix=>{if(prefix.length===length)arrays.push(prefix);else for(const value of alphabet)build([...prefix,value]);};build([]);}
 let count=0;for(const values of arrays)for(const [i,entry]of trainerEntries.entries())for(const map of [null,'','M'])for(const globalName of [null,'','G']){
  const last=values.filter(x=>x!==null).at(-1),chosen=last?{name:last,origin:'trainer',index:values.lastIndexOf(last)}:map?{name:map,origin:'map',index:null}:globalName?{name:globalName,origin:'global',index:null}:{name:i?'Battle victory':'Battle trainer',origin:'default',index:null};
  check({entry,trainers:values.map(v=>({battleBgm:v,victoryBgm:v})),context:{map:metadata(trainerKeys,map),global:metadata(trainerKeys,globalName)}},chosen.name,chosen.origin,slots[i],chosen.index);count++;
 }assert.equal(count,1530);
});
test('winning preset reads only its own slot and no lower sources',()=>{
 for(const entry of [...wildEntries,...trainerEntries,'trainer-type-battle']){
  const slot=entry.includes('victory')?'victory':entry==='wild-capture'?'capture':'battle',presets={};for(const key of slots)Object.defineProperty(presets,key,{get(){if(key!==slot)assert.fail('unrelated preset');return'X';}});
  const input={entry,context:{presets}};for(const key of ['map','global'])Object.defineProperty(input.context,key,{get(){assert.fail('lower metadata');}});for(const key of ['trainers','trainer'])Object.defineProperty(input,key,{get(){assert.fail('lower trainer');}});
  const r=select(input);assert.equal(r.logicalName,'X');assert.equal(r.slot,slot);assert.equal(r.origin,'preset');
 }
});
test('FromType empty wins without reading map/global; ordinary array empty instead falls through',()=>{
 const context={};for(const key of ['map','global'])Object.defineProperty(context,key,{get(){assert.fail('FromType empty must stop');}});assert.equal(select({entry:'trainer-type-battle',trainer:{battleBgm:''},context}).logicalName,'');
 check({entry:'trainer-battle',trainers:[{battleBgm:'A'},{battleBgm:''}],context:{map:{trainerBattle:'M'},global:{}}},'M','map','battle');
});
test('selected fields are observed once; unrelated metadata fields are not read',()=>{
 let reads=0;const type={get battleBgm(){reads++;return'A';},get victoryBgm(){assert.fail('wrong role');}},context={get map(){assert.fail('lower map');},get global(){assert.fail('lower global');}};
 const r=select({entry:'trainer-battle',trainers:[type],context});assert.equal(r.logicalName,'A');assert.equal(reads,1);
 let mapReads=0;assert.equal(select({entry:'wild-capture',context:{map:{get wildCapture(){mapReads++;return'C';},get wildBattle(){assert.fail('wrong map role');}},get global(){assert.fail('lower global');}}}).logicalName,'C');assert.equal(mapReads,1);
});
test('preset independence and repeated selection never clear any preset',()=>{
 const input={context:{presets:{battle:'B',victory:'V',capture:'C'},map:{},global:{}}},before=clone(input);for(let n=0;n<3;n++)for(const [i,entry]of wildEntries.entries())assert.equal(select({...input,entry}).logicalName,['B','V','C'][i]);assert.deepEqual(input,before);
});
test('output objects are independent and meaningful whitespace is not normalized away',()=>{
 const input={entry:'trainer-battle',trainers:[{battleBgm:' A '}],context:{map:{},global:{}}};const first=select(input);first.logicalName='changed';first.trainerIndex=8;check(input,' A ','trainer','battle',0);assert.equal(select({entry:'wild-battle',context:{map:{wildBattle:' '},global:{}}}).logicalName,' ');
});
test('invalid entry/context and selected field types fail instead of inventing a default',()=>{
 for(const input of [null,undefined,0,[],{}, {entry:'__proto__'},{entry:'toString'},{entry:'other'},{entry:'wild-battle',context:null},{entry:'wild-battle',context:{map:null}}])assert.throws(()=>select(input),/invalid battle audio/);
 for(const value of [false,0,{},[],NaN])for(const entry of wildEntries){const key=wildKeys[wildEntries.indexOf(entry)];assert.throws(()=>select({entry,context:{map:{[key]:value},global:{}}}),/invalid battle audio/);}
});
test('normalized preset boundary rejects raw empty or audio objects, while map empties remain missing',()=>{
 for(const value of ['',false,0,{name:'A'},[]])assert.throws(()=>select({entry:'wild-battle',context:{presets:{battle:value},map:{},global:{}}}),/invalid battle audio/);
 check({entry:'wild-battle',context:{map:{wildBattle:''},global:{wildBattle:'G'}}},'G','global','battle');
});
test('malformed trainer lists/records are rejected when needed, not silently skipped',()=>{
 for(const trainers of [null,undefined,{},[null],new Array(1),[{battleBgm:0}]])assert.throws(()=>select({entry:'trainer-battle',trainers,context:{map:{},global:{}}}),/invalid battle audio/);
 for(const trainer of [null,undefined,[],{battleBgm:false}])assert.throws(()=>select({entry:'trainer-type-battle',trainer,context:{map:{},global:{}}}),/invalid battle audio/);
});
