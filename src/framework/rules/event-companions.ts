/** WP13 ordered event companions. Host instances, movement and save writes belong to consumers. */
import { clone } from './value';
import { newWorldState, worldStateProblems } from './world-state';
import type { EventCompanionState } from './world-state';
import type { WorldDirection, WorldFact, WorldLocation, WorldPoint } from './world-data';
import type { CompanionPlacement } from './companion-placement';
import { isTravelLocation } from './world-travel';

export interface CompanionOrigin { originMapId: number; originEventId: number }
export const companionIdentity = (origin: CompanionOrigin): string => `${origin.originMapId}/${origin.originEventId}`;
export function isEventCompanion(raw: unknown): raw is EventCompanionState {
  return worldStateProblems({ ...newWorldState(), companions: [raw] }).length === 0;
}
export type CompanionSource = WorldFact<{ cloneable: boolean }>;
function sourceIssue(source: CompanionSource): string | null {
  if (source.status !== 'value') return `source-${source.status}`;
  if (!source.value || typeof source.value.cloneable !== 'boolean') return 'source-invalid';
  return source.value.cloneable ? null : 'source-not-cloneable';
}
export type CompanionRegistration = { status: 'registered' | 'duplicate'; companions: EventCompanionState[] }
  | { status: 'refused'; reason: string };
/** Validate origin event availability before adding; duplicate registration preserves the first record. */
export function registerEventCompanion(companions: readonly EventCompanionState[], candidate: unknown, source: CompanionSource): CompanionRegistration {
  if (!isEventCompanion(candidate)) return { status: 'refused', reason: 'invalid-companion' };
  if (companions.some(c => companionIdentity(c) === companionIdentity(candidate))) return { status: 'duplicate', companions: clone([...companions]) };
  const reason = sourceIssue(source);
  if (reason) return { status: 'refused', reason };
  return { status: 'registered', companions: clone([...companions, candidate]) };
}
export type CompanionRemoval = { kind: 'origin'; originMapId: number; originEventId: number } | { kind: 'name'; name: string } | { kind: 'all' };
export function removeEventCompanions(companions: readonly EventCompanionState[], removal: CompanionRemoval): EventCompanionState[] {
  return clone(companions.filter(c => removal.kind === 'all' ? false : removal.kind === 'name' ? c.name !== removal.name : companionIdentity(c) !== companionIdentity(removal)));
}
export interface CompanionRecovery {
  companions: EventCompanionState[];
  instances: { origin: CompanionOrigin; action: 'restore' | 'retain-unavailable'; reason?: string }[];
}
/** Invalid sources remain in the saved chain. Retry this plan or explicitly remove them by origin/name. */
export function planCompanionRecovery(companions: readonly EventCompanionState[], readSource: (origin: CompanionOrigin) => CompanionSource): CompanionRecovery {
  const instances: CompanionRecovery['instances'] = [];
  for (const companion of companions) {
    const origin = { originMapId: companion.originMapId, originEventId: companion.originEventId };
    let source: CompanionSource;
    try { source = readSource(origin); } catch { source = { status: 'unavailable', reason: 'source-read-failed' }; }
    const reason = sourceIssue(source);
    instances.push(reason ? { origin, action: 'retain-unavailable', reason } : { origin, action: 'restore' });
  }
  return { companions: clone([...companions]), instances };
}
export interface CompanionTransferPlan { companions: EventCompanionState[]; transferHidden: string[] }
/** Normal 201 transfers carry companions, including same-map transfers; this is not a travel guard. */
export function planCompanionTransfer(companions: readonly EventCompanionState[], player: WorldLocation): CompanionTransferPlan {
  if (!isTravelLocation(player)) throw new Error('invalid-companion-transfer-target');
  return { companions: companions.map(c => ({ ...clone(c), location: { ...player }, appearance: { ...clone(c.appearance), opacity: 255 } })), transferHidden: companions.map(companionIdentity) };
}
export const companionVisible = (companion: Readonly<EventCompanionState>, transferHidden: readonly string[]): boolean => companion.visible && !transferHidden.includes(companionIdentity(companion));
/** The mask never stores/restores an old show/hide intent. Native gather keeps its native membership. */
export function companionFollowerPolicy(authorVisible: boolean, companions: readonly EventCompanionState[]): { nativeVisible: boolean; gatherMembers: 'native-only' } {
  return { nativeVisible: authorVisible && companions.length === 0, gatherMembers: 'native-only' };
}
/** Runtime-only hidden bits clear on player movement start; saved visible flags remain untouched. */
export const companionsOnPlayerMove = (): { transferHidden: string[] } => ({ transferHidden: [] });

