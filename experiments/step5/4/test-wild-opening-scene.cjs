'use strict';
// Production compiled Scene + real App/Gen8 Session. Window/input/raster ports are controlled, not NW.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process'), { createVictoryDriverHost } = require('./victory-music-driver-host.cjs');
const ROOT = path.resolve(__dirname, '../../..'), E = require('../../../js/engine/build/production.cjs'), PLAN = require('./victory-music-native-plan.json');
let temp, plugins, entryText, fixture;
test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-wild-opening-scene-')); plugins = {};
  for (const name of ['PS_BattleFlow', 'PS_SaveState', 'PS_Evolution', 'PS_BattleFlowTest']) {
    const out = path.join(temp, name), r = spawnSync('pnpm', ['--dir', 'src', 'exec', 'vite', 'build', '--outDir', out], { cwd: ROOT, env: { ...process.env, RR_PLUGIN: name }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr); const code = fs.readFileSync(path.join(out, name + '.js'), 'utf8');
    if (name === 'PS_BattleFlowTest') entryText = code;
    else plugins[name] = name === 'PS_BattleFlow' && process.env.PF_WILD_OPENING_TEST_PLUGIN ? fs.readFileSync(process.env.PF_WILD_OPENING_TEST_PLUGIN, 'utf8') : code;
  }
  const vite = require(require.resolve('vite', { paths: [path.join(ROOT, 'src')] }));
  await vite.build({ configFile: false, root: ROOT, logLevel: 'error', build: { outDir: path.join(temp, 'fixture'), minify: false,
    lib: { entry: path.join(ROOT, 'src/plugins/flowtest/music-native-fixture.ts'), formats: ['cjs'], fileName: () => 'entry.cjs' } } });
  fixture = require(path.join(temp, 'fixture/entry.cjs'));
});
test.after(() => { if (temp) fs.rmSync(temp, { recursive: true, force: true }); });
async function open({ lang = 'en', members = 2, hurt = true, bag = { potion: 3, masterball: 2, xattack: 1 }, catalog, trainer = false, egg = false, fast = false, effects = true } = {}) {
  const h = createVictoryDriverHost({ ROOT, work: temp, plugins, entryText, driverText: 'SYNTHETIC_UNUSED_DRIVER', PLAN, options: { productionTranslator: true } });
  const G = h.G, flow = h.w.flow, content = fixture.musicNativeContent(E, assert), parameters = G.PluginManager.parameters;
  G.Bitmap.prototype.fillRect = () => {}; // Existing controlled drawing port, no native pixel claim.
  if (catalog) catalog(content.items);
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
  return { ...h, s, flow, before, batches, completed, cleanup() { if (flow.running) flow.abort(Error('owned wild opening cleanup')); s.terminate(); } };
}


