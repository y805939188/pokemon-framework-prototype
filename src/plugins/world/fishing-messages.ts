/** Read-only fishing presentation. A message never changes a business outcome or grants recovery. */
import { defaultTranslator } from '../../framework/i18n';
import { hostRecord, invoke } from './host-access';

export type FishingMessageKey = 'cannotUseHere' | 'unavailable' | 'bite' | 'caught' | 'escaped' | 'noBite';
export function fishingMessage(rootValue: unknown, key: FishingMessageKey): string {
  const flow = hostRecord(hostRecord(rootValue)?.PSFlow);
  const translator: unknown = flow && typeof flow.translator === 'function' ? invoke(flow, 'translator') : defaultTranslator();
  const text = invoke(translator, 't', ['world.fishing.' + key]);
  if (typeof text !== 'string') throw Error('fishing-message-translation-invalid');
  return text;
}
function data(value: unknown, key: string): unknown {
  const record = hostRecord(value), descriptor = record && Object.getOwnPropertyDescriptor(record, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}
/** Only the actual fishing child's unstarted qualification refusal has ordinary terminal UI.
 * A same-named reason on a different action, failed cleanup or stale reply does not qualify. */
export function ordinaryFishingRefusal(outcome: unknown): boolean {
  const reason = data(outcome, 'reason'), fishing = data(outcome, 'fishing'), prefix = data(fishing, 'prefix');
  return data(outcome, 'status') === 'refused' && (reason === 'not-fishable' || reason === 'exit-blocked')
    && data(fishing, 'status') === 'refused' && data(fishing, 'reason') === reason && data(fishing, 'cleanup') === 'not-started'
    && data(prefix, 'countCommitted') === false && data(prefix, 'battlesCommitted') === false;
}
/** Shape check only: callers must also bind the result to their genuine issued App request,
 * same current native source/generation, idle App and authoritative unavailable recovery query. */
export function completedFishingPresentationFailure(outcome: unknown): boolean {
  const fishing = data(outcome, 'fishing'), prefix = data(fishing, 'prefix'), completion = data(fishing, 'completion'), type = data(completion, 'encounterType');
  const absent = (value: unknown, key: string): boolean => {
    const record = hostRecord(value), descriptor = record && Object.getOwnPropertyDescriptor(record, key);
    return !!record && (!descriptor || 'value' in descriptor && descriptor.value === undefined);
  };
  if (![outcome, fishing, prefix, completion].every(value => value !== null && typeof value === 'object' && !Array.isArray(value))) return false;
  return data(outcome, 'status') === 'failed' && data(outcome, 'reason') === 'host-failed' && absent(outcome, 'admission')
    && data(fishing, 'status') === 'failed' && data(fishing, 'reason') === 'host-failed' && data(fishing, 'cleanup') === 'completed'
    && data(prefix, 'countCommitted') === true && data(prefix, 'battlesCommitted') === false && absent(fishing, 'encounter')
    && data(completion, 'status') === 'interrupted' && data(completion, 'caught') === false
    && data(completion, 'reason') === 'host-failed' && data(completion, 'cleanupFailed') === false
    && typeof type === 'string' && ['OldRod', 'GoodRod', 'SuperRod'].includes(type);
}
