import type { CompanionPlacement } from '../../framework/rules/companion-placement';
/** Native preparation for ordinary companion actions. This module never issues an App action or writes GameState. */
import { CompanionNativeFactsMZ } from './event-companion-native-facts-mz';
import type { CompanionNativeFactsMZOptions } from './event-companion-native-facts-mz';
import type { CompanionCurrentEventFacts, CompanionFactsMZOptions } from './event-companion-facts-mz';
import type { CompanionOriginOwnCell, CompanionPreparedOriginObservation, CompanionPreparedSource, CompanionProductionPreparation } from './event-companion-production-ports';
import type { CompanionAction, CompanionHost } from '../../framework/app/event-companion-operation';
import type { CompanionRelation, CompanionRemoval } from '../../framework/rules/event-companions';
import { isEventCompanion } from '../../framework/rules/event-companions';
import type { EventCompanionState } from '../../framework/rules/world-state';
import type { WorldDirection, WorldFact, WorldLocation, WorldPoint } from '../../framework/rules/world-data';
import { isTravelLocation } from '../../framework/rules/world-travel';
import { semanticFingerprint } from '../../framework/rules/semantic';
import { clone } from '../../framework/rules/value';

interface Frame {
  readonly application: object; readonly generation: number; readonly content: object; readonly contentKey: string;
  readonly map: object; readonly data: object; readonly player: object; readonly scene: object;
  readonly location: WorldLocation;
}
interface Registration { readonly id: number; readonly native: object; readonly raw: object; readonly key: string }
interface Prepared {
  readonly value: CompanionPreparedSource; readonly frame: Frame; readonly epoch: number; readonly serial: object;
  readonly event: object | null; readonly trail: object | null; readonly registration: Registration | null;
  closed: boolean; issue: string | null; origin: CompanionPreparedOriginObservation | null;
}
const why = (error: unknown): string => error instanceof Error ? error.message : String(error);
const unavailable = (reason: string): { status: 'unavailable'; reason: string } => ({ status: 'unavailable', reason });
const natural = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
const same = (a: Frame, b: Frame): boolean => a.application === b.application && a.generation === b.generation
  && a.content === b.content && a.contentKey === b.contentKey && a.map === b.map && a.data === b.data
  && a.player === b.player && a.scene === b.scene && semanticFingerprint(a.location) === semanticFingerprint(b.location);

