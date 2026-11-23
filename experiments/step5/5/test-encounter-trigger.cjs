'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const H = require('./fixtures/c-rules-support.cjs');
let R;
test.before(async () => { R = await H.loadRule('encounter-trigger'); });
const input = extra => ({ type: 'Land', table: H.table(), runtime: { graceSteps: 99, accumulator: 0 }, party: [H.lead()], local: H.noRates(), weatherCategory: 'None', moreAbilities: true, disabled: false, playerPresent: true, debugControl: false, fromStep: true, cycling: false, repelActive: false, ...extra });

test('T21 opportunity prioritizes Surf, then ice, cave, and nonempty land/contest tables', () => {
  const yes = { surfing: false, ice: false, landAllowed: true };
  assert.equal(R.ordinaryEncounterOpportunity({}, { ...yes, surfing: true, ice: true }), true);
  assert.equal(R.ordinaryEncounterOpportunity({ Cave: H.table(5) }, { ...yes, ice: true }), false);
  assert.equal(R.ordinaryEncounterOpportunity({ Cave: H.table(5) }, { ...yes, landAllowed: false }), true);
  assert.equal(R.ordinaryEncounterOpportunity({ Land: H.table() }, { ...yes, landAllowed: false }), false);
  assert.equal(R.ordinaryEncounterOpportunity({ Land: H.table(21, []) }, yes), false);
  assert.equal(R.ordinaryEncounterOpportunity({ OldRod: H.table(0) }, yes), false);
  assert.equal(R.ordinaryEncounterOpportunity({ BugContest: H.table() }, yes), true);
  assert.equal(R.ordinaryEncounterOpportunity(Object.create({ Cave: H.table(5) }), yes), false);
});

test('T08 trigger gates return without consuming random or mutating supplied counters', () => {
  for (const [extra, reason] of [[{ disabled: true }, 'disabled'], [{ playerPresent: false }, 'no-player'], [{ debugControl: true }, 'debug-control'], [{ table: undefined }, 'no-chance'], [{ table: H.table(0) }, 'no-chance'], [{ table: H.table(21, []) }, 'no-table']]) {
    const original = input(extra), before = JSON.stringify(original), rng = H.scripted([]);
    assert.equal(R.checkEncounterTrigger(original, rng).reason, reason);
    assert.equal(JSON.stringify(original), before);
  }
  assert.throws(() => R.checkEncounterTrigger(input({ type: 'unknown', disabled: true }), H.scripted([])), /unknown encounter type/);
  assert.throws(() => R.checkEncounterTrigger(input({ runtime: { graceSteps: -1, accumulator: 0 } }), H.scripted([])), /runtime/);
});

test('T21 integer folding uses floor, before bicycle/map/held/ability factors', () => {
  for (const [acc, expected] of [[21, 21], [189, 21], [210, 22], [-1, 20], [-201, 19]]) {
    assert.equal(R.encounterProbability(input({ runtime: { graceSteps: 99, accumulator: acc } })).chance, expected);
  }
  const p = R.encounterProbability(input({ cycling: true, runtime: { graceSteps: 0, accumulator: 210 }, local: { lowerEncounterRate: true, higherEncounterRate: true }, party: [H.lead({ item: 'Cleanse Tag', ability: 'Stench' })] }));
  assert.equal(p.chance, (21 + 1) * .8 / 2 * 2 / 3);
  assert.equal(p.minimumSteps, 5.9 * 2 * 4 / 3);
  assert.equal(p.graceThreshold, p.chance * 5 / 22);
});

test('T22 all encounter-rate abilities and item priority use first non-egg including fainted', () => {
  const base = [H.lead({ isEgg: true, ability: 'Illuminate' }), H.lead({ hp: 0, ability: 'Stench' })];
  assert.equal(R.encounterProbability(input({ party: base })).chance, 10.5);
  for (const ability of ['Stench', 'White Smoke', 'Quick Feet', 'Infiltrator']) assert.equal(R.encounterProbability(input({ party: [H.lead({ ability })] })).chance, 10.5);
  assert.equal(R.encounterProbability(input({ moreAbilities: false, party: [H.lead({ ability: 'Infiltrator' })] })).chance, 21);
  for (const [ability, category] of [['Snow Cloak', 'Hail'], ['Sand Veil', 'Sandstorm']]) {
    assert.equal(R.encounterProbability(input({ weatherCategory: category, party: [H.lead({ ability })] })).chance, 10.5);
    assert.equal(R.encounterProbability(input({ weatherCategory: 'Rain', party: [H.lead({ ability })] })).chance, 21);
  }
  assert.equal(R.encounterProbability(input({ party: [H.lead({ ability: 'Swarm' })] })).chance, 31.5);
  for (const ability of ['Illuminate', 'Arena Trap', 'No Guard']) assert.equal(R.encounterProbability(input({ party: [H.lead({ ability })] })).chance, 42);
  for (const item of ['cleanse-tag', 'pureincense']) assert.equal(R.encounterProbability(input({ party: [H.lead({ item, ability: 'Illuminate' })] })).chance, 14);
});

