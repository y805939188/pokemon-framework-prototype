'use strict';
// Real compiled production Scene/App/Gen8 Session; input, drawing and clocks are controlled, never NW.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process'), { createVictoryDriverHost } = require('./victory-music-driver-host.cjs');
const ROOT = path.resolve(process.env.PF_BRIEF_SCENE_ROOT || path.resolve(__dirname, '../../..'));
const E = require(path.join(ROOT, 'js/engine/build/production.cjs')), PLAN = require('./victory-music-native-plan.json');
let temp, plugins, entryText, fixture;
test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-brief-scene-')); plugins = {};
  for (const name of ['PS_BattleFlow', 'PS_SaveState', 'PS_Evolution', 'PS_BattleFlowTest']) {
    const out = path.join(temp, name), r = spawnSync('pnpm', ['--dir', 'src', 'exec', 'vite', 'build', '--outDir', out], { cwd: ROOT, env: { ...process.env, RR_PLUGIN: name }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    let code = fs.readFileSync(path.join(out, name + '.js'), 'utf8');
    if (name === 'PS_BattleFlow' && process.env.PF_BRIEF_SCENE_CONTROL) {
      const edits = { 'missing-replacement-wait': ['queued.push(this._briefTail.beforeNextMessage());', 'void this._briefTail;'],
        'missing-resident-retirement': ['resident?.cancel();', 'void resident;'],
        'hidden-player-body': ['sprite.visible = value > 0;', 'sprite.visible = value > 0 && !(sprite._psPictureRole === "body" && sprite._psPictureKey?.startsWith("p1:"));'] };
      const edit = edits[process.env.PF_BRIEF_SCENE_CONTROL]; assert(edit, 'known in-memory mutation');
      assert.equal(code.split(edit[0]).length, 2, 'one compiled product mutation'); code = code.replace(...edit);
    }
    if (name === 'PS_BattleFlowTest') entryText = code; else plugins[name] = code;
  }
  const vite = require(require.resolve('vite', { paths: [path.join(ROOT, 'src')] }));
  await vite.build({ configFile: false, root: ROOT, logLevel: 'error', build: { outDir: path.join(temp, 'fixture'), minify: false,
    lib: { entry: path.join(ROOT, 'src/plugins/flowtest/music-native-fixture.ts'), formats: ['cjs'], fileName: () => 'entry.cjs' } } });
  fixture = require(path.join(temp, 'fixture/entry.cjs'));
});
test.after(() => { if (temp) fs.rmSync(temp, { recursive: true, force: true }); });
async function open(lang = 'en', fast = false, multiple = false) {
  const h = createVictoryDriverHost({ ROOT, work: temp, plugins, entryText, driverText: 'SYNTHETIC_UNUSED_DRIVER', PLAN, options: { productionTranslator: true } });
  const G = h.G, flow = h.w.flow, content = fixture.musicNativeContent(E, assert), parameters = G.PluginManager.parameters;
  G.Bitmap.prototype.fillRect = () => {}; // Controlled ball raster capability; this suite makes no native pixel claim.
  G.PluginManager.parameters = function (name) { const p = parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...p, language: lang } : p; };
  flow.setLanguage(null); flow.stateReplaced(); flow._app = null; flow._content = content; flow._dex = E.dex.createDexLookup();
  flow.seed = [1, 2, 3, 4]; flow.rng = () => 0; flow.fast = fast;
  G.$gameSystem._psGame = fixture.musicNativeState(E, content, multiple ? 'receiving' : 'normal');
  const before = JSON.stringify(flow.game()); await h.p.toMapId(5, 8, 9);
  flow.openBattle({ kind: 'wild', foes: [{ species: 'Pidgey', level: 3 }], battleId: 'brief-' + path.basename(h.w.root), seq: 1, canLose: true });
  await h.waitFor(() => !!h.p.battle()?._session, 'real brief Session');
  const s = h.p.battle(), paints = [], setLines = s._log.setLines;
  s._log.setLines = function (lines) { paints.push({ text: lines.join(''), at: G.performance.now(), update: s._pictureUpdate }); return setLines.call(this, lines); };
  return { ...h, s, flow, before, paints, cleanup() { if (flow.running) flow.abort(Error('owned brief test cleanup')); s.terminate(); } };
}
for (const lang of ['en', 'zh']) test(lang + ' opening paints a full brief before its own send-out, retains it during animation, and blocks choices', async () => {
  const h = await open(lang); try {
    await h.waitFor(() => h.s.briefMessageState?.()?.phase === 'typing', 'actual opening brief');
    assert.equal(h.s.ordinaryMessageState(), null, 'send-out uses brief rather than ordinary dwell');
    assert(!h.s.children.some(x => x._psPictureRole === 'body' && x._psPictureKey?.startsWith('p1:')), 'player send-out remains hidden while its brief types');
    assert(h.s.pictureState().actors.some(actor => actor.side === 'p2' && actor.body === 1), 'wild foe has already appeared before the player brief');
    assert(!h.s.inputState().ready); assert.equal(h.s._log.pause, false);
    await h.waitFor(() => h.s.briefMessageState()?.phase === 'resident', 'full send-out brief');
    const resident = h.s._residentBrief, fullAt = resident.snapshot().fullyShownAt, full = h.s._log._lines.join('');
    assert(full.length > 0); assert(!h.s.children.some(x => x._psPictureRole === 'body' && x._psPictureKey?.startsWith('p1:')));
    await h.frames(2);
    const playerId = h.s.presentationState().cards.find(card => card.side === 'p1' && card.active).id;
    const playerBody = h.s.children.find(x => x._psPictureRole === 'body' && x._psPictureKey === 'p1:' + playerId);
    assert(playerBody?.visible && playerBody.scale.x > 0 && playerBody.scale.y > 0 && playerBody.opacity > 0,
      'the current player body must actually be painted; the previously shown foe cannot satisfy this');
    assert(h.G.performance.now() - fullAt < 1000, 'animation begins without ordinary one-second dwell');
    assert.equal(h.s._log._lines.join(''), full, 'animation clears marker, not resident text');
    assert.equal(resident.snapshot().waitBeforeNext, false); assert(!h.s.inputState().ready);
    await h.p.inMode('main'); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('real voluntary replacement recalls the old actor before typing and showing the next stable member', async () => {
  const h = await open('en', true, true); try {
    await h.p.inMode('main'); h.flow.fast = false; h.s.enqueueMessages(h.s.briefMessages(['Switching now']));
    await h.waitFor(() => h.s.briefMessageState()?.phase === 'resident', 'resident before recall'); await h.p.inMode('main');
    const resident = h.s._residentBrief, next = h.s._session.party[1].id, result = await h.s._session.chooseSwitch(next);
    assert(result.ok); const started = h.G.performance.now(); h.s.pushMessages(result.messages);
    await h.waitFor(() => h.s.briefMessageState()?.phase === 'typing', 'new member brief after actual recall');
    assert(h.G.performance.now() - started < 1000, 'recall clears the old marker rather than adding another residency wait');
    assert.equal(resident.snapshot().phase, 'done'); assert.equal(resident.snapshot().waitBeforeNext, false);
    assert(h.s.pictureState().actors.filter(actor => actor.side === 'p1').every(actor => actor.body === 0),
      'the recalled zero-scale handle may remain, but no player portrait is visible before the next brief finishes');
    await h.p.inMode('main'); assert(h.s.pictureState().actors.some(actor => actor.side === 'p1' && actor.id === next));
    assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('a resident brief survives other work; its next-message wait starts at replacement and ignores USE/BACK', async () => {
  const h = await open('en', true); try {
    await h.p.inMode('main'); h.flow.fast = false;
    h.s.enqueueMessages(h.s.briefMessages(['Resident message']));
    await h.waitFor(() => h.s.briefMessageState()?.phase === 'resident', 'custom resident brief');
    await h.p.inMode('main'); await h.frames(90);
    const resident = h.s._residentBrief; assert.equal(h.s._log._lines.join(''), 'Resident message');
    h.s.enqueueMessages(['Following message']); await h.frames(1);
    const requested = resident.snapshot().replacementRequestedAt; assert.notEqual(requested, null);
    await h.p.press('ok'); await h.p.press('cancel'); await h.frames(30);
    assert.equal(h.s._log._lines.join(''), 'Resident message'); assert(!h.s.inputState().ready);
    await h.waitFor(() => h.s.ordinaryMessageState?.(), 'next message after residency gate');
    const first = h.paints.find(p => p.at >= requested + 1000 && p.text === '');
    assert(first); assert(h.G.performance.now() - requested >= 1000);
    assert.equal(resident.snapshot().phase, 'done'); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('send-out clearing releases the next message without residency delay', async () => {
  const h = await open('en', true); try {
    await h.p.inMode('main'); h.flow.fast = false;
    h.s.enqueueMessages(h.s.briefMessages(['Retained']));
    await h.waitFor(() => h.s.briefMessageState()?.phase === 'resident', 'retained text'); await h.p.inMode('main');
    const resident = h.s._residentBrief, started = h.G.performance.now();
    h.s.enqueueMessages([h.s.clearBriefFor({ kind: 'visual', advance() { assert.equal(h.s._log._lines.join(''), 'Retained'); return true; }, cancel() {} }), 'New text']);
    await h.waitFor(() => h.s.ordinaryMessageState?.(), 'replacement after cleared marker');
    assert(h.G.performance.now() - started < 1000); assert.equal(resident.snapshot().phase, 'done');
    const shown = h.s._log._lines.join(''); resident.cancel(); assert.equal(h.s._log._lines.join(''), shown, 'old close cannot erase successor');
  } finally { h.cleanup(); }
});
test('an actual display damage step leaves the resident brief waiting marker intact', async () => {
  const h = await open('en', true); try {
    await h.p.inMode('main'); h.flow.fast = false; h.s.enqueueMessages(h.s.briefMessages(['Still resident']));
    await h.waitFor(() => h.s.briefMessageState()?.phase === 'resident', 'resident before damage'); await h.p.inMode('main');
    const card = h.s._display.snapshot().find(c => c.side === 'p1' && c.active), resident = h.s._residentBrief;
    h.s.enqueueMessages(h.s._display.event({ type: '-damage', args: ['p1a: ' + card.id, (card.hp - 1) + '/' + card.maxhp] }));
    await h.p.inMode('main'); assert.equal(resident.snapshot().waitBeforeNext, true);
    assert.equal(h.s._log._lines.join(''), 'Still resident'); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
test('a real capture types the throw brief before the ball and preserves Gotcha throughout its existing ME block', async () => {
  const h = await open('en', true); try {
    await h.p.inMode('main'); h.flow.fast = false;
    const result = await h.s._session.throwBall('masterball'); assert(result.ok); const bag = JSON.stringify(h.s._session.bag);
    h.s.pushMessages(result.messages);
    await h.waitFor(() => h.s.briefMessageState?.()?.phase === 'typing', 'throw brief types');
    assert(!h.s.children.some(x => x._psBallFeedback)); assert(!h.s.inputState().ready);
    await h.waitFor(() => h.s.children.some(x => x._psBallFeedback), 'ball after completed throw text');
    assert.equal(h.s.briefMessageState().phase, 'resident'); assert.equal(h.s.briefMessageState().waitBeforeNext, false);
    assert(h.s._log._lines.join('').includes('Master Ball'));
    await h.waitFor(() => h.s.captureMelodyState()?.started, 'same result Gotcha synchronization');
    assert.equal(h.s._log._lines.join(''), 'Gotcha! Pidgey was caught!');
    assert.equal(JSON.stringify(h.s._session.bag), bag); assert.equal(JSON.stringify(h.flow.game()), h.before);
  } finally { h.cleanup(); }
});
for (const how of ['abort', 'replace', 'terminate']) test(how + ' retires resident text even after its completed step left the controller queue', async () => {
  const h = await open('en', true); try {
    await h.p.inMode('main'); h.flow.fast = false; h.s.enqueueMessages(h.s.briefMessages(['Owned brief']));
    await h.waitFor(() => h.s.briefMessageState()?.phase === 'resident', 'owned resident'); await h.p.inMode('main');
    assert.equal(h.s._queue.length, 0); const resident = h.s._residentBrief;
    if (how === 'abort') h.flow.abort(Error('normal cancellation')); else if (how === 'replace') h.flow.stateReplaced(); else h.s.terminate();
    if (how !== 'terminate') await h.frames(2);
    assert.equal(h.s.briefMessageState(), null); assert.equal(resident.snapshot().phase, 'done');
    const paints = h.paints.length; resident.advance(h.G.performance.now() + 5000); resident.beforeNextMessage().advance(h.G.performance.now() + 6000);
    assert.equal(h.paints.length, paints); assert.equal(JSON.stringify(h.flow.game()), h.before); assert(!h.flow.app().saveBlocked);
  } finally { h.cleanup(); }
});
