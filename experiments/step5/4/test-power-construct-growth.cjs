'use strict';
// Authored synthetic content. Actual App -> Session -> pinned Gen8 Power Construct.
// Debug access only observes native formes/stats; no HP, stat, effect or faint is seeded after entry.
const test=require('node:test'),assert=require('node:assert/strict');
const {E,T,inputs}=require('./trainer-ai-integration/fixtures.cjs');
const clone=v=>structuredClone(v);
const CASES=[
 {id:'exp-only',evYield:{}},
 {id:'hp-ev-below-point',evYield:{hp:1},hpEv:6},
 {id:'hp-ev-point',evYield:{hp:1},hpEv:7},
 {id:'level-up',evYield:{hp:1},hpEv:7,levelUp:true},
];
const actor=w=>w.s.gw._debugBattle().sides[0].pokemon.find(p=>p.name==='A');
const live=w=>w.s.gw.readState('p1').find(p=>p.id==='A');
const permanent=w=>{
 const m=w.s.party[0];return E.growth.computeStats(w.content.species.Zygarde.base,m.ivs,m.evs,m.level,m.statNature??m.nature);
};
const battleStats=w=>{
 const m=w.s.party[0];return E.growth.computeStats({hp:216,atk:100,def:121,spa:91,spd:95,spe:85},m.ivs,m.evs,m.level,m.statNature??m.nature);
};
function unchanged(w){assert.deepEqual(w.port.read(),w.initial);assert.equal(w.port.replaced.length,0);}
async function open(scenario=CASES[0],{transform=false,expGain=true,hp=70,multi=false,faint=false}={}){
 const input=inputs({party:2,moves:['splash','seismictoss']});
 const learnset=['splash','seismictoss','transform','substitute'].map(move=>({level:1,move}));
 if(multi)learnset.push({level:51,move:'protect'},{level:52,move:'rest'});
 input.species.push({id:'zygarde',showdownId:'zygarde',nameKey:'species.zygarde',growth:'slow',baseExp:270,evYield:{},catchRate:10,abilities:['powerconstruct'],learnset,source:'author-placeholder'});
 input.species.find(p=>p.id==='pidgey').evYield={...scenario.evYield};
 input.species.find(p=>p.id==='snorlax').learnset=['seismictoss','splash'].map(move=>({level:1,move}));
 input.trainers[0].party.forEach(p=>{p.level=3;p.moves=['splash','seismictoss'];});
 if(faint){input.trainers[0].party[1].level=100;input.trainers[0].party[1].moves=['seismictoss'];}
 input.trainers[0].aiStrategy={id:'power-construct-control',version:'1',parameters:{}};
 const registry=E.composition.createTrainerAiStrategyRegistry();
 registry.register({id:'power-construct-control',version:'1',implementationIdentity:'synthetic/power-construct/control/1',
  validateParameters(p){assert.deepEqual(p,{});},create(){return{decide(snapshot){
   const candidate=(snapshot.request.legalMoves??[]).find(m=>m.slot===1)??snapshot.request.legalSwitches[0];
   return{kind:'choose',binding:snapshot.binding,candidateId:candidate.candidateId,retryOrder:[candidate.candidateId],diagnostics:[]};
  }};}});
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));
 const dex=E.dex.createDexLookup(),joined=E.contentRuntime.assembleContent(compiled.data,dex);assert.deepEqual(joined.errors,[]);
 const content=joined.content,mon=E.memberFactory.createMember({id:'A',species:'Zygarde',level:50},content,()=>0);
 mon.evs.hp=scenario.hpEv??7;mon.hp=hp;
 mon.exp=E.growth.minExp('slow',multi?53:scenario.levelUp?51:50)-((multi||scenario.levelUp)?1:0);
 const reserve=E.memberFactory.createMember({id:'R',species:'Snorlax',level:faint?100:50},content,()=>0);
 const game=E.state.newGame({content,party:[mon,reserve].map(m=>E.speciesKey.toPersistentMember(m,content)),money:1000});game.nextMemberOrdinal='3';
 const port=T.fakes.createMemoryState(game),initial=clone(port.read());
 const app=new E.app.GameApplication({state:port,projection:T.fakes.createRecordingProjection(),
  sessions:E.composition.createBattleSessionFactory({trainerAiStrategies:registry,content:()=>content,seed:()=>[1,2,3,4]}),
  content:()=>({content,dex}),random:()=>0,clock:()=>12345});
 const req={battleId:'power-construct-'+scenario.id+'-'+transform+'-'+expGain+'-'+hp+'-'+multi+'-'+faint,
  trainer:{id:'c-basic',version:1},seq:1,canLose:true,expGain,moneyGain:false};
 const s=await app.startTrainerBattle(req);s.take();return{s,app,req,port,initial,content,transform,scenario};
}
async function move(w,id){
 const slot=w.s.currentRequest().active[0].moves.findIndex(m=>m.id===id)+1;assert(slot>0,id+' selectable');
 const r=await w.s.chooseMove(slot);assert(r.ok,JSON.stringify(r));return r;
}
async function activate(w){
 assert.equal(actor(w).species.name,'Zygarde');const before={hp:actor(w).hp,maxhp:actor(w).maxhp};
 const r=await move(w,'splash');assert(r.messages.flatMap(m=>m.events??[]).some(e=>e.type==='-activate'&&e.args.includes('ability: Power Construct')));
 assert.equal(actor(w).species.name,'Zygarde-Complete');assert.equal(actor(w).baseSpecies.name,'Zygarde-Complete');
 assert.equal(actor(w).set.species,'Zygarde');assert.equal(actor(w).maxhp,battleStats(w).hp);
 assert.equal(actor(w).hp,E.growth.hpAfterRecalc(before.hp,before.maxhp,actor(w).maxhp));
 w.details=actor(w).details;assert.equal(live(w).growthHpBase,216);assert.deepEqual(live(w).stats,permanent(w));unchanged(w);
}
function projected(w,copied){
 const p=actor(w);assert.equal(w.s.broken,null);assert.equal(p.baseSpecies.name,'Zygarde-Complete');
 assert.equal(p.species.name,copied?'Pidgey':'Zygarde-Complete');assert.equal(p.transformed,!!copied);
 assert.equal(p.maxhp,battleStats(w).hp);assert.deepEqual(live(w).stats,permanent(w));
 assert.equal(p.details,w.details.replace(', L50',', L'+w.s.party[0].level));
 if(copied)assert.deepEqual({...p.storedStats},copied);
 else assert.deepEqual({...p.storedStats},Object.fromEntries(Object.entries(battleStats(w)).filter(([k])=>k!=='hp')));
 assert.equal(live(w).pp.seismictoss,w.s.party[0].moves.find(m=>m.id==='seismictoss').pp);unchanged(w);
}
function commit(w){
 const before=clone(live(w)),result=w.s.result(),expected=E.growth.hpAfterRecalc(before.hp,before.maxhp,permanent(w).hp);
 assert.equal(result.members.A.hp,expected);assert(expected>=0&&expected<=permanent(w).hp);
 const outcome=w.app.finishBattle(w.s,w.req);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));
 const saved=clone(w.port.read()),m=saved.party[0];assert.equal(w.port.replaced.length,1);
 assert.equal(m.species,'zygarde');assert.equal(m.form,0);assert.equal(m.ability,'Power Construct');
 assert.equal(m.hp,expected);assert.equal(m.level,w.s.party[0].level);assert.equal(m.exp,w.s.party[0].exp);
 assert.deepEqual(m.evs,w.s.party[0].evs);assert.equal(saved.appliedBattles[w.req.battleId].hash,E.state.resultHash(result));
 for(const key of ['growthHpBase','baseSpecies','storedStats','volatiles'])assert.equal(Object.hasOwn(m,key),false);
 w.app.finishBattle(w.s,w.req);assert.equal(w.port.replaced.length,1);assert.deepEqual(w.port.read(),saved);
}
for(const scenario of CASES)for(const transform of [false,true])test('Power Construct '+scenario.id+', Transform='+transform+' growth/checkpoint/switch/commit',async()=>{
 const w=await open(scenario,{transform});try{
  await activate(w);let copied;
  if(transform){await move(w,'transform');assert.equal(actor(w).transformed,true);copied=clone(actor(w).storedStats);}
  const before={hp:actor(w).hp,maxhp:actor(w).maxhp,exp:w.s.party[0].exp,evs:clone(w.s.party[0].evs)};
  const r=await move(w,'seismictoss');assert.equal(w.s.party[0].level,scenario.levelUp?51:50);
  assert(w.s.party[0].exp>before.exp);assert.equal(w.s.party[0].evs.hp,before.evs.hp+(scenario.evYield.hp??0));
  assert.equal(actor(w).hp,E.growth.hpAfterRecalc(before.hp,before.maxhp,battleStats(w).hp));projected(w,copied);
  const growth=r.messages.find(m=>m.kind==='growth'),display=E.battlePresentation.readGrowthDisplay(w.s,growth);
  assert(growth);assert.equal(display.hp,actor(w).hp);assert.equal(display.maxhp,battleStats(w).hp);
  if(scenario.levelUp){const up=display.segments.find(m=>m.levelUp).levelUp;assert.equal(up.maxhp,battleStats(w).hp);assert.equal(up.stats.after.hp,up.maxhp);assert.equal(up.stats.before.hp,before.maxhp);}
  const stable={live:clone(live(w)),raw:clone(actor(w).storedStats),request:clone(w.s.currentRequest())};
  await w.s._restoreCheckpoint(w.s._checkpoint());assert.deepEqual(live(w),stable.live);assert.deepEqual(w.s.currentRequest(),stable.request);projected(w,copied);
  await move(w,'splash');assert.equal(live(w).hp,stable.live.hp);assert.equal(live(w).maxhp,stable.live.maxhp);assert.deepEqual(live(w).stats,stable.live.stats);assert.deepEqual({...actor(w).storedStats},stable.raw);
  assert((await w.s.chooseSwitch('R')).ok);assert((await w.s.chooseSwitch('A')).ok);projected(w);
  assert.equal(actor(w).hp,stable.live.hp);assert.equal(actor(w).maxhp,stable.live.maxhp);
  await move(w,'seismictoss');assert(w.s.finished);projected(w);commit(w);
 }finally{w.app.abortBattle(w.req,Error('owned Power Construct cleanup'));}
});
for(const transform of [false,true])test('Power Construct disabled EXP still regresses only result HP, Transform='+transform,async()=>{
 const w=await open(CASES[2],{expGain:false,transform});try{
  await activate(w);if(transform)await move(w,'transform');const before=clone(w.s.party[0]);
  const first=await move(w,'seismictoss');assert(!first.messages.some(m=>m.kind==='growth'));
  assert.equal(w.s.party[0].exp,before.exp);assert.deepEqual(w.s.party[0].evs,before.evs);
  assert.equal(actor(w).maxhp,battleStats(w).hp);await move(w,'seismictoss');assert(w.s.finished);commit(w);
 }finally{w.app.abortBattle(w.req,Error('owned disabled EXP cleanup'));}
});
test('Power Construct multiple learning gates retain live HP basis and presentation across rollback',async()=>{
 const w=await open(CASES[2],{multi:true});try{
  await activate(w);const old={hp:actor(w).hp,maxhp:actor(w).maxhp};
  const first=await move(w,'seismictoss'),messages=[...first.messages];assert(w.s.pendingLearn);assert.equal(w.s.party[0].level,51);
  const pending=clone(live(w));await w.s._restoreCheckpoint(w.s._checkpoint());assert.deepEqual(live(w),pending);
  while(w.s.pendingLearn)messages.push(...await w.s.decideLearn(null));
  assert.equal(w.s.party[0].level,53);assert.equal(actor(w).hp,E.growth.hpAfterRecalc(old.hp,old.maxhp,battleStats(w).hp));
  const displays=messages.filter(m=>m.kind==='growth').map(m=>E.battlePresentation.readGrowthDisplay(w.s,m)).filter(Boolean);
  assert(displays.length>=2);for(const d of displays){assert(d.hp<=d.maxhp);for(const seg of d.segments)if(seg.levelUp){assert.equal(seg.levelUp.maxhp,seg.levelUp.stats.after.hp);assert(seg.levelUp.hp<=seg.levelUp.maxhp);}}
  projected(w);await move(w,'seismictoss');assert(w.s.finished);commit(w);
 }finally{w.app.abortBattle(w.req,Error('owned multiple-gate cleanup'));}
});
test('Power Construct low live HP retains the independent minimum-one regression rule at settlement',async()=>{
 const w=await open(CASES[0],{hp:1});try{
  await activate(w);await move(w,'substitute');assert(actor(w).hp<actor(w).maxhp-permanent(w).hp);
  await move(w,'seismictoss');await move(w,'seismictoss');assert(w.s.finished);assert.equal(w.s.result().members.A.hp,1);commit(w);
 }finally{w.app.abortBattle(w.req,Error('owned low-HP cleanup'));}
});
test('Power Construct abort leaves persistent input and ledger untouched after actual growth',async()=>{
 const w=await open(CASES[3]);try{await activate(w);await move(w,'seismictoss');projected(w);w.app.abortBattle(w.req,Error('controlled abort'));unchanged(w);}finally{w.app.abortBattle(w.req,Error('owned abort cleanup'));}
});
test('Power Construct still rejects an incorrect independent HP outcome and rolls back the whole action',async()=>{
 const w=await open(CASES[2]);try{
  await activate(w);const saved={live:clone(live(w)),party:clone(w.s.party),request:clone(w.s.currentRequest())};
  const apply=w.s.gw.applyGrowth.bind(w.s.gw);w.s.gw.applyGrowth=(...args)=>{const out=apply(...args);out.after.hp++;return out;};
  await assert.rejects(move(w,'seismictoss'),/HP rule mismatch/);
  assert.deepEqual(live(w),saved.live);assert.deepEqual(w.s.party,saved.party);assert.deepEqual(w.s.currentRequest(),saved.request);unchanged(w);
 }finally{w.app.abortBattle(w.req,Error('owned HP gate cleanup'));}
});
test('Power Construct permanent-stat cross-check still rejects a wrong HP stat expectation',async()=>{
 const w=await open();try{
  await activate(w);const stats=permanent(w);assert.throws(()=>w.s.gw.applyGrowth('p1','A',{level:50,evs:w.s.party[0].evs,expect:{stats:{...stats,hp:stats.hp+1}}}),/stat mismatch for A.hp/);
  unchanged(w);
 }finally{w.app.abortBattle(w.req,Error('owned stat gate cleanup'));}
});
test('Power Construct fainted member remains at zero through real replacement and final settlement',async()=>{
 const w=await open(CASES[0],{faint:true});try{
  await activate(w);await move(w,'seismictoss');
  await move(w,'splash');await move(w,'splash');assert.equal(actor(w).hp,0);assert.equal(actor(w).fainted,true);
  assert((await w.s.chooseSwitch('R')).ok);for(let n=0;n<4&&!w.s.finished;n++)await move(w,'seismictoss');
  assert(w.s.finished);assert.equal(w.s.result().members.A.hp,0);commit(w);
 }finally{w.app.abortBattle(w.req,Error('owned faint cleanup'));}
});

