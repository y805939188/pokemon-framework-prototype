/** E2 MZ leaf. App owns the operation, all rule writes, encounter admission and RNG.
 * No hooks, world lock or transfer wrapper are installed here. Missing presentation resources fail explicitly.
 */
import { planStrengthPush, planStrengthPushCompletion, qualifySurfLanding, planSurfLandingCompletion, planSurfStepCleanup } from '../../framework/rules/field-moves';
import type { FieldMoveFacts, FieldMoveFacingEvent, FieldMoveFacingTerrain, FieldMovePlan, FieldMoveStage, LocalFieldMoveId } from '../../framework/rules/field-moves';
import type { WorldDirection, WorldFact, WorldPoint } from '../../framework/rules/world-data';
import type { WorldMapMetadata } from '../../framework/rules/world-state';
import { hostRecord, invoke } from './host-access';
import { observeFieldFacts, readFieldFactOwnData } from './field-facts-observation-mz';
import type { FieldFactsObservation } from './field-facts-observation-mz';

type AppStage = Exclude<FieldMoveStage, { readonly kind: 'host' }>;
type RecordStage = Extract<FieldMoveStage, { readonly kind: 'host'; readonly action: 'erase-event' | 'register-erasure' | 'record-event-position' | 'wait-event-movement' }>;
export interface FieldMoveHostAck { readonly status: 'completed' }
export interface FieldMoveEventPosition extends WorldPoint { readonly eventId: number; readonly direction: WorldDirection; readonly through: boolean }
export type FieldMoveHostObservation = { readonly kind: 'erased-event'; readonly target: FieldMoveFacingEvent }
  | { readonly kind: 'event-position'; readonly position: FieldMoveEventPosition };
export interface FieldMoveSurfRuntime {
  readonly surfing: boolean;
  readonly endingSurf: boolean;
  readonly surfBase: WorldPoint | null;
}
export interface FieldMoveHostOperation {
  recordSurfLandingCompletion?(receipt: unknown): void;
  recordSurfLandingFailure?(receipt: unknown, reason: string): void;
  /** Verifies the same App-private owner, generation, current phase and relevant state/content revisions. */
  assertCurrent(): void;
  /** The sole guarded writer. A completed ACK means the stage was installed, never merely queued. */
  applyStage(stage: AppStage | RecordStage, observation?: FieldMoveHostObservation): FieldMoveHostAck | Promise<FieldMoveHostAck>;
  surfRuntime?(): FieldMoveSurfRuntime;
  localRecordsAvailable?(): WorldFact<boolean>;
}
export interface FieldMoveDarkMask {
  readonly mapId: number;
  valid(): boolean;
  expand(assertCurrent: () => void): void | Promise<void>;
  expanded(): boolean;
}
export interface FieldMoveSound { readonly name: string; readonly volume: number; readonly pitch: number; readonly pan: number }
export interface FieldMoveRedScreen { readonly color: readonly [number, number, number, number]; readonly durationFrames: number }
export interface FieldMovePassageInput {
  readonly map: object; readonly player: object; readonly from: WorldPoint; readonly to: WorldPoint; readonly direction: WorldDirection;
}
export interface FieldMoveStrictTileInput {
  readonly point: WorldPoint; readonly tileId: number; readonly terrainTag: number;
}
export interface FieldMoveHostPorts {
  /** Issued native read set, including every mutable backing cell of custom fact providers. */
  factsObservation?: FieldFactsObservation;
  metadata?(mapId: number): WorldFact<Readonly<Pick<WorldMapMetadata, 'darkMap' | 'alwaysBicycle'>>>;
  terrain?(point: WorldPoint): WorldFact<FieldMoveFacingTerrain>;
  /** Surf-specific movement capability; raw native foot passage is not an equivalent water-entry check. */
  surfPassage?(input: FieldMovePassageInput): WorldFact<boolean>;
  /** Per-tile capability, not the first tag at this coordinate. With no mapping, native MZ tags 0..7
   * have no ignore capability. Never infer Neutral from a tag number; configured provider errors stay errors. */
  strictTileTerrain?(input: FieldMoveStrictTileInput): WorldFact<{ readonly ignorePassability: boolean }>;
  darkMask?(): WorldFact<FieldMoveDarkMask>;
  sound?(sound: 'cut' | 'rock-smash' | 'strength-push'): WorldFact<FieldMoveSound>;
  redScreen?(): WorldFact<FieldMoveRedScreen>;
  /** Completion, not request submission. False is the pure plan's optional-animation fallback. */
  animate?(moveId: LocalFieldMoveId, memberId: string | null, assertCurrent: () => void): boolean | Promise<boolean>;
  text?(kind: 'used-move' | 'flash' | 'confirm-direct', moveId: LocalFieldMoveId, assertCurrent: () => void): boolean | Promise<boolean>;
  /** Projects custom bicycle/Surf appearance and passage from App authority; no second business flag. */
  projectSurfing?(surfing: boolean, player: object, assertCurrent: () => void): FieldMoveHostAck | Promise<FieldMoveHostAck>;
  cancelVehicles?(player: object, assertCurrent: () => void): FieldMoveHostAck | Promise<FieldMoveHostAck>;
  /** One actual map/render update. App cancellation must continue to settle this wait. */
  nextFrame?(assertCurrent: () => void): void | Promise<void>;
  /** Production actual capability jump; legacy leaf hosts keep the direct native path. */
  nativeJump?(player: object, x: number, y: number): unknown;
}
export type FieldMoveHostResult = { readonly status: 'completed'; readonly completedStages: number; readonly effectSuccess: true | null; readonly outcome: FieldMovePlan['outcome'] }
  | { readonly status: 'cancelled' | 'failed' | 'unavailable' | 'invalid' | 'refused'; readonly reason: string; readonly completedStages: number };
