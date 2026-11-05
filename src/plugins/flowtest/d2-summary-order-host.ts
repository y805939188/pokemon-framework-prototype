/* eslint-disable @typescript-eslint/no-explicit-any */
import PLAN from '../../../experiments/step5/4/summary-order-native-plan.json';
import { exerciseBattleSummaryOrder } from './d2-summary-order';
import { musicNativeContent, musicNativeState } from './music-native-fixture';
import { captureHostReady } from './d2-capture-me';
export const summaryOrderHostPlan = PLAN;

/** Same-update main/control Bitmap evidence. Preserve both PNGs before checking the pixel gate. */
export function captureSummaryOrderWindow(p: any, row: any): any {
  const { G, fs, path, OUT, assert } = p, win = row.window;
  const hash = (value: any) => p.nodeRequire('crypto').createHash('sha256').update(value).digest('hex');
  assert(win.visible && win.openness !== 0 && win.contents && win.renderable !== false, 'actual visible Summary window');
  const layer = win.parent === row.scene._windowLayer ? row.scene._windowLayer : { x: 0, y: 0 };
  const rawX = win.x + (layer.x ?? 0), rawY = win.y + (layer.y ?? 0), renderable = win.renderable;
  let shown: any, hidden: any, saved: any;
  try {
    shown = G.Bitmap.snap(row.scene); win.renderable = false; hidden = G.Bitmap.snap(row.scene);
    assert(shown.width === hidden.width && shown.height === hidden.height, 'same-update snapshot dimensions');
    const x = Math.max(0, Math.ceil(rawX)), y = Math.max(0, Math.ceil(rawY));
    const right = Math.min(shown.width, Math.floor(rawX + win.width)), bottom = Math.min(shown.height, Math.floor(rawY + win.height));
    assert(right > x && bottom > y, 'nonempty clipped actual Summary rectangle');
    const rect = { x, y, width: right - x, height: bottom - y }, arrays = [shown, hidden].map(b => b.context.getImageData(0, 0, b.width, b.height).data);
    let cells = 0, changed = 0;
    for (let yy = y; yy < bottom; yy += 4) for (let xx = x; xx < right; xx += 4) {
      cells++; const at = (yy * shown.width + xx) * 4;
      if ([0, 1, 2].some(channel => arrays[0][at + channel] !== arrays[1][at + channel])) changed++;
    }
    const images = [shown, hidden].map((b, i) => {
      const file = row.id + '-' + row.stage + (i ? '-no-summary' : '') + '.png';
      const bytes = p.nodeRequire('buffer').Buffer.from(b.canvas.toDataURL('image/png').split(',')[1], 'base64');
      fs.writeFileSync(path.join(path.dirname(OUT), file), bytes, { flag: 'wx' }); return { file, sha256: hash(bytes) };
    });
    saved = { id: row.id, stage: row.stage, language: row.language, ...images[0], comparisonPNG: images[1],
      screen: [shown.width, shown.height], frame: row.frame, at: G.performance.now(), cells, changed,
      pixelGate: changed > 0 ? 'pass' : 'fail', sampling: { version: 'summary-window-rgb-v1', rect, stride: 4, channels: 'RGB', cleanup: false },
      view: row.view, text: [...row.view.text], moves: row.moves };
    p.record(saved); assert(changed > 0, 'actual Summary raster differs from hidden control'); return saved;
  } finally {
    win.renderable = renderable; shown?.destroy(); hidden?.destroy();
    if (saved) { saved.sampling.cleanup = win.renderable === renderable; p.writeProgress(); }
  }
}

