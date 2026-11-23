'use strict';
// F's real App/atomic and PS_SaveState validate/snapshot/migrate callers.
// Host I/O is a counted facade: this suite does not claim MZ disk, rendering or NW coverage.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const {types} = require('node:util'), {pathToFileURL} = require('node:url'), {createHash} = require('node:crypto');
const {builtinModules} = require('node:module');
const ROOT = path.resolve(__dirname, '../../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hostKeys = ['system', 'screen', 'timer', 'switches', 'variables', 'selfSwitches', 'actors', 'party', 'map', 'player'];
let E, F, createMZAtomicStatePort, plugin;

test.before(async () => {
  assert.equal(process.version, 'v22.21.1', 'use the supported project Node');
  const tools = path.resolve(process.env.PF_F_FORMAL_GATE_TOOL_ROOT || ROOT, 'src');
  const vitePackage = fs.realpathSync(require.resolve('vite/package.json', {paths: [tools]}));
  const metadata = JSON.parse(fs.readFileSync(vitePackage, 'utf8'));
  const declared = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/package.json'), 'utf8')).devDependencies.vite;
  assert.equal(metadata.version, declared, 'prepared Vite must match this source checkout');
  assert.match(fs.readFileSync(path.join(ROOT, 'src/pnpm-lock.yaml'), 'utf8'),
    new RegExp('vite:\\n        specifier: ' + declared.replaceAll('.', '\\.') + '\\n        version: ' + declared.replaceAll('.', '\\.')));
  const viteEntry = path.join(path.dirname(vitePackage), 'dist/node/index.js');
  const output = process.env.PF_F_FORMAL_GATE_OUTPUT
    ? path.resolve(process.env.PF_F_FORMAL_GATE_OUTPUT)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'pf-f-formal-gates-'));
  if (process.env.PF_F_FORMAL_GATE_OUTPUT) fs.mkdirSync(output); // explicit runs are create-only
  const {build} = await import(pathToFileURL(viteEntry).href);
  const runtime = path.join(output, 'runtime');
  // Follow the official engine build's shared-chunk/node-external rules. Loading
  // the complete production graph needs TS transforms beyond Node's strip-only loader.
  await build({
    root: path.join(ROOT, 'src'), configFile: false, cacheDir: path.join(output, 'cache'), logLevel: 'warn',
    build: {target: 'es2022', outDir: runtime, emptyOutDir: false, minify: false, sourcemap: false,
      lib: {entry: {production: path.join(ROOT, 'src/framework/production.ts'),
        fixtures: path.join(ROOT, 'src/framework/tools/fixtures/game.ts'), atomic: path.join(ROOT, 'src/plugins/world/atomic-state-mz.ts')},
        formats: ['cjs'], fileName: (_format, entryName) => `${entryName}.cjs`},
      rolldownOptions: {platform: 'node', external: [...builtinModules, /^node:/]},
    },
  });
  E = require(path.join(runtime, 'production.cjs')); F = require(path.join(runtime, 'fixtures.cjs'));
  ({createMZAtomicStatePort} = require(path.join(runtime, 'atomic.cjs')));
  await build({
    root: path.join(ROOT, 'src'), configFile: false, cacheDir: path.join(output, 'cache'), logLevel: 'warn',
    build: {target: 'es2022', outDir: path.join(output, 'plugin'), emptyOutDir: false, minify: false, sourcemap: true,
      lib: {entry: path.join(ROOT, 'src/plugins/PS_SaveState.ts'), name: 'PS_SaveStateBundle', formats: ['iife'], fileName: () => 'PS_SaveState.js'},
      rolldownOptions: {external: ['pixi.js'], output: {
        banner: fs.readFileSync(path.join(ROOT, 'src/plugins/PS_SaveState.meta.txt'), 'utf8').trim(), globals: {'pixi.js': 'PIXI'},
      }},
    },
  });
  const outputFile = path.join(output, 'plugin/PS_SaveState.js');
  plugin = fs.readFileSync(outputFile, 'utf8');
  fs.writeFileSync(path.join(output, 'INPUTS.json'), JSON.stringify({
    node: process.version, root: ROOT, tools: {package: vitePackage, version: metadata.version, entry: viteEntry,
      entrySHA256: sha(fs.readFileSync(viteEntry))}, plugin: {path: outputFile, sha256: sha(plugin)},
    sourceSHA256: Object.fromEntries(['src/plugins/PS_SaveState.ts', 'src/plugins/world/atomic-state-mz.ts',
      'src/framework/app/game-application.ts', 'src/framework/app/world-operation.ts', 'src/framework/rules/save-schema.ts',
      'src/framework/tools/fixtures/game.ts', 'src/vite.engine.config.mts', 'experiments/step5/5/test-f-formal-data-gates.cjs',
      'src/package.json', 'src/pnpm-lock.yaml'].map(file => [file, sha(fs.readFileSync(path.join(ROOT, file)))])),
    scope: 'private current-source production CJS graph and complete PS_SaveState IIFE; counted host I/O facade; artifacts retained',
  }, null, 2) + '\n', {flag: 'wx'});
});

