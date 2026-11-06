'use strict';
// Actual required App/composition/Gen8; observations are read-only. No test producer or engine mutation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../../../js/engine/build/production.cjs');
const T = require('../../../js/engine/build/testing.cjs');
const plan = require('./held-harvest-recovery-plan.json');
const root = path.resolve(__dirname, '../../..');
const clone = value => JSON.parse(JSON.stringify(value));
const norm = value => String(value).replace(/[^A-Za-z]/g, '').toLowerCase();
const events = messages => messages.flatMap(m => m.kind === 'events' ? m.events : []);
const source = path.join(root, 'content/sample');
assert.deepEqual(plan.seed, [1, 2, 3, 4]);
assert.equal(fs.readFileSync(path.join(root, 'js/engine/showdown/SOURCE_SHA'), 'utf8').trim(), plan.showdownSHA);

function assemble() {
  const input = Object.fromEntries(['manifest', 'sources', 'species', 'overlays', 'grants', 'regional-dex', 'settings', 'map-metadata']
    .filter(name => fs.existsSync(path.join(source, name + '.json')))
    .map(name => [name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), JSON.parse(fs.readFileSync(path.join(source, name + '.json'), 'utf8'))]));
  assert(!input.species.some(s => s.id === 'exeggutor'));
  input.species.push({ id: 'exeggutor', showdownId: 'exeggutor', nameKey: 'species.exeggutor', growth: 'slow', baseExp: 100, evYield: {}, catchRate: 45,
    learnset: plan.moves.map(move => ({ level: 1, move })), source: 'author-placeholder' });
  input.species.find(s => s.id === plan.foe.species).learnset = plan.foe.moves.map(move => ({ level: 1, move }));
  input.items = Object.values(E.itemCatalog.legacyCatalog()).map(item => ({ ...item, source: 'author-placeholder' }));
  if (!input.items.some(item => item.id === plan.item)) input.items.push({ id: plan.item, name: 'Lum Berry', namePlural: 'Lum Berries', pocket: 5, price: 0, source: 'author-placeholder' });
  input.trainerTypes = [{ id: 'harvest-check', nameKey: 'trainer.harvest', gender: 0, baseMoney: 0, skillLevel: 0, flags: [], items: [], source: 'author-placeholder' }];
  input.trainers = [{ id: 'harvest-foe', type: 'harvest-check', name: 'Harvest Check', version: 1, source: 'author-placeholder',
    party: [{ species: plan.foe.species, level: plan.foe.level, moves: plan.foe.moves }] }];
  const compiled = E.contentCompile.compileContent(input);
  assert(compiled.ok, JSON.stringify(compiled.errors));
  const dex = E.dex.createDexLookup();
  const assembled = E.contentRuntime.assembleContent(compiled.data, dex);
  assert.deepEqual(assembled.errors, []);
  return { input, content: assembled.content, dex };
}

async function open(c) {
  const supplied = assemble(), content = supplied.content;
  const member = E.memberFactory.createMember({ id: plan.playerId, species: plan.species, level: plan.level, abilityIndex: c.abilityIndex }, content, () => 0);
  assert.equal(member.ability, c.ability, 'native species ability slot, not an arbitrary injected ability');
  assert.deepEqual(member.moves.map(m => m.id), plan.moves);
  member.item = plan.item;
  member.hp -= 1; // Initial synthetic state only; Rest has a legal missing-HP condition.
  const game = E.state.newGame({ content, party: [E.speciesKey.toPersistentMember(member, content)], money: 1000 });
  game.nextMemberOrdinal = '2';
  const state = T.fakes.createMemoryState(game), initial = clone(state.read());
  const factory = E.composition.createBattleSessionFactory({ content: () => content, seed: () => [...plan.seed] });
  const app = new E.app.GameApplication({ state, projection: T.fakes.createRecordingProjection(), sessions: factory, content: () => supplied, random: () => 0, clock: () => 12345 },
    { capabilities: { allowHeldItemSources: true, allowExperimentalHeldItemBattle: true }, receivingProfile: { mode: 1, naming: 1 } });
  const request = { battleId: 'HARVEST-' + c.id, seq: 1, canLose: true, expGain: false, moneyGain: false,
    ...(c.kind === 'trainer' ? { trainer: { id: 'harvest-foe', version: 1 } } : { kind: 'wild', foes: [{ species: plan.foe.species, level: plan.foe.level }] }) };
  const session = c.kind === 'trainer' ? await app.startTrainerBattle(request) : await app.startBattle(request);
  return { app, session, state, initial, request, content, input: supplied.input, phase: 'open', opening: clone(session.take()), trace: [] };
}

function publicView(session) {
  const request = session.currentRequest();
  return { live: clone(session.gw.readState('p1')[0]), foe: clone(session.gw.readState('p2')[0]), request: clone(request),
    requestedItem: request?.side?.pokemon?.find(m => m.ident?.endsWith(': ' + plan.playerId) || m.name === plan.playerId)?.item ?? null };
}
function unchanged(w) {
  assert.equal(w.state.replaced.length, 0);
  assert.deepEqual(w.state.read(), w.initial, 'complete persistent state is unchanged before authenticated finish');
}
function write(c, observation) {
  if (process.env.HARVEST_CHECK_OUTPUT) fs.writeFileSync(path.join(process.env.HARVEST_CHECK_OUTPUT, c.id + '.json'), JSON.stringify(observation, null, 2) + '\n');
}

