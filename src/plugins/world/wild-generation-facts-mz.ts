/** Read only native own switch data. A valid sparse unset slot is off; a missing source is unavailable. */
import type { WorldFact } from '../../framework/rules/world-data';
export function readWildShinySwitchMZ(root: object, switchId: number, isProxy: (value: unknown) => boolean): WorldFact<boolean> {
  if (!Number.isSafeInteger(switchId) || switchId < 0) return { status: 'invalid', reason: 'wild-shiny-switch-id-invalid' };
  if (switchId === 0) return { status: 'value', value: false };
  const record = (value: unknown): value is object => value !== null && typeof value === 'object' && !isProxy(value);
  if (!record(root)) return { status: 'invalid', reason: 'wild-shiny-root-invalid' };
  const switches = Object.getOwnPropertyDescriptor(root, '$gameSwitches');
  if (!switches) return { status: 'unavailable', reason: 'wild-shiny-switches-unavailable' };
  if (!('value' in switches) || !record(switches.value)) return { status: 'invalid', reason: 'wild-shiny-switches-invalid' };
  const data = Object.getOwnPropertyDescriptor(switches.value, '_data');
  if (!data) return { status: 'unavailable', reason: 'wild-shiny-switch-data-unavailable' };
  if (!('value' in data) || !record(data.value) || !Array.isArray(data.value)) return { status: 'invalid', reason: 'wild-shiny-switch-data-invalid' };
  const slot = Object.getOwnPropertyDescriptor(data.value, String(switchId));
  if (!slot) return { status: 'value', value: false };
  if (!('value' in slot)) return { status: 'invalid', reason: 'wild-shiny-switch-slot-invalid' };
  if (slot.value === null || slot.value === undefined) return { status: 'value', value: false };
  return typeof slot.value === 'boolean' ? { status: 'value', value: slot.value } : { status: 'invalid', reason: 'wild-shiny-switch-slot-invalid' };
}
