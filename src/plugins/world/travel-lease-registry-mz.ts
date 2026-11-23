import type { OwnedSurfLandingProof } from '../../framework/app/surf-landing-ports';
/** Native transfer authority. Only the opaque registered source crosses the composition seam. */
import type { WorldTravelLeaseSource, WorldTravelLeaseCurrent, WorldTravelLeaseSnapshot, WorldMapBirthLifecycle, WorldBlackoutSourceLifecycle, WorldCompanionPreparedOriginLifecycle } from '../../framework/app/ports';
import type { WorldCompanionNativeTransferLifecycle } from '../../framework/app/event-companion-lifecycle-ports';
import type { WorldMovementStartLifecycle } from '../../framework/app/movement-start-ports';
import { readPreparedCompanionOrigin } from './event-companion-production-source-mz';
const readCompanionOrigin = readPreparedCompanionOrigin;
interface Registry { snapshot: WorldTravelLeaseSnapshot }
const registries = new WeakMap<object, Registry>();
/** Known closed reader for the native atomic adapter. No host callbacks, getters, or DTO cells. */
export function readNativeTravelLease(source: object): WorldTravelLeaseSnapshot | undefined {
  return registries.get(source)?.snapshot;
}
/** Publishers stay in the actual transfer host closure. They describe already-verified native
 * observations; neither the public source nor a read snapshot exposes a publication capability. */
