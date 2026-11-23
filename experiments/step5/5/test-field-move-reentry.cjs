'use strict';
require('./regular-field-action-test-runtime.cjs').prepare('leaf');
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, clone } = require('./field-move-app-fixtures.cjs');
const request = { kind: 'request-encounter', source: 'rock-smash', type: 'RockSmash', trigger: 'rock-smash', allowance: 'skip', onBattleStartedStat: 'rock_smash_battles' };
function reentrant(moveId, phase, options = {}) {
  let h, frame = null, refusals = 0, sequential = 0, expand = 0, originalCalls = 0, first = true;
  const refusedStages = [], after = options.after;
  const inject = () => {
    if (!frame || frame.injected) return;
    frame.injected = true; const reads = h.providerCalls;
    try { h.lastHostOperation.applyStage(frame.stage, frame.observation); assert.fail('recursive stage accepted'); }
    catch (error) {
      assert.equal(error.message, 'field-move-stage-outside-execution'); refusals++; refusedStages.push(clone(frame.stage));
      assert.equal(h.providerCalls, reads, 'recursive stage must reject before another provider');
      if (options.uncaught) throw error;
    }
    if (after && first) { first = false; after(h); }
  };
  h = fixture({ moveId,
    onHost(name, args) {
      const op = args.at(-1), apply = op.applyStage;
      op.applyStage = (stage, observation) => {
        const outer = frame; frame = { stage, observation, observations: 0, injected: false };
        try {
          originalCalls++;
          const ack = apply(stage, observation);
          if (phase === 'sequential' && outer === null) {
            const reads = h.providerCalls;
            assert.throws(() => apply(stage, observation), /field-move-unissued-stage/); assert.equal(h.providerCalls, reads); sequential++;
          }
          return ack;
        } finally { frame = outer; }
      };
    },
    onObserve() {
      if (frame) { frame.observations++; if (phase === 'observe-' + frame.observations) inject(); }
    },
    onInstall() { if (phase === 'install') inject(); },
    onProvider(name) { if (phase === 'encounters' && name === 'encounters') inject(); },
    onRandom() { if (phase === 'random') inject(); },
    onExpand() { expand++; },
  });
  let erases = 0, jumps = 0;
  const erase = h.event.erase; h.event.erase = function() { erases++; return erase.call(this); };
  const jump = h.player.jump; h.player.jump = function(...args) { jumps++; return jump.apply(this, args); };
  return { h, get refusals() { return refusals; }, get sequential() { return sequential; }, get expand() { return expand; }, get erases() { return erases; }, get jumps() { return jumps; }, get originalCalls() { return originalCalls; }, refusedStages };
}
function assertHealthy(f, moveId, result) {
  const h = f.h; assert.equal(result.status, 'completed', JSON.stringify(result)); assert.equal(h.guardProviderCalls, 0); assert.equal(h.state.game.steps, 0);
  assert.equal(h.trace.filter(e => e[0] === 'animate').length, 1);
  if (moveId === 'cut' || moveId === 'rocksmash') {
    assert.equal(f.erases, 1); assert.equal(h.state.records.length, 1); assert.equal(h.state.records[0].kind, 'erased-event');
    assert.equal(h.state.game.stats[moveId === 'cut' ? 'cut_count' : 'rock_smash_count'], 1);
    assert.equal(h.trace.filter(e => e[0] === 'sound').length, 1); assert.equal(h.writes.length, 2);
  }
  if (moveId === 'rocksmash') { assert.deepEqual(h.draws, [100]); assert.equal(result.encounter.type, 'RockSmash'); assert.equal(h.state.game.stats.rock_smash_battles, 0); }
  else assert.deepEqual(h.draws, []);
  if (moveId === 'surf') {
    assert.equal(h.state.game.world.surfing, true); assert.equal(h.state.game.stats.surf_count, 1); assert.equal(f.jumps, 1); assert.equal(h.player.x, 4);
    assert.equal(h.trace.filter(e => e[0] === 'cancel-vehicles').length, 1); assert.equal(h.trace.filter(e => e[0] === 'project').length, 1);
    assert.deepEqual(h.state.surf, { surfBase: { mapId: 7, x: 4, y: 3 }, endingSurf: false }); assert.equal(h.writes.length, 4);
    assert.equal(h.state.encounterRuntime.graceSteps, 0); assert.equal(h.state.encounterRuntime.accumulator, 0);
  }
  if (moveId === 'flash') { assert.equal(h.state.game.world.flashUsed, true); assert.equal(h.state.game.stats.flash_count, 1); assert.equal(f.expand, 1); assert.equal(h.writes.length, 1); }
}
for (const moveId of ['cut', 'rocksmash', 'surf', 'flash']) {
  for (const phase of ['observe-1', 'observe-2', 'observe-3', 'install', 'sequential']) test('R1 real host ' + moveId + ' catches duplicate at ' + phase + ' and completes every effect exactly once', async () => {
    const f = reentrant(moveId, phase), result = await f.h.operation.run(); assertHealthy(f, moveId, result);
    const stages = moveId === 'rocksmash' ? 3 : moveId === 'cut' ? 2 : moveId === 'surf' ? 4 : 1;
    assert.equal(phase === 'sequential' ? f.sequential : f.refusals, phase === 'install' && moveId === 'rocksmash' ? 2 : stages);
    assert.equal(f.h.operation.run(), f.h.operation.run());
    assert.throws(() => f.h.lastHostOperation.applyStage(f.refusedStages[0] || { kind: 'commit', world: { surfing: false } }), /field-move-finished/);
  });
}
for (const phase of ['encounters', 'random']) test('R1 R11 whole request reservation rejects reentry in ' + phase + ' without another draw or cursor advance', async () => {
  const f = reentrant('rocksmash', phase), result = await f.h.operation.run(); assertHealthy(f, 'rocksmash', result); assert.equal(f.refusals, 1);
});
for (const phase of ['observe-1', 'observe-2', 'install']) test('R1 uncaught recursive refusal at ' + phase + ' fails before first counter and native erase', async () => {
  const f = reentrant('cut', phase, { uncaught: true }), result = await f.h.operation.run();
  assert.equal(result.status, 'failed'); assert.equal(result.reason, 'field-move-stage-outside-execution'); assert.equal(f.h.state.game.stats.cut_count, 0);
  assert.equal(f.h.writes.length, 0); assert.equal(f.erases, 0); assert.equal(f.h.state.records.length, 0); assert.equal(f.refusals, 1);
});
test('R1 uncaught post-install recursive refusal retains the once counter and never erases or advances a second stage', async () => {
  const f = reentrant('cut', 'observe-3', { uncaught: true }), result = await f.h.operation.run();
  assert.equal(result.status, 'failed'); assert.equal(result.committedUpdates, 1); assert.equal(f.h.state.game.stats.cut_count, 1); assert.equal(f.h.writes.length, 1); assert.equal(f.erases, 0);
});
for (const phase of ['encounters', 'random']) test('R1 uncaught request refusal in ' + phase + ' keeps prior count/erasure/record with the original RNG prefix', async () => {
  const f = reentrant('rocksmash', phase, { uncaught: true }), result = await f.h.operation.run();
  assert.equal(result.status, 'failed'); assert.equal(result.encounter, undefined); assert.equal(f.h.state.game.stats.rock_smash_count, 1); assert.equal(f.erases, 1); assert.equal(f.h.state.records.length, 1);
  assert.deepEqual(f.h.draws, phase === 'random' ? [100] : []); assert.equal(result.committedUpdates, 2);
});
for (const [change, after] of [
  ['cancel', h => h.operation.cancel()], ['owner', h => h.replaceOwner()], ['generation', h => h.replaceGeneration()], ['content', h => h.replaceContent()], ['throw', () => { throw Error('observer-throws'); }],
]) test('R1 caught reentry followed by ' + change + ' during post-install observation retains one committed prefix', async () => {
  const f = reentrant('cut', 'observe-3', { after }), result = await f.h.operation.run();
  assert.equal(result.status, change === 'cancel' ? 'cancelled' : 'failed'); assert.equal(result.committedUpdates, 1); assert.equal(f.h.writes.length, 1);
  assert.equal(f.h.state.game.stats.cut_count, 1); assert.equal(f.erases, 0); assert.equal(f.h.guardProviderCalls, 0); assert.deepEqual(f.h.draws, []);
});
test('R1 observer outside apply cannot steal an issued counter before native animation', async () => {
  let h, injected = false;
  h = fixture({ onObserve() {
    if (!h?.lastHostOperation || injected) return; injected = true; const reads = h.providerCalls;
    assert.throws(() => h.lastHostOperation.applyStage({ kind: 'commit', stats: [{ counter: 'cut_count', delta: 1 }] }), /field-move-stage-outside-execution/);
    assert.equal(h.providerCalls, reads);
  } });
  const result = await h.operation.run(); assert.equal(result.status, 'completed'); assert(injected); assert.equal(h.state.game.stats.cut_count, 1); assert.equal(h.state.records.length, 1); assert.equal(h.trace.filter(t => t[0] === 'animate').length, 1);
});
test('R1 recursive observation is rejected without another provider call or any forged stage completion', async () => {
  let h, injected = false;
  h = fixture({ onObserve() {
    if (!h?.lastHostOperation || injected) return; injected = true; const reads = h.providerCalls;
    assert.throws(() => h.lastHostOperation.assertCurrent(), /field-move-reentrant-observation/); assert.equal(h.providerCalls, reads);
  } });
  const result = await h.operation.run(); assert.equal(result.status, 'completed'); assert(injected); assert.equal(h.state.game.stats.cut_count, 1); assert.equal(h.state.records.length, 1);
});
