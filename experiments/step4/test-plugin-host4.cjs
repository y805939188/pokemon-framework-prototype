'use strict';
// Step 4, the MZ adapter's battle lifecycle in a Node VM host stub (no MZ, no NW.js, no windows): the BUILT
// PS_BattleFlow plugin runs against the real engine bundle and the real GameApplication; MZ globals are small stubs.
//   - the save permission belongs to the game: a battle only masks it while it runs (any change made meanwhile stays);
//   - a committed defeat stays committed when a message or a translation fails afterwards, and the trip home is still
//     requested; a later failure never turns the committed outcome into an abort;
//   - a blackout ends the whole calling chain of the battle (direct event, common event, nested common events) and
//     nothing else. This part runs Reactor's own Game_Interpreter (js/reactor_objects.js, installed by
//     scripts/setup-reactor.sh); where that runtime is not installed (CI's headless layer) it is SKIPPED, not passed.
// The real MZ scenarios (T16, T22, T27-T29 in PS_BattleFlowTest.ts) are the host evidence; this suite is the fast check.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const E = require('../../js/engine/build/engine.cjs');
const REACTOR_OBJECTS = path.join(ROOT, 'js/reactor_objects.js');
const SRC = path.join(ROOT, 'content/sample');
const read = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const content = E.contentRuntime.assembleContent(E.contentCompile.compileContent({ manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json'), grants: read('grants.json') }).data, E.dex.createDexLookup()).content;
/** Values made inside the VM context have that context's prototypes: compare their JSON form. */
const J = x => JSON.parse(JSON.stringify(x));
const lcg = seed => { let s = seed >>> 0; return n => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return Math.floor((s / 4294967296) * n); }; };

let dir, plugin;
test.before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-plugin-host4-'));
  const built = spawnSync('pnpm', ['--dir', 'src', 'exec', 'vite', 'build', '--outDir', dir], { cwd: ROOT, env: { ...process.env, RR_PLUGIN: 'PS_BattleFlow' }, encoding: 'utf8' });
  assert.equal(built.status, 0, built.stdout + built.stderr);
  plugin = fs.readFileSync(path.join(dir, 'PS_BattleFlow.js'), 'utf8');
});
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

/** A loser's state: one member at 1 HP, 500 money. */
function losingGame() {
  const m = E.memberFactory.createMember({ id: 'S-1', species: 'Snorlax', level: 2 }, content, lcg(3)); m.hp = 1;
  return E.state.newGame({ party: [E.speciesKey.toPersistentMember(m, content)], money: 500 }); // stored by content id + form (D5-3)
}
const lost = battleId => ({ protocol: 1, battleId, outcome: { kind: 'win', winner: 'Wild' }, members: { 'S-1': { hp: 0 } }, bag: {}, captured: [], dex: { seen: ['Pidgey'], owned: [] } });
const ran = battleId => ({ protocol: 1, battleId, outcome: { kind: 'run', winner: null }, members: {}, bag: {}, captured: [], dex: { seen: [], owned: [] } });

