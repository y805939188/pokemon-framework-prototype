/** Readonly native companion facts. None of these handles grants an operation or state-write capability. */
import type { Content } from '../../framework/rules/types';
import type { EventCompanionAppearance, EventCompanionState } from '../../framework/rules/world-state';
import type { CompanionRelation } from '../../framework/rules/event-companions';
import { isEventCompanion } from '../../framework/rules/event-companions';
import type { MapConnectionRecord, WorldDirection, WorldFact, WorldLocation, WorldPoint } from '../../framework/rules/world-data';
import { semanticFingerprint } from '../../framework/rules/semantic';
import { CompanionMapResourcesMZ, sameCompanionFactsContext } from './event-companion-map-resources-mz';
import type { CompanionFactsContext, CompanionGeometryResource } from './event-companion-map-resources-mz';
import { companionRelationFromGeometry } from './event-companion-trail-geometry';

export interface CompanionAbilityPath { readonly base: 'player' | 'game-world'; readonly path: readonly string[] }
export interface CompanionFactsMZOptions {
  current(): { readonly application: object; readonly generation: number; readonly content: Content } | null;
  /** Private query of the production runtime's detached immutable Content registry. */
  ownedContentIdentity?(content: unknown): string | undefined;
  /** Explicit native MZ tile-bit profile only. Configured bridge/ledge/legacy providers are not guessed. */
  readonly passageProfile: 'plain-mz' | 'configured';
  readonly abilities?: Partial<Readonly<Record<'iceSliding' | 'cycling' | 'surfing', CompanionAbilityPath>>>;
}
export interface CompanionCurrentEventFacts {
  readonly handle: object; readonly origin: Readonly<{ originMapId: number; originEventId: number }>;
  readonly name: string; readonly location: Readonly<WorldLocation>; readonly appearance: Readonly<EventCompanionAppearance>;
  readonly transparent: boolean; readonly through: boolean; readonly erased: boolean; readonly pageIndex: number;
  readonly pageImage: WorldFact<Readonly<{ characterName: string; characterIndex: number; tileId: number; pattern: number; direction: WorldDirection }>>;
  readonly authorFollowersVisible: WorldFact<boolean>;
}
export interface CompanionTrailFactsRequest {
  readonly companions: readonly EventCompanionState[]; readonly player: WorldLocation;
  readonly queries?: readonly { readonly point: WorldPoint; readonly direction: WorldDirection }[];
}
export interface CompanionPreparedTrailFacts { readonly handle: object; readonly requestIdentity: string }
interface Frame extends CompanionFactsContext { readonly location: Readonly<WorldLocation> }
interface EventEntry { readonly handle: object; readonly frame: Frame; readonly reads: OwnReadSet; readonly epoch: number; readonly key: string }
interface TrailEntry {
  readonly handle: object; readonly frame: Frame; readonly reads: OwnReadSet; readonly epoch: number; readonly serial: object;
  readonly resources: readonly CompanionGeometryResource[];
  readonly relations: ReadonlyMap<string, CompanionRelation>; readonly passage: ReadonlyMap<string, boolean>;
  readonly requestIdentity: string;
}
class Issue extends Error {
  readonly status: 'invalid' | 'unavailable';
  constructor(status: 'invalid' | 'unavailable', message: string) { super(message); this.status = status; }
}
const problem = (error: unknown): { status: 'invalid' | 'unavailable'; reason: string } => ({ status: error instanceof Issue ? error.status : 'unavailable', reason: error instanceof Error ? error.message : String(error) });
const natural = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
const direction = (v: unknown): v is WorldDirection => v === 2 || v === 4 || v === 6 || v === 8;
const pairKey = (a: WorldPoint, b: WorldPoint): string => `${a.mapId}/${a.x}/${a.y}>${b.mapId}/${b.x}/${b.y}`;
const pointKey = (p: WorldPoint, d: WorldDirection): string => `${p.mapId}/${p.x}/${p.y}/${d}`;
const sameFrame = (a: Frame, b: Frame): boolean => sameCompanionFactsContext(a, b) && a.location.x === b.location.x && a.location.y === b.location.y && a.location.direction === b.location.direction;

