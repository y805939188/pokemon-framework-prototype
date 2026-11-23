/** WP36 ordinary wild generation, restricted to the explicitly supported creation domain.
 * Admission, IDs, world/source tickets and final Member validation remain owned by the App.
 */
import { computeStats, minExp } from "./growth";
import { draw, initialMoves } from "./member-factory";
import type { Random } from "./member-factory";
import { NATURE_ORDER } from "./member-identity";
import { clonePersistentMember } from "./member-metadata";
import { catalogOf, heldItemDescriptor, itemOf } from "./item-catalog";
import { own } from "./own";
import { creationBattleNameOf } from "./species-key";
import { creationFormCandidates } from "./creation-form";
import { createWildMemberDraft, wildShinyRetries } from "./wild-member";
import type { CreateWildMemberInput, WildCreationRegistration, WildFormRegistration } from "./wild-member";
import type { Content, GenderRule, Member, SpeciesData, StatKey, Stats } from "./types";

export type WildGenerationSource = "step" | "event" | "fishing" | "sweet-scent" | "rock-smash";
export interface WildGenerationPartyMember {
  readonly isEgg: boolean;
  readonly hp: number;
  readonly level: number;
  readonly ability: string;
  readonly gender: "M" | "F" | "N";
  readonly nature: string;
}
export interface OrdinaryWildGenerationFacts {
  /** A label carried by the caller, never a source permission or a settlement fact. */
  readonly source: WildGenerationSource;
  readonly session: "ordinary" | "safari" | "contest" | "facility";
  readonly registration: WildCreationRegistration;
  readonly party: readonly WildGenerationPartyMember[];
  readonly shinyCharm: boolean;
  readonly forceShiny?: boolean;
  readonly higherShinyByBattled: boolean;
  readonly battledCount: number;
  readonly moreAbilities: boolean;
  readonly roamer: boolean;
  readonly legendaryPerfectIVs: boolean;
  readonly scaleWildLevels: boolean;
  /** The App's controlled runtime capability, never settings or saved input. Production is currently enabled. */
  readonly allowHeldItemSources: boolean;
}
export type WildHeldItemLookup = (id: string) => { id?: string; holdable: boolean; mail: boolean } | null;
export type WildGenerationUnsupported = "source" | "session-hooks" | "rule-family-unavailable" | "form-handler"
  | "ambiguous-held-pools"
  | "held-item-source-disabled" | "held-item-source-unchecked" | "held-item-data-unavailable" | "held-item-descriptor";
export type WildGenerationResult = { status: "created"; member: Member; registrations?: readonly WildFormRegistration[] }
  | { status: "unsupported"; reason: WildGenerationUnsupported };

const identity = (value: string): string => value.replace(/[^a-z0-9]/gi, "").toUpperCase();

function checkParty(party: readonly WildGenerationPartyMember[]): void {
  if (!Array.isArray(party)) throw new TypeError("wild generation requires the whole party projection");
  for (const member of party) {
    if (!member || typeof member !== "object" || typeof member.isEgg !== "boolean" || !Number.isSafeInteger(member.hp) || member.hp < 0
      || !Number.isInteger(member.level) || member.level < 1 || member.level > 100 || typeof member.ability !== "string"
      || !["M", "F", "N"].includes(member.gender) || typeof member.nature !== "string" || !NATURE_ORDER.includes(member.nature.toLowerCase())) throw new TypeError("invalid wild party projection");
  }
}
function checkFacts(facts: OrdinaryWildGenerationFacts): void {
  for (const key of ["shinyCharm", "higherShinyByBattled", "moreAbilities", "roamer", "legendaryPerfectIVs", "scaleWildLevels", "allowHeldItemSources"] as const) {
    if (typeof facts[key] !== "boolean") throw new TypeError(`missing or invalid wild fact ${key}`);
  }
  if (!Number.isSafeInteger(facts.battledCount) || facts.battledCount < 0) throw new RangeError("battledCount must be a nonnegative safe integer");
  if (!facts.registration || typeof facts.registration.playerPresent !== "boolean" || typeof facts.registration.dexPresent !== "boolean") throw new TypeError("wild generation requires player/dex presence facts");
  if (facts.forceShiny !== undefined && typeof facts.forceShiny !== "boolean") throw new TypeError("invalid force-shiny fact");
  checkParty(facts.party);
}

