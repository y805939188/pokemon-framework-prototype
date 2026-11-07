'use strict';
// SYNTHETIC CONTROL ONLY: fake native ports in Node VM, no NW process/authority or OS admission.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),{spawnSync}=require('node:child_process');
const {compile}=require('./normal-preparation-test-support.cjs'),{createNormalInputControlHost}=require('./normal-input-control-host.cjs'),E=require('../../../js/engine/build/production.cjs');
let h,A,tools,api,managementText;
const save=(name,data)=>{if(process.env.PF_OFFLINE_RECEIPT_DIR){fs.mkdirSync(process.env.PF_OFFLINE_RECEIPT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.PF_OFFLINE_RECEIPT_DIR,name+'.json.gz'),zlib.gzipSync(JSON.stringify(data)));}};
test.before(async()=>{
 h=await compile();A=h.api;tools=A.createReviewedNormalTools(require);const vite=require(require.resolve('vite',{paths:[path.join(h.ROOT,'src')]})),entry=path.join(h.work,'native.ts');
 fs.writeFileSync(entry,['execution','../d2-native-contract'].map(n=>'export * from '+JSON.stringify(n.startsWith('../')?path.join(h.ROOT,'src/plugins/flowtest/d2-native-contract.ts'):path.join(h.ROOT,'src/plugins/flowtest/d2-normal-'+n+'.ts'))+';').join('\n'));
 await vite.build({configFile:false,root:h.ROOT,logLevel:'error',build:{outDir:path.join(h.work,'native'),emptyOutDir:false,minify:false,lib:{entry,formats:['cjs'],fileName:()=> 'entry.cjs'}}});api=require(path.join(h.work,'native/entry.cjs'));
 const out=path.join(h.work,'PS_Management'),r=spawnSync(process.execPath,[path.join(h.ROOT,'src/node_modules/vite/bin/vite.js'),'build','--configLoader','runner','--outDir',out],{cwd:path.join(h.ROOT,'src'),env:{...process.env,RR_PLUGIN:'PS_Management'},encoding:'utf8',timeout:90000});assert.equal(r.status,0,r.stdout+r.stderr);managementText=fs.readFileSync(path.join(out,'PS_Management.js'),'utf8');
});
test.after(()=>h?.close());
function binding(nonce='1'.repeat(32)){return {version:'D2-native-qualification-binding-v1',stage:'QUALIFICATION',role:'candidate',mode:'natural',nonce,groupId:'qualification-candidate-'+nonce,sourceHead:'a'.repeat(40),sourceTree:'b'.repeat(40),pairBytesSHA256:'c'.repeat(64),packageInventorySHA256:'d'.repeat(64),sharedBridgeSHA256:'e'.repeat(64),donorHash:tools.donorHash,presentationHash:tools.presentationHash,appRoot:'/owned/candidate.app',profileRoot:'/owned/profile',saveRoot:'/owned/save',outputRoot:'/owned/output',caseIds:tools.compileNavigation().cases.map(c=>c.id),budget:{caseMs:180000,runMs:18000000},view:{width:816,height:624,dpr:2}};}
async function owned(t){const x=createNormalInputControlHost(h,managementText);await x.p.toMapId(5);x.fixture=A.installNormalHostFixture(E,x.G,x.G,{trainerAiTiming:{now:()=>x.G.performance.now(),after(ms,fn){const id=x.G.setTimeout(fn,ms);return ()=>x.G.clearTimeout(id);}}});
 Object.assign(x.G,{nw:{App:{argv:['--ps-flow-test=d2-normal-f100','--ps-d2-normal-stage=native-qualification']}},AbortController,innerWidth:816,innerHeight:624,devicePixelRatio:2,requestAnimationFrame:fn=>x.G.setTimeout(fn,1000/60),cancelAnimationFrame:id=>x.G.clearTimeout(id)});x.G.document.visibilityState='visible';x.G.document.hasFocus=()=>true;
 x.retired=0;x.calls=0;x.require=()=>{};x.authority={bindGroup(b,runtime){x.calls++;assert.equal(runtime.G,x.G);return {binding:b,assertCurrent(){x.require();},retire(){x.retired++;}};}};x.rows=[];x.collector={append(row){x.rows.push(row);}};
 t.after(async()=>{if(x.w.flow.running)x.w.flow.abort(Error('owned native-interface control cleanup'));x.M.goto(x.G.Scene_Map);await x.frames(2);assert.equal(x.fixture.app.saveBlocked,false);});return x;}
