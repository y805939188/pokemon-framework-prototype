'use strict';
// Step 4 / A, application use cases over in-memory ports: a formal new game (no fixture), one-time grants and the
// party heal. Each is all-or-nothing: a refusal or a failing store leaves the installed state as it was.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../../js/engine/build/engine.cjs');
const { GameApplication } = E.app;
const K = E.fakes;

const SRC = path.resolve(__dirname, '../../content/sample');
const read = f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const content = E.contentRuntime.assembleContent(E.contentCompile.compileContent({ manifest: read('manifest.json'), sources: read('sources.json'), species: read('species.json'), overlays: read('overlays.json'), grants: read('grants.json') }).data, E.dex.createDexLookup()).content;
function lcg(seed) { let s = seed >>> 0; return n => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return Math.floor((s / 4294967296) * n); }; }
const snap = state => JSON.stringify(state.current());
function setup(initial = E.state.newGame({ party: [] }), options) {
  const state = K.createMemoryState(initial);
  const app = new GameApplication({ state, sessions: K.createFakeSessions(() => { throw new Error('no battle in this test'); }), projection: K.createRecordingProjection(), content: () => ({ content }), random: lcg(11) }, options);
  return { state, app };
}

test('a new game installs the formal empty state: schema 3, no members, no fixture, the configured start money', () => {
  const fixture = E.fixtures.makeGame();
  const { state, app } = setup(fixture, { startMoney: 3000 });
  const r = app.startNewGame();
  assert.equal(r.status, 'started');
  const g = state.current();
  assert.deepEqual([g.schema, g.party, g.boxes, g.bag, g.money, g.claims, g.appliedBattles, g.dex], [3, [], [], {}, 3000, {}, {}, { seen: [], owned: [] }]);
  assert.ok(!JSON.stringify(g).includes('A-000'), 'no fixture member survives');
  assert.equal(setup(undefined, {}).app.startNewGame() && 1, 1);
  const dflt = setup(); dflt.app.startNewGame(); assert.equal(dflt.state.current().money, 3000, 'StartMoney defaults to 3000 (WP24)');
});

test('claim: applied once, the repeat is reported and changes nothing, the store is written once', () => {
  const { state, app } = setup();
  const first = app.claimGrant('starter');
  assert.deepEqual([first.status, first.grantId, first.placed.map(p => [p.id, p.to])], ['applied', 'starter', [['G-starter-1', 'party']]]);
  assert.deepEqual(first.items, { potion: 5, pokeball: 10, antidote: 2 });
  const after = snap(state);
  const again = app.claimGrant('starter');
  assert.deepEqual([again.status, again.placed], ['already-claimed', undefined]);
  assert.equal(snap(state), after); assert.equal(state.replaced.length, 1);
});

test('claim refusals commit nothing and say why: unknown grant, no room, bag cap, unusable save, no random source', () => {
  const unknown = setup(); const u = unknown.app.claimGrant('nope');
  assert.deepEqual([u.status, u.reason], ['refused', 'unknown-grant']); assert.equal(unknown.state.replaced.length, 0);
  const g = E.state.newGame({ party: [] }); g.bag.potion = 995;
  const capped = setup(g); const c = capped.app.claimGrant('starter');
  assert.deepEqual([c.status, c.reason], ['refused', 'bag-full']); assert.match(c.error, /potion would be 1000/);
  assert.equal(capped.state.replaced.length, 0); assert.equal(capped.state.current().claims.starter, undefined, 'no claim written');
  const full = setup(undefined, { limits: { party: 0, boxes: 0, bagPerItem: 999, money: 999999 } }); const f = full.app.claimGrant('starter');
  assert.deepEqual([f.status, f.reason], ['refused', 'no-room']);
  const broken = setup(); broken.state.failRead = new Error('the save state is not usable (corrupt)');
  const b = broken.app.claimGrant('starter'); assert.deepEqual([b.status, b.reason], ['refused', 'state-unusable']); assert.match(b.error, /corrupt/);
  const state = K.createMemoryState(E.state.newGame({ party: [] }));
  const noRandom = new GameApplication({ state, sessions: K.createFakeSessions(() => { throw new Error('x'); }), projection: K.createRecordingProjection(), content: () => ({ content }) });
  const n = noRandom.claimGrant('starter'); assert.deepEqual([n.status, n.reason], ['refused', 'no-random']); assert.equal(state.replaced.length, 0);
});

test('claim with a failing store: nothing is installed, and a retry applies exactly once', () => {
  const { state, app } = setup();
  state.failReplace = new Error('store refused');
  const r = app.claimGrant('starter');
  assert.deepEqual([r.status, r.reason, r.error], ['refused', 'commit-failed', 'store refused']);
  assert.deepEqual(state.current().claims, {}); assert.equal(state.current().party.length, 0);
  state.failReplace = null;
  assert.equal(app.claimGrant('starter').status, 'applied'); assert.equal(app.claimGrant('starter').status, 'already-claimed');
  assert.equal(state.replaced.length, 1); assert.equal(state.current().party.length, 1);
});

test('heal: the party is restored once; healing again is safe and writes nothing', () => {
  const { state, app } = setup();
  app.claimGrant('starter');
  const hurt = JSON.parse(snap(state)); hurt.party[0].hp = 3; hurt.party[0].status = 'psn'; hurt.party[0].moves[0].pp = 0;
  state.replace(hurt); const writes = state.replaced.length;
  const h = app.healParty();
  assert.equal(h.status, 'healed'); assert.equal(state.replaced.length, writes + 1);
  const m = state.current().party[0]; assert.deepEqual([m.status, m.moves[0].pp], ['', m.moves[0].maxpp]); assert.ok(m.hp > 3);
  const again = app.healParty();
  assert.equal(again.status, 'unchanged'); assert.equal(state.replaced.length, writes + 1);
  state.failRead = new Error('the save state is not usable (unknown-version)');
  assert.deepEqual([app.healParty().status, app.healParty().reason], ['refused', 'state-unusable']);
});
