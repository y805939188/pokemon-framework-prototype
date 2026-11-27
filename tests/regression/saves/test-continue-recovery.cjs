'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const {createHost, section, sha} = require('../../../experiments/step5/4/mz-slot-host.cjs');
const F = require('../../../experiments/step5/3/fixtures-migration7/fixtures.cjs');
const E = require('../../../js/engine/build/production.cjs');

const root = path.resolve(__dirname, '../../..');
const native = [
  'js/reactor_core.js', 'js/reactor_managers.js', 'js/reactor_scenes.js',
  'js/reactor_windows.js', 'js/libs/pako.min.js', 'js/plugins/PS_SaveState.js'
];
const bytes = Object.fromEntries(native.map(name => [name, fs.readFileSync(path.join(root, name))]));
const manifest = Object.fromEntries(native.map(name => [name, sha(bytes[name])]));
const begin = Object.fromEntries(['System', 'Screen', 'Timer', 'Switches', 'Variables',
  'SelfSwitches', 'Actors', 'Party', 'Map', 'Player'].map(name =>
    [name[0].toLowerCase() + name.slice(1), 'Game_' + name]));
const settle = () => new Promise(setImmediate);

function installScenes(g, trace, override) {
  const load = (file, from, to) => vm.runInContext(section(bytes[file].toString('utf8'), from, to), g);
  g.trace = trace;
  g.SoundManager = {playBuzzer() { trace.push('buzzer'); }, playLoad() { trace.push('load-sound'); }};
  g.TextManager = {loadMessage:'Load which file?'};
  g.Graphics.boxWidth = 512;
  g.SceneManager = {_stack:[], _scene:null, _nextScene:null, snapForBackground() {}};
  g.PluginManager = {parameters(name) { return name === 'PS_BattleFlow' ? {language:'zh'} : {}; }};
  g.PSFlow.lang = override;
  g.$dataSystem.versionId = 544;
  // Controlled rendering and transition frames. The installed methods own the
  // command routing, slot selection, help text, sound and post-load requests.
  vm.runInContext("function Scene_Base() {}\n" +
    "Scene_Base.prototype.initialize = function () { this._commandWindow = {close(){trace.push('title-command-close');}}; };\n" +
    "Scene_Base.prototype.stop = function () {};\n" +
    "Scene_Base.prototype.terminate = function () {};\n" +
    "Scene_Base.prototype.fadeOutAll = function () { trace.push('fade'); };\n" +
    "Scene_Base.prototype.addWindow = function () {};\n" +
    "Scene_Base.prototype.mainAreaTop = function () { return 0; };\n" +
    "Scene_Base.prototype.mainAreaHeight = function () { return 384; };\n" +
    "Scene_Base.prototype.calcWindowHeight = function () { return 60; };\n" +
    "function Scene_MenuBase() {}\n" +
    "Scene_MenuBase.prototype = Object.create(Scene_Base.prototype);\n" +
    "Scene_MenuBase.prototype.create = Scene_MenuBase.prototype.start = function () {};\n" +
    "function Scene_Map() {}\n" +
    "function Rectangle(x,y,width,height) { Object.assign(this,{x,y,width,height}); }\n" +
    "function Window_Base() {}\n" +
    "Window_Base.prototype.initialize = function (r) { this.height = r.height; this.contents = {clear(){}}; };\n" +
    "Window_Base.prototype.baseTextRect = function () { return {x:8,y:0,width:472}; };\n" +
    "Window_Base.prototype.drawTextEx = function (text) { trace.push({help:text}); };\n" +
    "function Window_Selectable() {}\n" +
    "Window_Selectable.prototype.initialize = function () { this.handlers = {}; };\n" +
    "Window_Selectable.prototype.setHandler = function (key, method) { this.handlers[key] = method; };\n" +
    "Window_Selectable.prototype.activate = function () { this.active = true; };\n" +
    "Window_Selectable.prototype.index = function () { return this.selected; };\n" +
    "Window_Selectable.prototype.select = function (index) { this.selected = index; };\n" +
    "Window_Selectable.prototype.refresh = Window_Selectable.prototype.setTopRow = function () {};\n" +
    "Game_System.prototype.isAutosaveEnabled = function () { return false; };\n" +
    "Game_System.prototype.versionId = function () { return 544; };\n" +
    "Game_System.prototype.onAfterLoad = function () { trace.push('after-load'); };", g);
  load('js/reactor_managers.js', 'SceneManager.goto = function', 'SceneManager.exit = function');
  load('js/reactor_scenes.js', 'Scene_Base.prototype.popScene = function', 'Scene_Base.prototype.checkGameover = function');
  load('js/reactor_scenes.js', 'function Scene_Title()', 'function Scene_Map()');
  load('js/reactor_scenes.js', 'function Scene_File()', 'function Scene_Save()');
  load('js/reactor_scenes.js', 'function Scene_Load()', 'function Scene_GameEnd()');
  load('js/reactor_windows.js', 'function Window_Help()', 'function Window_Gold()');
  load('js/reactor_windows.js', 'function Window_SavefileList()', 'function Window_ShopCommand()');
  g.DataManager.loadAllSavefileImages = () => {};
}

