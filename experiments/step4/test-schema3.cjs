'use strict';
const I6 = require("../step5/2/test-support.cjs");
// Step 4 / A: schema 3 adds the claims ledger (one-time grants). The migration chain 1 -> 2 -> 3 keeps every older
// guarantee, newer versions are still refused, and the stage capacities never delete what an existing save holds.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../js/engine/build/engine.cjs');
const H = require('../step5/1/legacy-test-support.cjs');
const { validateGame, SUPPORTED_SCHEMAS } = E.saveSchema;
// The chain reaches schema 7; 3→4 needs species mapping and the current target requires validated content/layout. These states
// come from the step 2 fixture world, whose content ids are the Showdown names (the identity mapping).
const migrateGame = raw => E.saveSchema.migrateGame(raw, { speciesKey: E.speciesKey.identityKeys, content: E.fixtures.content });
const S = E.state;
const F = E.fixtures;
const clone = x => JSON.parse(JSON.stringify(x));
const v1 = () => clone(require('../step3/fixtures/legacy-v1-flow-state.json'));
// a schema 2 document has none of what schemas 3 and 4 added (claims; statistics, step counter, form)
const asV2 = () => H.legacyGame(F.makeGame(), 2);

test('schema 3 added the claims ledger (current schema retains it): a new game has an empty one and validates', () => {
  assert.deepEqual(SUPPORTED_SCHEMAS, Array.from({ length: S.GAME_SCHEMA }, (_, i) => i + 1));
  const g = S.newGame({ party: [], content: F.content });
  assert.deepEqual([g.schema, g.claims, g.party, E.storage.boxedMembers(g), I6.bagOf(g), g.money], [S.GAME_SCHEMA, {}, [], [], {}, 0]);
  assert.deepEqual(validateGame(g), []);
});

test('2 -> 3 adds an empty claims ledger and nothing else (3 -> 4 then adds its own fields); the input is not touched', () => {
  const raw = asV2(), pristine = clone(raw);
  const r = migrateGame(raw);
  assert.equal(r.ok, true); assert.deepEqual([r.from, r.to, r.migrated], [2, S.GAME_SCHEMA, true]);
  assert.deepEqual(raw, pristine);
  const by4 = ['stats', 'steps', ...raw.party.map((_, i) => `party.${i}.form`)];
  assert.deepEqual(S.diffPaths(raw, H.legacyGame(r.state, 4)).sort(), ['claims', 'schema', ...by4].sort());
  assert.deepEqual(r.state.claims, {});
  assert.match(r.notes.join('|'), /claims ledger/);
});

test('1 -> 2 -> 3 (-> 4) runs as one chain from the real step 2 state', () => {
  const r = migrateGame(v1());
  assert.equal(r.ok, true); assert.deepEqual([r.from, r.to], [1, S.GAME_SCHEMA]); assert.deepEqual(r.state.claims, {});
  assert.deepEqual(validateGame(r.state), []);
});

test('a newer schema is still refused with nothing changed; 3 without claims, or a malformed claim, is invalid', () => {
  for (const schema of [S.GAME_SCHEMA + 1, S.GAME_SCHEMA + 2]) { const r = migrateGame({ ...clone(F.makeGame()), schema }); assert.equal(r.ok, false); assert.equal(r.error.code, 'unknown-version'); assert.match(r.error.message, /Nothing was changed/); }
  const noClaims = clone(F.makeGame()); delete noClaims.claims; // (schema 4 keeps the claims ledger of schema 3)
  assert.ok(validateGame(noClaims).some(p => p.path === '$.claims'));
  for (const [claims, re] of [[[], /must be an object/], [{ starter: true }, /\{kind/], [{ starter: { kind: 'other' } }, /\{kind/], [{ 'bad key!': { kind: 'grant' } }, /claim id/]]) {
    const g = clone(F.makeGame()); g.claims = claims;
    const problems = validateGame(g);
    assert.ok(problems.some(p => p.path.startsWith('$.claims') && re.test(p.message)), JSON.stringify(problems));
  }
  const ok = clone(F.makeGame()); ok.claims = { starter: { kind: 'grant' } }; assert.deepEqual(validateGame(ok), []);
});

test('a result is still applied only to the current schema, and keeps the claims ledger as it was', () => {
  assert.throws(() => S.applyBattleResult(asV2(), { protocol: 1, battleId: 'x', outcome: { kind: 'run', winner: null }, members: {}, bag: {}, captured: [], dex: { seen: [], owned: [] } }), /schema 2.*migrate it first/);
  const g = clone(F.makeGame()); g.claims = { starter: { kind: 'grant' } };
  const r = S.applyBattleResult(g, { protocol: 1, battleId: 'x', outcome: { kind: 'run', winner: null }, members: {}, bag: {}, captured: [], dex: { seen: [], owned: [] } });
  assert.deepEqual(r.state.claims, { starter: { kind: 'grant' } });
});

test('stage capacities are configuration, and an existing save above them still loads unchanged', () => {
  const L = E.limits;
  assert.deepEqual([L.DEFAULT_LIMITS.party, L.DEFAULT_LIMITS.boxes, L.DEFAULT_LIMITS.bagPerItem, L.DEFAULT_LIMITS.money], [6, 1200, 999, 999999]);
  const g = clone(F.makeGame()); I6.setItemCount(g, "potion", 5000); g.money = 2000000; // above the stage caps (e.g. written by an earlier build)
  for (let i = 0; i < 3; i++) E.storage.placeInBox(g.storage, { ...clone(g.party[0]), id: `BX-${i}` });
  assert.deepEqual(validateGame(g), [], 'over-cap amounts are not structural errors: nothing is deleted on load');
  const r = migrateGame(g); assert.equal(r.ok, true); assert.equal(I6.bagOf(r.state).potion, 5000); assert.equal(r.state.money, 2000000);
});
