'use strict';
// Authored synthetic teams, actual App -> Session -> pinned Gen8 actions.
// Debug access only observes engine state; it never seeds a stat, faint, or effect.
const test = require('node:test'), assert = require('node:assert/strict');
const { E, T, inputs } = require('./trainer-ai-integration/fixtures.cjs');
const clone = value => structuredClone(value);
const KEYS = ['atk','def','spa','spd','spe'];
const EFFECTS = ['powertrick','guardsplit','powersplit','speedswap'];
const CASES = [
  { id:'exp-only', evYield:{}, initialEvs:{}, changed:false },
  { id:'sub-threshold-ev', evYield:{atk:1}, initialEvs:{}, changed:false },
  { id:'hp-only-ev', evYield:{hp:1}, initialEvs:{hp:7}, changed:false, hpGrowth:true },
  { id:'level-up', evYield:{}, initialEvs:{}, levelUp:true, changed:true },
  { id:'non-hp-ev-point', evYield:{atk:1}, initialEvs:{atk:7}, changed:true },
  { id:'exp-disabled', evYield:{atk:1}, initialEvs:{atk:7}, expGain:false, changed:false },
];
const actor = w => w.s.gw._debugBattle().sides[0].pokemon.find(p => p.name === 'A');
const raw = w => ({...actor(w).storedStats});
const natural = w => {
  const p = actor(w), stats = w.s.gw._debugBattle().spreadModify(p.species.baseStats,p.set);
  return Object.fromEntries(KEYS.map(key => [key,stats[key]]));
};
const permanent = w => {
  const m = w.s.party.find(m => m.id === 'A');
  return E.growth.computeStats(w.content.species[m.species].base,m.ivs,m.evs,m.level,m.statNature??m.nature);
};
function uncommitted(w) {
  assert.deepEqual(w.port.read(),w.initial);
  assert.equal(w.port.replaced.length,0);
}
async function open(effect, scenario, species='Snorlax', item) {
  const input = inputs({party:2,moves:['splash']});
  input.species.find(s => s.id === 'snorlax').learnset = [effect,'seismictoss','curse','splash'].map(move => ({level:1,move}));
  if (species !== 'Snorlax') {
    input.species.push({id:species.toLowerCase(),showdownId:species.toLowerCase(),nameKey:'species.'+species.toLowerCase(),
      growth:'slow',baseExp:335,evYield:{},catchRate:10,source:'author-placeholder',
      learnset:[effect,'seismictoss','curse','splash'].map(move=>({level:1,move}))});
    input.items.push({id:item,name:item,namePlural:item,pocket:1,price:0,source:'author-placeholder'});
  }
  input.species.find(s => s.id === 'pidgey').evYield = {...scenario.evYield};
  input.trainers[0].party.forEach(m => {m.level=3;});
  const compiled=E.contentCompile.compileContent(input); assert(compiled.ok,JSON.stringify(compiled.errors));
  const dex=E.dex.createDexLookup(),joined=E.contentRuntime.assembleContent(compiled.data,dex); assert.deepEqual(joined.errors,[]);
  const content=joined.content, mon=E.memberFactory.createMember({id:'A',species,level:50},content,()=>0);
  if(item) mon.item=item;
  Object.assign(mon.evs,scenario.initialEvs);
  mon.hp=E.growth.computeStats(content.species[species].base,mon.ivs,mon.evs,mon.level,mon.nature).hp-10;
  mon.exp=E.growth.minExp(content.species[species].growth,scenario.levelUp?51:50)-(scenario.levelUp?1:0);
  const backup=E.memberFactory.createMember({id:'R',species:'Snorlax',level:50},content,()=>0);
  const game=E.state.newGame({content,party:[mon,backup].map(m=>E.speciesKey.toPersistentMember(m,content)),money:1000});
  game.nextMemberOrdinal='3';
  const port=T.fakes.createMemoryState(game),initial=clone(port.read());
  const app=new E.app.GameApplication({state:port,projection:T.fakes.createRecordingProjection(),
    sessions:E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4]}),
    content:()=>({content,dex}),random:()=>0,clock:()=>12345});
  const req={battleId:'raw-growth-'+effect+'-'+scenario.id,trainer:{id:'c-basic',version:1},seq:1,
    canLose:true,expGain:scenario.expGain!==false,moneyGain:false};
  const s=await app.startTrainerBattle(req);s.take();
  return {s,app,req,port,initial,content};
}
for(const effect of EFFECTS) for(const scenario of CASES) test(effect+' '+scenario.id+' growth, checkpoint, continuation, switch and commit',async()=>{
  const w=await open(effect,scenario);
  try {
    const original=natural(w), priorPermanent=clone(w.s.party[0]);
    assert((await w.s.chooseMove(1)).ok);
    const applied=raw(w); assert.notDeepEqual(applied,original,'real effect must change at least one raw stat');
    if(effect==='powertrick') {
      assert.equal(applied.atk,original.def);assert.equal(applied.def,original.atk);assert(actor(w).volatiles.powertrick);
    } else if(effect==='speedswap') assert.equal(applied.spe,8);
    else {
      const keys=effect==='guardsplit'?['def','spd']:['atk','spa'];
      const foe=w.s.gw._debugBattle().sides[1].active[0];
      for(const key of keys) assert.equal(applied[key],foe.storedStats[key]);
    }
    // A normal non-KO round must not reset the raw effect; ordinary stages remain independent.
    assert((await w.s.chooseMove(3)).ok);
    assert.deepEqual(raw(w),applied);
    const boosts=clone(actor(w).boosts);assert.equal(boosts.atk,1);assert.equal(boosts.def,1);assert.equal(boosts.spe,-1);
    await w.s._restoreCheckpoint(w.s._checkpoint());assert.deepEqual(raw(w),applied);assert.deepEqual(actor(w).boosts,boosts);
    const before={hp:actor(w).hp,maxhp:actor(w).maxhp,exp:w.s.party[0].exp};
    const ko=await w.s.chooseMove(2); assert(ko.ok,JSON.stringify(ko));assert.equal(w.s.finished,false);
    assert.equal(w.s.party[0].level,scenario.levelUp?51:50);
    assert.deepEqual(actor(w).boosts,boosts,'growth must retain positive and negative stages');
    const expected=scenario.changed?natural(w):applied;
    assert.deepEqual(raw(w),expected,'only an actual natural non-HP stat change refreshes raw values');
    if(scenario.changed) assert.notDeepEqual(expected,applied);
    else assert.deepEqual(natural(w),original,'no-op predicate must compare natural stats, not effects');
    if(effect==='powertrick') assert(actor(w).volatiles.powertrick,'existing marker semantics remain unchanged');
    if(scenario.expGain===false) {
      assert.equal(w.s.party[0].exp,before.exp);assert.deepEqual(w.s.party[0].evs,priorPermanent.evs);
      assert(!ko.messages.some(m=>m.kind==='growth'));
    } else {
      assert(w.s.party[0].exp>before.exp);assert(ko.messages.some(m=>m.kind==='growth'));
      for(const key of Object.keys(scenario.evYield)) assert.equal(w.s.party[0].evs[key],priorPermanent.evs[key]+scenario.evYield[key]);
    }
    assert.equal(actor(w).hp,E.growth.hpAfterRecalc(before.hp,before.maxhp,actor(w).maxhp));
    if(scenario.hpGrowth) assert(actor(w).maxhp>before.maxhp,'HP growth is not gated by non-HP no-op');
    assert.deepEqual(w.s.gw.readState('p1').find(m=>m.id==='A').stats,permanent(w));uncommitted(w);
    const stable={raw:raw(w),boosts:clone(actor(w).boosts),hp:actor(w).hp,maxhp:actor(w).maxhp};
    await w.s._restoreCheckpoint(w.s._checkpoint());assert.deepEqual(raw(w),stable.raw);assert.deepEqual(actor(w).boosts,stable.boosts);
    assert.equal(actor(w).hp,stable.hp);assert.equal(actor(w).maxhp,stable.maxhp);
    assert((await w.s.chooseMove(4)).ok);assert.deepEqual(raw(w),stable.raw);assert.deepEqual(actor(w).boosts,boosts);
    assert.equal(actor(w).getStat('atk'),Math.floor(stable.raw.atk*1.5));
    assert.equal(actor(w).getStat('def'),Math.floor(stable.raw.def*1.5));
    assert.equal(actor(w).getStat('spe'),Math.floor(stable.raw.spe/1.5));
    assert((await w.s.chooseSwitch('R')).ok);assert((await w.s.chooseSwitch('A')).ok);
    assert.deepEqual(raw(w),natural(w),'ordinary switch-back resets raw effects using current growth');
    assert.equal(actor(w).volatiles.powertrick,undefined);assert(Object.values(actor(w).boosts).every(value=>value===0));
    uncommitted(w);assert((await w.s.chooseMove(2)).ok);assert(w.s.finished);
    const result=w.s.result(),outcome=w.app.finishBattle(w.s,w.req);assert.equal(outcome.commit,'applied',JSON.stringify(outcome));
    assert.equal(w.port.replaced.length,1);const saved=clone(w.port.read()),member=saved.party.find(m=>m.id==='A');
    assert.equal(member.level,w.s.party[0].level);assert.equal(member.exp,w.s.party[0].exp);assert.deepEqual(member.evs,w.s.party[0].evs);
    assert.equal(member.hp,result.members.A.hp);assert.equal(member.species,'snorlax');
    for(const key of ['storedStats','baseStoredStats','boosts','volatiles']) assert.equal(Object.hasOwn(member,key),false);
    w.app.finishBattle(w.s,w.req);assert.equal(w.port.replaced.length,1);assert.deepEqual(w.port.read(),saved);
  } finally {w.app.abortBattle(w.req,Error('owned raw-growth cleanup'));}
});

