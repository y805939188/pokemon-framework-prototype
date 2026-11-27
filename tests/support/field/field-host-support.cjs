'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const ROOT = path.resolve(__dirname, '../../..');
const urls = new Map();
function sourceURL(file) {
  if (urls.has(file)) return urls.get(file);
  const text = stripTypeScriptTypes(fs.readFileSync(file, 'utf8'), { sourceUrl: file });
  const code = text.replace(/\bfrom\s*(['"])(\.\.?\/[^'"]+)\1/g, (_, quote, relative) => {
    const dependency = path.resolve(path.dirname(file), relative + '.ts');
    assert.ok(dependency.startsWith(path.join(ROOT, 'src') + path.sep));
    return 'from ' + JSON.stringify(sourceURL(dependency));
  });
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64'); urls.set(file, url); return url;
}
const load = relative => import(sourceURL(path.join(ROOT, relative)));
const mzSource = fs.readFileSync(process.env.PF_MZ_RUNTIME || path.join(ROOT, 'js/reactor_objects.js'), 'utf8');
function installMZ(context, name) {
  const marker = name + ' = function';
  const start = mzSource.indexOf(marker), end = mzSource.indexOf('\n};', start);
  assert.ok(start >= 0 && end > start, 'installed MZ method: ' + name);
  vm.runInContext(mzSource.slice(start, end + 4), context, { filename: 'installed-reactor:' + name });
}
function host() {
  const log = [], draws = [], errors = [], diagnostics = [];
  function Game_CharacterBase() {}
  function Game_Character() {}
  Game_Character.prototype = Object.create(Game_CharacterBase.prototype);
  function Game_Player() {
    this._x = this._realX = 5; this._y = this._realY = 5; this._direction = 2;
    this._encounterCount = 0; this._forcing = false; this.speed = 0.5; this.passable = true;
    this._vehicleGettingOff = false; this._followers = { update() {}, synchronize() {}, updateMove() {} };
  }
  Game_Player.prototype = Object.create(Game_Character.prototype);
  Object.defineProperties(Game_Player.prototype, { x: { get() { return this._x; } }, y: { get() { return this._y; } } });
  Object.assign(Game_CharacterBase.prototype, {
    isMoving() { return this._realX !== this._x || this._realY !== this._y; }, isJumping() { return !!this.jumping; },
    isStopping() { return !this.isMoving() && !this.isJumping(); }, updateStop() {}, updateJump() {}, updateAnimation() {},
    distancePerFrame() { return this.speed; }, refreshBushDepth() {},
    setMovementSuccess(value) { this.success = value; }, isMovementSucceeded() { return this.success; },
    canPass() { return this.passable; }, setDirection(value) { this._direction = value; }, reverseDir(d) { return 10 - d; },
    checkEventTriggerTouchFront() { log.push('wall-touch'); },
  });
  function Game_Interpreter() { this._branch = {}; this._indent = 0; }
  function Game_Map() {}
  Game_Map.prototype.updateInterpreter = function() { log.push('interpreter'); };
  function Game_Event() {}
  Game_Event.prototype.updateParallel = function() { log.push('parallel'); };
  function Game_CommonEvent() {}
  Game_CommonEvent.prototype.update = function() { log.push('common'); };
  const map = Object.assign(new Game_Map(), {
    id: 5, running: false, startsEvent: false,
    mapId() { return this.id; }, isEventRunning() { return this.running; },
    setupStartingEvent() { log.push('setup-event'); if (this.startsEvent) { this.running = true; return true; } return false; },
    encounterStep: () => 10,
    roundXWithDirection: (x, d) => x + (d === 6 ? 1 : d === 4 ? -1 : 0),
    roundYWithDirection: (y, d) => y + (d === 2 ? 1 : d === 8 ? -1 : 0),
    xWithDirection: (x, d) => x + (d === 6 ? 1 : d === 4 ? -1 : 0),
    yWithDirection: (y, d) => y + (d === 2 ? 1 : d === 8 ? -1 : 0),
  });
  const system = { enabled: true, isEncounterEnabled() { return this.enabled; }, disableEncounter() { this.enabled = false; }, enableEncounter() { this.enabled = true; } };
  const temp = { destination: false, clearDestination() { this.destination = false; log.push('clear-destination'); } };
  const context = {
    Game_Player, Game_Character, Game_CharacterBase, Game_Interpreter, Game_Map, Game_Event, Game_CommonEvent,
    $gameMap: map, $gameSystem: system, $gameTemp: temp,
    $gameParty: { inBattle: () => false, onPlayerWalk() { log.push('native-walk'); } },
    $gameVariables: { value: () => 1 }, $dataTroops: [null, {}],
    BattleManager: { setup() { log.push('native-battle'); }, onEncounter() { log.push('native-encounter'); }, setEventCallback() {} },
    Scene_Battle: function Scene_Battle() {}, SceneManager: { push() { log.push('native-scene'); } },
  };
  vm.createContext(context);
  context.draws = draws;
  vm.runInContext('Math.randomInt = n => { draws.push(n); return 0; };', context);
  for (const name of ['Game_CharacterBase.prototype.moveStraight', 'Game_CharacterBase.prototype.updateMove', 'Game_CharacterBase.prototype.update',
    'Game_Player.prototype.update', 'Game_Player.prototype.updateNonmoving', 'Game_Player.prototype.makeEncounterCount', 'Game_Player.prototype.updateEncounterCount',
    'Game_Player.prototype.executeEncounter', 'Game_Player.prototype.locate', 'Game_Player.prototype.getOffVehicle',
    'Game_Interpreter.prototype.command136', 'Game_Interpreter.prototype.command301']) installMZ(context, name);
  Game_Character.prototype.update = Game_CharacterBase.prototype.update;
  Game_Character.prototype.locate = function(x, y) { this._x = this._realX = x; this._y = this._realY = y; };
  Object.assign(Game_Player.prototype, {
    increaseSteps() { log.push('native-start-step'); },
    isMoveRouteForcing() { return this._forcing; }, canMove() { return !map.running; },
    regionId: () => 1, terrainTag: () => 0, scrolledX: () => 0, scrolledY: () => 0,
    updateDashing() {}, updateScroll() {}, updateVehicle() {},
    moveByInput() { if (this.directionInput && !this.isMoving() && this.canMove()) this.moveStraight(this.directionInput); },
    checkEventTriggerHere() { log.push('arrival'); }, triggerAction: () => false,
    canEncounter: () => system.enabled, encounterProgressValue: () => 1, makeEncounterTroopId: () => 1,
    center() {}, direction() { return this._direction; }, isInVehicle: () => false, isInAirship: () => false,
    vehicle: () => ({ isLandOk: () => true, getOff() {} }),
    forceMoveForward() {}, setTransparent() {}, setMoveSpeed() {}, setThrough() {}, gatherFollowers() {},
  });
  const player = context.$gamePlayer = new Game_Player();
  const nativeEncounter = Game_Player.prototype.executeEncounter;
  const application = {}, stamp = { owner: application, generation: 0, map, mapId: 5 };
  return {
    root: context, player, map, system, temp, log, draws, errors, diagnostics, stamp,
    current: () => ({ ...stamp }),
    nativeEncounter: p => nativeEncounter.call(p),
    legacyEncounter(p) { log.push('legacy-encounter'); p.makeEncounterCount(); return false; },
    tick(input = 0) { player.directionInput = input; player.update(true); },
    complete(input = 6) { this.tick(input); player.directionInput = 0; while (player.isMoving()) this.tick(); },
    clearLog() { log.length = draws.length = 0; },
  };
}
module.exports = { load, host, ROOT };
