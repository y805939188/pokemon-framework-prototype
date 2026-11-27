'use strict';
// Real App + trigger/selection/allowance + real supported generator. Host facts are synthetic and explicit.
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const E = require(process.env.PF55_B_ENGINE || '../../../js/engine/build/production.cjs');
const F = require('../../../tests/support/saves/legacy-migration/fixtures.cjs');
const copy = value => structuredClone(value), value = v => ({ status: 'value', value: v });
const wait = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(setImmediate);
function fixture(options = {}) {
  const content = F.content(E); content.moves.tackle = content.moves.Tackle;
  for (const [name, species] of Object.entries(content.species)) { species.ruleSpecies = 'Fixture' + name; species.types = ['Normal']; }
  content.settings = { AFFECTION_EFFECTS: false, ...options.settings };
  content.mapMetadata = { source: 'author-fixture', maps: { 7: { environment: 'grass' }, 8: { environment: 'cave' } } };
  content.world = { encounters: { source: 'author-fixture', tables: [{ mapId: 7, version: 0, types: { Land: { stepChance: 100, slots: [{ species: 'B', weight: 100, minLevel: 2, maxLevel: 2 }] } } }] } };
  options.editContent?.(content);
  let app, actualContent = content, game = E.state.newGame({ party: options.party || [F.member('P1', { hp: 20, friendship: 70 })], content, bag: options.bag || {} });
  options.editState?.(game); game = F.freeze(game);
  const calls = [], draws = [], sessions = [], writes = [];
  let hook = null, failReplace = false;
  const state = { read: () => game, current: () => game, replace(next) { if (failReplace) throw Error('install-failed'); writes.push(copy(next)); game = F.freeze(copy(next)); },
    external(change) { const next = copy(game); change(next); game = F.freeze(next); } };
  const here = { hostOwner: {}, generation: 1, player: {}, map: {}, mapId: 7, x: 3, y: 4 };
  const facts = { landAllowed: value(true), encountersDisabled: value(false), debugControl: value(false), groundEnvironment: value('grass'), ...options.facts };
  const handle = { result() { throw Error('synthetic unfinished session'); } };
  const factory = options.factory || { async create(request, state, setup) { calls.push('session-create'); sessions.push({ request: copy(request), state: copy(state), setup: copy(setup) }); return options.create ? await options.create({ request, state, setup, app, handle }) : handle; } };
  app = new E.app.GameApplication({wildGeneration:{switchOn:()=>({status:'value',value:false})}, state, sessions: factory, content() { const replacement = hook?.({ app, state, content }); return { content: replacement || actualContent, ...(options.dex ? { dex: options.dex } : {}) }; },
    projection: { project() {} }, random(n) { draws.push(n); calls.push('random:' + n); return options.random ? options.random(n, draws.length) : 0; }, clock: options.clock || (() => 1000),
    worldHost: { read: () => ({ mapId: value(options.businessMapId ?? here.mapId), hour: value(options.hour ?? 20), cycling: value(false), diving: value(false) }) },
    completedSteps: { current: () => ({ ...here }), async openRepelSelection() { return { status: 'cancelled' }; },
      async present({ effect }) { calls.push(effect.kind); return { status: 'completed', id: effect.id }; },
      dispatchArrival() { calls.push('arrival'); return { status: options.arrival || 'ordinary-opportunity' }; } },
    ...(options.noOrdinary ? {} : { ordinaryEncounters: { read() { calls.push('ordinary-facts'); return copy(facts); } } }),
  });
  return { app, state, content, here, facts, calls, draws, sessions, writes, handle,
    step: (patch = {}) => ({ ...here, id: 'ordinary-1', ice: false, regionId: 0, terrainTag: 0, sceneActive: true, ...patch }),
    hook: callback => { hook = callback; }, contentView: next => { actualContent = next; }, failReplace: () => { failReplace = true; } };
}
const domains = [100, 100, 1, 65536, 65536, 32, 32, 32, 32, 32, 32];
const eventRequest = id => ({ battleId: id, kind: 'wild', foes: [{ species: 'B', level: 2 }], seq: 1 });

