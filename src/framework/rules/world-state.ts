/** Persistent world facts and strict save validation. No host objects, clock or random source. */
import type { Fact } from './fact';
import { readBlackoutCheckpoint } from './blackout-checkpoint';
import type { BlackoutOrigin, BlackoutCheckpoint } from './blackout-checkpoint';
export type { BlackoutOrigin } from './blackout-checkpoint';
import type { WorldDirection, WorldPoint, WorldLocation, WorldWeatherIntent, WorldWeatherId, WorldWeatherCategory, WorldMapFields } from './world-data';
import { isWorldWeatherId } from './world-data';

export type WorldFact<T> = Fact<T>;
export type WorldMapMetadata = WorldMapFields & { region?: number; flags?: string[]; darkMap?: boolean };
export interface HostWorldFacts {
  mapId: WorldFact<number>; hour: WorldFact<number>;
  cycling: WorldFact<boolean>; diving: WorldFact<boolean>;
}
export interface WorldBusinessFacts extends HostWorldFacts {
  weather: WorldFact<WorldWeatherIntent & { category: WorldWeatherCategory }>;
  mapMetadata: WorldFact<Readonly<WorldMapMetadata>>;
  surfing: WorldFact<boolean>;
}
export interface WorldLocalState {
  strengthUsed: boolean;
  lowerEncounterRate: boolean; higherEncounterRate: boolean;
  lowerWildLevel: boolean; higherWildLevel: boolean;
}
export interface EncounterRuntime {
  graceSteps: number; accumulator: number;
  currentMapId: number | null; loadedVersion: number | null;
}
export interface WorldMapEntry {
  id: string; cause: 'new-game' | 'load' | 'transfer' | 'connection';
  previousMapId: number | null; mapId: number; rebuilt: boolean;
}
export interface EventCompanionAppearance {
  characterName: string; characterIndex: number; tileId: number; pattern: number;
  opacity: number; blendMode: 0 | 1 | 2 | 3; walkAnime: boolean; stepAnime: boolean;
}
export interface EventCompanionState {
  originMapId: number; originEventId: number; name: string;
  location: WorldLocation; visible: boolean; commonEventId?: number;
  appearance: EventCompanionAppearance;
}
/** Schema-10 / pure-planner transfer adapter, never the current persistent representation. */
export interface PendingBlackoutReturn {
  id: string; origin: BlackoutOrigin; branch: 'center' | 'home';
  target: WorldLocation; stage: 'ready' | 'awaiting-arrival';
}
export interface WorldState {
  repelSteps: number; happinessSteps: number; encounterVersion: number;
  flashUsed: boolean; weather: WorldWeatherIntent; visitedMaps: number[]; surfing: boolean;
  recentCenter: WorldLocation | null; healingSpot: WorldPoint | null; escapePoint: WorldLocation | null;
  companions: EventCompanionState[]; pendingReturn: BlackoutCheckpoint | null;
}
export interface LegacyWeatherInput { type: unknown; targetPower: unknown; durationFrames: unknown }
export interface WorldProblem { path: string; message: string }
export const newWorldState = (): WorldState => ({
  repelSteps: 0, happinessSteps: 0, encounterVersion: 0, flashUsed: false,
  weather: { type: 'None', strength: 0, durationFrames: 0 }, visitedMaps: [], surfing: false,
  recentCenter: null, healingSpot: null, escapePoint: null, companions: [], pendingReturn: null,
});
export const newWorldLocalState = (): WorldLocalState => ({ strengthUsed: false, lowerEncounterRate: false, higherEncounterRate: false, lowerWildLevel: false, higherWildLevel: false });
export const newEncounterRuntime = (): EncounterRuntime => ({ graceSteps: 0, accumulator: 0, currentMapId: null, loadedVersion: null });

