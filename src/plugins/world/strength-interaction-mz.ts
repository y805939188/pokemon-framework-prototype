/** Ordinary Strength input only; App/field host retain admission, writes and movement. */
import type { FieldMoveHostOperation } from '../../framework/app/field-move-operation';
import { hostRecord, invoke } from './host-access';
type Direction = 2 | 4 | 6 | 8;
const direction = (v: unknown): v is Direction => v === 2 || v === 4 || v === 6 || v === 8;
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
interface Source {
  readonly app: object; readonly generation: unknown; readonly flow: object; readonly content: unknown;
  readonly map: object; readonly mapId: number; readonly player: object; readonly scene: object;
  readonly x: number; readonly y: number; readonly direction: Direction;
  readonly event: object; readonly eventId: number; readonly name: string; readonly eventX: number; readonly eventY: number;
}
interface Request { readonly source: Source; readonly id: string; cancelled: boolean }
export function createStrengthInteractionMZ(root: Record<string, unknown>, diagnose: (reason: string) => void) {
  let current: Request | null = null, sequence = 0n, held: Source | null = null;
  const own = (raw: unknown, key: string): unknown => { const r = hostRecord(raw), d = r && Object.getOwnPropertyDescriptor(r, key); return d && 'value' in d ? d.value : undefined; };
  // Use current native slots: Reactor's events()/eventsXy() may be cached within this frame.
  function facing(map: object, x: number, y: number): { event: object; id: number; name: string } | null {
    const slots = own(map, '_events'); if (!Array.isArray(slots)) return null;
    for (const key of Object.keys(slots).filter(k => /^(0|[1-9]\d*)$/u.test(k)).sort((a, b) => Number(a) - Number(b))) {
      const event = hostRecord(own(slots, key)); if (!event || own(event, '_erased') !== false || invoke(event, 'pos', [x, y]) !== true
        || invoke(event, 'isNormalPriority') !== true || invoke(event, 'isJumping') !== false) continue;
      const id = invoke(event, 'eventId'), name = hostRecord(invoke(event, 'event'))?.name;
      if (!integer(id) || id <= 0 || own(slots, String(id)) !== event || typeof name !== 'string') return null;
      return name.toLowerCase().includes('strengthboulder') ? { event, id, name } : null;
    }
    return null;
  }
  function source(player: unknown, d: unknown): Source | null {
    if (player !== root.$gamePlayer || !direction(d) || !player || typeof player !== 'object' || current) return null;
    if (invoke(player, 'canMove') !== true || invoke(player, 'isMoving') !== false || invoke(player, 'isJumping') !== false || invoke(player, 'isInVehicle') !== false) return null;
    const map = hostRecord(root.$gameMap), scene = hostRecord(hostRecord(root.SceneManager)?._scene), C = root.Scene_Map;
    if (!map || !scene || typeof C !== 'function' || !(scene instanceof C) || invoke(scene, 'isActive') !== true
      || invoke(scene, 'isStarted') !== true || invoke(root.SceneManager, 'isSceneChanging') !== false || invoke(map, 'isEventRunning') !== false) return null;
    const x = hostRecord(player)?.x, y = hostRecord(player)?.y, mapId = invoke(map, 'mapId');
    if (!integer(x) || !integer(y) || !integer(mapId) || mapId <= 0) return null;
    const fx = invoke(map, 'roundXWithDirection', [x, d]), fy = invoke(map, 'roundYWithDirection', [y, d]);
    if (!integer(fx) || !integer(fy)) return null;
    const target = facing(map, fx, fy); if (!target) return null;
    const flow = hostRecord(root.PSFlow), app = hostRecord(invoke(flow, 'app'));
    if (!flow || !app || app.saveBlocked !== false) return null;
    return { app, generation: app.stateGeneration, flow, content: invoke(flow, 'content'), map, mapId, player, scene, x, y, direction: d,
      event: target.event, eventId: target.id, name: target.name, eventX: fx, eventY: fy };
  }
  function check(s: Source, moved = false): void {
    const app = hostRecord(s.app), flow = hostRecord(s.flow), scene = hostRecord(root.SceneManager)?._scene;
    if (root.PSFlow !== s.flow || flow?._app !== s.app || app?.stateGeneration !== s.generation || invoke(s.flow, 'content') !== s.content
      || root.$gameMap !== s.map || root.$gamePlayer !== s.player || scene !== s.scene || invoke(root.SceneManager, 'isSceneChanging') !== false
      || invoke(s.map, 'mapId') !== s.mapId || hostRecord(s.player)?.x !== s.x || hostRecord(s.player)?.y !== s.y || invoke(s.player, 'direction') !== s.direction
      || own(own(s.map, '_events'), String(s.eventId)) !== s.event || own(s.event, '_erased') !== false
      || hostRecord(invoke(s.event, 'event'))?.name !== s.name || invoke(s.event, 'isNormalPriority') !== true || invoke(s.event, 'isJumping') !== false) throw Error('strength-interaction-source-changed');
    const x = hostRecord(s.event)?.x, y = hostRecord(s.event)?.y;
    const toX = invoke(s.map, 'roundXWithDirection', [s.eventX, s.direction]), toY = invoke(s.map, 'roundYWithDirection', [s.eventY, s.direction]);
    if (!(x === s.eventX && y === s.eventY || moved && x === toX && y === toY)) throw Error('strength-interaction-target-moved');
    if (!moved && facing(s.map, s.eventX, s.eventY)?.event !== s.event) throw Error('strength-interaction-facing-changed');
  }
  function cancel(r: Request): void { if (!r.cancelled) { r.cancelled = true; invoke(r.source.app, 'cancelFieldMove', [r.id]); } }
  function begin(s: Source, push: boolean): boolean {
    check(s); const id = `mz-strength:${++sequence}`, r: Request = { source: s, id, cancelled: false }; current = r;
    try {
      const promise = invoke(s.app, 'runFieldMove', [id, push ? { kind: 'strength-push', playSound: true } : { kind: 'use', moveId: 'strength', entry: 'interaction' }]);
      if (!hostRecord(promise) || typeof hostRecord(promise)?.then !== 'function') throw Error('strength-interaction-promise-unavailable');
      const admitted = invoke(s.app, 'fieldMovePending', [id]) === true;
      void Promise.resolve(promise).then(outcome => {
        if (current === r) current = null;
        const result = hostRecord(outcome); if (admitted && result?.status !== 'completed' && result?.status !== 'refused' && result?.status !== 'cancelled') diagnose(String(result?.reason ?? 'strength-interaction-failed'));
      }, error => { if (current === r) current = null; diagnose(String(error)); });
      if (!admitted) { if (current === r) current = null; return false; }
      held = s; return true;
    } catch (error) { cancel(r); if (current === r) current = null; throw error; }
  }
  const used = (s: Source): boolean => hostRecord(invoke(s.app, 'worldLocalState'))?.strengthUsed === true;
  function attempt(player: unknown, d: unknown, pushOnly: boolean): boolean {
    try {
      const s = source(player, d); if (!s) return false;
      const push = used(s); if (pushOnly && !push) return false;
      if (pushOnly && held !== null && held.direction === d && held.player === s.player && held.map === s.map && held.mapId === s.mapId && held.scene === s.scene
        && held.generation === s.generation && held.content === s.content && held.event === s.event && held.x === s.x && held.y === s.y) return true;
      invoke(player, 'setDirection', [d]); if (invoke(player, 'direction') !== d) return false;
      return begin(s, push);
    } catch (error) { diagnose(String(error)); return false; }
  }
  const p = hostRecord(hostRecord(root.Game_Player)?.prototype);
  const move = p?.executeMove, button = p?.triggerButtonAction, touch = p?.triggerTouchActionD2;
  if (p && typeof move === 'function') p.executeMove = function(this: unknown, ...args: unknown[]): unknown {
    return attempt(this, args[0], true) ? undefined : Reflect.apply(move, this, args);
  };
  if (p && typeof button === 'function') p.triggerButtonAction = function(this: unknown, ...args: unknown[]): unknown {
    if (this !== root.$gamePlayer) return Reflect.apply(button, this, args);
    return invoke(root.Input, 'isTriggered', ['ok']) === true && attempt(this, invoke(this, 'direction'), false) ? true : Reflect.apply(button, this, args);
  };
  if (p && typeof touch === 'function') p.triggerTouchActionD2 = function(this: unknown, ...args: unknown[]): unknown {
    if (this !== root.$gamePlayer) return Reflect.apply(touch, this, args);
    const x = hostRecord(this)?.x, y = hostRecord(this)?.y, d = invoke(this, 'direction'), map = root.$gameMap;
    const match = this === root.$gamePlayer && direction(d) && integer(x) && integer(y) && args[0] === invoke(map, 'roundXWithDirection', [x, d])
      && args[1] === invoke(map, 'roundYWithDirection', [y, d]) && invoke(root.$gameTemp, 'isDestinationValid') === true
      && invoke(root.$gameTemp, 'destinationX') === args[0] && invoke(root.$gameTemp, 'destinationY') === args[1];
    if (!match || !attempt(this, d, false)) return Reflect.apply(touch, this, args);
    invoke(root.$gameTemp, 'clearDestination'); return true;
  };
  return {
    pending: () => current !== null,
    guard(operation: FieldMoveHostOperation): FieldMoveHostOperation {
      const r = current; if (!r || invoke(r.source.app, 'fieldMovePending', [r.id]) !== true) return operation;
      let moved = false;
      const guard = (): void => { operation.assertCurrent(); check(r.source, moved); if (r.cancelled) throw Error('strength-interaction-cancelled'); };
      return { ...operation, assertCurrent: guard, applyStage: (stage, observation) => {
        guard(); const result = operation.applyStage(stage, observation); guard();
        if (stage.kind === 'commit' && stage.stats?.some(stat => stat.counter === 'strength_push_count')) moved = true;
        return result;
      } };
    },
    update(): void {
      if (held !== null) { const key = { 2: 'down', 4: 'left', 6: 'right', 8: 'up' }[held.direction]; if (invoke(root.Input, 'isPressed', [key]) !== true) held = null; }
      const r = current;
      if (r) { try { check(r.source, true); } catch { cancel(r); } }
    },
    stateReplaced(): void { const r = current; current = null; held = null; if (r) cancel(r); },
  };
}
