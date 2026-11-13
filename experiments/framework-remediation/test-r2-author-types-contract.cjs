'use strict';
// Approved R2 contract: official author inputs -> production App/Session -> actual pinned Gen8.
const test = require('node:test'), assert = require('node:assert/strict');
const { E, T, D, inputs, clone } = require('../step5/4/trainer-ai-integration/fixtures.cjs');
const FOUR = ['Water', 'Dark', 'Fairy', 'Steel'];
const allTypes = () => E.dex.createDexLookup().allTypes().map(t => t.name);
function compile(raw) {
  const r = E.contentCompile.compileContent(raw); assert.equal(r.ok, true, JSON.stringify(r.errors)); return r.data;
}
function assemble(raw) {
  const data = compile(raw), r = E.contentRuntime.assembleContent(data, E.dex.createDexLookup());
  assert.deepEqual(r.errors, []); return { content: r.content, data, warnings: r.warnings };
}
function species(raw, id, types, moves = ['splash'], showdownId = id) {
  let entry = raw.species.find(s => s.id === id && !(s.form ?? 0));
  if (!entry) { entry = { id, showdownId, nameKey: 'species.' + id, source: 'author-placeholder', growth: 'medium', baseExp: 100, evYield: {}, catchRate: 45 }; raw.species.push(entry); }
  if (types !== undefined) entry.types = [...types];
  entry.learnset = moves.map(move => ({ level: 1, move })); return entry;
}
async function open({ types = FOUR, npcTypes = FOUR, omitTypes = false, player = 'snorlax', playerMoves = ['splash'], npcMoves = ['splash'], npcTurns = [1], forms = [], mutate, content: supplied } = {}) {
  const raw = inputs({ party: 1, moves: npcMoves });
  species(raw, player, omitTypes ? undefined : types, playerMoves);
  species(raw, 'pidgey', omitTypes ? undefined : npcTypes, npcMoves);
  raw.species.push(...forms);
  raw.trainers[0].aiStrategy = { id: 'r2-contract', version: '1', parameters: {} };
  mutate?.(raw);
  const { content } = supplied ? { content: supplied } : assemble(raw);
  const registry = E.composition.createTrainerAiStrategyRegistry();
  registry.register({ id: 'r2-contract', version: '1', implementationIdentity: 'test/r2/contract/1', validateParameters() {}, create() { return { decide(s) {
    const slot = npcTurns[s.binding.turn - 1] ?? npcTurns.at(-1), c = s.request.legalMoves.find(m => m.slot === slot);
    return { kind: 'choose', binding: s.binding, candidateId: c.candidateId, retryOrder: [c.candidateId], diagnostics: [] };
  } }; } });
  const battleName = content.speciesIds[player], dex = E.dex.createDexLookup();
  const members = [E.memberFactory.createMember({ id: 'P1', species: battleName, level: 50 }, content, () => 0), E.memberFactory.createMember({ id: 'P2', species: 'Blastoise', level: 50 }, content, () => 0)];
  const game = E.state.newGame({ content, party: members.map(m => E.speciesKey.toPersistentMember(m, content)), money: 1000 }); game.nextMemberOrdinal = '3';
  const state = T.fakes.createMemoryState(game), app = new E.app.GameApplication({ state, projection: T.fakes.createRecordingProjection(),
    sessions: E.composition.createBattleSessionFactory({ content: () => content, seed: () => [1, 2, 3, 4], trainerAiStrategies: registry }),
    content: () => ({ content, dex }), random: () => 0, clock: () => 12345 });
  const request = { battleId: 'R2-contract', trainer: { id: 'c-basic', version: 1 }, seq: 1, canLose: true };
  const session = await app.startTrainerBattle(request);
  return { content, state, app, session, request, cleanup() { app.abortBattle(request, Error('R2 owned contract cleanup')); } };
}
const actor = (w, side = 0) => w.session.gw._debugBattle().sides[side].active[0];
const capture = w => D.captureTrainerAiRequest(w.session, w.session.gw).snapshot;
async function step(w, slot = 1) { const r = await w.session.chooseMove(slot); assert.equal(r.ok, true, JSON.stringify(r)); }
function check(w, types) {
  assert.deepEqual(actor(w).getTypes(), types);
  assert.deepEqual(capture(w).opponent.active[0].shownTypes, types);
  assert.equal(w.session.broken, null); assert.equal(w.state.replaced.length, 0);
}

