/* eslint-disable @typescript-eslint/no-explicit-any */
// Finite test-only recipe. Native process qualification belongs to an external supervisor.
import PLAN from '../../../experiments/step5/4/menu-capture-native-plan.json';
import { musicNativeContent, musicNativeState } from './music-native-fixture';
import { captureHostReady } from './d2-capture-me';
export const menuCaptureNativePlan = PLAN;

/** Read actual rendered bitmap colours, not drawText calls or the view alone. */
export function menuPaletteEvidence(menu: any): any[] {
  const b = menu.contents, width = b.width, height = b.height;
  const rgba = b.context.getImageData(0, 0, width, height).data;
  const count = (r: any, colour: string) => {
    const rgb = [1, 3, 5].map(i => parseInt(colour.slice(i, i + 2), 16)); let hits = 0;
    for (let y = Math.max(0, r.y); y < Math.min(height, r.y + r.height); y++)
      for (let x = Math.max(0, r.x); x < Math.min(width, r.x + r.width); x++) {
        const at = (y * width + x) * 4;
        if (rgba[at + 3] && rgb.every((v, i) => Math.abs(rgba[at + i] - v) <= 16)) hits++;
      }
    return hits;
  };
  return PLAN.cards.map((expected, i) => {
    const r = menu.itemRect(i), x = r.x + 8, w = r.width - 16;
    const badge = Math.min(112, Math.floor(w / 2)), y = r.y + menu.lineHeight() + 4;
    const typeRect = { x, y, width: badge, height: menu.lineHeight() };
    const ppRect = { x: x + badge + 6, y, width: w - badge - 6, height: menu.lineHeight() };
    return { index: i, slot: menu._items[i].ext, view: { ...menu._items[i].moveView }, typeRect, ppRect,
      typePixels: count(typeRect, expected.typeColour), ppPixels: count(ppRect, expected.ppColour) };
  });
}

