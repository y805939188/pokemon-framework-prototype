'use strict';
// Explicit standalone suite: intentionally not added to the shared headless manifest in this parallel batch.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../../..');
let temp, BattleBagSelection;
test.before(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-battle-bag-'));
  fs.writeFileSync(path.join(temp, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'CommonJS', strict: true, types: [], lib: ['ES2022'],
    rootDir: path.join(ROOT, 'src'), outDir: temp, noEmitOnError: true,
  }, files: [path.join(ROOT, 'src/plugins/battleflow/battle-bag.ts')] }));
  const result = spawnSync('pnpm', ['--dir', 'src', 'exec', 'tsc', '-p', path.join(temp, 'tsconfig.json')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  ({ BattleBagSelection } = require(path.join(temp, 'plugins/battleflow/battle-bag.js')));
});
test.after(() => { if (temp) fs.rmSync(temp, { recursive: true, force: true }); });
const item = (itemId, battleUse = 'member', pocket = 2, quantity = 3) => ({ itemId, battleId: 'battle-' + itemId, battleUse, pocket, quantity });
const member = (memberId, egg = false) => ({ memberId, egg, moves: [{ slot: 0, moveId: 'tackle' }, { slot: 3, moveId: 'ember' }] });
const input = (options = {}) => ({ internalBattle: true, actorId: 'actor', items: [item('potion')],
  members: [member('actor'), member('bench')], activeIds: ['actor'], foeIds: ['foe'], ...options });
function open(options) { const bag = new BattleBagSelection(); bag.open(input(options)); return bag; }
function use(bag) { assert.equal(bag.confirm(), null); assert.equal(bag.view().kind, 'commands'); return bag.confirm(); }
function frozen(value) { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; }

