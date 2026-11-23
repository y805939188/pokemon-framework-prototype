'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../../..');
const runtime = process.env.PF_E3_NATIVE_ROOT;
assert(runtime, 'PF_E3_NATIVE_ROOT required');
const E = require(process.env.PF_E3_PARENT_BUNDLE);
const nativeObjects = fs.readFileSync(path.join(runtime, 'js/reactor_objects.js'), 'utf8');
const nativeScenes = fs.readFileSync(path.join(runtime, 'js/reactor_scenes.js'), 'utf8');
function installNative(context, name, source) {
  const start = source.indexOf(name + ' = function'), end = source.indexOf('\n};', start);
  assert.ok(start >= 0 && end > start, 'real MZ method ' + name);
  vm.runInContext(source.slice(start, end + 4), context, { filename: 'installed-MZ:' + name });
}
function mapData(overrides = {}) {
  return { width: 4, height: 3, scrollType: 0, tilesetId: 1, data: Array(4 * 3 * 6).fill(0), events: [null], ...overrides };
}
const location = (mapId = 2, x = 1, y = 1, direction = 6) => ({ mapId, x, y, direction });
const conditions = overrides => ({ switch1Valid: false, switch2Valid: false, variableValid: false, selfSwitchValid: false, itemValid: false, actorValid: false, ...overrides });
const event = overrides => ({ id: 1, x: 1, y: 1, pages: [{ conditions: conditions(), priorityType: 1, through: false, image: { tileId: 0 } }], ...overrides });
async function host(overrides = {}, config = {}) {
  const { createTransferHost } = E;
  const log = [], diagnostics = [], arrivals = [], failures = [], failureDetails = [], requests = [], deferred = [];
  const maps = { 1: mapData(), 2: mapData(), 3: mapData() }, responses = new Map();
  const owner = {}, state = { generation: 1, current: true, receipt: null, failure: null, checkpoint: true, active: true, beforeReturn: null };
  function Game_Player() { this.x = 0; this.y = 0; this._direction = 2; this._transferring = false; this._vehicleType="walk"; this._moveRouteForcing=false; }
  function Game_CharacterBase() { this._tileId = 0; this._priorityType = 0; this._through = false; this._x = 1; this._y = 1; }
  Object.assign(Game_Player.prototype, {
    setDirection(d) { this._direction = d; }, direction() { return this._direction; },
    locate(x, y) { this.x = x; this.y = y; log.push('locate'); }, refresh() { log.push('refresh'); },
  });
  function Scene_Map() { this._transfer = true; this._lastMapWasNull = false; this._mapNameWindow = { open() { log.push('map-name'); } }; }
  Object.assign(Scene_Map.prototype, {
    createDisplayObjects() { log.push('display'); }, fadeInForTransfer() {}, needsFadeIn() { return false; },
    requestAutosave() { log.push('autosave'); },
  });
  class XMLHttpRequest {
    open(method, url) { this.url = url; requests.push([method, url]); }
    overrideMimeType() {}
    send() {
      const id = Number(this.url.match(/Map(\d+)\.json/)[1]), configured = responses.get(id) || {};
      const finish = () => {
        if (configured.network) return this.onerror();
        this.status = configured.status ?? 0;
        this.responseText = configured.text ?? JSON.stringify(configured.data ?? maps[id]);
        this.onload();
      };
      if (configured.defer) deferred.push(finish); else queueMicrotask(finish);
    }
  }
  const vehicle = { _mapId: 9, posNt: () => false };
  const map = {
    id: 1, mapId() { return this.id; }, width() { return root.$dataMap.width; }, height() { return root.$dataMap.height; },
    setup(id) { log.push('setup'); if (state.failure === 'setup') throw Error('setup-failed'); this.id = id; root.$dataMap = maps[id]; },
    autoplay() { log.push('autoplay'); }, boat: () => vehicle, ship: () => vehicle, eventsXyNt: () => [],
  };
  const root = { Game_Player, Game_CharacterBase, Scene_Map, XMLHttpRequest, $gameMap: map, $dataMap: maps[1], $dataMapInfos: [null, {}, {}, {}],
    $dataTilesets: [null, { flags: [0, 2, 15, 16] }],
    $gameSwitches: { value: () => false }, $gameVariables: { value: () => 0 }, $gameSelfSwitches: { value: () => false },
    $gameActors: { actor: () => ({}) }, $gameParty: { hasItem: () => false, members: () => [] }, $dataItems: [null, {}],
    Scene_Message: { prototype: { start() { log.push('start'); } } }, SceneManager: { clearStack() {} },
    DataManager: { isPlaytestCheckpointEnabled: () => false },
  };
  vm.createContext(root);
  if(config.surf){root.Game_Map=function(){};for(const method of ['terrainTag','checkPassage','isBoatPassable','isShipPassable'])installNative(root,'Game_Map.prototype.'+method,nativeObjects);}
  for (const method of ['isTile', 'tileId', 'isNormalPriority', 'pos', 'isThrough', 'posNt']) installNative(root, 'Game_CharacterBase.prototype.' + method, nativeObjects);
  for (const method of ['reserveTransfer', 'isTransferring', 'performTransfer', 'clearTransferInfo', 'newMapId']) installNative(root, 'Game_Player.prototype.' + method, nativeObjects);
  for(const name of ['moveStraight','moveDiagonally','jump']){const key='Game_CharacterBase.prototype.'+name;const a=nativeObjects.indexOf(key+' = function'),b=nativeObjects.indexOf('\n};',a);assert(a>=0&&b>a,key);vm.runInContext(nativeObjects.slice(a,b+4).replace(key,'Game_Player.prototype.'+name),root,{filename:'pinned-parent-native:'+name});}
  if (config.reserveThrows) Game_Player.prototype.reserveTransfer = () => { throw Error('reserve-failed'); };
  for (const method of ['onMapLoaded', 'start', 'onTransferEnd', 'shouldAutosave']) installNative(root, 'Scene_Map.prototype.' + method, nativeScenes);
  const player = root.$gamePlayer = new Game_Player();
  const nativePerform = Game_Player.prototype.performTransfer;
  const perform = function(...args) { const result = nativePerform.apply(this, args); if (state.beforeReturn) state.beforeReturn(); return result; };
  Game_Player.prototype.performTransfer = perform;
  const refs = { playerPrototype: Game_Player.prototype, performTransfer: perform, reserveTransfer: Game_Player.prototype.reserveTransfer };
  config.beforeInstall?.({root,player,map,maps,log,vm,nativeObjects,nativeScenes});
  const ports = overrides;
  const transfer = config.transferFactory ? config.transferFactory({root,ports,refs}) : createTransferHost(root, ports); transfer.install(refs);
  const receipt = (target = location()) => state.receipt = { token: 'transfer-1', generation: state.generation, target };
  const reserve = async (target = location()) => { const resource = await transfer.preload(owner, target); assert.equal(resource.status, 'ready'); const r = receipt(target); return { result: transfer.reserve(owner, r, resource), resource, receipt: r }; };
  const scene = () => new Scene_Map();
  return { transfer, ports, refs, root, maps, map, owner, player, log, diagnostics, arrivals, failures, failureDetails, state, responses, requests, deferred, receipt, reserve, scene, createTransferHost, vehicle };
}
module.exports = { host, mapData, location, conditions, event };
