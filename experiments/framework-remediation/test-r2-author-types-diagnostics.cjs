'use strict';
// Feasibility only. The local species view below is a TEST adapter, not a shipped author-types capability.
// Inputs pass the real author compiler/assembly; outcomes come from the pinned simulator, never invented snapshots.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { E, T, D, inputs, fixture, clone } = require('../step5/4/trainer-ai-integration/fixtures.cjs');
const ROOT = path.resolve(__dirname, '../..');
const sim = require(path.join(ROOT, 'js/engine/showdown/dist/sim'));
const PIN = '7244fe8e28fa8bc4d0809ae30d183c608b62bb2b';
const FOUR = ['Water', 'Dark', 'Fairy', 'Steel'];

function assembled(raw) {
  const result = E.contentCompile.compileContent(raw);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const found = E.contentRuntime.assembleContent(result.data, E.dex.createDexLookup());
  assert.deepEqual(found.errors, []);
  return { content: found.content, compiled: result.data };
}
function authored(types, npcTypes = ['Normal', 'Flying']) {
  const raw = inputs({ party: 1, moves: ['splash', 'forestscurse', 'soak', 'reflecttype'] });
  raw.species.find(s => s.id === 'snorlax').types = [...types];
  raw.species.find(s => s.id === 'pidgey').types = [...npcTypes];
  return raw;
}
function staticViews(content, member, game) {
  const catalog = E.pokedexQuery.createDexQueryCatalog(content, {});
  const info = E.pokedexQuery.dexInfo({ ...game.dex, owned: [member.species] }, catalog, member.species, { value: 1, region: -1 });
  return { content: [...E.speciesKey.speciesDataOf(content, member).types], pokedex: info.types,
    summary: E.app.individualView(member, game, content, E.dex.createDexLookup()).types };
}
function report(t, name, value) { t.diagnostic(JSON.stringify({ probe: name, ...value })); }

test('R2 current formal JSON/overlay accepts three, four and all eighteen unique registered static types without truncation', t => {
  const directory = E.dex.createDexLookup().allTypes().map(x => x.name);
  assert.equal(directory.length, 18);
  for (const types of [FOUR.slice(0, 3), FOUR, directory]) {
    const raw = authored(['Normal']);
    raw.overlays.push({ target: 'species/snorlax', set: { types }, reason: 'synthetic R2 contract probe' });
    const { content } = assembled(raw);
    assert.deepEqual(content.species.Snorlax.types, types);
  }
  report(t, 'accepted-static-domain', { lengths: [3, 4, 18], policy: 'existing author acceptance; no battle-support claim' });
});

test('R2 approved JSON empty and repeated known types remain accepted and normalize; PBS four-type proposal reaches assembly', t => {
  for (const [types, expected] of [[[], ['Normal']], [['Dark', 'dark', 'Water', 'Dark'], ['Dark', 'Water']]]) {
    const { content } = assembled(authored(types));
    assert.deepEqual(content.species.Snorlax.types, expected);
    report(t, 'current-json-domain', { input: types, assembled: content.species.Snorlax.types });
  }
  const imported = E.pbsImport.importPbsSpecies('[SNORLAX]\nGrowthRate = Medium\nBaseExp = 100\nEVs = HP,1\nCatchRate = 45\nMoves = 1,SPLASH\nTypes = WATER,DARK,FAIRY,STEEL', 'author-placeholder');
  assert.equal(imported.ok, true, JSON.stringify(imported.errors));
  const raw = authored(['Normal']);
  raw.species[raw.species.findIndex(s => s.id === 'snorlax')] = imported.species[0];
  assert.deepEqual(assembled(raw).content.species.Snorlax.types, FOUR);
});

