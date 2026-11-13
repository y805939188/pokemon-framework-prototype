/** Explicit testing entry; reading a journal grants no application/source authority. */
export { gatewaySettlementFacts, gatewaySettlementLineage } from "../battle/gateway";
import { registerSettlementFactory } from "../app/settlement-source";
import type { BattleHandle, BattleSessionFactory } from "../app/ports";
import type { HeldBinding } from "../rules/held-facts";
/** Synthetic source/fault control only. This is not exported by production or a way for JSON to grant authority. */
export function requiredFactoryProbe<S extends BattleHandle>(original: BattleSessionFactory<S>, collect: (handle: S, binding: HeldBinding) => unknown): BattleSessionFactory<S> {
  const factory: BattleSessionFactory<S> = { create: (...args) => original.create(...args), evidence: (handle, binding) => original.evidence?.(handle, binding) ?? null,
    effects: (handle, binding) => original.effects?.(handle, binding) ?? null };
  registerSettlementFactory(factory, "required", collect);
  return factory;
}
