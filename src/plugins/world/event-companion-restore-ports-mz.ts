/** A newly reconstructed readonly page view, never a retained Game_Event or operation permit. */
import type { CompanionFactsContext } from './event-companion-map-resources-mz';
import type { WorldTravelLeaseSource } from '../../framework/app/ports';
import type { MapGeometry } from '../../framework/rules/world-travel';
import type { CompanionTrailFactsRequest, CompanionPreparedTrailFacts } from './event-companion-facts-mz';
import type { WorldFact, WorldDirection, WorldPoint } from '../../framework/rules/world-data';

export interface CompanionRestoredPageEventMZ {
  readonly eventId: number; readonly pageIndex: number; readonly x: number; readonly y: number;
  readonly characterName: string; readonly tileId: number; readonly through: boolean; readonly priorityType: number;
}
export interface CompanionRestorePreparedMapsMZ {
  readonly handle: object;
  readonly origin: 'pinned-mz-restored-pages';
  readonly geometries: readonly { readonly mapId: number; readonly fact: WorldFact<Readonly<MapGeometry>> }[];
}
export interface CompanionRestoreFactsMZOptions {
  current(): CompanionFactsContext | null;
  readonly nativeLeaseSource: WorldTravelLeaseSource;
}
export interface CompanionRestoreFactsMZ {
  prepare(mapIds: readonly number[]): Promise<WorldFact<CompanionRestorePreparedMapsMZ>>;
  isCurrent(handle: unknown): boolean;
  covers(handle: unknown, mapId: number): boolean;
  canEnter(handle: unknown, point: WorldPoint, direction: WorldDirection): WorldFact<boolean>;
  retire(handle: unknown): void;
  invalidate(): void;
}

/** Called only by the known production Source's real restore/recover admission.
 * The resulting trail remains facts, never business carry/START/201 authority. */
export interface CompanionRestoreTrailFactsMZ {
  prepareRestoreTrail(request: CompanionTrailFactsRequest): Promise<WorldFact<CompanionPreparedTrailFacts>>;
}