test('C-App real ordinary chain generates once after gate; actual admission reserves before parent retirement and session starts without reroll', async () => {
  const w = fixture(); let parent, offer, transition = 0;
  const admit = w.app.admitWorldBattle.bind(w.app), retire = w.app.world.retireToBattle.bind(w.app.world);
  w.app.admitWorldBattle = (p, o) => { parent = p; offer = o; assert.equal(w.app.saveBlocked, true); assert.throws(() => w.app.beginInventoryOperation(), /active/); return admit(p, o); };
  w.app.world.retireToBattle = (p, o) => { transition++; assert.ok(w.app.op, 'battle reservation already exists'); assert.equal(w.app.saveBlocked, true); return retire(p, o); };
  const result = await w.app.completeWorldStep(w.step()); assert.equal(result.status, 'battle-admitted', JSON.stringify(result)); assert.equal(transition, 1);
  assert.deepEqual(w.draws, domains); assert.equal(w.state.current().steps, 1); assert.equal(w.sessions.length, 0); assert.equal(w.app.saveBlocked, true);
  assert.throws(() => admit(parent, offer), /stale/); assert.throws(() => admit({ ...parent }, offer), /stale/);
  await assert.rejects(w.app.startBattle(eventRequest('intruder')), /already open|active/);
  const first = w.app.startAdmittedWorldBattle(result.admission), second = w.app.startAdmittedWorldBattle(result.admission); assert.equal(first, second);
  assert.equal(await first, w.handle); assert.equal(w.sessions.length, 1); assert.deepEqual(w.draws, domains);
  assert.equal(w.sessions[0].setup.foes.length, 1); assert.equal(w.sessions[0].setup.foes[0].species, 'B');
  assert.deepEqual(w.sessions[0].setup.worldCapture, { fishing: false, timeOfDay: 2 });
  assert.equal((await w.app.completeWorldStep(w.step())).reason, 'operation-active');
  w.app.abortAdmittedWorldBattle(result.admission, 'test complete'); assert.equal(w.app.saveBlocked, false);
  const duplicate = await w.app.completeWorldStep(w.step()); assert.equal(duplicate.admission, result.admission); assert.deepEqual(w.draws, domains); assert.equal(w.state.current().steps, 1);
});
test('C-App actual admissions reject structural copies and another App without calling factory', async () => {
  const w = fixture(), result = await w.app.completeWorldStep(w.step()), other = fixture();
  await assert.rejects(w.app.startAdmittedWorldBattle({ ...result.admission }), /stale/);
  await assert.rejects(other.app.startAdmittedWorldBattle(result.admission), /stale/);
  assert.equal(w.app.abortAdmittedWorldBattle({ ...result.admission }, 'forged').status, 'refused');
  assert.equal(w.sessions.length, 0); assert.equal(w.app.saveBlocked, true);
  assert.equal(w.app.abortAdmittedWorldBattle(result.admission, 'real').status, 'aborted'); assert.equal(w.app.abortAdmittedWorldBattle(result.admission, 'repeat').status, 'duplicate');
  await assert.rejects(w.app.startAdmittedWorldBattle(result.admission), /stale/); assert.equal(w.sessions.length, 0);
});
test('C-App cold App and occupied ledger ids allocate deterministically without RNG or reusing historical settlement keys', async () => {
  const first = fixture(), before = await first.app.completeWorldStep(first.step()), originalId = before.admission.battleId;
  const restarted = fixture({ editState: game => {
    for (const id of [originalId, originalId + ':1', originalId + ':2']) game.appliedBattles[id] = { hash: 'a'.repeat(64) };
  } });
  const result = await restarted.app.completeWorldStep(restarted.step()); assert.equal(result.status, 'battle-admitted'); assert.equal(result.admission.battleId, originalId + ':3');
  assert.deepEqual(restarted.draws, domains); assert.deepEqual(first.draws, domains);
  restarted.app.abortAdmittedWorldBattle(result.admission, 'stop'); const duplicate = await restarted.app.completeWorldStep(restarted.step());
  assert.equal(duplicate.admission, result.admission); assert.equal(duplicate.admission.battleId, originalId + ':3'); assert.deepEqual(restarted.draws, domains);
  assert.deepEqual(restarted.state.current().appliedBattles[originalId], { hash: 'a'.repeat(64) });
});
test('C-App event/action arrivals and absent ordinary handler never call C RNG', async () => {
  for (const options of [{ arrival: 'event-dispatched' }, { arrival: 'action-dispatched' }, { noOrdinary: true }]) {
    const w = fixture(options), result = await w.app.completeWorldStep(w.step()); assert.ok(['completed', 'ordinary-unhandled'].includes(result.status)); assert.deepEqual(w.draws, []); assert.equal(w.state.current().steps, 1);
  }
});
for (const scenario of [
  { name: 'disabled', facts: { encountersDisabled: value(true) }, reason: 'disabled', domains: [] },
  { name: 'debug control', facts: { debugControl: value(true) }, reason: 'debug-control', domains: [] },
  { name: 'terrain', facts: { landAllowed: value(false) }, reason: 'no-opportunity', domains: [] },
  { name: 'ice', step: { ice: true }, reason: 'no-opportunity', domains: [] },
  { name: 'no-able', party: [F.member('P1', { hp: 0, friendship: 70 })], reason: 'no-able-member', domains: [] },
  { name: 'no-table', editContent: c => { c.world.encounters.tables = []; }, reason: 'no-opportunity', domains: [] },
  { name: 'zero probability', editContent: c => { c.world.encounters.tables[0].types.Land.stepChance = 0; }, reason: 'no-chance', domains: [] },
  { name: 'grace', editContent: c => { c.world.encounters.tables[0].types.Land.stepChance = 21; }, random: () => 99, reason: 'grace', domains: [100] },
  { name: 'miss after grace', editContent: c => { c.world.encounters.tables[0].types.Land.stepChance = 21; }, random: (n, count) => count === 1 ? 0 : 99, reason: 'miss', domains: [100, 100] },
  { name: 'repel1 start protection', editState: g => { g.world.repelSteps = 1; }, reason: 'repel', domains: [100, 100, 1] },
  { name: 'Intimidate', party: [F.member('P1', { hp: 20, friendship: 70, level: 10, exp: 1000, ability: 'Intimidate' })], editContent: c => { c.abilities.intimidate = { id: 'intimidate', name: 'Intimidate' }; }, reason: 'ability', domains: [100, 100, 1, 100] },
]) test('C-App literal early prefix ' + scenario.name + ' has no premature generation', async () => {
  const w = fixture(scenario), result = await w.app.completeWorldStep(w.step(scenario.step));
  assert.equal(result.status, 'no-encounter', JSON.stringify(result)); assert.equal(result.reason, scenario.reason); assert.deepEqual(w.draws, scenario.domains);
  assert.equal(w.sessions.length, 0); assert.equal(w.state.current().steps, 1); assert.equal(w.app.saveBlocked, false);
});
test('C-App probability runtime prefix persists, grace failure does not accumulate and allowed admission resets both counters', async () => {
  const w = fixture({ editContent: c => { c.world.encounters.tables[0].types.Land.stepChance = 21; }, random: () => 99 });
  assert.equal((await w.app.completeWorldStep(w.step())).reason, 'grace'); assert.equal(w.app.world.encounterRuntime.graceSteps, 1); assert.equal(w.app.world.encounterRuntime.accumulator, 0);
  const miss = fixture({ editContent: c => { c.world.encounters.tables[0].types.Land.stepChance = 21; }, random: (n, count) => count === 1 ? 0 : 99 });
  await miss.app.completeWorldStep(miss.step()); assert.equal(miss.app.world.encounterRuntime.accumulator, 21);
  const admitted = fixture(), result = await admitted.app.completeWorldStep(admitted.step()); assert.equal(result.status, 'battle-admitted'); assert.equal(admitted.app.world.encounterRuntime.graceSteps, 0); assert.equal(admitted.app.world.encounterRuntime.accumulator, 0);
});
test('C-App exact version fallback plus defined-empty suppresses fallback; current map table snapshot changes only on reload/version', async () => {
  const w = fixture({ editState: g => { g.world.encounterVersion = 7; } });
  assert.equal(w.app.enterWorldMap({ id: 'enter', cause: 'new-game', previousMapId: null, mapId: 7, rebuilt: true }).status, 'committed');
  w.content.world.encounters.tables[0].types.Land.stepChance = 0;
  const result = await w.app.completeWorldStep(w.step()); assert.equal(result.status, 'battle-admitted', 'snapshot retains loaded100 despite registry edit0');
  w.app.abortAdmittedWorldBattle(result.admission, 'close');
  w.state.external(g => { g.world.encounterVersion = 8; });
  assert.equal((await w.app.completeWorldStep(w.step({ id: 'new-version' }))).reason, 'no-chance');
  const empty = fixture({ editState: g => { g.world.encounterVersion = 1; }, editContent: c => { c.world.encounters.tables.push({ mapId: 7, version: 1, types: {} }); } });
  assert.equal((await empty.app.completeWorldStep(empty.step())).reason, 'no-opportunity'); assert.deepEqual(empty.draws, []);
});
test('C-App real timed subtype and business cave/weather facts are locked before session creation', async () => {
  const w = fixture({ hour: 17, editState: g => { g.world.weather = { type: 'Storm', strength: 60, durationFrames: 0 }; }, editContent: c => {
    c.mapMetadata.maps[7].environment = 'cave'; c.world.encounters.tables[0].types.LandEvening = { stepChance: 100, slots: [{ species: 'C', weight: 100, minLevel: 3, maxLevel: 3 }] };
  } });
  const result = await w.app.completeWorldStep(w.step()); assert.equal(result.status, 'battle-admitted'); await w.app.startAdmittedWorldBattle(result.admission);
  assert.equal(w.sessions[0].setup.foes[0].species, 'C'); assert.deepEqual(w.sessions[0].setup.initialField, { weather: 'rain', terrain: 'electric', environment: 'cave' });
  assert.deepEqual(w.sessions[0].setup.worldCapture, { timeOfDay: 2, fishing: false });
});
for (const unsupported of [
  { label: 'missing rule family', edit: c => { delete c.species.B.ruleSpecies; }, reason: 'rule-family-unavailable' },
  { label: 'multi held pool', edit: c => { c.species.B.wildItemCommon = ['leftovers', 'oranberry']; }, reason: 'held-item-source-unchecked' },
  { label: 'partially empty held pool', edit: c => { c.species.B.wildItemCommon = ['leftovers']; }, reason: 'held-item-source-unchecked' },
]) test('C-App generator unsupported ' + unsupported.label + ' reports after candidate but before PID/IV', async () => {
  const w = fixture({ editContent: unsupported.edit }), result = await w.app.completeWorldStep(w.step());
  assert.equal(result.status, 'unsupported', JSON.stringify(result)); assert.equal(result.reason, unsupported.reason); assert.deepEqual(w.draws, [100, 100, 1]); assert.equal(w.state.current().steps, 1); assert.equal(w.app.saveBlocked, false);
});
test('C-App completed generator admits a legendary with three distinct perfect IVs', async () => {
  const w = fixture({ editContent: c => { c.species.B.flags = ['Legendary']; } });
  const result = await w.app.completeWorldStep(w.step()); assert.equal(result.status, 'battle-admitted');
  await w.app.startAdmittedWorldBattle(result.admission);
  assert.equal(Object.values(w.sessions[0].setup.foes[0].ivs).filter(value => value === 31).length, 3);
  assert.deepEqual(w.draws.slice(0,3), [100,100,1]);
});
test('C-App missing preference directory is unsupported; it never silently disables Static', async () => {
  const w = fixture({ party: [F.member('P1', { hp: 20, friendship: 70, ability: 'Static' })], editContent: c => { c.abilities.static = { id: 'static', name: 'Static' }; } });
  const result = await w.app.completeWorldStep(w.step()); assert.equal(result.status, 'unsupported'); assert.equal(result.reason, 'encounter-type-directory-unavailable'); assert.deepEqual(w.draws, [100]);
});
test('C-App business map must match actual completed landing before any encounter draw', async () => {
  const w = fixture({ businessMapId: 8 }), result = await w.app.completeWorldStep(w.step());
  assert.equal(result.status, 'unsupported'); assert.equal(result.reason, 'encounter-business-map-mismatch'); assert.deepEqual(w.draws, []); assert.equal(w.state.current().steps, 1);
});
test('C-App registered Static types feed real preference selection before weight and level draws', async () => {
  const w = fixture({ party: [F.member('P1', { hp: 20, friendship: 70, ability: 'Static' })],
    dex: { allTypes: () => [{ name: 'Electric' }], move: () => ({ name: 'Tackle', id: 'tackle', pp: 35 }) },
    editContent: c => { c.abilities.static = { id: 'static', name: 'Static' }; c.species.B.types = ['Normal']; c.species.C.types = ['Electric'];
      c.world.encounters.tables[0].types.Land.slots.push({ species: 'C', weight: 100, minLevel: 2, maxLevel: 2 }); } });
  const result = await w.app.completeWorldStep(w.step()); assert.equal(result.status, 'battle-admitted', JSON.stringify(result));
  assert.deepEqual(w.draws, [100, 100, 100, 1, 65536, 65536, 32, 32, 32, 32, 32, 32]);
  await w.app.startAdmittedWorldBattle(result.admission); assert.equal(w.sessions[0].setup.foes[0].species, 'C');
});
test('C-App actual supported singleton held item survives generated-member handoff to session without reroll', async () => {
  const w = fixture({ dex: { heldItem: id => ({ id, holdable: true, mail: false }), move: () => ({ name: 'Tackle', id: 'tackle', pp: 35 }) }, editContent: c => {
    c.meta = { kind: 'fixture', id: 'singleton-held', showdownSourceChecked: true };
    c.species.B.wildItemCommon = ['leftovers']; c.species.B.wildItemUncommon = ['leftovers']; c.species.B.wildItemRare = ['leftovers'];
  } });
  const result = await w.app.completeWorldStep(w.step()); assert.equal(result.status, 'battle-admitted', JSON.stringify(result)); assert.deepEqual(w.draws, domains);
  await w.app.startAdmittedWorldBattle(result.admission); assert.equal(w.sessions[0].setup.foes[0].item, 'leftovers'); assert.equal(w.sessions[0].setup.experimentalHeldBattle, true); assert.deepEqual(w.draws, domains);
});
for (const mode of ['content', 'cancel', 'generation', 'ledger']) test('C-App last offer guard rejects reentrant ' + mode + ' while preserving completed prefix', async () => {
  const w = fixture(); const admit = w.app.admitWorldBattle.bind(w.app);
  w.app.admitWorldBattle = (parent, offer) => {
    let armed = true; w.hook(({ app, content, state }) => { if (!armed) return; armed = false;
      if (mode === 'content') return { ...content, settings: { ...content.settings, POISON_IN_FIELD: true } };
      if (mode === 'ledger') { state.external(game => { game.appliedBattles['world:ordinary-1'] = { hash: 'a'.repeat(64) }; }); return; }
      if (mode === 'cancel') app.cancelCompletedWorldStep('ordinary-1'); else app.stateReplacedByHost();
    }); return admit(parent, offer);
  };
  const result = await w.app.completeWorldStep(w.step()); assert.ok(['failed', 'cancelled'].includes(result.status), JSON.stringify(result)); assert.equal(w.state.current().steps, 1); assert.equal(w.sessions.length, 0); assert.equal(w.app.saveBlocked, false);
});
test('C-App state/content drift after admission refuses start once, keeps prefix and never regenerates', async () => {
  for (const mode of ['state', 'content']) {
    const w = fixture(), result = await w.app.completeWorldStep(w.step()), beforeDraws = [...w.draws];
    if (mode === 'state') w.state.external(g => { g.party[0].hp--; }); else w.contentView({ ...w.content, settings: { ...w.content.settings, POISON_IN_FIELD: true } });
    await assert.rejects(w.app.startAdmittedWorldBattle(result.admission), /changed/); await assert.rejects(w.app.startAdmittedWorldBattle(result.admission), /stale/);
    assert.deepEqual(w.draws, beforeDraws); assert.equal(w.sessions.length, 0); assert.equal(w.state.current().steps, 1); assert.equal(w.app.saveBlocked, false);
  }
});
test('C-App failed session factory consumes its admission exactly once without extra generation', async () => {
  let creates = 0; const w = fixture({ create: () => { creates++; throw Error('session-failed'); } }), result = await w.app.completeWorldStep(w.step());
  await assert.rejects(w.app.startAdmittedWorldBattle(result.admission), /session-failed/); await assert.rejects(w.app.startAdmittedWorldBattle(result.admission), /stale/);
  assert.equal(creates, 1); assert.deepEqual(w.draws, domains); assert.equal(w.state.current().steps, 1); assert.equal(w.app.saveBlocked, false);
});
test('C-App abort before scheduled session creation cannot overwrite a successor operation', async () => {
  const w = fixture(), result = await w.app.completeWorldStep(w.step()), old = w.app.startAdmittedWorldBattle(result.admission);
  w.app.abortAdmittedWorldBattle(result.admission, 'before microtask');
  const current = w.app.startBattle(eventRequest('new-event')); await assert.rejects(old, /stale/); assert.equal(await current, w.handle);
  assert.equal(w.sessions.length, 1); assert.equal(w.app.op.battleId, 'new-event'); assert.equal(w.app.saveBlocked, true);
});
test('C-App late real factory completion cannot bind handle, unlock, or replace a successor battle', async () => {
  const pending = wait(); let creates = 0;
  const w = fixture({ create: ({ handle }) => ++creates === 1 ? pending.promise : handle }), result = await w.app.completeWorldStep(w.step());
  const old = w.app.startAdmittedWorldBattle(result.admission); await tick(); w.app.abortAdmittedWorldBattle(result.admission, 'late');
  const current = await w.app.startBattle(eventRequest('successor')); pending.resolve({ result() { throw Error('old'); } });
  await assert.rejects(old, /aborted|late/); assert.equal(current, w.handle); assert.equal(w.app.op.battleId, 'successor'); assert.equal(w.app.saveBlocked, true);
});
test('C-App old event species-level creation and blank initial weather keep their historical semantics', async () => {
  const w = fixture(); await w.app.startBattle(eventRequest('event'));
  assert.equal(w.sessions.length, 1); assert.equal(w.sessions[0].setup.initialField, undefined); assert.equal(w.sessions[0].setup.worldCapture, undefined);
  assert.deepEqual(w.draws, [65536, 65536, 32, 32, 32, 32, 32, 32]);
});
test('C-App actual production SessionFactory accepts one admitted real generated foe and engine can finish run', async () => {
  const sample = path.resolve(__dirname, '../../../content/sample');
  const names = ['manifest', 'sources', 'species', 'overlays', 'grants', 'regional-dex', 'settings', 'map-metadata'];
  const input = Object.fromEntries(names.filter(name => fs.existsSync(path.join(sample, name + '.json'))).map(name => [name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), JSON.parse(fs.readFileSync(path.join(sample, name + '.json'), 'utf8'))]));
  // Explicit synthetic author data selects the supported empty-pool domain; the real partial pool remains unsupported.
  const pidgey = input.species.find(species => species.id === 'pidgey');
  pidgey.wildItemCommon = []; pidgey.wildItemUncommon = []; pidgey.wildItemRare = [];
  input.encounters = { source: 'author-placeholder', tables: [{ mapId: 5, version: 0, types: { Land: { stepChance: 100, slots: [{ species: 'pidgey', weight: 100, minLevel: 2, maxLevel: 2 }] } } }] };
  const compiled = E.contentCompile.compileContent(input); assert.equal(compiled.ok, true, JSON.stringify(compiled.errors));
  const dex = E.dex.createDexLookup(), assembled = E.contentRuntime.assembleContent(compiled.data, dex); assert.deepEqual(assembled.errors, []); const content = assembled.content;
  const player = E.speciesKey.toPersistentMember(E.memberFactory.createMember({ id: 'P1', species: 'Snorlax', level: 50 }, content, () => 0), content);
  let game = E.state.newGame({ content, party: [player] }); game.appliedBattles['world:formal-1'] = { hash: 'a'.repeat(64) }; const actual = {}, map = {}, owner = {};
  const factory = E.composition.createBattleSessionFactory({ content: () => content, seed: () => [1, 2, 3, 4] });
  const app = new E.app.GameApplication({wildGeneration:{switchOn:()=>({status:'value',value:false})}, state: { read: () => game, replace: next => { game = next; } }, content: () => ({ content, dex }), sessions: factory, projection: { project() {} }, random: () => 0, clock: () => 1000,
    worldHost: { read: () => ({ mapId: value(5), hour: value(12), cycling: value(false), diving: value(false) }) },
    completedSteps: { current: () => ({ hostOwner: owner, generation: 1, player: actual, map, mapId: 5, x: 2, y: 2 }), async openRepelSelection() { return { status: 'cancelled' }; }, async present({ effect }) { return { id: effect.id, status: 'completed' }; }, dispatchArrival() { return { status: 'ordinary-opportunity' }; } },
    ordinaryEncounters: { read: () => ({ landAllowed: value(true), encountersDisabled: value(false), debugControl: value(false), groundEnvironment: value('grass') }) },
  });
  const result = await app.completeWorldStep({ id: 'formal-1', hostOwner: owner, generation: 1, player: actual, map, mapId: 5, x: 2, y: 2, sceneActive: true, ice: false, regionId: 0, terrainTag: 0 });
  assert.equal(result.status, 'battle-admitted', JSON.stringify(result)); assert.equal(result.admission.battleId, 'world:formal-1:1'); const session = await app.startAdmittedWorldBattle(result.admission);
  assert.ok(session && typeof session.run === 'function'); assert.equal((await session.run()).ok, true); assert.equal(session.result().battleId, result.admission.battleId);
  const outcome = app.finishBattle(session, eventRequest(result.admission.battleId)); assert.equal(outcome.commit, 'applied', JSON.stringify(outcome)); assert.equal(outcome.code, 3); assert.equal(app.saveBlocked, false); assert.equal(game.steps, 1);
  assert.deepEqual(game.appliedBattles['world:formal-1'], { hash: 'a'.repeat(64) });
  assert.equal(app.finishBattle(session, eventRequest(result.admission.battleId)).commit, 'already-applied'); assert.equal(game.steps, 1);
});

