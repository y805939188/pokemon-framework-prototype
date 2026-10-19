/** Public move-request semantics of the pinned simulator (not its internal move slots). */
export interface RequestedMove {
  pp?: number;
  disabled?: boolean | string;
}

/** Locked moves, Recharge and Struggle omit PP; their presence in the request is the permission to act. */
export function isSelectableMove(move: RequestedMove): boolean {
  return !move.disabled && (move.pp === undefined || move.pp > 0);
}
