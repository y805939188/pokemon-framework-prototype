/** Actual Map updates, not a timer or Graphics counter, advance an owned field animation wait. */
import { hostRecord, invoke } from './host-access';
interface FrameLocation { readonly manager: object; readonly scene: object; readonly map: object; readonly player: object; readonly mapId: number }
interface Waiter { readonly location: FrameLocation; readonly serial: number; readonly guard: () => void; resolve(): void; reject(error: unknown): void }
export function createFieldMoveFramesMZ(root: Record<string, unknown>) {
  const mapClass = root.Scene_Map, prototype = hostRecord(hostRecord(mapClass)?.prototype);
  if (typeof mapClass !== 'function' || !prototype) throw Error('field-frame-map-unavailable');
  const serials = new WeakMap<object, number>(), updating = new WeakMap<object, number>(), waits = new Set<Waiter>();
  let installed = false;
  const object = (value: unknown): object => { const record = hostRecord(value); if (!record) throw Error('field-frame-world-unavailable'); return record; };
  const location = (): FrameLocation => {
    const manager = object(root.SceneManager), scene = object(hostRecord(manager)?._scene), map = object(root.$gameMap), player = object(root.$gamePlayer);
    const mapId = invoke(map, 'mapId');
    if (!(scene instanceof mapClass) || invoke(scene, 'isStarted') !== true || invoke(manager, 'isSceneChanging') !== false ||
      typeof mapId !== 'number' || !Number.isSafeInteger(mapId) || mapId <= 0) throw Error('field-frame-map-not-ready');
    return { manager, scene, map, player, mapId };
  };
  const same = (left: FrameLocation, right: FrameLocation): boolean => left.manager === right.manager && left.scene === right.scene &&
    left.map === right.map && left.player === right.player && left.mapId === right.mapId;
  const reject = (wait: Waiter, error: unknown): void => { if (waits.delete(wait)) wait.reject(error); };
  return {
    install(): void {
      if (installed) return;
      const original = prototype.update;
      if (typeof original !== 'function') throw Error('field-frame-native-update-unavailable');
      prototype.update = function(this: object, ...args: unknown[]): unknown {
        let result: unknown;
        updating.set(this, (updating.get(this) ?? 0) + 1);
        try { result = Reflect.apply(original, this, args); }
        catch (error) { for (const wait of [...waits]) if (wait.location.scene === this) reject(wait, error); throw error; }
        finally { updating.set(this, (updating.get(this) ?? 1) - 1); }
        serials.set(this, (serials.get(this) ?? 0) + 1);
        return result;
      };
      installed = true;
    },
    nextFrame(guard: () => void): Promise<void> {
      return new Promise<void>((resolve, failed) => {
        try {
          if (!installed) throw Error('field-frame-not-installed');
          guard(); const before = location(); guard();
          if (!same(before, location())) throw Error('field-frame-world-changed');
          // A request made inside Map.update waits past that in-flight update as well.
          waits.add({ location: before, serial: (serials.get(before.scene) ?? 0) + (updating.get(before.scene) ?? 0), guard, resolve, reject: failed });
        } catch (error) { failed(error); }
      });
    },
    /** Called after the actual SceneManager update, including ticks that only observe cancellation. */
    update(): void {
      for (const wait of [...waits]) {
        try {
          wait.guard(); const now = location();
          if (!same(wait.location, now)) throw Error('field-frame-world-changed');
          if ((serials.get(now.scene) ?? 0) <= wait.serial) continue;
          wait.guard();
          if (!same(now, location())) throw Error('field-frame-world-changed');
          if (waits.delete(wait)) wait.resolve();
        } catch (error) { reject(wait, error); }
      }
    },
    cancel(reason = 'field-frame-cancelled'): void { for (const wait of [...waits]) reject(wait, Error(reason)); },
    pending(): number { return waits.size; },
  };
}