function fixture() {
  const content = F.content, counts = {reads: 0, replaces: 0, saved: 0, made: 0, loads: 0, extracts: 0, retired: 0};
  function System() {}
  System.prototype.isSaveEnabled = () => true;
  const G = {
    Error, Date, Promise, console: {error() {}, warn() {}}, Game_System: System,
    $gameSystem: Object.assign(new System(), {_psGame: F.makeGame()}),
    $gameMap: {_mapId: 5}, $gamePlayer: {_x: 1, _y: 1, _direction: 2, _transferring: false},
    $gameSwitches: {_data: []}, $dataMap: {}, SceneManager: {_scene: {_started: true}, _nextScene: null},
  };
  const loaded = {content};
  const legacy = {read() {counts.reads++; return G.$gameSystem._psGame;},
    replace(next) {counts.replaces++; G.$gameSystem._psGame = next;}};
  const state = createMZAtomicStatePort(G, legacy, types.isProxy, {owner: loaded, key: 'content'});
  const draws = [];
  const app = new E.app.GameApplication({state, content: () => ({content}),
    sessions: {async create() {throw Error('no battle is requested by data-gate tests');}},
    projection: {project() {throw Error('no outcome is requested by data-gate tests');}}, random(n) {draws.push(n); return 0;},
  });
  G.PSFlow = {_app: app, app: () => app, game: () => G.$gameSystem._psGame, content: () => content,
    running: false, operationPending: () => app.saveBlocked,
    speciesKeyResolver: () => E.speciesKey.speciesKeyResolver(content),
    stateReplaced() {counts.retired++; app.stateReplacedByHost();},
  };
  G.require = name => {assert.equal(name, './js/engine/build/production.cjs'); return E;};
  let incoming, written;
  G.DataManager = {
    makeSaveContents() {counts.made++; return {system: G.$gameSystem};},
    saveGame() {counts.saved++; written = this.makeSaveContents(); return Promise.resolve(0);},
    extractSaveContents(contents) {counts.extracts++; for (const key of hostKeys) G['$game' + key[0].toUpperCase() + key.slice(1)] = contents[key];},
    loadGame() {
      counts.loads++;
      // Native DataManager.loadGame extracts inside StorageManager.loadObject(...).then.
      // The formal wrapper must restore the old host after a rejected asynchronous preparation.
      return Promise.resolve().then(() => {
        G.$gameSystem = new System(); G.$gameMap = {_mapId: 99};
        this.extractSaveContents(incoming);
        return 0;
      });
    },
  };
  G.window = G;
  vm.runInContext(plugin, vm.createContext(G), {filename: 'private-full-PS_SaveState.js'});
  const retainedHost = Object.fromEntries(Object.entries(G).filter(([key]) => key.startsWith('$game')));
  const initialState = G.$gameSystem._psGame;
  return {G, app, counts, draws, content, initialState, retainedHost, written: () => written,
    incoming(raw) {
      incoming = Object.fromEntries(hostKeys.map(key => [key, {}]));
      incoming.system = Object.assign(new System(), {_psGame: raw});
      incoming.map = {_mapId: 5}; incoming.player = {_x: 1, _y: 1, _direction: 2, _transferring: false};
      return incoming;
    },
  };
}

// These functions return ordinary data rather than throwing. A caught user exception cannot fake a rejection.
function instrument(game, kind) {
  const calls = {fieldGetter: 0, jsonGetter: 0, jsonHook: 0};
  const property = kind === 'field-getter' ? 'flashUsed' : 'toJSON';
  if (kind === 'field-getter') Object.defineProperty(game.world, property, {
    enumerable: true, configurable: true, get() {calls.fieldGetter++; return false;},
  });
  else if (kind === 'json-getter') Object.defineProperty(game.world, property, {
    enumerable: true, configurable: true, get() {calls.jsonGetter++; return () => {calls.jsonHook++; return {};};},
  });
  else Object.defineProperty(game.world, property, {
    enumerable: true, configurable: true, value() {calls.jsonHook++; return {};},
  });
  const original = Object.getOwnPropertyDescriptor(game.world, property);
  return {zero() {assert.deepEqual(calls, {fieldGetter: 0, jsonGetter: 0, jsonHook: 0});
    assert.deepEqual(Object.getOwnPropertyDescriptor(game.world, property), original, 'input descriptor is retained');},
  };
}
function unchanged(h, system, generation) {
  assert.equal(h.G.$gameSystem, system);
  assert.equal(h.G.$gameSystem._psGame, h.initialState, 'neither legacy nor atomic assignment replaced the state');
  for (const [key, value] of Object.entries(h.retainedHost)) assert.equal(h.G[key], value, 'retained host identity: ' + key);
  assert.equal(h.app.stateGeneration, generation);
  assert.equal(h.counts.replaces, 0); assert.equal(h.counts.retired, 0);
  assert.equal(h.counts.saved, 0); assert.equal(h.counts.made, 0); assert.equal(h.counts.extracts, 0);
  assert.deepEqual(h.draws, []);
}

