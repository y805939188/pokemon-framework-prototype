/** One selected party evolution's complete pure state plan. The application owns installation and learning. */
import { planEvolutionSuccess } from "./evolution-success.ts";
import type { EvolutionLearningIntent } from "./evolution-success.ts";
import type { EvolutionSelection } from "./evolution.ts";
import { itemQuantity, removeItems } from "./inventory.ts";
import { catalogOf, itemOf } from "./item-catalog.ts";
import type { ItemCatalog } from "./item-catalog.ts";
import { DEFAULT_LIMITS } from "./limits.ts";
import type { Limits } from "./limits.ts";
import { allocateMemberId } from "./member-identity.ts";
import { own } from "./own.ts";
import { applyDexPatch, normalizeDexAppearance, planDexRecord } from "./pokedex.ts";
import type { DexAppearance } from "./pokedex.ts";
import { validateGameContent } from "./save-schema.ts";
import { bumpStat } from "./stats.ts";
import { allMembers } from "./storage.ts";
import type { GameState } from "./state.ts";
import type { Content, Member, SpeciesData } from "./types.ts";
import { clone } from "./value.ts";

export interface EvolutionCommitInput {
  readonly state: GameState;
  readonly memberId: string;
  readonly selection: EvolutionSelection;
  readonly content: Content;
  readonly limits?: Limits;
  /** Trusted application-owner role injection, never a player's ball choice. null explicitly means no ordinary ball.
   * A catalog without a battle ID can use this role; a contradictory canonical battle ID is refused. */
  readonly ordinaryBallId?: string | null;
}
export type EvolutionCommitPlan = {
  readonly status: "ready";
  readonly state: GameState;
  readonly learning: EvolutionLearningIntent;
  readonly extraMemberId?: string;
  readonly diagnostics: readonly string[];
} | {
  readonly status: "refused";
  readonly reason: string;
  readonly diagnostics: readonly string[];
};

const formNumber = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 999;
const refused = (reason: string, diagnostics: readonly string[] = []): EvolutionCommitPlan => ({ status: "refused", reason, diagnostics });

/** Unlike the ordinary species lookup, a registration source must have its exact authored form. */
function exactSpecies(content: Content, species: string, form: number): SpeciesData | undefined {
  const name = content.forms ? own(own(content.forms, species), String(form)) : form === 0 ? species : undefined;
  return name === undefined ? undefined : own(content.species, name);
}
function appearanceOf(content: Content, member: Readonly<Member>): DexAppearance | null {
  const form = member.form;
  if (!formNumber(form)) return null;
  const original = exactSpecies(content, member.species, form);
  if (!original) return null;
  const displayForm = original.pokedexForm ?? form;
  if (!formNumber(displayForm) || !exactSpecies(content, member.species, displayForm)) return null;
  const gender = member.gender === "M" ? 0 : member.gender === "F" ? 1 : member.gender === "N" ? 2 : null;
  if (gender === null || typeof member.shiny !== "boolean") return null;
  // F owns the explicit PokedexForm alias, gender normalization and unnamed-display => 0 compatibility rule.
  return normalizeDexAppearance(content, { species: member.species, form, gender, shiny: member.shiny });
}

/** D requires a nonempty inventory identity even for quantity 0. This private zero-stock sentinel never persists. */
const noBall = (): { id: string; quantity: number } => ({ id: "unavailable-ordinary-ball", quantity: 0 });
class CommitRefused extends Error {}
function ordinaryBall(input: EvolutionCommitInput, catalog: ItemCatalog, diagnostics: string[]): { id: string; quantity: number } {
  if (input.ordinaryBallId === null) return noBall();
  let id = input.ordinaryBallId;
  if (id !== undefined) {
    const item = itemOf(catalog, id);
    if (!item || item.battleUse !== "ball" || item.battleId !== undefined && item.battleId !== "pokeball") throw new CommitRefused("invalid-ordinary-ball-role");
  } else {
    const candidates = Object.values(catalog).filter(item => item.battleUse === "ball" && item.battleId === "pokeball");
    if (candidates.length !== 1) {
      diagnostics.push(candidates.length ? "ordinary-ball-role-ambiguous" : "ordinary-ball-role-unavailable");
      return noBall();
    }
    id = candidates[0]!.id;
  }
  return { id, quantity: itemQuantity(input.state.inventory, id, catalog) };
}

