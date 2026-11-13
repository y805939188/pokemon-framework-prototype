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
async function open({ nicknames = null, lang = 'en', members = 2, hurt = true, bag = { potion: 3, masterball: 2, xattack: 1 }, catalog, trainer = false, egg = false, reserveHP = null, trainerMembers = 1, shadowTag = false, ghost = false, suppliedContent = null, heldItem = '', mint = false, grow = false, fast = false, effects = true, eggShiny = false, integration = false, canSwitch, expGain, noRun, noBall, battleEffects, battleStyle = 'set', playerStyle, leadHP = null, command = null, pivot = false, leadingEgg = false, leadMoves = null, benchMoves = null, captureSetting } = {}) {
  const h = createVictoryDriverHost({ ROOT, work: temp, plugins, entryText, driverText: 'SYNTHETIC_UNUSED_DRIVER', PLAN, options: { productionTranslator: true } });
  const G = h.G, flow = h.w.flow, content = suppliedContent ?? fixture.musicNativeContent(E, assert), parameters = G.PluginManager.parameters;
  if (captureSetting !== undefined) { content.settings = { ...content.settings, GAIN_EXP_FOR_CAPTURE: captureSetting }; flow.receiveOptions = { mode: 0, naming: 1 }; }
  G.Bitmap.prototype.fillRect = () => {}; // Existing controlled drawing port, no native pixel claim.
  if (catalog) catalog(content.items);
  if (integration) { assert(content.moves.Rest); content.species.Snorlax.learnset[51] = ['Rest']; }
  const trainerRecord = content.trainers?.['music-normal']?.[0];
  if (trainerRecord) trainerRecord.party = Array.from({ length: trainerMembers }, (_, i) => ({ ...trainerRecord.party[0], level: 3 + i }));
  if (pivot) { trainerRecord.party[0].level = 100; trainerRecord.party[0].moves = ['splash']; }
  if (shadowTag) trainerRecord.party[0].ability = 'shadowtag'; // Explicit author fixture; trapping itself is the real Gen8 engine.
  G.PluginManager.parameters = function (name) { const p = parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...p, language: lang } : p; };
  flow.setLanguage(null); flow.stateReplaced(); flow._app = null; flow._content = content; flow._dex = E.dex.createDexLookup(); flow.seed = [1, 2, 3, 4]; flow.rng = () => 0; flow.fast = fast; (G.ConfigManager ??= {}).battleEffects = effects; if (playerStyle !== undefined) G.ConfigManager.psBattleStyle = playerStyle;
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
  if (leadMoves) state.party[0].moves = leadMoves.map(move => ({ ...move }));
  if (benchMoves) state.party[1].moves = benchMoves.map(move => ({ ...move }));
  if (nicknames) state.party.forEach((m, i) => { m.nickname = nicknames[i] ?? ''; });
  state.inventory = E.inventory.inventoryFromBag(bag, E.itemCatalog.catalogOf(content)); G.$gameSystem._psGame = state;
  G.Input.keyMapper ??= {}; G.Input.isPressed ??= () => false; G.TouchInput.isCancelled ??= () => false;
  const listeners = new Map(), globals = new Map();
  G.document = { addEventListener(k, f) { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(f); }, removeEventListener(k, f) { listeners.get(k)?.delete(f); } };
  G.addEventListener = (k, f) => { if (!globals.has(k)) globals.set(k, new Set()); globals.get(k).add(f); };
  vm.runInContext(plugins.PS_Management, G, { filename: 'actual-PS_Management.js' });
  const before = JSON.stringify(flow.game()); await h.p.toMapId(5, 8, 9);
  const batches = [], begin = flow.begin.bind(flow); flow.begin = async (...args) => { const session = await begin(...args), take = session.take.bind(session); session.take = () => { const value = take(); batches.push({ value, wire: JSON.stringify(value) }); return value; }; return session; };
  if (command) h.w.commands['PS_BattleFlow:' + command].call({ setWaitMode() {} }, { kind: 'wild', foes: 'Pidgey:3', trainerId: 'music-normal', version: '1', canLose: 'true', ...(canSwitch === undefined ? {} : { canSwitch }), ...(expGain === undefined ? {} : { expGain }), ...(noRun === undefined ? {} : { noRun }), ...(noBall === undefined ? {} : { noBall }), ...(battleEffects === undefined ? {} : { battleEffects }), battleStyle });
  else flow.openBattle({ kind: trainer ? 'trainer' : 'wild', ...(trainer ? { trainer: { id: 'music-normal', version: 1 } } : { foes: [{ species: 'Pidgey', level: 3 }] }), battleId: 'bag-' + path.basename(h.w.root), seq: 1, canLose: true, ...(canSwitch === undefined ? {} : { canSwitch }), ...(expGain === undefined ? {} : { expGain }), ...(noRun === undefined ? {} : { noRun }), ...(noBall === undefined ? {} : { noBall }), ...(battleEffects === undefined ? {} : { battleEffects }), battleStyle });
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
    await h.p.press('cancel'); assert.equal(current(h).view.selected, null, 'BACK cancels the newly available move source selection');
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
    await commands(h, reserve); await pick(h, 'switch-in'); await h.p.inMode('wild-faint'); await h.frames(1); await pick(h, 'next'); await h.p.inMode('party-forced');
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
    await commands(h, reserve); await pick(h, 'switch-in'); await h.p.inMode('wild-faint'); await h.frames(1); await pick(h, 'next'); await h.p.inMode('party-forced');
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
  await pick(h, 'fight'); await pick(h, 1); await h.p.inMode('wild-faint'); await h.frames(1); await pick(h, 'next'); await h.p.inMode('party-forced'); assert(s.gw.readState('p1').find(m => m.id === lead).fainted);
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

// Normal user confirmations through the existing queue, stopping as soon as
// the genuine stat panel is shown. Record full rendered text before closing it.
async function normalGrowthBeforeStats(h){
 const observations=[],seen=new Set();
 for(let i=0;i<2400;i++){
  if(h.s.levelStatsState())return observations;
  const step=h.s._ordinaryMessage,view=step?.snapshot();
  if(step&&view.phase==='full'&&!seen.has(step)){seen.add(step);observations.push({implementation:view.implementation,text:h.s._log._lines.join(' ')});}
  assert(!['learn','learn-initial','end'].includes(h.s._mode),'stats must precede learning or a terminal menu');
  if(step)await h.p.press('ok');else await h.frames(1);
 }
 assert.fail('bounded genuine normal growth panel');
}
function assertPausedGrowth(h,observations){
 const growth=h.batches.flatMap(batch=>batch.value).find(m=>m.kind==='growth'&&m.levelUps.includes(51));assert(growth,'actual first KO growth');
 for(const text of [...h.s._D.message({...growth,levelUps:[]}),...h.s._D.message({...growth,exp:0,levelUps:[51]})]){
  const row=observations.find(row=>row.text===text);assert(row,'actual fully rendered growth line '+text);assert.equal(row.implementation,'paused-message-v1','both growth stages must use the accepted paused consumer');
 }
}

test('unified party order, paused notice and private details learn for the non-active member by stable ID',async()=>{
 const h=await open({lang:'zh',members:4,egg:true,grow:true,integration:true,trainer:true,trainerMembers:2,fast:true});try{
  const s=h.s._session,[learner,egg,actor,reserve]=JSON.parse(h.before).party.map(m=>m.id);let installs=0,doc=h.G.$gameSystem._psGame;Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>doc,set:v=>{installs++;doc=v;}});
  await commands(h,actor);await pick(h,'switch-in');await h.p.inMode('main');assert.equal(s.gw.activeId('p1'),actor);h.flow.fast=false;await pick(h,'fight');await pick(h,1);
  const normalGrowth=await normalGrowthBeforeStats(h);assertPausedGrowth(h,normalGrowth);for(let i=0;i<12&&h.s.levelStatsState();i++)await h.p.press('ok');
  await h.waitFor(()=>h.s.ordinaryMessageState()?.implementation==='paused-message-v1','unified full-slot paused notice');const notice=h.s._ordinaryMessage;assert.equal(s.pendingLearn.memberId,learner);assert.equal(h.s._learningInitial??null,null);await h.p.press('ok');assert.equal(notice.snapshot().phase,'full');assert(h.s._log.pause);await h.p.press('ok');await h.p.inMode('learn-initial');assert.equal(notice.snapshot().phase,'done');
  await h.frames(1);await pick(h,'forget-move');await h.p.inMode('learn');const view=h.s.learningMoveState();assert.equal(view.page.rows[0].details,'35/35 PP','details use the non-active learner, not the actor which consumed Tackle');assert(s.gw.readState('p1').find(m=>m.id===actor).pp.tackle<35);await pick(h,3);await h.p.inMode('main');assert.equal(s.gw.activeId('p1'),actor);assert.equal(s.party.find(m=>m.id===learner).moves[3].id,'rest');assert.equal(s.gw.readState('p1').find(m=>m.id===learner).pp.rest,10);
  await summary(h,learner);assert.deepEqual(Array.from(current(h).view.ids),[actor,egg,learner,reserve]);assert.equal(current(h).view.cursor,2);assert(text(h).some(t=>t.includes('Lv.51')));await h.p.press('right');await h.p.press('right');await h.p.press('right');assert(text(h).some(t=>/\brest\b.*10\/10 PP/i.test(t)));await h.p.press('cancel');await h.p.inMode('party');assert.equal(h.s._menu.index(),2);assert.equal(h.s._menu.itemAt(2).ext,learner);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
  await pick(h,learner);await pick(h,'switch-in');await h.p.inMode('main');assert.equal(s.gw.activeId('p1'),learner);h.flow.fast=true;await pick(h,'fight');await pick(h,1);await h.p.inMode('end');await h.frames(1);h.s.onMenuOk();await h.frames(3);assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(installs,1);assert.deepEqual(h.flow.game().party.map(m=>m.id),[learner,egg,actor,reserve]);assert.equal(h.flow.game().party[0].moves[3].id,'rest');h.s.onEnd();assert.equal(installs,1);assert.deepEqual(h.managementCalls(),{beginManagement:0,manage:0});
 }finally{h.cleanup();}
});


