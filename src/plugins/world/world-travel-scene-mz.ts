/** Actual Scene_Map constructor receipts, including Reactor's orig.apply(v8Inst) upgrade. */
import { hostRecord } from './host-access';
interface Lease { readonly identity: object; readonly sourceScene: object }
export interface NativeMapObservation {
  queued(scene: object, birth: object, queue: object): void;
  activated(scene: object, birth: object, queue: object): void;
  loaded(scene: object, birth: object, queue: object): void;
  ready(scene: object, birth: object, queue: object): void;
  invalid(scene: object, birth: object, queue: object): void;
  lost(): void;
}
interface Ports { current(): Lease | null; accepted(lease: object, scene: object): void; constructed?(lease: object, scene: object): void; invalidated(lease: object): void; observation?: NativeMapObservation }
interface Allocation { readonly lease: Lease; readonly manager: object; readonly source: object; readonly previous: unknown; attempts: number; completed: object | null; invalid: boolean }
/** Install before MZGlobalUpgrade/first Map construction. Public initialize never issues a receipt. */
export function installTravelSceneAllocation(root: Record<string, unknown>, ports: Ports): void {
  const own = (object: object, key: string): unknown => {
    const d = Object.getOwnPropertyDescriptor(object, key);
    if (d && !Object.hasOwn(d, 'value')) throw Error('travel-scene-own-data-required');
    return d?.value;
  };
  const original = own(root, 'Scene_Map'), manager = hostRecord(own(root, 'SceneManager'));
  if (typeof original !== 'function' || !manager) throw Error('travel-map-construction-unavailable');
  const prototype = hostRecord(own(original, 'prototype')), nativeGoto = own(manager, 'goto');
  if (!prototype || typeof nativeGoto !== 'function') return; // No transition surface in a bounded native-method fixture.
  const seen = new WeakSet<object>(), constructors = new WeakSet<object>();
  let allocation: Allocation | null = null;
  const tickets = new WeakMap<object, { scene: object | null; used: boolean; result: unknown }>();
  const invalid = new WeakSet<object>();
  type Birth = { readonly scene: object; readonly birth: object; readonly queue: object };
  let queuedBirth: Birth | null = null, activeBirth: Birth | null = null, observationEpoch: object = {};
  let changingBirth: Birth | null = null, readyingBirth: Birth | null = null;
  const loadCalls = new WeakMap<object, number>();
  const created = new WeakSet<object>(), loaded = new WeakSet<object>(), createCalls = new WeakMap<object, number>();
  const observe = (scene: object, epoch: object): void => {
    if (!ports.observation || observationEpoch !== epoch) return;
    const record = { scene, birth: Object.freeze({}), queue: epoch }; queuedBirth = record;
    ports.observation.queued(record.scene, record.birth, record.queue);
  };
  const lose = (epoch: object): void => {
    if (!ports.observation || observationEpoch !== epoch) return;
    queuedBirth = null; activeBirth = null; ports.observation.lost();
  };
  const current = (a: Allocation): boolean => !a.invalid && allocation === a && ports.current()?.identity === a.lease.identity && own(root, 'SceneManager') === manager && own(manager, '_scene') === a.source;
  const owned = function(this: unknown, ...args: unknown[]): unknown {
    const scene = hostRecord(this), a = allocation, fresh = scene !== null && !seen.has(scene);
    if (scene) seen.add(scene);
    if (a) { a.attempts++; if (!fresh || !scene || Object.getPrototypeOf(scene) !== prototype) a.invalid = true; }
    const result = Reflect.apply(original, this, args);
    if (a && scene) {
      if (!allocationCurrent(a) || !fresh || result !== undefined && result !== scene) a.invalid = true;
      else a.completed = scene;
    }
    return result;
  };
  Object.defineProperty(owned, 'name', { value: original.name, configurable: true });
  owned.prototype = prototype; prototype.constructor = owned; constructors.add(owned); root.Scene_Map = owned;
  const upgrade = own(root, 'MZGlobalUpgrade');
  if (typeof upgrade === 'function') root.MZGlobalUpgrade = function(this: unknown, ...args: unknown[]): unknown {
    const before = own(root, 'Scene_Map'), result = Reflect.apply(upgrade, this, args), after = own(root, 'Scene_Map');
    if (before === owned && typeof after === 'function' && own(after, 'prototype') === prototype && own(prototype, 'constructor') === after) constructors.add(after);
    return result;
  };
  const observeGoto = (self: unknown, sceneClass: unknown, args: unknown[], source: Record<string, unknown> | null, epoch: object): unknown => {
    const previous = own(manager, '_nextScene');
    if (!ports.observation || self !== manager || !source || typeof sceneClass !== 'function' || !constructors.has(sceneClass) || own(root, 'Scene_Map') !== sceneClass) {
      lose(epoch); return Reflect.apply(nativeGoto, self, [sceneClass, ...args]);
    }
    const parent = allocation, observationLease: Lease = { identity: Object.freeze({}), sourceScene: source };
    const a: Allocation = { lease: observationLease, manager, source, previous, attempts: 0, completed: null, invalid: false };
    // An observational allocation checks its own native queue epoch; it never becomes an E3/F permit.
    const normalCurrent = (): boolean => !a.invalid && allocation === a && observationEpoch === epoch && own(root, 'SceneManager') === manager && own(manager, '_scene') === source;
    observational.add(observationLease.identity); allocation = a;
    try {
      const publication = function(...constructorArgs: unknown[]): object {
        const scene = Reflect.construct(sceneClass, constructorArgs, sceneClass);
        // The shared constructor uses current(a), so only this native call's original body may complete.
        if (!normalCurrent() || a.attempts !== 1 || !a.completed || scene !== a.completed || scene === source || scene === previous) a.invalid = true;
        return scene;
      };
      const result = Reflect.apply(nativeGoto, self, [publication, ...args]);
      if (normalCurrent() && a.attempts === 1 && a.completed && own(manager, '_nextScene') === a.completed) observe(a.completed, epoch);
      else lose(epoch);
      return result;
    } catch (error) { lose(epoch); throw error; }
    finally { if (allocation === a) allocation = parent; }
  };
  const observational = new WeakSet<object>();
  const nativeCurrent = current;
  // Same allocation/current machinery; observational records cannot satisfy ports.current().
  const allocationCurrent = (a: Allocation): boolean => observational.has(a.lease.identity)
    ? !a.invalid && allocation === a && own(root, 'SceneManager') === manager && own(manager, '_scene') === a.source
    : nativeCurrent(a);
  const changeScene = own(manager, 'changeScene'), create = own(prototype, 'create'), onMapLoaded = own(prototype, 'onMapLoaded'), isReady = own(prototype, 'isReady');
  if (ports.observation && typeof create === 'function') prototype.create = function(this: object, ...args: unknown[]): unknown {
    const expected = changingBirth;
    if (expected?.scene === this) createCalls.set(expected.birth, (createCalls.get(expected.birth) ?? 0) + 1);
    const result = Reflect.apply(create, this, args);
    if (expected && changingBirth === expected && expected.scene === this && own(manager, '_scene') === this && createCalls.get(expected.birth) === 1) created.add(expected.birth);
    else if (expected) { created.delete(expected.birth); loaded.delete(expected.birth); }
    return result;
  };
  if (ports.observation && typeof onMapLoaded === 'function') prototype.onMapLoaded = function(this: object, ...args: unknown[]): unknown {
    const expected = readyingBirth;
    if (expected?.scene === this) loadCalls.set(expected.birth, (loadCalls.get(expected.birth) ?? 0) + 1);
    const result = Reflect.apply(onMapLoaded, this, args);
    if (expected && readyingBirth === expected && activeBirth === expected && expected.scene === this && own(manager, '_scene') === this && created.has(expected.birth)) {
      if (loadCalls.get(expected.birth) === 1) { loaded.add(expected.birth); ports.observation?.loaded(this, expected.birth, expected.queue); }
      else { loaded.delete(expected.birth); ports.observation?.invalid(this, expected.birth, expected.queue); }
    }
    return result;
  };
  if (ports.observation && typeof changeScene === 'function') manager.changeScene = function(this: unknown, ...args: unknown[]): unknown {
    const beforeScene = own(manager, '_scene'), beforeNext = own(manager, '_nextScene'), expected = queuedBirth;
    const previousChanging = changingBirth;
    changingBirth = this === manager && expected && beforeNext === expected.scene ? expected : null;
    let result: unknown;
    try { result = Reflect.apply(changeScene, this, args); }
    catch (error) {
      if (expected && queuedBirth === expected && own(manager, '_scene') === expected.scene && !created.has(expected.birth)) {
        queuedBirth = null; activeBirth = null; ports.observation?.lost();
      }
      throw error;
    } finally { changingBirth = previousChanging; }
    const afterScene = own(manager, '_scene');
    if (afterScene === beforeScene && own(manager, '_nextScene') === beforeNext) return result;
    if (this === manager && expected && beforeNext === expected.scene && afterScene === expected.scene && created.has(expected.birth)) {
      activeBirth = expected; if (queuedBirth === expected) queuedBirth = null;
      ports.observation?.activated(expected.scene, expected.birth, expected.queue);
    } else if (afterScene !== activeBirth?.scene || beforeNext !== null && beforeNext !== undefined) {
      activeBirth = null; ports.observation?.lost();
    }
    return result;
  };
  if (ports.observation && typeof isReady === 'function') prototype.isReady = function(this: object, ...args: unknown[]): unknown {
    const expected = activeBirth, previousReady = readyingBirth; readyingBirth = expected?.scene === this ? expected : null;
    let result: unknown;
    try { result = Reflect.apply(isReady, this, args); } finally { readyingBirth = previousReady; }
    if (result === true && expected && created.has(expected.birth) && loaded.has(expected.birth) && activeBirth === expected && expected.scene === this && own(manager, '_scene') === this && own(this, '_mapLoaded') === true)
      ports.observation?.ready(this, expected.birth, expected.queue);
    return result;
  };
  manager.goto = function(this: unknown, sceneClass: unknown, ...args: unknown[]): unknown {
    const parent = allocation;
    if (parent) parent.invalid = true;
    const lease = ports.current(), source = hostRecord(own(manager, '_scene'));
    if (this !== manager || !lease || !source) { const epoch = Object.freeze({}); observationEpoch = epoch; return observeGoto(this, sceneClass, args, source, epoch); }
    const previous = own(manager, '_nextScene');
    const authorized = typeof sceneClass === 'function' && constructors.has(sceneClass) && own(root, 'Scene_Map') === sceneClass;
    let ticket = tickets.get(lease.identity);
    if (!ticket) { ticket = { scene: null, used: false, result: undefined }; tickets.set(lease.identity, ticket); }
    const duplicate = authorized && !invalid.has(lease.identity) && source === lease.sourceScene && ticket.used && ticket.scene !== null && previous === ticket.scene;
    if (duplicate) return ticket.result; // Same private queued target, no second construction/stop.
    const queuedForeign = previous !== null && previous !== undefined && previous !== ticket.scene;
    if (!authorized || invalid.has(lease.identity) || source !== lease.sourceScene || queuedForeign || ticket.used || parent?.lease.identity === lease.identity) {
      invalid.add(lease.identity); const beforeSource = source;
      ports.invalidated(lease.identity);
      // A provider may have installed a genuine successor during App retirement. Its queue wins.
      if (own(manager, '_nextScene') !== previous || own(manager, '_scene') !== beforeSource || authorized && queuedForeign) return;
      return Reflect.apply(nativeGoto, this, [sceneClass, ...args]);
    }
    seen.add(source); if (hostRecord(previous)) seen.add(previous as object);
    const epoch = Object.freeze({}); observationEpoch = epoch;
    const a: Allocation = { lease, manager, source, previous, attempts: 0, completed: null, invalid: false };
    allocation = a;
    try {
      const publication = function(...constructorArgs: unknown[]): object {
        const scene: unknown = Reflect.construct(sceneClass, constructorArgs, sceneClass);
        if (!current(a) || a.attempts !== 1 || !a.completed || scene !== a.completed || scene === a.source || scene === a.previous) throw Error('travel-map-construction-stale');
        ports.constructed?.(a.lease.identity, a.completed);
        if (!current(a)) throw Error('travel-map-construction-provider-stale');
        return a.completed;
      };
      const result = Reflect.apply(nativeGoto, this, [publication, ...args]);
      if (!current(a) || a.attempts !== 1 || !a.completed || own(manager, '_nextScene') !== a.completed) throw Error('travel-map-publication-stale');
      ticket.scene = a.completed; ticket.used = true; ticket.result = result;
      observe(a.completed, epoch);
      ports.accepted(a.lease.identity, a.completed);
      return result;
    } catch (error) {
      // Revoke only this unfinished publication before a failure observer may enqueue a successor.
      // Own-data check/store has no host/provider callback; after notification the queue is untouched.
      if (ports.current()?.identity === a.lease.identity && own(manager, '_nextScene') === a.completed && own(manager, '_scene') === a.source) manager._nextScene = a.previous;
      lose(epoch); invalid.add(a.lease.identity); ports.invalidated(a.lease.identity);
      throw error;
    } finally { if (allocation === a) allocation = parent; }
  };
}
