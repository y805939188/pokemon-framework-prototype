'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const H = require('./fixtures/c-rules-support.cjs');
let R;
test.before(async () => { R = await H.loadRule('encounter-selection'); });
const options = extra => ({ party: [H.lead()], moreAbilities: true, registeredTypes: ['Fire', 'Grass', 'Water', 'Electric', 'Steel'], speciesTypes: { a: ['Steel'], b: ['Normal'], c: ['Fire'] }, local: H.noLevels(), ...extra });

test('T21 timed types have all hour boundaries, subtype/day/base fallback and no random source', () => {
  const tables = Object.fromEntries(['Land', 'LandMorning', 'LandDay', 'LandAfternoon', 'LandEvening', 'LandNight'].map(key => [key, H.table()]));
  for (const [hour, wanted] of [[0, 'LandNight'], [4, 'LandNight'], [5, 'LandMorning'], [9, 'LandMorning'], [10, 'LandDay'], [13, 'LandDay'], [14, 'LandAfternoon'], [16, 'LandAfternoon'], [17, 'LandEvening'], [19, 'LandEvening'], [20, 'LandNight'], [23, 'LandNight']]) assert.equal(R.selectTimedEncounterType(tables, 'Land', hour), wanted);
  delete tables.LandMorning; assert.equal(R.selectTimedEncounterType(tables, 'Land', 5), 'LandDay');
  delete tables.LandDay; assert.equal(R.selectTimedEncounterType(tables, 'Land', 5), 'Land');
  delete tables.LandNight; assert.equal(R.selectTimedEncounterType(tables, 'Land', 20), 'Land');
  assert.equal(R.selectTimedEncounterType({}, 'Land', 20), null);
  assert.equal(R.selectTimedEncounterType(Object.create({ Land: H.table() }), 'Land', 12), null);
  for (const hour of [-1, 24, 5.5, NaN]) assert.throws(() => R.selectTimedEncounterType(tables, 'Land', hour), /hour/);
});

test('T21 ordinary type chooses water on Surf, otherwise eligible land then cave', () => {
  const tables = { Land: H.table(), Cave: H.table(5), Water: H.table(2) };
  assert.equal(R.selectOrdinaryEncounterType(tables, { surfing: true, landAllowed: true, hour: 12 }), 'Water');
  assert.equal(R.selectOrdinaryEncounterType(tables, { surfing: false, landAllowed: true, hour: 12 }), 'Land');
  assert.equal(R.selectOrdinaryEncounterType(tables, { surfing: false, landAllowed: false, hour: 12 }), 'Cave');
  assert.equal(R.selectOrdinaryEncounterType({ Cave: H.table(5) }, { surfing: true, landAllowed: true, hour: 12 }), null);
  assert.equal(R.selectOrdinaryEncounterType({ Land: H.table(21, []) }, { surfing: false, landAllowed: true, hour: 12 }), null);
});

test('T08 empty candidates draw nothing; weighted slot then even a fixed level consumes its own draw', () => {
  assert.equal(R.selectEncounterCandidate(undefined, options(), H.scripted([])), null);
  assert.equal(R.selectEncounterCandidate(H.table(21, []), options(), H.scripted([])), null);
  const rng = H.scripted([99, 0]);
  assert.deepEqual(R.selectEncounterCandidate(H.table(), options(), rng), { species: 'a', level: 5 });
  assert.deepEqual(rng.calls, [[100, 99], [1, 0]]);
});

test('T21 weighted order descends and preserves the compiler tie order without mutating its snapshot', () => {
  const slots = [H.slot('c', 10), H.slot('b', 20), H.slot('a', 20)], original = JSON.stringify(slots);
  const table = H.table(21, slots);
  assert.equal(R.selectEncounterCandidate(table, options(), H.scripted([0, 0])).species, 'b');
  assert.equal(R.selectEncounterCandidate(table, options(), H.scripted([20, 0])).species, 'a');
  assert.equal(R.selectEncounterCandidate(table, options(), H.scripted([40, 0])).species, 'c');
  assert.equal(JSON.stringify(slots), original);
});

test('T21 exact max-of-three enumeration matches an independent terminal-slot event', () => {
  const table = H.table(21, [H.slot('a', 7), H.slot('b', 2), H.slot('c', 1)]);
  let count = 0;
  for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) for (let c = 0; c < 10; c++) {
    const rng = H.scripted([a, b, c, 0]), result = R.selectEncounterCandidate(table, options({ rolls: 3 }), rng);
    assert.equal(result.species === 'c', a === 9 || b === 9 || c === 9);
    assert.deepEqual(rng.calls.map(call => call[0]), [10, 10, 10, 1]);
    count += Number(result.species === 'c');
  }
  assert.equal(count, 271);
});

