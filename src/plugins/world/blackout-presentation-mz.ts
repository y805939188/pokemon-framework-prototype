/** WP61 presentation prefixes. The single native installer supplies the real App/source guards. */
import type { WorldBlackoutHost } from '../../framework/app/blackout-ports';
import type { TravelEffectResult, TravelReceipt } from '../../framework/app/world-travel-operation';
import { readBlackoutCheckpoint } from '../../framework/rules/blackout-checkpoint';
import type { BlackoutCheckpoint } from '../../framework/rules/blackout-checkpoint';
import type { BlackoutPresentationOptions } from './blackout-presentation-ports';
import { blackoutMessage } from './blackout-messages';

type Phase = 'announce' | 'prepare' | 'refresh';
type Guard = () => void;
interface Work { readonly key: string; promise: Promise<TravelEffectResult> | null; done: boolean; cursor: number; switches?: object }
interface Entry { readonly key: string; announce?: Work; prepare?: Work }
const done: TravelEffectResult = Object.freeze({ status: 'done' });
const failed = (error: unknown): TravelEffectResult => {
  const message = error instanceof Error ? Object.getOwnPropertyDescriptor(error, 'message')?.value : error;
  return { status: 'failed', reason: typeof message === 'string' ? message : 'blackout-presentation-failed' };
};

