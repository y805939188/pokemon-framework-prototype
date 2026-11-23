/** Qualification-time native facts footprint. It issues no movement/App permission. */
import type { CompanionRetainedMapFrameMZ, CompanionRetainedOwnCellMZ } from './event-companion-retained-map-mz';
export function captureCompanionRetainedMapMZ(root: object, mapId: number,
  points: readonly Readonly<{ x: number; y: number }>[], isProxy: (raw: unknown) => boolean): CompanionRetainedMapFrameMZ {
  const cells: CompanionRetainedOwnCellMZ[] = [], selected = new WeakMap<object, Set<string>>();
  const object = (raw: unknown): object => { if (!raw || typeof raw !== 'object' || isProxy(raw)) throw Error('companion-retained-source-object-required'); return raw; };
  const own = (raw: unknown, key: string): unknown => {
    const owner = object(raw), descriptor = Object.getOwnPropertyDescriptor(owner, key), prototype: unknown = Object.getPrototypeOf(owner);
    if (prototype !== null) object(prototype);
    if (descriptor && !('value' in descriptor)) throw Error('companion-retained-source-own-data-required');
    const value: unknown = descriptor?.value;
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || typeof value === 'number' && !Number.isFinite(value)) throw Error('companion-retained-source-value-invalid');
    if (value !== null && typeof value === 'object') object(value);
    let keys = selected.get(owner); if (!keys) { keys = new Set(); selected.set(owner, keys); }
    if (!keys.has(key)) { keys.add(key); cells.push(Object.freeze({ owner, prototype: prototype as object | null, key, present: !!descriptor, value: value as CompanionRetainedOwnCellMZ['value'] })); }
    return value;
  };
  const integer = (raw: unknown): number => { if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) throw Error('companion-retained-source-integer-invalid'); return raw; };
  const map = object(own(root, '$gameMap')), data = object(own(root, '$dataMap'));
  // These current-root slots are only used to capture. Transfer legitimately replaces them later.
  cells.length = 0;
  if (Object.getOwnPropertyDescriptor(map, '_mapId')?.value !== mapId) throw Error('companion-retained-source-map-changed');
  const width = integer(own(data, 'width')), height = integer(own(data, 'height')), tiles = object(own(data, 'data'));
  if (!width || !height || !Array.isArray(tiles) || own(tiles, 'length') !== width * height * 6) throw Error('companion-retained-source-geometry-invalid');
  const events = object(Object.getOwnPropertyDescriptor(map, '_events')?.value), tilesets = object(Object.getOwnPropertyDescriptor(root, '$dataTilesets')?.value);
  const tilesetId = integer(own(data, 'tilesetId')), tileset = object(Object.getOwnPropertyDescriptor(tilesets, String(tilesetId))?.value);
  const flags = object(own(tileset, 'flags')); if (!Array.isArray(events) || !Array.isArray(flags)) throw Error('companion-retained-source-arrays-invalid');
  own(events, 'length'); own(flags, 'length');
  const tileIds = new Set<number>();
  for (const key of Object.getOwnPropertyNames(events)) if (/^(0|[1-9]\d*)$/u.test(key)) {
    const raw = own(events, key); if (raw === null || raw === undefined) continue;
    const event = object(raw);
    for (const name of ['_eventId', '_mapId', '_x', '_y', '_through', '_characterName', '_tileId', '_priorityType', '_pageIndex', '_erased']) own(event, name);
    tileIds.add(integer(own(event, '_tileId')));
  }
  const positions = new Set<string>();
  for (const point of points) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = point.x + dx, y = point.y + dy;
    if (Number.isSafeInteger(x) && Number.isSafeInteger(y) && x >= 0 && y >= 0 && x < width && y < height) positions.add(`${x}/${y}`);
  }
  for (const point of positions) {
    const [x, y] = point.split('/').map(Number);
    for (let z = 3; z >= 0; z--) tileIds.add(integer(own(tiles, String((z * height + y!) * width + x!))));
  }
  for (const tile of tileIds) own(flags, String(tile));
  // Root/active map references change by design; selected old data/event/tile/flag cells do not.
  const captured = Object.freeze(cells.filter(cell => cell.owner !== root && cell.owner !== map));
  for (const cell of captured) {
    const d = Object.getOwnPropertyDescriptor(cell.owner, cell.key);
    if (Object.getPrototypeOf(cell.owner) !== cell.prototype || !!d !== cell.present || d && (!('value' in d) || d.value !== cell.value)) throw Error('companion-retained-source-changed-during-capture');
  }
  return Object.freeze({ mapId, data, events, flags, cells: captured });
}
