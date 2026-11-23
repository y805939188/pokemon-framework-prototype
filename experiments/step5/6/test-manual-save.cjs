'use strict';
// Pinned Reactor handlers/scene stack, controlled input/output and synthetic storage. No NW or player files.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { join } = require('node:path');
const vm = require('node:vm');
const ROOT = join(__dirname, '../../..');
const manifest = require('../../../scripts/reactor-source-manifest.json').runtime;
require('../../../scripts/tests/ts-source-loader.cjs');
let install, catalogs;
before(async () => {
  ({ installPausePC: install } = await import('../../../src/plugins/navigation/pause-pc.ts'));
  catalogs = await import('../../../src/framework/i18n/locales/navigation.ts');
});
function native(name) {
  const bytes = readFileSync(join(ROOT, 'js', name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest['runtime/' + name]);
  return bytes.toString();
}
const scenes = native('reactor_scenes.js'), windows = native('reactor_windows.js'), managers = native('reactor_managers.js');
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fixture({ lang = 'en', disk = new Map(), width = 512 } = {}) {
  const attempts = [], writes = [], reads = [], sounds = [];
  let triggered = '', repeated = '', saveEnabled = true, writeHook = async () => {};
  const G = vm.createContext({
    Graphics: { boxWidth: width, boxHeight: 384 }, TextManager: { newGame: 'New Game', continue_: 'Continue', options: 'Options' },
    $dataSystem: { gameTitle: 'Synthetic', titleCommandWindow: { background: 0 }, versionId: 12 },
    Rectangle: function (x, y, width, height) { Object.assign(this, { x, y, width, height }); },
    Input: { isTriggered: k => k === triggered, isRepeated: k => k === triggered || k === repeated, update() { triggered = ''; } },
    TouchInput: { update() {} }, SoundManager: Object.fromEntries(['Ok', 'Cancel', 'Buzzer', 'Save', 'Load'].map(x => ['play' + x, () => sounds.push(x)])),
    StorageManager: {
      exists: key => disk.has(key),
      async saveObject(key, value) {
        attempts.push(key); const bytes = JSON.stringify(value);
        await writeHook(key); disk.set(key, bytes); writes.push(key);
      },
      async loadObject(key) { reads.push(key); return JSON.parse(disk.get(key)); },
    },
    PluginManager: { registerCommand() {} }, globalIndex: disk.get('global') ?? '[]',
  });
  const run = js => vm.runInContext(js, G);
  const load = (source, names) => {
    for (const name of names) {
      const start = source.indexOf(name + ' = function'), end = source.indexOf('\n};', start);
      assert.ok(start >= 0 && end > start, name);
      run(source.slice(start, end + 3));
    }
  };
  const block = (source, first, last) => {
    const start = source.indexOf('function ' + first + '()'), end = source.indexOf('function ' + last + '()', start);
    assert.ok(start >= 0 && end > start, first);
    run(source.slice(start, end));
  };
  run(`
    String.prototype.format = function(value) { return this.replace('%1', value); };
    function Window_Base() {}
    Window_Base.prototype.initialize = function(rect) { Object.assign(this,rect); this.visible=true;this.openness=255; };
    Window_Base.prototype.open = function(){ this.openness=255; };
    Window_Base.prototype.close = function(){ this.openness=0; };
    Window_Base.prototype.isOpen = function(){ return this.openness===255; };
    Window_Base.prototype.setBackgroundType = function(){};
    const Window_Scrollable = Window_Base;
    function Window_Help(rect){ this.height=rect.height; this.setText=text=>{this.text=text;}; }
    function Scene_Base() { this.initialize(); }
    Scene_Base.prototype.initialize=function(){this.windows=[];};
    Scene_Base.prototype.addWindow=function(w){this.windows.push(w);};
    Scene_Base.prototype.stop=Scene_Base.prototype.create=Scene_Base.prototype.start=Scene_Base.prototype.terminate=Scene_Base.prototype.fadeOutAll=function(){};
    function Scene_MenuBase(){this.initialize();}
    Scene_MenuBase.prototype=Object.create(Scene_Base.prototype);
    Scene_MenuBase.prototype.calcWindowHeight=n=>n*36+24;
    Scene_MenuBase.prototype.mainAreaTop=()=>52;
    Scene_MenuBase.prototype.mainAreaHeight=()=>Graphics.boxHeight-52;
    function Scene_Boot(){}
    Scene_Boot.prototype.checkPlayerLocation=function(){};
    function Scene_Map(){this.initialize();}
    Scene_Map.prototype=Object.create(Scene_Base.prototype);Scene_Map.prototype.constructor=Scene_Map;
    function Scene_Title(){this.initialize();}
    Scene_Title.prototype=Object.create(Scene_Base.prototype);Scene_Title.prototype.constructor=Scene_Title;
    Scene_Title.prototype.commandWindowRect=()=>new Rectangle(20,20,180,132);
    Scene_Title.prototype.create=function(){this.createCommandWindow();this._commandWindow.open();};
    Scene_Title.prototype.adjustBackground=Scene_Title.prototype.playTitleMusic=Scene_Title.prototype.startFadeIn=function(){};
    Scene_Title.prototype.fadeSpeed=()=>24;
    function Scene_Menu(){this.initialize();}
    Scene_Menu.prototype=Object.create(Scene_MenuBase.prototype);Scene_Menu.prototype.constructor=Scene_Menu;
    Scene_Menu.prototype.create=function(){this.createCommandWindow();this._goldWindow=this._statusWindow={hide(){}};};
    for(const name of ['commandItem','commandPersonal','commandFormation','commandOptions'])Scene_Menu.prototype[name]=function(){};
    function Scene_GameEnd(){this.initialize();}
    Scene_GameEnd.prototype=Object.create(Scene_MenuBase.prototype);Scene_GameEnd.prototype.constructor=Scene_GameEnd;
    Scene_GameEnd.prototype.commandWindowRect=()=>new Rectangle(20,20,180,96);
    Scene_GameEnd.prototype.create=function(){this.createCommandWindow();};
    function Game_Interpreter(){}
    Game_Interpreter.prototype.updateWaitMode=function(){return false;};
    var SceneManager={_stack:[],_scene:null,_nextScene:null};
    var DataManager={maxSavefiles:()=>20,isEventTest:()=>false,loadAllSavefileImages(){},correctDataErrors(){}};
    var $gameSystem,$gameParty,$gameScreen,$gameTimer,$gameSwitches,$gameVariables,$gameSelfSwitches,$gameActors,$gameMap,$gamePlayer;
    function Game_System() {}
    Game_System.prototype.setSavefileId=function(n){this.slot=n;};
    Game_System.prototype.savefileId=function(){return this.slot;};
    Game_System.prototype.isAutosaveEnabled=function(){return true;};
    Game_System.prototype.isSaveEnabled=function(){return globalThis.saveEnabled();};
    Game_System.prototype.onBeforeSave=function(){this.saveCount++;};
    Game_System.prototype.onAfterLoad=function(){this.afterLoad=true;};
    Game_System.prototype.playtimeText=function(){return '0:00';};
    Game_System.prototype.versionId=function(){return 12;};
    DataManager.createGameObjects=function(){
      $gameSystem=Object.assign(new Game_System(),{saveCount:0,_psGame:{money:0,party:[]}});
      $gameScreen=$gameTimer=$gameSwitches=$gameVariables=$gameSelfSwitches=$gameActors=$gameMap={};
      $gameParty={setupStartingMembers(){},charactersForSavefile:()=>[],facesForSavefile:()=>[],exists:()=>false};
      $gamePlayer={setupForNewGame(){this.x=8;this.y=9;}};
    };
    DataManager.saveGlobalInfo=function(info){return StorageManager.saveObject('global',info);};
    DataManager.savefileInfo=function(slot){return this._globalInfo[slot];};
    DataManager._globalInfo=JSON.parse(globalThis.globalIndex);
  `);
  G.saveEnabled = () => saveEnabled;
  load(windows, ['show', 'hide', 'activate', 'deactivate', 'playOkSound', 'playBuzzerSound'].map(k => 'Window_Base.prototype.' + k));
  block(windows, 'Window_Selectable', 'Window_HorzCommand');
  // Only rendering, scrolling and window geometry are stubbed. Native handlers and input admission are exercised.
  for (const key of ['refresh','refreshCursor','ensureCursorVisible','clearScrollStatus','setTopRow']) G.Window_Selectable.prototype[key] = () => {};
  block(windows, 'Window_MenuCommand', 'Window_MenuStatus');
  block(windows, 'Window_SavefileList', 'Window_ShopCommand');
  block(windows, 'Window_TitleCommand', 'Window_DebugRange');
  block(scenes, 'Scene_File', 'Scene_GameEnd');
  const methods = (source, prefix, list) => load(source, list.split(' ').map(k => prefix + k));
  methods(scenes, 'Scene_Base.prototype.', 'popScene');
  methods(scenes, 'Scene_Boot.prototype.', 'startNormalGame');
  methods(scenes, 'Scene_Title.prototype.', 'start createCommandWindow commandNewGame commandContinue commandOptions');
  methods(scenes, 'Scene_Menu.prototype.', 'createCommandWindow commandSave commandGameEnd');
  methods(scenes, 'Scene_GameEnd.prototype.', 'createCommandWindow commandToTitle');
  methods(managers, 'SceneManager.', 'goto push pop exit isSceneChanging clearStack');
  methods(managers, 'DataManager.', 'setupNewGame isAnySavefileExists latestSavefileId earliestSavefileId emptySavefileId selectSavefileForNewGame savefileExists saveGame loadGame makeSavename makeSavefileInfo makeSaveContents extractSaveContents');
  // Native data shape with test-only JSON serialization; JsonEx and PS_SaveState aren't replaced in production.
  const extract = G.DataManager.extractSaveContents;
  G.DataManager.extractSaveContents = function (contents) {
    Object.setPrototypeOf(contents.system, G.Game_System.prototype);
    extract.call(this, contents);
  };
  const catalog = lang === 'zh' ? catalogs.navigationChinese : catalogs.navigationEnglish;
  const translator = { lang, t(key, params = {}) { return catalog[key].replace(/\{(\w+)\}/g, (_, k) => params[k]); } };
  G.$dataSystem.menuCommands = [false,false,false,false,false,true];
  const m = G.SceneManager;
  const transition = () => {
    if (!m._nextScene) return;
    m._scene?.terminate(); m._scene = m._nextScene; m._nextScene = null;
    m._scene.create(); m._scene.start();
  };
  const scene = () => m._scene;
  const input = (window, key, held = false) => {
    if (held) repeated = key; else triggered = key;
    window.processHandling();
    triggered = repeated = '';
  };
  const command = (symbol) => { const w = scene()._commandWindow; w.selectSymbol(symbol); input(w, 'ok'); transition(); };
  const slot = n => { const w = scene()._listWindow; w.selectSavefile(n); input(w, 'ok'); transition(); };
  const answer = (symbol, held = false) => { const w = scene()._psSaveChoice; if(symbol)w.selectSymbol(symbol); input(w, 'ok', held); transition(); };
  install(G, () => ({ game: () => G.$gameSystem._psGame, translator: () => translator }), {});
  new G.Scene_Boot().startNormalGame(); transition();
  return { G, m, scene, transition, input, command, slot, answer, disk, attempts, writes, reads, sounds,
    menu() { m.push(G.Scene_Menu); transition(); },
    game: () => G.$gameSystem._psGame, allow(value) { saveEnabled = value; }, writeHook(fn) { writeHook = fn; } };
}

for (const lang of ['en','zh']) test(lang + ' title → New Game → pause Save → explicit Yes → title → fresh Continue restores manual slot', async () => {
  const h = fixture({ lang });
  assert.equal(h.scene()._commandWindow._list.find(r => r.symbol === 'continue').enabled, false);
  h.command('newGame'); assert.equal(h.scene().constructor, h.G.Scene_Map);
  Object.assign(h.game(), { money: 2468, party: ['synthetic member'] });
  h.menu(); h.command('save');
  assert(h.scene() instanceof h.G.Scene_Save);
  h.slot(4);
  assert.match(h.scene()._helpWindow.text, lang === 'zh' ? /保存游戏到存档 4/ : /Save your game to slot 4/);
  assert(h.scene()._psSaveChoice.active); assert(!h.scene()._listWindow.active);
  assert.equal(h.scene()._psSaveChoice.currentSymbol(), 'no');
  assert.deepEqual(h.attempts, []); assert.equal(h.G.$gameSystem.saveCount, 0);
  h.answer('yes', true); assert.deepEqual(h.attempts, [], 'a held OK cannot choose Yes');
  h.answer('yes'); h.answer('yes'); await tick(); h.transition();
  assert.deepEqual(h.writes, ['file4','global']); assert.equal(h.G.$gameSystem.saveCount, 1);
  assert.equal(h.scene().constructor, h.G.Scene_Menu);
  h.command('gameEnd'); h.command('toTitle');
  assert.equal(h.scene().constructor,h.G.Scene_Title); assert.equal(h.m._stack.length,0);
  assert(h.scene()._commandWindow._list.find(r=>r.symbol==='continue').enabled);
  const cold = fixture({ lang, disk: h.disk });
  assert.equal(cold.game().money, 0, 'the new host has only its blank boot state until Continue');
  cold.command('continue'); assert.equal(cold.scene().constructor, cold.G.Scene_Load);
  cold.slot(4); await tick(); cold.transition();
  assert.equal(cold.scene().constructor,cold.G.Scene_Map);
  assert.deepEqual(cold.reads,['file4']); assert.deepEqual(cold.attempts,[]);
  assert.deepEqual(cold.game(),{money:2468,party:['synthetic member']}); assert(cold.G.$gameSystem.afterLoad);
});

test('default No and Back leave exact existing bytes untouched even without a title-index row', () => {
  const disk = new Map([['file6','synthetic old file bytes']]);
  const h = fixture({ lang:'zh', disk });
  h.command('newGame'); h.menu(); h.command('save'); h.slot(6);
  const s = h.scene(); assert.match(s._helpWindow.text,/覆盖/); assert.equal(s._psSaveChoice.currentSymbol(),'no');
  for(const key of ['ok','cancel']) {
    const original = h.G.$gameSystem.savefileId();
    h.input(s._psSaveChoice,key); assert(s._listWindow.active); assert(!s._psSaveChoice.visible);
    assert.equal(s._listWindow.savefileId(),6); assert.equal(h.G.$gameSystem.savefileId(),original);
    assert.equal(disk.get('file6'),'synthetic old file bytes'); assert.deepEqual(h.attempts,[]);
    h.slot(6);
  }
});

test('holding No or Back after dismissal cannot reopen or exit the pause Save list', () => {
  const h = fixture(); h.command('newGame'); h.menu(); h.command('save');
  const s = h.scene(), list = s._listWindow, choice = s._psSaveChoice;
  for (const key of ['ok', 'cancel']) {
    h.slot(5);
    h.input(choice, key, true); assert(choice.active, 'held input cannot dismiss the modal');
    h.input(choice, key); assert(list.active); assert(!choice.active);
    for (let n = 0; n < 3; n++) { h.input(list, key, true); h.transition(); }
    assert.equal(h.scene(), s); assert(list.active); assert(!choice.active); assert.equal(list.savefileId(), 5);
  }
  assert.deepEqual(h.attempts, []);
  h.input(list, 'cancel'); h.transition(); assert.equal(h.scene().constructor, h.G.Scene_Menu);
});

test('a slot newly occupied during confirmation is prompted again, then overwritten only on Yes', async () => {
  const h=fixture(); h.command('newGame'); h.menu(); h.command('save'); h.slot(3);
  h.disk.set('file3','new synthetic bytes');
  h.answer('yes'); assert.match(h.scene()._helpWindow.text,/Overwrite the save in slot 3/);
  assert.equal(h.scene()._psSaveChoice.currentSymbol(),'no'); assert.deepEqual(h.attempts,[]);
  h.answer('yes'); await tick(); h.transition();
  assert.deepEqual(h.writes,['file3','global']); assert.notEqual(h.disk.get('file3'),'new synthetic bytes');
});

test('newly disabled saving and deferred failure recover the same slot for a successful retry', async () => {
  const h=fixture(); h.command('newGame'); h.menu(); h.command('save'); h.slot(4); h.allow(false);
  const s=h.scene(); h.answer('yes'); assert.deepEqual(h.attempts,[]); assert(s._listWindow.active);
  assert.equal(s._helpWindow.text,'Save failed.'); assert.equal(h.G.$gameSystem.saveCount,0);
  h.allow(true);
  let rejectWrite;
  h.writeHook(() => new Promise((_, reject) => { rejectWrite = reject; }));
  h.slot(4); h.answer('yes');
  assert.deepEqual(h.attempts, ['file4']); assert(!s._listWindow.active); assert(!s._psSaveChoice.active);
  for (const key of ['ok', 'cancel']) {
    for (const window of [s._listWindow, s._psSaveChoice]) { h.input(window, key); h.input(window, key, true); }
  }
  h.transition(); assert.equal(h.scene(), s); assert.deepEqual(h.attempts, ['file4']);
  rejectWrite(Error('synthetic I/O refusal')); await tick();
  assert.equal(h.scene(),s); assert(s._listWindow.active); assert.equal(s._listWindow.savefileId(),4);
  assert.equal(s._helpWindow.text,'Save failed.'); assert.deepEqual(h.attempts,['file4']); assert.deepEqual(h.writes,[]);
  assert(!h.disk.has('file4'));
  h.writeHook(async () => {});
  h.input(s._listWindow, 'ok'); h.answer('yes'); await tick(); h.transition();
  assert.deepEqual(h.attempts, ['file4', 'file4', 'global']); assert.deepEqual(h.writes, ['file4', 'global']);
  assert.equal(h.scene().constructor, h.G.Scene_Menu);
});

test('native Scene_Save call sites remain unchanged and never admit a manual write to autosave slot zero', async () => {
  const h=fixture(); h.command('newGame');
  h.m.push(h.G.Scene_Save); h.transition(); const s=h.scene();
  h.slot(0); assert.deepEqual(h.attempts,[]);
  h.slot(7); await tick(); h.transition();
  assert.deepEqual(h.writes,['file7','global']); assert.equal(s._psSaveChoice,undefined);
  assert.equal(h.scene().constructor,h.G.Scene_Map);
});
