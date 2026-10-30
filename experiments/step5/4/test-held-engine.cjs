'use strict';
// Actual pinned Showdown actions; only explicitly labelled terminal probes call the diagnostic tie helper.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const E = require('../../../js/engine/build/production.cjs'), T = require('../../../js/engine/build/testing.cjs');
const G = Promise.resolve({ ...E.gateway, ...T.heldDiagnostics });
const H = Promise.resolve(E.heldFacts);
const binding = { battleId: 'B-engine', generation: 1, rawHash: 'a'.repeat(64), contentIdentity: 'b'.repeat(64) };
const set = (name, species, moves, item = '', level = 50) => ({ name, species, moves, item, level, nature: 'Hardy', ability: species === 'Snorlax' ? 'Immunity' : 'Run Away' });
async function create({ p = set('P1', 'Snorlax', ['Splash', 'Recycle']), f = set('F1', 'Caterpie', ['Splash']), wild = false, rest = [] } = {}) {
  const api = await G, players = [{ name: 'Player', team: [p, ...rest] }, { name: wild ? 'Wild' : 'Trainer', team: [f] }];
  const opts = { engineRoot: path.join(root, 'js/engine/showdown'), formatid: 'gen8rpgcustomgame', seed: [1, 2, 3, 4], requiredSettlement: true, wild, players };
  const gw = await api.BattleGateway.create(opts), roster = players.flatMap((side, i) => side.team.map(p => ({ id: p.name, side: i === 0 ? 'p1' : 'p2', initial: p.item || '' })));
  await gw.choose('p1', `team ${players[0].team.map((_, i) => i + 1).join('')}`); await gw.choose('p2', 'team 1'); gw.drain();
  return { gw, opts, roster, lineage: api.gatewaySettlementLineage(gw) };
}
async function turn(gw, own = 'move 1', foe = 'move 1') { assert.equal(await gw.choose('p1', own), true); assert.equal(await gw.choose('p2', foe), true); return gw.drain(); }
async function finish(sample, diagnosticTie = true) {
  const api = await G;
  if (diagnosticTie && !sample.gw.ended) { sample.gw._debugBattle().tie(); sample.gw._pump(); }
  const facts = api.gatewaySettlementFacts(sample.gw, sample.lineage, binding);
  const resolved = (await H).resolveRequiredFacts(facts, { binding, roster: sample.roster, wild: sample.opts.wild });
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  return facts;
}

