'use strict';
// Prepared from product 2567317 and validated with the authenticated Pickup journal.
// Actual Showdown selection is preserved; this suite does not impose old WP selection order.
// Source: smogon/pokemon-showdown@7244fe8e28fa8bc4d0809ae30d183c608b62bb2b,
// data/abilities.ts: pickup; Gen8 inherits its random eligible-candidate sampling.
// The selected donor is observed from the real engine, never inferred from roster/order/WP text.
// RPG I follows the existing transfer contract, not Harvest: ordinary donor consumption already
// cleared donor I, so receiving that item is temporary even in a wild battle. Nonempty receiver I
// is preserved. Permanent transfer needs wild p2 -> p1, empty receiver I, item == actual donor I.
// Contract checked by the coordinator against formal WP49 section 7 and held-facts.ts.
// All fixture learnsets are synthetic; these are not original-runtime equivalence results.
// No seedState, private engine writes, patched RNG, diagnostic terminal, NW or save files.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../../../js/engine/build/production.cjs');
const T = require('../../../js/engine/build/testing.cjs');
const root = path.resolve(__dirname, '../../..');
const clone = value => JSON.parse(JSON.stringify(value));
const events = messages => messages.flatMap(m => m.kind === 'events' ? m.events : []);
const norm = value => String(value).replace(/[^A-Za-z]/g, '').toLowerCase();
const SHA = '7244fe8e28fa8bc4d0809ae30d183c608b62bb2b';
const SEED = [1, 2, 3, 4];
const MOVES = ['splash', 'rest', 'psychic'];
assert.equal(fs.readFileSync(path.join(root, 'js/engine/showdown/SOURCE_SHA'), 'utf8').trim(), SHA);

function assemble() {
  const source = path.join(root, 'content/sample');
  const input = Object.fromEntries(['manifest', 'sources', 'species', 'overlays', 'grants', 'regional-dex', 'settings', 'map-metadata']
    .filter(name => fs.existsSync(path.join(source, name + '.json')))
    .map(name => [name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), JSON.parse(fs.readFileSync(path.join(source, name + '.json'), 'utf8'))]));
  for (const [id, moves] of [['meowth', MOVES], ['caterpie', ['fling']]]) {
    let species = input.species.find(s => s.id === id);
    if (!species) {
      species = { id, showdownId: id, nameKey: 'species.' + id, growth: 'medium', baseExp: 50, evYield: {}, catchRate: 45, source: 'author-placeholder' };
      input.species.push(species);
    }
    species.learnset = moves.map(move => ({ level: 1, move }));
  }
  input.items = Object.values(E.itemCatalog.legacyCatalog()).map(item => ({ ...item, source: 'author-placeholder' }));
  for (const [id, name, pocket] of [['lumberry', 'Lum Berry', 5], ['leftovers', 'Leftovers', 1]]) {
    if (!input.items.some(item => item.id === id)) input.items.push({ id, name, namePlural: name, pocket, price: 0, source: 'author-placeholder' });
  }
  input.trainerTypes = [{ id: 'pickup-check', nameKey: 'trainer.pickup', gender: 0, baseMoney: 0, skillLevel: 0, flags: [], items: [], source: 'author-placeholder' }];
  input.trainers = [{ id: 'pickup-foe', type: 'pickup-check', name: 'Pickup Check', version: 1, source: 'author-placeholder',
    party: [{ species: 'caterpie', level: 5, moves: ['fling'], item: 'lumberry' }] }];
  const compiled = E.contentCompile.compileContent(input);
  assert(compiled.ok, JSON.stringify(compiled.errors));
  const dex = E.dex.createDexLookup(), assembled = E.contentRuntime.assembleContent(compiled.data, dex);
  assert.deepEqual(assembled.errors, []);
  return { content: assembled.content, dex };
}

