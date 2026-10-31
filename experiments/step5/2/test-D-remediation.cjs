'use strict';
// 5.2 D-01..D-03: real-host test driver timing, failure screenshots and the restart evidence contract.
// The D-01 refresh/update ratios are a virtual-time model (flowtest-sim.mjs), not real displays; the real-host
// evidence is the driver-selftest/inventory/all/verify-save runs recorded outside the repository.
const {test}=require('node:test'),assert=require('node:assert/strict'),{execFileSync,spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../../..');
const strip=script=>execFileSync(process.execPath,['--experimental-strip-types','--no-warnings','--input-type=module','-e',script],{cwd:ROOT,encoding:'utf8',timeout:60000});
const sim=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','--no-warnings','experiments/step5/2/flowtest-sim.mjs'],{cwd:ROOT,encoding:'utf8',maxBuffer:64*1024*1024}));

test('D-01 every press, direction repeat and cancel is sampled at 20..240 Hz with and without tick jitter',()=>{
 assert.equal(sim.flow.length,20);assert.equal(sim.repeat.length,20);
 for(const r of sim.flow)assert.ok(r.ok,`flow at ${r.rate} Hz jitter ${r.jitter}: ${r.error} ${JSON.stringify(r.events)}`);
 for(const r of sim.repeat)assert.ok(r.ok,`40-frame hold at ${r.rate} Hz jitter ${r.jitter}: ${JSON.stringify(r.events)}`);
});
test('D-01 refresh-rate changes, stalls and catch-up updates keep the same sampled input sequence',()=>{
 assert.equal(sim.scheduled.length,3);for(const r of sim.scheduled)assert.ok(r.ok,`${r.name}: ${r.error} ${JSON.stringify(r.events)}`);
});
test('D-01 paired control: counting display ticks swallows a release near 120 Hz, counting game updates never does',()=>{
 const rows=(ticks,rate)=>sim.control.filter(r=>r.countTicks===ticks&&(rate===undefined||r.rate===rate));
 assert.ok(rows(true,60).every(r=>r.matchesExpected),'at 60 Hz ticks equal updates');
 const swallowed=rows(true).filter(r=>r.rate!==60&&!r.matchesExpected);
 assert.ok(swallowed.length>=1,'the model reproduces the real 120 Hz failure of the pre-fix driver');
 assert.ok(rows(false).every(r=>r.matchesExpected),'no paired case fails when waits count game updates');
});
test('D-01 a stopped game loop fails the wait with both counters inside its bounded wall time',()=>{
 assert.equal(sim.stopped.length,2);
 for(const r of sim.stopped){assert.match(r.error,/^scene loop stopped while waiting sixty frames \(game frames \d+->\d+, display ticks \d+->\d+\)$/);assert.ok(r.virtualMs<=10000+60*40+600,`bounded: ${r.virtualMs}`);}
 assert.match(strip(`import {pressKey} from './src/plugins/flowtest/timing.ts';
  const p={clock:{game:0,ticks:0},sleep:()=>Promise.resolve(),now:()=>0};
  for(const [h,r] of [[0,2],[3,0],[1.5,2]])await pressKey(p,()=>{throw Error('dispatched')},h,r).then(()=>{throw Error('accepted')},e=>{if(!/at least one held/.test(e.message))throw e;});
  console.log('rejected');`),/rejected/);
});
test('D-01 source wiring guard: driver waits and key presses use game updates (not a behaviour test)',()=>{
 const s=fs.readFileSync(path.join(ROOT,'src/plugins/PS_BattleFlowTest.ts'),'utf8');
 assert.match(s,/G\.SceneManager\.update = function \(\.\.\.a: any\[\]\) \{\n    ticks\+\+;/);
 assert.match(s,/G\.SceneManager\.updateMain = function \(\.\.\.a: any\[\]\) \{ frame\+\+; return baseUpdateMain\.apply\(this, a\); \};/);
 assert.match(s,/const waits = \{ clock: \{ get game\(\) \{ return frame; \}, get ticks\(\) \{ return ticks; \} \}, sleep, now: \(\) => Date\.now\(\) \};/);
 for(const re of [/async function frames\(n: number\) \{ await waitGameFrames\(waits, n\); \}/,/await waitUntil\(waits, cond,/,/await pressKey\(waits, \(type\) => keyEvent\(type, k\), hold\);/,/async function manyKeys\(keys:string\[\],hold=3\)\{await pressKey\(waits,/])assert.match(s,re);
 assert.doesNotMatch(s,/dispatchEvent\(new KeyboardEvent\('keyup',\{keyCode:KEY\[k\]/,'no hand-rolled keyup timing left');
});

test('D-02 screenshot names: ids are labels, files are sanitized, unique and inside the evidence directory',()=>{
 const out=JSON.parse(strip(`import {screenshotFileName as n,fileInside as inside} from './src/plugins/flowtest/evidence.ts';import path from 'node:path';
  const t=new Set();const names=['fail-U52-01/FR-000177/188/P52-01/12/20','fail-DS-01/../../escape:attempt','DS/04','DS:04','ds_04','','..','中文 名称','a'.repeat(300)].map(x=>n(x,t));
  let escaped='no';try{inside('/tmp/e','../x',path)}catch(e){escaped=e.message}
  console.log(JSON.stringify({names,escaped,ok:inside('/tmp/e',names[0],path)}));`));
 assert.deepEqual(out.names.slice(0,5),['fail-U52-01_FR-000177_188_P52-01_12_20.png','fail-DS-01_.._.._escape_attempt.png','DS_04.png','DS_04~2.png','ds_04~3.png']);
 assert.deepEqual(out.names.slice(5,8),['shot.png','shot~2.png','shot~3.png']);
 assert.equal(out.names[8],'a'.repeat(96)+'.png');
 for(const name of out.names)assert.doesNotMatch(name,/[\\/:]/);
 assert.match(out.escaped,/escapes the evidence directory/);assert.equal(out.ok,'/tmp/e/fail-U52-01_FR-000177_188_P52-01_12_20.png');
});
test('D-02 capture outcomes always resolve: success, write failure, capture throw, no callback, late callback',()=>{
 const out=JSON.parse(strip(`import {captureScreenshot as c} from './src/plugins/flowtest/evidence.ts';
  const timers=[];const base=(over)=>({capture:d=>d('png'),write:()=>{},setTimer:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearTimer:()=>{},...over});
  const writes=[];let late;const r={
   ok:await c(base({write:(f,b)=>writes.push([f,b])}),'/e/a.png'),
   write:await c(base({write:()=>{throw new Error('disk full')}}),'/e/b.png'),
   capture:await c(base({capture:()=>{throw new Error('no window')}}),'/e/c.png')};
  const before=timers.length,hang=c(base({capture:d=>{late=d},write:(f,b)=>writes.push([f,b])}),'/e/d.png',2000),timer=timers.length>before?timers.at(-1):null;
  if(timer){timer.fn();r.hang=await hang;}else r.hang='no timeout registered';late('png');
  r.timerMs=timer?.ms;r.writes=writes;console.log(JSON.stringify(r));`));
 assert.deepEqual(out.ok,{ok:true});assert.deepEqual(out.writes,[['/e/a.png','png']],'the late callback after the timeout wrote nothing');
 assert.deepEqual(out.write,{ok:false,error:'screenshot write failed: disk full'});
 assert.deepEqual(out.capture,{ok:false,error:'screenshot capture failed: no window'});
 assert.deepEqual(out.hang,{ok:false,error:'screenshot callback did not return within 2000 ms'});assert.equal(out.timerMs,2000);
});
test('D-02 source wiring guard: failure is recorded and on disk before a best-effort screenshot (not a behaviour test)',()=>{
 const s=fs.readFileSync(path.join(ROOT,'src/plugins/PS_BattleFlowTest.ts'),'utf8');
 assert.match(s,/results\.push\(failure\);\n      writeProgress\(\); \/\/ the failure is on disk before any screenshot is attempted\n      failure\.screenshot = await shot\("fail-" \+ id\.split\(" "\)\[0\], \{ bestEffort: true, \.\.\.failureShot \}\);/);
 assert.match(s,/entry\.file = screenshotFileName\(label, shotNames\);/);assert.match(s,/await captureScreenshot\(ports, fileInside\(SHOTS, entry\.file, path\), opts\.timeoutMs \?\? 10000\)/);
 assert.doesNotMatch(s,/path\.join\(SHOTS, `\$\{name\}\.png`\)/);
});

// D-03 runner contract with a stub "NW" that writes what a real run would (no NW.js, no window, works on Linux CI).
const STUB=`#!/usr/bin/env node
const fs=require('fs'),path=require('path');const a=process.argv.slice(2),arg=n=>(a.find(x=>x.startsWith('--'+n+'='))||'').slice(n.length+3);
const out=arg('ps-flow-out'),mode=arg('ps-flow-test'),saves=arg('ps-save-dir');fs.mkdirSync(path.dirname(out),{recursive:true});
if(mode==='all'){fs.mkdirSync(saves,{recursive:true});fs.writeFileSync(path.join(saves,'file14.rmmzsave'),'save');for(const n of ['ps-flow-expected.json','ps-flow-expected-t31.json'])fs.writeFileSync(path.join(path.dirname(out),n),JSON.stringify({n}));}
if(mode==='driver-selftest'){fs.writeFileSync(out,JSON.stringify({overall:'fail',results:[{id:'DS-01/x injected',status:'fail'},{id:'DS-99 control',status:process.env.STUB_DS99||'pass'}],argv:a}));process.exit(0);}
fs.writeFileSync(out,JSON.stringify({overall:process.env.STUB_OVERALL||'pass',results:[{id:'stub',status:process.env.STUB_OVERALL||'pass'}],argv:a}));`;
function runner(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ps52-d03-')),nw=path.join(dir,'nw');fs.writeFileSync(nw,STUB,{mode:0o755});fs.mkdirSync(path.join(dir,'game'));
 const run=(evid,mode,env={})=>{const r=spawnSync('bash',[path.join(ROOT,'scripts/run-inventory-test-mac.sh'),path.join(dir,evid),mode],{encoding:'utf8',env:{...process.env,PF_OWNED_NW:nw,PF_OWNED_PROJECT:path.join(dir,'game'),PF_OWNED_SKIP_BUILD:'1',...env}});
  const launch=path.join(dir,evid,'launch.json');return {exit:r.status,out:r.stdout+r.stderr,launch:fs.existsSync(launch)?JSON.parse(fs.readFileSync(launch,'utf8')):null,report:fs.existsSync(path.join(dir,evid,'report.json'))?JSON.parse(fs.readFileSync(path.join(dir,evid,'report.json'),'utf8')):null};};
 return {dir,run,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
test('D-03 a producing run records the hashes of the expected-state files it wrote',()=>{
 const r=runner();try{const all=r.run('all','all');assert.equal(all.exit,0,all.out);
  assert.deepEqual(all.launch.producedExpected,{'ps-flow-expected-t31.json':sha(path.join(r.dir,'all/ps-flow-expected-t31.json')),'ps-flow-expected.json':sha(path.join(r.dir,'all/ps-flow-expected.json'))});
 }finally{r.cleanup();}
});
test('D-03 verify-save in its own directory reads the producing run in place and records source and saves',()=>{
 const r=runner();try{r.run('all','all');const src=path.join(r.dir,'all'),saves=path.join(src,'saves');
  const v=r.run('restart','verify-save',{PF_OWNED_EXPECTED:src,PF_OWNED_SAVES:saves});assert.equal(v.exit,0,v.out);
  assert.ok(v.report.argv.includes('--ps-flow-expected-dir='+src)&&v.report.argv.includes('--ps-save-dir='+saves),JSON.stringify(v.report.argv));
  assert.deepEqual(v.launch.expectedSource,{dir:src,files:JSON.parse(fs.readFileSync(path.join(src,'launch.json'),'utf8')).producedExpected});
  assert.deepEqual(v.launch.savesBefore,{'file14.rmmzsave':sha(path.join(saves,'file14.rmmzsave'))});
  assert.deepEqual(v.launch.producedExpected,{},'a restart never produces or regenerates expected states');
  assert.deepEqual(fs.readdirSync(path.join(r.dir,'restart')).filter(n=>n.startsWith('ps-flow-expected')),[],'nothing copied');
 }finally{r.cleanup();}
});
test('D-03 missing source, missing or changed expected files, wrong directory and empty saves refuse before launch',()=>{
 const r=runner();try{r.run('all','all');const src=path.join(r.dir,'all'),saves=path.join(src,'saves');
  const refused=(evid,env,re)=>{const v=r.run(evid,'verify-save',env);assert.equal(v.exit,2,v.out);assert.equal(v.report,null,'nothing launched');if(v.launch){assert.equal(v.launch.status,'preflight-refused');assert.equal(v.launch.pid,undefined);assert.match(v.launch.reason,re);}else assert.match(v.out,re);return v;};
  refused('no-env',{},/needs PF_OWNED_EXPECTED/);
  refused('no-saves-env',{PF_OWNED_EXPECTED:src},/needs PF_OWNED_EXPECTED/);
  refused('no-record',{PF_OWNED_EXPECTED:path.join(r.dir,'game'),PF_OWNED_SAVES:saves},/no readable producing record/);
  refused('same-dir',{PF_OWNED_EXPECTED:path.join(r.dir,'same-dir'),PF_OWNED_SAVES:saves},/must differ/);
  fs.mkdirSync(path.join(r.dir,'empty'));refused('empty-saves',{PF_OWNED_EXPECTED:src,PF_OWNED_SAVES:path.join(r.dir,'empty')},/saves directory missing or empty/);
  const t31=path.join(src,'ps-flow-expected-t31.json'),bytes=fs.readFileSync(t31);
  fs.writeFileSync(t31,'{"n":"edited after the run"}');refused('changed',{PF_OWNED_EXPECTED:src,PF_OWNED_SAVES:saves},/changed since it was produced/);
  fs.rmSync(t31);refused('missing',{PF_OWNED_EXPECTED:src,PF_OWNED_SAVES:saves},/differ from the recorded/);
  fs.writeFileSync(t31,bytes);assert.equal(r.run('restored','verify-save',{PF_OWNED_EXPECTED:src,PF_OWNED_SAVES:saves}).exit,0,'original bytes are accepted again');
 }finally{r.cleanup();}
});
test('D-03 source wiring guard: verify-save reads every expected state through the explicit source (not a behaviour test)',()=>{
 const s=fs.readFileSync(path.join(ROOT,'src/plugins/PS_BattleFlowTest.ts'),'utf8');
 const expected=['ps-flow-expected-a-m1-trainer.json','ps-flow-expected.json','ps-flow-expected-t15.json','ps-flow-expected-t26.json','ps-flow-expected-t31.json','ps-flow-expected-capability.json','ps-flow-expected-progression-data.json','ps-flow-expected-effects.json','ps-flow-expected-postbattle.json','ps-flow-expected-learning.json','ps-flow-expected-triggered.json','ps-flow-expected-trade.json','ps-flow-expected-acquisition.json','ps-flow-expected-viewing.json'];
 assert.deepEqual((s.match(/readExpected\("ps-flow-expected[a-z0-9-]*\.json"\)/g)||[]).sort(),expected.map(name=>`readExpected("${name}")`).sort());
 assert.match(s,/readExpected\("ps-flow-expected-capability\.json"\)/);
 assert.doesNotMatch(s,/readFileSync\(path\.join\(path\.dirname\(OUT \|\| "\."\), "ps-flow-expected/);
 assert.match(s,/const dir = EXPECTED_DIR \?\? path\.dirname\(OUT \|\| "\."\), file = path\.join\(dir, name\);/);
});

// 5.2 P-01 (product): NW.js runs the required engine in Node's context and plugins in the window's, so plugin-built
// plain requests have another realm's Object.prototype. Before the fix every bag/shop request and the item world were
// refused as nonplain-intent in the real host; the VM host had hidden this by cloning requests.
const vm=require('node:vm');
test('P-01 plain data from another realm fingerprints like local plain data; non-plain values are still refused',()=>{
 const E=require(path.join(ROOT,'js/engine/build/engine.cjs')),fp=E.semantic.semanticFingerprint;
 const shape='({kind:"use-item",itemId:"potion",quantity:1,answers:{learning:[{kind:"decline"}]},list:[1,{a:null}]})';
 const foreign=vm.runInNewContext(shape);assert.notEqual(Object.getPrototypeOf(foreign),Object.prototype,'really another realm');
 assert.doesNotThrow(()=>fp(foreign),'another realm\'s plain object is plain data');assert.equal(fp(foreign),fp(eval(shape)));assert.equal(fp(vm.runInNewContext('Object.create(null)')),fp({}));
 const ctx=vm.createContext({});
 for(const [source,error] of [['new Map()','nonplain-intent'],['new Date(0)','nonplain-intent'],['new (class A{})()','nonplain-intent'],['Object.create({})','nonplain-intent'],['({x:new Set()})','nonplain-intent'],['({get a(){return 1}})','intent-accessor'],['({n:NaN})','invalid-intent-number'],['(()=>{const o={};o.o=o;return o})()','cyclic-intent']])
  assert.throws(()=>fp(vm.runInContext(source,ctx)),new RegExp(error),source);
 const forged=Object.create(null);forged.constructor=function NotObject(){};assert.throws(()=>fp(Object.create(forged)),/nonplain-intent/);
 assert.throws(()=>fp(Object.create(Object.create(null))),/nonplain-intent/);
});
test('P-01 the application accepts the real host shape: request and item world both built in another realm',()=>{
 const {setup}=require('./ef-support.cjs');
 const x=setup({bag:{potion:3},edit:g=>{g.party[0].hp=1;},world:vm.runInNewContext('({mapId:4})')}),id=x.game.party[0].id,t=x.app.beginInventoryOperation('bag');
 assert.equal(x.app.inventoryRequest(t,'browse',vm.runInNewContext('({kind:"browse",pocket:2,index:0})')).status,'committed');
 const use=vm.runInNewContext(`({kind:"use-item",itemId:"potion",quantity:1,memberId:${JSON.stringify(id)},answers:{}})`);
 assert.equal(x.app.inventoryRequest(t,'use',use).status,'committed');
 assert.equal(x.app.inventoryRequest(t,'use',{kind:'use-item',itemId:'potion',quantity:1,memberId:id,answers:{}}).status,'duplicate','same identity across realms');
 assert.equal(x.app.inventoryRequest(t,'use',vm.runInNewContext(`({kind:"use-item",itemId:"potion",quantity:2,memberId:${JSON.stringify(id)},answers:{}})`)).reason,'request-conflict');
 assert.equal(E6(x).potion,2,'exactly one potion consumed');
});
const E6=x=>require(path.join(ROOT,'js/engine/build/engine.cjs')).inventory.aggregateBag(x.state.current().inventory);

test('D-04/D-05 source wiring guard: U52-06 starts its non-battle events with the map helper and reads the variable raw and public (not a behaviour test)',()=>{
 const s=fs.readFileSync(path.join(ROOT,'src/plugins/PS_BattleFlowTest.ts'),'utf8'),body=s.match(/U52-06\/P52-27\/41\/43[^\n]*\n([^\n]*)/)[1];
 for(const id of [4,5,6,7,2])assert.ok(body.includes(`startMapEvent(${id})`),`event ${id}`);
 assert.doesNotMatch(body,/startEvent\(/,'the battle helper waits for a battle scene these events never open');
 assert.match(s,/async function startMapEvent\(id: number\) \{\n    await waitFor\(\(\) => scene\(\) && scene\(\)\._spriteset && !G\.SceneManager\.isSceneChanging\(\), "map scene"\);\n    G\.\$gameMap\.event\(id\)\.start\(\);\n    await frames\(3\);\n  \}/);
 assert.ok(body.includes("eq([G.$gameVariables._data[3],G.$gameVariables.value(3)],['',0],"),'raw empty ID and MZ public read 0 are both asserted');
});
test('D-06/D-07 bag source wiring and actual U51-14 schema4 fixture validation/capacity refusal',()=>{
 const s=fs.readFileSync(path.join(ROOT,'src/plugins/PS_BattleFlowTest.ts'),'utf8');
 assert.ok(s.includes("const I6 = {rawBagOf:(game:any):any=>game.inventory?api().inventory.aggregateBag(game.inventory):game.bag,bagOf:(game:any):any=>{const bag=I6.rawBagOf(game);return bag&&Object.fromEntries(Object.keys(bag).sort().map(k=>[k,bag[k]]));},"),'sorted comparison view');
 assert.ok(s.includes('setItemCount:(game:any,id:string,n:number):number=>{const bag=I6.rawBagOf(game);')&&s.includes('bag: clone(I6.rawBagOf(g))'),'fixture edits and legacy documents keep the inventory order');
 const authored=s.match(/const healthy=clone\(game\(\)\),raw:any=(\{[^\n]*?\});\/\* Author a valid schema4/);assert(authored,'actual U51-14 document expression is present');
 const E=require(path.join(ROOT,'js/engine/build/engine.cjs')),healthy=E.fixtures.makeGame(),before=JSON.stringify(healthy),api=()=>E,clone=structuredClone,I6={rawBagOf:g=>E.inventory.aggregateBag(g.inventory)};
 const raw=vm.runInNewContext('('+authored[1].replaceAll(':any','')+')',{healthy,api,clone,I6});assert.equal(raw.schema,4);assert.equal(raw.boxes.length,1201);assert(!Object.hasOwn(raw,'defeatedTrainers'));assert.deepEqual(E.saveSchema.validateGame(raw),[],'authored old document is structurally valid');
 const bytes=JSON.stringify(raw),migration=E.saveSchema.migrateGame(raw,{content:E.fixtures.content});assert.equal(migration.ok,false);assert.equal(migration.error.code,'capacity-exceeded');assert.equal(migration.error.boxMemberCount,1201);assert.equal(JSON.stringify(raw),bytes,'refusal preserves old document');assert.equal(JSON.stringify(healthy),before,'fixture authoring preserves current document');
});

test('F-03/F-04 hardening: a throwing clearTimer still resolves the capture; a stalled hold still releases the key',()=>{
 const out=JSON.parse(strip(`import {captureScreenshot as c} from './src/plugins/flowtest/evidence.ts';import {pressKey} from './src/plugins/flowtest/timing.ts';
  const r=await Promise.race([c({capture:d=>d('png'),write:()=>{},setTimer:()=>1,clearTimer:()=>{throw new Error('clear failed')}},'/e/a.png'),new Promise(res=>setTimeout(()=>res('hung'),2000))]);
  let t=0;const sent=[];const p={clock:{game:0,ticks:0},sleep:()=>{t+=1000;return Promise.resolve();},now:()=>t};
  const press=await pressKey(p,type=>sent.push(type)).then(()=>'resolved',e=>e.message);
  console.log(JSON.stringify({r,sent,press}));`));
 assert.deepEqual(out.r,{ok:true});assert.deepEqual(out.sent,['keydown','keyup'],'keyup is sent even though the hold wait failed');
 assert.match(out.press,/^scene loop stopped while waiting key hold/);
});
test('F-05/F-06 restart contract: path-like names, unrecorded files, failed producers and malformed records refuse before launch',()=>{
 const r=runner();try{r.run('all','all');const src=path.join(r.dir,'all'),saves=path.join(src,'saves'),launch=path.join(src,'launch.json'),original=fs.readFileSync(launch,'utf8');
  const refused=(evid,env,re)=>{const v=r.run(evid,'verify-save',env);assert.equal(v.exit,2,v.out);assert.equal(v.report,null,'nothing launched');assert.equal(v.launch.status,'preflight-refused');assert.match(v.launch.reason,re);};
  const env={PF_OWNED_EXPECTED:src,PF_OWNED_SAVES:saves};
  const forged=JSON.parse(original);forged.producedExpected={'../outside.json':'0'.repeat(64)};fs.writeFileSync(launch,JSON.stringify(forged));refused('dotdot',env,/plain ps-flow-expected\*\.json names/);
  forged.producedExpected={[path.join(src,'ps-flow-expected.json')]:'0'.repeat(64)};fs.writeFileSync(launch,JSON.stringify(forged));refused('absolute',env,/plain ps-flow-expected\*\.json names/);
  fs.writeFileSync(launch,'[]');refused('array',env,/not an object/);
  fs.writeFileSync(launch,original);fs.writeFileSync(path.join(src,'ps-flow-expected-t26.json'),'{}');refused('unrecorded',env,/differ from the recorded/);fs.rmSync(path.join(src,'ps-flow-expected-t26.json'));
  assert.equal(r.run('again','verify-save',env).exit,0,'the untouched producer is accepted');
  const failed=r.run('failed','all',{STUB_OVERALL:'fail'});assert.equal(failed.exit,1);assert.equal(failed.launch.overall,'fail');
  refused('from-failed',{PF_OWNED_EXPECTED:path.join(r.dir,'failed'),PF_OWNED_SAVES:path.join(r.dir,'failed','saves')},/producing run did not pass/);
 }finally{r.cleanup();}
});
test('F-10 driver-selftest: overall stays fail by design, the exit code and selftestControl follow DS-99',()=>{
 const r=runner();try{
  const ok=r.run('st-ok','driver-selftest');assert.equal(ok.exit,0,ok.out);assert.equal(ok.launch.overall,'fail');assert.equal(ok.launch.selftestControl,'pass');
  const bad=r.run('st-bad','driver-selftest',{STUB_DS99:'fail'});assert.equal(bad.exit,1);assert.equal(bad.launch.selftestControl,'fail');
 }finally{r.cleanup();}
});
