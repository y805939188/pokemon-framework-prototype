'use strict';
// Keep the emitted ordinary driver's inert gate separate from the bundled pure D2 entry.
// No native authority, same-stage driver admission, input or hundred-battle execution.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const ROOT = fs.realpathSync(path.resolve(__dirname, '../../..'));
const MODE = '--ps-flow-test=d2-normal-f100';
const PROD = './js/engine/build/production.cjs';
const currentProduction = () => require(path.join(ROOT, PROD));
let work, A, text;

test.before(async () => {
  work = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'normal-consumer-compat-'));
  const vite = require(require.resolve('vite', { paths: [path.join(ROOT, 'src')] }));
  const aggregate = path.join(work, 'entry.ts');
  fs.writeFileSync(aggregate, ['entry', 'route', 'tools'].map(n =>
    'export * from ' + JSON.stringify(path.join(ROOT, 'src/plugins/flowtest/d2-normal-' + n + '.ts')) + ';').join('\n'),
    { flag: 'wx', mode: 0o600 });
  await vite.build({ configFile: false, root: ROOT, logLevel: 'error', build: {
    outDir: path.join(work, 'api'), minify: false,
    lib: { entry: aggregate, formats: ['cjs'], fileName: () => 'entry.cjs' }
  } });
  A = require(path.join(work, 'api/entry.cjs'));

  const env = { ...process.env, RR_PLUGIN: 'PS_BattleFlowTest' };
  delete env.RR_ISOLATED_TEST_STAGE; // This lane can never compile a stamped driver.
  const out = path.join(work, 'ordinary-driver');
  const r = spawnSync(process.execPath,
    [path.join(ROOT, 'src/node_modules/vite/bin/vite.js'), 'build', '--configLoader', 'runner', '--outDir', out],
    { cwd: path.join(ROOT, 'src'), env, encoding: 'utf8', timeout: 90000 });
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const emitted = path.join(out, 'PS_BattleFlowTest.js');
  assert.ok(fs.lstatSync(emitted).isFile(), 'fresh ordinary driver JS is a regular output');
  text = fs.readFileSync(emitted, 'utf8');
  const metadata = fs.readFileSync(path.join(ROOT, 'src/plugins/PS_BattleFlowTest.meta.txt'), 'utf8').trim();
  // Rolldown can remove the presentation indent from star-prefixed banner lines.
  // Check the actual first RPG Maker header, not a searched or reconstructed banner.
  const banner = text.match(/^\/\*:[\s\S]*?\*\//)?.[0];
  const commentLayout = value => value.replace(/\r\n/g, '\n').replace(/^[ \t]+(?=\*)/gm, '');
  assert.ok(metadata && banner, 'the emitted JS starts with the RPG Maker metadata header');
  assert.equal(commentLayout(banner), commentLayout(metadata), 'the emitted header carries the exact driver metadata');
  assert.doesNotMatch(text, /^\/\/ PF-SCOPED-IIFE-v1\b/m);
});
test.after(() => { if (work) fs.rmSync(work, { recursive: true, force: true }); });

