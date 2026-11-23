/** Ordinary companion intents. Native observations and prepared values never issue App ownership. */
import type { CompanionAction, CompanionHost, CompanionResult } from './event-companion-operation';
import type { CompanionApplicationBinding, CompanionRepairResult } from './event-companion-ports';
import type { CompanionRemoval } from '../rules/event-companions';
import type { EventCompanionState } from '../rules/world-state';
import type { WorldFact, WorldLocation } from '../rules/world-data';
import type { WorldCompanionPreparedOriginLifecycle } from './ports';
export type EventCompanionIntent = { readonly kind: 'register'; readonly eventId: number; readonly name?: string; readonly commonEventId?: number }
  | { readonly kind: 'remove'; readonly removal: CompanionRemoval } | { readonly kind: 'recover' };
export type EventCompanionPreparationIntent = EventCompanionIntent | { readonly kind: 'player-moved'; readonly player: WorldLocation; readonly instant: boolean };
export interface EventCompanionIntentReceipt { readonly handle: object; readonly result: Promise<CompanionResult> }
export interface EventCompanionPrepared { readonly handle: object; readonly action: CompanionAction }
/** One source sampler and the same actual native factory as F/bootstrap. All methods run outside-final. */
export interface EventCompanionProductionChannel {
  prepare(intent: EventCompanionPreparationIntent, records: readonly EventCompanionState[]): Promise<WorldFact<EventCompanionPrepared>>;
  bind(prepared: EventCompanionPrepared, binding: CompanionApplicationBinding): CompanionHost;
  /** Calls the real source's prepareOrigin then the canonical private publisher. */
  publishOrigin(prepared: EventCompanionPrepared): WorldCompanionPreparedOriginLifecycle | null;
  retireOrigin(origin: WorldCompanionPreparedOriginLifecycle): void;
  close(prepared: EventCompanionPrepared): void;
}
export interface OrdinaryEventCompanionApplication {
  beginEventCompanion(intent: EventCompanionIntent): EventCompanionIntentReceipt;
  cancelEventCompanion(handle: object): CompanionResult;
  recoverEventCompanionProjection(): Promise<CompanionRepairResult>;
  /** Manual/native intent toward the actual current player, not a claimed completed-step DTO. */
  advanceEventCompanions(instant?: boolean): Promise<CompanionResult>;
}
