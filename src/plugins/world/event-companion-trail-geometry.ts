/** WP11 relative coordinates, separate from physical transfer selection or passage direction zero. */
import { connectionAnchor } from '../../framework/rules/world-travel';
import type { MapGeometry } from '../../framework/rules/world-travel';
import type { MapConnectionRecord, WorldFact, WorldLocation, WorldPoint } from '../../framework/rules/world-data';
import type { CompanionRelation } from '../../framework/rules/event-companions';
export interface CompanionGeometryFact { readonly mapId: number; readonly fact: WorldFact<Readonly<MapGeometry>> }
const own = (value: unknown, key: string): unknown => {
  if (!value || typeof value !== 'object') throw Error('companion-geometry-data-invalid');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw Error('companion-geometry-own-data-required');
  return descriptor.value;
};
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
function point(value: unknown): WorldPoint {
  const mapId = own(value, 'mapId'), x = own(value, 'x'), y = own(value, 'y');
  if (!integer(mapId) || mapId <= 0 || !integer(x) || !integer(y)) throw Error('companion-geometry-point-invalid');
  return { mapId, x, y };
}
function endpoint(raw: unknown): MapConnectionRecord['a'] {
  const mapId = own(raw, 'mapId'), anchor = own(raw, 'anchor'), offset = own(raw, 'offset');
  if (!integer(mapId) || mapId <= 0 || !integer(offset)) throw Error('companion-connection-endpoint-invalid');
  if (anchor === 'N' || anchor === 'S' || anchor === 'E' || anchor === 'W') return { mapId, anchor, offset };
  const x = own(anchor, 'x'), y = own(anchor, 'y');
  if (!integer(x) || !integer(y)) throw Error('companion-connection-anchor-invalid');
  return { mapId, anchor: { x, y }, offset };
}
/** This accepts data facts only. It cannot load a map, move a character, or issue a native handle. */
export function companionRelationFromGeometry(companion: WorldLocation, leader: WorldLocation,
  connections: readonly MapConnectionRecord[], geometries: readonly CompanionGeometryFact[]): WorldFact<CompanionRelation> {
  try {
    const from = point(companion), to = point(leader);
    if (from.mapId === to.mapId) return { status: 'value', value: { connected: true, current: { ...from } } };
    if (!Array.isArray(connections) || !Array.isArray(geometries)) throw Error('companion-connection-data-invalid');
    const read = (id: number): WorldFact<Readonly<MapGeometry>> => {
      for (const item of geometries) if (own(item, 'mapId') === id) {
        const raw = own(item, 'fact'), status = own(raw, 'status');
        if (status === 'absent') return { status: 'absent' };
        if (status === 'invalid' || status === 'unavailable') return { status, reason: 'companion-map-geometry-not-ready' };
        if (status !== 'value') throw Error('companion-map-geometry-fact-invalid');
        const value = own(raw, 'value'), mapId = own(value, 'mapId'), width = own(value, 'width'), height = own(value, 'height');
        if (mapId !== id || !integer(width) || !integer(height) || width < 0 || height < 0) throw Error('companion-map-geometry-invalid');
        return { status: 'value', value: { mapId: id, width, height } };
      }
      return { status: 'unavailable', reason: 'companion-map-geometry-missing' };
    };
    for (const raw of connections) {
      const a = endpoint(own(raw, 'a')), b = endpoint(own(raw, 'b'));
      const pair = a.mapId === from.mapId && b.mapId === to.mapId ? [a, b] as const : b.mapId === from.mapId && a.mapId === to.mapId ? [b, a] as const : null;
      if (!pair) continue;
      const source = read(from.mapId); if (source.status !== 'value') return source;
      const destination = read(to.mapId); if (destination.status !== 'value') return destination;
      if (!source.value.width || !source.value.height || !destination.value.width || !destination.value.height) continue;
      const first = connectionAnchor(pair[0], source.value), second = connectionAnchor(pair[1], destination.value);
      const x = from.x + second.x - first.x, y = from.y + second.y - first.y;
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw Error('companion-connection-coordinate-overflow');
      // Relative coordinates may lie outside the leader map. They are not a physical target.
      return { status: 'value', value: { connected: true, current: { mapId: to.mapId, x, y } } };
    }
    return { status: 'value', value: { connected: false, current: { ...from } } };
  } catch (error) { return { status: 'invalid', reason: error instanceof Error ? error.message : String(error) }; }
}
