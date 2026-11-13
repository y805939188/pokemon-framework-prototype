'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-host-input-'));
const bundles = {};
let build;
async function bundle(entry, name) {
  const result = await build({ configFile: false, root: path.join(ROOT, 'src'), logLevel: 'silent',
    build: { write: false, outDir: temporary, minify: false, sourcemap: false,
      lib: { entry, name, formats: ['iife'] }, rolldownOptions: { external: ['pixi.js'] } } });
  const outputs = Array.isArray(result) ? result : [result];
  return outputs.flatMap(output => output.output).find(part => part.type === 'chunk').code;
}
before(async () => {
  ({ build } = await import(pathToFileURL(path.join(ROOT, 'src/node_modules/vite/dist/node/index.js')).href));
  for (const name of ['PS_Management', 'PS_Inventory', 'PS_Progression', 'PS_Evolution', 'PS_Pokedex']) {
    bundles[name] = await bundle(path.join(ROOT, 'src/plugins', name + '.ts'), name + 'Test');
  }
});
after(() => fs.rmSync(temporary, { recursive: true, force: true }));

function host() {
  const listeners = {}, windowEvents = {};
  const input = { keyMapper: {}, trigger: new Set(), repeat: new Set(), pressed: new Set(), keyRepeatWait: 2, keyRepeatInterval: 2,
    isTriggered(key) { return this.trigger.has(key); }, isRepeated(key) { return this.repeat.has(key); },
    isPressed(key) { return this.pressed.has(key); }, clear() { this.trigger.clear(); this.repeat.clear(); this.pressed.clear(); } };
  function Base() { this.initialize(...arguments); }
  for (const name of ['initialize', 'create', 'start', 'update', 'terminate', 'clear', 'setWaitMode']) Base.prototype[name] = function () {};
  Base.prototype.isStarted = () => true;
  Base.prototype.updateWaitMode = () => false;
  Base.prototype.addWindow = function () {};
  Base.prototype.popScene = function () {};
  Base.prototype.createCommandWindow = function () {};
  function MenuCommand() {}
  MenuCommand.prototype.addOriginalCommands = function () {};
  MenuCommand.prototype.addCommand = function () {};
  MenuCommand.prototype.setHandler = function () {};
  function Win() { this.initialize(...arguments); }
  Win.prototype.initialize = function () { this.contents = { width: 792, height: 576, clear() {}, fillRect() {}, drawText() {} }; };
  Win.prototype.textWidth = text => String(text).length * 8;
  Win.prototype.activate = function () {};
  const content = { species: {}, items: {}, settings: {} };
  const app = { stateGeneration: 1, encounterBlocked: false, saveBlocked: false, receivingNotifications: [],
    pendingLearning: null, pendingEvolution: null, pendingTriggeredEvolution: null, pendingPokedex: null,
    beginMoneyShop: () => 'shop', setShopPrices() {},
    shopView: () => ({ stock: [], allowSell: true }),
    endInventoryOperation: () => ({ status: 'unchanged' }),
    inventorySnapshot: () => ({ lastPocket: 1, indices: Array(8).fill(0), pockets: Array.from({ length: 8 }, () => []) }),
    beginLearning() { return { status: 'pending', view: { token: 'learning', revision: 1, memberId: 'P1', kind: 'forget', error: 'fixture recovery' } }; },
    resolveLearning: () => ({ status: 'refused', reason: 'fixture' }),
    describeLearningMove: () => ({ name: 'Fixture move', pp: 10 }),
    pokedexSnapshot: () => ({ menu: 'regions', accessible: [] }),
    resolvePokedex() { const token = this.pendingPokedex?.token; this.pendingPokedex = null; return { status: 'technically-terminated', token }; },
  };
  const manager = { _scene: new Base(), _nextScene: null, isSceneChanging: () => false,
    push(Constructor) { this._scene = new Constructor(); this._scene.create(); this._scene.start(); },
    goto(Constructor) { this.push(Constructor); }, updateScene() { this._scene.update(); } };
  const G = { console, structuredClone, Date, performance: { now: () => G.Graphics.frameCount * 1000 / 60 },
    Input: input, TouchInput: { clear() {}, isCancelled: () => false }, Graphics: { frameCount: 0, boxWidth: 816, boxHeight: 624 },
    Scene_MenuBase: Base, Scene_Map: Base, Scene_Menu: Base, Window_MenuCommand: MenuCommand, Window_Base: Win, Game_Interpreter: Base, Rectangle: function () {},
    SceneManager: manager, PluginManager: { registerCommand() {} }, SoundManager: { playBuzzer() {}, playCancel() {} },
    $gameMessage: { add() {}, isBusy: () => false }, $gameSwitches: { value: () => false }, $dataMap: { meta: {} },
    $dataSystem: { switches: Array(36).fill(''), variables: Array(8).fill('') },
    document: { addEventListener(name, callback) { (listeners[name] ??= new Set()).add(callback); },
      removeEventListener(name, callback) { listeners[name]?.delete(callback); }, body: { appendChild() {} } },
    addEventListener(name, callback) { (windowEvents[name] ??= new Set()).add(callback); },
    PSFlow: { _app: app, app: () => app, operationPending: () => false, game: () => ({ party: [], money: 100 }),
      content: () => content, translator: () => ({ t: key => key, tOr: (_key, fallback) => fallback, font: () => '', lang: 'en' }), speciesName: id => id },
    __inputCopies: [],
  };
  G.window = G;
  G.PSFlow.resolveEvolution = () => { app.pendingEvolution = null; return { status: 'technically-terminated' }; };
  const context = vm.createContext(G);
  const run = code => vm.runInContext(code, context);
  const dom = (name, code) => { for (const callback of listeners[name] ?? []) callback({ code, key: code, keyCode: code === 'Enter' ? 13 : 0 }); };
  const blur = () => { for (const callback of windowEvents.blur ?? []) callback(); };
  const tick = () => { G.Graphics.frameCount++; manager._scene.update(); input.trigger.clear(); input.repeat.clear(); };
  return { G, app, input, listeners, windowEvents, manager, run, dom, blur, tick };
}