test('R2 formal form inheritance precedes overlays and approved empty form types normalize to Normal', () => {
  const raw = authored(FOUR);
  raw.species.push({ id: 'snorlax', form: 1, showdownId: 'snorlaxgmax', nameKey: 'species.snorlax_probe', source: 'author-placeholder' });
  raw.overlays.push({ target: 'species/snorlax', set: { types: ['Dark'] }, reason: 'base changes after inheritance' });
  const inherited = assembled(raw).content;
  assert.deepEqual(inherited.species.Snorlax.types, ['Dark']);
  assert.deepEqual(inherited.species['Snorlax-Gmax'].types, FOUR);
  raw.species.at(-1).types = [];
  assert.deepEqual(assembled(raw).content.species['Snorlax-Gmax'].types, ['Normal']);
});

test('R2 current official App/Session observes the static/summary/engine/AI surfaces without blessing a permanent split', async t => {
  for (const types of [FOUR.slice(0, 3), FOUR, E.dex.createDexLookup().allTypes().map(x => x.name)]) {
    const raw = authored(types, types);
    raw.species.find(s => s.id === 'snorlax').evolutions = [{ target: 'pidgey', method: 'LevelDarkInParty', parameter: 1 }];
    const { content } = assembled(raw);
    const w = await fixture({ content });
    const game = w.state.current(), member = game.party[0];
    const views = staticViews(content, member, game);
    assert.deepEqual(views.content, types);
    assert.deepEqual(views.pokedex, types);
    assert.equal(E.evolution.scanEvolution({ member, content, trigger: { family: 'level' }, party: [member] }).kind, 'target');
    const snapshot = D.captureTrainerAiRequest(w.session, w.session.gw).snapshot;
    const battle = w.session.gw._debugBattle();
    report(t, 'current-official-path', { staticCount: types.length, ...views,
      playerEngine: battle.sides[0].active[0].getTypes(), npcEngine: battle.sides[1].active[0].getTypes(),
      aiPublicPlayer: snapshot.opponent.active[0].shownTypes, aiOwnNpc: snapshot.own.party.find(m => m.active).types,
      staticSummaryAgree: JSON.stringify(views.content) === JSON.stringify(views.summary),
      staticEngineAgree: JSON.stringify(views.content) === JSON.stringify(battle.sides[0].active[0].getTypes()) });
    const original = clone(content.species.Snorlax.types);
    views.pokedex.push('mutated'); views.summary.push('mutated');
    assert.deepEqual(content.species.Snorlax.types, original);
    w.app.abortBattle(w.request, Error('R2 owned diagnostic cleanup'));
  }
});

/** Battle-local clone preserves Species identity/prototype for the real native state codec.
 * This explicit experimental ingress proves engine capability, not current gateway/Session support.
 * No shared Dex mutation, upstream patch, Pokemon.types assignment or global format registration occurs. */
function installProbeSpeciesView(battle, content) {
  const native = battle.dex, cache = new Map();
  const table = new Map(Object.entries(content.species).map(([name, record]) => [sim.toID(name), record.types]));
  const wrap = species => {
    const types = table.get(species.id);
    if (types === undefined) return species;
    if (!cache.has(species.id)) cache.set(species.id, Object.assign(Object.create(Object.getPrototypeOf(species)), species, { types: [...types] }));
    return cache.get(species.id);
  };
  const species = Object.create(native.species);
  Object.defineProperties(species, { get: { value: name => wrap(native.species.get(name)) }, getByID: { value: id => wrap(native.species.getByID(id)) } });
  const dex = Object.create(native);
  Object.defineProperty(dex, 'species', { value: species });
  battle.dex = dex;
}
function set(name, species, moves, extra = {}) {
  return { name, species, moves, level: 50, ability: 'Illuminate', nature: 'Hardy', gender: 'M', ...extra };
}
function probe(content, player = set('P1', 'Snorlax', ['splash']), foe = set('F1', 'Pidgey', ['splash']), localView = true) {
  assert.equal(E.dex.createDexLookup().sha(), PIN);
  const battle = new sim.Battle({ formatid: 'gen8rpgcustomgame', seed: [1, 2, 3, 4], strictChoices: true });
  if (localView) installProbeSpeciesView(battle, content);
  battle.setPlayer('p1', { name: 'Player', team: sim.Teams.pack([player, set('P2', 'Blastoise', ['splash'])]) });
  battle.setPlayer('p2', { name: 'Trainer', team: sim.Teams.pack([foe]) });
  battle.choose('p1', 'team 12'); battle.choose('p2', 'team 1');
  return battle;
}
function turn(b, a = 'move 1', z = 'move 1') { b.choose('p1', a); b.choose('p2', z); }
const active = (b, i = 0) => b.sides[i].active[0];

