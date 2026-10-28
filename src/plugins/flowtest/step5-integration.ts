/* eslint-disable @typescript-eslint/no-explicit-any */
/** Framework-remediation Step5: bounded real-MZ integration scenes. Never physical-input evidence. */

const testingEntry = (request: string): boolean => /testing\.cjs$/.test(request);
const legacyEntry = (request: string): boolean => /(?:build\/engine\.cjs|fixtures\/game\.cjs|game\/describe\.cjs)$/.test(request);

export async function runStep5Fixture(p: any): Promise<void> {
  const { G, W, api, game, clone, scenario, assert, eq, entryLoads } = p;
  await scenario("R5-FIXTURE cold explicit testing and repeated ResetGame in the real MZ boot", async () => {
    const content = W.PSFlow.content();
    eq([content.meta.kind, content.meta.id], ["fixture", "step2-fixture"], "the explicit fixture, never a sample fallback");
    const cached = W.PSFlow.content();
    eq(cached, content, "cold content is cached by identity");
    W.PSFlow.resetGame();
    const first = clone(game());
    eq(first.party.map((m: any) => m.id), ["A-0001", "A-0002", "A-0003"], "the explicit fixture party");
    eq(api().saveSchema.validateGame(first), [], "valid fixture state after the first reset");
    eq(G.$gameSystem._psBattleSeq, 0, "fixture reset restarts only the test battle sequence");
    W.PSFlow.resetGame();
    eq(game(), first, "repeated reset replaces rather than appends or rerolls the fixture");
    eq(api().saveSchema.validateGame(game()), [], "valid fixture state after the second reset");
    eq(W.PSFlow.content(), content, "repeated reset keeps the same content object");
    const loads = entryLoads();
    eq(loads.filter(testingEntry).length, 1, "testing loaded exactly once across cold content and both resets");
    eq(loads.filter(legacyEntry), [], "no legacy or private fixture fallback");
    assert(!W.PSFlow.operationPending() && !W.PSFlow.app().saveBlocked, "no owner survives explicit reset");
    return { content: clone(content.meta), entryLoads: loads, state: first, input: "actual Scene_Boot with test-only contentSource=fixture; no VM and no physical input" };
  });
}

