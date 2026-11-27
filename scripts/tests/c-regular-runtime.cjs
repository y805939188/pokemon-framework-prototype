'use strict';
// Input preparation for the eight finite C regressions. Copies retain the current
// formal build's bytes; the test preload only verifies and selects those inputs.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const SCHEMA = 'c-generation-supported-inputs-v1';
const SUITES = [
  'tests/regression/world/test-wild-initial-forms.cjs',
  'tests/regression/field/test-flute-real-parent.cjs',
  'tests/regression/world/test-given-wild-application.cjs',
  'tests/regression/world/test-given-wild-production.cjs',
  'tests/regression/field/test-flute-level-consumer.cjs',
  'tests/regression/field/test-flute-production-ui.cjs',
  'tests/regression/world/test-generated-event-application.cjs',
  'tests/regression/world/test-generated-event-production.cjs',
];
const NATIVE = require('./final-production-inputs.json').pinnedNativeFiles;
const COPIES = {
  'production.cjs': 'js/engine/build/production.cjs',
  'PS_BattleFlow.js': 'js/plugins/PS_BattleFlow.js',
  'PS_World.js': 'js/plugins/PS_World.js',
  'PS_Inventory.js': 'js/plugins/PS_Inventory.js',
  'PS_Management.js': 'js/plugins/PS_Management.js',
};
const INPUTS = [...SUITES, 'scripts/tests/c-regular-runtime.cjs', 'scripts/tests/c-regular-runtime.test.cjs',
  'tests/support/world/given-wild-support.cjs',
  'tests/support/world/generated-event-native-support.cjs',
  'tests/support/world/ordinary-wild-host.cjs',
  'tests/support/world/wild-generation-support.cjs',
  'tests/support/world/wild-member-cache-support.cjs',
  ...require('./final-production-inputs.json').controlledInputs];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function hash(file) { assert(fs.lstatSync(file).isFile(), 'regular C input required: ' + file); return sha(fs.readFileSync(file)); }
