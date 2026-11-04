'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..');let tmp,M,C,P;
test.before(()=>{
 tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-d2-playback-'));const source=path.join(ROOT,'src/plugins/battleflow');
 fs.writeFileSync(path.join(tmp,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'CommonJS',strict:true,types:[],lib:['ES2022'],rootDir:source,outDir:tmp,noEmitOnError:true},files:[path.join(source,'display.ts')]}));
 const r=spawnSync('pnpm',['--dir','src','exec','tsc','-p',path.join(tmp,'tsconfig.json')],{cwd:ROOT,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);M=require(path.join(tmp,'display.js')).BattleDisplayPlayback;C=require(path.join(tmp,'controller.js')).BattleSceneController;P=require(path.join(tmp,'picture-playback.js')).BattlePicturePlayback;
});
test.after(()=>{if(tmp)fs.rmSync(tmp,{recursive:true,force:true});});
const card=(id='P',side='p1')=>({id,side,name:id,level:50,hp:100,maxhp:100,status:'',active:true,ratio:side==='p1'?0:null});
function fixture(cards=[card(),card('F','p2')],picture){
 const f={current:true,paint:[],cue:[],stops:[],time:0};f.p=new M(cards,{current:()=>f.current,paint:v=>{f.paint.push(v);f.onPaint?.(v);},cue:k=>{f.cue.push(k);f.onCue?.(k);return()=>f.stops.push(k);},...(picture?{picture:(kind,actor)=>picture(f,kind,actor)}:{})});return f;
}
const event=(type,...args)=>({type,args});
test('initial and published projections are detached from inputs, snapshots and consumer mutations',()=>{
 const input=[card()],f=fixture(input),initial=f.p.initial();input[0].hp=1;initial.advance(0);assert.equal(f.p.snapshot()[0].hp,100);f.paint[0][0].hp=2;const snap=f.p.snapshot();snap[0].hp=3;assert.equal(f.p.snapshot()[0].hp,100);
});
test('queued HP changes preserve publicly ordered intermediate values despite future target planning',()=>{
 const f=fixture(),first=f.p.event(event('-damage','p1a: P','30/100'))[0],second=f.p.event(event('-heal','p1a: P','50/100'))[0];
 first.advance(0);assert.equal(f.p.snapshot()[0].hp,100);first.advance(500);assert.equal(f.p.snapshot()[0].hp,65);assert(!first.advance(999));assert(first.advance(1000));assert.equal(f.p.snapshot()[0].hp,30);
 second.advance(2000);assert.equal(f.p.snapshot()[0].hp,30);second.advance(2500);assert.equal(f.p.snapshot()[0].hp,40);assert(second.advance(3000));assert.equal(f.p.snapshot()[0].hp,50);
});
test('one published sethp event animates both targets in parallel and leaves target input unchanged',()=>{
 const f=fixture(),input=event('-sethp','p1a: P','50/100','p2a: F','25/100'),before=JSON.stringify(input),step=f.p.event(input)[0];step.advance(0);step.advance(500);assert.deepEqual(f.p.snapshot().map(x=>x.hp),[75,62.5]);assert(step.advance(1000));assert.deepEqual(f.p.snapshot().map(x=>x.hp),[50,25]);assert.equal(JSON.stringify(input),before);
});
test('both damage targets advance together even when the first port is pending; a slower port keeps HP endpoint blocked',()=>{
 const calls=[],f=fixture(undefined,(_,kind,actor)=>({kind:'visual',advance:now=>{calls.push([kind,actor.side,now]);return now>=(actor.side==='p1'?1100:1200);},cancel(){}}));
 const step=f.p.event(event('-sethp','p1a: P','50/100','p2a: F','25/100'))[0];assert.equal(calls.length,0);assert(!step.advance(0));assert.deepEqual(calls,[['damage','p1',0],['damage','p2',0]]);assert(!step.advance(1000));assert.deepEqual(f.p.snapshot().map(x=>x.hp),[50,25]);assert(!step.advance(1100));assert(step.advance(1200));
});
test('healing, unchanged HP, max-HP scale alone and inactive loss do not invent damage flashes',()=>{
 for(const [initial,type,text]of [[{...card(),hp:50},'-heal','100/100'],[{...card(),hp:50},'-damage','50/100'],[card(),'-sethp','50/50'],[{...card(),active:false},'-damage','30/100']]){
  let count=0;const f=fixture([initial],()=>{count++;assert.fail('unexpected damage port');}),step=f.p.event(event(type,'p1a: P',text))[0];step.advance(0);step.advance(1000);assert.equal(count,0);
 }
});
test('duplicate public HP target is refused before changing planned state or invoking a picture port',()=>{
 let count=0;const f=fixture(undefined,()=>{count++;return{kind:'visual',advance:()=>true,cancel(){}};});
 assert.throws(()=>f.p.event(event('-sethp','p1a: P','50/100','p1a: P','25/100')),/duplicate/);assert.equal(count,0);assert.equal(f.p.snapshot()[0].hp,100);const next=f.p.event(event('-damage','p1a: P','90/100'))[0];next.advance(0);next.advance(500);assert.equal(f.p.snapshot()[0].hp,95);
});
function rendered(){
 const f={current:true,update:0,created:[],paints:[],released:[]};
 f.view=new P({current:()=>f.current,updateOrdinal:()=>f.update,create:actor=>{const handle={...actor};f.created.push(handle);return handle;},paint:(handle,pose)=>f.paints.push({handle,pose:{...pose}}),release:h=>f.released.push(h),failed:e=>assert.fail(String(e))});
 f.p=new M([card(),card('F','p2')],{current:()=>f.current,paint:cards=>{f.cards=cards;f.view.sync(cards.filter(x=>x.active&&x.hp>0).map(x=>({id:x.id,side:x.side,name:x.name})));f.onPaint?.();},picture:(kind,actor)=>f.view.step(kind,actor),cue:()=>undefined});f.p.initial().advance(0);return f;
}
test('actual display and picture consumers keep both targets parallel while HP still owns its full second',()=>{
 const f=rendered(),step=f.p.event(event('-sethp','p1a: P','50/100','p2a: F','25/100'))[0];assert(!step.advance(0));f.update++;assert(!step.advance(75));assert(f.view.snapshot().actors.every(x=>x.body===0&&x.shadow===1));f.update++;assert(!step.advance(600));f.update++;assert(!step.advance(600));assert.equal(f.view.snapshot().runningGroups,0);assert(f.cards[0].hp>50);f.update++;assert(step.advance(1000));assert.deepEqual(f.cards.map(x=>x.hp),[50,25]);f.view.dispose();
});
test('late HP0 release still owes damage next-update observation with no extra allocation or repaint',()=>{
 const f=rendered(),step=f.p.event(event('-damage','p1a: P','0 fnt'))[0];step.advance(0);f.update++;assert(!step.advance(9000));const count=f.created.length;assert.equal(f.cards[0].hp,0);assert(!step.advance(9001));assert.equal(f.created.length,count);assert.equal(f.view.snapshot().runningGroups,1);f.update++;assert(step.advance(9001));assert.equal(f.released.length,1);f.view.dispose();
});
test('composite cancellation attempts both picture cancellations and retains separate cleanup errors',()=>{
 const cancelled=[],f=fixture(undefined,(_,kind,actor)=>({kind:'visual',advance:()=>false,cancel(){cancelled.push(actor.side);if(actor.side==='p1')throw Error('first port cleanup');}})),step=f.p.event(event('-sethp','p1a: P','50/100','p2a: F','25/100'))[0];step.advance(0);step.cancel();assert.deepEqual(cancelled,['p1','p2']);assert.equal(f.p.cleanupErrors.length,1);assert(step.advance(1000));step.cancel();assert.equal(cancelled.length,2);
});
test('owner replacement during HP paint prevents even allocating its damage picture port',()=>{
 let created=0;const f=fixture(undefined,()=>{created++;assert.fail('stale picture');});f.onPaint=()=>{f.current=false;};const step=f.p.event(event('-damage','p1a: P','50/100'))[0];assert(!step.advance(0));assert(step.advance(9000));assert.equal(created,0);
});
test('published status/faint and side-qualified duplicate IDs do not cross sides',()=>{
 const f=fixture([card('same'),card('same','p2')]);f.p.event(event('-status','p2a: same','tox'))[0].advance(0);assert.deepEqual(f.p.snapshot().map(x=>x.status),['','tox']);f.p.event(event('faint','p2a: same'))[0].advance(1);assert.deepEqual(f.p.snapshot().map(x=>x.hp),[100,0]);
});
test('switch publishes current member, while inactive members are kept for later stable-ID selection',()=>{
 const backup={...card('B'),active:false};const f=fixture([card(),backup,card('F','p2')]);f.p.event(event('switch','p1a: B','Eevee, L50','70/100 par'))[0].advance(0);assert.deepEqual(f.p.snapshot().filter(x=>x.side==='p1').map(x=>[x.id,x.active,x.hp]),[['P',false,100],['B',true,70]]);
});
test('late full-bar cue owes 200ms of actual painted flash, not merely logical tween completion',()=>{
 const f=fixture(),s=f.p.experience('P',{level:50,from:0,to:1});assert(!s.advance(0));assert(!s.advance(9000));assert(f.p.snapshot()[0].flash);assert(!s.advance(9199));assert(f.p.snapshot()[0].flash);assert(s.advance(9200));assert(!f.p.snapshot()[0].flash);assert.deepEqual(f.cue,['exp-gain','exp-full']);assert(s.advance(9500));assert.deepEqual(f.cue,['exp-gain','exp-full']);
});
test('normal full-bar feedback is painted for its own complete 200ms',()=>{
 const f=fixture(),s=f.p.experience('P',{level:50,from:.5,to:1});s.advance(0);assert(!s.advance(875));assert(f.p.snapshot()[0].flash);assert(!s.advance(1074));assert(s.advance(1075));assert(!f.p.snapshot()[0].flash);
});
test('inactive player experience consumes no visual duration or audio',()=>{
 const f=fixture([{...card(),active:false}]),s=f.p.experience('P',{level:50,from:0,to:1});assert(s.advance(2000));assert.deepEqual(f.cue,[]);assert.equal(f.p.snapshot()[0].ratio,1);
});
test('published final growth updates level and HP scale without inventing a healing tween',()=>{
 const f=fixture(),s=f.p.growth('P',{toLevel:51,hp:101,maxhp:110,ratio:.1});assert(s.advance(0));assert.deepEqual([f.p.snapshot()[0].level,f.p.snapshot()[0].hp,f.p.snapshot()[0].maxhp,f.p.snapshot()[0].ratio],[51,101,110,.1]);assert.deepEqual(f.cue,[]);
});
for(const ending of ['cancel','dispose','replace'])test(`experience ${ending} prevents late paints/cues and releases only owned audio`,()=>{
 const f=fixture(),s=f.p.experience('P',{level:50,from:0,to:1});s.advance(0);const n=f.paint.length;
 if(ending==='cancel')s.cancel();else if(ending==='dispose')f.p.dispose();else f.current=false;
 assert(s.advance(9999));assert.equal(f.paint.length,n);assert.deepEqual(f.cue,['exp-gain']);f.p.dispose();assert.deepEqual(f.stops,['exp-gain']);f.p.dispose();assert.equal(f.stops.length,1);
});
test('owner replacement during paint prevents the subsequent sound request',()=>{
 const f=fixture();f.onPaint=()=>{f.current=false;};const s=f.p.experience('P',{level:50,from:0,to:1});assert(!s.advance(0));assert.deepEqual(f.cue,[]);assert(s.advance(9999));
});
test('owner replacement during sound request immediately releases that newly created handle',()=>{
 const f=fixture();f.onCue=()=>{f.current=false;};const s=f.p.experience('P',{level:50,from:0,to:1});assert(!s.advance(0));assert.deepEqual(f.stops,['exp-gain']);f.p.dispose();assert.equal(f.stops.length,1);
});
test('malformed public HP refuses before any new rendering',()=>{
 const f=fixture();for(const hp of ['-1/100','101/100','20/0','bad'])assert.throws(()=>f.p.event(event('-damage','p1a: P',hp)));assert.equal(f.paint.length,0);assert.equal(f.p.snapshot()[0].hp,100);
});
function controller(){
 const f={active:true,current:true,trace:[],time:0,aborts:0};f.c=new C({current:()=>f.current,active:()=>f.active,closedFailure:()=>Error('closed'),hideInput(){},appendLine:x=>f.trace.push(x),refreshStatus(){},afterMessages:()=>f.c.show('main'),abort:()=>{f.aborts++;f.active=false;},unusableView(){},now:()=>f.time,actionMeasured(){}});f.c.ready=true;f.c.show('main');return f;
}
test('controller fast-forward stops at a visual step and does not release input until all presentation completes',()=>{
 const f=controller(),d=fixture(),v=d.p.event(event('-damage','p1a: P','0 fnt'))[0];f.c.enqueue(['before',v,'after']);f.c.tick(true,0);assert.deepEqual(f.trace,['before']);assert(!f.c.canChoose());f.c.tick(true,0);f.time=999;f.c.tick(true,0);assert(!f.c.canChoose());assert.deepEqual(f.trace,['before']);f.time=1000;f.c.tick(true,0);assert.equal(d.p.snapshot()[0].hp,0);f.c.tick(true,0);f.c.tick(true,0);assert.deepEqual(f.trace,['before','after']);assert(f.c.canChoose());
});
for(const ending of ['dispose','closed','throw'])test(`controller ${ending} cancels pending display steps, keeps original owner boundary`,()=>{
 const f=controller();let cancelled=0,calls=0;f.c.enqueue([{kind:'visual',advance(){calls++;if(ending==='throw')throw Error('paint');return false;},cancel(){cancelled++;}}]);
 if(ending==='dispose')f.c.dispose();else if(ending==='closed')f.active=false;
 f.c.tick(true,0);assert.equal(cancelled,1);assert.equal(calls,ending==='throw'?1:0);assert.equal(f.aborts,ending==='throw'?1:0);
});
test('visual reentry cannot release input or consume successor queue after owner replacement',()=>{
 const f=controller();f.c.enqueue([{kind:'visual',advance(){assert(!f.c.input(()=>assert.fail('early input')));f.current=false;return true;},cancel(){}}]);f.c.tick(true,0);assert.equal(f.c.queue.length,1);assert(!f.c.canChoose());assert.equal(f.aborts,0);
});

