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
async function open({ lang = 'en', members = 2, hurt = true, bag = { potion: 3, masterball: 2, xattack: 1 }, catalog, trainer = false, egg = false, reserveHP = null, trainerMembers = 1, shadowTag = false, ghost = false, suppliedContent = null, heldItem = '', mint = false, grow = false, fast = false, effects = true, eggShiny = false, integration = false, canSwitch, leadHP = null, command = null, pivot = false, leadingEgg = false } = {}) {
  const h = createVictoryDriverHost({ ROOT, work: temp, plugins, entryText, driverText: 'SYNTHETIC_UNUSED_DRIVER', PLAN, options: { productionTranslator: true } });
  const G = h.G, flow = h.w.flow, content = suppliedContent ?? fixture.musicNativeContent(E, assert), parameters = G.PluginManager.parameters;
  G.Bitmap.prototype.fillRect = () => {}; // Existing controlled drawing port, no native pixel claim.
  if (catalog) catalog(content.items);
  if (integration) { assert(content.moves.Rest); content.species.Snorlax.learnset[51] = ['Rest']; }
  const trainerRecord = content.trainers?.['music-normal']?.[0];
  if (trainerRecord) trainerRecord.party = Array.from({ length: trainerMembers }, (_, i) => ({ ...trainerRecord.party[0], level: 3 + i }));
  if (pivot) { trainerRecord.party[0].level = 100; trainerRecord.party[0].moves = ['splash']; }
  if (shadowTag) trainerRecord.party[0].ability = 'shadowtag'; // Explicit author fixture; trapping itself is the real Gen8 engine.
  G.PluginManager.parameters = function (name) { const p = parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...p, language: lang } : p; };
  flow.setLanguage(null); flow.stateReplaced(); flow._app = null; flow._content = content; flow._dex = E.dex.createDexLookup(); flow.seed = [1, 2, 3, 4]; flow.rng = () => 0; flow.fast = fast; (G.ConfigManager ??= {}).battleEffects = effects;
  const state = fixture.musicNativeState(E, content, 'receiving'); state.party = state.party.slice(0, members); state.nextMemberOrdinal = String(members + 1);
  if (ghost) state.party[0] = E.speciesKey.toPersistentMember(E.memberFactory.createMember({ id: state.party[0].id, species: 'Gengar', level: 100 }, content, () => 0), content);
  if (grow) { state.party[0] = E.speciesKey.toPersistentMember(E.memberFactory.createMember({ id: state.party[0].id, species: 'Snorlax', level: 50 }, content, () => 0), content); state.party[0].exp = E.growth.minExp(content.species.Snorlax.growth, 51) - 1; }
  if (integration) { state.party[0].moves = [{ id: 'tackle', pp: 35, maxpp: 35 }, { id: 'growl', pp: 40, maxpp: 40 }, { id: 'splash', pp: 40, maxpp: 40 }, { id: 'protect', pp: 10, maxpp: 10 }]; state.party[0].gender = 'F'; state.party[0].shiny = true; state.dex.owned.push('pidgey'); Object.assign(trainerRecord.party[0], { gender: 'M', shiny: false }); }
  if (pivot) state.party[0].moves = [{ id: 'uturn', pp: 20, maxpp: 20 }];
  if (heldItem) { state.party[0].item = heldItem; flow.developerCapabilities = { allowHeldItemSources: true, allowExperimentalHeldItemBattle: true }; }
  if (mint) state.party[0].statNature = 'Timid';
  if (hurt) state.party[0].hp -= 40;
  if (leadHP !== null) { state.party[0].hp = leadHP; state.party[0].moves = [{ id: 'splash', pp: 40, maxpp: 40 }]; }
  if (reserveHP !== null) state.party[egg ? 2 : 1].hp = reserveHP;
  if (egg) { state.party[1].isEgg = true; state.party[1].shiny = eggShiny; state.party[1].nickname = 'Hidden Species'; }
  if (leadingEgg) { state.party[0].isEgg = true; state.party[0].nickname = 'LEADING-EGG-NAME'; }
  state.inventory = E.inventory.inventoryFromBag(bag, E.itemCatalog.catalogOf(content)); G.$gameSystem._psGame = state;
  G.Input.keyMapper ??= {}; G.Input.isPressed ??= () => false; G.TouchInput.isCancelled ??= () => false;
  const listeners = new Map(), globals = new Map();
  G.document = { addEventListener(k, f) { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(f); }, removeEventListener(k, f) { listeners.get(k)?.delete(f); } };
  G.addEventListener = (k, f) => { if (!globals.has(k)) globals.set(k, new Set()); globals.get(k).add(f); };
  vm.runInContext(plugins.PS_Management, G, { filename: 'actual-PS_Management.js' });
  const before = JSON.stringify(flow.game()); await h.p.toMapId(5, 8, 9);
  const batches = [], begin = flow.begin.bind(flow); flow.begin = async (...args) => { const session = await begin(...args), take = session.take.bind(session); session.take = () => { const value = take(); batches.push({ value, wire: JSON.stringify(value) }); return value; }; return session; };
  if (command) h.w.commands['PS_BattleFlow:' + command].call({ setWaitMode() {} }, { kind: 'wild', foes: 'Pidgey:3', trainerId: 'music-normal', version: '1', canLose: 'true', ...(canSwitch === undefined ? {} : { canSwitch }) });
  else flow.openBattle({ kind: trainer ? 'trainer' : 'wild', ...(trainer ? { trainer: { id: 'music-normal', version: 1 } } : { foes: [{ species: 'Pidgey', level: 3 }] }), battleId: 'bag-' + path.basename(h.w.root), seq: 1, canLose: true, ...(canSwitch === undefined ? {} : { canSwitch }) });
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
    await h.p.press('up'); assert.equal(current(h).view.ids[current(h).view.cursor], reserve, 'after a real switch the reserve is the preceding displayed row');
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

