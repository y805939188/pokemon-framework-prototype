import { createOwnedSurfLandingProduction } from './surf-landing-production-mz';
import type { OwnedSurfLandingProof, OwnedSurfLandingHold, OwnedSurfLandingBound } from '../../framework/app/surf-landing-ports';
/** Actual START publisher. Its registry capability never leaves the native installer closure. */
import { semanticFingerprint } from '../../framework/rules/semantic';
import type { GameState } from '../../framework/rules/state';
import type { Content } from '../../framework/rules/types';
import type { WorldTravelLeaseSource } from '../../framework/app/ports';
import type { MovementStartApplicationQueries, MovementStartNativeCell, MovementStartResult, WorldMovementStartLifecycle } from '../../framework/app/movement-start-ports';
import { createMovementStartMZ } from './movement-start-mz';
import type { NativeMovementStartContext, NativeMovementStartFacts, NativeMovementStartObservation } from './movement-start-ports';
import { readNativeTravelLease } from './travel-lease-registry-mz';

type Method = (this: unknown, ...args: unknown[]) => unknown;
export interface MovementStartInstalledState {
  readonly application: MovementStartApplicationQueries; readonly game: GameState; readonly content: Content;
}
export interface MovementStartProductionRead {
  /** Sole composition captures the original production PSFlow game/content functions. */
  readState(): MovementStartInstalledState | null;
  /** Private composition port into the runtime that owns compiled Content; unknown objects return undefined. */
  ownedContentIdentity?(content: unknown): string | undefined;
}
export interface MovementStartProductionOptions extends MovementStartProductionRead {
  readonly root: Record<string, unknown>; readonly source: WorldTravelLeaseSource;
  readonly isProxy: (value: unknown) => boolean;
  publish(proof: WorldMovementStartLifecycle | null): WorldMovementStartLifecycle | null;
  publishLanding(proof: OwnedSurfLandingProof): OwnedSurfLandingProof;
  captureReservationGuard(player: object, idle?: boolean): () => void;
  diagnose(reason: string): void;
}
export interface ConnectionMovementStartInput {
  readonly owner: object; readonly receipt: object; readonly player: object;
  readonly sourceMapId: number; readonly from: Readonly<{ x: number; y: number }>;
  readonly target: Readonly<{ mapId: number; x: number; y: number }>;
  readonly direction: 2 | 4 | 6 | 8;
}
export interface MovementStartProductionMZ {
  increased(player: object): void;
  beginSurfLanding(context: object, hold: (proof: Extract<WorldMovementStartLifecycle, { kind: 'jump' }>, sameMotion: () => boolean) => OwnedSurfLandingHold): { finish(): object; failure(): Promise<object | null>; cancel(): void };
  registerSurfLanding(context: object, receipt: unknown): OwnedSurfLandingBound;
  takeSurfLanding(context: object, receipt: unknown): OwnedSurfLandingBound;
  /** Actual field runtime supplies its private active operation, never a public DTO. */
  ownedFieldJump(context: object, player: object, x: number, y: number): unknown;
  /** Only the TransferHost pending/resource closure calls this around real native perform. */
  captureConnection(input: ConnectionMovementStartInput): () => void;
}
interface Capture {
  readonly context: NativeMovementStartContext; readonly installed: MovementStartInstalledState;
  readonly gameIdentity: string; readonly contentIdentity: string;
  readonly snapshot: NonNullable<ReturnType<typeof readNativeTravelLease>>;
  readonly manager: object; readonly scene: object; readonly player: object; readonly map: object; readonly data: object;
  readonly geometry: Readonly<{ width: number; height: number; scrollType: 0 | 1 | 2 | 3 }>;
  readonly facts: NativeMovementStartFacts; readonly mode: WorldMovementStartLifecycle['mode'];
  readonly cells: readonly MovementStartNativeCell[]; readonly epoch: () => void;
  guard(): void;
}
/** Installs actual Player methods once. The only returned public observation is a START marker,
 * which cannot emit a proof outside an already-running private native call frame. */
