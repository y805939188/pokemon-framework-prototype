/** START statistics use the existing native producer registry; DTOs/IDs never grant write authority. */
import type { GameState } from '../rules/state';
import type { Content } from '../rules/types';
export interface MovementStartPoint { readonly x: number; readonly y: number }
export interface MovementStartMode {
  readonly surfing: boolean; readonly cycling: boolean; readonly diving: boolean; readonly ice: boolean;
  readonly bridge: boolean; readonly ledge: boolean; readonly forcedRoute: boolean;
  readonly nativeVehicle: 'walk' | 'boat' | 'ship' | 'airship';
}
/** Only the actual canonical publisher supplies these descriptor guards. A caller-provided
 * owner/key cell cannot register a source or issue a movement. Effective prototype-chain
 * absences/shadows must be captured, not interpreted as a fabricated false default. */
export interface MovementStartNativeCell {
  readonly owner: object; readonly prototype: object | null; readonly key: string;
  readonly present: boolean; readonly value: boolean | number | string | null | undefined;
}
interface MovementStartBase {
  /** Private publisher identities, carried by reference through materialization. */
  readonly permit: object; readonly observation: object;
  /** Exact existing FieldMoveHostOperation for Surf, or issued TravelReceipt for a connection.
   * Opaque identity only: App still authenticates its actual private parent/phase. */
  readonly parentContext?: object;
  readonly application: object; readonly generation: number;
  /** Actual installed values before the native movement body. Never cloned/reconstructed. */
  readonly game: GameState; readonly gameIdentity: string;
  readonly content: Content; readonly contentIdentity: string;
  readonly manager: object; readonly scene: object;
  readonly birth: object; readonly queue: object;
  readonly map: object; readonly mapId: number; readonly player: object; readonly data: object;
  readonly from: MovementStartPoint; readonly to: MovementStartPoint;
  readonly geometry: Readonly<{ width: number; height: number; scrollType: 0 | 1 | 2 | 3 }>;
  readonly mode: MovementStartMode;
  /** Atomic adapter validates these with descriptor-only reads outside App's pure finisher. */
  readonly cells: readonly MovementStartNativeCell[];
}
export type WorldMovementStartLifecycle =
  | (MovementStartBase & { readonly kind: 'straight'; readonly direction: 2 | 4 | 6 | 8 })
  | (MovementStartBase & { readonly kind: 'jump'; readonly offset: MovementStartPoint })
  /** Captured after actual native transfer consumption, before synchronous E3 confirmation.
   * Target genuine Scene may not have started and its current mapBirth.frame may still be null. */
  | (MovementStartBase & { readonly kind: 'connection'; readonly direction: 2 | 4 | 6 | 8;
      readonly parentContext: object; readonly sourceMapId: number; readonly physicalLease: object; readonly physicalSerial: object });
export interface MovementStartDelta {
  readonly distance_walked: number; readonly distance_cycled: number;
  readonly distance_surfed: number; readonly distance_slid_on_ice: number;
}
export type MovementStartResult = { readonly status: 'counted'; readonly delta: MovementStartDelta }
  | { readonly status: 'duplicate' }
  | { readonly status: 'refused' | 'unavailable'; readonly reason: string };
/** Proposed actual App consumer. Implementation follows this source-only checkpoint.
 * The observation argument is opaque: only exact current private canonical membership counts. */
export interface MovementStartApplicationQueries {
  readonly stateGeneration: number;
  recordNativeMovementStart(observation: unknown): MovementStartResult;
}

/** Sole native Surf landing producer completion; UI data cannot issue this identity. */
export interface OwnedSurfLandingProof {
  readonly receipt: object; readonly context: object;
  readonly start: Extract<WorldMovementStartLifecycle, { readonly kind: 'jump' }>;
  readonly epoch: object; readonly frame: object;
  readonly cells: readonly MovementStartNativeCell[];
}