/** One isolated producer, two ordered normal Scene cases; no native process is started here. */
export async function runD2SummaryOrder(p: any): Promise<void> {
  const { G, W, fs, path, OUT, gameDir, arg, argv, assert, eq, clone, report, results, writeProgress, frames, waitFor, scene, battle, inMode, press, toMapId } = p;
  const E = p.api(), flow = W.PSFlow, hash = (v: any) => p.nodeRequire('crypto').createHash('sha256').update(v).digest('hex');
  const stable = (v: any) => E.contentCompile.canonicalJson(v), fileHash = (name: string) => hash(fs.readFileSync(path.join(gameDir, name)));
  assert(OUT && arg('ps-summary-order-input') && !arg('ps-flow-only') && argv.includes('--ps-sound'), 'whole isolated Summary mode');
  const bytes = fs.readFileSync(arg('ps-summary-order-input')), input = JSON.parse(bytes), info = JSON.parse(fs.readFileSync(path.join(gameDir, 'package-info.json')));
  eq(input.version, PLAN.version, 'Summary plan version'); eq(input.productCommit, PLAN.productCommit, 'accepted product identity');
  eq(input.productRuntime, PLAN.productRuntime, 'exact runtime binding'); eq(input.planSHA256, hash(stable(PLAN)), 'frozen bundled plan');
  eq(info.gitHead, input.packageHead, 'actual package head'); eq(info.workingTreeChanges, 0, 'clean fixed package');
  for (const [name, digest] of Object.entries(PLAN.productRuntime)) eq(fileHash(name), digest, 'actual product ' + name);
  eq(fileHash('js/plugins/PS_BattleFlowTest.js'), input.driverPluginSHA256, 'actual driver');
  for (const [key, names] of [['worldFiles', PLAN.worldFiles], ['fontFiles', PLAN.fontResourcePaths]] as const) {
    eq(Object.keys(input[key]).sort(), [...names].sort(), 'exact ' + key); for (const name of names) eq(fileHash(name), input[key][name], 'actual ' + name);
  }
  eq(path.resolve(arg('ps-save-dir')), path.resolve(input.saveRoot), 'isolated save argument');
  eq(path.resolve(G.StorageManager.fileDirectoryPath()), path.resolve(input.saveRoot), 'actual isolated storage');
  const rel = path.relative(fs.realpathSync(gameDir), fs.realpathSync(input.saveRoot)); assert(rel === '..' || rel.startsWith('..' + path.sep), 'save root outside package');
  eq(fs.readdirSync(input.saveRoot), [], 'new empty isolated save root');
  const ids = PLAN.cases.map(c => c.id); eq(ids, ['SS01', 'SS02'], 'two ordered cases');
  const d: any = report.summaryOrderNative = { version: PLAN.version, productCommit: PLAN.productCommit, productRuntime: PLAN.productRuntime,
    packageHead: input.packageHead, driverPluginSHA256: input.driverPluginSHA256, inputSHA256: hash(bytes), expectedIDs: ids, notRunIDs: [...ids],
    nativeClaim: 'NOT_SELF_QUALIFIED', cases: {}, renders: [], cleanupErrors: [], physicalInput: 'NOT_VERIFIED', nativeHearing: 'NOT_VERIFIED' };
  report.hostDriverVersion = PLAN.version;
  const original = { parameters: G.PluginManager.parameters, language: flow.lang, fast: flow.fast };
  let language = 'en', first = true, active: any = null, failed = false, primary: unknown;
  const parameters = function (this: any, name: string) { const raw = original.parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...raw, language } : raw; };
  G.PluginManager.parameters = parameters;
  const mapReady = () => captureHostReady(G, scene(), 'map');
  const wait = (fn: () => boolean, label: string) => waitFor(() => { if (active?.scene?._failure) throw Error('actual Summary Scene failure: ' + active.scene._failure); return fn(); }, label);
  try {
    for (const c of PLAN.cases) {
      const began = G.performance.now();
      try {
        await wait(() => mapReady() || first && captureHostReady(G, scene(), 'title'), 'cold started Title or subsequent Map'); first = false;
        assert(!flow.running && !flow._app?.saveBlocked && !W.PSManagement.current(), 'previous owned root released');
        G.DataManager.setupNewGame(); flow.stateReplaced(); flow._app = null; language = c.language; flow.setLanguage(null);
        const content = musicNativeContent(E, assert); content.species.Snorlax.learnset = { 1: ['Splash'] };
        flow._content = content; flow._dex = E.dex.createDexLookup(); flow.seed = [...PLAN.seed]; flow.rng = () => 0; flow.fast = false;
        const state = musicNativeState(E, content); state.party = state.party.slice(0, 1); state.party[0].moves = clone(PLAN.moves); state.nextMemberOrdinal = '2'; G.$gameSystem._psGame = state;
        G.$gameMessage.clear(); G.$gameMap._interpreter.clear(); await toMapId(PLAN.mapId, 8, 9); await wait(mapReady, 'Map actually started with message window and spriteset'); await press('shift');
        const app = flow.app(); flow.openBattle({ kind: 'wild', foes: [{ species: PLAN.foe.species, level: PLAN.foe.level }], battleId: PLAN.version + '/' + c.id, seq: ids.indexOf(c.id) + 1, canLose: true, expGain: false });
        active = { app, generation: app.stateGeneration, op: flow._op, scene: null }; await inMode('main'); active.scene = battle();
        const checks: any[] = [], session = active.scene._session; let pendingState: any = null;
        const recordEq = (a: any, b: any, label: string) => {
          eq(a, b, label);
          if (label === 'whole state unchanged before final confirmation') pendingState = { frame: G.Graphics.frameCount, at: G.performance.now(), stateSHA256: hash(stable(flow.game())) };
          if (label === 'no early state installation') { assert(pendingState, 'state check before counter check'); checks.push({ ...pendingState, label: 'before-confirmation', installs: a }); pendingState = null; }
          if (label === 'single final state installation') checks.push({ label: 'after-confirmation', frame: G.Graphics.frameCount, at: G.performance.now(), installs: a, stateSHA256: hash(stable(flow.game())) });
        };
        const row = await exerciseBattleSummaryOrder({ ...p, eq: recordEq, evidence: (view: any) => captureSummaryOrderWindow({ ...p, record: (image: any) => { d.renders.push(image); writeProgress(); } }, view) }, c);
        await wait(() => mapReady() && !app.saveBlocked && !flow.operationPending(), 'normal finished Map and root release');
        const result = session.result(); d.cases[c.id] = { ...row, beforeSHA256: hash(stable(row.before)), afterSHA256: hash(stable(row.after)),
          battleId: result.battleId, result, resultSHA256: E.state.resultHash(result), outcome: clone(flow.lastOutcome), checks };
        active = null; results.push({ id: c.id, status: 'pass', ms: G.performance.now() - began }); d.notRunIDs = ids.filter(id => !results.some((r: any) => r.id === id)); writeProgress();
      } catch (e) { results.push({ id: c.id, status: 'fail', error: String(e) }); d.notRunIDs = ids.filter(id => !results.some((r: any) => r.id === id)); writeProgress(); throw e; }
    }
  } catch (e) { failed = true; primary = e; throw e; }
  finally {
    d.primaryError = failed ? String(primary) : null;
    const clean = (name: string, f: () => void) => { try { f(); } catch (e) { d.cleanupErrors.push({ name, error: String(e) }); } };
    if (active && flow._op === active.op && flow._app === active.app && active.app.stateGeneration === active.generation && flow.running) clean('owned root', () => flow.abort(Error('Summary native failure cleanup'), active.op));
    clean('parameters', () => { if (G.PluginManager.parameters === parameters) G.PluginManager.parameters = original.parameters; });
    clean('language', () => flow.setLanguage(original.language)); flow.fast = original.fast;
    d.remainingRootLocked = !!flow._app?.saveBlocked; d.cleanupComplete = d.cleanupErrors.length === 0; writeProgress();
    if (!failed && d.cleanupErrors.length) throw Error('Summary native cleanup failed');
  }
}
