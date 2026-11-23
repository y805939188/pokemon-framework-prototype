import type { WorldFact } from '../../framework/rules/world-data';
import { hostRecord, invoke } from './host-access';

export interface IndependentMapData {
  readonly width: number;
  readonly height: number;
  readonly tilesetId: number;
  readonly data: readonly number[];
  readonly events: readonly unknown[];
}
export interface ConnectionPassageFacts { readonly direction0Passable: boolean; readonly characterBlocked: boolean }
export interface IndependentTargetTileFacts {
  readonly tiles: readonly number[]; readonly layeredTiles: readonly number[];
  readonly flags: readonly number[]; readonly characterBlocked: boolean;
}
const integer = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);
const natural = (n: unknown): n is number => integer(n) && n >= 0;
function isMapData(value: unknown): value is IndependentMapData {
  const raw = hostRecord(value);
  return !!raw && natural(raw.width) && natural(raw.height) && integer(raw.tilesetId) && raw.tilesetId > 0 &&
    Array.isArray(raw.data) && raw.data.length === raw.width * raw.height * 6 && raw.data.every(natural) && Array.isArray(raw.events);
}
export function independentMapData(value: unknown): IndependentMapData | null { return isMapData(value) ? value : null; }
function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`invalid:${label}`);
  return value;
}
function valueOf(root: Record<string, unknown>, owner: string, id: unknown): unknown {
  if (!integer(id) || id <= 0) throw new Error(`invalid:${owner}-id`);
  return invoke(root[owner], 'value', [id]);
}
function conditionsMet(root: Record<string, unknown>, value: unknown, mapId: number, eventId: number): boolean {
  const c = hostRecord(value);
  if (!c) throw new Error('invalid:event-conditions');
  for (const n of ['1', '2']) if (bool(c[`switch${n}Valid`], 'switch-valid') && !bool(valueOf(root, '$gameSwitches', c[`switch${n}Id`]), 'switch-value')) return false;
  if (bool(c.variableValid, 'variable-valid')) {
    const value = valueOf(root, '$gameVariables', c.variableId);
    if (typeof value !== 'number' || !Number.isFinite(value) || typeof c.variableValue !== 'number' || !Number.isFinite(c.variableValue)) throw new Error('invalid:variable-value');
    if (value < c.variableValue) return false;
  }
  if (bool(c.selfSwitchValid, 'self-switch-valid')) {
    if (typeof c.selfSwitchCh !== 'string' || !['A', 'B', 'C', 'D'].includes(c.selfSwitchCh)) throw new Error('invalid:self-switch-id');
    if (!bool(invoke(root.$gameSelfSwitches, 'value', [[mapId, eventId, c.selfSwitchCh]]), 'self-switch-value')) return false;
  }
  if (bool(c.itemValid, 'item-valid')) {
    if (!integer(c.itemId) || c.itemId <= 0 || !Array.isArray(root.$dataItems) || !root.$dataItems[c.itemId]) throw new Error('invalid:event-item');
    if (!bool(invoke(root.$gameParty, 'hasItem', [root.$dataItems[c.itemId]]), 'event-item-value')) return false;
  }
  if (bool(c.actorValid, 'actor-valid')) {
    if (!integer(c.actorId) || c.actorId <= 0) throw new Error('invalid:event-actor');
    const actor = invoke(root.$gameActors, 'actor', [c.actorId]), members = invoke(root.$gameParty, 'members');
    if (!Array.isArray(members)) throw new Error('invalid:party-members');
    if (!members.includes(actor)) return false;
  }
  return true;
}
function activePage(root: Record<string, unknown>, raw: unknown, mapId: number): { event: Record<string, unknown>; page: Record<string, unknown> } | null {
  const event = hostRecord(raw);
  if (!event || !integer(event.id) || event.id <= 0 || !integer(event.x) || !integer(event.y) || !Array.isArray(event.pages)) throw new Error('invalid:event-data');
  for (let i = event.pages.length - 1; i >= 0; i--) {
    const page = hostRecord(event.pages[i]);
    if (!page) throw new Error('invalid:event-page');
    if (conditionsMet(root, page.conditions, mapId, event.id)) return { event, page };
  }
  return null;
}

