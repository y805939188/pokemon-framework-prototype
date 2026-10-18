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

  const nodeRequire = G.require as (id: string) => any;
  const fs = nodeRequire("fs");
  const path = nodeRequire("path");
  const E = nodeRequire("./js/engine/game/growth.cjs");
  const OUT = arg("ps-flow-out");
  const SHOTS = arg("ps-flow-shots");

  let frame = 0;
  const baseUpdate = G.SceneManager.update;
  G.SceneManager.update = function (...a: any[]) { frame++; return baseUpdate.apply(this, a); };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function frames(n: number) { const t = frame + n; while (frame < t) await sleep(4); }
  async function waitFor(cond: () => boolean, label: string, max = 2400) {
    const t = frame + max;
    while (!cond()) { if (frame > t) throw new Error(`timeout waiting for ${label} (mode=${scene() && scene()._mode})`); await sleep(4); }
  }
  const scene = (): any => G.SceneManager._scene;
  const battle = (): any => { const s = scene(); return s && s._psBattle ? s : null; };
  const KEY: Record<string, number> = { ok: 13, cancel: 27, down: 40, up: 38 };
  async function press(k: string, hold = 3) {
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
    await press("ok");
  }
  const mode_ = () => (battle() ? battle()._mode : "");
  async function inMode(m: string, label?: string) { await waitFor(() => battle() && battle()._mode === m && battle()._queue.length === 0 && !battle()._busy, `mode ${m} ${label || ""}`); }
  async function dismissMessages() {
    for (let i = 0; i < 40 && (G.$gameMessage.isBusy() || G.$gameMap._interpreter.isRunning()); i++) { if (G.$gameMessage.isBusy()) await press("ok"); else await frames(5); }
    await waitFor(() => !G.$gameMap._interpreter.isRunning() && !G.$gameMessage.isBusy(), "interpreter idle");
  }
  async function startEvent(id: number) {
    await waitFor(() => scene() && scene().constructor && scene()._spriteset && !G.SceneManager.isSceneChanging(), "map scene");
    G.$gameMap.event(id).start();
    await waitFor(() => battle() && battle()._mode !== "boot", "battle scene");
  }
  const game = (): any => W.PSFlow.game();
  const clone = (x: any) => JSON.parse(JSON.stringify(x));
  const results: any[] = [];
  const report: any = { mode, results, env: { nw: G.process && G.process.versions && G.process.versions.nw, node: G.process && G.process.versions && G.process.versions.node } };
  async function scenario(id: string, fn: () => Promise<any>) {
    const t0 = Date.now();
    try { const detail = await fn(); results.push({ id, status: "pass", ms: Date.now() - t0, detail }); }
    catch (e: any) {
      const b = battle();
      results.push({ id, status: "fail", ms: Date.now() - t0, error: String(e && e.message || e), diag: b ? { mode: b._mode, failure: String(b._failure), log: b._log._lines, status: b._status._lines, queue: b._queue.slice(0, 5) } : null });
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
    W.PSFlow.resetGame(); W.PSFlow.seed = [1, 2, 3, 4]; W.PSFlow.fast = true;
    G.$gamePlayer.reserveTransfer(4, 8, 8, 2, 0);
    G.SceneManager.goto(G.Scene_Map);
    await waitFor(() => scene() && scene()._spriteset && !G.SceneManager.isSceneChanging() && G.$gameMap.mapId() === 4, "Scene_Map on map 4");
    await frames(10);
  }
  const fresh = () => { W.PSFlow.resetGame(); };

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

    await scenario("T2 unavailable actions and cancel: nothing consumed, always back at a usable menu", async () => {
      fresh(); const before = clone(game());
      await startEvent(2); await inMode("main");
      await choose(/^Run/); await inMode("main");
      assert(battle()._log._lines.some((l: string) => /no running from a trainer/i.test(l)), "run refused with a reason in a trainer battle");
      await choose(/^Bag/); await inMode("bag");
      await choose(/Poké Ball/); await inMode("main");
      assert(battle()._log._lines.some((l: string) => /blocked|trainer|can't/i.test(l)), "ball refused in a trainer battle");
      assert(battle()._session.bag.pokeball === 5, "refused ball is not consumed");
      await choose(/^Fight/); await inMode("moves"); await press("cancel"); await inMode("main");
      await choose(/^Bag/); await inMode("bag"); await choose(/Potion/); await inMode("party"); await press("cancel"); await inMode("bag");
      await press("cancel"); await inMode("main");
      eq(battle()._session.bag, before.bag, "bag untouched after cancels/refusals");
      await choose(/^Pokémon/); await inMode("party");
      const items = battle()._menu._items;
      assert(items[0].enabled === false, "the active member cannot be switched to itself");
      await press("cancel"); await inMode("main");
      // finish the battle: two KOs
      for (let i = 0; i < 2; i++) { await choose(/^Fight/); await inMode("moves"); await choose(/flamethrower/i); await frames(5); await waitFor(() => mode_() === "main" || mode_() === "end" || mode_() === "learn", "after attack"); if (mode_() === "learn") { await choose(/Don't learn/); } await frames(5); if (mode_() === "end") break; await inMode("main"); }
      await inMode("end"); await press("ok"); await dismissMessages();
      eq(W.PSFlow.lastOutcome.commit, "applied", "finished and committed");
      eq(game().bag, before.bag, "bag unchanged after a battle that used nothing");
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
  }

  async function verifySave() {
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
      try { if (mode === "verify-save") await verifySave(); else await runAll(); }
      catch (e: any) { results.push({ id: "driver", status: "fail", error: String(e && e.stack || e) }); }
      report.overall = results.every((r) => r.status === "pass") ? "pass" : "fail";
      if (OUT) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(report, null, 2)); }
      if (argv.includes("--ps-flow-quit")) G.nw.App.quit();
    }, 500);
  };
})();
