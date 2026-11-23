'use strict';
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), vm = require('node:vm');
assert(process.env.PF_FIELD_MOVE_APP_OUT, 'PF_FIELD_MOVE_APP_OUT must name the private strict emit');
const out = process.env.PF_FIELD_MOVE_APP_OUT;
const { FieldMoveOperation, applyFieldMoveUpdate } = require(process.env.PF_FIELD_MOVE_APP_BUNDLE || path.join(out, 'framework/app/field-move-operation.js'));
const { createFieldMoveHost } = require(path.join(out, 'plugins/world/field-move-host.js'));
const { createFieldFactsObservation } = require(path.join(out, 'plugins/world/field-facts-observation-mz.js'));
const { newGame } = require(path.join(out, 'framework/rules/state.js'));
const { newWorldLocalState, newEncounterRuntime } = require(path.join(out, 'framework/rules/world-state.js'));
const { dexLayoutIdentity } = require(path.join(out, 'framework/rules/dex-state.js'));
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const value = value => ({ status: 'value', value });
const runtimePath = process.env.PF_MZ_RUNTIME_OBJECTS;
assert(runtimePath, 'PF_MZ_RUNTIME_OBJECTS must name the pinned runtime');
const runtimeSource = fs.readFileSync(runtimePath, 'utf8');
function fixture(options = {}) {
  const moveId = options.moveId || 'cut', trace = [], draws = [], writes = [], maskState = { valid: true, expanded: false, ticks: 0 }, events = [];
  const root = { Utils: {}, PluginManager: {}, BattleManager: {}, Input: {}, TouchInput: {}, $dataSystem: {}, console,
    ImageManager: { isObjectCharacter: () => false, isBigCharacter: () => false },
    AudioManager: { playSe: s => trace.push(['sound', s.name]), playBgm: s => trace.push(['bgm', s.name]), playBgs() {}, mapBgmObject: data => data.bgm } };
  vm.createContext(root);
  vm.runInContext('Number.prototype.mod = function(n) { return ((this % n) + n) % n; }; Array.prototype.clone = function() { return this.slice(0); };', root);
  vm.runInContext(runtimeSource, root, { filename: runtimePath });
  const map = Object.create(root.Game_Map.prototype), player = Object.create(root.Game_Player.prototype), event = Object.create(root.Game_Event.prototype);
  const init = (c, x, y) => Object.assign(c, { _x: x, _y: y, _realX: x, _realY: y, _jumpCount: 0, _jumpPeak: 0, _moveSpeed: 4, _direction: 6, _directionFix: false, _through: false, _priorityType: 1, _characterName: 'fixture', _characterIndex: 0, _tileId: 0, _walkAnime: false, _stepAnime: false, _pattern: 0, _stopCount: 0 });
  init(player, 3, 3); init(event, 4, 3);
  player._followers = { jumpAll() {}, refresh() {}, isSomeoneCollided: () => false }; player._vehicleType = 'walk';
  player.makeEncounterCount = () => { throw Error('native-rng-forbidden'); };
  event._mapId = 7; event._eventId = 1; event._erased = false; event.refresh = () => {}; event.checkEventTriggerTouchFront = () => {};
  events[1] = event;
  Object.assign(map, { _mapId: 7, _events: events, _tileEvents: [], _tilesetId: 1, _vehicles: Array.from({ length: 3 }, () => ({ posNt: () => false })) });
  root.$dataMap = { width: 8, height: 8, scrollType: 0, data: Array(8 * 8 * 6).fill(0), events: [null, { id: 1, name: moveId === 'rocksmash' ? 'SmashRock' : moveId === 'strength' ? 'strengthboulder' : 'CutTree', x: 4, y: 3 }], autoplayBgm: true, bgm: { name: 'route' }, autoplayBgs: false };
  root.$dataTilesets = [null, { flags: [0] }]; root.$gameMap = map; root.$gamePlayer = player;
  root.$gameParty = { leader: () => null, members: () => [] }; root.$gameScreen = new root.Game_Screen();
  const nativeFlash = root.$gameScreen.startFlash, nativeArray = vm.runInContext('value => Array.from(value)', root);
  root.$gameScreen.startFlash = function(color, duration) { nativeFlash.call(this, nativeArray(color), duration); };
  root.Scene_Map = function Scene_Map() {}; root.SceneManager = { _scene: new root.Scene_Map() };
  const regionalDex = { national: [], regions: [] }; regionalDex.layoutIdentity = dexLayoutIdentity(regionalDex);
  let content = { species: {}, regionalDex, settings: { ...options.settings } }, actualContent = content, generation = 1, owner = {}, activeOwner = owner, operation, finalGuard = false, providerCalls = 0, duringGuard = 0, attempt = 0;
  const game = newGame({ party: [{ id: 'actor', species: 'fixture', form: 0, level: 5, exp: 0, hp: 0, ability: '', nature: 'Hardy', gender: 'N', moves: [{ id: moveId, pp: 0, maxpp: 10 }], isEgg: false }], content });
  game.badges = Array(8).fill(true);
  let held = { game, local: newWorldLocalState(), encounterRuntime: { ...newEncounterRuntime(), currentMapId: 7, graceSteps: 5, accumulator: 220 }, surf: { surfBase: null, endingSurf: false }, records: [] };
  options.state?.(held); held = freeze(held);
  const factState = { metadata: { darkMap: true, alwaysBicycle: false }, terrain: { canSurf: true, waterfall: false, waterfallCrest: false }, passage: true, mask: maskState };
  const context = () => ({ operation, held, root, map, player, event, ports, maskState, factState, writes, trace, draws });
  const provider = name => { providerCalls++; if (finalGuard) duringGuard++; options.onProvider?.(name, context()); };
  const observation = () => ({ ...held, owner: activeOwner, generation, content: actualContent, mapId: map._mapId });
  const ports = {
    factsObservation: createFieldFactsObservation(root, require('node:util').types.isProxy, [{ owner: factState, path: [] }]),
    metadata: () => { provider('metadata'); return value({ ...factState.metadata }); },
    terrain: () => { provider('terrain'); return value({ ...factState.terrain }); },
    surfPassage: () => { provider('surfPassage'); return value(factState.passage); },
    darkMask: () => { provider('darkMask'); return value(mask); }, sound: name => value({ name, volume: 20, pitch: 100, pan: 0 }),
    redScreen: () => value({ color: [255, 0, 0, 120], durationFrames: 2 }),
    animate: async (move, member, guard) => { trace.push(['animate', move, member]); options.onAnimate?.(context()); guard(); return options.animate ?? true; },
    text: async (kind, move, guard) => { trace.push([kind, move]); options.onText?.(kind, context()); guard(); return options.text ?? true; },
    cancelVehicles: async (p, guard) => { trace.push(['cancel-vehicles']); guard(); p._vehicleType = 'walk'; return { status: 'completed' }; },
    projectSurfing: async (surfing, p, guard) => { trace.push(['project', surfing]); guard(); p.setImage(surfing ? 'surf' : 'walk', 0); return { status: 'completed' }; },
    nextFrame: async guard => { guard(); trace.push(['frame']); options.onFrame?.(context());
      for (const c of [player, ...events.filter(Boolean)]) if (c.isJumping()) c.updateJump(); else if (c.isMoving()) c.updateMove();
      if (root.$gameScreen._flashDuration > 0) root.$gameScreen.updateFlash();
      if (maskState.ticks && --maskState.ticks === 0) maskState.expanded = true; guard(); },
  };
  const mask = { mapId: 7, valid: () => maskState.valid, expand(guard) { options.onExpand?.(context()); guard(); maskState.ticks = 2; }, expanded: () => maskState.expanded };
  const nativeHost = createFieldMoveHost(root, ports);
  const host = { ...nativeHost, cleanupSurf: (op, notificationPlayer) => nativeHost.cleanupSurf(options.wrongNotification ? {} : notificationPlayer ?? player, op) };
  let lastHostOperation;
  for (const name of ['run', 'pushStrength', 'landSurf', 'cleanupSurf']) {
    const original = host[name]; host[name] = (...args) => { lastHostOperation = name === 'cleanupSurf' ? args[0] : args.at(-1); options.onHost?.(name, args, context()); return original(...args); };
  }
  const encounterFacts = { tables: { RockSmash: { stepChance: 50, slots: [{ species: 'fixture', weight: 1, minLevel: 5, maxLevel: 5 }] }, Land: { stepChance: 21, slots: [{ species: 'fixture', weight: 1, minLevel: 5, maxLevel: 5 }] } }, currentType: 'Land', disabled: false, playerPresent: true, debugControl: false,
    business: { mapId: value(7), hour: value(21), cycling: value(false), diving: value(false), surfing: value(false), mapMetadata: value({}), weather: value({ type: 'None', category: 'None', strength: 0, durationFrames: 0 }) } };
  options.encounters?.(encounterFacts);
  operation = new FieldMoveOperation({ owner, generation: 1, action: options.action || { kind: 'use', moveId, entry: options.entry || 'party', memberId: 'actor', debug: !!options.debug }, host,
    observe() { provider('observe'); options.onObserve?.(context()); return observation(); },
    commit(update, guard) {
      attempt++; options.onInstall?.(attempt, context()); provider('install-prepare');
      if (options.failInstall === attempt) throw Error('install-failed');
      finalGuard = true;
      try { guard(observation()); held = freeze(applyFieldMoveUpdate(held, update)); writes.push(update); return held; }
      finally { finalGuard = false; }
    },
    encounterFacts() { provider('encounters'); return encounterFacts; },
    random(upper) { draws.push(upper); options.onRandom?.(context()); return options.random ? options.random(upper) : 0; },
  });
  return { operation, host, nativeHost, root, map, player, event, ports, maskState, factState, trace, draws, writes, encounterFacts,
    get state() { return held; }, get guardProviderCalls() { return duringGuard; }, get providerCalls() { return providerCalls; }, get lastHostOperation() { return lastHostOperation; },
    replaceOwner() { activeOwner = {}; }, replaceGeneration() { generation++; }, replaceContent() { actualContent = { ...content, settings: { FISHING_AUTO_HOOK: true } }; },
    external(change) { const next = clone(held); change(next); held = freeze(next); }, replaceMap() { map._mapId++; },
  };
}
module.exports = { fixture, clone, value, FieldMoveOperation, applyFieldMoveUpdate };
