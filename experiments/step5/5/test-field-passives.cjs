'use strict';
// WP06/WP61 and FP03–08/25/26 derived vectors. Executes actual pure TS sources, without changing shared bundles.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const { stripTypeScriptTypes } = require('node:module');

const ROOT = resolve(__dirname, '../../../src/framework/rules');
const urls = new Map();
function sourceURL(file) {
  if (urls.has(file)) return urls.get(file);
  const stripped = stripTypeScriptTypes(readFileSync(file, 'utf8'), { sourceUrl: file });
  const code = stripped.replace(/\bfrom\s*(['"])(\.\/[^'"]+)\1/g, (_, quote, relative) => {
    const dependency = resolve(dirname(file), relative + '.ts');
    assert.ok(dependency.startsWith(ROOT + '/'), 'only actual rule dependencies are loaded');
    return 'from ' + JSON.stringify(sourceURL(dependency));
  });
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  urls.set(file, url);
  return url;
}
const rules = import(sourceURL(resolve(ROOT, 'field-passives.ts')));
const copy = value => JSON.parse(JSON.stringify(value));
const member = (id, extra = {}) => ({
  id, species: 'pidgey', form: 0, level: 5, exp: 0, hp: 12, status: '', statusCount: 0,
  moves: [{ id: 'tackle', pp: 35, maxpp: 35 }], item: '', ability: 'keeneye', nature: 'hardy', gender: 'M',
  friendship: 70, isEgg: false, readyToEvolve: false, evolutionReadiness: 'known', ...extra,
});
const context = (extra = {}) => ({ AFFECTION_EFFECTS: false, mapId: 7, ...extra });
const input = (extra = {}) => ({ steps: 0, world: { happinessSteps: 0, repelSteps: 0 }, party: [member('A')], ice: false, hasRepelItems: false, friendship: context(), ...extra });
const config = (field = true, faint = false) => ({ POISON_IN_FIELD: field, POISON_FAINT_IN_FIELD: faint });
const noRandom = () => { assert.fail('this branch must not draw RNG'); };
function tape(values) {
  const remaining = [...values], trace = [];
  const draw = upperBound => { trace.push(upperBound); assert.ok(remaining.length, 'unexpected random request'); const value = remaining.shift(); assert.ok(value >= 0 && value < upperBound); return value; };
  return { draw, trace, assertDone: () => assert.equal(remaining.length, 0, 'all expected draws consumed') };
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}
function batch(R, party, settings = config(), options = {}) {
  let current = party, start = R.beginFieldPoison(options.steps ?? 4, current, settings, options.handled ?? false);
  const stages = [];
  if (start.kind === 'finished') return { party: current, stages, end: start };
  let continuation = start.continuation;
  for (let remaining = 32; remaining > 0; remaining--) {
    const stage = R.planNextFieldPoison(continuation, current, context()); stages.push(stage);
    if (stage.kind === 'finished') return { party: current, stages, end: stage };
    if (stage.kind === 'member') current = stage.party;
    continuation = stage.continuation;
    if (stage.kind === 'member' && stage.blackout && options.heal) current = options.heal(current);
  }
  assert.fail('poison batch did not finish');
}

test('T01 pure prefix counts one completed step, wraps 31 bits, and never mutates the source', async () => {
  const R = await rules;
  for (const [before, after] of [[0, 1], [2147483646, 2147483647], [2147483647, 0]]) {
    const source = freeze(input({ steps: before })), original = copy(source);
    const plan = R.planCompletedFieldStep(source, noRandom);
    assert.equal(plan.kind, 'completed-step-prefix'); assert.equal(plan.steps, after);
    assert.equal(plan.world.happinessSteps, 1); assert.deepEqual(source, original);
  }
});

test('T23 FP03 cycle boundaries consume this cycle at >=128, independently of global steps', async () => {
  const R = await rules;
  const beforeCycle = R.planCompletedFieldStep(input({ steps: 127, world: { happinessSteps: 126, repelSteps: 0 } }), noRandom);
  assert.deepEqual([beforeCycle.steps, beforeCycle.world.happinessSteps, beforeCycle.party[0].friendship], [128, 127, 70]);
  for (const happinessSteps of [127, 128, Number.MAX_SAFE_INTEGER]) {
    const rng = tape([0]);
    const plan = R.planCompletedFieldStep(input({ steps: 3, world: { happinessSteps, repelSteps: 0 } }), rng.draw);
    assert.deepEqual([plan.steps, plan.world.happinessSteps, plan.party[0].friendship], [4, 0, 72]);
    assert.deepEqual(rng.trace, [2]); rng.assertDone();
  }
});

test('T23 R09 draws once per usable member in party order, including 255; eggs/fainted draw nothing', async () => {
  const R = await rules, rng = tape([0, 1, 0]);
  const source = freeze(input({ world: { happinessSteps: 127, repelSteps: 0 }, party: [
    member('A', { friendship: 80 }), member('Egg', { isEgg: true, friendship: 90 }),
    member('Faint', { hp: 0, friendship: 100 }), member('Full', { friendship: 255 }), member('C', { friendship: 220 }),
  ] }));
  const plan = R.planCompletedFieldStep(source, rng.draw);
  assert.deepEqual(plan.party.map(m => [m.id, m.friendship]), [['A', 82], ['Egg', 90], ['Faint', 100], ['Full', 255], ['C', 221]]);
  assert.deepEqual(rng.trace, [2, 2, 2]); rng.assertDone();
  assert.deepEqual(source.party.map(m => m.friendship), [80, 90, 100, 255, 220]);
});

test('T23 R09 random value 1 skips, while random 0 still draws for full/soft-capped friendship', async () => {
  const R = await rules;
  for (const [friendship, roll, affection, after] of [[70, 1, false, 70], [255, 0, false, 255], [179, 0, true, 179]]) {
    const rng = tape([roll]);
    const plan = R.planCompletedFieldStep(input({ party: [member('A', { friendship })], world: { happinessSteps: 127, repelSteps: 0 }, friendship: context({ AFFECTION_EFFECTS: affection }) }), rng.draw);
    assert.equal(plan.party[0].friendship, after); assert.deepEqual(rng.trace, [2]); rng.assertDone();
  }
});

test('T23 empty/all-ineligible party consumes the 128-step cycle without RNG', async () => {
  const R = await rules;
  for (const party of [[], [member('Egg', { isEgg: true })], [member('Faint', { hp: 0 })]]) {
    const plan = R.planCompletedFieldStep(input({ party, world: { happinessSteps: 127, repelSteps: 0 } }), noRandom);
    assert.equal(plan.world.happinessSteps, 0); assert.deepEqual(plan.party, party);
  }
});

test('T23 walking uses existing map/luxury/bell and soft-cap rules', async () => {
  const R = await rules;
  const bonus = member('A', { friendship: 80, origin: { map: 7 }, ball: 'luxuryball', item: 'soothebell' });
  assert.equal(R.planCompletedFieldStep(input({ party: [bonus], world: { happinessSteps: 127, repelSteps: 0 } }), () => 0).party[0].friendship, 86);
  assert.equal(R.planCompletedFieldStep(input({ party: [member('B', { friendship: 178 })], world: { happinessSteps: 127, repelSteps: 0 }, friendship: context({ AFFECTION_EFFECTS: true }) }), () => 0).party[0].friendship, 179);
});

test('T04 repel 1->0 latches protection before decrement; expiry intent depends on available repel items', async () => {
  const R = await rules;
  for (const [hasRepelItems, expiry] of [[false, 'notice'], [true, 'renewal-choice']]) {
    const plan = R.planCompletedFieldStep(input({ world: { happinessSteps: 0, repelSteps: 1 }, hasRepelItems }), noRandom);
    assert.deepEqual([plan.repelActiveAtStart, plan.world.repelSteps, plan.repelExpiry], [true, 0, expiry]);
    assert.equal(plan.steps, 1);
  }
  const none = R.planCompletedFieldStep(input(), noRandom);
  assert.deepEqual([none.repelActiveAtStart, none.world.repelSteps, none.repelExpiry], [false, 0, 'none']);
});

test('T04 FP25 ice preserves repel without suppressing ordinary step and friendship-cycle counting', async () => {
  const R = await rules;
  const plan = R.planCompletedFieldStep(input({ world: { happinessSteps: 3, repelSteps: 1 }, ice: true, hasRepelItems: true }), noRandom);
  assert.deepEqual([plan.steps, plan.world.happinessSteps, plan.world.repelSteps, plan.repelActiveAtStart, plan.repelExpiry], [1, 4, 1, true, 'none']);
});

test('prefix/R09 invalid RNG or friendship fails planning without mutating an uncommitted input', async () => {
  const R = await rules;
  for (const invalid of [-1, 2, 0.5, NaN]) {
    const source = freeze(input({ world: { happinessSteps: 127, repelSteps: 1 } })), before = copy(source);
    assert.throws(() => R.planCompletedFieldStep(source, () => invalid), /invalid value/); assert.deepEqual(source, before);
  }
  const invalidFriendship = freeze(input({ world: { happinessSteps: 127, repelSteps: 1 }, party: [member('A', { friendship: 256 })] }));
  assert.throws(() => R.planCompletedFieldStep(invalidFriendship, () => 0), /friendship-out-of-domain/);
  assert.equal(invalidFriendship.party[0].friendship, 256);
});

test('prefix validates supported counter boundaries before consuming RNG', async () => {
  const R = await rules;
  for (const steps of [-1, 2147483648, 0.5, NaN]) assert.throws(() => R.planCompletedFieldStep(input({ steps }), noRandom), /steps/);
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => R.planCompletedFieldStep(input({ world: { happinessSteps: value, repelSteps: 0 } }), noRandom), /happinessSteps/);
    assert.throws(() => R.planCompletedFieldStep(input({ world: { happinessSteps: 0, repelSteps: value } }), noRandom), /repelSteps/);
  }
});

