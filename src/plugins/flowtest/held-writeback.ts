/* eslint-disable @typescript-eslint/no-explicit-any */
/** B host contracts: controlled author content/capabilities, real app/engine/MZ save/Title Continue.
 * Service choices below are programmatic, not physical input or the future D battle controller/UI acceptance.
 */
import { progressionDonorInputs } from "./source-fixture";

function heldContent(E: any, assert: any, settings: any = {}): any {
  const input = progressionDonorInputs();
  input.settings = { ...input.settings, ...settings };
  input.species.find((s: any) => s.id === "snorlax").learnset = ["payday", "trick", "recycle", "splash"].map(move => ({ level: 1, move }));
  input.species.find((s: any) => s.id === "pidgey").learnset = [{ level: 1, move: "knockoff" }];
  input.items = Object.values(E.itemCatalog.legacyCatalog()).map((item: any) => ({ ...item, source: "author-placeholder" }));
  input.grants = [{ id: "held-grant", source: "author-placeholder", members: [{ species: "snorlax", level: 50, item: "oranberry" }], items: {}, money: 0 }];
  input.trainerTypes = [{ id: "held-npc", nameKey: "trainer.held", gender: 0, baseMoney: 0, skillLevel: 0, flags: [], items: [], battleBgm: "", victoryBgm: "", introBgm: "", openingText: "", winText: "", loseText: "", source: "author-placeholder" }];
  input.trainers = [{ id: "held-source-npc", type: "held-npc", name: "Held NPC", version: 0, source: "author-placeholder", items: [], party: [{ species: "pidgey", level: 5, moves: ["knockoff"] }] }];
  const capabilities = { allowHeldItemSources: true, allowExperimentalHeldItemBattle: true };
  const compiled = E.contentCompile.compileContent(input, capabilities);
  assert(compiled.ok, JSON.stringify(compiled.errors));
  const assembled = E.contentRuntime.assembleContent(compiled.data, E.dex.createDexLookup(), capabilities);
  assert(!assembled.errors.length, JSON.stringify(assembled.errors));
  return assembled.content;
}

function setup(p: any, content: any, empty = false): any {
  const { G, W, api } = p, E = api();
  W.PSFlow.stateReplaced(); W.PSFlow._app = null;
  W.PSFlow._content = content; W.PSFlow._dex = E.dex.createDexLookup();
  W.PSFlow.developerCapabilities = { allowHeldItemSources: true, allowExperimentalHeldItemBattle: true };
  W.PSFlow.receiveOptions = { mode: 1, naming: 1 }; W.PSFlow.seed = [1, 2, 3, 4]; W.PSFlow.rng = (n: number) => 0;
  const game = E.state.newGame({ content, party: [], money: 1000, bag: { oranberry: 2, leftovers: 1, masterball: 2 } });
  // This held-source test requires obedient level-50 trade members; the zero-badge disobedience control is separate.
  // Preserve real ownership/obedience/RNG behavior rather than disabling it or retrying the random result to green.
  game.badges.fill(true);
  if (!empty) {
    game.party.push(E.speciesKey.toPersistentMember(E.memberFactory.createMember({ id: "P1", species: "Snorlax", level: 50 }, content, (n: number) => 0), content));
    game.nextMemberOrdinal = "2";
  }
  G.$gameSystem._psGame = game;
  return W.PSFlow.app();
}

async function battle(p: any, label: string, active: string, consumption: boolean): Promise<any> {
  const { W, api, assert, eq, game } = p, E = api(), app = W.PSFlow.app();
  // WP47-B: a wild user's Knock Off cannot remove. Use the formal trainer source for temporary-removal controls.
  const request = { battleId: label, trainer: { id: "held-source-npc", version: 0 }, seq: 1, canLose: true };
  const h = await app.startTrainerBattle(request);
  if (h.party[0].id !== active) assert((await h.chooseSwitch(active)).ok, "switch to acquired member");
  if (consumption) h.gw.seedState("p1", [{ id: active, hp: 1 }]); // disclosed controlled low-HP precondition
  assert((await h.chooseMove(4)).ok, "actual Splash plus opponent Knock Off/update");
  eq(h.gw._debugBattle().sides[0].pokemon.find((m: any) => m.set.name === active).item, "", "actual current C was consumed/removed before settlement");
  // At HP=1 the enemy could faint the target; consumption precondition uses the actual berry update before damage.
  if (!h.finished) assert((await h.chooseMove(1)).ok, "actual terminal Pay Day");
  assert(h.finished, "actual battle terminal");
  const raw = h.result(), out = app.finishBattle(h, request);
  assert(out.commit === "applied", JSON.stringify(out));
  const stored = E.storage.locateMember(game(), active).member;
  eq(stored.item, consumption ? "" : "oranberry", "C/I writeback after consumption or temporary removal");
  const installed = JSON.stringify(game());
  eq(W.PSFlow.commit(raw), "already-applied", "PSFlow exact paired replay");
  eq(JSON.stringify(game()), installed, "no second install/reward");
  assert(game().appliedBattles[raw.battleId].settlement?.pairHash, "installed pair exists");
  return raw;
}

