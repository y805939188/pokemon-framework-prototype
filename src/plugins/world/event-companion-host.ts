import type { CompanionPlacement } from '../../framework/rules/companion-placement';
/** Native event companions have their own characters/sprites, never actor followers or party slots. */
import type { CompanionHost, CompanionProjection } from '../../framework/app/event-companion-operation';
import { companionIdentity, isEventCompanion } from '../../framework/rules/event-companions';
import type { CompanionOrigin, CompanionSource, CompanionTrailEntry, CompanionTrailPorts } from '../../framework/rules/event-companions';
import type { EventCompanionState } from '../../framework/rules/world-state';
import type { WorldFact, WorldLocation, WorldPoint } from '../../framework/rules/world-data';
import { isTravelLocation } from '../../framework/rules/world-travel';
import { hostRecord, invoke as nativeInvoke } from './host-access';

export interface EventCompanionHostPorts {
  /** Actual runtime parent identity, not a serializable receipt. Its surface lease outlives one action. */
  readonly owner: object;
  readonly generation: number;
  isSurfaceCurrent(owner: object, generation: number): boolean;
  readCompanions(): readonly EventCompanionState[];
  /** Native forced-route completion facts; consumer performs its own atomic current-generation write. */
  observeLocation(origin: Readonly<CompanionOrigin>, location: Readonly<WorldLocation>): void;
  /** Read real map/connection facts. These ports may diagnose not-yet-loaded neighboring maps. */
  relation: CompanionTrailPorts['relation'];
  canEnter: CompanionTrailPorts['canEnter'];
  placement?(actualRelative: WorldLocation): WorldFact<CompanionPlacement>;
  /** Confirmed current leader ice-slide state, not merely an ice terrain tag. Omitted preserves
   * native MZ's no-ice compatibility; unavailable facts diagnose without inventing false. */
  iceSliding?(): WorldFact<boolean>;
  spriteParent?(): unknown;
  currentMapId?(): number;
  diagnostic?(reason: string): void;
  /** Only an existing owned child-interpreter consumer may implement this; no global reservation. */
  interact?(commonEventId: number, origin: Readonly<CompanionOrigin>, character: object): Promise<boolean>;
}
export interface CompanionOperationBinding {
  readonly owner: object;
  readonly generation: number;
  /** Resolve the actual issued operation registry entry; a DTO/token/hash is insufficient. */
  isOperationCurrent(owner: object, generation: number): boolean;
}
export interface EventCompanionNativeHost {
  /** Per-operation host; terminal/cancel expires this binding without retiring the runtime surface. */
  bind(operation: CompanionOperationBinding): CompanionHost;
  /** Once per native map update. The native sprite parent updates its own Sprite_Character children. */
  update(): void;
  /** Advisory runtime visibility/turn state from the same actual App service. */
  presentation(hidden: readonly string[], turn: boolean): void;
  dispose(): void;
  /** Exact owned resource retirement; unlike dispose(), errors and remaining resources are observable. */
  retireProjection(): { readonly spritesRemaining: number; readonly charactersRemaining: number; readonly motionsRemaining: number;
    readonly maskDetached: boolean; readonly diagnostics: readonly string[] };
  character(origin: CompanionOrigin): object | null;
  /** Already-authorized consumer routes only; does not expose a plugin command or new permission. */
  forceRoute(origin: CompanionOrigin, route: unknown): boolean;
  interact(point: WorldPoint): Promise<boolean>;
}
type Method = (this: unknown, ...args: unknown[]) => unknown;
interface Mask { readonly current: () => boolean; masked: boolean }
interface MaskHook { readonly native: Method; readonly wrapper: Method; readonly own: PropertyDescriptor | undefined; readonly masks: Set<Mask> }
// Installation bookkeeping, not operation authority. Each surface removes only its own mask.
const followerMasks = new WeakMap<object, MaskHook>();
interface MaskAttachment { install(check: () => void): void; detach(): void }
/** Reserve cleanup before installing or refreshing any native hook. */
function maskAttachment(followers: Record<string, unknown>, mask: Mask): MaskAttachment {
  let installed: MaskHook | null = null;
  const detach = (): void => {
    const hook = installed;
    if (!hook) return;
    const removed = hook.masks.delete(mask); let restored = false;
    // Never restore over a later owner's installation. Recheck after property reads too.
    const method = followers.isVisible;
    if (followerMasks.get(followers) === hook && hook.masks.size === 0 && method === hook.wrapper) {
      if (hook.own) Object.defineProperty(followers, 'isVisible', hook.own);
      else delete followers.isVisible;
      restored = true;
      if (followerMasks.get(followers) === hook && hook.masks.size === 0) followerMasks.delete(followers);
    }
    if (removed || restored) nativeInvoke(followers, 'refresh');
  };
  return {
    install(check) {
      check(); let hook = followerMasks.get(followers);
      const visible = followers.isVisible; check();
      if (!hook || visible !== hook.wrapper) {
        if (typeof visible !== 'function') throw Error('companion-native-followers-unavailable');
        const masks = new Set<Mask>();
        const own = Object.getOwnPropertyDescriptor(followers, 'isVisible'); check();
        const wrapper: Method = function(...args) {
          // An inherited native method remains inherited in meaning: a plugin may replace its
          // prototype after this surface is projected. Keep own-method chains captured as authored.
          const prototype = !own && this !== null && typeof this === 'object' ? Object.getPrototypeOf(this) : null;
          const delegate: unknown = prototype ? Reflect.get(prototype, 'isVisible', this) : visible;
          if (typeof delegate !== 'function' || delegate === wrapper) throw Error('companion-native-followers-unavailable');
          return Reflect.apply(delegate, this, args) === true && ![...masks].some(m => m.masked && m.current());
        };
        hook = { native: visible as Method, wrapper, own, masks };
      }
      installed = hook; hook.masks.add(mask); followerMasks.set(followers, hook);
      try { Object.defineProperty(followers, 'isVisible', { configurable: true, enumerable: true, writable: true, value: hook.wrapper }); check(); }
      catch (error) { detach(); throw error; }
    },
    detach,
  };
}
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const reason = (error: unknown): string => error instanceof Error ? error.message : String(error);
function originValid(origin: CompanionOrigin): boolean { return integer(origin.originMapId) && origin.originMapId > 0 && integer(origin.originEventId) && origin.originEventId > 0; }
function construct(root: Record<string, unknown>, name: string, args: readonly unknown[], check: () => void): Record<string, unknown> {
  check(); const ctor = root[name]; check();
  if (typeof ctor !== 'function') throw Error(`companion-native-unavailable:${name}`);
  const instance = hostRecord(Reflect.construct(ctor, args));
  if (!instance) throw Error(`companion-native-invalid:${name}`);
  return instance;
}
/** Independent XHR destination; never DataManager.loadMapData, $dataMap, or Game_Event.event(). */
async function loadSource(root: Record<string, unknown>, mapId: number, check: () => void): Promise<WorldFact<unknown>> {
  check(); const infos = root.$dataMapInfos; check();
  if (!Array.isArray(infos)) return { status: 'unavailable', reason: 'source-map-index-unavailable' };
  if (!Object.hasOwn(infos, mapId) || infos[mapId] == null) return { status: 'absent' };
  const ctor = root.XMLHttpRequest; check();
  if (typeof ctor !== 'function') return { status: 'unavailable', reason: 'source-transport-unavailable' };
  return new Promise(resolve => {
    try {
      const xhr = hostRecord(Reflect.construct(ctor, [])); check();
      if (!xhr) { resolve({ status: 'unavailable', reason: 'source-transport-invalid' }); return; }
      xhr.onload = () => {
        if (!integer(xhr.status) || xhr.status < 0) { resolve({ status: 'invalid', reason: 'source-response-status-invalid' }); return; }
        if (xhr.status === 404) { resolve({ status: 'absent' }); return; }
        if (xhr.status >= 400) { resolve({ status: 'unavailable', reason: `source-http-${xhr.status}` }); return; }
        if (typeof xhr.responseText !== 'string') { resolve({ status: 'invalid', reason: 'source-response-invalid' }); return; }
        try { const value: unknown = JSON.parse(xhr.responseText); resolve({ status: 'value', value }); }
        catch { resolve({ status: 'invalid', reason: 'source-json-invalid' }); }
      };
      xhr.onerror = () => resolve({ status: 'unavailable', reason: 'source-read-failed' });
      xhr.onabort = () => resolve({ status: 'unavailable', reason: 'source-read-aborted' });
      xhr.ontimeout = () => resolve({ status: 'unavailable', reason: 'source-read-timeout' });
      xhr.timeout = 15000;
      check(); nativeInvoke(xhr, 'open', ['GET', `data/Map${String(mapId).padStart(3, '0')}.json`]);
      check(); nativeInvoke(xhr, 'overrideMimeType', ['application/json']);
      check(); nativeInvoke(xhr, 'send'); check();
    } catch (error) { resolve({ status: 'unavailable', reason: `source-read-failed:${reason(error)}` }); }
  });
}
function validateSource(data: unknown, origin: CompanionOrigin): CompanionSource {
  const map = hostRecord(data);
  if (!map || !integer(map.width) || map.width < 1 || !integer(map.height) || map.height < 1 || !Array.isArray(map.events)) return { status: 'invalid', reason: 'source-map-invalid' };
  const event = hostRecord(Object.hasOwn(map.events, origin.originEventId) ? map.events[origin.originEventId] : null);
  if (!event) return { status: 'absent' };
  if (event.id !== origin.originEventId || !integer(event.x) || event.x < 0 || event.x >= map.width || !integer(event.y) || event.y < 0 || event.y >= map.height || !Array.isArray(event.pages) || event.pages.length === 0 || !event.pages.every(page => { const p = hostRecord(page); return !!p && !!hostRecord(p.image) && Array.isArray(p.list); })) return { status: 'invalid', reason: 'source-event-invalid' };
  return { status: 'value', value: { cloneable: true } };
}
interface Instance {
  readonly identity: string; readonly origin: CompanionOrigin; readonly character: Record<string, unknown>;
  mapId: number; placedMapId: number | null; placement: CompanionPlacement | null; record: EventCompanionState; visible: boolean;
  lastReported: string; sprite: Record<string, unknown> | null; parent: Record<string, unknown> | null;
}
interface Motion {
  readonly instance: Instance; readonly entry: CompanionTrailEntry; readonly through: boolean;
  readonly current: () => boolean; readonly renderTarget: WorldLocation; remaining: number; resolve(location: WorldLocation): void; reject(error: Error): void;
}
/** One runtime surface. Create a new one for a replaced App/generation; dispose the previous surface. */
export function createEventCompanionHost(rootValue: unknown, ports: EventCompanionHostPorts): EventCompanionNativeHost {
  const root = hostRecord(rootValue);
  if (!root || !ports.owner || !integer(ports.generation) || ports.generation < 0) throw Error('companion-host-invalid');
  const owner = ports.owner, generation = ports.generation;
  let disposed = false, maskDetach: (() => void) | null = null, followers: Record<string, unknown> | null = null, lastNativeVisible: boolean | null = null;
  const instances = new Map<string, Instance>(), motions = new Map<string, Motion>();
  let transferHidden = new Set<string>();
  const current = (): boolean => { try { return !disposed && ports.isSurfaceCurrent(owner, generation) === true; } catch { return false; } };
  const assertCurrent = (): void => { if (!current()) throw Error('companion-owner-stale'); };
  let activeCheck: (() => void) | null = null, mutating = false;
  const queuedMutations: (() => void)[] = [];
  let drainScheduled = false;
  let createdDuringMutation: Set<Instance> | null = null, maskActivated = false;
  const check = (): void => { (activeCheck ?? assertCurrent)(); };
  const invoke = (value: unknown, name: string, args: readonly unknown[] = []): unknown => {
    check(); const record = hostRecord(value), method = record?.[name]; check();
    if (typeof method !== 'function') throw Error(`world-host-method-unavailable:${name}`);
    const result = Reflect.apply(method, value, args); check(); return result;
  };
  // Reserve the queue before the first provider/constructor/native callback can reenter this surface.
  // Only the synchronous setup phase is serialized; movement completion never holds this queue.
  const scheduleDrain = (): void => {
    if (drainScheduled || queuedMutations.length === 0) return;
    drainScheduled = true;
    void Promise.resolve().then(() => { drainScheduled = false; if (!mutating) queuedMutations.shift()?.(); });
  };
  const mutate = <T>(guard: () => void, work: () => T): Promise<T> => new Promise<T>((resolve, reject) => {
    const run = (): void => {
      const created = new Set<Instance>();
      activeCheck = guard; mutating = true; createdDuringMutation = created; maskActivated = false;
      try { guard(); const value = work(); guard(); resolve(value); }
      catch (error) {
        for (const instance of created) if (instances.get(instance.identity) === instance) { try { remove(instance); } catch (cleanupError) { diagnostic(reason(cleanupError)); } }
        // Only this phase's false -> true activation is provisional. A mask already true belongs
        // to the successful idle surface; failure must neither remove it nor restore author snapshots.
        if (maskActivated) mask.masked = false;
        reject(error);
      } finally { activeCheck = null; mutating = false; createdDuringMutation = null; maskActivated = false; scheduleDrain(); }
    };
    if (mutating || queuedMutations.length > 0) { queuedMutations.push(run); scheduleDrain(); }
    else run();
  });
  const diagnostic = (message: string): void => { try { ports.diagnostic?.(message); } catch { /* A diagnostic sink must not strand owned cleanup or a queued promise. */ } };
  const readIceSliding = (): boolean | null => {
    check();
    let sliding: boolean | null = null, issue: string | null = null;
    try {
      const read = ports.iceSliding; check();
      if (read === undefined) return null;
      if (typeof read !== 'function') issue = 'invalid:provider';
      else {
        const raw: unknown = Reflect.apply(read, ports, []); check();
        const fact = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? hostRecord(raw) : null;
        const status = fact?.status; check();
        if (status === 'value') {
          const flag = fact?.value; check();
          if (typeof flag === 'boolean') sliding = flag;
          else issue = 'invalid:value';
        } else if (status === 'absent' || status === 'invalid' || status === 'unavailable') {
          const detail = fact?.reason; check();
          issue = `${status}${typeof detail === 'string' ? `:${detail}` : ''}`;
        } else issue = 'invalid:status';
      }
    } catch (error) { issue = `unavailable:${reason(error)}`; }
    check();
    if (issue !== null) { diagnostic(`companion-ice-${issue}`); check(); }
    return sliding;
  };
  const mask: Mask = { current, masked: false };
  const mapId = (): number => {
    const id = ports.currentMapId ? ports.currentMapId() : invoke(root.$gameMap, 'mapId');
    if (!integer(id) || id < 1) throw Error('companion-current-map-unavailable');
    return id;
  };
  const records = (): readonly EventCompanionState[] => {
    check(); const result = ports.readCompanions(); check();
    if (!Array.isArray(result) || !result.every(isEventCompanion) || new Set(result.map(companionIdentity)).size !== result.length) throw Error('companion-records-invalid');
    return result;
  };
  const observe = (instance: Instance): WorldLocation => {
    const result = { mapId: instance.mapId, x: instance.character.x, y: instance.character.y, direction: invoke(instance.character, 'direction') };
    if (!integer(result.x) || !integer(result.y) || result.direction !== 2 && result.direction !== 4 && result.direction !== 6 && result.direction !== 8) throw Error('companion-native-location-invalid');
    const paired = instance.placement;
    if (paired && paired.relative.mapId === result.mapId && paired.relative.x === result.x && paired.relative.y === result.y)
      return { ...paired.logical, direction: result.direction };
    if (ports.placement && instance.mapId === mapId()) {
      const mapped = ports.placement(result as WorldLocation); check();
      if (mapped.status === 'value' && isTravelLocation(mapped.value.logical)) {
        instance.placement = mapped.value; return { ...mapped.value.logical, direction: result.direction };
      }
      if (!isTravelLocation(result)) throw Error('companion-native-partial-placement-unavailable');
    }
    if (!isTravelLocation(result)) throw Error('companion-native-location-invalid');
    return result;
  };
  const renderPlacement = (logical: WorldLocation): { readonly point: WorldLocation; readonly placement: CompanionPlacement | null } => {
    const activeMap = mapId();
    if (logical.mapId === activeMap) return { point: logical, placement: null };
    const player = hostRecord(root.$gamePlayer), actual = { mapId: activeMap, x: player?.x, y: player?.y, direction: invoke(player, 'direction') };
    if (!isTravelLocation(actual)) throw Error('companion-render-player-unavailable');
    // The planner's leader may itself still be logically in the old map. Convert only for
    // rendering relative to the actual player/current Map, using this same prepared geometry.
    const relation = ports.relation(logical, actual); check();
    if (relation.status !== 'value' || !relation.value.connected || relation.value.current.mapId !== activeMap) throw Error('companion-render-relation-unavailable');
    const relative = { ...relation.value.current, direction: logical.direction };
    const mapped = ports.placement?.(relative); check();
    if (mapped?.status !== 'value' || mapped.value.logical.mapId !== logical.mapId || mapped.value.logical.x !== logical.x || mapped.value.logical.y !== logical.y
      || mapped.value.logical.direction !== logical.direction) throw Error('companion-render-inverse-placement-unavailable');
    return { point: relative, placement: mapped.value };
  };
  const place = (instance: Instance, target: WorldLocation, translatedStart = false, placement: CompanionPlacement | null = null): void => {
    check();
    const active = target.mapId === mapId();
    const inMap = active && invoke(root.$gameMap, 'isValid', [target.x, target.y]) === true;
    if (active && !inMap && !translatedStart) throw Error('companion-target-outside-map');
    // Native locate consults $gameMap for terrain/ground. Off-map saved characters only receive
    // map-independent coordinates until their own target map becomes active; never replay old data there.
    invoke(instance.character, inMap ? 'locate' : 'setPosition', [target.x, target.y]);
    invoke(instance.character, 'setDirection', [target.direction]);
    instance.mapId = target.mapId; instance.placedMapId = active ? target.mapId : null; instance.placement = placement;
  };
  const ownedSprites = new Set<Record<string, unknown>>(), everOwned = new WeakSet<object>(), cleaningSprites = new WeakSet<object>();
  const cleanupSprite = (sprite: Record<string, unknown>): void => {
    if (!everOwned.has(sprite) || cleaningSprites.has(sprite)) return;
    cleaningSprites.add(sprite); ownedSprites.delete(sprite);
    let failure: unknown;
    try {
      const parent = hostRecord(sprite.parent);
      try { if (parent) nativeInvoke(parent, 'removeChild', [sprite]); } catch (error) { failure = error; }
      try { if (sprite.destroyed !== true) nativeInvoke(sprite, 'destroy', [{ children: true, texture: false, textureSource: false }]); }
      catch (error) { failure ??= error; }
    } finally {
      cleaningSprites.delete(sprite);
      if (sprite.parent || sprite.destroyed !== true) ownedSprites.add(sprite);
    }
    if (failure !== undefined) throw failure;
  };
  const detachSprite = (instance: Instance): void => {
    const sprite = instance.sprite;
    if (!sprite) return;
    instance.sprite = null; instance.parent = null;
    cleanupSprite(sprite);
  };
  const remove = (instance: Instance): void => {
    const motion = motions.get(instance.identity);
    if (motion?.instance === instance) { motions.delete(instance.identity); motion.reject(Error('companion-instance-removed')); }
    if (instances.get(instance.identity) === instance) instances.delete(instance.identity);
    detachSprite(instance);
  };
  const syncMask = (): void => {
    check();
    const player = root.$gamePlayer;
    const next = hostRecord(invoke(player, 'followers'));
    check();
    if (!next) throw Error('companion-native-followers-unavailable');
    if (next !== followers) {
      const detach = maskDetach; maskDetach = null; followers = null;
      detach?.(); check();
      const attachment = maskAttachment(next, mask);
      // dispose() can now retire this ticket even from an installation/refresh callback.
      followers = next; maskDetach = attachment.detach;
      try { attachment.install(check); invoke(next, 'refresh'); lastNativeVisible = invoke(next, 'isVisible') === true; }
      catch (error) { attachment.detach(); if (followers === next) { followers = null; maskDetach = null; } throw error; }
    } else {
      const effective = invoke(next, 'isVisible') === true;
      if (effective !== lastNativeVisible) { invoke(next, 'refresh'); lastNativeVisible = effective; }
    }
  };
  const authorVisible = (): boolean => {
    const native = invoke(root.$gamePlayer, 'followers'), d = native && typeof native === 'object' ? Object.getOwnPropertyDescriptor(native, '_visible') : undefined;
    check(); if (!d || !('value' in d) || typeof d.value !== 'boolean') throw Error('companion-author-visibility-unavailable');
    return d.value;
  };
  const spriteParent = (): Record<string, unknown> | null => {
    if (ports.spriteParent) return hostRecord(ports.spriteParent());
    const scene = hostRecord(hostRecord(root.SceneManager)?._scene), spriteset = hostRecord(scene?._spriteset);
    return hostRecord(spriteset?._tilemap);
  };
  const mount = (instance: Instance): void => {
    const parent = spriteParent(); check();
    if (!parent || instance.mapId !== mapId()) { detachSprite(instance); return; }
    if (instance.placedMapId !== instance.mapId) place(instance, observe(instance));
    if (instance.sprite && instance.parent === parent && instance.sprite.parent === parent && instance.sprite.destroyed !== true) return;
    detachSprite(instance); check();
    const sprite = construct(root, 'Sprite_Character', [instance.character], check);
    everOwned.add(sprite); ownedSprites.add(sprite);
    instance.sprite = sprite; instance.parent = parent;
    try { check(); invoke(parent, 'addChild', [sprite]); check(); }
    catch (error) {
      if (instance.sprite === sprite) { instance.sprite = null; instance.parent = null; }
      cleanupSprite(sprite); throw error;
    }
  };
  const appearance = (instance: Instance, record: EventCompanionState): void => {
    const c = instance.character, a = record.appearance;
    invoke(c, a.tileId > 0 ? 'setTileImage' : 'setImage', a.tileId > 0 ? [a.tileId] : [a.characterName, a.characterIndex]);
    invoke(c, 'setPattern', [a.pattern]); invoke(c, 'setOpacity', [a.opacity]); invoke(c, 'setBlendMode', [a.blendMode]);
    invoke(c, 'setWalkAnime', [a.walkAnime]); invoke(c, 'setStepAnime', [a.stepAnime]);
  };
  const ensure = (record: EventCompanionState): Instance => {
    check(); const identity = companionIdentity(record);
    let instance = instances.get(identity);
    if (!instance) {
      const character = construct(root, 'Game_Character', [], check); check();
      instance = { identity, origin: { originMapId: record.originMapId, originEventId: record.originEventId }, character, mapId: record.location.mapId, placedMapId: null, placement: null, record, visible: record.visible, lastReported: '', sprite: null, parent: null };
      instances.set(identity, instance); createdDuringMutation?.add(instance);
      const own = instance;
      // WP13 followers use entering-direction passage, not MZ's source+destination actor passage.
      // Keep the real native movement/route implementation; only its passage query uses actual map facts.
      character.canPass = function(x: unknown, y: unknown, direction: unknown): boolean {
        check();
        if (own.mapId !== mapId() || !integer(x) || !integer(y) || direction !== 2 && direction !== 4 && direction !== 6 && direction !== 8) return false;
        const tx = invoke(root.$gameMap, 'roundXWithDirection', [x, direction]), ty = invoke(root.$gameMap, 'roundYWithDirection', [y, direction]);
        if (!integer(tx) || !integer(ty)) return false;
        if (invoke(root.$gameMap, 'isValid', [tx, ty]) !== true) {
          const placement = ports.placement?.({ mapId: own.mapId, x: tx, y: ty, direction: direction as 2 | 4 | 6 | 8 }); check();
          if (placement?.status !== 'value') return false;
        }
        if (invoke(character, 'isThrough') === true) return true;
        const fact = ports.canEnter({ mapId: own.mapId, x: tx, y: ty }, direction); check();
        const motion = motions.get(own.identity);
        if (motion && !motion.current()) throw Error('companion-operation-stale');
        if (fact.status !== 'value') { diagnostic(`companion-passage-${fact.status}`); return false; }
        return fact.value === true;
      };
      place(instance, record.location); appearance(instance, record); check();
    }
    return instance;
  };
  const busy = (instance: Instance): boolean => invoke(instance.character, 'isMoving') === true || invoke(instance.character, 'isJumping') === true;
  const finishMotion = (motion: Motion): void => {
    if (motions.get(motion.instance.identity) !== motion) return;
    invoke(motion.instance.character, 'setThrough', [motion.through]);
    const actual = observe(motion.instance); check();
    if (motions.get(motion.instance.identity) !== motion) return;
    motions.delete(motion.instance.identity); motion.resolve(actual);
  };
  const cancelMotion = (motion: Motion, error: unknown): void => {
    if (motions.get(motion.instance.identity) !== motion) return;
    motions.delete(motion.instance.identity);
    try { nativeInvoke(motion.instance.character, 'setThrough', [motion.through]); }
    finally { motion.reject(error instanceof Error ? error : Error(reason(error))); }
  };
  const tickMotion = (motion: Motion): boolean => {
    const instance = motion.instance, c = instance.character, action = motion.entry.motion;
    if (!motion.current()) { cancelMotion(motion, Error('companion-operation-stale')); return false; }
    const previousCheck = activeCheck;
    activeCheck = () => { assertCurrent(); if (!motion.current()) throw Error('companion-operation-stale'); };
    try {
      check();
      if (busy(instance)) return true;
      if (motion.remaining === 0) { finishMotion(motion); return true; }
      if (instance.mapId !== mapId()) throw Error('companion-motion-map-unavailable');
      // A forced route belongs to its existing author; ordinary following never replaces it.
      if (invoke(c, 'isMoveRouteForcing') === true) throw Error('companion-forced-route-active');
      motion.remaining--;
      if (action.kind === 'walk') { invoke(c, 'setThrough', [action.through]); invoke(c, 'moveStraight', [action.direction]); }
      else if (action.kind === 'jump') invoke(c, 'jump', [motion.renderTarget.x - Number(c.x), motion.renderTarget.y - Number(c.y)]);
      return true;
    } catch (error) { cancelMotion(motion, error); return false; }
    finally { activeCheck = previousCheck; }
  };
  const bind = (operation: CompanionOperationBinding): CompanionHost => {
    const operationOwner = operation.owner, operationGeneration = operation.generation;
    const operationCurrent = (): boolean => {
      try { return current() && operation.isOperationCurrent(operationOwner, operationGeneration) === true; } catch { return false; }
    };
    const assertOperation = (): void => { if (!operationCurrent()) throw Error('companion-operation-stale'); };
    return {
      async source(origin) {
        if (!originValid(origin)) return { status: 'invalid', reason: 'source-origin-invalid' };
        assertOperation(); const snapshot = { ...origin }, loaded = await loadSource(root, snapshot.originMapId, assertOperation); assertOperation();
        const fact = loaded.status === 'value' ? validateSource(loaded.value, snapshot) : loaded;
        if (fact.status !== 'value') diagnostic(`${companionIdentity(snapshot)}:${fact.status === 'absent' ? 'source-missing' : fact.reason ?? fact.status}`);
        assertOperation(); return fact;
      },
      trail: {
        relation(companion, leader) { assertOperation(); const value = ports.relation(companion, leader); assertOperation(); return value; },
        canEnter(point, direction) { assertOperation(); const value = ports.canEnter(point, direction); assertOperation(); return value; },
        forcedRoute(origin) {
          try { assertOperation(); const instance = instances.get(companionIdentity(origin)); const value = instance ? invoke(instance.character, 'isMoveRouteForcing') === true : false; assertOperation(); return { status: 'value', value }; }
          catch (error) { diagnostic(`companion-forced-route-observation:${reason(error)}`); return { status: 'unavailable', reason: reason(error) }; }
        },
      },
      async move(entry) {
        const started = await mutate(assertOperation, () => {
          assertOperation(); const record = records().find(c => companionIdentity(c) === companionIdentity(entry.origin));
          if (!record) throw Error('companion-not-registered');
          const instance = ensure(record), action = entry.motion; assertOperation();
          if (motions.has(instance.identity)) throw Error('companion-motion-active');
          if (!('target' in action)) return { completion: Promise.resolve(observe(instance)) };
          if (!isTravelLocation(action.target)) throw Error('companion-target-invalid');
          if (invoke(instance.character, 'isMoveRouteForcing') === true) throw Error('companion-forced-route-active');
          const render = renderPlacement(action.target);
          if (action.kind === 'locate') {
            place(instance, render.point, render.placement !== null, render.placement);
            assertOperation(); mount(instance); return { completion: Promise.resolve(observe(instance)) };
          }
          const renderTarget = render.point;
          if (renderTarget.mapId !== mapId()) throw Error('companion-motion-map-unavailable');
          if (instance.mapId !== renderTarget.mapId) {
            // Connected coordinates are translated by the real relation port before native animation.
            const start = renderPlacement(observe(instance)); assertOperation();
            if (start.point.mapId !== renderTarget.mapId) throw Error('companion-connected-start-frame-unavailable');
            place(instance, start.point, true, start.placement);
          }
          if (instance.mapId !== mapId()) throw Error('companion-motion-map-unavailable');
          const completion = new Promise<WorldLocation>((resolve, reject) => {
            const motion: Motion = { instance, entry, renderTarget, current: operationCurrent, through: invoke(instance.character, 'isThrough') === true, remaining: action.kind === 'walk' ? action.steps : 1, resolve, reject };
            motions.set(instance.identity, motion);
            try { tickMotion(motion); mount(instance); } catch (error) { cancelMotion(motion, error); }
        });
        void completion.catch(() => undefined);
        return { completion };
        });
        return started.completion;
      },
      async project(projection: CompanionProjection) {
        return mutate(assertOperation, () => {
          assertOperation();
          // Projection DTOs describe appearance only; the current parent's records authorize instances.
          const actual = records(), allowed = new Map(actual.map(c => [companionIdentity(c), c]));
          const restored = new Set(projection.recovery.filter(r => r.action === 'restore').map(r => companionIdentity(r.origin)));
          const visible = new Map(projection.visibility.map(v => [v.identity, v.visible])), authored = authorVisible();
          for (const instance of [...instances.values()]) { assertOperation(); if (!allowed.has(instance.identity) || !restored.has(instance.identity)) remove(instance); }
          for (const record of actual) {
            assertOperation(); const identity = companionIdentity(record);
            if (!restored.has(identity)) continue;
            const instance = ensure(record); instance.record = record;
            if (!motions.has(identity) && invoke(instance.character, 'isMoveRouteForcing') !== true) {
              const at = observe(instance), target = record.location;
              if (instance.mapId !== mapId() || at.mapId !== target.mapId || at.x !== target.x || at.y !== target.y) {
                // A restored logical old-map record is rendered in the current Map frame, never carried.
                const render = renderPlacement(target);
                place(instance, render.point, render.placement !== null, render.placement);
              }
              else invoke(instance.character, 'setDirection', [target.direction]);
            }
            appearance(instance, record); instance.visible = record.visible && visible.get(identity) === true && authored;
            invoke(instance.character, 'setTransparent', [!instance.visible || transferHidden.has(instance.identity)]); assertOperation(); mount(instance);
          }
          maskActivated = !mask.masked && actual.length > 0; mask.masked = actual.length > 0; syncMask(); assertOperation();
        });
      },
    };
  };
  const host: EventCompanionNativeHost = {
    bind,
    presentation(hidden, turn) {
      assertCurrent(); transferHidden = new Set(hidden);
      const descriptor = followers && Object.getOwnPropertyDescriptor(followers, '_visible');
      if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'boolean') throw Error('companion-author-visibility-unavailable');
      const authorVisible = descriptor.value;
      for (const instance of instances.values()) {
        try {
          check(); instance.visible = instance.record.visible && authorVisible; invoke(instance.character, 'setTransparent', [!instance.visible || transferHidden.has(instance.identity)]);
          if (turn && invoke(instance.character, 'isMoveRouteForcing') === false) invoke(instance.character, 'turnTowardCharacter', [root.$gamePlayer]);
        } catch (error) { diagnostic(`companion-presentation-${instance.identity}:${reason(error)}`); }
      }
    },
    update() {
      if (!current()) { host.dispose(); return; }
      if (mutating || queuedMutations.length > 0) return;
      void mutate(assertCurrent, () => {
        syncMask();
        const iceSliding = instances.size > 0 ? readIceSliding() : null;
        const author = followers && Object.getOwnPropertyDescriptor(followers, '_visible');
        if (instances.size && (!author || !('value' in author) || typeof author.value !== 'boolean')) throw Error('companion-author-visibility-unavailable');
        for (const instance of instances.values()) {
          try {
            check();
            if (instance.mapId !== mapId()) { detachSprite(instance); continue; }
            if (instance.placedMapId !== instance.mapId) place(instance, observe(instance));
            const motion = motions.get(instance.identity);
            if (motion && !motion.current()) { cancelMotion(motion, Error('companion-operation-stale')); continue; }
            const speed = invoke(root.$gamePlayer, 'realMoveSpeed');
            if (typeof speed === 'number' && Number.isFinite(speed)) invoke(instance.character, 'setMoveSpeed', [speed]);
            const wasForced = invoke(instance.character, 'isMoveRouteForcing') === true;
            invoke(instance.character, 'update'); check();
            // Preserve native movement/routes and author animation flags. straighten owns the
            // resting pattern and animation counter; the next non-sliding update resumes normally.
            if (iceSliding === true) invoke(instance.character, 'straighten');
            if (wasForced && !busy(instance) && !motions.has(instance.identity)) {
              const actual = observe(instance), key = `${actual.mapId}/${actual.x}/${actual.y}/${actual.direction}`;
              if (key !== instance.lastReported) { instance.lastReported = key; ports.observeLocation({ ...instance.origin }, actual); check(); }
            }
            if (motion && !tickMotion(motion)) continue;
            instance.visible = instance.record.visible && author?.value === true;
            invoke(instance.character, 'setTransparent', [!instance.visible || transferHidden.has(instance.identity)]); mount(instance);
          } catch (error) {
            assertCurrent();
            const pending = motions.get(instance.identity);
            if (pending) { try { cancelMotion(pending, error); } catch (cleanupError) { diagnostic(reason(cleanupError)); } }
            diagnostic(`companion-update-${instance.identity}:${reason(error)}`);
            assertCurrent();
          }
        }
      }).catch(error => { diagnostic(reason(error)); if (!current()) host.dispose(); });
    },
    retireProjection() {
      disposed = true;
      // Disable only this surface's mask before any native callback can throw/reenter.
      mask.masked = false;
      const diagnostics: string[] = [], note = (error: unknown): void => { const message = reason(error); diagnostics.push(message); diagnostic(message); };
      for (const instance of [...instances.values()]) { try { remove(instance); } catch (error) { note(error); } }
      // remove() already attempted each instance's sprite; leave its retained resources for the
      // next explicit bounded attempt rather than retrying the same hook twice in this call.
      const retained = new Set(ownedSprites);
      for (const sprite of retained) {
        // Sprites with no instance may be leftovers from an earlier completed attempt.
        // They are retried only when this call began with no live instances.
        if (diagnostics.length) break;
        try { cleanupSprite(sprite); } catch (error) { note(error); }
      }
      const detach = maskDetach;
      try { detach?.(); if (maskDetach === detach) { maskDetach = null; followers = null; } } catch (error) { note(error); }
      return Object.freeze({ spritesRemaining: ownedSprites.size, charactersRemaining: instances.size, motionsRemaining: motions.size,
        maskDetached: maskDetach === null, diagnostics: Object.freeze(diagnostics) });
    },
    dispose() { if (!disposed) host.retireProjection(); },
    character(origin) { check(); return instances.get(companionIdentity(origin))?.character ?? null; },
    forceRoute(origin, route) {
      check(); if (mutating || queuedMutations.length > 0) return false;
      mutating = true; activeCheck = assertCurrent;
      try {
        const instance = instances.get(companionIdentity(origin)), data = hostRecord(route);
        if (!instance || motions.has(instance.identity) || !data || !Array.isArray(data.list) || typeof data.repeat !== 'boolean' || typeof data.skippable !== 'boolean' || typeof data.wait !== 'boolean' || !data.list.every(command => { const c = hostRecord(command); return !!c && integer(c.code) && c.code >= 0 && c.code <= 45 && Array.isArray(c.parameters); })) return false;
        invoke(instance.character, 'forceMoveRoute', [route]); check(); return true;
      } finally { activeCheck = null; mutating = false; scheduleDrain(); }
    },
    async interact(point) {
      check(); if (!ports.interact || !integer(point.mapId) || !integer(point.x) || !integer(point.y)) return false;
      const record = records().find(c => c.visible && c.commonEventId && c.location.mapId === point.mapId && c.location.x === point.x && c.location.y === point.y);
      if (!record?.commonEventId) return false;
      const instance = instances.get(companionIdentity(record));
      if (!instance || !instance.visible || busy(instance) || invoke(instance.character, 'isMoveRouteForcing') === true) return false;
      const accepted = await ports.interact(record.commonEventId, { ...instance.origin }, instance.character); check();
      return accepted === true;
    },
  };
  return host;
}
