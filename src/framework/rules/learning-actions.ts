/** E3 value composition only. The application owns target identity, locks, final revalidation and installation. */
import { resolveConfig } from "./config.ts";
import { planFriendshipChange } from "./friendship.ts";
import type { FriendshipContext, FriendshipMember, FriendshipPlan } from "./friendship.ts";
import { assertInventoryMapped, inventoryProblems, InventoryRefused, itemQuantity, removeItems } from "./inventory.ts";
import type { Inventory } from "./inventory.ts";
import { catalogOf, consumesItem, itemOf } from "./item-catalog.ts";
import {
  learningCompatibility, planLearningQueue, planMoveForgetting, planRelearning,
} from "./learning.ts";
import type {
  ForgettingPlan, LearningAnswer, LearningEffects, LearningOutcome, LearningPlan, LearningReady,
  LearningRefusal, LearningSource, RelearningAnswer, RelearningPlan, ResolvedLevelMove,
} from "./learning.ts";
import { own } from "./own.ts";
import type { Content, Member, MoveData, SpeciesData } from "./types.ts";
import { clone } from "./value.ts";
import { firstEvolutionPredecessor } from "./evolution-data.ts";
import { memberKey } from "./species-key.ts";

/** Both a real member snapshot and an incoming draft use the same Member value; no party lookup occurs here. */
export type TeachingActionSource = { readonly kind: "generic" | "tutor"; readonly moveId: string }
  | { readonly kind: "machine"; readonly entry: "bag" | "party"; readonly itemId: string; readonly inventory: Inventory };

export interface TeachingActionContext {
  /** Explicit false for the current non-Shadow product scope. */
  readonly shadow: boolean;
  /** The owner supplies the actual source-time map and resolved affection configuration. */
  readonly friendship: FriendshipContext;
  /** Resolved ball/held-item identities and obtained-map facts, using the existing friendship contract. */
  readonly friendshipSource: Omit<FriendshipMember, "friendship">;
}

export type LearningActionRefusal = LearningRefusal | "unknown-species" | "missing-exact-form"
  | "unknown-item" | "not-a-machine" | "move-data-unavailable" | "invalid-inventory"
  | "unmapped-item" | "not-enough-items" | "integer-overflow" | "friendship-out-of-domain";
export type LearningActionRefused = { status: "refused"; reason: LearningActionRefusal };
export interface TeachingActionReady {
  status: "ready";
  /** Complete copy, including every unrelated field. No partial Member is installable. */
  member: Member;
  /** Complete inventory copy for either machine entry, including nonconsuming/give-up results. */
  inventory?: Inventory;
  /** C's explanation: resource/friendship intents are already included above; only statistics remain unapplied deltas. */
  effects: LearningEffects;
  friendshipChanges: Extract<FriendshipPlan, { status: "ready" }>[];
  outcomes: LearningOutcome[];
  answersUsed: number;
}
export type TeachingActionPlan = TeachingActionReady | LearningActionRefused | Extract<LearningPlan, { status: "pending" }>;
export type RelearningActionPlan = TeachingActionReady | LearningActionRefused
  | Extract<RelearningPlan, { status: "pending" | "empty" | "exited" }>;
export type ForgettingActionPlan = Exclude<ForgettingPlan, { status: "ready" }>
  | { status: "ready"; member: Member; forgotten: string };

const refused = (reason: LearningActionRefusal): LearningActionRefused => ({ status: "refused", reason });

/** Exact current form: missing data cannot borrow another form's teaching or reminder eligibility. */
function species(content: Content, member: Readonly<Member>): SpeciesData | LearningActionRefused {
  const form = member.form ?? 0;
  if (content.forms) {
    const forms = own(content.forms, member.species);
    if (!forms) return refused("unknown-species");
    const name = own(forms, String(form));
    return name ? own(content.species, name) ?? refused("unknown-species") : refused("missing-exact-form");
  }
  if (form !== 0) return refused("missing-exact-form");
  return own(content.species, member.species) ?? refused("unknown-species");
}

/** Requested IDs and machine.move are canonical identities, never display-name normalization. */
function moveById(content: Content, id: string): MoveData | undefined {
  return Object.values(content.moves ?? {}).find(move => move.id === id);
}