test('R2 approved content4 normalizes empty to Normal and canonical duplicate identities without editing author input; old caches need rebuild', () => {
  for (const [input, expected] of [[[], ['Normal']], [['dark', 'DARK', 'Water', 'dark'], ['Dark', 'Water']]]) {
    const raw = inputs(), entry = species(raw, 'snorlax', input), before = clone(raw), { data, content } = assemble(raw);
    assert.equal(data.schema, 4); assert.deepEqual(raw, before); assert.deepEqual(entry.types, input);
    assert.deepEqual(content.species.Snorlax.types, expected);
    assert.deepEqual(data.species.find(s => s.id === 'snorlax').types.map(x => x.toLowerCase()), expected.map(x => x.toLowerCase()));
    assert.throws(() => E.contentRuntime.loadCompiled({ ...data, schema: 3 }), /needs-rebuild/);
  }
});

test('R2 approved normalization applies after form inheritance/overlay; no static list truncation', () => {
  const raw = inputs(); species(raw, 'snorlax', allTypes());
  raw.species.push({ id: 'snorlax', form: 1, showdownId: 'snorlaxgmax', nameKey: 'species.snorlax_probe', source: 'author-placeholder', types: [] });
  raw.overlays.push({ target: 'species/snorlax', set: { types: ['Dark', 'dark', 'Water'] }, reason: 'R2 approved identity dedup' });
  const { content } = assemble(raw);
  assert.deepEqual(content.species.Snorlax.types, ['Dark', 'Water']);
  assert.deepEqual(content.species['Snorlax-Gmax'].types, ['Normal']);
  delete raw.species.at(-1).types;
  assert.deepEqual(assemble(raw).content.species['Snorlax-Gmax'].types, allTypes());
});

for (const count of [3, 4, 18]) test(`R2 official author ${count} types agree across dex summary evolution engine public AI and own AI`, async t => {
  const types = count === 18 ? allTypes() : FOUR.slice(0, count), w = await open({ types, npcTypes: types,
    mutate(raw) { raw.species.find(s => s.id === 'snorlax').evolutions = [{ target: 'pidgey', method: 'LevelDarkInParty', parameter: 1 }]; } });
  t.after(() => w.cleanup());
  const game = w.state.current(), member = game.party[0], catalog = E.pokedexQuery.createDexQueryCatalog(w.content, {});
  const info = E.pokedexQuery.dexInfo({ ...game.dex, owned: ['snorlax'] }, catalog, 'snorlax', { value: 1, region: -1 });
  assert.deepEqual(info.types, types); assert.deepEqual(w.app.describeIndividual(member.id).types, types);
  assert.equal(E.evolution.scanEvolution({ member, content: w.content, trigger: { family: 'level' }, party: [member] }).kind, 'target');
  check(w, types); assert.deepEqual(actor(w, 1).getTypes(), types); assert.deepEqual(capture(w).own.party.find(m => m.active).types, types);
  assert.notEqual(D.inspectTrainerAiRequest(w.session, w.session.gw).plan.kind, 'error');
  const saved = clone(w.content.species.Snorlax.types); info.types.push('changed');
  assert.deepEqual(w.content.species.Snorlax.types, saved);
  const p = actor(w), before = capture(w); t.mock.method(p, 'getTypes', () => { throw Error('opponent private type read'); });
  assert.deepEqual(capture(w), before);
});

test('R2 author four types plus real added type, replacement type, switch and Session rollback preserve owned state', async t => {
  t.mock.method(Date, 'now', () => 1794528000000);
  const w = await open({ npcMoves: ['forestscurse', 'trickortreat', 'soak', 'splash'], npcTurns: [1, 2, 3, 4] }); t.after(() => w.cleanup());
  await step(w); check(w, [...FOUR, 'Grass']);
  const cp = w.session._checkpoint(), before = capture(w);
  await step(w); check(w, [...FOUR, 'Ghost']);
  await w.session._restoreCheckpoint(cp); check(w, [...FOUR, 'Grass']); assert.deepEqual(capture(w), before);
  await step(w); check(w, [...FOUR, 'Ghost']);
  await step(w); check(w, ['Water']);
  assert.equal((await w.session.chooseSwitch('P2')).ok, true); assert.equal((await w.session.chooseSwitch('P1')).ok, true); check(w, FOUR);
  assert.deepEqual(w.content.species.Snorlax.types, FOUR);
  assert.deepEqual(w.app.describeIndividual('P1').types, FOUR);
});

