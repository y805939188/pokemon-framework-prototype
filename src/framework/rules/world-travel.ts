/** WP11 topology and WP59 travel plans. Plans never move a host or commit state. */
import { badgeCount, hasBadge } from './economy';
import { resolveConfig } from './config';
import type { RuleConfig } from './config';
import type { Member } from './types';
import type { ConnectionEndpoint, MapConnectionRecord, WorldDirection, WorldFact, WorldLocation, WorldPoint } from './world-data';
import { newWorldState, worldStateProblems } from './world-state';
import type { WorldState } from './world-state';

export type TravelKind = 'fly' | 'dig' | 'teleport' | 'escape-rope';
export type TravelPlaces = Pick<WorldState, 'healingSpot' | 'escapePoint'> & { characterHome: WorldPoint | null; globalHome: WorldPoint | null };
type TravelMember = Pick<Member, 'id' | 'isEgg' | 'moves'>;
export interface TravelQualification {
  companions: readonly WorldState['companions'][number][];
  places: TravelPlaces;
  outdoor: WorldFact<boolean>;
  badges: readonly boolean[];
  settings?: Partial<RuleConfig>;
  debug?: boolean;
  party: readonly TravelMember[];
  /** Fly's explicit-member check deliberately does not recheck its moves. UI collection does. */
  flyMember?: TravelMember;
}
export type TravelEligibility = { status: 'eligible'; confirmation: boolean } | { status: 'refused' | 'blocked'; reason: string };
export const travelNeedsConfirmation = (kind: TravelKind): boolean => kind === 'dig' || kind === 'teleport';
export function findTravelMember(party: readonly TravelMember[], moveId: 'fly' | 'dig' | 'teleport'): TravelMember | undefined {
  return party.find(member => member.isEgg !== true && member.moves.some(move => move.id === moveId));
}
export function teleportDestination(places: TravelPlaces): WorldPoint | null {
  const point = places.healingSpot ?? places.characterHome ?? places.globalHome;
  return point ? { ...point } : null;
}
export function qualifyTravel(kind: TravelKind, input: TravelQualification): TravelEligibility {
  if (input.companions.length) return { status: 'refused', reason: 'companions-present' };
  if (kind === 'fly') {
    const config = resolveConfig(input.settings), gate = config.BADGE_FOR_FLY;
    if (!input.debug && gate >= 0 && !(config.FIELD_MOVES_COUNT_BADGES ? badgeCount(input.badges) >= gate : hasBadge(input.badges, gate))) return { status: 'refused', reason: 'badge-required' };
    if (!input.flyMember && !input.debug && !findTravelMember(input.party, 'fly')) return { status: 'refused', reason: 'fly-member-required' };
  }
  if (kind === 'fly' || kind === 'teleport') {
    if (input.outdoor.status !== 'value') return { status: 'blocked', reason: `outdoor-${input.outdoor.status}` };
    if (typeof input.outdoor.value !== 'boolean') return { status: 'blocked', reason: 'outdoor-invalid' };
    if (!input.outdoor.value) return { status: 'refused', reason: 'outdoor-required' };
  }
  if ((kind === 'dig' || kind === 'escape-rope') && input.places.escapePoint === null) return { status: 'refused', reason: 'escape-point-required' };
  if (kind === 'teleport' && !teleportDestination(input.places)) return { status: 'refused', reason: 'return-point-required' };
  return { status: 'eligible', confirmation: travelNeedsConfirmation(kind) };
}

export type TravelEffect = { kind: 'message'; message: 'escape-rope' } | { kind: 'cancel-vehicles' }
  | { kind: 'animation'; move: 'fly' | 'teleport' } | { kind: 'increment-stat'; stat: 'fly_count'; amount: 1 }
  | { kind: 'transfer'; target: WorldLocation; preserveSurfing: false }
  | { kind: 'map-bgm' | 'refresh' | 'fly-presentation-tail' | 'clear-escape-point' | 'clear-fly-selection' };
export interface TravelPlan { kind: TravelKind; target: WorldLocation; effects: TravelEffect[] }
export type TravelPlanResult = { status: 'planned'; plan: TravelPlan } | { status: 'confirmation-required' | 'cancelled' }
  | { status: 'refused'; reason: string };
