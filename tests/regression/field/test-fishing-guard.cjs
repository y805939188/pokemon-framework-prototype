'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, clone } = require('../../support/field/fishing-app-fixtures.cjs');
async function drive(h, write) {
  const { promise } = await h.start();
  if (write === 2) { h.window(); h.input(1, { confirm: true }); h.finish(); }
  else if (h.pending) { h.operation.cancel(); h.finish(); }
  return promise;
}
for (const write of [1, 2]) for (const callback of [1, 2, 3]) test('A1 stat' + write + ' parent callback' + callback + ' cancellation rejects publication', async () => {
  let armed = false, checks = 0, cancelled = false;
  const h = fixture({ onInstall(number) { if (number === write) armed = true; }, onAssert(context) {
    if (armed && ++checks === callback && !cancelled) { cancelled = true; context.operation.cancel(); }
  } });
  const outcome = await drive(h, write); assert(cancelled); assert.equal(outcome.status, 'cancelled'); assert.equal(h.installs.length, write - 1);
  assert.equal(h.state.stats.fishing_count, write - 1); assert.equal(h.state.stats.fishing_battles, 0); assert.equal(outcome.encounter, undefined);
});
for (const write of [1, 2]) for (const callback of [1, 2, 3]) test('A1 stat' + write + ' parent callback' + callback + ' state replacement is retained', async () => {
  let armed = false, checks = 0, changed = false, h;
  h = fixture({ onInstall(number) { if (number === write) armed = true; }, onAssert() {
    if (armed && ++checks === callback && !changed) { changed = true; h.external(game => { game.money = 123; }); }
  } });
  const outcome = await drive(h, write); assert(changed); assert.equal(outcome.status, 'failed'); assert.equal(h.installs.length, write - 1);
  assert.equal(h.state.money, 123); assert.equal(h.state.stats.fishing_count, write - 1); assert.equal(h.state.stats.fishing_battles, 0); assert.equal(outcome.encounter, undefined);
});
for (const write of [1, 2]) for (const read of [1, 2]) test('A1 stat' + write + ' state read' + read + ' cancellation cannot escape local guard', async () => {
  let armed = false, reads = 0, cancelled = false;
  const h = fixture({ onInstall(number) { if (number === write) armed = true; }, onRead(context) {
    if (armed && ++reads === read && !cancelled) { cancelled = true; context.operation.cancel(); }
  } });
  const outcome = await drive(h, write); assert(cancelled); assert.equal(outcome.status, 'cancelled'); assert.equal(h.installs.length, write - 1); assert.equal(h.state.stats.fishing_battles, 0);
});
for (const write of [1, 2]) for (const read of [1, 2]) test('A1 stat' + write + ' state read' + read + ' actual state replacement is not overwritten', async () => {
  let armed = false, reads = 0, changed = false, h;
  h = fixture({ onInstall(number) { if (number === write) armed = true; }, onRead() {
    if (armed && ++reads === read && !changed) { changed = true; h.external(game => { game.money = 456; }); }
  } });
  const outcome = await drive(h, write); assert(changed); assert.equal(outcome.status, 'failed'); assert.equal(h.installs.length, write - 1); assert.equal(h.state.money, 456); assert.equal(h.state.stats.fishing_battles, 0);
});
test('A1 actualContent guard never reenters content provider, whose callback can have side effects', async () => {
  const h = fixture({ onContent(context) { if (context.installing) { context.operation.cancel(); throw Error('unexpected-content-provider-in-final-guard'); } } });
  const { promise } = await h.start(); h.window(); h.input(1, { confirm: true }); h.finish(); const outcome = await promise;
  assert.equal(outcome.status, 'completed'); assert.equal(outcome.completion.caught, true); assert.equal(h.contentReadsDuringInstall, 0); assert.equal(h.installs.length, 2);
});
test('A1 fresh but same-semantic state/content reads remain valid for source and both stats', async () => {
  const h = fixture({ cloneReads: true, cloneContentReads: true }), { promise } = await h.start(); h.window(); h.input(1, { confirm: true }); h.finish();
  const outcome = await promise; assert.equal(outcome.status, 'completed'); assert.equal(outcome.encounter.type, 'OldRod'); assert.equal(h.installs.length, 2); assert.equal(h.state.stats.fishing_count, 1); assert.equal(h.state.stats.fishing_battles, 1);
});
test('A1 same-semantic objects replaced in terminal parent check are accepted by semantic source guard', async () => {
  let armed = false, checks = 0, replaced = false, h;
  h = fixture({ semanticActualContent: true, onInstall() { armed = true; checks = 0; }, onAssert() {
    if (armed && ++checks === 3) { replaced = true; h.external(() => {}); h.actual(clone(h.content)); }
  } });
  const { promise } = await h.start(); h.window(); h.input(1, { confirm: true }); h.finish(); const outcome = await promise;
  assert(replaced); assert.equal(outcome.status, 'completed'); assert.equal(h.installs.length, 2); assert.equal(h.contentReadsDuringInstall, 0);
});
test('A1 terminal parent actualContent replacement with changed meaning rejects and preserves prior prefix', async () => {
  let armed = false, checks = 0, h;
  h = fixture({ semanticActualContent: true, onInstall(number) { if (number === 2) armed = true; }, onAssert() {
    if (armed && ++checks === 3) h.actual({ ...h.content, settings: { FISHING_AUTO_HOOK: true } });
  } });
  const { promise } = await h.start(); h.window(); h.input(1, { confirm: true }); h.finish(); const outcome = await promise;
  assert.equal(outcome.status, 'failed'); assert.equal(h.installs.length, 1); assert.equal(h.state.stats.fishing_count, 1); assert.equal(h.state.stats.fishing_battles, 0); assert.equal(outcome.encounter, undefined); assert.equal(h.contentReadsDuringInstall, 0);
});
