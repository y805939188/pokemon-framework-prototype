/* eslint-disable @typescript-eslint/no-explicit-any */
// Test-only finite recipe. A report never establishes native execution by itself.
import PLAN from '../../../experiments/step5/4/move-menu-native-plan.json';
import { musicNativeContent, musicNativeState } from './music-native-fixture';
import { captureHostReady } from './d2-capture-me';
export const moveMenuNativePlan = PLAN;

export async function runD2MoveMenu(p: any): Promise<void> {
  const { G, W, api, fs, path, OUT, gameDir, arg, argv, assert, eq, clone, report, results, writeProgress, frames, waitFor, scene, battle, inMode, press, toMapId } = p;
  const E = api(), flow = W.PSFlow;
  const hash = (v: any) => p.nodeRequire('crypto').createHash('sha256').update(v).digest('hex');
  const stable = (v: any) => E.contentCompile.canonicalJson(v), fileHash = (f: string) => hash(fs.readFileSync(f));
  assert(OUT && arg('ps-move-menu-input') && !arg('ps-flow-only') && argv.includes('--ps-sound'), 'whole isolated move-menu mode');
  const bytes = fs.readFileSync(arg('ps-move-menu-input')), input = JSON.parse(bytes), info = JSON.parse(fs.readFileSync(path.join(gameDir, 'package-info.json')));
  eq(input.version, PLAN.version, 'move input'); eq(input.productCommit, PLAN.productCommit, 'fixed move product'); eq(input.productRuntime, PLAN.productRuntime, 'runtime identities');
  eq(input.planSHA256, hash(stable(PLAN)), 'frozen move plan'); eq(info.gitHead, input.packageHead, 'package head'); eq(info.workingTreeChanges, 0, 'clean package');
  for (const [rel, h] of Object.entries(PLAN.productRuntime)) eq(fileHash(path.join(gameDir, rel)), h, 'actual move product ' + rel);
  eq(fileHash(path.join(gameDir, 'js/plugins/PS_BattleFlowTest.js')), input.driverPluginSHA256, 'actual move driver');
  for (const [key, paths] of [['worldFiles', PLAN.worldFiles], ['fontFiles', PLAN.fontResourcePaths]] as const) {
    eq(Object.keys(input[key]).sort(), [...paths].sort(), 'frozen ' + key);
    for (const [rel, h] of Object.entries(input[key])) eq(fileHash(path.join(gameDir, rel)), h, 'actual ' + key + ' ' + rel);
  }
  eq(input.assets.map((r: any) => r.path).sort(), [...PLAN.requiredAssets].sort(), 'qualified media set');
  for (const r of input.assets) eq(fileHash(path.join(gameDir, r.path)), r.sha256, 'actual media');
  eq(path.resolve(arg('ps-save-dir')), path.resolve(input.saveRoot), 'isolated save argument'); eq(path.resolve(G.StorageManager.fileDirectoryPath()), path.resolve(input.saveRoot), 'actual storage');
  const storageRel = path.relative(fs.realpathSync(gameDir), fs.realpathSync(input.saveRoot)); assert(storageRel === '..' || storageRel.startsWith('..' + path.sep), 'storage outside APP'); eq(fs.readdirSync(input.saveRoot), [], 'fresh storage');
  const ids = PLAN.cases.map(c => c.id); eq(ids, ['MM01', 'MM02'], 'two ordered cases');
  const d: any = report.moveMenuNative = { version: PLAN.version, productCommit: PLAN.productCommit, productRuntime: PLAN.productRuntime, packageHead: input.packageHead, driverPluginSHA256: input.driverPluginSHA256, inputSHA256: hash(bytes), expectedIDs: ids, notRunIDs: [...ids], nativeClaim: 'NOT_SELF_QUALIFIED', cases: {}, renders: [], cleanupErrors: [], physicalInput: 'NOT_VERIFIED' };
  report.hostDriverVersion = PLAN.version;
  const original = { parameters: G.PluginManager.parameters, language: flow.lang, fast: flow.fast, update: G.Scene_PSBattle.prototype.update };
  let first = true, language = 'en', active: any = null, rng = PLAN.worldSeed;
  const named = (n: string) => PLAN.prefix + n;
  const parameters = function (this: any, name: string) { const v = original.parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...v, language, battleMusic: JSON.stringify({ presets: { battle: named('battle'), victory: named('victory') } }) } : v; };
  const mapReady = () => captureHostReady(G, scene(), 'map'), titleReady = () => captureHostReady(G, scene(), 'title');
  const unchanged = (h: any) => {
    if (!h || h.retired) return;
    if (h.observerError) throw h.observerError;
    eq(stable(flow.game()), stable(h.before), 'whole persistent state unchanged throughout cancelled battle');
    eq(h.installs.length, 0, 'no state install in cancelled battle'); h.stateChecks++;
  };
  const update = function (this: any, ...args: any[]) {
    const h = active;
    if (h && this === h.scene) try { unchanged(h); } catch (e) { h.observerError = e; return; }
    const r = original.update.apply(this, args);
    if (h && this === h.scene) try { unchanged(h); } catch (e) { h.observerError = e; }
    return r;
  };
  const wait = (f: () => boolean, label: string) => waitFor(() => { unchanged(active); if (active?.scene?._failure && !active.controlledAbort) throw Error('actual move Scene failure: ' + active.scene._failure); return f(); }, label);
  const snapshot = (h: any) => clone({ persistent: flow.game(), bag: h.session.bag, player: h.session.gw.readState('p1'), foe: h.session.gw.readState('p2'), request: h.session.currentRequest() });
  const select = (h: any, key: any) => { const view = h.scene.inputState(); assert(view.ready, 'actual semantic input ready'); const at = view.items.findIndex((x: any) => x.key === key); assert(at >= 0, 'stable command ' + String(key)); h.scene._menu.select(at); eq(h.scene._menu.index(), at, 'actual selected cursor'); return at; };
  const command = (h: any, key: any) => { select(h, key); unchanged(h); h.scene._menu.processOk(); };
  const render = (h: any, stage: string, window: any) => {
    const id = h.id + '-' + stage; assert(window.visible && window.contents && window.openness !== 0, 'actual visible window ' + stage);
    let shown: any, clear: any, row: any; const visible = window.visible;
    try {
      shown = G.Bitmap.snap(h.scene); window.visible = false; clear = G.Bitmap.snap(h.scene); window.visible = visible;
      eq([shown.width, shown.height], [clear.width, clear.height], 'same window-control dimensions');
      let cells = 0, changed = 0; const y0 = stage === 'refusal-hint' ? 120 : 420, y1 = stage === 'refusal-hint' ? 410 : shown.height;
      for (let y = y0; y < y1; y += 4) for (let x = 12; x < Math.min(shown.width, 800); x += 4) { cells++; if (shown.getPixel(x, y) !== clear.getPixel(x, y)) changed++; }
      // Persist both images before enforcing the unchanged RGB gate.
      const images = [shown, clear].map((b, i) => { const file = id + (i ? '-no-window' : '') + '.png', png = p.nodeRequire('buffer').Buffer.from(b.canvas.toDataURL('image/png').split(',')[1], 'base64'); fs.writeFileSync(path.join(path.dirname(OUT), file), png, { flag: 'wx' }); return { file, sha256: hash(png) }; });
      row = { id, stage, ...images[0], comparisonPNG: images[1], cells, changed, pixelGate: changed > 0 ? 'pass' : 'fail', frame: G.Graphics.frameCount, at: G.performance.now(), language, lines: [...h.scene._log._lines], menu: clone(h.scene.inputState()), stateSHA256: hash(stable(flow.game())), installs: h.installs.length, samplingCleanup: false };
      d.renders.push(row); writeProgress(); assert(changed > 0, 'actual window pixels ' + stage); return row;
    } finally { window.visible = visible; shown?.destroy(); clear?.destroy(); if (row) row.samplingCleanup = window.visible === visible; }
  };
  const retire = (h: any) => {
    if (!h) return;
    if (h.add && h.scene?._log.add === h.add) h.scene._log.add = h.oldAdd;
    if (h.choose && h.session?.chooseMove === h.choose) h.session.chooseMove = h.oldChoose;
    const desc = Object.getOwnPropertyDescriptor(h.system, '_psGame');
    if (desc?.get === h.get && desc?.set === h.set) Object.defineProperty(h.system, '_psGame', { ...h.descriptor, value: h.value });
    h.retired = true;
  };
  const run = async (c: any) => {
    const began = G.performance.now(); let h: any;
    try {
      await wait(() => mapReady() || first && titleReady(), 'started cold Title or later Map'); first = false;
      assert(!flow.operationPending() && !flow._app?.saveBlocked, 'previous root released'); flow.stateReplaced(); flow._app = null; language = c.language; flow.setLanguage(null);
      flow._content = musicNativeContent(E, assert, { battle: named('battle'), victory: named('victory') }); flow._dex = E.dex.createDexLookup(); flow.seed = [...PLAN.seed]; rng = PLAN.worldSeed;
      flow.rng = (n: number) => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return Math.floor(rng / 4294967296 * n); }; flow.fast = true;
      const state = musicNativeState(E, flow._content); state.party[0].moves = clone(PLAN.moves); G.$gameSystem._psGame = state;
      G.$gameMessage.clear(); G.$gameMap._interpreter.clear(); await toMapId(PLAN.mapId, 8, 9); await wait(mapReady, 'Map start/windows/spriteset'); await press('shift');
      G.AudioManager.playBgm({ name: named('world'), volume: 80, pitch: 100, pan: 0 });
      const system = G.$gameSystem, descriptor: any = Object.getOwnPropertyDescriptor(system, '_psGame'); assert(descriptor?.configurable && descriptor.writable && 'value' in descriptor, 'observable plain state');
      h = active = { id: c.id, system, descriptor, value: descriptor.value, before: clone(flow.game()), installs: [], calls: [], rejections: [], stateChecks: 0, retired: false };
      h.get = () => h.value; h.set = (v: any) => { h.installs.push({ frame: G.Graphics.frameCount, before: hash(stable(h.value)), after: hash(stable(v)) }); h.value = v; };
      Object.defineProperty(system, '_psGame', { configurable: true, enumerable: descriptor.enumerable, get: h.get, set: h.set });
      flow.openBattle({ kind: 'wild', foes: [{ species: 'Pidgey', level: 3 }], battleId: PLAN.version + '/' + c.id, seq: ids.indexOf(c.id) + 1, canLose: true });
      h.op = flow._op; h.app = flow.app(); h.generation = h.app.stateGeneration;
      await inMode('main'); h.scene = battle(); h.session = h.scene._session;
      assert(h.session === h.op.session && h.app.saveBlocked, 'real App Session root'); eq(flow.translator().lang, c.language, 'actual language'); unchanged(h);
      h.oldChoose = h.session.chooseMove; h.choose = async function (this: any, ...args: any[]) { const row: any = { key: args[0], frame: G.Graphics.frameCount }; h.calls.push(row); const r = await h.oldChoose.apply(this, args); row.result = clone(r); return r; }; h.session.chooseMove = h.choose;
      h.oldAdd = h.scene._log.add; h.add = function (this: any, line: string) { const r = h.oldAdd.call(this, line); if (line === h.hint && !h.hintCaptured) { h.hintCaptured = true; render(h, 'refusal-hint', this); } return r; }; h.scene._log.add = h.add;
      h.hint = E.i18n.translatorFor(c.language).t('refusal.move.no-pp');
      command(h, 'fight'); await inMode('moves'); eq(h.scene._menu.maxCols(), 2, 'actual two-column menu'); select(h, PLAN.zeroPPKey);
      eq(h.scene._menu.index(), 2, 'third zero-PP slot'); assert(h.scene._menu.isCurrentItemEnabled(), 'PP0 reaches real command handler');
      for (let attempt = 0; attempt < 2; attempt++) {
        const before = snapshot(h), calls = h.calls.length; command(h, PLAN.zeroPPKey); if (attempt === 0) h.scene._menu.processOk();
        await wait(() => !h.scene._busy && h.scene.inputState().ready, 'real refusal text and return');
        eq(h.calls.length, calls + 1, 'busy duplicate cannot submit a second actual choice'); eq(h.calls.at(-1).result.ok, false, 'real rule refusal'); eq(h.calls.at(-1).result.reason, 'choice-rejected', 'real PP0 reason');
        eq(h.scene._mode, 'moves', 'refusal returns to moves'); eq(h.scene._menu.index(), 2, 'refusal preserves cursor'); eq(snapshot(h), before, 'rejection consumes no PP turn bag or state');
        h.rejections.push({ attempt, before, after: snapshot(h), beforeSHA256: hash(stable(before)), afterSHA256: hash(stable(snapshot(h))), calls: h.calls.length, cursor: h.scene._menu.index() });
      }
      assert(h.hintCaptured, 'actual localized refusal was rendered'); render(h, 'restored-moves', h.scene._menu);
      h.scene._menu.processCancel(); eq(h.scene._mode, 'main', 'actual Window cancel returns main'); command(h, 'fight'); await inMode('moves'); eq(h.scene._menu.index(), 2, 'BACK then Fight retains move cursor');
      const beforeLegalCalls = h.calls.length; command(h, PLAN.validKey); await wait(() => !h.scene._busy && h.scene._mode === 'main' && h.scene.inputState().ready, 'real legal turn returns main');
      eq(h.calls.length, beforeLegalCalls + 1, 'one legal submission'); eq(h.calls.at(-1).result.ok, true, 'real legal choice accepted');
      const moves = h.session.currentRequest().active[0].moves; eq([moves[0].pp, moves[1].pp, moves[2].pp, moves[3].pp], [35, 39, 0, 10], 'only legal Growl consumes PP'); eq(h.session.bag.masterball, 2, 'no bag consumption'); unchanged(h); render(h, 'legal-main', h.scene._menu);
      const beforeCancelCalls = h.calls.length;
      if (c.cancel === 'queued-refusal') { command(h, 'fight'); await inMode('moves'); command(h, PLAN.zeroPPKey); }
      h.controlledAbort = true; flow.abort(Error('owned move-menu cancellation'), h.op);
      await wait(() => h.scene._mode === 'end' && h.scene.inputState().ready, 'aborted Scene exposes Back');
      eq(h.calls.length, beforeCancelCalls, 'queued cancelled choice never executes'); h.scene._menu.processOk();
      await wait(() => mapReady() && !flow.operationPending() && !h.app.saveBlocked, 'cancelled Map returns and releases root'); await frames(3); unchanged(h);
      assert(h.scene._mode !== 'moves', 'old operation cannot reopen move menu');
      d.cases[c.id] = { language, before: h.before, after: clone(flow.game()), beforeSHA256: hash(stable(h.before)), afterSHA256: hash(stable(flow.game())), installs: h.installs, stateChecks: h.stateChecks, calls: h.calls, rejections: h.rejections, cancellation: c.cancel, cancelCallsBefore: beforeCancelCalls, cancelCallsAfter: h.calls.length, finalMode: h.scene._mode, rootReleased: !h.app.saveBlocked, renderIDs: d.renders.filter((r: any) => r.id.startsWith(c.id + '-')).map((r: any) => r.id) };
      retire(h); active = null; results.push({ id: c.id, status: 'pass', ms: G.performance.now() - began });
    } catch (e) { results.push({ id: c.id, status: 'fail', error: String((e as any)?.stack ?? e) }); throw e; }
    finally { d.notRunIDs = ids.filter(id => !results.some((r: any) => r.id === id)); writeProgress(); }
  };
  let failed = false, primary: unknown;
  try { G.PluginManager.parameters = parameters; G.Scene_PSBattle.prototype.update = update; for (const c of PLAN.cases) await run(c); eq(results.map((r: any) => [r.id, r.status]), ids.map(id => [id, 'pass']), 'whole two-case recipe'); }
  catch (e) { failed = true; primary = e; throw e; }
  finally {
    d.primaryError = failed ? String(primary) : null;
    const clean = (name: string, f: () => void) => { try { f(); } catch (e) { d.cleanupErrors.push({ name, error: String(e) }); } };
    if (active && flow._op === active.op && flow._app === active.app && active.app.stateGeneration === active.generation) clean('own root', () => flow.abort(Error('move qualification failure cleanup'), active.op));
    clean('observers', () => retire(active));
    clean('update', () => { if (G.Scene_PSBattle.prototype.update === update) G.Scene_PSBattle.prototype.update = original.update; });
    clean('parameters', () => { if (G.PluginManager.parameters === parameters) G.PluginManager.parameters = original.parameters; });
    clean('language', () => flow.setLanguage(original.language)); flow.fast = original.fast;
    d.remainingRootLocked = !!flow._app?.saveBlocked; d.cleanupComplete = d.cleanupErrors.length === 0; writeProgress();
    if (!failed && d.cleanupErrors.length) throw Error('move driver cleanup failed');
  }
}
