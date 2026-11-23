/** Native facts only. This adapter cannot issue an App intent, binding, or final-install authority. */
import { CompanionRestoreMapFactsMZ } from './event-companion-restore-facts-mz';
import { CompanionFactsMZ } from './event-companion-facts-mz';
import type { CompanionFactsMZOptions, CompanionTrailFactsRequest, CompanionPreparedTrailFacts, CompanionCurrentEventFacts } from './event-companion-facts-mz';
import { CompanionMapResourcesMZ, sameCompanionFactsContext } from './event-companion-map-resources-mz';
import type { CompanionFactsContext } from './event-companion-map-resources-mz';
import { companionRelationFromGeometry } from './event-companion-trail-geometry';
import { normalizeCompanionPlacement } from '../../framework/rules/companion-placement';
import type { CompanionPlacement } from '../../framework/rules/companion-placement';
import { semanticFingerprint } from '../../framework/rules/semantic';
import { isEventCompanion } from '../../framework/rules/event-companions';
import { readNativeTravelLease } from './travel-lease-registry-mz';
import type { WorldTravelLeaseSource } from '../../framework/app/ports';
import type { MapConnectionRecord } from '../../framework/rules/world-data';
import type { MapGeometry } from '../../framework/rules/world-travel';
import type { CompanionRetainedMapSourceMZ } from './event-companion-retained-map-mz';
import type { MZTerrainMeanings } from './runtime-inputs-mz';
import type { WorldFact, WorldLocation, WorldPoint, WorldDirection } from '../../framework/rules/world-data';
import type { CompanionRelation } from '../../framework/rules/event-companions';

