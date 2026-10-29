/**
 * Rule configuration profile (WP02; r8 FR-000388..FR-000393, subset): the settings this build CONSUMES, their defaults
 * at mechanics generation 8 (WP02 §4 "世代 8 默认值"), and validated author overrides (content settings.json).
 * Setting names are the reference's data identifiers (WP02 §1: author inputs, not an API promise).
 *   MECHANICS_GENERATION  8        the base of derived defaults (WP02 §3); this build supports 8 only (the pinned
 *                                  battle format is Gen 8), so another value is refused rather than half-applied
 *   MAX_MONEY             999999   money cap (WP24)
 *   MAX_PARTY_SIZE        6        party capacity; at most 6 (one battle side holds six)
 *   NUM_STORAGE_BOXES     40       boxes x BOX_SIZE (30, WP25) is the storage capacity of this build's flat list
 *   BAG_MAX_PER_SLOT      999      per-slot cap (WP27); one item may span multiple slots
 * The reference validates none of its settings (WP02 §8); the ranges below are this framework's own supported ranges.
 * None of the five is derived from the generation (WP02 §5), so a literal override needs no detaching rule here. Pure.
 */
import type { Limits } from "./limits";
import { own } from "./own";

export interface RuleConfig {
  CHECK_EVOLUTION_AFTER_ALL_BATTLES: boolean;
  CHECK_EVOLUTION_FOR_FAINTED_POKEMON: boolean;
  MOVE_RELEARNER_CAN_TEACH_MORE_MOVES: boolean;
  RARE_CANDY_USABLE_AT_MAX_LEVEL: boolean;
  SHOW_NEW_SPECIES_POKEDEX_ENTRY_MORE_OFTEN: boolean;
  USE_CURRENT_REGION_DEX: boolean;
  DEX_SHOWS_ALL_FORMS: boolean;
  DEXES_WITH_OFFSETS: number[];
  MECHANICS_GENERATION: number;
  MAX_MONEY: number;
  MAX_PARTY_SIZE: number;
  NUM_STORAGE_BOXES: number;
  BAG_MAX_PER_SLOT: number;
  BAG_POCKET_SLOTS: number[];
  BAG_AUTO_SORT: boolean[];
  AFFECTION_EFFECTS: boolean;
  MORE_BONUS_PREMIER_BALLS: boolean;
  USE_MULTIPLE_STAT_ITEMS_AT_ONCE: boolean;
  NO_VITAMIN_EV_CAP: boolean;
  REBALANCED_HEALING_ITEM_AMOUNTS: boolean;
  RAGE_CANDY_BAR_CURES_STATUS_PROBLEMS: boolean;
  TAUGHT_MACHINES_KEEP_OLD_PP: boolean;
  ANY_HIGH_LEVEL_POKEMON_CAN_DISOBEY: boolean;
  FOREIGN_HIGH_LEVEL_POKEMON_CAN_DISOBEY: boolean;
}

/** Slots per box (WP25 §3.1); not a setting of the reference. */
export const BOX_SIZE = 30;

export const GEN8_DEFAULTS: Readonly<RuleConfig> = Object.freeze({ CHECK_EVOLUTION_AFTER_ALL_BATTLES: true, CHECK_EVOLUTION_FOR_FAINTED_POKEMON: true, MOVE_RELEARNER_CAN_TEACH_MORE_MOVES: true, RARE_CANDY_USABLE_AT_MAX_LEVEL: true, SHOW_NEW_SPECIES_POKEDEX_ENTRY_MORE_OFTEN: true, USE_CURRENT_REGION_DEX: false, DEX_SHOWS_ALL_FORMS: false, DEXES_WITH_OFFSETS: Object.freeze([]) as unknown as number[],  MECHANICS_GENERATION: 8, MAX_MONEY: 999999, MAX_PARTY_SIZE: 6, NUM_STORAGE_BOXES: 40, BAG_MAX_PER_SLOT: 999,
  BAG_POCKET_SLOTS: Object.freeze([-1,-1,-1,-1,-1,-1,-1,-1]) as unknown as number[], BAG_AUTO_SORT: Object.freeze([false,false,false,true,true,false,false,false]) as unknown as boolean[],
  AFFECTION_EFFECTS: false, MORE_BONUS_PREMIER_BALLS: true, USE_MULTIPLE_STAT_ITEMS_AT_ONCE: true, NO_VITAMIN_EV_CAP: true,
  REBALANCED_HEALING_ITEM_AMOUNTS: true, RAGE_CANDY_BAR_CURES_STATUS_PROBLEMS: true, TAUGHT_MACHINES_KEEP_OLD_PP: false,
  ANY_HIGH_LEVEL_POKEMON_CAN_DISOBEY: false, FOREIGN_HIGH_LEVEL_POKEMON_CAN_DISOBEY: true });

