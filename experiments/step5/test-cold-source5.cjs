"use strict";
// Each negative and positive starts in a fresh process: module cache observations include the constructor, not only Dex methods.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
// Override only for checking the exact artifacts of a freshly built package.
const ROOT = process.env.PF_COLD_SOURCE_ROOT || path.resolve(__dirname, '../..');
const E = require(path.join(ROOT, 'js/engine/build/engine.cjs'));
const lcg = seed => { let s = seed >>> 0; return n => { s = (Math.imul(s,1664525)+1013904223) >>> 0; return Math.floor(s / 4294967296 * n); }; };
let plugins, compiled;
const dataModules = () => Object.keys(require.cache).filter(k => k.includes('/showdown/dist/data/'));
function readPlugins(dir) {
  return Object.fromEntries(['PS_SaveState','PS_BattleFlow'].map(n => [n, fs.readFileSync(path.join(dir, process.env.PF_COLD_SOURCE_ROOT ? n+'.js' : n+'/'+n+'.js'), 'utf8')]));
}
function host(game) {
  const Ctor = () => { function C() {} C.prototype = { initialize() {}, terminate() {} }; return C; };
  const errors = [], warnings = [], writes = [];
  function Game_System() {}
  Game_System.prototype.isSaveEnabled = function () { return this._saveEnabled !== false; };
  const sys = Object.assign(new Game_System(), { _psGame: game, _psBattleSeq: 0 });
  const req = p => {
    if(p==='fs') return {...fs,readFileSync(f,...args){if(String(f).endsWith('/data/framework/content.json')) return JSON.stringify(compiled);return fs.readFileSync(f,...args);}}; if(p==='path') return path;
    if (/engine\.cjs$/.test(p)) return E;
    if (/fixtures\/game\.cjs$/.test(p)) return require(path.join(ROOT, 'js/engine/fixtures/game.cjs'));
    if (/game\/describe\.cjs$/.test(p)) return require(path.join(ROOT, 'js/engine/game/describe.cjs'));
    throw new Error('unexpected require ' + p);
  };
  req.resolve = p => path.resolve(ROOT, p);
  function Game_Player() { this._base = 0; this._forcing = false; }
  Game_Player.prototype = { increaseSteps() { this._base++; }, isMoveRouteForcing() { return this._forcing; }, executeEncounter() { return false; }, makeEncounterCount() {}, regionId: () => 0 };
  const map = { running: false, mapId: () => 5, isEventRunning() { return map.running; } };
  const ctx = {
    Error, performance, require: req, console: { log() {}, warn: (...a) => warnings.push(a.map(String).join(' ')), error: (...a) => errors.push(a.map(String).join(' ')) },
    PluginManager: { parameters: () => ({}), registerCommand() {} },
    Game_Interpreter: Ctor(), Window_Base: Ctor(), Window_Command: Ctor(), Scene_MenuBase: Ctor(), Game_Player, Game_System,
    // the base save counts every write that reaches MZ (it never touches a file)
    DataManager: { extractSaveContents() {}, saveGame(id) { writes.push(id); return Promise.resolve(0); }, makeSaveContents: () => ({}), setupNewGame() {} },
    SceneManager: { push() {}, isSceneChanging: () => false }, Graphics: { frameCount: 0 }, Utils: { extractFileName: x => x },
    $gameSystem: sys, $gameVariables: { setValue() {}, value: () => 0 }, $gameMap: map, $gamePlayer: { reserveTransfer() {} }, $dataMapInfos: [], $dataCommonEvents: [],
    $gameMessage: { isBusy: () => false, add() {} },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(plugins.PS_SaveState, ctx, { filename: 'PS_SaveState.js (built)' });
  vm.runInContext(plugins.PS_BattleFlow, ctx, { filename: 'PS_BattleFlow.js (built)' });
  const flow = ctx.PSFlow; flow.receiveOptions = { mode: 1, naming: 1 };
  flow._content = null; flow._dex = null; flow.rng = lcg(1);
  const load = (next) => { if (next !== undefined) sys._psGame = next; ctx.DataManager.extractSaveContents({}); };
  return { ctx, flow, sys, map, errors, warnings, writes, load, player: new Game_Player() };
}

async function child(mode, entry, pluginDir) {
  const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, '../../content/sample', f + '.json'), 'utf8'));
  const dataModules = () => Object.keys(require.cache).filter(k => k.includes('/showdown/dist/data/'));
  assert.equal(dataModules().length, 0, 'loading the framework alone is cold');
  if (entry === 'constructor') {
    const dex = E.dex.createDexLookup();
    assert.equal(dataModules().length, 0, 'Dex construction consumes no Showdown data');
    assert.equal(dex.move('rest').pp, 10, 'a lawful explicit lookup initializes Gen 8 data');
    assert.ok(dataModules().length > 0); assert.ok(dex.sha().length > 0);
    return { mode, entry, before: 0, after: dataModules().length };
  }
  const source = Object.fromEntries(['manifest', 'sources', 'species', 'overlays', 'grants'].map(k => [k, read(k)]));
  const built = E.contentCompile.compileContent(source); assert.deepEqual(built.errors, []);
  compiled = JSON.parse(JSON.stringify(built.data));
  const sd = compiled.sources.find(s => s.kind === 'showdown');
  if (mode === 'denied') sd.usageCheck.decision = 'not-allowed';
  if (mode === 'missing') delete sd.usageCheck;
  if (mode === 'malformed') sd.usageCheck = { decision: 'internal-use' };
  plugins = readPlugins(pluginDir);
  const h = host(E.state.newGame({ party: [], money: 0 }));
  // Bind this empty test state to the already compiled layout without warming any external Dex data.
  h.sys._psGame.dex.layoutIdentity = compiled.regionalDex.layoutIdentity;
  const before = JSON.stringify(h.sys._psGame);
  let result, error;
  try {
    if (entry === 'content') result = h.flow.content();
    if (entry === 'app') result = h.flow.app();
    if (entry === 'claim') result = h.flow.claim('starter');
    if (entry === 'begin') {
      if (mode === 'valid') assert.equal(h.flow.claim('starter').status, 'applied');
      h.flow.openBattle({kind:'wild', foes:[{species:'pidgey',level:3}], seq:1, battleId:'cold#1'});
      result = await h.flow.begin();
    }
  } catch (e) { error = String(e.message); }
  const count = dataModules().length;
  if (mode === 'valid') {
    assert.equal(error, undefined); assert.ok(result); assert.ok(count > 0);
    if (entry === 'claim') assert.equal(result.status, 'applied');
    if (entry === 'begin') { await result.run(); assert.equal(h.flow.finish(result).commit, 'applied'); }
  } else {
    assert.equal(count, 0, `${mode}/${entry} must reject before data loads`);
    if (entry === 'content' || entry === 'begin') assert.ok(error, 'formal content/battle consumption refuses');
    if (entry === 'claim') assert.equal(result.status, 'refused');
    // Application construction may support an empty new game, but cannot use denied content later.
    if (entry === 'app') { assert.equal(h.flow.claim('starter').status, 'refused'); assert.equal(h.flow.heal().status, 'refused'); }
    assert.equal(dataModules().length, 0); assert.equal(JSON.stringify(h.sys._psGame), before); assert.deepEqual(h.writes, []);
  }
  return { mode, entry, before: 0, after: dataModules().length, error, status: result && result.status };
}
function changeSource(sources, mode) {
  const sd = sources.find(s => s.kind === 'showdown');
  if (mode === 'denied') sd.usageCheck.decision = 'not-allowed';
  if (mode === 'no-check') delete sd.usageCheck;
  if (mode === 'malformed') sd.usageCheck = { decision: 'internal-use' };
  if (mode === 'unregistered') sources.splice(sources.indexOf(sd), 1);
}
async function matrixChild(shape, mode, entry, pluginDir) {
  assert.equal(dataModules().length, 0);
  // Authoring inputs live with this test, also when the runtime under test comes from the package.
  const sourceRoot = path.resolve(__dirname, '../../content/sample');
  const source = Object.fromEntries(['manifest','sources','species','overlays','grants'].map(k => [k, JSON.parse(fs.readFileSync(path.join(sourceRoot, k+'.json'), 'utf8'))]));
  if (shape === 'empty') { source.species = []; source.grants = []; source.overlays = []; }
  if (entry === 'preserve') {
    source.settings = { NUM_STORAGE_BOXES: 40 };
    source.grants = [{ id: 'supplies', members: [], items: { potion: 1 }, money: 7, source: 'author-placeholder' }];
  }
  const built = E.contentCompile.compileContent(source); assert.equal(built.ok, true);
  // Exercise consumption of an edited on-disk document separately from authoring validation.
  compiled = JSON.parse(JSON.stringify(built.data)); changeSource(compiled.sources, mode);
  changeSource(source.sources, mode);
  const accepted = mode !== 'malformed' && (shape === 'empty' || mode === 'valid');
  assert.equal(E.contentCompile.compileContent(source).ok, accepted);
  assert.equal(dataModules().length, 0, 'compilation never loads external data');
  if (entry === 'inventory' || entry === 'build') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-source-cli5-'));
    for (const [name, data] of Object.entries(source)) fs.writeFileSync(path.join(dir, name+'.json'), JSON.stringify(data));
    const output = path.join(dir, 'result.json');
    process.argv = [process.execPath, path.join(ROOT, 'js/engine/build/content-cli.cjs'), entry, '--src='+dir, '--out='+output, '--report='+output];
    process.on('exit', code => {
      try {
        assert.equal(code, accepted ? 0 : 1); assert.equal(fs.existsSync(output), accepted);
        assert.equal(dataModules().length > 0, accepted && shape !== 'empty' && (entry === 'inventory' || entry === 'build'));
        if (accepted && entry === 'inventory') {
          const report = JSON.parse(fs.readFileSync(output, 'utf8'));
          assert.equal(report.summary.species, source.species.length);
          if (shape === 'empty') assert.equal(report.showdownSha, null, 'no engine source was consumed');
          else assert.ok(report.showdownSha);
        }
        console.log(JSON.stringify({shape, mode, entry, before:0, after:dataModules().length, exit:code, output:accepted}));
        process.exitCode = 0; // the expected CLI refusal was verified, not a test failure
      } catch (e) { console.error(e); process.exitCode = 1; }
      finally { fs.rmSync(dir, {recursive:true, force:true}); }
    });
    require(path.join(ROOT, 'js/engine/build/content-cli.cjs'));
    return;
  }
  plugins = readPlugins(pluginDir);
  let party = [];
  if (entry === 'old-party') {
    const saved = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/step4-saves/defeat.json'), 'utf8'));
    party = saved.party.map(m => ({...m, species:'charmander', form:0}));
  }
  const h = host(E.state.newGame({party, money:0}));
  const before = JSON.stringify(h.sys._psGame);
  let result, error;
  try {
    if (entry === 'assemble') result = E.contentRuntime.assembleContent(E.contentRuntime.loadCompiled(compiled), E.dex.createDexLookup());
    if (entry === 'content' || entry === 'preserve') result = h.flow.content();
    if (entry === 'app') { h.flow.app(); result = h.flow.content(); }
    if (entry === 'old-party') {
      h.flow.openBattle({kind:'wild', foes:[{species:'pidgey',level:3}], seq:1, battleId:'empty-old#1'});
      result = await h.flow.begin();
    }
  } catch (e) { error = String(e.message); }
  if (entry === 'old-party') assert.ok(error, 'the missing species blocks a battle, without a move lookup');
  else if (entry === 'assemble') { assert.equal(error === undefined && result.errors.length === 0, accepted); if (!accepted) assert.ok(error || result.errors.length); }
  else assert.equal(error === undefined, accepted);
  assert.equal(dataModules().length > 0, accepted && shape !== 'empty');
  if (accepted && entry !== 'old-party') {
    const content = entry === 'assemble' ? result.content : result;
    assert.equal(content.meta.id, built.data.contentId);
    assert.equal(content.meta.inputsHash, built.data.inputsHash);
    assert.equal(Object.keys(content.species).length, built.data.species.length);
    if (entry === 'preserve') {
      assert.deepEqual(JSON.parse(JSON.stringify(content.settings)), source.settings);
      assert.deepEqual(JSON.parse(JSON.stringify(content.grants.supplies)), {id:'supplies',members:[],items:{potion:1},money:7});
    }
  }
  assert.equal(JSON.stringify(h.sys._psGame), before); assert.deepEqual(h.writes, []);
  return {shape, mode, entry, before:0, after:dataModules().length, accepted, error, stateUnchanged:true, saves:0};
}
if (process.argv[2] === '--cold-child') {
  child(...process.argv.slice(3)).then(r => console.log(JSON.stringify(r))).catch(e => { console.error(e); process.exitCode = 1; });
} else if (process.argv[2] === '--matrix-child') {
  matrixChild(...process.argv.slice(3)).then(r => console.log(JSON.stringify(r))).catch(e => { console.error(e); process.exitCode = 1; });
} else {
  let dir;
  test.before(() => {
    if (process.env.PF_COLD_SOURCE_ROOT) { dir = path.join(ROOT, 'js/plugins'); return; }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-cold-source5-'));
    for (const name of ['PS_SaveState','PS_BattleFlow']) {
      const r = spawnSync('pnpm', ['--dir','src','exec','vite','build','--outDir',path.join(dir,name)], {cwd:ROOT, env:{...process.env, RR_PLUGIN:name}, encoding:'utf8'});
      assert.equal(r.status, 0, r.stdout+r.stderr);
    }
  });
  test.after(() => { if (dir && !process.env.PF_COLD_SOURCE_ROOT) fs.rmSync(dir,{recursive:true,force:true}); });
  const cases = [['valid','constructor'], ...['denied','missing','malformed','valid'].flatMap(m => ['content','app','claim','begin'].map(e => [m,e]))];
  for (const [mode, entry] of cases) test(`R03 cold source gate: ${mode}/${entry}`, t => {
    const r = spawnSync(process.execPath,[__filename,'--cold-child',mode,entry,dir], {cwd:ROOT,encoding:'utf8'});
    assert.equal(r.status, 0, r.stdout+r.stderr); t.diagnostic(r.stdout.trim());
  });
  const modes = ['valid','denied','unregistered','no-check','malformed'];
  const matrix = ['empty','nonempty'].flatMap(s => modes.flatMap(m => ['assemble','content','app','inventory','build'].map(e => [s,m,e])));
  matrix.push(...modes.map(m => ['empty',m,'old-party']), ['empty','unregistered','preserve']);
  for (const [shape, mode, entry] of matrix) test(`R03 consumption matrix: ${shape}/${mode}/${entry}`, t => {
    const r = spawnSync(process.execPath,[__filename,'--matrix-child',shape,mode,entry,dir], {cwd:ROOT,encoding:'utf8'});
    assert.equal(r.status, 0, r.stdout+r.stderr); t.diagnostic(r.stdout.trim());
  });
}