test('B engine: consumption clears I; real Recycle restores it only in a wild battle', async () => {
  for (const wild of [false, true]) {
    const sample = await create({ wild, p: set('P1', 'Snorlax', ['Splash', 'Recycle'], 'oranberry') });
    const hp = sample.gw.readState('p1')[0].maxhp;
    sample.gw.seedState('p1', [{ id: 'P1', hp: 1 }]);
    await turn(sample.gw);
    assert.equal(sample.gw._debugBattle().sides[0].active[0].item, '');
    sample.gw.seedState('p1', [{ id: 'P1', hp }]); await turn(sample.gw, 'move 2');
    const facts = await finish(sample), player = facts.members.find(m => m.id === 'P1');
    assert.deepEqual([player.current, player.recovery, player.recycle], ['oranberry', wild ? 'oranberry' : '', '']);
    assert.deepEqual(facts.events.filter(e => e.id === 'P1').map(e => e.reason), ['consume', 'recycle']);
  }
});
test('B engine: Knock Off is temporary; foreign berry consumed after trainer Trick preserves original I', async () => {
  const knocked = await create({ p: set('P1', 'Snorlax', ['Splash'], 'leftovers'), f: set('F1', 'Machop', ['Knock Off']) });
  await turn(knocked.gw); const k = (await finish(knocked)).members.find(m => m.id === 'P1');
  assert.deepEqual([k.current, k.recovery], ['', 'leftovers']);
  const swapped = await create({ p: set('P1', 'Snorlax', ['Trick'], 'leftovers'), f: set('F1', 'Snorlax', ['Splash'], 'oranberry') });
  swapped.gw.seedState('p1', [{ id: 'P1', hp: 1 }]); await turn(swapped.gw);
  const facts = await finish(swapped), p = facts.members.find(m => m.id === 'P1');
  assert.deepEqual([p.current, p.recovery, p.recycle], ['', 'leftovers', 'oranberry']);
  assert.ok(facts.events.some(e => e.reason === 'consume' && e.before.current === 'oranberry'));
});
test('B engine: wild Thief transfers recovery, wild Trick only updates the player recovery record', async () => {
  for (const move of ['Thief', 'Trick']) {
    const sample = await create({ wild: true, p: set('P1', 'Persian', [move]), f: set('F1', 'Snorlax', ['Splash'], 'leftovers') });
    await turn(sample.gw); const facts = await finish(sample), p = facts.members.find(m => m.id === 'P1'), f = facts.members.find(m => m.id === 'F1');
    assert.deepEqual([p.current, p.recovery, f.current, f.recovery], ['leftovers', 'leftovers', '', move === 'Thief' ? '' : 'leftovers']);
  }
});
test('B engine: direct Air Balloon removal is permanent without a recycle record', async () => {
  const sample = await create({ p: set('P1', 'Snorlax', ['Splash'], 'airballoon'), f: set('F1', 'Caterpie', ['Tackle']) });
  await turn(sample.gw); const p = (await finish(sample)).members.find(m => m.id === 'P1');
  assert.deepEqual([p.current, p.recovery, p.recycle], ['', '', '']);
});
test('B engine: actual Happy Hour and successful Pay Day bind money; protected Pay Day does not count', async () => {
  const sample = await create({ p: set('P1', 'Snorlax', ['Happy Hour', 'Pay Day'], 'amuletcoin'), f: set('F1', 'Snorlax', ['Splash', 'Protect']) });
  await turn(sample.gw); await turn(sample.gw, 'move 2', 'move 2'); await turn(sample.gw, 'move 2');
  const facts = await finish(sample);
  assert.deepEqual(facts.money, { amuletCoin: true, happyHour: true, payDay: 250 });
  const terminal = await create({ p: set('P1', 'Persian', ['Pay Day'], 'amuletcoin', 100), f: set('F1', 'Caterpie', ['Splash'], '', 1) });
  await turn(terminal.gw); assert.equal(terminal.gw.ended, true);
  assert.equal((await finish(terminal, false)).money.payDay, 500, 'terminal result needs no following request');
});
test('B engine: opaque checkpoint restores the same source and events; arbitrary JSON/same-state new battle cannot', async () => {
  const api = await G, sample = await create({ p: set('P1', 'Snorlax', ['Splash'], 'oranberry') });
  sample.gw.seedState('p1', [{ id: 'P1', hp: 1 }]);
  const checkpoint = sample.gw.checkpoint(), snapshot = sample.gw.snapshot();
  await turn(sample.gw); const expected = await finish(sample);
  const original = api.BattleGateway.restore; let called = 0;
  api.BattleGateway.restore = async () => { called++; return (await create()).gw; };
  let restored;
  try { restored = await api.showdownDriverFactory.fromCheckpoint(checkpoint); } finally { api.BattleGateway.restore = original; }
  assert.equal(called, 0, 'trusted restoration implementation was captured before caller replacement');
  assert.equal(api.gatewaySettlementLineage(restored), sample.lineage);
  await turn(restored);
  assert.deepEqual(await finish({ ...sample, gw: restored }), expected);
  const naked = await api.BattleGateway.restore(snapshot, { engineRoot: sample.opts.engineRoot });
  assert.equal(api.gatewaySettlementLineage(naked), null);
  const other = await create();
  assert.notEqual(other.lineage, sample.lineage);
  assert.throws(() => api.gatewaySettlementFacts(other.gw, sample.lineage, binding), /source-mismatch/);
});

