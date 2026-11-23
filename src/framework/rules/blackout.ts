/**
 * WP61 §7 / 5.5 A's settlement integration: pure return plans and arrival checks.
 * The application owns settlement, installation, operation locks and generations.
 * A battle plan is admitted only after its existing settlement and lateHeal/evolution
 * sequence; this module never authenticates an origin or executes a host effect.
 */
import type { WorldLocation } from './world-data';
import type { BlackoutSelection } from './blackout-checkpoint';
export type { BlackoutSelection } from './blackout-checkpoint';
import type { BlackoutOrigin, PendingBlackoutReturn, WorldState } from './world-state';

export type BlackoutMapResource =
  | { status: 'exists'; width: number; height: number }
  | { status: 'missing' }
  | { status: 'unavailable' };

export type BlackoutSelectionResult =
  | { status: 'selected'; selection: BlackoutSelection }
  | { status: 'refused'; reason: 'invalid-location' };

export type BlackoutDestination =
  | { branch: 'center' | 'home'; target: WorldLocation }
  | { branch: 'no-home' }
  | { branch: 'home-map-missing'; selectedHome: WorldLocation };

export type BlackoutEffect =
  | 'count-blackout' | 'heal-party' | 'show-return-message' | 'debug-missing-home'
  | 'cancel-vehicles' | 'clear-event-companions' | 'set-starting-over'
  | 'set-transfer-target' | 'get-off-vehicle' | 'transfer-if-map-scene'
  | 'request-map-refresh' | 'clear-escape-point';

export interface BlackoutSettlementPlan {
  owner: 'battle' | 'field';
  /** Before destination resolution; field installs this once with its completed-step ownership. */
  effects: readonly BlackoutEffect[];
}
export interface BlackoutReturnPlan {
  origin: BlackoutOrigin;
  settlement: BlackoutSettlementPlan;
  destination: BlackoutDestination;
  /** Ordered semantic steps, not an atomic host transaction or a persisted execution log. */
  effects: readonly BlackoutEffect[];
  clearWorldFields: readonly ('escapePoint' | 'surfing' | 'companions')[];
}
export type BlackoutRefusal =
  | 'invalid-origin' | 'invalid-location' | 'invalid-map-resource' | 'map-unavailable'
  | 'map-missing' | 'target-out-of-bounds' | 'invalid-checkpoint' | 'invalid-return-id'
  | 'return-id-mismatch' | 'arrival-not-awaited' | 'host-transfer-pending'
  | 'invalid-transfer-observation' | 'arrival-target-mismatch';
export type BlackoutPlanResult =
  | { status: 'planned'; plan: BlackoutReturnPlan }
  | { status: 'refused'; reason: BlackoutRefusal; settlement?: BlackoutSettlementPlan };

export interface BlackoutPlanInput {
  origin: BlackoutOrigin;
  world: Readonly<Pick<WorldState, 'recentCenter'>>;
  characterHome?: Readonly<WorldLocation> | null;
  globalHome?: Readonly<WorldLocation> | null;
  /** Only the selected destination is queried. A failed read is unavailable, never missing. */
  mapResource(mapId: number): BlackoutMapResource;
}
export type BlackoutTargetResult =
  | { status: 'valid'; target: WorldLocation }
  | { status: 'refused'; reason: BlackoutRefusal };

type DataRecord = Record<string, unknown>;
function dataRecord(value: unknown, keys: readonly string[]): DataRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some(key => typeof key !== 'string' || !keys.includes(key))) return null;
  const copy: DataRecord = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
    Object.defineProperty(copy, key, { value: descriptor.value, enumerable: true });
  }
  return copy;
}
const safeInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
function location(value: unknown): WorldLocation | null {
  const point = dataRecord(value, ['mapId', 'x', 'y', 'direction']);
  if (!point || !safeInteger(point.mapId) || point.mapId < 1 || !safeInteger(point.x) || !safeInteger(point.y)) return null;
  const direction = point.direction;
  if (direction !== 2 && direction !== 4 && direction !== 6 && direction !== 8) return null;
  return { mapId: point.mapId, x: point.x, y: point.y, direction };
}
function origin(value: unknown): BlackoutOrigin | null {
  const kind = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, 'kind') : undefined;
  if (!kind || !('value' in kind)) return null;
  if (kind.value === 'battle') {
    const record = dataRecord(value, ['kind', 'battleId', 'rawHash']);
    if (record && typeof record.battleId === 'string' && record.battleId.length > 0 && typeof record.rawHash === 'string' && /^[a-f0-9]{64}$/.test(record.rawHash)) return { kind: 'battle', battleId: record.battleId, rawHash: record.rawHash };
  } else if (kind.value === 'field') {
    const record = dataRecord(value, ['kind', 'sourceId']);
    if (record && typeof record.sourceId === 'string' && record.sourceId.length > 0) return { kind: 'field', sourceId: record.sourceId };
  }
  return null;
}
function checkpoint(value: unknown): PendingBlackoutReturn | null {
  const record = dataRecord(value, ['id', 'origin', 'branch', 'target', 'stage']);
  if (!record || typeof record.id !== 'string' || record.id.length === 0) return null;
  const source = origin(record.origin), target = location(record.target);
  if (!source || !target || record.branch !== 'center' && record.branch !== 'home' || record.stage !== 'ready' && record.stage !== 'awaiting-arrival') return null;
  return { id: record.id, origin: source, branch: record.branch, target, stage: record.stage };
}
function sameLocation(a: WorldLocation, b: WorldLocation): boolean {
  return a.mapId === b.mapId && a.x === b.x && a.y === b.y && a.direction === b.direction;
}

