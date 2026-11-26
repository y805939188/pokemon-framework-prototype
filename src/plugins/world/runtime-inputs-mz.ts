/** MZ terrain meanings are author configuration, rather than inferred from the numeric tag. */
import { ENVIRONMENT } from '../../framework/rules/initial-field';
import type { OrdinaryEncounterHostFacts, CompletedWorldStep } from '../../framework/app/ports';
import type { WorldFact } from '../../framework/rules/world-data';
import { hostInput } from '../host-input';
import type { HostInput, InputHost } from '../host-input';
import { hostRecord, invoke } from './host-access';

export interface MZTerrainMeaning {
  readonly landAllowed: boolean; readonly fishable: boolean;
  readonly environment: keyof typeof ENVIRONMENT; readonly ice: boolean;
  readonly canSurf?: boolean; readonly waterfall: boolean; readonly waterfallCrest: boolean;
}
export type MZTerrainMeanings = ReadonlyMap<number, Readonly<MZTerrainMeaning>>;
export function parseTerrainMeanings(raw: unknown): MZTerrainMeanings {
  const decoded: unknown = raw === undefined || raw === '' ? {} : typeof raw === 'string' ? JSON.parse(raw) : raw;
  const source = hostRecord(decoded);
  if (!source || Array.isArray(decoded)) throw Error('world-terrain-configuration-invalid');
  const result = new Map<number, Readonly<MZTerrainMeaning>>();
  for (const [key, value] of Object.entries(source)) {
    const entry = hostRecord(value), tag = Number(key);
    if (!/^[0-7]$/.test(key) || !entry || Array.isArray(value) ||
      Object.keys(entry).some(name => !['landAllowed', 'fishable', 'environment', 'ice', 'canSurf', 'waterfall', 'waterfallCrest'].includes(name)) ||
      typeof entry.landAllowed !== 'boolean' || typeof entry.fishable !== 'boolean' ||
      typeof entry.environment !== 'string' || !Object.hasOwn(ENVIRONMENT, entry.environment) ||
      ['ice', 'canSurf', 'waterfall', 'waterfallCrest'].some(name => entry[name] !== undefined && typeof entry[name] !== 'boolean')) throw Error(`world-terrain-configuration-invalid:${key}`);
    result.set(tag, Object.freeze({ landAllowed: entry.landAllowed, fishable: entry.fishable,
      environment: entry.environment as keyof typeof ENVIRONMENT, ice: entry.ice === true,
      ...(typeof entry.canSurf === 'boolean' ? { canSurf: entry.canSurf } : {}), waterfall: entry.waterfall === true, waterfallCrest: entry.waterfallCrest === true }));
  }
  return result;
}
function observed<T>(read: () => T): WorldFact<T> {
  try { return { status: 'value', value: read() }; }
  catch (error) { return { status: 'unavailable', reason: String(error) }; }
}
function boolean(value: unknown, name: string): boolean { if (typeof value !== 'boolean') throw Error(`${name}-unavailable`); return value; }
export function createRuntimeInputsMZ(root: Record<string, unknown>, meanings: MZTerrainMeanings, frameworkMode: () => boolean, allowTestDebug = () => false) {
  const terrain = (tag: number): Readonly<MZTerrainMeaning> => {
    const value = meanings.get(tag); if (!value) throw Error(`world-terrain-unconfigured:${tag}`); return value;
  };
  const encounterFacts = (readTerrain: () => number): OrdinaryEncounterHostFacts => {
    // Native/legacy consumers retain their own terminal dispatch, with no C random draw.
    if (!frameworkMode()) return { landAllowed: { status: 'value', value: false }, encountersDisabled: { status: 'value', value: true },
      debugControl: { status: 'value', value: false }, groundEnvironment: { status: 'absent' } };
    const meaning = observed(() => terrain(readTerrain()));
    return {
      landAllowed: meaning.status === 'value' ? { status: 'value', value: meaning.value.landAllowed } : meaning,
      encountersDisabled: observed(() => !boolean(invoke(root.$gameSystem, 'isEncounterEnabled'), 'encounter-switch')),
      debugControl: observed(() => allowTestDebug() && boolean(invoke(root.$gameTemp, 'isPlaytest'), 'debug-playtest') && boolean(invoke(root.Input, 'isPressed', ['control']), 'debug-control')),
      groundEnvironment: meaning.status === 'value' ? { status: 'value', value: meaning.value.environment } : meaning,
    };
  };
  const currentTerrain = (): number => {
    const map = root.$gameMap, player = hostRecord(root.$gamePlayer), x = player?.x, y = player?.y;
    const mapId = invoke(map, 'mapId');
    if (typeof mapId !== 'number' || !Number.isSafeInteger(mapId) || mapId <= 0 ||
      typeof x !== 'number' || !Number.isSafeInteger(x) || x < 0 || typeof y !== 'number' || !Number.isSafeInteger(y) || y < 0 ||
      invoke(map, 'isValid', [x, y]) !== true) throw Error('field-encounter-location-unavailable');
    const tag = invoke(map, 'terrainTag', [x, y]);
    if (typeof tag !== 'number' || !Number.isSafeInteger(tag) || tag < 0 || tag > 7) throw Error('field-encounter-terrain-invalid');
    if (root.$gameMap !== map || root.$gamePlayer !== player) throw Error('field-encounter-location-changed');
    return tag;
  };
  return {
    terrain,
    generation: { environment: () => observed(() => terrain(currentTerrain()).environment) },
    iceTerrainTags: [...meanings].filter(([, value]) => value.ice).map(([tag]) => tag),
    ordinary: { read(step: Readonly<CompletedWorldStep>): OrdinaryEncounterHostFacts {
      return encounterFacts(() => step.terrainTag);
    } },
    field: { read: (): OrdinaryEncounterHostFacts => encounterFacts(currentTerrain) },
  };
}

/** Validate every surface consumed by the shared host input service before narrowing the dynamic root. */
export function worldHostInput(root: Record<string, unknown>): HostInput {
  const input = hostRecord(root.Input), graphics = hostRecord(root.Graphics), touch = hostRecord(root.TouchInput), document = hostRecord(root.document);
  if (!input || !hostRecord(input.keyMapper) || !graphics || graphics.frameCount !== undefined && typeof graphics.frameCount !== 'number' ||
    !touch || !document || typeof root.addEventListener !== 'function' || typeof document.addEventListener !== 'function' ||
    typeof touch.isCancelled !== 'function' || ['isPressed', 'isTriggered', 'isRepeated'].some(key => typeof input[key] !== 'function')) throw Error('world-input-host-unavailable');
  return hostInput(root as unknown as InputHost);
}