/** A failed landing jump hands control back to ordinary movement, without claiming a completed ability. */
export type FieldMoveLandingResult = FieldMoveHostResult | { readonly status: 'not-landed'; readonly completedStages: 0; readonly reason: string };
type HostFailureStatus = Exclude<FieldMoveHostResult['status'], 'completed'>;
class HostFailure extends Error {
  readonly status: HostFailureStatus;
  constructor(status: HostFailureStatus, reason: string) { super(reason); this.status = status; }
}
const fail = (reason: string, status: HostFailureStatus = 'invalid'): never => { throw new HostFailure(status, reason); };
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const positive = (value: unknown): value is number => integer(value) && value > 0;
const direction = (value: unknown): value is WorldDirection => value === 2 || value === 4 || value === 6 || value === 8;
const boolean = (value: unknown): value is boolean => typeof value === 'boolean';
const point = (value: unknown): value is WorldPoint => {
  return data(value) && positive(value.mapId) && integer(value.x) && value.x >= 0 && integer(value.y) && value.y >= 0;
};
function data(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null) && Reflect.ownKeys(value).every(key => {
    const d = Object.getOwnPropertyDescriptor(value, key); return typeof key === 'string' && !!d && d.enumerable && 'value' in d;
  });
}
/** Providers are typed, but the real MZ/third-party boundary remains unknown and checked at runtime. */
function fact<T>(provider: (() => unknown) | undefined, valid: (value: unknown) => value is T, name: string): WorldFact<T> {
  if (!provider) return { status: 'unavailable', reason: `${name}-provider-unavailable` };
  try {
    const f = provider();
    if (!data(f)) return { status: 'invalid', reason: `${name}-invalid-fact` };
    if (f.status === 'absent') return { status: 'absent' };
    if (f.status === 'unavailable' || f.status === 'invalid') {
      if (f.reason !== undefined && typeof f.reason !== 'string') return { status: 'invalid', reason: `${name}-invalid-reason` };
      return { status: f.status, ...(typeof f.reason === 'string' ? { reason: f.reason } : {}) };
    }
    return f.status === 'value' && valid(f.value) ? { status: 'value', value: f.value } : { status: 'invalid', reason: `${name}-invalid-value` };
  } catch (error) { return { status: 'invalid', reason: `${name}:${error instanceof Error ? error.message : String(error)}` }; }
}
function observed<T>(read: () => T, name: string): WorldFact<T> {
  try { return { status: 'value', value: read() }; }
  catch (error) {
    if (error instanceof HostFailure && error.message === 'field-move-facing-outside-map') return { status: 'absent' };
    return { status: error instanceof HostFailure && error.status === 'unavailable' ? 'unavailable' : 'invalid', reason: `${name}:${error instanceof Error ? error.message : String(error)}` };
  }
}
function required<T>(value: WorldFact<T>, name: string): T {
  if (value.status === 'value') return value.value;
  if (value.status === 'absent') return fail(`${name}-absent`, 'unavailable');
  return fail(value.reason ?? `${name}-${value.status}`, value.status);
}
function method(owner: unknown, name: string, args: readonly unknown[] = []): unknown {
  if (typeof hostRecord(owner)?.[name] !== 'function') return fail(`field-move-method-unavailable:${name}`, 'unavailable');
  return invoke(owner, name, args);
}
function flag(owner: unknown, name: string, args: readonly unknown[] = []): boolean {
  const result = method(owner, name, args); return boolean(result) ? result : fail(`field-move-invalid-boolean:${name}`);
}
function coordinate(owner: unknown, key: 'x' | 'y'): number {
  const n = hostRecord(owner)?.[key]; return integer(n) && n >= 0 ? n : fail(`field-move-invalid-coordinate:${key}`);
}
function dir(owner: unknown): WorldDirection {
  const result = method(owner, 'direction'); return direction(result) ? result : fail('field-move-invalid-direction');
}
const terrainData = (value: unknown): value is FieldMoveFacingTerrain => data(value) && boolean(value.canSurf) && boolean(value.waterfall) && boolean(value.waterfallCrest);
const metadataData = (value: unknown): value is Readonly<Pick<WorldMapMetadata, 'darkMap' | 'alwaysBicycle'>> => data(value)
  && (!Object.hasOwn(value, 'darkMap') || boolean(value.darkMap)) && (!Object.hasOwn(value, 'alwaysBicycle') || boolean(value.alwaysBicycle));
