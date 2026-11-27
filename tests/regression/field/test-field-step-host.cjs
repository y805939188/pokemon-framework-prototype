'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { load, host } = require('../../support/field/field-host-support.cjs');
const stepRules = load('src/plugins/world/step-host.ts');
const modeRules = load('src/plugins/world/encounter-mode-host.ts');
const passives = load('src/framework/rules/field-passives.ts');
async function installed(run) {
  const h = host(), S = await stepRules, M = await modeRules;
  h.steps = [];
  h.stepHost = S.installFieldStepHost(h.root, {
    current: h.current,
    runCompletedStep(step, done) { h.steps.push(step); h.log.push('framework-prefix'); return run ? run(h, step, done) : done('continue'); },
    failed(step, error) { h.errors.push({ step, error }); },
  });
  M.installEncounterModeHost(h.root, {
    mode: () => ({ status: 'ready', mode: 'framework' }), takeCompletedStep: p => h.stepHost.takeEncounterStep(p),
    frameworkStep(step) { h.log.push('framework-encounter:' + step.id); return true; },
    nativeEncounter: h.nativeEncounter, legacyEncounter: h.legacyEncounter,
    diagnostic: reason => h.diagnostics.push(reason), failed: (step, error) => h.errors.push({ step, error }),
  });
  return h;
}

test('T01 actual installed MZ start/updateMove/nonmoving: prefix waits for completed interpolation and occurs once', async () => {
  const h = await installed();
  h.tick(6); assert.equal(h.steps.length, 0); assert.equal(h.player.isMoving(), true);
  h.tick(); assert.equal(h.steps.length, 1); assert.equal(h.player.isMoving(), false);
  for (let i = 0; i < 20; i++) { h.tick(); h.player.executeEncounter(); }
  assert.equal(h.steps.length, 1); assert.equal(h.log.filter(x => x.startsWith('framework-encounter:')).length, 1);
  assert.deepEqual(h.draws, []); assert.equal(h.errors.length, 0);
  assert.deepEqual([h.steps[0].x, h.steps[0].y, h.steps[0].regionId], [6, 5, 1]);
});

test('T01 one-update high-speed completion and consecutive same-frame updates use distinct completion identities', async () => {
  const h = await installed(); h.player.speed = 1;
  h.tick(6); h.tick(6);
  assert.equal(h.steps.length, 2); assert.notEqual(h.steps[0].id, h.steps[1].id);
  assert.deepEqual(h.steps.map(s => s.x), [6, 7]);
  assert.equal(h.log.filter(x => x.startsWith('framework-encounter:')).length, 2);
});

test('T02 turn/wall, direct increaseSteps without movement, and repeated stationary polls create no completed step', async () => {
  const h = await installed();
  h.player.setDirection(8); h.player.increaseSteps(); h.player.passable = false;
  for (let i = 0; i < 5; i++) h.tick(6);
  assert.equal(h.steps.length, 0); assert.equal(h.log.filter(x => x.startsWith('framework-encounter:')).length, 0);
  assert.deepEqual(h.draws, []); assert.deepEqual([h.player.x, h.player.y], [5, 5]);
});

test('T02 click-style sequential grid requests each complete once and successful encounter clears destination', async () => {
  const h = await installed(); h.temp.destination = true;
  h.complete(6); h.complete(2); h.complete(4);
  assert.deepEqual(h.steps.map(s => [s.x, s.y]), [[6, 5], [6, 6], [5, 6]]);
  assert.equal(h.temp.destination, false); assert.equal(h.steps.length, 3);
});

test('T03 arrival event receives the prefix first and blocks ordinary framework chance', async () => {
  const h = await installed(); h.map.startsEvent = true; h.complete();
  assert.deepEqual(h.log.filter(x => x !== 'native-start-step'), ['framework-prefix', 'native-walk', 'arrival', 'setup-event']);
  assert.equal(h.steps.length, 1); assert.equal(h.map.running, true); assert.deepEqual(h.draws, []);
});

test('T04 deferred renewal serializes arrival/interpreter, accepts one reply, and retains the pure prefix', async () => {
  const R = await passives; let reply, committed;
  const h = await installed((world, step, done) => {
    committed = R.planCompletedFieldStep({ steps: 3, world: { happinessSteps: 127, repelSteps: 1 }, party: [], ice: false, hasRepelItems: true, friendship: { AFFECTION_EFFECTS: false } }, () => assert.fail('empty party draws nothing'));
    world.log.push('renewal-choice'); reply = done;
  });
  h.map.startsEvent = true; h.complete();
  assert.equal(h.stepHost.pending(), true); assert.equal(h.player.canMove(), false); assert.equal(h.map.running, false);
  h.map.updateInterpreter(); new h.root.Game_Event().updateParallel(); new h.root.Game_CommonEvent().update();
  assert.equal(h.log.includes('interpreter'), false); assert.equal(h.log.includes('parallel'), false); assert.equal(h.log.includes('common'), false);
  for (let i = 0; i < 5; i++) h.tick();
  assert.equal(h.steps.length, 1); assert.equal(h.log.includes('arrival'), false);
  reply('continue'); reply('continue'); reply('handled');
  assert.equal(h.stepHost.pending(), false); assert.equal(h.map.running, true);
  assert.equal(h.log.filter(x => x === 'arrival').length, 1);
  assert.deepEqual([committed.steps, committed.world.happinessSteps, committed.world.repelSteps, committed.repelActiveAtStart], [4, 0, 0, true]);
  h.map.running = false; h.map.updateInterpreter(); assert.equal(h.log.at(-1), 'interpreter');
});