/** Independent target projection: never swaps $dataMap or constructs Game_Event against the current map. */
export function independentTargetTileFacts(rootValue: unknown, data: IndependentMapData, mapId: number, x: number, y: number, player: object): WorldFact<IndependentTargetTileFacts> {
  const root = hostRecord(rootValue);
  if (!root) return { status: 'unavailable', reason: 'root-unavailable' };
  try {
    const tilesets = root.$dataTilesets;
    if (!Array.isArray(tilesets)) return { status: 'unavailable', reason: 'tilesets-unavailable' };
    const flags = hostRecord(tilesets[data.tilesetId])?.flags;
    if (!Array.isArray(flags)) return { status: 'unavailable', reason: 'tileset-flags-unavailable' };
    const tiles: number[] = [];
    let characterBlocked = false;
    const current = root.$gameMap;
    if (invoke(current, 'mapId') === mapId) {
      const events = invoke(current, 'eventsXyNt', [x, y]);
      if (!Array.isArray(events)) throw new Error('invalid:runtime-events');
      for (const event of events) {
        if (event === player) continue;
        const tile = invoke(event, 'tileId');
        if (!natural(tile)) throw new Error('invalid:runtime-event-tile');
        if (bool(invoke(event, 'isNormalPriority'), 'event-priority')) characterBlocked = true;
        else if (bool(invoke(event, 'isTile'), 'event-is-tile')) tiles.push(tile);
      }
    } else {
      for (const raw of data.events) {
        if (raw === null) continue;
        const selected = activePage(root, raw, mapId);
        if (!selected || selected.event.x !== x || selected.event.y !== y) continue;
        const { page } = selected, image = hostRecord(page.image);
        if (!image || !natural(image.tileId) || !integer(page.priorityType) || page.priorityType < 0 || page.priorityType > 2) throw new Error('invalid:event-image-priority');
        if (bool(page.through, 'event-through')) continue;
        if (page.priorityType === 1) characterBlocked = true;
        else if (page.priorityType === 0 && image.tileId > 0) tiles.push(image.tileId);
      }
    }
    // Vehicles retain their own map identity and are not created/repositioned by a target query.
    for (const name of ['boat', 'ship']) {
      const vehicle = invoke(current, name), record = hostRecord(vehicle);
      if (!record) throw new Error('invalid:vehicle');
      if (record !== player && record._mapId === mapId && bool(invoke(vehicle, 'posNt', [x, y]), 'vehicle-position')) characterBlocked = true;
    }
    const layeredTiles: number[] = [];
    for (let z = 3; z >= 0; z--) layeredTiles.push(data.data[(z * data.height + y) * data.width + x]!);
    tiles.push(...layeredTiles);
    const capturedFlags: number[] = [];
    for (const tile of tiles) {
      const flag = flags[tile];
      if (!natural(tile) || !natural(flag)) return { status: 'invalid', reason: 'tile-flag-invalid' };
      capturedFlags[tile] = flag;
    }
    return { status: 'value', value: { tiles, layeredTiles, flags: capturedFlags, characterBlocked } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: reason.startsWith('invalid:') ? 'invalid' : 'unavailable', reason };
  }
}

/** Walking direction-zero check, kept separate from the configured native Surf collision mode. */
export function independentConnectionPassage(rootValue: unknown, data: IndependentMapData, mapId: number, x: number, y: number, player: object): WorldFact<ConnectionPassageFacts> {
  const fact = independentTargetTileFacts(rootValue, data, mapId, x, y, player);
  if (fact.status !== 'value') return fact;
  for (const tile of fact.value.tiles) {
    const flag = fact.value.flags[tile]!;
    if ((flag & 0x10) !== 0) continue;
    return { status: 'value', value: { direction0Passable: (flag & 0x0f) !== 0x0f, characterBlocked: fact.value.characterBlocked } };
  }
  return { status: 'value', value: { direction0Passable: false, characterBlocked: fact.value.characterBlocked } };
}