test('R2 real Transform copies author base plus added type; checkpoint keeps temporary copy and subsequent switch restores original author type', async t => {
  t.mock.method(Date, 'now', () => 1794528000000);
  const original = ['Water', 'Dark', 'Fairy'], target = ['Normal', 'Flying', 'Steel', 'Electric'];
  const w = await open({ types: original, npcTypes: target, playerMoves: ['forestscurse', 'transform'] }); t.after(() => w.cleanup());
  await step(w); await step(w, 2); check(w, [...target, 'Grass']); assert.equal(actor(w).transformed, true);
  const cp = w.session._checkpoint(), before = capture(w);
  assert.equal((await w.session.chooseSwitch('P2')).ok, true);
  await w.session._restoreCheckpoint(cp); check(w, [...target, 'Grass']); assert.deepEqual(capture(w), before);
  assert.equal((await w.session.chooseSwitch('P2')).ok, true); assert.equal((await w.session.chooseSwitch('P1')).ok, true); check(w, original);
  assert.deepEqual(actor(w).baseSpecies.types, original); assert.deepEqual(w.app.describeIndividual('P1').types, original);
});

test('R2 real Forecast author form transitions and natural expiry survive exact Session checkpoint', async t => {
  t.mock.method(Date, 'now', () => 1794528000000);
  const base = ['Water', 'Dark', 'Fairy'], sun = ['Fire', 'Steel', 'Electric', 'Dragon'];
  const w = await open({ player: 'castform', types: base, playerMoves: ['sunnyday', 'splash'],
    forms: [{ id: 'castform', form: 1, showdownId: 'castformsunny', nameKey: 'species.castform_sun_probe', source: 'author-placeholder', types: sun }] }); t.after(() => w.cleanup());
  await step(w); check(w, sun); const cp = w.session._checkpoint(), before = capture(w);
  await step(w, 2); await w.session._restoreCheckpoint(cp); check(w, sun); assert.deepEqual(capture(w), before);
  for (let i = 0; i < 5; i++) await step(w, 2); check(w, base);
});

test('R2 two concurrent official contents do not share species overrides or restored references', async t => {
  const a = await open({ types: FOUR }), b = await open({ types: ['Dragon', 'Ghost', 'Steel'] }); t.after(() => { a.cleanup(); b.cleanup(); });
  check(a, FOUR); check(b, ['Dragon', 'Ghost', 'Steel']);
  const cp = a.session._checkpoint(); await step(a); await a.session._restoreCheckpoint(cp);
  check(a, FOUR); check(b, ['Dragon', 'Ghost', 'Steel']);
  assert.deepEqual(E.dex.createDexLookup().species('Snorlax').types, ['Normal']);
});

test('R2 normalized empty and duplicate inputs reach the official Session; omitted types keep the native defaults', async t => {
  for (const [input, expected] of [[[], ['Normal']], [['Water', 'water', 'Dark'], ['Water', 'Dark']]]) {
    const w = await open({ types: input, npcTypes: input }); t.after(() => w.cleanup());
    check(w, expected); assert.deepEqual(actor(w, 1).getTypes(), expected); assert.deepEqual(w.app.describeIndividual('P1').types, expected); await step(w);
  }
  const w = await open({ omitTypes: true }); t.after(() => w.cleanup());
  check(w, ['Normal']); assert.deepEqual(actor(w, 1).getTypes(), ['Normal', 'Flying']);
  assert.equal(Object.hasOwn(w.session.gw._debugBattle(), 'rpgSpeciesTypes'), false);
});

test('R2 raw gateway snapshot restoration rebinds static species without serializing a new persistent Member field', async t => {
  const w = await open(); t.after(() => w.cleanup());
  const before = clone(w.state.current()), raw = w.session.gw.snapshot(), restored = await E.gateway.BattleGateway.restore(raw);
  t.after(() => restored._debugBattle().destroy());
  const b = restored._debugBattle(); assert.deepEqual(b.sides[0].active[0].getTypes(), FOUR);
  await restored.choose('p1', 'switch 2'); await restored.choose('p2', 'move 1');
  await restored.choose('p1', 'switch 2'); await restored.choose('p2', 'move 1');
  assert.deepEqual(b.sides[0].active[0].getTypes(), FOUR);
  assert.deepEqual(b.sides[0].active[0].baseSpecies.types, FOUR);
  assert.deepEqual(w.state.current(), before); assert.equal('types' in before.party[0], false);
});

