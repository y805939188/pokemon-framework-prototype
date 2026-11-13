// Runner controls only: Node built-ins, text inspection, and disposable shell stubs.
// No product suite, engine, reference fixture, NW, pnpm, or network is executed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'scripts/test-headless.sh'), 'utf8');
const excluded = 'experiments/step3/test-growth-differential.cjs';
const synthetic = ['control-only-a.cjs', 'control-only-b.cjs'];
function entries(name) {
  const match = source.match(new RegExp(`^${name}=\\(\\n([\\s\\S]*?)^\\)`, 'm'));
  assert.ok(match, `${name} must be an explicit array`);
  return match[1].split('\n').map(line => line.trim()).filter(Boolean);
}
const selected = entries('SUITES');

function sandbox(t, { actualInventory = false, overlap = false, engine = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-headless-scope-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'bin'));
  if (engine) fs.mkdirSync(path.join(dir, 'js/engine/showdown/dist'), { recursive: true });
  let script = source;
  if (!actualInventory) {
    const suites = overlap ? [...synthetic, excluded] : synthetic;
    script = script.replace(/^SUITES=\(\n[\s\S]*?^\)/m, `SUITES=(\n${suites.map(s => `  ${s}`).join('\n')}\n)`);
  }
  fs.writeFileSync(path.join(dir, 'scripts/test-headless.sh'), script);
  // These executables never delegate to real Node or pnpm. Suite paths are only logged.
  fs.writeFileSync(path.join(dir, 'bin/node'), `#!/bin/bash
printf 'node %s\\n' "$*" >> "$CONTROL_LOG"
if [[ "$*" == 'scripts/check-boundaries.cjs' ]]; then exit 0; fi
if [[ "$1" == 'scripts/headless-regression-binding.cjs' ]]; then
  case "$2" in
    begin) [[ $# -eq 3 ]] || exit 94; [[ "\${CONTROL_BINDING_BEGIN_RC:-0}" -eq 0 ]] || exit "$CONTROL_BINDING_BEGIN_RC"; printf '{}\\n' > "$3" ;;
    finish) [[ $# -eq 4 ]] || exit 94; [[ "\${CONTROL_BINDING_FINISH_RC:-0}" -eq 0 ]] || exit "$CONTROL_BINDING_FINISH_RC"; printf '{"runId":"synthetic-control"}\\n' > "$4" ;;
    verify) [[ $# -eq 3 ]] || exit 94; exit "\${CONTROL_BINDING_VERIFY_RC:-0}" ;;
    *) exit 94 ;;
  esac
  exit 0
fi
if [[ "$1" != '--test' || "$2" != '--test-reporter=tap' || $# -ne 3 ]]; then exit 91; fi
if [[ "$3" == '${excluded}' ]]; then echo 'FORBIDDEN_REPLAY_SELECTED' >&2; exit 92; fi
if [[ "$3" != 'control-only-a.cjs' ]]; then
  printf '# pass 1\\n# fail 0\\n# cancelled 0\\n# skipped 0\\n'
  exit 0
fi
case "\${CONTROL_CASE:-pass}" in
  empty) exit 0 ;;
  fail) printf '# pass 0\\n# fail 1\\n# cancelled 0\\n# skipped 0\\n'; exit 0 ;;
  cancelled) printf '# pass 0\\n# fail 0\\n# cancelled 1\\n# skipped 0\\n'; exit 0 ;;
  missing-cancelled) printf '# pass 1\\n# fail 0\\n# skipped 0\\n'; exit 0 ;;
  skipped) printf '# pass 0\\n# fail 0\\n# cancelled 0\\n# skipped 1\\n'; exit 0 ;;
  *) printf '# pass 1\\n# fail 0\\n# cancelled 0\\n# skipped 0\\n'; exit "\${CONTROL_RC:-0}" ;;
esac
`, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'bin/pnpm'), `#!/bin/bash
printf 'pnpm %s\\n' "$*" >> "$CONTROL_LOG"
case "$*" in
  '--dir src types:prepare') exit "\${CONTROL_TYPES_PREPARE_RC:-0}" ;;
  '--dir src typecheck:framework'|'--dir src build:distribution'|'--dir src exec vite build') exit "\${CONTROL_PREFLIGHT_RC:-0}" ;;
  *) exit 93 ;;
esac
`, { mode: 0o755 });
  function run(args = [], overrides = {}) {
    const log = path.join(dir, `commands-${fs.readdirSync(dir).length}.log`);
    // Keep only the environment needed for these synthetic shell commands.
    const env = {
      PATH: `${path.join(dir, 'bin')}:/usr/bin:/bin`,
      TMPDIR: dir,
      CONTROL_LOG: log,
      PF_NO_SKIP: '1',
      ...overrides,
    };
    const result = spawnSync('/bin/bash', [path.join(dir, 'scripts/test-headless.sh'), ...args], {
      cwd: dir, env, encoding: 'utf8', timeout: 15000,
    });
    assert.ifError(result.error);
    return { ...result, commands: fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [] };
  }
  return { run, receipts: () => {
    const folder = path.join(dir, 'build/headless-regression-bindings');
    return fs.existsSync(folder) ? fs.readdirSync(folder) : [];
  } };
}

