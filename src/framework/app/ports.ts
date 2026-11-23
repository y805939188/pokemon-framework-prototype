import type { OwnedSurfLandingProof, WorldMovementStartLifecycle } from './movement-start-ports';
import type { WorldCompanionNativeTransferLifecycle } from './companion-lifecycle-data';
import type { InitialField, InitialFieldInput } from '../rules/initial-field';
/**
 * What the game application needs from the world, as small interfaces it owns. The MZ plugin implements them with
 * `$gameSystem` and `$gameVariables`; tests implement them in memory; the composition root wires the Showdown-backed
 * battle session factory. Types only.
 */
import type { BattleResult, GameState } from "../rules/state";
import type { Content, DexLookup, Member, TrainerBattleProjection } from "../rules/types";
import type { ObedienceContext } from "../rules/obedience";
import type { BattleEvidence, BattleEvidenceContext, EvidenceBinding } from "../rules/battle-evidence";
import type { EffectsBindingV2, EffectsSealV2 } from "../rules/battle-consumption";
import type { WorldFact } from '../rules/world-state';
import type { ENVIRONMENT } from '../rules/initial-field';
import type { CapturedWorldBallFacts } from '../rules/world-battle-context';
import type { FieldShortcutSelection } from './field-shortcut-query';
export interface FieldShortcutContext { readonly generation: number; readonly map: object; readonly mapId: number; readonly player: object; readonly x: number; readonly y: number }
/** Private request-registry projection. The source is a guard, never an alternative capability. */
export interface FieldShortcutAdmission { readonly selection: FieldShortcutSelection; readonly source: FieldShortcutContext }
export interface InventoryTicket { token:string;generation:number;revision:string;contentRevision:string;pocket:number;index:number;itemId:string;quantity:number }

/** Actual host identities and landing coordinates, observed again after each continuation. */
export interface CompletedStepLocation {
  readonly hostOwner: object; readonly generation: number; readonly player: object; readonly map: object;
  readonly mapId: number; readonly x: number; readonly y: number;
}
export interface CompletedWorldStep extends CompletedStepLocation {
  readonly id: string; readonly ice: boolean; readonly regionId: number; readonly terrainTag: number;
  readonly sceneActive: boolean;
}
/** These values authorize work only by identity in the issuing application's current owner. */
export interface CompletedStepPermit { readonly token: string; readonly generation: number; readonly kind: 'completed-step' }
export interface FieldBattlePermit { readonly token: string; readonly generation: number; readonly kind: 'field-item' }
export interface FieldMoveBattlePermit { readonly token: string; readonly generation: number; readonly kind: 'field-move' }
export type WorldBattleParentPermit = CompletedStepPermit | FieldBattlePermit | FieldMoveBattlePermit;
export interface RepelSelectionPermit { readonly token: string; readonly generation: number; readonly kind: 'repel-selection' }
export interface OwnedRepelSelection {
  readonly child: RepelSelectionPermit; readonly inventoryToken: string; readonly selectionId: string;
}
/** Technical callbacks issued only to an actual current owned-Repel child; arguments stay exact native identities. */
export interface OwnedRepelSceneHooks {
  opened(handle: object, scene: object): boolean;
  beforeReturn(handle: object, scene: object): boolean;
  returnQueued(handle: object): boolean;
  returned(handle: object): boolean;
}
export type RepelSelectionReply = { readonly status: 'selected'; readonly ticket: InventoryTicket } | { readonly status: 'cancelled' };
export type CompletedStepPresentation = { readonly id: number; readonly kind: 'repel-expired' | 'poison-feedback' }
  | { readonly id: number; readonly kind: 'poison-message'; readonly memberId: string; readonly message: 'survived-poison' | 'fainted' };
export type CompletedStepPresentationAck = { readonly id: number; readonly status: 'completed' }
  | { readonly id: number; readonly status: 'failed'; readonly reason: string };
