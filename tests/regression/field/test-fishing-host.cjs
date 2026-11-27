'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { runtime, nativeMessages, nativePresentation, nativeMoveRoutes, readFishingHostFacts } = require('../../../experiments/step5/5/fishing-host-fixtures.cjs');
test('T24 production host waits for true message close and animation end; each id ACKs once', () => {
  const h = runtime(), s = h.begin(true);
  s.run({ kind: 'open-message', id: 4 }); h.tick(); assert.equal(h.advances.length, 0);
  h.message.busy = false; h.tick(); assert.equal(h.advances.length, 0, 'window still open');
  h.window.closed = true; h.tick(); assert.deepEqual(h.advances.map(a => a.effect), [{ id: 4, status: 'completed' }]);
  s.run({ kind: 'open-message', id: 4 }); h.tick(); assert.equal(h.advances.length, 2, 'duplicate effect did not create a second acknowledgement');
  s.run({ kind: 'exclamation', animationId: 3, id: 8 }); h.tick(); assert.equal(h.advances.filter(a => a.effect?.id === 8).length, 0);
  h.finishAnimation(); h.tick(); h.tick(); assert.equal(h.advances.filter(a => a.effect?.id === 8).length, 1); s.dispose();
});
for (const key of ['ok', 'cancel']) test('T24 0.500 boundary then 0.510 ' + key + ' beats timeout with required prefix', () => {
  const h = runtime(); h.begin(); h.windowReady(); h.tick(500); assert.equal(h.state.phase, 'bite-window');
  h.tick(10, [key]); assert.equal(h.state.result, 'caught'); assert.deepEqual(h.draws, [6, 100, 6, 100]); assert.equal(h.finish().caught, true);
});
test('T24 0.510 without input escapes and does not consume hook RNG', () => {
  const h = runtime(); h.begin(); h.windowReady(); h.tick(510); assert.equal(h.state.result, 'escaped');
  assert.deepEqual(h.draws, [6, 100, 6]); assert.equal(h.finish().caught, false);
});
test('T24 blur samples the focused prefix, clears actual shared keyboard registry and Input, resume excludes inactive', () => {
  const h = runtime(); h.begin(); h.windowReady();
  h.key('keydown', 'Enter'); assert.equal(h.input.domPressed('use'), true);
  h.fire('blur', 100); const elapsed = h.state.clock.elapsedMs;
  assert.equal(h.state.clock.active, false); assert.equal(h.input.domPressed('use'), false); assert(h.log.includes('input-cleared'));
  h.tick(10000, ['ok']); assert.equal(h.state.clock.elapsedMs, elapsed); assert.equal(h.state.phase, 'bite-window');
  h.fire('focus', 10000); assert.equal(h.state.clock.elapsedMs, elapsed); assert.equal(h.state.clock.active, true);
  h.tick(400); assert.equal(h.state.phase, 'bite-window'); h.tick(10); assert.equal(h.state.result, 'escaped'); h.finish();
  assert.equal(h.focusListeners, 0);
});
test('T24 focused 600ms stall is retained and cannot skip unacknowledged dots', () => {
  const h = runtime(); h.begin(); h.waiting(); const before = h.state.clock.elapsedMs;
  h.tick(600); assert.equal(h.state.pending.kind, 'dots'); assert.equal(h.state.pending.dots, 1);
  assert.equal(h.state.clock.elapsedMs - before, 600); h.tick(600); assert.equal(h.state.pending.dots, 1); assert.deepEqual(h.draws, [6]); h.session.dispose();
});
test('T24 late completion after restore/disposal cannot ACK cancelled effect or a replacement owner', () => {
  const h = runtime(), s = h.begin(true); s.run({ kind: 'exclamation', animationId: 3, id: 1 });
  s.run({ kind: 'restore', surfing: false, interrupted: true, id: 2 }); h.finishAnimation(); h.tick();
  assert.deepEqual(h.advances.map(a => a.effect), [{ id: 2, status: 'completed' }]); s.dispose(); h.tick(); assert.equal(h.advances.length, 1);
  assert.throws(() => h.host.begin({}, () => assert.fail('foreign owner must not start')), /stale-owner/);
});
test('T24 restore preserves preexisting direction lock and fields changed by another owner', () => {
  const h = runtime({ locked: true }); h.begin(true).run({ kind: 'begin-presentation', surfing: false, id: 1 });
  h.session.dispose(); assert.equal(h.player._directionFix, true); assert.equal(h.player._pattern, 1);
  const stale = runtime(); stale.begin(true).run({ kind: 'begin-presentation', surfing: false, id: 1 });
  stale.replace(); stale.player._pattern = 2; stale.player._directionFix = true; stale.session.dispose();
  assert.equal(stale.player._directionFix, true); assert.equal(stale.player._pattern, 2);
});
test('T24 owned common-event and native setupChild chain pump without reserving or updating global interpreters', () => {
  const h = runtime({ beginCommonEventId: 1 });
  h.root.$dataCommonEvents[1] = { list: [{ code: 117, indent: 0, parameters: [2] }, { code: 0, indent: 0, parameters: [] }] };
  h.root.$dataCommonEvents[2] = { list: [{ code: 230, indent: 0, parameters: [2] }, { code: 0, indent: 0, parameters: [] }] };
  h.begin(true).run({ kind: 'begin-presentation', surfing: false, id: 1 });
  h.tick(); assert.equal(h.advances.length, 0); h.tick(); assert.equal(h.advances.length, 0); h.tick();
  assert.deepEqual(h.advances[0].effect, { id: 1, status: 'completed' }); assert.equal(h.log.some(x => String(x).startsWith('pattern:')), false); h.session.dispose();
});
test('T24 native owned common-event message must close before ACK and is cleaned on cancellation', () => {
  for (const cancel of [false, true]) {
    const h = runtime({ beginCommonEventId: 1 });
    h.root.$dataCommonEvents[1] = { list: [{ code: 101, indent: 0, parameters: ['', 0, 0, 2, ''] }, { code: 401, indent: 0, parameters: ['owned event message'] }, { code: 0, indent: 0, parameters: [] }] };
    const s = h.begin(true); s.run({ kind: 'begin-presentation', surfing: false, id: 1 }); h.tick();
    assert.equal(h.advances.length, 0); assert.deepEqual(h.message._texts, ['owned event message']);
    if (cancel) { s.dispose(); assert.equal(h.message.isBusy(), false); assert.equal(h.window.isClosed(), true); }
    else { h.closeMessage(); h.tick(); assert.deepEqual(h.advances[0].effect, { id: 1, status: 'completed' }); s.dispose(); }
  }
});
for (const id of [-1, 42]) test('T24 common-event ' + id + ' uses real built-in frame fallback', () => {
  const h = runtime({ beginCommonEventId: id }); h.begin(true).run({ kind: 'begin-presentation', surfing: false, id: 1 });
  for (let i = 0; i < 4; i++) h.tick(50);
  assert.deepEqual(h.log.filter(x => String(x).startsWith('pattern:')), ['pattern:3', 'pattern:2', 'pattern:1', 'pattern:0', 'pattern:0']);
  assert.equal(h.advances[0].effect.status, 'completed'); h.session.dispose();
});
for (const change of ['map', 'owner']) test('T24 actual ' + change + ' replacement interrupts native event before its next command', () => {
  const h = runtime({ beginCommonEventId: 1 }); h.root.replaceOwner = () => h.replace(); h.root.afterReplacement = false;
  h.root.$dataCommonEvents[1] = { list: [
    { code: 355, indent: 0, parameters: [change === 'map' ? '$gameMap.id = 2;' : 'replaceOwner();'] },
    { code: 355, indent: 0, parameters: ['afterReplacement = true;'] }, { code: 0, indent: 0, parameters: [] },
  ] };
  h.begin(true).run({ kind: 'begin-presentation', surfing: false, id: 3 }); h.tick();
  assert.deepEqual(h.advances[0].effect, { id: 3, status: 'failed' }); assert.equal(h.root.afterReplacement, false); h.session.dispose();
});
test('R1 native BEGIN image route and END transparency execute without a command whitelist', () => {
  const h = runtime({ beginCommonEventId: 1, endCommonEventId: 2 }); nativePresentation(h);
  const route = { list: [{ code: 41, parameters: ['FishingPose', 0] }, { code: 0, parameters: [] }], repeat: false, skippable: true, wait: false };
  h.root.$dataCommonEvents[1] = { list: [{ code: 205, indent: 0, parameters: [-1, route] }, { code: 0, indent: 0, parameters: [] }] };
  h.root.$dataCommonEvents[2] = { list: [{ code: 211, indent: 0, parameters: [1] }, { code: 0, indent: 0, parameters: [] }] };
  const s = h.begin(true); s.run({ kind: 'begin-presentation', surfing: false, id: 1 }); h.tick();
  assert.equal(h.player.route, route); assert.equal(h.advances[0].effect.status, 'completed');
  s.run({ kind: 'end-presentation', surfing: false, id: 2 }); h.tick(); assert.equal(h.player._transparent, false); assert.equal(h.advances.at(-1).effect.status, 'completed'); s.dispose();
});
for (const cancel of [false, true]) test('R1 native player image route pumps normally and ' + (cancel ? 'owned cancellation restores previous route' : 'waits for actual route end'), () => {
  const h = runtime({ beginCommonEventId: 1 }); nativeMoveRoutes(h); const previous = h.player._moveRoute;
  const route = { list: [{ code: 41, parameters: ['FishingPose', 0] }, { code: 0, parameters: [] }], repeat: false, skippable: false, wait: true };
  h.root.$dataCommonEvents[1] = { list: [{ code: 205, indent: 0, parameters: [-1, route] }, { code: 0, indent: 0, parameters: [] }] };
  const s = h.begin(true); s.run({ kind: 'begin-presentation', surfing: false, id: 1 }); h.tick(); assert.equal(h.advances.length, 0);
  h.player.updateRoutineMove(); h.tick(); assert.equal(h.player._characterName, 'FishingPose'); assert.equal(h.advances.length, 0);
  if (cancel) { s.dispose(); assert.equal(h.player._moveRouteForcing, false); assert.equal(h.player._moveRoute, previous); assert.equal(h.advances.length, 0); }
  else { h.player.updateRoutineMove(); h.tick(); assert.equal(h.player._moveRoute, previous); assert.deepEqual(h.advances.at(-1).effect, { id: 1, status: 'completed' }); s.dispose(); }
});
test('R1 stale route cancellation never overwrites another owner route', () => {
  const h = runtime({ beginCommonEventId: 1 }); nativeMoveRoutes(h);
  const route = { list: [{ code: 15, parameters: [10] }, { code: 0, parameters: [] }], repeat: false, skippable: false, wait: true };
  h.root.$dataCommonEvents[1] = { list: [{ code: 205, indent: 0, parameters: [-1, route] }] };
  const s = h.begin(true); s.run({ kind: 'begin-presentation', surfing: false, id: 1 }); h.tick();
  const foreign = { list: [{ code: 0, parameters: [] }], wait: false }; h.player.forceMoveRoute(foreign); h.replace(); s.dispose();
  assert.equal(h.player._moveRoute, foreign); assert.equal(h.player._moveRouteForcing, true);
});
for (const change of ['owner', 'map', 'scene']) for (const action of ['restore', 'dispose']) test('R3 ' + action + ' revokes its native player route after ' + change + ' replacement', () => {
  const h = runtime({ beginCommonEventId: 1 }); nativeMoveRoutes(h);
  const fields = ['_moveRoute', '_moveRouteIndex', '_moveRouteForcing', '_originalMoveRoute', '_originalMoveRouteIndex', '_waitCount'];
  const previous = fields.map(key => h.player[key]);
  const route = { list: [{ code: 41, parameters: ['LATE_OLD_FISHING', 0] }, { code: 0, parameters: [] }], repeat: false, skippable: false, wait: true };
  h.root.$dataCommonEvents[1] = { list: [{ code: 205, indent: 0, parameters: [-1, route] }, { code: 0, indent: 0, parameters: [] }] };
  const s = h.begin(true); s.run({ kind: 'begin-presentation', surfing: false, id: 1 }); h.tick();
  if (change === 'owner') h.replace(); else if (change === 'map') h.map.id = 2; else h.root.SceneManager._scene = {};
  if (action === 'restore') { s.run({ kind: 'restore', surfing: false, interrupted: true, id: 2 }); h.tick(); assert.deepEqual(h.advances.at(-1).effect, { id: 2, status: 'completed' }); }
  else s.dispose();
  assert.deepEqual(fields.map(key => h.player[key]), previous);
  if (h.player.isMoveRouteForcing()) h.player.updateRoutineMove();
  assert.notEqual(h.player._characterName, 'LATE_OLD_FISHING');
  assert.equal(h.advances.some(a => a.effect?.id === 1), false); s.dispose();
});
for (const changed of ['route', 'original', 'originalIndex', 'forcing', 'player']) test('R3 stale cleanup preserves replacement ' + changed + ' identity', () => {
  const h = runtime({ beginCommonEventId: 1 }); nativeMoveRoutes(h);
  const route = { list: [{ code: 41, parameters: ['OLD_FISHING', 0] }, { code: 0, parameters: [] }], repeat: false, skippable: false, wait: true };
  h.root.$dataCommonEvents[1] = { list: [{ code: 205, indent: 0, parameters: [-1, route] }, { code: 0, indent: 0, parameters: [] }] };
  const s = h.begin(true); s.run({ kind: 'begin-presentation', surfing: false, id: 1 }); h.tick(); h.replace();
  if (changed === 'route') h.player.forceMoveRoute({ list: [{ code: 41, parameters: ['SUCCESSOR', 0] }, { code: 0, parameters: [] }], repeat: false, skippable: false, wait: true });
  else if (changed === 'original') h.player._originalMoveRoute = { list: [] };
  else if (changed === 'originalIndex') h.player._originalMoveRouteIndex = 37;
  else if (changed === 'forcing') h.player._moveRouteForcing = false;
  else h.root.$gamePlayer = { ...h.player, _moveRoute: { list: [] }, _pattern: 9 };
  const fields = ['_moveRoute', '_moveRouteIndex', '_moveRouteForcing', '_originalMoveRoute', '_originalMoveRouteIndex', '_waitCount', '_pattern', '_directionFix', '_stepAnime', '_walkAnime'];
  const player = h.root.$gamePlayer, previous = fields.map(key => player[key]);
  s.dispose(); assert.equal(h.root.$gamePlayer, player); assert.deepEqual(fields.map(key => player[key]), previous);
  if (changed === 'route') { h.player.updateRoutineMove(); assert.equal(h.player._characterName, 'SUCCESSOR'); }
});
test('T24 failed animation retains only reached RNG prefix, and no-table suppresses bite draw', () => {
  const h = runtime(); h.root.$dataAnimations = []; h.begin(); h.waiting();
  while (h.state.phase === 'waiting') { h.tick(400); if (h.state.pending?.kind === 'dots') { h.closeMessage(); h.tick(); } }
  assert.equal(h.state.phase, 'restoring'); assert.deepEqual(h.draws, [6, 100]); assert.equal(h.finish().reason, 'host-failed');
  const empty = runtime(); empty.begin(false, { allowBite: false }); empty.waiting();
  while (empty.state.phase === 'waiting') { empty.tick(400); if (empty.state.pending?.kind === 'dots') { empty.closeMessage(); empty.tick(); } }
  assert.deepEqual(empty.draws, [6]); empty.finish();
});
test('T24 accelerated and autoHook use their exact production rules prefixes', () => {
  const fast = runtime(); fast.begin(false, { rod: 3, accelerated: true }); fast.windowReady(); fast.tick(10, ['ok']);
  assert.deepEqual(fast.draws, [6, 6, 100, 6, 100]); assert.equal(fast.finish().encounterType, 'SuperRod');
  const auto = runtime(); auto.begin(false, { rod: 2, autoHook: true }); auto.windowReady(); auto.tick(10000);
  assert.equal(auto.state.phase, 'bite-window'); auto.tick(10, ['cancel']); assert.deepEqual(auto.draws, [6, 100, 6]);
  assert.equal(auto.finish().encounterType, 'GoodRod'); assert.equal(auto.log.includes('message:钓上来了！'), false);
});
test('T24 waiting input retains only the segment RNG and no bite/hook draws', () => {
  const h = runtime(); h.begin(); h.waiting(); h.tick(1, ['ok']); assert.equal(h.state.result, 'no-bite');
  assert.deepEqual(h.draws, [6]); h.finish();
});
test('T24 beginning event failure and occupied message fail before any RNG', () => {
  const event = runtime({ beginCommonEventId: 1 }); event.root.$dataCommonEvents[1] = { list: [{ code: 355, parameters: ['throw new Error("native-event-failed");'], indent: 0 }] };
  event.begin(); event.tick(); assert.deepEqual(event.draws, []); assert.equal(event.finish().reason, 'host-failed');
  const occupied = runtime(); occupied.begin(); occupied.message.add('other owner'); occupied.tick(200);
  assert.deepEqual(occupied.draws, []); assert.equal(occupied.state.phase, 'restoring');
  occupied.tick(); assert.equal(occupied.state.completion.cleanupFailed, false); assert.deepEqual(occupied.message._texts, ['other owner']);
});
for (const kind of ['choice', 'number', 'item']) for (const action of ['restore', 'dispose']) test('R2 native ' + kind + ' ' + action + ' closes owned input and invalidates retained completion', () => {
  const h = runtime({ beginCommonEventId: 1 }), ui = nativeMessages(h);
  // Native setupChoices requires its choices array to carry the installed MZ clone extension.
  const vm = require('node:vm');
  const parameters = kind === 'choice' ? '["yes","no"],-2,0,2,0' : kind === 'number' ? '17,2' : '18,2';
  h.root.$dataCommonEvents[1] = vm.runInContext('({list:[{code:' + (kind === 'choice' ? 102 : kind === 'number' ? 103 : 104) + ',indent:0,parameters:[' + parameters + ']},{code:0,indent:0,parameters:[]}]})', h.root);
  const s = h.begin(true); s.run({ kind: 'begin-presentation', surfing: false, id: 1 }); h.tick(); h.window.startInput();
  const child = ui[kind], late = (kind === 'choice' ? child.callOkHandler : kind === 'number' ? child.processOk : child.onOk).bind(child);
  assert.equal(child.active, true); assert.equal(child.opened, true);
  if (action === 'restore') { s.run({ kind: 'restore', surfing: false, interrupted: true, id: 2 }); h.tick(); assert.equal(h.advances.at(-1).effect.status, 'completed'); }
  s.dispose(); assert.equal(child.active, false); assert.equal(child.opened, false); assert.equal(h.message.isBusy(), false); assert.equal(h.window._textState, null);
  const next = h.begin(true); next.run({ kind: 'open-message', id: 10 }); late();
  assert.equal(h.message.isBusy(), true, 'retained old input callback must not terminate successor message'); assert.equal(ui.values.size, 0); next.dispose();
});
for (const kind of ['choice', 'number', 'item']) test('R2 native ' + kind + ' completes normally and keeps its native result', () => {
  const h = runtime({ beginCommonEventId: 1 }), ui = nativeMessages(h), vm = require('node:vm');
  const params = kind === 'choice' ? '["yes"],-2,0,2,0' : kind === 'number' ? '17,2' : '18,2';
  h.root.$dataCommonEvents[1] = vm.runInContext('({list:[{code:' + (kind === 'choice' ? 102 : kind === 'number' ? 103 : 104) + ',indent:0,parameters:[' + params + ']},{code:0,indent:0,parameters:[]}]})', h.root);
  h.begin(true).run({ kind: 'begin-presentation', surfing: false, id: 1 }); h.tick(); h.window.startInput();
  const child = ui[kind]; child.deactivate();
  if (kind === 'choice') child.callOkHandler(); else if (kind === 'number') { child._number = 42; child.processOk(); } else child.onOk();
  assert.equal(h.message.isBusy(), false); h.tick(); assert.deepEqual(h.advances.at(-1).effect, { id: 1, status: 'completed' });
  if (kind === 'number') assert.equal(ui.values.get(17), 42); if (kind === 'item') assert.equal(ui.values.get(18), 7); h.session.dispose();
});
test('R2 replacement message and its active child are untouched by stale session disposal', () => {
  const h = runtime({ beginCommonEventId: 1 }), ui = nativeMessages(h), vm = require('node:vm');
  h.root.$dataCommonEvents[1] = vm.runInContext('({list:[{code:102,indent:0,parameters:[["old"],-2,0,2,0]},{code:0,indent:0,parameters:[]}]})', h.root);
  const s = h.begin(true); s.run({ kind: 'begin-presentation', surfing: false, id: 1 }); h.tick(); h.window.startInput();
  const late = ui.choice.callOkHandler.bind(ui.choice); h.replace(); h.message.clear(); h.message.add('new owner');
  h.message.setChoices(['new choice'], 0, -2); const newCallback = () => {}; h.message.setChoiceCallback(newCallback);
  s.dispose(); assert.deepEqual(Array.from(h.message._texts), ['new owner']); assert.equal(ui.choice.active, true); assert.equal(ui.choice.opened, true);
  late(); assert.equal(h.message.isBusy(), true); assert.equal(h.message._choiceCallback, newCallback);
  ui.choice.deactivate(); ui.choice.callOkHandler(); assert.equal(h.message.isBusy(), false, 'ordinary successor input retains its native handler');
});
for (const code of [103, 104]) test('R1/R2 native command101 combined input ' + code + ' is owned and cancelled consistently', () => {
  const h = runtime({ beginCommonEventId: 1 }), ui = nativeMessages(h);
  h.root.$dataCommonEvents[1] = { list: [{ code: 101, indent: 0, parameters: ['', 0, 0, 2, ''] }, { code: 401, indent: 0, parameters: ['combined input'] }, { code, indent: 0, parameters: [17, 2] }, { code: 0, indent: 0, parameters: [] }] };
  h.begin(true).run({ kind: 'begin-presentation', surfing: false, id: 1 }); h.tick(); h.window.startInput();
  const child = code === 103 ? ui.number : ui.item; assert.equal(child.active, true); h.session.dispose(); assert.equal(child.active, false); assert.equal(child.opened, false); assert.equal(ui.values.size, 0);
});
test('R2 native scrolling-message cancellation releases its display and invalidates retained termination', () => {
  const h = runtime({ beginCommonEventId: 1 }), ui = nativeMessages(h);
  h.root.$dataCommonEvents[1] = { list: [{ code: 105, indent: 0, parameters: [2, false] }, { code: 405, indent: 0, parameters: ['owned scroll'] }, { code: 0, indent: 0, parameters: [] }] };
  h.begin(true).run({ kind: 'begin-presentation', surfing: false, id: 1 }); h.tick();
  ui.scroll._text = 'owned scroll'; ui.scroll.hidden = false; const late = ui.scroll.terminateMessage.bind(ui.scroll);
  h.session.dispose(); assert.equal(ui.scroll._text, null); assert.equal(ui.scroll.hidden, true);
  const next = h.begin(true); next.run({ kind: 'open-message', id: 10 }); late(); assert.equal(h.message.isBusy(), true); next.dispose();
});
test('T24 paused effects do not ACK until resume; a restore can ACK while inactive or stale', () => {
  const h = runtime(), s = h.begin(true); s.run({ kind: 'exclamation', animationId: 3, id: 1 });
  h.fire('blur', 10); h.finishAnimation(); h.tick(500); assert.equal(h.advances.filter(a => a.effect).length, 0);
  h.fire('focus', 500); h.tick(); assert.deepEqual(h.advances.filter(a => a.effect).map(a => a.effect), [{ id: 1, status: 'completed' }]);
  h.fire('blur'); h.replace(); s.run({ kind: 'restore', surfing: false, interrupted: true, id: 2 }); h.tick();
  assert.deepEqual(h.advances.at(-1).effect, { id: 2, status: 'completed' }); s.dispose();
});
test('T24 actual owner change during owned event cannot complete successfully', () => {
  const h = runtime({ beginCommonEventId: 1 }); h.root.$dataCommonEvents[1] = { list: [{ code: 230, indent: 0, parameters: [5] }, { code: 0, indent: 0, parameters: [] }] };
  h.begin(true).run({ kind: 'begin-presentation', surfing: false, id: 1 }); h.tick(); h.replace(); h.tick();
  assert.equal(h.advances.at(-1).interrupt, 'scene-closed'); assert.equal(h.advances.some(a => a.effect?.status === 'completed'), false); h.session.dispose();
});
test('T24 restore never clears another producer message appended during our presentation', () => {
  const h = runtime(), s = h.begin(true); s.run({ kind: 'open-message', id: 1 }); h.message.add('foreign');
  s.run({ kind: 'restore', surfing: false, interrupted: true, id: 2 }); h.tick();
  assert.deepEqual(h.message._texts, ['\\^', 'foreign']); s.dispose();
});
test('T10 actual facing coordinates, current outgoing edge, unknown facts and environment are checked separately', () => {
  const h = runtime();
  let facts = readFishingHostFacts(h.root, tag => ({ fishable: tag === 7, environment: 'stillwater' }), () => true);
  assert.deepEqual(facts.facingFishable, { status: 'value', value: true }); assert.deepEqual(facts.currentExitPassable, { status: 'value', value: true });
  assert.deepEqual(facts.facingEnvironment, { status: 'value', value: 'stillwater' }); assert.deepEqual(facts.surfing, { status: 'value', value: true });
  assert(h.log.some(x => Array.isArray(x) && x[0] === 'terrain' && x[1] === 6 && x[2] === 6));
  assert(h.log.some(x => Array.isArray(x) && x[0] === 'passable' && x[1] === 5 && x[2] === 6 && x[3] === 6));
  facts = readFishingHostFacts(h.root, () => undefined); assert.equal(facts.facingFishable.status, 'unavailable'); assert.equal(facts.surfing.status, 'unavailable');
  facts = readFishingHostFacts(h.root, () => ({ fishable: 'yes', environment: 'Water' }), () => 1);
  assert.equal(facts.facingFishable.status, 'invalid'); assert.equal(facts.facingEnvironment.status, 'invalid'); assert.equal(facts.surfing.status, 'invalid');
});
