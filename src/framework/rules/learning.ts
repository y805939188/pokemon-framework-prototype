/** WP20 §5 / WP30 §6 / approved 5.3 r3 §6.1. Pure plans; the caller owns installation and resources. */
import type { Member, MoveSlot } from "./types";

export type RelearningMember = Readonly<Pick<Member, "level" | "isEgg">> & {
  readonly moves: readonly Readonly<Pick<MoveSlot, "id">>[];
  readonly firstMoves?: readonly string[];
};

/**
 * Local adapter for a validated level learnset after content move-name resolution. `id` is the canonical move identity
 * used by Member.moves/firstMoves, not a display name. Entries retain the authoritative table order (including level 0).
 * This is a calculation input, not a new content/save schema or a species-wide egg/tutor directory.
 */
export interface ResolvedLevelMove {
  readonly level: number;
  readonly id: string;
}

export interface RelearningOptions {
  /** Explicit configuration input; no shared config key/default is introduced here. */
  readonly moreMoves: boolean;
  /** Explicit caller fact: the existing Member has no Shadow field. */
  readonly shadow: boolean;
}

/**
 * Valid Member and resolved catalog inputs are owned by existing validation/content boundaries.
 * Empty candidates (including absent members, eggs and Shadow) are ordinary domain results, with no UI side effects.
 */
export function relearningCandidates(
  member: RelearningMember | null | undefined,
  levelMoves: readonly ResolvedLevelMove[],
  options: RelearningOptions,
): string[] {
  if (!member || member.isEgg || options.shadow) return [];

  const known = new Set(member.moves.map(move => move.id));
  const included = new Set<string>();
  const levelCandidates: string[] = [];
  for (const move of levelMoves) {
    if (move.level <= member.level && !known.has(move.id) && !included.has(move.id)) {
      included.add(move.id);
      levelCandidates.push(move.id);
    }
  }
  if (!options.moreMoves) return levelCandidates;

  const firstCandidates: string[] = [];
  for (const id of member.firstMoves ?? []) {
    // A record overlapping a level candidate retains that candidate's level-table position.
    if (!known.has(id) && !included.has(id)) {
      included.add(id);
      firstCandidates.push(id);
    }
  }
  return firstCandidates.concat(levelCandidates);
}

/** Structural input shared by a real member copy and an incoming operation draft. No party lookup or entity allocation. */
export interface LearningMember {
  readonly moves: readonly Readonly<MoveSlot>[];
  readonly firstMoves?: readonly string[];
  readonly isEgg?: boolean;
}

/** Already resolved against the validated move directory, with base PP (before PP Ups). */
export interface LearningMove {
  readonly id: string;
  readonly pp: number;
  readonly name?: string;
}

export type LearningSource = {
  readonly kind: "battle" | "level" | "evolution" | "generic" | "tutor" | "reminder";
} | {
  readonly kind: "machine";
  readonly entry: "bag" | "party";
  readonly machine: "tm" | "hm" | "tr";
  readonly itemId: string;
  /** Catalog consumption property; TM/HM remain nonconsumable regardless of this flag. */
  readonly consumable: boolean;
};

export type LearningCompatibility = "compatible" | "incompatible" | "unavailable";
export interface LearningOptions {
  /** Explicit caller fact: Member deliberately has no Shadow field. */
  readonly shadow: boolean;
  /** Canonical identities from the actual HM catalog or a trusted world port, never inferred from move names. */
  readonly hmMoves: readonly string[];
  readonly keepMachinePp: boolean;
  /** Required for generic/tutor/machine sources; table-driven level/evolution/reminder intents need no second gate. */
  readonly compatibility?: LearningCompatibility;
  readonly debug?: boolean;
}

/** A replayable decision history. A decline without giveUp asks for confirmation at this same answer index. */
export type LearningAnswer = { readonly kind: "replace"; readonly slot: number }
  | { readonly kind: "decline"; readonly giveUp?: boolean };
export type LearningStat = "moves_taught_by_item" | "moves_taught_by_tutor" | "moves_taught_by_reminder";
export interface LearningEffects {
  itemsToConsume: { itemId: string; quantity: number }[];
  statistics: Record<LearningStat, number>;
  /** E resolves each intent through planFriendshipChange against the then-current copy, before installing anything. */
  machineFriendshipChanges: number;
}
export interface LearningPatch {
  moves: MoveSlot[];
  /** Present only when a successful Bag TR adds a new record. Existing order and duplicates are preserved. */
  firstMoves?: string[];
}
export interface LearningOutcome {
  moveId: string;
  outcome: "learned" | "gave-up" | "already-known";
  slot?: number;
  replaced?: string;
}
export interface LearningPending {
  kind: "learn" | "give-up";
  answerIndex: number;
  moveIndex: number;
  move: LearningMove;
  moves: MoveSlot[];
  reason?: "hm-protected" | "declined-give-up";
}
export interface LearningReady {
  status: "ready";
  patch: LearningPatch;
  effects: LearningEffects;
  outcomes: LearningOutcome[];
  answersUsed: number;
}
export type LearningRefusal = "absent-target" | "invalid-target" | "egg" | "shadow" | "already-known"
  | "incompatible" | "compatibility-unavailable" | "invalid-move" | "invalid-source" | "invalid-answer"
  | "unexpected-answer" | "not-a-candidate";
