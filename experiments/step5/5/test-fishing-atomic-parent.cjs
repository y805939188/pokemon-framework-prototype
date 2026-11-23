'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, clone } = require('./fishing-app-fixtures.cjs');
async function finish(h, write) {
  const { promise } = await h.start();
  if (write === 2) { h.window(); h.input(1, { confirm: true }); h.finish(); }
  else if (h.pending) { h.operation.cancel(); h.finish(); }
  return promise;
}
for (const write of [1, 2]) for (const change of ['owner', 'generation', 'content', 'state', 'cancel']) {
  test('atomic parent supplies actual ' + change + ' after all callbacks at stat ' + write, async () => {
    let armed = false, changed = false, h;
    h = fixture({ onInstall(number) { armed = number === write; }, beforeObservation(context) {
      if (!armed || changed) return; changed = true;
      if (change === 'owner') h.replaceOwner();
      else if (change === 'generation') h.replaceGeneration();
      else if (change === 'content') h.actual({ ...h.content, settings: { FISHING_AUTO_HOOK: true } });
      else if (change === 'state') h.external(game => { game.money = 987; });
      else context.operation.cancel();
    } });
    const outcome = await finish(h, write);
    assert(changed); assert.equal(outcome.status, change === 'cancel' ? 'cancelled' : 'failed');
    assert.equal(outcome.encounter, undefined); assert.equal(h.installs.length, write - 1);
    assert.deepEqual(outcome.prefix, { countCommitted: write === 2, battlesCommitted: false });
    assert.equal(h.state.stats.fishing_count, write - 1); assert.equal(h.state.stats.fishing_battles, 0);
    if (change === 'state') assert.equal(h.state.money, 987);
    assert(h.guardProviderCalls.length > 0); assert(h.guardProviderCalls.every(count => count === 0));
  });
}
test('same-semantic atomic replacements preserve state and the parent receives only two stat deltas', async () => {
  let h, replacements = 0;
  h = fixture({ cloneReads: true, cloneContentReads: true, beforeObservation(context) {
    if (context.installing) { h.external(() => {}); h.actual(clone(h.content)); replacements++; }
  } });
  h.external(game => { game.money = 246; game.world.visitedMaps = [3, 7]; game.stats.fishing_count = 12; game.stats.fishing_battles = 8; });
  const outcome = await finish(h, 2);
  assert.equal(outcome.status, 'completed'); assert.equal(outcome.encounter.type, 'OldRod'); assert.equal(replacements, 2);
  assert.deepEqual(h.statRequests, ['fishing_count', 'fishing_battles']); assert.deepEqual(h.guardProviderCalls, [0, 0]);
  assert.equal(h.state.money, 246); assert.deepEqual(h.state.world.visitedMaps, [3, 7]);
  assert.equal(h.state.stats.fishing_count, 13); assert.equal(h.state.stats.fishing_battles, 9);
});
test('a post-publication invalidation preserves the committed prefix and cannot issue an encounter', async () => {
  let h, changed = false;
  h = fixture({ beforeObservation(context) {
    if (!context.installing && !changed && context.state.stats.fishing_battles === 1) { changed = true; h.replaceGeneration(); }
  } });
  const outcome = await finish(h, 2);
  assert(changed); assert.equal(outcome.status, 'failed'); assert.equal(outcome.encounter, undefined);
  assert.deepEqual(outcome.prefix, { countCommitted: true, battlesCommitted: true }); assert.equal(h.installs.length, 2);
});