export function installMovementStartProductionMZ(options: MovementStartProductionOptions): MovementStartProductionMZ {
  const { root, source, isProxy } = options;
  const landings = createOwnedSurfLandingProduction({ root, source, isProxy, readState: options.readState, ownedContentIdentity: options.ownedContentIdentity, publish: options.publishLanding });
  const contentIdentityOf = (content: Content): string => options.ownedContentIdentity?.(content) ?? semanticFingerprint(content);
  const ref = (value: unknown): object => {
    if (value === null || typeof value !== 'object' && typeof value !== 'function' || isProxy(value)) throw Error('movement-production-reference-unavailable');
    return value as object;
  };
  const own = (value: object, key: string): unknown => {
    const descriptor = Object.getOwnPropertyDescriptor(ref(value), key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw Error(`movement-production-own-data-required:${key}`);
    return descriptor.value;
  };
  const integer = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw Error('movement-production-integer-required');
    return value;
  };
  const movementResult = (raw: unknown): MovementStartResult => {
    const result = ref(raw), status = own(result, 'status');
    if (status === 'duplicate') return { status };
    if (status === 'refused' || status === 'unavailable') {
      const reason = own(result, 'reason'); if (typeof reason !== 'string') throw Error('surf-movement-result-invalid');
      return { status, reason };
    }
    if (status !== 'counted') throw Error('surf-movement-result-invalid');
    const rawDelta = ref(own(result, 'delta'));
    const delta = { distance_walked: integer(own(rawDelta, 'distance_walked')), distance_cycled: integer(own(rawDelta, 'distance_cycled')),
      distance_surfed: integer(own(rawDelta, 'distance_surfed')), distance_slid_on_ice: integer(own(rawDelta, 'distance_slid_on_ice')) };
    if (Object.values(delta).some(n => n < 0)) throw Error('surf-movement-result-invalid');
    return { status, delta };
  };
  const why = (error: unknown): string => {
    if (error && typeof error === 'object' && !isProxy(error)) {
      const d = Object.getOwnPropertyDescriptor(error, 'message'); if (d && 'value' in d && typeof d.value === 'string') return d.value;
    }
    return 'movement-production-unavailable';
  };
  type Parent = { readonly context: object; readonly record: Method; result: MovementStartResult | null; failure: string | null };
  const parents: Parent[] = [];
  const parentNow = (): Parent | null => parents[parents.length - 1] ?? null;
  const unavailable = (reason: string): void => { const parent = parentNow(); if (parent) parent.failure ??= reason;
    try { options.diagnose(reason); } catch { /* Observations cannot change native results. */ } };
  const captures: (Capture | null)[] = [];
  const currentCapture = (): Capture | null => captures[captures.length - 1] ?? null;
  const captureMode = (player: object, game: object) => {
    const cells: MovementStartNativeCell[] = [];
    const primitive = (owner: object, key: string): unknown => {
      const value = own(owner, key);
      if (value !== null && value !== undefined && typeof value !== 'boolean' && typeof value !== 'string' && typeof value !== 'number') throw Error('movement-production-mode-cell-unavailable');
      cells.push(Object.freeze({ owner, prototype: Object.getPrototypeOf(owner) as object | null, key, present: true, value }));
      return value;
    };
    // Effective native boolean cells are the supported mode capability. Capture every
    // shadow/absence as well as the selected cells so neither publication nor atomic
    // consumption can silently switch the source. A function's hidden reads are not
    // an atomic read set, and a declared missing/nonboolean value is not stock false.
    const flag = (keys: readonly string[]): boolean => {
      let result: boolean | undefined;
      for (const key of keys) {
        for (let owner: object | null = player; owner; owner = Object.getPrototypeOf(owner) as object | null) {
          ref(owner); const descriptor = Object.getOwnPropertyDescriptor(owner, key);
          if (!descriptor) {
            cells.push(Object.freeze({ owner, prototype: Object.getPrototypeOf(owner) as object | null, key, present: false, value: undefined }));
            continue;
          }
          const value = primitive(owner, key);
          if (typeof value !== 'boolean') throw Error(`movement-production-mode-flag-invalid:${key}`);
          if (result !== undefined && result !== value) throw Error('movement-production-mode-flags-conflict');
          result = value; break;
        }
      }
      return result ?? false;
    };
    // These unsupported extensions still require proven plain-MZ absence.
    const absent = (key: string): void => {
      for (let owner: object | null = player; owner; owner = Object.getPrototypeOf(owner) as object | null) {
        ref(owner); const descriptor = Object.getOwnPropertyDescriptor(owner, key);
        if (descriptor) throw Error(`movement-production-profile-unavailable:${key}`);
        cells.push(Object.freeze({ owner, prototype: Object.getPrototypeOf(owner) as object | null, key, present: false, value: undefined }));
      }
    };
    for (const key of ['isDiving', '_diving', 'isOnBridge', '_bridge', 'isOnLedge']) absent(key);
    const cycling = flag(['isOnBicycle', 'isCycling', '_bicycle', '_cycling']);
    const ice = flag(['isSliding', '_iceSliding']);
    // TerrainTags.ice and isOnIce describe the ground for completed-step/Repel.
    // Neither declares a sliding implementation nor proves that a player is sliding.
    // Stock absence of sliding cells therefore remains false on configured maps.
    const vehicle = primitive(player, '_vehicleType'), forcedRoute = primitive(player, '_moveRouteForcing');
    const world = ref(own(game, 'world')), surfing = primitive(world, 'surfing');
    if (!['walk', 'boat', 'ship', 'airship'].includes(typeof vehicle === 'string' ? vehicle : '') || typeof forcedRoute !== 'boolean' || typeof surfing !== 'boolean') throw Error('movement-production-native-mode-invalid');
    const mode = Object.freeze({ nativeVehicle: vehicle as 'walk' | 'boat' | 'ship' | 'airship', forcedRoute, surfing,
      cycling, diving: false, ice, bridge: false, ledge: false });
    const value = <T>(v: T) => Object.freeze({ status: 'value' as const, value: v });
    const facts: NativeMovementStartFacts = Object.freeze({ nativeVehicle: value(mode.nativeVehicle), forcedRoute: value(forcedRoute), surfing: value(surfing),
      cycling: value(cycling), diving: value(false), ice: value(ice), bridge: value(false), ledge: value(false) });
    return { mode, facts, cells: Object.freeze(cells) };
  };
  const prepare = (receiver: unknown): Capture => {
    const player = ref(receiver), flow = ref(own(root, 'PSFlow')), system = ref(own(root, '$gameSystem'));
    // Validate slots before the known production public readers access them.
    const game = ref(own(system, '_psGame')), content = ref(own(flow, '_content')), application = ref(own(flow, '_app'));
    const saveError = Object.getOwnPropertyDescriptor(system, '_psSaveError');
    if (saveError && !Object.hasOwn(saveError, 'value')) throw Error('movement-production-save-accessor');
    const installed = options.readState();
    if (!installed || installed.application !== application || installed.game !== game || installed.content !== content) throw Error('movement-production-installed-source-changed');
    const generation = installed.application.stateGeneration;
    const manager = ref(own(root, 'SceneManager')), scene = ref(own(manager, '_scene'));
    const map = ref(own(root, '$gameMap')), mapId = integer(own(map, '_mapId')), data = ref(own(root, '$dataMap'));
    const snapshot = readNativeTravelLease(source), birth = snapshot?.mapBirth, frame = birth?.frame;
    if (!snapshot || snapshot.current !== null || !birth || !frame || birth.manager !== manager || birth.scene !== scene ||
      frame.map !== map || frame.mapId !== mapId || frame.player !== player || frame.data !== data) throw Error('movement-production-idle-genuine-source-required');
    const width = integer(own(data, 'width')), height = integer(own(data, 'height')), scrollType = integer(own(data, 'scrollType'));
    if (mapId <= 0 || width <= 0 || height <= 0 || scrollType < 0 || scrollType > 3) throw Error('movement-production-geometry-invalid');
    const geometry = Object.freeze({ width, height, scrollType: scrollType as 0 | 1 | 2 | 3 });
    const { mode, facts, cells } = captureMode(player, game);
    const epoch = options.captureReservationGuard(player), gameIdentity = semanticFingerprint(installed.game), contentIdentity = contentIdentityOf(installed.content);
    const context = Object.freeze({ application, generation, player, map, mapId });
    const guard = (): void => {
      const actualGeneration = installed.application.stateGeneration; epoch();
      if (own(root, 'PSFlow') !== flow || own(flow, '_app') !== application || actualGeneration !== generation ||
        own(root, '$gameSystem') !== system || own(system, '_psGame') !== game || own(flow, '_content') !== content ||
        semanticFingerprint(installed.game) !== gameIdentity || contentIdentityOf(installed.content) !== contentIdentity ||
        readNativeTravelLease(source) !== snapshot || own(root, 'SceneManager') !== manager || own(manager, '_scene') !== scene || own(manager, '_nextScene') !== null ||
        own(scene, '_started') !== true || own(scene, '_active') !== true || own(root, '$gamePlayer') !== player || own(root, '$gameMap') !== map || own(map, '_mapId') !== mapId || own(root, '$dataMap') !== data ||
        own(data, 'width') !== width || own(data, 'height') !== height || own(data, 'scrollType') !== scrollType || own(player, '_transferring') !== false) throw Error('movement-production-source-changed');
      for (const cell of cells) {
        ref(cell.owner); const descriptor = Object.getOwnPropertyDescriptor(cell.owner, cell.key);
        if (Object.getPrototypeOf(cell.owner) !== cell.prototype || (!cell.present ? descriptor !== undefined : !descriptor || !Object.hasOwn(descriptor, 'value') || !Object.is(descriptor.value, cell.value))) throw Error('movement-production-mode-changed');
      }
    };
    guard(); return { context, installed, gameIdentity, contentIdentity, snapshot, manager, scene, player, map, data, geometry, mode, facts, cells: Object.freeze(cells), epoch, guard };
  };
  const observe = (observation: NativeMovementStartObservation): void => {
    const capture = currentCapture(); if (!capture) throw Error('movement-production-callframe-unavailable'); capture.guard();
    const birth = capture.snapshot.mapBirth!;
    const parent = parentNow();
    const common = { permit: Object.freeze({}), observation, ...(parent ? { parentContext: parent.context } : {}), application: capture.installed.application, generation: capture.context.generation,
      game: capture.installed.game, gameIdentity: capture.gameIdentity, content: capture.installed.content, contentIdentity: capture.contentIdentity,
      manager: capture.manager, scene: capture.scene, birth: birth.birth, queue: birth.queue, map: capture.map, mapId: capture.context.mapId,
      player: capture.player, data: capture.data, from: observation.from, to: observation.to, geometry: capture.geometry, mode: capture.mode, cells: capture.cells };
    const proof: WorldMovementStartLifecycle = observation.kind === 'straight' ? Object.freeze({ ...common, kind: 'straight', direction: observation.direction })
      : Object.freeze({ ...common, kind: 'jump', offset: observation.offset });
    const published = options.publish(proof);
    // The candidate exists only for the original landSurf port. A native arrival
    // hold has no D authority; install it before Core/provider reentry is possible.
    if (parent) landings.started(parent.context, published);
    const result = parent ? movementResult(Reflect.apply(parent.record, parent.context, [observation]))
      : capture.installed.application.recordNativeMovementStart(observation);
    if (parent) parent.result = result;
    if (result.status === 'refused' || result.status === 'unavailable') unavailable(result.reason);
  };
  const observer = createMovementStartMZ({ root, isProxy, current: () => currentCapture()?.context ?? null,
    facts: () => { const capture = currentCapture(); if (!capture) throw Error('movement-production-callframe-unavailable'); capture.guard(); return capture.facts; },
    consumer: { observe, unavailable } });
  const prototype = ref(own(ref(own(root, 'Game_Player')), 'prototype'));
  const wrap = (native: Method, jump = false): Method => function(this: unknown, ...args: unknown[]): unknown {
    if (jump) landings.motionStarted(this);
    let capture: Capture | null = null; try { capture = prepare(this); } catch (error) { unavailable(why(error)); }
    captures.push(capture); try { return Reflect.apply(native, this, args); } finally { captures.pop(); }
  };
  Object.assign(prototype, { moveStraight: wrap(observer.moveStraight), moveDiagonally: wrap(observer.moveDiagonally), jump: wrap(observer.jump, true) });
  return Object.freeze({ increased: observer.increased, beginSurfLanding: landings.begin, registerSurfLanding: landings.register, takeSurfLanding: landings.take,
    ownedFieldJump(context: object, player: object, x: number, y: number): unknown {
      ref(context); ref(player);
      if (player !== own(root, '$gamePlayer') || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || Math.abs(x) + Math.abs(y) !== 1) throw Error('surf-movement-native-input-invalid');
      const record = own(context, 'recordMovementStart'), check = own(context, 'assertCurrent');
      if (typeof record !== 'function' || isProxy(record) || typeof check !== 'function' || isProxy(check)) throw Error('surf-movement-native-context-unavailable');
      Reflect.apply(check, context, []);
      let jump: Method | null = null;
      for (let owner: object | null = player; owner; owner = Object.getPrototypeOf(owner) as object | null) {
        ref(owner); const d = Object.getOwnPropertyDescriptor(owner, 'jump'); if (!d) continue;
        if ('value' in d && typeof d.value === 'function' && !isProxy(d.value)) jump = d.value as Method;
        break;
      }
      if (!jump) throw Error('surf-movement-native-jump-unavailable');
      const parent: Parent = { context, record: record as Method, result: null, failure: null }; parents.push(parent);
      let result: unknown;
      try { result = Reflect.apply(jump, player, [x, y]); } finally { parents.pop(); }
      if (!parent.result || parent.result.status !== 'counted' && parent.result.status !== 'duplicate') {
        // Report through the original private child even when the readonly observer could not emit.
        // This cannot count: the token has never been published by the canonical producer.
        Reflect.apply(parent.record, parent.context, [Object.freeze({})]);
        throw Error(parent.failure ?? 'surf-movement-start-not-recorded');
      }
      return result;
    },
    captureConnection(input: ConnectionMovementStartInput): () => void {
      const player = ref(input.player), manager = ref(own(root, 'SceneManager')), scene = ref(own(manager, '_scene'));
      const flow = ref(own(root, 'PSFlow')), system = ref(own(root, '$gameSystem'));
      const game = ref(own(system, '_psGame')), content = ref(own(flow, '_content')), application = ref(own(flow, '_app'));
      const installed = options.readState();
      if (!installed || installed.application !== application || installed.game !== game || installed.content !== content) throw Error('connection-movement-installed-source-changed');
      const generation = installed.application.stateGeneration, map = ref(own(root, '$gameMap')), data = ref(own(root, '$dataMap'));
      const before = readNativeTravelLease(source), physical = before?.current, birth = before?.mapBirth;
      if (!physical || !birth || physical.owner !== input.owner || physical.receipt !== input.receipt || physical.player !== player
        || physical.scene !== scene || physical.phase !== 'performing' || birth.scene !== scene || birth.manager !== manager
        || own(manager, '_nextScene') !== null || own(root, '$gamePlayer') !== player
        || own(map, '_mapId') !== input.sourceMapId || own(player, '_x') !== input.from.x || own(player, '_y') !== input.from.y
        || own(player, '_direction') !== input.direction || own(player, '_transferring') !== true) throw Error('connection-movement-native-source-changed');
      const width = integer(own(data, 'width')), height = integer(own(data, 'height')), scroll = integer(own(data, 'scrollType'));
      if (width <= 0 || height <= 0 || scroll < 0 || scroll > 3) throw Error('connection-movement-native-geometry-invalid');
      const geometry = Object.freeze({ width, height, scrollType: scroll as 0 | 1 | 2 | 3 });
      const { mode, cells } = captureMode(player, game), epoch = options.captureReservationGuard(player, false);
      const gameIdentity = semanticFingerprint(installed.game), contentIdentity = contentIdentityOf(installed.content);
      let used = false;
      return (): void => {
        if (used) throw Error('connection-movement-native-capture-consumed'); used = true;
        const actual = options.readState(), actualGeneration = installed.application.stateGeneration; epoch();
        const now = readNativeTravelLease(source), arrived = now?.current;
        if (!actual || actual.application !== application || actual.game !== game || actual.content !== content || actualGeneration !== generation
          || own(root, 'PSFlow') !== flow || own(flow, '_app') !== application || own(flow, '_content') !== content
          || own(root, '$gameSystem') !== system || own(system, '_psGame') !== game
          || semanticFingerprint(installed.game) !== gameIdentity || contentIdentityOf(installed.content) !== contentIdentity
          || own(root, 'SceneManager') !== manager || own(manager, '_scene') !== scene || own(manager, '_nextScene') !== null
          || own(root, '$gameMap') !== map || own(root, '$gamePlayer') !== player || own(root, '$dataMap') !== data
          || own(map, '_mapId') !== input.target.mapId || own(player, '_x') !== input.target.x || own(player, '_y') !== input.target.y
          || own(player, '_direction') !== input.direction || own(player, '_transferring') !== false
          || own(data, 'width') !== width || own(data, 'height') !== height || own(data, 'scrollType') !== scroll
          || now?.mapBirth !== birth || !arrived || arrived.phase !== 'arrived' || arrived.owner !== input.owner || arrived.receipt !== input.receipt
          || arrived.lease !== physical.lease || arrived.serial !== physical.serial || arrived.sourceScene !== physical.sourceScene
          || arrived.scene !== scene || arrived.player !== player) throw Error('connection-movement-arrival-source-changed');
        for (const cell of cells) {
          ref(cell.owner); const d = Object.getOwnPropertyDescriptor(cell.owner, cell.key);
          if (Object.getPrototypeOf(cell.owner) !== cell.prototype || (!cell.present ? d !== undefined : !d || !('value' in d) || !Object.is(d.value, cell.value))) throw Error('connection-movement-mode-changed');
        }
        const observation = Object.freeze({});
        options.publish(Object.freeze({ permit: Object.freeze({}), observation, parentContext: input.receipt,
          application: installed.application, generation, game: installed.game, gameIdentity, content: installed.content, contentIdentity,
          manager, scene, birth: birth.birth, queue: birth.queue, map, mapId: input.target.mapId, player, data,
          from: Object.freeze({ ...input.from }), to: Object.freeze({ x: input.target.x, y: input.target.y }), geometry, mode, cells,
          kind: 'connection', direction: input.direction, sourceMapId: input.sourceMapId, physicalLease: physical.lease, physicalSerial: physical.serial }));
      };
    },
  });
}
