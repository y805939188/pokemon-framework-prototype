/** Player-visible F text uses the same locale selection as the existing field UI. */
import { defaultTranslator } from '../../framework/i18n';
import { hostRecord, invoke } from './host-access';
export type BlackoutMessageKey = 'incapable' | 'blackedOut' | 'center' | 'home' | 'missingHome';
export function blackoutMessage(root: unknown, key: BlackoutMessageKey): string {
  const flow = hostRecord(hostRecord(root)?.PSFlow);
  const translator: unknown = flow && typeof flow.translator === 'function' ? invoke(flow, 'translator') : defaultTranslator();
  const text = invoke(translator, 't', ['world.blackout.' + key]);
  if (typeof text !== 'string') throw Error('blackout-message-translation-invalid');
  return text;
}
