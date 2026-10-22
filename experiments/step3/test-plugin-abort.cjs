'use strict';
// Compile the actual plugin into a temporary directory; no MZ, Reactor runtime or Showdown is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
let dir, plugin;
test.before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-plugin-abort-'));
  const built = spawnSync('pnpm', ['--dir', 'src', 'exec', 'vite', 'build', '--outDir', dir], { cwd: root, env: { ...process.env, RR_PLUGIN: 'PS_BattleFlow' }, encoding: 'utf8' });
  assert.equal(built.status, 0, built.stdout + built.stderr);
  plugin = fs.readFileSync(path.join(dir, 'PS_BattleFlow.js'), 'utf8');
});
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

function host(failure, failVariable = false) {
  const vars = { 10: 1 }, game = { schema: 2, previousBattle: 'kept' };
  const Ctor = () => { function C() {} C.prototype = { initialize() {}, terminate() {} }; return C; };
  const fakeEngine = { log: { createRingLogger: () => ({ sink() {} }) }, dex: { createDexLookup() { throw new Error('dex unavailable'); } } };
  const req = p => {
    if (/engine\.cjs$/.test(p)) { if (failure === 'engine') throw new Error('engine unavailable'); return fakeEngine; }
    if (p === 'path' || p === 'fs') return require(p);
    return {};
  };
  req.resolve = p => p;
  const ctx = { Error, performance, require: req,
    PluginManager: { registerCommand() {}, parameters: () => ({}) }, Game_Interpreter: Ctor(), Window_Base: Ctor(), Window_Command: Ctor(), Scene_MenuBase: Ctor(), SceneManager: { push() {} },
    $gameSystem: { _psGame: game }, $gameVariables: { setValue(k, v) { if (failVariable) throw new Error('variable unavailable'); vars[k] = v; }, value: k => vars[k] } };
  ctx.window = ctx;
  vm.createContext(ctx); vm.runInContext(plugin, ctx);
  const flow = ctx.PSFlow;
  // a battle opened the way the plugin opens one (since step 5.0 the open battle has its operation identity)
  flow.openBattle({ battleId: 'b#2', kind: 'wild', foes: [{ species: 'Pidgey', level: 5 }], seq: 2, resultVariable: 10 });
  return { ctx, flow, vars, game };
}

for (const failure of ['engine', 'dex']) test(`${failure} initialization fails: abort clears a stale win and releases the interpreter`, async () => {
  const { ctx, flow, vars, game } = host(failure);
  let error;
  await assert.rejects(flow.begin(), e => { error = e; return e.message === `${failure} unavailable`; });
  flow.abort(error);
  assert.equal(vars[10], 0);
  assert.equal(flow.running, false); assert.equal(ctx.$gameSystem._psGame, game);
  const o = flow.lastOutcome;
  assert.deepEqual([o.battleId, o.code, o.commit, o.aborted, o.projection, o.error, o.projectionError], ['b#2', 0, 'none', true, 'ok', `${failure} unavailable`, undefined]);
  const itp = new ctx.Game_Interpreter(); itp._waitMode = 'psBattle';
  assert.equal(itp.updateWaitMode(), false); assert.equal(itp._waitMode, '');
});

test('scene termination uses the same initialization-failure cleanup', () => {
  const { ctx, flow, vars } = host('engine');
  ctx.Scene_PSBattle.prototype.terminate.call({});
  assert.equal(vars[10], 0); assert.equal(flow.running, false);
  assert.equal(flow.lastOutcome.battleId, 'b#2'); assert.equal(flow.lastOutcome.commit, 'none');
});

test('a failing fallback projection is reported separately and still releases the interpreter', () => {
  const { flow, vars } = host('engine', true);
  flow.abort(new Error('start failed'));
  assert.equal(flow.running, false); assert.equal(vars[10], 1);
  assert.deepEqual([flow.lastOutcome.error, flow.lastOutcome.projection, flow.lastOutcome.projectionError], ['start failed', 'failed', 'variable unavailable']);
});
