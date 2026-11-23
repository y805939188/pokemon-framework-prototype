/** Narrow production presentation seam; only the installer owns actual native/App closures. */
import type { BlackoutApplicationQueries } from '../../framework/app/blackout-ports';
import type { TravelEffectResult, TravelReceipt } from '../../framework/app/world-travel-operation';

export interface BlackoutPresentationApplication extends Pick<BlackoutApplicationQueries, 'isBlackoutOwner'> {
  readonly stateGeneration: number;
  isBlackoutPreparing(owner: object): boolean;
  /** Genuine App method. Missing capability refuses prepare, never pretends projection cleared.
   * The actual shared result may include a receipt; this adapter never uses DTO fields as authority. */
  clearBlackoutCompanionProjection?(owner: object): Promise<unknown>;
}
export interface BlackoutPresentationCallbacks {
  /** Actual private current App/F phase, source/native epoch and frame guard.
   * refresh also checks actual isWorldTravelReceipt and canPerformWorldTravel for this receipt;
   * normal arrival may still have an unloaded birth; cold requires its existing genuine source.
   * All callbacks and guards execute outside the business atomic final interval. */
  capture(owner: object, phase: 'announce' | 'prepare' | 'refresh', receipt?: TravelReceipt): () => void;
  /** The existing real Game_Message/frame ACK presenter, with original owner checks. */
  message(text: string, owner: object): Promise<TravelEffectResult>;
  /** Exactly the existing WorldTravelHost.effect('cancel-vehicles', owner). No duplicate dismount. */
  cancelVehicles(owner: object): Promise<TravelEffectResult>;
}
export interface BlackoutPresentationOptions {
  readonly root: Record<string, unknown>;
  readonly application: () => BlackoutPresentationApplication | null;
  readonly callbacks: BlackoutPresentationCallbacks;
  /** Installer uses parameters.TravelDebug === 'true'; no inferred development/global debug. */
  readonly debug: boolean;
  /** Explicit project switch ID from the installer. Zero/missing/invalid cannot silently ACK prepare. */
  readonly startingOverSwitch: number;
  readonly isProxy: (value: unknown) => boolean;
  readonly diagnostic: (reason: string) => void;
}
