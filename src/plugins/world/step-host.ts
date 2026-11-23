import { hostRecord, invoke } from './host-access';

export interface FieldStepOwner {
  readonly owner: object;
  readonly generation: number;
  readonly map: object;
  readonly mapId: number;
}
export interface CompletedHostStep {
  readonly id: string;
  readonly owner: FieldStepOwner;
  readonly player: object;
  readonly x: number;
  readonly y: number;
  readonly regionId: number;
  readonly terrainTag: number;
  readonly sceneActive: boolean;
}
export interface FieldStepHostPorts {
  current(): FieldStepOwner | null;
  /** Technical START marker only; it cannot complete a step or write statistics. */
  movementStarted?(player: object): void;
  movementTracked?(player: object, id: string): void;
  movementSettled?(player: object, id: string): void;
  movementCancelled?(player: object, id: string): void;
  /** Install the prefix and run its owned UI/poison stages, then answer exactly once. */
  runCompletedStep(step: Readonly<CompletedHostStep>, done: (result: FieldStepCompletion) => void): void | (() => void);
  /** The App has finished. Complete native/legacy dispatch synchronously before the next input opportunity. */
  dispatchEncounter?(step: Readonly<CompletedHostStep>): void;
  retireEncounter?(step: Readonly<CompletedHostStep>): void;
  failed(step: Readonly<CompletedHostStep> | null, error: unknown): void;
}
export type FieldStepCompletion = 'continue' | 'handled' | 'ordinary' | 'arrival-only';
export interface AdoptedFieldStep {
  /** Activate only the exact reserved native target; this does not call the App. */
  activate(step: Readonly<CompletedHostStep>): void;
  done(result: FieldStepCompletion): void;
  cancel(): void;
}
export interface FieldStepHost {
  pending(): boolean;
  /** E3's genuine arrival reserves this same native D context before its first Map update. */
  adoptConnection(step: Readonly<CompletedHostStep>, cancelled: () => void): AdoptedFieldStep;
  /** Private mechanical arrival hold, before any provider reads; no App D authority. */
  holdSurfLanding(step: Readonly<CompletedHostStep>, cancelled: () => void, sameMotion: () => boolean): AdoptedFieldStep & { readonly entry: object; terminal(current: () => boolean): void };
  ownsTerminalArrival(player: object): boolean;
  /** The application distinguishes owned child UI from an actual scene close before calling cancel. */
  cancel(reason: 'scene-closed' | 'state-replaced' | 'map-entered' | 'stale'): void;
  stateReplaced(): void;
  mapEntered(): void;
  /** App calls synchronously while its parent still owns the completed step. */
  dispatchArrival(id: string): FieldStepArrival;
  /** Available once, only while resuming that completed step's original nonmoving/event dispatch. */
  takeEncounterStep(player: object): Readonly<CompletedHostStep> | null;
}
export type FieldStepArrival = { readonly status: 'event-dispatched' | 'action-dispatched' | 'ordinary-opportunity' }
  | { readonly status: 'blocked' | 'failed'; readonly reason: string };
type HostMethod = (this: unknown, ...args: unknown[]) => unknown;
function requiredMethod(record: Record<string, unknown>, name: string): HostMethod {
  const value = record[name];
  if (typeof value !== 'function') throw new Error(`field-step-host-method-unavailable:${name}`);
  return value as HostMethod;
}
function integer(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`field-step-host-invalid:${name}`);
  return value;
}
function flag(owner: unknown, name: string): boolean {
  const value = invoke(owner, name);
  if (typeof value !== 'boolean') throw new Error(`field-step-host-invalid:${name}`);
  return value;
}

/**
 * MZ only. Successful increaseSteps registers movement identity; updateMove completion readies it. The application
 * owns rule writes. No transfer/start wrapper is installed: PS_World's unique entry producer calls the public hooks.
 */