for (const count of [3, 4, 18]) test(`R2 capability probe actual fixed engine carries ${count} unique static types through switch and real temporary moves`, t => {
  const types = count === 18 ? E.dex.createDexLookup().allTypes().map(x => x.name) : ['Water', 'Dark', 'Fairy', 'Steel'].slice(0, count);
  const { content } = assembled(authored(types));
  const b = probe(content, set('P1', 'Snorlax', ['splash']), set('F1', 'Pidgey', ['forestscurse', 'trickortreat', 'soak', 'splash']));
  assert.deepEqual(active(b).getTypes(), types);
  const sharedBefore = [...sim.Dex.forGen(8).species.get('Snorlax').types];
  turn(b); const afterAdd = [...active(b).getTypes()];
  assert.deepEqual(active(b).getTypes(true), types);
  // A move cannot add a type the target already has; the eighteen-type case exercises that real refusal.
  assert.equal(active(b).addedType, types.includes('Grass') ? '' : 'Grass');
  turn(b, 'move 1', 'move 2');
  assert.equal(active(b).addedType, types.includes('Ghost') ? '' : 'Ghost');
  assert.deepEqual(active(b).getTypes(true), types);
  turn(b, 'move 1', 'move 3'); assert.deepEqual(active(b).getTypes(), ['Water']);
  turn(b, 'switch 2', 'move 4'); turn(b, 'switch 2', 'move 4');
  assert.deepEqual(active(b).getTypes(), types);
  assert.deepEqual(active(b).baseSpecies.types, types);
  assert.deepEqual(sim.Dex.forGen(8).species.get('Snorlax').types, sharedBefore);
  report(t, 'engine-local-view', { staticCount: count, afterAdd, afterSoak: ['Water'], afterSwitch: active(b).getTypes(), sharedDex: sharedBefore });
});

test('R2 capability probe real Transform copies more than two target types and switching restores the source types', t => {
  const source = ['Water', 'Fairy', 'Steel'], target = ['Normal', 'Flying', 'Dark', 'Electric'];
  const { content } = assembled(authored(source, target));
  const b = probe(content, set('P1', 'Snorlax', ['transform']), set('F1', 'Pidgey', ['splash']));
  turn(b); assert.equal(active(b).transformed, true); assert.deepEqual(active(b).getTypes(), target);
  const checkpoint = JSON.stringify(b.toJSON()), restored = sim.Battle.fromJSON(checkpoint);
  assert.equal(active(restored).transformed, true); assert.deepEqual(active(restored).getTypes(), target);
  turn(b, 'switch 2'); turn(b, 'switch 2'); assert.deepEqual(active(b).getTypes(), source);
  // Native restoration is measured separately: the experimental view is not serialized by native State.
  turn(restored, 'switch 2'); turn(restored, 'switch 2');
  report(t, 'native-checkpoint-binding', { currentTransformPreserved: true, originalSource: source,
    sourceAfterRestoredSwitch: active(restored).getTypes(), restoredSpeciesReference: active(restored).baseSpecies.types,
    limitation: 'native fromJSON does not reinstall the test-local species view; product restoration needs an owned binding' });
});

