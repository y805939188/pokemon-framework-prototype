'use strict';
// Real App/composition/Gen8 sessions. State/projection ports are owned memory; no fake battle driver.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {E,T,inputs}=require('./trainer-ai-integration/fixtures.cjs'),plan=require('./e-status-carry-contracts.json'),clone=v=>JSON.parse(JSON.stringify(v));
assert.deepEqual(plan.seed,[1,2,3,4]);assert.equal(plan.completeHeading,false);assert.equal(fs.readFileSync(path.resolve(__dirname,'../../../js/engine/showdown/SOURCE_SHA'),'utf8').trim(),plan.showdownSHA);
const allEvents=r=>r.messages.flatMap(m=>m.kind==='events'?m.events:[]),live=b=>b.s.gw.readState('p1').find(m=>m.id==='CARRY-P1');
async function open(c){
 const input=inputs({moves:['splash']});input.species.find(m=>m.id==='gengar').learnset=[{level:1,move:'toxic'}];
 input.species.push({id:'parasect',showdownId:'parasect',nameKey:'species.parasect',growth:'medium',baseExp:100,evYield:{},catchRate:45,learnset:[{level:1,move:'spore'}],source:'author-placeholder'});
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));const joined=E.contentRuntime.assembleContent(compiled.data,E.dex.createDexLookup());assert.deepEqual(joined.errors,[]);const content=joined.content;
 const member=E.memberFactory.createMember({id:'CARRY-P1',species:plan.player.species,level:plan.player.level,abilityIndex:plan.player.abilityIndex},content,()=>0);assert.equal(member.ability,plan.player.ability);
 const maxpp=plan.player.basePP+Math.floor(plan.player.basePP*c.ppUps/5);member.moves=[{id:'splash',pp:maxpp,maxpp,ppUps:c.ppUps}];
 const game=E.state.newGame({content,party:[E.speciesKey.toPersistentMember(member,content)],money:1000});game.nextMemberOrdinal='2';
 const state=T.fakes.createMemoryState(game),app=new E.app.GameApplication({state,projection:T.fakes.createRecordingProjection(),sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[...plan.seed]}),content:()=>({content}),random:()=>0,clock:()=>12345});
 const w={app,state,c,content,maxpp,seq:0,battles:[],active:null};
 w.start=async foe=>{const req={battleId:c.id+'-'+(++w.seq),seq:w.seq,kind:'wild',foes:[{species:foe.species.toLowerCase(),level:foe.level}],canLose:true,expGain:false},before=JSON.stringify(state.read()),s=await app.startBattle(req);s.take();const b={s,req,before,steps:[],initial:clone(s.gw.readState('p1'))};w.battles.push(b);w.active=b;unchanged(w,b);return b;};
 w.cleanup=()=>{if(w.active)app.abortBattle(w.active.req,Error('owned status-carry cleanup'));};return w;
}
function unchanged(w,b){assert.equal(JSON.stringify(w.state.read()),b.before,'this battle cannot rewrite the previously committed state while it is open');}
async function move(w,b){const r=await b.s.chooseMove(1);assert(r.ok,JSON.stringify(r));unchanged(w,b);b.steps.push({kind:'move',messages:clone(r.messages),live:clone(live(b))});return allEvents(r);}
async function finish(w,b){
 const before=clone(live(b)),writes=w.state.replaced.length,r=await b.s.run();assert(r.ok);assert(b.s.finished);assert.equal(b.s.ended.reason,'run');unchanged(w,b);
 const result=b.s.result();assert.equal(result.members['CARRY-P1'].hp,before.hp);const outcome=w.app.finishBattle(b.s,b.req);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));assert.equal(w.state.replaced.length,writes+1);
 const saved=clone(w.state.read());w.app.finishBattle(b.s,b.req);assert.equal(w.state.replaced.length,writes+1);assert.equal(JSON.stringify(w.state.read()),JSON.stringify(saved));b.result=clone(result);b.savedParty=clone(saved.party);w.active=null;return saved.party[0];
}
async function inflict(w){
 const foe=plan.firstFoes[w.c.first],b=await w.start(foe),events=await move(w,b),m=live(b);assert.equal(m.pp.splash,w.maxpp-1);assert.equal(m.status,w.c.first==='toxic'?'tox':'slp');assert(events.some(e=>e.type==='-status'&&e.args[0].startsWith('p1a:')&&e.args[1]===m.status));
 if(m.status==='tox'){assert.equal(m.statusCount,1);assert.equal(m.hp,m.maxhp-Math.floor(m.maxhp/16));}else assert(Number.isInteger(m.statusCount)&&m.statusCount>=2&&m.statusCount<=4);
 assert.equal(w.app.healParty().reason,'battle-active');unchanged(w,b);const saved=await finish(w,b);assert.equal(saved.status,w.c.first==='toxic'?'psn':'slp');assert.equal(saved.statusCount,w.c.first==='toxic'?0:m.statusCount);assert.equal(saved.moves[0].pp,w.maxpp-1);assert.equal(saved.moves[0].ppUps,w.c.ppUps);return saved;
}
async function wake(w,b,remaining){
 assert.equal(live(b).status,'slp');assert.equal(live(b).statusCount,remaining,'opening the next battle must not re-roll the saved sleep duration');const pp=live(b).pp.splash;
 for(let check=1;check<=remaining;check++){
  const events=await move(w,b),m=live(b),awake=check===remaining;assert.equal(m.status,awake?'':'slp');assert.equal(m.statusCount,awake?0:remaining-check);assert.equal(m.pp.splash,pp-Number(awake),'only the actual waking move spends PP');
  assert.equal(events.filter(e=>e.type==='cant'&&e.args[0].startsWith('p1a:')&&e.args[1]==='slp').length,awake?0:1);assert.equal(events.some(e=>e.type==='-curestatus'&&e.args[0].startsWith('p1a:')&&e.args[1]==='slp'),awake);
 }
}
for(const c of plan.cases)test(c.id+' '+c.check,async()=>{
 const w=await open(c);try{
  const saved=await inflict(w);assert.equal(w.state.replaced.length,1);
  if(c.check==='heal-before-next-battle'){
   assert.equal(w.app.healParty().status,'healed');assert.equal(w.state.replaced.length,2);const healed=w.state.read().party[0];assert.equal(healed.status,'');assert.equal(healed.statusCount,0);assert.equal(healed.hp,w.battles[0].initial[0].maxhp);assert.deepEqual(healed.moves[0],{id:'splash',pp:64,maxpp:64,ppUps:3});assert.equal(w.app.healParty().status,'unchanged');assert.equal(w.state.replaced.length,2);
  }
  const next=await w.start(plan.nextFoe);assert.equal(live(next).hp,w.state.read().party[0].hp);assert.equal(live(next).status,w.state.read().party[0].status);assert.equal(live(next).statusCount,w.state.read().party[0].statusCount);
  if(c.check==='toxic-becomes-ordinary'){
   const start=live(next);assert.equal(start.status,'psn');assert.equal(start.statusCount,0);
   for(let i=1;i<=c.nextTurns;i++){const events=await move(w,next),m=live(next);assert.equal(m.hp,start.hp-i*Math.floor(start.maxhp/c.nextResidualDivisor));assert.equal(m.status,'psn');assert.equal(m.statusCount,0);assert.equal(m.pp.splash,w.maxpp-1-i);assert(events.some(e=>e.type==='-damage'&&e.args[0].startsWith('p1a:')&&e.args.includes('[from] psn')));}
  }else if(c.first==='sleep')await wake(w,next,saved.statusCount);
  else{assert.equal(live(next).pp.splash,64);await move(w,next);assert.equal(live(next).status,'');assert.equal(live(next).hp,live(next).maxhp);assert.equal(live(next).pp.splash,63);}
  if(c.check==='abort-second-preserves-first'){
   assert.equal(live(next).status,'');unchanged(w,next);w.app.abortBattle(next.req,Error('owned second battle retirement'));assert.equal(w.state.replaced.length,1);unchanged(w,next);assert.equal(w.app.finishBattle(next.s,next.req).commit,'none');assert.equal(w.state.replaced.length,1);w.active=null;
   const third=await w.start(plan.nextFoe);assert.equal(live(third).status,'slp');assert.equal(live(third).statusCount,saved.statusCount);assert.equal(live(third).pp.splash,saved.moves[0].pp);await finish(w,third);assert.equal(w.state.replaced.length,2);assert.deepEqual(Object.keys(w.state.read().appliedBattles).sort(),[w.battles[0].req.battleId,third.req.battleId].sort());
  }else{
   const final=await finish(w,next);assert.equal(final.status,c.first==='sleep'?'':c.check==='heal-before-next-battle'?'':'psn');assert.equal(final.statusCount,0);assert.equal(final.moves[0].pp,c.check==='heal-before-next-battle'?63:c.first==='sleep'?w.maxpp-2:w.maxpp-3);assert.equal(final.moves[0].ppUps,c.ppUps);assert.equal(w.state.replaced.length,c.check==='heal-before-next-battle'?3:2);assert.equal(Object.keys(w.state.read().appliedBattles).length,2);
  }
  console.log('E_STATUS_CARRY_OBSERVATION '+JSON.stringify({id:c.id,featureIds:plan.featureIds,completeHeading:false,scope:plan.scope,battles:w.battles.map(b=>({id:b.req.battleId,initial:b.initial,steps:b.steps,result:b.result??null,savedParty:b.savedParty??null})),finalParty:w.state.read().party,stateReplacements:w.state.replaced.length,committedBattleIds:Object.keys(w.state.read().appliedBattles)}));
 }finally{w.cleanup();}
});
