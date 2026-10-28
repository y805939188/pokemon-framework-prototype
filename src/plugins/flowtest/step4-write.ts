/* eslint-disable @typescript-eslint/no-explicit-any */
/** Step 4 diagnostic overlay: fixed-input real-host write measurements. Inert without an explicit driver mode. */
export async function runStep4Write(p: any): Promise<void> {
  const { G, W, fs, path, OUT, api, game, clone, scenario, assert, eq, frames, press, waitFor, scene, slice, settledSave } = p;
  const chain = p.step4Chain, input = p.step4Input;
  assert(['steps', 'dex'].includes(chain), 'step4 write chain is steps or dex');
  await scenario(`STEP4-WRITE-${chain} fixed-input real host synchronous spans`, async () => {
    await slice(77);
    const inputBytes = fs.readFileSync(input), fixture = JSON.parse(inputBytes.toString());
    eq(fixture.format, 'pokemon-framework-step4-fixture-v1', 'versioned fixed input');
    const inputSha256 = p.nodeRequire('crypto').createHash('sha256').update(inputBytes).digest('hex');
    const installFixture = () => {
      W.PSFlow._content = clone(fixture.content); W.PSFlow._dex = null;
      G.$gameSystem._psGame = clone(fixture.state);
      W.PSFlow.stateReplaced(); W.PSFlow._app = null;
      eq(api().saveSchema.validateGameContent(game(), W.PSFlow.content()), [], 'legal frozen fixture');
    };
    installFixture();
    const B = api(), content = W.PSFlow.content();
    eq([game().party.length, B.storage.boxedMembers(game()).length], [1, 1200], 'one party plus full 40x30 storage');
    const initial = clone(game()), initialClaims = clone(game().claims), initialLedger = clone(game().appliedBattles);
    await frames(5);

    const stateProbe = () => {
      const system = G.$gameSystem, original = Object.getOwnPropertyDescriptor(system, '_psGame');
      assert(original?.configurable && Object.hasOwn(original, 'value'), 'test state property can be instrumented');
      let current = system._psGame, writes = 0;
      Object.defineProperty(system, '_psGame', { configurable: true, enumerable: original!.enumerable, get: () => current, set: next => { writes++; current = next; } });
      return { get writes() { return writes; }, restore() { const value = system._psGame; delete system._psGame; Object.defineProperty(system, '_psGame', { ...original!, value }); } };
    };
    const tickSource = 'Graphics._tickHandler: registered SceneManager.update callback';
    const updateProbe = () => {
      const original = G.Graphics._tickHandler, timestamps: number[] = [];
      assert(typeof original === 'function', 'running Graphics tick callback available');
      G.Graphics.setTickHandler((...args: any[]) => { timestamps.push(performance.now()); return original(...args); });
      return {
        timestamps,
        async prime() {
          for (let waits = 0; waits < 10 && timestamps.length < 2; waits++) await Promise.race([frames(1), new Promise(resolve => setTimeout(resolve, 100))]);
          assert(timestamps.length >= 2, 'two real tick timestamps within bounded waits');
        },
        intervals() { return timestamps.slice(1).map((updateAt, i) => ({ previousUpdateAt: timestamps[i]!, updateAt, durationMs: updateAt - timestamps[i]! })); },
        restore() { G.Graphics.setTickHandler(original); },
      };
    };
    const coverSync = (updates: any[], syncStarted: number, syncEnded: number) => {
      const covered = updates.filter(update => update.previousUpdateAt <= syncStarted && update.updateAt >= syncEnded);
      assert(covered.length >= 1, 'actual update interval covers complete synchronous write');
      return covered.map(update => {
        const syncMs = syncEnded - syncStarted, outsideSyncMs = Math.max(0, syncStarted - update.previousUpdateAt) + Math.max(0, update.updateAt - syncEnded);
        assert(update.durationMs >= syncMs, 'covered update duration is consistent with synchronous span');
        return { ...update, syncStartedAt: syncStarted, syncEndedAt: syncEnded, syncMs, outsideSyncMs, containsOracleOrSyntheticWait: outsideSyncMs > 0 };
      });
    };
    const context = (frameStart: number, started: number, ended: number) => ({
      scene: scene()?.constructor?.name, dex: W.PSPokedex.current()?.view?.kind ?? null,
      hasFocus: document.hasFocus(), visibility: document.visibilityState, elapsedMs: ended - started,
      driverFrameStart: frameStart, driverFrameEnd: p.driverFrame(), logicFrameSource: 'SceneManager.updateMain', startedAt: started, endedAt: ended,
    });
    const stepSample = async (index: number) => {
      const before = clone(game()), expected = { ...before, steps: B.stats.addSteps(before.steps, 1) }, mzBefore = G.$gameParty.steps();
      const installs = stateProbe(), updates = updateProbe(), frameStart = p.driverFrame(), started = performance.now();
      let syncStarted = 0, syncEnded = 0;
      try {
        await updates.prime();
        assert(!G.$gameMap.isEventRunning() && !G.$gamePlayer.isMoveRouteForcing(), 'actual step guards allow counting');
        syncStarted = performance.now(); G.$gamePlayer.increaseSteps(); syncEnded = performance.now();
        eq(W.PSFlow.lastSteps.status, 'counted', 'actual PSFlow step receipt');
        eq(G.$gameParty.steps(), mzBefore + 1, 'actual Game_Party step ledger increment');
        eq(installs.writes, 1, 'one real MZ state replacement for one step');
        eq(game(), expected, 'complete state: only global framework step counter changes');
        await frames(2);
        const intervals = updates.intervals(), syncCoverage = coverSync(intervals, syncStarted, syncEnded);
        return { chain, index, warmup: index < 2, syncStartedAt: syncStarted, syncEndedAt: syncEnded, syncMs: syncEnded - syncStarted, updates: intervals, syncCoverage, tickSource, tickCount: updates.timestamps.length, context: context(frameStart, started, performance.now()), steps: game().steps };
      } finally { updates.restore(); installs.restore(); }
    };
    const dexSample = async (index: number) => {
      const before = clone(game()), cursor = W.PSPokedex.current().view.cursor, next = cursor + 1;
      assert(next < W.PSPokedex.current().view.rows.length, 'real cursor move is not clamped');
      const patch = B.pokedexQuery.planDexViewing(before.dex, content.regionalDex, { region: before.dex.view.region, cursor: next, searchResults: false });
      assert(patch.view, 'cursor command has a real persistent patch');
      const expected = { ...before, dex: B.pokedex.applyDexPatch(before.dex, patch) };
      const app = W.PSFlow.app(), original = app.updatePokedex, installs = stateProbe(), updates = updateProbe(), frameStart = p.driverFrame(), started = performance.now();
      let calls = 0, outcome: any, syncStarted = 0, syncEnded = 0;
      app.updatePokedex = function (command: any) { calls++; syncStarted = performance.now(); try { outcome = original.call(this, command); return outcome; } finally { syncEnded = performance.now(); } };
      try {
        await updates.prime();
        await press('down');
        eq(calls, 1, 'one actual UI callback into updatePokedex');
        eq(outcome.status, 'applied', 'actual UI cursor edit applied');
        eq(installs.writes, 1, 'one real MZ state replacement for one cursor move');
        eq(game(), expected, 'complete state: only planned dex viewing patch changes');
        eq(W.PSPokedex.current().view.cursor, next, 'real list cursor moved once');
        await frames(2);
        const intervals = updates.intervals(), syncCoverage = coverSync(intervals, syncStarted, syncEnded);
        return { chain, index, warmup: index < 2, syncStartedAt: syncStarted, syncEndedAt: syncEnded, syncMs: syncEnded - syncStarted, updates: intervals, syncCoverage, tickSource, tickCount: updates.timestamps.length, context: context(frameStart, started, performance.now()), cursor: next };
      } finally { app.updatePokedex = original; updates.restore(); installs.restore(); }
    };

    const samples = [];
    if (chain === 'steps') {
      for (let i = 0; i < 7; i++) samples.push(await stepSample(i));
      eq(game().steps, initial.steps + 7, 'two warmups plus five measured writes counted');
    } else {
      eq(W.PSPokedex.open().status, 'opened', 'real Pokedex scene opens');
      await waitFor(() => W.PSPokedex.current()?.ready, 'step4 Pokedex ready');
      if (W.PSPokedex.current().view.kind === 'regions') {
        const view = W.PSPokedex.current().view, target = view.rows.findIndex((row: any) => row.region === -1);
        assert(target >= 0, 'national row available');
        for (let i = 0; W.PSPokedex.current().view.cursor !== target && i < 12; i++) await press('down');
        await press('ok');
        await waitFor(() => W.PSPokedex.current()?.ready && W.PSPokedex.current()?.view.kind === 'list', 'national list ready');
      }
      await frames(5);
      assert(W.PSPokedex.current().view.rows.length >= 7, 'enough real list rows for distinct cursor writes');
      eq(W.PSPokedex.current().view.cursor, 0, 'same initial cursor');
      for (let i = 0; i < 7; i++) samples.push(await dexSample(i));
      await press('cancel');
      if (W.PSPokedex.current()?.view.kind === 'regions') await press('cancel');
      await waitFor(() => !W.PSPokedex.current() && scene()?._spriteset && !G.SceneManager.isSceneChanging(), 'Pokedex closed to map');
    }
    assert(!W.PSPokedex.busy() && !W.PSFlow.operationPending() && !W.PSFlow.app().saveBlocked, 'UI and application owners released');
    const management = W.PSFlow.app().beginManagement();
    eq(W.PSFlow.app().endManagement(management).status, 'unchanged', 'subsequent management operation works');
    eq(game().claims, initialClaims, 'no grant replay or new claim');
    eq(game().appliedBattles, initialLedger, 'no battle replay or new ledger entry');

    const slot = 23, saveStarted = performance.now();
    await settledSave(slot);
    const saveMs = performance.now() - saveStarted, file = G.StorageManager.filePath(G.DataManager.makeSavename(slot));
    const slotSha256 = p.hashFile(file), expected = {
      kind: 'step4-write-fixed', version: 1, chain, slot, slotSha256,
      state: clone(game()), content: clone(content), inputSha256,
      preparation: { party: 1, boxed: 1200, initialSteps: initial.steps, initialView: initial.dex.view },
    };
    fs.writeFileSync(path.join(path.dirname(OUT), `ps-step4-expected-${chain}.json`), JSON.stringify(expected));
    return {
      chain, input, inputSha256, slot, slotSha256, saveMs, samples,
      final: { party: game().party.length, boxed: B.storage.boxedMembers(game()).length, steps: game().steps, view: clone(game().dex.view), claims: Object.keys(game().claims), ledger: Object.keys(game().appliedBattles).length },
      inputMethod: chain === 'steps' ? 'real Game_Player.increaseSteps; no physical input' : 'real Pokedex list and synthetic DOM input -> UI callback -> app; no physical input',
      timingLimits: 'syncMs is the synchronous application/host span; covered ticks include oracle and/or synthetic wait and are not pure frame budgets',
    };
  });
}

