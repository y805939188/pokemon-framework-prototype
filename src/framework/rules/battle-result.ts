/** Frozen v1 value/type contract, independent of persistent-state planning and validation. */
import type { Member } from "./types.ts";

export const PROTOCOL_VERSION = 1;
export const MEMBER_WRITE_SET = ["level", "exp", "hp", "status", "statusCount", "moves", "evs", "friendship"] as const;
export type WriteKey = (typeof MEMBER_WRITE_SET)[number];
export type MemberPatch = Partial<Pick<Member, WriteKey>>;

export interface Dex { seen: string[]; owned: string[] }
export interface BattleOutcome { kind: string; winner: string | null; target?: string; ball?: string }
export interface BattleResult {
  protocol: number;
  battleId: string;
  outcome: BattleOutcome;
  members: Record<string, MemberPatch>;
  bag: Record<string, number>;
  captured: Member[];
  dex: Dex;
  money?: number;
}
