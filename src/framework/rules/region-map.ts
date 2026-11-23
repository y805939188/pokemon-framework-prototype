/** WP63 first-point queries and WP62 habitat projection over the same author data. */
import type { RegionMapPoint, RegionMapRecord, RegionMapSource, WorldFact, WorldPoint } from './world-data';
import type { WorldMapMetadata } from './world-state';

export interface RegionCell { x: number; y: number }
export type RegionSwitchReader = (id: number) => WorldFact<boolean>;
export type RegionProblem = { status: 'blocked'; reason: string } | { status: 'error'; reason: string };
export interface FlyDestination extends RegionCell { regionId: number; pointIndex: number; target: WorldPoint }
export interface FlyRegionInput {
  metadata: WorldFact<Readonly<WorldMapMetadata>>;
  regionMaps: RegionMapSource | undefined;
  visitedMaps: readonly number[];
  readSwitch: RegionSwitchReader;
}
const safe = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);
const cellKey = (p: RegionCell): string => `${p.x}/${p.y}`;
function validPoint(p: WorldPoint): boolean { return safe(p.mapId) && p.mapId > 0 && safe(p.x) && safe(p.y); }

/** Absent metadata/position means region zero; unavailable metadata does not. */
export function currentRegion(metadata: WorldFact<Readonly<WorldMapMetadata>>): { status: 'ready'; regionId: number } | RegionProblem {
  if (metadata.status === 'unavailable' || metadata.status === 'invalid') return { status: 'blocked', reason: `map-metadata-${metadata.status}` };
  if (metadata.status === 'value' && (!metadata.value || typeof metadata.value !== 'object' || Array.isArray(metadata.value))) return { status: 'error', reason: 'invalid-map-metadata' };
  const position = metadata.status === 'value' ? metadata.value.mapPosition : undefined;
  if (position && (!safe(position.regionId) || position.regionId < 0 || !safe(position.x) || !safe(position.y))) return { status: 'error', reason: 'invalid-map-position' };
  return { status: 'ready', regionId: position?.regionId ?? 0 };
}

export function regionPointVisibility(point: RegionMapPoint, readSwitch: RegionSwitchReader, wallMap = false): { status: 'ready'; visible: boolean } | RegionProblem {
  if (point.switchId === undefined) return { status: 'ready', visible: true };
  if (!safe(point.switchId)) return { status: 'error', reason: 'invalid-switch-id' };
  if (wallMap || point.switchId <= 0) return { status: 'ready', visible: false };
  let fact: WorldFact<boolean>;
  try { fact = readSwitch(point.switchId); } catch { return { status: 'blocked', reason: 'switch-unavailable' }; }
  if (fact.status !== 'value') return { status: 'blocked', reason: `switch-${fact.status}` };
  if (typeof fact.value !== 'boolean') return { status: 'error', reason: 'invalid-switch-value' };
  return { status: 'ready', visible: fact.value };
}

/** Keep pointIndex so a stale UI choice cannot silently select a different author record. */
export function deriveFlyDestinations(input: FlyRegionInput): { status: 'ready'; regionId: number; destinations: FlyDestination[] } | RegionProblem {
  const current = currentRegion(input.metadata);
  if (current.status !== 'ready') return current;
  const region = input.regionMaps?.regions.find(r => r.id === current.regionId);
  if (!region) return { status: 'error', reason: 'current-region-not-registered' };
  const first = new Set<string>(), destinations: FlyDestination[] = [];
  for (const [pointIndex, point] of region.points.entries()) {
    const key = cellKey(point);
    if (first.has(key)) continue;
    first.add(key);
    const visible = regionPointVisibility(point, input.readSwitch);
    if (visible.status !== 'ready') return visible;
    if (!visible.visible || !point.healingSpot) continue;
    if (!validPoint(point.healingSpot)) return { status: 'error', reason: 'invalid-fly-target' };
    if (!input.visitedMaps.includes(point.healingSpot.mapId)) continue;
    destinations.push({ regionId: region.id, x: point.x, y: point.y, pointIndex, target: { ...point.healingSpot } });
  }
  return { status: 'ready', regionId: region.id, destinations };
}

