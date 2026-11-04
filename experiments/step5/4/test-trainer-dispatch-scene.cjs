'use strict';
// Production compiled Scene + real App/Gen8 Session. Window/input/raster ports are controlled, not NW.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process'), { createVictoryDriverHost } = require('./victory-music-driver-host.cjs');
const ROOT = path.resolve(__dirname, '../../..'), E = require('../../../js/engine/build/production.cjs'), PLAN = require('./victory-music-native-plan.json');
let temp, plugins, entryText, fixture;
test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-trainer-dispatch-scene-')); plugins = {};
  for (const name of ['PS_BattleFlow', 'PS_SaveState', 'PS_Evolution', 'PS_BattleFlowTest']) {
    const out = path.join(temp, name), r = spawnSync('pnpm', ['--dir', 'src', 'exec', 'vite', 'build', '--outDir', out], { cwd: ROOT, env: { ...process.env, RR_PLUGIN: name }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr); const code = fs.readFileSync(path.join(out, name + '.js'), 'utf8');
    if (name === 'PS_BattleFlowTest') entryText = code;
    else plugins[name] = name === 'PS_BattleFlow' && process.env.PF_TRAINER_DISPATCH_TEST_PLUGIN ? fs.readFileSync(process.env.PF_TRAINER_DISPATCH_TEST_PLUGIN, 'utf8') : code;
  }
  const vite = require(require.resolve('vite', { paths: [path.join(ROOT, 'src')] }));
  await vite.build({ configFile: false, root: ROOT, logLevel: 'error', build: { outDir: path.join(temp, 'fixture'), minify: false,
    lib: { entry: path.join(ROOT, 'src/plugins/flowtest/music-native-fixture.ts'), formats: ['cjs'], fileName: () => 'entry.cjs' } } });
  fixture = require(path.join(temp, 'fixture/entry.cjs'));
});
test.after(() => { if (temp) fs.rmSync(temp, { recursive: true, force: true }); });
async function open({ lang = 'en', members = 2, hurt = true, bag = { potion: 3, masterball: 2, xattack: 1 }, catalog, trainer = true, egg = false, trainerMembers = 1, fast = false, effects = true } = {}) {
  const h = createVictoryDriverHost({ ROOT, work: temp, plugins, entryText, driverText: 'SYNTHETIC_UNUSED_DRIVER', PLAN, options: { productionTranslator: true } });
  const G = h.G, flow = h.w.flow, content = fixture.musicNativeContent(E, assert), parameters = G.PluginManager.parameters;
  G.Bitmap.prototype.fillRect = () => {}; // Existing controlled drawing port, no native pixel claim.
  if (catalog) catalog(content.items);
  const trainerRecord = content.trainers['music-normal'][0];
  trainerRecord.party = Array.from({ length: trainerMembers }, (_, i) => ({ ...trainerRecord.party[0], level: 3 + i }));
  G.PluginManager.parameters = function (name) { const p = parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...p, language: lang } : p; };
  flow.setLanguage(null); flow.stateReplaced(); flow._app = null; flow._content = content; flow._dex = E.dex.createDexLookup(); flow.seed = [1, 2, 3, 4]; flow.rng = () => 0; flow.fast = fast; (G.ConfigManager ??= {}).battleEffects = effects;
  const state = fixture.musicNativeState(E, content, 'receiving'); state.party = state.party.slice(0, members); state.nextMemberOrdinal = String(members + 1);
  if (hurt) state.party[0].hp -= 40;
  if (egg) state.party[1].isEgg = true;
  state.inventory = E.inventory.inventoryFromBag(bag, E.itemCatalog.catalogOf(content)); G.$gameSystem._psGame = state;
  const before = JSON.stringify(flow.game()); await h.p.toMapId(5, 8, 9);
  const batches = [], begin = flow.begin.bind(flow); flow.begin = async (...args) => { const session = await begin(...args), take = session.take.bind(session); session.take = () => { const value = take(); batches.push({ value, wire: JSON.stringify(value) }); return value; }; return session; };
  flow.openBattle({ kind: trainer ? 'trainer' : 'wild', ...(trainer ? { trainer: { id: 'music-normal', version: 1 } } : { foes: [{ species: 'Pidgey', level: 3 }] }), battleId: 'bag-' + path.basename(h.w.root), seq: 1, canLose: true });
  await h.waitFor(() => !!h.p.battle()?._session, 'real opening Session'); const s = h.p.battle();
  const completed = [], add = s._log.add; s._log.add = function (line) { completed.push(line); return add.call(this, line); };
  return { ...h, s, flow, before, batches, completed, cleanup() { if (flow.running) flow.abort(Error('owned trainer dispatch cleanup')); s.terminate(); } };
}