test('first opening uses battle defaults, filters field-only/zero quantities and preserves authored pocket order', () => {
  const bag = open({ items: [item('field', 'none', 1), item('gone', 'member', 2, 0), item('second', 'member', 2), item('first', 'active', 2), item('ball', 'ball', 3)] });
  assert.deepEqual(bag.view(), { kind: 'items', pocket: 2, cursor: 0, rows: [item('second'), item('first', 'active')] });
  bag.move('right'); assert.equal(bag.view().pocket, 3);
  bag.move('right'); assert.equal(bag.view().pocket, 2);
  bag.move('left'); assert.equal(bag.view().pocket, 3);
});
test('empty and completely filtered bags offer only cancellation and never emit an item request', () => {
  for (const items of [[], [item('field', 'none')], [item('empty', 'ball', 3, 0)]]) {
    const bag = open({ items }); assert.deepEqual(bag.view(), { kind: 'items', pocket: 1, cursor: 0, rows: [] });
    for (const direction of ['left', 'right', 'up', 'down']) bag.move(direction);
    assert.equal(bag.confirm(), null); assert.deepEqual(bag.view(), { kind: 'closed', reason: 'cancelled' });
  }
});
test('unselected BACK and explicit list Cancel both leave for the main menu', () => {
  const bag = open(); bag.cancel(); assert.deepEqual(bag.view(), { kind: 'closed', reason: 'cancelled' });
  bag.open(input()); bag.select(1); assert.equal(bag.confirm(), null); assert.equal(bag.view().reason, 'cancelled');
});
test('Use/Cancel is a separate layer; either command cancellation restores the same list row', () => {
  const bag = open({ items: [item('first'), item('second')] }); bag.select(1); bag.confirm(); bag.cancel();
  assert.equal(bag.view().kind, 'items'); assert.equal(bag.view().cursor, 1);
  bag.confirm(); bag.select(1); assert.equal(bag.confirm(), null);
  assert.equal(bag.view().kind, 'items'); assert.equal(bag.view().cursor, 1);
});
test('battle pocket and per-pocket row memories survive reopening and never borrow field cursors', () => {
  const field = frozen({ lastPocket: 8, indices: [4, 5, 6, 7, 8, 9, 10, 11] });
  const before = JSON.stringify(field), snapshot = frozen(input({ items: [item('a'), item('b'), item('ball', 'ball', 3)] }));
  const bag = new BattleBagSelection(); bag.open(snapshot); assert.equal(bag.view().pocket, 2); assert.equal(bag.view().cursor, 0);
  bag.select(1); bag.move('right'); bag.select(1); bag.cancel(); bag.open(snapshot);
  assert.equal(bag.view().pocket, 3); assert.equal(bag.view().cursor, 1);
  bag.move('left'); assert.equal(bag.view().cursor, 1); assert.equal(JSON.stringify(field), before);
});
test('fresh quantities on reopening remove exhausted rows and clamp battle focus', () => {
  const bag = open({ items: [item('a'), item('b'), item('ball', 'ball', 3)] });
  bag.select(2); bag.cancel(); bag.open(input({ items: [item('a'), item('b', 'member', 2, 0), item('ball', 'ball', 3)] }));
  assert.equal(bag.view().cursor, 1); assert.deepEqual(bag.view().rows.map(row => row.itemId), ['a']);
  bag.cancel(); bag.open(input({ items: [item('ball', 'ball', 3)] })); assert.equal(bag.view().pocket, 3);
});
test('member selection returns stable identity even when display order differs; BACK returns to the bag', () => {
  const bag = open({ members: [member('bench'), member('actor')] }); assert.equal(use(bag), null);
  assert.equal(bag.view().kind, 'members'); bag.select(0);
  const request = bag.confirm(); assert.deepEqual(request, { itemId: 'potion', battleId: 'battle-potion', target: { kind: 'member', memberId: 'bench' } });
  assert.equal(bag.resolve(request, { ok: false }), true); assert.equal(bag.view().kind, 'members');
  bag.cancel(); assert.equal(bag.view().kind, 'items');
});
test('egg members cannot produce a request; another member remains selectable', () => {
  const bag = open({ members: [member('actor', true), member('bench')] }); use(bag);
  assert.equal(bag.confirm(), null); assert.equal(bag.view().kind, 'members');
  bag.select(1); assert.equal(bag.confirm().target.memberId, 'bench');
});
test('move-target items always select a member, then preserve actual move slot and identity', () => {
  const bag = open({ items: [item('ether', 'move')], members: [member('actor')] });
  assert.equal(use(bag), null); assert.equal(bag.view().kind, 'members'); bag.confirm(); assert.equal(bag.view().kind, 'moves');
  bag.select(1); const request = bag.confirm();
  assert.deepEqual(request.target, { kind: 'move', memberId: 'actor', slot: 3, moveId: 'ember' });
  bag.resolve(request, { ok: false }); assert.equal(bag.view().kind, 'members');
});
test('move cancellation returns to its member row; member cancellation returns to the item row', () => {
  const bag = open({ items: [item('ether', 'move')] }); use(bag); bag.select(1); bag.confirm();
  bag.cancel(); assert.equal(bag.view().kind, 'members'); assert.equal(bag.view().cursor, 1);
  bag.confirm(); bag.select(2); bag.confirm(); assert.equal(bag.view().kind, 'members'); assert.equal(bag.view().cursor, 1);
  bag.select(2); bag.confirm(); assert.equal(bag.view().kind, 'items');
});
test('a member with no moves has only move Cancel and cannot fabricate a move request', () => {
  const bag = open({ items: [item('ether', 'move')], members: [{ memberId: 'actor', egg: false, moves: [] }] });
  use(bag); bag.confirm(); assert.deepEqual(bag.view().rows, []); assert.equal(bag.confirm(), null); assert.equal(bag.view().kind, 'members');
});
test('a single member auto-submits; a rejected eligibility/registration result opens members', () => {
  const bag = open({ members: [member('actor')] }), request = use(bag);
  assert.deepEqual(request.target, { kind: 'member', memberId: 'actor' }); assert.equal(bag.view().kind, 'submitting');
  bag.resolve(request, { ok: false }); assert.equal(bag.view().kind, 'members');
  bag.cancel(); assert.equal(bag.view().kind, 'items');
});
test('one player position auto-targets that stable identity rather than the first party row', () => {
  const bag = open({ items: [item('xattack', 'active', 7)], members: [member('bench'), member('actor')] });
  const request = use(bag); assert.deepEqual(request.target, { kind: 'active', memberId: 'actor' });
  bag.resolve(request, { ok: false }); assert.equal(bag.view().kind, 'members'); assert.equal(bag.view().cursor, 1);
});
test('multiple player positions require selection and a refused target stays in members', () => {
  const bag = open({ items: [item('xattack', 'active')], activeIds: ['actor', 'bench'] });
  assert.equal(use(bag), null); assert.equal(bag.view().kind, 'members'); bag.select(1);
  const request = bag.confirm(); assert.deepEqual(request.target, { kind: 'active', memberId: 'bench' });
  bag.resolve(request, { ok: false }); assert.equal(bag.view().kind, 'members'); assert.equal(bag.view().cursor, 1);
});
for (const battleUse of ['foe', 'ball']) {
  test(battleUse + ': a single living opponent auto-submits and rejection restores items', () => {
    const bag = open({ items: [item('target-item', battleUse)] }), request = use(bag);
    assert.deepEqual(request.target, { kind: 'foe', memberId: 'foe' });
    bag.resolve(request, { ok: false }); assert.equal(bag.view().kind, 'items');
  });
  test(battleUse + ': target cancellation and target rejection both return to the same bag list', () => {
    const bag = open({ items: [item('target-item', battleUse)], foeIds: ['far-foe', 'near-foe'] });
    assert.equal(use(bag), null); assert.equal(bag.view().kind, 'foes'); bag.cancel(); assert.equal(bag.view().kind, 'items');
    use(bag); bag.select(1); const request = bag.confirm(); assert.equal(request.target.memberId, 'near-foe');
    bag.resolve(request, { ok: false }); assert.equal(bag.view().kind, 'items');
    use(bag); bag.select(2); bag.confirm(); assert.equal(bag.view().kind, 'items');
  });
}
test('no living opposing target offers only cancellation and never selects a missing identity', () => {
  const bag = open({ items: [item('ball', 'ball', 3)], foeIds: [] }); use(bag);
  assert.deepEqual(bag.view().rows, []); assert.equal(bag.confirm(), null); assert.equal(bag.view().kind, 'items');
});
test('direct use targets the acting member and returns to items after rejection', () => {
  const bag = open({ items: [item('doll', 'direct')] }), request = use(bag);
  assert.deepEqual(request.target, { kind: 'direct', memberId: 'actor' }); bag.resolve(request, { ok: false }); assert.equal(bag.view().kind, 'items');
});
test('selection emits no accepted action until the caller reports acceptance; resources remain unchanged', () => {
  const snapshot = frozen(input({ members: [member('actor')] })), before = JSON.stringify(snapshot);
  const bag = new BattleBagSelection(); bag.open(snapshot); const request = use(bag);
  assert.equal(bag.view().kind, 'submitting'); assert.equal(JSON.stringify(snapshot), before);
  bag.cancel(); bag.move('right'); bag.select(0); assert.equal(bag.confirm(), null); assert.equal(bag.view().kind, 'submitting');
  assert.equal(bag.resolve(request, { ok: true }), true); assert.deepEqual(bag.view(), { kind: 'closed', reason: 'accepted' });
  assert.equal(bag.resolve(request, { ok: true }), false); assert.equal(JSON.stringify(snapshot), before);
});
test('late, repeated, copied and other-instance replies cannot accept a new candidate', () => {
  const bag = open({ members: [member('actor')] }), old = use(bag); bag.resolve(old, { ok: false }); bag.cancel();
  const current = use(bag), other = open({ members: [member('actor')] }), alien = use(other);
  for (const stale of [old, { ...current }, alien]) assert.equal(bag.resolve(stale, { ok: true }), false);
  assert.equal(bag.view().kind, 'submitting'); bag.resolve(current, { ok: true });
});
test('retirement invalidates in-flight candidates, clears battle memories and permits fresh input', () => {
  const bag = open({ items: [item('ball', 'ball', 3)] }), old = use(bag); bag.retire();
  assert.deepEqual(bag.view(), { kind: 'closed', reason: 'idle' }); assert.equal(bag.resolve(old, { ok: true }), false);
  bag.open(input({ items: [item('potion'), item('ball', 'ball', 3)] })); assert.equal(bag.view().pocket, 2); assert.equal(bag.view().cursor, 0);
});
test('published inputs and returned views are detached, while emitted requests are immutable', () => {
  const snapshot = input({ items: [item('ether', 'move')] }), bag = new BattleBagSelection(); bag.open(snapshot);
  snapshot.items[0].quantity = 999; snapshot.members[0].moves[0].moveId = 'changed';
  const list = bag.view(); list.rows[0].quantity = 555; assert.equal(bag.view().rows[0].quantity, 3);
  use(bag); const members = bag.view(); members.rows[0].moves[0].moveId = 'changed-again'; bag.confirm();
  assert.equal(bag.view().rows[0].moveId, 'tackle'); const moves = bag.view(); moves.rows[0].slot = 2;
  const request = bag.confirm(); assert.equal(request.target.slot, 0);
  assert.throws(() => { request.battleId = 'forged'; }, TypeError); assert.throws(() => { request.target.memberId = 'forged'; }, TypeError);
});
test('separate battles own separate memories and cannot be reopened over a live selection', () => {
  const first = open({ items: [item('a'), item('b')] }), second = open({ items: [item('a'), item('b')] });
  first.select(1); assert.equal(second.view().cursor, 0); assert.throws(() => first.open(input()), /already open/);
  assert.equal(first.view().cursor, 1);
});
test('non-internal battle is unavailable and never offers an item intent', () => {
  const bag = open({ internalBattle: false }); assert.deepEqual(bag.view(), { kind: 'closed', reason: 'unavailable' });
  assert.equal(bag.confirm(), null); bag.cancel(); assert.equal(bag.view().reason, 'unavailable');
});
test('invalid published identities and quantities are rejected before replacing valid battle memory', () => {
  const bag = open({ items: [item('a'), item('b')] }); bag.select(1); bag.cancel();
  for (const options of [
    { items: [item('a'), item('a')] }, { items: [item('a', 'member', 9)] }, { items: [item('a', 'member', 2, -1)] },
    { activeIds: ['missing'] }, { foeIds: ['same', 'same'] }, { members: [member('missing')] },
    { members: [{ memberId: 'actor', egg: false, moves: [{ slot: 4, moveId: 'move' }] }] },
  ]) assert.throws(() => bag.open(input(options)));
  bag.open(input({ items: [item('a'), item('b')] })); assert.equal(bag.view().cursor, 1);
});
