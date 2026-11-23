'use strict';
// Independent native-MZ movement fixture. It never owns or writes App state/runtime.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const value = value => ({ status: 'value', value });
function surfHost(P, runtimePath) {
  assert.equal(typeof P.createFieldMoveHost, 'function'); const trace = [];
  const root = { Utils: {}, PluginManager: {}, BattleManager: {}, Input: {}, TouchInput: {}, $dataSystem: {}, console,
    ImageManager: { isObjectCharacter: () => false, isBigCharacter: () => false },
    AudioManager: { playSe: sound => trace.push(['synthetic-se-request', sound.name]), playBgm: bgm => trace.push(['synthetic-bgm-request', bgm.name]), playBgs() {}, mapBgmObject: data => data.bgm } };
  vm.createContext(root); vm.runInContext('Number.prototype.mod = function(n) { return ((this % n) + n) % n; }; Array.prototype.clone = function() { return this.slice(0); };', root);
  vm.runInContext(fs.readFileSync(runtimePath, 'utf8'), root, { filename: runtimePath });
  const map = Object.create(root.Game_Map.prototype), player = Object.create(root.Game_Player.prototype);
  Object.assign(player, { _x: 0, _y: 0, _realX: 0, _realY: 0, _jumpCount: 0, _jumpPeak: 0, _moveSpeed: 4, _direction: 6, _directionFix: false, _through: false, _priorityType: 1,
    _characterName: 'p5-literal', _characterIndex: 0, _tileId: 0, _walkAnime: false, _stepAnime: false, _pattern: 0, _stopCount: 0, _vehicleType: 'walk' });
  player._followers = { jumpAll() {}, refresh() {}, isSomeoneCollided: () => false };
  player.makeEncounterCount = () => { throw Error('native RNG forbidden in framework Surf fixture'); };
  Object.assign(map, { _mapId: 7, _events: [], _tileEvents: [], _tilesetId: 1, _vehicles: Array.from({ length: 3 }, () => ({ posNt: () => false })) });
  root.$dataMap = { width: 64, height: 8, scrollType: 0, data: Array(64 * 8 * 6).fill(0), events: [], autoplayBgm: true, bgm: { name: 'p5-route' }, autoplayBgs: false };
  root.$dataTilesets = [null, { flags: [0] }]; root.$gameMap = map; root.$gamePlayer = player;
  root.$gameParty = { leader: () => null, members: () => [] }; root.$gameScreen = new root.Game_Screen();
  root.Scene_Map = function Scene_Map() {}; root.SceneManager = { _scene: new root.Scene_Map() };
  const surfState = { canSurf: true };
  const ports = { factsObservation: P.createFieldFactsObservation(root, require('node:util').types.isProxy, [{ owner: surfState, path: ['canSurf'] }]),
    metadata: () => value({ darkMap: false, alwaysBicycle: false }), terrain: () => value({ canSurf: surfState.canSurf, waterfall: false, waterfallCrest: false }), surfPassage: () => value(true),
    animate: async (move, member, guard) => { trace.push(['synthetic-animation-ack', move, member]); guard(); return true; },
    text: async (kind, move, guard) => { trace.push(['synthetic-text-ack', kind, move]); guard(); return true; },
    cancelVehicles: async (actualPlayer, guard) => { guard(); actualPlayer._vehicleType = 'walk'; trace.push(['cancel-vehicles']); return { status: 'completed' }; },
    projectSurfing: async (surfing, actualPlayer, guard) => { guard(); actualPlayer.setImage(surfing ? 'p5-surf' : 'p5-walk', 0); trace.push(['project-surfing', surfing]); return { status: 'completed' }; },
    nextFrame: async guard => { guard(); trace.push(['native-movement-frame']); if (player.isJumping()) player.updateJump(); else if (player.isMoving()) player.updateMove(); guard(); },
  };
  const native = P.createFieldMoveHost(root, ports);
  let lastHostOperation;const run=native.run;
  return { root, trace, ports, get lastHostOperation(){return lastHostOperation;},fieldMoves: { ...native, run(plan,operation){lastHostOperation=operation;return Reflect.apply(run,native,[plan,operation]);},landSurf(operation){lastHostOperation=operation;return native.landSurf(operation);},cleanupSurf(operation){lastHostOperation=operation;return native.cleanupSurf(root.$gamePlayer,operation);} },
    facingSurfable(next) { surfState.canSurf = next; },
    locate(x, y) { Object.assign(player, { _x: x, _y: y, _realX: x, _realY: y }); },
    step() { player._x++; player._realX = player._x; },
  };
}
module.exports = { surfHost };
