/** One narrow source fact for the existing WP36 wild-created hook; no persistent state or hook registry. */
import type { WildGenerationHostPort } from './ports';
export function wildCreationSwitch(port: WildGenerationHostPort | undefined, switchId: number): boolean {
  if (!Number.isSafeInteger(switchId) || switchId < 0) throw Error('wild-creation-switch-id-invalid');
  if (switchId === 0) return false;
  const fact: unknown = port?.switchOn(switchId);
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) throw Error('wild-creation-switch-unavailable');
  const status = Object.getOwnPropertyDescriptor(fact, 'status'), value = Object.getOwnPropertyDescriptor(fact, 'value');
  if (!status || !('value' in status) || status.value !== 'value' || !value || !('value' in value) || typeof value.value !== 'boolean') throw Error('wild-creation-switch-unavailable');
  return value.value;
}
