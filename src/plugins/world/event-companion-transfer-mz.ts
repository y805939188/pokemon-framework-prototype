/** One actual unowned native reserve/perform observation; no parallel transfer queue. */
import { semanticFingerprint } from '../../framework/rules/semantic';
import type { Content } from '../../framework/rules/types';
import type { GameState } from '../../framework/rules/state';
import type { CompanionResult } from '../../framework/app/event-companion-operation';
import type { WorldCompanionNativeTransferLifecycle } from '../../framework/app/event-companion-lifecycle-ports';
import type { WorldTravelLeaseSource } from '../../framework/app/ports';
import { readNativeTravelLease } from './travel-lease-registry-mz';
interface Current { readonly application: { readonly stateGeneration: number; completeNativeCompanionTransfer(observation: unknown): Promise<CompanionResult> }; readonly game: GameState; readonly content: Content }
export interface CompanionTransferMZOptions {
  readonly root: Record<string, unknown>; readonly source: WorldTravelLeaseSource; readonly isProxy: (value: unknown) => boolean;
  readState(): Current | null;
  isCurrentLoad(application: object): boolean;
  installed(): void;
  captureReservationGuard(player: object): () => void;
  publish(record: WorldCompanionNativeTransferLifecycle): WorldCompanionNativeTransferLifecycle;
  retire(record: WorldCompanionNativeTransferLifecycle): boolean;
  diagnostic(reason: string): void;
}
export interface CompanionTransferMZ {
  reserved(player: object, serial: object, owned: boolean, args: readonly unknown[]): void;
  beforePerform(player: object, serial: object | null, owned: boolean): (() => void) | null;
  /** Called after the real Map.isReady/load witness, before Map.start/autosave. */
  ready(): boolean;
  pending(): boolean;
  invalidate(): void;
}
interface Entry {
  readonly application: Current['application']; readonly generation: number; readonly content: Content; readonly contentIdentity: string;
  readonly player: object; readonly serial: object; readonly sourceScene: object;
  readonly mapId: number; readonly x: number; readonly y: number; readonly direction: number;
  readonly guard: () => void;
  phase: 'reserved' | 'consumed' | 'committing' | 'settled';
  data: object | null; map: object | null; scene: object | null; birth: object | null; queue: object | null;
  proof: WorldCompanionNativeTransferLifecycle | null;
}
export function createCompanionTransferMZ(options: CompanionTransferMZOptions): CompanionTransferMZ {
  const { root, isProxy } = options;
  const object = (v: unknown): object => { if (v === null || typeof v !== 'object' && typeof v !== 'function' || isProxy(v)) throw Error('companion-transfer-native-object-required'); return v; };
  const own = (v: unknown, k: string): unknown => { const d = Object.getOwnPropertyDescriptor(object(v), k); if (!d || !('value' in d)) throw Error(`companion-transfer-native-own-data-required:${k}`); return d.value; };
  const integer = (v: unknown): number => { if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw Error('companion-transfer-native-integer-required'); return v; };
  const fn = (v: object, k: string): ((...args: unknown[]) => unknown) => {
    for (let p: object | null = v; p; p = Object.getPrototypeOf(p) as object | null) {
      object(p); const d = Object.getOwnPropertyDescriptor(p, k); if (!d) continue;
      if ('value' in d && typeof d.value === 'function' && !isProxy(d.value)) return d.value as (...args: unknown[]) => unknown;
      break;
    } throw Error('companion-transfer-application-method-required');
  };
  let entry: Entry | null = null;
  const note = (error: unknown): void => { try { options.diagnostic(error instanceof Error ? error.message : 'companion-transfer-source-unavailable'); } catch { /* Diagnostic only. */ } };
  const close = (e: Entry): void => { if (entry === e) entry = null; if (e.proof) options.retire(e.proof); };
  const check = (e: Entry): Current => {
    e.guard(); const now = options.readState();
    if (entry !== e || !now || now.application !== e.application || now.application.stateGeneration !== e.generation || now.content !== e.content
      || semanticFingerprint(now.content) !== e.contentIdentity || own(root, '$gamePlayer') !== e.player) throw Error('companion-transfer-source-changed');
    e.guard(); return now;
  };
  return Object.freeze<CompanionTransferMZ>({
    reserved(player, serial, owned, args) {
      const previous = entry; entry = null; if (previous?.proof) options.retire(previous.proof);
      if (owned) return;
      try {
        const actual = options.readState(), manager = object(own(root, 'SceneManager')), sourceScene = object(own(manager, '_scene'));
        if (!actual || own(root, '$gamePlayer') !== player) return;
        if (options.isCurrentLoad(actual.application)) { note(Error('companion-transfer-excluded-formal-load')); return; }
        if (own(player, '_needsMapReload') !== false) { note(Error('companion-transfer-excluded-map-reload')); return; }
        const mapId = integer(args[0]), x = integer(args[1]), y = integer(args[2]), direction = integer(args[3]);
        if (mapId <= 0 || x < 0 || y < 0 || ![0, 2, 4, 6, 8].includes(direction) || own(player, '_transferring') !== true
          || own(player, '_newMapId') !== mapId || own(player, '_newX') !== x || own(player, '_newY') !== y || own(player, '_newDirection') !== direction) return;
        const guard = options.captureReservationGuard(player), generation = actual.application.stateGeneration;
        if (!Number.isSafeInteger(generation) || generation < 0) return;
        const e: Entry = { application: actual.application, generation, content: actual.content, contentIdentity: semanticFingerprint(actual.content),
          player, serial, sourceScene, mapId, x, y, direction, guard, phase: 'reserved', data: null, map: null, scene: null, birth: null, queue: null, proof: null };
        entry = e; check(e);
      } catch (error) { if (entry?.serial === serial) entry = null; note(error); }
    },
    beforePerform(player, serial, owned) {
      const e = entry; if (!e || owned || e.player !== player || e.serial !== serial || e.phase !== 'reserved') return null;
      try {
        check(e);
        // reloadMapIfUpdated sets this flag after reserveTransfer, so classification must be repeated here.
        if (options.isCurrentLoad(e.application) || own(player, '_needsMapReload') !== false || own(player, '_transferring') !== true) { close(e); return null; }
        const data = object(own(root, '$dataMap'));
        return () => {
          try {
            check(e);
            const map = object(own(root, '$gameMap')), manager = object(own(root, 'SceneManager')), scene = object(own(manager, '_scene'));
            const birth = readNativeTravelLease(options.source)?.mapBirth;
            if (own(player, '_transferring') !== false || own(map, '_mapId') !== e.mapId || own(player, '_x') !== e.x || own(player, '_y') !== e.y
              || e.direction !== 0 && own(player, '_direction') !== e.direction || own(root, '$dataMap') !== data || !birth
              || birth.manager !== manager || birth.scene !== scene) throw Error('companion-transfer-native-not-consumed');
            e.data = data; e.map = map; e.scene = scene; e.birth = birth.birth; e.queue = birth.queue; e.phase = 'consumed';
          } catch (error) { close(e); note(error); }
        };
      } catch (error) { close(e); note(error); return null; }
    },
    ready() {
      const e = entry; if (!e || e.phase === 'reserved' || e.phase === 'settled') return true;
      if (e.phase === 'committing') return false;
      try {
        const actual = check(e), snapshot = readNativeTravelLease(options.source), birth = snapshot?.mapBirth, frame = birth?.frame;
        const manager = object(own(root, 'SceneManager'));
        if (!snapshot || snapshot.current !== null || snapshot.sourceHandoff || !birth || !frame || !snapshot.nativeEpoch
          || birth.manager !== manager || birth.scene !== e.scene || birth.birth !== e.birth || birth.queue !== e.queue
          || own(manager, '_scene') !== e.scene || own(manager, '_nextScene') !== null || frame.map !== e.map || frame.data !== e.data
          || frame.player !== e.player || frame.mapId !== e.mapId || own(root, '$dataMap') !== e.data || own(root, '$gameMap') !== e.map
          || own(e.player, '_transferring') !== false || own(e.player, '_x') !== e.x || own(e.player, '_y') !== e.y) throw Error('companion-transfer-loaded-source-changed');
        const direction = integer(own(e.player, '_direction')); if (![2, 4, 6, 8].includes(direction)) throw Error('companion-transfer-direction-invalid');
        const method = fn(e.application, 'completeNativeCompanionTransfer'); check(e);
        const proof = options.publish({ observation: Object.freeze({}), serial: e.serial, epoch: snapshot.nativeEpoch,
          application: e.application, generation: e.generation, game: actual.game, gameIdentity: semanticFingerprint(actual.game),
          content: e.content, contentIdentity: e.contentIdentity, manager, sourceScene: e.sourceScene, scene: e.scene!, birth: e.birth!, queue: e.queue!,
          map: e.map!, mapId: e.mapId, player: e.player, data: e.data!, target: { mapId: e.mapId, x: e.x, y: e.y, direction: direction as 2 | 4 | 6 | 8 } });
        e.proof = proof; e.phase = 'committing';
        // The real App synchronously installs carry/hiding before returning its Promise.
        const result = Reflect.apply(method, e.application, [proof.observation]) as Promise<CompanionResult>;
        check(e); options.installed(); check(e);
        void Promise.resolve(result).then(outcome => {
          if (entry !== e) return;
          try { check(e); if (outcome.status === 'failed' || outcome.status === 'cancelled') note(outcome.status === 'failed' ? Error(outcome.reason) : Error('companion-transfer-cancelled')); }
          catch (error) { note(error); }
          finally { if (entry === e) { e.phase = 'settled'; close(e); } }
        }, error => { if (entry === e) { close(e); note(error); } });
        return false;
      } catch (error) { close(e); note(error); return true; }
    },
    pending() { return entry?.phase === 'consumed' || entry?.phase === 'committing'; },
    invalidate() { const previous = entry; entry = null; if (previous?.proof) options.retire(previous.proof); },
  });
}
