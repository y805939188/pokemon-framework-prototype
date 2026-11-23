/** Native movement adapter. Framework Surf authority and native vehicles keep separate ownership. */
import type { WorldFact, WorldPoint } from '../../framework/rules/world-data';
import type { FieldMoveFacingTerrain } from '../../framework/rules/field-moves';
import type { FieldMovePassageInput } from './field-move-host';
import type { MZTerrainMeanings } from './runtime-inputs-mz';
import { configuredSurfTerrain } from './configured-transfer-mz';
import type { SurfPassageMode } from './configured-transfer-mz';
import { independentMapData, independentTargetTileFacts } from './transfer-map-facts';
import type { IndependentMapData } from './transfer-map-facts';
import { independentSurfConnectionPassage } from './transfer-surf-facts';
import { hostRecord, invoke } from './host-access';
export interface SurfMovementAuthority { readonly surfing: boolean; readonly endingSurf: boolean }
export function createSurfPassageMZ(root: Record<string, unknown>, meanings: MZTerrainMeanings, passageMode: SurfPassageMode,
  authority: () => WorldFact<SurfMovementAuthority>, diagnose: (reason: string) => void) {
  let cached: { readonly raw: object; readonly tiles: unknown; readonly width: unknown; readonly height: unknown; readonly data: IndependentMapData } | null = null;
  const observed = <T>(read: () => T): WorldFact<T> => { try { return { status: 'value', value: read() }; } catch (error) { return { status: 'unavailable', reason: String(error) }; } };
  const number = (value: unknown, label: string): number => { if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw Error(`surf-movement-invalid:${label}`); return value; };
  const boolean = (value: unknown, label: string): boolean => { if (typeof value !== 'boolean') throw Error(`surf-movement-invalid:${label}`); return value; };
  const snapshot = () => {
    const map = hostRecord(root.$gameMap), player = hostRecord(root.$gamePlayer), raw = hostRecord(root.$dataMap);
    if (!map || !player || !raw) throw Error('surf-movement-world-unavailable');
    const mapId = number(invoke(map, 'mapId'), 'mapId');
    if (!cached || cached.raw !== raw || cached.tiles !== raw.data || cached.width !== raw.width || cached.height !== raw.height) {
      const data = independentMapData(raw); if (!data) throw Error('surf-movement-map-invalid');
      cached = { raw, tiles: raw.data, width: raw.width, height: raw.height, data };
    }
    const tilesetId = number(invoke(map, 'tilesetId'), 'tilesetId');
    const data = { ...cached.data, tilesetId };
    const current = (): void => { if (root.$gameMap !== map || root.$gamePlayer !== player || root.$dataMap !== raw || invoke(map, 'mapId') !== mapId || invoke(map, 'tilesetId') !== tilesetId) throw Error('surf-movement-world-changed'); };
    return { map, player, data, mapId, current };
  };
  const terrainAt = (point: WorldPoint): WorldFact<FieldMoveFacingTerrain> => observed(() => {
    const s = snapshot(); if (point.mapId !== s.mapId || !boolean(invoke(s.map, 'isValid', [point.x, point.y]), 'point')) throw Error('surf-terrain-other-map-or-outside');
    const tag = number(invoke(s.map, 'terrainTag', [point.x, point.y]), 'terrain'); s.current();
    const fact = configuredSurfTerrain(meanings, tag); if (fact.status !== 'value') throw Error('reason' in fact ? fact.reason : 'surf-terrain-unavailable');
    return fact.value;
  });
  const nativeFoot = (s: ReturnType<typeof snapshot>, point: WorldPoint, direction: number): boolean => {
    const fact = independentTargetTileFacts(root, s.data, s.mapId, point.x, point.y, s.player);
    if (fact.status !== 'value') throw Error('reason' in fact ? fact.reason : 'surf-foot-facts-unavailable');
    const native = hostRecord(hostRecord(root.Game_Map)?.prototype), check = native?.checkPassage, pass = native?.isPassable;
    if (typeof check !== 'function' || typeof pass !== 'function') throw Error('surf-native-foot-unavailable');
    const view = { tilesetFlags: () => fact.value.flags, allTiles: () => fact.value.tiles,
      checkPassage(x: number, y: number, bit: number): unknown { return Reflect.apply(check, view, [x, y, bit]); } };
    const result = boolean(Reflect.apply(pass, view, [point.x, point.y, direction]), 'foot-passage'); s.current(); return result;
  };
  const transitionPassage = (input: FieldMovePassageInput): WorldFact<boolean> => observed(() => {
    const s = snapshot(); if (s.map !== input.map || s.player !== input.player || s.mapId !== input.to.mapId || s.mapId !== input.from.mapId) throw Error('surf-transition-world-changed');
    if (passageMode === 'none') throw Error('surf-native-passage-not-configured');
    const from = terrainAt(input.from), to = terrainAt(input.to);
    if (from.status !== 'value' || to.status !== 'value') throw Error('surf-transition-terrain-unavailable');
    const collide = boolean(invoke(s.player, 'isCollidedWithCharacters', [input.to.x, input.to.y]), 'character-collision'); s.current();
    if (collide) return false;
    if (to.value.canSurf) {
      const water = independentSurfConnectionPassage(root, s.data, s.mapId, input.to.x, input.to.y, s.player,
        { passageMode, terrain: tag => configuredSurfTerrain(meanings, tag) }); s.current();
      if (water.status !== 'value') throw Error('reason' in water ? water.reason : 'surf-water-facts-unavailable');
      return water.value.surfingAllowed && water.value.targetPassable && !water.value.characterBlocked &&
        (from.value.canSurf || nativeFoot(s, input.from, input.direction));
    }
    // Dedicated landing transition: test the actual shore's incoming foot edge, not a walking edge on the water source.
    return nativeFoot(s, input.to, 10 - input.direction);
  });
  let installed = false, previousReason = '';
  return {
    terrain: terrainAt,
    transitionPassage,
    install(): void {
      if (installed) return;
      const prototype = hostRecord(hostRecord(root.Game_Player)?.prototype), native = prototype?.isMapPassable;
      if (!prototype || typeof native !== 'function') throw Error('surf-native-player-passage-unavailable');
      prototype.isMapPassable = function(this: unknown, x: unknown, y: unknown, direction: unknown): unknown {
        if (this !== root.$gamePlayer) return Reflect.apply(native, this, [x, y, direction]);
        const fact = authority();
        if (fact.status !== 'value') { const reason = 'reason' in fact ? fact.reason ?? 'surf-authority-unavailable' : 'surf-authority-unavailable'; if (previousReason !== reason) diagnose(reason); previousReason = reason; return false; }
        if (!fact.value.surfing) return Reflect.apply(native, this, [x, y, direction]);
        // Preserve native boat/ship/airship and custom vehicle behavior. They never imply business Surf.
        if (boolean(invoke(this, 'isInVehicle'), 'native-vehicle')) return Reflect.apply(native, this, [x, y, direction]);
        const result = observed(() => {
          const s = snapshot(), d = number(direction, 'direction'), from = { mapId: s.mapId, x: number(x, 'x'), y: number(y, 'y') };
          if (![2, 4, 6, 8].includes(d)) throw Error('surf-movement-direction-invalid');
          const to = { mapId: s.mapId, x: number(invoke(s.map, 'roundXWithDirection', [from.x, d]), 'target-x'), y: number(invoke(s.map, 'roundYWithDirection', [from.y, d]), 'target-y') };
          if (!boolean(invoke(s.map, 'isValid', [to.x, to.y]), 'target-valid')) return false;
          if (passageMode === 'none') throw Error('surf-native-passage-not-configured');
          if (fact.value.endingSurf) {
            const fromTerrain = terrainAt(from), toTerrain = terrainAt(to); if (fromTerrain.status !== 'value' || toTerrain.status !== 'value') throw Error('ending-surf-terrain-unavailable');
            return Reflect.apply(native, this, [x, y, direction]);
          }
          const water = independentSurfConnectionPassage(root, s.data, s.mapId, to.x, to.y, s.player, { passageMode, terrain: tag => configuredSurfTerrain(meanings, tag) }); s.current();
          if (water.status !== 'value') throw Error('reason' in water ? water.reason : 'surf-water-facts-unavailable');
          return water.value.surfingAllowed && water.value.targetPassable && !water.value.characterBlocked;
        });
        if (result.status === 'value') { previousReason = ''; return result.value; }
        const reason = 'reason' in result ? result.reason ?? 'surf-movement-unavailable' : 'surf-movement-unavailable'; if (previousReason !== reason) diagnose(reason); previousReason = reason; return false;
      };
      installed = true;
    },
  };
}
