'use strict';
// Prepared from product 2567317; validated after integration on the Sticky Barb candidate.
// Real single-battle behavior and RPG restoration; no old suppression-only rule is imposed.
// Pinned Showdown removes the item with takeItem; this is not a suppression-only test.
// Source: smogon/pokemon-showdown@7244fe8e28fa8bc4d0809ae30d183c608b62bb2b,
// data/moves.ts: corrosivegas; data/mods/gen8/moves.ts inherits that implementation.
// Author-provided learnsets are synthetic, not original-runtime equivalence evidence.
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
const MOVES = ['splash', 'protect', 'psychic'];
assert.equal(fs.readFileSync(path.join(root, 'js/engine/showdown/SOURCE_SHA'), 'utf8').trim(), SHA);

function assemble(c) {
  const source = path.join(root, 'content/sample');
  const input = Object.fromEntries(['manifest', 'sources', 'species', 'overlays', 'grants', 'regional-dex', 'settings', 'map-metadata']
    .filter(name => fs.existsSync(path.join(source, name + '.json')))
    .map(name => [name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), JSON.parse(fs.readFileSync(path.join(source, name + '.json'), 'utf8'))]));
  for (const [id, moves] of [[c.species, MOVES], ['caterpie', ['corrosivegas']]]) {
    let species = input.species.find(s => s.id === id);
    if (!species) {
      species = { id, showdownId: id, nameKey: 'species.' + id, growth: 'medium', baseExp: 50, evYield: {}, catchRate: 45, source: 'author-placeholder' };
      input.species.push(species);
    }
    species.learnset = moves.map(move => ({ level: 1, move }));
  }
  input.items = Object.values(E.itemCatalog.legacyCatalog()).map(item => ({ ...item, source: 'author-placeholder' }));
  if (!input.items.some(item => item.id === 'leftovers')) input.items.push({ id: 'leftovers', name: 'Leftovers', namePlural: 'Leftovers', pocket: 1, price: 0, source: 'author-placeholder' });
  input.trainerTypes = [{ id: 'gas-check', nameKey: 'trainer.gas', gender: 0, baseMoney: 0, skillLevel: 0, flags: [], items: [], source: 'author-placeholder' }];
  input.trainers = [{ id: 'gas-foe', type: 'gas-check', name: 'Gas Check', version: 1, source: 'author-placeholder', party: [{ species: 'caterpie', level: 5, moves: ['corrosivegas'] }] }];
  const compiled = E.contentCompile.compileContent(input);
  assert(compiled.ok, JSON.stringify(compiled.errors));
  const dex = E.dex.createDexLookup(), assembled = E.contentRuntime.assembleContent(compiled.data, dex);
  assert.deepEqual(assembled.errors, []);
  return { content: assembled.content, dex };
}

async function open(c) {
  const supplied = assemble(c), content = supplied.content;
  const member = E.memberFactory.createMember({ id: 'G1', species: c.species === 'grimer' ? 'Grimer' : 'Snorlax', level: 50, abilityIndex: c.abilityIndex }, content, () => 0);
  assert.equal(member.ability, c.ability, 'the ability comes from a native species slot');
  assert.deepEqual(member.moves.map(m => m.id), MOVES);
  member.item = c.item;
  const game = E.state.newGame({ content, party: [E.speciesKey.toPersistentMember(member, content)], money: 1000 });
  game.nextMemberOrdinal = '2';
  const state = T.fakes.createMemoryState(game), initial = clone(state.read());
  const factory = E.composition.createBattleSessionFactory({ content: () => content, seed: () => [...SEED] });
  const app = new E.app.GameApplication({ state, projection: T.fakes.createRecordingProjection(), sessions: factory, content: () => supplied, random: () => 0, clock: () => 12345 },
    { capabilities: { allowHeldItemSources: true, allowExperimentalHeldItemBattle: true }, receivingProfile: { mode: 1, naming: 1 } });
  const request = { battleId: c.id, seq: 1, canLose: true, expGain: false, moneyGain: false,
    ...(c.kind === 'trainer' ? { trainer: { id: 'gas-foe', version: 1 } } : { kind: 'wild', foes: [{ species: 'caterpie', level: 5 }] }) };
  const session = c.kind === 'trainer' ? await app.startTrainerBattle(request) : await app.startBattle(request);
  session.take();
  return { app, session, state, initial, request, trace: [] };
}

function inspect(w) {
  // Read-only engine observations do not grant settlement authority to these copies.
  const b = w.session.gw._debugBattle(), p = b.sides[0].pokemon[0], f = b.sides[1].pokemon[0];
  return { player: { id: p.set.name, item: p.item, recycle: p.lastItem }, foeId: f.set.name,
    p1: clone(w.session.gw.readState('p1')[0]), p2: clone(w.session.gw.readState('p2')[0]) };
}
function unchanged(w) {
  assert.equal(w.state.replaced.length, 0);
  assert.deepEqual(w.state.read(), w.initial, 'the complete persistent state remains unchanged before finish');
}
async function move(w, id) {
  unchanged(w);
  const before = inspect(w), result = await w.session.chooseMove(MOVES.indexOf(id) + 1), after = inspect(w);
  assert(result.ok, JSON.stringify(result));
  unchanged(w);
  assert.equal(after.p1.pp[id], before.p1.pp[id] - 1, 'the actual player move spends one PP');
  const row = { id, before, after, events: clone(events(result.messages)) };
  w.trace.push(row);
  return row;
}

