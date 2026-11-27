'use strict';
// These contracts consume the real official parent binding. They never compile,
// launch a host or alter its admitted files. The corruption control owns a new copy.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const {randomUUID} = require('node:crypto');
const H = require('../headless-regression-binding.cjs'), C = require('./c-regular-runtime.cjs');
const ROOT = path.resolve(__dirname, '../..');
const captured = H.capture(ROOT, process.env.PF_HEADLESS_REGRESSION_BINDING);
const clone = () => structuredClone(captured.binding);

test('all eight complete entries and their actual input group belong to the official binding', () => {
  assert.equal(C.SUITES.length, 8);
  H.boundFiles(captured, [...new Set(C.INPUTS)]);
  const verified = C.verify(ROOT, captured.binding);
  for (const suite of C.SUITES) {
    const env = C.environment(ROOT, captured, suite, {});
    assert.equal(env.PF_E3_JOINT_OUT, verified.group);
    assert.equal(env.PF_GIVEN_ENGINE, path.join(ROOT, 'js/engine/build/production.cjs'));
    assert.equal(env.PF_SHORTCUT_TRAVEL_FIXTURE, path.join(ROOT, 'tests/support/field/ui-wire-world-fixtures.cjs'));
    assert.equal(env.PF_E2_PARENT_OUT, path.join(verified.parent, 'out'));
  }
});
for (const field of ['head', 'tree', 'srcTree', 'fingerprint']) test('stale ' + field + ' identity refuses the supported group', () => {
  const binding = clone(); binding.cGenerationSupport.source[field] = '0'.repeat(64);
  assert.throws(() => C.verify(ROOT, binding), /source identity changed/);
});
for (const field of ['head', 'fingerprint']) test('official parent capture refuses wrong candidate ' + field, () => {
  const binding = clone(); binding.source[field] = '0'.repeat(64);
  assert.throws(() => H.verify(ROOT, binding), /candidate source changed/);
});
test('absent and unknown support groups are refused', () => {
  const binding = clone(); delete binding.cGenerationSupport;
  assert.throws(() => C.verify(ROOT, binding), /group missing\/unknown/);
  binding.cGenerationSupport = {...captured.binding.cGenerationSupport, schema: 'unknown'};
  assert.throws(() => C.verify(ROOT, binding), /group missing\/unknown/);
});
test('omitted native input and stale copy/source hashes are refused', () => {
  for (const kind of ['native', 'source', 'copy']) {
    const binding = clone(), support = binding.cGenerationSupport;
    if (kind === 'native') delete support.files['js/reactor_objects.js'];
    if (kind === 'source') support.files['js/engine/build/production.cjs'] = '0'.repeat(64);
    if (kind === 'copy') support.copies[support.group + '/production.cjs'].sha256 = '0'.repeat(64);
    assert.throws(() => C.verify(ROOT, binding), /closure changed/);
  }
});
test('an unbound native input is rejected by the parent source closure', () => {
  const binding = clone(); delete binding.controlledInputs['js/reactor_objects.js'];
  assert.throws(() => C.verify(ROOT, binding), /unbound consumer input/);
});
test('actual corrupted IIFE and alias target fail before execution, repair or a compiler child', () => {
  const Module = require('node:module');
  for (const name of ['PS_World.js', 'production.cjs']) {
    const binding = clone(), support = binding.cGenerationSupport;
    binding.runId = randomUUID(); const oldGroup = support.group;
    support.group = 'build/test-c-regular-runtime/' + binding.runId;
    fs.mkdirSync(path.join(ROOT, support.group)); support.copies = {};
    for (const [file] of Object.entries(C.COPIES)) {
      fs.copyFileSync(path.join(ROOT, oldGroup, file), path.join(ROOT, support.group, file), fs.constants.COPYFILE_EXCL);
      support.copies[support.group + '/' + file] = {...captured.binding.cGenerationSupport.copies[oldGroup + '/' + file]};
    }
    const file = path.join(ROOT, support.group, name);
    if (name === 'production.cjs') fs.writeFileSync(file, "module.exports = require('/foreign-c-engine');\n");
    else fs.appendFileSync(file, '\n// deliberate corruption in this contract own copy\n');
    const bytes = fs.readFileSync(file), spawn = cp.spawnSync, load = Module._load;
    let children = 0, foreignLoads = 0;
    try {
      cp.spawnSync = () => { children++; throw Error('unexpected compiler/builder'); };
      Module._load = function(request, ...args) { if (request === '/foreign-c-engine') { foreignLoads++; throw Error('foreign alias executed'); } return Reflect.apply(load, this, [request, ...args]); };
      assert.throws(() => C.verify(ROOT, binding), /copy inventory\/hash changed/);
      assert.deepEqual(fs.readFileSync(file), bytes); assert.equal(children, 0); assert.equal(foreignLoads, 0);
    } finally { cp.spawnSync = spawn; Module._load = load; }
    // Preserve both owned corruption controls for MARK_ONLY.
  }
});
test('foreign explicit paths and builders are refused before any compiler child', () => {
  const spawn = cp.spawnSync; let children = 0;
  try {
    cp.spawnSync = () => { children++; throw Error('unexpected compiler/builder'); };
    assert.throws(() => C.environment(ROOT, captured, '../unregistered', {}), /unknown C regular suite/);
    for (const [name, value] of [['PF_GIVEN_BUNDLES', '/foreign'], ['PF_D_MZ_ART', '/foreign'],
      ['PF_WILD_GENERATION_BUNDLE_DIR', '/foreign'], ['PF_FINAL_PRODUCTION_FAMILY', 'unknown']])
      assert.throws(() => C.environment(ROOT, captured, C.SUITES[0], {[name]: value}), /foreign C/);
    assert.equal(children, 0);
  } finally { cp.spawnSync = spawn; }
});
test('source, native, copy and parent output closures remain unchanged after the contracts', () => {
  assert.equal(H.capture(ROOT, process.env.PF_HEADLESS_REGRESSION_BINDING, captured.sha256).sha256, captured.sha256);
});

test('bundle engine alias is the exact formal Node module with shared private registries',()=>{const group=C.verify(ROOT,captured.binding).group;const native=require(path.join(ROOT,'js/engine/build/production.cjs'));assert.equal(require(path.join(group,'production.cjs')),native);assert.equal(require.cache[require.resolve(path.join(group,'production.cjs'))].exports,native);});
