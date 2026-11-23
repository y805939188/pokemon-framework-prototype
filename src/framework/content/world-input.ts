/** Strict world author/compiled input validation. Produces detached ordinary data only. */
import { ENVIRONMENT } from "../rules/initial-field";
import { ENCOUNTER_TYPES, isWorldWeatherId } from "../rules/world-data";
import type { SpeciesKey } from "../rules/types";
import type { ConnectionEndpoint, EncounterSource, EncounterTypeId, MapConnectionRecord, MapConnectionSource, RegionMapPoint, RegionMapRecord, RegionMapSource, WorldContent, WorldEncounterRecord, WorldEncounterSlot, WorldMapFields, WorldPoint } from "../rules/world-data";

export type WorldContentFile = "encounters.json" | "region-maps.json" | "map-connections.json";
export interface WorldContentProblem { file: WorldContentFile; path: string; message: string }
export interface WorldContentValidationContext {
  speciesKeys: readonly SpeciesKey[];
  usableSource(id: unknown): string | null;
}
interface Problem { path: string; message: string }
type RecordData = Record<string, unknown>;
const issue = (out: Problem[], path: string, message: string): void => { out.push({ path, message }); };
const safe = (value: unknown, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const typeId = (value: string): value is EncounterTypeId => Object.hasOwn(ENCOUNTER_TYPES, value);
const environmentId = (value: unknown): value is keyof typeof ENVIRONMENT => typeof value === "string" && Object.hasOwn(ENVIRONMENT, value);

/** Descriptors are checked before reading values, including nested records and array entries. */
function record(raw: unknown, path: string, out: Problem[], allowed?: readonly string[]): RecordData | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    issue(out, path, "must be an ordinary data object"); return null;
  }
  const proto: unknown = Object.getPrototypeOf(raw);
  if (proto !== null && proto !== Object.prototype) {
    // Ordinary records from a second JS realm are valid; instances and custom prototypes are not.
    const ctor = Object.getOwnPropertyDescriptor(proto, "constructor");
    if (Object.getPrototypeOf(proto) !== null || !ctor || !("value" in ctor) || typeof ctor.value !== "function" || Function.prototype.toString.call(ctor.value) !== Function.prototype.toString.call(Object)) {
      issue(out, path, "must have an ordinary Object or null prototype"); return null;
    }
  }
  const result: RecordData = {}, before = out.length;
  for (const name of Reflect.ownKeys(raw)) {
    if (typeof name !== "string") { issue(out, path, "symbol fields are not supported"); continue; }
    const descriptor = Object.getOwnPropertyDescriptor(raw, name);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      issue(out, `${path}.${name}`, "must be an enumerable own data property"); continue;
    }
    if (allowed && !allowed.includes(name)) { issue(out, `${path}.${name}`, "unknown field"); continue; }
    Object.defineProperty(result, name, { value: descriptor.value, enumerable: true, configurable: true, writable: true });
  }
  return out.length === before ? result : null;
}
function list(raw: unknown, path: string, out: Problem[]): unknown[] | null {
  if (!Array.isArray(raw)) { issue(out, path, "must be a dense ordinary data array"); return null; }
  const keys = Reflect.ownKeys(raw);
  if (keys.length !== raw.length + 1 || keys.some(key => key !== "length" && (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= raw.length))) {
    issue(out, path, "must be dense with no extra or symbol fields"); return null;
  }
  const result: unknown[] = [];
  for (let index = 0; index < raw.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      issue(out, `${path}[${index}]`, "must be an enumerable own data entry"); return null;
    }
    result.push(descriptor.value);
  }
  return result;
}
function point(raw: unknown, path: string, out: Problem[]): WorldPoint | null {
  const value = record(raw, path, out, ["mapId", "x", "y"]);
  if (!value) return null;
  if (!safe(value.mapId, 1)) issue(out, `${path}.mapId`, "must be a positive safe map identity");
  if (!safe(value.x)) issue(out, `${path}.x`, "must be a safe integer coordinate");
  if (!safe(value.y)) issue(out, `${path}.y`, "must be a safe integer coordinate");
  return safe(value.mapId, 1) && safe(value.x) && safe(value.y) ? { mapId: value.mapId, x: value.x, y: value.y } : null;
}

