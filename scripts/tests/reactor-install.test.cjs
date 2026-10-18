'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function write(root, file, text) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reactor install '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'game');
  const source = path.join(root, 'typed source');
  for (const file of ['setup-reactor.sh', 'reactor-types.cjs', 'versions.env']) {
    write(project, `scripts/${file}`, fs.readFileSync(path.join(__dirname, '..', file)));
  }
  write(project, 'game.rmmzproject', 'RPGMZ 1.0.0');
  write(project, 'js/plugins.js', 'var $plugins = [/* user config */];');
  write(project, 'js/plugins/UserPlugin.js', '// user plugin');
  write(project, 'src/types/user.d.ts', 'declare const custom: string;');
  write(source, 'runtime/reactor_main.js', '// RPG Reactor runtime version: 9.0.0\n// RPG Reactor runtime revision: fixture.1\n');
  for (const file of ['pixi.js', 'pixi_compat.js']) write(source, `runtime/libs/${file}`, '// runtime');
  for (const file of ['globals', 'reactor-data', 'reactor-core', 'reactor-managers', 'reactor-objects', 'reactor-scenes', 'reactor-sprites', 'reactor-windows', 'reactor-3d']) {
    write(source, `types/${file}.d.ts`, '// declaration');
  }
  write(source, 'types/compat/@webgpu/types/index.d.ts', '// compat');
  write(source, 'types/tools/typecheck.cjs', '// supports --compiler-root');
  write(source, 'types/compat/lib.dom.generated.d.ts', '// source compiler output must not be copied');
  write(source, 'types/tests/fixture.ts', '// tests must not be copied');
  write(source, 'LICENSE', 'Fixture license');
  const run = (args, sourceOverride) => {
    const env = { ...process.env, RMMZ_TEMPLATE_CACHE: path.join(root, 'cache') };
    delete env.REACTOR_SOURCE;
    if (sourceOverride) env.REACTOR_SOURCE = sourceOverride;
    return spawnSync('bash', [path.join(project, 'scripts/setup-reactor.sh'), ...args], { env, encoding: 'utf8' });
  };
  const ok = result => assert.equal(result.status, 0, result.stdout + result.stderr);
  return { root, project, source, run, ok, bundle: path.join(project, 'src/vendor/rpgreactor') };
}

test('local install persists source, preserves project files and repairs changed/missing types without replacing runtime', t => {
  const { project, source, run, ok, bundle } = fixture(t);
  ok(run(['--install'], source));
  assert.equal(fs.readFileSync(path.join(project, '.reactor-source'), 'utf8').trim(), source);
  assert.equal(fs.readlinkSync(path.join(project, 'js/reactor_plugins.js')), 'plugins.js');
  assert.equal(fs.existsSync(path.join(bundle, 'types/compat/lib.dom.generated.d.ts')), false);
  assert.equal(fs.existsSync(path.join(bundle, 'types/tests')), false);
  ok(run(['--check']));
  assert.match(run(['--install']).stdout, /Already installed/);

  const runtimeBefore = fs.statSync(path.join(project, 'js/reactor_main.js')).mtimeMs;
  write(source, 'types/reactor-core.d.ts', '// updated declaration');
  assert.notEqual(run(['--check']).status, 0);
  ok(run(['--install']));
  assert.equal(fs.readFileSync(path.join(bundle, 'types/reactor-core.d.ts'), 'utf8'), '// updated declaration');
  assert.equal(fs.statSync(path.join(project, 'js/reactor_main.js')).mtimeMs, runtimeBefore);
  fs.unlinkSync(path.join(bundle, 'types/reactor-scenes.d.ts'));
  assert.notEqual(run(['--check']).status, 0);
  ok(run(['--install']));
  ok(run(['--check']));
  assert.equal(fs.readFileSync(path.join(project, 'js/plugins.js'), 'utf8'), 'var $plugins = [/* user config */];');
  assert.equal(fs.readFileSync(path.join(project, 'js/plugins/UserPlugin.js'), 'utf8'), '// user plugin');
  assert.equal(fs.readFileSync(path.join(project, 'src/types/user.d.ts'), 'utf8'), 'declare const custom: string;');
});

test('missing source types fail before any runtime changes', t => {
  const { project, source, run, ok } = fixture(t);
  ok(run(['--install'], source));
  const before = fs.readFileSync(path.join(project, 'js/reactor_main.js'), 'utf8');
  write(source, 'runtime/reactor_main.js', before.replace('fixture.1', 'fixture.2'));
  fs.unlinkSync(path.join(source, 'types/globals.d.ts'));
  const result = run(['--install', '--force']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing types\/globals.d.ts/);
  assert.equal(fs.readFileSync(path.join(project, 'js/reactor_main.js'), 'utf8'), before);
});

test('pinned archive installs runtime and types from the same snapshot', t => {
  const { root, project, source, run, ok, bundle } = fixture(t);
  write(project, 'scripts/versions.env', 'REACTOR_VERSION="9.0.0"\nREACTOR_RUNTIME_REVISION="fixture.1"\nREACTOR_COMMIT="fixture"\nREACTOR_REPO="fixture/fixture"\n');
  fs.mkdirSync(path.join(root, 'cache'));
  const archive = spawnSync('tar', ['-czf', path.join(root, 'cache/rpgreactor-fixture.tar.gz'), '-C', root, 'typed source']);
  assert.equal(archive.status, 0);
  // Switching from a local tree must reinstall the pinned pair even when its
  // version/revision stamps match; they may still have different contents.
  fs.appendFileSync(path.join(source, 'runtime/reactor_main.js'), '// local-only change\n');
  ok(run(['--install'], source));
  ok(run(['--install'], 'download'));
  ok(run(['--check'], 'download'));
  assert.equal(fs.existsSync(path.join(project, '.reactor-source')), false);
  assert.equal(fs.readFileSync(path.join(bundle, 'types/globals.d.ts'), 'utf8'), '// declaration');
  assert.doesNotMatch(fs.readFileSync(path.join(project, 'js/reactor_main.js'), 'utf8'), /local-only change/);
});
