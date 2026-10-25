/**
 * Step 2.4 test driver. Launch: nwjs <project> --ps-flow-test=all --ps-flow-out=<file> [--ps-flow-quit] [--ps-flow-shots=<dir>]
 * Drives the REAL scene with synthetic keyboard events (keydown/keyup on document), starts REAL map events
 * (Game_Event.start) and uses the real MZ save/load. Inert without the flag.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
// the step 4 (schema 3) save written by the step 4 code (step 5.0 checkpoint P-1), for T31
import STEP4_FULL from "../../experiments/step5/fixtures/step4-saves/full.json";
import { pressKey, waitGameFrames, waitUntil } from "./flowtest/timing.ts";
import { captureScreenshot, fileInside, screenshotFileName, type CapturePorts } from "./flowtest/evidence.ts";

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
  // verify-save reads the expected states written by the producing process from here (5.2 D-03); default: next to OUT
  const EXPECTED_DIR = arg("ps-flow-expected-dir");

  let frame = 0; // game updates (SceneManager.updateMain): the unit of every wait and key hold (5.2 D-01)
  let ticks = 0; // display ticks (SceneManager.update): frame-time sampling and diagnostics only
  const focusLog: any[] = [];
  // A test can start without ever gaining focus; absence of a blur event does not mean it was focused.
  focusLog.push({ ev: document.hasFocus() ? "focus" : "blur", initial: true, frame: 0, t: Math.round(performance.now()), hasFocus: document.hasFocus(), vis: document.visibilityState });
  for (const ev of ["blur", "focus"]) window.addEventListener(ev, () => focusLog.push({ ev, frame, t: Math.round(performance.now()), hasFocus: document.hasFocus(), vis: document.visibilityState }));
  document.addEventListener("visibilitychange", () => focusLog.push({ ev: "visibility", frame, vis: document.visibilityState }));
  const baseUpdate = G.SceneManager.update;
  const frameLog: Record<string, number[]> = { battle: [], map: [], other: [] };
  let lastFrameAt = 0;
  let sampling = false;
  let skippedUnfocused = 0;
  G.SceneManager.update = function (...a: any[]) {
    ticks++;
    if (sampling && !document.hasFocus()) { skippedUnfocused++; lastFrameAt = 0; }
    else if (sampling) {
      const now = performance.now();
      if (lastFrameAt) { const sc = G.SceneManager._scene; frameLog[sc && sc._psBattle ? "battle" : sc && sc._spriteset ? "map" : "other"].push(now - lastFrameAt); }
      lastFrameAt = now;
    }
    return baseUpdate.apply(this, a);
  };
  const baseUpdateMain = G.SceneManager.updateMain;
  G.SceneManager.updateMain = function (...a: any[]) { frame++; return baseUpdateMain.apply(this, a); };
  // Persist the original MZ exception before its fatal screen stops scene frames. Do not swallow it.
  for(const name of ['catchException','onError']){const original=G.SceneManager[name];if(typeof original==='function')G.SceneManager[name]=function(...args:any[]){if(OUT){try{fs.writeFileSync(OUT+'.fatal.json',JSON.stringify({at:Date.now(),frame,handler:name,errors:args.map(x=>({message:String(x?.message??x),stack:x?.stack})),scene:G.SceneManager._scene?.constructor?.name,flowOutcome:W.PSFlow?.lastOutcome},null,2));}catch{}}return original.apply(this,args);};}
  const t0Arg = arg("ps-t0");
  const t0 = t0Arg ? Number(t0Arg) : undefined; // epoch ms taken by the launching shell just before `open`
  const stamps: any = { pluginLoadedAt: Date.now(), pluginLoadedPerf: Math.round(performance.now()) };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const waits = { clock: { get game() { return frame; }, get ticks() { return ticks; } }, sleep, now: () => Date.now() };
  async function frames(n: number) { await waitGameFrames(waits, n); }
  async function waitFor(cond: () => boolean, label: string, max = 2400) {
    await waitUntil(waits, cond, () => `${label} (mode=${scene() && scene()._mode})`, max);
  }
  const scene = (): any => G.SceneManager._scene;
  const battle = (): any => { const s = scene(); return s && s._psBattle ? s : null; };
  const KEY: Record<string, number> = { ok: 13, cancel: 27, down: 40, up: 38, left:37, right:39, shift:16, control:17, pageup:33, pagedown:34 };
  /** A window that lost focus is throttled by Chromium and ignores input, which made scripted runs flaky
   *  (observed: blur at frame 94 for ~800 frames). Take focus back before every key press. */
  let refocus = 0;
  async function ensureFocus() {
    if (argv.includes("--ps-flow-background")) return; // programmatic test input does not require OS focus
    // No longer required (see the top of this file); kept as a cheap best effort that never blocks.
    if (document.hasFocus()) return;
    try { G.nw.Window.get().focus(); refocus++; } catch (e) { /* ignore */ }
  }
  const keyEvent = (type: string, k: string) => document.dispatchEvent(new KeyboardEvent(type, { keyCode: KEY[k], which: KEY[k], bubbles: true } as any));
  async function press(k: string, hold = 3) {
    await ensureFocus();
    await pressKey(waits, (type) => keyEvent(type, k), hold);
  }
  // Screenshots (5.2 D-02): the label stays the original id in report.shots; the file name is sanitized and unique
  // inside SHOTS. An evidence screenshot that fails throws (its scenario fails visibly); the failure-path screenshot
  // is best effort so the original failure is kept. No outcome of capturePage can leave the run waiting.
  const shotNames = new Set<string>(), shots: any[] = [];
  async function shot(label: string, opts: { bestEffort?: boolean; ports?: Partial<CapturePorts>; timeoutMs?: number } = {}): Promise<any> {
    if (!SHOTS) return { label, skipped: true };
    const entry: any = { label };
    shots.push(entry);
    try {
      fs.mkdirSync(SHOTS, { recursive: true });
      entry.file = screenshotFileName(label, shotNames);
      const ports: CapturePorts = { capture: (done) => G.nw.Window.get().capturePage(done, { format: "png", datatype: "buffer" }), write: (file, buffer) => fs.writeFileSync(file, buffer), setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (id) => clearTimeout(id as any), ...opts.ports };
      Object.assign(entry, await captureScreenshot(ports, fileInside(SHOTS, entry.file, path), opts.timeoutMs ?? 10000));
    } catch (e: any) { Object.assign(entry, { ok: false, error: String(e && e.message || e) }); }
    if (!entry.ok && !opts.bestEffort) throw new Error(`screenshot ${label}: ${entry.error}`);
    return entry;
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
    W.PSFlow.receiveOptions = { mode: 1, naming: 1 }; W.PSFlow.rng = seeded(seed);
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
  /** A member created from the content and stored the way the save stores it (content id + form, D5-3). */
  const mkMember = (id: string, species: string, level: number, extra: any = {}) => {
    const B = nodeRequire("./js/engine/build/engine.cjs");
    return { ...B.speciesKey.toPersistentMember(B.memberFactory.createMember({ id, species, level }, W.PSFlow.content(), seeded(level * 13 + id.length)), W.PSFlow.content()), ...extra };
  };
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
  /** Start a map event that opens no battle (5.2 D-04: U52-06 used the battle helper above and could only time out);
   *  the caller handles its messages and any UI it opens. */
  async function startMapEvent(id: number) {
    await waitFor(() => scene() && scene()._spriteset && !G.SceneManager.isSceneChanging(), "map scene");
    G.$gameMap.event(id).start();
    await frames(3);
  }
  const game = (): any => W.PSFlow.game();
  const api = (): any => nodeRequire("./js/engine/build/engine.cjs");
  const boxed = (g = game()): any[] => api().storage.boxedMembers(g);
  const setBoxed = (g: any, members: any[]): void => { g.storage = api().storage.newStorage(); members.forEach((m, i) => { if (i >= 1200) throw new Error("test setup exceeds fixed storage"); g.storage.boxes[Math.floor(i / 30)].slots[i % 30] = m; }); };
  const replayTemplates = (g: any, result: any): any => ({ templates: Object.fromEntries(result.captured.map((m: any) => { const found = api().storage.locateMember(g, m.id); if (!found) throw new Error(`missing original template ${m.id}`); return [m.id, clone(found.member)]; })), profile: { mode: 1, naming: 1 } });
  // bagOf is an unordered Record: keys sorted so eq's JSON comparison checks content, not pocket order (5.2 D-06); slot order is asserted where it matters
  const I6 = {rawBagOf:(game:any):any=>game.inventory?api().inventory.aggregateBag(game.inventory):game.bag,bagOf:(game:any):any=>{const bag=I6.rawBagOf(game);return bag&&Object.fromEntries(Object.keys(bag).sort().map(k=>[k,bag[k]]));},setBag:(game:any,bag:any):any=>{game.inventory=api().inventory.inventoryFromBag(bag,api().itemCatalog.catalogOf(W.PSFlow.content()));return bag;},setItemCount:(game:any,id:string,n:number):number=>{const bag=I6.rawBagOf(game);if(n===0)delete bag[id];else bag[id]=n;I6.setBag(game,bag);return n;}};
  const legacyDocument = (g: any, schema: number): any => { const member = (m: any): any => { const old = api().state.protocolMember(api().speciesKey.toBattleMember(m, W.PSFlow.content())); if (schema >= 4) old.form = m.form ?? 0; return old; }; return { schema, party: g.party.map(member), boxes: boxed(g).map(member), bag: clone(I6.rawBagOf(g)), money: g.money, dex: api().speciesKey.battleView(g, W.PSFlow.content()).dex, appliedBattles: clone(g.appliedBattles) }; };
  const clone = (x: any) => JSON.parse(JSON.stringify(x));
  const results: any[] = [];
  const gameDir = path.dirname(path.dirname(path.dirname(path.dirname(nodeRequire.resolve("./js/engine/game/session.cjs")))));
  let packageInfo: any = null;
  try { packageInfo = JSON.parse(fs.readFileSync(path.join(gameDir, "package-info.json"), "utf8")); } catch (e) { /* dev tree: no package-info */ }
  const pv = (G.process && G.process.versions) || {};
  const report: any = { mode, results, focusLog, suppressedAudio, shots, get refocus() { return refocus; }, get driverClock() { return { gameFrames: frame, displayTicks: ticks, ticksPerGameFrame: frame ? Math.round(ticks / frame * 1000) / 1000 : null }; }, env: { nw: pv.nw, node: pv.node, chromium: pv.chromium, v8: pv.v8, platform: G.process && G.process.platform, arch: G.process && G.process.arch, execPath: G.process && G.process.execPath, gameDir, packageInfo } };
  const writeProgress = () => { if (!OUT) return; try { fs.writeFileSync(OUT + '.progress.json', JSON.stringify({ at: Date.now(), results, shots, management: W.PSManagement?.current(), inventory: W.PSInventory?.current() }, null, 2)); } catch (e) { /* the final report still carries the results */ } };
  // driver-selftest only: screenshot ports for the failure path of the next failing scenario
  let failureShot: { ports?: Partial<CapturePorts>; timeoutMs?: number } = {};
  /** An expected state written by the producing process (5.2 D-03): read-only, from --ps-flow-expected-dir when the
   *  restart runs in its own evidence directory, else next to OUT; each file read is hashed into the report. */
  function readExpected(name: string): any {
    const dir = EXPECTED_DIR ?? path.dirname(OUT || "."), file = path.join(dir, name);
    const bytes = fs.readFileSync(file);
    report.expectedSource ??= { dir, explicit: EXPECTED_DIR !== undefined, files: {} };
    report.expectedSource.files[name] = nodeRequire("crypto").createHash("sha256").update(bytes).digest("hex");
    return JSON.parse(bytes.toString("utf8"));
  }
  async function scenario(id: string, fn: () => Promise<any>) {
    if (ONLY && !ONLY.split(",").some((p) => id===p||id.startsWith(p+" ")||id.startsWith(p+"/"))) return;
    const t0 = Date.now();
    try { const detail = await fn(); results.push({ id, status: "pass", ms: Date.now() - t0, detail }); }
    catch (e: any) {
      const b = battle();
      const itp = G.$gameMap && G.$gameMap._interpreter;
      const mapDiag = { scene: scene() && scene().constructor && scene().constructor.name, psRunning: W.PSFlow.running, waitMode: itp && itp._waitMode, interpreterRunning: itp && itp.isRunning(), messageBusy: G.$gameMessage && G.$gameMessage.isBusy(), messageText: G.$gameMessage && G.$gameMessage._texts, lastOutcome: W.PSFlow.lastOutcome, frame, ticks, hasFocus: document.hasFocus(), vis: document.visibilityState };
      const failure: any = { id, status: "fail", ms: Date.now() - t0, error: String(e && e.message || e), mapDiag, managementDiag: W.PSManagement?.current(), inventoryDiag: W.PSInventory?.current(), diag: b ? { mode: b._mode, failure: String(b._failure), log: b._log._lines, status: b._status._lines, queue: b._queue.slice(0, 5) } : null };
      results.push(failure);
      writeProgress(); // the failure is on disk before any screenshot is attempted
      failure.screenshot = await shot("fail-" + id.split(" ")[0], { bestEffort: true, ...failureShot });
      failureShot = {};
      try { await recover(); } catch (e2) { results.push({ id: id + " (recover)", status: "fail", error: String(e2) }); }
    }
    writeProgress();
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
  const fresh = () => { W.PSFlow.receiveOptions = { mode: 1, naming: 1 }; W.PSFlow.resetGame(); W.PSFlow._app=null; W.PSFlow.rng = seeded(1); }; // foes are created from the content: pin their random draws

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
      assert(I6.bagOf(battle()._session).pokeball === 4, "the blocked ball is spent (the run refusal consumed nothing)");
      await choose(/^Fight/); await inMode("moves"); await press("cancel"); await inMode("main");
      await choose(/^Bag/); await inMode("bag"); await choose(/Potion/); await inMode("party");
      const targets = battle()._menu._items;
      assert(targets.find((i: any) => /Blastoise/.test(i.name)).enabled === false, "a full-HP member is greyed out as a Potion target (refused before registration)");
      await press("cancel"); await inMode("bag");
      await press("cancel"); await inMode("main");
      eq(I6.bagOf(battle()._session), { ...I6.bagOf(before), pokeball: I6.bagOf(before).pokeball - 1 }, "bag untouched by the cancels; only the thrown ball is spent");
      await choose(/^Pokémon/); await inMode("party");
      const items = battle()._menu._items;
      assert(items[0].enabled === false, "the active member cannot be switched to itself");
      await press("cancel"); await inMode("main");
      // finish the battle: two KOs
      for (let i = 0; i < 2; i++) { await choose(/^Fight/); await inMode("moves"); await choose(/flamethrower/i); await frames(5); await waitFor(() => mode_() === "main" || mode_() === "end" || mode_() === "learn", "after attack"); if (mode_() === "learn") { await choose(/Don't learn/); } await frames(5); if (mode_() === "end") break; await inMode("main"); }
      await inMode("end"); await press("ok"); await dismissMessages();
      eq(W.PSFlow.lastOutcome.commit, "applied", "finished and committed");
      eq(I6.bagOf(game()), { ...I6.bagOf(before), pokeball: I6.bagOf(before).pokeball - 1 }, "committed bag: only the ball that the trainer blocked is spent");
    });

    await scenario("T3 wild run: faster user escapes, committed as 'ran', state unchanged apart from battle bookkeeping", async () => {
      fresh(); const before = clone(game());
      await startEvent(1); await inMode("main");
      await choose(/^Run/);
      await inMode("end"); await press("ok"); await dismissMessages();
      const o = W.PSFlow.lastOutcome; eq([o.code, o.kind], [3, "run"], "ran");
      eq(game().party.map((m: any) => [m.id, m.level, m.hp]), before.party.map((m: any) => [m.id, m.level, m.hp]), "party unchanged");
      eq(I6.bagOf(game()), I6.bagOf(before), "bag unchanged");
    });

    await scenario("T4 capture: Master Ball from the bag, captured member joins with its stable id", async () => {
      fresh();
      await startEvent(3); await inMode("main");
      await choose(/^Bag/); await inMode("bag"); await shot("05-bag");
      await choose(/Master Ball/);
      await inMode("end"); await press("ok"); await dismissMessages();
      const o = W.PSFlow.lastOutcome; eq([o.code, o.kind, o.commit], [2, "caught", "applied"], "caught");
      const g = game();
      assert(g.party.length === 4 && /^M[0-9a-z]{1,17}$/.test(g.party[3].id), "stable id of the caught member: " + (g.party[3] && g.party[3].id));
      assert(!I6.bagOf(g).masterball, "master ball consumed once");
      assert(g.dex.owned.includes("snorlax"), "dex updated (content id)");
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
      assert(I6.bagOf(g).potion === 2, "one potion consumed");
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
      eq(W.PSFlow.commit(lastResult, replayTemplates(game(), lastResult)), "already-applied", "re-committing the same result after restore is a no-op");
      eq(game(), snap, "state unchanged by the duplicate commit");
      fs.writeFileSync(path.join(path.dirname(OUT || "."), "ps-flow-expected.json"), JSON.stringify(snap));
      return { saveCode: rc, loadCode: lc };
    });

    await scenario("T9 legacy and unusable saves through MZ's own save/load: schema 1 migrates, newer or damaged states are refused and kept", async () => {
      fresh();
      // a step 2 document: no claims ledger, Showdown names, no form/statistics/steps (those came with schemas 3 and 4)
      const legacy = legacyDocument(game(), 1);
      for (const m of legacy.party) delete m.statusCount;
      legacy.party[1].status = "tox"; legacy.party[2].status = "slp";
      G.$gameSystem._psGame = legacy;
      const rc1 = await G.DataManager.saveGame(2);
      G.$gameSystem._psGame = { diverged: true };
      const lc1 = await G.DataManager.loadGame(2);
      assert(!G.$gameSystem._psSaveError, "a schema 1 state loads without error");
      eq([game().schema, game().party[1].status, game().party[1].statusCount, game().party[2].status, game().party[2].statusCount], [api().state.GAME_SCHEMA, "psn", 0, "slp", undefined], "migrated on load");
      eq(game().party.map((m: any) => [m.species, m.form]), [["charizard", 0], ["blastoise", 0], ["venusaur", 0]], "Showdown names mapped to content id + form through the content (D5-3)");
      eq([G.$gameSystem._psSaveInfo.from, G.$gameSystem._psSaveInfo.to, G.$gameSystem._psSaveInfo.migrated], [1, api().state.GAME_SCHEMA, true], "migration recorded");
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

    await scenario("T13 application construction or lazy Dex initialization fails: stale result cleared, state untouched, event continues", async () => {
      const rows = [];
      for (const failure of ["application", "dex"]) {
        fresh(); const before = clone(game());
        const Module = nodeRequire("module"), load = Module._load, limits = W.PSFlow.limits;
        W.PSFlow._app = null; W.PSFlow._dex = null;
        G.$gameVariables.setValue(10, 1); // the previous battle won
        let injected = 0;
        const message = `injected ${failure} initialization failure`;
        try {
          if (failure === "application") {
            // Configuration is evaluated while constructing the application, before _app is assigned.
            W.PSFlow.limits = () => { injected++; throw new Error(message); };
          } else {
            // The port is now lazy: the application exists before the first Showdown use can fail.
            Module._load = function (id: string, ...args: any[]) {
              if (/\/showdown\/dist\/sim$/.test(id)) { injected++; throw new Error(message); }
              return load.call(this, id, ...args);
            };
          }
          await startEvent(1); await inMode("end");
          eq([W.PSFlow.lastOutcome.code, W.PSFlow.lastOutcome.commit, W.PSFlow.lastOutcome.aborted, W.PSFlow.lastOutcome.projection], [0, "none", true, "ok"], "initialization failed, abort projection succeeded");
          if (failure === "application") assert(injected >= 2 && !W.PSFlow._app, "both begin and abort failed to construct the application; independent host projection still worked");
          else assert(injected >= 1 && W.PSFlow._app, "the application exists but lazy Dex use failed");
          assert(W.PSFlow.lastOutcome.error.includes(message), "the initialization error is retained");
          eq(W.PSFlow.lastOutcome.battleId, W.PSFlow.request.battleId, "aborted battle identity retained");
          eq(G.$gameVariables.value(10), 0, "stale win cleared");
          await press("ok"); await dismissMessages();
          eq(game(), before, "nothing committed");
          assert(!W.PSFlow.running && !G.$gameMap._interpreter.isRunning(), "interpreter released");
          rows.push({ failure, injected, outcome: clone(W.PSFlow.lastOutcome), resultVariable: G.$gameVariables.value(10) });
        } finally { Module._load = load; W.PSFlow.limits = limits; W.PSFlow._app = null; W.PSFlow._dex = null; }
      }
      return rows;
    });

    await scenario("T14 invalid result outcome: abort before capture commit; a corrected retry applies exactly once", async () => {
      fresh(); I6.setItemCount(game(), "masterball", 1); const before = clone(game());
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
        assert(!I6.bagOf(after).masterball, "one ball consumed");
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
        eq([g0.schema, g0.party.length, boxed(g0).length, I6.bagOf(g0), g0.money, g0.claims, g0.appliedBattles, g0.steps], [api().state.GAME_SCHEMA, 0, 0, {}, 3000, {}, {}, 0], "a new game is the formal empty state");
        assert(!JSON.stringify(g0).includes("A-000"), "no fixture member in a new game");
        const mz0 = mzParty();
        eq([G.$dataSystem.startMapId, G.$dataSystem.startX, G.$dataSystem.startY], [5, 8, 9], "the project starts on the slice map");
        await toMapId(5, 8, 9);
        G.$gameVariables.setValue(11, -1);
        await runEvent(1);
        eq([W.PSFlow.lastClaim.status, G.$gameVariables.value(11)], ["applied", 1], "starter granted, the event sees 1");
        const g1 = clone(game());
        eq(g1.party.map((m: any) => [m.id, m.species, m.form, m.level, m.moves.map((x: any) => x.id)]), [["M1", "charmander", 0, 5, ["scratch", "growl", "ember"]]], "the starter comes from the content (stored by content id + form)");
        eq([I6.bagOf(g1), g1.claims, g1.money], [{ antidote: 2, pokeball: 10, potion: 5 }, { starter: { kind: "grant" } }, 3000], "items and the claim");
        eq(g1.dex, { seen: ["charmander"], owned: ["charmander"] }, "the received species is seen and owned");
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
      eq(info && info.created, "empty", "reported as created on load");
      eq(game(), nodeRequire("./js/engine/build/engine.cjs").state.newGame({ party: [], money: 0 }), "the whole formal empty state: no members, boxes, items, money, dex entries, battles or claims");
      assert(!G.$gameSystem._psSaveError, "not an error");
      eq(W.PSFlow.claim("starter").status, "applied", "the player can still receive the starter");
      eq([game().party.map((m: any) => m.id), game().claims, game().dex.owned], [["M1"], { starter: { kind: "grant" } }, ["charmander"]], "received into the empty state");
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
      // inside the region while an event runs: nothing. The event only waits (no message): with a message open the map
      // scene does not check encounters at all, which would hide whether the plugin's own event check works
      G.$gamePlayer.locate(4, 9); await frames(2);
      W.PSFlow.lastEncounter = null;
      G.$gameMap._interpreter.setup([{ code: 230, indent: 0, parameters: [120] }, { code: 0, indent: 0, parameters: [] }], 0);
      await frames(2);
      assert(G.$gameMap.isEventRunning() && !G.$gameMessage.isBusy() && scene().isSceneChangeOk(), "an event runs, no message is open, the map scene checks encounters");
      G.$gamePlayer._encounterCount = 0; await frames(40);
      eq([!!battle(), W.PSFlow.lastEncounter], [false, null], "no encounter while an event runs");
      G.$gamePlayer._encounterCount = 50; await waitFor(() => !G.$gameMap.isEventRunning(), "the waiting event ends");
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
      const expectedId=api().memberIdentity.allocateMemberId(game().nextMemberOrdinal,new Set([...game().party,...boxed()].map((m:any)=>m.id))).id;
      assert(foe.id===expectedId&&/^M[0-9a-z]{1,17}$/.test(foe.id)&&foe.moves.length>0&&foe.ivs&&foe.personalID!==undefined,"the foe was created from content with the next stable individual ID");
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
      const live = battle()._session.gw.readState("p1").find((x: any) => x.id === "M1");
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
      g.party[0].hp = 5; I6.setItemCount(g, "pokeball", 30);
      const ids: string[] = [];
      for (let round = 0; round < 2; round++) {
        await stepInto(4, 9, 2); await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
        if (round === 0) {
          await choose(/^Bag/); await inMode("bag"); await choose(/Potion/); await inMode("party"); await choose(/Charmander/); await inMode("main");
          assert(battle()._log._lines.some((l: string) => /Recovered/.test(l)), "the Potion healed");
        }
        for (let i = 0; i < 25 && mode_() !== "end"; i++) { if (mode_() === "party-forced") { await choose(/Caterpie/); await waitFor(() => ["main", "end"].includes(mode_()) && !battle()._busy, "after the switch"); continue; } await choose(/^Bag/); await inMode("bag"); await choose(/Poké Ball/); await waitFor(() => ["main", "end", "party-forced"].includes(mode_()) && battle()._queue.length === 0 && !battle()._busy, "after the throw"); }
        await inMode("end");
        assert(!battle()._log._lines.some((l:string)=>/was sent to the boxes/.test(l)),"no destination is announced before commit");
        await press("ok");await waitFor(()=>!W.PSFlow.running&&!battle(),"automatic reception committed");const notice=W.PSFlow.lastReceivingNotice;assert(notice&&notice.placements.some((p:any)=>p.to==="boxes")&&notice.messages.some((line:string)=>G.$gameMessage._texts.includes(line)),"actual destination is shown after commit");await dismissMessages(); await waitFor(() => !W.PSFlow.running && !battle(), "back"); await frames(5);
        eq([W.PSFlow.lastOutcome.code, W.PSFlow.lastOutcome.commit], [2, "applied"], "caught");
        ids.push(boxed()[boxed().length - 1].id);
      }
      eq([game().party.length, boxed().length], [6, 2], "party unchanged, two in the boxes");
      assert(ids[0] !== ids[1] && ids.every((id) => /^M[0-9a-z]{1,17}$/.test(id)), "distinct stable ids: " + ids.join(","));
      eq(I6.bagOf(game()).potion, 4, "one potion used");
      return { ids, balls: I6.bagOf(game()).pokeball };
    });

    await scenario("T19 party and boxes full: the ball is refused with the reason before anything is spent", async () => {
      await slice(19);
      const g = game();
      for (let i = 2; i <= 6; i++) g.party.push(mkMember(`P-${i}`, "Caterpie", 3));
      api().storage.placeInBox(g.storage, mkMember("B-1", "Pidgey", 3));
      W.PSFlow.testLimits = { party: 6, boxes: 1, bagPerItem: 999, money: 999999 }; W.PSFlow._app = null;
      const before = clone(game());
      await stepInto(4, 9, 2); await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
      await choose(/^Bag/); await inMode("bag"); await choose(/Poké Ball/); await inMode("main");
      assert(battle()._log._lines.some((l: string) => /party and boxes are full/.test(l)), "the reason is shown");
      eq(I6.bagOf(battle()._session).pokeball, I6.bagOf(before).pokeball, "nothing spent");
      await choose(/^Run/); await finishBattle();
      eq([game().party.length, boxed().length, I6.bagOf(game()).pokeball], [6, 1, I6.bagOf(before).pokeball], "nothing stored or spent");
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
      const shown: string[] = []; const add = G.$gameMessage.add;
      G.$gameMessage.add = function (this: any, t: string) { shown.push(String(t)); return add.call(this, t); };
      try {
        await startEvent(1); await inMode("main");
        await choose(/^Fight/); await inMode("moves"); await choose(/tackle/i);
        await inMode("end"); await press("ok");
        await dismissMessages();
        await waitFor(() => G.$gameMap.mapId() === 5 && !G.SceneManager.isSceneChanging(), "taken home");
      } finally { G.$gameMessage.add = add; }
      eq([W.PSFlow.lastOutcome.code, W.PSFlow.lastOutcome.blackout, game().money], [4, true, 484], "defeat settled and blacked out");
      assert(shown.length > 0 && !shown.some((t) => /Back on the map/.test(t)), "the event's next command (its message) did not run: " + shown.join(" | "));
      assert(!G.$gameMap._interpreter.isRunning(), "nothing left running");
      eq(G.$gameSystem.isSaveEnabled(), false, "saving stays disabled because the event had disabled it");
      G.$gameSystem.enableSave();
      await recover();
    });

    const cmd = (code: number, parameters: any[] = []) => ({ code, indent: 0, parameters });
    const startCmd = (canLose: boolean, resultVariable = 0) => cmd(357, ["PS_BattleFlow", "StartBattle", "Start battle", { kind: "wild", foes: "Pidgey:30", battleId: "chain", resultVariable: String(resultVariable), canLose: String(canLose) }]);
    const setVar = (v: number, n: number) => cmd(122, [v, v, 0, 0, n]);
    /** On the slice map (also the home map): a level 2 Snorlax at 1 HP and 1000 money, standing away from home. */
    async function loserOnSlice(seed: number) {
      await slice(seed); const g = game(); g.party = [mkMember("S-1", "Snorlax", 2, { hp: 1 })]; g.money = 1000;
      G.$gamePlayer.locate(12, 6); G.$gamePlayer._encounterCount = 999; await frames(2);
      for (const v of [16, 17, 18, 19, 20]) { assert(v < G.$dataSystem.variables.length, `variable ${v} exists`); G.$gameVariables.setValue(v, 0); }
    }
    async function loseRunningEvent(list: any[]) {
      G.$gameMap._interpreter.setup(list, 0);
      await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
      await fightUntilEnd(/tackle/i); await inMode("end"); await press("ok");
      await dismissMessages(); await frames(30);
    }

    await scenario("T27 a lost battle with canLose off ends its whole calling chain (directly, in a common event, in a common event called by one; home is the same map); with canLose on the caller continues", async () => {
      const out: any = {};
      for (const [label, shape, canLose] of [["direct", 0, false], ["one common event", 1, false], ["two common events", 2, false], ["canLose on", 1, true]] as const) {
        await loserOnSlice(27);
        G.$dataCommonEvents[98] = { id: 98, name: "probe inner", trigger: 0, switchId: 1, list: [startCmd(canLose), setVar(18, 555), cmd(0)] };
        G.$dataCommonEvents[99] = { id: 99, name: "probe outer", trigger: 0, switchId: 1, list: [cmd(117, [98]), setVar(19, 666), cmd(0)] };
        try { await loseRunningEvent(shape === 0 ? [startCmd(canLose), setVar(20, 777), cmd(0)] : [cmd(117, [shape === 1 ? 98 : 99]), setVar(20, 777), cmd(0)]); }
        finally { delete G.$dataCommonEvents[98]; delete G.$dataCommonEvents[99]; }
        const o = W.PSFlow.lastOutcome;
        out[label] = { after: [18, 19, 20].map((v) => G.$gameVariables.value(v)), code: o.code, blackout: !!o.blackout, at: [G.$gameMap.mapId(), G.$gamePlayer.x, G.$gamePlayer.y], money: game().money, running: G.$gameMap._interpreter.isRunning() };
      }
      for (const label of ["direct", "one common event", "two common events"]) eq(out[label], { after: [0, 0, 0], code: 4, blackout: true, at: [5, 8, 9], money: 984, running: false }, `${label}: home on the same map, settled once, no command after the battle ran`);
      eq(out["canLose on"], { after: [555, 0, 777], code: 4, blackout: false, at: [5, 12, 6], money: 984, running: false }, "canLose on: settled, no trip, the calling event goes on");
      return out;
    });

    await scenario("T28 a message or translation failure after a committed defeat keeps the committed outcome (code 4, applied, blackout), the trip home and the end of the event; nothing is settled twice; a failed trip stays retryable", async () => {
      const out: any = {};
      for (const kind of ["message", "translation", "message and trip"]) {
        await loserOnSlice(28);
        const add = G.$gameMessage.add, tr = W.PSFlow.translator; let failed = false;
        if (kind !== "translation") G.$gameMessage.add = function (this: any, t: string) { if (!failed) { failed = true; throw new Error("injected: message window failure"); } return add.call(this, t); };
        if (kind === "message and trip") W.PSFlow.debug.failReturn = true;
        try {
          G.$gameMap._interpreter.setup([startCmd(false, 16), setVar(20, 777), cmd(0)], 0);
          await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
          await fightUntilEnd(/tackle/i); await inMode("end");
          if (kind === "translation") W.PSFlow.translator = () => { throw new Error("injected: translation failure"); };
          await press("ok"); await frames(5);
        } finally { G.$gameMessage.add = add; W.PSFlow.translator = tr; W.PSFlow.debug.failReturn = false; }
        await dismissMessages(); await frames(30);
        const o = W.PSFlow.lastOutcome;
        eq([o.code, o.commit, o.blackout, o.defeat], [4, "applied", true, { moneyLost: 16, healed: true }], `${kind}: the committed outcome stands`);
        eq((o.hostErrors || []).map((e: any) => e.step), ["message"], `${kind}: recorded as a host error after the commit`);
        eq([G.$gameVariables.value(16), G.$gameVariables.value(20), game().money, Object.keys(game().appliedBattles).length], [4, 0, 984, 1], `${kind}: result variable 4, the event ended, settled once`);
        assert(game().party[0].hp > 1 && !W.PSFlow.running && !G.$gameMap._interpreter.isRunning(), `${kind}: healed, nothing running`);
        eq(W.PSFlow.commit(W.PSFlow.lastResult), "already-applied", `${kind}: a repeat commit is a no-op`);
        if (kind === "message and trip") {
          eq([W.PSFlow.lastReturn.status, G.$gamePlayer.x, G.$gamePlayer.y], ["failed", 12, 6], "the trip failed and was kept");
          const settled = clone(game());
          eq(W.PSFlow.retryReturnHome().status, "requested", "retry requested");
          await waitFor(() => G.$gamePlayer.x === 8 && G.$gamePlayer.y === 9 && !G.SceneManager.isSceneChanging(), "home after the retry");
          eq(game(), settled, "the retry changed nothing in the state");
        } else eq([W.PSFlow.lastReturn.status, G.$gameMap.mapId(), G.$gamePlayer.x, G.$gamePlayer.y], ["requested", 5, 8, 9], `${kind}: taken home`);
        out[kind] = { hostErrors: o.hostErrors, money: game().money };
      }
      return out;
    });

    await scenario("T29 the battle only masks saving while it runs: a reason another system adds (disable) or removes (enable) during the battle stays in force afterwards, after a normal end and after an abort", async () => {
      const out: any = {};
      for (const [label, before, during, end] of [["allowed, disabled meanwhile, ran away", true, "disable", "finish"], ["disabled, enabled meanwhile, aborted", false, "enable", "abort"]] as const) {
        await slice(29); game().party = [mkMember("R-1", "Charmander", 40)];
        if (before) G.$gameSystem.enableSave(); else G.$gameSystem.disableSave();
        G.$gameMap._interpreter.setup([cmd(357, ["PS_BattleFlow", "StartBattle", "Start battle", { kind: "wild", foes: "Pidgey:3", battleId: "save", resultVariable: "0", canLose: "false" }]), cmd(0)], 0);
        await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
        if (during === "disable") G.$gameSystem.disableSave(); else G.$gameSystem.enableSave(); // another system, meanwhile
        const inBattle = [G.$gameSystem.isSaveEnabled(), G.Window_MenuCommand.prototype.isSaveEnabled.call({}), G.Scene_Base.prototype.isAutosaveEnabled.call(battle())];
        if (end === "finish") { await choose(/^Run/); await finishBattle(); }
        else { W.PSFlow.debug.failNext = "move"; await choose(/^Fight/); await inMode("moves"); await choose(/flamethrower|ember|scratch/i); await inMode("end"); assert(battle()._aborted, "aborted"); await press("ok"); await dismissMessages(); }
        out[label] = { inBattle, after: G.$gameSystem.isSaveEnabled(), code: W.PSFlow.lastOutcome.code };
        eq(inBattle, [false, false, false], `${label}: no menu save, no autosave while the battle runs`);
        eq(G.$gameSystem.isSaveEnabled(), during === "enable", `${label}: afterwards the game's flag as last set decides`);
        G.$gameSystem.enableSave();
      }
      return out;
    });

    await scenario("T30 a battle id that is also \"__proto__\" is an ordinary ledger entry through MZ's own save and load: applied once, a repeat before and after the load spends nothing", async () => {
      await slice(30); I6.setItemCount(game(), "potion", 2);
      const r = { protocol: 1, battleId: "__proto__", outcome: { kind: "run", winner: null }, members: {}, bag: { potion: -1 }, captured: [], dex: { seen: [], owned: [] } };
      eq([W.PSFlow.commit(r), W.PSFlow.commit(r), I6.bagOf(game()).potion], ["applied", "already-applied", 1], "applied once");
      assert(Object.hasOwn(game().appliedBattles, "__proto__"), "an own ledger entry");
      await G.DataManager.saveGame(12);
      I6.setItemCount(game(), "potion", 7); // diverge, so the load is visible
      await G.DataManager.loadGame(12);
      assert(!G.$gameSystem._psSaveError && Object.hasOwn(game().appliedBattles, "__proto__"), "the entry came back from the MZ save");
      eq([W.PSFlow.commit(r), I6.bagOf(game()).potion], ["already-applied", 1], "after the load the repeat spends nothing");
      await toMapId(5, 8, 9);
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
      api().storage.placeInBox(game().storage, mkMember("B-1", "Pidgey", 3));
      const before = clone(game());
      G.$gameMap.event(3).start(); await frames(3);
      for (let i = 0; i < 20 && !(scene() && scene()._psParty); i++) { if (G.$gameMessage.isBusy()) await press("ok"); else await frames(5); }
      await waitFor(() => scene() && scene()._psParty, "party screen from the sign");
      await uiReady("party");
      const lines = management().text.join("\n");
      assert(/Charmander/.test(lines) && /Lv.5/.test(lines) && /Box 1/.test(lines) && /Potion ×5/.test(lines) && /Money: 3000/.test(lines), "the screen shows the state: " + lines);
      await press("cancel"); await waitFor(() => scene() && scene()._spriteset, "back on the map"); await dismissMessages();
      G.SceneManager.push(G.Scene_Menu); await waitFor(() => scene() && scene()._commandWindow, "main menu");
      const cw = scene()._commandWindow;
      assert(cw._list.some((c: any) => c.symbol === "psParty"), "the menu has the Party entry");
      cw.selectSymbol("psParty"); cw.processOk();
      await uiReady("party");
      await press("cancel"); await waitFor(() => scene() && scene()._commandWindow, "back in the menu");
      await press("cancel"); await waitFor(() => scene() && scene()._spriteset, "back on the map");
      eq(game(), before, "read only");
      return { lines: lines.split("\n").length };
    });

    await scenario("T25 the battle counter is saved with the state: after loading an older save the next catch can reuse a discarded id, but no id is ever duplicated within one save timeline", async () => {
      await slice(25);
      const g = game(); for (let i = 2; i <= 6; i++) g.party.push(mkMember(`P-${i}`, "Caterpie", 3)); I6.setItemCount(g, "masterball", 5);
      const catchOne = async () => {
        await stepInto(4, 9, 2); await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
        await choose(/^Bag/); await inMode("bag"); await choose(/Master Ball/); await finishBattle();
        eq(W.PSFlow.lastOutcome.code, 2, "caught"); return boxed()[boxed().length - 1].id;
      };
      const a = await catchOne();
      await G.DataManager.saveGame(10); const seqSaved = G.$gameSystem._psBattleSeq;
      const b = await catchOne();
      await G.DataManager.loadGame(10);
      eq([G.$gameSystem._psBattleSeq, boxed().map((m: any) => m.id)], [seqSaved, [a]], "counter and state rolled back together");
      await toMapId(5, 8, 9);
      const c = await catchOne();
      const ids = [...game().party, ...boxed()].map((m: any) => m.id);
      eq(new Set(ids).size, ids.length, "no duplicate id in this timeline: " + ids.join(","));
      eq(c, b, "the discarded timeline's id is reused, which is safe (it exists in no loaded state)");
      return { a, b, c, seqSaved };
    });

    await scenario("T26 play-through for the restart check: new game, starter, a won encounter (growth), a catch into the party, a full party (test setup) and a catch into the boxes, the nurse, a walk; saved", async () => {
      await slice(26);
      const m0 = game().party[0]; m0.exp = E.minExp("parabolic", 8) - 1; // test setup: one fight away from level 8
      I6.setItemCount(game(), "masterball", 2); // test setup: certain catches
      await stepInto(4, 9, 2); await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
      await fightUntilEnd(/^Ember|^ember/i); await finishBattle();
      eq(W.PSFlow.lastOutcome.code, 1, "won"); eq(game().party[0].level, 8, "grew");
      await stepInto(4, 9, 8); await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
      await choose(/^Bag/); await inMode("bag"); await choose(/Master Ball/); await finishBattle();
      eq([W.PSFlow.lastOutcome.code, game().party.length], [2, 2], "caught into the party");
      for (let i = 3; i <= 6; i++) game().party.push(mkMember(`P-${i}`, "Caterpie", 3)); // test setup: a full party
      await stepInto(4, 9, 2); await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
      await choose(/^Bag/); await inMode("bag"); await choose(/Master Ball/); await finishBattle();
      eq([W.PSFlow.lastOutcome.code, game().party.length, boxed().length], [2, 6, 1], "caught into the boxes");
      game().party[0].hp = 3; game().party[0].moves[2].pp = 1; // hurt before the nurse
      await toMapId(5, 10, 5); await runEvent(2); eq(W.PSFlow.lastHeal.status, "healed", "nurse");
      G.$gamePlayer.locate(12, 6); G.$gamePlayer.setDirection(4); await frames(5);
      const rc = await G.DataManager.saveGame(11);
      const expected = { state: clone(game()), mz: mzParty(), map: { mapId: G.$gameMap.mapId(), x: G.$gamePlayer.x, y: G.$gamePlayer.y, d: G.$gamePlayer.direction() }, seq: G.$gameSystem._psBattleSeq };
      fs.writeFileSync(path.join(path.dirname(OUT || "."), "ps-flow-expected-t26.json"), JSON.stringify(expected));
      return { saveCode: rc, party: expected.state.party.map((m: any) => [m.id, m.level]), boxes: boxed(expected.state).map((m: any) => m.id), seq: expected.seq };
    });

    await scenario("T31 a save written by the step 4 code (schema 3, P-1 sample) through MZ's own save/load: migrated to schema 6 field by field with the content mapping and saved again; an unmappable one is refused and kept", async () => {
      const sample = clone(STEP4_FULL); // bundled into this test plugin: the package has no experiments/ folder
      const B = nodeRequire("./js/engine/build/engine.cjs");
      await slice(31);
      G.$gameSystem._psGame = clone(sample); // the framework part of a step 4 save, inside an MZ save written by this build
      await G.DataManager.saveGame(13);
      G.$gameSystem._psGame = { diverged: true };
      await G.DataManager.loadGame(13);
      assert(!G.$gameSystem._psSaveError, "loads: " + JSON.stringify(G.$gameSystem._psSaveError));
      eq([G.$gameSystem._psSaveInfo.from, G.$gameSystem._psSaveInfo.to, G.$gameSystem._psSaveInfo.migrated], [3, api().state.GAME_SCHEMA, true], "migrated from schema 3");
      const g = clone(game());
      const keyOf = (n: string) => B.speciesKey.keyOfBattleName(W.PSFlow.content(), n);
      eq(g.party.map((m: any) => [m.id, m.species, m.form]), sample.party.map((m: any) => [m.id, keyOf(m.species).species, 0]), "party by content id + form");
      eq(boxed(g).map((m: any) => [m.id, m.species]), sample.boxes.map((m: any) => [m.id, keyOf(m.species).species]), "boxes too");
      eq([g.claims, g.appliedBattles, I6.bagOf(g), g.money, g.dex.owned], [sample.claims, sample.appliedBattles, I6.bagOf(sample), sample.money, sample.dex.owned.map((n: string) => keyOf(n).species)], "claims, ledger, bag (5000 above the cap), money kept; dex mapped");
      eq(B.saveSchema.validateGame(g), [], "a valid schema 6 state");
      eq(W.PSFlow.claim("starter").status, "already-claimed", "the claim survived");
      await G.DataManager.saveGame(14);
      fs.writeFileSync(path.join(path.dirname(OUT || "."), "ps-flow-expected-t31.json"), JSON.stringify({ state: g }));
      // the same step 4 save naming a species the content does not have: refused as a whole, kept as it was
      const bad = clone(sample); bad.boxes[0].species = "Mew";
      G.$gameSystem._psGame = clone(bad);
      await G.DataManager.saveGame(15);
      G.$gameSystem._psGame = { diverged: true };
      await G.DataManager.loadGame(15);
      eq(G.$gameSystem._psSaveError && G.$gameSystem._psSaveError.code, "unmapped-species", "refused with the reason");
      eq(G.$gameSystem._psSaveError.problems.map((p: any) => p.path), ["$.boxes[0].species"], "the place is named");
      eq(G.$gameSystem._psGame, bad, "the original framework state is kept exactly");
      // while that state is unusable no save is written at all (review F01): not to this slot, not to another one
      const file15 = path.join(G.StorageManager.fileDirectoryPath(), "file15.rmmzsave");
      const bytes15 = fs.readFileSync(file15);
      const so = G.StorageManager.saveObject; let writes = 0;
      G.StorageManager.saveObject = (...a: any[]) => { writes++; return so.apply(G.StorageManager, a); };
      const refusal: any[] = [];
      try {
        for (const slot of [15, 18]) { let e: any = null; await G.DataManager.saveGame(slot).catch((x: any) => { e = x; }); refusal.push([slot, String(e && e.message), W.PSState.lastSaveError && W.PSState.lastSaveError.code, W.PSState.lastSaveError && W.PSState.lastSaveError.savefileId]); }
      } finally { G.StorageManager.saveObject = so; }
      assert(refusal.every(([slot, m, code, id]) => code === "state-unusable" && id === slot && new RegExp(`slot ${slot} is refused.*unmapped-species`).test(m)), "every save is refused with the slot and the reason: " + JSON.stringify(refusal));
      eq(writes, 0, "MZ wrote nothing");
      assert(fs.readFileSync(file15).equals(bytes15), "the save file the state came from is byte for byte unchanged");
      assert(!fs.existsSync(path.join(G.StorageManager.fileDirectoryPath(), "file18.rmmzsave")), "no other slot was written");
      eq(G.$gameSystem.isSaveEnabled(), false, "the save menu is masked while the state is unusable");
      fresh();
      eq(G.$gameSystem.isSaveEnabled(), true, "an explicit reset clears the error, saving is possible again");
      return { party: g.party.length, boxes: boxed(g).length, battles: Object.keys(g.appliedBattles).length };
    });

    await scenario("T32 the step counter (WP06 §4.1): steps on the map count, MZ's own step count still runs, and the counter is saved with the state", async () => {
      await slice(32);
      const before = game().steps, mzBefore = G.$gameParty.steps();
      for (const dir of [6, 4, 6, 4]) { G.$gamePlayer._encounterCount = 99; G.$gamePlayer.moveStraight(dir); await waitFor(() => !G.$gamePlayer.isMoving(), "step"); await frames(2); }
      eq([game().steps - before, G.$gameParty.steps() - mzBefore], [4, 4], "four steps counted by both");
      const steps = game().steps;
      await G.DataManager.saveGame(16); game().steps = 0; await G.DataManager.loadGame(16);
      eq(game().steps, steps, "saved and loaded with the state");
      return { steps };
    });

    await scenario("T33 a save is loaded while an event battle is open (P4-2, review F02): the host operation ends (not running, saving allowed), the old scene's late end changes nothing, and the next battle runs and commits normally", async () => {
      await toMap(); fresh();
      await G.DataManager.saveGame(19); // a good save to load in the middle of the battle
      const loaded = clone(game());
      await startEvent(1); await inMode("main"); // the wild battle event of this map, its scene open and waiting for input
      assert(W.PSFlow.running && !G.$gameSystem.isSaveEnabled(), "the battle runs and masks saving");
      await G.DataManager.loadGame(19); // a load installs another state while the battle scene is still the current scene
      eq([W.PSFlow.running, G.$gameSystem.isSaveEnabled(), W.PSFlow.lastOutcome && W.PSFlow.lastOutcome.replaced], [false, true, true], "the host operation ended with the old state");
      eq(game(), loaded, "the loaded state is installed untouched");
      G.SceneManager.goto(G.Scene_Map); // as the load screen does: the old battle scene ends now
      await waitFor(() => scene() && scene()._spriteset && !battle() && !G.SceneManager.isSceneChanging(), "back on the map");
      await frames(10);
      eq(game(), loaded, "the old scene's end committed nothing");
      // the next battle: opens, runs and commits as usual; nothing of the old one reaches it
      W.PSFlow.lastStale = null;
      await startEvent(1); await inMode("main");
      await choose(/^Run/);
      await inMode("end"); await press("ok"); await dismissMessages();
      eq([W.PSFlow.lastOutcome.code, W.PSFlow.lastOutcome.commit, W.PSFlow.running], [3, "applied", false], "the next battle commits");
      eq(W.PSFlow.lastStale, null, "no late call of the old battle reached it");
      return { battles: Object.keys(game().appliedBattles).length };
    });

    await scenario("T34 R01 old decided session: default/mismatched finish cannot unlock a new battle or write a save (same and different ids)", async () => {
      const rows = [];
      for (const sameId of [true, false]) {
        await toMap(); fresh(); await G.DataManager.saveGame(20);
        await startEvent(1); await inMode("main"); await choose(/^Run/); await inMode("end");
        const old = { session: battle()._session, op: W.PSFlow._op };
        await G.DataManager.loadGame(20);
        G.SceneManager.goto(G.Scene_Map);
        await waitFor(() => scene() && scene()._spriteset && !battle() && !G.SceneManager.isSceneChanging(), "map after replacing the old decided battle");
        await frames(10);
        if (!sameId) G.$gameSystem._psBattleSeq += 100;
        await startEvent(1); await inMode("main");
        const next = W.PSFlow._op, before = clone(game()), outcome = W.PSFlow.lastOutcome, result = W.PSFlow.lastResult;
        eq(old.op.request.battleId === next.request.battleId, sameId, "requested identity case");
        const resultVariable = next.request.resultVariable, projected = G.$gameVariables.value(resultVariable);
        let writes = 0; const saveObject = G.StorageManager.saveObject;
        G.StorageManager.saveObject = function (this: any, ...a: any[]) { writes++; return saveObject.apply(this, a); };
        try {
          for (const finish of [() => W.PSFlow.finish(old.session), () => W.PSFlow.finish(old.session, next), () => W.PSFlow.finish(old.session, old.op)]) {
            eq(finish().commit, "none", "old session refused");
            assert(W.PSFlow.running && W.PSFlow._op === next && !G.$gameSystem.isSaveEnabled(), "new host operation/save mask intact");
            eq(W.PSFlow.app().healParty().reason, "battle-active", "application still locked too");
            assert(W.PSFlow.lastOutcome === outcome && W.PSFlow.lastResult === result, "no outcome overwritten");
            eq(game(), before, "no state overwritten"); eq(G.$gameVariables.value(resultVariable), projected, "no projection");
            let error = ""; try { await G.DataManager.saveGame(22); } catch (e) { error = String(e); }
            assert(/battle is running/.test(error), "direct save rejected"); eq(writes, 0, "zero underlying save writes");
          }
        } finally { G.StorageManager.saveObject = saveObject; }
        await choose(/^Run/); await finishBattle();
        eq([W.PSFlow.lastOutcome.code, W.PSFlow.lastOutcome.commit, W.PSFlow.running, G.$gameSystem.isSaveEnabled()], [3, "applied", false, true], "current battle finishes normally");
        rows.push({ sameId, writes, commit: W.PSFlow.lastOutcome.commit });
      }
      return rows;
    });

    await scenario("T35 R02 failed defeat return: load/new game cancel the old request, retry causes zero transfers", async () => {
      const rows = [];
      for (const replacement of ["load", "new-game"]) {
        await slice(35); await G.DataManager.saveGame(21);
        game().party = [mkMember("S-1", "Snorlax", 2, { hp: 1 })]; game().money = 1000;
        W.PSFlow.debug.failReturn = true;
        await stepInto(4, 9, 2); await waitFor(() => battle() && battle()._mode !== "boot", "battle"); await inMode("main");
        await choose(/^Fight/); await inMode("moves"); await choose(/tackle/i); await finishBattle(); await frames(20);
        eq([W.PSFlow.lastOutcome.code, W.PSFlow.pendingReturn.status, game().money], [4, "failed", 984], "defeat settled, trip failed");
        const diagnostic = W.PSFlow.lastReturn;
        if (replacement === "load") await G.DataManager.loadGame(21); else G.DataManager.setupNewGame();
        eq([W.PSFlow.pendingReturn, W.PSFlow.request], [null, null], "no executable old work");
        assert(W.PSFlow.lastReturn === diagnostic, "historical diagnostic retained");
        const before = clone(game()); let transfers = 0;
        const reserve = G.$gamePlayer.reserveTransfer;
        G.$gamePlayer.reserveTransfer = function (this: any, ...a: any[]) { transfers++; return reserve.apply(this, a); };
        try { eq(W.PSFlow.retryReturnHome().status, "none", "old trip invalidated"); eq(W.PSFlow.retryReturnHome().status, "none", "repeated retry stays empty"); }
        finally { G.$gamePlayer.reserveTransfer = reserve; }
        eq(transfers, 0, "zero transfers in new timeline"); eq(game(), before, "no additional money/heal settlement");
        rows.push({ replacement, transfers, retry: "none" });
      }
      return rows;
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
  const managementBoxLinkDefault=W.PSManagement?.hasBoxLink;
  const management = (): any => W.PSManagement?.current();
  async function uiReady(kind?:string) { await waitFor(()=>!!management()?.ready&&(!kind||management().view.kind===kind)&&!G.SceneManager.isSceneChanging(),'management ready '+(kind||'')); }
  async function uiChoose(key:string){await uiReady('menu');let guard=0;while(management().view.items[management().view.cursor]?.key!==key&&guard++<60)await press('down');eq(management().view.items[management().view.cursor]?.key,key,'management menu target');await press('ok');}
  function nativeSubmit(input:HTMLInputElement,key:'Enter'|'Escape',release=true){input.dispatchEvent(new KeyboardEvent('keydown',{key,code:key,keyCode:key==='Enter'?13:27,bubbles:true}));if(release)document.dispatchEvent(new KeyboardEvent('keyup',{key,code:key,keyCode:key==='Enter'?13:27,bubbles:true}));}
  async function uiClosed(){await waitFor(()=>!management()&&!!scene()?._spriteset&&!G.SceneManager.isSceneChanging(),'management closed to map');await dismissMessages();}
  async function runManagementUI(){
   await scenario('U51-01 party, five summary pages, PP/order, sparse marks and cancel preserve authority',async()=>{
    await toMap();fresh();const before=clone(game());W.PSManagement.openParty();await uiReady('party');await shot('U51-party');await press('ok');await uiChoose('summary');await uiReady('summary');
    assert(management().text.some((s:string)=>s.includes('Original Trainer')),'owner displayed');for(let i=0;i<4;i++){await press('right');eq(management().view.page,i+1,'summary page');}await shot('U51-summary-ribbons');
    await press('left');await press('ok');eq(management().view.detail,'moves','move detail');await press('ok');await press('down');await press('ok');eq(game().party[0].moves[0].id,before.party[0].moves[1].id,'whole move/PP objects swapped immediately');
    await press('cancel');await press('shift');await uiReady('marks');await press('shift');eq(management().view.marks,[],'missing mark action clear does not add slots');await press('cancel');await uiReady('summary');await press('cancel');await uiReady('party');await press('cancel');await uiClosed();eq(game().party.map((m:any)=>m.id),before.party.map((m:any)=>m.id),'stable identities');
   });
   await scenario('U51-02 box rename followed by held movement cancellation preserves the independent name edit',async()=>{
    await toMap();fresh();await toMapId(5,8,9);G.$gameMap.event(4).start();await uiChoose('organize');await uiReady('box');await press('up');await press('ok');await uiChoose('name');
    const input=document.querySelector('input') as HTMLInputElement;assert(input,'native box input');input.value='青色盒子';nativeSubmit(input,'Enter');await uiReady('box');eq(game().storage.boxes[0].name,'青色盒子','box name');
    await press('down');await press('down');await press('down');await press('down');await press('down');await press('down');await press('ok');await uiReady('panel');await press('shift');await uiReady('panel');assert(!management().heldId,'ACTION only toggles quick mode');await press('ok');await uiReady('panel');assert(management().heldId,'member held');assert(W.PSFlow.operationPending(),'save blocked by held member');await press('cancel');await uiChoose('yes');await uiReady('panel');assert(!management().heldId,'only held intention cancelled');eq(game().storage.boxes[0].name,'青色盒子','independent edit retained');await press('cancel');await uiReady('box');await press('cancel');await uiChoose('no');await uiReady('menu');await uiChoose('close');await uiClosed();
   });
   await scenario('U51-03 nickname IME/empty/No and full-party reception summary/box commit exactly once',async()=>{
    await toMap();fresh();W.PSFlow.receiveOptions={mode:0,naming:0};W.PSFlow._app=null;const B=api(),before=game().party.length;
    let gift=mkMember('UI-GIFT','Pidgey',5,{nickname:'原名'});let result=W.PSFlow.app().receiveGift({kind:'normal',member:{existing:gift}});eq(result.status,'pending','normal receiving pending');W.PSManagement.openReceiving();await uiChoose('yes');
    let input=document.querySelector('input') as HTMLInputElement;input.value='组合中';input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));eq(management().view.kind,'text','composition not submitted');input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));nativeSubmit(input,'Escape');await uiClosed();eq(game().party[before].nickname,null,'accepted empty clears nickname');
    while(game().party.length<6)game().party.push(mkMember('UI-FILL-'+game().party.length,'Pidgey',5));gift=mkMember('UI-BOX','Pidgey',6,{nickname:'保留'});result=W.PSFlow.app().receiveGift({kind:'normal',member:{existing:gift}});eq(result.status,'pending','full party pending');W.PSManagement.openReceiving();await uiChoose('no');await uiChoose('summary');await uiReady('summary');await press('cancel');await uiChoose('party-view');await uiReady('party');await press('cancel');await uiChoose('box');await uiClosed();eq(B.storage.locateMember(game(),'UI-BOX').position.kind,'box','sent to actual box');eq(B.storage.locateMember(game(),'UI-BOX').member.nickname,'保留','No keeps old nickname');assert(!W.PSFlow.app().saveBlocked,'reception released save lock');
   });
   await scenario('U51-04 fixed1200 storage: live save/load, text/form/mark search, last-slot focus and 40 wrap',async()=>{
    await toMap();fresh();const B=api(),base=mkMember('UI-BASE','Pidgey',3);setBoxed(game(),Array.from({length:1200},(_,i)=>({...clone(base),id:'UI-BOX-'+i,nickname:i===1199?'蓝色朋友':null,markings:i===1199?[2]:[]})));const ids=boxed().map((m:any)=>m.id);await G.DataManager.saveGame(19);await G.DataManager.loadGame(19);eq(boxed().map((m:any)=>m.id),ids,'1200 save/load stable identities');
    const matches=W.PSFlow.app().searchStorage({text:'蓝色',form:0,markings:[{index:0,value:2}]},(m:any)=>W.PSFlow.speciesName(m.species,m.form));eq(matches.map((x:any)=>x.position),[{kind:'box',box:39,slot:29}],'localized last-slot search');W.PSManagement.openStorage();await uiChoose('organize');await uiReady('box');await press('pageup');await uiReady('box');eq(management().view.box,39,'back wraps to box40');await shot('U51-1200-box40');await press('pagedown');await uiReady('box');eq(management().view.box,0,'forward wraps');await press('control');await press('ok');await uiChoose('search');await uiChoose('text');const input=document.querySelector('input') as HTMLInputElement;input.value='蓝色';nativeSubmit(input,'Enter');await uiChoose('find');await uiReady('results');eq(management().view.matches.length,1,'search UI keeps one stable hit');await press('ok');await uiReady('box');eq([management().view.box,management().view.cursor],[39,29],'search opens exact stable position');await press('cancel');await uiChoose('no');await uiChoose('close');await uiClosed();eq(boxed().length,1200,'no lost member');
   });
   await scenario('U51-05 100 real UI open/cancel/reenter cycles use ready barriers, keep state and release roots',async()=>{
    await toMap();fresh();const before=clone(game()),times:number[]=[];for(let i=0;i<100;i++){const t=performance.now();assert(W.PSManagement.openParty(),'open cycle '+i);await uiReady('party');times.push(performance.now()-t);await press('cancel');await uiClosed();}eq(game(),before,'100 UI cycles no state edits');report.managementLifecycle={cycles:100,openMs:times,inputTail:management()?.frames??null};
   });
   await scenario('U51-06 stale native callback after host replacement cannot edit or close a new operation; Chinese UI has no missing key',async()=>{
    await toMap();fresh();W.PSFlow.setLanguage('zh');W.PSManagement.openStorage();await uiChoose('organize');await uiReady('box');await press('up');await press('ok');await uiChoose('name');const input=document.querySelector('input') as HTMLInputElement;input.value='迟到';W.PSFlow.app().stateReplacedByHost();const before=clone(game());nativeSubmit(input,'Enter');await frames(4);eq(game(),before,'stale input no write');await uiClosed();W.PSManagement.openParty();await uiReady('party');assert(management().text.some((s:string)=>s.includes('队伍')),'Chinese management labels');assert(!management().text.some((s:string)=>s.includes('[missing:')),'no missing translated key');await shot('U51-party-zh');await press('cancel');await uiClosed();W.PSFlow.setLanguage('en');
   });
   await scenario('U51-07 captured full-template pending transfers battle to reception and returns directly to map without restart/abort',async()=>{
    await toMap();fresh();while(game().party.length<6)game().party.push(mkMember('CAP-FILL-'+game().party.length,'Pidgey',3));const storedId=game().party[0].id;W.PSFlow.receiveOptions={mode:0,naming:0};W.PSFlow._app=null;I6.setItemCount(game(), "masterball", 2);await startEvent(1);await inMode('main');await choose(/^Bag/);await inMode('bag');await choose(/Master Ball/);await inMode('end');assert(!battle()._log._lines.some((line:string)=>line.includes('was sent to the boxes')),'no destination claim before full-party decision');await press('ok');await uiReady('menu');assert(W.PSFlow.running,'battle root stays open while receiving');await uiChoose('no');await uiChoose('party');await uiReady('party');await press('ok');await uiClosed();eq(api().storage.locateMember(game(),storedId).position.kind,'box','selected old member stored after full-party capture');eq(game().party[0].id,W.PSFlow.lastResult.captured[0].id,'caught stable identity joins the chosen party slot');assert(!W.PSFlow.running,'battle root closes after receipt');eq(W.PSFlow.lastOutcome.code,2,'caught outcome retained');assert(!W.PSFlow.lastOutcome.aborted,'reception transfer did not abort caught battle');
   });
   await scenario('U51-08 forced party receiving cannot cancel or send to box; replacing deposits the chosen stable ID',async()=>{
    await toMap();fresh();while(game().party.length<6)game().party.push(mkMember('FORCE-FILL-'+game().party.length,'Pidgey',5));W.PSFlow.receiveOptions={mode:2,naming:1};W.PSFlow._app=null;const original=game().party[0].id,result=W.PSFlow.app().receiveGift({kind:'normal',member:{existing:mkMember('FORCE-NEW','Pidgey',5)}});eq(result.status,'pending','force pending');W.PSManagement.openReceiving();await uiReady('menu');assert(!management().view.items.some((x:any)=>x.key==='box'),'force has no box option');await press('cancel');await uiReady('menu');assert(W.PSFlow.operationPending(),'cancel cannot unlock force receiving');await uiChoose('party');await uiReady('party');await press('cancel');await uiChoose('party');await uiReady('party');await press('ok');await uiClosed();eq(game().party[0].id,'FORCE-NEW','new identity occupies chosen party slot');eq(api().storage.locateMember(game(),original).position.kind,'box','chosen old member stored');
   });
   await scenario('U51-09 source-off UI permits taking existing item; selector caches qualifier and returns stable identity; Box Link requires three gates',async()=>{
    await toMap();fresh();game().party[0].item='leftovers';const id=game().party[0].id;W.PSManagement.openParty();await uiReady('party');await press('ok');await uiChoose('item');await uiReady('menu');assert(management().view.items.find((x:any)=>x.key==='give').enabled===false,'source off give disabled');await uiChoose('take');await uiReady('party');eq(game().party[0].item,'','taken item');eq(I6.bagOf(game()).leftovers,1,'returned exactly once');
    W.PSManagement.hasBoxLink=()=>true;G.$gameSwitches.setValue(35,true);await press('control');eq(management().view.kind,'party','switch disables link');G.$gameSwitches.setValue(35,false);await press('control');await uiReady('box');await press('cancel');await uiChoose('no');await uiReady('party');await press('cancel');await uiClosed();W.PSManagement.hasBoxLink=managementBoxLinkDefault;
    let calls=0,selected:any='pending';assert(W.PSManagement.selectMember((m:any)=>{calls++;return m.id===id;},(x:any)=>{selected=x;}),'selector open');await uiReady('party');eq(calls,game().party.length,'qualifier cached once per member');await press('ok');await uiClosed();eq(selected,{id,index:0},'selector stable ID/index');eq(calls,game().party.length,'not repeatedly called by rendering');
   });
   await scenario('U51-10 closed held-item player battle is a visible refusal without fatal map exception; taking it restores battle eligibility',async()=>{
    await toMap();fresh();game().party[0].item='leftovers';const before=clone(game());G.$gameMap.event(1).start();await frames(12);assert(!battle()&&!W.PSFlow.running,'held battle refused without a scene');assert(/held-item-battle-disabled/.test(W.PSFlow.lastOutcome?.error),'clear held diagnosis');eq(game(),before,'no state or item consumed');await dismissMessages();
    W.PSManagement.openParty();await uiReady('party');await press('ok');await uiChoose('item');await uiChoose('take');await uiReady('party');await press('cancel');await uiClosed();await startEvent(1);await inMode('main');await choose(/^Run/);await finishBattle();
   });
   await scenario('U51-11 real management window resource fails twice then explicit recovery commits once and presents destination notice',async()=>{
    await toMap();fresh();W.PSFlow.receiveOptions={mode:0,naming:0};W.PSFlow._app=null;const id='UI-RESOURCE-GIFT',result=W.PSFlow.app().receiveGift({kind:'normal',member:{existing:mkMember(id,'Pidgey',3)}});eq(result.status,'pending','gift pending');const original=G.Window_Base.prototype.initialize;let failures=2;
    G.Window_Base.prototype.initialize=function(...args:any[]){if(scene()?._psManagement&&failures-->0)throw Error('injected management window resource failure');return original.apply(this,args);};
    try{W.PSManagement.openReceiving();await uiClosed();eq(failures,0,'one construction and one rebuild failed');eq(game().party.filter((m:any)=>m.id===id).length,1,'gift installed once');assert(!W.PSFlow.app().saveBlocked,'recovery unlocks after commit');await dismissMessages();eq(W.PSFlow.app().receivingNotifications.length,0,'healthy map presented and acknowledged destination');}finally{G.Window_Base.prototype.initialize=original;}
   });
   await scenario('U51-12 native nickname Enter hold/repeat cannot activate placement before release, then actual committed destination is presented',async()=>{
    await toMap();fresh();while(game().party.length<6)game().party.push(mkMember('NATIVE-FILL-'+game().party.length,'Pidgey',3));W.PSFlow.receiveOptions={mode:0,naming:0};W.PSFlow._app=null;const id='NATIVE-REAL-GIFT';eq(W.PSFlow.app().receiveGift({kind:'normal',member:{existing:mkMember(id,'Pidgey',3)}}).status,'pending','native receive pending');W.PSManagement.openReceiving();await uiChoose('yes');const input=document.querySelector('input')as HTMLInputElement;input.value='Hold';nativeSubmit(input,'Enter',false);await uiReady('menu');
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,repeat:true,bubbles:true}));await frames(4);eq(management().view.kind,'menu','held native Enter did not choose Add to party');assert(W.PSFlow.app().pendingReceiving,'no premature commit');document.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,bubbles:true}));await uiChoose('box');await uiClosed();eq(api().storage.locateMember(game(),id).position.kind,'box','explicit choice committed');assert(W.PSFlow.lastReceivingNotice?.placements.some((p:any)=>p.id===id&&p.to==='boxes'),'actual destination diagnostic');
   });
   await scenario('U51-13 author gift/summary/recover commands execute through the real interpreter and standard Scene_Load restores data plus map',async()=>{
    await toMap();fresh();await toMapId(5,8,9);const before=game().party.length;W.PSFlow.receiveOptions={mode:0,naming:0};W.PSFlow._app=null;
    const command=(name:string,args:any)=>{G.$gameMap._interpreter.setup([{code:357,indent:0,parameters:['PS_Management',name,name,args]},{code:0,indent:0,parameters:[]}],0);};
    command('ReceiveGift',{request:JSON.stringify({kind:'normal',member:{species:'pidgey',level:3}})});await uiReady('menu');assert(G.$gameMap._interpreter._waitMode==='psReceiving','normal gift command waits for receiving');await uiChoose('no');await uiClosed();eq(game().party.length,before+1,'gift command installed one member');const id=game().party[game().party.length-1].id;
    command('ShowSummary',{id});await uiReady('summary');eq(management().view.ids,[id],'summary command targets stable ID');await press('cancel');await uiClosed();
    game().party[0].hp=1;const stored=mkMember('AUTHOR-RECOVER','Pidgey',3,{hp:1});api().storage.placeInBox(game().storage,stored);command('RecoverAll',{});await frames(6);await dismissMessages();assert(game().party[0].hp>1&&api().storage.locateMember(game(),stored.id).member.hp>1,'recover command heals configured party and boxes');
    await G.DataManager.saveGame(16);const expected=clone(game());game().money=0;G.SceneManager.push(G.Scene_Load);await waitFor(()=>scene()?.isStarted?.()&&scene()?.isActive?.()&&scene()?._listWindow?.active&&scene().mode?.()==='load'&&!G.SceneManager.isSceneChanging(),'standard load menu interactive');scene()._listWindow.selectSavefile(16);assert(scene()._listWindow.index()>=0&&scene()._listWindow.index()<scene()._listWindow.maxItems(),'selected save is inside the actual MZ load list');await press('ok');await waitFor(()=>!!scene()?._spriteset&&!G.SceneManager.isSceneChanging(),'standard Scene_Load returned to map');await frames(4);eq(game(),expected,'standard load restored framework data');assert(!W.PSFlow.operationPending(),'standard load leaves no stale management root');
   });
   await scenario('U51-14 J02 transient snapshot retry and T1 unusable event entries remain contained and exit to map',async()=>{
    await toMap();fresh();const app=W.PSFlow.app(),read=app.managementSnapshot.bind(app);let calls=0;app.managementSnapshot=(...args:any[])=>{if(calls++===0)throw Error('J02 transient snapshot');return read(...args);};W.PSManagement.openParty();await uiReady('party');assert(calls>=2,'initialization actually retried snapshot');await press('cancel');await uiClosed();delete app.managementSnapshot;const token=app.beginManagement();app.endManagement(token);
    const healthy=clone(game()),raw:any={...healthy,schema:4,boxes:Array.from({length:1201},(_,i)=>({...api().state.protocolMember(healthy.party[0]),form:healthy.party[0].form,id:'T1-'+i}))};raw.party=healthy.party.map((m:any)=>({...api().state.protocolMember(m),form:m.form}));delete raw.storage;delete raw.player;delete raw.nextMemberOrdinal;raw.bag=I6.rawBagOf(healthy);delete raw.inventory;delete raw.badges;/* 5.2 D-07: a schema-4 document has bag, not the schema-6 inventory/badges */const bytes=JSON.stringify(raw);G.$gameSystem._psGame=raw;const contents=G.DataManager.makeSaveContents();G.DataManager.extractSaveContents(contents);eq(G.$gameSystem._psSaveError.code,'capacity-exceeded','actual migration rejected');
    for(const name of ['ShowStorage','ShowParty','ShowSummary']){const plugin=name==='ShowParty'?'PS_BattleFlow':'PS_Management';G.$gameMap._interpreter.setup([{code:357,indent:0,parameters:[plugin,name,name,{id:healthy.party[0].id}]},{code:0,indent:0,parameters:[]}],0);await waitFor(()=>scene()?._psManagement&&scene()?._initialFailure&&!G.SceneManager.isSceneChanging(),'contained unavailable management '+name);await frames(3);assert(!management()?.ready,'failed scene never ready');await shot('J02-'+name);await press('cancel');await uiClosed();eq(JSON.stringify(G.$gameSystem._psGame),bytes,'unusable original unchanged');assert(!G.$gameSystem.isSaveEnabled(),'all saves remain blocked');}
    await toMap();fresh();
   });
   await scenario('U51-15 J01 actual Reactor gamepad polling releases held USE BACK and direction without DOM events',async()=>{
    await toMap();fresh();const descriptor=Object.getOwnPropertyDescriptor(navigator,'getGamepads'),original=navigator.getGamepads;const buttons=Array.from({length:16},()=>({pressed:false,value:0})),pad={index:0,connected:true,buttons,axes:[0,0]};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[pad]});
    try{for(const button of [0,1,13]){G.Input.clear();buttons[button]!.pressed=true;G.Input._pollGamepads();W.PSManagement.openParty();await uiReady('party');await frames(4);eq(management().view.kind,'party','held service input did not act');eq(management().view.cursor,0,'held direction stayed blocked');buttons[button]!.pressed=false;await frames(3);buttons[button]!.pressed=true;await frames(3);buttons[button]!.pressed=false;await frames(3);if(button===0){await uiReady('menu');await press('cancel');await uiReady('party');await press('cancel');}else if(button===13){eq(management().view.cursor,2,'released direction works');await press('cancel');}await uiClosed();}}
    finally{for(const b of buttons)b.pressed=false;if(descriptor)Object.defineProperty(navigator,'getGamepads',descriptor);else{delete (navigator as any).getGamepads;if(navigator.getGamepads!==original)Object.defineProperty(navigator,'getGamepads',{configurable:true,value:original});}G.Input.clear();}
   });
   await scenario('U51-16 J06/J07 actual organizer toggle, header shortcut, sparse summary return and quick placement',async()=>{
    await toMap();fresh();const a=mkMember('JBOX0','Pidgey',3),b=mkMember('JBOX29','Pidgey',3);game().storage.boxes[0].slots[0]=a;game().storage.boxes[0].slots[29]=b;W.PSManagement.openStorage();await uiChoose('organize');await uiReady('box');await press('ok');await uiChoose('summary');await uiReady('summary');await press('down');eq(management().view.ids[management().view.cursor],b.id,'summary selected last sparse slot');await press('cancel');await uiReady('box');eq(management().view.cursor,29,'parent cursor follows summary');const before=clone(game());await press('shift');await uiReady('box');assert(!management().heldId,'toggle alone does not take member');eq(game(),before,'toggle performs no state write');await press('ok');await uiReady('box');eq(management().heldId,b.id,'USE takes in quick mode');await press('left');await press('ok');await uiReady('box');assert(!management().heldId,'USE places at empty slot');eq(game().storage.boxes[0].slots[28].id,b.id,'quick placement committed');await press('shift');await uiReady('box');await press('control');eq(management().view.cursor,-1,'SPECIAL returns header');await press('ok');await uiChoose('search');await uiReady('menu');assert(management().view.items.some((x:any)=>x.key==='find'),'search remains command entry');await press('cancel');await uiReady('box');await press('cancel');await uiChoose('no');await uiChoose('close');await uiClosed();
   });
   await scenario('U51-17 J08/J09 nature stat colors and last-able release guard before confirmation',async()=>{
    await toMap();fresh();game().party[0].nature='adamant';W.PSManagement.openSummary(game().party[0].id);await uiReady('summary');await press('right');await press('right');const c=scene()._controller,b=c.window.contents,draw=b.drawText,colors:any[]=[];b.drawText=function(text:string,...args:any[]){colors.push({text,color:this.textColor});return draw.call(this,text,...args);};try{c.draw();}finally{b.drawText=draw;}eq(colors.find(x=>x.text.startsWith('Attack:')).color,'#ffb0b0','raised red');eq(colors.find(x=>x.text.startsWith('Sp. Atk:')).color,'#aabfff','lowered blue');await shot('J08-summary-colors');await press('cancel');await uiClosed();game().party.forEach((m:any,i:number)=>m.hp=i?0:1);W.PSManagement.openStorage();await uiChoose('organize');await uiReady('box');await press('control');await press('up');await press('ok');await uiReady('panel');await press('ok');await uiChoose('release');await uiReady('panel');assert(management().text.some((t:string)=>t.includes('last able')),'refusal visible before any confirmation');await press('cancel');await uiReady('box');await press('cancel');await uiChoose('no');await uiChoose('close');await uiClosed();
   });
   await scenario('U51-18 RJ01 mixed keyboard and actual Reactor gamepad sources release in either order',async()=>{
    await toMap();fresh();const descriptor=Object.getOwnPropertyDescriptor(navigator,'getGamepads'),original=navigator.getGamepads,buttons=Array.from({length:16},()=>({pressed:false,value:0}));Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{index:0,connected:true,buttons,axes:[0,0]}]});
    const key=(type:string)=>document.dispatchEvent(new KeyboardEvent(type,{key:'ArrowDown',code:'ArrowDown',keyCode:40,bubbles:true}));
    try{for(const order of ['keyboard-first','gamepad-first','both-held']){G.Input.clear();buttons[13]!.pressed=true;key('keydown');G.Input._pollGamepads();W.PSManagement.openParty();await uiReady('party');await frames(4);eq(management().view.cursor,0,'entry barrier');if(order==='keyboard-first')key('keyup');if(order==='gamepad-first')buttons[13]!.pressed=false;await frames(30);eq(management().view.cursor,0,'remaining source still blocked '+order);buttons[13]!.pressed=false;key('keyup');await frames(3);buttons[13]!.pressed=true;await frames(3);buttons[13]!.pressed=false;await frames(3);eq(management().view.cursor,2,'full release permits new press '+order);await press('cancel');await uiClosed();}}
    finally{key('keyup');buttons[13]!.pressed=false;if(descriptor)Object.defineProperty(navigator,'getGamepads',descriptor);else{delete (navigator as any).getGamepads;if(navigator.getGamepads!==original)Object.defineProperty(navigator,'getGamepads',{configurable:true,value:original});}G.Input.clear();}
   });
   await scenario('U51-19 RJ02 withdraw party button prompts without changes, organize and deposit retain panel movement',async()=>{
    for(const mode of ['withdraw','organize','deposit']){await toMap();fresh();W.PSManagement.openStorage();await uiChoose(mode);await uiReady(mode==='deposit'?'panel':'box');const before=clone(game());if(mode!=='deposit'){await press('control');await press('up');eq(management().view.cursor,-2,'party button');await press('ok');}
     if(mode==='withdraw'){await uiReady('box');eq(management().view.cursor,-2,'withdraw retains cursor');assert(management().text.some((t:string)=>t.includes('Which one will you take?')),'withdraw prompt visible');eq(game(),before,'no state change');await press('ok');eq(game(),before,'repeat choice no state change');}
     else{await uiReady('panel');await press('ok');await uiChoose('transfer');await uiReady('panel');eq(game().party.length,before.party.length-1,'deposit remains available');if(mode==='organize'){await press('cancel');await uiReady('box');}}
     await press('cancel');await uiChoose('no');await uiChoose('close');await uiClosed();}
   });
   await scenario('U51-20 RJ01 native release on first ready frame permits immediate fresh USE',async()=>{
    await toMap();fresh();W.PSManagement.openStorage();await uiChoose('organize');await uiReady('box');await press('control');await press('ok');await uiChoose('name');const input=document.querySelector('input') as HTMLInputElement;input.value='Ready release';nativeSubmit(input,'Enter');await uiReady('box');await press('ok');await uiChoose('wallpaper');await uiChoose('5');await uiReady('box');eq(game().storage.boxes[0].wallpaper,5,'fresh USE immediately after native completion accepted');await press('cancel');await uiChoose('no');await uiChoose('close');await uiClosed();
   });
   W.PSFlow.receiveOptions={mode:1,naming:1};W.PSFlow._app=null;
  }

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

  const inventory=()=>W.PSInventory?.current();
  async function inventoryReady(kind?:string){await waitFor(()=>inventory()?.ready&&(!kind||inventory().view.kind===kind)&&!G.SceneManager.isSceneChanging(),'inventory ready '+(kind||''));}
  async function inventoryChoose(key:string){await inventoryReady('menu');let n=0;while(inventory().view.items[inventory().view.cursor]?.key!==key&&n++<120)await press('down');eq(inventory().view.items[inventory().view.cursor]?.key,key,'inventory choice');await press('ok');}
  async function inventoryPocket(pocket:number){await inventoryReady('bag');let n=0;while(inventory().pocket!==pocket&&n++<8)await press('right');eq(inventory().pocket,pocket,'inventory pocket');}
  async function inventoryClosed(){await waitFor(()=>!inventory()&&!!scene()?._spriteset&&!G.SceneManager.isSceneChanging(),'inventory closed to map');await dismissMessages();}
  async function manyKeys(keys:string[],hold=3){await pressKey(waits,type=>{for(const k of keys)keyEvent(type,k);},hold);}
  function inventoryFresh(){fresh();const B=api(),g=game();g.inventory=B.inventory.inventoryFromBag({potion:3,ether:2,rarecandy:2,pokeball:20},B.itemCatalog.catalogOf(W.PSFlow.content()));g.money=5000;g.party[0].hp=1;}
  async function inventoryLifecycle(cycles=100){
   const before=clone(game()),times:number[]=[],memoryBefore=G.process.memoryUsage(),inputsBefore=document.querySelectorAll('input').length;
   for(let n=0;n<cycles;n++){const t=performance.now();assert(W.PSInventory.showBag(),'inventory cycle open '+n);await inventoryReady('bag');times.push(performance.now()-t);await press('cancel');await inventoryClosed();}
   eq(game(),before,'inventory cycles preserve state');return {cycles,openMs:times,memoryBefore,memoryAfter:G.process.memoryUsage(),inputsBefore,inputsAfter:document.querySelectorAll('input').length,method:'actual MZ windows; synthetic DOM events; no no-leak claim; concurrency unknown unless separately verified'};
  }
  /** 5.2 D-02 fault injection in the real host: every injected failure must be reported as a failure, keep its
   *  original id and error, stay inside SHOTS and never leave the run waiting. The run's overall result is "fail" by
   *  design; DS-99 is the only scenario expected to pass and checks the others. */
  async function runDriverSelftest(){
   const started=Date.now();await toMap();
   const never:Partial<CapturePorts>={capture:()=>{}},badWrite:Partial<CapturePorts>={write:()=>{throw new Error('injected write failure');}};
   await scenario('DS-01/../../escape:attempt assertion failure keeps the original id',async()=>{eq(1,2,'injected assertion');});
   await scenario('DS-02 evidence screenshot write failure fails its scenario',async()=>{await shot('DS-02',{ports:badWrite});});
   await scenario('DS-03 evidence screenshot callback that never returns times out',async()=>{await shot('DS-03',{ports:never,timeoutMs:2000});});
   await scenario('DS-04 colliding screenshot names stay distinct inside the evidence directory',async()=>{const a=await shot('DS/04'),b=await shot('DS:04');assert(a.file!==b.file,'distinct files');for(const s of [a,b])assert(fs.existsSync(path.join(SHOTS!,s.file))&&path.dirname(path.resolve(SHOTS!,s.file))===path.resolve(SHOTS!),'inside '+s.file);return [a.file,b.file];});
   failureShot={ports:never,timeoutMs:2000};
   await scenario('DS-05/hang the failure-path screenshot never returns',async()=>{eq(1,2,'injected assertion');});
   failureShot={ports:badWrite};
   await scenario('DS-06/write the failure-path screenshot write fails',async()=>{eq(1,2,'injected assertion');});
   await scenario('DS-99 control: injected failures recorded with original ids and errors, nothing hung',async()=>{
    const by=(p:string)=>{const r=results.find((x:any)=>x.id.startsWith(p));if(!r)throw new Error('missing '+p);return r;};
    const r1=by('DS-01/'),r2=by('DS-02'),r3=by('DS-03'),r4=by('DS-04'),r5=by('DS-05/'),r6=by('DS-06/');
    eq([r1.status,r2.status,r3.status,r4.status,r5.status,r6.status],['fail','fail','fail','pass','fail','fail'],'statuses');
    eq(r1.id,'DS-01/../../escape:attempt assertion failure keeps the original id','original id kept');
    assert(/injected assertion/.test(r1.error)&&r1.screenshot?.ok===true&&!/[\\/:]/.test(r1.screenshot.file)&&fs.existsSync(path.join(SHOTS!,r1.screenshot.file)),'DS-01 sanitized failure screenshot');
    assert(/injected write failure/.test(r2.error),'DS-02 write failure reported');
    assert(/did not return within 2000 ms/.test(r3.error)&&r3.ms<8000,'DS-03 bounded wait');
    assert(/injected assertion/.test(r5.error)&&r5.screenshot?.ok===false&&/did not return/.test(r5.screenshot.error),'DS-05 original failure kept, failure screenshot timed out');
    assert(/injected assertion/.test(r6.error)&&r6.screenshot?.ok===false&&/injected write failure/.test(r6.screenshot.error),'DS-06 original failure kept, failure screenshot write failed');
    assert(!!OUT&&fs.existsSync(OUT+'.progress.json'),'progress written');
    for(const s of shots)if(s.file)assert(!/[\\/:]/.test(s.file),'no path separators: '+s.file);
    return {elapsedMs:Date.now()-started,shots:shots.map((s:any)=>({label:s.label,file:s.file,ok:s.ok,error:s.error}))};
   });
  }
  async function runInventoryUI(){
   await scenario('U52-01/FR-000177/188/P52-01/12/20 real bag healing, later target cancellation preserves success',async()=>{
    await toMap();inventoryFresh();const id=game().party[0].id,h=W.PSInventory.showBag();await inventoryPocket(2);await shot('U52-bag-en');await press('ok');await inventoryChoose('use');await inventoryChoose(id);await inventoryReady('message');eq(api().inventory.aggregateBag(game().inventory).potion,2,'one potion spent');assert(game().party[0].hp>1,'healed');await press('ok');await inventoryReady('menu');await press('cancel');await inventoryReady('bag');await press('cancel');await inventoryClosed();eq(h.result.status,'cancelled','last path is cancellation, not cumulative success');eq(api().inventory.aggregateBag(game().inventory).potion,2,'later cancel preserves earlier success');
   });
   await scenario('U52-02/P52-08/35 real shared quantity simultaneous BACK wins over USE',async()=>{
    await toMap();inventoryFresh();const before=clone(game());W.PSInventory.showBag();await inventoryPocket(2);await press('ok');await inventoryChoose('toss');await inventoryReady('quantity');await manyKeys(['ok','cancel']);await inventoryReady('bag');eq(game().inventory.pockets,before.inventory.pockets,'quantity cancel no resource changes');await press('cancel');await inventoryClosed();
   });
   await scenario('U52-03/FR-000196/P52-21/23/25/35 real shop priority, confirmation barrier, bonus and interpreter wait',async()=>{
    await toMap();inventoryFresh();const h=W.PSInventory.openShop({stock:['pokeball','potion','box-link']},[{itemId:'pokeball',buy:200,sell:50}]);await inventoryChoose('buy');await inventoryChoose('pokeball');await inventoryReady('quantity');await manyKeys(['right','ok']);eq(inventory().view.kind,'quantity','shop direction before use');eq(inventory().view.value,11,'shop increments ten');await shot('U52-shop-quantity');await manyKeys(['ok','cancel']);await inventoryReady('menu');eq(inventory().view.items[inventory().view.cursor].key,'yes','confirmation default Yes');eq(api().inventory.aggregateBag(game().inventory).pokeball,20,'held transition did not buy');await inventoryChoose('yes');await inventoryReady('message');eq(game().money,2800,'one exact transaction');eq(api().inventory.aggregateBag(game().inventory).pokeball,31,'eleven bought');eq(api().inventory.aggregateBag(game().inventory).premierball,1,'one actual bonus');await press('ok');await inventoryReady('menu');await press('cancel');await inventoryChoose('close');await inventoryClosed();eq(h.done,true,'own handle completed');report.inventoryInputFrames=W.PSInventory.trace();
   });
   await scenario('U52-04/P52-42/44 real party Item Use remains in parent scene and refreshes member',async()=>{
    await toMap();inventoryFresh();W.PSManagement.openParty();await uiReady('party');await press('ok');await uiChoose('item');await uiChoose('use');await inventoryReady('bag');assert(W.PSFlow.app().saveBlocked,'child blocks saves');const parent=scene();await inventoryPocket(2);await press('ok');await inventoryChoose('use');await inventoryReady('message');assert(scene()===parent,'same parent scene owns window');eq(api().inventory.aggregateBag(game().inventory).potion,2,'child spent once');await press('ok');await inventoryReady('bag');await press('cancel');await uiReady('party');await shot('U52-party-return');await press('cancel');await uiClosed();assert(!W.PSFlow.app().saveBlocked,'parent/child released');
   });
   await scenario('U52-05/P52-18/45 real minimal learning and HM reselect, explicit synthetic content fixture',async()=>{
    await toMap();inventoryFresh();const realContent=W.PSFlow.content,c=clone(realContent()),B=api();c.items=clone(B.itemCatalog.catalogOf(c));c.items['synthetic-hm']={...c.items.potion,id:'synthetic-hm',fieldUse:'hm',move:'flamethrower',flags:['HM'],consumable:false};c.species.Charizard.learnset={51:['Slash','Outrage']};c.moves={...c.moves,Slash:{id:'slash',name:'Slash',pp:20},Outrage:{id:'outrage',name:'Outrage',pp:10}};W.PSFlow.content=()=>c;W.PSFlow._app=null;
    try{W.PSFlow.setLanguage('zh');const id=game().party[0].id;W.PSInventory.useItem('rarecandy',id,1);await inventoryReady('menu');await inventoryChoose('0');await inventoryReady('menu');assert(inventory().text.some((s:string)=>s.includes('不能遗忘')),'HM protected visible');await shot('U52-learning-hm-zh');await inventoryChoose('1');await inventoryReady('menu');await press('cancel');await inventoryReady('menu');await inventoryChoose('no');await inventoryReady('menu');await inventoryChoose('new');await inventoryChoose('yes');await inventoryReady('message');eq(game().party[0].level,51,'level once');eq(game().party[0].moves[1].id,'slash','selected move learned');eq(game().party[0].moves[0].id,'flamethrower','HM preserved');eq(B.inventory.aggregateBag(game().inventory).rarecandy,1,'single rare candy');await shot('U52-learning-result-zh');await press('ok');await inventoryClosed();}finally{W.PSFlow.content=realContent;W.PSFlow._app=null;W.PSFlow.setLanguage(null);}
   });
   await scenario('U52-06/P52-27/41/43 real isolated Map006 author events, variables, BoxLink obtain/remove',async()=>{
    await toMap();inventoryFresh();await toMapId(6,8,10);await shot('U52-Map006');await startMapEvent(4);await dismissMessages();await waitFor(()=>!G.$gameMap.isEventRunning(),'BoxLink grant event ends');assert(W.PSFlow.app().hasBoxLink(),'actual inventory link');await startMapEvent(5);await waitFor(()=>!G.$gameMap.isEventRunning(),'BoxLink remove event ends');assert(!W.PSFlow.app().hasBoxLink(),'removing link loses capability');await startMapEvent(6);await dismissMessages();await waitFor(()=>!G.$gameMap.isEventRunning(),'badge event ends');eq(G.$gameVariables.value(2),true,'badge query variable');await startMapEvent(7);await inventoryReady('bag');await press('cancel');await inventoryClosed();await dismissMessages();await waitFor(()=>!G.$gameMap.isEventRunning(),'selection event ends');eq([G.$gameVariables._data[3],G.$gameVariables.value(3)],['',0],'cancel writes the empty ID raw (D-05: MZ public read of an empty value is 0)');await startMapEvent(2);await inventoryReady('bag');assert(G.$gameMap._interpreter.isRunning(),'actual interpreter waits for this bag');await press('cancel');await inventoryClosed();await waitFor(()=>!G.$gameMap.isEventRunning(),'bag wait ends');
   });
   await scenario('U52-07/P52-30/34 real load-generation interruption rejects old pending, new UI stays usable',async()=>{
    await toMap();inventoryFresh();const realContent=W.PSFlow.content,c=clone(realContent());c.species.Charizard.learnset={51:['Slash']};c.moves={...c.moves,Slash:{id:'slash',name:'Slash',pp:20}};W.PSFlow.content=()=>c;W.PSFlow._app=null;
    try{const before=clone(game()),h=W.PSInventory.useItem('rarecandy',game().party[0].id);await inventoryReady('menu');W.PSFlow.app().stateReplacedByHost();await inventoryClosed();eq(h.result.status,'refused','old UI invalid');eq(game(),before,'old callback no write');W.PSInventory.showBag();await inventoryReady('bag');await press('cancel');await inventoryClosed();assert(!W.PSFlow.app().saveBlocked,'no save lock');}finally{W.PSFlow.content=realContent;W.PSFlow._app=null;}
   });
   await scenario('U52-08/P52-34/40 real inventory 100-window lifecycle measurement',async()=>{await toMap();inventoryFresh();report.inventoryLifecycle=await inventoryLifecycle(100);});
  }
  async function runPerf() {
    W.PSFlow.receiveOptions={mode:1,naming:1};
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
    await G.DataManager.setupNewGame(); W.PSFlow.resetGame(); W.PSFlow._app=null; W.PSFlow.fast = true; W.PSFlow.seed = undefined;
    G.$gamePlayer.reserveTransfer(4, 8, 8, 2, 0); G.SceneManager.goto(G.Scene_Map); await frames(30);
    W.PSFlow.seed = [1, 2, 3, 4];
    const kindsList: [string, number, () => Promise<void>][] = [["run", 1, run], ["fight-ko", 1, fightKo], ["potion+run", 1, potionRun], ["master-ball", 1, ball]];
    const rounds = Number(arg("ps-perf-rounds")) || 6;
    for (let r = 0; r < rounds; r++) {
      for (const [name, ev, fn] of kindsList) {
        I6.setItemCount(game(), "masterball", 5); I6.setItemCount(game(), "potion", 5); game().party[0].hp = 100; game().party[0].moves.forEach((m: any) => { m.pp = m.maxpp; }); game().party.length = Math.min(game().party.length, 3);
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
    perf.rounds = rounds; // the last memory sample is taken here, before the step 4 / step 5 timing battles
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
    // the battles measured so far are the ones the step 4 baseline had (the rounds and the step 4 encounters): the
    // comparable metrics below are computed over exactly these, the full-save battles that follow form their own group
    const comparableN = W.PSFlow.perf.battles.length;
    // step 5.0 timings (plan §3 5.0 item 7): full boxes, a large bag and opening the party screen, on the structures of
    // this build (flat boxes, one count per item, the read-only party screen); the 5.1/5.2 structures are measured later
    try {
      const n = Number(arg("ps-perf-step5")) || 6;
      const B = nodeRequire("./js/engine/build/engine.cjs");
      await slice(51);
      const g = game();
      for (let i = 2; i <= 6; i++) g.party.push(mkMember(`P-${i}`, "Caterpie", 3));
      const box = mkMember("BX-0", "Pidgey", 3);
      setBoxed(g, Array.from({ length: W.PSFlow.limits().boxes }, (_, i) => ({ ...clone(box), id: `BX-${i}` }))); // test setup: every box slot used
      for (const item of B.items.BAG_ITEMS) I6.setItemCount(g, item, 999); // test setup: every known bag item at the cap
      const enc: number[] = [], saveMs: number[] = [], loadMs: number[] = [], menuMs: number[] = [], viewMs: number[] = [];
      for (let i = 0; i < n; i++) {
        let t = performance.now(); await G.DataManager.saveGame(17); saveMs.push(Math.round((performance.now() - t) * 10) / 10);
        t = performance.now(); await G.DataManager.loadGame(17); loadMs.push(Math.round((performance.now() - t) * 10) / 10);
        t = performance.now(); B.speciesKey.battleView(game(), W.PSFlow.content()); viewMs.push(Math.round((performance.now() - t) * 100) / 100);
      }
      await toMapId(5, 8, 9);
      for (let i = 0; i < n; i++) {
        W.PSFlow.perf.cur = null;
        await stepInto(4, 9, i % 2 ? 8 : 2); await waitFor(() => battle() && battle()._mode !== "boot", "encounter"); await inMode("main");
        const cur = W.PSFlow.perf.cur; if (cur && cur.encounter && cur.firstMenuMs !== undefined) enc.push(cur.firstMenuMs);
        for (let k = 0; k < 6 && mode_() !== "end"; k++) { await choose(/^Run/); await waitFor(() => ["main", "end"].includes(mode_()) && !battle()._busy && battle()._queue.length === 0, "after run"); }
        await finishBattle();
        const t = performance.now(); G.SceneManager.push(W.Scene_PSParty);
        await uiReady("party"); menuMs.push(Math.round((performance.now() - t) * 10) / 10);
        await press("cancel"); await waitFor(() => scene() && scene()._spriteset && !G.SceneManager.isSceneChanging(), "back on the map");
      }
      const st = (a: number[]) => ({ n: a.length, p50: pct(a, 0.5), max: a.length ? Math.max(...a) : null, samples: a });
      perf.step5 = {
        method: `slice map; party 6, boxes ${boxed().length} (all slots used), bag ${Object.keys(I6.bagOf(game())).length} items x 999 (test setup); save/load = DataManager round trip, slot 17; battleView = the battle view of that state; encounter = executeEncounter -> first menu; party screen = SceneManager.push(Scene_PSParty) until explicit management ready (5.0 object-exists endpoint is not directly comparable)`,
        saveMs: st(saveMs), loadMs: st(loadMs), battleViewMs: st(viewMs), encounterToFirstMenuMs: st(enc), partyScreenOpenMs: st(menuMs),
      };
    } catch (e: any) { perf.errors = (perf.errors || []).concat(`step5 timings: ${e.message}`); }
    const all: any[] = W.PSFlow.perf.battles;
    const bs: any[] = all.slice(0, comparableN); // same composition as the step 4 baseline (review F09)
    perf.battleGroups = { comparable: comparableN, fullSave: all.length - comparableN };
    perf.battleLog = all.map((b: any, i: number) => ({ i, group: i < comparableN ? "comparable" : "full-save", label: b.label, encounter: b.encounter, sessionMs: b.sessionMs, firstMenuMs: b.firstMenuMs, totalMs: b.totalMs, code: b.code, actions: b.actions }));
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
    if (bAt !== null) blurIv.push([bAt, performance.now()]);
    for (const b of bs) { const s0 = b.t0, e0 = b.t0 + (b.totalMs || 0); b.blurred = blurIv.some(([x, y]) => x < e0 && y > s0); }
    const fb = bs.slice(1).filter((b) => !b.blurred);
    perf.laterBattles.unblurredN = fb.length; perf.laterBattles.blurredN = bs.slice(1).length - fb.length;
    perf.laterBattles.firstMenuMsMedianFocused = med(fb.map((b) => b.firstMenuMs)); perf.laterBattles.firstMenuMsMaxFocused = fb.length ? Math.max(...fb.map((b) => b.firstMenuMs)) : null;
    perf.firstBattle.blurred = bs[0] ? bs[0].blurred : null;
    perf.focus = { initiallyFocused: focusLog[0]?.hasFocus, blurEvents: focusLog.filter((e) => e.ev === "blur" && !e.initial).length, framesSkippedUnfocused: skippedUnfocused };
    perf.battles = all.length;
    perf.window = { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio, refocusCount: refocus };
    // New 5.1 measurements are separate from every historical comparable row above.
    if(argv.includes('--ps-perf-management')){
      sampling=false;lastFrameAt=0;
      try{
        const B=api(),corpus=boxed().map(clone),measurements:any[]=[];
        for(const count of [0,30,1200]){
          setBoxed(game(),corpus.slice(0,count));const samples:any={count,saveMs:[],loadMs:[],migration4to6Ms:[],searchMs:[],boxSwitchMs:[]};
          for(let i=0;i<6;i++){
            let t=performance.now();await G.DataManager.saveGame(18);samples.saveMs.push(performance.now()-t);
            t=performance.now();await G.DataManager.loadGame(18);samples.loadMs.push(performance.now()-t);
            t=performance.now();const matches=W.PSFlow.app().searchStorage({},(m:any)=>W.PSFlow.speciesName(m.species,m.form));samples.searchMs.push(performance.now()-t);eq(matches.length,count,'performance search count');
          }
          const current=clone(game()),legacy:any={...clone(current),schema:4,bag:B.inventory.aggregateBag(current.inventory),party:current.party.map((m:any)=>({...B.state.protocolMember(m),form:m.form})),boxes:boxed(current).map((m:any)=>({...B.state.protocolMember(m),form:m.form}))};delete legacy.inventory;delete legacy.badges;delete legacy.storage;delete legacy.player;delete legacy.nextMemberOrdinal;
          for(let i=0;i<3;i++){G.$gameSystem._psGame=clone(legacy);await G.DataManager.saveGame(18);const t=performance.now();await G.DataManager.loadGame(18);samples.migration4to6Ms.push(performance.now()-t);eq([G.$gameSystem._psSaveInfo.from,G.$gameSystem._psSaveInfo.to,G.$gameSystem._psSaveInfo.migrated],[4,6,true],'actual timed legacy migration');eq(boxed().length,count,'migration count');eq(B.inventory.aggregateBag(game().inventory),legacy.bag,'timed migration retains all legacy bag quantities');eq(game().money,legacy.money,'timed migration preserves trusted wallet');}
          W.PSManagement.openStorage();await uiChoose('organize');await uiReady('box');for(let i=0;i<6;i++){const t=performance.now();await press('pagedown');await uiReady('box');samples.boxSwitchMs.push(performance.now()-t);}await press('cancel');await uiChoose('no');await uiChoose('close');await uiClosed();measurements.push(samples);
        }
        const uiMemory=[mem('5.1 UI warmed (before 100 opens)')],openMs:number[]=[];
        for(let i=0;i<100;i++){const t=performance.now();W.PSManagement.openParty();await uiReady('party');openMs.push(performance.now()-t);await press('cancel');await uiClosed();if((i+1)%25===0)uiMemory.push(mem('after '+(i+1)+' management opens'));}
        perf.management={method:'NEW 5.1 only, excluded from historical battle/frame rows; isolated MZ slots18; 0/30/1200 boxed members; 6 save/current-load/search samples, 3 real schema4->6 loads, 6 ready-barrier box-switch samples per size; full1200 state, 100 party scene lifecycles after warmup. No invented pass threshold.',measurements,uiLifecycle:{count:100,openMs,memory:uiMemory},noApprovedBudget:true};
      }catch(e:any){perf.errors=(perf.errors||[]).concat('5.1 management measurements: '+e.message);}
    }
    if(W.PSInventory){try{await toMap();inventoryFresh();perf.inventory=await inventoryLifecycle(100);}catch(error:any){perf.errors=(perf.errors||[]).concat("5.2 inventory lifecycle: "+error.message);}}
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
    const info = G.DataManager._globalInfo; const infoLength = info ? info.length : 0; const infoHad = !!info && slot in info; const infoBefore = info ? info[slot] : undefined;
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
      if (info) { if (infoHad) info[slot] = infoBefore; else { delete info[slot]; info.length = infoLength; } } // the in-memory copy as well: a later save in this process writes it
      await sleep(1500); // a late write would show up here
      cleanedUp = !fs.existsSync(file) && (globalBefore ? fs.readFileSync(globalFile).equals(globalBefore) : !fs.existsSync(globalFile))
        && (!info || (infoHad ? info[slot] === infoBefore : !(slot in info) && info.length === infoLength)); // the in-memory copy too
    }
    report.saveLocation = { chosen: G.PSSaveLocation, dir, slot, occupied, saveCode: code, writtenByThisRun: written, cleanedUp, error, gameDir };
    results.push({ id: "SL1 save location: a fresh slot is written by this run (saveGame code 0) and removed again", status: !occupied && code === 0 && written && cleanedUp ? "pass" : "fail", ms: 0 });
  }

  // B5: actual MZ persistence and normal application lifecycle, driven by service calls.
  // Disk assertions complement the VM's exact baseSaveGame/baseMake counters; no hardware input is claimed.
  function progressionContent(regional: boolean): any {
    const B = api(), read = (name: string) => JSON.parse(fs.readFileSync(path.join(gameDir, "content/sample", name), "utf8"));
    const inputs: any = {manifest: read("manifest.json"), sources: read("sources.json"), species: read("species.json"), overlays: read("overlays.json")};
    for (const [key, file] of [["grants", "grants.json"], ["settings", "settings.json"], ["items", "items.json"], ["shops", "shops.json"]]) if (fs.existsSync(path.join(gameDir, "content/sample", file))) inputs[key] = read(file);
    if (regional) inputs.regionalDex = {source: "author-placeholder", regions: [{id: 0, nameKey: "region.test", species: inputs.species.filter((sp: any) => !sp.form).map((sp: any) => sp.id)}]};
    const compiled = B.contentCompile.compileContent(inputs); assert(compiled.ok, JSON.stringify(compiled.errors));
    const assembled = B.contentRuntime.assembleContent(compiled.data, B.dex.createDexLookup()); assert(!assembled.errors.length, JSON.stringify(assembled.errors));
    return assembled.content;
  }
  async function settledSave(slot: number): Promise<void> {
    const base = G.StorageManager.saveObject, writes: Promise<any>[] = [];
    G.StorageManager.saveObject = function (this: any, ...args: any[]) { const promise = base.apply(this, args); writes.push(Promise.resolve(promise)); return promise; };
    try { await G.DataManager.saveGame(slot); await Promise.all(writes); } finally { G.StorageManager.saveObject = base; }
  }
  function saveFileHashes(): any {
    const dir = G.StorageManager.fileDirectoryPath();
    return Object.fromEntries(fs.readdirSync(dir).filter((name: string) => fs.statSync(path.join(dir, name)).isFile()).sort().map((name: string) => [name, nodeRequire("crypto").createHash("sha256").update(fs.readFileSync(path.join(dir, name))).digest("hex")]));
  }
  async function runProgressionData() {
    await toMap();
    await scenario("B53-H01 real setupNewGame: national and regional layouts", async () => {
      const layouts: any[] = [];
      for (const regional of [false, true]) {
        W.PSFlow._content = progressionContent(regional); G.DataManager.setupNewGame();
        const g = game(); eq(g.schema, 7, "current save schema"); eq(g.dex.hasDex, false, "new player has no dex entitlement");
        eq(g.dex.unlocked, regional ? [true, false] : [true], "exact new-game region entitlement");
        eq(g.dex.view, {region: regional ? 0 : -1, indices: regional ? [0, 0] : [0], mode: 0}, "correct default viewing state");
        eq(g.dex.layoutIdentity, W.PSFlow.content().regionalDex.layoutIdentity, "layout came from compiled content");
        layouts.push({regional, dex: clone(g.dex), identity: W.PSFlow.content().meta});
      }
      return {input: "actual MZ setupNewGame + normal app/content pipeline", layouts};
    });
    await scenario("B53-H02 real schema6 load: all metadata retained then current7 save", async () => {
      await toMap(); fresh(); const B = api();
      const six = clone(game()); six.schema = 6; six.dex = {seen: clone(six.dex.seen), owned: clone(six.dex.owned)};
      for (const member of B.storage.allMembers(six)) {delete member.evolutionReadiness; delete member.cannotTrade;}
      six.party[0].readyToEvolve = true; six.party[0].abilityIndex = null; six.party[0].effectiveAbilityIndex = null; six.party[0].friendship = 256;
      six.appliedBattles["B53-history"] = {hash: "a".repeat(64)};
      const original = G.$gameSystem._psGame, fixtureContents = G.DataManager.makeSaveContents(); G.$gameSystem._psGame = six;
      try {await G.StorageManager.saveObject("file54", fixtureContents);}
      finally {G.$gameSystem._psGame = original;}
      // The ordinary save gate correctly refuses6; author a test-only MZ fixture through the underlying serializer instead.
      await G.DataManager.loadGame(54);
      assert(!G.$gameSystem._psSaveError, JSON.stringify(G.$gameSystem._psSaveError)); eq(G.$gameSystem._psSaveInfo.from, 6, "actual loader migrated6");
      const g = game(), m = g.party[0]; eq([g.schema, m.readyToEvolve, m.evolutionReadiness, m.cannotTrade, m.abilityIndex, m.effectiveAbilityIndex, m.friendship], [7, true, "known", false, null, null, 256], "precise migration defaults");
      eq(g.appliedBattles, six.appliedBattles, "raw ledger unchanged");
      m.evolutionReadiness = "unknown"; m.cannotTrade = true; m.firstMoves = ["tackle", "gust", "tackle", "roost", "rest", "tackle"];
      const boxedMember = clone(m); boxedMember.id = "B53-BOX"; g.storage.boxes[39].slots[29] = boxedMember;
      await settledSave(54); await settledSave(55);
      fs.writeFileSync(path.join(path.dirname(OUT || "."), "ps-flow-expected-progression-data.json"), JSON.stringify({state: clone(g), slots: [54, 55], regional: true, savedHashes: saveFileHashes()}));
      return {input: "MZ serializer-authored schema6 fixture -> real loadGame -> saveGame7", sourceFixture: six.schema, layout: g.dex.layoutIdentity, preserved: [m.id, m.firstMoves, m.friendship, m.abilityIndex], lastBox: [39, 29], slots: [54, 55]};
    });
    await scenario("B53-H05 legal7 then corruption: menu/direct/autosave reject with zero disk writes", async () => {
      await G.DataManager.loadGame(54); assert(!G.$gameSystem._psSaveError, "legal7 was actually loaded");
      const good = clone(game()), hashes = saveFileHashes(), outcomes: any[] = [];
      for (const kind of ["bad-R", "bad-reference", "bad-layout"]) {
        G.$gameSystem._psGame = clone(good);
        if (kind === "bad-R") {game().party[0].readyToEvolve = false; game().party[0].evolutionReadiness = "unknown";}
        if (kind === "bad-reference") game().party[0].species = "missing-species";
        if (kind === "bad-layout") game().dex.layoutIdentity = "0".repeat(64);
        const damaged = JSON.stringify(game()), save = G.StorageManager.saveObject, make = G.DataManager.makeSaveContents;
        let storageCalls = 0, makeCalls = 0;
        G.StorageManager.saveObject = function (this: any, ...args: any[]) {storageCalls++; return save.apply(this, args);};
        G.DataManager.makeSaveContents = function (this: any, ...args: any[]) {makeCalls++; return make.apply(this, args);};
        try {
          eq(G.$gameSystem.isSaveEnabled(), false, "actual menu permission is masked");
          for (const slot of [54, 55, 56, 0]) {let refused = false; try {await G.DataManager.saveGame(slot);} catch {refused = true;} assert(refused, `direct/autosave destination ${slot} rejected`);}
          let menuFailed = 0, autoFailed = 0;
          G.Scene_Save.prototype.executeSave.call({onSaveSuccess: () => {throw new Error("bad save unexpectedly succeeded");}, onSaveFailure: () => {menuFailed++;}}, 55);
          G.Scene_Base.prototype.executeAutosave.call({onAutosaveSuccess: () => {throw new Error("bad autosave unexpectedly succeeded");}, onAutosaveFailure: () => {autoFailed++;}});
          await waitFor(() => menuFailed === 1 && autoFailed === 1, "actual menu save/autosave failure callbacks");
          eq([storageCalls, makeCalls], [0, 0], "save checks reject before serialization/storage entries");
          let snapshotRefused = false; try {make.call(G.DataManager);} catch {snapshotRefused = true;} assert(snapshotRefused, "direct makeContents also rejects before underlying snapshot");
          eq(saveFileHashes(), hashes, "loaded source, occupied target, global and absent target unchanged");
          eq(JSON.stringify(game()), damaged, "no automatic repair"); outcomes.push({kind, storageCalls, makeEntryCalls: makeCalls, hashes: saveFileHashes(), missingTarget: !G.StorageManager.exists("file56")});
        } finally {G.StorageManager.saveObject = save; G.DataManager.makeSaveContents = make;}
      }
      G.$gameSystem._psGame = good;
      assert(G.$gameSystem.isSaveEnabled(), "restoring legal memory re-enables the same gate");
      eq(saveFileHashes(), hashes, "source/target/global remain original through the restart boundary");
      return {input: "actual MZ menu permission, Scene_Save.executeSave and Scene_Base.executeAutosave with programmatic completion callbacks, plus direct saveGame", note: "exact base function counters separately VM-tested; actual host measures serialization and disk entry zero", outcomes};
    });
    await scenario("B53-H03 actual heal/preserve and empty legacy save load", async () => {
      const B = api(), content = W.PSFlow.content(), member = clone(game().party[0]); member.readyToEvolve = true; member.evolutionReadiness = "unknown";
      eq([B.heal.healMember(member, content).readyToEvolve, B.heal.healMember(member, content).evolutionReadiness], [false, "known"], "ordinary heal clears both");
      const preserved = B.heal.healMember(member, content, {preserveReadyToEvolve: true}); eq([preserved.readyToEvolve, preserved.evolutionReadiness], [true, "unknown"], "box heal preserves both");
      const sys = G.$gameSystem, original = sys._psGame; delete sys._psGame;
      // Invoke the actual extraction lifecycle with MZ objects, no disk save of the missing state.
      const normal = {system: sys, screen: G.$gameScreen, timer: G.$gameTimer, switches: G.$gameSwitches, variables: G.$gameVariables, selfSwitches: G.$gameSelfSwitches, actors: G.$gameActors, party: G.$gameParty, map: G.$gameMap, player: G.$gamePlayer};
      G.DataManager.extractSaveContents(normal); assert(!G.$gameSystem._psSaveError, "empty legacy host initialized"); eq(game().schema, 7, "empty host is7"); eq(game().party, [], "never invent members");
      G.$gameSystem._psGame = original;
      return {input: "real host heal API and DataManager.extractSaveContents", emptyCreated: G.$gameSystem._psSaveInfo?.created};
    });
    await shot("B53-progression-data");
  }

  async function runCapabilitySeam() {
    await toMap();
    await scenario("C53-01 real scene: item/level friendship and companion seal; original battle result/save shape", async () => {
      fresh();
      const g = game(), id = g.party[0].id;
      g.party[0].hp = 50; g.party[0].friendship = 99; g.party[0].exp = E.minExp("parabolic", 51) - 1;
      W.PSFlow.openBattle({ battleId: "host-capability-1", kind: "wild", foes: [{ species: "pidgey", level: 5 }], seq: 1 });
      await inMode("main");
      const handle = battle()._session, app = W.PSFlow.app();
      await choose(/^Bag/); await inMode("bag"); await choose(/^Potion\b/i); await inMode("party"); await choose(/Charizard/i); await inMode("main");
      eq(handle.party.find((m: any) => m.id === id).friendship, 100, "actual executed item changes working friendship");
      await choose(/^Bag/); await inMode("bag"); await choose(/Master Ball/i); await inMode("learn"); await choose(/Forget roost/i); await inMode("end");
      await shot("C53-01-capability-end"); await finishBattle();
      const evidence = app.battleEvidenceSnapshot(handle);
      assert(evidence && evidence.rawHash === api().state.resultHash(handle.result()), "app sealed original raw hash");
      eq(evidence.friendship[id].changes.map((c: any) => c.method), ["battleitem", "levelup"], "ordered real triggers");
      eq(evidence.friendship[id].current, 104, "threshold order respected");
      assert(evidence.records.some((r: any) => r.kind === "appearance"), "initial appearance before UI take retained");
      assert(!("friendship" in handle.result().members[id]), "no new protocol member-patch field");
      eq(game().party.find((m: any) => m.id === id).friendship, 99, "this capability batch does not implement persistent companion consumption");
      await G.DataManager.saveGame(53);
      fs.writeFileSync(path.join(path.dirname(OUT || "."), "ps-flow-expected-capability.json"), JSON.stringify({ state: clone(game()), slot: 53, rawHash: evidence.rawHash }));
      return { input: "real scene, synthetic DOM keydown/keyup", rawHash: evidence.rawHash, records: evidence.records.length, friendship: evidence.friendship[id], saveSlot: 53, persistentCompanion: false };
    });
    await scenario("C53-02 real host direct application: seal failure cannot lose capture/XP or replay", async () => {
      fresh(); const B = api(), content = W.PSFlow.content(), factory = B.composition.createBattleSessionFactory({ content: () => content, seed: () => [1,2,3,4] });
      let seals = 0; factory.evidence = () => { seals++; throw new Error("injected companion seal failure"); };
      const app = new B.app.GameApplication({ state: { read: () => game(), replace: (next: any) => { G.$gameSystem._psGame = next; } }, sessions: factory, projection: { project: () => {} }, content: () => ({ content }), random: seeded(1), clock: () => 0, itemWorld: () => ({ mapId: G.$gameMap.mapId() }) }, { receivingProfile: { mode: 1, naming: 1 } });
      const before = clone(game()), request = { battleId: "host-capability-fault", kind: "wild", foes: [{ species: "pidgey", level: 5 }], seq: 2 }, handle = await app.startBattle(request);
      await handle.throwBall("masterball"); const result = app.finishBattle(handle, request);
      eq(result.commit, "applied", "primary applied despite optional fault"); assert(game().party.length === before.party.length + 1 && game().party[0].exp > before.party[0].exp, "capture/XP preserved");
      eq(app.finishBattle(handle, request).commit, "already-applied", "duplicate no-op"); eq(seals, 1, "no late companion backfill"); eq(app.battleEvidenceSnapshot(handle), null, "failed companion never trusted");
      return { input: "direct app API in actual NW/MZ host", commit: result.commit, diagnostics: result.diagnostics, seals };
    });
    await scenario("C53-03 real host engine: precise substitute loss uses internal value seam", async () => {
      const B = api();
      const make = (name: string, species: string, level: number, moves: string[]) => ({ name, species, level, moves, gender: "M", happiness: 70, ability: species === "Charizard" ? "Blaze" : "Immunity", nature: "Hardy", ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 }, evs: {} });
      const driver = await B.gateway.BattleGateway.create({ formatid: "gen8rpgcustomgame", seed: [1,2,3,4], wild: true, players: [{ name: "Player", team: [make("P1", "Charizard", 100, ["Substitute"])] }, { name: "Wild", team: [make("F1", "Snorlax", 50, ["Surging Strikes"])] }] });
      await driver.choose("p1", "team 1"); await driver.choose("p2", "team 1"); driver.drain(); driver.drainObservations();
      await driver.choose("p1", "move 1"); await driver.choose("p2", "move 1"); const batch = driver.drainObservations(), hits = batch.records.filter((r: any) => r.kind === "hit" && r.domain === "substitute");
      eq(hits.map((h: any) => h.loss), [22,22,24], "actual three substitute losses"); assert(hits.every((h: any) => h.target.id === "P1" && h.source.id === "F1"), "stable identities"); eq(batch.issues, [], "complete supported host interval");
      return { input: "direct controlled engine API in actual NW host", losses: hits.map((h: any) => h.loss), playerHp: driver.readState("p1")[0].hp };
    });
  }

  async function verifySave() {
    if (EXPECTED_DIR && fs.existsSync(path.join(EXPECTED_DIR, "ps-flow-expected-progression-data.json"))) {
      await scenario("B53-V1 independent NW restart: good source and target remain readable7", async () => {
        const expected = readExpected("ps-flow-expected-progression-data.json"); W.PSFlow._content = progressionContent(expected.regional);
        eq(saveFileHashes(), expected.savedHashes, "original producing source/target/global bytes reached this new process unchanged");
        const loaded: any[] = [];
        for (const slot of expected.slots) {
          G.DataManager.setupNewGame(); await G.DataManager.loadGame(slot); assert(!G.$gameSystem._psSaveError, JSON.stringify(G.$gameSystem._psSaveError));
          eq(game(), expected.state, "fresh process rereads exact primary state and schema7 metadata");
          assert(!game().battleEvidence && api().storage.allMembers(game()).every((m: any) => (m.evolutionReadiness === "known" || m.readyToEvolve && m.evolutionReadiness === "unknown")), "legal R state and no transient companion"); loaded.push(slot);
        }
        eq(saveFileHashes(), expected.savedHashes, "reading both good slots did not write any original file");
        return {input: "new NW process, real MZ load API", slots: loaded, layout: game().dex.layoutIdentity, identity: W.PSFlow.content().meta};
      });
      return;
    }
    if (EXPECTED_DIR && fs.existsSync(path.join(EXPECTED_DIR, "ps-flow-expected-capability.json"))) {
      await scenario("C53-V1 real restart: isolated MZ save keeps primary state and no transient companion", async () => {
        const expected = readExpected("ps-flow-expected-capability.json"); G.DataManager.setupNewGame(); await G.DataManager.loadGame(expected.slot);
        eq(game(), expected.state, "primary save identical across fresh NW process"); assert(!game().battleEvidence && api().storage.allMembers(game()).every((m: any) => (m.evolutionReadiness === "known" || m.readyToEvolve && m.evolutionReadiness === "unknown")), "no transient packet and persistent schema7 R combinations remain legal");
        eq(game().appliedBattles["host-capability-1"].hash, expected.rawHash, "original raw result ledger retained"); return { slot: expected.slot, input: "MZ load API in fresh NW process", primaryUnchanged: true };
      });
      return;
    }
    await scenario("V4 real restart: the step 4 save migrated and saved by the previous process loads as schema 6, without migrating again", async () => {
      const expected = readExpected("ps-flow-expected-t31.json");
      G.DataManager.setupNewGame();
      await G.DataManager.loadGame(14);
      eq([G.$gameSystem._psSaveError, G.$gameSystem._psSaveInfo.from, G.$gameSystem._psSaveInfo.migrated], [undefined, api().state.GAME_SCHEMA, false], "a schema 6 save");
      eq(game(), expected.state, "the migrated state, identical");
      return { party: game().party.length };
    });
    await scenario("V3 real restart (play-through): party, boxes, bag, growth, claims, money and the map position load identically in a fresh process, and play continues (an encounter, a commit, no duplicate id)", async () => {
      const expected = readExpected("ps-flow-expected-t26.json");
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
      const ids = [...game().party, ...boxed()].map((m: any) => m.id); eq(new Set(ids).size, ids.length, "no duplicate id");
      return { seq: G.$gameSystem._psBattleSeq, party: game().party.length, boxes: boxed().length };
    });
    await scenario("V2 real restart (slice): the new-game save loads identically in a fresh process, the claim stays claimed, MZ gold/items as saved", async () => {
      const expected = readExpected("ps-flow-expected-t15.json");
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
      const expected = readExpected("ps-flow-expected.json");
      G.DataManager.setupNewGame();
      await G.DataManager.loadGame(1);
      eq(game(), expected, "state after a fresh process loads the save");
      const id = Object.keys(game().appliedBattles)[0];
      assert(!!id, "an applied battle is recorded");
      return { applied: Object.keys(game().appliedBattles), party: game().party.length };
    });
  }

  /** A cold real-host check: empty content uses no external battle data, including for an old saved party. */
  async function runEmptySource() {
    const B = nodeRequire("./js/engine/build/engine.cjs");
    const dataModules = () => Object.keys(nodeRequire.cache).filter((p) => p.includes("/showdown/dist/data/"));
    eq(dataModules().length, 0, "cold MZ host before source consumption");
    const contentFile = path.join(gameDir, "data/framework/content.json");
    const realRead = fs.readFileSync;
    const original = JSON.parse(realRead(contentFile, "utf8"));
    let document = original;
    let writes = 0;
    const realSave = G.StorageManager.saveObject;
    fs.readFileSync = function (file: any, ...args: any[]) { return String(file) === contentFile ? JSON.stringify(document) : realRead.call(this, file, ...args); };
    G.StorageManager.saveObject = function () { writes++; throw new Error("unexpected storage write in source test"); };
    try {
      for (const sourceMode of ["valid", "denied", "unregistered", "no-check", "malformed"]) {
        document = clone(original); document.species = []; document.grants = [];
        const sd = document.sources.find((s: any) => s.kind === "showdown");
        if (sourceMode === "denied") sd.usageCheck.decision = "not-allowed";
        if (sourceMode === "unregistered") document.sources = document.sources.filter((s: any) => s !== sd);
        if (sourceMode === "no-check") delete sd.usageCheck;
        if (sourceMode === "malformed") sd.usageCheck = { decision: "internal-use" };
        W.PSFlow.stateReplaced(); W.PSFlow._app = null; W.PSFlow._content = null; W.PSFlow._dex = null;
        G.DataManager.setupNewGame();
        const before = clone(game());
        let error: string | undefined;
        try {
          W.PSFlow.app();
          const content = W.PSFlow.content();
          eq(content.meta.id, original.contentId, "the actual author content, not an empty fallback");
          eq(Object.keys(content.species), [], "empty species");
        } catch (e: any) { error = String(e.message); }
        eq(!!error, sourceMode === "malformed", "only structurally valid empty documents are usable");
        eq(game(), before, "content/app does not replace state");
        let oldPartyError: string | undefined;
        if (!error) {
          G.$gameSystem._psGame = B.state.newGame({ party: STEP4_FULL.party.map((m: any) => ({ ...m, species: m.species.toLowerCase(), form: 0 })), money: 0 });
          const oldState = clone(game());
          W.PSFlow.openBattle({ kind: "wild", foes: [{ species: "pidgey", level: 3 }], seq: 1, battleId: "empty-source-old" });
          try { await W.PSFlow.begin(); } catch (e: any) { oldPartyError = String(e.message); }
          assert(!!oldPartyError && oldPartyError.includes("not in the content"), "old party refuses without a move query");
          eq(game(), oldState, "a refused old party stays intact");
          W.PSFlow.stateReplaced();
        }
        eq(dataModules().length, 0, "still cold after empty content/app/old-party"); eq(writes, 0, "no storage writes");
        results.push({ id: "ES " + sourceMode, status: "pass", detail: { before: 0, after: dataModules().length, writes, stateUnchanged: true, error, oldPartyError } });
      }
      document = original; W.PSFlow._app = null; W.PSFlow._content = null; W.PSFlow._dex = null;
      const content = W.PSFlow.content();
      eq(Object.keys(content.species).length, original.species.length, "lawful nonempty content still assembles");
      assert(dataModules().length > 0, "positive control actually loaded engine data");
      results.push({ id: "ES lawful nonempty control", status: "pass", detail: { before: 0, after: dataModules().length, writes } });
    } finally { fs.readFileSync = realRead; G.StorageManager.saveObject = realSave; }
  }

  const startAt = G.Scene_Boot.prototype.start;
  G.Scene_Boot.prototype.start = function (this: any) {
    if (mode === "empty-source") {
      // Reactor's boot calls setupNewGame before the delayed driver runs. Supply the empty author document before
      // that real lifecycle starts; otherwise the normal sample has already lawfully warmed Showdown's cache.
      const file = path.join(gameDir, "data/framework/content.json");
      const read = fs.readFileSync;
      const empty = JSON.parse(read(file, "utf8"));
      empty.species = []; empty.grants = []; empty.sources = empty.sources.filter((s: any) => s.kind !== "showdown");
      fs.readFileSync = function (f: any, ...args: any[]) { return String(f) === file ? JSON.stringify(empty) : read.call(this, f, ...args); };
      try { startAt.call(this); } finally { fs.readFileSync = read; }
    } else startAt.call(this);
    setTimeout(async () => {
      try { if (mode === "progression-data") await runProgressionData(); else if (mode === "capability") await runCapabilitySeam(); else if (mode === "empty-source") await runEmptySource(); else if (mode === "verify-save") await verifySave(); else if (mode === "matrix") await runMatrixMode(); else if (mode === "perf") await runPerf(); else if (mode === "leak") await runLeakBisect(); else if (mode === "leakhunt") await runLeakHunt(); else if (mode === "heap") await runHeapSnapshot(); else if (mode === "saveloc") await runSaveLocation(); else if(mode === "management") await runManagementUI(); else if(mode === "inventory") await runInventoryUI(); else if(mode === "driver-selftest") await runDriverSelftest(); else { await runAll(); await runManagementUI(); await runInventoryUI(); } }
      catch (e: any) { results.push({ id: "driver", status: "fail", error: String(e && e.stack || e) }); }
      try { report.contentIdentity = W.PSFlow.content().meta; } catch (e) { report.contentIdentity = { error: String(e) }; }
      try { report.logTail = W.PSFlow.logger ? W.PSFlow.logger.tail(60) : null; } catch (e) { report.logTail = { error: String(e) }; } // redacted, bounded session diagnostics
      report.overall = results.every((r) => r.status === "pass") ? "pass" : "fail";
      if (OUT) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(report, null, 2)); }
      if (argv.includes("--ps-flow-quit")) G.nw.App.quit();
    }, 500);
  };
})();
