'use strict';
// Production compiled Scene + real App/Gen8 Session. Window/input/raster ports are controlled, not NW.
const vm = require('node:vm');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process'), { createVictoryDriverHost } = require('./victory-music-driver-host.cjs');
const ROOT = path.resolve(__dirname, '../../..'), E = require('../../../js/engine/build/production.cjs'), PLAN = require('./victory-music-native-plan.json');
let temp, plugins, entryText, fixture;
async function prepare() {
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
}
function cleanup() { if (temp) fs.rmSync(temp, { recursive: true, force: true }); }
async function open({ lang = 'en', members = 2, hurt = true, bag = { potion: 3, masterball: 2, xattack: 1 }, catalog, trainer = false, egg = false, reserveHP = null, trainerMembers = 1, shadowTag = false, ghost = false, suppliedContent = null, heldItem = '', mint = false, grow = false, fast = false, effects = true, eggShiny = false, integration = false, canSwitch, expGain, noRun, noBall, battleEffects, battleStyle = 'set', playerStyle, leadHP = null, command = null, pivot = false, leadingEgg = false, leadMoves = null, benchMoves = null, captureSetting, foeSpecies = 'Pidgey', foeLevel = 3 } = {}) {
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
  state.inventory = E.inventory.inventoryFromBag(bag, E.itemCatalog.catalogOf(content)); G.$gameSystem._psGame = state;
  G.Input.keyMapper ??= {}; G.Input.isPressed ??= () => false; G.TouchInput.isCancelled ??= () => false;
  const listeners = new Map(), globals = new Map();
  G.document = { addEventListener(k, f) { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(f); }, removeEventListener(k, f) { listeners.get(k)?.delete(f); } };
  G.addEventListener = (k, f) => { if (!globals.has(k)) globals.set(k, new Set()); globals.get(k).add(f); };
  vm.runInContext(plugins.PS_Management, G, { filename: 'actual-PS_Management.js' });
  const before = JSON.stringify(flow.game()); await h.p.toMapId(5, 8, 9);
  const batches = [], begin = flow.begin.bind(flow); flow.begin = async (...args) => { const session = await begin(...args), take = session.take.bind(session); session.take = () => { const value = take(); batches.push({ value, wire: JSON.stringify(value) }); return value; }; return session; };
  if (command) h.w.commands['PS_BattleFlow:' + command].call({ setWaitMode() {} }, { kind: 'wild', foes: 'Pidgey:3', trainerId: 'music-normal', version: '1', canLose: 'true', ...(canSwitch === undefined ? {} : { canSwitch }), ...(expGain === undefined ? {} : { expGain }), ...(noRun === undefined ? {} : { noRun }), ...(noBall === undefined ? {} : { noBall }), ...(battleEffects === undefined ? {} : { battleEffects }), battleStyle });
  else flow.openBattle({ kind: trainer ? 'trainer' : 'wild', ...(trainer ? { trainer: { id: 'music-normal', version: 1 } } : { foes: [{ species: foeSpecies, level: foeLevel }] }), battleId: 'bag-' + path.basename(h.w.root), seq: 1, canLose: true, ...(canSwitch === undefined ? {} : { canSwitch }), ...(expGain === undefined ? {} : { expGain }), ...(noRun === undefined ? {} : { noRun }), ...(noBall === undefined ? {} : { noBall }), ...(battleEffects === undefined ? {} : { battleEffects }), battleStyle });
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

module.exports = { prepare, cleanup, open, current, makeContent: () => fixture.musicNativeContent(E, assert), controls: () => ({ plugins, entryText, temp, fixture }) };
