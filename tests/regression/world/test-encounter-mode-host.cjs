'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { load, host } = require('../../../experiments/step5/5/field-host-support.cjs');
const modules = load('src/plugins/world/encounter-mode-host.ts');
async function installed(mode = 'framework') {
  const h = host(), M = await modules; h.mode = mode; h.ticket = null;
  M.installEncounterModeHost(h.root, {
    mode: () => typeof h.mode === 'string' ? { status: 'ready', mode: h.mode } : h.mode,
    takeCompletedStep() { const ticket = h.ticket; h.ticket = null; return ticket; },
    frameworkStep(step) { h.log.push('framework-step:' + step.id); if (h.failFramework) throw Error('framework-opening-failure'); return h.openFramework === true; },
    nativeEncounter: h.nativeEncounter, legacyEncounter: h.legacyEncounter,
    diagnostic: reason => h.diagnostics.push(reason), failed: (step, error) => h.errors.push({ step, error }),
  }); return h;
}
const probes = {
  locate: h => h.player.locate(7, 8),
  'native executeEncounter': h => h.player.executeEncounter(),
  disembark: h => h.player.getOffVehicle(),
  'command 136': h => new h.root.Game_Interpreter().command136([0]),
  'command 301': h => new h.root.Game_Interpreter().command301([0, 1, true, false]),
  // The retained framework legacy and prebattle callbacks both invoke the dynamic method. Full plugin wiring is later.
  'framework legacy call': h => h.player.makeEncounterCount(),
  'framework prebattle call': h => h.player.makeEncounterCount(),
};
for (const mode of ['framework', 'legacy-note', 'mz-native', 'none']) test('T19 all 7 dynamic count call probes in ' + mode, async () => {
  for (const [entry, invoke] of Object.entries(probes)) {
    const h = await installed(mode); h.player._encounterCount = 0; invoke(h);
    assert.deepEqual(h.draws, mode === 'legacy-note' || mode === 'mz-native' ? [10, 10] : [], entry);
    assert.equal(h.player._encounterCount, mode === 'legacy-note' || mode === 'mz-native' ? 1 : 0, entry);
  }
});

test('T06 executeEncounter selects one explicit native/legacy branch; framework/none never open a native troop', async () => {
  for (const mode of ['framework', 'legacy-note', 'mz-native', 'none']) {
    const h = await installed(mode); const result = h.player.executeEncounter();
    assert.equal(result, mode === 'mz-native');
    assert.equal(h.log.includes('native-battle'), mode === 'mz-native');
    assert.equal(h.log.includes('legacy-encounter'), mode === 'legacy-note');
    assert.deepEqual(h.draws, mode === 'legacy-note' || mode === 'mz-native' ? [10, 10] : []);
  }
});

test('T06 framework chance consumes only one completed ticket; per-frame execute polls and direct count updates draw nothing', async () => {
  const h = await installed();
  for (let i = 0; i < 50; i++) { h.player.executeEncounter(); h.player.updateEncounterCount(); }
  assert.deepEqual(h.log, []); assert.deepEqual(h.draws, []);
  h.ticket = { id: 'completed-1' }; h.player.updateEncounterCount(); h.player.updateEncounterCount();
  for (let i = 0; i < 50; i++) h.player.executeEncounter();
  assert.deepEqual(h.log, ['framework-step:completed-1']); assert.deepEqual(h.draws, []);
});

test('T07 actual command136 toggles author switch and returns true with no framework native RNG', async () => {
  const h = await installed(), interpreter = new h.root.Game_Interpreter();
  assert.equal(interpreter.command136([0]), true); assert.equal(h.system.enabled, false);
  h.ticket = { id: 'disabled-step' }; h.player.updateEncounterCount(); assert.equal(h.ticket, null); assert.deepEqual(h.log, []);
  assert.equal(interpreter.command136([1]), true); assert.equal(h.system.enabled, true);
  h.ticket = { id: 'enabled-step' }; h.player.updateEncounterCount(); assert.deepEqual(h.log, ['framework-step:enabled-step']);
  assert.deepEqual(h.draws, []);
});

