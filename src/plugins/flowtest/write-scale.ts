/* eslint-disable @typescript-eslint/no-explicit-any */
/** PERF write-scale diagnostics. Explicit PS_BattleFlowTest modes only; never physical-input or memory evidence. */
export async function runWriteScale(p: any): Promise<void> {
  const { G, W, fs, path, OUT, api, game, clone, scenario, assert, eq, frames, press, waitFor, scene, slice, settledSave } = p;
  await scenario('R2-WRITE-SCALE real full-storage steps and dex-list writes with isolated save', async () => {
    await slice(77);
    const B = api(), content = W.PSFlow.content(), g = game();
    g.party = g.party.slice(0, 1);
    const member = g.party[0];
    for (const box of g.storage.boxes) for (let i = 0; i < box.slots.length; i++) box.slots[i] = { ...clone(member), id: `SCALE-${i + 30 * g.storage.boxes.indexOf(box)}` };
    g.badges = Array(8).fill(false);
    g.dex.hasDex = true;
    g.dex.seen = [...content.regionalDex.national];
    g.dex.owned = [...g.dex.seen];
    g.dex.unlocked = Array(content.regionalDex.regions.length + 1).fill(true);
    g.dex.view = { ...g.dex.view, region: -1, mode: 0 };
    W.PSFlow.stateReplaced();
    eq(B.saveSchema.validateGameContent(game(), content), [], 'legal prepared schema7 state');
    eq([game().party.length, B.storage.boxedMembers(game()).length], [1, 1200], 'one party plus full 40x30 storage');
    const initialSteps = game().steps, initialView = clone(game().dex.view), initialClaims = clone(game().claims), initialLedger = clone(game().appliedBattles);
    await frames(5);

    const stateProbe = () => {
      const system = G.$gameSystem, original = Object.getOwnPropertyDescriptor(system, '_psGame');
      assert(original?.configurable && Object.hasOwn(original, 'value'), 'test state property can be instrumented');
      let current = system._psGame, writes = 0;
      Object.defineProperty(system, '_psGame', { configurable: true, enumerable: original!.enumerable, get: () => current, set: next => { writes++; current = next; } });
      return { get writes() { return writes; }, restore() { const value = system._psGame; delete system._psGame; Object.defineProperty(system, '_psGame', { ...original!, value }); } };
    };
    const updateProbe = () => {
      const original = G.SceneManager.update, intervals: number[] = [];
      let last = 0;
      G.SceneManager.update = function (...args: any[]) { const now = performance.now(); if (last) intervals.push(now - last); last = now; return original.apply(this, args); };
      return { intervals, restore() { G.SceneManager.update = original; } };
    };
    const context = (frameStart: number, started: number, ended: number) => ({
      scene: scene()?.constructor?.name, dex: W.PSPokedex.current()?.view?.kind ?? null,
      hasFocus: document.hasFocus(), visibility: document.visibilityState, elapsedMs: ended - started,
      driverFrameStart: frameStart, driverFrameEnd: p.driverFrame(), startedAt: started, endedAt: ended,
    });
    const stepSample = async (index: number) => {
      const before = clone(game()), expected = { ...before, steps: B.stats.addSteps(before.steps, 1) }, mzBefore = G.$gamePlayer._steps;
      const installs = stateProbe(), updates = updateProbe(), frameStart = p.driverFrame(), started = performance.now();
      let syncStarted = 0, syncEnded = 0;
      try {
        assert(!G.$gameMap.isEventRunning() && !G.$gamePlayer.isMoveRouteForcing(), 'actual step guards allow counting');
        syncStarted = performance.now(); G.$gamePlayer.increaseSteps(); syncEnded = performance.now();
        eq(W.PSFlow.lastSteps.status, 'counted', 'actual PSFlow step receipt');
        eq(G.$gamePlayer._steps, mzBefore + 1, 'actual MZ player step increment');
        eq(installs.writes, 1, 'one real MZ state replacement for one step');
        eq(game(), expected, 'complete state: only the global framework step counter changes');
        await frames(2);
        return { chain: 'steps', index, warmup: index < 2, syncStartedAt: syncStarted, syncEndedAt: syncEnded, syncMs: syncEnded - syncStarted, updateIntervalsMs: [...updates.intervals], context: context(frameStart, started, performance.now()), steps: game().steps };
      } finally { updates.restore(); installs.restore(); }
    };
    const steps = [];
    for (let i = 0; i < 7; i++) steps.push(await stepSample(i));
    eq(game().steps, initialSteps + 7, 'two warmups plus five measured writes all counted');

    eq(W.PSPokedex.open().status, 'opened', 'real Pokedex scene opens');
    await waitFor(() => W.PSPokedex.current()?.ready, 'scale Pokedex ready');
    if (W.PSPokedex.current().view.kind === 'regions') {
      const view = W.PSPokedex.current().view, target = view.rows.findIndex((row: any) => row.region === -1);
      assert(target >= 0, 'national row available');
      for (let i = 0; W.PSPokedex.current().view.cursor !== target && i < 12; i++) await press('down');
      await press('ok');
      await waitFor(() => W.PSPokedex.current()?.ready && W.PSPokedex.current()?.view.kind === 'list', 'national list ready');
    }
    await frames(5);
    assert(W.PSPokedex.current().view.rows.length >= 7, 'enough real list rows for every distinct cursor write');
    eq(W.PSPokedex.current().view.cursor, 0, 'same initial cursor');

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
        await press('down');
        eq(calls, 1, 'one actual UI callback into updatePokedex');
        eq(outcome.status, 'applied', 'actual UI cursor edit applied');
        eq(installs.writes, 1, 'one real MZ state replacement for one cursor move');
        eq(game(), expected, 'complete state: only the planned dex viewing patch changes');
        eq(W.PSPokedex.current().view.cursor, next, 'real list cursor moved once');
        await frames(2);
        return { chain: 'dex', index, warmup: index < 2, syncStartedAt: syncStarted, syncEndedAt: syncEnded, syncMs: syncEnded - syncStarted, updateIntervalsMs: [...updates.intervals], context: context(frameStart, started, performance.now()), cursor: next };
      } finally { app.updatePokedex = original; updates.restore(); installs.restore(); }
    };
    const dex = [];
    for (let i = 0; i < 7; i++) dex.push(await dexSample(i));

    await press('cancel');
    if (W.PSPokedex.current()?.view.kind === 'regions') await press('cancel');
    await waitFor(() => !W.PSPokedex.current() && scene()?._spriteset && !G.SceneManager.isSceneChanging(), 'Pokedex closed to map');
    assert(!W.PSPokedex.busy() && !W.PSFlow.operationPending() && !W.PSFlow.app().saveBlocked, 'UI and application owners released');
    const management = W.PSFlow.app().beginManagement();
    eq(W.PSFlow.app().endManagement(management).status, 'unchanged', 'subsequent management operation works');
    eq(game().claims, initialClaims, 'no grant replay or new claim');
    eq(game().appliedBattles, initialLedger, 'no battle replay or new ledger entry');

    const slot = 23, saveStarted = performance.now();
    await settledSave(slot);
    const saveMs = performance.now() - saveStarted, file = G.StorageManager.filePath(G.DataManager.makeSavename(slot));
    const slotSha256 = p.hashFile(file), expected = {
      kind: 'perf-write-scale', version: 1, slot, slotSha256,
      state: clone(game()), content: clone(content),
      preparation: { party: 1, boxed: 1200, badges: 8, initialSteps, initialView },
    };
    fs.writeFileSync(path.join(path.dirname(OUT), 'ps-flow-expected-write-scale.json'), JSON.stringify(expected));
    return {
      slot, slotSha256, saveMs, steps, dex,
      final: { party: game().party.length, boxed: B.storage.boxedMembers(game()).length, steps: game().steps, view: clone(game().dex.view), claims: Object.keys(game().claims), ledger: Object.keys(game().appliedBattles).length },
      input: 'real Game_Player.increaseSteps and real Pokedex DOM/list path; programmatic synthetic events, not physical input',
    };
  });
}

