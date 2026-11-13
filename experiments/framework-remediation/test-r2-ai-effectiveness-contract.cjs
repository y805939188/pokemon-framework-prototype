'use strict';
// Authored content -> production App/Session -> pinned engine and the real Trainer AI boundary.
const test = require('node:test'), assert = require('node:assert/strict');
const { E, T, D, inputs, clone } = require('../step5/4/trainer-ai-integration/fixtures.cjs');
const WEAK = ['Normal', 'Ice', 'Rock', 'Dark', 'Steel'];
const RESIST = ['Fire', 'Grass', 'Poison', 'Flying', 'Bug'];
const GRASS_RESIST = ['Bug', 'Dragon', 'Fire', 'Flying', 'Grass', 'Poison', 'Steel'];
const ai = require('../../src/framework/rules/trainer-ai.ts');
async function open(t, { types, move = 'rocksmash', registered = false, turns = [2], playerMoves = ['splash'], npcTypes = ['Normal', 'Flying'], npcParty = 1 } = {}) {
  t.mock.method(Date, 'now', () => 1794528000000);
  const raw = inputs({ party: npcParty, moves: [move, 'splash', 'forestscurse'] });
  const player = raw.species.find(s => s.id === 'snorlax');
  player.types = types; player.learnset = playerMoves.map(move => ({ level: 1, move }));
  raw.species.find(s => s.id === 'pidgey').types = npcTypes;
  for (const member of raw.trainers[0].party) member.level = 5; // Nonlethal 32x hits; no private HP setup.
  const snapshots = [], registry = E.composition.createTrainerAiStrategyRegistry();
  if (registered) {
    raw.trainers[0].aiStrategy = { id: 'r2-ratio', version: '1', parameters: {} };
    registry.register({ id: 'r2-ratio', version: '1', implementationIdentity: 'test/r2-ratio/1', validateParameters() {}, create() { return { decide(s) {
      snapshots.push(clone(s));
      const slot = turns[s.binding.turn - 1] ?? turns.at(-1), c = s.request.legalMoves.find(m => m.slot === slot);
      return { kind: 'choose', binding: s.binding, candidateId: c.candidateId, retryOrder: [c.candidateId], diagnostics: [] };
    } }; } });
  }
  const built = E.contentCompile.compileContent(raw); assert.equal(built.ok, true, JSON.stringify(built.errors));
  const assembled = E.contentRuntime.assembleContent(built.data, E.dex.createDexLookup()); assert.deepEqual(assembled.errors, []);
  const content = assembled.content;
  const member = E.memberFactory.createMember({ id: 'P1', species: 'Snorlax', level: 50 }, content, () => 0);
  const game = E.state.newGame({ content, party: [E.speciesKey.toPersistentMember(member, content)], money: 1000 }); game.nextMemberOrdinal = '2';
  const state = T.fakes.createMemoryState(game), app = new E.app.GameApplication({ state, projection: T.fakes.createRecordingProjection(),
    sessions: E.composition.createBattleSessionFactory({ content: () => content, seed: () => [1, 2, 3, 4], trainerAiStrategies: registry }),
    content: () => ({ content }), random: () => 0, clock: () => 12345 });
  const request = { battleId: 'R2-ratio', trainer: { id: 'c-basic', version: 1 }, seq: 1, canLose: true }, session = await app.startTrainerBattle(request);
  t.after(() => app.abortBattle(request, Error('R2 ratio owned cleanup')));
  const battle = () => session.gw._debugBattle(), target = () => battle().sides[0].active[0];
  const candidate = () => D.captureTrainerAiRequest(session, session.gw).snapshot.request.legalMoves.find(m => m.moveId === move);
  return { raw, content, app, state, session, snapshots, battle, target, candidate };
}
async function step(w, slot = 1) {
  const turn = w.battle().turn, r = await w.session.chooseMove(slot);
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(w.battle().turn, turn + 1);
  assert.equal(w.session.broken, null); assert.equal(w.state.replaced.length, 0);
}
const ratio = (n, d = 1) => ({ numerator: n, denominator: d });

