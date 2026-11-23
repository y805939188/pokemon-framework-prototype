/** WP36 candidate selection. Formal compiled tables only; legacy map-note selection stays in encounter.ts. */
import { draw } from "./member-factory";
import type { Random } from "./member-factory";
import type { Member } from "./types";
import { ENCOUNTER_TYPES } from "./world-data";
import type { EncounterTypeId, WorldEncounterRecord, WorldEncounterSlot } from "./world-data";
import type { WorldLocalState } from "./world-state";

export type FormalEncounterTables = WorldEncounterRecord["types"];
export type FormalEncounterTable = NonNullable<FormalEncounterTables[EncounterTypeId]>;
export interface EncounterLead extends Pick<Member, "isEgg" | "hp" | "level" | "ability"> {
  /** Effective held-item identity projected from the catalog, not an arbitrary author item ID. */
  readonly item: string;
}
export interface EncounterCandidate { readonly species: string; readonly level: number }
export type EncounterLevelFlags = Pick<WorldLocalState, "lowerWildLevel" | "higherWildLevel">;

const identity = (value: string): string => value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
export function firstEncounterLead(party: readonly EncounterLead[]): EncounterLead | undefined {
  return party.find(member => !member.isEgg);
}
export function isEncounterType(value: unknown): value is EncounterTypeId {
  return typeof value === "string" && Object.hasOwn(ENCOUNTER_TYPES, value);
}
export function hasEncounterCategory(tables: FormalEncounterTables, category: "land" | "cave" | "water"): boolean {
  return (Object.keys(ENCOUNTER_TYPES) as EncounterTypeId[]).some(type =>
    (ENCOUNTER_TYPES[type].category === category || category === "land" && ENCOUNTER_TYPES[type].category === "contest")
    && (Object.hasOwn(tables, type) ? tables[type]?.slots.length ?? 0 : 0) > 0);
}

/** Hour predicates overlap as specified: daytime subtypes precede Day, then the base fallback. */
export function selectTimedEncounterType(tables: FormalEncounterTables, base: "Land" | "Cave" | "Water", hour: number): EncounterTypeId | null {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new RangeError("encounter hour must be 0..23");
  const exists = (type: EncounterTypeId): boolean => Object.hasOwn(tables, type);
  const day = hour >= 5 && hour < 20;
  const candidates: EncounterTypeId[] = [];
  if (day) {
    if (hour < 10) candidates.push(`${base}Morning`);
    else if (hour >= 14 && hour < 17) candidates.push(`${base}Afternoon`);
    else if (hour >= 17) candidates.push(`${base}Evening`);
    candidates.push(`${base}Day`);
  } else candidates.push(`${base}Night`);
  candidates.push(base);
  return candidates.find(exists) ?? null;
}

export function selectOrdinaryEncounterType(tables: FormalEncounterTables, input: { readonly surfing: boolean; readonly landAllowed: boolean; readonly hour: number }): EncounterTypeId | null {
  if (input.surfing) return selectTimedEncounterType(tables, "Water", input.hour);
  if (input.landAllowed && hasEncounterCategory(tables, "land")) {
    const land = selectTimedEncounterType(tables, "Land", input.hour);
    if (land) return land;
  }
  return hasEncounterCategory(tables, "cave") ? selectTimedEncounterType(tables, "Cave", input.hour) : null;
}

export interface CandidateSelectionOptions {
  readonly party: readonly EncounterLead[];
  readonly moreAbilities: boolean;
  /** Registered type identities and effective author types, supplied by the content owner. */
  readonly registeredTypes: readonly string[];
  readonly speciesTypes: Readonly<Record<string, readonly string[]>>;
  readonly local: EncounterLevelFlags;
  readonly rolls?: number;
}

function preferredType(lead: EncounterLead | undefined, moreAbilities: boolean): string | undefined {
  switch (identity(lead?.ability ?? "")) {
    case "magnetpull": return "Steel";
    case "static": return "Electric";
    case "flashfire": return moreAbilities ? "Fire" : undefined;
    case "harvest": return moreAbilities ? "Grass" : undefined;
    case "lightningrod": return moreAbilities ? "Electric" : undefined;
    case "stormdrain": return moreAbilities ? "Water" : undefined;
    default: return undefined;
  }
}

function validateSlots(slots: readonly WorldEncounterSlot[]): void {
  for (const slot of slots) {
    if (typeof slot.species !== "string" || !slot.species || !Number.isSafeInteger(slot.weight) || slot.weight <= 0
      || !Number.isInteger(slot.minLevel) || !Number.isInteger(slot.maxLevel)
      || slot.minLevel < 1 || slot.maxLevel > 100 || slot.minLevel > slot.maxLevel) throw new RangeError("invalid formal encounter slot");
  }
}

/** Uniform base level, optional maximum-level ability, then the two semantic flute flags. */
export function selectEncounterLevel(slot: WorldEncounterSlot, party: readonly EncounterLead[], local: EncounterLevelFlags, random: Random): number {
  validateSlots([slot]);
  let level = slot.minLevel + draw(random, slot.maxLevel - slot.minLevel + 1);
  const ability = identity(firstEncounterLead(party)?.ability ?? "");
  if ((ability === "hustle" || ability === "pressure" || ability === "vitalspirit") && draw(random, 100) < 50) level = slot.maxLevel;
  if (local.lowerWildLevel) level = Math.max(1, level - draw(random, 4) - 1);
  else if (local.higherWildLevel) level = Math.min(100, level + draw(random, 4) + 1);
  return level;
}

/** Prefix: preference percentage (if eligible), N weighted draws, base level, ability percentage, flute amount. */
export function selectEncounterCandidate(table: FormalEncounterTable | undefined, options: CandidateSelectionOptions, random: Random): EncounterCandidate | null {
  if (!table || !table.slots.length) return null;
  validateSlots(table.slots);
  const rolls = options.rolls ?? 1;
  if (!Number.isSafeInteger(rolls) || rolls < 1) throw new RangeError("encounter rolls must be a positive safe integer");
  let slots: readonly WorldEncounterSlot[] = table.slots;
  const preferred = preferredType(firstEncounterLead(options.party), options.moreAbilities);
  if (preferred && options.registeredTypes.includes(preferred) && draw(random, 100) < 50) {
    const filtered = slots.filter(slot => {
      if (!Object.hasOwn(options.speciesTypes, slot.species)) throw new Error(`encounter species types unavailable: ${slot.species}`);
      return options.speciesTypes[slot.species]!.includes(preferred);
    });
    if (filtered.length) slots = filtered;
  }
  // Stable sorting retains the compiler's species-name order for equal weights.
  slots = slots.map((slot, index) => ({ slot, index })).sort((a, b) => b.slot.weight - a.slot.weight || a.index - b.index).map(value => value.slot);
  const total = slots.reduce((sum, slot) => sum + slot.weight, 0);
  if (!Number.isSafeInteger(total)) throw new RangeError("encounter total weight must be a safe integer");
  let roll = -1;
  for (let index = 0; index < rolls; index++) roll = Math.max(roll, draw(random, total));
  let selected = slots[slots.length - 1]!;
  for (const slot of slots) { if (roll < slot.weight) { selected = slot; break; } roll -= slot.weight; }
  return { species: selected.species, level: selectEncounterLevel(selected, options.party, options.local, random) };
}