export type CompletedStepArrival = { readonly status: 'event-dispatched' | 'action-dispatched' | 'ordinary-opportunity' }
  | { readonly status: 'blocked' | 'failed'; readonly reason: string };
export interface CompletedStepHostPort {
  current(): CompletedStepLocation;
  openRepelSelection(request: Readonly<{ owner: CompletedStepPermit; selection: OwnedRepelSelection }>): Promise<RepelSelectionReply>;
  present(request: Readonly<{ owner: CompletedStepPermit; effect: CompletedStepPresentation }>): Promise<CompletedStepPresentationAck>;
  /** Resume this step's original nonmoving dispatch exactly once, reporting its actual event/action result. */
  dispatchArrival(request: Readonly<{ owner: CompletedStepPermit; step: CompletedWorldStep }>): CompletedStepArrival;
}
export interface CompletedStepPrefix {
  readonly stepCommitted: boolean; readonly repelRenewed: boolean; readonly poisonMembersCommitted: number;
  readonly repelActiveAtStart: boolean;
}
export interface WorldBattleOffer { readonly token: string; readonly generation: number }
export interface WorldBattleAdmission { readonly token: string; readonly generation: number; readonly battleId: string }
export interface OrdinaryEncounterHostFacts {
  readonly landAllowed: WorldFact<boolean>; readonly encountersDisabled: WorldFact<boolean>; readonly debugControl: WorldFact<boolean>;
  readonly groundEnvironment: WorldFact<keyof typeof ENVIRONMENT>;
}
export interface FieldEncounterHostPort { read(): OrdinaryEncounterHostFacts }
export interface WorldBattleScenePort {
  /** Actual MZ registry must own this current scene and exact admission; a marker/DTO is not authority. */
  assertCurrent(admission: WorldBattleAdmission, scene: object): void;
}
export interface OrdinaryEncounterHostPort { read(step: Readonly<CompletedWorldStep>): OrdinaryEncounterHostFacts }
export type CompletedWorldStepOutcome = { readonly status: 'completed' | 'duplicate'; readonly arrival: CompletedStepArrival; readonly prefix: CompletedStepPrefix }
  | { readonly status: 'battle-admitted'; readonly admission: WorldBattleAdmission; readonly prefix: CompletedStepPrefix }
  | { readonly status: 'no-encounter' | 'unsupported'; readonly reason: string; readonly prefix: CompletedStepPrefix }
  | { readonly status: 'ordinary-unhandled'; readonly reason: 'ordinary-encounter-handler-unavailable'; readonly prefix: CompletedStepPrefix }
  | { readonly status: 'blackout-required'; readonly blackoutAdmitted?: true; readonly prefix: CompletedStepPrefix }
  | { readonly status: 'cancelled'; readonly prefix: CompletedStepPrefix }
  | { readonly status: 'refused' | 'failed'; readonly reason: string; readonly prefix: CompletedStepPrefix };

