'use strict';
// Small dry host/synthetic stage tests. No Vite compile, no NW, no live installs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');
const { pathToFileURL } = require('node:url');
const { createStage, stagedManifest, scopedTag, assemble, verify, hash, SCOPED, NATIVE_PROFILE, PROFILE_MARKER } = require('../prepare-isolated-launch.cjs');
require('./ts-source-loader.cjs');

const actualRoot = path.resolve(__dirname, '../..');
const parent = fs.realpathSync(os.tmpdir());
const temp = fs.mkdtempSync(path.join(parent, 'pf-launch-unit-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const ordinary = fs.readFileSync(path.join(actualRoot, 'js/plugins.js'));
const files = ['index.html', 'package.json', 'js/reactor_main.js', 'js/libs/pixi.js', 'js/reactor_core.js', 'js/reactor_managers.js', 'js/reactor_objects.js',
  'js/reactor_scenes.js', 'js/engine/build/production.cjs', 'data/System.json', 'data/MapInfos.json', 'data/framework/content.json'];
function written(root, file, bytes) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true, mode: 0o700 });
  fs.writeFileSync(full, bytes, { mode: 0o600 });
}
function fixture() {
  const root = fs.mkdtempSync(path.join(temp, 'workspace-'));
  const manifest = fs.readFileSync(path.join(actualRoot, 'package.json'));
  written(root, 'package.json', manifest);
  const stage = createStage(root), game = path.join(stage, 'game');
  const reactor = {};
  written(root, 'js/plugins.js', ordinary);
  for (const { name } of stagedManifest(ordinary).ordered) {
    if (!SCOPED.includes(name)) written(root, 'js/plugins/' + name + '.js', '// ordinary ' + name + '\n');
  }
  for (const leaf of files.filter(leaf => leaf !== 'package.json')) {
    const bytes = leaf === 'index.html'
      ? Buffer.from('<html><body><script type="text/javascript" src="js/reactor_main.js"></script></body></html>')
      : Buffer.from('stub fixture ' + leaf + '\n');
    written(game, leaf, bytes);
    if (leaf.startsWith('js/reactor_') || leaf.startsWith('js/libs/')) reactor['runtime/' + leaf.slice(3)] = hash(bytes);
  }
  written(root, 'scripts/reactor-source-manifest.json', JSON.stringify({ runtime: reactor }));
  const epoch = fs.readFileSync(path.join(stage, '.pf-isolated-stage'), 'utf8').trimEnd();
  const scoped = (_root, _stage, name) => written(game, 'js/plugins/' + name + '.js', scopedTag(name, stage, epoch, NATIVE_PROFILE) + '\n// fake compile\n');
  const seal = () => hash(fs.readFileSync(path.join(stage, 'launch-plan.json')));
  return { root, stage, game, scoped, epoch, seal };
}

