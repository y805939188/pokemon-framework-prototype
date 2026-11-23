/** WP62 narrow, read-only projection of the installed world content. No Fly entitlement or cache. */
import type { Content } from '../rules/types';
import type { GameState } from '../rules/state';
import type { WorldHostLifecycle } from './ports';
import { dexArea } from '../rules/pokedex-query';
import type { DexAreaInput } from '../rules/pokedex-query';
import { visibleRegionCells } from '../rules/region-map';
import type { RegionMapPoint } from '../rules/world-data';

export type PokedexAreaView = ReturnType<typeof dexArea> & { region?: { id: number; nameKey: string } };
export const unavailableArea = (reason: string): PokedexAreaView => ({ status: 'unknown', points: [], diagnostics: [reason] });
const invalid = (): PokedexAreaView => ({ status: 'invalid', points: [], diagnostics: ['invalid-pokedex-area-source'] });
const safe = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** The caller proves descriptor-only plain data and the actual joint native source before entering here. */
export function projectPokedexArea(species: string, game: GameState, content: Content, life: WorldHostLifecycle): PokedexAreaView {
  if (!record(game.world) || !Number.isSafeInteger(game.world.encounterVersion)) return invalid();
  if (content.world === undefined || content.mapMetadata === undefined) return unavailableArea('pokedex-area-data-unavailable');
  if (!record(content.world) || !record(content.mapMetadata)) return invalid();
  if (content.world.encounters === undefined || content.world.regionMaps === undefined) return unavailableArea('pokedex-area-data-unavailable');
  if (!record(content.world.encounters) || !record(content.world.regionMaps)) return invalid();
  const encounters = content.world.encounters, regions = content.world.regionMaps, metadata = content.mapMetadata.maps;
  if (!Array.isArray(encounters.tables) || !Array.isArray(regions.regions) || !record(metadata)
    || !text(encounters.source) || !text(regions.source) || !safe(life.mapId) || life.mapId === 0) return invalid();
  const current: unknown = Object.hasOwn(metadata, String(life.mapId)) ? metadata[String(life.mapId)] : undefined;
  // WP62's geographic region is independent of the legacy regional-dex list index. No Fly region-zero fallback.
  if (current === undefined) return unavailableArea('pokedex-area-current-region-unavailable');
  if (!record(current)) return invalid();
  if (current.mapPosition === undefined) return unavailableArea('pokedex-area-current-region-unavailable');
  if (!record(current.mapPosition) || !safe(current.mapPosition.regionId) || !safe(current.mapPosition.x) || !safe(current.mapPosition.y)) return invalid();
  const regionId = current.mapPosition.regionId;
  if (regions.regions.some(r => !record(r) || !safe(r.id))) return invalid();
  const region = regions.regions.find(r => r.id === regionId);
  if (!region) return unavailableArea('pokedex-area-current-region-not-registered');
  if (!text(region.nameKey) || !Array.isArray(region.points)) return invalid();
  const points: RegionMapPoint[] = [];
  for (const point of region.points) {
    if (!record(point) || !safe(point.x) || !safe(point.y)
      || point.switchId !== undefined && (typeof point.switchId !== 'number' || !Number.isSafeInteger(point.switchId))) return invalid();
    points.push({ x: point.x, y: point.y, ...(point.switchId === undefined ? {} : { switchId: point.switchId }) });
  }
  const visible = visibleRegionCells({ id: regionId, nameKey: region.nameKey, points }, id => {
    const switches = life.travelSwitches;
    if (!switches) return { status: 'unavailable', reason: 'native-switch-source-unavailable' };
    const value: unknown = Object.hasOwn(switches.values, String(id)) ? switches.values[String(id)] : false;
    return typeof value === 'boolean' ? { status: 'value', value } : { status: 'invalid', reason: 'native-switch-value-invalid' };
  });
  if (visible.status !== 'ready') return { status: visible.status === 'error' ? 'invalid' : 'unknown', points: [], diagnostics: [visible.reason] };
  const tables: DexAreaInput['tables'][number][] = [], maps: DexAreaInput['maps'][number][] = [];
  for (const table of encounters.tables) {
    if (!record(table) || !safe(table.mapId) || table.mapId === 0 || typeof table.version !== 'number' || !Number.isSafeInteger(table.version) || !record(table.types)) return invalid();
    const identities: string[] = [];
    for (const type of Object.values(table.types)) {
      if (!record(type) || !Array.isArray(type.slots)) return invalid();
      for (const slot of type.slots) {
        if (!record(slot) || !text(slot.species)) return invalid();
        identities.push(slot.species);
      }
    }
    tables.push({ mapId: table.mapId, version: table.version, species: identities });
  }
  for (const [id, map] of Object.entries(metadata)) {
    if (!/^[1-9][0-9]*$/.test(id) || !safe(Number(id)) || !record(map)) return invalid();
    const position = map.mapPosition;
    if (position === undefined) continue;
    if (!record(position) || !safe(position.regionId) || !safe(position.x) || !safe(position.y)
      || map.flags !== undefined && (!Array.isArray(map.flags) || map.flags.some(flag => typeof flag !== 'string'))) return invalid();
    let size: { width: number; shape: string } | undefined;
    if (map.mapSize !== undefined) {
      if (!record(map.mapSize) || !safe(map.mapSize.width) || typeof map.mapSize.shape !== 'string' || !/^[0-9x]*$/.test(map.mapSize.shape)) return invalid();
      size = { width: map.mapSize.width, shape: map.mapSize.shape };
    }
    maps.push({ mapId: Number(id), region: position.regionId, x: position.x, y: position.y,
      hidden: map.flags?.includes('HideEncountersInPokedex') ?? false, ...(size ? { size } : {}) });
  }
  const result = dexArea(species, { region: regionId, encounterVersion: game.world.encounterVersion, tables, maps,
    points: visible.cells.map(point => ({ region: regionId, ...point, visible: true })) });
  if (result.points.some(point => !safe(point.x) || !safe(point.y))) return invalid();
  return { ...result, region: { id: regionId, nameKey: region.nameKey } };
}
