/** WP59 §5, WP12 §5.2 and WP28 §3.3. Pure local field abilities.
 * Plans describe ordered, individually committed prefixes. The application owns execution,
 * generation checks and state writes; a later host failure never implies rollback of a prefix.
 */
import { resolveConfig } from './config';
import type { RuleConfig } from './config';
import { badgeCount, hasBadge } from './economy';
import { checkEncounterTrigger } from './encounter-trigger';
import type { EncounterTriggerInput, EncounterTriggerResult } from './encounter-trigger';
import type { Random } from './member-factory';
import type { Content, Member } from './types';
import type { WorldDirection, WorldFact, WorldPoint } from './world-data';
import type { WorldLocalState, WorldMapMetadata, WorldState } from './world-state';

export const FIELD_MOVE_IDS = ['cut', 'rocksmash', 'strength', 'surf', 'flash', 'sweetscent'] as const;
export type LocalFieldMoveId = (typeof FIELD_MOVE_IDS)[number];
export type FieldMoveEntry = 'party' | 'shortcut' | 'direct' | 'interaction' | 'honey';
/** The host must resolve an ordinary facing event, not a tile/connection target. */
export interface FieldMoveFacingEvent {
  readonly mapId: number;
  readonly eventId: number;
  readonly name: string;
  readonly jumping: boolean;
  readonly overTrigger: boolean;
}
export interface FieldMoveFacingTerrain {
  readonly canSurf: boolean;
  readonly waterfall: boolean;
  readonly waterfallCrest: boolean;
}
export interface FieldMoveFacts {
  readonly mapMetadata?: WorldFact<Readonly<Pick<WorldMapMetadata, 'darkMap' | 'alwaysBicycle'>>>;
  readonly facingEvent?: WorldFact<FieldMoveFacingEvent>;
  readonly facingTerrain?: WorldFact<FieldMoveFacingTerrain>;
  /** Current player's direction-specific passage, supplied by the movement adapter. */
  readonly facingPassable?: WorldFact<boolean>;
  readonly facingPoint?: WorldFact<WorldPoint>;
  readonly direction?: WorldFact<WorldDirection>;
  /** True only for the current valid darkness mask, not merely a dark metadata flag. */
  readonly flashMask?: WorldFact<boolean>;
}
export interface FieldMoveContext {
  readonly party: readonly Readonly<Member>[];
  readonly badges: readonly boolean[];
  readonly content?: Pick<Content, 'settings'>;
  readonly debug?: boolean;
  readonly world: Readonly<Pick<WorldState, 'flashUsed' | 'surfing' | 'companions' | 'weather'>>;
  readonly local: Readonly<Pick<WorldLocalState, 'strengthUsed'>>;
  readonly facts: FieldMoveFacts;
}
export interface FieldMoveInput {
  readonly moveId: LocalFieldMoveId;
  readonly entry: FieldMoveEntry;
  readonly memberId?: string;
  readonly context: FieldMoveContext;
}
export interface FieldMoveBlocked {
  readonly status: 'refused' | 'unavailable' | 'invalid';
  readonly reason: string;
  readonly fact?: string;
}
export interface FieldMoveQualification {
  readonly status: 'ready';
  readonly moveId: LocalFieldMoveId;
  readonly memberId: string | null;
  readonly entry: FieldMoveEntry;
  readonly target?: FieldMoveFacingEvent;
}
type Ready<T> = { readonly status: 'ready'; readonly value: T };
type FactResult<T> = Ready<T> | { readonly status: 'absent' } | FieldMoveBlocked;
type FieldMoveCounter = 'cut_count' | 'rock_smash_count' | 'strength_push_count' | 'surf_count' | 'flash_count';
export type FieldMoveStage =
  | { readonly kind: 'host'; readonly action: 'confirm-direct'; readonly moveId: LocalFieldMoveId }
  | { readonly kind: 'host'; readonly action: 'animate'; readonly moveId: LocalFieldMoveId; readonly memberId: string | null; readonly onFalse: 'stop' | 'used-move-text' }
  | { readonly kind: 'host'; readonly action: 'flash-text' | 'expand-flash-mask' | 'cancel-vehicles' | 'project-surfing' | 'restore-map-bgm' | 'red-screen' }
  | { readonly kind: 'host'; readonly action: 'sound'; readonly sound: 'cut' | 'rock-smash' | 'strength-push' }
  | { readonly kind: 'host'; readonly action: 'erase-event' | 'register-erasure' | 'record-event-position' | 'wait-event-movement'; readonly target: FieldMoveFacingEvent }
  | { readonly kind: 'host'; readonly action: 'move-event-step'; readonly target: FieldMoveFacingEvent; readonly direction: WorldDirection }
  | { readonly kind: 'host'; readonly action: 'jump-forward'; readonly movement: 'surf-transition'; readonly direction: WorldDirection }
  | { readonly kind: 'commit'; readonly world?: { readonly flashUsed?: true; readonly surfing?: boolean }; readonly local?: { readonly strengthUsed: true }; readonly stats?: readonly { readonly counter: FieldMoveCounter; readonly delta: 1 }[] }
  | { readonly kind: 'runtime'; readonly surfBase?: WorldPoint | null; readonly endingSurf?: boolean }
  | { readonly kind: 'reset-encounters'; readonly reason: 'surf-start' | 'surf-end' }
  | { readonly kind: 'request-encounter'; readonly source: 'rock-smash'; readonly type: 'RockSmash'; readonly trigger: 'rock-smash'; readonly allowance: 'skip'; readonly onBattleStartedStat: 'rock_smash_battles' }
  | { readonly kind: 'request-encounter'; readonly source: 'sweet-scent'; readonly type: 'current'; readonly trigger: 'skip'; readonly allowance: 'skip' };
