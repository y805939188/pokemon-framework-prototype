import type { BattleSessionView, BattleActionResult } from "../framework/flow/session-view";
import type { SessionMessage, BattleEvent } from "../framework/battle/protocol";
import type { ApplicationCompositionHost, HostApplication, ProductionRuntime } from './application-host';
import type { BattleOutcome, GameApplicationPorts, GameApplicationOptions } from '../framework/app';
import type { BattleResult, GameState } from '../framework/rules/state';
import type { Content, DexLookup } from '../framework/rules/types';
import type { Limits } from '../framework/rules/limits';
import { messageLiteral } from './message-literal';
import { captureInitialField, withInitialField, initialFieldMZ, WEATHER, TERRAIN } from '../framework/rules/initial-field';
/**
 * Step 2.4: MZ/RPGReactor integration of the Showdown battle session (placeholder text UI).
 *
 * Responsibilities: plugin command that starts a battle and makes the map interpreter wait; a text
 * battle scene (windows are prototype-style like Reactor's own); game state kept inside the MZ save
 * (`G.$gameSystem._psGame`), changed ONLY by committing a BattleResult at the end (idempotent by battleId).
 * Basic owned presentation lives in battleflow modules; full art, animation databases and doubles UI remain outside this plugin.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { config as RuleConfig } from "../framework/rules/index";
import { BattleSceneController } from "./battleflow/controller";
import type { BattleScenePresentation } from "./battleflow/controller";
import { BattleDisplayPlayback } from "./battleflow/display";
import type { BattleDisplayCard } from "./battleflow/display";
import { BattleMenuCursor, gridCursor } from "./battleflow/menu";
import { createMoveSelectionWindow } from "./progression/move-selection-window";
import { moveChoice } from "./battleflow/move-choice";
import { battlebackContext, createBattlebackMZ } from "./battleflow/battleback-mz";
import { createBattlePicturesMZ } from "./battleflow/picture-mz";
import { createFaintMediaMZ } from "./battleflow/faint-mz";
import { battleMusicConfig, musicTrack } from "./battleflow/battle-music";
import { createBattleMusicMZ } from "./battleflow/battle-music-mz";
import { BattleMusicOperations } from "./battleflow/battle-music-operation";
import { captureMelodyPlan } from './battleflow/capture-melody';
import { createCaptureMEMZ } from './battleflow/capture-me-mz';
import { CaptureMelodySceneStep } from './battleflow/capture-me-scene';
import { BallScenePresentation, simpleBallPlan } from './battleflow/ball-scene';
import { createBallPortsMZ } from './battleflow/ball-mz';
import { prebattlePlan } from './battleflow/prebattle';
import { createLevelStatsMZ } from "./battleflow/level-stats-mz";
import { createOrdinaryMessageMZ, createPausedMessageMZ, createSynchronizedMessageMZ, createBriefMessageMZ, isMessageStepMZ } from "./battleflow/ordinary-message-mz";
import { BriefMessageStep } from './battleflow/brief-message';
import { BattleBagSelection } from './battleflow/battle-bag';
import { createBagFadeMZ } from './battleflow/bag-fade-mz';
import { parseBattleStyle, effectiveBattleStyle, installBattleStyleSettings } from './battleflow/battle-style-settings';
import type { BattleBagRequest } from './battleflow/battle-bag';
import { catalogOf, itemForBattleId } from '../framework/rules/item-catalog';
import { BALLS } from '../framework/rules/items';
import { PP_ITEMS, ESCAPE_ITEMS } from '../framework/rules/rules';
import { projectStatusCard } from './battleflow/status-card';
import { installPrebattleHost } from './battleflow/prebattle-host';
import { effectiveBattleEffects, installBattleEffectsSettings, parseBattleEffects } from './battleflow/battle-effects-settings';
const { developmentCapabilities, runtimeCapabilities } = RuleConfig;

(() => {
  "use strict";
  const G: any = globalThis; // Reactor's globals are real typed values; we only need them loosely here

  const NAME = "PS_BattleFlow";
  const W = window as any;
  const nodeRequire = (globalThis as any).require as any; // NW.js Node require (has .resolve)

  // ------------------------------------------------------- production engine access (loaded lazily, runtime-relative)
  type EngineAccess = { B: ProductionRuntime & Record<string, any>; D: any; root: string };
  let ENGINE: EngineAccess | null = null;
  function engine(): EngineAccess {
    if (!ENGINE) {
      const tLoad = performance.now();
      if (!nodeRequire) throw new Error("Node require() is not available in this runtime");
      const B = nodeRequire("./js/engine/build/production.cjs") as ProductionRuntime & Record<string, any>;
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

  type GameAppView = HostApplication;
  type BattleOutcomeView = BattleOutcome & { result?: BattleResult; hostErrors?: { step: string; error: string }[] };

  // ---------------------------------------------------------------- shared flow state / API
  let openingBattle: object | null = null;
  let replacingState = false;
  function musicSettings(presentation: any, parameters: any, next: any): any {
    let raw = presentation?.music === undefined ? parameters.battleMusic ?? {} : presentation.music;
    if (typeof raw === 'string') raw = raw === '' ? {} : JSON.parse(raw);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid battle music settings');
    const presets = raw.presets, combined = { ...next?.presets };
    if (presets !== null && presets !== undefined) {
      if (typeof presets !== 'object' || Array.isArray(presets)) throw new Error('invalid battle music presets');
      for (const key of ['battle', 'victory', 'capture']) if (Object.hasOwn(presets, key)) combined[key] = presets[key];
    }
    const config = battleMusicConfig({ map: raw.map, global: raw.global, presets: combined });
    const override = raw.defaultBgm;
    const defaultBgm = override === null || override === undefined ? undefined : musicTrack(override);
    return Object.freeze({ config, ...(defaultBgm?.name ? { defaultBgm } : {}) });
  }
  const PSFlow: ApplicationCompositionHost & Record<string, any> = {
    _nextBattleMusic: null as any,
    /** Explicit author presets; setting the following battle during this one is not consumed by its cleanup. */
    setNextBattleMusic(presets: unknown): void { PSFlow._nextBattleMusic = Object.freeze({ presets: battleMusicConfig({ presets }).presets }); },
    musicState(): any { return battleMusic.snapshot(); },
    isTrainerIntroReady(token: number): boolean { return battleMusic.introReady(token); },
    /** Separate map/event stage; the event command waits until settled plus a subsequent frame. */
    playTrainerIntro(id: string, version = 0): number | null {
      if (openingBattle || PSFlow.operationPending() || PSFlow._app?.encounterBlocked) throw new Error('operation-active');
      const opening = {}, initial = PSFlow._app, initialGeneration = initial?.stateGeneration;
      openingBattle = opening;
      try {
        const app = PSFlow.app(), owner = { app, generation: app.stateGeneration };
        const assertCurrent = () => {
          if (openingBattle !== opening || PSFlow._app !== app || app.stateGeneration !== owner.generation ||
            initial && (app !== initial || initial.stateGeneration !== initialGeneration) || PSFlow.operationPending()) throw new Error('stale-trainer-intro');
        };
        assertCurrent(); const projection = app.trainerRecord(id, version); assertCurrent();
        if (!projection) throw new Error('missing trainer record for intro');
        const intro = projection.presentation.introBgm; assertCurrent();
        const settings = musicSettings(undefined, G.PluginManager.parameters(NAME), PSFlow._nextBattleMusic); assertCurrent();
        const token = battleMusic.intro(owner, intro, settings.defaultBgm); assertCurrent(); return token;
      } finally { if (openingBattle === opening) openingBattle = null; }
    },
    _startBattleMusic(op: any): void {
      if (!op || op !== PSFlow._op || !PSFlow.running || !op.musicPlan || op.musicPlan.started || op.musicPlan.closed) return;
      const plan = op.musicPlan, owner = plan.owner;
      if (!owner || PSFlow._app !== owner.app || owner.app.stateGeneration !== owner.generation) return;
      plan.started = true;
      try { battleMusic.start(owner, op, plan.prepared, plan.settings, plan.trainers); }
      catch (error) { op.musicError = String(error); battleMusic.finish(op, false); }
    },
    _closeBattleMusic(op: any, normal: boolean): void {
      op?.ballFeedback?.cancel();
      op?.captureMelody?.cancel(); // own ME retires before return BGM can take the channel
      const plan = op.musicPlan; if (!plan) return;
      if (plan.closed) { if (!normal) battleMusic.finish(op, false); return; }
      plan.closed = true;
      if (normal && PSFlow._nextBattleMusic === plan.presetHolder) PSFlow._nextBattleMusic = null;
      try { battleMusic.finish(op, normal); } catch (error) { op.musicError = String(error); }
    },
    _victoryBattleMusic(op: any): void {
      if (!op || op !== PSFlow._op || !PSFlow.running || !op.musicPlan?.started || op.musicPlan.closed) return;
      const plan = op.musicPlan, owner = plan.owner;
      if (!owner || PSFlow._app !== owner.app || owner.app.stateGeneration !== owner.generation) return;
      try { battleMusic.victory(op, plan.settings, plan.trainers); }
      catch (error) { op.musicError = String(error); }
    },
    developerCapabilities: {}, // explicit developer/test injection only; never plugin settings or save data
    operationPending(): boolean { return PSFlow.running || prebattle.pending() || !!PSFlow._app?.saveBlocked || !!W.PSManagement?.presentationPending?.(); },
    prebattleState(): any { return prebattle.snapshot(); },
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
      const op = PSFlow._op, returned = PSFlow.app().resolvePokedex(token, revision, decision), continuation = 'continuation' in returned ? returned.continuation : undefined;
      if (continuation && "code" in continuation && op && op === PSFlow._op) {
        const { result, ...outcome } = continuation; PSFlow.completeBattleOutcome(outcome, result, op);
      }
      return returned;
    },
    beginTrade(requestId: string, intent: any): any { return PSFlow.app().beginTrade(requestId, intent); },
    resolveTrade(token: string, revision: number, decision: any): any { return PSFlow.app().resolveTrade(token, revision, decision); },
    assertBattleAllowed(): void { const capabilities = runtimeCapabilities(PSFlow.developerCapabilities); if (!capabilities.allowExperimentalHeldItemBattle && (PSFlow.game().party || []).some((m: any) => !!m.item)) throw new Error("held-item-battle-disabled: 战后持物写回未完成"); },
    running: false, // a battle scene is open (the interpreter waits on this)
    request: null as any,
    lastOutcome: null as any,
    lastResult: null as any,
    lastClaim: null as any,
    lastHeal: null as any,
    seed: undefined, // tests pin the engine seed
    fast: false, // tests: no message pacing
    debug: {} as any, // tests: failure injection
    perf: { engineLoadMs: null as any, battles: [] as any[], cur: null as any }, // measurement hooks (cheap; read by the test driver)
    /**
     * The Content the battle session uses. `sample` (default) is the content pipeline's compiled output assembled with
     * the pinned Showdown data; `fixture` is the synthetic step 2 test content. A missing or unusable compiled file is
     * an error, never a silent fallback to the fixture.
     */
    content(): Content {
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
      return PSFlow._content!;
    },
    _content: null as Content | null,
    _dex: null as DexLookup | null,
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
      if (replacingState) throw new Error('host-state-replacement-active');
      PSFlow._app?.assertHostStateReplacementAllowed?.();
      const replacement = {}; replacingState = true; openingBattle = replacement;
      try {
      PSFlow._op?.captureMelody?.cancel();
      PSFlow._op?.ballFeedback?.cancel();
      if (PSFlow._app) PSFlow._app.stateReplacedByHost();
      prebattle.cancel();
      battleMusic.retire(); PSFlow._nextBattleMusic = null;
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
      } finally { replacingState = false; if (openingBattle === replacement) openingBattle = null; }
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
    logger: null,
    game(): GameState {
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
        const ports: GameApplicationPorts<BattleSessionView> = {
          state: { read: () => PSFlow.game(), replace: next => { G.$gameSystem._psGame = next; } },
          content: () => ({ content: PSFlow.content(), dex: PSFlow._dex ?? undefined }),
          sessions: ((G.PluginManager.parameters(NAME).contentSource || "sample") === "fixture"
            ? B.composition.createLegacyNoHeldBattleSessionFactory : B.composition.createBattleSessionFactory)({ content: () => PSFlow.content(), seed: () => PSFlow.seed, logger: () => PSFlow.logger!.sink, replacementOffers: (G.PluginManager.parameters(NAME).contentSource || "sample") !== "fixture" }),
          projection: { project: (outcome: { code: number }) => PSFlow.projectOutcome(outcome) },
          random: (n: number) => PSFlow.random(n),
          clock: () => PSFlow.now(),
          itemWorld:()=>({mapId:G.$gameMap?.mapId?.()}),
          evolutionWorld: member => ({
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
        };
        const options: GameApplicationOptions = { startMoney: PSFlow.param("startMoney", 3000), noMoneyLoss: PSFlow.flagParam("noMoneyLoss", false), limits: PSFlow.limits(), capabilities: PSFlow.developerCapabilities, receivingProfile: PSFlow.receiveOptions ?? { mode: 0, naming: 0 }, playerLocale: G.navigator?.language ?? "en", playerName: G.$gameParty?.leader?.()?.name?.() || "player" };
        PSFlow._app = new B.app.GameApplication(ports, options);
      }
      return PSFlow._app;
    },
    _app: null as GameAppView | null,
    /**
     * Stage capacities (rules/limits.ts) from the content's rule configuration (rules/config.ts, WP02; Gen 8 defaults
     * when it has none); tests may replace them with `testLimits` (then reset `_app`).
     */
    testLimits: null as any,
    limits(): Limits {
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
    commit(result: Parameters<HostApplication['commitResult']>[0], options: Parameters<HostApplication['commitResult']>[1] = {}): string { return PSFlow.app().commitResult(result, options); },
    _prepareBattlePresentation(op: any, app: any, assertCurrent: () => void): void {
      const generation = app.stateGeneration;
      if (op.musicPlan?.owner) {
        const owner=op.musicPlan.owner, identity=op.preparedTrainerIdentity, trainer=op.request.trainer;
        if (owner.app!==app || owner.generation!==generation) throw new Error('stale-battle-opening');
        if(identity && (trainer!==identity.ref || trainer.id!==identity.id || trainer.version!==identity.version)) throw new Error('trainer-audio-context-changed');
        assertCurrent(); return;
      }
      if (op.musicPlan) {
        const trainer = op.request.trainer, identity = trainer ? { id: trainer.id, version: trainer.version } : null;
        op.preparedTrainerIdentity = trainer ? { ref:trainer, id:trainer.id, version:trainer.version } : null;
        const projection = identity ? app.trainerRecord(identity.id, identity.version) : null; assertCurrent();
        if (identity && !projection) throw new Error('missing trainer record for battle music');
        // Same public author-version projection as the music context; never requery after the fight.
        op.trainerPresentation = op.request.kind === 'trainer' && projection && typeof projection.name === 'string'
          ? Object.freeze({ id: projection.id, version: projection.version, name: projection.name,
            openingText: projection.presentation.openingText, loseText: projection.presentation.loseText }) : null;
        op.musicPlan.owner = { app, generation };
        op.musicPlan.trainers = op.request.kind === 'trainer' ? Object.freeze(projection ? [Object.freeze({
          battleBgm: projection.presentation.battleBgm, victoryBgm: projection.presentation.victoryBgm,
        })] : []) : undefined;
        assertCurrent();
        if (identity && (op.request.trainer !== trainer || trainer.id !== identity.id || trainer.version !== identity.version)) throw new Error('trainer-audio-context-changed');
      }
    },
    _preparePrebattleAudio(op: any): void {
      const initial=PSFlow._app, oldGeneration=initial?.stateGeneration;
      const assertHost=()=>{if(op!==PSFlow._op || !PSFlow.running || initial && (PSFlow._app!==initial || initial.stateGeneration!==oldGeneration))throw new Error('stale-battle-opening');};
      assertHost();PSFlow.assertBattleAllowed();assertHost();
      const app=PSFlow.app();assertHost();const generation=app.stateGeneration;
      const current=()=>{assertHost();if(PSFlow._app!==app || app.stateGeneration!==generation)throw new Error('stale-battle-opening');};
      PSFlow.content();current();PSFlow._prepareBattlePresentation(op,app,current);current();PSFlow._startBattleMusic(op);
    },
    async begin(): Promise<BattleSessionView> {
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
      PSFlow._prepareBattlePresentation(op, app, assertCurrent);
      op.request.storageFull = engine().B.limits.storageFull(current, limits); // only refusal text; application decides noBall
      const sessionRequest = { ...withInitialField(op.request, op.initialField), battleStyle: op.battleStyle ?? effectiveBattleStyle(G, op.request.battleStyle) };
      // Capture before awaiting, but only publish for a successfully accepted, still-current Session.
      const canLose = !!sessionRequest.canLose;
      const session = await (op.request.trainer ? app.startTrainerBattle(sessionRequest) : app.startBattle(sessionRequest)); assertCurrent();
      const elapsed = performance.now() - tCreate; assertCurrent();
      op.canLose = canLose;
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
      if (outcome.payDayReward && outcome.commit !== "none") PSFlow.afterCommit(outcome, "payday-reward-message", () => {
        const tr = PSFlow.translator(), reward = outcome.payDayReward;
        if (reward.actual > 0) G.$gameMessage.add(tr.t("battle.paydayReward", { money: reward.actual }));
        if (reward.normalizationLoss > 0) G.$gameMessage.add(tr.t("trainer.rewardNormalized", { money: reward.normalizationLoss }));
      });
      if(outcome.code===2&&outcome.commit!=='none'&&result?.captured?.length)PSFlow.afterCommit(outcome,'receiving-message',()=>PSFlow.notifyReceived(result.captured.map((m:any)=>m.id),outcome.battleId));
      // D3: after a committed defeat the host takes the player home (unless the author allowed losing). The money and the
      // heal were settled in the commit; this is only the trip, it can fail and be retried without settling again. The
      // trip is requested before the messages, and a failing message is recorded on the outcome without changing it.
      if (outcome.code === 4 && outcome.commit !== "none" && !op.canLose) {
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
        const name=member.nickname?messageLiteral(member.nickname):PSFlow.speciesName(member.species,member.form),displayDest=position.kind==='box'&&snapshot.storage.boxes[position.box].name?messageLiteral(dest):dest;
        const text=PSFlow.translator().t('management.received',{dest:name+' → '+displayDest});G.$gameMessage.add(text);seen.add(id);placements.push({id,position,to:position.kind==='party'?'party':'boxes',destination:dest});messages.push(text);
      }
      if(placements.length)PSFlow.lastReceivingNotice={key,placements,messages};
    },
    resolveReceiving(token: string, decisions: Parameters<HostApplication['resolveReceiving']>[1] = {}, signal?: Parameters<HostApplication['resolveReceiving']>[2]): any {
      const op = PSFlow._op;
      const returned = PSFlow.app().resolveReceiving(token, decisions, signal);
      if (returned && "code" in returned && op === PSFlow._op) {
        const { result, ...outcome } = returned as BattleOutcomeView; return PSFlow.completeBattleOutcome(outcome, result, op);
      }
      return returned;
    },
    /** Core continuation bridge. Formal evolution/learning scenes are the later G package. */
    resolveEvolution(token: string, revision: number, decision: any): any {
      const op = PSFlow._op, previous = PSFlow.lastOutcome, returned = PSFlow.app().resolveEvolution(token, revision, decision);
      if (returned && "code" in returned && op === PSFlow._op) {
        const { result, ...outcome } = returned as BattleOutcomeView;
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
      PSFlow._closeBattleMusic(op, false); // media retires even if the application must retain a pending root for recovery
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
    close(code: number, op: any = PSFlow._op, normal = code !== 0): void {
      if (op !== PSFlow._op) { PSFlow.stale("close", op); return; }
      if (PSFlow._app?.pendingEvolution || PSFlow._app?.pendingReceiving || PSFlow._app?.pendingPokedex) return;
      prebattle.finish(op, normal);
      PSFlow.running = false;
      PSFlow._closeBattleMusic(op, normal);
      const cur = PSFlow.perf.cur;
      if (cur && !cur.totalMs) { cur.totalMs = Math.round((performance.now() - cur.t0) * 10) / 10; cur.code = code; PSFlow.perf.battles.push(cur); }
    },
    /** The single way a battle opens (StartBattle command and map encounters): the same application path, the same guards. */
    openBattle(request: any, presentation?: any): void {
      if (PSFlow.running) throw new Error("a battle is already running");
      if (openingBattle || PSFlow.operationPending() || PSFlow._app?.encounterBlocked) throw new Error("operation-active");
      const initialField = captureInitialField(request);
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
        const battleEffects = effectiveBattleEffects(G, request.battleEffects); assertCurrent();
        const started = performance.now(); assertCurrent();
        const battleStyle = effectiveBattleStyle(G, request.battleStyle); assertCurrent();
        const visualContext = battlebackContext(presentation, G.PluginManager.parameters(NAME)); assertCurrent();
        const transition = prebattlePlan(request.kind, presentation, G.PluginManager.parameters(NAME), visualContext.time); assertCurrent();
        const presetHolder = PSFlow._nextBattleMusic;
        const settings = musicSettings(presentation, G.PluginManager.parameters(NAME), presetHolder); assertCurrent();
        const prepared = battleMusic.capture({ app: PSFlow._app, generation: PSFlow._app?.stateGeneration }); assertCurrent();
        PSFlow._op = { request, initialField, session: null, battleStyle, battleEffects, visualContext, musicPlan: { settings, prepared, presetHolder, started: false, closed: false } };
        PSFlow.request = request;
        PSFlow.running = true;
        PSFlow.lastOutcome = null;
        PSFlow.perf.cur = { battleId: request.battleId, t0: started, actions: [] as any[], encounter: !!request.encounter };
        if (PSFlow.perf.encounterT0 !== undefined && request.encounter) PSFlow.perf.cur.t0 = PSFlow.perf.encounterT0;
        openingBattle = null; // running now owns the host save/input barrier
        if (!prebattle.open(PSFlow._op, transition)) G.SceneManager.push(W.Scene_PSBattle);
      } finally { if (openingBattle === opening) openingBattle = null; }
    },
    /** Player-facing entries contain a closed held-item gate; direct developer openBattle keeps its throwing contract. */
    tryOpenBattle(request: any, presentation?: any): boolean {
      const previous=PSFlow._op;
      try{PSFlow.openBattle(request, presentation);return true;}
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
  };
  W.PSFlow = PSFlow;

  installBattleStyleSettings(G, () => PSFlow.translator());

  const battleMusic = new BattleMusicOperations({
    current: (owner, op) => PSFlow._app === owner.app && PSFlow._app?.stateGeneration === owner.generation &&
      (op === null ? !PSFlow.running : PSFlow._op === op),
    frame: () => G.Graphics.frameCount,
    makePort: (current, defaultBgm) => createBattleMusicMZ(G, nodeRequire, engine().root, current, { defaultBgm }),
  });
  const prebattle = installPrebattleHost(G, PSFlow, op => PSFlow._preparePrebattleAudio(op));
  installBattleEffectsSettings(G, () => PSFlow.translator());

  // ---------------------------------------------------------------- plugin commands + interpreter wait
  function parseCanSwitch(value: unknown): boolean {
    if (value === undefined || value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw new Error('canSwitch must be true or false');
  }
  function parseExpGain(value: unknown): boolean {
    if (value === undefined || value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw new Error('expGain must be true or false');
  }
  function parseProhibition(value: unknown, rule: 'noRun' | 'noBall'): boolean {
    if (value === undefined || value === false || value === 'false') return false;
    if (value === true || value === 'true') return true;
    throw new Error(rule + ' must be true or false');
  }
  function parseFoes(text: string): { species: string; level: number }[] {
    return String(text).split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
      const [species, level] = s.split(":");
      return { species: species.trim(), level: Number(level) || 5 };
    });
  }

  G.PluginManager.registerCommand(NAME, "StartBattle", function (this: any, args: any) {
    if (PSFlow.running) throw new Error("a battle is already running");
    const initialField = initialFieldMZ(args.defaultWeather, args.defaultTerrain, args.battleEnvironment);
    const canSwitch = parseCanSwitch(args.canSwitch), battleStyle = parseBattleStyle(args.battleStyle), expGain = parseExpGain(args.expGain), battleEffects = parseBattleEffects(args.battleEffects), noRun = parseProhibition(args.noRun, 'noRun'), noBall = parseProhibition(args.noBall, 'noBall'), seq = PSFlow.nextSeq();
    const battleId = `${args.battleId || "battle"}#${seq}`;
    const opened=PSFlow.tryOpenBattle({
      kind: args.kind === "trainer" ? "trainer" : "wild",
      foes: parseFoes(args.foes || "Pidgey:5"),
      seq,
      battleId,
      resultVariable: Number(args.resultVariable) || 0,
      initialField,
      canLose: String(args.canLose) === "true", canSwitch, battleStyle, expGain, noRun, noBall, battleEffects,
      forceParty: String(args.forceParty) === "true",
    }, { background: args.battleBackground || undefined, platform: args.battlePlatform, time: args.battleTime,
      transition: { location: args.prebattleLocation || undefined } });
    if(!opened){if(G.$gameMessage.isBusy())this.setWaitMode('message');return;}
    this._psBattleId = battleId; // this interpreter waits for THIS battle (see updateWaitMode below)
    this.setWaitMode("psBattle");
  });

  G.PluginManager.registerCommand(NAME, "StartTrainerBattle", function (this: any, args: any) {
    if (PSFlow.running) throw new Error("a battle is already running");
    if (args.moneyGain !== undefined && ![true, false, "true", "false"].includes(args.moneyGain)) throw new Error("moneyGain must be true or false");
    const initialField = initialFieldMZ(args.defaultWeather, args.defaultTerrain, args.battleEnvironment);
    const canSwitch = parseCanSwitch(args.canSwitch), battleStyle = parseBattleStyle(args.battleStyle), expGain = parseExpGain(args.expGain), battleEffects = parseBattleEffects(args.battleEffects), noRun = parseProhibition(args.noRun, 'noRun'), noBall = parseProhibition(args.noBall, 'noBall');
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
      initialField,
      canLose: String(args.canLose) === "true", canSwitch, battleStyle, expGain, noRun, noBall, battleEffects,
      forceParty: String(args.forceParty) === "true",
    }, { background: args.battleBackground || undefined, platform: args.battlePlatform, time: args.battleTime,
      transition: { location: args.prebattleLocation || undefined } });
    if (!opened) { if (G.$gameMessage.isBusy()) this.setWaitMode("message"); return; }
    this._psBattleId = battleId;
    this.setWaitMode("psBattle");
  });

  G.PluginManager.registerCommand(NAME, 'PlayTrainerIntro', function (this: any, args: any) {
    const token = PSFlow.playTrainerIntro(String(args.trainerId || ''), Number(args.version ?? 0));
    if (token !== null) { this._psMusicIntro = token; this.setWaitMode('psBattleIntro'); }
  });
  G.PluginManager.registerCommand(NAME, 'SetNextBattleMusic', function (this: any, args: any) {
    PSFlow.setNextBattleMusic({ battle: args.battle ?? '', victory: args.victory ?? '', capture: args.capture ?? '' });
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
    if (this._waitMode === 'psBattleIntro') {
      if (!PSFlow.isTrainerIntroReady(this._psMusicIntro)) return true;
      this._waitMode = ''; delete this._psMusicIntro; return false;
    }
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
      if (PSFlow.running || prebattle.pending()) return true;
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
    delete this._psEndChain; delete this._psBattleId; delete this._psMusicIntro;
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
  /** Plain authored dialogue: measured word/glyph wrapping and visible-height pages; no ellipsis. */
  Window_PSText.prototype.textPages = function (this: any, text: string): string[][] {
    const lines: string[] = [], width = Math.max(1, this.innerWidth);
    for (const paragraph of text.split(/\r\n|\r|\n/)) {
      const points = Array.from(paragraph);
      if (!points.length) { lines.push(''); continue; }
      for (let offset = 0; offset < points.length;) {
        let count = 1;
        while (offset + count < points.length && this.textWidth(points.slice(offset, offset + count + 1).join('')) <= width) count++;
        if (offset + count < points.length) {
          for (let i = count - 1; i > 0; i--) if (/\s/u.test(points[offset + i])) { count = i + 1; break; }
        }
        lines.push(points.slice(offset, offset + count).join('')); offset += count;
      }
    }
    const pages: string[][] = [];
    for (let i = 0; i < lines.length; i += this._max) pages.push(lines.slice(i, i + this._max));
    return pages;
  };
  Window_PSText.prototype.setLines = function (lines: string[]) { this._lines = lines.slice(-this._max); this.refresh(); };
  Window_PSText.prototype.add = function (line: string) { this._lines.push(line); this._lines = this._lines.slice(-this._max); this.refresh(); };
  Window_PSText.prototype.statusCardViews = function () {
    const tr = PSFlow.translator();
    const labels = Object.fromEntries(['psn', 'tox', 'brn', 'par', 'slp', 'frz', 'unknown'].map(key => [key, tr.t('ui.card.' + key)])) as Parameters<typeof projectStatusCard>[2];
    // Metadata is supplied by the owning Scene from already-shown public details.
    return (this._d2Cards ?? []).map((card: BattleDisplayCard) => {
      const published = this._d2Appearance?.(card);
      return projectStatusCard(published ? { ...card, name: published.name } : card, published?.metadata, labels);
    });
  };
  Window_PSText.prototype.refresh = function () {
    this.contents.clear();
    if (this._d2Cards) {
      const cards: ReturnType<typeof projectStatusCard>[] = this.statusCardViews(), tr = PSFlow.translator();
      for (const [index, side] of ['p1', 'p2'].entries()) {
        const card = cards.find((member: ReturnType<typeof projectStatusCard>) => member.side === side && member.visible);
        if (!card) continue;
        const previousOpacity = this.contents.paintOpacity;
        this.contents.paintOpacity = Math.round(card.opacity * 255);
        const x = index * (this.innerWidth / 2);
        const width = Math.max(0, Math.min(this.innerWidth / 2 - 12, (this._d2ContentRight?.() ?? this.innerWidth) - x));
        const badges = [
          ...(card.gender.symbol ? [{ text: card.gender.symbol, colour: card.gender.colour === 'blue' ? '#71afff' : '#ff8585' }] : []),
          ...(card.shiny ? [{ text: '★', colour: '#ffdc68' }] : []),
          ...(card.owned ? [{ text: tr.t('ui.card.owned'), colour: '#ffffff' }] : []),
        ];
        const badgeWidth = badges.reduce((n, badge) => n + this.textWidth(badge.text) + 8, 0);
        this.drawText(this.fitText(tr.t('ui.card.level', { name: card.name, level: card.level }), Math.max(0, width - badgeWidth)), x, 0, Math.max(0, width - badgeWidth));
        let badgeX = x + width - badgeWidth;
        const textColour = this.contents.textColor;
        for (const badge of badges) {
          const size = this.textWidth(badge.text) + 8;
          this.contents.textColor = badge.colour; this.drawText(badge.text, badgeX, 0, size); badgeX += size;
        }
        this.contents.textColor = textColour;
        if (card.condition.label) {
          const colour = { psn: '#a966b3', tox: '#6c3d83', brn: '#b74c42', par: '#8c721e', slp: '#596681', frz: '#397d99', unknown: '#59616b' }[card.condition.kind as Exclude<typeof card.condition.kind, 'none'>];
          this.contents.fillRect?.(x, 24, width / 2, 20, colour);
          this.drawText(this.fitText(card.condition.label, width / 2), x, 24, width / 2);
        }
        if (card.hp.numbers) this.drawText(`${card.hp.numbers.current} / ${card.hp.numbers.total}`, x + width / 2, 24, width / 2, 'right');
        this.contents.fillRect?.(x, 52, width, 8, '#343b43');
        this.contents.fillRect?.(x, 52, width * card.hp.ratio, 8, { red: '#d65353', yellow: '#dec253', green: '#55b77d' }[card.hp.colour]);
        if (card.experience) {
          this.contents.fillRect?.(x, 72, width, 6, '#343b43');
          this.contents.fillRect?.(x, 72, width * card.experience.ratio, 6, card.experience.flash ? '#ffffff' : '#589eda');
        }
        this.contents.paintOpacity = previousOpacity;
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
  Window_PSMenu.prototype.itemHeight = function () {
    const normal = G.Window_Command.prototype.itemHeight.call(this);
    return this._phase === 'moves' ? Math.max(normal, this.lineHeight() * 2 + 8) : normal;
  };
  Window_PSMenu.prototype.drawItem = function (index: number) {
    const view = this._phase === 'moves' && this._items[index]?.moveView;
    if (!view) { G.Window_Command.prototype.drawItem.call(this, index); return; }
    const rect = this.itemRect(index), x = rect.x + 8, width = rect.width - 16;
    // Simple replaceable type badge; no dependency on a particular artwork atlas.
    this.changePaintOpacity(true); // PP0 and disabled requests remain selectable candidates.
    // MZ draws the cursor between contentsBack and contents. Keep the large
    // opaque tile behind it so keyboard/touch selection remains visible.
    this.contentsBack.fillRect(rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4, '#fffdf5');
    this.contents.fillRect(rect.x + 2, rect.y + 2, 4, rect.height - 4, view.typeColour);
    this.changeTextColor('#202028');
    this.drawText(view.name, x, rect.y + 2, width);
    const badgeWidth = Math.min(112, Math.floor(width / 2)), y = rect.y + this.lineHeight() + 4;
    this.contents.fillRect(x, y, badgeWidth, this.lineHeight(), view.typeColour);
    this.changeTextColor(view.typeTextColour);
    this.drawText(view.typeLabel, x + 2, y, badgeWidth - 4, 'center');
    if (view.pp !== null) {
      this.changeTextColor(view.ppColour);
      this.drawText(view.pp, x + badgeWidth + 6, y, width - badgeWidth - 6, 'right');
    }
    this.resetTextColor();
  };
  for (const [method, direction] of Object.entries({ cursorUp: 'up', cursorDown: 'down', cursorLeft: 'left', cursorRight: 'right' } as const)) {
    Window_PSMenu.prototype[method] = function (wrap: boolean) {
      if (this._phase === 'bag' && (direction === 'left' || direction === 'right') && this._bagPocket) this._bagPocket(direction === 'left' ? -1 : 1);
      else if (this.maxCols() === 2) {
        this.select(gridCursor(this.index(), direction, this._items.length));
        this.ensureCursorVisible?.(false);
      }
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

  /** Classify only an actual refused switch, from the engine's public member/request views. */
  function switchRefusalText(session: BattleSessionView, memberId: string): string | null {
    const live = session.gw.readState('p1'), selected = live.find((m: any) => m.id === memberId);
    const nameOf = (id: string) => {
      const member = session.party.find((m: any) => m.id === id);
      return member?.nickname || PSFlow.speciesName(member?.species ?? id);
    };
    const tr = PSFlow.translator();
    if (selected?.active) return tr.t('refusal.switch.already-active', { name: nameOf(memberId) });
    const request = session.gw.awaitingChoice?.('p1') ?? session.currentRequest();
    const outgoing = live.find((m: any) => m.active && !m.fainted);
    if (!request?.forceSwitch && request?.active?.[0]?.trapped === true && outgoing) {
      return tr.t('refusal.switch.trapped', { name: nameOf(outgoing.id) });
    }
    return null;
  }

  function Scene_PSBattle(this: any) { this.initialize(...(arguments as any)); }
  W.Scene_PSBattle = Scene_PSBattle;
  Scene_PSBattle.prototype = Object.create(G.Scene_MenuBase.prototype);
  Scene_PSBattle.prototype.constructor = Scene_PSBattle;

  const P = Scene_PSBattle.prototype;
  const requestObservers = new WeakMap<object, { op: any; app: any; session: any; generation: number; epoch: number; token: string; menu: any; menuRevision: number }>();
  let requestObserverSerial = 0;
  // Only player-owned members use saved nicknames. Opponent appearance stays public-only.
  const playerBattleName = (member: any): string => member.nickname || PSFlow.speciesName(member.species);
  function initialDisplay(session: BattleSessionView, names: Record<string, string>): BattleDisplayCard[] {
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
      return { id: state.id, side: side as 'p1' | 'p2', name: member ? (side === 'p1' ? playerBattleName(member) : PSFlow.speciesName(member.species)) : names[state.id] || state.id,
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
  function sceneController(scene: any, initialized = false): BattleSceneController<BattleSessionView> {
    if (!initialized && scene._controller) return scene._controller;
    const op = scene._psOp === undefined ? PSFlow._op : scene._psOp;
    const owner = { app: PSFlow._app, generation: PSFlow._app?.stateGeneration, bound: initialized && !!PSFlow._app };
    // Bare prototype callers retain their existing API defaults. Every real initialize constructs a strict owner.
    const current = () => initialized
      ? !!op && op === PSFlow._op && (!owner.bound || PSFlow._app === owner.app && owner.app?.stateGeneration === owner.generation)
      : scene._psOp === undefined || scene._psOp === PSFlow._op;
    const c = new BattleSceneController<BattleSessionView>({
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
  function activeSession(scene: { _session?: BattleSessionView | null }): BattleSessionView {
    const session = scene._session;
    if (!session) throw new Error('battle scene has no session');
    return session;
  }
  // Compatibility seams for existing test IDs. These names forward to one controller; no parallel scene state.
  function proxyControllerField<K extends 'phase' | 'ready' | 'failure' | 'queue' | 'wait' | 'busy' | 'session'>(name: string, field: K): void {
    Object.defineProperty(P, name, { configurable: true,
      get(this: object): BattleSceneController<BattleSessionView>[K] { return sceneController(this)[field]; },
      set(this: object, value: BattleSceneController<BattleSessionView>[K]) { sceneController(this)[field] = value; },
    });
  }
  proxyControllerField('_mode', 'phase'); proxyControllerField('_ready', 'ready'); proxyControllerField('_failure', 'failure');
  proxyControllerField('_queue', 'queue'); proxyControllerField('_wait', 'wait'); proxyControllerField('_busy', 'busy'); proxyControllerField('_session', 'session');
  P.initialize = function () {
    G.Scene_MenuBase.prototype.initialize.call(this);
    this._psBattle = true; // marker for the test driver (constructor identity is wrapped by pixi_compat)
    this._psOp = PSFlow._op; // the operation this scene belongs to: its finish/abort never reach a later one
    sceneController(this, true);
    this._D = null; this._names = {}; this._display = null; this._displayAudio = []; this._faintAudio = []; this._menuCursor = new BattleMenuCursor(); this._backdrop = null;
    this._pictures = null; this._pictureUpdate = 0; this._ballFeedback = null; this._endFeedbackShown = false; this._endFeedbackPages = null; this._endFeedbackPage = 0; this._endPageShownUpdate = -1; this._trainerOpeningQueued = false; this._retryMoveMenu = false; this._automaticMove = null;
    this._residentBrief = null; this._briefTail = null;
    this._wildOpeningQueued = false;
    this._battleBag = null; this._bagHidden = null; this._bagRetry = false; this._trainerDispatchQueued = false;
    this._bagLayer = 'battle'; this._bagFade = null; this._bagFadeReturn = false;
    this._replacementQuestion = null;
    this._partySelected = null; this._retryPartySelection = null; this._partyCommandShownUpdate = -1;
    this._partyDisplayOrder = null;
    this._learningRetry = null;
  };
  P.create = function () {
    const c = sceneController(this);
    c.present(() => {
    G.Scene_MenuBase.prototype.create.call(this); if (!c.isCurrent()) return;
    const w = G.Graphics.boxWidth, h = G.Graphics.boxHeight;
    this._status = new (Window_PSText as any)(new G.Rectangle(0, 0, w, 120));
    // MenuBase's touch cancel lives in the same window layer. Reserve its lane
    // rather than painting the opponent name and badges beneath the button.
    this._status._d2ContentRight = () => {
      const button = this._cancelButton, status = this._status;
      return button?.visible && button.y < status.y + status.height && button.y + button.height > status.y
        ? Math.max(0, button.x - status.x - (status.padding ?? 12) - 8) : status.innerWidth;
    };
    this._log = new (Window_PSText as any)(new G.Rectangle(0, 120, w, 300));
    this._menu = new (Window_PSMenu as any)(new G.Rectangle(0, 420, w, h - 420));
    this._commandMenu = this._menu; this._learningMenu = null;
    for (const win of [this._status, this._log, this._menu]) { win.backOpacity = 96; this.addWindow(win); }
    this._menu.setHandler("ok", this.onMenuOk.bind(this));
    this._menu.setHandler("cancel", this.onMenuCancel.bind(this));
    this._menu._bagPocket = (delta: number) => this.changeBagPocket(delta);
    this._menu.deactivate(); this._menu.hide();
    c.open(() => { this._psBindHost(); return PSFlow.begin(); });
    });
  };
  P.isReady = function () {
    const c = sceneController(this), base = G.Scene_MenuBase.prototype.isReady.call(this);
    if (!c.isCurrent() || !PSFlow.running || G.SceneManager._scene !== this) this._backdrop?.dispose();
    if (c.ready && c.isCurrent() && PSFlow.running && !c.failure) c.present(() => {
      if (!this._backdrop) this._backdrop = createBattlebackMZ(G, nodeRequire, engine().root, this,
        this._psOp?.visualContext ?? battlebackContext(undefined, G.PluginManager.parameters(NAME)),
        () => c.isCurrent() && PSFlow.running && G.SceneManager._scene === this, error => c.fail(error));
      this._backdrop.poll();
    });
    return base && (c.ready || !c.isCurrent() || !PSFlow.running) && (!this._backdrop || this._backdrop.ready || !c.isCurrent() || !PSFlow.running);
  };
  P.battlebackState = function () { return this._backdrop?.snapshot() ?? null; };
  P.start = function () {
    const c = sceneController(this);
    c.present(() => {
    G.Scene_MenuBase.prototype.start.call(this);
    if (!c.isCurrent()) return;
    if (!PSFlow.running) { c.tick(false, 0); return; }
    if (this._failure) { this.abort(this._failure); return; }
    const s = this._session;
    engine().B.session?.bindLearningPresentation?.(s);
    PSFlow._startBattleMusic(this._psOp); if (!c.isCurrent() || !PSFlow.running) return;
    for (const m of s.party) { if (!c.isCurrent()) return; this._names[m.id] = playerBattleName(m); }
    for (const m of s.foeTeam) { if (!c.isCurrent()) return; this._names[m.id] = PSFlow.speciesName(m.species); }
    if (!c.isCurrent()) return;
    this._D = engine().D.make(this._names, PSFlow.translator());
    this._pictures = createBattlePicturesMZ(G, this,
      () => c.isCurrent() && PSFlow.running && G.SceneManager._scene === this,
      () => this._pictureUpdate, error => c.fail(error), actor => {
        const member = (actor.side === 'p1' ? s.party : s.foeTeam).find((x: any) => x.id === actor.id);
        const mapped = member && s.content?.speciesKeys && Object.prototype.hasOwnProperty.call(s.content.speciesKeys, member.species)
          ? s.content.speciesKeys[member.species] : null;
        const identity = !member || member.egg ? null : mapped || { species: member.species, form: member.form ?? 0 };
        return createFaintMediaMZ(G, nodeRequire, engine().root, identity,
          () => c.isCurrent() && PSFlow.running && G.SceneManager._scene === this,
          row => { if (c.isCurrent() && PSFlow.running) this._faintAudio.push({ ...row, t: performance.now() }); }, undefined, this._psOp.battleEffects ?? true);
      }, this._psOp.battleEffects ?? true);
    // Active is already the engine's opening state; a queued public send-out
    // still owns the first visible portrait. Consume the batch once, and hide
    // only those identities until their own send-out step paints them.
    const opening = s.take();
    if (!c.isCurrent()) { this._pictures.dispose(); return; }
    const waitingForOpening = new Set<string>();
    for (const message of opening) if (message.kind === 'events') for (const event of message.events) {
      if (event.type !== 'switch' && event.type !== 'drag') continue;
      const match = /^(p[12])[a-z]?: (.+)$/.exec(event.args[0] || '');
      if (match) waitingForOpening.add(match[1] + ':' + match[2]);
    }
    const initialCards = initialDisplay(s, this._names);
    for (const card of initialCards) if (waitingForOpening.has(card.side + ':' + card.id)) card.portraitVisible = false;
    this._status._d2Appearance = (card: BattleDisplayCard) => {
      if (!c.isCurrent() || !PSFlow.running || this._session !== s) return null;
      const publicView = card.appearance;
      if (!publicView) return { name: card.side === 'p2' ? PSFlow.translator().t('ui.card.unknown') : card.name, metadata: null };
      const key = engine().B.speciesKey.keyOfBattleName(s.content, publicView.species);
      let owned: boolean | null = null;
      try {
        const record = PSFlow.game()?.dex?.owned;
        if (card.side === 'p2' && key && Array.isArray(record)) owned = record.includes(key.species);
      } catch { /* Optional record unavailable: preserve unknown and legal control. */ }
      return { name: card.side === 'p1' ? card.name : PSFlow.speciesName(publicView.species), metadata: {
        id: card.id, side: card.side, gender: publicView.gender, shiny: publicView.shiny,
        owned,
      } };
    };
    this._display = new BattleDisplayPlayback(initialCards, {
      current: () => c.isCurrent() && PSFlow.running,
      bindsAppearance: (side, id) => {
        if (!c.isCurrent() || !PSFlow.running) return false;
        try { return s.gw.readState(side).some((member: any) => member.active && member.id === id); }
        catch { return false; } // Optional appearance never invents a source or aborts legal battle control.
      },
      paint: cards => { if (c.isCurrent()) {
        this._status._d2Cards = cards.map(card => ({ ...card })); this._status.setLines([]);
        // Observe every owned, sequentially shown send-out, including A -> B -> A before another menu.
        if (c.isCurrent()) {
          const active = cards.find(card => card.side === 'p1' && card.active);
          // Single-player-seat presentation follows each published swap, including A -> B -> A.
          if (active && !cards.some(card => card !== active && card.side === 'p1' && card.active)) bindPartyDisplayActive(this, active.id);
          if (c.isCurrent()) this._menuCursor?.bindActive(active?.id ?? null);
        }
        // HP0 is published before faint presentation. Keep the owned portrait
        // until that display step actually finishes instead of inferring it from HP.
        if (c.isCurrent()) this._pictures.sync(cards.filter(card => card.active && card.portraitVisible !== false).map(card => ({ id: card.id, side: card.side, name: card.name })));
      } },
      afterPaintNow: () => performance.now(),
      cue: kind => c.isCurrent() && PSFlow.running ? battleCue(this, kind) : undefined,
      picture: (kind, actor) => {
        const step = this._pictures.step(kind, actor);
        return kind === 'damage' ? step : this.clearBriefFor(step);
      },
      faint: (actor, box) => this._pictures.faint(actor, box),
    });
    this._mode = "messages";
    // The existing controller owns the opening pause, just as it owns display steps.
    // No command or battle action is accepted until these messages and send-outs finish.
    const trainer = this._psOp?.trainerPresentation;
    if (!this._trainerOpeningQueued && this._psOp?.request.kind === 'trainer' && trainer) {
      this._trainerOpeningQueued = true;
      for (const text of [PSFlow.translator().t('trainer.challenged', { name: trainer.name }), trainer.openingText]) {
        if (!text) continue;
        for (const page of this._log.textPages(text)) {
          c.enqueue([createPausedMessageMZ(G, this, page.join('\n'),
            () => c.isCurrent() && PSFlow.running && G.SceneManager._scene === this,
            () => s.finished, () => PSFlow.fast)]);
        }
      }
    }
    c.enqueue([this._display.initial()]);
    this.pushMessages(opening, true);
    if(developmentCapabilities(PSFlow.developerCapabilities).allowExperimentalHeldItemBattle&&s.party.some((m:any)=>!!m.item))this._log.add(PSFlow.translator().t("management.experimental"));
    this.refreshStatus();
    });
  };
  P.update = function () {
    const c = sceneController(this);
    if (!Number.isSafeInteger(this._pictureUpdate) || this._pictureUpdate >= Number.MAX_SAFE_INTEGER) {
      this._pictures?.dispose(); c.fail(new Error('invalid picture Scene.update ordinal'));
    } else ++this._pictureUpdate;
    // A rejected display clock still owes normal host/input updates for its aborted-end menu.
    G.Scene_MenuBase.prototype.update.call(this);
    if (!c.isCurrent()) { retireBattleBag(this); retireBrief(this); c.dispose(); this._log.pause = false; this._endFeedbackPages = null; this._ballFeedback?.cancel(); this._backdrop?.dispose(); this._pictures?.dispose(); } else c.present(() => this._backdrop?.poll());
    // Host abort may close this owner from main/boot/pending action. tick observes closure before phase/busy gates.
    this.updateQueue();
  };

  // --- message pacing
  P.pushMessages = function (msgs: SessionMessage[], openingBatch = false) {
    const c = sceneController(this);
    c.present(() => {
      const steps: BattleScenePresentation[] = [];
      for (const message of msgs) {
        if (!c.isCurrent()) return;
        // Queue the cue after earlier faint/EXP presentation, before the victory text.
        // The same operation owns battle, victory and return; this does not end or commit it.
        const op = this._psOp;
        if (op && message.kind === 'end' && message.reason === 'caught' && op.ballFeedback && !op.ballHideQueued) {
          op.ballHideQueued = true;
          steps.push(op.ballFeedback.hide()); // after capture ME/growth; before receiving/end
        }
        if (op && message.kind === 'end' && (message.reason === 'win' && message.winner === 'Player' || message.reason === 'caught' && op.request.kind === 'wild' && this._session.captureExpGain === false) && !op.victoryQueued) {
          op.victoryQueued = true;
          let retired = false;
          steps.push({ kind: 'visual', advance: () => {
            if (!retired && c.isCurrent() && PSFlow.running && G.SceneManager._scene === this) PSFlow._victoryBattleMusic(op);
            retired = true; return true;
          }, cancel: () => { retired = true; } });
        }
        const growth = message.kind === 'growth' ? engine().B.battlePresentation.readGrowthDisplay(this._session, message) : null;
        if (this._display && message.kind === 'events') {
          let events = message.events, wildEntrance: BattleEvent | null = null;
          if (openingBatch && op?.request.kind === 'wild' && this._session.foeTeam.length === 1 && !this._wildOpeningQueued) {
            const switches = events.filter((event: BattleEvent) => event.type === 'switch');
            const player = switches.find((event: BattleEvent) => /^p1a?: /.test(event.args[0] || ''));
            const foe = switches.find((event: BattleEvent) => /^p2a?: /.test(event.args[0] || ''));
            if (switches.length === 2 && player && foe) {
              // Presentation order only. Keep the owned Session messages and all non-switch events unchanged.
              const first = events.indexOf(switches[0]);
              events = [...events.slice(0, first), foe, player, ...events.slice(first).filter((event: BattleEvent) => event !== player && event !== foe)];
              wildEntrance = foe; this._wildOpeningQueued = true;
            }
          }
          if (openingBatch && op?.request.kind === 'trainer' && !this._trainerDispatchQueued) {
            const switches = events.filter((event: BattleEvent) => event.type === 'switch');
            const player = switches.find((event: BattleEvent) => /^p1a?: /.test(event.args[0] || ''));
            const foe = switches.find((event: BattleEvent) => /^p2a?: /.test(event.args[0] || ''));
            if (switches.length === 2 && player && foe) {
              // Initial trainer dispatch is foe-first too; later switches keep their owned event order.
              const first = events.indexOf(switches[0]);
              events = [...events.slice(0, first), foe, player, ...events.slice(first).filter((event: BattleEvent) => event !== player && event !== foe)];
              this._trainerDispatchQueued = true;
            }
          }
          if (openingBatch && op?.initialField && !this._initialFieldAnnouncementsQueued) {
            const lastSwitch = events.reduce((last: number, event: BattleEvent, i: number) => event.type === 'switch' ? i : last, -1);
            if (lastSwitch >= 0) {
              const firstSwitch = events.findIndex((event: BattleEvent) => event.type === 'switch');
              const weatherId = WEATHER[op.initialField.weather as keyof typeof WEATHER], terrainId = TERRAIN[op.initialField.terrain as keyof typeof TERRAIN];
              const notices = events.filter((event: BattleEvent, i: number) => i < firstSwitch &&
                (event.type === '-weather' && weatherId && String(event.args[0]).toLowerCase().replace(/[^a-z]/g, '') === weatherId ||
                 event.type === '-fieldstart' && terrainId && String(event.args[0]).toLowerCase().replace(/^move: /, '').replace(/[^a-z]/g, '') === terrainId));
              if (notices.length) {
                events = [...events.slice(0, lastSwitch + 1).filter((event: BattleEvent) => !notices.includes(event)), ...notices, ...events.slice(lastSwitch + 1)];
                this._initialFieldAnnouncementsQueued = true;
              }
            }
          }
          for (const event of events) {
            const visuals = this._display.event(event);
            const lines = this._D.event(event), ballPlan = simpleBallPlan(event);
            if (event === wildEntrance) {
              const species = String(event.args[1] || '').split(',')[0];
              const text = PSFlow.translator().t('battle.wild_appeared', { name: PSFlow.speciesName(species) });
              steps.push(...visuals, ...this._log.textPages(text).map((page: string[]) => createPausedMessageMZ(G, this, page.join('\n'),
                () => c.isCurrent() && PSFlow.running && G.SceneManager._scene === this,
                () => this._session.finished, () => PSFlow.fast)));
              continue;
            }
            if (!PSFlow.fast && (event.type === 'switch' || event.type === 'drag')) {
              // Recall an existing member first; the next send-out starts only after its own brief is full.
              steps.push(...visuals.slice(0, -1), ...this.briefMessages(lines), ...visuals.slice(-1));
              continue;
            }
            steps.push(...visuals);
            const shownTarget = ballPlan?.target === null || this._display.snapshot().some((card: BattleDisplayCard) => card.side === 'p2' && card.id === ballPlan?.target && card.active);
            if (ballPlan && op && this._pictures && shownTarget && !(ballPlan.outcome === 'caught' && op.ballFeedback?.snapshot().plan.outcome === 'caught')) {
              const current = () => c.isCurrent() && PSFlow.running && op === PSFlow._op && G.SceneManager._scene === this;
              const ports = createBallPortsMZ(G, this, current, () => this._pictureUpdate,
                scale => this._pictures.captureScale(ballPlan.target!, scale), opacity => this._display.captureBox(ballPlan.target!, opacity));
              const stage = new BallScenePresentation(ballPlan, op.battleEffects ?? true, ports);
              this._ballFeedback = op.ballFeedback = stage;
              // Normal results publish throw text first; trainer blocking has its own result text.
              if (ballPlan.outcome !== 'blocked' && lines.length) steps.push(...this.briefMessages([lines[0]]), this.clearBriefFor(stage), ...lines.slice(1));
              else steps.push(this.clearBriefFor(stage), ...lines);
            } else steps.push(...lines);
            if (event.type === 'rpg' && event.args[0] === 'ball' && event.args[1] === 'p1' && event.args[4] === 'caught') {
              const op = this._psOp;
              if (!c.isCurrent() || !PSFlow.running || op !== PSFlow._op) return;
              if (op.request.kind === 'wild' && !op.captureMelody) {
                if (!op.musicPlan?.settings?.config) throw new Error('capture ME music context unavailable');
                const plan = captureMelodyPlan('wild', op.musicPlan.settings.config)!;
                let stage: CaptureMelodySceneStep;
                const current = () => stage?.pending() !== false && c.isCurrent() && PSFlow.running && G.SceneManager._scene === this;
                const port = createCaptureMEMZ(G, nodeRequire, engine().root, current);
                stage = new CaptureMelodySceneStep(plan, { current,
                  request: (track, startedAt) => port.request(track, startedAt) });
                this._captureMelody = op.captureMelody = stage;
                const tail = steps[steps.length - 1];
                if (!PSFlow.fast && lines.length && typeof tail === 'string' && tail === lines[lines.length - 1]) {
                  // Full Gotcha text starts the capture block on the next update;
                  // keep it visible throughout ME instead of waiting/clearing it first.
                  steps.pop();
                  steps.push(createSynchronizedMessageMZ(G, this, tail,
                    () => c.isCurrent() && PSFlow.running && G.SceneManager._scene === this, stage));
                } else steps.push(stage); // Existing test-only fast string path.
              }
            }
          }
        } else if (this._display && message.kind === 'growth' && growth?.version === 1) {
          steps.push(...this.pausedMessages(this._D.message({ ...message, exp: growth.experienceGained ?? growth.toExp - growth.fromExp, levelUps: [] })));
          for (const segment of growth.segments) {
            const animation = this._display.experience(message.member, segment); if (animation) steps.push(animation);
            if (segment.levelUp) {
              const level = this._display.growth(message.member, { toLevel: segment.levelUp.level, hp: segment.levelUp.hp, maxhp: segment.levelUp.maxhp, ratio: 0 }); if (level) steps.push(level);
              steps.push(...this.pausedMessages(this._D.message({ ...message, exp: 0, levelUps: [segment.levelUp.level] })));
              if (segment.levelUp.stats) steps.push(createLevelStatsMZ(G, this, segment.levelUp.level, segment.levelUp.stats,
                () => c.isCurrent() && PSFlow.running && G.SceneManager._scene === this, PSFlow.translator()));
              else (this._growthDisplayDiagnostics ??= []).push({ member: message.member, level: segment.levelUp.level, reason: 'legacy-projection-without-stat-snapshots' });
            }
          }
          const final = this._display.growth(message.member, growth); if (final) steps.push(final);
        } else if (message.kind === 'learn-prompt') {
          // Full-slot learning announces the pending move through the existing pause contract,
          // before the separate Yes/No question can become interactive.
          steps.push(...this._D.message(message).flatMap((line: string) => this._log.textPages(line).map((page: string[]) =>
            createPausedMessageMZ(G, this, page.join('\n'),
              () => c.isCurrent() && PSFlow.running && G.SceneManager._scene === this,
              () => this._session.finished, () => PSFlow.fast))));
        } else steps.push(...this._D.message(message));
      }
      if (c.isCurrent()) this.enqueueMessages(steps);
    });
  };
  P.briefMessages = function (lines: string[]): BattleScenePresentation[] {
    const c = sceneController(this);
    return PSFlow.fast ? lines : lines.flatMap(line => this._log.textPages(line).map((page: string[]) =>
      createBriefMessageMZ(G, this, page.join('\n'),
        () => c.isCurrent() && PSFlow.running && G.SceneManager._scene === this, () => PSFlow.fast)));
  };
  P.pausedMessages = function (lines: string[]): BattleScenePresentation[] {
    const c = sceneController(this);
    return PSFlow.fast ? lines : lines.flatMap(line => this._log.textPages(line).map((page: string[]) =>
      createPausedMessageMZ(G, this, page.join('\n'),
        () => c.isCurrent() && PSFlow.running && G.SceneManager._scene === this,
        () => this._session.finished, () => PSFlow.fast)));
  };
  P.clearBriefFor = function (step: Exclude<BattleScenePresentation, string>) {
    return { kind: 'visual', advance: (now: number) => {
      this._residentBrief?.clearBrief(); // clear only when this animation actually runs, never while planning it
      return step.advance(now);
    }, cancel: () => step.cancel() };
  };
  function retireBrief(scene: any): void {
    // Lifecycle seams may be borrowed by a minimal host object, before Scene initialization.
    const resident = scene._residentBrief, tail = scene._briefTail;
    scene._briefTail = null;
    resident?.cancel(); if (tail !== resident) tail?.cancel();
  }
  P.briefMessageState = function () { return this._residentBrief?.snapshot() ?? null; };
  /** Every owned text entry passes the previous brief's replacement gate; arbitrary animations do not. */
  P.enqueueMessages = function (steps: BattleScenePresentation[]) {
    const c = sceneController(this);
    const queued: BattleScenePresentation[] = [];
    for (const raw of steps) {
      const step = typeof raw === 'string' && !PSFlow.fast
        ? createOrdinaryMessageMZ(G, this, raw, () => c.isCurrent() && PSFlow.running && G.SceneManager._scene === this) : raw;
      if (typeof step === 'string' || isMessageStepMZ(step)) {
        if (this._briefTail) queued.push(this._briefTail.beforeNextMessage());
        this._briefTail = step instanceof BriefMessageStep ? step : null;
      }
      queued.push(step);
    }
    c.enqueue(queued); // Explicit test-only fast strings retain their existing no-pacing contract.
  };
  P.ordinaryMessageState = function () { return this._ordinaryMessage?.snapshot() ?? null; };
  P.updateQueue = function () {
    const c = sceneController(this);
    if (!c.isCurrent() || !PSFlow.running) { retireBattleBag(this); retireBrief(this); this._ballFeedback?.cancel(); this._display?.dispose(); this._pictures?.dispose(); }
    c.tick(G.Input.isTriggered('ok'), PSFlow.fast ? 0 : 24);
  };
  P.ballFeedbackState = function () { return this._ballFeedback?.snapshot() ?? null; };
  P.afterMessages = function () {
    const retryMoves = this._retryMoveMenu, retryParty = this._retryPartySelection, automaticMove = this._automaticMove;
    this._retryMoveMenu = false; this._retryPartySelection = null; this._automaticMove = null;
    if (this._failure) { this.showEnd(true); return; }
    const s = activeSession(this);
    if (engine().B.session?.readLearnedMessagePending?.(s)) {
      // The ordinary learned message has fully returned. Resume through the same action owner,
      // before later growth, foe replacement or the end menu can become interactive.
      if (sceneController(this).show('learning-sync')) this.act(() => engine().B.session.completeLearnedMessage(s), 'learning');
      return;
    }
    if (s.finished) { this.showEnd(false); return; }
    if (s.pendingLearn && this._learningGiveUp?.pending === s.pendingLearn) {
      const tr = PSFlow.translator();
      this.show('learn-giveup', [{ name: tr.t('progression.yes'), ext: 'give-up' }, { name: tr.t('progression.no'), ext: 'continue-learning' }]);
      this._learningGiveUpShownUpdate = this._pictureUpdate;
      return;
    }
    this._learningGiveUp = null;
    if (s.pendingLearn) {
      if (this._learningInitial?.pending !== s.pendingLearn) { this.askLearningInitial(); return; }
      if (this._learningInitial.accepted) {
        const retry = this._learningRetry; this._learningRetry = null;
        this.showLearn(retry?.pending === s.pendingLearn ? retry.slot : 0);
      }
      else {
        const tr = PSFlow.translator();
        this.show('learn-initial', [{ name: tr.t('progression.yes'), ext: 'forget-move' }, { name: tr.t('progression.no'), ext: 'decline-learning' }]);
        if (sceneController(this).isCurrent()) this._learningInitialShownUpdate = this._pictureUpdate;
      }
      return;
    }
    this._learningInitial = null;
    this._learningRetry = null;
    const offer = engine().B.session?.readTrainerReplacement?.(s) ?? null;
    if (offer) {
      if (this._replacementQuestion?.session !== s || this._replacementQuestion.offerId !== offer.offerId) {
        const tr = PSFlow.translator();
        this._replacementQuestion = { session: s, offerId: offer.offerId, selecting: false, lines: [...this._log._lines], view: offer };
        this.enqueueMessages([createBriefMessageMZ(G, this, tr.t('ui.replacement.question', {
          trainer: this._psOp?.trainerPresentation?.name ?? tr.t('ui.who.foe'), species: PSFlow.speciesName(offer.opponentSpecies),
        }), () => sceneController(this).isCurrent() && PSFlow.running && G.SceneManager._scene === this, () => PSFlow.fast)]);
        return;
      }
      if (this._replacementQuestion.selecting) this.showParty('replacement', retryParty?.memberId ?? null);
      else {
        const tr = PSFlow.translator();
        this.show('replacement-question', [{ name: tr.t('progression.yes'), ext: 'replace-yes' }, { name: tr.t('progression.no'), ext: 'replace-no' }]);
        this._replacementShownUpdate = this._pictureUpdate;
      }
      return;
    }
    this._replacementQuestion = null;
    const req = s.currentRequest();
    if (req && req.forceSwitch) {
      const active = s.gw.readState('p1').find((m: any) => m.id === s.gw.activeId('p1'));
      if (s.foe.kind === 'wild' && req.forceSwitch[0] && active?.fainted) {
        const request = JSON.stringify(req);
        if (this._wildFaintQuestion?.session !== s || this._wildFaintQuestion?.request !== request) {
          this._wildFaintQuestion = { session: s, request, answered: false, lines: [...this._log._lines] };
          this.enqueueMessages([createBriefMessageMZ(G, this, PSFlow.translator().t('ui.wild.use_next'),
            () => sceneController(this).isCurrent() && PSFlow.running && G.SceneManager._scene === this, () => PSFlow.fast)]);
          return;
        }
        if (!this._wildFaintQuestion.answered) {
          const tr = PSFlow.translator();
          this.show('wild-faint', [{ name: tr.t('progression.yes'), ext: 'next' }, { name: tr.t('progression.no'), ext: 'escape' }]);
          this._wildFaintShownUpdate = this._pictureUpdate;
          return;
        }
      }
      this.showParty("forced", retryParty?.memberId ?? null); return;
    }
    this._wildFaintQuestion = null;
    if (automaticMove && automaticMove.session === s && automaticMove.request === JSON.stringify(req)) {
      // The notice is a visual step only. Submit after it leaves the queue, through the normal action owner.
      if (sceneController(this).show('automatic-move')) this.act(() => s.chooseMove(1), 'move');
      return;
    }
    if (this._bagFadeReturn) { this._bagFadeReturn = false; this.showBattleBagView(); return; }
    if (this._bagRetry && this._battleBag?.view().kind !== 'closed') { this._bagRetry = false; this.showBattleBagView(); return; }
    if (retryMoves && req?.active?.[0]?.moves?.length) { this.showMoves(); return; }
    if (retryParty && req?.active) { this.showParty("switch", retryParty.memberId); return; }
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
    const menu = mode === 'learn' && this._learningMenu ? this._learningMenu : this._commandMenu ?? this._menu;
    if (this._menu !== menu) { this._menu.deactivate(); this._menu.hide(); this._menu = menu; }
    this._menu._phase = mode;
    this._menu.setItems(items);
    if (c.isCurrent() && this._menuCursor && (mode === 'main' || mode === 'moves')) {
      const active = this._display?.snapshot().find((member: BattleDisplayCard) => member.side === 'p1' && member.active);
      this._menuCursor.bindActive(active?.id ?? null);
      this._menu.select(this._menuCursor.index(mode, items.length));
      this._menu.ensureCursorVisible?.(false);
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
  /** Strict observer only. Normal player input and the legacy DTO do not depend on this capability. */
  P.requestObservationState = function () {
    const unavailable = (reason: string) => { requestObservers.delete(this); return { status: 'unavailable', reason }; };
    const session = this._session, op = PSFlow._op, app = PSFlow._app, generation = app?.stateGeneration;
    const current = () => !!op && !!app && PSFlow.running && this._psOp === op && op.session === session
      && PSFlow._op === op && PSFlow._app === app && app.stateGeneration === generation
      && this._session === session && G.SceneManager._scene === this && sceneController(this).isCurrent();
    if (!app || generation === undefined || !current()) return unavailable('request-observer-owner-retired');
    const input = this.inputState();
    // Project host/menu callbacks first, then read the Session pair once. A synchronous restore
    // during maxCols/canChoose must not let a previously read epoch escape as current.
    const context = engine().B.session.readSessionRequestContext(session);
    if (!current()) return unavailable('request-observer-owner-changed');
    if (context.status !== 'available') { requestObservers.delete(this); return { ...context, current: true, sceneKind: 'battle' }; }
    let owner = requestObservers.get(this);
    if (!owner || owner.op !== op || owner.app !== app || owner.generation !== generation || owner.session !== session || owner.epoch !== context.requestViewEpoch) {
      const serial = ++requestObserverSerial;
      if (!Number.isSafeInteger(serial)) return unavailable('request-observer-capacity');
      owner = { op, app, generation, session, epoch: context.requestViewEpoch, token: `forced-view/${serial}`, menu: null, menuRevision: 0 };
      requestObservers.set(this, owner);
    }
    if (owner.menu !== this._menu?._items) { owner.menu = this._menu?._items; owner.menuRevision++; }
    return { ...input, ...context, current: true, sceneKind: 'battle', ownerToken: owner.token,
      menuToken: `${owner.token}/${owner.menuRevision}`, fast: PSFlow.fast, effects: op.battleEffects === true,
      partySub: this._partySub ?? null, selectedMemberId: this._partySelected ?? null };
  };
  P.presentationState = function () {
    const c = sceneController(this);
    return { version: 'd2-status-v1', current: c.isCurrent(), cards: this._display?.snapshot() || [],
      pending: c.queue.filter(step => typeof step !== 'string').length, audio: (this._displayAudio || []).map((row: any) => ({ ...row })),
      faintAudio: (this._faintAudio || []).map((row: any) => ({ ...row })) };
  };
  P.levelStatsState = function () { const page = this._levelStatsWindow?._levelStatsPage; return page ? { ...page, rows: page.rows.map((row: any) => ({ ...row })) } : null; };
  P.statusCardState = function () {
    const c = sceneController(this);
    return c.isCurrent() && PSFlow.running && G.SceneManager._scene === this ? this._status?.statusCardViews?.() ?? [] : [];
  };
  P.pictureState = function () { return this._pictures?.snapshot() ?? null; };
  P.captureMelodyState = function () { return this._captureMelody?.snapshot() ?? null; };
  P.showMain = function () {
    const automatic = this._session.gw?.query?.('p1', 'automatic-locked');
    if (automatic?.allowed && automatic.moveSlot === 1) {
      // The engine already published a forced continuation, so there is no command menu this turn.
      if (sceneController(this).show('automatic-move')) this.act(() => activeSession(this).chooseMove(1), 'move');
      return;
    }
    const tr = PSFlow.translator();
    this.show("main", [
      { name: tr.t("ui.menu.fight"), ext: "fight" }, { name: tr.t("ui.menu.bag"), ext: "bag" }, { name: tr.t("ui.menu.party"), ext: "party" }, { name: tr.t("ui.menu.run"), ext: "run" },
    ]);
  };
  P.showMoves = function () {
    const session = sceneController(this).session;
    const req = session?.currentRequest();
    if (!session || !req?.active?.[0]) return;
    const moves = req.active[0].moves;
    const tr = PSFlow.translator(), checked = PSFlow.content().meta?.showdownSourceChecked;
    // Pinned Gen8 Showdown publishes this PP-less fallback only when no move can be chosen.
    // A normal one-move request (including an authored Struggle with PP) still opens the menu.
    if (moves.length === 1 && moves[0].id === 'struggle' && moves[0].pp === undefined && !moves[0].disabled) {
      const c = sceneController(this), s = this._session, id = s.gw.activeId('p1');
      if (!c.isCurrent()) return;
      this._automaticMove = { session: s, request: JSON.stringify(req) };
      const text = tr.t('ui.moves.none-left', { name: this._names[id] ?? id });
      c.enqueue(PSFlow.fast ? [text] : this._log.textPages(text).map((page: string[]) =>
        createPausedMessageMZ(G, this, page.join('\n'),
          () => c.isCurrent() && PSFlow.running && G.SceneManager._scene === this,
          () => s.finished, () => PSFlow.fast)));
      return;
    }
    const encore = session.gw?.query?.('p1', 'automatic-encore');
    const encoreSlot = encore?.moveSlot;
    if (encore?.allowed && typeof encoreSlot === 'number' && Number.isSafeInteger(encoreSlot) && encoreSlot > 0 && encoreSlot <= moves.length
      && engine().B.moveRequests.isSelectableMove(moves[encoreSlot - 1])) {
      // In singles the pinned request already identifies the target; use the ordinary action owner.
      this.act(() => session.chooseMove(encoreSlot), 'move');
      return;
    }
    this.show("moves", moves.map((m, i: number) => ({
      name: m.pp === undefined ? m.move : PSFlow.translator().t("ui.moves.line", { move: m.move, pp: m.pp, maxpp: m.maxpp }),
      moveView: (() => {
        // Published names preserve Gen8 display variants such as Hidden Power Ice.
        const data = checked ? PSFlow._dex?.moveDetails?.(m.move) ?? PSFlow._dex?.moveDetails?.(m.id) : null;
        const type = data?.type ?? null;
        return moveChoice(m.move, type, type ? tr.tOr(`pokedex.type.${type}`, type) : '?', m.pp, m.maxpp);
      })(),
      // The menu offers a candidate; the Session/simulator accepts or rejects it.
      ext: i + 1, enabled: true,
    })));
  };
  function restoreBagView(scene: any): void {
    scene._bagLayer = 'battle';
    const hidden = scene._bagHidden; scene._bagHidden = null;
    if (!hidden || !sceneController(scene).ownsHost() || G.SceneManager._scene !== scene) return;
    for (const row of hidden) row.node.visible = row.visible;
  }
  function retireBattleBag(scene: any): void {
    scene._bagFadeReturn = false; scene._bagFade?.cancel(); scene._bagFade = null;
    scene._battleBag?.retire(); scene._bagRetry = false; restoreBagView(scene);
  }
  P.showBag = function () {
    const c = sceneController(this), s = this._session;
    if (!c.isCurrent()) return;
    const model = this._battleBag ??= new BattleBagSelection(), catalog = catalogOf(s.content);
    if (model.view().kind === 'closed') {
      // Real App-owned battles have the host document (including eggs). The existing direct-Session host seam may not.
      const saved = G.$gameSystem?._psGame ? PSFlow.game().party : s.party, party = saved?.length ? saved : s.party;
      const members = party.map((saved: any) => {
        const member = s.party.find((m: any) => m.id === saved.id) ?? saved;
        return { memberId: member.id, egg: member.isEgg === true, moves: (member.moves ?? []).map((m: any, slot: number) => ({ slot, moveId: m.id })) };
      });
      const ids = new Set(members.map((m: any) => m.memberId));
      const activeIds = s.gw.readState('p1').filter((m: any) => m.active && ids.has(m.id)).map((m: any) => m.id);
      const foes = battleBagFoes(this);
      // The current formal StartBattle entry binds internalBattle=true; facility/non-internal entry is not implemented.
      model.open({ internalBattle: true, actorId: activeIds[0] ?? members.find((m: any) => !m.egg)?.memberId,
        members, activeIds, foeIds: foes.filter((m: any) => m.side === 'p2' && m.active && m.hp > 0).map((m: any) => m.id),
        items: Object.entries(s.bag).map(([battleId, quantity]) => {
          const item = itemForBattleId(catalog, battleId); if (!item) throw new Error('unmapped battle bag item: ' + battleId);
          return { itemId: item.id, battleId, quantity: quantity as number, pocket: item.pocket, battleUse: item.battleUse };
        }) });
    }
    this.showBattleBagView();
  };
  function battleBagFoes(scene: any): any[] {
    return scene._display?.snapshot() ?? scene._session.gw.readState('p2').map((m: any) => ({ ...m, side: 'p2' }));
  }
  P.battleBagState = function () { return this._battleBag?.view() ?? null; };
  P.battleBagTransitionState = function () { return sceneController(this).isCurrent() ? this._bagFade?.snapshot() ?? null : null; };
  P.showBattleBagView = function () {
    const c = sceneController(this), view = this._battleBag?.view();
    if (!c.isCurrent() || !view || view.kind === 'submitting' || this._bagFadeReturn) return;
    const layer = view.kind === 'closed' ? 'battle' : view.kind === 'items' || view.kind === 'commands' ? 'bag' : 'target';
    if (!PSFlow.fast && layer !== this._bagLayer) {
      this._bagFadeReturn = true;
      const current = () => c.isCurrent() && PSFlow.running && G.SceneManager._scene === this;
      this._bagFade = createBagFadeMZ(G, this, current, () => this._pictureUpdate, () => {
        this._bagLayer = layer; this.renderBattleBagView();
        if (current()) { c.show('messages'); this._menu.deactivate(); }
      });
      const menu = this._menu, outgoingVisible = menu.visible;
      if (c.enqueue([this._bagFade]) && current() && outgoingVisible) {
        menu.show(); menu.deactivate(); // Keep the outgoing content painted while the queue still owns all input.
      }
      return;
    }
    this._bagLayer = layer; this.renderBattleBagView();
  };
  P.renderBattleBagView = function () {
    const c = sceneController(this), model = this._battleBag; if (!c.isCurrent() || !model) return;
    const view = model.view(); if (view.kind === 'closed') { restoreBagView(this); this.showMain(); return; }
    if (view.kind === 'submitting') return;
    if (!this._bagHidden) {
      const nodes = new Set([this._status, this._log, ...(this.children ?? []).filter((n: any) => n !== this._windowLayer && n !== this._menu && !n._psBagFade)]);
      this._bagHidden = [...nodes].filter(Boolean).map(node => ({ node, visible: (node as any).visible }));
      for (const row of this._bagHidden) { if (!c.isCurrent()) return; row.node.visible = false; }
    }
    const tr = PSFlow.translator(), catalog = catalogOf(this._session.content);
    const itemName = (item: any) => {
      const data = catalog[item.itemId], authored = data?.name && data.name !== 'Unnamed' ? data.name : null;
      return data?.nameKey ? tr.tOr(data.nameKey, authored ?? item.itemId) : authored ?? tr.tOr(`item.name.${item.battleId}`, item.itemId);
    };
    const cancel = { name: tr.t('ui.battlebag.cancel'), ext: null };
    let phase: string, items: any[];
    if (view.kind === 'items') {
      phase = 'bag'; const pocket = tr.t('inventory.pocket.' + view.pocket);
      items = [...view.rows.map((item: any) => ({ name: pocket + ' · ' + tr.t('ui.bag.entry', { name: itemName(item), count: item.quantity }), ext: item.itemId })),
        { name: tr.t('ui.battlebag.cancelPockets', { pocket }), ext: null }];
    } else if (view.kind === 'commands') {
      phase = 'bag-command'; items = [{ name: tr.t('ui.battlebag.use', { name: itemName(view.item) }), ext: 'use' }, cancel];
    } else if (view.kind === 'members') {
      phase = 'bag-members'; const live = this._session.gw.readState('p1');
      items = [...view.rows.map((member: any) => { const data = live.find((m: any) => m.id === member.memberId), mon = this._session.party.find((m: any) => m.id === member.memberId);
        return { name: member.egg ? tr.t('inventory.egg') : tr.t('ui.party.entry', { name: mon ? playerBattleName(mon) : member.memberId,
          level: data?.level ?? mon?.level ?? '?', hp: data?.hp ?? 0, maxhp: data?.maxhp ?? 0, fainted: data?.fainted ? tr.t('ui.party.fainted') : '', active: data?.active ? tr.t('ui.party.active') : '', noEffect: '' }),
          ext: member.memberId, enabled: !member.egg }; }), cancel];
    } else if (view.kind === 'moves') {
      phase = 'bag-moves'; const mon = this._session.party.find((m: any) => m.id === view.memberId), live = this._session.gw.readState('p1').find((m: any) => m.id === view.memberId);
      items = [...view.rows.map((move: any) => ({ name: tr.t('ui.moves.line', { move: move.moveId, pp: live?.pp?.[move.moveId] ?? mon?.moves[move.slot]?.pp ?? '?', maxpp: mon?.moves[move.slot]?.maxpp ?? '?' }), ext: move.slot })), cancel];
    } else { phase = 'bag-foes'; items = [...view.rows.map((id: string) => ({ name: this._names[id] ?? id, ext: id })), cancel]; }
    this.show(phase, items); if (!c.isCurrent()) return;
    this._menu.select(view.cursor); this._bagShownUpdate = this._pictureUpdate;
  };
  P.changeBagPocket = function (delta: number) {
    sceneController(this).input(() => {
      if (this._battleBag?.view().kind !== 'items') return;
      this._battleBag.select(this._menu.index()); this._battleBag.move(delta < 0 ? 'left' : 'right');
      this.showBattleBagView(); G.SoundManager.playCursor?.();
    });
  };
  P.confirmBattleBag = function () {
    const model = this._battleBag; if (!model) return;
    if (model.view().kind === 'commands' && Number.isSafeInteger(this._pictureUpdate) && this._pictureUpdate === this._bagShownUpdate) { this._menu.activate(); return; }
    model.select(this._menu.index()); const request: BattleBagRequest | null = model.confirm();
    if (!request) { this.showBattleBagView(); return; }
    const c = sceneController(this), s = this._session, kind = BALLS.includes(request.battleId) ? 'ball' : 'item';
    c.run(async () => {
      const target = request.target;
      if (target.kind === 'foe' && BALLS.includes(request.battleId)) {
        // Selection uses the current public appearance, which can be an Illusion alias.
        // The Session resolves the actual capture target and all spending/turn rules.
        if (!battleBagFoes(this).some((foe: any) => foe.side === 'p2' && foe.active && foe.hp > 0 && foe.id === target.memberId)) return { ok: false, reason: 'unknown-target' };
        return s.throwBall(request.battleId);
      }
      if (target.kind === 'move') {
        if (!Object.hasOwn(PP_ITEMS, request.battleId) || PP_ITEMS[request.battleId]!.all) return { ok: false, reason: 'unsupported-battle-item' };
        if (s.party.find((m: any) => m.id === target.memberId)?.moves[target.slot]?.id !== target.moveId) return { ok: false, reason: 'unknown-target' };
        const eligible = s.canUseItem(request.battleId, target.memberId, target.slot); if (!eligible.ok) return eligible;
        return s.useItem(request.battleId, target.memberId, { moveSlot: target.slot });
      }
      if (target.kind === 'direct') {
        if (!ESCAPE_ITEMS.includes(request.battleId)) return { ok: false, reason: 'unsupported-battle-item' };
        if (s.gw.activeId('p1') !== target.memberId) return { ok: false, reason: 'unknown-target' };
        const eligible = s.canUseItem(request.battleId, target.memberId); if (!eligible.ok) return eligible;
        return s.useItem(request.battleId, target.memberId);
      }
      if (target.kind !== 'member' && target.kind !== 'active') return { ok: false, reason: 'unsupported-battle-item' };
      if (target.kind === 'active' && !s.gw.readState('p1').some((m: any) => m.id === target.memberId && m.active)) return { ok: false, reason: 'unknown-target' };
      const eligible = s.canUseItem(request.battleId, target.memberId); if (!eligible.ok) return eligible;
      return s.useItem(request.battleId, target.memberId); // actual reservation/registration and execution, not a positive query
    }, (result: any) => {
      if (typeof result?.ok !== 'boolean') throw new Error('invalid battle bag registration result');
      if (!model.resolve(request, { ok: result.ok })) return;
      restoreBagView(this);
      if (!result.ok) {
        this._bagRetry = true;
        this.enqueueMessages([result.reason === 'unsupported-battle-item' ? PSFlow.translator().t('ui.battlebag.unsupported') : refusalText(kind, result.reason)]);
      } else {
        this._bagRetry = false;
        if (!Array.isArray(result.messages)) throw new Error('unexpected staged battle bag action');
        this.pushMessages(result.messages);
      }
    }, kind);
  };
  // Session intentionally excludes Eggs. Only the current application's own Eggs are display-only rows;
  // participating members retain the Session record and stable battle identity, never a display index.
  const partyForDisplay = (scene: any): any[] => {
    const party = scene._session.party, byId = new Map(party.map((m: any) => [m.id, m]));
    let rows = party;
    try {
      const saved = PSFlow.game().party;
      if (Array.isArray(saved) && party.every((m: any) => saved.some((own: any) => own?.id === m.id))) {
        rows = saved.flatMap((own: any) => byId.has(own?.id) ? [byId.get(own.id)] : own?.isEgg === true ? [own] : []);
      }
    } catch { /* Existing fallback: participating records, never invented Egg data. */ }
    const order: string[] | null = scene._partyDisplayOrder;
    if (!order) return rows;
    const known = new Map(rows.map((member: any) => [member.id, member])), ranked = new Set(order);
    return [...order.flatMap(id => known.has(id) ? [known.get(id)] : []), ...rows.filter((member: any) => !ranked.has(member.id))];
  };
  // A Scene-owned view of natural party ranks. It never sorts/mutates saved or Session members.
  const bindPartyDisplayActive = (scene: any, memberId: string): void => {
    const order: string[] = scene._partyDisplayOrder ??= partyForDisplay(scene).map((member: any) => member.id);
    const at = order.indexOf(memberId);
    if (at > 0) [order[0], order[at]] = [order[at]!, order[0]!];
  };
  P.showParty = function (sub: string, selected: string | null = null) {
    this._partySub = sub; this._partySelected = selected;
    if (sub === 'replacement') this._replacementListShownUpdate = this._pictureUpdate;
    const s = this._session;
    const live = Object.fromEntries(s.gw.readState("p1").map((x: any) => [x.id, x]));
    const items = (sub === "item" ? s.party : partyForDisplay(this)).map((m: any) => {
      const x = live[m.id];
      // an item that could not do anything is refused before it is registered (WP28 3.5): grey the target out
      const can = sub === "item" ? s.canUseItem(this._pendingItem, m.id).ok : true;
      const tr = PSFlow.translator();
      if (m.isEgg) return { name: tr.t("management.egg"), ext: m.id, enabled: true };
      return { name: tr.t("ui.party.entry", { name: playerBattleName(m), level: x?.level ?? m.level, hp: x?.hp ?? 0, maxhp: x?.maxhp ?? 0,
        fainted: x?.fainted ? tr.t("ui.party.fainted") : "", active: x?.active ? tr.t("ui.party.active") : "", noEffect: sub === "item" && !can ? tr.t("ui.party.no_effect") : "" }), ext: m.id, enabled: can };
    });
    if (sub !== 'item') items.push({ name: PSFlow.translator().t('ui.party.cancel'), ext: null, enabled: true });
    this.show(sub === "forced" ? "party-forced" : "party", items);
    if (selected !== null && sceneController(this).isCurrent()) this._menu.select(Math.max(0, items.findIndex((item: any) => item.ext === selected)));
  };
  P.answerTrainerReplacement = function (replace: boolean) {
    const c = sceneController(this), q = this._replacementQuestion;
    if (!c.isCurrent() || this._mode !== 'replacement-question' || !q) return;
    if (this._pictureUpdate === this._replacementShownUpdate) { this._menu.activate(); return; }
    const view = engine().B.session.readTrainerReplacement(this._session);
    if (!view || view.offerId !== q.offerId || q.session !== this._session) { this._replacementQuestion = null; this.afterMessages(); return; }
    retireBrief(this); this._log.setLines(q.lines);
    if (replace) { q.selecting = true; this.showParty('replacement'); }
    else this.resolveTrainerReplacement(null);
  };
  P.resolveTrainerReplacement = function (memberId: string | null) {
    const c = sceneController(this), q = this._replacementQuestion, s = this._session, ports = engine().B.session;
    if (!c.isCurrent() || !q || q.session !== s) return;
    const view = ports.readTrainerReplacement(s);
    if (!view || view.offerId !== q.offerId) { this._replacementQuestion = null; this.afterMessages(); return; }
    if (memberId !== null) {
      const allowed = ports.readTrainerReplacementTarget(s, q.offerId, memberId);
      if (!allowed.ok) {
        this._retryPartySelection = { memberId };
        const tr = PSFlow.translator(), active = s.gw.readState('p1').find((m: any) => m.id === memberId)?.active;
        const key = allowed.reason === 'trapped' ? 'refusal.switch.trapped' : active ? 'refusal.switch.already-active' : 'refusal.default';
        this.enqueueMessages([tr.t(key, { name: this._names[allowed.reason === 'trapped' ? view.playerId : memberId], reason: allowed.reason })]);
        return;
      }
    }
    retireBrief(this);
    c.run(() => ports.resolveTrainerReplacement(s, q.offerId, memberId), (result: any) => {
      this._replacementQuestion = null;
      if (!result?.ok) { this.enqueueMessages([refusalText('switch', result?.reason ?? 'choice-rejected')]); return; }
      this.pushMessages(result.messages);
    }, 'switch');
  };
  P.answerWildFaint = function (useNext: boolean) {
    const c = sceneController(this), q = this._wildFaintQuestion, s = this._session;
    if (!c.isCurrent() || this._mode !== 'wild-faint' || !q || q.answered) return;
    if (Number.isSafeInteger(this._pictureUpdate) && this._pictureUpdate === this._wildFaintShownUpdate) { this._menu.activate(); return; }
    if (q.session !== s || q.request !== JSON.stringify(s.currentRequest())) { this._wildFaintQuestion = null; this.afterMessages(); return; }
    q.answered = true; retireBrief(this); this._log.setLines(q.lines);
    if (useNext) this.showParty('forced');
    else this.act(() => s.run({ duringReplacement: true }), 'run');
  };
  P.showPartyCommands = function (memberId: string) {
    const c = sceneController(this); if (!c.isCurrent()) return;
    const member = partyForDisplay(this).find((m: any) => m.id === memberId), live = this._session.gw.readState('p1').find((m: any) => m.id === memberId);
    if (!member || (!member.isEgg && !live)) { this.showParty(this._partySub); return; }
    this._partySelected = memberId;
    const tr = PSFlow.translator(), items: any[] = [];
    if ((this._session.canSwitch !== false || this._partySub === 'forced') && !member.isEgg && live?.hp > 0 && !live.fainted) items.push({ name: tr.t('ui.party.switch_in'), ext: 'switch-in' });
    items.push({ name: tr.t('management.summary'), ext: 'summary' });
    items.push({ name: tr.t('ui.party.cancel'), ext: null });
    this.show('party-command', items);
    if (c.isCurrent()) this._partyCommandShownUpdate = this._pictureUpdate;
  };
  P.showPartySummary = function (memberId: string) {
    const c = sceneController(this), session = this._session;
    if (!c.isCurrent()) return;
    if (typeof W.PSManagement?.attachBattleSummary !== 'function') {
      this._retryPartySelection = { memberId };
      this.enqueueMessages([PSFlow.translator().t('management.unavailable')]); return;
    }
    let child: any = null;
    c.enqueue([{ kind: 'visual', advance: () => {
      if (!child) {
        const B = engine().B, game = PSFlow.game(), app = PSFlow.app();
        const makeView = (member: any) => {
          if (member.isEgg) return app.describeIndividual(member.id);
          const state = B.battlePresentation.readBattleSummary(session, member.id);
          if (!state) throw Error('battle-summary-state-unavailable');
          const { stats, heldItemKnown, id: _id, ...dynamic } = state;
          const own = { ...app.describeIndividual(member.id).member, ...dynamic };
          const view = B.app.individualView(own, game, session.content, PSFlow._dex ?? undefined);
          view.stats = stats; view.heldItemKnown = heldItemKnown;
          if (!heldItemKnown) view.diagnostics.push('battle-held-unavailable');
          return view;
        };
        const views = partyForDisplay(this).map(makeView);
        if (!c.isCurrent() || !PSFlow.running || this._session !== session) return true;
        const isCurrent = () => c.isCurrent() && PSFlow.running && this._session === session;
        child = W.PSManagement.attachBattleSummary(this, memberId, { views, isCurrent,
          swapMoves: async (id: string, from: number, to: number, expectedOrder: string[]) => {
            if (!isCurrent()) return null;
            if (!await B.session.reorderBattleSummaryMoves(session, id, from, to, expectedOrder) || !isCurrent()) return null;
            return makeView(session.party.find((member: any) => member.id === id));
          } }, (id: string) => {
            if (c.isCurrent()) this._retryPartySelection = { memberId: id };
          });
      }
      child.update(); return child.closed;
    }, cancel: () => { child?.dispose(); } }]);
  };
  P.askLearningInitial = function () {
    const c = sceneController(this), pending = this._session.pendingLearn;
    if (!c.isCurrent() || !pending) return;
    const m = this._session.party.find((member: any) => member.id === pending.memberId), tr = PSFlow.translator();
    const name = m.nickname || PSFlow.speciesName(m.species);
    this._learningInitial = { pending, accepted: false, lines: [...this._log._lines], declined: tr.t('ui.learn.not_learned', { name, move: pending.move.name }) };
    this.enqueueMessages([createBriefMessageMZ(G, this, tr.t('ui.learn.should_forget', { name, move: pending.move.name }),
      () => c.isCurrent() && PSFlow.running && G.SceneManager._scene === this, () => PSFlow.fast)]);
  };
  P.answerLearningInitial = function (accept: boolean) {
    const c = sceneController(this), question = this._learningInitial, session = this._session;
    if (!c.isCurrent() || this._mode !== 'learn-initial' || !question) return;
    if (Number.isSafeInteger(this._pictureUpdate) && this._pictureUpdate === this._learningInitialShownUpdate) { this._menu.activate(); return; }
    retireBrief(this);
    if (session.pendingLearn !== question.pending) { this._learningInitial = null; this.afterMessages(); return; }
    if (accept) { question.accepted = true; this._log.setLines(question.lines); this.showLearn(); return; }
    this._learningInitial = null;
    c.run(() => session.decideLearn(null), (messages: unknown) => {
      if (!Array.isArray(messages)) throw new Error('invalid learning decision messages');
      this.enqueueMessages([question.declined]);
      this.pushMessages(messages);
    }, 'learn');
  };
  P.showLearn = function (selected = 0) {
    const c = sceneController(this), p = this._session.pendingLearn;
    if (!c.isCurrent() || !p) return;
    this._learningGiveUp = null;
    const m = this._session.party.find((x: any) => x.id === p.memberId), tr = PSFlow.translator();
    const move = (id: string) => PSFlow.app().describeLearningMove(id);
    const name = (id: string) => tr.tOr('move.name.' + id, move(id)?.name ?? id);
    if (!this._learningMenu) {
      this._learningMenu = createMoveSelectionWindow(G, new G.Rectangle(0, 0, G.Graphics.boxWidth, G.Graphics.boxHeight), {
        font: tr.font(), text: (key, params) => tr.t('progression.' + key, params), textOr: (key, fallback) => tr.tOr(key, fallback), move,
      });
      this._learningMenu.setHandler('ok', this.onMenuOk.bind(this));
      this._learningMenu.setHandler('cancel', this.onMenuCancel.bind(this));
      this.addWindow(this._learningMenu);
    }
    this._learningMenu.page = { kind: 'moves', title: tr.t('progression.chooseMove', { move: name(p.move.id) }), cursor: selected,
      rows: [...m.moves.map((mv: any, i: number) => ({ key: String(i), text: name(mv.id), details: `${mv.pp}/${mv.maxpp} PP`, moveId: mv.id })),
        { key: 'new', text: name(p.move.id), details: tr.t('progression.keepOld'), moveId: p.move.id }] };
    this.show('learn', this._learningMenu.page.rows.map((row: any, i: number) => ({ name: row.text, ext: i < m.moves.length ? i : null })));
    if (c.isCurrent()) this._menu.select(Math.max(0, Math.min(selected, m.moves.length)));
  };
  P.learningMoveState = function () {
    const c = sceneController(this), win = this._learningMenu;
    return c.isCurrent() && this._mode === 'learn' && win?.visible
      ? { page: structuredClone(win.page), text: [...win.rendered] } : null;
  };
  P.chooseLearningSlot = function (slot: number) {
    const c = sceneController(this), pending = this._session.pendingLearn;
    if (!c.isCurrent() || !pending) return;
    const protection = engine().B.battlePresentation.readBattleLearnProtection(this._session, slot);
    if (protection) {
      this._learningRetry = { pending, slot };
      this.enqueueMessages([PSFlow.translator().t('progression.hm-protected')]);
      return;
    }
    this.act(async () => ({ ok: true, messages: await activeSession(this).decideLearn(slot) }), 'learn');
  };
  P.askLearningGiveUp = function () {
    const c = sceneController(this), pending = this._session.pendingLearn;
    if (!c.isCurrent() || !pending) return;
    const m = this._session.party.find((member: any) => member.id === pending.memberId), tr = PSFlow.translator();
    this._learningGiveUp = { pending, cursor: this._menu.index(), lines: [...this._log._lines],
      declined: tr.t('ui.learn.not_learned', { name: m.nickname || PSFlow.speciesName(m.species), move: pending.move.name }) };
    this.enqueueMessages([createBriefMessageMZ(G, this, tr.t('ui.learn.give_up', { move: pending.move.name }),
      () => c.isCurrent() && PSFlow.running && G.SceneManager._scene === this, () => PSFlow.fast)]);
  };
  P.answerLearningGiveUp = function (giveUp: boolean) {
    const c = sceneController(this), question = this._learningGiveUp, session = this._session;
    if (!c.isCurrent() || this._mode !== 'learn-giveup' || !question) return;
    if (Number.isSafeInteger(this._pictureUpdate) && this._pictureUpdate === this._learningGiveUpShownUpdate) { this._menu.activate(); return; }
    this._learningGiveUp = null;
    retireBrief(this);
    if (session.pendingLearn !== question.pending) { this.afterMessages(); return; }
    if (!giveUp) { this._log.setLines(question.lines); this.showLearn(question.cursor); return; }
    c.run(() => session.decideLearn(null), (messages: unknown) => {
      if (!Array.isArray(messages)) throw new Error('invalid learning decision messages');
      this.enqueueMessages([question.declined]);
      this.pushMessages(messages);
    }, 'learn');
  };
  P.showEnd = function (aborted: boolean) {
    const c = sceneController(this); if (!c.isCurrent()) return;
    this._learningGiveUp = null; this._learningInitial = null; this._learningRetry = null;
    if (aborted) { this._endFeedbackPages = null; this._log.pause = false; this._log.add(PSFlow.translator().t("ui.end.aborted")); }
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
    // The existing Continue command is the explicit final confirmation. These lines do not commit a result.
    if (!aborted && !this._endFeedbackShown && s?.ended && this._psOp === PSFlow._op) {
      this._endFeedbackShown = true;
      const end = s.ended, trainer = this._psOp?.trainerPresentation, tr = PSFlow.translator(), lines: string[] = [];
      if (end.reason === 'win' && end.winner === 'Player' && this._psOp?.request.kind === 'trainer' && trainer) {
        lines.push(tr.t('trainer.defeated', { name: trainer.name }), trainer.loseText ?? '...');
      } else if (end.reason === 'win' && end.winner !== 'Player') lines.push(tr.t('ui.end.no_more'));
      const pages = lines.some(Boolean) ? this._log.textPages(lines.filter(Boolean).join('\n')) : [];
      if (pages.length > 1) {
        this._endFeedbackPages = pages; this._endFeedbackPage = 0;
        this._log.setLines(pages[0]); if (!c.isCurrent()) return;
        this._log.pause = true; this._endPageShownUpdate = this._pictureUpdate;
      } else for (const line of pages[0] || []) {
        if (!c.isCurrent() || !PSFlow.running) return;
        this._log.add(line);
      }
    }
    if (!c.isCurrent()) return;
    this._aborted = aborted;
    this.show("end", [{ name: PSFlow.translator().t(aborted ? "ui.end.back" : "ui.end.continue"), ext: "end" }]);
  };

  // The visible list Cancel and BACK have the same replacement-offer ownership contract.
  P.cancelPartyList = function () {
    if (this._partySub === 'replacement') {
      if (this._pictureUpdate === this._replacementListShownUpdate) this._menu.activate();
      else this.resolveTrainerReplacement(null);
    } else if (this._pendingItem) { this._pendingItem = null; this.showBag(); } else this.showMain();
  };
  P.onMenuCancel = function () {
    sceneController(this).input(() => {
    if (this._mode.startsWith('bag') && this._battleBag) {
      this._battleBag.select(this._menu.index()); this._battleBag.cancel(); this.showBattleBagView(); return;
    }
    if (this._mode === 'moves') this._menuCursor?.remember('moves', this._menu.index(), this._menu._items.length);
    switch (this._mode) {
      case 'wild-faint': this.answerWildFaint(false); return;
      case 'replacement-question': this.answerTrainerReplacement(false); return;
      case 'learn-initial': this.answerLearningInitial(false); return;
      case 'learn': this.askLearningGiveUp(); return;
      case 'learn-giveup': this.answerLearningGiveUp(false); return;
      case "party-command": this.showParty(this._partySub, this._partySelected); return;
      case "moves": case "bag": this.showMain(); return;
      case "party":
        this.cancelPartyList();
        return;
      default: G.SoundManager.playBuzzer(); this._menu.activate();
    }
    });
  };
  P.onMenuOk = function () {
    sceneController(this).input(() => {
    if (this._mode.startsWith('bag') && this._battleBag) { this.confirmBattleBag(); return; }
    if (this._mode === 'main' || this._mode === 'moves') this._menuCursor?.remember(this._mode, this._menu.index(), this._menu._items.length);
    const it = this._menu.itemAt(this._menu.index());
    const ext: unknown = it && it.ext;
    switch (this._mode) {
      case 'wild-faint': this.answerWildFaint(ext === 'next'); return;
      case 'replacement-question': this.answerTrainerReplacement(ext === 'replace-yes'); return;
      case "main":
        if (ext === "fight") this.showMoves();
        else if (ext === "bag") this.showBag();
        else if (ext === "party") this.showParty("switch");
        else if (ext === "run") this.act(() => activeSession(this).run(), "run");
        return;
      case "moves": {
        if (typeof ext !== 'number') { this._menu.activate(); return; }
        const move = activeSession(this).currentRequest()?.active?.[0]?.moves?.[Number(ext) - 1];
        this.act(() => { if (PSFlow.debug.failNext === "move") { PSFlow.debug.failNext = null; throw new Error("injected failure"); } return activeSession(this).chooseMove(ext); }, "move", { pp: move?.pp });
        return;
      }
      case "bag":
        if (typeof ext !== 'string' || !ext) { this._menu.activate(); return; }
        if (/ball$/.test(ext)) this.act(() => activeSession(this).throwBall(ext), "ball");
        else { this._pendingItem = ext; this.showParty("item"); }
        return;
      case "party":
        if (this._pendingItem) { const item: unknown = this._pendingItem; this._pendingItem = null; if (typeof item === 'string' && typeof ext === 'string') this.act(() => activeSession(this).useItem(item, ext), "item"); }
        else if (ext === null) this.cancelPartyList();
        else if (typeof ext === 'string') this.showPartyCommands(ext);
        return;
      case "party-forced":
        if (ext === null) { G.SoundManager.playBuzzer(); this._menu.activate(); }
        else if (typeof ext === 'string') this.showPartyCommands(ext);
        return;
      case "party-command": {
        if (ext === null) { this.showParty(this._partySub, this._partySelected); return; }
        if (Number.isSafeInteger(this._pictureUpdate) && this._pictureUpdate === this._partyCommandShownUpdate) { this._menu.activate(); return; }
        const id = this._partySelected, forced = this._partySub === 'forced';
        if (ext === 'summary' && typeof id === 'string') { this.showPartySummary(id); return; }
        if (ext === 'switch-in' && typeof id === 'string' && this._partySub === 'replacement') { this.resolveTrainerReplacement(id); return; }
        if (ext === 'switch-in' && typeof id === 'string') this.act(() => forced
          ? activeSession(this).chooseForcedSwitch(id) : activeSession(this).chooseSwitch(id), 'switch', undefined, { memberId: id });
        return;
      }
      case 'learn-initial':
        if (ext === 'forget-move' || ext === 'decline-learning') this.answerLearningInitial(ext === 'forget-move');
        return;
      case "learn":
        if (ext === null) this.askLearningGiveUp();
        else this.chooseLearningSlot(ext);
        return;
      case 'learn-giveup':
        if (ext === 'give-up' || ext === 'continue-learning') this.answerLearningGiveUp(ext === 'give-up');
        return;
      case "end": this.onEnd(); return;
    }
    });
  };

  /** Captured move/party context returns refused choices to their selector; other actions retain their return path. */
  P.act = function (fn: () => BattleActionResult | Promise<BattleActionResult>, kind?: string, refusedMove?: { pp?: number }, refusedParty?: { memberId: string }) {
    const c = sceneController(this);
    c.run(fn, r => {
      if (r && r.ok === false) {
        this._retryMoveMenu = !!refusedMove;
        this._retryPartySelection = refusedParty ? { ...refusedParty } : null;
        const partyText = refusedParty && r.reason === 'choice-rejected' ? switchRefusalText(this._session, refusedParty.memberId) : null;
        this.enqueueMessages([partyText ?? (refusedMove?.pp === 0 && r.reason === 'choice-rejected'
          ? PSFlow.translator().t('refusal.move.no-pp') : refusalText(kind, r.reason))]);
        return;
      }
      this._retryPartySelection = null;
      this.pushMessages("messages" in r ? r.messages : []);
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
    if (op !== PSFlow._op) { retireBattleBag(this); retireBrief(this); this._display?.dispose(); this._pictures?.dispose(); PSFlow.stale("finish", op); return; }
    const c = this._controller as BattleSceneController<BattleSessionView> | undefined;
    if (c && !c.isCurrent()) return;
    if (!this._aborted && !this._failure && this._battleBag && this._battleBag.view().kind !== 'closed') return;
    if (!this._aborted && !this._failure && this._captureMelody?.pending()) return;
    if (!this._aborted && !this._failure && this._ballFeedback?.pending()) return;
    if (!this._aborted && !this._failure && this._endFeedbackPages) {
      // A new terminal page needs a later Scene.update before another confirmation can advance or commit.
      // MZ processOk deactivates the menu before dispatch; keep Continue usable while more reading is owed.
      if (this._pictureUpdate === this._endPageShownUpdate) { this._menu.activate(); return; }
      const next = this._endFeedbackPages[this._endFeedbackPage + 1];
      if (next) {
        this._endFeedbackPage++; this._log.setLines(next); if (c && !c.isCurrent()) return;
        this._log.pause = true; this._endPageShownUpdate = this._pictureUpdate; this._menu.activate(); return;
      }
      this._endFeedbackPages = null; this._log.pause = false;
    }
    retireBattleBag(this); retireBrief(this); this._display?.dispose(); c?.dispose(); this._pictures?.dispose();
    if (!this._aborted && !this._failure) {
      try { const outcome=PSFlow.finish(this._session, this._psOp);if(c&&!c.ownsHost())return;if(outcome?.continuationToken){this._evolutionTransferred=true;this.popScene();return;}if(outcome?.pending&&W.PSManagement){this._menu.deactivate();if(c&&!c.ownsHost())return;this._receivingTransferred=W.PSManagement.replaceBattleWithReceiving();if(this._receivingTransferred)return;} } catch (e) { PSFlow.abort(e, this._psOp); } // finishBattle does not throw; this guards only the plugin's own wiring
    }
    if (c && !c.ownsHost()) return;
    this.popScene();
  };
  P.terminate = function () {
    this._learningGiveUp = null; this._learningInitial = null; this._learningRetry = null; this._automaticMove = null; this._wildFaintQuestion = null;
    const c = this._controller as BattleSceneController<BattleSessionView> | undefined;
    this._menuCursor?.clear();
    retireBattleBag(this);
    retireBrief(this);
    this._endFeedbackPages = null; if (this._log) this._log.pause = false;
    this._ballFeedback?.cancel();
    this._display?.dispose();
    c?.dispose(); // retire callbacks before host teardown can reenter application code
    this._partyDisplayOrder = null;
    const learning = this._learningMenu; this._learningMenu = null;
    if (learning) {
      if (this._menu === learning) this._menu = this._commandMenu;
      learning.deactivate(); learning.hide(); learning.parent?.removeChild(learning); learning.destroy({ children: true });
    }
    this._backdrop?.dispose();
    this._pictures?.dispose();
    try { G.Scene_MenuBase.prototype.terminate.call(this); }
    finally {
    const op = this._psOp === undefined ? PSFlow._op : this._psOp; // (a scene always has one; a bare caller means the current one)
    if (PSFlow.running && op === PSFlow._op && (!c || c.ownsHost()) && !(this._receivingTransferred&&PSFlow.app().pendingReceiving) && !(this._evolutionTransferred&&(PSFlow.app().pendingEvolution||PSFlow.app().pendingPokedex)) && (!c || c.ownsHost())) PSFlow.abort(new Error("the battle scene closed without an outcome"), op); // transferred operations keep the same event and save lock
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
