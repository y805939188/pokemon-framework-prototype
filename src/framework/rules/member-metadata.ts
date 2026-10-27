/** Persistent-only move/stat metadata. The frozen result remains an unmodified v1 record. */
import type { Content, Member, MoveSlot } from './types';
import { clone } from './value';

/** Copy a persistent individual without deriving, rerolling or normalizing any metadata. */
export function clonePersistentMember<T extends Member>(member: T): T { return clone(member); }

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
    let ppUps = match?.move.ppUps ?? 0;
    // A move may be forgotten and learned again under the same ID in one battle. Its base cap
    // identifies a fresh record; other cap changes cannot be inferred from the frozen v1 result.
    if (base !== undefined && move.maxpp === base && totalPp(base, ppUps) !== base) ppUps = 0;
    const expected = base === undefined ? match?.move.maxpp : totalPp(base, ppUps);
    if (expected === undefined || move.maxpp !== expected) throw new Error(`ambiguous-move-pp: ${move.id}`);
    return { id: move.id, pp: move.pp, maxpp: move.maxpp, ppUps };
  });
}
