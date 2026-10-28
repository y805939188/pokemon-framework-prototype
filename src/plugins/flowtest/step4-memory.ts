/* eslint-disable @typescript-eslint/no-explicit-any */
/** Step 4 diagnostic overlay: controlled summary/dex lifecycle and own-runtime resource observations. */
export async function runStep4Memory(p: any): Promise<void> {
  const { G, W, fs, OUT, api, game, clone, scenario, assert, eq, frames, press, waitFor, scene, toMap, fresh, toMapId, uiReady, uiClosed, uiChoose, management } = p;
  const family = p.step4Group, cycles = p.step4Cycles ?? 100, warmupCycles = p.step4Warmup ?? 5, cycleFrames = p.step4CycleFrames ?? 24;
  assert(['summary-only', 'dex-only', 'summary-dex'].includes(family), 'known independent memory group');
  assert(cycles === 100 || cycles === 200 || cycles === 300, 'bounded memory cycles 100/200/300');
  assert(warmupCycles >= 1 && warmupCycles <= 20 && cycleFrames >= 12 && cycleFrames <= 120, 'bounded warmups and frame budget');

  function resourceProbe() {
    const counters: Record<string, number> = { bitmapCreated: 0, bitmapDestroyed: 0, canvasCreated: 0, baseTextureCreated: 0, textureDestroy: 0, textureSourceDestroy: 0, listenerLive: 0 };
    const weak: Record<string, { ref: any, scope: string }[]> = { bitmap: [], canvas: [], baseTexture: [], textureSource: [] };
    const restored: (() => void)[] = [], scope = { value: 'startup' }, weakAvailable = typeof WeakRef === 'function';
    const bitmapMarker = Symbol('step4BitmapProbe'), destroyedTextures = new WeakSet<object>(), destroyedSources = new WeakSet<object>();
    const bump = (key: string, n = 1) => { counters[key] = (counters[key] ?? 0) + n; };
    const observe = (kind: string, value: any) => {
      if (!weakAvailable || (typeof value !== 'object' || value === null) && typeof value !== 'function') return;
      weak[kind]!.push({ ref: new WeakRef(value), scope: scope.value });
    };
    const wrap = (owner: any, key: string, fn: (original: any) => any) => {
      const original = owner?.[key]; if (typeof original !== 'function') return;
      owner[key] = fn(original); restored.push(() => { owner[key] = original; });
    };
    wrap(G.Bitmap?.prototype, 'initialize', (original: any) => function(this: any, ...args: any[]) {
      const result = original.apply(this, args);
      if (!this[bitmapMarker]) { Object.defineProperty(this, bitmapMarker, { value: { destroyed: false } }); bump('bitmapCreated'); observe('bitmap', this); }
      return result;
    });
    wrap(G.Bitmap?.prototype, 'destroy', (original: any) => function(this: any, ...args: any[]) {
      const marker = this[bitmapMarker]; if (marker && !marker.destroyed) { marker.destroyed = true; bump('bitmapDestroyed'); }
      return original.apply(this, args);
    });
    wrap(G.Bitmap?.prototype, '_createBaseTexture', (original: any) => function(this: any, ...args: any[]) {
      const result = original.apply(this, args), base = this._baseTexture, source = base?.source ?? base;
      bump('baseTextureCreated'); observe('baseTexture', base); observe('textureSource', source); return result;
    });
    const documentCreate = document.createElement;
    document.createElement = function(this: any, ...args: any[]) {
      const result = documentCreate.call(this, args[0], args[1]);
      if (String(args[0]).toLowerCase() === 'canvas') { bump('canvasCreated'); observe('canvas', result); }
      return result;
    } as any;
    restored.push(() => { document.createElement = documentCreate; });
    wrap(G.PIXI?.Texture?.prototype, 'destroy', (original: any) => function(this: any, ...args: any[]) {
      if (!destroyedTextures.has(this)) { destroyedTextures.add(this); bump('textureDestroy'); }
      return original.apply(this, args);
    });
    wrap(G.PIXI?.TextureSource?.prototype, 'destroy', (original: any) => function(this: any, ...args: any[]) {
      if (!destroyedSources.has(this)) { destroyedSources.add(this); bump('textureSourceDestroy'); }
      return original.apply(this, args);
    });

    const prototype = EventTarget.prototype, add = prototype.addEventListener, remove = prototype.removeEventListener;
    const registrations = new WeakMap<object, Map<string, boolean>>();
    const key = (target: any, type: any, options: any) => `${target === document ? 'document' : target === window ? 'window' : 'other'}:${type}:${Boolean(typeof options === 'boolean' ? options : options?.capture)}`;
    prototype.addEventListener = function(this: any, type: any, listener: any, options: any) {
      if ((this === document || this === window) && listener && (typeof listener === 'object' || typeof listener === 'function')) {
        const k = key(this, type, options); let own = registrations.get(listener);
        if (!own) { own = new Map(); registrations.set(listener, own); }
        if (!own.get(k)) { own.set(k, true); bump('listenerLive'); }
      }
      return add.call(this, type, listener, options);
    };
    prototype.removeEventListener = function(this: any, type: any, listener: any, options: any) {
      if ((this === document || this === window) && listener && (typeof listener === 'object' || typeof listener === 'function')) {
        const k = key(this, type, options), own = registrations.get(listener);
        if (own?.get(k)) { own.set(k, false); bump('listenerLive', -1); }
      }
      return remove.call(this, type, listener, options);
    };
    restored.push(() => { prototype.addEventListener = add; prototype.removeEventListener = remove; });
    return {
      counters, scope,
      alive() {
        if (!weakAvailable) return 'UNKNOWN';
        const result: Record<string, Record<string, number>> = {};
        for (const [kind, records] of Object.entries(weak)) {
          const byScope: Record<string, number> = {};
          for (const record of records) if (record.ref.deref()) byScope[record.scope] = (byScope[record.scope] ?? 0) + 1;
          result[kind] = { total: Object.values(byScope).reduce((a, b) => a + b, 0), ...byScope };
        }
        return result;
      },
      managedTextures() {
        try { const textures = G.Graphics?.app?.renderer?.texture?.managedTextures; return Array.isArray(textures) ? textures.length : 'UNKNOWN'; }
        catch { return 'UNKNOWN'; }
      },
      restore() { for (let i = restored.length - 1; i >= 0; i--) restored[i]!(); },
    };
  }

  await scenario(`STEP4-MEMORY-${family} controlled independent lifecycle`, async () => {
    await toMap(); fresh(); await toMapId(5, 8, 9);
    const inputBytes = fs.readFileSync(p.step4Input), fixture = JSON.parse(inputBytes.toString());
    eq(fixture.format, 'pokemon-framework-step4-fixture-v1', 'versioned memory input');
    const inputSha256 = p.nodeRequire('crypto').createHash('sha256').update(inputBytes).digest('hex');
    W.PSFlow._content = clone(fixture.content); W.PSFlow._dex = null;
    G.$gameSystem._psGame = clone(fixture.state); W.PSFlow.stateReplaced(); W.PSFlow._app = null;
    const B = api(); eq(B.saveSchema.validateGameContent(game(), W.PSFlow.content()), [], 'legal shared memory fixture');
    const memberId = game().party[0].id;
    assert(memberId && game().dex.hasDex && game().dex.seen.includes(game().party[0].species), 'summary member and dex available');
    await frames(5);

    const probe = resourceProbe(), samples: any[] = [], cycleReports: any[] = [], warmups: any[] = [];
    const startedAt = performance.now(), startFrame = G.Graphics.frameCount, startDriverFrame = p.driverFrame();
    const memory = (phase: string, cycle: number | null) => {
      const gcForced = typeof G.gc === 'function'; if (gcForced) { G.gc(); G.gc(); }
      const usage = G.process.memoryUsage(), js = (performance as any).memory;
      const row = {
        phase, cycle, at: performance.now(), graphicsFrame: G.Graphics.frameCount, driverFrame: p.driverFrame(),
        gcForced, gcCalls: gcForced ? 2 : 0,
        heapUsed: usage.heapUsed ?? 'UNKNOWN', heapTotal: usage.heapTotal ?? 'UNKNOWN', external: usage.external ?? 'UNKNOWN', arrayBuffers: usage.arrayBuffers ?? 'UNKNOWN', rendererRss: usage.rss ?? 'UNKNOWN', appRss: 'UNKNOWN',
        chromiumHeap: js ? { usedJSHeapSize: js.usedJSHeapSize, totalJSHeapSize: js.totalJSHeapSize, jsHeapSizeLimit: js.jsHeapSizeLimit } : 'UNKNOWN',
        counters: { ...probe.counters }, weakAlive: probe.alive(), managedTextures: probe.managedTextures(),
        scene: scene()?.constructor?.name, sceneWindows: scene()?._windowLayer?.children?.length ?? 'UNKNOWN', inputs: document.querySelectorAll('input').length,
        mapChildren: scene()?.children?.length ?? 'UNKNOWN',
      };
      samples.push(row);
      fs.writeFileSync(OUT + '.memory.json', JSON.stringify({ family, cycles, warmupCycles, cycleFrames, inputSha256, samples, cycleReports, warmups, complete: false }));
      return row;
    };
    const mapReady = () => waitFor(() => scene() instanceof G.Scene_Map && scene().isStarted() && !G.SceneManager.isSceneChanging(), 'step4 memory map');
    const openSummary = async () => { assert(W.PSManagement.openSummary(memberId), 'summary opens'); await uiReady('summary'); };
    const openDex = async () => {
      const opened = W.PSPokedex.open(); eq(opened.status, 'opened', 'standalone dex opens'); await waitFor(() => W.PSPokedex.current()?.ready, 'standalone dex ready');
      if (W.PSPokedex.current().view.kind === 'regions') {
        const view = W.PSPokedex.current().view, target = view.rows.findIndex((row: any) => row.region === -1); assert(target >= 0, 'national row available');
        for (let i = 0; W.PSPokedex.current().view.cursor !== target && i < 12; i++) await press('down');
        await press('ok'); await waitFor(() => W.PSPokedex.current()?.ready && W.PSPokedex.current()?.view.kind === 'list', 'standalone dex list ready');
      }
    };
    const closeDex = async () => {
      for (let i = 0; i < 3 && W.PSPokedex.current(); i++) { await press('cancel'); await frames(2); }
      await waitFor(() => !W.PSPokedex.current() && scene()?._spriteset && !G.SceneManager.isSceneChanging(), 'standalone dex closed'); await mapReady();
    };
    const runCycle = async (index: number, warmup: boolean) => {
      const firstDriverFrame = p.driverFrame(), firstGraphicsFrame = G.Graphics.frameCount, started = performance.now();
      let readyAt = 0, closedAt = 0, parentWindow: any = null, parentToken = '', attachedSameWindow: boolean | string = 'NOT_APPLICABLE';
      probe.scope.value = warmup ? 'warmup-open' : `${family}-open`;
      if (family === 'summary-only') { await openSummary(); readyAt = performance.now(); }
      else if (family === 'dex-only') { await openDex(); readyAt = performance.now(); }
      else {
        await openSummary(); parentWindow = scene()?._window; parentToken = management().token;
        await press('ok'); await uiChoose('pokedex'); await waitFor(() => W.PSPokedex.current()?.ready, 'attached dex ready'); readyAt = performance.now();
      }
      const windows = (scene()?._windowLayer?.children ?? []).slice();
      while (p.driverFrame() < firstDriverFrame + 12) await frames(1);
      probe.scope.value = warmup ? 'warmup-close' : `${family}-close`;
      if (family === 'summary-only') { await press('cancel'); await uiClosed(); await mapReady(); }
      else if (family === 'dex-only') await closeDex();
      else {
        await press('cancel');
        await waitFor(() => !W.PSPokedex.current() && management()?.view?.kind === 'summary' && management()?.ready, 'attached dex returned to same summary');
        attachedSameWindow = scene()?._window === parentWindow && !parentWindow?.destroyed && !parentWindow?._destroyed && management()?.token === parentToken;
        assert(attachedSameWindow === true, 'same live parent window and management owner restored');
        await press('cancel'); await uiClosed(); await mapReady();
      }
      closedAt = performance.now();
      const destroyedWindows = windows.filter((w: any) => w.destroyed || w._destroyed).length;
      eq(destroyedWindows, windows.length, 'all scene windows destroyed by their actual owner');
      assert(!W.PSFlow.operationPending() && !W.PSFlow.app().saveBlocked && !W.PSPokedex.busy(), 'all UI/application owners released');
      while (p.driverFrame() < firstDriverFrame + cycleFrames) await frames(1);
      const actualFrames = p.driverFrame() - firstDriverFrame;
      eq(actualFrames, cycleFrames, 'fixed cycle frame budget with idle padding');
      const report = {
        index, warmup, startedAt: started, readyAt, openExposureMs: readyAt - started, closedAt, closeExposureMs: closedAt - readyAt,
        endedAt: performance.now(), firstDriverFrame, firstGraphicsFrame, endDriverFrame: p.driverFrame(), endGraphicsFrame: G.Graphics.frameCount,
        actualFrames, createdWindows: windows.length, destroyedWindows, attachedSameWindow,
      };
      (warmup ? warmups : cycleReports).push(report); return report;
    };

    let stableState: any;
    try {
      probe.scope.value = 'empty-control'; await frames(cycleFrames); memory('empty-control', null);
      for (let i = 0; i < warmupCycles; i++) await runCycle(i, true);
      stableState = clone(game()); probe.scope.value = 'ready'; memory('ready', 0);
      for (let i = 0; i < cycles; i++) {
        await runCycle(i + 1, false); eq(game(), stableState, 'measured lifecycle performs no persistent writes');
        if (i === 0 || (i + 1) % 25 === 0) memory('measurement', i + 1);
      }
      await frames(1); memory('end', cycles);
      probe.scope.value = 'idle'; await frames(120); memory('idle', cycles);
    } finally { probe.restore(); }
    const endedAt = performance.now(), result = {
      family, cycles, warmupCycles, cycleFrames, input: p.step4Input, inputSha256,
      startedAt, endedAt, totalDurationMs: endedAt - startedAt,
      startFrame, endFrame: G.Graphics.frameCount, actualGraphicsFrames: G.Graphics.frameCount - startFrame,
      startDriverFrame, endDriverFrame: p.driverFrame(), actualDriverFrames: p.driverFrame() - startDriverFrame,
      samples, warmups, cycleReports,
      method: 'independent process; same fixed fixture, 5 warmup + 100 measured cycles, 24 frames/cycle with idle padding, same GC/sample/120-idle strategy; summary-dex attaches to and restores the same parent window',
      limits: 'renderer RSS is own-process RSS, not whole-app RSS; appRss UNKNOWN; RSS growth alone is not proof of leak; openExposureMs is not total duration; WeakRef survival after forced GC is not a complete native ownership proof',
    };
    fs.writeFileSync(OUT + '.memory.json', JSON.stringify({ ...result, complete: true }));
    return result;
  });
}
