/** Strict optional trainer catalogs for A-M1. Pure validation; no PBS editor or runtime data authoring. */
import type { ContentError, TrainerRecordSource, TrainerTypeSource } from "./schema";
import type { ItemCatalog } from "../rules/item-catalog";
import type { PartialStats, SpeciesKey } from "../rules/types";
import { NATURE_ORDER } from "../rules/member-identity";

const ID = /^[a-z][a-z0-9-]{0,62}$/;
const SHOWDOWN_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
const TYPE_KEYS = ["id", "nameKey", "gender", "baseMoney", "skillLevel", "flags", "items", "battleBgm", "victoryBgm", "introBgm", "openingText", "winText", "loseText", "source"];
const RECORD_KEYS = ["id", "type", "name", "version", "language", "party", "items", "source"];
const MEMBER_KEYS = ["species", "level", "form", "item", "moves", "abilityIndex", "ability", "gender", "shiny", "superShiny", "nature", "ivs", "evs", "friendship", "nickname", "ball", "shadow"];
const isObj = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isInt = (value: unknown, lo = 0, hi = Number.MAX_SAFE_INTEGER): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= lo && value <= hi;
const dense = (value: unknown): value is unknown[] => Array.isArray(value) && Object.keys(value).length === value.length;
const keyOf = (key: SpeciesKey): string => `${key.species}/${key.form}`;

export interface TrainerInputContext {
  speciesKeys: ReadonlySet<string>;
  catalog: ItemCatalog;
  usable(source: unknown): string | null;
}