/** Structural MZ location and loaded target geometry are separate checks. No clamping or wrapping. */
export function validateBlackoutTarget(value: unknown, resource: BlackoutMapResource): BlackoutTargetResult {
  const target = location(value);
  if (!target) return { status: 'refused', reason: 'invalid-location' };
  const status = resource && typeof resource === 'object' ? Object.getOwnPropertyDescriptor(resource, 'status') : undefined;
  if (!status || !('value' in status)) return { status: 'refused', reason: 'invalid-map-resource' };
  if (status.value === 'unavailable' || status.value === 'missing') {
    if (!dataRecord(resource, ['status'])) return { status: 'refused', reason: 'invalid-map-resource' };
    return { status: 'refused', reason: status.value === 'missing' ? 'map-missing' : 'map-unavailable' };
  }
  const map = dataRecord(resource, ['status', 'width', 'height']);
  if (!map || map.status !== 'exists' || !safeInteger(map.width) || map.width < 1 || !safeInteger(map.height) || map.height < 1) return { status: 'refused', reason: 'invalid-map-resource' };
  if (target.x < 0 || target.y < 0 || target.x >= map.width || target.y >= map.height) return { status: 'refused', reason: 'target-out-of-bounds' };
  return { status: 'valid', target };
}

/** Approved 5.5 integration reuses battle's heal/count/money; field never acquires money ownership. */
export function blackoutSettlementPlan(kind: BlackoutOrigin['kind']): BlackoutSettlementPlan {
  if (kind === 'battle') return { owner: 'battle', effects: [] };
  if (kind === 'field') return { owner: 'field', effects: ['count-blackout', 'heal-party'] };
  throw new RangeError('invalid blackout origin kind');
}

function completePlan(source: BlackoutOrigin, destination: BlackoutDestination): BlackoutReturnPlan {
  const settlement = blackoutSettlementPlan(source.kind);
  if (destination.branch === 'center' || destination.branch === 'home') return {
    origin: source, settlement, destination,
    effects: ['show-return-message', 'cancel-vehicles', 'clear-event-companions', 'set-starting-over', 'set-transfer-target', 'get-off-vehicle', 'transfer-if-map-scene', 'request-map-refresh', 'clear-escape-point'],
    clearWorldFields: ['surfing', 'companions', 'escapePoint'],
  };
  // WP61's second field heal is a semantic branch step. An application may combine
  // idempotent writes in one installation when no intervening state is observable.
  const heal: BlackoutEffect[] = source.kind === 'field' ? ['heal-party'] : [];
  return destination.branch === 'no-home'
    ? { origin: source, settlement, destination, effects: ['show-return-message', ...heal, 'clear-escape-point'], clearWorldFields: ['escapePoint'] }
    : { origin: source, settlement, destination, effects: ['debug-missing-home', ...heal], clearWorldFields: [] };
}

/** Only configuration absence permits lower-priority fallback. Does not query resources or settle. */
export function selectBlackoutDestination(input: Pick<BlackoutPlanInput, 'world' | 'characterHome' | 'globalHome'>): BlackoutSelectionResult {
  const center = input.world.recentCenter;
  const selected = center !== null ? center : input.characterHome ?? input.globalHome;
  if (center === null && (selected === null || selected === undefined)) return { status: 'selected', selection: { branch: 'no-home' } };
  const target = location(selected);
  return target ? { status: 'selected', selection: { branch: center === null ? 'home' : 'center', target } }
    : { status: 'refused', reason: 'invalid-location' };
}

