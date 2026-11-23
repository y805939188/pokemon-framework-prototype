/** MZ presentation/input leaf. The application owns the fishing rules, parent operation and all state writes. */
import type { FishingAdvance, FishingBlockingEffect, FishingClock, FishingClockSample, FishingEffect } from '../../framework/rules/fishing';
import { sampleFishingClock } from '../../framework/rules/fishing';
import { ENVIRONMENT } from '../../framework/rules/initial-field';
import type { WorldFact } from '../../framework/rules/world-data';
import type { HostInput } from '../host-input';
import { hostRecord, invoke } from './host-access';
import { createFishingCharacters } from './fishing-character-mz';
import type { FishingCharacters } from './fishing-character-mz';
import { fishingMessage } from './fishing-messages';

export interface FishingHostFacts {
  readonly facingFishable: WorldFact<boolean>;
  readonly currentExitPassable: WorldFact<boolean>;
  readonly surfing: WorldFact<boolean>;
  readonly facingEnvironment: WorldFact<keyof typeof ENVIRONMENT>;
}
/** Content integration supplies terrain semantics; an unknown tag never silently becomes non-fishable. */
export function readFishingHostFacts(rootValue: unknown, terrain: (tag: number) => unknown, surfing?: (player: object) => unknown): FishingHostFacts {
  const observe = <T>(read: () => T): WorldFact<T> => {
    try { return { status: 'value', value: read() }; }
    catch (error) { return { status: error instanceof TypeError ? 'invalid' : 'unavailable', reason: String(error) }; }
  };
  const root = hostRecord(rootValue);
  let facing: Record<string, unknown> | null = null;
  const position = () => {
    const player = hostRecord(root?.$gamePlayer), map = hostRecord(root?.$gameMap);
    if (!player || !map) throw new Error('fishing-host-position-unavailable');
    const x = integer(player.x), y = integer(player.y), d = integer(invoke(player, 'direction'));
    if (![2, 4, 6, 8].includes(d)) throw new TypeError('fishing-host-direction-invalid');
    return { player, map, x, y, d };
  };
  const facingTerrain = () => {
    if (facing) return facing;
    const { map, x, y, d } = position();
    const tx = integer(invoke(map, 'roundXWithDirection', [x, d])), ty = integer(invoke(map, 'roundYWithDirection', [y, d]));
    if (!boolean(invoke(map, 'isValid', [tx, ty]))) throw new Error('fishing-host-facing-outside-map');
    const record = hostRecord(terrain(integer(invoke(map, 'terrainTag', [tx, ty]))));
    if (!record) throw new Error('fishing-host-terrain-unavailable');
    facing = record; return record;
  };
  return {
    facingFishable: observe(() => boolean(facingTerrain().fishable)),
    currentExitPassable: observe(() => {
      const { map, x, y, d } = position();
      // MZ isMapPassable also tests the target's incoming edge. WP60 requires only this outgoing edge.
      return boolean(invoke(map, 'isValid', [x, y])) && boolean(invoke(map, 'isPassable', [x, y, d]));
    }),
    surfing: observe(() => {
      if (!surfing) throw new Error('fishing-host-surfing-unavailable');
      return boolean(surfing(position().player));
    }),
    facingEnvironment: observe(() => {
      const value = facingTerrain().environment;
      if (typeof value !== 'string' || !Object.hasOwn(ENVIRONMENT, value)) throw new TypeError('fishing-host-environment-invalid');
      return value as keyof typeof ENVIRONMENT;
    }),
  };
}

