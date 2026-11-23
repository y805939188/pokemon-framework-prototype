/** Fresh-map, readonly page reconstruction. Never a retained Game_Event or App permit. */
import type { CompanionFactsContext } from './event-companion-map-resources-mz';
import { sameCompanionFactsContext } from './event-companion-map-resources-mz';
import { readNativeTravelLease } from './travel-lease-registry-mz';
import { semanticFingerprint } from '../../framework/rules/semantic';
import { sha256Hex } from '../../framework/rules/sha256';
import type { WorldFact, WorldDirection, WorldPoint } from '../../framework/rules/world-data';
import type { CompanionRestoreFactsMZOptions, CompanionRestorePreparedMapsMZ, CompanionRestoredPageEventMZ } from './event-companion-restore-ports-mz';

const natural = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
const unavailable = (reason: string): { status: 'unavailable'; reason: string } => ({ status: 'unavailable', reason });
type Cell = Readonly<{ owner: object; prototype: object | null; key: string; present: boolean; value: unknown }>;
class Reads {
  readonly cells: Cell[] = [];
  constructor(readonly isProxy: (v: unknown) => boolean) {}
  object(v: unknown): object { if (v === null || typeof v !== 'object' && typeof v !== 'function' || this.isProxy(v)) throw Error('companion-restore-unsafe-object'); return v as object; }
  own(v: unknown, key: string): unknown {
    const owner = this.object(v), d = Object.getOwnPropertyDescriptor(owner, key);
    if (d && !Object.hasOwn(d, 'value')) throw Error('companion-restore-own-data-required');
    this.cells.push({ owner, prototype: Object.getPrototypeOf(owner) as object | null, key, present: !!d, value: d?.value }); return d?.value;
  }
  lookup(v: unknown, key: string): unknown {
    let owner: object | null = this.object(v);
    while (owner) { const value = this.own(owner, key); if (Object.hasOwn(owner, key)) return value; owner = Object.getPrototypeOf(owner) as object | null; }
    return undefined;
  }
  valid(): boolean { try { return this.cells.every(c => { const owner = this.object(c.owner), d = Object.getOwnPropertyDescriptor(owner, c.key); return Object.getPrototypeOf(owner) === c.prototype && !!d === c.present && (!d || Object.hasOwn(d, 'value') && Object.is(d.value, c.value)); }); } catch { return false; } }
}
// Compatibility with pinned Reactor 0.98.8. No unknown method is invoked to obtain facts.
const pins: Readonly<Record<string, string>> = Object.freeze({
  findProperPageIndex: '8de9df6fda6658e9b1fbcfc6337fbd8a22c8b3d7d0d9f11373182eadee34b75e',
  meetsConditions: '7175f72776ab7db02a7b11eff6b7b9abc3e1e2b9cc4d4fc9d73e83068d5d4c69',
  setupPageSettings: '5ac2846cfd79990986b4ae66da71bfa836f0d49f19a933e2a08f0dc0d912e8bc',
  clearPageSettings: '8140c0a846e222cdb5aec0e8a9d903a11d93b8e15344c5a1b8c4ae3496022638',
  switchValue: '252e9a77de26cd3a0bd55fec35c6873544ebd8114e7280ce5685556d00dfac87',
  variableValue: 'fb9ad36786c6527747a0ae927380a8987ca2ab1ecb347a241096105e2ba76afd',
  selfValue: '45c9c84a8c87d9bb8ed4ec61f012761d57e0b5ba99f29c473168ddc5438822ea',
  hasItem: 'd1f6e29a3560b69e40f6817c4e3fa5f9a9fe86c3f6f1d684422eb170c5149194',
  numItems: '05858f8435a9c791210c3eacaa6b0a0247b7d30c0e30db7848b064212c38741f',
  itemContainer: '494867e83a2476594d8e0044f04a7d84144e5d85500ff17d87a8e14236ebf772',
  members: '3be9cfd8c7b69b50a6685deddeb02492ee749dc29209a3c8da927efb090b9887',
  allMembers: '983458e6eb4b7f7db137d2008eb78dee72326b083a0b38514f9b674ec0e4e902',
  inBattle: 'fe8f5f174c6bc3fd6a9fa9d7481d7051b9c73d69d74f80633dbb474a6fb5e5a2',
  actor: 'bfb6605b53d578af134c3950ce754036b9a51541663de8b848c653c4057d9fe4',
  isItem: 'ce04f2b048bcdac9ac1a51e700524214c4609d9bbf85a38db9ac1d22c1ae6308',
  isWeapon: '0bfbe14ea61f2d0989e6884995762c4f087936db9c1bb1ab1712cd939a9d04c6',
  isArmor: '3c78b06093fe6da4e62a5c1968687089f37651a5d51e09f841ca12aa59ac222f',
});
interface MapFacts { readonly mapId: number; readonly width: number; readonly height: number; readonly tiles: readonly number[]; readonly flags: object; readonly events: readonly CompanionRestoredPageEventMZ[] }
interface Prepared {
  readonly handle: object; readonly context: CompanionFactsContext; readonly epoch: object; readonly birth: object; readonly queue: object;
  readonly reads: Reads; readonly maps: Map<number, MapFacts>; readonly xhrs: Set<object>; readonly pending: Set<(fact: WorldFact<unknown>) => void>;
  revoked: boolean;
}
export class CompanionRestoreMapFactsMZ {
  readonly #root: object; readonly #isProxy: (v: unknown) => boolean; readonly #current: CompanionRestoreFactsMZOptions['current']; readonly #source: CompanionRestoreFactsMZOptions['nativeLeaseSource'];
  readonly #transport: unknown; readonly #issued = new WeakMap<object, Prepared>(); #active: Prepared | null = null; #capturing = false;
  constructor(root: unknown, options: CompanionRestoreFactsMZOptions, nativeIsProxy: (v: unknown) => boolean) {
    this.#isProxy = nativeIsProxy; const r = new Reads(nativeIsProxy); this.#root = r.object(root);
    if (typeof r.own(options, 'current') !== 'function' || nativeIsProxy(r.own(options, 'current'))) throw Error('companion-restore-context-required');
    this.#current = r.own(options, 'current') as CompanionRestoreFactsMZOptions['current']; this.#source = r.object(r.own(options, 'nativeLeaseSource')) as CompanionRestoreFactsMZOptions['nativeLeaseSource']; this.#transport = r.own(this.#root, 'XMLHttpRequest');
  }
  private reason(error: unknown): string {
    if (error !== null && typeof error === 'object' && !this.#isProxy(error)) { const d = Object.getOwnPropertyDescriptor(error, 'message'); if (d && Object.hasOwn(d, 'value') && typeof d.value === 'string') return d.value; }
    return 'companion-restore-unavailable';
  }
  private pin(r: Reads, owner: unknown, method: string, pin = method): void {
    const fn = r.lookup(owner, method); r.object(fn);
    if (typeof fn !== 'function' || sha256Hex(Reflect.apply(Function.prototype.toString, fn, [])) !== pins[pin]) throw Error('companion-restore-native-provider-unavailable:' + method);
  }
  private plain(raw: unknown, seen = new Set<object>()): void {
    if (raw === null || raw === undefined || typeof raw === 'string' || typeof raw === 'boolean' || typeof raw === 'number' && Number.isFinite(raw)) return;
    const object = new Reads(this.#isProxy).object(raw); if (typeof raw === 'function' || seen.has(object)) throw Error('companion-restore-content-invalid'); seen.add(object);
    for (const key of Reflect.ownKeys(object)) { const d = Object.getOwnPropertyDescriptor(object, key); if (typeof key !== 'string' || !d || !Object.hasOwn(d, 'value')) throw Error('companion-restore-own-data-required'); this.plain(d.value, seen); } seen.delete(object);
  }
  private context(r: Reads): CompanionFactsContext {
    if (this.#capturing) throw Error('companion-restore-context-reentrant'); this.#capturing = true;
    try {
      const raw = this.#current(); if (!raw) throw Error('companion-restore-context-unavailable');
      const application = r.object(r.own(raw, 'application')), generation = r.own(raw, 'generation'), content = r.object(r.own(raw, 'content')), contentIdentity = r.own(raw, 'contentIdentity');
      this.plain(content);
      if (!natural(generation) || typeof contentIdentity !== 'string' || semanticFingerprint(content) !== contentIdentity) throw Error('companion-restore-context-invalid');
      const map = r.object(r.own(this.#root, '$gameMap')), mapId = r.own(map, '_mapId'), data = r.object(r.own(this.#root, '$dataMap')), player = r.object(r.own(this.#root, '$gamePlayer'));
      if (!natural(r.own(data, 'width'), 1) || !natural(r.own(data, 'height'), 1)) throw Error('companion-restore-current-data-invalid');
      const manager = r.object(r.own(this.#root, 'SceneManager')), scene = r.object(r.own(manager, '_scene'));
      if (!natural(mapId, 1) || r.own(manager, '_nextScene') !== null || r.own(scene, '_started') !== true || r.own(scene, '_active') !== true || r.own(player, '_transferring') !== false) throw Error('companion-restore-native-not-ready');
      return { application, generation, content, contentIdentity, map, mapId, data, player, scene };
    } finally { this.#capturing = false; }
  }
  private current(p: Prepared, selectedCells = true): boolean {
    try {
      if (p.revoked || this.#active !== p || selectedCells && !p.reads.valid() || !sameCompanionFactsContext(p.context, this.context(new Reads(this.#isProxy)))) return false;
      const s = readNativeTravelLease(this.#source), b = s?.mapBirth;
      return !!s && s.current === null && (s.sourceHandoff === undefined || s.sourceHandoff === null) && s.nativeEpoch === p.epoch && b?.birth === p.birth && b.queue === p.queue && b.scene === p.context.scene
        && b.manager === this.#ownRootManager() && b.frame?.map === p.context.map && b.frame.mapId === p.context.mapId && b.frame.data === p.context.data && b.frame.player === p.context.player && (!selectedCells || p.reads.valid());
    } catch { return false; }
  }
  #ownRootManager(): unknown { return Object.getOwnPropertyDescriptor(this.#root, 'SceneManager')?.value; }
  private method(owner: object, key: string): (this: unknown, ...args: unknown[]) => unknown {
    const fn = new Reads(this.#isProxy).lookup(owner, key); if (typeof fn !== 'function') throw Error('companion-restore-transport-unavailable'); return fn as (this: unknown, ...args: unknown[]) => unknown;
  }
  private stop(p: Prepared): void {
    p.revoked = true; if (this.#active === p) this.#active = null;
    for (const done of [...p.pending]) done(unavailable('companion-restore-request-retired'));
    for (const xhr of p.xhrs) { try { Reflect.apply(this.method(xhr, 'abort'), xhr, []); } catch { /* Already revoked; late callbacks cannot clear a successor. */ } }
  }
  private async load(p: Prepared, mapId: number): Promise<WorldFact<unknown>> {
    const r = p.reads, infos = r.object(r.own(this.#root, '$dataMapInfos')), info = r.own(infos, String(mapId));
    if (info === null || info === undefined) return { status: 'absent' }; r.object(info);
    if (typeof this.#transport !== 'function') return unavailable('companion-restore-loader-unavailable');
    return new Promise(resolve => {
      let settled = false; const finish = (fact: WorldFact<unknown>): void => { if (settled) return; settled = true; p.pending.delete(finish); resolve(this.current(p) ? fact : unavailable('companion-restore-source-stale')); };
      p.pending.add(finish);
      try {
        if (!this.current(p)) throw Error('companion-restore-source-stale');
        const xhr = r.object(Reflect.construct(this.#transport as Function, [])); p.xhrs.add(xhr); const target = xhr as Record<string, unknown>;
        target.onload = () => { if (settled) return; try {
          if (!this.current(p)) throw Error('companion-restore-source-stale');
          const status = r.own(xhr, 'status'), text = r.own(xhr, 'responseText');
          if (!natural(status)) finish({ status: 'invalid', reason: 'companion-restore-http-status-invalid' });
          else if (status === 404) finish({ status: 'absent' }); else if (status >= 400) finish(unavailable('companion-restore-http-' + status));
          else if (typeof text !== 'string') finish({ status: 'invalid', reason: 'companion-restore-response-invalid' });
          else { let raw: unknown; try { raw = JSON.parse(text); } catch { finish({ status: 'invalid', reason: 'companion-restore-json-invalid' }); return; } finish({ status: 'value', value: raw }); }
        } catch (error) { finish(unavailable(this.reason(error))); } };
        for (const key of ['onerror', 'onabort', 'ontimeout']) target[key] = () => finish(unavailable('companion-restore-' + key));
        target.timeout = 15000;
        for (const [name, args] of [['open', ['GET', `data/Map${String(mapId).padStart(3, '0')}.json`]], ['overrideMimeType', ['application/json']], ['send', []]] as const) {
          if (!this.current(p)) throw Error('companion-restore-source-stale'); Reflect.apply(this.method(xhr, name), xhr, [...args]);
        }
      } catch (error) { finish(unavailable(this.reason(error))); }
    });
  }
  private scalar(v: unknown): string | number | boolean | null | undefined {
    if (v === undefined || v === null || typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v)) return v;
    throw Error('companion-restore-used-condition-unavailable');
  }
  private store(r: Reads, name: string, methodPin: string, key: string): unknown {
    const owner = r.object(r.own(this.#root, name)); this.pin(r, owner, 'value', methodPin); return this.scalar(r.lookup(r.own(owner, '_data'), key));
  }
  private matches(r: Reads, mapId: number, eventId: number, c: object): boolean {
    const enabled = (key: string): boolean => { const v = r.own(c, key); if (typeof v !== 'boolean') throw Error('companion-restore-page-condition-invalid'); return v; };
    const id = (key: string): number => { const v = r.own(c, key); if (!natural(v, 1)) throw Error('companion-restore-page-condition-id-invalid'); return v; };
    for (const n of [1, 2]) if (enabled('switch' + n + 'Valid')) {
      const index = id('switch' + n + 'Id'), system = r.own(this.#root, '$dataSystem'), label = r.lookup(r.own(system, 'switches'), String(index));
      if (typeof label !== 'string' || label.startsWith('s:')) throw Error('companion-restore-script-switch-unavailable');
      if (!this.store(r, '$gameSwitches', 'switchValue', String(index))) return false;
    }
    if (enabled('variableValid')) {
      const v = this.store(r, '$gameVariables', 'variableValue', String(id('variableId'))) || 0, n = this.scalar(r.own(c, 'variableValue')), op = r.own(c, 'rrVariableOp');
      if (typeof n !== 'number' || !Number.isFinite(n) || typeof v !== 'number' && typeof v !== 'string' && typeof v !== 'boolean') throw Error('companion-restore-variable-condition-invalid');
      const numeric = typeof v === 'number' ? v : Number(v);
      if (op === undefined ? !(numeric >= n) : !([v === n, numeric >= n, numeric <= n, numeric > n, numeric < n, v !== n][natural(op) ? op : -1])) return false;
    }
    if (enabled('selfSwitchValid')) { const ch = r.own(c, 'selfSwitchCh'); if (typeof ch !== 'string' || !ch.length) throw Error('companion-restore-self-switch-invalid'); if (!!this.store(r, '$gameSelfSwitches', 'selfValue', `${mapId},${eventId},${ch}`) !== true) return false; }
    if (enabled('itemValid')) {
      const itemId = id('itemId'), party = r.object(r.own(this.#root, '$gameParty')); for (const method of ['hasItem', 'numItems', 'itemContainer']) this.pin(r, party, method);
      const dm = r.object(r.own(this.#root, 'DataManager')); for (const method of ['isItem', 'isWeapon', 'isArmor']) this.pin(r, dm, method);
      const items = r.object(r.own(this.#root, '$dataItems')), item = r.lookup(items, String(itemId)); if (!item) return false;
      if (r.own(item, 'id') !== itemId) throw Error('companion-restore-item-identity-invalid');
      const count = this.scalar(r.lookup(r.own(party, '_items'), String(itemId))) || 0; if (typeof count !== 'number' || !Number.isFinite(count)) throw Error('companion-restore-item-count-invalid'); if (!(count > 0)) return false;
    }
    if (enabled('actorValid')) {
      const actorId = id('actorId'), party = r.object(r.own(this.#root, '$gameParty')), actors = r.object(r.own(this.#root, '$gameActors'));
      for (const method of ['members', 'allMembers', 'inBattle']) this.pin(r, party, method); this.pin(r, actors, 'actor');
      if (r.own(party, '_inBattle') !== false) throw Error('companion-restore-battle-members-unavailable');
      const definitions = r.object(r.own(this.#root, '$dataActors')), data = r.object(r.own(actors, '_data')), list = r.object(r.own(party, '_actors')), length = r.own(list, 'length');
      if (!natural(length)) throw Error('companion-restore-actor-list-invalid');
      const actor = (index: number): unknown => { const definition = r.lookup(definitions, String(index)); if (!definition) return null; const cached = r.lookup(data, String(index)); if (!cached) throw Error('companion-restore-lazy-actor-unavailable'); return r.object(cached); };
      const selected = actor(actorId); let found = false;
      for (let i = 0; i < length; i++) { const member = r.lookup(list, String(i)); if (member === undefined) continue; if (!natural(member, 1)) throw Error('companion-restore-actor-id-invalid'); if (actor(member) === selected) found = true; }
      if (!found) return false;
    }
    return true;
  }
  private reconstruct(p: Prepared, mapId: number, raw: unknown): MapFacts {
    const r = p.reads, width = r.own(raw, 'width'), height = r.own(raw, 'height'), tilesetId = r.own(raw, 'tilesetId'), tiles = r.own(raw, 'data'), events = r.own(raw, 'events');
    if (!natural(width, 1) || !natural(height, 1) || !natural(tilesetId, 1) || !Array.isArray(tiles) || tiles.length !== width * height * 6 || !tiles.every(t => natural(t)) || !Array.isArray(events)) throw Error('companion-restore-map-invalid');
    const flags = r.object(r.own(r.own(r.own(this.#root, '$dataTilesets'), String(tilesetId)), 'flags')), proto = r.own(r.own(this.#root, 'Game_Event'), 'prototype');
    for (const method of ['findProperPageIndex', 'meetsConditions', 'setupPageSettings', 'clearPageSettings']) this.pin(r, proto, method);
    const rows: CompanionRestoredPageEventMZ[] = [];
    for (let i = 1; i < events.length; i++) {
      const event: unknown = events[i]; if (!event) continue; const eventId = r.own(event, 'id'), x = r.own(event, 'x'), y = r.own(event, 'y'), pages = r.own(event, 'pages');
      if (eventId !== i || !natural(x) || !natural(y) || !Array.isArray(pages)) throw Error('companion-restore-event-invalid');
      let index = -1; for (let j = pages.length - 1; j >= 0; j--) if (this.matches(r, mapId, i, r.object(r.own(pages[j], 'conditions')))) { index = j; break; }
      if (index < 0) continue; const page: unknown = pages[index], image = r.own(page, 'image'), name = r.own(image, 'characterName'), tile = r.own(image, 'tileId'), through = r.own(page, 'through'), priority = r.own(page, 'priorityType');
      if (typeof name !== 'string' || !natural(tile) || typeof through !== 'boolean' || !natural(priority) || priority > 2) throw Error('companion-restore-page-body-invalid');
      rows.push(Object.freeze({ eventId: i, pageIndex: index, x, y, characterName: tile > 0 ? '' : name, tileId: tile, through, priorityType: priority }));
    }
    return Object.freeze({ mapId, width, height, tiles: Object.freeze(tiles), flags, events: Object.freeze(rows) });
  }
  async prepare(mapIds: readonly number[]): Promise<WorldFact<CompanionRestorePreparedMapsMZ>> {
    let p: Prepared | null = null;
    try {
      const r = new Reads(this.#isProxy); r.object(mapIds); if (!Array.isArray(mapIds)) throw Error('companion-restore-map-ids-invalid');
      const length = r.own(mapIds, 'length'); if (!natural(length)) throw Error('companion-restore-map-ids-invalid'); const ids: number[] = [];
      for (let i = 0; i < length; i++) { const id = r.own(mapIds, String(i)); if (!natural(id, 1) || ids.includes(id)) throw Error('companion-restore-map-id-invalid'); ids.push(id); }
      const context = this.context(r), snapshot = readNativeTravelLease(this.#source), birth = snapshot?.mapBirth;
      if (!snapshot || snapshot.current !== null || snapshot.sourceHandoff != null || !birth?.frame || !snapshot.nativeEpoch) throw Error('companion-restore-born-source-required');
      const handle = {}; p = { handle, context, epoch: snapshot.nativeEpoch, birth: birth.birth, queue: birth.queue, reads: r, maps: new Map(), xhrs: new Set(), pending: new Set(), revoked: false };
      const prior = this.#active; this.#active = p; if (prior) this.stop(prior); this.#issued.set(handle, p);
      if (!this.current(p)) throw Error('companion-restore-born-source-stale');
      for (const id of ids) { if (id === context.mapId) throw Error('companion-restore-current-map-is-native'); const result = await this.load(p, id); if (result.status !== 'value') { this.stop(p); return result; } p.maps.set(id, this.reconstruct(p, id, result.value)); }
      if (!this.current(p)) throw Error('companion-restore-source-stale');
      return { status: 'value', value: Object.freeze({ handle, origin: 'pinned-mz-restored-pages', geometries: Object.freeze([...p.maps.values()].map(m => Object.freeze({ mapId: m.mapId, fact: { status: 'value' as const, value: Object.freeze({ mapId: m.mapId, width: m.width, height: m.height }) } }))) }) };
    } catch (error) { if (p) this.stop(p); return unavailable(this.reason(error)); }
  }
  /** Known adapter-only refresh scope: never makes the old selected page handle ready. */
  sameBirth(handle: unknown): boolean { if (handle === null || typeof handle !== 'object' || this.#isProxy(handle)) return false; const p = this.#issued.get(handle); return !!p && this.current(p, false); }
  isCurrent(handle: unknown): boolean { if (handle === null || typeof handle !== 'object' || this.#isProxy(handle)) return false; const p = this.#issued.get(handle); return !!p && this.current(p); }
  covers(handle: unknown, mapId: number): boolean { return this.isCurrent(handle) && this.#issued.get(handle as object)!.maps.has(mapId); }
  canEnter(handle: unknown, point: WorldPoint, direction: WorldDirection): WorldFact<boolean> {
    try {
      if (!this.isCurrent(handle)) throw Error('companion-restore-handle-stale'); const p = this.#issued.get(handle as object)!, r = p.reads;
      const mapId = r.own(point, 'mapId'), x = r.own(point, 'x'), y = r.own(point, 'y'); if (!natural(mapId, 1) || !natural(x) || !natural(y) || ![2, 4, 6, 8].includes(direction)) throw Error('companion-restore-point-invalid');
      const map = p.maps.get(mapId); if (!map) throw Error('companion-restore-map-not-covered');
      if (x >= map.width || y >= map.height) { if (!this.isCurrent(handle)) throw Error('companion-restore-source-stale'); return { status: 'value', value: false }; }
      const tiles: number[] = []; let blocked = false;
      for (const e of map.events) if (e.x === x && e.y === y && !e.through) { if (e.characterName.length) blocked = true; if (e.tileId > 0 && e.priorityType === 0) tiles.push(e.tileId); }
      for (let z = 3; z >= 0; z--) tiles.push(map.tiles[(z * map.height + y) * map.width + x]!);
      const bit = (1 << ((10 - direction) / 2 - 1)) & 15; let allowed = false;
      for (const tile of blocked ? [] : tiles) { const flag = r.lookup(map.flags, String(tile)); if (!natural(flag)) throw Error('companion-restore-flag-invalid'); if (flag & 16) continue; allowed = (flag & bit) === 0; break; }
      if (!this.isCurrent(handle)) throw Error('companion-restore-source-stale'); return { status: 'value', value: allowed };
    } catch (error) { return unavailable(this.reason(error)); }
  }
  retire(handle: unknown): void { if (handle !== null && typeof handle === 'object') { const p = this.#issued.get(handle); if (p) this.stop(p); } }
  invalidate(): void { if (this.#active) this.stop(this.#active); }
}
