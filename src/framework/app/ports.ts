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

/** The persistent game state, held by whoever owns the save (MZ: `$gameSystem._psGame`). The application never mutates what `read` returns. */
export interface GameStatePort {
  /** The current state; throws when the state is not usable (e.g. a save that could not be read), so no battle runs on it. */
  read(): GameState;
  /** Install the next state in one step. If this throws, the old state must remain installed. Called only with a state the rules produced from `read()`'s result (or, for a new game, with the formal empty state). */
  replace(next: GameState): void;
}

/** Randomness for game rules outside a battle (creating members, encounters): an integer in [0, n). */
export interface RandomPort {
  (n: number): number;
}

/**
 * The host's wall clock (WP06 §3 "现实时间"): milliseconds since the Unix epoch. Injected like the random source so
 * that rules never read the host clock (they receive the time as an argument) and tests can pin it.
 */
export interface ClockPort {
  (): number;
}

/** One battle as the author (StartBattle) or an encounter asks for it. */
export interface BattleStartRequest {
  battleId: string;
  kind: "wild" | "trainer";
  /** Species as content id or persistent name, and level; the application creates the individuals. */
  foes: { species: string; level: number }[];
  /** Monotonic number of this battle in the save; used for stable foe ids. */
  seq: number;
  /** Author flags of a scripted battle (protocol v1 foe descriptor). */
  noRun?: boolean;
  noBall?: boolean;
  /** The author lets the player lose this battle (story battle): a defeat then is not a blackout (WP61 §7, statistics). */
  canLose?: boolean;
  /** Scripted battle rule, explicit priority over the player receive preference. */
  forceParty?: boolean;
  /** A-M1 stable trainer record; when present, foes are built from that record rather than free-form foe specs. */
  trainer?: { id: string; version: number };
}

export type TrainerBattleStartRequest = Omit<BattleStartRequest, "kind" | "foes" | "trainer"> & { trainer: { id: string; version: number } };

/** What the application decided before a session exists: the created foes and the effective flags. */
export interface BattleSetup {
  /** Internal application authority for a transient companion; never read from a save or UI request. */
  evidenceContext?: BattleEvidenceContext;
  /** Formal application path always supplies authoritative player/badges/content/generation; legacy direct sessions may omit it. */
  obedience?: ObedienceContext;
  trainer?: TrainerBattleProjection;
  experimentalHeldBattle?: boolean;
  diagnostics?: string[];
  foes: Member[];
  noRun: boolean;
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
