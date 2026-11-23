/** Private allocation receipts for MZGlobalUpgrade's orig.apply constructor path. */
import { hostRecord } from './host-access';
interface Issuer { beginConstruction(): object | null; bindConstruction(scene: object, token: object): void }
interface Allocation {
  readonly manager: Record<string, unknown>; readonly flow: Record<string, unknown>; readonly app: unknown; readonly operation: unknown;
  readonly scene: unknown; readonly previous: unknown; readonly wasActive: unknown; token: object | null; attempts: number; completed: object | null; attempted: Set<object>; invalid: boolean;
}
export function createWorldSceneConstructionMZ(root: Record<string, unknown>, original: Function, prototype: object,
  issuer: Issuer, nativeIsProxy: (value: unknown) => boolean) {
  const record = (value: unknown): Record<string, unknown> => { const r = hostRecord(value); if (!r || nativeIsProxy(r)) throw Error('world-battle-scene-construction-stale'); return r; };
  const missing = Symbol('not-own-data');
  const data = (owner: unknown, key: string): unknown => { const d = Object.getOwnPropertyDescriptor(record(owner), key); if (!d) return missing; if (!('value' in d)) throw Error('world-battle-scene-construction-stale'); return d.value; };
  const manager = record(data(root, 'SceneManager')), nativeGoto = data(manager, 'goto'), nativePush = data(manager, 'push');
  if (typeof nativeGoto !== 'function') throw Error('world-scene-allocation-unavailable');
  const constructors = new WeakSet<object>([original]), seen = new WeakSet<object>();
  let allocation: Allocation | null = null;
  const sameOwner = (a: Allocation): boolean => data(root, 'PSFlow') === a.flow && data(a.flow, '_app') === a.app && data(a.flow, '_op') === a.operation;
  const upgrade = data(root, 'MZGlobalUpgrade');
  if (typeof upgrade === 'function') {
    record(upgrade);
    root.MZGlobalUpgrade = function(this: unknown, ...args: unknown[]): unknown {
      const before = data(root, 'Scene_PSBattle');
      const result = Reflect.apply(upgrade, this, args);
      const after = data(root, 'Scene_PSBattle');
      // Capture only the native upgrade of our original class. Later mutable globals/markers grant nothing.
      if (before === original && typeof after === 'function' && !nativeIsProxy(after) &&
        data(after, 'prototype') === prototype && data(prototype, 'constructor') === after) constructors.add(after);
      return result;
    };
  }
  interface Push { readonly stack: unknown[]; readonly prefix: readonly unknown[]; entry: unknown; rollback: boolean }
  let push: Push | null = null;
  if (typeof nativePush === 'function') manager.push = function(this: unknown, ...args: unknown[]): unknown {
    if (this !== manager) return Reflect.apply(nativePush, this, args);
    const stack = data(manager, '_stack'), previous = push;
    let ticket: Push | null = null;
    if (Array.isArray(stack) && !nativeIsProxy(stack)) {
      const length = data(stack, 'length'); if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) throw Error('world-scene-stack-invalid');
      ticket = { stack, prefix: Array.from({ length }, (_, i) => data(stack, String(i))), entry: missing, rollback: false };
    }
    push = ticket;
    try { return Reflect.apply(nativePush, this, args); }
    catch (error) {
      if (ticket?.rollback && data(manager, '_stack') === ticket.stack && ticket.entry !== missing &&
        ticket.prefix.every((value, i) => data(ticket!.stack, String(i)) === value) && data(ticket.stack, String(ticket.prefix.length)) === ticket.entry) {
        // Remove only this push's own entry; successor entries, if any, keep their order.
        Reflect.apply(Array.prototype.splice, ticket.stack, [ticket.prefix.length, 1]);
      }
      throw error;
    } finally { if (push === ticket) push = previous; }
  };
  manager.goto = function(this: unknown, sceneClass: unknown, ...args: unknown[]): unknown {
    if (this !== manager || data(root, 'SceneManager') !== manager) return Reflect.apply(nativeGoto, this, [sceneClass, ...args]);
    const authorized = typeof sceneClass === 'function' && !nativeIsProxy(sceneClass) && constructors.has(sceneClass) && data(root, 'Scene_PSBattle') === sceneClass;
    const parent = allocation;
    if (parent) { parent.invalid = true; if (sameOwner(parent)) return Reflect.apply(nativeGoto, this, [sceneClass, ...args]); }
    const flow = record(data(root, 'PSFlow'));
    const a: Allocation = { manager, flow, app: data(flow, '_app'), operation: data(flow, '_op'), scene: data(manager, '_scene'), previous: data(manager, '_nextScene'), wasActive: hostRecord(data(manager, '_scene')) ? data(data(manager, '_scene'), '_active') : missing, token: null, attempts: 0, completed: null, attempted: new Set(), invalid: false };
    allocation = a; const ownPush = push;
    if (push) push.entry = data(push.stack, String(push.prefix.length));
    try {
      a.token = authorized ? issuer.beginConstruction() : null;
      // Native goto publishes `_nextScene` only after `new sceneClass()` returns. Keep the
      // actual native class/new.target, but reject an invalidated outer allocation before
      // that publication can overwrite (or stop) a genuine nested successor.
      const constructor = sceneClass as Function;
      const publication = a.token ? function(...constructorArgs: unknown[]): object {
        const scene: unknown = Reflect.construct(constructor, constructorArgs, constructor);
        if (a.invalid || allocation !== a || !sameOwner(a) || data(a.flow, 'running') !== true || data(root, 'SceneManager') !== manager ||
          data(manager, '_scene') !== a.scene || a.attempts !== 1 || scene !== a.completed || scene === a.previous || scene === a.scene ||
          !a.completed || Object.getPrototypeOf(a.completed) !== prototype) throw Error('world-battle-scene-construction-stale');
        return a.completed;
      } : sceneClass;
      const result = Reflect.apply(nativeGoto, this, [publication, ...args]);
      if (!a.token) return result;
      const scene = data(manager, '_nextScene');
      if (a.invalid || allocation !== a || !sameOwner(a) || data(root, 'SceneManager') !== manager || data(manager, '_scene') !== a.scene ||
        a.attempts !== 1 || scene !== a.completed || scene === a.previous || scene === a.scene || !a.completed || Object.getPrototypeOf(a.completed) !== prototype) throw Error('world-battle-scene-construction-stale');
      issuer.bindConstruction(a.completed, a.token); return result;
    } catch (error) {
      // A swallowed orig.apply failure must not leave its partial Scene queued. Never touch a successor allocation.
      if (ownPush) ownPush.rollback = true;
      const next = data(manager, '_nextScene');
      if (sameOwner(a) && data(root, 'SceneManager') === manager && data(manager, '_scene') === a.scene && typeof next === 'object' && next !== null && a.attempted.has(next)) {
        manager._nextScene = a.previous;
        if (a.wasActive === true && hostRecord(a.scene) && data(a.scene, '_active') === false) record(a.scene)._active = true;
      }
      throw error;
    } finally { if (allocation === a) allocation = parent; }
  };
  return {
    /** The original body alone records successful initialization; public initialize cannot complete a receipt. */
    before(scene: object, target: unknown): () => void {
      record(scene); const fresh = !seen.has(scene); seen.add(scene);
      const a = allocation; if (a) { a.attempts++; if (fresh && Object.getPrototypeOf(scene) === prototype) a.attempted.add(scene); }
      const direct = !a && fresh && target === original && data(root, 'Scene_PSBattle') === original ? issuer.beginConstruction() : null;
      return () => {
        if (a) { if (allocation === a && fresh && Object.getPrototypeOf(scene) === prototype) a.completed = scene; else a.invalid = true; }
        else if (direct) { if (Object.getPrototypeOf(scene) !== prototype) throw Error('world-battle-scene-construction-stale'); issuer.bindConstruction(scene, direct); }
      };
    },
  };
}
