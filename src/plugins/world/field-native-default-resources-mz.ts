/** Pure resource DTOs. The build/package checks the declared files; the existing leaf plays them. */
import type { WorldFact } from '../../framework/rules/world-data';
import type { FieldMoveSound } from './field-move-host';
import type { DefaultFieldSound, FieldDefaultSoundOptions, FieldDefaultSounds } from './field-native-default-resource-ports';

export const DEFAULT_FIELD_SOUND_FILES = Object.freeze(['audio/se/Slash1.ogg', 'audio/se/Crash.ogg', 'audio/se/Push.ogg']);
const defaults: Readonly<Record<DefaultFieldSound, FieldMoveSound>> = Object.freeze({
  cut: Object.freeze({ name: 'Slash1', volume: 90, pitch: 100, pan: 0 }),
  'rock-smash': Object.freeze({ name: 'Crash', volume: 90, pitch: 100, pan: 0 }),
  'strength-push': Object.freeze({ name: 'Push', volume: 90, pitch: 100, pan: 0 }),
});
const why = (error: unknown): string => error instanceof Error ? error.message : String(error);
export function createDefaultFieldSoundsMZ(options: FieldDefaultSoundOptions): FieldDefaultSounds {
  const isProxy = options.isProxy;
  if (typeof isProxy !== 'function') throw Error('field-sound-proxy-capability-unavailable');
  const object = (value: unknown): value is object => value !== null && typeof value === 'object' && !isProxy(value);
  const plain = (value: unknown): value is Record<string, unknown> => object(value) && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Reflect.ownKeys(value).every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return typeof key === 'string' && !!descriptor && descriptor.enumerable && 'value' in descriptor;
    });
  const validName = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && !/[\u0000-\u001f\\:]/u.test(value)
    && !value.startsWith('/') && value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
  const numeric = (value: unknown, minimum: number, maximum: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
  const sounds = new Map<DefaultFieldSound, FieldMoveSound>(), available = new Set<string>();
  let configurationFailure: string | null = null;
  try {
    const assets = options.availableSounds ?? ['Slash1', 'Crash', 'Push'];
    if (!object(assets) || !Array.isArray(assets) || assets.length > 10000 || Reflect.ownKeys(assets).some(key => {
      const descriptor = Object.getOwnPropertyDescriptor(assets, key);
      return typeof key !== 'string' || key !== 'length' && !/^(0|[1-9]\d*)$/u.test(key) || !descriptor || !('value' in descriptor);
    })) throw Error('field-sound-asset-manifest-invalid');
    for (let index = 0; index < assets.length; index++) {
      const name: unknown = Object.getOwnPropertyDescriptor(assets, String(index))?.value;
      if (!validName(name)) throw Error('field-sound-asset-manifest-invalid');
      available.add(name);
    }
    const input = options.sounds;
    if (input !== undefined && (!plain(input) || Object.keys(input).some(key => !Object.hasOwn(defaults, key)))) throw Error('field-sound-configuration-invalid');
    for (const kind of Object.keys(defaults) as DefaultFieldSound[]) {
      const resource: unknown = input === undefined || !Object.hasOwn(input, kind) ? defaults[kind] : input[kind];
      if (!plain(resource) || Object.keys(resource).sort().join(',') !== 'name,pan,pitch,volume' || !validName(resource.name)
        || !numeric(resource.volume, 0, 100) || !numeric(resource.pitch, 50, 150) || !numeric(resource.pan, -100, 100)) throw Error(`field-sound-invalid:${kind}`);
      sounds.set(kind, Object.freeze({ name: resource.name, volume: resource.volume, pitch: resource.pitch, pan: resource.pan }));
    }
  } catch (error) { configurationFailure = why(error); }
  return Object.freeze({ sound(kind: DefaultFieldSound): WorldFact<FieldMoveSound> {
    if (configurationFailure) return { status: 'invalid', reason: configurationFailure };
    const sound = sounds.get(kind);
    if (!sound) return { status: 'invalid', reason: 'field-sound-kind-invalid' };
    return available.has(sound.name) ? { status: 'value', value: { ...sound } } : { status: 'unavailable', reason: `field-sound-asset-not-in-manifest:${sound.name}` };
  } });
}
