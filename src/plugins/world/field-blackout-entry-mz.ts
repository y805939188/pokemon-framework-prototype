/** Fresh field blackout presentation. This leaf never settles, writes a CP or grants App authority. */
import type { TravelEffectResult } from '../../framework/app/world-travel-operation';
import type { BlackoutPresentationApplication } from './blackout-presentation-ports';
import { blackoutMessage } from './blackout-messages';
import { hostRecord } from './host-access';

interface Options {
  readonly root: Record<string, unknown>;
  application(): (BlackoutPresentationApplication & { isBlackoutEntering(owner: object): boolean }) | null;
  capture(owner: object): () => void;
  message(text: string, owner: object): Promise<TravelEffectResult>;
  nextFrame(guard: () => void): Promise<void>;
  isProxy(value: unknown): boolean;
  copy(value: unknown): unknown;
}
type Method = (this: unknown, ...args: unknown[]) => unknown;
interface Epoch { serial: number; readonly methods: Map<string, Method> }
interface AudioLease { readonly value: unknown; readonly current: unknown; readonly epoch: Epoch; readonly serial: number }
interface Entry {
  readonly owner: object; readonly app: BlackoutPresentationApplication; readonly generation: number;
  readonly screen: Record<string, unknown>; readonly audio: Record<string, unknown>;
  readonly promise: Promise<TravelEffectResult>;
  screenEpoch?: Epoch; screenSerial?: number; bgm?: AudioLease; bgs?: AudioLease; closed: boolean;
}
const done: TravelEffectResult = Object.freeze({ status: 'done' });
const fail = (error: unknown): TravelEffectResult => ({ status: 'failed', reason: error instanceof Error ? error.message : String(error) });
const field = (record: object, key: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !('value' in descriptor)) throw Error('blackout-field-own-data-required:' + key);
  return descriptor.value;
};
const frames = 24;
export function createFieldBlackoutEntryMZ(options: Options): {
  enterField(owner: object): Promise<TravelEffectResult>; leaveField(owner: object, reason?: 'timeline-replaced'): TravelEffectResult;
} {
  const {root} = options;
  const entries = new WeakMap<object, Entry>();
  const epochs = new WeakMap<object, Map<string, Epoch>>();
  let latest: Entry | null = null;
  const dataMethod = (receiver: object, name: string): Method => {
    for (let holder: object | null = receiver; holder; holder = Object.getPrototypeOf(holder) as object | null) {
      if (options.isProxy(holder)) throw Error('blackout-field-proxy');
      const descriptor = Object.getOwnPropertyDescriptor(holder, name);
      if (descriptor) {
        if (!('value' in descriptor) || typeof descriptor.value !== 'function' || options.isProxy(descriptor.value)) throw Error('blackout-field-method-unavailable:' + name);
        return descriptor.value as Method;
      }
    }
    throw Error('blackout-field-method-unavailable:' + name);
  };
  const invoke = (receiver: object, name: string, args: readonly unknown[] = []): unknown => Reflect.apply(dataMethod(receiver, name), receiver, args);
  const currentEpoch = (receiver: object, epoch: Epoch): boolean => {
    try { return [...epoch.methods].every(([name, method]) => dataMethod(receiver, name) === method); }
    catch { return false; } // A new accessor/proxy hook is not this old presentation's intent.
  };
  // Native fade/play requests have their own intent epoch. Cleanup cannot undo a
  // later event/plugin fade or audio request just because its data happens to match.
  const epochFor = (receiver: Record<string, unknown>, group: string, names: readonly string[]): Epoch => {
    let groups = epochs.get(receiver); if (!groups) { groups = new Map(); epochs.set(receiver, groups); }
    let epoch = groups.get(group);
    if (epoch && currentEpoch(receiver, epoch)) return epoch;
    epoch = { serial: 0, methods: new Map() }; const selected = epoch;
    for (const name of names) {
      const original = dataMethod(receiver, name);
      const wrapper: Method = function(this: unknown, ...args: unknown[]): unknown { if (this === receiver) selected.serial++; return Reflect.apply(original, this, args); };
      Object.defineProperty(receiver, name, { configurable: true, writable: true, enumerable: false,
        value: wrapper });
      selected.methods.set(name, wrapper);
    }
    groups.set(group, epoch); return epoch;
  };
  const valid = (entry: Entry, replacing = false): boolean => latest === entry && !entry.closed && options.application() === entry.app
    && (replacing || entry.app.stateGeneration === entry.generation) && field(root, '$gameScreen') === entry.screen && field(root, 'AudioManager') === entry.audio;
  const checked = (result: TravelEffectResult): void => { if (result.status !== 'done') throw Error(result.reason); };
  const leaveField = (owner: object, reason?: 'timeline-replaced'): TravelEffectResult => {
    const entry = entries.get(owner); if (!entry || entry.closed) return done;
    try {
      // Only the synchronous real App invalidation may retire an old timeline's
      // still-matching native intent. Every asynchronous continuation uses strict generation.
      const replacing = reason === 'timeline-replaced';
      if (!valid(entry, replacing)) { entry.closed = true; return done; }
      if (entry.screenEpoch && currentEpoch(entry.screen, entry.screenEpoch) && entry.screenEpoch.serial === entry.screenSerial) {
        invoke(entry.screen, 'startFadeIn', [frames]);
      }
      for (const channel of ['bgm', 'bgs'] as const) {
        if (!valid(entry, replacing)) break;
        const lease = entry[channel], suffix = channel === 'bgm' ? 'Bgm' : 'Bgs';
        if (lease && currentEpoch(entry.audio, lease.epoch) && lease.epoch.serial === lease.serial && field(entry.audio, '_current' + suffix) === lease.current) {
          try { invoke(entry.audio, 'replay' + suffix, [lease.value]); entry[channel] = undefined; }
          catch (error) { entry[channel] = { ...lease, serial: lease.epoch.serial, current: field(entry.audio, '_current' + suffix) }; throw error; }
        }
      }
      entry.closed = true; return done;
    } catch (error) { return fail(error); }
  };
  return Object.freeze({
    enterField(owner) {
      const previous = entries.get(owner); if (previous) return previous.promise;
      try {
        const app = options.application(), screen = hostRecord(field(root, '$gameScreen')), audio = hostRecord(field(root, 'AudioManager'));
        if (!app || !screen || !audio || options.isProxy(screen) || options.isProxy(audio)) throw Error('blackout-field-native-unavailable');
        const guard = options.capture(owner);
        let entry: Entry;
        const promise = Promise.resolve().then(async (): Promise<TravelEffectResult> => {
          try {
            const current = (): void => { if (!valid(entry) || app.isBlackoutEntering(owner) !== true) throw Error('blackout-field-entry-stale'); guard(); };
            current();
            for (const key of ['incapable', 'blackedOut'] as const) {
              current(); const text = blackoutMessage(root, key); current();
              checked(await options.message(text, owner)); current();
            }
            for (const channel of ['bgm', 'bgs'] as const) {
              const suffix = channel === 'bgm' ? 'Bgm' : 'Bgs'; current();
              const epoch = epochFor(audio, channel, ['play' + suffix, 'replay' + suffix, 'stop' + suffix, 'fadeOut' + suffix]); current();
              const value = options.copy(invoke(audio, 'save' + suffix)); current();
              // Install each partial lease before a reentrant native effect can fail.
              entry[channel] = { value, current: field(audio, '_current' + suffix), epoch, serial: epoch.serial };
              try { invoke(audio, 'fadeOut' + suffix, [frames / 60]); }
              finally { entry[channel] = { value, current: field(audio, '_current' + suffix), epoch, serial: epoch.serial }; }
              current();
            }
            const epoch = epochFor(screen, 'fade', ['startFadeOut', 'startFadeIn']); current();
            entry.screenEpoch = epoch;
            try { invoke(screen, 'startFadeOut', [frames]); }
            finally { entry.screenSerial = epoch.serial; }
            current();
            for (;;) {
              if (epoch.serial !== entry.screenSerial) throw Error('blackout-field-fade-superseded');
              const remaining = field(screen, '_fadeOutDuration');
              if (typeof remaining !== 'number' || !Number.isSafeInteger(remaining) || remaining < 0 || remaining > frames) throw Error('blackout-field-fade-invalid');
              if (remaining === 0) { if (field(screen, '_brightness') !== 0) throw Error('blackout-field-fade-incomplete'); break; }
              await options.nextFrame(current); current();
            }
            return done;
          } catch (error) { return fail(error); }
        });
        entry = { owner, app, generation: app.stateGeneration, screen, audio, promise, closed: false };
        latest = entry; entries.set(owner, entry); return promise;
      } catch (error) { return Promise.resolve(fail(error)); }
    },
    leaveField,
  });
}
