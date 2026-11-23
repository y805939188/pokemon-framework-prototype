/** Old 357 field adaptation. These data projections never authorize a battle admission. */
import { initialFieldMZ } from '../rules/initial-field';
import type { InitialField } from '../rules/initial-field';
import { parseWorldFieldChoices, projectWorldBattleContext } from '../rules/world-battle-context';
import type { WorldFieldChoices, WorldBattleProjectionInput, CapturedWorldBallFacts } from '../rules/world-battle-context';
import type { WorldFact } from '../rules/world-data';

export const LEGACY_BATTLE_ARGUMENTS = Object.freeze(['kind', 'foes', 'battleId', 'resultVariable', 'canLose', 'canSwitch',
  'battleStyle', 'expGain', 'battleEffects', 'noRun', 'noBall', 'forceParty', 'defaultWeather', 'defaultTerrain', 'battleEnvironment',
  'battleBackground', 'battlePlatform', 'battleTime', 'prebattleLocation', 'trainerId', 'id', 'version', 'moneyGain'] as const);
export type LegacyBattleArgument = typeof LEGACY_BATTLE_ARGUMENTS[number];
export type LegacyBattleScalar = string | number | boolean | null | undefined;
export type LegacyBattleArgs = Readonly<Partial<Record<LegacyBattleArgument, LegacyBattleScalar>>>;
function scalar(value: unknown): value is LegacyBattleScalar {
  return value === undefined || value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}
function ownScalars<K extends string>(raw: unknown, keys: readonly K[]): Readonly<Partial<Record<K, LegacyBattleScalar>>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('legacy battle arguments must be an object');
  const result: Partial<Record<K, LegacyBattleScalar>> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor) { if (key in raw) throw Error('legacy battle argument must be own data: ' + key); continue; }
    if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw Error('legacy battle argument must be own data: ' + key);
    const value: unknown = descriptor.value;
    if (!scalar(value)) throw Error('legacy battle argument must be primitive: ' + key);
    Object.defineProperty(result, key, { value, enumerable: true });
  }
  return Object.freeze(result);
}
/** Snapshot every field consumed by either old command before any world latch or async opening. */
export function snapshotLegacyBattleArgs(raw: unknown): LegacyBattleArgs { return ownScalars(raw, LEGACY_BATTLE_ARGUMENTS); }
/** Reuse the one finite core parser; blank remains none for this old command family. */
export function readLegacyBattleChoices(raw: unknown): WorldFieldChoices {
  const fields = ownScalars(raw, ['weather', 'terrain', 'environment']);
  return parseWorldFieldChoices(fields.weather, fields.terrain, fields.environment, 'none');
}
export function legacyBattleChoices(args: LegacyBattleArgs): WorldFieldChoices {
  return parseWorldFieldChoices(args.defaultWeather, args.defaultTerrain, args.battleEnvironment, 'none');
}
export function legacyBattleNeedsWorld(choices: WorldFieldChoices): boolean {
  return choices.weather === 'inherit' || choices.terrain === 'inherit' || choices.environment === 'inherit';
}
export interface LegacyBattleFields {
  readonly initialField: InitialField | undefined;
  /** Only an actual App-issued inherited latch has source membership; a clone is data, never permission. */
  readonly capture?: CapturedWorldBallFacts;
}
export interface LegacyBattleFieldLatch extends LegacyBattleFields { readonly capture: CapturedWorldBallFacts }
export interface LegacyBattleFieldApplication {
  latchLegacyBattleFields(choices: WorldFieldChoices): WorldFact<LegacyBattleFieldLatch>;
  isLegacyBattleFieldCurrent(latch: unknown): boolean;
}
/** The explicit branch never observes world, including irrelevant missing/throwing world inputs. */
export function resolveLegacyBattleFields(choices: WorldFieldChoices,
  world?: Omit<WorldBattleProjectionInput, 'choices' | 'source'>): WorldFact<LegacyBattleFields> {
  const accepted = readLegacyBattleChoices(choices);
  if (!legacyBattleNeedsWorld(accepted)) return { status: 'value', value: Object.freeze({
    initialField: initialFieldMZ(accepted.weather, accepted.terrain, accepted.environment) }) };
  if (!world) return { status: 'unavailable', reason: 'legacy world field unavailable' };
  const resolved = projectWorldBattleContext({ ...world, source: 'event', choices: accepted });
  return resolved.status === 'value' ? { status: 'value', value: Object.freeze({ initialField: resolved.value.initialField, capture: resolved.value.capture }) } : resolved;
}