export interface FishingHostPorts {
  readonly input: HostInput;
  readonly characters?: FishingCharacters;
  readonly diagnostic?: (reason: string) => void;
  /** Assert the application's existing parent identity. This leaf never creates a world lock. */
  assertCurrent(owner: object): void;
  readonly beginCommonEventId?: number;
  readonly endCommonEventId?: number;
  readonly now?: () => number;
  readonly focused?: () => boolean;
}
export interface FishingHostSession {
  run(effect: FishingEffect): void;
  /** Called once by the map update owner; pumps only this session's owned interpreter. */
  update(): void;
  sample(): FishingClockSample;
  /** Abandon pending presentation and remove focus subscriptions. Late completions cannot emit. */
  dispose(): void;
}
export interface FishingHost { begin(owner: object, emit: (advance: FishingAdvance) => void): FishingHostSession }
type Method = (this: unknown, ...args: unknown[]) => unknown;
function method(value: unknown, key: string): Method {
  const result = hostRecord(value)?.[key];
  if (typeof result !== 'function') throw new Error(`fishing-host-method-unavailable:${key}`);
  return result as Method;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TypeError('fishing-host-integer-invalid');
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new TypeError('fishing-host-boolean-invalid');
  return value;
}
interface WaitingEffect { readonly id: number; readonly restoring: boolean; poll(): boolean; stop(): void; settled: boolean }
interface InputWindowLease { readonly window: Record<string, unknown>; readonly handlers: ReadonlyMap<string, Method> }
interface MessageLease {
  readonly texts: unknown[];
  readonly content: readonly unknown[];
  readonly fields: Map<string, unknown>;
  readonly choices: readonly unknown[] | null;
  readonly inputs: InputWindowLease[];
  revoked: boolean;
}
// These are per-window callback identities, not an application operation registry or a busy lock.
const inputHandlers = new WeakMap<object, Map<string, { original: Method; guard: Method }>>();
const MESSAGE_INPUT_FIELDS = ['_choices', '_choiceCallback', '_numInputVariableId', '_numInputMaxDigits', '_itemChoiceVariableId', '_itemChoiceItypeId', '_scrollMode'] as const;

