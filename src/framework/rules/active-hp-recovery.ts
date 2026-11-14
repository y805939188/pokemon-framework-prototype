/** Active HP effects shared by field use, the turn executor and trainer estimates. Held triggers are separate. */
import type { ItemCatalog, ItemDefinition } from './item-catalog';
import { fieldEffectProblem } from './item-families';
import { HEAL_ITEMS, healAmount } from './rules';

export type HpRecovery = { amount: number } | { fraction: number } | { full: true };
export type ActiveHpRecovery = Readonly<Record<string, HpRecovery>>;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

/** Copies and validates the optional snapshot-owned override table; absence is the legacy fixed-table contract. */
export function captureActiveHpRecovery(value: unknown): ActiveHpRecovery | undefined {
  if (value === undefined) return undefined;
  if (!record(value)) throw new Error('invalid active HP recovery profile');
  const out: Record<string, HpRecovery> = {};
  for (const [id, spec] of Object.entries(value)) {
    if (!Object.hasOwn(HEAL_ITEMS, id) || !record(spec) || Object.keys(spec).length !== 1) throw new Error('invalid active HP recovery entry');
    if (Object.hasOwn(spec, 'amount') && positive(spec.amount)) out[id] = { amount: spec.amount };
    else if (Object.hasOwn(spec, 'fraction') && positive(spec.fraction)) out[id] = { fraction: spec.fraction };
    else if (Object.hasOwn(spec, 'full') && spec.full === true) out[id] = { full: true };
    else throw new Error('invalid active HP recovery amount');
  }
  return out;
}

export function authoredHpRecovery(effect: NonNullable<ItemDefinition['effect']>, rebalanced: boolean): HpRecovery {
  if (effect.family !== 'hp' || fieldEffectProblem(effect)) throw new Error('invalid active HP recovery effect');
  const p = effect.parameters;
  if (p.full === true) return { full: true };
  if (positive(p.fraction)) return { fraction: p.fraction };
  const amount = rebalanced ? p.amount : p.oldAmount ?? p.amount;
  if (!positive(amount)) throw new Error('invalid active HP recovery amount');
  return { amount };
}

export function battleHpRecovery(id: string, rebalanced: boolean, overrides?: ActiveHpRecovery): HpRecovery | undefined {
  if (!Object.hasOwn(HEAL_ITEMS, id)) return undefined;
  if (overrides && Object.hasOwn(overrides, id)) return overrides[id];
  const amount = healAmount(HEAL_ITEMS[id]!, rebalanced);
  return amount === 'full' ? { full: true } : amount === 'quarter' ? { fraction: 4 } : { amount };
}

/** Only differing, supported authored HP effects need an engine binding; default snapshots keep their old shape. */
export function activeHpRecovery(catalog: ItemCatalog, rebalanced: boolean): ActiveHpRecovery | undefined {
  const overrides: Record<string, HpRecovery> = {};
  for (const item of Object.values(catalog)) {
    const id = item.battleId;
    if (!id || !Object.hasOwn(HEAL_ITEMS, id) || item.battleUse !== 'member' || !item.consumable || item.effect?.family !== 'hp') continue;
    const authored = authoredHpRecovery(item.effect, rebalanced), baseline = battleHpRecovery(id, rebalanced)!;
    if (JSON.stringify(authored) !== JSON.stringify(baseline)) overrides[id] = authored;
  }
  return Object.keys(overrides).length ? overrides : undefined;
}

export function hpRecoveryRequest(spec: HpRecovery, pokemon: { maxhp: number; hp: number }): number {
  return 'full' in spec ? pokemon.maxhp - pokemon.hp : 'fraction' in spec ? Math.floor(pokemon.maxhp / spec.fraction) : spec.amount;
}
export function hpRecoveryEstimate(spec: HpRecovery): number {
  // WP51 sentinel estimates deliberately differ from actual fraction/full requests.
  return 'full' in spec ? 999 : 'fraction' in spec ? 1 : spec.amount;
}