const maskData = (value: unknown): value is FieldMoveDarkMask => {
  const r = hostRecord(value); return !!r && positive(r.mapId) && ['valid', 'expand', 'expanded'].every(key => typeof r[key] === 'function');
};
const soundData = (value: unknown): value is FieldMoveSound => data(value) && typeof value.name === 'string' && value.name.length > 0
  && !value.name.includes('\0') && !value.name.includes('\\') && !value.name.includes(':') && !value.name.startsWith('/')
  && value.name.split('/').every(part => part !== '' && part !== '.' && part !== '..')
  && typeof value.volume === 'number' && Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 100
  && typeof value.pitch === 'number' && Number.isFinite(value.pitch) && value.pitch >= 50 && value.pitch <= 150
  && typeof value.pan === 'number' && Number.isFinite(value.pan) && value.pan >= -100 && value.pan <= 100;
const redData = (value: unknown): value is FieldMoveRedScreen => data(value) && Array.isArray(value.color) && value.color.length === 4
  && value.color.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 255)
  && value.color[0] > 0 && value.color[1] === 0 && value.color[2] === 0 && value.color[3] > 0 && positive(value.durationFrames);
function ack(value: unknown, name: string): void { if (!data(value) || value.status !== 'completed') fail(`${name}-completion-not-acknowledged`, 'failed'); }
interface Snapshot { readonly map: object; readonly player: object; readonly mapId: number }
interface BoundEvent { readonly event: object; readonly name: string; x: number; y: number }
interface RunScope { readonly snapshot: Snapshot; playerPoint: WorldPoint; readonly check: () => void; readonly events: Map<number, BoundEvent>; readonly masks: Map<number, FieldMoveDarkMask> }

