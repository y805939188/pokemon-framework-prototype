'use strict';
// Pure published-value projection only. This is not a Scene/font/NW test.
// Explicit entry: node --test experiments/step5/4/test-status-card.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../../..');
let temp, project;
test.before(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-status-card-'));
  const source = path.join(ROOT, 'src/plugins/battleflow');
  fs.writeFileSync(path.join(temp, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'CommonJS', strict: true, types: [], lib: ['ES2022'],
      rootDir: source, outDir: temp, noEmitOnError: true },
    files: [path.join(source, 'status-card.ts')],
  }));
  const result = spawnSync('pnpm', ['--dir', 'src', 'exec', 'tsc', '-p', path.join(temp, 'tsconfig.json')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  project = require(path.join(temp, 'status-card.js')).projectStatusCard;
});
test.after(() => { if (temp) fs.rmSync(temp, { recursive: true, force: true }); });
const en = Object.freeze({ psn: 'Poisoned', tox: 'Badly poisoned', brn: 'Burned', par: 'Paralyzed', slp: 'Asleep', frz: 'Frozen', unknown: '?' });
const zh = Object.freeze({ psn: '中毒', tox: '剧毒', brn: '灼伤', par: '麻痹', slp: '睡眠', frz: '冰冻', unknown: '未知' });
const card = (changes = {}) => ({ id: 'member1', side: 'p1', name: '伊布 Eevee', level: 12, hp: 23.5, maxhp: 41,
  status: '', active: true, ratio: 0.25, ...changes });
const metadata = (changes = {}) => ({ id: 'member1', side: 'p1', gender: 'M', shiny: true, owned: true, ...changes });

