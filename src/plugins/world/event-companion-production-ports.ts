/** Ordinary companion integration contract. Facts/notice handles supply no state-write authority. */
import type { CompanionAction, CompanionHost, CompanionResult } from '../../framework/app/event-companion-operation';
import type { CompanionRemoval } from '../../framework/rules/event-companions';
import type { EventCompanionState } from '../../framework/rules/world-state';
import type { WorldFact, WorldLocation } from '../../framework/rules/world-data';

export type CompanionAuthorIntent =
  | { readonly kind: 'register'; readonly eventId: number; readonly name?: string; readonly commonEventId?: number }
  | { readonly kind: 'remove'; readonly removal: CompanionRemoval }
  | { readonly kind: 'recover' };
export type CompanionPreparationIntent = CompanionAuthorIntent
  | { readonly kind: 'player-moved'; readonly player: WorldLocation; readonly instant: boolean };
/** Actual App privately issues this identity. No caller string IDs or public service.perform forwarding. */
export interface CompanionIntentReceipt { readonly handle: object; readonly result: Promise<CompanionResult> }
/** Contract only: the actual GameApplication shared writer must implement these methods.
 * A typed object or callback returning true is not proof of installation or issued authority. */
export interface CompanionOrdinaryApplication {
  beginEventCompanion(intent: CompanionAuthorIntent): CompanionIntentReceipt;
  cancelEventCompanion(handle: object): CompanionResult;
  recoverEventCompanionProjection(): Promise<CompanionResult | { readonly status: 'idle' | 'blocked' | 'exhausted' }>;
}
export interface CompanionPreparedSource {
  readonly handle: object;
  readonly action: CompanionAction;
}
export interface CompanionProductionPreparation {
  /** Actual App calls outside final with detached current records, before its issued service action.
   * Native source/action values remain observations; App final checks its real private admission. */
  prepare(intent: unknown, records: readonly EventCompanionState[]): Promise<WorldFact<CompanionPreparedSource>>;
  isCurrent(prepared: unknown): boolean;
  /** Outside-final registration snapshot; no callback returned to App final. */
  prepareOrigin(prepared: unknown): CompanionPreparedOriginObservation | null;
  /** Wrap the real factory-issued host; never manufacture an authorized binding or fake native host. */
  guardHost(prepared: CompanionPreparedSource, actualHost: CompanionHost): CompanionHost;
  close(prepared: unknown): void;
  invalidate(): void;
}
/** Captured once by the real native integration. Movement start is visibility only;
 * completion is after genuine D done/native connection finish, never increaseSteps.
 * Map/load signals come from a new genuine current Scene. No second step/RNG/transfer queue.
 * Precise opaque notice issuance and App final lifecycle slots remain the shared writers' seam. */
export interface CompanionNativeLifecycleIngress {
  movementStarted(): void;
  stepCompleted(): void;
  mapReady(cause: 'new-game' | 'transfer' | 'connection'): void;
  loadReady(): void;
  update(): void;
}

/** Narrow prepared-registration cells, separate from movement START primitive cells. */
export type CompanionOriginDataValue = string | number | boolean | null;
export type CompanionOriginOwnCell = Readonly<{
  owner: object; prototype: object | null; key: string;
}> & (Readonly<{ kind: 'data'; value: CompanionOriginDataValue }>
  | Readonly<{ kind: 'reference'; value: object }>);
/** A readonly observation from the actual source's existing private prepared book.
 * Neither these cells nor a copied DTO issues App/operation authority. */
export interface CompanionPreparedOriginObservation {
  readonly source: object;
  readonly prepared: CompanionPreparedSource;
  readonly application: object; readonly generation: number;
  readonly actionIdentity: string;
  readonly map: object; readonly mapId: number; readonly data: object;
  readonly player: object; readonly scene: object;
  readonly nativeEvent: object; readonly rawEvent: object;
  readonly originEventId: number;
  readonly cells: readonly CompanionOriginOwnCell[];
}
// Canonical native lease wrapper (birth/queue/current frame) and publisher/atomic materialization
// belong to the existing shared registry/atomic owners; not recreated in this source module.
// App final consumes exact materialized origin + private intent/lease/action identity only.
// It never executes a callback supplied on this observation.