test('T23 poison handled/config/4-step gates use the global post-step count, including wrap to zero', async () => {
  const R = await rules, poisoned = [member('A', { status: 'psn' })];
  assert.deepEqual(R.beginFieldPoison(4, poisoned, config(), true), { kind: 'finished', handled: true, reason: 'already-handled' });
  assert.deepEqual(R.beginFieldPoison(4, poisoned, config(false, true)), { kind: 'finished', handled: false, reason: 'disabled' });
  for (const steps of [1, 2, 3, 5, 7]) assert.equal(R.beginFieldPoison(steps, poisoned, config()).reason, 'not-poison-tick');
  for (const steps of [0, 4, 8]) assert.equal(R.beginFieldPoison(steps, poisoned, config()).kind, 'active');
});

// Literal expected final rows are independent of the production branch structure: [HP,status,friendship,message,blackout].
const poisonRows = [
  [false, false, 1, [1, 'psn', 70, undefined, false]],
  [false, true, 1, [1, 'psn', 70, undefined, false]],
  [true, false, 1, [1, '', 70, 'survived-poison', false]],
  [true, false, 2, [1, '', 70, 'survived-poison', false]],
  [true, false, 3, [2, 'psn', 70, 'none', false]],
  [true, true, 1, [0, '', 69, 'fainted', true]],
  [true, true, 2, [1, 'psn', 70, 'none', false]],
  [true, true, 3, [2, 'psn', 70, 'none', false]],
];
for (const [field, faint, hp, expected] of poisonRows) test(`T23 FP05/07 poison field=${field} faint=${faint} HP=${hp}`, async () => {
  const R = await rules, source = freeze([member('A', { hp, status: 'psn', statusCount: 1 })]);
  const result = batch(R, source, config(field, faint)), plan = result.stages.find(stage => stage.kind === 'member');
  const actual = result.party[0];
  assert.deepEqual([actual.hp, actual.status, actual.friendship, plan?.message, plan?.blackout ?? false], expected);
  assert.equal(result.stages.filter(stage => stage.kind === 'feedback').length, field ? 1 : 0);
  if (actual.status === '') assert.equal(actual.statusCount, 0);
  assert.deepEqual([source[0].hp, source[0].status, source[0].friendship], [hp, 'psn', 70]);
});