export interface WildLeadOverrides { readonly gender: "M" | "F" | null; readonly nature: string | null }
/** Frozen framework maps: draw3 0/1 opposite, 2 same; non-expanded Synchronize draw100 < 50. */
export function wildLeadOverrides(targetGender: GenderRule, party: readonly WildGenerationPartyMember[], moreAbilities: boolean, roamer: boolean, random: Random): WildLeadOverrides {
  checkParty(party);
  if (typeof moreAbilities !== "boolean" || typeof roamer !== "boolean") throw new TypeError("invalid lead configuration facts");
  if (!(typeof targetGender === "number" && [32, 64, 128, 192, 224].includes(targetGender)) && !["M", "F", "N"].includes(String(targetGender))) throw new TypeError("unsupported target gender rule");
  const lead = party.find(member => !member.isEgg);
  if (!lead) return { gender: null, nature: null };
  const ability = identity(lead.ability);
  if (ability === "CUTECHARM" && typeof targetGender === "number" && lead.gender !== "N") {
    const opposite = draw(random, 3) < 2;
    return { gender: opposite ? (lead.gender === "M" ? "F" : "M") : lead.gender, nature: null };
  }
  if (ability === "SYNCHRONIZE" && !roamer && (moreAbilities || draw(random, 100) < 50)) return { gender: null, nature: lead.nature.toLowerCase() };
  return { gender: null, nature: null };
}

/** WP36 §6.2; all supplied levels participate. Zero levels are only the formal arithmetic fixture boundary. */
export function balancedPartyLevel(levels: readonly number[], maxLevel = 100): number {
  if (!Number.isInteger(maxLevel) || maxLevel < 1 || maxLevel > 100 || !Array.isArray(levels)
    || levels.some(level => !Number.isInteger(level) || level < 0 || level > maxLevel)) throw new RangeError("invalid balanced-level input");
  const sum = levels.reduce((total, level) => total + level, 0);
  if (!Number.isSafeInteger(sum)) throw new RangeError("party level sum is not a safe integer");
  if (levels.length === 0 || sum === 0) return 1;
  const mean = sum / levels.length;
  const deviation = Math.sqrt(levels.reduce((total, level) => total + (level - mean) ** 2, 0) / levels.length);
  const weights = levels.map(level => level / sum < 0.5 ? Math.max(level / sum - deviation / maxLevel, 0.001) : Math.min(level / sum + deviation / maxLevel, 0.999));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  const average = levels.reduce((total, level, index) => total + level * weights[index]!, 0) / totalWeight;
  return Math.min(Math.max(Math.round(average), 1) + 2, maxLevel);
}

export function scaledWildLevel(levels: readonly number[], random: Random): number {
  const balanced = balancedPartyLevel(levels);
  return Math.max(1, Math.min(100, balanced - 4 + draw(random, 5)));
}

type HeldPlan = { kind: "empty" } | { kind: "same"; pool: readonly string[] } | { kind: "pools"; pools: readonly (readonly string[])[] };
type HeldCheck = { ok: true; plan: HeldPlan } | { ok: false; reason: WildGenerationUnsupported };
function checkedHeldPlan(species: SpeciesData, content: Content, facts: OrdinaryWildGenerationFacts, lookup: WildHeldItemLookup | undefined): HeldCheck {
  const pools = [species.wildItemCommon ?? [], species.wildItemUncommon ?? [], species.wildItemRare ?? []].map(pool => {
    if (!Array.isArray(pool)) throw new TypeError("invalid canonical wild held-item pools");
    const copy = [...pool];
    if (copy.some(item => typeof item !== "string" || !/^[a-z0-9-]{1,64}$/.test(item))) throw new TypeError("invalid canonical wild held-item pools");
    return copy;
  });
  if (pools.every(pool => pool.length === 0)) return { ok: true, plan: { kind: "empty" } };
  if (!facts.allowHeldItemSources) return { ok: false, reason: "held-item-source-disabled" };
  if (content.meta?.showdownSourceChecked !== true) return { ok: false, reason: "held-item-source-unchecked" };
  if (!lookup) return { ok: false, reason: "held-item-data-unavailable" };
  const catalog = catalogOf(content);
  // A real capture must retain the generated item. Native holdability alone cannot authorize an unmapped persistent ID.
  const items = new Set(pools.flat());
  for (const item of items) if (!itemOf(catalog, item)) return { ok: false, reason: "held-item-descriptor" };
  for (const item of items) if (!heldItemDescriptor(catalog, item, lookup)) return { ok: false, reason: "held-item-descriptor" };
  return { ok: true, plan: pools.every(pool => pool.length === pools[0]!.length && pool.every((item, index) => item === pools[0]![index]))
    ? { kind: "same", pool: pools[0]! } : { kind: "pools", pools } };
}
function selectHeldItem(plan: HeldPlan, improved: boolean, random: Random): string {
  if (plan.kind === "empty") return "";
  if (plan.kind === "same") return plan.pool.length === 1 ? plan.pool[0]! : plan.pool[draw(random, plan.pool.length)]!;
  const roll = draw(random, 100);
  const common = improved ? 60 : 50, uncommon = common + (improved ? 20 : 5), rare = uncommon + (improved ? 5 : 1);
  const tier = roll < common ? 0 : roll < uncommon ? 1 : roll < rare ? 2 : -1;
  if (tier < 0) return "";
  const pool = plan.pools[tier]!;
  return pool.length === 0 ? "" : pool[draw(random, pool.length)]!;
}

