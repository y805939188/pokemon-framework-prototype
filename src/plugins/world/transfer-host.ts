import { captureCompanionRetainedMapMZ } from './event-companion-retained-capture-mz';
import type { CompanionRetainedMapFrameMZ, CompanionRetainedMapsObservationMZ } from './event-companion-retained-map-mz';
import { semanticFingerprint } from '../../framework/rules/semantic';
import { createCompanionTransferMZ } from './event-companion-transfer-mz';
import type { CompanionTransferMZ, CompanionTransferMZOptions } from './event-companion-transfer-mz';
import { createBlackoutSourceMZ } from './blackout-source-mz';
import type { NativeBlackoutSource } from './blackout-source-mz';
import { installMovementStartProductionMZ } from './movement-start-production-mz';
import type { MovementStartProductionRead, MovementStartProductionMZ, ConnectionMovementStartInput } from './movement-start-production-mz';
import { createEventCompanionProductionMZ } from './event-companion-production-mz';
import type { CompanionProductionMZ, CompanionProductionMZOptions } from './event-companion-production-mz';
import type { BlackoutProjectionConnection } from '../../framework/app/blackout-projection-ports';
import type { BlackoutApplicationQueries } from '../../framework/app/blackout-ports';
import { installTravelSceneAllocation } from './world-travel-scene-mz';
import { createNativeTravelLeaseRegistry, readNativeTravelLease } from './travel-lease-registry-mz';
import type { WorldTravelLeaseSource, WorldTravelLeaseCurrent, WorldMapBirthLifecycle } from '../../framework/app/ports';
import type { WorldFact, WorldLocation } from '../../framework/rules/world-data';
import { isTravelLocation, validateTravelTarget } from '../../framework/rules/world-travel';
import { hostRecord, invoke } from './host-access';
import { independentConnectionPassage, independentMapData } from './transfer-map-facts';
import { independentSurfConnectionPassage } from './transfer-surf-facts';
import type { TransferSurfPorts, SurfConnectionPassageFacts } from './transfer-surf-facts';
import type { MapGeometry } from '../../framework/rules/world-travel';
import type { ConnectionPassageFacts, IndependentMapData } from './transfer-map-facts';

