/** Read-only movement-start observations. These DTOs never authorize App statistics writes. */
import type { WorldFact } from '../../framework/rules/world-data';
export interface NativeMovementStartPoint { readonly x: number; readonly y: number }
export interface NativeMovementStartContext {
  readonly application: object; readonly generation: number;
  readonly player: object; readonly map: object; readonly mapId: number;
}
export interface NativeMovementStartFacts {
  readonly surfing: WorldFact<boolean>; readonly cycling: WorldFact<boolean>; readonly diving: WorldFact<boolean>;
  readonly nativeVehicle: WorldFact<'walk' | 'boat' | 'ship' | 'airship'>;
  readonly ice: WorldFact<boolean>; readonly bridge: WorldFact<boolean>; readonly ledge: WorldFact<boolean>;
  readonly forcedRoute: WorldFact<boolean>;
}
interface StartedMovement {
  readonly context: NativeMovementStartContext;
  readonly from: NativeMovementStartPoint; readonly to: NativeMovementStartPoint;
  readonly facts: NativeMovementStartFacts;
}
export type NativeMovementStartObservation =
  | (StartedMovement & { readonly kind: 'straight'; readonly direction: 2 | 4 | 6 | 8 })
  | (StartedMovement & { readonly kind: 'jump'; readonly offset: NativeMovementStartPoint });
/** The independent new module owns capture/once logic; the sole native installer alone wraps
 * actual Player moveStraight/jump. No distance is committed through completed-step/connection. */
export interface NativeMovementStartConsumer {
  observe(observation: NativeMovementStartObservation): void;
  unavailable(reason: string): void;
}
