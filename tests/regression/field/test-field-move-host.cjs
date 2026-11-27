'use strict';
require('../../../experiments/step5/5/regular-field-action-test-runtime.cjs').prepare('native');
// E2 leaf consumer tests: formal-derived expectations + actual MZ/Reactor object methods in a fake runtime.
// PF_MZ_RUNTIME_OBJECTS is required for isolated trees without the ignored, pinned runtime payload.
require('../../../scripts/tests/ts-source-loader.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const rootPath = path.resolve(__dirname, '../../..');
const runtimePath = process.env.PF_MZ_RUNTIME_OBJECTS || path.join(rootPath, 'js/reactor_objects.js');
const runtimeSource = fs.readFileSync(runtimePath, 'utf8');
const value = value => ({ status: 'value', value });
const completed = { status: 'completed' };
let createFieldMoveHost, planFieldMove, createFieldFactsObservation;
test.before(async () => {
  ({ createFieldMoveHost } = await import(pathToFileURL(path.join(rootPath, 'src/plugins/world/field-move-host.ts')).href));
  ({ createFieldFactsObservation } = await import(pathToFileURL(path.join(rootPath, 'src/plugins/world/field-facts-observation-mz.ts')).href));
  ({ planFieldMove } = await import(pathToFileURL(path.join(rootPath, 'src/framework/rules/field-moves.ts')).href));
});

function fixture(moveId = 'cut') {
  const trace = [], events = [], maskState = { valid: true, expanded: false, ticks: 0 };
  const root = { Utils: {}, PluginManager: {}, BattleManager: {}, Input: {}, TouchInput: {}, $dataSystem: {}, console,
    ImageManager: { isObjectCharacter: () => false, isBigCharacter: () => false },
    AudioManager: { playSe: sound => trace.push(['se', sound.name]), playBgm: bgm => trace.push(['bgm', bgm.name]), playBgs: () => {}, mapBgmObject: data => data.bgm } };
  vm.createContext(root);
  vm.runInContext('Number.prototype.mod = function(n) { return ((this % n) + n) % n; }; Array.prototype.clone = function() { return this.slice(0); };', root);
  vm.runInContext(runtimeSource, root, { filename: runtimePath });
  const map = Object.create(root.Game_Map.prototype), player = Object.create(root.Game_Player.prototype), event = Object.create(root.Game_Event.prototype);
  const initialize = (character, x, y) => Object.assign(character, { _x: x, _y: y, _realX: x, _realY: y, _jumpCount: 0, _jumpPeak: 0, _moveSpeed: 4, _direction: 6, _directionFix: false, _through: false, _priorityType: 1, _characterName: 'fixture', _characterIndex: 0, _tileId: 0, _walkAnime: false, _stepAnime: false, _pattern: 0, _stopCount: 0 });
  initialize(player, 3, 3); initialize(event, 4, 3);
  player._followers = { jumpAll: () => trace.push(['followers-jump']), refresh() {}, isSomeoneCollided: () => false };
  player._vehicleType = 'walk'; player.makeEncounterCount = () => { throw Error('native encounter RNG forbidden'); };
  event._mapId = 7; event._eventId = 1; event._erased = false; event.refresh = () => trace.push(['event-refresh']);
  event.checkEventTriggerTouchFront = () => {};
  events[1] = event;
  Object.assign(map, { _mapId: 7, _events: events, _tileEvents: [], _tilesetId: 1, _vehicles: [{ posNt: () => false }, { posNt: () => false }, { posNt: () => false }] });
  root.$dataMap = { width: 8, height: 8, scrollType: 0, data: Array(8 * 8 * 6).fill(0), events: [null, { id: 1, name: moveId === 'rocksmash' ? 'xSMASHROCKx' : moveId === 'strength' ? 'xSTRENGTHBOULDERx' : 'xCutTreex', x: 4, y: 3 }], autoplayBgm: true, bgm: { name: 'route' }, autoplayBgs: false };
  root.$dataTilesets = [null, { flags: [0] }]; root.$gameMap = map; root.$gamePlayer = player;
  root.$gameParty = { leader: () => null, members: () => [] }; root.$gameScreen = new root.Game_Screen();
  const startFlash = root.$gameScreen.startFlash, runtimeArray = vm.runInContext('value => Array.from(value)', root);
  root.$gameScreen.startFlash = function(color, duration) { return startFlash.call(this, runtimeArray(color), duration); };
  root.Scene_Map = function Scene_Map() {}; root.SceneManager = { _scene: new root.Scene_Map() };
  const state = { flashUsed: false, surfing: false, strengthUsed: false, endingSurf: false, surfBase: null, stats: {}, resets: [], records: [], encounters: [] };
  let current = true, recordAvailable = true;
  const assertCurrent = () => { if (!current) throw Error('fixture-owner-stale'); };
  const mask = { mapId: 7, valid: () => maskState.valid, expand(guard) { guard(); trace.push(['expand-request']); maskState.ticks = 3; }, expanded: () => maskState.expanded };
  const ports = {
    factsObservation: createFieldFactsObservation(root, require('node:util').types.isProxy, [{ owner: maskState, path: [] }]),
    metadata: () => value({ darkMap: true, alwaysBicycle: false }),
    terrain: () => value({ canSurf: true, waterfall: false, waterfallCrest: false }),
    surfPassage: input => value(input.map === map && input.player === player && input.to.mapId === 7),
    darkMask: () => value(mask), sound: name => value({ name, volume: 90, pitch: 100, pan: 0 }),
    redScreen: () => value({ color: [255, 0, 0, 120], durationFrames: 3 }),
    animate: async (move, member, guard) => { guard(); trace.push(['animate', move, member]); return true; },
    text: async (kind, move, guard) => { guard(); trace.push([kind, move]); return true; },
    cancelVehicles: async (p, guard) => { guard(); trace.push(['cancel-vehicles']); p._vehicleType = 'walk'; p.setThrough(false); return completed; },
    projectSurfing: async (surfing, p, guard) => { guard(); trace.push(['project-surfing', surfing]); p.setImage(surfing ? 'surf-fixture' : 'walk-fixture', 0); return completed; },
    nextFrame: async guard => {
      guard(); trace.push(['frame']);
      for (const character of [player, ...events.filter(Boolean)]) {
        if (character.isJumping()) character.updateJump();
        else if (character.isMoving()) character.updateMove();
      }
      if (root.$gameScreen._flashDuration > 0) root.$gameScreen.updateFlash();
      if (maskState.ticks > 0 && --maskState.ticks === 0) maskState.expanded = true;
      guard();
    },
  };
  const operation = {
    assertCurrent, surfRuntime: () => ({ surfing: state.surfing, endingSurf: state.endingSurf, surfBase: state.surfBase }),
    localRecordsAvailable: () => value(recordAvailable),
    async applyStage(stage, observation) {
      assertCurrent(); trace.push([stage.kind === 'host' ? stage.action : stage.kind, stage]);
      if (stage.kind === 'commit') {
        Object.assign(state, stage.world, stage.local);
        for (const s of stage.stats || []) state.stats[s.counter] = (state.stats[s.counter] || 0) + s.delta;
      } else if (stage.kind === 'runtime') {
        if ('surfBase' in stage) state.surfBase = stage.surfBase;
        if ('endingSurf' in stage) state.endingSurf = stage.endingSurf;
      } else if (stage.kind === 'reset-encounters') state.resets.push(stage.reason);
      else if (stage.kind === 'request-encounter') state.encounters.push(stage.source);
      else if (stage.kind === 'host') state.records.push(observation);
      return completed;
    },
  };
  const host = createFieldMoveHost(root, ports);
  const input = (entry = 'party') => ({ moveId, entry, memberId: 'member', context: {
    party: [{ id: 'member', species: 'fixture', form: 0, isEgg: false, hp: 0, moves: [{ id: moveId, pp: 0, maxpp: 10 }] }],
    badges: Array(8).fill(true), world: { flashUsed: state.flashUsed, surfing: state.surfing, companions: [], weather: { type: 'None', strength: 0, durationFrames: 0 } },
    local: { strengthUsed: state.strengthUsed }, facts: host.facts(),
  } });
  const plan = entry => { const p = planFieldMove(input(entry)); assert.equal(p.status, 'planned', JSON.stringify(p)); return p; };
  return { root, map, player, event, events, ports, host, operation, state, trace, mask, maskState, input, plan,
    stale: () => { current = false; }, recordAvailable: flag => { recordAvailable = flag; } };
}

test('host reads current actual MZ methods and typed capabilities without inventing terrain tags', () => {
  const f = fixture('surf'), observed = [];
  f.ports.terrain = p => { observed.push(p); return value({ canSurf: false, waterfall: true, waterfallCrest: false }); };
  const facts = f.host.facts();
  assert.deepEqual(facts.facingPoint, value({ mapId: 7, x: 4, y: 3 }));
  assert.equal(facts.direction.value, 6); assert.equal(facts.facingEvent.value.eventId, 1);
  assert.deepEqual(facts.facingTerrain, value({ canSurf: false, waterfall: true, waterfallCrest: false }));
  assert.deepEqual(observed, [{ mapId: 7, x: 4, y: 3 }]);
  delete f.ports.terrain; assert.equal(f.host.facts().facingTerrain.status, 'unavailable');
  delete f.ports.surfPassage; assert.equal(f.host.facts().facingPassable.status, 'unavailable');
});
test('facts retain checked absence/provider failure/invalid values and never execute fact accessors', () => {
  const f = fixture(); let reads = 0;
  for (const status of ['absent', 'unavailable', 'invalid']) {
    f.ports.metadata = () => ({ status, ...(status === 'absent' ? {} : { reason: 'fixture' }) });
    assert.equal(f.host.facts().mapMetadata.status, status);
  }
  for (const invalid of [true, {}, { status: 'value', value: { canSurf: 1, waterfall: false, waterfallCrest: false } }, { status: 'unavailable', reason: 0 }]) {
    f.ports.terrain = () => invalid; assert.equal(f.host.facts().facingTerrain.status, 'invalid');
  }
  f.ports.terrain = () => Object.defineProperty({}, 'status', { enumerable: true, get() { reads++; return 'absent'; } });
  assert.equal(f.host.facts().facingTerrain.status, 'invalid'); assert.equal(reads, 0);
  f.ports.terrain = () => { throw Error('provider'); }; assert.match(f.host.facts().facingTerrain.reason, /provider/);
});
test('ordinary facing lookup skips erased/jumping/over-trigger events and exposes absent truthfully', () => {
  for (const mode of ['erased', 'jumping', 'priority']) {
    const f = fixture();
    if (mode === 'erased') f.event._erased = true;
    if (mode === 'jumping') f.event._jumpCount = 2;
    if (mode === 'priority') f.event._priorityType = 0;
    assert.equal(f.host.facts().facingEvent.status, 'absent');
  }
});
test('a checked map edge is absent geometry, while a malformed native boolean remains invalid', () => {
  const f = fixture(); f.player._x = f.player._realX = 7;
  const facts = f.host.facts();
  for (const key of ['facingPoint', 'facingEvent', 'facingTerrain', 'facingPassable']) assert.equal(facts[key].status, 'absent', key);
  f.player._x = f.player._realX = 3; f.event.isNormalPriority = () => 'true';
  assert.equal(f.host.facts().facingEvent.status, 'invalid');
});
for (const move of ['cut', 'rocksmash']) {
  test(`T25 ${move}: menu uses actual erase then guarded registration, no direct confirmation`, async () => {
    const f = fixture(move), result = await f.host.run(f.plan(), f.operation);
    assert.equal(result.status, 'completed'); assert.equal(f.event._erased, true);
    assert.equal(f.state.stats[move === 'cut' ? 'cut_count' : 'rock_smash_count'], 1);
    assert.equal(f.state.records[0].kind, 'erased-event'); assert.equal(f.state.records[0].target.eventId, 1);
    assert.equal(f.trace.some(x => x[0] === 'confirm-direct'), false);
    assert.deepEqual(f.state.encounters, move === 'rocksmash' ? ['rock-smash'] : []);
    const names = f.trace.map(x => x[0]); assert.ok(names.indexOf('event-refresh') < names.indexOf('register-erasure'));
  });
  test(`T25 ${move}: direct confirmation cancel has no stat/event/encounter writes`, async () => {
    const f = fixture(move); f.ports.text = () => false;
    const result = await f.host.run(f.plan('direct'), f.operation);
    assert.equal(result.status, 'cancelled'); assert.deepEqual(f.state.stats, {}); assert.equal(f.event._erased, false);
    assert.equal(f.state.records.length, 0); assert.equal(f.state.encounters.length, 0);
  });
}
test('optional animation false uses one used-move text; missing resource stops at its actual prefix', async () => {
  const f = fixture(); f.ports.animate = () => false;
  assert.equal((await f.host.run(f.plan(), f.operation)).status, 'completed');
  assert.equal(f.trace.filter(x => x[0] === 'used-move').length, 1);
  const g = fixture(); g.ports.sound = () => ({ status: 'absent' });
  const result = await g.host.run(g.plan(), g.operation);
  assert.equal(result.status, 'unavailable'); assert.equal(g.state.stats.cut_count, 1); assert.equal(g.event._erased, false);
});
test('stage negative controls: a request-only erasure or missing App ACK cannot advance', async () => {
  const f = fixture('rocksmash'); f.event.erase = () => { f.trace.push(['erase-request-only']); };
  assert.equal((await f.host.run(f.plan(), f.operation)).status, 'failed');
  assert.equal(f.state.records.length, 0); assert.deepEqual(f.state.encounters, []);
  const g = fixture(); const apply = g.operation.applyStage;
  g.operation.applyStage = async (stage, observation) => { const result = await apply(stage, observation); return stage.kind === 'host' ? undefined : result; };
  assert.equal((await g.host.run(g.plan(), g.operation)).status, 'failed'); assert.equal(g.event._erased, true);
});
test('legal sounds are required and bad paths/NaN values are invalid before native request', async () => {
  for (const resource of [{ name: '../bad', volume: 90, pitch: 100, pan: 0 }, { name: 'ok', volume: NaN, pitch: 100, pan: 0 }]) {
    const f = fixture(); f.ports.sound = () => value(resource);
    assert.equal((await f.host.run(f.plan(), f.operation)).status, 'invalid');
    assert.equal(f.trace.some(x => x[0] === 'se'), false);
  }
});
for (const failure of ['mask-absent', 'mask-invalid', 'animation-false', 'text-false', 'mask-replaced-in-text']) {
  test(`T18 Flash precommit ${failure} keeps flash/stat untouched`, async () => {
    const f = fixture('flash'), plan = f.plan();
    if (failure === 'mask-absent') f.ports.darkMask = () => ({ status: 'absent' });
    if (failure === 'mask-invalid') f.maskState.valid = false;
    if (failure === 'animation-false') f.ports.animate = () => false;
    if (failure === 'text-false') f.ports.text = () => false;
    if (failure === 'mask-replaced-in-text') f.ports.text = () => { f.ports.darkMask = () => value({ ...f.mask }); return true; };
    assert.notEqual((await f.host.run(plan, f.operation)).status, 'completed');
    assert.equal(f.state.flashUsed, false); assert.equal(f.state.stats.flash_count, undefined);
  });
}
test('T18 Flash expansion request waits for actual expanded condition after atomic App commit', async () => {
  const f = fixture('flash'); const result = await f.host.run(f.plan(), f.operation);
  assert.equal(result.status, 'completed'); assert.equal(f.state.flashUsed, true); assert.equal(f.state.stats.flash_count, 1);
  assert.equal(f.maskState.expanded, true); assert.equal(f.trace.filter(x => x[0] === 'frame').length, 3);
  const names = f.trace.map(x => x[0]); assert.ok(names.indexOf('commit') < names.indexOf('expand-request'));
});
test('T18 Flash expansion exception keeps committed flag/count and reports failure', async () => {
  const f = fixture('flash'); f.mask.expand = () => { throw Error('expand-runtime-failure'); };
  const result = await f.host.run(f.plan(), f.operation);
  assert.equal(result.status, 'failed'); assert.match(result.reason, /expand-runtime/);
  assert.equal(f.state.flashUsed, true); assert.equal(f.state.stats.flash_count, 1);
});
test('Flash expansion cancellation preserves commit and cannot finish from a late frame ACK', async () => {
  const f = fixture('flash'); let release;
  f.ports.nextFrame = () => new Promise(resolve => { release = resolve; });
  const running = f.host.run(f.plan(), f.operation);
  while (!release) await Promise.resolve();
  assert.equal(f.state.flashUsed, true); assert.equal(f.state.stats.flash_count, 1); assert.equal(f.maskState.expanded, false);
  f.stale(); f.maskState.expanded = true; release();
  assert.equal((await running).status, 'cancelled'); assert.equal(f.state.stats.flash_count, 1);
});
test('T25 Strength activation is separate from strict push, actual displacement, snapshot and final wait', async () => {
  const f = fixture('strength');
  assert.equal((await f.host.run(f.plan(), f.operation)).status, 'completed');
  assert.equal(f.state.strengthUsed, true); assert.equal(f.state.stats.strength_push_count, undefined);
  const result = await f.host.pushStrength({ strengthUsed: true, playSound: true }, f.operation);
  assert.equal(result.status, 'completed'); assert.equal(f.event.x, 5); assert.equal(f.event.isMoving(), false);
  assert.equal(f.state.stats.strength_push_count, 1);
  assert.deepEqual(f.state.records[0], { kind: 'event-position', position: { mapId: 7, eventId: 1, x: 5, y: 3, direction: 6, through: false } });
  assert.ok(f.trace.some(x => x[0] === 'frame')); assert.ok(f.trace.some(x => x[0] === 'se' && x[1] === 'strength-push'));
});
for (const blockedEnd of ['source', 'destination']) {
  test(`Strength strict ${blockedEnd} all-direction bit refuses even ordinary entering direction passes`, async () => {
    const f = fixture('strength');
    f.root.$dataTilesets[1].flags[1] = 1; // Down is blocked; moving right by ordinary native canPass is allowed.
    const x = blockedEnd === 'source' ? 4 : 5; f.root.$dataMap.data[(3 * 8 + 3) * 8 + x] = 1;
    assert.equal(f.event.canPass(4, 3, 6), true);
    const result = await f.host.pushStrength({ strengthUsed: true, playSound: true }, f.operation);
    assert.equal(result.status, 'refused'); assert.deepEqual(f.state.stats, {}); assert.equal(f.event.x, 4);
  });
}
test('Strength boundary precedes own-through, failed ordinary displacement retains count/unchanged record', async () => {
  const f = fixture('strength'); f.player._x = f.player._realX = 6; f.event._x = f.event._realX = 7; f.event._through = true;
  assert.equal((await f.host.pushStrength({ strengthUsed: true, playSound: true }, f.operation)).status, 'refused');
  assert.deepEqual(f.state.stats, {});
  const g = fixture('strength');
  g.event.canPass = () => false; // Strict passage passed; the actual ordinary step has its own later gate.
  assert.equal((await g.host.pushStrength({ strengthUsed: true, playSound: true }, g.operation)).status, 'completed');
  assert.equal(g.event.x, 4); assert.equal(g.state.stats.strength_push_count, 1); assert.equal(g.state.records[0].position.x, 4);
  assert.equal(g.trace.some(x => x[0] === 'se'), false); assert.equal(g.trace.some(x => x[0] === 'frame'), false);
});
test('Strength absent local record skips snapshot, disabled sound still waits for actual motion', async () => {
  const f = fixture('strength'); f.recordAvailable(false);
  assert.equal((await f.host.pushStrength({ strengthUsed: true, playSound: false }, f.operation)).status, 'completed');
  assert.equal(f.state.records.length, 0); assert.equal(f.event.isMoving(), false); assert.ok(f.trace.some(x => x[0] === 'frame'));
  assert.equal(f.trace.some(x => x[0] === 'se'), false);
});
test('Strength actual native character collision refuses before count or ordinary move', async () => {
  const f = fixture('strength'), blocker = Object.create(f.event);
  Object.assign(blocker, { _eventId: 2, _x: 5, _realX: 5, _y: 3, _realY: 3 });
  f.events[2] = blocker; f.root.$dataMap.events[2] = { id: 2, name: 'blocking-event' };
  const result = await f.host.pushStrength({ strengthUsed: true, playSound: false }, f.operation);
  assert.equal(result.status, 'refused'); assert.equal(f.event.x, 4); assert.deepEqual(f.state.stats, {});
});
test('Strength replaced event during wait retains only completed count/record prefix', async () => {
  const f = fixture('strength'); const next = f.ports.nextFrame;
  f.ports.nextFrame = async guard => { await next(guard); f.events[1] = Object.create(f.event); };
  const result = await f.host.pushStrength({ strengthUsed: true, playSound: false }, f.operation);
  assert.equal(result.status, 'cancelled'); assert.equal(f.state.stats.strength_push_count, 1); assert.equal(f.state.records.length, 1);
  assert.equal(f.events[1].isMoving(), true);
});
test('T25 Surf start follows pure prefix, App projection and actual native jump without ordinary step', async () => {
  const f = fixture('surf'); let steps = 0; f.player.increaseSteps = () => { steps++; };
  const result = await f.host.run(f.plan(), f.operation);
  assert.equal(result.status, 'completed'); assert.equal(f.state.surfing, true); assert.equal(f.state.stats.surf_count, 1);
  assert.deepEqual(f.state.resets, ['surf-start']); assert.deepEqual(f.state.surfBase, { mapId: 7, x: 4, y: 3 });
  assert.equal(f.player.x, 4); assert.equal(f.player.isJumping(), false); assert.equal(steps, 0);
  assert.equal(f.player._characterName, 'surf-fixture'); assert.ok(f.trace.some(x => x[0] === 'followers-jump'));
});
test('Surf jump rejected/failed retains already installed mode, reset and saved base', async () => {
  for (const mode of ['passage-refused', 'request-only']) {
    const f = fixture('surf'), plan = f.plan();
    if (mode === 'passage-refused') f.ports.surfPassage = () => value(false);
    else f.player.jump = () => { f.trace.push(['jump-request-only']); };
    const result = await f.host.run(plan, f.operation);
    assert.equal(result.status, 'failed'); assert.equal(f.state.surfing, true); assert.equal(f.state.stats.surf_count, 1);
    assert.deepEqual(f.state.resets, ['surf-start']); assert.deepEqual(f.state.surfBase, { mapId: 7, x: 4, y: 3 });
    assert.equal(f.player.x, 3); assert.equal(f.state.endingSurf, false);
  }
});
test('Surf looping edge cannot write an invalid jump coordinate', async () => {
  const f = fixture('surf'); f.player._x = f.player._realX = 7; f.root.$dataMap.scrollType = 2;
  const result = await f.host.run(f.plan(), f.operation);
  assert.equal(result.status, 'refused'); assert.equal(f.player.x, 7); assert.equal(f.player.isJumping(), false);
});
test('Surf R1 landing retains water-side departure through actual jump and gates cleanup by scene/player/base', async () => {
  const f = fixture('surf'); f.state.surfing = true; f.ports.terrain = () => value({ canSurf: false, waterfall: false, waterfallCrest: false });
  const result = await f.host.landSurf(f.operation);
  assert.equal(result.status, 'completed'); assert.equal(f.player.x, 4); assert.equal(f.player.isJumping(), false);
  assert.deepEqual(f.state.surfBase, { mapId: 7, x: 3, y: 3 }); assert.equal(f.state.endingSurf, true); assert.equal(f.state.surfing, true);
  await f.host.cleanupSurf(f.event, f.operation); assert.equal(f.state.endingSurf, true);
  const scene = f.root.SceneManager._scene; f.root.SceneManager._scene = {};
  await f.host.cleanupSurf(f.player, f.operation); assert.equal(f.state.endingSurf, true); f.root.SceneManager._scene = scene;
  assert.equal((await f.host.cleanupSurf(f.player, f.operation)).status, 'completed');
  assert.equal(f.state.surfing, false); assert.equal(f.state.endingSurf, false); assert.equal(f.state.surfBase, null);
  assert.deepEqual(f.state.resets, ['surf-end']); assert.ok(f.trace.some(x => x[0] === 'bgm' && x[1] === 'route'));
  await f.host.cleanupSurf(f.player, f.operation); assert.deepEqual(f.state.resets, ['surf-end']);
});
test('Surf landing late owner replacement cannot commit endingSurf or a stale departure', async () => {
  const f = fixture('surf'); f.state.surfing = true; f.ports.terrain = () => value({ canSurf: false, waterfall: false, waterfallCrest: false });
  const frame = f.ports.nextFrame; f.ports.nextFrame = async guard => { await frame(guard); f.stale(); };
  assert.equal((await f.host.landSurf(f.operation)).status, 'cancelled');
  assert.equal(f.state.endingSurf, false); assert.equal(f.state.surfBase, null); assert.deepEqual(f.state.resets, []);
});
test('Surf landing re-reads App authority after jump; cleared/replaced state cannot install completion', async () => {
  const f = fixture('surf'); f.state.surfing = true; f.ports.terrain = () => value({ canSurf: false, waterfall: false, waterfallCrest: false });
  const frame = f.ports.nextFrame; f.ports.nextFrame = async guard => { await frame(guard); f.state.surfing = false; };
  assert.equal((await f.host.landSurf(f.operation)).status, 'completed');
  assert.equal(f.state.endingSurf, false); assert.equal(f.state.surfBase, null);
});
test('Surf full R1 chain: start-base cleanup, landing restores departure, end cleanup resets once', async () => {
  const f = fixture('surf'); assert.equal((await f.host.run(f.plan(), f.operation)).status, 'completed');
  assert.equal(f.player.x, 4); await f.host.cleanupSurf(f.player, f.operation);
  assert.equal(f.state.surfBase, null); assert.equal(f.state.surfing, true); assert.deepEqual(f.state.resets, ['surf-start']);
  f.ports.terrain = () => value({ canSurf: false, waterfall: false, waterfallCrest: false });
  assert.equal((await f.host.landSurf(f.operation)).status, 'completed');
  assert.equal(f.player.x, 5); assert.deepEqual(f.state.surfBase, { mapId: 7, x: 4, y: 3 });
  await f.host.cleanupSurf(f.player, f.operation); await f.host.cleanupSurf(f.player, f.operation);
  assert.equal(f.state.surfBase, null); assert.equal(f.state.surfing, false); assert.equal(f.state.endingSurf, false);
  assert.deepEqual(f.state.resets, ['surf-start', 'surf-end']); assert.equal(f.state.stats.surf_count, 1);
});
test('failed Surf landing leaves the previous runtime base and emits no ending/reset stage', async () => {
  const f = fixture('surf'); f.state.surfing = true; f.state.surfBase = { mapId: 7, x: 2, y: 3 };
  f.ports.terrain = () => value({ canSurf: false, waterfall: false, waterfallCrest: false }); f.ports.surfPassage = () => value(false);
  const result = await f.host.landSurf(f.operation);
  assert.equal(result.status, 'not-landed'); assert.equal(f.player.x, 3); assert.equal(f.state.endingSurf, false);
  assert.deepEqual(f.state.surfBase, { mapId: 7, x: 2, y: 3 }); assert.deepEqual(f.state.resets, []);
});
test('SweetScent weather blocks before red screen; actual flash completion precedes encounter intent', async () => {
  const f = fixture('sweetscent'), input = f.input(); input.context.world.weather.type = 'Rain';
  const blocked = planFieldMove(input); assert.equal((await f.host.run(blocked, f.operation)).status, 'completed');
  assert.deepEqual(f.trace, []); assert.deepEqual(f.state.encounters, []);
  const result = await f.host.run(f.plan(), f.operation); assert.equal(result.status, 'completed');
  assert.equal(f.root.$gameScreen._flashDuration, 0); assert.equal(f.trace.filter(x => x[0] === 'frame').length, 3);
  assert.deepEqual(f.state.encounters, ['sweet-scent']);
});
test('SweetScent missing red-screen resource and rejected App stage never fabricate encounter success', async () => {
  const f = fixture('sweetscent'); delete f.ports.redScreen;
  assert.equal((await f.host.run(f.plan(), f.operation)).status, 'unavailable'); assert.deepEqual(f.state.encounters, []);
  const g = fixture('sweetscent'); g.operation.applyStage = () => ({ status: 'queued' });
  assert.equal((await g.host.run(g.plan(), g.operation)).status, 'failed');
});
for (const change of ['owner', 'map', 'player', 'event', 'player-position', 'event-position']) {
  test(`late ${change} replacement after animation stops the old plan before commit/erase`, async () => {
    const f = fixture(), plan = f.plan(); let resolve;
    f.ports.animate = () => new Promise(r => { resolve = r; });
    const running = f.host.run(plan, f.operation); await Promise.resolve();
    if (change === 'owner') f.stale();
    if (change === 'map') f.root.$gameMap = Object.create(f.map);
    if (change === 'player') f.root.$gamePlayer = Object.create(f.player);
    if (change === 'event') f.events[1] = Object.create(f.event);
    if (change === 'player-position') f.player._x++;
    if (change === 'event-position') f.event._x++;
    resolve(true); const result = await running;
    assert.equal(result.status, 'cancelled'); assert.deepEqual(f.state.stats, {}); assert.equal(f.event._erased, false);
  });
}
test('a late old animation cannot consume stages from the new App owner', async () => {
  const f = fixture(), plan = f.plan(); let active = 1, resolveOld, first = true;
  f.ports.animate = () => { if (!first) return true; first = false; return new Promise(resolve => { resolveOld = resolve; }); };
  const operation = id => ({ ...f.operation, assertCurrent() { if (active !== id) throw Error('replaced-owner'); } });
  const old = f.host.run(plan, operation(1)); await Promise.resolve(); active = 2;
  assert.equal((await f.host.run(plan, operation(2))).status, 'completed'); resolveOld(true);
  assert.equal((await old).status, 'cancelled'); assert.equal(f.state.stats.cut_count, 1); assert.equal(f.state.records.length, 1);
});
test('App apply failure stops the prefix; a late reset completion cannot project or jump after cancellation', async () => {
  const f = fixture('surf'), original = f.operation.applyStage; let release;
  f.operation.applyStage = async (stage, observation) => {
    const result = await original(stage, observation);
    if (stage.kind === 'reset-encounters') await new Promise(resolve => { release = resolve; });
    return result;
  };
  const running = f.host.run(f.plan(), f.operation); while (!release) await Promise.resolve();
  f.stale(); release(); assert.equal((await running).status, 'cancelled');
  assert.equal(f.state.surfing, false); assert.equal(f.state.stats.surf_count, undefined); assert.deepEqual(f.state.resets, ['surf-start']);
  assert.equal(f.player.x, 3); assert.equal(f.trace.some(x => x[0] === 'project-surfing'), false);
});
test('business RNG zero-consumption: all six host families run while Math.random/native encounter reset throw', async () => {
  const original = Math.random; Math.random = () => { throw Error('business RNG forbidden in host'); };
  try {
    for (const move of ['cut', 'rocksmash', 'strength', 'surf', 'flash', 'sweetscent']) {
      const f = fixture(move); vm.runInContext('Math.random = () => { throw Error("native RNG forbidden"); };', f.root);
      assert.equal((await f.host.run(f.plan(), f.operation)).status, 'completed', move);
    }
  } finally { Math.random = original; }
});
test('ordinary provider methods retain their receiver for DarkMask, red screen and local records', async () => {
  const flash = fixture('flash'); flash.ports.currentMask = flash.mask;
  flash.ports.darkMask = function() { assert.equal(this, flash.ports); return value(this.currentMask); };
  assert.equal((await flash.host.run(flash.plan(), flash.operation)).status, 'completed');
  const sweet = fixture('sweetscent'); sweet.ports.pulse = { color: [255, 0, 0, 120], durationFrames: 3 };
  sweet.ports.redScreen = function() { assert.equal(this, sweet.ports); return value(this.pulse); };
  assert.equal((await sweet.host.run(sweet.plan(), sweet.operation)).status, 'completed');
  const strength = fixture('strength'); strength.operation.hasRecords = true;
  strength.operation.localRecordsAvailable = function() { assert.equal(this, strength.operation); return value(this.hasRecords); };
  assert.equal((await strength.host.pushStrength({ strengthUsed: true, playSound: false }, strength.operation)).status, 'completed');
  assert.equal(strength.state.records.length, 1);
});
test('receiver-bound provider failures retain their four-state error and actual completed prefix', async () => {
  const flash = fixture('flash'), plan = flash.plan();
  flash.ports.darkMask = function() { assert.equal(this, flash.ports); throw Error('mask-provider-failed'); };
  const flashResult = await flash.host.run(plan, flash.operation);
  assert.equal(flashResult.status, 'invalid'); assert.match(flashResult.reason, /mask-provider-failed/); assert.equal(flash.state.flashUsed, false);
  const sweet = fixture('sweetscent'); sweet.ports.redScreen = function() { assert.equal(this, sweet.ports); return { status: 'invalid', reason: 'invalid-pulse-resource' }; };
  const sweetResult = await sweet.host.run(sweet.plan(), sweet.operation);
  assert.equal(sweetResult.status, 'invalid'); assert.equal(sweetResult.reason, 'invalid-pulse-resource'); assert.deepEqual(sweet.state.encounters, []);
  const strength = fixture('strength'); strength.operation.localRecordsAvailable = function() { assert.equal(this, strength.operation); throw Error('records-provider-failed'); };
  const strengthResult = await strength.host.pushStrength({ strengthUsed: true, playSound: false }, strength.operation);
  assert.equal(strengthResult.status, 'invalid'); assert.match(strengthResult.reason, /records-provider-failed/);
  assert.equal(strength.state.stats.strength_push_count, 1); assert.equal(strength.event.x, 5); assert.equal(strength.state.records.length, 0);
});

// R1: strict passage reads every relevant native layer. An ordinary open upper layer cannot hide a blocker.
function tile(f, x, y, layer, id, flags) {
  f.root.$dataMap.data[(layer * 8 + y) * 8 + x] = id;
  if (flags !== undefined) f.root.$dataTilesets[1].flags[id] = flags;
}
for (const endpoint of ['source', 'destination']) for (const layer of [0, 1, 2, 3]) for (const mask of [1, 2, 4, 8, 15]) {
  test(`R1 ${endpoint} layer${layer} mask${mask} refuses with zero stat/move/record prefix`, async () => {
    const f = fixture('strength'), x = endpoint === 'source' ? 4 : 5;
    tile(f, x, 3, layer, 1, mask);
    if (layer < 3) assert.equal(f.event.canPass(4, 3, 6), true, 'ordinary native passage is insufficient');
    const result = await f.host.pushStrength({ strengthUsed: true, playSound: true }, f.operation);
    assert.equal(result.status, 'refused'); assert.equal(f.event.x, 4); assert.equal(f.event.isMoving(), false);
    assert.deepEqual(f.state.stats, {}); assert.deepEqual(f.state.records, []); assert.deepEqual(f.trace, []);
  });
}
test('R1 native tags0..7 default to no ignore mapping without rejecting ordinary tagged maps', async () => {
  for (const tag of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const f = fixture('strength'); tile(f, 4, 3, 0, 1, tag << 12); tile(f, 5, 3, 0, 1);
    assert.equal((await f.host.pushStrength({ strengthUsed: true, playSound: false }, f.operation)).status, 'completed', `native tag ${tag}`);
    assert.equal(f.event.x, 5); assert.equal(f.state.stats.strength_push_count, 1);
  }
});
test('R1 tagged blocking tiles still block without a mapping; explicit Neutral capability is per tile', async () => {
  const f = fixture('strength'); tile(f, 5, 3, 1, 1, 0x5001);
  assert.equal((await f.host.pushStrength({ strengthUsed: true, playSound: false }, f.operation)).status, 'refused');
  const g = fixture('strength'); tile(g, 5, 3, 1, 1, 0x5001); const seen = [];
  g.ports.strictTileTerrain = function(input) { assert.equal(this, g.ports); seen.push(input); return value({ ignorePassability: input.tileId === 1 }); };
  assert.equal((await g.host.pushStrength({ strengthUsed: true, playSound: false }, g.operation)).status, 'completed');
  assert.equal(g.event.x, 5); assert.ok(seen.some(x => x.tileId === 1 && x.terrainTag === 5 && x.point.x === 5));
  const h = fixture('strength'); tile(h, 5, 3, 1, 1, 0xd001);
  h.ports.strictTileTerrain = () => value({ ignorePassability: false });
  assert.equal((await h.host.pushStrength({ strengthUsed: true, playSound: false }, h.operation)).status, 'refused', 'tag13 never implies Neutral');
});
test('R1 star partial/full masks skip that layer, while an effective blocked lower layer still refuses', async () => {
  for (const flags of [0x11, 0x12, 0x14, 0x18, 0x1f]) {
    const f = fixture('strength'); tile(f, 5, 3, 3, 1, flags);
    assert.equal((await f.host.pushStrength({ strengthUsed: true, playSound: false }, f.operation)).status, 'completed');
    const g = fixture('strength'); tile(g, 5, 3, 3, 1, flags); tile(g, 5, 3, 1, 2, 1);
    assert.equal((await g.host.pushStrength({ strengthUsed: true, playSound: false }, g.operation)).status, 'refused'); assert.deepEqual(g.state.stats, {});
  }
  const f = fixture('strength'); f.root.$dataTilesets[1].flags[0] = 0x10;
  assert.equal((await f.host.pushStrength({ strengthUsed: true, playSound: false }, f.operation)).status, 'refused', 'all skipped layers do not invent ground');
});
for (const response of ['absent', 'unavailable', 'invalid', 'throw', 'bad-value']) {
  test(`R1 configured terrain provider ${response} never falls back to no-ignore`, async () => {
    const f = fixture('strength');
    f.ports.strictTileTerrain = () => {
      if (response === 'throw') throw Error('lookup-failed');
      return response === 'bad-value' ? value({ ignorePassability: 'false' }) : { status: response, reason: 'lookup-unusable' };
    };
    const result = await f.host.pushStrength({ strengthUsed: true, playSound: false }, f.operation);
    assert.equal(result.status, response === 'absent' || response === 'unavailable' ? 'unavailable' : 'invalid');
    assert.equal(f.event.x, 4); assert.deepEqual(f.state.stats, {}); assert.deepEqual(f.state.records, []);
  });
}
test('R1 beyond-native tags need typed mapping; missing/invalid actual flags remain explicit errors', async () => {
  const f = fixture('strength'); tile(f, 5, 3, 0, 1, 0x8000);
  assert.equal((await f.host.pushStrength({ strengthUsed: true, playSound: false }, f.operation)).status, 'unavailable');
  for (const flags of [undefined, -1, NaN, 0x10000]) {
    const g = fixture('strength'); tile(g, 5, 3, 1, 1); g.root.$dataTilesets[1].flags[1] = flags;
    assert.equal((await g.host.pushStrength({ strengthUsed: true, playSound: false }, g.operation)).status, 'invalid'); assert.deepEqual(g.state.stats, {});
  }
});
function addTileEvent(f, flags, { x = 5, id = 2, through = false } = {}) {
  const event = Object.create(f.event); Object.assign(event, { _eventId: id, _x: x, _realX: x, _y: 3, _realY: 3, _tileId: id, _priorityType: 0, _through: through });
  f.events[id] = event; f.root.$dataMap.events[id] = { id, name: 'tile-event' }; f.root.$dataTilesets[1].flags[id] = flags;
  f.map.refreshTileEvents(); return event;
}
test('R1 actual tile-event blocked source/destination refuses; through tile events are excluded by native lookup', async () => {
  for (const x of [4, 5]) {
    const f = fixture('strength'); addTileEvent(f, 1, { x });
    assert.equal(f.map.tileEventsXy(x, 3).length, 1);
    assert.equal((await f.host.pushStrength({ strengthUsed: true, playSound: false }, f.operation)).status, 'refused'); assert.deepEqual(f.state.stats, {});
  }
  const f = fixture('strength'); addTileEvent(f, 15, { through: true }); assert.equal(f.map.tileEventsXy(5, 3).length, 0);
  assert.equal((await f.host.pushStrength({ strengthUsed: true, playSound: false }, f.operation)).status, 'completed');
});
test('R1 WP12 priority0 tile-event exception bypasses its map layers, while actual character collision still refuses', async () => {
  const f = fixture('strength'); addTileEvent(f, 0); tile(f, 5, 3, 1, 1, 15);
  assert.equal((await f.host.pushStrength({ strengthUsed: true, playSound: false }, f.operation)).status, 'completed'); assert.equal(f.event.x, 5);
  const g = fixture('strength'); addTileEvent(g, 0); tile(g, 5, 3, 1, 1, 15);
  const blocker = Object.create(g.event); Object.assign(blocker, { _eventId: 3, _x: 5, _realX: 5, _priorityType: 1 });
  g.events[3] = blocker; g.root.$dataMap.events[3] = { id: 3, name: 'blocker' };
  assert.equal((await g.host.pushStrength({ strengthUsed: true, playSound: false }, g.operation)).status, 'refused'); assert.deepEqual(g.state.stats, {});
});
test('R1 an ignored tile event does not grant the priority0 bypass over another effective blocked layer', async () => {
  const f = fixture('strength'); addTileEvent(f, 0x3001); tile(f, 5, 3, 1, 1, 2);
  f.ports.strictTileTerrain = input => value({ ignorePassability: input.tileId === 2 });
  assert.equal((await f.host.pushStrength({ strengthUsed: true, playSound: false }, f.operation)).status, 'refused'); assert.deepEqual(f.state.stats, {});
});
test('R1 bounds precedes own through; in-bounds own through bypasses tile lookup and character collision', async () => {
  const f = fixture('strength'); f.event._through = true;
  f.ports.strictTileTerrain = () => { throw Error('must not read for own through'); }; tile(f, 5, 3, 1, 1, 15);
  assert.equal((await f.host.pushStrength({ strengthUsed: true, playSound: false }, f.operation)).status, 'completed'); assert.equal(f.event.x, 5);
  const g = fixture('strength'); g.player._x = g.player._realX = 6; g.event._x = g.event._realX = 7; g.event._through = true;
  g.map.tilesetFlags = () => { throw Error('must not read beyond bounds'); };
  assert.equal((await g.host.pushStrength({ strengthUsed: true, playSound: false }, g.operation)).status, 'refused'); assert.deepEqual(g.state.stats, {});
});