export interface FieldMovePlan {
  readonly status: 'planned';
  readonly moveId: LocalFieldMoveId;
  /** Menu SweetScent and Honey succeed as effects even without a battle; direct SweetScent has no boolean return. */
  readonly effectSuccess: true | null;
  readonly outcome: 'effect' | 'weather-blocked';
  readonly steps: readonly FieldMoveStage[];
}

const block = (status: FieldMoveBlocked['status'], reason: string, fact?: string): FieldMoveBlocked => ({ status, reason, ...(fact ? { fact } : {}) });
const refused = (reason: string): FieldMoveBlocked => block('refused', reason);
const bool = (value: unknown): value is boolean => typeof value === 'boolean';
const safe = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const positive = (value: unknown): value is number => safe(value) && value > 0;
const directionData = (value: unknown): value is WorldDirection => value === 2 || value === 4 || value === 6 || value === 8;
/** No getter from a host snapshot is executed, including status/value or nested event fields. */
function data(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === 'string' && !!descriptor && descriptor.enumerable && 'value' in descriptor;
  });
}
function eventData(value: unknown): value is FieldMoveFacingEvent {
  return data(value) && ['mapId', 'eventId', 'name', 'jumping', 'overTrigger'].every(key => Object.hasOwn(value, key))
    && positive(value.mapId) && positive(value.eventId) && typeof value.name === 'string'
    && bool(value.jumping) && bool(value.overTrigger);
}
function terrainData(value: unknown): value is FieldMoveFacingTerrain {
  return data(value) && ['canSurf', 'waterfall', 'waterfallCrest'].every(key => Object.hasOwn(value, key))
    && bool(value.canSurf) && bool(value.waterfall) && bool(value.waterfallCrest);
}
function pointData(value: unknown): value is WorldPoint {
  return data(value) && ['mapId', 'x', 'y'].every(key => Object.hasOwn(value, key)) && positive(value.mapId) && safe(value.x) && safe(value.y);
}
function metadataData(value: unknown): value is Pick<WorldMapMetadata, 'darkMap' | 'alwaysBicycle'> {
  return data(value) && (!Object.hasOwn(value, 'darkMap') || bool(value.darkMap))
    && (!Object.hasOwn(value, 'alwaysBicycle') || bool(value.alwaysBicycle));
}
function readFact<T>(input: unknown, fact: string, valid: (value: unknown) => value is T): FactResult<T> {
  if (input === undefined) return block('unavailable', 'fact-not-supplied', fact);
  try {
    if (!data(input) || !Object.hasOwn(input, 'status')) return block('invalid', 'invalid-fact-record', fact);
    if (input.status === 'absent') return { status: 'absent' };
    if (input.status === 'unavailable' || input.status === 'invalid') {
      return block(input.status, typeof input.reason === 'string' ? input.reason : 'provider-' + input.status, fact);
    }
    if (input.status !== 'value' || !Object.hasOwn(input, 'value') || !valid(input.value)) return block('invalid', 'invalid-fact-value', fact);
    return { status: 'ready', value: input.value };
  } catch {
    return block('invalid', 'fact-inspection-failed', fact);
  }
}
function required<T>(input: unknown, fact: string, valid: (value: unknown) => value is T): Ready<T> | FieldMoveBlocked {
  const result = readFact(input, fact, valid);
  return result.status === 'absent' ? block('invalid', 'required-fact-absent', fact) : result;
}
function facing(input: unknown, marker: string): Ready<FieldMoveFacingEvent> | FieldMoveBlocked {
  const result = readFact(input, 'facingEvent', eventData);
  if (result.status === 'absent') return refused('facing-event-required');
  if (result.status !== 'ready') return result;
  if (result.value.jumping || result.value.overTrigger || !result.value.name.toLowerCase().includes(marker)) return refused('facing-event-required');
  return result;
}