/** Native world identities captured after reentrant preparation, without invoking host methods. */
export interface WorldHostLifecycle {
  /** Optional own native PSFlow._app identity; ordinary author requests require this exact App. */
  readonly application?: object;
  readonly map: object; readonly mapId: number; readonly player: object; readonly scene: object;
  /** Optional F-only native own-data observation. Null means real cold data is not yet loaded. */
  readonly mapData?: object | null;
  /** E3-only own native slots, supplied by atomicWorldContent; old atomicWorld remains unchanged. */
  readonly travelPlayer?: WorldTravelPlayerLifecycle;
  readonly travelSwitches?: WorldTravelSwitchLifecycle;
  /** Materialized only by the registered native producer module, never an owner/key DTO. */
  readonly travelLease?: WorldTravelLeaseSnapshot;
  /** Optional native own-data location; completed-step children require their exact completed square. */
  readonly playerPosition?: Readonly<{ x: number; y: number }>;
  /** Trusted native own-data observation of the actual admitted battle scene's host registry. */
  readonly battleScene?: WorldBattleSceneLifecycle;
  /** Native own-data SceneManager transition slots, never getters or host-supplied DTOs. */
  readonly sceneTransition?: WorldSceneTransition;
}
declare const worldTravelLeaseSourceBrand: unique symbol;
/** Runtime membership belongs to the native producer's private registry. A cast/DTO grants nothing. */
export interface WorldTravelLeaseSource { readonly [worldTravelLeaseSourceBrand]: true }
export interface WorldTravelLeaseCurrent {
  readonly lease: object; readonly owner: object; readonly receipt: object; readonly player: object; readonly serial: object;
  readonly sourceScene: object; readonly scene: object; readonly phase: 'reserved' | 'performing' | 'arrived';
}
export interface WorldTravelLeaseSnapshot {
  readonly registry: WorldTravelLeaseSource; readonly current: WorldTravelLeaseCurrent | null;
  /** Private native lineage changes on current/birth/source publication, including idle ABA. */
  readonly nativeEpoch?: object;
  /** Existing genuine ctor/goto membership; observation alone grants no F operation. */
  readonly mapBirth?: WorldMapBirthLifecycle | null;
  /** Published only by the same native producer for an actual App-issued F source context. */
  readonly sourceHandoff?: WorldBlackoutSourceLifecycle | null;
  /** Optional START-only proof from this same private producer. Read-only DTOs do not issue it. */
  readonly movementStart?: WorldMovementStartLifecycle | null;
  /** Completed only by the same installed START producer; never a host DTO. */
  readonly surfLanding?: OwnedSurfLandingProof | null;
  /** Optional ordinary companion registration observation; no callback reaches App final. */
  readonly companionPreparedOrigin?: WorldCompanionPreparedOriginLifecycle | null;
  /** Actual unowned explicit 201 consumption, excluding formal-load rebuild and issued E3/F. */
  readonly companionTransfer?: WorldCompanionNativeTransferLifecycle | null;
}
/** Registration source observation, authenticated by the same native registry and its known
 * pure lexical source reader. This supplies no App intent/operation write authority. */
export interface WorldCompanionPreparedOriginLifecycle {
  readonly source: object; readonly origin: object; readonly prepared: object;
  /** Native lineage at this exact publication; own origin publish/retire preserves it. */
  readonly epoch: object;
  readonly application: object; readonly generation: number; readonly actionIdentity: string;
  readonly manager: object; readonly scene: object; readonly birth: object; readonly queue: object;
  readonly map: object; readonly mapId: number; readonly player: object; readonly data: object;
}
export interface WorldMapBirthLifecycle {
  readonly manager: object; readonly scene: object; readonly birth: object; readonly queue: object;
  /** Materialized after genuine native map loading; no seed/old object may be retroactively signed. */
  readonly frame: Readonly<{ map: object; mapId: number; player: object; data: object }> | null;
}
export interface WorldBlackoutSourceLifecycle {
  readonly owner: object; readonly context: object; readonly generation: number; readonly serial: object;
  readonly sourceScene: object;
  readonly phase: 'armed' | 'ready';
  readonly target: WorldMapBirthLifecycle | null;
}
export interface WorldTravelPlayerLifecycle {
  readonly direction: 2 | 4 | 6 | 8; readonly transferring: boolean;
  readonly target: Readonly<{ mapId: number; x: number; y: number; direction: 0 | 2 | 4 | 6 | 8 }> | null;
}
export interface WorldTravelSwitchLifecycle {
  readonly owner: object; readonly data: object;
  /** Own boolean cells; an absent positive cell is the native false default. */
  readonly values: Readonly<Record<string, boolean>>;
}
export interface WorldSceneTransition {
  readonly manager: object; readonly prototype: object | null; readonly started: boolean;
  readonly nextScene: object | null; readonly nextPrototype: object | null;
}
export interface WorldBattleSceneLifecycle {
  readonly flow: object; readonly manager: object; readonly prototype: object | null;
  readonly application: object; readonly operation: object;
  readonly admission: object; readonly sceneOperation: object; readonly running: boolean;
}
export interface AtomicWorldState { readonly game: GameState; readonly lifecycle: WorldHostLifecycle }
/** Trusted materialized Content cache and native world slots, jointly captured after all query providers. */
export interface AtomicFieldQueryState extends AtomicWorldState { readonly content: Content }

