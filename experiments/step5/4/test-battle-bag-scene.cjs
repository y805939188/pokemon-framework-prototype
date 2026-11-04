'use strict';
// Production compiled Scene + real App/Gen8 Session. Window/input/raster ports are controlled, not NW.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process'), { createVictoryDriverHost } = require('./victory-music-driver-host.cjs');
const ROOT = path.resolve(__dirname, '../../..'), E = require('../../../js/engine/build/production.cjs'), PLAN = require('./victory-music-native-plan.json');
let temp, plugins, entryText, fixture;
test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-battle-bag-scene-')); plugins = {};
  for (const name of ['PS_BattleFlow', 'PS_SaveState', 'PS_Evolution', 'PS_BattleFlowTest']) {
    const out = path.join(temp, name), r = spawnSync('pnpm', ['--dir', 'src', 'exec', 'vite', 'build', '--outDir', out], { cwd: ROOT, env: { ...process.env, RR_PLUGIN: name }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr); const code = fs.readFileSync(path.join(out, name + '.js'), 'utf8');
    if (name === 'PS_BattleFlowTest') entryText = code; else plugins[name] = code;
  }
  const vite = require(require.resolve('vite', { paths: [path.join(ROOT, 'src')] }));
  await vite.build({ configFile: false, root: ROOT, logLevel: 'error', build: { outDir: path.join(temp, 'fixture'), minify: false,
    lib: { entry: path.join(ROOT, 'src/plugins/flowtest/music-native-fixture.ts'), formats: ['cjs'], fileName: () => 'entry.cjs' } } });
  fixture = require(path.join(temp, 'fixture/entry.cjs'));
});
test.after(() => { if (temp) fs.rmSync(temp, { recursive: true, force: true }); });
async function open({ lang = 'en', members = 2, hurt = true, bag = { potion: 3, masterball: 2, xattack: 1 }, catalog, trainer = false, egg = false } = {}) {
  const h = createVictoryDriverHost({ ROOT, work: temp, plugins, entryText, driverText: 'SYNTHETIC_UNUSED_DRIVER', PLAN, options: { productionTranslator: true } });
  const G = h.G, flow = h.w.flow, content = fixture.musicNativeContent(E, assert), parameters = G.PluginManager.parameters;
  G.Bitmap.prototype.fillRect = () => {}; // Existing controlled drawing port, no native pixel claim.
  if (catalog) catalog(content.items);
  G.PluginManager.parameters = function (name) { const p = parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...p, language: lang } : p; };
  flow.setLanguage(null); flow.stateReplaced(); flow._app = null; flow._content = content; flow._dex = E.dex.createDexLookup(); flow.seed = [1, 2, 3, 4]; flow.rng = () => 0; flow.fast = true;
  const state = fixture.musicNativeState(E, content, 'receiving'); state.party = state.party.slice(0, members); state.nextMemberOrdinal = String(members + 1);
  if (hurt) state.party[0].hp -= 40;
  if (egg) state.party[1].isEgg = true;
  state.inventory = E.inventory.inventoryFromBag(bag, E.itemCatalog.catalogOf(content)); G.$gameSystem._psGame = state;
  const before = JSON.stringify(flow.game()); await h.p.toMapId(5, 8, 9);
  flow.openBattle({ kind: trainer ? 'trainer' : 'wild', ...(trainer ? { trainer: { id: 'music-normal', version: 1 } } : { foes: [{ species: 'Pidgey', level: 3 }] }), battleId: 'bag-' + path.basename(h.w.root), seq: 1, canLose: true });
  await h.p.inMode('main'); const s = h.p.battle();
  return { ...h, s, flow, before, cleanup() { if (flow.running) flow.abort(Error('owned bag cleanup')); s.terminate(); } };
}
async function pick(h, key) {
  if (h.s._mode === 'bag' && key !== null) {
    for (let i = 0; i < 8 && !h.s.inputState().items.some(row => row.key === key); i++) { h.s.changeBagPocket(1); await h.frames(1); }
  }
  const index = h.s.inputState().items.findIndex(row => row.key === key); assert(index >= 0, 'actual menu key ' + key + ' in ' + h.s._mode);
  h.s._menu.select(index); h.s.onMenuOk(); await h.frames(1);
}
async function cancel(h) { h.s.onMenuCancel(); await h.frames(1); }
async function bag(h) { await pick(h, 'bag'); assert.equal(h.s._mode, 'bag'); }
async function use(h, item) { await pick(h, item); assert.equal(h.s._mode, 'bag-command'); await pick(h, 'use'); }
for (const lang of ['en', 'zh']) test(lang + ' normal bag uses real pocket/Use/Cancel/member stack without touching field inventory or the main cursor', async () => {
  const h = await open({ lang }); try {
    await bag(h); assert.equal(h.s.battleBagState().kind, 'items'); assert(!h.s._status.visible && !h.s._log.visible);
    assert(h.s._menu._items.at(-1).enabled !== false, 'empty or populated lists have an explicit selectable Cancel');
    await pick(h, 'potion'); assert.equal(h.s._mode, 'bag-command'); assert(h.s._menu._items[0].name.startsWith(lang === 'zh' ? '使用' : 'Use'));
    await cancel(h); assert.equal(h.s._mode, 'bag'); assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext, 'potion');
    await use(h, 'potion'); assert.equal(h.s._mode, 'bag-members'); assert.equal(h.s._session.bag.potion, 3, 'Use alone is not acceptance');
    await cancel(h); assert.equal(h.s._mode, 'bag'); const pocket = h.s.battleBagState().pocket;
    await cancel(h); assert.equal(h.s._mode, 'main'); assert.equal(h.s._menu.index(), 1); assert(h.s._status.visible !== false);
    await bag(h); assert.equal(h.s.battleBagState().pocket, pocket); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('empty/filtered bag exposes only Cancel and returns to main without registration', async () => {
  const h = await open({ bag: {} }); try { await bag(h); assert.equal(h.s.inputState().items.length, 1); assert.equal(h.s.inputState().items[0].key, null); await pick(h, null); assert.equal(h.s._mode, 'main'); assert.equal(JSON.stringify(h.flow.game()), h.before); } finally { h.cleanup(); }
});
test('real keyboard left/right callbacks skip empty pockets and retain independent row positions', async () => {
  const h = await open(); try {
    await bag(h); assert.equal(h.s.battleBagState().pocket, 2); h.s._menu.select(1);
    h.s._menu.cursorRight(false); assert.equal(h.s.battleBagState().pocket, 3); await h.frames(1);
    h.s._menu.cursorLeft(false); assert.equal(h.s.battleBagState().pocket, 2); assert.equal(h.s._menu.index(), 1);
    await cancel(h); await bag(h); assert.equal(h.s._menu.index(), 1); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('actual member item registration consumes once, heals the selected stable ID, and preserves persistent state until finish', async () => {
  const h = await open(); try {
    const s = h.s._session, member = s.party[0].id, hp = s.gw.readState('p1').find(m => m.id === member).hp;
    let calls = 0; const original = s.useItem.bind(s); s.useItem = (...args) => { calls++; return original(...args); };
    await bag(h); await use(h, 'potion'); await pick(h, member); h.s.onMenuOk(); h.s.onMenuOk(); await h.p.inMode('main');
    assert.equal(calls, 1); assert.equal(s.bag.potion, 2); assert(s.gw.readState('p1').find(m => m.id === member).hp > hp);
    assert.equal(h.s.battleBagState().reason, 'accepted'); assert.equal(JSON.stringify(h.flow.game()), h.before);
    await bag(h); assert.equal(h.s.battleBagState().rows.find(r => r.battleId === 'potion').quantity, 2);
  } finally { h.cleanup(); }
});
test('a successful eligibility query cannot close the menu before delayed actual registration', async () => {
  const h = await open(); let release; try {
    const s = h.s._session, original = s.useItem.bind(s), pending = new Promise(resolve => { release = resolve; }); let calls = 0;
    s.useItem = (...args) => { calls++; return pending.then(() => original(...args)); };
    await bag(h); await use(h, 'potion'); await pick(h, s.party[0].id);
    assert.equal(calls, 1); assert.equal(h.s.battleBagState().kind, 'submitting'); assert(!h.s.inputState().ready); assert.equal(s.bag.potion, 3);
    h.s.onMenuOk(); h.s.onMenuCancel(); assert.equal(calls, 1); release(); await h.p.inMode('main'); assert.equal(s.bag.potion, 2); assert.equal(h.s.battleBagState().reason, 'accepted');
  } finally { release?.(); h.cleanup(); }
});
test('automatic no-effect refusal opens member choice and subsequent refusal stays there, with zero reserve/turn', async () => {
  const h = await open({ members: 1, hurt: false }); try {
    const s = h.s._session, request = JSON.stringify(s.currentRequest()); let calls = 0; const original = s.useItem.bind(s); s.useItem = (...a) => { calls++; return original(...a); };
    await bag(h); await use(h, 'potion'); await h.p.inMode('bag-members'); await pick(h, s.party[0].id); await h.p.inMode('bag-members');
    assert.equal(calls, 0); assert.equal(s.bag.potion, 3); assert.equal(JSON.stringify(s.currentRequest()), request);
    await cancel(h); assert.equal(h.s._mode, 'bag'); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('registration rejection after positive eligibility refunds once and returns to the selected member layer', async () => {
  const h = await open(); try {
    const s = h.s._session, original = s.gw.act.bind(s.gw); let attempts = 0;
    s.gw.act = async (side, payload, ...args) => { if (payload.kind === 'item') { attempts++; return false; } return original(side, payload, ...args); };
    await bag(h); await use(h, 'potion'); await pick(h, s.party[0].id); await h.p.inMode('bag-members');
    assert.equal(attempts, 1); assert.equal(s.bag.potion, 3); assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext, s.party[0].id); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('content item ID and battle ID are joined through the catalog rather than treated as the same key', async () => {
  const h = await open({ bag: { kit: 2 }, catalog(items) { items.kit = { ...items.potion, id: 'kit', name: 'Field Kit', namePlural: 'Field Kits' }; delete items.potion; } }); try {
    await bag(h); assert(h.s._menu._items[0].name.includes('Field Kit')); await use(h, 'kit'); await pick(h, h.s._session.party[0].id); await h.p.inMode('main');
    assert.equal(h.s._session.bag.potion, 1); assert.equal(h.s._session.bag.kit, undefined); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('single active X item auto-targets the current member and goes through the real battle handler', async () => {
  const h = await open(); try { await bag(h); await use(h, 'xattack'); await h.p.inMode('main'); assert.equal(h.s._session.bag.xattack, 0); assert.equal(h.s._session.gw.readState('p1').find(m => m.active).boosts.atk, 2); assert.equal(JSON.stringify(h.flow.game()), h.before); } finally { h.cleanup(); }
});
test('a legal trainer ball submission is accepted and consumed even though capture is blocked', async () => {
  const h = await open({ trainer: true }); try { await bag(h); await use(h, 'masterball'); await h.p.inMode('main'); assert.equal(h.s._session.bag.masterball, 1); assert.equal(h.s.battleBagState().reason, 'accepted'); assert(!h.s._session.finished); assert.notEqual(h.s._session.ended?.reason, 'caught'); assert.equal(JSON.stringify(h.flow.game()), h.before); } finally { h.cleanup(); }
});
test('normal wild ball Use reaches real capture feedback and end without committing before confirmation', async () => {
  const h = await open(); try {
    await bag(h); await use(h, 'masterball'); await h.p.inMode('end');
    assert.equal(h.s._session.bag.masterball, 1); assert.equal(h.s.battleBagState().reason, 'accepted');
    assert.equal(h.s._session.ended.reason, 'caught'); assert.equal(JSON.stringify(h.flow.game()), h.before);
    assert(!h.s._bagHidden); assert(h.s._log.visible !== false);
  } finally { h.cleanup(); }
});
test('unsupported move target cancels back to the same member, then returns to items, without a fake accepted action', async () => {
  const h = await open({ catalog(items) { items.potion.battleUse = 'move'; } }); try {
    await bag(h); await use(h, 'potion'); await pick(h, h.s._session.party[0].id); assert.equal(h.s._mode, 'bag-moves');
    await cancel(h); assert.equal(h.s._mode, 'bag-members'); assert.equal(h.s._menu.index(), 0);
    await pick(h, h.s._session.party[0].id); await pick(h, 0); await h.p.inMode('bag-members');
    assert.equal(h.s._session.bag.potion, 3); await cancel(h); assert.equal(h.s._mode, 'bag'); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
for (const how of ['abort', 'replace', 'terminate']) test(how + ' retires the bag and blocks late input or delayed registration callbacks', async () => {
  const h = await open(); let release; try {
    const s = h.s._session, original = s.useItem.bind(s), hold = new Promise(resolve => { release = resolve; });
    s.useItem = (...a) => hold.then(() => original(...a)); await bag(h); await use(h, 'potion'); await pick(h, s.party[0].id);
    if (how === 'abort') h.flow.abort(Error('controlled bag cancel')); else if (how === 'replace') h.flow.stateReplaced(); else h.s.terminate();
    if (how !== 'terminate') await h.frames(2);
    assert.equal(h.s.battleBagState().kind, 'closed'); assert.equal(h.s.battleBagState().reason, 'idle');
    h.s.terminate(); // SceneManager terminates the previous Scene before installing its successor.
    const next = { children: [] }; h.G.SceneManager._scene = next; release(); for (let i = 0; i < 32; i++) await Promise.resolve(); h.s.onMenuOk();
    assert.equal(h.G.SceneManager._scene, next); assert.equal(next.children.length, 0); assert.equal(JSON.stringify(h.flow.game()), h.before); assert(!h.flow.app().saveBlocked);
  } finally { release?.(); h.cleanup(); }
});
test('an egg remains a visible disabled member row and never reaches qualification or registration', async () => {
  const h = await open({ egg: true }); try {
    let calls = 0; h.s._session.canUseItem = () => { calls++; throw Error('egg must not reach eligibility'); };
    await bag(h); await use(h, 'potion'); assert.equal(h.s._mode, 'bag-members');
    const row = h.s._menu._items.findIndex(x => x.name === 'Egg'); assert(row >= 0); assert.equal(h.s._menu._items[row].enabled, false);
    h.s._menu.select(row); h.s.onMenuOk(); await h.frames(1); assert.equal(h.s._mode, 'bag-members'); assert.equal(calls, 0); assert.equal(h.s._session.bag.potion, 3);
  } finally { h.cleanup(); }
});
test('the confirmation that opens Use/Cancel cannot also accept Use in the same update', async () => {
  const h = await open(); try {
    await bag(h); const index = h.s.inputState().items.findIndex(x => x.key === 'potion'); h.s._menu.select(index); h.s.onMenuOk();
    assert.equal(h.s._mode, 'bag-command'); h.s.onMenuOk(); assert.equal(h.s._mode, 'bag-command'); assert.equal(h.s._session.bag.potion, 3);
    await h.frames(1); await pick(h, 'use'); assert.equal(h.s._mode, 'bag-members'); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