function setup(t, override) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-continue-recovery-'));
  t.after(() => fs.rmSync(folder, {recursive:true, force:true}));
  const content = F.content(E), trace = [];
  const h = createHost(root, root, folder, content, manifest, g => installScenes(g, trace, override));
  const g = h.context;
  g.$gameSystem._psGame = E.state.newGame({party:[], money:7, content});
  g.SceneManager._scene = new g.Scene_Title();
  function changeScene() {
    const manager = g.SceneManager;
    assert(manager._nextScene);
    manager._scene.terminate?.();
    manager._scene = manager._nextScene;
    manager._nextScene = null;
    if (manager._scene instanceof g.Scene_Load) {
      manager._scene.create();
      manager._scene.start();
    }
    return manager._scene;
  }
  function openContinue() {
    assert(g.SceneManager._scene instanceof g.Scene_Title);
    g.SceneManager._scene.commandContinue();
    return changeScene();
  }
  async function loadSlot(scene, slot) {
    assert.equal(g.SceneManager._scene, scene);
    assert(scene._listWindow.active);
    scene._listWindow.selectSavefile(slot);
    assert.equal(scene.savefileId(), slot);
    scene._listWindow.active = false;
    scene._listWindow.handlers.ok();
    await settle();
  }
  function saveFixture(slot, raw) {
    const contents = Object.fromEntries(Object.entries(begin).map(([key, cls]) => [key, new g[cls]()]));
    contents.system._psGame = raw;
    return g.StorageManager.saveObject('file' + slot, contents);
  }
  function snapshot() {
    return Object.fromEntries(fs.readdirSync(folder).sort().map(f => [f, sha(fs.readFileSync(path.join(folder,f)))]));
  }
  return {h,g,content,trace,openContinue,changeScene,loadSlot,saveFixture,snapshot};
}

for (const c of [
  {name:'future schema', override:null, code:'unknown-version', message:'无法载入存档。请选择其他存档。', returnToTitle:false},
  {name:'unmappable old species', override:'en', code:'unmapped-species', message:'Load failed. Pick another slot.', returnToTitle:true}
]) {
  test('Continue recovers from ' + c.name + ' without touching either slot', async t => {
    const x = setup(t, c.override), {g, h} = x;
    const validOld = F.version(E, 3, x.content);
    const bad = structuredClone(validOld);
    if (c.code === 'unknown-version') bad.schema = 999;
    else bad.party[0].species = 'SyntheticMissingSpecies';
    const good = c.returnToTitle ? E.state.newGame({party:[],money:543,content:x.content}) : validOld;
    await x.saveFixture(1,bad);
    await x.saveFixture(2,good);
    await g.StorageManager.saveObject('global', [null,{timestamp:2},{timestamp:1}]);
    await h.drain();
    const before = x.snapshot(), writesBefore = h.records(), ioBefore = h.io.length;
    assert.deepEqual(Object.keys(before), ['file1.rmmzsave','file2.rmmzsave','global.rmmzsave']);
    g.DataManager._globalInfo = null;
    g.DataManager.loadGlobalInfo();
    await settle();
    assert(g.DataManager.isGlobalInfoLoaded());
    const objects = Object.fromEntries(Object.entries(g).filter(([key]) => key.startsWith('$game')));
    const scene = x.openContinue();
    assert.equal(scene.savefileId(), 1);
    assert.equal(scene._helpWindow._text, 'Load which file?');

    await x.loadSlot(scene, 1);
    assert.equal(g.SceneManager._scene, scene);
    assert.equal(g.SceneManager._nextScene, null);
    assert.equal(scene._loadSuccess, false);
    assert(scene._listWindow.active);
    assert.equal(scene.savefileId(), 1);
    assert.equal(g.PSState.lastLoadError.savefileId, 1);
    assert(g.PSState.lastLoadError.message.includes(c.code));
    if (c.code === 'unmapped-species') {
      assert.match(g.PSState.lastLoadError.message, /\$\.party\[0\]\.species .*SyntheticMissingSpecies/);
    }
    for (const [key,value] of Object.entries(objects)) assert.equal(g[key],value,key);
    assert.equal(g.PSFlow.replacements, 0);
    assert.equal(x.trace.filter(v => v === 'buzzer').length, 1);
    assert(!x.trace.includes('after-load'));
    assert.deepEqual(x.snapshot(),before);
    assert.deepEqual(h.records(),writesBefore);
    assert.equal(h.io.length,ioBefore);
    assert.equal(scene._helpWindow._text,c.message);
    assert.equal(x.trace.filter(v => v?.help).at(-1)?.help,c.message);

    let retry = scene;
    if (c.returnToTitle) {
      scene._listWindow.handlers.cancel();
      assert(x.changeScene() instanceof g.Scene_Title);
      assert(!x.trace.includes('after-load'));
      retry = x.openContinue();
      assert.equal(retry._helpWindow._text,'Load which file?');
    }
    await x.loadSlot(retry,2);
    assert(retry._loadSuccess);
    assert(g.SceneManager._nextScene instanceof g.Scene_Map);
    assert.equal(g.PSFlow.replacements,1);
    assert.equal(g.$gameSystem._psGame.schema,E.state.GAME_SCHEMA);
    assert.equal(g.$gameSystem._psGame.money,good.money);
    assert.equal(g.$gameSystem._psSaveInfo.migrated,!c.returnToTitle);
    assert.equal(g.PSState.lastLoadError,null);
    assert(x.changeScene() instanceof g.Scene_Map);
    assert.equal(x.trace.filter(v => v === 'after-load').length,1);
    assert.deepEqual(x.snapshot(),before);
    assert.deepEqual(h.records(),writesBefore);
    assert.equal(h.io.length,ioBefore);
  });
}