test('R2 capability probe Forecast real forme changes use the corresponding local author form and return to author base', t => {
  const raw = authored(FOUR), base = ['Water', 'Dark', 'Fairy'], sun = ['Fire', 'Steel', 'Electric', 'Dragon'];
  raw.species.push({ id: 'weatherprobe', showdownId: 'castform', nameKey: 'species.weather_probe', source: 'author-placeholder', growth: 'medium', baseExp: 100, evYield: {}, catchRate: 45, learnset: [{ level: 1, move: 'sunnyday' }, { level: 1, move: 'splash' }], types: base });
  raw.species.push({ id: 'weatherprobe', form: 1, showdownId: 'castformsunny', nameKey: 'species.weather_probe_sun', source: 'author-placeholder', types: sun });
  const { content } = assembled(raw), b = probe(content, set('P1', 'Castform', ['sunnyday', 'splash'], { ability: 'Forecast' }));
  turn(b); assert.equal(active(b).species.id, 'castformsunny'); assert.deepEqual(active(b).getTypes(), sun);
  for (let i = 0; i < 5; i++) turn(b, 'move 2');
  assert.equal(active(b).species.id, 'castform'); assert.deepEqual(active(b).getTypes(), base);
  report(t, 'native-forecast', { base, sun, returned: active(b).getTypes() });
});

test('R2 capability probe real engine type chart observes every supplied type, including immunities beyond the first two', t => {
  const { content } = assembled(authored(['Water', 'Steel', 'Ghost', 'Dark']));
  const b = probe(content, set('P1', 'Snorlax', ['tackle']), set('F1', 'Pidgey', ['tackle']));
  const hp = active(b).hp;
  turn(b); assert.equal(active(b).hp, hp); assert(b.log.some(line => line.includes('|-immune|p1a:')));
  report(t, 'native-immunity', { allTypes: active(b).getTypes(), healthUnchanged: true });
});

test('R2 capability probe fourth static type gives real STAB damage with otherwise equal seeded teams', t => {
  const damages = [];
  for (const types of [FOUR.slice(0, 3), FOUR]) {
    const { content } = assembled(authored(types));
    const b = probe(content, set('P1', 'Snorlax', ['flashcannon']));
    const before = active(b, 1).hp;
    turn(b); damages.push(before - active(b, 1).hp);
    assert(b.log.some(line => line.includes('|move|p1a: P1|Flash Cannon|')));
  }
  assert(damages[0] > 0); assert(damages[1] > damages[0]);
  report(t, 'native-fourth-type-stab', { withoutFourth: damages[0], withFourth: damages[1] });
});

test('R2 capability probe measures actual current AI response to a real engine four-type forme, without claiming integration support', async t => {
  const { content } = assembled(authored(FOUR, FOUR)), w = await fixture({ content });
  const b = w.gw._debugBattle(); installProbeSpeciesView(b, content);
  // Invoke native formeChange, not a direct Pokemon.types assignment. This is an explicit adapter capability probe.
  active(b, 0).formeChange('Snorlax'); active(b, 1).formeChange('Pidgey'); w.gw._pump();
  const captured = D.captureTrainerAiRequest(w.session, w.gw).snapshot;
  assert.deepEqual(captured.own.party.find(m => m.active).types, FOUR);
  let policy = 'accepted', error = null;
  try { D.inspectTrainerAiRequest(w.session, w.gw); } catch (caught) { policy = 'rejected'; error = caught.message; }
  report(t, 'current-ai-wide-types', { engineTypes: active(b, 1).getTypes(), policy, error,
    playerEngineTypes: active(b).getTypes(), aiPublicPlayer: captured.opponent.active[0].shownTypes,
    limitation: 'test-local ingress; not proof current author Session forwards types' });
  w.app.abortBattle(w.request, Error('R2 owned AI diagnostic cleanup'));
});

test('R2 capability probe observes the approved normalized empty/duplicate inputs in the actual engine', t => {
  for (const [types, normalized] of [[[], ['Normal']], [['Dark', 'Dark', 'Dark', 'Water'], ['Dark', 'Water']]]) {
    const { content } = assembled(authored(types));
    const b = probe(content);
    const actual = [...active(b).getTypes()];
    const effectiveness = active(b).runEffectiveness(b.dex.moves.get('brickbreak'));
    assert.deepEqual(content.species.Snorlax.types, normalized);
    report(t, 'native-nonunique-domain', { authorTypes: types, nativeTypes: actual, fightingTypeMod: effectiveness,
      note: 'approved empty -> Normal and duplicate identity normalization; raw pre-normalization measurements remain in the investigation evidence' });
  }
});