// C initial-form integration: actual App admission/session boundary, with explicit synthetic session transport.
test('C-App dynamic form uses one clock sample and admits the already-created member without recreating moves', async () => {
  let clocks=0;const instant=new Date(2026,1,1,12,0,0).getTime();
  const w=fixture({clock:()=>{clocks++;return instant;},editContent:c=>{
    c.species.B.ruleSpecies='Deerling';c.species.B.contentId='B';c.species.B.form=0;
    c.species.B1={...copy(c.species.B),form:1,formName:'Summer',base:{...c.species.B.base,hp:100},learnset:{1:['tackle']}};
    c.forms=Object.fromEntries(Object.keys(c.species).filter(id=>id!=='B1').map(id=>[id,{'0':id}]));c.forms.B['1']='B1';
    c.speciesKeys=Object.fromEntries(Object.keys(c.species).map(id=>[id,{species:id==='B1'?'B':id,form:id==='B1'?1:0}]));
  }});
  const result=await w.app.completeWorldStep(w.step());assert.equal(result.status,'battle-admitted',JSON.stringify(result));assert.equal(clocks,1);
  assert.deepEqual(w.state.current().dex.seenForms.B,[{gender:0,form:1,shiny:true}]);assert.deepEqual(w.state.current().dex.lastSeenForm.B,{gender:0,form:1,shiny:true});assert.equal(w.state.current().dex.owned.includes('B'),false);assert.equal(w.state.current().dex.capturedCounts.B??0,0);assert.equal(w.state.current().dex.defeatedCounts.B??0,0);
  const before=[...w.draws];await w.app.startAdmittedWorldBattle(result.admission);assert.deepEqual(w.draws,before);assert.equal(clocks,1);
  assert.equal(w.sessions[0].setup.foes[0].species,'B1');assert.equal(w.state.current().dex.seen.includes('B'),true);
  w.app.abortAdmittedWorldBattle(result.admission,'directed done');
});