function known(value: Record<string, unknown>, allowed: readonly string[], file: ContentError["file"], path: string, errors: ContentError[]): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push({ file, path: `${path}.${key}`, message: "unknown field" });
}
function string(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function id(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function showdownId(value: unknown): value is string { return typeof value === "string" && SHOWDOWN_ID.test(value); }

function resources(value: unknown, file: ContentError["file"], path: string, context: TrainerInputContext, errors: ContentError[]): void {
  if (!dense(value)) { errors.push({ file, path, message: "must be a dense array of {item,count}" }); return; }
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const at = `${path}[${index}]`;
    if (!isObj(entry)) { errors.push({ file, path: at, message: "must be {item,count}" }); continue; }
    known(entry, ["item", "count"], file, at, errors);
    if (!showdownId(entry["item"]) || !Object.hasOwn(context.catalog, entry["item"])) errors.push({ file, path: `${at}.item`, message: "must name a registered trainer resource item" });
    else if (seen.has(entry["item"])) errors.push({ file, path: `${at}.item`, message: "duplicate resource item" });
    else seen.add(entry["item"]);
    if (!isInt(entry["count"], 1)) errors.push({ file, path: `${at}.count`, message: "must be a positive safe integer" });
  }
}

function stats(value: unknown, kind: "ivs" | "evs", file: ContentError["file"], path: string, errors: ContentError[]): void {
  if (!isObj(value)) { errors.push({ file, path, message: `must be a partial six-stat ${kind} object` }); return; }
  known(value, STAT_KEYS, file, path, errors);
  const maximum = kind === "ivs" ? 31 : 252;
  for (const key of Object.keys(value)) if (!isInt(value[key], 0, maximum)) errors.push({ file, path: `${path}.${key}`, message: `must be an integer from 0 to ${maximum}` });
  if (kind === "evs" && STAT_KEYS.reduce((sum, key) => sum + (typeof value[key] === "number" ? value[key] as number : 0), 0) > 510) errors.push({ file, path, message: "total EV must not exceed 510" });
}

function member(value: unknown, index: number, context: TrainerInputContext, errors: ContentError[]): void {
  const file = "trainers.json" as const, path = `$.party[${index}]`;
  if (!isObj(value)) { errors.push({ file, path, message: "must be a member record" }); return; }
  known(value, MEMBER_KEYS, file, path, errors);
  if (!id(value["species"])) errors.push({ file, path: `${path}.species`, message: "must be a species content id" });
  const form = value["form"] ?? 0;
  if (!isInt(form, 0, 999)) errors.push({ file, path: `${path}.form`, message: "must be an integer from 0 to 999" });
  if (id(value["species"]) && isInt(form, 0, 999) && !context.speciesKeys.has(`${value["species"]}/${form}`)) errors.push({ file, path: `${path}.species`, message: "must name an exact registered species/form" });
  if (!isInt(value["level"], 1, 100)) errors.push({ file, path: `${path}.level`, message: "must be an integer from 1 to 100" });
  if (value["item"] !== undefined && !showdownId(value["item"])) errors.push({ file, path: `${path}.item`, message: "held item must be a non-empty registered-item id; B support remains gated" });
  if (value["moves"] !== undefined) {
    if (!dense(value["moves"]) || value["moves"].length > 24) errors.push({ file, path: `${path}.moves`, message: "must be a dense array of at most 24 move ids; [] requests level defaults" });
    else for (const [moveIndex, move] of value["moves"].entries()) if (!showdownId(move)) errors.push({ file, path: `${path}.moves[${moveIndex}]`, message: "must be a non-empty move id" });
  }
  if (value["abilityIndex"] !== undefined && !isInt(value["abilityIndex"])) errors.push({ file, path: `${path}.abilityIndex`, message: "must be a nonnegative safe integer" });
  if (value["ability"] !== undefined && !showdownId(value["ability"])) errors.push({ file, path: `${path}.ability`, message: "must be a non-empty ability id" });
  if (value["gender"] !== undefined && !["M", "F"].includes(value["gender"] as string)) errors.push({ file, path: `${path}.gender`, message: "must be M or F when explicitly provided" });
  for (const field of ["shiny", "superShiny"] as const) if (value[field] !== undefined && typeof value[field] !== "boolean") errors.push({ file, path: `${path}.${field}`, message: "must be boolean" });
  if (value["shadow"] !== undefined && value["shadow"] !== false) errors.push({ file, path: `${path}.shadow`, message: "Shadow is unsupported (C2); only an explicit false is accepted" });
  if (value["nature"] !== undefined && (typeof value["nature"] !== "string" || !NATURE_ORDER.includes(value["nature"].toLowerCase()))) errors.push({ file, path: `${path}.nature`, message: "must name one of the fixed 25 natures" });
  if (value["ivs"] !== undefined) stats(value["ivs"], "ivs", file, `${path}.ivs`, errors);
  if (value["evs"] !== undefined) stats(value["evs"], "evs", file, `${path}.evs`, errors);
  if (value["friendship"] !== undefined && !isInt(value["friendship"], 0, 255)) errors.push({ file, path: `${path}.friendship`, message: "must be an integer from 0 to 255" });
  if (value["nickname"] !== undefined && (typeof value["nickname"] !== "string" || !value["nickname"].trim() || Array.from(value["nickname"]).length > 10)) errors.push({ file, path: `${path}.nickname`, message: "must be a non-empty nickname of at most 10 characters" });
  if (value["ball"] !== undefined && (!showdownId(value["ball"]) || context.catalog[value["ball"]]?.battleUse !== "ball")) errors.push({ file, path: `${path}.ball`, message: "must name a registered ball" });
}

export function checkTrainerInputs(rawTypes: unknown, rawRecords: unknown, context: TrainerInputContext): { types?: TrainerTypeSource[]; records?: TrainerRecordSource[]; errors: ContentError[] } {
  const errors: ContentError[] = [];
  if (rawTypes === undefined && rawRecords === undefined) return { errors };
  if (!dense(rawTypes)) {
    errors.push({ file: "trainer-types.json", path: "$", message: "trainer records require a dense trainerTypes array" });
    return { errors };
  }
  const types: TrainerTypeSource[] = [], typeIds = new Set<string>();
  for (const [index, value] of rawTypes.entries()) {
    const path = `[${index}]`;
    if (!isObj(value)) { errors.push({ file: "trainer-types.json", path, message: "must be a trainer type" }); continue; }
    known(value, TYPE_KEYS, "trainer-types.json", path, errors);
    if (!id(value["id"])) errors.push({ file: "trainer-types.json", path: `${path}.id`, message: "must be a stable lowercase trainer type id" });
    else if (typeIds.has(value["id"])) errors.push({ file: "trainer-types.json", path: `${path}.id`, message: "duplicate trainer type id" });
    else typeIds.add(value["id"]);
    if (!string(value["nameKey"])) errors.push({ file: "trainer-types.json", path: `${path}.nameKey`, message: "must be a non-empty text key" });
    if (!isInt(value["gender"], 0, 2)) errors.push({ file: "trainer-types.json", path: `${path}.gender`, message: "must be 0, 1 or 2" });
    if (!isInt(value["baseMoney"])) errors.push({ file: "trainer-types.json", path: `${path}.baseMoney`, message: "must be a nonnegative safe integer" });
    if (!isInt(value["skillLevel"], 0, 255)) errors.push({ file: "trainer-types.json", path: `${path}.skillLevel`, message: "C projection requires an integer from 0 to 255" });
    if (!dense(value["flags"]) || value["flags"].some(flag => !string(flag)) || new Set(value["flags"]).size !== value["flags"].length) errors.push({ file: "trainer-types.json", path: `${path}.flags`, message: "must be a dense array of unique non-empty flags" });
    resources(value["items"], "trainer-types.json", `${path}.items`, context, errors);
    for (const field of ["battleBgm", "victoryBgm", "introBgm", "openingText", "winText", "loseText"] as const) if (value[field] !== undefined && typeof value[field] !== "string") errors.push({ file: "trainer-types.json", path: `${path}.${field}`, message: "D projection must be a string when provided" });
    const source = context.usable(value["source"]);
    if (source) errors.push({ file: "trainer-types.json", path: `${path}.source`, message: source });
    types.push(value as unknown as TrainerTypeSource);
  }
  if (!dense(rawRecords)) {
    errors.push({ file: "trainers.json", path: "$", message: "must be a dense array when trainer catalogs are present" });
    return { types, errors };
  }
  const records: TrainerRecordSource[] = [], recordKeys = new Set<string>();
  for (const [index, value] of rawRecords.entries()) {
    const path = `[${index}]`;
    if (!isObj(value)) { errors.push({ file: "trainers.json", path, message: "must be a trainer record" }); continue; }
    known(value, RECORD_KEYS, "trainers.json", path, errors);
    if (!id(value["id"])) errors.push({ file: "trainers.json", path: `${path}.id`, message: "must be a stable lowercase trainer record id" });
    if (!isInt(value["version"], 0, 255)) errors.push({ file: "trainers.json", path: `${path}.version`, message: "author version must be an integer from 0 to 255" });
    const recordKey = `${String(value["id"])}@${String(value["version"])}`;
    if (recordKeys.has(recordKey)) errors.push({ file: "trainers.json", path, message: "duplicate trainer record id + author version" });
    recordKeys.add(recordKey);
    if (!typeIds.has(value["type"] as string)) errors.push({ file: "trainers.json", path: `${path}.type`, message: "must name a registered trainer type" });
    if (!string(value["name"]) || !value["name"].trim()) errors.push({ file: "trainers.json", path: `${path}.name`, message: "must be a non-empty trainer name" });
    if (value["language"] !== undefined && !isInt(value["language"])) errors.push({ file: "trainers.json", path: `${path}.language`, message: "must be a nonnegative safe integer" });
    if (!dense(value["party"]) || value["party"].length < 1 || value["party"].length > 6) errors.push({ file: "trainers.json", path: `${path}.party`, message: "must contain 1 to 6 members" });
    else for (const [memberIndex, entry] of value["party"].entries()) member(entry, memberIndex, context, errors);
    if (value["items"] !== undefined) resources(value["items"], "trainers.json", `${path}.items`, context, errors);
    const source = context.usable(value["source"]);
    if (source) errors.push({ file: "trainers.json", path: `${path}.source`, message: source });
    records.push(value as unknown as TrainerRecordSource);
  }
  return { types, records, errors };
}

export function trainerSpeciesKeys(order: readonly SpeciesKey[]): ReadonlySet<string> {
  return new Set(order.map(keyOf));
}

export type { PartialStats };
