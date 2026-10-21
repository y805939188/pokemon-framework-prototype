/**
 * What the game application needs from the world, as small interfaces it owns. The MZ plugin implements them with
 * `$gameSystem` and `$gameVariables`; tests implement them in memory; the composition root wires the Showdown-backed
 * battle session factory. Types only.
 */
import type { BattleResult, GameState } from "../rules/state.ts";
import type { Content, DexLookup, Member } from "../rules/types.ts";

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
}

/** What the application decided before a session exists: the created foes and the effective flags. */
export interface BattleSetup {
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
  | { ok: false; reason: "not-here" | "invalid-table" | "no-able-member" | "state-unusable" | "no-random" | "unknown-species" | "invalid-content"; error?: string };

/** A running battle as the application sees it: it can say how it ended. The UI drives the concrete session itself. */
export interface BattleHandle {
  /** The BattleResult (protocol v1); throws while the battle is unfinished or the session was closed after a failure. */
  result(): BattleResult;
}

export interface BattleSessionFactory<S extends BattleHandle = BattleHandle> {
  /** Open a battle for `game` against `setup.foes`; the application has already checked the save's content references. */
  create(request: BattleStartRequest, game: GameState, setup: BattleSetup): Promise<S>;
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
  status: "applied" | "already-claimed" | "refused";
  grantId: string;
  /** Why it was refused: a rule refusal (unknown-grant, no-room, bag-full, member-id-taken, creation-failed), battle-active, state-unusable, no-random or commit-failed. */
  reason?: string;
  error?: string;
  placed?: { id: string; species: string; level: number; to: "party" | "boxes" }[];
  items?: Record<string, number>;
  money?: number;
}

/** A read-only view of the persistent party, boxes and bag for a host screen (no rule lives in the host). */
export interface PartyView {
  members: { id: string; species: string; nameKey?: string; level: number; hp: number; maxhp: number; status: string; moves: { id: string; pp: number; maxpp: number }[] }[];
  boxes: number;
  bag: Record<string, number>;
  money: number;
}

export interface HealOutcome {
  status: "healed" | "unchanged" | "refused";
  reason?: string;
  error?: string;
}

export interface BattleOutcome {
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
  /** Whether the host was told. "failed" means the projection threw; `commit` separately says whether state was committed. */
  projection?: "ok" | "failed";
  projectionError?: string;
}