const RANGES: Partial<Record<keyof RuleConfig, [number, number, string?]>> = {
  MECHANICS_GENERATION: [8, 8, "this build supports mechanics generation 8 only (the battle format is Gen 8)"],
  MAX_MONEY: [0, 2147483647],
  MAX_PARTY_SIZE: [1, 6, "a party holds 1 to 6 members (one battle side)"],
  NUM_STORAGE_BOXES: [40, 40, "5.1 supports NUM_STORAGE_BOXES=40 only (5.0 supported 1–1000); change author content explicitly, never truncate an old save"],
  BAG_MAX_PER_SLOT: [1, 9999],
};

export interface ConfigProblem { path: string; message: string }

/** Located problems of author overrides; an empty list means every key is known and every value is in range. */
export function checkOverrides(overrides: unknown): ConfigProblem[] {
  if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides)) return [{ path: "$", message: "must be an object of setting name -> value" }];
  const out: ConfigProblem[] = [];
  for (const [k, v] of Object.entries(overrides)) {
    if (Object.hasOwn(GEN8_DEFAULTS, k) && typeof GEN8_DEFAULTS[k as keyof RuleConfig] === 'boolean') {
      if (typeof v !== 'boolean') out.push({ path: `$.${k}`, message: 'must be boolean' });
      continue;
    }
    if (k === 'DEXES_WITH_OFFSETS') {
      if (!Array.isArray(v) || Object.keys(v).length !== v.length || v.some(n => !Number.isSafeInteger(n) || n < -1) || new Set(v).size !== v.length) out.push({path: `$.${k}`, message: 'must be a dense array of unique integers >= -1; content validates region references'});
      continue;
    }
    if (k === 'BAG_POCKET_SLOTS' || k === 'BAG_AUTO_SORT') {
      if (!Array.isArray(v) || v.length !== 8 || v.some(n => k === 'BAG_AUTO_SORT' ? typeof n !== 'boolean' : !Number.isSafeInteger(n) || (n as number) < -1 || (n as number) > 0xffffffff)) out.push({ path: `$.${k}`, message: 'must be eight pocket values (slots -1 or nonnegative integer; sorting boolean)' });
      continue;
    }
    const range = own(RANGES as Record<string, [number, number, string?]>, k); // own keys only: "constructor" is not a setting
    if (!range) { out.push({ path: `$.${k}`, message: `unknown or unsupported setting (this build reads: ${Object.keys(RANGES).join(", ")})` }); continue; }
    const [lo, hi, why] = range;
    if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) out.push({ path: `$.${k}`, message: why ? `${why}; actual value: ${String(v)}` : `must be an integer from ${lo} to ${hi}` });
  }
  return out;
}

/** The effective profile: the Gen 8 defaults with the overrides on top. Throws on overrides `checkOverrides` refuses. */
export function resolveConfig(overrides: unknown = {}): RuleConfig {
  const problems = checkOverrides(overrides);
  if (problems.length) throw new Error(`rule configuration: ${problems.map((p) => `${p.path} ${p.message}`).join("; ")}`);
  return JSON.parse(JSON.stringify({ ...GEN8_DEFAULTS, ...(overrides as Partial<RuleConfig>) })) as RuleConfig;
}

/** The stage capacities (rules/limits.ts) a profile gives. */
export function limitsOf(config: RuleConfig): Limits {
  return { party: config.MAX_PARTY_SIZE, boxes: config.NUM_STORAGE_BOXES * BOX_SIZE, bagPerItem: config.BAG_MAX_PER_SLOT, money: config.MAX_MONEY };
}

/** Controlled developer/test injection only: never read from settings.json or a save. */
export interface DevelopmentCapabilities { allowHeldItemSources: boolean; allowExperimentalHeldItemBattle: boolean }
export function developmentCapabilities(raw: unknown = {}): DevelopmentCapabilities {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("development capabilities must be an object");
  const record = raw as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) if (!["allowHeldItemSources", "allowExperimentalHeldItemBattle"].includes(key) || typeof value !== "boolean") throw new Error(`invalid development capability ${key}`);
  return { allowHeldItemSources: false, allowExperimentalHeldItemBattle: false, ...record } as DevelopmentCapabilities;
}

export type { RuleOverrides } from "./settings-types";