test('T03 handled poison/blackout skips arrival and encounter after an already completed prefix', async () => {
  const h = await installed((world, step, done) => { world.log.push('poison-blackout'); done('handled'); });
  h.complete(); assert.deepEqual(h.log, ['native-start-step', 'framework-prefix', 'poison-blackout']);
  assert.equal(h.stepHost.pending(), false); assert.deepEqual(h.draws, []);
});

test('T05 new generation/map entry/scene close cancels only this operation and ignores late replies', async () => {
  for (const action of ['generation', 'map', 'scene']) {
    let reply, stops = 0;
    const h = await installed((world, step, done) => { reply = done; return () => { stops++; }; });
    h.complete();
    if (action === 'generation') { h.stamp.generation++; h.stepHost.stateReplaced(); }
    if (action === 'map') { h.stamp.mapId = 6; h.map.id = 6; h.stepHost.mapEntered(); }
    if (action === 'scene') h.stepHost.cancel('scene-closed');
    reply('continue'); reply('handled');
    assert.equal(stops, 1); assert.equal(h.stepHost.pending(), false); assert.equal(h.log.includes('arrival'), false);
  }
});

test('T05 unexpected same-map relocation invalidates the deferred position snapshot', async () => {
  let reply, stops = 0;
  const h = await installed((world, step, done) => { reply = done; return () => { stops++; }; });
  h.complete(); h.player._x = h.player._realX = 9;
  reply('continue'); assert.equal(stops, 1); assert.equal(h.stepHost.pending(), false); assert.equal(h.log.includes('arrival'), false);
});

test('T05 run/host-event failure is surfaced once, releases own lock, and never retries the same prefix', async () => {
  const failedRun = await installed(() => { throw Error('prefix-host-failure'); }); failedRun.complete();
  for (let i = 0; i < 4; i++) failedRun.tick();
  assert.equal(failedRun.steps.length, 1); assert.equal(failedRun.errors.length, 1); assert.equal(failedRun.stepHost.pending(), false);
  const event = await installed(); event.player.checkEventTriggerHere = () => { throw Error('arrival-host-failure'); };
  event.complete(); assert.equal(event.steps.length, 1); assert.equal(event.errors.length, 1); assert.equal(event.stepHost.pending(), false);
  assert.equal(event.log.some(x => x.startsWith('framework-encounter:')), false);
});

test('T01 reentrant nonmoving callback cannot dispatch the same completion twice', async () => {
  const h = await installed();
  h.player.checkEventTriggerHere = () => { h.log.push('arrival'); h.player.updateNonmoving(true, true); };
  h.complete();
  assert.equal(h.steps.length, 1); assert.equal(h.log.filter(x => x === 'arrival').length, 1);
  assert.equal(h.log.filter(x => x.startsWith('framework-encounter:')).length, 1); assert.equal(h.errors.length, 0);
});

test('T05 unavailable route/event facts refuse a completed step instead of treating them as false', async () => {
  const h = await installed(); h.player.isMoveRouteForcing = () => undefined;
  h.complete(); assert.equal(h.steps.length, 0); assert.equal(h.errors.length, 1); assert.equal(h.stepHost.pending(), false);
});

test('T01 forced-route/event completion retains native continuation without counting ordinary framework steps', async () => {
  const forced = await installed(); forced.player._forcing = true; forced.complete();
  assert.equal(forced.steps.length, 0); assert.equal(forced.log.some(x => x.startsWith('framework-encounter:')), false);
  const event = await installed(); event.tick(6); event.map.running = true; event.tick();
  assert.equal(event.steps.length, 0); assert.deepEqual(event.draws, []);
});

test('T05 entry/replacement before interpolation completes discards unfinished identity without adding a step', async () => {
  const h = await installed(); h.tick(6); h.stepHost.mapEntered(); h.tick();
  assert.equal(h.steps.length, 0); assert.deepEqual(h.draws, []);
});

test('installer does not replace transfer, map start or lifecycle production; failed surface validation is non-mutating', async () => {
  const S = await stepRules, h = host();
  const before = h.root.Game_Player.prototype.increaseSteps;
  h.root.Game_Player.prototype.updateNonmoving = undefined;
  assert.throws(() => S.installFieldStepHost(h.root, { current: h.current, runCompletedStep() {}, failed() {} }), /surface|method-unavailable/);
  assert.equal(h.root.Game_Player.prototype.increaseSteps, before);
  assert.equal(h.root.Game_Player.prototype.performTransfer, undefined);
});