async function open(c) {
  const supplied = assemble(), content = supplied.content;
  const member = E.memberFactory.createMember({ id: 'U1', species: 'Meowth', level: 50, abilityIndex: c.abilityIndex ?? 0 }, content, () => 0);
  assert.equal(member.ability, c.ability ?? 'Pickup', 'native ability slot, not a substituted ability');
  assert.deepEqual(member.moves.map(m => m.id), MOVES);
  member.item = c.initialItem ?? '';
  const game = E.state.newGame({ content, party: [E.speciesKey.toPersistentMember(member, content)], money: 1000 });
  game.nextMemberOrdinal = '2';
  const state = T.fakes.createMemoryState(game), initial = clone(state.read());
  const factory = E.composition.createBattleSessionFactory({ content: () => content, seed: () => [...SEED] });
  const app = new E.app.GameApplication({ state, projection: T.fakes.createRecordingProjection(), sessions: factory, content: () => supplied, random: () => 0, clock: () => 12345 },
    { capabilities: { allowHeldItemSources: true, allowExperimentalHeldItemBattle: true }, receivingProfile: { mode: 1, naming: 1 } });
  const request = { battleId: c.id, seq: 1, canLose: true, expGain: false, moneyGain: false, trainer: { id: 'pickup-foe', version: 1 } };
  const session = await app.startTrainerBattle(request);
  session.take();
  return { app, session, state, initial, request, trace: [] };
}
function inspect(gw) {
  return gw._debugBattle().sides.flatMap(side => side.pokemon.map(p => ({ id: p.set.name, side: side.id, item: p.item, recycle: p.lastItem, used: p.usedItemThisTurn, hp: p.hp })));
}
function unchanged(w) {
  assert.equal(w.state.replaced.length, 0);
  assert.deepEqual(w.state.read(), w.initial);
}
async function move(w, id) {
  unchanged(w);
  const pp = w.session.gw.readState('p1')[0].pp[id], result = await w.session.chooseMove(MOVES.indexOf(id) + 1);
  assert(result.ok, JSON.stringify(result));
  assert.equal(w.session.gw.readState('p1')[0].pp[id], pp - 1);
  unchanged(w);
  const row = { id, actual: inspect(w.session.gw), events: clone(events(result.messages)) };
  w.trace.push(row);
  return row;
}
function diagnosticFacts(gw, battleId, rawHash) {
  const lineage = T.heldDiagnostics.gatewaySettlementLineage(gw);
  assert(lineage);
  const binding = { battleId, generation: 0, rawHash, contentIdentity: 'b'.repeat(64) };
  // Read-only copies; the App independently obtains the authenticated facts, not this binding.
  return { binding, facts: T.heldDiagnostics.gatewaySettlementFacts(gw, lineage, binding) };
}
function validateFacts(facts, binding, wild) {
  const roster = facts.members.map(({ id, side, initial }) => ({ id, side, initial }));
  const result = E.heldFacts.resolveRequiredFacts(facts, { binding, roster, wild });
  assert.equal(result.ok, true, JSON.stringify(result));
}

const cases = [
  { id: 'PICK01', picked: true, consumed: false },
  { id: 'PICK02', picked: true, consumed: true },
  { id: 'PICK03', picked: false, consumed: false, initialItem: 'leftovers' },
  { id: 'PICK04', picked: false, consumed: false, abilityIndex: 1, ability: 'Technician' },
  { id: 'PICK05', picked: true, consumed: false, failInstallOnce: true },
];