export function createBlackoutPresentationMZ(options: BlackoutPresentationOptions):
  Pick<WorldBlackoutHost, 'announce' | 'prepare' | 'requestMapRefresh'> {
  const { root, application, callbacks, isProxy, diagnostic, debug, startingOverSwitch } = options;
  const entries = new WeakMap<object, Entry>();
  const refreshes = new WeakMap<object, WeakMap<object, TravelEffectResult | 'running'>>();
  const capture = (owner: object, phase: Phase, receipt?: TravelReceipt) => {
    const app = application(), generation = app?.stateGeneration;
    if (!app) throw Error('blackout-application-unavailable');
    const local = (): void => {
      if (application() !== app || app.stateGeneration !== generation || app.isBlackoutOwner(owner) !== true ||
        phase === 'prepare' && app.isBlackoutPreparing(owner) !== true || application() !== app || app.stateGeneration !== generation)
        throw Error('blackout-presentation-owner-stale');
    };
    local(); const native = callbacks.capture(owner, phase, receipt); local();
    if (typeof native !== 'function') throw Error('blackout-presentation-native-guard-unavailable');
    const guard = (): void => { local(); native(); local(); };
    guard(); return { app, guard };
  };
  const observe = <T>(guard: Guard, provider: () => T): T => { guard(); const result = provider(); guard(); return result; };
  const dataMethod = (receiver: object, key: string, guard: Guard): ((this: unknown, ...args: unknown[]) => unknown) => {
    let holder: object | null = receiver;
    while (holder) {
      const current = holder;
      // Descriptor lookup must stop at a shadow accessor; it cannot borrow a deeper method.
      if (observe(guard, () => isProxy(current))) throw Error('blackout-native-method-proxy');
      const descriptor = observe(guard, () => Object.getOwnPropertyDescriptor(current, key));
      if (descriptor) {
        const value: unknown = 'value' in descriptor ? descriptor.value : undefined;
        if (typeof value !== 'function' || observe(guard, () => isProxy(value))) throw Error('blackout-native-data-method-required');
        return value as (this: unknown, ...args: unknown[]) => unknown;
      }
      holder = observe(guard, () => Object.getPrototypeOf(current)) as object | null;
    }
    throw Error('blackout-map-request-refresh-unavailable');
  };
  const record = (raw: unknown, guard: Guard): object => {
    if (!raw || typeof raw !== 'object' || observe(guard, () => isProxy(raw)) || Array.isArray(raw)) throw Error('blackout-presentation-own-data-required');
    return raw;
  };
  const field = (raw: object, key: string): unknown => {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor || !('value' in descriptor)) throw Error('blackout-presentation-own-data-required');
    return descriptor.value;
  };
  const effectDone = (raw: unknown, guard: Guard): void => {
    const value = record(raw, guard), status = field(value, 'status');
    if (status === 'done') return;
    const reason = status === 'failed' ? field(value, 'reason') : undefined;
    throw Error(typeof reason === 'string' ? reason : 'blackout-presentation-effect-invalid');
  };
  const entryFor = (owner: object, checkpoint: BlackoutCheckpoint): Entry => {
    const key = JSON.stringify({ id: checkpoint.id, origin: checkpoint.origin, selection: checkpoint.selection });
    let entry = entries.get(owner);
    if (entry && entry.key !== key) throw Error('blackout-presentation-checkpoint-changed');
    if (!entry) { entry = { key }; entries.set(owner, entry); }
    return entry;
  };
  const work = (entry: Entry, phase: 'announce' | 'prepare', key: string, run: (current: Work) => Promise<void>): Promise<TravelEffectResult> => {
    let current = entry[phase];
    if (current && current.key !== key) return Promise.resolve(failed('blackout-presentation-phase-changed'));
    if (!current) { current = { key, promise: null, done: false, cursor: 0 }; entry[phase] = current; }
    if (current.promise) return current.promise;
    if (current.done) return Promise.resolve(done);
    const selected = current;
    // Publish before capture, UI, App or native providers can reenter this phase.
    selected.promise = Promise.resolve().then(() => run(selected)).then(() => {
      selected.done = true; return done;
    }, error => { selected.promise = null; return failed(error); });
    return selected.promise;
  };
  const tell = (message: string, guard: Guard): void => {
    guard(); try { diagnostic(message); } catch { /* An observational sink cannot undo an acknowledged cleanup prefix. */ } guard();
  };

  return Object.freeze({
    announce(kind, raw, owner) {
      try {
        const checkpoint = readBlackoutCheckpoint(raw);
        if (checkpoint.phase !== 'announce' || kind === 'debug-missing-home' && checkpoint.selection.branch !== 'home') throw Error('blackout-announce-phase-invalid');
        return work(entryFor(owner, checkpoint), 'announce', `${kind}:${JSON.stringify(checkpoint)}`, async () => {
          const { guard } = capture(owner, 'announce');
          if (kind === 'debug-missing-home' && !debug) return;
          const message = blackoutMessage(root, kind === 'debug-missing-home' ? 'missingHome' : checkpoint.selection.branch === 'center' ? 'center' : 'home');
          const result = await observe(guard, () => callbacks.message(message, owner));
          guard(); effectDone(result, guard); guard();
        });
      } catch (error) { return Promise.resolve(failed(error)); }
    },
    prepare(raw, owner) {
      try {
        const checkpoint = readBlackoutCheckpoint(raw);
        if (checkpoint.phase !== 'prepare' || checkpoint.branch !== 'center' && checkpoint.branch !== 'home') throw Error('blackout-prepare-phase-invalid');
        return work(entryFor(owner, checkpoint), 'prepare', JSON.stringify(checkpoint), async current => {
          const { app, guard } = capture(owner, 'prepare');
          if (!Number.isSafeInteger(startingOverSwitch) || startingOverSwitch < 1) throw Error('blackout-starting-over-switch-unconfigured');
          if (current.cursor === 0) {
            const result = await observe(guard, () => callbacks.cancelVehicles(owner));
            guard(); effectDone(result, guard); current.cursor = 1; guard();
          }
          if (current.cursor === 1) {
            const clear = observe(guard, () => app.clearBlackoutCompanionProjection);
            if (typeof clear !== 'function') throw Error('blackout-companion-clear-unavailable');
            const rawResult = await observe(guard, () => Reflect.apply(clear, app, [owner]));
            guard(); const result = record(rawResult, guard), status = field(result, 'status');
            const diagnostics = field(result, 'diagnostics');
            if (!Array.isArray(diagnostics) || observe(guard, () => isProxy(diagnostics))) throw Error('blackout-companion-clear-result-invalid');
            const lines: string[] = [];
            for (let i = 0; i < diagnostics.length; i++) {
              const line = field(diagnostics, String(i));
              if (typeof line !== 'string') throw Error('blackout-companion-clear-result-invalid');
              lines.push(line);
            }
            if (status !== 'cleared' && status !== 'fallback') {
              const why = Object.getOwnPropertyDescriptor(result, 'reason');
              throw Error(why && 'value' in why && typeof why.value === 'string' ? why.value : 'blackout-companion-clear-rejected');
            }
            current.cursor = 2;
            if (status === 'fallback') tell('blackout-companion-projection-fallback', guard);
            for (const line of lines) tell(line, guard);
            guard();
          }
          if (current.cursor === 2) {
            const switches = observe(guard, () => root.$gameSwitches);
            if (!switches || typeof switches !== 'object' || observe(guard, () => isProxy(switches))) throw Error('blackout-native-switches-unavailable');
            const set = observe(guard, () => Reflect.get(switches, 'setValue'));
            const value = observe(guard, () => Reflect.get(switches, 'value'));
            if (typeof set !== 'function' || typeof value !== 'function') throw Error('blackout-native-switches-unavailable');
            if (observe(guard, () => root.$gameSwitches) !== switches) throw Error('blackout-native-switches-changed');
            guard(); Reflect.apply(set, switches, [startingOverSwitch, true]);
            // A normally returned write is a completed prefix even if a later reader fails.
            current.switches = switches; current.cursor = 3; guard();
          }
          if (current.cursor === 3) {
            const switches = current.switches;
            if (!switches || observe(guard, () => root.$gameSwitches) !== switches) throw Error('blackout-native-switches-changed');
            const value = observe(guard, () => Reflect.get(switches, 'value'));
            if (typeof value !== 'function' || observe(guard, () => Reflect.apply(value, switches, [startingOverSwitch])) !== true ||
              observe(guard, () => root.$gameSwitches) !== switches)
              throw Error('blackout-starting-over-switch-not-applied');
            current.cursor = 4; guard();
          }
        });
      } catch (error) { return Promise.resolve(failed(error)); }
    },
    requestMapRefresh(owner, receipt) {
      let receipts = refreshes.get(owner);
      if (!receipts) { receipts = new WeakMap(); refreshes.set(owner, receipts); }
      const previous = receipts.get(receipt);
      if (previous) return previous === 'running' ? failed('blackout-map-refresh-reentrant') : previous;
      receipts.set(receipt, 'running');
      try {
        const { guard } = capture(owner, 'refresh', receipt);
        const map = observe(guard, () => root.$gameMap);
        if (!map || typeof map !== 'object' || observe(guard, () => isProxy(map))) throw Error('blackout-native-map-unavailable');
        const request = dataMethod(map, 'requestRefresh', guard);
        const result = observe(guard, () => Reflect.apply(request, map, []));
        if (result && (typeof result === 'object' || typeof result === 'function')) throw Error('blackout-map-request-refresh-not-synchronous');
        if (observe(guard, () => root.$gameMap) !== map) throw Error('blackout-native-map-changed');
        guard(); receipts.set(receipt, done); return done;
      } catch (error) { const result = failed(error); receipts.set(receipt, result); return result; }
    },
  });
}