export function createFishingHost(rootValue: unknown, ports: FishingHostPorts): FishingHost {
  const root = hostRecord(rootValue);
  if (!root) throw new Error('fishing-host-root-unavailable');
  const now = ports.now ?? (() => {
    const value = invoke(root.performance, 'now');
    if (typeof value !== 'number') throw new TypeError('fishing-host-clock-invalid');
    return value;
  });
  const focused = ports.focused ?? (() => boolean(invoke(root.document, 'hasFocus')));
  const characters = ports.characters ?? createFishingCharacters(root, {});
  let active: FishingHostSession | null = null;
  return { begin(owner, emit) {
    if (active) throw new Error('fishing-host-session-active');
    ports.assertCurrent(owner);
    const player = hostRecord(root.$gamePlayer), map = root.$gameMap;
    const mapId = integer(invoke(map, 'mapId'));
    const scene = hostRecord(hostRecord(root.SceneManager)?._scene);
    const message = hostRecord(root.$gameMessage), window = hostRecord(scene?._messageWindow);
    if (!player || !scene || !message || !window) throw new Error('fishing-host-presentation-unavailable');
    for (const key of ['setPattern', 'setDirectionFix', 'setStepAnime', 'setWalkAnime', 'isAnimationPlaying']) method(player, key);
    for (const key of ['add', 'isBusy', 'clear']) method(message, key);
    method(window, 'isClosed'); method(root, 'addEventListener'); method(root, 'removeEventListener'); method(root.Input, 'clear');
    const snapshot = { _pattern: integer(player._pattern), _directionFix: boolean(player._directionFix), _stepAnime: boolean(player._stepAnime), _walkAnime: boolean(player._walkAnime) };
    const written = new Map<keyof typeof snapshot, number | boolean>();
    const seen = new Set<number>();
    let waiting: WaitingEffect | null = null, disposed = false, disposing = false, sending = false;
    let clock: FishingClock = { monotonicMs: now(), active: focused(), elapsedMs: 0 };
    // Validate the first sample with the same production clock contract as the rules.
    clock = sampleFishingClock(clock, clock);
    let messageLease: MessageLease | null = null;
    const routeFields = ['_moveRoute', '_moveRouteIndex', '_moveRouteForcing', '_originalMoveRoute', '_originalMoveRouteIndex', '_waitCount'] as const;
    let playerRoute: { readonly route: unknown; readonly original: unknown; readonly originalIndex: unknown; readonly previous: ReadonlyMap<string, unknown> } | null = null;
    const current = (): boolean => {
      try { ports.assertCurrent(owner); return root.$gamePlayer === player && root.$gameMap === map && integer(invoke(map, 'mapId')) === mapId && hostRecord(root.SceneManager)?._scene === scene; }
      catch { return false; }
    };
    const character = characters.begin(player, current);
    let routeUpdate: { readonly descriptor: PropertyDescriptor | undefined; readonly guarded: Method } | null = null;
    const releaseRouteUpdate = (): void => {
      const saved = routeUpdate; routeUpdate = null;
      if (!saved || Object.getOwnPropertyDescriptor(player, 'processMoveCommand')?.value !== saved.guarded) return;
      if (saved.descriptor) Object.defineProperty(player, 'processMoveCommand', saved.descriptor); else delete player.processMoveCommand;
    };
    const claimRouteUpdate = (): void => {
      if (routeUpdate) return;
      let prototype: object | null = player, descriptor: PropertyDescriptor | undefined;
      while (prototype && !descriptor) { descriptor = Object.getOwnPropertyDescriptor(prototype, 'processMoveCommand'); prototype = Object.getPrototypeOf(prototype); }
      if (!descriptor) return; // A non-native route facade has no independent player update.
      if (!('value' in descriptor) || typeof descriptor.value !== 'function') throw Error('fishing-route-method-invalid');
      const original: Method = descriptor.value;
      const guarded: Method = function(this: unknown, ...args: unknown[]): unknown {
        const ownsRoute = this === player && current() && playerRoute && player._moveRoute === playerRoute.route && player._moveRouteForcing === true &&
          player._originalMoveRoute === playerRoute.original && player._originalMoveRouteIndex === playerRoute.originalIndex;
        return ownsRoute ? character.owned(() => Reflect.apply(original, this, args)) : Reflect.apply(original, this, args);
      };
      routeUpdate = { descriptor: Object.getOwnPropertyDescriptor(player, 'processMoveCommand'), guarded };
      Object.defineProperty(player, 'processMoveCommand', { configurable: true, writable: true, value: guarded });
    };

    const sample = (): FishingClockSample => {
      clock = sampleFishingClock(clock, { monotonicMs: now(), active: clock.active });
      return { monotonicMs: clock.monotonicMs, active: clock.active };
    };
    const send = (advance: Omit<FishingAdvance, 'sample'>): void => {
      if (!disposed) emit({ ...advance, sample: sample() });
    };
    const write = (key: keyof typeof snapshot, value: number | boolean): void => {
      const setters = { _pattern: 'setPattern', _directionFix: 'setDirectionFix', _stepAnime: 'setStepAnime', _walkAnime: 'setWalkAnime' } as const;
      invoke(player, setters[key], [value]); written.set(key, value);
    };
    const ownMessage = (lease: MessageLease): boolean => root.$gameMessage === message && message._texts === lease.texts &&
      lease.texts.length === lease.content.length && lease.texts.every((text, i) => text === lease.content[i]) &&
      [...lease.fields].every(([key, value]) => message[key] === value) &&
      (lease.choices === null || Array.isArray(message._choices) && message._choices.length === lease.choices.length && message._choices.every((choice, i) => choice === lease.choices![i]));
    const releaseInputHandlers = (lease: MessageLease): void => {
      lease.revoked = true;
      for (const input of lease.inputs) for (const [name, guard] of input.handlers) {
        const saved = inputHandlers.get(input.window)?.get(name);
        if (saved?.guard === guard && input.window[name] === guard) input.window[name] = saved.original;
      }
    };
    const captureMessage = (): void => {
      if (!Array.isArray(message._texts)) throw new TypeError('fishing-host-message-texts-invalid');
      if (messageLease) releaseInputHandlers(messageLease);
      const lease: MessageLease = { texts: message._texts, content: [...message._texts], fields: new Map(MESSAGE_INPUT_FIELDS.map(key => [key, message[key]])),
        choices: Array.isArray(message._choices) ? [...message._choices] : null, inputs: [], revoked: false };
      messageLease = lease;
      const valid = (): boolean => !disposed && !lease.revoked && current() && ownMessage(lease);
      const claim = (value: unknown, names: readonly string[]): void => {
        const input = hostRecord(value); if (!input) return;
        const saved = inputHandlers.get(input) ?? new Map<string, { original: Method; guard: Method }>();
        inputHandlers.set(input, saved);
        const installed = new Map<string, Method>();
        for (const name of names) {
          const actual = input[name]; if (typeof actual !== 'function') continue;
          const previous = saved.get(name), original = previous?.guard === actual ? previous.original : actual as Method;
          const guard: Method = function(this: unknown, ...args: unknown[]): unknown { return valid() ? original.apply(this, args) : undefined; };
          input[name] = guard; saved.set(name, { original, guard }); installed.set(name, guard);
        }
        lease.inputs.push({ window: input, handlers: installed });
      };
      if (Array.isArray(message._choices) && message._choices.length > 0) claim(window._choiceListWindow, ['callOkHandler', 'callCancelHandler']);
      if (typeof message._numInputVariableId === 'number' && message._numInputVariableId > 0) claim(window._numberInputWindow, ['processOk']);
      if (typeof message._itemChoiceVariableId === 'number' && message._itemChoiceVariableId > 0) claim(window._eventItemWindow, ['onOk', 'onCancel']);
      if (message._scrollMode === true) claim(scene._scrollTextWindow, ['terminateMessage']);
      const callback = message._choiceCallback;
      if (typeof callback === 'function') {
        const guarded = (...args: unknown[]): unknown => valid() ? Reflect.apply(callback, message, args) : undefined;
        message._choiceCallback = guarded; lease.fields.set('_choiceCallback', guarded);
      }
    };
    const close = (target: Record<string, unknown>): void => {
      if (typeof target.deactivate === 'function') invoke(target, 'deactivate'); else if (typeof target.active === 'boolean') target.active = false;
      if (typeof target.close === 'function') invoke(target, 'close');
      // Disposed sessions have no future pump to finish a window's closing animation.
      if (typeof target.openness === 'number') target.openness = 0;
      if ('_opening' in target) target._opening = false;
      if ('_closing' in target) target._closing = false;
      if ('_text' in target) { target._text = null; if (typeof target.hide === 'function') invoke(target, 'hide'); }
    };
    const clearMessage = (): void => {
      const lease = messageLease;
      if (!lease) return;
      const owned = ownMessage(lease);
      if (owned) {
        for (const input of lease.inputs) if ([...input.handlers].every(([name, guard]) => input.window[name] === guard)) close(input.window);
      }
      releaseInputHandlers(lease); messageLease = null;
      if (owned) {
        if (typeof window.terminateMessage === 'function') invoke(window, 'terminateMessage');
        else invoke(message, 'clear');
        close(window);
        for (const key of ['_goldWindow', '_nameBoxWindow']) { const child = hostRecord(window[key]); if (child) close(child); }
        // Forced termination can happen before native onEndOfText resets these presentation fields.
        if ('_textState' in window) window._textState = null;
        if ('_faceBitmap' in window) window._faceBitmap = null;
        if ('_waitCount' in window) window._waitCount = 0;
        if ('pause' in window) window.pause = false;
      }
    };
    const restore = (): void => {
      clearMessage();
      // An invalid business owner can still leave its forced route running on the live player.
      if (root.$gamePlayer === player && playerRoute && player._moveRoute === playerRoute.route && player._moveRouteForcing === true &&
        player._originalMoveRoute === playerRoute.original && player._originalMoveRouteIndex === playerRoute.originalIndex) {
        for (const [key, value] of playerRoute.previous) player[key] = value;
      }
      playerRoute = null; releaseRouteUpdate();
      if (!current()) return; // A replacement owner's presentation fields are never released by a stale session.
      let failure: { readonly error: unknown } | null = null;
      try { character.restore(); }
      catch (error) { failure = { error }; }
      finally {
        try {
          for (const [key, last] of written) {
            if (!current()) break;
            if (player[key] !== last) continue;
            try { write(key, snapshot[key]); }
            catch (error) { if (!failure) failure = { error }; }
            if (!current()) break; // A native setter can install a successor.
          }
        } finally { written.clear(); }
      }
      if (failure) throw failure.error;
    };
    const stopWaiting = (): void => { const old = waiting; waiting = null; if (old) { old.settled = true; old.stop(); } };
    const settle = (entry: WaitingEffect, status: 'completed' | 'failed'): void => {
      if (disposed || waiting !== entry || entry.settled) return;
      waiting = null; entry.settled = true; entry.stop(); send({ effect: { id: entry.id, status } });
    };
    const fail = (): void => {
      if (waiting) settle(waiting, 'failed'); else send({ interrupt: 'host-failed' });
    };
    const commonList = (id: number | undefined): unknown[] | null => {
      if (id === undefined || !Number.isSafeInteger(id) || id < 0) return null;
      const record = hostRecord(hostRecord(root.$dataCommonEvents)?.[id]);
      if (!record) return null;
      if (!Array.isArray(record.list)) throw new TypeError('fishing-common-event-list-invalid');
      return record.list;
    };
    const interpreter = (list: unknown[], depth = 0, eventId = 0): Record<string, unknown> => {
      const Constructor = root.Game_Interpreter;
      if (typeof Constructor !== 'function' || depth > 99) throw new Error('fishing-common-event-interpreter-unavailable');
      const instance = hostRecord(Reflect.construct(Constructor, [depth]));
      if (!instance) throw new Error('fishing-common-event-interpreter-invalid');
      const execute = method(instance, 'executeCommand');
      instance.executeCommand = function(this: unknown): unknown {
        if (!current()) throw new Error('stale-fishing-owner');
        const wasBusy = boolean(invoke(message, 'isBusy'));
        const previousRoute = new Map(routeFields.map(key => [key, player[key]]));
        const result = character.owned(() => execute.call(this));
        if (typeof previousRoute.get('_moveRouteForcing') === 'boolean' && player._moveRouteForcing === true && player._moveRoute !== previousRoute.get('_moveRoute')) {
          playerRoute = { route: player._moveRoute, original: player._originalMoveRoute, originalIndex: player._originalMoveRouteIndex,
            previous: playerRoute?.previous ?? previousRoute };
          claimRouteUpdate();
        }
        // A message opened synchronously by this owned interpreter belongs to this session as well.
        if (!wasBusy && boolean(invoke(message, 'isBusy'))) captureMessage();
        // Preserve native combined-command semantics, then stop if their actual effects replaced this world.
        if (!current()) throw new Error('stale-fishing-owner');
        return result;
      };
      instance.setupChild = function(this: unknown, childList: unknown, childEventId: unknown): void {
        if (!Array.isArray(childList)) throw new TypeError('fishing-common-event-child-invalid');
        const parent = hostRecord(this);
        if (!parent) throw new TypeError('fishing-common-event-parent-invalid');
        parent._childInterpreter = interpreter(childList, depth + 1, integer(childEventId));
      };
      invoke(instance, 'setup', [list, eventId]);
      return instance;
    };
    const animation = (effect: FishingBlockingEffect & { kind: 'begin-presentation' | 'end-presentation' }): (() => boolean) => {
      const eventList = commonList(effect.kind === 'begin-presentation' ? ports.beginCommonEventId : ports.endCommonEventId);
      if (eventList) {
        if (boolean(invoke(message, 'isBusy')) || !boolean(invoke(window, 'isClosed'))) throw new Error('fishing-host-message-occupied');
        const child = interpreter(eventList);
        return () => { invoke(child, 'update'); return !boolean(invoke(child, 'isRunning')) && !boolean(invoke(message, 'isBusy')) && boolean(invoke(window, 'isClosed')); };
      }
      const imageReady = character.start(effect.surfing, () => clock.elapsedMs);
      const sequence = effect.kind === 'begin-presentation' ? [3, 2, 1, 0] : [0, 1, 2, 3];
      let started: number | null = null;
      const poll = (): boolean => {
        if (!imageReady()) return false;
        if (started === null) {
          write('_directionFix', true); write('_stepAnime', false); write('_walkAnime', false);
          started = clock.elapsedMs;
        }
        const index = Math.min(3, Math.floor((clock.elapsedMs - started) / 50));
        write('_pattern', sequence[index]!);
        return clock.elapsedMs - started >= 200;
      };
      poll();
      return poll;
    };
    const display = (text: string): (() => boolean) => {
      if (boolean(invoke(message, 'isBusy')) || !boolean(invoke(window, 'isClosed'))) throw new Error('fishing-host-message-occupied');
      invoke(message, 'add', [text]);
      captureMessage();
      return () => !boolean(invoke(message, 'isBusy')) && boolean(invoke(window, 'isClosed'));
    };
    const session: FishingHostSession = {
      sample,
      run(effect) {
        if (disposed) return;
        if (effect.kind === 'finished') { session.dispose(); return; }
        if (effect.kind === 'started') return;
        if (effect.kind === 'shake') { if (current()) write('_pattern', effect.frame); return; }
        if (!Number.isSafeInteger(effect.id) || effect.id < 1) throw new TypeError('fishing-host-effect-id-invalid');
        if (seen.has(effect.id)) return;
        if (waiting && effect.kind !== 'restore') throw new Error('fishing-host-effect-pending');
        stopWaiting(); seen.add(effect.id); sample();
        const entry: WaitingEffect = { id: effect.id, restoring: effect.kind === 'restore', settled: false, poll: () => false, stop() {} };
        waiting = entry;
        try {
          if (effect.kind === 'restore') { restore(); entry.poll = () => true; return; }
          if (!current()) throw new Error('stale-fishing-owner');
          switch (effect.kind) {
            case 'begin-presentation': case 'end-presentation': entry.poll = animation(effect); break;
            case 'open-message': entry.poll = display('\\^'); break;
            case 'dots': entry.poll = display('.'.repeat(effect.dots) + '\\^'); break;
            case 'bite-message': entry.poll = display(fishingMessage(root, 'bite') + '\\^'); break;
            case 'result-message': entry.poll = display(fishingMessage(root, effect.result === 'caught' ? 'caught' : effect.result === 'escaped' ? 'escaped' : 'noBite')); break;
            case 'exclamation': {
              if (effect.animationId === 0) { entry.poll = () => true; break; }
              if (!hostRecord(root.$dataAnimations)?.[effect.animationId]) throw new Error('fishing-host-animation-unavailable');
              if (boolean(invoke(player, 'isAnimationPlaying'))) throw new Error('fishing-host-animation-occupied');
              invoke(root.$gameTemp, 'requestAnimation', [[player], effect.animationId]);
              if (!boolean(invoke(player, 'isAnimationPlaying'))) throw new Error('fishing-host-animation-not-started');
              entry.poll = () => !boolean(invoke(player, 'isAnimationPlaying'));
              break;
            }
          }
        } catch (error) { ports.diagnostic?.('fishing-presentation:' + String(error)); settle(entry, 'failed'); }
      },
      update() {
        if (disposed || sending) return;
        sending = true;
        try {
          sample();
          if (waiting?.restoring) { settle(waiting, 'completed'); return; }
          if (!current()) { send({ interrupt: 'scene-closed' }); return; }
          if (!clock.active) return;
          const frame = ports.input.inputFrame();
          // Input is sampled before polling/ack; newly created effects never finish in this same update.
          const pending = waiting;
          if (pending) { if (pending.poll()) settle(pending, 'completed'); }
          else send({ confirm: frame.triggered.use === true, cancel: frame.triggered.back === true });
        } catch (error) { ports.diagnostic?.('fishing-presentation:' + String(error)); fail(); }
        finally { sending = false; }
      },
      dispose() {
        if (disposed || disposing) return;
        disposing = true;
        try { stopWaiting(); restore(); }
        finally {
          try { character.dispose(); }
          finally {
            disposed = true;
            try { removeBlur(); }
            finally { try { invoke(root, 'removeEventListener', ['focus', resume]); } finally { if (active === session) active = null; } }
          }
        }
      },
    };
    const blur = (): void => {
      if (disposed) return;
      // Charge the focused prefix at the blur boundary; never charge the following inactive interval.
      clock = sampleFishingClock(clock, { monotonicMs: now(), active: false });
      invoke(root.Input, 'clear');
      send({});
    };
    const resume = (): void => {
      if (disposed) return;
      clock = sampleFishingClock(clock, { monotonicMs: now(), active: true });
      invoke(root.Input, 'clear'); send({});
    };
    const removeBlur = ports.input.onBlur(blur);
    invoke(root, 'addEventListener', ['focus', resume]);
    active = session;
    return session;
  } };
}