/** Effect stage does not repeat menu badge/member qualification. Execute effects in order; stop on failure. */
export function planTravel(kind: TravelKind, places: TravelPlaces, options: { confirmation?: 'confirmed' | 'cancelled'; flyDestination?: WorldPoint | null } = {}): TravelPlanResult {
  const point = kind === 'fly' ? options.flyDestination : kind === 'teleport' ? teleportDestination(places) : places.escapePoint;
  if (!point) return kind === 'fly' ? { status: 'cancelled' } : { status: 'refused', reason: 'destination-required' };
  if (travelNeedsConfirmation(kind) && options.confirmation !== 'confirmed') return { status: options.confirmation === 'cancelled' ? 'cancelled' : 'confirmation-required' };
  const target: WorldLocation = { ...point, direction: kind === 'dig' || kind === 'escape-rope' ? places.escapePoint!.direction : 2 };
  if (!isTravelLocation(target)) return { status: 'refused', reason: 'invalid-destination' };
  const effects: TravelEffect[] = [];
  if (kind === 'escape-rope') effects.push({ kind: 'message', message: 'escape-rope' });
  if (kind === 'dig' || kind === 'escape-rope') effects.push({ kind: 'cancel-vehicles' });
  if (kind === 'fly' || kind === 'teleport') effects.push({ kind: 'animation', move: kind });
  if (kind === 'fly') effects.push({ kind: 'increment-stat', stat: 'fly_count', amount: 1 });
  effects.push({ kind: 'transfer', target: { ...target }, preserveSurfing: false }, { kind: 'map-bgm' }, { kind: 'refresh' });
  if (kind === 'fly') effects.push({ kind: 'fly-presentation-tail' });
  effects.push({ kind: 'clear-escape-point' });
  if (kind === 'fly') effects.push({ kind: 'clear-fly-selection' });
  return { status: 'planned', plan: { kind, target, effects } };
}
export function isTravelLocation(raw: unknown): raw is WorldLocation {
  return worldStateProblems({ ...newWorldState(), escapePoint: raw }).length === 0 && raw !== null;
}
export interface MapGeometry { mapId: number; width: number; height: number }
export type MapGeometryReader = (mapId: number) => WorldFact<MapGeometry>;
export type TargetCheck = { status: 'ready'; target: WorldLocation } | { status: 'missing' | 'unavailable' | 'invalid'; reason: string };
const safe = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
function validGeometry(size: MapGeometry): boolean { return !!size && typeof size === 'object' && safe(size.mapId) && size.mapId > 0 && safe(size.width) && safe(size.height) && size.width >= 0 && size.height >= 0; }
function inside(p: { x: number; y: number }, size: Pick<MapGeometry, 'width' | 'height'>): boolean { return p.x >= 0 && p.x < size.width && p.y >= 0 && p.y < size.height; }
export function validateTravelTarget(target: unknown, geometry: WorldFact<MapGeometry>): TargetCheck {
  if (!isTravelLocation(target)) return { status: 'invalid', reason: 'invalid-target' };
  if (geometry.status !== 'value') return { status: geometry.status === 'absent' ? 'missing' : geometry.status, reason: `target-map-${geometry.status}` };
  if (!validGeometry(geometry.value) || geometry.value.mapId !== target.mapId) return { status: 'invalid', reason: 'target-map-geometry-mismatch' };
  if (!inside(target, geometry.value)) return { status: 'invalid', reason: 'target-out-of-bounds' };
  return { status: 'ready', target: { ...target } };
}

export interface DirectedConnection { recordIndex: number; from: ConnectionEndpoint; to: ConnectionEndpoint }
export type ConnectionIndex = ReadonlyMap<number, readonly DirectedConnection[]>;
export function indexMapConnections(records: readonly MapConnectionRecord[]): ConnectionIndex {
  const index = new Map<number, DirectedConnection[]>();
  for (const [recordIndex, record] of records.entries()) for (const [from, to] of [[record.a, record.b], [record.b, record.a]] as const) {
    const list = index.get(from.mapId) ?? [];
    list.push({ recordIndex, from: { ...from, anchor: typeof from.anchor === 'object' ? { ...from.anchor } : from.anchor }, to: { ...to, anchor: typeof to.anchor === 'object' ? { ...to.anchor } : to.anchor } });
    index.set(from.mapId, list);
  }
  return index;
}
export function connectionAnchor(endpoint: ConnectionEndpoint, size: Pick<MapGeometry, 'width' | 'height'>): { x: number; y: number } {
  switch (endpoint.anchor) {
    case 'N': return { x: endpoint.offset, y: 0 };
    case 'S': return { x: endpoint.offset, y: size.height };
    case 'E': return { x: size.width, y: endpoint.offset };
    case 'W': return { x: 0, y: endpoint.offset };
    default: return { ...endpoint.anchor };
  }
}
export type ConnectionTarget = { status: 'target'; target: WorldLocation; recordIndex: number; passageDirection: 0 }
  | { status: 'within-map' } | { status: 'no-connection' }
  | { status: 'missing' | 'unavailable' | 'invalid'; reason: string };