test('F validate positive: real App plus production atomic adapter accepts a healthy legal state', async () => {
  const h = fixture(), state = h.G.$gameSystem._psGame;
  assert.deepEqual(await h.app.checkFieldBlackout('valid-state'), {status: 'not-required'});
  assert.equal(h.G.$gameSystem._psGame, state); assert.equal(h.counts.replaces, 0);
  assert.ok(h.counts.reads > 0); assert.deepEqual(h.draws, []);
});

test('F save positive: full PS_SaveState validates and snapshots a detached legal state', async () => {
  const h = fixture(), raw = h.G.$gameSystem._psGame, expected = structuredClone(raw);
  assert.equal(await h.G.DataManager.saveGame(8), 0);
  assert.equal(h.counts.saved, 1); assert.equal(h.counts.made, 1); assert.equal(h.counts.replaces, 0);
  assert.equal(h.G.$gameSystem._psGame, raw);
  const envelope = h.written().system._psGame;
  assert.equal(envelope.encoding, 'pokemon-framework-json');
  assert.deepEqual(JSON.parse(envelope.data), expected);
  raw.money--;
  assert.deepEqual(JSON.parse(envelope.data), expected, 'pending save contains the verified detached snapshot');
  assert.deepEqual(h.draws, []);
});

test('F migrate positive: formal load installs a legal owned copy and retires the real App generation once', async () => {
  const h = fixture(), raw = F.makeGame(), expected = structuredClone(raw), generation = h.app.stateGeneration;
  h.incoming(raw);
  assert.equal(await h.G.DataManager.loadGame(8), 0);
  assert.equal(h.counts.loads, 1); assert.equal(h.counts.extracts, 1); assert.equal(h.counts.retired, 1);
  assert.equal(h.app.stateGeneration, generation + 1);
  assert.notEqual(h.G.$gameSystem._psGame, raw); assert.deepEqual(h.G.$gameSystem._psGame, expected);
  assert.deepEqual(raw, expected); assert.equal(h.counts.saved, 0); assert.deepEqual(h.draws, []);
});

for (const kind of ['field-getter', 'json-getter', 'json-hook']) {
  test(`F validate ${kind}: actual App refuses explicitly with all counters zero`, async () => {
    const h = fixture(), system = h.G.$gameSystem, generation = h.app.stateGeneration;
    const counter = instrument(system._psGame, kind);
    assert.deepEqual(await h.app.checkFieldBlackout(kind), {status: 'refused', reason: 'invalid-blackout-state'});
    counter.zero(); unchanged(h, system, generation);
  });
  test(`F save ${kind}: formal validate and snapshot both refuse before host writing with counters zero`, async () => {
    const h = fixture(), system = h.G.$gameSystem, generation = h.app.stateGeneration;
    const counter = instrument(system._psGame, kind);
    const refusal = kind === 'field-getter' ? /invalid-state: \$\.world\.flashUsed persistent fields must be own enumerable data properties/
      : /invalid-state: \$\.world persistent data cannot use a JSON serialization hook/;
    await assert.rejects(h.G.DataManager.saveGame(8), refusal);
    counter.zero();
    assert.equal(h.G.PSState.lastSaveError.code, 'state-invalid');
    assert.throws(() => h.G.DataManager.makeSaveContents(), refusal);
    counter.zero(); unchanged(h, system, generation);
  });
  test(`F migrate ${kind}: formal load rejects invalid source, restores host and leaves counters zero`, async () => {
    const h = fixture(), system = h.G.$gameSystem, generation = h.app.stateGeneration, raw = F.makeGame();
    const counter = instrument(raw, kind), incoming = h.incoming(raw);
    await assert.rejects(h.G.DataManager.loadGame(8), new RegExp(`state-unusable: invalid: the original schema ${E.state.GAME_SCHEMA} document is invalid; nothing was changed`));
    counter.zero(); unchanged(h, system, generation);
    assert.equal(incoming.system._psGame, raw); assert.equal(h.counts.loads, 1);
    assert.match(h.G.PSState.lastLoadError.message, /state-unusable: invalid:/);
  });
}

test('F migrate raw.schema boundary: the existing initial schema read is one, nested accessor remains zero and load refuses', async () => {
  const h = fixture(), system = h.G.$gameSystem, generation = h.app.stateGeneration, raw = F.makeGame();
  const version = raw.schema; let schemaReads = 0;
  Object.defineProperty(raw, 'schema', {enumerable: true, get() {schemaReads++; return version;}});
  const counter = instrument(raw, 'field-getter'); h.incoming(raw);
  await assert.rejects(h.G.DataManager.loadGame(8), new RegExp(`state-unusable: invalid: the original schema ${E.state.GAME_SCHEMA} document is invalid; nothing was changed`));
  assert.equal(schemaReads, 1, 'migrateGame reads raw.schema before its descriptor validation; this is not a zero-read claim');
  counter.zero(); unchanged(h, system, generation);
});