test('T21 preference eligibility, config, type registration and empty filtering have precise prefixes', () => {
  const table = H.table(21, [H.slot('a', 50), H.slot('b', 50)]);
  for (const ability of ['Magnet Pull', 'Static']) {
    const speciesTypes = { a: ['Steel', 'Electric'], b: ['Normal'] };
    const rng = H.scripted([49, 49, 0]);
    assert.equal(R.selectEncounterCandidate(table, options({ party: [H.lead({ isEgg: true, ability: '' }), H.lead({ hp: 0, ability })], speciesTypes, moreAbilities: false }), rng).species, 'a');
    assert.deepEqual(rng.calls.map(call => call[0]), [100, 50, 1]);
  }
  for (const [ability, type] of [['Flash Fire', 'Fire'], ['Harvest', 'Grass'], ['Lightning Rod', 'Electric'], ['Storm Drain', 'Water']]) {
    const speciesTypes = { a: [type], b: ['Normal'] }, party = [H.lead({ ability })];
    assert.equal(R.selectEncounterCandidate(table, options({ party, speciesTypes }), H.scripted([0, 49, 0])).species, 'a');
    const off = H.scripted([99, 0]);
    assert.equal(R.selectEncounterCandidate(table, options({ party, speciesTypes, moreAbilities: false }), off).species, 'b');
    assert.deepEqual(off.calls.map(call => call[0]), [100, 1]);
    assert.equal(R.selectEncounterCandidate(table, options({ party, speciesTypes, registeredTypes: [] }), H.scripted([99, 0])).species, 'b');
  }
  const party = [H.lead({ ability: 'Magnet Pull' })];
  const empty = H.scripted([0, 99, 0]);
  assert.equal(R.selectEncounterCandidate(table, options({ party, speciesTypes: { a: ['Normal'], b: ['Normal'] } }), empty).species, 'b');
  assert.deepEqual(empty.calls.map(call => call[0]), [100, 100, 1]);
  assert.equal(R.selectEncounterCandidate(table, options({ party }), H.scripted([50, 99, 0])).species, 'b');
  assert.throws(() => R.selectEncounterCandidate(table, options({ party, speciesTypes: {} }), H.scripted([0])), /types unavailable/);
});

test('T21 exhaustive preference gate yields 75% final preferred species in the equal-weight fixture', () => {
  const table = H.table(21, [H.slot('a', 50), H.slot('b', 50)]), o = options({ party: [H.lead({ ability: 'Magnet Pull' })] });
  let hits = 0;
  for (let percent = 0; percent < 100; percent++) for (let quantile = 0; quantile < 100; quantile++) {
    hits += Number(R.selectEncounterCandidate(table, o, H.scripted([percent, percent < 50 ? Math.floor(quantile / 2) : quantile, 0])).species === 'a');
  }
  assert.equal(hits, 7500);
});

test('T21 base level precedes only Hustle/Pressure/Vital Spirit percentage; Guts never draws it', () => {
  const slot = H.slot('a', 100, 5, 8);
  for (const ability of ['Hustle', 'Pressure', 'Vital Spirit']) {
    assert.equal(R.selectEncounterLevel(slot, [H.lead({ ability })], H.noLevels(), H.scripted([0, 49])), 8);
    assert.equal(R.selectEncounterLevel(slot, [H.lead({ ability })], H.noLevels(), H.scripted([0, 50])), 5);
  }
  const rng = H.scripted([0]);
  assert.equal(R.selectEncounterLevel(slot, [H.lead({ ability: 'Guts' })], H.noLevels(), rng), 5);
  assert.deepEqual(rng.calls, [[4, 0]]);
  let maximum = 0;
  for (let base = 0; base < 4; base++) for (let percent = 0; percent < 100; percent++) maximum += Number(R.selectEncounterLevel(slot, [H.lead({ ability: 'Hustle' })], H.noLevels(), H.scripted([base, percent])) === 8);
  assert.equal(maximum, 250);
});

test('T22 semantic flute level flags follow ability, lower wins, and clamped values still draw', () => {
  const rng = H.scripted([0, 0, 3]);
  assert.equal(R.selectEncounterLevel(H.slot('a', 100, 5, 8), [H.lead({ ability: 'Hustle' })], { lowerWildLevel: true, higherWildLevel: true }, rng), 4);
  assert.deepEqual(rng.calls, [[4, 0], [100, 0], [4, 3]]);
  for (let amount = 0; amount < 4; amount++) {
    assert.equal(R.selectEncounterLevel(H.slot('a', 1, 50), [], { lowerWildLevel: true, higherWildLevel: false }, H.scripted([0, amount])), 49 - amount);
    assert.equal(R.selectEncounterLevel(H.slot('a', 1, 50), [], { lowerWildLevel: false, higherWildLevel: true }, H.scripted([0, amount])), 51 + amount);
    assert.equal(R.selectEncounterLevel(H.slot('a', 1, 1), [], { lowerWildLevel: true, higherWildLevel: false }, H.scripted([0, amount])), 1);
    assert.equal(R.selectEncounterLevel(H.slot('a', 1, 100), [], { lowerWildLevel: false, higherWildLevel: true }, H.scripted([0, amount])), 100);
  }
});

test('formal malformed slots, total weight, count and RNG are rejected explicitly', () => {
  for (const bad of [{ weight: 0 }, { minLevel: 0 }, { maxLevel: 101 }, { minLevel: 7, maxLevel: 6 }, { species: '' }]) assert.throws(() => R.selectEncounterCandidate(H.table(21, [{ ...H.slot(), ...bad }]), options(), H.scripted([])), /slot/);
  assert.throws(() => R.selectEncounterCandidate(H.table(21, [H.slot('a', Number.MAX_SAFE_INTEGER), H.slot('b', 1)]), options(), H.scripted([])), /total weight/);
  for (const rolls of [0, -1, .5, Infinity]) assert.throws(() => R.selectEncounterCandidate(H.table(), options({ rolls }), H.scripted([])), /rolls/);
  assert.throws(() => R.selectEncounterCandidate(H.table(), options(), () => -1), /random/);
});
