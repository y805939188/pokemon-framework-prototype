/** Private shared reception identity. GameApplication remains its sole queue/token owner. */
import type { BattleCommitOptions } from "../rules/state";
import type { BattleOutcome, ClaimOutcome, GiftOutcome } from "./ports";
import type { Member } from "../rules/types";

export interface ReceptionContext extends BattleCommitOptions {
  token: string;
  generation: number;
  rawHash?: string;
  recovered?: boolean;
}

export interface ReceptionPending {
  context: ReceptionContext;
  grantId?: string;
  members: Member[];
  resume: () => BattleOutcome | ClaimOutcome | GiftOutcome | { status: string };
}