test('regular inventory is explicit, unique, present, and disjoint from exclusions', () => {
  assert.deepEqual(entries('EXCLUDED_SUITES'), [excluded]);
  assert.equal(new Set(selected).size, selected.length);
  assert.ok(!selected.includes(excluded));
  assert.ok(selected.includes('scripts/tests/headless-scope.test.cjs'));
  for (const suite of selected) assert.ok(fs.statSync(path.join(root, suite)).isFile(), suite);
});

test('list modes work without engine, Node, pnpm, or product execution', t => {
  const fixture = sandbox(t, { actualInventory: true, engine: false });
  const regular = fixture.run(['--list']);
  assert.equal(regular.status, 0, regular.stderr);
  assert.deepEqual(regular.stdout.trim().split('\n'), selected);
  assert.deepEqual(regular.commands, []);
  const exclusions = fixture.run(['--list-exclusions']);
  assert.equal(exclusions.status, 0, exclusions.stderr);
  assert.equal(exclusions.stdout.trim(), excluded);
  assert.deepEqual(exclusions.commands, []);
});

test('default and explicit regular scope select every listed suite and no replay', t => {
  const fixture = sandbox(t, { actualInventory: true });
  for (const args of [[], ['--scope=regular']]) {
    const result = fixture.run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.commands.filter(line => line.startsWith('node --test ')), selected.map(s => `node --test --test-reporter=tap ${s}`));
    assert.ok(!result.commands.some(line => line.includes(excluded)));
    assert.match(result.stdout, /EXCLUDED \(NOT RUN\): experiments\/step3\/test-growth-differential\.cjs/);
    assert.match(result.stdout, /NOT RUN and not passes/);
    assert.doesNotMatch(result.stdout, /FORBIDDEN_REPLAY_SELECTED/);
  }
});

test('cold host declarations are prepared once before framework checks and suite dispatch', t => {
  const result = sandbox(t).run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.commands[0], 'pnpm --dir src types:prepare');
  assert.equal(result.commands.filter(command => command === 'pnpm --dir src types:prepare').length, 1);
  assert.equal(result.commands[1], 'pnpm --dir src typecheck:framework');
});

test('host declaration preparation failure stops before builds or suites', t => {
  const result = sandbox(t).run([], { CONTROL_TYPES_PREPARE_RC: '45' });
  assert.equal(result.status, 45, result.stderr);
  assert.deepEqual(result.commands, ['pnpm --dir src types:prepare']);
});

