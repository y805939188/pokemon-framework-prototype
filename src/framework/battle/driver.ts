/**
 * The seam between the game flow and a battle engine: everything the session needs, as plain data and controlled
 * operations. `BattleGateway` (Pokemon Showdown) implements it; a scripted fake can stand in for it in tests. Types
 * only: no behaviour lives here.
 */
import type { BattleEvent } from "./protocol.ts";
import type { MonView } from "../rules/rules.ts";
import type { PartialStats, Stats } from "../rules/types.ts";
import type { ObservationBatch, BattleObservation } from "../rules/battle-evidence.ts";

export interface PlayerSpec {
  name: string;
  team: unknown[];
}

export interface GatewayOptions {
  formatid?: string;
  seed?: number[] | string;
  players?: PlayerSpec[];
  engineRoot?: string;
  wild?: boolean;
  noBall?: boolean;
  noRun?: boolean;
  restored?: boolean;
}

export type GatewayMessage =
  | { kind: "events"; seq: number; events: BattleEvent[] }
  | { kind: "request"; seq: number; side: string; request: Record<string, any> }
  | { kind: "error"; seq: number; side: string; message: string; choice?: string; payload?: unknown }
  | { kind: "end"; seq: number; winner: string | null; turn: number; reason: string; outcome?: Record<string, unknown> };

/** A message before it gets its sequence number. */
export type Unsequenced = GatewayMessage extends infer M ? (M extends GatewayMessage ? Omit<M, "seq"> : never) : never;

export interface SlotSpec {
  kind?: string;
  move?: number;
  target?: number | string;
  switch?: number;
  [k: string]: unknown;
}

export interface StateRecord {
  id: string;
  hp: number;
  status?: string;
  statusCount?: number;
  moves?: { id: string; pp: number; maxpp?: number }[];
}

export interface MemberState extends MonView {
  level: number;
  statusCount: number;
  pp: Record<string, number>;
  stats: Stats;
}

/** An opaque in-memory rollback point (see GatewayCheckpoint); nothing can be read from it. */
export interface DriverCheckpoint { readonly opaque?: never }

export interface GrowthApplication {
  level: number; evs?: PartialStats; expect?: { stats?: Partial<Stats> }; newMoves?: string[]; replaceSlot?: number | null;
}
export interface GrowthOutcome {
  before: { level: number; maxhp: number; hp: number };
  after: { level: number; maxhp: number; hp: number };
  stats: Stats;
}

export interface BattleDriver {
  /** Submit a choice string for a side; false when the engine refuses it. */
  choose(side: string, choice: string): Promise<boolean>;
  /** Register a non-move action (item, ball, run) as the whole choice of one slot. */
  act(side: string, payload: SlotSpec, slot?: number): Promise<boolean>;
  chooseSlots(side: string, specs: (SlotSpec | null)[]): Promise<boolean>;
  cancel(side: string): Promise<void>;
  /** May this side try to run/throw a ball now, and if not, why. */
  query(side: string, what: "run" | "ball" | string, slot?: number): { allowed: boolean; reason?: string };
  readState(side: string): MemberState[];
  seedState(side: string, records: StateRecord[]): void;
  applyGrowth(side: string, id: string, change: GrowthApplication): GrowthOutcome;
  /** Internal optional capabilities. Absence means unavailable, never an empty/complete observation. */
  drainObservations?(): ObservationBatch;
  /** Control-path faint triggers; independent of optional observation quality/failures. */
  drainFriendshipFaints?(): Extract<BattleObservation, { kind: "faint" }>[];
  /** A member-bound rollback point for only live/set friendship, not the already-executed main action. */
  checkpointFriendship?(side: string, id: string): DriverCheckpoint;
  restoreFriendship?(token: DriverCheckpoint): void;
  applyFriendship?(side: string, id: string, change: { expected: number; value: number }): { before: number; after: number };
  moveInfo(nameOrId: string): { id: string; name: string; pp: number };
  /** Re-issue the pending requests after state changed between turns. */
  refreshRequests(): GatewayMessage[];
  /** Stable id of the member currently in a side's slot, or null. */
  activeId(side: string, slot?: number): string | null;
  /** A copy of the side's pending request while it still has to choose, else null. */
  awaitingChoice(side: string): Record<string, unknown> | null;
  drain(): GatewayMessage[];
  discardQueued(): void;
  /** An opaque in-memory rollback point; only the factory that made the driver can open it. */
  checkpoint(): DriverCheckpoint;
}

export interface BattleDriverFactory {
  create(options: GatewayOptions): Promise<BattleDriver>;
  fromCheckpoint(token: DriverCheckpoint): Promise<BattleDriver>;
  /**
   * Resolves move ids to the engine's own move names and throws for an id the engine does not know; used to validate
   * content before a battle starts.
   */
  moveNames(formatid: string, seed?: number[] | string): Promise<(id: string) => string>;
}
