/**
 * Stage capacities of the persistent game (step 4). These are CONFIGURATION, not claims about the reference:
 *   party       6       WP25 §3.1 (party capacity, a configuration value)
 *   boxes       1200    the boxes are one flat list in this build; 1200 = the spec's default content configuration of
 *                       40 boxes x 30 slots (WP25 §3.1). There is no per-box layout and no box UI yet.
 *   bagPerItem  999     the bag keeps ONE count per item; 999 is the spec's per-slot cap (WP27). The spec also lets one
 *                       item span several slots of unlimited pockets, so this build is stricter for a single item above
 *                       999 (recorded as a stage limitation).
 *   money       999999  WP24 (later writes are clamped to 0..999999).
 * Existing values above configurable caps are preserved. Exception: migration to the fixed 40×30 structure refuses
 * more than 1200 boxed members without changing the original (5.1 T1).
 */
import { boxedMembers } from "./storage.ts";
import type { Storage } from "./storage.ts";

export interface Limits {
  party: number;
  boxes: number;
  bagPerItem: number;
  money: number;
}

export const DEFAULT_LIMITS: Readonly<Limits> = Object.freeze({ party: 6, boxes: 1200, bagPerItem: 999, money: 999999 });

/** Room for more members: party first, then the boxes (WP38 §6 normal storage). */
export function freeMemberSlots(state: { party: unknown[]; storage: Storage }, limits: Limits = DEFAULT_LIMITS): { party: number; boxes: number } {
  return { party: Math.max(0, limits.party - state.party.length), boxes: Math.max(0, limits.boxes - boxedMembers(state).length) };
}

/** WP38 §2 ①: a ball may only be thrown while a caught member has somewhere to go. */
export function storageFull(state: { party: unknown[]; storage: Storage }, limits: Limits = DEFAULT_LIMITS): boolean {
  const free = freeMemberSlots(state, limits);
  return free.party === 0 && free.boxes === 0;
}
