'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reactor identity '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'game');
  const source = path.join(root, 'source');
  const cache = path.join(root, 'cache');
  const write = (base, file, bytes) => {
    fs.mkdirSync(path.dirname(path.join(base, file)), { recursive: true });
    fs.writeFileSync(path.join(base, file), bytes);
  };
  const git = (...args) => {
    const result = spawnSync('git', ['-C', source, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout.trim();
  };
  for (const file of ['setup-reactor.sh', 'reactor-types.cjs', 'reactor-source.cjs']) {
    const original = path.join(__dirname, '..', file);
    if (fs.existsSync(original)) write(project, `scripts/${file}`, fs.readFileSync(original));
  }
  const runtimeFiles = [
    'runtime/reactor_main.js', 'runtime/reactor_core.js',
    'runtime/libs/pixi.js', 'runtime/libs/pixi_compat.js', 'runtime/libs/nested/fixture.wasm',
  ];
  for (const file of runtimeFiles) write(source, file, `// fixture ${file}\n`);
  write(source, 'runtime/reactor_main.js', '// RPG Reactor runtime version: 9.0.0\n// RPG Reactor runtime revision: fixture.1\n');
  // This upstream manifest is deliberately replaced by the project bridge.
  write(source, 'runtime/reactor_plugins.js', '// upstream manifest is not consumed');
  const declarationFiles = [
    ...['globals', 'reactor-data', 'reactor-core', 'reactor-managers', 'reactor-objects',
      'reactor-scenes', 'reactor-sprites', 'reactor-windows', 'reactor-3d'].map(name => `types/${name}.d.ts`),
    'types/compat/@webgpu/types/index.d.ts', 'types/tools/typecheck.cjs', 'LICENSE',
  ];
  for (const file of declarationFiles) write(source, file, `// fixture ${file}\n`);
  write(source, 'types/tools/typecheck.cjs', '// supports --compiler-root\n');
  write(source, 'types/compat/lib.dom.generated.d.ts', '// generated, excluded\n');
  write(source, 'types/tests/fixture.d.ts', '// test, excluded\n');
  git('init', '--quiet');
  git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'synthetic pinned source');
  const commit = git('rev-parse', 'HEAD');
  const repository = 'fixture/reactor';
  const hashes = files => Object.fromEntries([...files].sort().map(file => [file,
    crypto.createHash('sha256').update(fs.readFileSync(path.join(source, file))).digest('hex')]));
  const pin = { schema: 1, repository, commit, runtime: hashes(runtimeFiles), declarations: hashes(declarationFiles) };
  write(project, 'scripts/reactor-source-manifest.json', JSON.stringify(pin, null, 2) + '\n');
  write(project, 'scripts/versions.env', `REACTOR_VERSION="9.0.0"\nREACTOR_RUNTIME_REVISION="fixture.1"\nREACTOR_COMMIT="${commit}"\nREACTOR_REPO="${repository}"\n`);
  write(project, 'game.rmmzproject', 'RPGMZ 1.0.0');
  write(project, 'js/plugins.js', '// project plugin configuration');
  write(project, 'js/plugins/UserPlugin.js', '// project plugin');
  const run = (args, selected, development = false) => {
    const env = { ...process.env, RMMZ_TEMPLATE_CACHE: cache };
    delete env.REACTOR_SOURCE;
    delete env.REACTOR_ALLOW_OTHER_COMMIT;
    if (selected) env.REACTOR_SOURCE = selected;
    if (development) env.REACTOR_ALLOW_OTHER_COMMIT = '1';
    return spawnSync('bash', [path.join(project, 'scripts/setup-reactor.sh'), ...args], { env, encoding: 'utf8' });
  };
  const ok = result => assert.equal(result.status, 0, result.stdout + result.stderr);
  const refused = result => {
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /pinned|source|modified|stale|mismatch|unexpected|symlink/i);
  };
  const archive = () => {
    fs.mkdirSync(cache, { recursive: true });
    git('archive', '--format=tar.gz', '--prefix=snapshot/', `--output=${path.join(cache, `rpgreactor-${commit}.tar.gz`)}`, 'HEAD');
  };
  return { root, project, source, cache, pin, runtimeFiles, declarationFiles, write, git, run, ok, refused, archive };
}