/** The actual runtime tables store display names; accept exact catalog keys or exact canonical IDs. */
function tableMove(content: Content, ref: string): MoveData | undefined {
  return own(content.moves, ref) ?? moveById(content, ref);
}

function tables(content: Content, data: SpeciesData): { levelMoves: ResolvedLevelMove[]; tutorMoves: string[]; hmMoves: string[] }
  | LearningActionRefused {
  const levelMoves: ResolvedLevelMove[] = [], tutorMoves: string[] = [], hmMoves: string[] = [];
  for (const [level, refs] of Object.entries(data.learnset)) for (const ref of refs) {
    const move = tableMove(content, ref);
    if (!move) return refused("move-data-unavailable");
    levelMoves.push({ level: Number(level), id: move.id });
  }
  for (const ref of data.tutorMoves ?? []) {
    const move = tableMove(content, ref);
    if (!move) return refused("move-data-unavailable");
    tutorMoves.push(move.id);
  }
  for (const item of Object.values(catalogOf(content))) if (item.fieldUse === "hm") {
    const move = item.move ? moveById(content, item.move) : undefined;
    if (!move) return refused("move-data-unavailable");
    if (!hmMoves.includes(move.id)) hmMoves.push(move.id);
  }
  return { levelMoves, tutorMoves, hmMoves };
}

function complete(member: Readonly<Member>, plan: LearningReady): TeachingActionReady {
  return { status: "ready", member: { ...clone(member), ...clone(plan.patch) }, effects: clone(plan.effects),
    friendshipChanges: [], outcomes: clone(plan.outcomes), answersUsed: plan.answersUsed };
}

/** Read only the applicable egg table. Missing data is unavailable; an explicit empty table is known absence. */
function eggCompatibility(member: Readonly<Member>, content: Content, data: SpeciesData):
  { eggMoves: string[] | null; predecessorEggMoves: string[] | null } | LearningActionRefused {
  const read = (source: SpeciesData): string[] | null | LearningActionRefused => {
    if (source.eggMoves === undefined) return null;
    const moves: string[] = [];
    for (const reference of source.eggMoves) {
      const move = tableMove(content, reference); if (!move) return refused("move-data-unavailable");
      moves.push(move.id);
    }
    return moves;
  };
  const eggs = read(data);
  if (eggs !== null && !Array.isArray(eggs)) return eggs;
  if (eggs === null || eggs.length) return { eggMoves: eggs, predecessorEggMoves: null };
  // Only a complete compiled registration order proves that no predecessor exists. Do not invent an order
  // for legacy partial content or use the battle/PID identity in place of the exact persistent form.
  if (!content.registrationOrder) return { eggMoves: eggs, predecessorEggMoves: null };
  const predecessor = firstEvolutionPredecessor(content, memberKey(member));
  if (!predecessor) return { eggMoves: eggs, predecessorEggMoves: [] };
  const previous = species(content, { ...member, species: predecessor.species, form: predecessor.form });
  if ("status" in previous) return previous;
  const inherited = read(previous);
  if (inherited !== null && !Array.isArray(inherited)) return inherited;
  return { eggMoves: eggs, predecessorEggMoves: inherited };
}

/**
 * One teaching attempt. Compatibility uses the exact form's tutor/level tables, then its egg table or the
 * registered predecessor's table when explicitly empty. Missing author data never fabricates absence.
 * Resource removal and friendship are calculated on copies only after C reports an actual learned outcome.
 */
