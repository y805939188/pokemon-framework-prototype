'use strict';
// Production compiled Scene + real App/Gen8 Session. Window/input/raster ports are controlled, not NW.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process'), { createVictoryDriverHost } = require('./victory-music-driver-host.cjs');
const ROOT = path.resolve(__dirname, '../../..'), E = require('../../../js/engine/build/production.cjs'), PLAN = require('./victory-music-native-plan.json');
let temp, plugins, entryText, fixture, donor;
test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-status-card-scene-')); plugins = {};
  for (const name of ['PS_BattleFlow', 'PS_SaveState', 'PS_Evolution', 'PS_BattleFlowTest']) {
    const out = path.join(temp, name), r = spawnSync('pnpm', ['--dir', 'src', 'exec', 'vite', 'build', '--outDir', out], { cwd: ROOT, env: { ...process.env, RR_PLUGIN: name }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr); const code = fs.readFileSync(path.join(out, name + '.js'), 'utf8');
    if (name === 'PS_BattleFlowTest') entryText = code;
    else plugins[name] = name === 'PS_BattleFlow' && process.env.PF_STATUS_CARD_TEST_PLUGIN ? fs.readFileSync(process.env.PF_STATUS_CARD_TEST_PLUGIN, 'utf8') : code;
  }
  const vite = require(require.resolve('vite', { paths: [path.join(ROOT, 'src')] }));
  await vite.build({ configFile: false, root: ROOT, logLevel: 'error', build: { outDir: path.join(temp, 'fixture'), minify: false,
    lib: { entry: path.join(ROOT, 'src/plugins/flowtest/music-native-fixture.ts'), formats: ['cjs'], fileName: () => 'entry.cjs' } } });
  fixture = require(path.join(temp, 'fixture/entry.cjs'));
  await vite.build({ configFile: false, root: ROOT, logLevel: 'error', build: { outDir: path.join(temp, 'donor'), minify: false,
    lib: { entry: path.join(ROOT, 'src/plugins/flowtest/source-fixture.ts'), formats: ['cjs'], fileName: () => 'entry.cjs' } } });
  donor = require(path.join(temp, 'donor/entry.cjs'));
});
test.after(() => { if (temp) fs.rmSync(temp, { recursive: true, force: true }); });
async function open({ lang = 'en', members = 2, hurt = true, bag = { potion: 3, masterball: 2, xattack: 1 }, catalog, trainer = false, egg = false, configure, contentFactory } = {}) {
  const h = createVictoryDriverHost({ ROOT, work: temp, plugins, entryText, driverText: 'SYNTHETIC_UNUSED_DRIVER', PLAN, options: { productionTranslator: true } });
  const G = h.G, flow = h.w.flow, content = contentFactory ? contentFactory() : fixture.musicNativeContent(E, assert), parameters = G.PluginManager.parameters;
  G.Bitmap.prototype.fillRect = () => {}; // Existing controlled drawing port, no native pixel claim.
  if (catalog) catalog(content.items);
  G.PluginManager.parameters = function (name) { const p = parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...p, language: lang } : p; };
  flow.setLanguage(null); flow.stateReplaced(); flow._app = null; flow._content = content; flow._dex = E.dex.createDexLookup(); flow.seed = [1, 2, 3, 4]; flow.rng = () => 0; flow.fast = true;
  const state = fixture.musicNativeState(E, content, 'receiving'); state.party = state.party.slice(0, members); state.nextMemberOrdinal = String(members + 1);
  if (hurt) state.party[0].hp -= 40;
  if (egg) state.party[1].isEgg = true;
  configure?.(content, state);
  state.inventory = E.inventory.inventoryFromBag(bag, E.itemCatalog.catalogOf(content)); G.$gameSystem._psGame = state;
  const before = JSON.stringify(flow.game()); await h.p.toMapId(5, 8, 9);
  flow.openBattle({ kind: trainer ? 'trainer' : 'wild', ...(trainer ? { trainer: { id: 'music-normal', version: 1 } } : { foes: [{ species: 'Pidgey', level: 3 }] }), battleId: 'bag-' + path.basename(h.w.root), seq: 1, canLose: true });
  await h.p.inMode('main'); const s = h.p.battle();
  return { ...h, s, flow, before, cleanup() { if (flow.running) flow.abort(Error('owned status cleanup')); s.terminate(); } };
}

