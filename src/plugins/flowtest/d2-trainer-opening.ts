/* eslint-disable @typescript-eslint/no-explicit-any */
// Test-only ordinary opening. External supervision qualifies native execution.
import PLAN from '../../../experiments/step5/4/trainer-opening-native-plan.json';
import { musicNativeContent, musicNativeState } from './music-native-fixture';
import { captureHostReady } from './d2-capture-me';
export const trainerOpeningNativePlan = PLAN;

export async function runD2TrainerOpening(p: any): Promise<void> {
  const { G, W, api, fs, path, OUT, gameDir, arg, argv, assert, eq, clone, report, results, writeProgress, frames, waitFor, scene, battle, inMode, press, toMapId } = p;
  const E = api(), flow = W.PSFlow, hash = (b: any) => p.nodeRequire('crypto').createHash('sha256').update(b).digest('hex');
  const stable = (v: any) => E.contentCompile.canonicalJson(v), fileHash = (f: string) => hash(fs.readFileSync(f));
  assert(OUT && arg('ps-opening-input') && !arg('ps-flow-only') && argv.includes('--ps-sound'), 'whole isolated opening mode');
  const bytes = fs.readFileSync(arg('ps-opening-input')), input = JSON.parse(bytes), info = JSON.parse(fs.readFileSync(path.join(gameDir, 'package-info.json')));
  eq(input.version, PLAN.version, 'opening input'); eq(input.productCommit, PLAN.productCommit, 'fixed opening product'); eq(input.productRuntime, PLAN.productRuntime, 'product runtime identities');
  eq(input.planSHA256, hash(stable(PLAN)), 'frozen opening plan'); eq(info.gitHead, input.packageHead, 'package head'); eq(info.workingTreeChanges, 0, 'clean package');
  for (const [name, value] of Object.entries(PLAN.productRuntime)) eq(fileHash(path.join(gameDir, name)), value, 'actual opening product ' + name);
  eq(fileHash(path.join(gameDir, 'js/plugins/PS_BattleFlowTest.js')), input.driverPluginSHA256, 'actual opening driver');
  eq(path.resolve(arg('ps-save-dir')), path.resolve(input.saveRoot), 'isolated save argument'); eq(path.resolve(G.StorageManager.fileDirectoryPath()), path.resolve(input.saveRoot), 'actual storage');
  const rel = path.relative(fs.realpathSync(gameDir), fs.realpathSync(input.saveRoot)); assert(rel === '..' || rel.startsWith('..' + path.sep), 'storage outside APP'); eq(fs.readdirSync(input.saveRoot), [], 'fresh storage');
  eq(input.assets.map((r: any) => r.path).sort(), [...PLAN.requiredAssets].sort(), 'qualified media set');
  for (const r of input.assets) eq(fileHash(path.join(gameDir, r.path)), r.sha256, 'actual media');
  const ids = PLAN.cases.map(c => c.id), d: any = report.trainerOpeningNative = { version: PLAN.version, inputSHA256: hash(bytes), productCommit: PLAN.productCommit, productRuntime: PLAN.productRuntime, driverPluginSHA256: input.driverPluginSHA256, packageHead: input.packageHead, nativeClaim: 'NOT_SELF_QUALIFIED', expectedIDs: ids, notRunIDs: [...ids], cases: {}, renders: [], cleanupErrors: [], physicalInput: 'NOT_VERIFIED' };
  report.hostDriverVersion = PLAN.version;
  let first = true, language = 'en', active: any = null, ordinal = 0, rng = PLAN.worldSeed;
  const original = { parameters: G.PluginManager.parameters, language: flow.lang, fast: flow.fast, start: G.Scene_PSBattle.prototype.start };
  const named = (name: string) => PLAN.prefix + name;
  const parameters = function (this: any, name: string) { const v = original.parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...v, language, battleMusic: JSON.stringify({ presets: { battle: named('battle'), victory: named('victory') } }) } : v; };
  const bodies = (s: any) => s.children.filter((x: any) => x._psPictureRole === 'body');
  const hidden = (s: any) => bodies(s).every((x: any) => !x.visible || x.opacity === 0 || x.scale.x === 0 || x.scale.y === 0);
  const latest = (s: any) => s._log._lines.at(-1);
  const mapReady = () => captureHostReady(G, scene(), 'map'), titleReady = () => captureHostReady(G, scene(), 'title');
  const wait = (cond: () => boolean, label: string) => waitFor(() => { if (active?.scene?._failure && !active.controlledAbort) throw Error('actual opening Scene failure: ' + active.scene._failure); return cond(); }, label);
  const retire = (h: any) => {
    const desc = Object.getOwnPropertyDescriptor(h.system, '_psGame');
    if (desc?.get === h.get && desc?.set === h.set) Object.defineProperty(h.system, '_psGame', { ...h.descriptor, value: h.value });
    if (h.scene?.update === h.observeUpdate) h.scene.update = h.update;
    if (h.scene?._log.add === h.observeAdd) h.scene._log.add = h.add;
  };
  const start = function (this: any, ...args: any[]) {
    const h = active;
    if (h && this._psOp === flow._op) {
      h.scene = this; h.op = this._psOp; h.app = flow.app(); h.generation = h.app.stateGeneration;
      h.add = this._log.add; h.observeAdd = function (this: any, line: string) { const result = h.add.call(this, line); h.lines.push({ line, frame: G.Graphics.frameCount, at: G.performance.now() }); return result; }; this._log.add = h.observeAdd;
      h.update = this.update; h.observeUpdate = function (this: any, ...a: any[]) { const result = h.update.apply(this, a); h.updates.push({ frame: G.Graphics.frameCount, at: G.performance.now(), pause: !!this._log.pause, last: latest(this), hidden: hidden(this), ready: this.inputState().ready }); return result; }; this.update = h.observeUpdate;
    }
    return original.start.apply(this, args);
  };
  const render = (h: any, id: string) => {
    const log = h.scene._log, arrow = log._pauseSignSprite;
    assert(log.visible && log.openness !== 0 && log.pause && arrow?.visible && arrow.alpha > .5, 'visible paused window and actual arrow');
    assert(hidden(h.scene), 'both pending first portraits hidden');
    let shown: any, noArrow: any, noLog: any; const visible = log.visible, arrowVisible = arrow.visible;
    try {
      shown = G.Bitmap.snap(h.scene); arrow.visible = false; noArrow = G.Bitmap.snap(h.scene); arrow.visible = arrowVisible; log.visible = false; noLog = G.Bitmap.snap(h.scene);
      let textPixels = 0, arrowPixels = 0;
      for (let y = 120; y < Math.min(shown.height, 420); y += 2) for (let x = 0; x < Math.min(shown.width, 816); x += 2) {
        if (shown.getPixel(x, y) !== noLog.getPixel(x, y)) textPixels++;
        if (shown.getPixel(x, y) !== noArrow.getPixel(x, y)) arrowPixels++;
      }
      assert(textPixels > 0 && arrowPixels > 0, 'actual text window and arrow composed pixels');
      const png = p.nodeRequire('buffer').Buffer.from(shown.canvas.toDataURL('image/png').split(',')[1], 'base64'), file = path.join(path.dirname(OUT), id + '.png'); fs.writeFileSync(file, png, { flag: 'wx' });
      const row = { id, file: path.basename(file), sha256: hash(png), textPixels, arrowPixels, lines: [...log._lines], arrow: { visible: arrowVisible, alpha: arrow.alpha }, frame: G.Graphics.frameCount, at: G.performance.now(), language, hiddenFirstPortraits: hidden(h.scene), installs: h.installs.length, stateSHA256: hash(stable(flow.game())) };
      d.renders.push(row); return row;
    } finally { arrow.visible = arrowVisible; log.visible = visible; shown?.destroy(); noArrow?.destroy(); noLog?.destroy(); }
  };
  const run = async (c: any) => {
    const began = G.performance.now();
    try {
      await wait(() => mapReady() || first && titleReady(), 'started cold Title or later Map'); first = false;
      assert(!flow.running && !flow._app?.saveBlocked, 'prior root released');
      flow.stateReplaced(); flow._app = null; language = c.language; flow.setLanguage(null);
      const content = musicNativeContent(E, assert, { battle: named('battle'), victory: named('trainer-victory') });
      content.trainerTypes['music-type-normal'].openingText = c.openingText; content.trainerTypes['music-type-normal'].introBgm = '';
      content.trainers['music-normal'][0].name = c.name;
      flow._content = content; flow._dex = E.dex.createDexLookup(); flow.developerCapabilities = {}; flow.seed = [...PLAN.seed]; rng = PLAN.worldSeed;
      flow.rng = (n: number) => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return Math.floor(rng / 4294967296 * n); }; flow.fast = false;
      G.$gameSystem._psGame = musicNativeState(E, content); G.$gameMessage.clear(); G.$gameMap._interpreter.clear();
      await toMapId(PLAN.mapId, 8, 9); await wait(mapReady, 'actual Map.start/windows/spriteset'); await press('shift');
      G.AudioManager.playBgm({ name: named('world'), volume: 80, pitch: 100, pan: 0 });
      const system = G.$gameSystem, descriptor: any = Object.getOwnPropertyDescriptor(system, '_psGame'); assert(descriptor?.configurable && descriptor.writable && 'value' in descriptor, 'observable plain state property');
      const h: any = active = { system, descriptor, value: descriptor.value, installs: [], before: clone(flow.game()), lines: [], updates: [] };
      h.get = () => h.value; h.set = (value: any) => { h.installs.push({ at: G.performance.now(), frame: G.Graphics.frameCount }); h.value = value; }; Object.defineProperty(system, '_psGame', { configurable: true, enumerable: descriptor.enumerable, get: h.get, set: h.set });
      flow.openBattle({ kind: 'trainer', trainer: { id: 'music-normal', version: 1 }, battleId: PLAN.version + '/' + c.id, seq: ++ordinal, canLose: true });
      const messages = [c.challenge, ...(c.openingText && c.advance !== 'abort' ? [c.openingText] : [])];
      for (const [index, text] of messages.entries()) {
        await wait(() => !!h.scene?._log.pause && latest(h.scene) === text, 'actual opening pause ' + c.id + '/' + index);
        assert(h.scene._session === h.op.session && h.app.saveBlocked && !h.scene.inputState().ready && !h.scene._menu.visible, 'real App/Session pause locks command selection');
        eq(flow.translator().lang, c.language, 'production language'); eq(h.installs.length, 0, 'zero state writes during opening'); eq(flow.game(), h.before, 'whole state unchanged');
        const at = h.lines.find((r: any) => r.line === text).at;
        await wait(() => G.performance.now() - at >= 1000, 'natural one second dwell');
        assert(G.performance.now() - at < 3000 && h.scene._log.pause && latest(h.scene) === text && hidden(h.scene), 'normal opening retained before three seconds');
        await wait(() => h.scene._log._pauseSignSprite?.visible && h.scene._log._pauseSignSprite.alpha > .5, 'natural continuation arrow');
        render(h, c.id + (index === 0 ? '-challenge' : '-author'));
        if (c.advance === 'abort') break;
        if (c.advance === 'input') await press(index ? 'cancel' : 'ok');
        else await wait(() => !h.scene._log.pause || latest(h.scene) !== text, 'natural three second completion');
        const ended = h.updates.find((r: any) => r.at >= at && (r.last !== text || !r.pause));
        assert(ended, 'pause departure observed');
        if (c.advance === 'auto') assert(ended.at - at >= 3000, 'no auto completion before three seconds');
        else assert(ended.at - at < 3000, 'confirmation actually closes before automatic timeout');
      }
      if (c.advance !== 'abort') {
        await inMode('main'); assert(bodies(h.scene).length === 2 && bodies(h.scene).every((x: any) => x.visible && x.scale.x === 1), 'both portraits appear after ordinary send-outs');
        eq(h.lines.slice(0, messages.length).map((r: any) => r.line), messages, 'challenge then author then send-out order');
        assert(h.scene.inputState().ready && !h.scene._log.pause, 'main input only after opening and send-outs');
      }
      const pauses = h.updates.filter((r: any) => r.pause && messages.includes(r.last)); assert(pauses.length > 10 && pauses.every((r: any) => r.hidden && !r.ready), 'every sampled paused update hides portraits and command input');
      eq(flow.game(), h.before, 'no premature persistent mutation'); eq(h.installs.length, 0, 'no premature state installation');
      h.controlledAbort = true; flow.abort(Error('owned opening qualification cancellation'), h.op); await inMode('end'); assert(!h.scene._log.pause, 'owned cancel retires continuation arrow');
      h.scene.onEnd(); await wait(() => mapReady() && !flow.running && !h.app.saveBlocked, 'cancel returns to started Map and releases save lock');
      eq(flow.game(), h.before, 'cancel preserves persistent state'); eq(h.installs.length, 0, 'cancel does not install state');
      if (c.advance === 'abort') assert(!h.lines.some((r: any) => r.line === c.openingText), 'cancel never emits late author line');
      d.cases[c.id] = { language, fixtureSHA256: hash(stable(content)), advance: c.advance, lines: h.lines, updates: h.updates, pausedUpdates: pauses.length, installs: h.installs, beforeSHA256: hash(stable(h.before)), afterSHA256: hash(stable(flow.game())), returnedToMap: true };
      retire(h); active = null; results.push({ id: c.id, status: 'pass', ms: G.performance.now() - began });
    } catch (error) { results.push({ id: c.id, status: 'fail', error: String((error as any)?.stack ?? error) }); throw error; }
    finally { d.notRunIDs = ids.filter(id => !results.some((r: any) => r.id === id)); writeProgress(); }
  };
  let failed = false, primary: unknown;
  try { G.PluginManager.parameters = parameters; G.Scene_PSBattle.prototype.start = start; for (const c of PLAN.cases) await run(c); eq(results.map((r: any) => [r.id, r.status]), ids.map(id => [id, 'pass']), 'four fixed normal paths'); }
  catch (error) { failed = true; primary = error; throw error; }
  finally {
    d.primaryError = failed ? String(primary) : null;
    const clean = (name: string, fn: () => void) => { try { fn(); } catch (error) { d.cleanupErrors.push({ name, error: String(error) }); } };
    if (active && flow._op === active.op && flow._app === active.app && active.app.stateGeneration === active.generation) clean('own root', () => flow.abort(Error('opening qualification failure cleanup'), active.op));
    if (active) clean('owned observers', () => retire(active));
    clean('parameters', () => { if (G.PluginManager.parameters === parameters) G.PluginManager.parameters = original.parameters; });
    clean('start observer', () => { if (G.Scene_PSBattle.prototype.start === start) G.Scene_PSBattle.prototype.start = original.start; });
    clean('language/fast', () => { flow.setLanguage(original.language); flow.fast = original.fast; });
    d.remainingRootLocked = !!flow._app?.saveBlocked; d.cleanupComplete = d.cleanupErrors.length === 0; writeProgress();
    if (!failed && d.cleanupErrors.length) throw Error('opening driver cleanup failed');
  }
}