test('R2 real Illusion uses authored public appearance types, retains an addition on reveal and survives checkpoint without private reads', async t => {
  const actual = ['Dark', 'Water', 'Fairy'], w = await open({ player: 'zoroark', types: actual,
    npcMoves: ['forestscurse', 'tackle', 'splash'], npcTurns: [1, 2, 3],
    mutate(raw) { raw.species.find(s => s.id === 'blastoise').types = FOUR; } }); t.after(() => w.cleanup());
  assert.deepEqual(actor(w).getTypes(), actual); assert.deepEqual(capture(w).opponent.active[0].shownTypes, FOUR);
  await step(w); assert.deepEqual(capture(w).opponent.active[0].shownTypes, [...FOUR, 'Grass']);
  const cp = w.session._checkpoint(), before = capture(w), key = before.opponent.active[0].appearanceKey;
  await step(w); check(w, [...actual, 'Grass']);
  await w.session._restoreCheckpoint(cp); assert.deepEqual(capture(w), before);
  const hidden = actor(w), mock = t.mock.method(hidden, 'getTypes', () => { throw Error('private Illusion type read'); });
  assert.deepEqual(capture(w), before); mock.mock.restore();
  await step(w); check(w, [...actual, 'Grass']); assert.equal(capture(w).opponent.active[0].appearanceKey, key);
});

test('R2 actual official combat grants fourth-type STAB and third-type immunity', async t => {
  const damage = [];
  for (const types of [FOUR.slice(0, 3), FOUR]) {
    const w = await open({ types, npcTypes: ['Normal', 'Flying'], playerMoves: ['flashcannon'] }); t.after(() => w.cleanup());
    const before = actor(w, 1).hp; await step(w); damage.push(before - actor(w, 1).hp);
  }
  assert(damage[0] > 0); assert(damage[1] > damage[0]);
  const w = await open({ types: ['Water', 'Steel', 'Ghost', 'Dark'], npcMoves: ['tackle'] }); t.after(() => w.cleanup());
  const hp = actor(w).hp; await step(w); assert.equal(actor(w).hp, hp);
  const candidate = capture(w).request.legalMoves.find(m => m.moveId === 'tackle');
  assert.deepEqual(candidate.metadata.publicTypeMultiplier, { numerator: 0, denominator: 1 });
});

test('R2 native Dark species authored without Dark no longer satisfies the static party evolution condition', async t => {
  const w = await open({ player: 'zoroark', types: ['Water', 'Fairy'], mutate(raw) {
    raw.species.find(s => s.id === 'zoroark').evolutions = [{ target: 'pidgey', method: 'LevelDarkInParty', parameter: 1 }];
  } }); t.after(() => w.cleanup());
  const member = w.state.current().party[0];
  assert.equal(E.evolution.scanEvolution({ member, content: w.content, party: [member], trigger: { family: 'level' } }).kind, 'no-target');
  assert.deepEqual(w.app.describeIndividual('P1').types, ['Water', 'Fairy']); assert.deepEqual(actor(w).getTypes(), ['Water', 'Fairy']);
});

test('R2 approved future-type boundary keeps accepted Stellar record complete, warns, and retains prior native battle behavior', async t => {
  const raw = inputs(); species(raw, 'snorlax', ['Water', 'Stellar', 'Dark']);
  const { content, warnings } = assemble(raw);
  assert.deepEqual(content.species.Snorlax.types, ['Water', 'Stellar', 'Dark']);
  assert(warnings.some(w => w.path === 'species/snorlax.types[1]' && w.message.startsWith('future-type-battle-unification-open:')));
  const w = await open({ content }); t.after(() => w.cleanup());
  assert.deepEqual(actor(w).getTypes(), ['Normal']);
  assert.deepEqual(w.app.describeIndividual('P1').types, ['Water', 'Stellar', 'Dark']);
  assert.equal(Object.hasOwn(w.session.gw._debugBattle().rpgSpeciesTypes ?? {}, 'snorlax'), false);
});

test('R2 Mimicry temporary type ends at the authored base after checkpoint rather than at the native species type', async t => {
  const w = await open({ player: 'stunfiskgalar', types: FOUR, playerMoves: ['electricterrain', 'splash'] }); t.after(() => w.cleanup());
  await step(w); check(w, ['Electric']);
  const cp = w.session._checkpoint(); await step(w, 2); await w.session._restoreCheckpoint(cp); check(w, ['Electric']);
  for (let i = 0; i < 5; i++) await step(w, 2); check(w, FOUR);
  assert.deepEqual(actor(w).baseSpecies.types, FOUR);
});

test('R2 default production trainer policy accepts an actual eighteen-type own/public snapshot and continues the normal Session turn', async t => {
  const raw = inputs({ party: 1, moves: ['tackle', 'splash'] });
  species(raw, 'snorlax', allTypes()); species(raw, 'pidgey', allTypes(), ['tackle', 'splash']);
  const { content } = assemble(raw), w = await open({ content }); t.after(() => w.cleanup());
  const inspected = D.inspectTrainerAiRequest(w.session, w.session.gw);
  assert.equal(inspected.plan.kind, 'choose'); check(w, allTypes());
  assert.deepEqual(inspected.snapshot.own.party.find(m => m.active).types, allTypes());
  await step(w); check(w, allTypes());
});
