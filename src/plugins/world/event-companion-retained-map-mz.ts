/** Readonly source facts captured by the existing transfer producer, never App ownership. */
import type { CompanionPlacement } from '../../framework/rules/companion-placement';
import type { WorldFact, WorldLocation } from '../../framework/rules/world-data';
import type { WorldTravelLeaseSource } from '../../framework/app/ports';

export interface CompanionRetainedOwnCellMZ {
  readonly owner: object; readonly prototype: object | null; readonly key: string;
  readonly present: boolean;
  readonly value: object | string | number | boolean | null | undefined;
}
export interface CompanionRetainedMapFrameMZ {
  readonly mapId: number;
  /** Actual source data, native event array and tileset flags captured while the qualified source
   * was still current. Do not obtain these by invoking an old event against the new $dataMap. */
  readonly data: object; readonly events: object; readonly flags: object;
  /** Qualification-time data/reference/absence cells. Mutable Game_Map._mapId/_events and old
   * Scene active flags legitimately change during transfer and must not be mistaken for this data. */
  readonly cells: readonly CompanionRetainedOwnCellMZ[];
}
export interface CompanionRetainedMapsObservationMZ {
  readonly application: object; readonly generation: number;
  readonly content: object; readonly contentIdentity: string;
  /** Actual consumed native serial and the current target canonical publication epoch. */
  readonly serial: object; readonly epoch: object; readonly sourceScene: object;
  readonly manager: object; readonly scene: object; readonly birth: object; readonly queue: object;
  readonly map: object; readonly mapId: number; readonly player: object; readonly data: object;
  /** Retain only frames required by this actual connection/follow lifecycle, not a map cache. */
  readonly frames: readonly CompanionRetainedMapFrameMZ[];
}
export interface CompanionRetainedMapSourceMZ {
  readonly nativeLeaseSource: WorldTravelLeaseSource;
  /** Actual TransferHost private own data cell; only that producer writes it. Facts snapshot and
   * recheck it by descriptor. No callback, setter or public PSFlow access is part of this seam. */
  readonly current: CompanionRetainedMapsObservationMZ | null;
}

/** Known source wraps this same prepared-handle query for native actual-motion observation.
 * It returns coordinates only, never ownership, completion, or an install receipt. */
export interface CompanionPreparedPlacementFactsMZ {
  placement(handle: unknown, actualRelative: WorldLocation): WorldFact<CompanionPlacement>;
}
