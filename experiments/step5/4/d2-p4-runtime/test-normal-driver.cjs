'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {NormalDriver,installGameFrames,bindBattleScene,domDispatch}=require('./normal-driver.cjs');
const {compileIntentions,validateResolvedTraceShape}=require('./workload-plan.cjs');
const {frameSummary,waitUnion,naturalMedian,warnComparison}=require('./metrics.cjs');

function fixture() {
  const h={time:0,events:[],held:null,timers:new Map(),serial:0,processOk:0};
  const owner={fixture:true};
  const s={owner,current:true,fast:false,effects:true,phase:'main',ready:true,index:0,columns:2,
    menuToken:1,items:['fight','bag','party','run'].map(key=>({key,enabled:true})),message:null,messageToken:null,logPaused:false};
  const G={SceneManager:{updateMain(){
    if(h.held){
      const key=h.held,at=s.index,cols=s.columns;
      if(key==='right')s.index=Math.min(s.items.length-1,at+1);
      if(key==='left')s.index=Math.max(0,at-1);
      if(key==='down'&&at+cols<s.items.length)s.index=at+cols;
      if(key==='up'&&at-cols>=0)s.index=at-cols;
      if(key==='ok'){h.processOk++;s.ready=false;}
    }
    h.onUpdate?.();
  }}};
  const frames=installGameFrames(G,{now:()=>h.time,setTimer:(fn,ms)=>{const id=++h.serial;h.timers.set(id,{fn,at:h.time+ms});return id;},clearTimer:id=>h.timers.delete(id)});
  const ports={now:()=>h.time,read:()=>({...s,gameTick:frames.gameTick()}),...frames,
    dispatch(type,key){h.events.push({type,key,frame:frames.gameTick()});if(type==='keydown')h.held=key;else if(h.held===key)h.held=null;}};
  Object.assign(h,{G,s,frames,ports,owner,driver:new NormalDriver(ports,owner),
    tick(){h.time+=17;G.SceneManager.updateMain();},
    expire(){h.time=9999;for(const row of [...h.timers.values()])row.fn();}});
  return h;
}
async function pump(promise,h,limit=100) {
  let done=false,value,error;
  promise.then(x=>{done=true;value=x;},e=>{done=true;error=e;});
  for(let i=0;!done&&i<limit;i++){for(let k=0;k<8;k++)await Promise.resolve();if(!done)h.tick();}
  if(!done)throw Error('controlled promise did not settle');
  if(error!==undefined)throw error;
  return value;
}