export async function runHeldWriteback(p: any): Promise<void> {
  const { G, W, fs, path, OUT, api, scenario, assert, eq, game, clone, toMapId, settledSave, frames, hashFile } = p;
  const E = api(), content = heldContent(E, assert), cases: any[] = [];
  await toMapId(5, 10, 5);
  for (const [index, source] of ["give", "gift", "grant", "trade"].entries()) {
    await scenario(`B-HOST-${index + 1} ${source} source -> actual held writeback -> MZ save`, async () => {
      const app = setup(p, content, source === "gift" || source === "grant");
      if (source === "give") {
        const token = app.beginManagement(), target = game().party[0];
        const given = app.manage(token, "B-give", { kind: "give-item", source: { id: target.id, position: { kind: "party", index: 0 } }, item: "oranberry" });
        eq(given.status, "applied", "formal give source"); app.endManagement(token);
      } else if (source === "gift") eq(app.receiveGift({ kind: "silent", member: { species: "snorlax", level: 50, item: "oranberry" } }).status, "applied", "formal held gift source");
      else if (source === "grant") eq(app.claimGrant("held-grant").status, "applied", "formal held grant source");
      else {
        let out = app.beginTrade("B-trade", { outgoingId: game().party[0].id, incoming: { species: "snorlax", item: "oranberry" } });
        for (const decision of [{ kind: "confirm", accept: true }, { kind: "presented" }, { kind: "commit" }]) {
          assert(out.status === "pending", JSON.stringify(out)); out = app.resolveTrade(out.view.token, out.view.revision, decision);
        }
        eq(out.status, "committed", "formal held trade source");
      }
      const active = game().party[0].id; eq(game().party[0].item, "oranberry", "source installed actual held id");
      const raw = await battle(p, `B-${source}-first`, active, index % 2 === 0);
      G.$gameMessage.clear(); await frames(5);
      assert(!app.saveBlocked, "no transient source/operation before save");
      const slot = 8 + index; await settledSave(slot);
      const file = G.StorageManager.filePath(G.DataManager.makeSavename(slot));
      cases.push({ source, active, slot, fileHash: hashFile(file), state: clone(game()), result: clone(raw), content });
      fs.writeFileSync(path.join(path.dirname(OUT), "ps-flow-expected-B-held.json"), JSON.stringify({ kind: "B-held", version: 1, cases }));
      return { source, active, slot, pairHash: game().appliedBattles[raw.battleId].settlement.pairHash, input: "actual MZ host services/engine/save; controlled content and capability; no hardware" };
    });
  }
  await scenario("B-HOST-5 actual Trick -> captured held source -> MZ save", async () => {
    const app = setup(p, content), token = app.beginManagement();
    eq(app.manage(token, "B-give-capture", { kind: "give-item", source: { id: "P1", position: { kind: "party", index: 0 } }, item: "leftovers" }).status, "applied", "formal initial held source");
    app.endManagement(token);
    const request = { battleId: "B-capture-first", kind: "wild", seq: 1, foes: [{ species: "pidgey", level: 5 }] };
    const h = await app.startBattle(request); assert((await h.chooseMove(2)).ok, "actual Trick transfers current held");
    assert((await h.throwBall("masterball")).ok && h.finished, "actual capture terminal");
    const raw = h.result(), out = app.finishBattle(h, request); eq(out.commit, "applied", "authenticated capture source installation");
    const active = raw.captured[0].id;
    eq(E.storage.locateMember(game(), active).member.item, "leftovers", "new stable capture identity retains C");
    eq(game().party.find((m: any) => m.id === "P1").item, "leftovers", "original party restores I");
    eq(W.PSFlow.commit(raw), "already-applied", "captured raw exact replay");
    G.$gameMessage.clear(); await frames(5); const slot = 12; await settledSave(slot);
    const file = G.StorageManager.filePath(G.DataManager.makeSavename(slot));
    cases.push({ source: "capture", active, slot, fileHash: hashFile(file), state: clone(game()), result: clone(raw), content });
    fs.writeFileSync(path.join(path.dirname(OUT), "ps-flow-expected-B-held.json"), JSON.stringify({ kind: "B-held", version: 1, cases }));
    return { active, slot, input: "actual engine Trick/capture and MZ save; controlled content/capabilities, no physical input" };
  });
  await runHeldRemediation(p, content);
}

