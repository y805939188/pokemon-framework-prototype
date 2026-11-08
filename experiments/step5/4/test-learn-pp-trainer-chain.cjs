'use strict';
// Synthetic compiled Scene -> real App -> real Session -> fixed Gen8 engine.
// No Summary navigation, product replacement, NW, player save or reference replay.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createVictoryDriverHost } = require('./victory-music-driver-host.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const E = require('../../../js/engine/build/production.cjs');
const PLAN = require('./victory-music-native-plan.json');
let work, plugins, entryText, fixture, failed = false;
async function preserveOnFailure(action) {
  try { return await action(); } catch (error) { failed = true; throw error; }
}
const clone = value => JSON.parse(JSON.stringify(value));
test.before(() => preserveOnFailure(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-learn-pp-chain-')); plugins = {};
  for (const name of ['PS_BattleFlow', 'PS_SaveState', 'PS_Evolution', 'PS_BattleFlowTest']) {
    const out = path.join(work, name);
    const result = spawnSync('pnpm', ['--dir', 'src', 'exec', 'vite', 'build', '--outDir', out], {
      cwd: ROOT, env: { ...process.env, RR_PLUGIN: name }, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const code = fs.readFileSync(path.join(out, name + '.js'), 'utf8');
    if (name === 'PS_BattleFlowTest') entryText = code; else plugins[name] = code;
  }
  const vite = require(require.resolve('vite', { paths: [path.join(ROOT, 'src')] }));
  await vite.build({ configFile: false, root: ROOT, logLevel: 'error', build: {
    outDir: path.join(work, 'fixture'), minify: false,
    lib: { entry: path.join(ROOT, 'src/plugins/flowtest/music-native-fixture.ts'), formats: ['cjs'], fileName: () => 'entry.cjs' },
  } });
  fixture = require(path.join(work, 'fixture/entry.cjs'));
}));
// Preserve failed-run artifacts; only remove this test's generated host on success.
test.beforeEach(() => { assert(!failed, 'earlier case failed; no further business case may start'); });
test.after(() => { if (work && !failed) fs.rmSync(work, { recursive: true, force: true }); });
async function open(lang, layout) {
  const h = createVictoryDriverHost({ ROOT, work, plugins, entryText, driverText: 'SYNTHETIC_UNUSED_DRIVER', PLAN, options: { productionTranslator: true } });
  const G = h.G, flow = h.w.flow, content = fixture.musicNativeContent(E, assert);
  G.Bitmap.prototype.fillRect = () => {};
  const parameters = G.PluginManager.parameters;
  G.PluginManager.parameters = name => ({ ...parameters(name), ...(name === 'PS_BattleFlow' ? { language: lang } : {}) });
  G.SoundManager.playOk = () => {};
  flow.setLanguage(null); flow.stateReplaced(); flow._app = null;
  flow._content = content; flow._dex = E.dex.createDexLookup(); flow.seed = [1, 2, 3, 4]; flow.rng = () => 0; flow.fast = true;
  // Explicit synthetic author content, not an official acquisition/learnset claim.
  content.species.Snorlax.learnset = { 1: ['Hyper Voice'], 6: ['Rest'], 7: ['Growl'] };
  content.species.Pidgey.baseExp = 600; content.species.Pidgeotto.baseExp = 0;
  content.trainers['music-normal'][0].party = [
    { species: 'pidgey', level: 3, moves: ['splash'] },
    { species: 'pidgeotto', level: 1, moves: ['splash'] },
    { species: 'pidgeotto', level: 1, moves: ['splash'] },
  ];
  const member = E.memberFactory.createMember({ id: 'LEARN-PP-P1', species: 'Snorlax', level: 5 }, content, () => 0);
  const sentinel = E.memberFactory.createMember({ id: 'LEARN-PP-P2', species: 'Snorlax', level: 50 }, content, () => 0);
  const state = E.state.newGame({ content, party: [member, sentinel].map(m => E.speciesKey.toPersistentMember(m, content)), money: 1000, bag: { ether: 2 } });
  state.nextMemberOrdinal = '3'; state.badges.fill(true);
  state.party[0].exp = E.growth.minExp(content.species.Snorlax.growth, 6) - 1;
  state.party[0].moves = [{ id: 'hypervoice', pp: 10, maxpp: 10 }, ...(layout === 'replace' ? [
    { id: 'splash', pp: 7, maxpp: 40 }, { id: 'protect', pp: 3, maxpp: 10 }, { id: 'tackle', pp: 24, maxpp: 35 },
  ] : [])];
  state.party[1].moves = [{ id: 'growl', pp: 11, maxpp: 40, ppUps: 0 }];
  G.$gameSystem._psGame = state;
  const before = JSON.stringify(flow.game()); let doc = state, installs = 0;
  Object.defineProperty(G.$gameSystem, '_psGame', { configurable: true, get: () => doc, set: value => { installs++; doc = value; } });
  await h.p.toMapId(5, 8, 9);
  flow.openBattle({ kind: 'trainer', trainer: { id: 'music-normal', version: 1 }, battleId: 'learn-pp-' + path.basename(h.w.root), seq: 1, canLose: true, battleStyle: 'set' });
  await h.p.inMode('main'); const scene = h.p.battle(), session = scene._session;
  const messages = [], stages = [], push = scene.pushMessages;
  scene.pushMessages = function (value) { messages.push(...value); return push.call(this, value); };
  const decisions = [], decide = session.decideLearn.bind(session);
  session.decideLearn = (...args) => { decisions.push({ member: session.pendingLearn?.memberId, move: session.pendingLearn?.move.id, slot: args[0] }); return decide(...args); };
  const uses = [], use = session.useItem.bind(session);
  session.useItem = (...args) => { uses.push(clone(args)); return use(...args); };
  return { ...h, flow, scene, session, before, messages, stages, decisions, uses, installs: () => installs,
    cleanup() { if (flow.running) flow.abort(Error('owned learn/PP chain cleanup')); scene.terminate(); },
  };
}
async function pick(h, key) {
  if (h.scene._mode === 'bag') for (let i = 0; i < 8 && !h.scene.inputState().items.some(row => row.key === key); i++) { h.scene.changeBagPocket(1); await h.frames(1); }
  const rows = h.scene.inputState().items, index = rows.findIndex(row => row.key === key);
  assert(index >= 0, 'actual menu ' + key + ' in ' + h.scene._mode + ': ' + JSON.stringify(rows));
  h.scene._menu.select(index); h.scene.onMenuOk(); await h.frames(1);
}
function uncommitted(h) { assert.equal(h.installs(), 0); assert.equal(JSON.stringify(h.flow.game()), h.before); }
const working = h => h.session.party.find(m => m.id === 'LEARN-PP-P1');
const live = h => h.session.gw.readState('p1').find(m => m.id === 'LEARN-PP-P1');
function pp(h, growl, hypervoice) {
  assert.deepEqual(working(h).moves.map(m => m.id), ['hypervoice', 'rest', 'growl', ...(working(h).moves.length === 4 ? ['tackle'] : [])]);
  for (const [id, expected] of Object.entries({ rest: 10, growl, hypervoice })) {
    assert.equal(working(h).moves.find(m => m.id === id).pp, expected, 'working ' + id);
    assert.equal(live(h).pp[id], expected, 'permanent engine ' + id);
    assert.equal(h.session.currentRequest().active[0].moves.find(m => m.id === id).pp, expected, 'request ' + id);
  }
  assert.equal(live(h).pp.protect, undefined); assert.equal(live(h).pp.splash, undefined);
  assert.equal(h.session.party.find(m => m.id === 'LEARN-PP-P2').moves[0].pp, 11, 'same-named move on other member is untouched');
  if (working(h).moves.length === 4) assert.equal(working(h).moves[3].pp, 24);
  uncommitted(h);
  h.stages.push({ mode: h.scene._mode, working: clone(working(h)), live: clone(live(h)), request: clone(h.session.currentRequest()), foe: h.session.gw.activeId('p2'), bag: clone(h.session.bag), ledger: clone(h.session.ledger), installs: h.installs() });
}
async function etherSelector(h) {
  await pick(h, 'bag'); await pick(h, 'ether'); await pick(h, 'use'); await h.p.inMode('bag-members');
  await pick(h, 'LEARN-PP-P1'); await h.p.inMode('bag-moves');
  const rows = h.scene._menu._items;
  assert(rows[2].name.toLowerCase().includes('growl') || rows[2].name.includes('叫声'), 'new Growl is in actual Bag move row');
  return rows;
}
async function learnBoth(h, layout) {
  await pick(h, 'fight'); await pick(h, 1);
  for (const [level, move, slot] of [[6, 'rest', 1], [7, 'growl', 2]]) {
    await h.waitFor(() => h.scene.levelStatsState()?.level === level, 'real per-level stats ' + level);
    assert.equal(working(h).level, level); assert.equal(live(h).level, level); uncommitted(h);
    if (layout === 'replace') { assert.equal(h.session.pendingLearn.memberId, 'LEARN-PP-P1'); assert.equal(h.session.pendingLearn.move.id, move); }
    await h.p.press('ok'); await h.p.press('ok');
    if (layout === 'replace') {
      await h.p.inMode('learn-initial'); await h.frames(1); await pick(h, 'forget-move'); await h.p.inMode('learn');
      await pick(h, slot);
    }
  }
  await h.p.inMode('main');
  assert.deepEqual(h.messages.filter(m => m.kind === 'growth').map(m => clone(m.levelUps)), [[6], [7]]);
  assert.equal(h.messages.filter(m => m.kind === 'growth').reduce((n, m) => n + m.exp, 0), 269);
  assert.deepEqual(h.decisions, layout === 'replace' ? [{ member: 'LEARN-PP-P1', move: 'rest', slot: 1 }, { member: 'LEARN-PP-P1', move: 'growl', slot: 2 }] : []);
  assert.deepEqual(h.messages.filter(m => m.kind === 'learned').map(m => m.move), ['rest', 'growl']);
  assert.equal(h.session.gw.activeId('p2'), h.session.foeTeam[1].id); assert.equal(h.session.ended, null);
  pp(h, 40, 9);
}
for (const lang of ['en', 'zh']) for (const layout of ['append', 'replace']) test('LPP ' + lang + ' ' + layout + ': per-level learn, immediate Bag, spend/refill, next foe and one settlement', async () => {
  let h; try {
    h = await open(lang, layout); await learnBoth(h, layout); const s = h.session;
    const beforeFull = s.gw.snapshot(); await etherSelector(h); await pick(h, 2); await h.p.inMode('bag-members');
    assert.equal(s.gw.snapshot(), beforeFull, 'full newly learned PP is rejected without a turn');
    assert.equal(s.bag.ether, 2); assert.equal(s.ledger.length, 0); assert.equal(h.uses.length, 0); pp(h, 40, 9);
    h.scene.onMenuCancel(); await h.frames(1); h.scene.onMenuCancel(); await h.p.inMode('main');
    await pick(h, 'fight'); await pick(h, 3); await h.p.inMode('main'); pp(h, 39, 9);
    await etherSelector(h); h.scene.onMenuCancel(); await h.p.inMode('bag-members');
    assert.equal(h.uses.length, 0); assert.equal(s.bag.ether, 2); pp(h, 39, 9);
    await pick(h, 'LEARN-PP-P1'); await h.p.inMode('bag-moves'); await pick(h, 2);
    h.scene.onMenuOk(); h.scene.onMenuCancel(); await h.p.inMode('main');
    assert.equal(h.uses.length, 1); assert.equal(h.uses[0][0], 'ether'); assert.equal(h.uses[0][1], 'LEARN-PP-P1'); assert.equal(h.uses[0][2].moveSlot, 2);
    assert.equal(s.bag.ether, 1); assert.equal(s.ledger.length, 1); assert.equal(s.ledger[0].state, 'consumed'); pp(h, 40, 9);
    await pick(h, 'fight'); await pick(h, 1); await h.p.inMode('main');
    assert.equal(s.gw.activeId('p2'), s.foeTeam[2].id, 'actual next trainer opponent dispatch'); pp(h, 40, 8);
    await pick(h, 'fight'); await pick(h, 3); await h.p.inMode('main'); pp(h, 39, 8);
    await pick(h, 'fight'); await pick(h, 1); await h.p.inMode('end'); uncommitted(h);
    assert.equal(s.ended.reason, 'win'); const result = clone(s.result());
    assert.equal(result.members['LEARN-PP-P1'].moves.find(m => m.id === 'growl').pp, 39);
    assert.equal(result.members['LEARN-PP-P1'].moves.find(m => m.id === 'hypervoice').pp, 7);
    await h.frames(1); h.scene.onMenuOk(); await h.frames(3);
    assert.equal(h.flow.lastOutcome.commit, 'applied'); assert.equal(h.installs(), 1);
    const saved = h.flow.game(), actor = saved.party.find(m => m.id === 'LEARN-PP-P1');
    assert.deepEqual(actor.moves.map(m => [m.id, m.pp]), [['hypervoice', 7], ['rest', 10], ['growl', 39], ...(layout === 'replace' ? [['tackle', 24]] : [])]);
    assert.equal(actor.level, 7);
    assert.deepEqual(h.flow.lastOutcome.diagnostics??[],[], 'legal primary friendship and no-op readiness are not missing evidence');
    const prior=JSON.parse(h.before);assert.deepEqual(saved.stats,{...prior.stats,trainer_battles_won:prior.stats.trainer_battles_won+1});
    assert.deepEqual(saved.dex.defeatedCounts,{pidgey:1,pidgeotto:2});assert.deepEqual(saved.dex.capturedCounts,{});
    assert.deepEqual([...saved.dex.seen].sort(),['pidgeotto','pidgey','snorlax']);assert.deepEqual(saved.dex.owned,[]);
    assert.equal(prior.party[0].friendship,70);assert.equal(actor.friendship,81, 'two low-band levelups (+5 each) and Ether battleitem (+1) use the auxiliary receipt');
    assert(saved.party.every(m=>m.evolutionReadiness==='known'&&m.readyToEvolve===false));
 assert.equal(E.inventory.aggregateBag(saved.inventory).ether, 1);
    assert.deepEqual(saved.party.map(m => m.id), ['LEARN-PP-P1', 'LEARN-PP-P2']);
    assert.deepEqual(saved.party[1], JSON.parse(h.before).party[1]);
    const final = JSON.stringify(saved); h.scene.onEnd(); h.scene.onMenuOk(); await h.frames(3);
    assert.equal(h.installs(), 1); assert.equal(JSON.stringify(h.flow.game()), final);
    if (process.env.PF_LPP_OBSERVATIONS) fs.writeFileSync(path.join(process.env.PF_LPP_OBSERVATIONS, lang + '-' + layout + '.json'), JSON.stringify({ execution: 'SYNTHETIC_COMPILED_HOST', lang, layout, stages: h.stages, growth: h.messages.filter(m => ['growth', 'learned'].includes(m.kind)), decisions: h.decisions, uses: h.uses, result, outcome: h.flow.lastOutcome, installs: h.installs(), saved }, null, 2) + '\n');
  } catch (error) { failed = true; throw error; } finally { await preserveOnFailure(() => h?.cleanup()); }
});
