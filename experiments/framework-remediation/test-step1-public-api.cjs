'use strict';
// Step 1 public entry contract: production is clean, testing is explicit, and all three entries share one implementation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const BUILD = path.join(ROOT, 'js/engine/build');
const entries = {
  production: path.join(BUILD, 'production.cjs'),
  testing: path.join(BUILD, 'testing.cjs'),
  legacy: path.join(BUILD, 'engine.cjs'),
};
const testingNames = ['fixtures', 'harness', 'matrix', 'fakes', 'scripted', 'heldDiagnostics'];

function load(order = ['production', 'testing', 'legacy']) {
  const loaded = {};
  for (const name of order) loaded[name] = require(entries[name]);
  return loaded;
}

function assertShared({ production: P, testing: T, legacy: L }) {
  for (const name of testingNames) {
    assert.equal(Object.hasOwn(P, name), false, `production must not export ${name}`);
    assert.equal(T[name], L[name], `legacy/testing must share the ${name} namespace`);
  }
  assert.deepEqual(Object.keys(L).sort(), [...Object.keys(P), ...Object.keys(T)].sort());
  for (const name of Object.keys(P)) assert.equal(P[name], L[name], `legacy must reuse production.${name}`);
  assert.equal(P.app.GameApplication, L.app.GameApplication);
  assert.equal(P.store.SaveError, L.store.SaveError);
  assert.equal(P.session.SessionBrokenError, L.session.SessionBrokenError);
  assert.equal(P.gateway.GatewayCheckpoint, L.gateway.GatewayCheckpoint);
  assert.equal(P.grants.GrantRefusedError, L.grants.GrantRefusedError);
  assert.ok(new P.store.SaveError({ code: 'probe', message: 'probe' }) instanceof L.store.SaveError);
  class ConsumerApplication extends P.app.GameApplication {}
  assert.ok(ConsumerApplication.prototype instanceof L.app.GameApplication);
}

test('production/testing/legacy exports and nominal identities are shared', () => {
  assertShared(load());
});

test('every historical CommonJS facade still resolves to the legacy namespace', () => {
  const { production: P, legacy: L } = load();
  const facades = {
    'rpg/rules.cjs': 'rules',
    'gateway.cjs': 'gateway',
    'harness.cjs': 'harness',
    'matrix.cjs': 'matrix',
    'fixtures/game.cjs': 'fixtures',
    'game/store.cjs': 'store',
    'game/state.cjs': 'state',
    'game/session.cjs': 'session',
    'game/growth.cjs': 'growth',
    'game/describe.cjs': 'describe',
  };
  for (const [rel, name] of Object.entries(facades)) {
    const facade = require(path.join(ROOT, 'js/engine', rel));
    assert.equal(facade, L[name], rel);
    if (Object.hasOwn(P, name)) assert.equal(facade, P[name], `${rel} must also share production identity`);
  }
});

test('fresh processes preserve identity in every public entry loading order', () => {
  const child = String.raw`
    const assert = require('node:assert/strict');
    const path = require('node:path');
    const build = process.argv[1], order = JSON.parse(process.argv[2]);
    const files = { production: 'production.cjs', testing: 'testing.cjs', legacy: 'engine.cjs' };
    const loaded = {};
    for (const name of order) loaded[name] = require(path.join(build, files[name]));
    const P = loaded.production, T = loaded.testing, L = loaded.legacy;
    for (const name of Object.keys(P)) assert.equal(P[name], L[name]);
    for (const name of Object.keys(T)) assert.equal(T[name], L[name]);
    assert.equal(P.app.GameApplication, L.app.GameApplication);
    assert.equal(P.store.SaveError, L.store.SaveError);
    assert.equal(P.gateway.GatewayCheckpoint, L.gateway.GatewayCheckpoint);
    assert.ok(new P.session.SessionBrokenError('a', 'b') instanceof L.session.SessionBrokenError);
  `;
  for (const order of [
    ['production', 'testing', 'legacy'],
    ['testing', 'legacy', 'production'],
    ['legacy', 'production', 'testing'],
    ['legacy', 'testing', 'production'],
  ]) {
    const env = { ...process.env };
    delete env.NODE_PATH;
    const r = spawnSync(process.execPath, ['-e', child, BUILD, JSON.stringify(order)], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, `${order.join(' -> ')}\n${r.stdout}${r.stderr}`);
  }
});

test('the copied production runtime closure loads with no testing entry, fixture or Showdown files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-production-closure-'));
  const targetBuild = path.join(dir, 'build');
  const seen = new Set();
  function trace(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\brequire\("(\.[^"]+)"\)/g)) {
      const dependency = path.resolve(path.dirname(file), match[1]);
      const rel = path.relative(BUILD, dependency);
      assert.ok(rel && !rel.startsWith('..') && !path.isAbsolute(rel), `unexpected production dependency ${dependency}`);
      trace(dependency);
    }
  }
  try {
    trace(entries.production);
    for (const file of seen) {
      const rel = path.relative(BUILD, file);
      assert.ok(!['engine.cjs', 'testing.cjs', 'core.cjs', 'content-cli.cjs', 'custom-formats.cjs'].includes(rel));
      const dest = path.join(targetBuild, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(file, dest);
    }
    assert.equal(fs.existsSync(path.join(dir, 'fixtures')), false);
    assert.equal(fs.existsSync(path.join(dir, 'showdown')), false);
    const P = require(path.join(targetBuild, 'production.cjs'));
    assert.equal(P.digest.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    for (const name of testingNames) assert.equal(Object.hasOwn(P, name), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a checkpoint created through production with testing data restores through legacy', async () => {
  const { production: P, testing: T, legacy: L } = load();
  const F = T.fixtures;
  const session = await P.session.BattleSession.create({
    game: F.makeGame(), content: F.content, battleId: 'step1-entry-identity', seed: [1, 2, 3, 4],
    foe: { kind: 'trainer', team: [F.foeMember('foe0', 'Snorlax', 40, { moves: ['protect'] })] },
  });
  session.take();
  const token = session.gw.checkpoint();
  assert.ok(token instanceof P.gateway.GatewayCheckpoint);
  assert.ok(token instanceof L.gateway.GatewayCheckpoint);
  const restored = await L.gateway.BattleGateway.fromCheckpoint(token);
  assert.deepEqual(JSON.parse(restored.snapshot()), JSON.parse(session.gw.snapshot()));
});