const cases = [
  { id: 'GAS01', kind: 'trainer', species: 'snorlax', abilityIndex: 0, ability: 'Immunity', item: 'leftovers', removed: true },
  { id: 'GAS02', kind: 'wild', species: 'snorlax', abilityIndex: 0, ability: 'Immunity', item: 'leftovers', removed: true },
  { id: 'GAS03', kind: 'trainer', species: 'snorlax', abilityIndex: 0, ability: 'Immunity', item: 'leftovers', removed: false, protect: true },
  { id: 'GAS04', kind: 'trainer', species: 'grimer', abilityIndex: 1, ability: 'Sticky Hold', item: 'leftovers', removed: false },
  { id: 'GAS05', kind: 'trainer', species: 'snorlax', abilityIndex: 0, ability: 'Immunity', item: '', removed: false },
];

for (const c of cases) test(c.id + ' actual ' + c.kind + ' Corrosive Gas and authenticated restoration', { concurrency: false }, async () => {
  let w;
  try {
    w = await open(c);
    const first = await move(w, c.protect ? 'protect' : 'splash');
    assert.equal(first.after.p2.pp.corrosivegas, first.before.p2.pp.corrosivegas - 1, 'the foe makes a real Gas attempt');
    assert.equal(first.after.player.item, c.removed ? '' : c.item, 'Gas physically removes C, unless blocked or there is no item');
    assert.equal(first.after.player.recycle, '', 'Gas does not consume the item or create a recycle record');
    const gas = first.events.filter(e => e.type === '-enditem' && norm(e.args[1]) === 'leftovers' && e.args.some(a => String(a).includes('move: Corrosive Gas')));
    assert.equal(gas.length, c.removed ? 1 : 0);
    if (c.removed) {
      const repeated = await move(w, 'splash');
      assert.equal(repeated.after.p2.pp.corrosivegas, repeated.before.p2.pp.corrosivegas - 1);
      assert.equal(repeated.after.player.item, '');
      assert(repeated.events.some(e => e.type === '-fail' && e.args.some(a => String(a).includes('Corrosive Gas'))), 'a second real Gas attempt fails on the empty slot');
      assert(!repeated.events.some(e => e.type === '-enditem'));
    } else if (c.protect) {
      assert(first.events.some(e => e.type === '-activate' && e.args.some(a => String(a).includes('Protect'))));
    } else {
      assert(first.events.some(e => e.type === '-fail' && e.args.some(a => String(a).includes('Corrosive Gas'))));
    }
    const last = await move(w, 'psychic');
    assert(w.session.finished && w.session.gw.ended, 'an ordinary Psychic KO ends the battle');
    assert.equal(last.after.p2.hp, 0);
    const raw = w.session.result();
    assert.deepEqual(raw.outcome, { kind: 'win', winner: 'Player' });
    const lineage = T.heldDiagnostics.gatewaySettlementLineage(w.session.gw);
    assert(lineage);
    const binding = { battleId: raw.battleId, generation: 0, rawHash: E.state.resultHash(raw), contentIdentity: 'b'.repeat(64) };
    const facts = T.heldDiagnostics.gatewaySettlementFacts(w.session.gw, lineage, binding);
    const player = facts.members.find(m => m.id === 'G1');
    assert(player);
    assert.deepEqual([player.current, player.recovery, player.recycle], [c.removed ? '' : c.item, c.item, '']);
    const journal = facts.events.filter(e => e.id === 'G1');
    assert.equal(journal.length, c.removed ? 1 : 0, 'failure and repeat attempts add no item mutation');
    if (c.removed) {
      assert.equal(journal[0].reason, 'temporary-remove');
      assert.equal(journal[0].sourceId, first.after.foeId, 'the source is the real Gas user');
    }
    const roster = facts.members.map(({ id, side, initial }) => ({ id, side, initial }));
    assert.equal(E.heldFacts.resolveRequiredFacts(facts, { binding, roster, wild: c.kind === 'wild' }).ok, true);
    unchanged(w);
    const outcome = w.app.finishBattle(w.session, w.request);
    assert.equal(outcome.commit, 'applied', JSON.stringify(outcome));
    assert.equal(w.state.replaced.length, 1);
    assert.equal(w.state.read().party[0].item, c.item, 'terminal party writeback restores I, although live C was actually removed');
    assert.match(w.state.read().appliedBattles[raw.battleId].settlement.pairHash, /^[a-f0-9]{64}$/);
    const installed = clone(w.state.read());
    assert.equal(w.app.finishBattle(w.session, w.request).commit, 'already-applied');
    assert.equal(w.app.commitResult(raw), 'already-applied');
    assert.equal(w.state.replaced.length, 1);
    assert.deepEqual(w.state.read(), installed);
  } finally {
    if (w && !w.session.finished) w.app.abortBattle(w.request, Error('Corrosive Gas test cleanup'));
  }
});
