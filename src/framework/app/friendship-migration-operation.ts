/** Explicit friendship migration contracts. The application alone retains the plan and the live handle. */
import type { GameState } from "../rules/state";
import type { FriendshipMigrationPlan, FriendshipMigrationReceipt, FriendshipMigrationTarget, FriendshipMigrationExcluded } from "../rules/friendship-migration";

declare const friendshipHandle: unique symbol;
export interface FriendshipMigrationHandle { readonly [friendshipHandle]: true }
export interface FriendshipPersistenceSnapshot {
  /** Canonical actual file/slot identity, not a caller supplied label. */
  target: string;
  rawHash: string;
  sourceSchema: number;
  state: GameState;
  /** Full host capture, when the host has persistent data outside the framework. */
  hostIdentity: string;
}
export interface FriendshipPersistenceRequest {
  before: FriendshipPersistenceSnapshot;
  next: GameState;
  plan: FriendshipMigrationPlan;
  receipt: FriendshipMigrationReceipt;
  contentHash: string;
  contentIdentity: string | null;
  /** Must be called after every asynchronous boundary and immediately before the single persistent commit. */
  assertCurrent(): void;
}
export interface FriendshipPersistenceResult {
  status: "committed" | "not-committed" | "unknown";
  rawHash?: string;
  bundle?: string;
  error?: string;
}
export interface FriendshipPersistencePort {
  preview(): Promise<FriendshipPersistenceSnapshot>;
  commit(request: FriendshipPersistenceRequest): Promise<FriendshipPersistenceResult>;
}
export interface FriendshipApplicationPreview {
  status: "ready";
  handle: FriendshipMigrationHandle;
  target: string;
  rawHash: string;
  planHash: string;
  targets: FriendshipMigrationTarget[];
  candidates: FriendshipMigrationTarget[];
  outOfScope: FriendshipMigrationExcluded[];
}
export interface FriendshipApplicationResult {
  status: "applied" | "already-applied" | "unchanged" | "cancelled" | "refused" | "reload-required";
  reason?: string;
  error?: string;
  persistence?: FriendshipPersistenceResult;
}
