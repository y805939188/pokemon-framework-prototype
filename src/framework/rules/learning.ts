/** WP30 §6.3 / approved 5.3 r3 §6.1. Relearning candidates only; no teaching transaction or record updates. */
import type { Member, MoveSlot } from "./types.ts";

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