/** Revalidates the selected entry against the actual current party member; never reruns selection facts or chains. */
export function planEvolutionCommit(input: EvolutionCommitInput): EvolutionCommitPlan {
  const { state, memberId, selection, content } = input, limits = input.limits ?? DEFAULT_LIMITS;
  const diagnostics: string[] = [];
  try {
    const problems = validateGameContent(state, content);
    if (problems.length) return refused("invalid-current-state", problems.map(problem => `${problem.path}: ${problem.message}`));
    const partyIndex = state.party.findIndex(member => member.id === memberId);
    if (partyIndex < 0) return refused("member-not-in-party");
    const member = state.party[partyIndex]!;
    if (!selection || selection.memberId !== memberId || !selection.entry || !selection.source || !selection.target
      || !formNumber(selection.source.form) || !formNumber(selection.target.form)) return refused("invalid-evolution-selection");
    if (!exactSpecies(content, member.species, member.form!)) return refused("unknown-evolution-source-form");
    if (!exactSpecies(content, selection.target.species, selection.target.form)) return refused("unknown-evolution-target-form");
    if (!Number.isSafeInteger(limits.party) || limits.party < 1 || limits.party > DEFAULT_LIMITS.party) return refused("invalid-party-capacity");
    const catalog = catalogOf(content);
    let ballResources: { id: string; quantity: number } | undefined;
    const success = planEvolutionSuccess({ member, selection, content, resources: {
      partySize: state.party.length,
      partyCapacity: limits.party,
      // Keep D's old-entry post-handler order and space-before-ball short circuit authoritative.
      get pokeBall() { return ballResources ??= ordinaryBall(input, catalog, diagnostics); },
    } });
    if (success.kind !== "ready") return refused(success.reason, [...diagnostics, `${success.kind}:${success.fact}`]);
    diagnostics.push(...success.diagnostics);
    const mainAppearance = appearanceOf(content, success.member);
    if (!mainAppearance) return refused("unknown-evolution-appearance", diagnostics);
    const next = clone(state);
    next.party[partyIndex] = success.member;
    if (!Number.isSafeInteger(next.stats.evolution_count + success.evolutionCount)) return refused("evolution-count-overflow", diagnostics);
    next.stats = bumpStat(next.stats, "evolution_count", success.evolutionCount);
    const primaryDex = planDexRecord(next.dex, { source: "evolution", appearance: mainAppearance });
    if (primaryDex.status !== "ok") return refused("invalid-evolution-dex", [...diagnostics, primaryDex.reason ?? "registration-refused"]);
    next.dex = applyDexPatch(next.dex, primaryDex.patch);
    let extraMemberId: string | undefined;
    if (success.afterAction.kind === "extra-member") {
      const { draft } = success.afterAction;
      // The complete plan owns allocation. The persistent ordinal is never spent by D's earlier draft.
      const allocation = allocateMemberId(next.nextMemberOrdinal, new Set(allMembers(next).map(value => value.id)));
      const extra: Member = { ...draft.member, id: allocation.id };
      const extraAppearance = appearanceOf(content, extra);
      if (!extraAppearance) return refused("unknown-extra-member-appearance", diagnostics);
      const extraDex = planDexRecord(next.dex, { source: "split", appearance: extraAppearance });
      if (extraDex.status !== "ok") return refused("invalid-extra-member-dex", [...diagnostics, extraDex.reason ?? "registration-refused"]);
      next.inventory = removeItems(next.inventory, draft.ballCost.item, draft.ballCost.quantity, catalog);
      next.party.push(extra);
      next.nextMemberOrdinal = allocation.nextMemberOrdinal;
      next.dex = applyDexPatch(next.dex, extraDex.patch);
      extraMemberId = extra.id;
    } else if (success.afterAction.kind === "none" && success.afterAction.extraSkipped) {
      diagnostics.push(`extra-member-skipped:${success.afterAction.extraSkipped}`);
    }
    const nextProblems = validateGameContent(next, content);
    if (nextProblems.length) return refused("invalid-evolved-state", [...diagnostics, ...nextProblems.map(problem => `${problem.path}: ${problem.message}`)]);
    return { status: "ready", state: next, learning: { source: "evolution", moves: [...success.learning.moves] },
      ...(extraMemberId === undefined ? {} : { extraMemberId }), diagnostics };
  } catch (error) {
    return refused(error instanceof CommitRefused ? error.message : "evolution-plan-failed", [...diagnostics, error instanceof Error ? error.message : String(error)]);
  }
}
