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
  const errors = [], warnings = [], writes = [];
  function Game_System() {}
  Game_System.prototype.isSaveEnabled = function () { return this._saveEnabled !== false; };
  const sys = Object.assign(new Game_System(), { _psGame: game, _psBattleSeq: 0 });
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
  const flow = ctx.PSFlow;
  flow._content = content; flow._dex = E.dex.createDexLookup(); flow.rng = lcg(1);
  const load = (next) => { if (next !== undefined) sys._psGame = next; ctx.DataManager.extractSaveContents({}); };
  return { ctx, flow, sys, map, errors, warnings, writes, load, player: new Game_Player() };
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

// ---- review of 1960b92 (2026-10-22): F01 save refusal, F02 host battle operation, F10 own keys, F11 clock

test('F01: while the loaded state is unusable every save is refused before MZ writes anything (slot named); a good load clears it', async () => {
  const raw = step4('full.json'); raw.boxes[0].species = 'Mew';
  const h = host(J(raw)); const before = JSON.stringify(h.sys._psGame);
  h.load();
  assert.equal(h.sys._psSaveError.code, 'unmapped-species');
  for (const slot of [15, 3]) {
    await assert.rejects(h.ctx.DataManager.saveGame(slot), e => new RegExp(`slot ${slot} is refused.*unmapped-species.*nothing was written`).test(e.message));
    assert.deepEqual([h.ctx.PSState.lastSaveError.code, h.ctx.PSState.lastSaveError.savefileId], ['state-unusable', slot]);
  }
  assert.deepEqual(h.writes, [], 'nothing reached the MZ save');
  assert.equal(JSON.stringify(h.sys._psGame), before, 'the original framework state is kept');
  assert.equal(h.sys.isSaveEnabled(), false, 'the save menu is masked');
  h.load(J(step4('defeat.json')));
  assert.equal(h.sys._psSaveError, undefined);
  assert.equal(h.sys.isSaveEnabled(), true);
  await h.ctx.DataManager.saveGame(15);
  assert.deepEqual(h.writes, [15], 'after a good load saving works again');
});

async function openedBattle(h, battleId = 'old#1', seq = 1) {
  h.flow.seed = [1, 2, 3, 4];
  const req = { battleId, kind: 'wild', foes: [{ species: 'pidgey', level: 3 }], seq, resultVariable: 7 };
  h.flow.openBattle(req);
  const op = h.flow._op;
  const session = await h.flow.begin();
  return { req, op, session, scene: { _psOp: op, _session: session, popScene() {} } };
}

test('F02: openBattle -> begin -> a save is loaded: the host operation ends (not running, saving allowed), the next battle opens and saves work', async () => {
  const h = host(E.state.newGame({ party: [], money: 0 }));
  h.flow.claim('starter');
  const old = await openedBattle(h);
  assert.equal(h.flow.running, true);
  assert.equal(h.sys.isSaveEnabled(), false, 'the battle masks saving');
  await assert.rejects(h.ctx.DataManager.saveGame(1), /battle is running/);
  const loaded = J(step4('defeat.json'));
  h.load(loaded);
  assert.deepEqual([h.flow.running, h.flow._op, h.flow.request], [false, null, null], 'the host operation is over');
  assert.deepEqual([h.flow.lastOutcome.replaced, h.flow.lastOutcome.commit, h.flow.lastOutcome.battleId], [true, 'none', 'old#1']);
  assert.equal(h.sys.isSaveEnabled(), true);
  await h.ctx.DataManager.saveGame(2);
  assert.deepEqual(h.writes, [2], 'saving works');
  assert.equal(h.flow.app().healParty().reason === 'battle-active', false, 'the application released its lock as well');
  const next = await openedBattle(h, 'next#2', 2);
  assert.equal(h.flow.running, true, 'the next battle opened');
  void old; void next;
});

