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
    if (name === 'PS_BattleFlowTest') entryText = code; else plugins[name] = name === 'PS_BattleFlow' && process.env.PF_BAG_FADE_TEST_PLUGIN ? fs.readFileSync(process.env.PF_BAG_FADE_TEST_PLUGIN, 'utf8') : code;
  }
  const vite = require(require.resolve('vite', { paths: [path.join(ROOT, 'src')] }));
  await vite.build({ configFile: false, root: ROOT, logLevel: 'error', build: { outDir: path.join(temp, 'fixture'), minify: false,
    lib: { entry: path.join(ROOT, 'src/plugins/flowtest/music-native-fixture.ts'), formats: ['cjs'], fileName: () => 'entry.cjs' } } });
  fixture = require(path.join(temp, 'fixture/entry.cjs'));
});
test.after(() => { if (temp) fs.rmSync(temp, { recursive: true, force: true }); });
async function open({ lang = 'en', members = 2, hurt = true, bag = { potion: 3, masterball: 2, xattack: 1 }, catalog, trainer = false, egg = false, fast = true, noRun = false, benchHP = null } = {}) {
  const h = createVictoryDriverHost({ ROOT, work: temp, plugins, entryText, driverText: 'SYNTHETIC_UNUSED_DRIVER', PLAN, options: { productionTranslator: true } });
  const G = h.G, flow = h.w.flow, content = fixture.musicNativeContent(E, assert), parameters = G.PluginManager.parameters;
  G.Bitmap.prototype.fillRect = () => {}; // Existing controlled drawing port, no native pixel claim.
  if (catalog) catalog(content.items);
  G.PluginManager.parameters = function (name) { const p = parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...p, language: lang } : p; };
  flow.setLanguage(null); flow.stateReplaced(); flow._app = null; flow._content = content; flow._dex = E.dex.createDexLookup(); flow.seed = [1, 2, 3, 4]; flow.rng = () => 0; flow.fast = fast;
  const state = fixture.musicNativeState(E, content, 'receiving'); state.party = state.party.slice(0, members); state.nextMemberOrdinal = String(members + 1);
  if (hurt) state.party[0].hp -= 40;
  if (egg) state.party[1].isEgg = true;
  if (benchHP !== null) state.party[1].hp = benchHP;
  state.inventory = E.inventory.inventoryFromBag(bag, E.itemCatalog.catalogOf(content)); G.$gameSystem._psGame = state;
  const before = JSON.stringify(flow.game()); await h.p.toMapId(5, 8, 9);
  flow.openBattle({ kind: trainer ? 'trainer' : 'wild', ...(trainer ? { trainer: { id: 'music-normal', version: 1 } } : { foes: [{ species: 'Pidgey', level: 3 }] }), battleId: 'bag-' + path.basename(h.w.root), seq: 1, canLose: true, noRun });
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

