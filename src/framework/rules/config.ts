/**
 * Rule configuration profile (WP02; r8 FR-000388..FR-000393, subset): the settings this build CONSUMES, their defaults
 * at mechanics generation 8 (WP02 §4 "世代 8 默认值"), and validated author overrides (content settings.json).
 * Setting names are the reference's data identifiers (WP02 §1: author inputs, not an API promise).
 *   MECHANICS_GENERATION  8        the base of derived defaults (WP02 §3); this build supports 8 only (the pinned
 *                                  battle format is Gen 8), so another value is refused rather than half-applied
 *   MAX_MONEY             999999   money cap (WP24)
 *   MAX_PARTY_SIZE        6        party capacity; at most 6 (one battle side holds six)
 *   NUM_STORAGE_BOXES     40       boxes x BOX_SIZE (30, WP25) is the storage capacity of this build's flat list
 *   BAG_MAX_PER_SLOT      999      per-slot cap (WP27); this build keeps one count per item (stage limit)
 * The reference validates none of its settings (WP02 §8); the ranges below are this framework's own supported ranges.
 * None of the five is derived from the generation (WP02 §5), so a literal override needs no detaching rule here. Pure.
 */
import type { Limits } from "./limits.ts";
import { own } from "./own.ts";

export interface RuleConfig {
  MECHANICS_GENERATION: number;
  MAX_MONEY: number;
  MAX_PARTY_SIZE: number;
  NUM_STORAGE_BOXES: number;
  BAG_MAX_PER_SLOT: number;
}

/** Slots per box (WP25 §3.1); not a setting of the reference. */
export const BOX_SIZE = 30;

export const GEN8_DEFAULTS: Readonly<RuleConfig> = Object.freeze({ MECHANICS_GENERATION: 8, MAX_MONEY: 999999, MAX_PARTY_SIZE: 6, NUM_STORAGE_BOXES: 40, BAG_MAX_PER_SLOT: 999 });

const RANGES: Record<keyof RuleConfig, [number, number, string?]> = {
  MECHANICS_GENERATION: [8, 8, "this build supports mechanics generation 8 only (the battle format is Gen 8)"],
  MAX_MONEY: [0, 2147483647],
  MAX_PARTY_SIZE: [1, 6, "a party holds 1 to 6 members (one battle side)"],
  NUM_STORAGE_BOXES: [1, 1000],
  BAG_MAX_PER_SLOT: [1, 9999],
};

export interface ConfigProblem { path: string; message: string }

/** Located problems of author overrides; an empty list means every key is known and every value is in range. */
export function checkOverrides(overrides: unknown): ConfigProblem[] {
  if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides)) return [{ path: "$", message: "must be an object of setting name -> value" }];
  const out: ConfigProblem[] = [];
  for (const [k, v] of Object.entries(overrides)) {
    const range = own(RANGES as Record<string, [number, number, string?]>, k); // own keys only: "constructor" is not a setting
    if (!range) { out.push({ path: `$.${k}`, message: `unknown or unsupported setting (this build reads: ${Object.keys(RANGES).join(", ")})` }); continue; }
    const [lo, hi, why] = range;
    if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) out.push({ path: `$.${k}`, message: why ?? `must be an integer from ${lo} to ${hi}` });
  }
  return out;
}

/** The effective profile: the Gen 8 defaults with the overrides on top. Throws on overrides `checkOverrides` refuses. */
export function resolveConfig(overrides: unknown = {}): RuleConfig {
  const problems = checkOverrides(overrides);
  if (problems.length) throw new Error(`rule configuration: ${problems.map((p) => `${p.path} ${p.message}`).join("; ")}`);
  return { ...GEN8_DEFAULTS, ...(overrides as Partial<RuleConfig>) };
}

/** The stage capacities (rules/limits.ts) a profile gives. */
export function limitsOf(config: RuleConfig): Limits {
  return { party: config.MAX_PARTY_SIZE, boxes: config.NUM_STORAGE_BOXES * BOX_SIZE, bagPerItem: config.BAG_MAX_PER_SLOT, money: config.MAX_MONEY };
}
