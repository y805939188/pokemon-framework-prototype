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
  // Backend contract modes drive their own answers; only the formal UI mode uses the default automatic presenter.
  if(mode!=="evolution-ui"&&mode!=="trade-ui"&&W.PSEvolution)W.PSEvolution.automatic=false;

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
      const failure: any = { id, status: "fail", ms: Date.now() - t0, error: String(e && e.message || e), mapDiag, managementDiag: W.PSManagement?.current(), evolutionDiag: W.PSEvolution?.current(), inventoryDiag: W.PSInventory?.current(), diag: b ? { mode: b._mode, failure: String(b._failure), log: b._log._lines, status: b._status._lines, queue: b._queue.slice(0, 5) } : null };
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

  /** Test-only authoring of old/damaged MZ files. The normal player save gate remains strict. */
  async function writeHostFixture(slot: number, frameworkState: any): Promise<void> {
    const original = G.$gameSystem._psGame;
    const hadError = Object.hasOwn(G.$gameSystem, "_psSaveError"), error = G.$gameSystem._psSaveError;
    try {
      delete G.$gameSystem._psSaveError;
      G.$gameSystem._psGame = api().state.newGame({party: [], money: 0, content: W.PSFlow.content()});
      const envelope = G.DataManager.makeSaveContents();
      if (frameworkState === undefined) delete envelope.system._psGame;
      else envelope.system._psGame = frameworkState;
      await G.StorageManager.saveObject(`file${slot}`, envelope);
    } finally {
      G.$gameSystem._psGame = original;
      if (hadError) G.$gameSystem._psSaveError = error;
      else delete G.$gameSystem._psSaveError;
    }
  }

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
      await writeHostFixture(2, legacy);
      const rc1 = "test-fixture-authored";
      G.$gameSystem._psGame = { diverged: true };
      const lc1 = await G.DataManager.loadGame(2);
      assert(!G.$gameSystem._psSaveError, "a schema 1 state loads without error");
      eq([game().schema, game().party[1].status, game().party[1].statusCount, game().party[2].status, game().party[2].statusCount], [api().state.GAME_SCHEMA, "psn", 0, "slp", undefined], "migrated on load");
      eq(game().party.map((m: any) => [m.species, m.form]), [["charizard", 0], ["blastoise", 0], ["venusaur", 0]], "Showdown names mapped to content id + form through the content (D5-3)");
      eq([G.$gameSystem._psSaveInfo.from, G.$gameSystem._psSaveInfo.to, G.$gameSystem._psSaveInfo.migrated], [1, api().state.GAME_SCHEMA, true], "migration recorded");
      // a state written by a newer build, and a damaged one
      for (const [slot, doc, code] of [[3, { ...clone(game()), schema: 9 }, "unknown-version"], [4, "not a state", "corrupt"]] as [number, any, string][]) {
        await writeHostFixture(slot, doc);
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
        eq(g1.dex, { ...g0.dex, seen: ["charmander"], owned: ["charmander"] }, "grant updates seen/owned and preserves all current dex metadata");
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
      await writeHostFixture(6, undefined);
      G.$gameSystem._psGame = { diverged: true };
      await G.DataManager.loadGame(6);
      const info = G.$gameSystem._psSaveInfo;
      eq(info && info.created, "empty", "reported as created on load");
      eq(game(), nodeRequire("./js/engine/build/engine.cjs").state.newGame({ party: [], money: 0, content: W.PSFlow.content() }), "the whole formal empty state: no members, boxes, items, money, dex entries, battles or claims");
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
      await writeHostFixture(13, clone(sample)); // test-authored step4 file; normal schema7 saving stays strict
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
      await writeHostFixture(15, clone(bad));
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
    const healthy=clone(game()),raw:any={...healthy,schema:4,boxes:Array.from({length:1201},(_,i)=>({...api().state.protocolMember(healthy.party[0]),form:healthy.party[0].form,id:'T1-'+i}))};raw.party=healthy.party.map((m:any)=>({...api().state.protocolMember(m),form:m.form}));delete raw.storage;delete raw.player;delete raw.nextMemberOrdinal;raw.bag=I6.rawBagOf(healthy);delete raw.inventory;delete raw.badges;raw.dex={seen:clone(healthy.dex.seen),owned:clone(healthy.dex.owned)};/* author a schema4 payload inside an envelope captured while the current7 state is still valid */const bytes=JSON.stringify(raw),contents=G.DataManager.makeSaveContents();contents.system._psGame=raw;G.DataManager.extractSaveContents(contents);eq(G.$gameSystem._psSaveError.code,'capacity-exceeded','actual migration rejected');
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

  const itemEvolution=()=>W.PSEvolution?.current();
  async function itemEvolutionReady(layer?:string){await waitFor(()=>itemEvolution()?.ready&&(!layer||itemEvolution().layer===layer)&&!G.SceneManager.isSceneChanging(),'item evolution '+(layer??''));}
  async function itemEvolutionChoose(key:string){await itemEvolutionReady('learning');let n=0;while(itemEvolution().lesson.rows[itemEvolution().lesson.cursor]?.key!==key&&n++<60)await press('down');eq(itemEvolution().lesson.rows[itemEvolution().lesson.cursor]?.key,key,'item learning choice');await press('ok');await itemEvolutionReady();}
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
    try{W.PSFlow.setLanguage('zh');const id=game().party[0].id;W.PSInventory.useItem('rarecandy',id,1);await itemEvolutionReady('learning');await itemEvolutionChoose('yes');await itemEvolutionChoose('0');assert(itemEvolution().text.some((s:string)=>s.includes('不能替换')),'HM protected visible');await shot('U52-learning-hm-zh');await itemEvolutionChoose('1');await itemEvolutionChoose('close');await itemEvolutionChoose('yes');await press('cancel');await itemEvolutionReady('learning');eq(itemEvolution().lesson.rows[0].key,'yes','give-up confirms');await itemEvolutionChoose('no');await itemEvolutionChoose('new');await itemEvolutionChoose('yes');eq(game().party[0].level,51,'level once');eq(game().party[0].moves[1].id,'slash','selected move learned');eq(game().party[0].moves[0].id,'flamethrower','HM preserved');eq(B.inventory.aggregateBag(game().inventory).rarecandy,1,'single rare candy');await shot('U52-learning-result-zh');await itemEvolutionChoose('close');await itemEvolutionReady('item-result');await press('ok');await inventoryClosed();}finally{W.PSFlow.content=realContent;W.PSFlow._app=null;W.PSFlow.setLanguage(null);}
   });
   await scenario('U52-06/P52-27/41/43 real isolated Map006 author events, variables, BoxLink obtain/remove',async()=>{
    await toMap();inventoryFresh();await toMapId(6,8,10);await shot('U52-Map006');await startMapEvent(4);await dismissMessages();await waitFor(()=>!G.$gameMap.isEventRunning(),'BoxLink grant event ends');assert(W.PSFlow.app().hasBoxLink(),'actual inventory link');await startMapEvent(5);await waitFor(()=>!G.$gameMap.isEventRunning(),'BoxLink remove event ends');assert(!W.PSFlow.app().hasBoxLink(),'removing link loses capability');await startMapEvent(6);await dismissMessages();await waitFor(()=>!G.$gameMap.isEventRunning(),'badge event ends');eq(G.$gameVariables.value(2),true,'badge query variable');await startMapEvent(7);await inventoryReady('bag');await press('cancel');await inventoryClosed();await dismissMessages();await waitFor(()=>!G.$gameMap.isEventRunning(),'selection event ends');eq([G.$gameVariables._data[3],G.$gameVariables.value(3)],['',0],'cancel writes the empty ID raw (D-05: MZ public read of an empty value is 0)');await startMapEvent(2);await inventoryReady('bag');assert(G.$gameMap._interpreter.isRunning(),'actual interpreter waits for this bag');await press('cancel');await inventoryClosed();await waitFor(()=>!G.$gameMap.isEventRunning(),'bag wait ends');
   });
   await scenario('U52-07/P52-30/34 real load-generation interruption rejects old pending, new UI stays usable',async()=>{
    await toMap();inventoryFresh();const realContent=W.PSFlow.content,c=clone(realContent());c.species.Charizard.learnset={51:['Slash']};c.moves={...c.moves,Slash:{id:'slash',name:'Slash',pp:20}};W.PSFlow.content=()=>c;W.PSFlow._app=null;
    try{const before=clone(game()),h=W.PSInventory.useItem('rarecandy',game().party[0].id);await itemEvolutionReady('learning');W.PSFlow.app().stateReplacedByHost();await inventoryClosed();eq(h.result.status,'refused','old UI invalid');eq(game(),before,'old callback no write');W.PSInventory.showBag();await inventoryReady('bag');await press('cancel');await inventoryClosed();assert(!W.PSFlow.app().saveBlocked,'no save lock');}finally{W.PSFlow.content=realContent;W.PSFlow._app=null;}
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
          const current=clone(game()),legacy:any={...clone(current),schema:4,bag:B.inventory.aggregateBag(current.inventory),party:current.party.map((m:any)=>({...B.state.protocolMember(m),form:m.form})),boxes:boxed(current).map((m:any)=>({...B.state.protocolMember(m),form:m.form}))};delete legacy.inventory;delete legacy.badges;delete legacy.storage;delete legacy.player;delete legacy.nextMemberOrdinal;legacy.dex={seen:clone(current.dex.seen),owned:clone(current.dex.owned)};
          for(let i=0;i<3;i++){await writeHostFixture(18,clone(legacy));const t=performance.now();await G.DataManager.loadGame(18);samples.migration4to6Ms.push(performance.now()-t);eq([G.$gameSystem._psSaveInfo.from,G.$gameSystem._psSaveInfo.to,G.$gameSystem._psSaveInfo.migrated],[4,api().state.GAME_SCHEMA,true],'actual timed legacy migration');eq(boxed().length,count,'migration count');eq(B.inventory.aggregateBag(game().inventory),legacy.bag,'timed migration retains all legacy bag quantities');eq(game().money,legacy.money,'timed migration preserves trusted wallet');}
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
  function progressionContent(regional: boolean, configure?: (inputs: any) => void): any {
    const B = api(), read = (name: string) => JSON.parse(fs.readFileSync(path.join(gameDir, "content/sample", name), "utf8"));
    const inputs: any = {manifest: read("manifest.json"), sources: read("sources.json"), species: read("species.json"), overlays: read("overlays.json")};
    for (const [key, file] of [["grants", "grants.json"], ["settings", "settings.json"], ["items", "items.json"], ["shops", "shops.json"]]) if (fs.existsSync(path.join(gameDir, "content/sample", file))) inputs[key] = read(file);
    if (regional) inputs.regionalDex = {source: "author-placeholder", regions: [{id: 0, nameKey: "region.test", species: inputs.species.filter((sp: any) => !sp.form).map((sp: any) => sp.id)}]};
    configure?.(inputs);
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
    const progressionRegional = arg("ps-progression-layout") !== "national";
    report.progressionLayout = progressionRegional ? "regional" : "national";
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
      W.PSFlow._content = progressionContent(progressionRegional);
      await toMap(); fresh(); const B = api();
      const six = clone(game()); six.schema = 6; six.dex = {seen: clone(six.dex.seen), owned: clone(six.dex.owned)};
      for (const member of B.storage.allMembers(six)) {delete member.evolutionReadiness; delete member.cannotTrade;}
      six.party[0].readyToEvolve = true; six.party[0].abilityIndex = null; six.party[0].effectiveAbilityIndex = null; six.party[0].friendship = 256;
      six.appliedBattles["B53-history"] = {hash: "a".repeat(64)};
      const original = G.$gameSystem._psGame, fixtureContents = G.DataManager.makeSaveContents(); fixtureContents.system._psGame = six;
      try {await G.StorageManager.saveObject("file54", fixtureContents);}
      finally {G.$gameSystem._psGame = original;}
      const sourceFile = path.join(G.StorageManager.fileDirectoryPath(), "file54.rmmzsave"), sourceBytes = fs.readFileSync(sourceFile);
      const sourceSha = nodeRequire("crypto").createHash("sha256").update(sourceBytes).digest("hex");
      fs.writeFileSync(path.join(path.dirname(OUT || "."), "schema6-source.rmmzsave"), sourceBytes);
      fs.writeFileSync(path.join(path.dirname(OUT || "."), "schema6-document.json"), JSON.stringify(six));
      // The ordinary save gate correctly refuses6; author a test-only MZ fixture through the underlying serializer instead.
      await G.DataManager.loadGame(54);
      assert(!G.$gameSystem._psSaveError, JSON.stringify(G.$gameSystem._psSaveError)); eq(G.$gameSystem._psSaveInfo.from, 6, "actual loader migrated6");
      eq(nodeRequire("crypto").createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex"), sourceSha, "loading/migrating left the original schema6 bytes unchanged");
      const g = game(), m = g.party[0]; eq([g.schema, m.readyToEvolve, m.evolutionReadiness, m.cannotTrade, m.abilityIndex, m.effectiveAbilityIndex, m.friendship], [7, true, "known", false, null, null, 256], "precise migration defaults");
      eq(g.appliedBattles, six.appliedBattles, "raw ledger unchanged");
      m.evolutionReadiness = "unknown"; m.cannotTrade = true; m.firstMoves = ["tackle", "gust", "tackle", "roost", "rest", "tackle"];
      const boxedMember = clone(m); boxedMember.id = "B53-BOX"; g.storage.boxes[39].slots[29] = boxedMember;
      // Normal MZ encoding must consume the verified owned data, never raw realm hooks or a live game reference.
      Object.defineProperty(g.appliedBattles, "constructor", {value: {hash: "b".repeat(64)}, enumerable: true, configurable: true, writable: true});
      const snapshotExpected = clone(g), foreign = nodeRequire("vm").runInNewContext("const g=JSON.parse(text);let calls=0;Object.defineProperty(Array.prototype,Symbol.toStringTag,{get(){calls++;throw Error('raw tag hook executed');},configurable:true});Object.defineProperty(Object.prototype,'name',{get(){calls++;throw Error('raw constructor name hook executed');},configurable:true});const p=Object.getPrototypeOf(g.party.entries());Object.defineProperty(p,'next',{value:function(){calls++;throw Error('raw iterator executed');},configurable:true});({g,calls:()=>calls})", {text: JSON.stringify(g)});
      let ownedSnapshot: any;
      G.$gameSystem._psGame = foreign.g;
      try {
        await settledSave(57);
        const captured = G.DataManager.makeSaveContents();
        assert(captured.system !== G.$gameSystem && captured.system._psGame !== foreign.g, "save envelope owns a separate verified state");
        foreign.g.money++;
        await G.StorageManager.saveObject("file58", captured);
        for (const slot of [57, 58]) {const wire = (await G.StorageManager.loadObject(`file${slot}`)).system._psGame; eq([wire.encoding, wire.version], ["pokemon-framework-json", 1], "versioned host encoding"); eq(JSON.parse(wire.data), snapshotExpected, "actual MZ encoder/decoder preserved the verified values");}
        eq(foreign.calls(), 0, "actual MZ serialization never executes raw tag/name/iterator hooks");
        eq(foreign.g.money, snapshotExpected.money + 1, "encoding did not replace or normalize the raw state");
        ownedSnapshot = {slots: [57, 58], hookCalls: foreign.calls(), detachedMoney: snapshotExpected.money};
      } finally { G.$gameSystem._psGame = g; }
      await settledSave(54); await settledSave(55);
      fs.writeFileSync(path.join(path.dirname(OUT || "."), "ps-flow-expected-progression-data.json"), JSON.stringify({state: clone(g), slots: [54, 55, 57, 58], ownedSnapshot, regional: progressionRegional, schema6SourceSha: sourceSha, savedHashes: saveFileHashes()}));
      return {input: "MZ serializer-authored schema6 fixture -> real loadGame -> saveGame7", sourceFixture: six.schema, schema6SourceSha: sourceSha, layout: g.dex.layoutIdentity, preserved: [m.id, m.firstMoves, m.friendship, m.abilityIndex], lastBox: [39, 29], slots: [54, 55, 57, 58], ownedSnapshot};
    });
    await scenario("B53-H05 legal7 then corruption: menu/direct/autosave reject with zero disk writes", async () => {
      await G.DataManager.loadGame(54); assert(!G.$gameSystem._psSaveError, "legal7 was actually loaded");
      const good = clone(game()), hashes = saveFileHashes(), outcomes: any[] = [];
      for (const kind of ["bad-R", "bad-reference", "bad-layout", "array-entries", "array-forEach", "array-toJSON", "foreign-iterator"]) {
        G.$gameSystem._psGame = clone(good);
        if (kind === "bad-R") {game().party[0].readyToEvolve = false; game().party[0].evolutionReadiness = "unknown";}
        if (kind === "bad-reference") game().party[0].species = "missing-species";
        if (kind === "bad-layout") game().dex.layoutIdentity = "0".repeat(64);
        if (kind === "array-entries") {
          const hidden = clone(game().party[0]); hidden.id = "HiddenNW2"; delete hidden.cannotTrade;
          game().party = [game().party[0], hidden];
          Object.setPrototypeOf(game().party, Object.create(Array.prototype, {entries: {value: function* (this: any[]) {yield [0, this[0]];}}}));
        }
        if (kind === "array-forEach") {
          game().inventory.pockets[0] = [{itemId: "missing-item", quantity: -1}];
          Object.setPrototypeOf(game().inventory.pockets, Object.create(Array.prototype, {forEach: {value: () => {throw new Error("untrusted traversal must not run");}}}));
        }
        if (kind === "array-toJSON") {
          G.$gameSystem._psGame = nodeRequire("vm").runInNewContext("const g=JSON.parse(text);Object.defineProperty(Array.prototype,'toJSON',{value:function(){return this===g.party?[{id:'Bad'}]:this;},configurable:true});g", {text: JSON.stringify(game())});
        }
        if (kind === "foreign-iterator") {
          G.$gameSystem._psGame = nodeRequire("vm").runInNewContext("const g=JSON.parse(text);delete g.party[1].cannotTrade;const p=Object.getPrototypeOf(g.party.entries()),next=p.next;Object.defineProperty(p,'next',{value:function(){const v=Reflect.apply(next,this,[]);return !v.done&&Array.isArray(v.value)&&v.value[0]===1?{done:true}:v;},configurable:true});g", {text: JSON.stringify(game())});
        }
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
    await scenario("B53-H06 actual JsonEx: both reserved ledger orders and grant claims survive save/replay", async () => {
      const B = api(), content = W.PSFlow.content(), expectedPath = path.join(path.dirname(OUT || "."), "ps-flow-expected-progression-data.json");
      const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8")), cases: any[] = [];
      const raw = (id: string) => ({protocol: 1, battleId: id, outcome: {kind: "run", winner: null}, members: {}, bag: {}, captured: [], dex: {seen: [], owned: []}, money: 7});
      // A removed grant remains claimed too: a legal claim does not depend on a currently published reward catalog.
      const grantIds = ["constructor", "__proto__", "toJSON", "#.:_-"], grantContent = {...content, grants: Object.fromEntries(grantIds.map(id => [id, {members: [], items: {}, money: 3}]))};
      for (const [index, ids] of [["constructor", "@"], ["@", "constructor"]].entries()) {
        let next = clone(expected.state); delete next.appliedBattles.constructor;
        for (const id of ids) {const r = B.state.applyBattleResult(next, raw(id), undefined, undefined, {content}); eq(r.status, "applied", "normal public battle result creates the claim"); next = r.state;}
        for (const id of grantIds) {const r = B.grants.applyGrant(next, id, grantContent, () => 0); eq(r.status, "applied", "normal public grant creates the claim"); next = r.state;}
        const slot = 59 + index, original = clone(next); G.$gameSystem._psGame = next;
        await settledSave(slot); await G.DataManager.loadGame(slot); assert(!G.$gameSystem._psSaveError, JSON.stringify(G.$gameSystem._psSaveError));
        eq(game(), original, "real encode/decode/load retains every data key and hash");
        for (const id of ids) {const r = B.state.applyBattleResult(game(), raw(id), undefined, undefined, {content}); eq(r.status, "already-applied", "battle cannot pay twice"); eq(r.state, original, "no second resource change");}
        for (const id of grantIds) {const r = B.grants.applyGrant(game(), id, grantContent, () => 0); eq(r.status, "already-claimed", "grant cannot pay twice"); eq(r.state, original, "no second grant resource change");}
        cases.push({slot, ids, grantIds, state: original});
      }
      expected.ledgerCases = cases; expected.savedHashes = saveFileHashes(); fs.writeFileSync(expectedPath, JSON.stringify(expected));
      return {input: "normal applyBattleResult/applyGrant + actual MZ saveGame/loadGame", cases: cases.map(({state, ...rest}) => ({...rest, money: state.money, ledgerKeys: Object.keys(state.appliedBattles), claimKeys: Object.keys(state.claims)}))};
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
      const v2Context = handle._evidence.value.context;
      const v2 = api().session.sealBattleEffects(handle, { battleId: handle.result().battleId, generation: v2Context.generation, contentIdentity: v2Context.contentIdentity, rawHash: evidence.rawHash });
      assert(v2 && v2.version === 2, "actual host V2 source seal available independently of persistent consumption");
      eq(v2.control.members[id].friendship.value.current, 104, "V2 holds actual ACK chain");
      assert(Object.values(v2.observer.appearances).some((cell: any) => cell.status === "complete" && cell.value.some((r: any) => r.display.battleSpecies === "Pidgey")), "V2 actual display snapshot");
      eq(evidence.friendship[id].changes.map((c: any) => c.method), ["battleitem", "levelup"], "ordered real triggers");
      eq(evidence.friendship[id].current, 104, "threshold order respected");
      assert(evidence.records.some((r: any) => r.kind === "appearance"), "initial appearance before UI take retained");
      assert(!("friendship" in handle.result().members[id]), "no new protocol member-patch field");
      eq(game().party.find((m: any) => m.id === id).friendship, 104, "E2a installs the complete acknowledged friendship chain with the main result");
      await G.DataManager.saveGame(53);
      fs.writeFileSync(path.join(path.dirname(OUT || "."), "ps-flow-expected-capability.json"), JSON.stringify({ state: clone(game()), slot: 53, rawHash: evidence.rawHash }));
      return { input: "real scene, synthetic DOM keydown/keyup", rawHash: evidence.rawHash, records: evidence.records.length, friendship: evidence.friendship[id], v2Friendship: v2.control.members[id].friendship, saveSlot: 53, persistentCompanion: true };
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
    await scenario("C53-04 real host V2: observer failure preserves ACK receipt and primary capture/XP", async () => {
      fresh(); const B = api(), content = W.PSFlow.content(), id = game().party[0].id;
      game().party[0].hp = 50; game().party[0].friendship = 99;
      const factory = B.composition.createBattleSessionFactory({ content: () => content, seed: () => [1,2,3,4] });
      const app = new B.app.GameApplication({ state: { read: () => game(), replace: (next: any) => { G.$gameSystem._psGame = next; } }, sessions: factory, projection: { project: () => {} }, content: () => ({ content }), random: seeded(1), clock: () => 0, itemWorld: () => ({ mapId: G.$gameMap.mapId() }) }, { receivingProfile: { mode: 1, naming: 1 } });
      const before = clone(game()), request = { battleId: "host-effects-observer-failure", kind: "wild", foes: [{ species: "pidgey", level: 5 }], seq: 4 }, handle = await app.startBattle(request);
      handle.gw.drainObservations = () => { throw new Error("synthetic observer interruption"); };
      await handle.useItem("potion", id); await handle.throwBall("masterball"); const raw = handle.result(), c = handle._evidence.value.context;
      const seal = factory.effects(handle, { battleId: raw.battleId, generation: c.generation, contentIdentity: c.contentIdentity, rawHash: B.state.resultHash(raw) });
      eq(seal.observer.members[id].critical.status, "unavailable", "observer group closed");
      eq(seal.control.members[id].friendship.value.current, 100, "independent acknowledged control retained");
      const result = app.finishBattle(handle, request); eq(result.commit, "applied", "primary survives");
      assert(game().party.length === before.party.length + 1 && game().party[0].exp > before.party[0].exp, "capture/XP survive");
      eq(game().party[0].friendship, 100, "E2a persists the independent complete control group despite observer loss");
      return { input: "direct application API in actual NW, synthetic observer fault", observer: seal.observer.members[id].critical, control: seal.control.members[id].friendship, primary: result.commit, persistentCompanion: true };
    });
    await scenario("C53-05 real host atomic primary and R unknown barrier survive missing auxiliary seal", async () => {
      fresh(); const B = api(), content = W.PSFlow.content(), id = game().party[0].id;
      game().party[0].friendship = 99; game().party[0].readyToEvolve = true; game().party[0].evolutionReadiness = "known";
      const factory = B.composition.createBattleSessionFactory({ content: () => content, seed: () => [1,2,3,4] });
      let lookups = 0; factory.effects = () => { lookups++; throw new Error("synthetic missing V2 seal"); };
      let replacements = 0; const app = new B.app.GameApplication({ state: { read: () => game(), replace: (next: any) => { assert(app.saveBlocked, "continuous transaction owner at host replacement"); replacements++; G.$gameSystem._psGame = next; } }, sessions: factory, projection: { project: () => {} }, content: () => ({ content }), random: seeded(1), clock: () => 0, itemWorld: () => ({ mapId: G.$gameMap.mapId() }) }, { receivingProfile: { mode: 1, naming: 1 } });
      const before = clone(game()), request = { battleId: "host-effects-R-barrier", kind: "wild", foes: [{ species: "pidgey", level: 5 }], seq: 5 }, handle = await app.startBattle(request);
      await handle.throwBall("masterball"); const raw = handle.result(), result = app.finishBattle(handle, request);
      eq(result.commit, "applied", "legal primary committed"); eq(replacements, 1, "single replacement"); eq(lookups, 1, "single seal attempt");
      assert(game().party.length === before.party.length + 1 && game().party[0].exp > before.party[0].exp, "capture and XP survive");
      eq([game().party[0].readyToEvolve, game().party[0].evolutionReadiness, game().party[0].friendship], [true, "unknown", 99], "old value preserved with durable uncertainty barrier");
      eq(app.finishBattle(handle, request).commit, "already-applied", "no late backfill"); eq(lookups, 1, "duplicate never refetches seal");
      await G.DataManager.saveGame(54);
      fs.writeFileSync(path.join(path.dirname(OUT || "."), "ps-flow-expected-effects.json"), JSON.stringify({ slot: 54, state: clone(game()), result: raw, memberId: id }));
      return { input: "actual NW application API and MZ save, synthetic seal failure", replacements, lookups, readiness: game().party[0].evolutionReadiness, slot: 54 };
    });
    await scenario("C53-06 real host reception: source identity round trip cannot revive pending auxiliary writes", async () => {
      fresh(); const B = api(), original = W.PSFlow.content(), id = game().party[0].id;
      game().party[0].hp = 50; game().party[0].friendship = 99; game().party[0].readyToEvolve = true; game().party[0].evolutionReadiness = "known";
      let current = original, lookups = 0, replacements = 0, sourceSeal: any = null;
      const changed = clone(original); changed.meta.inputsHash = "4".repeat(64);
      changed.meta.contentIdentity = B.digest.sha256Hex(B.contentCompile.canonicalJson({ compiledSemantics: changed.meta.compiledSemantics, inputsHash: changed.meta.inputsHash, showdownSha: changed.meta.showdownSha }));
      const factory = B.composition.createBattleSessionFactory({ content: () => current, seed: () => [1,2,3,4] }), effects = factory.effects;
      factory.effects = (handle: any, binding: any) => { lookups++; sourceSeal = effects(handle, binding); current = changed; return sourceSeal; };
      const app = new B.app.GameApplication({ state: { read: () => game(), replace: (next: any) => { assert(app.saveBlocked, "reception owner at replacement"); replacements++; G.$gameSystem._psGame = next; } }, sessions: factory, projection: { project: () => {} }, content: () => ({ content: current }), random: seeded(1), clock: () => 0, itemWorld: () => ({ mapId: G.$gameMap.mapId() }) }, { receivingProfile: { mode: 1, naming: 0 } });
      const before = clone(game()), request = { battleId: "host-effects-pending-identity", kind: "wild", foes: [{ species: "pidgey", level: 5 }], seq: 6 }, handle = await app.startBattle(request);
      const used = await handle.useItem("potion", id); assert(used.ok, "real potion action succeeded");
      await handle.throwBall("masterball"); const raw = handle.result(), pending = app.finishBattle(handle, request);
      // These assertions live outside the optional source callback: the application's missing-source recovery must
      // not turn a thrown source into a false positive for the A-B-A identity regression.
      assert(current === changed, "source callback actually changed the current content to B");
      assert(sourceSeal?.version === 2 && sourceSeal.binding.contentIdentity === original.meta.contentIdentity, "real source returned its original A binding");
      eq(sourceSeal.control.members[id].friendship.status, "complete", "source ACK was complete before downgrading");
      eq([sourceSeal.control.members[id].friendship.value.before, sourceSeal.control.members[id].friendship.value.current], [99,100], "real acknowledged potion friendship would otherwise be installable");
      assert(pending.pending && app.saveBlocked, "nickname choice retains the original owner"); eq(replacements, 0, "pending is zero write"); eq(game(), before, "pending preserves original state");
      current = original; const done = app.resolveReceiving(pending.receivingToken, { [raw.captured[0].id]: { nickname: { kind: "keep" } } });
      eq(done.commit, "applied", "same token completes the legal primary"); eq([lookups, replacements], [1,1], "one source attempt and one installation");
      eq([game().party[0].friendship, game().party[0].readyToEvolve, game().party[0].evolutionReadiness], [99,true,"unknown"], "old source is permanently downgraded after A-B-A");
      assert(game().party.length === before.party.length + 1 && game().party[0].exp > before.party[0].exp, "capture and XP survive pending recovery");
      await G.DataManager.saveGame(55);
      const expectedFile = path.join(path.dirname(OUT || "."), "ps-flow-expected-effects.json"), expected = JSON.parse(fs.readFileSync(expectedFile, "utf8"));
      expected.receivingCase = { slot: 55, state: clone(game()), result: raw }; fs.writeFileSync(expectedFile, JSON.stringify(expected));
      return { input: "actual NW/MZ application and save, synthetic source callback content replacement", sourceFriendship: sourceSeal.control.members[id].friendship, lookups, replacements, slot: 55 };
    });
  }

  async function runPostbattleEvolution() {
    await toMap();
    await scenario("E53-P1 real battle scene: K3 to evolution and learning keeps interpreter/save owner through restart", async () => {
      fresh(); const B = api(), content = clone(W.PSFlow.content()), before = clone(game()), id = game().party[0].id, target = game().party[1].species;
      const dex = B.dex.createDexLookup(), names = ["surgingstrikes", "tackle", "growl", "rest", "gust"];
      const moves = names.map(name => dex.move(name)); assert(moves.every((move: any) => move?.id && move.pp), "real pinned move data");
      for (const move of moves) content.moves[move.name] = move;
      B.speciesKey.speciesDataOf(content, game().party[0]).evolutions = [{ method: "BattleDealCriticalHit", parameter: 3, target }];
      B.speciesKey.speciesDataOf(content, game().party[0]).learnset = { 1: moves.slice(0,4).map((move: any) => move.name) };
      B.speciesKey.speciesDataOf(content, game().party[1]).learnset = { 0: [moves[4].name], 1: [moves[1].name] };
      const authored = clone(content); delete authored.meta;
      const inputsHash = B.digest.sha256Hex(B.contentCompile.canonicalJson(authored));
      content.meta = { ...content.meta, kind: "fixture", id: "host-postbattle", inputsHash,
        contentIdentity: B.digest.sha256Hex(B.contentCompile.canonicalJson({ compiledSemantics: content.meta.compiledSemantics, inputsHash, showdownSha: content.meta.showdownSha })) };
      W.PSFlow._content = content; W.PSFlow._app = null; W.PSFlow.rng = () => 0;
      game().party[0].moves = moves.slice(0,4).map((move: any) => ({ id: move.id, pp: move.pp, maxpp: move.pp, ppUps: 0 }));
      const request = { battleId: "host-postbattle-K3", kind: "wild", foes: [{ species: target, level: 50 }], seq: 7 };
      W.PSFlow.openBattle(request); await inMode("main"); const handle = battle()._session, app = W.PSFlow.app();
      await choose(/^Fight/); await inMode("moves"); await choose(/surging strikes/i); await inMode("main");
      await choose(/^Bag/); await inMode("bag"); await choose(/master ball/i); await inMode("end");
      const raw = handle.result(), binding = handle._evidence.value.context;
      await press("ok"); await waitFor(() => !battle() && !!app.pendingEvolution, "battle scene transferred to core evolution owner");
      const seal = B.session.sealBattleEffects(handle, { battleId: raw.battleId, generation: binding.generation, contentIdentity: binding.contentIdentity, rawHash: B.state.resultHash(raw) });
      eq(seal.observer.members[id].critical, { status: "complete", value: 3 }, "actual default gateway measured three critical hits");
      eq(app.pendingEvolution.selection.family, "battle", "actual K3 selected the battle family");
      const waiter = new G.Game_Interpreter(); waiter.setWaitMode("psBattle");
      assert(waiter.updateWaitMode() && W.PSFlow.running && app.saveBlocked && !G.$gameSystem.isSaveEnabled(), "same owner keeps actual MZ interpreter and save mask");
      let saveRefused = false; try { await G.DataManager.saveGame(56); } catch { saveRefused = true; } assert(saveRefused, "actual direct MZ save refused during evolution");
      let pending = app.pendingEvolution; const evolved = W.PSFlow.resolveEvolution(pending.token, pending.revision, { kind: "complete" });
      assert(evolved.pending && app.pendingEvolution.phase === "learning", "evolution committed, fifth move awaits a decision");
      eq(game().party[0].species, target, "species write installed"); eq(game().stats.evolution_count, 1, "one evolution statistic");
      assert(waiter.updateWaitMode() && app.saveBlocked && W.PSFlow.running, "learning continues the same owner");
      pending = app.pendingEvolution; const done = W.PSFlow.resolveEvolution(pending.token, pending.revision, { kind: "learn", answer: { kind: "replace", slot: 3 } });
      eq(done.commit, "applied", "original primary remains the business outcome"); assert(!done.pending && !app.pendingEvolution && !app.saveBlocked && !W.PSFlow.running && !waiter.updateWaitMode(), "all owners release only after learning");
      eq(game().party[0].moves[3], { id: moves[4].id, pp: moves[4].pp, maxpp: moves[4].pp, ppUps: 0 }, "real C planner taught the evolution move");
      eq(game().appliedBattles[raw.battleId].hash, B.state.resultHash(raw), "unchanged original battle ledger"); assert(game().party.length === before.party.length + 1, "real caught member retained");
      await G.DataManager.saveGame(56);
      fs.writeFileSync(path.join(path.dirname(OUT || "."), "ps-flow-expected-postbattle.json"), JSON.stringify({ slot: 56, state: clone(game()), result: raw, content }));
      await shot("E53-P1-postbattle-complete");
      return { input: "real scene and synthetic DOM battle choices, actual gateway K3, explicit core continuation answers, real MZ interpreter/save", critical: seal.observer.members[id].critical, slot: 56, evolutionCount: game().stats.evolution_count, saveRefused };
    });
    await scenario("E53-P2 real battle scene: four actual Tackle losses earn durable R in the primary install", async () => {
      fresh(); const B = api(), content = clone(W.PSFlow.content()), id = game().party[0].id, target = game().party[1].species;
      const splash = B.dex.createDexLookup().move("splash"); content.moves[splash.name] = splash;
      B.speciesKey.speciesDataOf(content, game().party[0]).evolutions = [{ method: "EventAfterDamageTaken", parameter: 7, target }];
      B.speciesKey.speciesDataOf(content, game().party[0]).learnset = { 1: [splash.name] };
      B.speciesKey.speciesDataOf(content, game().party[1]).learnset = { 1: ["Tackle"] };
      const authored = clone(content); delete authored.meta;
      const inputsHash = B.digest.sha256Hex(B.contentCompile.canonicalJson(authored));
      content.meta = { ...content.meta, id: "host-postbattle-D60", inputsHash,
        contentIdentity: B.digest.sha256Hex(B.contentCompile.canonicalJson({ compiledSemantics: content.meta.compiledSemantics, inputsHash, showdownSha: content.meta.showdownSha })) };
      W.PSFlow._content = content; W.PSFlow._app = null; W.PSFlow.rng = () => 0;
      game().party[0].moves = [{ id: splash.id, pp: splash.pp, maxpp: splash.pp, ppUps: 0 }]; const hpBefore = game().party[0].hp;
      const request = { battleId: "host-postbattle-D60", kind: "wild", foes: [{ species: target, level: 50 }], seq: 8 };
      W.PSFlow.openBattle(request); await inMode("main"); const handle = battle()._session;
      for (let turn = 0; turn < 4; turn++) { await choose(/^Fight/); await inMode("moves"); await choose(/splash/i); await inMode("main"); }
      await choose(/^Bag/); await inMode("bag"); await choose(/master ball/i); await inMode("end"); const raw = handle.result(), binding = handle._evidence.value.context;
      await finishBattle(); const seal = B.session.sealBattleEffects(handle, { battleId: raw.battleId, generation: binding.generation, contentIdentity: binding.contentIdentity, rawHash: B.state.resultHash(raw) });
      eq(seal.observer.members[id].damage, { status: "complete", value: { total: 60, resetCoverage: "complete" } }, "exact four-hit controlled direct-loss fixture");
      eq(hpBefore - game().party[0].hp, 60, "no healing/faint/substitute masks this fixture's exact direct loss");
      eq([game().party[0].readyToEvolve, game().party[0].evolutionReadiness], [true,"known"], "complete ordered scan earns R with main state");
      assert(!W.PSFlow.app().pendingEvolution && !W.PSFlow.app().saveBlocked, "R registration alone opens no animation and leaves no owner"); eq(game().stats.evolution_count, 0, "no spontaneous event evolution");
      await G.DataManager.saveGame(57); const file = path.join(path.dirname(OUT || "."), "ps-flow-expected-postbattle.json"), expected = JSON.parse(fs.readFileSync(file,"utf8"));
      expected.readinessCase = { slot:57, state:clone(game()), result:raw, content }; fs.writeFileSync(file, JSON.stringify(expected));
      return { input:"real scene synthetic DOM, four real engine losses, actual application scan and MZ save", damage:seal.observer.members[id].damage, hpBefore, hpAfter:game().party[0].hp, slot:57 };
    });
  }

  async function runLearningTransactions() {
    await toMap();
    await scenario("E53-L1 real MZ: TR learning commits once under inventory child, interpreter and save guards", async () => {
      fresh(); const B = api(), content = clone(W.PSFlow.content()), id = game().party[0].id;
      const move = B.dex.createDexLookup().move("gust"); assert(move?.id && move.pp, "pinned Gen8 move data"); content.moves[move.name] = move;
      const species = B.speciesKey.speciesDataOf(content,game().party[0]); species.tutorMoves = [move.name]; species.learnset = {1:["Tackle","Rest"]};
      for (const name of ["tackle","rest"]) { const m = B.dex.createDexLookup().move(name); content.moves[m.name] = m; }
      for (const [itemId,fieldUse] of [["host-study-tr","tr"],["host-study-hm","hm"]]) content.items[itemId] = { ...content.items.potion, id:itemId, name:itemId, namePlural:itemId, pocket:4, flags:[], fieldUse, battleUse:"none", battleId:undefined, legacyIds:[], consumable:fieldUse==="tr", move:move.id };
      content.settings = { ...(content.settings ?? {}), TAUGHT_MACHINES_KEEP_OLD_PP: true };
      const authored = clone(content); delete authored.meta; const inputsHash = B.digest.sha256Hex(B.contentCompile.canonicalJson(authored));
      content.meta = { ...content.meta, kind:"fixture", id:"host-learning", inputsHash, contentIdentity:B.digest.sha256Hex(B.contentCompile.canonicalJson({compiledSemantics:content.meta.compiledSemantics,inputsHash,showdownSha:content.meta.showdownSha})) };
      W.PSFlow._content = content; W.PSFlow._app = null; game().inventory = B.inventory.addItems(game().inventory,"host-study-tr",2,content.items,B.inventory.inventoryPolicy(content));
      const app = W.PSFlow.app(), before = clone(game()), token = app.beginInventoryOperation("bag");
      const started = W.PSFlow.beginLearning({kind:"teach",memberId:id,source:{kind:"machine",itemId:"host-study-tr",entry:"bag"}},{kind:"inventory",token}); eq(started.status,"pending","four old moves require one decision");
      const waiter = new G.Game_Interpreter(); waiter.setWaitMode("psLearning"); waiter._psLearningToken = started.view.token;
      assert(waiter.updateWaitMode() && app.saveBlocked && !G.$gameSystem.isSaveEnabled(),"actual interpreter and save remain blocked");
      let saveRefused = false; try { await G.DataManager.saveGame(58); } catch { saveRefused = true; } assert(saveRefused,"actual direct save refuses pending lesson");
      eq(app.endInventoryOperation(token).reason,"child-operation-active","parent cannot release child");
      const decision = {kind:"learn",answer:{kind:"replace",slot:0}},done=W.PSFlow.resolveLearning(started.view.token,started.view.revision,decision);eq(done.status,"committed","complete pure plan installed");
      eq(game().party[0].moves[0],{id:move.id,pp:Math.min(before.party[0].moves[0].pp,move.pp),maxpp:move.pp,ppUps:0},"replacement PP contract");
      eq(B.inventory.itemQuantity(game().inventory,"host-study-tr",content.items),1,"TR consumed once");eq(game().stats.moves_taught_by_item,before.stats.moves_taught_by_item+1,"wrapper statistic once");assert(game().party[0].firstMoves.includes(move.id),"TR first record kept");
      const after=clone(game());eq(W.PSFlow.resolveLearning(started.view.token,started.view.revision,decision),done,"duplicate result receipt");eq(game(),after,"duplicate zero write");assert(!waiter.updateWaitMode()&&!app.saveBlocked,"only completed lesson releases waiting/save mask");app.endInventoryOperation(token);
      await G.DataManager.saveGame(58); fs.writeFileSync(path.join(path.dirname(OUT||"."),"ps-flow-expected-learning.json"),JSON.stringify({slot:58,state:clone(game()),content}));await shot("E53-L1-learning-complete");
      return {input:"real MZ interpreter/save and application bridge, synthetic direct lesson decision; no formal G screen",slot:58,saveRefused,remaining:1};
    });
    await scenario("E53-L2 real MZ: independent HM forgetting, reminder and last-move refusal keep exact state",async()=>{
      assert(fs.existsSync(path.join(path.dirname(OUT||"."),"ps-flow-expected-learning.json")),"prerequisite L1 produced its learning save and content fixture");
      const app=W.PSFlow.app(),id=game().party[0].id;eq(W.PSFlow.beginLearning({kind:"forget",memberId:id}).status,"pending","independent viewing");let p=app.pendingLearning;
      eq(W.PSFlow.resolveLearning(p.token,p.revision,{kind:"forget",slot:0}).status,"committed","independent forgetting allows HM");assert(!game().party[0].moves.some((m:any)=>m.id==="gust"),"HM removed");
      const before=game().stats.moves_taught_by_reminder;eq(W.PSFlow.beginLearning({kind:"relearn",memberId:id}).status,"pending","reminder candidates");p=app.pendingLearning;assert(p.selection.candidates.includes("tackle"),"actual level-table candidate");
      eq(W.PSFlow.resolveLearning(p.token,p.revision,{kind:"relearn",answer:{kind:"select",moveId:"tackle",teach:true}}).status,"committed","reminder empty slot succeeds");eq(game().stats.moves_taught_by_reminder,before+1,"reminder statistic once");
      game().party[0].moves=[{id:"tackle",pp:35,maxpp:35,ppUps:0}];const exact=clone(game());eq(W.PSFlow.beginLearning({kind:"forget",memberId:id}).status,"pending","last move still viewable");p=app.pendingLearning;
      eq(W.PSFlow.resolveLearning(p.token,p.revision,{kind:"forget",slot:0}).reason,"last-move","cannot remove last move");eq(game(),exact,"refusal changes nothing");p=app.pendingLearning;eq(W.PSFlow.resolveLearning(p.token,p.revision,{kind:"forget",slot:null}).status,"cancelled","view can leave");assert(!app.saveBlocked,"no stuck owner");
      await G.DataManager.saveGame(59);const file=path.join(path.dirname(OUT||"."),"ps-flow-expected-learning.json"),expected=JSON.parse(fs.readFileSync(file,"utf8"));expected.reminderCase={slot:59,state:clone(game())};fs.writeFileSync(file,JSON.stringify(expected));
      return {input:"real MZ application and save; direct reminder/forget answers and explicit one-move fixture",slot:59};
    });
    await scenario("E53-LEGG real compiled3 author egg table enables one TR transaction and persistent schema7 save",async()=>{
      const B=api();let target="";
      const content=progressionContent(false,inputs=>{const base=inputs.species.find((sp:any)=>!sp.form);target=base.id;base.eggMoves=["gust"];base.tutorMoves=[];base.learnset=[{level:1,move:"tackle"}];
        // This isolated newGame fixture never claims a starter grant. Its authored catalog declares every item it uses.
        inputs.grants=[];inputs.items??=[];inputs.items.push({id:"host-egg-ball",name:"Fixture Ball",pocket:3,flags:["PokeBall"],battleUse:"ball",battleId:"pokeball",fieldUse:"none",source:base.source},{id:"host-egg-tr",name:"Egg Teaching Record",namePlural:"Egg Teaching Records",pocket:4,fieldUse:"tr",move:"gust",battleUse:"none",consumable:true,source:base.source});});
      eq(content.meta.compiledSemantics,3,"actual compiler semantic version");const battleName=B.speciesKey.battleNameOf(content,{species:target,form:0});assert(battleName,"author id resolves to pinned battle identity");
      const member=B.speciesKey.toPersistentMember(B.memberFactory.createMember({id:"EGG-COMPAT-NW",species:battleName,ball:"host-egg-ball",level:5,context:{map:G.$gameMap.mapId(),receivedAt:1}},content,()=>0),content);eq(member.species,target,"persistent identity before newGame");
      const created=B.state.newGame({party:[member],bag:{"host-egg-tr":1},content});eq(created.schema,7,"save schema unchanged");W.PSFlow._content=content;G.$gameSystem._psGame=created;W.PSFlow.stateReplaced();const app=W.PSFlow.app(),token=app.beginInventoryOperation("bag");
      const result=W.PSFlow.beginLearning({kind:"teach",memberId:member.id,source:{kind:"machine",itemId:"host-egg-tr",entry:"bag"}},{kind:"inventory",token});eq(result.status,"committed","egg-only compatibility learned through actual app");app.endInventoryOperation(token);
      assert(game().party[0].moves.some((move:any)=>move.id==="gust"),"learned canonical pinned move");eq(B.inventory.itemQuantity(game().inventory,"host-egg-tr",content.items),0,"single actual TR consumed");eq(game().stats.moves_taught_by_item,1,"one stat");assert(game().party[0].firstMoves.includes("gust"),"TR record persisted");
      await G.DataManager.saveGame(60);const file=path.join(path.dirname(OUT||"."),"ps-flow-expected-learning.json"),expected=JSON.parse(fs.readFileSync(file,"utf8"));expected.eggCase={slot:60,state:clone(game()),content};fs.writeFileSync(file,JSON.stringify(expected));
      return {input:"actual author compiler and pinned Gen8 assembly plus MZ app/save; explicit custom egg table and direct service intent",slot:60,compiledSemantics:3,saveSchema:7};
    });
  }

  async function runTriggeredEvolution() {
    await toMap(); const B=api(), cases:any[]=[];
    function fixture(entries:any[],level=50,team=false):any {
      const content=progressionContent(false,inputs=>{inputs.grants=[];inputs.overlays=[];const base=inputs.species.find((sp:any)=>sp.id==="charizard");base.evolutions=entries;base.learnset=[...['tackle','rest','roost','flamethrower'].map(move=>({level:1,move})),{level:51,move:'slash'}];inputs.species.find((sp:any)=>sp.id==="blastoise").learnset=[];
        const source=base.source;inputs.items=[{id:'host-trigger-ball',name:'Fixture Ball',pocket:3,flags:['PokeBall'],battleUse:'ball',battleId:'pokeball',fieldUse:'none',source},{id:'host-trigger-candy',name:'Fixture Candy',pocket:2,fieldUse:'member',battleUse:'none',consumable:true,effect:{family:'rare-candy',parameters:{}},source},{id:'host-trigger-stone',name:'Fixture Stone',pocket:2,fieldUse:'member',battleUse:'none',flags:['EvolutionStone'],consumable:true,effect:{family:'evolution',parameters:{}},source}];});
      const member=(id:string)=>B.speciesKey.toPersistentMember(B.memberFactory.createMember({id,species:B.speciesKey.battleNameOf(content,{species:'charizard',form:0}),ball:'host-trigger-ball',level,context:{map:G.$gameMap.mapId(),receivedAt:1}},content,()=>0),content);
      const party=team?[member('TRIGGER-ONE'),member('TRIGGER-TWO'),member('TRIGGER-FAINT')]:[member('TRIGGER-ONE')];if(team)party[2].hp=0;
      W.PSFlow._content=content;G.$gameSystem._psGame=B.state.newGame({party,bag:{'host-trigger-candy':3,'host-trigger-stone':3},content});W.PSFlow.stateReplaced();return {content,app:W.PSFlow.app(),id:party[0].id};
    }
    const amount=(id:string)=>B.inventory.itemQuantity(game().inventory,id,W.PSFlow.content().items);
    const resolve=(decision:any)=>{const p=W.PSFlow.app().pendingEvolution;assert(p,'actual nested evolution');return W.PSFlow.resolveEvolution(p.token,p.revision,decision);};
    async function saveCase(slot:number):Promise<void>{await G.DataManager.saveGame(slot);cases.push({slot,state:clone(game()),content:clone(W.PSFlow.content())});fs.writeFileSync(path.join(path.dirname(OUT||'.'),'ps-flow-expected-triggered.json'),JSON.stringify({cases}));}
    await scenario('E53-T1 real MZ: candy primary install precedes cancellable evolution under one interpreter/save owner',async()=>{
      const {app,id}=fixture([{method:'Level',parameter:51,target:'blastoise'}]),parent=app.beginInventoryOperation('bag'),intent={itemId:'host-trigger-candy',memberId:id,quantity:1},before=clone(game());
      const start=W.PSFlow.beginEvolutionItem(parent,'candy1',intent);eq(start.status,'pending','growth lesson');eq(game(),before,'question does not spend or grow');const waiter=new G.Game_Interpreter();waiter.setWaitMode('psEvolutionAction');waiter._psEvolutionActionToken=start.view.token;assert(waiter.updateWaitMode()&&app.saveBlocked&&!G.$gameSystem.isSaveEnabled(),'real wait and save mask');
      let refused=false;try{await G.DataManager.saveGame(61);}catch{refused=true;}assert(refused,'real direct save refuses action');eq(app.endInventoryOperation(parent).reason,'child-operation-active','parent cannot release');
      eq(W.PSFlow.resolveTriggeredEvolution(start.view.token,start.view.revision,{kind:'growth',answer:{kind:'replace',slot:0}}).status,'pending','growth installed then evolution');eq(game().party[0].level,51,'growth kept');eq(amount('host-trigger-candy'),2,'one cost');assert(waiter.updateWaitMode()&&app.saveBlocked,'continuous owner');const done=resolve({kind:'cancel'});eq(done.status,'committed','growth committed despite ordinary cancel');eq(game().party[0].species,'charizard','body unchanged');eq(game().stats.evolutions_cancelled,1,'one cancel');eq(W.PSFlow.beginEvolutionItem(parent,'candy1',intent),done,'same parent request receipt');assert(!waiter.updateWaitMode()&&!app.saveBlocked,'terminal release');app.endInventoryOperation(parent);await saveCase(61);await shot('E53-T1-candy-cancel');return {slot:61,saveRefused:refused,input:'actual MZ interpreter/save and app bridge; direct rule answers, no G screen or hardware input'};
    });
    await scenario('E53-T2 real MZ: max-level unknown has zero cost/animation; legal cancellation costs once; stone is atomic and not cancellable',async()=>{
      let w=fixture([{method:'LevelRain',parameter:1,target:'blastoise'}],100),parent=w.app.beginInventoryOperation('bag'),before=clone(game());eq(W.PSFlow.beginEvolutionItem(parent,'unknown',{itemId:'host-trigger-candy',memberId:w.id,quantity:1}).status,'refused','weather provider intentionally unavailable');eq(game(),before,'unknown zero write');assert(!w.app.pendingEvolution&&!w.app.saveBlocked,'no animation or remaining child');w.app.endInventoryOperation(parent);
      w=fixture([{method:'Level',parameter:100,target:'blastoise'},{method:'Item',parameter:'host-trigger-stone',target:'blastoise'}],100);parent=w.app.beginInventoryOperation('bag');before=clone(game());eq(W.PSFlow.beginEvolutionItem(parent,'max',{itemId:'host-trigger-candy',memberId:w.id,quantity:1}).status,'pending','legal max starts evolution directly');eq(amount('host-trigger-candy'),3,'cost only with committed result');eq([game().party[0].exp,game().party[0].friendship],[before.party[0].exp,before.party[0].friendship],'no max XP or friendship');eq(resolve({kind:'cancel'}).status,'committed','max cancel');eq(amount('host-trigger-candy'),2,'one cost with cancel statistic');eq(game().stats.evolutions_cancelled,1,'cancel statistic with cost');w.app.endInventoryOperation(parent);await saveCase(62);
      parent=w.app.beginInventoryOperation('bag');eq(W.PSFlow.beginEvolutionItem(parent,'stone',{itemId:'host-trigger-stone',memberId:w.id,quantity:1}).status,'pending','stone selection');eq(amount('host-trigger-stone'),3,'not spent before body');eq(resolve({kind:'cancel'}).reason,'evolution-cannot-cancel','ordinary cancel refused');eq(resolve({kind:'complete'}).status,'committed','body and cost commit');eq(game().party[0].species,'blastoise','target');eq(amount('host-trigger-stone'),2,'single stone');eq(game().stats.evolution_count,1,'one evolution');w.app.endInventoryOperation(parent);await saveCase(63);return {slots:[62,63],input:'real MZ service path plus explicit authored rules; unknown provider is intentionally unavailable, not synthesized'};
    });
    await scenario('E53-T3 real MZ: event queue separates matched/evolved, stale member answers and fainted single-target semantics',async()=>{
      const {app}=fixture([{method:'Event',parameter:7,target:'blastoise'}],50,true);eq(W.PSFlow.beginEventEvolution({event:7}).status,'pending','team begins');const old=clone(app.pendingEvolution);eq(resolve({kind:'cancel'}).status,'pending','cancel only first member');eq(app.pendingEvolution.memberId,'TRIGGER-TWO','next healthy snapshot ID');const before=clone(game());eq(W.PSFlow.resolveEvolution(old.token,old.revision,{kind:'complete'}).status,'refused','old nested token refused');eq(game(),before,'no stale writes');const done=resolve({kind:'complete'});eq(done.result.members.map((m:any)=>[m.memberId,m.matched,m.evolved]),[['TRIGGER-ONE',true,false],['TRIGGER-TWO',true,true]],'per-member result truth');eq(game().party[2].species,'charizard','team skips fainted');
      eq(W.PSFlow.beginEventEvolution({event:7,memberId:'TRIGGER-FAINT'}).status,'pending','single entry does not add team HP guard');eq(resolve({kind:'complete'}).status,'committed','single fainted evolves');eq(game().party[2].hp,0,'no revival');eq(game().stats.evolution_count,2,'two bodies total');assert(!app.saveBlocked&&!app.pendingTriggeredEvolution,'released');await saveCase(64);return {slot:64,input:'real MZ bridge, synthetic event number and direct continuation answers'};
    });
    await scenario('E53-T4 real MZ: max candy technical stop before result or after zero-write body fault costs nothing',async()=>{
      let w=fixture([{method:'Level',parameter:100,target:'blastoise'}],100),app=w.app,parent=app.beginInventoryOperation('bag'),before=clone(game());
      eq(W.PSFlow.beginEvolutionItem(parent,'technical-before',{itemId:'host-trigger-candy',memberId:w.id,quantity:1}).status,'pending','valid target without debit');let p=app.pendingTriggeredEvolution;eq(W.PSFlow.resolveTriggeredEvolution(p.token,p.revision,{kind:'technical-terminate'}).status,'technically-terminated','controlled technical stop');eq(game(),before,'no cost, no statistic or body');app.endInventoryOperation(parent);
      let fail=false,writes=0;app=new B.app.GameApplication({state:{read:()=>game(),replace:(next:any)=>{if(fail)throw Error('T4 injected zero body write');writes++;G.$gameSystem._psGame=next;}},content:()=>({content:w.content}),sessions:{create:()=>{throw Error('T4 no battle');}},projection:{project:()=>{}},random:()=>0,clock:()=>0});W.PSFlow._app=app;parent=app.beginInventoryOperation('bag');eq(W.PSFlow.beginEvolutionItem(parent,'technical-failed-body',{itemId:'host-trigger-candy',memberId:w.id,quantity:1}).status,'pending','second real application');fail=true;eq(resolve({kind:'complete'}).status,'pending','body failure held');p=app.pendingTriggeredEvolution;eq(W.PSFlow.resolveTriggeredEvolution(p.token,p.revision,{kind:'technical-terminate'}).status,'technically-terminated','discard zero-write plan');eq(game(),before,'failed body cannot leave an independent debit');eq(writes,0,'zero global writes');app.endInventoryOperation(parent);assert(!app.saveBlocked,'released');await saveCase(66);return {slot:66,input:'actual MZ bridge/save guard with explicit injected application state port; direct decisions, no real save fault'};
    });
  }

  async function runTradeTransactions() {
    await toMap(); const B=api(),cases:any[]=[];
    function fixture(hasDex=true):any {
      const content=progressionContent(false,inputs=>{inputs.grants=[];inputs.overlays=[];const source=inputs.species[0].source;
        inputs.species.push({...inputs.species.find((sp:any)=>sp.id==='charizard'),id:'host-haunter',showdownId:'haunter',nameKey:'host.haunter',learnset:['tackle','rest','roost','flamethrower'].map(move=>({level:1,move})),evolutions:[{method:'Trade',target:'gengar'}]});inputs.species.find((sp:any)=>sp.id==='gengar').learnset=[{level:50,move:'gust'}];
        inputs.items=[{id:'pokeball',name:'Fixture Ball',pocket:3,flags:['PokeBall'],fieldUse:'none',battleUse:'ball',battleId:'pokeball',source}];});
      const old=B.speciesKey.toPersistentMember(B.memberFactory.createMember({id:'TRADE-OUTGOING',species:B.speciesKey.battleNameOf(content,{species:'charizard',form:0}),level:50,context:{map:G.$gameMap.mapId(),receivedAt:1}},content,()=>0),content);const state=B.state.newGame({party:[old],content});state.dex.hasDex=hasDex;state.dex.unlocked[0]=true;
      W.PSFlow._content=content;G.$gameSystem._psGame=state;W.PSFlow.stateReplaced();return {content,app:W.PSFlow.app(),old};
    }
    const answer=(decision:any)=>{const p=W.PSFlow.app().pendingTrade;assert(p,'active trade');return W.PSFlow.resolveTrade(p.token,p.revision,decision);};
    const evolution=(decision:any)=>{const p=W.PSFlow.app().pendingEvolution;assert(p,'active trade evolution');return W.PSFlow.resolveEvolution(p.token,p.revision,decision);};
    async function save(slot:number,intent:any,requestId:string):Promise<void>{await G.DataManager.saveGame(slot);cases.push({slot,state:clone(game()),content:clone(W.PSFlow.content()),intent,requestId});fs.writeFileSync(path.join(path.dirname(OUT||'.'),'ps-flow-expected-trade.json'),JSON.stringify({cases}));}
    await scenario('E53-TR1 real MZ: two draft Info pages, trade evolution and learning precede one final replacement under wait/save owner',async()=>{
      const {app,old}=fixture(),before=clone(game()),intent={outgoingId:old.id,incoming:{species:'host-haunter'},nickname:'Contract',foreignOwner:{name:'NPC'}};
      const start=W.PSFlow.beginTrade('nw-trade1',intent);eq(start.status,'pending','offer');const waiter=new G.Game_Interpreter();waiter.setWaitMode('psTrade');waiter._psTradeToken=start.view.token;assert(waiter.updateWaitMode()&&app.saveBlocked&&!G.$gameSystem.isSaveEnabled(),'actual wait/save lock');let refused=false;try{await G.DataManager.saveGame(67);}catch{refused=true;}assert(refused,'direct save refuses draft');
      eq(answer({kind:'confirm',accept:true}).view.phase,'presenting','draft prepared');eq(answer({kind:'presented'}).view.phase,'entry','received Info eligibility retained');eq(app.pendingTrade.entry.previouslyOwned,false,'earlier ownership captured');eq(app.pendingTrade.incoming.source,'trade-draft','explicit source');eq(game(),before,'global state and ordinal remain original');answer({kind:'open-entry'});assert(app.pendingTrade.entry.opened,'draft recent form projected before Info');eq(game(),before,'Info is private');eq(answer({kind:'close-entry'}).view.phase,'evolution','one trade scan');eq(evolution({kind:'cancel'}).reason,'evolution-cannot-cancel','ordinary cancel refused');eq(evolution({kind:'complete'}).view.phase,'entry','evolved Info before learning');eq(app.pendingTrade.entry.stage,'evolved','second new species');eq(game(),before,'private evolved body still not live');assert(waiter.updateWaitMode(),'same interpreter waits through entry');answer({kind:'open-entry'});answer({kind:'close-entry'});eq(app.pendingEvolution.phase,'learning','fifth move question after Info');eq(evolution({kind:'learn',answer:{kind:'replace',slot:0}}).view.phase,'ready','learned in draft');eq(game(),before,'no early replacement');
      const done=answer({kind:'commit'});eq(done.status,'committed','atomic final replace');const member=game().party[0];eq(member.species,'gengar','final target');assert(member.id!==old.id&&!member.id.startsWith('DRAFT'),'new permanent identity');eq(member.origin.method,2,'trade source');eq(member.owner.name,'NPC','foreign owner');eq(member.nickname,'Contract','nickname');assert(member.moves.some((m:any)=>m.id==='gust'),'learned canonical move');eq(game().stats.trade_count,1,'one trade');eq(game().stats.evolution_count,1,'one evolution');assert(game().dex.owned.includes('host-haunter')&&game().dex.owned.includes('gengar'),'both projected registrations installed');const after=clone(game());eq(W.PSFlow.beginTrade('nw-trade1',intent),done,'same request receipt');eq(game(),after,'duplicate zero change');assert(!waiter.updateWaitMode()&&!app.saveBlocked,'completed owner released');await save(67,intent,'nw-trade1');await shot('E53-TR1-final-trade');return {slot:67,saveRefused:refused,input:'actual MZ bridge/interpreter/save, authored fixture and direct stage/learning answers; no formal G screen'};
    });
    await scenario('E53-TR2 real MZ: zero-write final failure retains outgoing/dex/ordinal, retry installs the same prepared incoming once',async()=>{
      const {content,old}=fixture(false);let fail=false,writes=0,draws=0;const app=new B.app.GameApplication({state:{read:()=>game(),replace:(next:any)=>{if(fail)throw Error('TR2 injected final zero-write');writes++;G.$gameSystem._psGame=next;}},content:()=>({content}),sessions:{create:()=>{throw Error('TR2 no battle');}},projection:{project:()=>{}},random:()=>{draws++;return 0;},clock:()=>0});W.PSFlow._app=app;const before=clone(game()),intent={outgoingId:old.id,incoming:{species:'blastoise'},foreignOwner:{name:'RetryNPC'}};W.PSFlow.beginTrade('nw-trade2',intent);answer({kind:'confirm',accept:true});eq(answer({kind:'presented'}).view.phase,'ready','no extra evolution or Info');const reservedDraws=draws;fail=true;eq(answer({kind:'commit'}).view.phase,'failed','final failure held');eq(game(),before,'no loss of old member or ordinal');eq(writes,0,'zero actual writes');assert(app.saveBlocked,'failure retains owner');fail=false;eq(answer({kind:'retry'}).status,'committed','same next installs');eq(writes,1,'one final write');eq(draws,reservedDraws,'no redraw');eq(game().stats.trade_count,1,'one trade stat');assert(game().party[0].id!==old.id,'incoming fresh identity');await save(68,intent,'nw-trade2');return {slot:68,input:'actual MZ services/save with explicitly injected application state port, not a real storage failure'};
    });
  }

  // Programmatic continuation answers only; formal Info screens belong to H after M1.
  function drainInstalledDex(): any {
    let last: any;
    for (let i=0;i<32&&W.PSFlow.app().pendingPokedex;i++) {
      const p=W.PSFlow.app().pendingPokedex;assert(p.purpose==='entry'&&p.phase!=='failed','healthy installed Info continuation');
      last=W.PSFlow.resolvePokedex(p.token,p.revision,{kind:p.phase==='message'?'message-complete':'close-entry'});assert(last.status!=='refused','valid owned Info answer');
    }
    assert(!W.PSFlow.app().pendingPokedex,'finite Info continuation completed');return last;
  }

  async function runAcquisitionTransactions() {
    await toMap(); const B=api(),cases:any[]=[];
    function fixture():any {
      const content=progressionContent(false,inputs=>{inputs.overlays=[];const source=inputs.species[0].source;
        inputs.items=[{id:'pokeball',name:'Fixture Ball',pocket:3,flags:['PokeBall'],fieldUse:'none',battleUse:'ball',battleId:'pokeball',source}];
        inputs.grants=[{id:'host-acq',members:[{species:'blastoise',level:5}],items:{pokeball:2},money:7,source}];});
      const old=B.speciesKey.toPersistentMember(B.memberFactory.createMember({id:'ACQUISITION-OLD',species:B.speciesKey.battleNameOf(content,{species:'charizard',form:0}),level:5},content,()=>0),content);
      const state=B.state.newGame({party:[old],content});state.dex.hasDex=true;state.dex.unlocked[0]=true;
      W.PSFlow._content=content;G.$gameSystem._psGame=state;W.PSFlow.stateReplaced();
      const fault={mode:'normal',unread:false,missing:false,writes:0};
      const app=new B.app.GameApplication({state:{read:()=>{if(fault.unread)throw Error('AC injected readback unavailable');return game();},replace:(next:any)=>{if(fault.mode==='zero')return;fault.writes++;G.$gameSystem._psGame=next;if(fault.mode==='postwrite')throw Error('AC injected after write');if(fault.mode==='readback')fault.unread=true;}},content:()=>{if(fault.missing)throw Error('AC injected content unavailable');return{content};},sessions:{create:()=>{throw Error('AC no battle');}},projection:{project:()=>{}},random:()=>0,clock:()=>0},{receivingProfile:{mode:1,naming:1}});
      W.PSFlow._app=app;return{content,app,fault};
    }
    async function save(slot:number):Promise<void>{await settledSave(slot);cases.push({slot,state:clone(game()),content:clone(W.PSFlow.content())});fs.writeFileSync(path.join(path.dirname(OUT||'.'),'ps-flow-expected-acquisition.json'),JSON.stringify({cases}));}
    await scenario('E53-AC1 real MZ: gift/silent-party/grant source-specific full dex registration installs with members, resources and claim',async()=>{
      const {app,fault}=fixture();eq(app.receiveGift({kind:'normal',member:{species:'gengar',level:5}}).status,'applied','normal gift');assert(game().dex.seenForms.gengar?.length,'precise normal form');drainInstalledDex();eq(app.receiveGift({kind:'party-silent',seeForm:false,member:{species:'blastoise',level:5}}).status,'applied','silent party gift');assert(game().dex.owned.includes('blastoise')&&!game().dex.seen.includes('blastoise'),'owned does not imply seen');assert(!game().dex.seenForms.blastoise,'seeForm false creates no form record');
      const money=game().money;eq(app.claimGrant('host-acq').status,'applied','one whole grant');assert(game().dex.seen.includes('blastoise')&&game().dex.seenForms.blastoise?.length&&game().dex.lastSeenForm.blastoise,'grant registers full form');eq(game().money,money+7,'grant money');eq(B.inventory.itemQuantity(game().inventory,'pokeball',W.PSFlow.content().items),2,'grant items');eq(game().dex.capturedCounts,{},'gifts do not count captures');eq(game().dex.defeatedCounts,{},'gifts do not count defeats');eq(fault.writes,3,'one primary install per source action');drainInstalledDex();const before=clone(game());eq(app.claimGrant('host-acq').status,'already-claimed','replay');eq(game(),before,'replay zero change');assert(!app.saveBlocked,'released');await save(69);await shot('E53-AC1-full-registration');return{slot:69,input:'actual MZ application/save and authored compiled content; direct service calls, no ordinary Info page or hardware input'};
    });
    await scenario('E53-AC2 real MZ: zero-write termination, full-write throw and lost readback preserve exact acquisition installation',async()=>{
      const {app,fault}=fixture(),before=clone(game());fault.mode='zero';let out=app.receiveGift({kind:'silent',member:{species:'gengar',level:5}});eq(out.status,'pending','uninstalled result never applied');eq(game(),before,'zero write');assert(app.saveBlocked&&!G.$gameSystem.isSaveEnabled(),'actual host save mask');let refused=false;try{await G.DataManager.saveGame(70);}catch{refused=true;}assert(refused,'actual direct save refuses');eq(W.PSFlow.terminateAcquisition(out.token).status,'aborted','proved zero-write technical termination');eq(game(),before,'no compensating write');assert(!app.saveBlocked,'termination released');
      fault.mode='postwrite';eq(app.receiveGift({kind:'silent',member:{species:'gengar',level:5}}).status,'applied','complete next proved despite postwrite throw');eq(fault.writes,1,'no duplicate receive');fault.mode='readback';out=app.claimGrant('host-acq');eq(out.status,'pending','readback unknown retains owner');eq(fault.writes,2,'grant installed once');fault.unread=false;fault.missing=true;eq(app.resolveReceiving(out.token).status,'applied','acknowledges exact installed next before unavailable content');eq(fault.writes,2,'no duplicate claim or body');fault.missing=false;fault.mode='normal';drainInstalledDex();assert(!app.pendingReceiving&&!app.saveBlocked,'released');await save(70);return{slot:70,saveRefused:refused,input:'actual MZ bridge/JsonEx/save guards with explicit application StatePort faults; not physical input or a real disk failure'};
    });
  }

  async function runDexViewing() {
    await toMap();const B=api(),cases:any[]=[];
    function fixture(moreOften=true):any {
      const content=progressionContent(false,inputs=>{inputs.overlays=[];const source=inputs.species[0].source;
        inputs.settings={...inputs.settings,SHOW_NEW_SPECIES_POKEDEX_ENTRY_MORE_OFTEN:moreOften,DEX_SHOWS_ALL_FORMS:true};
        inputs.items=['pokeball','masterball'].map(id=>({id,name:id,pocket:3,flags:['PokeBall'],fieldUse:'none',battleUse:'ball',battleId:id,source}));
        inputs.grants=[{id:'view-grant',members:[{species:'pidgey',level:3}],items:{pokeball:2},money:7,source}];
        const base=inputs.species.find((s:any)=>s.id==='charizard');base.learnset=['tackle','rest','roost','flamethrower'].map(move=>({level:1,move}));base.evolutions=[{method:'Event',parameter:7,target:'blastoise'}];inputs.species.find((s:any)=>s.id==='blastoise').learnset=[{level:5,move:'gust'}];});
      const member=B.speciesKey.toPersistentMember(B.memberFactory.createMember({id:'VIEW-ORIGINAL',species:B.speciesKey.battleNameOf(content,{species:'charizard',form:0}),level:5},content,()=>0),content),state=B.state.newGame({party:[member],content});state.dex.hasDex=true;state.dex.unlocked[0]=true;state.dex.seen=['gengar'];state.dex.seenForms.gengar=[{gender:0,form:0,shiny:false}];state.dex.lastSeenForm.gengar={gender:0,form:0,shiny:false};state.inventory=B.inventory.addItems(state.inventory,'masterball',1,content.items,B.inventory.inventoryPolicy(content));
      W.PSFlow._content=content;G.$gameSystem._psGame=state;W.PSFlow.stateReplaced();G.$gameMessage.clear();
      const fault={zero:false,writes:0};const factory=B.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4]});
      const app=new B.app.GameApplication({state:{read:()=>game(),replace:(next:any)=>{if(fault.zero)throw Error('DV explicit zero write');fault.writes++;G.$gameSystem._psGame=next;}},content:()=>({content}),sessions:factory,projection:{project:(outcome:any)=>W.PSFlow.projectOutcome(outcome)},random:()=>0,clock:()=>0},{receivingProfile:{mode:1,naming:1}});W.PSFlow._app=app;return{app,content,fault,member};
    }
    const answer=(decision:any)=>{const p=W.PSFlow.app().pendingPokedex;assert(p,'active installed dex owner');return W.PSFlow.resolvePokedex(p.token,p.revision,decision);};
    async function save(slot:number):Promise<void>{await settledSave(slot);cases.push({slot,state:clone(game()),content:clone(W.PSFlow.content())});fs.writeFileSync(path.join(path.dirname(OUT||'.'),'ps-flow-expected-viewing.json'),JSON.stringify({cases}));}
    await scenario('E53-DV1 actual MZ: installed gift message/recent/Info and explicit viewing use one save owner without render writes',async()=>{
      const {app,fault}=fixture(),out=app.receiveGift({kind:'normal',member:{species:'gengar',level:5}});eq(out.status,'applied','primary acquired');const primary=clone(game()),p=app.pendingPokedex;assert(p&&p.phase==='message','message after primary');eq(p.entry.previouslyOwned,false,'first-owned truth retained');eq(game().dex.lastSeenForm.gengar.shiny,false,'old sighting before message');const waiter=new G.Game_Interpreter();assert(W.PSFlow.waitForPokedex(waiter)&&waiter.updateWaitMode(),'actual interpreter waiting');assert(!G.$gameSystem.isSaveEnabled(),'menu save masked');let refused=false;try{await G.DataManager.saveGame(71);}catch{refused=true;}assert(refused,'direct save refuses');W.PSFlow.pokedexSnapshot();eq(game(),primary,'snapshot zero writes');eq(fault.writes,1,'only primary');
      eq(answer({kind:'message-complete'}).view.phase,'entry','recent before Info');const received=game().party.at(-1);eq(game().dex.lastSeenForm.gengar.shiny,received.shiny,'actual shiny recent retained');eq(fault.writes,2,'one explicit recent write');answer({kind:'close-entry'});assert(!waiter.updateWaitMode()&&!app.saveBlocked,'terminal release');eq(W.PSFlow.updatePokedex({kind:'view',value:{mode:4,cursor:0}}).status,'applied','viewing persists');eq(W.PSFlow.updatePokedex({kind:'form',species:'gengar',baseFrontsEqual:false,selected:0}).status,'applied','explicit Forms selection');eq(game().dex.lastSeenForm.gengar.shiny,false,'Forms deliberate ordinary preview');eq(app.claimGrant('view-grant').status,'applied','grant');drainInstalledDex();await save(71);await shot('E53-DV1-installed-viewing');return{slot:71,saveRefused:refused,input:'actual MZ bridge/interpreter/save, authored content, explicit Info-stage answers; no formal H screen or hardware input'};
    });
    await scenario('E53-DV2 actual NW Showdown capture: primary XP/hash/count survives Info, no second observation or capture',async()=>{
      const {app}=fixture(false),request={battleId:'view-capture',kind:'wild',seq:1,foes:[{species:'pidgey',level:3}],resultVariable:0,canLose:true},session=await app.startBattle(request);assert((await session.throwBall('masterball')).ok,'actual capture');const raw=session.result(),op={request,session};W.PSFlow._op=op;W.PSFlow.request=request;W.PSFlow.running=true;const done=W.PSFlow.finish(session,op);eq(done.commit,'applied','primary installed');assert(done.pending&&app.pendingPokedex.entry.source==='capture','capture Info ignores more-often switch');const waiter=new G.Game_Interpreter();waiter.setWaitMode('psBattle');waiter._psBattleId=request.battleId;assert(waiter.updateWaitMode(),'same real battle wait');eq(game().dex.capturedCounts.pidgey,1,'one capture');eq(game().appliedBattles[raw.battleId].hash,B.state.resultHash(raw),'raw result hash');const primary=clone(game());drainInstalledDex();eq(game().dex.capturedCounts.pidgey,1,'Info no recapture');eq(game().party.map((m:any)=>m.id),primary.party.map((m:any)=>m.id),'same accepted member IDs');assert(!app.saveBlocked&&!waiter.updateWaitMode(),'full battle/Info owner released');eq(app.commitResult(raw),'already-applied','ledger replay');G.$gameMessage.clear();await save(72);return{slot:72,input:'actual pinned Showdown session inside NW/MZ, actual capture and PSFlow finish; direct Info answers, no formal battle/Info screen or physical input'};
    });
    await scenario('E53-DV3 actual MZ event: body then new-species Info before full-slot learning under the same owner',async()=>{
      const {app,member}=fixture();const start=W.PSFlow.beginEventEvolution({event:7,memberId:member.id});eq(start.status,'pending','event matched');const waiter=new G.Game_Interpreter();waiter.setWaitMode('psEvolutionAction');waiter._psEvolutionActionToken=start.view.token;let p=app.pendingEvolution;W.PSFlow.resolveEvolution(p.token,p.revision,{kind:'complete'});eq(game().party[0].species,'blastoise','body committed');eq(game().stats.evolution_count,1,'one body');eq(app.pendingEvolution.phase,'after-evolution','learning held');assert(waiter.updateWaitMode()&&app.pendingPokedex&&app.saveBlocked,'continuous owner');drainInstalledDex();eq(app.pendingEvolution.phase,'learning','after Info');p=app.pendingEvolution;eq(W.PSFlow.resolveEvolution(p.token,p.revision,{kind:'learn',answer:{kind:'replace',slot:0}}).status,'committed','lesson and parent complete');assert(game().party[0].moves.some((m:any)=>m.id==='gust'),'learned once');eq(game().stats.evolution_count,1,'no repeated body');assert(!waiter.updateWaitMode()&&!app.saveBlocked,'release');await save(73);return{slot:73,input:'actual MZ bridge/event/save and direct evolution/Info/learning answers, no formal G/H screen'};
    });
    await scenario('E53-DV4 actual MZ: technical recent stop preserves gift; failed viewing retries only its small edit',async()=>{
      const {app,fault}=fixture();app.receiveGift({kind:'normal',member:{species:'gengar',level:5}});const primary=clone(game());fault.zero=true;eq(answer({kind:'message-complete'}).view.phase,'failed','recent write failed');eq(game(),primary,'gift retained');eq(answer({kind:'technical-terminate'}).status,'technically-terminated','safe exit');eq(game(),primary,'no rollback');eq(app.updatePokedex({kind:'view',value:{mode:5}}).status,'pending','zero-write edit');assert(app.saveBlocked,'edit lock');fault.zero=false;eq(answer({kind:'retry'}).status,'applied','same edit');eq(game().dex.view.mode,5,'mode only');assert(!app.saveBlocked,'released');await save(74);return{slot:74,input:'actual MZ host with explicit injected application StatePort zero-write, not a disk fault'};
    });
  }

  async function runTradeUI() {
    await toMap();await toMapId(5,8,8);const B=api(),cases:any[]=[];
    const current=()=>W.PSEvolution.current();
    const ready=async(layer?:string)=>waitFor(()=>current()?.ready&&(!layer||current().layer===layer)&&!G.SceneManager.isSceneChanging(),'trade UI '+(layer??''));
    const phase=async(value:string)=>waitFor(()=>current()?.ready&&current().tradeTimeline?.phase===value,'trade phase '+value);
    const closed=async()=>waitFor(()=>!current()&&!!scene()?._spriteset&&!G.SceneManager.isSceneChanging(),'trade closed');
    function fixture(hasDex=true):any {
      const content=progressionContent(false,inputs=>{inputs.grants=[];inputs.overlays=[];const source=inputs.species[0].source;
        inputs.species.push({...inputs.species.find((sp:any)=>sp.id==='charizard'),id:'host-haunter',showdownId:'haunter',nameKey:'host.haunter',learnset:['tackle','rest','roost','flamethrower'].map(move=>({level:1,move})),evolutions:[{method:'Trade',target:'gengar'}]});inputs.species.find((sp:any)=>sp.id==='gengar').learnset=[{level:50,move:'gust'}];
        inputs.items=[{id:'pokeball',name:'Fixture Ball',pocket:3,flags:['PokeBall'],fieldUse:'none',battleUse:'ball',battleId:'pokeball',source}];});
      const old=B.speciesKey.toPersistentMember(B.memberFactory.createMember({id:'TRADE-UI-OLD',species:B.speciesKey.battleNameOf(content,{species:'charizard',form:0}),level:50,context:{map:G.$gameMap.mapId(),receivedAt:1}},content,()=>0),content),state=B.state.newGame({party:[old],content});state.dex.hasDex=hasDex;state.dex.unlocked[0]=true;
      W.PSFlow._content=content;G.$gameSystem._psGame=state;W.PSFlow.stateReplaced();return {content,app:W.PSFlow.app(),old};
    }
    const command=(requestId:string,intent:any)=>{const i=new G.Game_Interpreter();G.PluginManager.callCommand(i,'PS_Evolution','ScriptTrade',{requestId,intent:JSON.stringify(intent)});return i;};
    const present=async()=>{await ready('trade-offer');await press('ok');await phase('card');await press('cancel');await phase('outgoing');await phase('sending');await press('ok');await phase('farewell');await press('cancel');await phase('incoming');await phase('received');await press('ok');await phase('care');await shot('G53-trade-received-card');await press('ok');};
    const chooseLesson=async(key:string)=>{await ready('learning');let n=0;while(current().lesson.rows[current().lesson.cursor]?.key!==key&&n++<60)await press('down');eq(current().lesson.rows[current().lesson.cursor]?.key,key,'trade learning choice');await press('ok');};
    const checkpoint=async(slot:number,content:any,intent?:any,requestId?:string)=>{await settledSave(slot);cases.push({slot,content,state:clone(game()),...(intent?{intent,requestId}: {})});fs.writeFileSync(path.join(path.dirname(OUT||'.'),'ps-flow-expected-trade-ui.json'),JSON.stringify({cases}));};
    await scenario('G53-TUI1 real sample map event selector cancellation and offer cancellation leave state untouched',async()=>{
      const {content,old,app}=fixture(false),before=clone(game());G.$gameMap.event(8).start();await waitFor(()=>W.PSManagement.current()?.ready,'sample trade selector');await press('cancel');await closed();await dismissMessages();eq(game(),before,'selector zero-write');assert(!app.pendingTrade&&!app.saveBlocked,'selector releases owner');
      const waiter=command('trade-ui-cancel',{outgoingId:old.id,incoming:{species:'blastoise'},foreignOwner:{name:'CancelNPC'}});await ready('trade-offer');assert(waiter.updateWaitMode()&&!G.$gameSystem.isSaveEnabled(),'offer wait/save guard');await press('cancel');await closed();assert(!waiter.updateWaitMode(),'offer waiter released');eq(waiter._psTradeOutcome.status,'cancelled','caller exact domain result');eq(game(),before,'offer zero-write');await checkpoint(87,content);return{slot:87,input:'actual map event8, reused party selector and formal offer with DOM keys'};
    });
    await scenario('G53-TUI2 two draft Info pages and uncancellable evolution/learning precede one live swap',async()=>{
      const {content,old,app}=fixture(),before=clone(game()),intent={outgoingId:old.id,incoming:{species:'host-haunter'},nickname:'Contract',foreignOwner:{name:'NPC'}},requestId='trade-ui-success',waiter=command(requestId,intent);
      if(mode==='battle-entry'){await ready('trade-offer');const owner=clone(app.pendingTrade),op=W.PSFlow._op,next=G.SceneManager._nextScene,saved=clone(game());let core=false,host=false;try{await app.startBattle({battleId:'AR-pending-core',kind:'wild',foes:[{species:'blastoise',level:5}],seq:90});}catch{core=true;}try{W.PSFlow.openBattle({battleId:'AR-pending-host',kind:'wild',foes:[{species:'blastoise',level:5}],seq:91});}catch{host=true;}assert(core&&host,'pending trade refuses both formal entries');eq(app.pendingTrade,owner,'exact draft token/revision retained');assert(W.PSFlow._op===op&&G.SceneManager._nextScene===next,'no host owner or queued scene replacement');eq(game(),saved,'no write before refusal');}
      await present();await ready('dex-message');eq(game(),before,'received is a draft');assert(waiter.updateWaitMode()&&app.saveBlocked,'same owner through Info');let refused=false;try{await G.DataManager.saveGame(91);}catch{refused=true;}assert(refused,'direct save rejects private draft');await press('ok');await ready('entry');await shot('G53-trade-draft-Info');eq(game(),before,'Info does not write global dex');await press('ok');await waitFor(()=>current()?.timeline?.phase==='what'&&current()?.ready,'trade evolution');assert(!app.pendingEvolution.selection.cancellable,'trade evolution cannot cancel');await press('ok');await waitFor(()=>current()?.timeline?.phase==='animation','trade animation');await press('cancel');await waitFor(()=>current()?.timeline?.phase==='success','trade success');eq(game(),before,'still no live body at success message');await waitFor(()=>current()?.timeline?.successReady,'trade success wait');await press('ok');await ready('dex-message');await press('ok');await ready('entry');eq(app.pendingTrade.entry.stage,'evolved','second draft Info');await press('ok');await ready('learning');await chooseLesson('yes');await chooseLesson('1');eq(game(),before,'lesson remains draft through success feedback');await chooseLesson('close');await closed();assert(!waiter.updateWaitMode()&&!app.saveBlocked,'single caller released');eq(waiter._psTradeOutcome.status,'committed','actual commit result');eq(game().party[0].species,'gengar','evolved incoming installed');eq(game().party[0].moves[1].id,'gust','lesson installed');eq(game().stats.trade_count,1,'one trade');eq(game().stats.evolution_count,1,'one evolution');
      const installed=clone(game()),copy=waiter._psTradeOutcome;copy.status='not-the-result';eq(waiter._psTradeOutcome.status,'committed','receipt is a defensive clone');
      const legalBattle=async(expectReceipt:boolean)=>{const request={battleId:'AR-after-trade-'+(expectReceipt?'receipt':'retired'),kind:'wild',foes:[{species:'gengar',level:50}],seq:92};await app.startBattle(request);eq(waiter._psTradeOutcome?.status,expectReceipt?'committed':undefined,'core opening does not relabel receipt');app.abortBattle(request,Error('AR isolated opening complete'));W.PSFlow.openBattle({...request,battleId:request.battleId+'-host'});eq(waiter._psTradeOutcome?.status,expectReceipt?'committed':undefined,'host opening does not relabel receipt');W.PSFlow.abort(Error('AR isolated host opening complete'),W.PSFlow._op);G.SceneManager.goto(G.Scene_Map);await closed();await frames(4);eq(game(),installed,'opening/abort never repeats trade');};
      if(mode==='battle-entry')await legalBattle(true);
      const replay=async()=>{G.PluginManager.callCommand(waiter,'PS_Evolution','ScriptTrade',{requestId,intent:JSON.stringify(intent)});await closed();await frames(4);assert(!waiter.updateWaitMode(),'idempotent replay completed');eq(waiter._psTradeOutcome.status,'committed','this attempt received its own cached domain result');eq(game(),installed,'no second swap on replay');};
      G.$gameMessage.add('Receipt scope test');G.PluginManager.callCommand(waiter,'PS_Evolution','ScriptTrade',{requestId:'result-busy',intent:JSON.stringify(intent)});eq(waiter._psTradeOutcome,undefined,'same-event busy attempt retires success');eq(waiter._psEvolutionOutcome,undefined,'generic alias retired too');await dismissMessages();if(mode==='battle-entry')await legalBattle(false);
      await replay();G.PluginManager.callCommand(waiter,'PS_Evolution','ScriptTrade',{requestId:'result-json',intent:'{bad'});eq(waiter._psTradeOutcome,undefined,'invalid JSON retires before parse');await dismissMessages();
      await replay();waiter.setup([],77);eq(waiter._psTradeOutcome,undefined,'actual Reactor setup calls wrapped clear');eq(waiter._psEvolutionOutcome,undefined,'actual setup clears generic result');
      await replay();waiter.terminate();eq(waiter._psTradeOutcome,undefined,'actual terminate retires the receipt');
      await replay();G.PluginManager.callCommand(waiter,'PS_Evolution','ShowTrade',{});eq(waiter._psTradeOutcome,undefined,'empty resume has no previous success');
      await replay();G.SceneManager.goto(G.Scene_Map);G.PluginManager.callCommand(waiter,'PS_Evolution','ScriptTrade',{requestId:'result-changing',intent:JSON.stringify(intent)});eq(waiter._psTradeOutcome,undefined,'scene-changing unopened command retires prior result');await closed();await frames(4);eq(game(),installed,'all unopened attempts leave the entire trade state unchanged');assert(!app.pendingTrade&&!app.saveBlocked,'no new domain owner');
      await checkpoint(88,content,intent,requestId);return{slot:88,input:'actual MZ trade/Info/evolution/learning plus native interpreter setup/clear/terminate and same-instance blocked/JSON/ShowTrade attempts, JsonEx; no repeated swap'};
    });
    await scenario('G53-TUI3 zero-write final installation failure retries only installation through formal recovery',async()=>{
      const {content,old}=fixture(false);let fail=false,writes=0,draws=0;const app=new B.app.GameApplication({state:{read:()=>game(),replace:(next:any)=>{if(fail)throw Error('TUI3 explicit zero-write port');writes++;G.$gameSystem._psGame=next;}},content:()=>({content}),sessions:{create:()=>{throw Error('no battle');}},projection:{project:()=>{}},random:()=>{draws++;return 0;},clock:()=>0});W.PSFlow._app=app;const before=clone(game()),intent={outgoingId:old.id,incoming:{species:'blastoise'},foreignOwner:{name:'RetryNPC'}},requestId='trade-ui-retry',waiter=command(requestId,intent);fail=true;await present();await ready('recovery');eq(game(),before,'zero-write retains outgoing');eq(writes,0,'no hidden prefix writes');assert(waiter.updateWaitMode()&&app.saveBlocked,'recovery owns the same request');const usedDraws=draws;await shot('G53-trade-recovery');fail=false;await press('ok');await closed();assert(!waiter.updateWaitMode(),'retry waiter closed');eq(waiter._psTradeOutcome.status,'committed','caller gets committed');eq(writes,1,'one install');eq(draws,usedDraws,'no reroll');eq(game().stats.trade_count,1,'one statistic');await checkpoint(89,content,intent,requestId);return{slot:89,input:'actual formal MZ UI/save with explicit zero-write application port injection, not disk failure'};
    });
    await scenario('G53-TUI4 selector window reload cannot create an owner in the replacement generation',async()=>{
      const {content,old,app}=fixture(false),before=clone(game()),generation=app.stateGeneration,original=G.Window_Base.prototype.initialize;let changed=false;const wrapped=function(this:any,...args:any[]){const result=original.apply(this,args);if(!changed){changed=true;app.stateReplacedByHost();}return result;};G.Window_Base.prototype.initialize=wrapped;
      try{const handle=W.PSEvolution.trade('trade-ui-window-reload',{incoming:{species:'blastoise'},foreignOwner:{name:'ReloadNPC'}});assert(handle,'selector handle');await waitFor(()=>changed,'real selector window construction');await waitFor(()=>handle.done&&!W.PSManagement.current()&&!G.SceneManager.isSceneChanging()&&!!scene()?._spriteset,'stale selector returns to Map');eq(app.stateGeneration,generation+1,'actual generation replacement');assert(!app.encounterBlocked&&!W.PSFlow.operationPending(),'no owner leaked into replacement');eq(game(),before,'no persistent writes');const next=app.beginTrade('trade-ui-after-reload',{outgoingId:old.id,incoming:{species:'blastoise'}});eq(next.status,'pending','replacement accepts a new legitimate owner');app.resolveTrade(next.view.token,next.view.revision,{kind:'technical-terminate'});return{input:'real MZ Window_Base lifecycle callback with explicit same-app generation replacement; no hardware or real load/disk fault'};}finally{if(G.Window_Base.prototype.initialize===wrapped)G.Window_Base.prototype.initialize=original;}
    });
  }

  async function runPokedexUI() {
    await toMap();await toMapId(5,8,8);assert(W.PSPokedex?.open,'formal dex plugin loaded from current manifest bridge');W.PSFlow._content=null;W.PSFlow._app=null;fresh();const B=api(),originalContent=clone(W.PSFlow.content()),originalGame=clone(game()),cases:any[]=[];
    const current=()=>W.PSPokedex.current(),ready=async(kind:string)=>waitFor(()=>current()?.ready&&current().view.kind===kind,'dex UI '+kind),closed=async()=>{await waitFor(()=>!current()&&!G.SceneManager.isSceneChanging()&&!!scene()?._spriteset,'dex closed to map');await dismissMessages();};
    function fixture(hasDex=true,edit?:(content:any,state:any)=>void){const content=clone(originalContent),state=clone(originalGame),a=state.party[0].species,b=state.party[1].species,c=state.party[2].species;
      content.regionalDex.regions=[{id:0,nameKey:'region.sample',species:[a,b,c]},{id:1,nameKey:'region.sample',species:[c]}];content.regionalDex.layoutIdentity=B.dexState.dexLayoutIdentity(content.regionalDex);
      const source=B.speciesKey.speciesDataOf(content,state.party[0]);content.forms[a][1]='Charizard-UI';content.species['Charizard-UI']={...clone(source),formName:'UI Alternate',pokedexForm:1};
      state.dex.layoutIdentity=content.regionalDex.layoutIdentity;state.dex.hasDex=hasDex;state.dex.unlocked=[true,true,true];state.dex.view={region:-1,indices:[0,0,0],mode:0};state.dex.seen=[a,c];state.dex.owned=[a];state.dex.lastSeenForm={[a]:{form:0,gender:0,shiny:true}};state.dex.seenForms={[a]:[{form:0,gender:0,shiny:true},{form:1,gender:0,shiny:false}]};
      edit?.(content,state);content.regionalDex.layoutIdentity=B.dexState.dexLayoutIdentity(content.regionalDex);state.dex.layoutIdentity=content.regionalDex.layoutIdentity;
      const authored=clone(content);delete authored.meta;const inputsHash=B.digest.sha256Hex(B.contentCompile.canonicalJson(authored));content.meta={...content.meta,kind:'fixture',id:'H1-dex-ui',inputsHash,contentIdentity:B.digest.sha256Hex(B.contentCompile.canonicalJson({compiledSemantics:content.meta.compiledSemantics,inputsHash,showdownSha:content.meta.showdownSha}))};
      W.PSFlow._content=content;G.$gameSystem._psGame=state;W.PSFlow.stateReplaced();const fault={zero:false,partial:false,readHook:null as null|(()=>void)};const app=new B.app.GameApplication({state:{read:()=>{const hook=fault.readHook;fault.readHook=null;hook?.();return game();},replace:(n:any)=>{if(fault.zero)throw Error('H1 explicit zero-write');if(fault.partial){G.$gameSystem._psGame={...clone(n),money:n.money+1};throw Error('H1 explicit partial-install');}G.$gameSystem._psGame=n;}},content:()=>({content}),sessions:{create:()=>{throw Error('no battle in H1 UI fixture');}},projection:{project:()=>{}},random:()=>0,clock:()=>0});W.PSFlow._app=app;return{app,a,c,fault};
    }
    const checkpoint=async(slot:number)=>{await settledSave(slot);cases.push({slot,state:clone(game()),content:clone(W.PSFlow.content())});fs.writeFileSync(path.join(path.dirname(OUT||'.'),'ps-flow-expected-pokedex-ui.json'),JSON.stringify({cases}));};
    await scenario('H53-UI1 actual menu entitlement and Map005 event9 grant/unlock/browse wait',async()=>{const {app}=fixture(false),window=new G.Window_MenuCommand(new G.Rectangle(0,0,300,600));assert(!window._list.some((r:any)=>r.symbol==='psPokedex'),'normal menu hidden without dex');window.destroy();const event=G.$gameMap.event(9);assert(event,'real slice event9');event.start();await ready('regions');assert(G.$gameMap._interpreter._waitMode==='psPokedex','event waits for owned dex UI');await shot('H53-region-counts');await press('cancel');await closed();await waitFor(()=>!G.$gameMap._interpreter.isRunning(),'event resumes after own close');assert(app.pokedexSnapshot().dex.hasDex,'grant retained');await checkpoint(97);return{slot:97,input:'real MZ menu plus real slice event start and DOM cancellation; placeholder media'};});
    await scenario('H53-UI2 region numerical unseen gate, pages, multi-form viewing writes and Back retention',async()=>{const {a,c,app}=fixture();W.PSPokedex.open();await ready('regions');await press('ok');await ready('list');await press('down');await ready('list');await press('ok');eq(current().view.kind,'list','unseen cannot open');await press('up');await ready('list');await press('ok');await ready('entry');await press('right');await press('right');await ready('entry');eq(current().view.page,2,'Forms clamp');eq(game().dex.lastSeenForm[a].shiny,true,'ordinary page refresh preserves shiny');await press('ok');await ready('forms');eq(game().dex.lastSeenForm[a].shiny,false,'selector first write');await press('up');await ready('forms');eq(game().dex.lastSeenForm[a].form,1,'wraps to last named form');await press('cancel');await ready('entry');eq(game().dex.lastSeenForm[a].form,1,'Back retains');await press('down');await ready('entry');eq(current().view.species,c,'skips unseen middle');await press('left');await ready('entry');eq(current().view.area.status,'unknown','no fabricated world points');await shot('H53-unknown-area');await press('cancel');await ready('list');await press('cancel');await ready('regions');await press('cancel');await closed();assert(!app.saveBlocked,'view edits finished');await checkpoint(98);return{slot:98,input:'actual MZ region/list/three pages/form selector and complete saved view records; no art pixels claimed'};});
    await scenario('H53-UI3 zero-write retry and same-generation interrupted window initialization',async()=>{const {app,fault}=fixture();W.PSPokedex.open();await ready('regions');await press('ok');await ready('list');const before=clone(game());fault.zero=true;await press('down');await ready('recovery');eq(game(),before,'zero write no prefix');assert(app.saveBlocked,'owned edit blocks save');fault.zero=false;await press('ok');await ready('list');eq(game().dex.view.indices[0],1,'same cursor edit applied');await press('cancel');await ready('regions');await press('cancel');await closed();let replaced=false;const initialize=G.Window_Base.prototype.initialize;G.Window_Base.prototype.initialize=function(this:any,...args:any[]){const out=initialize.apply(this,args);if(!replaced){replaced=true;app.stateReplacedByHost();}return out;};try{W.PSPokedex.open();await waitFor(()=>replaced&&!W.PSPokedex.busy()&&!G.SceneManager.isSceneChanging()&&!!scene()?._spriteset,'stale constructor returns to map');}finally{G.Window_Base.prototype.initialize=initialize;}assert(!app.saveBlocked,'no stale owner');await checkpoint(99);return{slot:99,input:'actual MZ window lifecycle and explicit zero-write application port; not real disk fault'};});
    await scenario('H53-UI4 English and Chinese long-name real layout, no inferred physical input or media',async()=>{const {app}=fixture(),translator=W.PSFlow.translator,content=W.PSFlow.content(),member=game().party[0],data=B.speciesKey.speciesDataOf(content,member);const key=data.nameKey;try{for(const locale of ['en','zh']){const base=B.i18n.translatorFor(locale);W.PSFlow.translator=()=>({...base,tOr:(k:string,f:string)=>k===key?(locale==='zh'?'超长中文图鉴名字'.repeat(20):'Very long localized dex name '.repeat(20)):base.tOr(k,f)});W.PSPokedex.open();await ready('regions');await press('ok');await ready('list');await press('ok');await ready('entry');await shot('H53-long-name-'+locale);await press('cancel');await ready('list');await press('cancel');await ready('regions');await press('cancel');await closed();}}finally{W.PSFlow.translator=translator;}assert(!app.saveBlocked,'layout loops clean');await checkpoint(100);return{slot:100,input:'actual MZ font/layout and screenshots in en/zh with synthetic DOM keys; not OS keyboard/IME/controller'};});
    await scenario('H53-UI5 actual installed entry interpreter wait survives H plugin and releases only exact token',async()=>{const {app,c}=fixture(),out=app.receiveGift({kind:'normal',member:{species:c,level:5}},{profile:{mode:1,naming:1}});eq(out.status,'applied','real installed gift');const p=app.pendingPokedex;assert(p&&p.purpose==='entry','pending installed entry');const waiter=new G.Game_Interpreter(),other=new G.Game_Interpreter();assert(W.PSFlow.waitForPokedex(waiter)&&waiter.updateWaitMode(),'real loaded-order interpreter waits');other.clear();other.terminate();assert(waiter.updateWaitMode(),'other interpreter cannot release entry');eq(W.PSPokedex.open().status,'refused','browse cannot steal installed owner');assert(waiter.updateWaitMode(),'refused browse preserves wait');W.PSFlow.resolvePokedex(p.token,p.revision,{kind:'message-complete'});assert(waiter.updateWaitMode(),'Info continues exact wait');const entry=app.pendingPokedex;W.PSFlow.resolvePokedex(entry.token,entry.revision,{kind:'close-entry'});assert(!waiter.updateWaitMode()&&!app.saveBlocked,'exact terminal releases');const reused=new G.Game_Interpreter();reused._psPokedexToken=p.token;reused.clear();G.PluginManager.callCommand(reused,'PS_Pokedex','ShowPokedex',{});await ready('regions');assert(reused.updateWaitMode(),'explicit new browse clears retired legacy marker');await press('cancel');await closed();assert(!reused.updateWaitMode(),'new browse waiter ends once');await checkpoint(101);return{slot:101,input:'actual installed application gift and MZ interpreter loaded plugin chain; direct Info decisions, no physical input'};});
    await scenario('H53-UI6 actual opener callback cannot replace the bound recovery edit',async()=>{const {app,fault}=fixture();fault.zero=true;const old=app.updatePokedex({kind:'view',value:{mode:4}});assert(old.status==='pending','old edit retained');let successor:any;fault.readHook=()=>{app.resolvePokedex(old.view.token,old.view.revision,{kind:'technical-terminate'});successor=app.updatePokedex({kind:'view',value:{mode:5}});};const before=clone(game());eq(W.PSPokedex.open().status,'refused','old opener rejected');assert(successor?.status==='pending'&&app.pendingPokedex.token===successor.view.token,'successor retained');eq(game(),before,'no viewing write');fault.zero=false;await press('ok');eq(app.pendingPokedex.token,successor.view.token,'late Confirm does not consume successor');app.resolvePokedex(successor.view.token,successor.view.revision,{kind:'technical-terminate'});assert(!app.saveBlocked&&!W.PSPokedex.busy(),'owned recovery cleared explicitly');await checkpoint(102);return{slot:102,input:'actual MZ loaded host with explicitly reentrant StatePort callback, not physical disk fault'};});
    await scenario('H53-UI7 native changeScene preserves external target for normal, zero and partial termination',async()=>{for(const kind of ['normal','zero','partial']){const {app,fault}=fixture();if(kind!=='normal'){fault.zero=kind==='zero';fault.partial=kind==='partial';const r=app.updatePokedex({kind:'view',value:{mode:4}});assert(r.status==='pending','fault retained');}W.PSPokedex.open();await ready(kind==='normal'?'regions':'recovery');const oldScene=scene(),terminate=oldScene.terminate;let trace:any;oldScene.terminate=function(this:any,...args:any[]){const chosen=G.SceneManager._nextScene,stack=G.SceneManager._stack.length;const out=terminate.apply(this,args);trace={sameTarget:G.SceneManager._nextScene===chosen,before:stack,after:G.SceneManager._stack.length};return out;};G.SceneManager.goto(G.Scene_Map);const target=G.SceneManager._nextScene;await waitFor(()=>scene()===target&&!G.SceneManager.isSceneChanging()&&!!scene()?._spriteset,'exact external native target');assert(trace?.sameTarget,'terminate preserves exact nextScene');eq(trace.after,trace.before,'dispose does not pop stack before Map.start native clear');assert(!W.PSPokedex.busy(),'old presenter retired');eq(app.saveBlocked,kind==='partial','only indeterminate barrier remains');if(kind==='partial'){fault.partial=false;await G.DataManager.loadGame(102);assert(!W.PSFlow.app().saveBlocked,'actual load clears old generation');}}await checkpoint(103);return{slot:103,input:'real MZ changeScene terminate order, explicit StatePort zero/partial faults and actual DataManager reload; no OS input or real disk damage'};});
    await scenario('H53-UI8 queued browse overwritten before create ends event wait without unrelated polling',async()=>{const {app}=fixture(),before=clone(game()),i=new G.Game_Interpreter();G.PluginManager.callCommand(i,'PS_Pokedex','ShowPokedex',{});const queued=G.SceneManager._nextScene;assert(queued instanceof W.Scene_PSPokedex&&!queued._controller,'real native queue');assert(i.updateWaitMode(),'legitimate queued wait');G.SceneManager.goto(G.Scene_Map);const target=G.SceneManager._nextScene;for(let n=0;n<3;n++)eq(i.updateWaitMode(),false,'own wait directly detects overwritten queue');eq(game(),before,'no domain writes');await waitFor(()=>scene()===target&&scene().isStarted()&&!G.SceneManager.isSceneChanging(),'external exact map started');assert(!app.saveBlocked,'no orphan barrier');const active=new G.Game_Interpreter();G.PluginManager.callCommand(active,'PS_Pokedex','ShowPokedex',{});await ready('regions');assert(active.updateWaitMode(),'normal active still waits');await press('cancel');await closed();assert(!active.updateWaitMode(),'normal end');await checkpoint(104);return{slot:104,input:'actual native queued/overwritten _nextScene and direct interpreter wait before frames or busy, no synthetic domain owner'};});
    const drawn=()=>{const c=scene()._controller,b=scene()._window.contents,original=b.drawText,rows:any[]=[];b.drawText=function(...args:any[]){rows.push({value:String(args[0]),x:args[1],y:args[2],width:args[3],height:args[4],measured:scene()._window.textWidth(String(args[0]))});return original.apply(this,args);};try{c.draw();}finally{b.drawText=original;}for(const r of rows){assert(r.x>=0&&r.x+r.width<=b.width&&r.y>=0&&r.y+r.height<=b.height,'actual text rectangle inside bitmap');assert(r.measured<=r.width+0.01,'actual glyph width inside draw budget');}report.pokedexLayout??=[];report.pokedexLayout.push({view:current()?.view.kind,locale:W.PSFlow.translator().lang,width:b.width,height:b.height,rows});return rows;};
    await scenario('H53-UI9 actual en/zh long names reserve counters/owned glyph and authored body pages reach the end',async()=>{const translator=W.PSFlow.translator;try{for(const locale of ['en','zh']){const {app,a,c}=fixture(true,(content,state)=>{for(const data of Object.values(content.species)as any[]){data.entryKey='test.entry';data.categoryKey='test.category';}content.regionalDex.regions[0].species=[state.party[0].species];content.regionalDex.regions[0].nameKey='region.long';content.regionalDex.regions[1].species=[state.party[2].species];});const content=W.PSFlow.content(),nameKey=B.speciesKey.speciesDataOf(content,game().party[0]).nameKey,entryKey=B.speciesKey.speciesDataOf(content,game().party[0]).entryKey,body=(locale==='zh'?'完整中文图鉴正文。':'A complete long authored description. ').repeat(300)+'UNIQUE END OF ENTRY';const base=B.i18n.translatorFor(locale);W.PSFlow.translator=()=>({...base,tOr:(key:string,fallback:string)=>key==='region.long'?(locale==='zh'?'超长地区名称':'A very long region name ').repeat(80):key===nameKey?(locale==='zh'?'超长拥有物种名':'A very long owned species name ').repeat(80):key===entryKey?body:base.tOr(key,fallback)});W.PSPokedex.open();await ready('regions');let records=drawn(),row=records.find((r:any)=>r.value.startsWith('▶ '));assert(row.value.includes(locale==='zh'?'已见: 1 ✓':'Seen: 1 ✓')&&row.value.includes(locale==='zh'?'拥有: 1 ✓':'Owned: 1 ✓'),'actual counters and both checkmarks preserved');await shot('H53-final-counts-'+locale);await press('ok');await ready('list');records=drawn();assert(records.find((r:any)=>r.value.startsWith('▶ ')).value.includes('●'),'actual owned glyph survives long name');await shot('H53-final-owned-'+locale);await press('ok');await ready('entry');drawn();await shot('H53-final-body-first-'+locale);for(let n=0;n<200&&current().description.offset<Math.max(0,current().description.total-current().description.step);n++)await press('pagedown');records=drawn();assert(records.map((r:any)=>r.value).join('').includes('UNIQUE END OF ENTRY'),'full authored ending reachable');await shot('H53-final-body-last-'+locale);const offset=current().description.offset;await press('pageup');assert(current().description.offset<offset,'previous page works');await press('right');await press('right');await ready('entry');records=drawn();if(locale==='zh')assert(!records.some((r:any)=>/One Form|Male|Female|Genderless/.test(r.value)),'generated captions localized');await shot('H53-final-forms-'+locale);await press('cancel');await ready('list');await press('cancel');await ready('regions');await press('down');await press('ok');await ready('list');await press('ok');await ready('entry');eq(current().view.species,c,'unowned control');eq(current().view.info.entryKey,null,'unowned body remains concealed');drawn();await press('cancel');await ready('list');await press('cancel');await ready('regions');await press('cancel');await closed();assert(!app.saveBlocked,'read-only layout browsing no orphan');}}finally{W.PSFlow.translator=translator;}await checkpoint(105);return{slot:105,input:'actual bitmap draw rectangles/real glyph measurements plus capturePage en/zh/counts/owned/body first+last; DOM page input, placeholder media'};});
    await scenario('H53-UI10 recovery Back consumes zero/known-next terminal exactly once without false failure',async()=>{for(const mode of ['zero','next']){const {app,fault}=fixture();fault.zero=true;const p=app.updatePokedex({kind:'view',value:{mode:4}});assert(p.status==='pending','recovery pending');W.PSPokedex.open();await ready('recovery');if(mode==='next'){const next=clone(game());next.dex.view.mode=4;G.$gameSystem._psGame=next;}fault.zero=false;const original=app.resolvePokedex;let calls=0;app.resolvePokedex=function(...args:any[]){calls++;return original.apply(app,args);};try{G.$gameMessage.clear();await press('cancel');eq(calls,1,'one domain resolve');eq(G.$gameMessage._texts,[],'no unavailable message');await closed();assert(!app.saveBlocked,'known terminal released');}finally{app.resolvePokedex=original;}}await checkpoint(106);return{slot:106,input:'actual default recovery input with explicit before/next StatePort condition, not physical disk corruption'};});
  }

  async function runItemEvolutionUI() {
    await toMap();W.PSFlow._content=null;W.PSFlow._app=null;fresh();const B=api(),originalContent=clone(W.PSFlow.content()),originalGame=clone(game()),cases:any[]=[];
    const phase=async(value:string)=>waitFor(()=>itemEvolution()?.ready&&itemEvolution().timeline?.phase===value,'item evolution phase '+value);
    const count=(id:string)=>B.inventory.itemQuantity(game().inventory,id,B.itemCatalog.catalogOf(W.PSFlow.content()));
    function fixture(kind:'level'|'stone'|'none'|'unknown'='level',max=false,hasDex=false,infoHistory=false,noLesson=false):any {
      const content=clone(originalContent),state=clone(originalGame),lookup=B.dex.createDexLookup();for(const id of ['tackle','gust','quickattack','rest','flamethrower','airslash','dragonpulse','roost']){const m=lookup.move(id);content.moves[m.name]=m;}
      const member=state.party[0],target=state.party[1].species,source=B.speciesKey.speciesDataOf(content,member),destination=B.speciesKey.speciesDataOf(content,state.party[1]);source.evolutions=kind==='none'?[]:kind==='unknown'?[{method:'LevelRain',parameter:1,target}]:[{method:kind==='stone'?'Item':'Level',parameter:kind==='stone'?'ui-stone':max?100:51,target}];source.learnset={1:['Flamethrower','Air Slash','Dragon Pulse','Roost'],51:['Tackle'],52:['Gust'],53:['Quick Attack']};destination.learnset=noLesson?{}:{0:['Rest']};member.moves=['flamethrower','airslash','dragonpulse','roost'].map(id=>{const m=lookup.move(id);return{id:m.id,pp:m.pp,maxpp:m.pp,ppUps:0};});member.level=max?100:50;member.exp=B.growth.minExp(source.growth,member.level);member.item='';
      const base=content.items.potion;content.items['ui-stone']={...base,id:'ui-stone',name:'UI Stone',namePlural:'UI Stones',fieldUse:'member',battleUse:'none',battleId:undefined,flags:['EvolutionStone'],effect:{family:'evolution',parameters:{}},consumable:true};content.items['ui-exp']={...base,id:'ui-exp',name:'UI Exp',namePlural:'UI Exp',fieldUse:'member',battleUse:'none',battleId:undefined,flags:[],effect:{family:'exp-candy',parameters:{exp:100000}},consumable:true};
      const bag={rarecandy:3,'ui-stone':3,'ui-exp':3};state.inventory=B.inventory.inventoryFromBag(bag,B.itemCatalog.catalogOf(content));state.dex.hasDex=hasDex;state.dex.owned=state.dex.owned.filter((id:string)=>id!==target);if(infoHistory){if(!state.dex.seen.includes(target))state.dex.seen.push(target);state.dex.seenForms[target]=[{form:0,gender:1,shiny:true}];state.dex.lastSeenForm[target]={form:0,gender:1,shiny:true};}if(hasDex)state.dex.unlocked=Array(B.pokedexQuery.createDexQueryCatalog(content,{}).layout.regions.length+1).fill(true);
      const authored=clone(content);delete authored.meta;const inputsHash=B.digest.sha256Hex(B.contentCompile.canonicalJson(authored));content.meta={...content.meta,kind:'fixture',id:'G2c-'+kind,inputsHash,contentIdentity:B.digest.sha256Hex(B.contentCompile.canonicalJson({compiledSemantics:content.meta.compiledSemantics,inputsHash,showdownSha:content.meta.showdownSha}))};
      W.PSFlow._content=content;G.$gameSystem._psGame=state;W.PSFlow.stateReplaced();const fault={zero:false,unread:false,loseReadback:false,beforeUnread:false,partialAt:0,writes:0};
      const app=new B.app.GameApplication({state:{read:()=>{if(fault.unread)throw Error('IUI injected readback');return game();},replace:(n:any)=>{if(fault.zero)throw Error('IUI injected zero write');fault.writes++;if(fault.beforeUnread){fault.unread=true;throw Error('IUI known-before then lost readback');}if(fault.writes===fault.partialAt){const partial=clone(n);partial.money++;G.$gameSystem._psGame=partial;throw Error('IUI explicit post-primary partial');}G.$gameSystem._psGame=n;if(fault.loseReadback)fault.unread=true;}},content:()=>({content,dex:lookup}),sessions:{create:()=>{throw Error('no battle in explicit item fixture');}},projection:{project:()=>{}},random:()=>0,clock:()=>0,itemWorld:()=>({mapId:G.$gameMap.mapId()})},{receivingProfile:{mode:1,naming:1}});W.PSFlow._app=app;return{content,app,id:member.id,target,fault};
    }
    const checkpoint=async(slot:number)=>{await settledSave(slot);cases.push({slot,state:clone(game()),content:clone(W.PSFlow.content())});fs.writeFileSync(path.join(path.dirname(OUT||'.'),'ps-flow-expected-item-evolution-ui.json'),JSON.stringify({cases}));};
    const beginAnimation=async()=>{await itemEvolutionReady('animation');await press('ok');await phase('animation');};
    const completeAnimation=async()=>{await beginAnimation();await phase('success');await waitFor(()=>itemEvolution()?.timeline?.successReady,'item success wait');await press('ok');};
    const itemFeedback=async()=>{await itemEvolutionReady('item-result');await press('ok');};
    await scenario('G53-IUI1 real Bag candy shares growth decisions and keeps cost on player evolution cancellation',async()=>{
      const {app,id,fault}=fixture(),before=clone(game());W.PSInventory.showBag();await inventoryPocket(2);const bag=app.inventorySnapshot(inventory().token).pockets[1],index=bag.findIndex((r:any)=>r.item.id==='rarecandy');assert(index>=0,'rarecandy real row');for(let n=0;inventory().view.cursor!==index&&n<40;n++)await press('down');eq(inventory().view.cursor,index,'visible item cursor');await press('ok');await inventoryChoose('use');const beforeGrowth=clone(game()),writesBeforeGrowth=fault.writes;await inventoryChoose(id);await itemEvolutionReady('learning');eq(game(),beforeGrowth,'growth selection private after legitimate pocket memory');eq(fault.writes,writesBeforeGrowth,'no primary growth write before choices');await itemEvolutionChoose('yes');await itemEvolutionChoose('0');await itemEvolutionChoose('close');await itemEvolutionReady('item-growth');eq(fault.writes-writesBeforeGrowth,1,'one completed growth after pocket memory');eq(count('rarecandy'),2,'growth cost once');await press('ok');await beginAnimation();await press('cancel');await phase('cancelled');await press('ok');await itemFeedback();await inventoryReady('bag');await press('cancel');await inventoryClosed();eq(game().party[0].level,51,'growth retained');eq(game().party[0].species,before.party[0].species,'evolution cancelled');eq(game().stats.evolutions_cancelled,before.stats.evolutions_cancelled+1,'one cancellation');assert(!app.saveBlocked,'root released');await checkpoint(92);return{slot:92,input:'formal Bag row/member selection, shared learning/evolution with DOM input; real MZ state/save'};
    });
    await scenario('G53-IUI2 actual party item child keeps native Back uncancellable then Info and learning return to party',async()=>{
      const {app,id,target,fault}=fixture('stone',false,true),before=clone(game());W.PSManagement.openParty();await uiReady();await press('ok');await uiChoose('item');await uiChoose('use');await inventoryPocket(2);const rows=app.inventorySnapshot(inventory().token).pockets[1],index=rows.findIndex((r:any)=>r.item.id==='ui-stone');assert(index>=0,'stone real row');for(let n=0;inventory().view.cursor!==index&&n<40;n++)await press('down');eq(inventory().view.cursor,index,'visible item cursor');await press('ok');await inventoryChoose('use');await beginAnimation();scene().popScene();await frames(8);assert(app.pendingEvolution&&itemEvolution().timeline.phase==='animation','native scene Back delegates; stone cannot cancel');eq(count('ui-stone'),3,'no early cost');await phase('success');eq(game(),before,'body waits success caption');await waitFor(()=>itemEvolution()?.timeline?.successReady,'stone success wait');await press('ok');await itemEvolutionReady('dex-message');await press('ok');await itemEvolutionReady('entry');await shot('G53-item-stone-Info');await press('ok');await itemEvolutionReady('learning');await itemEvolutionChoose('yes');await itemEvolutionChoose('1');await itemEvolutionChoose('close');await itemFeedback();await inventoryReady('bag');await press('cancel');await waitFor(()=>!inventory()&&management()?.ready,'return from item to party');eq(management().view.kind,'party','same parent party');await press('cancel');await waitFor(()=>!management()&&!G.SceneManager.isSceneChanging(),'party closed');eq(game().party.find((m:any)=>m.id===id).species,target,'stone body installed');eq(count('ui-stone'),2,'single stone');eq(game().stats.evolution_count,before.stats.evolution_count+1,'one evolution');assert(fault.writes>=2&&!app.saveBlocked,'body/Info/lesson writes complete');await checkpoint(93);return{slot:93,input:'actual default party/attached inventory/native scene Back plus Info/shared learning, DOM input; placeholder art/audio'};
    });
    await scenario('G53-IUI3 max candy unknown is zero-use, technical prebody exit zero-use, player cancel costs one',async()=>{
      let f=fixture('unknown',true),before=clone(game()),h=W.PSInventory.useItem('rarecandy',f.id);await itemEvolutionReady('item-result');assert(!itemEvolution().timeline&&!f.app.pendingEvolution,'unknown never animates');await itemFeedback();await inventoryClosed();eq(h.result.status,'refused','unknown refused');eq(game(),before,'unknown zero-use');
      f=fixture('level',true);before=clone(game());h=W.PSInventory.useItem('rarecandy',f.id);await itemEvolutionReady('animation');G.SceneManager.goto(G.Scene_Map);await inventoryClosed();eq(h.result.status,'refused','technical exit distinguished');eq(game(),before,'no premature max cost');
      f=fixture('level',true);h=W.PSInventory.useItem('rarecandy',f.id);await beginAnimation();await press('cancel');await phase('cancelled');await press('ok');await itemFeedback();await inventoryClosed();eq(h.result.status,'committed','cancel body/cost applied');eq(count('rarecandy'),2,'one max candy');eq(game().stats.evolutions_cancelled,before.stats.evolutions_cancelled+1,'one cancellation');await checkpoint(94);return{slot:94,input:'actual MZ UI unknown and technical/user cancellation distinction, no simulated final success'};
    });
    await scenario('G53-IUI4 exp quantity/member entry retains three private choices until the single growth write',async()=>{
      const {id,fault}=fixture('none'),before=clone(game()),h=W.PSInventory.useItem('ui-exp',undefined,2);await inventoryChoose(id);for(let i=0;i<3;i++){await itemEvolutionReady('learning');eq(game(),before,'all earlier choices private '+i);await itemEvolutionChoose('yes');await itemEvolutionChoose('0');if(i<2)assert(itemEvolution().lesson.title.includes('recorded'),'feedback never claims early install');await itemEvolutionChoose('close');}await itemFeedback();await inventoryClosed();eq(h.result.status,'committed','one primary');eq(fault.writes,1,'single growth installation');eq(count('ui-exp'),1,'chosen two consumed');eq(game().party[0].moves[0].id,'quickattack','chronological final choice');await checkpoint(95);return{slot:95,input:'formal script member selector and quantity2, three shared learning prompts, complete MZ JsonEx'};
    });
    await scenario('G53-IUI5 stone zero-write retries once; lost readback interruption preserves confirmed installed cost/body',async()=>{
      let f=fixture('stone'),h=W.PSInventory.useItem('ui-stone',f.id);await itemEvolutionReady('animation');f.fault.zero=true;await completeAnimation();await itemEvolutionReady('recovery');eq(count('ui-stone'),3,'zero write no cost');eq(f.fault.writes,0,'no prefix');f.fault.zero=false;await press('ok');await itemEvolutionReady('learning');await itemEvolutionChoose('no');await itemEvolutionChoose('close');await itemFeedback();await inventoryClosed();eq(h.result.status,'committed','retry complete');eq(f.fault.writes,1,'no repeated animation/write');eq(count('ui-stone'),2,'once');
      f=fixture('stone');h=W.PSInventory.useItem('ui-stone',f.id);await itemEvolutionReady('animation');f.fault.loseReadback=true;await completeAnimation();await itemEvolutionReady('recovery');eq(f.fault.writes,1,'installed before readback loss');f.fault.unread=false;f.fault.loseReadback=false;G.SceneManager.goto(G.Scene_Map);await inventoryClosed();eq(h.result.status,'committed','technical presentation keeps confirmed effect');eq(h.result.presentation,'failed','presentation failure separate');eq(count('ui-stone'),2,'no refund/double consume');eq(game().stats.evolution_count,1,'one body');await checkpoint(96);return{slot:96,input:'actual MZ state/save with explicit zero-write/readback application faults, not real disk failures'};
    });
    await scenario('G53-IUI6 confirmed stone and candy primary/itemResult survive later learning or Info partial',async()=>{
      for(const kind of ['stone-lesson','growth-lesson','growth-info']){
        const f=fixture(kind==='stone-lesson'?'stone':'level',false,kind==='growth-info',kind==='growth-info'),item=kind==='stone-lesson'?'ui-stone':'rarecandy',handle=W.PSInventory.useItem(item,f.id);await itemEvolutionReady(kind==='stone-lesson'?'animation':'learning');let itemResult:any;
        if(kind!=='stone-lesson'){await itemEvolutionChoose('yes');await itemEvolutionChoose('0');await itemEvolutionChoose('close');await itemEvolutionReady('item-growth');itemResult=clone(f.app.pendingTriggeredEvolution.itemResult);await press('ok');}
        f.fault.partialAt=kind==='stone-lesson'?2:3;await completeAnimation();
        if(kind==='growth-info'){await itemEvolutionReady('dex-message');await press('ok');await itemEvolutionReady('recovery');}else{await itemEvolutionReady('learning');await itemEvolutionChoose('yes');await itemEvolutionChoose('1');assert(itemEvolution().lesson.kind==='recovery','partial lesson recovery');}
        const partial=clone(game());assert(f.app.pendingTriggeredEvolution.primaryCommitted&&f.app.saveBlocked,'authoritatively confirmed primary and continuing recovery barrier');G.SceneManager.goto(G.Scene_Map);await inventoryClosed();eq(handle.result.status,'refused','remaining action indeterminate');eq(handle.result.reason,'evolution-recovery-required','recovery remains required');eq(handle.result.result.primaryCommitted,true,'never forget a confirmed primary '+kind);if(itemResult)eq(handle.result.result.itemResult,itemResult,'confirmed growth projection retained');eq(game(),partial,'no refund or mutation on technical exit');eq(count(item),2,'one confirmed cost');eq(f.fault.writes,f.fault.partialAt,'no extra writes');assert(f.app.saveBlocked,'no false unlock');f.app.stateReplacedByHost();assert(!f.app.saveBlocked,'explicit replacement retires old failed owner');
      }return{input:'actual MZ item UI and explicit post-primary application-port partial faults for stone lesson, candy lesson and candy Info; not physical/disk failure, no partial state saved'};
    });
    await scenario('G53-IUI7 SOL-FINAL-01 formal recovery ACK retires only abandoned use/Bag/Party parents',async()=>{
      for(const entry of ['use','bag','party']){
        const f=fixture('stone',false,false,false,true);let callbacks=0,handle:any;
        if(entry==='use')handle=W.PSInventory.useItem('ui-stone',f.id,1,()=>callbacks++);
        else{
          if(entry==='party'){W.PSManagement.openParty();await uiReady();await press('ok');await uiChoose('item');await uiChoose('use');}else W.PSInventory.showBag();
          await inventoryPocket(2);const rows=f.app.inventorySnapshot(inventory().token).pockets[1],index=rows.findIndex((r:any)=>r.item.id==='ui-stone');assert(index>=0,'recovery stone row');for(let n=0;inventory().view.cursor!==index&&n<40;n++)await press('down');await press('ok');await inventoryChoose('use');if(entry==='bag')await inventoryChoose(f.id);
        }
        await itemEvolutionReady('animation');const writes=f.fault.writes;f.fault.loseReadback=true;await completeAnimation();await itemEvolutionReady('recovery');eq(f.fault.writes-writes,1,'one primary before lost readback');G.SceneManager.goto(G.Scene_Map);await inventoryClosed();assert(f.app.saveBlocked&&f.app.pendingTriggeredEvolution,'unconfirmed child and abandoned parent remain protected');if(handle){assert(handle.done&&handle.result.reason==='evolution-recovery-required','old handle completes recovery-required');eq(callbacks,1,'old callback once');}
        f.fault.unread=false;f.fault.loseReadback=false;await dismissMessages();const i=new G.Game_Interpreter();G.PluginManager.callCommand(i,'PS_Evolution','ShowEvolution',{});await itemEvolutionReady('recovery');assert(i.updateWaitMode(),'formal recovery waits');await press('ok');await itemEvolutionReady('item-result');assert(W.PSFlow.operationPending()&&f.app.encounterBlocked&&!G.$gameSystem.isSaveEnabled(),'feedback ACK still owns full host barrier');await press('ok');await waitFor(()=>!W.PSEvolution.current()&&!G.SceneManager.isSceneChanging()&&!!scene()?._spriteset,'recovered parent returns to map');assert(!i.updateWaitMode()&&i._psEvolutionOutcome.status==='committed','formal recovery completes');assert(!f.app.saveBlocked&&!f.app.encounterBlocked&&!W.PSFlow.operationPending(),'dead parent released only after final ACK');eq(f.fault.writes-writes,1,'no recovery rewrite');eq(count('ui-stone'),2,'one cost');eq(game().party[0].species,f.target,'one installed body');if(handle)eq(callbacks,1,'no callback replay');assert(W.PSInventory.showBag(),'next Bag may open');await inventoryReady('bag');await press('cancel');await inventoryClosed();
      }await checkpoint(97);return{slot:97,input:'real Reactor goto, formal ShowEvolution and ACK, use/Bag/Party parent chains; explicit application-port readback loss, not real disk fault'};
    });

    await scenario('G53-IUI8 SOL-FINAL-01 Terminate proven before/next retires all three abandoned parent chains after ACK',async()=>{
      for(const entry of ['use','bag','party'])for(const installed of [false,true]){
        const f=fixture('stone',false,false,false,true);let callbacks=0,handle:any;
        if(entry==='use')handle=W.PSInventory.useItem('ui-stone',f.id,1,()=>callbacks++);
        else{if(entry==='party'){W.PSManagement.openParty();await uiReady();await press('ok');await uiChoose('item');await uiChoose('use');}else W.PSInventory.showBag();await inventoryPocket(2);const rows=f.app.inventorySnapshot(inventory().token).pockets[1],index=rows.findIndex((r:any)=>r.item.id==='ui-stone');for(let n=0;inventory().view.cursor!==index&&n<40;n++)await press('down');eq(inventory().view.cursor,index,'stone selected');await press('ok');await inventoryChoose('use');if(entry==='bag')await inventoryChoose(f.id);}
        await itemEvolutionReady('animation');const writes=f.fault.writes,before=clone(game());f.fault.loseReadback=installed;f.fault.beforeUnread=!installed;await completeAnimation();await itemEvolutionReady('recovery');eq(f.fault.writes-writes,1,'one attempted body');G.SceneManager.goto(G.Scene_Map);await inventoryClosed();assert(f.app.saveBlocked&&f.app.encounterBlocked,'unresolved barrier');f.fault.unread=false;f.fault.loseReadback=false;f.fault.beforeUnread=false;await dismissMessages();const i=new G.Game_Interpreter();G.PluginManager.callCommand(i,'PS_Evolution','ShowEvolution',{});await itemEvolutionReady('recovery');await press('down');await press('ok');await itemEvolutionReady('item-result');assert(!f.app.pendingTriggeredEvolution&&!f.app.pendingEvolution&&W.PSFlow.operationPending()&&f.app.encounterBlocked,'proven terminal still awaits ACK');await press('ok');await waitFor(()=>!W.PSEvolution.current()&&!G.SceneManager.isSceneChanging()&&!!scene()?._spriteset,'technical terminal parent released');assert(!i.updateWaitMode(),'event complete');eq(i._psEvolutionOutcome.status,'technically-terminated','domain terminal preserved');eq(i._psEvolutionOutcome.result.primaryCommitted,installed,'no invented primary');assert(!f.app.saveBlocked&&!f.app.encounterBlocked&&!W.PSFlow.operationPending(),'no dead parent after ACK');eq(f.fault.writes-writes,1,'no repeat attempt');eq(count('ui-stone'),installed?2:3,'known cost');if(installed)eq(game().party[0].species,f.target,'known body');else eq(game(),before,'complete before remains unchanged');if(handle)eq(callbacks,1,'original callback once');
      }await checkpoint(98);return{slot:98,input:'six real MZ use/Bag/Party by proven before/next Terminate combinations, final ACK; explicit state-port faults, one final Party-next state saved, not six restart claims'};
    });
    await scenario('G53-IUI9 SOL-FINAL-01 second presentation exit retains terminal feedback until reopened ACK',async()=>{
      for(const phase of ['readable-recovery','retry-result','terminate-result']){
        const f=fixture('stone',false,false,false,true);let callbacks=0;W.PSInventory.useItem('ui-stone',f.id,1,()=>callbacks++);await itemEvolutionReady('animation');f.fault.loseReadback=true;await completeAnimation();await itemEvolutionReady('recovery');G.SceneManager.goto(G.Scene_Map);await inventoryClosed();f.fault.unread=false;f.fault.loseReadback=false;await dismissMessages();const old=new G.Game_Interpreter();G.PluginManager.callCommand(old,'PS_Evolution','ShowEvolution',{});await itemEvolutionReady('recovery');if(phase!=='readable-recovery'){if(phase==='terminate-result')await press('down');await press('ok');await itemEvolutionReady('item-result');}
        G.SceneManager.goto(G.Scene_Map);await waitFor(()=>!W.PSEvolution.current()&&!G.SceneManager.isSceneChanging()&&!!scene()?._spriteset,'second exit to map');assert(!old.updateWaitMode(),'abandoned recovery waiter finished');assert(f.app.encounterBlocked&&W.PSFlow.operationPending()&&!G.$gameSystem.isSaveEnabled(),'unacknowledged receipt keeps host barrier');await dismissMessages();const i=new G.Game_Interpreter();G.PluginManager.callCommand(i,'PS_Evolution','ShowEvolution',{});await itemEvolutionReady('item-result');await press('ok');await waitFor(()=>!W.PSEvolution.current()&&!G.SceneManager.isSceneChanging()&&!!scene()?._spriteset,'reopened ACK done');assert(!i.updateWaitMode()&&!f.app.encounterBlocked&&!W.PSFlow.operationPending(),'same owner complete');eq(f.fault.writes,1,'no domain replay');eq(count('ui-stone'),2,'one cost');eq(callbacks,1,'no old callback replay');
      }await checkpoint(99);return{slot:99,input:'three actual forced presentation exits around reliable domain termination, same-owner in-memory feedback recovery and final ACK; only last state persisted'};
    });

  }

  async function runBattleEntryOwnership() {
    await runTradeUI();const B=api(),cases=JSON.parse(fs.readFileSync(path.join(path.dirname(OUT||'.'),'ps-flow-expected-trade-ui.json'),'utf8')).cases;
    const checkpoint=async(slot:number)=>{await settledSave(slot);cases.push({slot,state:clone(game()),content:clone(W.PSFlow.content())});fs.writeFileSync(path.join(path.dirname(OUT||'.'),'ps-flow-expected-battle-entry.json'),JSON.stringify({cases}));};
    await scenario('AR01-H1 actual reserved then active learning refuses battle without stealing its scene or owner',async()=>{
      await toMap();W.PSFlow._content=null;W.PSFlow._app=null;fresh();const app=W.PSFlow.app(),id=game().party[0].id,before=clone(game()),h=W.PSProgression.learn({kind:'forget',memberId:id});assert(h&&!h.done,'formal learning reserved');assert(!app.encounterBlocked&&W.PSFlow.operationPending(),'queued UI precedes domain owner');const request={battleId:'AR-queued',kind:'wild',foes:[{species:game().party[1].species,level:5}],seq:94},old=W.PSFlow._op,next=G.SceneManager._nextScene;let refused=false;try{W.PSFlow.openBattle(request);}catch{refused=true;}assert(refused&&W.PSFlow._op===old&&G.SceneManager._nextScene===next,'queued screen preserved');
      await waitFor(()=>W.PSProgression.current()?.ready&&!G.SceneManager.isSceneChanging(),'AR active forget');const owner=clone(app.pendingLearning);let core=false,host=false;try{await app.startBattle(request);}catch{core=true;}try{W.PSFlow.openBattle(request);}catch{host=true;}assert(core&&host,'active lesson refuses both entries');eq(app.pendingLearning,owner,'same learning token/revision');eq(game(),before,'no write');await press('cancel');await waitFor(()=>W.PSProgression.current()?.ready&&W.PSProgression.current()?.page.kind==='message','AR unchanged feedback');await press('ok');await waitFor(()=>!W.PSProgression.current()&&scene() instanceof G.Scene_Map&&!G.SceneManager.isSceneChanging(),'AR original UI exits');assert(h.done&&!app.saveBlocked,'original owner cancelled normally');eq(game(),before,'no learning mutation');await checkpoint(90);return{slot:90,input:'actual default learning UI reservation and active domain, formal battle entries and DOM cancellation'};
    });
    await scenario('AR01-H2 actual MZ ports reject synchronous reentry and preserve a replacement owner',async()=>{
      const content=W.PSFlow.content(),before=clone(game());let app:any,hook:(()=>void)|null=null,created=0,draws=0;const factory=B.composition.createBattleSessionFactory({content:()=>content,seed:()=>[1,2,3,4]});
      app=new B.app.GameApplication({state:{read:()=>{const f=hook;hook=null;f?.();return game();},replace:(n:any)=>{G.$gameSystem._psGame=n;}},content:()=>({content,dex:B.dex.createDexLookup()}),sessions:{create:(...a:any[])=>{created++;return factory.create(...a);},effects:(...a:any[])=>factory.effects(...a)},projection:{project:()=>{}},random:()=>{draws++;return 0;},clock:()=>0});W.PSFlow._app=app;
      let blocked=false;hook=()=>{try{app.beginManagement();}catch{blocked=true;}};const request={battleId:'AR-first-read',kind:'wild',foes:[{species:'pidgey',level:3}],seq:95};await app.startBattle(request);assert(blocked&&created===1,'one session, reentrant management refused');app.abortBattle(request,Error('AR complete'));let owner:string|undefined;const beforeDraws=draws;hook=()=>{app.stateReplacedByHost();owner=app.beginManagement();};let stale=false;try{await app.startBattle({...request,battleId:'AR-stale'});}catch{stale=true;}assert(stale&&created===1&&draws===beforeDraws,'stale first read makes no session or random calls');assert(owner&&app.encounterBlocked,'new owner retained');eq(app.endManagement(owner).status,'unchanged','new owner exits normally');eq(game(),before,'all complete state retained');assert(!app.saveBlocked&&!W.PSFlow.operationPending(),'no leaked old owner');await checkpoint(91);return{slot:91,input:'actual NW/MZ state and application, explicit injected state callbacks plus default real session factory; no disk fault'};
    });
    await scenario('AR01-H3 actual initialized queued Management is protected, then healthy read-only management keeps saving and battle can open',async()=>{
      const before=clone(game()),app=W.PSFlow.app(),oldOp=W.PSFlow._op,saveEnabled=G.$gameSystem.isSaveEnabled();assert(!app.encounterBlocked&&!W.PSFlow.operationPending(),'idle source');assert(W.PSManagement.openParty(),'formal queued party');const queued=G.SceneManager._nextScene,stack=[...G.SceneManager._stack];assert(queued&&!W.PSManagement.current(),'Reactor initializes next scene before creating controller');assert(W.PSFlow.operationPending()&&!app.encounterBlocked,'presentation reservation precedes domain token');let refused=false;try{W.PSFlow.openBattle({battleId:'AR-management-queued',kind:'wild',foes:[{species:'pidgey',level:3}],seq:96});}catch{refused=true;}assert(refused&&G.SceneManager._nextScene===queued&&W.PSFlow._op===oldOp&&!W.PSFlow.running,'no replacing queued scene/op');assert(G.SceneManager._stack.length===stack.length&&stack.every((x:any,i:number)=>x===G.SceneManager._stack[i]),'no extra stack push');eq(game(),before,'queued refusal zero state writes');await uiReady();assert(app.encounterBlocked&&!app.saveBlocked&&!W.PSFlow.operationPending(),'healthy unheld domain policy preserved');eq(G.$gameSystem.isSaveEnabled(),saveEnabled,'no new whole-management save lock');await shot('AR01-queued-management-party');await press('cancel');await waitFor(()=>!W.PSManagement.current()&&!G.SceneManager.isSceneChanging()&&!!scene()?._spriteset,'original party exits');assert(!W.PSFlow.operationPending()&&!app.encounterBlocked,'guard released');W.PSFlow.openBattle({battleId:'AR-management-released',kind:'wild',foes:[{species:'pidgey',level:3}],seq:97});assert(W.PSFlow.running,'legal host battle opens after release');W.PSFlow.stateReplaced();G.SceneManager.pop();await toMap();return{input:'actual Reactor initialized-before-create lifecycle, real formal host battle refusal/open/abort and default party DOM exit; no battle turns or hardware input claimed'};
    });
    await scenario('AR01-H4 direct create/start after generation replacement performs zero predicate queries and preserves successor',async()=>{
      const app=W.PSFlow.app(),before=clone(game());
      for(const phase of ['before-create','after-create']){
        assert(!app.encounterBlocked,'idle before stale presentation');assert(W.PSManagement.openParty(),'owned queued scene');const queued=G.SceneManager._nextScene;
        if(phase==='after-create'){G.SceneManager.changeScene();assert(G.SceneManager._scene===queued&&!queued._controller?.started,'real created-before-start phase');}
        app.stateReplacedByHost();const successor=phase==='after-create'?app.beginManagement():null;const predicate=W.PSManagement.presentationPending;let queried=0;W.PSManagement.presentationPending=function(){queried++;return predicate();};
        try{if(phase==='before-create')G.SceneManager.changeScene();queued.start();eq(queried,0,'no accidental predicate retirement '+phase);assert(queued._invalid&&!queued._controller?.started&&!queued._controller?.managementToken,'old scene owns no new token '+phase);}finally{W.PSManagement.presentationPending=predicate;}
        await waitFor(()=>G.SceneManager._scene!==queued&&!G.SceneManager.isSceneChanging()&&!!scene()?._spriteset,'stale scene actually returns to map');if(successor)eq(app.endManagement(successor).status,'unchanged','successor not released');assert(!app.encounterBlocked,'no leaked owner');eq(game(),before,'stale lifecycle no state write');
      }return{input:'actual Reactor changeScene/create/start paths with explicit application generation replacement and successor owner; zero public predicate queries during critical segment; DOM/host automation only'};
    });
    await scenario('AR01-H5 SOL-FINAL-02 queued candy APIs and command keep reservations through native initialization',async()=>{
      for(const entry of ['api','command']){
        const app=W.PSFlow.app(),before=clone(game()),oldOp=W.PSFlow._op;let callbacks=0,handle:any,i:any;
        if(entry==='api')handle=W.PSInventory.useItem('rarecandy',undefined,1,()=>callbacks++);else{i=new G.Game_Interpreter();G.PluginManager.callCommand(i,'PS_Inventory','UseItemOnMember',{itemId:'rarecandy',quantity:'1'});}
        const queued=G.SceneManager._nextScene;handle??=queued._request.handle;assert(queued?._psInventory&&!queued._controller&&!handle.done,'initialized native next-scene gap');assert(W.PSFlow.operationPending()&&!app.encounterBlocked,'continuous host reservation before domain token');let refused=false;try{W.PSFlow.openBattle({battleId:'AR-inventory-queued',kind:'wild',foes:[{species:'pidgey',level:3}],seq:99});}catch{refused=true;}assert(refused&&!W.PSFlow.running&&W.PSFlow._op===oldOp&&G.SceneManager._nextScene===queued,'refusal preserves original scene/op');if(i)assert(i.updateWaitMode(),'original event still waits');eq(game(),before,'zero writes before refusal');await inventoryReady('menu');await press('cancel');await inventoryClosed();assert(handle.done&&handle.result.status==='cancelled','same request remains usable');if(i)assert(!i.updateWaitMode(),'same interpreter wait ends');else eq(callbacks,1,'one callback');assert(!app.encounterBlocked&&!W.PSFlow.operationPending(),'no orphan owner');eq(game(),before,'cancel no primary');
      }return{input:'real Reactor initialized-before-create plus default candy target cancellation and formal command wait; DOM/host automation, no physical input'};
    });

    await scenario('AR01-H6 UI-R2-OBS01 Base.create failure finishes direct API callback once after returning to Map',async()=>{
      const app=W.PSFlow.app(),before=clone(game()),base=G.Scene_MenuBase.prototype.create;let callbacks=0,faulted=false;G.Scene_MenuBase.prototype.create=function(...args:any[]){if(this._psInventory&&!faulted){faulted=true;throw Error('UI-R2 explicit Base.create failure');}return base.apply(this,args);};
      try{const h=W.PSInventory.useItem('rarecandy',undefined,1,()=>callbacks++);assert(h&&!h.done,'queued API');await waitFor(()=>h.done&&!G.SceneManager.isSceneChanging()&&!!scene()?._spriteset,'failed create back to Map');await dismissMessages();await waitFor(()=>callbacks===1,'same-generation failure callback');eq(h.result.reason,'presentation-failed','failure result');eq(game(),before,'no domain writes');assert(faulted&&!app.encounterBlocked&&!W.PSFlow.operationPending(),'failure reservation released');await frames(4);eq(callbacks,1,'not repeated');}finally{G.Scene_MenuBase.prototype.create=base;}return{input:'actual Reactor initialization failure injected in Base.create, default Map/message return and API completion; not real graphics driver failure'};
    });

  }

  async function runEvolutionUI() {
    await toMap();fresh();const B=api(),originalContent=clone(W.PSFlow.content()),originalGame=clone(game()),id=game().party[0].id,target=game().party[1].species,cases:any[]=[];
    const current=()=>W.PSEvolution.current();
    const ready=async(layer?:string)=>waitFor(()=>current()?.ready&&(!layer||current().layer===layer)&&!G.SceneManager.isSceneChanging(),'evolution UI '+(layer??''));
    const phase=async(value:string)=>waitFor(()=>current()?.ready&&current().timeline?.phase===value,'evolution phase '+value);
    const chooseLesson=async(key:string)=>{await ready('learning');let i=0;while(current().lesson.rows[current().lesson.cursor]?.key!==key&&i++<60)await press('down');eq(current().lesson.rows[current().lesson.cursor]?.key,key,'evolution learning choice');await press('ok');};
    const closed=async()=>waitFor(()=>!current()&&!!scene()?._spriteset&&!G.SceneManager.isSceneChanging(),'evolution closed');
    const bind=(family:string,hasDex:boolean)=>{const content=clone(originalContent),state=clone(originalGame),lookup=B.dex.createDexLookup();for(const moveId of ['surgingstrikes','tackle','growl','rest','gust']){const m=lookup.move(moveId);content.moves[m.name]=m;}
      const source=B.speciesKey.speciesDataOf(content,state.party[0]),dest=B.speciesKey.speciesDataOf(content,state.party[1]);source.evolutions=[{method:family,parameter:family==='Event'?7:3,target}];source.learnset={1:['Surging Strikes','Tackle','Growl','Rest']};dest.learnset={0:['Gust']};state.dex.hasDex=hasDex;state.dex.owned=state.dex.owned.filter((s:string)=>s!==target);if(hasDex){const catalog=B.pokedexQuery.createDexQueryCatalog(content,{});state.dex.unlocked=Array(catalog.layout.regions.length+1).fill(true);assert(B.pokedexQuery.dexInUnlockedRegion(state.dex,catalog.layout,target),'Info fixture target is in an explicitly unlocked dex');}
      state.party[0].moves=['surgingstrikes','tackle','growl','rest'].map(id=>{const m=lookup.move(id);return{id:m.id,pp:m.pp,maxpp:m.pp,ppUps:0};});
      const authored=clone(content);delete authored.meta;const inputsHash=B.digest.sha256Hex(B.contentCompile.canonicalJson(authored));content.meta={...content.meta,kind:'fixture',id:'host-G2a-'+family,inputsHash,contentIdentity:B.digest.sha256Hex(B.contentCompile.canonicalJson({compiledSemantics:content.meta.compiledSemantics,inputsHash,showdownSha:content.meta.showdownSha}))};W.PSFlow._content=content;G.$gameSystem._psGame=state;W.PSFlow.stateReplaced();return content;
    };
    const checkpoint=async(slot:number,content:any,result?:any)=>{await settledSave(slot);cases.push({slot,content,state:clone(game()),...(result?{result}:{})});fs.writeFileSync(path.join(path.dirname(OUT||'.'),'ps-flow-expected-evolution-ui.json'),JSON.stringify({cases}));};
    await scenario('G53-EUI1 normal event and cancellable animation preserve source and caller result',async()=>{
      const content=bind('Event',false),i=new G.Game_Interpreter();G.PluginManager.callCommand(i,'PS_Evolution','EventEvolution',{event:'7',memberId:id});await phase('what');assert(i.updateWaitMode()&&!G.$gameSystem.isSaveEnabled(),'event/save owner');await press('ok');await phase('animation');await frames(180);await shot('G53-evolution-white-silhouette');await press('cancel');await phase('cancelled');eq(game().party[0].species,originalGame.party[0].species,'cancel keeps old species');eq(game().stats.evolutions_cancelled,originalGame.stats.evolutions_cancelled+1,'cancel exactly once');await press('ok');await closed();assert(!i.updateWaitMode(),'event wait closes');await checkpoint(82,content);return{slot:82,input:'formal event/real MZ screen and DOM keys; monotonic animation with placeholder art/audio'};
    });
    await scenario('G53-EUI2 success caption before body, actual Info/recent then G1 learning',async()=>{
      const content=bind('Event',true),i=new G.Game_Interpreter();G.PluginManager.callCommand(i,'PS_Evolution','EventEvolution',{event:'7',memberId:id});await phase('what');await press('ok');await phase('animation');await phase('success');eq(game().party[0].species,originalGame.party[0].species,'success caption before atomic body');await shot('G53-evolution-success-before-body');await waitFor(()=>current()?.timeline?.successReady,'success timed wait80/20');await press('ok');await ready('dex-message');eq(game().party[0].species,target,'body installed once');await press('ok');await ready('entry');await shot('G53-evolution-Info');await press('ok');await ready('learning');await chooseLesson('yes');await chooseLesson('1');await chooseLesson('close');await closed();eq(game().party[0].moves[1].id,'gust','post-evolution learned');eq(game().stats.evolution_count,originalGame.stats.evolution_count+1,'one evolution');await checkpoint(83,content);return{slot:83,input:'formal event/evolution/installed Info and reused learning scene, real JsonEx'};
    });
    await scenario('G53-EUI3 actual default K3 battle automatically transfers normal UI and releases original waiter',async()=>{
      await toMap();const content=bind('BattleDealCriticalHit',false);W.PSFlow.rng=()=>0;const request={battleId:'host-G2a-K3',kind:'wild',foes:[{species:target,level:50}],seq:27};W.PSFlow.openBattle(request);await inMode('main');const handle=battle()._session;await choose(/^Fight/);await inMode('moves');await choose(/surging strikes/i);await inMode('main');await choose(/^Bag/);await inMode('bag');await choose(/master ball/i);await inMode('end');const raw=handle.result();await press('ok');await phase('what');const app=W.PSFlow.app();assert(app.pendingEvolution.selection.family==='battle','real K3 selected');const waiter=new G.Game_Interpreter();waiter.setWaitMode('psBattle');assert(waiter.updateWaitMode()&&W.PSFlow.running&&!G.$gameSystem.isSaveEnabled(),'same real battle owner');await press('ok');await phase('animation');await phase('success');await waitFor(()=>current()?.timeline?.successReady,'battle success wait');await press('ok');await ready('learning');await chooseLesson('yes');await chooseLesson('1');assert(G.$gameMessage.isBusy()&&G.$gameMessage._texts.some((s:string)=>s.includes('Blastoise')),'received host message remains queued during final lesson');await chooseLesson('close');await closed();assert(!W.PSFlow.running&&!waiter.updateWaitMode()&&!app.saveBlocked,'original battle waiter releases only final continuation');await dismissMessages();eq(game().party[0].species,target,'battle evolution');await checkpoint(84,content,raw);return{slot:84,input:'actual default Showdown/session K3, real battle/event/save adapter, formal evolution and DOM learning'};
    });
  }

  async function runLearningUI() {
    await toMap();fresh();const B=api(),content=clone(W.PSFlow.content()),id=game().party[0].id;
    for(const moveId of ['gust','rest','tackle']){const move=B.dex.createDexLookup().move(moveId);content.moves[move.name]=move;}
    const species=B.speciesKey.speciesDataOf(content,game().party[0]);species.tutorMoves=['Gust','Rest'];species.learnset={1:['Tackle'],99:['Rest']};
    for(const [itemId,fieldUse]of [['g-study-tr','tr'],['g-study-hm','hm']])content.items[itemId]={...content.items.potion,id:itemId,name:itemId,namePlural:itemId,pocket:4,flags:[],fieldUse,battleUse:'none',battleId:undefined,legacyIds:[],consumable:fieldUse==='tr',move:'gust'};
    content.moves.Gust.name='阵风'.repeat(60);content.settings={...(content.settings??{}),TAUGHT_MACHINES_KEEP_OLD_PP:true};
    const authored=clone(content);delete authored.meta;const inputsHash=B.digest.sha256Hex(B.contentCompile.canonicalJson(authored));
    content.meta={...content.meta,kind:'fixture',id:'G-learning-ui',inputsHash,contentIdentity:B.digest.sha256Hex(B.contentCompile.canonicalJson({compiledSemantics:content.meta.compiledSemantics,inputsHash,showdownSha:content.meta.showdownSha}))};
    W.PSFlow._content=content;W.PSFlow._app=null;game().inventory=B.inventory.addItems(game().inventory,'g-study-tr',2,content.items,B.inventory.inventoryPolicy(content));
    const initialLearningState=clone(game());
    const p=()=>W.PSProgression.current();
    const ready=async(kind?:string)=>waitFor(()=>p()?.ready&&(!kind||p().page.kind===kind)&&!G.SceneManager.isSceneChanging(),'learning ready '+(kind??''));
    const choose=async(key:string)=>{await ready();let n=0;while(p().page.rows[p().page.cursor]?.key!==key&&n++<60)await press('down');eq(p().page.rows[p().page.cursor]?.key,key,'learning choice');await press('ok');};
    const closed=async()=>waitFor(()=>!p()&&!!scene()?._spriteset&&!G.SceneManager.isSceneChanging(),'learning closed');
    const cases:any[]=[],checkpoint=async(slot:number)=>{await settledSave(slot);cases.push({slot,state:clone(game()),content});fs.writeFileSync(path.join(path.dirname(OUT||'.'),'ps-flow-expected-learning-ui.json'),JSON.stringify({cases}));};
    await scenario('G53-LUI1 formal tutor command: Yes default, Back/give-up, HM and Chinese long layout',async()=>{
      W.PSFlow.setLanguage('zh');const before=clone(game()),i=new G.Game_Interpreter();
      G.PluginManager.callCommand(i,'PS_Progression','TeachMove',{memberId:id,moveId:'gust',source:'tutor'});await ready('confirm');assert(i.updateWaitMode(),'real event waits for its screen');eq(p().page.cursor,0,'default Yes');
      assert(W.PSFlow.app().saveBlocked&&!G.$gameSystem.isSaveEnabled(),'screen owner blocks save');let denied=false;try{await G.DataManager.saveGame(80);}catch{denied=true;}assert(denied,'actual direct save refused');
      await choose('yes');await ready('moves');assert(p().text.some((v:string)=>v.includes('…')),'long Chinese move ellipsized');await shot('G53-learning-zh-long');await press('cancel');await ready('confirm');await choose('no');await ready('moves');await choose('new');await choose('yes');await choose('close');await closed();assert(!i.updateWaitMode(),'wait ends');eq(game(),before,'declining a lesson is zero write');
      return{input:'formal G scene and real MZ event, DOM synthetic keys, no OS hardware',saveRefused:denied};
    });
    await scenario('G53-LUI2 real Bag TR child and HM reselect use the same learning transaction',async()=>{
      const handle=W.PSInventory.useItem('g-study-tr',id);await inventoryReady('message');await press('ok');await inventoryChoose('yes');await ready('confirm');await choose('yes');await choose('0');eq(game().party[0].moves[0].id,'gust','TR learned');eq(B.inventory.itemQuantity(game().inventory,'g-study-tr',content.items),1,'one TR');await choose('close');await closed();assert(handle.done&&!W.PSFlow.app().saveBlocked,'parent released');
      const i=new G.Game_Interpreter();G.PluginManager.callCommand(i,'PS_Progression','TeachMove',{memberId:id,moveId:'rest',source:'tutor'});await ready('confirm');await choose('yes');await choose('0');await ready('moves');assert(p().page.error,'HM rejection remains on selection');await shot('G53-learning-HM');await choose('1');eq(game().party[0].moves[1].id,'rest','adjacent slot succeeds');await choose('close');await closed();await checkpoint(80);
      return{slot:80,input:'actual Bag child and formal learning scene; direct UI intent then DOM keys, actual JsonEx'};
    });
    await scenario('G53-LUI3 reminder cancellation layers and independent HM/last-move forgetting',async()=>{
      W.PSFlow.setLanguage('en');const i=new G.Game_Interpreter();G.PluginManager.callCommand(i,'PS_Progression','RelearnMove',{memberId:id});await ready('candidates');await choose('tackle');await choose('no');await ready('candidates');await choose('tackle');await choose('yes');await choose('new');await choose('yes');await ready('candidates');await press('cancel');await ready('confirm');await choose('no');await ready('candidates');await choose('tackle');await choose('yes');await choose('2');await choose('close');await closed();
      const j=new G.Game_Interpreter();G.PluginManager.callCommand(j,'PS_Progression','ForgetMove',{memberId:id});await ready('forget');await choose('0');await choose('yes');assert(!game().party[0].moves.some((m:any)=>m.id==='gust'),'independent forgetting allows HM');await choose('close');await closed();
      game().party[0].moves=[{id:'tackle',pp:35,maxpp:35,ppUps:0}];W.PSFlow.stateReplaced();const k=new G.Game_Interpreter();G.PluginManager.callCommand(k,'PS_Progression','ForgetMove',{memberId:id});await ready('forget');await choose('0');await choose('yes');await ready('forget');assert(p().page.error,'last move blocked and layer remains exit-capable');await shot('G53-learning-en-last');await press('cancel');await ready('message');await choose('close');await closed();eq(game().party[0].moves.length,1,'one move remains');await checkpoint(81);W.PSFlow.setLanguage(null);
      return{slot:81,input:'formal reminder/forgetting screens with DOM keys; explicit one-move boundary fixture'};
    });
    await scenario('G53-LUI4 real MZ initialized-next replacement releases saving and later learning',async()=>{
      G.$gameSystem._psGame=clone(initialLearningState);W.PSFlow.stateReplaced();const app=W.PSFlow.app();
      for(const reload of [false,true]){const h=W.PSProgression.learn({kind:'teach',memberId:id,source:{kind:'tutor',moveId:'gust'}});assert(h&&!h.done,'reserved before create');assert(G.SceneManager._nextScene,'actual MZ next initialized');if(reload)W.PSFlow.stateReplaced();G.SceneManager.goto(G.Scene_Map);await waitFor(()=>scene() instanceof G.Scene_Map&&!G.SceneManager.isSceneChanging(),'replacement map');await waitGameFrames(waits,5);assert(h.done&&!W.PSProgression.current(),'abandoned handle retired');assert(!W.PSFlow.app().pendingLearning&&!W.PSFlow.operationPending()&&G.$gameSystem.isSaveEnabled(),'no orphan save barrier');eq(game(),initialLearningState,'no late teaching');}
      await checkpoint(85);return{slot:85,input:'actual MZ cross-frame goto replaces initialized scene, normal and after host generation change; real save guard'};
    });
    await scenario('G53-LUI5 real machine child interruption publishes one result before/after installation',async()=>{
      for(const installed of [false,true]){G.$gameSystem._psGame=clone(initialLearningState);W.PSFlow.stateReplaced();const app=W.PSFlow.app(),done:any[]=[];let ends=0;const end=app.endInventoryOperation.bind(app);app.endInventoryOperation=(...args:any[])=>{ends++;return end(...args);};
        const h=W.PSInventory.useItem('g-study-tr',id,1,(out:any)=>done.push(clone(out)));await inventoryReady('message');await press('ok');await inventoryChoose('yes');await ready('confirm');if(installed){await choose('yes');await choose('1');await ready('message');}
        G.SceneManager.goto(G.Scene_Map);await waitFor(()=>scene() instanceof G.Scene_Map&&!G.SceneManager.isSceneChanging(),'machine interruption map');await waitFor(()=>done.length>0,'one completion callback');await waitGameFrames(waits,8);eq(done.length,1,'one done');eq(ends,1,'one parent end');assert(h.done&&!app.saveBlocked&&!W.PSFlow.operationPending(),'parent/child finished');eq(B.inventory.itemQuantity(game().inventory,'g-study-tr',content.items),installed?1:2,'only learned item consumed');eq(done[0].status,installed?'committed':'cancelled','installed result not overwritten');if(installed)eq(done[0].presentation,'failed','installed body retained despite presentation interruption');app.endInventoryOperation=end;
      }await checkpoint(86);return{slot:86,input:'actual MZ scene terminate/cross-frame parent map, programmatic requests and DOM selection, exactly-one callback/end with persistent body retained'};
    });
  }

  async function runM1Convergence() {
    await toMap();const B=api(),cases:any[]=[],helper=nodeRequire(path.join(gameDir,'experiments/step5/3/fixtures/m1/convergence.cjs'));
    const sourceSha=fs.readFileSync(path.join(gameDir,'js/engine/showdown/SOURCE_SHA'),'utf8').trim();
    const host={
      install:(content:any,state:any)=>{W.PSFlow._content=content;G.$gameSystem._psGame=state;W.PSFlow.stateReplaced();G.$gameMessage.clear();},
      read:()=>game(),replace:(next:any)=>{G.$gameSystem._psGame=next;},bind:(app:any,content:any)=>{W.PSFlow._app=app;W.PSFlow._content=content;},
      blocked:async(label:string)=>{assert(W.PSFlow.app().saveBlocked&&!G.$gameSystem.isSaveEnabled(),'continuous owner '+label);let refused=false;try{await G.DataManager.saveGame(75);}catch{refused=true;}assert(refused,'direct host save refused '+label);},
      checkpoint:async(label:string,payload:any)=>{const slot=label==='actual-D-ready'?75:label==='unknown-R-deposited'?76:label==='unknown-R-ordinary-recovery'?77:label==='escape-D'?78:79;await settledSave(slot);cases.push({slot,label,state:clone(game()),content:clone(payload.content),result:clone(payload.result)});fs.writeFileSync(path.join(path.dirname(OUT||'.'),'ps-flow-expected-m1.json'),JSON.stringify({cases}));}
    };
    await scenario('E53-M1A actual default D/source to primary capture/Info/R/event/cancel and MZ save',async()=>{const r=await helper.actualDamage(B,sourceSha,host);await shot('E53-M1A-ready');return{slot:75,damage:r.damage,input:'actual default Showdown/session plus MZ JsonEx/save guards; direct application/Info answers, not formal G/H or physical keys'};});
    await scenario('E53-M1B missing authority preserves capture/Info and unknown R through storage/recovery and MZ saves',async()=>{const r=await helper.unknownReadiness(B,sourceSha,host);return{slots:[76,77],effectsCalls:r.calls,input:'actual default capture/item plus deliberately absent metadata, real MZ state/save; no fabricated auxiliary receipt or disk fault'};});
    await scenario('E53-M1C actual normal escape still earns D readiness when all-battles is off',async()=>{await helper.actualEscapeDamage(B,sourceSha,host);return{slot:78,input:'actual default Showdown normal run/D62, actual MZ save, no synthetic outcome'};});
    await scenario('E53-M1D actual level-up then normal escape still scans evolution when all-battles is off',async()=>{await helper.actualEscapeLevel(B,sourceSha,host);return{slot:79,input:'actual default Showdown KO/level-up/run plus direct cancellation and real MZ save guard'};});
  }

  async function verifySave() {
    if(EXPECTED_DIR&&fs.existsSync(path.join(EXPECTED_DIR,'ps-flow-expected-pokedex-ui.json'))){await scenario('H53-UIV fresh actual NW restores ten complete dex checkpoints',async()=>{const expected=readExpected('ps-flow-expected-pokedex-ui.json');eq(expected.cases.map((c:any)=>c.slot),[97,98,99,100,101,102,103,104,105,106],'ten dex checkpoints');for(const c of expected.cases){W.PSFlow._content=c.content;W.PSFlow._app=null;await G.DataManager.loadGame(c.slot);eq(game(),c.state,'complete dex state '+c.slot);assert(!W.PSFlow.app().saveBlocked&&!W.PSPokedex.busy(),'no transient screen/owner saved');}return{slots:[97,98,99,100,101,102,103,104,105,106],input:'fresh actual MZ JsonEx and explicit view records; no hardware input'};});return;}

    if(EXPECTED_DIR&&fs.existsSync(path.join(EXPECTED_DIR,'ps-flow-expected-item-evolution-ui.json'))){await scenario('G53-IUIV fresh actual NW restores eight complete item UI checkpoints',async()=>{const expected=readExpected('ps-flow-expected-item-evolution-ui.json');eq(expected.cases.map((c:any)=>c.slot),[92,93,94,95,96,97,98,99],'eight item checkpoints');for(const item of expected.cases){W.PSFlow._content=item.content;W.PSFlow._app=null;await G.DataManager.loadGame(item.slot);eq(game(),item.state,'complete state '+item.slot);const a=W.PSFlow.app();assert(!a.pendingTriggeredEvolution&&!a.pendingEvolution&&!a.pendingPokedex&&!a.saveBlocked,'no transient item workflow saved');}return{slots:[92,93,94,95,96,97,98,99],input:'fresh actual MZ/NW full JsonEx, no physical input'};});return;}
    if(EXPECTED_DIR&&fs.existsSync(path.join(EXPECTED_DIR,'ps-flow-expected-battle-entry.json'))){
      await scenario('AR01-V actual fresh NW restores combined trade and battle admission checkpoints',async()=>{const expected=readExpected('ps-flow-expected-battle-entry.json');eq(expected.cases.map((c:any)=>c.slot),[87,88,89,90,91],'five full-state checkpoints');for(const item of expected.cases){W.PSFlow._content=item.content;W.PSFlow._app=null;await G.DataManager.loadGame(item.slot);eq(game(),item.state,'complete state '+item.slot);assert(!W.PSFlow.app().saveBlocked&&!W.PSFlow.operationPending(),'no saved transient owner');}return{slots:[87,88,89,90,91],input:'actual fresh NW/MZ JsonEx, not hardware input'};});return;
    }
    if(EXPECTED_DIR&&fs.existsSync(path.join(EXPECTED_DIR,'ps-flow-expected-trade-ui.json'))){
      await scenario('G53-TUIV fresh real NW restores complete trade UI checkpoints and cannot replay old outgoing identity',async()=>{const expected=readExpected('ps-flow-expected-trade-ui.json');eq(expected.cases.map((c:any)=>c.slot),[87,88,89],'three trade checkpoints');for(const item of expected.cases){W.PSFlow._content=item.content;W.PSFlow._app=null;await G.DataManager.loadGame(item.slot);eq(game(),item.state,'complete trade UI state '+item.slot);const a=W.PSFlow.app();assert(!a.pendingTrade&&!a.pendingEvolution&&!a.saveBlocked,'no saved workflow');if(item.intent){const before=clone(game());eq(a.beginTrade(item.requestId,item.intent).status,'refused','old outgoing identity absent');eq(game(),before,'no second trade or new entity');}}return{slots:[87,88,89],input:'fresh actual NW/MZ DataManager and full JsonEx state, not hardware'};});return;
    }

    if(EXPECTED_DIR&&fs.existsSync(path.join(EXPECTED_DIR,'ps-flow-expected-evolution-ui.json'))){
      await scenario('G53-EUIV fresh real NW restores cancellation, event and actual battle evolution',async()=>{const expected=readExpected('ps-flow-expected-evolution-ui.json');eq(expected.cases.map((c:any)=>c.slot),[82,83,84],'three UI checkpoints');for(const item of expected.cases){W.PSFlow._content=item.content;W.PSFlow._app=null;await G.DataManager.loadGame(item.slot);eq(game(),item.state,'complete state '+item.slot);const a=W.PSFlow.app();assert(!a.pendingEvolution&&!a.pendingTriggeredEvolution&&!a.pendingPokedex&&!a.saveBlocked,'no saved workflow');if(item.result){const before=clone(game());eq(a.commitResult(item.result),'already-applied','battle raw replay');eq(game(),before,'no duplicate evolution or learning');}}return{slots:[82,83,84],input:'fresh actual NW/MZ full JsonEx load, no hardware input'};});return;
    }

    if(EXPECTED_DIR&&fs.existsSync(path.join(EXPECTED_DIR,'ps-flow-expected-learning-ui.json'))){
      await scenario('G53-LUIV fresh real NW restores complete learning UI checkpoints',async()=>{const expected=readExpected('ps-flow-expected-learning-ui.json');eq(expected.cases.map((c:any)=>c.slot),[80,81,85,86],'four formal UI checkpoints');for(const item of expected.cases){W.PSFlow._content=item.content;W.PSFlow._app=null;await G.DataManager.loadGame(item.slot);eq(game(),item.state,'complete JsonEx state '+item.slot);assert(!W.PSFlow.app().pendingLearning&&!W.PSFlow.app().saveBlocked,'no saved transient lesson');}return{slots:[80,81,85,86],input:'fresh actual NW/MZ process, full JsonEx roundtrip; no physical keyboard'};});return;
    }

    if (EXPECTED_DIR && fs.existsSync(path.join(EXPECTED_DIR, "ps-flow-expected-m1.json"))) {
      await scenario('E53-M1V fresh actual NW: known and unknown R, deposit heal, capture ledger and full state survive JsonEx',async()=>{
        const B=api(),expected=readExpected('ps-flow-expected-m1.json');eq(expected.cases.map((c:any)=>c.slot),[75,76,77,78,79],'five source checkpoints');
        for(const item of expected.cases){W.PSFlow._content=item.content;W.PSFlow._app=null;await G.DataManager.loadGame(item.slot);eq(game(),item.state,'complete state '+item.slot);const app=W.PSFlow.app();assert(!app.saveBlocked&&!app.pendingPokedex&&!app.pendingEvolution,'no saved transient owner');const before=clone(game());eq(app.commitResult(item.result),'already-applied','raw replay independent of source');eq(game(),before,'no second capture/XP');
          const loc=B.storage.locateMember(game(),'M1-ORIGINAL');assert(loc,'original identity retained');eq([loc.member.readyToEvolve,loc.member.evolutionReadiness],(item.slot===75||item.slot===78)?[true,'known']:item.slot===76?[true,'unknown']:[false,'known'],'R provenance '+item.slot);
          if(item.slot===76){const t=app.beginManagement();eq(app.manage(t,'fresh-withdraw',{kind:'move',source:{id:loc.member.id,position:loc.position},target:{kind:'party',index:game().party.length},expectedTargetId:null}).status,'applied','normal withdraw');app.endManagement(t);const current=clone(game());eq(app.beginEventEvolution({event:7,memberId:loc.member.id}).status,'unchanged','valid content does not repair unknown R after restart');eq(game(),current,'refusal zero write');}
          if(item.slot===75||item.slot===78){eq(app.beginEventEvolution({event:7,memberId:loc.member.id}).status,'pending','real recorded readiness remains eligible');const p=app.pendingEvolution;app.resolveEvolution(p.token,p.revision,{kind:'cancel'});assert(!app.saveBlocked,'explicit cancellation releases owner');}
        }return{slots:[75,76,77,78,79],input:'fresh real NW/MZ load and full-state/ledger/provenance checks; direct service decisions, not hardware input'};
      });return;
    }
    if (EXPECTED_DIR && fs.existsSync(path.join(EXPECTED_DIR, "ps-flow-expected-viewing.json"))) {
      await scenario('E53-DVV1 fresh NW: viewing/recent/gift/capture/evolution/moves restore without transient owners',async()=>{
        const expected=readExpected("ps-flow-expected-viewing.json");eq(expected.cases.map((c:any)=>c.slot),[71,72,73,74],'four producer checkpoints');for(const item of expected.cases){W.PSFlow._content=item.content;W.PSFlow._app=null;await G.DataManager.loadGame(item.slot);eq(game(),item.state,'complete state '+item.slot);const app=W.PSFlow.app();assert(!app.pendingPokedex&&!app.pendingEvolution&&!app.saveBlocked,'no transient presentation reconstructed');const before=clone(game());W.PSFlow.pokedexSnapshot();eq(game(),before,'render/read does not add history');if(item.state.claims['view-grant']){eq(app.claimGrant('view-grant').status,'already-claimed','no second grant');eq(game(),before,'no resources/count replay');}}return{slots:[71,72,73,74],input:'fresh actual NW/MZ JsonEx load with producer-hash-bound expected states'};
      });return;
    }
    if (EXPECTED_DIR && fs.existsSync(path.join(EXPECTED_DIR, "ps-flow-expected-acquisition.json"))) {
      await scenario('E53-ACV1 fresh NW: complete acquisition dex/resources/claim round trip and grant cannot be claimed twice',async()=>{
        const expected=readExpected("ps-flow-expected-acquisition.json");eq(expected.cases.length,2,'both producer checkpoints');for(const item of expected.cases){W.PSFlow._content=item.content;W.PSFlow._app=null;await G.DataManager.loadGame(item.slot);eq(game(),item.state,'complete state '+item.slot);const app=W.PSFlow.app();assert(!app.pendingReceiving&&!app.saveBlocked,'no transient owner reconstructed');eq(app.claimGrant('host-acq').status,'already-claimed','persistent claim');eq(game(),item.state,'no duplicate resources or dex changes');}return{slots:expected.cases.map((item:any)=>item.slot),input:'fresh actual NW/MZ process and actual JsonEx load; producer-bound full-state expected file'};
      });return;
    }
    if (EXPECTED_DIR && fs.existsSync(path.join(EXPECTED_DIR, "ps-flow-expected-trade.json"))) {
      await scenario('E53-TRV1 fresh NW: complete trade states round trip, no draft/lock returns and old outgoing requests cannot replay',async()=>{
        const expected=readExpected("ps-flow-expected-trade.json");eq(expected.cases.length,2,'both trade producer checkpoints');for(const item of expected.cases){W.PSFlow._content=item.content;W.PSFlow._app=null;await G.DataManager.loadGame(item.slot);eq(game(),item.state,'complete trade state '+item.slot);const app=W.PSFlow.app();assert(!app.pendingTrade&&!app.pendingEvolution&&!app.saveBlocked,'no transient trade state reconstructed');const before=clone(game());eq(W.PSFlow.beginTrade(item.requestId,item.intent).status,'refused','old outgoing stable ID absent after restart');eq(game(),before,'no replayed resources or statistics');}return {slots:expected.cases.map((item:any)=>item.slot),input:'new actual NW/MZ process and actual JsonEx load, expected source bound by producer'};
      });return;
    }
    if (EXPECTED_DIR && fs.existsSync(path.join(EXPECTED_DIR, "ps-flow-expected-triggered.json"))) {
      await scenario('E53-TV1 fresh NW: complete candy/stone/event states round trip without transient action reconstruction',async()=>{
        const expected=readExpected("ps-flow-expected-triggered.json");eq(expected.cases.length,5,'producer supplied all five save checkpoints');for(const item of expected.cases){W.PSFlow._content=item.content;W.PSFlow._app=null;await G.DataManager.loadGame(item.slot);eq(game(),item.state,'exact full state slot '+item.slot);const app=W.PSFlow.app();assert(!app.pendingTriggeredEvolution&&!app.pendingEvolution&&!app.saveBlocked,'no saved workflow slot '+item.slot);}return {slots:expected.cases.map((item:any)=>item.slot),input:'independent actual NW/MZ process, original states read from producer-bound expected file'};
      });return;
    }
    if (EXPECTED_DIR && fs.existsSync(path.join(EXPECTED_DIR, "ps-flow-expected-learning.json"))) {
      await scenario("E53-LV1 fresh NW: TR/moves/firstMoves/statistics and reminder/forget saves round trip",async()=>{
        const expected=readExpected("ps-flow-expected-learning.json");W.PSFlow._content=expected.content;W.PSFlow._app=null;G.DataManager.setupNewGame();await G.DataManager.loadGame(expected.slot);
        eq(game(),expected.state,"complete machine result across new process");assert(!W.PSFlow.app().pendingLearning&&!W.PSFlow.app().saveBlocked,"transient lesson not recreated");
        assert(expected.reminderCase,"producer supplied reminder/forget save");await G.DataManager.loadGame(expected.reminderCase.slot);eq(game(),expected.reminderCase.state,"reminder/forget exact round trip");assert(!W.PSFlow.app().pendingLearning,"no saved workflow");
        if(expected.eggCase){W.PSFlow._content=expected.eggCase.content;W.PSFlow._app=null;await G.DataManager.loadGame(expected.eggCase.slot);eq(game(),expected.eggCase.state,"compiled3 egg teaching save round trip with unchanged schema7");assert(!W.PSFlow.app().pendingLearning&&!W.PSFlow.app().saveBlocked,"no egg teaching continuation recreated");}
        return {input:"fresh actual NW/MZ load API, no original in-memory receipt",slots:[expected.slot,expected.reminderCase.slot]};
      });return;
    }
    if (EXPECTED_DIR && fs.existsSync(path.join(EXPECTED_DIR, "ps-flow-expected-postbattle.json"))) {
      await scenario("E53-V1 new NW process: evolved species/move and original ledger survive; no continuation rebuilt", async () => {
        const expected = readExpected("ps-flow-expected-postbattle.json"); W.PSFlow._content = expected.content; W.PSFlow._app = null;
        G.DataManager.setupNewGame(); await G.DataManager.loadGame(expected.slot); eq(game(), expected.state, "complete evolved state round trip");
        const app = W.PSFlow.app(); assert(!app.pendingEvolution && !app.saveBlocked, "no transient queue saved or recreated");
        eq(app.commitResult(expected.result), "already-applied", "same raw battle cannot make a new evolution chance"); eq(game(), expected.state, "no repeated resource, statistic or move change");
        const readiness = expected.readinessCase;
        assert(readiness, "producer supplied the actual D readiness save"); W.PSFlow._content = readiness.content; W.PSFlow._app = null; await G.DataManager.loadGame(readiness.slot);
        eq(game(), readiness.state, "R known survives independent process load"); eq([game().party[0].readyToEvolve,game().party[0].evolutionReadiness],[true,"known"],"no historical damage/faint record needs to be invented on load");
        eq(W.PSFlow.app().commitResult(readiness.result), "already-applied", "R result cannot be reprocessed after restart"); eq(game(), readiness.state, "R and resources unchanged on replay");
        return { input: "fresh actual NW/MZ load API and original-result replay", slot: expected.slot, evolutionCount: game().stats.evolution_count };
      });
      return;
    }
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
        for (const entry of expected.ledgerCases || []) {
          G.DataManager.setupNewGame(); await G.DataManager.loadGame(entry.slot); assert(!G.$gameSystem._psSaveError, JSON.stringify(G.$gameSystem._psSaveError)); eq(game(), entry.state, "new process retained legal reserved IDs");
          for (const id of entry.ids) {const raw = {protocol: 1, battleId: id, outcome: {kind: "run", winner: null}, members: {}, bag: {}, captured: [], dex: {seen: [], owned: []}, money: 7}; const r = api().state.applyBattleResult(game(), raw, undefined, undefined, {content: W.PSFlow.content()}); eq(r.status, "already-applied", "new process refuses duplicate battle payoff"); eq(r.state, entry.state, "new process has no duplicate resource change");}
          for (const id of entry.grantIds) {const r = api().grants.applyGrant(game(), id, W.PSFlow.content(), () => 0); eq(r.status, "already-claimed", "new process refuses duplicate grant even if no longer published"); eq(r.state, entry.state, "new process has no duplicate grant change");} loaded.push(entry.slot);
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
      if (fs.existsSync(path.join(EXPECTED_DIR, "ps-flow-expected-effects.json"))) await scenario("C53-V2 real restart: R unknown barrier and exact replay retain capture and XP", async () => {
        const expected = readExpected("ps-flow-expected-effects.json"); G.DataManager.setupNewGame(); await G.DataManager.loadGame(expected.slot);
        eq(game(), expected.state, "full committed effects state survives the new process");
        const member = game().party.find((m: any) => m.id === expected.memberId); eq([member.readyToEvolve, member.evolutionReadiness, member.friendship], [true, "unknown", 99], "durable barrier is not silently repaired");
        let contentReads = 0;
        const app = new (api().app.GameApplication)({ state: { read: () => game(), replace: () => { throw new Error("replay must not write"); } }, sessions: { create: async () => { throw new Error("replay must not create"); } }, projection: { project: () => {} }, content: () => { contentReads++; throw new Error("replay must not read changed content"); } });
        eq(app.commitResult(expected.result), "already-applied", "original raw/hash replay after restart"); eq(contentReads, 0, "zero content dependency"); eq(game(), expected.state, "no resource or readiness backfill");
        if (expected.receivingCase) {
          const receiving = expected.receivingCase; G.DataManager.setupNewGame(); await G.DataManager.loadGame(receiving.slot);
          eq(game(), receiving.state, "pending identity recovery survives a real new process");
          eq(app.commitResult(receiving.result), "already-applied", "reception result has no late backfill after restart");
          eq(contentReads, 0, "reception replay needs no current content"); eq(game(), receiving.state, "reception replay preserves every field");
        }
        return { slot: expected.slot, input: "MZ load API in fresh NW process plus direct replay", contentReads };
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
      try { if (mode === "pokedex-ui") await runPokedexUI(); else if (mode === "item-evolution-ui") await runItemEvolutionUI(); else if (mode === "battle-entry") await runBattleEntryOwnership(); else if (mode === "trade-ui") await runTradeUI(); else if (mode === "evolution-ui") await runEvolutionUI(); else if (mode === "learning-ui") await runLearningUI(); else if (mode === "m1") await runM1Convergence(); else if (mode === "viewing") await runDexViewing(); else if (mode === "acquisition") await runAcquisitionTransactions(); else if (mode === "trade") await runTradeTransactions(); else if (mode === "triggered") await runTriggeredEvolution(); else if (mode === "learning") await runLearningTransactions(); else if (mode === "postbattle") await runPostbattleEvolution(); else if (mode === "progression-data") await runProgressionData(); else if (mode === "capability") await runCapabilitySeam(); else if (mode === "empty-source") await runEmptySource(); else if (mode === "verify-save") await verifySave(); else if (mode === "matrix") await runMatrixMode(); else if (mode === "perf") await runPerf(); else if (mode === "leak") await runLeakBisect(); else if (mode === "leakhunt") await runLeakHunt(); else if (mode === "heap") await runHeapSnapshot(); else if (mode === "saveloc") await runSaveLocation(); else if(mode === "management") await runManagementUI(); else if(mode === "inventory") await runInventoryUI(); else if(mode === "driver-selftest") await runDriverSelftest(); else { await runAll(); await runManagementUI(); await runInventoryUI(); } }
      catch (e: any) { results.push({ id: "driver", status: "fail", error: String(e && e.stack || e) }); }
      try { report.contentIdentity = W.PSFlow.content().meta; } catch (e) { report.contentIdentity = { error: String(e) }; }
      try { report.logTail = W.PSFlow.logger ? W.PSFlow.logger.tail(60) : null; } catch (e) { report.logTail = { error: String(e) }; } // redacted, bounded session diagnostics
      report.overall = results.every((r) => r.status === "pass") ? "pass" : "fail";
      if (OUT) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(report, null, 2)); }
      if (argv.includes("--ps-flow-quit")) G.nw.App.quit();
    }, 500);
  };
})();
