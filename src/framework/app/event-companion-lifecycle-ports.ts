/** Actual native lifecycle facts; shape/IDs cannot issue companion ownership. */
import type { CompanionResult } from './event-companion-operation';
import type { CompanionRepairResult } from './event-companion-ports';
export type { WorldCompanionNativeTransferLifecycle, CompanionRuntimePresentation } from './companion-lifecycle-data';
export interface CompanionLifecycleApplication {
  /** Exact current canonical observation only. The App issues its own private action/once lease. */
  completeNativeCompanionTransfer(observation: unknown): Promise<CompanionResult>;
  /** Existing genuine mapBirth.birth is enough to request fresh projection; no DTO/new registry. */
  restoreEventCompanionsAtMap(birth: unknown): Promise<CompanionRepairResult>;
}
