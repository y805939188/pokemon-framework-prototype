'use strict';
// Narrow controlled lifecycle for pre-world battle fixtures. These fixtures do
// not exercise travel. An unexpected transfer/autosave is an explicit failure,
// never a successful native receipt. Existing host methods keep their identity.
function install(root) {
  if (!root.PluginManager) root.PluginManager = {};
  root.PluginManager.parameters ??= () => ({});
  if (root.Game_System?.prototype) root.Game_System.prototype.isEncounterEnabled ??= function() { return this._encounterEnabled !== false; };
  if (!root.Scene_Map) {
    root.Scene_Map = function Scene_Map() {};
    if (root.Scene_MenuBase) root.Scene_Map.prototype = Object.create(root.Scene_MenuBase.prototype);
    root.Scene_Map.prototype.constructor = root.Scene_Map;
  }
  const map = root.Scene_Map.prototype;
  map.update ??= function() {};
  map.isReady ??= function() { return true; };
  map.requestAutosave ??= function() { throw Error('legacy-battle-fixture-unexpected-autosave'); };
  map.onTransferEnd ??= function() { throw Error('legacy-battle-fixture-unexpected-transfer-end'); };
  root.SceneManager ??= {};
  root.SceneManager.updateScene ??= function() {};
  root.SceneManager.goto ??= function() { throw Error('legacy-battle-fixture-unexpected-scene-transfer'); };
  const interpreter = root.Game_Interpreter?.prototype;
  if (interpreter) {
    interpreter.updateWaitMode ??= function() { return false; };
    interpreter.setWaitMode ??= function(mode) { this._waitMode = mode; };
    interpreter.clear ??= function() { this._waitMode = ''; };
    interpreter.terminate ??= function() {};
  }
  root.Game_Player ??= function Game_Player() {};
  const player = root.Game_Player.prototype;
  player.performTransfer ??= function() { throw Error('legacy-battle-fixture-unexpected-perform-transfer'); };
  player.reserveTransfer ??= function() { throw Error('legacy-battle-fixture-unexpected-reserve-transfer'); };
  for (const method of ['clearTransferInfo', 'moveStraight', 'moveDiagonally', 'jump', 'updateMove', 'updateJump', 'isMapPassable', 'increaseSteps', 'updateNonmoving', 'canMove', 'makeEncounterCount', 'updateEncounterCount', 'executeEncounter'])
    player[method] ??= function() { throw Error('legacy-battle-fixture-unexpected-' + method); };
  return root;
}
module.exports = { install };