function released(x){assert(Object.values(x.G.Input._currentState).every(v=>!v));assert.equal(Object.hasOwn(x.fixture.app,'startBattle'),false);const s=x.w.flow._op?.session;if(s)for(const n of ['chooseMove','chooseSwitch','useItem','throwBall','decideLearn','run'])assert.equal(Object.hasOwn(s,n),false,n);}
test('qualification binding is immutable bytes, excludes formal modes and cannot contain JSON authorization',()=>{
 const b=binding(),f=api.freezeNativeQualificationBinding(b,tools);assert(Object.isFrozen(f)&&Object.isFrozen(f.caseIds));b.caseIds.reverse();assert.equal(f.caseIds[0],'F100-001');
 for(const mutate of [b=>b.stage='FORMAL',b=>b.mode='GC',b=>b.groupId='candidate-natural1',b=>b.caseIds.pop(),b=>b.nativeAdmission=true,b=>b.donorHash='0'.repeat(64),b=>b.saveRoot=b.appRoot+'/save',b=>b.budget.caseMs=Infinity]){const v=binding();mutate(v);assert.throws(()=>api.freezeNativeQualificationBinding(v,tools));}
});
test('native preflight reads binding bytes only, creates no App or permit, and rejects duplicate paths',()=>{
 const file=path.join(h.work,'qualification.json');fs.writeFileSync(file,JSON.stringify(binding()));const guarded=id=>{if(id.startsWith('./js/engine'))throw Error('unexpected engine/App import');return require(id);};
 const out=A.prepareNormalD2Entry(['--ps-d2-normal-stage=native-preflight','--ps-d2-native-binding='+file],guarded);assert.equal(out.status,'BINDING_BYTES_VALID_NATIVE_AUTHORITY_UNBOUND');assert.equal(out.nativeAdmission,false);assert.equal(out.actualBattles,0);assert.equal(out.stateHostAttached,false);
 const denied=A.prepareNormalD2Entry(['--ps-d2-normal-stage=native-qualification'],guarded);assert.equal(denied.status,'BLOCKED_NATIVE_BINDING_MISSING');
 assert.throws(()=>A.prepareNormalD2Entry(['--ps-d2-normal-stage=native-preflight','--ps-d2-native-binding='+file,'--ps-d2-native-binding='+file],guarded),/ambiguous/);
});
test('closed and serialized authorities cannot install clocks, append reports, attach App bridges or send inputs',async t=>{
 const x=await owned(t),original=x.G.SceneManager.updateMain,draws=x.dispatches.length;
 await assert.rejects(api.executeNativeQualificationGroup(E,x.G,x.G,x.fixture,tools,binding('2'.repeat(32)),new api.ClosedNativeAuthority(),x.collector),/not bound/);
 await assert.rejects(api.executeNativeQualificationGroup(E,x.G,x.G,x.fixture,tools,binding('3'.repeat(32)),{bindGroup:true},x.collector),/live native authority/);
 assert.equal(x.G.SceneManager.updateMain,original);assert.equal(x.rows.length,0);assert.equal(x.dispatches.length,draws);assert.equal(x.calls,0);assert.deepEqual(x.fixture.state().appliedBattles,{});released(x);
});
test('control port lease drives original100 IDs through shared input kernel, separately records clocks and full states, and grants no acceptance',async t=>{
 const x=await owned(t),original=x.G.SceneManager.updateMain,b=binding('4'.repeat(32));
 const result=await x.pump(api.executeNativeQualificationGroup(E,x.G,x.G,x.fixture,tools,b,x.authority,x.collector),200000);save('native-consumer-CONTROLLED-ONLY',result);
 assert.equal(result.status,'RAW_QUALIFICATION_COMPLETE_PENDING_REVIEW');assert.equal(result.cases.length,100);assert.deepEqual(Object.keys(x.fixture.state().appliedBattles),b.caseIds);assert.equal(x.calls,1);assert.equal(x.retired,1);
 for(const k of ['nativeAdmission','traceQualified','deadlineQualified','full100Accepted'])assert.equal(result[k],false);
 const states=result.records.filter(r=>r.kind==='state');assert.equal(states.length,101);for(const row of states){assert.equal(row.stateSHA256,tools.hash(row.state));assert.deepEqual(E.saveSchema.validateGameContent(row.state,x.fixture.content),[]);}
 for(const clock of ['updateMain','rAF']){const rows=result.records.filter(r=>r.kind==='clock'&&r.clock===clock);assert(rows.length>0);for(let i=1;i<rows.length;i++)assert(rows[i].tick>rows[i-1].tick&&rows[i].t>=rows[i-1].t);}
 assert.equal(x.G.SceneManager.updateMain,original);released(x);const prior=x.dispatches.length;await assert.rejects(api.executeNativeQualificationGroup(E,x.G,x.G,x.fixture,tools,b,x.authority,x.collector),/cannot be retried/);assert.equal(x.calls,1);assert.equal(x.dispatches.length,prior);
 console.log('NATIVE_CONSUMER_CONTROL '+JSON.stringify({scope:'SYNTHETIC_NODE_PORTS_NOT_NW',caseCount:100,states:states.length,inputPulses:result.cases.reduce((n,c)=>n+c.inputs.length,0),actualActions:result.cases.reduce((n,c)=>n+c.resolved.actionCount,0),nativeAdmission:false,traceQualified:false}));
});
test('lease revocation after a keydown releases keys and stops without successor input or retry',async t=>{
 const x=await owned(t),original=x.G.SceneManager.updateMain,dispatch=x.G.document.dispatchEvent;let revoked=false,at=-1;
 x.G.document.dispatchEvent=function(event){const value=dispatch.call(this,event);if(event.type==='keydown'&&!revoked){revoked=true;at=x.dispatches.length;}return value;};x.require=()=>{if(revoked)throw Error('controlled lease revoked');};
 await assert.rejects(x.pump(api.executeNativeQualificationGroup(E,x.G,x.G,x.fixture,tools,binding('5'.repeat(32)),x.authority,x.collector)),error=>{save('native-revoked-FAIL',error.receipt);assert.match(error.receipt.error.message,/controlled lease revoked/);assert.equal(error.receipt.status,'FAIL');return true;});
 assert(at>0);assert(x.dispatches.slice(at).every(d=>d.type==='keyup'));assert.equal(x.G.SceneManager.updateMain,original);assert.equal(x.retired,1);released(x);assert.deepEqual(x.fixture.state().appliedBattles,{});
});
test('collector failure remains primary, restores only owned hooks and never produces a completed case',async t=>{
 const x=await owned(t),original=x.G.SceneManager.updateMain;x.collector={append(row){if(row.kind==='clock')throw Error('controlled clock sink failed');x.rows.push(row);}};
 await assert.rejects(x.pump(api.executeNativeQualificationGroup(E,x.G,x.G,x.fixture,tools,binding('6'.repeat(32)),x.authority,x.collector)),error=>{assert.match(error.receipt.error.message,/clock sink failed/);assert.equal(error.receipt.cases.length,0);return true;});
 assert.equal(x.G.SceneManager.updateMain,original);assert.equal(x.retired,1);released(x);assert.deepEqual(x.fixture.state().appliedBattles,{});
});
test('natural qualification refuses exposed GC without calling it or installing native hooks',async t=>{
 const x=await owned(t),original=x.G.SceneManager.updateMain;let calls=0;x.G.gc=()=>calls++;
 await assert.rejects(api.executeNativeQualificationGroup(E,x.G,x.G,x.fixture,tools,binding('7'.repeat(32)),x.authority,x.collector),error=>{assert.match(error.receipt.error.message,/forbids exposed/);return true;});assert.equal(calls,0);assert.equal(x.G.SceneManager.updateMain,original);assert.equal(x.retired,1);released(x);
});