export type LearningRefused = { status: "refused"; reason: LearningRefusal };
export type LearningPlan = LearningReady | LearningRefused | { status: "pending"; selection: LearningPending };

const copyMoves = (moves: readonly Readonly<MoveSlot>[]): MoveSlot[] => moves.map(move => ({ ...move }));
const noEffects = (): LearningEffects => ({ itemsToConsume: [], statistics: {
  moves_taught_by_item: 0, moves_taught_by_tutor: 0, moves_taught_by_reminder: 0,
}, machineFriendshipChanges: 0 });
const refused = (reason: LearningRefusal): LearningRefused => ({ status: "refused", reason });
const validMove = (move: LearningMove): boolean => !!move && typeof move.id === "string" && move.id.length > 0
  && Number.isSafeInteger(move.pp) && move.pp >= 0;

/**
 * Compatibility input is explicit rather than a hidden species query. null marks unavailable egg data;
 * [] is known absence and permits the predecessor fallback. This does not add egg moves to relearning candidates.
 */
export function learningCompatibility(moveId: string, data: {
  readonly moveIds: readonly string[];
  readonly tutorMoves: readonly string[];
  readonly levelMoves: readonly ResolvedLevelMove[];
  readonly eggMoves: readonly string[] | null;
  readonly predecessorEggMoves: readonly string[] | null;
}): LearningCompatibility {
  if (!data.moveIds.includes(moveId)) return "incompatible";
  if (data.tutorMoves.includes(moveId) || data.levelMoves.some(move => move.id === moveId)) return "compatible";
  if (data.eggMoves === null) return "unavailable";
  const eggs = data.eggMoves.length ? data.eggMoves : data.predecessorEggMoves;
  return eggs === null ? "unavailable" : eggs.includes(moveId) ? "compatible" : "incompatible";
}

/** Chronological level order, authoritative table order within each level, including duplicate intents. */
export function levelLearningIntents(oldLevel: number, newLevel: number, levelMoves: readonly ResolvedLevelMove[]):
  { status: "ready"; moves: ResolvedLevelMove[] } | { status: "refused"; reason: "invalid-level" } {
  // Levels are validated at the existing growth boundary; avoid a potentially unbounded loop on a bad adapter input.
  if (!Number.isSafeInteger(oldLevel) || !Number.isSafeInteger(newLevel) || oldLevel < 1 || newLevel < oldLevel || newLevel > 100) return { status: "refused", reason: "invalid-level" };
  const result: ResolvedLevelMove[] = [];
  for (let level = oldLevel + 1; level <= newLevel; level++) {
    for (const move of levelMoves) if (move.level === level) result.push({ level, id: move.id });
  }
  return { status: "ready", moves: result };
}

function sourceProblem(source: LearningSource, options: LearningOptions): LearningRefusal | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) return "invalid-source";
  if (!["battle", "level", "evolution", "generic", "tutor", "reminder", "machine"].includes(source.kind)) return "invalid-source";
  if (source.kind === "machine" && (!['bag', 'party'].includes(source.entry)
    || !['tm', 'hm', 'tr'].includes(source.machine) || typeof source.itemId !== "string" || !source.itemId || typeof source.consumable !== "boolean")) return "invalid-source";
  if (["generic", "tutor", "machine"].includes(source.kind)) {
    if (options.compatibility === "incompatible") return "incompatible";
    if (options.compatibility !== "compatible") return "compatibility-unavailable";
  }
  return null;
}

function validAnswers(answers: readonly LearningAnswer[]): boolean {
  if (!Array.isArray(answers)) return false;
  for (const answer of answers) {
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) return false;
    if (answer.kind === "replace") {
      if (Object.keys(answer).some(key => !["kind", "slot"].includes(key)) || !Number.isSafeInteger(answer.slot) || answer.slot < 0 || answer.slot > 4) return false;
    } else if (answer.kind === "decline") {
      if (Object.keys(answer).some(key => !["kind", "giveUp"].includes(key)) || answer.giveUp !== undefined && typeof answer.giveUp !== "boolean") return false;
    } else return false;
  }
  return true;
}

