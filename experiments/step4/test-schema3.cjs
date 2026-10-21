'use strict';
// Step 4 / A: schema 3 adds the claims ledger (one-time grants). The migration chain 1 -> 2 -> 3 keeps every older
// guarantee, newer versions are still refused, and the stage capacities never delete what an existing save holds.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../js/engine/build/engine.cjs');
const { migrateGame, validateGame, SUPPORTED_SCHEMAS } = E.saveSchema;
const S = E.state;
const F = E.fixtures;
const clone = x => JSON.parse(JSON.stringify(x));
const v1 = () => clone(require('../step3/fixtures/legacy-v1-flow-state.json'));
const asV2 = () => { const g = clone(F.makeGame()); g.schema = 2; delete g.claims; return g; };

test('schema 3 is current: a new game has an empty claims ledger and validates', () => {
  assert.equal(S.GAME_SCHEMA, 3); assert.deepEqual(SUPPORTED_SCHEMAS, [1, 2, 3]);
  const g = S.newGame({ party: [] });
  assert.deepEqual([g.schema, g.claims, g.party, g.boxes, g.bag, g.money], [3, {}, [], [], {}, 0]);
  assert.deepEqual(validateGame(g), []);
});

test('2 -> 3 adds an empty claims ledger and nothing else; the input is not touched', () => {
  const raw = asV2(), pristine = clone(raw);
  const r = migrateGame(raw);
  assert.equal(r.ok, true); assert.deepEqual([r.from, r.to, r.migrated], [2, 3, true]);
  assert.deepEqual(raw, pristine);
  assert.deepEqual(S.diffPaths(raw, r.state).sort(), ['claims', 'schema']);
  assert.deepEqual(r.state.claims, {});
  assert.match(r.notes.join('|'), /claims ledger/);
});

test('1 -> 2 -> 3 runs as one chain from the real step 2 state', () => {
  const r = migrateGame(v1());
  assert.equal(r.ok, true); assert.deepEqual([r.from, r.to], [1, 3]); assert.deepEqual(r.state.claims, {});
  assert.deepEqual(validateGame(r.state), []);
});

test('a newer schema is still refused with nothing changed; 3 without claims, or a malformed claim, is invalid', () => {
  for (const schema of [4, 9]) { const r = migrateGame({ ...clone(F.makeGame()), schema }); assert.equal(r.ok, false); assert.equal(r.error.code, 'unknown-version'); assert.match(r.error.message, /Nothing was changed/); }
  const noClaims = clone(F.makeGame()); delete noClaims.claims;
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
  const g = clone(F.makeGame()); g.bag.potion = 5000; g.money = 2000000; // above the stage caps (e.g. written by an earlier build)
  for (let i = 0; i < 3; i++) g.boxes.push({ ...clone(g.party[0]), id: `BX-${i}` });
  assert.deepEqual(validateGame(g), [], 'over-cap amounts are not structural errors: nothing is deleted on load');
  const r = migrateGame(g); assert.equal(r.ok, true); assert.equal(r.state.bag.potion, 5000); assert.equal(r.state.money, 2000000);
});
