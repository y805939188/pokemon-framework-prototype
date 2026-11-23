/** Explicit MZ author-command adapter. App-issued intents retain all execution authority. */
import type { GameApplication } from '../../framework/app/game-application';
import type { EventCompanionIntent } from '../../framework/app/event-companion-public-ports';
import { hostRecord } from './host-access';

export const WORLD_AUTHOR_WAIT = 'psWorldAuthor';
export type WorldAuthorApplication = Pick<GameApplication,
  'stateGeneration' | 'beginEventCompanion' | 'cancelEventCompanion' | 'recoverBlackoutReturn'
  | 'recordRecentCenter' | 'recordCaveEntrance' | 'clearCaveEscapePoint'>;
export type WorldAuthorBlackoutRetry = (application: WorldAuthorApplication) => ReturnType<WorldAuthorApplication['recoverBlackoutReturn']>;
export type WorldAuthorCommand = 'RegisterEventCompanion' | 'RemoveEventCompanions' | 'RetryBlackoutReturn'
  | 'RecordRecentCenter' | 'RecordCaveEntrance' | 'ClearCaveEscapePoint';
export interface WorldAuthorCommandOutcome {
  readonly command: WorldAuthorCommand; readonly status: string;
  readonly reason?: string; readonly diagnostics?: readonly string[];
}
interface Call {
  readonly interpreter: Record<string, unknown>; readonly application: WorldAuthorApplication;
  readonly generation: number; readonly command: WorldAuthorCommand;
  handle?: object; cancelledHandle?: object; done: boolean; outcome?: WorldAuthorCommandOutcome;
}
const own = (value: unknown, key: string): unknown => {
  const object = hostRecord(value), slot = object && Object.getOwnPropertyDescriptor(object, key);
  return slot && 'value' in slot ? slot.value : undefined;
};
function args(raw: unknown, keys: readonly string[]): Record<string, string> {
  const object = hostRecord(raw); if (!object || Array.isArray(raw)) throw Error('world-author-arguments-invalid');
  const result: Record<string, string> = {};
  for (const key of Reflect.ownKeys(object)) {
    if (typeof key !== 'string' || !keys.includes(key)) throw Error('world-author-argument-unknown');
    const value = own(object, key); if (typeof value !== 'string') throw Error('world-author-argument-invalid');
    Object.defineProperty(result, key, { value, enumerable: true });
  }
  return result;
}
function positive(value: string | undefined): number {
  if (!value || !/^[1-9][0-9]*$/.test(value)) throw Error('world-author-positive-integer-required');
  const result = Number(value); if (!Number.isSafeInteger(result)) throw Error('world-author-positive-integer-required'); return result;
}
function text(value: string | undefined): string {
  if (value === undefined) throw Error('world-author-name-invalid'); return value;
}
export function parseWorldAuthorCommand(command: WorldAuthorCommand, raw: unknown): EventCompanionIntent | null {
  if (command === 'RetryBlackoutReturn' || command === 'RecordRecentCenter' || command === 'RecordCaveEntrance' || command === 'ClearCaveEscapePoint') { args(raw, []); return null; }
  if (command === 'RegisterEventCompanion') {
    const value = args(raw, ['eventId', 'name', 'commonEventId']);
    return { kind: 'register', eventId: positive(value.eventId), ...(value.name ? { name: text(value.name) } : {}),
      ...(value.commonEventId && value.commonEventId !== '0' ? { commonEventId: positive(value.commonEventId) } : {}) };
  }
  if (command !== 'RemoveEventCompanions') throw Error('world-author-command-unknown');
  const value = args(raw, ['mode', 'originMapId', 'originEventId', 'name']);
  if (value.mode === 'all') return { kind: 'remove', removal: { kind: 'all' } };
  if (value.mode === 'name') return { kind: 'remove', removal: { kind: 'name', name: text(value.name) } };
  if (value.mode === 'origin') return { kind: 'remove', removal: { kind: 'origin', originMapId: positive(value.originMapId), originEventId: positive(value.originEventId) } };
  throw Error('world-author-removal-mode-invalid');
}
const why = (error: unknown): string => error instanceof Error ? error.message : String(error);
/** Installation is deliberately explicit; importing this module registers nothing. */
export function installWorldAuthorCommandsMZ(root: Record<string, unknown>, application: () => WorldAuthorApplication | null,
  diagnose: (message: string) => void, retryBlackoutReturn: WorldAuthorBlackoutRetry): { pending(): boolean; stateReplaced(): void } {
  if (typeof retryBlackoutReturn !== 'function') throw Error('world-author-blackout-retry-unavailable');
  const manager = hostRecord(root.PluginManager), register = manager?.registerCommand;
  const prototype = hostRecord(hostRecord(root.Game_Interpreter)?.prototype);
  if (!manager || typeof register !== 'function' || !prototype || typeof prototype.updateWaitMode !== 'function'
    || typeof prototype.clear !== 'function' || typeof prototype.terminate !== 'function') throw Error('world-author-interpreter-unavailable');
  const calls = new Map<object, Call>(), outcomes = new WeakMap<object, WorldAuthorCommandOutcome>();
  const current = (call: Call): boolean => {
    try {
      const actual = application();
      return calls.get(call.interpreter) === call && actual === call.application && actual.stateGeneration === call.generation
        && calls.get(call.interpreter) === call;
    } catch { return false; }
  };
  const abandon = (call: Call): void => {
    if (calls.get(call.interpreter) === call) calls.delete(call.interpreter);
    if (call.handle && call.cancelledHandle !== call.handle) {
      call.cancelledHandle = call.handle;
      try { call.application.cancelEventCompanion(call.handle); } catch (error) { diagnose(why(error)); }
    }
  };
  const receive = (call: Call, result: { readonly status: string; readonly reason?: string; readonly diagnostics?: readonly string[] }): void => {
    if (!current(call)) { abandon(call); return; }
    call.outcome = { command: call.command, status: result.status,
      ...(result.reason === undefined ? {} : { reason: result.reason }),
      ...(result.diagnostics === undefined ? {} : { diagnostics: [...result.diagnostics] }) };
    call.done = true;
    if (result.status === 'failed' || result.status === 'refused') diagnose(result.reason ?? 'world-author-operation-failed');
  };
  Object.defineProperty(prototype, '_psWorldAuthorOutcome', { configurable: true, enumerable: false,
    get(this: object): WorldAuthorCommandOutcome | undefined {
      const value = outcomes.get(this); return value ? { ...value, ...(value.diagnostics ? { diagnostics: [...value.diagnostics] } : {}) } : undefined;
    } });
  for (const command of ['RegisterEventCompanion', 'RemoveEventCompanions', 'RetryBlackoutReturn'] as const) {
    const handler = function(this: unknown, raw: unknown): void {
      const interpreter = hostRecord(this); if (!interpreter) { diagnose('world-author-interpreter-unavailable'); return; }
      let call: Call | undefined;
      try {
        const intent = parseWorldAuthorCommand(command, raw);
        if (calls.has(interpreter)) throw Error('world-author-operation-active');
        const app = application(); if (!app || !Number.isSafeInteger(app.stateGeneration)) throw Error('world-author-application-unavailable');
        const setWait = interpreter.setWaitMode; if (typeof setWait !== 'function') throw Error('world-author-wait-unavailable');
        call = { interpreter, application: app, generation: app.stateGeneration, command, done: false };
        calls.set(interpreter, call); outcomes.delete(interpreter);
        Reflect.apply(setWait, interpreter, [WORLD_AUTHOR_WAIT]);
        if (!current(call)) { abandon(call); return; }
        if (intent) {
          const receipt = app.beginEventCompanion(intent); call.handle = receipt.handle;
          if (!current(call)) { abandon(call); return; }
          const owned = call;
          void receipt.result.then(result => receive(owned, result), error => receive(owned, { status: 'failed', reason: why(error) }));
        } else {
          const owned = call;
          void retryBlackoutReturn(app).then(result => receive(owned, result), error => receive(owned, { status: 'failed', reason: why(error) }));
        }
      } catch (error) {
        if (call && calls.get(interpreter) === call) receive(call, { status: 'failed', reason: why(error) });
        else { if (!calls.has(interpreter)) outcomes.set(interpreter, { command, status: 'refused', reason: why(error) }); diagnose(why(error)); }
      }
    };
    Reflect.apply(register, manager, ['PS_World', command, handler]);
  }
  // Synchronous author writes must finish before the interpreter advances to its own presentation.
  // They never claim a waiter/pending flag, so a running Map interpreter cannot wait on itself.
  for (const [command, action] of [['RecordRecentCenter', 'recordRecentCenter'], ['RecordCaveEntrance', 'recordCaveEntrance'],
    ['ClearCaveEscapePoint', 'clearCaveEscapePoint']] as const) {
    const handler = function(this: unknown, raw: unknown): void {
      const interpreter = hostRecord(this); if (!interpreter) { diagnose('world-author-interpreter-unavailable'); return; }
      try {
        args(raw, []);
        if (calls.has(interpreter)) throw Error('world-author-operation-active');
        const app = application(); if (!app || !Number.isSafeInteger(app.stateGeneration)) throw Error('world-author-application-unavailable');
        const generation = app.stateGeneration;
        let method: unknown;
        for (let owner: object | null = app; owner; owner = Object.getPrototypeOf(owner) as object | null) {
          const slot = Object.getOwnPropertyDescriptor(owner, action);
          if (slot) { method = 'value' in slot ? slot.value : undefined; break; }
        }
        if (typeof method !== 'function') throw Error('world-author-location-method-unavailable');
        if (application() !== app || app.stateGeneration !== generation) throw Error('world-author-application-stale');
        // The actual App's two atomic captures own source/gen/Content and the sole pure write.
        const result: unknown = Reflect.apply(method, app, []), status = own(result, 'status');
        if (application() !== app || app.stateGeneration !== generation) throw Error('world-author-application-stale');
        if (status !== 'committed' && status !== 'unchanged' && status !== 'refused') throw Error('world-author-location-result-invalid');
        const reason = status === 'refused' ? own(result, 'reason') : undefined;
        if (status === 'refused' && typeof reason !== 'string') throw Error('world-author-location-result-invalid');
        outcomes.set(interpreter, { command, status, ...(typeof reason === 'string' ? { reason } : {}) });
        if (typeof reason === 'string') diagnose(reason);
      } catch (error) {
        if (!calls.has(interpreter)) outcomes.set(interpreter, { command, status: 'refused', reason: why(error) });
        diagnose(why(error));
      }
    };
    Reflect.apply(register, manager, ['PS_World', command, handler]);
  }
  const previousWait = prototype.updateWaitMode;
  prototype.updateWaitMode = function(this: unknown, ...values: unknown[]): unknown {
    const interpreter = hostRecord(this);
    if (!interpreter || interpreter._waitMode !== WORLD_AUTHOR_WAIT) return Reflect.apply(previousWait, this, values);
    const call = calls.get(interpreter);
    if (call && current(call) && !call.done) return true;
    if (call && current(call) && call.outcome) outcomes.set(interpreter, call.outcome);
    if (call) abandon(call);
    // cancelEventCompanion may reenter and install a successor. This frame cannot clear it.
    if (calls.has(interpreter)) return true;
    interpreter._waitMode = ''; return false;
  };
  for (const key of ['clear', 'terminate'] as const) {
    const previous = prototype[key];
    if (typeof previous !== 'function') throw Error('world-author-interpreter-unavailable');
    prototype[key] = function(this: unknown, ...values: unknown[]): unknown {
      const interpreter = hostRecord(this), call = interpreter && calls.get(interpreter);
      if (call) abandon(call);
      return Reflect.apply(previous, this, values);
    };
  }
  return {
    pending: () => [...calls.values()].some(call => !call.done && current(call)),
    stateReplaced: () => { for (const call of [...calls.values()]) abandon(call); },
  };
}