const integer = (value: unknown, minimum = 0): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
const direction = (value: unknown): value is WorldDirection => value === 2 || value === 4 || value === 6 || value === 8;
type RecordData = Record<string, unknown>;
/** Read only data descriptors, so even direct callers cannot execute an input getter. */
function record(value: unknown, keys: readonly string[], required: readonly string[], path: string, out: WorldProblem[]): RecordData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { out.push({ path, message: 'must be a plain data record' }); return null; }
  const descriptors = Object.getOwnPropertyDescriptors(value), copy: RecordData = {};
  for (const key of Reflect.ownKeys(value)) {
    const d = typeof key === 'string' ? descriptors[key] : undefined;
    if (typeof key !== 'string' || !keys.includes(key) || !d || !d.enumerable || !('value' in d)) { out.push({ path: `${path}.${String(key)}`, message: 'must be a known own data field' }); continue; }
    Object.defineProperty(copy, key, { value: d.value, enumerable: true });
  }
  for (const key of required) if (!Object.hasOwn(copy, key)) out.push({ path: `${path}.${key}`, message: 'required own data field is missing' });
  return copy;
}
function list(value: unknown, path: string, out: WorldProblem[]): unknown[] | null {
  if (!Array.isArray(value)) { out.push({ path, message: 'must be a dense data array' }); return null; }
  const result: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !d.enumerable || !('value' in d)) { out.push({ path: `${path}[${i}]`, message: 'must be own indexed data' }); continue; }
    result.push(d.value);
  }
  for (const key of Reflect.ownKeys(value)) if (key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key))) out.push({ path, message: 'unknown array field' });
  return result;
}
function point(value: unknown, path: string, out: WorldProblem[], oriented: boolean): void {
  const keys = ['mapId', 'x', 'y', ...(oriented ? ['direction'] : [])], p = record(value, keys, keys, path, out);
  if (!p) return;
  if (!integer(p.mapId, 1)) out.push({ path: `${path}.mapId`, message: 'must be a positive safe map ID' });
  for (const key of ['x', 'y']) if (typeof p[key] !== 'number' || !Number.isSafeInteger(p[key])) out.push({ path: `${path}.${key}`, message: 'must be a safe coordinate; host validates geometry' });
  if (oriented && !direction(p.direction)) out.push({ path: `${path}.direction`, message: 'must be 2, 4, 6 or 8' });
}
export function worldWeatherProblems(value: unknown, path = '$.world.weather'): WorldProblem[] {
  const out: WorldProblem[] = [], p = record(value, ['type', 'strength', 'durationFrames'], ['type', 'strength', 'durationFrames'], path, out);
  if (!p) return out;
  if (!isWorldWeatherId(p.type)) out.push({ path: `${path}.type`, message: 'must be a registered world weather ID' });
  if (typeof p.strength !== 'number' || !Number.isFinite(p.strength) || p.strength < 0 || p.strength > 60 || p.type === 'None' && p.strength !== 0) out.push({ path: `${path}.strength`, message: 'must be 0..60; None must have strength 0' });
  if (!integer(p.durationFrames)) out.push({ path: `${path}.durationFrames`, message: 'must be nonnegative safe frames' });
  return out;
}
/** Source schema 10 keeps its transfer-only shape; schema 11 onward use the four-phase checkpoint. */
export function worldStateProblems(value: unknown, schema: 10 | 11 = 11): WorldProblem[] {
  const out: WorldProblem[] = [], keys = Object.keys(newWorldState()), p = record(value, keys, keys, '$.world', out);
  if (!p) return out;
  for (const key of ['repelSteps', 'happinessSteps']) if (!integer(p[key])) out.push({ path: `$.world.${key}`, message: 'must be a nonnegative safe integer' });
  if (typeof p.encounterVersion !== 'number' || !Number.isSafeInteger(p.encounterVersion)) out.push({ path: '$.world.encounterVersion', message: 'must be a signed safe integer' });
  for (const key of ['flashUsed', 'surfing']) if (typeof p[key] !== 'boolean') out.push({ path: `$.world.${key}`, message: 'must be boolean' });
  out.push(...worldWeatherProblems(p.weather));
  const visited = list(p.visitedMaps, '$.world.visitedMaps', out), seen = new Set<unknown>();
  if (visited) for (const [i, id] of visited.entries()) { if (!integer(id, 1) || seen.has(id)) out.push({ path: `$.world.visitedMaps[${i}]`, message: 'must be a unique positive safe map ID' }); seen.add(id); }
  for (const key of ['recentCenter', 'healingSpot', 'escapePoint']) if (p[key] !== null) point(p[key], `$.world.${key}`, out, key !== 'healingSpot');
  const companions = list(p.companions, '$.world.companions', out), identities = new Set<string>();
  if (companions) for (const [i, raw] of companions.entries()) {
    const path = `$.world.companions[${i}]`, keys = ['originMapId', 'originEventId', 'name', 'location', 'visible', 'commonEventId', 'appearance'];
    const c = record(raw, keys, keys.filter(k => k !== 'commonEventId'), path, out); if (!c) continue;
    for (const key of ['originMapId', 'originEventId']) if (!integer(c[key], 1)) out.push({ path: `${path}.${key}`, message: 'must be a positive safe source identity' });
    const identity = `${String(c.originMapId)}/${String(c.originEventId)}`;
    if (identities.has(identity)) out.push({ path, message: 'duplicate source map/event identity' }); identities.add(identity);
    if (typeof c.name !== 'string' || typeof c.visible !== 'boolean') out.push({ path, message: 'requires string name and boolean visible' });
    if (c.commonEventId !== undefined && !integer(c.commonEventId, 1)) out.push({ path: `${path}.commonEventId`, message: 'must be a positive safe common event ID' });
    point(c.location, `${path}.location`, out, true);
    const akeys = ['characterName', 'characterIndex', 'tileId', 'pattern', 'opacity', 'blendMode', 'walkAnime', 'stepAnime'], a = record(c.appearance, akeys, akeys, `${path}.appearance`, out);
    if (a) {
      if (typeof a.characterName !== 'string' || !integer(a.characterIndex) || a.characterIndex > 7 || !integer(a.tileId) || !integer(a.pattern) || !integer(a.opacity) || a.opacity > 255 || !integer(a.blendMode) || a.blendMode > 3 || typeof a.walkAnime !== 'boolean' || typeof a.stepAnime !== 'boolean') out.push({ path: `${path}.appearance`, message: 'invalid image or animation data' });
      if (typeof a.tileId === 'number' && a.tileId > 0 && (a.characterName !== '' || a.characterIndex !== 0)) out.push({ path: `${path}.appearance`, message: 'tile image must clear character name and index' });
    }
  }
  if (p.pendingReturn !== null && schema === 11) {
    try { readBlackoutCheckpoint(p.pendingReturn); }
    catch { out.push({ path: '$.world.pendingReturn', message: 'must be a schema-11 blackout checkpoint with a legal phase/branch combination' }); }
  }
  if (p.pendingReturn !== null && schema === 10) {
    const keys = ['id', 'origin', 'branch', 'target', 'stage'], r = record(p.pendingReturn, keys, keys, '$.world.pendingReturn', out);
    if (r) {
      if (typeof r.id !== 'string' || !r.id.length || typeof r.branch !== 'string' || !['center', 'home'].includes(r.branch) || typeof r.stage !== 'string' || !['ready', 'awaiting-arrival'].includes(r.stage)) out.push({ path: '$.world.pendingReturn', message: 'invalid return identity, branch or stage' });
      point(r.target, '$.world.pendingReturn.target', out, true);
      const origin = record(r.origin, ['kind', 'battleId', 'rawHash', 'sourceId'], ['kind'], '$.world.pendingReturn.origin', out);
      if (origin?.kind === 'battle') {
        if (typeof origin.battleId !== 'string' || !origin.battleId.length || typeof origin.rawHash !== 'string' || !/^[a-f0-9]{64}$/.test(origin.rawHash) || Object.hasOwn(origin, 'sourceId')) out.push({ path: '$.world.pendingReturn.origin', message: 'must be battle identity and raw result hash' });
      } else if (origin?.kind === 'field') {
        if (typeof origin.sourceId !== 'string' || !origin.sourceId.length || Object.hasOwn(origin, 'battleId') || Object.hasOwn(origin, 'rawHash')) out.push({ path: '$.world.pendingReturn.origin', message: 'must be a field source identity' });
      } else out.push({ path: '$.world.pendingReturn.origin.kind', message: 'must be battle or field' });
    }
  }
  return out;
}