/** Only additional world fields; the owner validates the full map entry's known-key set. */
export function checkWorldMapFields(raw: unknown, path: string): { value: WorldMapFields | null; problems: Problem[] } {
  const problems: Problem[] = [], row = record(raw, path, problems), value: WorldMapFields = {};
  if (!row) return { value: null, problems };
  for (const field of ["outdoor", "alwaysBicycle"] as const) if (Object.hasOwn(row, field)) {
    if (typeof row[field] !== "boolean") issue(problems, `${path}.${field}`, "must be boolean");
    else value[field] = row[field];
  }
  if (Object.hasOwn(row, "environment")) {
    if (!environmentId(row.environment)) issue(problems, `${path}.environment`, "unknown battle environment identity");
    else value.environment = row.environment;
  }
  if (Object.hasOwn(row, "weather")) {
    const weather = record(row.weather, `${path}.weather`, problems, ["type", "chance"]);
    if (weather) {
      if (!isWorldWeatherId(weather.type)) issue(problems, `${path}.weather.type`, "unknown world weather identity");
      if (!safe(weather.chance, 0)) issue(problems, `${path}.weather.chance`, "must be a nonnegative safe integer (values above 100 are permitted)");
      if (isWorldWeatherId(weather.type) && safe(weather.chance, 0)) value.weather = { type: weather.type, chance: weather.chance };
    }
  }
  if (Object.hasOwn(row, "mapPosition")) {
    const position = record(row.mapPosition, `${path}.mapPosition`, problems, ["regionId", "x", "y"]);
    if (position) {
      for (const field of ["regionId", "x", "y"] as const) if (!safe(position[field], 0)) issue(problems, `${path}.mapPosition.${field}`, "must be a nonnegative safe integer");
      if (safe(position.regionId, 0) && safe(position.x, 0) && safe(position.y, 0)) value.mapPosition = { regionId: position.regionId, x: position.x, y: position.y };
    }
  }
  if (Object.hasOwn(row, "mapSize")) {
    const size = record(row.mapSize, `${path}.mapSize`, problems, ["width", "shape"]);
    if (size) {
      if (!safe(size.width, 0)) issue(problems, `${path}.mapSize.width`, "must be a nonnegative safe integer");
      if (typeof size.shape !== "string" || !/^[0-9x]*$/.test(size.shape)) issue(problems, `${path}.mapSize.shape`, "must be ASCII 0-9/x shape text");
      if (safe(size.width, 0) && typeof size.shape === "string" && /^[0-9x]*$/.test(size.shape)) value.mapSize = { width: size.width, shape: size.shape };
    }
  }
  if (Object.hasOwn(row, "healingSpot")) {
    const location = point(row.healingSpot, `${path}.healingSpot`, problems);
    if (location) value.healingSpot = location;
  }
  return { value: problems.length ? null : value, problems };
}