test('normal grid navigation confirms once through sampled input and releases each key',async()=>{
  const h=fixture();const row=await pump(h.driver.choose('main','run',1000),h);
  assert.equal(row.index,3);assert.equal(h.processOk,1);assert.equal(h.held,null);
  assert.deepEqual(h.events.filter(e=>e.type==='keydown').map(e=>e.key),['down','right','ok']);
  for(const key of ['down','right','ok']){
    const down=h.events.find(e=>e.type==='keydown'&&e.key===key),up=h.events.find(e=>e.type==='keyup'&&e.key===key);
    assert.equal(up.frame-down.frame,1,'release in first game update finally');
  }
});
test('confirm key is released before a following typing frame',async()=>{
  const h=fixture();let successorFrames=0,heldSuccessor=0;
  h.onUpdate=()=>{if(h.processOk){if(successorFrames++>0&&h.held==='ok')heldSuccessor++;}};
  await pump(h.driver.choose('main','fight',1000),h);
  assert.equal(heldSuccessor,0);assert.equal(h.processOk,1);
});
test('typing ordinary/brief text receives no automatic fast-forward input',async()=>{
  const h=fixture();h.s.ready=false;h.s.message={implementation:'ordinary-message-v1',phase:'typing',visible:0,total:10};
  await assert.rejects(pump(h.driver.choose('main','fight',60),h),/deadline/);
  assert.equal(h.events.length,0);
});
test('full paused page is acknowledged on a later game update only',async()=>{
  const h=fixture();h.s.message={implementation:'paused-message-v1',phase:'typing',visible:0,total:3};
  h.s.logPaused=true;h.s.messageToken='page1';h.s.messageFullGameTick=2;
  h.onUpdate=()=>{if(h.frames.gameTick()>=2)Object.assign(h.s.message,{phase:'full',visible:3});};
  await pump(h.driver.acknowledgePause(1000),h);
  const press=h.events.find(e=>e.type==='keydown');assert(press.frame>2);assert.equal(h.processOk,1);
});
test('ordinary full text cannot be mistaken for explicit paused acknowledgement',async()=>{
  const h=fixture();Object.assign(h.s,{message:{implementation:'ordinary-message-v1',phase:'full',visible:1,total:1},messageToken:'ordinary',messageFullGameTick:0,logPaused:true});
  await assert.rejects(pump(h.driver.acknowledgePause(60),h),/deadline/);assert.equal(h.events.length,0);
});
test('stat page requires exact level/phase and independent sampled update',async()=>{
  const h=fixture();Object.assign(h.s,{stats:{level:51,phase:'delta'},statsToken:'51/delta',statsShownGameTick:0});
  await pump(h.driver.acknowledgeStats(51,'delta',1000),h);
  assert(h.events.find(x=>x.type==='keydown').frame>0);assert.equal(h.processOk,1);
  await assert.rejects(pump(h.driver.acknowledgeStats(51,'delta',1000),h),/already acknowledged/);
});
test('disabled and missing targets are rejected without a key',async()=>{
  for(const key of ['missing','fight']){const h=fixture();h.s.items[0].enabled=false;await assert.rejects(pump(h.driver.choose('main',key,1000),h),/missing\/disabled/);assert.equal(h.events.length,0);}
});
test('ambiguous enabled keys reject while disabled null slots do not hide Cancel',async()=>{
  const bad=fixture();bad.s.items[1].key='fight';await assert.rejects(pump(bad.driver.choose('main','fight',1000),bad),/ambiguous/);assert.equal(bad.events.length,0);
  const h=fixture();h.s.items[0]={key:null,enabled:false};h.s.items[1]={key:null,enabled:true};
  await pump(h.driver.choose('main',null,1000),h);assert.equal(h.processOk,1);assert.equal(h.s.index,1);
});
test('owner replacement during navigation releases and sends no successor confirmation',async()=>{
  const h=fixture();h.onUpdate=()=>{h.s.current=false;};
  await assert.rejects(pump(h.driver.choose('main','run',1000),h),/stale input owner/);
  assert.deepEqual(h.events.filter(x=>x.type==='keydown').map(x=>x.key),['down']);assert.equal(h.held,null);
});
test('menu replacement during navigation fails without trying another route',async()=>{
  const h=fixture();h.onUpdate=()=>{h.s.menuToken++;};
  await assert.rejects(pump(h.driver.choose('main','run',1000),h),/menu changed/);assert.equal(h.processOk,0);
});
test('fast/effects policy changes, retired drivers and unknown deadlines never press',async()=>{
  for(const alter of [h=>h.s.fast=true,h=>h.s.effects=false,h=>h.driver.retire()]){const h=fixture();alter(h);await assert.rejects(pump(h.driver.choose('main','fight',1000),h));assert.equal(h.events.length,0);}
  const h=fixture();await assert.rejects(pump(h.driver.choose('main','fight',NaN),h),/deadline/);assert.equal(h.events.length,0);
});
test('reentrant choice is rejected while one semantic wait owns the driver',async()=>{
  const h=fixture();h.s.ready=false;const first=h.driver.choose('main','fight',60);
  await assert.rejects(h.driver.choose('main','bag',60),/reentrant/);
  await assert.rejects(pump(first,h),/deadline/);assert.equal(h.events.length,0);
});
test('stalled game loop deadline releases held key without a retry',async()=>{
  const h=fixture();const attempt=h.driver.choose('main','fight',1000);
  const checked=assert.rejects(attempt,/game update deadline/);
  for(let i=0;i<12;i++)await Promise.resolve();assert.equal(h.held,'ok');h.expire();await checked;
  assert.equal(h.held,null);assert.equal(h.events.filter(e=>e.type==='keydown').length,1);
});
test('game fatal is rethrown while one-frame release and promise rejection still happen',async()=>{
  let key=false;const fatal=Error('original fatal');const G={SceneManager:{updateMain(){throw fatal;}}};
  const c=installGameFrames(G,{now:()=>0,setTimer:()=>1,clearTimer(){}});
  key=true;const pending=c.afterOneGameUpdate(()=>{key=false;},100);
  const rejected=assert.rejects(pending,e=>e===fatal);
  assert.throws(()=>G.SceneManager.updateMain(),e=>e===fatal);await rejected;assert.equal(key,false);c.dispose();
});
test('release and timer failures cannot replace the original game fatal',async()=>{
  const fatal=Error('original game fatal'),release=Error('release failed'),timer=Error('timer cleanup failed');
  const G={SceneManager:{updateMain(){throw fatal;}}};
  const c=installGameFrames(G,{now:()=>0,setTimer:()=>1,clearTimer(){throw timer;}});
  const pending=c.afterOneGameUpdate(()=>{throw release;},100);
  const rejected=assert.rejects(pending,e=>e.primary===fatal && e.cleanupErrors[0]===timer && e.cleanupErrors[1]===release);
  assert.throws(()=>G.SceneManager.updateMain(),e=>e===fatal);await rejected;
});
test('dispatch failure retains its first cause even if final key release also fails',async()=>{
  const h=fixture(),original=h.ports.dispatch;const first=Error('keydown failed');
  h.ports.dispatch=(type,key)=>{original(type,key);throw type==='keydown'?first:Error('keyup failed');};
  await assert.rejects(pump(h.driver.choose('main','fight',1000),h),e=>e.primary===first && e.cleanupErrors.length===1);
  assert.equal(h.held,null);
});
test('game clock ignores display ticks and restores only its own wrapper',async()=>{
  let logic=0;const original=()=>logic++;const G={SceneManager:{updateMain:original}};
  const c=installGameFrames(G,{now:()=>0,setTimer:()=>1,clearTimer(){}});let resolved=false;
  const p=c.nextGameUpdate(100).then(()=>resolved=true);await Promise.resolve();assert.equal(resolved,false);
  G.SceneManager.updateMain();await p;assert.equal(logic,1);assert.equal(c.gameTick(),1);
  const successor=()=>{};G.SceneManager.updateMain=successor;c.dispose();assert.equal(G.SceneManager.updateMain,successor);
});
test('disposed game clock cannot dispatch a new key even if scene owner still matches',async()=>{
  const h=fixture();h.frames.dispose();await assert.rejects(pump(h.driver.choose('main','fight',1000),h),/clock no longer current/);
  assert.equal(h.events.length,0);
});
test('DOM dispatch uses project key codes and refuses unknown input',()=>{
  const events=[];class KeyEvent{constructor(type,fields){this.type=type;Object.assign(this,fields);}}
  const dispatch=domDispatch({dispatchEvent:e=>events.push(e)},KeyEvent);
  dispatch('keydown','ok');dispatch('keyup','ok');assert.deepEqual(events.map(x=>[x.type,x.keyCode]),[['keydown',13],['keyup',13]]);
  assert.throws(()=>dispatch('keydown','mystery'),/unknown input/);
});
function bindingFixture(){
  const op={},app={stateGeneration:1},window={_items:[{ext:'fight'}],index:()=>0};
  const scene={_psBattle:true,_psOp:op,_menu:window,_log:{pause:false},_ordinaryMessage:null,
    inputState:()=>({phase:'main',ready:true,items:[{key:'fight',enabled:true}],columns:2}),ordinaryMessageState:()=>null};
  const flow={_op:op,_app:app,running:true,fast:false};const G={SceneManager:{_scene:scene}};
  const bound=bindBattleScene(G,{PSFlow:flow},{gameTick:()=>2},()=>true);return{G,flow,scene,app,bound};
}
test('real-shaped BattleScene adapter binds existing DTO and actual owner, no fake App',()=>{
  const h=bindingFixture(),s=h.bound.read();assert.equal(s.current,true);assert.equal(s.phase,'main');assert.equal(s.items[0].key,'fight');
  h.app.stateGeneration++;assert.equal(h.bound.read().current,false);
});
test('Scene or root replacement invalidates adapter and it does not follow successor',()=>{
  const h=bindingFixture();h.G.SceneManager._scene={};assert.equal(h.bound.read().current,false);
  h.flow._op={};assert.equal(h.bound.read().current,false);
});
test('unsupported receiving scene cannot silently reuse the BattleScene adapter',()=>{
  assert.throws(()=>bindBattleScene({SceneManager:{_scene:{}}},{PSFlow:{}},{},()=>true),/actual battle owner/);
});
test('intent compiler preserves actual Node input hash and exact hundred IDs/seeds',()=>{
  const p=compileIntentions();assert.equal(p.cases.length,100);assert.equal(p.status,'TRACE_RESOLUTION_REQUIRED_NOT_EXECUTABLE');
  assert.equal(p.donorHash,'93507d4bca39de181c462158240b87691fea1b09588d10494ad9c6692425ec4e');
  assert.deepEqual(p.cases.at(-1).seed,[1,2,3,103]);assert(p.cases.every(c=>c.resolvedNormalActions===null));
});
test('unresolved intentions cannot pass the resolved trace shape gate',()=>{
  assert.throws(()=>validateResolvedTraceShape(compileIntentions()),/resolved normal trace/);
});
test('full trace requires exact ordered seeds, same input identity and finite per-action bounds',()=>{
  const p=compileIntentions(),trace={version:'D2-normal-resolved-trace-v1',donorHash:p.donorHash,presentationHash:p.presentationHash,
    cases:p.cases.map(c=>({id:c.id,seed:c.seed,deadlineMs:100,actions:[{kind:'choose',phase:'main',key:'fight',deadlineMs:100}]}))};
  assert.equal(validateResolvedTraceShape(trace).status,'TRACE_SHAPE_VALID_PENDING_SEMANTIC_REVIEW');
  trace.cases[99].seed[3]++;assert.throws(()=>validateResolvedTraceShape(trace),/unresolved case/);
});
test('frame clocks and long runs preserve unfocused samples and strict >33ms',()=>{
  const raw=[{kind:'updateMain',t:1,dt:33,focus:true,visibility:'visible'},{kind:'rAF',t:2,dt:8,focus:true,visibility:'visible'},
    {kind:'updateMain',t:3,dt:34,focus:false,visibility:'hidden'},{kind:'updateMain',t:4,dt:40,focus:true,visibility:'visible'}];
  const x=frameSummary(raw).clocks;assert.equal(x.updateMain.count,3);assert.equal(x.updateMain.over33,2);assert.equal(x.updateMain.unfocused,1);
  assert.equal(x.rAF.p95,8);assert.equal(x.updateMain.longRuns[0].length,2);assert.deepEqual(x.updateMain.raw,[raw[0],raw[2],raw[3]]);
});
test('empty frame streams are NOT_SAMPLED-like nulls rather than zero performance',()=>{
  const x=frameSummary([]).clocks.updateMain;assert.equal(x.count,0);assert.equal(x.p95,null);assert.equal(x.over33Ratio,null);
});
test('invalid or reordered frame samples cannot be normalized away',()=>{
  assert.throws(()=>frameSummary([{kind:'updateMain',t:2,dt:34},{kind:'updateMain',t:1,dt:40}]),/reordered/);
  assert.throws(()=>frameSummary([{kind:'rAF',t:1,dt:Infinity}]),/invalid/);
});
test('overlapping intentional waits use union without mutating raw intervals',()=>{
  const raw=[{start:0,end:1000},{start:500,end:1500},{start:1700,end:1800}];
  assert.equal(waitUnion(raw).milliseconds,1600);assert.deepEqual(raw[1],{start:500,end:1500});
});
test('natural medians refuse GC/off mixing or pooled duplicate runs',()=>{
  assert.equal(naturalMedian([{mode:'natural1',value:20},{mode:'natural2',value:10},{mode:'natural3',value:100}]),20);
  assert.throws(()=>naturalMedian([{mode:'natural1',value:20},{mode:'natural2',value:10},{mode:'GC1',value:100}]),/natural/);
});
test('comparison remains WARN-only or NOT_COMPARABLE, nonpositive ratios N/A',()=>{
  assert.equal(warnComparison(100,121,{comparable:true,unit:'ms'}).status,'WARN');
  assert.equal(warnComparison(100,120,{comparable:true,unit:'ms'}).status,'REPORTED');
  assert.equal(warnComparison(0,10,{comparable:true,unit:'bytes'}).ratio,null);
  assert.equal(warnComparison(100,90,{comparable:false,unit:'ms'}).status,'NOT_COMPARABLE');
});
