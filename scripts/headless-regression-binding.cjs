'use strict';
// Per-run identity for ordinary synthetic Node regressions. Historical acceptance
// plans are never rewritten. This module verifies metadata/bytes and never builds.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {sourceFingerprint} = require('./framework-distribution-source.cjs');
const SCHEMA = 'headless-regression-binding-v1';
const DIST = 'build/framework-cjs';
const PLUGIN_BUNDLES = ['PS_BattleFlow', 'PS_SaveState', 'PS_Evolution', 'PS_BattleFlowTest'].map(name => `js/plugins/${name}.js`);
const CONTROLLED_INPUTS = [
  'scripts/headless-regression-binding.cjs',
  'src/vite.config.mts',
  'src/tsconfig.json', 'scripts/test-headless.sh',
  'src/plugins/PS_BattleFlow.ts',
  'experiments/step5/4/status-disk-worker.cjs', 'experiments/step5/4/defeat-disk-worker.cjs',
  'experiments/step5/4/test-e-status-disk.cjs', 'experiments/step5/4/test-e-defeat-disk.cjs',
  'experiments/step5/4/e-status-disk-contracts.json', 'experiments/step5/4/e-defeat-disk-contracts.json',
  'experiments/step5/4/trainer-ai-integration/fixtures.cjs',
  'experiments/step5/4/capture-run-current-headless-runtime.json',
  'experiments/step5/4/test-capture-me-native.cjs', 'experiments/step5/4/capture-me-native-plan.json',
  'experiments/step5/4/test-capture-me-scene.cjs', 'src/plugins', 'js/reactor_managers.js',
  'experiments/step5/4/test-capture-me-port.cjs', 'experiments/step5/4/test-battle-music-scene.cjs',
  'experiments/step5/4/h3-held-continue/test-continue.cjs', 'experiments/step5/4/h3-held-continue/worker.cjs',
  'experiments/step5/4/h3-held-continue/plan.json', 'experiments/step5/4/h3-production-policy/support.cjs',
  'experiments/step5/4/h3-production-policy/test-host.cjs', 'experiments/step5/4/h3-production-policy/host-plan.json',
  'experiments/step5/4/h3-production-policy/runtime-plan.json', 'experiments/step5/4/h3-production-policy/take-conservation-oracle.cjs',
  'experiments/step5/4/h3-production-policy/test-release-sources.cjs', 'experiments/step5/4/h3-production-policy/test-release-cancel.cjs',
  'experiments/step5/4/h3-production-policy/test-policy.cjs', 'experiments/step5/4/h3-production-policy/test-take-conservation-oracle.cjs',
  'experiments/step5/4/h3-install-outcome/test-install.cjs', 'experiments/step5/4/h3-install-outcome/plan.json',
  'experiments/step5/4/mz-slot-host.cjs', 'experiments/step5/4/continue-host.cjs',
  'experiments/step5/4/victory-music-driver-host.cjs', 'experiments/step5/4/battle-music-composition-host.cjs',
  'experiments/step5/4/victory-music-native-plan.json', 'experiments/step5/4/capture-receiving-scene-host.cjs',
  'experiments/step5/4/prebattle-native-world.cjs',
  'experiments/step5/4/test-p4-normal-continuation.cjs', 'experiments/step5/3/test-battle-entry-ownership.cjs',
  'experiments/step5/3/pokedex/h1-regressions/installed-entry-wait.cjs',
  'js/reactor_core.js', 'js/reactor_objects.js', 'js/reactor_scenes.js', 'js/reactor_windows.js', 'js/libs/pako.min.js', 'data/System.json',
];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const digestMap = map => hash(JSON.stringify(Object.entries(map).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
function fileHash(file) {
  assert(fs.lstatSync(file).isFile(), `binding requires a regular file: ${file}`);
  return hash(fs.readFileSync(file));
}
function walk(directory, prefix = '') {
  assert(fs.lstatSync(directory).isDirectory(), `binding requires a real directory: ${directory}`);
  const out = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(directory, entry.name), relative));
    else { assert(entry.isFile(), `binding refuses linked/unsupported input: ${relative}`); out.push(relative); }
  }
  return out.sort();
}
function inputHashes(root) {
  const out = {};
  for (const input of CONTROLLED_INPUTS) {
    const absolute = path.join(root, input), info = fs.lstatSync(absolute);
    const files = info.isDirectory() ? walk(absolute).map(relative => `${input}/${relative}`) : [input];
    for (const relative of files) out[relative] = fileHash(path.join(root, relative));
  }
  return out;
}
function git(root, ...args) { return execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trim(); }
function source(root) {
  return {head: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}'),
    srcTree: git(root, 'rev-parse', 'HEAD:src'), fingerprint: sourceFingerprint(root)};
}
const dirty = root => git(root, 'status', '--porcelain') !== '';
function fileToken(file) {
  if (!fs.existsSync(file)) return null;
  const stat = fs.lstatSync(file, {bigint: true}); assert(stat.isFile(), 'build output must be a regular file');
  return [stat.dev, stat.ino, stat.mtimeNs, stat.ctimeNs, stat.size].map(String).join(':');
}
function begin(root) {
  root = fs.realpathSync(root);
  return {schema: SCHEMA + '/begin', root, runId: crypto.randomUUID(), startedAt: new Date().toISOString(),
    source: source(root), controlledInputs: inputHashes(root), dirtyAtBegin: dirty(root),
    previousManifestToken: fileToken(path.join(root, DIST, 'manifest.json')),
    previousPluginTokens: Object.fromEntries(PLUGIN_BUNDLES.map(file => [file, fileToken(path.join(root, file))]))};
}
function relativeFile(root, relative) {
  assert(typeof relative === 'string' && relative && !path.isAbsolute(relative) && !relative.includes('\\')
    && relative.split('/').every(part => part && part !== '.' && part !== '..'), 'invalid manifest path');
  return path.join(root, relative);
}
function verifyDistribution(root, expectedManifestHash) {
  const out = path.join(root, DIST), manifestFile = path.join(out, 'manifest.json');
  const manifestSHA256 = fileHash(manifestFile);
  if (expectedManifestHash) assert.equal(manifestSHA256, expectedManifestHash, 'distribution manifest changed');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  assert.equal(manifest.formatVersion, 1); assert.equal(manifest.toolchain.node, process.version, 'build/consumer Node mismatch');
  assert(manifest.files && typeof manifest.files === 'object' && !Array.isArray(manifest.files), 'distribution file map missing');
  const files = Object.keys(manifest.files).sort();
  assert.deepEqual(walk(out).filter(file => !['manifest.json', 'SHA256SUMS'].includes(file)), files, 'distribution inventory changed');
  for (const relative of files) {
    assert.match(manifest.files[relative], /^[a-f0-9]{64}$/, 'invalid distribution file digest');
    assert.equal(fileHash(relativeFile(out, relative)), manifest.files[relative], 'distribution file changed: ' + relative);
  }
  const sums = [...files, 'manifest.json'].sort().map(relative => `${relative === 'manifest.json' ? manifestSHA256 : manifest.files[relative]}  ${relative}`).join('\n') + '\n';
  assert.equal(fs.readFileSync(path.join(out, 'SHA256SUMS'), 'utf8'), sums, 'distribution sums changed');
  const runtime = {};
  for (const prefix of ['js/engine/build/', 'js/engine/showdown/']) {
    const selected = files.filter(file => file.startsWith(prefix));
    assert(selected.length, 'distribution runtime missing: ' + prefix);
    assert.deepEqual(walk(path.join(root, prefix)).map(file => prefix + file), selected, 'local runtime inventory changed: ' + prefix);
    for (const relative of selected) {
      assert.equal(fileHash(relativeFile(root, relative)), manifest.files[relative], 'local runtime changed: ' + relative);
      runtime[relative] = manifest.files[relative];
    }
  }
  for (const entry of ['production', 'testing', 'engine', 'core', 'custom-formats', 'content-cli']) {
    assert(runtime[`js/engine/build/${entry}.cjs`], 'required engine entry missing: ' + entry);
  }
  const pin = /^SHOWDOWN_SHA="([a-f0-9]{40})"$/m.exec(fs.readFileSync(path.join(root, 'scripts/showdown.env'), 'utf8'))?.[1];
  assert(pin, 'Showdown pin missing'); assert.equal(manifest.dependencies.showdown.sha, pin, 'distribution Showdown pin changed');
  assert.equal(fs.readFileSync(path.join(root, 'js/engine/showdown/SOURCE_SHA'), 'utf8').trim(), pin, 'staged Showdown pin changed');
  assert.equal(runtime['js/engine/showdown/dist/config/custom-formats.js'], runtime['js/engine/build/custom-formats.cjs'], 'staged extension changed');
  return {manifest, manifestSHA256, runtimeFingerprint: digestMap(runtime), showdownSHA: pin};
}
function finish(root, started) {
  root = fs.realpathSync(root);
  assert.equal(started.schema, SCHEMA + '/begin'); assert.equal(started.root, root, 'begin snapshot belongs to another root');
  assert.deepEqual(source(root), started.source, 'source changed during controlled build');
  assert.deepEqual(inputHashes(root), started.controlledInputs, 'controlled inputs changed during build');
  const token = fileToken(path.join(root, DIST, 'manifest.json')); assert(token && token !== started.previousManifestToken, 'fresh distribution build required after begin');
  const built = verifyDistribution(root), s = built.manifest.source;
  assert.equal(s.sha, started.source.head, 'distribution source HEAD mismatch');
  assert.equal(s.tree, started.source.tree, 'distribution source tree mismatch');
  assert.equal(s.fingerprint, started.source.fingerprint, 'distribution source fingerprint mismatch');
  const pluginBundles = {};
  for (const file of PLUGIN_BUNDLES) {
    const token = fileToken(path.join(root, file));
    assert(token && token !== started.previousPluginTokens[file], 'fresh plugin build required after begin: ' + file);
    pluginBundles[file] = fileHash(path.join(root, file));
  }
  return {schema: SCHEMA, scope: 'CURRENT_SYNTHETIC_NODE_REGRESSION_NOT_HISTORICAL_NATIVE', root, runId: started.runId,
    source: started.source, controlledInputs: started.controlledInputs, controlledFingerprint: digestMap(started.controlledInputs),
    manifestSHA256: built.manifestSHA256, runtimeFingerprint: built.runtimeFingerprint, showdownSHA: built.showdownSHA,
    pluginBundles, pluginFingerprint: digestMap(pluginBundles),
    dirtyMetadata: {before: started.dirtyAtBegin, build: !!s.dirty, after: dirty(root)}, createdAt: new Date().toISOString()};
}
function verify(root, binding) {
  root = fs.realpathSync(root);
  assert.equal(binding.schema, SCHEMA); assert.equal(binding.root, root, 'candidate binding belongs to another root');
  assert.equal(binding.scope, 'CURRENT_SYNTHETIC_NODE_REGRESSION_NOT_HISTORICAL_NATIVE');
  assert.deepEqual(source(root), binding.source, 'candidate source changed');
  assert.deepEqual(inputHashes(root), binding.controlledInputs, 'candidate controlled inputs changed');
  assert.equal(digestMap(binding.controlledInputs), binding.controlledFingerprint, 'candidate input fingerprint changed');
  const built = verifyDistribution(root, binding.manifestSHA256);
  assert.equal(built.manifest.source.sha, binding.source.head); assert.equal(built.manifest.source.tree, binding.source.tree);
  assert.equal(built.manifest.source.fingerprint, binding.source.fingerprint);
  assert.equal(built.runtimeFingerprint, binding.runtimeFingerprint, 'candidate runtime fingerprint changed');
  assert.equal(built.showdownSHA, binding.showdownSHA);
  assert.deepEqual(Object.keys(binding.pluginBundles).sort(), [...PLUGIN_BUNDLES].sort(), 'candidate plugin inventory changed');
  for (const file of PLUGIN_BUNDLES) assert.equal(fileHash(path.join(root, file)), binding.pluginBundles[file], 'candidate plugin changed: ' + file);
  assert.equal(digestMap(binding.pluginBundles), binding.pluginFingerprint, 'candidate plugin fingerprint changed');
  return {runId: binding.runId, source: binding.source, controlledFingerprint: binding.controlledFingerprint,
    manifestSHA256: binding.manifestSHA256, runtimeFingerprint: binding.runtimeFingerprint, showdownSHA: binding.showdownSHA,
    pluginFingerprint: binding.pluginFingerprint, dirtyMetadata: binding.dirtyMetadata, scope: binding.scope};
}
function capture(root, file, expectedSHA256) {
  assert(file, 'parent candidate binding is required');
  const sha256 = fileHash(file);
  if (expectedSHA256 !== undefined) assert.equal(sha256, expectedSHA256, 'parent candidate binding changed or transplanted');
  const binding = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {binding, sha256, identity: verify(root, binding)};
}
function boundFiles(captured, paths) {
  const known = {...captured.binding.controlledInputs, ...captured.binding.pluginBundles};
  return Object.fromEntries(paths.map(file => { assert(Object.hasOwn(known, file), 'unbound consumer input: ' + file); return [file, known[file]]; }));
}
module.exports = {SCHEMA, CONTROLLED_INPUTS, PLUGIN_BUNDLES, begin, finish, capture, verify, boundFiles};
if (require.main === module) {
  const [command, input, output] = process.argv.slice(2), root = path.resolve(__dirname, '..');
  if (command === 'begin' && input && !output) fs.writeFileSync(input, JSON.stringify(begin(root), null, 2) + '\n', {flag: 'wx'});
  else if (command === 'finish' && input && output) {
    const binding = finish(root, JSON.parse(fs.readFileSync(input, 'utf8')));
    fs.writeFileSync(output, JSON.stringify(binding, null, 2) + '\n', {flag: 'wx'});
  } else if (command === 'verify' && input && !output) {
    const captured = capture(root, input);
    console.log(JSON.stringify({runId: captured.identity.runId, source: captured.identity.source, dirtyMetadata: captured.identity.dirtyMetadata}));
  } else throw new Error('Usage: headless-regression-binding.cjs begin <new-begin.json> | finish <begin.json> <new-binding.json> | verify <binding.json>');
}
