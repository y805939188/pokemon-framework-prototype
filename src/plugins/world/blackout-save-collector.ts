/** F save coordination seam. The one existing native collector owns every request/closure. */
import type { BlackoutApplicationQueries, BlackoutTransferAncestor, BlackoutNonTransferCompletion } from '../../framework/app/blackout-ports';
import type { TravelEffectResult, TravelReceipt } from '../../framework/app/world-travel-operation';
import type { WorldTravelLeaseCurrent, WorldTravelLeaseSource, WorldBlackoutSourceLifecycle } from '../../framework/app/ports';

export interface BlackoutSaveApplication extends BlackoutApplicationQueries {
  readonly stateGeneration: number;
  /** Actual App-private F/E3 pending-save admission; never a host-supplied ready boolean. */
  deferWorldTravelSave(): boolean;
}
/** Immutable observation returned by the installed collector, never a caller-issued permit. */
export interface BlackoutNativeSaveRequest {
  /** Stable original request observation across exact C1 receiver relocation; never replaced by a DTO copy. */
  readonly identity: object; readonly application: object; readonly generation: number;
  readonly physical: WorldTravelLeaseCurrent | null;
  readonly manager: object; readonly scene: object; readonly player: object;
  readonly map: object; readonly mapId: number; readonly data: object;
  readonly x: number; readonly y: number;
}
export interface BlackoutNativeSaveCollector {
  /** Pure read of the existing single private deferred slot. */
  current(): BlackoutNativeSaveRequest | null;
  /** Exact identity compare-and-take. Removes only that request; preserves any successor.
   * Returns the original installed native request function + original arguments, bound to the
   * already-validated actual target Scene. A null result means no request was consumed.
   * This does not create a request. No host/provider calls occur in its comparison/store. */
  take(expected: BlackoutNativeSaveRequest, targetScene: object): (() => unknown) | null;
}
/** Native receiver relocation observation, issued only by the existing connection/C1 context
 * after the actual App-issued returned hook accepted this genuine new Map. It does not claim
 * that onTransferEnd ran on the new Scene and conveys no business completion permission. */
export interface BlackoutNonTransferReturnedReceiver {
  readonly request: BlackoutNativeSaveRequest;
  /** Scene on which this original request's real completed onTransferEnd was observed. */
  readonly previousScene: object;
  /** Genuine currently started C1 returned Map; different from previousScene. */
  readonly scene: object;
  /** Private issued-context/receiver serial + current App/gen/player/map/data/birth/reserve epoch.
   * Must allow only this collector's exact successful take after checks; arbitrary clear/null,
   * raw goto, raw reserve/new201/ABA/newgen/old context or a successor cannot inherit it. */
  guard(): void;
}
/** Observation captured by the existing private native source entry, not a grant/permission.
 * Actual App-issued completion nonce remains the only non-transfer terminal authority. */
export interface BlackoutNonTransferSourceObservation {
  readonly handoff: WorldBlackoutSourceLifecycle;
  /** Exact current physical record captured at genuine arm, possibly an actual E3 ancestor. */
  readonly physical: WorldTravelLeaseCurrent | null;
  /** Optional exact C1 relocation. Consumer can inherit only the old Scene's actually completed
   * boundary for this same original request; the new receiver keeps its own genuine source frame.
   * Legacy same-Scene observations have no relocation and retain their ordinary boundary gate. */
  readonly returnedReceiver?: BlackoutNonTransferReturnedReceiver;
  /** Known private-entry/native-epoch guard. Allows only its exact source retirement and its
   * observed exact native releaseArrival, rejects foreign null/source/serial/Map/birth changes.
   * It does not require raw snapshot shell identity to stay unchanged during natural retirement. */
  guard(): void;
}
export interface BlackoutNativeSaveOptions {
  readonly root: Record<string, unknown>;
  readonly application: () => BlackoutSaveApplication | null;
  readonly source: WorldTravelLeaseSource;
  readonly isProxy: (value: unknown) => boolean;
  /** Captures the same producer's persistent native reservation epoch and installed methods.
   * Guard throws on any later raw reserve (including same-point reserve-clear ABA),
   * player replacement or method replacement. Existing pending requests may be captured;
   * the helper separately requires no pending request at its actual consumption boundary. */
  readonly captureNativeEpoch: (player: object) => (() => void);
  /** Optional for legacy transfer-only construction. A non-transfer call without this actual
   * producer capability must explicitly fail; no null-snapshot/host-bool fallback is allowed. */
  readonly captureNonTransferSource?: (owner: object) => BlackoutNonTransferSourceObservation;
  readonly collector: BlackoutNativeSaveCollector;
  readonly diagnostic: (reason: string) => void;
}
export interface BlackoutNativeSaveCoordinator {
  adoptDeferredSave(owner: object, ancestor: BlackoutTransferAncestor): TravelEffectResult;
  transferCompleted(owner: object, receipt: TravelReceipt): TravelEffectResult;
  /** No TravelReceipt/native transfer is synthesized. Legacy absence is an explicit unsupported
   * capability to the actual App caller; a new coordinator implements this after nonce validation. */
  nonTransferCompleted?(owner: object, completion: BlackoutNonTransferCompletion): TravelEffectResult;
  /** Called around the actual installed onTransferEnd body. Only completed observes an epoch;
   * failure never fabricates a completed boundary or retries a refused save. */
  observeTransferEnd(scene: object, phase: 'running' | 'completed' | 'failed'): void;
  /** Called before retaining this actual native request. The actual App and canonical private
   * source are queried here. retain means the existing collector must store this one request;
   * pass means forward normally; refused means consume this request with a diagnostic. */
  beforeRequest(scene: object): 'retain' | 'pass' | 'refused';
  /** Called after the installed collector retained its real function+arguments, so a terminal
   * grant whose real boundary was already observed can consume that exact request once. */
  requestRetained(request: BlackoutNativeSaveRequest): void;
}