/** Legacy MZ intent can lose the distinction between power0 and a fade to None. Never use displayed power. */
export function migrateLegacyWeather(input?: LegacyWeatherInput): { intent: WorldWeatherIntent; notes: string[] } {
  const fallback = { intent: newWorldState().weather, notes: ['legacy-weather-unavailable: initialized None'] };
  if (input === undefined) return fallback;
  const problems: WorldProblem[] = [], p = record(input, ['type', 'targetPower', 'durationFrames'], ['type', 'targetPower', 'durationFrames'], '$.legacyWeather', problems);
  if (!p || problems.length || typeof p.type !== 'string' || !integer(p.targetPower) || p.targetPower > 9 || !integer(p.durationFrames)) return { ...fallback, notes: ['legacy-weather-invalid: initialized None'] };
  const mapping: Readonly<Record<string, WorldWeatherId>> = { none: 'None', rain: 'Rain', storm: 'Storm', snow: 'Snow' };
  if (!Object.hasOwn(mapping, p.type)) return { ...fallback, notes: [`legacy-weather-unknown-type: ${p.type}; initialized None`] };
  if (p.type === 'none' || p.targetPower === 0) return { intent: { type: 'None', strength: 0, durationFrames: p.durationFrames }, notes: p.type === 'none' ? [] : ['legacy-weather-zero-target: fade/power0 ambiguity restored as None'] };
  return { intent: { type: mapping[p.type]!, strength: (p.targetPower + 1) * 6, durationFrames: p.durationFrames }, notes: [] };
}
