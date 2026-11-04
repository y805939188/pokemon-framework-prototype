/* eslint-disable @typescript-eslint/no-explicit-any */
// Test-only finite recipe. A report never establishes native execution by itself.
import PLAN from '../../../experiments/step5/4/ordinary-message-native-plan.json';
import { musicNativeContent, musicNativeState } from './music-native-fixture';
import { captureHostReady } from './d2-capture-me';
export const ordinaryMessageNativePlan = PLAN;

export async function runD2OrdinaryMessage(p: any): Promise<void> {
  const { G, W, api, fs, path, OUT, gameDir, arg, argv, assert, eq, clone, report, results, writeProgress, frames, waitFor, scene, battle, inMode, press, toMapId } = p;
  const E = api(), flow = W.PSFlow;
  const hash = (v: any) => p.nodeRequire('crypto').createHash('sha256').update(v).digest('hex');
  const stable = (v: any) => E.contentCompile.canonicalJson(v), fileHash = (f: string) => hash(fs.readFileSync(f));
  assert(OUT && arg('ps-ordinary-message-input') && !arg('ps-flow-only') && argv.includes('--ps-sound'), 'whole isolated ordinary-message mode');
  const bytes = fs.readFileSync(arg('ps-ordinary-message-input')), input = JSON.parse(bytes), info = JSON.parse(fs.readFileSync(path.join(gameDir, 'package-info.json')));
  eq(input.version, PLAN.version, 'message input'); eq(input.productCommit, PLAN.productCommit, 'fixed message product'); eq(input.productRuntime, PLAN.productRuntime, 'runtime identities');
  eq(input.planSHA256, hash(stable(PLAN)), 'frozen message plan'); eq(info.gitHead, input.packageHead, 'package head'); eq(info.workingTreeChanges, 0, 'clean package');
  for (const [rel, h] of Object.entries(PLAN.productRuntime)) eq(fileHash(path.join(gameDir, rel)), h, 'actual message product ' + rel);
  eq(fileHash(path.join(gameDir, 'js/plugins/PS_BattleFlowTest.js')), input.driverPluginSHA256, 'actual message driver');
  for (const [key, paths] of [['worldFiles', PLAN.worldFiles], ['fontFiles', PLAN.fontResourcePaths]] as const) {
    eq(Object.keys(input[key]).sort(), [...paths].sort(), 'frozen ' + key);
    for (const [rel, h] of Object.entries(input[key])) eq(fileHash(path.join(gameDir, rel)), h, 'actual ' + key + ' ' + rel);
  }
  eq(input.assets.map((r: any) => r.path).sort(), [...PLAN.requiredAssets].sort(), 'qualified media set');
  for (const r of input.assets) eq(fileHash(path.join(gameDir, r.path)), r.sha256, 'actual media');
  eq(path.resolve(arg('ps-save-dir')), path.resolve(input.saveRoot), 'isolated save argument'); eq(path.resolve(G.StorageManager.fileDirectoryPath()), path.resolve(input.saveRoot), 'actual storage');
  const storageRel = path.relative(fs.realpathSync(gameDir), fs.realpathSync(input.saveRoot)); assert(storageRel === '..' || storageRel.startsWith('..' + path.sep), 'storage outside APP'); eq(fs.readdirSync(input.saveRoot), [], 'fresh storage');
  const ids = PLAN.cases.map(c => c.id); eq(ids, ['OM01', 'OM02'], 'two ordered normal cases');
  const d: any = report.ordinaryMessageNative = { version: PLAN.version, productCommit: PLAN.productCommit, productRuntime: PLAN.productRuntime, packageHead: input.packageHead, driverPluginSHA256: input.driverPluginSHA256, inputSHA256: hash(bytes), expectedIDs: ids, notRunIDs: [...ids], nativeClaim: 'NOT_SELF_QUALIFIED', cases: {}, renders: [], cleanupErrors: [], physicalInput: 'NOT_VERIFIED' };
  report.hostDriverVersion = PLAN.version;
  const original = { parameters: G.PluginManager.parameters, language: flow.lang, fast: flow.fast, update: G.Scene_PSBattle.prototype.update, start: G.Scene_PSBattle.prototype.start };
  let first = true, language = 'en', active: any = null;
  const named = (n: string) => PLAN.prefix + n;
  const parameters = function (this: any, name: string) { const v = original.parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...v, language, battleMusic: JSON.stringify({ presets: { battle: named('battle'), victory: named('victory') } }) } : v; };
  const mapReady = () => captureHostReady(G, scene(), 'map'), titleReady = () => captureHostReady(G, scene(), 'title');
  const unchanged = (h: any) => {
    if (!h || h.retired) return;
    if (h.observerError) throw h.observerError;
    if (!h.commitAllowed) { eq(stable(flow.game()), stable(h.before), 'whole state unchanged before final confirmation'); eq(h.installs.length, 0, 'zero installs before final confirmation'); }
    h.stateChecks++;
  };
  const start = function (this: any, ...args: any[]) { if (active && this._psOp === active.op) active.scene = this; return original.start.apply(this, args); };
  const update = function (this: any, ...args: any[]) {
    const h = active;
    if (h && this === h.scene) try { unchanged(h); } catch (e) { h.observerError = e; return; }
    const r = original.update.apply(this, args);
    if (h && this === h.scene) try {
      unchanged(h);
      h.updates.push({ frame: G.Graphics.frameCount, update: this._pictureUpdate, at: G.performance.now(), message: clone(this.ordinaryMessageState()), lines: [...this._log._lines], phase: this._mode, ready: this.inputState().ready, menuVisible: this._menu.visible, installs: h.installs.length, stateSHA256: hash(stable(flow.game())) });
    } catch (e) { h.observerError = e; }
    return r;
  };
  const wait = (f: () => boolean, label: string) => waitFor(() => { unchanged(active); if (active?.scene?._failure && !active.controlledAbort) throw Error('actual message Scene failure: ' + active.scene._failure); return f(); }, label);
  const command = (h: any, key: any) => {
    const view = h.scene.inputState(); assert(view.ready, 'actual semantic input ready'); const at = view.items.findIndex((x: any) => x.key === key); assert(at >= 0, 'stable command ' + String(key));
    h.commands.push({ key, source: 'Window_Command.processOk', frame: G.Graphics.frameCount }); h.scene._menu.select(at); unchanged(h); h.scene._menu.processOk();
  };
  const working = (h: any) => stable({ party: h.session.party, bag: h.session.bag, player: h.session.gw.readState('p1'), foe: h.session.gw.readState('p2'), request: h.session.currentRequest() });
  const render = (h: any, stage: string) => {
    const target = stage === 'returned-moves' ? h.scene._menu : h.scene._log, contents = target?._contentsSprite;
    assert(target?.visible && target.openness !== 0 && contents?.renderable !== false, 'visible actual text/menu contents');
    const id = h.id + '-' + stage, saved = contents.renderable, layer = h.scene._windowLayer;
    const rect = { x: target.x + (layer?.x ?? 0), y: target.y + (layer?.y ?? 0), width: target.width, height: target.height };
    let shown: any, clear: any, row: any;
    try {
      shown = G.Bitmap.snap(h.scene); contents.renderable = false; clear = G.Bitmap.snap(h.scene); contents.renderable = saved;
      eq([shown.width, shown.height], [clear.width, clear.height], 'same-update content-control dimensions');
      const rgba = [shown, clear].map(b => b.context.getImageData(0, 0, b.width, b.height).data);
      let cells = 0, changed = 0;
      for (let y = Math.max(0, rect.y); y < Math.min(shown.height, rect.y + rect.height); y += 4) for (let x = Math.max(0, rect.x); x < Math.min(shown.width, rect.x + rect.width); x += 4) {
        cells++; const at = (y * shown.width + x) * 4;
        if (rgba[0][at] !== rgba[1][at] || rgba[0][at + 1] !== rgba[1][at + 1] || rgba[0][at + 2] !== rgba[1][at + 2]) changed++;
      }
      const images = [shown, clear].map((b, i) => { const file = id + (i ? '-no-contents' : '') + '.png', png = p.nodeRequire('buffer').Buffer.from(b.canvas.toDataURL('image/png').split(',')[1], 'base64'); fs.writeFileSync(path.join(path.dirname(OUT), file), png, { flag: 'wx' }); return { file, sha256: hash(png) }; });
      row = { id, stage, ...images[0], comparisonPNG: images[1], cells, changed, pixelGate: changed > 0 ? 'pass' : 'fail', sampling: { version: 'actual-window-layer-content-rgb-v1', rect, stride: 4, channels: 'RGB', cleanup: false }, frame: G.Graphics.frameCount, update: h.scene._pictureUpdate, at: G.performance.now(), language, message: clone(h.scene.ordinaryMessageState()), lines: [...h.scene._log._lines], menu: clone(h.scene.inputState()), stateSHA256: hash(stable(flow.game())), installs: h.installs.length };
      d.renders.push(row); writeProgress(); assert(changed > 0, 'actual ordinary message/menu glyph pixels ' + stage); return row;
    } finally { contents.renderable = saved; shown?.destroy(); clear?.destroy(); if (row) { row.sampling.cleanup = contents.renderable === saved; writeProgress(); } }
  };
  const retire = (h: any) => {
    if (!h) return;
    if (h.session && h.choose && h.session.chooseMove === h.choose) h.session.chooseMove = h.oldChoose;
    const desc = Object.getOwnPropertyDescriptor(h.system, '_psGame');
    if (desc?.get === h.get && desc?.set === h.set) Object.defineProperty(h.system, '_psGame', { ...h.descriptor, value: h.value });
    h.retired = true;
  };
  const refusal = async (h: any, reveal?: 'ok' | 'cancel', close?: 'ok' | 'cancel', capture = false) => {
    const before = working(h), count = h.choices, startFrame = G.Graphics.frameCount;
    command(h, 1); await wait(() => { const s = h.scene.ordinaryMessageState(); return !!s && s.phase === 'typing' && s.visible > 0 && s.visible < s.total; }, 'real refusal partial text');
    const expected = flow.translator().t('refusal.move.no-pp'), partial = h.scene.ordinaryMessageState();
    eq(partial.total, Array.from(expected).length, 'actual localized message total'); eq(h.scene._log._lines.join(''), Array.from(expected).slice(0, partial.visible).join(''), 'actual localized visible prefix');
    assert(!h.scene.inputState().ready && !h.scene._menu.visible, 'partial text owns input');
    const same = clone(partial); h.scene.updateQueue(); eq(h.scene.ordinaryMessageState(), same, 'same Scene.update resampling is idempotent');
    h.scene._menu.processOk(); eq(h.choices, count + 1, 'hidden Window confirmation cannot submit a second choice'); eq(working(h), before, 'refused action leaves all working state unchanged');
    if (capture) render(h, 'refusal-partial');
    if (reveal) { h.inputs.push({ key: reveal, phase: 'typing', frame: G.Graphics.frameCount }); await press(reveal); }
    await wait(() => h.scene.ordinaryMessageState()?.phase === 'full', 'full refusal text');
    const full = clone(h.scene.ordinaryMessageState()); eq(h.scene._log._lines.join(''), expected, 'actual complete localized text');
    assert(!h.scene.inputState().ready && !h.scene._menu.visible, 'full text still owns queue');
    if (capture) render(h, 'refusal-full');
    if (reveal) { await frames(2); eq(h.scene.ordinaryMessageState(), full, 'revealing input does not also close'); }
    if (close) { h.inputs.push({ key: close, phase: 'full', frame: G.Graphics.frameCount }); await press(close); }
    await wait(() => h.scene.inputState().ready, 'ordinary refusal closes and restores menu');
    eq(h.scene._mode, 'moves', 'refusal returns to moves'); eq(h.scene._menu.index(), 0, 'same refused cursor'); eq(working(h), before, 'whole refused working state preserved'); eq(h.choices, count + 1, 'only one attempted action');
    const departure = h.updates.find((r: any) => r.frame >= startFrame && r.at >= full.fullyShownAt && r.message === null);
    assert(departure, 'actual closure update observed'); if (!close) assert(departure.at - full.fullyShownAt >= 1000, 'natural full dwell is at least1000ms');
    h.refusals.push({ beforeSHA256: hash(before), afterSHA256: hash(working(h)), choices: h.choices - count, partial: same, full, closedAt: departure.at, readyAt: G.performance.now(), reveal: reveal ?? null, close: close ?? null });
    if (capture) render(h, 'returned-moves');
  };
  const run = async (c: any) => {
    const began = G.performance.now(); let h: any;
    try {
      await wait(() => mapReady() || first && titleReady(), 'started cold Title or later Map'); first = false;
      assert(!flow.operationPending() && !flow._app?.saveBlocked, 'prior root released'); flow.stateReplaced(); flow._app = null; language = c.language; flow.setLanguage(null);
      const content = musicNativeContent(E, assert, { battle: named('battle'), victory: named('victory') });
      flow._content = content; flow._dex = E.dex.createDexLookup(); flow.seed = [...PLAN.seed]; flow.rng = () => 0; flow.fast = false;
      const state = musicNativeState(E, content); state.party[0].moves = clone(PLAN.moves); G.$gameSystem._psGame = state;
      G.$gameMessage.clear(); G.$gameMap._interpreter.clear(); await toMapId(PLAN.mapId, 8, 9); await wait(mapReady, 'actual Map.start/windows/spriteset'); await press('shift'); G.AudioManager.playBgm({ name: named('world'), volume: 80, pitch: 100, pan: 0 });
      const system = G.$gameSystem, descriptor: any = Object.getOwnPropertyDescriptor(system, '_psGame'); assert(descriptor?.configurable && descriptor.writable && 'value' in descriptor, 'observable plain state');
      h = active = { id: c.id, system, descriptor, value: descriptor.value, before: clone(flow.game()), installs: [], updates: [], inputs: [], commands: [], refusals: [], choices: 0, stateChecks: 0, retired: false, commitAllowed: false };
      h.get = () => h.value; h.set = (v: any) => { assert(h.commitAllowed, 'no early state install'); h.installs.push({ frame: G.Graphics.frameCount, at: G.performance.now(), before: hash(stable(h.value)), after: hash(stable(v)) }); h.value = v; };
      Object.defineProperty(system, '_psGame', { configurable: true, enumerable: descriptor.enumerable, get: h.get, set: h.set });
      flow.openBattle({ kind: 'wild', foes: [{ species: 'Pidgey', level: 3 }], battleId: PLAN.version + '/' + c.id, seq: ids.indexOf(c.id) + 1, canLose: true }); h.op = flow._op; h.app = flow.app(); h.generation = h.app.stateGeneration;
      await inMode('main'); h.scene = battle(); h.session = h.scene._session; assert(h.session === h.op.session && h.app.saveBlocked && flow.fast === false, 'real normal-speed App Session root'); eq(flow.translator().lang, c.language, 'actual production language'); unchanged(h);
      h.oldChoose = h.session.chooseMove; h.choose = function (this: any, ...a: any[]) { h.choices++; return h.oldChoose.apply(this, a); }; h.session.chooseMove = h.choose;
      command(h, 'fight'); await inMode('moves');
      if (c.advance === 'natural') await refusal(h, undefined, undefined, true);
      else { await refusal(h, 'ok', 'cancel', true); await refusal(h, 'cancel', 'ok'); }
      if (c.ending === 'win') {
        command(h, 3); await wait(() => h.scene._mode === 'end' && h.scene.inputState().ready, 'normal Gen8 victory and final Continue'); eq(h.session.ended.winner, 'Player', 'real normal victory'); unchanged(h); await frames(20); unchanged(h);
        h.finalConfirmation = { frame: G.Graphics.frameCount, stateSHA256: hash(stable(flow.game())), installs: h.installs.length }; h.commitAllowed = true; h.scene._menu.processOk();
        await wait(() => mapReady() && !flow.operationPending() && !h.app.saveBlocked, 'committed Map/root'); eq(flow.lastOutcome.commit, 'applied', 'normal applied result'); eq(h.installs.length, 1, 'exactly one result installation'); eq(Object.keys(flow.game().appliedBattles).length, Object.keys(h.before.appliedBattles).length + 1, 'one actual result ledger entry');
        const after = stable(flow.game()); h.scene.onEnd(); await frames(3); eq(stable(flow.game()), after, 'no duplicate retired commit'); eq(h.installs.length, 1, 'still one installation');
      } else {
        command(h, 1); await wait(() => h.scene.ordinaryMessageState()?.phase === 'typing' && h.scene.ordinaryMessageState()?.visible > 0, 'later partial message to cancel'); const late = h.scene._queue[0]; h.controlledAbort = true;
        flow.abort(Error('owned ordinary message cancellation'), h.op); await wait(() => h.scene._mode === 'end' && h.scene.inputState().ready, 'aborted Back'); assert(!h.scene.ordinaryMessageState(), 'owned text step retired'); const lines = [...h.scene._log._lines]; late.advance(G.performance.now() + 5000); eq(h.scene._log._lines, lines, 'retired message cannot redraw');
        h.scene._menu.processOk(); await wait(() => mapReady() && !flow.operationPending() && !h.app.saveBlocked, 'cancelled Map/root'); await frames(3); unchanged(h);
      }
      eq(d.renders.filter((r: any) => r.id.startsWith(c.id + '-')).map((r: any) => r.stage), PLAN.renderStages[c.id as keyof typeof PLAN.renderStages], 'exact normal image set');
      d.cases[c.id] = { language, fast: false, before: h.before, after: clone(flow.game()), beforeSHA256: hash(stable(h.before)), afterSHA256: hash(stable(flow.game())), installs: h.installs, stateChecks: h.stateChecks, updates: h.updates, commands: h.commands, inputs: h.inputs, refusals: h.refusals, finalConfirmation: h.finalConfirmation ?? null, cancelled: c.ending === 'abort', rootReleased: !h.app.saveBlocked, renderIDs: d.renders.filter((r: any) => r.id.startsWith(c.id + '-')).map((r: any) => r.id) };
      retire(h); active = null; results.push({ id: c.id, status: 'pass', ms: G.performance.now() - began });
    } catch (e) { results.push({ id: c.id, status: 'fail', error: String((e as any)?.stack ?? e) }); throw e; }
    finally { d.notRunIDs = ids.filter(id => !results.some((r: any) => r.id === id)); writeProgress(); }
  };
  let failed = false, primary: unknown;
  try { G.PluginManager.parameters = parameters; G.Scene_PSBattle.prototype.start = start; G.Scene_PSBattle.prototype.update = update; for (const c of PLAN.cases) await run(c); eq(results.map((r: any) => [r.id, r.status]), ids.map(id => [id, 'pass']), 'whole two-case ordinary recipe'); }
  catch (e) { failed = true; primary = e; throw e; }
  finally {
    d.primaryError = failed ? String(primary) : null;
    const clean = (name: string, f: () => void) => { try { f(); } catch (e) { d.cleanupErrors.push({ name, error: String(e) }); } };
    if (active && flow._op === active.op && flow._app === active.app && active.app.stateGeneration === active.generation) clean('own root', () => flow.abort(Error('ordinary qualification failure cleanup'), active.op));
    clean('observers', () => retire(active)); clean('update', () => { if (G.Scene_PSBattle.prototype.update === update) G.Scene_PSBattle.prototype.update = original.update; }); clean('start', () => { if (G.Scene_PSBattle.prototype.start === start) G.Scene_PSBattle.prototype.start = original.start; });
    clean('parameters', () => { if (G.PluginManager.parameters === parameters) G.PluginManager.parameters = original.parameters; }); clean('language', () => flow.setLanguage(original.language)); flow.fast = original.fast;
    d.remainingRootLocked = !!flow._app?.saveBlocked; d.cleanupComplete = d.cleanupErrors.length === 0; writeProgress(); if (!failed && d.cleanupErrors.length) throw Error('ordinary driver cleanup failed');
  }
}