test('C-App world hour remains the form/table/capture authority when the legal origin clock has another local hour',async()=>{
  let clocks=0;const w=fixture({hour:21,clock:()=>{clocks++;return new Date(2026,1,1,12).getTime();},editContent(c){
    c.species.B.ruleSpecies='Lycanroc';c.species.B.contentId='B';c.species.B.form=0;
    for(const form of [1,2])c.species['B'+form]={...copy(c.species.B),form};
    c.forms=Object.fromEntries(['A','B','C'].map(id=>[id,{'0':id}]));c.forms.B['1']='B1';c.forms.B['2']='B2';
    c.speciesKeys=Object.fromEntries(Object.keys(c.species).map(id=>[id,{species:/^B[12]$/.test(id)?'B':id,form:id==='B1'?1:id==='B2'?2:0}]));
  }});const result=await w.app.completeWorldStep(w.step());assert.equal(result.status,'battle-admitted',JSON.stringify(result));await w.app.startAdmittedWorldBattle(result.admission);
  assert.equal(w.sessions[0].setup.foes[0].species,'B1');assert.equal(w.sessions[0].setup.worldCapture.timeOfDay,2);assert.equal(clocks,1);w.app.abortAdmittedWorldBattle(result.admission,'clock authority checked');
});

function initialRegistrationContent(c){
  c.species.B.ruleSpecies='Deerling';c.species.B.contentId='B';c.species.B.form=0;
  c.species.B1={...copy(c.species.B),form:1,formName:'Summer'};
  c.forms=Object.fromEntries(['A','B','C'].map(id=>[id,{'0':id}]));c.forms.B['1']='B1';
  c.speciesKeys=Object.fromEntries(Object.keys(c.species).map(id=>[id,{species:id==='B1'?'B':id,form:id==='B1'?1:0}]));
}
test('C-App successful form registration survives later Session start failure, preserves first last-seen and never grants ownership/counts',async()=>{
  const first={gender:1,form:0,shiny:false};const w=fixture({clock:()=>new Date(2026,1,1,12).getTime(),editContent:initialRegistrationContent,editState:g=>{g.dex.lastSeenForm.B=copy(first);},factory:{async create(){throw Error('formal-start-failure');}}});
  const result=await w.app.completeWorldStep(w.step());assert.equal(result.status,'battle-admitted',JSON.stringify(result));
  const registered=copy(w.state.current().dex),writes=w.writes.length;assert.equal(registered.seen.includes('B'),true);assert.deepEqual(registered.lastSeenForm.B,first);
  await assert.rejects(w.app.startAdmittedWorldBattle(result.admission),/formal-start-failure/);assert.deepEqual(w.state.current().dex,registered);assert.equal(w.app.saveBlocked,false);
  assert.equal((await w.app.completeWorldStep(w.step())).admission,result.admission);assert.equal(w.writes.length,writes);assert.equal(registered.owned.includes('B'),false);assert.equal(registered.capturedCounts.B??0,0);assert.equal(registered.defeatedCounts.B??0,0);
});
test('C-App generation invalidated on the final IV cannot write a late form registration',async()=>{
  let w;w=fixture({clock:()=>new Date(2026,1,1,12).getTime(),editContent:initialRegistrationContent,random:(n,count)=>{if(count===11)w.app.stateReplacedByHost();return 0;}});
  const result=await w.app.completeWorldStep(w.step());assert.notEqual(result.status,'battle-admitted');assert.equal(w.state.current().dex.seen.includes('B'),false);assert.equal(w.state.current().dex.seenForms.B,undefined);assert.equal(w.sessions.length,0);
});