test('T23 FP06/26 uses a usable snapshot, skips status/immunity, and issues one feedback intent per batch', async () => {
  const R = await rules;
  const party = freeze([
    member('Healthy'), member('Egg', { isEgg: true, status: 'psn' }), member('Dead', { hp: 0, status: 'psn' }),
    member('Immune', { ability: 'IMMUNITY', status: 'psn' }), member('A', { status: 'psn' }), member('B', { status: 'psn' }),
  ]);
  const result = batch(R, party);
  assert.deepEqual(result.party.map(m => [m.id, m.hp, m.status]), [['Healthy', 12, ''], ['Egg', 12, 'psn'], ['Dead', 0, 'psn'], ['Immune', 12, 'psn'], ['A', 11, 'psn'], ['B', 11, 'psn']]);
  assert.deepEqual(result.stages.map(s => s.kind), ['feedback', 'member', 'member', 'finished']);
  assert.deepEqual(result.stages[0].feedback, { sound: 'poison-step', flash: 'red' });
  assert.deepEqual(result.stages.filter(s => s.kind === 'member').map(s => s.memberId), ['A', 'B']);
});

test('T23 no qualifying poisoned member produces no feedback, damage or blackout handoff', async () => {
  const R = await rules;
  for (const party of [[], [member('Egg', { isEgg: true, status: 'psn' })], [member('Dead', { hp: 0, status: 'psn' })], [member('Healthy')], [member('Immune', { status: 'psn', ability: 'immunity' })]]) {
    const result = batch(R, freeze(party));
    assert.deepEqual(result.party, party); assert.deepEqual(result.stages.map(s => s.kind), ['finished']); assert.equal(result.end.handled, false);
  }
});

