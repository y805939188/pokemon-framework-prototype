'use strict';
// Ordinary-object input controls only. No fixture, App, native code or producer runs.
const test = require('node:test'), assert = require('node:assert/strict');
const {spec, isConsumer, assertFamilyReceipt, inheritedInputs} = require('./final-production-runner.cjs');
const inputs = require('./final-production-inputs.json');
test('F current selectors have explicit entry files and single-leaf counts', () => {
  const expected = {
    'f-native-current': ['NORMAL-CENTER','NORMAL-HOME','NT-NOHOME','NT-MISSING','NT-DTO','C1-NO','C1-YES','N11-OLD','C1-ABA','C1-LATE-YES'],
    'f-load-current': ['P00','L01','L02','L03','L04']
  };
  for (const [family, ids] of Object.entries(expected)) {
    assert.deepEqual(inputs.families[family].cases, ids);
    for (const selector of ids) {
      const selected = spec(family, selector);
      assert(inputs.controlledInputs.includes(selected.record.entries[selector]));
      assert.equal(selected.record.testCounts?.[selector] ?? 1, 1);
    }
  }
});
test('F physical consumers require their P00 prefix; CPnull and other families stay distinct', () => {
  for (const id of ['L01','L02','L03','L04']) assert.equal(isConsumer('f-load-current', id), true);
  assert.equal(isConsumer('f-load-current', 'P00'), false);
  for (const id of ['NORMAL-CENTER','C1-NO','C1-YES','N11-OLD']) assert.equal(isConsumer('f-native-current', id), false);
  assert.equal(isConsumer('e3-companion-empty-formal', 'E03'), true);
  assert.equal(isConsumer('defeat', 'C01'), true);
  assert.equal(isConsumer('defeat', 'C02'), true);
  assert.throws(() => spec('f-load-current', 'C01'), /unknown production selector/);
  assert.throws(() => spec('f-load-current', 'file8'), /unknown production selector/);
});
const receipt = () => ({family: 'f-load-current', producerSelector: 'P00',
  consumerEnv: {PF_COLD_PRODUCER_INPUT: '/owned/P00/P00-input.json'},
  saveFiles: [{name: 'file8.rmmzsave', path: '/owned/P00/save/file8.rmmzsave'}, {name: 'global.rmmzsave', path: '/owned/P00/save/global.rmmzsave'}],
  files: [{path: '/owned/P00/P00-input.json'}, {path: '/owned/P00/save/file8.rmmzsave'}, {path: '/owned/P00/save/global.rmmzsave'}]});
test('F receipt admits the pending family and rejects foreign or substituted producer contracts', () => {
  const selected = {family: 'f-load-current'};
  assertFamilyReceipt(receipt(), selected);
  for (const mutate of [
    r => { r.family = 'defeat'; }, r => { r.producerSelector = 'P01'; },
    r => { r.consumerEnv.PF_CHAIN_PRODUCER = '/old/completed.json'; },
    r => { r.consumerEnv.PF_COLD_PRODUCER_INPUT = '/owned/P00/completed.json'; },
    r => { r.saveFiles[0].name = 'file0.rmmzsave'; },
    r => { r.files.pop(); }, r => { r.files[0].path = '/old/P00-input.json'; }
  ]) { const raw = receipt(); mutate(raw); assert.throws(() => assertFamilyReceipt(raw, selected)); }
});
test('F case and old historical producer inputs cannot be inherited by a new run', () => {
  inheritedInputs({});
  for (const key of ['PF_F_NATIVE_CASE','PF_F_NATIVE_ROOT','PF_F_LOAD_CASE','PF_F_LOAD_CASE_ROOT','PF_F_LOAD_PRIOR','PF_C1_AUTHOR_OUTPUT','PF_N11_SOURCE_FIXED','PF_COLD_PRODUCER_INPUT'])
    assert.throws(() => inheritedInputs({[key]: '/old/input'}), /stale case input refused/);
});
