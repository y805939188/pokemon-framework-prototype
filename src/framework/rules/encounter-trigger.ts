/** WP36 probability and admission. Returns the runtime delta; only the application installs it. */
import { draw } from "./member-factory";
import type { Random } from "./member-factory";
import { firstEncounterLead, hasEncounterCategory, isEncounterType } from "./encounter-selection";
import type { EncounterCandidate, EncounterLead, FormalEncounterTable, FormalEncounterTables } from "./encounter-selection";
import type { EncounterTypeId, WorldWeatherCategory } from "./world-data";
import type { EncounterRuntime, WorldLocalState } from "./world-state";

export type EncounterCounters = Pick<EncounterRuntime, "graceSteps" | "accumulator">;
export type EncounterRateFlags = Pick<WorldLocalState, "lowerEncounterRate" | "higherEncounterRate">;
const identity = (value: string): string => value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();

export function ordinaryEncounterOpportunity(tables: FormalEncounterTables, input: { readonly surfing: boolean; readonly ice: boolean; readonly landAllowed: boolean }): boolean {
  if (input.surfing) return true;
  if (input.ice) return false;
  return hasEncounterCategory(tables, "cave") || input.landAllowed && hasEncounterCategory(tables, "land");
}

export interface EncounterTriggerInput {
  readonly type: EncounterTypeId;
  readonly table: FormalEncounterTable | undefined;
  readonly runtime: EncounterCounters;
  readonly party: readonly EncounterLead[];
  readonly local: EncounterRateFlags;
  readonly weatherCategory: WorldWeatherCategory;
  readonly moreAbilities: boolean;
  readonly disabled: boolean;
  readonly playerPresent: boolean;
  readonly debugControl: boolean;
  readonly fromStep: boolean;
  readonly cycling: boolean;
  /** Latched at the start of this completed step, before decrement/renewal. */
  readonly repelActive: boolean;
}
export interface EncounterTriggerResult {
  readonly triggered: boolean;
  readonly reason: "disabled" | "no-player" | "debug-control" | "no-chance" | "no-table" | "grace" | "miss" | "triggered";
  readonly runtime: EncounterCounters;
}

/** Pure adjustment, in the fixed order: accumulator/bicycle, map flags, held item or ability. */
export function encounterProbability(input: EncounterTriggerInput): { readonly chance: number; readonly minimumSteps: number; readonly graceThreshold: number } {
  const base = input.table?.stepChance;
  if (base === undefined || !Number.isSafeInteger(base)) throw new RangeError("encounter stepChance must be a safe integer");
  const folded = input.fromStep ? Math.floor(input.runtime.accumulator / 200) : 0;
  let chance = base + folded;
  let minimumSteps = Math.max(0, Math.min(8, 8 - base / 10));
  if (input.cycling) chance *= 0.8;
  if (input.local.lowerEncounterRate) { chance /= 2; minimumSteps *= 2; }
  else if (input.local.higherEncounterRate) { chance *= 1.5; minimumSteps /= 2; }
  const lead = firstEncounterLead(input.party), item = identity(lead?.item ?? ""), ability = identity(lead?.ability ?? "");
  if (item === "cleansetag" || item === "pureincense") { chance *= 2 / 3; minimumSteps *= 4 / 3; }
  else if (["stench", "whitesmoke", "quickfeet"].includes(ability) || ability === "infiltrator" && input.moreAbilities
    || ability === "snowcloak" && input.weatherCategory === "Hail" || ability === "sandveil" && input.weatherCategory === "Sandstorm") {
    chance /= 2; minimumSteps *= 2;
  } else if (ability === "swarm") { chance *= 1.5; minimumSteps /= 2; }
  else if (["illuminate", "arenatrap", "noguard"].includes(ability)) { chance *= 2; minimumSteps /= 2; }
  return { chance, minimumSteps, graceThreshold: chance * 5 / (base + folded) };
}

export function checkEncounterTrigger(input: EncounterTriggerInput, random: Random): EncounterTriggerResult {
  if (!isEncounterType(input.type)) throw new RangeError("unknown encounter type");
  const runtime = { ...input.runtime };
  const finish = (reason: EncounterTriggerResult["reason"]): EncounterTriggerResult => ({ triggered: reason === "triggered", reason, runtime });
  if (input.disabled) return finish("disabled");
  if (!input.playerPresent) return finish("no-player");
  if (input.debugControl) return finish("debug-control");
  if (!input.table || input.table.stepChance === 0) return finish("no-chance");
  if (!input.table.slots.length) return finish("no-table");
  if (!Number.isSafeInteger(runtime.graceSteps) || runtime.graceSteps < 0 || !Number.isSafeInteger(runtime.accumulator)) throw new RangeError("invalid encounter runtime");
  const probability = encounterProbability(input);
  if (input.fromStep && runtime.graceSteps < probability.minimumSteps) {
    runtime.graceSteps++;
    if (draw(random, 100) >= probability.graceThreshold) return finish("grace");
  }
  if (draw(random, 100) < probability.chance) return finish("triggered");
  if (input.fromStep) {
    runtime.accumulator += input.table.stepChance;
    if (!Number.isSafeInteger(runtime.accumulator)) throw new RangeError("encounter accumulator overflow");
    if (input.repelActive) runtime.accumulator = 0;
  }
  return finish("miss");
}

export interface EncounterAllowanceInput {
  readonly candidate: EncounterCandidate | null;
  readonly party: readonly EncounterLead[];
  readonly repelActive: boolean;
  readonly repelCountsFainted: boolean;
  readonly runtime: EncounterCounters;
}
export function checkEncounterAllowance(input: EncounterAllowanceInput, random: Random): { readonly allowed: boolean; readonly reason: "no-candidate" | "repel" | "ability" | "allowed"; readonly runtime: EncounterCounters } {
  const runtime = { ...input.runtime };
  if (!input.candidate) return { allowed: false, reason: "no-candidate", runtime };
  const lead = firstEncounterLead(input.party);
  const repelLead = input.repelCountsFainted ? lead : input.party.find(member => !member.isEgg && member.hp > 0);
  if (input.repelActive && repelLead && repelLead.level > input.candidate.level) {
    runtime.accumulator = 0;
    return { allowed: false, reason: "repel", runtime };
  }
  const ability = identity(lead?.ability ?? "");
  if (lead && (ability === "intimidate" || ability === "keeneye") && input.candidate.level <= lead.level - 5 && draw(random, 100) < 50) {
    return { allowed: false, reason: "ability", runtime };
  }
  return { allowed: true, reason: "allowed", runtime };
}

/** This release has no double-encounter consumer. No partner/terrain RNG is read. */
export function ordinaryEncounterIsDouble(): false { return false; }