export async function continueHeldWriteback(p: any): Promise<void> {
  const { G, W, fs, api, game, clone, scenario, assert, eq, readExpected, scene, waitFor, press, frames, hashFile } = p;
  const expected = readExpected("ps-flow-expected-B-held.json");
  assert(expected.kind === "B-held" && expected.version === 1, "versioned B checkpoint");
  eq(expected.cases.map((c: any) => c.source), ["give", "gift", "grant", "trade", "capture"], "five complete source checkpoints");
  for (const item of expected.cases) await scenario(`B-CONTINUE-${item.source} real Title/Continue -> next required battle`, async () => {
    W.PSFlow.stateReplaced(); W.PSFlow._app = null; W.PSFlow._content = item.content; W.PSFlow._dex = api().dex.createDexLookup();
    W.PSFlow.developerCapabilities = { allowHeldItemSources: true, allowExperimentalHeldItemBattle: true };
    W.PSFlow.receiveOptions = { mode: 1, naming: 1 }; W.PSFlow.rng = (n: number) => 0; W.PSFlow.seed = [1, 2, 3, 4];
    const file = G.StorageManager.filePath(G.DataManager.makeSavename(item.slot));
    assert(fs.existsSync(file), "actual producer save"); eq(hashFile(file), item.fileHash, "fixed save bytes");
    G.SceneManager.goto(G.Scene_Title);
    await waitFor(() => scene() instanceof G.Scene_Title && scene().isStarted() && scene()._commandWindow.isOpenAndActive() && !scene().isBusy() && !G.SceneManager.isSceneChanging(), "B Title");
    scene()._commandWindow.selectSymbol("continue"); assert(scene()._commandWindow.isCurrentItemEnabled(), "actual Continue enabled"); await press("ok");
    await waitFor(() => scene() instanceof G.Scene_Load && scene().isStarted() && scene()._listWindow.isOpenAndActive() && !scene().isBusy() && !G.SceneManager.isSceneChanging(), "B load window");
    const load = scene(); load._listWindow.selectSavefile(item.slot); eq(load._listWindow.savefileId(), item.slot, "visible ordinary slot"); await press("ok");
    await waitFor(() => scene() instanceof G.Scene_Map && scene().isStarted() && !G.SceneManager.isSceneChanging(), "B loaded map");
    assert(load._loadSuccess, "real load scene succeeded"); eq(game(), item.state, "whole JsonEx state roundtrip");
    await frames(10); eq(game(), item.state, "no automatic replay");
    const before = clone(game()); eq(W.PSFlow.commit(item.result), "already-applied", "installed raw query needs no old live source"); eq(game(), before, "no repeated held/money write");
    assert(!W.PSFlow.app().saveBlocked, "source owner was not persisted");
    // Heal is a normal explicit operation before the next independent battle, never hidden by the assertion.
    eq(W.PSFlow.app().healParty().status, "healed", "normal heal before next battle");
    const active = api().storage.locateMember(game(), item.active).member;
    const consumed = active.item === "";
    if (item.source === "capture") {
      const app = W.PSFlow.app(), h = await app.startTrainerBattle({ battleId: "B-capture-next", trainer: { id: "held-source-npc", version: 0 }, seq: 2, canLose: true });
      assert((await h.chooseSwitch(item.active)).ok, "captured individual actually enters the next battle");
      eq(h.gw._debugBattle().sides[0].pokemon.find((m: any) => m.set.name === item.active).item, "", "opponent Knock Off changed captured C");
      assert((await h.chooseSwitch("P1")).ok && (await h.chooseMove(1)).ok && h.finished, "actual next battle completes");
      eq(app.finishBattle(h, null).commit, "applied", "new-process source after capture");
      eq(api().storage.locateMember(game(), item.active).member.item, "leftovers", "capture's own I survives temporary removal in the next battle");
    } else if (consumed) {
      // No source restoration is invented: this next real battle must preserve the already empty I.
      const h = await W.PSFlow.app().startBattle({ battleId: `B-${item.source}-next`, kind: "wild", seq: 2, foes: [{ species: "pidgey", level: 5 }] });
      assert((await h.chooseMove(1)).ok && h.finished, "next actual battle");
      eq(W.PSFlow.app().finishBattle(h, null).commit, "applied", "new-process required source");
      eq(api().storage.locateMember(game(), item.active).member.item, "", "no resurrection of consumed item");
    } else await battle(p, `B-${item.source}-next`, item.active, false);
    G.$gameMessage.clear(); eq(hashFile(file), item.fileHash, "next battle did not overwrite producer checkpoint");
    return { source: item.source, slot: item.slot, input: "real fresh NW/MZ Title/Continue/load and next engine battle; synthetic DOM/service choices" };
  });
}

