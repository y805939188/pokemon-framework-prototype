'use strict';
// Production compiled Scene + real App/Gen8 Session. Window/input/raster ports are controlled, not NW.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process'), { createVictoryDriverHost } = require('./victory-music-driver-host.cjs');
const ROOT = path.resolve(__dirname, '../../..'), E = require('../../../js/engine/build/production.cjs'), PLAN = require('./victory-music-native-plan.json');
let temp, plugins, entryText, fixture;
test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-party-switch-scene-')); plugins = {};
  for (const name of ['PS_BattleFlow', 'PS_SaveState', 'PS_Evolution', 'PS_BattleFlowTest']) {
    const out = path.join(temp, name), r = spawnSync('pnpm', ['--dir', 'src', 'exec', 'vite', 'build', '--outDir', out], { cwd: ROOT, env: { ...process.env, RR_PLUGIN: name }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr); const code = fs.readFileSync(path.join(out, name + '.js'), 'utf8');
    if (name === 'PS_BattleFlowTest') entryText = code;
    else plugins[name] = name === 'PS_BattleFlow' && process.env.PF_PARTY_SWITCH_TEST_PLUGIN ? fs.readFileSync(process.env.PF_PARTY_SWITCH_TEST_PLUGIN, 'utf8') : code;
  }
  const vite = require(require.resolve('vite', { paths: [path.join(ROOT, 'src')] }));
  await vite.build({ configFile: false, root: ROOT, logLevel: 'error', build: { outDir: path.join(temp, 'fixture'), minify: false,
    lib: { entry: path.join(ROOT, 'src/plugins/flowtest/music-native-fixture.ts'), formats: ['cjs'], fileName: () => 'entry.cjs' } } });
  fixture = require(path.join(temp, 'fixture/entry.cjs'));
});
test.after(() => { if (temp) fs.rmSync(temp, { recursive: true, force: true }); });
async function open({ lang = 'en', members = 2, hurt = true, bag = { potion: 3, masterball: 2, xattack: 1 }, catalog, trainer = false, egg = false, reserveHP = null, trainerMembers = 1, shadowTag = false, ghost = false, fast = false, effects = true } = {}) {
  const h = createVictoryDriverHost({ ROOT, work: temp, plugins, entryText, driverText: 'SYNTHETIC_UNUSED_DRIVER', PLAN, options: { productionTranslator: true } });
  const G = h.G, flow = h.w.flow, content = fixture.musicNativeContent(E, assert), parameters = G.PluginManager.parameters;
  G.Bitmap.prototype.fillRect = () => {}; // Existing controlled drawing port, no native pixel claim.
  if (catalog) catalog(content.items);
  const trainerRecord = content.trainers['music-normal'][0];
  trainerRecord.party = Array.from({ length: trainerMembers }, (_, i) => ({ ...trainerRecord.party[0], level: 3 + i }));
  if (shadowTag) trainerRecord.party[0].ability = 'shadowtag'; // Explicit author fixture; trapping itself is the real Gen8 engine.
  G.PluginManager.parameters = function (name) { const p = parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...p, language: lang } : p; };
  flow.setLanguage(null); flow.stateReplaced(); flow._app = null; flow._content = content; flow._dex = E.dex.createDexLookup(); flow.seed = [1, 2, 3, 4]; flow.rng = () => 0; flow.fast = fast; (G.ConfigManager ??= {}).battleEffects = effects;
  const state = fixture.musicNativeState(E, content, 'receiving'); state.party = state.party.slice(0, members); state.nextMemberOrdinal = String(members + 1);
  if (ghost) state.party[0] = E.speciesKey.toPersistentMember(E.memberFactory.createMember({ id: state.party[0].id, species: 'Gengar', level: 100 }, content, () => 0), content);
  if (hurt) state.party[0].hp -= 40;
  if (reserveHP !== null) state.party[1].hp = reserveHP;
  if (egg) state.party[1].isEgg = true;
  state.inventory = E.inventory.inventoryFromBag(bag, E.itemCatalog.catalogOf(content)); G.$gameSystem._psGame = state;
  const before = JSON.stringify(flow.game()); await h.p.toMapId(5, 8, 9);
  const batches = [], begin = flow.begin.bind(flow); flow.begin = async (...args) => { const session = await begin(...args), take = session.take.bind(session); session.take = () => { const value = take(); batches.push({ value, wire: JSON.stringify(value) }); return value; }; return session; };
  flow.openBattle({ kind: trainer ? 'trainer' : 'wild', ...(trainer ? { trainer: { id: 'music-normal', version: 1 } } : { foes: [{ species: 'Pidgey', level: 3 }] }), battleId: 'bag-' + path.basename(h.w.root), seq: 1, canLose: true });
  await h.waitFor(() => !!h.p.battle()?._session, 'real opening Session'); const s = h.p.battle();
  const completed = [], add = s._log.add; s._log.add = function (line) { completed.push(line); return add.call(this, line); };
  await h.p.inMode('main');
  return { ...h, s, flow, before, batches, completed, cleanup() { if (flow.running) flow.abort(Error('owned party switch cleanup')); s.terminate(); } };
}

