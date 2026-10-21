/**
 * Wild encounter selection (step 4): WP36 §5.1 for one table — slots sorted by weight (descending), one roll in
 * 0..total-1 walked down the sorted list, then a level drawn uniformly from the slot's range (both ends included).
 * Pure, with the injected random(n). The table is plain data: the MZ adapter reads it from a map note and hands it in;
 * nothing here knows the note syntax or the host.
 * Not in this slice (deferred): ability preference filters and level boosts (first member's ability), whistle
 * modifiers, several rolls, time-of-day / surf / cave / fishing types, and the WP36 §4.2 trigger probability — the
 * trigger frequency is the host's step counter (MZ map "encounter steps").
 */
import { draw } from "./member-factory.ts";
import type { Random } from "./member-factory.ts";

export interface EncounterSlot {
  /** Species as the author wrote it (content id or persistent name); the application resolves it against the content. */
  species: string;
  weight: number;
  minLevel: number;
  maxLevel: number;
}

export interface EncounterTable {
  /** Host regions where the table applies; empty = the whole map. */
  regions: number[];
  slots: EncounterSlot[];
}

export interface TableProblem { path: string; message: string }

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/** Structural check of a table handed in by a host. Every problem is located. */
export function validateEncounterTable(raw: unknown): { table: EncounterTable | null; problems: TableProblem[] } {
  const problems: TableProblem[] = [];
  if (!isObj(raw)) return { table: null, problems: [{ path: "$", message: "must be {regions, slots}" }] };
  const regions = raw["regions"];
  if (!Array.isArray(regions) || regions.some((r) => !isInt(r, 1, 255))) problems.push({ path: "$.regions", message: "must be an array of region ids 1..255 (empty = whole map)" });
  const slots = raw["slots"];
  if (!Array.isArray(slots) || !slots.length) problems.push({ path: "$.slots", message: "must be a non-empty array of {species, weight, minLevel, maxLevel}" });
  else for (const [i, s] of slots.entries()) {
    const p = `$.slots[${i}]`;
    if (!isObj(s)) { problems.push({ path: p, message: "must be an object" }); continue; }
    if (typeof s["species"] !== "string" || !s["species"]) problems.push({ path: `${p}.species`, message: "must be a species id" });
    if (!isInt(s["weight"], 1, 100000)) problems.push({ path: `${p}.weight`, message: "must be an integer from 1 to 100000" });
    if (!isInt(s["minLevel"], 1, 100) || !isInt(s["maxLevel"], 1, 100) || (s["minLevel"] as number) > (s["maxLevel"] as number)) problems.push({ path: `${p}.level`, message: "must be 1 <= minLevel <= maxLevel <= 100" });
  }
  return problems.length ? { table: null, problems } : { table: { regions: [...(regions as number[])], slots: (slots as EncounterSlot[]).map((s) => ({ species: s.species, weight: s.weight, minLevel: s.minLevel, maxLevel: s.maxLevel })) }, problems };
}

export function appliesAt(table: EncounterTable, region: number): boolean {
  return !table.regions.length || table.regions.includes(region);
}

/** WP36 §5.1 with one roll. Assumes a valid table. Draws: one roll over the total weight, then one level draw. */
export function pickEncounter(table: EncounterTable, random: Random): { species: string; level: number } {
  const sorted = table.slots.map((s, i) => ({ s, i })).sort((a, b) => b.s.weight - a.s.weight || a.i - b.i).map((x) => x.s);
  const total = sorted.reduce((n, s) => n + s.weight, 0);
  let roll = draw(random, total);
  let slot = sorted[sorted.length - 1]!;
  for (const s of sorted) { if (roll < s.weight) { slot = s; break; } roll -= s.weight; }
  const level = slot.minLevel + draw(random, slot.maxLevel - slot.minLevel + 1);
  return { species: slot.species, level };
}