function host({ interpreter = false, saveEnabled = true, failMessage = false, game = losingGame() } = {}) {
  const Ctor = () => { function C() {} C.prototype = { initialize() {}, terminate() {} }; return C; };
  const commands = {}, vars = {}, transfers = [], messages = [], errors = [];
  function Game_System() {}
  Game_System.prototype.isSaveEnabled = function () { return this._saveEnabled; };
  Game_System.prototype.disableSave = function () { this._saveEnabled = false; };
  Game_System.prototype.enableSave = function () { this._saveEnabled = true; };
  const sys = Object.assign(new Game_System(), { _saveEnabled: saveEnabled, _psGame: game, _psBattleSeq: 0 });
  const req = p => {
    if (p === 'path' || p === 'fs') return require(p);
    if (/engine\.cjs$/.test(p)) return E;
    if (/fixtures\/game\.cjs$/.test(p)) return require(path.join(ROOT, 'js/engine/fixtures/game.cjs'));
    if (/game\/describe\.cjs$/.test(p)) return require(path.join(ROOT, 'js/engine/game/describe.cjs'));
    throw new Error('unexpected require ' + p);
  };
  req.resolve = p => path.resolve(ROOT, p);
  const ctx = {
    Error, performance, require: req, console: { log() {}, warn() {}, error: (...a) => errors.push(a.map(String).join(' ')) },
    PluginManager: { parameters: () => ({ homeMapId: '5', homeX: '8', homeY: '9' }), registerCommand(n, k, f) { commands[`${n}:${k}`] = f; }, callCommand(self, n, k, a) { commands[`${n}:${k}`].call(self, a); } },
    Game_Interpreter: Ctor(), Window_Base: Ctor(), Window_Command: Ctor(), Scene_MenuBase: Ctor(), Game_System,
    SceneManager: { push() {}, isSceneChanging: () => false }, Graphics: { frameCount: 0 }, Utils: { extractFileName: x => x },
    $gameSystem: sys, $gameVariables: { setValue(k, v) { vars[k] = v; }, value: k => vars[k] || 0 },
    $gameMap: { mapId: () => 5, isEventRunning: () => false }, $gamePlayer: { reserveTransfer(...a) { transfers.push(a); } },
    $dataMapInfos: [null, null, null, null, null, {}], $dataCommonEvents: [],
    $gameMessage: { isBusy: () => false, add(t) { if (failMessage && !messages.length) { messages.push(null); throw new Error('injected: message window failure'); } messages.push(t); } },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  if (interpreter) {
    const src = fs.readFileSync(REACTOR_OBJECTS, 'utf8');
    const at = src.indexOf('function Game_Interpreter()'); const end = src.indexOf('(function()', at);
    assert.ok(at > 0 && end > at, 'Game_Interpreter found in the installed Reactor runtime');
    vm.runInContext('Math.randomInt = function (max) { return Math.floor(max * Math.random()); };', ctx); // rmmz_core
    vm.runInContext(src.slice(at, end), ctx, { filename: 'reactor_objects.js (Game_Interpreter)' });
    for (const m of ['updateChild', 'command117', 'command122', 'clear', 'updateWaitMode']) assert.equal(typeof ctx.Game_Interpreter.prototype[m], 'function', m);
  }
  vm.runInContext(plugin, ctx, { filename: 'PS_BattleFlow.js (built)' });
  const flow = ctx.PSFlow;
  flow._content = content; flow._dex = E.dex.createDexLookup(); flow.rng = lcg(1);
  return { ctx, flow, sys, vars, transfers, messages, errors, game: () => sys._psGame };
}
/** Start a battle the way the plugin does (the scene is a stub) and end it with `result` through the scene's onEnd. */
function battle(h, { canLose = false, resultVariable = 0, result = lost } = {}) {
  h.flow.openBattle({ kind: 'wild', foes: [{ species: 'Pidgey', level: 30 }], seq: 1, battleId: 'b#1', resultVariable, canLose });
  return () => h.ctx.Scene_PSBattle.prototype.onEnd.call({ _session: { result: () => result('b#1') }, popScene() {} });
}

// ---- N4: the save permission
test('a battle masks saving only while it runs: the game flag is never written by the battle, so a change made meanwhile stays (normal end and abort)', () => {
  const rows = [];
  for (const before of [true, false]) for (const during of ['none', 'disable', 'enable']) for (const end of ['finish', 'abort']) {
    const h = host({ saveEnabled: before });
    const finish = battle(h, { result: ran });
    const inBattle = h.sys.isSaveEnabled();
    if (during === 'disable') h.sys.disableSave();
    if (during === 'enable') h.sys.enableSave();
    const maskedAfterChange = h.sys.isSaveEnabled();
    if (end === 'finish') finish(); else h.flow.abort(new Error('scene failure'));
    const expected = during === 'none' ? before : during === 'enable';
    rows.push([before, during, end, inBattle, maskedAfterChange, h.sys.isSaveEnabled(), h.sys._saveEnabled]);
    assert.deepEqual([inBattle, maskedAfterChange], [false, false], `${before}/${during}/${end}: no save while the battle runs`);
    assert.deepEqual([h.sys.isSaveEnabled(), h.sys._saveEnabled], [expected, expected], `${before}/${during}/${end}: afterwards the game's own flag decides`);
    assert.equal(h.flow.running, false);
  }
  assert.equal(rows.length, 12);
});

// ---- N3: host failures after the commit
test('a message failure after a committed defeat keeps code 4 / applied / blackout, the result variable and the trip home; nothing is settled twice', () => {
  const h = host({ failMessage: true });
  battle(h, { resultVariable: 10 })();
  const o = h.flow.lastOutcome;
  assert.deepEqual(J([o.code, o.commit, o.blackout, o.defeat]), [4, 'applied', true, { moneyLost: 16, healed: true }]);
  assert.deepEqual(J(o.hostErrors.map(e => [e.step, e.error])), [['message', 'injected: message window failure']]);
  assert.equal(h.vars[10], 4, 'the event sees the committed result');
  assert.deepEqual(J(h.transfers), [[5, 8, 9, 2, 0]], 'the trip home was requested before the messages');
  assert.deepEqual(J([h.game().money, Object.keys(h.game().appliedBattles), h.game().party[0].hp > 1]), [484, ['b#1'], true]);
  assert.equal(h.flow.running, false);
  // a later failure in the scene's wiring is a host error after the commit, never an abort of the committed battle
  h.flow.abort(new Error('late scene failure'));
  assert.deepEqual([h.flow.lastOutcome.code, h.flow.lastOutcome.commit, h.flow.lastOutcome.blackout, h.vars[10]], [4, 'applied', true, 4]);
  assert.deepEqual(J(h.flow.lastOutcome.hostErrors.map(e => e.step)), ['message', 'after-commit']);
  assert.equal(h.flow.commit(h.flow.lastResult), 'already-applied'); assert.equal(h.game().money, 484, 'no second settlement');
});

test('a translation failure after the commit is kept the same way, and a failed trip home stays retryable', () => {
  const h = host();
  const finish = battle(h, { resultVariable: 10 });
  h.flow.debug.failReturn = true;
  const tr = h.flow.translator; h.flow.translator = () => { throw new Error('injected: translation failure'); };
  try { finish(); } finally { h.flow.translator = tr; }
  const o = h.flow.lastOutcome;
  assert.deepEqual([o.code, o.commit, o.blackout, h.vars[10]], [4, 'applied', true, 4]);
  assert.deepEqual(J(o.hostErrors.map(e => [e.step, e.error])), [['message', 'injected: translation failure']]);
  assert.deepEqual([h.flow.lastReturn.status, h.transfers.length], ['failed', 0]);
  const settled = JSON.stringify(h.game());
  assert.equal(h.flow.retryReturnHome().status, 'requested'); assert.deepEqual(J(h.transfers), [[5, 8, 9, 2, 0]]);
  assert.equal(JSON.stringify(h.game()), settled, 'the retry only moves the player');
  assert.equal(h.flow.retryReturnHome().status, 'none');
});

test('before the commit an abort is still an abort: nothing is installed and the event sees 0', () => {
  const h = host();
  const before = JSON.stringify(h.game());
  battle(h, { resultVariable: 10 });
  h.flow.abort(new Error('engine failure mid-battle'));
  assert.deepEqual([h.flow.lastOutcome.code, h.flow.lastOutcome.commit, h.flow.lastOutcome.aborted, h.vars[10]], [0, 'none', true, 0]);
  assert.equal(JSON.stringify(h.game()), before);
});

// ---- F1: the calling chain of a lost battle (Reactor's own interpreter)
const haveReactor = fs.existsSync(REACTOR_OBJECTS);
test('a blackout ends the calling chain of the battle: directly, through one and two common events; canLose on continues; other interpreters and later events run', { skip: haveReactor ? false : 'Reactor runtime not installed here (js/reactor_objects.js): run scripts/setup-reactor.sh' }, () => {
  const c = (code, parameters = []) => ({ code, indent: 0, parameters });
  const END = c(0); const set = (v, n) => c(122, [v, v, 0, 0, n]);
  const startBattle = canLose => c(357, ['PS_BattleFlow', 'StartBattle', 'Start battle', { kind: 'wild', foes: 'pidgey:30', battleId: 'chain', resultVariable: '0', canLose: String(canLose) }]);
  function run(shape, canLose) {
    const h = host({ interpreter: true });
    h.ctx.$dataCommonEvents[1] = { list: [startBattle(canLose), set(1, 555), END] };
    h.ctx.$dataCommonEvents[2] = { list: [c(117, [1]), set(2, 666), END] };
    const root = new h.ctx.Game_Interpreter();
    root.setup(shape === 0 ? [startBattle(canLose), set(3, 777), END] : [c(117, [shape]), set(3, 777), END], 1);
    root.update();
    assert.equal(h.flow.running, true, 'the battle is open and the event waits');
    h.ctx.Scene_PSBattle.prototype.onEnd.call({ _session: { result: () => lost(h.flow.request.battleId) }, popScene() {} });
    root.update();
    return { h, root, after: [h.vars[1] || 0, h.vars[2] || 0, h.vars[3] || 0], running: root.isRunning(), blackout: !!h.flow.lastOutcome.blackout, money: h.game().money };
  }
  for (const [label, shape] of [['direct', 0], ['one common event', 1], ['two common events', 2]]) {
    const r = run(shape, false);
    assert.deepEqual([r.after, r.running, r.blackout, r.money], [[0, 0, 0], false, true, 484], `${label}: nothing after the battle runs, at any level`);
  }
  const control = run(1, true);
  assert.deepEqual([control.after, control.blackout, control.money], [[555, 0, 777], false, 484], 'canLose on: the defeat is settled and the event goes on');
  // the end mark does not leak: the same interpreter runs the next event normally, a child included
  const { h, root } = run(2, false);
  h.ctx.$dataCommonEvents[3] = { list: [set(4, 1), END] };
  root.setup([c(117, [3]), set(5, 1), END], 1); root.update();
  assert.deepEqual([h.vars[4], h.vars[5], root.isRunning()], [1, 1, false], 'a later event (with a common event) runs completely');
  // an interpreter outside the battle's chain is not ended by it
  const other = new h.ctx.Game_Interpreter(); other.setup([c(117, [3]), set(6, 1), END], 2); other.update();
  assert.equal(h.vars[6], 1);
});

test('the end of a lost battle belongs to that battle: an interpreter that waited for another battle id is not ended; clear() removes the marks', { skip: haveReactor ? false : 'Reactor runtime not installed here (js/reactor_objects.js): run scripts/setup-reactor.sh' }, () => {
  const h = host({ interpreter: true });
  const waiting = id => { const i = new h.ctx.Game_Interpreter(); i.setup([{ code: 0, indent: 0, parameters: [] }], 1); i._waitMode = 'psBattle'; i._psBattleId = id; return i; };
  h.flow.running = false; h.flow.lastOutcome = { battleId: 'B#2', blackout: true };
  const other = waiting('A#1'); other.updateWaitMode();
  assert.deepEqual(J([other._index, other._psEndChain === undefined, other._psBattleId === undefined]), [0, true, true], 'another battle: not ended, its wait is over');
  const mine = waiting('B#2'); mine.updateWaitMode();
  assert.deepEqual(J([mine._index, mine._psEndChain]), [1, true], 'this battle: ended');
  mine.clear(); assert.deepEqual(J([mine._psEndChain === undefined, mine._psBattleId === undefined]), [true, true]);
});

test('encounter notes: the syntax is checked in the adapter (fields per segment, one "=" in regions); a malformed note gives no table and says why', () => {
  const h = host();
  const parse = note => { h.ctx.$dataMap = { meta: { PSEncounter: note } }; h.flow._encCache = null; return J(h.flow.mapEncounters().data); };
  assert.deepEqual(parse('regions=1;pidgey,60,2-4;caterpie,40,3'), { table: { regions: [1], slots: [{ species: 'pidgey', weight: 60, minLevel: 2, maxLevel: 4 }, { species: 'caterpie', weight: 40, minLevel: 3, maxLevel: 3 }] }, problems: [] });
  for (const bad of ['regions=1=2;pidgey,60,2-4', 'pidgey,60,2-4-99', 'pidgey,60,2-4,extra', 'pidgey,60']) {
    const r = parse(bad);
    assert.equal(r.table, null, bad); assert.equal(r.problems.length, 1, bad);
  }
});