const assertNoNormalConsumer = W => assert.equal(Object.hasOwn(W, 'PSNormalD2'), false);
function assertInertOrdinaryDriver(argv) {
  const actions = [], switches = Object.freeze([...argv]);
  const refuse = name => () => { actions.push(name); throw Error('unexpected ordinary driver action: ' + name); };
  const W = { PSEvolution: { automatic: true }, PSFlow: Object.freeze({}), addEventListener: refuse('window-listener') };
  const App = Object.defineProperty({}, 'argv', { get() { actions.push('argv'); return switches; } });
  const G = {
    window: W, nw: { App }, require: Object.assign(refuse('require'), { resolve: refuse('resolve') }),
    SceneManager: { isGameActive: refuse('focus'), update: refuse('update'), updateMain: refuse('update-main') },
    AudioManager: Object.fromEntries(['playBgm', 'playBgs', 'playMe', 'playSe', 'playStaticSe'].map(k => [k, refuse(k)])),
    StorageManager: { fileDirectoryPath: refuse('storage-directory') },
    document: { addEventListener: refuse('document-listener'), hasFocus: refuse('document-focus') },
    setTimeout: refuse('timer'), setInterval: refuse('interval'), requestAnimationFrame: refuse('animation')
  };
  const surfaces = [W, W.PSEvolution, G.SceneManager, G.AudioManager, G.StorageManager, G.document];
  const before = surfaces.map(Object.getOwnPropertyDescriptors);
  vm.createContext(G);
  assert.doesNotThrow(() => vm.runInContext(text, G, { filename: 'ordinary-PS_BattleFlowTest.js', timeout: 2000 }));
  assert.deepEqual(actions, [], 'the unstamped IIFE returns before argv, requires, timers, storage or UI effects');
  assert.deepEqual(surfaces.map(Object.getOwnPropertyDescriptors), before, 'no focus/audio/driver state hooks installed');
  assertNoNormalConsumer(W);
  assert.equal(Object.hasOwn(G, '$gameSystem'), false);
}
test('unstamped emitted driver is inert before route parsing, even for raw test flags and known modes', () => {
  const out = path.join(work, 'not-created-flow-out.json');
  const namedBinding = path.join(work, 'not-read-native-binding.json');
  for (const argv of [
    [], [MODE], ['--ps-flow-test=unknown'], ['--ps-flow-test='], [MODE, '--ps-flow-test=all'],
    [MODE, '--ps-d2-normal-stage=offline-prepare'],
    [MODE, '--ps-d2-normal-stage=native-qualification', '--ps-d2-native-binding=' + namedBinding],
    ['test', '--ps-isolated-test', '--ps-flow-test=all', '--ps-flow-out=' + out],
  ]) assertInertOrdinaryDriver(argv);
  assert.equal(fs.existsSync(out), false);
  assert.equal(fs.existsSync(namedBinding), false);
});

// The compact CJS bundle above is compiled from the same source modules
// imported by the real driver, not a driver activation or a fake scope.
function prepareNormal(args = [], nodeRequire = id => { throw Error('unexpected preparation require: ' + id); }) {
  const argv = [MODE, ...args];
  assert.deepEqual(A.classifyFlowTestRoute(argv), { kind: 'normal', mode: 'd2-normal-f100' });
  const host = { G: Object.freeze({}), W: Object.freeze({}) };
  const entry = A.prepareNormalD2Entry(argv, nodeRequire, host);
  assert.equal(Object.hasOwn(host.G, '$gameSystem'), false);
  assertNoNormalConsumer(host.W);
  return { entry, host };
}