for (const [label, types, move, expected] of [
  ['five weaknesses', WEAK, 'rocksmash', ratio(32)],
  ['five resistances', RESIST, 'absorb', ratio(1, 32)],
  ['ordinary dual', WEAK.slice(0, 2), 'rocksmash', ratio(4)],
  ['three types', WEAK.slice(0, 3), 'rocksmash', ratio(8)],
  ['four types', WEAK.slice(0, 4), 'rocksmash', ratio(16)],
  ['six resistances at cap', GRASS_RESIST.slice(0, 6), 'absorb', ratio(1, 64)],
  ['seven resistances beyond cap', GRASS_RESIST, 'absorb', ratio(1, 64)],
  ['immunity dominates weaknesses', [...WEAK, 'Ghost'], 'rocksmash', ratio(0)],
  ['all eighteen types', E.dex.createDexLookup().allTypes().map(t => t.name), 'rocksmash', ratio(0)],
]) test('R2 AI formal default action and effective public multiplier: ' + label, async t => {
  const w = await open(t, { types, move });
  assert.deepEqual(w.content.species.Snorlax.types, types); assert.deepEqual(w.app.describeIndividual('P1').types, types);
  assert.deepEqual(w.target().getTypes(), types);
  assert.deepEqual(D.captureTrainerAiRequest(w.session, w.session.gw).snapshot.opponent.active[0].shownTypes, types);
  assert.deepEqual(w.candidate().metadata.publicTypeMultiplier, expected);
  const observed = [], actions = w.battle().actions, modify = actions.modifyDamage;
  t.mock.method(actions, 'modifyDamage', function(base, source, target, m, ...rest) {
    const value = modify.call(this, base, source, target, m, ...rest);
    if (m.id === move && target === w.target()) observed.push(target.getMoveHitData(m).typeMod);
    return value;
  });
  const hp = w.target().hp; await step(w);
  // The zero-weight resisted case may choose Splash; do not depend on selecting it for validation.
  if (expected.numerator === 0) assert.equal(w.target().hp, hp);
  for (const exponent of observed) assert.equal(2 ** exponent, expected.numerator / expected.denominator);
  if (expected.numerator === 32) { assert(observed.length > 0); assert(w.target().hp < hp); }
});

for (const [types, move, expected] of [[WEAK, 'rocksmash', ratio(32)], [RESIST, 'absorb', ratio(1, 32)]])
  test('R2 registered strategy validates every move without choosing the high-ratio move: ' + move, async t => {
    const w = await open(t, { types, move, registered: true });
    await step(w); assert.equal(w.snapshots.length, 1);
    assert.deepEqual(w.snapshots[0].request.legalMoves.find(m => m.moveId === move).metadata.publicTypeMultiplier, expected);
    assert(w.battle().log.some(line => line.startsWith('|move|p2a:') && line.includes('|Splash|')));
  });

test('R2 real Forest\'s Curse fifth type, registered action, exact checkpoint replay and stale source identity', async t => {
  const base = ['Fire', 'Poison', 'Flying', 'Bug'], w = await open(t, { types: base, move: 'absorb', registered: true, turns: [3, 2] });
  await step(w); assert.deepEqual(w.target().getTypes(), [...base, 'Grass']);
  assert.deepEqual(w.candidate().metadata.publicTypeMultiplier, ratio(1, 32));
  const oldDriver = w.session.gw, oldCapture = D.captureTrainerAiRequest(w.session, oldDriver), oldTicket = oldCapture.ticket;
  const cp = w.session._checkpoint(), before = D.inspectTrainerAiRequest(w.session, oldDriver), saved = clone(w.state.current());
  await step(w); const after = w.session.gw.snapshot();
  await w.session._restoreCheckpoint(cp);
  assert.deepEqual(w.target().getTypes(), [...base, 'Grass']);
  assert.deepEqual(D.inspectTrainerAiRequest(w.session, w.session.gw).snapshot, before.snapshot);
  assert.throws(() => D.validateTrainerAiTicket(w.session, w.session.gw, oldTicket, oldCapture.snapshot.request.legalMoves[0].candidateId), /ticket|source|request|candidate/);
  assert.throws(() => D.captureTrainerAiRequest(w.session, oldDriver), /driver|source/);
  await step(w); assert.deepEqual(JSON.parse(w.session.gw.snapshot()), JSON.parse(after));
  assert.deepEqual(w.state.current(), saved); assert.deepEqual(w.content.species.Snorlax.types, base);
});

