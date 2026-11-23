/** E3 child. The real parent owns admission, receipts, atomic writes and save gating.
 * Checkpoint types are a FUTURE parent contract: schema-10 migration/production installation NOT_IMPLEMENTED.
 * This leaf never produces map-enter notifications or counts a player step itself.
 */
import { clone } from '../rules/value';
import { semanticFingerprint } from '../rules/semantic';
import { bumpStat } from '../rules/stats';
import { deriveFlyDestinations, validateFlySelection } from '../rules/region-map';
import type { FlyDestination } from '../rules/region-map';
import { indexMapConnections, qualifyConnectionPassage, qualifyTravel, planTravel, resolveConnectionTarget, validateTravelTarget, isTravelLocation } from '../rules/world-travel';
import type { ConnectionPassage, MapGeometry, TravelKind, TravelPlaces } from '../rules/world-travel';
import { planCompanionTransfer } from '../rules/event-companions';
import type { Content } from '../rules/types';
import type { GameState } from '../rules/state';
import type { WorldFact, WorldLocation } from '../rules/world-data';
import type { WorldMapMetadata } from '../rules/world-state';

export interface TravelLease { readonly owner: object; readonly generation: number }
export interface TravelReceipt { readonly token: string; readonly generation: number; readonly target: Readonly<WorldLocation> }
export interface TravelArrival { readonly actual: Readonly<WorldLocation>; readonly transferPending: boolean; readonly loadedGeometry: Readonly<MapGeometry> }
export interface TravelMap { readonly status: 'ready'; readonly mapId: number; readonly width: number; readonly height: number; readonly handle: object }
export type TravelResource = TravelMap | { readonly status: 'missing' | 'invalid' | 'unavailable'; readonly reason: string };
export interface TravelAbilityAdmission {
  readonly kind: TravelKind; readonly source: WorldLocation;
  readonly metadata: WorldFact<Readonly<WorldMapMetadata>>; readonly outdoor: WorldFact<boolean>;
  readonly characterHome: TravelPlaces['characterHome']; readonly globalHome: TravelPlaces['globalHome'];
  readonly switches: Readonly<Record<string, WorldFact<boolean>>>;
  /** Dig/Teleport only admit a current party/shortcut member; they have no independent direct tool.
   * Fly with an explicit member preserves WP59's deliberate no-move-recheck behavior. */
  readonly selection: FlyDestination | null; readonly memberId?: string; readonly debug?: boolean;
}
export interface TravelConnectionAdmission {
  readonly kind: 'connection'; readonly source: WorldLocation; readonly candidate: WorldLocation;
  readonly sourceGeometry: WorldFact<MapGeometry>; readonly bypass: boolean;
  /** Issued by the completed-step parent. App/D consumes this once at the actual target, never both maps. */
  readonly stepId: string;
}
export interface TravelExplicitAdmission { readonly kind: 'transfer'; readonly source: WorldLocation; readonly target: WorldLocation; readonly preserveSurfing: boolean }
export type TravelAdmission = TravelAbilityAdmission | TravelConnectionAdmission | TravelExplicitAdmission;
export type TravelStage = 'preparing' | 'ready' | 'awaiting-arrival' | 'after-arrival';
export interface TravelCheckpoint {
  readonly id: string; readonly kind: TravelAdmission['kind']; readonly source: WorldLocation;
  readonly target: WorldLocation; readonly phase: TravelStage; readonly cursor: number;
  readonly preserveSurfing: boolean; readonly stepId: string | null;
}
export interface TravelObservation {
  readonly owner: object | null; readonly generation: number; readonly game: GameState; readonly content: Content;
  readonly requestId: string; readonly admission: TravelAdmission; readonly checkpoint: TravelCheckpoint | null;
}
export interface ConnectionStepIntent { readonly id: string; readonly source: WorldLocation; readonly target: WorldLocation; readonly surfing: boolean }
export interface TravelWrite {
  readonly game: GameState; readonly checkpoint: TravelCheckpoint | null; readonly terminal: boolean;
  /** Registry acknowledgement only. PSWorld remains the sole producer of the real native entry. */
  readonly arrival?: { readonly receipt: TravelReceipt; readonly observation: TravelArrival; readonly step: ConnectionStepIntent | null };
  readonly transferHidden?: readonly string[]; readonly clearFlySelection?: boolean;
}
export interface TravelParent {
  /** Materialized plain joint facts after providers and lifecycle checks, never getters. */
  observe(): TravelObservation;
  /** Invoke the PURE transform on final actual joint facts, then install/retire synchronously.
   * No callback/provider/legacy replace may intervene. Missing native atomic support MUST refuse. */
  commitTravel(transform: (actual: TravelObservation) => TravelWrite): TravelObservation;
  /** Registry authenticates the exact immutable object against the real owner, phase and generation. */
  issueTransfer(owner: object, generation: number, checkpoint: TravelCheckpoint): TravelReceipt;
  /** Process-local proof retained only after the genuine native receipt callback. Never serialized. */
  recoverArrival?(owner: object, generation: number, checkpoint: TravelCheckpoint): TravelArrival | null;
  /** Nonthrowing/idempotent; retain a failed checkpoint for explicit retry or future versioned save support. */
  release(owner: object, generation: number): void;
}
export type TravelEffectResult = { readonly status: 'done' } | { readonly status: 'failed'; readonly reason: string };
export type TravelHostEffect = 'escape-rope-message' | 'cancel-vehicles' | 'fly-animation' | 'teleport-animation' | 'map-bgm' | 'refresh' | 'fly-callback';
export interface TravelHost {
  preload(owner: object, target: Readonly<WorldLocation>): Promise<TravelResource>;
  /** Independent neighbor dimensions, including legitimate zero width/height. This is geometry,
   * not transfer authority. Share the adapter's independent map resource with preload, never $dataMap.
   * Only preload(realTarget) may issue the owned opaque handle later used for passage/reserve. */
  connectionGeometry?(owner: object, mapId: number): Promise<WorldFact<MapGeometry>>;
  connectionPassage(owner: object, map: TravelMap, target: Readonly<WorldLocation>): WorldFact<ConnectionPassage>;
  /** Same private preload handle and TRUE target coordinates. Must inspect target terrain freely-surfable
   * qualification, Surf-mode tile passage and normal-priority events/vehicles; never current-map tiles.
   * Existing cb4155b adapter lacks this port: Surf connections MUST stay explicitly not ready. */
  surfConnectionPassage?(owner: object, map: TravelMap, target: Readonly<WorldLocation>): WorldFact<{ readonly surfingAllowed: boolean; readonly targetPassable: boolean; readonly characterBlocked: boolean }>;
  observeNow(): WorldFact<TravelArrival>;
  reserve(owner: object, receipt: TravelReceipt, map: TravelMap): { readonly status: 'reserved' } | { readonly status: 'failed'; readonly reason: string };
  confirm(kind: 'dig' | 'teleport', target: Readonly<WorldLocation>): Promise<'confirmed' | 'cancelled'>;
  effect(kind: TravelHostEffect): Promise<TravelEffectResult>;
  /** Actual elapsed wait, after callback normal return. Never move before arrival or silently truncate. */
  waitFlyTail(milliseconds: 250): Promise<TravelEffectResult>;
}
export type TravelRunResult = { readonly status: 'awaiting-arrival'; readonly receipt: TravelReceipt }
  | { readonly status: 'tail-pending' | 'completed' | 'cancelled' } | { readonly status: 'failed'; readonly reason: string };
