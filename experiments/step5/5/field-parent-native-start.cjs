'use strict';
// Current real native transfer/Scene producer and canonical START installer.
// Rendering and preloaded-map I/O are controlled; permits and registry snapshots
// are issued only by production functions. No test publisher/authority DTO exists.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), { types } = require('node:util');
function prepare(root, out, read, options = {}) {
  const runtime = path.dirname(options.runtimePath ?? process.env.PF_MZ_RUNTIME_OBJECTS);
  const managers = fs.readFileSync(path.join(runtime, 'reactor_managers.js'), 'utf8');
  const scenes = fs.readFileSync(path.join(runtime, 'reactor_scenes.js'), 'utf8');
  function install(text, name) {
    const start = text.indexOf(name + ' = function'), end = text.indexOf('\n};', start);
    assert(start >= 0 && end > start, name);
    vm.runInContext(text.slice(start, end + 4), root, { filename: 'pinned-field-parent:' + name });
  }
  root.Scene_Message = function Scene_Message() {};
  root.Scene_Message.prototype.isReady = () => true;
  root.Scene_Map = function Scene_Map() { this._started = false; this._active = false; this._mapLoaded = false; this._transfer = false; };
  Object.assign(root.Scene_Map.prototype, {
    create() {}, createDisplayObjects() {}, start() { this._started = this._active = true; },
    isStarted() { return this._started; }, update() {}, stop() { this._active = false; }, terminate() {},
    requestAutosave() { throw Error('field-parent-unexpected-autosave'); },
    onTransferEnd() { throw Error('field-parent-unexpected-transfer'); },
  });
  root.Input.isPressed = () => false;
  root.DataManager = { isMapLoaded: () => true };
  root.SceneManager = { _scene: { stop() {}, terminate() {} }, _nextScene: null,
    isSceneChanging() { return this._nextScene !== null; }, isCurrentSceneBusy: () => false, isGameActive: () => true,
    onSceneTerminate() {}, onSceneCreate() {}, onBeforeSceneStart() {}, onSceneStart() {}, terminate() {} };
  for (const name of ['goto', 'changeScene', 'updateScene']) install(managers, 'SceneManager.' + name);
  for (const name of ['isReady', 'onMapLoaded']) install(scenes, 'Scene_Map.prototype.' + name);
  root.$gamePlayer._transferring = false; root.$gamePlayer._moveRouteForcing = false;
  const createWorldTravelMZ = options.createWorldTravelMZ ?? require(path.join(out, 'src/plugins/world/world-travel-mz.js')).createWorldTravelMZ;
  assert.equal(typeof createWorldTravelMZ, 'function');
  const diagnostics = [];
  const travel = createWorldTravelMZ(root, () => read().application, new Map(), {}, reason => diagnostics.push(reason), types.isProxy);
  const movement = travel.transfer.installMovementStart({ readState: read, iceTerrainConfigured: false });
  // Actual native queue -> change/create -> isReady/onMapLoaded -> start.
  const enter = () => {
    root.SceneManager.goto(root.Scene_Map); root.SceneManager.changeScene(); root.SceneManager.updateScene();
    assert.equal(root.SceneManager._nextScene, null); assert.equal(root.SceneManager._scene._started, true);
  };
  enter(); return { travel, movement, diagnostics, enter };
}
module.exports = { prepare };
