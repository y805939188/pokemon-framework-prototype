/** Independent readonly map geometry. No physical transfer, Game_Map setup, or global map replacement. */
import type { WorldFact } from '../../framework/rules/world-data';
import type { MapGeometry } from '../../framework/rules/world-travel';

export interface CompanionFactsContext {
  readonly application: object; readonly generation: number; readonly content: object; readonly contentIdentity: string;
  readonly map: object; readonly mapId: number; readonly data: object; readonly player: object; readonly scene: object;
}
export interface CompanionGeometryResource { readonly handle: object; readonly geometry: Readonly<MapGeometry>; readonly origin: 'current-map' | 'xhr-geometry' }
export interface CompanionGeometryOptions { current(): CompanionFactsContext | null }
interface Request {
  readonly mapId: number; readonly context: CompanionFactsContext; readonly epoch: number; readonly serial: object;
  readonly promise: Promise<WorldFact<CompanionGeometryResource>>; readonly resolve: (fact: WorldFact<CompanionGeometryResource>) => void;
  readonly infos: object | null; readonly info: object | null;
  xhr: object | null; settled: boolean; revoked: boolean; resource: CompanionGeometryResource | null;
}
export const sameCompanionFactsContext = (a: CompanionFactsContext, b: CompanionFactsContext): boolean =>
  a.application === b.application && a.generation === b.generation && a.content === b.content && a.contentIdentity === b.contentIdentity
  && a.map === b.map && a.mapId === b.mapId && a.data === b.data && a.player === b.player && a.scene === b.scene;
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