export async function runStep5Sample(p: any): Promise<void> {
  const { G, W, fs, path, OUT, api, game, clone, scenario, assert, eq, toMapId, runEvent, stepInto, fightUntilEnd,
    finishBattle, choose, inMode, settledSave, entryLoads, seeded, I6, E, hashFile, mzParty } = p;
  await scenario("R5-SAMPLE cold production new game, real grant/growth/capture/heal and ordinary save", async () => {
    const initial = clone(game());
    eq([initial.party.length, Object.keys(initial.claims).length], [0, 0], "formal empty new game, not a fixture party");
    assert(!JSON.stringify(initial).includes("A-000"), "no fixture member leaked into the normal new game");
    eq(W.PSFlow.content().meta.id, "sample", "normal compiled sample content");
    eq(entryLoads().filter(testingEntry), [], "normal cold sample never loads testing");
    eq(entryLoads().filter(legacyEntry), [], "normal cold sample never loads legacy fallback");

    // Explicit bounded test arrangement; every direct setting is also retained in the expected record.
    W.PSFlow.receiveOptions = { mode: 1, naming: 1 };
    W.PSFlow.rng = seeded(2605); W.PSFlow.seed = [1, 2, 3, 4]; W.PSFlow.fast = true; W.PSFlow._app = null;
    await toMapId(5, 8, 9);
    await runEvent(1);
    eq(W.PSFlow.lastClaim.status, "applied", "real Map005 starter event applies the grant");
    const claimed = clone(game());
    eq(claimed.party.length, 1, "starter joins the party");
    eq(claimed.claims, { starter: { kind: "grant" } }, "persistent claim ledger");
    assert(claimed.dex.owned.includes("charmander"), "grant registers the real dex entry");
    await runEvent(1);
    eq(W.PSFlow.lastClaim.status, "already-claimed", "the same event cannot grant twice");
    eq(game(), claimed, "duplicate grant leaves the complete state unchanged");

    const starter = game().party[0];
    starter.exp = E.minExp("parabolic", 8) - 1; // disclosed: put the real starter one battle from level 8
    await stepInto(3, 9, 2);
    await inMode("main");
    await fightUntilEnd(/^Ember|^ember/i);
    await finishBattle();
    eq([W.PSFlow.lastOutcome.code, W.PSFlow.lastOutcome.commit], [1, "applied"], "real wild victory committed once");
    eq(game().party[0].level, 8, "real battle growth persisted");
    assert(game().party[0].moves.some((m: any) => m.pp < m.maxpp), "battle PP consumption persisted");
    assert(!W.PSFlow.operationPending() && !W.PSFlow.app().saveBlocked, "battle owner released");

    I6.setItemCount(game(), "masterball", 1); // disclosed: one deterministic capture ball, not a fixture inventory fallback
    await stepInto(3, 9, 2);
    await inMode("main"); await choose(/^Bag/); await inMode("bag"); await choose(/Master Ball/);
    await finishBattle();
    eq([W.PSFlow.lastOutcome.code, W.PSFlow.lastOutcome.commit], [2, "applied"], "real capture committed once");
    eq(game().party.length, 2, "captured member joins the normal sample party");
    assert(!I6.bagOf(game()).masterball, "the arranged master ball is consumed exactly once");
    const capturedId = game().party[1].id;
    assert(game().dex.owned.includes(game().party[1].species), "capture registers its persistent species in the dex");
    const rawResult = clone(W.PSFlow.lastResult);
    eq(rawResult.captured[0].id, capturedId, "raw result retained for the independent replay check");
    assert(!W.PSFlow.operationPending() && !W.PSFlow.app().saveBlocked, "capture/reception owner released");

    const hurt = game().party[0];
    hurt.hp = 1; hurt.status = "psn"; hurt.moves[2].pp = 0; // disclosed: exercise the real nurse heal contract
    await toMapId(5, 10, 5); await runEvent(2);
    eq(W.PSFlow.lastHeal.status, "healed", "real nurse event");
    const healed = game().party[0]; // healParty installs a new authoritative state object; do not read the stale pre-heal reference
    eq([healed.hp > 1, healed.status, healed.moves[2].pp], [true, "", healed.moves[2].maxpp], "HP/status/PP restored");

    // Disclosed navigation-only setup for the later real party/bag/dex smoke, not business content replacement.
    const dex = game().dex;
    dex.hasDex = true;
    dex.unlocked = Array(W.PSFlow.content().regionalDex.regions.length + 1).fill(true);
    dex.view = { ...dex.view, region: -1, indices: Array(dex.unlocked.length).fill(0) };
    W.PSFlow.stateReplaced();
    assert(!W.PSFlow.operationPending() && !W.PSFlow.app().saveBlocked, "no owner before the ordinary save");

    const slot = 7;
    assert(slot < G.DataManager.maxSavefiles(), "ordinary Continue slot is visible");
    await settledSave(slot);
    const file = G.StorageManager.filePath(G.DataManager.makeSavename(slot));
    const expected = {
      kind: "step5-sample", version: 1, slot, slotSha256: hashFile(file),
      state: clone(game()), mz: mzParty(),
      map: { mapId: G.$gameMap.mapId(), x: G.$gamePlayer.x, y: G.$gamePlayer.y, d: G.$gamePlayer.direction() },
      seq: G.$gameSystem._psBattleSeq,
      result: rawResult,
      contentIdentity: clone(W.PSFlow.content().meta),
      arrangements: {
        receiveOptions: { mode: 1, naming: 1 }, rngSeed: 2605, battleSeed: [1, 2, 3, 4], fast: true,
        starterExp: "minExp(parabolic,8)-1", masterball: 1,
        hurtBeforeNurse: { hp: 1, status: "psn", moveIndex: 2, pp: 0 },
        dexForReturnSmoke: { hasDex: true, unlocked: "all current regions", view: { region: -1, indices: "zero per region plus national" } },
      },
    };
    fs.writeFileSync(path.join(path.dirname(OUT), "ps-flow-expected-step5-sample.json"), JSON.stringify(expected));
    eq(entryLoads().filter(testingEntry), [], "the complete normal sample path still never loads testing");
    eq(entryLoads().filter(legacyEntry), [], "the complete normal sample path still has no legacy fallback");
    return {
      slot, capturedId, contentIdentity: expected.contentIdentity, entryLoads: entryLoads(), arrangements: expected.arrangements,
      state: expected.state, input: "real MZ events/scenes and synthetic DOM input; explicit arrangements above; no physical input",
    };
  });
}