async function animatedBag(h) {
  await pick(h, 'bag');
  assert.equal(h.s.inputState().ready, false, 'normal opening fade must lock selection before swapping the screen');
  assert.equal(h.s._mode, 'messages');
  const fade = h.s._bagFade, cover = h.s.children.find(n => n._psBagFade);
  assert(fade && cover?.visible !== false && cover?.bitmap, 'actual owned cover is attached');
  return { fade, cover, surface: cover.bitmap };
}
async function visibleBag(h, mode = 'bag') {
  await h.waitFor(() => h.s._mode === mode && h.s.inputState().ready, 'ready animated ' + mode);
  assert(!h.s.children.some(n => n._psBagFade), 'finished fade releases its cover');
}
for (const lang of ['en', 'zh']) test(lang + ' normal-speed bag fades out the battle, locks input, and fades it back without replacing menu or model', async () => {
  const h = await open({ lang, fast: false }); try {
    const menu = h.s._menu, status = h.s._status;
    const { fade, cover, surface } = await animatedBag(h), model = h.s._battleBag;
    let releases = 0; const destroy = surface.destroy.bind(surface); surface.destroy = () => { releases++; destroy(); };
    assert.equal(fade.snapshot().phase, 'out'); assert(status.visible !== false, 'battle stays painted during outgoing fade');
    await h.frames(4); assert(cover.opacity > 0 && cover.opacity < 255);
    const sampledOpacity = cover.opacity; fade.advance(h.G.performance.now() + 10000);
    assert.equal(cover.opacity, sampledOpacity, 'resampling one Scene update must not consume a later transition phase');
    const cursor = model.view().cursor; h.s.onMenuOk(); h.s.onMenuCancel();
    assert.equal(model.view().cursor, cursor); assert.equal(h.s._session.bag.potion, 3);
    await h.waitFor(() => fade.snapshot().phase === 'in', 'opaque screen swap');
    assert(!status.visible && cover.visible !== false, 'cover must not hide itself with battle nodes');
    assert.equal(h.s.inputState().ready, false); await visibleBag(h);
    assert.equal(fade.snapshot().phase, 'done'); assert.equal(cover.bitmap, null);
    assert.equal(releases, 1, 'the private cover bitmap is released exactly once');
    assert.equal(h.s._menu, menu); assert.equal(h.s._battleBag, model);
    await cancel(h); assert.equal(h.s.inputState().ready, false); assert.equal(h.s._bagFade.snapshot().phase, 'out');
    await h.waitFor(() => h.s._mode === 'main' && h.s.inputState().ready, 'battle fade-in completion');
    assert(status.visible !== false); assert.equal(h.s._menu, menu); assert.equal(h.s._battleBag, model);
    assert(!h.s.children.some(n => n._psBagFade)); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('normal member targeting and cancellation fade between the existing bag and target layer while retaining the same selection', async () => {
  const h = await open({ fast: false }); try {
    await animatedBag(h); await visibleBag(h); const model = h.s._battleBag, menu = h.s._menu;
    await use(h, 'potion'); assert.equal(model.view().kind, 'members');
    assert.equal(h.s.inputState().ready, false); await visibleBag(h, 'bag-members');
    assert.equal(h.s._battleBag, model); assert.equal(h.s._session.bag.potion, 3);
    await cancel(h); assert.equal(model.view().kind, 'items'); assert.equal(h.s.inputState().ready, false);
    await visibleBag(h); assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext, 'potion');
    assert.equal(h.s._menu, menu); assert.equal(h.s._battleBag, model); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('normal successful member Use hands the battle to the existing action without replaying a menu fade or double-consuming', async () => {
  const h = await open({ fast: false }); try {
    await animatedBag(h); await visibleBag(h); await use(h, 'potion'); await visibleBag(h, 'bag-members');
    const s = h.s._session, target = s.party[0].id; let calls = 0; const useItem = s.useItem.bind(s);
    s.useItem = (...args) => { calls++; return useItem(...args); };
    await pick(h, target); h.s.onMenuOk(); await h.p.inMode('main');
    assert.equal(calls, 1); assert.equal(s.bag.potion, 2); assert.equal(h.s._bagLayer, 'battle');
    assert(!h.s.children.some(n => n._psBagFade)); assert(h.s._status.visible !== false);
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
for (const how of ['abort', 'replace', 'terminate']) test(how + ' during a normal bag fade releases only its private cover and cannot swap a successor', async () => {
  const h = await open({ fast: false }); try {
    const { fade, cover } = await animatedBag(h); await h.frames(3);
    if (how === 'terminate') await h.waitFor(() => fade.snapshot().phase === 'in', 'incoming fade before scene close');
    if (how === 'abort') h.flow.abort(Error('owned bag fade cancel')); else if (how === 'replace') h.flow.stateReplaced(); else h.s.terminate();
    if (how !== 'terminate') await h.frames(2); h.s.terminate();
    const next = { children: [] }; h.G.SceneManager._scene = next;
    assert(fade.advance(h.G.performance.now() + 10000)); assert.equal(fade.snapshot().phase, 'cancelled');
    assert.equal(cover.bitmap, null); assert(!cover.parent); assert.equal(next.children.length, 0);
    assert.equal(h.G.SceneManager._scene, next); assert.equal(JSON.stringify(h.flow.game()), h.before); assert(!h.flow.app().saveBlocked);
  } finally { h.cleanup(); }
});
test('a failed view swap preserves the failure and removes the private cover without committing a battle', async () => {
  const h = await open({ fast: false }); try {
    h.s.renderBattleBagView = () => { throw Error('controlled bag view failure'); };
    const { cover } = await animatedBag(h); await h.p.inMode('end');
    assert.equal(h.s._failure.message, 'controlled bag view failure'); assert.equal(cover.bitmap, null);
    assert(!h.s.children.some(n => n._psBagFade)); assert.equal(JSON.stringify(h.flow.game()), h.before);
    assert(!h.flow.app().saveBlocked);
  } finally { h.cleanup(); }
});

for (const route of ['enter-target', 'return-from-target', 'close-bag']) test(route + ' outgoing menu remains visible and unchanged until the real blackout is opaque', async () => {
  const h = await open({ fast: false }), frames = []; try {
    await animatedBag(h); await visibleBag(h);
    if (route === 'enter-target') await pick(h, 'potion');
    if (route === 'return-from-target') { await use(h, 'potion'); await visibleBag(h, 'bag-members'); }
    const menu = h.s._menu, model = h.s._battleBag, oldItems = JSON.stringify(menu._items), oldPhase = menu._phase, oldCursor = menu.index();
    assert(menu.visible && h.s.inputState().ready, 'old real menu is present and interactive before transition');
    if (route === 'enter-target') await pick(h, 'use'); else await cancel(h);
    const fade = h.s._bagFade; assert.equal(fade.snapshot().phase, 'out');
    const selected = JSON.stringify(model.view());
    for (let i = 0; fade.snapshot().phase === 'out' && i < 20; i++) {
      frames.push({ update: h.s._pictureUpdate, phase: fade.snapshot().phase, opacity: fade.snapshot().opacity,
        menuVisible: menu.visible, menuActive: menu.active, ready: h.s.inputState().ready, menuPhase: menu._phase });
      assert(menu.visible, 'outgoing real menu must remain visible while blackout is still transparent');
      assert(!menu.active && !h.s.inputState().ready, 'visible outgoing menu must remain input-locked');
      assert.equal(JSON.stringify(menu._items), oldItems); assert.equal(menu._phase, oldPhase); assert.equal(menu.index(), oldCursor);
      h.s.onMenuOk(); h.s.onMenuCancel(); assert.equal(JSON.stringify(model.view()), selected);
      await h.frames(1);
    }
    assert(frames.length >= 9, 'check every outgoing update, including transparent and partially opaque frames');
    assert.equal(frames[0].opacity, 0); assert(frames.some(row => row.opacity > 0 && row.opacity < 1));
    assert.equal(fade.snapshot().phase, 'in'); assert.equal(fade.snapshot().opacity, 1, 'view changes only under a fully opaque cover');
    assert.notEqual(JSON.stringify(menu._items), oldItems); assert(menu.visible && !menu.active && !h.s.inputState().ready);
    const expected = route === 'enter-target' ? 'bag-members' : route === 'return-from-target' ? 'bag' : 'main';
    await visibleBag(h, expected); assert.equal(h.s._menu, menu); assert.equal(h.s._battleBag, model);
    assert.equal(h.s._session.bag.potion, 3); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { console.log('BAG_OUTGOING_FRAMES', JSON.stringify({ route, frames })); h.cleanup(); }
});

// No-target escape family: real compiled menu -> Session item action -> final App commit.
for(const lang of ['en','zh'])test(lang+' direct toy skips all target pickers, cancels safely, and saves its escape once',async()=>{
 const h=await open({lang,bag:{pokedoll:2}});try{const s=h.s._session,foe=s.gw.readState('p2'),modes=[];let calls=0,installs=0,doc=h.G.$gameSystem._psGame;const real=s.useItem.bind(s),show=h.s.show; s.useItem=(...a)=>{calls++;return real(...a);};h.s.show=function(mode,...a){modes.push(mode);return show.call(this,mode,...a);};Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>doc,set:v=>{installs++;doc=v;}});
  await bag(h);await pick(h,'pokedoll');await cancel(h);assert.equal(h.s._mode,'bag');assert.equal(calls,0);assert.equal(s.bag.pokedoll,2);
  await use(h,'pokedoll');h.s.onMenuOk();h.s.onMenuCancel();await h.p.inMode('end');assert.equal(calls,1);assert(!modes.some(m=>['bag-members','bag-moves','bag-foes'].includes(m)));assert.equal(s.bag.pokedoll,1);assert.equal(s.ended.reason,'run');assert.deepEqual(s.gw.readState('p2'),foe);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
  await h.frames(1);h.s.onMenuOk();await h.frames(3);assert.equal(h.flow.lastOutcome.commit,'applied',JSON.stringify(h.flow.lastOutcome));assert.equal(installs,1);assert.equal(E.inventory.aggregateBag(h.flow.game().inventory).pokedoll,1);h.s.onEnd();assert.equal(installs,1);
 }finally{h.cleanup();}
});
for(const flags of [{trainer:true},{noRun:true}])test(JSON.stringify(flags)+' direct toy refuses back to the item list without any reserve',async()=>{
 const h=await open({...flags,bag:{pokedoll:2}});try{const s=h.s._session,engine=s.gw.snapshot();let calls=0;const real=s.useItem.bind(s);s.useItem=(...a)=>{calls++;return real(...a);};await bag(h);await use(h,'pokedoll');await h.p.inMode('bag');assert.equal(calls,0);assert.equal(s.bag.pokedoll,2);assert.equal(s.ledger.length,0);assert.equal(s.gw.snapshot(),engine);assert.equal(JSON.stringify(h.flow.game()),h.before);await cancel(h);assert.equal(h.s._mode,'main');}finally{h.cleanup();}
});

// Battle revives: existing member picker + real Session/Gen8 action + one final App installation.
for(const [lang,item] of [['en','revive'],['zh','revive'],['en','maxrevive'],['zh','maxhoney']])test(lang+' '+item+' cancels member selection, rejects a living member, then revives and saves once',async()=>{
 const h=await open({lang,bag:{[item]:2},benchHP:0});try{
  const s=h.s._session,id=s.party[1].id,order=s.party.map(m=>m.id),old=s.gw.readState('p1').find(m=>m.id===id);assert(old.fainted);let calls=0,installs=0,doc=h.G.$gameSystem._psGame;const real=s.useItem.bind(s);s.useItem=(...a)=>{calls++;return real(...a);};Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>doc,set:v=>{installs++;doc=v;}});
  await bag(h);await use(h,item);assert.equal(h.s._mode,'bag-members');await cancel(h);assert.equal(h.s._mode,'bag');assert.equal(s.bag[item],2);assert.equal(calls,0);
  await use(h,item);await pick(h,s.party[0].id);await h.p.inMode('bag-members');assert.equal(calls,0);assert.equal(s.ledger.length,0);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
  await pick(h,id);h.s.onMenuOk();h.s.onMenuCancel();await h.p.inMode('main');const live=s.gw.readState('p1').find(m=>m.id===id),expected=item==='revive'?Math.max(1,Math.floor(old.maxhp/2)):old.maxhp;assert.equal(live.hp,expected);assert(!live.fainted);assert.equal(s.bag[item],1);assert.equal(calls,1);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
  await pick(h,'fight');await pick(h,1);await h.p.inMode('end');assert.equal(installs,0);await h.frames(1);h.s.onMenuOk();await h.frames(3);assert.equal(h.flow.lastOutcome.commit,'applied',JSON.stringify(h.flow.lastOutcome));assert.equal(installs,1);assert.deepEqual(h.flow.game().party.map(m=>m.id),order);assert.equal(h.flow.game().party.find(m=>m.id===id).hp,expected);assert.equal(E.inventory.aggregateBag(h.flow.game().inventory)[item],1);h.s.onEnd();assert.equal(installs,1);
 }finally{h.cleanup();}
});
