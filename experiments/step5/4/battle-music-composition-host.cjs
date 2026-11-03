'use strict';
// Clean controlled host derived from Claude r8's published test probe (SHA
// 074d594d report; source probe SHA recorded externally). Product plugins and
// installed AudioManager/command241 bodies are compiled/read from this tree.
// WebAudio/render/app/session are controlled: no native execution claim.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function createCompositionHostFactory({ROOT,work,plugins}) {
const E=require(path.join(ROOT,'js/engine/build/production.cjs'));
const managers=fs.readFileSync(path.join(ROOT,'js/reactor_managers.js'),'utf8'),objects=fs.readFileSync(path.join(ROOT,'js/reactor_objects.js'),'utf8');
const a=managers.indexOf('\nfunction AudioManager() {'),b=managers.indexOf('\nfunction SoundManager() {');assert(a>=0&&b>a);
const audioSection=managers.slice(a+1,b+1),start=objects.indexOf('\nGame_Interpreter.prototype.command241 = function'),end=objects.indexOf('\n};',start);assert(start>=0&&end>start);const command241=objects.slice(start+1,end+3);
const flush=async()=>{for(let i=0;i<32;i++)await Promise.resolve();};
function world(opt = {}) {
  const root = fs.mkdtempSync(path.join(work, 'game-')); fs.mkdirSync(path.join(root, 'audio/bgm'), { recursive: true });
  for (const n of ['Battle wild', 'Battle trainer', 'Map', 'Intro', 'Authored', 'Default', 'Foreign']) fs.writeFileSync(path.join(root, 'audio/bgm', n + '.ogg'), 'controlled');
  let time = 0, seq = 0; const timers = new Map(), created = [], errors = [], commands = {};
  const w = { root, created, errors, commands, hook: null };
  class WebAudio {
    static _currentTime() { return time / 1000; }
    constructor(url) { Object.assign(this, { _url: url, _loadListeners: [], _stopListeners: [], _ready: !!opt.instant, _error: false, _isPlaying: false, destroys: 0, plays: [], stops: 0, _pos: 0, volume: 1, pitch: 1, pan: 0 }); created.push(this); w.hook?.('create', this); }
    addLoadListener(f) { this._loadListeners.push(f); }
    isReady() { return this._ready && !this.destroys; }
    isError() { return this._error; }
    load() { if (this.destroys) return; this._ready = true; const ls = this._loadListeners.splice(0); for (const f of ls) f(); }
    play(loop, offset) { this._pos = offset || 0; this._loop = loop; this.plays.push({ loop, offset: offset || 0, at: time, frame: G.Graphics.frameCount }); this._isPlaying = true; w.hook?.('play', this); }
    stop() { this._isPlaying = false; this.stops++; this._loadListeners = []; const s = this._stopListeners; while (s.length) s.shift()(); }
    destroy() { this.destroys++; this.stop(); this._ready = false; w.hook?.('destroy', this); }
    seek() { return this._pos; } isPlaying() { return this._isPlaying; }
    fadeIn(d) { (this.fades ??= []).push('in:' + d); } fadeOut(d) { (this.fades ??= []).push('out:' + d); }
    addStopListener(f) { this._stopListeners.push(f); }
  }
  function Base() {}
  Base.prototype = { initialize() { this.children = []; this._started=false; }, create() { this._windowLayer = {}; this.children.push(this._windowLayer); }, start() { this._started=true; }, update() {}, terminate() {}, isReady: () => true, isStarted() { return this._started; },
    addWindow() {}, addChild(s) { this.children.push(s); s.parent = this; }, addChildAt(s, i) { this.children.splice(i, 0, s); s.parent = this; }, removeChild(s) { this.children.splice(this.children.indexOf(s), 1); s.parent = null; },
    popScene() { this.popped = (this.popped || 0) + 1; }, updateWaitMode: () => false, updateChild: () => false, clear() { this._waitMode = ''; }, setWaitMode(mode) { this._waitMode = mode; } };
  function SceneMap() {} SceneMap.prototype = Object.create(Base.prototype);
  function Win() { if (arguments.length) this.initialize(...arguments); } // MZ Window_Base constructors call initialize (attempt-2 fix)
  Win.prototype = { initialize(rect) { this.innerWidth = rect.width - 24; this.innerHeight = rect.height - 24; this.contents = { width: 792, height: 576, clear() {}, fillRect() {}, drawText() {} }; this._index = 0; },
    resetFontSettings() {}, lineHeight: () => 24, textWidth: t => String(t).length * 8, drawText() {}, refresh() { this._list = []; this.makeCommandList?.(); }, addCommand(name, symbol, enabled, ext) { this._list.push({ name, symbol, enabled, ext }); },
    select(i) { this._index = i; }, index() { return this._index; }, setHandler() {}, show() { this.visible = true; }, hide() { this.visible = false; }, activate() { this.active = true; }, deactivate() { this.active = false; }, isOpenAndActive() { return this.active && this.visible; } };
  class Bitmap { constructor(width, height) { this.width = width; this.height = height; this.context = { drawImage() {} }; } fillAll() {} blt() {} drawText() {} destroy() {} }
  class Sprite { constructor(bitmap) { this.bitmap = bitmap; this.anchor = { x: 0, y: 0 }; this.scale = { x: 1, y: 1 }; } destroy() {} }
  function System() {} System.prototype.isSaveEnabled = () => true;
  const req = name => { if (['fs', 'path', 'url'].includes(name)) return require(name); if (name.includes('production.cjs')) return E; throw Error('unexpected require ' + name); };
  req.resolve = () => path.join(root, 'js/engine/build/production.cjs');
  const settings = opt.settings ?? {};
  const manager = { _scene: null, pushed: [], isSceneChanging: () => false,
    push(C) { this.pushed.push(C); if (C === G.Scene_PSBattle) return; const s = new C(); this._scene = s; s.create(); s.start(); },
    goto(C) { this.push(C); }, updateScene() { this._scene?.update?.(); } };
  const G = { Error, structuredClone, console: { log() {}, warn() {}, error: (...x) => errors.push(x.map(String).join(' ')) },
    performance: { now: () => time }, setTimeout(cb, ms) { const id = ++seq; timers.set(id, { cb, at: time + ms }); return id; }, clearTimeout(id) { timers.delete(id); },
    require: req, WebAudio, Utils: { encodeURI: s => s, hasEncryptedAudio: () => false },
    PluginManager: { parameters: () => ({ battleMusic: JSON.stringify(settings) }), registerCommand(p, n, fn) { commands[p + ':' + n] = fn; } },
    Game_Interpreter: Base, Game_System: System, Window_Base: Win, Window_Command: Win, Scene_MenuBase: Base, Scene_Map: SceneMap, SceneManager: manager,
    Graphics: { boxWidth: 816, boxHeight: 624, frameCount: 0 }, Rectangle: function (x, y, width, height) { Object.assign(this, { x, y, width, height }); },
    Input: { isTriggered: () => false, clear() {} }, TouchInput: { clear() {} }, SoundManager: { playBuzzer() {} }, Bitmap, Sprite,
    $gameSystem: new System(), $gameMessage: { isBusy: () => false, add() {} }, $gameVariables: { setValue() {} }, $dataSystem: opt.dataSystem ?? {},
    DataManager: { setupNewGame() {}, extractSaveContents(contents) { G.$gameSystem = contents.system; }, saveGame: async () => true, makeSaveContents: () => ({ system: G.$gameSystem }) } };
  G.window = G; vm.createContext(G);
  vm.runInContext(audioSection, G, { filename: 'reactor_managers.js#AudioManager' });
  vm.runInContext(command241, G, { filename: 'reactor_objects.js#command241' });
  vm.runInContext(plugins.PS_BattleFlow, G, { filename: 'PS_BattleFlow.js' });
  vm.runInContext(plugins.PS_SaveState, G, { filename: 'PS_SaveState.js' });
  G.PSManagement = { inputFrame: () => ({ pressed: new Set() }), presentationPending: () => false };
  if (opt.evolution === 'plugin') vm.runInContext(plugins.PS_Evolution, G, { filename: 'PS_Evolution.js' });
  const flow = G.PSFlow, AM = G.AudioManager, applicationFactory = flow.app, productionTranslator = flow.translator;
  const projection = { id: 'npc', version: 1, presentation: { battleBgm: 'Authored', victoryBgm: 'V', introBgm: opt.intro ?? 'Intro' } };
  const session = { party: [], foeTeam: [], content: {}, bag: {}, finished: false, pendingLearn: null, take: () => [], currentRequest: () => ({ active: [{ moves: [{ id: 'splash', move: 'Splash', pp: 40, maxpp: 40 }] }] }), gw: { readState: () => [] } };
  const app = { stateGeneration: 0, saveBlocked: false, encounterBlocked: false, pendingEvolution: null, pendingReceiving: null, pendingPokedex: null, pendingTrade: null, pendingTriggeredEvolution: null,
    assertHostStateReplacementAllowed() {}, stateReplacedByHost() { this.stateGeneration++; this.saveBlocked = false; this.pendingEvolution = this.pendingReceiving = this.pendingPokedex = null; },
    startNewGame() {}, trainerRecord() { return projection; }, describeLearningMove: () => null,
    async startBattle() { this.saveBlocked = true; return session; }, async startTrainerBattle(r) { return this.startBattle(r); },
    finishBattle(s, r) {
      if (opt.evolution) { this.pendingEvolution = { token: 'evo-1', revision: 1, memberId: 'm1', phase: 'selection', selection: { cancellable: opt.cancellable === true, source: { species: 'Charmeleon' }, target: { species: 'Charizard' } } };
        return { code: 1, commit: 'none', battleId: r.battleId, pending: true, continuationToken: 'evo-1' }; }
      this.saveBlocked = false; return { code: 1, commit: 'applied', battleId: r.battleId };
    },
    abortBattle(r, e) { this.saveBlocked = false; return { code: 0, commit: 'none', battleId: r.battleId, aborted: true, error: String(e) }; },
    resolveEvolution() { this.pendingEvolution = null; this.saveBlocked = false; return { code: 1, commit: 'applied', battleId: flow._op.request.battleId }; } };
  G.$gameSystem._psGame = { party: [], storage: { boxes: [] } };
  Object.assign(flow, { _app: app, app: () => app, content: () => ({}), game: () => G.$gameSystem._psGame, limits: () => ({ party: 6, boxes: 1200 }), speciesName: x => x,
    translator: () => ({ t: k => k, tOr: (_k, f) => f, has: () => false, font: () => 'sans-serif' }) });
  if (opt.productionTranslator) flow.translator = productionTranslator;
  let battleSeq = 0;
  Object.assign(w, { G, AM, flow, app, projection, manager, timers, applicationFactory,
    get time() { return time; },
    tick(ms) { const target = time + ms; for (let guard = 0; guard < 10000; guard++) { const due = [...timers].filter(([, t]) => t.at <= target).sort((x, y) => x[1].at - y[1].at)[0]; if (!due) { time = target; return; } timers.delete(due[0]); time = Math.max(time, due[1].at); due[1].cb(); } throw Error('unbounded timers'); },
    find: name => created.filter(x => x.name === name),
    playWorld(name, pos) { AM.playBgm({ name, volume: 80, pitch: 100, pan: 0 }, pos); const buf = AM._bgmBuffer; buf.load(); buf._pos = pos; return buf; },
    eventPlayBgm(audio) { const i = new G.Game_Interpreter(); return i.command241([audio]); },
    open(trainer = false, presentation) { return flow.openBattle({ kind: trainer ? 'trainer' : 'wild', ...(trainer ? { trainer: { id: 'npc', version: 1 } } : {}), foes: [], seq: 1, battleId: 'r8#' + (++battleSeq), canLose: true }, presentation); },
    async scene() { const s = new G.Scene_PSBattle(); manager._scene = s; s.create(); await flush(); s.ready = s.isReady(); s.start(); return s; },
    channel() { const buf = AM._bgmBuffer, rec = AM._currentBgm; return { buffer: buf ? buf.name : null, bufferDestroyed: buf ? buf.destroys > 0 : null, playing: !!(buf && buf._isPlaying), record: rec ? { name: rec.name, pos: rec.pos ?? null } : null, sequence: AM._bgmSequence ? AM._bgmSequence.key : null, saveBgm: AM.saveBgm() }; },
    music() { const s = flow.musicState(); return s && { phase: s.phase, current: s.current, error: s.error, memo: s.player?.memo ?? null, requests: (s.player?.requests ?? []).map(r => ({ kind: r.kind, state: r.state, detail: r.detail, logical: r.logical && r.logical.name, position: r.position })) }; },
    plays() { return created.flatMap(x => x.plays.map(p => ({ name: x.name, offset: p.offset, frame: p.frame, loop: p.loop }))); } });
  return w;
}

return world;
}
module.exports={createCompositionHostFactory};