function row(h, key) { const i = h.s._menu._items.findIndex(r => r.ext === key); assert(i >= 0, 'actual menu key ' + key); h.s._menu.select(i); }
async function pick(h, key) { row(h, key); h.s.onMenuOk(); await h.frames(1); }
async function party(h) { await pick(h, 'party'); assert.equal(h.s._mode, 'party'); }
async function commands(h, id) { await party(h); await pick(h, id); assert.equal(h.s._mode, 'party-command'); }
for (const lang of ['en', 'zh']) test(lang + ' selecting a party member opens commands without submitting; explicit Switch In registers once', async () => {
  const h = await open({ lang }); try {
    const s = h.s._session, next = s.party[1].id, beforeRequest = JSON.stringify(s.currentRequest()); let calls = 0;
    const choose = s.chooseSwitch.bind(s); s.chooseSwitch = (...a) => { calls++; return choose(...a); };
    await party(h); row(h, next); h.s.onMenuOk();
    assert.equal(h.s._mode, 'party-command', 'member selection must open the command layer before any registration');
    assert.equal(calls, 0); assert.equal(JSON.stringify(s.currentRequest()), beforeRequest);
    assert.equal(h.s._menu._items[0].name, lang === 'zh' ? '派上场' : 'Switch In');
    h.s.onMenuOk(); assert.equal(calls, 0, 'opening confirmation cannot also accept Switch In in the same update');
    await h.frames(1); await pick(h, 'switch-in'); h.s.onMenuOk(); await h.p.inMode('main');
    assert.equal(calls, 1); assert.equal(s.gw.activeId('p1'), next);
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('member command BACK/Cancel returns to the same member; voluntary root cancellation restores the main cursor', async () => {
  const h = await open(); try {
    const id = h.s._session.party[1].id; await commands(h, id);
    await pick(h, null); assert.equal(h.s._mode, 'party'); assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext, id);
    await pick(h, id); h.s.onMenuCancel(); await h.frames(1); assert.equal(h.s._mode, 'party'); assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext, id);
    h.s.onMenuCancel(); await h.frames(1); assert.equal(h.s._mode, 'main'); assert.equal(h.s._menu.index(), 2);
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('a real already-active registration refusal returns to the member list without spending a turn', async () => {
  const h = await open(); try {
    const s = h.s._session, id = s.gw.activeId('p1'), beforeRequest = JSON.stringify(s.currentRequest()), before = JSON.stringify(s.gw.readState('p1'));
    await commands(h, id); await pick(h, 'switch-in'); await h.p.inMode('party');
    assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext, id); assert.equal(s.gw.activeId('p1'), id);
    assert.equal(JSON.stringify(s.currentRequest()), beforeRequest); assert.equal(JSON.stringify(s.gw.readState('p1')), before);
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('a fainted reserve has no Switch In command and can return without registration', async () => {
  const h = await open({ reserveHP: 0 }); try {
    const id = h.s._session.party[1].id; await commands(h, id);
    assert(!h.s._menu._items.some(r => r.ext === 'switch-in')); assert.equal(h.s._menu._items.length, 2);
    assert(h.s._menu._items.some(r => r.ext === 'summary'), 'the shared summary remains available for a fainted member');
    await pick(h, null); assert.equal(h.s._mode, 'party'); assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext, id);
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('real faint replacement forbids root cancellation but permits command cancellation, then registers the survivor once', async () => {
  const h = await open({ reserveHP: 1 }); try {
    const s = h.s._session, original = s.party[0].id, reserve = s.party[1].id;
    await commands(h, reserve); await pick(h, 'switch-in'); await h.p.inMode('party-forced');
    assert(s.gw.readState('p1').find(m => m.id === reserve).fainted, 'actual enemy action caused the replacement');
    const request = JSON.stringify(s.currentRequest()); h.s.onMenuCancel(); await h.frames(1);
    assert.equal(h.s._mode, 'party-forced'); assert.equal(JSON.stringify(s.currentRequest()), request);
    await pick(h, original); assert.equal(h.s._mode, 'party-command'); await pick(h, null); assert.equal(h.s._mode, 'party-forced');
    assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext, original);
    let calls = 0; const choose = s.chooseForcedSwitch.bind(s); s.chooseForcedSwitch = (...a) => { calls++; return choose(...a); };
    await pick(h, original); await pick(h, 'switch-in'); h.s.onMenuOk(); await h.p.inMode('main');
    assert.equal(calls, 1); assert.equal(s.gw.activeId('p1'), original); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('delayed actual registration keeps commands locked and cannot double-submit', async () => {
  const h = await open(); let release; try {
    const s = h.s._session, next = s.party[1].id, choose = s.chooseSwitch.bind(s), wait = new Promise(resolve => { release = resolve; }); let calls = 0;
    s.chooseSwitch = (...a) => { calls++; return wait.then(() => choose(...a)); };
    await commands(h, next); await pick(h, 'switch-in'); assert.equal(calls, 1); assert(!h.s.inputState().ready);
    h.s.onMenuOk(); h.s.onMenuCancel(); assert.equal(calls, 1); release(); await h.p.inMode('main');
    assert.equal(s.gw.activeId('p1'), next); assert.equal(calls, 1); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { release?.(); h.cleanup(); }
});
test('abort, replacement and termination retire party commands without selecting on a successor', async () => {
  for (const how of ['abort', 'replace', 'terminate']) {
    const h = await open(); try {
      const s = h.s._session, next = s.party[1].id; let calls = 0; s.chooseSwitch = () => { calls++; throw Error('retired selection'); };
      await commands(h, next);
      if (how === 'abort') h.flow.abort(Error('owned party close')); else if (how === 'replace') h.flow.stateReplaced(); else h.s.terminate();
      if (how !== 'terminate') await h.frames(2); h.s.terminate(); const successor = { children: [] }; h.G.SceneManager._scene = successor;
      h.s.onMenuOk(); h.s.onMenuCancel(); assert.equal(calls, 0); assert.equal(h.G.SceneManager._scene, successor); assert.equal(successor.children.length, 0);
      assert.equal(JSON.stringify(h.flow.game()), h.before); assert(!h.flow.app().saveBlocked);
    } finally { h.cleanup(); }
  }
});

test('a full six-member list keeps stable identities across actual switches instead of submitting displayed indexes', async () => {
  const h = await open({ members: 6 }); try {
    const s = h.s._session, last = s.party[5].id, second = s.party[1].id;
    const original = s.party.map(m => m.id), displayed = () => Array.from(h.s.inputState().items.filter(r => r.key !== null), r => r.key);
    await commands(h, last); await pick(h, 'switch-in'); await h.p.inMode('main'); assert.equal(s.gw.activeId('p1'), last);
    await party(h); assert.equal(h.s._menu._items.length, 7, 'six stable member rows plus Cancel');
    // Normalize VM-owned arrays: stable IDs and ranks are the contract, not Array.prototype.
    assert.deepEqual(displayed().sort(), original.toSorted());
    assert.deepEqual(displayed(), [last, ...original.slice(1, 5), original[0]]);
    await pick(h, second); assert.equal(h.s._mode, 'party-command'); await pick(h, 'switch-in'); await h.p.inMode('main');
    assert.equal(s.gw.activeId('p1'), second); assert.equal(JSON.stringify(h.flow.game()), h.before);
    await party(h); assert.deepEqual(displayed(), [second, last, ...original.slice(2, 5), original[0]]);
    assert.deepEqual(s.party.map(m => m.id), original, 'display swaps do not reorder Session participants');
  } finally { h.cleanup(); }
});


for (const lang of ['en', 'zh']) {
  test(lang + ' a real already-active refusal names the member instead of displaying the generic choice error', async () => {
    const h = await open({ lang, trainer: true, shadowTag: true }); try {
      const s = h.s._session, id = s.gw.activeId('p1'), name = h.flow.speciesName(s.party.find(m => m.id === id).species);
      const request = JSON.stringify(s.currentRequest()), live = JSON.stringify(s.gw.readState('p1'));
      await commands(h, id); await pick(h, 'switch-in'); await h.p.inMode('party');
      const expected = lang === 'zh' ? name + '已经在对战中了！' : name + ' is already in battle!';
      assert(h.completed.includes(expected), 'actual refused switch must display the already-active reason: ' + expected);
      assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext, id);
      assert.equal(JSON.stringify(s.currentRequest()), request); assert.equal(JSON.stringify(s.gw.readState('p1')), live);
      assert.equal(JSON.stringify(h.flow.game()), h.before);
    } finally { h.cleanup(); }
  });
  test(lang + ' an actual engine trapping refusal names the outgoing member and returns selection without a turn', async () => {
    const h = await open({ lang, trainer: true, shadowTag: true }); try {
      const s = h.s._session, id = s.party[1].id, active = s.gw.activeId('p1'), name = h.flow.speciesName(s.party.find(m => m.id === active).species);
      const live = JSON.stringify(s.gw.readState('p1')); let refused;
      const choose = s.chooseSwitch.bind(s); s.chooseSwitch = async (...a) => { refused = await choose(...a); return refused; };
      await commands(h, id); await pick(h, 'switch-in'); await h.p.inMode('party');
      assert.equal(refused.ok, false, 'the real engine, not the UI, refused the switch'); assert.equal(refused.reason, 'choice-rejected');
      assert.equal(s.gw.awaitingChoice('p1').active[0].trapped, true, 'classified trapping is present in the actual public request');
      const expected = lang === 'zh' ? name + '现在无法被替换！' : name + " can't be switched out!";
      assert(h.completed.includes(expected), 'actual refused switch must display the trapping reason: ' + expected);
      assert.equal(s.gw.activeId('p1'), active); assert.equal(h.s._menu.itemAt(h.s._menu.index()).ext, id);
      assert.equal(JSON.stringify(s.gw.readState('p1')), live); assert.equal(JSON.stringify(h.flow.game()), h.before);
      h.s.onMenuCancel(); await h.frames(1); assert.equal(h.s._mode, 'main');
    } finally { h.cleanup(); }
  });
}
test('a Ghost uses the actual Gen8 trapping exception without a speculative UI refusal', async () => {
  const h = await open({ trainer: true, shadowTag: true, ghost: true }); try {
    const s = h.s._session, id = s.party[1].id;
    assert.notEqual(s.gw.awaitingChoice('p1').active[0].trapped, true);
    await commands(h, id); await pick(h, 'switch-in'); await h.p.inMode('main');
    assert.equal(s.gw.activeId('p1'), id); assert.equal(JSON.stringify(h.flow.game()), h.before);
    assert(!h.completed.some(line => typeof line === 'string' && line.includes("can't be switched out")));
  } finally { h.cleanup(); }
});
test('a different refusal reason retains its existing localized message even for an active member', async () => {
  const h = await open(); try {
    const s = h.s._session, id = s.gw.activeId('p1');
    s.chooseSwitch = async () => ({ ok: false, reason: 'not-registered' }); // Controlled refusal-family compatibility check only.
    await commands(h, id); await pick(h, 'switch-in'); await h.p.inMode('party');
    assert(h.completed.includes("That isn't possible right now.")); assert(!h.completed.some(line => typeof line === 'string' && line.includes('already in battle')));
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