test('parent binding spans the controlled build, every suite and final verification; receipts never overwrite', t => {
  const fixture = sandbox(t);
  for (let run = 0; run < 2; run++) {
    const result = fixture.run();
    assert.equal(result.status, 0, result.stderr);
    const position = text => result.commands.findIndex(command => command.includes(text));
    const begin = position('headless-regression-binding.cjs begin ');
    const finish = position('headless-regression-binding.cjs finish ');
    const verify = position('headless-regression-binding.cjs verify ');
    assert(begin > position('scripts/check-boundaries.cjs'));
    assert(begin < position('pnpm --dir src build:distribution'));
    assert(finish > result.commands.lastIndexOf('pnpm --dir src exec vite build'));
    const suites = result.commands.map((command, index) => command.startsWith('node --test ') ? index : -1).filter(index => index >= 0);
    assert(suites.every(index => index > finish && index < verify));
    assert.equal(verify, result.commands.length - 1);
    assert.equal(fixture.receipts().length, run + 1);
  }
});

for (const stage of ['BEGIN', 'FINISH']) test(`binding ${stage.toLowerCase()} failure prevents business suite dispatch`, t => {
  const result = sandbox(t).run([], { ['CONTROL_BINDING_' + stage + '_RC']: '43' });
  assert.equal(result.status, 43, result.stderr);
  assert(!result.commands.some(command => command.startsWith('node --test ')));
});

test('binding verification failure fails the overall run after preserving all suite results', t => {
  const result = sandbox(t).run([], { CONTROL_BINDING_VERIFY_RC: '44' });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.commands.filter(command => command.startsWith('node --test ')).length, synthetic.length);
});

test('registering a policy exclusion is rejected before preflight', t => {
  const result = sandbox(t, { overlap: true }).run();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /excluded suite was registered/);
  assert.deepEqual(result.commands, []);
});

test('unsupported scope, replay option, and extra arguments fail before preflight', t => {
  const fixture = sandbox(t);
  for (const args of [['--scope=all'], ['--include-reference-replay'], ['--list', '--scope=regular']]) {
    const result = fixture.run(args);
    assert.equal(result.status, 2);
    assert.deepEqual(result.commands, []);
  }
});

test('engine and preflight failures still stop the run', t => {
  const missing = sandbox(t, { engine: false }).run();
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /engine not staged/);
  assert.deepEqual(missing.commands, []);
  const failed = sandbox(t).run([], { CONTROL_PREFLIGHT_RC: '17' });
  assert.equal(failed.status, 17);
  assert.deepEqual(failed.commands, ['pnpm --dir src types:prepare', 'pnpm --dir src typecheck:framework']);
});

for (const [label, overrides] of [
  ['nonzero test exit despite a green TAP summary', { CONTROL_RC: '37' }],
  ['failed test despite zero process exit', { CONTROL_CASE: 'fail' }],
  ['cancelled test despite zero failures', { CONTROL_CASE: 'cancelled' }],
  ['missing cancelled count', { CONTROL_CASE: 'missing-cancelled' }],
  ['skipped test with PF_NO_SKIP=1', { CONTROL_CASE: 'skipped' }],
]) {
  test(`${label} fails and later selected suites still run`, t => {
    const result = sandbox(t).run([], overrides);
    assert.equal(result.status, 1, result.stderr);
    assert.ok(result.commands.includes('node --test --test-reporter=tap control-only-b.cjs'));
    assert.match(result.stdout, /# (fail|cancelled|skipped)/);
  });
}

test('missing TAP output cannot pass', t => {
  const result = sandbox(t).run([], { CONTROL_CASE: 'empty' });
  assert.notEqual(result.status, 0);
});

test('local optional-skip behavior remains unchanged when PF_NO_SKIP is unset', t => {
  const result = sandbox(t).run([], { CONTROL_CASE: 'skipped', PF_NO_SKIP: '' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /# skipped 1/);
});

test('CI and quick checks use the regular runner without a replay opt-in', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  const quick = fs.readFileSync(path.join(root, 'scripts/test-quick.sh'), 'utf8');
  assert.match(workflow, /PF_NO_SKIP: '1'/);
  assert.match(workflow, /headless-suites \.\/scripts\/test-headless\.sh --scope=regular/);
  assert.ok(!workflow.includes(excluded));
  assert.match(quick, /exec "\$ROOT\/scripts\/test-headless\.sh"/);
});