/** Non-egg, learned identity only: HP and PP are deliberately irrelevant to field moves. */
export function fieldMoveMember(party: readonly Readonly<Member>[], moveId: LocalFieldMoveId, memberId?: string): Readonly<Member> | undefined {
  return party.find(member => (memberId === undefined || member.id === memberId) && !member.isEgg && member.moves.some(move => move.id === moveId));
}
export function fieldMoveBadgeAllowed(badges: readonly boolean[], requirement: number, countBadges: boolean, debug = false): boolean {
  if (!Number.isSafeInteger(requirement)) throw new RangeError('field-move badge requirement must be a safe integer');
  if (debug || requirement < 0) return true;
  return countBadges ? badgeCount(badges) >= requirement : requirement < badges.length && hasBadge(badges, requirement);
}
function badgeRequirement(moveId: LocalFieldMoveId, config: RuleConfig): number {
  switch (moveId) {
    case 'cut': return config.BADGE_FOR_CUT;
    case 'rocksmash': return config.BADGE_FOR_ROCKSMASH;
    case 'strength': return config.BADGE_FOR_STRENGTH;
    case 'surf': return config.BADGE_FOR_SURF;
    case 'flash': return config.BADGE_FOR_FLASH;
    case 'sweetscent': return -1;
  }
}

