import type { PreparedMovementStart } from './movement-start-application';
import { shortcutRecoverySnapshot } from './field-shortcut-recovery';
import type { FieldShortcutRecoverySnapshot, FieldShortcutRecoveryReason } from './field-shortcut-recovery';
/** Production E3 parent: runtime ownership, authentic transfer receipts and final native installation. */
import { clone } from '../rules/value';
import { semanticFingerprint } from '../rules/semantic';
import { catalogOf, itemOf, consumesItem } from '../rules/item-catalog';
import { itemQuantity, removeItems } from '../rules/inventory';
import { classifyFieldItem } from '../rules/field-items';
import { currentRegion, deriveFlyDestinations } from '../rules/region-map';
import { isTravelLocation } from '../rules/world-travel';
import type { FlyDestination } from '../rules/region-map';
import type { WorldFact, WorldLocation } from '../rules/world-data';
import type { GameState } from '../rules/state';
import type { Content } from '../rules/types';
import { validateGameContent } from '../rules/save-schema';
import type { WorldBusinessFacts } from '../rules/world-state';
import type { AtomicFieldQueryState, AtomicStateResult, CompletedWorldStepOutcome, WorldHostLifecycle, WorldTravelLeaseCurrent, WorldTravelLeaseSource, WorldMapBirthLifecycle } from './ports';
import { WorldTravelOperation, readTravelCheckpoint } from './world-travel-operation';
import type { TravelAdmission, TravelArrival, TravelCheckpoint, TravelConfirmation, TravelObservation, TravelReceipt, TravelRunResult, TravelHost, TravelEffectResult, TravelWrite } from './world-travel-operation';
import type { WorldTravelRequest, WorldTravelHost, WorldTravelStepFacts, TravelAtomicPort, PreparedTravelEntry, WorldTravelOutcome } from './world-travel-ports';
export type { WorldTravelRequest, WorldTravelHost, WorldTravelSourceFacts, WorldTravelStepFacts, TravelAtomicPort, PreparedTravelEntry, WorldTravelOutcome } from './world-travel-ports';
interface Options {
  readonly host?: WorldTravelHost; readonly atomic?: TravelAtomicPort;
  /** Known App-private planner/once book; no host callback can authorize a child write. */
  prepareMovement?(actual: AtomicFieldQueryState & { readonly generation: number }, observation: unknown, context: object): PreparedMovementStart;
  movementInstalled?(prepared: PreparedMovementStart, game: GameState): void;
  /** Known App-private runtime book, invoked only after genuine arrival assignment. */
  companionsTransferred?(hidden: readonly string[]): void;
  generation(): number; canStart(parent?: object): boolean; canRecover(): boolean; source(): WorldHostLifecycle;
  prepareEntry(checkpoint: TravelCheckpoint, game: GameState, content: Content, current: () => void): PreparedTravelEntry;
  completeConnection(owner: object, receipt: TravelReceipt, facts: WorldTravelStepFacts): Promise<CompletedWorldStepOutcome>;
  released(): void;
  /** Known App-private WeakMap reader; never a host/provider authorization callback. */
  shortcutAdmission?(request: object): import('./ports').FieldShortcutAdmission | null;
  /** Known World-private reader of its real Inventory-ticket-derived parent; never host data. */
  toolAdmission?(parent: object, actual: import('./ports').AtomicFieldQueryState): { readonly itemId: string } | null;
  toolInstalled?(parent: object): void;
  toolCompleted?(requestId: string, consumed: boolean): void;
}
interface Entry {
  readonly owner: object; readonly generation: number; readonly requestId: string; readonly key: string; readonly request: WorldTravelRequest;
  readonly tool: { readonly itemId: string } | null;
  toolConsumed?: boolean;
  admission: TravelAdmission; checkpoint: TravelCheckpoint | null; connectionRecovery: TravelCheckpoint | null; operation: WorldTravelOperation | null;
  source: WorldHostLifecycle; readonly departureScene: object; boundLease: WorldTravelLeaseCurrent | null; recoveryLease: WorldTravelLeaseCurrent | null; expectedGame: string; readonly contentIdentity: string; readonly admittedContent: Content;
  recoveryOrigin: Entry | null;
  status: 'active' | 'failed' | 'cancelled' | 'completed'; result?: WorldTravelOutcome;
  receipt: TravelReceipt | null; arrivalProof: TravelArrival | null; arrival: { receipt: TravelReceipt; observation: TravelArrival } | null;
  step?: Promise<CompletedWorldStepOutcome | null>; awaitingStep: boolean; stepSettled: boolean; handingOff: boolean; retirementFailed: boolean; stepCleanupFailed: boolean; confirming: boolean; deferredSave: boolean; confirmed: boolean; observedArrival: WorldHostLifecycle | null;
}
/** One pending physical arrival at most; not a second travel/request registry. */
interface ArrivalRetirement {
  readonly entry: Entry; readonly owner: object; readonly origin: Entry; readonly physical: WorldTravelLeaseCurrent;
  readonly birth: WorldMapBirthLifecycle; readonly generation: number; readonly content: Content;
  readonly attemptedTerminals: WeakSet<Entry>;
  completion: WorldTravelOutcome | null;
}
const same = (a: unknown, b: unknown): boolean => semanticFingerprint(a) === semanticFingerprint(b);
const why = (e: unknown): string => e instanceof Error ? e.message : String(e);
/** Runtime callers are JavaScript too: reject malformed public intents before touching a provider. */
export function readWorldTravelRequest(raw: unknown, allowEscapeRope = false): WorldTravelRequest {
  semanticFingerprint(raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('invalid-travel-request');
  const r = raw as Record<string, unknown>;
  const kind = r.kind;
  const keys = kind === 'connection' ? ['kind'] : kind === 'transfer' ? ['kind', 'target', 'preserveSurfing'] : ['kind', 'memberId', 'selection'];
  if (Object.keys(r).some(key => !keys.includes(key))) throw Error('invalid-travel-request-field');
  if (kind === 'connection') return { kind };
  if (kind === 'transfer') {
    if (!isTravelLocation(r.target) || typeof r.preserveSurfing !== 'boolean') throw Error('invalid-transfer-request');
    return { kind, target: clone(r.target), preserveSurfing: r.preserveSurfing };
  }
  if (kind !== 'fly' && kind !== 'dig' && kind !== 'teleport' && !(kind === 'escape-rope' && allowEscapeRope)) throw Error('invalid-travel-kind');
  if (kind === 'escape-rope' && (Object.hasOwn(r, 'memberId') || Object.hasOwn(r, 'selection'))) throw Error('invalid-rope-request');
  if (r.memberId !== undefined && (typeof r.memberId !== 'string' || !r.memberId.length || r.memberId.length > 64)) throw Error('invalid-travel-member');
  let selection: FlyDestination | null | undefined;
  if (r.selection !== undefined && r.selection !== null) {
    const point = r.selection;
    if (!point || typeof point !== 'object' || Array.isArray(point)) throw Error('invalid-fly-selection');
    const p = point as Record<string, unknown>;
    if (Object.keys(p).sort().join(',') !== 'pointIndex,regionId,target,x,y' || ![p.pointIndex, p.regionId, p.x, p.y].every(v => typeof v === 'number' && Number.isSafeInteger(v)) || typeof p.pointIndex !== 'number' || p.pointIndex < 0 || typeof p.regionId !== 'number' || p.regionId < 0) throw Error('invalid-fly-selection');
    const target = p.target;
    if (!target || typeof target !== 'object' || Array.isArray(target)) throw Error('invalid-fly-target');
    const t = target as Record<string, unknown>;
    if (Object.keys(t).sort().join(',') !== 'mapId,x,y' || typeof t.mapId !== 'number' || !Number.isSafeInteger(t.mapId) || t.mapId <= 0 || typeof t.x !== 'number' || !Number.isSafeInteger(t.x) || typeof t.y !== 'number' || !Number.isSafeInteger(t.y)) throw Error('invalid-fly-target');
    selection = { regionId: p.regionId, pointIndex: p.pointIndex, x: p.x as number, y: p.y as number, target: { mapId: t.mapId, x: t.x, y: t.y } };
  } else if (r.selection === null) selection = null;
  if (kind !== 'fly' && selection !== undefined) throw Error('unexpected-fly-selection');
  return { kind, ...(typeof r.memberId === 'string' ? { memberId: r.memberId } : {}), ...(selection !== undefined ? { selection } : {}) };
}
function metadata(content: Content, mapId: number): WorldBusinessFacts['mapMetadata'] {
  const maps = content.mapMetadata?.maps;
  return maps ? Object.hasOwn(maps, String(mapId)) ? { status: 'value', value: clone(maps[String(mapId)]!) } : { status: 'absent' } : { status: 'unavailable', reason: 'world-metadata-unavailable' };
}
function sourceSwitches(content: Content, mapId: number, lifecycle: WorldHostLifecycle): Record<string, WorldFact<boolean>> {
  const region = currentRegion(metadata(content, mapId));
  if (region.status !== 'ready') return {};
  const points = content.world?.regionMaps?.regions.find(r => r.id === region.regionId)?.points ?? [];
  const ids = [...new Set(points.flatMap(point => point.switchId !== undefined && point.switchId > 0 ? [point.switchId] : []))];
  if (ids.length && !lifecycle.travelSwitches) throw Error('travel-native-switches-unavailable');
  return Object.fromEntries(ids.map(id => [String(id), { status: 'value', value: lifecycle.travelSwitches?.values[String(id)] ?? false }]));
}
function nativeAt(lifecycle: WorldHostLifecycle, location: WorldLocation): boolean {
  return lifecycle.mapId === location.mapId && lifecycle.playerPosition?.x === location.x && lifecycle.playerPosition.y === location.y;
}
function sameNative(a: WorldHostLifecycle, b: WorldHostLifecycle): boolean {
  const at = a.sceneTransition, bt = b.sceneTransition;
  return a.map === b.map && a.mapId === b.mapId && a.player === b.player && a.scene === b.scene && a.playerPosition?.x === b.playerPosition?.x && a.playerPosition?.y === b.playerPosition?.y
    && (!!at === !!bt) && (!at || !bt || at.manager === bt.manager && at.prototype === bt.prototype && at.started === bt.started && at.nextScene === bt.nextScene && at.nextPrototype === bt.nextPrototype);
}

export class WorldTravelApplication {
  private readonly options: Options;
  private readonly nativeRegistry: WorldTravelLeaseSource | null;
  private entry: Entry | null = null;
  #arrivalRetirement: ArrivalRetirement | null = null;
  readonly #retirementPredecessors = new WeakMap<Entry, ArrivalRetirement>();
  private starting: object | null = null;
  private readonly requests = new Map<string, Entry>();
  private readonly issued = new WeakMap<TravelReceipt, Entry>();
  private sequence = 0;
  private accessing = false;
  private querying = false;
  constructor(options: Options) { this.options = options; this.nativeRegistry = options.host?.nativeLeaseSource ?? null; }
  get active(): boolean { return this.starting !== null || this.entry?.status === 'active' || this.entry?.handingOff === true || this.entry?.awaitingStep === true || this.entry?.retirementFailed === true || this.entry?.stepCleanupFailed === true; }
  private current(entry: Entry): void {
    if (this.entry !== entry || entry.status !== 'active' || entry.generation !== this.options.generation()) throw Error('travel-owner-stale');
  }
  private access<T>(entry: Entry, prepare: () => (actual: AtomicFieldQueryState & { readonly generation: number }) => AtomicStateResult<T>): T {
    if (!this.options.atomic) throw Error('travel-atomic-content-unavailable');
    if (this.accessing) throw Error('travel-atomic-reentrant');
    this.accessing = true;
    try { return this.options.atomic(() => { this.current(entry); const finish = prepare(); return actual => {
      this.current(entry);
      if (actual.generation !== entry.generation || semanticFingerprint(actual.game) !== entry.expectedGame || semanticFingerprint(actual.content) !== entry.contentIdentity) throw Error('travel-state-or-content-changed');
      const native = entry.observedArrival ?? entry.source;
      this.checkNativeLease(entry, actual.lifecycle, native);
      const player = actual.lifecycle.travelPlayer, expectedPlayer = native.travelPlayer;
      if (!player || !expectedPlayer || player.direction !== expectedPlayer.direction) throw Error('travel-native-player-changed');
      if (entry.observedArrival || entry.checkpoint?.phase === 'after-arrival' || entry.checkpoint === null) {
        if (player.transferring !== expectedPlayer.transferring || !same(player.target, expectedPlayer.target)) throw Error('travel-native-transfer-changed');
      } else if (player.transferring && (!entry.receipt || !same(player.target, entry.receipt.target))) throw Error('travel-native-transfer-changed');
      if (entry.admission.kind === 'fly') {
        const switches = sourceSwitches(actual.content, entry.admission.source.mapId, actual.lifecycle);
        if (!same(switches, entry.admission.switches) || Object.keys(switches).length > 0 && (actual.lifecycle.travelSwitches?.owner !== entry.source.travelSwitches?.owner || actual.lifecycle.travelSwitches?.data !== entry.source.travelSwitches?.data)) throw Error('travel-native-switches-changed');
      }
      return finish(actual);
    }; }); } finally { this.accessing = false; }
  }
  /** The reader has already authenticated the actual producer source/current in its private module. */
  private checkNativeLease(entry: Entry, actual: WorldHostLifecycle, expected: WorldHostLifecycle): void {
    const snapshot = actual.travelLease;
    if (!snapshot || snapshot.registry !== this.nativeRegistry) throw Error('travel-native-registry-unavailable');
    // A genuine new native publication supersedes the sole older cleanup credential.
    // Drop obsolete lineage here, so completed physical journeys cannot form a retained chain.
    if (this.#arrivalRetirement && snapshot.current !== this.#arrivalRetirement.physical) this.#arrivalRetirement = null;
    if (this.#retirementPredecessors.get(entry) !== this.#arrivalRetirement) this.#retirementPredecessors.delete(entry);
    const lease = snapshot.current, recovery = entry.recoveryLease;
    const owned = lease && lease.player === entry.source.player && (recovery
      ? lease.owner === recovery.owner && lease.receipt === recovery.receipt && lease.lease === recovery.lease && lease.serial === recovery.serial && lease.phase === 'arrived'
      : lease.owner === entry.owner && lease.receipt === entry.receipt);
    if (!owned) {
      if (entry.boundLease || snapshot !== entry.source.travelLease || !sameNative(actual, expected)) throw Error('travel-native-lease-changed');
      return;
    }
    if (lease.sourceScene !== entry.departureScene || actual.player !== lease.player || actual.scene !== lease.scene
      || actual.map !== expected.map || actual.mapId !== expected.mapId || actual.playerPosition?.x !== expected.playerPosition?.x || actual.playerPosition?.y !== expected.playerPosition?.y) throw Error('travel-native-source-changed');
    const bound = entry.boundLease;
    if (bound && (bound.lease !== lease.lease || bound.serial !== lease.serial || bound.owner !== lease.owner || bound.receipt !== lease.receipt || bound.player !== lease.player || bound.sourceScene !== lease.sourceScene)) throw Error('travel-native-lease-changed');
    const rank = { reserved: 0, performing: 1, arrived: 2 };
    if (bound && rank[lease.phase] < rank[bound.phase]) throw Error('travel-native-phase-regressed');
    if (entry.observedArrival || entry.confirmed || entry.checkpoint?.phase === 'after-arrival') {
      if (lease.phase !== 'arrived') throw Error('travel-native-arrival-proof-required');
    } else if (lease.phase === 'arrived') throw Error('travel-unacknowledged-arrival');
    const transition = actual.sceneTransition, before = expected.sceneTransition;
    if (transition && before && (transition.manager !== before.manager || transition.nextScene !== null && transition.nextScene !== lease.scene)) throw Error('travel-native-scene-transition-changed');
    // Native Scene_Map.start may change its started flag after the synchronous arrival. Identity,
    // private construction membership and exact serial remain required throughout the real tail.
    entry.boundLease = lease;
  }
  private observe(entry: Entry): TravelObservation {
    return this.access(entry, () => actual => ({ value: { owner: entry.owner, generation: entry.generation, game: actual.game, content: actual.content,
      requestId: entry.requestId, admission: entry.admission, checkpoint: entry.checkpoint } }));
  }
  private commit(entry: Entry, transform: (actual: TravelObservation) => TravelWrite): TravelObservation {
    let terminal = false, arriving = false;
    let movement: PreparedMovementStart | undefined, transferred: readonly string[] | undefined;
    const result = this.access(entry, () => {
      let prepared: PreparedTravelEntry | undefined;
      if (entry.arrival && entry.checkpoint) {
        // The B planner may consume its single weather draw here. Final state/content/native checks follow it.
        const observed = this.observePrepared(entry);
        prepared = this.options.prepareEntry(entry.checkpoint, observed.game, observed.content, () => this.current(entry));
      }
      return actual => {
        const before: TravelObservation = { owner: entry.owner, generation: entry.generation, game: actual.game, content: actual.content,
          requestId: entry.requestId, admission: entry.admission, checkpoint: entry.checkpoint };
        const write = transform(before);
        let game = write.game;
        if (write.terminal && entry.tool) {
          const catalog = catalogOf(actual.content), item = itemOf(catalog, entry.tool.itemId);
          if (!item || classifyFieldItem(item)?.kind !== 'escape-rope' || itemQuantity(game.inventory, item.id, catalog) < 1) throw Error('travel-tool-item-stale');
          const consumed = consumesItem(item);
          if (consumed) game = { ...game, inventory: removeItems(game.inventory, item.id, 1, catalog) };
          entry.toolConsumed = consumed;
        }
        if (write.arrival) {
          if (!entry.arrival || write.arrival.receipt !== entry.arrival.receipt || this.issued.get(write.arrival.receipt) !== entry || !same(write.arrival.observation, entry.arrival.observation)) throw Error('travel-unissued-arrival');
          if (!prepared) throw Error('travel-entry-not-prepared');
          if (entry.admission.kind === 'connection') {
            const proof = actual.lifecycle.travelLease?.movementStart, physical = actual.lifecycle.travelLease?.current, source = entry.admission.source;
            if (!proof || proof.kind !== 'connection' || !physical || proof.parentContext !== write.arrival.receipt || proof.physicalLease !== physical.lease || proof.physicalSerial !== physical.serial
              || physical.owner !== entry.owner || physical.receipt !== entry.receipt || physical.phase !== 'arrived' || physical.sourceScene !== entry.departureScene
              || proof.sourceMapId !== source.mapId || proof.from.x !== source.x || proof.from.y !== source.y || proof.direction !== source.direction
              || proof.mapId !== entry.checkpoint?.target.mapId || proof.to.x !== entry.checkpoint.target.x || proof.to.y !== entry.checkpoint.target.y
              || proof.mode.surfing !== entry.checkpoint.preserveSurfing || !this.options.prepareMovement) throw Error('connection-start-proof-unavailable');
            movement = this.options.prepareMovement(actual, proof.observation, write.arrival.receipt);
            if (movement.value.status !== 'counted' && movement.value.status !== 'duplicate') throw Error(`connection-start-rejected:${movement.value.reason}`);
            if (movement.next) game = { ...game, stats: movement.next.stats };
          }
          game = prepared.apply(game);
          if (write.transferHidden) transferred = [...write.transferHidden];
        }
        const checkpoint = write.checkpoint ? readTravelCheckpoint(write.checkpoint) : null;
        // Runtime retirement and persistent assignment share the native final interval.
        if (validateGameContent(game, actual.content).length) throw Error('invalid-travel-state');
        prepared?.installed(game);
        if (write.arrival && entry.admission.kind === 'connection' && entry.checkpoint) entry.connectionRecovery = { ...entry.checkpoint, phase: 'after-arrival', cursor: entry.checkpoint.cursor + 1 };
        entry.checkpoint = checkpoint; entry.expectedGame = semanticFingerprint(game);
        if (write.clearFlySelection && entry.admission.kind === 'fly') entry.admission = { ...entry.admission, selection: null };
        if (write.arrival) { arriving = true; entry.confirmed = true; entry.source = actual.lifecycle; entry.observedArrival = null; entry.arrival = null; }
        terminal = write.terminal;
        if (terminal) { entry.status = 'completed'; entry.result = { status: 'completed' }; }
        return { next: game, value: { ...before, game, admission: entry.admission, checkpoint, owner: terminal ? null : entry.owner } };
      };
    });
    // Mint only after the actual atomic installation returned successfully, before complete's
    // allowed host callbacks can admit a successor. This authorizes native retirement only.
    if (terminal && !arriving && entry.recoveryLease && !entry.receipt && entry.admission.kind !== 'connection') {
      const origin = entry.recoveryOrigin, birth = entry.source.travelLease?.mapBirth;
      if (origin && birth?.frame) this.#arrivalRetirement = { entry, owner: entry.owner, origin, physical: entry.recoveryLease, birth,
        generation: entry.generation, content: origin.admittedContent, attemptedTerminals: new WeakSet(), completion: null };
    }
    // A successful assignment is the only point that consumes this START permit.
    if (movement?.next) this.options.movementInstalled?.(movement, result.game);
    if (transferred) this.options.companionsTransferred?.(transferred);
    // No host callback occurs inside the native installation interval.
    if (terminal && !arriving) this.complete(entry);
    return result;
  }
  /** Preparation snapshot only; final native Content/state identity is checked by access(). */
  private observePrepared(entry: Entry): { game: GameState; content: Content } {
    const atomic = this.options.atomic;
    if (!atomic) throw Error('travel-atomic-content-unavailable');
    return atomic(() => actual => {
      this.current(entry);
      if (actual.generation !== entry.generation || semanticFingerprint(actual.game) !== entry.expectedGame || semanticFingerprint(actual.content) !== entry.contentIdentity) throw Error('travel-state-or-content-changed');
      return { value: { game: actual.game, content: actual.content } };
    });
  }
  private issue(entry: Entry, owner: object, generation: number, checkpoint: TravelCheckpoint): TravelReceipt {
    this.current(entry);
    if (entry.owner !== owner || generation !== entry.generation || checkpoint.phase !== 'awaiting-arrival' || !same(checkpoint, entry.checkpoint)) throw Error('travel-receipt-not-owned');
    if (entry.receipt) return entry.receipt;
    const receipt = Object.freeze({ token: `travel-receipt:${generation}:${++this.sequence}`, generation, target: Object.freeze(clone(checkpoint.target)) });
    this.issued.set(receipt, entry); entry.receipt = receipt; return receipt;
  }
  private child(entry: Entry): WorldTravelOperation {
    return new WorldTravelOperation({ observe: () => this.observe(entry), commitTravel: change => this.commit(entry, change),
      issueTransfer: (owner, generation, checkpoint) => this.issue(entry, owner, generation, checkpoint),
      recoverArrival: (owner, generation, checkpoint) => {
        this.current(entry);
        if (entry.owner !== owner || entry.generation !== generation || !entry.arrivalProof || !same(entry.arrivalProof.actual, checkpoint.target) || !entry.receipt) return null;
        const observed = this.options.host!.observeNow(), native = this.options.source(); this.current(entry);
        if (observed.status !== 'value' || !same(observed.value, entry.arrivalProof) || !nativeAt(native, checkpoint.target) || native.travelPlayer?.transferring !== false) throw Error('retained-arrival-proof-stale');
        entry.observedArrival = native; entry.arrival = { receipt: entry.receipt, observation: clone(entry.arrivalProof) };
        return clone(entry.arrivalProof);
      },
      release: (owner, generation) => { if (this.entry === entry && entry.owner === owner && entry.generation === generation && entry.status === 'active') { entry.status = 'failed'; this.retire(entry); if (this.entry === entry && entry.generation === this.options.generation()) this.options.released(); } },
    }, this.childHost(entry), { owner: entry.owner, generation: entry.generation });
  }
  private childHost(entry: Entry): TravelHost {
    const host = this.options.host!;
    return {
      preload: (owner, target) => host.preload(owner, target),
      connectionGeometry: (owner, mapId) => { if (!host.connectionGeometry) throw Error('connection-geometry-not-ready:provider-not-implemented'); return host.connectionGeometry(owner, mapId); },
      connectionPassage: (owner, map, target) => host.connectionPassage(owner, map, target),
      surfConnectionPassage: (owner, map, target) => { if (!host.surfConnectionPassage) throw Error('surf-connection-not-ready:target-surf-provider-not-implemented'); return host.surfConnectionPassage(owner, map, target); },
      observeNow: () => { this.current(entry); const native = this.options.source(); this.current(entry); if (!native.travelPlayer) throw Error('travel-native-player-unavailable'); return host.observeNow(); },
      reserve: (owner, receipt, map) => host.reserve(owner, receipt, map),
      confirm: (kind, target) => { this.current(entry); return host.confirm(kind, target, entry.owner); },
      effect: kind => { this.current(entry); return host.effect(kind, entry.owner); },
      waitFlyTail: milliseconds => { this.current(entry); return host.waitFlyTail(milliseconds, entry.owner); },
    };
  }
  private cancelNativeStep(entry: Entry): void {
    if (!entry.receipt || entry.admission.kind !== 'connection') return;
    try { this.options.host!.cancelConnectionStep(entry.owner, entry.receipt); entry.stepCleanupFailed = false; }
    catch (error) { entry.stepCleanupFailed = true; entry.result = { status: 'failed', reason: `connection-native-cancel-failed:${why(error)}` }; }
  }
  private retire(entry: Entry): TravelEffectResult {
    if (!entry.receipt) return { status: 'done' };
    let result: TravelEffectResult;
    try {
      result = this.options.host!.retireTransfer(entry.owner, entry.receipt);
      if (!result || result.status !== 'done' && (result.status !== 'failed' || typeof result.reason !== 'string')) result = { status: 'failed', reason: 'invalid-transfer-retirement' };
    } catch (error) { result = { status: 'failed', reason: why(error) }; }
    entry.retirementFailed = result.status === 'failed';
    if (result.status === 'failed') entry.result = { status: 'failed', reason: `travel-retirement-failed:${result.reason}` };
    return result;
  }
  private publish(entry: Entry, result: WorldTravelOutcome): WorldTravelOutcome {
    if (entry.retirementFailed || entry.stepCleanupFailed) return entry.result ?? { status: 'failed', reason: 'travel-retirement-failed' };
    entry.result = result;
    this.#retireCompletedPredecessor(entry);
    return result;
  }
  /** Only exact module-minted lineage can bridge an already committed owner's replacement.
   * A live successor or one with native arrival/step work never authorizes old cleanup. */
  #retirementActor(record: ArrivalRetirement): Entry | null {
    const actor = this.entry;
    if (actor === record.entry) return actor.status === 'completed' ? actor : null;
    return actor && this.#retirementPredecessors.get(actor) === record && (actor.status === 'cancelled' || actor.status === 'failed')
      && !actor.boundLease && !actor.recoveryLease && !actor.confirmed && !actor.awaitingStep && !actor.handingOff
      && !actor.retirementFailed && !actor.stepCleanupFailed ? actor : null;
  }
  #inheritRetirement(): ArrivalRetirement | null {
    const record = this.#arrivalRetirement;
    return record && this.#retirementActor(record) ? record : null;
  }
  /** One event-driven attempt per terminal descendant; explicit Retry remains the recovery entry
   * for a host cleanup failure. This never reruns the completed operation or its save callback. */
  #retireCompletedPredecessor(entry: Entry): void {
    const record = this.#arrivalRetirement;
    if (!record?.completion || this.#retirementPredecessors.get(entry) !== record || entry === record.entry
      || entry.status !== 'cancelled' && entry.status !== 'failed' || record.attemptedTerminals.has(entry)) return;
    record.attemptedTerminals.add(entry);
    record.entry.result = this.#finishRecovery(record.entry, record.completion);
  }
  #finishRecovery(entry: Entry, result: WorldTravelOutcome, onRetired?: (current: (requestId: string, owner: object) => boolean) => void): WorldTravelOutcome {
    if (result.status !== 'completed' || !entry.recoveryLease || entry.admission.kind === 'connection') return result;
    const record = this.#arrivalRetirement;
    if (!record || record.entry !== entry) return { status: 'failed', reason: 'travel-recovery-completion-stale' };
    // Set only from the actual completed execution's continuation. Descendant events may
    // subsequently consume this exact result, but cannot manufacture successful completion.
    record.completion ??= result;
    const { physical, origin, birth } = record, receipt = origin.receipt;
    let obsolete = false;
    const check = (released = false, consumed = false): void => {
      if (!this.options.atomic || !receipt || !birth.frame) throw Error('travel-recovery-authority-unavailable');
      this.options.atomic(() => actual => {
        if ((consumed ? this.#arrivalRetirement !== null : this.#arrivalRetirement !== record) || this.requests.get(entry.requestId) !== entry || entry.owner !== record.owner || entry.status !== 'completed'
          || record.generation !== this.options.generation() || actual.generation !== record.generation || this.issued.get(receipt) !== origin
          || origin.owner !== physical.owner || receipt !== physical.receipt || origin.generation !== record.generation
          || !origin.confirmed || !origin.arrivalProof || origin.arrivalProof.transferPending || !same(origin.arrivalProof.actual, receipt.target)) {
          obsolete = true; throw Error('travel-recovery-completion-stale');
        }
        const snapshot = actual.lifecycle.travelLease, currentBirth = snapshot?.mapBirth, frame = currentBirth?.frame;
        if (actual.content !== record.content || semanticFingerprint(actual.content) !== entry.contentIdentity) {
          obsolete = true; throw Error('travel-state-or-content-changed');
        }
        if (!snapshot || snapshot.registry !== this.nativeRegistry || snapshot.sourceHandoff || !currentBirth || !frame
          || currentBirth.birth !== birth.birth || currentBirth.queue !== birth.queue || currentBirth.manager !== birth.manager || currentBirth.scene !== birth.scene
          || frame.map !== birth.frame!.map || frame.data !== birth.frame!.data || frame.player !== physical.player || frame.mapId !== receipt.target.mapId
          || actual.lifecycle.scene !== currentBirth.scene || actual.lifecycle.map !== frame.map || actual.lifecycle.mapData !== frame.data || actual.lifecycle.player !== frame.player
          || !nativeAt(actual.lifecycle, receipt.target) || actual.lifecycle.travelPlayer?.transferring !== false
          || actual.lifecycle.travelPlayer.direction !== receipt.target.direction || actual.lifecycle.sceneTransition?.nextScene !== null || !actual.lifecycle.sceneTransition.started) {
          obsolete = true; throw Error('travel-recovery-target-birth-stale');
        }
        if (released) {
          if (snapshot.current !== null) { obsolete = snapshot.current !== physical; throw Error('travel-recovery-retirement-not-completed'); }
        } else if (snapshot.current !== physical || physical.phase !== 'arrived') {
          obsolete = true; throw Error('travel-recovery-physical-stale');
        }
        const actor = this.#retirementActor(record);
        if (!actor || semanticFingerprint(actual.game) !== actor.expectedGame) throw Error('travel-recovery-completion-stale');
        return { value: undefined };
      });
    };
    try {
      check();
      const release = this.options.host?.releaseRecoveredArrival;
      if (!release) throw Error('travel-recovery-retirement-unavailable');
      const retired = release(record.owner, physical, birth, check);
      if (!retired || retired.status !== 'done') throw Error(retired?.status === 'failed' ? retired.reason : 'invalid-recovery-retirement');
      check(true);
      const actor = this.#retirementActor(record);
      if (this.#arrivalRetirement === record) this.#arrivalRetirement = null;
      // This call may outlive the successful cleanup's current Entry. Give only its private
      // consumer a read-only post-await check, never a new travel or historical authority.
      let unused = true;
      onRetired?.((requestId, owner) => {
        if (requestId !== entry.requestId || owner !== record.owner || !unused) return false;
        unused = false;
        try {
          if (!actor || this.entry !== actor || this.active || !this.options.canRecover()) return false;
          check(true, true);
          return this.entry === actor && !this.active && this.options.canRecover();
        } catch { return false; }
      });
      return record.completion;
    } catch (error) {
      // Native/state supersession revokes this single credential. A transient active App
      // descendant or host failure retains its exact obligation for terminal event/Retry.
      if (obsolete && this.#arrivalRetirement === record) this.#arrivalRetirement = null;
      return { status: 'failed', reason: why(error) };
    }
  }
  private complete(entry: Entry): void {
    if (this.entry !== entry || entry.generation !== this.options.generation() || entry.status !== 'completed' || entry.connectionRecovery && !entry.step) return;
    if (entry.tool) this.options.toolCompleted?.(entry.requestId, entry.toolConsumed === true);
    const save = entry.deferredSave; entry.deferredSave = false;
    this.options.released();
    if (save && this.entry === entry && entry.generation === this.options.generation() && !this.active && this.options.canStart()) this.options.host!.resumeDeferredSave();
  }
  run(requestId: string, raw: WorldTravelRequest, shortcut?: object, toolParent?: object): Promise<WorldTravelOutcome> {
    try {
      const request = readWorldTravelRequest(raw, !!toolParent);
      const key = semanticFingerprint(request), old = this.requests.get(requestId);
      if (old) return old.key === key ? old.result ? Promise.resolve(old.result) : old.operation!.run() : Promise.resolve({ status: 'failed', reason: 'travel-request-conflict' });
      if (typeof requestId !== 'string' || !requestId.length || requestId.length > 128) throw Error('invalid-travel-request-id');
      if (this.active || !this.options.canStart(toolParent)) throw Error('operation-active');
      if (!this.options.host || !this.options.atomic) throw Error('world-travel-host-or-atomic-unavailable');
      const reservation = {}, generation = this.options.generation(); this.starting = reservation;
      try {
        const host = this.options.host, native = this.options.source();
        if (!native.travelPlayer) throw Error('travel-native-player-unavailable');
        if (!native.travelLease || native.travelLease.registry !== this.nativeRegistry) throw Error('travel-native-registry-unavailable');
        if (!native.sceneTransition || !native.sceneTransition.started || native.sceneTransition.nextScene !== null) throw Error('travel-native-scene-unavailable');
        const observed = host.observeNow(), facts = host.facts();
        semanticFingerprint(observed); semanticFingerprint(facts);
        if (this.starting !== reservation || generation !== this.options.generation()) throw Error('travel-admission-stale');
        if (observed.status !== 'value' || observed.value.transferPending || !native.travelPlayer || native.travelPlayer.transferring || native.travelPlayer.direction !== observed.value.actual.direction || !nativeAt(native, observed.value.actual)) throw Error('travel-native-source-unavailable');
        if (typeof facts.debug !== 'boolean' || typeof facts.connectionBypass !== 'boolean') throw Error('invalid-travel-source-facts');
        const source = clone(observed.value.actual);
        let entry: Entry;
        this.options.atomic(() => actual => {
          if (this.starting !== reservation || actual.generation !== generation || !sameNative(actual.lifecycle, native) || actual.lifecycle.travelLease !== native.travelLease) throw Error('travel-admission-stale');
          if (shortcut) {
            const issued = this.options.shortcutAdmission?.(shortcut), selected = issued?.selection, origin = issued?.source;
            if (!origin || !selected || selected.kind !== 'move' || request.kind !== selected.moveId || !('memberId' in request) || request.memberId !== selected.memberId
              || origin.generation !== generation || origin.map !== actual.lifecycle.map || origin.player !== actual.lifecycle.player || origin.mapId !== source.mapId || origin.x !== source.x || origin.y !== source.y
              || !actual.game.party.some(member => member.id === selected.memberId && !member.isEgg && member.moves.some(move => move.id === selected.moveId))) throw Error('travel-shortcut-admission-stale');
          }
          const tool = toolParent && request.kind === 'escape-rope' ? this.options.toolAdmission?.(toolParent, actual) : null;
          if (request.kind === 'escape-rope' && !tool || toolParent && request.kind !== 'escape-rope') throw Error('travel-tool-admission-stale');
          const data = metadata(actual.content, source.mapId);
          let admission: TravelAdmission;
          if (request.kind === 'connection') admission = { kind: 'connection', source, sourceGeometry: { status: 'value', value: clone(observed.value.loadedGeometry) },
            candidate: { ...source, x: source.x + (source.direction === 6 ? 1 : source.direction === 4 ? -1 : 0), y: source.y + (source.direction === 2 ? 1 : source.direction === 8 ? -1 : 0) },
            bypass: facts.connectionBypass, stepId: `travel-step:${generation}:${++this.sequence}` };
          else if (request.kind === 'transfer') admission = { ...clone(request), source };
          else admission = { kind: request.kind, source, metadata: data, outdoor: data.status === 'value' ? { status: 'value', value: data.value.outdoor === true } : data.status === 'absent' ? { status: 'value', value: false } : data,
            characterHome: clone(facts.characterHome), globalHome: clone(facts.globalHome), switches: sourceSwitches(actual.content, source.mapId, actual.lifecycle), selection: request.kind === 'fly' ? clone(request.selection ?? null) : null,
            ...(request.memberId ? { memberId: request.memberId } : {}), debug: facts.debug };
          entry = { owner: Object.freeze({}), generation, requestId, key, request: clone(request), tool: tool ? Object.freeze({ itemId: tool.itemId }) : null, admission, checkpoint: null, connectionRecovery: null, operation: null,
            source: actual.lifecycle, departureScene: actual.lifecycle.scene, boundLease: null, recoveryLease: null, recoveryOrigin: null, expectedGame: semanticFingerprint(actual.game), contentIdentity: semanticFingerprint(actual.content), admittedContent: actual.content, status: 'active', receipt: null, arrivalProof: null, arrival: null, awaitingStep: false, stepSettled: true, handingOff: false, retirementFailed: false, stepCleanupFailed: false, confirming: false, deferredSave: false, confirmed: false, observedArrival: null };
          const predecessor = this.#inheritRetirement();
          if (predecessor) this.#retirementPredecessors.set(entry, predecessor);
          entry.operation = this.child(entry);
          if (this.requests.size >= 256) {
            for (const [id, previous] of this.requests) if (previous !== this.entry && previous !== this.#arrivalRetirement?.entry && previous.status !== 'active' && !previous.handingOff && previous.stepSettled && !previous.retirementFailed) { this.requests.delete(id); break; }
            if (this.requests.size >= 256) throw Error('travel-request-limit');
          }
          this.entry = entry; this.requests.set(requestId, entry);
          if (toolParent) this.options.toolInstalled?.(toolParent);
          return { value: undefined };
        });
        return entry!.operation!.run().then(result => { return this.publish(entry!, result); });
      } finally { if (this.starting === reservation) this.starting = null; }
    } catch (error) { return Promise.resolve({ status: 'failed', reason: why(error) }); }
  }
  isOwnerCurrent(owner: object): boolean { const e = this.entry; return !!e && e.owner === owner && (e.status === 'active' || e.awaitingStep) && e.generation === this.options.generation(); }
  isCurrent(owner: object, receipt: TravelReceipt): boolean {
    const e = this.issued.get(receipt); return !!e && e.owner === owner && e === this.entry && e.generation === this.options.generation() && e.status === 'active' && e.receipt === receipt && !e.confirmed && e.checkpoint?.phase === 'awaiting-arrival';
  }
  /** Native perform preflight. Registry identity alone never authorizes movement after a stale source. */
  canPerform(owner: object, receipt: TravelReceipt): boolean {
    const entry = this.issued.get(receipt);
    if (!entry || !this.isCurrent(owner, receipt)) return false;
    try { this.observe(entry); return this.isCurrent(owner, receipt); } catch { return false; }
  }
  confirmArrival(owner: object, receipt: TravelReceipt, observation: TravelArrival): TravelConfirmation {
    const entry = this.issued.get(receipt);
    if (!entry || entry !== this.entry || entry.owner !== owner || entry.generation !== this.options.generation()) return { status: 'refused', reason: 'stale-travel-receipt' };
    if (entry.confirming) return { status: 'refused', reason: 'travel-arrival-reentrant' };
    if (entry.confirmed) return { status: 'duplicate' };
    if (!this.isCurrent(owner, receipt)) return { status: 'refused', reason: 'stale-travel-receipt' };
    entry.confirming = true;
    try {
      semanticFingerprint(observation);
      const native = this.options.source();
      if (!native.travelPlayer) throw Error('travel-native-player-unavailable');
      const now = this.options.host!.observeNow();
      this.current(entry);
      if (now.status !== 'value' || !same(now.value, observation) || !nativeAt(native, receipt.target) || native.player !== entry.source.player || !native.travelPlayer || native.travelPlayer.transferring || native.travelPlayer.direction !== receipt.target.direction) throw Error('travel-arrival-native-mismatch');
      entry.arrivalProof = clone(observation); entry.observedArrival = native; entry.arrival = { receipt, observation: clone(observation) };
      const result = entry.operation!.confirmArrival(receipt, observation);
      entry.arrival = null;
      if (result.status === 'arrived') this.finishConfirmed(entry, owner, receipt);
      return result;
    } catch (error) { entry.arrival = null; entry.observedArrival = null; entry.handingOff = false; this.fail(entry, why(error)); return { status: 'refused', reason: why(error) }; }
    finally { entry.confirming = false; }
  }
  private assertConnectionTarget(entry: Entry, receipt: TravelReceipt): void {
    this.options.atomic!(() => actual => {
      if (!this.isStepPending(entry.owner, receipt) || actual.generation !== entry.generation || semanticFingerprint(actual.game) !== entry.expectedGame || semanticFingerprint(actual.content) !== entry.contentIdentity) throw Error('connection-target-step-stale');
      this.checkNativeLease(entry, actual.lifecycle, entry.source);
      if (!nativeAt(actual.lifecycle, receipt.target) || actual.lifecycle.travelPlayer?.transferring !== false || !actual.lifecycle.sceneTransition || !actual.lifecycle.sceneTransition.started) throw Error('connection-target-scene-not-ready');
      return { value: undefined };
    });
  }
  private finishConfirmed(entry: Entry, owner: object, receipt: TravelReceipt): void {
    if (entry.admission.kind === 'connection' && !entry.step) {
      entry.awaitingStep = true; entry.stepSettled = false;
      let ready: import('./world-travel-ports').WorldTravelStepFacts | Promise<import('./world-travel-ports').WorldTravelStepFacts>;
      const physical = entry.recoveryLease ?? entry.boundLease;
      if (!physical || physical.phase !== 'arrived') { entry.awaitingStep = false; entry.stepSettled = true; throw Error('connection-physical-arrival-proof-required'); }
      try { ready = this.options.host!.connectionStepFacts(owner, receipt, physical, entry.admission.stepId); }
      catch (error) { entry.awaitingStep = false; entry.stepSettled = true; this.cancelNativeStep(entry); throw error; }
      let handedOff = false;
      entry.step = Promise.resolve(ready).then(facts => {
        if (!this.isStepPending(owner, receipt)) throw Error('connection-target-step-stale');
        semanticFingerprint(facts);
        if (typeof facts.ice !== 'boolean' || facts.sceneActive !== true || !Number.isSafeInteger(facts.regionId) || !Number.isSafeInteger(facts.terrainTag)) throw Error('invalid-connection-step-facts');
        this.assertConnectionTarget(entry, receipt);
        entry.handingOff = true;
        try {
          const pending = this.options.completeConnection(owner, receipt, facts);
          handedOff = true; entry.awaitingStep = false;
          return pending;
        } finally { entry.handingOff = false; }
      }).then(step => {
        entry.awaitingStep = false; entry.stepSettled = true;
        if (this.entry !== entry || entry.generation !== this.options.generation()) return step;
        try { this.options.host!.finishConnectionStep(owner, receipt, step); }
        catch (error) { this.cancelNativeStep(entry); entry.connectionRecovery = null; entry.status = 'failed'; this.publish(entry, { status: 'failed', reason: `connection-native-finish-failed:${why(error)}` }); return step; }
        if (!step.prefix.stepCommitted && (step.status === 'failed' || step.status === 'refused' || step.status === 'cancelled')) { entry.status = 'failed'; entry.result = { status: 'failed', reason: 'connection-target-step-not-committed' }; }
        else { entry.connectionRecovery = null; entry.result = { status: 'completed', step }; this.complete(entry); }
        return step;
      }).catch((error: unknown) => {
        entry.awaitingStep = false; entry.stepSettled = true;
        if (this.entry === entry && entry.generation === this.options.generation() && entry.status !== 'cancelled') {
          this.cancelNativeStep(entry);
          if (handedOff) entry.connectionRecovery = null; // An indeterminate D prefix is never counted again.
          entry.status = 'failed'; this.publish(entry, { status: 'failed', reason: why(error) }); this.options.released();
        }
        return null;
      });
    }
    if (entry.status === 'completed' && !entry.step) this.complete(entry);
  }
  isStepPending(owner: object, receipt: TravelReceipt): boolean {
    const entry = this.issued.get(receipt);
    return !!entry && entry === this.entry && entry.owner === owner && entry.receipt === receipt && entry.generation === this.options.generation()
      && entry.confirmed && entry.status === 'completed' && entry.awaitingStep && !entry.stepSettled;
  }
  finishArrival(receipt: TravelReceipt): Promise<WorldTravelOutcome> {
    const entry = this.issued.get(receipt);
    if (!entry || entry !== this.entry || entry.generation !== this.options.generation() || !entry.confirmed) return Promise.resolve({ status: 'failed', reason: 'stale-travel-receipt' });
    if (entry.step) return entry.step.then(step => {
      if (entry.status === 'failed' || entry.status === 'cancelled' || step === null) return entry.result ?? { status: 'failed', reason: 'connection-target-step-not-committed' };
      const result = { status: 'completed' as const, step }; entry.result = result; this.complete(entry); return result;
    });
    return entry.operation!.finishArrival().then(result => { return this.publish(entry, result); });
  }
  connectionStepId(owner: object, receipt: TravelReceipt): string | null {
    const e = this.issued.get(receipt);
    return e && e === this.entry && e.owner === owner && e.generation === this.options.generation() && e.handingOff && e.admission.kind === 'connection' ? e.admission.stepId : null;
  }
  private fail(entry: Entry, reason: string): TravelRunResult {
    const result = entry.operation!.cancel();
    if (this.entry === entry && entry.generation === this.options.generation()) { entry.status = 'failed'; this.publish(entry, { status: 'failed', reason }); this.options.released(); }
    return result;
  }
  transferFailed(owner: object, receipt: TravelReceipt, reason: string, observation?: TravelArrival): void {
    const entry = this.issued.get(receipt);
    if (entry && entry === this.entry && entry.owner === owner && entry.generation === this.options.generation() && entry.status === 'active') {
      if (observation) {
        semanticFingerprint(observation); const actual = this.options.host!.observeNow(), native = this.options.source();
        this.current(entry);
        if (actual.status === 'value' && same(actual.value, observation) && nativeAt(native, receipt.target) && native.travelPlayer?.transferring === false) entry.arrivalProof = clone(observation);
      }
      this.publish(entry, entry.operation!.transferFailed(receipt, reason));
    }
  }
  cancel(requestId: string): TravelRunResult {
    const entry = this.requests.get(requestId);
    if (!entry || entry !== this.entry || entry.generation !== this.options.generation()) return { status: 'failed', reason: 'stale-travel-request' };
    if (entry.stepCleanupFailed) { this.cancelNativeStep(entry); if (entry.stepCleanupFailed) return entry.result!; }
    if (entry.retirementFailed) { this.retire(entry); if (entry.retirementFailed || entry.stepCleanupFailed) return entry.result!; }
    if (entry.awaitingStep) { entry.awaitingStep = false; entry.stepSettled = true; entry.status = 'cancelled'; entry.deferredSave = false; this.cancelNativeStep(entry); this.retire(entry); this.options.released(); return this.publish(entry, { status: 'cancelled' }); }
    if (entry.status !== 'active') return entry.result ?? { status: 'cancelled' };
    const result = entry.operation!.cancel(); entry.status = 'cancelled'; entry.deferredSave = false; return this.publish(entry, result);
  }
  /** Pure runtime inspection. Never call native providers/cleanup/atomic or sample RNG here. */
  recovery(requestId: string): FieldShortcutRecoverySnapshot {
    const record = this.#arrivalRetirement;
    if (record?.completion && record.entry.requestId === requestId) {
      const blocked = !this.#retirementActor(record) || !this.options.canRecover();
      return shortcutRecoverySnapshot('failed', 'after-arrival', 'arrived', 'tail-failed', !blocked, false, blocked ? 'operation-active' : 'not-cancellable');
    }
    const e = this.requests.get(requestId);
    if (!e || e !== this.entry || e.generation !== this.options.generation()) return shortcutRecoverySnapshot('unavailable', 'unavailable', 'unavailable', 'request-unavailable', false, false, 'request-unavailable');
    const checkpoint = e.checkpoint ?? e.connectionRecovery;
    const phase = checkpoint?.phase ?? 'unavailable';
    const arrived = !!e.arrivalProof || !!e.observedArrival || e.confirmed || e.boundLease?.phase === 'arrived' || e.recoveryLease?.phase === 'arrived';
    const physical = arrived ? 'arrived' : e.receipt ? e.status === 'active' ? 'reserved' : 'unavailable' : e.checkpoint ? 'not-started' : 'unavailable';
    if (e.status === 'completed' || e.status === 'cancelled') return shortcutRecoverySnapshot(e.status, phase, physical);
    if (e.status === 'active' || e.awaitingStep || e.handingOff) return shortcutRecoverySnapshot('pending', phase, physical, 'executing', false, false, 'executing');
    if (!checkpoint) return shortcutRecoverySnapshot('unavailable', phase, physical, 'not-retryable');
    const blocked = !this.options.canRecover();
    const reason: FieldShortcutRecoveryReason = blocked ? 'operation-active' : arrived ? 'tail-failed'
      : phase === 'awaiting-arrival' ? 'arrival-unconfirmed' : phase === 'preparing' && checkpoint.cursor === 0 && /map|load|missing|network|resource/i.test(e.result?.status === 'failed' ? e.result.reason : '') ? 'load-failed' : 'travel-failed';
    return shortcutRecoverySnapshot('failed', phase, physical, reason, !blocked && (!e.receipt || arrived), !blocked && !arrived && !e.receipt && (phase === 'preparing' || phase === 'ready'), blocked ? 'operation-active' : 'not-retryable');
  }
  /** Explicit failed-only cancellation. Never enlarge active current() or guess physical arrival. */
  cancelFailed(requestId: string): TravelRunResult {
    const e = this.requests.get(requestId);
    if (!e || e !== this.entry || e.generation !== this.options.generation() || e.status !== 'failed') return { status: 'failed', reason: 'travel-not-cancellable' };
    const allowed = this.recovery(requestId);
    if (!allowed.cancel.enabled || !e.checkpoint || e.receipt || e.arrivalProof || e.confirmed) return { status: 'failed', reason: allowed.reasonCode === 'operation-active' ? 'operation-active' : 'travel-not-cancellable' };
    const reservation = {}; this.starting = reservation;
    try {
      if (!this.options.atomic) throw Error('travel-atomic-content-unavailable');
      this.options.atomic(() => actual => {
        if (this.starting !== reservation || this.entry !== e || this.requests.get(requestId) !== e || e.status !== 'failed' || actual.generation !== e.generation || e.generation !== this.options.generation()) throw Error('travel-cancel-stale');
        if (semanticFingerprint(actual.game) !== e.expectedGame || semanticFingerprint(actual.content) !== e.contentIdentity || !sameNative(actual.lifecycle, e.source)
          || actual.lifecycle.travelLease !== e.source.travelLease || actual.lifecycle.travelPlayer?.transferring !== false || !same(actual.lifecycle.travelPlayer?.target, e.source.travelPlayer?.target)) throw Error('travel-cancel-source-changed');
        if (e.receipt || e.arrivalProof || e.confirmed || !e.checkpoint || e.checkpoint.phase !== 'preparing' && e.checkpoint.phase !== 'ready') throw Error('travel-not-cancellable');
        e.status = 'cancelled'; e.checkpoint = null; e.deferredSave = false;
        return { value: undefined };
      });
      const result: TravelRunResult = { status: 'cancelled' }; this.publish(e, result); if (this.starting === reservation) this.starting = null; this.options.released(); return result;
    } catch (error) { return { status: 'failed', reason: why(error) }; }
    finally { if (this.starting === reservation) this.starting = null; }
  }
  /** onAdmitted is the World parent's closed private attempt capture, never a host/GameApp option.
   * It captures a real issued replacement execution, or that exact completed execution's remaining
   * cleanup continuation. No owner is re-signed; the callback stays outside atomic installation. */
  retry(requestId: string, onAdmitted?: (owner: object) => void, onRetired?: (current: (requestId: string, owner: object) => boolean) => void): Promise<WorldTravelOutcome> {
    const retirement = this.#arrivalRetirement;
    if (retirement?.completion && retirement.entry.requestId === requestId) {
      if (this.active || !this.#retirementActor(retirement) || !this.options.canStart()) return Promise.resolve({ status: 'failed', reason: 'operation-active' });
      try {
        onAdmitted?.(retirement.owner);
        const result = this.#finishRecovery(retirement.entry, retirement.completion, onRetired); retirement.entry.result = result;
        return Promise.resolve(result);
      } catch (error) { return Promise.resolve({ status: 'failed', reason: why(error) }); }
    }
    const prior = this.requests.get(requestId);
    if (!prior || prior !== this.entry || prior.status !== 'failed' || prior.generation !== this.options.generation() || !prior.checkpoint && !prior.connectionRecovery) return Promise.resolve({ status: 'failed', reason: 'travel-not-retryable' });
    if (prior.stepCleanupFailed) { this.cancelNativeStep(prior); if (prior.stepCleanupFailed) return Promise.resolve(prior.result!); }
    if (prior.retirementFailed) { this.retire(prior); if (prior.retirementFailed) return Promise.resolve(prior.result!); }
    if (this.active || !this.options.canStart()) return Promise.resolve({ status: 'failed', reason: 'operation-active' });
    const checkpoint = prior.checkpoint ?? prior.connectionRecovery!;
    const reservation = {}; this.starting = reservation;
    try {
      const source = this.options.source();
      if (!source.travelPlayer) throw Error('travel-native-player-unavailable');
      const now = this.options.host!.observeNow();
      if (this.starting !== reservation || this.entry !== prior || prior.generation !== this.options.generation()) throw Error('travel-retry-stale');
      if (now.status !== 'value' || now.value.transferPending || !nativeAt(source, now.value.actual)) throw Error('travel-retry-native-unavailable');
      if (checkpoint.kind !== 'connection' && checkpoint.kind !== 'transfer' && !prior.arrivalProof && !prior.confirmed
        && (!sameNative(source, prior.source) || source.mapData !== prior.source.mapData || source.travelLease !== prior.source.travelLease)) throw Error('travel-retry-source-changed');
      if (checkpoint.phase === 'awaiting-arrival' && same(now.value.actual, checkpoint.target) && !prior.arrivalProof) throw Error('travel-native-arrival-proof-required');
      if (prior.confirmed && !same(now.value.actual, checkpoint.target)) throw Error('travel-retry-target-moved');
      const physical = source.travelLease?.current, previous = prior.recoveryLease ?? prior.boundLease;
      let recoveryLease: WorldTravelLeaseCurrent | null = null;
      if (prior.arrivalProof && (prior.confirmed || same(now.value.actual, checkpoint.target))) {
        if (!physical || !previous || source.travelLease?.registry !== this.nativeRegistry || physical.phase !== 'arrived' || physical.lease !== previous.lease || physical.serial !== previous.serial || physical.owner !== previous.owner || physical.receipt !== previous.receipt) throw Error('travel-retained-native-proof-unavailable');
        recoveryLease = physical;
      }
      const next: Entry = { ...prior, recoveryOrigin: recoveryLease ? prior.recoveryOrigin ?? prior : null, owner: Object.freeze({}), source, boundLease: recoveryLease, recoveryLease, status: 'active', operation: null, receipt: null, arrival: null, observedArrival: null, awaitingStep: false, stepSettled: true, handingOff: false,
        admission: clone(prior.admission), checkpoint: readTravelCheckpoint(checkpoint), deferredSave: prior.deferredSave };
      delete next.result; delete next.step;
      const predecessor = this.#retirementPredecessors.get(prior);
      if (predecessor && predecessor === this.#arrivalRetirement) this.#retirementPredecessors.set(next, predecessor);
      next.operation = this.child(next); this.entry = next; this.requests.set(requestId, next);
      onAdmitted?.(next.owner);
      if (next.admission.kind === 'connection' && next.confirmed && checkpoint.phase === 'after-arrival') {
        const receipt = Object.freeze({ token: `travel-recovery:${next.generation}:${++this.sequence}`, generation: next.generation, target: Object.freeze(clone(checkpoint.target)) });
        next.receipt = receipt; this.issued.set(receipt, next);
      }
      return next.operation.run().then(async result => {
        if (next.confirmed && next.receipt && this.entry === next && next.generation === this.options.generation()) {
          this.finishConfirmed(next, next.owner, next.receipt);
          if (result.status === 'tail-pending' || next.step) return this.finishArrival(next.receipt);
        }
        return this.publish(next, this.#finishRecovery(next, result, onRetired));
      });
    } catch (error) { return Promise.resolve({ status: 'failed', reason: why(error) }); }
    finally { if (this.starting === reservation) this.starting = null; }
  }
  /** World parent only: a terminal item receipt may delegate this exact remaining cleanup.
   * A boolean observation grants no capability; retry still authenticates the entire credential. */
  hasPendingArrivalRetirement(requestId: string): boolean {
    const record = this.#arrivalRetirement;
    return !!record?.completion && record.entry.requestId === requestId && record.generation === this.options.generation()
      && this.requests.get(requestId) === record.entry && record.entry.owner === record.owner && record.entry.status === 'completed'
      && this.#retirementActor(record) !== null;
  }
  /** Read the actual private request registry, including this execution's terminal state. */
  isRetryExecutionCurrent(requestId: string, owner: object): boolean {
    const entry = this.requests.get(requestId);
    return !!entry && entry.owner === owner && entry.generation === this.options.generation();
  }
  deferSave(): boolean {
    const entry = this.entry;
    if (!entry || entry.generation !== this.options.generation() || entry.retirementFailed || entry.stepCleanupFailed || entry.status !== 'active' && !entry.awaitingStep && !entry.handingOff && entry.stepSettled) return false;
    entry.deferredSave = true; return true;
  }
  flyDestinations(): ReturnType<typeof deriveFlyDestinations> {
    const host = this.options.host, atomic = this.options.atomic;
    if (!host || !atomic || this.querying || this.active || !this.options.canStart()) return { status: 'blocked', reason: 'world-travel-unavailable' };
    const generation = this.options.generation(); this.querying = true;
    try { return atomic(() => actual => {
      if (generation !== actual.generation || this.active || !this.options.canStart()) throw Error('travel-query-stale');
      return { value: deriveFlyDestinations({ metadata: metadata(actual.content, actual.lifecycle.mapId), regionMaps: actual.content.world?.regionMaps,
        visitedMaps: actual.game.world.visitedMaps, readSwitch: id => sourceSwitches(actual.content, actual.lifecycle.mapId, actual.lifecycle)[String(id)] ?? { status: 'unavailable' } }) };
    }); } catch (error) { return { status: 'blocked', reason: why(error) }; } finally { this.querying = false; }
  }
  invalidate(): void { this.#arrivalRetirement = null; const e = this.entry; this.entry = null; this.starting = null; this.requests.clear(); if (e) { e.deferredSave = false; e.operation!.cancel(); this.cancelNativeStep(e); this.retire(e); } }
}