for (const c of plan.cases) test(c.id + ' actual ' + c.kind + ' ' + c.ability + ' recovery contract', { concurrency: false }, async () => {
  let w;
  const observation = { id: c.id, case: c, planBase: plan.productBase, node: process.version, pid: process.pid, phases: [], outcome: null, facts: null, error: null };
  try {
    w = await open(c);
    observation.input = w.input;
    observation.contentMeta = clone(w.content.meta);
    observation.initial = w.initial;
    observation.opening = w.opening;
    for (const move of c.turns) {
      w.phase = move; unchanged(w);
      const before = publicView(w.session), slot = plan.moves.indexOf(move) + 1;
      assert(slot > 0);
      const result = await w.session.chooseMove(slot);
      const row = { move, slot, before, after: publicView(w.session), messages: clone(result.messages) };
      w.trace.push(row); observation.phases = w.trace;
      assert(result.ok, JSON.stringify(result)); unchanged(w);
      assert.equal(row.after.live.pp[move], before.live.pp[move] - 1, 'one real PP is spent');
      if (move === 'rest') {
        assert.equal(row.after.live.hp, row.after.live.maxhp);
        assert.equal(row.after.live.status, '', 'Lum Berry actually cures Rest sleep');
        assert(events(row.messages).some(e => e.type === '-enditem' && norm(e.args[1]) === plan.item), 'actual berry consumption event');
      }
    }
    w.phase = 'terminal';
    assert(w.session.finished, 'actual Psychic KO, without diagnostic termination');
    assert(w.session.gw.ended, 'actual driver is ended');
    assert.equal(w.trace.at(-1).after.foe.hp, 0, 'the ordinary final Psychic actually defeated the foe');
    assert(!w.trace.at(-1).messages.some(m => m.kind === 'request'), 'terminal turn emits no subsequent request; currentRequest caches the prior one');
    const raw = w.session.result();
    observation.raw = clone(raw);
    assert.equal(raw.outcome.kind, 'win'); assert.equal(raw.outcome.winner, 'Player');
    const lineage = T.heldDiagnostics.gatewaySettlementLineage(w.session.gw);
    assert(lineage);
    // Diagnostic copy only. App obtains its own authenticated seal; this binding is never supplied to commit.
    const diagnosticBinding = { battleId: raw.battleId, generation: 0, rawHash: E.state.resultHash(raw), contentIdentity: 'b'.repeat(64) };
    observation.facts = clone(T.heldDiagnostics.gatewaySettlementFacts(w.session.gw, lineage, diagnosticBinding));
    observation.factsAuthority = 'diagnostic-read-only-copy-not-submitted-to-app';
    unchanged(w);
    w.phase = 'finish';
    observation.outcome = clone(w.app.finishBattle(w.session, w.request));
    observation.installed = clone(w.state.read());
    observation.replaceCount = w.state.replaced.length;
    assert.equal(observation.outcome.commit, 'applied', JSON.stringify(observation.outcome));
    assert.equal(observation.replaceCount, 1);
    assert.match(observation.installed.appliedBattles[raw.battleId].settlement.pairHash, /^[a-f0-9]{64}$/);
    const installed = clone(w.state.read());
    assert.equal(w.app.finishBattle(w.session, w.request).commit, 'already-applied');
    assert.equal(w.state.replaced.length, 1); assert.deepEqual(w.state.read(), installed);
    observation.replay = { commit: 'already-applied', replaceCount: w.state.replaced.length };
    const all = events(w.trace.flatMap(row => row.messages));
    const consumed = all.filter(e => e.type === '-enditem' && norm(e.args[1]) === plan.item);
    assert.equal(consumed.length, c.consumed ? 1 : 0, 'one actual own berry consumption, or none');
    const harvest = all.filter(e => e.type === '-item' && e.args.some(a => String(a).includes('ability: Harvest')));
    assert.equal(harvest.length, c.recoveredBy === 'harvest' ? 1 : 0, 'Harvest is proved by its actual ability event, never a Recycle proxy');
    const playerFact = observation.facts.members.find(m => m.id === plan.playerId);
    observation.playerFact = playerFact;
    assert.equal(playerFact.current, c.consumed && !c.recoveredBy ? '' : plan.item);
    assert.equal(playerFact.recycle, c.consumed && !c.recoveredBy ? plan.item : '');
    const errors = [];
    if (playerFact.recovery !== c.expectedRecovery) errors.push(`I expected ${JSON.stringify(c.expectedRecovery)}, actual ${JSON.stringify(playerFact.recovery)}`);
    if (observation.installed.party[0].item !== c.expectedInstalled) errors.push(`installed item expected ${JSON.stringify(c.expectedInstalled)}, actual ${JSON.stringify(observation.installed.party[0].item)}`);
    // Preserve complete observed commit/replay before asserting the external WP-based expectation.
    w.phase = 'WP-expectation'; observation.contractMismatches = errors; write(c, observation);
    assert.deepEqual(errors, [], 'independent WP49 Harvest / WP47-B Recycle expectation');
  } catch (error) {
    observation.phase = w?.phase ?? 'setup';
    observation.error = { name: error.name, message: error.message, stack: error.stack };
    if (w) {
      observation.phases = w.trace;
      observation.finalObservedState = clone(w.state.read());
      observation.finalReplaceCount = w.state.replaced.length;
      if (!w.session.finished) { w.app.abortBattle(w.request, error); observation.cleanup = 'owned unfinished App aborted'; }
    }
    write(c, observation); throw error;
  } finally {
    if (w && !w.session.finished) w.app.abortBattle(w.request, Error('directed test completion'));
  }
});
