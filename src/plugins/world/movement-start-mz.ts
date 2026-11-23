/** Read-only START observer. The sole installer owns hooks; the App owns all statistics writes. */
import { movementDistanceDelta } from '../../framework/rules/movement-distance';
import type { NativeMovementStartContext, NativeMovementStartFacts, NativeMovementStartObservation, NativeMovementStartPoint, NativeMovementStartConsumer } from './movement-start-ports';
type Method = (this: unknown, ...args: unknown[]) => unknown;
type Direction = 2 | 4 | 6 | 8;
type Request = { readonly kind: 'straight'; readonly direction: Direction } | { readonly kind: 'jump'; readonly offset: NativeMovementStartPoint } | { readonly kind: 'diagonal' };
interface Segment { readonly from: NativeMovementStartPoint; readonly to: NativeMovementStartPoint }
interface Source {
  readonly context: NativeMovementStartContext; readonly data: object;
  readonly width: number; readonly height: number; readonly scroll: number;
}
interface Frame {
  readonly source: Source; readonly request: Request; readonly from: NativeMovementStartPoint;
  readonly real: NativeMovementStartPoint; readonly children: Segment[];
  candidate: Segment | null;
}
type KnownFact<T> = Readonly<{ status: 'value'; value: T }>;
interface KnownFacts extends NativeMovementStartFacts {
  readonly surfing: KnownFact<boolean>; readonly cycling: KnownFact<boolean>; readonly diving: KnownFact<boolean>;
  readonly ice: KnownFact<boolean>; readonly bridge: KnownFact<boolean>; readonly ledge: KnownFact<boolean>; readonly forcedRoute: KnownFact<boolean>;
  readonly nativeVehicle: KnownFact<'walk' | 'boat' | 'ship' | 'airship'>;
}
export interface MovementStartMZOptions {
  readonly root: Record<string, unknown>; readonly isProxy: (value: unknown) => boolean;
  current(): NativeMovementStartContext | null;
  /** Values must describe actual mode/sliding capabilities. Unknown bridge/ledge/ice stays unavailable. */
  facts(context: NativeMovementStartContext): NativeMovementStartFacts;
  readonly consumer: NativeMovementStartConsumer;
}
export interface MovementStartMZ {
  readonly moveStraight: Method; readonly jump: Method;
  /** Tracks nested native displacement; never emits a diagonal distance/ice observation. */
  readonly moveDiagonally: Method;
  /** Caller invokes at its existing actual increaseSteps point, then delegates its original D/native path.
   * This marker never invokes increaseSteps or completes a step. */
  increased(player: object): void;
}
export function createMovementStartMZ(options: MovementStartMZOptions): MovementStartMZ {
  const { root, current, facts, consumer, isProxy } = options, stack: Frame[] = [];
  const object = (value: unknown): object => {
    if (!value || typeof value !== 'object' || isProxy(value)) throw Error('movement-start-object-unavailable');
    return value;
  };
  const own = (value: object, key: string): unknown => {
    const descriptor = Object.getOwnPropertyDescriptor(object(value), key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw Error(`movement-start-data-unavailable:${key}`);
    return descriptor.value;
  };
  const integer = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw Error('movement-start-integer-unavailable');
    return value;
  };
  const point = (player: object, real = false): NativeMovementStartPoint => {
    const x = own(player, real ? '_realX' : '_x'), y = own(player, real ? '_realY' : '_y');
    if (real) {
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) throw Error('movement-start-real-position-unavailable');
      return { x, y };
    }
    return { x: integer(x), y: integer(y) };
  };
  const equal = (a: NativeMovementStartPoint, b: NativeMovementStartPoint): boolean => a.x === b.x && a.y === b.y;
  const same = (a: NativeMovementStartContext, b: NativeMovementStartContext): boolean => a.application === b.application && a.generation === b.generation && a.player === b.player && a.map === b.map && a.mapId === b.mapId;
  const unavailable = (why: string): void => { try { consumer.unavailable(why); } catch { /* Reporting cannot change the original native result. */ } };
  const why = (error: unknown): string => {
    if (error && typeof error === 'object' && !isProxy(error)) {
      const message = Object.getOwnPropertyDescriptor(error, 'message');
      if (message && Object.hasOwn(message, 'value') && typeof message.value === 'string') return message.value;
    }
    return 'movement-start-observation-unavailable';
  };
  const source = (player: object): Source => {
    const raw = object(current()), application = object(own(raw, 'application')), generation = integer(own(raw, 'generation'));
    const observedPlayer = object(own(raw, 'player')), map = object(own(raw, 'map')), mapId = integer(own(raw, 'mapId'));
    const data = object(own(root, '$dataMap')), width = integer(own(data, 'width')), height = integer(own(data, 'height')), scroll = integer(own(data, 'scrollType'));
    if (generation < 0 || mapId <= 0 || width <= 0 || height <= 0 || scroll < 0 || scroll > 3 || observedPlayer !== player
      || own(root, '$gamePlayer') !== player || own(root, '$gameMap') !== map || own(map, '_mapId') !== mapId) throw Error('movement-start-source-unavailable');
    return { context: Object.freeze({ application, generation, player, map, mapId }), data, width, height, scroll };
  };
  const check = (expected: Source): void => {
    const actual = source(expected.context.player);
    if (!same(actual.context, expected.context) || actual.data !== expected.data || actual.width !== expected.width || actual.height !== expected.height || actual.scroll !== expected.scroll) throw Error('movement-start-source-changed');
  };
  const ctor: unknown = Object.getOwnPropertyDescriptor(object(root), 'Game_Player')?.value;
  if ((typeof ctor !== 'function' && (typeof ctor !== 'object' || ctor === null)) || isProxy(ctor)) throw Error('movement-start-native-player-unavailable');
  const prototype = object(Object.getOwnPropertyDescriptor(ctor, 'prototype')?.value);
  const method = (key: string): Method => {
    for (let target: object | null = prototype; target; target = Object.getPrototypeOf(target) as object | null) {
      object(target); const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (!descriptor) continue;
      if (!Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function' || isProxy(descriptor.value)) break;
      return descriptor.value as Method;
    }
    throw Error(`movement-start-native-method-unavailable:${key}`);
  };
  const straight = method('moveStraight'), jump = method('jump'), diagonal = method('moveDiagonally');
  const gaps = (frame: Frame, to: NativeMovementStartPoint): Segment[] => {
    const result: Segment[] = []; let cursor = frame.from;
    for (const child of frame.children) { if (!equal(cursor, child.from)) result.push({ from: cursor, to: child.from }); cursor = child.to; }
    if (!equal(cursor, to)) result.push({ from: cursor, to });
    return result;
  };
  const straightTarget = (frame: Frame, from: NativeMovementStartPoint): NativeMovementStartPoint => {
    if (frame.request.kind !== 'straight') throw Error('movement-start-kind-invalid');
    const d = frame.request.direction, { width, height, scroll } = frame.source;
    let x = from.x + (d === 6 ? 1 : d === 4 ? -1 : 0), y = from.y + (d === 2 ? 1 : d === 8 ? -1 : 0);
    if (scroll === 2 || scroll === 3) x = (x % width + width) % width;
    if (scroll === 1 || scroll === 3) y = (y % height + height) % height;
    return { x, y };
  };
  const flag = (raw: object, name: string): boolean => {
    const fact = object(own(raw, name));
    if (own(fact, 'status') !== 'value') throw Error(`movement-start-fact-unavailable:${name}`);
    const value = own(fact, 'value'); if (typeof value !== 'boolean') throw Error(`movement-start-fact-unavailable:${name}`);
    return value;
  };
  const readFacts = (context: NativeMovementStartContext): KnownFacts => {
    const raw = object(facts(context)), value = (v: boolean) => Object.freeze({ status: 'value' as const, value: v });
    const vehicle = object(own(raw, 'nativeVehicle'));
    if (own(vehicle, 'status') !== 'value') throw Error('movement-start-fact-unavailable:nativeVehicle');
    const nativeVehicle = own(vehicle, 'value');
    if (nativeVehicle !== 'walk' && nativeVehicle !== 'boat' && nativeVehicle !== 'ship' && nativeVehicle !== 'airship') throw Error('movement-start-fact-unavailable:nativeVehicle');
    return Object.freeze({ surfing: value(flag(raw, 'surfing')), cycling: value(flag(raw, 'cycling')), diving: value(flag(raw, 'diving')),
      ice: value(flag(raw, 'ice')), bridge: value(flag(raw, 'bridge')), ledge: value(flag(raw, 'ledge')), forcedRoute: value(flag(raw, 'forcedRoute')),
      nativeVehicle: Object.freeze({ status: 'value', value: nativeVehicle }) });
  };
  const emit = (frame: Frame, after: NativeMovementStartPoint): void => {
    if (frame.request.kind === 'diagonal') return;
    check(frame.source); const ownGaps = gaps(frame, after); let segment: Segment, distance: number;
    if (frame.request.kind === 'straight') {
      if (own(frame.source.context.player, '_movementSuccess') !== true) return;
      if (!frame.candidate) throw Error('movement-start-increase-marker-unavailable');
      segment = frame.candidate;
      if (ownGaps.length > 1 || ownGaps.length === 1 && (!equal(ownGaps[0]!.from, segment.from) || !equal(ownGaps[0]!.to, segment.to))) throw Error('movement-start-displacement-ambiguous');
      distance = 1;
    } else {
      const offset = frame.request.offset;
      if (offset.x === 0 && offset.y === 0) return;
      if (ownGaps.length === 0) return;
      if (ownGaps.length !== 1) throw Error('movement-start-displacement-ambiguous');
      segment = ownGaps[0]!;
      if (segment.to.x - segment.from.x !== offset.x || segment.to.y - segment.from.y !== offset.y) throw Error('movement-start-jump-offset-changed');
      distance = Math.abs(offset.x) + Math.abs(offset.y);
    }
    const observed = readFacts(frame.source.context); check(frame.source);
    if (!equal(point(frame.source.context.player), after)) throw Error('movement-start-position-changed');
    // All facts above are descriptor-checked value records; no provider is read in this decision.
    const delta = movementDistanceDelta(distance, { surfing: observed.surfing.value, cycling: observed.cycling.value, diving: observed.diving.value,
      nativeVehicle: observed.nativeVehicle.value, ice: observed.ice.value });
    if (delta.status !== 'value') throw Error(delta.reason);
    const common = { context: frame.source.context, from: Object.freeze({ ...segment.from }), to: Object.freeze({ ...segment.to }), facts: observed };
    const observation: NativeMovementStartObservation = frame.request.kind === 'straight' ? Object.freeze({ ...common, kind: 'straight', direction: frame.request.direction })
      : Object.freeze({ ...common, kind: 'jump', offset: Object.freeze({ ...frame.request.offset }) });
    consumer.observe(observation);
  };
  const run = (receiver: unknown, original: Method, args: unknown[], request: Request | null): unknown => {
    let frame: Frame | null = null;
    try {
      const player = object(receiver);
      if (!request) throw Error('movement-start-arguments-unavailable');
      frame = { source: source(player), request, from: point(player), real: point(player, true), children: [], candidate: null };
    } catch (error) { unavailable(why(error)); }
    if (frame) stack.push(frame);
    let result: unknown, returned = false;
    try { result = Reflect.apply(original, receiver, args); returned = true; }
    finally {
      if (frame) {
        stack.pop();
        try {
          const after = point(frame.source.context.player), parent = stack[stack.length - 1];
          if (parent && same(parent.source.context, frame.source.context)) parent.children.push({ from: frame.from, to: after });
          if (returned) emit(frame, after); else unavailable('movement-start-native-threw');
        } catch (error) { unavailable(why(error)); }
      }
    }
    return result;
  };
  return Object.freeze({
    moveStraight: function(this: unknown, ...args: unknown[]): unknown { const d = args[0]; return run(this, straight, args, d === 2 || d === 4 || d === 6 || d === 8 ? { kind: 'straight', direction: d } : null); },
    jump: function(this: unknown, ...args: unknown[]): unknown { const x = args[0], y = args[1]; return run(this, jump, args, typeof x === 'number' && Number.isSafeInteger(x) && typeof y === 'number' && Number.isSafeInteger(y) ? { kind: 'jump', offset: { x, y } } : null); },
    moveDiagonally: function(this: unknown, ...args: unknown[]): unknown { return run(this, diagonal, args, { kind: 'diagonal' }); },
    increased(player: object): void {
      const frame = stack[stack.length - 1];
      if (!frame || frame.source.context.player !== player || frame.request.kind !== 'straight' || frame.candidate) return;
      try {
        check(frame.source); const to = point(player), ownGaps = gaps(frame, to);
        if (ownGaps.length === 1 && equal(straightTarget(frame, ownGaps[0]!.from), ownGaps[0]!.to)) frame.candidate = ownGaps[0]!;
        else if (ownGaps.length === 0) {
          const from = frame.children[frame.children.length - 1]?.to ?? frame.from, real = point(player, true), d = frame.request.direction;
          if (equal(straightTarget(frame, from), to) && !equal(real, frame.real)
            && real.x === to.x + (d === 6 ? -1 : d === 4 ? 1 : 0) && real.y === to.y + (d === 2 ? -1 : d === 8 ? 1 : 0)) frame.candidate = { from, to };
        }
      } catch { /* Original native/D increaseSteps still executes in the caller. */ }
    },
  });
}
