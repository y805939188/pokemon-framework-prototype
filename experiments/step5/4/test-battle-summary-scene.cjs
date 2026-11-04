'use strict';
// Production compiled Scene + real App/Gen8 Session. Window/input/raster ports are controlled, not NW.
const vm = require('node:vm');
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process'), { createVictoryDriverHost } = require('./victory-music-driver-host.cjs');
const ROOT = path.resolve(__dirname, '../../..'), E = require('../../../js/engine/build/production.cjs'), PLAN = require('./victory-music-native-plan.json');
let temp, plugins, entryText, fixture;
test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-party-switch-scene-')); plugins = {};
  for (const name of ['PS_BattleFlow', 'PS_SaveState', 'PS_Evolution', 'PS_Management', 'PS_BattleFlowTest']) {
    const out = path.join(temp, name), r = spawnSync('pnpm', ['--dir', 'src', 'exec', 'vite', 'build', '--outDir', out], { cwd: ROOT, env: { ...process.env, RR_PLUGIN: name }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr); const code = fs.readFileSync(path.join(out, name + '.js'), 'utf8');
    if (name === 'PS_BattleFlowTest') entryText = code;
    else plugins[name] = name === 'PS_BattleFlow' && process.env.PF_BATTLE_SUMMARY_TEST_PLUGIN ? fs.readFileSync(process.env.PF_BATTLE_SUMMARY_TEST_PLUGIN, 'utf8') : name === 'PS_Management' && process.env.PF_BATTLE_SUMMARY_MANAGEMENT_PLUGIN ? fs.readFileSync(process.env.PF_BATTLE_SUMMARY_MANAGEMENT_PLUGIN, 'utf8') : code;
  }
  const vite = require(require.resolve('vite', { paths: [path.join(ROOT, 'src')] }));
  await vite.build({ configFile: false, root: ROOT, logLevel: 'error', build: { outDir: path.join(temp, 'fixture'), minify: false,
    lib: { entry: path.join(ROOT, 'src/plugins/flowtest/music-native-fixture.ts'), formats: ['cjs'], fileName: () => 'entry.cjs' } } });
  fixture = require(path.join(temp, 'fixture/entry.cjs'));
});
test.after(() => { if (temp) fs.rmSync(temp, { recursive: true, force: true }); });
async function open({ lang = 'en', members = 2, hurt = true, bag = { potion: 3, masterball: 2, xattack: 1 }, catalog, trainer = false, egg = false, reserveHP = null, trainerMembers = 1, shadowTag = false, ghost = false, suppliedContent = null, heldItem = '', mint = false, grow = false, fast = false, effects = true } = {}) {
  const h = createVictoryDriverHost({ ROOT, work: temp, plugins, entryText, driverText: 'SYNTHETIC_UNUSED_DRIVER', PLAN, options: { productionTranslator: true } });
  const G = h.G, flow = h.w.flow, content = suppliedContent ?? fixture.musicNativeContent(E, assert), parameters = G.PluginManager.parameters;
  G.Bitmap.prototype.fillRect = () => {}; // Existing controlled drawing port, no native pixel claim.
  if (catalog) catalog(content.items);
  const trainerRecord = content.trainers?.['music-normal']?.[0];
  if (trainerRecord) trainerRecord.party = Array.from({ length: trainerMembers }, (_, i) => ({ ...trainerRecord.party[0], level: 3 + i }));
  if (shadowTag) trainerRecord.party[0].ability = 'shadowtag'; // Explicit author fixture; trapping itself is the real Gen8 engine.
  G.PluginManager.parameters = function (name) { const p = parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...p, language: lang } : p; };
  flow.setLanguage(null); flow.stateReplaced(); flow._app = null; flow._content = content; flow._dex = E.dex.createDexLookup(); flow.seed = [1, 2, 3, 4]; flow.rng = () => 0; flow.fast = fast; (G.ConfigManager ??= {}).battleEffects = effects;
  const state = fixture.musicNativeState(E, content, 'receiving'); state.party = state.party.slice(0, members); state.nextMemberOrdinal = String(members + 1);
  if (ghost) state.party[0] = E.speciesKey.toPersistentMember(E.memberFactory.createMember({ id: state.party[0].id, species: 'Gengar', level: 100 }, content, () => 0), content);
  if (grow) { state.party[0] = E.speciesKey.toPersistentMember(E.memberFactory.createMember({ id: state.party[0].id, species: 'Snorlax', level: 50 }, content, () => 0), content); state.party[0].exp = E.growth.minExp(content.species.Snorlax.growth, 51) - 1; }
  if (heldItem) { state.party[0].item = heldItem; flow.developerCapabilities = { allowHeldItemSources: true, allowExperimentalHeldItemBattle: true }; }
  if (mint) state.party[0].statNature = 'Timid';
  if (hurt) state.party[0].hp -= 40;
  if (reserveHP !== null) state.party[1].hp = reserveHP;
  if (egg) state.party[1].isEgg = true;
  state.inventory = E.inventory.inventoryFromBag(bag, E.itemCatalog.catalogOf(content)); G.$gameSystem._psGame = state;
  G.Input.keyMapper ??= {}; G.Input.isPressed ??= () => false; G.TouchInput.isCancelled ??= () => false;
  const listeners = new Map(), globals = new Map();
  G.document = { addEventListener(k, f) { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(f); }, removeEventListener(k, f) { listeners.get(k)?.delete(f); } };
  G.addEventListener = (k, f) => { if (!globals.has(k)) globals.set(k, new Set()); globals.get(k).add(f); };
  vm.runInContext(plugins.PS_Management, G, { filename: 'actual-PS_Management.js' });
  const before = JSON.stringify(flow.game()); await h.p.toMapId(5, 8, 9);
  const batches = [], begin = flow.begin.bind(flow); flow.begin = async (...args) => { const session = await begin(...args), take = session.take.bind(session); session.take = () => { const value = take(); batches.push({ value, wire: JSON.stringify(value) }); return value; }; return session; };
  flow.openBattle({ kind: trainer ? 'trainer' : 'wild', ...(trainer ? { trainer: { id: 'music-normal', version: 1 } } : { foes: [{ species: 'Pidgey', level: 3 }] }), battleId: 'bag-' + path.basename(h.w.root), seq: 1, canLose: true });
  await h.waitFor(() => !!h.p.battle()?._session, 'real opening Session'); const s = h.p.battle();
  const completed = [], add = s._log.add; s._log.add = function (line) { completed.push(line); return add.call(this, line); };
  await h.p.inMode('main');
  const windows = []; s.addWindow = function (win) { windows.push(win); this.addChild(win); };
  let manage = 0, beginManagement = 0; const application = flow.app(), beginManagementOperation = application.beginManagement.bind(application), write = application.manage.bind(application);
  application.beginManagement = (...a) => { beginManagement++; return beginManagementOperation(...a); };
  application.manage = (...a) => { manage++; return write(...a); };
  return { ...h, s, flow, before, batches, completed, windows, listeners, managementCalls: () => ({ beginManagement, manage }), cleanup() { if (flow.running) flow.abort(Error('owned party switch cleanup')); s.terminate(); } };
}

