'use strict';
// Synthetic Git/source/artifact trees only. Never builds or damages the actual
// runtime, launches a host, or reads a saved game/reference-run fixture.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const H = require('../headless-regression-binding.cjs');
const {SOURCE_INPUTS, sourceFingerprint} = require('../framework-distribution-source.cjs');
const PIN = 'a'.repeat(40), hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const directories = new Set(['src/framework', 'js/engine/fixtures', 'js/engine/game', 'js/engine/rpg',
  'content/sample', 'content/examples/progression', 'src/plugins']);
function write(file, bytes) { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, bytes); }
function files(directory, prefix = '') {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    return entry.isDirectory() ? files(path.join(directory, entry.name), relative) : [relative];
  }).sort();
}
function fixture(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pf-headless-binding-test-'))), root = path.join(directory, 'repo');
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  fs.mkdirSync(root);
  for (const relative of [...new Set([...SOURCE_INPUTS, ...H.CONTROLLED_INPUTS])]) {
    write(path.join(root, relative, ...(directories.has(relative) ? ['fixture.txt'] : [])), 'authored fixture ' + relative + '\n');
  }
  write(path.join(root, 'scripts/showdown.env'), `SHOWDOWN_SHA="${PIN}"\n`);
  write(path.join(root, '.gitignore'), 'build/\njs/engine/build/\njs/engine/showdown/\njs/plugins/\n');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', env: {...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null'}}).trim();
  git('init', '-q'); git('add', '.');
  git('-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'synthetic identity fixture');
  function build() {
    const out = path.join(root, 'build/framework-cjs'); fs.rmSync(out, {recursive: true, force: true});
    for (const name of ['production', 'testing', 'engine', 'core', 'custom-formats', 'content-cli']) write(path.join(root, `js/engine/build/${name}.cjs`), 'synthetic-' + name);
    write(path.join(root, 'js/engine/build/shared-unit.js'), 'synthetic-shared-chunk');
    write(path.join(root, 'js/engine/showdown/SOURCE_SHA'), PIN + '\n');
    write(path.join(root, 'js/engine/showdown/dist/config/custom-formats.js'), 'synthetic-custom-formats');
    write(path.join(root, 'js/engine/showdown/dist/sim/index.js'), 'synthetic-engine');
    fs.cpSync(path.join(root, 'js/engine'), path.join(out, 'js/engine'), {recursive: true});
    write(path.join(out, 'data/framework/content.json'), '{"synthetic":true}\n');
    const hashes = Object.fromEntries(files(out).map(relative => [relative, hash(fs.readFileSync(path.join(out, relative)))]));
    const manifest = {formatVersion: 1, source: {sha: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'),
      dirty: git('status', '--porcelain') !== '', fingerprint: sourceFingerprint(root)}, toolchain: {node: process.version},
      dependencies: {showdown: {sha: PIN}}, files: hashes};
    write(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    write(path.join(out, 'SHA256SUMS'), files(out).map(relative => hash(fs.readFileSync(path.join(out, relative))) + '  ' + relative).join('\n') + '\n');
    for (const file of H.PLUGIN_BUNDLES) write(path.join(root, file), 'synthetic compiled plugin: ' + file);
  }
  function seal() {
    const started = H.begin(root); build(); const binding = H.finish(root, started), file = path.join(directory, 'binding.json');
    fs.writeFileSync(file, JSON.stringify(binding, null, 2) + '\n', {flag: 'wx'});
    return {started, binding, file, captured: H.capture(root, file)};
  }
  return {root, directory, git, build, seal};
}

test('fresh controlled build binds source, full distribution and local shared runtime once', t => {
  const f = fixture(t), s = f.seal();
  assert.deepEqual(H.verify(f.root, s.binding), s.captured.identity);
  assert.equal(s.binding.dirtyMetadata.build, false);
  assert(s.binding.controlledInputs['src/plugins/fixture.txt']);
  assert.equal(H.capture(f.root, s.file, s.captured.sha256).sha256, s.captured.sha256);
});

test('dirty development inputs are allowed and explicitly recorded; unrelated untracked fixture churn does not retire them', t => {
  const f = fixture(t);
  write(path.join(f.root, 'src/framework/fixture.txt'), 'deliberate dirty development source');
  const s = f.seal(); assert.equal(s.binding.dirtyMetadata.build, true);
  write(path.join(f.root, 'experiments/generated-temporary-fixture.txt'), 'ordinary test output');
  assert.deepEqual(H.verify(f.root, s.binding), s.captured.identity);
});

test('finish refuses a stale manifest without a controlled build after begin', t => {
  const f = fixture(t); f.build(); const started = H.begin(f.root);
  assert.throws(() => H.finish(f.root, started), /fresh distribution build required/);
});

for (const mode of ['source', 'test-input']) test('finish refuses ' + mode + ' changes across the build', t => {
  const f = fixture(t), started = H.begin(f.root); f.build();
  write(path.join(f.root, mode === 'source' ? 'src/framework/fixture.txt' : 'experiments/step5/4/e-status-disk-contracts.json'), 'changed during build');
  assert.throws(() => H.finish(f.root, started), /changed during/);
});

const faults = {
  source(f) { write(path.join(f.root, 'src/framework/fixture.txt'), 'different source'); },
  runtime(f) { write(path.join(f.root, 'js/engine/build/production.cjs'), 'different runtime'); },
  'shared-chunk'(f) { write(path.join(f.root, 'js/engine/build/shared-unit.js'), 'different shared chunk'); },
  'added-chunk'(f) { write(path.join(f.root, 'js/engine/build/unrecorded.js'), 'extra shared chunk'); },
  'missing-entry'(f) { fs.unlinkSync(path.join(f.root, 'js/engine/build/core.cjs')); },
  fixture(f) { write(path.join(f.root, 'experiments/step5/4/e-defeat-disk-contracts.json'), 'different scenario'); },
  'plugin-source'(f) { write(path.join(f.root, 'src/plugins/fixture.txt'), 'different plugin source'); },
  'plugin-config'(f) { write(path.join(f.root, 'src/vite.config.mts'), 'different plugin build config'); },
  'consumer-helper'(f) { write(path.join(f.root, 'experiments/step5/4/battle-music-composition-host.cjs'), 'different consumed host helper'); },
  'capture-audio-host'(f) { write(path.join(f.root, 'experiments/step5/4/test-capture-me-port.cjs'), 'different extracted audio host'); },
  'capture-music-host'(f) { write(path.join(f.root, 'experiments/step5/4/test-battle-music-scene.cjs'), 'different extracted Scene host'); },
  'parent-test'(f) { write(path.join(f.root, 'experiments/step5/4/h3-production-policy/test-release-sources.cjs'), 'different scenario implementation'); },
  'missing-fixture'(f) { fs.unlinkSync(path.join(f.root, 'experiments/step5/4/e-defeat-disk-contracts.json')); },
  'plugin-artifact'(f) { write(path.join(f.root, H.PLUGIN_BUNDLES[0]), 'different compiled plugin'); },
  extension(f) { write(path.join(f.root, 'js/engine/showdown/dist/config/custom-formats.js'), 'wrong extension'); },
  'showdown-pin'(f) { write(path.join(f.root, 'js/engine/showdown/SOURCE_SHA'), 'b'.repeat(40)); },
  'distribution-file'(f) { write(path.join(f.root, 'build/framework-cjs/data/framework/content.json'), 'different package content'); },
  manifest(f) { write(path.join(f.root, 'build/framework-cjs/manifest.json'), '{}'); },
  sums(f) { write(path.join(f.root, 'build/framework-cjs/SHA256SUMS'), 'different sums'); },
  HEAD(f) { f.git('-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'different candidate'); },
};
for (const [name, mutate] of Object.entries(faults)) test('candidate ' + name + ' mismatch refuses before synthetic business writes', t => {
  const f = fixture(t), s = f.seal(); mutate(f);
  const game = path.join(f.directory, 'game.json');
  assert.throws(() => { H.capture(f.root, s.file, s.captured.sha256); write(game, 'must not install'); });
  assert.equal(fs.existsSync(game), false);
});

test('missing parent binding has no automatic self-capture fallback', t => {
  const f = fixture(t);
  assert.throws(() => H.capture(f.root, null), /parent candidate binding is required/);
  assert.throws(() => H.capture(f.root, path.join(f.directory, 'missing.json')), /ENOENT/);
});

test('binding transplanted to another source root or another parent run is refused', t => {
  const f = fixture(t), s = f.seal(), other = fixture(t);
  assert.throws(() => H.capture(other.root, s.file), /another root/);
  const changed = {...s.binding, runId: crypto.randomUUID()}, file = path.join(f.directory, 'other-binding.json');
  write(file, JSON.stringify(changed));
  assert.throws(() => H.capture(f.root, file, s.captured.sha256), /changed or transplanted/);
});

test('consumer paths can only select existing parent-bound expected bytes', t => {
  const f = fixture(t), s = f.seal(), file = H.PLUGIN_BUNDLES[0];
  assert.equal(H.boundFiles(s.captured, [file])[file], hash(fs.readFileSync(path.join(f.root, file))));
  assert.throws(() => H.boundFiles(s.captured, ['arbitrary-unbound-file']), /unbound consumer input/);
});

test('finish refuses a distribution rebuild that did not rebuild the four consumed plugins', t => {
  const f = fixture(t); f.build(); const started = H.begin(f.root);
  // Simulate rebuilding only the package, retaining the original plugin inodes/times.
  const saved = path.join(f.directory, 'saved-plugins'); fs.renameSync(path.join(f.root, 'js/plugins'), saved);
  f.build(); fs.rmSync(path.join(f.root, 'js/plugins'), {recursive: true}); fs.renameSync(saved, path.join(f.root, 'js/plugins'));
  assert.throws(() => H.finish(f.root, started), /fresh plugin build required/);
});

test('a freshly generated manifest for a different source fingerprint cannot authorize the package', t => {
  const f = fixture(t), started = H.begin(f.root); f.build();
  const out = path.join(f.root, 'build/framework-cjs'), file = path.join(out, 'manifest.json'), manifest = JSON.parse(fs.readFileSync(file));
  manifest.source.fingerprint = '0'.repeat(64); write(file, JSON.stringify(manifest));
  write(path.join(out, 'SHA256SUMS'), files(out).filter(relative => relative !== 'SHA256SUMS').map(relative => hash(fs.readFileSync(path.join(out, relative))) + '  ' + relative).join('\n') + '\n');
  assert.throws(() => H.finish(f.root, started), /source fingerprint mismatch/);
});

const repository = path.resolve(__dirname, '../..');
for (const relative of [
  'experiments/step5/4/h3-production-policy/support.cjs',
  'experiments/step5/4/h3-held-continue/worker.cjs',
  'experiments/step5/4/h3-install-outcome/test-install.cjs',
  'experiments/step5/4/status-disk-worker.cjs',
  'experiments/step5/4/defeat-disk-worker.cjs',
]) test('legacy root without the new helper still reaches its original gate: ' + relative, async t => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pf-legacy-binding-test-'))), root = path.join(directory, 'frozen');
  fs.mkdirSync(root); t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const current = {schema: 'capture-run-current-headless-v1', productSrcTree: 'f'.repeat(40), showdownSHA: PIN,
    runtime: Object.fromEntries(Array.from({length: 9}, (_, i) => ['runtime-' + i, '0'.repeat(64)])),
    helperFiles: {'experiments/step5/4/h3-production-policy/support.cjs': '0'.repeat(64)}};
  const plan = {version: 'synthetic-legacy', showdownSHA: PIN, files: {'legacy-required.js': '0'.repeat(64)}};
  const observed = {helper: 0, originalFileGate: 0, originalGitGate: 0};
  const safeFs = {...fs, readFileSync(file, ...args) {
    if (String(file).startsWith(root + path.sep)) { observed.originalFileGate++; throw Error('LEGACY_ORIGINAL_FILE_GATE'); }
    return fs.readFileSync(file, ...args);
  }};
  function requireFixture(name) {
    if (name.endsWith('headless-regression-binding.cjs')) { observed.helper++; return require(path.join(root, 'scripts/headless-regression-binding.cjs')); }
    if (name === 'node:fs') return safeFs;
    if (name === 'node:child_process') return {execFileSync() { observed.originalGitGate++; return '0'.repeat(40); }};
    if (name === 'node:test') return Object.assign(() => {}, {after() {}});
    if (name.startsWith('node:')) return require(name);
    if (name.includes('capture-run-current-headless-runtime.json')) return current;
    if (name === './plan.json') return relative.includes('test-install') ? plan.files : plan;
    if (name.endsWith('contracts.json')) return plan;
    if (name.includes('trainer-ai-integration/fixtures')) return {E: {}, T: {}, inputs() { throw Error('unexpected business'); }};
    if (name === './status-disk-worker.cjs') return {};
    throw Error('unexpected require before original gate: ' + name);
  }
  const exported = {exports: {}}, context = {require: requireFixture, module: exported, exports: exported.exports,
    __dirname: path.join(root, path.dirname(relative)), process: {env: {H3_RUNTIME_ROOT: root}, versions: process.versions}, console};
  const source = fs.readFileSync(path.join(repository, relative), 'utf8');
  const expected = relative.endsWith('support.cjs') || relative.endsWith('disk-worker.cjs') ? /current product source tree/ : /LEGACY_ORIGINAL_FILE_GATE/;
  if (!relative.endsWith('disk-worker.cjs')) assert.throws(() => vm.runInNewContext(source, context), expected);
  else {
    vm.runInNewContext(source, context);
    const defeat = relative.endsWith('defeat-disk-worker.cjs');
    const folder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), defeat ? 'pf-e-defeat-disk-' : 'pf-e-status-disk-')));
    t.after(() => fs.rmSync(folder, {recursive: true, force: true}));
    write(path.join(folder, defeat ? 'OWNED.json' : 'OWNED-STATUS-DISK-TEST.json'), JSON.stringify({version: plan.version, id: 'case', caseId: 'case'}));
    await assert.rejects(exported.exports.run(defeat ? 'producer' : 'produce', defeat ? 'case' : {id: 'case'}, folder), expected);
  }
  assert.equal(observed.helper, 0, 'legacy mode never imports a helper absent from the frozen root');
  assert.equal(observed.originalFileGate + observed.originalGitGate, 1);
});