const body = (h, side) => h.s.children.find(n => n._psPictureRole === 'body' && n._psPictureKey?.startsWith(side + ':'));
const painted = (h, side) => { const n = body(h, side); return !!n?.visible && n.scale.x > 0 && n.scale.y > 0 && n.opacity > 0; };
function firstBatch(h) {
  const batch = h.batches.find(b => b.value.some(m => m.kind === 'events' && m.events.some(e => e.type === 'switch')));
  assert(batch, 'real Session initial events were consumed'); return batch;
}
function sendOutText(h, side) {
  const event = firstBatch(h).value.flatMap(m => m.kind === 'events' ? m.events : []).find(e => e.type === 'switch' && e.args[0].startsWith(side));
  assert(event); return h.s._D.event(event)[0];
}
async function firstBrief(h) {
  await h.waitFor(() => h.s.briefMessageState()?.phase === 'resident', 'first full trainer dispatch brief');
  assert.equal(h.s._log._lines.join(''), sendOutText(h, 'p2'), 'trainer foe dispatch must precede the player');
  assert(!painted(h, 'p1') && !painted(h, 'p2'), 'neither body may start before the first dispatch brief is full');
  assert(!h.s.inputState().ready);
}
for (const trainerMembers of [1, 3]) for (const lang of ['en', 'zh']) test(lang + ' normal trainer opening dispatches the actual foe before the player without changing Session messages, roster ' + trainerMembers, async () => {
  const h = await open({ lang, trainerMembers }); try {
    assert.equal(h.s._session.foeTeam.length, trainerMembers, 'the real trainer roster includes its reserves');
    await firstBrief(h); const first = h.s._residentBrief;
    await h.waitFor(() => h.s._residentBrief && h.s._residentBrief !== first && h.s.briefMessageState()?.phase === 'typing', 'player brief after foe appearance');
    assert(painted(h, 'p2'), 'actual foe body has appeared before the player brief');
    assert.equal(body(h, 'p1'), undefined, 'player has not started its own send-out');
    await h.waitFor(() => h.s.briefMessageState()?.phase === 'resident', 'full player dispatch brief');
    assert.equal(h.s._log._lines.join(''), sendOutText(h, 'p1'));
    const fullAt = h.s._residentBrief.snapshot().fullyShownAt;
    await h.frames(2); assert(painted(h, 'p1'), 'the actual player body starts after its own full brief');
    assert(h.G.performance.now() - fullAt < 1000); assert(!h.s.inputState().ready);
    await h.p.inMode('main'); assert(painted(h, 'p1') && painted(h, 'p2'));
    assert(h.completed.indexOf(sendOutText(h, 'p2')) < h.completed.indexOf(sendOutText(h, 'p1')));
    const challenge = h.flow.translator().t('trainer.challenged', { name: h.flow._op.trainerPresentation.name });
    assert(h.completed.indexOf(challenge) < h.completed.indexOf(sendOutText(h, 'p2')));
    assert.equal(firstBatch(h).wire, JSON.stringify(firstBatch(h).value), 'owned raw/seq/event arrays are unchanged');
    assert.equal(h.s._wildOpeningQueued, false); assert.equal(h.s._trainerDispatchQueued, true);
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
for (const options of [{ effects: false }, { fast: true }]) test('trainer dispatch ordering remains in ' + JSON.stringify(options), async () => {
  const h = await open(options); try {
    await h.p.inMode('main'); assert(painted(h, 'p1') && painted(h, 'p2'));
    assert(h.completed.indexOf(sendOutText(h, 'p2')) < h.completed.indexOf(sendOutText(h, 'p1')));
    assert.equal(h.completed.filter(line => line === sendOutText(h, 'p2')).length, 1);
    assert.equal(firstBatch(h).wire, JSON.stringify(firstBatch(h).value));
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('a normal later player switch is still a single owned send-out and never repeats the trainer foe', async () => {
  const h = await open(); try {
    await h.p.inMode('main'); const foeText = sendOutText(h, 'p2'), s = h.s._session;
    const next = s.party.find(m => m.id !== s.gw.activeId('p1')); assert(next);
    h.s.showParty('switch'); const index = h.s._menu._items.findIndex(row => row.ext === next.id);
    assert(index >= 0); h.s._menu.select(index); h.s.onMenuOk(); await h.p.inMode('main');
    assert.equal(s.gw.activeId('p1'), next.id);
    const actor = h.s.children.find(n => n._psPictureRole === 'body' && n._psPictureKey === 'p1:' + next.id);
    assert(actor?.visible && actor.scale.x > 0 && actor.opacity > 0);
    assert.equal(h.completed.filter(line => line === foeText).length, 1);
    for (const batch of h.batches) assert.equal(JSON.stringify(batch.value), batch.wire);
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
for (const how of ['abort', 'replace', 'terminate']) test(how + ' during foe dispatch retires old presentation without showing the player on a successor', async () => {
  const h = await open(); try {
    await firstBrief(h); const old = h.s._residentBrief;
    if (how === 'abort') h.flow.abort(Error('owned trainer dispatch cancellation')); else if (how === 'replace') h.flow.stateReplaced(); else h.s.terminate();
    if (how !== 'terminate') await h.frames(2); h.s.terminate();
    const next = { children: [] }; h.G.SceneManager._scene = next; const lines = JSON.stringify(h.s._log._lines);
    old.advance(h.G.performance.now() + 10000); h.s.onMenuOk();
    assert.equal(h.G.SceneManager._scene, next); assert.equal(next.children.length, 0);
    assert.equal(JSON.stringify(h.s._log._lines), lines); assert.equal(JSON.stringify(h.flow.game()), h.before);
    assert(!h.flow.app().saveBlocked);
  } finally { h.cleanup(); }
});
