/** Companion service-owned contracts. Real GameApplication admission remains a separate integration. */
import type { CompanionHost, CompanionResult } from './event-companion-operation';
import type { EventCompanionState } from '../rules/world-state';
import type { TravelAtomicPort } from './world-travel-ports';
import type { CompanionRuntimePresentation } from './companion-lifecycle-data';
import type { CompanionLifecycle } from './event-companion-lifecycle';

/** Informational runtime identity. Only the service's private issued registry authorizes work. */
export interface CompanionApplicationLease { readonly owner: object; readonly generation: number }
export interface CompanionApplicationBinding extends CompanionApplicationLease {
  isOperationCurrent(owner: object, generation: number): boolean;
  /** Exact current retiring entry only; never an authorization to retire another surface. */
  isProjectionRetiring(owner: object, generation: number): boolean;
}
export interface EventCompanionApplicationOptions {
  /** Actual GameApp-private runtime book; the service keeps it in a native private slot, never on options/native. */
  readonly lifecycle?: CompanionLifecycle;
  /** Actual atomicWorldContent writer plus App final admission; no legacy replace fallback. */
  readonly atomic: TravelAtomicPort;
  /** Providers below run only in prepare or after the native assignment interval. */
  generation(): number;
  canStart(): boolean;
  authorVisible(): boolean;
  /** Retain this actual binding object with the native surface/resource serial in a private
   * registry. A later DTO, origin or callback boolean cannot recreate that membership. */
  bind(binding: CompanionApplicationBinding): CompanionHost;
  /** Retire this exact projection before release; the next bind creates a fresh native surface.
   * Resolve the original private binding plus exact surface/resource serial; recheck before
   * and after native hooks. Revoke old surface before cleanup, preserving any successor. */
  retireProjection(binding: CompanionApplicationBinding): void;
  released(): void;
}
export type CompanionProjectionRepair =
  | { readonly status: 'clean'; readonly generation: number; readonly revision: number }
  | { readonly status: 'pending' | 'failed'; readonly generation: number; readonly revision: number;
      readonly attempts: 0 | 1; readonly reason: string };
export type CompanionRepairResult = CompanionResult | { readonly status: 'idle' | 'blocked' | 'exhausted' };
/** Signature for the eventual real App thin integration, not a substitute GameApplication. */
export interface EventCompanionApplicationService {
  readonly active: boolean;
  readonly currentLease: CompanionApplicationLease | null;
  readonly projectionRepair: CompanionProjectionRepair;
  runtimePresentation(): CompanionRuntimePresentation;
  /** Read-only exact binding membership, captured from the real service by native composition.
   * Active/retiring membership is separate from the binding's two phase queries. */
  isBindingIssued(candidate: unknown): boolean;
  perform(requestId: string, action: unknown): Promise<CompanionResult>;
  cancel(requestId: string): CompanionResult;
  bootstrapProjection(): Promise<CompanionResult>;
  recoverPending(): Promise<CompanionRepairResult>;
  readRecords(): readonly EventCompanionState[];
  invalidate(): void;
}