/** Re-run after returning from menus: this does not issue an execution ticket or a lock. */
export function qualifyFieldMove(input: FieldMoveInput): FieldMoveQualification | FieldMoveBlocked {
  const { moveId, entry, context: c } = input;
  if (!FIELD_MOVE_IDS.some(id => id === moveId)) return refused('move-not-supported');
  if (!['party', 'shortcut', 'direct', 'interaction', 'honey'].includes(entry)
    || entry === 'honey' && moveId !== 'sweetscent' || (entry === 'direct' || entry === 'interaction') && moveId === 'flash') return refused('entry-not-supported');
  const menu = entry === 'party' || entry === 'shortcut';
  const member = fieldMoveMember(c.party, moveId, menu ? input.memberId : undefined);
  if (menu && (input.memberId === undefined || !member)) return refused('move-member-required');
  if (!menu && entry !== 'honey' && moveId !== 'sweetscent' && !c.debug && !member) return refused('move-member-required');
  let config: RuleConfig;
  try { config = resolveConfig(c.content?.settings); }
  catch { return block('invalid', 'invalid-field-move-configuration'); }
  if (!fieldMoveBadgeAllowed(c.badges, badgeRequirement(moveId, config), config.FIELD_MOVES_COUNT_BADGES, c.debug)) return refused('badge-required');
  const ready = (target?: FieldMoveFacingEvent): FieldMoveQualification => ({ status: 'ready', moveId, entry, memberId: member?.id ?? null, ...(target ? { target: { ...target } } : {}) });
  switch (moveId) {
    case 'cut': case 'rocksmash': {
      if (!menu && entry !== 'interaction') return ready();
      const target = facing(c.facts.facingEvent, moveId === 'cut' ? 'cuttree' : 'smashrock');
      return target.status === 'ready' ? ready(target.value) : target;
    }
    case 'strength': {
      if (c.local.strengthUsed) return refused('strength-already-used');
      if (entry !== 'interaction') return ready();
      const target = facing(c.facts.facingEvent, 'strengthboulder');
      return target.status === 'ready' ? ready(target.value) : target;
    }
    case 'surf': {
      if (c.world.companions.length) return refused('companions-present');
      if (entry === 'direct') return ready();
      if (c.world.surfing) return refused('already-surfing');
      const metadata = readFact(c.facts.mapMetadata, 'mapMetadata', metadataData);
      if (metadata.status !== 'ready' && metadata.status !== 'absent') return metadata;
      if (metadata.status === 'ready' && metadata.value.alwaysBicycle) return refused('always-bicycle-map');
      const terrain = required(c.facts.facingTerrain, 'facingTerrain', terrainData);
      if (terrain.status !== 'ready') return terrain;
      if (!terrain.value.canSurf || terrain.value.waterfall || terrain.value.waterfallCrest) return refused('not-free-surf-water');
      const passable = required(c.facts.facingPassable, 'facingPassable', bool);
      return passable.status !== 'ready' ? passable : passable.value ? ready() : refused('facing-not-passable');
    }
    case 'flash': {
      const metadata = readFact(c.facts.mapMetadata, 'mapMetadata', metadataData);
      if (metadata.status !== 'ready' && metadata.status !== 'absent') return metadata;
      if (metadata.status === 'absent' || !metadata.value.darkMap) return refused('not-dark-map');
      return c.world.flashUsed ? refused('flash-already-used') : ready();
    }
    case 'sweetscent': return ready();
  }
}
function plan(moveId: LocalFieldMoveId, steps: readonly FieldMoveStage[], effectSuccess: true | null = true, outcome: FieldMovePlan['outcome'] = 'effect'): FieldMovePlan {
  return { status: 'planned', moveId, effectSuccess, outcome, steps };
}
const statistic = (counter: FieldMoveCounter): FieldMoveStage => ({ kind: 'commit', stats: [{ counter, delta: 1 }] });
const animate = (q: FieldMoveQualification): FieldMoveStage => ({ kind: 'host', action: 'animate', moveId: q.moveId, memberId: q.memberId, onFalse: q.moveId === 'flash' ? 'stop' : 'used-move-text' });

/** Host exceptions stop before the next stage. Cancellation of confirm-direct stops the plan.
 * An optional animation returning false requests the usual used-move text before continuing;
 * Flash animate/text false or exception stops before commit; expansion occurs after commit. A handler
 * must preserve an unavailable result as a diagnostic, rather than installing a false world fact.
 */
