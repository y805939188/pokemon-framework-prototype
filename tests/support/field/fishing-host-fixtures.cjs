'use strict';
require('./regular-field-action-test-runtime.cjs').prepare('fishing-host');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const out = process.env.PF_FISHING_HOST_OUT;
assert(out, 'PF_FISHING_HOST_OUT points at the private tsc output');
const hostModule = require(path.join(out, 'plugins/world/fishing-host.js'));
const rules = require(path.join(out, 'framework/rules/fishing.js'));
const { hostInput } = require(path.join(out, 'plugins/host-input.js'));
function runtime(options = {}) {
  const listeners = new Map(), documentListeners = new Map(), log = [], advances = [], draws = [];
  let now = 0, focused = true, owner = {}, currentOwner = owner, session, state;
  const player = {
    x: 5, y: 6, _pattern: 1, _directionFix: options.locked ?? false, _stepAnime: false, _walkAnime: true, animation: false,
    direction: () => 6, setPattern(v) { this._pattern = v; log.push('pattern:' + v); },
    setDirectionFix(v) { this._directionFix = v; }, setStepAnime(v) { this._stepAnime = v; }, setWalkAnime(v) { this._walkAnime = v; },
    isAnimationPlaying() { return this.animation; },
  };
  const map = { id: 1, mapId() { return this.id; }, isValid: (x, y) => x >= 0 && y >= 0, isPassable(x, y, d) { log.push(['passable', x, y, d]); return true; },
    roundXWithDirection: (x, d) => x + (d === 6 ? 1 : d === 4 ? -1 : 0),
    roundYWithDirection: (y, d) => y + (d === 2 ? 1 : d === 8 ? -1 : 0), terrainTag(x, y) { log.push(['terrain', x, y]); return 7; } };
  const message = { _texts: [], busy: false, add(text) { this._texts.push(text); this.busy = true; window.closed = false; log.push('message:' + text); },
    isBusy() { return this.busy; }, clear() { this._texts = []; this.busy = false; },
    setFaceImage() {}, setBackground() {}, setPositionType() {}, setSpeakerName() {} };
  const window = { closed: true, isClosed() { return this.closed; }, terminateMessage() { message.clear(); this.closed = true; log.push('terminated-owned-message'); } };
  const root = {
    $gameMap: map, $gamePlayer: player, $gameMessage: message,
    $gameTemp: { _animationQueue: [], reserveCommonEvent() { assert.fail('must never reserve globally'); }, requestAnimation(targets, animationId) { this._animationQueue.push({ targets, animationId }); player.animation = true; } },
    $dataAnimations: [null, {}, {}, {}], $dataCommonEvents: [],
    $gameSystem: {}, ImageManager: { loadFace() {}, loadPicture() {} },
    SceneManager: { _scene: { _messageWindow: window }, isSceneChanging: () => false },
    performance: { now: () => now }, Graphics: { frameCount: 0 },
    Input: { keyMapper: {}, keys: new Set(), isTriggered(key) { return this.keys.has(key); }, isPressed(key) { return this.keys.has(key); }, isRepeated: () => false,
      clear() { this.keys.clear(); log.push('input-cleared'); } }, TouchInput: { isCancelled: () => false },
    document: { hasFocus: () => focused, addEventListener(kind, fn) { if (!documentListeners.has(kind)) documentListeners.set(kind, new Set()); documentListeners.get(kind).add(fn); } },
    addEventListener(kind, fn) { if (!listeners.has(kind)) listeners.set(kind, new Set()); listeners.get(kind).add(fn); },
    removeEventListener(kind, fn) { listeners.get(kind)?.delete(fn); },
  };
  // Exercise the installed MZ interpreter update/child/command implementations with narrow runtime dependencies.
  const sourcePath = process.env.PF_MZ_OBJECTS;
  assert(sourcePath, 'PF_MZ_OBJECTS is the installed reactor_objects.js read-only source');
  const source = fs.readFileSync(sourcePath, 'utf8');
  function Game_Interpreter(depth = 0) { this.initialize(depth); }
  root.Game_Interpreter = Game_Interpreter;
  vm.createContext(root);
  for (const name of ['initialize', 'checkOverflow', 'clear', 'setup', 'loadImages', 'isOnCurrentMap', 'isRunning', 'update', 'updateChild', 'updateWait', 'updateWaitCount', 'updateWaitMode', 'setWaitMode', 'wait', 'currentCommand', 'nextEventCode', 'executeCommand', 'checkFreeze', 'terminate', 'command101', 'command117', 'setupChild', 'command230', 'command355']) {
    const marker = 'Game_Interpreter.prototype.' + name + ' = function', start = source.indexOf(marker), end = source.indexOf('\n};', start);
    assert(start >= 0 && end > start, 'installed method ' + name);
    vm.runInContext(source.slice(start, end + 4), root, { filename: 'installed-reactor:' + name });
  }
  root.require=name=>{assert.equal(name,'node:util');return require(name);};
  const characters=require('./fishing-character-fixture.cjs').install(root);
  const {createFishingCharacters}=require(path.join(out,'plugins/world/fishing-character-mz.js'));
  const input = hostInput(root);
  const characterHost=createFishingCharacters(root,characters.profiles);
  const host = hostModule.createFishingHost(root, { input, characters:characterHost, assertCurrent(candidate) { if (candidate !== currentOwner) throw Error('stale-owner'); },
    beginCommonEventId: options.beginCommonEventId, endCommonEventId: options.endCommonEventId });
  const random = upper => { draws.push(upper); return options.random ? options.random(upper, draws.length) : 0; };
  const receive = advance => {
    advances.push(advance);
    if (!state) return;
    const next = rules.advanceFishing(state, advance, random); state = next.state;
    for (const effect of next.effects) session.run(effect);
  };
  return {
    root, player, map, message, window, characters, characterHost, log, advances, draws, input, host,
    get session() { return session; }, get state() { return state; }, get now() { return now; },
    begin(raw = false, extra = {}) {
      session = host.begin(owner, receive);
      if (!raw) { const next = rules.startFishing({ rod: 1, allowBite: true, accelerated: false, autoHook: false, surfing: false, ...extra }, session.sample()); state = next.state; next.effects.forEach(e => session.run(e)); }
      return session;
    },
    tick(ms = 0, keys = []) { now += ms; root.Graphics.frameCount++; root.Input.keys = new Set(keys); session.update(); },
    closeMessage() { message.clear(); window.closed = true; },
    finishAnimation() { root.$gameTemp._animationQueue.length = 0; player.animation = false; },
    fire(kind, ms = 0) { now += ms; focused = kind !== 'blur'; for (const fn of listeners.get(kind) ?? []) fn(); },
    key(kind, code) { for (const fn of documentListeners.get(kind) ?? []) fn({ code }); },
    replace() { currentOwner = {}; },
    get focusListeners() { return listeners.get('focus')?.size ?? 0; },
    waiting() {
      this.tick(200); assert.equal(state.pending.kind, 'open-message'); this.closeMessage(); this.tick();
      assert.equal(state.pending.kind, 'dots'); this.closeMessage(); this.tick(); assert.equal(state.phase, 'waiting');
    },
    windowReady() {
      this.waiting();
      while (state.phase === 'waiting') { this.tick(400); if (state.pending?.kind === 'dots') { this.closeMessage(); this.tick(); } }
      assert.equal(state.pending.kind, 'exclamation'); this.finishAnimation(); this.tick(); assert.equal(state.pending.kind, 'bite-message');
      this.closeMessage(); this.tick(); assert.equal(state.phase, 'bite-window');
    },
    finish() {
      for (let n = 0; n < 12 && state.phase !== 'done'; n++) { this.closeMessage(); this.finishAnimation(); this.tick(200); }
      assert.equal(state.phase, 'done'); return state.completion;
    },
  };
}
function native(root, source, constructor, names) {
  root[constructor] ??= function() {};
  for (const name of names) {
    const marker = constructor + '.prototype.' + name + ' = function', start = source.indexOf(marker), end = source.indexOf('\n};', start);
    assert(start >= 0 && end > start, 'installed method ' + marker);
    vm.runInContext(source.slice(start, end + 4), root, { filename: 'installed-reactor:' + constructor + '.' + name });
  }
  return root[constructor].prototype;
}
function nativeMessages(h) {
  const objects = fs.readFileSync(process.env.PF_MZ_OBJECTS, 'utf8');
  const windows = fs.readFileSync(path.join(path.dirname(process.env.PF_MZ_OBJECTS), 'reactor_windows.js'), 'utf8');
  Object.assign(h.message, native(h.root, objects, 'Game_Message', ['clear', 'add', 'hasText', 'isChoice', 'isNumberInput', 'isItemChoice', 'isBusy', 'choices', 'setChoices', 'choiceCancelType', 'setChoiceBackground', 'setChoicePositionType', 'setChoiceCallback', 'onChoice', 'setNumberInput', 'numInputVariableId', 'numInputMaxDigits', 'setItemChoice', 'itemChoiceVariableId', 'setScroll']));
  h.message.clear();
  native(h.root, objects, 'Game_Interpreter', ['command102', 'setupChoices', 'command103', 'setupNumInput', 'command104', 'setupItemChoice', 'command105']);
  vm.runInContext('Array.prototype.clone = function() { return this.slice(); }; Number.prototype.clamp = function(min, max) { return Math.min(Math.max(this, min), max); };', h.root);
  const values = new Map();
  h.root.$gameVariables = { value: id => values.get(id) ?? 0, setValue(id, value) { values.set(id, value); h.log.push(['variable', id, value]); } };
  Object.assign(h.window, native(h.root, windows, 'Window_Message', ['terminateMessage', 'startInput', 'updateInput', 'isAnySubWindowActive']), {
    close() { this.closed = true; }, _goldWindow: { close() {} }, _textState: {}, _waitCount: 4, pause: true,
  });
  const create = (constructor, names) => Object.assign({}, native(h.root, windows, constructor, names), {
    active: false, opened: false, _messageWindow: h.window,
    updatePlacement() {}, updateBackground() {}, placeCancelButton() {}, placeButtons() {}, createContents() {}, refresh() {}, scrollTo() {}, selectDefault() {},
    open() { this.opened = true; }, close() { this.opened = false; }, activate() { this.active = true; }, deactivate() { this.active = false; },
    select() {}, forceSelect() {}, index: () => 0, item: () => ({ id: 7 }), playOkSound() {}, updateInputData() {},
  });
  const choice = h.window._choiceListWindow = create('Window_ChoiceList', ['start', 'callOkHandler', 'callCancelHandler']);
  const number = h.window._numberInputWindow = create('Window_NumberInput', ['start', 'processOk']);
  const item = h.window._eventItemWindow = create('Window_EventItem', ['start', 'onOk', 'onCancel']);
  const scroll = h.root.SceneManager._scene._scrollTextWindow = Object.assign({}, native(h.root, windows, 'Window_ScrollText', ['terminateMessage']), {
    _text: null, hidden: true, hide() { this.hidden = true; },
  });
  return { choice, number, item, scroll, values };
}
function nativePresentation(h) {
  const objects = fs.readFileSync(process.env.PF_MZ_OBJECTS, 'utf8');
  native(h.root, objects, 'Game_Interpreter', ['command205', 'command211', 'character']);
  h.root.$gameParty = { inBattle: () => false }; h.map.refreshIfNeeded = () => {};
  h.player.forceMoveRoute = route => { h.player.route = route; h.log.push(['native-force-route', route]); };
  h.player.setTransparent = value => { h.player._transparent = value; };
}
function nativeMoveRoutes(h) {
  nativePresentation(h);
  const objects = fs.readFileSync(process.env.PF_MZ_OBJECTS, 'utf8');
  const proto = native(h.root, objects, 'Game_Character', ['forceMoveRoute', 'memorizeMoveRoute', 'restoreMoveRoute', 'isMoveRouteForcing', 'updateRoutineMove', 'processMoveCommand', 'advanceMoveRouteIndex', 'processRouteEnd']);
  const start = objects.indexOf('Game_Character.ROUTE_END ='), end = objects.indexOf('Game_Character.prototype.initialize', start);
  vm.runInContext(objects.slice(start, end), h.root, { filename: 'installed-reactor:route-constants' });
  Object.assign(h.player, proto, {
    _moveRouteForcing: false, _moveRoute: { list: [{ code: 0, parameters: [] }], repeat: false, skippable: false }, _moveRouteIndex: 0,
    _originalMoveRoute: null, _originalMoveRouteIndex: 0, _waitCount: 0,
    setMovementSuccess(value) { this.success = value; }, isMovementSucceeded() { return this.success; },
    setImage(name, index) { this._characterName = name; this._characterIndex = index; },
  });
}
module.exports = { runtime, nativeMessages, nativePresentation, nativeMoveRoutes, ...hostModule, rules };
