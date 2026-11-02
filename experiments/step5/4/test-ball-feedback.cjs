'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..');let temp,M;
test.before(()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-ball-feedback-'));const source=path.join(ROOT,'src/plugins/battleflow/ball-feedback.ts');
 fs.writeFileSync(path.join(temp,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'CommonJS',strict:true,types:[],lib:['ES2022'],rootDir:path.dirname(source),outDir:temp,noEmitOnError:true},files:[source]}));
 const r=spawnSync('pnpm',['--dir','src','exec','tsc','-p',path.join(temp,'tsconfig.json')],{cwd:ROOT,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
 if(process.env.PF_BALL_FEEDBACK_MUTATION){
  assert.equal(process.env.PF_BALL_FEEDBACK_MUTATION,'early-result');const file=path.join(temp,'ball-feedback.js'),source=fs.readFileSync(file,'utf8'),marker='resultReady: frame.complete && !frame.cancelled';assert.equal(source.split(marker).length,2);fs.writeFileSync(file,source.replace(marker,'resultReady: !frame.cancelled'));
 }
 M=require(path.join(temp,'ball-feedback.js'));
});
test.after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
const timing={throwUnits:10,absorbUnits:4,shakeUnits:8,settleUnits:6,blockUnits:5}; // Explicit synthetic presentation inputs, not a production preset.
const event=(outcome='caught',checks=4,critical=0)=>({type:'rpg',args:['ball','p1','masterball','F-1',outcome,String(checks),String(critical)]});
const phases=p=>p.phases.map(x=>x.id);
async function realBall(kind,ball='masterball',species='Pidgey',level=5){
 const {BattleSession}=require(path.join(ROOT,'js/engine/game/session.cjs')),F=require(path.join(ROOT,'experiments/step2/s3/fixtures.cjs'));
 const game=F.makeGame(),s=await BattleSession.create({game,content:F.content,battleId:'ball-feedback-'+kind+'-'+ball,seed:[1,2,3,4],foe:{kind,team:[F.foeMember('F-1',species,level)]}});
 s.take();const r=await s.throwBall(ball);assert(r.ok);const e=r.messages.flatMap(m=>m.kind==='events'?m.events:[]).find(e=>e.type==='rpg'&&e.args[0]==='ball');assert(e);return {s,e,game};
}
test('actual Gen8 masterball result builds a detached success plan without further bag/model writes',async()=>{
 const {s,e,game}=await realBall('wild');const before=JSON.stringify({bag:s.bag,game,event:e});const p=M.ballFeedbackPlan(e,timing);assert.equal(p.outcome,'caught');assert.equal(p.checks,4);assert.equal(p.target,'F-1');assert.equal(p.ball,'masterball');assert.deepEqual(phases(p),['throw','absorb','shake','seal']);
 const c=new M.BallFeedbackClock(p,true);c.sample(0,0);c.sample(1400,1);assert(c.sample(1400,2).resultReady);assert.equal(JSON.stringify({bag:s.bag,game,event:e}),before);
});
test('actual trainer ball is blocked with no target absorption or invented capture result',async()=>{
 const {s,e}=await realBall('trainer');try{const p=M.ballFeedbackPlan(e,timing);assert.equal(p.outcome,'blocked');assert.equal(p.target,null);assert.equal(p.checks,null);assert.deepEqual(phases(p),['throw','block']);const c=new M.BallFeedbackClock(p,false);assert.equal(c.sample(500,0).phase,'throw');assert.equal(c.sample(1000,1).phase,'block');assert(!c.sample(1250,2).resultReady);assert(c.sample(1250,3).resultReady);}finally{await s.cancel();}
});
test('actual ordinary failed ball uses the published escaped result and does not reinterpret its checks',async()=>{
 const {s,e}=await realBall('wild','pokeball','Snorlax',100);try{assert.equal(e.args[4],'escaped');const p=M.ballFeedbackPlan(e,timing);assert.equal(p.outcome,'escaped');assert.equal(p.checks,Number(e.args[5]));assert.equal(p.phases.at(-1).id,'burst');assert(!phases(p).includes('seal'));}finally{await s.cancel();}
});
test('all four ordinary failure outcomes keep their published checks and omit only the zero-check shake phase',()=>{
 for(let n=0;n<4;n++){const p=M.ballFeedbackPlan(event('escaped',n),timing);assert.equal(p.checks,n);assert.deepEqual(phases(p),n?['throw','absorb','shake','burst']:['throw','absorb','burst']);}
});
test('critical metadata is retained independently; no capture probability or visible-wiggle count is inferred',()=>{
 for(const [outcome,checks]of [['caught',4],['escaped',0]]){const p=M.ballFeedbackPlan(event(outcome,checks,1),timing);assert.equal(p.critical,true);assert.equal(p.checks,checks);assert.equal(p.outcome,outcome);assert(!('visibleShakes'in p));}
});
test('unsupported, enemy and legacy incomplete events retain text fallback instead of fabricated animation',()=>{
 for(const e of [{type:'damage',args:[]},{type:'rpg',args:['item','p1']},{type:'rpg',args:['ball','p2','pokeball','P','caught','4','0']},{type:'rpg',args:['ball','p1','pokeball','-','notarget']},{type:'rpg',args:['ball','p1','pokeball','F','caught']}])assert.equal(M.ballFeedbackPlan(e,timing),null);
 for(const e of [event('caught',3),event('escaped',4),event('escaped',5),event('caught',4,2)])assert.equal(M.readBallFeedback(e),null);
});
test('explicit phases use first sampled time, with throw/absorb/shake/seal in order',()=>{
 const c=new M.BallFeedbackClock(M.ballFeedbackPlan(event(),timing),true);
 assert.equal(c.sample(5000,0).phase,'throw');assert.equal(c.sample(5250,1).phaseProgress,.5);
 assert.equal(c.sample(5500,2).phase,'absorb');assert.equal(c.sample(5600,3).phaseProgress,.5);
 assert.equal(c.sample(5700,4).phase,'shake');assert.equal(c.sample(5900,5).phaseProgress,.5);
 assert.equal(c.sample(6100,6).phase,'seal');assert(!c.sample(6400,7).resultReady);assert(c.sample(6400,8).resultReady);
});
test('same Scene update reads are idempotent; a later update at the same time observes completion',()=>{
 const c=new M.BallFeedbackClock(M.ballFeedbackPlan(event(),timing),true);const first=c.sample(0,1);
 assert.deepEqual(c.sample(100000,1),first);assert(!c.sample(1400,2).resultReady);assert(!c.sample(100000,2).resultReady);assert(c.sample(1400,3).resultReady);
});
test('Battle Effects off cannot remove capture or blocked-ball phases',()=>{
 for(const e of [event(),{type:'rpg',args:['ball','p1','pokeball','-','blocked']}]){const p=M.ballFeedbackPlan(e,timing),a=new M.BallFeedbackClock(p,true),b=new M.BallFeedbackClock(p,false);assert.deepEqual(a.sample(0,0),b.sample(0,0));assert.equal(b.sample(0,0).frames.length,p.phases.length);}
});
test('cancellation is cleanup-complete but cannot authorize result text/ME/receiving',()=>{
 const c=new M.BallFeedbackClock(M.ballFeedbackPlan(event(),timing),true);c.sample(0,0);c.cancel();c.cancel();const f=c.sample(9999,1);assert(f.complete&&f.cancelled);assert.equal(f.resultReady,false);assert.equal(f.phase,null);
});
test('zero-duration phases still require the next update to release the ordered result',()=>{
 const p=M.ballFeedbackPlan(event(),{throwUnits:0,absorbUnits:0,shakeUnits:0,settleUnits:0,blockUnits:0}),c=new M.BallFeedbackClock(p,true);assert(!c.sample(0,0).resultReady);assert(c.sample(0,1).resultReady);
});
test('invalid or overflowing timing rejects the plan, never silently skips required phases',()=>{
 for(const n of [-1,NaN,Infinity,Number.MAX_VALUE])assert.throws(()=>M.ballFeedbackPlan(event(),{...timing,throwUnits:n}));
});
test('plan, constructor copies and sample DTOs cannot mutate an active schedule or source event',()=>{
 const e=event(),t={...timing},p=M.ballFeedbackPlan(e,t),c=new M.BallFeedbackClock(p,true);assert(Object.isFrozen(p)&&Object.isFrozen(p.phases[0]));e.args[2]='changed';t.throwUnits=99;const v=c.snapshot();v.phases[0].durationUnits=999;v.ball='changed';assert.equal(c.snapshot().ball,'masterball');assert.equal(c.snapshot().phases[0].durationUnits,10);
 const f=c.sample(0,0);f.frames[0].progress=1;assert.equal(c.sample(0,0).frames[0].progress,0);
});
