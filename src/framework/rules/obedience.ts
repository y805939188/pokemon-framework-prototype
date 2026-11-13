/** WP40 obedience eligibility. Engine execution and RNG live in custom-formats; this core module has no engine dependency. */
import { isForeign } from "./member-identity";
import type { Owner } from "./types";

export interface ObedienceContext {
  /** Authoritative persistent player owner, never a UI-reported owner. */
  player: Owner;
  /** Authoritative persistent owner for every p1 member, keyed by stable member id (wild and foreign-trade included). */
  members: Record<string, Owner>;
  badges: number;
  anyHighLevel: boolean;
  foreignHighLevel: boolean;
  generation: number;
  contentIdentity: string;
}

export interface ObedienceEligibilityInput {
  level: number;
  owner: Owner;
  player: Owner;
  badges: number;
  anyHighLevel: boolean;
  foreignHighLevel: boolean;
  nonMove?: boolean;
  continuing?: boolean;
  locked?: boolean;
}

export function obedienceLevelLimit(badges: number): number {
  if (!Number.isSafeInteger(badges) || badges < 0) throw new Error("invalid obedience badge count");
  return badges >= 8 ? Number.MAX_SAFE_INTEGER : 10 * (badges + 1);
}

/** False means zero obedience RNG draws. Foreign comparison is exactly owner id + name (WP18 §7.2). */
export function obedienceEligible(input: ObedienceEligibilityInput): boolean {
  if (input.nonMove || input.continuing || input.locked) return false;
  if (!Number.isSafeInteger(input.level) || input.level < 1) throw new Error("invalid obedience level");
  const limit = obedienceLevelLimit(input.badges);
  if (input.level <= limit) return false;
  const configured = input.anyHighLevel || (input.foreignHighLevel && isForeign(input.owner, input.player));
  return configured;
}
