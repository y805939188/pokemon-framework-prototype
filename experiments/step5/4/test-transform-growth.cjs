'use strict';
// Synthetic authored teams; actual App -> Session -> pinned Gen8 Transform and KO.
// Debug engine access is read-only and witnesses temporary stats, never seeds a result.
const test = require('node:test'), assert = require('node:assert/strict');
const {E, T, inputs} = require('./trainer-ai-integration/fixtures.cjs');
const clone = value => structuredClone(value);
const statsOf = member => ({...member.storedStats});
const actor = w => w.s.gw._debugBattle().sides[0].pokemon.find(p => p.name === 'P1');
const permanentStats = (w, m) => E.growth.computeStats(w.content.species.Ditto.base, m.ivs, m.evs, m.level, m.statNature ?? m.nature);
async function open({levelUp = true, expGain = true} = {}) {
  const input = inputs({party: 2, moves: ['splash', 'seismictoss']});
  input.species.push({id:'ditto', showdownId:'ditto', nameKey:'species.ditto', growth:'medium', baseExp:101,
    evYield:{hp:1}, catchRate:35, learnset:[{level:1, move:'transform'}], source:'author-placeholder'});
  input.species.find(s => s.id === 'pidgey').evYield = {hp:1};
  input.trainers[0].party.forEach(m => {m.level = 5;});
  const compiled = E.contentCompile.compileContent(input); assert(compiled.ok, JSON.stringify(compiled.errors));
  const assembled = E.contentRuntime.assembleContent(compiled.data, E.dex.createDexLookup()); assert.deepEqual(assembled.errors, []);
  const content = assembled.content;
  const mon = E.memberFactory.createMember({id:'P1', species:'Ditto', level:50, abilityIndex:0}, content, () => 0);
  mon.evs.hp = 7; mon.hp = permanentStats({content}, mon).hp - 10;
  mon.exp = E.growth.minExp(content.species.Ditto.growth, levelUp ? 51 : 50) - (levelUp ? 1 : 0);
  const backup = E.memberFactory.createMember({id:'P2', species:'Snorlax', level:50}, content, () => 0);
  const game = E.state.newGame({content, party:[mon,backup].map(m => E.speciesKey.toPersistentMember(m,content)), money:1000});
  game.nextMemberOrdinal = '3';
  const state = T.fakes.createMemoryState(game), initial = clone(state.read());
  const app = new E.app.GameApplication({state, projection:T.fakes.createRecordingProjection(),
    sessions:E.composition.createBattleSessionFactory({content:()=>content, seed:()=>[1,2,3,4]}), content:()=>({content}), random:()=>0, clock:()=>12345});
  const request = {battleId:'transform-growth-'+levelUp+'-'+expGain, trainer:{id:'c-basic',version:1}, seq:1, canLose:true, expGain};
  const s = await app.startTrainerBattle(request); s.take();
  const originalDetails=s.currentRequest().side.pokemon.find(p=>p.ident==='p1: P1').details;
  const growthCalls=[], apply=s.gw.applyGrowth.bind(s.gw);
  s.gw.applyGrowth=(...args)=>{const result=apply(...args); growthCalls.push(clone(result)); return result;};
  return {app,s,state,initial,request,content,growthCalls,originalDetails};
}
function permanentDetails(w) {
  assert.match(w.originalDetails,/^Ditto, L50(?:,|$)/);
  return w.originalDetails.replace(', L50',', L'+w.s.party[0].level);
}
function assertPublicDetails(w) {
  const expected=permanentDetails(w); assert.equal(actor(w).details,expected);
  for(const request of [w.s.currentRequest(),w.s.gw.awaitingChoice('p1')]) {
    if(request?.side) assert.equal(request.side.pokemon.find(p=>p.ident==='p1: P1').details,expected);
  }
}
function unchanged(w) { assert.deepEqual(w.state.read(),w.initial); assert.equal(w.state.replaced.length,0); }
async function transform(w) {
  const result = await w.s.chooseMove(1); assert(result.ok, JSON.stringify(result));
  assert(result.messages.flatMap(m=>m.events??[]).some(e=>e.type==='-transform'));
  assert.equal(actor(w).transformed,true); assert.equal(actor(w).species.name,'Pidgey'); assert.equal(actor(w).baseSpecies.name,'Ditto');
  const permanent = permanentStats(w,w.s.party[0]);
  assert.notDeepEqual(statsOf(actor(w)), Object.fromEntries(Object.entries(permanent).filter(([k])=>k!=='hp')));
  assert.equal(actor(w).maxhp,permanent.hp); unchanged(w);
  return {stats:statsOf(actor(w)), speed:actor(w).speed, boosts:clone(actor(w).boosts), before:clone(w.s.party[0]), hp:actor(w).hp, maxhp:actor(w).maxhp};
}
async function knockout(w) {
  const slot = w.s.currentRequest().active[0].moves.findIndex(m=>m.id==='seismictoss')+1; assert(slot>0);
  const result = await w.s.chooseMove(slot); assert(result.ok, JSON.stringify(result));
  assert(result.messages.flatMap(m=>m.events??[]).some(e=>e.type==='faint'&&e.args[0].startsWith('p2')));
  return result;
}
function preserved(w, prior) {
  const p = actor(w), m = w.s.party[0], permanent = permanentStats(w,m);
  assert.equal(w.s.broken,null); assert.equal(p.transformed,true); assert.equal(p.species.name,'Pidgey');
  assert.deepEqual(statsOf(p),prior.stats,'growth cannot overwrite copied non-HP stats');
  assert.equal(p.speed,prior.speed,'cached battle speed remains the copied speed'); assert.deepEqual(p.boosts,prior.boosts);
  assert.deepEqual(w.s.gw.readState('p1').find(m=>m.id==='P1').stats,permanent);
  assert.equal(p.maxhp,permanent.hp); assert.equal(p.level,m.level);
  for(const call of w.growthCalls) assert.equal(call.after.hp,E.growth.hpAfterRecalc(call.before.hp,call.before.maxhp,call.after.maxhp));
  assert.deepEqual(Object.keys(w.s.gw.readState('p1')[0].pp),['transform']); assertPublicDetails(w); unchanged(w);
}
for (const levelUp of [false,true]) test('Transform KO '+(levelUp?'level-up':'same-level EV/EXP')+' preserves copied stats and commits only permanent growth',async()=>{
  const w = await open({levelUp});
  try {
    const prior = await transform(w), first = await knockout(w);
    assert(first.messages.some(m=>m.kind==='growth')); assert.equal(w.s.party[0].level,levelUp?51:50);
    assert(w.s.party[0].exp>prior.before.exp); assert.equal(w.s.party[0].evs.hp,8); preserved(w,prior);
    assert(actor(w).maxhp>prior.maxhp,'original HP grows, including the no-level EV threshold');
    await w.s._restoreCheckpoint(w.s._checkpoint()); preserved(w,prior);
    await knockout(w); assert(w.s.finished); preserved(w,prior);
    const result = w.s.result(), outcome = w.app.finishBattle(w.s,w.request); assert.equal(outcome.commit,'applied');
    assert.equal(w.state.replaced.length,1); const saved = clone(w.state.read()), m=saved.party[0];
    assert.equal(m.species,'ditto'); assert.equal(m.level,w.s.party[0].level); assert.equal(m.exp,w.s.party[0].exp);
    assert.deepEqual(m.evs,w.s.party[0].evs); assert.deepEqual(m.moves.map(m=>m.id),['transform']);
    assert.equal(m.moves[0].pp,9,'only the real Transform use spends permanent PP');
    assert.equal(m.hp,result.members.P1.hp); assert.equal(saved.appliedBattles[w.request.battleId].hash,E.state.resultHash(result));
    w.app.finishBattle(w.s,w.request); assert.equal(w.state.replaced.length,1); assert.deepEqual(w.state.read(),saved);
  } finally { w.app.abortBattle(w.request,Error('owned Transform growth cleanup')); }
});
for(const restore of [false,true]) test('Transform growth restores natural stats and public identity on switch-back, checkpoint='+restore,async()=>{
  const w = await open();
  try {
    const prior = await transform(w); await knockout(w); preserved(w,prior);
    if(restore) { await w.s._restoreCheckpoint(w.s._checkpoint()); preserved(w,prior); }
    assert((await w.s.chooseSwitch('P2')).ok); assertPublicDetails(w);
    const back=await w.s.chooseSwitch('P1'); assert(back.ok);
    const switches=back.messages.flatMap(m=>m.events??[]).filter(e=>e.type==='switch'&&e.args[0]==='p1a: P1');
    assert.equal(switches.length,1); assert.equal(switches[0].args[1],permanentDetails(w));
    assertPublicDetails(w);
    const p=actor(w), expected=permanentStats(w,w.s.party[0]);
    assert.equal(p.transformed,false); assert.equal(p.species.name,'Ditto');
    assert.deepEqual(statsOf(p),Object.fromEntries(Object.entries(expected).filter(([k])=>k!=='hp')));
    assert.equal(p.maxhp,expected.hp); assert.equal(p.speed,expected.spe); assert.equal(w.s.currentRequest().active[0].moves[0].id,'transform'); unchanged(w);
    w.app.abortBattle(w.request,Error('controlled Transform growth abort')); unchanged(w);
  } finally { w.app.abortBattle(w.request,Error('owned Transform switch cleanup')); }
});
test('Transform with disabled EXP never applies EV or growth and remains playable',async()=>{
  const w=await open({expGain:false});
  try { const prior=await transform(w), result=await knockout(w); preserved(w,prior);
    assert(!result.messages.some(m=>m.kind==='growth')); assert.equal(w.s.party[0].level,prior.before.level);
    assert.equal(w.s.party[0].exp,prior.before.exp); assert.deepEqual(w.s.party[0].evs,prior.before.evs);
    await knockout(w); assert(w.s.finished); unchanged(w);
  } finally { w.app.abortBattle(w.request,Error('owned disabled EXP cleanup')); }
});
