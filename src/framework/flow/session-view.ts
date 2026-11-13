/** Host-free battle control port. The engine implementation is checked against it, while hosts import no loader/Node API. */
import type { BattleDriver, GatewayMessage } from '../battle/driver';
import type { BattleRequest } from '../battle/request';
import type { SessionMessage } from '../battle/protocol';
import type { BattleResult } from '../rules/state';
import type { Content, Member } from '../rules/types';
import type { itemEligibility } from '../rules/rules';
export type BattleRefusal = { ok: false; reason: string };
export type BattleActionResult = { ok: true; messages: SessionMessage[] } | { ok: true; staged: true } | BattleRefusal;
export interface BattleSessionView {
  readonly canSwitch: boolean; readonly expGain: boolean; readonly captureExpGain: boolean;
  content: Content; battleId: string; party: Member[]; foeTeam: Member[]; bag: Record<string, number>;
  foe: { kind: 'wild' | 'trainer'; team: Member[]; noRun?: boolean; noBall?: boolean };
  gw: BattleDriver; finished: boolean; ended: Extract<GatewayMessage, { kind: 'end' }> | null;
  pendingLearn: { memberId: string; move: { id: string; name: string; pp: number } } | null;
  currentRequest(): BattleRequest | null | undefined;
  take(): SessionMessage[];
  chooseMove(index: number): Promise<BattleActionResult>;
  chooseSwitch(memberId: string): Promise<BattleActionResult>;
  chooseForcedSwitch(memberId: string): Promise<BattleActionResult>;
  useItem(itemId: string, targetId: string, options?: { commit?: boolean; moveSlot?: number }): Promise<BattleActionResult>;
  canUseItem(itemId: string, targetId: unknown, moveSlot?: number): ReturnType<typeof itemEligibility>;
  throwBall(ballId: string): Promise<BattleActionResult>;
  run(options?: { duringReplacement?: boolean }): Promise<BattleActionResult>;
  cancel(): Promise<void>;
  decideLearn(slot: number | null | undefined): Promise<SessionMessage[]>;
  result(): BattleResult;
}