test('nonfinite actual clock fails before hooks and retires the owned lease',async t=>{
 const x=await owned(t),original=x.G.SceneManager.updateMain,now=x.G.performance.now;x.G.performance.now=()=>NaN;
 try{await assert.rejects(api.executeNativeQualificationGroup(E,x.G,x.G,x.fixture,tools,binding('8'.repeat(32)),x.authority,x.collector),error=>{assert.match(error.receipt.error.message,/clock/);return true;});}finally{x.G.performance.now=now;}
 assert.equal(x.G.SceneManager.updateMain,original);assert.equal(x.retired,1);released(x);
});
test('an asynchronous recorder is refused before its body or the authority is invoked',async t=>{
 const x=await owned(t);let invoked=0;await assert.rejects(api.executeNativeQualificationGroup(E,x.G,x.G,x.fixture,tools,binding('9'.repeat(32)),x.authority,{async append(){invoked++;}}),/synchronous collector/);assert.equal(invoked,0);assert.equal(x.calls,0);released(x);
});
test('an actual game-update fatal stays primary when the clock recorder also fails',async t=>{
 const x=await owned(t),original=x.G.SceneManager.updateMain;const fatal=function(...args){if(x.w.flow.running)throw Error('controlled native game fatal');return original.apply(this,args);};x.G.SceneManager.updateMain=fatal;x.collector={append(row){if(row.kind==='clock')throw Error('secondary recorder failure');}};
 try{await assert.rejects(x.pump(api.executeNativeQualificationGroup(E,x.G,x.G,x.fixture,tools,binding('a'.repeat(32)),x.authority,x.collector)),error=>{assert.match(error.receipt.error.message,/native game fatal/);assert(error.receipt.cleanupErrors.some(e=>e.includes('secondary recorder failure')));return true;});assert.equal(x.G.SceneManager.updateMain,fatal);}finally{x.G.SceneManager.updateMain=original;}
 assert.equal(x.retired,1);released(x);
});