export function planFieldMove(input: FieldMoveInput): FieldMovePlan | FieldMoveBlocked {
  const q = qualifyFieldMove(input);
  if (q.status !== 'ready') return q;
  const { moveId, entry, context: c } = input;
  const direct = entry === 'direct' || entry === 'interaction';
  const prefix: FieldMoveStage[] = direct && moveId !== 'sweetscent' ? [{ kind: 'host', action: 'confirm-direct', moveId }] : [];
  switch (moveId) {
    case 'cut': case 'rocksmash': {
      const steps: FieldMoveStage[] = [...prefix, animate(q), statistic(moveId === 'cut' ? 'cut_count' : 'rock_smash_count')];
      // Direct tools leave all event changes to their event caller (WT14/15).
      if (!direct) {
        if (!q.target) return refused('facing-event-required');
        steps.push({ kind: 'host', action: 'sound', sound: moveId === 'cut' ? 'cut' : 'rock-smash' },
          { kind: 'host', action: 'erase-event', target: q.target }, { kind: 'host', action: 'register-erasure', target: q.target });
        if (moveId === 'rocksmash') steps.push({ kind: 'request-encounter', source: 'rock-smash', type: 'RockSmash', trigger: 'rock-smash', allowance: 'skip', onBattleStartedStat: 'rock_smash_battles' });
      }
      return plan(moveId, steps);
    }
    case 'strength': return plan(moveId, [...prefix, animate(q), { kind: 'commit', local: { strengthUsed: true } }]);
    case 'surf': {
      const point = required(c.facts.facingPoint, 'facingPoint', pointData);
      if (point.status !== 'ready') return point;
      const direction = required(c.facts.direction, 'direction', directionData);
      if (direction.status !== 'ready') return direction;
      return plan(moveId, [...prefix, animate(q), { kind: 'commit', world: { surfing: false } }, { kind: 'host', action: 'cancel-vehicles' },
        { kind: 'reset-encounters', reason: 'surf-start' },
        { kind: 'commit', world: { surfing: true }, stats: [{ counter: 'surf_count', delta: 1 }] },
        { kind: 'host', action: 'project-surfing' }, { kind: 'runtime', surfBase: { ...point.value } },
        { kind: 'host', action: 'jump-forward', movement: 'surf-transition', direction: direction.value }]);
    }
    case 'flash': {
      const mask = required(c.facts.flashMask, 'flashMask', bool);
      if (mask.status !== 'ready') return mask;
      if (!mask.value) return refused('flash-mask-required');
      return plan(moveId, [animate(q), { kind: 'host', action: 'flash-text' },
        { kind: 'commit', world: { flashUsed: true }, stats: [{ counter: 'flash_count', delta: 1 }] },
        { kind: 'host', action: 'expand-flash-mask' }]);
    }
    case 'sweetscent': {
      const effectSuccess = entry === 'direct' || entry === 'interaction' ? null : true;
      if (c.world.weather.type !== 'None') return plan(moveId, [], effectSuccess, 'weather-blocked');
      return plan(moveId, [...(entry === 'party' || entry === 'shortcut' ? [animate(q)] : []), { kind: 'host', action: 'red-screen' },
        { kind: 'request-encounter', source: 'sweet-scent', type: 'current', trigger: 'skip', allowance: 'skip' }], effectSuccess);
    }
  }
}

export interface StrengthPushInput {
  readonly strengthUsed: boolean;
  readonly target: WorldFact<FieldMoveFacingEvent>;
  readonly direction: WorldFact<WorldDirection>;
  /** WP12 strict bounds, double-ended passage and collision have been checked by the host. */
  readonly strictPassable: WorldFact<boolean>;
}
export function planStrengthPush(input: StrengthPushInput): FieldMovePlan | FieldMoveBlocked {
  if (!input.strengthUsed) return plan('strength', []);
  const target = facing(input.target, 'strengthboulder');
  if (target.status !== 'ready') return target;
  const passable = required(input.strictPassable, 'strictPassable', bool);
  if (passable.status !== 'ready') return passable;
  if (!passable.value) return refused('strict-passage-refused');
  const direction = required(input.direction, 'direction', directionData);
  if (direction.status !== 'ready') return direction;
  return plan('strength', [statistic('strength_push_count'), { kind: 'host', action: 'move-event-step', target: { ...target.value }, direction: direction.value }]);
}
/** Called after the ordinary event step attempt. A failed displacement still retains the start count.
 * record-event-position reads the current event's x/y/direction/through; wait-event-movement
 * requests the host's player lock and map-update wait, releasing that lock on normal completion.
 */
export function planStrengthPushCompletion(input: {
  readonly target: WorldFact<FieldMoveFacingEvent>; readonly moved: WorldFact<boolean>;
  readonly recordAvailable: WorldFact<boolean>; readonly playSound: boolean;
}): FieldMovePlan | FieldMoveBlocked {
  const target = required(input.target, 'strengthEvent', eventData);
  if (target.status !== 'ready') return target;
  const moved = required(input.moved, 'strengthMoved', bool);
  if (moved.status !== 'ready') return moved;
  const record = required(input.recordAvailable, 'strengthRecordAvailable', bool);
  if (record.status !== 'ready') return record;
  const steps: FieldMoveStage[] = [];
  if (record.value) steps.push({ kind: 'host', action: 'record-event-position', target: { ...target.value } });
  if (moved.value) {
    if (input.playSound) steps.push({ kind: 'host', action: 'sound', sound: 'strength-push' });
    steps.push({ kind: 'host', action: 'wait-event-movement', target: { ...target.value } });
  }
  return plan('strength', steps);
}