test('single player card retains the full published name/level and displays male blue, HP numbers and EXP', () => {
  const view = project(card(), metadata(), en);
  assert.equal(view.name, '伊布 Eevee'); assert.equal(view.level, 12);
  assert.deepEqual(view.gender, { kind: 'male', symbol: '♂', colour: 'blue' });
  assert.deepEqual(view.hp, { ratio: 23.5 / 41, colour: 'green', numbers: { current: 24, total: 41 } });
  assert.deepEqual(view.experience, { ratio: 0.25, flash: false });
  assert.equal(view.shiny, true); assert.equal(view.owned, null);
  assert.deepEqual(view.condition, { kind: 'none', label: null });
});
test('opponent exposes the female red and owned markers while omitting HP numbers and EXP even if supplied', () => {
  const view = project(card({ side: 'p2', flash: true, experienceUnavailable: 'outside-level-interval' }), metadata({ side: 'p2', gender: 'F' }), zh);
  assert.deepEqual(view.gender, { kind: 'female', symbol: '♀', colour: 'red' });
  assert.equal(view.owned, true); assert.equal(view.shiny, true);
  assert.equal(view.hp.numbers, null); assert.equal(view.experience, null); assert.equal(view.experienceUnavailable, null);
});
test('explicit false metadata is a known negative and unknown flags never become true or false', () => {
  for (const side of ['p1', 'p2']) {
    const missing = project(card({ side }), undefined, en);
    assert.equal(missing.shiny, null); assert.equal(missing.owned, null);
    const negative = project(card({ side }), metadata({ side, shiny: false, owned: false }), en);
    assert.equal(negative.shiny, false); assert.equal(negative.owned, side === 'p2' ? false : null);
  }
  assert.equal(project(card(), metadata({ shiny: 'yes' }), en).shiny, null);
  assert.equal(project(card({ side: 'p2' }), metadata({ side: 'p2', owned: 1 }), en).owned, null);
});
test('known genderless and unavailable gender have distinct kinds and neither fabricates a symbol', () => {
  assert.deepEqual(project(card(), metadata({ gender: 'N' }), en).gender, { kind: 'genderless', symbol: null, colour: null });
  for (const gender of [undefined, null, '', 'Male', 'unknown']) {
    assert.deepEqual(project(card(), metadata({ gender }), en).gender, { kind: 'unknown', symbol: null, colour: null });
  }
  assert.equal(project(card(), null, en).gender.kind, 'unknown');
});
test('all six public conditions use injected English and Chinese labels; toxic remains distinct from poison', () => {
  for (const labels of [en, zh]) {
    for (const status of ['psn', 'tox', 'brn', 'par', 'slp', 'frz']) {
      assert.deepEqual(project(card({ status }), undefined, labels).condition, { kind: status, label: labels[status] });
    }
    assert.notDeepEqual(project(card({ status: 'tox' }), null, labels).condition, project(card({ status: 'psn' }), null, labels).condition);
  }
});
test('missing known condition uses no badge; unrecognized published status stays visibly unknown', () => {
  assert.deepEqual(project(card(), null, zh).condition, { kind: 'none', label: null });
  for (const status of ['future-status', 'fnt', 'toString', '__proto__']) {
    assert.deepEqual(project(card({ status }), null, zh).condition, { kind: 'unknown', label: '未知' });
  }
});
test('animated HP colour uses fractional values and floored thresholds before rounding the number', () => {
  for (const [hp, colour, number] of [[0, 'red', 0], [10, 'red', 10], [10.01, 'yellow', 11], [20, 'yellow', 20], [20.01, 'green', 21], [41, 'green', 41]]) {
    const view = project(card({ hp }), null, en);
    assert.equal(view.hp.colour, colour); assert.equal(view.hp.numbers.current, number); assert.equal(view.hp.ratio, hp / 41);
  }
});
test('zero and full experience remain visible, flash is copied and unavailable experience never becomes zero', () => {
  for (const ratio of [0, 1]) assert.deepEqual(project(card({ ratio, flash: true }), null, en).experience, { ratio, flash: true });
  assert.equal(project(card({ ratio: null, flash: true }), null, en).experience, null);
  for (const ratio of [null, 0.5]) {
    const view = project(card({ ratio, experienceUnavailable: 'outside-level-interval' }), null, en);
    assert.equal(view.experience, null); assert.equal(view.experienceUnavailable, 'outside-level-interval');
  }
});
test('box fade and active state decide visibility; hidden portrait and zero HP alone do not hide the data box', () => {
  for (const [changes, visible, opacity] of [[{}, true, 1], [{ boxOpacity: 0.3 }, true, 0.3], [{ boxOpacity: 0 }, false, 0],
    [{ active: false }, false, 1], [{ portraitVisible: false }, true, 1], [{ hp: 0 }, true, 1]]) {
    const view = project(card(changes), null, en); assert.equal(view.visible, visible); assert.equal(view.opacity, opacity);
  }
});
test('same names cannot join metadata from another stable id or side', () => {
  for (const changes of [{ id: 'other' }, { side: 'p2' }]) {
    assert.throws(() => project(card(), metadata(changes), en), /metadata identity mismatch/);
  }
  assert.equal(project(card({ name: 'different localized name' }), metadata(), zh).shiny, true);
});
test('invalid published numeric values are rejected without normalization or source writes', () => {
  for (const changes of [{ hp: -1 }, { hp: 42 }, { hp: NaN }, { maxhp: 0 }, { maxhp: 40.5 }, { ratio: -0.1 }, { ratio: 1.1 },
    { ratio: NaN }, { level: 0 }, { level: 1.5 }, { boxOpacity: -0.1 }, { boxOpacity: 1.1 }, { boxOpacity: Infinity }, { id: '' }, { side: 'p3' }]) {
    const value = Object.freeze(card(changes));
    assert.throws(() => project(value, null, en), /invalid|exceeds/);
  }
});
test('frozen inputs are untouched and outputs are detached across repaint, cure, locale and member changes', () => {
  const input = Object.freeze(card({ status: 'tox', flash: true })), meta = Object.freeze(metadata());
  const before = JSON.stringify({ input, meta, en, zh });
  const first = project(input, meta, en);
  first.gender.kind = 'corrupted'; first.condition.label = 'corrupted'; first.hp.numbers.current = 999; first.experience.ratio = 1;
  const next = project(input, meta, zh);
  assert.equal(next.gender.kind, 'male'); assert.equal(next.condition.label, '剧毒');
  assert.equal(next.hp.numbers.current, 24); assert.equal(next.experience.ratio, 0.25);
  assert.equal(JSON.stringify({ input, meta, en, zh }), before);
  assert.deepEqual(project(card({ status: '' }), meta, zh).condition, { kind: 'none', label: null });
  const replacement = project(card({ id: 'new', name: 'Ditto' }), undefined, en);
  assert.equal(replacement.shiny, null); assert.equal(replacement.gender.kind, 'unknown');
});