export function installFieldStepHost(rootValue: unknown, ports: FieldStepHostPorts): FieldStepHost {
  const root = hostRecord(rootValue);
  const prototype = hostRecord(hostRecord(root?.Game_Player)?.prototype);
  if (!root || !prototype) throw new Error('field-step-host-player-unavailable');
  // Check the complete required surface before changing any method.
  const increase = requiredMethod(prototype, 'increaseSteps');
  const updateMove = requiredMethod(prototype, 'updateMove');
  const nonmoving = requiredMethod(prototype, 'updateNonmoving');
  const canMove = requiredMethod(prototype, 'canMove');
  let sequence = 0n;
  let moving = new WeakMap<object, { id: string; owner: FieldStepOwner }>();
  let ready = new WeakMap<object, { id: string; owner: FieldStepOwner }>();
  type Active = { step: Readonly<CompletedHostStep>; settled: boolean; arrival?: FieldStepArrival; cancel?: () => void; terminal?: () => boolean; motion?: () => boolean };
  let active: Active | null = null;
  let encounterStep: Readonly<CompletedHostStep> | null = null;
  const retiredSurfMotions = new WeakMap<object, { readonly entry: Active; readonly current: () => boolean }>();
  const dispatching = new WeakSet<object>();
  const owned = (owner: FieldStepOwner, player: object): boolean => {
    try {
      const current = ports.current();
      return !!current && current.owner === owner.owner && current.generation === owner.generation &&
        current.map === owner.map && current.mapId === owner.mapId && root.$gameMap === owner.map && root.$gamePlayer === player;
    } catch { return false; }
  };
  const currentStep = (step: Readonly<CompletedHostStep>): boolean => {
    try {
      const player = hostRecord(step.player);
      return owned(step.owner, step.player) && player?.x === step.x && player.y === step.y;
    } catch { return false; }
  };
  const cancel = (_reason: 'scene-closed' | 'state-replaced' | 'map-entered' | 'stale'): void => {
    const previous = active; active = null; encounterStep = null;
    moving = new WeakMap(); ready = new WeakMap();
    if (!previous || previous.settled) return;
    previous.settled = true;
    if (previous.motion) retiredSurfMotions.set(previous.step.player, { entry: previous, current: previous.motion });
    ports.movementCancelled?.(previous.step.player, previous.step.id);
    ports.retireEncounter?.(previous.step);
    try { previous.cancel?.(); } catch (error) { ports.failed(previous.step, error); }
  };
  const pending = (): boolean => {
    const entry = active;
    if (entry && !currentStep(entry.step) && active === entry && !entry.settled) cancel('stale');
    return active !== null;
  };
  const terminalCurrent = (entry: Active): boolean => { try { return !entry.terminal || entry.terminal(); } catch { return false; } };
  const claim = (step: Readonly<CompletedHostStep>): { entry: Active; done: (result: FieldStepCompletion) => void } => {
    if (active) throw Error('field-step-already-active');
    const entry: Active = { step, settled: false }; active = entry;
    const finish = (successful: boolean): void => {
      // Native arrival and even its final location observation may synchronously issue a successor.
      // Close only this exact still-current entry after those callbacks have returned.
      if (entry.settled || active !== entry) return;
      const current = currentStep(entry.step);
      if (entry.settled || active !== entry) return;
      if (!current || !terminalCurrent(entry)) { cancel('stale'); return; }
      entry.settled = true; active = null;
      // No await or input update separates retiring the finished owner from native Scene_Map dispatch.
      // Its public operation gates must see the App's real terminal state, including any successor owner.
      if (successful && entry.arrival?.status === 'ordinary-opportunity') {
        try { ports.dispatchEncounter?.(entry.step); } catch (error) { ports.failed(entry.step, error); }
      } else ports.retireEncounter?.(entry.step);
      ports.movementSettled?.(entry.step.player, entry.step.id);
    };
    const done = (result: FieldStepCompletion): void => {
      if (entry.settled || active !== entry) return;
      const current = currentStep(entry.step);
      if (entry.settled || active !== entry) return;
      if (!current || !terminalCurrent(entry)) { cancel('stale'); return; }
      if (result === 'handled' || result === 'ordinary') { finish(result === 'ordinary'); return; }
      if (result !== 'continue' && result !== 'arrival-only') { ports.failed(entry.step, new Error('field-step-invalid-result')); return; }
      const arrival = entry.arrival ?? host.dispatchArrival(entry.step.id);
      finish(result === 'continue' && arrival.status === 'ordinary-opportunity');
      if (arrival.status === 'failed') ports.failed(entry.step, new Error(arrival.reason));
    };
    return { entry, done };
  };
  const host: FieldStepHost = {
    holdSurfLanding(step, cancelled, sameMotion) {
      const { entry, done } = claim(Object.freeze({ ...step, owner: Object.freeze({ ...step.owner }) }));
      entry.cancel = cancelled; entry.motion = sameMotion; let activated = false;
      return Object.freeze({ entry,
        activate(next: Readonly<CompletedHostStep>): void {
          if (activated || entry.settled || active !== entry || !next.id || next.player !== entry.step.player
            || next.owner.owner !== entry.step.owner.owner || next.owner.generation !== entry.step.owner.generation
            || next.owner.map !== entry.step.owner.map || next.owner.mapId !== entry.step.owner.mapId || next.x !== entry.step.x || next.y !== entry.step.y
            || !currentStep(next) || active !== entry || entry.settled) throw Error('surf-landing-native-scope-stale');
          entry.step = Object.freeze({ ...next, owner: Object.freeze({ ...next.owner }) }); activated = true;
        },
        terminal(current: () => boolean): void { if (active !== entry || entry.settled || entry.terminal) return; entry.terminal = current; done('arrival-only'); },
        done,
        cancel(): void { if (active === entry && !entry.settled) cancel('stale'); },
      });
    },
    ownsTerminalArrival(player): boolean {
      const entry = active; return !!entry && dispatching.has(player) && entry.step.player === player && !!entry.terminal && terminalCurrent(entry) && active === entry && !entry.settled;
    },
    adoptConnection(step, cancelled) {
      if (!step.id || !currentStep(step) || active) throw Error('field-connection-target-stale');
      const { entry, done } = claim(Object.freeze({ ...step, owner: Object.freeze({ ...step.owner }) }));
      entry.cancel = cancelled;
      return Object.freeze({
        activate(next: Readonly<CompletedHostStep>): void {
          const old = entry.step;
          if (entry.settled || active !== entry || next.id !== old.id || next.player !== old.player || next.owner.owner !== old.owner.owner || next.owner.generation !== old.owner.generation || next.owner.map !== old.owner.map || next.owner.mapId !== old.owner.mapId || next.x !== old.x || next.y !== old.y || !currentStep(next)) throw Error('field-connection-activation-stale');
          if (entry.settled || active !== entry) throw Error('field-connection-activation-stale');
          entry.step = Object.freeze({ ...next, owner: Object.freeze({ ...next.owner }) });
        },
        done,
        cancel(): void { if (active === entry && !entry.settled) cancel('stale'); },
      });
    },
    pending, cancel, stateReplaced: () => cancel('state-replaced'), mapEntered: () => cancel('map-entered'),
    dispatchArrival(id) {
      const entry = active;
      if (!entry || entry.settled || entry.step.id !== id || !currentStep(entry.step) || active !== entry || !terminalCurrent(entry)) return { status: 'blocked', reason: 'stale-completed-step' };
      if (entry.arrival) return { status: 'blocked', reason: 'arrival-already-dispatched' };
      // Consume before any native callback can reenter. The parent/host locks remain held through this call.
      entry.arrival = { status: 'blocked', reason: 'arrival-in-progress' };
      const step = entry.step, player = hostRecord(step.player)!, map = hostRecord(step.owner.map)!;
      const setup = requiredMethod(map, 'setupStartingEvent'), action = requiredMethod(player, 'triggerAction');
      let event = false, acted = false;
      const stale = Object.freeze({}), replacements: { owner: Record<string, unknown>; key: string; before: PropertyDescriptor | undefined; wrapper: HostMethod }[] = [];
      let inScope = true;
      const assertDispatch = (): void => { if (active !== entry || entry.settled || !terminalCurrent(entry)) throw stale; };
      const observe = (owner: Record<string, unknown>, key: string, original: HostMethod, result?: (value: unknown) => void): void => {
        const before = Object.getOwnPropertyDescriptor(owner, key);
        const wrapper: HostMethod = function(...args) {
          // A later hook may retain this wrapper. Once the synchronous dispatch
          // ends it must transparently delegate, without this old entry's guards.
          if (!inScope) return Reflect.apply(original, this, args);
          assertDispatch(); const value = Reflect.apply(original, this, args); result?.(value); return value;
        };
        owner[key] = wrapper; replacements.push({ owner, key, before, wrapper });
      };
      try {
        const eventRunning = flag(map, 'isEventRunning');
        if (active !== entry || entry.settled || !terminalCurrent(entry)) return { status: 'blocked', reason: 'stale-completed-step' };
        if (eventRunning) return entry.arrival = { status: 'blocked', reason: 'event-already-running' };
        observe(map, 'setupStartingEvent', setup, value => { if (typeof value !== 'boolean') throw new Error('arrival-event-result-invalid'); event ||= value; });
        observe(player, 'triggerAction', action, value => { if (typeof value !== 'boolean') throw new Error('arrival-action-result-invalid'); acted ||= value; });
        // Pinned updateNonmoving calls these between its boolean readers. Guard
        // the next real call when a prior callback retired the source; never
        // rewrite a native return value to manufacture a short circuit.
        const party = hostRecord(root.$gameParty);
        for (const [owner, key] of [[map, 'isEventRunning'], [player, 'checkEventTriggerHere'], [player, 'updateEncounterCount'], [party, 'onPlayerWalk']] as const) {
          const method = owner?.[key]; if (owner && typeof method === 'function') observe(owner, key, method as HostMethod);
        }
        encounterStep = step; dispatching.add(step.player);
        assertDispatch();
        nonmoving.call(step.player, true, step.sceneActive);
        assertDispatch();
        return entry.arrival = event ? { status: 'event-dispatched' } : acted ? { status: 'action-dispatched' }
          : step.sceneActive ? { status: 'ordinary-opportunity' } : { status: 'blocked', reason: 'scene-inactive' };
      } catch (error) {
        if (error === stale) return { status: 'blocked', reason: 'stale-completed-step' };
        return entry.arrival = { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
      } finally {
        inScope = false; encounterStep = null; dispatching.delete(step.player);
        for (const { owner, key, before, wrapper } of replacements.reverse()) if (owner[key] === wrapper) {
          if (before) Object.defineProperty(owner, key, before); else delete owner[key];
        }
      }
    },
    takeEncounterStep(player) {
      const step = encounterStep;
      if (!step || step.player !== player || !currentStep(step)) return null;
      encounterStep = null;
      return step;
    },
  };
  prototype.increaseSteps = function(this: object, ...args: unknown[]): unknown {
    try { ports.movementStarted?.(this); } catch (error) { try { ports.failed(null, error); } catch { /* Observer reporting cannot replace native execution. */ } }
    const result = increase.apply(this, args);
    if (this !== root.$gamePlayer) return result;
    try {
      if (flag(this, 'isMoving') && !flag(this, 'isJumping')) {
        retiredSurfMotions.delete(this);
        const owner = ports.current();
        if (owner && owned(owner, this)) {
          ready.delete(this); moving.delete(this);
          if (!flag(this, 'isMoveRouteForcing') && !flag(owner.map, 'isEventRunning')) {
            const id = `mz-step:${owner.generation}:${++sequence}`;
            moving.set(this, { id, owner: { ...owner } }); ports.movementTracked?.(this, id);
          }
        }
      }
    } catch (error) { moving.delete(this); ready.delete(this); ports.failed(null, error); }
    return result;
  };
  prototype.updateMove = function(this: object, ...args: unknown[]): unknown {
    const result = updateMove.apply(this, args);
    const movement = moving.get(this);
    if (movement && !flag(this, 'isMoving') && !flag(this, 'isJumping')) {
      moving.delete(this);
      if (owned(movement.owner, this)) ready.set(this, movement);
    }
    return result;
  };
  prototype.updateNonmoving = function(this: object, ...args: unknown[]): unknown {
    if (this !== root.$gamePlayer) return nonmoving.apply(this, args);
    const retired = retiredSurfMotions.get(this);
    if (retired) {
      // Retired generation/source work cannot replay this old physical jump's
      // arrival under a successor. A genuinely new native motion has a new marker.
      let sameMotion = false; try { sameMotion = retired.current(); } catch { /* A retired observer cannot replace native execution. */ }
      if (!sameMotion) retiredSurfMotions.delete(this);
      else if (args[0] === true || flag(this, 'isJumping') || flag(this, 'isMoving')) {
        if (!flag(this, 'isJumping') && !flag(this, 'isMoving') && retiredSurfMotions.get(this) === retired) retiredSurfMotions.delete(this);
        return undefined;
      } else retiredSurfMotions.delete(this);
    }
    if (dispatching.has(this)) return undefined;
    if (pending()) return undefined;
    const movement = ready.get(this);
    if (!movement) return nonmoving.apply(this, args);
    ready.delete(this); // Consume before application or host callbacks can reenter.
    if (!owned(movement.owner, this)) return undefined;
    let step: Readonly<CompletedHostStep>;
    try {
      if (flag(this, 'isMoveRouteForcing') || flag(movement.owner.map, 'isEventRunning')) return nonmoving.call(this, true, args[1]);
      const player = hostRecord(this)!;
      step = {
        id: movement.id, owner: movement.owner, player: this,
        x: integer(player.x, 'x'), y: integer(player.y, 'y'),
        regionId: integer(invoke(this, 'regionId'), 'regionId'), terrainTag: integer(invoke(this, 'terrainTag'), 'terrainTag'),
        sceneActive: args[1] === true,
      };
    } catch (error) { ports.failed(null, error); return undefined; }
    if (active) { ports.failed(step, Error('field-step-already-active')); return undefined; }
    const { entry, done } = claim(step);
    try {
      const stop = ports.runCompletedStep(step, done);
      if (typeof stop === 'function' && !entry.settled) entry.cancel = stop;
    } catch (error) {
      ports.failed(step, error);
      if (!entry.settled) done('arrival-only');
    }
    return undefined;
  };
  prototype.canMove = function(this: object, ...args: unknown[]): unknown { return (dispatching.has(this) || !pending()) && canMove.apply(this, args); };
  // Leave Graphics/UI running while the owned confirmation/selection pauses conflicting interpreter messages.
  for (const [className, methodName] of [['Game_Map', 'updateInterpreter'], ['Game_Event', 'updateParallel'], ['Game_CommonEvent', 'update']] as const) {
    const target = hostRecord(hostRecord(root[className])?.prototype), original = target?.[methodName];
    if (target && typeof original === 'function') target[methodName] = function(this: unknown, ...args: unknown[]): unknown {
      return pending() ? undefined : Reflect.apply(original, this, args);
    };
  }
  return host;
}