for (const c of cases) test(c.id + ' real trainer Pickup, natural consumption, single authenticated install', { concurrency: false }, async () => {
  let w;
  try {
    w = await open(c);
    const first = await move(w, 'splash');
    const player = first.actual.find(p => p.id === 'U1'), donor = first.actual.find(p => p.side === 'p2');
    assert(donor && player);
    assert.equal(donor.item, '', 'the donor actually uses its held item through Fling');
    assert(first.events.some(e => e.type === '-enditem' && norm(e.args[1]) === 'lumberry' && e.args.some(a => String(a).includes('move: Fling'))));
    assert.equal(donor.recycle, c.picked ? '' : 'lumberry', 'only successful Pickup clears the real donor R');
    assert.equal(player.item, c.picked ? 'lumberry' : (c.initialItem ?? ''));
    assert.equal(first.events.filter(e => e.type === '-item' && e.args.some(a => String(a).includes('ability: Pickup'))).length, c.picked ? 1 : 0);
    if (c.consumed) {
      const rest = await move(w, 'rest');
      const now = rest.actual.find(p => p.id === 'U1');
      assert.equal(now.item, '');
      assert.equal(now.recycle, 'lumberry');
      const live = w.session.gw.readState('p1')[0];
      assert.equal(live.hp, live.maxhp, 'real Rest heals the earlier Fling damage');
      assert.equal(live.status, '', 'the picked-up Lum Berry actually cures the Rest sleep');
      assert(rest.events.some(e => e.type === '-enditem' && norm(e.args[1]) === 'lumberry' && e.args.includes('[eat]')));
    }
    await move(w, 'psychic');
    assert(w.session.finished && w.session.gw.ended, 'ordinary Psychic KO, with no synthetic terminal');
    assert.equal(w.session.gw.readState('p2')[0].hp, 0);
    const raw = w.session.result();
    assert.deepEqual(raw.outcome, { kind: 'win', winner: 'Player' });
    const { facts, binding } = diagnosticFacts(w.session.gw, raw.battleId, E.state.resultHash(raw));
    validateFacts(facts, binding, false);
    const expected = c.consumed ? '' : c.picked ? 'lumberry' : (c.initialItem ?? '');
    const fact = facts.members.find(m => m.id === 'U1'), source = facts.members.find(m => m.id === donor.id);
    assert.deepEqual([fact.current, fact.recovery, fact.recycle], [expected, c.initialItem ?? '', c.consumed ? 'lumberry' : '']);
    assert.deepEqual([source.current, source.recovery, source.recycle], ['', '', c.picked ? '' : 'lumberry']);
    const pickup = facts.events.filter(e => e.id === 'U1' && e.reason === 'temporary-receive');
    assert.equal(pickup.length, c.picked ? 1 : 0);
    if (c.picked) {
      assert.equal(pickup[0].sourceId, donor.id, 'sourceId identifies the engine-selected donor object');
      assert.deepEqual(pickup[0].before, { current: '', recovery: '', recycle: '' });
      assert.deepEqual(pickup[0].after, { current: 'lumberry', recovery: '', recycle: '' });
      const consumed = facts.events.find(e => e.id === donor.id && e.reason === 'consume');
      const cleared = facts.events.find(e => e.id === donor.id && e.before.recycle === 'lumberry' && e.after.recycle === '');
      assert(consumed && cleared);
      assert(consumed.ordinal < cleared.ordinal && cleared.ordinal < pickup[0].ordinal, 'real donor consumption, selected-source clear, then recipient receive');
    }
    assert.equal(facts.events.filter(e => e.id === 'U1' && e.reason === 'consume').length, c.consumed ? 1 : 0);
    unchanged(w);
    let outcome;
    if (c.failInstallOnce) {
      w.state.failReplace = Error('controlled zero-write Pickup install failure');
      const pending = w.app.finishBattle(w.session, w.request);
      assert(pending.pending);
      unchanged(w);
      w.state.failReplace = null;
      outcome = w.app.resolveReceiving(pending.receivingToken);
      assert.deepEqual(diagnosticFacts(w.session.gw, raw.battleId, E.state.resultHash(raw)).facts, facts, 'retry cannot rerun Pickup');
    } else outcome = w.app.finishBattle(w.session, w.request);
    assert.equal(outcome.commit, 'applied', JSON.stringify(outcome));
    assert.equal(w.state.replaced.length, 1);
    assert.equal(w.state.read().party[0].item, c.initialItem ?? '', 'Pickup does not invent recovery ownership for the consumed donor item');
    assert.match(w.state.read().appliedBattles[raw.battleId].settlement.pairHash, /^[a-f0-9]{64}$/);
    const installed = clone(w.state.read());
    assert.equal(w.app.finishBattle(w.session, w.request).commit, 'already-applied');
    assert.equal(w.app.commitResult(raw), 'already-applied');
    assert.equal(w.state.replaced.length, 1);
    assert.deepEqual(w.state.read(), installed);
  } finally {
    if (w && !w.session.finished) w.app.abortBattle(w.request, Error('Pickup App cleanup'));
  }
});

const set = (name, species, ability, moves, item = '', level = 50) => ({ name, species, ability, moves, item, level, nature: 'Hardy' });
async function gateway(players, wild, seed, requiredSettlement, doubles = false) {
  const gw = await E.gateway.BattleGateway.create({ engineRoot: path.join(root, 'js/engine/showdown'),
    formatid: doubles ? 'gen8rpgdoublescustomgame' : 'gen8rpgcustomgame', seed: [...seed], requiredSettlement, wild, players: clone(players) });
  for (const [i, side] of players.entries()) assert.equal(await gw.choose(i === 0 ? 'p1' : 'p2', 'team ' + side.team.map((_, n) => n + 1).join('')), true);
  gw.drain();
  return gw;
}
async function turn(gw, own, foe) {
  assert.equal(await gw.choose('p1', own), true);
  assert.equal(await gw.choose('p2', foe), true);
  return events(gw.drain());
}
function parity(actual, control) {
  for (const side of ['p1', 'p2']) assert.deepEqual(actual.readState(side), control.readState(side));
  assert.deepEqual(inspect(actual), inspect(control));
  assert.deepEqual(actual._debugBattle().prng.getSeed(), control._debugBattle().prng.getSeed(), 'journal observation must not draw or replace RNG');
}