test('T23 FP08 the final usable member alone requests blackout; faint clears both readiness fields', async () => {
  const R = await rules;
  const result = batch(R, [member('A', { hp: 1, status: 'psn', readyToEvolve: true, evolutionReadiness: 'unknown' }), member('B', { hp: 1, status: 'psn' }), member('OldFaint', { hp: 0 })], config(true, true));
  assert.deepEqual(result.stages.filter(s => s.kind === 'member').map(s => [s.memberId, s.blackout, s.continuation.handled]), [['A', false, false], ['B', true, true]]);
  assert.deepEqual([result.party[0].readyToEvolve, result.party[0].evolutionReadiness], [false, 'known']);
  assert.equal(result.end.handled, true);
  assert.equal(result.stages.filter(s => s.kind === 'feedback').length, 1);
});

test('T23 continuation rereads poison/ability after feedback rather than applying stale eligibility booleans', async () => {
  const R = await rules, party = [member('A', { status: 'psn' }), member('B', { status: 'psn' })];
  const start = R.beginFieldPoison(4, party, config());
  const feedback = R.planNextFieldPoison(start.continuation, party, context()); assert.equal(feedback.kind, 'feedback');
  const changed = [member('A', { status: '' }), member('B', { status: 'psn', ability: 'immunity' })];
  const end = R.planNextFieldPoison(feedback.continuation, changed, context());
  assert.deepEqual(end, { kind: 'finished', handled: false, reason: 'complete' });
});

