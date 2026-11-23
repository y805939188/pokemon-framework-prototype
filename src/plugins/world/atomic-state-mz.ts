import type { OwnedSurfLandingProof } from '../../framework/app/surf-landing-ports';
/** Native MZ state-slot adapter. Node capability acquisition belongs to the composition root. */
import type { AtomicStateResult, AtomicWorldState, AtomicFieldQueryState, GameStatePort, WorldHostLifecycle, WorldBattleSceneLifecycle, WorldTravelLeaseSource, WorldTravelLeaseSnapshot, WorldMapBirthLifecycle, WorldBlackoutSourceLifecycle, WorldCompanionPreparedOriginLifecycle } from '../../framework/app/ports';
import type { GameState } from '../../framework/rules/state';
import type { Content } from '../../framework/rules/types';
import type { WorldCompanionNativeTransferLifecycle } from '../../framework/app/event-companion-lifecycle-ports';
import type { WorldMovementStartLifecycle } from '../../framework/app/movement-start-ports';
import { readNativeTravelLease } from './travel-lease-registry-mz';
import { readPreparedCompanionOrigin } from './event-companion-production-source-mz';
const readCompanionOrigin = readPreparedCompanionOrigin;

/** Supply the real Node util.types.isProxy function, never a user/plugin predicate. */
export function createMZAtomicStatePort(root: object, legacy: GameStatePort, nativeIsProxy: (value: unknown) => boolean,
  contentSlot?: Readonly<{ owner: object; key: string }>, nativeLeaseSource?: WorldTravelLeaseSource): GameStatePort {
  const record = (value: unknown): object => {
    if (value === null || typeof value !== 'object' || nativeIsProxy(value)) throw Error('atomic-state-unsafe-object');
    return value;
  };
  const data = (target: object, key: string, writable = false): PropertyDescriptor => {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || writable && !descriptor.writable) throw Error('atomic-state-data-slot-required');
    return descriptor;
  };
  record(root);
  // Only this producer module's private WeakMap can register a source. Pin its exact
  // reference; no public owner/key/current configuration is read or replayed.
  const travelLeaseSource = nativeLeaseSource && readNativeTravelLease(nativeLeaseSource) ? nativeLeaseSource : undefined;
  // The composition root binds its actual loaded Content data slot, never a callback or a caller DTO.
  let source: { owner: object; key: string } | undefined;
  if (contentSlot !== undefined) {
    const binding = record(contentSlot), owner = record(data(binding, 'owner').value), key: unknown = data(binding, 'key').value;
    if (typeof key !== 'string' || !key.length) throw Error('atomic-query-invalid-content-slot');
    source = { owner, key };
  }
  const battleScene = (scene: object, manager: object): WorldBattleSceneLifecycle | undefined => {
    // An ordinary Map has no admitted battle. Do not let an unsafe optional Flow mask its native lifecycle.
    if (!Object.getOwnPropertyDescriptor(scene, '_psOp')) return undefined;
    const rawFlow = Object.getOwnPropertyDescriptor(root, 'PSFlow');
    if (!rawFlow) return undefined;
    const flow = record(data(root, 'PSFlow').value);
    if (!Object.getOwnPropertyDescriptor(flow, '_op')) return undefined;
    const rawOperation = data(flow, '_op').value;
    if (rawOperation === null || rawOperation === undefined) return undefined;
    const operation = record(rawOperation), rawAdmission = Object.getOwnPropertyDescriptor(operation, 'worldAdmission');
    if (!rawAdmission || !Object.getOwnPropertyDescriptor(scene, '_psOp')) return undefined; // Legacy battles and a returned Map scene have no active world-scene binding.
    const admission = record(data(operation, 'worldAdmission').value), application = record(data(flow, '_app').value);
    const sceneOperation = record(data(scene, '_psOp').value), running: unknown = data(flow, 'running').value;
    if (typeof running !== 'boolean') throw Error('atomic-state-invalid-battle-running');
    return { flow, manager, prototype: Object.getPrototypeOf(scene) as object | null, application, operation, admission, sceneOperation, running };
  };
  // F reads the real global data slot. Missing/accessor/Proxy values mean no F capability;
  // null is the real native cold-load state. Older atomic/query paths remain usable.
  const mapData = (): object | null | undefined => {
    try {
      const value: unknown = data(root, '$dataMap').value;
      return value === null ? null : record(value);
    } catch { return undefined; }
  };
  // Local trace across legacy.read/prepare. It issues no token and is never exposed as a DTO.
  type ApplicationCapture = Readonly<{ flow: object; application: object; rootPrototype: object | null;
    flowPrototype: object | null; flowCell: PropertyDescriptor; applicationCell: PropertyDescriptor }>;
  const captureApplication = (): ApplicationCapture | undefined => {
    try {
      const flowCell = data(root, 'PSFlow'), flow = record(flowCell.value), applicationCell = data(flow, '_app');
      return { flow, application: record(applicationCell.value), rootPrototype: Object.getPrototypeOf(root) as object | null,
        flowPrototype: Object.getPrototypeOf(flow) as object | null, flowCell, applicationCell };
    } catch { return undefined; }
  };
  const application = (before: ApplicationCapture | undefined): object | undefined => {
    const actual = captureApplication();
    const sameCell = (a: PropertyDescriptor, b: PropertyDescriptor): boolean => a.value === b.value
      && a.writable === b.writable && a.enumerable === b.enumerable && a.configurable === b.configurable;
    return before && actual && before.flow === actual.flow && before.application === actual.application
      && before.rootPrototype === actual.rootPrototype && before.flowPrototype === actual.flowPrototype
      && sameCell(before.flowCell, actual.flowCell) && sameCell(before.applicationCell, actual.applicationCell)
      ? actual.application : undefined;
  };
  const lifecycle = (applicationBefore: ApplicationCapture | undefined): WorldHostLifecycle => {
    const map = record(data(root, '$gameMap').value), player = record(data(root, '$gamePlayer').value);
    const rawManager: unknown = data(root, 'SceneManager').value;
    // MZ's SceneManager is a static function; fixtures may provide a plain object.
    if (rawManager === null || !['object', 'function'].includes(typeof rawManager) || nativeIsProxy(rawManager)) throw Error('atomic-state-unsafe-scene-manager');
    const scene = record(data(rawManager as object, '_scene').value);
    const mapId: unknown = data(map, '_mapId').value;
    if (typeof mapId !== 'number' || !Number.isSafeInteger(mapId) || mapId <= 0) throw Error('atomic-state-invalid-map-id');
    let playerPosition: WorldHostLifecycle['playerPosition'];
    if (Object.getOwnPropertyDescriptor(player, '_x') || Object.getOwnPropertyDescriptor(player, '_y')) {
      const x: unknown = data(player, '_x').value, y: unknown = data(player, '_y').value;
      if (typeof x !== 'number' || !Number.isSafeInteger(x) || typeof y !== 'number' || !Number.isSafeInteger(y)) throw Error('atomic-state-invalid-player-position');
      playerPosition = { x, y };
    }
    let sceneTransition: WorldHostLifecycle['sceneTransition'];
    if (Object.getOwnPropertyDescriptor(rawManager, '_nextScene') && Object.getOwnPropertyDescriptor(scene, '_started')) {
      const rawNext: unknown = data(rawManager as object, '_nextScene').value, started: unknown = data(scene, '_started').value;
      if (typeof started !== 'boolean') throw Error('atomic-state-invalid-scene-started');
      const nextScene = rawNext === null ? null : record(rawNext);
      sceneTransition = { manager: rawManager as object, prototype: Object.getPrototypeOf(scene) as object | null, started,
        nextScene, nextPrototype: nextScene ? Object.getPrototypeOf(nextScene) as object | null : null };
    }
    const owned = battleScene(scene, rawManager as object), loaded = mapData(), actualApplication = application(applicationBefore);
    return { ...(actualApplication === undefined ? {} : { application: actualApplication }), map, mapId, player, scene, ...(loaded === undefined ? {} : { mapData: loaded }), ...(playerPosition ? { playerPosition } : {}), ...(owned ? { battleScene: owned } : {}), ...(sceneTransition ? { sceneTransition } : {}) };
  };
  const travelPlayer = (player: object): WorldHostLifecycle['travelPlayer'] => {
    try {
      const direction: unknown = data(player, '_direction').value, transferring: unknown = data(player, '_transferring').value;
      if (direction !== 2 && direction !== 4 && direction !== 6 && direction !== 8 || typeof transferring !== 'boolean') return undefined;
      if (!transferring) return { direction, transferring, target: null };
      const mapId: unknown = data(player, '_newMapId').value, x: unknown = data(player, '_newX').value,
        y: unknown = data(player, '_newY').value, targetDirection: unknown = data(player, '_newDirection').value;
      if (typeof mapId !== 'number' || !Number.isSafeInteger(mapId) || mapId <= 0
        || typeof x !== 'number' || !Number.isSafeInteger(x) || x < 0
        || typeof y !== 'number' || !Number.isSafeInteger(y) || y < 0
        || targetDirection !== 0 && targetDirection !== 2 && targetDirection !== 4 && targetDirection !== 6 && targetDirection !== 8) return undefined;
      return { direction, transferring, target: { mapId, x, y, direction: targetDirection } };
    } catch { return undefined; } // Optional E3 slots must not change older native capabilities.
  };
  const travelSwitches = (): WorldHostLifecycle['travelSwitches'] => {
    try {
      const owner = record(data(root, '$gameSwitches').value), storage = record(data(owner, '_data').value);
      const values = Object.create(null) as Record<string, boolean>, seen = new Set<string>();
      let current: object | null = storage;
      // Native value(id) reads !!_data[id]. Resolve the first descriptor in its actual
      // prototype chain before treating an absent positive integer key as false.
      while (current !== null) {
        record(current);
        for (const key of Object.getOwnPropertyNames(current)) {
          if (!/^[1-9]\d*$/u.test(key) || !Number.isSafeInteger(Number(key)) || seen.has(key)) continue;
          seen.add(key);
          const cell = Object.getOwnPropertyDescriptor(current, key);
          if (!cell || !Object.hasOwn(cell, 'value')) return undefined;
          const value: unknown = cell.value;
          if (typeof value !== 'boolean' && value !== null && value !== undefined) return undefined;
          values[key] = value === true;
        }
        current = Object.getPrototypeOf(current) as object | null;
      }
      return { owner, data: storage, values: Object.freeze(values) };
    } catch { return undefined; } // Unsafe/missing data is unavailable, never a fabricated false cell.
  };
  const retiredMovements = new WeakSet<object>();
  const retiredCompanionOrigins = new WeakSet<object>();
  const retiredCompanionTransfers = new WeakSet<object>();
  const retireCurrentOptionalObservations = (): void => {
    const snapshot = travelLeaseSource ? readNativeTravelLease(travelLeaseSource) : undefined;
    if (snapshot?.movementStart) retiredMovements.add(snapshot.movementStart);
    if (snapshot?.companionPreparedOrigin) retiredCompanionOrigins.add(snapshot.companionPreparedOrigin.origin);
    if (snapshot?.companionTransfer) retiredCompanionTransfers.add(snapshot.companionTransfer);
  };
  const nativeMovement = (movement: WorldMovementStartLifecycle | null | undefined, birth: WorldMapBirthLifecycle | null | undefined,
    actual: AtomicFieldQueryState, physical: WorldTravelLeaseSnapshot['current']): WorldMovementStartLifecycle | null | undefined => {
    if (!movement) return movement;
    if (retiredMovements.has(movement)) return undefined;
    try {
      const life = actual.lifecycle, manager: unknown = data(root, 'SceneManager').value;
      const reference = (value: unknown): object => {
        if (value === null || typeof value !== 'object' && typeof value !== 'function' || nativeIsProxy(value)) throw Error('atomic-movement-unsafe-reference');
        return value as object;
      };
      const point = (value: Readonly<{ x: number; y: number }>): boolean =>
        Number.isSafeInteger(value.x) && Number.isSafeInteger(value.y) && value.x >= 0 && value.y >= 0
        && value.x < movement.geometry.width && value.y < movement.geometry.height;
      const frame = birth?.frame, geometry = movement.geometry, mode = movement.mode;
      const connection = movement.kind === 'connection';
      // Only the issued arrived connection may observe its genuine target before Scene.start.
      // Surf keeps the ordinary loaded, active same-map native frame. App owns its exact child phase.
      if (connection ? !physical || physical.phase !== 'arrived' || physical.receipt !== movement.parentContext
        || physical.lease !== movement.physicalLease || physical.serial !== movement.physicalSerial
        || physical.player !== movement.player || physical.scene !== movement.scene
        : physical !== null) throw Error('atomic-movement-parent-stale');
      const started: unknown = data(life.scene, '_started').value, active: unknown = data(life.scene, '_active').value;
      if (typeof started !== 'boolean' || typeof active !== 'boolean' || !connection && (!started || !active)) throw Error('atomic-movement-scene-stale');
      if (movement.application !== data(record(data(root, 'PSFlow').value), '_app').value
        || !Number.isSafeInteger(movement.generation) || movement.generation < 0
        || typeof movement.gameIdentity !== 'string' || !movement.gameIdentity.length
        || typeof movement.contentIdentity !== 'string' || !movement.contentIdentity.length
        || manager !== movement.manager || life.scene !== movement.scene
        || data(reference(manager), '_nextScene').value !== null
        || !birth || !connection && !frame || birth.manager !== manager || birth.scene !== life.scene
        || movement.birth !== birth.birth || movement.queue !== birth.queue
        || movement.map !== life.map || movement.mapId !== life.mapId || movement.player !== life.player || movement.data !== life.mapData
        || frame !== null && frame !== undefined && (frame.map !== life.map || frame.mapId !== life.mapId || frame.player !== life.player || frame.data !== life.mapData)
        || !life.playerPosition || movement.to.x !== life.playerPosition.x || movement.to.y !== life.playerPosition.y
        || !Number.isSafeInteger(geometry.width) || geometry.width <= 0 || !Number.isSafeInteger(geometry.height) || geometry.height <= 0
        || ![0, 1, 2, 3].includes(geometry.scrollType)
        || data(movement.data, 'width').value !== geometry.width || data(movement.data, 'height').value !== geometry.height
        || data(movement.data, 'scrollType').value !== geometry.scrollType || !point(movement.to)
        || (connection ? !Number.isSafeInteger(movement.from.x) || !Number.isSafeInteger(movement.from.y) || movement.from.x < 0 || movement.from.y < 0
          || !Number.isSafeInteger(movement.sourceMapId) || movement.sourceMapId <= 0
          || data(life.player, '_transferring').value !== false : !point(movement.from))
        || !['walk', 'boat', 'ship', 'airship'].includes(mode.nativeVehicle)
        || [mode.surfing, mode.cycling, mode.diving, mode.ice, mode.bridge, mode.ledge, mode.forcedRoute].some(value => typeof value !== 'boolean')
        || (movement.kind === 'straight' || movement.kind === 'connection') && ![2, 4, 6, 8].includes(movement.direction)
        || movement.kind === 'jump' && (!Number.isSafeInteger(movement.offset.x) || !Number.isSafeInteger(movement.offset.y))
        || !Array.isArray(movement.cells) || movement.cells.length === 0) throw Error('atomic-movement-frame-stale');
      for (const cell of movement.cells) {
        const owner = reference(cell.owner), prototype = cell.prototype === null ? null : reference(cell.prototype);
        if (typeof cell.key !== 'string' || !cell.key.length || typeof cell.present !== 'boolean'
          || Object.getPrototypeOf(owner) !== prototype) throw Error('atomic-movement-cell-stale');
        const descriptor = Object.getOwnPropertyDescriptor(owner, cell.key), value: unknown = cell.value;
        if (value !== null && value !== undefined && !['boolean', 'number', 'string'].includes(typeof value)
          || typeof value === 'number' && !Number.isFinite(value)) throw Error('atomic-movement-cell-unsafe');
        if (!cell.present) {
          if (descriptor !== undefined || value !== undefined) throw Error('atomic-movement-cell-stale');
        } else if (!descriptor || !Object.hasOwn(descriptor, 'value') || !Object.is(descriptor.value, value)) throw Error('atomic-movement-cell-stale');
      }
      return movement;
    } catch {
      retiredMovements.add(movement); return undefined;
    }
  };
  const nativeCompanionOrigin = (published: WorldCompanionPreparedOriginLifecycle | null | undefined,
    birth: WorldMapBirthLifecycle | null | undefined, epoch: object | undefined,
    actual: AtomicFieldQueryState): WorldCompanionPreparedOriginLifecycle | null | undefined => {
    if (!published) return published;
    if (retiredCompanionOrigins.has(published.origin)) return undefined;
    try {
      const origin = readCompanionOrigin(published.source, published.origin), frame = birth?.frame, life = actual.lifecycle;
      if (!epoch || published.epoch !== epoch || !origin || origin.source !== published.source || origin.prepared !== published.prepared
        || origin.application !== published.application || origin.generation !== published.generation || origin.actionIdentity !== published.actionIdentity
        || origin.application !== data(record(data(root, 'PSFlow').value), '_app').value
        || !birth || !frame || birth.manager !== published.manager || birth.scene !== published.scene
        || birth.birth !== published.birth || birth.queue !== published.queue
        || data(root, 'SceneManager').value !== published.manager || data(published.manager, '_nextScene').value !== null
        || data(life.scene, '_started').value !== true || life.scene !== published.scene || origin.scene !== life.scene
        || life.map !== published.map || life.mapId !== published.mapId || life.player !== published.player || life.mapData !== published.data
        || origin.map !== life.map || origin.mapId !== life.mapId || origin.player !== life.player || origin.data !== life.mapData
        || frame.map !== life.map || frame.mapId !== life.mapId || frame.player !== life.player || frame.data !== life.mapData
        || !Array.isArray(origin.cells) || origin.cells.length === 0) throw Error('atomic-companion-origin-stale');
      const reference = (value: unknown): object => {
        if (value === null || typeof value !== 'object' && typeof value !== 'function' || nativeIsProxy(value)) throw Error('atomic-companion-origin-unsafe-reference');
        return value as object;
      };
      for (const cell of origin.cells) {
        const owner = reference(cell.owner), prototype = cell.prototype === null ? null : reference(cell.prototype);
        if (typeof cell.key !== 'string' || !cell.key.length || Object.getPrototypeOf(owner) !== prototype) throw Error('atomic-companion-origin-cell-stale');
        const descriptor = Object.getOwnPropertyDescriptor(owner, cell.key);
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw Error('atomic-companion-origin-own-data-required');
        if (cell.kind === 'reference') reference(cell.value);
        else if (cell.kind !== 'data' || cell.value !== null && typeof cell.value !== 'boolean' && typeof cell.value !== 'string'
          && !(typeof cell.value === 'number' && Number.isFinite(cell.value))) throw Error('atomic-companion-origin-cell-invalid');
        if (!Object.is(descriptor.value, cell.value)) throw Error('atomic-companion-origin-cell-stale');
      }
      return published;
    } catch { retiredCompanionOrigins.add(published.origin); return undefined; }
  };
  const nativeCompanionTransfer = (published: WorldCompanionNativeTransferLifecycle | null | undefined,
    lease: WorldTravelLeaseSnapshot, actual: AtomicFieldQueryState): WorldCompanionNativeTransferLifecycle | null | undefined => {
    if (!published) return published;
    if (retiredCompanionTransfers.has(published)) return undefined;
    try {
      const life = actual.lifecycle, birth = lease.mapBirth, frame = birth?.frame, target = published.target;
      const manager = data(root, 'SceneManager').value;
      if (manager === null || typeof manager !== 'object' && typeof manager !== 'function' || nativeIsProxy(manager)) throw Error('atomic-companion-transfer-manager-invalid');
      const started: unknown = data(life.scene, '_started').value, active: unknown = data(life.scene, '_active').value;
      if (lease.current !== null || lease.sourceHandoff !== undefined && lease.sourceHandoff !== null || !lease.nativeEpoch || published.epoch !== lease.nativeEpoch
        || published.application !== data(record(data(root, 'PSFlow').value), '_app').value
        || !Number.isSafeInteger(published.generation) || published.generation < 0
        || typeof published.gameIdentity !== 'string' || !published.gameIdentity.length
        || typeof published.contentIdentity !== 'string' || !published.contentIdentity.length
        || !birth || !frame || birth.manager !== manager || birth.manager !== published.manager
        || birth.scene !== life.scene || birth.scene !== published.scene || birth.birth !== published.birth || birth.queue !== published.queue
        || published.map !== life.map || published.mapId !== life.mapId || published.player !== life.player || published.data !== life.mapData
        || frame.map !== life.map || frame.mapId !== life.mapId || frame.player !== life.player || frame.data !== life.mapData
        || data(manager, '_nextScene').value !== null || typeof started !== 'boolean' || typeof active !== 'boolean'
        || data(life.player, '_transferring').value !== false || data(life.player, '_direction').value !== target.direction
        || !Number.isSafeInteger(target.mapId) || target.mapId <= 0 || target.mapId !== life.mapId
        || !Number.isSafeInteger(target.x) || target.x < 0 || !Number.isSafeInteger(target.y) || target.y < 0
        || target.direction !== 2 && target.direction !== 4 && target.direction !== 6 && target.direction !== 8
        || life.playerPosition?.x !== target.x || life.playerPosition.y !== target.y) throw Error('atomic-companion-transfer-stale');
      const width: unknown = data(published.data, 'width').value, height: unknown = data(published.data, 'height').value;
      if (typeof width !== 'number' || !Number.isSafeInteger(width) || width <= 0 || target.x >= width
        || typeof height !== 'number' || !Number.isSafeInteger(height) || height <= 0 || target.y >= height) throw Error('atomic-companion-transfer-target-invalid');
      return published;
    } catch { retiredCompanionTransfers.add(published); return undefined; }
  };
  const retiredSurfLandings = new WeakSet<object>();
  const nativeSurfLanding = (proof: OwnedSurfLandingProof | null | undefined, movement: WorldMovementStartLifecycle | null | undefined,
    lease: WorldTravelLeaseSnapshot): OwnedSurfLandingProof | null | undefined => {
    if (!proof) return proof;
    if (retiredSurfLandings.has(proof)) return undefined;
    try {
      if (proof.start !== movement || proof.context !== movement?.parentContext || proof.epoch !== lease.nativeEpoch || !lease.mapBirth?.frame
        || proof.start.birth !== lease.mapBirth.birth || proof.start.queue !== lease.mapBirth.queue || !proof.cells.length) throw Error('atomic-surf-landing-stale');
      for (const cell of proof.cells) {
        const owner = record(cell.owner), descriptor = Object.getOwnPropertyDescriptor(owner, cell.key);
        if (Object.getPrototypeOf(owner) !== cell.prototype || (!cell.present ? descriptor !== undefined : !descriptor || !Object.hasOwn(descriptor, 'value') || !Object.is(descriptor.value, cell.value))) throw Error('atomic-surf-landing-motion-changed');
      }
      return proof;
    } catch { retiredSurfLandings.add(proof); return undefined; }
  };
  let materializedLease: Readonly<{ raw: WorldTravelLeaseSnapshot; manager: unknown; scene: object;
    map: object; mapId: number; player: object; mapData: object | null | undefined;
    movement: WorldMovementStartLifecycle | null | undefined;
    landing: OwnedSurfLandingProof | null | undefined;
    companion: WorldCompanionPreparedOriginLifecycle | null | undefined;
    transfer: WorldCompanionNativeTransferLifecycle | null | undefined;
    value: WorldTravelLeaseSnapshot }> | undefined;
  const nativeLease = (observed: AtomicFieldQueryState): WorldTravelLeaseSnapshot | undefined => {
    const actual = observed.lifecycle;
    const lease = travelLeaseSource ? readNativeTravelLease(travelLeaseSource) : undefined;
    if (!lease) return undefined;
    if (lease.mapBirth === undefined && lease.sourceHandoff === undefined && lease.movementStart === undefined && lease.surfLanding === undefined && lease.companionPreparedOrigin === undefined && lease.companionTransfer === undefined) return lease;
    const movement = nativeMovement(lease.movementStart, lease.mapBirth, observed, lease.current);
    const landing = nativeSurfLanding(lease.surfLanding, movement, lease);
    const companion = nativeCompanionOrigin(lease.companionPreparedOrigin, lease.mapBirth, lease.nativeEpoch, observed);
    const transfer = nativeCompanionTransfer(lease.companionTransfer, lease, observed);
    // All fields below come from the same private canonical registry. Opaque source,
    // owner/context/serial and birth/queue tokens are carried by reference, never traversed.
    // Only materialized native own slots establish that a published frame is current.
    const manager: unknown = data(root, 'SceneManager').value;
    const previous = materializedLease;
    // E3 admission compares the observed snapshot by identity. Keep one stable view
    // only within the same private publication epoch and unchanged native frame.
    // A new raw snapshot (even publish(null) -> null) or an observed native ABA
    // must never reuse an earlier view.
    if (previous?.raw === lease && previous.manager === manager
      && previous.scene === actual.scene && previous.map === actual.map && previous.mapId === actual.mapId
      && previous.player === actual.player && previous.mapData === actual.mapData && previous.movement === movement && previous.landing === landing && previous.companion === companion && previous.transfer === transfer) return previous.value;
    const materializeBirth = (birth: WorldMapBirthLifecycle): WorldMapBirthLifecycle | undefined => {
      if (actual.mapData === undefined || birth.manager !== manager || birth.scene !== actual.scene) return undefined;
      const frame = birth.frame;
      if (frame === null) return actual.mapData === null || movement?.kind === 'connection' ? Object.freeze({ ...birth, frame: null }) : undefined;
      if (frame.map !== actual.map || frame.mapId !== actual.mapId || frame.player !== actual.player || frame.data !== actual.mapData) return undefined;
      return Object.freeze({ manager: birth.manager, scene: birth.scene, birth: birth.birth, queue: birth.queue,
        frame: Object.freeze({ map: frame.map, mapId: frame.mapId, player: frame.player, data: frame.data }) });
    };
    const birth = lease.mapBirth, materialized = birth ? materializeBirth(birth) : birth;
    let handoff: WorldBlackoutSourceLifecycle | null | undefined = lease.sourceHandoff === null ? null : undefined;
    const published = lease.sourceHandoff;
    if (actual.mapData !== undefined && published) {
      const target = published.target;
      // Armed/null does not claim a target frame. Ready always names the current
      // canonical loaded birth; no old/clone/seed record becomes authority here.
      if (target === null && published.phase === 'armed') handoff = Object.freeze({ ...published, target: null });
      else if (target === birth && materialized && (published.phase === 'armed' || materialized.frame !== null)) {
        handoff = Object.freeze({ ...published, target: materialized });
      }
    }
    const snapshot: WorldTravelLeaseSnapshot = { registry: lease.registry, current: lease.current,
      ...(materialized === undefined ? {} : { mapBirth: materialized }),
      ...(handoff === undefined ? {} : { sourceHandoff: handoff }),
      ...(movement === undefined ? {} : { movementStart: movement }),
      ...(landing === undefined ? {} : { surfLanding: landing }),
      ...(companion === undefined ? {} : { companionPreparedOrigin: companion }),
      ...(transfer === undefined ? {} : { companionTransfer: transfer }) };
    if (lease.nativeEpoch !== undefined) Object.defineProperty(snapshot, 'nativeEpoch', { value: lease.nativeEpoch, enumerable: false });
    const value = Object.freeze(snapshot);
    materializedLease = { raw: lease, manager, scene: actual.scene, map: actual.map, mapId: actual.mapId,
      player: actual.player, mapData: actual.mapData, movement, landing, companion, transfer, value };
    return value;
  };
  const access = <T, A>(prepare: () => (actual: A) => AtomicStateResult<T>, observe: (game: GameState, applicationBefore: ApplicationCapture | undefined) => A): T => {
    // Trace this optional identity before reentrant work; capture authoritative game/native state afterward.
    const applicationBefore = captureApplication();
    legacy.read();
    const finish = prepare();
    const system = record(data(root, '$gameSystem').value);
    const error = Object.getOwnPropertyDescriptor(system, '_psSaveError');
    if (error && (!Object.hasOwn(error, 'value') || error.value)) throw Error('atomic-state-unusable');
    const descriptor = data(system, '_psGame', true), actual: unknown = descriptor.value;
    record(actual);
    // observe is one of this adapter's closed native closures, never a host/provider callback.
    const result = finish(observe(actual as GameState, applicationBefore));
    if (result.next !== undefined && !Reflect.defineProperty(system, '_psGame', { ...descriptor, value: result.next })) throw Error('atomic-state-install-failed');
    return result.value;
  };
  const contentSource = source;
  const observeWorldContent = contentSource ? (game: GameState, applicationBefore: ApplicationCapture | undefined): AtomicFieldQueryState => {
    try {
      const content: unknown = data(contentSource.owner, contentSource.key).value;
      record(content); // Content's loaded schema and plain-data validation remain the App/composition responsibility.
      return { game, lifecycle: lifecycle(applicationBefore), content: content as Content };
    } catch (error) { retireCurrentOptionalObservations(); throw error; }
  } : undefined;
  return {
    read: () => legacy.read(), replace: next => legacy.replace(next),
    worldLifecycle: () => lifecycle(captureApplication()),
    atomic: <T>(prepare: () => (actual: GameState) => AtomicStateResult<T>): T => access(prepare, game => game),
    atomicWorld: <T>(prepare: () => (actual: AtomicWorldState) => AtomicStateResult<T>): T => access(prepare, (game, before) => ({ game, lifecycle: lifecycle(before) })),
    ...(observeWorldContent ? {
      atomicWorldContent: <T>(prepare: () => (actual: AtomicFieldQueryState) => AtomicStateResult<T>): T => access(prepare, (game, before) => {
        const actual = observeWorldContent(game, before), player = travelPlayer(actual.lifecycle.player), switches = travelSwitches();
        const lease = nativeLease(actual);
        return { ...actual, lifecycle: { ...actual.lifecycle, ...(player ? { travelPlayer: player } : {}), ...(switches ? { travelSwitches: switches } : {}), ...(lease ? { travelLease: lease } : {}) } };
      }),
      atomicFieldQuery: <T>(prepare: () => (actual: AtomicFieldQueryState) => T): T => access<T, AtomicFieldQueryState>(() => {
        const finish = prepare(); return actual => ({ value: finish(actual) });
      }, observeWorldContent),
    } : {}),
  };
}