/** The persistent game state, held by whoever owns the save (MZ: `$gameSystem._psGame`). The application never mutates what `read` returns. */
export interface GameStatePort {
  /** The current state; throws when the state is not usable (e.g. a save that could not be read), so no battle runs on it. */
  read(): GameState;
  /** Install the next state in one step. If this throws, the old state must remain installed. Called only with a state the rules produced from `read()`'s result (or, for a new game, with the formal empty state). */
  replace(next: GameState): void;
  /**
   * Optional native state-slot capability. Run all reentrant preparation first, then give the returned
   * pure finisher the actual installed game. The finisher, any next-state assignment and return form
   * one synchronous boundary: no provider, getter, setter or legacy replace callback may run there.
   * Throwing leaves this access uncommitted. Legacy ports remain usable; world-bound fishing uses atomicWorld below.
   */
  atomic?<T>(prepare: () => (actual: GameState) => AtomicStateResult<T>): T;
  /** Same native assignment boundary, jointly observing the actual map/player/scene after all providers. */
  atomicWorld?<T>(prepare: () => (actual: AtomicWorldState) => AtomicStateResult<T>): T;
  /** Final native Content slot, game and lifecycle, captured together after preparation.
   * The returned assignment is installed in the same callback-free interval. E3 never falls back. */
  atomicWorldContent?<T>(prepare: () => (actual: AtomicFieldQueryState) => AtomicStateResult<T>): T;
  /** Native descriptor-only observation: no legacy read, provider, accessor or Proxy trap may run. */
  worldLifecycle?(): WorldHostLifecycle;
  /** Read-only: the finisher cannot return an assignment. No split Content getter is called after capture. */
  atomicFieldQuery?<T>(prepare: () => (actual: AtomicFieldQueryState) => T): T;
}

export interface AtomicStateResult<T> { readonly value: T; readonly next?: GameState }

/** Randomness for game rules outside a battle (creating members, encounters): an integer in [0, n). */
export interface RandomPort {
  (n: number): number;
}

/**
 * The host's wall clock (WP06 §3 "现实时间"): milliseconds since the Unix epoch. Injected like the random source so
 * that rules never read the host clock (they receive the time as an argument) and tests can pin it.
 */
export interface WildGenerationHostPort {
  switchOn(id: number): import('../rules/world-data').WorldFact<boolean>;
  environment?(): import('../rules/world-data').WorldFact<keyof typeof import('../rules/initial-field').ENVIRONMENT>;
}

export interface ClockPort {
  (): number;
}

/** One battle as the author (StartBattle) or an encounter asks for it. */
export interface BattleStartRequest {
  /** Captured author field defaults; no world inference. */
  initialField?: InitialFieldInput;
  battleId: string;
  kind: "wild" | "trainer";
  /** Species as content id or persistent name, and level; the application creates the individuals. */
  foes: { species: string; level: number }[];
  /** Monotonic number of this battle in the save; used for stable foe ids. */
  seq: number;
  /** Author flags of a scripted battle (protocol v1 foe descriptor). */
  noRun?: boolean;
  noBall?: boolean;
  /** Author rule for voluntary switching. Defaults to true; forced replacements remain available. */
  canSwitch?: boolean;
  /** Author override. The host captures the player preference first; direct App callers default to Switch. */
  battleStyle?: "switch" | "set";
  /** Per-battle growth gate. Defaults to true; false skips both EV and experience distribution. */
  expGain?: boolean;
  /** The author lets the player lose this battle (story battle): a defeat then is not a blackout (WP61 §7, statistics). */
  canLose?: boolean;
  /** Victory money settlement (WP42). Defaults to true; false does not normalize the wallet. */
  moneyGain?: boolean;
  /** Scripted battle rule, explicit priority over the player receive preference. */
  forceParty?: boolean;
  /** A-M1 stable trainer record; when present, foes are built from that record rather than free-form foe specs. */
  trainer?: { id: string; version: number };
}

