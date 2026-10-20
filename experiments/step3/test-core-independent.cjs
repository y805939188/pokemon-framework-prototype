'use strict';
// The core (framework/rules) is consumable without MZ, the DOM, Node or Showdown: it compiles with no ambient types,
// its bundle loads and runs in a context that has no require/process/Buffer/console, and it agrees with the engine.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const E = require('../../js/engine/build/engine.cjs');
const golden = require('./fixtures/result-hash-golden.json');

const ROOT = path.resolve(__dirname, '../..');
const CORE = path.join(ROOT, 'js/engine/build/core.cjs');
const TSC = path.join(ROOT, 'src/node_modules/typescript/bin/tsc');

function loadCoreInBareContext() {
  // only the language itself: no require, process, Buffer, TextEncoder, setTimeout or host objects
  const exp = {}; // CommonJS: `exports` and `module.exports` are the same object
  const sandbox = vm.createContext({ module: { exports: exp }, exports: exp });
  vm.runInContext(fs.readFileSync(CORE, 'utf8'), sandbox, { filename: 'core.cjs' });
  for (const name of ['require', 'process', 'Buffer', 'TextEncoder', 'setTimeout', 'window', 'document']) // (V8 gives every context its own `console`; the compile test below proves the sources never name it)
    assert.equal(vm.runInContext(`typeof ${name}`, sandbox), 'undefined', `${name} must not exist in the bare context`);
  return sandbox.module.exports;
}

test('the core bundle has no host or Node references and loads in a bare context', () => {
  const text = fs.readFileSync(CORE, 'utf8');
  for (const re of [/\brequire\s*\(/, /\bprocess\./, /\bBuffer\b/, /__dirname|__filename/, /["']node:/, /\bwindow\.[A-Za-z]|\bdocument\.[A-Za-z]|\$game[A-Z]/]) assert.doesNotMatch(text, re);
  const core = loadCoreInBareContext();
  assert.deepEqual(Object.keys(core).sort(), ['digest', 'growth', 'rules', 'saveSchema', 'state']);
});

test('inside the bare context the core computes exactly what the engine computes', () => {
  const core = loadCoreInBareContext();
  assert.equal(core.digest.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (const e of golden.entries) assert.equal(core.state.resultHash(e.result), e.hash, 'ledger identity: ' + e.name);
  for (const curve of ['erratic', 'fast', 'medium', 'parabolic', 'slow', 'fluctuating']) for (const lv of [1, 2, 50, 100]) assert.equal(core.growth.minExp(curve, lv), E.growth.minExp(curve, lv), `${curve} ${lv}`);
  const game = E.fixtures.makeGame();
  assert.equal(JSON.stringify(core.saveSchema.validateGame(JSON.parse(JSON.stringify(game)))), JSON.stringify(E.saveSchema.validateGame(game))); // (compared as JSON: arrays from another realm)
  const entry = golden.entries.find(x => x.name === 'wild run');
  const ledgered = JSON.parse(JSON.stringify(game)); ledgered.appliedBattles = { [entry.result.battleId]: { hash: entry.hash } };
  assert.equal(core.state.applyBattleResult(ledgered, entry.result).status, 'already-applied');
  assert.throws(() => core.state.applyBattleResult(ledgered, { ...entry.result, bag: { potion: 1 } }), /already applied with a different result/);
});

test('the no-ambient-types compile bites: host, Node and DOM names fail in a copy of the core', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-core-'));
  try {
    fs.cpSync(path.join(ROOT, 'src/framework/rules'), path.join(dir, 'rules'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'src/framework/tsconfig.core.json'), path.join(dir, 'tsconfig.core.json'));
    fs.writeFileSync(path.join(dir, 'rules/probe.ts'), [
      'export const a = process.platform;', 'export const b = Buffer.from("x");', 'export const c = (() => console.log("x"))();',
      'export const d = new TextEncoder().encode("x");', 'export const e = (globalThis as { window?: unknown }).window;', 'export const f = require("node:fs");', 'export const g = setTimeout;', '',
    ].join('\n'));
    const r = spawnSync(process.execPath, [TSC, '--noEmit', '-p', path.join(dir, 'tsconfig.core.json')], { encoding: 'utf8' });
    assert.notEqual(r.status, 0, 'the probe must fail the compile'); assert.ok(r.status > 0, r.stdout);
    for (const name of ['process', 'Buffer', 'console', 'TextEncoder', 'require', 'setTimeout']) assert.match(r.stdout, new RegExp(`Cannot find name '${name}'`), name);
    assert.doesNotMatch(r.stdout, /probe\.ts.*'window'/, 'globalThis typing is the only thing a cast can reach; the checker covers host names');
    // and without the probe the very same copy is clean
    fs.rmSync(path.join(dir, 'rules/probe.ts'));
    const clean = spawnSync(process.execPath, [TSC, '--noEmit', '-p', path.join(dir, 'tsconfig.core.json')], { encoding: 'utf8' });
    assert.equal(clean.status, 0, clean.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
