/** Internal logical requests, not an audio player or a battle authority. */
export type BattleAudioEntry = 'wild-battle' | 'wild-victory' | 'wild-capture' |
  'trainer-battle' | 'trainer-victory' | 'trainer-type-battle';
type Name = string | null | undefined;
export interface TrainerAudioFields { readonly battleBgm?: Name; readonly victoryBgm?: Name; }
export interface BattleAudioMetadata {
  readonly wildBattle?: Name; readonly wildVictory?: Name; readonly wildCapture?: Name;
  readonly trainerBattle?: Name; readonly trainerVictory?: Name;
}
export interface BattleAudioContext {
  /** Already normalized, valid nonempty logical requests. Raw audio objects are a later adapter's concern. */
  readonly presets?: { readonly battle?: Name; readonly victory?: Name; readonly capture?: Name } | null;
  /** Missing map metadata, not a promise that a missing map object is a valid host. */
  readonly map?: BattleAudioMetadata | null;
  readonly global: BattleAudioMetadata;
}
export type BattleAudioInput =
  | { readonly entry: 'wild-battle' | 'wild-victory' | 'wild-capture'; readonly context: BattleAudioContext }
  | { readonly entry: 'trainer-battle' | 'trainer-victory'; readonly context: BattleAudioContext; readonly trainers: readonly TrainerAudioFields[] }
  | { readonly entry: 'trainer-type-battle'; readonly context: BattleAudioContext; readonly trainer: TrainerAudioFields };
export interface BattleAudioSelection {
  version: 'battle-audio-selection-v1'; entry: BattleAudioEntry;
  slot: 'battle' | 'victory' | 'capture'; logicalName: string;
  origin: 'preset' | 'trainer' | 'trainer-type' | 'map' | 'global' | 'default';
  trainerIndex: number | null;
}

const definitions = {
  'wild-battle': { slot: 'battle', field: 'wildBattle', fallback: 'Battle wild' },
  'wild-victory': { slot: 'victory', field: 'wildVictory', fallback: 'Battle victory' },
  'wild-capture': { slot: 'capture', field: 'wildCapture', fallback: 'Battle capture success' },
  'trainer-battle': { slot: 'battle', field: 'trainerBattle', fallback: 'Battle trainer' },
  'trainer-victory': { slot: 'victory', field: 'trainerVictory', fallback: 'Battle victory' },
  'trainer-type-battle': { slot: 'battle', field: 'trainerBattle', fallback: 'Battle trainer' },
} as const;
const record = (value: unknown, label: string): void => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid battle audio ' + label);
};
const name = (value: unknown, label: string): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error('invalid battle audio ' + label);
  return value; // Empty is significant; whitespace is not silently trimmed.
};

/** WP24 §5.4 / WP67-A §3.7. No reads of a lower source after a winner;
 * no preset consumption, filesystem, player state, clock or SDK dependency. */
export function selectBattleAudio(input: BattleAudioInput): BattleAudioSelection {
  record(input, 'input');
  const entry = input.entry;
  if (typeof entry !== 'string' || !Object.prototype.hasOwnProperty.call(definitions, entry)) throw new Error('invalid battle audio entry');
  const rule = definitions[entry], context = input.context;
  record(context, 'context');
  const result = (logicalName: string, origin: BattleAudioSelection['origin'], trainerIndex: number | null = null): BattleAudioSelection =>
    ({ version: 'battle-audio-selection-v1', entry, slot: rule.slot, logicalName, origin, trainerIndex });
  const presets = context.presets;
  if (presets !== null && presets !== undefined) {
    record(presets, 'presets');
    const preset = name(presets[rule.slot], 'preset');
    if (preset !== null) {
      if (preset.length === 0) throw new Error('invalid battle audio normalized preset');
      return result(preset, 'preset');
    }
  }
  if (entry === 'trainer-type-battle') {
    record(input.trainer, 'trainer type');
    const candidate = name(input.trainer.battleBgm, 'trainer type field');
    if (candidate !== null) return result(candidate, 'trainer-type'); // FromType keeps a stored empty request.
  } else if (entry === 'trainer-battle' || entry === 'trainer-victory') {
    const trainers = input.trainers;
    if (!Array.isArray(trainers)) throw new Error('invalid battle audio trainer list');
    const field = entry === 'trainer-battle' ? 'battleBgm' : 'victoryBgm';
    let candidate: string | null = null, index: number | null = null;
    for (let i = 0; i < trainers.length; i++) {
      const trainer = trainers[i]; record(trainer, 'trainer');
      const value = name(trainer[field], 'trainer field');
      if (value !== null) { candidate = value; index = i; }
    }
    if (candidate !== null && candidate.length > 0) return result(candidate, 'trainer', index);
  }
  const map = context.map;
  if (map !== null && map !== undefined) {
    record(map, 'map metadata');
    const candidate = name(map[rule.field], 'map field');
    if (candidate !== null && candidate.length > 0) return result(candidate, 'map');
  }
  const globalMetadata = context.global; record(globalMetadata, 'global metadata');
  const candidate = name(globalMetadata[rule.field], 'global field');
  return candidate !== null && candidate.length > 0 ? result(candidate, 'global') : result(rule.fallback, 'default');
}