// Supported direct assignments and permanent removal, exercised through real move execution.
test('B engine: Fling/Natural Gift clear I and keep R; Bug Bite/Pluck permanently remove target I without R',async()=>{
  for(const move of ['Fling','Natural Gift']){
    const s=await create({p:set('P1','Snorlax',[move],'oranberry'),f:set('F1','Snorlax',['Splash'])});
    await turn(s.gw);const facts=await finish(s),p=facts.members.find(m=>m.id==='P1');
    assert.deepEqual([p.current,p.recovery,p.recycle],['','','oranberry'],move);
    assert.ok(facts.events.some(e=>e.id==='P1'&&e.reason==='consume'));
  }
  for(const move of ['Bug Bite','Pluck']){
    const s=await create({p:set('P1','Snorlax',[move]),f:set('F1','Snorlax',['Splash'],'oranberry')});
    await turn(s.gw);const facts=await finish(s),target=facts.members.find(m=>m.id==='F1');
    assert.deepEqual([target.current,target.recovery,target.recycle],['','',''],move);
    assert.ok(facts.events.some(e=>e.id==='F1'&&e.reason==='permanent-loss'&&e.sourceId==='P1'));
  }
});
test('B engine: amulet is initial-holder entry only, independent of effectiveness; enemy money moves confer no player reward',async()=>{
  const unsent=await create({rest:[set('P2','Snorlax',['Splash'],'amuletcoin')]});
  assert.equal((await finish(unsent)).money.amuletCoin,false);
  const ineffective=await create({p:{...set('P1','Snorlax',['Splash'],'amuletcoin'),ability:'Klutz'},f:set('F1','Snorlax',['Happy Hour','Pay Day'],'luckincense')});
  await turn(ineffective.gw);await turn(ineffective.gw,'move 1','move 2');
  assert.deepEqual((await finish(ineffective)).money,{amuletCoin:true,happyHour:false,payDay:0});
});
test('B engine: Illusion display and switching never change the stable held object identity',async()=>{
  const s=await create({p:{...set('P1','Zoroark',['Splash'],'leftovers'),ability:'Illusion'},rest:[set('P2','Snorlax',['Splash'],'oranberry')],f:set('F1','Machop',['Knock Off'])});
  const actual=s.gw._debugBattle().sides[0].active[0];assert.equal(actual.illusion?.set.name,'P2');
  await turn(s.gw);const facts=await finish(s);
  assert.deepEqual(facts.members.filter(m=>m.side==='p1').map(m=>[m.id,m.current,m.recovery]),[['P1','','leftovers'],['P2','oranberry','oranberry']]);
  assert.ok(facts.events.some(e=>e.id==='P1'&&e.reason==='temporary-remove'));assert.ok(!facts.events.some(e=>e.id==='P2'));
});
test('B engine: unknown direct held write poisons the whole channel, rather than succeeding with empty facts',async()=>{
  const s=await create(),api=await G;
  s.gw._debugBattle().sides[0].active[0].item='leftovers';
  s.gw._debugBattle().tie();s.gw._pump();
  assert.throws(()=>api.gatewaySettlementFacts(s.gw,s.lineage,binding),/required-held-facts-unavailable:.*unhandled-held-receive/);
});

test('B effective Gen8 unsupported transfer/removal families refuse the complete terminal channel',async()=>{
 const inputs=[
  {p:set('P1','Snorlax',['Corrosive Gas']),f:set('F1','Snorlax',['Splash'],'leftovers')},
  {p:set('P1','Snorlax',['Tackle']),f:set('F1','Snorlax',['Splash'],'stickybarb')},
  {p:{...set('P1','Delphox',['Tackle']),ability:'Magician'},f:set('F1','Snorlax',['Splash'],'leftovers')},
  {p:set('P1','Snorlax',['Tackle'],'leftovers'),f:{...set('F1','Weavile',['Splash']),ability:'Pickpocket'}},
  {p:{...set('P1','Snorlax',['Splash']),ability:'Pickup'},f:set('F1','Snorlax',['Splash'],'oranberry')},
 ];
 for(const input of inputs){const s=await create(input),api=await G;if(input.p.ability==='Pickup')s.gw.seedState('p2',[{id:'F1',hp:1}]);await turn(s.gw);s.gw._debugBattle().tie();s.gw._pump();assert.throws(()=>api.gatewaySettlementFacts(s.gw,s.lineage,binding),/required-held-facts-unavailable/);}
});

