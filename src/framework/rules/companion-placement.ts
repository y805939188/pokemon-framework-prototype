/** A connected follower has one canonical logical location and a separate render-frame point. */
import { indexMapConnections, resolveConnectionTarget, validateTravelTarget } from './world-travel';
import type { MapGeometryReader } from './world-travel';
import type { MapConnectionRecord, WorldFact, WorldLocation } from './world-data';

export interface CompanionPlacement {
  /** Geometry-valid location to persist and to query source terrain. */
  readonly logical: WorldLocation;
  /** The same point in the active leader/render map; x/y may be outside its rectangle. */
  readonly relative: WorldLocation;
  readonly connectionRecord: number | null;
}
/** Pure normalization of an already-computed relative behind/partial-motion point.
 * It cannot reserve a player transfer, replace current-map data, or authorize a companion write. */
export function normalizeCompanionPlacement(relative: WorldLocation, connections: readonly MapConnectionRecord[], read: MapGeometryReader): WorldFact<CompanionPlacement> {
  let geometry: ReturnType<MapGeometryReader>;
  try { geometry = read(relative.mapId); } catch { return { status: 'unavailable', reason: 'companion-frame-geometry-unavailable' }; }
  const checked = validateTravelTarget(relative, geometry);
  if (checked.status === 'ready') return { status: 'value', value: { logical: { ...relative }, relative: { ...relative }, connectionRecord: null } };
  if (checked.status === 'missing') return { status: 'absent' };
  if (checked.status !== 'invalid' || checked.reason !== 'target-out-of-bounds') return { status: checked.status, reason: checked.reason };
  const mapped = resolveConnectionTarget(indexMapConnections(connections), relative, read);
  if (mapped.status !== 'target') return { status: mapped.status === 'invalid' ? 'invalid' : 'unavailable',
    reason: 'reason' in mapped ? mapped.reason : 'companion-connected-point-unresolved' };
  return { status: 'value', value: { logical: { ...mapped.target }, relative: { ...relative }, connectionRecord: mapped.recordIndex } };
}
