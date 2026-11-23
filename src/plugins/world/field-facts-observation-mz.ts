/** Closed native read set for a field-facts aggregate. No provider runs after the closing read. */
export interface FieldFactDataSlot { readonly owner: object; readonly path: readonly string[] }
export type FieldFactsObservation = object;
interface Source { readonly root: object; readonly isProxy: (value: unknown) => boolean; readonly slots: readonly FieldFactDataSlot[]; observing: boolean }
const sources = new WeakMap<object, Source>();
const absent = Symbol('field-fact-absent');
/** Slots declare mutable data behind custom providers (for example a mask's validity cell).
 * Providers whose hidden state cannot be represented by this native read set must remain unavailable.
 * The capability must receive Node's real util.types.isProxy, never a configurable predicate.
 */
export function createFieldFactsObservation(root: object, nativeIsProxy: (value: unknown) => boolean, slots: readonly FieldFactDataSlot[] = []): FieldFactsObservation {
  if (typeof nativeIsProxy !== 'function') throw Error('field-facts-native-proxy-capability-required');
  const checked = (value: unknown): object => {
    if (value === null || !['object', 'function'].includes(typeof value) || nativeIsProxy(value)) throw Error('field-facts-unsafe-object');
    return value as object;
  };
  checked(root); checked(slots); if (!Array.isArray(slots)) throw Error('field-facts-data-slots-invalid');
  const pinned: FieldFactDataSlot[] = [];
  for (let i = 0; i < slots.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(slots, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw Error('field-facts-data-slots-invalid');
    const slot = checked(descriptor.value), owner = Object.getOwnPropertyDescriptor(slot, 'owner'), path = Object.getOwnPropertyDescriptor(slot, 'path');
    if (!owner || !path || !Object.hasOwn(owner, 'value') || !Object.hasOwn(path, 'value')) throw Error('field-facts-data-slots-invalid');
    checked(owner.value); checked(path.value);
    if (!Array.isArray(path.value)) throw Error('field-facts-data-slots-invalid');
    const keys: string[] = [];
    for (let j = 0; j < path.value.length; j++) {
      const key = Object.getOwnPropertyDescriptor(path.value, String(j));
      if (!key || !Object.hasOwn(key, 'value') || typeof key.value !== 'string') throw Error('field-facts-data-slots-invalid');
      keys.push(key.value);
    }
    pinned.push({ owner: owner.value, path: keys });
  }
  const capability = Object.freeze({}); sources.set(capability, { root, isProxy: nativeIsProxy, slots: pinned, observing: false }); return capability;
}
/** Root-bound current native cells only. The caller retains its observation/operation lifetime. */
export function readFieldFactOwnData(capability: FieldFactsObservation | undefined, root: object, owner: unknown, key: string): unknown {
  const source = capability && sources.get(capability);
  if (!source || source.root !== root) throw Error('field-facts-own-data-capability-required');
  if (owner === null || !['object', 'function'].includes(typeof owner) || source.isProxy(owner)) throw Error('field-facts-unsafe-object');
  const descriptor = Object.getOwnPropertyDescriptor(owner, key);
  if (descriptor && !Object.hasOwn(descriptor, 'value')) throw Error('field-facts-own-data-required');
  return descriptor?.value;
}
export function observeFieldFacts<T>(capability: FieldFactsObservation | undefined, root: object, providers: object, prepare: (assertUnchanged: () => void) => T): T {
  const source = capability && sources.get(capability);
  if (!source) throw Error('field-facts-observation-required');
  if (source.root !== root) throw Error('field-facts-observation-root-mismatch');
  if (source.observing) throw Error('field-facts-observation-reentrant');
  const record = (value: unknown): object => {
    if (value === null || !['object', 'function'].includes(typeof value) || source.isProxy(value)) throw Error('field-facts-unsafe-object');
    return value as object;
  };
  const data = (target: unknown, key: string | symbol): unknown => {
    const descriptor = Object.getOwnPropertyDescriptor(record(target), key);
    if (!descriptor) return absent;
    if (!Object.hasOwn(descriptor, 'value')) throw Error('field-facts-own-data-required');
    return descriptor.value;
  };
  const snapshot = (): readonly unknown[] => {
    const values: unknown[] = [], strictSeen = new Set<object>(), nativeSeen = new Set<object>();
    const shallow = (value: unknown): void => {
      const object = record(value); values.push(object, Object.getPrototypeOf(object));
      for (const key of Object.getOwnPropertyNames(object).sort()) values.push(key, data(object, key));
    };
    const deep = (value: unknown, depth = 0, nativeData = false): void => {
      values.push(value);
      const callable = typeof value === 'function';
      if (callable && !nativeData) throw Error('field-facts-hidden-provider-state');
      if (value === null || (typeof value !== 'object' && !callable)) return;
      const object = record(value), prototype = Object.getPrototypeOf(object);
      if (depth > 32) throw Error('field-facts-data-too-deep');
      // Native stores may contain inert author callbacks. Their identity and own data graph
      // remain observed; a custom provider's declared backing cells still use strict deep().
      const seen = nativeData ? nativeSeen : strictSeen;
      if (seen.has(object)) return;
      seen.add(object); values.push(prototype);
      const keys = Reflect.ownKeys(object);
      for (const key of keys) { values.push(key); deep(data(object, key), depth + 1, nativeData); }
    };
    const nativeCondition = (valid: boolean): void => { if (!valid) throw Error('field-facts-native-condition-data-invalid'); };
    const scalar = (value: unknown): void => {
      nativeCondition(value === absent || value === null || value === undefined || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean');
    };
    const conditionId = (conditions: unknown, key: string): number => {
      const id = data(conditions, key);
      if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) throw Error('field-facts-native-condition-data-invalid');
      return id;
    };
    const storeCell = (store: string, key: string): unknown => data(data(data(root, store), '_data'), key);
    // Array.map visits inherited numeric cells as well as own cells, but skips true holes.
    // Resolve only data descriptors, recording every consulted prototype/cell without invoking it.
    const visibleData = (target: unknown, key: string): unknown => {
      let owner: object | null = record(target);
      while (owner) {
        record(owner); const descriptor = Object.getOwnPropertyDescriptor(owner, key);
        values.push(owner, key);
        if (descriptor) {
          if (!Object.hasOwn(descriptor, 'value')) throw Error('field-facts-own-data-required');
          values.push(descriptor.value); return descriptor.value;
        }
        values.push(absent); owner = Object.getPrototypeOf(owner);
      }
      return absent;
    };
    const actorIds = (actors: unknown): readonly number[] => {
      nativeCondition(Array.isArray(actors)); const array = record(actors), length = data(array, 'length');
      if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) throw Error('field-facts-native-condition-data-invalid');
      const map = visibleData(array, 'map'); nativeCondition(typeof map === 'function'); record(map);
      // Enumerating visible index names preserves sparse native semantics without walking every hole.
      const indices = new Set<number>(); let owner: object | null = array;
      while (owner) {
        record(owner); values.push(owner);
        for (const key of Object.getOwnPropertyNames(owner)) if (/^(0|[1-9]\d*)$/u.test(key) && Number(key) < length) indices.add(Number(key));
        owner = Object.getPrototypeOf(owner);
      }
      const ids: number[] = [];
      for (const index of [...indices].sort((a, b) => a - b)) {
        const id = visibleData(array, String(index));
        if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) throw Error('field-facts-native-condition-data-invalid');
        ids.push(id);
      }
      return ids;
    };
    const conditionCells = (conditions: unknown, eventId: unknown): void => {
      if (conditions === absent || conditions === null || conditions === undefined) return;
      const enabled = (key: string): boolean => { const value = data(conditions, key); return value !== absent && !!value; };
      for (const n of ['1', '2']) if (enabled('switch' + n + 'Valid')) scalar(storeCell('$gameSwitches', String(conditionId(conditions, 'switch' + n + 'Id'))));
      if (enabled('variableValid')) { scalar(storeCell('$gameVariables', String(conditionId(conditions, 'variableId')))); scalar(data(conditions, 'variableValue')); }
      if (enabled('selfSwitchValid')) {
        const mapId = data(data(root, '$gameMap'), '_mapId'), channel = data(conditions, 'selfSwitchCh');
        if (typeof mapId !== 'number' || !Number.isSafeInteger(mapId) || typeof eventId !== 'number' || !Number.isSafeInteger(eventId) || typeof channel !== 'string') throw Error('field-facts-native-condition-data-invalid');
        scalar(storeCell('$gameSelfSwitches', `${mapId},${eventId},${channel}`));
      }
      if (enabled('itemValid')) scalar(data(data(data(root, '$gameParty'), '_items'), String(conditionId(conditions, 'itemId'))));
      if (enabled('actorValid')) {
        const requested = conditionId(conditions, 'actorId'), ids = actorIds(data(data(root, '$gameParty'), '_actors'));
        // Native Game_Actors.actor reads both the database and cached actor for every visible ID.
        // An uncached defined actor would lazily write _data, which a read-only query cannot admit.
        for (const id of [requested, ...ids]) {
          const definition = visibleData(data(root, '$dataActors'), String(id));
          if (definition === absent || !definition) continue;
          const actor = visibleData(data(data(root, '$gameActors'), '_data'), String(id));
          nativeCondition(actor !== null && typeof actor === 'object' && !Array.isArray(actor)); record(actor);
        }
      }
    };
    const map = data(root, '$gameMap'), player = data(root, '$gamePlayer'), manager = data(root, 'SceneManager'), scene = data(manager, '_scene');
    shallow(map); shallow(player); shallow(manager); values.push(scene);
    // Capture prototype method identities without invoking their getters or implementations.
    const methods = (value: unknown): void => {
      let prototype: object | null = record(value);
      while (prototype) { record(prototype); values.push(prototype); for (const key of Object.getOwnPropertyNames(prototype).sort()) { const descriptor = Object.getOwnPropertyDescriptor(prototype, key)!; values.push(key, Object.hasOwn(descriptor, 'value') ? descriptor.value : descriptor.get, descriptor.set); } prototype = Object.getPrototypeOf(prototype); }
    };
    methods(map); methods(player);
    const eventTileIds: unknown[] = [];
    for (const key of ['_events', '_tileEvents', '_vehicles']) {
      const list = data(map, key); values.push(list);
      if (list !== absent && list !== null && list !== undefined) { const array = record(list); shallow(array); for (const name of Object.getOwnPropertyNames(array)) if (/^(0|[1-9]\d*)$/u.test(name)) { const item = data(array, name); if (item !== null && item !== undefined) { shallow(item); methods(item); if (key === '_events') eventTileIds.push(data(item, '_tileId')); } } }
    }
    const followers = data(player, '_followers'); values.push(followers);
    if (followers !== absent && followers !== null && followers !== undefined) { shallow(followers); const list = data(followers, '_data'); values.push(list); if (list !== absent && list !== null && list !== undefined) { shallow(list); for (const key of Object.getOwnPropertyNames(record(list))) if (/^(0|[1-9]\d*)$/u.test(key)) { const follower = data(list, key); if (follower !== null && follower !== undefined) { shallow(follower); methods(follower); } } } }
    const mapData = data(root, '$dataMap'); shallow(mapData);
    const width = data(mapData, 'width'), height = data(mapData, 'height'), tiles = data(mapData, 'data');
    if (typeof width !== 'number' || typeof height !== 'number' || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || !Array.isArray(tiles)) throw Error('field-facts-native-map-unavailable');
    record(tiles); values.push(tiles, data(tiles, 'length'));
    const x = data(player, '_x'), y = data(player, '_y'), direction = data(player, '_direction');
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw Error('field-facts-native-player-unavailable');
    const scroll = data(mapData, 'scrollType'), dx = direction === 6 ? 1 : direction === 4 ? -1 : 0, dy = direction === 2 ? 1 : direction === 8 ? -1 : 0;
    let targetX = x + dx, targetY = y + dy;
    if (scroll === 2 || scroll === 3) targetX = (targetX % width + width) % width;
    if (scroll === 1 || scroll === 3) targetY = (targetY % height + height) % height;
    const tileIds: unknown[] = [];
    for (const point of [{ x, y }, { x: targetX, y: targetY }]) for (let z = 0; z < 6; z++) { const tile = data(tiles, String((z * height + point.y) * width + point.x)); values.push(tile); tileIds.push(tile); }
    const tilesets = data(root, '$dataTilesets'), tilesetId = data(map, '_tilesetId');
    values.push(tilesets, tilesetId);
    const events = data(mapData, 'events'); values.push(events);
    if (events !== absent && events !== null && events !== undefined) { shallow(events); for (const key of Object.getOwnPropertyNames(record(events))) if (/^(0|[1-9]\d*)$/u.test(key)) {
      const event = data(events, key); if (event === null || event === undefined) continue; shallow(event);
      const pages = data(event, 'pages'); values.push(pages);
      if (pages !== absent && pages !== null && pages !== undefined) { shallow(pages); for (const index of Object.getOwnPropertyNames(record(pages))) if (/^(0|[1-9]\d*)$/u.test(index)) {
        const page = data(pages, index); values.push(page); deep(data(page, 'conditions')); conditionCells(data(page, 'conditions'), data(event, 'id')); deep(data(page, 'image')); values.push(data(page, 'priorityType'), data(page, 'through'));
        const image = data(page, 'image'); if (image !== absent && image !== null && image !== undefined) eventTileIds.push(data(image, 'tileId'));
      } }
    } }
    if (tilesets !== absent && typeof tilesetId === 'number') { const tileset = data(tilesets, String(tilesetId)), flags = data(tileset, 'flags'); values.push(tileset, flags); for (const tile of [...tileIds, ...eventTileIds]) if (typeof tile === 'number') values.push(data(flags, String(tile))); }
    // These native data stores determine active event pages and collision visibility.
    for (const key of ['$gameSwitches', '$gameVariables', '$gameSelfSwitches', '$gameActors']) { const owner = data(root, key); values.push(owner); if (owner !== absent && owner !== null && owner !== undefined) deep(data(owner, '_data'), 0, true); }
    const party = data(root, '$gameParty'); values.push(party); if (party !== absent && party !== null && party !== undefined) for (const key of ['_actors', '_items', '_weapons', '_armors']) deep(data(party, key), 0, true);
    const flow = data(root, 'PSFlow'); values.push(flow);
    if (flow !== absent && flow !== null && flow !== undefined) { const content = data(flow, '_content'); values.push(content); if (content !== absent && content !== null && content !== undefined) deep(data(content, 'mapMetadata')); }
    shallow(providers);
    for (const slot of source.slots) { let value: unknown = slot.owner; values.push(slot.owner, ...slot.path); for (const key of slot.path) { values.push(value); if (value === absent || value === null || value === undefined) break; value = data(value, key); } deep(value); }
    return values;
  };
  source.observing = true;
  try {
    const before = snapshot();
    const assertUnchanged = (): void => {
      const after = snapshot();
      if (before.length !== after.length || before.some((value, index) => !Object.is(value, after[index]))) throw Error('field-move-facts-changed-during-observation');
    };
    // Each provider runs once. Closing immediately after its return also prevents an earlier
    // callback from changing one fact and a later callback restoring the initial native cells.
    const result = prepare(assertUnchanged); assertUnchanged(); return result;
  } finally { source.observing = false; }
}