test('T07 explicit actual MZ event301 remains permitted while random encounters are disabled', async () => {
  for (const mode of ['framework', 'none', 'legacy-note', 'mz-native']) {
    const h = await installed(mode), interpreter = new h.root.Game_Interpreter();
    interpreter.command136([0]); h.clearLog();
    assert.equal(interpreter.command301([0, 1, true, false]), true);
    assert.equal(h.log.includes('native-battle'), true); assert.equal(h.log.includes('native-scene'), true);
    assert.equal(h.system.enabled, false); assert.equal(h.log.includes('framework-step'), false);
  }
});

test('T06 mode changes preserve legacy/native countdown semantics and suppress both random paths in none', async () => {
  const h = await installed('mz-native'); h.player.makeEncounterCount(); h.player._encounterCount = 7;
  h.player.updateEncounterCount(); assert.equal(h.player._encounterCount, 6);
  h.mode = 'legacy-note'; h.player.updateEncounterCount(); assert.equal(h.player._encounterCount, 5);
  h.mode = 'framework'; h.clearLog(); h.player.makeEncounterCount(); h.player.updateEncounterCount(); assert.equal(h.player._encounterCount, 0);
  h.mode = 'none'; h.ticket = { id: 'must-not-trigger' }; h.player.updateEncounterCount(); h.player.executeEncounter();
  assert.deepEqual(h.draws, []); assert.deepEqual(h.log, []);
});

test('T06 unavailable content and conflicts are diagnosed once and never fall back; recovery uses a new ordinary ticket', async () => {
  const h = await installed({ status: 'unavailable', reason: 'formal-content-unavailable' });
  for (let i = 0; i < 20; i++) { h.player.makeEncounterCount(); h.player.updateEncounterCount(); assert.equal(h.player.executeEncounter(), false); }
  assert.deepEqual(h.diagnostics, ['formal-content-unavailable']); assert.deepEqual(h.log, []); assert.deepEqual(h.draws, []);
  h.mode = { status: 'unavailable', reason: 'formal-table-note-conflict' }; h.player.executeEncounter();
  assert.deepEqual(h.diagnostics, ['formal-content-unavailable', 'formal-table-note-conflict']);
  h.mode = 'framework'; h.ticket = { id: 'recovered' }; h.player.updateEncounterCount();
  assert.deepEqual(h.log, ['framework-step:recovered']);
});

test('T05 framework opening failure consumes the completed ticket without a second generation or native fallback', async () => {
  const h = await installed(); h.failFramework = true; h.ticket = { id: 'failure' };
  h.player.updateEncounterCount(); h.player.updateEncounterCount(); h.player.executeEncounter();
  assert.deepEqual(h.log, ['framework-step:failure']); assert.equal(h.errors.length, 1); assert.deepEqual(h.draws, []);
});

test('T02 only an accepted framework battle clears an existing click destination', async () => {
  const h = await installed(); h.temp.destination = true;
  h.ticket = { id: 'probability-miss' }; h.player.updateEncounterCount(); assert.equal(h.temp.destination, true);
  h.openFramework = true; h.ticket = { id: 'accepted' }; h.player.updateEncounterCount(); assert.equal(h.temp.destination, false);
  assert.equal(h.log.filter(x => x === 'clear-destination').length, 1);
});

test('T19 unsuccessful native disembark/troop branches do not acquire a count call', async () => {
  const h = await installed('mz-native'); h.player.vehicle = () => ({ isLandOk: () => false });
  assert.equal(h.player.getOffVehicle(), false); assert.deepEqual(h.draws, []);
  new h.root.Game_Interpreter().command301([0, 0, false, false]); assert.deepEqual(h.draws, []);
});
