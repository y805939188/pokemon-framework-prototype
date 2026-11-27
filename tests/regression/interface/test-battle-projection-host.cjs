'use strict';
// The MZ adapter's battle lifecycle in a Node VM host stub (no MZ, no NW.js, no windows): the BUILT
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

const ROOT = path.resolve(__dirname, '../../..');
const E = require('../../../js/engine/build/engine.cjs');
const REACTOR_OBJECTS = path.join(ROOT, 'js/reactor_objects.js');
const SRC = path.join(ROOT, 'content/sample');
const read = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const content = E.contentRuntime.assembleContent(E.contentCompile.compileContent({ manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json'), grants: read('grants.json'), regionalDex: read('regional-dex.json'), mapMetadata: read('map-metadata.json') }).data, E.dex.createDexLookup()).content;
/** Values made inside the VM context have that context's prototypes: compare their JSON form. */
const J = x => JSON.parse(JSON.stringify(x));
const MAP_FRAME_MS = 1000 / 60;

// Host4 deliberately supplies a synthetic settlement port. Keep the installed
// plugin's Battle constructor/create/controller/onEnd/terminate; only raster,
// windows and host frame input are controlled. No Battle.start/UI/engine claim.
function installInterpreterPresentation(ctx) {
  const covers = [], base = ctx.Scene_MenuBase.prototype;
  ctx.performance = Object.freeze({ now: () => ctx.Graphics.frameCount * MAP_FRAME_MS });
  Object.assign(ctx.Graphics, { boxWidth: 816, boxHeight: 624 });
  ctx.Rectangle = class Rectangle {
    constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); }
  };
  ctx.Bitmap = class Bitmap {
    constructor(width, height) { Object.assign(this, { width, height }); }
    fillAll() {}
    destroy() { this.destroyed = true; }
  };
  ctx.Sprite = class Sprite {
    constructor(bitmap) { Object.assign(this, { bitmap, scale: {}, parent: null }); }
    destroy() { this.destroyed = true; }
  };
  base.addChild = function (sprite) {
    assert.equal(sprite.parent, null);
    assert.equal(sprite.bitmap.width, 1); assert.equal(sprite.bitmap.height, 1);
    this.children.push(sprite); sprite.parent = this;
    covers.push({ scene: this, sprite, bitmap: sprite.bitmap });
    return sprite;
  };
  base.removeChild = function (sprite) {
    const i = this.children.indexOf(sprite); assert(i >= 0);
    this.children.splice(i, 1); sprite.parent = null; return sprite;
  };
  base.addWindow = function (window) {
    assert(this._windowLayer); this.children.push(window);
  };
  ctx.Window_Base.prototype.initialize = function (rect) { this.innerHeight = rect.height; };
  ctx.Window_Base.prototype.lineHeight = () => 36;
  Object.assign(ctx.Window_Command.prototype, {
    initialize() { this.handlers = {}; },
    setHandler(key, handler) { this.handlers[key] = handler; },
    deactivate() { this.active = false; },
    hide() { this.visible = false; },
  });
  const native = fs.readFileSync(path.join(ROOT, 'js/reactor_scenes.js'), 'utf8');
  const label = 'Scene_Base.prototype.popScene';
  const a = native.indexOf(label + ' = function'), b = native.indexOf('\n};', a);
  assert(a >= 0 && b > a, 'the installed Reactor Scene_Base.popScene');
  // Same pinned native body; this host's controlled base owns the prototype.
  vm.runInContext('Scene_MenuBase.prototype.popScene' + native.slice(a + label.length, b + 4), ctx, {
    filename: 'reactor_scenes.js (Scene_Base.popScene)',
  });
  return covers;
}
function assertRetiredCover(covers, scene) {
  const matching = covers.filter(row => row.scene === scene);
  assert.equal(matching.length, 1, 'exactly one plugin-owned cover on this Map');
  const { sprite, bitmap } = matching[0];
  assert.deepEqual([sprite.parent, sprite.bitmap, sprite.destroyed, bitmap.destroyed, scene.children.includes(sprite)],
    [null, null, true, true, false], 'the original owned cover, bitmap and scene binding are released');
}
function assertPhases(op, phases, durations) {
  const view = op.prebattle.snapshot();
  assert.equal(op.prebattleMode, 'default-map');
  assert.equal(view.phase, phases[phases.length - 1]);
  assert.equal(view.primaryError, null);
  assert.deepEqual(J(view.cleanupErrors), []);
  const rows = Array.from(view.stages);
  assert(rows.every(row => row.at === row.frame * MAP_FRAME_MS));
  assert.deepEqual(rows.map(row => row.phase), phases);
  assert.deepEqual(rows.map(row => row.targetMs), durations);
  for (let i = 1; i < rows.length; i++) {
    const before = rows[i - 1], after = rows[i];
    if (before.targetMs > 0) {
      assert(after.frame > before.frame);
      assert(after.at - before.at >= before.targetMs, before.phase + ' ended before its time budget');
      assert(after.at - before.at <= before.targetMs + MAP_FRAME_MS + 1e-6,
        before.phase + ' did not advance on the next admissible 60 Hz frame');
    }
  }
}
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
  return E.state.newGame({ content, party: [E.speciesKey.toPersistentMember(m, content)], money: 500 }); // stored by content id + form (D5-3)
}
const lost = battleId => ({ protocol: 1, battleId, outcome: { kind: 'win', winner: 'Wild' }, members: { 'S-1': { hp: 0 } }, bag: {}, captured: [], dex: { seen: ['Pidgey'], owned: [] } });
const ran = battleId => ({ protocol: 1, battleId, outcome: { kind: 'run', winner: null }, members: {}, bag: {}, captured: [], dex: { seen: [], owned: [] } });

