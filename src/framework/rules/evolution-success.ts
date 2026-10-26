/** WP31 successful evolution write set. Caller installs resources, statistics and dex atomically. */
import { evolutionMethod } from "./evolution-data.ts";
import { clearEvolutionReadiness } from "./evolution-readiness.ts";
import { computeStats, hpAfterRecalc, levelForExp } from "./growth.ts";
import { resolveAbility } from "./member-identity.ts";
import { clonePersistentMember, computedNature } from "./member-metadata.ts";
import { speciesDataOf } from "./species-key.ts";
import type { EvolutionBlocked, EvolutionSelection } from "./evolution.ts";
import type { Content, Member, SpeciesData, SpeciesKey } from "./types.ts";

export interface EvolutionExtraResources {
  readonly partySize: number;
  readonly partyCapacity: number;
  /** Inventory identity is resolved by E; this must identify the ordinary Poke Ball. */
  readonly pokeBall: { readonly id: string; readonly quantity: number };
}
export interface EvolutionLearningIntent { readonly source: "evolution"; readonly moves: readonly string[] }
/** Deliberately has no entity ID or nextMemberOrdinal. E allocates them only at installation. */
export interface EvolutionExtraDraft { readonly member: Omit<Member, "id">; readonly ballCost: { readonly item: string; readonly quantity: 1 }; readonly entryIndex: number }
export type EvolutionAfterAction = { readonly kind: "none"; readonly extraSkipped?: "party-full" | "no-poke-ball" }
  | { readonly kind: "consume-held-item"; readonly item: string; readonly entryIndex: number }
  | { readonly kind: "extra-member"; readonly draft: EvolutionExtraDraft };
export interface EvolutionSuccessInput {
  readonly member: Readonly<Member>;
  readonly content: Content;
  readonly selection: EvolutionSelection;
  readonly resources?: EvolutionExtraResources;
}
export type EvolutionSuccessPlan = EvolutionBlocked | {
  readonly kind: "ready";
  readonly member: Member;
  readonly learning: EvolutionLearningIntent;
  readonly afterAction: EvolutionAfterAction;
  readonly evolutionCount: 1;
  readonly diagnostics: readonly string[];
};
const identity = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const invalid = (fact: string, reason: string): EvolutionBlocked => ({ kind: "invalid", fact, reason });
const unsigned = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
type AbilityResult = EvolutionBlocked | { readonly ability: string; readonly abilityIndex: number | null; readonly effectiveAbilityIndex: number | null };
function transferAbility(member: Readonly<Member>, previous: SpeciesData, target: SpeciesData, content: Content, diagnostics: string[]): AbilityResult {
  const pid = member.personalID;
  if (!unsigned(pid) || pid > 0xffffffff) return invalid("personalID", "invalid-personal-id");
  let slot = member.abilityIndex;
  if (slot === null || slot === undefined) {
    const candidates = [
      ...(previous.abilities ?? []).map((ability, index) => ({ ability, index })),
      ...(previous.hiddenAbilities ?? []).map((ability, index) => ({ ability, index: index + 2 })),
    ].filter(candidate => candidate.ability && identity(candidate.ability) === identity(member.ability));
    if (candidates.length) {
      slot = Math.min(...candidates.map(candidate => candidate.index));
      if (candidates.length > 1) diagnostics.push(`ambiguous-ability-slot:using-${slot}`);
    } else {
      const targetSlots = [...(target.abilities ?? []), ...(target.hiddenAbilities ?? [])];
      const known = Object.values(content.abilities ?? {}).some(ability => identity(ability.id) === identity(member.ability) || identity(ability.name) === identity(member.ability))
        || targetSlots.some(ability => ability && identity(ability) === identity(member.ability))
        || (member.ability === "" && targetSlots.every(ability => !ability));
      if (!known) return invalid("ability", "unknown-trusted-ability-override");
      diagnostics.push("trusted-ability-override-retained");
      return { ability: member.ability, abilityIndex: null, effectiveAbilityIndex: null };
    }
  }
  if (!unsigned(slot)) return invalid("abilityIndex", "invalid-requested-ability-slot");
  return resolveAbility(pid, target, slot);
}
type BodyResult = EvolutionBlocked | { readonly member: Member; readonly data: SpeciesData };
function evolvedBody(member: Readonly<Member>, target: SpeciesKey, content: Content, diagnostics: string[]): BodyResult {
  const old = speciesDataOf(content, member), next = speciesDataOf(content, target);
  if (!old || !next) return invalid("species", "unknown-evolution-species");
  if (!unsigned(member.exp)) return invalid("exp", "invalid-evolution-exp");
  const ability = transferAbility(member, old, next, content, diagnostics);
  if ("kind" in ability) return ability;
  const level = levelForExp(next.growth, member.exp);
  const oldStats = computeStats(old.base, member.ivs, member.evs, member.level, computedNature(member));
  const newStats = computeStats(next.base, member.ivs, member.evs, level, computedNature(member));
  const gender = typeof next.gender === "string" ? next.gender : member.gender;
  const out: Member = { ...clearEvolutionReadiness(clonePersistentMember(member)), ...target, ...ability, gender, level,
    hp: hpAfterRecalc(member.hp, oldStats.hp, newStats.hp) };
  return { member: out, data: next };
}

