'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { composed, command: c } = require('./fishing-composed-fixtures.cjs');

test('T24 actual App→typed port→MZ host counts only after real message/animation ACKs', async () => {
  const h = composed(), { promise } = await h.start();
  assert.equal(h.state.stats.fishing_count, 1); assert.equal(h.pending.kind, 'begin-presentation'); assert.deepEqual(h.draws, []);
  h.tick(100); assert.equal(h.pending.kind, 'begin-presentation'); h.tick(100); assert.equal(h.pending.kind, 'open-message');
  h.tick(10000); assert.equal(h.pending.kind, 'open-message'); assert.deepEqual(h.draws, []);
  const id = h.pending.id;
  h.inject({ sample: { monotonicMs: h.now, active: true }, effect: { id: id + 99, status: 'completed' } }); assert.deepEqual(h.draws, []);
  h.closeMessage(); h.tick(); assert.equal(h.pending.kind, 'dots'); h.closeMessage(); h.tick();
  for (let n = 0; n < 30 && (!h.pending || h.pending.kind === 'dots'); n++) h.pending ? (h.closeMessage(), h.tick()) : h.tick(400);
  assert.equal(h.pending.kind, 'exclamation'); assert.deepEqual(h.draws, [6, 100]);
  h.tick(10000); assert.equal(h.pending.kind, 'exclamation'); assert.equal(h.h.player.isAnimationPlaying(), true); assert.deepEqual(h.draws, [6, 100]);
  h.endAnimation(); h.tick(); assert.equal(h.pending.kind, 'bite-message'); h.tick(10000); assert.deepEqual(h.draws, [6, 100, 6]);
  h.closeMessage(); h.tick(); h.tick(500); assert.equal(h.pending, null); h.tick(10, ['ok']); h.finish();
  const result = await promise; assert.equal(result.status, 'completed'); assert.equal(result.completion.caught, true);
  assert.deepEqual(result.prefix, { countCommitted: true, battlesCommitted: true }); assert.equal(h.installs.length, 2);
  assert.equal(result.encounter.type, 'OldRod'); assert.equal(result.encounter.facingEnvironment.value, 'stillwater'); assert.equal(result.encounter.business.mapId.value, 1);
  assert.deepEqual(h.draws, [6, 100, 6, 100]);
  const acknowledgements = h.advances.filter(a => a.effect).map(a => a.effect.id); assert.equal(new Set(acknowledgements).size, acknowledgements.length);
  const before = h.advances.length; h.session.update(); h.session.dispose(); assert.equal(h.advances.length, before); assert.equal(h.h.focusListeners, 0);
});
test('T24 no-table uses real messages and every waiting dot, never a bite or caught counter', async () => {
  const h = composed({ noTable: true }), { promise } = await h.start(); h.waiting();
  for (let n = 0; n < 30 && (!h.pending || h.pending.kind === 'dots'); n++) h.pending ? (h.closeMessage(), h.tick()) : h.tick(400);
  h.finish(); const result = await promise;
  assert.equal(result.status, 'completed'); assert.equal(result.completion.caught, false); assert.equal(result.encounter, undefined);
  assert.equal(h.effects.filter(e => e.kind === 'dots').length, 6); assert.deepEqual(h.draws, [6]);
  assert.equal(h.state.stats.fishing_count, 1); assert.equal(h.state.stats.fishing_battles, 0);
});
test('T24 guarded BEGIN/END IDs actually select native owned child/interpreter and transparency', async () => {
  const h = composed({ settings: { FISHING_BEGIN_COMMON_EVENT: 7, FISHING_END_COMMON_EVENT: 9 } });
  h.event(7, [c(117, [8]), c(0)]); h.event(8, [c(230, [1]), c(0)]); h.event(9, [c(211, [1]), c(0)]); h.h.player._transparent = true;
  const { promise } = await h.start(); assert.deepEqual(h.configs[0], { beginCommonEventId: 7, endCommonEventId: 9 });
  h.tick(); assert.equal(h.pending.kind, 'begin-presentation'); assert.deepEqual(h.draws, []); h.tick(); assert.equal(h.pending.kind, 'open-message');
  h.closeMessage(); h.tick(); h.closeMessage(); h.tick(); h.tick(1, ['cancel']); h.finish();
  assert.equal((await promise).status, 'completed'); assert.equal(h.h.player._transparent, false); assert.deepEqual(h.draws, [6]);
  assert.equal(h.h.log.some(x => String(x).startsWith('pattern:')), false, 'valid common events replace builtin pose stages');
});
for (const [rod, type] of [[1, 'OldRod'], [2, 'GoodRod'], [3, 'SuperRod']]) test('R07 composed accelerated rod ' + rod + ' retains exact source/prefix', async () => {
  const h = composed({ rod, accelerated: true }), { promise } = await h.start(); h.window(); h.tick(510, ['cancel']); h.finish();
  const result = await promise; assert.equal(result.encounter.type, type); assert.deepEqual(h.draws, [6, 6, 100, 6, 100]);
});
test('R07 composed autoHook and timeout follow actual Input sampling and animation gates', async () => {
  const auto = composed({ settings: { FISHING_AUTO_HOOK: true } }), a = await auto.start(); auto.window(); auto.tick(10000); assert.equal(auto.pending, null);
  auto.tick(1, ['ok']); auto.finish(); assert.equal((await a.promise).completion.caught, true); assert.deepEqual(auto.draws, [6, 100, 6]); assert.equal(auto.effects.some(e => e.kind === 'result-message'), false);
  const timeout = composed(), b = await timeout.start(); timeout.window(); timeout.tick(500); assert.equal(timeout.pending, null); timeout.tick(10); timeout.finish();
  assert.equal((await b.promise).completion.caught, false); assert.deepEqual(timeout.draws, [6, 100, 6]); assert.equal(timeout.state.stats.fishing_battles, 0);
});
test('T24 actual HostInput blur clears keys and production clock excludes inactive interval', async () => {
  const h = composed(), { promise } = await h.start(); h.window(); h.input('keydown', 'Enter'); assert.equal(h.h.input.domPressed('use'), true);
  h.fire('blur', 100); assert.equal(h.h.input.domPressed('use'), false); assert(h.h.log.includes('input-cleared'));
  h.tick(10000, ['ok']); assert.equal(h.pending, null); h.fire('focus', 10000); h.tick(400); assert.equal(h.pending, null); h.tick(10); h.finish();
  const result = await promise; assert.equal(result.completion.caught, false); assert.equal(result.cleanup, 'completed'); assert.deepEqual(h.draws, [6, 100, 6]); assert.equal(h.h.focusListeners, 0);
});
test('T24 600ms focused stall cannot catch up past undisplayed real dot', async () => {
  const h = composed(), { promise } = await h.start(); h.waiting(); const before = h.now; h.tick(600);
  assert.equal(h.pending.kind, 'dots'); assert.equal(h.pending.dots, 1); assert.equal(h.now - before, 600);
  h.tick(600); assert.equal(h.pending.dots, 1); assert.deepEqual(h.draws, [6]); h.operation.cancel(); h.tick();
  assert.equal((await promise).status, 'cancelled'); assert.equal(h.state.stats.fishing_count, 1); assert.equal(h.state.stats.fishing_battles, 0);
});
for (const kind of ['choice', 'number', 'item', 'scroll']) test('T24 composed ' + kind + ' cancellation waits restore and isolates successor message', async () => {
  const h = composed({ settings: { FISHING_BEGIN_COMMON_EVENT: 7 } });
  const opening = kind === 'choice' ? [c(102, [['yes'], -2, 0, 2, 0]), c(0)] : kind === 'number' ? [c(103, [17, 2]), c(0)]
    : kind === 'item' ? [c(104, [18, 2]), c(0)] : [c(105, [2, false]), c(405, ['owned scroll']), c(0)];
  h.event(7, opening); const { operation, promise } = await h.start(); h.tick();
  const old = h.session;
  if (kind !== 'scroll') h.h.window.startInput(); else { h.ui.scroll._text = 'owned scroll'; h.ui.scroll.hidden = false; }
  const child = h.ui[kind], late = (kind === 'choice' ? child.callOkHandler : kind === 'number' ? child.processOk : kind === 'item' ? child.onOk : child.terminateMessage).bind(child);
  assert.equal(operation.cancel(), promise); assert.equal(h.pending.kind, 'restore'); await h.flush(); assert.equal(h.settled, undefined);
  if (kind !== 'scroll') { assert.equal(child.active, false); assert.equal(child.opened, false); } else { assert.equal(child._text, null); assert.equal(child.hidden, true); }
  h.tick(); const result = await promise; assert.equal(result.status, 'cancelled'); assert.equal(result.cleanup, 'completed'); assert.equal(result.prefix.battlesCommitted, false);
  h.content.settings.FISHING_BEGIN_COMMON_EVENT = -1; h.next(); const successor = await h.start(); h.tick(200); assert.equal(h.pending.kind, 'open-message'); assert.equal(h.h.message.isBusy(), true);
  const acknowledgements = h.advances.length; late(); old.update(); old.dispose(); assert.equal(h.h.message.isBusy(), true); assert.equal(h.advances.length, acknowledgements);
  assert.equal(h.ui.values.size, 0); successor.operation.cancel(); h.tick(); await successor.promise; assert.equal(h.state.stats.fishing_count, 2); assert.equal(h.state.stats.fishing_battles, 0);
});
for (const change of ['owner', 'map', 'scene']) test('T24 actual ' + change + ' invalidation revokes native route before any late player update', async () => {
  const h = composed({ settings: { FISHING_BEGIN_COMMON_EVENT: 7 } });
  const beforeImage = [h.h.player.characterName(), h.h.player.characterIndex()];
  const route = { list: [c(41, ['LATE_OLD_FISHING', 0]), c(0)], repeat: false, skippable: false, wait: true };
  h.event(7, [c(205, [-1, route]), c(0)]); const { promise } = await h.start(); h.tick(); const old = h.session;
  assert.equal(h.h.player.isMoveRouteForcing(), true); assert.deepEqual([h.h.player.characterName(), h.h.player.characterIndex()], beforeImage);
  if (change === 'owner') h.replaceOwner(); else if (change === 'map') h.h.map.id++; else h.h.root.SceneManager._scene = { _messageWindow: h.h.window };
  h.tick(); assert.equal(h.pending.kind, 'restore'); h.routeTick(); assert.notEqual(h.h.player._characterName, 'LATE_OLD_FISHING'); assert.equal(h.h.player.isMoveRouteForcing(), false);
  h.tick(); const result = await promise; assert.equal(result.status, 'failed'); assert.equal(result.cleanup, 'completed'); assert.equal(h.state.stats.fishing_count, 1); assert.equal(h.state.stats.fishing_battles, 0);
  const nextRoute = { list: [c(41, ['NEXT_FISHING', 0]), c(0)], repeat: false, skippable: false, wait: true };
  h.event(7, [c(205, [-1, nextRoute]), c(0)]); h.next(); const successor = await h.start(); h.tick(); const actualNext = h.h.player._moveRoute;
  old.run({ kind: 'restore', id: 999, surfing: false, interrupted: true }); old.dispose(); old.update(); assert.equal(h.h.player._moveRoute, actualNext);
  h.routeTick(); h.tick(); assert.equal(h.h.player._characterName, 'NEXT_FISHING'); assert.equal(h.pending.kind, 'begin-presentation'); h.routeTick(); h.tick(); assert.equal(h.pending.kind, 'open-message');
  successor.operation.cancel(); h.tick(); await successor.promise;
});
test('T24 cancellation preserves an actual foreign native route while revoking only its own callbacks', async () => {
  const h = composed({ settings: { FISHING_BEGIN_COMMON_EVENT: 7 } });
  h.event(7, [c(205, [-1, { list: [c(15, [10]), c(0)], repeat: false, skippable: false, wait: true }]), c(0)]);
  const { operation, promise } = await h.start(); h.tick();
  const foreign = { list: [c(41, ['FOREIGN_ROUTE', 0]), c(0)], repeat: false, skippable: false, wait: true };
  h.h.player.forceMoveRoute(foreign); h.replaceOwner(); operation.cancel(); h.tick(); await promise;
  assert.equal(h.h.player._moveRoute, foreign); assert.equal(h.h.player.isMoveRouteForcing(), true); h.routeTick(); assert.equal(h.h.player._characterName, 'FOREIGN_ROUTE');
});
test('T24 production facing facts refuse before counter/presentation when the real lookup is non-fishable', async () => {
  const h = composed({ fishable: false }), { promise } = await h.start(), result = await promise;
  assert.equal(result.status, 'refused'); assert.equal(result.reason, 'not-fishable'); assert.equal(h.sessions.length, 0); assert.equal(h.installs.length, 0); assert.deepEqual(h.draws, []);
  assert(h.h.log.some(row => Array.isArray(row) && row[0] === 'terrain' && row[1] === 6 && row[2] === 6));
});
test('R07 native BEGIN script failure retains entered count with zero random prefix and acknowledged restoration', async () => {
  const h = composed({ settings: { FISHING_BEGIN_COMMON_EVENT: 7 } }); h.event(7, [c(355, ['throw new Error("native-begin-failed");']), c(0)]);
  const { promise } = await h.start(); h.tick(); assert.equal(h.pending.kind, 'restore'); assert.deepEqual(h.draws, []); assert.equal(h.settled, undefined);
  h.tick(); const result = await promise; assert.equal(result.status, 'failed'); assert.equal(result.cleanup, 'completed'); assert.deepEqual(result.prefix, { countCommitted: true, battlesCommitted: false });
  assert.equal(h.advances.filter(a => a.effect?.status === 'failed').length, 1);
});
test('R07 occupied actual Game_Message fails opening before any RNG and preserves the foreign message', async () => {
  const h = composed(); h.h.message.add('foreign-message'); const { promise } = await h.start(); h.tick(200); assert.equal(h.pending.kind, 'restore'); assert.deepEqual(h.draws, []);
  h.tick(); const result = await promise; assert.equal(result.status, 'failed'); assert.equal(result.cleanup, 'completed'); assert.deepEqual(Array.from(h.h.message._texts), ['foreign-message']); assert.equal(h.state.stats.fishing_count, 1);
});
test('R07 unavailable real animation data fails before window RNG and preserves the reached prefix', async () => {
  const h = composed(); h.h.root.$dataAnimations = []; const { promise } = await h.start(); h.waiting();
  for (let n = 0; n < 30 && (!h.pending || h.pending.kind === 'dots'); n++) h.pending ? (h.closeMessage(), h.tick()) : h.tick(400);
  assert.equal(h.pending.kind, 'restore'); assert.deepEqual(h.draws, [6, 100]); h.tick(); const result = await promise;
  assert.equal(result.status, 'failed'); assert.equal(result.cleanup, 'completed'); assert.equal(h.state.stats.fishing_battles, 0); assert.equal(result.encounter, undefined);
});
test('T24 replacement live player retains its foreign route and receives no old presentation writes', async () => {
  const h = composed({ settings: { FISHING_BEGIN_COMMON_EVENT: 7 } });
  h.event(7, [c(205, [-1, { list: [c(41, ['OLD_DETACHED', 0]), c(0)], repeat: false, skippable: false, wait: true }]), c(0)]);
  const { operation, promise } = await h.start(); h.tick();
  const foreign = { list: [c(41, ['NEXT_LIVE_PLAYER', 0]), c(0)], repeat: false, skippable: false, wait: true };
  const next = { ...h.h.player, _moveRoute: foreign, _moveRouteIndex: 0, _moveRouteForcing: true, _directionFix: true, _pattern: 2 };
  h.h.root.$gamePlayer = next; operation.cancel(); h.tick(); const result = await promise;
  assert.equal(result.cleanup, 'completed'); assert.equal(next._moveRoute, foreign); assert.equal(next._directionFix, true); assert.equal(next._pattern, 2);
  h.routeTick(); assert.equal(next._characterName, 'NEXT_LIVE_PLAYER'); assert.equal(h.state.stats.fishing_battles, 0);
});
for (const stat of ['fishing_count', 'fishing_battles']) for (const change of ['owner', 'generation', 'content', 'state', 'cancel']) {
  test('atomic parent with production host preserves ' + change + ' at ' + stat + ' and ignores late completion', async () => {
    let h, changed = false;
    h = composed({ beforeCommit(key) {
      if (key !== stat || changed) return; changed = true;
      if (change === 'owner') h.replaceOwner();
      else if (change === 'generation') h.replaceGeneration();
      else if (change === 'content') h.replaceContent({ ...h.content, settings: { FISHING_AUTO_HOOK: true } });
      else if (change === 'state') h.external(game => { game.money = 654; });
      else h.operation.cancel();
    } });
    const { promise } = await h.start();
    if (stat === 'fishing_battles') { h.window(); h.tick(1, ['ok']); h.finish(); }
    const outcome = await promise;
    assert(changed); assert.equal(outcome.status, change === 'cancel' ? 'cancelled' : 'failed'); assert.equal(outcome.encounter, undefined);
    const count = stat === 'fishing_battles' ? 1 : 0;
    assert.equal(h.installs.length, count); assert.equal(h.state.stats.fishing_count, count); assert.equal(h.state.stats.fishing_battles, 0);
    assert.deepEqual(outcome.prefix, { countCommitted: count === 1, battlesCommitted: false });
    if (change === 'state') assert.equal(h.state.money, 654);
    if (count) {
      assert.equal(outcome.cleanup, 'completed'); assert.equal(h.h.focusListeners, 0);
      const previousWrites = h.installs.length, previousAdvances = h.advances.length;
      h.inject({ sample: { monotonicMs: h.now, active: true }, effect: { id: h.advances.find(a => a.effect)?.effect.id, status: 'completed' } });
      h.session.update(); h.session.dispose();
      assert.equal(h.installs.length, previousWrites); assert.equal(h.advances.length, previousAdvances);
    } else assert.equal(h.sessions.length, 0);
  });
}
test('atomic same-semantic replacements with production host retain unrelated state and actual caught source', async () => {
  let h, replacements = 0;
  h = composed({ beforeCommit() {
    h.external(() => {}); h.replaceContent(JSON.parse(JSON.stringify(h.content))); replacements++;
  } });
  h.external(game => { game.money = 432; game.world.visitedMaps = [2, 7]; });
  const { promise } = await h.start(); h.window(); h.tick(1, ['ok']); h.finish(); const outcome = await promise;
  assert.equal(outcome.status, 'completed'); assert.equal(outcome.encounter.type, 'OldRod'); assert.equal(replacements, 2);
  assert.equal(h.state.money, 432); assert.deepEqual(h.state.world.visitedMaps, [2, 7]);
  assert.equal(h.state.stats.fishing_count, 1); assert.equal(h.state.stats.fishing_battles, 1); assert.equal(h.installs.length, 2);
});