export interface TransferReceipt { readonly token: string; readonly generation: number; readonly target: Readonly<WorldLocation> }
export interface TransferObservation {
  readonly actual: Readonly<WorldLocation>;
  readonly transferPending: boolean;
  readonly loadedGeometry: Readonly<{ mapId: number; width: number; height: number }>;
}
export interface ReadyTransferMap { readonly status: 'ready'; readonly mapId: number; readonly width: number; readonly height: number; readonly handle: object }
export type TransferMapResource = ReadyTransferMap | { readonly status: 'missing' | 'unavailable' | 'invalid'; readonly reason: string };
export type TransferConfirmation = { readonly status: 'arrived' | 'duplicate' } | { readonly status: 'refused'; readonly reason: string };
export interface TransferHostPorts {
  /** Actual composition queries, never a substitute App or DTO authorization. */
  readonly blackoutApplication?: () => BlackoutApplicationQueries | null;
  readonly nativeIsProxy?: (value: unknown) => boolean;
  isOwnerCurrent(owner: object): boolean;
  /** App resolves the exact issued object and parent/generation/phase; its shape grants no authority. */
  isCurrent(owner: object, receipt: TransferReceipt): boolean;
  /** Exact App registry plus the real atomic game/Content/native source preflight. */
  beforePerform(owner: object, receipt: TransferReceipt): boolean;
  /** Synchronous App install: owned entry/checkpoint clear complete before this callback returns. */
  confirmArrival(owner: object, receipt: TransferReceipt, observation: Readonly<TransferObservation>): TransferConfirmation;
  /** App retires this active transfer and retains its checkpoint. A supplied observation means native arrival
   * already completed: retry only App confirmation, never reserve/move the player again for that receipt. */
  transferFailed(owner: object, receipt: TransferReceipt, reason: string, observation?: Readonly<TransferObservation>): void;
  diagnostic?(reason: string): void;
  /** Explicit terrain capability and native water-passage selection. No walking/vehicle-state fallback. */
  readonly surf?: TransferSurfPorts;
}
type HostMethod = (this: unknown, ...args: unknown[]) => unknown;
// Installation ownership only. App remains the sole runtime operation/receipt authority.
const transferHooks = new WeakSet<object>();
export interface TransferNativeMethods { readonly playerPrototype: unknown; readonly performTransfer: HostMethod; readonly reserveTransfer: HostMethod }
export type TransferRetirement = { readonly status: 'done' } | { readonly status: 'failed'; readonly reason: string };
export interface TransferHost {
  readonly nativeLeaseSource: WorldTravelLeaseSource;
  readonly blackoutSource: NativeBlackoutSource | null;
  /** Sole composition only. The canonical publisher stays in this closure. */
  installMovementStart(read: MovementStartProductionRead): MovementStartProductionMZ;
  /** One actual App connect call. Canonical origin publishers stay inside this host. */
  connectCompanionProduction(connection: BlackoutProjectionConnection, options: CompanionProductionMZOptions): CompanionProductionMZ;
  installCompanionTransfer(read: Pick<CompanionTransferMZOptions, 'readState' | 'isCurrentLoad' | 'installed'> & { connectionCompleted?(guard: () => void): void }): CompanionTransferMZ;
  retireCompanionRetainedMaps(): void;
  invalidateCompanionRetainedMaps(): void;
  captureNativeReservationGuard(player: object): () => void;
  preload(owner: object, target: Readonly<WorldLocation>): Promise<TransferMapResource>;
  connectionGeometry(owner: object, mapId: number): Promise<WorldFact<MapGeometry>>;
  surfConnectionPassage(owner: object, map: ReadyTransferMap, target: Readonly<WorldLocation>): WorldFact<SurfConnectionPassageFacts>;
  connectionPassage(owner: object, map: ReadyTransferMap, target: Readonly<WorldLocation>): WorldFact<ConnectionPassageFacts>;
  currentPending(): WorldFact<boolean>;
  reserve(owner: object, receipt: TransferReceipt, map: ReadyTransferMap): { readonly status: 'reserved' } | { readonly status: 'failed'; readonly reason: string };
  observeNow(): WorldFact<TransferObservation>;
  /** Technical idle guard only: any native reserve invalidates it, even reserve/clear ABA. */
  captureIdleNativeGuard(owner: object, player: object): () => void;
  /** Private receipt identity and native reserve serial, never target-coordinate ownership. */
  retireTransfer(owner: object, receipt: TransferReceipt): TransferRetirement;
  /** Successful outer composition only; failures retain the genuine consumed proof for explicit retry. */
  releaseArrival(owner: object, receipt: object): void;
  /** App-authenticated successful recovery of the original consumed arrival. */
  releaseRecoveryArrival(physical: WorldTravelLeaseCurrent, birth: WorldMapBirthLifecycle, guard: () => void): TransferRetirement;
  /** Call once from the sole MZ integrator with explicitly captured native references. Same references are idempotent. */
  install(methods: TransferNativeMethods): void;
}
const integer = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`transfer-invalid:${label}`);
  return value;
}
function sameLocation(a: Readonly<WorldLocation>, b: Readonly<WorldLocation>): boolean { return a.mapId === b.mapId && a.x === b.x && a.y === b.y && a.direction === b.direction; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
type Loaded = { readonly status: 'loaded'; readonly data: unknown } | Exclude<TransferMapResource, ReadyTransferMap>;
/** MZ's local-file transport, but with no DataManager target and no writes to current $dataMap. */
async function loadMap(root: Record<string, unknown>, mapId: number): Promise<Loaded> {
  const infos = root.$dataMapInfos;
  if (!Array.isArray(infos)) return { status: 'unavailable', reason: 'map-index-unavailable' };
  if (!Object.hasOwn(infos, mapId) || infos[mapId] === null || infos[mapId] === undefined) return { status: 'missing', reason: 'target-map-missing' };
  const ctor = root.XMLHttpRequest;
  if (typeof ctor !== 'function') return { status: 'unavailable', reason: 'map-transport-unavailable' };
  return new Promise<Loaded>(resolve => {
    try {
      const xhr = Reflect.construct(ctor, []), record = hostRecord(xhr);
      if (!record) { resolve({ status: 'unavailable', reason: 'map-transport-invalid' }); return; }
      record.onload = () => {
        const status = record.status;
        if (!integer(status) || status < 0) { resolve({ status: 'invalid', reason: 'map-response-status-invalid' }); return; }
        if (status === 404) { resolve({ status: 'missing', reason: 'target-map-missing' }); return; }
        if (status >= 400) { resolve({ status: 'unavailable', reason: `map-http-${status}` }); return; }
        if (typeof record.responseText !== 'string') { resolve({ status: 'invalid', reason: 'map-response-invalid' }); return; }
        try { const data: unknown = JSON.parse(record.responseText); resolve({ status: 'loaded', data }); }
        catch { resolve({ status: 'invalid', reason: 'map-json-invalid' }); }
      };
      record.onerror = () => resolve({ status: 'unavailable', reason: 'map-read-failed' });
      record.onabort = () => resolve({ status: 'unavailable', reason: 'map-read-aborted' });
      record.ontimeout = () => resolve({ status: 'unavailable', reason: 'map-read-timeout' });
      record.timeout = 15000;
      invoke(xhr, 'open', ['GET', `data/Map${String(mapId).padStart(3, '0')}.json`]);
      invoke(xhr, 'overrideMimeType', ['application/json']);
      invoke(xhr, 'send');
    } catch (error) { resolve({ status: 'unavailable', reason: `map-read-failed:${message(error)}` }); }
  });
}

/** One transfer leaf, no App lock/receipt registry and no shared PSWorld installation. */
export function createTransferHost(rootValue: unknown, ports: TransferHostPorts): TransferHost {
  const root = hostRecord(rootValue);
  if (!root) throw new Error('transfer-root-unavailable');
  const registry = createNativeTravelLeaseRegistry();
  const resources = new WeakMap<object, { owner: object; map: ReadyTransferMap; data: IndependentMapData }>();
  type Resource = { readonly status: 'loaded'; readonly data: IndependentMapData; map?: ReadyTransferMap } | Exclude<TransferMapResource, ReadyTransferMap>;
  // Owner identity includes its registry generation. Geometry and preload share one independent read;
  // geometry itself does not issue a handle and can represent a legitimate zero-size neighbor.
  const byOwner = new WeakMap<object, Map<number, Promise<Resource>>>();
  let installed: { prototype: Record<string, unknown>; native: TransferNativeMethods; wrapper: HostMethod; reserveWrapper: HostMethod; clearWrapper: HostMethod } | null = null;
  type NativeLease = { readonly serial: object; readonly owned: Pending | null };
  type ConnectionCandidate = { readonly owner: object; readonly map: ReadyTransferMap; readonly target: Readonly<WorldLocation>;
    readonly sourceScene: object; readonly sourceMapId: number; readonly from: Readonly<{ x: number; y: number }>; readonly direction: 2 | 4 | 6 | 8; readonly retained: CompanionRetainedMapFrameMZ | null; readonly application: object | null; readonly generation: number | null; readonly content: object | null; readonly contentIdentity: string | null; guard(): void };
  const connectionCandidates = new WeakMap<object, ConnectionCandidate>();
  type Pending = { owner: object; receipt: TransferReceipt; target: Readonly<WorldLocation>; map: ReadyTransferMap; player: object; lease: NativeLease | null; readonly authority: object; readonly sourceScene: object; scene: object; readonly connection: ConnectionCandidate | null };
  let pending: Pending | null = null;
  let published: Pending | null = null;
  const publish = (entry: Pending, phase: 'reserved' | 'performing' | 'arrived'): void => {
    if (!entry.lease) return;
    published = entry;
    registry.publish({ lease: entry.authority, owner: entry.owner, receipt: entry.receipt, player: entry.player,
      serial: entry.lease.serial, sourceScene: entry.sourceScene, scene: entry.scene, phase });
  };
  const unpublish = (entry: Pending): void => { if (published === entry) { published = null; registry.publish(null); } };
  const nativeScene = (): object | null => {
    const manager = Object.getOwnPropertyDescriptor(root, 'SceneManager')?.value;
    if (!manager || !['object', 'function'].includes(typeof manager)) return null;
    const scene = Object.getOwnPropertyDescriptor(manager, '_scene')?.value;
    return scene && typeof scene === 'object' ? scene : null;
  };
  let reserving: Pending | null = null;
  let performing: Pending | null = null;
  let nativePerforming: { readonly player: object; readonly lease: NativeLease | undefined } | null = null;
  let companionTransfer: CompanionTransferMZ | null = null;
  let companionRead: (Pick<CompanionTransferMZOptions, 'readState'> & { connectionCompleted?(guard: () => void): void }) | null = null;
  const retainedMaps: { readonly nativeLeaseSource: WorldTravelLeaseSource; current: CompanionRetainedMapsObservationMZ | null } = { nativeLeaseSource: registry.source, current: null };
  const nativeLeases = new WeakMap<object, NativeLease>();
  const nativeEpochs = new WeakMap<object, object>();
  const exactLease = (entry: Pending): boolean => pending === entry && entry.lease !== null && nativeLeases.get(entry.player) === entry.lease;
  const rawPlayer = (): unknown => Object.getOwnPropertyDescriptor(root, '$gamePlayer')?.value;
  const requestFields = ['_transferring', '_newMapId', '_newX', '_newY', '_newDirection'] as const;
  const requestDescriptors = (player: object): PropertyDescriptor[] | null => {
    const descriptors = requestFields.map(key => Object.getOwnPropertyDescriptor(player, key));
    return descriptors.every((d): d is PropertyDescriptor => !!d && Object.hasOwn(d, 'value') && d.writable === true) ? descriptors : null;
  };
  const sameNativeRequest = (entry: Pending, fields: readonly PropertyDescriptor[]): boolean => fields[0]?.value === true && fields[1]?.value === entry.target.mapId && fields[2]?.value === entry.target.x && fields[3]?.value === entry.target.y && fields[4]?.value === entry.target.direction;
  const retireTransfer = (owner: object, receipt: TransferReceipt): TransferRetirement => {
    const entry = pending;
    // The App has already revoked its owner when this cleanup runs. Only our own private registry
    // authenticates retirement; a cloned receipt or a successor never acquires another lease.
    // A genuine consumed arrival remains physical proof for explicit tail/confirmation recovery.
    // Retiring a failed App owner must not re-sign or erase that proof; a later native reserve
    // invalidates it synchronously, and successful composition cleanup may release it.
    if (!entry || entry.owner !== owner || entry.receipt !== receipt) return { status: 'done' };
    if (!exactLease(entry)) { if (pending === entry) pending = null; unpublish(entry); return { status: 'done' }; }
    try {
      if (rawPlayer() !== entry.player) return { status: 'failed', reason: 'transfer-player-changed' };
      const transferring = Object.getOwnPropertyDescriptor(entry.player, '_transferring');
      if (transferring && Object.hasOwn(transferring, 'value') && transferring.value === false && exactLease(entry)) { pending = null; nativeLeases.delete(entry.player); unpublish(entry); return { status: 'done' }; }
      const fields = requestDescriptors(entry.player);
      if (!fields) return { status: 'failed', reason: 'transfer-native-slots-unavailable' };
      if (!exactLease(entry) || rawPlayer() !== entry.player) return { status: 'failed', reason: 'transfer-retirement-reentered' };
      if (fields[0]!.value === false) { pending = null; nativeLeases.delete(entry.player); unpublish(entry); return { status: 'done' }; }
      if (!sameNativeRequest(entry, fields)) return { status: 'failed', reason: 'transfer-native-request-conflict' };
      // No host method/provider between the final private serial check and these native own-data
      // assignments. clearTransferInfo would call arbitrary later plugin hooks and could erase 201.
      for (let index = 0; index < requestFields.length; index++) {
        if (!Reflect.defineProperty(entry.player, requestFields[index]!, { ...fields[index]!, value: index === 0 ? false : 0 })) return { status: 'failed', reason: 'transfer-native-clear-failed' };
      }
      pending = null; nativeLeases.delete(entry.player); unpublish(entry);
      return { status: 'done' };
    } catch (error) { return { status: 'failed', reason: `transfer-retirement-failed:${message(error)}` }; }
  };
  const diagnostic = (reason: string): void => { ports.diagnostic?.(reason); };
  const ownerCurrent = (owner: object): boolean => { try { return ports.isOwnerCurrent(owner) === true; } catch { return false; } };
  const receiptCurrent = (entry: Pending): boolean => { try { return ownerCurrent(entry.owner) && ports.isCurrent(entry.owner, entry.receipt) === true && sameLocation(entry.target, entry.receipt.target); } catch { return false; } };
  const failed = (entry: Pending, reason: string, observation?: Readonly<TransferObservation>): void => {
    try { if (receiptCurrent(entry)) ports.transferFailed(entry.owner, entry.receipt, reason, observation); }
    finally { try { diagnostic(reason); } catch { /* Diagnostics never retain an otherwise retired App lock. */ } }
  };
  const currentPending = (): WorldFact<boolean> => {
    try { return { status: 'value', value: boolean(invoke(root.$gamePlayer, 'isTransferring'), 'pending') }; }
    catch (error) { return { status: 'unavailable', reason: message(error) }; }
  };
  const observeNow = (): WorldFact<TransferObservation> => {
    try {
      const player = hostRecord(root.$gamePlayer), data = hostRecord(root.$dataMap);
      if (!player || !data) return { status: 'unavailable', reason: 'loaded-map-player-unavailable' };
      const actual = { mapId: invoke(root.$gameMap, 'mapId'), x: player.x, y: player.y, direction: invoke(player, 'direction') };
      if (!isTravelLocation(actual)) return { status: 'invalid', reason: 'actual-location-invalid' };
      const width = invoke(root.$gameMap, 'width'), height = invoke(root.$gameMap, 'height');
      if (!integer(width) || !integer(height) || width !== data.width || height !== data.height) return { status: 'invalid', reason: 'loaded-geometry-invalid' };
      const geometry = { mapId: actual.mapId, width, height };
      const checked = validateTravelTarget(actual, { status: 'value', value: geometry });
      if (checked.status !== 'ready') return { status: 'invalid', reason: checked.reason };
      return { status: 'value', value: { actual: Object.freeze(actual), transferPending: boolean(invoke(player, 'isTransferring'), 'pending'), loadedGeometry: Object.freeze(geometry) } };
    } catch (error) { return { status: 'unavailable', reason: message(error) }; }
  };
  const resource = async (owner: object, mapId: number): Promise<Resource> => {
    if (!ownerCurrent(owner)) return { status: 'unavailable', reason: 'owner-stale' };
    if (!integer(mapId) || mapId <= 0) return { status: 'invalid', reason: 'invalid-map-id' };
    let cache = byOwner.get(owner);
    if (!cache) { cache = new Map(); byOwner.set(owner, cache); }
    let promise = cache.get(mapId);
    if (!promise) {
      // Store the promise before the transport can synchronously reenter this adapter.
      let settle!: (value: Resource) => void;
      promise = new Promise<Resource>(resolve => { settle = resolve; });
      cache.set(mapId, promise);
      const read = async (): Promise<Resource> => {
        if (!ownerCurrent(owner)) return { status: 'unavailable', reason: 'owner-stale' };
        const loaded = await loadMap(root, mapId);
        if (!ownerCurrent(owner)) return { status: 'unavailable', reason: 'owner-stale' };
        if (loaded.status !== 'loaded') return loaded;
        const data = independentMapData(loaded.data);
        return data ? { status: 'loaded', data } : { status: 'invalid', reason: 'map-data-invalid' };
      };
      void read().then(settle, error => settle({ status: 'unavailable', reason: `map-read-failed:${message(error)}` }));
    }
    const result = await promise;
    if (!ownerCurrent(owner)) return { status: 'unavailable', reason: 'owner-stale' };
    // A failed transport is recoverable by an explicit retry. Successful geometry remains stable for this owner.
    if (result.status !== 'loaded' && cache.get(mapId) === promise) cache.delete(mapId);
    return result;
  };
  const heldResource = (owner: object, map: ReadyTransferMap, target: Readonly<WorldLocation>) => {
    const held = resources.get(map.handle);
    if (!ownerCurrent(owner) || !held || held.map !== map || held.owner !== owner) return null;
    const checked = validateTravelTarget(target, { status: 'value', value: { mapId: map.mapId, width: map.width, height: map.height } });
    return checked.status === 'ready' ? held : null;
  };
  const captureNativeEpoch = (player: object, requireIdle: boolean): (() => void) => {
    const epoch = nativeEpochs.get(player);
    const check = (): void => {
      const transferring = Object.getOwnPropertyDescriptor(player, '_transferring');
      if (!installed || Object.getOwnPropertyDescriptor(installed.prototype, 'performTransfer')?.value !== installed.wrapper ||
        Object.getOwnPropertyDescriptor(installed.prototype, 'reserveTransfer')?.value !== installed.reserveWrapper ||
        Object.getOwnPropertyDescriptor(installed.prototype, 'clearTransferInfo')?.value !== installed.clearWrapper ||
        rawPlayer() !== player || nativeEpochs.get(player) !== epoch || !transferring || !('value' in transferring) || typeof transferring.value !== 'boolean' || requireIdle && transferring.value !== false) throw Error('travel-native-idle-source-changed');
    };
    check(); return check;
  };
  const connectionCandidate = (owner: object, map: ReadyTransferMap, target: Readonly<WorldLocation>, player: object): ConnectionCandidate => {
    const read = (value: object, key: string): unknown => {
      if (ports.nativeIsProxy?.(value)) throw Error('connection-source-proxy-refused');
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (!d || !('value' in d)) throw Error('connection-source-own-data-required');
      return d.value;
    };
    const sourceMap = read(root, '$gameMap'), data = read(root, '$dataMap'), sourceScene = nativeScene();
    if (!sourceMap || typeof sourceMap !== 'object' || !data || typeof data !== 'object' || !sourceScene) throw Error('connection-source-unavailable');
    const sourceMapId = read(sourceMap, '_mapId'), x = read(player, '_x'), y = read(player, '_y'), direction = read(player, '_direction');
    if (!integer(sourceMapId) || sourceMapId <= 0 || !integer(x) || x < 0 || !integer(y) || y < 0
      || direction !== 2 && direction !== 4 && direction !== 6 && direction !== 8) throw Error('connection-source-location-invalid');
    const epoch = captureNativeEpoch(player, true);
    const guard = (): void => {
      epoch();
      if (!ownerCurrent(owner) || rawPlayer() !== player || read(root, '$gameMap') !== sourceMap || read(root, '$dataMap') !== data
        || nativeScene() !== sourceScene || read(sourceMap, '_mapId') !== sourceMapId || read(player, '_x') !== x
        || read(player, '_y') !== y || read(player, '_direction') !== direction) throw Error('connection-qualified-source-changed');
      epoch();
    };
    guard();
    const actual = companionRead?.readState(), generation = actual?.application.stateGeneration ?? null;
    const points = actual?.game.world.companions.filter(c => c.location.mapId === sourceMapId).map(c => c.location) ?? [];
    const footprint: { x: number; y: number }[] = [{ x, y }, ...points];
    // Retain the finite current chain corridor, not a whole-map/world cache. A long chain may
    // traverse more than two old tiles over its subsequent actual committed prefixes.
    for (const point of points) {
      for (let xx = Math.min(point.x, x); xx <= Math.max(point.x, x); xx++) footprint.push({ x: xx, y }, { x: xx, y: point.y });
      for (let yy = Math.min(point.y, y); yy <= Math.max(point.y, y); yy++) footprint.push({ x, y: yy }, { x: point.x, y: yy });
    }
    const retained = points.length && ports.nativeIsProxy ? captureCompanionRetainedMapMZ(root, sourceMapId, footprint, ports.nativeIsProxy) : null;
    guard();
    return Object.freeze({ owner, map, target: Object.freeze({ ...target }), sourceScene, sourceMapId, from: Object.freeze({ x, y }), direction, guard,
      retained, application: actual?.application ?? null, generation, content: actual?.content ?? null, contentIdentity: actual ? semanticFingerprint(actual.content) : null });
  };
  const blackoutSource = ports.nativeIsProxy ? createBlackoutSourceMZ(root, registry, () => ports.blackoutApplication?.() ?? null, ports.nativeIsProxy, player => captureNativeEpoch(player, false)) : null;
  let movementInstalled: MovementStartProductionMZ | null = null;
  let companionProduction: { connection: BlackoutProjectionConnection; runtime: CompanionProductionMZ } | null = null;
  const host: TransferHost = {
    nativeLeaseSource: registry.source, blackoutSource,
    connectCompanionProduction(connection, options) {
      if (companionProduction) {
        if (companionProduction.connection !== connection) throw Error('companion-production-already-connected');
        return companionProduction.runtime;
      }
      if (!installed || !ports.nativeIsProxy) throw Error('companion-production-native-installation-unavailable');
      const runtime = createEventCompanionProductionMZ(root, connection, { ...options, retainedMapSource: retainedMaps }, ports.nativeIsProxy, {
        source: registry.source, publish: registry.publishCompanionPreparedOrigin, retire: registry.retireCompanionPreparedOrigin,
      });
      companionProduction = { connection, runtime }; return runtime;
    },
    installMovementStart(read) {
      if (movementInstalled || !installed || !ports.nativeIsProxy) throw Error('movement-production-installation-unavailable');
      const result = installMovementStartProductionMZ({ ...read, root, source: registry.source, isProxy: ports.nativeIsProxy,
        publish: registry.publishMovementStart, publishLanding: registry.publishSurfLanding, captureReservationGuard: (player, idle = true) => captureNativeEpoch(player, idle),
        diagnose: reason => { try { ports.diagnostic?.(reason); } catch { /* Diagnostic only. */ } } });
      movementInstalled = result; return result;
    },
    installCompanionTransfer(read) {
      if (companionTransfer || !installed || !ports.nativeIsProxy) throw Error('companion-transfer-installation-unavailable');
      const runtime = createCompanionTransferMZ({ ...read, root, source: registry.source, isProxy: ports.nativeIsProxy,
        captureReservationGuard: player => captureNativeEpoch(player, false),
        publish: registry.publishCompanionTransfer, retire: registry.retireCompanionTransfer,
        diagnostic: reason => { try { ports.diagnostic?.(reason); } catch { /* Observation only. */ } } });
      const map = hostRecord(hostRecord(root.Scene_Map)?.prototype), ready = map?.isReady;
      if (!map || typeof ready !== 'function') throw Error('companion-transfer-map-ready-unavailable');
      map.isReady = function(this: unknown, ...args: unknown[]): unknown {
        const result = Reflect.apply(ready, this, args);
        return result === true && nativeScene() === this ? runtime.ready() : result;
      };
      companionRead = read; companionTransfer = runtime; return runtime;
    },
    invalidateCompanionRetainedMaps() { retainedMaps.current = null; },
    retireCompanionRetainedMaps() {
      const previous = retainedMaps.current, actual = companionRead?.readState();
      if (previous && actual && actual.application === previous.application && actual.application.stateGeneration === previous.generation
        && actual.content === previous.content && semanticFingerprint(actual.content) === previous.contentIdentity
        && actual.game.world.companions.every(c => c.location.mapId === previous.mapId)
        && retainedMaps.current === previous && readNativeTravelLease(registry.source)?.nativeEpoch === previous.epoch) retainedMaps.current = null;
    },
    captureNativeReservationGuard: player => captureNativeEpoch(player, true),
    async connectionGeometry(owner, mapId) {
      const loaded = await resource(owner, mapId);
      if (loaded.status !== 'loaded') return { status: loaded.status === 'missing' ? 'absent' : loaded.status, reason: loaded.reason };
      return { status: 'value', value: Object.freeze({ mapId, width: loaded.data.width, height: loaded.data.height }) };
    },
    async preload(owner, target) {
      if (!ownerCurrent(owner)) return { status: 'unavailable', reason: 'owner-stale' };
      if (!isTravelLocation(target)) return { status: 'invalid', reason: 'invalid-target' };
      const requested = { ...target }, loaded = await resource(owner, requested.mapId);
      if (!ownerCurrent(owner)) return { status: 'unavailable', reason: 'owner-stale' };
      if (loaded.status !== 'loaded') return loaded;
      const data = loaded.data;
      const checked = validateTravelTarget(requested, { status: 'value', value: { mapId: requested.mapId, width: data.width, height: data.height } });
      if (checked.status !== 'ready') return checked;
      if (loaded.map) return loaded.map;
      const handle = Object.freeze({}), map: ReadyTransferMap = Object.freeze({ status: 'ready', mapId: requested.mapId, width: data.width, height: data.height, handle });
      resources.set(handle, { owner, map, data }); loaded.map = map;
      return map;
    },
    surfConnectionPassage(owner, map, target) {
      const held = heldResource(owner, map, target);
      if (!held) return { status: 'unavailable', reason: 'map-resource-stale-or-invalid-target' };
      const player = hostRecord(root.$gamePlayer);
      if (!player || !ports.surf) return { status: 'unavailable', reason: 'surf-target-provider-unavailable' };
      const candidate = connectionCandidate(owner, map, target, player);
      const result = independentSurfConnectionPassage(root, held.data, map.mapId, target.x, target.y, player, ports.surf);
      candidate.guard();
      if (result.status === 'value') connectionCandidates.set(map.handle, candidate);
      return ownerCurrent(owner) ? result : { status: 'unavailable', reason: 'owner-stale' };
    },
    connectionPassage(owner, map, target) {
      const held = resources.get(map.handle);
      if (!ownerCurrent(owner) || !held || held.map !== map || held.owner !== owner) return { status: 'unavailable', reason: 'map-resource-stale' };
      const checked = validateTravelTarget(target, { status: 'value', value: { mapId: map.mapId, width: map.width, height: map.height } });
      if (checked.status !== 'ready') return { status: checked.status === 'missing' ? 'absent' : checked.status, reason: checked.reason };
      const player = hostRecord(root.$gamePlayer);
      if (!player) return { status: 'unavailable', reason: 'player-unavailable' };
      const candidate = connectionCandidate(owner, map, target, player);
      const result = independentConnectionPassage(root, held.data, map.mapId, target.x, target.y, player);
      candidate.guard();
      if (result.status === 'value') connectionCandidates.set(map.handle, candidate);
      return ownerCurrent(owner) ? result : { status: 'unavailable', reason: 'owner-stale' };
    },
    currentPending, observeNow, retireTransfer,
    captureIdleNativeGuard(owner, player) {
      const idle = captureNativeEpoch(player, true);
      const check = (): void => { if (!ownerCurrent(owner)) throw Error('travel-native-idle-owner-stale'); idle(); };
      check(); return check;
    },
    releaseRecoveryArrival(physical, birth, guard) {
      try {
        guard();
        const entry = published, snapshot = readNativeTravelLease(registry.source), frame = birth.frame;
        if (!entry || snapshot?.current !== physical || snapshot.mapBirth !== birth || snapshot.sourceHandoff || !frame
          || physical.phase !== 'arrived' || entry.authority !== physical.lease || entry.lease?.serial !== physical.serial
          || entry.owner !== physical.owner || entry.receipt !== physical.receipt || entry.player !== physical.player
          || entry.scene !== physical.scene || entry.sourceScene !== physical.sourceScene || pending !== null || nativeLeases.has(entry.player)
          || nativeEpochs.get(entry.player) !== physical.serial || rawPlayer() !== entry.player || nativeScene() !== physical.scene
          || birth.scene !== physical.scene || frame.player !== entry.player || frame.mapId !== entry.target.mapId
          || frame.map !== Object.getOwnPropertyDescriptor(root, '$gameMap')?.value || frame.data !== Object.getOwnPropertyDescriptor(root, '$dataMap')?.value
          || Object.getOwnPropertyDescriptor(root, 'SceneManager')?.value !== birth.manager
          || Object.getOwnPropertyDescriptor(birth.manager, '_nextScene')?.value !== null
          || Object.getOwnPropertyDescriptor(birth.scene, '_started')?.value !== true || Object.getOwnPropertyDescriptor(birth.scene, '_active')?.value !== true
          || Object.getOwnPropertyDescriptor(entry.player, '_transferring')?.value !== false
          || Object.getOwnPropertyDescriptor(entry.player, '_x')?.value !== entry.target.x || Object.getOwnPropertyDescriptor(entry.player, '_y')?.value !== entry.target.y
          || Object.getOwnPropertyDescriptor(entry.player, '_direction')?.value !== entry.target.direction) return { status: 'failed', reason: 'travel-recovery-native-proof-stale' };
        // All unknown callbacks have returned. This producer alone retires its exact original
        // consumed proof. No reserve, Scene construction, restore or native transfer is replayed.
        blackoutSource?.releasedPhysical(physical); unpublish(entry);
        return { status: 'done' };
      } catch (error) { return { status: 'failed', reason: message(error) }; }
    },
    releaseArrival(owner, receipt) {
      const entry = published;
      if (entry && entry.owner === owner && entry.receipt === receipt && pending !== entry && !nativeLeases.has(entry.player)) {
        const physical = readNativeTravelLease(registry.source)?.current;
        if (physical?.owner === owner && physical.receipt === receipt && physical.lease === entry.authority && physical.serial === entry.lease?.serial && physical.phase === 'arrived') blackoutSource?.releasedPhysical(physical);
        unpublish(entry);
        const candidate = entry.connection, actual = companionRead?.readState();
        if (candidate?.retained && actual && candidate.application === actual.application && candidate.generation === actual.application.stateGeneration
          && candidate.content === actual.content && candidate.contentIdentity === semanticFingerprint(actual.content) && entry.lease
          && nativeEpochs.get(entry.player) === entry.lease.serial && rawPlayer() === entry.player) {
          const snapshot = readNativeTravelLease(registry.source), birth = snapshot?.mapBirth, frame = birth?.frame;
          if (snapshot?.current === null && !snapshot.sourceHandoff && snapshot.nativeEpoch && birth && frame && birth.scene === nativeScene()
            && frame.player === entry.player && frame.map === Object.getOwnPropertyDescriptor(root, '$gameMap')?.value
            && frame.data === Object.getOwnPropertyDescriptor(root, '$dataMap')?.value && frame.mapId === entry.target.mapId
            && Object.getOwnPropertyDescriptor(entry.player, '_x')?.value === entry.target.x && Object.getOwnPropertyDescriptor(entry.player, '_y')?.value === entry.target.y) {
            const retained: CompanionRetainedMapsObservationMZ = Object.freeze({ application: actual.application, generation: actual.application.stateGeneration,
              content: actual.content, contentIdentity: candidate.contentIdentity!, serial: entry.lease.serial, epoch: snapshot.nativeEpoch,
              sourceScene: candidate.sourceScene, manager: birth.manager, scene: birth.scene, birth: birth.birth, queue: birth.queue,
              map: frame.map, mapId: frame.mapId, player: frame.player, data: frame.data, frames: Object.freeze([candidate.retained]) });
            const nativeGuard = captureNativeEpoch(entry.player, true);
            const guard = (): void => {
              nativeGuard(); const now = companionRead?.readState(), current = readNativeTravelLease(registry.source), b = current?.mapBirth;
              if (retainedMaps.current !== retained || !now || now.application !== retained.application || now.application.stateGeneration !== retained.generation
                || now.content !== retained.content || semanticFingerprint(now.content) !== retained.contentIdentity || current?.nativeEpoch !== retained.epoch
                || b?.birth !== retained.birth || b.queue !== retained.queue || b.scene !== retained.scene || b.frame?.data !== retained.data
                || Object.getOwnPropertyDescriptor(entry.player, '_x')?.value !== entry.target.x || Object.getOwnPropertyDescriptor(entry.player, '_y')?.value !== entry.target.y)
                throw Error('companion-connection-follow-source-changed');
              nativeGuard();
            };
            retainedMaps.current = retained;
            try { guard(); companionRead?.connectionCompleted?.(guard); } catch (error) { if (retainedMaps.current === retained) retainedMaps.current = null; diagnostic(message(error)); }
          }
        }
      }
    },
    reserve(owner, receipt, map) {
      if (!installed || installed.prototype.performTransfer !== installed.wrapper || installed.prototype.reserveTransfer !== installed.reserveWrapper || installed.prototype.clearTransferInfo !== installed.clearWrapper) return { status: 'failed', reason: 'transfer-host-not-installed' };
      const held = resources.get(map.handle), player = hostRecord(root.$gamePlayer);
      if (!held || held.owner !== owner || held.map !== map || !player) return { status: 'failed', reason: 'map-resource-stale' };
      if (!isTravelLocation(receipt.target) || typeof receipt.token !== 'string' || !integer(receipt.generation)) return { status: 'failed', reason: 'invalid-receipt' };
      const checked = validateTravelTarget(receipt.target, { status: 'value', value: { mapId: map.mapId, width: map.width, height: map.height } });
      if (checked.status !== 'ready') return { status: 'failed', reason: checked.reason };
      const sourceScene = nativeScene();
      if (!sourceScene) return { status: 'failed', reason: 'transfer-source-scene-unavailable' };
      const connection = connectionCandidates.get(map.handle) ?? null;
      if (connection) {
        try { connection.guard(); } catch (error) { return { status: 'failed', reason: message(error) }; }
        if (connection.owner !== owner || connection.map !== map || connection.sourceScene !== sourceScene || !sameLocation(connection.target, receipt.target)) return { status: 'failed', reason: 'connection-qualified-target-changed' };
      }
      const entry: Pending = { owner, receipt, target: Object.freeze({ ...receipt.target }), map, player, lease: null, authority: Object.freeze({}), sourceScene, scene: sourceScene, connection };
      if (!receiptCurrent(entry)) return { status: 'failed', reason: 'receipt-stale' };
      const existing = currentPending();
      if (existing.status !== 'value') return { status: 'failed', reason: 'pending-unavailable' };
      if (existing.value) return { status: 'failed', reason: 'mz-transfer-pending' };
      if (pending && receiptCurrent(pending)) return { status: 'failed', reason: 'owned-transfer-pending' };
      if (root.$gamePlayer !== player || !receiptCurrent(entry)) return { status: 'failed', reason: 'receipt-stale' };
      pending = entry;
      try {
        reserving = entry;
        installed.reserveWrapper.call(player, entry.target.mapId, entry.target.x, entry.target.y, entry.target.direction, 0);
        const after = currentPending();
        if (after.status !== 'value' || !after.value || !receiptCurrent(entry) || !exactLease(entry) || rawPlayer() !== player) {
          retireTransfer(owner, receipt);
          return { status: 'failed', reason: 'reserve-not-pending-or-stale' };
        }
        return { status: 'reserved' };
      } catch (error) { retireTransfer(owner, receipt); return { status: 'failed', reason: `reserve-failed:${message(error)}` }; }
      finally { if (reserving === entry) reserving = null; }
    },
    install(native) {
      const prototype = hostRecord(native.playerPrototype);
      if (!prototype || typeof native.performTransfer !== 'function' || typeof native.reserveTransfer !== 'function') throw new Error('transfer-native-surface-invalid');
      if (installed) {
        if (installed.prototype !== prototype || installed.native.performTransfer !== native.performTransfer || installed.native.reserveTransfer !== native.reserveTransfer || prototype.performTransfer !== installed.wrapper || prototype.reserveTransfer !== installed.reserveWrapper || prototype.clearTransferInfo !== installed.clearWrapper) throw new Error('transfer-host-already-installed');
        return;
      }
      if (prototype.performTransfer !== native.performTransfer || prototype.reserveTransfer !== native.reserveTransfer) throw new Error('transfer-native-reference-mismatch');
      if (transferHooks.has(prototype)) throw new Error('transfer-hook-already-owned');
      const originalPerform = native.performTransfer, originalReserve = native.reserveTransfer, originalClear = prototype.clearTransferInfo;
      if (typeof originalClear !== 'function') throw Error('transfer-native-clear-unavailable');
      const reserveWrapper: HostMethod = function(this: unknown, ...args: unknown[]): unknown {
        const player = hostRecord(this);
        if (!player) return originalReserve.apply(this, args);
        const claim = reserving; reserving = null;
        const owned = claim && pending === claim && this === claim.player ? claim : null;
        const lease: NativeLease = { serial: Object.freeze({}), owned };
        retainedMaps.current = null;
        nativeLeases.set(player, lease); nativeEpochs.set(player, lease.serial);
        if (published) unpublish(published);
        else if (!owned) registry.publish(null); // An idle raw201 still advances the observable native epoch.
        if (owned) { owned.lease = lease; publish(owned, 'reserved'); }
        const result = originalReserve.apply(this, args);
        if (nativeLeases.get(player) === lease) companionTransfer?.reserved(player, lease.serial, owned !== null, args);
        return result;
      };
      const clearWrapper: HostMethod = function(this: unknown, ...args: unknown[]): unknown {
        const player = hostRecord(this), active = performing, nativeActive = nativePerforming;
        if (nativeActive && this === nativeActive.player && nativeLeases.get(nativeActive.player) !== nativeActive.lease) return;
        // Native perform calls clear only at its end. A callback may have reserved a new 201 or
        // successor at the same coordinates. The old perform may never clear that new serial.
        if (active && this === active.player && !exactLease(active)) return;
        const lease = player ? nativeLeases.get(player) : undefined;
        const result = Reflect.apply(originalClear, this, args);
        if (player && nativeLeases.get(player) === lease) { nativeLeases.delete(player); if (active && pending === active && lease === active.lease) publish(active, 'arrived'); }
        return result;
      };
      const perform: HostMethod = function(this: unknown, ...args: unknown[]): unknown {
        const entry = pending, expectedPlayer = this === root.$gamePlayer && this === entry?.player;
        const before = expectedPlayer ? currentPending() : null;
        if (entry && expectedPlayer) {
          let valid = before?.status === 'value' && before.value && receiptCurrent(entry);
          try { valid = valid && ports.beforePerform(entry.owner, entry.receipt) === true; } catch { valid = false; }
          // All reentrant providers above have returned. A raw reserve, even at the same target,
          // supersedes this private lease and follows the ordinary native transfer path.
          if (exactLease(entry) && (!valid || rawPlayer() !== entry.player)) {
            const retired = retireTransfer(entry.owner, entry.receipt);
            failed(entry, retired.status === 'failed' ? retired.reason : 'arrival-stale-before-perform');
            throw Error('transfer-preflight-refused');
          }
        }
        if (entry && expectedPlayer && !exactLease(entry)) {
          failed(entry, 'native-transfer-superseded');
          if (pending === entry) pending = null;
        }
        const own = entry && expectedPlayer && exactLease(entry) ? entry : null;
        const player = hostRecord(this), nativeLease = player ? nativeLeases.get(player) : undefined;
        const rawCompleted = player ? companionTransfer?.beforePerform(player, nativeLease?.serial ?? null, own !== null) ?? null : null;
        const nativeFrame = player ? { player, lease: nativeLease } : null, previousNativeFrame = nativePerforming;
        let result: unknown, movement: (() => void) | null = null;
        try {
          performing = own; nativePerforming = nativeFrame;
          if (own) {
            publish(own, 'performing');
            if (own.connection) {
              if (!movementInstalled) throw Error('connection-movement-production-unavailable');
              const input: ConnectionMovementStartInput = { owner: own.owner, receipt: own.receipt, player: own.player,
                sourceMapId: own.connection.sourceMapId, from: own.connection.from, target: own.target, direction: own.connection.direction };
              movement = movementInstalled.captureConnection(input);
            }
          }
          result = originalPerform.apply(this, args);
        }
        catch (error) { if (own && pending === own) { retireTransfer(own.owner, own.receipt); failed(own, `perform-failed:${message(error)}`); } throw error; }
        finally { if (performing === own) performing = null; if (nativePerforming === nativeFrame) nativePerforming = previousNativeFrame; }
        rawCompleted?.();
        if (!entry || !own || pending !== own) return result;
        if (nativeLeases.has(own.player)) {
          failed(own, 'native-transfer-not-consumed-or-superseded');
          return result;
        }
        // Consume before any App callback. A no-op poll or late same-map reload cannot reissue arrival.
        pending = null;
        if (before?.status !== 'value' || !before.value || root.$gamePlayer !== entry.player || !receiptCurrent(entry)) { failed(entry, 'arrival-stale-or-not-transferring'); return result; }
        const observed = observeNow();
        if (observed.status !== 'value') { failed(entry, `arrival-${observed.status}:${observed.status === 'absent' ? '' : observed.reason ?? ''}`); return result; }
        const facts = observed.value;
        if (facts.transferPending || !sameLocation(facts.actual, entry.target) || facts.loadedGeometry.mapId !== entry.map.mapId || facts.loadedGeometry.width !== entry.map.width || facts.loadedGeometry.height !== entry.map.height || !receiptCurrent(entry)) { failed(entry, 'arrival-target-mismatch-or-stale'); return result; }
        try {
          // The same private resource/serial has already passed the original real arrival checks.
          // Its START proof is consumed only by the App's exact connection confirmation branch.
          movement?.();
          const confirmed = ports.confirmArrival(entry.owner, entry.receipt, facts);
          if (confirmed.status !== 'arrived' && confirmed.status !== 'duplicate') throw new Error(`transfer-confirmation-failed:${confirmed.status === 'refused' ? confirmed.reason : 'not-synchronous'}`);
        } catch (error) {
          // Native arrival is complete. Retire only this still-current receipt, preserving facts for App-only recovery.
          failed(entry, `confirm-failed:${message(error)}`, facts);
          throw error; // Do not continue into display/autosave after failed checkpoint clear/entry.
        }
        return result;
      };
      const wrapper: HostMethod = function(this: unknown, ...args: unknown[]): unknown {
        const entry = pending;
        if (entry && this === entry.player && performing === entry) return;
        const previous = performing;
        if (entry && this === entry.player) performing = entry;
        try { return perform.apply(this, args); } finally { performing = previous; }
      };
      installTravelSceneAllocation(root, {
        observation: blackoutSource?.observation,
        current: () => pending && exactLease(pending) ? { identity: pending.authority, sourceScene: pending.sourceScene } : blackoutSource?.constructionLease() ?? null,
        invalidated: identity => { const entry = pending; if (!entry || entry.authority !== identity || !exactLease(entry)) { blackoutSource?.invalidated(identity); return; } unpublish(entry); failed(entry, 'travel-map-scene-source-invalid'); },
        constructed: (identity, scene) => { if (!pending || pending.authority !== identity || !exactLease(pending)) blackoutSource?.constructed(identity, scene); },
        accepted: (identity, scene) => { const entry = pending; if (!entry || entry.authority !== identity || !exactLease(entry)) { if (!blackoutSource) throw Error('travel-scene-lease-stale'); blackoutSource.accepted(identity, scene); return; } entry.scene = scene; publish(entry, 'reserved'); },
      });
      installed = { prototype, native: { playerPrototype: prototype, performTransfer: originalPerform, reserveTransfer: originalReserve }, wrapper, reserveWrapper, clearWrapper };
      transferHooks.add(prototype);
      prototype.performTransfer = wrapper;
      prototype.reserveTransfer = reserveWrapper;
      prototype.clearTransferInfo = clearWrapper;
    },
  };
  return host;
}
