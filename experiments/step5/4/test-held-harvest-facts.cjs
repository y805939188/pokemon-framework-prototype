'use strict';
// Detached transition validation only: these values grant no application producer authority.
const test = require('node:test'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url'), { resolve } = require('node:path');
require('../../../scripts/tests/ts-source-loader.cjs');
const loaded = import(pathToFileURL(resolve(__dirname, '../../../src/framework/rules/held-facts.ts')));
const clone = value => JSON.parse(JSON.stringify(value));
const binding = { battleId: 'Harvest-validation', generation: 1, rawHash: 'a'.repeat(64), contentIdentity: 'b'.repeat(64) };
const roster = [{ id: 'H1', side: 'p1', initial: 'lumberry' }];
const values = (current, recovery, recycle = '') => ({ current, recovery, recycle });
function start(initial = 'lumberry') {
  return { version: 1, binding: clone(binding), coverage: 'complete', members: [{ id: 'H1', side: 'p1', initial, ...values(initial, initial) }], events: [],
    money: { amuletCoin: false, happyHour: false, payDay: 0 } };
}
function event(facts, reason, after) {
  const m = facts.members[0];
  facts.events.push({ ordinal: facts.events.length + 1, id: m.id, side: m.side, sourceId: null, reason,
    before: values(m.current, m.recovery, m.recycle), after });
  Object.assign(m, after); return facts;
}

test('Harvest fills empty recovery in trainer and wild battles; Recycle retains its separate wild qualification', async () => {
  const H = await loaded;
  for (const wild of [false, true]) {
    const harvested = event(event(start(), 'consume', values('', '', 'lumberry')), 'harvest', values('lumberry', 'lumberry'));
    const recycled = event(event(start(), 'consume', values('', '', 'lumberry')), 'recycle', values('lumberry', wild ? 'lumberry' : ''));
    const expected = { binding, roster, wild };
    const a = H.resolveRequiredFacts(harvested, expected), b = H.resolveRequiredFacts(recycled, expected);
    assert(a.ok, JSON.stringify(a)); assert(b.ok, JSON.stringify(b));
    assert.notEqual(a.pairHash, b.pairHash, 'restoration reason remains in paired identity even with equal final values');
    const missingRecovery = clone(harvested); missingRecovery.events[1].after.recovery = ''; missingRecovery.members[0].recovery = '';
    assert.equal(H.resolveRequiredFacts(missingRecovery, expected).ok, false);
    if (!wild) {
      const wronglyPermanentRecycle = clone(recycled); wronglyPermanentRecycle.events[1].after.recovery = 'lumberry'; wronglyPermanentRecycle.members[0].recovery = 'lumberry';
      assert.equal(H.resolveRequiredFacts(wronglyPermanentRecycle, expected).ok, false);
    }
  }
});

test('Harvest preserves a different nonempty recovery item; final current item cannot replace it', async () => {
  const H = await loaded, original = 'leftovers';
  for (const wild of [false, true]) {
    const f = start(original);
    event(f, 'temporary-remove', values('', original));
    event(f, 'temporary-receive', values('lumberry', original));
    event(f, 'consume', values('', original, 'lumberry'));
    event(f, 'harvest', values('lumberry', original));
    const expected = { binding, roster: [{ id: 'H1', side: 'p1', initial: original }], wild };
    const result = H.resolveRequiredFacts(f, expected); assert(result.ok, JSON.stringify(result));
    const before = { party: [{ id: 'H1', item: original }], storage: { boxes: [{ slots: [null] }] } };
    const primary = clone(before), planned = H.planHeldWriteback({ before, primary, facts: result.facts, capturedOrigins: {} });
    assert.equal(planned.state.party[0].item, original);
    assert.deepEqual(before, primary);
    for (const wrong of ['', 'lumberry']) {
      const bad = clone(f); bad.events[3].after.recovery = wrong; bad.members[0].recovery = wrong;
      assert.equal(H.resolveRequiredFacts(bad, expected).ok, false, 'existing I cannot be cleared or overwritten');
    }
  }
});

test('consuming a harvested berry clears its matching recovery again; broken restoration chains still reject', async () => {
  const H = await loaded;
  const f = event(event(event(start(), 'consume', values('', '', 'lumberry')), 'harvest', values('lumberry', 'lumberry')), 'consume', values('', '', 'lumberry'));
  const expected = { binding, roster, wild: false }, before = clone(f);
  assert.equal(H.resolveRequiredFacts(f, expected).ok, true); assert.deepEqual(f, before);
  for (const mutate of [
    bad => { bad.events[1].before.recycle = ''; },
    bad => { bad.events[1].after.current = 'sitrusberry'; },
    bad => { bad.events[1].after.recycle = 'lumberry'; },
    bad => { bad.events[1].reason = 'unknown-harvest'; },
    bad => { bad.events[2].after.recovery = 'lumberry'; bad.members[0].recovery = 'lumberry'; },
  ]) {
    const bad = clone(f); mutate(bad);
    assert.equal(H.resolveRequiredFacts(bad, expected).ok, false);
  }
});