for(const lang of ['en','zh'])test(lang+' normal growth integration keeps disabled switching, paused notice, details and Summary in one owner',async()=>{
 const h=await open({lang,members:3,egg:true,grow:true,integration:true,trainer:true,trainerMembers:2,fast:true,canSwitch:false});try{
  const s=h.s._session,lead=s.party[0].id,reserve=s.party[1].id,egg=JSON.parse(h.before).party[1].id;let installs=0,decisions=0,doc=h.G.$gameSystem._psGame;const decide=s.decideLearn.bind(s);s.decideLearn=(...args)=>{decisions++;return decide(...args);};Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>doc,set:v=>{installs++;doc=v;}});
  await commands(h,reserve);assert.deepEqual(Array.from(h.s._menu._items,row=>row.ext),['summary',null]);h.s.onMenuCancel();await h.p.inMode('party');h.s.onMenuCancel();await h.p.inMode('main');h.flow.fast=false;await pick(h,'fight');await pick(h,1);
  const observations=await normalGrowthBeforeStats(h);assertPausedGrowth(h,observations);assert.equal(s.ended,null,'real first KO still has a living opposing reserve');assert.equal(h.s.levelStatsState().phase,'delta');assert.equal(decisions,0);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);await h.p.press('ok');assert.equal(h.s.levelStatsState().phase,'total');await h.p.press('ok');
  await h.waitFor(()=>!!h.s.ordinaryMessageState(),'normal full-slot announcement after numeric panels');const notice=h.s._ordinaryMessage;assert.equal(notice.snapshot().implementation,'paused-message-v1','the accepted notification must not revert to an ordinary line');assert.equal(notice.snapshot().phase,'typing');assert.equal(h.s._learningInitial??null,null);await h.p.press('ok');assert.equal(notice.snapshot().phase,'full');assert.equal(h.s._log.pause,true);await h.frames(120);assert.equal(notice.snapshot().phase,'full');assert.equal(decisions,0);await h.p.press('ok');await h.p.inMode('learn-initial');await h.frames(1);await pick(h,'forget-move');await h.p.inMode('learn');
  const win=h.s._menu,normal=h.s._commandMenu;assert.notEqual(win,normal);assert.equal(h.s.learningMoveState().page.rows[0].details,'34/35 PP');win.select(4);h.s.onMenuOk();await h.p.inMode('learn-giveup');await h.frames(1);await pick(h,'continue-learning');assert.equal(h.s._menu,win);assert.equal(win.index(),4);assert.equal(decisions,0);await pick(h,3);await h.p.inMode('main');assert.equal(h.s._menu,normal);assert.equal(decisions,1);assert.equal(s.party[0].moves[3].id,'rest');assert.equal(s.gw.readState('p1').find(m=>m.id===lead).pp.rest,10);
  await summary(h,lead);assert.deepEqual(Array.from(current(h).view.ids),[lead,egg,reserve]);assert(text(h).some(t=>t.includes('Lv.51')));await h.p.press('right');await h.p.press('right');await h.p.press('right');assert(text(h).some(t=>/\brest\b.*10\/10 PP/i.test(t)));await h.p.press('cancel');await h.p.inMode('party');assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext,lead);await pick(h,reserve);assert.deepEqual(Array.from(h.s._menu._items,row=>row.ext),['summary',null]);h.s.onMenuCancel();await h.p.inMode('party');h.s.onMenuCancel();await h.p.inMode('main');const raw=s.gw.snapshot(),working=JSON.stringify(s.party);assert.deepEqual(await s.chooseSwitch(reserve),{ok:false,reason:'choice-rejected'});assert.equal(s.gw.snapshot(),raw);assert.equal(JSON.stringify(s.party),working);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.deepEqual(h.managementCalls(),{beginManagement:0,manage:0});
  h.flow.fast=true;await pick(h,'fight');await pick(h,1);await h.p.inMode('end');assert.equal(installs,0);await h.frames(1);h.s.onMenuOk();await h.frames(3);assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(installs,1);assert.deepEqual(h.flow.game().party.map(m=>m.id),[lead,egg,reserve]);assert.equal(h.flow.game().party[0].moves[3].id,'rest');h.s.onEnd();assert.equal(installs,1);
 }finally{h.cleanup();}
});


// Accepted normal growth and HM guard meet on a non-active learner; no native timing claim.
for(const lang of ['en','zh'])test(lang+' normal growth and HM guard preserve the non-active learner through details, Summary and one commit',async()=>{
 const h=await open({lang,members:4,egg:true,grow:true,integration:true,trainer:true,trainerMembers:2,fast:true,
  // Explicit author catalog classification; Tackle is not an official Gen8 HM.
  catalog:items=>{const {battleId:unused,...base}=items.potion;items['test-machine']={...base,id:'test-machine',name:'Test machine',namePlural:'Test machines',pocket:4,fieldUse:'hm',battleUse:'none',move:'tackle',legacyIds:[],consumable:false,flags:[]};}});try{
  const s=h.s._session,[learner,egg,actor,reserve]=JSON.parse(h.before).party.map(m=>m.id);let installs=0,decisions=0,doc=h.G.$gameSystem._psGame;const decide=s.decideLearn.bind(s),completed=[],add=h.s._log.add.bind(h.s._log);s.decideLearn=(...args)=>{decisions++;return decide(...args);};h.s._log.add=line=>{completed.push(line);return add(line);};Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>doc,set:v=>{installs++;doc=v;}});
  await commands(h,actor);await pick(h,'switch-in');await h.p.inMode('main');assert.equal(s.gw.activeId('p1'),actor);h.flow.fast=false;await pick(h,'fight');await pick(h,1);
  const observations=await normalGrowthBeforeStats(h);assertPausedGrowth(h,observations);assert.equal(s.ended,null,'a living enemy reserve makes this a genuine nonterminal KO');assert.equal(decisions,0);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);await h.p.press('ok');assert.equal(h.s.levelStatsState().phase,'total');await h.p.press('ok');
  await h.waitFor(()=>!!h.s.ordinaryMessageState(),'normal full-slot announcement');const notice=h.s._ordinaryMessage;assert.equal(notice.snapshot().implementation,'paused-message-v1');assert.equal(h.s._learningInitial??null,null);assert.equal(s.pendingLearn.memberId,learner);await h.p.press('ok');assert.equal(notice.snapshot().phase,'full');assert.equal(decisions,0);await h.p.press('ok');await h.p.inMode('learn-initial');await h.frames(1);await pick(h,'forget-move');await h.p.inMode('learn');
  const win=h.s._menu,pending=s.pendingLearn,checkpoint=JSON.stringify(s._checkpoint());assert.equal(h.s.learningMoveState().page.rows[0].details,'35/35 PP','the non-active learner has not spent the active actor PP');assert(s.gw.readState('p1').find(m=>m.id===actor).pp.tackle<35);assert.deepEqual(E.battlePresentation.readBattleLearnProtection(s,0),{version:1,memberId:learner,slot:0,moveId:'tackle',reason:'hm-protected'});
  const warning=lang==='zh'?'学习时不能替换秘传招式，请重新选择。':'HM moves cannot be replaced while learning. Choose another move.';
  for(let i=0;i<2;i++){const firstLine=completed.length;win.select(0);h.s.onMenuOk();await h.frames(1);await h.p.inMode('learn');assert(completed.slice(firstLine).join('').replace(/\s+/g,' ').includes(warning),'the actual full HM refusal is painted in this attempt, including wrapped lines');assert.equal(decisions,0);assert.equal(h.s._menu,win);assert.equal(win.index(),0);assert.equal(s.pendingLearn,pending);assert.equal(JSON.stringify(s._checkpoint()),checkpoint);assert.equal(s.gw.activeId('p1'),actor);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);}
  h.s.onMenuCancel();await h.p.inMode('learn-giveup');await h.frames(1);await pick(h,'continue-learning');assert.equal(h.s._menu,win);assert.equal(win.index(),0);assert.equal(decisions,0);await pick(h,1);await h.p.inMode('main');assert.equal(decisions,1);assert.equal(s.gw.activeId('p1'),actor);const learned=s.party.find(m=>m.id===learner);assert.equal(learned.moves[0].id,'tackle');assert.equal(learned.moves[0].pp,35);assert.equal(learned.moves[1].id,'rest');assert.equal(s.gw.readState('p1').find(m=>m.id===learner).pp.rest,10);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
  await summary(h,learner);assert.deepEqual(Array.from(current(h).view.ids),[actor,egg,learner,reserve]);assert.equal(current(h).view.cursor,2);assert(text(h).some(line=>line.includes('Lv.51')));await h.p.press('right');await h.p.press('right');await h.p.press('right');assert(text(h).some(line=>/\brest\b.*10\/10 PP/i.test(line)));assert(text(h).some(line=>/\btackle\b.*35\/35 PP/i.test(line)));await h.p.press('cancel');await h.p.inMode('party');assert.equal(h.s._menu.index(),2);assert.equal(h.s._menu.itemAt(2).ext,learner);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.deepEqual(h.managementCalls(),{beginManagement:0,manage:0});
  await pick(h,learner);await pick(h,'switch-in');await h.p.inMode('main');assert.equal(s.gw.activeId('p1'),learner);h.flow.fast=true;await pick(h,'fight');await pick(h,1);await h.p.inMode('end');assert.equal(installs,0);await h.frames(1);h.s.onMenuOk();await h.frames(3);assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(installs,1);assert.deepEqual(h.flow.game().party.map(m=>m.id),[learner,egg,actor,reserve]);assert.equal(h.flow.game().party[0].moves[0].id,'tackle');assert.equal(h.flow.game().party[0].moves[1].id,'rest');assert.equal(h.flow.game().party[0].moves[1].pp,10);h.s.onEnd();assert.equal(installs,1);
 }finally{h.cleanup();}
});


