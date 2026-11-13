'use strict';
// Synthetic authored teams; actual App -> Session -> pinned Gen8 Stance Change and KO.
// Debug engine access is read-only and witnesses temporary stats, never seeds a result.
const test = require('node:test'), assert = require('node:assert/strict');
const {E, T, inputs} = require('./trainer-ai-integration/fixtures.cjs');
const clone = value => structuredClone(value);
const actor = w => w.s.gw._debugBattle().sides[0].pokemon.find(p => p.name === 'P1');
const permanentStats = (w, m) => E.growth.computeStats(w.content.species.Aegislash.base, m.ivs, m.evs, m.level, m.statNature ?? m.nature);
async function open({levelUp = true, expGain = true} = {}) {
  const input = inputs({party: 2, moves: ['splash']});
  input.species.push({id:'aegislash', showdownId:'aegislash', nameKey:'species.aegislash', growth:'medium', baseExp:101,
    evYield:{hp:1}, catchRate:35, learnset:[{level:1, move:'aerialace'},{level:1,move:'kingsshield'}], source:'author-placeholder'});
  input.species.find(s => s.id === 'pidgey').evYield = {hp:1};
  input.trainers[0].party.forEach(m => {m.level = 5;});
  const compiled = E.contentCompile.compileContent(input); assert(compiled.ok, JSON.stringify(compiled.errors));
  const assembled = E.contentRuntime.assembleContent(compiled.data, E.dex.createDexLookup()); assert.deepEqual(assembled.errors, []);
  const content = assembled.content;
  const mon = E.memberFactory.createMember({id:'P1', species:'Aegislash', level:50, abilityIndex:0}, content, () => 0);
  mon.evs.hp = 7; mon.hp = permanentStats({content}, mon).hp - 10;
  mon.exp = E.growth.minExp(content.species.Aegislash.growth, levelUp ? 51 : 50) - (levelUp ? 1 : 0);
  const backup = E.memberFactory.createMember({id:'P2', species:'Snorlax', level:50}, content, () => 0);
  const game = E.state.newGame({content, party:[mon,backup].map(m => E.speciesKey.toPersistentMember(m,content)), money:1000});
  game.nextMemberOrdinal = '3';
  const state = T.fakes.createMemoryState(game), initial = clone(state.read());
  const app = new E.app.GameApplication({state, projection:T.fakes.createRecordingProjection(),
    sessions:E.composition.createBattleSessionFactory({content:()=>content, seed:()=>[1,2,3,4]}), content:()=>({content}), random:()=>0, clock:()=>12345});
  const request = {battleId:'stance-growth-'+levelUp+'-'+expGain, trainer:{id:'c-basic',version:1}, seq:1, canLose:true, expGain};
  const s = await app.startTrainerBattle(request); s.take();
  const originalDetails=s.currentRequest().side.pokemon.find(p=>p.ident==='p1: P1').details;
  const growthCalls=[], apply=s.gw.applyGrowth.bind(s.gw);
  s.gw.applyGrowth=(...args)=>{const result=apply(...args); growthCalls.push(clone(result)); return result;};
  return {app,s,state,initial,request,content,growthCalls,originalDetails};
}

for (const levelUp of [false,true]) test('Stance Change KO growth '+levelUp, async()=>{
 const w=await open({levelUp});
 try {
  const r=await w.s.chooseMove(1); assert(r.ok,JSON.stringify(r));
  const p=actor(w), m=w.s.party[0];
  assert.equal(p.species.name,'Aegislash-Blade'); assert.equal(p.baseSpecies.name,'Aegislash');
  assert.equal(m.level,levelUp?51:50); assert.equal(m.evs.hp,8);
  const expected=permanentStats(w,m);
  assert.deepEqual(w.s.gw.readState('p1')[0].stats,expected);
  const battleStats=w.s.gw._debugBattle().spreadModify(p.species.baseStats,p.set);
  assert.equal(p.storedStats.atk,battleStats.atk); assert.notEqual(p.storedStats.atk,expected.atk);
  assert.equal(p.ability,'stancechange'); assert.equal(p.speed,p.storedStats.spe);
  assert.equal(p.maxhp,expected.hp);
  for(const call of w.growthCalls) assert.equal(call.after.hp,E.growth.hpAfterRecalc(call.before.hp,call.before.maxhp,call.after.maxhp));
  assert.equal(p.details,w.originalDetails.replace(', L50',', L'+m.level)); assert.deepEqual(w.state.read(),w.initial);
  await w.s._restoreCheckpoint(w.s._checkpoint());
  assert.equal(actor(w).species.name,'Aegislash-Blade');
  assert.deepEqual(w.s.gw.readState('p1')[0].stats,expected);
  assert((await w.s.chooseMove(2)).ok); assert.equal(actor(w).species.name,'Aegislash');
  assert.equal(actor(w).storedStats.atk,expected.atk);
  assert((await w.s.chooseSwitch('P2')).ok); assert((await w.s.chooseSwitch('P1')).ok);
  assert.equal(actor(w).species.name,'Aegislash'); assert.equal(actor(w).storedStats.atk,expected.atk);
  assert((await w.s.chooseMove(1)).ok); assert(w.s.finished);
  assert.equal(w.app.finishBattle(w.s,w.request).commit,'applied');
  assert.equal(w.state.replaced.length,1); assert.equal(w.state.read().party[0].species,'aegislash');
  w.app.finishBattle(w.s,w.request); assert.equal(w.state.replaced.length,1);
 } finally { w.app.abortBattle(w.request,Error('owned stance cleanup')); }
});

test('Stance Change with growth disabled projects permanent stats, and abort installs nothing',async()=>{
 const w=await open({expGain:false});
 try {
  assert((await w.s.chooseMove(1)).ok); assert.equal(actor(w).species.name,'Aegislash-Blade');
  assert.equal(w.growthCalls.length,0); assert.equal(w.s.party[0].level,50);
  assert.deepEqual(w.s.gw.readState('p1')[0].stats,permanentStats(w,w.s.party[0]));
  w.app.abortBattle(w.request,Error('intentional abort'));
  assert.equal(w.state.replaced.length,0); assert.deepEqual(w.state.read(),w.initial);
 } finally {w.app.abortBattle(w.request,Error('owned cleanup'));}
});