function paint(h, changes = {}) {
  const w = h.s._status, text = [], fills = [], draw = w.drawText.bind(w), fill = w.contents.fillRect.bind(w.contents);
  w.drawText = (value, x, y, width, align) => { text.push({ value, x, y, width, align, opacity: w.contents.paintOpacity, colour: w.contents.textColor }); return draw(value, x, y, width, align); };
  w.contents.fillRect = (x, y, width, height, colour) => { fills.push({ x, y, width, height, colour, opacity: w.contents.paintOpacity }); return fill(x, y, width, height, colour); };
  const cards = h.s._display.snapshot().map(c => ({ ...c, ...(c.active ? changes[c.side] : {}) })); w._d2Cards = cards;
  w.refresh(); w.drawText = draw; w.contents.fillRect = fill;
  return { w, text, fills, views: h.s.statusCardState?.() ?? [], cards };
}
for (const [lang, labels] of [['en', ['Poison', 'Bad poison', 'Burn', 'Paralysis', 'Sleep', 'Freeze', 'Unknown']], ['zh', ['中毒', '剧毒', '灼伤', '麻痹', '睡眠', '冰冻', '未知']]]) {
  test(lang + ' actual compiled status window paints all six localized conditions and distinct toxic badge', async () => {
    const h = await open({ lang }); try {
      const colours = [];
      for (const [index, status] of ['psn', 'tox', 'brn', 'par', 'slp', 'frz', 'future-status'].entries()) {
        const r = paint(h, { p1: { status }, p2: { status: '' } });
        assert(r.text.some(t => t.y === 24 && t.x === 0 && t.value === labels[index]));
        assert.equal(r.views.find(c => c.side === 'p1' && c.visible).condition.kind, index === 6 ? 'unknown' : status);
        colours.push(r.fills.find(f => f.x === 0 && f.y === 24).colour);
      }
      assert.notEqual(colours[0], colours[1]);
      const r = paint(h, { p1: { status: '' } }); assert(!r.text.some(t => t.x === 0 && t.y === 24));
      assert(r.text.some(t => t.y === 0 && t.x === 0 && t.value.includes(lang === 'zh' ? '等级' : 'Lv.')));
      assert.equal(JSON.stringify(h.flow.game()), h.before);
    } finally { h.cleanup(); }
  });
}
test('player-only HP numbers and EXP; fractional HP colour and widths consume the shown values without rounding first', async () => {
  const h = await open(); try {
    const r = paint(h, { p1: { hp: 25.2, maxhp: 101, ratio: .4, flash: true }, p2: { hp: 7, maxhp: 17, ratio: .8, flash: true } });
    const player = r.views.find(c => c.side === 'p1' && c.visible), foe = r.views.find(c => c.side === 'p2' && c.visible);
    assert.equal(player.hp.colour, 'yellow'); assert.equal(player.hp.numbers.current, 26); assert.equal(foe.hp.numbers, null); assert.equal(foe.experience, null);
    assert(r.text.some(t => t.value === '26 / 101' && t.x < r.w.innerWidth / 2));
    assert(!r.text.some(t => t.x >= r.w.innerWidth / 2 && t.y === 24));
    const width = r.w.innerWidth / 2 - 12;
    assert(r.fills.some(f => f.x === 0 && f.y === 52 && f.colour === '#dec253' && f.width === width * 25.2 / 101));
    assert(r.fills.some(f => f.x === 0 && f.y === 72 && f.colour === '#ffffff' && f.width === width * .4));
    assert(!r.fills.some(f => f.x >= r.w.innerWidth / 2 && f.y === 72));
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('unknown EXP is omitted rather than fabricated, while normal player EXP retains its published ratio', async () => {
  const h = await open(); try {
    for (const change of [{ ratio: null }, { ratio: .5, experienceUnavailable: 'outside-level-interval' }]) {
      const r = paint(h, { p1: change }); assert.equal(r.views.find(c => c.side === 'p1' && c.visible).experience, null);
      assert(!r.fills.some(f => f.x === 0 && f.y === 72));
    }
    const r = paint(h, { p1: { ratio: .5, flash: false } }); assert(r.fills.some(f => f.x === 0 && f.y === 72 && f.colour === '#589eda'));
  } finally { h.cleanup(); }
});
test('hidden/fainted-box opacity omits drawing and partial opacity is restored after the two-side paint', async () => {
  const h = await open(); try {
    h.s._status.contents.paintOpacity = 77;
    const partial = paint(h, { p1: { boxOpacity: .5 } });
    assert(partial.text.filter(t => t.x < partial.w.innerWidth / 2).every(t => t.opacity === 128)); assert.equal(partial.w.contents.paintOpacity, 77);
    const hidden = paint(h, { p1: { boxOpacity: 0 } }); assert(!hidden.text.some(t => t.x < hidden.w.innerWidth / 2));
    const playerId = hidden.cards.find(c => c.side === 'p1' && c.active).id;
    assert.equal(hidden.views.find(c => c.side === 'p1' && c.id === playerId).visible, false); assert.equal(hidden.w.contents.paintOpacity, 77);
  } finally { h.cleanup(); }
});
test('shown public metadata does not change when private Session records are tampered with', async () => {
  const h = await open(); try {
    const expected = paint(h).views.map(c => ({ gender: c.gender, shiny: c.shiny, owned: c.owned }));
    h.s._session.party[0].gender = 'M'; h.s._session.party[0].shiny = true;
    h.s._session.foeTeam[0].gender = 'F'; h.s._session.foeTeam[0].shiny = true;
    h.s._session.foeTeam[0].species = h.s._session.party[0].species;
    assert.deepEqual(paint(h).views.map(c => ({ gender: c.gender, shiny: c.shiny, owned: c.owned })), expected);
  } finally { h.cleanup(); }
});
test('status snapshots are detached and reading twice does not advance the Scene clock or overwrite another card', async () => {
  const h = await open(); try {
    paint(h, { p1: { status: 'brn' } }); const ordinal = h.s._pictureUpdate, original = JSON.stringify(h.s.statusCardState()), view = h.s.statusCardState();
    view[0].name = 'tamper'; view[0].hp.ratio = 0; view[0].condition.label = 'tamper'; view[0].owned = true;
    assert.equal(JSON.stringify(h.s.statusCardState()), original); assert.equal(h.s._pictureUpdate, ordinal);
    const current = h.s._status._d2Cards.find(c => c.side === 'p1' && c.active), other = h.s._status._d2Cards.find(c => c.side === 'p1' && c.id !== current.id);
    current.active = false; other.active = true; h.s._status.refresh();
    assert.equal(h.s.statusCardState().find(c => c.side === 'p1' && c.visible).id, other.id);
  } finally { h.cleanup(); }
});
for (const how of ['abort', 'replace', 'terminate']) test(how + ' retires status inspection before the next Scene and preserves game state', async () => {
  const h = await open(); try {
    assert(h.s.statusCardState().length > 0);
    if (how === 'abort') h.flow.abort(Error('controlled status abort')); else if (how === 'replace') h.flow.stateReplaced(); else h.s.terminate();
    assert.equal(h.s.statusCardState().length, 0); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});

for (const lang of ['en', 'zh']) test(lang + ' published status metadata paints real gender/shiny and owned content identity', async () => {
  const h = await open({ lang, trainer: true, configure(content, state) {
    Object.assign(content.trainers['music-normal'][0].party[0], { gender: 'F', shiny: true });
    Object.assign(state.party[0], { gender: 'M', shiny: false });
    state.dex.seen.push('pidgey'); state.dex.owned.push('pidgey');
  } }); try {
    const r = paint(h), p = r.views.find(c => c.side === 'p1' && c.visible), f = r.views.find(c => c.side === 'p2' && c.visible);
    assert.equal(p.gender.kind, 'male'); assert.equal(p.shiny, false); assert.equal(p.owned, null);
    assert.equal(f.gender.kind, 'female'); assert.equal(f.shiny, true); assert.equal(f.owned, true, 'owned uses persistent pidgey key, not battle Pidgey');
    assert(r.text.some(t => t.value === '♂' && t.x < r.w.innerWidth / 2 && t.colour === '#71afff'));
    assert(r.text.some(t => t.value === '♀' && t.x >= r.w.innerWidth / 2 && t.colour === '#ff8585'));
    assert(r.text.some(t => t.value === '★' && t.x >= r.w.innerWidth / 2));
    assert(r.text.some(t => t.value === (lang === 'zh' ? '已拥有' : 'Owned') && t.x >= r.w.innerWidth / 2));
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('seen alone does not request an owned marker and unknown appearance never becomes private metadata', async () => {
  const h = await open({ configure(content, state) { state.dex.seen.push('pidgey'); } }); try {
    let r = paint(h); assert.equal(r.views.find(c => c.side === 'p2' && c.visible).owned, false);
    r = paint(h, { p2: { appearance: undefined } });
    const f = r.views.find(c => c.side === 'p2' && c.visible);
    assert.equal(f.gender.kind, 'unknown'); assert.equal(f.shiny, null); assert.equal(f.owned, null); assert.equal(f.name, 'Unknown');
    assert(!r.text.some(t => ['★', '♀', '♂', 'Owned'].includes(t.value) && t.x >= r.w.innerWidth / 2));
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('real normal switch replaces the previous gender/shiny badges and snapshots stay detached', async () => {
  const h = await open({ configure(content, state) {
    Object.assign(state.party[0], { gender: 'M', shiny: true }); Object.assign(state.party[1], { gender: 'F', shiny: false });
  } }); try {
    assert.equal(paint(h).views.find(c => c.side === 'p1' && c.visible).shiny, true);
    const s = h.s._session, r = await s.chooseSwitch(s.party[1].id); assert(r.ok); h.s.pushMessages(r.messages); await h.p.inMode('main');
    const shown = paint(h).views.find(c => c.side === 'p1' && c.visible);
    assert.equal(shown.id, s.party[1].id); assert.equal(shown.gender.kind, 'female'); assert.equal(shown.shiny, false);
    const before = JSON.stringify(h.s._display.snapshot()), dto = h.s._display.snapshot(); dto.find(c => c.active).appearance.shiny = true;
    assert.equal(JSON.stringify(h.s._display.snapshot()), before);
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('optional owned record unavailable keeps known public appearance and the normal input gate', async () => {
  const h = await open(); const read = h.flow.game;
  try {
    for (const unavailable of [() => ({ ...read(), dex: undefined }), () => { throw Error('controlled unavailable owned query'); }]) {
      h.flow.game = unavailable;
      const f = paint(h).views.find(c => c.side === 'p2' && c.visible);
      assert.equal(f.owned, null); assert.notEqual(f.gender.kind, 'unknown'); assert.equal(typeof f.shiny, 'boolean');
      assert(h.s.inputState().ready); assert.equal(h.s._failure, null);
    }
  } finally { h.flow.game = read; assert.equal(JSON.stringify(h.flow.game()), h.before); h.cleanup(); }
});
function illusionContent() {
  const input = donor.progressionDonorInputs(), base = input.species.find(s => s.id === 'snorlax');
  const species = { ...base, id: 'zoroark', showdownId: 'zoroark', nameKey: 'species.zoroark', learnset: [{ level: 1, move: 'splash' }] }; delete species.evolutions;
  input.species.push(species);
  input.trainerTypes = [{ id: 'status-type', nameKey: 'trainer.status', gender: 0, source: 'author-placeholder', baseMoney: 0, skillLevel: 0, flags: [], items: [] }];
  input.trainers = [{ id: 'music-normal', type: 'status-type', name: 'Status Test', version: 1, source: 'author-placeholder', party: [
    { species: 'zoroark', level: 100, moves: ['splash'], ability: 'illusion', gender: 'M', shiny: false },
    { species: 'snorlax', level: 100, moves: ['splash'], gender: 'F', shiny: true },
  ] }];
  const compiled = E.contentCompile.compileContent(input); assert(compiled.ok, JSON.stringify(compiled.errors));
  const assembled = E.contentRuntime.assembleContent(compiled.data, E.dex.createDexLookup()); assert.equal(assembled.errors.length, 0); return assembled.content;
}
test('real Illusion alias is unavailable until the published replace proves the actual displayed identity', async () => {
  const h = await open({ trainer: true, contentFactory: illusionContent, configure(content, state) { state.dex.seen.push('zoroark'); state.dex.owned.push('zoroark'); } }); try {
    const s = h.s._session, first = paint(h).views.find(c => c.side === 'p2' && c.visible);
    assert.equal(s.foeTeam[0].species, 'Zoroark'); assert.equal(first.gender.kind, 'unknown'); assert.equal(first.shiny, null); assert.equal(first.owned, null);
    const result = await s.chooseMove(1); assert(result.ok); assert(result.messages.some(m => m.kind === 'events' && m.events.some(e => e.type === 'replace')));
    h.s.pushMessages(result.messages); await h.p.inMode('main');
    const revealed = paint(h).views.find(c => c.side === 'p2' && c.visible);
    assert.equal(revealed.id, s.foeTeam[0].id); assert.equal(revealed.name, 'Zoroark'); assert.equal(revealed.gender.kind, 'male'); assert.equal(revealed.shiny, false); assert.equal(revealed.owned, true);
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
