/* eslint-disable @typescript-eslint/no-explicit-any */
// Test-only ordinary long author dialogue. External supervision qualifies native execution.
import PLAN from '../../../experiments/step5/4/author-dialogue-native-plan.json';
import { musicNativeContent, musicNativeState } from './music-native-fixture';
import { captureHostReady } from './d2-capture-me';
export const authorDialogueNativePlan = PLAN;

export async function runD2AuthorDialogue(p: any): Promise<void> {
  const { G, W, api, fs, path, OUT, gameDir, arg, argv, assert, eq, clone, report, results, writeProgress, frames, waitFor, scene, battle, inMode, press, toMapId } = p;
  const E = api(), flow = W.PSFlow, hash = (b: any) => p.nodeRequire('crypto').createHash('sha256').update(b).digest('hex');
  const stable = (v: any) => E.contentCompile.canonicalJson(v), fileHash = (f: string) => hash(fs.readFileSync(f));
  assert(OUT && arg('ps-author-dialogue-input') && !arg('ps-flow-only') && argv.includes('--ps-sound'), 'whole isolated author-dialogue mode');
  const bytes = fs.readFileSync(arg('ps-author-dialogue-input')), input = JSON.parse(bytes), info = JSON.parse(fs.readFileSync(path.join(gameDir, 'package-info.json')));
  eq(input.version, PLAN.version, 'opening input'); eq(input.productCommit, PLAN.productCommit, 'fixed opening product'); eq(input.productRuntime, PLAN.productRuntime, 'product runtime identities');
  eq(input.planSHA256, hash(stable(PLAN)), 'frozen opening plan'); eq(info.gitHead, input.packageHead, 'package head'); eq(info.workingTreeChanges, 0, 'clean package');
  for (const [name, value] of Object.entries(PLAN.productRuntime)) eq(fileHash(path.join(gameDir, name)), value, 'actual dialogue product ' + name);
  eq(fileHash(path.join(gameDir, 'js/plugins/PS_BattleFlowTest.js')), input.driverPluginSHA256, 'actual dialogue driver');
  eq(path.resolve(arg('ps-save-dir')), path.resolve(input.saveRoot), 'isolated save argument'); eq(path.resolve(G.StorageManager.fileDirectoryPath()), path.resolve(input.saveRoot), 'actual storage');
  const rel = path.relative(fs.realpathSync(gameDir), fs.realpathSync(input.saveRoot)); assert(rel === '..' || rel.startsWith('..' + path.sep), 'storage outside APP'); eq(fs.readdirSync(input.saveRoot), [], 'fresh storage');
  eq(input.fontAssets.map((r: any) => r.path).sort(), [...PLAN.fontResourcePaths].sort(), 'font/layout resource set');
  for (const r of input.fontAssets) eq(fileHash(path.join(gameDir, r.path)), r.sha256, 'actual font/layout resource');
  eq(input.assets.map((r: any) => r.path).sort(), [...PLAN.requiredAssets].sort(), 'qualified media set');
  for (const r of input.assets) eq(fileHash(path.join(gameDir, r.path)), r.sha256, 'actual media');
  const ids = PLAN.cases.map(c => c.id), d: any = report.authorDialogueNative = { version: PLAN.version, inputSHA256: hash(bytes), productCommit: PLAN.productCommit, productRuntime: PLAN.productRuntime, driverPluginSHA256: input.driverPluginSHA256, packageHead: input.packageHead, nativeClaim: 'NOT_SELF_QUALIFIED', expectedIDs: ids, notRunIDs: [...ids], cases: {}, renders: [], cleanupErrors: [], physicalInput: 'NOT_VERIFIED' };
  report.hostDriverVersion = PLAN.version;
  let first = true, language = 'en', active: any = null, ordinal = 0, rng = PLAN.worldSeed;
  const original = { parameters: G.PluginManager.parameters, language: flow.lang, fast: flow.fast, start: G.Scene_PSBattle.prototype.start, addMessage: G.$gameMessage.add };
  const named = (name: string) => PLAN.prefix + name;
  const parameters = function (this: any, name: string) { const v = original.parameters.call(this, name); return name === 'PS_BattleFlow' ? { ...v, language, battleMusic: JSON.stringify({ presets: { battle: named('battle'), victory: named('victory') } }) } : v; };
  const bodies = (s: any) => s.children.filter((x: any) => x._psPictureRole === 'body');
  const hidden = (s: any) => bodies(s).every((x: any) => !x.visible || x.opacity === 0 || x.scale.x === 0 || x.scale.y === 0);
  const latest = (s: any) => s._log._lines.at(-1);
  const normalized = (text: string) => text.replace(/\r\n|\r|\n/g, '');
  const messages: any[] = [];
  const addMessage = function (this: any, line: string) { messages.push({ line, frame: G.Graphics.frameCount }); return original.addMessage.call(this, line); };
  const unchanged = (h: any) => { eq(h.installs.length, 0, 'zero actual state installs before tail confirmation'); eq(flow.game(), h.before, 'whole pre-confirmation state unchanged'); assert(h.app.saveBlocked, 'root remains save-locked while reading'); };
  const mapReady = () => captureHostReady(G, scene(), 'map'), titleReady = () => captureHostReady(G, scene(), 'title');
  const wait = (cond: () => boolean, label: string) => waitFor(() => { if (active?.scene?._failure && !active.controlledAbort) throw Error('actual opening Scene failure: ' + active.scene._failure); return cond(); }, label);
  const retire = (h: any) => {
    const desc = Object.getOwnPropertyDescriptor(h.system, '_psGame');
    if (desc?.get === h.get && desc?.set === h.set) Object.defineProperty(h.system, '_psGame', { ...h.descriptor, value: h.value });
    if (!h.scene) return;
    if (h.scene.update === h.observeUpdate) h.scene.update = h.update;
    for (const method of ['add', 'setLines']) if (h.scene?._log[method] === h.observers?.[method]) h.scene._log[method] = h.methods[method];
  };
  const start = function (this: any, ...args: any[]) {
    const h = active;
    if (h && this._psOp === flow._op) {
      h.scene = this; h.op = this._psOp; h.app = flow.app(); h.generation = h.app.stateGeneration;
      h.methods = {}; h.observers = {};
      for (const method of ['add', 'setLines']) {
        h.methods[method] = this._log[method]; h.observers[method] = function (this: any, ...args: any[]) {
          const result = h.methods[method].apply(this, args); h.draws.push({ rows: [...this._lines], frame: G.Graphics.frameCount, at: G.performance.now() }); return result;
        }; this._log[method] = h.observers[method];
      }
      h.update = this.update; h.observeUpdate = function (this: any, ...a: any[]) { const result = h.update.apply(this, a); h.updates.push({ frame: G.Graphics.frameCount, at: G.performance.now(), pause: !!this._log.pause, draw: h.draws.length, hidden: hidden(this), ready: this.inputState().ready, phase: this._mode, installs: h.installs.length }); return result; }; this.update = h.observeUpdate;
    }
    return original.start.apply(this, args);
  };
  const render = (h: any, id: string, opening: boolean) => {
    const log = h.scene._log, arrow = log._pauseSignSprite;
    assert(log.visible && log.openness !== 0 && log.pause && arrow?.visible && arrow.alpha > .5, 'visible paused window and actual arrow');
    if (opening) assert(hidden(h.scene), 'both pending first portraits hidden');
    const original = { logVisible: log.visible, visible: arrow.visible, renderable: arrow.renderable, alpha: arrow.alpha };
    const startedAt = G.performance.now(), startedFrame = G.Graphics.frameCount;
    let shown: any, noArrow: any, noLog: any, row: any = null;
    try {
      shown = G.Bitmap.snap(h.scene);
      const shownArrow = { visible: arrow.visible, renderable: arrow.renderable, alpha: arrow.alpha };
      // Window.onRender refreshes visible from isOpen(); renderable is the temporary Pixi draw gate.
      arrow.renderable = false; noArrow = G.Bitmap.snap(h.scene);
      arrow.renderable = original.renderable; log.visible = false; noLog = G.Bitmap.snap(h.scene);
      const snapshotsEndedAt = G.performance.now();
      assert([noArrow, noLog].every(bitmap => bitmap.width === shown.width && bitmap.height === shown.height), 'same-size opening snapshots');
      const rgba = [shown, noArrow, noLog].map(bitmap => bitmap.context.getImageData(0, 0, bitmap.width, bitmap.height).data);
      const readbacksEndedAt = G.performance.now();
      let textPixels = 0, arrowPixels = 0, gridCells = 0;
      for (let y = 120; y < Math.min(shown.height, 420); y += 2) for (let x = 0; x < Math.min(shown.width, 816); x += 2) {
        const offset = (y * shown.width + x) * 4; gridCells++;
        // Match Bitmap.getPixel's RGB-only comparison on precisely the original 2-pixel grid.
        if (rgba[0][offset] !== rgba[2][offset] || rgba[0][offset + 1] !== rgba[2][offset + 1] || rgba[0][offset + 2] !== rgba[2][offset + 2]) textPixels++;
        if (rgba[0][offset] !== rgba[1][offset] || rgba[0][offset + 1] !== rgba[1][offset + 1] || rgba[0][offset + 2] !== rgba[1][offset + 2]) arrowPixels++;
      }
      const glyphData = log.contents.context.getImageData(0, 0, log.contents.width, log.contents.height).data;
      let glyphPixels = 0; for (let i = 3; i < glyphData.length; i += 4) if (glyphData[i] > 0) glyphPixels++;
      const lineWidths = log._lines.map((line: string) => log.textWidth(line));
      const fits = log._lines.length <= log._max && lineWidths.every((width: number) => width <= log.innerWidth);
      const comparisonsEndedAt = G.performance.now();
      const images = [shown, noArrow, noLog].map((bitmap, index) => {
        const file = path.join(path.dirname(OUT), id + ['', '-no-arrow', '-no-window'][index] + '.png');
        const png = p.nodeRequire('buffer').Buffer.from(bitmap.canvas.toDataURL('image/png').split(',')[1], 'base64');
        fs.writeFileSync(file, png, { flag: 'wx' });
        return { kind: ['shown', 'no-arrow', 'no-window'][index], file: path.basename(file), sha256: hash(png) };
      });
      row = { id, stage: opening ? 'opening' : 'terminal', file: images[0].file, sha256: images[0].sha256, comparisonPNGs: images.slice(1), textPixels, arrowPixels, glyphPixels, lineWidths, fits, innerWidth: log.innerWidth, visibleRows: log._max, fontFace: log.contents.fontFace, fontSize: log.contents.fontSize, lineHeight: log.lineHeight(), pixelGate: textPixels > 0 && arrowPixels > 0 && glyphPixels > 0 && fits ? 'pass' : 'fail', lines: [...log._lines], arrow: shownArrow, frame: startedFrame, at: startedAt, language, hiddenFirstPortraits: hidden(h.scene), installs: h.installs.length, stateSHA256: hash(stable(flow.game())), sampling: { version: 'window-render-rgb-grid-v2', startedAt, snapshotsEndedAt, readbacksEndedAt, comparisonsEndedAt, persistedAt: G.performance.now(), gridCells, bulkReadbacks: 3, glyphReadbacks: 1, channelsCompared: 'RGB', stride: 2 } };
      // Retain all images, counts and fixed report identities even when the unchanged pixel gate rejects.
      d.renders.push(row); writeProgress();
      assert(textPixels > 0 && arrowPixels > 0 && glyphPixels > 0 && fits, 'actual dialogue glyphs/window/arrow pixels and measured layout');
      return row;
    } finally {
      arrow.visible = original.visible; arrow.renderable = original.renderable; arrow.alpha = original.alpha; log.visible = original.logVisible;
      shown?.destroy(); noArrow?.destroy(); noLog?.destroy();
      if (row) {
        row.sampling.endedAt = G.performance.now(); row.sampling.elapsedMs = row.sampling.endedAt - startedAt;
        row.sampling.cleanup = { logVisible: log.visible === original.logVisible, arrowVisible: arrow.visible === original.visible, arrowRenderable: arrow.renderable === original.renderable, arrowAlpha: arrow.alpha === original.alpha };
        writeProgress();
      }
    }
  };
  const run = async (c: any) => {
    const began = G.performance.now();
    try {
      await wait(() => mapReady() || first && titleReady(), 'started cold Title or later Map'); first = false;
      assert(!flow.running && !flow._app?.saveBlocked, 'prior root released');
      flow.stateReplaced(); flow._app = null; language = c.language; flow.setLanguage(null);
      const content = musicNativeContent(E, assert, { battle: named('battle'), victory: named('trainer-victory') });
      Object.assign(content.trainerTypes['music-type-normal'], { openingText: c.openingText, loseText: c.loseText, introBgm: '', baseMoney: 20 });
      content.trainers['music-normal'][0].name = c.name;
      flow._content = content; flow._dex = E.dex.createDexLookup(); flow.developerCapabilities = {}; flow.seed = [...PLAN.seed]; rng = PLAN.worldSeed;
      flow.rng = (n: number) => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return Math.floor(rng / 4294967296 * n); }; flow.fast = false;
      G.$gameSystem._psGame = musicNativeState(E, content); G.$gameMessage.clear(); G.$gameMap._interpreter.clear();
      await toMapId(PLAN.mapId, 8, 9); await wait(mapReady, 'actual Map.start/windows/spriteset'); await press('shift');
      G.AudioManager.playBgm({ name: named('world'), volume: 80, pitch: 100, pan: 0 });
      const system = G.$gameSystem, descriptor: any = Object.getOwnPropertyDescriptor(system, '_psGame'); assert(descriptor?.configurable && descriptor.writable && 'value' in descriptor, 'observable plain state property');
      const h: any = active = { system, descriptor, value: descriptor.value, installs: [], before: clone(flow.game()), draws: [], updates: [], commands: [], messagesAt: messages.length };
      h.get = () => h.value; h.set = (value: any) => { h.installs.push({ at: G.performance.now(), frame: G.Graphics.frameCount, oldMoney: h.value.money, newMoney: value.money, beforeSHA256: hash(stable(h.value)), afterSHA256: hash(stable(value)) }); h.value = value; };
      Object.defineProperty(system, '_psGame', { configurable: true, enumerable: descriptor.enumerable, get: h.get, set: h.set });
      flow.openBattle({ kind: 'trainer', trainer: { id: 'music-normal', version: 1 }, battleId: PLAN.version + '/' + c.id, seq: ++ordinal, canLose: true });
      await wait(() => !!h.scene?._log.pause, 'short challenge displayed');
      const tr = flow.translator(), challenge = tr.t('trainer.challenged', { name: c.name }), header = tr.t('trainer.defeated', { name: c.name });
      eq(tr.lang, c.language, 'production translator'); eq(h.scene._log._lines.at(-1), challenge, 'ordinary short challenge retained');
      await wait(() => h.scene._log._pauseSignSprite?.visible && h.scene._log._pauseSignSprite.alpha > .5, 'actual challenge arrow');
      render(h, c.id + '-challenge', true); unchanged(h); await press('ok');
      const openingPages: any[] = [];
      for (let n = 0; n < PLAN.maximumPagesPerSection; n++) {
        await wait(() => h.scene._log.pause || h.scene.inputState().ready, 'next opening page or normal main');
        if (h.scene.inputState().ready) break;
        const step = h.scene._queue[0], draw = h.draws.at(-1), rows = [...h.scene._log._lines];
        assert(!h.scene._menu.visible && !h.scene.inputState().ready && hidden(h.scene), 'opening pages keep commands and pending portraits hidden'); unchanged(h);
        await wait(() => h.scene._log._pauseSignSprite?.visible && h.scene._log._pauseSignSprite.alpha > .5, 'actual long opening arrow');
        const image = render(h, c.id + '-opening-' + (n + 1), true); assert(G.performance.now() - draw.at < 3000, 'opening read before auto timeout');
        openingPages.push({ rows, image: image.id, shownAt: draw.at, confirmedFrame: G.Graphics.frameCount });
        await press(n % 2 ? 'cancel' : 'ok'); await wait(() => h.scene._queue[0] !== step, 'real input advances exactly this opening step');
        assert(G.performance.now() - draw.at < 3000, 'actual input, not automatic timeout, advanced opening'); unchanged(h);
      }
      await inMode('main');
      eq(openingPages.flatMap(x => x.rows).join(''), normalized(c.openingText), 'all authored opening characters read without truncation');
      assert(openingPages.length >= PLAN.minimumAuthorPages && openingPages.flatMap(x => x.rows).includes(''), 'multiple opening pages retain explicit blank paragraph');
      assert(bodies(h.scene).length === 2 && bodies(h.scene).every((x: any) => x.visible && x.scale.x === 1), 'normal first portraits appear only after reading'); unchanged(h);
      const choose = async (phase: string, key: any) => {
        await inMode(phase); const state = h.scene.inputState(), index = state.items.findIndex((item: any) => item.key === key && item.enabled);
        assert(state.ready && index >= 0, 'actual enabled stable command identity'); h.scene._menu.select(index); h.commands.push({ phase, key, frame: G.Graphics.frameCount }); await press('ok');
      };
      for (let n = 0; n < 12 && !h.scene._session.ended; n++) {
        await choose('main', 'fight'); await choose('moves', 1);
        await wait(() => ['main', 'end'].includes(h.scene.inputState().phase) && !h.scene._busy && h.scene._queue.length === 0, 'normal action completed');
      }
      await inMode('end'); eq(h.scene._session.result().outcome.winner, 'Player', 'ordinary trainer victory'); unchanged(h);
      const terminalPages: any[] = [], expected = normalized(header + c.loseText);
      const firstRows = [...h.scene._log._lines]; const firstPage = h.scene._endFeedbackPage, dwellAt = G.performance.now();
      await wait(() => G.performance.now() - dwellAt >= 4000, 'terminal page naturally waits beyond nonterminal timeout');
      eq(h.scene._endFeedbackPage, firstPage, 'terminal does not auto advance'); eq(h.scene._log._lines, firstRows, 'terminal page still actually visible'); unchanged(h);
      for (let n = 0; n < PLAN.maximumPagesPerSection; n++) {
        const rows = [...h.scene._log._lines]; terminalPages.push({ rows });
        const shown = terminalPages.flatMap(x => x.rows).join(''); assert(expected.startsWith(shown), 'actual terminal pages preserve order and prefix');
        unchanged(h); await wait(() => h.scene._log._pauseSignSprite?.visible && h.scene._log._pauseSignSprite.alpha > .5, 'actual terminal arrow');
        terminalPages[n].image = render(h, c.id + '-terminal-' + (n + 1), false).id;
        const last = shown === expected; terminalPages[n].tail = last; await frames(1); await choose('end', 'end');
        if (last) break;
        assert(flow.running && h.scene.inputState().ready && h.scene._log.pause, 'real host Continue remains active for next page'); unchanged(h);
      }
      eq(terminalPages.flatMap(x => x.rows).join(''), expected, 'all authored terminal characters read');
      assert(terminalPages.length >= PLAN.minimumAuthorPages && terminalPages.flatMap(x => x.rows).includes(''), 'multiple terminal pages retain explicit blank paragraph');
      await wait(() => mapReady() && !flow.running && !h.app.saveBlocked, 'final confirmation commits once and returns to started Map');
      eq(h.installs.length, 1, 'actual state port installation exactly once'); eq(flow.lastOutcome.commit, 'applied', 'actual application result'); eq(flow.game().money, c.expectedMoney, 'actual single reward');
      const after = hash(stable(flow.game())), receipt = clone(flow.lastOutcome); h.scene.onMenuOk(); h.scene.onEnd(); await frames(3);
      eq(h.installs.length, 1, 'old duplicate confirmation cannot install twice'); eq(hash(stable(flow.game())), after, 'committed whole state unchanged by duplicates'); eq(flow.lastOutcome, receipt, 'same receipt after duplicates');
      const rewardCount = messages.slice(h.messagesAt).filter(x => x.line === tr.t('trainer.reward', { money: c.expectedReward })).length; eq(rewardCount, 1, 'one reward message');
      d.cases[c.id] = { language, fixtureSHA256: hash(stable(content)), openingPages, terminalPages, commands: h.commands, updates: h.updates, installs: h.installs, beforeSHA256: hash(stable(h.before)), afterSHA256: after, receipt, rewardCount, returnedToMap: true };
      retire(h); active = null; results.push({ id: c.id, status: 'pass', ms: G.performance.now() - began });
    } catch (error) { results.push({ id: c.id, status: 'fail', error: String((error as any)?.stack ?? error) }); throw error; }
    finally { d.notRunIDs = ids.filter(id => !results.some((r: any) => r.id === id)); writeProgress(); }
  };
  let failed = false, primary: unknown;
  try { G.PluginManager.parameters = parameters; G.Scene_PSBattle.prototype.start = start; G.$gameMessage.add = addMessage; for (const c of PLAN.cases) await run(c); eq(results.map((r: any) => [r.id, r.status]), ids.map(id => [id, 'pass']), 'two fixed bilingual long author paths'); }
  catch (error) { failed = true; primary = error; throw error; }
  finally {
    d.primaryError = failed ? String(primary) : null;
    const clean = (name: string, fn: () => void) => { try { fn(); } catch (error) { d.cleanupErrors.push({ name, error: String(error) }); } };
    if (active && flow._op === active.op && flow._app === active.app && active.app.stateGeneration === active.generation) clean('own root', () => flow.abort(Error('dialogue qualification failure cleanup'), active.op));
    if (active) clean('owned observers', () => retire(active));
    clean('parameters', () => { if (G.PluginManager.parameters === parameters) G.PluginManager.parameters = original.parameters; });
    clean('start observer', () => { if (G.Scene_PSBattle.prototype.start === start) G.Scene_PSBattle.prototype.start = original.start; });
    clean('message observer', () => { if (G.$gameMessage.add === addMessage) G.$gameMessage.add = original.addMessage; });
    clean('language/fast', () => { flow.setLanguage(original.language); flow.fast = original.fast; });
    d.remainingRootLocked = !!flow._app?.saveBlocked; d.cleanupComplete = d.cleanupErrors.length === 0; writeProgress();
    if (!failed && d.cleanupErrors.length) throw Error('dialogue driver cleanup failed');
  }
}
