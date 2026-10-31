'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {E,D,fixture,clone,diag}=require('./trainer-ai-integration/fixtures.cjs');
const ROOT=path.resolve(__dirname,'../../..');let dir,create;
test.before(()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-d1-timing-'));
 const config={compilerOptions:{target:'ES2022',module:'CommonJS',strict:true,types:[],lib:['ES2022'],rootDir:path.join(ROOT,'src'),outDir:path.join(dir,'pure'),noEmitOnError:true},files:[path.join(ROOT,'src/plugins/flowtest/d1-timing.ts')]};
 fs.writeFileSync(path.join(dir,'tsconfig.json'),JSON.stringify(config));const typed=spawnSync('pnpm',['--dir','src','exec','tsc','-p',path.join(dir,'tsconfig.json')],{cwd:ROOT,encoding:'utf8'});assert.equal(typed.status,0,typed.stdout+typed.stderr);create=require(path.join(dir,'pure/plugins/flowtest/d1-timing.js')).createD1Timing;
});
test.after(()=>{if(dir)fs.rmSync(dir,{recursive:true,force:true});});
test('D1 typed host timer passes milliseconds before callback and cancels the exact token',()=>{
 let args,cancelled,observed;const callback=()=>{},token={timer:1},port=create(()=>123,(...v)=>{args=v;return token;},v=>cancelled=v,v=>observed=v);assert.equal(port.now(),123);assert.equal(observed,123);const stop=port.after(321,callback);assert.deepEqual(args,[321,callback]);stop();assert.equal(cancelled,token);
});
test('D1 timing drives actual asynchronous AI timeout, one fallback and no late publication',async()=>{
 let clock=0,timer,resolve,calls=0;const promise=new Promise(r=>resolve=r),port=create(()=>clock,(ms,callback)=>{timer={ms,callback};return timer;},t=>{t.cancelled=true;});
 const registry=E.composition.createTrainerAiStrategyRegistry();registry.register({id:'d1-timeout',version:'1',implementationIdentity:'test/d1-timeout/1',validateParameters(){},create(){return {decide(){calls++;return promise;}};}});
 const w=await fixture({timing:port,recordStrategy:{id:'d1-timeout',version:'1',parameters:{}},registry});const task=D.runTrainerAi(w.session,w.session.gw);await new Promise(r=>setImmediate(r));assert.equal(timer.ms,1000);assert.equal(typeof timer.callback,'function');clock=1000;timer.callback();assert.equal(await task,true);assert(timer.cancelled);assert.equal(calls,1);const journal=D.trainerAiJournal(w.session);assert.match(journal.entries[0].fallbackReason,/timeout/);const before=w.session.gw.snapshot(),state=clone(diag(w));resolve({malformed:'late'});await new Promise(r=>setImmediate(r));assert.equal(w.session.gw.snapshot(),before);assert.deepEqual(diag(w),state);assert.equal(D.trainerAiJournal(w.session).entries.length,1);
});