export class CompanionMapResourcesMZ {
  #root: object; #proxy: (value: unknown) => boolean; #current: CompanionGeometryOptions['current'];
  #requests = new Map<number, Request>(); #issued = new WeakMap<object, Request>(); #epoch = 0; #capturing = false;
  #transport: unknown;
  constructor(root: unknown, options: CompanionGeometryOptions, nativeIsProxy: (value: unknown) => boolean) {
    if (typeof nativeIsProxy !== 'function') throw Error('companion-native-proxy-capability-required');
    this.#proxy = nativeIsProxy; this.#root = this.object(root); const current = this.data(options, 'current');
    if (typeof current !== 'function') throw Error('companion-geometry-context-required'); this.#current = current as CompanionGeometryOptions['current'];
    this.#transport = this.data(this.#root, 'XMLHttpRequest');
  }
  private object(value: unknown): object {
    if (value === null || !['object', 'function'].includes(typeof value) || this.#proxy(value)) throw Error('companion-geometry-unsafe-object');
    return value as object;
  }
  private data(owner: unknown, key: string): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(this.object(owner), key);
    if (descriptor && !Object.hasOwn(descriptor, 'value')) throw Error('companion-geometry-own-data-required');
    return descriptor?.value;
  }
  private method(owner: object, name: string): (this: unknown, ...args: unknown[]) => unknown {
    let cursor: object | null = owner;
    while (cursor) {
      const descriptor = Object.getOwnPropertyDescriptor(this.object(cursor), name);
      if (descriptor) { if (!Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') break; return descriptor.value as (this: unknown, ...args: unknown[]) => unknown; }
      cursor = Object.getPrototypeOf(cursor);
    }
    throw Error(`companion-geometry-transport-method-unavailable:${name}`);
  }
  private capture(): CompanionFactsContext {
    if (this.#capturing) throw Error('companion-geometry-context-reentrant');
    this.#capturing = true;
    try {
      const c = this.#current(); if (!c) throw Error('companion-geometry-context-unavailable');
      const generation = this.data(c, 'generation'), mapId = this.data(c, 'mapId'), contentIdentity = this.data(c, 'contentIdentity');
      if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 0 || typeof mapId !== 'number' || !Number.isSafeInteger(mapId) || mapId <= 0 || typeof contentIdentity !== 'string') throw Error('companion-geometry-context-unavailable');
      return Object.freeze({ application: this.object(this.data(c, 'application')), generation, content: this.object(this.data(c, 'content')), contentIdentity,
        map: this.object(this.data(c, 'map')), mapId, data: this.object(this.data(c, 'data')), player: this.object(this.data(c, 'player')), scene: this.object(this.data(c, 'scene')) });
    } finally { this.#capturing = false; }
  }
  private current(entry: Request): boolean {
    try {
      if (entry.revoked || entry.epoch !== this.#epoch || this.#requests.get(entry.mapId) !== entry || !sameCompanionFactsContext(entry.context, this.capture())) return false;
      if (entry.mapId === entry.context.mapId && entry.resource && (this.data(entry.context.data, 'width') !== entry.resource.geometry.width || this.data(entry.context.data, 'height') !== entry.resource.geometry.height)) return false;
      const indexCurrent = entry.infos === null || this.data(this.#root, '$dataMapInfos') === entry.infos && this.data(entry.infos, String(entry.mapId)) === entry.info;
      return indexCurrent && !entry.revoked && entry.epoch === this.#epoch && this.#requests.get(entry.mapId) === entry;
    } catch { return false; }
  }
  private finish(entry: Request, fact: WorldFact<Readonly<MapGeometry>>): void {
    if (entry.settled) return;
    let selected = fact; const current = this.current(entry);
    try {
      if (selected.status === 'value' && entry.mapId === entry.context.mapId
        && (this.data(entry.context.data, 'width') !== selected.value.width || this.data(entry.context.data, 'height') !== selected.value.height)) selected = { status: 'unavailable', reason: 'companion-current-geometry-changed' };
    } catch (error) { selected = { status: 'unavailable', reason: message(error) }; }
    // A provider may retire this request while current() closes its context.
    if (entry.settled) return; entry.settled = true;
    if (!current) { entry.resolve({ status: 'unavailable', reason: 'companion-geometry-source-stale' }); if (this.#requests.get(entry.mapId) === entry) this.#requests.delete(entry.mapId); return; }
    if (selected.status === 'value') {
      const resource: CompanionGeometryResource = Object.freeze({ handle: entry.serial, geometry: Object.freeze({ ...selected.value }), origin: entry.mapId === entry.context.mapId ? 'current-map' : 'xhr-geometry' });
      entry.resource = resource; this.#issued.set(resource, entry); entry.resolve({ status: 'value', value: resource });
    } else { if (this.#requests.get(entry.mapId) === entry) this.#requests.delete(entry.mapId); entry.resolve(selected); }
  }
  private stop(entry: Request): void {
    entry.revoked = true;
    if (!entry.settled) { entry.settled = true; entry.resolve({ status: 'unavailable', reason: 'companion-geometry-request-retired' }); }
    if (this.#requests.get(entry.mapId) === entry) this.#requests.delete(entry.mapId);
    if (entry.xhr) { try { Reflect.apply(this.method(entry.xhr, 'abort'), entry.xhr, []); } catch { /* Revoked before abort callbacks; no authority or successor is released here. */ } }
  }
  private geometry(raw: unknown, mapId: number): WorldFact<Readonly<MapGeometry>> {
    try {
      const width = this.data(raw, 'width'), height = this.data(raw, 'height');
      if (typeof width !== 'number' || typeof height !== 'number' || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 0 || height < 0) return { status: 'invalid', reason: 'companion-map-geometry-invalid' };
      return { status: 'value', value: Object.freeze({ mapId, width, height }) };
    } catch (error) { return { status: 'invalid', reason: message(error) }; }
  }
  prepare(mapId: number): Promise<WorldFact<CompanionGeometryResource>> {
    if (!Number.isSafeInteger(mapId) || mapId <= 0) return Promise.resolve({ status: 'invalid', reason: 'companion-map-id-invalid' });
    let context: CompanionFactsContext, infos: object | null = null, info: object | null = null;
    try {
      context = this.capture();
      if (mapId !== context.mapId) {
        const index = this.data(this.#root, '$dataMapInfos');
        if (!Array.isArray(index)) return Promise.resolve({ status: 'unavailable', reason: 'companion-map-index-unavailable' });
        infos = this.object(index); const item = this.data(infos, String(mapId));
        if (item === null || item === undefined) return Promise.resolve({ status: 'absent' });
        info = this.object(item);
      }
    } catch (error) { return Promise.resolve({ status: 'unavailable', reason: message(error) }); }
    const previous = this.#requests.get(mapId);
    if (previous && this.current(previous)) return previous.promise;
    let resolve!: (fact: WorldFact<CompanionGeometryResource>) => void;
    const promise = new Promise<WorldFact<CompanionGeometryResource>>(done => { resolve = done; });
    const entry: Request = { mapId, context, epoch: this.#epoch, serial: Object.freeze({}), promise, resolve, infos, info, xhr: null, settled: false, revoked: false, resource: null };
    this.#requests.set(mapId, entry); if (previous) this.stop(previous);
    try {
      if (!this.current(entry)) throw Error('companion-geometry-source-stale');
      if (mapId === context.mapId) { this.finish(entry, this.geometry(context.data, mapId)); return promise; }
      if (typeof this.#transport !== 'function') { this.finish(entry, { status: 'unavailable', reason: 'UNAVAILABLE_NO_LOADER' }); return promise; }
      const xhr = this.object(Reflect.construct(this.#transport, [])); entry.xhr = xhr;
      const target = xhr as Record<string, unknown>;
      target.onload = () => {
        if (entry.settled) return;
        try {
          if (!this.current(entry)) throw Error('companion-geometry-source-stale');
          const status: unknown = target.status, text: unknown = target.responseText;
          if (typeof status !== 'number' || !Number.isSafeInteger(status) || status < 0) this.finish(entry, { status: 'invalid', reason: 'companion-map-response-status-invalid' });
          else if (status === 404) this.finish(entry, { status: 'absent' });
          else if (status >= 400) this.finish(entry, { status: 'unavailable', reason: `companion-map-http-${status}` });
          else if (typeof text !== 'string') this.finish(entry, { status: 'invalid', reason: 'companion-map-response-invalid' });
          else { let raw: unknown; try { raw = JSON.parse(text); } catch { this.finish(entry, { status: 'invalid', reason: 'companion-map-json-invalid' }); return; } this.finish(entry, this.geometry(raw, mapId)); }
        } catch (error) { this.finish(entry, { status: 'unavailable', reason: message(error) }); }
      };
      for (const name of ['onerror', 'onabort', 'ontimeout']) target[name] = () => this.finish(entry, { status: 'unavailable', reason: `companion-map-${name.slice(2)}` });
      target.timeout = 15000;
      if (!this.current(entry)) throw Error('companion-geometry-source-stale');
      Reflect.apply(this.method(xhr, 'open'), xhr, ['GET', `data/Map${String(mapId).padStart(3, '0')}.json`]);
      if (!this.current(entry)) throw Error('companion-geometry-source-stale');
      Reflect.apply(this.method(xhr, 'overrideMimeType'), xhr, ['application/json']);
      if (!this.current(entry)) throw Error('companion-geometry-source-stale');
      Reflect.apply(this.method(xhr, 'send'), xhr, []);
      if (!this.current(entry) && !entry.settled) this.finish(entry, { status: 'unavailable', reason: 'companion-geometry-source-stale' });
    } catch (error) { this.finish(entry, { status: 'unavailable', reason: message(error) }); }
    return promise;
  }
  isCurrent(resource: unknown): resource is CompanionGeometryResource {
    if (!resource || typeof resource !== 'object') return false;
    const entry = this.#issued.get(resource);
    return !!entry && entry.resource === resource && this.current(entry);
  }
  retire(resource: unknown): void {
    if (!resource || typeof resource !== 'object') return;
    const entry = this.#issued.get(resource); if (entry?.resource === resource) this.stop(entry);
  }
  invalidate(): void { this.#epoch++; for (const entry of [...this.#requests.values()]) this.stop(entry); }
}