test('R2 capability probe default no-override seeded battle matches the unwrapped fixed engine', t => {
  const { content } = assembled(inputs());
  const p = set('P1', 'Snorlax', ['splash']), z = set('F1', 'Pidgey', ['tackle']);
  const wrapped = probe(content, clone(p), clone(z)), native = probe(content, clone(p), clone(z), false);
  for (let i = 0; i < 3; i++) { turn(wrapped); turn(native); }
  const { State } = require(path.join(ROOT, 'js/engine/showdown/dist/sim/state'));
  assert.deepEqual(State.normalize(wrapped.toJSON()), State.normalize(native.toJSON()));
  report(t, 'default-compatibility-probe', { turns: wrapped.turn, identicalNormalizedEngineState: true,
    scope: 'test-local species view with no static differences; not a product implementation acceptance' });
});

test('R2 current official Session restores real temporary-type public projection with its checkpoint', async t => {
  t.mock.method(Date, 'now', () => 1794528000000);
  const raw = authored(FOUR);
  raw.trainers[0].aiStrategy = { id: 'r2-checkpoint', version: '1', parameters: {} };
  const registry = E.composition.createTrainerAiStrategyRegistry();
  registry.register({ id: 'r2-checkpoint', version: '1', implementationIdentity: 'test/r2/checkpoint/1', validateParameters() {},
    create() { return { decide(snapshot) {
      const slot = snapshot.binding.turn === 1 ? 2 : 3;
      const candidate = snapshot.request.legalMoves.find(move => move.slot === slot);
      return { kind: 'choose', binding: snapshot.binding, candidateId: candidate.candidateId, retryOrder: [candidate.candidateId], diagnostics: [] };
    } }; } });
  const { content } = assembled(raw), w = await fixture({ content, registry });
  assert.equal((await w.session.chooseMove(1)).ok, true);
  const before = clone(D.captureTrainerAiRequest(w.session, w.gw).snapshot), cp = w.session._checkpoint();
  const temporary = [...active(w.gw._debugBattle()).getTypes()];
  assert.deepEqual(before.opponent.active[0].shownTypes, temporary);
  assert.equal((await w.session.chooseMove(1)).ok, true);
  const next = clone(D.captureTrainerAiRequest(w.session, w.session.gw).snapshot);
  await w.session._restoreCheckpoint(cp);
  assert.deepEqual(D.captureTrainerAiRequest(w.session, w.session.gw).snapshot, before);
  assert.deepEqual(active(w.session.gw._debugBattle()).getTypes(), temporary);
  assert.equal((await w.session.chooseMove(1)).ok, true);
  assert.deepEqual(D.captureTrainerAiRequest(w.session, w.session.gw).snapshot, next);
  assert.deepEqual(content.species.Snorlax.types, FOUR);
  assert.equal(w.state.replaced.length, 0);
  report(t, 'current-session-checkpoint', { staticTypes: FOUR, temporaryBefore: temporary,
    publicRestoredExactly: true, nextPublicSnapshotReproduced: true,
    authoredBaseObserved: FOUR.every(type => temporary.includes(type)) });
  w.app.abortBattle(w.request, Error('R2 owned checkpoint diagnostic cleanup'));
});

test('R2 future-type acceptance probe records Stellar separately from the formal Gen8 registered domain', t => {
  const dex = E.dex.createDexLookup(), { content } = assembled(authored(['Stellar']));
  assert.deepEqual(dex.type('Stellar'), { name: 'Stellar' });
  assert.equal(dex.allTypes().some(type => type.name === 'Stellar'), false);
  const b = probe(content, set('P1', 'Snorlax', ['splash']), set('F1', 'Pidgey', ['tackle']));
  const before = active(b).hp; turn(b);
  report(t, 'future-type-boundary', { authorAdapterAccepted: content.species.Snorlax.types,
    ordinaryGen8DirectoryContainsStellar: false, localExperimentalEngineTypes: active(b).getTypes(),
    actualNormalDamage: before - active(b).hp, productSupportClaim: false,
    scope: 'incidental future-type author acceptance; no Gen9 mechanics or AI support acceptance' });
});
