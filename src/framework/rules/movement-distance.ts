/** Distance counters only. Completed steps, encounters and movement permission have other owners. */
export interface MovementDistanceMode {
  readonly surfing: boolean; readonly cycling: boolean; readonly diving: boolean;
  readonly nativeVehicle: 'walk' | 'boat' | 'ship' | 'airship';
  /** A confirmed sliding observation, not an inference from an unknown terrain tag. */
  readonly ice: boolean;
}
export interface MovementDistanceDelta {
  readonly distance_walked: number; readonly distance_cycled: number;
  readonly distance_surfed: number; readonly distance_slid_on_ice: number;
}
export type MovementDistanceResult = { readonly status: 'value'; readonly delta: MovementDistanceDelta }
  | { readonly status: 'unavailable'; readonly reason: string };
export function movementDistanceDelta(distance: number, mode: MovementDistanceMode): MovementDistanceResult {
  if (!Number.isSafeInteger(distance) || distance < 0) return { status: 'unavailable', reason: 'movement-distance-invalid' };
  if (typeof mode.surfing !== 'boolean' || typeof mode.cycling !== 'boolean' || typeof mode.diving !== 'boolean' || typeof mode.ice !== 'boolean'
    || !['walk', 'boat', 'ship', 'airship'].includes(mode.nativeVehicle)) return { status: 'unavailable', reason: 'movement-distance-mode-unavailable' };
  if (mode.nativeVehicle === 'airship' || mode.cycling && (mode.surfing || mode.diving || mode.nativeVehicle !== 'walk')
    || !mode.surfing && !mode.diving && mode.nativeVehicle !== 'walk' || mode.ice && (mode.surfing || mode.diving || mode.cycling)) {
    return { status: 'unavailable', reason: 'movement-distance-mode-unavailable' };
  }
  const surf = mode.surfing || mode.diving;
  return { status: 'value', delta: Object.freeze({ distance_walked: !surf && !mode.cycling ? distance : 0,
    distance_cycled: mode.cycling ? distance : 0, distance_surfed: surf ? distance : 0,
    distance_slid_on_ice: mode.ice ? distance : 0 }) };
}
