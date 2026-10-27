import { badgeCount, changeMoney, moneyCap } from "./economy";
import { DEFAULT_LIMITS } from "./limits";
/**
 * Defeat settlement (decision D3): a lost or drawn battle costs money and fully heals the party.
 *   money  WP42 §6.1 / WP24 §4.4: highest level of the player's own party x the badge factor (8, 16, 24, 36, 48, 64, 80,
 *          100, 120 for 0..8+ badges), never more than the balance; nothing when NO_MONEY_LOSS is on.
 *          The explicit wallet write then clamps to the content's money cap, including trusted old high balances.
 *   heal   WP61 §7.2 step 2 (blackout) and WP42 §7.1 (a battle the player may lose heals the party too).
 * The application applies it together with the battle result, in the same state replacement; the trip home is a host
 * action after that commit. Pure.
 */
import { healParty } from "./heal";
import type { BattleResult, GameState } from "./state";
import type { Content } from "./types";

export const BADGE_FACTORS: readonly number[] = [8, 16, 24, 36, 48, 64, 80, 100, 120];

export interface DefeatOptions {
  badges?: number;
  noMoneyLoss?: boolean;
  moneyLimit?: number;
}

/** A result the host numbers 4: lost (the engine's winner is not the player) or drawn. */
export function isDefeat(result: Pick<BattleResult, "outcome">): boolean {
  const { kind, winner } = result.outcome;
  return (kind === "win" && winner !== "Player") || kind === "tie";
}

export function defeatMoneyLoss(state: Pick<GameState, "party" | "money"> & {badges?:boolean[]}, { badges = badgeCount(state.badges ?? []), noMoneyLoss = false }: DefeatOptions = {}): number {
  if (noMoneyLoss || !state.party.length) return 0;
  const top = Math.max(...state.party.map((m) => m.level));
  const factor = BADGE_FACTORS[Math.min(Math.max(badges, 0), BADGE_FACTORS.length - 1)]!;
  return Math.min(state.money, top * factor);
}

export function settleDefeat(state: GameState, content: Content, options: DefeatOptions = {}): { state: GameState; moneyLost: number } {
  const moneyLost = defeatMoneyLoss(state, options);
  const healed = healParty(state, content);
  if (!options.noMoneyLoss && state.party.length) healed.money = changeMoney(state.money, -moneyLost, moneyCap(content, options.moneyLimit ?? DEFAULT_LIMITS.money));
  return { state: healed, moneyLost: state.money - healed.money };
}