function sourceEnvelope(raw: unknown, collection: string, context: WorldContentValidationContext, out: Problem[]): { source: string; rows: unknown[] } | null {
  const envelope = record(raw, "$", out, ["source", collection]);
  if (!envelope) return null;
  if (!text(envelope.source)) issue(out, "$.source", "must be a nonempty source identity");
  else {
    const problem = context.usableSource(envelope.source);
    if (problem) issue(out, "$.source", `source-unusable: ${problem}`);
  }
  const rows = list(envelope[collection], `$.${collection}`, out);
  return text(envelope.source) && rows ? { source: envelope.source, rows } : null;
}
function encounterSlot(raw: unknown, path: string, bases: ReadonlySet<string>, out: Problem[]): WorldEncounterSlot | null {
  const slot = record(raw, path, out, ["species", "weight", "minLevel", "maxLevel"]);
  if (!slot) return null;
  if (typeof slot.species !== "string" || !bases.has(slot.species)) issue(out, `${path}.species`, "must name a registered base species identity");
  if (!safe(slot.weight, 1)) issue(out, `${path}.weight`, "must be a positive safe integer");
  if (!safe(slot.minLevel, 1, 100)) issue(out, `${path}.minLevel`, "must be an integer from 1 to 100");
  if (!safe(slot.maxLevel, 1, 100)) issue(out, `${path}.maxLevel`, "must be an integer from 1 to 100");
  if (safe(slot.minLevel, 1, 100) && safe(slot.maxLevel, 1, 100) && slot.minLevel > slot.maxLevel) issue(out, path, "minimum level must not exceed maximum level");
  return typeof slot.species === "string" && bases.has(slot.species) && safe(slot.weight, 1) && safe(slot.minLevel, 1, 100) && safe(slot.maxLevel, 1, 100) && slot.minLevel <= slot.maxLevel
    ? { species: slot.species, weight: slot.weight, minLevel: slot.minLevel, maxLevel: slot.maxLevel } : null;
}
function encounterTable(raw: unknown, path: string, bases: ReadonlySet<string>, out: Problem[]): WorldEncounterRecord | null {
  const before = out.length, row = record(raw, path, out, ["mapId", "version", "types"]);
  if (!row) return null;
  if (!safe(row.mapId, 1)) issue(out, `${path}.mapId`, "must be a positive safe map identity");
  if (!safe(row.version)) issue(out, `${path}.version`, "must be a signed safe integer");
  const types = record(row.types, `${path}.types`, out, Object.keys(ENCOUNTER_TYPES));
  const result: WorldEncounterRecord["types"] = {};
  if (types) for (const [id, rawType] of Object.entries(types)) {
    if (!typeId(id)) continue;
    const typePath = `${path}.types.${id}`, data = record(rawType, typePath, out, ["stepChance", "slots"]);
    if (!data) continue;
    if (!safe(data.stepChance)) issue(out, `${typePath}.stepChance`, "must be a signed safe integer (not clamped to 0..100)");
    const slots = list(data.slots, `${typePath}.slots`, out), merged = new Map<string, WorldEncounterSlot>();
    let total = 0;
    if (slots) for (const [index, candidate] of slots.entries()) {
      const slotPath = `${typePath}.slots[${index}]`, slot = encounterSlot(candidate, slotPath, bases, out);
      if (!slot) continue;
      if (!Number.isSafeInteger(total + slot.weight)) { issue(out, `${slotPath}.weight`, "total encounter weight exceeds safe integer representation"); continue; }
      total += slot.weight;
      const identity = JSON.stringify([slot.species, slot.minLevel, slot.maxLevel]), previous = merged.get(identity);
      if (previous) previous.weight += slot.weight;
      else merged.set(identity, slot);
    }
    if (safe(data.stepChance) && slots) result[id] = { stepChance: data.stepChance, slots: [...merged.values()].sort((a, b) => b.weight - a.weight || (a.species < b.species ? -1 : a.species > b.species ? 1 : 0)) };
  }
  return out.length === before && safe(row.mapId, 1) && safe(row.version) ? { mapId: row.mapId, version: row.version, types: result } : null;
}
function encounters(raw: unknown, context: WorldContentValidationContext, out: Problem[]): EncounterSource | null {
  const source = sourceEnvelope(raw, "tables", context, out);
  if (!source) return null;
  const bases = new Set(context.speciesKeys.filter(key => key.form === 0).map(key => key.species)), tables: WorldEncounterRecord[] = [], identities = new Set<string>();
  for (const [index, candidate] of source.rows.entries()) {
    const path = `$.tables[${index}]`, table = encounterTable(candidate, path, bases, out);
    if (!table) continue;
    const identity = `${table.mapId}/${table.version}`;
    if (identities.has(identity)) issue(out, path, "duplicate map/version encounter record");
    else { identities.add(identity); tables.push(table); }
  }
  return { source: source.source, tables };
}
function regionPoint(raw: unknown, path: string, out: Problem[]): RegionMapPoint | null {
  const before = out.length, row = record(raw, path, out, ["x", "y", "nameKey", "descriptionKey", "healingSpot", "switchId"]);
  if (!row) return null;
  if (!safe(row.x, 0)) issue(out, `${path}.x`, "must be a nonnegative safe integer");
  if (!safe(row.y, 0)) issue(out, `${path}.y`, "must be a nonnegative safe integer");
  const value: RegionMapPoint = { x: safe(row.x, 0) ? row.x : 0, y: safe(row.y, 0) ? row.y : 0 };
  for (const field of ["nameKey", "descriptionKey"] as const) if (Object.hasOwn(row, field)) {
    if (typeof row[field] !== "string") issue(out, `${path}.${field}`, "must be text (empty text is preserved)");
    else value[field] = row[field];
  }
  if (Object.hasOwn(row, "switchId")) {
    if (!safe(row.switchId)) issue(out, `${path}.switchId`, "must be a signed safe integer; omission and zero differ");
    else value.switchId = row.switchId;
  }
  if (Object.hasOwn(row, "healingSpot")) {
    const location = point(row.healingSpot, `${path}.healingSpot`, out);
    if (location) value.healingSpot = location;
  }
  return out.length === before ? value : null;
}
function regions(raw: unknown, context: WorldContentValidationContext, out: Problem[]): RegionMapSource | null {
  const source = sourceEnvelope(raw, "regions", context, out);
  if (!source) return null;
  const result: RegionMapRecord[] = [], identities = new Set<number>();
  for (const [index, candidate] of source.rows.entries()) {
    const path = `$.regions[${index}]`, before = out.length, row = record(candidate, path, out, ["id", "nameKey", "points"]);
    if (!row) continue;
    if (!safe(row.id, 0)) issue(out, `${path}.id`, "must be a nonnegative safe region identity");
    else if (identities.has(row.id)) issue(out, `${path}.id`, "duplicate region identity");
    else identities.add(row.id);
    if (!text(row.nameKey)) issue(out, `${path}.nameKey`, "must be a nonempty region name key");
    const points = list(row.points, `${path}.points`, out), entries: RegionMapPoint[] = [];
    if (points) for (const [position, candidatePoint] of points.entries()) {
      const entry = regionPoint(candidatePoint, `${path}.points[${position}]`, out);
      if (entry) entries.push(entry);
    }
    if (out.length === before && safe(row.id, 0) && text(row.nameKey)) result.push({ id: row.id, nameKey: row.nameKey, points: entries });
  }
  return { source: source.source, regions: result };
}
function endpoint(raw: unknown, path: string, out: Problem[]): ConnectionEndpoint | null {
  const before = out.length, row = record(raw, path, out, ["mapId", "anchor", "offset"]);
  if (!row) return null;
  if (!safe(row.mapId, 1)) issue(out, `${path}.mapId`, "must be a positive safe map identity");
  if (!safe(row.offset)) issue(out, `${path}.offset`, "must be a signed safe integer");
  let anchor: ConnectionEndpoint["anchor"] | null = null;
  if (row.anchor === "N" || row.anchor === "S" || row.anchor === "E" || row.anchor === "W") anchor = row.anchor;
  else {
    const coordinates = record(row.anchor, `${path}.anchor`, out, ["x", "y"]);
    if (coordinates) {
      if (!safe(coordinates.x)) issue(out, `${path}.anchor.x`, "must be a signed safe integer");
      if (!safe(coordinates.y)) issue(out, `${path}.anchor.y`, "must be a signed safe integer");
      if (safe(coordinates.x) && safe(coordinates.y)) anchor = { x: coordinates.x, y: coordinates.y };
    }
  }
  return out.length === before && safe(row.mapId, 1) && safe(row.offset) && anchor !== null ? { mapId: row.mapId, anchor, offset: row.offset } : null;
}
function connections(raw: unknown, context: WorldContentValidationContext, out: Problem[]): MapConnectionSource | null {
  const source = sourceEnvelope(raw, "connections", context, out);
  if (!source) return null;
  const result: MapConnectionRecord[] = [], opposite = { N: "S", S: "N", E: "W", W: "E" } as const;
  for (const [index, candidate] of source.rows.entries()) {
    const path = `$.connections[${index}]`, row = record(candidate, path, out, ["a", "b"]);
    if (!row) continue;
    const a = endpoint(row.a, `${path}.a`, out), b = endpoint(row.b, `${path}.b`, out);
    if (!a || !b) continue;
    if (typeof a.anchor === "string" && b.anchor !== opposite[a.anchor]) issue(out, `${path}.b.anchor`, "must oppose the first directional anchor");
    else result.push({ a, b });
  }
  return { source: source.source, connections: result };
}