async function independentCopies(h, count = 3) {
  for (let i = 0; i < count; i++) {
    const entry = path.join(temporary, `input-copy-${i}.ts`);
    fs.writeFileSync(entry, `import { hostInput } from ${JSON.stringify(path.join(ROOT, 'src/plugins/host-input.ts'))};\n(globalThis as any).__inputCopies.push(hostInput(globalThis as any));\n`);
    h.run(await bundle(entry, 'InputCopy' + i));
  }
  return h.G.__inputCopies;
}

test('independently bundled helpers share one host service, listeners, wrappers and same-frame immutable samples', async () => {
  const h = host(), copies = await independentCopies(h);
  assert.equal(copies[0], copies[1]); assert.equal(copies[1], copies[2]);
  for (const key of ['keydown', 'keyup']) assert.equal(h.listeners[key].size, 1);
  assert.equal(h.windowEvents.blur.size, 1);
  const wrapper = h.input.isTriggered;
  await independentCopies(h, 1);
  assert.equal(h.input.isTriggered, wrapper);
  h.input.trigger.add('ok'); h.input.pressed.add('ok');
  const first = copies[0].inputFrame(); h.input.clear();
  assert.equal(copies[1].inputFrame().triggered.use, true, 'all copies observe the same frame, even after a service clear');
  first.triggered.use = false; first.pressed.use = false;
  assert.equal(copies[2].inputFrame().triggered.use, true);
  assert.equal(copies[2].inputFrame().pressed.use, true);
  h.G.Graphics.frameCount++;
  assert.equal(copies[1].inputFrame().pressed.use, false);
  const other = host(); await independentCopies(other, 1);
  assert.notEqual(other.G.__inputCopies[0], copies[0], 'different hosts never share input state');
});

test('native consumption survives presenter removal and alias keyup, then releases on exact keyup or blur', async () => {
  const h = host(), [a, b] = await independentCopies(h, 2);
  a.consumeNative({ key: 'Enter' }, 'use'); h.input.trigger.add('ok'); h.input.repeat.add('ok');
  h.G.PSManagement = { customPresenter: true };
  assert.equal(h.input.isTriggered('ok'), false); assert.equal(h.input.isRepeated('ok'), false);
  assert.equal(b.inputFrame().pressed.use, true);
  h.dom('keyup', 'KeyZ'); assert.equal(h.input.isTriggered('ok'), false);
  h.dom('keyup', 'Enter'); assert.equal(h.input.isTriggered('ok'), true);
  a.consumeNative({ key: 'Escape' }, 'back'); h.input.trigger.add('cancel');
  assert.equal(h.input.isTriggered('cancel'), false);
  h.blur(); assert.equal(h.input.isTriggered('cancel'), true);
  h.input.clear(); h.G.Graphics.frameCount++;
  assert.equal(b.inputFrame().pressed.back, false);
});