test('project exact ordinary generated rows; move only SaveLocation and preserve all original settings', () => {
  const raw = JSON.parse(/var \$plugins\s*=\s*(\[[\s\S]*\]);/.exec(ordinary.toString())[1]);
  const { ordered, bytes } = stagedManifest(ordinary);
  assert.ok(raw.findIndex(x => x.name === 'PS_RuntimeFixes') < raw.findIndex(x => x.name === 'PS_SaveLocation'));
  assert.deepEqual(ordered.filter(x => x.name !== 'PS_SaveLocation'), raw.filter(x => x.name !== 'PS_SaveLocation'));
  assert.deepEqual(ordered.find(x => x.name === 'PS_SaveLocation'), raw.find(x => x.name === 'PS_SaveLocation'));
  const names = ordered.map(row => row.name);
  for (const consumer of SCOPED.slice(1)) assert.ok(names.indexOf('PS_SaveLocation') < names.indexOf(consumer), consumer);
  assert.ok(names.indexOf('PS_BattleFlow') < names.indexOf('PS_BattleFlowTest'));
  assert.equal(fs.readFileSync(path.join(actualRoot, 'js/plugins.js')).equals(ordinary), true);
  assert.doesNotThrow(() => stagedManifest(bytes));
  for (const mutate of [
    rows => { rows[2].name = rows[1].name; },
    rows => { rows[2].name = '../Injected'; },
    rows => { rows[2].status = false; },
    rows => { rows.find(x => x.name === 'PS_BattleFlow').parameters.contentSource = 'fixture'; },
    rows => { rows.unshift(rows.pop()); },
  ]) {
    const data = structuredClone(raw);
    mutate(data);
    assert.throws(() => stagedManifest(Buffer.from('var $plugins = ' + JSON.stringify(data) + ';')), /isolated-/);
  }
});
test('fresh canary envelopes fix all paths and are sealed for default and explicit scene without raw test', () => {
  for (const scene of [false, true]) {
    const f = fixture(), plan = assemble(f.root, f.stage, scene, f.scoped);
    assert.deepEqual(verify(f.root, f.stage, f.seal()), plan);
    assert.equal(fs.readlinkSync(path.join(f.game, 'js/reactor_plugins.js')), 'plugins.js');
    assert.deepEqual(plan.argv.slice(2), [
      '--ps-isolated-test', '--user-data-dir=' + path.join(f.stage, 'profile'), '--ps-save-dir=' + path.join(f.stage, 'saves'),
      '--ps-flow-test=launcher-canary', '--ps-flow-out=' + path.join(f.stage, 'evidence/report.json'), '--ps-flow-quit',
      ...(scene ? ['--ps-fix=scene'] : []),
    ]);
    assert.deepEqual(fs.readdirSync(path.join(f.stage, 'saves')), []);
    assert.deepEqual(fs.readdirSync(path.join(f.stage, 'evidence')), []);
    assert.throws(() => assemble(f.root, f.stage, scene, f.scoped), /already-exists/);
    assert.equal(fs.readFileSync(path.join(f.root, 'js/plugins.js')).equals(ordinary), true);
    const base = JSON.parse(fs.readFileSync(path.join(f.root, 'package.json')));
    const projected = JSON.parse(fs.readFileSync(path.join(f.game, 'package.json')));
    assert.equal(projected.name, 'pf-step6d-launch-' + f.epoch.slice(0, 24));
    assert.deepEqual({ ...projected, name: base.name }, base);
    assert.equal(fs.readFileSync(path.join(f.stage, PROFILE_MARKER), 'utf8'), NATIVE_PROFILE + '\n');
    assert.deepEqual(plan.profile, {
      contract:NATIVE_PROFILE, appName:projected.name, dataPath:path.join(f.stage, 'profile', 'Default'),
      home:path.join(f.stage, 'home'), temporary:path.join(f.stage, 'tmp'),
    });
  }
});
test('missing, late and mixed artifacts, replaced manifest, plan and output aliases stop preflight', () => {
  for (const change of [
    f => fs.unlinkSync(path.join(f.game, 'js/plugins/PS_SaveLocation.js')),
    f => written(f.game, 'js/plugins/PS_SaveLocation.js', '// ordinary\n'),
    f => written(f.game, 'js/plugins/PS_RuntimeFixes.js', scopedTag('PS_RuntimeFixes', f.stage, 'a'.repeat(64), NATIVE_PROFILE) + '\n'),
    f => written(f.game, 'js/plugins/PS_RuntimeFixes.js', scopedTag('PS_RuntimeFixes', f.stage, f.epoch) + '\n'),
    f => fs.unlinkSync(path.join(f.stage, PROFILE_MARKER)),
    f => written(f.stage, PROFILE_MARKER, 'unmeasured-profile\n'),
    f => { fs.rmdirSync(path.join(f.stage, 'home')); fs.symlinkSync(path.join(f.stage, 'tmp'), path.join(f.stage, 'home')); },
    f => fs.mkdirSync(path.join(f.stage, 'profile/Default')),
    f => written(f.game, 'js/plugins.js', ordinary), // late SaveLocation
    f => { fs.unlinkSync(path.join(f.game, 'js/reactor_plugins.js')); fs.symlinkSync(path.join(f.root, 'js/plugins.js'), path.join(f.game, 'js/reactor_plugins.js')); },
    f => written(f.game, 'js/plugins/PS_Inventory.js', '// altered ordinary\n'),
    f => written(f.stage, 'launch-plan.json', '{}'),
    f => { fs.rmdirSync(path.join(f.stage, 'profile')); fs.symlinkSync(path.join(f.stage, 'saves'), path.join(f.stage, 'profile')); },
    f => { fs.rmdirSync(path.join(f.stage, 'evidence')); fs.symlinkSync(path.join(f.stage, 'saves'), path.join(f.stage, 'evidence')); },
    f => written(f.stage, 'saves/global.rmmzsave', 'synthetic cannot be reused'),
    f => fs.mkdirSync(path.join(f.game, 'save')),
  ]) {
    const f = fixture();
    assemble(f.root, f.stage, true, f.scoped);
    const seal = f.seal();
    change(f);
    assert.throws(() => verify(f.root, f.stage, seal), /isolated-/);
  }
});
test('preflight rejects stale settings or hydration before writing any manifest or build output', () => {
  for (const change of [
    f => fs.unlinkSync(path.join(f.game, 'index.html')),
    f => written(f.game, 'index.html', '<script src="js/main.js"></script>'),
    f => written(f.game, 'js/main.js', '// stock loader must not be an input'),
    f => written(f.game, 'package.json', '{ "chromium-args": "--anything" }'),
    f => written(f.game, 'js/reactor_managers.js', '// different Reactor'),
    f => written(f.game, 'js/libs/pixi.js', '// different pinned lib'),
  ]) {
    const f = fixture();
    change(f);
    assert.throws(() => assemble(f.root, f.stage, false, () => assert.fail('build must not begin')), /isolated-/);
    assert.equal(fs.existsSync(path.join(f.game, 'js/plugins.js')), false);
  }
  assert.throws(() => assemble(temp, actualRoot, true), /isolated-stage-not-owned-child/);
});

