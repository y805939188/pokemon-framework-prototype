'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..');let tmp,M,C;
test.before(()=>{
 tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-d2-playback-'));const source=path.join(ROOT,'src/plugins/battleflow');
 fs.writeFileSync(path.join(tmp,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'CommonJS',strict:true,types:[],lib:['ES2022'],rootDir:source,outDir:tmp,noEmitOnError:true},files:[path.join(source,'display.ts')]}));
 const r=spawnSync('pnpm',['--dir','src','exec','tsc','-p',path.join(tmp,'tsconfig.json')],{cwd:ROOT,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);M=require(path.join(tmp,'display.js')).BattleDisplayPlayback;C=require(path.join(tmp,'controller.js')).BattleSceneController;
});
test.after(()=>{if(tmp)fs.rmSync(tmp,{recursive:true,force:true});});
const card=(id='P',side='p1')=>({id,side,name:id,level:50,hp:100,maxhp:100,status:'',active:true,ratio:side==='p1'?0:null});
function fixture(cards=[card(),card('F','p2')]){
 const f={current:true,paint:[],cue:[],stops:[],time:0};f.p=new M(cards,{current:()=>f.current,paint:v=>{f.paint.push(v);f.onPaint?.(v);},cue:k=>{f.cue.push(k);f.onCue?.(k);return()=>f.stops.push(k);}});return f;
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