export function checkWorldInputs(raw: { encounters?: unknown; regionMaps?: unknown; mapConnections?: unknown }, context: WorldContentValidationContext): { value: WorldContent; problems: WorldContentProblem[] } {
  const value: WorldContent = {}, problems: WorldContentProblem[] = [], rootProblems: Problem[] = [];
  const root = record(raw, "$", rootProblems, ["encounters", "regionMaps", "mapConnections"]);
  if (!root) return { value, problems: rootProblems.map(problem => ({ file: "encounters.json", ...problem })) };
  const parsers = [
    { key: "encounters", file: "encounters.json", parse: encounters },
    { key: "regionMaps", file: "region-maps.json", parse: regions },
    { key: "mapConnections", file: "map-connections.json", parse: connections },
  ] as const;
  for (const parser of parsers) {
    const candidate = root[parser.key];
    if (candidate === undefined) continue;
    const located: Problem[] = [], parsed = parser.parse(candidate, context, located);
    problems.push(...located.map(problem => ({ file: parser.file, ...problem })));
    if (!parsed || located.length) continue;
    // Narrow on the parsed envelope instead of asserting an unknown record into a public type.
    if ("tables" in parsed) value.encounters = parsed;
    else if ("regions" in parsed) value.regionMaps = parsed;
    else value.mapConnections = parsed;
  }
  return { value, problems };
}