/** A malformed or unavailable higher-priority target is a failure, not a request to choose another home. */
export function planBlackoutReturn(input: BlackoutPlanInput): BlackoutPlanResult {
  const source = origin(input.origin);
  if (!source) return { status: 'refused', reason: 'invalid-origin' };
  const settlement = blackoutSettlementPlan(source.kind);
  const selected = selectBlackoutDestination(input);
  if (selected.status === 'refused') return { ...selected, settlement };
  const choice = selected.selection;
  if (choice.branch === 'no-home') return { status: 'planned', plan: completePlan(source, choice) };
  const target = choice.target;
  let resource: BlackoutMapResource;
  try { resource = input.mapResource(target.mapId); }
  catch { return { status: 'refused', reason: 'map-unavailable', settlement }; }
  const checked = validateBlackoutTarget(target, resource);
  if (checked.status === 'refused') {
    if (choice.branch === 'home' && checked.reason === 'map-missing') return { status: 'planned', plan: completePlan(source, { branch: 'home-map-missing', selectedHome: target }) };
    return { ...checked, settlement };
  }
  return { status: 'planned', plan: completePlan(source, { branch: choice.branch, target: checked.target }) };
}

export type BlackoutCheckpointResult =
  | { status: 'ready' | 'awaiting-arrival' | 'duplicate'; pending: PendingBlackoutReturn }
  | { status: 'complete' | 'arrived'; pending: null }
  | { status: 'refused'; reason: BlackoutRefusal; pending: PendingBlackoutReturn | null };

/** Create after the application's applicable prefix/branch state writes, in that same installation. */
export function createBlackoutCheckpoint(id: string, plan: BlackoutReturnPlan): BlackoutCheckpointResult {
  if (typeof id !== 'string' || id.length === 0) return { status: 'refused', reason: 'invalid-return-id', pending: null };
  if (plan.destination.branch === 'no-home' || plan.destination.branch === 'home-map-missing') return { status: 'complete', pending: null };
  const pending = checkpoint({ id, origin: plan.origin, branch: plan.destination.branch, target: plan.destination.target, stage: 'ready' });
  return pending ? { status: 'ready', pending } : { status: 'refused', reason: 'invalid-checkpoint', pending: null };
}

/** A successful reserve changes only the stage. It never confirms arrival or clears the checkpoint. */
export function markBlackoutReserved(value: unknown, expectedId: string): BlackoutCheckpointResult {
  const pending = checkpoint(value);
  if (!pending) return { status: 'refused', reason: 'invalid-checkpoint', pending: null };
  if (pending.id !== expectedId) return { status: 'refused', reason: 'return-id-mismatch', pending };
  if (pending.stage === 'awaiting-arrival') return { status: 'duplicate', pending };
  return { status: 'awaiting-arrival', pending: { ...pending, stage: 'awaiting-arrival' } };
}

export interface BlackoutTransferObservation {
  returnId: string;
  actual: WorldLocation;
  /** Must be the current host observation, including any cold-load/reloadMapIfUpdated transfer. */
  transferPending: boolean;
  targetMap: BlackoutMapResource;
}
function arrivalCheck(pending: PendingBlackoutReturn, observation: BlackoutTransferObservation): BlackoutRefusal | null {
  if (pending.id !== observation.returnId) return 'return-id-mismatch';
  if (typeof observation.transferPending !== 'boolean') return 'invalid-transfer-observation';
  if (observation.transferPending) return 'host-transfer-pending';
  const actual = location(observation.actual);
  if (!actual) return 'invalid-location';
  const checked = validateBlackoutTarget(pending.target, observation.targetMap);
  if (checked.status === 'refused') return checked.reason;
  return sameLocation(pending.target, actual) ? null : 'arrival-target-mismatch';
}

/** Called synchronously after real performTransfer; the caller releases its active lock after installation. */
export function confirmBlackoutArrival(value: unknown, observation: BlackoutTransferObservation): BlackoutCheckpointResult {
  const pending = checkpoint(value);
  if (!pending) return { status: 'refused', reason: 'invalid-checkpoint', pending: null };
  const reason = arrivalCheck(pending, observation);
  if (reason) return { status: 'refused', reason, pending };
  if (pending.stage !== 'awaiting-arrival') return { status: 'refused', reason: 'arrival-not-awaited', pending };
  return { status: 'arrived', pending: null };
}

export type BlackoutResumeResult =
  | { status: 'reserve'; pending: PendingBlackoutReturn; target: WorldLocation }
  | { status: 'arrived'; pending: null }
  | { status: 'refused'; reason: BlackoutRefusal; pending: PendingBlackoutReturn | null };

/** No host transfer is started here. Scene readiness and runtime generation/lock ownership stay in Application. */
export function planBlackoutResume(value: unknown, observation: BlackoutTransferObservation): BlackoutResumeResult {
  const pending = checkpoint(value);
  if (!pending) return { status: 'refused', reason: 'invalid-checkpoint', pending: null };
  const reason = arrivalCheck(pending, observation);
  if (reason && reason !== 'arrival-target-mismatch') return { status: 'refused', reason, pending };
  if (reason === null && pending.stage === 'awaiting-arrival') return { status: 'arrived', pending: null };
  return { status: 'reserve', pending, target: { ...pending.target } };
}