test('strict clean local and cached download consume identical pinned bytes', t => {
  const f = fixture(t);
  f.archive();
  f.ok(f.run(['--install'], f.source));
  assert.match(fs.readFileSync(path.join(f.project, 'src/vendor/rpgreactor/source.txt'), 'utf8'), /^pinned:/);
  f.ok(f.run(['--check']));
  f.ok(f.run(['--install', '--force'], 'download'));
  f.ok(f.run(['--check'], 'download'));
  for (const file of f.runtimeFiles) {
    assert.deepEqual(fs.readFileSync(path.join(f.project, file.replace(/^runtime\//, 'js/'))), fs.readFileSync(path.join(f.source, file)));
  }
  for (const file of f.declarationFiles) {
    assert.deepEqual(fs.readFileSync(path.join(f.project, 'src/vendor/rpgreactor', file)), fs.readFileSync(path.join(f.source, file)));
  }
});

test('repair replaces a managed runtime symlink without writing its unrelated target', t => {
  const f = fixture(t);
  f.ok(f.run(['--install'], f.source));
  const outside = path.join(f.root, 'unrelated-file.js');
  fs.writeFileSync(outside, 'unrelated bytes must remain');
  const installed = path.join(f.project, 'js/reactor_core.js');
  fs.unlinkSync(installed);
  fs.symlinkSync(outside, installed);
  f.refused(f.run(['--check'], f.source));
  const repaired = f.run(['--install'], f.source);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'unrelated bytes must remain');
  f.ok(repaired);
  assert.equal(fs.lstatSync(installed).isSymbolicLink(), false);
  assert.deepEqual(fs.readFileSync(installed), fs.readFileSync(path.join(f.source, 'runtime/reactor_core.js')));
  f.ok(f.run(['--check'], f.source));
});

for (const [label, file, staged] of [
  ['staged runtime change', 'runtime/reactor_main.js', true],
  ['unstaged runtime change', 'runtime/libs/pixi.js', false],
  ['untracked runtime script', 'runtime/reactor_added.js', false],
  ['untracked nested runtime asset', 'runtime/libs/new/asset.wasm', false],
  ['staged declaration change', 'types/reactor-core.d.ts', true],
  ['unstaged declaration change', 'types/reactor-scenes.d.ts', false],
  ['untracked declaration', 'types/added.d.ts', false],
]) {
  test(`strict source rejects ${label} while HEAD remains pinned`, t => {
    const f = fixture(t);
    f.ok(f.run(['--install'], f.source));
    const before = fs.readFileSync(path.join(f.project, 'js/reactor_main.js'));
    fs.mkdirSync(path.dirname(path.join(f.source, file)), { recursive: true });
    fs.appendFileSync(path.join(f.source, file), '// changed without changing version stamps\n');
    if (staged) f.git('add', file);
    assert.equal(f.git('rev-parse', 'HEAD'), f.pin.commit);
    f.refused(f.run(['--check']));
    f.refused(f.run(['--install', '--force']));
    assert.deepEqual(fs.readFileSync(path.join(f.project, 'js/reactor_main.js')), before);
  });
}

for (const file of [
  'js/reactor_main.js', 'js/libs/nested/fixture.wasm', 'js/libs/added.wasm', 'js/reactor_added.js',
  'src/vendor/rpgreactor/types/reactor-core.d.ts', 'src/vendor/rpgreactor/types/added.d.ts',
]) {
  test(`strict check detects and install repairs installed bytes: ${file}`, t => {
    const f = fixture(t);
    f.archive();
    f.ok(f.run(['--install'], 'download'));
    fs.appendFileSync(path.join(f.project, file), '// installed tampering, same stamp\n');
    // A writable self-generated declaration manifest must not become a new pin.
    if (file.endsWith('/reactor-core.d.ts')) {
      const manifestFile = path.join(f.project, 'src/vendor/rpgreactor/manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestFile));
      manifest['types/reactor-core.d.ts'] = crypto.createHash('sha256').update(fs.readFileSync(path.join(f.project, file))).digest('hex');
      fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    }
    f.refused(f.run(['--check'], 'download'));
    f.ok(f.run(['--install'], 'download'));
    f.ok(f.run(['--check'], 'download'));
    assert.equal(fs.readFileSync(path.join(f.project, 'js/plugins.js'), 'utf8'), '// project plugin configuration');
    assert.equal(fs.readFileSync(path.join(f.project, 'js/plugins/UserPlugin.js'), 'utf8'), '// project plugin');
  });
}

test('strict pin ignores files excluded from the actual runtime and declaration copy', t => {
  const f = fixture(t);
  f.write(f.source, 'runtime/reactor_plugins.js', '// ignored upstream plugin manifest changed');
  f.write(f.source, 'types/compat/lib.dom.generated.d.ts', '// generated elsewhere');
  f.write(f.source, 'types/tests/added.d.ts', '// excluded test declaration');
  f.write(f.source, 'types/examples/added.d.ts', '// excluded example declaration');
  f.ok(f.run(['--install'], f.source));
  f.ok(f.run(['--check']));
});

test('strict source rejects non-git trees; explicit development mode remains usable and labelled', t => {
  const f = fixture(t);
  fs.rmSync(path.join(f.source, '.git'), { recursive: true });
  f.refused(f.run(['--install'], f.source));
  const development = f.run(['--install'], f.source, true);
  f.ok(development);
  assert.match(development.stdout + development.stderr, /development.*(non-strict|not strict)|non-strict.*development/i);
  assert.match(fs.readFileSync(path.join(f.project, 'src/vendor/rpgreactor/source.txt'), 'utf8'), /^development:/);
  f.ok(f.run(['--check'], undefined, true));
  f.refused(f.run(['--check']));
});

test('explicit development mode permits changed HEAD without claiming the strict pin', t => {
  const f = fixture(t);
  f.write(f.source, 'types/reactor-core.d.ts', '// deliberate development change');
  f.git('add', '.');
  f.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'development change');
  f.refused(f.run(['--install'], f.source));
  f.ok(f.run(['--install'], f.source, true));
  assert.match(fs.readFileSync(path.join(f.project, 'src/vendor/rpgreactor/source.txt'), 'utf8'), /^development:/);
  f.ok(f.run(['--check'], undefined, true));
  f.refused(f.run(['--check']));
});

test('cached download with valid tar and matching stamps cannot substitute different bytes', t => {
  const f = fixture(t);
  f.ok(f.run(['--install'], f.source));
  const before = fs.readFileSync(path.join(f.project, 'js/reactor_main.js'));
  f.write(f.source, 'runtime/libs/pixi.js', '// substituted cached archive');
  fs.mkdirSync(f.cache, { recursive: true });
  const result = spawnSync('tar', ['-czf', path.join(f.cache, `rpgreactor-${f.pin.commit}.tar.gz`), '-C', f.root, 'source']);
  assert.equal(result.status, 0);
  f.refused(f.run(['--install', '--force'], 'download'));
  assert.deepEqual(fs.readFileSync(path.join(f.project, 'js/reactor_main.js')), before);
});

test('strict source rejects symlinks in copied runtime assets', t => {
  const f = fixture(t);
  fs.symlinkSync('pixi.js', path.join(f.source, 'runtime/libs/linked.js'));
  f.refused(f.run(['--install'], f.source));
});
