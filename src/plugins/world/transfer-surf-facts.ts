/** Target-only Surf facts. Native vehicle identity is never consulted or changed. */
import type { WorldFact } from '../../framework/rules/world-data';
import { hostRecord } from './host-access';
import { independentTargetTileFacts } from './transfer-map-facts';
import type { IndependentMapData } from './transfer-map-facts';
export interface SurfTerrainMeaning { readonly canSurf: boolean; readonly waterfall: boolean; readonly waterfallCrest: boolean }
export interface SurfConnectionPassageFacts { readonly surfingAllowed: boolean; readonly targetPassable: boolean; readonly characterBlocked: boolean }
export interface TransferSurfPorts {
  readonly passageMode: 'boat' | 'ship' | 'none';
  terrain(tag: number): WorldFact<SurfTerrainMeaning>;
}
export function independentSurfConnectionPassage(root: Record<string, unknown>, data: IndependentMapData, mapId: number, x: number, y: number, player: object, ports: TransferSurfPorts): WorldFact<SurfConnectionPassageFacts> {
  if (ports.passageMode !== 'boat' && ports.passageMode !== 'ship') return { status: 'unavailable', reason: 'surf-native-passage-not-configured' };
  const fact = independentTargetTileFacts(root, data, mapId, x, y, player);
  if (fact.status !== 'value') return fact;
  try {
    const native = hostRecord(hostRecord(root.Game_Map)?.prototype);
    const terrainMethod = native?.terrainTag, check = native?.checkPassage, passage = native?.[ports.passageMode === 'boat' ? 'isBoatPassable' : 'isShipPassable'];
    if (typeof terrainMethod !== 'function' || typeof check !== 'function' || typeof passage !== 'function') return { status: 'unavailable', reason: 'surf-native-method-unavailable' };
    // Bind actual MZ terrainTag/checkPassage/water methods to a closed view of THIS preload.
    // isBoatPassable/checkPassage and isShipPassable/checkPassage are explicit selectable tile
    // algorithms. They do not derive or write the player's native vehicle/business Surf state.
    const captured = fact.value;
    const view = { isValid: (tx: number, ty: number) => tx >= 0 && tx < data.width && ty >= 0 && ty < data.height,
      layeredTiles: () => [...captured.layeredTiles], allTiles: () => [...captured.tiles], tilesetFlags: () => [...captured.flags],
      checkPassage(tx: number, ty: number, bit: number): unknown { return Reflect.apply(check, view, [tx, ty, bit]); } };
    const tag: unknown = Reflect.apply(terrainMethod, view, [x, y]);
    if (typeof tag !== 'number' || !Number.isSafeInteger(tag) || tag < 0 || tag > 7) return { status: 'invalid', reason: 'surf-target-terrain-tag-invalid' };
    const terrain: unknown = ports.terrain(tag), meaning = hostRecord(terrain);
    if (!meaning || meaning.status !== 'value') {
      if (meaning?.status === 'invalid') return { status: 'invalid', reason: typeof meaning.reason === 'string' ? meaning.reason : 'surf-target-terrain-invalid' };
      return { status: 'unavailable', reason: typeof meaning?.reason === 'string' ? meaning.reason : 'surf-target-terrain-unavailable' };
    }
    const value = hostRecord(meaning.value);
    if (!value || ['canSurf', 'waterfall', 'waterfallCrest'].some(key => typeof value[key] !== 'boolean')) return { status: 'invalid', reason: 'surf-target-terrain-invalid' };
    const passable: unknown = Reflect.apply(passage, view, [x, y]);
    if (typeof passable !== 'boolean') return { status: 'invalid', reason: 'surf-native-passage-invalid' };
    return { status: 'value', value: { surfingAllowed: value.canSurf === true && value.waterfall === false && value.waterfallCrest === false,
      targetPassable: passable, characterBlocked: captured.characterBlocked } };
  } catch (error) { return { status: 'unavailable', reason: `surf-target-facts:${String(error)}` }; }
}