export function createFieldMoveHost(rootValue: unknown, ports: FieldMoveHostPorts, copyData: <T>(value: T) => T = value => value) {
  const root = hostRecord(rootValue);
  if (!root) throw new Error('field-move-root-unavailable');
  function snapshot(): Snapshot {
    const map = hostRecord(root!.$gameMap), player = hostRecord(root!.$gamePlayer);
    if (!map || !player) return fail('field-move-map-player-unavailable', 'unavailable');
    const mapId = method(map, 'mapId');
    if (!positive(mapId)) return fail('field-move-map-id-invalid');
    if (!flag(map, 'isValid', [coordinate(player, 'x'), coordinate(player, 'y')])) return fail('field-move-player-outside-map');
    return { map, player, mapId };
  }
  function location(s: Snapshot, character: object = s.player): WorldPoint { return { mapId: s.mapId, x: coordinate(character, 'x'), y: coordinate(character, 'y') }; }
  function forward(s: Snapshot, character: object = s.player, d: WorldDirection = dir(character)): WorldPoint {
    const from = location(s, character);
    const x = method(s.map, 'roundXWithDirection', [from.x, d]), y = method(s.map, 'roundYWithDirection', [from.y, d]);
    if (!integer(x) || !integer(y) || !flag(s.map, 'isValid', [x, y])) return fail('field-move-facing-outside-map', 'refused');
    return { mapId: s.mapId, x, y };
  }
  function facingEvent(s: Snapshot): WorldFact<FieldMoveFacingEvent> {
    const found = observed(() => {
      const own = (owner: unknown, key: string): unknown => readFieldFactOwnData(ports.factsObservation, root!, owner, key);
      const p = forward(s), events = own(s.map, '_events');
      if (!Array.isArray(events)) return fail('field-move-events-invalid');
      const length = own(events, 'length'); if (!integer(length) || length < 0) return fail('field-move-events-invalid');
      // Reactor.events()/eventsXy() can still return a previous list within this same frame.
      // Read exactly the current native slots captured by the observer; leave the engine cache intact.
      const keys = Object.getOwnPropertyNames(events).filter(key => /^(0|[1-9]\d*)$/u.test(key) && Number(key) < length).sort((a, b) => Number(a) - Number(b));
      for (const key of keys) {
        const item = own(events, key); if (item === null || item === undefined) continue;
        const event = hostRecord(item); if (!event) return fail('field-move-event-invalid');
        const erased = own(event, '_erased');
        if (!flag(event, 'pos', [p.x, p.y])) continue;
        if (!boolean(erased)) return fail('field-move-event-erased-flag-invalid');
        if (erased === true || !flag(event, 'isNormalPriority') || flag(event, 'isJumping')) continue;
        const id = method(event, 'eventId'), source = hostRecord(method(event, 'event'));
        if (!positive(id) || own(events, String(id)) !== event || typeof source?.name !== 'string') return fail('field-move-event-identity-invalid');
        return { mapId: s.mapId, eventId: id, name: source.name, jumping: false, overTrigger: false };
      }
      return null;
    }, 'facing-event');
    return found.status === 'value' ? found.value === null ? { status: 'absent' } : { status: 'value', value: found.value } : found;
  }
  function mask(s: Snapshot): WorldFact<FieldMoveDarkMask> {
    const m = fact(ports.darkMask ? () => ports.darkMask!() : undefined, maskData, 'dark-mask');
    if (m.status !== 'value') return m;
    if (m.value.mapId !== s.mapId) return { status: 'invalid', reason: 'dark-mask-wrong-map' };
    return m;
  }
  function facts(): FieldMoveFacts {
    try { return observeFieldFacts(ports.factsObservation, root!, ports, check => readFacts(check)); }
    catch (error) { const failed: WorldFact<never> = { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) }; return { mapMetadata: failed, facingEvent: failed, facingTerrain: failed, facingPassable: failed, facingPoint: failed, direction: failed, flashMask: failed }; }
  }
  function readFacts(check: () => void): FieldMoveFacts {
    const closed = <T>(read: () => T): T => { const result = read(); check(); return result; };
    const current = closed(() => observed(snapshot, 'current-map'));
    if (current.status !== 'value') return { mapMetadata: current, facingEvent: current, facingTerrain: current, facingPassable: current, facingPoint: current, direction: current, flashMask: current };
    const s = current.value, to = closed(() => observed(() => forward(s), 'facing-point')), d = closed(() => observed(() => dir(s.player), 'direction')), m = closed(() => mask(s));
    const maskFact: WorldFact<boolean> = m.status === 'value' ? closed(() => observed(() => flag(m.value, 'valid'), 'dark-mask-valid')) : m;
    return {
      mapMetadata: closed(() => fact(ports.metadata ? () => ports.metadata!(s.mapId) : undefined, metadataData, 'map-metadata')),
      facingEvent: closed(() => facingEvent(s)), facingPoint: to, direction: d, flashMask: maskFact,
      facingTerrain: to.status === 'value' ? closed(() => fact(ports.terrain ? () => ports.terrain!(to.value) : undefined, terrainData, 'facing-terrain')) : to,
      facingPassable: to.status === 'value' && d.status === 'value'
        ? closed(() => fact(ports.surfPassage ? () => ports.surfPassage!({ map: s.map, player: s.player, from: location(s), to: to.value, direction: d.value }) : undefined, boolean, 'surf-passage'))
        : to.status !== 'value' ? to : d as Exclude<typeof d, { status: 'value' }>,
    };
  }
  function scope(operation: FieldMoveHostOperation): RunScope {
    const s = snapshot(), events: RunScope['events'] = new Map();
    const result: RunScope = { snapshot: s, playerPoint: location(s), check: () => check(), events, masks: new Map() };
    const check = (): void => {
      try { operation.assertCurrent(); } catch (error) { fail(error instanceof Error ? error.message : String(error), 'cancelled'); }
      if (root!.$gameMap !== s.map || root!.$gamePlayer !== s.player || method(s.map, 'mapId') !== s.mapId) fail('field-move-host-replaced', 'cancelled');
      if (coordinate(s.player, 'x') !== result.playerPoint.x || coordinate(s.player, 'y') !== result.playerPoint.y) fail('field-move-player-moved', 'cancelled');
      for (const [id, bound] of events) {
        if (method(s.map, 'event', [id]) !== bound.event || hostRecord(method(bound.event, 'event'))?.name !== bound.name) fail('field-move-event-replaced', 'cancelled');
        if (coordinate(bound.event, 'x') !== bound.x || coordinate(bound.event, 'y') !== bound.y) fail('field-move-event-moved', 'cancelled');
      }
    };
    check(); return result;
  }
  function target(s: RunScope, t: FieldMoveFacingEvent): object {
    s.check();
    if (t.mapId !== s.snapshot.mapId) return fail('field-move-event-wrong-map', 'cancelled');
    const e = hostRecord(method(s.snapshot.map, 'event', [t.eventId]));
    if (!e || method(e, 'eventId') !== t.eventId || hostRecord(method(e, 'event'))?.name !== t.name) return fail('field-move-event-changed', 'cancelled');
    const bound = s.events.get(t.eventId);
    if (bound && bound.event !== e) return fail('field-move-event-replaced', 'cancelled');
    if (!bound) s.events.set(t.eventId, { event: e, name: t.name, x: coordinate(e, 'x'), y: coordinate(e, 'y') });
    return e;
  }
  function bind(s: RunScope, plan: FieldMovePlan): void {
    for (const stage of plan.steps) if (stage.kind === 'host' && 'target' in stage) target(s, stage.target);
    if (plan.steps.some(stage => stage.kind === 'host' && stage.action === 'expand-flash-mask')) {
      const m = required(mask(s.snapshot), 'dark-mask');
      if (!flag(m, 'valid')) fail('flash-mask-required', 'refused');
      s.masks.set(s.snapshot.mapId, m);
    }
    s.check();
  }
  async function next(s: RunScope): Promise<void> {
    s.check(); if (!ports.nextFrame) fail('field-move-next-frame-unavailable', 'unavailable');
    await ports.nextFrame!(s.check); s.check();
  }
  async function waitMotion(s: RunScope, character: object): Promise<void> {
    while (flag(character, 'isMoving') || flag(character, 'isJumping')) await next(s);
    s.check();
  }
  async function jump(s: RunScope, d: WorldDirection): Promise<boolean> {
    s.check(); const { player } = s.snapshot;
    if (flag(player, 'isMoving') || flag(player, 'isJumping')) return fail('field-move-player-already-moving', 'refused');
    const from = location(s.snapshot), to = forward(s.snapshot, player, d);
    if (to.x === from.x && to.y === from.y) return false;
    if (to.x !== from.x + (d === 6 ? 1 : d === 4 ? -1 : 0) || to.y !== from.y + (d === 2 ? 1 : d === 8 ? -1 : 0)) return fail('field-move-surf-jump-map-edge', 'refused');
    const passage = required(fact(ports.surfPassage ? () => ports.surfPassage!({ ...s.snapshot, from, to, direction: d }) : undefined, boolean, 'surf-jump-passage'), 'surf-jump-passage');
    s.check(); if (!passage) return false;
    // Native jump is a capability transition. It does not call moveStraight/increaseSteps or a completed-step producer.
    const x = d === 6 ? 1 : d === 4 ? -1 : 0, y = d === 2 ? 1 : d === 8 ? -1 : 0;
    if (ports.nativeJump) ports.nativeJump(player, x, y);
    else method(player, 'jump', [x, y]);
    if (coordinate(player, 'x') !== to.x || coordinate(player, 'y') !== to.y) return false;
    s.playerPoint = to; s.check();
    await waitMotion(s, player);
    return coordinate(player, 'x') === to.x && coordinate(player, 'y') === to.y;
  }
  async function text(s: RunScope, kind: 'used-move' | 'flash' | 'confirm-direct', moveId: LocalFieldMoveId): Promise<boolean> {
    s.check(); if (!ports.text) fail('field-move-text-unavailable', 'unavailable');
    const result: unknown = await ports.text!(kind, moveId, s.check); s.check();
    return boolean(result) ? result : fail('field-move-text-invalid-ack');
  }
  async function apply(s: RunScope, operation: FieldMoveHostOperation, stage: AppStage | RecordStage, observation?: FieldMoveHostObservation): Promise<void> {
    s.check(); const result: unknown = await operation.applyStage(copyData(stage), copyData(observation)); s.check(); ack(copyData(result), stage.kind);
  }
  function surfRuntime(operation: FieldMoveHostOperation): FieldMoveSurfRuntime {
    if (!operation.surfRuntime) return fail('field-move-surf-runtime-unavailable', 'unavailable');
    const runtime: unknown = copyData(operation.surfRuntime());
    if (!data(runtime) || !boolean(runtime.surfing) || !boolean(runtime.endingSurf) || !(runtime.surfBase === null || point(runtime.surfBase))) return fail('field-move-surf-runtime-invalid');
    return { surfing: runtime.surfing, endingSurf: runtime.endingSurf, surfBase: runtime.surfBase };
  }
  async function host(s: RunScope, operation: FieldMoveHostOperation, stage: Extract<FieldMoveStage, { kind: 'host' }>, moveId: LocalFieldMoveId): Promise<void> {
    s.check();
    switch (stage.action) {
      case 'confirm-direct': if (!await text(s, 'confirm-direct', stage.moveId)) fail('field-move-confirm-cancelled', 'cancelled'); return;
      case 'animate': {
        if (!ports.animate) fail('field-move-animation-unavailable', 'unavailable');
        const animated: unknown = await ports.animate!(stage.moveId, stage.memberId, s.check); s.check();
        if (!boolean(animated)) fail('field-move-animation-invalid-ack');
        if (!animated && (stage.onFalse === 'stop' || !await text(s, 'used-move', stage.moveId))) fail('field-move-animation-declined', 'refused');
        return;
      }
      case 'flash-text': if (!await text(s, 'flash', moveId)) fail('field-move-flash-text-declined', 'refused'); return;
      case 'sound': {
        const resource = required(fact(ports.sound ? () => ports.sound!(stage.sound) : undefined, soundData, 'field-move-sound'), 'field-move-sound');
        s.check(); method(root!.AudioManager, 'playSe', [{ ...resource }]); s.check(); return;
      }
      case 'erase-event': {
        const e = target(s, stage.target); method(e, 'erase'); s.check();
        if (hostRecord(e)?._erased !== true) fail('field-move-event-erasure-incomplete', 'failed');
        return;
      }
      case 'register-erasure': {
        const e = target(s, stage.target);
        if (hostRecord(e)?._erased !== true) fail('field-move-event-not-erased', 'failed');
        return apply(s, operation, stage, { kind: 'erased-event', target: { ...stage.target } });
      }
      case 'move-event-step': {
        const e = target(s, stage.target); method(e, 'moveStraight', [stage.direction]);
        const bound = s.events.get(stage.target.eventId)!; bound.x = coordinate(e, 'x'); bound.y = coordinate(e, 'y');
        s.check(); return;
      }
      case 'record-event-position': {
        const e = target(s, stage.target), position = { ...location(s.snapshot, e), eventId: stage.target.eventId, direction: dir(e), through: flag(e, 'isThrough') };
        return apply(s, operation, stage, { kind: 'event-position', position });
      }
      case 'wait-event-movement': {
        const e = target(s, stage.target);
        while (flag(e, 'isMoving') || flag(e, 'isJumping')) { await next(s); target(s, stage.target); }
        s.check(); return;
      }
      case 'jump-forward': if (!await jump(s, stage.direction)) fail('field-move-surf-jump-failed', 'failed'); return;
      case 'cancel-vehicles': {
        if (!ports.cancelVehicles) fail('field-move-cancel-vehicles-unavailable', 'unavailable');
        const result: unknown = await ports.cancelVehicles!(s.snapshot.player, s.check); s.check(); ack(result, 'cancel-vehicles'); return;
      }
      case 'project-surfing': {
        if (!ports.projectSurfing) fail('field-move-surf-projection-unavailable', 'unavailable');
        const runtime = surfRuntime(operation); s.check();
        const result: unknown = await ports.projectSurfing!(runtime.surfing, s.snapshot.player, s.check); s.check(); ack(result, 'project-surfing'); return;
      }
      case 'restore-map-bgm': method(s.snapshot.map, 'autoplay'); s.check(); return;
      case 'expand-flash-mask': {
        const m = s.masks.get(s.snapshot.mapId);
        if (!m) return fail('field-move-dark-mask-missing', 'failed');
        if (required(mask(s.snapshot), 'dark-mask') !== m || !flag(m, 'valid')) fail('field-move-dark-mask-replaced', 'failed');
        await m.expand(s.check); s.check();
        for (;;) {
          if (required(mask(s.snapshot), 'dark-mask') !== m || !flag(m, 'valid')) fail('field-move-dark-mask-replaced', 'failed');
          if (flag(m, 'expanded')) break;
          await next(s);
        }
        s.check(); return;
      }
      case 'red-screen': {
        const resource = required(fact(ports.redScreen ? () => ports.redScreen!() : undefined, redData, 'sweet-scent-screen'), 'sweet-scent-screen'), screen = hostRecord(root!.$gameScreen);
        if (!screen) fail('field-move-screen-unavailable', 'unavailable');
        s.check(); method(screen, 'startFlash', [[...resource.color], resource.durationFrames]); s.check();
        for (;;) {
          if (root!.$gameScreen !== screen) fail('field-move-screen-replaced', 'cancelled');
          const duration = screen!._flashDuration;
          if (!integer(duration) || duration < 0 || duration > resource.durationFrames) fail('field-move-screen-invalid-duration');
          if (duration === 0) break;
          await next(s);
        }
        s.check(); return;
      }
    }
  }
  function failure(error: unknown, completedStages: number): FieldMoveHostResult {
    return { status: error instanceof HostFailure ? error.status : 'failed', reason: error instanceof Error ? error.message : String(error), completedStages };
  }
  async function execute(plan: FieldMovePlan, operation: FieldMoveHostOperation, s: RunScope, progress: { count: number }): Promise<void> {
    bind(s, plan);
    for (const stage of plan.steps) {
      s.check();
      if (stage.kind === 'commit' && stage.world?.flashUsed) {
        const m = s.masks.get(s.snapshot.mapId);
        if (!m || required(mask(s.snapshot), 'dark-mask') !== m || !flag(m, 'valid')) fail('field-move-flash-precondition-changed', 'refused');
        s.check();
      }
      if (stage.kind === 'host') await host(s, operation, stage, plan.moveId);
      else await apply(s, operation, stage);
      progress.count++; s.check();
    }
  }
  const completed = (plan: FieldMovePlan, count: number): FieldMoveHostResult => ({ status: 'completed', completedStages: count, effectSuccess: plan.effectSuccess, outcome: plan.outcome });
  async function run(plan: FieldMovePlan, operation: FieldMoveHostOperation): Promise<FieldMoveHostResult> {
    const progress = { count: 0 };
    try { await execute(plan, operation, scope(operation), progress); return completed(plan, progress.count); }
    catch (error) { return failure(error, progress.count); }
  }
  function strictPassage(s: RunScope, t: FieldMoveFacingEvent, d: WorldDirection): WorldFact<boolean> {
    return observed(() => {
      const e = target(s, t), from = location(s.snapshot, e);
      const to = { x: from.x + (d === 6 ? 1 : d === 4 ? -1 : 0), y: from.y + (d === 2 ? 1 : d === 8 ? -1 : 0) };
      if (!flag(s.snapshot.map, 'isValid', [to.x, to.y])) return false;
      if (flag(e, 'isThrough')) return true;
      const flags = method(s.snapshot.map, 'tilesetFlags');
      if (!Array.isArray(flags)) return fail('strength-tileset-flags-invalid');
      const passage = (p: WorldPoint): boolean => {
        let effective = false;
        const tileFlag = (tileId: unknown): number => {
          if (!integer(tileId) || tileId < 0) return fail('strength-tile-id-invalid');
          const f: unknown = flags[tileId];
          if (!integer(f) || f < 0 || f > 0xffff) return fail('strength-tile-flag-invalid');
          return f;
        };
        const ignored = (tileId: number, f: number): boolean => {
          if ((f & 0x10) !== 0) return true; // Native MZ star tiles do not participate in passage.
          const terrainTag = f >> 12;
          if (!ports.strictTileTerrain && terrainTag <= 7) return false; // Default native policy: no ignore mapping.
          const terrain = required(fact(ports.strictTileTerrain ? () => ports.strictTileTerrain!({ point: { ...p }, tileId, terrainTag }) : undefined,
            (v): v is { readonly ignorePassability: boolean } => data(v) && boolean(v.ignorePassability), 'strength-tile-terrain'), 'strength-tile-terrain');
          s.check(); return terrain.ignorePassability;
        };
        const tileEvents = method(s.snapshot.map, 'tileEventsXy', [p.x, p.y]);
        if (!Array.isArray(tileEvents)) return fail('strength-tile-events-invalid');
        for (const value of tileEvents) {
          const event = hostRecord(value); if (!event) return fail('strength-tile-event-invalid');
          if (event === e || flag(event, 'isThrough')) continue;
          const tileId = method(event, 'tileId'), f = tileFlag(tileId);
          if (!positive(tileId)) return fail('strength-tile-event-id-invalid');
          if (ignored(tileId, f)) continue;
          if ((f & 0x0f) !== 0) return false;
          effective = true;
          const priority = event._priorityType;
          if (priority !== 0 && priority !== 1 && priority !== 2) return fail('strength-tile-event-priority-invalid');
          // WP12 map-layer tile-event exception; character collision remains a separate final gate.
          if (priority === 0) return true;
        }
        const tiles = method(s.snapshot.map, 'layeredTiles', [p.x, p.y]);
        if (!Array.isArray(tiles) || tiles.length !== 4) return fail('strength-layered-tiles-invalid');
        for (const tile of tiles) {
          const f = tileFlag(tile);
          if (ignored(tile, f)) continue;
          if ((f & 0x0f) !== 0) return false;
          effective = true;
        }
        return effective;
      };
      // Strict passage has no ordinary first-open-layer early success. Ordinary moveStraight still rechecks
      // its own canPass after the counter stage; a later failed displacement retains that committed prefix.
      return passage(from) && passage({ ...to, mapId: from.mapId }) && !flag(e, 'isCollidedWithCharacters', [to.x, to.y]);
    }, 'strength-strict-passage');
  }
  async function pushStrength(input: { readonly strengthUsed: boolean; readonly playSound: boolean }, operation: FieldMoveHostOperation): Promise<FieldMoveHostResult> {
    const progress = { count: 0 };
    try {
      const s = scope(operation), facing = facingEvent(s.snapshot), d = observed(() => dir(s.snapshot.player), 'direction');
      const strict = facing.status === 'value' && d.status === 'value' ? strictPassage(s, facing.value, d.value) : { status: 'unavailable', reason: 'strength-target-or-direction-unavailable' } as const;
      s.check();
      const plan = planStrengthPush({ strengthUsed: input.strengthUsed, target: facing, direction: d, strictPassable: strict });
      if (plan.status !== 'planned') return { ...plan, completedStages: 0 };
      if (!plan.steps.length) return completed(plan, 0);
      const t = required(facing, 'strength-target'), e = target(s, t), from = location(s.snapshot, e);
      await execute(plan, operation, s, progress);
      const moved = coordinate(e, 'x') !== from.x || coordinate(e, 'y') !== from.y;
      const record = fact(operation.localRecordsAvailable ? () => copyData(operation.localRecordsAvailable!()) : undefined, boolean, 'strength-record');
      const tail = planStrengthPushCompletion({ target: facing, moved: { status: 'value', value: moved }, recordAvailable: record, playSound: input.playSound });
      if (tail.status !== 'planned') return { ...tail, completedStages: progress.count };
      await execute(tail, operation, s, progress); return completed(tail, progress.count);
    } catch (error) { return failure(error, progress.count); }
  }
  async function landSurf(operation: FieldMoveHostOperation): Promise<FieldMoveLandingResult> {
    const progress = { count: 0 };
    try {
      const s = scope(operation), before = surfRuntime(operation), to = forward(s.snapshot), departure = location(s.snapshot);
      const terrain = fact(ports.terrain ? () => ports.terrain!(to) : undefined, terrainData, 'landing-terrain');
      const qualified = qualifySurfLanding({ surfing: before.surfing, facingSurfable: terrain.status === 'value' ? { status: 'value', value: terrain.value.canSurf } : terrain, departure: { status: 'value', value: departure } });
      if (qualified.status !== 'ready') return { ...qualified, completedStages: 0 };
      const succeeded = await jump(s, dir(s.snapshot.player)); s.check();
      if (succeeded) progress.count++;
      const after = surfRuntime(operation); s.check();
      const plan = planSurfLandingCompletion({ status: 'value', value: succeeded }, { departure: qualified.departure, surfing: after.surfing, endingSurf: after.endingSurf });
      if (plan.status !== 'planned') return { ...plan, completedStages: progress.count };
      if (!succeeded) return { status: 'not-landed', reason: 'surf-landing-jump-failed', completedStages: 0 };
      await execute(plan, operation, s, progress); return completed(plan, progress.count);
    } catch (error) { return failure(error, progress.count); }
  }
  async function cleanupSurf(notificationPlayer: unknown, operation: FieldMoveHostOperation): Promise<FieldMoveHostResult> {
    const progress = { count: 0 };
    try {
      const s = scope(operation), runtime = surfRuntime(operation), scene = hostRecord(root!.SceneManager)?._scene, prototype = hostRecord(hostRecord(root!.Scene_Map)?.prototype);
      const mapScene: WorldFact<boolean> = prototype ? { status: 'value', value: !!scene && Object.prototype.isPrototypeOf.call(prototype, scene) } : { status: 'unavailable', reason: 'field-move-map-scene-unavailable' };
      const plan = planSurfStepCleanup({ mapScene, playerNotification: { status: 'value', value: notificationPlayer === s.snapshot.player }, surfBase: runtime.surfBase, endingSurf: runtime.endingSurf });
      if (plan.status !== 'planned') return { ...plan, completedStages: 0 };
      await execute(plan, operation, s, progress); return completed(plan, progress.count);
    } catch (error) { return failure(error, progress.count); }
  }
  return { facts, run, pushStrength, landSurf, cleanupSurf };
}
