import type { EventCompanionProductionChannel } from './event-companion-public-ports';
/** F-only projection connection. Shapes convey no ownership; actual instances/private membership do. */
import type { CompanionProjectionReset, CompanionResetOptions } from './event-companion-projection-reset';
import type { CompanionHost } from './event-companion-operation';
import type { CompanionApplicationBinding, EventCompanionApplicationService } from './event-companion-ports';
import type { EventCompanionState } from '../rules/world-state';

export interface BlackoutProjectionResources {
  readonly hadSurface: boolean | null;
  readonly spritesRemaining: number | null; readonly charactersRemaining: number | null;
  readonly motionsRemaining: number | null; readonly maskDetached: boolean | null;
}
/** The actual reset controller issues receipt identity; cloning these fields never issues a receipt. */
export interface BlackoutProjectionOutcome {
  readonly status: 'cleared' | 'fallback' | 'rejected' | 'cancelled'; readonly receipt: object;
  readonly resources: BlackoutProjectionResources; readonly diagnostics: readonly string[]; readonly reason?: string;
}
/** Only the actual canonical helper's original prepareTerminal implementation may produce accept.
 * App captures it outside-final. accept only reads private epoch/entry/exact receipt/terminal state;
 * it never calls App phase, source, generation providers, native hooks or diagnostic functions. */
export interface BlackoutProjectionTerminal {
  readonly owner: object; readonly generation: number;
  accept(owner: object, generation: number): boolean;
}
export interface BlackoutProjectionResetController {
  run(owner: object): Promise<BlackoutProjectionOutcome>;
  cancel(owner: object): void;
  prepareTerminal(receipt: unknown): BlackoutProjectionTerminal | null;
  /** Outside-final only. Actual App commit query must acknowledge the exact receipt/revision. */
  committed(receipt: unknown, revision: number): void;
  /** Separate current-generation aborted-child recovery; never a business-clear acknowledgment. */
  abort(receipt: unknown, recoveryAttempt: object): void;
  recoverPending(): readonly Readonly<{ status: 'cleared' | 'fallback' | 'rejected'; resources: BlackoutProjectionResources; diagnostics: readonly string[]; reason?: string }>[];
  invalidate(): void;
}
/** These are real GameApplication methods; an object with true callbacks is not an application. */
export interface BlackoutProjectionApplication {
  isBlackoutPreparing(owner: object): boolean;
  isBlackoutCompanionClearCommitted(owner: object, receipt: object, revision: number): boolean;
  isBlackoutCompanionClearAborted(owner: object, receipt: object, recoveryAttempt: object): boolean;
  /** Native prepare calls between cancel-vehicles and starting-over. App privately issues its child. */
  clearBlackoutCompanionProjection(owner: object): Promise<BlackoutProjectionOutcome>;
}
export interface BlackoutProjectionConnection {
  readonly application: BlackoutProjectionApplication;
  readonly service: EventCompanionApplicationService;
  generation(): number;
  readRecords(): readonly EventCompanionState[];
  /** One App-owned canonical CJS controller during this exact connect call. */
  createResetController(options: CompanionResetOptions): CompanionProjectionReset;
}
export interface BlackoutProjectionChannel {
  /** Optional ordinary source sampler, using this same actual service/factory. */
  readonly companions?: EventCompanionProductionChannel;
  readonly controller: BlackoutProjectionResetController;
  bind(binding: CompanionApplicationBinding): CompanionHost;
  retireProjection(binding: CompanionApplicationBinding): void;
  authorVisible(): boolean;
  dispose(): void;
}
/** Actual composition constructs the production factory/controller with this exact App/service.
 * Connect/capture is outside-final after App construction. A returned DTO is not reset authority;
 * the App binds the canonical helper's original methods and private terminal membership. */
export interface BlackoutProjectionPort {
  connect(connection: BlackoutProjectionConnection): BlackoutProjectionChannel;
}