// Accepted growth/HM and automatic Struggle meet in one actual normal command flow.
for (const lang of ['en', 'zh']) test(lang + ' normal HM give-up after the last PP continues through one automatic Struggle and one commit', async () => {
  const moves = [{id:'tackle',pp:1,maxpp:35},{id:'growl',pp:0,maxpp:40},{id:'splash',pp:0,maxpp:40},{id:'protect',pp:0,maxpp:10}];
  const h = await open({lang,members:2,grow:true,integration:true,trainer:true,trainerMembers:2,fast:true,leadMoves:moves,
    // Explicit author classification; Tackle is not an official HM.
    catalog:items=>{const {battleId:unused,...base}=items.potion;items['test-machine']={...base,id:'test-machine',name:'Test machine',namePlural:'Test machines',pocket:4,fieldUse:'hm',battleUse:'none',move:'tackle',legacyIds:[],consumable:false,flags:[]};}});
  try {
    const s=h.s._session, lead=s.party[0].id, order=JSON.parse(h.before).party.map(m=>m.id), attempts=[], decisions=[];
    const choose=s.chooseMove.bind(s),decide=s.decideLearn.bind(s);let doc=h.G.$gameSystem._psGame,installs=0;
    s.chooseMove=async slot=>{const row={slot};attempts.push(row);row.result=await choose(slot);return row.result;};
    s.decideLearn=(...args)=>{decisions.push(args[0]);return decide(...args);};
    Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>doc,set:v=>{installs++;doc=v;}});
    h.flow.fast=false;await pick(h,'fight');await pick(h,1);
    const observations=await normalGrowthBeforeStats(h);assertPausedGrowth(h,observations);
    assert.equal(s.ended,null);assert.equal(s.party[0].level,51);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
    await h.p.press('ok');assert.equal(h.s.levelStatsState().phase,'total');await h.p.press('ok');
    await h.waitFor(()=>!!h.s.ordinaryMessageState(),'normal full-slot notice before HM selection');
    const learnNotice=h.s._ordinaryMessage;assert.equal(learnNotice.snapshot().implementation,'paused-message-v1');
    await h.p.press('ok');assert.equal(learnNotice.snapshot().phase,'full');assert.equal(decisions.length,0);
    await h.p.press('ok');await h.p.inMode('learn-initial');await h.frames(1);await pick(h,'forget-move');await h.p.inMode('learn');
    assert.equal(h.s.learningMoveState().page.rows[0].details,'0/35 PP','real first KO used the last Tackle PP');
    const pending=s.pendingLearn,checkpoint=JSON.stringify(s._checkpoint()),from=h.completed.length;
    await pick(h,0);await h.p.inMode('learn');
    const warning=lang==='zh'?'学习时不能替换秘传招式，请重新选择。':'HM moves cannot be replaced while learning. Choose another move.';
    assert(h.completed.slice(from).join('').replace(/\s+/g,' ').includes(warning));
    assert.equal(s.pendingLearn,pending);assert.equal(JSON.stringify(s._checkpoint()),checkpoint);assert.equal(decisions.length,0);assert.equal(installs,0);
    h.s.onMenuCancel();await h.p.inMode('learn-giveup');await h.frames(1);await pick(h,'give-up');await h.p.inMode('main');
    assert.deepEqual(decisions,[null]);assert.equal(s.pendingLearn,null);assert.deepEqual(s.party[0].moves.map(m=>[m.id,m.pp]),moves.map(m=>[m.id,0]));
    assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(installs,0);assert.equal(attempts.length,1);
    assert.deepEqual(s.currentRequest().active[0].moves.map(m=>[m.id,m.pp]),[['struggle',undefined]],'actual pinned Gen8 fallback after learning was declined');
    await pick(h,'fight');assert.notEqual(h.s._mode,'moves');await h.waitFor(()=>!!h.s.ordinaryMessageState(),'normal no-moves pause after HM give-up');
    const notice=h.s._ordinaryMessage;assert.equal(notice.snapshot().implementation,'paused-message-v1');
    assert.equal(attempts.length,1);h.s.onMenuOk();h.s.onMenuCancel();assert.equal(attempts.length,1);
    await h.p.press('ok');assert.equal(notice.snapshot().phase,'full');assert.equal(attempts.length,1);
    await h.frames(30);assert.equal(notice.snapshot().phase,'full');assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(installs,0);
    assert.equal(h.s._log._lines.join(' '),h.flow.translator().t('ui.moves.none-left',{name:h.s._names[lead]}));
    await h.p.press('ok');await h.waitFor(()=>attempts.length===2&&!h.s._busy,'one actual automatic Struggle after the notice');
    assert.deepEqual(attempts.map(a=>a.slot),[1,1]);assert(attempts.every(a=>a.result.ok));assert.equal(notice.snapshot().phase,'done');
    assert(s.gw.readState('p2').every(m=>m.fainted),'actual engine Struggle resolves the remaining low-level foe');
    assert.deepEqual(s.party[0].moves.map(m=>m.pp),[0,0,0,0]);assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(installs,0);
    h.flow.fast=true;await h.p.inMode('end');await h.frames(1);h.s.onMenuOk();await h.frames(3);
    assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(installs,1);assert.deepEqual(h.flow.game().party.map(m=>m.id),order);
    assert.equal(h.flow.game().party[0].level,51);assert.deepEqual(h.flow.game().party[0].moves.map(m=>[m.id,m.pp]),moves.map(m=>[m.id,0]));
    h.s.onEnd();assert.equal(installs,1);assert.equal(attempts.length,2);assert.deepEqual(h.managementCalls(),{beginManagement:0,manage:0});
  } finally { h.cleanup(); }
});


// A newly learned move must remain spent in the actual Summary and final App install.
for(const lang of ['en','zh'])test(lang+' learned Rest use reaches working data, Summary and the single final save at PP9',async()=>{
 const h=await open({lang,members:2,grow:true,integration:true,trainer:true,trainerMembers:2,fast:true,
  leadMoves:[{id:'tackle',pp:1,maxpp:35},{id:'growl',pp:40,maxpp:40},{id:'splash',pp:40,maxpp:40},{id:'protect',pp:10,maxpp:10}],
  catalog:items=>{const {battleId:unused,...base}=items.potion;items['test-machine']={...base,id:'test-machine',name:'Test machine',namePlural:'Test machines',pocket:4,fieldUse:'hm',battleUse:'none',move:'tackle',legacyIds:[],consumable:false,flags:[]};}});try{
  const s=h.s._session,[lead,reserve]=s.party.map(m=>m.id),order=JSON.parse(h.before).party.map(m=>m.id),decide=s.decideLearn.bind(s),calls=[];let installs=0,doc=h.G.$gameSystem._psGame;
  s.decideLearn=(...a)=>{calls.push(a[0]);return decide(...a);};Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>doc,set:v=>{installs++;doc=v;}});
  h.flow.fast=false;await pick(h,'fight');await pick(h,1);const observations=await normalGrowthBeforeStats(h);assertPausedGrowth(h,observations);assert.equal(s.ended,null);
  await h.p.press('ok');assert.equal(h.s.levelStatsState().phase,'total');await h.p.press('ok');
  await h.waitFor(()=>!!h.s.ordinaryMessageState(),'full-slot notice');await h.p.press('ok');await h.p.press('ok');await h.p.inMode('learn-initial');await h.frames(1);await pick(h,'forget-move');await h.p.inMode('learn');
  const pending=s.pendingLearn,checkpoint=JSON.stringify(s._checkpoint()),start=h.completed.length;await pick(h,0);await h.p.inMode('learn');
  const warning=lang==='zh'?'学习时不能替换秘传招式，请重新选择。':'HM moves cannot be replaced while learning. Choose another move.';
  assert(h.completed.slice(start).join('').replace(/\s+/g,' ').includes(warning));assert.equal(s.pendingLearn,pending);assert.equal(JSON.stringify(s._checkpoint()),checkpoint);assert.deepEqual(calls,[]);
  await pick(h,1);await h.p.inMode('main');assert.deepEqual(calls,[1]);assert.equal(s.currentRequest().active[0].moves[1].id,'rest');assert.equal(s.currentRequest().active[0].moves[1].pp,10);
  await pick(h,'fight');assert.equal(h.s._mode,'moves');h.s.onMenuCancel();await h.p.inMode('main');assert.equal(s.party[0].moves[1].pp,10);assert.equal(installs,0);
  await pick(h,'fight');const first=h.batches.length;await pick(h,2);await h.p.inMode('main');
  assert(h.batches.slice(first).flatMap(b=>b.value).flatMap(m=>m.events??[]).some(e=>e.type==='move'&&e.args[1]==='Rest'),'actual learned Rest executed');
  assert.equal(s.gw.readState('p1').find(m=>m.id===lead).status,'slp');assert.equal(s.currentRequest().active[0].moves[1].pp,9);
  assert.equal(s.gw.readState('p1').find(m=>m.id===lead).pp.rest,9,'Gateway must not publish stale permanent PP10');
  assert.equal(s.party.find(m=>m.id===lead).moves[1].pp,9,'Session working PP after actual Rest');assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(installs,0);
  await summary(h,lead);await h.p.press('right');await h.p.press('right');await h.p.press('right');assert(text(h).some(line=>/\brest\b.*9\/10 PP/i.test(line)),'actual shared Summary uses consumed PP9');
  await h.p.press('cancel');await h.p.inMode('party');await pick(h,reserve);await pick(h,'switch-in');await h.p.inMode('main');assert.equal(s.gw.activeId('p1'),reserve);assert.equal(s.party.find(m=>m.id===lead).moves[1].pp,9);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
  h.flow.fast=true;await pick(h,'fight');await pick(h,1);await h.p.inMode('end');assert.equal(installs,0);await h.frames(1);h.s.onMenuOk();await h.frames(3);
  assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(installs,1);assert.deepEqual(h.flow.game().party.map(m=>m.id),order);assert.equal(h.flow.game().party.find(m=>m.id===lead).moves[1].id,'rest');assert.equal(h.flow.game().party.find(m=>m.id===lead).moves[1].pp,9,'actual App install must not restore spent learned PP');
  h.s.onEnd();assert.equal(installs,1);assert.deepEqual(h.managementCalls(),{beginManagement:0,manage:0});
 }finally{h.cleanup();}
});