function host({ interpreter = false, saveEnabled = true, failMessage = false, game = losingGame() } = {}) {
  const Ctor = () => { function C() {} C.prototype = { initialize() {}, terminate() {} }; return C; };
  const commands = {}, vars = {}, transfers = [], messages = [], errors = [];let nativeSnapshot=()=>null;
  let covers, nativeSessions;
  function Game_System() {}
  Game_System.prototype.isSaveEnabled = function () { return this._saveEnabled; };
  Game_System.prototype.disableSave = function () { this._saveEnabled = false; };
  Game_System.prototype.enableSave = function () { this._saveEnabled = true; };
  const sys = Object.assign(new Game_System(), { _saveEnabled: saveEnabled, _psGame: game, _psBattleSeq: 0 });
  const req = p => {
    if (p === 'path' || p === 'fs' || p === 'node:util' || (interpreter && p === 'node:crypto')) return require(p);
    if (/production\.cjs$/.test(p)) {
      const product=require(path.join(ROOT,'js/engine/build/production.cjs'));
      if(!interpreter)return product;
      const Legacy=require('../../support/application/legacy-test-support.cjs').AutomaticApplication;
      return {...product,app:{...product.app,GameApplication:class extends Legacy {constructor(ports,options){
       const sessions = E.fakes.createFakeSessions(() => lost(ctx.PSFlow.request.battleId));
       super({...ports,blackout:undefined,blackoutProjection:undefined,sessions},options);
       nativeSessions = sessions;
       nativeSnapshot=()=>ports.state.atomicWorldContent(()=>actual=>{const l=actual.lifecycle,b=l.travelLease?.mapBirth;return{value:{application:l.application===this,registry:l.travelLease?.registry===ports.worldTravel?.nativeLeaseSource,epoch:!!l.travelLease?.nativeEpoch,currentNull:l.travelLease?.current===null,handoff:!!l.travelLease?.sourceHandoff,birth:!!b,scene:b?.scene===l.scene,manager:b?.manager===l.sceneTransition?.manager,frame:!!b?.frame,map:b?.frame?.map===l.map,mapId:b?.frame?.mapId===l.mapId,player:b?.frame?.player===l.player,data:b?.frame?.data===l.mapData,started:l.sceneTransition?.started,nextNull:l.sceneTransition?.nextScene===null,transfer:l.travelPlayer?.transferring,position:l.playerPosition}};});
      }}}};
    }
    if (/testing\.cjs$/.test(p)) return require(path.join(ROOT, 'js/engine/build/testing.cjs'));
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
  require('../../../scripts/tests/legacy-mz-world-host.cjs').install(ctx);
  ctx.window = ctx;
  vm.createContext(ctx);
  if (interpreter) {
    const src = fs.readFileSync(REACTOR_OBJECTS, 'utf8');
    const at = src.indexOf('function Game_Interpreter()'); const end = src.indexOf('(function()', at);
    assert.ok(at > 0 && end > at, 'Game_Interpreter found in the installed Reactor runtime');
    vm.runInContext('Math.randomInt = function (max) { return Math.floor(max * Math.random()); };', ctx); // rmmz_core
    vm.runInContext(src.slice(at, end), ctx, { filename: 'reactor_objects.js (Game_Interpreter)' });
    for (const m of ['updateChild', 'command117', 'command122', 'command357', 'clear', 'updateWaitMode']) assert.equal(typeof ctx.Game_Interpreter.prototype[m], 'function', m);
  }
  if (interpreter) {
    require('../../../scripts/tests/legacy-mz-native-entry.cjs').install(ctx, ROOT);
    covers = installInterpreterPresentation(ctx);
  }
  vm.runInContext(plugin, ctx, { filename: 'PS_BattleFlow.js (built)' });
  const flow = ctx.PSFlow;
  flow._content = content; flow._dex = E.dex.createDexLookup();
  if (!interpreter) flow.rng = lcg(1);
  // Both fixtures select the historical no-held synthetic producer. Only the
  // non-interpreter API fixtures below also substitute for Flow.begin itself.
  const Legacy = require('../../support/application/legacy-test-support.cjs').AutomaticApplication;
  if(interpreter)flow.app();
  else flow._app = new Legacy({state:{read:()=>flow.game(),replace:next=>{sys._psGame=next;}},
    content:()=>({content,dex:flow._dex}),sessions:E.fakes.createFakeSessions({}),projection:{project:out=>flow.projectOutcome(out)},random:n=>flow.random(n) });
  if (interpreter) {
    require('../../../scripts/tests/legacy-mz-native-entry.cjs').enter(ctx);
    const app = flow.app();
    const captured = app.latchLegacyBattleContext({ weather: 'none', terrain: 'none', environment: 'none' });
    assert.equal(captured.status, 'value', 'real legacy357 current App/atomic/native Map source ' +
      (captured.status === 'value' ? '' : JSON.stringify({ captured, native: nativeSnapshot() })));
    assert.equal(app.isLegacyBattleFieldCurrent(captured.value), true);
    assert.equal(flow.fast, false); assert.equal(flow.rng, null); assert.equal(flow.clock, null);
    assert.equal(flow.seed, undefined);
  }
  return { ctx, flow, sys, vars, transfers, messages, errors, covers, nativeSessions, game: () => sys._psGame };
}
/** Start a battle the way the plugin does (the scene is a stub) and end it with `result` through the scene's onEnd. */
function battle(h, { canLose = false, resultVariable = 0, result = lost } = {}) {
  h.flow.openBattle({ kind: 'wild', foes: [{ species: 'Pidgey', level: 30 }], seq: 1, battleId: 'b#1', resultVariable, canLose });
  // This host-only fixture substitutes for begin(): give the synthetic session the same ownership begin records.
  h.flow._op.canLose = !!h.flow._op.request.canLose;
  const session = h.flow._op.session = { result: () => result('b#1') };
  return () => h.ctx.Scene_PSBattle.prototype.onEnd.call({ _session: session, popScene() {} });
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
  const player = h.ctx.$gamePlayer;
  const reserve = player.reserveTransfer, translator = h.flow.translator;
  const trip = [5, 8, 9, 2, 0], attempts = [], order = [];
  const reserveError = 'injected: player reserveTransfer failure';
  const assertAttempts = count => {
    assert.deepEqual(attempts.map(({ args }) => args), Array(count).fill(trip));
    assert.ok(attempts.every(({ receiver }) => receiver === player), 'reserveTransfer keeps the player receiver');
  };
  assert.deepEqual([h.game().money, h.game().party[0].hp, Object.keys(h.game().appliedBattles)], [500, 1, []]);
  // Fail at the ordinary host boundary, not through a developer-scoped Flow injection.
  player.reserveTransfer = function (...args) {
    attempts.push({ receiver: this, args });
    order.push('reserve');
    if (attempts.length === 1) throw new Error(reserveError);
    return Reflect.apply(reserve, this, args);
  };
  try {
    h.flow.translator = () => { order.push('translate'); throw new Error('injected: translation failure'); };
    try { finish(); } finally { h.flow.translator = translator; }
    const o = h.flow.lastOutcome;
    assert.deepEqual(J([o.code, o.commit, o.blackout, o.defeat, h.vars[10]]), [4, 'applied', true, { moneyLost: 16, healed: true }, 4]);
    assert.deepEqual(J(o.hostErrors.map(e => [e.step, e.error])), [['message', 'injected: translation failure']]);
    assert.deepEqual(order, ['reserve', 'translate'], 'the real return attempt happened before the translation fault');
    assertAttempts(1);
    assert.deepEqual(h.transfers, [], 'the failed call never reached the original transfer port');
    assert.equal(h.flow.lastReturn.status, 'failed');
    assert.equal(h.flow.lastReturn.error, reserveError);
    assert.strictEqual(h.flow.pendingReturn, h.flow.lastReturn);
    assert.deepEqual(J([h.game().money, Object.keys(h.game().appliedBattles), h.game().party[0].hp > 1]), [484, ['b#1'], true]);
    assert.equal(h.flow.running, false);
    const settled = JSON.stringify(h.game());
    const retried = h.flow.retryReturnHome();
    assert.equal(retried.status, 'requested');
    assert.strictEqual(h.flow.lastReturn, retried);
    assert.equal(h.flow.pendingReturn, null);
    assertAttempts(2);
    assert.deepEqual(h.transfers, [trip], 'the retry reaches the original transfer port exactly once');
    assert.equal(JSON.stringify(h.game()), settled, 'the retry only moves the player');
    assert.equal(h.flow.retryReturnHome().status, 'none');
    assertAttempts(2);
    assert.deepEqual(h.transfers, [trip], 'no pending return means no further transfer');
    assert.strictEqual(h.flow.lastOutcome, o);
    assert.equal(h.vars[10], 4);
    assert.equal(JSON.stringify(h.game()), settled, 'a second retry does not settle again');
    assert.equal(h.flow.commit(h.flow.lastResult), 'already-applied');
    assert.equal(JSON.stringify(h.game()), settled, 'recommitting the defeated result is a no-op');
  } finally {
    player.reserveTransfer = reserve;
  }
  assert.strictEqual(player.reserveTransfer, reserve);
  assert.strictEqual(h.flow.translator, translator);
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
const c = (code, parameters = []) => ({ code, indent: 0, parameters });
const END = c(0);
const set = (v, n) => c(122, [v, v, 0, 0, n]);
const startBattle = (canLose, battleId = 'chain') => c(357, ['PS_BattleFlow', 'StartBattle', 'Start battle', {
  kind: 'wild', foes: 'pidgey:30', battleId, resultVariable: '0', canLose: String(canLose),
}]);

async function runInterpreterBattle(h, root, depth, canLose) {
  const { ctx: G, flow } = h, M = G.SceneManager, app = flow.app();
  const source = M._scene, stack = M._stack, prefix = Array.from(stack), pushes = M.pushed.length;
  assert(source instanceof G.Scene_Map); assert.equal(source.isStarted(), true);
  const before = JSON.stringify(h.game());
  root.update(); // pinned command357 and native common-event child chain, not a direct plugin call
  assert.equal(flow.running, true, 'the 357 admitted a battle ' + JSON.stringify({ outcome: flow.lastOutcome, errors: h.errors }));
  const op = flow._op, admission = op.worldAdmission, appOp = app.op;
  assert(admission && appOp); assert.strictEqual(flow.request, op.request);
  assert.equal(app.isLegacyBattleAdmissionCurrent(admission), true);
  assert.equal(op.request.canLose, canLose);
  let waiter = root;
  for (let i = 0; i < depth; i++) {
    assert(waiter._childInterpreter instanceof G.Game_Interpreter);
    waiter = waiter._childInterpreter;
  }
  assert.equal(waiter._childInterpreter, null);
  assert.equal(waiter._waitMode, 'psBattle');
  assert.equal(waiter._psBattleId, admission.battleId);
  assert.equal(waiter._index, 1, 'exactly past the native 357, before the continuation');
  assert.equal(op.session, null); assert.equal(h.nativeSessions.created.length, 0);
  assert.equal(M.pushed.length, pushes); assert.strictEqual(M._scene, source); assert.equal(M._nextScene, null);
  assert.deepEqual(Array.from(stack), prefix);
  assertPhases(op, ['flash'], [800]);
  assert.equal(h.sys.isSaveEnabled(), false);

  function tickMap() {
    ++G.Graphics.frameCount;
    M.changeScene(); // original native terminate / publish / create
    if (M._scene instanceof G.Scene_Map) {
      // Map events run before the installed Map wrapper polls its overlay.
      // The still-owned native interpreter must wait through the last return frame.
      if (M._scene.isStarted()) root.update();
      M.updateScene(); // original native Map scheduling; no synthetic battle UI update
    }
  }
  let queued = null;
  for (let frame = 0; !queued && frame < 180; frame++) {
    tickMap();
    assert.strictEqual(M._scene, source, 'the original Map owns every pre-entry update');
    assert.equal(waiter._index, 1); assert.equal(waiter._waitMode, 'psBattle');
    assert.equal(op.session, null); assert.equal(h.nativeSessions.created.length, 0);
    queued = M._nextScene;
    if (!queued) assert.equal(M.pushed.length, pushes, 'no early Battle push');
  }
  assert(queued instanceof G.Scene_PSBattle, 'the native push allocated the original Battle Scene');
  assert.equal(M.pushed.length, pushes + 1); assert.strictEqual(M.pushed[pushes], G.Scene_PSBattle);
  assert.strictEqual(M._stack, stack); assert.deepEqual(Array.from(stack), [...prefix, source.constructor]);
  assert.strictEqual(queued._psOp, op);
  const openingPhases = ['flash', 'transition', 'after', 'battle'], openingMs = [800, 1250, 100, 0];
  assertPhases(op, openingPhases, openingMs);

  tickMap(); // native changeScene invokes the actual P.create -> controller -> Flow.begin
  const scene = M._scene;
  assert.strictEqual(scene, queued); assert.equal(M._nextScene, null);
  assertRetiredCover(h.covers, source);
  for (let turn = 0; !scene._controller.ready && turn < 8; turn++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(scene._controller.ready, true, 'original Battle.create never published its ready result');
  assert.equal(scene._failure, null);
  assert.equal(scene._controller.isCurrent(), true);
  assert.equal(scene.isStarted(), false, 'the opaque settlement fixture does not drive Battle.start or UI');
  assert.strictEqual(flow.app(), app); assert.strictEqual(flow._op, op); assert.strictEqual(app.op, appOp);
  const session = scene._session;
  assert(session); assert.strictEqual(op.session, session); assert.strictEqual(appOp.session, session);
  assert.equal(session.result().battleId, admission.battleId);
  assert.equal(op.canLose, canLose, 'Flow.begin, not the test, captured canLose');
  assert.equal(h.nativeSessions.created.length, 1);
  assert.equal(h.nativeSessions.created[0].request.battleId, admission.battleId);
  assert.equal(h.nativeSessions.created[0].request.canLose, canLose);
  assert.equal(JSON.stringify(h.game()), before, 'the actual admission never settles ahead of onEnd');

  scene.onEnd(); // actual owner and original native pop; no bare fake receiver or manual Session assignment
  const outcome = flow.lastOutcome;
  assert.deepEqual([outcome.battleId, outcome.code, outcome.commit, !!outcome.blackout],
    [admission.battleId, 4, 'applied', !canLose]);
  assert.deepEqual(J(outcome.defeat), { moneyLost: 16, healed: true });
  assert.deepEqual(J([h.game().money, Object.keys(h.game().appliedBattles), h.game().party[0].hp > 1]),
    [484, [admission.battleId], true]);
  assert.deepEqual(h.transfers, canLose ? [] : [[5, 8, 9, 2, 0]], 'the existing home request recorder preserves canLose policy');
  assert.equal(flow.running, false);
  assert.equal(op.prebattle.snapshot().phase, 'return-pending');
  assert.equal(h.sys.isSaveEnabled(), false);
  const returned = M._nextScene;
  assert(returned instanceof G.Scene_Map);
  assert.notStrictEqual(returned, source); assert.strictEqual(M._scene, scene);
  assert.strictEqual(M._stack, stack); assert.deepEqual(Array.from(stack), prefix);
  const settled = JSON.stringify(h.game());
  for (let frame = 0; op.prebattle.snapshot().phase !== 'done' && frame < 70; frame++) {
    tickMap();
    assert.strictEqual(M._scene, returned);
    assert.equal(waiter._index, 1); assert.equal(waiter._waitMode, 'psBattle');
    assert.equal(waiter._psBattleId, admission.battleId);
  }
  assertPhases(op, [...openingPhases, 'return-pending', 'return', 'done'], [...openingMs, 0, 400, 0]);
  assertRetiredCover(h.covers, returned);
  assert.equal(M._nextScene, null); assert.equal(returned.isStarted(), true);
  assert.equal(scene._controller.isCurrent(), false);
  assert.equal(flow.operationPending(), false); assert.equal(app.op, null);
  assert.equal(h.sys.isSaveEnabled(), true);
  assert.strictEqual(flow.lastOutcome, outcome);
  assert.equal(JSON.stringify(h.game()), settled);
  assert.equal(h.errors.length, 0, 'no refused native admission or product host error');
  return { outcome, waiter };
}

test('a blackout ends the calling chain of the battle: directly, through one and two common events; canLose on continues; other interpreters and later events run', { skip: haveReactor ? false : 'Reactor runtime not installed here (js/reactor_objects.js): run scripts/setup-reactor.sh' }, async () => {
  async function run(shape, canLose) {
    const h = host({ interpreter: true });
    h.ctx.$dataCommonEvents[1] = { list: [startBattle(canLose), set(1, 555), END] };
    h.ctx.$dataCommonEvents[2] = { list: [c(117, [1]), set(2, 666), END] };
    const root = new h.ctx.Game_Interpreter();
    root.setup(shape === 0 ? [startBattle(canLose), set(3, 777), END] : [c(117, [shape]), set(3, 777), END], 1);
    const { outcome, waiter } = await runInterpreterBattle(h, root, shape, canLose);
    root.update(); // actual wait/child wrappers propagate only to the matched native chain
    assert.equal(waiter._waitMode, ''); assert.equal(waiter._psBattleId, undefined);
    assert.equal(!!root._psEndChain, !canLose);
    return { h, root, after: [h.vars[1] || 0, h.vars[2] || 0, h.vars[3] || 0], running: root.isRunning(), blackout: !!outcome.blackout, money: h.game().money };
  }
  for (const [label, shape] of [['direct', 0], ['one common event', 1], ['two common events', 2]]) {
    const r = await run(shape, false);
    assert.deepEqual([r.after, r.running, r.blackout, r.money], [[0, 0, 0], false, true, 484], `${label}: nothing after the battle runs, at any level`);
  }
  const control = await run(1, true);
  assert.deepEqual([control.after, control.blackout, control.money], [[555, 0, 777], false, 484], 'canLose on: the defeat is settled and the event goes on');
  // the end mark does not leak: the same interpreter runs the next event normally, a child included
  const { h, root } = await run(2, false);
  h.ctx.$dataCommonEvents[3] = { list: [set(4, 1), END] };
  root.setup([c(117, [3]), set(5, 1), END], 1); root.update();
  assert.deepEqual([h.vars[4], h.vars[5], root.isRunning()], [1, 1, false], 'a later event (with a common event) runs completely');
  // an interpreter outside the battle's chain is not ended by it
  const other = new h.ctx.Game_Interpreter(); other.setup([c(117, [3]), set(6, 1), END], 2); other.update();
  assert.equal(h.vars[6], 1);
});

test('the end of a lost battle belongs to that battle: an interpreter that waited for another battle id is not ended; clear() removes the marks', { skip: haveReactor ? false : 'Reactor runtime not installed here (js/reactor_objects.js): run scripts/setup-reactor.sh' }, async () => {
  const h = host({ interpreter: true });
  const mine = new h.ctx.Game_Interpreter(), other = new h.ctx.Game_Interpreter();
  const active = [startBattle(false, 'B'), set(7, 888), END];
  mine.setup(active, 1); other.setup([END], 1);
  // Deliberate negative: retain another battle's waiter; never manufacture the matching settlement.
  other._waitMode = 'psBattle'; other._psBattleId = 'A#1';
  const { outcome, waiter } = await runInterpreterBattle(h, mine, 0, false);
  assert.strictEqual(waiter, mine); assert.equal(outcome.battleId, 'B#1');
  assert.equal(other.updateWaitMode(), false);
  assert.deepEqual(J([other._index, other._psEndChain === undefined, other._psBattleId === undefined]), [0, true, true], 'another battle: not ended, its wait is over');
  assert.equal(mine.updateWaitMode(), false);
  assert.deepEqual(J([mine._index, mine._psEndChain]), [active.length, true], 'the actual matched 357 waiter is ended');
  mine.update(); assert.equal(mine.isRunning(), false); assert.equal(h.vars[7], undefined);
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