/** Uses the selected target without rereading weather/time. Only current post-action resources are read. */
export function planEvolutionSuccess(input: EvolutionSuccessInput): EvolutionSuccessPlan {
  const { member, selection, content } = input;
  if (member.id !== selection.memberId || member.species !== selection.source.species || (member.form ?? 0) !== selection.source.form) return invalid("selection", "stale-source-member");
  if (!unsigned(selection.target.form) || selection.target.form > 999 || selection.target.species !== selection.entry.target) return invalid("selection", "invalid-selected-target");
  const old = speciesDataOf(content, member);
  const entries = old?.evolutions ?? [];
  const entry = entries[selection.entryIndex];
  if (!entry || entry.target !== selection.entry.target || entry.form !== selection.entry.form || entry.method !== selection.entry.method || entry.parameter !== selection.entry.parameter
    || !evolutionMethod(entry.method)?.families.includes(selection.family)) return invalid("selection", "stale-selected-entry");
  const diagnostics: string[] = [];
  const body = evolvedBody(member, selection.target, content, diagnostics);
  if ("kind" in body) return body;
  let afterAction: EvolutionAfterAction = { kind: "none" };
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
    const afterEntry = entries[entryIndex]!;
    const action = evolutionMethod(afterEntry.method)?.after;
    // This scan deliberately does not rerun time/gender/friend conditions. The post-handler has its own predicate.
    if (action === "target-match-held-item-consume" && afterEntry.target === selection.target.species && identity(member.item) === identity(String(afterEntry.parameter))) {
      afterAction = { kind: "consume-held-item", item: member.item, entryIndex };
      body.member.item = "";
      break;
    }
    if (action !== "extra-member-copy") continue;
    const resources = input.resources;
    if (!resources) return { kind: "context-unavailable", fact: "resources", reason: "extra-member-resources-not-supplied", entryIndex };
    if (!unsigned(resources.partySize) || !unsigned(resources.partyCapacity) || resources.partyCapacity === 0) return invalid("resources", "invalid-party-capacity");
    if (resources.partySize >= resources.partyCapacity) { afterAction = { kind: "none", extraSkipped: "party-full" }; continue; }
    if (!resources.pokeBall || !resources.pokeBall.id || !unsigned(resources.pokeBall.quantity)) return invalid("resources", "invalid-poke-ball-inventory");
    if (resources.pokeBall.quantity === 0) { afterAction = { kind: "none", extraSkipped: "no-poke-ball" }; continue; }
    const extraTarget = speciesDataOf(content, { species: afterEntry.target, form: afterEntry.form ?? 0 });
    if (!extraTarget) return invalid("extra-member", "unknown-extra-target");
    const extraKey = { species: afterEntry.target, form: extraTarget.defaultForm ?? (afterEntry.form || extraTarget.form || member.form || 0) };
    const extra = evolvedBody(member, extraKey, content, diagnostics);
    if ("kind" in extra) return extra;
    const healed = extra.member;
    healed.nickname = null;
    healed.markings = [];
    healed.ribbons = [];
    healed.item = "";
    healed.ball = resources.pokeBall.id;
    healed.status = "";
    healed.statusCount = 0;
    healed.hp = computeStats(extra.data.base, healed.ivs, healed.evs, healed.level, computedNature(healed)).hp;
    healed.moves = healed.moves.map(move => ({ ...move, pp: move.maxpp }));
    const { id: _oldEntityId, ...draft } = healed;
    afterAction = { kind: "extra-member", draft: { member: draft, entryIndex, ballCost: { item: resources.pokeBall.id, quantity: 1 } } };
    break;
  }
  return { kind: "ready", member: body.member, afterAction, evolutionCount: 1, diagnostics,
    learning: { source: "evolution", moves: [...(body.data.learnset[0] ?? []), ...(body.data.learnset[body.member.level] ?? [])] } };
}

/** Animation input ordering belongs to G; this pure decision preserves each selected entry's cancellation policy. */
export function decideEvolutionCompletion(selection: EvolutionSelection, decision: "complete" | "cancel" | "technical-terminate"):
  { readonly kind: "success" | "continue" | "cancelled" | "technically-terminated"; readonly cancellationCount: 0 | 1 } {
  if (decision === "technical-terminate") return { kind: "technically-terminated", cancellationCount: 0 };
  if (decision === "complete") return { kind: "success", cancellationCount: 0 };
  return selection.cancellable ? { kind: "cancelled", cancellationCount: 1 } : { kind: "continue", cancellationCount: 0 };
}
