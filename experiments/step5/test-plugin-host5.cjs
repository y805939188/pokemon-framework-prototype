'use strict';
// Step 5.0, plugins in a Node VM with small MZ stubs (NOT the real MZ host; that is the flow test): PS_SaveState
// migrates a save written by the step 4 code to schema 4 through the content mapping, refuses (keeping the original)
// when the content is missing or cannot map a species, and needs no content for a schema 4 save; a load or a new game
// releases a battle the application still held (P4-2); the step counter hook (WP06 §4.1: not on a forced route or
// while an event runs); species names by content id; the ResetGame test aid stores the fixture party by content id.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const E = require('../../js/engine/build/engine.cjs');
const SRC = path.join(ROOT, 'content/sample');
const read = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const content = E.contentRuntime.assembleContent(E.contentCompile.compileContent({ manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json'), grants: read('grants.json') }).data, E.dex.createDexLookup()).content;
const J = x => JSON.parse(JSON.stringify(x));
const step4 = f => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/step4-saves', f), 'utf8'));
const lcg = seed => { let s = seed >>> 0; return n => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return Math.floor((s / 4294967296) * n); }; };

let dir; const plugins = {};
test.before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-plugin-host5-'));
  for (const name of ['PS_SaveState', 'PS_BattleFlow']) {
    const built = spawnSync('pnpm', ['--dir', 'src', 'exec', 'vite', 'build', '--outDir', path.join(dir, name)], { cwd: ROOT, env: { ...process.env, RR_PLUGIN: name }, encoding: 'utf8' });
    assert.equal(built.status, 0, built.stdout + built.stderr);
    plugins[name] = fs.readFileSync(path.join(dir, name, `${name}.js`), 'utf8');
  }
});
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

