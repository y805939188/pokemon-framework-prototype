import type { HostWorldFacts, WorldFact } from '../../framework/rules/world-state';
export interface MZWorldFactReaders { mapId(): unknown; hour(): unknown; cycling?: () => unknown; diving?: () => unknown }
/** Read the actual native player. A canonical query keeps its existing precedence;
 * otherwise boolean data cells use the same aliases/absence semantics as START.
 * This is a fact observation, never a movement permission or an atomic issuer. */
export function readNativeCyclingMZ(root: object, nativeIsProxy: (value: unknown) => boolean): boolean {
  type Cell = Readonly<{ owner: object; prototype: object | null; key: string; present: boolean; value: unknown }>;
  const cells: Cell[] = [];
  const object = (raw: unknown): object => {
    if (raw === null || typeof raw !== 'object' && typeof raw !== 'function' || nativeIsProxy(raw)) throw Error('cycling-native-object-unavailable');
    return raw as object;
  };
  const slot = (raw: unknown, key: string): Cell => {
    const owner = object(raw), descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (descriptor && !Object.hasOwn(descriptor, 'value')) throw Error(`cycling-native-data-required:${key}`);
    const cell = { owner, prototype: Object.getPrototypeOf(owner) as object | null, key, present: !!descriptor, value: descriptor?.value };
    cells.push(cell); return cell;
  };
  const lookup = (player: object, key: string): Cell | null => {
    for (let owner: object | null = player; owner; owner = Object.getPrototypeOf(owner) as object | null) {
      const cell = slot(owner, key); if (cell.present) return cell;
    }
    return null;
  };
  const player = object(slot(root, '$gamePlayer').value), canonical = lookup(player, 'isOnBicycle');
  let result: boolean;
  if (canonical && typeof canonical.value === 'function') {
    // This was already a supported native query. Do not treat unrelated cells or
    // getters as competing providers, or turn its hidden reads into START authority.
    const query = object(canonical.value);
    let actual: unknown;
    try { actual = Reflect.apply(query as (...args: unknown[]) => unknown, player, []); }
    catch { throw Error('cycling-native-query-failed'); }
    if (typeof actual !== 'boolean') throw Error('cycling-native-query-invalid');
    result = actual;
  } else {
    let flag: boolean | undefined;
    for (const cell of [canonical, ...['isCycling', '_bicycle', '_cycling'].map(key => lookup(player, key))]) {
      if (!cell) continue;
      if (typeof cell.value !== 'boolean') throw Error(`cycling-native-flag-invalid:${cell.key}`);
      if (flag !== undefined && flag !== cell.value) throw Error('cycling-native-flags-conflict');
      flag = cell.value;
    }
    result = flag ?? false;
  }
  // Recheck the root, effective cells, prototype links and absence/shadow cells
  // after the canonical query; a late replacement cannot return an old fact.
  for (const cell of cells) {
    const owner = object(cell.owner), descriptor = Object.getOwnPropertyDescriptor(owner, cell.key);
    if (Object.getPrototypeOf(owner) !== cell.prototype || !!descriptor !== cell.present ||
      descriptor && (!Object.hasOwn(descriptor, 'value') || !Object.is(descriptor.value, cell.value))) throw Error('cycling-native-source-changed');
  }
  return result;
}
function read<T>(reader: (() => unknown) | undefined, valid: (value: unknown) => value is T, fact: string): WorldFact<T> {
  if (!reader) return { status: 'unavailable', reason: `${fact}-provider-unavailable` };
  try { const value = reader(); return valid(value) ? { status: 'value', value } : { status: 'invalid', reason: `${fact}-invalid` }; }
  catch (error) { return { status: 'invalid', reason: `${fact}:${error instanceof Error ? error.message : String(error)}` }; }
}
export function readMZWorldFacts(readers: MZWorldFactReaders): HostWorldFacts {
  return {
    mapId: read(readers.mapId, (value): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0, 'map-id'),
    hour: read(readers.hour, (value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23, 'hour'),
    cycling: read(readers.cycling, (value): value is boolean => typeof value === 'boolean', 'cycling'),
    diving: read(readers.diving, (value): value is boolean => typeof value === 'boolean', 'diving'),
  };
}