export type TrainerBattleStartRequest = Omit<BattleStartRequest, "kind" | "foes" | "trainer"> & { trainer: { id: string; version: number } };
/** Additive single-wild entry. The complete persistent individual is copied and validated, never generated again. */
export type GeneratedWildBattleStartRequest = Omit<BattleStartRequest, "kind" | "foes" | "trainer"> & { readonly species: string; readonly level: number };
export type GivenWildBattleStartRequest = Omit<BattleStartRequest, "kind" | "foes" | "trainer"> & { readonly member: Member };

/** What the application decided before a session exists: the created foes and the effective flags. */
export interface BattleSetup {
  /** Captured business facts for the capture consumer; no visual tone or author battleTime inference. */
  worldCapture?: CapturedWorldBallFacts;
  initialField?: InitialField;
  /** Internal application authority for a transient companion; never read from a save or UI request. */
  evidenceContext?: BattleEvidenceContext;
  /** Formal application path always supplies authoritative player/badges/content/generation; legacy direct sessions may omit it. */
  obedience?: ObedienceContext;
  trainer?: TrainerBattleProjection;
  /** Transient application operation/generation guard, bound before a formal trainer factory can reenter. */
  isCurrentBattle?: () => boolean;
  experimentalHeldBattle?: boolean;
  diagnostics?: string[];
  foes: Member[];
  noRun: boolean;
  /** Captured author policy; formal starts supply a boolean, legacy custom factories may omit it. */
  canSwitch?: boolean;
  /** Captured per-battle style, independent of voluntary switching legality. */
  battleStyle?: "switch" | "set";
  /** Per-battle growth gate. Defaults to true; false skips both EV and experience distribution. */
  expGain?: boolean;
  /** Global author capture-growth rule captured by the application before the session factory. */
  captureExpGain?: boolean;
  /** The author's flag, or forced on because a caught member would have nowhere to go (decision D1). */
  noBall: boolean;
  /** The party and the boxes are both full (the reason a ball is disabled, for the host's message). */
  storageFull: boolean;
}

/** An encounter the application allows here and now (or why not). */
export type EncounterPlan =
  | { ok: true; foe: { species: string; level: number } }
  | { ok: false; reason: "operation-active" | "held-item-battle-disabled" | "not-here" | "invalid-table" | "no-able-member" | "state-unusable" | "no-random" | "unknown-species" | "invalid-content"; error?: string };

/** A running battle as the application sees it: it can say how it ended. The UI drives the concrete session itself. */
export interface BattleHandle {
  /** The BattleResult (protocol v1); throws while the battle is unfinished or the session was closed after a failure. */
  result(): BattleResult;
}

export interface BattleSessionFactory<S extends BattleHandle = BattleHandle> {
  /**
   * Open a battle for `game` against `setup.foes`; the application has already checked the save's content references.
   * `game` is the battle view of the persistent state (rules/species-key.ts battleView): species are Showdown names.
   */
  create(request: BattleStartRequest, game: GameState, setup: BattleSetup): Promise<S>;
  /** Optional internal companion. Missing/throwing evidence never invalidates a legal primary result. */
  evidence?(handle: S, binding: EvidenceBinding): BattleEvidence | null;
  /** V2 source-isolated receipts; E consumer owns binding, preparation and eventual installation. */
  effects?(handle: S, binding: EffectsBindingV2): EffectsSealV2 | null;
  /** Retire only this handle's transient asynchronous work after application ownership has ended. */
  retire?(handle:S):void;
}