test('bundled route is inactive with no switch and rejects unknown or ambiguous modes', () => {
  assert.deepEqual(A.classifyFlowTestRoute([]), { kind: 'inactive' });
  for (const argv of [['--ps-flow-test=unknown'], ['--ps-flow-test='], [MODE, '--ps-flow-test=all']])
    assert.throws(() => A.classifyFlowTestRoute(argv), /unsupported|ambiguous/);
});
test('bundled normal entry without stage stays blocked before requires or hooks', () => {
  const { entry } = prepareNormal();
  assert.equal(entry.status, 'BLOCKED_BEFORE_EXECUTION');
  assert.equal(entry.actualBattles, 0);
  assert.equal(entry.nativeAdmission, false);
  assert.equal(entry.consume, undefined);
});
test('bundled normal entry rejects partial selectors, formal and ambiguous stage', () => {
  for (const args of [
    ['--ps-flow-only=T1', '--ps-d2-normal-stage=offline-prepare'],
    ['--ps-d2-normal-stage=formal'], ['--ps-d2-normal-stage=unknown'],
    ['--ps-d2-normal-stage=native-preflight', '--ps-d2-normal-stage=native-qualification'],
  ]) assert.throws(() => prepareNormal(args), /partial|unsupported|ambiguous/);
});
test('bundled native qualification without binding never creates a consumer', () => {
  const { entry } = prepareNormal(['--ps-d2-normal-stage=native-qualification'], require);
  assert.equal(entry.status, 'BLOCKED_NATIVE_BINDING_MISSING');
  assert.equal(entry.consume, undefined);
  assert.equal(entry.nativeAdmission, false);
  assert.equal(entry.actualBattles, 0);
});
test('bundled offline authored-100 policy and fixture compile against current production without attachment', () => {
  const E = currentProduction();
  const { entry } = prepareNormal(['--ps-d2-normal-stage=offline-prepare'], id => id === PROD ? E : require(id));
  assert.equal(entry.status, 'OFFLINE_PREPARED_EXECUTION_BLOCKED');
  assert.equal(entry.policyCases, 100);
  assert.equal(entry.actualBattles, 0);
  assert.equal(entry.stateHostAttached, false);
  assert.equal(entry.normalDriverInstalled, false);
  assert.equal(entry.actualInputSent, false);
  assert.equal(entry.nativeAdmission, false);
  assert.equal(entry.sourceObserver, 'SESSION_SEAM_PRESENT_HOST_OBSERVERS_UNVERIFIED');
  assert.equal(typeof E.session.readSessionRequestContext, 'function', 'actual source seam exists without granting native admission');
});
test('legacy route allowlist matches current dispatcher without executing legacy modes', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/plugins/PS_BattleFlowTest.ts'), 'utf8');
  const start = source.indexOf('try { if(mode ===');
  assert.ok(start >= 0, 'legacy dispatcher still has an independently read allowlist source');
  const dispatch = source.slice(start);
  const expected = [...new Set(['all', ...Array.from(dispatch.matchAll(/mode\s*===?\s*["']([^"']+)["']/g), match => match[1])])].sort();
  assert.deepEqual([...A.LEGACY_FLOW_MODES].sort(), expected);
  for (const mode of expected) assert.deepEqual(A.classifyFlowTestRoute(['--ps-flow-test=' + mode]), { kind: 'legacy', mode });
});
test('bundled entry: valid binding bytes cannot substitute missing product source observation or acquire authority', () => {
  const tools = A.createReviewedNormalTools(require), file = path.join(work, 'negative-binding-metadata.json'), nonce = '1'.repeat(32);
  const [appRoot, profileRoot, saveRoot, outputRoot] = ['app', 'profile', 'saves', 'output'].map(k => path.join(work, 'unattached-' + k));
  const b = {
    version: 'D2-native-qualification-binding-v1', stage: 'QUALIFICATION', role: 'candidate', mode: 'natural',
    nonce, groupId: 'qualification-candidate-' + nonce,
    sourceHead: '44ca0c2d008f929b990f65917a8965a6efed69a0', sourceTree: '30ce29df3d033ce1d083bfa4b6c037cd46dc9643',
    pairBytesSHA256: '2'.repeat(64), packageInventorySHA256: '3'.repeat(64), sharedBridgeSHA256: '4'.repeat(64),
    donorHash: tools.donorHash, presentationHash: tools.presentationHash, appRoot, profileRoot, saveRoot, outputRoot,
    caseIds: tools.compileNavigation().cases.map(c => c.id), budget: { caseMs: 1000, runMs: 100000 }, view: { width: 816, height: 624, dpr: 2 }
  };
  const bytes = Buffer.from(JSON.stringify(b));
  fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
  const production = currentProduction();
  const E = { ...production, session: { ...production.session, readSessionRequestContext: undefined } }; // existing missing-seam negative, not an authority
  const { entry, host } = prepareNormal(['--ps-d2-normal-stage=native-qualification', '--ps-d2-native-binding=' + file],
    id => id === PROD ? E : require(id));
  assert.equal(entry.status, 'BINDING_BYTES_VALID_NATIVE_AUTHORITY_UNBOUND');
  assert.equal(entry.authority, 'CLOSED_NOT_CREATED_FROM_JSON');
  assert.equal(entry.consumer, 'EXPLICIT_LIVE_AUTHORITY_REQUIRED_NOT_AUTOSTARTED');
  let binds = 0, writes = 0;
  assert.throws(() => entry.consume(
    { bindGroup() { binds++; throw Error('unexpected authority call'); } },
    { append() { writes++; throw Error('unexpected evidence write'); } }), /source observation unavailable/);
  assert.equal(binds, 0);
  assert.equal(writes, 0);
  assert.equal(Object.hasOwn(host.G, '$gameSystem'), false);
  assertNoNormalConsumer(host.W);
  assert.equal(entry.nativeAdmission, false);
  assert.equal(entry.actualBattles, 0);
  assert.deepEqual(fs.readFileSync(file), bytes);
  assert.ok([appRoot, profileRoot, saveRoot, outputRoot].every(p => !fs.existsSync(p)), 'synthetic binding metadata never mounts a host');
});
