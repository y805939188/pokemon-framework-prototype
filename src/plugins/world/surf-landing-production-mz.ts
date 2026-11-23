/** One installed START instance owns this landing registry. No public DTO issues a receipt. */
import { semanticFingerprint } from '../../framework/rules/semantic';
import type { OwnedSurfLandingProof, OwnedSurfLandingHold, OwnedSurfLandingBound } from '../../framework/app/surf-landing-ports';
import type { WorldMovementStartLifecycle, MovementStartNativeCell } from '../../framework/app/movement-start-ports';
import type { WorldTravelLeaseSource } from '../../framework/app/ports';
import type { MovementStartProductionRead } from './movement-start-production-mz';
import { readNativeTravelLease } from './travel-lease-registry-mz';
type JumpProof = Extract<WorldMovementStartLifecycle, { kind: 'jump' }>;
type Method = (this: unknown, ...args: unknown[]) => unknown;
interface Candidate {
  readonly context: object; readonly holdStart: (proof: JumpProof, sameMotion: () => boolean) => OwnedSurfLandingHold;
  phase: 'waiting' | 'moving' | 'issued' | 'bound' | 'consumed' | 'retired';
  start?: JumpProof; hold?: OwnedSurfLandingHold; boundHold?: OwnedSurfLandingHold; epoch?: object; proof?: OwnedSurfLandingProof;
  startedFrame: number; completedFrame: number; observedNativeEnd: boolean;
  failedWait?: (receipt: object | null) => void;
}
interface Options extends MovementStartProductionRead {
  root: Record<string, unknown>; source: WorldTravelLeaseSource; isProxy(value: unknown): boolean;
  publish(proof: OwnedSurfLandingProof): OwnedSurfLandingProof;
}
export function createOwnedSurfLandingProduction(options: Options) {
  const { root, source, isProxy } = options;
  const contexts = new WeakMap<object, Candidate>(), receipts = new WeakMap<object, Candidate>(), live = new Set<Candidate>();
  const frameSerial = new WeakMap<object, number>(), mapUpdating = new WeakSet<object>(), motions = new WeakMap<object, object>();
  const ref = (value: unknown): object => { if (value === null || typeof value !== 'object' && typeof value !== 'function' || isProxy(value)) throw Error('surf-landing-native-reference-required'); return value; };
  const own = (owner: object, key: string): unknown => { const d = Object.getOwnPropertyDescriptor(ref(owner), key); if (!d || !('value' in d)) throw Error('surf-landing-native-own-required:'+key); return d.value; };
  const number = (value: unknown): number => { if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('surf-landing-native-number-required'); return value; };
  const retire = (row: Candidate): void => { row.phase = 'retired'; live.delete(row); const resolve = row.failedWait; delete row.failedWait; resolve?.(null); };
  const current = (row: Candidate): JumpProof => {
    const start = row.start, snapshot = readNativeTravelLease(source), state = options.readState();
    if (!start || !row.epoch || !snapshot || snapshot.current !== null || snapshot.nativeEpoch !== row.epoch || snapshot.movementStart !== start
      || snapshot.mapBirth?.birth !== start.birth || snapshot.mapBirth.queue !== start.queue || snapshot.mapBirth.scene !== start.scene
      || !state || state.application !== start.application || state.application.stateGeneration !== start.generation
      || (options.ownedContentIdentity?.(state.content) ?? semanticFingerprint(state.content)) !== start.contentIdentity || own(root, 'SceneManager') !== start.manager
      || own(start.manager, '_scene') !== start.scene || own(start.manager, '_nextScene') !== null
      || own(start.scene, '_started') !== true || own(start.scene, '_active') !== true || own(root, '$gameMap') !== start.map
      || own(root, '$gamePlayer') !== start.player || own(root, '$dataMap') !== start.data || own(start.map, '_mapId') !== start.mapId
      || own(start.player, '_x') !== start.to.x || own(start.player, '_y') !== start.to.y || own(start.player, '_transferring') !== false
      || own(start.data, 'width') !== start.geometry.width || own(start.data, 'height') !== start.geometry.height || own(start.data, 'scrollType') !== start.geometry.scrollType) throw Error('surf-landing-source-retired');
    for (const cell of start.cells) {
      ref(cell.owner); const descriptor = Object.getOwnPropertyDescriptor(cell.owner, cell.key);
      if (Object.getPrototypeOf(cell.owner) !== cell.prototype || (!cell.present ? descriptor !== undefined : !descriptor || !('value' in descriptor) || !Object.is(descriptor.value, cell.value))) throw Error('surf-landing-native-profile-retired');
    }
    return start;
  };
  const findMethod = (object: object, key: string): Method => {
    for (let at: object | null = object; at; at = Object.getPrototypeOf(at) as object | null) { ref(at); const d = Object.getOwnPropertyDescriptor(at, key); if (!d) continue; if ('value' in d && typeof d.value === 'function' && !isProxy(d.value)) return d.value as Method; break; }
    throw Error('surf-landing-native-method-required:'+key);
  };
  const issue = (row: Candidate): object => {
    try {
  if (row.phase !== 'moving' || !row.hold || !row.observedNativeEnd || row.completedFrame <= row.startedFrame) throw Error('surf-landing-native-not-completed');
  const start = current(row), cells: MovementStartNativeCell[] = [];
  for (const key of ['_x', '_y', '_realX', '_realY', '_jumpCount']) {
    const value = number(own(start.player, key));
    if (key === '_jumpCount' ? value !== 0 : value !== (key.endsWith('X') || key === '_x' ? start.to.x : start.to.y)) throw Error('surf-landing-motion-not-idle');
    cells.push(Object.freeze({ owner: start.player, prototype: Object.getPrototypeOf(start.player) as object | null, key, present: true, value }));
  }
  const receipt = Object.freeze({}); row.proof = options.publish(Object.freeze({ receipt, context: row.context, start, epoch: row.epoch!, frame: Object.freeze({}), cells: Object.freeze(cells) }));
  row.phase = 'issued'; receipts.set(receipt, row); live.delete(row); return receipt;
    } catch (error) { retire(row); throw error; }
  };
  let installed = false;
  const install = (): void => {
    if (installed) return;
  const playerPrototype = ref(own(ref(own(root, 'Game_Player')), 'prototype')) as Record<string, unknown>;
  const mapPrototype = ref(own(ref(own(root, 'Scene_Map')), 'prototype')) as Record<string, unknown>;
  const updateJump = findMethod(playerPrototype, 'updateJump'), updateMap = findMethod(mapPrototype, 'update');
  playerPrototype.updateJump = function(this: unknown, ...args: unknown[]): unknown {
    const relevant = [...live].filter(row => row.phase === 'moving' && row.start?.player === this);
    if (!relevant.length) return Reflect.apply(updateJump, this, args);
    let before: unknown; try { before = Object.getOwnPropertyDescriptor(this, '_jumpCount')?.value; } catch { /* Observation cannot replace native execution. */ }
    const result = Reflect.apply(updateJump, this, args);
    for (const row of relevant) {
      try { const start = current(row), after = number(own(start.player, '_jumpCount')); if (typeof before === 'number' && before > 0 && after === 0 && mapUpdating.has(start.scene)) row.observedNativeEnd = true; }
      catch { retire(row); }
    }
    return result;
  };
  mapPrototype.update = function(this: object, ...args: unknown[]): unknown {
    if (![...live].some(row => row.phase === 'moving' && row.start?.scene === this)) return Reflect.apply(updateMap, this, args);
    mapUpdating.add(this); let result: unknown;
    try { result = Reflect.apply(updateMap, this, args); }
    catch (error) { for (const row of [...live]) if (row.start?.scene === this) { retire(row); try { row.hold?.cancel(); } catch { /* Preserve the original native exception. */ } } throw error; }
    finally { mapUpdating.delete(this); }
    const serial = (frameSerial.get(this) ?? 0) + 1; frameSerial.set(this, serial);
    for (const row of [...live]) if (row.phase === 'moving' && row.start?.scene === this && row.observedNativeEnd) { row.completedFrame = serial; const resolve = row.failedWait; if (resolve) { delete row.failedWait; try { resolve(issue(row)); } catch { resolve(null); } } }
    return result;
  };
    const manager = ref(own(root, 'SceneManager')) as Record<string, unknown>, updateScene = findMethod(manager, 'updateScene');
    manager.updateScene = function(this: unknown, ...args: unknown[]): unknown {
      const result = Reflect.apply(updateScene, this, args);
      for (const row of [...live]) if (row.phase === 'moving') { try { current(row); } catch { retire(row); try { row.hold?.cancel(); } catch { /* Native update result stays original. */ } } }
      return result;
    };
    installed = true;
  };
  const lookup = (context: object, receipt: unknown): Candidate => {
    if (!receipt || typeof receipt !== 'object' || isProxy(receipt)) throw Error('surf-landing-receipt-required');
    const row = receipts.get(receipt); if (!row || row.context !== context || !row.proof) throw Error('surf-landing-receipt-unissued'); return row;
  };
  const boundHold = (row: Candidate): OwnedSurfLandingHold => {
    if (row.boundHold) return row.boundHold;
    const native = row.hold; if (!native) throw Error('surf-landing-native-hold-unavailable');
    row.boundHold = Object.freeze({ entry: native.entry,
      prepare(id: string) {
        try { current(row); } catch (error) { retire(row); throw error; }
        try { const result = native.prepare(id); current(row); return result; }
        catch (error) {
          // A resource/preparation refusal with the same certified source still
          // owes one terminal arrival. Only a retired source cancels the hold.
          try { current(row); } catch { retire(row); }
          throw error;
        }
      },
      arrivalOnly(ticket: object): void { try { if (row.phase === 'retired') { native.cancel(); return; } current(row); } catch { retire(row); native.cancel(); return; } retire(row); native.arrivalOnly(ticket); },
      cancel(): void { retire(row); native.cancel(); },
    });
    return row.boundHold;
  };
  return Object.freeze({
    motionStarted(receiver: unknown): void {
      try { if (receiver && (typeof receiver === 'object' || typeof receiver === 'function') && !isProxy(receiver) && own(root, '$gamePlayer') === receiver) motions.set(receiver, Object.freeze({})); } catch { /* Readonly identity observation cannot replace native movement. */ }
    },
    begin(context: object, holdStart: (proof: JumpProof, sameMotion: () => boolean) => OwnedSurfLandingHold) {
      ref(context); install(); if (contexts.has(context)) throw Error('surf-landing-context-reused');
      const row: Candidate = { context, holdStart, phase: 'waiting', startedFrame: 0, completedFrame: 0, observedNativeEnd: false };
      contexts.set(context, row); live.add(row);
      return Object.freeze({
        finish(): object {
          return issue(row);
        },
        failure(): Promise<object | null> {
          if (row.phase === 'bound' || row.phase === 'consumed' || row.phase === 'retired' || !row.start) return Promise.resolve(null);
          if (row.phase === 'issued') return Promise.resolve(row.proof!.receipt);
          try { current(row); if (row.observedNativeEnd && row.completedFrame > row.startedFrame) return Promise.resolve(issue(row)); }
          catch { retire(row); return Promise.resolve(null); }
          return new Promise(resolve => { row.failedWait = resolve; });
        },
        cancel(): void {
          // A registered, genuinely completed hold belongs to the Core terminal
          // settlement now; do not swallow its arrival on a later finisher refusal.
          if (row.phase === 'bound' || row.phase === 'consumed') { try { current(row); return; } catch { /* Retired source never replays arrival. */ } }
          retire(row); row.hold?.cancel();
        },
      });
    },
    started(context: object, proof: WorldMovementStartLifecycle | null): void {
      const row = contexts.get(context); if (!row) return;
      if (row.phase !== 'waiting' || proof?.kind !== 'jump' || proof.parentContext !== context) throw Error('surf-landing-start-unissued');
      // Canonical START already accepted. Mechanical hold is first: no provider reads before it.
      const motion = motions.get(proof.player);
      const sameMotion = (): boolean => { try { return !!motion && motions.get(proof.player) === motion && own(root, '$gamePlayer') === proof.player
        && own(root, '$gameMap') === proof.map && own(root, '$dataMap') === proof.data && own(proof.manager, '_scene') === proof.scene
        && own(proof.player, '_x') === proof.to.x && own(proof.player, '_y') === proof.to.y; } catch { return false; } };
      row.hold = row.holdStart(proof, sameMotion); row.start = proof; row.phase = 'moving';
      try { const snapshot = readNativeTravelLease(source); if (!snapshot?.nativeEpoch || snapshot.movementStart !== proof || number(own(proof.player, '_jumpCount')) <= 0) throw Error('surf-landing-start-motion-required'); row.epoch = snapshot.nativeEpoch; row.startedFrame = frameSerial.get(proof.scene) ?? 0; current(row); }
      catch (error) { retire(row); row.hold.cancel(); throw error; }
    },
    register(context: object, receipt: unknown): OwnedSurfLandingBound {
      const row = lookup(context, receipt);
      if (row.phase !== 'issued' || !row.hold) throw Error('surf-landing-receipt-not-issued');
      try { current(row); row.phase = 'bound'; return Object.freeze({ proof: row.proof!, hold: boundHold(row) }); }
      catch (error) { retire(row); throw error; }
    },
    take(context: object, receipt: unknown): OwnedSurfLandingBound {
      const row = lookup(context, receipt);
      if (row.phase !== 'bound' || !row.hold) throw Error('surf-landing-receipt-consumed');
      row.phase = 'consumed';
      try { current(row); return Object.freeze({ proof: row.proof!, hold: boundHold(row) }); }
      catch (error) { retire(row); throw error; }
    },
  });
}