test('F02: late finish / abort / close of the replaced battle neither commit, nor close, nor project into the next battle', async () => {
  const h = host(E.state.newGame({ party: [], money: 0 }));
  h.flow.claim('starter');
  const old = await openedBattle(h);
  await old.session.run(); // the old battle is decided (it ran away) but not ended yet
  h.load(J(step4('defeat.json')));
  const stateAfterLoad = JSON.stringify(h.sys._psGame);
  const next = await openedBattle(h, 'old#1', 1); // a later battle, even under the same id (the loaded save's counter)
  const vars = []; h.ctx.$gameVariables.setValue = (k, v) => vars.push([k, v]);
  let popped = 0; old.scene.popScene = () => { popped++; };
  // the old scene ends: its finish, its abort and its terminate must not reach the next battle
  h.ctx.Scene_PSBattle.prototype.onEnd.call(old.scene);
  assert.match(h.flow.lastStale.what, /finish/);
  assert.equal(popped, 0, 'a late end must not pop the current scene from the host stack');
  h.flow.finish(old.session, old.op); // the direct host API also needs its own guard
  assert.equal(h.flow.lastStale.what, 'finish');
  h.ctx.Scene_PSBattle.prototype.abort.call({ ...old.scene, _queue: [], refreshStatus() {} }, new Error('old scene failed'));
  assert.equal(h.flow.lastStale.what, 'abort');
  h.ctx.Scene_PSBattle.prototype.terminate.call(old.scene);
  h.flow.close(0, old.op);
  assert.equal(h.flow.lastStale.what, 'close');
  assert.deepEqual([h.flow.running, h.flow._op === next.op], [true, true], 'the next battle is still open');
  assert.deepEqual(vars, [], 'nothing was projected');
  assert.equal(JSON.stringify(h.sys._psGame), stateAfterLoad, 'nothing was committed into the loaded state');
  // the next battle itself ends normally
  await next.session.run();
  h.ctx.Scene_PSBattle.prototype.onEnd.call(next.scene);
  assert.deepEqual([h.flow.lastOutcome.code, h.flow.lastOutcome.commit, h.flow.running], [3, 'applied', false]);
  assert.deepEqual(vars, [[7, 3]], 'only the next battle projected its outcome');
});

test('F02: an application session of a replaced state never commits, also when it had finished before', async () => {
  const h = host(E.state.newGame({ party: [], money: 0 }));
  h.flow.claim('starter');
  const done = await openedBattle(h);
  await done.session.run();
  h.ctx.Scene_PSBattle.prototype.onEnd.call(done.scene);
  assert.equal(h.flow.lastOutcome.commit, 'applied');
  h.load(J(step4('defeat.json')));
  const loaded = JSON.stringify(h.sys._psGame);
  const again = h.flow.app().finishBattle(done.session, done.req);
  assert.deepEqual([again.commit, again.aborted], ['none', true], 'a session of the old state is not committed into the loaded one');
  assert.equal(JSON.stringify(h.sys._psGame), loaded);
});

test('F10: a content id that is also an Object.prototype name ("constructor") is shown by its translated name, also in the grant message', () => {
  const src = { manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json'), grants: read('grants.json') };
  src.species.find(sp => sp.id === 'charmander').id = 'constructor';
  src.grants[0].id = 'constructor'; src.grants[0].members[0].species = 'constructor';
  const ct = E.contentRuntime.assembleContent(E.contentCompile.compileContent(src).data, E.dex.createDexLookup()).content;
  const h = host(E.state.newGame({ party: [], money: 0 }));
  h.flow._content = ct;
  const grant = h.flow.claim('constructor');
  assert.equal(grant.status, 'applied');
  const shown = h.flow.speciesName('constructor', 0);
  assert.equal(shown, h.flow.speciesName('Charmander'));
  assert.notEqual(shown, 'constructor');
  assert.ok(h.flow.claimLines(grant).some(l => l.includes(shown)) && !h.flow.claimLines(grant).some(l => l.includes('constructor')), JSON.stringify(h.flow.claimLines(grant)));
  assert.equal(h.flow.speciesName('toString'), 'toString', 'an inherited name is not a species');
});

test('F11: the application reads the time from the injected clock; the plugin wires the host clock and tests may pin it', () => {
  const h = host(E.state.newGame({ party: [], money: 0 }));
  const t0 = Date.now(); const t = h.flow.app().now(); const t1 = Date.now();
  assert.ok(t >= t0 && t <= t1, 'by default the host clock');
  h.flow.clock = () => 1234567890123;
  assert.equal(h.flow.app().now(), 1234567890123, 'a pinned clock');
});
