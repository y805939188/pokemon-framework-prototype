/**
 * Step 2.4 test driver. Launch: nwjs <project> --ps-flow-test=all --ps-flow-out=<file> [--ps-flow-quit] [--ps-flow-shots=<dir>]
 * Drives the REAL scene with synthetic keyboard events (keydown/keyup on document), starts REAL map events
 * (Game_Event.start) and uses the real MZ save/load. Inert without the flag.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
(() => {
  "use strict";
  const G: any = globalThis;
  const W = window as any;
  const argv: string[] = (G.nw && G.nw.App && G.nw.App.argv) || [];
  const arg = (n: string) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : undefined; };
  const mode = arg("ps-flow-test");
  if (!mode) return;

  const nodeRequire: any = G.require;

  // Keep the scripted run going when the window is not focused (the user can work in other apps):
  // 1) MZ/Reactor only update scenes while document.hasFocus() (SceneManager.isGameActive);
  // 2) Input clears all key state on the window "blur" event, so swallow blur before Input sees it
  //    (this listener is registered first because plugins load before Input.initialize);
  // 3) Chromium itself throttles hidden/occluded windows: the run scripts add --disable-renderer-backgrounding,
  //    --disable-background-timer-throttling, --disable-backgrounding-occluded-windows.
  G.SceneManager.isGameActive = () => true;

  // No sound during scripted runs (opt back in with --ps-sound). Belt and braces: the run scripts also pass
  // Chromium's --mute-audio; here the AudioManager play calls are swallowed so nothing is even decoded/started.
  const suppressedAudio: Record<string, number> = {};
  if (!argv.includes("--ps-sound")) {
    for (const fn of ["playBgm", "playBgs", "playMe", "playSe", "playStaticSe"]) {
      if (G.AudioManager && typeof G.AudioManager[fn] === "function") {
        G.AudioManager[fn] = () => { suppressedAudio[fn] = (suppressedAudio[fn] || 0) + 1; };
      }
    }
  }
  window.addEventListener("blur", (e) => e.stopImmediatePropagation(), true);
  const fs = nodeRequire("fs");
  const path = nodeRequire("path");
  const E = nodeRequire("./js/engine/game/growth.cjs");
  const OUT = arg("ps-flow-out");
  const ONLY = arg("ps-flow-only"); // e.g. --ps-flow-only=T16,T17 runs just those scenarios (development aid)
  const SHOTS = arg("ps-flow-shots");

  let frame = 0;
  const focusLog: any[] = [];
  for (const ev of ["blur", "focus"]) window.addEventListener(ev, () => focusLog.push({ ev, frame, t: Math.round(performance.now()), hasFocus: document.hasFocus(), vis: document.visibilityState }));
  document.addEventListener("visibilitychange", () => focusLog.push({ ev: "visibility", frame, vis: document.visibilityState }));
  const baseUpdate = G.SceneManager.update;
  const frameLog: Record<string, number[]> = { battle: [], map: [], other: [] };
  let lastFrameAt = 0;
  let sampling = false;
  let skippedUnfocused = 0;
  G.SceneManager.update = function (...a: any[]) {
    frame++;
    if (sampling && !document.hasFocus()) { skippedUnfocused++; lastFrameAt = 0; }
    else if (sampling) {
      const now = performance.now();
      if (lastFrameAt) { const sc = G.SceneManager._scene; frameLog[sc && sc._psBattle ? "battle" : sc && sc._spriteset ? "map" : "other"].push(now - lastFrameAt); }
      lastFrameAt = now;
    }
    return baseUpdate.apply(this, a);
  };
  const t0Arg = arg("ps-t0");
  const t0 = t0Arg ? Number(t0Arg) : undefined; // epoch ms taken by the launching shell just before `open`
  const stamps: any = { pluginLoadedAt: Date.now(), pluginLoadedPerf: Math.round(performance.now()) };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function frames(n: number) { const t = frame + n; while (frame < t) await sleep(4); }
  async function waitFor(cond: () => boolean, label: string, max = 2400) {
    const t = frame + max;
    while (!cond()) { if (frame > t) throw new Error(`timeout waiting for ${label} (mode=${scene() && scene()._mode})`); await sleep(4); }
  }
  const scene = (): any => G.SceneManager._scene;
  const battle = (): any => { const s = scene(); return s && s._psBattle ? s : null; };
  const KEY: Record<string, number> = { ok: 13, cancel: 27, down: 40, up: 38 };
  /** A window that lost focus is throttled by Chromium and ignores input, which made scripted runs flaky
   *  (observed: blur at frame 94 for ~800 frames). Take focus back before every key press. */
  let refocus = 0;
  async function ensureFocus() {
    // No longer required (see the top of this file); kept as a cheap best effort that never blocks.
    if (document.hasFocus()) return;
    try { G.nw.Window.get().focus(); refocus++; } catch (e) { /* ignore */ }
  }
  async function press(k: string, hold = 3) {
    await ensureFocus();
    const ev = (type: string) => document.dispatchEvent(new KeyboardEvent(type, { keyCode: KEY[k], which: KEY[k], bubbles: true } as any));
    ev("keydown"); await frames(hold); ev("keyup"); await frames(2);
  }
  async function shot(name: string) {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    await new Promise<void>((res) => G.nw.Window.get().capturePage((buf: any) => { fs.writeFileSync(path.join(SHOTS, `${name}.png`), buf); res(); }, { format: "png", datatype: "buffer" }));
  }
  const names = (): string[] => battle()._menu._items.map((i: any) => i.name);
  async function choose(re: RegExp, label?: string) {
    const m = battle()._menu;
    const idx = m._items.findIndex((i: any) => re.test(i.name));
    if (idx < 0) throw new Error(`menu item ${re} not found in [${names().join(" | ")}] (${label || ""})`);
    if (m._items[idx].enabled === false) throw new Error(`menu item ${re} is disabled`);
    let guard = 0;
    while (m.index() !== idx && guard++ < 30) await press("down");
    // A key event can be swallowed while the window is busy (e.g. right after a screenshot): confirm that OK
    // had an effect (mode or item list changed, scene left, or a request is in flight) and press again if not.
    for (let attempt = 0; attempt < 4; attempt++) {
      const b0 = battle(); const before = { mode: b0._mode, items: b0._menu._items, index: m.index() };
      await press("ok");
      await frames(8);
      const b1 = battle();
      if (!b1 || b1._mode !== before.mode || b1._menu._items !== before.items || b1._busy || b1._queue.length) return;
    }
    throw new Error(`OK on ${re} had no effect after 4 presses`);
  }
  const mode_ = () => (battle() ? battle()._mode : "");
  async function inMode(m: string, label?: string) { await waitFor(() => battle() && battle()._mode === m && battle()._queue.length === 0 && !battle()._busy, `mode ${m} ${label || ""}`); }
  async function dismissMessages() {
    for (let i = 0; i < 40 && (G.$gameMessage.isBusy() || G.$gameMap._interpreter.isRunning()); i++) { if (G.$gameMessage.isBusy()) await press("ok"); else await frames(5); }
    await waitFor(() => !G.$gameMap._interpreter.isRunning() && !G.$gameMessage.isBusy(), "interpreter idle");
  }
  /** Run a map event that does not open a battle (messages are confirmed with real key presses) until the interpreter is idle. */
  async function runEvent(id: number) {
    await waitFor(() => scene() && scene()._spriteset && !G.SceneManager.isSceneChanging(), "map scene");
    G.$gameMap.event(id).start();
    await frames(3);
    await dismissMessages();
  }
  async function toMapId(mapId: number, x: number, y: number) {
    G.$gamePlayer.reserveTransfer(mapId, x, y, 2, 0);
    G.SceneManager.goto(G.Scene_Map);
    await waitFor(() => scene() && scene()._spriteset && !G.SceneManager.isSceneChanging() && G.$gameMap.mapId() === mapId, `Scene_Map on map ${mapId}`);
    await frames(10);
  }
  /** Slice setup: a new game on map 5 with the starter claimed (members created with a pinned random). */
  async function slice(seed = 77) {
    G.DataManager.setupNewGame();
    W.PSFlow.rng = seeded(seed); W.PSFlow.seed = [1, 2, 3, 4]; W.PSFlow.fast = true; W.PSFlow.testLimits = null; W.PSFlow._app = null;
    eq(W.PSFlow.claim("starter").status, "applied", "starter claimed");
    await toMapId(5, 8, 9);
  }
  /** Stand at (x, y), let the step counter run out and take one step in `dir`: MZ's own encounter check runs. */
  async function stepInto(x: number, y: number, dir: number) {
    G.$gamePlayer.locate(x, y); await frames(2);
    assert(G.$gamePlayer.canPass(x, y, dir), `the slice map lets the player step ${dir} from ${x},${y}`);
    G.$gamePlayer._encounterCount = 1;
    G.$gamePlayer.moveStraight(dir);
    await waitFor(() => !G.$gamePlayer.isMoving(), "step done");
    await frames(6);
  }
  const mkMember = (id: string, species: string, level: number, extra: any = {}) => ({ ...nodeRequire("./js/engine/build/engine.cjs").memberFactory.createMember({ id, species, level }, W.PSFlow.content(), seeded(level * 13 + id.length)), ...extra });
  async function finishBattle() { await inMode("end"); await press("ok"); await dismissMessages(); await waitFor(() => !W.PSFlow.running && !battle(), "back from the battle"); await frames(5); }
  async function fightUntilEnd(moveRe: RegExp, max = 12) {
    for (let i = 0; i < max && mode_() !== "end"; i++) {
      if (mode_() === "learn") { await choose(/Don't learn|不学习/); continue; }
      await choose(/^Fight/); await inMode("moves"); await choose(moveRe);
      await waitFor(() => ["main", "end", "learn"].includes(mode_()) && !battle()._busy && battle()._queue.length === 0, "after the move");
    }
  }

  /** Seeded random(n) for members created outside battles (grants, encounters). */
  function seeded(seed: number) { let st = seed >>> 0; return (n: number) => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return Math.floor((st / 4294967296) * n); }; }
  const mzParty = () => ({ gold: G.$gameParty.gold(), items: clone(G.$gameParty._items), weapons: clone(G.$gameParty._weapons), armors: clone(G.$gameParty._armors) });

  async function startEvent(id: number) {
    await waitFor(() => scene() && scene().constructor && scene()._spriteset && !G.SceneManager.isSceneChanging(), "map scene");
    G.$gameMap.event(id).start();
    await waitFor(() => battle() && battle()._mode !== "boot", "battle scene");
  }
  const game = (): any => W.PSFlow.game();
  const clone = (x: any) => JSON.parse(JSON.stringify(x));
  const results: any[] = [];
  const gameDir = path.dirname(path.dirname(path.dirname(path.dirname(nodeRequire.resolve("./js/engine/game/session.cjs")))));
  let packageInfo: any = null;
  try { packageInfo = JSON.parse(fs.readFileSync(path.join(gameDir, "package-info.json"), "utf8")); } catch (e) { /* dev tree: no package-info */ }
  const pv = (G.process && G.process.versions) || {};
  const report: any = { mode, results, focusLog, suppressedAudio, get refocus() { return refocus; }, env: { nw: pv.nw, node: pv.node, chromium: pv.chromium, v8: pv.v8, platform: G.process && G.process.platform, arch: G.process && G.process.arch, execPath: G.process && G.process.execPath, gameDir, packageInfo } };
  async function scenario(id: string, fn: () => Promise<any>) {
    if (ONLY && !ONLY.split(",").some((p) => id.startsWith(p + " "))) return;
    const t0 = Date.now();
    try { const detail = await fn(); results.push({ id, status: "pass", ms: Date.now() - t0, detail }); }
    catch (e: any) {
      const b = battle();
      const itp = G.$gameMap && G.$gameMap._interpreter;
      const mapDiag = { scene: scene() && scene().constructor && scene().constructor.name, psRunning: W.PSFlow.running, waitMode: itp && itp._waitMode, interpreterRunning: itp && itp.isRunning(), messageBusy: G.$gameMessage && G.$gameMessage.isBusy(), messageText: G.$gameMessage && G.$gameMessage._texts, lastOutcome: W.PSFlow.lastOutcome, frame, hasFocus: document.hasFocus(), vis: document.visibilityState };
      results.push({ id, status: "fail", ms: Date.now() - t0, error: String(e && e.message || e), mapDiag, diag: b ? { mode: b._mode, failure: String(b._failure), log: b._log._lines, status: b._status._lines, queue: b._queue.slice(0, 5) } : null });
      await shot("fail-" + id.split(" ")[0]);
      try { await recover(); } catch (e2) { results.push({ id: id + " (recover)", status: "fail", error: String(e2) }); }
    }
  }
  /** after a failed scenario: leave any battle scene and return to a clean map so later scenarios are independent */
  async function recover() {
    W.PSFlow.running = false;
    for (let i = 0; i < 5 && battle(); i++) { G.SceneManager.pop(); await frames(20); }
    G.$gameMessage.clear(); G.$gameMap._interpreter.clear();
    await toMap();
  }
  function assert(c: any, msg: string) { if (!c) throw new Error("assert: " + msg); }
  function eq(a: any, b: any, msg: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`assert eq: ${msg}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); }

  async function toMap() {
    G.DataManager.setupNewGame();
    W.PSFlow.resetGame(); W.PSFlow.seed = [1, 2, 3, 4]; W.PSFlow.fast = true; W.PSFlow.rng = seeded(1); W.PSFlow.testLimits = null; W.PSFlow._app = null;
    G.$gamePlayer.reserveTransfer(4, 8, 8, 2, 0);
    G.SceneManager.goto(G.Scene_Map);
    await waitFor(() => scene() && scene()._spriteset && !G.SceneManager.isSceneChanging() && G.$gameMap.mapId() === 4, "Scene_Map on map 4");
    await frames(10);
    stamps.mapReadyAt = Date.now(); stamps.mapReadyPerf = Math.round(performance.now());
  }
  const fresh = () => { W.PSFlow.resetGame(); W.PSFlow.rng = seeded(1); }; // foes are created from the content: pin their random draws

  async function runAll() {
    await toMap();

    await scenario("T1 trainer win: Fight, KO, exp, level-up, learn prompt (real keys), next turn uses new move, return to map", async () => {
      const g = game();
      g.party[0].exp = E.minExp("parabolic", 51) - 1;
      await startEvent(2);
      await inMode("main"); await shot("01-main-menu");
      assert(names().join() === "Fight,Bag,Pokémon,Run", "main menu items");
      await choose(/^Fight/); await inMode("moves"); await shot("02-moves");
      await choose(/^flamethrower|Flamethrower/i);
      await inMode("learn"); await shot("03-learn-prompt");
      assert(battle()._log._lines.some((l: string) => /grew to Lv. 51/.test(l)), "level-up text shown");
      await choose(/Forget roost/i);
      await inMode("main");
      await choose(/^Fight/); await inMode("moves");
      assert(names().some((n) => /slash/i.test(n)), "learned move is offered in the next request");
      await choose(/slash/i);
      await waitFor(() => !W.PSFlow.running || mode_() === "end", "end of battle");
      await inMode("end"); await shot("04-victory");
      await press("ok");
      await dismissMessages();
      const o = W.PSFlow.lastOutcome;
      eq([o.code, o.commit, o.kind], [1, "applied", "win"], "outcome");
      assert(G.$gameVariables.value(10) === 1, "result variable set for the event");
      const p = game().party[0];
      assert(p.level === 51 && p.moves.some((m: any) => m.id === "slash") && !p.moves.some((m: any) => m.id === "roost"), "level/moves written");
      assert(game().appliedBattles[o.battleId], "battle recorded as applied");
      assert(!G.$gameMap._interpreter.isRunning(), "map event finished after the battle");
      return { level: p.level, exp: p.exp, hp: p.hp };
    });

    await scenario("T2 trainer battle: Run refused with a reason (nothing consumed), a thrown Ball is spent and blocked by the trainer; cancels consume nothing", async () => {
      fresh(); const before = clone(game());
      await startEvent(2); await inMode("main");
      await choose(/^Run/); await inMode("main");
      assert(battle()._log._lines.some((l: string) => /no running from a trainer/i.test(l)), "run refused with a reason in a trainer battle");
      await choose(/^Bag/); await inMode("bag");
      await choose(/Poké Ball/); await inMode("main");
      assert(battle()._log._lines.some((l: string) => /blocked the Ball/i.test(l)), "the trainer blocks the thrown ball (WP38 2 / CP16), with its own message");
      assert(battle()._log._lines.filter((l: string) => /no running from a trainer/i.test(l)).length === 1, "the run message appears only for the Run attempt");
      assert(battle()._session.bag.pokeball === 4, "the blocked ball is spent (the run refusal consumed nothing)");
      await choose(/^Fight/); await inMode("moves"); await press("cancel"); await inMode("main");
      await choose(/^Bag/); await inMode("bag"); await choose(/Potion/); await inMode("party");
      const targets = battle()._menu._items;
      assert(targets.find((i: any) => /Blastoise/.test(i.name)).enabled === false, "a full-HP member is greyed out as a Potion target (refused before registration)");
      await press("cancel"); await inMode("bag");
      await press("cancel"); await inMode("main");
      eq(battle()._session.bag, { ...before.bag, pokeball: before.bag.pokeball - 1 }, "bag untouched by the cancels; only the thrown ball is spent");
      await choose(/^Pokémon/); await inMode("party");
      const items = battle()._menu._items;
      assert(items[0].enabled === false, "the active member cannot be switched to itself");
      await press("cancel"); await inMode("main");
      // finish the battle: two KOs
      for (let i = 0; i < 2; i++) { await choose(/^Fight/); await inMode("moves"); await choose(/flamethrower/i); await frames(5); await waitFor(() => mode_() === "main" || mode_() === "end" || mode_() === "learn", "after attack"); if (mode_() === "learn") { await choose(/Don't learn/); } await frames(5); if (mode_() === "end") break; await inMode("main"); }
      await inMode("end"); await press("ok"); await dismissMessages();
      eq(W.PSFlow.lastOutcome.commit, "applied", "finished and committed");
      eq(game().bag, { ...before.bag, pokeball: before.bag.pokeball - 1 }, "committed bag: only the ball that the trainer blocked is spent");
    });

    await scenario("T3 wild run: faster user escapes, committed as 'ran', state unchanged apart from battle bookkeeping", async () => {
      fresh(); const before = clone(game());
      await startEvent(1); await inMode("main");
      await choose(/^Run/);
      await inMode("end"); await press("ok"); await dismissMessages();
      const o = W.PSFlow.lastOutcome; eq([o.code, o.kind], [3, "run"], "ran");
      eq(game().party.map((m: any) => [m.id, m.level, m.hp]), before.party.map((m: any) => [m.id, m.level, m.hp]), "party unchanged");
      eq(game().bag, before.bag, "bag unchanged");
    });

    await scenario("T4 capture: Master Ball from the bag, captured member joins with its stable id", async () => {
      fresh();
      await startEvent(3); await inMode("main");
      await choose(/^Bag/); await inMode("bag"); await shot("05-bag");
      await choose(/Master Ball/);
      await inMode("end"); await press("ok"); await dismissMessages();
      const o = W.PSFlow.lastOutcome; eq([o.code, o.kind, o.commit], [2, "caught", "applied"], "caught");
      const g = game();
      assert(g.party.length === 4 && /^W\d+-1$/.test(g.party[3].id), "stable id of the caught member: " + (g.party[3] && g.party[3].id));
      assert(!g.bag.masterball, "master ball consumed once");
      assert(g.dex.owned.includes("Snorlax"), "dex updated");
    });

    await scenario("T5 item from the bag: Potion on the active member, consumed once and persisted", async () => {
      fresh(); game().party[0].hp = 60;
      await startEvent(1); await inMode("main"); // wild Pidgey: its Tackle only scratches
      await choose(/^Bag/); await inMode("bag"); await choose(/Potion/); await inMode("party"); await shot("06-item-target");
      await choose(/Charizard/);
      await inMode("main");
      assert(battle()._log._lines.some((l: string) => /Recovered 20 HP/.test(l)), "heal text");
      await choose(/^Run/); await inMode("end"); await press("ok"); await dismissMessages();
      const g = game();
      assert(g.bag.potion === 2, "one potion consumed");
      assert(g.party[0].hp >= 70 && g.party[0].hp <= 80, "healed HP persisted (60 + 20 minus a scratch): " + g.party[0].hp);
    });

    await scenario("T6 failure exit: engine error mid-battle aborts cleanly, nothing committed, the event still continues", async () => {
      fresh(); const before = clone(game());
      W.PSFlow.debug.failNext = "move";
      await startEvent(1); await inMode("main");
      await choose(/^Fight/); await inMode("moves"); await choose(/flamethrower/i);
      await inMode("end"); await shot("07-abort");
      assert(battle()._aborted, "scene shows the aborted ending");
      await press("ok"); await dismissMessages();
      eq(game(), before, "persistent state identical after the abort");
      assert(W.PSFlow.lastOutcome.aborted && G.$gameVariables.value(10) === 0, "aborted outcome and variable 0");
      assert(!W.PSFlow.running && !G.$gameMap._interpreter.isRunning(), "flow closed and interpreter released");
    });

    await scenario("T7 save/restore outside battle + idempotent re-commit after restore", async () => {
      fresh(); game().party[0].hp = 60;
      await startEvent(3); await inMode("main");
      await choose(/^Bag/); await inMode("bag"); await choose(/Master Ball/); await inMode("end"); await press("ok"); await dismissMessages();
      const snap = clone(game()); const lastResult = clone(W.PSFlow.lastResult);
      const rc = await G.DataManager.saveGame(1);
      game().money = 123456; G.$gameSystem._psGame.party.pop(); // diverge in memory
      const lc = await G.DataManager.loadGame(1);
      eq(game(), snap, "state restored from the MZ save equals the saved state");
      eq(W.PSFlow.commit(lastResult), "already-applied", "re-committing the same result after restore is a no-op");
      eq(game(), snap, "state unchanged by the duplicate commit");
      fs.writeFileSync(path.join(path.dirname(OUT || "."), "ps-flow-expected.json"), JSON.stringify(snap));
      return { saveCode: rc, loadCode: lc };
    });

    await scenario("T9 legacy and unusable saves through MZ's own save/load: schema 1 migrates, newer or damaged states are refused and kept", async () => {
      fresh();
      const legacy = clone(game()); legacy.schema = 1; delete legacy.claims; // a step 2 document had no claims ledger
      for (const m of legacy.party) delete m.statusCount;
      legacy.party[1].status = "tox"; legacy.party[2].status = "slp";
      G.$gameSystem._psGame = legacy;
      const rc1 = await G.DataManager.saveGame(2);
      G.$gameSystem._psGame = { diverged: true };
      const lc1 = await G.DataManager.loadGame(2);
      assert(!G.$gameSystem._psSaveError, "a schema 1 state loads without error");
      eq([game().schema, game().party[1].status, game().party[1].statusCount, game().party[2].status, game().party[2].statusCount], [3, "psn", 0, "slp", undefined], "migrated on load");
      eq([G.$gameSystem._psSaveInfo.from, G.$gameSystem._psSaveInfo.to, G.$gameSystem._psSaveInfo.migrated], [1, 3, true], "migration recorded");
      // a state written by a newer build, and a damaged one
      for (const [slot, doc, code] of [[3, { ...clone(game()), schema: 9 }, "unknown-version"], [4, "not a state", "corrupt"]] as [number, any, string][]) {
        G.$gameSystem._psGame = doc;
        await G.DataManager.saveGame(slot);
        G.$gameSystem._psGame = { diverged: true };
        await G.DataManager.loadGame(slot);
        eq(G.$gameSystem._psSaveError && G.$gameSystem._psSaveError.code, code, "refused with a diagnosis: " + code);
        eq(G.$gameSystem._psGame, doc, "the raw document is kept exactly as saved");
        let threw = ""; try { W.PSFlow.game(); } catch (e) { threw = String(e); }
        assert(new RegExp(code).test(threw), "battles refuse to run on it: " + threw);
        await startEvent(1);
        await waitFor(() => { const o = W.PSFlow.lastOutcome; return !!o && o.aborted === true; }, "the battle aborts instead of running on an unusable state");
        assert(new RegExp(code).test(W.PSFlow.lastOutcome.error), "the abort says why: " + W.PSFlow.lastOutcome.error);
        eq(G.$gameSystem._psGame, doc, "still untouched after the refused battle (checked before the harness resets the game)");
        await recover();
      }
      fresh();
      assert(!G.$gameSystem._psSaveError, "an explicit reset clears the diagnosis");
      return { saveCodes: [rc1], loadCodes: [lc1] };
    });

    await scenario("T10 a save that refers to content which no longer exists: the battle is refused with the reference named, the state is untouched", async () => {
      fresh();
      game().party[1].species = "Missingno"; game().party[0].moves[0].id = "notamove";
      const before = clone(game());
      await startEvent(1);
      await waitFor(() => { const o = W.PSFlow.lastOutcome; return !!o && o.aborted === true; }, "the battle aborts");
      const msg = W.PSFlow.lastOutcome.error;
      assert(/species "Missingno" is not in the content "sample"/.test(msg) && /party\[0\]\.moves\[0\]\.id "notamove" is not a move/.test(msg), "the message names both references: " + msg);
      eq(game(), before, "state untouched by the refused battle");
      await recover();
    });

    await scenario("T11 an operation fails and its rollback fails too: the session is closed with both errors kept, nothing is committed, the event still continues", async () => {
      fresh(); const before = clone(game());
      const Gateway = nodeRequire("./js/engine/gateway.cjs").BattleGateway;
      const restore = Gateway.restore;
      try {
        await startEvent(1); await inMode("main");
        const session = battle()._session;
        const gwChoose = session.gw.choose.bind(session.gw);
        session.gw.choose = async (...a: any[]) => { const ok = await gwChoose(...a); if (a[0] === "p2") throw new Error("injected operation failure"); return ok; };
        Gateway.restore = async () => { throw new Error("injected rollback failure"); };
        await choose(/^Fight/); await inMode("moves"); await choose(/flamethrower/i);
        await inMode("end");
        Gateway.restore = restore;
        assert(battle()._aborted, "scene shows the aborted ending");
        const msg = W.PSFlow.lastOutcome.error;
        assert(/injected operation failure/.test(msg) && /injected rollback failure/.test(msg), "both errors reach the outcome: " + msg);
        assert(session.broken && session.broken.name === "SessionBrokenError", "the session is closed");
        let refused = false; try { await session.useItem("potion", "A-0001"); } catch (e: any) { refused = e === session.broken; }
        assert(refused, "a closed session refuses later actions with the same error");
        let noResult = false; try { session.result(); } catch (e: any) { noResult = e === session.broken; }
        assert(noResult, "an untrusted result cannot be read");
        await press("ok"); await dismissMessages();
        eq(game(), before, "persistent state identical: nothing was committed");
        assert(W.PSFlow.lastOutcome.aborted && W.PSFlow.lastOutcome.commit === "none" && G.$gameVariables.value(10) === 0, "aborted outcome, nothing committed, variable 0");
        assert(!W.PSFlow.running && !G.$gameMap._interpreter.isRunning(), "flow closed and interpreter released");
      } finally { Gateway.restore = restore; }
    });

    await scenario("T12 committed but the host projection fails: the commit stands and is reported, nothing is applied twice, a retry informs the host", async () => {
      fresh(); const before = clone(game());
      W.PSFlow.debug.failProjection = true;
      await startEvent(1); await inMode("main");
      const session = battle()._session;
      await choose(/^Run/); await inMode("end"); await press("ok"); await dismissMessages();
      const o = W.PSFlow.lastOutcome;
      eq([o.code, o.kind, o.commit, o.projection], [3, "run", "applied", "failed"], "committed, host not informed");
      assert(/injected projection failure/.test(o.projectionError), "the projection error is reported: " + o.projectionError);
      assert(!o.aborted, "a failed projection is not an abort");
      assert(game().appliedBattles[o.battleId], "the result is in the persistent state");
      eq(G.$gameVariables.value(10), 0, "the host variable was not written");
      assert(!W.PSFlow.running && !G.$gameMap._interpreter.isRunning(), "the flow closed and the event continued");
      const applied = clone(game());
      eq(W.PSFlow.commit(W.PSFlow.lastResult), "already-applied", "a repeat commit is a no-op");
      eq(game(), applied, "nothing was applied twice");
      const retry = W.PSFlow.app().finishBattle(session, W.PSFlow.request);
      eq([retry.commit, retry.projection, retry.code], ["already-applied", "ok", 3], "the retry only informs the host");
      eq(G.$gameVariables.value(10), 3, "the host variable now carries the outcome");
      eq(game(), applied, "still applied once");
      eq(game().party.map((m: any) => [m.id, m.level, m.hp]), before.party.map((m: any) => [m.id, m.level, m.hp]), "a run changes no member");
    });

    await scenario("T13 application initialization fails: stale result is cleared, state stays untouched and the event continues", async () => {
      fresh(); const before = clone(game());
      const Module = nodeRequire("module"), load = Module._load;
      W.PSFlow._app = null; W.PSFlow._dex = null;
      G.$gameVariables.setValue(10, 1); // the previous battle won
      let injected = 0;
      try {
        Module._load = function (id: string, ...args: any[]) {
          if (/\/showdown\/dist\/sim$/.test(id)) { injected++; throw new Error("injected dex initialization failure"); }
          return load.call(this, id, ...args);
        };
        await startEvent(1); await inMode("end");
        eq([W.PSFlow.lastOutcome.code, W.PSFlow.lastOutcome.commit, W.PSFlow.lastOutcome.aborted, W.PSFlow.lastOutcome.projection], [0, "none", true, "ok"], "initialization failed, abort projection succeeded");
        assert(injected >= 2 && !W.PSFlow._app, "both begin and abort failed to construct the real application");
        assert(/injected dex initialization failure/.test(W.PSFlow.lastOutcome.error), "the initialization error is retained");
        eq(W.PSFlow.lastOutcome.battleId, W.PSFlow.request.battleId, "aborted battle identity retained");
        eq(G.$gameVariables.value(10), 0, "stale win cleared");
        await press("ok"); await dismissMessages();
        eq(game(), before, "nothing committed");
        assert(!W.PSFlow.running && !G.$gameMap._interpreter.isRunning(), "interpreter released");
        return { injected, outcome: clone(W.PSFlow.lastOutcome), resultVariable: G.$gameVariables.value(10) };
      } finally { Module._load = load; W.PSFlow._app = null; W.PSFlow._dex = null; }
    });

    await scenario("T14 invalid result outcome: abort before capture commit; a corrected retry applies exactly once", async () => {
      fresh(); game().bag.masterball = 1; const before = clone(game());
      G.$gameVariables.setValue(10, 1);
      await startEvent(1); await inMode("main");
      const session = battle()._session;
      await choose(/^Bag/); await inMode("bag"); await choose(/Master Ball/i); await inMode("end");
      const readResult = session.result;
      try {
        session.result = function () { const r = clone(readResult.call(this)); delete r.outcome; return r; };
        await press("ok"); await dismissMessages();
        const aborted = clone(W.PSFlow.lastOutcome);
        eq([aborted.battleId, aborted.code, aborted.commit, aborted.aborted], [W.PSFlow.request.battleId, 0, "none", true], "invalid result aborted");
        assert(/invalid battle outcome/.test(aborted.error), "contract error reported");
        eq(G.$gameVariables.value(10), 0, "event sees abort");
        eq(game(), before, "capture, bag and ledger untouched");
        session.result = readResult;
        const fixed = W.PSFlow.app().finishBattle(session, W.PSFlow.request), after = clone(game());
        eq([fixed.code, fixed.commit, fixed.projection], [2, "applied", "ok"], "corrected result committed");
        eq(after.party.length, before.party.length + 1, "one capture");
        assert(!after.bag.masterball, "one ball consumed");
        const repeated = W.PSFlow.app().finishBattle(session, W.PSFlow.request);
        eq(repeated.commit, "already-applied", "duplicate is a no-op"); eq(game(), after, "no duplicate reward");
        assert(!W.PSFlow.running && !G.$gameMap._interpreter.isRunning(), "interpreter released");
        return { aborted, correctedCommit: fixed.commit, repeatedCommit: repeated.commit };
      } finally { session.result = readResult; }
    });

    await scenario("T15 new game slice: formal empty state (no fixture), the starter grant once, a repeat changes nothing, heal twice, MZ gold/items untouched; saved for the restart check", async () => {
      G.DataManager.setupNewGame();
      W.PSFlow.rng = seeded(4242);
      try {
        const g0 = clone(game());
        eq([g0.schema, g0.party.length, g0.boxes.length, g0.bag, g0.money, g0.claims, g0.appliedBattles], [3, 0, 0, {}, 3000, {}, {}], "a new game is the formal empty state");
        assert(!JSON.stringify(g0).includes("A-000"), "no fixture member in a new game");
        const mz0 = mzParty();
        eq([G.$dataSystem.startMapId, G.$dataSystem.startX, G.$dataSystem.startY], [5, 8, 9], "the project starts on the slice map");
        await toMapId(5, 8, 9);
        G.$gameVariables.setValue(11, -1);
        await runEvent(1);
        eq([W.PSFlow.lastClaim.status, G.$gameVariables.value(11)], ["applied", 1], "starter granted, the event sees 1");
        const g1 = clone(game());
        eq(g1.party.map((m: any) => [m.id, m.species, m.level, m.moves.map((x: any) => x.id)]), [["G-starter-1", "Charmander", 5, ["scratch", "growl", "ember"]]], "the starter comes from the content");
        eq([g1.bag, g1.claims, g1.money], [{ antidote: 2, pokeball: 10, potion: 5 }, { starter: { kind: "grant" } }, 3000], "items and the claim");
        await runEvent(1);
        eq([W.PSFlow.lastClaim.status, G.$gameVariables.value(11)], ["already-claimed", 2], "the repeat is reported");
        eq(game(), g1, "the repeat changes nothing");
        const m = game().party[0]; m.hp = 1; m.status = "psn"; m.moves[0].pp = 0; // hurt (test only: written straight into the state)
        G.$gameVariables.setValue(12, -1);
        await runEvent(2);
        eq([W.PSFlow.lastHeal.status, G.$gameVariables.value(12)], ["healed", 1], "healed");
        const h = game().party[0];
        eq([h.hp, h.status, h.moves[0].pp], [g1.party[0].hp, "", h.moves[0].maxpp], "HP, status and PP restored");
        const g2 = clone(game());
        await runEvent(2);
        eq([W.PSFlow.lastHeal.status, G.$gameVariables.value(12)], ["unchanged", 1], "a second heal is safe");
        eq(game(), g2, "and changes nothing");
        eq(mzParty(), mz0, "MZ gold and items are not a second authority: untouched by grants and heals");
        const rc = await G.DataManager.saveGame(5);
        fs.writeFileSync(path.join(path.dirname(OUT || "."), "ps-flow-expected-t15.json"), JSON.stringify({ state: g2, mz: mz0 }));
        return { saveCode: rc, starter: g1.party[0] };
      } finally { W.PSFlow.rng = seeded(1); }
    });

    await scenario("T15b a save made before the framework state existed loads as the formal empty state (no invented party), and the starter can be claimed", async () => {
      G.DataManager.setupNewGame();
      delete G.$gameSystem._psGame;
      await G.DataManager.saveGame(6);
      G.$gameSystem._psGame = { diverged: true };
      await G.DataManager.loadGame(6);
      const info = G.$gameSystem._psSaveInfo;
      eq([info && info.created, game().party.length, game().money, game().claims], ["empty", 0, 0, {}], "empty state created on load and reported");
      assert(!G.$gameSystem._psSaveError, "not an error");
      eq(W.PSFlow.claim("starter").status, "applied", "the player can still receive the starter");
      await recover();
    });
    // ================================================================ step 4 batch B: exploration and the battle loop
    await scenario("T16 encounter host check: region filter, nothing while an event runs, nothing while busy, a real trigger opens the framework battle, no save during it, no immediate re-trigger after it", async () => {
      await slice(16);
      const note = G.$dataMap.meta.PSEncounter;
      assert(typeof note === "string" && /pidgey/.test(note), "the slice map carries the encounter note: " + note);
      // outside the region: the counter runs out, the application says not-here, nothing opens
      await stepInto(9, 9, 6);
      eq([W.PSFlow.lastEncounter && W.PSFlow.lastEncounter.reason, !!battle()], ["not-here", false], "outside region 1 nothing happens");
      assert(G.$gamePlayer._encounterCount > 0, "the step counter was refilled");
      // inside the region while an event runs: nothing
      G.$gamePlayer.locate(4, 9); await frames(2);
      W.PSFlow.lastEncounter = null;
      G.$gameMap.event(1).start(); await waitFor(() => G.$gameMessage.isBusy(), "event message");
      G.$gamePlayer._encounterCount = 0; await frames(40);
      eq([!!battle(), W.PSFlow.lastEncounter], [false, null], "no encounter while an event runs");
      G.$gamePlayer._encounterCount = 50; await dismissMessages();
      // busy (a battle flag already set): silent, no exception, no second scene
      W.PSFlow.running = true; G.$gamePlayer._encounterCount = 0; await frames(30);
      const busyBattle = !!battle(); W.PSFlow.running = false; G.$gamePlayer._encounterCount = 50;
      eq([busyBattle, W.PSFlow.lastEncounter], [false, null], "busy: nothing opens and nothing is decided");
      // a real trigger
      const saveBefore = G.$gameSystem.isSaveEnabled();
      await stepInto(4, 9, 2);
      await waitFor(() => battle() && battle()._mode !== "boot", "encounter battle scene");
      const req = W.PSFlow.request;
      assert(req.encounter && /^wild#\d+$/.test(req.battleId), "an encounter request: " + req.battleId);
      assert(["Pidgey", "Caterpie"].includes(req.foes[0].species) && req.foes[0].level >= 2 && req.foes[0].level <= 4, "a foe from the table: " + JSON.stringify(req.foes));
      await inMode("main");
      const foe = battle()._session.foeTeam[0];
      assert(foe.id === `W${req.seq}-1` && foe.moves.length > 0 && foe.ivs, "the foe was created from the content");
      eq([saveBefore, G.$gameSystem.isSaveEnabled()], [true, false], "saving is off during the battle");
      assert(!G.Window_MenuCommand.prototype.isSaveEnabled.call({}), "the menu save command is disabled");
      assert(!G.Scene_Base.prototype.isAutosaveEnabled.call(battle()), "autosave is off");
      let refused: any = null; await G.DataManager.saveGame(9).catch((e: any) => { refused = e; });
      assert(refused && /battle is running/.test(String(refused)), "a direct save is refused: " + refused);
      eq(W.PSState.lastSaveError && W.PSState.lastSaveError.code, "battle-running", "and the refusal is diagnosable");
      await choose(/^Run/); await finishBattle();
      eq([W.PSFlow.lastOutcome.code, W.PSFlow.lastOutcome.commit], [3, "applied"], "ran");
      eq(G.$gameSystem.isSaveEnabled(), true, "saving is back on");
      assert(G.$gamePlayer._encounterCount > 0, "a fresh step count was drawn at the trigger");
      W.PSFlow.lastEncounter = null; await frames(90);
      eq([!!battle(), W.PSFlow.lastEncounter], [false, null], "standing still after the battle does not re-trigger");
      return { foe: req.foes[0], battleId: req.battleId };
    });

    await scenario("T17 encounter win: Ember until the foe faints, level-up to 8 and the level 8 move learned; HP/PP/status/exp written back once", async () => {
      await slice(17);
      const m = game().party[0]; m.exp = E.minExp("parabolic", 8) - 1;
      await stepInto(4, 9, 2); await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
      await fightUntilEnd(/^Ember|^ember/i);
      const live = battle()._session.gw.readState("p1").find((x: any) => x.id === "G-starter-1");
      await finishBattle();
      const o = W.PSFlow.lastOutcome; eq([o.code, o.commit, o.kind], [1, "applied", "win"], "won");
      const p = game().party[0];
      eq([p.level, p.moves.map((x: any) => x.id)], [8, ["scratch", "growl", "ember", "smokescreen"]], "level 8 and Smokescreen learned");
      eq([p.hp, p.status], [live.hp, live.status || ""], "HP and status from the engine");
      eq(p.moves[2].pp, live.pp.ember, "Ember PP written back"); assert(p.moves[2].pp < p.moves[2].maxpp, "PP was used");
      eq(W.PSFlow.commit(W.PSFlow.lastResult), "already-applied", "a repeat commit is a no-op");
      return { level: p.level, exp: p.exp, hp: p.hp, emberPp: p.moves[2].pp };
    });

    await scenario("T18 full party: a Potion is used, Poké Balls are thrown until one catches, the catch goes to the boxes with a message, and two catches never share an id", async () => {
      await slice(18);
      const g = game();
      for (let i = 2; i <= 6; i++) g.party.push(mkMember(`P-${i}`, "Caterpie", 3));
      g.party[0].hp = 5; g.bag.pokeball = 30;
      const ids: string[] = [];
      for (let round = 0; round < 2; round++) {
        await stepInto(4, 9, 2); await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
        if (round === 0) {
          await choose(/^Bag/); await inMode("bag"); await choose(/Potion/); await inMode("party"); await choose(/Charmander/); await inMode("main");
          assert(battle()._log._lines.some((l: string) => /Recovered/.test(l)), "the Potion healed");
        }
        for (let i = 0; i < 25 && mode_() !== "end"; i++) { if (mode_() === "party-forced") { await choose(/Caterpie/); await waitFor(() => ["main", "end"].includes(mode_()) && !battle()._busy, "after the switch"); continue; } await choose(/^Bag/); await inMode("bag"); await choose(/Poké Ball/); await waitFor(() => ["main", "end", "party-forced"].includes(mode_()) && battle()._queue.length === 0 && !battle()._busy, "after the throw"); }
        await inMode("end");
        assert(battle()._log._lines.some((l: string) => /sent to the boxes/.test(l)), "the player is told the catch went to the boxes");
        await press("ok"); await dismissMessages(); await waitFor(() => !W.PSFlow.running && !battle(), "back"); await frames(5);
        eq([W.PSFlow.lastOutcome.code, W.PSFlow.lastOutcome.commit], [2, "applied"], "caught");
        ids.push(game().boxes[game().boxes.length - 1].id);
      }
      eq([game().party.length, game().boxes.length], [6, 2], "party unchanged, two in the boxes");
      assert(ids[0] !== ids[1] && ids.every((id) => /^W\d+-1$/.test(id)), "distinct stable ids: " + ids.join(","));
      eq(game().bag.potion, 4, "one potion used");
      return { ids, balls: game().bag.pokeball };
    });

    await scenario("T19 party and boxes full: the ball is refused with the reason before anything is spent", async () => {
      await slice(19);
      const g = game();
      for (let i = 2; i <= 6; i++) g.party.push(mkMember(`P-${i}`, "Caterpie", 3));
      g.boxes.push(mkMember("B-1", "Pidgey", 3));
      W.PSFlow.testLimits = { party: 6, boxes: 1, bagPerItem: 999, money: 999999 }; W.PSFlow._app = null;
      const before = clone(game());
      await stepInto(4, 9, 2); await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
      await choose(/^Bag/); await inMode("bag"); await choose(/Poké Ball/); await inMode("main");
      assert(battle()._log._lines.some((l: string) => /party and boxes are full/.test(l)), "the reason is shown");
      eq(battle()._session.bag.pokeball, before.bag.pokeball, "nothing spent");
      await choose(/^Run/); await finishBattle();
      eq([game().party.length, game().boxes.length, game().bag.pokeball], [6, 1, before.bag.pokeball], "nothing stored or spent");
      W.PSFlow.testLimits = null; W.PSFlow._app = null;
    });

    await scenario("T20 encounter defeat: money lost (highest level x 8) and the party healed with the commit, the player taken home, nothing left running", async () => {
      await slice(20);
      const g = game(); g.party = [mkMember("S-1", "Snorlax", 2, { hp: 1 })]; g.money = 1000;
      await stepInto(4, 9, 2); await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
      await choose(/^Fight/); await inMode("moves"); await choose(/tackle/i);
      await inMode("end"); await press("ok");
      await dismissMessages();
      await waitFor(() => G.$gameMap.mapId() === 5 && G.$gamePlayer.x === 8 && G.$gamePlayer.y === 9 && !G.SceneManager.isSceneChanging(), "home");
      const o = W.PSFlow.lastOutcome;
      eq([o.code, o.commit, o.blackout, o.defeat], [4, "applied", true, { moneyLost: 16, healed: true }], "defeat settled with the commit");
      eq(game().money, 984, "money lost once"); assert(game().party[0].hp > 1 && game().party[0].status === "", "healed");
      eq(W.PSFlow.lastReturn.status, "requested", "the trip home was requested");
      assert(!W.PSFlow.running && !G.$gameMap._interpreter.isRunning() && G.$gameSystem.isSaveEnabled(), "nothing running or waiting, saving back on");
    });

    await scenario("T21 the trip home fails after the commit: the defeat stays settled once, a retry only moves the player", async () => {
      await slice(21);
      const g = game(); g.party = [mkMember("S-1", "Snorlax", 2, { hp: 1 })]; g.money = 1000;
      W.PSFlow.debug.failReturn = true;
      await stepInto(4, 9, 2); await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
      await choose(/^Fight/); await inMode("moves"); await choose(/tackle/i);
      await inMode("end"); await press("ok"); await dismissMessages(); await frames(20);
      eq([W.PSFlow.lastReturn.status, G.$gamePlayer.x, G.$gamePlayer.y], ["failed", 4, 10], "still where the battle was");
      eq(game().money, 984, "settled once");
      const settled = clone(game());
      const r = W.PSFlow.retryReturnHome(); eq(r.status, "requested", "retry requested");
      await waitFor(() => G.$gamePlayer.x === 8 && G.$gamePlayer.y === 9 && !G.SceneManager.isSceneChanging(), "home after the retry");
      eq(game(), settled, "the retry changed nothing in the state");
      eq(W.PSFlow.retryReturnHome().status, "none", "nothing left to retry");
    });

    await scenario("T22 an event battle lost with canLose off ends the event and goes home; an event that had disabled saving keeps it disabled", async () => {
      await toMap(); const g = game(); g.party = [mkMember("S-1", "Snorlax", 2, { hp: 1 })]; g.money = 500;
      G.$gameSystem.disableSave();
      G.$gameMessage.clear();
      await startEvent(1); await inMode("main");
      await choose(/^Fight/); await inMode("moves"); await choose(/tackle/i);
      await inMode("end"); await press("ok");
      await dismissMessages();
      await waitFor(() => G.$gameMap.mapId() === 5 && !G.SceneManager.isSceneChanging(), "taken home");
      eq([W.PSFlow.lastOutcome.code, W.PSFlow.lastOutcome.blackout, game().money], [4, true, 484], "defeat settled and blacked out");
      assert(!G.$gameMap._interpreter.isRunning(), "the event did not continue after the defeat");
      eq(G.$gameSystem.isSaveEnabled(), false, "saving stays disabled because the event had disabled it");
      G.$gameSystem.enableSave();
      await recover();
    });

    await scenario("T23 a real save failure is diagnosable and changes nothing; the next good save clears it", async () => {
      await slice(23);
      const before = clone(game());
      const so = G.StorageManager.saveObject;
      let err: any = null;
      try {
        G.StorageManager.saveObject = () => Promise.reject(new Error("injected: disk full"));
        await G.DataManager.saveGame(8).catch((e: any) => { err = e; });
      } finally { G.StorageManager.saveObject = so; }
      assert(err && /disk full/.test(String(err)), "the save rejected");
      eq([W.PSState.lastSaveError.code, W.PSState.lastSaveError.savefileId], ["write-failed", 8], "diagnosed");
      eq(game(), before, "state unchanged");
      await G.DataManager.saveGame(8);
      eq(W.PSState.lastSaveError, null, "a good save clears the diagnosis");
    });

    await scenario("T24 the read-only party screen: from the slice sign and from the main menu; it shows party, boxes, bag and money and changes nothing", async () => {
      await slice(24);
      game().boxes.push(mkMember("B-1", "Pidgey", 3));
      const before = clone(game());
      G.$gameMap.event(3).start(); await frames(3);
      for (let i = 0; i < 20 && !(scene() && scene()._psParty); i++) { if (G.$gameMessage.isBusy()) await press("ok"); else await frames(5); }
      await waitFor(() => scene() && scene()._psParty, "party screen from the sign");
      const lines = scene()._text._lines.join("\n");
      assert(/Charmander\s+Lv5/.test(lines) && /Boxes: 1/.test(lines) && /Potion x5/.test(lines) && /Money: 3000/.test(lines), "the screen shows the state: " + lines);
      await press("cancel"); await waitFor(() => scene() && scene()._spriteset, "back on the map"); await dismissMessages();
      G.SceneManager.push(G.Scene_Menu); await waitFor(() => scene() && scene()._commandWindow, "main menu");
      const cw = scene()._commandWindow;
      assert(cw._list.some((c: any) => c.symbol === "psParty"), "the menu has the Party entry");
      cw.selectSymbol("psParty"); cw.processOk();
      await waitFor(() => scene() && scene()._psParty, "party screen from the menu");
      await press("cancel"); await waitFor(() => scene() && scene()._commandWindow, "back in the menu");
      await press("cancel"); await waitFor(() => scene() && scene()._spriteset, "back on the map");
      eq(game(), before, "read only");
      return { lines: lines.split("\n").length };
    });

    await scenario("T25 the battle counter is saved with the state: after loading an older save the next catch can reuse a discarded id, but no id is ever duplicated within one save timeline", async () => {
      await slice(25);
      const g = game(); for (let i = 2; i <= 6; i++) g.party.push(mkMember(`P-${i}`, "Caterpie", 3)); g.bag.masterball = 5;
      const catchOne = async () => {
        await stepInto(4, 9, 2); await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
        await choose(/^Bag/); await inMode("bag"); await choose(/Master Ball/); await finishBattle();
        eq(W.PSFlow.lastOutcome.code, 2, "caught"); return game().boxes[game().boxes.length - 1].id;
      };
      const a = await catchOne();
      await G.DataManager.saveGame(10); const seqSaved = G.$gameSystem._psBattleSeq;
      const b = await catchOne();
      await G.DataManager.loadGame(10);
      eq([G.$gameSystem._psBattleSeq, game().boxes.map((m: any) => m.id)], [seqSaved, [a]], "counter and state rolled back together");
      await toMapId(5, 8, 9);
      const c = await catchOne();
      const ids = [...game().party, ...game().boxes].map((m: any) => m.id);
      eq(new Set(ids).size, ids.length, "no duplicate id in this timeline: " + ids.join(","));
      eq(c, b, "the discarded timeline's id is reused, which is safe (it exists in no loaded state)");
      return { a, b, c, seqSaved };
    });

    await scenario("T26 play-through for the restart check: new game, starter, a won encounter (growth), a catch into the party, a full party (test setup) and a catch into the boxes, the nurse, a walk; saved", async () => {
      await slice(26);
      const m0 = game().party[0]; m0.exp = E.minExp("parabolic", 8) - 1; // test setup: one fight away from level 8
      game().bag.masterball = 2; // test setup: certain catches
      await stepInto(4, 9, 2); await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
      await fightUntilEnd(/^Ember|^ember/i); await finishBattle();
      eq(W.PSFlow.lastOutcome.code, 1, "won"); eq(game().party[0].level, 8, "grew");
      await stepInto(4, 9, 8); await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
      await choose(/^Bag/); await inMode("bag"); await choose(/Master Ball/); await finishBattle();
      eq([W.PSFlow.lastOutcome.code, game().party.length], [2, 2], "caught into the party");
      for (let i = 3; i <= 6; i++) game().party.push(mkMember(`P-${i}`, "Caterpie", 3)); // test setup: a full party
      await stepInto(4, 9, 2); await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
      await choose(/^Bag/); await inMode("bag"); await choose(/Master Ball/); await finishBattle();
      eq([W.PSFlow.lastOutcome.code, game().party.length, game().boxes.length], [2, 6, 1], "caught into the boxes");
      game().party[0].hp = 3; game().party[0].moves[2].pp = 1; // hurt before the nurse
      await toMapId(5, 10, 5); await runEvent(2); eq(W.PSFlow.lastHeal.status, "healed", "nurse");
      G.$gamePlayer.locate(12, 6); G.$gamePlayer.setDirection(4); await frames(5);
      const rc = await G.DataManager.saveGame(11);
      const expected = { state: clone(game()), mz: mzParty(), map: { mapId: G.$gameMap.mapId(), x: G.$gamePlayer.x, y: G.$gamePlayer.y, d: G.$gamePlayer.direction() }, seq: G.$gameSystem._psBattleSeq };
      fs.writeFileSync(path.join(path.dirname(OUT || "."), "ps-flow-expected-t26.json"), JSON.stringify(expected));
      return { saveCode: rc, party: expected.state.party.map((m: any) => [m.id, m.level]), boxes: expected.state.boxes.map((m: any) => m.id), seq: expected.seq };
    });

    await scenario("T8 second language (Chinese sample): the real scene shows Chinese text, no key is missing, every drawn line fits its window", async () => {
      W.PSFlow.setLanguage("zh");
      try {
        await toMap(); // the step 4 scenarios end on the slice map; this one uses the battle test map
        await startEvent(1); await inMode("main");
        eq(names(), ["战斗", "背包", "精灵", "逃跑"], "main menu in Chinese");
        const fits = (where: string) => {
          const b = battle();
          for (const [label, win] of [["log", b._log], ["status", b._status]] as any[]) for (const line of win._lines) assert(win.textWidth(line) <= win.innerWidth, `${where}: ${label} line too wide (${win.textWidth(line)} > ${win.innerWidth}): ${line}`);
          for (const it of b._menu._items) assert(b._menu.textWidth(it.name) <= b._menu.innerWidth, `${where}: menu item too wide: ${it.name}`);
        };
        fits("main");
        assert(/PingFang|YaHei|Hiragino/.test(battle()._log.contents.fontFace), "the language's font is applied to the windows: " + battle()._log.contents.fontFace);
        await choose(/^战斗/); await inMode("moves"); fits("moves"); await press("cancel"); await inMode("main");
        await choose(/^背包/); await inMode("bag"); assert(names().some((n: string) => /伤药/.test(n)), "bag items come from the text keys"); fits("bag"); await press("cancel"); await inMode("main");
        await choose(/^精灵/); await inMode("party"); assert(names().some((n: string) => /喷火龙/.test(n)), "species names come from the content's text keys"); fits("party"); await press("cancel"); await inMode("main");
        await choose(/^逃跑/); await inMode("end"); fits("end");
        assert(battle()._log._lines.some((l: string) => /成功逃走了/.test(l)), "battle log line in Chinese");
        const all = [...battle()._log._lines, ...battle()._status._lines];
        assert(!all.some((l: string) => l.includes("[missing:")), "no unresolved key reached the screen");
        eq(W.PSFlow.translator().diagnostics(), { missingKeys: [], missingParams: [] }, "translator diagnostics are empty");
        await press("ok"); await dismissMessages();
      } finally { W.PSFlow.setLanguage(null); }
    });
  }

  /** S1..S10 engine/session matrix (js/engine/matrix.cjs) inside this runtime; fingerprints are compared with a Node run. */
  async function runMatrixMode() {
    const t0 = performance.now();
    const matrixModule = nodeRequire("./js/engine/matrix.cjs");
    const rows = await matrixModule.runMatrix();
    report.engineArtifact = matrixModule.artifactInfo(); // hash of the engine bundle this host actually loaded
    report.matrix = rows;
    report.matrixMs = Math.round(performance.now() - t0);
    for (const r of rows) results.push({ id: `${r.id} (matrix)`, status: r.status, ms: r.ms, fingerprint: r.fingerprint, error: r.error });
  }

  // ---------------------------------------------------------------- measurements (step 2.5)
  const pct = (a: number[], p: number) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return Math.round(b[Math.min(b.length - 1, Math.floor(p * b.length))] * 10) / 10; };
  const frameStats = (a: number[]) => ({ n: a.length, p50: pct(a, 0.5), p95: pct(a, 0.95), p99: pct(a, 0.99), max: a.length ? Math.round(Math.max(...a) * 10) / 10 : null, over33: a.filter((x) => x > 33.4).length, over50: a.filter((x) => x > 50).length, over100: a.filter((x) => x > 100).length });
  function osRssMb(): number | null {
    try {
      const out: string = nodeRequire("child_process").execSync("ps -ax -o rss=,command=").toString();
      let kb = 0; for (const l of out.split("\n")) if (l.includes("PokemonFrameworkPrototype.app")) kb += Number(l.trim().split(/\s+/)[0]) || 0;
      return kb ? Math.round(kb / 1024) : null;
    } catch (e) { return null; }
  }
  function mem(label: string) {
    const forced = typeof G.gc === "function"; // launch with --js-flags=--expose-gc for leak checks
    if (forced) { G.gc(); G.gc(); }
    const m = G.process.memoryUsage();
    const jh = (performance as any).memory;
    return { label, gcForced: forced, nodeRssMb: Math.round(m.rss / 1048576), nodeHeapUsedMb: Math.round(m.heapUsed / 1048576), jsHeapUsedMb: jh ? Math.round(jh.usedJSHeapSize / 1048576) : null, appRssMb: osRssMb() };
  }
  const med = (a: number[]) => pct(a, 0.5);

  async function runPerf() {
    const perf: any = { method: { t0: "shell epoch ms just before launch", timers: "performance.now()/Date.now() in the renderer", frames: "SceneManager.update deltas, window focused, fast=true (no message pacing)" }, stamps, memory: [] as any[] };
    if (t0) { perf.coldStart = { launchToPluginMs: stamps.pluginLoadedAt - t0 }; }
    await toMap();
    if (t0) { perf.coldStart.launchToMapReadyMs = stamps.mapReadyAt - t0; }
    perf.memory.push(mem("map ready (before any battle)"));
    sampling = true; lastFrameAt = 0;
    await frames(120); // idle map baseline
    // one battle of each kind; the very first includes the engine load
    const script = async (ev: number, steps: () => Promise<void>) => {
      await startEvent(ev); await inMode("main"); await steps();
      await inMode("end"); await press("ok"); await dismissMessages();
    };
    const run = async () => { await choose(/^Run/); };
    const fightKo = async () => { await choose(/^Fight/); await inMode("moves"); await choose(/flamethrower/i); await frames(5); await waitFor(() => ["end", "main", "learn"].includes(mode_()), "after KO"); };
    const potionRun = async () => { await choose(/^Bag/); await inMode("bag"); await choose(/Potion/); await inMode("party"); await choose(/Charizard/); await inMode("main"); await choose(/^Run/); };
    const ball = async () => { await choose(/^Bag/); await inMode("bag"); await choose(/Master Ball/); };
    await G.DataManager.setupNewGame(); W.PSFlow.resetGame(); W.PSFlow.fast = true; W.PSFlow.seed = undefined;
    G.$gamePlayer.reserveTransfer(4, 8, 8, 2, 0); G.SceneManager.goto(G.Scene_Map); await frames(30);
    W.PSFlow.seed = [1, 2, 3, 4];
    const kindsList: [string, number, () => Promise<void>][] = [["run", 1, run], ["fight-ko", 1, fightKo], ["potion+run", 1, potionRun], ["master-ball", 1, ball]];
    const rounds = Number(arg("ps-perf-rounds")) || 6;
    for (let r = 0; r < rounds; r++) {
      for (const [name, ev, fn] of kindsList) {
        game().bag.masterball = 5; game().bag.potion = 5; game().party[0].hp = 100; game().party[0].moves.forEach((m: any) => { m.pp = m.maxpp; }); game().party.length = Math.min(game().party.length, 3);
        W.PSFlow.perf.cur = null;
        try { await script(ev, fn); } catch (e: any) { perf.errors = (perf.errors || []).concat(`${name}#${r}: ${e.message}`); await recover(); }
        const b = W.PSFlow.perf.battles[W.PSFlow.perf.battles.length - 1];
        if (b) b.label = name;
      }
      if (r === 0) perf.memory.push(mem("after first round (4 battles)"));
      if (r === 2) perf.memory.push(mem("after 3 rounds (12 battles)"));
      if (rounds > 6 && (r + 1) % 5 === 0 && r + 1 < rounds) perf.memory.push(mem(`after ${r + 1} rounds (${(r + 1) * 4} battles)`));
    }
    perf.memory.push(mem(`after ${rounds} rounds (${rounds * 4} battles)`));
    sampling = false;
    // step 4 timings on the slice map: a map encounter until its first menu, and MZ save / load of a slice save
    try {
      const n = Number(arg("ps-perf-step4")) || 6;
      await slice(31);
      const enc: number[] = [], saveMs: number[] = [], loadMs: number[] = [];
      for (let i = 0; i < n; i++) {
        W.PSFlow.perf.cur = null;
        await stepInto(4, 9, i % 2 ? 8 : 2); await waitFor(() => battle() && battle()._mode !== "boot", "encounter"); await inMode("main");
        const cur = W.PSFlow.perf.cur; if (cur && cur.encounter && cur.firstMenuMs !== undefined) enc.push(cur.firstMenuMs);
        for (let k = 0; k < 6 && mode_() !== "end"; k++) { await choose(/^Run/); await waitFor(() => ["main", "end"].includes(mode_()) && !battle()._busy && battle()._queue.length === 0, "after run"); }
        await finishBattle();
      }
      for (let i = 0; i < n; i++) {
        let t = performance.now(); await G.DataManager.saveGame(12); saveMs.push(Math.round((performance.now() - t) * 10) / 10);
        t = performance.now(); await G.DataManager.loadGame(12); loadMs.push(Math.round((performance.now() - t) * 10) / 10);
      }
      const st = (a: number[]) => ({ n: a.length, p50: pct(a, 0.5), max: a.length ? Math.max(...a) : null, samples: a });
      perf.step4 = { method: "slice map, encounter forced by an exhausted step counter; encounter = executeEncounter -> first battle menu (performance.now); save/load = DataManager.saveGame/loadGame promise round trip, slot 12, test save folder", encounterToFirstMenuMs: st(enc), saveMs: st(saveMs), loadMs: st(loadMs) };
    } catch (e: any) { perf.errors = (perf.errors || []).concat(`step4 timings: ${e.message}`); }
    const bs: any[] = W.PSFlow.perf.battles;
    perf.engineLoadMs = W.PSFlow.perf.engineLoadMs;
    perf.firstBattle = bs[0] ? { sessionMs: bs[0].sessionMs, firstMenuMs: bs[0].firstMenuMs, totalMs: bs[0].totalMs, label: bs[0].label } : null;
    const later = bs.slice(1);
    perf.laterBattles = { n: later.length, sessionMsMedian: med(later.map((b) => b.sessionMs)), firstMenuMsMedian: med(later.map((b) => b.firstMenuMs)), firstMenuMsMax: Math.max(...later.map((b) => b.firstMenuMs)) };
    const byKind: any = {};
    for (const b of bs) for (const a of b.actions) (byKind[a.kind] ||= []).push(a.ms);
    perf.actionMs = Object.fromEntries(Object.entries(byKind).map(([k, v]: any) => [k, { n: v.length, p50: pct(v, 0.5), p95: pct(v, 0.95), max: Math.max(...v) }]));
    perf.frames = { battleScene: frameStats(frameLog.battle), mapScene: frameStats(frameLog.map) };
    // battles that overlap a blur..focus interval are throttled by Chromium: keep them out of the "focused" statistics
    const blurIv: [number, number][] = []; let bAt: number | null = null;
    for (const e of focusLog) { if (e.ev === "blur") bAt = e.t; else if (e.ev === "focus" && bAt !== null) { blurIv.push([bAt, e.t]); bAt = null; } }
    for (const b of bs) { const s0 = b.t0, e0 = b.t0 + (b.totalMs || 0); b.blurred = blurIv.some(([x, y]) => x < e0 && y > s0); }
    const fb = bs.slice(1).filter((b) => !b.blurred);
    perf.laterBattles.unblurredN = fb.length; perf.laterBattles.blurredN = bs.slice(1).length - fb.length;
    perf.laterBattles.firstMenuMsMedianFocused = med(fb.map((b) => b.firstMenuMs)); perf.laterBattles.firstMenuMsMaxFocused = fb.length ? Math.max(...fb.map((b) => b.firstMenuMs)) : null;
    perf.firstBattle.blurred = bs[0] ? bs[0].blurred : null;
    perf.focus = { blurEvents: focusLog.filter((e) => e.ev === "blur").length, framesSkippedUnfocused: skippedUnfocused };
    perf.battles = bs.length;
    perf.window = { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio, refocusCount: refocus };
    report.perf = perf;
    results.push({ id: "P1 perf run", status: perf.errors ? "fail" : "pass", ms: 0, error: perf.errors && perf.errors.join("; ") });
  }

  /**
   * Leak bisect: push/pop N copies of (a) a bare MenuBase scene with three windows and (b) the real battle scene,
   * with forced GC (launch with --js-flags=--expose-gc), to see which layer keeps memory.
   */
  async function runLeakBisect() {
    const N = Number(arg("ps-leak-n")) || 60;
    const out: any = { N, samples: [] as any[] };
    const mkBare = (Parent: any, windows: number, explicitDestroy = false) => {
      function Scene_X(this: any) { this.initialize(...(arguments as any)); }
      Scene_X.prototype = Object.create(Parent.prototype); Scene_X.prototype.constructor = Scene_X;
      Scene_X.prototype.create = function () {
        Parent.prototype.create.call(this);
        if (Parent === G.Scene_Base) this.createWindowLayer();
        for (let i = 0; i < windows; i++) this.addWindow(new G.Window_Base(new G.Rectangle(0, i * 100, 816, 90)));
      };
      if (explicitDestroy) {
        Scene_X.prototype.terminate = function () {
          Parent.prototype.terminate.call(this);
          for (const c of [...this._windowLayer.children]) { try { if (c.contents) c.contents.destroy(); if (c.contentsBack) c.contentsBack.destroy(); c.destroy({ children: true, texture: true }); } catch (e) { /* ignore */ } }
        };
      }
      Scene_X.prototype.update = function () { Parent.prototype.update.call(this); if (!this._t) this._t = 0; if (++this._t > 3) this.popScene(); };
      return Scene_X;
    };
    const Scene_Bare = mkBare(G.Scene_MenuBase, 3);
    async function loop(label: string, push: () => Promise<void>) {
      await toMap();
      out.samples.push({ phase: label, n: 0, ...mem(label + " start") });
      for (let i = 1; i <= N; i++) {
        await push();
        if (i % 20 === 0) out.samples.push({ phase: label, n: i, ...mem(label) });
      }
    }
    await loop("bare scene (3 windows, no engine)", async () => {
      G.SceneManager.push(Scene_Bare);
      await waitFor(() => scene() && scene().constructor === Scene_Bare || (scene() && scene()._t !== undefined), "bare scene");
      await waitFor(() => scene() && scene()._spriteset, "back on map");
      await frames(2);
    });
    W.PSFlow.fast = true; W.PSFlow.seed = [1, 2, 3, 4];
    const pushOf = (C: any) => async () => { G.SceneManager.push(C); await waitFor(() => scene() && scene()._t !== undefined, "variant scene"); await waitFor(() => scene() && scene()._spriteset, "back on map"); await frames(2); };
    await loop("Scene_Base + 3 windows (no MenuBase background)", pushOf(mkBare(G.Scene_Base, 3)));
    await loop("Scene_MenuBase + 0 windows", pushOf(mkBare(G.Scene_MenuBase, 0)));
    await loop("MenuBase + 3 windows + explicit contents destroy", pushOf(mkBare(G.Scene_MenuBase, 3, true)));
    await loop("real battle scene + session, then Run", async () => {
      await startEvent(1); await inMode("main"); await choose(/^Run/); await inMode("end"); await press("ok"); await dismissMessages();
    });
    report.leak = out;
    results.push({ id: "L1 leak bisect", status: "pass", ms: 0 });
  }

  /**
   * Leak hunt: walk the object graph from several roots, record the size of every array/Map/Set/object,
   * run N battles, walk again and report the collections that grew (with their paths).
   */
  async function runLeakHunt() {
    const N = Number(arg("ps-leak-n")) || 40;
    function walk(roots: Record<string, any>, maxNodes = 400000): Map<string, number> {
      const sizes = new Map<string, number>(); const seen = new WeakSet<object>(); let nodes = 0;
      const stack: [string, any, number][] = Object.entries(roots).map(([k, v]) => [k, v, 0]);
      while (stack.length && nodes < maxNodes) {
        const [path_, v, d] = stack.pop()!;
        if (!v || typeof v !== "object" || seen.has(v)) continue;
        seen.add(v); nodes++;
        let size = -1; let entries: [string, any][] = [];
        try {
          if (Array.isArray(v)) { size = v.length; if (d < 6) entries = v.slice(0, 200).map((x, i) => [String(i), x]); }
          else if (v instanceof Map) { size = v.size; if (d < 6) entries = [...v.entries()].slice(0, 200).map(([k, x]) => [String(k), x]); }
          else if (v instanceof Set) { size = v.size; if (d < 6) entries = [...v.values()].slice(0, 200).map((x, i) => [String(i), x]); }
          else if (d < 6 && !(v instanceof Node) && !(v instanceof Window)) { const ks = Object.keys(v); size = ks.length; entries = ks.slice(0, 300).map((k) => { let x: any; try { x = v[k]; } catch (e) { x = undefined; } return [k, x] as [string, any]; }); }
        } catch (e) { /* skip */ }
        if (size >= 0) sizes.set(path_.replace(/\.\d+(?=\.|$)/g, ".#"), (sizes.get(path_.replace(/\.\d+(?=\.|$)/g, ".#")) || 0) + size);
        for (const [k, x] of entries) stack.push([`${path_}.${k}`, x, d + 1]);
      }
      return sizes;
    }
    const roots = () => ({ app: G.Graphics.app, SceneManager: G.SceneManager, PIXI: G.PIXI, ImageManager: G.ImageManager, AudioManager: G.AudioManager, Reactor: G.ReactorEvents });
    await toMap(); W.PSFlow.fast = true; W.PSFlow.seed = [1, 2, 3, 4];
    const battle1 = async () => { await startEvent(1); await inMode("main"); await choose(/^Run/); await inMode("end"); await press("ok"); await dismissMessages(); };
    for (let i = 0; i < 5; i++) await battle1(); // warm up caches
    if (typeof G.gc === "function") { G.gc(); G.gc(); }
    const before = walk(roots());
    for (let i = 0; i < N; i++) await battle1();
    if (typeof G.gc === "function") { G.gc(); G.gc(); }
    await frames(120); // let Pixi's texture GC run
    if (typeof G.gc === "function") { G.gc(); G.gc(); }
    const after = walk(roots());
    const grew: any[] = [];
    for (const [k, v] of after) { const b = before.get(k) || 0; if (v - b >= Math.max(5, N / 4)) grew.push({ path: k, before: b, after: v, delta: v - b }); }
    grew.sort((a, b) => b.delta - a.delta);
    report.leakHunt = { N, nodesBefore: before.size, nodesAfter: after.size, grew: grew.slice(0, 60) };
    results.push({ id: "L2 leak hunt", status: "pass", ms: 0 });
  }

  /** Write a V8 heap snapshot after N battles (+forced GC) for offline retainer analysis. */
  async function runHeapSnapshot() {
    const N = Number(arg("ps-leak-n")) || 10;
    await toMap(); W.PSFlow.fast = true; W.PSFlow.seed = [1, 2, 3, 4];
    const battle1 = async () => { await startEvent(1); await inMode("main"); await choose(/^Run/); await inMode("end"); await press("ok"); await dismissMessages(); };
    for (let i = 0; i < N; i++) await battle1();
    await frames(120);
    if (typeof G.gc === "function") { G.gc(); G.gc(); }
    // NW's embedded Node cannot write heap snapshots (v8.getHeapSnapshot asserts): signal the outside instead.
    // The launching script attaches over the DevTools protocol (--remote-debugging-port), takes the snapshot, then
    // touches the "done" file; we wait for it so the process stays alive.
    const doneFile = arg("ps-heap-done");
    report.heapReady = true;
    if (OUT) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT + ".ready", "1"); }
    const t0w = Date.now();
    while (doneFile && !fs.existsSync(doneFile) && Date.now() - t0w < 300000) await sleep(200);
    results.push({ id: "H1 heap snapshot", status: "pass", ms: 0 });
  }

  /** Save written through the REAL default location logic (no --ps-save-dir): reports where it went. */
  async function runSaveLocation() {
    G.DataManager.setupNewGame(); W.PSFlow.resetGame();
    const dir = G.StorageManager.fileDirectoryPath();
    // Never touch a player's data: use the first FREE slot from 99 downwards, and put global.rmmzsave back as it was.
    let slot = 99;
    while (slot > 90 && fs.existsSync(path.join(dir, `file${slot}.rmmzsave`))) slot--;
    const file = path.join(dir, `file${slot}.rmmzsave`);
    const globalFile = path.join(dir, "global.rmmzsave");
    const occupied = fs.existsSync(file);
    const globalBefore = fs.existsSync(globalFile) ? fs.readFileSync(globalFile) : null;
    const startedAt = Date.now() - 2000; // file mtime granularity
    let code: any = null, error: string | null = null, written = false, cleanedUp = false;
    if (!occupied) {
      // MZ writes the global info AFTER the slot and does not wait for it (saveGlobalInfo inside saveGame's then): collect
      // every write this save starts and wait for all of them, or that late write lands after the restore below (found in
      // step 4: it left a stale slot entry in the player's global.rmmzsave).
      const so = G.StorageManager.saveObject; const writes: Promise<any>[] = [];
      G.StorageManager.saveObject = function (this: any, ...a: any[]) { const p = so.apply(this, a); writes.push(Promise.resolve(p)); return p; };
      try { code = await G.DataManager.saveGame(slot); await Promise.all(writes); } catch (e) { error = String(e); }
      finally { G.StorageManager.saveObject = so; }
      written = fs.existsSync(file) && fs.statSync(file).mtimeMs >= startedAt; // written by THIS run, not a leftover
      try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (e) { /* reported through cleanedUp */ }
      try { if (globalBefore) fs.writeFileSync(globalFile, globalBefore); else if (fs.existsSync(globalFile)) fs.unlinkSync(globalFile); } catch (e) { /* reported through cleanedUp */ }
      await sleep(1500); // a late write would show up here
      cleanedUp = !fs.existsSync(file) && (globalBefore ? fs.readFileSync(globalFile).equals(globalBefore) : !fs.existsSync(globalFile));
    }
    report.saveLocation = { chosen: G.PSSaveLocation, dir, slot, occupied, saveCode: code, writtenByThisRun: written, cleanedUp, error, gameDir };
    results.push({ id: "SL1 save location: a fresh slot is written by this run (saveGame code 0) and removed again", status: !occupied && code === 0 && written && cleanedUp ? "pass" : "fail", ms: 0 });
  }

  async function verifySave() {
    await scenario("V3 real restart (play-through): party, boxes, bag, growth, claims, money and the map position load identically in a fresh process, and play continues (an encounter, a commit, no duplicate id)", async () => {
      const expected = JSON.parse(fs.readFileSync(path.join(path.dirname(OUT || "."), "ps-flow-expected-t26.json"), "utf8"));
      G.DataManager.setupNewGame();
      await G.DataManager.loadGame(11);
      eq(game(), expected.state, "framework state (party, boxes, bag, growth, claims, money, ledger)");
      eq(mzParty(), expected.mz, "MZ gold/items as saved");
      eq([G.$gameMap.mapId(), G.$gamePlayer.x, G.$gamePlayer.y, G.$gamePlayer.direction(), G.$gameSystem._psBattleSeq], [expected.map.mapId, expected.map.x, expected.map.y, expected.map.d, expected.seq], "map position and battle counter");
      eq(W.PSFlow.claim("starter").status, "already-claimed", "the starter stays claimed");
      // continue playing from the loaded save
      W.PSFlow.rng = seeded(303); W.PSFlow.seed = [1, 2, 3, 4]; W.PSFlow.fast = true;
      await toMapId(expected.map.mapId, expected.map.x, expected.map.y);
      await stepInto(4, 9, 2); await waitFor(() => battle() && battle()._mode !== "boot", "battle after loading"); await inMode("main");
      for (let k = 0; k < 6 && mode_() !== "end"; k++) { await choose(/^Run/); await waitFor(() => ["main", "end"].includes(mode_()) && !battle()._busy && battle()._queue.length === 0, "after run"); }
      await finishBattle();
      eq([W.PSFlow.lastOutcome.code, W.PSFlow.lastOutcome.commit], [3, "applied"], "a battle after loading commits");
      eq(G.$gameSystem._psBattleSeq, expected.seq + 1, "the counter continues from the save");
      const ids = [...game().party, ...game().boxes].map((m: any) => m.id); eq(new Set(ids).size, ids.length, "no duplicate id");
      return { seq: G.$gameSystem._psBattleSeq, party: game().party.length, boxes: game().boxes.length };
    });
    await scenario("V2 real restart (slice): the new-game save loads identically in a fresh process, the claim stays claimed, MZ gold/items as saved", async () => {
      const expected = JSON.parse(fs.readFileSync(path.join(path.dirname(OUT || "."), "ps-flow-expected-t15.json"), "utf8"));
      G.DataManager.setupNewGame();
      await G.DataManager.loadGame(5);
      eq(game(), expected.state, "framework state after a fresh process loads the save");
      eq(mzParty(), expected.mz, "MZ party gold/items as saved");
      const again = W.PSFlow.claim("starter");
      eq(again.status, "already-claimed", "the claim survived the restart");
      eq(game(), expected.state, "nothing granted twice");
      return { party: game().party.map((m: any) => m.id), claims: Object.keys(game().claims) };
    });
    await scenario("V1 real restart: the save written by the previous process loads with identical state, duplicates stay no-ops", async () => {
      const expected = JSON.parse(fs.readFileSync(path.join(path.dirname(OUT || "."), "ps-flow-expected.json"), "utf8"));
      G.DataManager.setupNewGame();
      await G.DataManager.loadGame(1);
      eq(game(), expected, "state after a fresh process loads the save");
      const id = Object.keys(game().appliedBattles)[0];
      assert(!!id, "an applied battle is recorded");
      return { applied: Object.keys(game().appliedBattles), party: game().party.length };
    });
  }

  const startAt = G.Scene_Boot.prototype.start;
  G.Scene_Boot.prototype.start = function (this: any) {
    startAt.call(this);
    setTimeout(async () => {
      try { if (mode === "verify-save") await verifySave(); else if (mode === "matrix") await runMatrixMode(); else if (mode === "perf") await runPerf(); else if (mode === "leak") await runLeakBisect(); else if (mode === "leakhunt") await runLeakHunt(); else if (mode === "heap") await runHeapSnapshot(); else if (mode === "saveloc") await runSaveLocation(); else await runAll(); }
      catch (e: any) { results.push({ id: "driver", status: "fail", error: String(e && e.stack || e) }); }
      try { report.contentIdentity = W.PSFlow.content().meta; } catch (e) { report.contentIdentity = { error: String(e) }; }
      try { report.logTail = W.PSFlow.logger ? W.PSFlow.logger.tail(60) : null; } catch (e) { report.logTail = { error: String(e) }; } // redacted, bounded session diagnostics
      report.overall = results.every((r) => r.status === "pass") ? "pass" : "fail";
      if (OUT) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(report, null, 2)); }
      if (argv.includes("--ps-flow-quit")) G.nw.App.quit();
    }, 500);
  };
})();