export interface CompanionNativeFactsMZOptions extends CompanionFactsMZOptions {
  /** The actual parseTerrainMeanings result, not numeric Essentials terrain-tag assumptions. */
  readonly terrainMeanings?: MZTerrainMeanings;
  readonly retainedMapSource?: CompanionRetainedMapSourceMZ;
}
type Ability = 'iceSliding' | 'cycling' | 'surfing';
type Slot = Readonly<{ owner: object; prototype: object | null; key: string; present: boolean; value: unknown }>;
/** A small read set for this native observation, including absence and prototype shadows. */
class NativeReads {
  readonly #isProxy: (value: unknown) => boolean;
  readonly #slots: Slot[] = [];
  readonly #keys: { owner: object; names: readonly string[] }[] = [];
  constructor(isProxy: (value: unknown) => boolean) { this.#isProxy = isProxy; }
  object(raw: unknown): object {
    if (raw === null || typeof raw !== 'object' && typeof raw !== 'function' || this.#isProxy(raw)) throw Error('companion-native-facts-unsafe-object');
    return raw as object;
  }
  slot(raw: unknown, key: string): Readonly<{ present: boolean; value: unknown }> {
    const owner = this.object(raw), descriptor = Object.getOwnPropertyDescriptor(owner, key), prototype = Object.getPrototypeOf(owner) as object | null;
    if (descriptor && !Object.hasOwn(descriptor, 'value')) throw Error('companion-native-facts-own-data-required');
    const row = { owner, prototype, key, present: descriptor !== undefined, value: descriptor?.value };
    this.#slots.push(row); return row;
  }
  own(raw: unknown, key: string): unknown { return this.slot(raw, key).value; }
  lookup(raw: unknown, key: string): Readonly<{ present: boolean; value: unknown }> {
    let owner: object | null = this.object(raw);
    while (owner) {
      const result = this.slot(owner, key); if (result.present) return result;
      owner = Object.getPrototypeOf(owner) as object | null;
    }
    return { present: false, value: undefined };
  }
  keys(raw: unknown): readonly string[] { const owner = this.object(raw), names = Object.getOwnPropertyNames(owner); this.#keys.push({ owner, names }); return names; }
  valid(): boolean {
    try {
      for (const row of this.#keys) { const actual = Object.getOwnPropertyNames(this.object(row.owner)); if (actual.length !== row.names.length || actual.some((key, i) => key !== row.names[i])) return false; }
      return this.#slots.every(row => {
        const owner = this.object(row.owner), descriptor = Object.getOwnPropertyDescriptor(owner, row.key);
        return Object.getPrototypeOf(owner) === row.prototype && !!descriptor === row.present
          && (!descriptor || Object.hasOwn(descriptor, 'value') && Object.is(descriptor.value, row.value));
      });
    } catch { return false; }
  }
}
const unavailable = (reason: string): { status: 'unavailable'; reason: string } => ({ status: 'unavailable', reason });
const value = (flag: boolean): WorldFact<boolean> => ({ status: 'value', value: flag });

interface PrefixFrame extends CompanionFactsContext { readonly location: WorldLocation }
interface PassageFrame { readonly mapId: number; readonly data: object; readonly events: object; readonly flags: object; readonly captured?: ReadonlyMap<object, ReadonlySet<string>> }
interface PrefixTrail {
  readonly frame: PrefixFrame; readonly reads: NativeReads; readonly serial: object; readonly epoch: number;
  readonly geometries: ReadonlyMap<number, WorldFact<MapGeometry>>; readonly connections: readonly MapConnectionRecord[];
  readonly maps: ReadonlyMap<number, PassageFrame>; readonly restore: object | null; readonly requestIdentity: string;
}
const natural = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
const nativeDirection = (v: unknown): v is WorldDirection => v === 2 || v === 4 || v === 6 || v === 8;
/** Composes the existing current-event, geometry/XHR and layer-5 tile-bit readers. Known author
 * encounter/Surf meanings do not install a bridge/ledge passage provider. Missing and broken native
 * abilities are distinct: only proven stock absences produce false. All callbacks run as facts reads. */
export class CompanionNativeFactsMZ {
  readonly #root: object;
  readonly #isProxy: (raw: unknown) => boolean;
  readonly #facts: CompanionFactsMZ;
  readonly #current: CompanionFactsMZOptions['current'];
  readonly #ownedContentIdentity: CompanionFactsMZOptions['ownedContentIdentity'];
  readonly #explicit: Readonly<Partial<Record<Ability, boolean>>>;
  readonly #configured: boolean;
  readonly #meaningsAvailable: boolean;
  readonly #iceConfigured: boolean;
  readonly #trails = new WeakMap<object, PrefixTrail>();
  readonly #resources: CompanionMapResourcesMZ;
  readonly #retainedSource: CompanionRetainedMapSourceMZ | undefined;
  readonly #restore: CompanionRestoreMapFactsMZ | null; #restoreHandle: object | null = null; #restoreGeometries: readonly { readonly mapId: number; readonly fact: WorldFact<Readonly<MapGeometry>> }[] = [];
  #epoch = 0; #serial: object = {}; #preparing = false; #capturing = false;
  #readingAbility = false;
  constructor(root: unknown, options: CompanionNativeFactsMZOptions, nativeIsProxy: (raw: unknown) => boolean) {
    const r = new NativeReads(nativeIsProxy); this.#isProxy = nativeIsProxy; this.#root = r.object(root);
    const current = r.own(options, 'current'), profile = r.own(options, 'passageProfile');
    if (typeof current !== 'function' || nativeIsProxy(current) || profile !== 'plain-mz' && profile !== 'configured') throw Error('companion-native-facts-options-invalid');
    this.#current = current as CompanionFactsMZOptions['current'];
    const owned = r.own(options, 'ownedContentIdentity');
    if (owned !== undefined && (typeof owned !== 'function' || nativeIsProxy(owned))) throw Error('companion-native-facts-options-invalid');
    this.#ownedContentIdentity = owned as CompanionFactsMZOptions['ownedContentIdentity'];
    const retained = r.own(options, 'retainedMapSource'); this.#retainedSource = retained === undefined ? undefined : r.object(retained) as CompanionRetainedMapSourceMZ;
    this.#resources = new CompanionMapResourcesMZ(root, { current: () => this.context() }, nativeIsProxy);
    this.#restore = this.#retainedSource ? new CompanionRestoreMapFactsMZ(root, { current: () => this.context(), nativeLeaseSource: r.object(r.own(this.#retainedSource, 'nativeLeaseSource')) as WorldTravelLeaseSource }, nativeIsProxy) : null;
    this.#configured = profile === 'configured';
    const meanings = r.own(options, 'terrainMeanings'); this.#meaningsAvailable = meanings !== undefined;
    let ice = false;
    if (meanings !== undefined) {
      r.object(meanings);
      // Use the built-in Map reader: never a caller's iterator or get() method.
      const entries = Reflect.apply(Map.prototype.entries, meanings, []) as IterableIterator<[unknown, unknown]>;
      for (const [tag, meaning] of entries) {
        if (typeof tag !== 'number' || !Number.isSafeInteger(tag) || tag < 0 || tag > 7) throw Error('companion-native-terrain-tag-invalid');
        const row = r.object(meaning);
        if (Object.getOwnPropertyNames(row).some(key => !['landAllowed', 'fishable', 'environment', 'ice', 'canSurf', 'waterfall', 'waterfallCrest'].includes(key))
          || typeof r.own(row, 'landAllowed') !== 'boolean' || typeof r.own(row, 'fishable') !== 'boolean' || typeof r.own(row, 'environment') !== 'string'
          || typeof r.own(row, 'waterfall') !== 'boolean' || typeof r.own(row, 'waterfallCrest') !== 'boolean') throw Error('companion-native-terrain-meaning-invalid');
        const surf = r.own(row, 'canSurf'); if (surf !== undefined && typeof surf !== 'boolean') throw Error('companion-native-terrain-meaning-invalid');
        const flag = r.own(meaning, 'ice'); if (typeof flag !== 'boolean') throw Error('companion-native-terrain-meaning-invalid');
        ice ||= flag;
      }
    }
    this.#iceConfigured = ice;
    const abilities = r.own(options, 'abilities'), explicit: Partial<Record<Ability, boolean>> = {};
    if (abilities !== undefined) for (const name of ['iceSliding', 'cycling', 'surfing'] as const) explicit[name] = r.own(abilities, name) !== undefined;
    this.#explicit = Object.freeze(explicit);
    // Existing CompanionFactsMZ owns its request identities, JSON geometry loader and prepared handles.
    // Layer-5 companion passage consumes tile direction bits; land/Surf encounter meanings are separate.
    this.#facts = new CompanionFactsMZ(root, { current: this.#current, ownedContentIdentity: this.#ownedContentIdentity, passageProfile: 'plain-mz', ...(abilities === undefined ? {} : { abilities: options.abilities }) }, nativeIsProxy);
  }
  private reason(error: unknown): string {
    if (error !== null && typeof error === 'object' && !this.#isProxy(error)) {
      const descriptor = Object.getOwnPropertyDescriptor(error, 'message');
      if (descriptor && Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'string') return descriptor.value;
    }
    return 'companion-native-facts-unavailable';
  }
  private profile(): NativeReads {
    if (this.#configured && !this.#meaningsAvailable) throw Error('companion-native-terrain-configuration-unavailable');
    const r = new NativeReads(this.#isProxy), player = r.object(r.own(this.#root, '$gamePlayer'));
    // No bridge/ledge fields exist in the current TerrainTags schema. An installed native extension
    // needs a defined layer-5 mapping; its false/throwing provider is not proof of a stock absence.
    for (const key of ['isOnBridge', '_bridge', 'isOnLedge']) if (r.lookup(player, key).present) throw Error('companion-native-layer5-extension-unavailable');
    const system = r.own(this.#root, '$dataSystem');
    if (system !== undefined) {
      const legacy = r.own(system, 'rrLegacyPassage');
      if (legacy !== undefined && legacy !== false) throw Error('companion-native-legacy-passage-unavailable');
    }
    return r;
  }
  currentEvent(eventId: number): WorldFact<CompanionCurrentEventFacts> { return this.#facts.currentEvent(eventId); }
  private safeData(raw: unknown, visiting = new Set<object>()): void {
    if (raw === null || raw === undefined || typeof raw === 'string' || typeof raw === 'boolean' || typeof raw === 'number' && Number.isFinite(raw)) return;
    if (typeof raw !== 'object' || this.#isProxy(raw) || visiting.has(raw)) throw Error('companion-prefix-data-invalid');
    visiting.add(raw);
    for (const key of Reflect.ownKeys(raw)) {
      const d = Object.getOwnPropertyDescriptor(raw, key);
      if (typeof key !== 'string' || !d || !Object.hasOwn(d, 'value')) throw Error('companion-prefix-own-data-required');
      this.safeData(d.value, visiting);
    }
    visiting.delete(raw);
  }
  private context(reads = new NativeReads(this.#isProxy)): PrefixFrame {
    if (this.#capturing) throw Error('companion-prefix-context-reentrant'); this.#capturing = true;
    try {
      const raw = this.#current(); if (!raw) throw Error('companion-prefix-application-unavailable');
      const application = reads.object(reads.own(raw, 'application')), generation = reads.own(raw, 'generation'), content = reads.object(reads.own(raw, 'content'));
      if (!natural(generation)) throw Error('companion-prefix-generation-invalid');
      const owned = this.#ownedContentIdentity?.(content);
      if (owned === undefined) this.safeData(content);
      const map = reads.object(reads.own(this.#root, '$gameMap')), data = reads.object(reads.own(this.#root, '$dataMap')), player = reads.object(reads.own(this.#root, '$gamePlayer'));
      const scene = reads.object(reads.own(reads.own(this.#root, 'SceneManager'), '_scene')), mapId = reads.own(map, '_mapId');
      const x = reads.own(player, '_x'), y = reads.own(player, '_y'), direction = reads.own(player, '_direction');
      if (!natural(mapId, 1) || !natural(x) || !natural(y) || !nativeDirection(direction)) throw Error('companion-prefix-location-invalid');
      return { application, generation, content, contentIdentity: owned ?? semanticFingerprint(content), map, mapId, data, player, scene, location: { mapId, x, y, direction } };
    } finally { this.#capturing = false; }
  }
  private location(raw: WorldLocation): WorldLocation {
    this.safeData(raw);
    if (!raw || !natural(raw.mapId, 1) || !Number.isSafeInteger(raw.x) || !Number.isSafeInteger(raw.y) || !nativeDirection(raw.direction)) throw Error('companion-prefix-query-invalid');
    return { mapId: raw.mapId, x: raw.x, y: raw.y, direction: raw.direction };
  }
  private mapFrames(frame: PrefixFrame, reads: NativeReads): ReadonlyMap<number, PassageFrame> {
    const maps = new Map<number, PassageFrame>(), tileset = reads.own(frame.data, 'tilesetId');
    if (!natural(tileset)) throw Error('companion-prefix-tileset-invalid');
    const current = { mapId: frame.mapId, data: frame.data, events: reads.object(reads.own(frame.map, '_events')),
      flags: reads.object(reads.own(reads.own(reads.own(this.#root, '$dataTilesets'), String(tileset)), 'flags')) };
    maps.set(frame.mapId, current);
    const source = this.#retainedSource; if (!source) return maps;
    const published = reads.own(source, 'current'); if (published === null) return maps;
    const leaseSource = reads.object(reads.own(source, 'nativeLeaseSource')), snapshot = readNativeTravelLease(leaseSource), p = reads.object(published);
    const birth = snapshot?.mapBirth, loaded = birth?.frame;
    if (!snapshot || !loaded || reads.own(this.#root, 'SceneManager') !== birth.manager || reads.own(p, 'application') !== frame.application || reads.own(p, 'generation') !== frame.generation
      || reads.own(p, 'content') !== frame.content || reads.own(p, 'contentIdentity') !== frame.contentIdentity || reads.own(p, 'epoch') !== snapshot.nativeEpoch
      || reads.own(p, 'manager') !== birth.manager || reads.own(p, 'scene') !== frame.scene || reads.own(p, 'birth') !== birth.birth || reads.own(p, 'queue') !== birth.queue
      || birth.scene !== frame.scene || reads.own(p, 'map') !== frame.map || reads.own(p, 'mapId') !== frame.mapId || reads.own(p, 'player') !== frame.player || reads.own(p, 'data') !== frame.data
      || loaded.map !== frame.map || loaded.mapId !== frame.mapId || loaded.player !== frame.player || loaded.data !== frame.data) throw Error('companion-prefix-retained-source-stale');
    reads.object(reads.own(p, 'serial')); reads.object(reads.own(p, 'sourceScene'));
    const rows = reads.own(p, 'frames'); if (!Array.isArray(rows) || this.#isProxy(rows)) throw Error('companion-prefix-retained-frames-invalid');
    const rowCount = reads.own(rows, 'length'); if (!natural(rowCount)) throw Error('companion-prefix-retained-frames-invalid');
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const raw = reads.own(rows, String(rowIndex));
      const mapId = reads.own(raw, 'mapId'); if (!natural(mapId, 1) || maps.has(mapId)) throw Error('companion-prefix-retained-map-invalid');
      const data = reads.object(reads.own(raw, 'data')), events = reads.object(reads.own(raw, 'events')), flags = reads.object(reads.own(raw, 'flags'));
      const captured = new Map<object, Set<string>>();
      const cells = reads.own(raw, 'cells'); if (!Array.isArray(cells) || this.#isProxy(cells) || !cells.length) throw Error('companion-prefix-retained-cells-unavailable');
      const cellCount = reads.own(cells, 'length'); if (!natural(cellCount, 1)) throw Error('companion-prefix-retained-cells-unavailable');
      for (let cellIndex = 0; cellIndex < cellCount; cellIndex++) {
        const cell = reads.own(cells, String(cellIndex));
        const owner = reads.object(reads.own(cell, 'owner')), prototype = reads.own(cell, 'prototype'), key = reads.own(cell, 'key'), present = reads.own(cell, 'present'), expected = reads.own(cell, 'value');
        if (prototype !== null) reads.object(prototype);
        if (Object.getPrototypeOf(owner) !== prototype || typeof key !== 'string' || !key.length || typeof present !== 'boolean') throw Error('companion-prefix-retained-cell-stale');
        if (expected !== null && typeof expected === 'object') reads.object(expected);
        else if (expected !== undefined && expected !== null && typeof expected !== 'boolean' && typeof expected !== 'string' && !(typeof expected === 'number' && Number.isFinite(expected))) throw Error('companion-prefix-retained-value-invalid');
        const actual = reads.slot(owner, key); if (actual.present !== present || !Object.is(actual.value, expected)) throw Error('companion-prefix-retained-cell-stale');
        const keys = captured.get(owner) ?? new Set<string>(); keys.add(key); captured.set(owner, keys);
      }
      maps.set(mapId, { mapId, data, events, flags, captured });
    }
    // Record the exact canonical epoch without a caller-supplied read callback at query time.
    return maps;
  }
  prepareRestoreTrail(request: CompanionTrailFactsRequest): Promise<WorldFact<CompanionPreparedTrailFacts>> { return this.prepare(request, true); }
  prepareTrail(request: CompanionTrailFactsRequest): Promise<WorldFact<CompanionPreparedTrailFacts>> { return this.prepare(request, false); }
  private async prepare(request: CompanionTrailFactsRequest, restoreAdmission: boolean): Promise<WorldFact<CompanionPreparedTrailFacts>> {
    if (this.#preparing) return unavailable('companion-prefix-prepare-reentrant'); this.#preparing = true;
    const serial = {}; this.#serial = serial;
    try {
      this.safeData(request); if (!Array.isArray(request.companions) || !request.companions.every(isEventCompanion)) throw Error('companion-prefix-records-invalid');
      const player = this.location(request.player), reads = this.profile(), frame = this.context(reads);
      if (semanticFingerprint(player) !== semanticFingerprint(frame.location)) throw Error('companion-prefix-player-unobserved');
      const world = reads.own(frame.content, 'world'), table = world === undefined ? undefined : reads.own(world, 'mapConnections');
      const connections = table === undefined ? [] : reads.own(table, 'connections'); this.safeData(connections);
      if (!Array.isArray(connections)) throw Error('companion-prefix-connections-invalid');
      const copied = JSON.parse(JSON.stringify(connections)) as MapConnectionRecord[];
      const required = new Set([frame.mapId, ...request.companions.map(c => c.location.mapId)]), ids = new Set(required);
      // Connected normalization may need a neighboring rectangle even after a partial prior move.
      // Missing optional geometry stays unknown until a query actually requires that edge.
      for (const c of copied) if (required.has(c.a.mapId) || required.has(c.b.mapId)) { ids.add(c.a.mapId); ids.add(c.b.mapId); }
      // Read retained first: a present stale source never falls back to reconstructed pages.
      const maps = this.mapFrames(frame, reads), missing = [...required].filter(id => !maps.has(id));
      const refreshRestore = this.#restoreHandle !== null && !this.#restore?.isCurrent(this.#restoreHandle) && this.#restore?.sameBirth(this.#restoreHandle) === true;
      if (this.#restoreHandle && !this.#restore?.isCurrent(this.#restoreHandle)) { this.#restoreHandle = null; this.#restoreGeometries = []; }
      const geometries = new Map<number, WorldFact<MapGeometry>>();
      if ((restoreAdmission || refreshRestore) && missing.length) {
        if (!this.#restore) throw Error('companion-restore-canonical-source-unavailable');
        const restored = await this.#restore.prepare(missing); if (restored.status !== 'value') return restored;
        this.#restoreHandle = restored.value.handle; this.#restoreGeometries = restored.value.geometries;
      }
      const restore = this.#restoreHandle;
      for (const row of this.#restoreGeometries) if (ids.has(row.mapId) && restore && this.#restore?.covers(restore, row.mapId)) geometries.set(row.mapId, row.fact);
      if (missing.length && restore && !missing.every(id => this.#restore?.covers(restore, id))) throw Error('companion-restore-map-not-prepared');
      const nativeIds = [...ids].filter(id => !geometries.has(id));
      for (const [i, fact] of (await Promise.all(nativeIds.map(id => this.#resources.prepare(id)))).entries()) {
        const id = nativeIds[i]!;
        if (fact.status === 'value') geometries.set(id, { status: 'value', value: fact.value.geometry });
        else { if (required.has(id)) return unavailable('companion-prefix-required-geometry-' + fact.status); geometries.set(id, fact); }
      }
      if (this.#serial !== serial || !sameCompanionFactsContext(frame, this.context()) || !reads.valid()) throw Error('companion-prefix-preparation-stale');
      for (const id of ids) if (id !== frame.mapId) { const infos = reads.own(this.#root, '$dataMapInfos'); if (!Array.isArray(infos) || this.#isProxy(infos)) throw Error('companion-prefix-map-index-unavailable'); reads.slot(infos, String(id)); }
      const size = geometries.get(frame.mapId);
      if (size?.status !== 'value' || reads.own(frame.data, 'width') !== size.value.width || reads.own(frame.data, 'height') !== size.value.height) throw Error('companion-prefix-current-geometry-changed');
      const handle = {}, requestIdentity = semanticFingerprint(request);
      for (const [mapId, native] of maps) {
        const geometry = geometries.get(mapId);
        if (geometry?.status === 'value' && (reads.own(native.data, 'width') !== geometry.value.width || reads.own(native.data, 'height') !== geometry.value.height)) throw Error('companion-prefix-retained-geometry-mismatch');
      }
      if (!reads.valid()) throw Error('companion-prefix-facts-changed');
      this.#trails.set(handle, { frame, reads, maps, restore, geometries, connections: copied, serial, epoch: this.#epoch, requestIdentity });
      return { status: 'value', value: Object.freeze({ handle, requestIdentity }) };
    } catch (error) { return unavailable(this.reason(error)); } finally { this.#preparing = false; }
  }
  isReady(handle: unknown): boolean {
    if (handle === null || typeof handle !== 'object') return false;
    const entry = this.#trails.get(handle);
    try {
      if (entry && entry.epoch === this.#epoch && entry.serial === this.#serial && entry.reads.valid() && sameCompanionFactsContext(entry.frame, this.context())) {
        if (entry.restore && !this.#restore?.isCurrent(entry.restore)) throw Error('companion-restore-source-stale');
        const source = this.#retainedSource;
        if (source) {
          const r = new NativeReads(this.#isProxy), record = r.own(source, 'current');
          if (record !== null) { const lease = readNativeTravelLease(r.object(r.own(source, 'nativeLeaseSource'))); if (r.own(record, 'epoch') !== lease?.nativeEpoch) throw Error('companion-prefix-native-epoch-changed'); }
        }
        return entry.reads.valid() && entry.epoch === this.#epoch && entry.serial === this.#serial;
      }
    } catch { /* A retired prepared source never becomes permission after native ABA. */ }
    this.#trails.delete(handle); return false;
  }
  relation(handle: unknown, companion: WorldLocation, leader: WorldLocation): WorldFact<CompanionRelation> {
    try {
      if (!this.isReady(handle) || !handle || typeof handle !== 'object') return unavailable('companion-native-trail-not-ready');
      const entry = this.#trails.get(handle)!, from = this.location(companion), to = this.location(leader);
      const result = companionRelationFromGeometry(from, to, entry.connections, [...entry.geometries].map(([mapId, fact]) => ({ mapId, fact })));
      if (result.status !== 'value' || !result.value.connected) return result;
      const relative = { mapId: to.mapId, x: to.x + (to.direction === 6 ? -1 : to.direction === 4 ? 1 : 0), y: to.y + (to.direction === 2 ? -1 : to.direction === 8 ? 1 : 0), direction: to.direction };
      const placement = normalizeCompanionPlacement(relative, entry.connections, id => entry.geometries.get(id) ?? unavailable('companion-prefix-geometry-not-prepared'));
      if (placement.status !== 'value') return placement;
      return this.isReady(handle) ? { status: 'value', value: { ...result.value, placement: placement.value } } : unavailable('companion-prefix-source-changed');
    } catch (error) { return unavailable(this.reason(error)); }
  }
  placement(handle: unknown, actualRelative: WorldLocation): WorldFact<CompanionPlacement> {
    try {
      if (!this.isReady(handle) || !handle || typeof handle !== 'object') return unavailable('companion-native-trail-not-ready');
      this.safeData(actualRelative);
      const input = new NativeReads(this.#isProxy), mapId = input.own(actualRelative, 'mapId'), x = input.own(actualRelative, 'x'), y = input.own(actualRelative, 'y'), direction = input.own(actualRelative, 'direction');
      if (!natural(mapId, 1) || typeof x !== 'number' || !Number.isSafeInteger(x) || typeof y !== 'number' || !Number.isSafeInteger(y) || !nativeDirection(direction)) throw Error('companion-placement-actual-point-invalid');
      const entry = this.#trails.get(handle)!, mapped = normalizeCompanionPlacement({ mapId, x, y, direction }, entry.connections, id => entry.geometries.get(id) ?? unavailable('companion-placement-geometry-not-prepared'));
      if (mapped.status !== 'value') return mapped;
      const native = entry.maps.get(mapped.value.logical.mapId), geometry = entry.geometries.get(mapped.value.logical.mapId);
      if (geometry?.status !== 'value') return unavailable('companion-placement-map-not-covered');
      if (!native) {
        if (!entry.restore || !this.#restore?.covers(entry.restore, mapped.value.logical.mapId) || !this.isReady(handle) || !input.valid()) return unavailable('companion-placement-map-not-covered');
        return { status: 'value', value: Object.freeze({ logical: Object.freeze({ ...mapped.value.logical }), relative: Object.freeze({ ...mapped.value.relative }), connectionRecord: mapped.value.connectionRecord }) };
      }
      for (const key of ['width', 'height'] as const) {
        if (native.captured && !native.captured.get(native.data)?.has(key)) return unavailable('companion-placement-source-cell-not-captured');
        if (entry.reads.own(native.data, key) !== geometry.value[key]) return unavailable('companion-placement-geometry-mismatch');
      }
      if (!this.isReady(handle) || !input.valid()) return unavailable('companion-placement-source-changed');
      return { status: 'value', value: Object.freeze({ logical: Object.freeze({ ...mapped.value.logical }), relative: Object.freeze({ ...mapped.value.relative }), connectionRecord: mapped.value.connectionRecord }) };
    } catch (error) { return unavailable(this.reason(error)); }
  }
  private passage(entry: PrefixTrail, point: WorldPoint, direction: WorldDirection): boolean {
    const mapped = normalizeCompanionPlacement({ ...point, direction }, entry.connections, id => entry.geometries.get(id) ?? unavailable('companion-prefix-geometry-not-prepared'));
    if (mapped.status !== 'value') throw Error('companion-prefix-point-unresolved');
    const at = mapped.value.logical, map = entry.maps.get(at.mapId);
    if (!map) {
      if (!entry.restore || !this.#restore) throw Error('companion-prefix-retained-map-unavailable');
      const restored = this.#restore.canEnter(entry.restore, at, direction); if (restored.status !== 'value') throw Error('companion-restore-passage-unavailable'); return restored.value;
    }
    const r = entry.reads;
    const read = (owner: object, key: string): unknown => {
      if (map.captured && !map.captured.get(owner)?.has(key)) throw Error('companion-prefix-retained-cell-not-captured');
      return r.own(owner, key);
    };
    const width = read(map.data, 'width'), height = read(map.data, 'height'), tiles = read(map.data, 'data');
    if (!natural(width, 1) || !natural(height, 1) || !Array.isArray(tiles) || this.#isProxy(tiles) || read(tiles, 'length') !== width * height * 6 || !Array.isArray(map.events) || !Array.isArray(map.flags)) throw Error('companion-prefix-map-data-invalid');
    if (!natural(read(map.events, 'length'))) throw Error('companion-prefix-events-invalid');
    if (at.x < 0 || at.y < 0 || at.x >= width || at.y >= height) return false;
    const selected: number[] = [];
    for (let prototype = Object.getPrototypeOf(map.events) as object | null; prototype; prototype = Object.getPrototypeOf(r.object(prototype)) as object | null) {
      if (r.keys(prototype).some(key => /^(0|[1-9]\d*)$/u.test(key))) throw Error('companion-prefix-inherited-event-slot-unavailable');
    }
    for (const key of r.keys(map.events)) if (/^(0|[1-9]\d*)$/u.test(key)) {
      const raw = read(map.events, key); if (raw === null || raw === undefined) continue;
      const event = r.object(raw), id = read(event, '_eventId');
      if (!natural(id, 1) || id !== Number(key) || read(event, '_mapId') !== map.mapId) throw Error('companion-prefix-event-identity-invalid');
      const x = read(event, '_x'), y = read(event, '_y'); if (!natural(x) || !natural(y)) throw Error('companion-prefix-event-location-invalid');
      if (x !== at.x || y !== at.y) continue;
      const through = read(event, '_through'), graphic = read(event, '_characterName'), tile = read(event, '_tileId'), priority = read(event, '_priorityType');
      if (typeof through !== 'boolean' || typeof graphic !== 'string' || !natural(tile) || !natural(priority) || priority > 2) throw Error('companion-prefix-event-body-invalid');
      if (through) continue; if (graphic.length) return false; if (tile > 0 && priority === 0) selected.push(tile);
    }
    for (let z = 3; z >= 0; z--) { const tile = read(tiles, String((z * height + at.y) * width + at.x)); if (!natural(tile)) throw Error('companion-prefix-tile-invalid'); selected.push(tile); }
    const bit = (1 << ((10 - direction) / 2 - 1)) & 15;
    for (const tile of selected) { const flag = read(map.flags, String(tile)); if (!natural(flag)) throw Error('companion-prefix-flag-invalid'); if (flag & 16) continue; return (flag & bit) === 0; }
    return false;
  }
  canEnter(handle: unknown, point: WorldPoint, direction: WorldDirection): WorldFact<boolean> {
    try {
      this.safeData(point); if (!point || !natural(point.mapId, 1) || !Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y) || !nativeDirection(direction)) throw Error('companion-prefix-query-invalid');
      if (!this.isReady(handle) || !handle || typeof handle !== 'object') return unavailable('companion-native-trail-not-ready');
      const result = this.passage(this.#trails.get(handle)!, point, direction);
      return this.isReady(handle) ? value(result) : unavailable('companion-prefix-source-changed');
    } catch (error) { if (handle && typeof handle === 'object') this.#trails.delete(handle); return unavailable(this.reason(error)); }
  }
  private flag(r: NativeReads, player: object, names: readonly string[]): boolean | undefined {
    for (const name of names) {
      const slot = r.lookup(player, name); if (!slot.present) continue;
      let actual = slot.value;
      if (typeof actual === 'function') { r.object(actual); actual = Reflect.apply(actual, player, []); }
      if (typeof actual !== 'boolean') throw Error('companion-native-ability-provider-invalid');
      return actual;
    }
    return undefined;
  }
  ability(name: Ability): WorldFact<boolean> {
    if (this.#readingAbility) return unavailable('companion-native-ability-reentrant');
    if (this.#explicit[name]) return this.#facts.ability(name);
    this.#readingAbility = true;
    try {
      const r = new NativeReads(this.#isProxy), frame = this.#current(); if (!frame) throw Error('companion-native-application-unavailable');
      const application = r.object(r.own(frame, 'application')), generation = r.own(frame, 'generation'), content = r.object(r.own(frame, 'content'));
      if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 0) throw Error('companion-native-generation-invalid');
      const player = r.object(r.own(this.#root, '$gamePlayer'));
      let flag: boolean | undefined;
      if (name === 'surfing') {
        const world = r.own(r.own(r.own(this.#root, '$gameSystem'), '_psGame'), 'world');
        const raw = r.own(world, 'surfing'); if (typeof raw !== 'boolean') throw Error('companion-native-surfing-unavailable'); flag = raw;
      } else if (name === 'cycling') flag = this.flag(r, player, ['isOnBicycle', 'isCycling', '_bicycle', '_cycling']) ?? false;
      else {
        flag = this.flag(r, player, ['isSliding', '_iceSliding']);
        if (flag === undefined && (this.#iceConfigured || r.lookup(player, 'isOnIce').present || this.#configured && !this.#meaningsAvailable)) throw Error('companion-native-ice-sliding-provider-unavailable');
        flag ??= false;
      }
      const after = this.#current();
      if (!after || r.own(after, 'application') !== application || r.own(after, 'generation') !== generation || r.own(after, 'content') !== content || !r.valid()) throw Error('companion-native-ability-source-changed');
      return value(flag);
    } catch (error) { return unavailable(this.reason(error)); }
    finally { this.#readingAbility = false; }
  }
  retire(handle: unknown): void { this.#facts.retire(handle); if (handle !== null && typeof handle === 'object') this.#trails.delete(handle); }
  invalidate(): void { this.#epoch++; this.#serial = {}; this.#facts.invalidate(); this.#resources.invalidate(); this.#restore?.invalidate(); this.#restoreHandle = null; this.#restoreGeometries = []; }
}
