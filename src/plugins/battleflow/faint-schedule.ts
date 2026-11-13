/** Internal, I/O-free projection of WP67-A §9.3 / WP15 §6.4.
 * Observations must be stable for this call. Only the prefix up to the first
 * resolved/pending/failed candidate is read; no media decoding or playback here.
 */
export type FaintCrySlot = 'dedicatedForm' | 'dedicatedBase' | 'ordinaryForm' | 'ordinaryBase';
export type FaintCryObservation =
  | { state: 'missing' }
  | { state: 'resolved'; assetId: string; fileSeconds: number }
  | { state: 'pending' }
  | { state: 'failed'; reason: string };
export interface FaintScheduleInput {
  candidates: Readonly<Record<FaintCrySlot, FaintCryObservation>>;
  battleEffects: boolean;
}
export interface FaintSchedule {
  version: 'faint-schedule-v1';
  cry: null | {
    slot: FaintCrySlot; assetId: string; pitchPercent: 100 | 75; requestAtUnits: 0;
    rawFileSeconds: number; normalizedFileSeconds: number; estimatedPlayedSeconds: number;
  };
  dataBoxStartUnits: 0;
  bodyDropStartUnits: number;
  shadowHideUnits: number;
  faintEffect: { logicalName: 'Pkmn faint'; atUnits: number };
  completion: 'all-tracks-stopped-then-next-scene-update';
}
export type FaintScheduleResult =
  | { state: 'ready'; plan: FaintSchedule }
  | { state: 'pending'; slot: FaintCrySlot }
  | { state: 'failed'; slot: FaintCrySlot | null;
      code: 'invalid-input' | 'invalid-observation' | 'resource-failed' | 'unsafe-duration'; detail?: string };

const slots: readonly FaintCrySlot[] = ['dedicatedForm', 'dedicatedBase', 'ordinaryForm', 'ordinaryBase'];
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const own = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

/** Values are detached. `d` is a start offset in 1/20 s, never total blocking time.
 * Mandatory faint/data-box scheduling is identical for both effects settings.
 * Invalid or unresolved higher-priority observations never fall through as missing.
 */
export function planFaintSchedule(input: unknown): FaintScheduleResult {
  if (!record(input) || !own(input, 'battleEffects') || typeof input.battleEffects !== 'boolean'
    || !own(input, 'candidates') || !record(input.candidates)) {
    return { state: 'failed', slot: null, code: 'invalid-input' };
  }
  const candidates = input.candidates;
  let cry: FaintSchedule['cry'] = null, delay = 12;
  for (const slot of slots) {
    if (!own(candidates, slot)) return { state: 'failed', slot, code: 'invalid-observation' };
    const observation = candidates[slot];
    if (!record(observation) || !own(observation, 'state')) return { state: 'failed', slot, code: 'invalid-observation' };
    if (observation.state === 'missing') continue;
    if (observation.state === 'pending') return { state: 'pending', slot };
    if (observation.state === 'failed') {
      if (!own(observation, 'reason') || typeof observation.reason !== 'string') return { state: 'failed', slot, code: 'invalid-observation' };
      return { state: 'failed', slot, code: 'resource-failed', detail: observation.reason };
    }
    if (observation.state !== 'resolved' || !own(observation, 'assetId') || typeof observation.assetId !== 'string'
      || !observation.assetId.trim() || !own(observation, 'fileSeconds') || typeof observation.fileSeconds !== 'number'
      || !Number.isFinite(observation.fileSeconds)) return { state: 'failed', slot, code: 'invalid-observation' };
    const raw = observation.fileSeconds, seconds = Math.max(0, raw);
    const pitch = slot === 'dedicatedForm' || slot === 'dedicatedBase' ? 100 : 75;
    const played = seconds / (pitch / 100);
    delay = Math.ceil(20 * seconds / (pitch / 100)) + 2;
    // The later millisecond adapter must also be able to represent this offset.
    if (!Number.isFinite(played) || !Number.isSafeInteger(delay) || !Number.isSafeInteger(delay * 50)) {
      return { state: 'failed', slot, code: 'unsafe-duration' };
    }
    cry = { slot, assetId: observation.assetId, pitchPercent: pitch, requestAtUnits: 0,
      rawFileSeconds: raw, normalizedFileSeconds: seconds, estimatedPlayedSeconds: played };
    break;
  }
  return { state: 'ready', plan: { version: 'faint-schedule-v1', cry, dataBoxStartUnits: 0,
    bodyDropStartUnits: delay, shadowHideUnits: delay, faintEffect: { logicalName: 'Pkmn faint', atUnits: delay },
    completion: 'all-tracks-stopped-then-next-scene-update' } };
}
