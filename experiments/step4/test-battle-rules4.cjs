'use strict';
// Step 4 / B, core rules: wild encounter selection (WP36 5.1), defeat settlement (WP42 6.1 money loss, WP61 7.2 full
// heal) and the capacity backstop of applyBattleResult (D1: a capture never lands outside party/boxes and is never
// dropped). Verification: spec-driven vectors and invariants; no reference (Ruby) run exists for these modules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../../js/engine/build/engine.cjs');
const { pickEncounter, validateEncounterTable, appliesAt } = E.encounter;
const { defeatMoneyLoss, settleDefeat, isDefeat, BADGE_FACTORS } = E.defeat;
const S = E.state;
const clone = x => JSON.parse(JSON.stringify(x));

const SRC = path.resolve(__dirname, '../../content/sample');
const read = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const content = E.contentRuntime.assembleContent(E.contentCompile.compileContent({ manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json'), grants: read('grants.json') }).data, E.dex.createDexLookup()).content;
function scripted(values) { const calls = []; const f = n => { const v = values.length ? values.shift() : 0; calls.push([n, v]); return v; }; f.calls = calls; return f; }
function lcg(seed) { let s = seed >>> 0; return n => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return Math.floor((s / 4294967296) * n); }; }

const TABLE = { regions: [1], slots: [{ species: 'caterpie', weight: 40, minLevel: 2, maxLevel: 4 }, { species: 'pidgey', weight: 60, minLevel: 2, maxLevel: 4 }] };

test('encounter selection (WP36 5.1): slots by weight descending, one roll walked down, level uniform in the range', () => {
  // sorted: pidgey 60, caterpie 40; roll 0..59 -> pidgey, 60..99 -> caterpie
  for (const [roll, lv, want] of [[0, 0, ['pidgey', 2]], [59, 2, ['pidgey', 4]], [60, 1, ['caterpie', 3]], [99, 0, ['caterpie', 2]]]) {
    const r = scripted([roll, lv]);
    const got = pickEncounter(TABLE, r);
    assert.deepEqual([got.species, got.level], want, `roll ${roll}`);
    assert.deepEqual(r.calls.map(c => c[0]), [100, 3], 'one roll over the total weight, one level draw over max-min+1');
  }
  const tie = { regions: [], slots: [{ species: 'a', weight: 5, minLevel: 1, maxLevel: 1 }, { species: 'b', weight: 5, minLevel: 1, maxLevel: 1 }] };
  assert.equal(pickEncounter(tie, scripted([0, 0])).species, 'a', 'equal weights keep the written order');
  const counts = { pidgey: 0, caterpie: 0 }; const rnd = lcg(5);
  for (let i = 0; i < 4000; i++) { const e = pickEncounter(TABLE, rnd); counts[e.species]++; assert.ok(e.level >= 2 && e.level <= 4); }
  assert.ok(counts.pidgey > 2200 && counts.pidgey < 2600, JSON.stringify(counts));
  assert.throws(() => pickEncounter(TABLE, () => 100), /random\(100\) returned 100/);
});

test('encounter tables: regions decide where a table applies; malformed tables are refused with the location', () => {
  assert.equal(appliesAt(TABLE, 1), true); assert.equal(appliesAt(TABLE, 0), false); assert.equal(appliesAt(TABLE, 2), false);
  assert.equal(appliesAt({ ...TABLE, regions: [] }, 7), true, 'no regions = the whole map');
  assert.deepEqual(validateEncounterTable(TABLE).problems, []);
  for (const [raw, where] of [
    [null, '$'], [{ regions: [1], slots: [] }, '$.slots'], [{ regions: ['x'], slots: TABLE.slots }, '$.regions'],
    [{ regions: [], slots: [{ species: 'pidgey', weight: 0, minLevel: 2, maxLevel: 4 }] }, '$.slots[0].weight'],
    [{ regions: [], slots: [{ species: 'pidgey', weight: 5, minLevel: 5, maxLevel: 4 }] }, '$.slots[0].level'],
    [{ regions: [], slots: [{ species: '', weight: 5, minLevel: 1, maxLevel: 4 }] }, '$.slots[0].species'],
  ]) {
    const r = validateEncounterTable(raw);
    assert.equal(r.table, null); assert.ok(r.problems.some(p => p.path === where), `${JSON.stringify(raw)} -> ${JSON.stringify(r.problems)}`);
  }
});

const member = (id, species, level, extra = {}) => ({ ...E.memberFactory.createMember({ id, species, level }, content, lcg(level)), ...extra });
const gameWith = (party, money) => { const g = S.newGame({ party: [] }); g.party = party; g.money = money; return g; };

test('defeat money loss (WP42 6.1): highest party level x badge factor, at most the balance; badges 0 in this build', () => {
  assert.deepEqual(BADGE_FACTORS, [8, 16, 24, 36, 48, 64, 80, 100, 120]);
  const g = gameWith([member('A', 'Charmander', 7), member('B', 'Caterpie', 12, { hp: 0 })], 3000);
  assert.equal(defeatMoneyLoss(g), 96, 'a fainted member still counts for the highest level (12 x 8)');
  assert.equal(defeatMoneyLoss(g, { badges: 2 }), 12 * 24); assert.equal(defeatMoneyLoss(g, { badges: 20 }), 12 * 120, 'beyond the table: last factor');
  assert.equal(defeatMoneyLoss({ ...g, money: 50 }), 50, 'never more than the balance');
  assert.equal(defeatMoneyLoss(g, { noMoneyLoss: true }), 0, 'NO_MONEY_LOSS');
  assert.equal(defeatMoneyLoss(gameWith([], 3000)), 0);
});

test('defeat settlement: money loss then a full party heal in one new state; the input is not touched', () => {
  const g = gameWith([member('A', 'Charmander', 7, { hp: 0, status: '' }), member('B', 'Caterpie', 3, { hp: 2, status: 'psn' })], 3000);
  g.party[0].moves[0].pp = 0;
  const before = clone(g);
  const r = settleDefeat(g, content);
  assert.deepEqual(g, before);
  assert.equal(r.moneyLost, 56); assert.equal(r.state.money, 3000 - 56);
  for (const m of r.state.party) { assert.equal(m.status, ''); assert.ok(m.hp > 0); assert.deepEqual(m.moves.map(x => x.pp), m.moves.map(x => x.maxpp)); }
  assert.deepEqual(S.diffPaths(g, r.state).filter(p => !p.startsWith('party.')), ['money']);
});

test('isDefeat: a lost or drawn battle (code 4 outcomes), never a win, run or capture', () => {
  const o = (kind, winner) => ({ outcome: { kind, winner } });
  assert.deepEqual([o('win', 'Wild'), o('win', 'Trainer'), o('tie', null), o('win', 'Player'), o('run', null), o('caught', null)].map(isDefeat), [true, true, true, false, false, false]);
});

// ---- applyBattleResult capacity backstop
const caughtResult = (id, battleId = 'cap#1') => ({ protocol: 1, battleId, outcome: { kind: 'caught', winner: null, target: id, ball: 'pokeball' }, members: {}, bag: { pokeball: -1 }, captured: [member(id, 'Pidgey', 3)], dex: { seen: ['Pidgey'], owned: ['Pidgey'] } });

test('a capture goes to the party, then to the boxes; with both full the whole result is refused, nothing dropped or half-applied', () => {
  const L = { ...E.limits.DEFAULT_LIMITS, boxes: 1 };
  const g = gameWith(Array.from({ length: 6 }, (_, i) => member(`P${i}`, 'Caterpie', 2)), 0); g.bag = { pokeball: 3 };
  const one = S.applyBattleResult(g, caughtResult('W1-1'), L);
  assert.deepEqual([one.state.party.length, one.state.boxes.map(m => m.id)], [6, ['W1-1']]);
  const before = clone(one.state);
  assert.throws(() => S.applyBattleResult(one.state, caughtResult('W2-1', 'cap#2'), L), /no room for captured member W2-1: the party \(6\) and the boxes \(1\) are full/);
  assert.deepEqual(one.state, before, 'the bag, dex and ledger are untouched as well');
  assert.equal(S.applyBattleResult(g, caughtResult('W1-1'), L).status, 'applied', 'the default limits apply when none are given');
});

test('a result may not raise a bag item above the per-item cap (an amount already above it is kept, results only spend)', () => {
  const g = gameWith([member('A', 'Charmander', 5)], 0); g.bag = { potion: 999 };
  const plus = { protocol: 1, battleId: 'bag#1', outcome: { kind: 'run', winner: null }, members: {}, bag: { potion: 1 }, captured: [], dex: { seen: [], owned: [] } };
  assert.throws(() => S.applyBattleResult(g, plus), /potion would be 1000, above the stage cap of 999/);
  const over = clone(g); over.bag.potion = 5000;
  const spend = { ...plus, battleId: 'bag#2', bag: { potion: -1 } };
  assert.equal(S.applyBattleResult(over, spend).state.bag.potion, 4999);
});