export interface CompanionRelation {
  connected: boolean;
  /** Companion's current point translated into the leader's map coordinate system. */
  current: WorldPoint;
  /** Optional host-verified ledge landing; otherwise the target is one tile behind the leader. */
  ledgeTarget?: WorldPoint;
  /** Normalized actual behind/ledge target. Relative frame is used for motion distance;
   * logical map/point is the geometry-valid observed/persistent location. */
  placement?: CompanionPlacement;
}
export interface CompanionTrailPorts {
  relation(companion: WorldLocation, leader: WorldLocation): WorldFact<CompanionRelation>;
  /** Use the follower's entering-direction semantics, not strict all-direction tile passage. */
  canEnter(point: WorldPoint, movingDirection: WorldDirection): WorldFact<boolean>;
  forcedRoute(origin: CompanionOrigin): WorldFact<boolean>;
}
export type CompanionMotion = { kind: 'stay' | 'forced-route' }
  | { kind: 'locate'; target: WorldLocation; placement?: CompanionPlacement }
  | { kind: 'walk'; target: WorldLocation; placement?: CompanionPlacement; direction: WorldDirection; steps: 1 | 2; through: boolean }
  | { kind: 'jump'; target: WorldLocation; placement?: CompanionPlacement; direction: WorldDirection; distance: 2 }
  | { kind: 'blocked'; reason: string };
export interface CompanionTrailEntry { origin: CompanionOrigin; leader: WorldLocation; motion: CompanionMotion }
const sameMapPoint = (point: WorldPoint, mapId: number): boolean => Number.isSafeInteger(point.mapId) && point.mapId === mapId && Number.isSafeInteger(point.x) && Number.isSafeInteger(point.y);
function behind(leader: WorldLocation): WorldPoint {
  return { mapId: leader.mapId, x: leader.x + (leader.direction === 6 ? -1 : leader.direction === 4 ? 1 : 0), y: leader.y + (leader.direction === 2 ? -1 : leader.direction === 8 ? 1 : 0) };
}
function readBoolean(read: () => WorldFact<boolean>): WorldFact<boolean> {
  try {
    const fact = read();
    return fact.status === 'value' && typeof fact.value !== 'boolean' ? { status: 'invalid' } : fact;
  } catch { return { status: 'unavailable' }; }
}
function blocked(fact: WorldFact<boolean>, subject: string): CompanionMotion | null {
  return fact.status === 'value' ? null : { kind: 'blocked', reason: `${subject}-${fact.status}` };
}
/** One planning observation. The executor re-observes actual committed positions before each
 * successive follower; door-route snapshots are a separate WP13 §6.3 operation. */
export function planCompanionTrail(companions: readonly EventCompanionState[], player: WorldLocation, ports: CompanionTrailPorts, instant = false): CompanionTrailEntry[] {
  if (!isTravelLocation(player)) throw new Error('invalid-companion-leader');
  const playerSnapshot = { ...player };
  const snapshots = companions.map(c => clone(c));
  const result: CompanionTrailEntry[] = [];
  for (const [i, companion] of snapshots.entries()) {
    const leader = i === 0 ? { ...playerSnapshot } : { ...snapshots[i - 1]!.location };
    result.push(planCompanionTrailEntry(companion, leader, playerSnapshot, ports, instant));
  }
  return result;
}
/** Plan exactly the next follower from the executor's current committed prefix, without
 * querying already-completed or later followers' providers again. */
