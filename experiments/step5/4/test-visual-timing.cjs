'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..');let tmp,M;
test.before(()=>{
 tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-d2-visual-'));
 const config={compilerOptions:{target:'ES2022',module:'CommonJS',strict:true,types:[],lib:['ES2022'],rootDir:path.join(ROOT,'src/plugins/battleflow'),outDir:tmp,noEmitOnError:true},files:[path.join(ROOT,'src/plugins/battleflow/visual-timing.ts')]};
 const file=path.join(tmp,'tsconfig.json');fs.writeFileSync(file,JSON.stringify(config));
 const result=spawnSync('pnpm',['--dir','src','exec','tsc','-p',file],{cwd:ROOT,encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 M=require(path.join(tmp,'visual-timing.js'));
});
test.after(()=>{if(tmp)fs.rmSync(tmp,{recursive:true,force:true});});
const hp=(from=100,to=0,total=100)=>new M.HpPresentation({memberId:'P1',from,to,total});
const exp=(input={})=>new M.ExperiencePresentation({memberId:'P1',level:50,from:0,to:1,visible:true,...input});
const group=(tracks,effects=true)=>new M.BasicPictureGroup(tracks,effects);
const track=(id,kind='send-out',durationUnits=20,startUnits=0)=>({id,kind,durationUnits,startUnits});

for(const [from,to]of [[100,99],[100,0],[0,100]])test(`HP ${from}->${to} always uses 1 second from first actual sample`,()=>{
 const p=hp(from,to);assert.equal(p.sample(5000).value,from);assert.equal(p.sample(5500).value,(from+to)/2);assert(!p.sample(5999).complete);assert.deepEqual(p.sample(6000),{memberId:'P1',value:to,total:100,colour:M.hpColour(to,100),complete:true,cancelled:false});
});
test('HP colour uses floating displayed value and floored total thresholds independently',()=>{
 for(const [value,colour]of [[25,'red'],[25.0001,'yellow'],[50,'yellow'],[50.0001,'green']])assert.equal(M.hpColour(value,101),colour);
 const p=hp(101,0,101);p.sample(0);assert.equal(p.sample(500).value,50.5);assert.equal(p.sample(500).colour,'green');assert.equal(p.sample(750).value,25.25);assert.equal(p.sample(750).colour,'yellow');
 assert.equal(M.hpColour(.1,1),'green');assert.equal(M.hpColour(0,1),'red');
});
test('HP interpolation stays bounded and monotonic over multiple totals and both directions',()=>{
 for(let total=1;total<=47;total++)for(const [a,b]of [[0,total],[total,0]]){
  const p=hp(a,b,total);let previous=a;
  for(let t=0;t<=1000;t+=25){const v=p.sample(t).value;assert(v>=0&&v<=total);assert(a<b?v>=previous:v<=previous);previous=v;}
  assert.equal(previous,b);
 }
});
test('unchanged HP completes immediately, cancellation keeps the last display instead of assigning the target',()=>{
 assert(hp(30,30).sample(9000).complete);const p=hp();p.sample(0);assert.equal(p.sample(400).value,60);p.cancel();assert.deepEqual(p.sample(5000),{memberId:'P1',value:60,total:100,colour:'green',complete:true,cancelled:true});
});
test('numeric inputs and returned DTOs never retain caller-owned references',()=>{
 const input={memberId:'P1',from:100,to:0,total:100},p=new M.HpPresentation(input);input.to=77;const frame=p.sample(0);frame.value=-1;frame.memberId='other';assert.equal(p.sample(500).value,50);assert.equal(p.sample(1000).memberId,'P1');
});
for(const input of [{total:0},{total:1.5},{from:-1},{to:101},{from:NaN},{to:Infinity},{memberId:''}])test(`invalid HP projection fails before animation: ${JSON.stringify(input)}`,()=>assert.throws(()=>new M.HpPresentation({memberId:'P1',from:100,to:0,total:100,...input})));
test('nonmonotonic/invalid clock does not rebase or advance a valid HP track',()=>{
 const p=hp();p.sample(1000);assert.equal(p.sample(1400).value,60);for(const n of [NaN,Infinity,-1,1399])assert.throws(()=>p.sample(n));assert.equal(p.sample(1500).value,50);
});
test('experience partial segment uses 1.75 seconds per full bar and no full-bar flash',()=>{
 const p=exp({from:.25,to:.75});assert.deepEqual(p.sample(0).cues,['exp-gain']);assert.equal(p.sample(437.5).ratio,.5);assert.equal(p.sample(874).phase,'bar');assert(p.sample(875).complete);assert.deepEqual(p.sample(10000).cues,[]);
});
test('experience full segment has distinct 0.2 second flash, one request for each sound',()=>{
 const p=exp({from:.5});assert.deepEqual(p.sample(5000).cues,['exp-gain']);const full=p.sample(5875);assert.equal(full.ratio,1);assert.equal(full.phase,'flash');assert(!full.complete);assert.deepEqual(full.cues,['exp-full']);assert.deepEqual(p.sample(5875).cues,[]);assert(!p.sample(6074).complete);assert(p.sample(6075).complete);
});
test('late experience sample preserves the full cue once while elapsed duration catches up',()=>{
 const p=exp();p.sample(0);const ended=p.sample(9000);assert.equal(ended.phase,'done');assert.deepEqual(ended.cues,['exp-full']);assert.equal(ended.ratio,1);assert.deepEqual(p.sample(10000).cues,[]);
});
test('caller supplies every level segment; completed level never calculates growth or changes the next',()=>{
 const a=exp({level:50,from:.5}),b=exp({level:51,to:.25});a.sample(0);assert(a.sample(1075).complete);assert.equal(a.sample(1075).level,50);assert.equal(b.sample(2000).ratio,0);assert.equal(b.sample(2437.5).ratio,.25);assert(b.sample(2437.5).complete);
});
test('invisible and unchanged experience complete without audio or flash but preserve supplied final display',()=>{
 for(const input of [{visible:false},{from:1,to:1},{from:.5,to:.5}]){const p=exp(input),f=p.sample(10);assert(f.complete);assert.equal(f.phase,'done');assert.deepEqual(f.cues,[]);assert.equal(f.ratio,input.to??1);}
});
test('experience cancellation and detached cue arrays cannot emit late sound or final-value writes',()=>{
 const p=exp(),f=p.sample(0);f.cues.push('exp-full');p.sample(875);p.cancel();const last=p.sample(9999);assert(last.cancelled);assert.equal(last.ratio,.5);assert.deepEqual(last.cues,[]);
});
test('experience rejects invalid domain-independent display intervals',()=>{
 for(const input of [{level:0},{from:-.1},{from:.8,to:.7},{to:1.01},{to:Infinity},{visible:0}])assert.throws(()=>exp(input));
});
test('picture units are 1/20 second, not game ticks or rAF frames',()=>{
 assert.equal(M.pictureUnitsToMilliseconds(25),1250);assert.equal(M.pictureUnitsToMilliseconds(4),200);assert.equal(M.pictureUnitsToMilliseconds(.5),25);for(const v of [-1,NaN,Infinity,Number.MAX_VALUE])assert.throws(()=>M.pictureUnitsToMilliseconds(v));
});
test('parallel picture tracks run together and require a later completion observation',()=>{
 const p=group([track('player','send-out',20),track('foe','send-out',40)]);assert.deepEqual(p.sample(8000).frames.map(f=>f.progress),[0,0]);assert.deepEqual(p.sample(9000).frames.map(f=>f.progress),[1,.5]);const last=p.sample(10000);assert(last.frames.every(f=>f.complete));assert(!last.complete);assert(p.sample(10000).complete);
});
test('delayed first update anchors the group; late scheduled track uses its scheduled start',()=>{
 const p=group([track('foe','faint',20,10)]);assert(!p.sample(5000).frames[0].started);assert.equal(p.sample(6000).frames[0].progress,.5);assert.equal(p.sample(6500).frames[0].progress,1);assert(!p.sample(6500).cancelled);
});
test('zero-duration scheduled picture waits for its own start and then for the aggregate observation',()=>{
 const p=group([track('instant','recall',0,10)]);assert(!p.sample(0).frames[0].complete);assert(!p.sample(499).complete);const at=p.sample(500);assert(at.frames[0].complete);assert(!at.complete);assert(p.sample(500).complete);
});
test('Battle Effects off removes only optional move effect, preserving all basic feedback',()=>{
 const kinds=['send-out','recall','faint','capture','blocked-ball','move-effect'];const p=group(kinds.map(k=>track(k,k)),false);assert.deepEqual(p.sample(0).frames.map(f=>f.kind),kinds.slice(0,-1));assert(!p.sample(500).complete);assert(!p.sample(1000).complete);assert(p.sample(1000).complete);
 assert(group([track('optional','move-effect')],false).sample(0).complete);
});
test('cancelled group publishes no late pictures, detached output cannot alter completion state',()=>{
 const p=group([track('p')]);const frames=p.sample(0);frames.frames[0].progress=1;assert.equal(p.sample(500).frames[0].progress,.5);p.cancel();assert.deepEqual(p.sample(5000),{frames:[],complete:true,cancelled:true});
});
test('picture input snapshots, IDs and monotonic time are validated without callbacks',()=>{
 const a=track('p'),p=group([a]);a.durationUnits=0;assert.equal(p.sample(0).frames[0].progress,0);assert(!p.sample(500).frames[0].complete);assert.throws(()=>p.sample(499));assert.equal(p.sample(750).frames[0].progress,.75);
 for(const items of [[track('x'),track('x')],[track('x','unknown')],[track('x','faint',-1)],[track('x','faint',1,Infinity)]])assert.throws(()=>group(items));assert.throws(()=>group([],0));assert(group([]).sample(0).complete);
});
