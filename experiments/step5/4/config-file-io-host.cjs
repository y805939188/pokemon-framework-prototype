'use strict';
// Actual installed ConfigManager/StorageManager/JsonEx/pako and fs; controlled
// Options shell, audio/render ports and NW argv. No NW or user save directory.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { installNativeSettings } = require('./battle-effects-settings-host.cjs');
const { createCompositionHostFactory } = require('./battle-music-composition-host.cjs');

function section(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, 'installed host section ' + start);
  return source.slice(a, b);
}

function createConfigHost({ ROOT, work, plugins, configDir, lang = 'en', failWrite = false }) {
  configDir = path.resolve(configDir);
  const operations = [], saves = [], loads = [];
  let failed = false;
  // Every actual filesystem operation goes to a new directory owned by this test.
  const allowed = p => {
    const resolved = path.resolve(p);
    assert(resolved === configDir || resolved === path.join(configDir, 'config.rmmzsave') ||
      resolved === path.join(configDir, 'config.rmmzsave_'), 'unexpected config I/O: ' + p);
  };
  const disk = {};
  for (const method of ['existsSync', 'mkdirSync', 'renameSync', 'unlinkSync', 'readFileSync', 'writeFileSync']) {
    disk[method] = (...args) => {
      allowed(args[0]);
      if (method === 'renameSync') allowed(args[1]);
      operations.push({ method, paths: args.slice(0, method === 'renameSync' ? 2 : 1).map(String) });
      if (method === 'writeFileSync' && failWrite && !failed) {
        failed = true;
        fs.writeFileSync(args[0], 'controlled partial write');
        throw Object.assign(new Error('controlled ENOSPC after partial write'), { code: 'ENOSPC' });
      }
      return fs[method](...args);
    };
  }
  const world = createCompositionHostFactory({ ROOT, work, plugins })({
    productionTranslator: true,
    beforeProduct(G) {
      installNativeSettings(G, ROOT);
      const nativeRequire = G.require;
      const req = name => name === 'fs' ? disk : name === 'os' ? require('node:os') : nativeRequire(name);
      req.resolve = name => name === './js/plugins.js' ? path.join(work, 'game/js/plugins.js') : nativeRequire.resolve(name);
      G.require = req;
      G.Utils.isNwjs = () => true;
      G.nw = { App: { argv: ['--ps-save-dir=' + configDir], manifest: { name: 'pf-config-owned-test' } } };
      G.process = { platform: process.platform, mainModule: { filename: path.join(work, 'game/main.js') } };
      // Do not replace compression with zlib or a fake JSON file pipeline.
      G.pako = require(path.join(ROOT, 'js/libs/pako.min.js'));
      const core = fs.readFileSync(path.join(ROOT, 'js/reactor_core.js'), 'utf8');
      const managers = fs.readFileSync(path.join(ROOT, 'js/reactor_managers.js'), 'utf8');
      vm.runInContext(section(core, 'function JsonEx()', '\n//-----------------------------------------------------------------------------'), G, { filename: 'reactor_core.js#JsonEx' });
      vm.runInContext(section(managers, 'function ConfigManager()', '\n//-----------------------------------------------------------------------------\n// FontManager'), G, { filename: 'reactor_managers.js#ConfigAndStorage' });
      vm.runInContext(plugins.PS_SaveLocation, G, { filename: 'PS_SaveLocation.js' });
      assert.equal(G.PSSaveLocation.why, '--ps-save-dir');
      assert.equal(G.StorageManager.filePath('config'), path.join(configDir, 'config.rmmzsave'));
    }
  });
  const G = world.G;
  // Observe the outer promises after BOTH product plugins install their hooks.
  // In particular PS_SaveState owns a finally-chain around saveObject. Observing
  // only the earlier native promise would miss its rejected outer promise.
  for (const [name, collection] of [['saveObject', saves], ['loadObject', loads]]) {
    const native = G.StorageManager[name];
    G.StorageManager[name] = function(...args) {
      assert.equal(args[0], 'config');
      const promise = native.apply(this, args);
      collection.push(promise);
      promise.catch(() => {});
      return promise;
    };
  }
  G.PSFlow.setLanguage(lang);
  // The settings wrappers have now been installed by the real compiled plugin.
  G.ConfigManager.applyData({});
  return { G, operations, saves, loads, configDir, file: path.join(configDir, 'config.rmmzsave'),
    async load() {
      assert.equal(G.ConfigManager.load(), undefined, 'native load is not a promise');
      for (let i = 0; i < 100 && !G.ConfigManager.isLoaded(); i++) await new Promise(resolve => setImmediate(resolve));
      assert.equal(G.ConfigManager.isLoaded(), true, 'native load completion');
      return JSON.parse(JSON.stringify(G.ConfigManager.makeData()));
    },
    async terminate() {
      const count = saves.length;
      assert.equal(new G.Scene_Options().terminate(), undefined);
      assert.equal(saves.length, count + 1, 'one native save per Options terminate');
      await saves.at(-1);
    }
  };
}

module.exports = { createConfigHost };

// This is a genuinely fresh Node process, rebuilding the controlled host around
// the same actual installed storage and compiled product hooks, then reading disk.
if (require.main === module) {
  (async () => {
    assert.equal(process.argv[2], '--load-child');
    const input = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    const plugins = Object.fromEntries(Object.entries(input.plugins).map(([name, file]) => [name, fs.readFileSync(file, 'utf8')]));
    const host = createConfigHost({ ...input, plugins });
    const data = await host.load();
    console.log(JSON.stringify({ pid: process.pid, data, operations: host.operations, saves: host.saves.length, location: host.G.PSSaveLocation }));
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