function row(h, key) { const i = h.s._menu._items.findIndex(r => r.ext === key); assert(i >= 0, 'actual menu key ' + key); h.s._menu.select(i); }
async function pick(h, key) { row(h, key); h.s.onMenuOk(); await h.frames(1); }
async function party(h) { await pick(h, 'party'); assert.equal(h.s._mode, 'party'); }
async function commands(h, id) { await party(h); await pick(h, id); assert.equal(h.s._mode, 'party-command'); }

async function summary(h, id) {
  await commands(h, id);
  assert(h.s._menu._items.some(row => row.ext === 'summary'), 'battle command layer must expose the shared Summary action');
  await pick(h, 'summary');
  await h.waitFor(() => h.G.PSManagement.current()?.view.kind === 'summary' && h.G.PSManagement.current().ready, 'actual shared summary ready');
}
const current = h => h.G.PSManagement.current();
const text = h => current(h).text;
for (const lang of ['en', 'zh']) test(lang + ' battle Summary uses live HP/PP, shared five-page navigation and returns the final stable member without writes', async () => {
  const h = await open({ lang, trainer: true, trainerMembers: 2 }); try {
    const s = h.s._session, lead = s.party[0].id, reserve = s.party[1].id;
    await pick(h, 'fight'); await pick(h, 1); await h.p.inMode('main');
    const used = s.gw.readState('p1').find(m => m.id === lead), saved = JSON.parse(h.before).party[0];
    assert(used.pp.tackle < saved.moves.find(m => m.id === 'tackle').pp, 'actual Gen8 move consumed PP before the summary');
    await commands(h, reserve); await pick(h, 'switch-in'); await h.p.inMode('main');
    const hurt = s.gw.readState('p1').find(m => m.id === reserve);
    assert(hurt.hp < JSON.parse(h.before).party[1].hp, 'actual opponent turn changed the reserve HP');
    await summary(h, lead); assert.equal(h.s.inputState().ready, false); assert(h.flow.app().saveBlocked);
    assert(text(h).includes(lang === 'zh' ? '摘要' : 'Summary'));
    await h.p.press('left'); assert.equal(current(h).view.page, 0);
    await h.p.press('right'); await h.p.press('right'); assert.equal(current(h).view.page, 2);
    assert(text(h).some(line => line.endsWith(`${used.hp}/${used.maxhp}`)), 'shared Skills page uses the current engine HP');
    await h.p.press('right'); assert.equal(current(h).view.page, 3);
    assert(text(h).some(line => line.includes(`${used.pp.tackle}/${saved.moves[0].maxpp} PP`)), 'shared Moves page uses current PP');
    const moves = JSON.stringify(s.party.map(m => m.moves));
    await h.p.press('ok'); assert.equal(current(h).view.detail, 'moves'); await h.p.press('ok'); await h.p.press('shift');
    assert.equal(JSON.stringify(s.party.map(m => m.moves)), moves, 'read-only increment cannot sort or mark');
    await h.p.press('cancel'); assert.equal(current(h).view.detail, null);
    await h.p.press('right'); await h.p.press('right'); assert.equal(current(h).view.page, 4, 'pages clamp at the last page');
    await h.p.press('down'); assert.equal(current(h).view.ids[current(h).view.cursor], reserve);
    await h.p.press('left'); await h.p.press('left');
    assert(text(h).some(line => line.endsWith(`${hurt.hp}/${hurt.maxhp}`)));
    await h.p.press('cancel'); await h.p.inMode('party');
    assert.equal(current(h), null); assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext, reserve);
    assert.deepEqual(h.managementCalls(), { beginManagement: 0, manage: 0 });
    assert.equal(JSON.stringify(h.flow.game()), h.before); assert.equal(h.s._failure, null);
    assert(h.windows.length === 1 && h.windows[0]._destroyed && !h.windows[0].parent);
  } finally { h.cleanup(); }
});
test('faint replacement may inspect the fainted member and returns to the same mandatory selector', async () => {
  const h = await open({ reserveHP: 1 }); try {
    const s = h.s._session, original = s.party[0].id, reserve = s.party[1].id;
    await commands(h, reserve); await pick(h, 'switch-in'); await h.p.inMode('party-forced');
    await pick(h, reserve); assert.equal(h.s._mode, 'party-command');
    assert(!h.s._menu._items.some(row => row.ext === 'switch-in')); await pick(h, 'summary');
    await h.waitFor(() => current(h)?.ready, 'fainted summary');
    await h.p.press('right'); await h.p.press('right'); assert(text(h).some(line => /: 0\//.test(line)));
    await h.p.press('cancel'); await h.p.inMode('party-forced');
    assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext, reserve); h.s.onMenuCancel(); await h.frames(1); assert.equal(h.s._mode, 'party-forced');
    await pick(h, original); await pick(h, 'switch-in'); await h.p.inMode('main');
    assert.equal(s.gw.activeId('p1'), original); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('own summary projections detach dynamic values, reject opponent IDs and preserve minted static metadata', async () => {
  const h = await open({ mint: true }); try {
    const s = h.s._session, id = s.party[0].id, raw = s.gw.snapshot(), take = E.battlePresentation.readBattleSummary;
    const before = take(s, id); assert(before && before.heldItemKnown); before.hp = 0; before.moves[0].pp = 0; before.stats.atk = 1; before.evs.atk = 252;
    const next = take(s, id); assert(next.hp > 0 && next.moves[0].pp > 0 && next.stats.atk > 1 && next.evs.atk !== 252);
    assert.equal(take(s, s.foeTeam[0].id), null); assert.equal(s.gw.snapshot(), raw);
    assert.throws(() => h.flow.app().beginManagement(), /operation-active/);
    const originalNature = h.flow.app().describeIndividual(id).member.nature;
    await summary(h, id); await h.p.press('right');
    const name = h.flow.translator().t('management.nature.' + originalNature.toLowerCase());
    assert(text(h).some(line => line.endsWith(': ' + name)), 'minted stat nature must not replace the original memo nature');
    await h.p.press('cancel'); await h.p.inMode('party');
    assert.deepEqual(h.managementCalls(), { beginManagement: 1, manage: 0 }); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
function heldContent() {
  const read = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'content/sample', n + '.json'), 'utf8'));
  const input = Object.fromEntries(['manifest', 'sources', 'species', 'overlays', 'grants'].map(n => [n, read(n)]));
  input.species.find(s => s.id === 'snorlax').learnset = [{ level: 1, move: 'splash' }];
  input.species.find(s => s.id === 'pidgey').learnset = [{ level: 1, move: 'tackle' }];
  input.items = Object.values(E.itemCatalog.legacyCatalog()).map(item => ({ ...item, source: 'author-placeholder' }));
  input.items.push({ id: 'airballoon', name: 'Air Balloon', namePlural: 'Air Balloons', pocket: 1, price: 0, source: 'author-placeholder' });
  const compiled = E.contentCompile.compileContent(input); assert(compiled.ok, JSON.stringify(compiled.errors));
  const assembled = E.contentRuntime.assembleContent(compiled.data, E.dex.createDexLookup()); assert.deepEqual(assembled.errors, []); return assembled.content;
}
test('an actual consumed held item is displayed as empty before settlement while the saved original remains intact', async () => {
  const h = await open({ suppliedContent: heldContent(), heldItem: 'airballoon' }); try {
    const s = h.s._session, id = s.party[0].id;
    assert.equal(E.battlePresentation.readBattleSummary(s, id).item, 'airballoon');
    await pick(h, 'fight'); await pick(h, 1); await h.p.inMode('main');
    const view = E.battlePresentation.readBattleSummary(s, id); assert(view.heldItemKnown); assert.equal(view.item, ''); assert(!s.finished);
    assert.equal(JSON.parse(h.before).party[0].item, 'airballoon');
    await summary(h, id); assert(text(h).includes(h.flow.translator().t('management.item') + ': ' + h.flow.translator().t('management.none')));
    await h.p.press('cancel'); await h.p.inMode('party'); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('a legacy Session without the authoritative held channel reports unknown rather than its initial item', async () => {
  const F = require('../../../js/engine/build/testing.cjs').fixtures;
  const s = await E.session.BattleSession.create({ game: F.makeGame(), battleId: 'summary-legacy', content: F.content,
    foe: { kind: 'wild', team: [F.foeMember('F-summary', 'Pidgey', 5)] }, seed: [1, 2, 3, 4] });
  const before = s.gw.snapshot(), view = E.battlePresentation.readBattleSummary(s, s.party[0].id);
  assert(view && view.heldItemKnown === false); assert.equal(view.item, ''); assert.equal(s.gw.snapshot(), before);
  const h = await open(); let child; try {
    const id = h.s._session.party[0].id, display = h.flow.app().describeIndividual(id);
    display.heldItemKnown = false; display.member.item = 'airballoon'; // Controlled shared-renderer unknown-value check.
    child = h.G.PSManagement.attachBattleSummary(h.s, id, { views: [display], isCurrent: () => h.flow.running && h.G.SceneManager._scene === h.s }, () => {});
    assert(text(h).includes(h.flow.translator().t('management.item') + ': ' + h.flow.translator().t('management.unavailable')));
    assert.equal(JSON.stringify(h.flow.game()), h.before); assert.deepEqual(h.managementCalls(), { beginManagement: 0, manage: 0 });
  } finally { child?.dispose(); h.cleanup(); }
});
for (const how of ['abort', 'replace', 'terminate']) test('an open shared summary is released by ' + how + ' without touching a successor', async () => {
  const h = await open(); try {
    await summary(h, h.s._session.party[0].id); assert(current(h)); const win = h.windows[0];
    if (how === 'abort') h.flow.abort(Error('owned summary abort')); else if (how === 'replace') h.flow.stateReplaced(); else h.s.terminate();
    if (how !== 'terminate') await h.frames(2); h.s.terminate();
    const successor = { children: [] }; h.G.SceneManager._scene = successor;
    h.s.onMenuOk(); h.s.onMenuCancel(); assert.equal(current(h), null); assert(win._destroyed && !win.parent);
    assert.equal(h.G.SceneManager._scene, successor); assert.equal(successor.children.length, 0);
    assert.equal(h.listeners.get('keydown').size, 1, 'only the plugin-wide keyboard source remains');
    assert.equal(JSON.stringify(h.flow.game()), h.before); assert(!h.flow.app().saveBlocked);
  } finally { h.cleanup(); }
});
test('an unavailable management presenter gives a controlled message and returns to the member list', async () => {
  const h = await open(); try {
    h.G.PSManagement.attachBattleSummary = undefined; const id = h.s._session.party[0].id;
    await commands(h, id); await pick(h, 'summary'); await h.p.inMode('party');
    assert(h.completed.includes(h.flow.translator().t('management.unavailable'))); assert.equal(h.s._failure, null);
    assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext, id); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});

test('a completed real level-up is reflected in the shared summary before the final game-state commit', async () => {
  const h = await open({ grow: true, trainer: true, trainerMembers: 2 }); try {
    const s = h.s._session, id = s.party[0].id;
    assert.equal(h.flow.app().describeIndividual(id).member.level, 50);
    await pick(h, 'fight'); await pick(h, 1); await h.p.inMode('main');
    const live = E.battlePresentation.readBattleSummary(s, id); assert.equal(live.level, 51); assert.equal(s.party[0].level, 51);
    assert.equal(h.flow.app().describeIndividual(id).member.level, 50, 'persistent metadata has not been settled yet');
    await summary(h, id); assert(text(h).some(line => line.includes('Lv.51')));
    await h.p.press('right'); await h.p.press('right'); assert(text(h).some(line => line.endsWith(`${live.hp}/${live.stats.hp}`)));
    await h.p.press('cancel'); await h.p.inMode('party'); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