test('T23 artificial FP08 callback: blackout healing clears poison before snapshot tail is resumed', async () => {
  const R = await rules, party = [member('A', { hp: 1, status: 'psn' }), member('B', { hp: 2, status: 'psn' })];
  const start = R.beginFieldPoison(4, party, config(true, true));
  const feedback = R.planNextFieldPoison(start.continuation, party, context());
  // Explicit artificial injection after the snapshot: B faints outside this consumer before A is processed.
  const changed = [party[0], { ...party[1], hp: 0 }];
  const a = R.planNextFieldPoison(feedback.continuation, changed, context()); assert.equal(a.kind, 'member'); assert.equal(a.blackout, true);
  const healed = a.party.map(m => ({ ...m, hp: 12, status: '', statusCount: 0 }));
  const end = R.planNextFieldPoison(a.continuation, healed, context());
  assert.deepEqual(end, { kind: 'finished', handled: true, reason: 'complete' });
  assert.equal(healed[1].hp, 12);
});

test('T05 party identity changes reject continuation and retain prior prefix/member plans', async () => {
  const R = await rules;
  const prefix = freeze(R.planCompletedFieldStep(input({ steps: 3, party: [member('A', { status: 'psn' }), member('B', { status: 'psn' })], world: { happinessSteps: 0, repelSteps: 1 }, hasRepelItems: true }), noRandom));
  const before = copy(prefix), start = R.beginFieldPoison(prefix.steps, prefix.party, config());
  const feedback = R.planNextFieldPoison(start.continuation, prefix.party, context());
  assert.throws(() => R.planNextFieldPoison(feedback.continuation, [...prefix.party].reverse(), context()), /party-changed/);
  assert.throws(() => R.planNextFieldPoison(feedback.continuation, [member('New')], context()), /party-changed/);
  const firstMember = R.planNextFieldPoison(feedback.continuation, prefix.party, context());
  assert.equal(firstMember.kind, 'member'); freeze(firstMember);
  const committedMember = copy(firstMember.party);
  assert.throws(() => R.planNextFieldPoison(firstMember.continuation, [firstMember.party[0], member('Replacement')], context()), /party-changed/);
  assert.deepEqual(firstMember.party, committedMember);
  assert.deepEqual(firstMember.party.map(m => m.hp), [11, 12]);
  assert.deepEqual(prefix, before); assert.deepEqual([prefix.steps, prefix.world.repelSteps, prefix.repelActiveAtStart], [4, 0, true]);
});

test('T04/T05 cancelled renewal or failed feedback preserves installed prefix without replaying RNG or steps', async () => {
  const R = await rules, rng = tape([0]);
  const prefix = freeze(R.planCompletedFieldStep(input({ steps: 3, party: [member('A', { status: 'psn' })], world: { happinessSteps: 127, repelSteps: 1 }, hasRepelItems: true }), rng.draw));
  const installed = copy(prefix); // Application has committed; renewal cancellation only proceeds to poison.
  const start = R.beginFieldPoison(prefix.steps, prefix.party, config());
  const feedback = R.planNextFieldPoison(start.continuation, prefix.party, context());
  assert.equal(feedback.kind, 'feedback'); // A host feedback failure stops here, without accepting its continuation.
  assert.deepEqual(prefix, installed); assert.deepEqual([prefix.steps, prefix.world.happinessSteps, prefix.world.repelSteps, prefix.party[0].friendship], [4, 0, 0, 72]);
  assert.deepEqual(rng.trace, [2]); rng.assertDone();
});

test('WP61 direct blackout decision includes empty/all-eggs/all-fainted and never settles battle money', async () => {
  const R = await rules;
  for (const party of [[], [member('Egg', { isEgg: true })], [member('Faint', { hp: 0 })]]) assert.equal(R.fieldBlackoutRequired(party), true);
  assert.equal(R.fieldBlackoutRequired([member('A')]), false);
  assert.equal(R.fieldBlackoutRequired([member('Egg', { isEgg: true }), member('A')]), false);
});