/** P04: select three distinct keys from all six, including initially-perfect IVs. */
function legendaryIVs(ivs: Readonly<Stats>, random: Random): Stats {
  const out = { ...ivs }, remaining: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];
  for (let count = 0; count < 3; count++) out[remaining.splice(draw(random, remaining.length), 1)[0]!] = 31;
  return out;
}

/** Already-admitted, ordinary-session species/level creation only. Unsupported paths consume no RNG. */
export function createWildSpecies(input: CreateWildMemberInput, content: Content, facts: OrdinaryWildGenerationFacts, random: Random, heldLookup?: WildHeldItemLookup): WildGenerationResult {
  checkFacts(facts);
  if (!["step", "event", "fishing", "sweet-scent", "rock-smash"].includes(facts.source)) return { status: "unsupported", reason: "source" };
  if (facts.session !== "ordinary") return { status: "unsupported", reason: "session-hooks" };
  const initial = own(content.species, input.species);
  if (!initial) throw new Error(`species "${input.species}" is not in the content`);
  if (typeof initial.ruleSpecies !== "string" || !initial.ruleSpecies) return { status: "unsupported", reason: "rule-family-unavailable" };
  const forms = input.form !== undefined ? [input.form] : (initial.form ?? 0) !== 0 || input.recheckForm === false
    ? [initial.form ?? 0] : creationFormCandidates(initial.ruleSpecies);
  const plans = new Map<string, HeldPlan>();
  // Every reachable B-form source is checked before the first PID draw, without filtering the actual creation draw.
  for (const form of forms) {
    const name = form === (initial.form ?? 0) ? input.species : creationBattleNameOf(content, { species: initial.contentId ?? input.species, form });
    const species = name ? own(content.species, name) : undefined;
    if (!name || !species) throw new Error("missing wild creation form");
    if (typeof species.ruleSpecies !== "string" || !species.ruleSpecies) return { status: "unsupported", reason: "rule-family-unavailable" };
    if (species.gender === undefined || (!(typeof species.gender === "number" && [32, 64, 128, 192, 224].includes(species.gender)) && !["M", "F", "N"].includes(String(species.gender)))) throw new TypeError("unsupported target gender rule");
    const held = checkedHeldPlan(species, content, facts, heldLookup);
    if (!held.ok) return { status: "unsupported", reason: held.reason };
    plans.set(name, held.plan);
  }
  const draft = createWildMemberDraft(input, content, random, facts.registration);
  const createdSpecies = draft.speciesData(), held = plans.get(draft.trace().species);
  if (!held) throw Error("wild creation form was not preflighted");
  const lead = facts.party.find(member => !member.isEgg);
  const improved = lead !== undefined && (identity(lead.ability) === "COMPOUNDEYES" || facts.moreAbilities && identity(lead.ability) === "SUPERLUCK");
  const item = selectHeldItem(held, improved, random);
  draft.rerollShiny(wildShinyRetries(facts, random), random);
  const overrides = wildLeadOverrides(createdSpecies.gender!, facts.party, facts.moreAbilities, facts.roamer, random);
  draft.applyLeadOverrides(overrides.gender, overrides.nature);
  draft.freezeInitialForm(item, input.context ?? {}, facts.registration);
  const species = draft.speciesData();
  const applyLegendaryIVs = facts.legendaryPerfectIVs && species.flags?.some(flag => ["LEGENDARY", "MYTHICAL", "ULTRABEAST"].includes(identity(flag))) === true;
  // The force-shiny hook follows the original A/B registration snapshots, then the L→Q hooks.
  if (facts.forceShiny === true) draft.setShiny(true);
  const enhancedIVs = applyLegendaryIVs ? legendaryIVs(draft.trace().ivs, random) : null;
  const level = facts.scaleWildLevels ? scaledWildLevel(facts.party.map(member => member.level), random) : input.level;
  // Materialization resolves remaining caches and preserves B-creation moves through A-only changes.
  const member = draft.materialize();
  if (enhancedIVs !== null) member.ivs = enhancedIVs;
  const nature = overrides.nature ?? member.nature;
  if (enhancedIVs !== null || facts.scaleWildLevels || overrides.nature !== null) {
    const stats = computeStats(species.base, member.ivs ?? {}, member.evs ?? {}, level, nature);
    member.hp = stats.hp;
  }
  if (facts.scaleWildLevels) {
    member.level = level;
    member.exp = minExp(species.growth, level);
    member.moves = initialMoves(species, level, content).map(move => ({ ...move, ppUps: 0 }));
  }
  member.nature = nature;
  member.gender = overrides.gender ?? member.gender;
  member.item = item;
  const registrations = draft.registrationIntents();
  return { status: "created", member, ...(registrations.length ? { registrations } : {}) };
}

/** Prevalidated given-member entry. No factory, normalization, lead/held/scaling stage, or RNG dependency. */
export function copyProvidedWildMember(member: Readonly<Member>): Member {
  return clonePersistentMember(member);
}