test('PICK existing I survives Knock Off, foreign Pickup and later natural berry consumption', { concurrency: false }, async () => {
  const players = [{ name: 'Player', team: [set('U1', 'Meowth', 'Pickup', ['Splash', 'Rest', 'Psychic'], 'leftovers', 100)] },
    { name: 'Trainer', team: [set('D1', 'Snorlax', 'Immunity', ['Knock Off', 'Fling', 'Splash'], 'lumberry', 5)] }];
  const actual = await gateway(players, false, SEED, true), control = await gateway(players, false, SEED, false);
  await turn(actual, 'move 1', 'move 1'); await turn(control, 'move 1', 'move 1'); parity(actual, control);
  assert.equal(inspect(actual).find(p => p.id === 'U1').item, '', 'real Knock Off makes room but does not consume the initial Leftovers');
  await turn(actual, 'move 1', 'move 2'); await turn(control, 'move 1', 'move 2'); parity(actual, control);
  assert.equal(inspect(actual).find(p => p.id === 'U1').item, 'lumberry');
  assert.equal(inspect(actual).find(p => p.id === 'D1').recycle, '');
  await turn(actual, 'move 2', 'move 3'); await turn(control, 'move 2', 'move 3'); parity(actual, control);
  assert.equal(actual.readState('p1')[0].status, '');
  assert.equal(actual.readState('p1')[0].hp, actual.readState('p1')[0].maxhp);
  await turn(actual, 'move 3', 'move 3'); await turn(control, 'move 3', 'move 3'); parity(actual, control);
  assert(actual.ended && control.ended);
  const { facts, binding } = diagnosticFacts(actual, 'PICK-existing-I', 'a'.repeat(64));
  validateFacts(facts, binding, false);
  const player = facts.members.find(m => m.id === 'U1');
  assert.deepEqual([player.current, player.recovery, player.recycle], ['', 'leftovers', 'lumberry']);
  const received = facts.events.find(e => e.id === 'U1' && e.reason === 'temporary-receive');
  assert(received); assert.equal(received.sourceId, 'D1');
  assert.deepEqual(received.before, { current: '', recovery: 'leftovers', recycle: '' });
  assert.deepEqual(received.after, { current: 'lumberry', recovery: 'leftovers', recycle: '' });
  const consumed = facts.events.find(e => e.id === 'U1' && e.reason === 'consume');
  assert(consumed && consumed.ordinal > received.ordinal);
  assert.deepEqual(consumed.after, { current: '', recovery: 'leftovers', recycle: 'lumberry' });
});

// The current App creates itemless wild foes. These are explicit gateway-only wild contracts,
// not a claim that the App supports configuring a wild foe's initial item.
for (const consume of [false, true]) test('PICK wild gateway: actual donor, ' + (consume ? 'later Fling consumption' : 'retained pickup'), { concurrency: false }, async () => {
  const players = [{ name: 'Player', team: [set('U1', 'Meowth', 'Pickup', ['Splash', 'Fling', 'Psychic'], '', 100)] },
    { name: 'Wild', team: [set('D1', 'Caterpie', 'Shield Dust', ['Fling', 'Splash'], 'lumberry', 5)] }];
  const actual = await gateway(players, true, SEED, true), control = await gateway(players, true, SEED, false);
  await turn(actual, 'move 1', 'move 1'); await turn(control, 'move 1', 'move 1'); parity(actual, control);
  assert.equal(inspect(actual).find(p => p.id === 'U1').item, 'lumberry');
  assert.equal(inspect(actual).find(p => p.id === 'D1').recycle, '');
  // Fling may itself KO this low-level donor: that is a real natural terminal, not a tie.
  await turn(actual, consume ? 'move 2' : 'move 3', 'move 2'); await turn(control, consume ? 'move 2' : 'move 3', 'move 2'); parity(actual, control);
  if (!actual.ended) { await turn(actual, 'move 3', 'move 2'); await turn(control, 'move 3', 'move 2'); parity(actual, control); }
  assert(actual.ended && control.ended);
  const { facts, binding } = diagnosticFacts(actual, 'PICK-wild-' + consume, 'a'.repeat(64));
  validateFacts(facts, binding, true);
  const p = facts.members.find(m => m.id === 'U1');
  assert.deepEqual([p.current, p.recovery, p.recycle], consume ? ['', '', 'lumberry'] : ['lumberry', '', '']);
  const picked = facts.events.filter(e => e.id === 'U1' && e.reason === 'temporary-receive');
  assert.equal(picked.length, 1); assert.equal(picked[0].sourceId, 'D1');
});