export async function continueStep5Sample(p: any): Promise<void> {
  const { G, W, fs, api, game, clone, scenario, assert, eq, frames, press, waitFor, scene, runEvent,
    uiReady, uiClosed, uiChoose, inventoryReady, inventoryClosed, readExpected, replayTemplates, hashFile, mzParty } = p;
  const expected = readExpected("ps-flow-expected-step5-sample.json");
  assert(expected.kind === "step5-sample" && expected.version === 1, "versioned normal sample producer");
  await scenario("R5-CONTINUE normal Title/Continue, full state, party/bag/dex return and replay protection", async () => {
    const file = G.StorageManager.filePath(G.DataManager.makeSavename(expected.slot));
    assert(fs.existsSync(file), "ordinary producer save exists");
    eq(hashFile(file), expected.slotSha256, "producer bytes reached the fresh process unchanged");
    eq(W.PSFlow.content().meta, expected.contentIdentity, "fresh process discovers the same production sample, not injected expected content");
    G.SceneManager.goto(G.Scene_Title);
    await waitFor(() => scene() instanceof G.Scene_Title && scene().isStarted() && scene()._commandWindow.isOpenAndActive() && !scene().isBusy() && !G.SceneManager.isSceneChanging(), "normal Title");
    const title = scene(); title._commandWindow.selectSymbol("continue");
    assert(title._commandWindow.isCurrentItemEnabled(), "Continue enabled from isolated real save info");
    await press("ok");
    await waitFor(() => scene() instanceof G.Scene_Load && scene().isStarted() && scene()._listWindow.isOpenAndActive() && !scene().isBusy() && !G.SceneManager.isSceneChanging(), "normal Scene_Load");
    const load = scene(); load._listWindow.selectSavefile(expected.slot);
    eq(load._listWindow.savefileId(), expected.slot, "actual visible ordinary slot selected");
    await press("ok");
    await waitFor(() => scene() instanceof G.Scene_Map && scene().isStarted() && !G.SceneManager.isSceneChanging(), "normal loaded map");
    assert(load._loadSuccess, "Scene_Load succeeded, not a DataManager-only shortcut");
    eq(game(), expected.state, "complete framework document restored");
    eq(W.PSFlow.content().meta, expected.contentIdentity, "loaded state uses the production sample identity");
    eq(mzParty(), expected.mz, "MZ gold/items restored without a second authority");
    eq([G.$gameMap.mapId(), G.$gamePlayer.x, G.$gamePlayer.y, G.$gamePlayer.direction(), G.$gameSystem._psBattleSeq],
      [expected.map.mapId, expected.map.x, expected.map.y, expected.map.d, expected.seq], "map position and battle sequence restored");
    await frames(30);
    eq(game(), expected.state, "normal frames do not replay or mutate the document");
    assert(W.PSEvolution.automatic === true, "normal automatic continuation remains enabled");
    const before = clone(game());

    assert(before.dex.hasDex, "producer explicitly enabled the real Pokedex smoke");
    eq(W.PSPokedex.open().status, "opened", "real Pokedex opens");
    await waitFor(() => W.PSPokedex.current()?.ready && !G.SceneManager.isSceneChanging(), "Pokedex ready");
    if (W.PSPokedex.current().view.kind === "regions") {
      const view = W.PSPokedex.current().view, target = view.rows.findIndex((row: any) => row.region === -1);
      assert(target >= 0, "national row available");
      for (let i = 0; W.PSPokedex.current().view.cursor !== target && i < 12; i++) await press("down");
      await press("ok");
      await waitFor(() => W.PSPokedex.current()?.ready && W.PSPokedex.current().view.kind === "list", "national list");
    }
    const cursor = W.PSPokedex.current().view.cursor;
    await press("down"); await press("up");
    eq(W.PSPokedex.current().view.cursor, cursor, "real cursor navigation returns exactly");
    await press("cancel");
    if (W.PSPokedex.current()?.view.kind === "regions") await press("cancel");
    await waitFor(() => !W.PSPokedex.current() && scene()?._spriteset && !G.SceneManager.isSceneChanging(), "Pokedex closed");
    eq(game(), before, "dex down/up/close preserves the complete business and navigation state");
    W.PSFlow.app().pokedexSnapshot();
    eq(game(), before, "read-only dex snapshot adds no history");
    assert(!W.PSFlow.app().pendingPokedex && !W.PSFlow.app().saveBlocked && !W.PSFlow.operationPending(), "dex owner and save lock released");

    W.PSManagement.openParty(); await uiReady("party");
    const parent = scene();
    await press("ok"); await uiChoose("summary"); await uiReady("summary");
    assert(scene() === parent, "summary stays in the same real parent scene across frames");
    await press("cancel"); await uiReady("party");
    await press("cancel"); await uiClosed();
    eq(game(), before, "party to summary to return preserves the complete state");
    assert(!W.PSManagement.presentationPending() && !W.PSFlow.app().saveBlocked && !W.PSFlow.operationPending(), "party parent and save lock released");

    const bag = W.PSInventory.showBag();
    assert(bag, "real bag opens from the loaded map");
    await inventoryReady("bag"); await press("cancel"); await inventoryClosed();
    assert(bag.done && bag.result.status === "cancelled", "root bag cancellation completes its own handle");
    eq(game(), before, "bag open/cancel/return preserves the complete state including inventory navigation");
    assert(!W.PSFlow.app().saveBlocked && !W.PSFlow.operationPending() && scene()?._spriteset, "bag owner/save lock/parent released");

    await runEvent(1);
    eq(W.PSFlow.lastClaim.status, "already-claimed", "real starter event cannot replay after normal Continue");
    eq(game(), before, "claim replay changes no party/bag/dex/stat/claim/ledger field");
    eq(W.PSFlow.app().commitResult(expected.result, replayTemplates(game(), expected.result)), "already-applied", "raw battle result cannot settle twice");
    eq(game(), before, "battle replay changes no complete state field");
    assert(!W.PSFlow.operationPending() && !W.PSFlow.app().saveBlocked, "all owners released after replay checks");
    eq(hashFile(file), expected.slotSha256, "Continue and all smokes never rewrite the producer save");
    return {
      slot: expected.slot, slotSha256: expected.slotSha256,
      partySummaryReturn: "same-parent/complete-state/released",
      bagCancelReturn: "cancelled/complete-state/released",
      dexRoundTrip: "down-up-close/complete-state/released",
      grantReplay: "already-claimed", battleReplay: "already-applied",
      input: "fresh process, real Title/Continue/Scene_Load and cross-frame scenes with synthetic DOM input; no physical input",
    };
  });
}
