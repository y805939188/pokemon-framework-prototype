'use strict';
// Current, same-family physical pending-checkpoint chain. Rendering/audio/XHR
// resources are facades; the App, Load, saves, codecs and filesystem are real.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const {fixture: base, flush} = require('../companion-continue/fixture.cjs');
const {method} = require('../companion-continue/io-adapter.cjs');
const scope = process.env.PF_COLD_CASE_ROOT;
// Command-window storage/dispatch and gold/status drawing are facades. Scene_Menu,
// the Map input path, SceneManager push/pop and the PSFlow retry handler stay real.
// Install before PS_BattleFlow so its production Menu hook sees these classes.
function installRetryMenu(G) {
  const scenes = fs.readFileSync(path.join(process.env.PF_E3_NATIVE_ROOT, 'js/reactor_scenes.js'), 'utf8');
  const start = scenes.indexOf('function Scene_Menu()'), end = scenes.indexOf('// Scene_ItemBase', start);
  assert(start >= 0 && end > start, 'fixed native Menu source required');
  vm.runInContext(scenes.slice(start, end), G, {filename: 'pinned-F-load:Scene_Menu'});
  G.Window_MenuCommand = function() { this._list = []; this._handlers = {}; this.active = true; this.makeCommandList(); };
  G.Window_MenuCommand.prototype = Object.create(G.Window_Command.prototype);
  Object.assign(G.Window_MenuCommand.prototype, {
    constructor: G.Window_MenuCommand,
    addOriginalCommands() {},
    makeCommandList() { this.addOriginalCommands(); },
    addCommand(name, symbol, enabled) { this._list.push({name, symbol, enabled}); },
    setHandler(symbol, handler) { this._handlers[symbol] = handler; },
    callHandler(symbol) { return this._handlers[symbol](); },
    activate() { this.active = true; }
  });
  G.Window_MenuCommand.initCommandPosition = function() {};
  G.Scene_Menu.prototype.commandWindowRect = function() { return new G.Rectangle(0, 0, 240, 320); };
  G.Scene_Menu.prototype.createGoldWindow = function() {};
  G.Scene_Menu.prototype.createStatusWindow = function() { this._statusWindow = {refresh() {}}; };
  G.SoundManager.playOk = function() {};
  const display = G.Scene_Map.prototype.createDisplayObjects;
  G.Scene_Map.prototype.createDisplayObjects = function(...args) {
    const result = Reflect.apply(display, this, args); this._mapNameWindow.hide = function() {}; return result;
  };
  for (const name of ['updateCallMenu', 'isMenuEnabled', 'isMenuCalled', 'callMenu']) method(G, scenes, 'Scene_Map.prototype.' + name);
}
function audio(G) {
  for (const channel of ['Bgm', 'Bgs']) {
    G.AudioManager['_current' + channel] = null;
    G.AudioManager['stop' + channel] = function() { this['_current' + channel] = null; };
    G.AudioManager['fadeOut' + channel] = function() { this['_current' + channel] = null; };
    G.AudioManager['replay' + channel] = function(value) { this['_current' + channel] = value; };
  }
}
async function fixture(options = {}) {
  const consumer = options.consumer === true;
  const flags = {resourceFailure: !consumer || options.resourceFailure === true};
  const observed = {loadSuccess: 0, recoverCalls: 0, entries: [], originalAutosaves: [], saveGameCalls: [], versions: null, resourceFailures: 0, retryMenu: null};
  const h = await base({consumer, mismatch: options.mismatch, globalInfoProfile: 'formal-empty-load',
    edit(game, content) {
      if (!consumer) {
        game.steps = 3; game.party[0].hp = 1; game.party[0].status = 'psn';
        game.world.recentCenter = {mapId: 7, x: 2, y: 1, direction: 4};
        game.world.healingSpot = null;
        content.settings = {...content.settings, POISON_IN_FIELD: true, POISON_FAINT_IN_FIELD: true};
      }
    },
    nativeSetup(n) {
      const G = n.G; audio(G);
      if (consumer && options.resourceFailure === true) installRetryMenu(G);
      const XHR = G.XMLHttpRequest;
      G.XMLHttpRequest = class extends XHR {
        send() {
          if (flags.resourceFailure && /Map007\.json$/.test(this.url)) {
            observed.resourceFailures++;
            queueMicrotask(() => { this.status = 0; this.onerror(); });
          } else super.send();
        }
      };
    }
  });
  const {G} = h;
  const tick = () => {
    if (G.$gameScreen._flashDuration > 0) G.$gameScreen._flashDuration--;
    G.$gameScreen.updateFadeOut(); G.$gameScreen.updateFadeIn(); h.tick();
  };
  // Failure/checkpoint boundaries do not require successful native-idle/restore.
  // Each caller supplies its own phase predicate; no ACK or lifecycle is issued.
  const pump = async (predicate, max = 260) => {
    for (let i = 0; i < max; i++) {
      if (predicate()) return;
      G.$gameMessage.clear(); tick(); await flush();
    }
    throw Error('F physical load bounded stop ' + JSON.stringify({map: G.$gameMap.mapId(),
      pending: h.state().world.pendingReturn, blocked: h.app.saveBlocked,
      recovery: G.PSFlow.blackoutLoadRecoveryView(), observed, native: h.nativeConsumer.status()}));
  };
  // Only successful terminal waits consume the current observer. Pending and
  // stable-failed phases keep the independent pump above. ready() is read afresh
  // and authenticates actual App/generation/target restore and post-restore update.
  const pumpSuccessful = (predicate, max = 260) => pump(() => predicate() && h.nativeConsumer.ready(), max);
  const enter = h.app.observeWorldMapEntry;
  h.app.observeWorldMapEntry = function(entry) {
    observed.entries.push({entry: structuredClone(entry), companions: structuredClone(h.records())});
    return Reflect.apply(enter, this, [entry]);
  };
  const recover = h.app.recoverBlackoutReturn;
  h.app.recoverBlackoutReturn = function(...args) { observed.recoverCalls++; return Reflect.apply(recover, this, args); };
  const save = G.DataManager.saveGame;
  G.DataManager.saveGame = function(...args) {
    observed.saveGameCalls.push({slot: args[0], map: G.$gameMap.mapId(), phase: h.state().world.pendingReturn?.phase ?? null});
    return Reflect.apply(save, this, args);
  };
  const execute = G.Scene_Base.prototype.executeAutosave;
  G.Scene_Base.prototype.executeAutosave = function(...args) {
    observed.originalAutosaves.push({map: G.$gameMap.mapId(), phase: h.state().world.pendingReturn?.phase ?? null});
    return Reflect.apply(execute, this, args);
  };
  const load = G.Scene_Load.prototype.onLoadSuccess;
  G.Scene_Load.prototype.onLoadSuccess = function(...args) {
    observed.loadSuccess++; observed.loadGeneration = h.app.stateGeneration; observed.versions = [G.$gameSystem.versionId(), G.$dataSystem.versionId];
    const state = h.state();
    observed.beforeRecovery = {schema: state.schema, pendingReturn: structuredClone(state.world.pendingReturn), hallOfFame: structuredClone(state.hallOfFame)};
    return Reflect.apply(load, this, args);
  };
  const identities = new WeakMap(); let identitySequence = 0;
  const identity = value => value && (typeof value === 'object' || typeof value === 'function')
    ? (identities.has(value) ? identities.get(value) : (identities.set(value, ++identitySequence), identitySequence)) : null;
  const ownData = (value, key) => {
    const descriptor = value && Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return {kind: descriptor ? 'accessor' : 'missing'};
    return Array.isArray(descriptor.value) ? {kind: 'array', length: descriptor.value.length}
      : {kind: 'data', value: descriptor.value};
  };
  const retryReadiness = () => ({scene: identity(G.SceneManager._scene), nextScene: identity(G.SceneManager._nextScene),
    mapScene: G.SceneManager._scene instanceof G.Scene_Map,
    started: ownData(G.SceneManager._scene, '_started'), active: ownData(G.SceneManager._scene, '_active'),
    message: Object.fromEntries(['_texts', '_choices', '_numInputVariableId', '_itemChoiceVariableId'].map(key => [key, ownData(G.$gameMessage, key)])),
    messageBusy: G.$gameMessage.isBusy(), transferring: G.$gamePlayer.isTransferring(),
    saveBlocked: h.app.saveBlocked, encounterBlocked: h.app.encounterBlocked,
    operationPending: G.PSFlow.operationPending(), companionNativePending: G.PSFlow.companionNativePending(),
    recovery: G.PSFlow.blackoutLoadRecoveryView(), native: h.nativeConsumer.status()});
  const retryViaMenu = async () => {
    assert.equal(observed.retryMenu, null, 'only one explicit Menu Retry intent');
    await pump(() => G.SceneManager._scene instanceof G.Scene_Map && G.SceneManager._scene.isStarted()
      && G.SceneManager._scene.isActive() && !G.SceneManager.isSceneChanging() && !G.$gameMessage.isBusy()
      && !G.$gamePlayer.isTransferring() && !h.app.saveBlocked && !h.app.encounterBlocked
      && !G.PSFlow.operationPending() && !G.PSFlow.companionNativePending() && h.nativeConsumer.ready());
    const app = G.PSFlow._app, generation = h.app.stateGeneration, sourceMap = G.SceneManager._scene;
    assert.equal(sourceMap.isMenuEnabled(), true, 'actual source Map permits native Menu');
    observed.retryMenu = {sourceMap: identity(sourceMap), generation, beforeInput: retryReadiness(), inputs: 1, intents: 0};
    G.Input.trigger.add('menu'); tick(); await flush();
    await pump(() => G.SceneManager._scene instanceof G.Scene_Menu && G.SceneManager._scene.isStarted() && G.SceneManager._scene.isActive());
    const menu = G.SceneManager._scene, window = menu._commandWindow;
    assert.equal(G.PSFlow._app, app); assert.equal(h.app.stateGeneration, generation);
    const commands = window._list.filter(row => row.symbol === 'psBlackoutRetry');
    assert.equal(commands.length, 1); assert.equal(commands[0].enabled, true);
    assert.equal(typeof window._handlers.psBlackoutRetry, 'function', 'production Retry handler installed');
    Object.assign(observed.retryMenu, {menu: identity(menu), beforeIntent: retryReadiness(), intents: 1});
    window.callHandler('psBlackoutRetry'); // One real installed UI callback; no raw retry/recover fallback.
    const returnedMap = G.SceneManager._nextScene;
    assert(returnedMap instanceof G.Scene_Map, 'native Menu.pop queued a real Map');
    assert.notEqual(returnedMap, sourceMap, 'native pop creates a new Map instance');
    observed.retryMenu.returnedMap = identity(returnedMap);
  };
  const snapshot = () => ({state: structuredClone(h.state()), map: G.$gameMap.mapId(),
    point: [G.$gamePlayer.x, G.$gamePlayer.y], observed, recovery: G.PSFlow.blackoutLoadRecoveryView(),
    draws: h.draws.slice(), nativeDraws: h.nativeDraws.slice(), fs: h.io.trace, native: h.nativeConsumer.rows, nativeStatus: h.nativeConsumer.status(),
    retryReadiness: retryReadiness()});
  const record = name => {
    h.io.assertPaths(); fs.writeFileSync(path.join(scope, name + '.json'), JSON.stringify(snapshot(), null, 2) + '\n', {flag: 'wx'});
  };
  return {...h, G, flags, observed, nativeObserved: h.observed, tick, pump, pumpSuccessful, retryViaMenu, snapshot, record};
}
module.exports = {fixture, flush};
