'use strict';
// Compile the actual internal module with no Node/DOM ambient types. Expected
// vectors come from the clean specification, not TS output or media execution.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../../..');
const vectors = require('./faint-schedule-cases.json').cases;
const slots = ['dedicatedForm', 'dedicatedBase', 'ordinaryForm', 'ordinaryBase'];
const matches = ['dedicated-form', 'dedicated-base', 'ordinary-form', 'ordinary-base'];
let temp, plan;
test.before(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-faint-schedule-'));
  const source = path.join(ROOT, 'src/plugins/battleflow');
  const config = { compilerOptions: { target: 'ES2022', module: 'CommonJS', strict: true, types: [], lib: ['ES2022'],
    rootDir: source, outDir: path.join(temp, 'out'), noEmitOnError: true }, files: [path.join(source, 'faint-schedule.ts')] };
  fs.writeFileSync(path.join(temp, 'tsconfig.json'), JSON.stringify(config));
  const r = spawnSync('pnpm', ['--dir', 'src', 'exec', 'tsc', '-p', path.join(temp, 'tsconfig.json')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  plan = require(path.join(temp, 'out/faint-schedule.js')).planFaintSchedule;
});
test.after(() => { if (temp) fs.rmSync(temp, { recursive: true, force: true }); });
const missing = () => Object.fromEntries(slots.map(slot => [slot, { state: 'missing' }]));
const resolved = (fileSeconds = 1, assetId = 'cry') => ({ state: 'resolved', fileSeconds, assetId });
const input = (candidates = missing(), battleEffects = true) => ({ candidates, battleEffects });
function ready(candidates, effects = true) {
  const result = plan(input(candidates, effects)); assert.equal(result.state, 'ready', JSON.stringify(result)); return result.plan;
}
for (const vector of vectors) for (const effects of [true, false]) {
  test(`${vector.id} effects=${effects}: ${vector.title}`, () => {
    const candidates = missing(), index = matches.indexOf(vector.input.soundMatch);
    if (index !== -1) candidates[slots[index]] = resolved(vector.input.rawDurationReaderSeconds ?? vector.input.estimatedSeconds, vector.input.soundMatch);
    if (vector.input.ordinaryFormAlsoExists) candidates.ordinaryForm = resolved(100, 'lower ordinary form');
    const actual = ready(candidates, effects), expected = vector.expected;
    assert.equal(actual.version, 'faint-schedule-v1');
    assert.equal(actual.bodyDropStartUnits, expected.dropStartUnits);
    assert.equal(actual.shadowHideUnits, expected.shadowHideUnits);
    assert.equal(actual.dataBoxStartUnits, expected.dataBoxStartUnits);
    assert.deepEqual(actual.faintEffect, { logicalName: expected.faintSELogicalRequest, atUnits: expected.faintSEAtUnits });
    assert.equal(actual.completion, 'all-tracks-stopped-then-next-scene-update');
    assert.equal(actual.cry !== null, expected.cryRequested);
    assert.equal(actual.cry?.pitchPercent ?? null, expected.cryPitch);
    if (actual.cry) {
      assert.equal(actual.cry.assetId, vector.input.soundMatch);
      assert.equal(actual.cry.slot, slots[index]); assert.equal(actual.cry.requestAtUnits, 0);
      assert.equal(actual.cry.normalizedFileSeconds, vector.input.estimatedSeconds);
      assert.equal(actual.cry.rawFileSeconds, vector.input.rawDurationReaderSeconds ?? vector.input.estimatedSeconds);
      assert.equal(actual.cry.estimatedPlayedSeconds, vector.input.estimatedSeconds / (expected.cryPitch / 100));
    }
    assert(!('totalBlockingDuration' in actual), 'start offset must not claim total completion duration');
  });
}
test('every resolved slot wins over later candidates and stops reading their getters', () => {
  for (let index = 0; index < slots.length; index++) {
    const candidates = missing(); candidates[slots[index]] = resolved(1, ' selected identity ');
    for (const lower of slots.slice(index + 1)) Object.defineProperty(candidates, lower, { get() { assert.fail('read an unselected lower candidate'); } });
    const result = ready(candidates); assert.equal(result.cry.slot, slots[index]); assert.equal(result.cry.assetId, ' selected identity ');
  }
});
test('a pending prefix blocks a resolved lower fallback, including with effects off', () => {
  for (const [index, slot] of slots.entries()) for (const effects of [true, false]) {
    const candidates = missing(); candidates[slot] = { state: 'pending' };
    for (const lower of slots.slice(index + 1)) candidates[lower] = resolved();
    assert.deepEqual(plan(input(candidates, effects)), { state: 'pending', slot });
  }
});
test('a failed prefix retains the failure and never becomes a missing cry', () => {
  for (const slot of slots) {
    const candidates = missing(); candidates[slot] = { state: 'failed', reason: 'read denied' };
    assert.deepEqual(plan(input(candidates)), { state: 'failed', slot, code: 'resource-failed', detail: 'read denied' });
  }
});
test('zero and negative finite lengths retain the matched cry, unlike all missing', () => {
  const absent = ready(missing()); assert.equal(absent.cry, null); assert.equal(absent.bodyDropStartUnits, 12);
  for (const seconds of [0, -0, -1, -Number.MAX_VALUE]) {
    const candidates = missing(); candidates.dedicatedBase = resolved(seconds);
    const actual = ready(candidates); assert.equal(actual.bodyDropStartUnits, 2); assert(actual.cry);
    assert(Object.is(actual.cry.rawFileSeconds, seconds)); assert.equal(actual.cry.normalizedFileSeconds, 0);
  }
});
test('small positive durations do not disappear into the zero-length branch', () => {
  for (const slot of ['dedicatedForm', 'ordinaryBase']) {
    const candidates = missing(); candidates[slot] = resolved(Number.MIN_VALUE);
    assert.equal(ready(candidates).bodyDropStartUnits, 3);
  }
});
test('selected duration must be a finite number; invalid values never try lower valid resources', () => {
  for (const fileSeconds of [NaN, Infinity, -Infinity, undefined, null, '1', true, 1n, {}, []]) {
    const candidates = missing(); candidates.dedicatedForm = { ...resolved(), fileSeconds }; candidates.ordinaryForm = resolved();
    assert.deepEqual(plan(input(candidates)), { state: 'failed', slot: 'dedicatedForm', code: 'invalid-observation' });
  }
});
test('overflow and unsafe millisecond offsets are rejected without a partial ready plan', () => {
  for (const seconds of [Number.MAX_VALUE, Number.MAX_SAFE_INTEGER / 20, Number.MAX_SAFE_INTEGER / 1000]) {
    const candidates = missing(); candidates.ordinaryForm = resolved(seconds);
    assert.deepEqual(plan(input(candidates)), { state: 'failed', slot: 'ordinaryForm', code: 'unsafe-duration' });
  }
});
test('ordinary duration uses the same 75-percent pitch for playback and schedule', () => {
  const candidates = missing(); candidates.ordinaryBase = resolved(3);
  const actual = ready(candidates); assert.equal(actual.cry.pitchPercent, 75);
  assert.equal(actual.cry.estimatedPlayedSeconds, 4); assert.equal(actual.bodyDropStartUnits, 82);
});
test('invalid effects or candidate containers fail at the input boundary', () => {
  for (const value of [null, undefined, [], true, {}, { candidates: missing() }, input(missing(), 'false'),
    input(missing(), 0), input(null), input([]), Object.create(input())]) {
    assert.deepEqual(plan(value), { state: 'failed', slot: null, code: 'invalid-input' });
  }
});
test('missing, inherited, malformed or unknown selected observations are not silently absent', () => {
  for (const observation of [undefined, null, [], {}, { state: 'unknown' }, Object.create({ state: 'missing' }),
    { state: 'resolved', fileSeconds: 1, assetId: '' }, { state: 'resolved', fileSeconds: 1, assetId: '  ' },
    { state: 'failed' }, { state: 'failed', reason: {} }, Object.assign(Object.create({ fileSeconds: 1 }), { state: 'resolved', assetId: 'x' })]) {
    const candidates = missing(); candidates.dedicatedForm = observation;
    assert.deepEqual(plan(input(candidates)), { state: 'failed', slot: 'dedicatedForm', code: 'invalid-observation' });
  }
  const candidates = missing(); delete candidates.dedicatedForm;
  assert.deepEqual(plan(input(candidates)), { state: 'failed', slot: 'dedicatedForm', code: 'invalid-observation' });
  assert.deepEqual(plan(input(Object.create(missing()))), { state: 'failed', slot: 'dedicatedForm', code: 'invalid-observation' });
});
test('null-prototype own records are accepted and absent resources need no identity or duration', () => {
  const candidates = Object.assign(Object.create(null), missing());
  candidates.dedicatedForm = Object.assign(Object.create(null), resolved());
  assert.equal(ready(candidates).bodyDropStartUnits, 22);
  assert.equal(ready(missing()).bodyDropStartUnits, 12);
});
test('input observations and returned nested plans cannot affect later calls', () => {
  const candidates = missing(); candidates.dedicatedForm = resolved(); const source = input(candidates);
  const before = JSON.parse(JSON.stringify(source)), first = plan(source), second = plan(source);
  assert.deepEqual(first, second); assert.deepEqual(source, before);
  first.plan.cry.assetId = 'changed'; first.plan.faintEffect.atUnits = 999;
  assert.deepEqual(plan(source), second);
  candidates.dedicatedForm.assetId = 'new input'; assert.equal(second.plan.cry.assetId, 'cry');
  assert.equal(second.plan.faintEffect.atUnits, 22);
});
test('both effects settings yield identical mandatory plans on every branch', () => {
  for (const slot of slots) {
    const candidates = missing(); candidates[slot] = resolved(.1234);
    assert.deepEqual(plan(input(candidates, true)), plan(input(candidates, false)));
  }
  assert.deepEqual(plan(input(missing(), true)), plan(input(missing(), false)));
});
