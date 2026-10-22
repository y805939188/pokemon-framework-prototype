'use strict';
// Step 5.0 review of 1960b92, F09: the warn-only budget check (D5-8) compares a battle-derived row only when it was
// computed over the same battles as the step 4 baseline (30 per run); other rows are compared as before; the 100-battle
// memory growth needs a 100-battle run. Synthetic summaries in temporary files; nothing is measured here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const budget = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/step5/perf-budget.json'), 'utf8'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-budget5-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const row = (label, median, samples = [median, median, median]) => ({ label, median, range: [Math.min(...samples), Math.max(...samples)], samples });
const COMPARABLE = 'battles behind the comparable rows (the step 4 baseline: 30)';
function check(rows, memoryRows, overrideBudget) {
  const s = path.join(dir, `s${Math.random()}.json`); fs.writeFileSync(s, JSON.stringify({ env: { gitHead: 'x' }, rows }));
  let script = path.join(ROOT, 'scripts/perf-budget.cjs');
  if (overrideBudget) {
    const fixture = fs.mkdtempSync(path.join(dir, 'budget-'));
    fs.mkdirSync(path.join(fixture, 'scripts')); fs.mkdirSync(path.join(fixture, 'docs/step5'), { recursive: true });
    fs.copyFileSync(script, path.join(fixture, 'scripts/perf-budget.cjs'));
    fs.writeFileSync(path.join(fixture, 'docs/step5/perf-budget.json'), JSON.stringify(overrideBudget));
    script = path.join(fixture, 'scripts/perf-budget.cjs');
  }
  const args = [script, s, `--out=${s}.report.json`];
  if (memoryRows) { const m = `${s}.m.json`; fs.writeFileSync(m, JSON.stringify({ rows: memoryRows })); args.push(`--memory100=${m}`); }
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(r.status, 0, 'warnings never block'); return JSON.parse(fs.readFileSync(`${s}.report.json`, 'utf8'));
}
const baselineRows = factor => budget.rows.map(b => row(b.label, b.baselineMedian == null ? null : +(b.baselineMedian * factor).toFixed(2)));

test('measured baselines have threshold x 1.2; unavailable baselines cannot silently turn into zero', () => {
  assert.equal(budget.factor, 1.2); assert.equal(budget.baseline.comparableBattles, 30);
  for (const b of budget.rows) {
    assert.equal(b.warnAbove, b.baselineMedian == null ? null : +(b.baselineMedian * 1.2).toFixed(2), b.label);
    if (b.baselineMedian == null) assert.ok(b.unavailableReason, b.label);
  }
  assert.deepEqual(budget.rows.filter(b => b.battleSet).map(b => b.label.split(':')[0]).sort(), ['action latency p50 ball (ms)', 'action latency p50 item (ms)', 'action latency p50 move (ms)', 'action latency p50 run (ms)', 'later battles', 'later battles', 'later battles'].sort());
});

test('over the baseline\'s 30 battles every row is compared: within at the baseline, WARN above +20%', () => {
  const at = check([...baselineRows(1), row(COMPARABLE, 30)]);
  assert.ok(at.rows.every(r => r.status === (r.baselineMedian == null ? 'not measured' : 'within')), JSON.stringify(at.rows));
  const above = check([...baselineRows(1.25), row(COMPARABLE, 30)]);
  assert.ok(above.rows.every(r => r.status === (r.baselineMedian == null ? 'not measured' : 'WARN')));
  assert.equal(above.warnings, budget.rows.filter(b => b.baselineMedian != null).length);
  // Keep the missing-baseline case explicit even after a later real run supplies all baseline rows.
  const missing = structuredClone(budget);
  missing.rows[0].baselineMedian = null; missing.rows[0].warnAbove = null;
  const absent = check([row(missing.rows[0].label, 10), row(COMPARABLE, 30)], undefined, missing);
  assert.equal(absent.rows[0].median, 10);
  assert.equal(absent.rows[0].status, 'no comparable baseline');
});

test('over another set of battles (e.g. 36 with the full-save battles mixed in, or no record) the battle rows are not compared; the others are', () => {
  for (const extra of [[row(COMPARABLE, 36)], [row(COMPARABLE, 30, [30, 36, 30])], []]) {
    const r = check([...baselineRows(1.25), ...extra]);
    for (const x of r.rows) assert.equal(x.status, x.baselineMedian == null ? 'not measured' : budget.rows.find(b => b.label === x.label).battleSet ? 'not comparable (computed over other battles than the baseline)' : 'WARN', x.label);
  }
});

test('the 100-battle memory growth uses the current fourth-step baseline and only a 100-battle run', () => {
  const mem = (after4, last, battles) => [row('memory: app RSS after 4 battles (MB)', after4, [after4]), row('memory: app RSS after the last round (MB)', last, [last]), row('battles in the rounds (4 per round; the last memory sample follows them)', battles, [battles])];
  const growth = budget.memory100.baseline.growth;
  assert.equal(budget.memory100.warnAbove, +(growth * 1.2).toFixed(2));
  assert.equal(check(baselineRows(1), mem(1240, 1240 + growth, 100)).memory.status, 'within');
  const above = Math.floor(budget.memory100.warnAbove) + 1;
  const warn = check(baselineRows(1), mem(1240, 1240 + above, 100)).memory;
  assert.deepEqual([warn.status, warn.growth], ['WARN', above]);
  assert.match(check(baselineRows(1), mem(1240, 1243, 24)).memory.status, /not comparable/);
  assert.equal(check(baselineRows(1)).memory.status, 'not measured');
});