/**
 * One core for all learning sources. Answers are replayed against a fresh simulated copy; no pending patch is installable.
 * Already-known queue intents are skipped against the moves at that exact point, rather than pre-deduplicated.
 * Giving up skips only this move. There is deliberately no outer item-cancel flag that could bypass later intents.
 */
export function planLearningQueue(
  member: LearningMember | null | undefined,
  moves: readonly LearningMove[],
  source: LearningSource,
  options: LearningOptions,
  answers: readonly LearningAnswer[] = [],
): LearningPlan {
  if (!member) return refused("absent-target");
  if (member.moves.length > 4) return refused("invalid-target");
  if (!source || typeof source !== "object") return refused("invalid-source");
  if (!validAnswers(answers)) return refused("invalid-answer");
  if (source.kind !== "battle" && member.isEgg && !options.debug) return refused("egg");
  if (source.kind !== "battle" && options.shadow) return refused("shadow");
  const problem = sourceProblem(source, options);
  if (problem) return refused(problem);
  if (!moves.every(validMove)) return refused("invalid-move");
  const current = copyMoves(member.moves), effects = noEffects(), outcomes: LearningOutcome[] = [];
  let firstMoves = member.firstMoves ? [...member.firstMoves] : [];
  let recordsChanged = false, answerIndex = 0;
  for (let moveIndex = 0; moveIndex < moves.length; moveIndex++) {
    const move = moves[moveIndex]!;
    if (current.some(slot => slot.id === move.id)) { outcomes.push({ moveId: move.id, outcome: "already-known" }); continue; }
    let slot = current.length, gaveUp = false;
    if (slot === 4) {
      let reason: LearningPending["reason"];
      for (;;) {
        const pending = (kind: LearningPending["kind"]): LearningPlan => ({ status: "pending", selection: {
          kind, answerIndex, moveIndex, move: { ...move }, moves: copyMoves(current), ...(reason ? { reason } : {}),
        } });
        const answer = answers[answerIndex];
        if (!answer) return pending("learn");
        if (answer.kind === "decline") {
          if (answer.giveUp === undefined) return pending("give-up");
          if (typeof answer.giveUp !== "boolean") return refused("invalid-answer");
          answerIndex++;
          if (answer.giveUp) { gaveUp = true; break; }
          reason = "declined-give-up";
        } else if (answer.kind === "replace") {
          if (!Number.isSafeInteger(answer.slot) || answer.slot < 0 || answer.slot > 4) return refused("invalid-answer");
          // The fifth displayed row is the new move; like BACK, it enters the give-up confirmation.
          if (answer.slot === 4) return pending("give-up");
          answerIndex++;
          if (!options.debug && options.hmMoves.includes(current[answer.slot]!.id)) { reason = "hm-protected"; continue; }
          slot = answer.slot;
          break;
        } else return refused("invalid-answer");
      }
    }
    if (gaveUp) { outcomes.push({ moveId: move.id, outcome: "gave-up" }); continue; }
    const previous = current[slot];
    const machineReplacement = source.kind === "machine" && previous !== undefined;
    current[slot] = { id: move.id, pp: machineReplacement && options.keepMachinePp ? Math.min(previous.pp, move.pp) : move.pp, maxpp: move.pp, ppUps: 0 };
    outcomes.push({ moveId: move.id, outcome: "learned", slot, ...(previous ? { replaced: previous.id } : {}) });
    if (source.kind === "machine") {
      if (machineReplacement) effects.machineFriendshipChanges++;
      if (source.machine === "tr" && source.consumable) {
        const item = effects.itemsToConsume.find(item => item.itemId === source.itemId);
        if (item) item.quantity++; else effects.itemsToConsume.push({ itemId: source.itemId, quantity: 1 });
      }
      if (source.entry === "bag") {
        effects.statistics.moves_taught_by_item++;
        if (source.machine === "tr" && !firstMoves.includes(move.id)) { firstMoves.push(move.id); recordsChanged = true; }
      }
    } else if (source.kind === "tutor") effects.statistics.moves_taught_by_tutor++;
    else if (source.kind === "reminder") effects.statistics.moves_taught_by_reminder++;
  }
  if (answers.length !== answerIndex) return refused("unexpected-answer");
  return { status: "ready", patch: { moves: current, ...(recordsChanged ? { firstMoves } : {}) }, effects, outcomes, answersUsed: answerIndex };
}

/** A single teaching attempt reports already-known as refusal, with no resource/statistics plan. */
export function planMoveLearning(
  member: LearningMember | null | undefined, move: LearningMove, source: LearningSource,
  options: LearningOptions, answers: readonly LearningAnswer[] = [],
): LearningPlan {
  const plan = planLearningQueue(member, [move], source, options, answers);
  return plan.status === "ready" && plan.outcomes[0]?.outcome === "already-known" ? refused("already-known") : plan;
}

