/** MZ owns actual battle scene construction; App owns the admission registry. */
import type { WorldBattleAdmission } from '../../framework/app/ports';
import { hostRecord } from './host-access';
/** Supply the real Node util.types.isProxy capability, never an author/plugin predicate. */
export function createWorldBattleSceneMZ(root: Record<string, unknown>, nativeIsProxy: (value: unknown) => boolean, expectedFlow?: object, captureReservation?: (player: object) => (() => void)) {
  if (typeof nativeIsProxy !== 'function') throw Error('native-proxy-detection-unavailable');
  const missing = Symbol('not-an-own-data-slot');
  const record = (value: unknown): Record<string, unknown> => {
    const result = hostRecord(value);
    if (!result || nativeIsProxy(result)) throw Error('world-battle-scene-stale');
    return result;
  };
  const ownData = (target: unknown, key: string): unknown => {
    const descriptor = Object.getOwnPropertyDescriptor(record(target), key);
    if (descriptor && !Object.hasOwn(descriptor, 'value')) throw Error('world-battle-scene-stale');
    return descriptor ? descriptor.value : missing;
  };
  record(root);
  const ownerFlow = record(expectedFlow ?? ownData(root, 'PSFlow'));
  interface Pending {
    readonly flow: Record<string, unknown>; readonly app: Record<string, unknown>; readonly manager: Record<string, unknown>;
    readonly operation: object; readonly generation: number; readonly admission: object; readonly reservationGuard?: () => void; constructionStarted?: boolean;
  }
  interface Entry extends Pending { readonly prototype: object | null }
  const constructions = new WeakMap<object, Pending>(), issued = new WeakMap<object, Entry>();
  /** No provider/getter is called in this final identity interval. */
  const pendingCurrent = (entry: Pending): boolean => ownData(root, 'PSFlow') === ownerFlow && entry.flow === ownerFlow &&
    ownData(root, 'SceneManager') === entry.manager && ownData(entry.flow, '_op') === entry.operation &&
    ownData(entry.flow, '_app') === entry.app && ownData(entry.flow, 'running') === true &&
    ownData(entry.operation, 'worldAdmission') === entry.admission && ownData(entry.admission, 'generation') === entry.generation;
  const current = (entry: Entry, admission: object, scene: object): boolean => pendingCurrent(entry) && admission === entry.admission &&
    ownData(entry.manager, '_scene') === scene && ownData(scene, '_psOp') === entry.operation && Object.getPrototypeOf(scene) === entry.prototype;
  const capture = (operation: unknown): Pending | null => {
    if (operation === null || operation === undefined || operation === missing) return null;
    const op = record(operation), rawAdmission = ownData(op, 'worldAdmission');
    if (rawAdmission === missing || rawAdmission === undefined || rawAdmission === null) return null;
    const admission = record(rawAdmission), flow = ownerFlow, app = record(ownData(flow, '_app'));
    const manager = record(ownData(root, 'SceneManager')), generation = ownData(admission, 'generation');
    if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 0 || app.stateGeneration !== generation) throw Error('world-battle-scene-bind-stale');
    const entry: Pending = { flow, app, manager, operation: op, generation, admission };
    if (!pendingCurrent(entry)) throw Error('world-battle-scene-bind-stale');
    return entry;
  };
  const bind = (scene: object, pending: Pending): void => {
    record(scene);
    const entry: Entry = { ...pending, prototype: Object.getPrototypeOf(scene) };
    // The official App generation query precedes the final pure native data checks.
    entry.reservationGuard?.();
    if (entry.app.stateGeneration !== entry.generation || !pendingCurrent(entry) || ownData(scene, '_psOp') !== entry.operation) throw Error('world-battle-scene-bind-stale');
    entry.reservationGuard?.(); issued.set(scene, entry);
  };
  return {
    /** The sole composition reserves the existing constructor book for this genuine queued operation. */
    prepareHandoff(operation: object): void {
      const entry = capture(operation); if (!entry || !captureReservation) throw Error('world-battle-handoff-unavailable');
      const player = record(ownData(root, '$gamePlayer')), guard = captureReservation(player);
      if (typeof guard !== 'function' || nativeIsProxy(guard)) throw Error('world-battle-handoff-guard-invalid');
      guard(); if (!pendingCurrent(entry)) throw Error('world-battle-handoff-stale');
      constructions.set(operation, { ...entry, reservationGuard: guard });
    },
    hasQueuedHandoff(operation: object): boolean { return constructions.has(operation); },
    /** Pure final queued identity plus the original native reserve-epoch guard; no caller boolean. */
    assertHandoff(operation: object): void {
      const entry = constructions.get(operation);
      if (!entry || !pendingCurrent(entry)) throw Error('world-battle-handoff-stale');
      entry.reservationGuard?.(); if (!pendingCurrent(entry)) throw Error('world-battle-handoff-stale');
    },
    /** The original constructor captures before calling any public/overridable initializer. */
    beginConstruction(): object | null {
      const operation = ownData(ownerFlow, '_op');
      const queued = operation && typeof operation === 'object' ? constructions.get(operation) : undefined;
      const entry = queued ?? capture(operation); if (!entry) return null;
      if (queued) { if (queued.constructionStarted) throw Error('world-battle-handoff-already-constructed'); queued.constructionStarted = true; entry.reservationGuard?.(); if (!pendingCurrent(entry)) throw Error('world-battle-handoff-stale'); }
      const token = Object.freeze({}); constructions.set(token, entry); return token;
    },
    /** One-use ticket; public initialize never receives or creates one. */
    bindConstruction(scene: object, token: object): void {
      const entry = constructions.get(token); constructions.delete(token);
      if (!entry) throw Error('world-battle-scene-construction-stale');
      bind(scene, entry);
    },
    /** Direct leaf seam for independent host fixtures; production uses the one-use constructor ticket. */
    bind(scene: object, operation: unknown): void { const entry = capture(operation); if (entry) bind(scene, entry); },
    assertCurrent(admission: WorldBattleAdmission, scene: object): void {
      const entry = issued.get(scene);
      if (!entry || !current(entry, admission, scene)) throw Error('world-battle-scene-stale');
      entry.reservationGuard?.();
      if (entry.app.stateGeneration !== entry.generation || !current(entry, admission, scene)) throw Error('world-battle-scene-stale');
      entry.reservationGuard?.();
    },
  };
}
