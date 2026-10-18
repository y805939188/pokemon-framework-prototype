/**
 * Step 2.4: MZ/RPGReactor integration of the Showdown battle session (placeholder text UI).
 *
 * Responsibilities: plugin command that starts a battle and makes the map interpreter wait; a text
 * battle scene (windows are prototype-style like Reactor's own); game state kept inside the MZ save
 * (`G.$gameSystem._psGame`), changed ONLY by committing a BattleResult at the end (idempotent by battleId).
 * Not here: art, animation, full menu system, doubles UI.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

(() => {
  "use strict";
  const G: any = globalThis; // Reactor's globals are real typed values; we only need them loosely here

  const NAME = "PS_BattleFlow";
  const W = window as any;
  const nodeRequire = (globalThis as any).require as ((id: string) => any) | undefined;

  // ---------------------------------------------------------------- engine access (loaded lazily, runtime-relative)
  let ENGINE: any = null;
  function engine(): any {
    if (!ENGINE) {
      const tLoad = performance.now();
      if (!nodeRequire) throw new Error("Node require() is not available in this runtime");
      ENGINE = {
        Session: nodeRequire("./js/engine/game/session.cjs").BattleSession,
        S: nodeRequire("./js/engine/game/state.cjs"),
        F: nodeRequire("./js/engine/fixtures/game.cjs"),
        D: nodeRequire("./js/engine/game/describe.cjs"),
      };
      W.PSFlow && (W.PSFlow.perf.engineLoadMs = Math.round((performance.now() - tLoad) * 10) / 10);
    }
    return ENGINE;
  }

  // ---------------------------------------------------------------- shared flow state / API
  const PSFlow: any = (W.PSFlow = {
    running: false, // a battle scene is open (the interpreter waits on this)
    request: null as any,
    lastOutcome: null as any,
    lastResult: null as any,
    seed: undefined as any, // tests pin the engine seed
    fast: false, // tests: no message pacing
    debug: {} as any, // tests: failure injection
    perf: { engineLoadMs: null as any, battles: [] as any[], cur: null as any }, // measurement hooks (cheap; read by the test driver)
    game(): any {
      if (!G.$gameSystem._psGame) G.$gameSystem._psGame = engine().F.makeGame();
      return G.$gameSystem._psGame;
    },
    resetGame(): void {
      G.$gameSystem._psGame = engine().F.makeGame();
      G.$gameSystem._psBattleSeq = 0;
    },
    /** Apply a BattleResult to the persistent state. Safe to call twice. */
    commit(result: any): string {
      const r = engine().S.applyBattleResult(PSFlow.game(), result);
      if (r.status === "applied") G.$gameSystem._psGame = r.state;
      return r.status;
    },
    async begin(): Promise<any> {
      const { Session, F } = engine();
      const req = PSFlow.request;
      const team = req.foes.map((f: any, i: number) => F.foeMember(`W${req.seq}-${i + 1}`, f.species, f.level));
      const tCreate = performance.now();
      const session = await Session.create({
        game: PSFlow.game(), battleId: req.battleId, content: F.content, seed: PSFlow.seed,
        foe: { kind: req.kind, team },
      });
      if (PSFlow.perf.cur) PSFlow.perf.cur.sessionMs = Math.round((performance.now() - tCreate) * 10) / 10;
      return session;
    },
    finish(session: any): any {
      const req = PSFlow.request;
      const result = session.result();
      const status = PSFlow.commit(result);
      PSFlow.lastResult = result;
      const code = result.outcome.kind === "win" ? (session.ended && session.ended.winner === "Player" ? 1 : 4)
        : result.outcome.kind === "caught" ? 2 : result.outcome.kind === "run" ? 3 : 4;
      PSFlow.lastOutcome = { code, battleId: req.battleId, commit: status, kind: result.outcome.kind };
      PSFlow.close(code);
      return PSFlow.lastOutcome;
    },
    abort(error: unknown): void {
      PSFlow.lastOutcome = { code: 0, battleId: PSFlow.request && PSFlow.request.battleId, commit: "none", aborted: true, error: String(error instanceof Error ? error.message : error) };
      PSFlow.close(0);
    },
    close(code: number): void {
      const cur = PSFlow.perf.cur;
      if (cur && !cur.totalMs) { cur.totalMs = Math.round((performance.now() - cur.t0) * 10) / 10; cur.code = code; PSFlow.perf.battles.push(cur); }
      const v = PSFlow.request && PSFlow.request.resultVariable;
      if (v) G.$gameVariables.setValue(v, code);
      PSFlow.running = false;
    },
  });

  // ---------------------------------------------------------------- plugin commands + interpreter wait
  function parseFoes(text: string): { species: string; level: number }[] {
    return String(text).split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
      const [species, level] = s.split(":");
      return { species: species.trim(), level: Number(level) || 5 };
    });
  }

  G.PluginManager.registerCommand(NAME, "StartBattle", function (this: any, args: any) {
    if (PSFlow.running) throw new Error("a battle is already running");
    G.$gameSystem._psBattleSeq = (G.$gameSystem._psBattleSeq || 0) + 1;
    PSFlow.request = {
      kind: args.kind === "trainer" ? "trainer" : "wild",
      foes: parseFoes(args.foes || "Pidgey:5"),
      seq: G.$gameSystem._psBattleSeq,
      battleId: `${args.battleId || "battle"}#${G.$gameSystem._psBattleSeq}`,
      resultVariable: Number(args.resultVariable) || 0,
    };
    PSFlow.running = true;
    PSFlow.lastOutcome = null;
    PSFlow.perf.cur = { battleId: PSFlow.request.battleId, t0: performance.now(), actions: [] as any[] };
    G.SceneManager.push(W.Scene_PSBattle);
    this.setWaitMode("psBattle");
  });
  G.PluginManager.registerCommand(NAME, "ResetGame", () => PSFlow.resetGame());

  const baseUpdateWaitMode = G.Game_Interpreter.prototype.updateWaitMode;
  G.Game_Interpreter.prototype.updateWaitMode = function (this: any) {
    if (this._waitMode === "psBattle") {
      if (PSFlow.running) return true;
      this._waitMode = "";
      return false;
    }
    return baseUpdateWaitMode.call(this);
  };

  // ---------------------------------------------------------------- windows (prototype style, like Reactor's own)
  function Window_PSText(this: any, rect: any) { this.initialize(rect); }
  Window_PSText.prototype = Object.create(G.Window_Base.prototype);
  Window_PSText.prototype.constructor = Window_PSText;
  Window_PSText.prototype.initialize = function (rect: any) {
    G.Window_Base.prototype.initialize.call(this, rect);
    this._lines = [];
    this._max = Math.max(1, Math.floor(this.innerHeight / this.lineHeight()));
  };
  Window_PSText.prototype.setLines = function (lines: string[]) { this._lines = lines.slice(-this._max); this.refresh(); };
  Window_PSText.prototype.add = function (line: string) { this._lines.push(line); this._lines = this._lines.slice(-this._max); this.refresh(); };
  Window_PSText.prototype.refresh = function () {
    this.contents.clear();
    this._lines.forEach((t: string, i: number) => this.drawText(t, 0, i * this.lineHeight(), this.innerWidth));
  };

  function Window_PSMenu(this: any, rect: any) { this.initialize(rect); }
  Window_PSMenu.prototype = Object.create(G.Window_Command.prototype);
  Window_PSMenu.prototype.constructor = Window_PSMenu;
  Window_PSMenu.prototype.initialize = function (rect: any) {
    this._items = [];
    G.Window_Command.prototype.initialize.call(this, rect);
  };
  Window_PSMenu.prototype.makeCommandList = function () {
    for (const it of this._items) this.addCommand(it.name, it.symbol || "ok", it.enabled !== false, it.ext);
  };
  Window_PSMenu.prototype.setItems = function (items: any[]) {
    this._items = items;
    this.refresh();
    const first = items.findIndex((i) => i.enabled !== false);
    this.select(first < 0 ? 0 : first);
  };
  Window_PSMenu.prototype.itemAt = function (i: number) { return this._items[i]; };
  Window_PSMenu.prototype.maxCols = function () { return 1; };

  // ---------------------------------------------------------------- the scene
  const REASON: Record<string, string> = {
    trainer: "No! There's no running from a trainer battle!", trapped: "You can't escape, something is holding you!",
    ballsdisabled: "Balls can't be used here.", multiplefoes: "There are too many foes to aim at!",
    noactive: "There is no one to act.", "none-left": "You have none of that left.", "unknown-item": "That item can't be used in battle.",
    "choice-rejected": "That choice isn't available right now.", "not-registered": "That isn't possible right now.",
  };

  /** Same reason code, different wording per action (a refused Ball is not a refused Run). */
  const REASON_FOR: Record<string, Record<string, string>> = {
    ball: { trainer: "The trainer blocked the Ball! Don't be a thief!", ballsdisabled: "Balls can't be used in this battle.", multiplefoes: "You can't aim at just one of several foes!" },
    run: { trainer: "No! There's no running from a trainer battle!", trapped: "You can't escape, something is holding you!" },
  };

  function Scene_PSBattle(this: any) { this.initialize(...(arguments as any)); }
  W.Scene_PSBattle = Scene_PSBattle;
  Scene_PSBattle.prototype = Object.create(G.Scene_MenuBase.prototype);
  Scene_PSBattle.prototype.constructor = Scene_PSBattle;

  const P = Scene_PSBattle.prototype;
  P.initialize = function () {
    G.Scene_MenuBase.prototype.initialize.call(this);
    this._psBattle = true; // marker for the test driver (constructor identity is wrapped by pixi_compat)
    this._ready = false; this._failure = null; this._queue = []; this._wait = 0; this._mode = "boot"; this._busy = false;
    this._session = null; this._D = null; this._names = {};
  };
  P.create = function () {
    G.Scene_MenuBase.prototype.create.call(this);
    const w = G.Graphics.boxWidth, h = G.Graphics.boxHeight;
    this._status = new (Window_PSText as any)(new G.Rectangle(0, 0, w, 120));
    this._log = new (Window_PSText as any)(new G.Rectangle(0, 120, w, 300));
    this._menu = new (Window_PSMenu as any)(new G.Rectangle(0, 420, w, h - 420));
    for (const win of [this._status, this._log, this._menu]) this.addWindow(win);
    this._menu.setHandler("ok", this.onMenuOk.bind(this));
    this._menu.setHandler("cancel", this.onMenuCancel.bind(this));
    this._menu.deactivate(); this._menu.hide();
    PSFlow.begin().then((s: any) => { this._session = s; this._ready = true; }).catch((e: unknown) => { this._failure = e; this._ready = true; });
  };
  P.isReady = function () { return G.Scene_MenuBase.prototype.isReady.call(this) && this._ready; };
  P.start = function () {
    G.Scene_MenuBase.prototype.start.call(this);
    if (this._failure) { this.abort(this._failure); return; }
    const s = this._session;
    for (const m of [...s.party, ...s.foeTeam]) this._names[m.id] = m.species;
    this._D = engine().D.make(this._names);
    this._mode = "messages";
    this.pushMessages(s.take());
    this.refreshStatus();
  };
  P.update = function () {
    G.Scene_MenuBase.prototype.update.call(this);
    if (this._mode === "messages") this.updateQueue();
  };

  // --- message pacing
  P.pushMessages = function (msgs: any[]) {
    for (const m of msgs) this._queue.push(...this._D.message(m));
    this._mode = "messages";
    this._menu.deactivate(); this._menu.hide();
  };
  P.updateQueue = function () {
    if (this._busy) return;
    if (this._queue.length) {
      if (G.Input.isTriggered("ok")) { while (this._queue.length) this._log.add(this._queue.shift()); }
      else if (this._wait > 0) this._wait--;
      else { this._log.add(this._queue.shift()); this._wait = PSFlow.fast ? 0 : 24; }
      return;
    }
    this.refreshStatus();
    this.afterMessages();
  };
  P.afterMessages = function () {
    const s = this._session;
    if (this._failure) { this.showEnd(true); return; }
    if (s.finished) { this.showEnd(false); return; }
    if (s.pendingLearn) { this.showLearn(); return; }
    const req = s.currentRequest();
    if (req && req.forceSwitch) { this.showParty("forced"); return; }
    this.showMain();
  };
  P.refreshStatus = function () {
    const s = this._session; if (!s) return;
    const line = (side: string, who: string) => s.gw.readState(side).filter((x: any) => x.active).map((x: any) =>
      `${who}: ${this._names[x.id] || x.id}  Lv${x.level}  HP ${x.hp}/${x.maxhp}${x.status ? "  [" + x.status + "]" : ""}${x.fainted ? "  (fainted)" : ""}`);
    this._status.setLines([...line("p2", "Foe"), ...line("p1", "You"), `Bag: ${Object.entries(s.bag).map(([k, v]) => `${k} x${v}`).join(", ") || "(empty)"}`]);
  };

  // --- menus
  P.show = function (mode: string, items: any[]) {
    const cur = PSFlow.perf.cur;
    if (cur && cur.firstMenuMs === undefined) cur.firstMenuMs = Math.round((performance.now() - cur.t0) * 10) / 10;
    this._mode = mode;
    this._menu.setItems(items);
    this._menu.show(); this._menu.activate();
  };
  P.showMain = function () {
    this.show("main", [
      { name: "Fight", ext: "fight" }, { name: "Bag", ext: "bag" }, { name: "Pokémon", ext: "party" }, { name: "Run", ext: "run" },
    ]);
  };
  P.showMoves = function () {
    const req = this._session.currentRequest();
    const moves = req.active[0].moves;
    this.show("moves", moves.map((m: any, i: number) => ({ name: `${m.move}   PP ${m.pp}/${m.maxpp}`, ext: i + 1, enabled: !m.disabled && m.pp > 0 })));
  };
  P.showBag = function () {
    const bag = this._session.bag;
    const names: any = { potion: "Potion", antidote: "Antidote", xattack: "X Attack", pokeball: "Poké Ball", masterball: "Master Ball", superpotion: "Super Potion", fullheal: "Full Heal" };
    const items = Object.keys(bag).filter((k) => bag[k] > 0).map((k) => ({ name: `${names[k] || k}  x${bag[k]}`, ext: k }));
    this.show("bag", items.length ? items : [{ name: "(nothing)", ext: null, enabled: false }]);
  };
  P.showParty = function (sub: string) {
    this._partySub = sub;
    const s = this._session;
    const live = Object.fromEntries(s.gw.readState("p1").map((x: any) => [x.id, x]));
    const items = s.party.map((m: any) => {
      const x = live[m.id];
      const can = sub === "item" ? true : !(x.active || x.fainted);
      return { name: `${m.species}  Lv${x.level}  HP ${x.hp}/${x.maxhp}${x.fainted ? " (fainted)" : ""}${x.active ? " *" : ""}`, ext: m.id, enabled: can };
    });
    this.show(sub === "forced" ? "party-forced" : "party", items);
  };
  P.showLearn = function () {
    const p = this._session.pendingLearn;
    const m = this._session.party.find((x: any) => x.id === p.memberId);
    this.show("learn", [...m.moves.map((mv: any, i: number) => ({ name: `Forget ${mv.id}`, ext: i })), { name: `Don't learn ${p.move.name}`, ext: null }]);
  };
  P.showEnd = function (aborted: boolean) {
    if (aborted) this._log.add("The battle was aborted. Nothing was saved.");
    this._aborted = aborted;
    this.show("end", [{ name: aborted ? "Back to the map" : "Continue", ext: "end" }]);
  };

  P.onMenuCancel = function () {
    switch (this._mode) {
      case "moves": case "bag": this.showMain(); return;
      case "party": if (this._pendingItem) { this._pendingItem = null; this.showBag(); } else this.showMain(); return;
      default: G.SoundManager.playBuzzer(); this._menu.activate();
    }
  };
  P.onMenuOk = function () {
    if (this._busy) return;
    const it = this._menu.itemAt(this._menu.index());
    const ext = it && it.ext;
    switch (this._mode) {
      case "main":
        if (ext === "fight") this.showMoves();
        else if (ext === "bag") this.showBag();
        else if (ext === "party") this.showParty("switch");
        else if (ext === "run") this.act(() => this._session.run(), "run");
        return;
      case "moves": this.act(() => { if (PSFlow.debug.failNext === "move") { PSFlow.debug.failNext = null; throw new Error("injected failure"); } return this._session.chooseMove(ext); }, "move"); return;
      case "bag":
        if (!ext) { this._menu.activate(); return; }
        if (/ball$/.test(ext)) this.act(() => this._session.throwBall(ext), "ball");
        else { this._pendingItem = ext; this.showParty("item"); }
        return;
      case "party":
        if (this._pendingItem) { const item = this._pendingItem; this._pendingItem = null; this.act(() => this._session.useItem(item, ext), "item"); }
        else this.act(() => this._session.chooseSwitch(ext), "switch");
        return;
      case "party-forced": this.act(() => this._session.chooseForcedSwitch(ext), "switch"); return;
      case "learn": this.act(async () => ({ ok: true, messages: await this._session.decideLearn(ext) }), "learn"); return;
      case "end": this.onEnd(); return;
    }
  };

  /** Run one session action; refusals show a reason and return to the main menu (nothing consumed). */
  P.act = function (fn: () => Promise<any> | any, kind?: string) {
    this._busy = true;
    this._menu.deactivate(); this._menu.hide();
    const tAct = performance.now();
    Promise.resolve().then(fn).then((r: any) => {
      this._busy = false;
      const cur = PSFlow.perf.cur;
      if (cur) cur.actions.push({ kind: kind || "other", ms: Math.round((performance.now() - tAct) * 10) / 10 });
      if (r && r.ok === false) {
        this._queue.push((kind && REASON_FOR[kind] && REASON_FOR[kind][r.reason]) || REASON[r.reason] || `Not possible (${r.reason}).`);
        this._mode = "messages";
        return;
      }
      this.pushMessages(r.messages || []);
    }).catch((e: unknown) => { this._busy = false; this._failure = e; this.abort(e); });
  };
  P.abort = function (e: unknown) {
    PSFlow.abort(e);
    this._failure = e;
    this._queue.length = 0;
    this._mode = "messages";
    this.refreshStatus && this._session && this.refreshStatus();
  };
  P.onEnd = function () {
    if (!this._aborted && !this._failure) {
      try { PSFlow.finish(this._session); } catch (e) { PSFlow.abort(e); }
    }
    this.popScene();
  };
  P.terminate = function () {
    G.Scene_MenuBase.prototype.terminate.call(this);
    if (PSFlow.running) PSFlow.close(0); // never leave the interpreter waiting
  };
})();