export function planTeachingAction(
  member: Readonly<Member> | null | undefined, content: Content, source: TeachingActionSource,
  context: TeachingActionContext, answers: readonly LearningAnswer[] = [],
): TeachingActionPlan {
  if (!member) return refused("absent-target");
  if (member.isEgg) return refused("egg");
  if (context.shadow) return refused("shadow");
  const data = species(content, member);
  if ("status" in data) return data;
  const resolved = tables(content, data);
  if ("status" in resolved) return resolved;
  const catalog = catalogOf(content);
  let learningSource: LearningSource, move: MoveData | undefined;
  if (source.kind === "machine") {
    if (source.entry !== "bag" && source.entry !== "party") return refused("invalid-source");
    const item = itemOf(catalog, source.itemId);
    if (!item) return refused("unknown-item");
    if (item.fieldUse !== "tm" && item.fieldUse !== "hm" && item.fieldUse !== "tr") return refused("not-a-machine");
    move = item.move ? moveById(content, item.move) : undefined;
    learningSource = { kind: "machine", entry: source.entry, machine: item.fieldUse,
      itemId: item.id, consumable: consumesItem(item) };
    if (inventoryProblems(source.inventory).length) return refused("invalid-inventory");
    try {
      assertInventoryMapped(source.inventory, catalog);
      if (itemQuantity(source.inventory, item.id, catalog) < 1) return refused("not-enough-items");
    } catch (error) {
      if (error instanceof InventoryRefused) return refused(error.reason as LearningActionRefusal);
      throw error;
    }
  } else if (source.kind === "generic" || source.kind === "tutor") {
    move = moveById(content, source.moveId);
    learningSource = { kind: source.kind };
  } else return refused("invalid-source");
  if (!move) return refused("invalid-move");
  const config = resolveConfig(content.settings);
  let eggTables: { eggMoves: string[] | null; predecessorEggMoves: string[] | null } = { eggMoves: null, predecessorEggMoves: null };
  if (!resolved.tutorMoves.includes(move.id) && !resolved.levelMoves.some(entry => entry.id === move.id)) {
    const result = eggCompatibility(member, content, data); if ("status" in result) return result; eggTables = result;
  }
  const compatibility = learningCompatibility(move.id, { moveIds: Object.values(content.moves ?? {}).map(move => move.id),
    tutorMoves: resolved.tutorMoves, levelMoves: resolved.levelMoves, ...eggTables });
  const plan = planLearningQueue(member, [move], learningSource, { shadow: context.shadow, hmMoves: resolved.hmMoves,
    keepMachinePp: config.TAUGHT_MACHINES_KEEP_OLD_PP, compatibility }, answers);
  if (plan.status !== "ready") return plan;
  if (plan.outcomes[0]?.outcome === "already-known") return refused("already-known");
  const next = complete(member, plan);
  if (source.kind === "machine") {
    next.inventory = clone(source.inventory);
    for (let index = 0; index < plan.effects.machineFriendshipChanges; index++) {
      const change = planFriendshipChange({ ...context.friendshipSource, friendship: next.member.friendship }, "machine", context.friendship);
      if (change.status === "refused") return refused("friendship-out-of-domain");
      next.member.friendship = change.after;
      next.friendshipChanges.push(change);
    }
    try {
      for (const item of plan.effects.itemsToConsume) next.inventory = removeItems(next.inventory, item.itemId, item.quantity, catalog);
    } catch (error) {
      if (error instanceof InventoryRefused) return refused(error.reason as LearningActionRefusal);
      throw error;
    }
  }
  return next;
}

/** Three-layer cancellation and nullable/empty candidate semantics come directly from C; no UI is invented. */
export function planRelearningAction(
  member: Readonly<Member> | null | undefined, content: Content, context: { readonly shadow: boolean },
  answers: readonly RelearningAnswer[] = [],
): RelearningActionPlan {
  // Keep C's established absent/egg/Shadow empty-list behavior before consulting species content.
  if (!member || member.isEgg || context.shadow) {
    const empty = planRelearning(member, [], [], {
      shadow: context.shadow, hmMoves: [], keepMachinePp: false, moreMoves: false,
    }, answers);
    return empty.status === "ready" ? refused("invalid-target") : empty;
  }
  const data = species(content, member);
  if ("status" in data) return data;
  const resolved = tables(content, data);
  if ("status" in resolved) return resolved;
  const config = resolveConfig(content.settings);
  const plan = planRelearning(member, resolved.levelMoves, Object.values(content.moves ?? {}), {
    shadow: context.shadow, hmMoves: resolved.hmMoves, keepMachinePp: config.TAUGHT_MACHINES_KEEP_OLD_PP,
    moreMoves: config.MOVE_RELEARNER_CAN_TEACH_MORE_MOVES,
  }, answers);
  return plan.status === "ready" ? complete(member, plan) : plan;
}

/** Independent forgetting deliberately uses C's viewing path, so HM is removable and the last move is protected. */
export function planForgettingAction(member: Readonly<Member> | null | undefined, slot?: number | null): ForgettingActionPlan {
  const plan = planMoveForgetting(member, slot);
  return plan.status === "ready" ? { status: "ready", member: { ...clone(member!), ...clone(plan.patch) }, forgotten: plan.forgotten } : plan;
}