function inside(root, relative) {
  assert(typeof relative === 'string' && relative && !path.isAbsolute(relative) && !relative.includes('\\') &&
    relative.split('/').every(part => part && part !== '.' && part !== '..'), 'invalid C input path');
  return path.join(root, relative);
}
function inventory(directory, prefix = '') {
  assert(fs.lstatSync(directory).isDirectory(), 'regular C directory required');
  return Object.fromEntries(fs.readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const relative = prefix ? prefix + '/' + entry.name : entry.name, file = path.join(directory, entry.name);
    if (entry.isDirectory()) return Object.entries(inventory(file, relative));
    assert(entry.isFile(), 'linked/unsupported C support input: ' + file);
    return [[relative, hash(file)]];
  }));
}
function expectedSources(root, binding) {
  const H = require('../headless-regression-binding.cjs');
  const files = H.boundFiles({binding}, [...new Set([...INPUTS, ...NATIVE, ...Object.values(COPIES).filter(p => p.startsWith('js/plugins/'))])]);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'build/framework-cjs/manifest.json'), 'utf8'));
  files[COPIES['production.cjs']] = manifest.files[COPIES['production.cjs']];
  assert.match(files[COPIES['production.cjs']], /^[a-f0-9]{64}$/, 'formal C engine missing');
  const pins = JSON.parse(fs.readFileSync(path.join(root, 'scripts/reactor-source-manifest.json'), 'utf8'));
  for (const file of NATIVE) assert.equal(files[file], pins.runtime['runtime/' + file.slice(3)], 'C native input differs from project pin: ' + file);
  for (const [file, digest] of Object.entries(files)) assert.equal(hash(inside(root, file)), digest, 'C support source changed: ' + file);
  return files;
}
function verifyParent(root, parent) {
  assert.match(parent.inputHash, /^[a-f0-9]{64}$/);
  assert.equal(parent.directory, 'build/test-field-action-runtime/' + parent.inputHash, 'foreign C parent cache');
  const directory = inside(root, parent.directory), manifestFile = path.join(directory, 'manifest.json');
  assert.equal(hash(manifestFile), parent.manifestSHA256, 'C parent manifest changed');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  assert.equal(manifest.inputHash, parent.inputHash);
  assert.equal(sha(JSON.stringify(manifest.inputs)), parent.inputHash, 'C parent input fingerprint changed');
  const actual = inventory(directory); delete actual['manifest.json'];
  assert.deepEqual(actual, manifest.outputs, 'C parent output inventory/hash changed');
  for (const [file, digest] of Object.entries(manifest.loadedInputs)) assert.equal(hash(file), digest, 'C parent loaded input changed: ' + file);
  for (const [file, digest] of Object.entries(manifest.inputs.sources)) assert.equal(hash(inside(root, file)), digest, 'C parent source changed: ' + file);
  assert.equal(hash(manifest.inputs.node.executable), manifest.inputs.node.hash, 'C parent Node changed');
  assert.equal(hash(manifest.inputs.tools.binary), manifest.inputs.tools.binaryHash, 'C parent compiler changed');
  return directory;
}
function engineAlias(root) { return "'use strict';\nmodule.exports = require(" + JSON.stringify(path.join(root, COPIES['production.cjs'])) + ");\n"; }
function copyRecord(root, name, source, files) { return {source, kind: name === 'production.cjs' ? 'formal-engine-alias' : 'byte-copy', sha256: name === 'production.cjs' ? sha(engineAlias(root)) : files[source]}; }
function prepare(root, binding) {
  // Called once by finish after the fresh distribution and installed IIFEs.
  // The regular parent preparer owns its strict 16-entry source/tool-bound cache.
  assert.equal(fs.realpathSync(root), ROOT, 'C preparation belongs to this checkout');
  const files = expectedSources(root, binding);
  const built = require('../../tests/support/field/regular-field-action-test-runtime.cjs').prepare('parent');
  assert.equal(built.mode, 'default', 'C preparation refuses foreign explicit parent inputs');
  const parent = {directory: path.relative(root, built.directory), inputHash: built.inputHash,
    manifestSHA256: hash(path.join(built.directory, 'manifest.json'))};
  verifyParent(root, parent);
  assert.match(binding.runId, /^[a-f0-9-]{36}$/);
  const group = 'build/test-c-regular-runtime/' + binding.runId;
  fs.mkdirSync(path.dirname(inside(root, group)), {recursive: true});
  fs.mkdirSync(inside(root, group)); // Never overwrite or repair an existing group.
  const copies = {};
  for (const [name, source] of Object.entries(COPIES)) {
    const destination = group + '/' + name;
    const record = copyRecord(root, name, source, files);
    if (name === 'production.cjs') fs.writeFileSync(inside(root, destination), engineAlias(root), {flag:'wx'});
    else fs.copyFileSync(inside(root, source), inside(root, destination), fs.constants.COPYFILE_EXCL);
    assert.equal(hash(inside(root, destination)), record.sha256, 'C input copy differs');
    copies[destination] = record;
  }
  const supported = {schema: SCHEMA, group, source: binding.source, files, copies, parent};
  verify(root, {...binding, cGenerationSupport: supported});
  return supported;
}
function verify(root, binding) {
  const support = binding.cGenerationSupport;
  assert(support && support.schema === SCHEMA, 'C supported input group missing/unknown');
  assert.deepEqual(support.source, binding.source, 'C supported source identity changed');
  assert.equal(support.group, 'build/test-c-regular-runtime/' + binding.runId, 'foreign C supported group');
  assert.deepEqual(support.files, expectedSources(root, binding), 'C supported source closure changed');
  const expected = Object.fromEntries(Object.entries(COPIES).map(([name, source]) =>
    [support.group + '/' + name, copyRecord(root, name, source, support.files)]));
  assert.deepEqual(support.copies, expected, 'C supported copy closure changed');
  assert.deepEqual(inventory(inside(root, support.group)), Object.fromEntries(Object.entries(COPIES).map(([name, source]) =>
    [name, copyRecord(root, name, source, support.files).sha256])), 'C supported copy inventory/hash changed');
  return {group: inside(root, support.group), parent: verifyParent(root, support.parent)};
}
function environment(root, captured, suite, inherited = process.env) {
  assert(SUITES.includes(suite), 'unknown C regular suite: ' + suite);
  const {group, parent} = verify(root, captured.binding);
  const desired = {
    PF_GIVEN_ENGINE: path.join(root, 'js/engine/build/production.cjs'),
    PF_FLUTE_ENGINE: path.join(root, 'js/engine/build/production.cjs'),
    PF_GIVEN_BUNDLES: group, PF_E3_JOINT_OUT: group, PF_E3_NATIVE_ROOT: root,
    PF_MZ_RUNTIME: path.join(root, 'js/reactor_objects.js'),
    PF_MZ_RUNTIME_OBJECTS: path.join(root, 'js/reactor_objects.js'),
    PF_MZ_RUNTIME_MANAGERS: path.join(root, 'js/reactor_managers.js'),
    PF_MZ_RUNTIME_SCENES: path.join(root, 'js/reactor_scenes.js'),
    PF_SHORTCUT_TRAVEL_FIXTURE: path.join(root, 'tests/support/field/ui-wire-world-fixtures.cjs'),
    PF_SHORTCUT_PRODUCTION_BUNDLE: path.join(group, 'PS_Management.js'),
    PF_FIELD_MOVE_APP_OUT: path.join(parent, 'out/src'),
    PF_FIELD_MOVE_APP_BUNDLE: path.join(parent, 'bundles/field-move-operation.cjs'),
    PF_E2_PARENT_OUT: path.join(parent, 'out'),
    PF_E2_PARENT_ENGINE: path.join(root, 'js/engine/build/production.cjs'),
  };
  for (const name of ['PF_WILD_GENERATION_BUNDLE_DIR', 'PF_WILD_CACHE_BUNDLE_DIR', 'PF_D_NOTICE_BUNDLES',
    'PF_D_MZ_COMPILER_ROOT', 'PF_D_MZ_ART', 'PF_FINAL_PRODUCTION_FAMILY'])
    assert.equal(inherited[name], undefined, 'foreign C builder/source override refused: ' + name);
  for (const [name, value] of Object.entries(desired)) if (inherited[name] !== undefined)
    assert.equal(inherited[name], value, 'foreign C explicit input refused: ' + name);
  return desired;
}
function capture(suite) {
  const H = require('../headless-regression-binding.cjs');
  const captured = H.capture(ROOT, process.env.PF_HEADLESS_REGRESSION_BINDING);
  return {captured, env: environment(ROOT, captured, suite)};
}
module.exports = {SCHEMA, SUITES, INPUTS, COPIES, NATIVE, prepare, verify, environment};
if (require.main === module) {
  const [command, suite] = process.argv.slice(2);
  assert(command === 'describe' && suite && process.argv.length === 4, 'usage: c-regular-runtime.cjs describe <registered-suite>');
  const {captured, env} = capture(suite);
  console.log(JSON.stringify({schema: SCHEMA + '/execution-inputs', suite, parentBindingSHA256: captured.sha256,
    source: captured.identity.source, inputGroup: captured.binding.cGenerationSupport, explicitEnvironment: env}, null, 2));
} else if (process.env.PF_C_REGULAR_SUITE) {
  const {env} = capture(process.env.PF_C_REGULAR_SUITE);
  Object.assign(process.env, env);
}