function host(game) {
  const Ctor = () => { function C() {} C.prototype = { initialize() {}, terminate() {} }; return C; };
  const errors = [], warnings = [];
  const sys = { _psGame: game, _psBattleSeq: 0, isSaveEnabled: () => true };
  const req = p => {
    if (p === 'path' || p === 'fs') return require(p);
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
    Game_Interpreter: Ctor(), Window_Base: Ctor(), Window_Command: Ctor(), Scene_MenuBase: Ctor(), Game_Player, Game_System: function () {},
    DataManager: { extractSaveContents() {}, saveGame: () => Promise.resolve(), makeSaveContents: () => ({}), setupNewGame() {} },
    SceneManager: { push() {}, isSceneChanging: () => false }, Graphics: { frameCount: 0 }, Utils: { extractFileName: x => x },
    $gameSystem: sys, $gameVariables: { setValue() {}, value: () => 0 }, $gameMap: map, $gamePlayer: { reserveTransfer() {} }, $dataMapInfos: [], $dataCommonEvents: [],
    $gameMessage: { isBusy: () => false, add() {} },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(plugins.PS_SaveState, ctx, { filename: 'PS_SaveState.js (built)' });
  vm.runInContext(plugins.PS_BattleFlow, ctx, { filename: 'PS_BattleFlow.js (built)' });
  const flow = ctx.PSFlow;
  flow._content = content; flow._dex = E.dex.createDexLookup(); flow.rng = lcg(1);
  const load = () => ctx.DataManager.extractSaveContents({});
  return { ctx, flow, sys, map, errors, warnings, load, player: new Game_Player() };
}

test('a save written by the step 4 code loads: migrated to schema 4 with the content mapping, reported in _psSaveInfo', () => {
  const raw = step4('full.json');
  const h = host(J(raw));
  h.load();
  assert.equal(h.sys._psSaveError, undefined, JSON.stringify(h.sys._psSaveError));
  assert.deepEqual(J(h.sys._psSaveInfo).from, 3); assert.equal(h.sys._psSaveInfo.to, 4); assert.equal(h.sys._psSaveInfo.migrated, true);
  const g = J(h.sys._psGame);
  assert.deepEqual(g.party.map(m => [m.species, m.form]), raw.party.map(m => [E.speciesKey.keyOfBattleName(content, m.species).species, 0]));
  assert.deepEqual(E.saveSchema.validateGame(g), []);
  assert.equal(h.flow.app().claimGrant('starter').status, 'already-claimed', 'the claim survived the migration');
});

test('content that cannot be loaded, or a species it cannot map: the migration is refused and the original state stays as loaded', () => {
  const a = host(step4('full.json')); const before = JSON.stringify(a.sys._psGame);
  a.flow.speciesKeyResolver = () => { throw new Error('content: cannot read data/framework/content.json'); };
  a.load();
  assert.equal(a.sys._psSaveError.code, 'needs-content');
  assert.match(a.sys._psSaveError.message, /the content could not be loaded: content: cannot read/);
  assert.equal(JSON.stringify(a.sys._psGame), before, 'the raw document is kept, so saving writes it back unchanged');
  a.ctx.DataManager.makeSaveContents(); assert.equal(JSON.stringify(a.sys._psGame), before);
  assert.throws(() => a.flow.game(), /not usable \(needs-content\)/, 'no battle or grant runs on it');
  const raw = step4('full.json'); raw.boxes[0].species = 'Mew';
  const b = host(J(raw)); const b0 = JSON.stringify(b.sys._psGame);
  b.load();
  assert.equal(b.sys._psSaveError.code, 'unmapped-species');
  assert.deepEqual(J(b.sys._psSaveError.problems).map(p => p.path), ['$.boxes[0].species']);
  assert.equal(JSON.stringify(b.sys._psGame), b0);
});

test('a schema 4 save needs no content to load; a save without framework state gets the empty one', () => {
  const h = host(E.state.newGame({ party: [], money: 7 }));
  h.flow.speciesKeyResolver = () => { throw new Error('must not be asked'); };
  h.load();
  assert.deepEqual([h.sys._psSaveError, h.sys._psSaveInfo.migrated, h.sys._psGame.money], [undefined, false, 7]);
  const e = host(undefined); e.load();
  assert.deepEqual([e.sys._psGame.schema, e.sys._psSaveInfo.created], [4, 'empty']);
});

test('P4-2: loading a save (or starting a new game) releases a battle the application still held', async () => {
  const h = host(E.state.newGame({ party: [], money: 0 }));
  h.flow.app().claimGrant('starter');
  h.flow.seed = [1, 2, 3, 4];
  await h.flow.app().startBattle({ battleId: 'open#1', kind: 'wild', foes: [{ species: 'pidgey', level: 3 }], seq: 1 });
  assert.equal(h.flow.app().healParty().reason, 'battle-active');
  h.sys._psGame = J(step4('defeat.json')); h.load();
  assert.notEqual(h.flow.app().healParty().reason, 'battle-active', 'released by the load');
  await h.flow.app().startBattle({ battleId: 'open#2', kind: 'wild', foes: [{ species: 'pidgey', level: 3 }], seq: 2 });
  h.ctx.DataManager.setupNewGame();
  assert.equal(h.flow.app().claimGrant('starter').status, 'applied', 'released by the new game, which installed an empty state');
});

test('WP06 §4.1 step counter: a normal step counts; a forced move route or a running event does not', () => {
  const h = host(E.state.newGame({ party: [], money: 0 }));
  const p = h.player;
  p.increaseSteps(); p.increaseSteps();
  assert.deepEqual([p._base, h.sys._psGame.steps], [2, 2], "MZ's own step handling still runs");
  p._forcing = true; p.increaseSteps(); p._forcing = false;
  h.map.running = true; p.increaseSteps(); h.map.running = false;
  assert.deepEqual([p._base, h.sys._psGame.steps], [4, 2]);
  h.sys._psGame = J({ ...h.sys._psGame, steps: 2147483647 }); p.increaseSteps();
  assert.equal(h.sys._psGame.steps, 0, 'wraps at 2^31');
  h.sys._psSaveError = { code: 'invalid', message: 'x' }; p.increaseSteps(); p.increaseSteps();
  assert.equal(h.warnings.filter(w => /steps not counted/.test(w)).length, 1, 'an unusable state is reported once, not every step');
});

test('species names by content id + form or by battle name; ResetGame stores the fixture party by content id', () => {
  const h = host(E.state.newGame({ party: [], money: 0 }));
  const byId = h.flow.speciesName('charmander', 0), byBattle = h.flow.speciesName('Charmander');
  assert.equal(byId, byBattle); assert.notEqual(byId, 'charmander', 'the content text key is used');
  assert.equal(h.flow.speciesName('nope'), 'nope', 'an unknown name is shown as given');
  h.flow.resetGame();
  assert.deepEqual(J(h.sys._psGame).party.map(m => [m.species, m.form]), [['charizard', 0], ['blastoise', 0], ['venusaur', 0]]);
  assert.deepEqual(E.saveSchema.validateGame(J(h.sys._psGame)), []);
});