test('DOM repeats, aliased keyboard releases, merged gamepad holds and blur retain their existing boundaries', async () => {
  const h = host(), [a, b] = await independentCopies(h, 2);
  h.dom('keydown', 'ArrowDown'); assert.equal(a.inputFrame().repeated.down, true);
  h.G.Graphics.frameCount++; assert.equal(b.inputFrame().repeated.down, false);
  h.G.Graphics.frameCount++; assert.equal(a.inputFrame().repeated.down, true);
  h.dom('keydown', 'Enter'); h.dom('keydown', 'KeyZ'); h.dom('keyup', 'Enter');
  h.G.Graphics.frameCount++; assert.equal(b.inputFrame().pressed.use, true);
  h.dom('keyup', 'KeyZ'); h.input.pressed.add('ok');
  h.G.Graphics.frameCount++; assert.equal(a.inputFrame().pressed.use, true, 'gamepad/service source remains held after DOM keyup');
  h.input.pressed.delete('ok'); h.G.Graphics.frameCount++; assert.equal(b.inputFrame().pressed.use, false);
  h.blur(); h.G.Graphics.frameCount++; assert.equal(a.inputFrame().pressed.down, false);
});

test('scene subscriptions observe updated key state and can retire without adding permanent listeners', async () => {
  const h = host(), [a, b] = await independentCopies(h, 2), seen = [];
  const unsubscribe = a.subscribeKeyboard(event => seen.push(['down', event.code, b.domPressed('use')]),
    event => seen.push(['up', event.code, b.domPressed('use')]));
  const stopBlur = b.onBlur(() => seen.push(['blur', a.domPressed('use')]));
  h.dom('keydown', 'Enter'); h.dom('keyup', 'Enter'); h.dom('keydown', 'Enter'); h.blur();
  assert.deepEqual(seen, [['down', 'Enter', true], ['up', 'Enter', false], ['down', 'Enter', true], ['blur', false]]);
  unsubscribe(); stopBlur(); h.dom('keydown', 'Enter'); h.dom('keyup', 'Enter'); h.blur();
  assert.equal(seen.length, 4);
  assert.equal(h.listeners.keydown.size, 1); assert.equal(h.listeners.keyup.size, 1); assert.equal(h.windowEvents.blur.size, 1);
});

for (const managementLoaded of [true, false]) for (const name of ['PS_Inventory', 'PS_Progression', 'PS_Evolution', 'PS_Pokedex']) {
  test(`actual ${name} samples and releases with Management ${managementLoaded ? 'replaced' : 'absent'}`, () => {
    const h = host();
    for (const [plugin, code] of Object.entries(bundles)) if (managementLoaded || plugin !== 'PS_Management') h.run(code);
    const legacy = h.G.PSManagement?.inputFrame;
    if (managementLoaded) h.G.PSManagement = { customPresenter: true };
    h.dom('keydown', 'ArrowDown');
    if (name === 'PS_Inventory') h.G.PSInventory.openShop({ stock: [] }, []);
    else if (name === 'PS_Progression') h.G.PSProgression.learn({ kind: 'forget', memberId: 'P1' });
    else if (name === 'PS_Evolution') { h.app.pendingEvolution = { token: 'evolution', revision: 1, phase: 'failed', error: 'fixture recovery' }; h.G.PSEvolution.show(); }
    else { h.app.pendingPokedex = { token: 'dex', revision: 1, purpose: 'edit', error: 'fixture recovery' }; const result = h.G.PSPokedex.open(); assert.equal(result.status, 'opened', result.reason); }
    const scene = h.manager._scene, controller = scene._controller;
    assert.equal(scene._failure, undefined, scene._failure);
    assert.ok(controller && !controller.closed, `${name} did not create its default controller`);
    const samples = [], filter = controller.latch.filter;
    controller.latch.filter = function (frame) { const filtered = filter.call(this, frame); samples.push({ frame, filtered }); return filtered; };
    h.tick(); h.tick();
    assert.equal(samples.at(-1).frame.pressed.down, true);
    assert.equal(samples.at(-1).filtered.repeated.down, undefined, 'entry-held key remains latched');
    h.dom('keyup', 'ArrowDown'); h.tick();
    assert.equal(samples.at(-1).frame.pressed.down, false);
    h.dom('keydown', 'ArrowDown'); h.tick();
    assert.equal(samples.at(-1).filtered.repeated.down, true, 'full release permits a new DOM press');
    h.blur(); h.tick(); assert.equal(samples.at(-1).frame.pressed.down, false);
    if (managementLoaded) {
      assert.equal(typeof legacy, 'function');
      const oldSample = legacy(); assert.equal(oldSample.pressed.down, false, 'saved compatibility forwarder remains usable');
    }
    assert.equal(h.listeners.keydown.size, 1); assert.equal(h.listeners.keyup.size, 1); assert.equal(h.windowEvents.blur.size, 1);
  });
}
