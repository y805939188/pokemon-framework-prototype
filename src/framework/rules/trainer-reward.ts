/** A-M1 trainer-prize stage only (WP24 §4.4 / WP42 §6.1). No amulet, Happy Hour or Pay Day facts are invented. */
import { changeMoney, moneyCap } from "./economy";
import { DEFAULT_LIMITS } from "./limits";
import type { Limits } from "./limits";
import { safeAdd } from "./inventory";
import { bumpStat } from "./stats";
import { clone } from "./value";
import type { GameState } from "./state";
import type { Content } from "./types";

export interface TrainerPrizeOpponent { baseMoney: number; levels: readonly number[] }
export interface TrainerPrizeResult { nominal: number; before: number; after: number; actual: number; normalizationLoss: number }

export function trainerPrizeBase(opponents: readonly TrainerPrizeOpponent[]): number {
  let total = 0;
  for (const opponent of opponents) {
    if (!Number.isSafeInteger(opponent.baseMoney) || opponent.baseMoney < 0 || !opponent.levels.length) throw new Error("invalid trainer money data");
    let highest = 0;
    for (const level of opponent.levels) {
      if (!Number.isSafeInteger(level) || level < 1 || level > 100) throw new Error("invalid trainer prize level");
      highest = Math.max(highest, level);
    }
    const product = opponent.baseMoney * highest;
    if (!Number.isSafeInteger(product)) throw new Error("trainer prize is not a safe integer");
    total = safeAdd(total, product);
  }
  return total;
}

/** One logical stage in the caller's single candidate next state; this function performs no host replacement. */
export function applyTrainerPrize(state: GameState, opponents: readonly TrainerPrizeOpponent[], content: Content | undefined, limits: Limits = DEFAULT_LIMITS, multiplier = 1): { state: GameState; reward: TrainerPrizeResult } {
  const nominal = trainerPrizeBase(opponents) * multiplier;
  if (![1, 2, 4].includes(multiplier)) throw new Error("invalid battle money multiplier");
  return applyBattleMoneyAmount(state, nominal, content, limits);
}

/** A second independent cap/write stage (Pay Day), composed before the caller's one host installation. */
export function applyBattleMoneyAmount(state: GameState, nominal: number, content: Content | undefined, limits: Limits = DEFAULT_LIMITS): { state: GameState; reward: TrainerPrizeResult } {
  if (!Number.isSafeInteger(nominal) || nominal < 0) throw new Error("invalid battle money amount");
  const before = state.money;
  if (!Number.isSafeInteger(before) || before < 0) throw new Error("invalid-money");
  const after = changeMoney(before, nominal, moneyCap(content, limits.money));
  const actual = Math.max(0, after - before), normalizationLoss = Math.max(0, before - after);
  const next = clone(state);
  next.money = after;
  if (actual > 0) {
    if (!Number.isSafeInteger(next.stats.battle_money_gained + actual)) throw new Error("money statistic is not a safe integer");
    next.stats = bumpStat(next.stats, "battle_money_gained", actual);
  }
  return { state: next, reward: { nominal, before, after, actual, normalizationLoss } };
}
