/* eslint-disable @typescript-eslint/no-explicit-any */
/** Isolated five-case normal rendering qualification. Never self-qualifies native execution. */
import PLAN from '../../../experiments/step5/4/ball-feedback-native-plan.json';
import { musicNativeContent } from './music-native-fixture';
import { captureHostReady } from './d2-capture-me';
export const ballFeedbackNativePlan = PLAN;

export async function runD2BallFeedback(p: any): Promise<void> {
  const { G, W, api, fs, path, OUT, gameDir, arg, argv, assert, eq, clone, report, results, writeProgress, frames, waitFor, scene, battle, inMode, press, toMapId } = p;
  const E = api(), flow = W.PSFlow, audio = G.AudioManager, hash = (b: any) => p.nodeRequire('crypto').createHash('sha256').update(b).digest('hex');
  const stable = (v: any) => E.contentCompile.canonicalJson(v), fileHash = (f: string) => hash(fs.readFileSync(f));
  assert(OUT && arg('ps-ball-input') && !arg('ps-flow-only') && argv.includes('--ps-sound'), 'whole isolated ball mode with audio');
  const bytes = fs.readFileSync(arg('ps-ball-input')), input = JSON.parse(bytes), info = JSON.parse(fs.readFileSync(path.join(gameDir, 'package-info.json')));
  eq(input.version, PLAN.version, 'ball input'); eq(input.productCommit, PLAN.productCommit, 'fixed ball product'); eq(input.productPlugins, PLAN.productPlugins, 'product plugin identities');
  eq(input.planSHA256, hash(stable(PLAN)), 'bundled frozen plan'); eq(info.gitHead, input.packageHead, 'package head'); eq(info.workingTreeChanges, 0, 'clean package');
  for (const [name, value] of Object.entries(PLAN.productPlugins)) eq(fileHash(path.join(gameDir, 'js/plugins', name + '.js')), value, 'actual product ' + name);
  eq(fileHash(path.join(gameDir, 'js/plugins/PS_BattleFlowTest.js')), input.driverPluginSHA256, 'actual ball driver');
  eq(path.resolve(arg('ps-save-dir')), path.resolve(input.saveRoot), 'isolated save argument'); eq(path.resolve(G.StorageManager.fileDirectoryPath()), path.resolve(input.saveRoot), 'actual isolated storage');
  const rel = path.relative(fs.realpathSync(gameDir), fs.realpathSync(input.saveRoot)); assert(rel === '..' || rel.startsWith('..' + path.sep), 'storage outside APP'); eq(fs.readdirSync(input.saveRoot), [], 'fresh test saves only');
  eq(audio.audioFileExt(), PLAN.nativeExtension, 'MZ native media extension');
  eq(input.assets.map((r: any) => r.path).sort(), [...PLAN.requiredAssets].sort(), 'three exact qualified tones');
  for (const row of input.assets) eq(fileHash(path.join(gameDir, row.path)), row.sha256, 'actual frozen tone');
  const ids = PLAN.groups.flatMap(g => g.ids); eq(ids, ['B01', 'B02', 'B03', 'B04', 'B05'], 'five fixed scenarios');
  const details: any = report.ballFeedbackNative = { version: PLAN.version, inputSHA256: hash(bytes), productCommit: PLAN.productCommit, productPlugins: PLAN.productPlugins, driverPluginSHA256: input.driverPluginSHA256, packageHead: input.packageHead, nativeClaim: 'NOT_SELF_QUALIFIED', expectedIDs: ids, notRunIDs: [...ids], events: [], cases: {}, renders: [], cleanupErrors: [], physicalHearing: 'NOT_VERIFIED' };
  report.hostDriverVersion = PLAN.version;
  let currentCase = '', first = true, ordinal = 0, rng = PLAN.worldSeed, settings: any = {}, active: any = null, violation: string | null = null;
  const observers: any[] = [], named = (n: string) => PLAN.prefix + n, track = (n: string) => ({ name: named(n), volume: 80, pitch: 100, pan: 0 });
  const mark = (kind: string, value: any = {}) => { assert(details.events.length < 100, 'bounded events'); details.events.push({ case: currentCase, kind, frame: G.Graphics.frameCount, at: G.performance.now(), ...value }); };
  const ball = (s: any) => s.children.find((x: any) => x._psBallFeedback), foe = (s: any) => s.children.find((x: any) => x._psPictureRole === 'body' && x._psPictureKey?.startsWith('p2:'));
  const mapReady = () => captureHostReady(G, scene(), 'map'), titleReady = () => captureHostReady(G, scene(), 'title');
  const healthy = () => { if (violation) throw Error(violation); if (active?.scene._failure) throw Error('actual ball Scene failure: ' + active.scene._failure); };
  const wait = (condition: () => boolean, label: string) => waitFor(() => { healthy(); return condition(); }, label);
  const originals = { parameters: G.PluginManager.parameters, update: G.SceneManager.updateScene };
  const parameters = function (this: any, name: string) { const value = originals.parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...value, battleMusic: JSON.stringify(settings) } : value; };
  /** Read actual composed pixels now, not an asynchronous capture taken after the phase is over. */
  const render = (h: any, label: string, sprite: any) => {
    assert(sprite && sprite.visible && sprite.opacity > 0 && sprite.bitmap, 'live private image at ' + label);
    let shown: any, hidden: any; const was = sprite.visible;
    try {
      shown = G.Bitmap.snap(h.scene); sprite.visible = false; hidden = G.Bitmap.snap(h.scene);
      let different = 0;
      for (let y = Math.max(0, Math.floor(sprite.y - 18)); y <= Math.min(shown.height - 1, Math.ceil(sprite.y + 18)); y += 2)
        for (let x = Math.max(0, Math.floor(sprite.x - 18)); x <= Math.min(shown.width - 1, Math.ceil(sprite.x + 18)); x += 2) if (shown.getPixel(x, y) !== hidden.getPixel(x, y)) different++;
      assert(different > 0, 'actual composed ball pixels differ from hidden at ' + label);
      const data = shown.canvas.toDataURL('image/png'), png = p.nodeRequire('buffer').Buffer.from(data.split(',')[1], 'base64');
      const file = path.join(path.dirname(OUT), label + '.png'); fs.writeFileSync(file, png, { flag: 'wx' });
      const row = { case: currentCase, label, file: path.basename(file), sha256: hash(png), differentPixels: different, update: h.scene._pictureUpdate, frame: G.Graphics.frameCount, at: G.performance.now(), pose: { x: sprite.x, y: sprite.y, opacity: sprite.opacity, scale: sprite.scale.x, rotation: sprite.rotation }, state: clone(h.scene.ballFeedbackState()) };
      details.renders.push(row); return row;
    } finally { sprite.visible = was; shown?.destroy(); hidden?.destroy(); }
  };
  const sample = (h: any) => {
    const s = h.scene, state = s.ballFeedbackState(); if (!state) return;
    const image = ball(s), target = foe(s), me = s.captureMelodyState();
    assert(h.rows.length < 1500, 'bounded natural ball ledger');
    h.rows.push({ update: s._pictureUpdate, at: G.performance.now(), frame: G.Graphics.frameCount, phase: state.frame?.phase, progress: state.frame?.phaseProgress, done: state.animationDone, closed: state.closed, cancelled: state.cancelled, hideUpdate: state.hideSampledUpdate, ball: image ? { x: image.x, y: image.y, opacity: image.opacity, scale: image.scale.x } : null, target: target ? { scale: target.scale.x, visible: target.visible } : null, me: me ? { started: me.started, completed: me.completed, start: me.lease?.phaseStartedAt } : null, box: s.presentationState().cards.find((c: any) => c.side === 'p2')?.boxOpacity ?? 1 });
    if (!state.closed && !state.cancelled && !state.animationDone && h.logs.some((r: any) => r.result)) violation ??= 'result before ball animation completed';
    if (state.pending && (hash(stable(flow.game())) !== h.beforeSHA || !h.app.saveBlocked)) violation ??= 'result installed before ball hide completed';
    const choose = (label: string, condition: boolean) => { if (condition && !h.seen.has(label)) { render(h, label, image); h.seen.add(label); } };
    const phase = state.frame?.phase, progress = state.frame?.phaseProgress;
    if (currentCase === 'B01') {
      choose('B01-throw', phase === 'throw' && progress > .25 && progress < .75);
      choose('B01-absorb', phase === 'absorb' && progress > .2 && progress < .8 && !!target && target.scale.x > 0 && target.scale.x < 1);
      choose('B01-retained', state.animationDone && !state.closed && me?.started && !me.completed && !!target && target.scale.x === 0);
      choose('B01-hide', state.hideSampledUpdate >= 0 && !!image && image.opacity > 65 && image.opacity < 190);
    } else choose(currentCase === 'B02' ? 'B02-burst' : currentCase === 'B03' ? 'B03-block' : 'B04-cancel-prefix', currentCase !== 'B05' && phase === (currentCase === 'B02' ? 'burst' : currentCase === 'B03' ? 'block' : 'throw') && progress > .2 && progress < .8);
  };
  const update = function (this: any, ...args: any[]) { const value = originals.update.apply(this, args); if (active && scene() === active.scene) sample(active); return value; };
  let content: any;
  const reset = async (playerLevel = 100) => {
    await wait(() => mapReady() || (first && titleReady()), 'real cold Title or subsequent started Map'); first = false;
    assert(!flow.running && !flow._app?.saveBlocked, 'previous root released');
    flow.stateReplaced(); flow._app = null; flow._content = content; flow._dex = E.dex.createDexLookup(); flow.developerCapabilities = {}; flow.seed = [...PLAN.seed]; rng = PLAN.worldSeed;
    flow.rng = (n: number) => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return Math.floor(rng / 4294967296 * n); };
    flow.fast = true; flow.receiveOptions = { mode: 1, naming: 1 };
    const state = E.state.newGame({ content, party: [], money: 1000, bag: { masterball: 2, pokeball: 2 } });
    state.nextMemberOrdinal = '2'; state.badges.fill(true);
    state.party[0] = E.speciesKey.toPersistentMember(E.memberFactory.createMember({ id: 'BALL-P1', species: 'Snorlax', level: playerLevel }, content, () => 0), content);
    G.$gameSystem._psGame = state; settings = { presets: { battle: named('battle'), capture: named('short') } };
    G.$gameMessage.clear(); G.$gameMap._interpreter.clear(); await toMapId(PLAN.mapId, 8, 9); await wait(mapReady, 'actual Map.start/windows/spriteset'); await press('shift');
    audio.playBgm(track('world'), .25); await wait(() => audio._currentBgm?.name === named('world') && audio._bgmBuffer?.isPlaying(), 'native world output');
  };
  const open = async (kind = 'wild', species = 'Pidgey', level = 3) => {
    const request = { kind, ...(kind === 'trainer' ? { trainer: { id: 'music-normal', version: 1 } } : { foes: [{ species, level }] }), battleId: PLAN.version + '/' + currentCase + '#' + (++ordinal), seq: ordinal, canLose: true };
    flow.openBattle(request); await inMode('main');
    const s = battle(), app = flow.app(), h: any = { scene: s, session: s._session, op: flow._op, app, generation: app.stateGeneration, before: clone(flow.game()), beforeSHA: hash(stable(flow.game())), logs: [], growth: [], rows: [], seen: new Set() };
    const add = s._log.add, wrapper = function (this: any, line: string) { h.logs.push({ line, result: h.resultLines?.includes(line) ?? false, at: G.performance.now(), update: s._pictureUpdate }); return add.call(this, line); };
    const experience = s._display.experience, expWrapper = function (this: any, ...args: any[]) { const step = experience.apply(this, args); if (!step) return step; const advance = step.advance; step.advance = function (this: any, ...a: any[]) { h.growth.push({ at: G.performance.now(), me: clone(s.captureMelodyState()) }); return advance.apply(this, a); }; return step; };
    s._log.add = wrapper; s._display.experience = expWrapper; observers.push({ h, add, wrapper, experience, expWrapper }); active = h; return h;
  };
  const throwBall = async (h: any, name = 'masterball') => {
    let action: any; h.scene.act(async () => { action = await h.session.throwBall(name); const e = action.messages.flatMap((m: any) => m.kind === 'events' ? m.events : []).find((e: any) => e.type === 'rpg' && e.args[0] === 'ball'); assert(e && action.ok, 'real Session publishes submitted ball result'); h.event = clone(e); const lines = h.scene._D.event(e); h.resultLines = e.args[4] === 'blocked' ? lines : lines.slice(1); return action; }, 'ball');
    await wait(() => !!action, 'real Gen8 ball action'); mark('ball-action', { event: h.event }); return action;
  };
  const leave = async (h: any) => { flow.abort(Error('owned ball qualification cancellation'), h.op); G.SceneManager.goto(G.Scene_Map); await wait(mapReady, 'cancelled Map actually started'); G.$gameMessage.clear(); G.$gameMap._interpreter.clear(); active = null; };
  const run = async (id: string, fn: () => Promise<any>) => {
    currentCase = id; const start = G.performance.now(); mark('case-start');
    try { const value = await fn(); healthy(); details.cases[id] = { value, stateSHA256: hash(stable(flow.game())) }; results.push({ id, status: 'pass', ms: G.performance.now() - start }); }
    catch (error) { results.push({ id, status: 'fail', error: String((error as any)?.stack ?? error) }); throw error; }
    finally { details.notRunIDs = ids.filter(id => !results.some((r: any) => r.id === id)); writeProgress(); }
  };
  let failed = false, primary: unknown;
  try {
    G.PluginManager.parameters = parameters; G.SceneManager.updateScene = update;
    content = musicNativeContent(E, assert, { battle: named('battle'), victory: named('battle') }); details.fixtureSHA256 = hash(stable(content));
    await run('B01', async () => {
      await reset(5); const h = await open(); await throwBall(h); eq(h.event.args[4], 'caught', 'actual caught result');
      await wait(() => h.scene.ballFeedbackState()?.closed, 'normal ball hide fully ended');
      assert(h.seen.size === 4, 'all four actual intermediate capture renders');
      const me = h.scene.captureMelodyState(); assert(me.completed && me.lease.stopConfirmed, 'real capture ME stopped before hide');
      assert(h.growth.length && h.growth.every((g: any) => g.me?.completed && g.at >= me.lease.phaseStartedAt + PLAN.waitMs), 'actual growth after full ME wait');
      const hide = h.rows.filter((r: any) => r.hideUpdate >= 0); assert(hide.length > 2 && hide.at(-1).at - hide[0].at >= PLAN.hideMs, 'actual full one-second hide');
      assert(!ball(h.scene) && !foe(h.scene), 'captured private ball and target gone'); await inMode('end');
      eq(flow.game(), h.before, 'working capture not yet installed'); h.scene.onEnd();
      await wait(() => mapReady() && !flow.running && !h.app.saveBlocked, 'normal capture root committed and Map started');
      assert(flow.lastOutcome.commit === 'applied' && flow.game().party.length === h.before.party.length + 1, 'normal capture installed once'); active = null;
      return { event: h.event, rows: h.rows, logs: h.logs, growth: h.growth, result: clone(flow.lastOutcome) };
    });
    for (const [id, kind, species, level, name, outcome] of [['B02', 'wild', 'Snorlax', 100, 'pokeball', 'escaped'], ['B03', 'trainer', 'Pidgey', 3, 'masterball', 'blocked']] as const) await run(id, async () => {
      await reset(); const h = await open(kind, species, level); await throwBall(h, name); eq(h.event.args[4], outcome, 'actual ordinary negative result');
      await wait(() => h.scene.ballFeedbackState()?.animationDone, 'negative ball animation ended'); assert(h.seen.size === 1, 'real intermediate negative render');
      assert(!ball(h.scene) && foe(h.scene)?.scale.x === 1, 'negative ball released and foe restored');
      if (id === 'B03') assert(h.rows.every((r: any) => !r.target || r.target.scale === 1), 'blocking never absorbs foe');
      assert(!h.scene.captureMelodyState() && !h.session.finished, 'no capture ME or capture terminal'); await inMode('main'); eq(flow.game(), h.before, 'no negative persistent result'); await leave(h); return { event: h.event, rows: h.rows, logs: h.logs };
    });
    await run('B04', async () => {
      await reset(); const h = await open(); await throwBall(h); await wait(() => h.seen.has('B04-cancel-prefix'), 'actual mid-throw image');
      const sprite = ball(h.scene), bitmap = sprite.bitmap; await leave(h); assert(sprite.destroyed && bitmap.baseTexture === null, 'own private ball fully released');
      eq(flow.game(), h.before, 'mid-throw abort never installs capture'); assert(h.scene.ballFeedbackState().cancelled, 'stage cancelled'); h.scene.updateQueue(); await frames(2); assert(!h.logs.some((r: any) => r.result), 'late old result not published'); return { event: h.event, rows: h.rows };
    });
    await run('B05', async () => {
      await reset(); const h = await open(); await throwBall(h); await wait(() => h.scene.ballFeedbackState()?.hideSampledUpdate >= 0 && ball(h.scene)?.opacity < 190 && ball(h.scene)?.opacity > 65, 'normal mid-hide replacement');
      const sprite = ball(h.scene), bitmap = sprite.bitmap; flow.stateReplaced();
      assert(sprite.destroyed && bitmap.baseTexture === null && h.scene.ballFeedbackState().cancelled && !h.app.saveBlocked, 'replacement immediately retires own hidden capture');
      G.SceneManager.goto(G.Scene_Map); await wait(mapReady, 'replacement Map started'); h.scene.updateQueue(); await frames(2); eq(flow.game(), h.before, 'replaced working capture never installed'); active = null; return { event: h.event, rows: h.rows };
    });
    eq(results.map((r: any) => [r.id, r.status]), ids.map(id => [id, 'pass']), 'single whole five-case pass');
    eq(details.renders.map((r: any) => r.label).sort(), [...PLAN.renderStages].sort(), 'all seven key stage pixel witnesses');
  } catch (error) { failed = true; primary = error; throw error; }
  finally {
    details.primaryError = failed ? String(primary) : null;
    const clean = (name: string, fn: () => void) => { try { fn(); } catch (error) { details.cleanupErrors.push({ name, error: String(error) }); } };
    if (active && flow._op === active.op && flow._app === active.app && active.app.stateGeneration === active.generation && !active.app.pendingEvolution && !active.app.pendingReceiving && !active.app.pendingPokedex) clean('own root', () => flow.abort(Error('ball driver failure cleanup'), active.op));
    for (const r of observers) clean('restore own Scene observers', () => { if (r.h.scene._log.add === r.wrapper) r.h.scene._log.add = r.add; if (r.h.scene._display.experience === r.expWrapper) r.h.scene._display.experience = r.experience; });
    clean('restore parameters', () => { if (G.PluginManager.parameters === parameters) G.PluginManager.parameters = originals.parameters; });
    clean('restore Scene observer', () => { if (G.SceneManager.updateScene === update) G.SceneManager.updateScene = originals.update; });
    details.remainingRootLocked = !!flow._app?.saveBlocked; details.cleanupComplete = details.cleanupErrors.length === 0; writeProgress();
    if (!failed && details.cleanupErrors.length) throw Error('ball driver cleanup failed');
  }
}