export async function runD2MenuCapture(p: any): Promise<void> {
  const { G, W, api, fs, path, OUT, gameDir, arg, argv, assert, eq, clone, report, results, writeProgress, frames, waitFor, scene, battle, inMode, press, toMapId } = p;
  const E = api(), flow = W.PSFlow, audio = G.AudioManager;
  const hash = (v: any) => p.nodeRequire('crypto').createHash('sha256').update(v).digest('hex');
  const stable = (v: any) => E.contentCompile.canonicalJson(v), fileHash = (f: string) => hash(fs.readFileSync(f));
  assert(OUT && arg('ps-menu-capture-input') && !arg('ps-flow-only') && argv.includes('--ps-sound'), 'whole isolated menu/capture mode');
  const bytes = fs.readFileSync(arg('ps-menu-capture-input')), input = JSON.parse(bytes), info = JSON.parse(fs.readFileSync(path.join(gameDir, 'package-info.json')));
  eq(input.version, PLAN.version, 'new plan version'); eq(input.productCommit, PLAN.productCommit, 'fixed e9 product'); eq(input.productRuntime, PLAN.productRuntime, 'fixed runtime identities');
  eq(input.planSHA256, hash(stable(PLAN)), 'exact new plan'); eq(info.gitHead, input.packageHead, 'actual package head'); eq(info.workingTreeChanges, 0, 'clean package');
  for (const [rel, digest] of Object.entries(PLAN.productRuntime)) eq(fileHash(path.join(gameDir, rel)), digest, 'actual product ' + rel);
  eq(fileHash(path.join(gameDir, 'js/plugins/PS_BattleFlowTest.js')), input.driverPluginSHA256, 'actual driver');
  for (const [key, paths] of [['worldFiles', PLAN.worldFiles], ['fontFiles', PLAN.fontResourcePaths]] as const) {
    eq(Object.keys(input[key]).sort(), [...paths].sort(), 'exact ' + key);
    for (const [rel, digest] of Object.entries(input[key])) eq(fileHash(path.join(gameDir, rel)), digest, 'actual ' + key + ' ' + rel);
  }
  eq(input.assets.map((r: any) => r.path).sort(), [...PLAN.requiredAssets].sort(), 'exact qualified media');
  for (const r of input.assets) eq(fileHash(path.join(gameDir, r.path)), r.sha256, 'actual media');
  eq(path.resolve(arg('ps-save-dir')), path.resolve(input.saveRoot), 'isolated save argument'); eq(path.resolve(G.StorageManager.fileDirectoryPath()), path.resolve(input.saveRoot), 'actual storage');
  const rel = path.relative(fs.realpathSync(gameDir), fs.realpathSync(input.saveRoot)); assert(rel === '..' || rel.startsWith('..' + path.sep), 'storage outside APP'); eq(fs.readdirSync(input.saveRoot), [], 'fresh empty test storage');
  const ids = PLAN.cases.map(c => c.id); eq(ids, ['MC01', 'MC02'], 'two ordered cases');
  const d: any = report.menuCaptureNative = { version: PLAN.version, productCommit: PLAN.productCommit, productRuntime: PLAN.productRuntime, packageHead: input.packageHead, driverPluginSHA256: input.driverPluginSHA256, inputSHA256: hash(bytes), expectedIDs: ids, notRunIDs: [...ids], nativeClaim: 'NOT_SELF_QUALIFIED', cases: {}, renders: [], cleanupErrors: [], physicalInput: 'NOT_VERIFIED', physicalHearing: 'NOT_VERIFIED' };
  report.hostDriverVersion = PLAN.version;
  const original = { parameters: G.PluginManager.parameters, language: flow.lang, fast: flow.fast, update: G.Scene_PSBattle.prototype.update, createBuffer: audio.createBuffer };
  let first = true, language = 'en', active: any = null;
  const nativeRows: any[] = [], named = (n: string) => PLAN.prefix + n;
  const parameters = function (this: any, name: string) { const raw = original.parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...raw, language, battleMusic: JSON.stringify({ presets: { battle: named('battle'), capture: named('long') } }) } : raw; };
  const createBuffer = function (this: any, folder: string, name: string) {
    const buffer = original.createBuffer.call(this, folder, name);
    if (folder === 'me/' && name === named('long')) {
      const play = buffer.play, row: any = { buffer, play, plays: [] }; nativeRows.push(row);
      row.wrapper = function (this: any, ...args: any[]) { const value = play.apply(this, args); row.plays.push({ frame: G.Graphics.frameCount, at: G.performance.now(), sources: (this._sourceNodes ?? []).map((n: any) => ({ tag: Object.prototype.toString.call(n), hasBuffer: !!n.buffer })) }); return value; };
      buffer.play = row.wrapper;
    }
    return buffer;
  };
  const mapReady = () => captureHostReady(G, scene(), 'map'), titleReady = () => captureHostReady(G, scene(), 'title');
  const unchanged = (h: any) => {
    if (!h || h.retired) return; if (h.observerError) throw h.observerError;
    eq(stable(flow.game()), stable(h.before), 'whole persistent state unchanged'); eq(h.installs.length, 0, 'no persistent install'); h.stateChecks++;
  };
  const render = (h: any, stage: string) => {
    const target = stage === 'move-cards' ? h.scene._menu : h.scene._log, contents = target?._contentsSprite;
    assert(target?.visible && target.openness !== 0 && contents?.renderable !== false, 'visible actual contents');
    const id = h.id + '-' + stage, saved = contents.renderable, layer = h.scene._windowLayer;
    const rect = { x: target.x + (layer?.x ?? 0), y: target.y + (layer?.y ?? 0), width: target.width, height: target.height };
    let shown: any, clear: any, row: any;
    try {
      shown = G.Bitmap.snap(h.scene); contents.renderable = false; clear = G.Bitmap.snap(h.scene); contents.renderable = saved;
      eq([shown.width, shown.height], [clear.width, clear.height], 'same update image dimensions');
      const rgba = [shown, clear].map(b => b.context.getImageData(0, 0, b.width, b.height).data); let cells = 0, changed = 0;
      for (let y = Math.max(0, rect.y); y < Math.min(shown.height, rect.y + rect.height); y += 4)
        for (let x = Math.max(0, rect.x); x < Math.min(shown.width, rect.x + rect.width); x += 4) {
          cells++; const at = (y * shown.width + x) * 4; if ([0, 1, 2].some(i => rgba[0][at + i] !== rgba[1][at + i])) changed++;
        }
      const images = [shown, clear].map((b, i) => { const file = id + (i ? '-no-contents' : '') + '.png', png = p.nodeRequire('buffer').Buffer.from(b.canvas.toDataURL('image/png').split(',')[1], 'base64'); fs.writeFileSync(path.join(path.dirname(OUT), file), png, { flag: 'wx' }); return { file, sha256: hash(png) }; });
      row = { id, stage, ...images[0], comparisonPNG: images[1], cells, changed, sampling: { version: 'actual-window-layer-content-rgb-v1', rect, stride: 4, channels: 'RGB', cleanup: false }, pixelGate: changed > 0 ? 'pass' : 'fail', frame: G.Graphics.frameCount, update: h.scene._pictureUpdate, at: G.performance.now(), language, message: clone(h.scene.ordinaryMessageState()), lines: [...h.scene._log._lines], menu: clone(h.scene.inputState()), installs: h.installs.length, stateSHA256: hash(stable(flow.game())) };
      d.renders.push(row); writeProgress(); assert(changed > 0, 'actual menu/capture glyph pixels'); return row;
    } finally { contents.renderable = saved; shown?.destroy(); clear?.destroy(); if (row) { row.sampling.cleanup = contents.renderable === saved; writeProgress(); } }
  };
  const observe = (h: any) => {
    unchanged(h); if (!h.gotcha) return;
    const s = h.scene, m = clone(s.ordinaryMessageState()), cap = clone(s.captureMelodyState()), at = G.performance.now(), update = s._pictureUpdate;
    assert(h.updates.length < 3600, 'bounded trace'); h.updates.push({ frame: G.Graphics.frameCount, update, at, message: m, lines: [...s._log._lines], capture: cap, ready: s.inputState().ready, menuVisible: s._menu.visible, installs: h.installs.length, stateSHA256: hash(stable(flow.game())) });
    if (!h.full && m?.phase === 'full' && s._log._lines.join('') === h.gotcha) { h.full = { at, update, frame: G.Graphics.frameCount }; render(h, 'gotcha-full'); }
    if (cap?.started && !h.start) { assert(h.full, 'full Gotcha before ME request'); eq(update, h.full.update + 1, 'ME starts next Scene update, without a dwell'); h.start = { at, update, frame: G.Graphics.frameCount }; }
    if (cap?.started && !cap.completed && !cap.cancelled) {
      eq(s._log._lines.join(''), h.gotcha, 'full Gotcha retained during ME'); eq(m?.phase, 'full', 'text still full'); assert(!s.inputState().ready && !s._menu.visible, 'capture block owns input');
      const row = nativeRows[h.nativeFrom];
      if (!h.mid && at - h.start.at >= 250 && row?.plays.length) {
        const buffers = row.buffer._buffers ?? [], asset = input.assets.find((r: any) => r.path === 'audio/me/' + named('long') + '.ogg');
        assert(asset && !row.buffer.isError() && row.buffer.isReady(), 'real ME decoded without error');
        const decoded = buffers.map((b: any) => ({ tag: Object.prototype.toString.call(b), duration: b.duration, sampleRate: b.sampleRate, channels: b.numberOfChannels }));
        assert(decoded.length && decoded.every((b: any) => b.tag === '[object AudioBuffer]' && b.sampleRate > 0 && b.channels === asset.expectedNativeChannels), 'native AudioBuffer evidence');
        const duration = decoded.reduce((n: number, b: any) => n + b.duration, 0); assert(duration >= asset.nativeDurationRangeSeconds[0] && duration <= asset.nativeDurationRangeSeconds[1], 'frozen native duration');
        assert(row.plays.some((r: any) => r.sources.some((n: any) => n.tag === '[object AudioBufferSourceNode]' && n.hasBuffer)), 'native source really created');
        h.mid = { at, update, decoded, plays: clone(row.plays) }; render(h, 'melody-visible');
      }
    }
    if (cap?.completed && !h.complete) { assert(h.start && at - h.start.at >= PLAN.waitMs, 'unchanged mandatory3500ms'); assert(h.mid, 'actual ME and visible text evidence before completion'); h.complete = { at, update, phase: cap }; }
  };
  const update = function (this: any, ...args: any[]) {
    const h = active; if (h && this === h.scene) try { unchanged(h); } catch (e) { h.observerError = e; return; }
    const value = original.update.apply(this, args);
    if (h && this === h.scene) try { observe(h); } catch (e) { h.observerError = e; }
    return value;
  };
  const wait = (f: () => boolean, label: string) => waitFor(() => { unchanged(active); if (active?.scene?._failure && !active.controlledAbort) throw Error('actual Scene failure: ' + active.scene._failure); return f(); }, label);
  const command = (h: any, key: any) => { const v = h.scene.inputState(); assert(v.ready, 'actual input ready'); const i = v.items.findIndex((r: any) => r.key === key); assert(i >= 0, 'stable command'); h.scene._menu.select(i); h.scene._menu.processOk(); };
  const work = (h: any) => stable({ bag: h.session.bag, party: h.session.party, p1: h.session.gw.readState('p1'), p2: h.session.gw.readState('p2'), request: h.session.currentRequest() });
  const retire = (h: any) => { if (!h) return; const desc = Object.getOwnPropertyDescriptor(h.system, '_psGame'); if (desc?.get === h.get && desc?.set === h.set) Object.defineProperty(h.system, '_psGame', { ...h.descriptor, value: h.value }); h.retired = true; };
  const run = async (c: any) => {
    const began = G.performance.now(); let h: any;
    try {
      await wait(() => mapReady() || first && titleReady(), 'started cold Title or later Map'); first = false;
      assert(!flow.operationPending() && !flow._app?.saveBlocked, 'previous root released'); flow.stateReplaced(); flow._app = null; language = c.language; flow.setLanguage(null);
      const content = musicNativeContent(E, assert); flow._content = content; flow._dex = E.dex.createDexLookup(); flow.seed = [...PLAN.seed]; flow.rng = () => 0; flow.fast = false;
      const state = musicNativeState(E, content); state.party[0].moves = clone(PLAN.moves); G.$gameSystem._psGame = state;
      G.$gameMessage.clear(); G.$gameMap._interpreter.clear(); await toMapId(PLAN.mapId, 8, 9); await wait(mapReady, 'Map start/windows/spriteset'); await press('shift');
      audio.playBgm({ name: named('world'), volume: 80, pitch: 100, pan: 0 }); await wait(() => audio._currentBgm?.name === named('world') && audio._bgmBuffer?.isReady(), 'explicit decoded world BGM');
      const system = G.$gameSystem, descriptor: any = Object.getOwnPropertyDescriptor(system, '_psGame'); assert(descriptor?.configurable && descriptor.writable && 'value' in descriptor, 'observable plain state');
      h = active = { id: c.id, system, descriptor, value: descriptor.value, before: clone(flow.game()), installs: [], updates: [], stateChecks: 0, retired: false, nativeFrom: nativeRows.length };
      h.get = () => h.value; h.set = (v: any) => { h.installs.push({ frame: G.Graphics.frameCount, at: G.performance.now() }); h.value = v; }; Object.defineProperty(system, '_psGame', { configurable: true, enumerable: descriptor.enumerable, get: h.get, set: h.set });
      h.app = flow.app(); h.generation = h.app.stateGeneration;
      flow.openBattle({ kind: 'wild', foes: [{ species: 'Pidgey', level: 3 }], battleId: PLAN.version + '/' + c.id, seq: ids.indexOf(c.id) + 1, canLose: true }); h.op = flow._op;
      await inMode('main'); h.scene = battle(); h.session = h.scene._session; assert(h.session === h.op.session && h.app.saveBlocked && flow.fast === false, 'real normal-speed Session owner'); eq(flow.translator().lang, c.language, 'actual language'); unchanged(h);
      command(h, 'fight'); await inMode('moves'); h.scene._menu.select(3); eq(h.scene._menu.index(), 3, 'fourth slot cursor');
      const image = render(h, 'move-cards'); image.palette = menuPaletteEvidence(h.scene._menu); writeProgress();
      for (const [i, row] of image.palette.entries()) { const expected = PLAN.cards[i]; eq(row.slot, i + 1, 'stable slot'); for (const key of ['type', 'typeColour', 'pp', 'ppColour']) eq(row.view[key], expected[key as keyof typeof expected], 'actual public view ' + key); eq(row.view.typeLabel, flow.translator().tOr('pokedex.type.' + expected.type, expected.type), 'localized type'); assert(row.typePixels > 0 && row.ppPixels > 0, 'actual rendered type and PP colours'); }
      const before = work(h); command(h, PLAN.zeroPPKey); await wait(() => h.scene.inputState().ready && !h.scene._busy, 'normal PP0 refusal returns'); eq(h.scene._mode, 'moves', 'refusal moves'); eq(h.scene._menu.index(), 3, 'nonfirst rejected cursor restored'); eq(work(h), before, 'refusal consumes no working state');
      h.scene._menu.processCancel(); eq(h.scene._mode, 'main', 'BACK main'); command(h, 'fight'); await inMode('moves'); eq(h.scene._menu.index(), 3, 'reentry cursor memory'); h.scene._menu.processCancel();
      h.scene.act(async () => { const result = await h.session.throwBall('masterball'); assert(result.ok, 'real submitted Master Ball'); const event = result.messages.find((m: any) => m.kind === 'events' && m.events.some((e: any) => e.type === 'rpg' && e.args[0] === 'ball' && e.args[1] === 'p1' && e.args[4] === 'caught')); assert(event, 'real caught event'); h.gotcha = h.scene._D.message(event).at(-1); assert(typeof h.gotcha === 'string' && h.gotcha.length, 'localized event text'); h.action = clone(result); return result; }, 'bag');
      await wait(() => !!h.mid, 'normal full Gotcha then native ME and retained text');
      if (c.ending === 'after-complete') await wait(() => !!h.complete, 'full3500ms completion'); else assert(h.scene.captureMelodyState().wait.busy && !h.scene.captureMelodyState().completed && !h.complete, 'cancel while melody pending');
      unchanged(h); h.controlledAbort = true; flow.abort(Error('owned menu/capture cancellation'), h.op); await wait(() => h.scene._mode === 'end' && h.scene.inputState().ready, 'aborted Back');
      h.scene._menu.processOk(); await wait(() => mapReady() && !flow.operationPending() && !h.app.saveBlocked, 'Map and root release'); await frames(3); unchanged(h);
      eq(d.renders.filter((r: any) => r.id.startsWith(c.id + '-')).map((r: any) => r.stage), PLAN.renderStages[c.id as keyof typeof PLAN.renderStages], 'exact three keyframes');
      d.cases[c.id] = { language, fast: false, before: h.before, after: clone(flow.game()), beforeSHA256: hash(stable(h.before)), afterSHA256: hash(stable(flow.game())), installs: h.installs, stateChecks: h.stateChecks, full: h.full, start: h.start, mid: h.mid, complete: h.complete ?? null, updates: h.updates, action: h.action, ending: c.ending, rootReleased: !h.app.saveBlocked };
      retire(h); active = null; results.push({ id: c.id, status: 'pass', ms: G.performance.now() - began });
    } catch (e) { results.push({ id: c.id, status: 'fail', error: String((e as any)?.stack ?? e) }); throw e; }
    finally { d.notRunIDs = ids.filter(id => !results.some((r: any) => r.id === id)); writeProgress(); }
  };
  let failed = false, primary: unknown;
  try { G.PluginManager.parameters = parameters; G.Scene_PSBattle.prototype.update = update; audio.createBuffer = createBuffer; for (const c of PLAN.cases) await run(c); eq(results.map((r: any) => [r.id, r.status]), ids.map(id => [id, 'pass']), 'whole two-case recipe'); }
  catch (e) { failed = true; primary = e; throw e; }
  finally {
    d.primaryError = failed ? String(primary) : null;
    const clean = (name: string, f: () => void) => { try { f(); } catch (e) { d.cleanupErrors.push({ name, error: String(e) }); } };
    if (active?.op && active.app && flow._op === active.op && flow._app === active.app && active.app.stateGeneration === active.generation) clean('own root', () => flow.abort(Error('menu/capture failure cleanup'), active.op));
    clean('observers', () => retire(active)); clean('update', () => { if (G.Scene_PSBattle.prototype.update === update) G.Scene_PSBattle.prototype.update = original.update; }); clean('parameters', () => { if (G.PluginManager.parameters === parameters) G.PluginManager.parameters = original.parameters; }); clean('buffer factory', () => { if (audio.createBuffer === createBuffer) audio.createBuffer = original.createBuffer; });
    for (const r of nativeRows) clean('play observer', () => { if (r.buffer.play === r.wrapper) r.buffer.play = r.play; });
    clean('language', () => flow.setLanguage(original.language)); flow.fast = original.fast; d.remainingRootLocked = !!flow._app?.saveBlocked; d.cleanupComplete = d.cleanupErrors.length === 0; writeProgress();
    if (!failed && d.cleanupErrors.length) throw Error('menu/capture cleanup failed');
  }
}