export class CompanionProductionSourceMZ implements CompanionProductionPreparation {
  #root: object; #proxy: (raw: unknown) => boolean; #current: CompanionFactsMZOptions['current'];
  #ownedContentIdentity: CompanionFactsMZOptions['ownedContentIdentity'];
  #facts: CompanionNativeFactsMZ; #issued = new WeakMap<object, Prepared>(); #latest: Prepared | null = null;
  #serial: object = Object.freeze({}); #epoch = 0; #capturing = false;
  constructor(root: unknown, options: CompanionNativeFactsMZOptions, nativeIsProxy: (raw: unknown) => boolean) {
    if (typeof nativeIsProxy !== 'function') throw Error('companion-production-proxy-capability-required');
    this.#proxy = nativeIsProxy; this.#root = this.object(root);
    const read = this.data(options, 'current'); if (typeof read !== 'function') throw Error('companion-production-context-required');
    this.#current = read as CompanionFactsMZOptions['current'];
    const owned = this.data(options, 'ownedContentIdentity');
    if (owned !== undefined && (typeof owned !== 'function' || nativeIsProxy(owned))) throw Error('companion-production-context-required');
    this.#ownedContentIdentity = owned as CompanionFactsMZOptions['ownedContentIdentity'];
    this.#facts = new CompanionNativeFactsMZ(root, options, nativeIsProxy);
  }
  private object(raw: unknown): object {
    if (!raw || typeof raw !== 'object' && typeof raw !== 'function' || this.#proxy(raw)) throw Error('companion-production-unsafe-object');
    return raw as object;
  }
  private data(owner: unknown, key: string): unknown {
    const d = Object.getOwnPropertyDescriptor(this.object(owner), key);
    if (d && !Object.hasOwn(d, 'value')) throw Error('companion-production-own-data-required');
    return d?.value;
  }
  private safe(raw: unknown, seen = new Set<object>()): void {
    if (raw === null || typeof raw !== 'object') return;
    const object = this.object(raw); if (seen.has(object)) throw Error('companion-production-cyclic-data'); seen.add(object);
    for (const key of Reflect.ownKeys(object)) {
      if (typeof key !== 'string') throw Error('companion-production-data-key-invalid');
      this.safe(this.data(object, key), seen);
    }
    seen.delete(object);
  }
  private capture(): Frame {
    if (this.#capturing) throw Error('companion-production-context-reentrant'); this.#capturing = true;
    try {
      const c = this.#current(); if (!c) throw Error('companion-production-application-unavailable');
      const application = this.object(this.data(c, 'application')), generation = this.data(c, 'generation'), content = this.object(this.data(c, 'content'));
      if (!natural(generation)) throw Error('companion-production-generation-invalid');
      const owned = this.#ownedContentIdentity?.(content);
      if (owned === undefined) this.safe(content);
      const map = this.object(this.data(this.#root, '$gameMap')), data = this.object(this.data(this.#root, '$dataMap'));
      const player = this.object(this.data(this.#root, '$gamePlayer')), manager = this.object(this.data(this.#root, 'SceneManager'));
      const scene = this.object(this.data(manager, '_scene'));
      const location = { mapId: this.data(map, '_mapId'), x: this.data(player, '_x'), y: this.data(player, '_y'), direction: this.data(player, '_direction') };
      if (!isTravelLocation(location) || this.data(player, '_transferring') !== false || this.data(manager, '_nextScene') !== null || this.data(scene, '_started') !== true) throw Error('companion-production-native-source-unavailable');
      return Object.freeze({ application, generation, content, contentKey: owned ?? semanticFingerprint(content), map, data, player, scene, location: Object.freeze(location) });
    } finally { this.#capturing = false; }
  }
  private entry(value: unknown): Prepared | null {
    if (!value || typeof value !== 'object' || this.#proxy(value)) return null;
    const entry = this.#issued.get(value);
    if (!entry || entry.closed || entry.epoch !== this.#epoch || entry.serial !== this.#serial || this.#latest !== entry) return null;
    return entry;
  }
  isCurrent(value: unknown): boolean {
    const entry = this.entry(value); if (!entry) return false;
    try {
      return same(entry.frame, this.capture()) && (!entry.registration || this.registrationCurrent(entry.registration))
        && (!entry.trail || this.#facts.isReady(entry.trail)) && this.entry(value) === entry;
    } catch { return false; }
  }
  private registrationKey(f: CompanionCurrentEventFacts): string {
    // 216 is a live author intent, not part of the event body clone's validity.
    return semanticFingerprint({ origin: f.origin, name: f.name, location: f.location, appearance: f.appearance,
      transparent: f.transparent, erased: f.erased, pageIndex: f.pageIndex, pageImage: f.pageImage });
  }
  private eventSlot(id: number): { native: object; raw: object } {
    return { native: this.object(this.data(this.data(this.data(this.#root,'$gameMap'),'_events'),String(id))),
      raw: this.object(this.data(this.data(this.data(this.#root,'$dataMap'),'events'),String(id))) };
  }
  private registrationCurrent(registration: Registration): boolean {
    const slot = this.eventSlot(registration.id);
    if (slot.native !== registration.native || slot.raw !== registration.raw) return false;
    const observed = this.#facts.currentEvent(registration.id);
    const after = this.eventSlot(registration.id);
    return observed.status === 'value' && this.registrationKey(observed.value) === registration.key
      && after.native === registration.native && after.raw === registration.raw;
  }
  /** Closed native reader; the exported lexical function below captures this original once.
   * No native/property/provider/Proxy predicate runs here. Ordinary App final never calls it. */
  static readPreparedOrigin(source: unknown, observation: unknown): CompanionPreparedOriginObservation | null {
    if (source === null || typeof source !== 'object' || !(#issued in source)) return null;
    const entry = source.#latest;
    return entry && entry.origin !== null && entry.origin === observation && source.#issued.get(entry.value) === entry
      && entry.epoch === source.#epoch && entry.serial === source.#serial && !entry.closed && entry.issue === null
      ? entry.origin : null;
  }
  private originCell(owner: unknown, key: string): CompanionOriginOwnCell {
    const actual = this.object(owner), prototype: unknown = Object.getPrototypeOf(actual);
    if (prototype !== null) this.object(prototype);
    const value = this.data(actual, key);
    // Every selected registration field must be an existing own data slot. Undefined/missing
    // is not interchangeable with a valid primitive or an actual source reference.
    if (!Object.hasOwn(actual, key)) throw Error('companion-origin-own-slot-required');
    const base = { owner: actual, prototype: prototype as object | null, key };
    if (value !== null && (typeof value === 'object' || typeof value === 'function')) return Object.freeze({ ...base, kind: 'reference', value: this.object(value) });
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return Object.freeze({ ...base, kind: 'data', value });
    throw Error('companion-origin-data-value-invalid');
  }
  prepareOrigin(prepared: unknown): CompanionPreparedOriginObservation | null {
    const entry = this.entry(prepared);
    if (!entry || !entry.registration || entry.value.action.kind !== 'register') return null;
    try {
      this.assert(entry); if (entry.origin) return entry.origin;
      const cells: CompanionOriginOwnCell[] = [], select = (owner: unknown, key: string): unknown => {
        const cell = this.originCell(owner,key); cells.push(cell); return cell.value;
      };
      const map = select(this.#root,'$gameMap'), data = select(this.#root,'$dataMap'), player = select(this.#root,'$gamePlayer');
      const manager = select(this.#root,'SceneManager'), scene = select(manager,'_scene');
      const next = select(manager,'_nextScene'), started = select(scene,'_started'), mapId = select(map,'_mapId');
      if (map !== entry.frame.map || data !== entry.frame.data || player !== entry.frame.player || scene !== entry.frame.scene
        || next !== null || started !== true || mapId !== entry.frame.location.mapId) return null;
      const nativeEvents = select(map,'_events'), rawEvents = select(data,'events');
      const native = select(nativeEvents,String(entry.registration.id)), raw = select(rawEvents,String(entry.registration.id));
      if (native !== entry.registration.native || raw !== entry.registration.raw) return null;
      const nativeMap = select(native,'_mapId'), nativeId = select(native,'_eventId'), rawId = select(raw,'id');
      if (nativeMap !== mapId || nativeId !== entry.registration.id || rawId !== nativeId) return null;
      select(raw,'name'); const pages = select(raw,'pages'), index = select(native,'_pageIndex');
      if (!natural(index)) return null;
      const page = select(pages,String(index)), image = select(page,'image'), list = select(page,'list');
      if (!Array.isArray(pages) || !Array.isArray(list)) return null;
      for (const key of ['characterName','characterIndex','tileId','pattern','direction']) select(image,key);
      for (const key of ['_x','_y','_direction','_characterName','_characterIndex','_tileId','_pattern','_opacity','_blendMode','_walkAnime','_stepAnime','_transparent','_erased']) select(native,key);
      if (this.#latest !== entry || this.#serial !== entry.serial || this.#epoch !== entry.epoch || entry.closed || entry.issue !== null) return null;
      entry.origin = Object.freeze({ source: this, prepared: entry.value, application: entry.frame.application, generation: entry.frame.generation,
        actionIdentity: semanticFingerprint(entry.value.action), map: entry.frame.map, mapId: entry.frame.location.mapId, data: entry.frame.data,
        player: entry.frame.player, scene: entry.frame.scene, nativeEvent: entry.registration.native, rawEvent: entry.registration.raw,
        originEventId: entry.registration.id, cells: Object.freeze(cells) });
      return entry.origin;
    } catch { return null; }
  }
  private assert(entry: Prepared): void {
    if (!this.isCurrent(entry.value)) throw Error('companion-production-preparation-stale');
    if (entry.issue) throw Error(entry.issue);
  }
  private fields(raw: object, allowed: readonly string[]): void {
    if (Reflect.ownKeys(raw).some(key => typeof key !== 'string' || !allowed.includes(key))) throw Error('companion-production-intent-field-invalid');
  }
  async prepare(raw: unknown, records: readonly EventCompanionState[]): Promise<WorldFact<CompanionPreparedSource>> {
    // Reserve this serial before an async geometry request can reenter preparation.
    const serial = Object.freeze({}), epoch = this.#epoch; this.#serial = serial; this.#latest = null;
    let event: object | null = null, trail: object | null = null, registration: Registration | null = null;
    try {
      this.safe(raw); semanticFingerprint(raw); this.safe(records); semanticFingerprint(records);
      if (!Array.isArray(records) || !records.every(isEventCompanion)) throw Error('companion-production-records-invalid');
      const intent = this.object(raw), kind = this.data(intent, 'kind'), frame = this.capture(); let action: CompanionAction;
      if (kind === 'register') {
        this.fields(intent, ['kind','eventId','name','commonEventId']); const id = this.data(intent, 'eventId');
        if (!natural(id, 1)) throw Error('companion-production-event-id-invalid');
        const source = this.#facts.currentEvent(id); if (source.status !== 'value') return source;
        const f = source.value; event = f.handle; registration = { id, ...this.eventSlot(id), key: this.registrationKey(f) };
        if (f.erased || f.pageIndex < 0 || f.pageImage.status !== 'value') return { status: 'absent' };
        const name = this.data(intent, 'name'), commonEventId = this.data(intent, 'commonEventId');
        if (name !== undefined && typeof name !== 'string' || commonEventId !== undefined && !natural(commonEventId, 1)) throw Error('companion-production-registration-invalid');
        const candidate: EventCompanionState = { ...f.origin, name: name === undefined ? f.name : name, location: clone(f.location),
          appearance: clone(f.appearance), visible: !f.transparent, ...(commonEventId === undefined ? {} : { commonEventId }) };
        if (!isEventCompanion(candidate)) throw Error('companion-production-candidate-invalid'); action = { kind, candidate };
      } else if (kind === 'player-moved') {
        this.fields(intent, ['kind','player','instant']); const player = this.data(intent, 'player'), instant = this.data(intent, 'instant');
        if (!isTravelLocation(player) || typeof instant !== 'boolean' || semanticFingerprint(player) !== semanticFingerprint(frame.location)) throw Error('companion-production-player-unobserved');
        action = { kind, player: clone(player), instant };
        const queries: { point: WorldPoint; direction: WorldDirection }[] = [];
        // The pure planner short-circuits after a passable middle tile, but the real native
        // two-step walk still checks its second landing. Materialize both native attempts.
        for (const [i, record] of records.entries()) {
          const leader = i ? records[i-1]!.location : player, from = record.location;
          if (from.mapId !== leader.mapId || leader.mapId !== player.mapId) continue;
          const point = { mapId: leader.mapId, x: leader.x + (leader.direction === 6 ? -1 : leader.direction === 4 ? 1 : 0), y: leader.y + (leader.direction === 2 ? -1 : leader.direction === 8 ? 1 : 0) };
          const dx = point.x-from.x, dy = point.y-from.y;
          if ((dx === 0 || dy === 0) && Math.abs(dx)+Math.abs(dy) === 2) queries.push({ point, direction: dx > 0 ? 6 : dx < 0 ? 4 : dy > 0 ? 2 : 8 });
        }
        const facts = await this.#facts.prepareTrail({ companions: clone([...records]), player: clone(player), queries });
        if (facts.status !== 'value') return facts; trail = facts.value.handle;
      } else if (kind === 'recover') {
        this.fields(intent, ['kind']); action = { kind };
        if (records.length) {
          // Only the real App-issued restore admission may establish cold page facts for this birth.
          const facts = await this.#facts.prepareRestoreTrail({ companions: clone([...records]), player: clone(frame.location), queries: [] });
          if (facts.status !== 'value') return facts; trail = facts.value.handle;
        }
      }
      else if (kind === 'remove') {
        this.fields(intent, ['kind','removal']); const removal = this.object(this.data(intent, 'removal')), type = this.data(removal, 'kind');
        if (type === 'all') this.fields(removal, ['kind']);
        else if (type === 'name') { this.fields(removal, ['kind','name']); if (typeof this.data(removal,'name') !== 'string') throw Error('companion-production-removal-invalid'); }
        else if (type === 'origin') { this.fields(removal, ['kind','originMapId','originEventId']); if (!natural(this.data(removal,'originMapId'),1) || !natural(this.data(removal,'originEventId'),1)) throw Error('companion-production-removal-invalid'); }
        else throw Error('companion-production-removal-invalid');
        action = { kind, removal: clone(removal as CompanionRemoval) };
      } else throw Error('companion-production-intent-invalid');
      if (epoch !== this.#epoch || serial !== this.#serial || !same(frame, this.capture()) || registration && !this.registrationCurrent(registration) || trail && !this.#facts.isReady(trail)) return unavailable('companion-production-preparation-stale');
      const value: CompanionPreparedSource = Object.freeze({ handle: Object.freeze({}), action: this.freeze(action) });
      const entry: Prepared = { value, frame, epoch, serial, event, trail, registration, closed: false, issue: null, origin: null };
      this.#issued.set(value, entry); this.#latest = entry; return { status: 'value', value };
    } catch (error) { return { status: 'invalid', reason: why(error) }; }
    finally { if (serial !== this.#serial) { if (event) this.#facts.retire(event); if (trail) this.#facts.retire(trail); } }
  }
  private freeze<T>(value: T): T {
    if (value && typeof value === 'object') { for (const key of Object.keys(value)) this.freeze(Reflect.get(value,key)); Object.freeze(value); } return value;
  }
  private checked<T>(entry: Prepared, fact: WorldFact<T>): WorldFact<T> {
    if (fact.status !== 'value') entry.issue = `companion-production-facts-${fact.status}${'reason' in fact && fact.reason ? `:${fact.reason}` : ''}`;
    return fact;
  }
  relation(companion: WorldLocation, leader: WorldLocation): WorldFact<CompanionRelation> {
    const entry = this.#latest; if (!entry || !entry.trail || !this.isCurrent(entry.value)) return unavailable('companion-production-trail-not-ready');
    return this.checked(entry, this.#facts.relation(entry.trail, companion, leader));
  }
  canEnter(point: WorldPoint, direction: WorldDirection): WorldFact<boolean> {
    const entry = this.#latest; if (!entry || !entry.trail || !this.isCurrent(entry.value)) return unavailable('companion-production-trail-not-ready');
    return this.checked(entry, this.#facts.canEnter(entry.trail, point, direction));
  }
  placement(actualRelative: WorldLocation): WorldFact<CompanionPlacement> {
    const entry = this.#latest;
    if (!entry?.trail || !this.isCurrent(entry.value)) return unavailable('companion-production-trail-not-ready');
    const result = this.#facts.placement(entry.trail, actualRelative);
    if (!this.isCurrent(entry.value)) return unavailable('companion-production-placement-source-changed');
    return this.checked(entry, result);
  }
  iceSliding(): WorldFact<boolean> { return this.#facts.ability('iceSliding'); }
  guardHost(value: CompanionPreparedSource, host: CompanionHost): CompanionHost {
    const entry = this.entry(value); if (!entry) throw Error('companion-production-preparation-unissued'); this.assert(entry);
    // Capture only the actual factory host's data methods, outside the final interval.
    const source = this.data(host,'source'), move = this.data(host,'move'), project = this.data(host,'project'), trail = this.object(this.data(host,'trail'));
    const forced = this.data(trail,'forcedRoute');
    if (![source, move, project, forced].every(fn => typeof fn === 'function')) throw Error('companion-production-host-unavailable');
    return { source: async origin => { this.assert(entry); const result = await Reflect.apply(source as CompanionHost['source'],host,[origin]); this.assert(entry); return result; },
      trail: { relation: (a,b) => this.relation(a,b), canEnter: (p,d) => this.canEnter(p,d), forcedRoute: origin => {
        this.assert(entry); const fact = Reflect.apply(forced as CompanionHost['trail']['forcedRoute'],trail,[origin]); this.assert(entry); return this.checked(entry,fact);
      } },
      move: async movement => { this.assert(entry); const actual = await Reflect.apply(move as CompanionHost['move'],host,[movement]); this.assert(entry); return actual; },
      project: async projection => { this.assert(entry); await Reflect.apply(project as CompanionHost['project'],host,[projection]); this.assert(entry); },
    };
  }
  close(value: unknown): void {
    if (!value || typeof value !== 'object' || this.#proxy(value)) return; const entry = this.#issued.get(value); if (!entry) return;
    entry.closed = true; if (entry.event) this.#facts.retire(entry.event); if (entry.trail) this.#facts.retire(entry.trail); if (this.#latest === entry) this.#latest = null;
  }
  invalidate(): void { this.#epoch++; this.#serial = Object.freeze({}); this.#latest = null; this.#facts.invalidate(); }
}

// Capture the original closed reader at module initialization. Replacing a public static
// property later cannot substitute a host callback or a second IIFE's private brand.
const originalOriginReader = CompanionProductionSourceMZ.readPreparedOrigin;
export function readPreparedCompanionOrigin(source: unknown, observation: unknown): CompanionPreparedOriginObservation | null {
  return originalOriginReader(source, observation);
}