export function planCompanionTrailEntry(companion: Readonly<EventCompanionState>, leader: WorldLocation, player: WorldLocation, ports: CompanionTrailPorts, instant = false): CompanionTrailEntry {
  if (!isTravelLocation(player) || !isTravelLocation(leader) || !isEventCompanion(companion)) throw Error('invalid-companion-leader');
  const origin = { originMapId: companion.originMapId, originEventId: companion.originEventId }, observedLeader = { ...leader };
  const forced = readBoolean(() => ports.forcedRoute(origin));
  let motion = blocked(forced, 'forced-route');
  if (!motion && forced.status === 'value' && forced.value) motion = { kind: 'forced-route' };
  if (!motion) motion = planMotion({ ...companion.location }, observedLeader, { ...player }, ports, instant);
  return { origin, leader: observedLeader, motion };
}
function planMotion(location: WorldLocation, leader: WorldLocation, player: WorldLocation, ports: CompanionTrailPorts, instant: boolean): CompanionMotion {
  let relation: WorldFact<CompanionRelation>;
  try { relation = ports.relation({ ...location }, { ...leader }); }
  catch { return { kind: 'blocked', reason: 'relation-unavailable' }; }
  if (relation.status !== 'value') return { kind: 'blocked', reason: `relation-${relation.status}` };
  const r = relation.value;
  if (!r || typeof r.connected !== 'boolean') return { kind: 'blocked', reason: 'relation-invalid' };
  if (location.mapId === leader.mapId && !r.connected) return { kind: 'blocked', reason: 'relation-invalid' };
  if (!r.connected) return { kind: 'locate', target: { ...leader } };
  if (!r.current || !sameMapPoint(r.current, leader.mapId) || r.ledgeTarget && !sameMapPoint(r.ledgeTarget, leader.mapId)) return { kind: 'blocked', reason: 'relation-invalid' };
  const p = r.ledgeTarget ?? behind(leader), relative: WorldLocation = { ...p, direction: leader.direction };
  const placement = r.placement;
  if (placement && (!isTravelLocation(placement.logical) || !isTravelLocation(placement.relative)
    || placement.relative.mapId !== relative.mapId || placement.relative.x !== relative.x || placement.relative.y !== relative.y
    || placement.relative.direction !== relative.direction || placement.logical.direction !== leader.direction
    || placement.connectionRecord !== null && (!Number.isSafeInteger(placement.connectionRecord) || placement.connectionRecord < 0))) return { kind: 'blocked', reason: 'placement-invalid' };
  const target: WorldLocation = placement ? { ...placement.logical } : relative;
  const positioned = { target, ...(placement ? { placement: clone(placement) } : {}) };
  if (!isTravelLocation(target)) return { kind: 'blocked', reason: 'invalid-trail-target' };
  const dx = relative.x - r.current.x, dy = relative.y - r.current.y;
  if (instant) return { kind: 'locate', ...positioned };
  if (dx === 0 && dy === 0) return { kind: 'stay' };
  const distance = Math.abs(dx) + Math.abs(dy);
  if (dx !== 0 && dy !== 0 || distance > 2) return { kind: 'locate', ...positioned };
  const direction: WorldDirection = dx > 0 ? 6 : dx < 0 ? 4 : dy > 0 ? 2 : 8;
  const enter = (point: WorldPoint): WorldFact<boolean> => readBoolean(() => ports.canEnter({ ...point }, direction));
  if (distance === 1) {
    if (relative.mapId === player.mapId && relative.x === player.x && relative.y === player.y) return { kind: 'walk', ...positioned, direction, steps: 1, through: true };
    const targetPassage = enter(relative), issue = blocked(targetPassage, 'target-passage');
    if (issue) return issue;
    if (targetPassage.status === 'value' && targetPassage.value) return { kind: 'walk', ...positioned, direction, steps: 1, through: false };
    const start = enter(r.current), startIssue = blocked(start, 'start-passage');
    if (startIssue) return startIssue;
    return start.status === 'value' && !start.value ? { kind: 'walk', ...positioned, direction, steps: 1, through: true } : { kind: 'stay' };
  }
  const middle = { mapId: leader.mapId, x: r.current.x + Math.sign(dx), y: r.current.y + Math.sign(dy) };
  const middlePassage = enter(middle), middleIssue = blocked(middlePassage, 'middle-passage');
  if (middleIssue) return middleIssue;
  if (middlePassage.status === 'value' && middlePassage.value) return { kind: 'walk', ...positioned, direction, steps: 2, through: false };
  const targetPassage = enter(relative), targetIssue = blocked(targetPassage, 'target-passage');
  if (targetIssue) return targetIssue;
  if (targetPassage.status === 'value' && !targetPassage.value) return { kind: 'stay' };
  const start = enter(r.current), startIssue = blocked(start, 'start-passage');
  if (startIssue) return startIssue;
  return start.status === 'value' && start.value ? { kind: 'jump', ...positioned, direction, distance: 2 } : { kind: 'walk', ...positioned, direction, steps: 2, through: true };
}
/** Call after observing host movement. A two-step walk may stop early; plans do not assert arrival. */
export function recordCompanionLocation(companions: readonly EventCompanionState[], origin: CompanionOrigin, actual: unknown): EventCompanionState[] {
  if (!isTravelLocation(actual)) throw new Error('invalid-companion-observed-location');
  return companions.map(c => companionIdentity(c) === companionIdentity(origin) ? { ...clone(c), location: { ...actual } } : clone(c));
}
