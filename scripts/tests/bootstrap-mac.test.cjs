'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const bootstrap = path.resolve(__dirname, '../bootstrap-mac.sh');
const phases = [
  'reactor-install', 'assets-install', 'dependency-install', 'typecheck',
  'engine-build', 'showdown-build', 'full-build', 'reactor-check', 'assets-check', 'doctor',
];

// Run the real bootstrap from a disposable project. Every installer/build/doctor
// and every platform/package tool is a local stub; no MZ, NW.js, network or
// existing repository build output is used. The stubs enforce artifact inputs,
// so a cold fixture cannot pass merely by printing the expected command order.
const tool = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const c = JSON.parse(fs.readFileSync(process.env.PF_BOOTSTRAP_FIXTURE_CONFIG, 'utf8'));
const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const file = relative => path.join(c.project, relative);
const read = relative => fs.existsSync(file(relative)) ? fs.readFileSync(file(relative), 'utf8') : null;
function write(relative, value = 'ready') {
  fs.mkdirSync(path.dirname(file(relative)), {recursive: true});
  fs.writeFileSync(file(relative), value);
}
function requireInput(condition, message) {
  if (!condition) {console.error('fixture prerequisite: ' + message); process.exit(91);}
}
function record(phase) {
  fs.appendFileSync(c.log, JSON.stringify({phase, args}) + '\n');
  if (phase === c.failure) {console.error('controlled failure: ' + phase); process.exit(c.failureStatus);}
}
function buildBundles() {
  for (const bundle of ['engine', 'core', 'content-cli', 'custom-formats']) {
    write('js/engine/build/' + bundle + '.cjs', 'fresh-' + bundle);
  }
}
if (name === 'uname') {
  requireInput(JSON.stringify(args) === '["-s"]', 'unexpected uname arguments');
  console.log(c.platform); process.exit(0);
}
if (name === 'node' || (name === 'pnpm' && args[0] === '--version')) {
  requireInput(JSON.stringify(args) === '["--version"]', 'unexpected version arguments');
  console.log(name === 'node' ? 'v22.21.1' : '10.20.0'); process.exit(0);
}
if (name === 'git') process.exit(128); // This synthetic project has no Git history.
requireInput(process.cwd() === c.project, 'bootstrap must use its own project');
if (name === 'pnpm') {
  requireInput(args[0] === '--dir' && args[1] === file('src'), 'wrong workspace');
  const command = args[2];
  requireInput(args.length === (command === 'install' ? 4 : 3), 'unexpected pnpm arguments');
  if (command === 'install') {
    requireInput(args[3] === '--frozen-lockfile', 'install must preserve lock validation');
    record('dependency-install');
    requireInput(read('.fixture/reactor') === 'ready', 'Reactor declarations missing');
    write('src/node_modules/.fixture-dependencies');
  } else if (command === 'typecheck') {
    record('typecheck');
    requireInput(read('src/node_modules/.fixture-dependencies') === 'ready', 'dependencies missing');
    write('src/.fixture-types'); // typecheck includes types:prepare in package.json.
  } else if (command === 'build:engine') {
    record('engine-build');
    requireInput(read('src/.fixture-types') === 'ready', 'types were not prepared');
    buildBundles();
  } else if (command === 'build') {
    record('full-build');
    requireInput(read('src/.fixture-types') === 'ready', 'types were not prepared');
    buildBundles(); // The real full build rebuilds the engine before content:build.
    requireInput(read('js/engine/build/content-cli.cjs') === 'fresh-content-cli', 'content CLI not built');
    requireInput(read('js/engine/showdown/SOURCE_SHA') === 'fixture-pin', 'Showdown not staged');
    requireInput(read('js/engine/showdown/dist/config/custom-formats.js') === 'fresh-custom-formats', 'Showdown extension stale');
    write('data/framework/content.json', 'fresh-content');
    write('js/plugins/PS_BattleFlow.js', 'fresh-plugin');
  } else requireInput(false, 'unexpected pnpm command: ' + command);
} else if (name === 'build-showdown.sh') {
  requireInput(args.length === 0, 'unexpected Showdown arguments');
  record('showdown-build');
  requireInput(read('src/.fixture-types') === 'ready', 'types were not prepared');
  requireInput(read('js/engine/build/engine.cjs') === 'fresh-engine', 'engine not built');
  requireInput(read('js/engine/build/custom-formats.cjs') === 'fresh-custom-formats', 'extension not built');
  write('js/engine/showdown/SOURCE_SHA', 'fixture-pin');
  write('js/engine/showdown/dist/config/custom-formats.js', read('js/engine/build/custom-formats.cjs'));
} else if (name === 'doctor.sh') {
  requireInput(args.length === 0, 'unexpected doctor arguments');
  record('doctor');
  requireInput(read('data/framework/content.json') === 'fresh-content', 'content not compiled');
  requireInput(read('js/plugins/PS_BattleFlow.js') === 'fresh-plugin', 'plugins not built');
} else {
  const component = {'setup-reactor.sh': 'reactor', 'setup-mz-assets-mac.sh': 'assets', 'setup-nwjs-mac.sh': 'nwjs'}[name];
  requireInput(component && args.length === 1 && ['--install', '--check'].includes(args[0]), 'unexpected setup invocation');
  const action = args[0].slice(2);
  record(component + '-' + action);
  if (action === 'install') write('.fixture/' + component);
  else requireInput(read('.fixture/' + component) === 'ready', component + ' was not installed');
}
`;

function fixture(t, options = {}) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pf-bootstrap-test-')));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const project = path.join(directory, 'synthetic project'), bin = path.join(directory, 'bin');
  fs.mkdirSync(path.join(project, 'scripts'), {recursive: true});
  fs.mkdirSync(path.join(project, 'src'));
  fs.mkdirSync(bin);
  fs.copyFileSync(bootstrap, path.join(project, 'scripts/bootstrap-mac.sh'));
  if (!options.missingProject) fs.writeFileSync(path.join(project, 'game.rmmzproject'), '{}\n');
  const config = {project, log: path.join(directory, 'events.jsonl'), platform: 'Darwin', failureStatus: 43, ...options};
  const configFile = path.join(directory, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify(config));
  function executable(destination) {
    fs.writeFileSync(destination, '#!' + process.execPath + '\n' + tool);
    fs.chmodSync(destination, 0o755);
  }
  for (const name of ['node', 'pnpm', 'uname', 'git']) executable(path.join(bin, name));
  for (const name of ['setup-reactor.sh', 'setup-mz-assets-mac.sh', 'setup-nwjs-mac.sh', 'build-showdown.sh', 'doctor.sh']) {
    executable(path.join(project, 'scripts', name));
  }
  if (options.warm) {
    for (const relative of [
      'js/engine/build/engine.cjs', 'js/engine/build/core.cjs',
      'js/engine/build/content-cli.cjs', 'js/engine/build/custom-formats.cjs',
      'js/engine/showdown/SOURCE_SHA', 'js/engine/showdown/dist/config/custom-formats.js',
      'data/framework/content.json', 'js/plugins/PS_BattleFlow.js',
    ]) {
      const destination = path.join(project, relative);
      fs.mkdirSync(path.dirname(destination), {recursive: true});
      fs.writeFileSync(destination, relative.endsWith('SOURCE_SHA') ? 'fixture-pin' : 'old-output');
    }
  }
  const env = {PATH: bin + ':/usr/bin:/bin', PF_BOOTSTRAP_FIXTURE_CONFIG: configFile};
  return {
    project,
    run(args = []) {
      const result = spawnSync('/bin/bash', [path.join(project, 'scripts/bootstrap-mac.sh'), ...args], {env, encoding: 'utf8'});
      assert.ifError(result.error);
      const events = fs.existsSync(config.log) ? fs.readFileSync(config.log, 'utf8').trim().split('\n').map(JSON.parse) : [];
      return {result, events, phases: events.map(event => event.phase)};
    },
  };
}

for (const warm of [false, true]) test('bootstrap completes ' + (warm ? 'warm preparation with refreshed extension' : 'cold preparation without stage, bundles or compiled content'), t => {
  const f = fixture(t, {warm});
  if (!warm) for (const output of ['js/engine/build', 'js/engine/showdown', 'data/framework/content.json']) {
    assert.equal(fs.existsSync(path.join(f.project, output)), false);
  }
  const p = f.run();
  assert.equal(p.result.status, 0, p.result.stderr + p.result.stdout);
  assert.deepEqual(p.phases, phases);
  assert.match(p.result.stdout, /Bootstrap complete/);
  assert.equal(fs.readFileSync(path.join(f.project, 'js/engine/showdown/dist/config/custom-formats.js'), 'utf8'), 'fresh-custom-formats');
  assert.equal(fs.readFileSync(path.join(f.project, 'data/framework/content.json'), 'utf8'), 'fresh-content');
});

for (const phase of phases) test('bootstrap propagates ' + phase + ' failure and stops with warm outputs present', t => {
  const f = fixture(t, {warm: true, failure: phase});
  const p = f.run();
  assert.equal(p.result.status, 43, p.result.stderr + p.result.stdout);
  assert.deepEqual(p.phases, phases.slice(0, phases.indexOf(phase) + 1));
  assert.doesNotMatch(p.result.stdout, /Bootstrap complete/);
});

test('explicit NW.js option keeps installation and final validation in the pipeline', t => {
  const f = fixture(t), p = f.run(['--install-nwjs']);
  assert.equal(p.result.status, 0, p.result.stderr + p.result.stdout);
  assert.deepEqual(p.phases, ['nwjs-install', ...phases.slice(0, -1), 'nwjs-check', 'doctor']);
});

for (const phase of ['nwjs-install', 'nwjs-check']) test('explicit NW.js ' + phase + ' failure stops at the local stub', t => {
  const f = fixture(t, {failure: phase}), p = f.run(['--install-nwjs']);
  assert.equal(p.result.status, 43, p.result.stderr + p.result.stdout);
  const expected = ['nwjs-install', ...phases.slice(0, -1), 'nwjs-check', 'doctor'];
  assert.deepEqual(p.phases, expected.slice(0, expected.indexOf(phase) + 1));
  assert.doesNotMatch(p.result.stdout, /Bootstrap complete/);
});

test('compatibility skip option leaves the NW.js installer unused', t => {
  const f = fixture(t), p = f.run(['--skip-nwjs']);
  assert.equal(p.result.status, 0, p.result.stderr + p.result.stdout);
  assert.deepEqual(p.phases, phases);
});

for (const options of [{platform: 'Linux'}, {missingProject: true}]) test('bootstrap preserves preflight refusal for ' + (options.platform || 'missing MZ project'), t => {
  const p = fixture(t, options).run();
  assert.equal(p.result.status, 1, p.result.stderr);
  assert.deepEqual(p.phases, []);
  assert.doesNotMatch(p.result.stdout, /Bootstrap complete/);
});

test('bootstrap rejects unknown arguments before setup', t => {
  const p = fixture(t).run(['--unknown']);
  assert.equal(p.result.status, 2, p.result.stderr);
  assert.deepEqual(p.phases, []);
});