for (const count of [6, 7]) test('R2 pinned actual damage clamps resistance only after the full sum: ' + count, async t => {
  const w = await open(t, { types: GRASS_RESIST.slice(0, count), move: 'absorb', registered: true, turns: [1] });
  const exponents = [], target = w.target(), actions = w.battle().actions, modify = actions.modifyDamage;
  t.mock.method(actions, 'modifyDamage', function(base, source, target, m, ...rest) {
    const result = modify.call(this, base, source, target, m, ...rest);
    if (m.id === 'absorb') exponents.push(target.getMoveHitData(m).typeMod);
    return result;
  });
  const raw = target.runEffectiveness(w.battle().dex.moves.get('absorb'));
  assert.equal(raw, -count); assert.deepEqual(w.candidate().metadata.publicTypeMultiplier, ratio(1, 64));
  const hp = target.hp; await step(w); assert.deepEqual(exponents, [-6]); assert(target.hp < hp);
});

test('R2 arithmetic boundary keeps finite integer scoring, equivalent old ratios and rejects invalid or overflowing inputs', () => {
  const input = { basePower: 100, stab: true, accuracy: 100, family: 'basic-damage', scoreMoves: true, predictFailure: true, publicFailure: 'none' };
  assert.equal(ai.scoreTrainerMove({ ...input, publicTypeMultiplier: ratio(64) }).score, 9700);
  assert.equal(ai.scoreTrainerMove({ ...input, publicTypeMultiplier: ratio(1, 64) }).score, 102);
  assert.equal(ai.scoreTrainerMove({ ...input, publicTypeMultiplier: ratio(6, 4) }).score, 325);
  for (const invalid of [ratio(65), ratio(1, 65), ratio(-1), ratio(1, 0), ratio(1.5), ratio(Infinity), ratio(Number.MAX_SAFE_INTEGER)])
    assert.equal(ai.scoreTrainerMove({ ...input, publicTypeMultiplier: invalid }).kind, 'error');
  assert.equal(ai.scoreTrainerMove({ ...input, basePower: Number.MAX_SAFE_INTEGER, publicTypeMultiplier: ratio(64) }).kind, 'error');
});

test('R2 actual type immunity remains zero and the engine rejects the registered attack', async t => {
  const w = await open(t, { types: [...WEAK, 'Ghost'], registered: true, turns: [1] }), hp = w.target().hp;
  await step(w); assert.equal(w.target().hp, hp);
  assert(w.battle().log.some(line => line.startsWith('|-immune|p1a:')));
  assert.deepEqual(w.snapshots[0].request.legalMoves[0].metadata.publicTypeMultiplier, ratio(0));
});

test('R2 formal forced replacement scores five-type advantages and risks without strategy-fault fallback', async t => {
  const w = await open(t, { types: WEAK, npcTypes: WEAK, playerMoves: ['rocksmash', 'splash'], npcParty: 3 });
  await step(w); assert.equal(w.battle().sides[1].totalFainted, 1);
  assert.equal(w.battle().sides[1].active[0].fainted, false);
  const journal = D.trainerAiJournal(w.session).entries;
  assert.equal(journal.length, 2); assert(journal.every(r => r.fallbackReason === null));
  assert(journal.some(r => r.plan.candidateId.includes(':s:')));
  const cp = w.session._checkpoint(); await step(w); await w.session._restoreCheckpoint(cp);
  assert.deepEqual(w.battle().sides[1].active[0].getTypes(), WEAK);
  assert.equal(w.session.broken, null);
});