// Integration: learning restores a usable move before Encore owns a later move entry.
for(const lang of ['en','zh'])test(lang+' learned permanent Growl participates in real automatic Encore and saves consumed PP once',async()=>{
 const content=fixture.musicNativeContent(E,assert);assert(content.moves.Growl);content.species.Snorlax.learnset[51]=['Growl'];
 content.trainers['music-normal'][0].party[0].moves=['encore']; // Explicit author custom-game fixture, not an official learnset claim.
 const h=await open({lang,suppliedContent:content,members:2,grow:true,trainer:true,trainerMembers:2,fast:true,
  leadMoves:[{id:'tackle',pp:1,maxpp:35},{id:'splash',pp:0,maxpp:40},{id:'protect',pp:0,maxpp:10},{id:'rest',pp:0,maxpp:10}],
  catalog:items=>{const {battleId:unused,...base}=items.potion;items['test-machine']={...base,id:'test-machine',name:'Test machine',namePlural:'Test machines',pocket:4,fieldUse:'hm',battleUse:'none',move:'tackle',legacyIds:[],consumable:false,flags:[]};}});try{
  const s=h.s._session,[lead,reserve]=s.party.map(m=>m.id),order=JSON.parse(h.before).party.map(m=>m.id),calls=[],choose=s.chooseMove.bind(s);let installs=0,doc=h.G.$gameSystem._psGame;
  s.chooseMove=(slot)=>{calls.push(slot);return choose(slot);};Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>doc,set:v=>{installs++;doc=v;}});
  h.flow.fast=false;await pick(h,'fight');await pick(h,1);const observed=await normalGrowthBeforeStats(h);assertPausedGrowth(h,observed);await h.p.press('ok');await h.p.press('ok');
  await h.waitFor(()=>!!h.s.ordinaryMessageState(),'full-slot learning notice');await h.p.press('ok');await h.p.press('ok');await h.p.inMode('learn-initial');await h.frames(1);await pick(h,'forget-move');await h.p.inMode('learn');
  const pending=s.pendingLearn,checkpoint=JSON.stringify(s._checkpoint());await pick(h,0);await h.p.inMode('learn');assert.equal(s.pendingLearn,pending);assert.equal(JSON.stringify(s._checkpoint()),checkpoint);
  await pick(h,1);await h.p.inMode('main');assert.equal(s.party[0].moves[1].id,'growl');assert.equal(s.party[0].moves[1].pp,40);assert.deepEqual(calls,[1]);assert.equal(s.gw.query('p1','automatic-encore').allowed,false);
  await pick(h,'fight');assert.equal(h.s._mode,'moves','a newly learned legal move prevents Struggle but still requires the first manual choice');await pick(h,2);await h.p.inMode('main');
  assert.equal(s.gw.readState('p1').find(m=>m.id===lead).pp.growl,39);assert.equal(s.party[0].moves[1].pp,39);const before=s.gw.snapshot();for(let i=0;i<3;i++)assert.deepEqual(s.gw.query('p1','automatic-encore'),{allowed:true,moveSlot:2});assert.equal(s.gw.snapshot(),before);
  const modes=[],show=h.s.show;h.s.show=function(mode,...args){modes.push(mode);return show.call(this,mode,...args);};await pick(h,'fight');h.s.onMenuOk();h.s.onMenuCancel();await h.p.inMode('main');
  assert.deepEqual(calls,[1,2,2]);assert(!modes.includes('moves'));assert.equal(s.currentRequest().active[0].moves[1].pp,38);assert.equal(s.gw.readState('p1').find(m=>m.id===lead).pp.growl,38);assert.equal(s.party[0].moves[1].pp,38);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
  await h.frames(240);assert.deepEqual(calls,[1,2,2]);await commands(h,reserve);await pick(h,'switch-in');await h.p.inMode('main');assert.equal(s.gw.activeId('p1'),reserve);
  h.flow.fast=true;await pick(h,'fight');await pick(h,1);await h.p.inMode('end');assert.equal(installs,0);await h.frames(1);h.s.onMenuOk();await h.frames(3);
  assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(installs,1);assert.deepEqual(h.flow.game().party.map(m=>m.id),order);assert.equal(h.flow.game().party.find(m=>m.id===lead).moves[1].id,'growl');assert.equal(h.flow.game().party.find(m=>m.id===lead).moves[1].pp,38);h.s.onEnd();assert.equal(installs,1);
 }finally{h.cleanup();}
});