test('real paint cost is outside the required 200ms full-bar exposure',()=>{
 let now=0;const paints=[],p=new M([card()],{current:()=>true,paint:cards=>{now+=35;paints.push(cards[0].flash);},afterPaintNow:()=>now,cue:()=>undefined}),step=p.experience('P',{level:50,from:0,to:1});
 assert(!step.advance(0));now=9000;assert(!step.advance(now));assert.equal(now,9035);now=9234;assert(!step.advance(now));assert.equal(p.snapshot()[0].flash,true);now=9235;assert(step.advance(now));assert.equal(p.snapshot()[0].flash,false);assert.deepEqual(paints,[false,true,true,false]);
});

for (const kind of ['experience','growth']) test(kind+' valid public replacement clears initial EXP uncertainty only when painted',()=>{
 for(const ratio of [0,.25]){
  const initial={...card(),ratio:null,experienceUnavailable:'outside-level-interval'},f=fixture([initial]);f.p.initial().advance(0);
  const status=f.p.event(event('-status','p1a: P','par'))[0];status.advance(1);assert.equal(f.p.snapshot()[0].ratio,null);assert.equal(f.p.snapshot()[0].experienceUnavailable,'outside-level-interval');
  assert.throws(()=>kind==='experience'?f.p.experience('P',{level:50,from:0,to:2}):f.p.growth('P',{toLevel:50,hp:100,maxhp:100,ratio:2}));
  assert.equal(f.p.snapshot()[0].experienceUnavailable,'outside-level-interval');
  const step=kind==='experience'?f.p.experience('P',{level:50,from:ratio,to:ratio}):f.p.growth('P',{toLevel:50,hp:100,maxhp:100,ratio});
  assert.equal(f.p.snapshot()[0].ratio,null,'planning does not paint early');assert.equal(f.p.snapshot()[0].experienceUnavailable,'outside-level-interval');
  assert(step.advance(2));assert.equal(f.p.snapshot()[0].ratio,ratio);assert.equal(f.p.snapshot()[0].experienceUnavailable,undefined);assert.deepEqual(f.cue,[]);
 }
});