/** The content a battle uses and, when available, the engine's data to check moves against. */
export interface ContentPort {
  (): { content: Content; dex?: DexLookup };
}

/** How the host learns the outcome (MZ: write the result variable). A failure here never undoes a committed result. */
export interface OutcomeProjection {
  project(outcome: BattleOutcome): void;
}

/** What a one-time grant did. Never thrown: a refusal is a value and then nothing was committed. */
export interface ClaimOutcome {
  status: "applied" | "already-claimed" | "refused" | "pending";
  token?: string;
  pendingMember?: string;
  grantId: string;
  /** Why it was refused: a rule refusal (unknown-grant, no-room, bag-full, member-id-taken, creation-failed), battle-active, state-unusable, no-random or commit-failed. */
  reason?: string;
  error?: string;
  /** Received members by persistent key (content id + form). */
  placed?: { id: string; species: string; form: number; level: number; to: "party" | "boxes" }[];
  items?: Record<string, number>;
  money?: number;
}

/** A read-only view of the persistent party, boxes and bag for a host screen (no rule lives in the host). */
export interface PartyView {
  /** `species` + `form`: the persistent key (content id + form). */
  members: { id: string; species: string; form: number; nameKey?: string; level: number; hp: number; maxhp: number; status: string; moves: { id: string; pp: number; maxpp: number }[] }[];
  boxes: number;
  bag: Record<string, number>;
  money: number;
}

export interface HealOutcome {
  status: "healed" | "unchanged" | "refused";
  reason?: string;
  error?: string;
}

/** Steps the player took (WP06 §4.1). Refused while a battle is open or the state is unusable; never throws. */
export interface StepsOutcome {
  status: "counted" | "refused";
  steps?: number;
  reason?: string;
  error?: string;
}

export interface BattleOutcome {
  /** Transient post-battle continuation, separate from pending reception and frozen battle protocol v1. */
  continuationToken?: string;
  continuationRevision?: number;
  pending?: true;
  receivingToken?: string;
  pendingMember?: string;
  diagnostics?: string[];
  /** 0 aborted, 1 win, 2 caught, 3 ran, 4 anything else (lost, tie). */
  code: number;
  battleId: string | null;
  /** What happened to the persistent state: the result was applied, was already applied (no-op), or nothing was committed. */
  commit: "applied" | "already-applied" | "none";
  /** The kind of ending the result reported (win, run, caught, tie). */
  kind?: string;
  aborted?: true;
  error?: string;
  /** A lost or drawn battle that was just committed: money lost and the party healed in the same state replacement (D3). */
  defeat?: { moneyLost: number; healed: true };
  /** Actual A-M1 base-prize delta, not a nominal amulet/HappyHour/PayDay claim. */
  trainerReward?: { id: string; version: number; nominal: number; before: number; after: number; actual: number; normalizationLoss: number };
  /** Actual second-stage Pay Day delta, published only after the same battle installation. */
  payDayReward?: { nominal: number; before: number; after: number; actual: number; normalizationLoss: number };
  /** Whether the host was told. "failed" means the projection threw; `commit` separately says whether state was committed. */
  projection?: "ok" | "failed";
  projectionError?: string;
}

export interface CreationContext { map?: number; environment?: string | null; timeOfDay?: "day" | "dusk" | "night" }

export interface GiftRequest {
  /** WP26: register this individual's form and permit the non-silent first-entry presentation; default true. */
  seeForm?: boolean;
  kind: "normal" | "silent" | "party" | "party-silent" | "foreign";
  member: { species: string; level?: number; form?: number; item?: string } | { existing: Member };
  foreignOwner?: { name?: string; gender?: 0 | 1 | 2; language?: number };
  nickname?: string;
}
export interface GiftOutcome {
  status: "applied" | "pending" | "refused";
  token?: string;
  reason?: string;
  error?: string;
  placed?: { id: string; to: "party" | "boxes" }[];
}
