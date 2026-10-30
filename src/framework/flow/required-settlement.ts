/** Required source channel, separate from frozen v1 results and optional V2 observations. */
import { gatewaySettlementFacts, gatewaySettlementLineage } from "../battle/gateway";
import type { BattleDriver, DriverCheckpoint } from "../battle/driver";
import type { HeldBinding, RequiredFacts } from "../rules/held-facts";
import { clone, resultHash } from "../rules/state";
import type { BattleResult } from "../rules/state";

interface Sealed { facts?: RequiredFacts; error?: string }
interface Channel {
  lineage: object; binding: Omit<HeldBinding, "rawHash">;
  restore: (token: DriverCheckpoint) => Promise<BattleDriver>; sealed: Sealed;
}
const CHANNELS = new WeakMap<object, Channel>();
const CHECKPOINTS = new WeakMap<DriverCheckpoint, { session: object; sealed: Sealed }>();
export function bindRequiredSettlement(session: object, driver: BattleDriver, binding: Omit<HeldBinding, "rawHash">, restore: (token: DriverCheckpoint) => Promise<BattleDriver>): void {
  const lineage = gatewaySettlementLineage(driver);
  if (!lineage || CHANNELS.has(session)) throw new Error("required-settlement-driver-unavailable");
  CHANNELS.set(session, { lineage, binding: { ...binding }, restore, sealed: {} });
}
export function finalizeRequiredSettlement(session: object, driver: BattleDriver, result: BattleResult): void {
  const channel = CHANNELS.get(session); if (!channel) return;
  if (channel.sealed.facts || channel.sealed.error) return;
  try {
    if (result.battleId !== channel.binding.battleId) throw new Error("required-settlement-result-identity-mismatch");
    channel.sealed = { facts: gatewaySettlementFacts(driver, channel.lineage, { ...channel.binding, rawHash: resultHash(result) }) };
  } catch (error) { channel.sealed = { error: error instanceof Error ? error.message : "required-settlement-finalize-failed" }; }
}
/** Capture copies the actual current item into the existing v1 member field; this does not add a protocol field. */
export function requiredCaptureItem(session: object, driver: BattleDriver, id: string): string | undefined {
  const channel = CHANNELS.get(session); if (!channel) return undefined;
  const facts = gatewaySettlementFacts(driver, channel.lineage, { ...channel.binding, rawHash: "0".repeat(64) });
  const member = facts.members.find(m => m.side === "p2" && m.id === id);
  if (!member) throw new Error("required-capture-object-binding-missing");
  return member.current;
}
export function sealRequiredSettlement(session: object, binding: HeldBinding): RequiredFacts {
  const channel = CHANNELS.get(session), facts = channel?.sealed.facts;
  if (!facts || facts.binding.battleId !== binding.battleId || facts.binding.generation !== binding.generation
    || facts.binding.rawHash !== binding.rawHash || facts.binding.contentIdentity !== binding.contentIdentity) throw new Error(channel?.sealed.error ?? "required-settlement-not-sealed-or-binding-mismatch");
  return clone(facts);
}
export function checkpointRequiredSettlement(session: object, token: DriverCheckpoint): void {
  const channel = CHANNELS.get(session); if (channel) CHECKPOINTS.set(token, { session, sealed: clone(channel.sealed) });
}
export async function restoreRequiredSettlement(session: object, token: DriverCheckpoint, fallback: () => Promise<BattleDriver>): Promise<BattleDriver> {
  const channel = CHANNELS.get(session);
  if (!channel) return fallback();
  const checkpoint = CHECKPOINTS.get(token);
  if (!checkpoint || checkpoint.session !== session) throw new Error("required-settlement-checkpoint-owner-mismatch");
  const driver = await channel.restore(token);
  if (gatewaySettlementLineage(driver) !== channel.lineage) throw new Error("required-settlement-checkpoint-source-changed");
  channel.sealed = clone(checkpoint.sealed);
  return driver;
}
