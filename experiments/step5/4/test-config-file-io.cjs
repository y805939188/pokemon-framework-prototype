'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createConfigHost } = require('./config-file-io-host.cjs');
const ROOT = path.resolve(__dirname, '../../..');
let work, plugins, pluginFiles, seq = 0;
test.before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-config-file-io-'));
  plugins = {}; pluginFiles = {};
  const vite = require(require.resolve('vite', { paths: [path.join(ROOT, 'src')] }));
  for (const name of ['PS_BattleFlow', 'PS_SaveState', 'PS_SaveLocation']) {
    await vite.build({ configFile: false, root: ROOT, logLevel: 'error', build: {
      outDir: path.join(work, 'plugins'), emptyOutDir: false, minify: false,
      lib: { entry: path.join(ROOT, 'src/plugins', name + '.ts'), formats: ['iife'], name, fileName: () => name + '.js' }
    } });
    pluginFiles[name] = path.join(work, 'plugins', name + '.js');
    plugins[name] = fs.readFileSync(pluginFiles[name], 'utf8');
  }
});
test.after(() => { if (work) fs.rmSync(work, { recursive: true, force: true }); });

function fresh(options = {}) {
  const root = fs.mkdtempSync(path.join(work, 'case-'));
  return createConfigHost({ ROOT, work: root, plugins, configDir: path.join(root, 'own-save'), ...options });
}
function childLoad(host, lang = 'en') {
  const root = fs.mkdtempSync(path.join(work, 'child-'));
  const file = path.join(work, 'child-input-' + (++seq) + '.json');
  fs.writeFileSync(file, JSON.stringify({ ROOT, work: root, plugins: pluginFiles, configDir: host.configDir, lang }));
  const result = spawnSync(process.execPath, [path.join(__dirname, 'config-file-io-host.cjs'), '--load-child', file], {
    encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const row = JSON.parse(result.stdout);
  assert.notEqual(row.pid, process.pid);
  assert.equal(row.saves, 0, 'load must not write a config file');
  assert.equal(row.location.why, '--ps-save-dir');
  assert(row.operations.some(op => op.method === 'readFileSync'));
  return row.data;
}
function useOptions(host) {
  const G = host.G, w = new G.Window_Options(); w.addGeneralOptions();
  for (const symbol of ['psBattleStyle', 'psBattleEffects']) {
    const i = w.findSymbol(symbol); assert(i >= 0, symbol + ' production row missing');
    assert.equal(w._list[i].name, G.PSFlow.translator().t(symbol === 'psBattleStyle' ? 'ui.options.battle_style' : 'ui.options.battle_effects'));
    w._index = i; w.processOk();
  }
  assert.equal(G.ConfigManager.psBattleStyle, 'set');
  assert.equal(G.ConfigManager.psBattleEffects, false);
}
const baseConfig = { alwaysDash: true, commandRemember: true, touchUI: false, bgmVolume: 37, bgsVolume: 48, meVolume: 59, seVolume: 61 };

for (const lang of ['en', 'zh']) test(lang + ' compiled settings + actual Options termination save compressed config; new process reloads it', async () => {
  const h = fresh({ lang }); h.G.ConfigManager.applyData(baseConfig); useOptions(h);
  assert.equal(fs.existsSync(h.file), false, 'changing Options alone does not invent an eager save');
  await h.terminate();
  const bytes = fs.readFileSync(h.file), expected = { ...baseConfig, psBattleStyle: 'set', psBattleEffects: false };
  assert(bytes.length > 0); assert.throws(() => JSON.parse(bytes.toString('utf8')), 'config must use native compression');
  assert.deepEqual(JSON.parse(await h.G.StorageManager.zipToJson(bytes.toString('utf8'))), expected);
  assert.deepEqual(childLoad(h, lang), expected);
  assert.equal(fs.existsSync(h.file + '_'), false);
  h.G.ConfigManager.psBattleStyle = 'switch'; h.G.ConfigManager.psBattleEffects = true;
  await h.terminate();
  assert.deepEqual(childLoad(h, lang), { ...baseConfig, psBattleStyle: 'switch', psBattleEffects: true });
  assert.equal(h.saves.length, 2);
  assert(h.operations.some(op => op.method === 'renameSync'), 'second save uses real native backup replacement');
});

test('missing owned config loads defaults without writing or selecting the project/user save folder', async () => {
  const h = fresh(), data = await h.load();
  assert.equal(data.psBattleStyle, 'switch'); assert.equal(data.psBattleEffects, true);
  assert.equal(data.touchUI, true); assert.equal(data.bgmVolume, 100);
  assert.equal(fs.existsSync(h.configDir), false);
  assert.deepEqual(h.operations.map(op => op.method), ['existsSync']);
  assert.equal(h.saves.length, 0);
});

test('actual legacy file loads defaults/migration and subsequent native save writes canonical fields', async () => {
  for (const legacy of [{ ...baseConfig }, { ...baseConfig, battleEffects: false }]) {
    const h = fresh(); await h.G.StorageManager.saveObject('config', legacy);
    const data = childLoad(h), effects = legacy.battleEffects !== false;
    assert.deepEqual(data, { ...baseConfig, psBattleStyle: 'switch', psBattleEffects: effects });
    await h.load(); await h.terminate();
    const raw = JSON.parse(await h.G.StorageManager.zipToJson(fs.readFileSync(h.file, 'utf8')));
    assert.deepEqual(raw, data); assert.equal(Object.hasOwn(raw, 'battleEffects'), false);
  }
});

test('corrupt own file follows native fallback completion without overwriting original bytes', async () => {
  const h = fresh(); fs.mkdirSync(h.configDir); const original = Buffer.from('controlled corrupt compressed config');
  fs.writeFileSync(h.file, original); const data = childLoad(h);
  assert.equal(data.psBattleStyle, 'switch'); assert.equal(data.psBattleEffects, true);
  assert.deepEqual(fs.readFileSync(h.file), original);
  assert.equal(fs.existsSync(h.file + '_'), false);
});

test('controlled partial write uses actual native rollback: rejection retained and prior disk settings recover in new process', async () => {
  const original = fresh(); original.G.ConfigManager.applyData(baseConfig); useOptions(original); await original.terminate();
  const bytes = fs.readFileSync(original.file);
  const h = fresh({ configDir: original.configDir, failWrite: true }); await h.load();
  h.G.ConfigManager.psBattleEffects = true;
  await assert.rejects(h.terminate(), { code: 'ENOSPC' });
  assert.equal(h.saves.length, 1); assert.deepEqual(fs.readFileSync(h.file), bytes);
  assert.equal(fs.existsSync(h.file + '_'), false);
  assert.deepEqual(childLoad(h), { ...baseConfig, psBattleStyle: 'set', psBattleEffects: false });
  assert.equal(h.operations.filter(op => op.method === 'renameSync').length, 2);
});