export async function continueWriteScale(p: any): Promise<void> {
  const { G, W, api, game, clone, scenario, assert, eq, frames, press, waitFor, scene, readExpected } = p;
  await scenario('R2-WRITE-CONTINUE fresh process normal Title Continue and Scene_Load', async () => {
    const expected = readExpected('ps-flow-expected-write-scale.json');
    assert(expected.kind === 'perf-write-scale' && expected.version === 1, 'versioned write-scale producer');
    const file = G.StorageManager.filePath(G.DataManager.makeSavename(expected.slot));
    eq(p.hashFile(file), expected.slotSha256, 'producer save bytes reached the fresh process unchanged');
    W.PSFlow._content = expected.content; W.PSFlow._app = null;
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
    eq(W.PSFlow.claim('starter').status, 'already-claimed', 'starter cannot be granted twice');
    eq(game(), before, 'no claim/dex/stat/cost/ledger replay');
    eq(p.hashFile(file), expected.slotSha256, 'Continue does not rewrite the producer save');
    return {
      slot: expected.slot, slotSha256: expected.slotSha256, steps: game().steps, view: clone(game().dex.view),
      party: game().party.length, boxed: api().storage.boxedMembers(game()).length,
      replay: 'starter/already-claimed', input: 'fresh process, normal Title/Continue/Scene_Load with synthetic DOM OK; no physical input',
    };
  });
}