export interface SurfLandingQualification {
  readonly status: 'ready';
  /** Actual water-side position captured before the landing jump, never its resulting land position. */
  readonly departure: Readonly<WorldPoint>;
}
function surfDepartureData(value: unknown): value is WorldPoint {
  return pointData(value) && value.x >= 0 && value.y >= 0;
}
export function qualifySurfLanding(input: {
  readonly surfing: boolean; readonly facingSurfable: WorldFact<boolean>;
  /** The host has checked the current loaded map's geometry before making this snapshot. */
  readonly departure: WorldFact<WorldPoint>;
}): SurfLandingQualification | FieldMoveBlocked {
  if (!input.surfing) return refused('not-surfing');
  const terrain = required(input.facingSurfable, 'facingSurfable', bool);
  if (terrain.status !== 'ready') return terrain;
  if (terrain.value) return refused('still-surfable-water');
  const departure = required(input.departure, 'surfDeparture', surfDepartureData);
  return departure.status !== 'ready' ? departure : { status: 'ready', departure: { ...departure.value } };
}
/** After the qualified landing jump, use the captured water-side point (GR4-SF06).
 * A normal starting jump's step cleanup may already have cleared surfBase. Restore it together
 * with endingSurf so the unchanged scene/player/base cleanup guards can finish the landing.
 * Current app snapshots reject repeated completion before/after cleanup; operation generation
 * and stale callbacks across separate Surf operations remain the application's responsibility.
 * No ordinary-player-step count or encounter reset occurs at this completion stage.
 */
export function planSurfLandingCompletion(jumpSucceeded: WorldFact<boolean>, input: {
  readonly departure: Readonly<WorldPoint>; readonly surfing: boolean; readonly endingSurf: boolean;
}): FieldMovePlan | FieldMoveBlocked {
  const jumped = required(jumpSucceeded, 'surfLandingJump', bool);
  if (jumped.status !== 'ready') return jumped;
  if (!jumped.value) return plan('surf', []);
  if (!data(input) || !Object.hasOwn(input, 'surfing') || !Object.hasOwn(input, 'endingSurf')
    || !bool(input.surfing) || !bool(input.endingSurf)) return block('invalid', 'invalid-surf-landing-state');
  if (!input.surfing || input.endingSurf) return plan('surf', []);
  if (!Object.hasOwn(input, 'departure') || !surfDepartureData(input.departure)) return block('invalid', 'invalid-surf-departure');
  return plan('surf', [{ kind: 'runtime', surfBase: { ...input.departure }, endingSurf: true }]);
}
/** Existing WP12 cleanup guards are independent of the ending flag. base/ending are transient app data. */
export function planSurfStepCleanup(input: {
  readonly mapScene: WorldFact<boolean>; readonly playerNotification: WorldFact<boolean>;
  readonly surfBase: WorldPoint | null; readonly endingSurf: boolean;
}): FieldMovePlan | FieldMoveBlocked {
  const scene = required(input.mapScene, 'mapScene', bool);
  if (scene.status !== 'ready') return scene;
  if (!scene.value) return plan('surf', []);
  const player = required(input.playerNotification, 'playerNotification', bool);
  if (player.status !== 'ready') return player;
  if (!player.value || input.surfBase === null) return plan('surf', []);
  if (!pointData(input.surfBase)) return block('invalid', 'invalid-surf-base');
  return plan('surf', [{ kind: 'runtime', surfBase: null }, ...(input.endingSurf ? [
    { kind: 'commit', world: { surfing: false } } as const,
    { kind: 'host', action: 'cancel-vehicles' } as const,
    { kind: 'reset-encounters', reason: 'surf-end' } as const,
    { kind: 'host', action: 'restore-map-bgm' } as const,
    { kind: 'runtime', endingSurf: false } as const,
  ] : [])]);
}

/** R11 active probability is C's WP36 implementation, including 136/party/item/rate modifiers.
 * No grace/accumulator writes or repel/Intimidate admission: only candidate/level/generation follow a hit.
 */
export function checkRockSmashTrigger(input: Omit<EncounterTriggerInput, 'type' | 'fromStep' | 'repelActive'>, random: Random): EncounterTriggerResult {
  return checkEncounterTrigger({ ...input, type: 'RockSmash', fromStep: false, repelActive: false }, random);
}