export function createNativeTravelLeaseRegistry(): {
  readonly source: WorldTravelLeaseSource;
  readonly publish: (current: WorldTravelLeaseCurrent | null) => void;
  readonly publishMapBirth: (current: WorldMapBirthLifecycle | null) => WorldMapBirthLifecycle | null;
  readonly publishSourceHandoff: (current: WorldBlackoutSourceLifecycle | null) => WorldBlackoutSourceLifecycle | null;
  readonly publishSurfLanding: (current: OwnedSurfLandingProof) => OwnedSurfLandingProof;
  readonly publishMovementStart: (current: WorldMovementStartLifecycle | null) => WorldMovementStartLifecycle | null;
  readonly publishCompanionPreparedOrigin: (source: object, origin: object) => WorldCompanionPreparedOriginLifecycle;
  readonly retireCompanionPreparedOrigin: (expected: WorldCompanionPreparedOriginLifecycle) => boolean;
  readonly publishCompanionTransfer: (current: WorldCompanionNativeTransferLifecycle) => WorldCompanionNativeTransferLifecycle;
  readonly retireCompanionTransfer: (expected: WorldCompanionNativeTransferLifecycle) => boolean;
} {
  const source = Object.freeze({}) as WorldTravelLeaseSource;
  let nativeEpoch: object = Object.freeze({});
  const freezeSnapshot = (value: WorldTravelLeaseSnapshot): WorldTravelLeaseSnapshot => {
    // A data cell, never a getter. Preserve older enumerable E3 snapshot shape.
    Object.defineProperty(value, 'nativeEpoch', { value: nativeEpoch, enumerable: false });
    return Object.freeze(value);
  };
  const registry: Registry = { snapshot: freezeSnapshot({ registry: source, current: null }) };
  let mapBirth: WorldMapBirthLifecycle | null | undefined;
  let sourceHandoff: WorldBlackoutSourceLifecycle | null | undefined;
  let movementStart: WorldMovementStartLifecycle | null | undefined;
  let surfLanding: OwnedSurfLandingProof | null | undefined;
  const landingReceipts = new WeakSet<object>();
  let companionPreparedOrigin: WorldCompanionPreparedOriginLifecycle | null | undefined;
  let companionTransfer: WorldCompanionNativeTransferLifecycle | null | undefined;
  const transferObservations = new WeakSet<object>(), transferSerials = new WeakSet<object>();
  const revokeCompanionTransfer = (): void => { if (companionTransfer !== undefined) companionTransfer = null; };
  const permits = new WeakSet<object>(), observations = new WeakSet<object>();
  const companionOrigins = new WeakSet<object>();
  const revokeMovement = (): void => { if (movementStart !== undefined) movementStart = null; if (surfLanding !== undefined) surfLanding = null; };
  const revokeCompanionOrigin = (): void => { if (companionPreparedOrigin !== undefined) companionPreparedOrigin = null; };
  const replace = (current: WorldTravelLeaseCurrent | null): void => {
    registry.snapshot = freezeSnapshot({ registry: source, current,
      ...(mapBirth === undefined ? {} : { mapBirth }), ...(sourceHandoff === undefined ? {} : { sourceHandoff }),
      ...(movementStart === undefined ? {} : { movementStart }),
      ...(surfLanding === undefined ? {} : { surfLanding }),
      ...(companionPreparedOrigin === undefined ? {} : { companionPreparedOrigin }),
      ...(companionTransfer === undefined ? {} : { companionTransfer }) });
  };
  registries.set(source, registry);
  return Object.freeze({ source,
    publish(current: WorldTravelLeaseCurrent | null): void {
      const next = current === null ? null : Object.freeze({ ...current });
      revokeMovement();
      revokeCompanionOrigin();
      revokeCompanionTransfer();
      nativeEpoch = Object.freeze({}); replace(next);
    },
    publishMapBirth(current: WorldMapBirthLifecycle | null): WorldMapBirthLifecycle | null {
      revokeMovement();
      revokeCompanionOrigin();
      revokeCompanionTransfer();
      mapBirth = current === null ? null : Object.freeze({ manager: current.manager, scene: current.scene, birth: current.birth, queue: current.queue,
        frame: current.frame === null ? null : Object.freeze({ map: current.frame.map, mapId: current.frame.mapId, player: current.frame.player, data: current.frame.data }) });
      // An issued old record is not current authority. Advancing/clearing the native observation
      // revokes any source claim still pointing at its predecessor, even when birth tokens match.
      if (sourceHandoff?.target && sourceHandoff.target !== mapBirth) sourceHandoff = null;
      nativeEpoch = Object.freeze({}); replace(registry.snapshot.current); return mapBirth;
    },
    publishSourceHandoff(current: WorldBlackoutSourceLifecycle | null): WorldBlackoutSourceLifecycle | null {
      if (current !== null && (current.target !== null && current.target !== mapBirth ||
        current.phase === 'ready' && (current.target === null || current.target.frame === null))) throw Error('native-source-current-birth-required');
      revokeMovement();
      revokeCompanionOrigin();
      revokeCompanionTransfer();
      sourceHandoff = current === null ? null : Object.freeze({ owner: current.owner, context: current.context, generation: current.generation,
        serial: current.serial, sourceScene: current.sourceScene, phase: current.phase, target: current.target });
      nativeEpoch = Object.freeze({}); replace(registry.snapshot.current); return sourceHandoff;
    },
    publishSurfLanding(current) {
      if (!movementStart || movementStart.kind !== 'jump' || current.start !== movementStart || current.context !== movementStart.parentContext
        || !mapBirth?.frame || current.epoch !== nativeEpoch || current.start.birth !== mapBirth.birth || current.start.queue !== mapBirth.queue
        || current.receipt === null || typeof current.receipt !== 'object' || landingReceipts.has(current.receipt) || !Array.isArray(current.cells) || !current.cells.length) throw Error('native-surf-landing-unissued');
      landingReceipts.add(current.receipt);
      surfLanding = Object.freeze({ ...current, cells: Object.freeze(current.cells.map(cell => Object.freeze({ ...cell }))) });
      replace(registry.snapshot.current); return surfLanding;
    },
    publishMovementStart(current: WorldMovementStartLifecycle | null): WorldMovementStartLifecycle | null {
      if (surfLanding !== undefined) surfLanding = null;
      if (current === null) { movementStart = null; replace(registry.snapshot.current); return null; }
      if (current.kind !== 'straight' && current.kind !== 'jump' && current.kind !== 'connection') throw Error('native-movement-kind-required');
      for (const token of [current.permit, current.observation]) {
        if (token === null || typeof token !== 'object' && typeof token !== 'function') throw Error('native-movement-opaque-token-required');
      }
      const frame = mapBirth?.frame, physical = registry.snapshot.current;
      const connection = current.kind === 'connection';
      if (connection ? !physical || physical.phase !== 'arrived' || physical.receipt !== current.parentContext
        || physical.lease !== current.physicalLease || physical.serial !== current.physicalSerial
        || physical.player !== current.player || physical.scene !== current.scene
        : physical !== null) throw Error('native-movement-current-parent-required');
      if (!mapBirth || !connection && !frame
        || current.manager !== mapBirth.manager || current.scene !== mapBirth.scene
        || current.birth !== mapBirth.birth || current.queue !== mapBirth.queue
        || frame !== null && frame !== undefined && (current.map !== frame.map || current.mapId !== frame.mapId || current.player !== frame.player || current.data !== frame.data)) {
        throw Error('native-movement-current-birth-required');
      }
      if (permits.has(current.permit) || observations.has(current.observation)) throw Error('native-movement-proof-reused');
      // This capability stays in the native producer closure. Copy its typed observation,
      // freezing guard rows while retaining actual native/opaque identities by reference.
      const common = { ...current, from: Object.freeze({ ...current.from }), to: Object.freeze({ ...current.to }),
        geometry: Object.freeze({ ...current.geometry }), mode: Object.freeze({ ...current.mode }),
        cells: Object.freeze(current.cells.map(cell => Object.freeze({ ...cell }))) };
      const candidate: WorldMovementStartLifecycle = Object.freeze(current.kind === 'jump' ? { ...common, kind: 'jump', offset: Object.freeze({ ...current.offset }) }
        : current.kind === 'connection' ? { ...common, kind: 'connection', direction: current.direction, parentContext: current.parentContext,
          sourceMapId: current.sourceMapId, physicalLease: current.physicalLease, physicalSerial: current.physicalSerial }
        : { ...common, kind: 'straight', direction: current.direction });
      permits.add(current.permit); observations.add(current.observation);
      movementStart = candidate;
      replace(registry.snapshot.current); return movementStart;
    },
    publishCompanionPreparedOrigin(source: object, observation: object): WorldCompanionPreparedOriginLifecycle {
      // Only the actual source module's private book can identify this exact observation.
      // No caller DTO field, public method, or returned callback is consulted here.
      const origin = readCompanionOrigin(source, observation), frame = mapBirth?.frame;
      if (!origin || !mapBirth || !frame || registry.snapshot.current !== null
        || mapBirth.scene !== origin.scene || frame.map !== origin.map || frame.mapId !== origin.mapId
        || frame.player !== origin.player || frame.data !== origin.data) throw Error('native-companion-origin-current-birth-required');
      if (companionPreparedOrigin?.source === source && companionPreparedOrigin.origin === origin) return companionPreparedOrigin;
      if (companionOrigins.has(origin)) throw Error('native-companion-origin-reused');
      companionPreparedOrigin = Object.freeze({ source, origin, prepared: origin.prepared, application: origin.application,
        generation: origin.generation, actionIdentity: origin.actionIdentity, epoch: nativeEpoch, manager: mapBirth.manager, scene: origin.scene,
        birth: mapBirth.birth, queue: mapBirth.queue, map: origin.map, mapId: origin.mapId, player: origin.player, data: origin.data });
      companionOrigins.add(origin); replace(registry.snapshot.current); return companionPreparedOrigin;
    },
    publishCompanionTransfer(current: WorldCompanionNativeTransferLifecycle): WorldCompanionNativeTransferLifecycle {
      // Only the existing transfer host closure calls this capability after its original unowned
      // explicit reserve was consumed. Cause classification is never inferred from this DTO.
      const frame = mapBirth?.frame;
      if (registry.snapshot.current !== null || sourceHandoff !== undefined && sourceHandoff !== null
        || current.epoch !== nativeEpoch || !mapBirth || !frame
        || current.manager !== mapBirth.manager || current.scene !== mapBirth.scene || current.birth !== mapBirth.birth || current.queue !== mapBirth.queue
        || current.map !== frame.map || current.mapId !== frame.mapId || current.player !== frame.player || current.data !== frame.data) throw Error('native-companion-transfer-current-birth-required');
      for (const token of [current.observation, current.serial]) {
        if (token === null || typeof token !== 'object' && typeof token !== 'function') throw Error('native-companion-transfer-opaque-token-required');
      }
      if (transferObservations.has(current.observation) || transferSerials.has(current.serial)) throw Error('native-companion-transfer-proof-reused');
      companionTransfer = Object.freeze({ observation: current.observation, serial: current.serial, epoch: nativeEpoch,
        application: current.application, generation: current.generation, game: current.game, gameIdentity: current.gameIdentity,
        content: current.content, contentIdentity: current.contentIdentity, manager: current.manager, sourceScene: current.sourceScene, scene: current.scene,
        birth: current.birth, queue: current.queue, map: current.map, mapId: current.mapId, player: current.player, data: current.data,
        target: Object.freeze({ mapId: current.target.mapId, x: current.target.x, y: current.target.y, direction: current.target.direction }) });
      transferObservations.add(current.observation); transferSerials.add(current.serial);
      replace(registry.snapshot.current); return companionTransfer;
    },
    retireCompanionTransfer(expected: WorldCompanionNativeTransferLifecycle): boolean {
      if (!companionTransfer || companionTransfer !== expected) return false;
      companionTransfer = null; replace(registry.snapshot.current); return true;
    },
    retireCompanionPreparedOrigin(expected: WorldCompanionPreparedOriginLifecycle): boolean {
      if (!companionPreparedOrigin || companionPreparedOrigin !== expected) return false;
      companionPreparedOrigin = null; replace(registry.snapshot.current); return true;
    },
  });
}