for(const [species,item] of [['Zacian','rustedsword'],['Zamazenta','rustedshield']])
  for(const scenario of [CASES[0],CASES[3]]) test(species+' Crowned Power Trick '+scenario.id+' uses its natural battle basis',async()=>{
    const w=await open('powertrick',scenario,species,item);
    try {
      assert.equal(actor(w).species.name,species+'-Crowned');assert.equal(actor(w).baseSpecies.name,species+'-Crowned');
      const original=natural(w);assert((await w.s.chooseMove(1)).ok);const swapped=raw(w);
      assert.equal(swapped.atk,original.def);assert.equal(swapped.def,original.atk);
      assert((await w.s.chooseMove(2)).ok);assert.equal(w.s.party[0].level,scenario.levelUp?51:50);
      assert.equal(actor(w).species.name,species+'-Crowned');assert.equal(actor(w).baseSpecies.name,species+'-Crowned');
      assert.equal(actor(w).set.species,species);
      assert.deepEqual(raw(w),scenario.changed?natural(w):swapped);
      assert.deepEqual(w.s.gw.readState('p1').find(m=>m.id==='A').stats,permanent(w));
      assert.equal(actor(w).maxhp,permanent(w).hp);uncommitted(w);
      await w.s._restoreCheckpoint(w.s._checkpoint());assert.deepEqual(raw(w),scenario.changed?natural(w):swapped);
      assert((await w.s.chooseSwitch('R')).ok);assert((await w.s.chooseSwitch('A')).ok);
      assert.equal(actor(w).species.name,species+'-Crowned');assert.deepEqual(raw(w),natural(w));
      uncommitted(w);
    } finally {w.app.abortBattle(w.req,Error('owned Crowned raw-growth cleanup'));}
  });