const source = file => import(pathToFileURL(path.join(actualRoot, 'src/plugins', file)).href);
function hostFor(f, scene, S, options = {}) {
  const profile = path.join(f.stage, 'profile'), saveDirectory = path.join(f.stage, 'saves');
  const appDataPath = options.literalRoot ? profile : path.join(profile, 'Default');
  const stage = { root: f.stage, epoch: f.epoch, saveDirectory, storagePath: saveDirectory + path.sep, appDataPath };
  let setup = 0, quit = 0;
  function Scene_Boot() {}
  const original = Scene_Boot.prototype.start = function () {
    setup++;
    H.$gameSystem = { _psGame: { party: [] } };
    return 'unchanged boot return';
  };
  const H = { require, Scene_Boot, PSFlow: {}, __psRuntimeFixes: { textureFix: true, batcherFix: true, sceneFix: scene },
    nw: { App: { dataPath: appDataPath, quit() { quit++; } } },
    StorageManager: { fileDirectoryPath() { return stage.storagePath; } },
    Utils: { isOptionValid: name => options.queryTest && name === 'test' },
    PluginManager: { parameters: () => ({ contentSource: 'sample' }) } };
  S.bindIsolatedTestStorage(H, stage, H.StorageManager.fileDirectoryPath);
  S.bindIsolatedTestBattleFlow(H, H.PSFlow, stage);
  if (options.fixes !== 'ordinary') S.bindIsolatedRuntimeFixes(H, H.__psRuntimeFixes,
    options.fixes === 'late' ? null : stage);
  if (options.fixes === 'mixed') H.__psRuntimeFixes = { textureFix: true, batcherFix: true, sceneFix: scene };
  if (options.profile === 'wrong') H.nw.App.dataPath = saveDirectory;
  if (options.storage === 'wrong') H.StorageManager.fileDirectoryPath = () => stage.storagePath;
  const argv = assemble(f.root, f.stage, scene, f.scoped).argv.slice(1);
  if (!options.literalRoot) fs.mkdirSync(appDataPath, { mode: 0o700 }); // browser-owned unique child after preflight
  if (options.extra) argv.push(options.extra);
  return { H, stage, argv, original, counts: () => [setup, quit] };
}
test('source canary observes both fixed flag modes only after ordinary setup, once and inside the stage', async () => {
  const S = await source('isolated-test-scope.ts'), C = await source('flowtest/isolated-launch-canary.ts');
  for (const scene of [false, true]) {
    const f = fixture(), h = hostFor(f, scene, S, { literalRoot: !scene });
    C.installIsolatedLaunchCanary(h.H, h.stage, h.argv);
    assert.notEqual(h.H.Scene_Boot.prototype.start, h.original);
    const b = new h.H.Scene_Boot();
    assert.equal(b.start(), 'unchanged boot return');
    const report = JSON.parse(fs.readFileSync(path.join(f.stage, 'evidence/report.json'), 'utf8'));
    assert.deepEqual(report, { schema: 1, mode: 'launcher-canary', overall: 'pass', requestedScene: scene, observations: {
      profileBound: true, storageBound: true, flowBound: true, fixesBound: true,
      ordinaryState: true, texture: true, batcher: true, scene,
    }});
    assert.deepEqual(h.counts(), [1, 1]);
    assert.equal(b.start(), 'unchanged boot return');
    assert.deepEqual(h.counts(), [2, 1]);
    assert.deepEqual(fs.readdirSync(path.join(f.stage, 'saves')), []);
  }
});
test('raw test and untrusted path/authority/missing late mixed options never install a boot hook', async () => {
  const S = await source('isolated-test-scope.ts'), C = await source('flowtest/isolated-launch-canary.ts');
  for (const options of [
    { extra: 'test' }, { queryTest: true }, { extra: '--ps-flow-test=all' }, { extra: '--ps-fix=scene' },
    { extra: '--ps-flow-out=/not-used' }, { extra: '--ps-flow-shots=/not-used' }, { extra: '--ps-flow-expected-dir=/not-used' },
    { fixes: 'ordinary' }, { fixes: 'late' }, { fixes: 'mixed' }, { profile: 'wrong' }, { storage: 'wrong' },
  ]) {
    const f = fixture(), h = hostFor(f, true, S, options);
    C.installIsolatedLaunchCanary(h.H, h.stage, h.argv);
    assert.equal(h.H.Scene_Boot.prototype.start, h.original);
    assert.equal(new h.H.Scene_Boot().start(), 'unchanged boot return');
    assert.deepEqual(h.counts(), [1, 0]);
    assert.deepEqual(fs.readdirSync(path.join(f.stage, 'evidence')), []);
    assert.deepEqual(fs.readdirSync(path.join(f.stage, 'saves')), []);
  }
});