test('the early native qualification entry exposes an explicit consumer but closed authority never calls its fixture factory',async t=>{
 const x=createNormalInputControlHost(h,managementText);await x.p.toMapId(5);const prior=x.w.flow._app,game=x.G.$gameSystem._psGame,update=x.G.SceneManager.updateMain,file=path.join(h.work,'entry-binding.json');
 Object.assign(x.G,{nw:{App:{argv:['--ps-flow-test=d2-normal-f100','--ps-d2-normal-stage=native-qualification']}},AbortController,requestAnimationFrame:()=>0,cancelAnimationFrame(){}});fs.writeFileSync(file,JSON.stringify(binding('b'.repeat(32))));
 const req=id=>id==='./js/engine/build/production.cjs'?E:require(id),out=A.prepareNormalD2Entry(['--ps-d2-normal-stage=native-qualification','--ps-d2-native-binding='+file],req,{G:x.G,W:x.G});
 assert.equal(typeof out.consume,'function');assert.equal(out.nativeAdmission,false);await assert.rejects(out.consume(new api.ClosedNativeAuthority(),{append(){throw Error('collector must not run');}}),/not bound/);
 assert.equal(x.w.flow._app,prior);assert.equal(x.G.$gameSystem._psGame,game);assert.equal(x.G.SceneManager.updateMain,update);assert.equal(x.dispatches.length,0);assert.equal(x.w.flow.running,false);
});
test('entry attaches the formal fixture only after authority and restores its exact prior root on pre-opening collector failure',async()=>{
 const x=createNormalInputControlHost(h,managementText);await x.p.toMapId(5);const prior=x.w.flow._app,game=x.G.$gameSystem._psGame,update=x.G.SceneManager.updateMain,file=path.join(h.work,'entry-attach.json');let retired=0,observed=false;
 Object.assign(x.G,{nw:{App:{argv:['--ps-flow-test=d2-normal-f100','--ps-d2-normal-stage=native-qualification']}},AbortController,requestAnimationFrame:()=>0,cancelAnimationFrame(){},innerWidth:816,innerHeight:624,devicePixelRatio:2});x.G.document.hasFocus=()=>true;x.G.document.visibilityState='visible';fs.writeFileSync(file,JSON.stringify(binding('c'.repeat(32))));
 const req=id=>id==='./js/engine/build/production.cjs'?E:require(id),out=A.prepareNormalD2Entry(['--ps-d2-normal-stage=native-qualification','--ps-d2-native-binding='+file],req,{G:x.G,W:x.G});
 const authority={bindGroup(b){assert.equal(x.w.flow._app,prior);return {binding:b,assertCurrent(){},retire(){retired++;}};}},collector={append(row){if(row.kind==='binding'){observed=true;assert.notEqual(x.w.flow._app,prior);throw Error('controlled pre-opening sink failure');}}};
 await assert.rejects(out.consume(authority,collector),error=>{assert.match(error.receipt.error.message,/pre-opening sink failure/);return true;});assert(observed);assert.equal(retired,1);assert.equal(x.w.flow._app,prior);assert.equal(x.G.$gameSystem._psGame,game);assert.equal(x.G.SceneManager.updateMain,update);assert.equal(x.dispatches.length,0);assert.equal(x.w.flow.running,false);
});

