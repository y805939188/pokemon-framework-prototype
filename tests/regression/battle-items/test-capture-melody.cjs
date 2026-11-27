'use strict';
// Pure ES2022 module: no renderer, audio backend, system clock, Session or SDK exports.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..');let temp,plan,Wait,config,WAIT;
test.before(()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-capture-melody-'));const root=path.join(ROOT,'src/plugins/battleflow');
 fs.writeFileSync(path.join(temp,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'CommonJS',strict:true,types:[],lib:['ES2022'],rootDir:root,outDir:path.join(temp,'out'),noEmitOnError:true},files:[path.join(root,'capture-melody.ts')]}));
 const r=spawnSync('pnpm',['--dir','src','exec','tsc','-p',path.join(temp,'tsconfig.json')],{cwd:ROOT,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
 ({captureMelodyPlan:plan,CaptureMelodyWait:Wait,CAPTURE_ME_WAIT_MS:WAIT}=require(path.join(temp,'out/capture-melody.js')));config=require(path.join(temp,'out/battle-music.js')).battleMusicConfig;
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});

test('capture plan is ME, fixed3500ms and a different default from victory BGM',()=>{
 const p=plan('wild',config());assert.equal(p.version,'capture-melody-plan-v1');assert.equal(p.channel,'me');assert.equal(p.waitMs,3500);assert.equal(WAIT,3500);assert.equal(p.track.name,'Battle capture success');assert.equal(p.selection.entry,'wild-capture');assert.equal(p.selection.origin,'default');assert.notEqual(p.track.name,'Battle victory');
});
test('trainer capture skips selection without reading any capture audio metadata or presets',()=>{
 const poison={get context(){throw Error('trainer selected capture');},get presets(){throw Error('trainer consumed preset');}};assert.equal(plan('trainer',poison),null);for(const kind of [null,undefined,'win',1,{},''])assert.throws(()=>plan(kind,poison),/battle kind/);
});
test('capture preset retains parsed volume/pitch/pan and never reads unrelated battle or victory fields',()=>{
 const c=config({presets:{battle:'B:13:41',victory:'V:23:51',capture:{name:'C',volume:37,pitch:83,pan:-12}},map:{wildCapture:'M'},global:{wildCapture:'G'}}),p=plan('wild',c);
 assert.deepEqual(p.track,{name:'C',volume:37,pitch:83,pan:-12});assert.equal(p.selection.origin,'preset');assert.equal(c.presets.capture.name,'C');assert.deepEqual(plan('wild',c),p);
 const lazy={context:{presets:{capture:'C'},get map(){throw Error('lower map');},get global(){throw Error('lower global');}},presets:{capture:c.presets.capture,get battle(){throw Error('battle');},get victory(){throw Error('victory');}}};assert.equal(plan('wild',lazy).track.name,'C');
});
test('string capture presets parse embedded parameters; ordinary metadata string playback keeps the accepted default parameters',()=>{
 assert.deepEqual(plan('wild',config({presets:{capture:'C:70:120'}})).track,{name:'C',volume:70,pitch:120,pan:0});
 assert.deepEqual(plan('wild',config({map:{wildCapture:'M:70:120'}})).track,{name:'M',volume:100,pitch:100,pan:0});
});
for(const [raw,name,origin]of [[{map:{wildCapture:'M'},global:{wildCapture:'G'}},'M','map'],[{map:{wildCapture:''},global:{wildCapture:'G'}},'G','global'],[{map:null,global:{wildCapture:null}},'Battle capture success','default'],[{presets:{capture:''},map:{wildCapture:'M'}},'M','map'],[{map:{wildCapture:'  曲  '}},'  曲  ','map']])test('capture selection '+origin+'/'+JSON.stringify(name),()=>{
 const p=plan('wild',config(raw));assert.equal(p.track.name,name);assert.equal(p.selection.origin,origin);assert.equal(p.selection.slot,'capture');
});
test('capture plan is detached/frozen and cannot mutate the source preset or another plan',()=>{
 const raw={presets:{capture:{name:'C',volume:70}},map:{wildCapture:'M'}},c=config(raw),p=plan('wild',c),q=plan('wild',c);raw.presets.capture.name='mutated';assert.equal(p.track.name,'C');assert.notEqual(p,q);assert.notEqual(p.track,q.track);assert.notEqual(p.selection,q.selection);
 assert.throws(()=>{p.track.name='bad';},TypeError);assert.throws(()=>{p.selection.origin='bad';},TypeError);assert.throws(()=>{p.waitMs=1;},TypeError);assert.equal(c.presets.capture.name,'C');
});
test('phase has no automatic clock origin or playback before explicit begin',()=>{
 const w=new Wait();assert.deepEqual(w.advance(9000),w.snapshot());assert.equal(w.snapshot().phase,'idle');assert(!w.snapshot().busy);assert(!w.snapshot().playAllowed);assert(!w.snapshot().stopRequired);assert.throws(()=>w.acknowledgeStop(),/not due/);
});
test('exact elapsed3500 requests stop and remains busy until the host acknowledges it',()=>{
 const w=new Wait();assert(w.begin(125.5).playAllowed);assert.equal(w.advance(3625.499).phase,'waiting');const due=w.advance(3625.5);assert.equal(due.phase,'stopping');assert(due.stopRequired);assert(due.busy);assert(!due.playAllowed);assert.equal(due.elapsedMs,3500);assert.equal(due.remainingMs,0);assert.equal(w.acknowledgeStop().phase,'done');assert(!w.snapshot().busy);assert(!w.snapshot().stopRequired);
});
test('fixed wait is independent of resource existence and early natural completion',()=>{
 // There is deliberately no decoder-ready or playback-ended input to shorten/reset the wait.
 for(const media of ['missing','failed','ended-early','loading']){const w=new Wait();w.begin(0);assert(w.advance(3499).busy,media);assert.throws(()=>w.acknowledgeStop(),/not due/);assert(w.advance(3500).stopRequired);assert(!w.acknowledgeStop().busy);}
});
test('skipped updates and repeated polling never consume the required stop or accept completion early',()=>{
 const w=new Wait();w.begin(100);const due=w.advance(9000);assert.equal(due.phase,'stopping');for(let i=0;i<5;i++){assert(w.snapshot().stopRequired);assert(w.advance(9000).stopRequired);assert(w.snapshot().busy);}w.acknowledgeStop();assert.equal(w.acknowledgeStop().phase,'done');assert.equal(w.advance(10000).phase,'done');assert(!w.snapshot().playAllowed);
});
test('duplicate begin cannot reset the3500 deadline or replay a completed phase',()=>{
 const w=new Wait();w.begin(100);w.begin(2000);assert.equal(w.advance(3599).phase,'waiting');assert.equal(w.advance(3600).phase,'stopping');w.acknowledgeStop();w.begin(8000);assert.equal(w.snapshot().phase,'done');assert(!w.snapshot().playAllowed);
});
for(const phase of ['idle','waiting','stopping','done'])test('cancel '+phase+' is idempotent, forbids late play and never releases another phase',()=>{
 const old=new Wait(),next=new Wait();if(phase!=='idle')old.begin(0);if(phase==='stopping'||phase==='done')old.advance(3500);if(phase==='done')old.acknowledgeStop();next.begin(1);
 const before=next.snapshot(),v=old.cancel();assert(!v.playAllowed);assert(!v.busy);assert.equal(v.remainingMs,0);assert.equal(v.stopRequired,phase==='waiting'||phase==='stopping');assert.deepEqual(old.cancel(),v);old.begin(5000);old.advance(6000);assert(!old.snapshot().playAllowed);assert.deepEqual(next.snapshot(),before);if(phase!=='done')assert.equal(old.acknowledgeStop().phase,'cancelled');
});
test('invalid/backwards clocks and overflow fail without altering accepted state',()=>{
 const w=new Wait();for(const bad of [NaN,Infinity,-Infinity,-1,'0',null,Number.MAX_SAFE_INTEGER+1]){assert.throws(()=>w.begin(bad),/time/);assert.equal(w.snapshot().phase,'idle');}assert.throws(()=>w.begin(Number.MAX_SAFE_INTEGER-3499),/deadline/);assert.equal(w.snapshot().phase,'idle');w.begin(100);w.advance(200);const before=w.snapshot();assert.throws(()=>w.advance(199.9),/monotonic/);assert.throws(()=>w.begin(99),/monotonic/);assert.deepEqual(w.snapshot(),before);assert.throws(()=>w.acknowledgeStop(),/not due/);
});
test('view mutation cannot remove a pending stop, reset time or cancel another poller',()=>{
 const w=new Wait();w.begin(0);const a=w.advance(3500);a.stopRequired=false;a.phase='done';a.elapsedMs=0;const b=w.snapshot();assert.equal(b.phase,'stopping');assert(b.stopRequired);assert.equal(b.elapsedMs,3500);assert.notEqual(a,b);w.acknowledgeStop();assert.equal(w.snapshot().phase,'done');
});
test('temporal boundary property over different starts and update partitions preserves minimum wait and one acknowledged end',()=>{
 for(const start of [0,0.5,1000,1e9])for(const step of [1,7,250,1000,3499]){const w=new Wait();w.begin(start);for(let elapsed=0;elapsed<3500;elapsed+=step){const v=w.advance(start+elapsed);assert.equal(v.phase,'waiting');assert(v.busy&&v.playAllowed&&!v.stopRequired);assert.equal(v.remainingMs,3500-elapsed);}assert(w.advance(start+3500).stopRequired);assert.equal(w.acknowledgeStop().phase,'done');}
});
test('a delayed duplicate begin reevaluates the original deadline and cannot authorize a late decode',()=>{
 const w=new Wait();w.begin(10);const late=w.begin(3510);assert.equal(late.phase,'stopping');assert(late.stopRequired);assert(!late.playAllowed);assert(late.busy);w.acknowledgeStop();assert(!w.begin(7000).playAllowed);
});
