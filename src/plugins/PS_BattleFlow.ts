/**
 * Step 2.4: MZ/RPGReactor integration of the Showdown battle session (placeholder text UI).
 *
 * Responsibilities: plugin command that starts a battle and makes the map interpreter wait; a text
 * battle scene (windows are prototype-style like Reactor's own); game state kept inside the MZ save
 * (`G.$gameSystem._psGame`), changed ONLY by committing a BattleResult at the end (idempotent by battleId).
 * Not here: art, animation, full menu system, doubles UI.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { config as RuleConfig } from "../framework/rules/index";
import { BattleSceneController } from "./battleflow/controller";
import type { BattleScenePresentation } from "./battleflow/controller";
import { BattleDisplayPlayback } from "./battleflow/display";
import type { BattleDisplayCard } from "./battleflow/display";
import { hpColour } from "./battleflow/visual-timing";
import { BattleMenuCursor, gridCursor } from "./battleflow/menu";
const { developmentCapabilities } = RuleConfig;

(() => {
  "use strict";
  const G: any = globalThis; // Reactor's globals are real typed values; we only need them loosely here

  const NAME = "PS_BattleFlow";
  const W = window as any;
  const nodeRequire = (globalThis as any).require as any; // NW.js Node require (has .resolve)

  // ------------------------------------------------------- production engine access (loaded lazily, runtime-relative)
  let ENGINE: any = null;
  function engine(): any {
    if (!ENGINE) {
      const tLoad = performance.now();
      if (!nodeRequire) throw new Error("Node require() is not available in this runtime");
      const B = nodeRequire("./js/engine/build/production.cjs");
      ENGINE = {
        B,
        D: B.describe,
        root: nodeRequire("path").dirname(nodeRequire("path").dirname(nodeRequire("path").dirname(nodeRequire("path").dirname(nodeRequire.resolve("./js/engine/build/production.cjs"))))),
      };
      W.PSFlow && (W.PSFlow.perf.engineLoadMs = Math.round((performance.now() - tLoad) * 10) / 10);
    }
    return ENGINE;
  }
  // Only explicit fixture content and ResetGame load testing. Normal sample/new-game paths never touch this entry.
  let TESTING: any = null;
  function testing(): any {
    if (!TESTING) {
      if (!nodeRequire) throw new Error("Node require() is not available in this runtime");
      TESTING = nodeRequire("./js/engine/build/testing.cjs").fixtures;
    }
    return TESTING;
  }

  /** What this plugin uses of the game application (framework/app); the full typed contract is app/game-application.ts. */
  interface BattleOutcomeView { code: number; battleId: string | null; commit: string; kind?: string; aborted?: true; error?: string; projection?: string; projectionError?: string; pending?: boolean }
  interface GameAppView {
    startBattle(request: unknown): Promise<any>;
    startTrainerBattle(request: unknown): Promise<any>;
    trainerRecord(id: string, version: number): any;
    finishBattle(session: unknown, request: unknown): BattleOutcomeView & { result?: unknown };
    abortBattle(request: unknown, error: unknown): BattleOutcomeView;
    commitResult(result: unknown, options?: unknown): string;
    readonly saveBlocked: boolean;
    readonly stateGeneration: number;
    readonly encounterBlocked: boolean;
    readonly pendingPokedex: any;
    pokedexSnapshot(text?: any, currentRegion?: number | null): any;
    updatePokedex(command: any): any;
    resolvePokedex(token: string, revision: number, decision: any): any;
    resolveReceiving(token: string, decisions?: unknown, signal?: unknown): any;
    terminateAcquisition(token: string): any;
    readonly pendingEvolution: any;
    readonly pendingLearning: any;
    readonly pendingTriggeredEvolution: any;
    readonly pendingTrade: any;
    beginTrade(requestId: string, intent: any): any;
    resolveTrade(token: string, revision: number, decision: any): any;
    beginEvolutionItem(parent: string, requestId: string, intent: any): any;
    beginEventEvolution(intent?: any): any;
    resolveTriggeredEvolution(token: string, revision: number, decision: any): any;
    beginLearning(intent: any, parent?: any): any;
    resolveLearning(token: string, revision: number, decision: any): any;
    resolveEvolution(token: string, revision: number, decision: unknown): any;
    startNewGame(): { status: string };
    claimGrant(grantId: string): { status: string; grantId: string; reason?: string; error?: string; placed?: { id: string; species: string; form: number; level: number; to: string }[]; items?: Record<string, number>; money?: number };
    healParty(): { status: string; reason?: string; error?: string };
    prepareEncounter(table: unknown, region: number): { ok: boolean; reason?: string; error?: string; foe?: { species: string; level: number } };
    describeParty(): { members: { id: string; species: string; form: number; nameKey?: string; level: number; hp: number; maxhp: number; status: string; moves: { id: string; pp: number; maxpp: number }[] }[]; boxes: number; bag: Record<string, number>; money: number };
    recordSteps(n?: number): { status: string; steps?: number; reason?: string; error?: string };
    now(): number;
    stateReplacedByHost(): void;
    assertHostStateReplacementAllowed(): void;
    previewFriendshipMigration(port: any, paths?: readonly string[]): Promise<any>;
    confirmFriendshipMigration(handle: any): Promise<any>;
    cancelFriendshipMigration(handle: any): any;
  }

  // ---------------------------------------------------------------- shared flow state / API
  let openingBattle: object | null = null;
  const PSFlow: any = (W.PSFlow = {
    developerCapabilities: {}, // explicit developer/test injection only; never plugin settings or save data
    operationPending(): boolean { return PSFlow.running || !!PSFlow._app?.saveBlocked || !!W.PSManagement?.presentationPending?.(); },
    /** Programmatic action bridges; formal learning screens/commands belong to G. */
    beginLearning(intent: any, parent?: any): any { return PSFlow.app().beginLearning(intent, parent); },
    resolveLearning(token: string, revision: number, decision: any): any { return PSFlow.app().resolveLearning(token, revision, decision); },
    beginEvolutionItem(parent: string, requestId: string, intent: any): any { return PSFlow.app().beginEvolutionItem(parent, requestId, intent); },
    beginEventEvolution(intent: any = {}): any { return PSFlow.app().beginEventEvolution(intent); },
    resolveTriggeredEvolution(token: string, revision: number, decision: any): any { return PSFlow.app().resolveTriggeredEvolution(token, revision, decision); },
    terminateAcquisition(token: string): any { return PSFlow.app().terminateAcquisition(token); },
    pokedexSnapshot(text: any = {}, currentRegion: number | null = null): any { return PSFlow.app().pokedexSnapshot(text, currentRegion); },
    updatePokedex(command: any): any { return PSFlow.app().updatePokedex(command); },
    waitForPokedex(interpreter: any): boolean {
      const pending = PSFlow._app?.pendingPokedex; if (!pending) return false;
      interpreter.setWaitMode("psPokedex"); interpreter._psPokedexToken = pending.token; return true;
    },
    resolvePokedex(token: string, revision: number, decision: any): any {
      const op = PSFlow._op, returned = PSFlow.app().resolvePokedex(token, revision, decision), continuation = returned.continuation;
      if (continuation && "code" in continuation && op && op === PSFlow._op) {
        const { result, ...outcome } = continuation; PSFlow.completeBattleOutcome(outcome, result, op);
      }
      return returned;
    },
    beginTrade(requestId: string, intent: any): any { return PSFlow.app().beginTrade(requestId, intent); },
    resolveTrade(token: string, revision: number, decision: any): any { return PSFlow.app().resolveTrade(token, revision, decision); },
    assertBattleAllowed(): void { const capabilities = developmentCapabilities(PSFlow.developerCapabilities); if (!capabilities.allowExperimentalHeldItemBattle && (PSFlow.game().party || []).some((m: any) => !!m.item)) throw new Error("held-item-battle-disabled: 战后持物写回未完成"); },
    running: false, // a battle scene is open (the interpreter waits on this)
    request: null as any,
    lastOutcome: null as any,
    lastResult: null as any,
    lastClaim: null as any,
    lastHeal: null as any,
    seed: undefined as any, // tests pin the engine seed
    fast: false, // tests: no message pacing
    debug: {} as any, // tests: failure injection
    perf: { engineLoadMs: null as any, battles: [] as any[], cur: null as any }, // measurement hooks (cheap; read by the test driver)
    /**
     * The Content the battle session uses. `sample` (default) is the content pipeline's compiled output assembled with
     * the pinned Showdown data; `fixture` is the synthetic step 2 test content. A missing or unusable compiled file is
     * an error, never a silent fallback to the fixture.
     */
    content(): any {
      if (!PSFlow._content) {
        const params = G.PluginManager.parameters(NAME) as Record<string, string>;
        const E = engine();
        if ((params.contentSource || "sample") === "fixture") PSFlow._content = testing().content;
        else {
          const file = nodeRequire("path").join(E.root, "data", "framework", "content.json");
          let json: unknown;
          try { json = JSON.parse(nodeRequire("fs").readFileSync(file, "utf8")); }
          catch (e) { throw new Error(`content: cannot read ${file} (run: pnpm --dir src build): ${String(e instanceof Error ? e.message : e)}`); }
          const { content, errors } = E.B.contentRuntime.assembleContent(E.B.contentRuntime.loadCompiled(json), E.B.dex.createDexLookup(), PSFlow.developerCapabilities);
          if (errors.length) throw new Error("content: " + errors.map((x: any) => `${x.path}: ${x.message}`).join("; "));
          PSFlow._content = content;
        }
      }
      return PSFlow._content;
    },
    _content: null as any,
    _dex: null as any,
    /** Language of the battle screen: set by tests (setLanguage) or by the plugin parameter; unknown languages use English. */
    lang: null as string | null,
    _tr: null as any,
    translator(): any {
      const params = G.PluginManager.parameters(NAME) as Record<string, string>;
      const lang = PSFlow.lang || params.language || "en";
      if (!PSFlow._tr || PSFlow._tr.lang !== lang) PSFlow._tr = engine().B.i18n.translatorFor(lang);
      return PSFlow._tr;
    },
    setLanguage(lang: string | null): void { PSFlow.lang = lang; PSFlow._tr = null; },
    /**
     * Display name of a species through its content text key. Takes a battle name (Showdown, what sessions use) or a
     * persistent key (content id + form, what the save and grants use); falls back to the name it was given.
     */
    speciesName(species: string, form = 0): string {
      const content = PSFlow.content();
      const own = (o: any, k: string) => (o && Object.hasOwn(o, k) ? o[k] : undefined); // "constructor" is a legal content id
      const name = own(content.species, species) ? species : engine().B.speciesKey.battleNameOf(content, { species, form });
      const sp = name ? own(content.species, name) : undefined;
      return sp && sp.nameKey ? PSFlow.translator().tOr(sp.nameKey, name) : (name || species);
    },
    /**
     * Battle name -> persistent key resolver of the current content, for the save migration (PS_SaveState). Throws when
     * the content cannot be loaded; the caller then refuses the migration and keeps the save as it was.
     */
    speciesKeyResolver(): (name: string) => unknown {
      return engine().B.speciesKey.speciesKeyResolver(PSFlow.content());
    },
    /**
     * The host installed another state (a save was loaded, a new game was set up): whatever battle operation the old
     * state had is over (P4-2). The application releases its lock and ignores that battle's session from now on; the
     * host side ends the operation too (not running, saving no longer masked, the waiting interpreter released) and
     * forgets it, so a late finish/abort/close of the old scene can neither close nor project into a later battle.
     */
    stateReplaced(): void {
      PSFlow._app?.assertHostStateReplacementAllowed?.();
      openingBattle = null;
      if (PSFlow._app) PSFlow._app.stateReplacedByHost();
      PSFlow._receiveNoticeHistory.clear();PSFlow.lastReceivingNotice=null;
      const old = PSFlow._op;
      PSFlow._op = null;
      // An ended battle can still have a failed trip home. A new timeline must never retry that old host effect.
      // lastReturn remains a diagnostic; pendingReturn and request are the executable work.
      PSFlow.pendingReturn = null;
      PSFlow.request = null;
      if (old && PSFlow.running) {
        PSFlow.running = false;
        PSFlow.lastOutcome = { code: 0, battleId: old.request.battleId, commit: "none", aborted: true, replaced: true, error: "the game state was replaced while this battle was open (a save was loaded or a new game started); nothing was committed" };
      }
    },
    /** The host battle operation in progress or last ended (openBattle creates it; a state replacement forgets it). */
    _op: null as any,
    /** A call from an operation that is no longer the current one: recorded, nothing else happens. */
    lastStale: null as any,
    stale(what: string, op: any, error?: unknown): BattleOutcomeView {
      const battleId = op && op.request ? op.request.battleId : null;
      PSFlow.lastStale = { what, battleId, error: error === undefined ? undefined : String(error instanceof Error ? error.message : error), at: Date.now() };
      return { code: 0, battleId, commit: "none", aborted: true, error: `${what} of a battle that is no longer current (the game state was replaced); ignored` };
    },
    /** Steps the player took (WP06 §4.1). Never throws; a refusal is logged once per reason. */
    steps(n: number): void {
      let o: { status: string; reason?: string; error?: string };
      try { o = PSFlow.app().recordSteps(n); } catch (e) { o = { status: "refused", reason: "unavailable", error: String(e instanceof Error ? e.message : e) }; }
      PSFlow.lastSteps = o;
      if (o.status === "refused" && o.reason !== "battle-active" && PSFlow._stepWarned !== o.reason) { PSFlow._stepWarned = o.reason; console.warn("PS_BattleFlow: steps not counted:", o.reason, o.error); }
    },
    lastSteps: null as any,
    _stepWarned: null as any,
    /** Redacted, bounded diagnostics of every session (flow/log.ts); the flow test attaches its tail to the report. */
    logger: null as any,
    game(): any {
      const err = G.$gameSystem._psSaveError;
      if (err) throw new Error(`the save state is not usable (${err.code}): ${err.message}`); // never battle on, or overwrite, a state we could not read
      // Never invent a party: a new game installs the formal empty state (setupNewGame below) and a save without one gets
      // an empty state on load (PS_SaveState). Reaching this without a state is a host wiring error, not a reason to fake one.
      if (!G.$gameSystem._psGame) throw new Error(`there is no framework game state${G.$gameSystem._psInitError ? ` (${G.$gameSystem._psInitError})` : ""}: start a new game or load a save`);
      return G.$gameSystem._psGame;
    },
    /** New game: the application installs the formal empty state (no members; grants give them). */
    startNewGame(): void {
      PSFlow.stateReplaced();
      delete G.$gameSystem._psInitError;
      try { PSFlow.app().startNewGame(); }
      catch (e) { G.$gameSystem._psInitError = String(e instanceof Error ? e.message : e); console.error("PS_BattleFlow: the new game state could not be created:", e); }
    },
    /** Randomness for members created outside a battle (grants, encounters); tests may pin it with `rng`. */
    rng: null as ((n: number) => number) | null,
    random(n: number): number { return PSFlow.rng ? PSFlow.rng(n) : Math.floor(Math.random() * n); },
    /** The wall clock the application reads (milliseconds since the epoch); tests may pin it with `clock`. */
    clock: null as (() => number) | null,
    now(): number { return PSFlow.clock ? PSFlow.clock() : Date.now(); },
    /**
     * TEST AID ONLY (plugin command ResetGame, the flow test driver): installs the synthetic step 2 fixture party
     * explicitly, stored the way a save stores it (content id + form of the current content, decision D5-3).
     */
    resetGame(): void {
      delete G.$gameSystem._psSaveError; delete G.$gameSystem._psSaveInfo; delete G.$gameSystem._psSaveWarning; // an explicit reset is a deliberate act
      PSFlow.stateReplaced();
      const content = PSFlow.content();
      const game = testing().savedFor(testing().makeGame(), content);
      G.$gameSystem._psGame = game;
      G.$gameSystem._psBattleSeq = 0;
    },
    /**
     * The game application (framework/app) over the MZ ports: the persistent state lives in `$gameSystem._psGame`, the outcome
     * is projected into the result variable, battles are Showdown-backed sessions. All commit/abort/duplicate logic is the
     * application's; this plugin only supplies the host side.
     */
    app(): GameAppView {
      if (!PSFlow._app) {
        const { B } = engine();
        if (!PSFlow.logger) PSFlow.logger = B.log.createRingLogger(500);
        if (!PSFlow._dex) PSFlow._dex = B.dex.createDexLookup();
        PSFlow._app = new B.app.GameApplication({
          state: { read: () => PSFlow.game(), replace: (next: unknown) => { G.$gameSystem._psGame = next; } },
          content: () => ({ content: PSFlow.content(), dex: PSFlow._dex }),
          sessions: ((G.PluginManager.parameters(NAME).contentSource || "sample") === "fixture"
            ? B.composition.createLegacyNoHeldBattleSessionFactory : B.composition.createBattleSessionFactory)({ content: () => PSFlow.content(), seed: () => PSFlow.seed, logger: () => PSFlow.logger.sink }),
          projection: { project: (outcome: { code: number }) => PSFlow.projectOutcome(outcome) },
          random: (n: number) => PSFlow.random(n),
          clock: () => PSFlow.now(),
          itemWorld:()=>({mapId:G.$gameMap?.mapId?.()}),
          evolutionWorld: (member: any) => ({
            hour: () => ({ status: "value", value: new Date(PSFlow.now()).getHours() }),
            mapId: () => G.$dataMap && Number.isSafeInteger(G.$gameMap?.mapId?.()) && G.$gameMap.mapId() > 0
              ? { status: "value", value: G.$gameMap.mapId() } : { status: "invalid", reason: "current-map-unavailable" },
            mapMetadata: () => {
              const mapId = G.$gameMap?.mapId?.();
              if (!G.$dataMap || !Number.isSafeInteger(mapId) || mapId <= 0) return { status: "invalid", reason: "current-map-unavailable" };
              const maps = PSFlow.content().mapMetadata?.maps;
              return maps && Object.hasOwn(maps, String(mapId)) ? { status: "value", value: maps[String(mapId)] } : { status: "absent" };
            },
            moveTypes: () => {
              if (!PSFlow.content().meta?.showdownSourceChecked || !PSFlow._dex?.moveDetails) return { status: "unavailable", reason: "checked-move-types-unavailable" };
              const types: Record<string, string> = {};
              for (const move of member.moves) { const data = PSFlow._dex.moveDetails(move.id); if (!data?.type) return { status: "invalid", reason: "missing-current-move-type" }; types[move.id] = data.type; }
              return { status: "value", value: types };
            },
            // World weather, mounts and contest beauty remain explicit unavailable facts until their real providers.
          }),
          variables:{count:()=>Math.max(0,(G.$dataSystem?.variables?.length??1)-1),write:(id:number,value:string)=>G.$gameVariables.setValue(id,value)},
          creationContext: () => ({ map: G.$gameMap?.mapId?.() ?? 0, ...(PSFlow.creationEnvironment?.() ?? {}) }),
        }, { startMoney: PSFlow.param("startMoney", 3000), noMoneyLoss: PSFlow.flagParam("noMoneyLoss", false), limits: PSFlow.limits(), capabilities: PSFlow.developerCapabilities, receivingProfile: PSFlow.receiveOptions ?? { mode: 0, naming: 0 }, playerLocale: G.navigator?.language ?? "en", playerName: G.$gameParty?.leader?.()?.name?.() || "player" });
      }
      return PSFlow._app as GameAppView;
    },
    _app: null as GameAppView | null,
    /**
     * Stage capacities (rules/limits.ts) from the content's rule configuration (rules/config.ts, WP02; Gen 8 defaults
     * when it has none); tests may replace them with `testLimits` (then reset `_app`).
     */
    testLimits: null as any,
    limits(): any {
      if (PSFlow.testLimits) return PSFlow.testLimits;
      const { config } = engine().B;
      let settings: unknown = {};
      // content that cannot be loaded stops battles and grants on its own (with its error); a new game still gets a state
      try { settings = PSFlow.content().settings || {}; } catch (e) { console.error("PS_BattleFlow: content not loaded, the Gen 8 default capacities apply:", e); }
      return config.limitsOf(config.resolveConfig(settings));
    },
    flagParam(name: string, dflt: boolean): boolean {
      const raw = (G.PluginManager.parameters(NAME) as Record<string, string>)[name];
      return raw === undefined || raw === "" ? dflt : raw === "true";
    },
    /** The configured home (plugin parameters): where a defeat sends the player back to. Null when not set or not a map. */
    home(): { mapId: number; x: number; y: number; d: number } | null {
      const mapId = PSFlow.param("homeMapId", 0);
      if (!mapId || !G.$dataMapInfos || !G.$dataMapInfos[mapId]) return null;
      return { mapId, x: PSFlow.param("homeX", 0), y: PSFlow.param("homeY", 0), d: PSFlow.param("homeDirection", 2) };
    },
    /** A numeric plugin parameter (empty or invalid -> the default). */
    param(name: string, dflt: number): number {
      const raw = (G.PluginManager.parameters(NAME) as Record<string, string>)[name];
      const n = Number(raw);
      return raw === undefined || raw === "" || !Number.isFinite(n) ? dflt : n;
    },
    /** One-time grant (plugin command ClaimGrant). Never throws; the outcome says what happened. */
    claim(grantId: string): any {
      try { return PSFlow.app().claimGrant(grantId); }
      catch (e) { return { status: "refused", grantId, reason: "unavailable", error: String(e instanceof Error ? e.message : e) }; }
    },
    heal(): any {
      try { return PSFlow.app().healParty(); }
      catch (e) { return { status: "refused", reason: "unavailable", error: String(e instanceof Error ? e.message : e) }; }
    },
    /** Player-facing lines for a grant outcome (the event shows them as a message). */
    claimLines(o: any): string[] {
      const tr = PSFlow.translator();
      if (o.status === "already-claimed") return [tr.t("grant.already")];
      if (o.status !== "applied") return [tr.has(`grant.refused.${o.reason}`) ? tr.t(`grant.refused.${o.reason}`) : tr.t("grant.refused.default", { reason: o.reason || "?" })];
      const lines: string[] = [];
      for (const m of o.placed || []) lines.push(tr.t(m.to === "party" ? "grant.member.party" : "grant.member.boxes", { name: PSFlow.speciesName(m.species, m.form), level: m.level }));
      for (const [k, n] of Object.entries(o.items || {})) lines.push(tr.t("grant.item", { item: tr.tOr(`item.name.${k}`, k), count: n as number }));
      if (o.money) lines.push(tr.t("grant.money", { money: o.money }));
      return lines;
    },
    /** Host notification also works when the engine/application could not be constructed. */
    projectOutcome(outcome: { code: number }): void {
      if (PSFlow.debug.failProjection) { PSFlow.debug.failProjection = false; throw new Error("injected projection failure"); } // tests
      const v = PSFlow.request && PSFlow.request.resultVariable;
      if (v) G.$gameVariables.setValue(v, outcome.code);
    },
    /** Apply a BattleResult to the persistent state. Safe to call twice. */
    commit(result: any, options: unknown = {}): string { return PSFlow.app().commitResult(result, options); },
    async begin(): Promise<any> {
      const op = PSFlow._op;
      if (!op) throw new Error("no battle was opened (openBattle)");
      const initialApp = PSFlow._app, initialGeneration = initialApp?.stateGeneration;
      const assertHost = () => {
        if (op !== PSFlow._op || !PSFlow.running || initialApp && (PSFlow._app !== initialApp || initialApp.stateGeneration !== initialGeneration)) throw new Error("stale-battle-opening");
      };
      assertHost(); PSFlow.assertBattleAllowed(); assertHost();
      const app = PSFlow.app(); assertHost();
      const generation = app.stateGeneration;
      const assertCurrent = () => { assertHost(); if (PSFlow._app !== app || app.stateGeneration !== generation) throw new Error("stale-battle-opening"); };
      PSFlow.content(); assertCurrent();
      const tCreate = performance.now(); assertCurrent();
      const current = PSFlow.game(); assertCurrent();
      const limits = PSFlow.limits(); assertCurrent();
      op.request.storageFull = engine().B.limits.storageFull(current, limits); // only refusal text; application decides noBall
      const session = await (op.request.trainer ? app.startTrainerBattle(op.request) : app.startBattle(op.request)); assertCurrent();
      const elapsed = performance.now() - tCreate; assertCurrent();
      op.session = session;
      if (PSFlow.perf.cur) PSFlow.perf.cur.sessionMs = Math.round(elapsed * 10) / 10;
      return session;
    },
    /** End the battle of `op` (default: the current operation), only with the session begin() assigned to it. */
    finish(session: any, op: any = PSFlow._op): any {
      if (!op || op !== PSFlow._op) return PSFlow.stale("finish", op);
      // The default token is not proof of ownership: a late caller can hold a session from before a load/new game.
      if (!session || op.session !== session) return PSFlow.stale("finish", op);
      const { result, ...outcome } = PSFlow.app().finishBattle(session, op.request); // commits at most once; never throws
      return PSFlow.completeBattleOutcome(outcome, result, op);
    },
    completeBattleOutcome(outcome: any, result: any, op: any): any {
      if (op !== PSFlow._op) return PSFlow.stale("receive", op);
      if (result) PSFlow.lastResult = result;
      PSFlow.lastOutcome = outcome; // the business outcome is recorded before anything the host shows
      if (outcome.pending) return outcome; // root operation/save lock stays held until decisions commit
      if (op.hostCompleted) return outcome;
      op.hostCompleted = true; // duplicate receive callbacks never repeat transfer/message side effects
      PSFlow.close(outcome.code, op);
      if (outcome.trainerReward && outcome.commit !== "none") PSFlow.afterCommit(outcome, "trainer-reward-message", () => {
        const tr = PSFlow.translator(), reward = outcome.trainerReward;
        if (reward.actual > 0) G.$gameMessage.add(tr.t("trainer.reward", { money: reward.actual }));
        if (reward.normalizationLoss > 0) G.$gameMessage.add(tr.t("trainer.rewardNormalized", { money: reward.normalizationLoss }));
      });
      if(outcome.code===2&&outcome.commit!=='none'&&result?.captured?.length)PSFlow.afterCommit(outcome,'receiving-message',()=>PSFlow.notifyReceived(result.captured.map((m:any)=>m.id),outcome.battleId));
      // D3: after a committed defeat the host takes the player home (unless the author allowed losing). The money and the
      // heal were settled in the commit; this is only the trip, it can fail and be retried without settling again. The
      // trip is requested before the messages, and a failing message is recorded on the outcome without changing it.
      if (outcome.code === 4 && outcome.commit !== "none" && !op.request.canLose) {
        outcome.blackout = true;
        const ret = PSFlow.returnHome();
        PSFlow.afterCommit(outcome, "message", () => {
          const tr = PSFlow.translator();
          if (outcome.defeat && outcome.defeat.moneyLost) G.$gameMessage.add(tr.t("blackout.money_lost", { money: outcome.defeat.moneyLost }));
          G.$gameMessage.add(tr.t(ret.status === "requested" ? "blackout.home" : ret.status === "no-home" ? "blackout.no_home" : "blackout.failed"));
        });
      }
      return outcome;
    },
    _receiveNoticeHistory: new Map<string,Set<string>>(),
    lastReceivingNotice: null as any,
    /** Actual destinations after commit, never a prediction. History is bounded and reset on load/new game. */
    notifyReceived(ids:string[],key:string):void {
      const a:any=PSFlow.app(),snapshot=a.managementSnapshot(),recovered=new Set(a.receivingNotifications.flatMap((n:any)=>n.placements.map((p:any)=>p.id)));
      let seen=PSFlow._receiveNoticeHistory.get(key);if(!seen){seen=new Set<string>();PSFlow._receiveNoticeHistory.set(key,seen);if(PSFlow._receiveNoticeHistory.size>32)PSFlow._receiveNoticeHistory.delete(PSFlow._receiveNoticeHistory.keys().next().value);}
      const placements:any[]=[],messages:string[]=[];
      for(const id of ids){if(seen.has(id)||recovered.has(id)||!Object.hasOwn(snapshot.references,id))continue;const position=snapshot.references[id].position,member=position.kind==='party'?snapshot.party[position.index]:snapshot.storage.boxes[position.box].slots[position.slot];if(!member)continue;
        const dest=position.kind==='party'?PSFlow.translator().t('management.party'):snapshot.storage.boxes[position.box].name||PSFlow.translator().t('management.box',{n:position.box+1});
        const text=PSFlow.translator().t('management.received',{dest:(member.nickname||PSFlow.speciesName(member.species,member.form))+' → '+dest});G.$gameMessage.add(text);seen.add(id);placements.push({id,position,to:position.kind==='party'?'party':'boxes',destination:dest});messages.push(text);
      }
      if(placements.length)PSFlow.lastReceivingNotice={key,placements,messages};
    },
    resolveReceiving(token: string, decisions: unknown = {}, signal?: string): any {
      const op = PSFlow._op;
      const returned = PSFlow.app().resolveReceiving(token, decisions, signal);
      if (returned && "code" in returned && op === PSFlow._op) {
        const { result, ...outcome } = returned; return PSFlow.completeBattleOutcome(outcome, result, op);
      }
      return returned;
    },
    /** Core continuation bridge. Formal evolution/learning scenes are the later G package. */
    resolveEvolution(token: string, revision: number, decision: any): any {
      const op = PSFlow._op, previous = PSFlow.lastOutcome, returned = PSFlow.app().resolveEvolution(token, revision, decision);
      if (returned && "code" in returned && op === PSFlow._op) {
        const { result, ...outcome } = returned;
        if (previous?.battleId === outcome.battleId && previous.hostErrors?.length) outcome.hostErrors = [...previous.hostErrors, ...(outcome.hostErrors ?? [])];
        return PSFlow.completeBattleOutcome(outcome, result, op);
      }
      return returned;
    },
    /** Host work after a commit (messages): a failure is kept in `outcome.hostErrors` and logged; the outcome itself stands. */
    afterCommit(outcome: any, step: string, fn: () => void): void {
      try { fn(); }
      catch (e) {
        (outcome.hostErrors ||= []).push({ step, error: String(e instanceof Error ? e.message : e) });
        console.error(`PS_BattleFlow: ${step} failed after the result was committed:`, e);
      }
    },
    /** End the battle of `op` (default: the current operation) without a result. Never throws. */
    abort(error: unknown, op: any = PSFlow._op): void {
      if (!op || op !== PSFlow._op) { PSFlow.stale("abort", op, error); return; }
      // A result committed for this battle stays the outcome: a later failure (e.g. in the scene's own wiring) is a host
      // error after the commit, never an abort that would report the committed battle as not committed.
      const done = PSFlow.lastOutcome;
      if (done && done.commit && done.commit !== "none" && done.battleId === op.request.battleId) {
        PSFlow.afterCommit(done, "after-commit", () => { throw error; });
        const dex = PSFlow._app?.pendingPokedex;
        if (dex) { PSFlow.resolvePokedex(dex.token, dex.revision, { kind: "technical-terminate" }); return; }
        const continuation = PSFlow._app?.pendingEvolution;
        if (continuation) {
          const ended = PSFlow.resolveEvolution(continuation.token, continuation.revision, { kind: "technical-terminate" });
          if (ended?.status === "refused") PSFlow.afterCommit(done, "continuation-termination", () => { throw new Error(ended.reason); });
          return; // Unsafe/indeterminate termination keeps the original running/wait owner for recovery.
        }
        PSFlow.close(done.code, op);
        return;
      }
      try { PSFlow.lastOutcome = PSFlow.app().abortBattle(op.request, error); }
      catch {
        const outcome: BattleOutcomeView = { code: 0, battleId: op.request.battleId, commit: "none", aborted: true, error: String(error instanceof Error ? error.message : error) };
        try { PSFlow.projectOutcome(outcome); outcome.projection = "ok"; }
        catch (e) { outcome.projection = "failed"; outcome.projectionError = String(e instanceof Error ? e.message : e); }
        PSFlow.lastOutcome = outcome;
      }
      PSFlow.close(0, op);
    },
    /**
     * Bookkeeping when a battle is over: the interpreter stops waiting, saving is no longer masked by the battle (see
     * Game_System.isSaveEnabled below), measurements. The result variable is the application's projection.
     */
    close(code: number, op: any = PSFlow._op): void {
      if (op !== PSFlow._op) { PSFlow.stale("close", op); return; }
      if (PSFlow._app?.pendingEvolution || PSFlow._app?.pendingReceiving || PSFlow._app?.pendingPokedex) return;
      PSFlow.running = false;
      const cur = PSFlow.perf.cur;
      if (cur && !cur.totalMs) { cur.totalMs = Math.round((performance.now() - cur.t0) * 10) / 10; cur.code = code; PSFlow.perf.battles.push(cur); }
    },
    /** The single way a battle opens (StartBattle command and map encounters): the same application path, the same guards. */
    openBattle(request: any): void {
      if (PSFlow.running) throw new Error("a battle is already running");
      if (openingBattle || PSFlow.operationPending() || PSFlow._app?.encounterBlocked) throw new Error("operation-active");
      const opening = {}, app = PSFlow._app, generation = app?.stateGeneration;
      openingBattle = opening;
      const assertCurrent = () => {
        if (openingBattle !== opening || PSFlow._app !== app || app?.stateGeneration !== generation) throw new Error("stale-battle-opening");
        if (PSFlow.operationPending() || PSFlow._app?.encounterBlocked) throw new Error("operation-active");
      };
      try {
        // Preserve contained scene initialization for an unusable/missing save. A usable save retains the held gate.
        if(!G.$gameSystem._psSaveError&&G.$gameSystem._psGame)PSFlow.assertBattleAllowed();
        assertCurrent();
        const started = performance.now(); assertCurrent();
        PSFlow._op = { request, session: null };
        PSFlow.request = request;
        PSFlow.running = true;
        PSFlow.lastOutcome = null;
        PSFlow.perf.cur = { battleId: request.battleId, t0: started, actions: [] as any[], encounter: !!request.encounter };
        if (PSFlow.perf.encounterT0 !== undefined && request.encounter) PSFlow.perf.cur.t0 = PSFlow.perf.encounterT0;
        openingBattle = null; // running now owns the host save/input barrier
        G.SceneManager.push(W.Scene_PSBattle);
      } finally { if (openingBattle === opening) openingBattle = null; }
    },
    /** Player-facing entries contain a closed held-item gate; direct developer openBattle keeps its throwing contract. */
    tryOpenBattle(request: any): boolean {
      const previous=PSFlow._op;
      try{PSFlow.openBattle(request);return true;}
      catch(error){
        if(PSFlow._op!==previous&&PSFlow._op?.request===request)PSFlow.abort(error,PSFlow._op);
        else if(!PSFlow.running){const outcome={code:0,battleId:request.battleId,commit:'none',aborted:true,error:String(error instanceof Error?error.message:error)};PSFlow.lastOutcome=outcome;if(request.resultVariable)G.$gameVariables.setValue(request.resultVariable,0);G.$gameMessage.add(PSFlow.translator().t('management.refused',{reason:outcome.error}));}
        return false;
      }
    },
    nextSeq(): number { G.$gameSystem._psBattleSeq = (G.$gameSystem._psBattleSeq || 0) + 1; return G.$gameSystem._psBattleSeq; },
    /** The return trip after a defeat. Never settles anything; a failure is kept so `retryReturnHome` can try again. */
    lastReturn: null as any,
    pendingReturn: null as any,
    returnHome(): any {
      const battleId = PSFlow.request ? PSFlow.request.battleId : null;
      const home = PSFlow.home();
      let r: any;
      if (!home) r = { battleId, status: "no-home" }; // WP61 7.2: no valid home -> the party is healed, no transfer
      else {
        try {
          if (PSFlow.debug.failReturn) { PSFlow.debug.failReturn = false; throw new Error("injected return failure"); } // tests
          G.$gamePlayer.reserveTransfer(home.mapId, home.x, home.y, home.d, 0);
          r = { battleId, status: "requested", home };
        } catch (e) { r = { battleId, status: "failed", home, error: String(e instanceof Error ? e.message : e) }; }
      }
      PSFlow.lastReturn = r;
      PSFlow.pendingReturn = r.status === "failed" ? r : null;
      return r;
    },
    retryReturnHome(): any { return PSFlow.pendingReturn ? PSFlow.returnHome() : { status: "none" }; },
    /** The encounter table of the current map (map note <PSEncounter:...>), parsed here and only here; null = none. */
    _encCache: null as any,
    mapEncounters(): any {
      const note = G.$dataMap && G.$dataMap.meta ? G.$dataMap.meta.PSEncounter : undefined;
      if (note === undefined) return null;
      const key = `${G.$gameMap.mapId()}|${note}`;
      if (!PSFlow._encCache || PSFlow._encCache.key !== key) PSFlow._encCache = { key, data: parseEncounterNote(String(note)) };
      return PSFlow._encCache;
    },
    lastEncounter: null as any,
    /** One encounter decision by the application; never throws. */
    encounter(table: unknown, region: number): any {
      try { return PSFlow.app().prepareEncounter(table, region); }
      catch (e) { return { ok: false, reason: "unavailable", error: String(e instanceof Error ? e.message : e) }; }
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
    const seq = PSFlow.nextSeq();
    const battleId = `${args.battleId || "battle"}#${seq}`;
    const opened=PSFlow.tryOpenBattle({
      kind: args.kind === "trainer" ? "trainer" : "wild",
      foes: parseFoes(args.foes || "Pidgey:5"),
      seq,
      battleId,
      resultVariable: Number(args.resultVariable) || 0,
      canLose: String(args.canLose) === "true",
      forceParty: String(args.forceParty) === "true",
    });
    if(!opened){if(G.$gameMessage.isBusy())this.setWaitMode('message');return;}
    this._psBattleId = battleId; // this interpreter waits for THIS battle (see updateWaitMode below)
    this.setWaitMode("psBattle");
  });

  G.PluginManager.registerCommand(NAME, "StartTrainerBattle", function (this: any, args: any) {
    if (PSFlow.running) throw new Error("a battle is already running");
    if (args.moneyGain !== undefined && ![true, false, "true", "false"].includes(args.moneyGain)) throw new Error("moneyGain must be true or false");
    const id = String(args.trainerId || args.id || ""), version = Number(args.version ?? 0), seq = PSFlow.nextSeq();
    const battleId = `${args.battleId || `trainer-${id}-v${version}`}#${seq}`;
    let known = true;
    try { known = !!PSFlow.app().trainerRecord(id, version); } catch { /* the normal start path reports the actual content/save failure */ }
    if (!known) {
      const resultVariable = Number(args.resultVariable) || 0;
      if (resultVariable) G.$gameVariables.setValue(resultVariable, 0);
      G.$gameMessage.add(PSFlow.translator().t("trainer.missing", { id, version }));
      if (G.$gameMessage.isBusy()) this.setWaitMode("message");
      return;
    }
    const opened = PSFlow.tryOpenBattle({
      kind: "trainer", trainer: { id, version }, foes: [], seq, battleId,
      moneyGain: args.moneyGain !== false && args.moneyGain !== "false",
      resultVariable: Number(args.resultVariable) || 0,
      canLose: String(args.canLose) === "true",
      forceParty: String(args.forceParty) === "true",
    });
    if (!opened) { if (G.$gameMessage.isBusy()) this.setWaitMode("message"); return; }
    this._psBattleId = battleId;
    this.setWaitMode("psBattle");
  });

  /**
   * Map note format (one tag): <PSEncounter:regions=1,2;pidgey,60,2-4;caterpie,40,2-4>
   * `regions=` (optional, empty = whole map) then one `species,weight,min-max` (or `species,weight,level`) per slot.
   * Only the syntax is checked here (every segment has exactly its fields); the application validates the values and
   * decides the encounter. A note with a syntax problem gives no table and the problems.
   */
  function parseEncounterNote(note: string): { table: { regions: number[]; slots: { species: string; weight: number; minLevel: number; maxLevel: number }[] } | null; problems: string[] } {
    const problems: string[] = [];
    const parts = note.split(";").map((x) => x.trim()).filter(Boolean);
    let regions: number[] = [];
    if (parts[0] && /^regions\s*=/.test(parts[0])) {
      const r = parts.shift()!.split("=");
      if (r.length !== 2) problems.push(`"${r.join("=")}": regions takes one "=" and a comma-separated list`);
      regions = String(r[1] ?? "").split(",").map((x) => x.trim()).filter(Boolean).map(Number);
    }
    const slots = parts.map((p) => {
      const fields = p.split(",").map((x) => x.trim());
      const range = String(fields[2] ?? "").split("-").map((x) => x.trim());
      if (fields.length !== 3 || range.length > 2) problems.push(`"${p}": a slot is species,weight,min-max`);
      const [lo, hi] = range.map(Number);
      return { species: fields[0] ?? "", weight: Number(fields[1]), minLevel: lo as number, maxLevel: (hi ?? lo) as number };
    });
    return { table: problems.length ? null : { regions, slots }, problems };
  }

  // Map encounters: MZ's own step counter decides WHEN (map "encounter steps"); a map with a PSEncounter note opens the
  // framework battle instead of an MZ troop battle. Busy (a battle already open) or an event running: nothing happens.
  let heldEncounterGate: {game:unknown; map:unknown; key:string; capability:unknown} | null = null;
  const baseExecuteEncounter = G.Game_Player && G.Game_Player.prototype.executeEncounter;
  if (G.Game_Player) G.Game_Player.prototype.executeEncounter = function (this: any) {
    const table = PSFlow.mapEncounters();
    if (!table) return baseExecuteEncounter.call(this);
    if (PSFlow.running || PSFlow._app?.encounterBlocked || G.$gameMap.isEventRunning() || this._encounterCount > 0) return false;
    // Cold host gate: app() loads content, so reject before constructing it or drawing any random value.
    const gateGame=G.$gameSystem?._psGame, gateMap=G.$gameMap, gateCapability=JSON.stringify(PSFlow.developerCapabilities??{});
    const heldKey=(gateGame?.party??[]).map((m:any)=>[m.id,m.item??'']);
    const gateKey=JSON.stringify([G.$gameMap?.mapId?.(),heldKey]);
    if(heldEncounterGate&&heldEncounterGate.game===gateGame&&heldEncounterGate.map===gateMap&&heldEncounterGate.key===gateKey&&heldEncounterGate.capability===gateCapability)return false;
    heldEncounterGate=null;
    try { if(!G.$gameSystem._psSaveError&&G.$gameSystem._psGame)PSFlow.assertBattleAllowed(); }
    catch(error){heldEncounterGate={game:gateGame,map:gateMap,key:gateKey,capability:gateCapability};PSFlow.lastEncounter={ok:false,reason:'held-item-battle-disabled',error:String(error)};return false;}
    this.makeEncounterCount();
    const t0 = performance.now();
    const plan = table.data.table ? PSFlow.encounter(table.data.table, this.regionId()) : { ok: false, reason: "invalid-note", error: table.data.problems.join("; ") };
    PSFlow.lastEncounter = { ...plan, region: this.regionId(), x: this.x, y: this.y, mapId: G.$gameMap.mapId() };
    if (!plan.ok) { if (plan.reason !== "not-here" && plan.reason !== "no-able-member") console.warn("PS_BattleFlow: encounter refused:", plan.reason, plan.error); return false; }
    const seq = PSFlow.nextSeq();
    PSFlow.perf.encounterT0 = t0;
    try { if(!PSFlow.tryOpenBattle({ kind: "wild", foes: [plan.foe], seq, battleId: `wild#${seq}`, resultVariable: 0, canLose: false, encounter: true }))PSFlow.lastEncounter={...PSFlow.lastEncounter,ok:false,reason:'battle-refused',error:PSFlow.lastOutcome?.error}; }
    finally { PSFlow.perf.encounterT0 = undefined; }
    return false; // the framework scene is already pushed; MZ must not open its own battle
  };
  G.PluginManager.registerCommand(NAME, "ResetGame", () => PSFlow.resetGame());

  // The global step counter (WP06 §4.1): a step taken on a forced move route or while an event runs is not counted.
  const baseIncreaseSteps = G.Game_Player && G.Game_Player.prototype.increaseSteps;
  if (G.Game_Player) G.Game_Player.prototype.increaseSteps = function (this: any) {
    baseIncreaseSteps.call(this);
    if (this.isMoveRouteForcing() || G.$gameMap.isEventRunning()) return;
    PSFlow.steps(1);
  };

  /** Show lines as one message window and make the event wait for it (only when the author asked for messages). */
  function say(interpreter: any, lines: string[]): void {
    if (!lines.length) return;
    for (const l of lines) G.$gameMessage.add(l);
    interpreter.setWaitMode("message");
  }
  const flag = (v: unknown, dflt: boolean): boolean => (v === undefined || v === "" ? dflt : String(v) === "true");

  G.PluginManager.registerCommand(NAME, "ClaimGrant", function (this: any, args: any) {
    const o = PSFlow.claim(String(args.grant || ""));
    PSFlow.lastClaim = o;
    const v = Number(args.resultVariable) || 0;
    if(o.status==='pending'&&W.PSManagement){
      this.setWaitMode('psReceiving');
      W.PSManagement.openReceiving((result:any)=>{PSFlow.lastClaim=result;if(v)G.$gameVariables.setValue(v,result?.status==='applied'?1:result?.status==='already-claimed'?2:0);if(flag(args.message,true))for(const line of PSFlow.claimLines(result))G.$gameMessage.add(line);});
      return;
    }
    if (v) G.$gameVariables.setValue(v, o.status === "applied" ? 1 : o.status === "already-claimed" ? 2 : 0);
    if (o.status === "refused") console.warn("PS_BattleFlow: grant refused:", o.grantId, o.reason, o.error);
    if (flag(args.message, true)) say(this, PSFlow.claimLines(o));
    PSFlow.waitForPokedex(this);
  });
  G.PluginManager.registerCommand(NAME, "HealParty", function (this: any, args: any) {
    const o = PSFlow.heal();
    PSFlow.lastHeal = o;
    const v = Number(args.resultVariable) || 0;
    if (v) G.$gameVariables.setValue(v, o.status === "refused" ? 0 : 1);
    if (o.status === "refused") console.warn("PS_BattleFlow: heal refused:", o.reason, o.error);
    const tr = PSFlow.translator();
    if (flag(args.message, true)) say(this, [o.status === "refused" ? tr.t("heal.refused") : tr.t("heal.done")]);
  });

  G.PluginManager.registerCommand(NAME, "ShowParty", () => { G.SceneManager.push(W.Scene_PSParty); });

  // A new game starts from the formal empty state (never the fixture party).
  if (G.DataManager) {
    const baseSetupNewGame = G.DataManager.setupNewGame;
    G.DataManager.setupNewGame = function (this: any, ...a: any[]) {
      const r = baseSetupNewGame.apply(this, a);
      PSFlow.startNewGame();
      return r;
    };
  }

  // A blackout ends the event that started the battle: the interpreter that waited for it, and every interpreter that
  // called it (common events run as child interpreters, and a parent carries on when its child ends). Each one stops as
  // MZ's "Exit Event Processing" does; interpreters outside that calling chain are not touched.
  const baseUpdateWaitMode = G.Game_Interpreter.prototype.updateWaitMode;
  G.Game_Interpreter.prototype.updateWaitMode = function (this: any) {
    if (this._waitMode === "psPokedex") {
      const pending = PSFlow._app?.pendingPokedex;
      if (pending && this._psPokedexToken === pending.token) return true;
      this._waitMode = ""; delete this._psPokedexToken; return false;
    }
    if (this._waitMode === "psTrade") {
      const pending = PSFlow._app?.pendingTrade;
      if (pending && this._psTradeToken === pending.token) return true;
      this._waitMode = ""; delete this._psTradeToken; return false;
    }
    if (this._waitMode === "psEvolutionAction") {
      const pending = PSFlow._app?.pendingTriggeredEvolution;
      if (pending && this._psEvolutionActionToken === pending.token) return true;
      this._waitMode = ""; delete this._psEvolutionActionToken; return false;
    }
    if (this._waitMode === "psLearning") {
      const pending = PSFlow._app?.pendingLearning;
      if (pending && (!this._psLearningToken || pending.token === this._psLearningToken)) return true;
      this._waitMode = ""; delete this._psLearningToken; return false;
    }
    if (this._waitMode === "psBattle") {
      if (PSFlow.running) return true;
      this._waitMode = "";
      const o = PSFlow.lastOutcome;
      if (o && o.blackout && o.battleId === this._psBattleId) { this._index = this._list.length; this._psEndChain = true; }
      delete this._psBattleId;
      return false;
    }
    return baseUpdateWaitMode.call(this);
  };
  const baseUpdateChild = G.Game_Interpreter.prototype.updateChild;
  G.Game_Interpreter.prototype.updateChild = function (this: any) {
    const child = this._childInterpreter;
    const busy = baseUpdateChild.call(this);
    if (!busy && child && child._psEndChain && this._list) { this._index = this._list.length; this._psEndChain = true; }
    return busy;
  };
  const baseClear = G.Game_Interpreter.prototype.clear;
  G.Game_Interpreter.prototype.clear = function (this: any) {
    baseClear.call(this);
    delete this._psEndChain; delete this._psBattleId;
  };

  // Saving is masked while a battle runs, on top of the game's own flag: the menu and autosave read isSaveEnabled, and the
  // flag itself (set by events or other systems, also during the battle) is never written by the battle. A direct
  // DataManager.saveGame is refused separately (PS_SaveState).
  if (G.Game_System) {
    const baseIsSaveEnabled = G.Game_System.prototype.isSaveEnabled;
    G.Game_System.prototype.isSaveEnabled = function (this: any) { return !PSFlow.operationPending() && baseIsSaveEnabled.call(this); };
  }

  // ---------------------------------------------------------------- windows (prototype style, like Reactor's own)
  function Window_PSText(this: any, rect: any) { this.initialize(rect); }
  Window_PSText.prototype = Object.create(G.Window_Base.prototype);
  Window_PSText.prototype.constructor = Window_PSText;
  Window_PSText.prototype.initialize = function (rect: any) {
    G.Window_Base.prototype.initialize.call(this, rect);
    this._lines = [];
    this._max = Math.max(1, Math.floor(this.innerHeight / this.lineHeight()));
  };
  Window_PSText.prototype.resetFontSettings = function () {
    G.Window_Base.prototype.resetFontSettings.call(this);
    const font = PSFlow.translator().font();
    if (font) this.contents.fontFace = font;
  };
  /** One line must fit the window: auxiliary lines (status, bag summary) are shortened with an ellipsis, never overflow. */
  Window_PSText.prototype.fitText = function (this: any, text: string, width = this.innerWidth) {
    if (this.textWidth(text) <= width) return text;
    const points = Array.from(text);
    while (points.length && this.textWidth(points.join('') + "…") > width) points.pop();
    return points.join('') + "…";
  };
  Window_PSText.prototype.setLines = function (lines: string[]) { this._lines = lines.slice(-this._max); this.refresh(); };
  Window_PSText.prototype.add = function (line: string) { this._lines.push(line); this._lines = this._lines.slice(-this._max); this.refresh(); };
  Window_PSText.prototype.refresh = function () {
    this.contents.clear();
    if (this._d2Cards) {
      const width = this.innerWidth / 2 - 12;
      for (const [index, side] of ['p1', 'p2'].entries()) {
        const card = this._d2Cards.find((member: BattleDisplayCard) => member.side === side && member.active);
        if (!card) continue;
        const x = index * (this.innerWidth / 2), colour = hpColour(card.hp, card.maxhp);
        this.drawText(this.fitText(`${card.name}  Lv.${card.level}`, width), x, 0, width);
        this.drawText(this.fitText(card.status || '', width / 2), x, 24, width / 2);
        if (side === 'p1') this.drawText(`${Math.ceil(card.hp)} / ${card.maxhp}`, x + width / 2, 24, width / 2, 'right');
        this.contents.fillRect?.(x, 52, width, 8, '#343b43');
        this.contents.fillRect?.(x, 52, width * card.hp / card.maxhp, 8, { red: '#d65353', yellow: '#dec253', green: '#55b77d' }[colour]);
        if (side === 'p1' && card.ratio !== null) {
          this.contents.fillRect?.(x, 72, width, 6, '#343b43');
          this.contents.fillRect?.(x, 72, width * card.ratio, 6, card.flash ? '#ffffff' : '#589eda');
        }
      }
      return;
    }
    this._lines.forEach((t: string, i: number) => this.drawText(t, 0, i * this.lineHeight(), this.innerWidth));
  };

  function Window_PSMenu(this: any, rect: any) { this.initialize(rect); }
  Window_PSMenu.prototype = Object.create(G.Window_Command.prototype);
  Window_PSMenu.prototype.constructor = Window_PSMenu;
  Window_PSMenu.prototype.initialize = function (rect: any) {
    this._items = [];
    G.Window_Command.prototype.initialize.call(this, rect);
  };
  Window_PSMenu.prototype.resetFontSettings = function () {
    G.Window_Command.prototype.resetFontSettings.call(this);
    const font = PSFlow.translator().font();
    if (font) this.contents.fontFace = font;
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
  Window_PSMenu.prototype.maxCols = function () { return this._phase === 'main' || this._phase === 'moves' ? 2 : 1; };
  for (const [method, direction] of Object.entries({ cursorUp: 'up', cursorDown: 'down', cursorLeft: 'left', cursorRight: 'right' } as const)) {
    Window_PSMenu.prototype[method] = function (wrap: boolean) {
      if (this.maxCols() === 2) this.select(gridCursor(this.index(), direction, this._items.length));
      else G.Window_Command.prototype[method].call(this, wrap);
    };
  }

  // ---------------------------------------------------------------- the scene
  /** Refusal text: per-action key first (a refused Ball is not a refused Run), then the generic key, then the default. */
  function refusalText(kind: string | undefined, reason: string): string {
    const tr = PSFlow.translator();
    if (kind === "ball" && reason === "ballsdisabled" && PSFlow.request && PSFlow.request.storageFull) return tr.t("refusal.ball.storage_full"); // D1
    return (kind && tr.has(`refusal.${kind}.${reason}`)) ? tr.t(`refusal.${kind}.${reason}`)
      : tr.has(`refusal.${reason}`) ? tr.t(`refusal.${reason}`) : tr.t("refusal.default", { reason });
  }

  function Scene_PSBattle(this: any) { this.initialize(...(arguments as any)); }
  W.Scene_PSBattle = Scene_PSBattle;
  Scene_PSBattle.prototype = Object.create(G.Scene_MenuBase.prototype);
  Scene_PSBattle.prototype.constructor = Scene_PSBattle;

  const P = Scene_PSBattle.prototype;
  function initialDisplay(session: any, names: Record<string, string>): BattleDisplayCard[] {
    return ['p1', 'p2'].flatMap(side => session.gw.readState(side).map((state: any) => {
      const member = (side === 'p1' ? session.party : session.foeTeam).find((item: any) => item.id === state.id);
      let ratio: number | null = null;
      let experienceUnavailable: 'outside-level-interval' | undefined;
      const curve = member && session.content?.species[member.species]?.growth;
      if (side === 'p1' && curve && Number.isFinite(member.exp)) {
        const growth = engine().B.growth, floor = growth.minExp(curve, state.level), ceiling = growth.minExp(curve, state.level + 1);
        const value = ceiling > floor ? (member.exp - floor) / (ceiling - floor) : 1;
        // Existing author states may carry EXP outside their held level. The view must not reject or normalize them.
        if (value >= 0 && value <= 1) ratio = value; else experienceUnavailable = 'outside-level-interval';
      }
      return { id: state.id, side: side as 'p1' | 'p2', name: member ? PSFlow.speciesName(member.species) : names[state.id] || state.id,
        level: state.level, hp: state.hp, maxhp: state.maxhp, status: state.status || '', active: state.active, ratio,
        ...(experienceUnavailable ? { experienceUnavailable } : {}) };
    }));
  }
  function battleCue(scene: any, kind: 'exp-gain' | 'exp-full'): (() => void) | undefined {
    const name = kind === 'exp-gain' ? 'Pkmn exp gain' : 'Pkmn exp full';
    const record: any = { kind, name, t: performance.now(), status: 'unavailable' };
    scene._displayAudio.push(record);
    const audio = G.AudioManager; let buffer: any = null;
    try {
      if (!audio?.createBuffer || !audio?.updateBufferParameters) return;
      const encrypted = typeof G.Utils.hasEncryptedAudio === 'function' ? G.Utils.hasEncryptedAudio() : G.Utils.hasEncryptedAudio;
      const extension = audio.audioFileExt(), file = nodeRequire('path').join(engine().root, 'audio', 'se', name + extension + (encrypted ? '_' : ''));
      if (!nodeRequire('fs').existsSync(file)) { record.status = 'missing'; return; }
      buffer = audio.createBuffer('se/', name);
      let released = false;
      const release = () => { if (!released) { released = true; buffer.stop(); buffer.destroy?.(); record.stoppedAt = performance.now(); } };
      buffer.addStopListener?.(release);
      audio.updateBufferParameters(buffer, audio.seVolume, { name, volume: 80, pitch: 100, pan: 0 }); buffer.play(false);
      record.status = 'requested';
      return release;
    } catch (error) {
      record.status = 'failed'; record.error = String(error);
      try { buffer?.stop(); buffer?.destroy?.(); } catch { /* only this optional media handle is owned here */ }
      return;
    }
  }
  function sceneController(scene: any, initialized = false): BattleSceneController<any> {
    if (!initialized && scene._controller) return scene._controller;
    const op = scene._psOp === undefined ? PSFlow._op : scene._psOp;
    const owner = { app: PSFlow._app, generation: PSFlow._app?.stateGeneration, bound: initialized && !!PSFlow._app };
    // Bare prototype callers retain their existing API defaults. Every real initialize constructs a strict owner.
    const current = () => initialized
      ? !!op && op === PSFlow._op && (!owner.bound || PSFlow._app === owner.app && owner.app?.stateGeneration === owner.generation)
      : scene._psOp === undefined || scene._psOp === PSFlow._op;
    const c = new BattleSceneController<any>({
      current, active: () => !initialized || PSFlow.running,
      closedFailure: () => scene._session?.finished && PSFlow.lastOutcome?.commit && PSFlow.lastOutcome.commit !== 'none'
        ? null : new Error(PSFlow.lastOutcome?.error || 'battle operation is no longer active'),
      hideInput: () => { const menu = scene._menu; if (menu) { menu.deactivate(); if (current()) menu.hide(); } },
      appendLine: line => scene._log.add(line),
      refreshStatus: () => scene.refreshStatus(), afterMessages: () => scene.afterMessages(),
      abort: error => PSFlow.abort(error, initialized ? op : scene._psOp === undefined ? PSFlow._op : scene._psOp),
      unusableView: () => { if (current() && G.SceneManager._scene === scene) scene.popScene(); },
      now: () => performance.now(),
      actionMeasured: (kind, milliseconds) => {
        const cur = PSFlow.perf.cur;
        if (current() && cur && (!initialized || cur.battleId === op.request.battleId)) cur.actions.push({ kind, ms: Math.round(milliseconds * 10) / 10 });
      },
    });
    scene._controller = c;
    scene._psBindHost = () => {
      const app = PSFlow.app();
      if (!current() || owner.bound && (app !== owner.app || app.stateGeneration !== owner.generation)) throw new Error('stale-battle-scene');
      owner.app = app; owner.generation = app.stateGeneration; owner.bound = true;
    };
    if (!initialized) c.ready = true;
    return c;
  }
  // Compatibility seams for existing test IDs. These names forward to one controller; no parallel scene state.
  for (const [name, field] of Object.entries({ _mode: 'phase', _ready: 'ready', _failure: 'failure', _queue: 'queue', _wait: 'wait', _busy: 'busy', _session: 'session' })) {
    Object.defineProperty(P, name, { configurable: true,
      get(this: any) { return (sceneController(this) as any)[field]; },
      set(this: any, value: any) { (sceneController(this) as any)[field] = value; },
    });
  }
  P.initialize = function () {
    G.Scene_MenuBase.prototype.initialize.call(this);
    this._psBattle = true; // marker for the test driver (constructor identity is wrapped by pixi_compat)
    this._psOp = PSFlow._op; // the operation this scene belongs to: its finish/abort never reach a later one
    sceneController(this, true);
    this._D = null; this._names = {}; this._display = null; this._displayAudio = []; this._menuCursor = new BattleMenuCursor();
  };
  P.create = function () {
    const c = sceneController(this);
    c.present(() => {
    G.Scene_MenuBase.prototype.create.call(this); if (!c.isCurrent()) return;
    const w = G.Graphics.boxWidth, h = G.Graphics.boxHeight;
    this._status = new (Window_PSText as any)(new G.Rectangle(0, 0, w, 120));
    this._log = new (Window_PSText as any)(new G.Rectangle(0, 120, w, 300));
    this._menu = new (Window_PSMenu as any)(new G.Rectangle(0, 420, w, h - 420));
    for (const win of [this._status, this._log, this._menu]) this.addWindow(win);
    this._menu.setHandler("ok", this.onMenuOk.bind(this));
    this._menu.setHandler("cancel", this.onMenuCancel.bind(this));
    this._menu.deactivate(); this._menu.hide();
    c.open(() => { this._psBindHost(); return PSFlow.begin(); });
    });
  };
  P.isReady = function () { const c = sceneController(this); return G.Scene_MenuBase.prototype.isReady.call(this) && (c.ready || !c.isCurrent() || !PSFlow.running); };
  P.start = function () {
    const c = sceneController(this);
    c.present(() => {
    G.Scene_MenuBase.prototype.start.call(this);
    if (!c.isCurrent()) return;
    if (!PSFlow.running) { c.tick(false, 0); return; }
    if (this._failure) { this.abort(this._failure); return; }
    const s = this._session;
    for (const m of [...s.party, ...s.foeTeam]) { if (!c.isCurrent()) return; this._names[m.id] = PSFlow.speciesName(m.species); }
    if (!c.isCurrent()) return;
    this._D = engine().D.make(this._names, PSFlow.translator());
    this._display = new BattleDisplayPlayback(initialDisplay(s, this._names), {
      current: () => c.isCurrent() && PSFlow.running,
      paint: cards => { if (c.isCurrent()) { this._status._d2Cards = cards.map(card => ({ ...card })); this._status.setLines([]); } },
      afterPaintNow: () => performance.now(),
      cue: kind => c.isCurrent() && PSFlow.running ? battleCue(this, kind) : undefined,
    });
    this._mode = "messages";
    c.enqueue([this._display.initial()]);
    this.pushMessages(s.take());
    if(developmentCapabilities(PSFlow.developerCapabilities).allowExperimentalHeldItemBattle&&s.party.some((m:any)=>!!m.item))this._log.add(PSFlow.translator().t("management.experimental"));
    this.refreshStatus();
    });
  };
  P.update = function () {
    G.Scene_MenuBase.prototype.update.call(this);
    // Host abort may close this owner from main/boot/pending action. tick observes closure before phase/busy gates.
    this.updateQueue();
  };

  // --- message pacing
  P.pushMessages = function (msgs: any[]) {
    const c = sceneController(this);
    c.present(() => {
      const steps: BattleScenePresentation[] = [];
      for (const message of msgs) {
        if (!c.isCurrent()) return;
        const growth = message.kind === 'growth' ? engine().B.battlePresentation.readGrowthDisplay(this._session, message) : null;
        if (this._display && message.kind === 'events') {
          for (const event of message.events) { steps.push(...this._display.event(event), ...this._D.event(event)); }
        } else if (this._display && growth?.version === 1) {
          steps.push(...this._D.message({ ...message, exp: growth.toExp - growth.fromExp, levelUps: [] }));
          for (const segment of growth.segments) {
            const animation = this._display.experience(message.member, segment); if (animation) steps.push(animation);
            if (segment.levelUp) {
              const level = this._display.growth(message.member, { toLevel: segment.levelUp.level, hp: segment.levelUp.hp, maxhp: segment.levelUp.maxhp, ratio: 0 }); if (level) steps.push(level);
              steps.push(...this._D.message({ ...message, exp: 0, levelUps: [segment.levelUp.level] }));
            }
          }
          const final = this._display.growth(message.member, growth); if (final) steps.push(final);
        } else steps.push(...this._D.message(message));
      }
      if (c.isCurrent()) c.enqueue(steps);
    });
  };
  P.updateQueue = function () {
    const c = sceneController(this);
    if (!c.isCurrent() || !PSFlow.running) this._display?.dispose();
    c.tick(G.Input.isTriggered('ok'), PSFlow.fast ? 0 : 24);
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
    const c = sceneController(this); if (!c.isCurrent()) return;
    const s = this._session; if (!s) return;
    if (this._display) { this._status._d2Cards = this._display.snapshot(); this._status.setLines([]); return; }
    const tr = PSFlow.translator();
    const line = (side: string, who: string) => s.gw.readState(side).filter((x: any) => x.active).map((x: any) =>
      tr.t("ui.status.line", { who, name: this._names[x.id] || x.id, level: x.level, hp: x.hp, maxhp: x.maxhp,
        status: x.status ? tr.t("ui.status.tag", { status: x.status }) : "", fainted: x.fainted ? tr.t("ui.status.fainted") : "" }));
    const bagText = Object.entries(s.bag).map(([k, v]) => `${k} x${v}`).join(", ") || tr.t("ui.status.bag_empty");
    const foe = line("p2", tr.t("ui.who.foe")); if (!c.isCurrent()) return;
    const player = line("p1", tr.t("ui.who.you")); if (!c.isCurrent()) return;
    const lines = [...foe, ...player, tr.t("ui.status.bag", { items: bagText })].map((l: string) => this._status.fitText(l));
    if (c.isCurrent()) this._status.setLines(lines);
  };

  // --- menus
  P.show = function (mode: string, items: any[]) {
    const c = sceneController(this); if (!c.show(mode)) return;
    const cur = PSFlow.perf.cur;
    if (cur && cur.firstMenuMs === undefined) { const ms = Math.round((performance.now() - cur.t0) * 10) / 10; if (c.isCurrent() && PSFlow.perf.cur === cur) cur.firstMenuMs = ms; }
    if (!c.isCurrent()) return;
    this._menu._phase = mode;
    this._menu.setItems(items);
    if (c.isCurrent() && this._menuCursor && (mode === 'main' || mode === 'moves')) {
      const active = this._display?.snapshot().find((member: BattleDisplayCard) => member.side === 'p1' && member.active);
      this._menuCursor.bindActive(active?.id ?? null);
      this._menu.select(this._menuCursor.index(mode, items.length));
    }
    if (!c.isCurrent()) return; this._menu.show();
    if (c.isCurrent()) this._menu.activate();
  };
  P.inputState = function () {
    const c = sceneController(this), menu = this._menu;
    const interactive = c.canChoose() && !!menu?.isOpenAndActive();
    const items = (menu?._items || []).map((item: any) => ({ key: item.ext === null || typeof item.ext === 'string' || typeof item.ext === 'number' ? item.ext : null, enabled: item.enabled !== false }));
    return { phase: c.phase, ready: !!interactive && c.canChoose(), items, columns: menu?.maxCols?.() ?? 1, implementation: 'd2-menu-grid-v1' };
  };
  P.presentationState = function () {
    const c = sceneController(this);
    return { version: 'd2-status-v1', current: c.isCurrent(), cards: this._display?.snapshot() || [],
      pending: c.queue.filter(step => typeof step !== 'string').length, audio: (this._displayAudio || []).map((row: any) => ({ ...row })) };
  };
  P.showMain = function () {
    const tr = PSFlow.translator();
    this.show("main", [
      { name: tr.t("ui.menu.fight"), ext: "fight" }, { name: tr.t("ui.menu.bag"), ext: "bag" }, { name: tr.t("ui.menu.party"), ext: "party" }, { name: tr.t("ui.menu.run"), ext: "run" },
    ]);
  };
  P.showMoves = function () {
    const req = this._session.currentRequest();
    const moves = req.active[0].moves;
    this.show("moves", moves.map((m: any, i: number) => ({
      name: m.pp === undefined ? m.move : PSFlow.translator().t("ui.moves.line", { move: m.move, pp: m.pp, maxpp: m.maxpp }),
      ext: i + 1, enabled: engine().B.moveRequests.isSelectableMove(m),
    })));
  };
  P.showBag = function () {
    const bag = this._session.bag;
    const tr = PSFlow.translator();
    const items = Object.keys(bag).filter((k) => bag[k] > 0).map((k) => ({ name: tr.t("ui.bag.entry", { name: tr.tOr(`item.name.${k}`, k), count: bag[k] }), ext: k }));
    this.show("bag", items.length ? items : [{ name: tr.t("ui.bag.nothing"), ext: null, enabled: false }]);
  };
  P.showParty = function (sub: string) {
    this._partySub = sub;
    const s = this._session;
    const live = Object.fromEntries(s.gw.readState("p1").map((x: any) => [x.id, x]));
    const items = s.party.map((m: any) => {
      const x = live[m.id];
      // an item that could not do anything is refused before it is registered (WP28 3.5): grey the target out
      const can = sub === "item" ? s.canUseItem(this._pendingItem, m.id).ok : !(x.active || x.fainted);
      const tr = PSFlow.translator();
      return { name: tr.t("ui.party.entry", { name: PSFlow.speciesName(m.species), level: x.level, hp: x.hp, maxhp: x.maxhp,
        fainted: x.fainted ? tr.t("ui.party.fainted") : "", active: x.active ? tr.t("ui.party.active") : "", noEffect: sub === "item" && !can ? tr.t("ui.party.no_effect") : "" }), ext: m.id, enabled: can };
    });
    this.show(sub === "forced" ? "party-forced" : "party", items);
  };
  P.showLearn = function () {
    const p = this._session.pendingLearn;
    const m = this._session.party.find((x: any) => x.id === p.memberId);
    this.show("learn", [...m.moves.map((mv: any, i: number) => ({ name: PSFlow.translator().t("ui.learn.forget", { move: mv.id }), ext: i })), { name: PSFlow.translator().t("ui.learn.skip", { move: p.move.name }), ext: null }]);
  };
  P.showEnd = function (aborted: boolean) {
    if (aborted) this._log.add(PSFlow.translator().t("ui.end.aborted"));
    // Full-party reception still has a destination choice. Do not announce a box before that choice commits.
    const s = this._session;
    if (!aborted && s && s.ended && s.ended.reason === "caught") {
      try {
        if (PSFlow.game().party.length >= PSFlow.limits().party) {
          const target = s.foeTeam.find((m: any) => m.id === (s.ended.outcome && s.ended.outcome.target));
          this._log.add(this._log.fitText(PSFlow.translator().t("management.receiving", { name: target ? PSFlow.speciesName(target.species) : "?" })));
        }
      } catch { /* the commit below reports any state problem */ }
    }
    this._aborted = aborted;
    this.show("end", [{ name: PSFlow.translator().t(aborted ? "ui.end.back" : "ui.end.continue"), ext: "end" }]);
  };

  P.onMenuCancel = function () {
    sceneController(this).input(() => {
    if (this._mode === 'moves') this._menuCursor?.remember('moves', this._menu.index(), this._menu._items.length);
    switch (this._mode) {
      case "moves": case "bag": this.showMain(); return;
      case "party": if (this._pendingItem) { this._pendingItem = null; this.showBag(); } else this.showMain(); return;
      default: G.SoundManager.playBuzzer(); this._menu.activate();
    }
    });
  };
  P.onMenuOk = function () {
    sceneController(this).input(() => {
    if (this._mode === 'main' || this._mode === 'moves') this._menuCursor?.remember(this._mode, this._menu.index(), this._menu._items.length);
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
    });
  };

  /** Run one session action; refusals show a reason and return to the main menu (nothing consumed). */
  P.act = function (fn: () => Promise<any> | any, kind?: string) {
    const c = sceneController(this);
    c.run(fn, (r: any) => {
      if (r && r.ok === false) {
        c.enqueue([refusalText(kind, r.reason)]);
        return;
      }
      this.pushMessages(r.messages || []);
    }, kind);
  };
  P.abort = function (e: unknown) {
    const op = this._psOp === undefined ? PSFlow._op : this._psOp;
    const c = sceneController(this);
    if (op !== PSFlow._op || !c.isCurrent()) { PSFlow.stale('abort', op, e); return; }
    c.fail(e);
    if (c.isCurrent() && this._session) c.present(() => this.refreshStatus());
  };
  P.onEnd = function () {
    // A delayed callback from an old scene must not pop the current scene's global SceneManager stack.
    const op = this._psOp === undefined ? PSFlow._op : this._psOp; // bare API callers refer to the current operation
    if (op !== PSFlow._op) { this._display?.dispose(); PSFlow.stale("finish", op); return; }
    const c = this._controller as BattleSceneController<any> | undefined;
    if (c && !c.isCurrent()) return;
    this._display?.dispose(); c?.dispose();
    if (!this._aborted && !this._failure) {
      try { const outcome=PSFlow.finish(this._session, this._psOp);if(c&&!c.ownsHost())return;if(outcome?.continuationToken){this._evolutionTransferred=true;this.popScene();return;}if(outcome?.pending&&W.PSManagement){this._menu.deactivate();if(c&&!c.ownsHost())return;this._receivingTransferred=W.PSManagement.replaceBattleWithReceiving();if(this._receivingTransferred)return;} } catch (e) { PSFlow.abort(e, this._psOp); } // finishBattle does not throw; this guards only the plugin's own wiring
    }
    if (c && !c.ownsHost()) return;
    this.popScene();
  };
  P.terminate = function () {
    const c = this._controller as BattleSceneController<any> | undefined;
    this._menuCursor?.clear();
    this._display?.dispose();
    c?.dispose(); // retire callbacks before host teardown can reenter application code
    try { G.Scene_MenuBase.prototype.terminate.call(this); }
    finally {
    const op = this._psOp === undefined ? PSFlow._op : this._psOp; // (a scene always has one; a bare caller means the current one)
    if (PSFlow.running && op === PSFlow._op && (!c || c.ownsHost()) && !(this._receivingTransferred&&PSFlow.app().pendingReceiving) && !(this._evolutionTransferred&&PSFlow.app().pendingEvolution) && (!c || c.ownsHost())) PSFlow.abort(new Error("the battle scene closed without an outcome"), op); // transferred operations keep the same event and save lock
    }
  };

  // ---------------------------------------------------------------- read-only party / bag screen (no management in this version)
  function Scene_PSParty(this: any) { this.initialize(...(arguments as any)); }
  W.Scene_PSParty = Scene_PSParty;
  Scene_PSParty.prototype = Object.create(G.Scene_MenuBase.prototype);
  Scene_PSParty.prototype.constructor = Scene_PSParty;
  Scene_PSParty.prototype.initialize = function () { G.Scene_MenuBase.prototype.initialize.call(this); this._psParty = true; };
  Scene_PSParty.prototype.create = function () {
    G.Scene_MenuBase.prototype.create.call(this);
    this._text = new (Window_PSText as any)(new G.Rectangle(0, 0, G.Graphics.boxWidth, G.Graphics.boxHeight));
    this.addWindow(this._text);
    this._text.setLines(PSFlow.partyLines().map((l: string) => this._text.fitText(l)));
  };
  Scene_PSParty.prototype.update = function () {
    G.Scene_MenuBase.prototype.update.call(this);
    if (G.Input.isTriggered("cancel") || G.Input.isTriggered("ok") || G.TouchInput.isCancelled()) { G.SoundManager.playCancel(); this.popScene(); }
  };
  PSFlow.partyLines = function (): string[] {
    const tr = PSFlow.translator();
    let v: any;
    try { v = PSFlow.app().describeParty(); } catch (e) { return [tr.t("ui.partyview.title"), tr.t("ui.partyview.unusable", { error: String(e instanceof Error ? e.message : e) })]; }
    const lines = [tr.t("ui.partyview.title")];
    if (!v.members.length) lines.push(tr.t("ui.partyview.empty"));
    for (const m of v.members) {
      lines.push(tr.t("ui.partyview.member", { name: m.nameKey ? tr.tOr(m.nameKey, m.species) : m.species, level: m.level, hp: m.hp, maxhp: m.maxhp, status: m.status ? tr.t("ui.status.tag", { status: m.status }) : "" }));
      lines.push("   " + m.moves.map((x: any) => tr.t("ui.moves.line", { move: x.id, pp: x.pp, maxpp: x.maxpp })).join(" / "));
    }
    lines.push(tr.t("ui.partyview.boxes", { count: v.boxes }));
    const bag = Object.entries(v.bag).map(([k, n]) => `${tr.tOr(`item.name.${k}`, k)} x${n}`).join(", ");
    lines.push(tr.t("ui.status.bag", { items: bag || tr.t("ui.status.bag_empty") }));
    lines.push(tr.t("ui.partyview.money", { money: v.money }));
    return lines;
  };
  // the main menu gets one entry for it
  if (G.Window_MenuCommand && G.Scene_Menu) {
    const baseOriginal = G.Window_MenuCommand.prototype.addOriginalCommands;
    G.Window_MenuCommand.prototype.addOriginalCommands = function (this: any) {
      baseOriginal.call(this);
      let enabled=false;try{enabled=PSFlow.app().describeParty().members.length>0;}catch{}
      this.addCommand(PSFlow.translator().t("ui.menu.party_view"), "psParty", enabled);
    };
    const baseCreateCommand = G.Scene_Menu.prototype.createCommandWindow;
    G.Scene_Menu.prototype.createCommandWindow = function (this: any) {
      baseCreateCommand.call(this);
      this._commandWindow.setHandler("psParty", () => G.SceneManager.push(W.Scene_PSParty));
    };
  }
})();