test('C-App production Session captures a finite dynamic fallback into a real full-party storage template without regenerating it',async()=>{
  const sample=path.resolve(__dirname,'../../../content/sample'),names=['manifest','sources','species','overlays','grants','regional-dex','settings','map-metadata'];
  const input=Object.fromEntries(names.filter(name=>fs.existsSync(path.join(sample,name+'.json'))).map(name=>[name.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),JSON.parse(fs.readFileSync(path.join(sample,name+'.json'),'utf8'))]));
  const authored={...copy(input.species.find(s=>s.id==='pidgey')),id:'milcery-test',showdownId:'milcery',nameKey:'species.milcery_test',wildItemCommon:['ribbonsweet'],wildItemUncommon:['ribbonsweet'],wildItemRare:['ribbonsweet']};input.species.push(authored);
  input.items=[...Object.values(E.itemCatalog.legacyCatalog()).map(item=>({...item,source:'author-placeholder'})),{id:'ribbonsweet',name:'Ribbon Sweet',namePlural:'Ribbon Sweets',pocket:1,order:999,price:0,sellPrice:0,flags:[],fieldUse:'none',battleUse:'none',battleId:'ribbonsweet',legacyIds:[],consumable:true,source:'author-placeholder'}];
  input.settings={...input.settings,GAIN_EXP_FOR_CAPTURE:false};input.encounters={source:'author-placeholder',tables:[{mapId:5,version:0,types:{Land:{stepChance:100,slots:[{species:'milcery-test',weight:100,minLevel:2,maxLevel:2}]}}}]};
  const compiled=E.contentCompile.compileContent(input);assert.equal(compiled.ok,true,JSON.stringify(compiled.errors));const dex=E.dex.createDexLookup(),assembled=E.contentRuntime.assembleContent(compiled.data,dex);assert.deepEqual(assembled.errors,[]);const content=assembled.content;
  const party=Array.from({length:6},(_,i)=>E.speciesKey.toPersistentMember(E.memberFactory.createMember({id:'P'+(i+1),species:'Snorlax',level:50},content,()=>0),content));
  let game=E.state.newGame({content,party,bag:{masterball:1}}),pidDraws=0;const draws=[],actual={},map={},owner={};
  const factory=E.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4]});
  const app=new E.app.GameApplication({wildGeneration:{switchOn:()=>({status:'value',value:false})},state:{read:()=>game,replace:next=>{game=next;}},content:()=>({content,dex}),sessions:factory,projection:{project(){}},clock:()=>1000,random(n){draws.push(n);return n===65536?(++pidDraws===2?8:0):0;},
    worldHost:{read:()=>({mapId:value(5),hour:value(12),cycling:value(false),diving:value(false)})},
    completedSteps:{current:()=>({hostOwner:owner,generation:1,player:actual,map,mapId:5,x:2,y:2}),async openRepelSelection(){return {status:'cancelled'};},async present({effect}){return {id:effect.id,status:'completed'};},dispatchArrival(){return {status:'ordinary-opportunity'};}},
    ordinaryEncounters:{read:()=>({landAllowed:value(true),encountersDisabled:value(false),debugControl:value(false),groundEnvironment:value('grass')})}});
  const admitted=await app.completeWorldStep({id:'dynamic-capture',hostOwner:owner,generation:1,player:actual,map,mapId:5,x:2,y:2,sceneActive:true,ice:false,regionId:0,terrainTag:0});assert.equal(admitted.status,'battle-admitted',JSON.stringify(admitted));
  assert.equal(game.dex.seen.includes('milcery-test'),true);assert.equal(game.dex.owned.includes('milcery-test'),false);const generatedDraws=[...draws];
  const session=await app.startAdmittedWorldBattle(admitted.admission);session.take();assert.equal((await session.throwBall('masterball')).ok,true);assert.equal(session.finished,true);assert.deepEqual(draws,generatedDraws);
  const raw=session.result();let outcome=app.finishBattle(session,eventRequest(admitted.admission.battleId));assert.equal(outcome.pending,true,JSON.stringify(outcome));outcome=app.resolveReceiving(outcome.receivingToken,{[raw.captured[0].id]:{nickname:{kind:'keep'},placement:{kind:'box'}}});assert.equal(outcome.commit,'applied',JSON.stringify(outcome));
  const stored=game.storage.boxes.flatMap(box=>box.slots).find(member=>member?.id===raw.captured[0].id);assert.ok(stored);assert.equal(stored.species,'milcery-test');assert.equal(stored.form,62);assert.equal(stored.item,'ribbonsweet');assert.equal(stored.personalID,8);assert.equal(game.party.length,6);
  assert.equal(game.dex.capturedCounts['milcery-test'],1);assert.equal(app.finishBattle(session,eventRequest(admitted.admission.battleId)).commit,'already-applied');assert.equal(game.dex.capturedCounts['milcery-test'],1);assert.deepEqual(draws,generatedDraws);
});
