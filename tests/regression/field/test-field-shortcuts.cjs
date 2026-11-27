'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { rules, item, inventory, member } = require('../../support/field/e1-fixtures.cjs');
const S = rules('fieldShortcuts', 'field-shortcuts');
const catalog = { rod: item('rod', { name: 'Z rod', flags: ['KeyItem'] }), plain: item('plain', { name: 'A ordinary' }), other: item('other', { name: 'M other' }) };
const abilities = { hasHandler: () => true, canUse: () => true, name: id => id };

test('direct register accepts known identities without stock or handler and deduplicates in order', () => {
  const before = Object.freeze(['other']);
  const first = S.registerShortcutItem(before, 'plain', catalog);
  assert.deepEqual(first, ['other', 'plain']); assert.deepEqual(before, ['other']);
  assert.deepEqual(S.registerShortcutItem(first, 'plain', catalog), ['other', 'plain']);
  assert.throws(() => S.registerShortcutItem(first, 'missing', catalog), /unknown-shortcut-item/);
  assert.deepEqual(S.unregisterShortcutItem(first, 'missing'), first); assert.deepEqual(S.unregisterShortcutItem(first, 'plain'), ['other']);
});
test('bag command and key-item icon are independent guards', () => {
  assert.equal(S.shortcutRegistrationCommand(['plain'], 'plain', catalog, () => false), 'unregister');
  assert.equal(S.shortcutRegistrationCommand([], 'plain', catalog, () => true), 'register');
  assert.equal(S.shortcutRegistrationCommand([], 'rod', catalog, () => false), null);
  assert.equal(S.shortcutRegistrationIcon(['plain'], 'plain', catalog), null);
  assert.equal(S.shortcutRegistrationIcon([], 'rod', catalog, () => true), 'unregistered');
  assert.equal(S.shortcutRegistrationIcon(['rod'], 'rod', catalog), 'registered');
});
for (const important of [false, true]) for (const registered of [false, true]) for (const handler of [false, true]) {
  test('registration icon matrix important=' + important + ' registered=' + registered + ' handler=' + handler, () => {
    const id = important ? 'rod' : 'plain', list = registered ? [id] : [];
    const expectedIcon = !important ? null : registered ? 'registered' : handler ? 'unregistered' : null;
    const expectedCommand = registered ? 'unregister' : handler ? 'register' : null;
    assert.equal(S.shortcutRegistrationIcon(list, id, catalog, () => handler), expectedIcon);
    assert.equal(S.shortcutRegistrationCommand(list, id, catalog, () => handler), expectedCommand);
  });
}
test('missing field-handler provider hides unregistered key icon; registered key icon survives handler loss', () => {
  assert.equal(S.shortcutRegistrationIcon([], 'rod', catalog), null);
  assert.equal(S.shortcutRegistrationIcon(['rod'], 'rod', catalog, () => { throw Error('must not recheck registered icon'); }), 'registered');
});
test('item collection sorts display names, retains persistence order, and does not require handlers', () => {
  const registered = Object.freeze(['rod', 'plain', 'other']); const inv = inventory(['rod', 1], ['plain', 2]);
  const copy = structuredClone(inv);
  assert.deepEqual(S.collectShortcutItems(registered, inv, catalog).map(e => [e.itemId, e.quantity]), [['plain', 2], ['rod', 1]]);
  assert.deepEqual(registered, ['rod', 'plain', 'other']); assert.deepEqual(inv, copy);
  assert.deepEqual(S.collectShortcutItems(registered, inventory(), catalog), []);
  assert.deepEqual(registered, ['rod', 'plain', 'other']);
  assert.deepEqual(S.collectShortcutItems(registered, inventory(['other', 1]), catalog).map(e => e.itemId), ['other']);
});
test('unknown inherited identities are not catalog items', () => {
  assert.throws(() => S.registerShortcutItem([], 'constructor', catalog), /unknown-shortcut-item/);
  assert.deepEqual(S.collectShortcutItems(['constructor'], inventory(['constructor', 1]), catalog), []);
});
test('absent actual ability provider produces no false ready candidates', () => {
  assert.deepEqual(S.collectShortcutMoves([member('a', ['cut'])]), []);
  assert.deepEqual(S.collectShortcutMoves([member('a', ['cut'])], { ...abilities, hasHandler: () => false }), []);
});
test('only approved nine families enter the 16-entry catalogue projection', () => {
  assert.equal(S.SHORTCUT_MOVE_IDS.length, 16);
  const party = [member('a', [...S.SHORTCUT_MOVE_IDS])];
  const entries = S.collectShortcutMoves(party, abilities);
  assert.deepEqual(entries.map(e => e.moveId).sort(), [...S.APPROVED_FIELD_MOVE_IDS].sort());
  for (const id of ['headbutt', 'dive', 'waterfall', 'defog', 'rockclimb', 'secretpower', 'whirlpool']) {
    assert.equal(entries.some(e => e.moveId === id), false);
    assert.equal(S.resolveShortcutMove({ memberId: 'a', moveId: id }, party, abilities), null);
  }
});
test('move collection is non-egg + learned + silent eligibility, including fainted and zero PP', () => {
  const party = [member('egg', ['cut'], { isEgg: true }), member('dead', ['cut'], { hp: 0 }), member('no-move', []), member('refused', ['cut'])];
  const calls = [];
  const entries = S.collectShortcutMoves(party, { ...abilities, canUse: (m, moveId) => { calls.push([m.id, moveId]); return m.id !== 'refused'; } });
  assert.deepEqual(entries.map(e => [e.memberId, e.moveId]), [['dead', 'cut']]);
  assert.deepEqual(calls, [['dead', 'cut'], ['refused', 'cut']]);
});
test('selection uses stable member identity after reorder, then rechecks forgetting/boxing/eggs/qualification/handler', () => {
  const a = member('stable-a', ['cut']), b = member('stable-b', ['surf']);
  const selected = S.collectShortcutMoves([a, b], abilities)[0]; assert.equal(selected.memberId, 'stable-a');
  assert.equal(S.resolveShortcutMove(selected, [b, a], abilities), a);
  assert.equal(S.resolveShortcutMove(selected, [b], abilities), null);
  assert.equal(S.resolveShortcutMove(selected, [{ ...a, moves: [] }], abilities), null);
  assert.equal(S.resolveShortcutMove(selected, [{ ...a, isEgg: true }], abilities), null);
  assert.equal(S.resolveShortcutMove(selected, [a], { ...abilities, canUse: () => false }), null);
  assert.equal(S.resolveShortcutMove(selected, [a], { ...abilities, hasHandler: () => false }), null);
});
test('move display sorting preserves party/moves and stable order for equal names', () => {
  const party = [member('b', ['surf', 'cut']), member('a', ['cut'])], copy = structuredClone(party);
  const entries = S.collectShortcutMoves(party, { ...abilities, name: id => id === 'cut' ? 'Z' : 'A' });
  assert.deepEqual(entries.map(e => [e.memberId, e.moveId]), [['b', 'surf'], ['b', 'cut'], ['a', 'cut']]); assert.deepEqual(party, copy);
});
