'use strict';
// Synthetic authored teams; actual App -> Session -> pinned Gen8 Illusion and KO.
// Debug engine access is read-only and witnesses temporary stats, never seeds a result.
const test = require('node:test'), assert = require('node:assert/strict');
const {E, T, inputs} = require('./trainer-ai-integration/fixtures.cjs');
const clone = value => structuredClone(value);
const actor = w => w.s.gw._debugBattle().sides[0].pokemon.find(p => p.name === 'P1');
const permanentStats = (w, m) => E.growth.computeStats(w.content.species.Zoroark.base, m.ivs, m.evs, m.level, m.statNature ?? m.nature);
async function open({levelUp = false, expGain = true, foeIllusion = false, foeMoves = ['splash']} = {}) {
  const input = inputs({party: 2, moves: foeMoves});
  input.species.push({id:'zoroark', showdownId:'zoroark', nameKey:'species.zoroark', growth:'medium', baseExp:101,
    evYield:{hp:1}, catchRate:35, learnset:[{level:1, move:'aerialace'},{level:1,move:'splash'}], source:'author-placeholder'});
  input.species.find(s => s.id === 'pidgey').evYield = {hp:1};
  input.trainers[0].party.forEach(m => {m.level = 5;});
  if (foeIllusion) input.trainers[0].party[0].species = 'zoroark';
  const compiled = E.contentCompile.compileContent(input); assert(compiled.ok, JSON.stringify(compiled.errors));
  const assembled = E.contentRuntime.assembleContent(compiled.data, E.dex.createDexLookup()); assert.deepEqual(assembled.errors, []);
  const content = assembled.content;
  const mon = E.memberFactory.createMember({id:'P1', species:'Zoroark', level:50, abilityIndex:0}, content, () => 0);
  mon.evs.hp = 7; mon.hp = permanentStats({content}, mon).hp - 10;
  mon.exp = E.growth.minExp(content.species.Zoroark.growth, levelUp ? 51 : 50) - (levelUp ? 1 : 0);
  const backup = E.memberFactory.createMember({id:'P2', species:'Snorlax', level:50}, content, () => 0);
  const game = E.state.newGame({content, party:[mon,backup].map(m => E.speciesKey.toPersistentMember(m,content)), money:1000});
  game.nextMemberOrdinal = '3';
  const state = T.fakes.createMemoryState(game), initial = clone(state.read());
  const app = new E.app.GameApplication({state, projection:T.fakes.createRecordingProjection(),
    sessions:E.composition.createBattleSessionFactory({content:()=>content, seed:()=>[1,2,3,4]}), content:()=>({content}), random:()=>0, clock:()=>12345});
  const request = {battleId:'illusion-growth-'+levelUp+'-'+expGain, trainer:{id:'c-basic',version:1}, seq:1, canLose:true, expGain};
  const s = await app.startTrainerBattle(request); const opening = s.take();
  return {app,s,state,initial,request,content,opening,foes:s.gw.readState('p2')};
}



function close(w) { w.app.abortBattle(w.request, Error('owned test cleanup')); }
for (const foeIllusion of [false, true]) test(`Illusion awards true actor and true foe: opponent illusion=${foeIllusion}`, async () => {
 const w = await open({foeIllusion});
 try {
  const before = clone(w.s.party);
  const opening = JSON.stringify(w.opening.filter(m=>m.kind==='events'));
  assert.match(opening, /p1a: P2/); // public appearance remains disguised
  assert.equal(w.s.activeNow.p1[0], 'P1');
  assert.equal(w.s.activeNow.p2[0], w.foes[0].id);
  const turn = await w.s.chooseMove(1); assert(turn.ok, JSON.stringify(turn));
  assert(w.s.party[0].exp > before[0].exp);
  assert.equal(w.s.party[0].evs.hp, before[0].evs.hp + 1);
  assert.equal(w.s.party[1].exp, before[1].exp);
  assert.deepEqual(w.state.read(), w.initial);
  assert.equal(w.state.replaced.length, 0);
 } finally { close(w); }
 assert.deepEqual(w.state.read(), w.initial);
});
test('Illusion reveal preserves participation; ordinary return switches use real identities', async () => {
 const w = await open({foeMoves:['tackle']});
 try {
  const first=await w.s.chooseMove(2); assert(first.ok);
  assert.equal(actor(w).illusion, null); // real damaging move revealed it
  assert.equal(w.s.activeNow.p1[0], 'P1');
  assert.deepEqual([...w.s.participants[w.foes[0].id]], ['P1']);
  assert((await w.s.chooseSwitch('P2')).ok);
  assert((await w.s.chooseSwitch('P1')).ok);
  assert.equal(w.s.activeNow.p1[0], 'P1');
  const before=clone(w.s.party);
  assert((await w.s.chooseMove(1)).ok);
  for (let i=0;i<2;i++) assert(w.s.party[i].exp>before[i].exp);
 } finally {close(w);}
});
test('Session checkpoint restores private identity bindings and future event capture', async()=>{
 const w=await open({foeIllusion:true});
 try {
  const cp=w.s._checkpoint();
  assert((await w.s.chooseMove(1)).ok);
  const expected=clone(w.s.party);
  await w.s._restoreCheckpoint(cp);
  assert.equal(w.s.activeNow.p1[0],'P1');
  assert((await w.s.chooseMove(1)).ok);
  assert.deepEqual(w.s.party,expected);
 } finally {close(w);}
});
test('Gateway queued multiple switches retain identities across checkpoint without public metadata',async()=>{
 const w=await open();
 try {
  await w.s.gw.choose('p1','switch 2'); await w.s.gw.choose('p2','switch 2');
  const cp=w.s.gw.checkpoint(), restored=await E.gateway.BattleGateway.fromCheckpoint(cp);
  const messages=restored.drain(); const switches=messages.flatMap(m=>m.kind==='events'?m.events:[]).filter(e=>e.type==='switch');
  assert.equal(switches.length,2);
  for(const e of switches) {
   const id=restored.participationIdentity(e);
   assert.equal(id.id, id.side==='p1'?'P2':w.foes[1].id);
   assert.deepEqual(Object.keys(e).sort(),['args','raw','type']);
  }
  assert.throws(()=>restored.participationIdentity({...switches[0]}),/binding-unavailable/);
 } finally {close(w);}
});
test('Illusion growth persists once only at normal App finish', async()=>{
 const w=await open({foeIllusion:true});
 try {
  for(let n=0;n<6&&!w.s.finished;n++) {const r=await w.s.chooseMove(1); assert(r.ok,JSON.stringify(r));}
  assert(w.s.finished); assert.deepEqual(w.state.read(),w.initial);
  const expected=clone(w.s.party);
  const result=w.app.finishBattle(w.s,w.request); assert.equal(result.commit,'applied');
  const stored=w.state.read(); assert.equal(stored.party[0].exp,expected[0].exp);
  assert.equal(stored.party[1].exp,w.initial.party[1].exp);
  assert.equal(stored.party[0].evs.hp,w.initial.party[0].evs.hp+2);
  w.app.finishBattle(w.s,w.request); assert.equal(w.state.replaced.length,1);
 } finally {close(w);}
});