function readGeometry(read: MapGeometryReader, id: number): WorldFact<MapGeometry> {
  try { return read(id); } catch { return { status: 'unavailable', reason: 'map-geometry-read-failed' }; }
}
/** First geometrically valid record wins; readiness failures cannot be replaced with a later route. */
export function resolveConnectionTarget(index: ConnectionIndex, candidate: WorldLocation, read: MapGeometryReader): ConnectionTarget {
  if (!isTravelLocation(candidate)) return { status: 'invalid', reason: 'invalid-source-candidate' };
  const source = readGeometry(read, candidate.mapId);
  if (source.status !== 'value') return { status: source.status === 'absent' ? 'missing' : source.status, reason: `source-map-${source.status}` };
  if (!validGeometry(source.value) || source.value.mapId !== candidate.mapId) return { status: 'invalid', reason: 'invalid-source-geometry' };
  if (inside(candidate, source.value)) return { status: 'within-map' };
  for (const connection of index.get(candidate.mapId) ?? []) {
    const destination = readGeometry(read, connection.to.mapId);
    if (destination.status !== 'value') return { status: destination.status === 'absent' ? 'missing' : destination.status, reason: `neighbor-map-${destination.status}` };
    if (!validGeometry(destination.value) || destination.value.mapId !== connection.to.mapId) return { status: 'invalid', reason: 'invalid-neighbor-geometry' };
    if (source.value.width === 0 || source.value.height === 0 || destination.value.width === 0 || destination.value.height === 0) continue;
    const a = connectionAnchor(connection.from, source.value), b = connectionAnchor(connection.to, destination.value);
    const target = { mapId: connection.to.mapId, x: candidate.x + b.x - a.x, y: candidate.y + b.y - a.y, direction: candidate.direction };
    if (!isTravelLocation(target)) return { status: 'invalid', reason: 'connection-coordinate-overflow' };
    if (inside(target, destination.value)) return { status: 'target', target, recordIndex: connection.recordIndex, passageDirection: 0 };
  }
  return { status: 'no-connection' };
}
export interface ConnectionPassage { direction0Passable: boolean; characterBlocked: boolean }
/** Host computes direction 0, rather than source/destination single-direction tile bits. */
export function qualifyConnectionPassage(target: ConnectionTarget, geometry: WorldFact<MapGeometry>, passage: WorldFact<ConnectionPassage>, bypass = false): { status: 'allowed'; target: WorldLocation } | { status: 'refused'; reason: string } | Exclude<TargetCheck, { status: 'ready' }> {
  if (target.status !== 'target') {
    if (target.status === 'within-map' || target.status === 'no-connection') return { status: 'refused', reason: target.status };
    return target;
  }
  const checked = validateTravelTarget(target.target, geometry);
  if (checked.status !== 'ready') return checked;
  if (bypass) return { status: 'allowed', target: checked.target };
  if (passage.status !== 'value') return { status: passage.status === 'absent' ? 'missing' : passage.status, reason: `target-passage-${passage.status}` };
  if (!passage.value || typeof passage.value.direction0Passable !== 'boolean' || typeof passage.value.characterBlocked !== 'boolean') return { status: 'invalid', reason: 'invalid-target-passage' };
  return passage.value.direction0Passable && !passage.value.characterBlocked ? { status: 'allowed', target: checked.target } : { status: 'refused', reason: 'target-blocked' };
}

/** Cave wrappers only produce/clear this point; they do not perform a transfer. */
export function caveEscapePoint(player: WorldLocation): WorldLocation {
  if (!isTravelLocation(player)) throw new Error('invalid-cave-player-location');
  const d: WorldDirection = player.direction === 2 ? 8 : player.direction === 8 ? 2 : player.direction === 4 ? 6 : 4;
  const point = { mapId: player.mapId, x: player.x + (player.direction === 4 ? 1 : player.direction === 6 ? -1 : 0), y: player.y + (player.direction === 8 ? 1 : player.direction === 2 ? -1 : 0), direction: d };
  if (!isTravelLocation(point)) throw new Error('cave-coordinate-overflow');
  return point;
}
