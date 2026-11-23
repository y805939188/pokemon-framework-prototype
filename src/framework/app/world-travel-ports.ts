/** Shared contracts consumed by the real E3 App parent and its MZ composition adapter. */
import type { FlyDestination } from '../rules/region-map';
import type { WorldLocation, WorldPoint } from '../rules/world-data';
import type { GameState } from '../rules/state';
import type { AtomicFieldQueryState, AtomicStateResult, CompletedWorldStepOutcome, WorldTravelLeaseSource, WorldTravelLeaseCurrent, WorldMapBirthLifecycle } from './ports';
import type { TravelHost, TravelReceipt, TravelRunResult, TravelEffectResult, TravelHostEffect } from './world-travel-operation';
export type WorldTravelRequest = { readonly kind: 'fly' | 'dig' | 'teleport' | 'escape-rope'; readonly memberId?: string; readonly selection?: FlyDestination | null }
  | { readonly kind: 'connection' }
  | { readonly kind: 'transfer'; readonly target: WorldLocation; readonly preserveSurfing: boolean };
export interface WorldTravelSourceFacts {
  readonly characterHome: WorldPoint | null; readonly globalHome: WorldPoint | null;
  readonly debug: boolean; readonly connectionBypass: boolean;
}
export interface WorldTravelStepFacts { readonly ice: boolean; readonly regionId: number; readonly terrainTag: number; readonly sceneActive: boolean }
export interface WorldTravelHost extends Omit<TravelHost, 'confirm' | 'effect' | 'waitFlyTail'> {
  confirm(kind: 'dig' | 'teleport', target: Readonly<WorldLocation>, owner: object): Promise<'confirmed' | 'cancelled'>;
  effect(kind: TravelHostEffect, owner: object): Promise<TravelEffectResult>;
  waitFlyTail(milliseconds: 250, owner: object): Promise<TravelEffectResult>;
  /** Opaque registered source from the actual native transfer producer; no writable control cell. */
  readonly nativeLeaseSource: WorldTravelLeaseSource;
  /** Materialized facts from the current native configuration, never an authorization DTO. */
  facts(): WorldTravelSourceFacts;
  /** True target facts for a genuine connection arrival. App supplies the step identity and native location. */
  connectionStepFacts(owner: object, receipt: TravelReceipt, physicalLease: WorldTravelLeaseCurrent, stepId: string): WorldTravelStepFacts | Promise<WorldTravelStepFacts>;
  /** Retire the actual adopted D gateway using its real outcome; never invoke App D again. */
  finishConnectionStep(owner: object, receipt: TravelReceipt, outcome: CompletedWorldStepOutcome): void;
  cancelConnectionStep(owner: object, receipt: TravelReceipt): void;
  /** Called at most once after a deferred request and successful final install. Native code rechecks save gates. */
  resumeDeferredSave(): void;
  /** Successful after-arrival Retry only. The original physical receipt/owner remain unchanged.
   * Invoke the App's final guard before retiring the exact original proof; never issue a transfer. */
  releaseRecoveredArrival?(owner: object, physical: WorldTravelLeaseCurrent, birth: WorldMapBirthLifecycle, guard: () => void): TravelEffectResult;
  /** Retire only this exact registry/native pending lease. Same-coordinate foreign requests survive.
   * Nonthrowing; failed cleanup keeps the parent save gate until explicit recovery. */
  retireTransfer(owner: object, receipt: TravelReceipt): TravelEffectResult;
}
export interface TravelAtomicPort {
  <T>(prepare: () => (actual: AtomicFieldQueryState & { readonly generation: number }) => AtomicStateResult<T>): T;
}
export interface PreparedTravelEntry {
  apply(game: GameState): GameState;
  /** Pure runtime changes in the same final interval as installation. */
  installed(game: GameState): void;
}
export type WorldTravelOutcome = TravelRunResult | { readonly status: 'completed'; readonly step: CompletedWorldStepOutcome };
