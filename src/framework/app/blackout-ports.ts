/** F native contracts. Types describe data; only actual App/native private membership grants authority. */
import type { BlackoutCheckpoint } from '../rules/blackout-checkpoint';
import type { WorldLocation } from '../rules/world-data';
import type { TravelEffectResult, TravelReceipt } from './world-travel-operation';
import type { WorldMapEntry } from '../rules/world-state';

declare const nonTransferCompletionBrand: unique symbol;
/** Opaque App-issued terminal identity. Never a TravelReceipt, location or caller DTO. */
export interface BlackoutNonTransferCompletion { readonly [nonTransferCompletionBrand]: true }

export interface BlackoutTransferAncestor { readonly owner: object; readonly receipt: TravelReceipt }
/** Frozen once by the actual App F entry, never reconstructed from these fields by a host. */
export interface BlackoutSourceContext {
  readonly generation: number; readonly kind: 'battle' | 'field' | 'resume';
  readonly map: object; readonly mapId: number; readonly player: object; readonly scene: object;
  readonly x: number; readonly y: number; readonly data: object | null;
  readonly birth: object | null;
  readonly battleHandle: object | null;
  readonly ancestor: BlackoutTransferAncestor | null;
}
export interface BlackoutConfiguration {
  readonly characterHome: WorldLocation | null; readonly globalHome: WorldLocation | null;
}
/** The composition root uses the actual GameApplication. These are private-registry queries,
 * not caller-supplied predicates or a substitute App made from () => true callbacks. */
export interface BlackoutApplicationQueries {
  isBlackoutOwner(owner: object): boolean;
  /** Only the actual live prepare call, not every active F stage. */
  isBlackoutPreparing(owner: object): boolean;
  /** Actual fresh-entry wait, including current atomic state/content/source validation. */
  isBlackoutEntering(owner: object): boolean;
  isBlackoutSourceContext(owner: object, context: unknown): boolean;
  isBlackoutTransferAncestor(owner: object, parentOwner: object, parentReceipt: object): boolean;
  isBlackoutReturnComplete(owner: object, receipt: object): boolean;
  isBlackoutNonTransferComplete(owner: object, completion: object): boolean;
  ownsBlackoutNativeEntry(entry: WorldMapEntry, scene: object): boolean;
}
/** All methods run outside the atomic final interval. Transfer/preload/receipt/serial still belong
 * to the existing WorldTravelHost and its one canonical opaque native source. */
export interface WorldBlackoutHost {
  configuration(): BlackoutConfiguration;
  /** Fresh field entry only, before settlement/checkpoint creation. The actual F owner keeps
   * the save barrier while two messages and the native audio/screen fade complete. */
  enterField?(owner: object): Promise<TravelEffectResult>;
  /** Retire only this owner's presentation lease, also on cancellation/failed entry. */
  leaveField?(owner: object, reason?: 'timeline-replaced'): TravelEffectResult;
  /** Require the exact context recognized by the actual App. A genuine old Map may only use
   * already-recorded birth/queue membership; Battle/Dex/Menu uses a fresh private goto handshake. */
  armSource(owner: object, context: BlackoutSourceContext): TravelEffectResult;
  /** Wait a real native stable frame and genuine Map readiness/no pending transfer. The App
   * rechecks materialized sourceHandoff/birth/mapData; this result is not authorization. */
  waitSource(owner: object, context: BlackoutSourceContext): Promise<TravelEffectResult>;
  /** Exact source context/serial only, idempotent and nonthrowing; foreign/successor survive. */
  retireSource(owner: object, context: BlackoutSourceContext): TravelEffectResult;
  announce(kind: 'show-return-message' | 'debug-missing-home', checkpoint: Readonly<BlackoutCheckpoint>, owner: object): Promise<TravelEffectResult>;
  /** Idempotent ordered WP61 prefix only. No reserve, entry, checkpoint/escape write, or save. */
  prepare(checkpoint: Readonly<BlackoutCheckpoint>, owner: object): Promise<TravelEffectResult>;
  /** Sync Game_Map.requestRefresh, after real arrival and before terminal business installation.
   * Game_Player.refresh or async WorldTravelHost.effect('refresh') cannot satisfy this method. */
  requestMapRefresh(owner: object, receipt: TravelReceipt): TravelEffectResult;
  /** Migrate only an already-observed real native request along this App-private parent relation.
   * No request => no new save; reuse the one existing closure, not a second save queue/flag. */
  adoptDeferredSave(owner: object, ancestor: BlackoutTransferAncestor): TravelEffectResult;
  /** Core has synchronously installed terminal state and retired the entire parent. Publish a
   * private terminal-ready grant; do NOT immediately save before target onTransferEnd. Coalesce
   * any inherited request with the actual target request after the real boundary is observed.
   * If that epoch was already observed (cold recovery), consume only a real retained request.
   * A native save-gate refusal is consumed without automatic retry. */
  transferCompleted(owner: object, receipt: TravelReceipt): TravelEffectResult;
  /** Same terminal grant, for completed no-home/home-map-missing with no transfer receipt.
   * Consume only an existing real retained request after its source boundary; never create a
   * request, target boundary or TravelReceipt. Missing support is explicit unavailable. */
  nonTransferCompleted?(owner: object, completion: BlackoutNonTransferCompletion): TravelEffectResult;
}
