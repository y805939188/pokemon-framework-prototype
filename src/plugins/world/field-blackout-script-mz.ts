/** MZ Script's command355 does not await promises. This narrow bridge waits only
 * the current real map interpreter's own direct check, preserving native wait hooks. */
import type { FieldBlackoutCheckOutcome } from '../../framework/app/world-operation';
import { hostRecord } from './host-access';
interface Application {
  readonly stateGeneration: number;
  checkFieldBlackout(requestId: string): Promise<FieldBlackoutCheckOutcome>;
  isFieldBlackoutCheckPending(requestId: string): boolean;
}
interface Options { readonly root: Record<string, unknown>; application(): Application | null; isProxy(value: unknown): boolean }
interface Wait {
  readonly app: Application; readonly generation: number; readonly map: object; readonly mapId: unknown;
  readonly list: unknown; readonly requestId: string; readonly promise: Promise<FieldBlackoutCheckOutcome>;
  readonly serial: number;
  result: FieldBlackoutCheckOutcome | null;
}
export function installFieldBlackoutScriptMZ(options: Options): (interpreter: unknown, requestId: string) => Promise<FieldBlackoutCheckOutcome> {
  const {root} = options, waits = new WeakMap<object, Wait>(), serials = new WeakMap<object, number>();
  const data = (raw: unknown, key: string): unknown => {
    const record = hostRecord(raw); if (!record || options.isProxy(record)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(record, key); return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  };
  const prototype = hostRecord(data(data(root, 'Game_Interpreter'), 'prototype'));
  if (!prototype || options.isProxy(prototype)) throw Error('blackout-script-interpreter-unavailable');
  const original = data(prototype, 'updateWaitMode');
  if (typeof original !== 'function' || options.isProxy(original)) throw Error('blackout-script-wait-unavailable');
  const clear = data(prototype, 'clear');
  if (typeof clear !== 'function' || options.isProxy(clear)) throw Error('blackout-script-clear-unavailable');
  prototype.clear = function(this: unknown, ...args: unknown[]): unknown {
    const interpreter = hostRecord(this);
    if (interpreter && !options.isProxy(interpreter)) { waits.delete(interpreter); serials.set(interpreter, (serials.get(interpreter) ?? 0) + 1); }
    return Reflect.apply(clear, this, args);
  };
  const caller = (interpreter: object, map: object): boolean => {
    if (options.isProxy(interpreter)) return false;
    let native = false;
    for (let p: object | null = Object.getPrototypeOf(interpreter), depth = 0; p && depth < 32; p = Object.getPrototypeOf(p) as object | null, depth++) {
      if (options.isProxy(p)) return false;
      if (p === prototype) { native = true; break; }
    }
    if (!native) return false;
    let at = data(map, '_interpreter');
    for (let depth = 0; at && depth < 100; depth++) { if (at === interpreter) return true; at = data(at, '_childInterpreter'); }
    return false;
  };
  const current = (interpreter: object, wait: Wait): boolean => options.application() === wait.app && wait.app.stateGeneration === wait.generation
    && (serials.get(interpreter) ?? 0) === wait.serial && data(root, '$gameMap') === wait.map && data(wait.map, '_mapId') === wait.mapId && data(interpreter, '_list') === wait.list && caller(interpreter, wait.map);
  prototype.updateWaitMode = function(this: unknown, ...args: unknown[]): unknown {
    const interpreter = hostRecord(this), wait = interpreter && waits.get(interpreter);
    if (!interpreter || !wait || data(interpreter, '_waitMode') !== 'psFieldBlackout') return Reflect.apply(original, this, args);
    if (current(interpreter, wait) && (wait.result === null || wait.app.isFieldBlackoutCheckPending(wait.requestId))) return true;
    if (waits.get(interpreter) === wait) waits.delete(interpreter);
    // A changed list belongs to a new native event; it owns its own wait mode.
    if ((serials.get(interpreter) ?? 0) === wait.serial && data(interpreter, '_list') === wait.list && data(interpreter, '_waitMode') === 'psFieldBlackout') {
      if (wait.app.stateGeneration !== wait.generation && Array.isArray(wait.list)) interpreter._index = wait.list.length;
      interpreter._waitMode = '';
    }
    return false;
  };
  return (raw, requestId) => {
    const interpreter = hostRecord(raw), app = options.application(), map = hostRecord(data(root, '$gameMap'));
    const refused = (reason: string): Promise<FieldBlackoutCheckOutcome> => Promise.resolve({ status: 'refused', reason });
    if (!interpreter || !app || !map || !caller(interpreter, map) || !Array.isArray(data(interpreter, '_list'))) return refused('blackout-script-caller-unavailable');
    const previous = waits.get(interpreter);
    if (previous && current(interpreter, previous)) return previous.requestId === requestId ? previous.promise : refused('operation-active');
    if (data(interpreter, '_waitMode') !== '') return refused('operation-active');
    let resolve: (result: FieldBlackoutCheckOutcome) => void = () => {};
    const promise = new Promise<FieldBlackoutCheckOutcome>(done => { resolve = done; });
    const wait: Wait = { app, generation: app.stateGeneration, map, mapId: data(map, '_mapId'), list: data(interpreter, '_list'), serial: serials.get(interpreter) ?? 0, requestId, promise, result: null };
    waits.set(interpreter, wait);
    try {
      const pending = app.checkFieldBlackout(requestId);
      if (!current(interpreter, wait)) throw Error('blackout-script-caller-stale');
      interpreter._waitMode = 'psFieldBlackout';
      void pending.then(result => { wait.result = result; resolve(result); }, error => {
        const result: FieldBlackoutCheckOutcome = { status: 'failed', reason: error instanceof Error ? error.message : String(error) }; wait.result = result; resolve(result);
      });
    } catch (error) { const result: FieldBlackoutCheckOutcome = { status: 'refused', reason: error instanceof Error ? error.message : String(error) }; wait.result = result; resolve(result); }
    return promise;
  };
}