export type TravelConfirmation = { readonly status: 'arrived' | 'duplicate' } | { readonly status: 'refused'; readonly reason: string };
type Effect = TravelHostEffect | 'fly-stat' | 'transfer' | 'fly-wait' | 'clear-escape' | 'clear-selection';
const same = (a: unknown, b: unknown): boolean => semanticFingerprint(a) === semanticFingerprint(b);
const why = (e: unknown): string => e instanceof Error ? e.message : String(e);
function effects(kind: TravelAdmission['kind']): Effect[] {
  if (kind === 'transfer' || kind === 'connection') return ['transfer'];
  const plan = planTravel(kind, { escapePoint: { mapId: 1, x: 0, y: 0, direction: 2 }, healingSpot: { mapId: 1, x: 0, y: 0 }, characterHome: null, globalHome: null }, { confirmation: 'confirmed', flyDestination: { mapId: 1, x: 0, y: 0 } });
  if (plan.status !== 'planned') throw Error('invalid-travel-kind');
  return plan.plan.effects.flatMap<Effect>(effect => {
    switch (effect.kind) {
      case 'message': return ['escape-rope-message'];
      case 'animation': return [effect.move === 'fly' ? 'fly-animation' : 'teleport-animation'];
      case 'increment-stat': return ['fly-stat'];
      case 'fly-presentation-tail': return ['fly-callback', 'fly-wait'];
      case 'clear-escape-point': return ['clear-escape'];
      case 'clear-fly-selection': return ['clear-selection'];
      default: return [effect.kind];
    }
  });
}
function done(result: TravelEffectResult): void {
  // In particular, a rejected/thenable confirmation must never become a synchronous receipt success.
  if (!result || result.status !== 'done') throw Error(result?.status === 'failed' ? result.reason : 'invalid-travel-effect-result');
}
/** Validate an unknown serialized future checkpoint without executing accessors. */
export function readTravelCheckpoint(raw: unknown): TravelCheckpoint {
  semanticFingerprint(raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('invalid-travel-checkpoint');
  const c = raw as Record<string, unknown>, keys = ['id', 'kind', 'source', 'target', 'phase', 'cursor', 'preserveSurfing', 'stepId'];
  if (Reflect.ownKeys(c).length !== keys.length || keys.some(k => !Object.hasOwn(c, k)) || typeof c.id !== 'string' || !c.id.length || !isTravelLocation(c.source) || !isTravelLocation(c.target)
    || c.kind !== 'fly' && c.kind !== 'dig' && c.kind !== 'teleport' && c.kind !== 'escape-rope' && c.kind !== 'connection' && c.kind !== 'transfer'
    || c.phase !== 'preparing' && c.phase !== 'ready' && c.phase !== 'awaiting-arrival' && c.phase !== 'after-arrival'
    || typeof c.cursor !== 'number' || !Number.isSafeInteger(c.cursor) || typeof c.preserveSurfing !== 'boolean'
    || c.kind === 'connection' && (typeof c.stepId !== 'string' || !c.stepId.length) || c.kind !== 'connection' && c.stepId !== null) throw Error('invalid-travel-checkpoint');
  const sequence = effects(c.kind), transfer = sequence.indexOf('transfer');
  if (c.cursor < 0 || c.cursor > sequence.length || (c.phase === 'preparing' ? c.cursor > transfer : c.phase === 'after-arrival' ? c.cursor <= transfer : c.cursor !== transfer)) throw Error('invalid-travel-checkpoint');
  return { id: c.id, kind: c.kind, source: clone(c.source), target: clone(c.target), phase: c.phase, cursor: c.cursor, preserveSurfing: c.preserveSurfing, stepId: c.stepId as string | null };
}

export class WorldTravelOperation {
  private expected: TravelObservation | null = null;
  private promise: Promise<TravelRunResult> | null = null;
  private terminal: TravelRunResult | null = null;
  private receipt: TravelReceipt | null = null;
  private confirmed: TravelReceipt | null = null;
  private confirming = false;
  private tailPromise: Promise<TravelRunResult> | null = null;
  private readonly parent: TravelParent;
  private readonly host: TravelHost;
  private readonly lease: TravelLease;
  constructor(parent: TravelParent, host: TravelHost, lease: TravelLease) { this.parent = parent; this.host = host; this.lease = Object.freeze({ owner: lease.owner, generation: lease.generation }); }
  private check(actual: TravelObservation): void {
    if (this.terminal || actual.owner !== this.lease.owner || actual.generation !== this.lease.generation) throw Error('travel-owner-stale');
    if (!this.expected || !same(actual.game, this.expected.game)) throw Error('travel-state-changed');
    if (!same(actual.content, this.expected.content)) throw Error('travel-content-changed');
    if (!same(actual.checkpoint, this.expected.checkpoint) || !same(actual.admission, this.expected.admission) || actual.requestId !== this.expected.requestId) throw Error('travel-context-changed');
  }
  private remember(actual: TravelObservation): void { this.expected = { ...actual, game: clone(actual.game), content: clone(actual.content), checkpoint: actual.checkpoint ? readTravelCheckpoint(actual.checkpoint) : null, admission: clone(actual.admission) }; }
  private observe(): TravelObservation { const actual = this.parent.observe(); this.check(actual); return actual; }
  private commit(transform: (actual: TravelObservation) => TravelWrite): void { this.remember(this.parent.commitTravel(actual => { this.check(actual); return transform(actual); })); }
  private fail(reason: string): TravelRunResult { if (!this.terminal) { this.terminal = { status: 'failed', reason }; this.parent.release(this.lease.owner, this.lease.generation); } return this.terminal; }
  cancel(): TravelRunResult { if (!this.terminal) { this.terminal = { status: 'cancelled' }; this.parent.release(this.lease.owner, this.lease.generation); } return this.terminal; }
  private checkpoint(): TravelCheckpoint { const c = this.observe().checkpoint; if (!c) throw Error('missing-travel-checkpoint'); return readTravelCheckpoint(c); }
  private observed(): TravelArrival {
    const observed = this.host.observeNow(); this.observe();
    if (observed.status !== 'value') throw Error(`travel-observation-${observed.status}`);
    const checked = validateTravelTarget(observed.value.actual, { status: 'value', value: observed.value.loadedGeometry });
    if (checked.status !== 'ready' || typeof observed.value.transferPending !== 'boolean') throw Error('invalid-travel-observation');
    if (observed.value.transferPending) throw Error('mz-transfer-pending');
    return clone(observed.value);
  }
  private async preload(target: WorldLocation): Promise<TravelMap> {
    this.observe(); const map = await this.host.preload(this.lease.owner, clone(target)); this.observe();
    if (map.status !== 'ready') throw Error(map.reason);
    const checked = validateTravelTarget(target, { status: 'value', value: map });
    if (checked.status !== 'ready' || !map.handle || typeof map.handle !== 'object') throw Error(checked.status !== 'ready' ? checked.reason : 'invalid-map-handle');
    return map;
  }
  private async connectionGeometry(mapId: number): Promise<MapGeometry> {
    this.observe();
    if (!this.host.connectionGeometry) throw Error('connection-geometry-not-ready:provider-not-implemented');
    const fact = await this.host.connectionGeometry(this.lease.owner, mapId); this.observe();
    semanticFingerprint(fact);
    if (fact.status !== 'value') throw Error(`connection-geometry-${fact.status}`);
    const size = fact.value;
    if (!size || size.mapId !== mapId || typeof size.width !== 'number' || !Number.isSafeInteger(size.width) || size.width < 0
      || typeof size.height !== 'number' || !Number.isSafeInteger(size.height) || size.height < 0) throw Error('invalid-connection-geometry');
    return { mapId, width: size.width, height: size.height };
  }
  private async plan(initial: TravelObservation): Promise<{ checkpoint: TravelCheckpoint; map: TravelMap | null }> {
    const a = initial.admission;
    if (!isTravelLocation(a.source) || !same(this.observed().actual, a.source)) throw Error('travel-source-mismatch');
    let target: WorldLocation, map: TravelMap, preserveSurfing = false, stepId: string | null = null;
    if (a.kind === 'connection') {
      const sourceCheck = validateTravelTarget(a.source, a.sourceGeometry);
      if (sourceCheck.status !== 'ready' || !isTravelLocation(a.candidate) || a.source.mapId !== a.candidate.mapId || a.source.direction !== a.candidate.direction
        || a.candidate.x - a.source.x !== (a.source.direction === 6 ? 1 : a.source.direction === 4 ? -1 : 0)
        || a.candidate.y - a.source.y !== (a.source.direction === 2 ? 1 : a.source.direction === 8 ? -1 : 0) || !a.stepId.length || typeof a.bypass !== 'boolean') throw Error('invalid-connection-step');
      const index = indexMapConnections(initial.content.world?.mapConnections?.connections ?? []), sizes = new Map<number, MapGeometry>();
      for (const record of index.get(a.source.mapId) ?? []) {
        if (!sizes.has(record.to.mapId)) sizes.set(record.to.mapId, await this.connectionGeometry(record.to.mapId));
        // Unavailable here only marks a later record not read yet. Actual provider failures above throw.
        const resolved = resolveConnectionTarget(index, a.candidate, id => id === a.source.mapId ? a.sourceGeometry : sizes.has(id) ? { status: 'value', value: sizes.get(id)! } : { status: 'unavailable' });
        if (resolved.status === 'unavailable') continue;
        if (resolved.status !== 'target') throw Error(resolved.status === 'within-map' || resolved.status === 'no-connection' ? resolved.status : resolved.reason);
        map = await this.preload(resolved.target);
        const size = sizes.get(resolved.target.mapId)!;
        if (map.mapId !== size.mapId || map.width !== size.width || map.height !== size.height) throw Error('connection-geometry-changed');
        let passage: WorldFact<ConnectionPassage>;
        if (initial.game.world.surfing) {
          if (!this.host.surfConnectionPassage) throw Error('surf-connection-not-ready:target-surf-provider-not-implemented');
          const surf = this.host.surfConnectionPassage(this.lease.owner, map, resolved.target); this.observe();
          if (surf.status !== 'value') throw Error(`surf-connection-not-ready:${surf.status}`);
          if (typeof surf.value.surfingAllowed !== 'boolean' || typeof surf.value.targetPassable !== 'boolean' || typeof surf.value.characterBlocked !== 'boolean') throw Error('surf-connection-invalid');
          if (!surf.value.surfingAllowed) throw Error('target-surfing-not-allowed');
          passage = { status: 'value', value: { direction0Passable: surf.value.targetPassable, characterBlocked: surf.value.characterBlocked } };
        } else { passage = this.host.connectionPassage(this.lease.owner, map, resolved.target); this.observe(); }
        const qualified = qualifyConnectionPassage(resolved, { status: 'value', value: map }, passage, a.bypass);
        if (qualified.status !== 'allowed') throw Error(qualified.reason);
        target = qualified.target; preserveSurfing = initial.game.world.surfing; stepId = a.stepId;
        return { checkpoint: { id: initial.requestId, kind: a.kind, source: clone(a.source), target, phase: 'preparing', cursor: 0, preserveSurfing, stepId }, map };
      }
      throw Error('no-connection');
    } else if (a.kind === 'transfer') {
      if (typeof a.preserveSurfing !== 'boolean') throw Error('invalid-surf-preservation');
      target = clone(a.target); preserveSurfing = a.preserveSurfing;
    }
    else {
      const places: TravelPlaces = { healingSpot: initial.game.world.healingSpot, escapePoint: initial.game.world.escapePoint, characterHome: a.characterHome, globalHome: a.globalHome };
      const selectedMember = a.memberId ? initial.game.party.find(m => m.id === a.memberId) : undefined;
      if (a.memberId && !selectedMember) throw Error('travel-member-missing');
      if ((a.kind === 'dig' || a.kind === 'teleport') && (!selectedMember || selectedMember.isEgg || !selectedMember.moves.some(m => m.id === a.kind))) throw Error('travel-menu-member-required');
      const flyMember = a.kind === 'fly' ? selectedMember : undefined;
      const qualified = qualifyTravel(a.kind, { companions: initial.game.world.companions, places, outdoor: a.outdoor, badges: initial.game.badges, settings: initial.content.settings, party: initial.game.party, debug: a.debug, flyMember });
      if (qualified.status !== 'eligible') throw Error(qualified.reason);
      let destination: FlyDestination | null = null;
      if (a.kind === 'fly') {
        const selected = validateFlySelection(a.selection, { metadata: a.metadata, regionMaps: initial.content.world?.regionMaps, visitedMaps: initial.game.world.visitedMaps, readSwitch: id => a.switches[String(id)] ?? { status: 'unavailable' } });
        if (selected.status === 'cancelled') { this.cancel(); throw Error('travel-cancelled'); }
        if (selected.status !== 'selected') throw Error('reason' in selected ? selected.reason : 'stale-fly-selection');
        destination = selected.destination;
      }
      // Plan once before asking so the prompt names the actual frozen return point.
      const planned = planTravel(a.kind, places, { confirmation: 'confirmed', flyDestination: destination?.target });
      if (planned.status !== 'planned') throw Error(planned.status === 'refused' ? planned.reason : planned.status);
      target = planned.plan.target;
      if (qualified.confirmation) {
        const confirmation = await this.host.confirm(a.kind === 'dig' ? 'dig' : 'teleport', clone(target)); this.observe();
        if (confirmation === 'cancelled') { this.cancel(); throw Error('travel-cancelled'); }
        if (confirmation !== 'confirmed') throw Error('invalid-travel-confirmation');
      }
    }
    // The four shortcut families freeze their confirmed target before resource I/O. A failed
    // preload can then resume this exact plan without repeating confirmation or any prefix.
    if (a.kind !== 'transfer') return { checkpoint: { id: initial.requestId, kind: a.kind, source: clone(a.source), target, phase: 'preparing', cursor: 0, preserveSurfing, stepId }, map: null };
    map = await this.preload(target);
    return { checkpoint: { id: initial.requestId, kind: a.kind, source: clone(a.source), target, phase: 'preparing', cursor: 0, preserveSurfing, stepId }, map };
  }
  run(): Promise<TravelRunResult> { if (this.terminal) return Promise.resolve(this.terminal); if (!this.promise) this.promise = Promise.resolve().then(() => this.execute()); return this.promise; }
  /** Called after the real native arrival returns. Fly's callback/wait are intentionally asynchronous.
   * Production MZ must defer its transfer-end autosave while this phase owns the parent: NOT_IMPLEMENTED here. */
  finishArrival(): Promise<TravelRunResult> {
    if (this.terminal) return Promise.resolve(this.terminal);
    if (this.tailPromise) return this.tailPromise;
    // Check only our local issued-receipt state before publishing execution ownership. Any observer
    // can synchronously reenter, so even checking the parent's checkpoint belongs inside the claimed job.
    if (this.confirming || !this.confirmed) return Promise.resolve({ status: 'failed', reason: 'arrival-tail-not-ready' });
    this.tailPromise = Promise.resolve().then(() => this.execute()); return this.tailPromise;
  }
  private async effect(effect: Effect): Promise<void> {
    if (effect === 'transfer') throw Error('unexpected-transfer-effect');
    if (effect !== 'fly-stat' && effect !== 'clear-escape' && effect !== 'clear-selection') {
      const result = effect === 'fly-wait' ? await this.host.waitFlyTail(250) : await this.host.effect(effect); this.observe(); done(result);
    }
    const phase = this.checkpoint();
    if (phase.phase === 'after-arrival' && !same(this.observed().actual, phase.target)) throw Error('travel-tail-location-changed');
    this.commit(actual => {
      const c = readTravelCheckpoint(actual.checkpoint), game = clone(actual.game);
      if (effect === 'fly-stat') game.stats = bumpStat(game.stats, 'fly_count');
      if (effect === 'clear-escape') game.world.escapePoint = null;
      return { game, checkpoint: { ...c, cursor: c.cursor + 1 }, terminal: false, ...(effect === 'clear-selection' ? { clearFlySelection: true } : {}) };
    });
  }
  private async execute(): Promise<TravelRunResult> {
    try {
      if (!this.expected) {
        const initial = this.parent.observe();
        if (this.terminal) return this.terminal;
        if (initial.owner !== this.lease.owner || initial.generation !== this.lease.generation || !Number.isSafeInteger(this.lease.generation) || this.lease.generation < 0 || !initial.requestId.length) throw Error('travel-not-admitted');
        this.remember(initial);
      }
      let c = this.observe().checkpoint, map: TravelMap | null = null;
      const resumingAwaiting = c?.phase === 'awaiting-arrival';
      if (!c) { const planned = await this.plan(this.observe()); map = planned.map; this.commit(actual => ({ game: actual.game, checkpoint: planned.checkpoint, terminal: false })); c = this.checkpoint(); }
      else { c = readTravelCheckpoint(c); if (c.id !== this.observe().requestId || c.kind !== this.observe().admission.kind) throw Error('travel-checkpoint-request-mismatch'); }
      // Resource readiness precedes every prefix on both the first execution and retry. The
      // connection/ordinary-transfer planners retain their original geometry/passage ordering.
      if (c.kind !== 'connection' && c.kind !== 'transfer' && c.phase !== 'after-arrival' && !map) map = await this.preload(c.target);
      const sequence = effects(c.kind), transferIndex = sequence.indexOf('transfer');
      if (c.phase === 'after-arrival') {
        if (!same(this.observed().actual, c.target)) throw Error('travel-tail-location-changed');
        while (c.cursor < sequence.length) { await this.effect(sequence[c.cursor]!); c = this.checkpoint(); }
        this.commit(actual => ({ game: actual.game, checkpoint: null, terminal: true }));
        this.terminal = { status: 'completed' }; return this.terminal;
      }
      while (c.cursor < transferIndex) { await this.effect(sequence[c.cursor]!); c = this.checkpoint(); }
      if (c.phase === 'preparing') { this.commit(actual => ({ game: actual.game, checkpoint: { ...c!, phase: 'ready' }, terminal: false })); c = this.checkpoint(); }
      if (!map) map = await this.preload(c.target);
      const observed = this.observed();
      if (!same(observed.actual, c.source) && !(resumingAwaiting && same(observed.actual, c.target))) throw Error('travel-source-moved');
      if (c.phase === 'ready') { this.commit(actual => ({ game: actual.game, checkpoint: { ...c!, phase: 'awaiting-arrival' }, terminal: false })); c = this.checkpoint(); }
      const receipt = this.parent.issueTransfer(this.lease.owner, this.lease.generation, clone(c)); this.observe();
      if (!receipt || !receipt.token.length || receipt.generation !== this.lease.generation || !same(receipt.target, c.target)) throw Error('invalid-travel-receipt');
      this.receipt = receipt;
      if (resumingAwaiting && same(observed.actual, c.target)) {
        // Coordinates alone cannot prove an unacknowledged no-op/same-point transfer ever ran.
        const proof = this.parent.recoverArrival?.(this.lease.owner, this.lease.generation, clone(c)); this.observe();
        if (same(c.source, c.target) && !proof) throw Error('same-point-arrival-proof-required');
        if (proof && !same(proof, observed)) throw Error('retained-arrival-proof-mismatch');
        const confirmed = this.confirmArrival(receipt, proof ?? observed); if (confirmed.status === 'refused') throw Error(confirmed.reason);
        return this.terminal ?? { status: 'tail-pending' };
      }
      const result = this.host.reserve(this.lease.owner, receipt, map); if (this.terminal) return this.terminal; this.observe();
      if (result.status !== 'reserved') throw Error(result.reason);
      return { status: 'awaiting-arrival', receipt };
    } catch (error) { return this.fail(why(error)); }
  }
  isCurrent(receipt: TravelReceipt): boolean { if (this.terminal || this.receipt !== receipt || this.confirmed) return false; try { return this.checkpoint().phase === 'awaiting-arrival'; } catch { return false; } }
  /** Synchronous authentic arrival acknowledgement, NOT a claim that an ability's asynchronous tail completed. */
  confirmArrival(receipt: TravelReceipt, observation: TravelArrival): TravelConfirmation {
    if (this.confirmed === receipt) return { status: 'duplicate' };
    if (this.confirming || this.terminal || this.receipt !== receipt) return { status: 'refused', reason: 'stale-travel-receipt' };
    this.confirming = true;
    try {
      const c = this.checkpoint(), checked = validateTravelTarget(observation.actual, { status: 'value', value: observation.loadedGeometry });
      if (c.phase !== 'awaiting-arrival' || checked.status !== 'ready' || observation.transferPending !== false || !same(observation.actual, c.target)) throw Error('travel-arrival-mismatch');
      const immediate = c.kind === 'transfer' || c.kind === 'connection';
      this.commit(actual => {
        const game = clone(actual.game); game.world.surfing = c.preserveSurfing;
        const companions = c.kind === 'connection' ? null : planCompanionTransfer(game.world.companions, c.target);
        if (companions) game.world.companions = companions.companions;
        return { game, checkpoint: immediate ? null : { ...c, phase: 'after-arrival', cursor: c.cursor + 1 }, terminal: immediate,
          arrival: { receipt, observation: clone(observation), step: c.stepId ? { id: c.stepId, source: clone(c.source), target: clone(c.target), surfing: c.preserveSurfing } : null }, ...(companions ? { transferHidden: companions.transferHidden } : {}) };
      });
      this.confirmed = receipt;
      if (immediate) this.terminal = { status: 'completed' };
      return { status: 'arrived' };
    } catch (error) { this.fail(why(error)); return { status: 'refused', reason: why(error) }; }
    finally { this.confirming = false; }
  }
  transferFailed(receipt: TravelReceipt, reason: string): TravelRunResult { return this.receipt === receipt ? this.fail(reason) : { status: 'failed', reason: 'stale-travel-receipt' }; }
}

/** Shared Fly/UI projection; never persists a separate unlock set. */
export function travelFlyDestinations(observation: TravelObservation): ReturnType<typeof deriveFlyDestinations> {
  const a = observation.admission;
  if (a.kind === 'transfer' || a.kind === 'connection') return { status: 'blocked', reason: 'not-a-fly-admission' };
  return deriveFlyDestinations({ metadata: a.metadata, regionMaps: observation.content.world?.regionMaps, visitedMaps: observation.game.world.visitedMaps, readSwitch: id => a.switches[String(id)] ?? { status: 'unavailable' } });
}