// Engine-only multi-candidate characterization. No doubles product/UI acceptance is claimed.
// Fixed different seeds exercise actual Showdown sampling. No hardcoded candidate order, no RNG stub,
// no demand that one particular seed pick a particular slot, and no statistical/distribution claim.
for (const seed of [[1, 2, 3, 4], [9, 8, 7, 6], [23, 45, 67, 89]]) {
  test('PICK actual multi-candidate source and observer-off RNG parity: ' + seed.join(','), { concurrency: false }, async () => {
    const donors = { A1: 'persimberry', D1: 'lumberry', D2: 'pechaberry' };
    const players = [{ name: 'Player', team: [
      set('U1', 'Meowth', 'Pickup', ['Splash', 'Fling', 'Surf'], '', 100),
      set('A1', 'Shuckle', 'Sturdy', ['Fling', 'Splash'], donors.A1, 5),
    ] }, { name: 'Trainer', team: [
      set('D1', 'Shuckle', 'Sturdy', ['Fling', 'Splash'], donors.D1, 5),
      set('D2', 'Shuckle', 'Sturdy', ['Fling', 'Splash'], donors.D2, 5),
    ] }];
    const actual = await gateway(players, false, seed, true, true), control = await gateway(players, false, seed, false, true);
    const own = 'move 1, move 1 1', foe = 'move 1 1, move 1 1';
    const receipt = await turn(actual, own, foe); await turn(control, own, foe); parity(actual, control);
    const state = inspect(actual), controlState = inspect(control);
    for (const [id, item] of Object.entries(donors)) {
      assert.equal(state.find(p => p.id === id).item, '');
      assert(receipt.some(e => e.type === '-enditem' && norm(e.args[1]) === item && e.args.some(a => String(a).includes('Fling'))), id + ' naturally consumes its initial item');
    }
    const selected = state.filter(p => Object.hasOwn(donors, p.id) && p.recycle === '');
    const selectedControl = controlState.filter(p => Object.hasOwn(donors, p.id) && p.recycle === '');
    assert.equal(selected.length, 1, 'only one actual source R is cleared');
    assert.deepEqual(selected, selectedControl, 'the chosen donor matches uninstrumented Showdown');
    const source = selected[0].id, item = donors[source];
    assert.equal(state.find(p => p.id === 'U1').item, item);
    for (const [id, original] of Object.entries(donors)) if (id !== source) assert.equal(state.find(p => p.id === id).recycle, original, 'unselected donors retain R');
    assert.equal(receipt.filter(e => e.type === '-item' && e.args.some(a => String(a).includes('ability: Pickup'))).length, 1);
    await turn(actual, 'move 2 1, move 2', 'move 2, move 2');
    await turn(control, 'move 2 1, move 2', 'move 2, move 2'); parity(actual, control);
    assert.equal(inspect(actual).find(p => p.id === 'U1').item, '');
    assert.equal(inspect(actual).find(p => p.id === 'U1').recycle, item, 'the picked item is naturally consumed by Fling');
    // Sturdy can preserve a full-health target once, so allow at most two ordinary Surf turns.
    for (let turns = 0; !actual.ended && turns < 2; turns++) {
      const ally = actual._debugBattle().sides[0].active[1];
      const foeActive = actual._debugBattle().sides[1].active;
      const ownChoice = 'move 3, ' + (ally && !ally.fainted ? 'move 2' : 'pass');
      const foeChoice = foeActive.map(p => p && !p.fainted ? 'move 2' : 'pass').join(', ');
      await turn(actual, ownChoice, foeChoice); await turn(control, ownChoice, foeChoice); parity(actual, control);
    }
    assert(actual.ended && control.ended, 'ordinary spread damage ends the engine-only scenario');
    const { facts, binding } = diagnosticFacts(actual, 'PICK-multi-' + seed.join('-'), 'a'.repeat(64));
    validateFacts(facts, binding, false);
    const pickup = facts.events.filter(e => e.id === 'U1' && e.reason === 'temporary-receive');
    assert.equal(pickup.length, 1); assert.equal(pickup[0].sourceId, source);
    assert.equal(pickup[0].after.current, item);
    const p = facts.members.find(m => m.id === 'U1');
    assert.deepEqual([p.current, p.recovery, p.recycle], ['', '', item]);
    const consumed = facts.events.find(e => e.id === 'U1' && e.reason === 'consume' && e.before.current === item);
    assert(consumed && consumed.ordinal > pickup[0].ordinal);
    for (const [id, original] of Object.entries(donors)) {
      const donor = facts.members.find(m => m.id === id);
      assert.deepEqual([donor.current, donor.recovery, donor.recycle], ['', '', id === source ? '' : original]);
    }
  });
}