/** Re-derive immediately before execution; a map loader must still validate target geometry. */
export function validateFlySelection(selection: FlyDestination | null, input: FlyRegionInput): { status: 'selected'; destination: FlyDestination } | { status: 'cancelled' | 'stale' } | RegionProblem {
  if (selection === null) return { status: 'cancelled' };
  const result = deriveFlyDestinations(input);
  if (result.status !== 'ready') return result;
  const destination = result.destinations.find(d => d.regionId === selection.regionId && d.pointIndex === selection.pointIndex
    && d.x === selection.x && d.y === selection.y && d.target.mapId === selection.target.mapId && d.target.x === selection.target.x && d.target.y === selection.target.y);
  return destination ? { status: 'selected', destination } : { status: 'stale' };
}

/** All visible records contribute, including a later visible record in a hidden first record's cell. */
export function visibleRegionCells(region: Readonly<RegionMapRecord>, readSwitch: RegionSwitchReader): { status: 'ready'; cells: RegionCell[] } | RegionProblem {
  const cells = new Map<string, RegionCell>();
  for (const point of region.points) {
    const visible = regionPointVisibility(point, readSwitch);
    if (visible.status !== 'ready') return visible;
    if (visible.visible) cells.set(cellKey(point), { x: point.x, y: point.y });
  }
  return { status: 'ready', cells: [...cells.values()] };
}

export interface HabitatMap { metadata: Readonly<WorldMapMetadata>; containsSpecies: boolean }
/** The caller supplies C's current-version enumeration, including its documented v0 behavior. */
export function projectHabitatCells(region: Readonly<RegionMapRecord>, maps: readonly HabitatMap[], readSwitch: RegionSwitchReader): { status: 'ready'; cells: RegionCell[] } | RegionProblem {
  const visible = visibleRegionCells(region, readSwitch);
  if (visible.status !== 'ready') return visible;
  const allowed = new Set(visible.cells.map(cellKey)), cells = new Map<string, RegionCell>();
  for (const map of maps) {
    const m = map.metadata, p = m.mapPosition;
    if (!map.containsSpecies || !p || p.regionId !== region.id || m.flags?.includes('HideEncountersInPokedex')) continue;
    const width = m.mapSize?.width ?? 0, shape = width === 0 ? '1' : m.mapSize!.shape;
    if (!safe(width) || width < 0 || !safe(p.x) || !safe(p.y) || !/^[0-9x]*$/.test(shape)) return { status: 'error', reason: 'invalid-habitat-shape' };
    const w = width || 1;
    for (let k = 0; k < shape.length; k++) {
      if (!/[1-9]/.test(shape[k]!)) continue;
      const cell = { x: p.x + k % w, y: p.y + Math.floor(k / w) }, key = cellKey(cell);
      if (allowed.has(key)) cells.set(key, cell);
    }
  }
  return { status: 'ready', cells: [...cells.values()] };
}

/** WP63's player cursor uses shape length, not WP62's occupied characters. */
export function projectRegionPlayerCell(metadata: Readonly<WorldMapMetadata>, position: RegionCell, size: { width: number; height: number }): RegionCell | null {
  const p = metadata.mapPosition;
  if (!p) return null;
  if (!safe(size.width) || !safe(size.height) || size.width <= 0 || size.height <= 0 || !safe(position.x) || !safe(position.y)
    || position.x < 0 || position.x >= size.width || position.y < 0 || position.y >= size.height) throw new Error('invalid-player-map-geometry');
  const width = metadata.mapSize?.width ?? 0;
  if (width <= 0) return { x: p.x, y: p.y };
  const height = Math.ceil(metadata.mapSize!.shape.length / width);
  return { x: p.x + Math.floor(position.x * width / size.width), y: p.y + Math.floor(position.y * height / size.height) };
}