// Switch replacement consumer. Legacy growth/PP scenarios above explicitly request Set, preserving their original assertions.
test('SWC01 en default player Switch publishes an actual replacement question before the recorded foe is sent',async()=>{
 const h=await open({trainer:true,trainerMembers:2,battleStyle:'',fast:true});try{
  const s=h.s._session,foe=s.gw.activeId('p2');await pick(h,'fight');await pick(h,1);await h.waitFor(()=>['main','replacement-question'].includes(h.s._mode)&&h.s.inputState().ready,'first real KO question or legacy main');assert(s.gw.readState('p2').find(m=>m.id===foe).fainted,'this is a completed real KO');const v=E.session.readTrainerReplacement(s);assert(v,'default Switch must publish the formal replacement question after a real KO');assert.equal(h.s._mode,'replacement-question');assert.equal(s.gw.activeId('p2'),foe);assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{h.cleanup();}
});

const SWD=require('../../../js/engine/build/testing.cjs').trainerAiDiagnostics;
for (const lang of ['en', 'zh']) for (const style of ['switch', 'set']) test('RUI01 ' + lang + ' no-growth/prohibitions after forced replacement with ' + style, async () => {
  const h = await open({ lang, command: 'StartTrainerBattle', trainerMembers: 2, members: 3, battleStyle: style,
    expGain: 'false', noRun: 'true', noBall: 'true', battleEffects: 'off', fast: true, bag: { masterball: 2 },
    leadHP: 1, leadMoves: [{ id: 'splash', pp: 1, maxpp: 40 }] });
  try {
    const s = h.s._session, installs = observeInstalls(h), savedBefore = JSON.parse(h.before);
    const [lead, reserve] = s.party.map(m => m.id), foe = s.gw.activeId('p2');
    const growth = m => [m.id, m.level, m.exp, m.evs];
    const expectedGrowth = savedBefore.party.map(growth).sort();
    assert.equal(s.expGain, false);
    assert.equal(h.flow._op.battleStyle, style); assert.equal(h.flow._op.battleEffects, false);
    h.G.ConfigManager.psBattleStyle = style === 'switch' ? 'set' : 'switch'; h.G.ConfigManager.psBattleEffects = true;
    h.flow._op.request.battleStyle = h.G.ConfigManager.psBattleStyle; h.flow._op.request.battleEffects = true;
    assert.equal(h.s.pictureState().effects, false);
    assert.deepEqual(s.gw.query('p1', 'ball'), { allowed: false, reason: 'ballsdisabled' });
    assert.deepEqual(s.gw.query('p1', 'run'), { allowed: false, reason: 'trainer' });
    const beforeRefusal = s.gw.snapshot(); await pick(h, 'run'); await h.p.inMode('main');
    assert.equal(s.gw.snapshot(), beforeRefusal); assert.equal(s.bag.masterball, 2);
    await pick(h, 'fight'); await pick(h, 1); await h.p.inMode('party-forced');
    assert(s.gw.readState('p1').find(m => m.id === lead).fainted);
    await pick(h, reserve); await pick(h, 'switch-in'); await h.p.inMode('main');
    await pick(h, 'fight'); await pick(h, 1);
    await h.waitFor(() => ['main', 'replacement-question'].includes(h.s._mode) && h.s.inputState().ready, 'combined KO boundary');
    assert(s.gw.readState('p2').find(m => m.id === foe).fainted);
    assert.deepEqual(s.party.map(growth).sort(), expectedGrowth, 'KO with growth off must not change EXP/EV/level');
    if (style === 'switch') {
      assert.equal(h.s._mode, 'replacement-question'); assert(E.session.readTrainerReplacement(s));
      assert.equal(s.gw.activeId('p2'), foe);
      const pp = s.gw.readState('p1').map(m => [m.id, m.pp]).sort();
      const random = structuredClone(SWD.trainerAiDiagnostics(s).state.random), journal = SWD.trainerAiJournal(s).entries.length;
      await h.frames(1); await pick(h, 'replace-no'); await h.p.inMode('main');
      assert.deepEqual(s.gw.readState('p1').map(m => [m.id, m.pp]).sort(), pp);
      assert.deepEqual(SWD.trainerAiDiagnostics(s).state.random, random); assert.equal(SWD.trainerAiJournal(s).entries.length, journal);
    } else { assert.equal(h.s._mode, 'main'); assert.equal(E.session.readTrainerReplacement(s), null); }
    assert.notEqual(s.gw.activeId('p2'), foe); assert.equal(s.gw.activeId('p1'), reserve);
    assert.equal(JSON.stringify(h.flow.game()), h.before); assert.equal(installs(), 0);
    await finishSwitchBattle(h, installs);
    const saved = h.flow.game(); assert.deepEqual(saved.party.map(growth).sort(), expectedGrowth);
    assert.deepEqual(saved.party.map(m => m.id), savedBefore.party.map(m => m.id));
    assert.equal(saved.party.find(m => m.id === lead).hp, 0);
    assert.equal(saved.party.find(m => m.id === lead).moves[0].pp, 0);
    assert.equal(saved.party.find(m => m.id === reserve).moves[0].pp, 33);
    assert.deepEqual(saved.inventory, savedBefore.inventory); assert.equal(s.bag.masterball, 2);
    assert(!h.batches.flatMap(row => row.value).some(m => ['growth', 'learn-prompt', 'learned'].includes(m.kind)));
  } finally { h.cleanup(); }
});
for (const faintFirst of [false, true]) test('SWF01 default Switch with prior forced replacement=' + faintFirst, async () => {
  const h = await open({ trainer: true, trainerMembers: 2, members: 3, battleStyle: '', fast: true,
    ...(faintFirst ? { leadHP: 1, leadMoves: [{ id: 'splash', pp: 1, maxpp: 40 }] } : {}) });
  try {
    const s = h.s._session, foe = s.gw.activeId('p2'), installs = observeInstalls(h);
    if (faintFirst) {
      const lead = s.gw.activeId('p1'), reserve = s.party[1].id;
      await pick(h, 'fight'); await pick(h, 1); await h.p.inMode('party-forced');
      assert(s.gw.readState('p1').find(m => m.id === lead).fainted);
      await pick(h, reserve); await pick(h, 'switch-in'); await h.p.inMode('main');
      assert.equal(s.gw.activeId('p1'), reserve);
    }
    const offer = await switchOffer(h);
    assert(s.gw.readState('p2').find(m => m.id === foe).fainted);
    assert(s.gw.readState('p1').some(m => !m.active && !m.fainted && m.hp > 0));
    assert.equal(s.gw.activeId('p2'), foe, 'foe replacement must wait for the decision');
    assert.equal(offer.playerId, s.gw.activeId('p1'));
    assert.equal(JSON.stringify(h.flow.game()), h.before); assert.equal(installs(), 0);
  } finally { h.cleanup(); }
});
for (const route of ['no', 'list-cancel', 'set']) test('SWF03 after forced replacement, ' + route + ' continues and commits once', async () => {
  const h = await open({ trainer: true, trainerMembers: 2, members: 3, battleStyle: route === 'set' ? 'set' : '',
    fast: true, leadHP: 1, leadMoves: [{ id: 'splash', pp: 1, maxpp: 40 }] });
  try {
    const s = h.s._session, lead = s.gw.activeId('p1'), reserve = s.party[1].id, foe = s.gw.activeId('p2'), installs = observeInstalls(h);
    const order = JSON.parse(h.before).party.map(m => m.id);
    await pick(h, 'fight'); await pick(h, 1); await h.p.inMode('party-forced');
    await pick(h, reserve); await pick(h, 'switch-in'); await h.p.inMode('main');
    if (route === 'set') {
      await pick(h, 'fight'); await pick(h, 1); await h.p.inMode('main');
      assert.equal(E.session.readTrainerReplacement(s), null);
    } else {
      await switchOffer(h);
      const pp = s.gw.readState('p1').map(m => [m.id, m.pp]).sort();
      const random = structuredClone(SWD.trainerAiDiagnostics(s).state.random), journal = SWD.trainerAiJournal(s).entries.length;
      await h.frames(1);
      if (route === 'no') await pick(h, 'replace-no');
      else { await pick(h, 'replace-yes'); await h.p.inMode('party'); await h.frames(1); h.s.onMenuCancel(); await h.frames(1); }
      await h.p.inMode('main');
      assert.equal(E.session.readTrainerReplacement(s), null);
      assert.deepEqual(s.gw.readState('p1').map(m => [m.id, m.pp]).sort(), pp);
      assert.deepEqual(SWD.trainerAiDiagnostics(s).state.random, random);
      assert.equal(SWD.trainerAiJournal(s).entries.length, journal);
    }
    assert(s.gw.readState('p2').find(m => m.id === foe).fainted);
    assert.notEqual(s.gw.activeId('p2'), foe); assert.equal(s.gw.activeId('p1'), reserve);
    assert.equal(s.gw.readState('p1').find(m => m.id === reserve).pp.tackle, 34);
    await finishSwitchBattle(h, installs);
    const saved = h.flow.game(); assert.deepEqual(saved.party.map(m => m.id), order);
    assert.equal(saved.party.find(m => m.id === lead).hp, 0);
    assert.equal(saved.party.find(m => m.id === lead).moves[0].pp, 0);
    assert.equal(saved.party.find(m => m.id === reserve).moves[0].pp, 33);
  } finally { h.cleanup(); }
});
async function switchOffer(h,slot=1){await pick(h,'fight');await pick(h,slot);await h.waitFor(()=>['main','replacement-question'].includes(h.s._mode)&&h.s.inputState().ready,'replacement boundary');assert.equal(h.s._mode,'replacement-question');const v=E.session.readTrainerReplacement(h.s._session);assert(v);return v;}
function observeInstalls(h){let count=0,document=h.G.$gameSystem._psGame;Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>document,set:v=>{count++;document=v;}});return()=>count;}
async function finishSwitchBattle(h,installs){await pick(h,'fight');await pick(h,1);await h.p.inMode('end');assert.equal(installs(),0);assert.equal(JSON.stringify(h.flow.game()),h.before);await h.frames(1);h.s.onMenuOk();await h.frames(3);assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(installs(),1);h.s.onEnd();assert.equal(installs(),1);}
for(const lang of ['en','zh'])for(const route of ['no','back','list-cancel'])test('SWC02 '+lang+' '+route+' continues the same prepared foe without a player action and saves once',async()=>{
 const h=await open({lang,trainer:true,trainerMembers:2,battleStyle:'',fast:true});try{const installs=observeInstalls(h),s=h.s._session,lead=s.gw.activeId('p1'),foe=s.gw.activeId('p2'),v=await switchOffer(h),pp=s.gw.readState('p1').map(m=>[m.id,m.pp.tackle]),random=structuredClone(SWD.trainerAiDiagnostics(s).state.random),journal=SWD.trainerAiJournal(s).entries.length;
  const text=h.flow.translator().t('ui.replacement.question',{trainer:'Native Music',species:h.flow.speciesName(v.opponentSpecies)}).replace(/\s/g,'');assert(h.s._log._lines.join('').replace(/\s/g,'').includes(text),'actual bilingual question is visible');await h.frames(1);
  if(route==='no')await pick(h,'replace-no');else if(route==='back'){h.s.onMenuCancel();await h.frames(1);}else{await pick(h,'replace-yes');await h.p.inMode('party');await h.frames(1);h.s.onMenuCancel();await h.frames(1);}await h.p.inMode('main');assert.equal(E.session.readTrainerReplacement(s),null);assert.equal(s.gw.activeId('p1'),lead);assert.notEqual(s.gw.activeId('p2'),foe);assert.deepEqual(s.gw.readState('p1').map(m=>[m.id,m.pp.tackle]),pp);assert.deepEqual(SWD.trainerAiDiagnostics(s).state.random,random);assert.equal(SWD.trainerAiJournal(s).entries.length,journal);assert.equal(installs(),0);await finishSwitchBattle(h,installs);
 }finally{h.cleanup();}
});
for(const lang of ['en','zh'])test('SWC03 '+lang+' Yes uses the shared Summary and returns to replacement selection before native paired switching',async()=>{
 const h=await open({lang,trainer:true,trainerMembers:2,battleStyle:'',fast:true});try{const installs=observeInstalls(h),s=h.s._session,reserve=s.party[1].id;await switchOffer(h);const random=structuredClone(SWD.trainerAiDiagnostics(s).state.random),pp=s.gw.readState('p1').map(m=>[m.id,m.pp.tackle]);await h.frames(1);await pick(h,'replace-yes');await h.p.inMode('party');await pick(h,reserve);await h.p.inMode('party-command');await pick(h,'summary');await h.waitFor(()=>h.G.PSManagement.current()?.view.kind==='summary'&&h.G.PSManagement.current().ready,'real replacement Summary');assert.equal(installs(),0);assert.equal(JSON.stringify(h.flow.game()),h.before);await h.p.press('cancel');await h.p.inMode('party');assert.equal(h.s._partySub,'replacement');assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext,reserve);
  await pick(h,reserve);await pick(h,'switch-in');h.s.onMenuOk();h.s.onMenuCancel();await h.p.inMode('main');assert.equal(s.gw.activeId('p1'),reserve);assert.equal(E.session.readTrainerReplacement(s),null);assert.deepEqual(s.gw.readState('p1').map(m=>[m.id,m.pp.tackle]).sort(),pp.slice().sort());assert.deepEqual(SWD.trainerAiDiagnostics(s).state.random,random);await finishSwitchBattle(h,installs);assert.equal(h.flow.game().party.find(m=>m.id===reserve).moves[0].pp,34);
 }finally{h.cleanup();}
});
for(const [playerStyle,battleStyle,prompt]of [['set','',false],['switch','set',false],['set','switch',true]])test('SWC04 player '+playerStyle+' author '+String(battleStyle)+' obeys explicit rule priority',async()=>{
 const h=await open({trainer:true,trainerMembers:2,playerStyle,battleStyle,command:'StartTrainerBattle',fast:true});try{const s=h.s._session;await pick(h,'fight');await pick(h,1);await h.waitFor(()=>['main','replacement-question'].includes(h.s._mode)&&h.s.inputState().ready,'effective style');assert.equal(h.s._mode,prompt?'replacement-question':'main');assert.equal(!!E.session.readTrainerReplacement(s),prompt);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('SWC04 captured style survives later changes to the player setting and original request',async()=>{
 const h=await open({trainer:true,trainerMembers:2,battleStyle:'',fast:true});try{h.G.ConfigManager.psBattleStyle='set';h.flow.request.battleStyle='set';assert(await switchOffer(h));assert.equal(h.flow._op.battleStyle,'switch');assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('SWC05 real Ingrain still offers Yes; rejected selection stays cancelable and does not change combat state',async()=>{
 const h=await open({trainer:true,trainerMembers:2,battleStyle:'',fast:true,leadMoves:[{id:'ingrain',pp:20,maxpp:20},{id:'tackle',pp:35,maxpp:35}]});try{const s=h.s._session;await pick(h,'fight');await pick(h,1);await h.p.inMode('main');const v=await switchOffer(h,2),snap=s.gw.snapshot(),reserve=s.party[1].id;await h.frames(1);await pick(h,'replace-yes');await pick(h,reserve);await pick(h,'switch-in');await h.p.inMode('party');assert.equal(s.gw.snapshot(),snap);assert.equal(E.session.readTrainerReplacement(s).offerId,v.offerId);assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext,reserve);await h.frames(1);h.s.onMenuCancel();await h.frames(1);await h.p.inMode('main');assert.equal(E.session.readTrainerReplacement(s),null);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('SWC06 canSwitch false preserves the offer and Summary but has no Switch In and list cancel means No',async()=>{
 const h=await open({trainer:true,trainerMembers:2,battleStyle:'',canSwitch:false,fast:true});try{const s=h.s._session;await switchOffer(h);await h.frames(1);await pick(h,'replace-yes');await pick(h,s.party[1].id);assert(!h.s._menu._items.some(r=>r.ext==='switch-in'));assert(h.s._menu._items.some(r=>r.ext==='summary'));h.s.onMenuCancel();await h.frames(1);await h.p.inMode('party');assert(E.session.readTrainerReplacement(s));await h.frames(1);h.s.onMenuCancel();await h.frames(1);await h.p.inMode('main');assert.equal(E.session.readTrainerReplacement(s),null);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('SWC07 abort retires the offer and late old question or member callbacks cannot act or save',async()=>{
 const h=await open({trainer:true,trainerMembers:2,battleStyle:'',fast:true});try{const s=h.s._session;await switchOffer(h);await h.frames(1);await pick(h,'replace-yes');const before=s.gw.snapshot();h.flow.abort(Error('owned Switch Scene abort'));h.s.answerTrainerReplacement(false);h.s.resolveTrainerReplacement(s.party[1].id);h.s.onMenuOk();h.s.onMenuCancel();await h.frames(3);assert.equal(E.session.readTrainerReplacement(s),null);assert.equal(s.gw.snapshot(),before);assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('SWC08 the first question update and the first member-list update cannot consume the same input again',async()=>{
 const h=await open({trainer:true,trainerMembers:2,battleStyle:'',fast:true});try{const s=h.s._session,v=await switchOffer(h),snap=s.gw.snapshot();assert.equal(h.s._pictureUpdate,h.s._replacementShownUpdate);h.s.onMenuOk();h.s.onMenuCancel();assert.equal(h.s._mode,'replacement-question');assert.equal(s.gw.snapshot(),snap);await h.frames(1);h.s.onMenuOk();assert.equal(h.s._mode,'party');h.s.onMenuCancel();assert.equal(h.s._mode,'party');assert.equal(E.session.readTrainerReplacement(s).offerId,v.offerId);await h.frames(1);h.s.onMenuCancel();await h.frames(1);await h.p.inMode('main');assert.equal(E.session.readTrainerReplacement(s),null);}finally{h.cleanup();}
});
test('SWC09 both event entry styles validate before sequence/open and declare inheritance by default',async()=>{
 const h=await open();try{h.cleanup();const seq=h.G.$gameSystem._psBattleSeq,before=JSON.stringify(h.flow.game());for(const name of ['StartBattle','StartTrainerBattle'])for(const battleStyle of [null,true,0,'bogus'])assert.throws(()=>h.w.commands['PS_BattleFlow:'+name].call({setWaitMode(){}},{battleStyle}),/battleStyle must be/);assert.equal(h.G.$gameSystem._psBattleSeq,seq);assert.equal(h.flow.running,false);assert.equal(JSON.stringify(h.flow.game()),before);const meta=fs.readFileSync(path.join(ROOT,'src/plugins/PS_BattleFlow.meta.txt'),'utf8');assert.equal((meta.match(/@arg battleStyle[\s\S]*?@default inherit/g)||[]).length,2);}finally{h.cleanup();}
});

// Regression: a real forced player replacement can leave the foe action queued.
// A subsequent KO must still reach the existing Switch offer before foe dispatch.
for(const lang of ['en','zh'])test('SWF02 '+lang+' unified trainer: real faint, Ether, Revive, default Switch, trainer toy refusal and one joint commit',async()=>{
 const h=await open({lang,trainer:true,trainerMembers:2,battleStyle:'',fast:true,leadHP:1,leadMoves:[{id:'splash',pp:1,maxpp:40},{id:'tackle',pp:35,maxpp:35}],benchMoves:[{id:'tackle',pp:0,maxpp:35}],bag:{ether:2,revive:2,pokedoll:2}});try{
  const s=h.s._session,[lead,reserve]=s.party.map(m=>m.id),order=JSON.parse(h.before).party.map(m=>m.id),uses=[];let installs=0,document=h.G.$gameSystem._psGame;
  Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>document,set:v=>{installs++;document=v;}});const use=s.useItem.bind(s);s.useItem=(...a)=>{uses.push(a[0]);return use(...a);};
  await pick(h,'fight');await pick(h,1);await h.p.inMode('party-forced');assert(s.gw.readState('p1').find(m=>m.id===lead).fainted);await pick(h,reserve);await pick(h,'switch-in');await h.p.inMode('main');assert.equal(s.gw.activeId('p1'),reserve);
  await pick(h,'bag');await pick(h,'ether');await pick(h,'use');await h.p.inMode('bag-members');await pick(h,reserve);await h.p.inMode('bag-moves');await pick(h,0);await h.p.inMode('main');assert.equal(s.currentRequest().active[0].moves[0].pp,10);
  await pick(h,'bag');await pick(h,'revive');await pick(h,'use');await h.p.inMode('bag-members');await pick(h,lead);await h.p.inMode('main');assert(s.gw.readState('p1').find(m=>m.id===lead).hp>0);
  await pick(h,'fight');await pick(h,1);await h.waitFor(()=>['main','replacement-question'].includes(h.s._mode)&&h.s.inputState().ready,'first post-item attack');assert.equal(h.s._mode,'replacement-question');const offer=E.session.readTrainerReplacement(s);assert(offer);assert.equal(s.gw.readState('p1').find(m=>m.id===reserve).pp.tackle,9);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
  const pp=s.gw.readState('p1').map(m=>[m.id,m.pp]).sort(),random=structuredClone(SWD.trainerAiDiagnostics(s).state.random),journal=SWD.trainerAiJournal(s).entries.length;
  await h.frames(1);await pick(h,'replace-yes');await h.p.inMode('party');await pick(h,lead);await pick(h,'switch-in');await h.p.inMode('main');assert.equal(s.gw.activeId('p1'),lead);assert.equal(E.session.readTrainerReplacement(s),null);assert.deepEqual(s.gw.readState('p1').map(m=>[m.id,m.pp]).sort(),pp);assert.deepEqual(SWD.trainerAiDiagnostics(s).state.random,random);assert.equal(SWD.trainerAiJournal(s).entries.length,journal);
  const snapshot=s.gw.snapshot(),ledger=JSON.stringify(s.ledger);await pick(h,'bag');h.s.changeBagPocket(1);await h.frames(1);await pick(h,'pokedoll');await pick(h,'use');await h.p.inMode('bag');assert.equal(s.gw.snapshot(),snapshot);assert.equal(JSON.stringify(s.ledger),ledger);assert.equal(s.bag.pokedoll,2);assert.deepEqual(uses,['ether','revive']);h.s.onMenuCancel();await h.frames(1);await h.p.inMode('main');
  await pick(h,'fight');await pick(h,2);await h.p.inMode('end');assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);await h.frames(1);h.s.onMenuOk();await h.frames(3);assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(installs,1);
  const saved=h.flow.game();assert.deepEqual(saved.party.map(m=>m.id),order);assert(saved.party.find(m=>m.id===lead).hp>0);assert.deepEqual(saved.party.find(m=>m.id===lead).moves.map(m=>m.pp),[0,34]);assert.equal(saved.party.find(m=>m.id===reserve).moves[0].pp,9);assert.deepEqual(E.inventory.aggregateBag(saved.inventory),{ether:1,revive:1,pokedoll:2});h.s.onEnd();assert.equal(installs,1);
 }finally{h.cleanup();}
});

// Per-battle growth off: real registered MZ events, App/Session/Gen8, and compiled result presentation.
for(const lang of ['en','zh'])for(const command of ['StartBattle','StartTrainerBattle'])test(lang+' '+command+' expGain false skips growth but preserves victory cue, feedback and single installation',async()=>{
 const h=await open({lang,command,expGain:'false',trainerMembers:2,grow:true,fast:true});try{
  const s=h.s._session,id=s.party[0].id,baseline=structuredClone(JSON.parse(h.before).party[0]);assert.equal(s.expGain,false);let installs=0,document=h.G.$gameSystem._psGame,cues=0;Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>document,set:v=>{installs++;document=v;}});const victory=h.flow._victoryBattleMusic;h.flow._victoryBattleMusic=function(...a){cues++;return victory.apply(this,a);};
  for(let n=0;n<2&&!s.finished;n++){await pick(h,'fight');await pick(h,1);await h.waitFor(()=>['main','end'].includes(h.s._mode),'no-exp normal result or next command');assert.equal(s.party[0].level,baseline.level);assert.equal(s.party[0].exp,baseline.exp);assert.deepEqual(s.party[0].evs,baseline.evs);assert.equal(cues,s.finished?1:0);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);}
  assert(s.finished);await h.p.inMode('end');assert(!h.batches.flatMap(row=>row.value).some(m=>['growth','learn-prompt','learned'].includes(m.kind)));assert.equal(cues,1);assert(h.s._endFeedbackShown);await h.frames(1);h.s.onMenuOk();await h.frames(3);assert.equal(h.flow.lastOutcome.commit,'applied',JSON.stringify(h.flow.lastOutcome));assert.equal(installs,1);const saved=h.flow.game().party.find(m=>m.id===id);assert.equal(saved.exp,baseline.exp);assert.equal(saved.level,baseline.level);assert.deepEqual(saved.evs,baseline.evs);assert(saved.moves[0].pp<baseline.moves[0].pp);h.s.onEnd();assert.equal(installs,1);
 }finally{h.cleanup();}
});
test('both registered events reject malformed expGain before opening or advancing sequence; metadata defaults On',async()=>{
 const h=await open();try{h.cleanup();const before=JSON.stringify(h.flow.game()),seq=h.G.$gameSystem._psBattleSeq;for(const name of ['StartBattle','StartTrainerBattle'])for(const expGain of [null,0,'off',{}])assert.throws(()=>h.w.commands['PS_BattleFlow:'+name].call({setWaitMode(){}},{expGain}),/expGain must be true or false/);assert.equal(h.flow.running,false);assert.equal(h.G.$gameSystem._psBattleSeq,seq);assert.equal(JSON.stringify(h.flow.game()),before);const meta=fs.readFileSync(path.join(ROOT,'src/plugins/PS_BattleFlow.meta.txt'),'utf8');assert.equal(meta.split('@arg expGain').length-1,2);assert.equal((meta.match(/@arg expGain[\s\S]*?@default true/g)||[]).length,2);
 }finally{h.cleanup();}
});

// Scripted event rules consume the existing App/Gen8 prohibition policy, not a UI-only menu flag.
for(const lang of ['en','zh'])for(const command of ['StartBattle','StartTrainerBattle'])test('SR01 '+lang+' '+command+' prohibited Run and Ball preserve combat state and allow a different action to finish once',async()=>{
 const h=await open({lang,command,noRun:'true',noBall:'true',bag:{masterball:2},fast:true});try{
  const s=h.s._session;assert.deepEqual(s.gw.query('p1','ball'),{allowed:false,reason:'ballsdisabled'},'the registered event must inject noBall');assert.deepEqual(s.gw.query('p1','run'),{allowed:false,reason:command==='StartBattle'?'norun':'trainer'});
  const engine=s.gw.snapshot(),request=JSON.stringify(s.currentRequest()),bag=JSON.stringify(s.bag);let installs=0,document=h.G.$gameSystem._psGame;Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>document,set:v=>{installs++;document=v;}});
  await pick(h,'run');await h.p.inMode('main');assert.equal(s.gw.snapshot(),engine);assert.equal(JSON.stringify(s.currentRequest()),request);assert.equal(JSON.stringify(s.bag),bag);assert.equal(installs,0);
  await pick(h,'bag');await pick(h,'masterball');await pick(h,'use');await h.p.inMode('bag');assert.equal(h.s.battleBagState().kind,'items');assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext,'masterball');assert.equal(s.gw.snapshot(),engine);assert.equal(JSON.stringify(s.currentRequest()),request);assert.equal(JSON.stringify(s.bag),bag);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
  const painted=h.completed.join('').replace(/\s/g,'');assert(painted.includes(h.flow.translator().t('refusal.ball.ballsdisabled').replace(/\s/g,'')),'the actual ball refusal must be presented in the chosen language');
  h.s.onMenuCancel();await h.frames(1);await h.p.inMode('main');await pick(h,'fight');await pick(h,1);await h.p.inMode('end');assert(s.finished);assert.equal(installs,0);await h.frames(1);h.s.onMenuOk();await h.frames(3);assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(installs,1);assert.deepEqual(h.flow.game().inventory,JSON.parse(h.before).inventory);assert.equal(s.bag.masterball,2);h.s.onEnd();assert.equal(installs,1);
 }finally{h.cleanup();}
});
for(const flag of [undefined,'false'])for(const command of ['StartBattle','StartTrainerBattle'])test('SR02 '+command+' '+String(flag)+' retains the existing wild capture or trainer blocked-ball contract',async()=>{
 const h=await open({command,noRun:flag,noBall:flag,bag:{masterball:2},fast:true});try{
  const s=h.s._session;assert.equal(s.gw.query('p1','ball').allowed,true);assert.deepEqual(s.gw.query('p1','run'),command==='StartBattle'?{allowed:true}:{allowed:false,reason:'trainer'});const r=await s.throwBall('masterball');assert(r.ok);assert.equal(s.bag.masterball,1);
  if(command==='StartBattle'){assert(s.finished);assert.equal(s.ended.reason,'caught');assert.equal(s.result().captured.length,1);}else{assert(!s.finished);assert(r.messages.some(m=>m.kind==='events'&&m.events.some(e=>e.type==='rpg'&&e.args.includes('blocked'))));}assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{h.cleanup();}
});
for(const rule of ['noRun','noBall'])test('SR03 '+rule+' is independent of the other prohibition',async()=>{
 const h=await open({command:'StartBattle',[rule]:true,bag:{masterball:2},fast:true});try{assert.deepEqual(h.s._session.gw.query('p1','ball'),rule==='noBall'?{allowed:false,reason:'ballsdisabled'}:{allowed:true});assert.deepEqual(h.s._session.gw.query('p1','run'),rule==='noRun'?{allowed:false,reason:'norun'}:{allowed:true});assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});
test('SR04 both event commands validate prohibition types before sequence/open and declare default false metadata',async()=>{
 const h=await open();try{h.cleanup();const before=JSON.stringify(h.flow.game()),seq=h.G.$gameSystem._psBattleSeq;for(const command of ['StartBattle','StartTrainerBattle'])for(const rule of ['noRun','noBall'])for(const value of [null,0,'off',{}])assert.throws(()=>h.w.commands['PS_BattleFlow:'+command].call({setWaitMode(){}},{[rule]:value}),new RegExp(rule+' must be true or false'));assert.equal(h.flow.running,false);assert.equal(h.G.$gameSystem._psBattleSeq,seq);assert.equal(JSON.stringify(h.flow.game()),before);const meta=fs.readFileSync(path.join(ROOT,'src/plugins/PS_BattleFlow.meta.txt'),'utf8');for(const rule of ['noRun','noBall'])assert.equal((meta.match(new RegExp('@arg '+rule+'[\\s\\S]*?@default false','g'))||[]).length,2);
 }finally{h.cleanup();}
});

for(const lang of ['en','zh'])test('CEXP Scene '+lang+' disabled capture growth still shows success, requests victory BGM and receives once',async()=>{
 const h=await open({lang,bag:{masterball:1},hurt:false,grow:true,fast:true,captureSetting:false});try{
  const s=h.s._session,original=JSON.stringify({level:s.party[0].level,exp:s.party[0].exp,evs:s.party[0].evs,moves:s.party[0].moves});let doc=h.G.$gameSystem._psGame,installs=0;Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>doc,set:v=>{installs++;doc=v;}});
  h.s.act(()=>s.throwBall('masterball'),'item');await h.p.inMode('end');assert.equal(s.captureExpGain,false);assert.equal(s.ended.reason,'caught');assert.equal(JSON.stringify({level:s.party[0].level,exp:s.party[0].exp,evs:s.party[0].evs,moves:s.party[0].moves}),original);assert(!h.batches.flatMap(x=>x.value).some(m=>m.kind==='growth'));assert.equal(h.flow.musicState().player.requests.filter(x=>x.kind==='victory').length,1);assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
  await h.frames(1);h.s.onMenuOk();await h.frames(4);assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(installs,1);assert.equal(h.flow.game().party.length,3);assert(h.flow.game().dex.owned.includes('pidgey'));assert.equal(h.flow.game().party[0].exp,JSON.parse(h.before).party[0].exp);assert.equal(h.flow.game().inventory.pockets.flat().filter(x=>x.itemId==='masterball').length,0);h.s.onEnd();assert.equal(installs,1);
 }finally{h.cleanup();}
});
test('CEXP Scene true keeps ordinary capture growth and does not duplicate its victory cue',async()=>{
 const h=await open({bag:{masterball:1},hurt:false,grow:true,fast:true,captureSetting:true});try{const s=h.s._session,before=s.party[0].exp;h.s.act(()=>s.throwBall('masterball'),'item');await h.waitFor(()=>h.s.levelStatsState?.()||h.s._mode==='end','capture growth display');if(h.s.levelStatsState()){await h.p.press('ok');await h.p.press('ok');}await h.p.inMode('end');assert.equal(s.captureExpGain,true);assert(s.party[0].exp>before);assert.equal(s.party[0].level,51);assert.equal(h.flow.musicState().player.requests.filter(x=>x.kind==='victory').length,0,'new terminal fallback is only for the disabled global rule');assert.equal(JSON.stringify(h.flow.game()),h.before);}finally{h.cleanup();}
});

// WP66-A 6.1 + WP20 5.5: reorder individual records, retain independent battle wrappers.
async function movesDetail(h, id) {
  await summary(h, id);
  for (let i = 0; i < 3; i++) await h.p.press('right');
  await h.p.press('ok'); assert.equal(current(h).view.detail, 'moves');
}
async function leaveMoves(h) {
  await h.p.press('cancel'); await h.p.press('cancel'); await h.p.inMode('party');
  h.s.onMenuCancel(); await h.p.inMode('main');
}
for(const lang of ['en','zh'])for(const reserve of [false,true])test(lang+' default Summary to Bag restores the displayed move after sorting '+(reserve?'reserve':'active')+' member',async()=>{
  const original=[{id:'tackle',pp:35,maxpp:35},{id:'splash',pp:7,maxpp:40}];
  const h=await open({lang,hurt:false,fast:true,bag:{ether:2},...(reserve?{benchMoves:original}:{leadMoves:original})});try{
    const s=h.s._session,id=s.party[reserve?1:0].id,engine=s.gw.snapshot();let installs=0,doc=h.G.$gameSystem._psGame;
    Object.defineProperty(h.G.$gameSystem,'_psGame',{configurable:true,get:()=>doc,set:value=>{installs++;doc=value;}});
    await movesDetail(h,id);await h.p.press('ok');await h.p.press('down');await h.p.press('ok');
    assert.deepEqual(s.party.find(m=>m.id===id).moves,[original[1],original[0]]);assert.equal(s.gw.snapshot(),engine);
    await leaveMoves(h);await pick(h,'bag');
    for(let i=0;i<8&&!h.s.inputState().items.some(row=>row.key==='ether');i++){h.s.changeBagPocket(1);await h.frames(1);}
    await pick(h,'ether');await pick(h,'use');await h.p.inMode('bag-members');await pick(h,id);await h.p.inMode('bag-moves');
    assert.equal(h.s.inputState().items[0].key,0);assert.equal(h.s.battleBagState().rows[0].moveId,'splash');
    await pick(h,0);await h.p.inMode('main');
    assert.deepEqual(s.party.find(m=>m.id===id).moves.map(m=>[m.id,m.pp]),[['splash',17],['tackle',35]]);
    assert.equal(s.gw.readState('p1').find(m=>m.id===id).pp.splash,17);assert.equal(s.bag.ether,1);assert.equal(s.ledger.length,1);assert.equal(s.ledger[0].state,'consumed');
    assert.equal(installs,0);assert.equal(JSON.stringify(h.flow.game()),h.before);
    await pick(h,'fight');await pick(h,1);await h.p.inMode('end');h.s.onMenuOk();await h.frames(3);
    assert.equal(h.flow.lastOutcome.commit,'applied');assert.equal(installs,1);
    assert.deepEqual(h.flow.game().party.find(m=>m.id===id).moves.map(m=>[m.id,m.pp]),[['splash',17],['tackle',reserve?35:34]]);
    const committed=JSON.stringify(h.flow.game());h.s.onEnd();assert.equal(installs,1);assert.equal(JSON.stringify(h.flow.game()),committed);
  }finally{h.cleanup();}
});
for (const lang of ['en', 'zh']) test(lang + ' summary move sorting swaps complete working records and preserves actual PP and single final write', async () => {
  const original = [{ id: 'tackle', pp: 32, maxpp: 56, ppUps: 3 }, { id: 'splash', pp: 7, maxpp: 40, ppUps: 0 }];
  const h = await open({ lang, leadMoves: original, trainer: true, trainerMembers: 2, fast: true }); try {
    const s = h.s._session, id = s.party[0].id, engine = s.gw.snapshot();
    let installs = 0, doc = h.G.$gameSystem._psGame;
    Object.defineProperty(h.G.$gameSystem, '_psGame', { configurable: true, get: () => doc, set: value => { installs++; doc = value; } });
    await movesDetail(h, id); await h.p.press('ok');
    assert.equal(current(h).view.selected, 0, 'normal USE must select the source move');
    assert.deepEqual(s.party[0].moves, original, 'source selection alone does not write');
    await h.p.press('down'); await h.p.press('ok');
    assert.deepEqual(s.party[0].moves, [original[1], original[0]], 'entire records, including PP Ups, follow the move');
    assert.equal(current(h).view.selected, null); assert.equal(s.gw.snapshot(), engine, 'summary sorting does not rewrite temporary battle wrappers');
    const rows = text(h).filter(line => line.includes(' PP'));
    assert(rows[0].includes('7/40 PP') && rows[1].includes('32/56 PP'), 'shared view redraws the accepted order and PP');
    assert.equal(JSON.stringify(h.flow.game()), h.before); assert.equal(installs, 0);
    await leaveMoves(h); await pick(h, 'fight');
    assert.equal(h.s._menu._items[0].ext, 1, 'current battle wrapper choice keeps its own slot identity');
    await pick(h, 1); await h.p.inMode('main');
    assert.equal(s.party[0].moves[1].id, 'tackle'); assert.equal(s.party[0].moves[1].pp, 31, 'actual Gen8 use synchronizes by move identity after sorting');
    await pick(h, 'fight'); await pick(h, 1); await h.p.inMode('end');
    assert.equal(installs, 0); assert.equal(JSON.stringify(h.flow.game()), h.before);
    await h.frames(1); h.s.onMenuOk(); await h.frames(3);
    assert.equal(h.flow.lastOutcome.commit, 'applied'); assert.equal(installs, 1);
    assert.deepEqual(h.flow.game().party[0].moves.map(m => [m.id, m.pp, m.maxpp, m.ppUps]), [['splash',7,40,0],['tackle',30,56,3]]);
    const committed = JSON.stringify(h.flow.game()); h.s.onEnd(); assert.equal(installs, 1); assert.equal(JSON.stringify(h.flow.game()), committed);
    assert.deepEqual(h.managementCalls(), { beginManagement: 0, manage: 0 });
  } finally { h.cleanup(); }
});
test('summary move sorting cancels source selection and retired owners cannot submit it', async () => {
  const h = await open({ leadMoves: [{id:'tackle',pp:35,maxpp:35},{id:'splash',pp:40,maxpp:40}] }); try {
    const s = h.s._session, before = JSON.stringify(s.party);
    await movesDetail(h, s.party[0].id); await h.p.press('ok'); assert.equal(current(h).view.selected, 0);
    await h.p.press('cancel'); assert.equal(current(h).view.selected, null); assert.equal(current(h).view.detail, 'moves');
    await h.p.press('ok'); await h.p.press('down'); h.flow.stateReplaced(); await h.frames(2); await h.p.press('ok');
    assert.equal(current(h), null); assert.equal(JSON.stringify(s.party), before); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('summary move sorting validates own member, order, slots, shadow and busy state and restores its checkpoint', async () => {
  const h = await open({ leadMoves: [{id:'tackle',pp:35,maxpp:35},{id:'splash',pp:40,maxpp:40}] }); try {
    const s = h.s._session, id = s.party[0].id, reorder = E.session.reorderBattleSummaryMoves;
    assert.equal(typeof reorder, 'function'); const order = ['tackle','splash'], before = JSON.stringify(s._checkpoint());
    for (const args of [[s.foeTeam[0].id,0,1,order],[id,-1,1,order],[id,0,2,order],[id,0,0.5,order],[id,0,1,['splash','tackle']]]) {
      assert.equal(await reorder(s,...args), false); assert.equal(JSON.stringify(s._checkpoint()), before);
    }
    s.party[0].shadow = true; assert.equal(await reorder(s,id,0,1,order),false); delete s.party[0].shadow;
    await s._exclusive(async () => { assert.equal(await reorder(s,id,0,1,order),false); });
    const cp = s._checkpoint(); assert.equal(await reorder(s,id,0,1,order),true);
    assert.deepEqual(s.party[0].moves.map(m=>m.id), ['splash','tackle']);
    await s._restoreCheckpoint(cp); assert.deepEqual(s.party[0].moves.map(m=>m.id),order);
    assert.equal(JSON.stringify(h.flow.game()),h.before);
  } finally { h.cleanup(); }
});
test('summary move sorting then real full-slot learning replaces the intended permanent identity, not the old slot', async () => {
  const h = await open({ grow:true,integration:true,trainer:true,trainerMembers:2,fast:true }); try {
    const s = h.s._session,id=s.party[0].id;
    if (process.env.PF_SUMMARY_SORT_MUTATION === 'slot-only') {
      const apply = s.gw.applyGrowth.bind(s.gw);
      s.gw.applyGrowth = (side, member, change) => { const { replaceMoveId, ...oldSlotOnly } = change; return apply(side, member, oldSlotOnly); };
    }
    await movesDetail(h,id); await h.p.press('ok'); await h.p.press('down'); await h.p.press('ok');
    assert.deepEqual(s.party[0].moves.map(m=>m.id),['growl','tackle','splash','protect']); await leaveMoves(h);
    await pick(h,'fight'); await pick(h,1); await h.p.inMode('learn-initial'); await h.frames(1); await pick(h,'forget-move');
    assert.equal(h.s._mode,'learn'); await pick(h,0); await h.p.inMode('main');
    assert.deepEqual(s.party[0].moves.map(m=>m.id),['rest','tackle','splash','protect']);
    const pp=s.gw.readState('p1').find(m=>m.id===id).pp;
    assert.equal(pp.growl,undefined,'the selected working move is the one removed from the engine');
    assert.equal(pp.tackle,34,'the unselected used move retains its own spent PP'); assert.equal(pp.rest,10);
    await pick(h,'fight'); await pick(h,1); await h.p.inMode('end');
    assert.equal(s.party[0].moves[1].pp,33); assert.equal(JSON.stringify(h.flow.game()),h.before);
    await h.frames(1); h.s.onMenuOk(); await h.frames(3); assert.equal(h.flow.lastOutcome.commit,'applied');
    assert.deepEqual(h.flow.game().party[0].moves.map(m=>m.id),['rest','tackle','splash','protect']);
    assert.equal(h.flow.game().party[0].moves[1].pp,33);
  } finally {h.cleanup();}
});
test('summary move sorting uses the selected reserve identity and keeps ribbons read-only', async () => {
  const moves=[{id:'splash',pp:9,maxpp:40,ppUps:0},{id:'growl',pp:24,maxpp:48,ppUps:1}];
  const h=await open({benchMoves:moves});try{
    const s=h.s._session,lead=JSON.stringify(s.party[0]),id=s.party[1].id;
    await movesDetail(h,id);await h.p.press('ok');await h.p.press('down');await h.p.press('ok');
    assert.deepEqual(s.party[1].moves,[moves[1],moves[0]]);assert.equal(JSON.stringify(s.party[0]),lead);
    await h.p.press('cancel');await h.p.press('right');assert.equal(current(h).view.page,4);
    await h.p.press('ok');await h.p.press('ok');assert.equal(current(h).view.selected,null,'move capability does not enable ribbon or management writes');
    await h.p.press('cancel');await h.p.press('cancel');await h.p.inMode('party');assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext,id);
    assert.equal(JSON.stringify(h.flow.game()),h.before);assert.deepEqual(h.managementCalls(),{beginManagement:0,manage:0});
  }finally{h.cleanup();}
});

// AUD1: the visible footer command is distinct from BACK and member-command Cancel.
for(const lang of ['en','zh'])test('AUD1 '+lang+' normal-speed explicit list Cancel resolves No and the real battle commits once',async()=>{
 const h=await open({lang,trainer:true,trainerMembers:2,battleStyle:'',fast:false});try{
  const s=h.s._session,installs=observeInstalls(h),offer=await switchOffer(h),foe=s.gw.activeId('p2');
  await h.frames(1);await pick(h,'replace-yes');await h.p.inMode('party');await h.frames(1);assert.equal(h.s._partySub,'replacement');
  const pp=JSON.stringify(s.gw.readState('p1').map(m=>[m.id,m.pp]));row(h,null);h.s.onMenuOk();h.s.onMenuOk();
  await h.p.inMode('main');assert.equal(E.session.readTrainerReplacement(s),null,'footer Cancel must consume the offer just like BACK');assert(s.currentRequest());
  assert.notEqual(s.gw.activeId('p2'),foe);assert.equal(JSON.stringify(s.gw.readState('p1').map(m=>[m.id,m.pp])),pp,'declining does not spend a player action');
  assert.equal(JSON.stringify(h.flow.game()),h.before);assert.equal(installs(),0);assert.equal(h.s._failure,null);await finishSwitchBattle(h,installs);
 }finally{h.cleanup();}
});
test('AUD1 explicit list Cancel shares the first-update gate and member-command Cancel remains only a return',async()=>{
 const h=await open({trainer:true,trainerMembers:2,battleStyle:'',fast:true});try{
  const s=h.s._session,offer=await switchOffer(h);await h.frames(1);row(h,'replace-yes');h.s.onMenuOk();assert.equal(h.s._mode,'party');
  row(h,null);h.s.onMenuOk();assert.equal(h.s._mode,'party','the confirmation that opened the list cannot immediately decline it');assert.equal(E.session.readTrainerReplacement(s).offerId,offer.offerId);
  await h.frames(1);await pick(h,s.party[1].id);await h.p.inMode('party-command');await pick(h,null);await h.p.inMode('party');assert.equal(E.session.readTrainerReplacement(s).offerId,offer.offerId,'member-command Cancel only returns to the list');
  await h.frames(1);await pick(h,null);await h.p.inMode('main');assert.equal(E.session.readTrainerReplacement(s),null);assert(s.currentRequest());assert.equal(JSON.stringify(h.flow.game()),h.before);
 }finally{h.cleanup();}
});

for (const lang of ['en', 'zh']) test(`saved player nicknames reach compiled Scene messages, status and party (${lang})`, async () => {
  const h = await open({ lang, nicknames: ['Alpha', 'Beta'], trainer: true, trainerMembers: 2, fast: true });
  try {
    const [lead, bench] = h.s._session.party;
    assert.equal(h.s._names[lead.id], 'Alpha'); assert.equal(h.s._names[bench.id], 'Beta');
    const card = h.s._status._d2Cards.find(c => c.side === 'p1' && c.active);
    assert.equal(card.name, 'Alpha'); assert.equal(h.s._status._d2Appearance(card).name, 'Alpha');
    assert.equal(h.s._D.event({ type: 'switch', args: ['p1a: ' + lead.id] })[0], h.flow.translator().t('battle.go', { name: 'Alpha' }));
    assert(h.s._D.event({ type: 'move', args: ['p1a: ' + lead.id, 'Tackle'] })[0].includes('Alpha'));
    assert(h.s._D.event({ type: 'cant', args: ['p1a: ' + lead.id, 'par'] })[0].includes('Alpha'));
    await pick(h, 'fight'); await pick(h, 1); await h.p.inMode('main');
    assert(h.completed.some(line => line.includes('Alpha')), 'real action messages paint the nickname');
    await pick(h, 'party');
    assert(h.s._menu._items.find(r => r.ext === lead.id).name.includes('Alpha'));
    assert(h.s._menu._items.find(r => r.ext === bench.id).name.includes('Beta'));
    await pick(h, bench.id); await pick(h, 'switch-in'); await h.p.inMode('main');
    assert(h.completed.some(line => line.includes('Beta')), 'real switch messages paint the reserve nickname');
    const switched = h.s._status._d2Cards.find(c => c.side === 'p1' && c.active);
    assert.equal(h.s._status._d2Appearance(switched).name, 'Beta');
    // No private foe nickname is consulted by the public appearance consumer.
    const foe = h.s._status._d2Cards.find(c => c.side === 'p2' && c.active);
    h.s._session.foeTeam.forEach(m => { m.nickname = 'PRIVATE-FOE'; });
    assert(!h.s._status._d2Appearance(foe).name.includes('PRIVATE-FOE'));
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('unnamed player keeps localized species fallback in compiled Scene', async () => {
  const h = await open({ nicknames: ['', ''], fast: true });
  try { const lead = h.s._session.party[0], expected = h.flow.speciesName(lead.species);
    assert.equal(h.s._names[lead.id], expected);
    const card = h.s._status._d2Cards.find(c => c.side === 'p1' && c.active);
    assert.equal(h.s._status._d2Appearance(card).name, expected);
  } finally { h.cleanup(); }
});