test('Power Construct actual wild capture regresses HP once before App reception and commit',async()=>{
 const input=inputs({moves:['splash']});
 input.species.find(p=>p.id==='snorlax').learnset=['superfang','splash'].map(move=>({level:1,move}));
 input.species.push({id:'zygarde',showdownId:'zygarde',nameKey:'species.zygarde',growth:'slow',baseExp:270,evYield:{},
  catchRate:10,abilities:['powerconstruct'],learnset:[{level:1,move:'splash'}],source:'author-placeholder'});
 const compiled=E.contentCompile.compileContent(input);assert(compiled.ok,JSON.stringify(compiled.errors));
 const dex=E.dex.createDexLookup(),joined=E.contentRuntime.assembleContent(compiled.data,dex);assert.deepEqual(joined.errors,[]);
 const content=joined.content,mon=E.memberFactory.createMember({id:'A',species:'Snorlax',level:50},content,()=>0);
 const game=E.state.newGame({content,party:[E.speciesKey.toPersistentMember(mon,content)],bag:{masterball:2},money:1000});game.nextMemberOrdinal='2';
 const port=T.fakes.createMemoryState(game),initial=clone(port.read());
 const app=new E.app.GameApplication({state:port,projection:T.fakes.createRecordingProjection(),
  sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4]}),content:()=>({content,dex}),random:()=>0,clock:()=>12345},
  {receivingProfile:{mode:0,naming:1}});
 const req={battleId:'power-construct-wild-capture',kind:'wild',foes:[{species:'zygarde',level:50}],seq:1,canLose:true,expGain:false};
 try{
  const s=await app.startBattle(req);s.take();const target=()=>s.gw._debugBattle().sides[1].pokemon[0];
  assert.equal(target().ability,'powerconstruct');for(let n=0;n<3&&target().species.name!=='Zygarde-Complete';n++)assert((await s.chooseMove(1)).ok);
  assert.equal(target().species.name,'Zygarde-Complete');const before=clone(s.gw.readState('p2')[0]),foe=s.foeTeam[0];
  const maxhp=E.growth.computeStats(content.species.Zygarde.base,foe.ivs,foe.evs,foe.level,foe.statNature??foe.nature).hp;
  const expected=E.growth.hpAfterRecalc(before.hp,before.maxhp,maxhp);assert(before.hp>maxhp);
  const r=await s.throwBall('masterball');assert(r.ok);assert(s.finished);assert.equal(s.result().captured[0].hp,expected);
  assert.equal(s.result().captured[0].species,'Zygarde');assert.equal(port.replaced.length,0);assert.deepEqual(port.read(),initial);
  const result=s.result(),out=app.finishBattle(s,req);assert.equal(out.commit,'applied',JSON.stringify(out));assert.equal(port.replaced.length,1);
  const saved=clone(port.read()),captured=saved.party.find(m=>m.id===result.captured[0].id);assert(captured);
  assert.equal(captured.species,'zygarde');assert.equal(captured.form,0);assert.equal(captured.hp,expected);
  app.finishBattle(s,req);assert.equal(port.replaced.length,1);assert.deepEqual(port.read(),saved);
 }finally{app.abortBattle(req,Error('owned wild-capture cleanup'));}
});
test('explicit Zygarde-Complete input remains its own permanent HP and stat basis',async()=>{
 const gw=await E.gateway.BattleGateway.create({formatid:'gen8rpgcustomgame',seed:[1,2,3,4],players:[
  {name:'P',team:[{name:'A',species:'Zygarde-Complete',level:50,moves:['splash']}]},
  {name:'F',team:[{name:'B',species:'Snorlax',level:50,moves:['splash']}]}]});
 assert(await gw.choose('p1','team 1'));assert(await gw.choose('p2','team 1'));gw.drain();
 const battle=gw._debugBattle(),p=battle.sides[0].pokemon[0],stats=battle.spreadModify(p.baseSpecies.baseStats,{...p.set,level:51});
 const out=gw.applyGrowth('p1','A',{level:51,expect:{stats}});assert.deepEqual(out.stats,stats);
 assert.equal(p.maxhp,stats.hp);assert.equal(p.species.name,'Zygarde-Complete');assert.equal(gw.readState('p1')[0].growthHpBase,undefined);
});