/** New-candidate B fixes, executed in the packaged NW runtime. Gateway-only cases are explicitly diagnostic
 * effects/replay checks; the two applications below use real MZ state, not independent fake state ports. */
async function runHeldRemediation(p: any, content: any): Promise<void> {
  const { G, W, api, assert, eq, game, clone, scenario, path } = p, E = api();
  const port = () => ({ read: () => game(), replace: (next: any) => { G.$gameSystem._psGame = next; } });
  await scenario("B-FIX-01 legacy cancellation retires source and preserves successor", async () => {
    setup(p, content); let calls = 0, writes = 0;
    const raw = { protocol: 1, battleId: "B-cancel-legacy", outcome: { kind: "win", winner: "Player" }, members: {}, bag: {}, captured: [], dex: { seen: [], owned: [] } };
    const sessions = E.composition.createLegacyNoHeldResultFactory(() => { calls++; return clone(raw); });
    const state = port(), app = new E.app.GameApplication({ state: { read: state.read, replace: (next: any) => { writes++; state.replace(next); } }, sessions, content: () => ({ content, dex: E.dex.createDexLookup() }), projection: { project() {} } });
    const before = clone(game()), old = E.composition.createLegacyNoHeldBattleHandle(app, raw.battleId);
    eq(app.saveBlocked, true, "original source reserved"); app.abortBattle(raw, Error("controlled cancel"));
    eq(app.saveBlocked, false, "cancel releases original owner"); eq(app.finishBattle(old, raw).commit, "none", "late original is retired");
    eq(game(), before, "cancel is zero write"); eq([calls, writes], [0, 0], "no producer/replace");
    const next = E.composition.createLegacyNoHeldBattleHandle(app, raw.battleId);
    eq(app.finishBattle(old, raw).commit, "none", "old cannot consume successor"); eq(app.saveBlocked, true, "successor still owns");
    eq(app.finishBattle(next, raw).commit, "applied", "new legitimate source usable"); eq([calls, writes], [1, 1], "successor installs once");
    eq(app.finishBattle(next, raw).commit, "already-applied", "installed original legacy handle is an exact query"); eq([calls, writes], [1, 1], "query skips producer/replace");
    return { calls, writes, contract: "MZ state, explicit legacy composition, default capabilities closed" };
  });
  await scenario("B-FIX-02 post-install content observation preserves original exact replay", async () => {
    setup(p, content); game().party[0].item = "amuletcoin"; // disclosed initial item fixture, source flows covered above
    let supplied = content, writes = 0, app: any;
    const changed = heldContent(E, assert, { MAX_MONEY: 555555 }), state = port();
    app = new E.app.GameApplication({ state: { read: state.read, replace: (next: any) => { writes++; state.replace(next); } },
      sessions: E.composition.createBattleSessionFactory({ content: () => supplied, seed: () => [1, 2, 3, 4] }),
      content: () => ({ content: supplied, dex: E.dex.createDexLookup() }), random: () => 0, clock: () => 12345,
      projection: { project() { supplied = changed; app.describeParty(); } } },
      { receivingProfile: { mode: 1, naming: 1 }, capabilities: { allowHeldItemSources: true, allowExperimentalHeldItemBattle: true } });
    const request = { battleId: "B-installed-content", kind: "wild", seq: 1, foes: [{ species: "pidgey", level: 5 }] };
    const h = await app.startBattle(request); assert((await h.chooseMove(1)).ok && h.finished, "actual terminal Pay Day");
    eq(app.finishBattle(h, request).commit, "applied", "main and pair installed"); const installed = clone(game());
    eq(app.finishBattle(h, request).commit, "already-applied", "same handle is a query"); eq(game(), installed, "whole state unchanged");
    eq([writes, game().money], [1, 1500], "one install and one reward");
    return { writes, money: game().money, pairHash: game().appliedBattles[request.battleId].settlement.pairHash };
  });
  const T = G.require("./js/engine/build/testing.cjs"), gateway = { ...E.gateway, ...T.heldDiagnostics };
  const gameDir = path.dirname(path.dirname(path.dirname(path.dirname(G.require.resolve("./js/engine/game/session.cjs")))));
  const make = (name: string, species: string, moves: string[], item = "", level = 50) => ({ name, species, moves, item, level, nature: "Hardy", ability: species === "Zoroark" ? "Illusion" : "Run Away" });
  const create = async (players: any[], wild = false) => {
    const gw = await gateway.BattleGateway.create({ engineRoot: path.join(gameDir, "js/engine/showdown"), formatid: "gen8rpgcustomgame", requiredSettlement: true, wild, seed: [1, 2, 3, 4], players });
    await gw.choose("p1", `team ${players[0].team.map((_: any, i: number) => i + 1).join("")}`); await gw.choose("p2", "team 1"); gw.drain(); return gw;
  };
  const turn = async (gw: any, a = "move 1", b = "move 1") => { assert(await gw.choose("p1", a), "player choice"); assert(await gw.choose("p2", b), "foe choice"); return gw.drain(); };
  const binding = { battleId: "NW-diagnostic-pair", generation: 1, rawHash: "a".repeat(64), contentIdentity: "b".repeat(64) };
  const facts = (gw: any) => {
    if (!gw.ended) { gw._debugBattle().tie(); gw._pump(); } // disclosed diagnostic terminal for isolated effects
    return gateway.gatewaySettlementFacts(gw, gateway.gatewaySettlementLineage(gw), binding);
  };
  await scenario("B-FIX-03 actual Substitute Pay Day", async () => {
    const gw = await create([{ name: "Player", team: [make("P1", "Snorlax", ["Splash", "Pay Day"])] }, { name: "Trainer", team: [make("F1", "Snorlax", ["Substitute", "Splash"])] }]);
    await turn(gw); const target = gw._debugBattle().sides[1].active[0], before = target.volatiles.substitute.hp;
    const pp = gw.readState("p1")[0].pp.payday; await turn(gw, "move 2", "move 2");
    assert((target.volatiles.substitute?.hp ?? 0) < before, "real substitute damage"); eq(gw.readState("p1")[0].pp.payday, pp - 1, "ordinary PP");
    const result = facts(gw); eq(result.money.payDay, 250, "successful global effect counted once");
    return { money: result.money, diagnosticTerminal: true };
  });
  await scenario("B-FIX-04 wild exchange spends PP before normal failure", async () => {
    const rows = [];
    for (const move of ["Trick", "Switcheroo"]) {
      const gw = await create([{ name: "Player", team: [make("P1", "Snorlax", ["Splash"], "leftovers")] }, { name: "Wild", team: [make("F1", "Persian", [move], "blacksludge")] }], true);
      const pp = gw.readState("p2")[0].pp[move.toLowerCase()], messages = await turn(gw);
      eq(gw.readState("p2")[0].pp[move.toLowerCase()], pp - 1, "engine PP deduction"); assert(/-fail/.test(JSON.stringify(messages)), "normal failure feedback");
      const result = facts(gw); eq(result.events, [], "no transfer"); eq(result.members.map((m: any) => [m.current, m.recovery]), [["leftovers", "leftovers"], ["blacksludge", "blacksludge"]], "C/I retained"); rows.push({ move, ppBefore: pp, ppAfter: pp - 1 });
    }
    return { rows, diagnosticTerminal: true };
  });
  await scenario("B-FIX-05 switched Illusion checkpoint retains ordered pair", async () => {
    const players = [{ name: "Player", team: [make("P1", "Zoroark", ["Splash"], "leftovers"), make("P2", "Persian", ["Tackle"], "oranberry", 100)] }, { name: "Trainer", team: [make("F1", "Caterpie", ["Splash"], "", 1)] }];
    const gw = await create(players); eq(gw._debugBattle().sides[0].active[0].illusion?.set.name, "P2", "real Illusion");
    await turn(gw, "switch 2"); const token = gw.checkpoint(); await turn(gw); assert(gw.ended, "natural terminal"); const original = facts(gw);
    const restored = await gateway.showdownDriverFactory.fromCheckpoint(token); await turn(restored); assert(restored.ended, "restored natural terminal"); const replayed = facts(restored);
    eq(replayed, original, "complete ordered facts"); eq(restored._debugBattle().prng.getSeed(), gw._debugBattle().prng.getSeed(), "same RNG");
    const roster = players.flatMap((s: any, i: number) => s.team.map((m: any) => ({ id: m.name, side: i ? "p2" : "p1", initial: m.item })));
    const resolve = (f: any) => E.heldFacts.resolveRequiredFacts(f, { binding, roster, wild: false });
    const a = resolve(original), b = resolve(replayed); assert(a.ok && b.ok, "complete validated facts"); eq(a.pairHash, b.pairHash, "same pair hash");
    return { pairHash: a.pairHash, naturalTerminal: true, diagnosticBindingOnly: true };
  });
}