export type ForgettingPlan = { status: "pending"; moves: MoveSlot[] } | { status: "cancelled" }
  | { status: "refused"; reason: "absent-target" | "invalid-slot" | "last-move" }
  | { status: "ready"; patch: LearningPatch; forgotten: string };

/** Independent viewing/forgetting permits HM, protects the last move, and leaves historical zero-move members readable. */
export function planMoveForgetting(member: LearningMember | null | undefined, slot?: number | null): ForgettingPlan {
  if (!member) return { status: "refused", reason: "absent-target" };
  if (slot === null) return { status: "cancelled" };
  if (slot === undefined) return { status: "pending", moves: copyMoves(member.moves) };
  if (!Number.isSafeInteger(slot) || slot < 0 || slot >= member.moves.length) return { status: "refused", reason: "invalid-slot" };
  if (member.moves.length === 1) return { status: "refused", reason: "last-move" };
  return { status: "ready", patch: { moves: copyMoves(member.moves).filter((_, index) => index !== slot) }, forgotten: member.moves[slot]!.id };
}

export type RelearningAnswer = { readonly kind: "exit"; readonly confirmed?: boolean }
  | { readonly kind: "select"; readonly moveId: string; readonly teach?: boolean; readonly learning?: readonly LearningAnswer[] };
export interface RelearningPending {
  kind: "candidate" | "teach" | "exit" | "learning";
  candidates: string[];
  answerIndex: number;
  moveId?: string;
  learning?: LearningPending;
}
export type RelearningPlan = LearningReady | LearningRefused | { status: "empty" } | { status: "exited" }
  | { status: "pending"; selection: RelearningPending };

/** The three cancellation layers are plain decisions; no UI, owner token, persistent workflow or cost is created. */
export function planRelearning(
  member: (LearningMember & Readonly<Pick<Member, "level">>) | null | undefined,
  levelMoves: readonly ResolvedLevelMove[], catalog: readonly LearningMove[],
  options: LearningOptions & { readonly moreMoves: boolean }, answers: readonly RelearningAnswer[] = [],
): RelearningPlan {
  if (!Array.isArray(answers)) return refused("invalid-answer");
  for (const answer of answers) {
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) return refused("invalid-answer");
    if (answer.kind === "exit") {
      if (Object.keys(answer).some(key => !["kind", "confirmed"].includes(key)) || answer.confirmed !== undefined && typeof answer.confirmed !== "boolean") return refused("invalid-answer");
    } else if (answer.kind === "select") {
      if (Object.keys(answer).some(key => !["kind", "moveId", "teach", "learning"].includes(key)) || typeof answer.moveId !== "string"
        || answer.teach !== undefined && typeof answer.teach !== "boolean" || answer.learning !== undefined && !validAnswers(answer.learning)) return refused("invalid-answer");
      if (answer.teach !== true && answer.learning?.length) return refused("unexpected-answer");
    } else return refused("invalid-answer");
  }
  const candidates = relearningCandidates(member, levelMoves, options);
  if (!candidates.length) return answers.length ? refused("unexpected-answer") : { status: "empty" };
  const pending = (kind: RelearningPending["kind"], answerIndex: number, moveId?: string, learning?: LearningPending): RelearningPlan => ({
    status: "pending", selection: { kind, candidates: [...candidates], answerIndex, ...(moveId ? { moveId } : {}), ...(learning ? { learning } : {}) },
  });
  for (let index = 0; index < answers.length; index++) {
    const answer = answers[index]!;
    if (answer.kind === "exit") {
      if (answer.confirmed === undefined) return pending("exit", index);
      if (answer.confirmed) return index === answers.length - 1 ? { status: "exited" } : refused("unexpected-answer");
    } else if (answer.kind === "select") {
      if (!candidates.includes(answer.moveId)) return refused("not-a-candidate");
      if (answer.teach === undefined) return pending("teach", index, answer.moveId);
      if (!answer.teach) continue;
      const move = catalog.find(move => move.id === answer.moveId);
      if (!move) return refused("invalid-move");
      const plan = planMoveLearning(member, move, { kind: "reminder" }, options, answer.learning);
      if (plan.status === "pending") return pending("learning", index, answer.moveId, plan.selection);
      if (plan.status === "refused") return plan;
      if (plan.outcomes[0]?.outcome === "learned") return index === answers.length - 1 ? plan : refused("unexpected-answer");
      // Inner give-up goes back to candidates. No reminder success or resource effect has been produced.
    } else return refused("invalid-answer");
  }
  return pending("candidate", answers.length);
}