// Eggs exist in the application's party but are deliberately absent from BattleSession/Showdown.
for (const lang of ['en', 'zh']) test(lang + ' battle Egg stays inspectable with hidden combat details and read-only single-page Summary', async () => {
  const h = await open({ lang, members: 3, egg: true, eggShiny: true }); try {
    const s = h.s._session, saved = JSON.parse(h.before), [lead, egg, reserve] = saved.party.map(m => m.id);
    assert.deepEqual(s.party.map(m => m.id), [lead, reserve]);
    const engineBefore = s.gw.snapshot(), sessionBefore = JSON.stringify(s.party);
    assert.equal(E.battlePresentation.readBattleSummary(s, egg), null, 'Egg has no battle projection');
    {
      await commands(h, egg);
      assert.deepEqual(Array.from(h.s._menu._items, r => r.ext), ['summary', null], 'Egg must never offer Switch In');
      await pick(h, null); assert.equal(h.s._mode, 'party');
      assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext, egg);
      const row = h.s._menu._items.find(r => r.ext === egg);
      assert.equal(row.name, lang === 'zh' ? '蛋' : 'Egg', 'Egg hides level/HP/species/gender/shiny metadata');
      assert.equal(row.enabled, true);
      await pick(h, egg); await pick(h, 'summary');
      await h.waitFor(() => current(h)?.ready, 'Egg read-only shared Summary');
      assert.deepEqual(Array.from(current(h).view.ids), [lead, egg, reserve]);
      assert.equal(current(h).view.ids[current(h).view.cursor], egg);
      assert(text(h).some(line => line.includes('1/1')));
      assert(!text(h).some(line => /Lv\.|Hidden Species|★|Snorlax|卡比兽/.test(line)), 'Egg header must not disclose combat metadata');
      for (const key of ['right', 'left', 'ok', 'shift']) await h.p.press(key);
      assert.equal(current(h).view.page, 0); assert.equal(current(h).view.detail, null);
      await h.p.press('down'); assert.equal(current(h).view.ids[current(h).view.cursor], reserve);
      await h.p.press('right'); await h.p.press('up');
      assert.equal(current(h).view.page, 1); assert.equal(current(h).view.ids[current(h).view.cursor], lead, 'non-INFO navigation skips Egg');
      await h.p.press('left'); await h.p.press('down');
      assert.equal(current(h).view.ids[current(h).view.cursor], egg, 'INFO can enter Egg again');
      await h.p.press('cancel'); await h.p.inMode('party');
      assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext, egg);
      assert.equal(s.gw.snapshot(), engineBefore); assert.equal(JSON.stringify(s.party), sessionBefore);
      assert.equal(JSON.stringify(h.flow.game()), h.before);
      assert.deepEqual(h.managementCalls(), { beginManagement: 0, manage: 0 }); assert.equal(h.s._failure, null);
    }
  } finally { h.cleanup(); }
});
test('switching past an Egg uses the non-Egg stable member identity and current engine HP', async () => {
  const h = await open({ members: 3, egg: true }); try {
    const [lead, egg, reserve] = JSON.parse(h.before).party.map(m => m.id), s = h.s._session;
    await commands(h, reserve); await pick(h, 'switch-in'); await h.p.inMode('main');
    assert.equal(s.gw.activeId('p1'), reserve); assert(!s.party.some(m => m.id === egg));
    const live = s.gw.readState('p1').find(m => m.id === reserve);
    assert(live.hp < JSON.parse(h.before).party[2].hp);
    await party(h); const row = h.s._menu._items.find(m => m.ext === reserve);
    assert(row.name.includes(String(live.hp) + '/' + live.maxhp));
    assert.equal(JSON.stringify(h.flow.game()), h.before); assert.equal(h.s._failure, null);
  } finally { h.cleanup(); }
});
test('mandatory replacement can inspect an Egg but cannot deploy it or cancel replacement', async () => {
  const h = await open({ members: 3, egg: true, reserveHP: 1 }); try {
    const s = h.s._session, [lead, egg, reserve] = JSON.parse(h.before).party.map(m => m.id);
    // The actual engine, rather than a fabricated request, produces fainted forced replacement.
    await commands(h, reserve); await pick(h, 'switch-in'); await h.p.inMode('party-forced');
    await pick(h, egg); assert.deepEqual(Array.from(h.s._menu._items, r => r.ext), ['summary', null]);
    await pick(h, 'summary'); await h.waitFor(() => current(h)?.ready, 'forced Egg Summary');
    await h.p.press('cancel'); await h.p.inMode('party-forced');
    assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext, egg);
    h.s.onMenuCancel(); await h.frames(1); assert.equal(h.s._mode, 'party-forced');
    await pick(h, lead); await pick(h, 'switch-in'); await h.p.inMode('main');
    assert.equal(s.gw.activeId('p1'), lead); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
for (const retirement of ['abort', 'replace', 'terminate']) test('Egg Summary retires on owner ' + retirement + ' without writes', async () => {
  const h = await open({ members: 3, egg: true }); try {
    const id = JSON.parse(h.before).party[1].id; await summary(h, id);
    const win = h.windows.at(-1);
    if (retirement === 'abort') h.flow.abort(Error('owned Egg Summary abort'));
    else if (retirement === 'replace') h.flow.stateReplaced();
    else h.s.terminate();
    await h.frames(3); assert.equal(current(h), null); assert(win._destroyed && !win.parent);
    assert.equal(JSON.stringify(h.flow.game()), h.before); assert.deepEqual(h.managementCalls(), { beginManagement: 0, manage: 0 });
  } finally { h.cleanup(); }
});
test('legacy item targeting keeps Session-only non-Egg eligibility', async () => {
  const h = await open({ members: 3, egg: true }); try {
    h.s._pendingItem = 'potion'; h.s.showParty('item');
    assert.deepEqual(h.s._menu._items.map(m => m.ext), h.s._session.party.map(m => m.id));
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});

for (const lang of ['en', 'zh']) test(lang + ' combined public cards, full-slot learning, Egg Summary and final installation share one real battle', async () => {
 const h = await open({ lang, members: 3, egg: true, grow: true, integration: true, trainer: true, trainerMembers: 2, fast: true }); try {
  const s = h.s._session, lead = s.party[0].id, egg = JSON.parse(h.before).party[1].id;
  const cards = () => h.s.statusCardState().filter(card => card.visible), player = cards().find(card => card.side === 'p1'), foe = cards().find(card => card.side === 'p2');
  assert.equal(player.gender.kind, 'female'); assert.equal(player.shiny, true); assert.equal(foe.gender.kind, 'male'); assert.equal(foe.owned, true);
  let installs = 0, doc = h.G.$gameSystem._psGame; Object.defineProperty(h.G.$gameSystem, '_psGame', { configurable: true, get: () => doc, set: value => { installs++; doc = value; } });
  await pick(h, 'fight'); await pick(h, 1); await h.p.inMode('learn-initial');
  assert.equal(h.flow.game().party[0].level, 50); assert.equal(s.party[0].level, 51); assert.equal(installs, 0);
  await h.frames(1); await pick(h, 'forget-move'); assert.equal(h.s._mode, 'learn'); h.s._menu.select(3); h.s.onMenuCancel(); await h.p.inMode('learn-giveup');
  await h.frames(1); await pick(h, 'continue-learning'); assert.equal(h.s._mode, 'learn'); assert.equal(h.s._menu.index(), 3);
  await pick(h, 3); await h.p.inMode('main'); assert.equal(s.party[0].moves[3].id, 'rest'); assert.equal(s.gw.readState('p1').find(m => m.id === lead).pp.rest, 10);
  assert(!h.flow.app().describeIndividual(lead).member.moves.some(move => move.id === 'rest')); assert.equal(JSON.stringify(h.flow.game()), h.before);
  await summary(h, lead); assert(text(h).some(line => line.includes('Lv.51'))); await h.p.press('right'); await h.p.press('right'); await h.p.press('right');
  assert.equal(current(h).view.page, 3);
  assert(text(h).some(line => /\brest\b.*10\/10 PP/i.test(line)), 'actual shared move row shows the newly learned Rest and its reset PP'); await h.p.press('left'); await h.p.press('left'); await h.p.press('left'); await h.p.press('down');
  assert.equal(current(h).view.ids[current(h).view.cursor], egg); assert(text(h).some(line => line.includes('1/1')));
  await h.p.press('cancel'); await h.p.inMode('party'); assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext, egg);
  assert.equal(cards().find(card => card.side === 'p1').gender.kind, 'female'); assert.equal(cards().find(card => card.side === 'p1').shiny, true);
  assert.equal(installs, 0); assert.equal(JSON.stringify(h.flow.game()), h.before); assert.deepEqual(h.managementCalls(), { beginManagement: 0, manage: 0 });
  h.s.onMenuCancel(); await h.p.inMode('main'); await pick(h, 'fight'); await pick(h, 1); await h.p.inMode('end');
  assert.equal(installs, 0); await h.frames(1); h.s.onMenuOk(); await h.frames(3); assert.equal(h.flow.lastOutcome.commit, 'applied'); assert.equal(installs, 1);
  assert.equal(h.flow.game().party[0].level, 51); assert(h.flow.game().party[0].moves.some(move => move.id === 'rest')); const after = JSON.stringify(h.flow.game()); h.s.onEnd(); assert.equal(installs, 1); assert.equal(JSON.stringify(h.flow.game()), after);
 } finally { h.cleanup(); }
});

for (const lang of ['en', 'zh']) test(lang + ' manual switching policy hides Switch In but keeps Summary and rejects direct voluntary choices without changes', async () => {
 const h = await open({ lang, canSwitch: false }); try {
  const s = h.s._session, id = s.party[1].id, raw = s.gw.snapshot(), work = JSON.stringify(s.party), bag = JSON.stringify(s.bag), ledger = JSON.stringify(s.ledger);
  await commands(h, id); assert.deepEqual(Array.from(h.s._menu._items, row => row.ext), ['summary', null], 'disabled manual switching must not offer Switch In');
  await pick(h, 'summary'); await h.waitFor(() => current(h)?.ready, 'inspect while manual switching disabled'); await h.p.press('cancel'); await h.p.inMode('party');
  assert.deepEqual(await s.chooseSwitch(id), { ok: false, reason: 'choice-rejected' });
  assert.deepEqual(await s.chooseForcedSwitch(id), { ok: false, reason: 'choice-rejected' }, 'method name alone must not bypass a normal active request');
  assert.equal(s.canSwitch, false); assert.equal(s.gw.snapshot(), raw); assert.equal(JSON.stringify(s.party), work); assert.equal(JSON.stringify(s.bag), bag); assert.equal(JSON.stringify(s.ledger), ledger); assert.equal(JSON.stringify(h.flow.game()), h.before);
  h.s.onMenuCancel(); await h.p.inMode('main'); assert.equal(h.s._failure, null);
 } finally { h.cleanup(); }
});
test('disabled voluntary switching still permits the real fainted replacement', async () => {
 const h = await open({ canSwitch: false, leadHP: 1 }); try {
  const s = h.s._session, lead = s.party[0].id, next = s.party[1].id;
  await pick(h, 'fight'); await pick(h, 1); await h.p.inMode('party-forced'); assert(s.gw.readState('p1').find(m => m.id === lead).fainted);
  h.s.onMenuCancel(); await h.frames(1); assert.equal(h.s._mode, 'party-forced');
  await pick(h, next); assert(h.s._menu._items.some(row => row.ext === 'switch-in'));
  await pick(h, 'switch-in'); await h.p.inMode('main'); assert.equal(s.gw.activeId('p1'), next); assert.equal(s.canSwitch, false); assert.equal(JSON.stringify(h.flow.game()), h.before);
 } finally { h.cleanup(); }
});
test('policy rejection does not cancel or refund an already staged item', async () => {
 const h = await open({ canSwitch: false }); try {
  const s = h.s._session; assert.deepEqual(await s.useItem('potion', s.party[0].id, { commit: false }), { ok: true, staged: true });
  const raw = s.gw.snapshot(), ledger = JSON.stringify(s.ledger), bag = JSON.stringify(s.bag);
  assert.equal((await s.chooseSwitch(s.party[1].id)).ok, false);
  assert.equal(s.gw.snapshot(), raw); assert.equal(JSON.stringify(s.ledger), ledger); assert.equal(JSON.stringify(s.bag), bag); assert.equal(JSON.stringify(h.flow.game()), h.before);
 } finally { h.cleanup(); }
});
test('explicit true keeps the existing voluntary switch behavior', async () => {
 const h = await open({ canSwitch: true }); try { const s = h.s._session, id = s.party[1].id; await commands(h, id); await pick(h, 'switch-in'); await h.p.inMode('main'); assert.equal(s.gw.activeId('p1'), id); assert.equal(s.canSwitch, true); assert.equal(JSON.stringify(h.flow.game()), h.before); } finally { h.cleanup(); }
});
for (const command of ['StartBattle', 'StartTrainerBattle']) test(command + ' real registered event forwards its false boolean argument', async () => {
 const h = await open({ command, canSwitch: 'false' }); try { assert.equal(h.s._session.canSwitch, false); await commands(h, h.s._session.party[1].id); assert(!h.s._menu._items.some(row => row.ext === 'switch-in')); assert.equal(JSON.stringify(h.flow.game()), h.before); } finally { h.cleanup(); }
});
test('invalid MZ policy values are rejected before opening or incrementing the event sequence', async () => {
 const h = await open(); try { h.cleanup(); const before = JSON.stringify(h.flow.game()), seq = h.G.$gameSystem._psBattleSeq;
  for (const name of ['StartBattle', 'StartTrainerBattle']) for (const canSwitch of [null, 0, 'no', {}]) assert.throws(() => h.w.commands['PS_BattleFlow:' + name].call({ setWaitMode() {} }, { canSwitch }), /canSwitch must be true or false/);
  assert.equal(h.flow.running, false); assert.equal(h.G.$gameSystem._psBattleSeq, seq); assert.equal(JSON.stringify(h.flow.game()), before);
 } finally { h.cleanup(); }
});
test('direct Session validates the new policy before calling the driver', async () => {
 let calls = 0; const driver = { moveNames() { calls++; throw Error('must not be reached'); } };
 for (const canSwitch of [null, 0, 'false', {}]) await assert.rejects(E.session.BattleSession.create({ game: {}, foe: {}, content: {}, battleId: 'invalid-policy', canSwitch, driver }), /canSwitch must be boolean/);
 assert.equal(calls, 0);
});

test('a real U-turn replacement remains available under the no-manual-switch rule', async () => {
 const h = await open({ canSwitch: false, trainer: true, pivot: true }); try {
  const s = h.s._session, lead = s.party[0].id, next = s.party[1].id;
  await pick(h, 'fight'); await pick(h, 1); await h.p.inMode('party-forced'); assert(!s.gw.readState('p1').find(m => m.id === lead).fainted); assert(s.currentRequest().forceSwitch[0]);
  await pick(h, next); await pick(h, 'switch-in'); await h.p.inMode('main'); assert.equal(s.gw.activeId('p1'), next); assert.equal(JSON.stringify(h.flow.game()), h.before);
 } finally { h.cleanup(); }
});
test('existing doubles command API also rejects voluntary switch specs before changing the engine', async () => {
 const h = await open({ members: 3 }); try {
  const source = h.s._session, s = await E.session.BattleSession.create({ game: { ...h.flow.game(), party: source.party }, battleId: 'policy-doubles', content: source.content, foe: { ...source.foe, team: [...source.foe.team, { ...structuredClone(source.foe.team[0]), id: 'POLICY-F2' }] }, seed: [1, 2, 3, 4], doubles: true, canSwitch: false });
  const raw = s.gw.snapshot(), bag = JSON.stringify(s.bag), ledger = JSON.stringify(s.ledger);
  assert.deepEqual(await s.chooseDoubles([{ switch: 3 }, { move: 1 }]), { ok: false, reason: 'choice-rejected' });
  assert.equal(s.gw.snapshot(), raw); assert.equal(JSON.stringify(s.bag), bag); assert.equal(JSON.stringify(s.ledger), ledger);
 } finally { h.cleanup(); }
});

// Accepted policies and details must coexist with the real Summary/growth owner.
for (const lang of ['en', 'zh']) test(lang + ' combined disabled switching, shared learning details and live Egg Summary keep one battle and install once', async () => {
 const h = await open({ lang, members: 3, egg: true, grow: true, integration: true, trainer: true, trainerMembers: 2, fast: true, canSwitch: false }); try {
  const s = h.s._session, lead = s.party[0].id, reserve = s.party[1].id, egg = JSON.parse(h.before).party[1].id, app = h.flow.app();
  assert.equal(s.canSwitch, false, 'typed policy must reach this actual mixed Session');
  const beginLearning = app.beginLearning.bind(app); let learningTransactions = 0; app.beginLearning = (...args) => { learningTransactions++; return beginLearning(...args); };
  let installs = 0, doc = h.G.$gameSystem._psGame; Object.defineProperty(h.G.$gameSystem, '_psGame', { configurable: true, get: () => doc, set: value => { installs++; doc = value; } });
  await commands(h, reserve); assert.deepEqual(Array.from(h.s._menu._items, row => row.ext), ['summary', null]);
  await pick(h, 'summary'); await h.waitFor(() => current(h)?.ready, 'mixed pre-growth read-only Summary'); await h.p.press('cancel'); await h.p.inMode('party'); h.s.onMenuCancel(); await h.p.inMode('main');
  await pick(h, 'fight'); await pick(h, 1); await h.p.inMode('learn-initial'); assert.equal(installs, 0); await h.frames(1); await pick(h, 'forget-move');
  assert.equal(typeof h.s.learningMoveState, 'function', 'mixed Scene retains the accepted details consumer'); const win = h.s._menu, normal = h.s._commandMenu; assert.notEqual(win, normal); assert.equal(normal.visible, false);
  let view = h.s.learningMoveState(); assert.equal(view.page.rows.length, 5); assert.equal(view.page.rows[0].details, '34/35 PP'); assert.equal(view.page.rows[4].moveId, 'rest');
  win.select(4); assert(h.s.learningMoveState().text.includes(lang === 'zh' ? '属性：Psychic' : 'Type: Psychic'));
  h.s.onMenuOk(); await h.p.inMode('learn-giveup'); assert.equal(h.s._menu, normal); assert.equal(win.visible, false); await h.frames(1); await pick(h, 'continue-learning'); assert.equal(h.s._menu, win); assert.equal(win.index(), 4);
  await pick(h, 3); await h.p.inMode('main'); assert.equal(h.s._menu, normal); assert.equal(win.visible, false); assert.equal(win.active, false); assert.equal(s.party[0].moves[3].id, 'rest'); assert.equal(s.gw.readState('p1').find(m => m.id === lead).pp.rest, 10);
  // Swapping the menu instance for learning must not reset the author policy.
  await commands(h, reserve); assert.deepEqual(Array.from(h.s._menu._items, row => row.ext), ['summary', null]); h.s.onMenuCancel(); await h.p.inMode('party'); h.s.onMenuCancel(); await h.p.inMode('main');
  const raw = s.gw.snapshot(), work = JSON.stringify(s.party); assert.deepEqual(await s.chooseSwitch(reserve), { ok: false, reason: 'choice-rejected' }); assert.equal(s.gw.snapshot(), raw); assert.equal(JSON.stringify(s.party), work);
  await summary(h, lead); assert(text(h).some(line => line.includes('Lv.51'))); await h.p.press('right'); await h.p.press('right'); await h.p.press('right'); assert(text(h).some(line => /\brest\b.*10\/10 PP/i.test(line)));
  await h.p.press('left'); await h.p.press('left'); await h.p.press('left'); await h.p.press('down'); assert.equal(current(h).view.ids[current(h).view.cursor], egg); assert(text(h).some(line => line.includes('1/1'))); await h.p.press('cancel'); await h.p.inMode('party'); assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext, egg);
  const player = h.s.statusCardState().find(card => card.side === 'p1'); assert.equal(player.gender.kind, 'female'); assert.equal(player.shiny, true);
  assert.equal(installs, 0); assert.equal(JSON.stringify(h.flow.game()), h.before); assert.deepEqual(h.managementCalls(), { beginManagement: 0, manage: 0 }); assert.equal(learningTransactions, 0); assert.equal(s.canSwitch, false);
  h.s.onMenuCancel(); await h.p.inMode('main'); await pick(h, 'fight'); await pick(h, 1); await h.p.inMode('end'); assert.equal(installs, 0); await h.frames(1); h.s.onMenuOk(); await h.frames(3); assert.equal(installs, 1); assert.equal(h.flow.lastOutcome.commit, 'applied'); assert.equal(h.flow.game().party[0].level, 51); assert(h.flow.game().party[0].moves.some(move => move.id === 'rest'));
  const installed = JSON.stringify(h.flow.game()); h.s.onEnd(); assert.equal(installs, 1); assert.equal(JSON.stringify(h.flow.game()), installed);
 } finally { h.cleanup(); }
});

const displayIds = h => Array.from(h.s._menu._items, row => row.ext).filter(id => id !== null);
for(const lang of ['en','zh'])test(lang+' party display order follows real swaps and Summary returns a stable member without sorting the save',async()=>{
 const h=await open({lang,members:4,egg:true,trainer:true,fast:true,effects:lang!=='en'});try{const s=h.s._session,saved=JSON.parse(h.before).party.map(m=>m.id),sessionIds=s.party.map(m=>m.id),[a,egg,b,c]=saved;let installs=0,doc=h.G.$gameSystem._psGame;Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>doc,set:value=>{installs++;doc=value;}});
 await commands(h,b);await pick(h,'switch-in');await h.p.inMode('main');assert.equal(s.gw.activeId('p1'),b);await party(h);assert.deepEqual(displayIds(h),[b,egg,a,c],'first switch swaps natural display ranks including the Egg');h.s.onMenuCancel();await h.p.inMode('main');
 await commands(h,c);await pick(h,'switch-in');await h.p.inMode('main');await party(h);assert.deepEqual(displayIds(h),[c,egg,a,b],'second switch swaps ranks instead of merely moving the active row to front');h.s.onMenuCancel();await h.p.inMode('main');
 const raw=s.gw.snapshot(),work=JSON.stringify(s.party);await summary(h,c);assert.deepEqual(Array.from(current(h).view.ids),[c,egg,a,b]);await h.p.press('down');assert.equal(current(h).view.ids[current(h).view.cursor],egg);assert(text(h).some(t=>t.includes('1/1')));await h.p.press('up');await h.p.press('right');await h.p.press('down');assert.equal(current(h).view.ids[current(h).view.cursor],a,'non-INFO navigation skips the Egg in displayed order');await h.p.press('down');assert.equal(current(h).view.ids[current(h).view.cursor],b);await h.p.press('cancel');await h.p.inMode('party');assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext,b);assert.equal(h.s._menu.index(),3,'display cursor is not the saved index');assert.equal(s.gw.snapshot(),raw);assert.equal(JSON.stringify(s.party),work);
 await pick(h,b);await pick(h,'switch-in');await h.p.inMode('main');assert.equal(s.gw.activeId('p1'),b,'row3 submits member B, never raw participating slot3');await party(h);assert.deepEqual(displayIds(h),[b,egg,a,c]);assert.deepEqual(s.party.map(m=>m.id),sessionIds);assert.deepEqual(h.flow.game().party.map(m=>m.id),saved);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.deepEqual(h.managementCalls(),{beginManagement:0,manage:0});
 assert.equal(installs,0);h.s.onMenuCancel();await h.p.inMode('main');await h.p.fightUntilEnd();await h.frames(1);h.s.onMenuOk();await h.frames(3);assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(installs,1);assert.deepEqual(h.flow.game().party.map(m=>m.id),saved,'final result write preserves original saved positions, including the Egg');h.s.onEnd();assert.equal(installs,1);
 }finally{h.cleanup();}
});
test('party display order handles a leading Egg at initial dispatch and keeps it display-only after a real switch',async()=>{
 const h=await open({members:4,leadingEgg:true,fast:true});try{const saved=JSON.parse(h.before).party.map(m=>m.id),[egg,a,b,c]=saved,s=h.s._session;assert.equal(s.gw.activeId('p1'),a);await party(h);assert.deepEqual(displayIds(h),[a,egg,b,c],'initial shown dispatch swaps the leading Egg rank');assert(h.s._menu._items.find(row=>row.ext===egg).name.includes('Egg'));h.s.onMenuCancel();await h.p.inMode('main');await commands(h,c);await pick(h,'switch-in');await h.p.inMode('main');await party(h);assert.deepEqual(displayIds(h),[c,egg,b,a]);await pick(h,egg);assert.deepEqual(Array.from(h.s._menu._items,row=>row.ext),['summary',null]);assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{h.cleanup();}
});
for(const kind of ['faint','pivot'])test('party display order follows the real mandatory '+kind+' replacement and keeps stable-ID submission',async()=>{
 const h=await open({members:4,egg:true,trainer:true,fast:true,...(kind==='faint'?{leadHP:1}:{pivot:true})});try{const saved=JSON.parse(h.before).party.map(m=>m.id),[a,egg,b,c]=saved,s=h.s._session;await pick(h,'fight');await pick(h,1);await h.p.inMode('party-forced');assert.equal(!!s.gw.readState('p1').find(m=>m.id===a).fainted,kind==='faint');h.s.onMenuCancel();await h.frames(1);assert.equal(h.s._mode,'party-forced');await pick(h,c);await pick(h,'switch-in');await h.p.inMode('main');assert.equal(s.gw.activeId('p1'),c);await party(h);assert.deepEqual(displayIds(h),[c,egg,b,a]);assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{h.cleanup();}
});