test('authorized synthetic Title bootstrap requests one new game and waits an actual Map update before fixture installation',async()=>{
 const x=createNormalInputControlHost(h,managementText),file=path.join(h.work,'entry-title.json');assert(x.G.SceneManager._scene instanceof x.G.Scene_Title);let setups=0,retired=0,attached=false;const update=x.G.SceneManager.updateMain;
 Object.assign(x.G,{nw:{App:{argv:['--ps-flow-test=d2-normal-f100','--ps-d2-normal-stage=native-qualification']}},AbortController,requestAnimationFrame:()=>0,cancelAnimationFrame(){},innerWidth:816,innerHeight:624,devicePixelRatio:2});x.G.document.hasFocus=()=>true;x.G.document.visibilityState='visible';x.G.DataManager.setupNewGame=()=>{setups++;};fs.writeFileSync(file,JSON.stringify(binding('d'.repeat(32))));
 const req=id=>id==='./js/engine/build/production.cjs'?E:require(id),out=A.prepareNormalD2Entry(['--ps-d2-normal-stage=native-qualification','--ps-d2-native-binding='+file],req,{G:x.G,W:x.G});
 const authority={bindGroup(b){assert.equal(setups,0);return {binding:b,assertCurrent(){},retire(){retired++;}};}},collector={append(row){if(row.kind==='binding'){attached=true;assert.equal(setups,1);assert(x.G.SceneManager._scene instanceof x.G.Scene_Map);assert(x.G.SceneManager._scene.isStarted());throw Error('stop after controlled bootstrap');}}};
 await assert.rejects(x.pump(out.consume(authority,collector)),error=>{assert.match(error.receipt.error.message,/controlled bootstrap/);assert(error.receipt.records.some(r=>r.kind==='bootstrap-ready'));return true;});assert.equal(setups,1);assert(attached);assert.equal(retired,1);assert.equal(x.G.SceneManager.updateMain,update);assert.equal(x.dispatches.length,0);assert.equal(x.w.flow.running,false);
});

test('asynchronous or boolean current-checks cannot precede native inputs; the lease still retires',async t=>{
 for(const [nonce,check]of [['e',async()=>{}],['f',()=>true]]){
  const x=await owned(t),original=x.G.SceneManager.updateMain;let entered=0;x.authority={bindGroup(b){return {binding:b,assertCurrent:check,retire(){entered++;}};}};
  await assert.rejects(api.executeNativeQualificationGroup(E,x.G,x.G,x.fixture,tools,binding(nonce.repeat(32)),x.authority,x.collector),error=>{assert.match(error.receipt.error.message,/synchronous authority/);return true;});assert.equal(entered,1);assert.equal(x.G.SceneManager.updateMain,original);assert.equal(x.dispatches.length,0);released(x);
 }
});
test('asynchronous lease retirement is awaited and its failure stays secondary to the first collection error',async t=>{
 const x=await owned(t);let retired=false;x.authority={bindGroup(b){return {binding:b,assertCurrent(){},async retire(){await Promise.resolve();retired=true;throw Error('controlled async retirement failure');}};}};x.collector={append(row){if(row.kind==='binding')throw Error('controlled primary binding sink failure');}};
 await assert.rejects(api.executeNativeQualificationGroup(E,x.G,x.G,x.fixture,tools,binding('1'.repeat(32)),x.authority,x.collector),error=>{assert.match(error.receipt.error.message,/primary binding sink/);assert(error.receipt.cleanupErrors.some(x=>x.includes('async retirement failure')));return true;});assert(retired);released(x);
});
