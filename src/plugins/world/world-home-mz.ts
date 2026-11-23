/** One parsed author home source; E3 sees points and F sees complete locations. */
import type { BlackoutConfiguration } from '../../framework/app/blackout-ports';
import type { WorldLocation, WorldPoint } from '../../framework/rules/world-data';

export interface MZHomeConfiguration {
  readonly travel: Readonly<{ characterHome: WorldPoint | null; globalHome: WorldPoint | null }>;
  readonly blackout: Readonly<BlackoutConfiguration>;
  readonly startingOverSwitch: number;
}
const natural = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const intrinsicFunctionSource = Function.prototype.toString;
const intrinsicObjectSource = Reflect.apply(intrinsicFunctionSource, Object, []);
/** Ordinary records from any realm, or direct null-prototype dictionaries. Do not inspect
 * @@toStringTag or call a source's constructor/toString: both could execute unknown getters. */
function parameterRecord(value: unknown, isProxy: (value: unknown) => boolean): value is object {
  if (!value || typeof value !== 'object' || isProxy(value) || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype === null) return true;
  if (typeof prototype !== 'object' || isProxy(prototype) || Object.getPrototypeOf(prototype) !== null) return false;
  const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
  if (!constructor || !('value' in constructor) || typeof constructor.value !== 'function' || isProxy(constructor.value)) return false;
  const ownPrototype = Object.getOwnPropertyDescriptor(constructor.value, 'prototype');
  return !!ownPrototype && 'value' in ownPrototype && ownPrototype.value === prototype &&
    Reflect.apply(intrinsicFunctionSource, constructor.value, []) === intrinsicObjectSource;
}
function ownParameter(parameters: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(parameters, key);
  if (descriptor && !('value' in descriptor)) throw Error('travel-home-parameter-own-data-required');
  return descriptor?.value;
}
function home(raw: unknown): WorldLocation | null {
  if (raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') throw Error('travel-home-json-required');
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('travel-home-invalid');
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  if (keys.length !== 3 && keys.length !== 4 || keys.some(key => typeof key !== 'string' || !['mapId', 'x', 'y', 'direction'].includes(key)) ||
    !['mapId', 'x', 'y'].every(key => Object.hasOwn(descriptors, key)) || keys.some(key => typeof key !== 'string' || !Object.hasOwn(descriptors[key]!, 'value'))) throw Error('travel-home-invalid');
  const mapId: unknown = descriptors.mapId!.value, x: unknown = descriptors.x!.value, y: unknown = descriptors.y!.value;
  // Legacy three-field project parameters predate F. Down (2) is this framework's compatibility policy.
  const direction: unknown = Object.hasOwn(descriptors, 'direction') ? descriptors.direction!.value : 2;
  if (!natural(mapId) || mapId === 0 || !natural(x) || !natural(y) || direction !== 2 && direction !== 4 && direction !== 6 && direction !== 8) throw Error('travel-home-invalid');
  return Object.freeze({ mapId, x, y, direction });
}
function point(location: WorldLocation | null): WorldPoint | null {
  return location ? Object.freeze({ mapId: location.mapId, x: location.x, y: location.y }) : null;
}
function startingOverSwitch(raw: unknown): number {
  if (raw === undefined || raw === '') return 1; // Formal WP02 setting default, independent of home compatibility.
  if (typeof raw !== 'string' && typeof raw !== 'number') throw Error('blackout-starting-over-switch-invalid');
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw Error('blackout-starting-over-switch-invalid');
  return value;
}
export function parseMZHomeConfiguration(parameters: unknown, isProxy: (value: unknown) => boolean): MZHomeConfiguration {
  if (!parameterRecord(parameters, isProxy)) throw Error('travel-home-parameters-unavailable');
  const characterHome = home(ownParameter(parameters, 'CharacterHome')), globalHome = home(ownParameter(parameters, 'GlobalHome'));
  return Object.freeze({
    travel: Object.freeze({ characterHome: point(characterHome), globalHome: point(globalHome) }),
    blackout: Object.freeze({ characterHome, globalHome }),
    startingOverSwitch: startingOverSwitch(ownParameter(parameters, 'StartingOverSwitch')),
  });
}
