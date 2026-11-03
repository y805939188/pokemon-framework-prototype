/* eslint-disable @typescript-eslint/no-explicit-any */
// Test-only finite recipe. A report never establishes native execution by itself.
import PLAN from '../../../experiments/step5/4/level-stats-native-plan.json';
import { musicNativeContent, musicNativeState } from './music-native-fixture';
import { captureHostReady } from './d2-capture-me';
export const levelStatsNativePlan = PLAN;

export async function runD2LevelStats(p: any): Promise<void> {
  const { G, W, api, fs, path, OUT, gameDir, arg, argv, assert, eq, clone, report, results, writeProgress, frames, waitFor, scene, battle, inMode, press, toMapId } = p;
  const E = api(), flow = W.PSFlow;
  const hash = (v: any) => p.nodeRequire('crypto').createHash('sha256').update(v).digest('hex');
  const stable = (v: any) => E.contentCompile.canonicalJson(v), fileHash = (f: string) => hash(fs.readFileSync(f));
  assert(OUT && arg('ps-level-stats-input') && !arg('ps-flow-only') && argv.includes('--ps-sound'), 'whole isolated level-stats mode');
  const bytes = fs.readFileSync(arg('ps-level-stats-input')), input = JSON.parse(bytes), info = JSON.parse(fs.readFileSync(path.join(gameDir, 'package-info.json')));
  eq(input.version, PLAN.version, 'stats input'); eq(input.productCommit, PLAN.productCommit, 'fixed stats product'); eq(input.productRuntime, PLAN.productRuntime, 'runtime identities');
  eq(input.planSHA256, hash(stable(PLAN)), 'frozen stats plan'); eq(info.gitHead, input.packageHead, 'package head'); eq(info.workingTreeChanges, 0, 'clean package');
  for (const [rel, h] of Object.entries(PLAN.productRuntime)) eq(fileHash(path.join(gameDir, rel)), h, 'actual stats product ' + rel);
  eq(fileHash(path.join(gameDir, 'js/plugins/PS_BattleFlowTest.js')), input.driverPluginSHA256, 'actual stats driver');
  for (const [key, paths] of [['worldFiles', PLAN.worldFiles], ['fontFiles', PLAN.fontResourcePaths]] as const) {
    eq(Object.keys(input[key]).sort(), [...paths].sort(), 'frozen ' + key);
    for (const [rel, h] of Object.entries(input[key])) eq(fileHash(path.join(gameDir, rel)), h, 'actual ' + key + ' ' + rel);
  }
  eq(input.assets.map((r: any) => r.path).sort(), [...PLAN.requiredAssets].sort(), 'qualified media set');
  for (const r of input.assets) eq(fileHash(path.join(gameDir, r.path)), r.sha256, 'actual media');
  eq(path.resolve(arg('ps-save-dir')), path.resolve(input.saveRoot), 'isolated save argument'); eq(path.resolve(G.StorageManager.fileDirectoryPath()), path.resolve(input.saveRoot), 'actual storage');
  const storageRel = path.relative(fs.realpathSync(gameDir), fs.realpathSync(input.saveRoot)); assert(storageRel === '..' || storageRel.startsWith('..' + path.sep), 'storage outside APP'); eq(fs.readdirSync(input.saveRoot), [], 'fresh storage');
  const keys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const ids = PLAN.cases.map(c => c.id); eq(ids, ['LS01', 'LS02', 'LS03'], 'three ordered cases');
  const d: any = report.levelStatsNative = { version: PLAN.version, productCommit: PLAN.productCommit, productRuntime: PLAN.productRuntime, packageHead: input.packageHead, driverPluginSHA256: input.driverPluginSHA256, inputSHA256: hash(bytes), expectedIDs: ids, notRunIDs: [...ids], nativeClaim: 'NOT_SELF_QUALIFIED', cases: {}, renders: [], cleanupErrors: [], physicalInput: 'NOT_VERIFIED' };
  report.hostDriverVersion = PLAN.version;
  const original = { parameters: G.PluginManager.parameters, language: flow.lang, fast: flow.fast, update: G.Scene_PSBattle.prototype.update };
  let first = true, language = 'en', active: any = null;
  const named = (n: string) => PLAN.prefix + n;
  const parameters = function (this: any, name: string) { const v = original.parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...v, language, battleMusic: JSON.stringify({ presets: { battle: named('battle'), victory: named('victory') } }) } : v; };
  const mapReady = () => captureHostReady(G, scene(), 'map'), titleReady = () => captureHostReady(G, scene(), 'title');
  const unchanged = (h: any) => {
    if (!h || h.retired) return;
    if (h.observerError) throw h.observerError;
    if (!h.commitAllowed) { eq(stable(flow.game()), stable(h.before), 'whole persistent state unchanged before final confirmation'); eq(h.installs.length, 0, 'zero installs before final confirmation'); }
    h.stateChecks++;
  };
  const update = function (this: any, ...args: any[]) {
    const h = active;
    if (h && this === h.scene) try { unchanged(h); } catch (e) { h.observerError = e; return; }
    const r = original.update.apply(this, args);
    if (h && this === h.scene) try { unchanged(h); } catch (e) { h.observerError = e; }
    return r;
  };
  const wait = (f: () => boolean, label: string) => waitFor(() => { unchanged(active); if (active?.scene?._failure && !active.controlledAbort) throw Error('actual stats Scene failure: ' + active.scene._failure); return f(); }, label);
  const command = (h: any, key: any) => { const view = h.scene.inputState(); assert(view.ready, 'actual semantic input ready'); const at = view.items.findIndex((x: any) => x.key === key); assert(at >= 0, 'stable command ' + String(key)); h.scene._menu.select(at); unchanged(h); h.scene._menu.processOk(); };
  const render = (h: any, stage: string) => {
    const window = h.scene._levelStatsWindow, page = h.scene.levelStatsState(); assert(window?.visible && window.contents && page, 'actual visible stats window');
    const id = h.id + '-' + stage; let shown: any, clear: any, row: any; const visible = window.visible;
    try {
      shown = G.Bitmap.snap(h.scene); window.visible = false; clear = G.Bitmap.snap(h.scene); window.visible = visible;
      eq([shown.width, shown.height], [clear.width, clear.height], 'same stats-control dimensions');
      let cells = 0, changed = 0;
      for (let y = Math.max(0, window.y); y < Math.min(shown.height, window.y + window.height); y += 4) for (let x = Math.max(0, window.x); x < Math.min(shown.width, window.x + window.width); x += 4) { cells++; if (shown.getPixel(x, y) !== clear.getPixel(x, y)) changed++; }
      const images = [shown, clear].map((b, i) => { const file = id + (i ? '-no-window' : '') + '.png', png = p.nodeRequire('buffer').Buffer.from(b.canvas.toDataURL('image/png').split(',')[1], 'base64'); fs.writeFileSync(path.join(path.dirname(OUT), file), png, { flag: 'wx' }); return { file, sha256: hash(png) }; });
      row = { id, stage, ...images[0], comparisonPNG: images[1], cells, changed, pixelGate: changed > 0 ? 'pass' : 'fail', frame: G.Graphics.frameCount, update: h.scene._pictureUpdate, at: G.performance.now(), language, page: clone(page), labels: keys.map(key => flow.translator().t('stat.' + key)), stateSHA256: hash(stable(flow.game())), installs: h.installs.length, samplingCleanup: false };
      d.renders.push(row); writeProgress(); assert(changed > 0, 'actual stats window pixels ' + stage); return row;
    } finally { window.visible = visible; shown?.destroy(); clear?.destroy(); if (row) row.samplingCleanup = window.visible === visible; }
  };
  const retire = (h: any) => {
    if (!h) return;
    if (h.push && h.scene?.pushMessages === h.push) h.scene.pushMessages = h.oldPush;
    const desc = Object.getOwnPropertyDescriptor(h.system, '_psGame');
    if (desc?.get === h.get && desc?.set === h.set) Object.defineProperty(h.system, '_psGame', { ...h.descriptor, value: h.value });
    h.retired = true;
  };
  const run = async (c: any) => {
    const began = G.performance.now(); let h: any;
    try {
      await wait(() => mapReady() || first && titleReady(), 'started cold Title or later Map'); first = false;
      assert(!flow.operationPending() && !flow._app?.saveBlocked, 'previous root released'); flow.stateReplaced(); flow._app = null; language = c.language; flow.setLanguage(null);
      const content = musicNativeContent(E, assert, { battle: named('battle'), victory: named('victory') });
      content.species.Snorlax.learnset[51] = ['Rest']; assert(content.moves.Rest, 'real learning move');
      flow._content = content; flow._dex = E.dex.createDexLookup(); flow.seed = [...PLAN.seed]; flow.rng = () => 0; flow.fast = true;
      const member = E.memberFactory.createMember({ id: 'LEVEL-P1', species: 'Snorlax', level: 50 }, content, () => 0);
      const state = E.state.newGame({ content, party: [E.speciesKey.toPersistentMember(member, content)], money: 1000, bag: { masterball: 2 } });
      state.badges.fill(true); state.nextMemberOrdinal = '2'; state.party[0].moves = clone(PLAN.moves); state.party[0].exp = E.growth.minExp(content.species.Snorlax.growth, 50 + c.levels) - 1; G.$gameSystem._psGame = state;
      G.$gameMessage.clear(); G.$gameMap._interpreter.clear(); await toMapId(PLAN.mapId, 8, 9); await wait(mapReady, 'Map start/windows/spriteset'); await press('shift'); G.AudioManager.playBgm({ name: named('world'), volume: 80, pitch: 100, pan: 0 });
      const system = G.$gameSystem, descriptor: any = Object.getOwnPropertyDescriptor(system, '_psGame'); assert(descriptor?.configurable && descriptor.writable && 'value' in descriptor, 'observable plain state');
      h = active = { id: c.id, system, descriptor, value: descriptor.value, before: clone(flow.game()), installs: [], pages: [], messages: [], stateChecks: 0, retired: false, commitAllowed: false };
      h.get = () => h.value; h.set = (v: any) => { assert(h.commitAllowed, 'no early state install'); h.installs.push({ frame: G.Graphics.frameCount, before: hash(stable(h.value)), after: hash(stable(v)) }); h.value = v; };
      Object.defineProperty(system, '_psGame', { configurable: true, enumerable: descriptor.enumerable, get: h.get, set: h.set });
      flow.openBattle({ kind: 'wild', foes: [{ species: 'Pidgey', level: 3 }], battleId: PLAN.version + '/' + c.id, seq: ids.indexOf(c.id) + 1, canLose: true });
      h.op = flow._op; h.app = flow.app(); h.generation = h.app.stateGeneration;
      await inMode('main'); h.scene = battle(); h.session = h.scene._session;
      assert(h.session === h.op.session && h.app.saveBlocked, 'real App Session root'); eq(flow.translator().lang, c.language, 'actual language'); unchanged(h);
      h.oldPush = h.scene.pushMessages; h.push = function (this: any, msgs: any[]) { h.messages.push(...msgs); return h.oldPush.call(this, msgs); }; h.scene.pushMessages = h.push;
      command(h, 'fight'); await inMode('moves'); command(h, 1);
      await wait(() => !!h.scene.levelStatsState(), 'first real level stats page');
      const growth = h.messages.find((m: any) => m.kind === 'growth'); assert(growth, 'actual Session growth message'); const display = E.battlePresentation.readGrowthDisplay(h.session, growth);
      const levels = display.segments.filter((s: any) => s.levelUp).map((s: any) => s.levelUp); eq(levels.map((s: any) => s.level), c.cancel ? [51] : [51, 52, 53], 'actual applied levels');
      h.appliedLevels = clone(levels);
      for (const level of levels) for (const phase of (c.cancel ? ['delta'] : ['delta', 'total'])) {
        await wait(() => h.scene.levelStatsState()?.level === level.level && h.scene.levelStatsState()?.phase === phase, 'actual ordered level page');
        const page = h.scene.levelStatsState(); eq(page.rows.map((r: any) => r.key), keys, 'all six fixed stats');
        eq(page.rows.map((r: any) => r.value), keys.map(key => phase === 'delta' ? level.stats.after[key] - level.stats.before[key] : level.stats.after[key]), 'actual per-level signed values');
        assert(!h.scene.inputState().ready && !h.scene._menu.visible, 'menus blocked by stats page'); unchanged(h); render(h, level.level + '-' + phase);
        await frames(20); eq(h.scene.levelStatsState(), page, 'fast and wait cannot confirm'); await press('cancel'); eq(h.scene.levelStatsState(), page, 'BACK cannot confirm');
        h.pages.push({ page: clone(page), frame: G.Graphics.frameCount, stateSHA256: hash(stable(flow.game())), installs: h.installs.length });
        if (c.cancel) break;
        await press('ok');
      }
      if (c.cancel) {
        h.controlledAbort = true; const own = h.scene._levelStatsWindow; flow.abort(Error('owned visible stats cancellation'), h.op);
        await wait(() => h.scene._mode === 'end' && h.scene.inputState().ready, 'cancelled Scene Back'); assert(!h.scene.levelStatsState() && h.scene._levelStatsWindow === null, 'own window retired'); assert(own.destroyed || own._destroyed, 'owned window destroyed');
        h.scene._menu.processOk(); await wait(() => mapReady() && !flow.operationPending() && !h.app.saveBlocked, 'cancelled Map/root'); await frames(3); unchanged(h); assert(!h.scene.levelStatsState(), 'old Scene cannot repaint');
      } else {
        await wait(() => h.scene._mode === 'learn' && h.scene.inputState().ready, 'existing learning gate after six pages'); unchanged(h);
        const no = h.scene._menu._items.findIndex((x: any) => x.ext === null); assert(no >= 0, 'actual decline learning command'); h.scene._menu.select(no); h.scene._menu.processOk();
        await wait(() => h.scene._mode === 'end' && h.scene.inputState().ready, 'original final Continue'); unchanged(h);
        h.finalConfirmation = { frame: G.Graphics.frameCount, stateSHA256: hash(stable(flow.game())), installs: h.installs.length }; h.commitAllowed = true; h.scene._menu.processOk();
        await wait(() => mapReady() && !flow.operationPending() && !h.app.saveBlocked, 'committed Map/root'); eq(flow.lastOutcome.commit, 'applied', 'normal commit applied'); eq(h.installs.length, 1, 'exactly one install'); eq(flow.game().party[0].level, 53, 'final level53');
        const after = stable(flow.game()); h.scene.onEnd(); await frames(3); eq(stable(flow.game()), after, 'retired final handler cannot duplicate result'); eq(h.installs.length, 1, 'still one install');
      }
      eq(d.renders.filter((r: any) => r.id.startsWith(c.id + '-')).map((r: any) => r.stage), PLAN.renderStages[c.id as keyof typeof PLAN.renderStages], 'exact page image set');
      d.cases[c.id] = { language, before: h.before, after: clone(flow.game()), beforeSHA256: hash(stable(h.before)), afterSHA256: hash(stable(flow.game())), installs: h.installs, stateChecks: h.stateChecks, pages: h.pages, appliedLevels: h.appliedLevels, finalConfirmation: h.finalConfirmation ?? null, cancelled: c.cancel, rootReleased: !h.app.saveBlocked, renderIDs: d.renders.filter((r: any) => r.id.startsWith(c.id + '-')).map((r: any) => r.id) };
      retire(h); active = null; results.push({ id: c.id, status: 'pass', ms: G.performance.now() - began });
    } catch (e) { results.push({ id: c.id, status: 'fail', error: String((e as any)?.stack ?? e) }); throw e; }
    finally { d.notRunIDs = ids.filter(id => !results.some((r: any) => r.id === id)); writeProgress(); }
  };
  let failed = false, primary: unknown;
  try { G.PluginManager.parameters = parameters; G.Scene_PSBattle.prototype.update = update; for (const c of PLAN.cases) await run(c); eq(results.map((r: any) => [r.id, r.status]), ids.map(id => [id, 'pass']), 'whole three-case recipe'); }
  catch (e) { failed = true; primary = e; throw e; }
  finally {
    d.primaryError = failed ? String(primary) : null;
    const clean = (name: string, f: () => void) => { try { f(); } catch (e) { d.cleanupErrors.push({ name, error: String(e) }); } };
    if (active && flow._op === active.op && flow._app === active.app && active.app.stateGeneration === active.generation) clean('own root', () => flow.abort(Error('stats qualification failure cleanup'), active.op));
    clean('observers', () => retire(active)); clean('update', () => { if (G.Scene_PSBattle.prototype.update === update) G.Scene_PSBattle.prototype.update = original.update; });
    clean('parameters', () => { if (G.PluginManager.parameters === parameters) G.PluginManager.parameters = original.parameters; }); clean('language', () => flow.setLanguage(original.language)); flow.fast = original.fast;
    d.remainingRootLocked = !!flow._app?.saveBlocked; d.cleanupComplete = d.cleanupErrors.length === 0; writeProgress(); if (!failed && d.cleanupErrors.length) throw Error('stats driver cleanup failed');
  }
}