test('T08 grace rejection, regular failure, active repel and non-step requests have exact prefixes', () => {
  const start = { graceSteps: 0, accumulator: 210 };
  let rng = H.scripted([5]);
  assert.deepEqual(R.checkEncounterTrigger(input({ runtime: start, repelActive: true }), rng), { triggered: false, reason: 'grace', runtime: { graceSteps: 1, accumulator: 210 } });
  assert.deepEqual(rng.calls, [[100, 5]]);
  rng = H.scripted([4, 22]);
  assert.deepEqual(R.checkEncounterTrigger(input({ runtime: start }), rng), { triggered: false, reason: 'miss', runtime: { graceSteps: 1, accumulator: 231 } });
  assert.deepEqual(rng.calls, [[100, 4], [100, 22]]);
  rng = H.scripted([4, 22]);
  assert.equal(R.checkEncounterTrigger(input({ runtime: start, repelActive: true }), rng).runtime.accumulator, 0);
  rng = H.scripted([21]);
  assert.deepEqual(R.checkEncounterTrigger(input({ runtime: start, fromStep: false }), rng), { triggered: false, reason: 'miss', runtime: start });
  assert.deepEqual(rng.calls, [[100, 21]]);
  assert.throws(() => R.checkEncounterTrigger(input(), () => 100), /random\(100\)/);
});

test('T21 exact enumeration validates the P01..06 thresholds without running the frozen statistical harness', () => {
  const cases = [[{}, 21], [{ cycling: true }, 17], [{ local: { lowerEncounterRate: true, higherEncounterRate: false } }, 11], [{ local: { lowerEncounterRate: false, higherEncounterRate: true } }, 32], [{ party: [H.lead({ item: 'Cleanse Tag' })] }, 14], [{ type: 'Cave', table: H.table(5) }, 5], [{ type: 'Water', table: H.table(2) }, 2]];
  for (const [extra, count] of cases) {
    let hits = 0;
    for (let roll = 0; roll < 100; roll++) hits += Number(R.checkEncounterTrigger(input(extra), H.scripted([roll])).triggered);
    assert.equal(hits, count);
  }
  let hits = 0;
  for (let a = 0; a < 100; a++) for (let b = 0; b < 100; b++) {
    const rng = H.scripted(a < 5 ? [a, b] : [a]);
    hits += Number(R.checkEncounterTrigger(input({ runtime: { graceSteps: 0, accumulator: 0 } }), rng).triggered);
  }
  assert.equal(hits, 105, 'two independent 0..99 inputs: 5 * 21');
});

test('T21 long state trace matches an independent arithmetic oracle, including negative accepted probabilities', () => {
  for (const [base, chanceFactor, graceFactor, cycling] of [[21, 1, 1, false], [5, .5, 2, true], [-3, 1.5, .5, false]]) {
    let state = { graceSteps: 0, accumulator: 0 };
    for (let step = 0; step < 240; step++) {
      if (step === 60) state = { ...state, graceSteps: 0 }; // map load preserves accumulator
      if (step === 120) state = { graceSteps: 0, accumulator: 0 }; // battle/Surf reset
      const rolls = [(step * 37 + 11) % 100, (step * 53 + 7) % 100], repel = step >= 160;
      const expected = H.triggerOracle({ base, state, cycling, chanceFactor, graceFactor, repel }, rolls);
      const extra = { table: H.table(base), cycling, repelActive: repel, runtime: state,
        local: { lowerEncounterRate: chanceFactor === .5, higherEncounterRate: chanceFactor === 1.5 } };
      const rng = H.scripted(rolls.slice(0, expected.used)), result = R.checkEncounterTrigger(input(extra), rng);
      const { used, ...value } = expected;
      assert.deepEqual(result, value, 'step ' + step); rng.exhausted();
      state = result.triggered ? { graceSteps: 0, accumulator: 0 } : result.runtime;
    }
  }
});

test('T08 repel compares the configured lead before Intimidate/Keen Eye and clears only the repel counter', () => {
  const party = [H.lead({ isEgg: true, level: 100 }), H.lead({ level: 20, hp: 0, ability: 'Intimidate' }), H.lead({ level: 10 })];
  const base = { party, candidate: { species: 'a', level: 15 }, runtime: { graceSteps: 3, accumulator: 210 }, repelActive: true, repelCountsFainted: true };
  assert.deepEqual(R.checkEncounterAllowance(base, H.scripted([])), { allowed: false, reason: 'repel', runtime: { graceSteps: 3, accumulator: 0 } });
  const rng = H.scripted([49]);
  assert.deepEqual(R.checkEncounterAllowance({ ...base, repelCountsFainted: false }, rng), { allowed: false, reason: 'ability', runtime: base.runtime });
  assert.deepEqual(rng.calls, [[100, 49]]);
  assert.equal(R.checkEncounterAllowance({ ...base, candidate: { species: 'a', level: 20 } }, H.scripted([])).allowed, true);
  assert.equal(R.checkEncounterAllowance({ ...base, candidate: null }, H.scripted([])).reason, 'no-candidate');
});

test('T08 ability -5 boundary and 49/50 split consume no generation or double-encounter draws', () => {
  for (const ability of ['Intimidate', 'Keen Eye']) {
    const base = { party: [H.lead({ ability })], candidate: { species: 'a', level: 15 }, runtime: { graceSteps: 1, accumulator: 210 }, repelActive: false, repelCountsFainted: true };
    assert.equal(R.checkEncounterAllowance(base, H.scripted([49])).allowed, false);
    assert.equal(R.checkEncounterAllowance(base, H.scripted([50])).allowed, true);
    assert.equal(R.checkEncounterAllowance({ ...base, candidate: { species: 'a', level: 16 } }, H.scripted([])).allowed, true);
  }
  assert.equal(R.ordinaryEncounterIsDouble(), false);
});