const paused = h => h.s.ordinaryMessageState()?.implementation === 'paused-message-v1';
const playerBodies = h => h.s.children.filter(n => n._psPictureRole === 'body' && n._psPictureKey?.startsWith('p1:'));
async function entrance(h) {
  await h.waitFor(() => paused(h) || h.s.inputState().ready, 'wild paused message or original main fallback');
  assert(paused(h), 'actual wild opening must have a paused appearance message before input');
  assert(!h.s.inputState().ready); assert.equal(playerBodies(h).length, 0);
  assert(h.s.pictureState().actors.some(actor => actor.side === 'p2' && actor.body === 1), 'foe is actually shown before its announcement');
}
for (const lang of ['en', 'zh']) test(lang + ' normal wild foe appears, pauses for three seconds from full text, then player brief precedes its send-out', async () => {
  const h = await open({ lang }); try {
    await entrance(h); await h.waitFor(() => h.s.ordinaryMessageState()?.phase === 'full', 'fully rendered wild announcement');
    const step = h.s._ordinaryMessage, at = step.snapshot().fullyShownAt;
    assert.equal(h.s._log._lines.join(''), h.flow.translator().t('battle.wild_appeared', { name: h.flow.speciesName('Pidgey') })); assert(h.s._log.pause);
    assert.equal(playerBodies(h).length, 0); h.s._menu.select(0); h.s.onMenuOk(); assert(!h.s.inputState().ready);
    await h.frames(170); assert.equal(h.s._ordinaryMessage, step); assert(h.G.performance.now() - at < 3000); assert.equal(playerBodies(h).length, 0);
    await h.waitFor(() => h.s.briefMessageState()?.phase === 'typing', 'player send-out brief after actual wild pause');
    assert(h.G.performance.now() - at >= 3000); assert.equal(playerBodies(h).length, 0);
    await h.waitFor(() => h.s.briefMessageState()?.phase === 'resident', 'full player brief'); assert.equal(playerBodies(h).length, 0);
    await h.p.inMode('main'); assert(h.s.pictureState().actors.some(actor => actor.side === 'p1' && actor.body === 1));
    const announcement = h.flow.translator().t('battle.wild_appeared', { name: h.flow.speciesName('Pidgey') });
    const playerText = h.flow.translator().t('battle.go', { name: h.flow.speciesName(h.s._session.party[0].species) });
    assert.equal(h.completed.filter(line => line === announcement).length, 1, 'one announcement per opening');
    assert(h.completed.indexOf(playerText) > h.completed.indexOf(announcement), 'completed wild pause precedes player dispatch text');
    assert(!h.completed.some(line => line === h.flow.translator().t('battle.foe_sent_out', { name: h.flow.speciesName('Pidgey') })), 'wild appearance does not also announce a trainer send-out');
    const opening = h.batches.find(batch => batch.value.some(message => message.kind === 'events' && message.events.some(e => e.type === 'switch')));
    assert(opening); assert.equal(JSON.stringify(opening.value), opening.wire, 'presentation ordering never mutates owned raw messages');
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
for (const lang of ['en', 'zh']) test(lang + ' typing USE reveals the wild message without dismissing it; the next BACK confirms before player dispatch', async () => {
  const h = await open({ lang }); try {
    await entrance(h); const step = h.s._ordinaryMessage;
    await h.p.press('ok'); assert.equal(h.s._ordinaryMessage, step); assert.equal(step.snapshot().phase, 'full'); assert.equal(playerBodies(h).length, 0);
    await h.p.press('cancel'); assert.notEqual(h.s._ordinaryMessage, step); assert.equal(step.snapshot().phase, 'done');
    await h.p.inMode('main'); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('Battle Effects off keeps the basic wild appearance and paused message instead of skipping to commands', async () => {
  const h = await open({ effects: false }); try { await entrance(h); await h.p.inMode('main'); assert.equal(JSON.stringify(h.flow.game()), h.before); } finally { h.cleanup(); }
});
test('trainer challenge keeps its existing paused opening and never uses the wild announcement', async () => {
  const h = await open({ trainer: true }); try {
    await h.waitFor(() => h.s.ordinaryMessageState()?.phase === 'full', 'trainer challenge');
    const name = h.flow._op.trainerPresentation.name; assert.equal(h.s._log._lines.join(''), h.flow.translator().t('trainer.challenged', { name }));
    assert.equal(h.s._wildOpeningQueued, false); await h.p.inMode('main'); assert.equal(h.s._wildOpeningQueued, false);
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('explicit test fast mode retains the new wild opening but auto-completes the existing paused contract', async () => {
  const h = await open({ fast: true }); try { await h.p.inMode('main'); assert.equal(h.s._wildOpeningQueued, true); assert.equal(JSON.stringify(h.flow.game()), h.before); } finally { h.cleanup(); }
});
for (const how of ['abort', 'replace', 'terminate']) test(how + ' retires the actual wild pause and cannot resume old dispatch on a successor', async () => {
  const h = await open(); try {
    await entrance(h); const step = h.s._ordinaryMessage;
    if (how === 'abort') h.flow.abort(Error('owned wild opening interruption')); else if (how === 'replace') h.flow.stateReplaced(); else h.s.terminate();
    if (how !== 'terminate') await h.frames(2); h.s.terminate(); const next = { children: [] }; h.G.SceneManager._scene = next;
    const text = JSON.stringify(h.s._log._lines); assert(step.advance(h.G.performance.now() + 6000)); h.s.onMenuOk();
    assert.equal(h.s.ordinaryMessageState(), null); assert.equal(h.G.SceneManager._scene, next); assert.equal(next.children.length, 0); assert.equal(JSON.stringify(h.s._log._lines), text);
    assert.equal(JSON.stringify(h.flow.game()), h.before); assert(!h.flow.app().saveBlocked);
  } finally { h.cleanup(); }
});