test('B-ULTRA-03 real Substitute Pay Day counts once; body/protect/immunity and RNG match uninstrumented engine',async()=>{
  const api=await G;
  for(const [label,species,foeMoves,first] of [
    ['substitute','Snorlax',['Substitute','Splash'],true],['body','Snorlax',['Splash'],false],
    ['protect','Snorlax',['Protect'],false],['immune','Gastly',['Splash'],false],
  ]){
    const p=set('P1','Snorlax',['Splash','Pay Day']),f=set('F1',species,foeMoves);
    const sample=await create({p,f}), control=await api.BattleGateway.create({...sample.opts,requiredSettlement:false});
    await control.choose('p1','team 1');await control.choose('p2','team 1');control.drain();
    if(first){await turn(sample.gw);await turn(control);}
    const target=sample.gw._debugBattle().sides[1].active[0],before=first?target.volatiles.substitute.hp:null;
    const pp=sample.gw.readState('p1')[0].pp.payday;
    const messages=await turn(sample.gw,'move 2',first?'move 2':'move 1');await turn(control,'move 2',first?'move 2':'move 1');
    if(first)assert.ok((target.volatiles.substitute?.hp??0)<before,'real substitute damage');
    assert.equal(sample.gw.readState('p1')[0].pp.payday,pp-1);
    for(const side of ['p1','p2'])assert.deepEqual(sample.gw.readState(side),control.readState(side),label);
    assert.equal(sample.gw._debugBattle().prng.getSeed(),control._debugBattle().prng.getSeed(),label);
    assert.equal((await finish(sample)).money.payDay,['protect','immune'].includes(label)?0:250,label+JSON.stringify(messages));
  }
});

test('B-ULTRA-04 wild Trick/Switcheroo attempts spend ordinary PP and fail without changing C/I/R',async()=>{
  for(const move of ['Trick','Switcheroo']){
    const s=await create({wild:true,p:set('P1','Snorlax',['Splash'],'leftovers'),f:set('F1','Persian',[move],'blacksludge')});
    const id=move.toLowerCase(),pp=s.gw.readState('p2')[0].pp[id];const messages=await turn(s.gw);
    assert.equal(s.gw.readState('p2')[0].pp[id],pp-1);assert.match(JSON.stringify(messages),/-fail/,'normal attempted-move failure feedback');
    const facts=await finish(s);assert.equal(facts.events.length,0);
    assert.deepEqual(facts.members.map(m=>[m.current,m.recovery,m.recycle]),[['leftovers','leftovers',''],['blacksludge','blacksludge','']]);
    const trainer=await create({p:set('P1','Snorlax',['Splash'],'leftovers'),f:set('F1','Persian',[move],'oranberry')});
    await turn(trainer.gw);assert.equal((await finish(trainer)).members.find(m=>m.id==='P1').current,'oranberry','trainer exchange still executes');
  }
});

test('B-ULTRA-05 same opaque checkpoint after switching/Illusion preserves complete ordered facts and pair hash',async()=>{
  const api=await G;
  for(const illusion of [false,true]){
    const p=illusion?{...set('P1','Zoroark',['Splash'],'leftovers'),ability:'Illusion'}:set('P1','Snorlax',['Splash'],'leftovers');
    const s=await create({p,rest:[set('P2','Persian',['Tackle'],'oranberry',100)],f:set('F1','Caterpie',['Splash'],'',1)});
    if(illusion)assert.equal(s.gw._debugBattle().sides[0].active[0].illusion?.set.name,'P2');
    await turn(s.gw,'switch 2');const token=s.gw.checkpoint();await turn(s.gw);assert.equal(s.gw.ended,true);
    const original=await finish(s,false),resolved=E.heldFacts.resolveRequiredFacts(original,{binding,roster:s.roster,wild:false});
    for(let repeat=0;repeat<2;repeat++){
      const restored=await api.showdownDriverFactory.fromCheckpoint(token);await turn(restored);assert.equal(restored.ended,true);
      const next=await finish({...s,gw:restored},false);assert.deepEqual(next,original);
      assert.equal(E.heldFacts.resolveRequiredFacts(next,{binding,roster:s.roster,wild:false}).pairHash,resolved.pairHash);
      assert.equal(restored._debugBattle().prng.getSeed(),s.gw._debugBattle().prng.getSeed());
    }
  }
});