for (const entry of ['native', 'scene']) for (const mode of ['outside', 'same', 'alias', 'legacy-outside']) {
  test(`bound capture ${entry} root guard: ${mode}`, t => {
    const f = fixture(t), s = f.seal(), external = path.join(f.directory, 'outside'), alias = path.join(f.directory, 'alias');
    fs.mkdirSync(external); fs.symlinkSync(f.root, alias, 'dir');
    const override = mode === 'same' ? f.root : mode === 'alias' ? alias : external;
    const env = {PF_CAPTURE_SYNC_PRODUCT_ROOT: override, ...(mode === 'legacy-outside' ? {} : {PF_HEADLESS_REGRESSION_BINDING: s.file})};
    let externalReads = 0;
    const safeFs = {...fs, readFileSync(file, ...args) {
      if (String(file).startsWith(external + path.sep)) { externalReads++; throw Error('external content must not be read'); }
      return fs.readFileSync(file, ...args);
    }};
    function controlledRequire(name) {
      if (name.endsWith('headless-regression-binding.cjs')) return H;
      if (name === 'node:fs') return safeFs;
      if (name === 'node:test') return Object.assign(() => {}, {before() {}, after() {}});
      if (name.startsWith('node:')) return require(name);
      return {}; // No product runtime is loaded by this prefix-only synthetic guard probe.
    }
    const file = path.join(repository, `experiments/step5/4/test-capture-me-${entry}.cjs`), source = fs.readFileSync(file, 'utf8');
    let prefix;
    if (entry === 'native') prefix = source.slice(0, source.indexOf('test.before('));
    else {
      const start = source.indexOf('test.before(()=>{') + 'test.before(()=>{'.length;
      prefix = source.slice(start, source.indexOf(' temp=fs.mkdtempSync', start));
    }
    assert(prefix.includes('PF_CAPTURE_SYNC_PRODUCT_ROOT') || entry === 'native');
    const context = {ROOT: f.root, __dirname: path.join(f.root, 'experiments/step5/4'), require: controlledRequire,
      process: {env}, fs: safeFs, path, assert};
    const observedRoot = entry === 'scene' ? '\nglobalThis.selectedPluginRoot = PLUGIN_ROOT;' : '';
    const run = () => vm.runInNewContext(prefix + observedRoot + '\nthrow Error("CAPTURE_PREFIX_READY");', context);
    assert.throws(run, mode === 'outside' ? /bound capture product root/ : /CAPTURE_PREFIX_READY/);
    if (entry === 'scene' && mode !== 'outside') assert.equal(context.selectedPluginRoot, mode === 'legacy-outside' ? external : f.root);
    assert.equal(externalReads, 0, 'guard finishes before any external source read/build');
  });
}