// Synthetic public catalogs exercise +6/+7, which the fixed standard 18-type chart cannot produce.
// Full policy validation is used, including legal non-reduced catalog cells and snapshot ratios.
const { catalog, snapshot } = require('../step5/4/trainer-ai-pure/adapter.cjs');
for (const [label, cells, expected] of [
  ['positive cap', [2, 2, 2, 2, 2, 2], ratio(64)],
  ['positive beyond cap', [2, 2, 2, 2, 2, 2, 2], ratio(64)],
  ['negative beyond cap', [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], ratio(1, 64)],
  ['late weaknesses after seven resistances', [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 2, 2], ratio(1, 32)],
  ['late resistances after seven weaknesses', [2, 2, 2, 2, 2, 2, 2, 0.5, 0.5], ratio(32)],
  ['immunity before extreme sum', [0, 2, 2, 2, 2, 2, 2, 2], ratio(0)],
]) test('R2 public policy synthetic exponent contract: ' + label, () => {
  const c = catalog(), s = snapshot(), names = Object.keys(c.types).slice(0, cells.length);
  for (const [i, name] of names.entries()) c.types.normal[name] = cells[i] === 0 ? ratio(0, 16) : cells[i] === 2 ? ratio(16, 8) : ratio(8, 16);
  s.opponent.active[0].shownTypes = names;
  s.request.legalMoves = [s.request.legalMoves[0]];
  s.request.legalMoves[0].metadata.publicTypeMultiplier = expected;
  const policy = E.trainerAi.createTrainerAiPolicy(c), draws = [];
  const result = policy.decide(s, n => { draws.push(n); return 0; });
  assert.equal(result.kind, 'choose'); assert.equal(result.candidateId, 'M1'); assert.equal(draws.length, 1);
  const forged = clone(s); forged.request.legalMoves[0].metadata.publicTypeMultiplier = ratio(3);
  assert.equal(policy.decide(forged, () => assert.fail('invalid snapshot drew RNG')).reason, 'invalid-snapshot');
});

test('R2 public policy preserves old equivalent ratios and avoids products of eighteen non-reduced cells', () => {
  const c = catalog(), s = snapshot();
  const names = E.dex.createDexLookup().allTypes().map(t => t.name.toLowerCase());
  c.types = Object.fromEntries(names.map(a => [a, Object.fromEntries(names.map(d => [d, ratio(16, 16)]))]));
  s.opponent.active[0].shownTypes = names; s.request.legalMoves = [s.request.legalMoves[0]];
  s.request.legalMoves[0].metadata.publicTypeMultiplier = ratio(6, 6);
  const result = E.trainerAi.createTrainerAiPolicy(c).decide(s, () => 0);
  assert.equal(result.kind, 'choose'); assert.equal(result.candidateId, 'M1');
});

test('R2 existing injected-catalog entry estimate keeps its successful public forced-switch choice', () => {
  const c = catalog(), s = snapshot(), names = Object.keys(c.types).slice(0, 7);
  for (const name of names) c.types.rock[name] = ratio(1, 2);
  s.profile.skillLevel = 32; s.field.publicConditions = ['p2:stealthrock'];
  s.own.party[0].hp = 0; s.own.party[0].moves = [];
  const reserve = s.own.party[1];
  Object.assign(reserve, { hp: 2, maxhp: 1024, types: names, moves: [] });
  s.own.party.push({ ...clone(reserve), memberId: 'npc3', partyOrder: 2, hp: 3, types: names.slice(0, 6) });
  s.request = { kind: 'force-switch', legalSwitches: [{ candidateId: 'A', memberId: 'npc2' }, { candidateId: 'B', memberId: 'npc3' }] };
  const result = E.trainerAi.createTrainerAiPolicy(c).decide(s, () => assert.fail('forced switch drew RNG'));
  assert.equal(result.kind, 'choose'); assert.equal(result.candidateId, 'A'); assert.deepEqual(result.retryOrder, ['A', 'B']);
});
