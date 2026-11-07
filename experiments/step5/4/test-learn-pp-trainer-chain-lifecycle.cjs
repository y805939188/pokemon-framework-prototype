'use strict';
// Pure controls of the actual suite hooks. No compiler, engine, host or game is run.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const SOURCE = fs.readFileSync(path.join(__dirname, 'test-learn-pp-trainer-chain.cjs'), 'utf8');
function controlled({ failure = null } = {}) {
  const hooks = {}, cases = [], calls = { spawn: 0, build: 0, remove: [], host: 0 };
  const error = new Error('owned injected ' + failure);
  const fakeTest = (name, action) => cases.push({ name, action });
  for (const name of ['before', 'beforeEach', 'after']) fakeTest[name] = action => { hooks[name] = action; };
  const files = {
    mkdtempSync() { if (failure === 'allocation') throw error; return '/synthetic-owned/learn-pp'; },
    readFileSync() { if (failure === 'plugin-read') throw error; return 'synthetic compiled bytes'; },
    rmSync(p, options) { calls.remove.push({ path: p, options }); },
  };
  function requireStub(id) {
    if (id === 'node:test') return fakeTest;
    if (id === 'node:assert/strict') return assert;
    if (id === 'node:fs') return files;
    if (id === 'node:path') return path;
    if (id === 'node:os') return { tmpdir: () => '/synthetic-owned' };
    if (id === 'node:child_process') return { spawnSync() { calls.spawn++; return { status: failure === 'compiler' ? 17 : 0, stdout: 'control', stderr: 'synthetic' }; } };
    if (id === './victory-music-driver-host.cjs') return { createVictoryDriverHost() { calls.host++; throw Error('business host prohibited in lifecycle controls'); } };
    if (id === '../../../js/engine/build/production.cjs' || id === './victory-music-native-plan.json') return {};
    if (id === '/synthetic-vite') return { async build() { calls.build++; if (failure === 'fixture-build') throw error; } };
    if (id === '/synthetic-owned/learn-pp/fixture/entry.cjs') { if (failure === 'fixture-load') throw error; return {}; }
    throw Error('prohibited dependency ' + id);
  }
  requireStub.resolve = id => { assert.equal(id, 'vite'); return '/synthetic-vite'; };
  const context = vm.createContext({ require: requireStub, __dirname, process: { env: {} } });
  vm.runInContext(SOURCE, context, { filename: 'actual-learn-pp-chain.cjs' });
  assert.equal(cases.length, 4, 'only register existing four business cases; never invoke them');
  return { hooks, calls, error, context };
}
for (const failure of ['allocation', 'compiler', 'plugin-read', 'fixture-build', 'fixture-load']) test('LPP lifecycle ' + failure + ' retains owned setup artifacts and blocks later business', async () => {
  const c = controlled({ failure });
  if (failure === 'compiler') await assert.rejects(c.hooks.before(), /controlsynthetic/);
  else await assert.rejects(c.hooks.before(), error => error === c.error);
  assert.throws(c.hooks.beforeEach, /earlier case failed/);
  await c.hooks.after(); assert.deepEqual(c.calls.remove, []); assert.equal(c.calls.host, 0);
  assert.equal(c.calls.spawn, failure === 'allocation' ? 0 : ['compiler', 'plugin-read'].includes(failure) ? 1 : 4);
  assert.equal(c.calls.build, ['fixture-build', 'fixture-load'].includes(failure) ? 1 : 0);
});
test('LPP lifecycle successful setup still removes only its generated directory', async () => {
  const c = controlled(); await c.hooks.before(); c.hooks.beforeEach(); await c.hooks.after();
  assert.equal(c.calls.spawn, 4); assert.equal(c.calls.build, 1); assert.equal(c.calls.host, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(c.calls.remove)), [{ path: '/synthetic-owned/learn-pp', options: { recursive: true, force: true } }]);
});
for (const asyncCleanup of [false, true]) test('LPP lifecycle actual finally retains artifacts after ' + (asyncCleanup ? 'async' : 'sync') + ' host cleanup failure', async () => {
  const c = controlled(); await c.hooks.before();
  // Execute the unchanged final catch/finally slice against an empty successful body.
  // This reaches real cleanup-failure wiring without building a synthetic game state.
  const match = SOURCE.match(/  \} catch \(error\) \{ failed = true; throw error; \} finally \{[^\n]+\}\n\}\);\s*$/);
  assert(match, 'actual suite must have one final catch/finally block');
  const tail = match[0].slice(0, match[0].lastIndexOf('\n});'));
  c.context.cleanupError = c.error;
  const thrower = asyncCleanup ? 'async () => { throw cleanupError; }' : '() => { throw cleanupError; }';
  const action = vm.runInContext('(async function () { const h = { cleanup: ' + thrower + ' }; try {\n' + tail + '\n})', c.context);
  await assert.rejects(action(), error => error === c.error);
  assert.throws(c.hooks.beforeEach, /earlier case failed/);
  await c.hooks.after(); assert.deepEqual(c.calls.remove, []); assert.equal(c.calls.host, 0);
});
