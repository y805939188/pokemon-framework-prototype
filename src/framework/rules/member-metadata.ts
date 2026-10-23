/** Persistent-only move/stat metadata. The frozen result remains an unmodified v1 record. */
import type { Content, Member, MoveSlot } from './types.ts';
export const computedNature = (member: Member): string => member.statNature ?? member.nature;
export function baseMovePp(content: Content, id: string): number | undefined {
  return Object.values(content.moves ?? {}).find(move => move.id === id)?.pp;
}
export const totalPp = (base: number, ppUps: number): number => Math.floor(base * (5 + ppUps) / 5);
export function mergeBattleMoves(previous: readonly MoveSlot[], incoming: readonly MoveSlot[], content?: Content): MoveSlot[] {
  const unused = previous.map((move, i) => ({ move, i })), used = new Set<number>();
  return incoming.map(move => {
    const match = unused.find(entry => !used.has(entry.i) && entry.move.id === move.id);
    if (match) used.add(match.i);
    const base = content ? baseMovePp(content, move.id) : undefined;
    const ppUps = match?.move.ppUps ?? 0;
    const expected = base === undefined ? match?.move.maxpp : totalPp(base, ppUps);
    if (expected === undefined || move.maxpp !== expected) throw new Error(`ambiguous-move-pp: ${move.id}`);
    return { id: move.id, pp: move.pp, maxpp: move.maxpp, ppUps };
  });
}