export async function continueStep4Write(p: any): Promise<void> {
  const { G, W, fs, api, game, clone, scenario, assert, eq, frames, press, waitFor, scene, readExpected } = p;
  const chain = p.step4Chain;
  await scenario(`STEP4-WRITE-CONTINUE-${chain} fresh normal Title Continue`, async () => {
    const expected = readExpected(`ps-step4-expected-${chain}.json`);
    assert(expected.kind === 'step4-write-fixed' && expected.version === 1 && expected.chain === chain, 'versioned matching producer');
    const file = G.StorageManager.filePath(G.DataManager.makeSavename(expected.slot));
    eq(p.hashFile(file), expected.slotSha256, 'producer save bytes reached fresh process unchanged');
    W.PSFlow._content = clone(expected.content); W.PSFlow._dex = null; W.PSFlow._app = null;
    G.SceneManager.goto(G.Scene_Title);
    await waitFor(() => scene() instanceof G.Scene_Title && scene().isStarted() && scene()._commandWindow.isOpenAndActive() && !scene().isBusy() && !G.SceneManager.isSceneChanging(), 'normal Title');
    const title = scene(); title._commandWindow.selectSymbol('continue');
    assert(title._commandWindow.isCurrentItemEnabled(), 'Continue enabled from isolated save info');
    await press('ok');
    await waitFor(() => scene() instanceof G.Scene_Load && scene().isStarted() && scene()._listWindow.isOpenAndActive() && !scene().isBusy() && !G.SceneManager.isSceneChanging(), 'normal Scene_Load');
    const load = scene(); load._listWindow.selectSavefile(expected.slot);
    eq(load._listWindow.savefileId(), expected.slot, 'actual isolated save row selected');
    await press('ok');
    await waitFor(() => scene() instanceof G.Scene_Map && scene().isStarted() && !G.SceneManager.isSceneChanging(), 'normal loaded map');
    assert(load._loadSuccess, 'Scene_Load success');
    eq(game(), expected.state, 'entire full-storage state restored');
    await frames(30); eq(game(), expected.state, 'normal lifecycle does not replay writes');
    const app = W.PSFlow.app();
    assert(!app.saveBlocked && !W.PSFlow.operationPending() && !app.pendingPokedex && !W.PSPokedex.busy(), 'no old owner after fresh load');
    const before = clone(game()); app.pokedexSnapshot(); eq(game(), before, 'read-only snapshot adds no dex history');
    let claimReplay = 'NOT_RUN_NO_STARTER_CLAIM_IN_FIXTURE';
    if (Object.hasOwn(before.claims, 'starter')) {
      eq(W.PSFlow.claim('starter').status, 'already-claimed', 'starter cannot be granted twice');
      eq(game(), before, 'no claim/dex/stat/cost/ledger replay'); claimReplay = 'starter/already-claimed';
    }
    eq(p.hashFile(file), expected.slotSha256, 'Continue does not rewrite producer save');
    return {
      chain, slot: expected.slot, slotSha256: expected.slotSha256, steps: game().steps, view: clone(game().dex.view),
      party: game().party.length, boxed: api().storage.boxedMembers(game()).length, claimReplay,
      inputMethod: 'fresh process, normal Title/Continue/Scene_Load with synthetic DOM OK; no physical input',
    };
  });
}
