'use strict';
// Authored synthetic data + default production App/Gen8. Never reads or writes player saves or opens NW.
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const ROOT = process.env.N4_RUNTIME_ROOT || path.resolve(__dirname, '../../..');
const { E, T, inputs } = require(path.join(ROOT, 'experiments/step5/4/trainer-ai-integration/fixtures.cjs'));
const restrictions = [
  ['Unholdable', ['Unholdable'], 'none'], ['KeyItem', ['KeyItem'], 'none'],
  ['Mail', ['Mail'], 'none'], ['mixed-case', ['uNhOlDaBlE'], 'none'],
  ['TM flag', ['TM'], 'none'], ['HM flag', ['HM'], 'none'],
  ['TM use', [], 'tm'], ['HM use', [], 'hm'],
];
function restrict(item, flags, fieldUse) {
  Object.assign(item, { flags, fieldUse, ...(['tm', 'hm'].includes(fieldUse) ? { move: 'tackle' } : {}) });
}
function source() {
  const raw = inputs({ party: 1, moves: ['splash'] });
  raw.species.find(s => s.id === 'snorlax').learnset = ['trick', 'splash'].map(move => ({ level: 1, move }));
  return raw;
}
function assemble(raw = source()) {
  const compiled = E.contentCompile.compileContent(raw);
  assert.equal(compiled.ok, true, JSON.stringify(compiled.errors));
  const dex = E.dex.createDexLookup(), result = E.contentRuntime.assembleContent(compiled.data, dex);
  assert.deepEqual(result.errors, []);
  return { content: result.content, dex };
}
function fixture(supplied = assemble(), item = '') {
  const { content } = supplied, member = E.memberFactory.createMember({ id: 'P1', species: 'Snorlax', level: 50 }, content, () => 0);
  member.item = item;
  const game = E.state.newGame({ content, party: [E.speciesKey.toPersistentMember(member, content)], bag: { masterball: 2 }, money: 1000 });
  game.nextMemberOrdinal = '2';
  assert.deepEqual(E.saveSchema.validateGame(game), [], 'old held-item save remains structurally valid');
  let creates = 0;
  const state = T.fakes.createMemoryState(game), sessions = E.composition.createBattleSessionFactory({ content: () => content, seed: () => { creates++; return [1, 2, 3, 4]; } });
  const app = new E.app.GameApplication({ state, sessions, projection: T.fakes.createRecordingProjection(), content: () => supplied, random: () => 0, clock: () => 12345 }, { receivingProfile: { mode: 1, naming: 1 } });
  const request = { battleId: 'N4-policy', kind: 'wild', seq: 1, foes: [{ species: 'Pidgey', level: 5 }], canLose: true, expGain: false, moneyGain: false };
  return { app, state, content, request, creates: () => creates };
}
for (const [label, flags, fieldUse] of restrictions) {
  test(`N4 ${label}: compiler rejects forbidden grant and trainer items at their authored fields`, () => {
    for (const kind of ['grant', 'trainer']) {
      const raw = source(); restrict(raw.items.find(i => i.id === 'leftovers'), flags, fieldUse);
      if (kind === 'grant') raw.grants[0].members[0].item = 'leftovers';
      else raw.trainers[0].party[0].item = 'leftovers';
      const compiled = E.contentCompile.compileContent(raw);
      assert.equal(compiled.ok, false, `${kind} must not compile`);
      assert(compiled.errors.some(e => e.file === (kind === 'grant' ? 'grants.json' : 'trainers.json') && e.path.endsWith('.item') && /forbid holding/.test(e.message)), JSON.stringify(compiled.errors));
    }
  });
  test(`N4 ${label}: assembly independently rejects a stale compiled held source`, () => {
    for (const kind of ['grant', 'trainer']) {
      const raw = source();
      if (kind === 'grant') raw.grants[0].members[0].item = 'leftovers';
      else raw.trainers[0].party[0].item = 'leftovers';
      const compiled = E.contentCompile.compileContent(raw); assert.equal(compiled.ok, true);
      restrict(compiled.data.items.find(i => i.id === 'leftovers'), flags, fieldUse);
      const result = E.contentRuntime.assembleContent(compiled.data, E.dex.createDexLookup());
      assert(result.errors.length, `${kind} stale cache must be rejected`);
      assert(result.errors.some(e => /item/.test(e.path + e.message)), JSON.stringify(result.errors));
    }
  });
  test(`N4 ${label}: old held save refuses battle, remains intact, and can recover through Take`, async () => {
    const w = fixture(assemble(), 'leftovers');
    restrict(w.content.items.leftovers, flags, fieldUse);
    const before = structuredClone(w.state.read());
    await assert.rejects(w.app.startBattle(w.request), /unsupported battle held item leftovers/);
    assert.equal(w.creates(), 0, 'refuse before creating an engine session');
    assert.equal(w.app.saveBlocked, false, 'failed admission releases ownership');
    assert.deepEqual(w.state.read(), before); assert.equal(w.state.replaced.length, 0);
    const ref = { id: 'P1', position: { kind: 'party', index: 0 } }, token = w.app.beginManagement();
    assert.equal(w.app.manage(token, 'take-old-item', { kind: 'take-item', source: ref }).status, 'applied');
    w.app.endManagement(token);
    assert.equal(w.state.read().party[0].item, '');
    assert.equal(E.inventory.aggregateBag(w.state.read().inventory).leftovers, 1, 'old item preserved in bag');
    assert.equal(w.state.replaced.length, 1);
    const session = await w.app.startBattle(w.request);
    assert.equal((await session.throwBall('masterball')).ok, true);
    assert.equal(w.app.finishBattle(session, w.request).commit, 'applied', 'battle remains usable after Take');
    assert.equal(w.state.replaced.length, 2); assert.equal(w.app.saveBlocked, false);
  });
}
test('N4 default receipts still refuse an author-forbidden grant or gift without state writes', () => {
  const supplied = assemble(), w = fixture(supplied);
  supplied.content.grants.starter.members[0].item = 'leftovers';
  supplied.content.items.leftovers.flags = ['Unholdable'];
  const before = structuredClone(w.state.read());
  assert.equal(w.app.claimGrant('starter').reason, 'invalid-held-item');
  assert.equal(w.app.receiveGift({ kind: 'silent', member: { species: 'charmander', level: 5, item: 'leftovers' } }).reason, 'invalid-held-item');
  assert.equal(w.state.replaced.length, 0); assert.deepEqual(w.state.read(), before);
});
test('N4 runtime trainer source with changed author restrictions refuses before engine creation', async () => {
  const raw = source(); raw.trainers[0].party[0].item = 'leftovers';
  const w = fixture(assemble(raw)); w.content.items.leftovers.flags = ['Unholdable'];
  const before = structuredClone(w.state.read());
  await assert.rejects(w.app.startTrainerBattle({ battleId: 'N4-trainer', seq: 1, trainer: { id: 'c-basic', version: 1 }, canLose: true }), /unsupported battle held item leftovers/);
  assert.equal(w.creates(), 0); assert.equal(w.state.replaced.length, 0);
  assert.deepEqual(w.state.read(), before); assert.equal(w.app.saveBlocked, false);
});
test('N4 legal authored grant and trainer held sources still compile, assemble, receive and open battle', async () => {
  const raw = source(); raw.grants[0].members[0].item = 'leftovers'; raw.trainers[0].party[0].item = 'leftovers';
  const w = fixture(assemble(raw));
  assert.equal(w.app.claimGrant('starter').status, 'applied'); assert.equal(w.state.replaced.length, 1);
  const request = { battleId: 'N4-legal-trainer', seq: 1, trainer: { id: 'c-basic', version: 1 }, canLose: true };
  const session = await w.app.startTrainerBattle(request); assert(session); assert.equal(w.creates(), 1);
  w.app.abortBattle(request, Error('owned synthetic test cleanup')); assert.equal(w.app.saveBlocked, false);
});
for (const forbiddenAtFinish of [false, true]) test(`N4 actual Trick/capture retains conservation and terminal guard: forbidden=${forbiddenAtFinish}`, async () => {
  const w = fixture(assemble(), 'leftovers'), before = structuredClone(w.state.read());
  const session = await w.app.startBattle(w.request);
  assert.equal((await session.chooseMove(1)).ok, true); assert.equal((await session.throwBall('masterball')).ok, true);
  const raw = session.result(); assert.equal(raw.captured[0].item, 'leftovers', 'real engine temporary transfer reached capture');
  assert.equal(w.state.replaced.length, 0); assert.deepEqual(w.state.read(), before);
  if (forbiddenAtFinish) w.content.items.leftovers.flags = ['Unholdable'];
  const outcome = w.app.finishBattle(session, w.request);
  if (forbiddenAtFinish) {
    assert.equal(outcome.commit, 'none'); assert.equal(outcome.aborted, true); assert.match(outcome.error, /invalid-held-item/);
    assert.equal(w.state.replaced.length, 0); assert.deepEqual(w.state.read(), before);
  } else {
    assert.equal(outcome.commit, 'applied', JSON.stringify(outcome)); assert.equal(w.state.replaced.length, 1);
    const game = w.state.read(); assert.equal(game.party.find(m => m.id === 'P1').item, 'leftovers');
    assert.equal(game.party.find(m => m.id === raw.captured[0].id).item, '', 'capture cannot duplicate a player-owned temporary gift');
    assert.equal(E.inventory.aggregateBag(game.inventory).masterball, 1);
    assert.equal(w.app.commitResult(raw), 'already-applied'); assert.equal(w.state.replaced.length, 1);
  }
  assert.equal(w.app.saveBlocked, false);
});
test('N4 common descriptor preserves canonical/native support and author restrictions before native lookup', () => {
  let calls = 0;
  const catalog = E.itemCatalog.legacyCatalog(); catalog.leftovers.flags = ['Unholdable'];
  assert.equal(E.itemCatalog.heldItemDescriptor(catalog, 'leftovers', () => { calls++; throw Error('forbidden external read'); }), null);
  assert.equal(calls, 0);
  catalog.leftovers.flags = [];
  const dex = E.dex.createDexLookup();
  assert(E.itemCatalog.heldItemDescriptor(catalog, 'leftovers', id => dex.heldItem(id)));
  for (const id of ['Leftovers', 'left-overs', 'notarealitem', 'airmail']) assert.equal(E.itemCatalog.heldItemDescriptor(catalog, id, ref => dex.heldItem(ref)), null, id);
});