/** Only the native slots consumed by this query. No ambient variable/function graph is copied. */
class OwnReadSet {
  #proxy: (value: unknown) => boolean;
  #slots: { owner: object; key: string; exists: boolean; value: unknown }[] = [];
  #keys: { owner: object; names: readonly string[] }[] = [];
  constructor(nativeIsProxy: (value: unknown) => boolean) { this.#proxy = nativeIsProxy; }
  object(raw: unknown): object {
    if (raw === null || !['object', 'function'].includes(typeof raw) || this.#proxy(raw)) throw new Issue('invalid', 'companion-facts-unsafe-object');
    return raw as object;
  }
  data(raw: unknown, key: string): unknown {
    const owner = this.object(raw), descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (descriptor && !Object.hasOwn(descriptor, 'value')) throw new Issue('invalid', 'companion-facts-own-data-required');
    const value = descriptor?.value; this.#slots.push({ owner, key, exists: !!descriptor, value }); return value;
  }
  keys(raw: unknown): readonly string[] {
    const owner = this.object(raw), names = Object.getOwnPropertyNames(owner); this.#keys.push({ owner, names }); return names;
  }
  valid(): boolean {
    try {
      for (const { owner, names } of this.#keys) { const actual = Object.getOwnPropertyNames(this.object(owner)); if (actual.length !== names.length || actual.some((name, i) => name !== names[i])) return false; }
      for (const s of this.#slots) { const d = Object.getOwnPropertyDescriptor(this.object(s.owner), s.key); if (!!d !== s.exists || d && (!Object.hasOwn(d, 'value') || d.value !== s.value)) return false; }
      return true;
    } catch { return false; }
  }
}

export class CompanionFactsMZ {
  #root: object; #proxy: (value: unknown) => boolean; #current: CompanionFactsMZOptions['current'];
  #profile: CompanionFactsMZOptions['passageProfile']; #abilities: CompanionFactsMZOptions['abilities'];
  #ownedContentIdentity: CompanionFactsMZOptions['ownedContentIdentity'];
  #resources: CompanionMapResourcesMZ; #last: CompanionFactsContext | null = null; #capturing = false; #busy = false; #epoch = 0;
  #events = new WeakMap<object, EventEntry>(); #eventSlots = new Map<string, EventEntry>();
  #trails = new WeakMap<object, TrailEntry>(); #latest: TrailEntry | null = null; #serial: object = Object.freeze({});
  constructor(root: unknown, options: CompanionFactsMZOptions, nativeIsProxy: (value: unknown) => boolean) {
    if (typeof nativeIsProxy !== 'function') throw Error('companion-native-proxy-capability-required');
    this.#proxy = nativeIsProxy; const r = new OwnReadSet(nativeIsProxy); this.#root = r.object(root);
    const current = r.data(options, 'current'), profile = r.data(options, 'passageProfile');
    if (typeof current !== 'function' || profile !== 'plain-mz' && profile !== 'configured') throw Error('companion-facts-options-invalid');
    this.#current = current as CompanionFactsMZOptions['current']; this.#profile = profile;
    const owned = r.data(options, 'ownedContentIdentity');
    if (owned !== undefined && (typeof owned !== 'function' || nativeIsProxy(owned))) throw Error('companion-facts-options-invalid');
    this.#ownedContentIdentity = owned as CompanionFactsMZOptions['ownedContentIdentity'];
    const abilities = r.data(options, 'abilities'), copied: Partial<Record<'iceSliding' | 'cycling' | 'surfing', CompanionAbilityPath>> = {};
    if (abilities !== undefined) for (const key of ['iceSliding', 'cycling', 'surfing'] as const) {
      const slot = r.data(abilities, key); if (slot === undefined) continue;
      const base = r.data(slot, 'base'), rawPath = r.data(slot, 'path');
      if (base !== 'player' && base !== 'game-world' || !Array.isArray(rawPath)) throw Error('companion-ability-slot-invalid');
      const path: string[] = [], length = r.data(rawPath, 'length'); if (!natural(length)) throw Error('companion-ability-path-invalid');
      for (let i = 0; i < length; i++) { const part = r.data(rawPath, String(i)); if (typeof part !== 'string' || !part.length) throw Error('companion-ability-path-invalid'); path.push(part); }
      if (!path.length) throw Error('companion-ability-path-invalid'); copied[key] = Object.freeze({ base, path: Object.freeze(path) });
    }
    this.#abilities = Object.freeze(copied);
    this.#resources = new CompanionMapResourcesMZ(this.#root, { current: () => this.context() }, nativeIsProxy);
  }
  private safeData(value: unknown, visiting = new Set<object>()): void {
    if (value === null || value === undefined || ['string', 'number', 'boolean'].includes(typeof value)) return;
    if (typeof value !== 'object' || this.#proxy(value) || visiting.has(value)) throw new Issue('invalid', 'companion-content-data-invalid');
    visiting.add(value);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') throw new Issue('invalid', 'companion-content-data-invalid');
      const d = Object.getOwnPropertyDescriptor(value, key); if (!d || !Object.hasOwn(d, 'value')) throw new Issue('invalid', 'companion-content-own-data-required');
      this.safeData(d.value, visiting);
    }
    visiting.delete(value);
  }
  private context(): Frame {
    if (this.#capturing) throw new Issue('unavailable', 'companion-facts-context-reentrant'); this.#capturing = true;
    try {
      const r = new OwnReadSet(this.#proxy), raw = this.#current(); if (!raw) throw new Issue('unavailable', 'companion-current-application-unavailable');
      const application = r.object(r.data(raw, 'application')), generation = r.data(raw, 'generation'), content = r.object(r.data(raw, 'content'));
      if (!natural(generation)) throw new Issue('invalid', 'companion-generation-invalid');
      const owned = this.#ownedContentIdentity?.(content);
      if (owned === undefined) this.safeData(content);
      const contentIdentity = owned ?? semanticFingerprint(content);
      const map = r.object(r.data(this.#root, '$gameMap')), data = r.object(r.data(this.#root, '$dataMap')), player = r.object(r.data(this.#root, '$gamePlayer'));
      const scene = r.object(r.data(r.data(this.#root, 'SceneManager'), '_scene')), mapId = r.data(map, '_mapId');
      const x = r.data(player, '_x'), y = r.data(player, '_y'), d = r.data(player, '_direction');
      if (!natural(mapId, 1) || !natural(x) || !natural(y) || !direction(d)) throw new Issue('invalid', 'companion-current-location-invalid');
      if (!r.valid()) throw new Issue('unavailable', 'companion-current-source-changed');
      const frame: Frame = Object.freeze({ application, generation, content, contentIdentity, map, mapId, data, player, scene, location: Object.freeze({ mapId, x, y, direction: d }) });
      if (this.#last && !sameCompanionFactsContext(this.#last, frame)) {
        this.#last = frame; this.#serial = Object.freeze({}); this.#latest = null; this.#eventSlots.clear(); this.#resources.invalidate();
      } else this.#last = frame;
      return frame;
    } finally { this.#capturing = false; }
  }
  private text(value: unknown, name: string): string { if (typeof value !== 'string') throw new Issue('invalid', name); return value; }
  private bool(value: unknown, name: string): boolean { if (typeof value !== 'boolean') throw new Issue('invalid', name); return value; }
  private number(value: unknown, name: string, max = Number.MAX_SAFE_INTEGER): number { if (!natural(value) || value > max) throw new Issue('invalid', name); return value; }
  private location(raw: unknown, r: OwnReadSet): WorldLocation {
    const mapId = r.data(raw, 'mapId'), x = r.data(raw, 'x'), y = r.data(raw, 'y'), d = r.data(raw, 'direction');
    if (!natural(mapId, 1) || !natural(x) || !natural(y) || !direction(d)) throw new Issue('invalid', 'companion-trail-location-invalid');
    return { mapId, x, y, direction: d };
  }
  private request(raw: CompanionTrailFactsRequest): { companions: EventCompanionState[]; player: WorldLocation; extra: { point: WorldPoint; direction: WorldDirection }[]; identity: string } {
    this.safeData(raw); const r = new OwnReadSet(this.#proxy), rows = r.data(raw, 'companions');
    if (!Array.isArray(rows) || !rows.every(isEventCompanion)) throw new Issue('invalid', 'companion-trail-records-invalid');
    const companions = rows.map(c => ({ ...c, location: { ...c.location }, appearance: { ...c.appearance } })), player = this.location(r.data(raw, 'player'), r);
    const rawExtra = r.data(raw, 'queries'), extra: { point: WorldPoint; direction: WorldDirection }[] = [];
    if (rawExtra !== undefined) {
      if (!Array.isArray(rawExtra)) throw new Issue('invalid', 'companion-trail-queries-invalid');
      for (const query of rawExtra) { const p = r.data(query, 'point'), mapId = r.data(p, 'mapId'), x = r.data(p, 'x'), y = r.data(p, 'y'), d = r.data(query, 'direction');
        if (!natural(mapId, 1) || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || !direction(d)) throw new Issue('invalid', 'companion-trail-query-invalid');
        extra.push({ point: { mapId, x: x as number, y: y as number }, direction: d }); }
    }
    return { companions, player, extra, identity: semanticFingerprint({ companions, player, queries: extra }) };
  }
  private nativeEvents(frame: Frame, r: OwnReadSet): readonly { readonly id: number; readonly event: object }[] {
    const list = r.data(frame.map, '_events'); if (!Array.isArray(list)) throw new Issue('unavailable', 'companion-native-events-unavailable');
    const length = r.data(list, 'length'); if (!natural(length)) throw new Issue('invalid', 'companion-native-events-invalid');
    let p: object | null = Object.getPrototypeOf(list);
    while (p) { for (const key of r.keys(p)) if (/^(0|[1-9]\d*)$/u.test(key)) throw new Issue('unavailable', 'companion-inherited-event-slot-unavailable'); p = Object.getPrototypeOf(r.object(p)); }
    const events: { id: number; event: object }[] = [];
    for (const key of r.keys(list)) if (/^(0|[1-9]\d*)$/u.test(key) && Number(key) < length) {
      const raw = r.data(list, key); if (raw === null || raw === undefined) continue;
      const event = r.object(raw), id = r.data(event, '_eventId'), mapId = r.data(event, '_mapId');
      if (!natural(id, 1) || id !== Number(key) || mapId !== frame.mapId) throw new Issue('unavailable', 'companion-native-event-identity-mismatch');
      events.push({ id, event });
    }
    return events;
  }
  currentEvent(eventId: number): WorldFact<CompanionCurrentEventFacts> {
    if (this.#busy) return { status: 'unavailable', reason: 'companion-facts-reentrant' };
    if (!natural(eventId, 1)) return { status: 'invalid', reason: 'companion-origin-event-invalid' };
    this.#busy = true;
    try {
      const frame = this.context(), r = new OwnReadSet(this.#proxy), selected = this.nativeEvents(frame, r).find(e => e.id === eventId);
      if (!selected) return { status: 'absent' };
      const event = selected.event, raw = r.data(r.data(frame.data, 'events'), String(eventId)); if (raw === null || raw === undefined) return { status: 'absent' };
      if (r.data(raw, 'id') !== eventId) throw new Issue('invalid', 'companion-original-event-id-mismatch');
      const name = this.text(r.data(raw, 'name'), 'companion-event-name-invalid'), pages = r.data(raw, 'pages');
      if (!Array.isArray(pages)) throw new Issue('invalid', 'companion-event-pages-invalid');
      const index = r.data(event, '_pageIndex'); if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < -1) throw new Issue('invalid', 'companion-page-index-invalid');
      let pageImage: CompanionCurrentEventFacts['pageImage'] = { status: 'absent' };
      if (index >= 0) {
        const page = r.data(pages, String(index)), image = r.data(page, 'image');
        const d = r.data(image, 'direction'); if (!direction(d)) throw new Issue('invalid', 'companion-page-direction-invalid');
        if (!Array.isArray(r.data(page, 'list'))) throw new Issue('invalid', 'companion-page-list-invalid');
        pageImage = { status: 'value', value: Object.freeze({ characterName: this.text(r.data(image, 'characterName'), 'companion-page-image-invalid'), characterIndex: this.number(r.data(image, 'characterIndex'), 'companion-page-index-invalid', 7),
          tileId: this.number(r.data(image, 'tileId'), 'companion-page-tile-invalid'), pattern: this.number(r.data(image, 'pattern'), 'companion-page-pattern-invalid'), direction: d }) };
      }
      const d = r.data(event, '_direction'); if (!direction(d)) throw new Issue('invalid', 'companion-event-direction-invalid');
      const appearance: EventCompanionAppearance = { characterName: this.text(r.data(event, '_characterName'), 'companion-body-image-invalid'), characterIndex: this.number(r.data(event, '_characterIndex'), 'companion-body-index-invalid', 7),
        tileId: this.number(r.data(event, '_tileId'), 'companion-body-tile-invalid'), pattern: this.number(r.data(event, '_pattern'), 'companion-body-pattern-invalid'), opacity: this.number(r.data(event, '_opacity'), 'companion-body-opacity-invalid', 255),
        blendMode: this.number(r.data(event, '_blendMode'), 'companion-body-blend-invalid', 3) as 0 | 1 | 2 | 3,
        walkAnime: this.bool(r.data(event, '_walkAnime'), 'companion-body-walk-invalid'), stepAnime: this.bool(r.data(event, '_stepAnime'), 'companion-body-step-invalid') };
      if (appearance.tileId && (appearance.characterName !== '' || appearance.characterIndex !== 0)) throw new Issue('invalid', 'companion-body-tile-image-inconsistent');
      const transparent = this.bool(r.data(event, '_transparent'), 'companion-body-transparent-invalid'), through = this.bool(r.data(event, '_through'), 'companion-body-through-invalid'), erased = this.bool(r.data(event, '_erased'), 'companion-body-erased-invalid');
      const x = this.number(r.data(event, '_x'), 'companion-body-x-invalid'), y = this.number(r.data(event, '_y'), 'companion-body-y-invalid');
      const followers = r.data(frame.player, '_followers'), visible = followers ? r.data(followers, '_visible') : undefined;
      const authorFollowersVisible: WorldFact<boolean> = typeof visible === 'boolean' ? { status: 'value', value: visible } : { status: 'unavailable', reason: 'companion-author-visibility-unavailable' };
      if (!sameFrame(frame, this.context()) || !r.valid()) throw new Issue('unavailable', 'companion-event-facts-changed');
      const handle = Object.freeze({}), key = `${frame.mapId}/${eventId}`, entry: EventEntry = { handle, frame, reads: r, epoch: this.#epoch, key };
      this.#events.set(handle, entry); this.#eventSlots.set(key, entry);
      return { status: 'value', value: Object.freeze({ handle, origin: Object.freeze({ originMapId: frame.mapId, originEventId: eventId }), name, location: Object.freeze({ mapId: frame.mapId, x, y, direction: d }),
        appearance: Object.freeze(appearance), transparent, through, erased, pageIndex: index, pageImage: Object.freeze(pageImage), authorFollowersVisible: Object.freeze(authorFollowersVisible) }) };
    } catch (error) { return problem(error); } finally { this.#busy = false; }
  }
  isEventCurrent(handle: unknown): boolean {
    if (!handle || typeof handle !== 'object') return false; const entry = this.#events.get(handle);
    try { return !!entry && entry.epoch === this.#epoch && this.#eventSlots.get(entry.key) === entry && sameFrame(entry.frame, this.context()) && entry.reads.valid()
      && entry.epoch === this.#epoch && this.#eventSlots.get(entry.key) === entry; } catch { return false; }
  }
  private passage(frame: Frame, r: OwnReadSet, point: WorldPoint, d: WorldDirection): boolean {
    if (point.mapId !== frame.mapId) throw new Issue('unavailable', 'companion-cross-map-passage-unavailable');
    if (this.#profile !== 'plain-mz') throw new Issue('unavailable', 'companion-layer5-configured-capability-unavailable');
    const system = r.data(this.#root, '$dataSystem'), legacy = system ? r.data(system, 'rrLegacyPassage') : undefined;
    if (legacy !== undefined && legacy !== false) throw new Issue('unavailable', 'companion-legacy-passage-unavailable');
    const width = this.number(r.data(frame.data, 'width'), 'companion-map-width-invalid'), height = this.number(r.data(frame.data, 'height'), 'companion-map-height-invalid');
    if (point.x < 0 || point.y < 0 || point.x >= width || point.y >= height) return false;
    const tilesetId = this.number(r.data(frame.data, 'tilesetId'), 'companion-map-tileset-invalid');
    const flags = r.data(r.data(r.data(this.#root, '$dataTilesets'), String(tilesetId)), 'flags');
    const data = r.data(frame.data, 'data'); if (!Array.isArray(flags) || !Array.isArray(data)) throw new Issue('unavailable', 'companion-tile-data-unavailable');
    if (r.data(data, 'length') !== width * height * 6) throw new Issue('invalid', 'companion-tile-data-length-invalid');
    const tiles: number[] = []; let blocked = false;
    for (const { event } of this.nativeEvents(frame, r)) {
      const x = r.data(event, '_x'), y = r.data(event, '_y'); if (!natural(x) || !natural(y)) throw new Issue('invalid', 'companion-event-position-invalid');
      if (x !== point.x || y !== point.y) continue;
      const through = this.bool(r.data(event, '_through'), 'companion-event-through-invalid'); if (through) continue;
      const graphic = this.text(r.data(event, '_characterName'), 'companion-event-graphic-invalid');
      if (graphic.length > 0) blocked = true; // character graphic name, not the event's display name or priority.
      const tile = this.number(r.data(event, '_tileId'), 'companion-event-tile-invalid'), priority = this.number(r.data(event, '_priorityType'), 'companion-event-priority-invalid', 2);
      if (tile > 0 && priority === 0) tiles.push(tile);
    }
    if (blocked) return false;
    for (let z = 3; z >= 0; z--) tiles.push(this.number(r.data(data, String((z * height + point.y) * width + point.x)), 'companion-tile-id-invalid'));
    const bit = (1 << ((10 - d) / 2 - 1)) & 15;
    for (const tile of tiles) { const flag = this.number(r.data(flags, String(tile)), 'companion-tile-flag-invalid'); if (flag & 16) continue; return (flag & bit) === 0; }
    return false;
  }
  async prepareTrail(request: CompanionTrailFactsRequest): Promise<WorldFact<CompanionPreparedTrailFacts>> {
    if (this.#busy) return { status: 'unavailable', reason: 'companion-facts-reentrant' };
    let frame: Frame, player: WorldLocation, companions: EventCompanionState[], extra: { point: WorldPoint; direction: WorldDirection }[], serial: object, requestIdentity: string;
    this.#busy = true;
    try {
      const parsed = this.request(request); companions = parsed.companions; player = parsed.player; extra = parsed.extra; requestIdentity = parsed.identity;
      frame = this.context(); if (player.mapId !== frame.mapId || player.x !== frame.location.x || player.y !== frame.location.y || player.direction !== frame.location.direction) throw new Issue('unavailable', 'companion-trail-player-unobserved');
      serial = Object.freeze({}); this.#serial = serial;
    } catch (error) { return problem(error); } finally { this.#busy = false; }
    try {
      const ids = [...new Set([frame.mapId, ...companions.map(c => c.location.mapId), ...extra.map(q => q.point.mapId)])];
      const loaded = await Promise.all(ids.map(id => this.#resources.prepare(id)));
      if (this.#serial !== serial || !sameFrame(frame, this.context())) throw new Issue('unavailable', 'companion-trail-preparation-stale');
      const resources: CompanionGeometryResource[] = [];
      for (const fact of loaded) { if (fact.status !== 'value') return { status: 'unavailable', reason: `companion-trail-geometry-${fact.status}${'reason' in fact ? ':' + fact.reason : ''}` }; resources.push(fact.value); }
      const r = new OwnReadSet(this.#proxy), world = r.data(frame.content, 'world'), connectionSource = world === undefined ? undefined : r.data(world, 'mapConnections');
      const rawConnections = connectionSource === undefined ? [] : r.data(connectionSource, 'connections');
      if (!Array.isArray(rawConnections)) throw new Issue('invalid', 'companion-connections-invalid');
      const connections = rawConnections as readonly MapConnectionRecord[];
      if (companions.length || extra.length) {
        if (this.#profile !== 'plain-mz') throw new Issue('unavailable', 'companion-layer5-configured-capability-unavailable');
        const system = r.data(this.#root, '$dataSystem'), legacy = system ? r.data(system, 'rrLegacyPassage') : undefined;
        if (legacy !== undefined && legacy !== false) throw new Issue('unavailable', 'companion-legacy-passage-unavailable');
      }
      const relations = new Map<string, CompanionRelation>(), passage = new Map<string, boolean>();
      const add = (p: WorldPoint, d: WorldDirection): boolean => { const key = pointKey(p, d), old = passage.get(key); if (old !== undefined) return old; const value = this.passage(frame, r, p, d); passage.set(key, value); return value; };
      for (const [i, c] of companions.entries()) {
        const leader = i ? companions[i - 1]!.location : player;
        const relation = companionRelationFromGeometry(c.location, leader, connections, resources.map(resource => ({ mapId: resource.geometry.mapId, fact: { status: 'value', value: resource.geometry } })));
        if (relation.status !== 'value') throw new Issue('unavailable', `companion-trail-relation-${relation.status}`);
        relations.set(pairKey(c.location, leader), Object.freeze({ ...relation.value, current: Object.freeze({ ...relation.value.current }) }));
        if (!relation.value.connected) continue;
        const target = { mapId: leader.mapId, x: leader.x + (leader.direction === 6 ? -1 : leader.direction === 4 ? 1 : 0), y: leader.y + (leader.direction === 2 ? -1 : leader.direction === 8 ? 1 : 0) };
        const g = resources.find(resource => resource.geometry.mapId === target.mapId)?.geometry;
        if (!g || target.x < 0 || target.y < 0 || target.x >= g.width || target.y >= g.height) throw new Issue('unavailable', 'companion-trail-target-boundary-unresolved');
        const current = relation.value.current, dx = target.x - current.x, dy = target.y - current.y, distance = Math.abs(dx) + Math.abs(dy);
        if (dx !== 0 && dy !== 0 || distance === 0 || distance > 2) continue;
        const d: WorldDirection = dx > 0 ? 6 : dx < 0 ? 4 : dy > 0 ? 2 : 8;
        if (distance === 1) { if (!(target.mapId === player.mapId && target.x === player.x && target.y === player.y) && !add(target, d)) add(current, d); }
        else { const middle = { mapId: leader.mapId, x: current.x + Math.sign(dx), y: current.y + Math.sign(dy) }; if (!add(middle, d) && add(target, d)) add(current, d); }
      }
      for (const q of extra) add(q.point, q.direction);
      if (this.#serial !== serial || !sameFrame(frame, this.context()) || resources.some(resource => !this.#resources.isCurrent(resource)) || !r.valid() || this.#serial !== serial) throw new Issue('unavailable', 'companion-trail-facts-changed');
      const handle = Object.freeze({}), entry: TrailEntry = { handle, frame, reads: r, epoch: this.#epoch, serial, resources, relations, passage, requestIdentity };
      this.#trails.set(handle, entry); this.#latest = entry; return { status: 'value', value: Object.freeze({ handle, requestIdentity }) };
    } catch (error) { return problem(error); }
  }
  isReady(handle: unknown): boolean {
    if (!handle || typeof handle !== 'object') return false; const entry = this.#trails.get(handle);
    try {
      if (!entry || entry.epoch !== this.#epoch || entry.serial !== this.#serial || this.#latest !== entry || !sameFrame(entry.frame, this.context()) || entry.resources.some(resource => !this.#resources.isCurrent(resource)) || !entry.reads.valid()) return false;
      return this.#latest === entry && entry.serial === this.#serial;
    } catch { return false; }
  }
  /** Consumers bind the exact frozen request as well as current map facts before any action. */
  matchesRequest(handle: unknown, request: CompanionTrailFactsRequest): boolean {
    try { const identity = this.request(request).identity; return this.isReady(handle) && !!handle && typeof handle === 'object' && this.#trails.get(handle)?.requestIdentity === identity; }
    catch { return false; }
  }
  relation(handle: unknown, companion: WorldLocation, leader: WorldLocation): WorldFact<CompanionRelation> {
    try { this.safeData(companion); this.safeData(leader); const r = new OwnReadSet(this.#proxy), a = this.location(companion, r), b = this.location(leader, r);
      if (!this.isReady(handle)) return { status: 'unavailable', reason: 'companion-trail-facts-not-ready' };
      const value = this.#trails.get(handle as object)!.relations.get(pairKey(a, b)); return value ? { status: 'value', value } : { status: 'unavailable', reason: 'companion-relation-not-prepared' };
    } catch (error) { return problem(error); }
  }
  canEnter(handle: unknown, point: WorldPoint, movingDirection: WorldDirection): WorldFact<boolean> {
    try { this.safeData(point); const r = new OwnReadSet(this.#proxy), mapId = r.data(point, 'mapId'), x = r.data(point, 'x'), y = r.data(point, 'y');
      if (!natural(mapId, 1) || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || !direction(movingDirection)) throw new Issue('invalid', 'companion-passage-query-invalid');
      if (!this.isReady(handle)) return { status: 'unavailable', reason: 'companion-trail-facts-not-ready' };
      const value = this.#trails.get(handle as object)!.passage.get(pointKey({ mapId, x: x as number, y: y as number }, movingDirection));
      return value === undefined ? { status: 'unavailable', reason: 'companion-passage-not-prepared' } : { status: 'value', value };
    } catch (error) { return problem(error); }
  }
  ability(name: 'iceSliding' | 'cycling' | 'surfing'): WorldFact<boolean> {
    const slot = this.#abilities?.[name]; if (!slot) return { status: 'unavailable', reason: `companion-${name}-capability-unavailable` };
    try { const frame = this.context(), epoch = this.#epoch, r = new OwnReadSet(this.#proxy); let value: unknown = slot.base === 'player' ? frame.player : r.data(r.data(r.data(this.#root, '$gameSystem'), '_psGame'), 'world');
      for (const part of slot.path) value = r.data(value, part);
      if (typeof value !== 'boolean') throw new Issue('unavailable', `companion-${name}-fact-unavailable`);
      if (!sameFrame(frame, this.context()) || !r.valid() || epoch !== this.#epoch) throw new Issue('unavailable', `companion-${name}-fact-changed`);
      return { status: 'value', value };
    } catch (error) { return problem(error); }
  }
  retire(handle: unknown): void {
    if (!handle || typeof handle !== 'object') return;
    const event = this.#events.get(handle); if (event && this.#eventSlots.get(event.key) === event) this.#eventSlots.delete(event.key);
    const trail = this.#trails.get(handle); if (trail && this.#latest === trail) this.#latest = null;
  }
  invalidate(): void { this.#epoch++; this.#serial = Object.freeze({}); this.#latest = null; this.#eventSlots.clear(); this.#last = null; this.#resources.invalidate(); }
}
