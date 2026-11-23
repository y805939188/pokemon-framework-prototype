/** One successful load schedules one real App recovery; this book issues no F/native permission. */
import type { HostApplication } from '../application-host';
import type { BlackoutRunResult } from '../../framework/app/blackout-operation';
import type { WorldOperationOutcome } from '../../framework/app/world-operation';
import type { Content } from '../../framework/rules/types';
import type { GameState } from '../../framework/rules/state';
import { semanticFingerprint } from '../../framework/rules/semantic';
import { readNativeTravelLease } from './travel-lease-registry-mz';

type Application = Pick<HostApplication, 'stateGeneration' | 'saveBlocked' | 'encounterBlocked' | 'initializeBlackoutCompanions' | 'recoverBlackoutReturn'>;
export type BlackoutLoadRecoveryPhase = 'idle' | 'waiting-map' | 'initializing-projection' | 'handed-off' | 'completed' | 'stable-failed';
export interface BlackoutLoadRecoveryView {
  readonly phase: BlackoutLoadRecoveryPhase;
  readonly generation: number | null;
  readonly automaticAttempted: boolean;
  readonly reason: string | null;
}
export interface BlackoutLoadRecoveryOptions {
  readonly root: Record<string, unknown>;
  readonly source: object;
  readonly application: () => Application | null;
  readonly game: () => GameState;
  readonly content: () => Content;
  readonly isProxy: (value: unknown) => boolean;
  readonly diagnostic: (reason: string) => void;
}
/** Composition-only decision from this scheduler's private book. No owner, source or record escapes. */
export type BlackoutLoadRetryRoute =
  | { readonly kind: 'unowned' }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'owned'; readonly result: Promise<BlackoutRunResult> };
export interface BlackoutLoadRecoveryMZ {
  /** Ordinary DataManager.loadGame success only; after stateReplaced, before native reloadMapIfUpdated. */
  loaded(): void;
  /** Old Promise completions may not retire the next successful load. */
  invalidate(): void;
  /** Technical successful-load classification until its genuine Map is ready; never F authorization. */
  isCurrentLoad(application: object): boolean;
  /** Actual World entry coordinator result after original Map.onMapLoaded returned. Not an authority token. */
  entered(application: object, scene: object, outcome: WorldOperationOutcome | null): void;
  /** Blocks input/interpreters only while establishing a real parent; never block SceneManager/native ticks. */
  pending(): boolean;
  /** Actual post-update ready observation; repeated frames never repeat an automatic attempt. */
  pump(): Promise<BlackoutRunResult> | null;
  /** Explicit current-player intent after a visible stable failure. */
  retry(): Promise<BlackoutRunResult> | null;
  /** Sole composition decides delegation from this closed result, never view/CP/nullish guessing. */
  retryForApplication(application: object): BlackoutLoadRetryRoute;
  view(): BlackoutLoadRecoveryView;
}
interface Frame {
  readonly epoch: object; readonly manager: object; readonly scene: object; readonly birth: object; readonly queue: object;
  readonly map: object; readonly mapId: number; readonly player: object; readonly data: object;
}
interface LoadObservation {
  readonly application: Application; readonly generation: number; readonly system: object; readonly map: object; readonly player: object;
  scene: object | null; observing: boolean;
}
interface Entry {
  readonly application: Application; readonly generation: number; readonly system: object; readonly map: object; readonly player: object;
  readonly content: Content; readonly contentIdentity: string; readonly checkpointIdentity: string;
  readonly initialize: Application['initializeBlackoutCompanions']; readonly recover: Application['recoverBlackoutReturn'];
  phase: BlackoutLoadRecoveryPhase; scene: object | null; automaticAttempted: boolean; reason: string | null;
  promise: Promise<BlackoutRunResult> | null;
}
const why = (error: unknown): string => error instanceof Error ? error.message : String(error);
const checkpointIdentity = (state: GameState): string | null => {
  const checkpoint = state.world.pendingReturn;
  return checkpoint ? semanticFingerprint({ id: checkpoint.id, origin: checkpoint.origin, selection: checkpoint.selection }) : null;
};

export function createBlackoutLoadRecoveryMZ(options: BlackoutLoadRecoveryOptions): BlackoutLoadRecoveryMZ {
  const { root, source, application, game, content, isProxy, diagnostic } = options;
  let epoch: object = {}, entry: Entry | null = null, capturing = false;
  let lastLoad: LoadObservation | null = null;
  const object = (value: unknown): value is object => value !== null && (typeof value === 'object' || typeof value === 'function') && !isProxy(value);
  const own = (value: object, key: string): unknown => {
    if (isProxy(value)) throw Error('blackout-load-native-proxy');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) throw Error('blackout-load-native-own-data-required');
    return descriptor.value;
  };
  const report = (e: Entry, reason: string): void => {
    e.reason = reason;
    try { diagnostic(reason); } catch { /* Diagnostics cannot make a stale load current. */ }
  };
  const current = (e: Entry): void => {
    if (entry !== e || application() !== e.application || e.application.stateGeneration !== e.generation
      || own(root, '$gameSystem') !== e.system || own(root, '$gameMap') !== e.map || own(root, '$gamePlayer') !== e.player)
      throw Error('blackout-load-generation-stale');
    const actualContent = content();
    if (entry !== e || actualContent !== e.content || semanticFingerprint(actualContent) !== e.contentIdentity) throw Error('blackout-load-content-changed');
    if (entry !== e || e.application.stateGeneration !== e.generation) throw Error('blackout-load-generation-stale');
  };
  const nativeFrame = (e: Pick<Entry, 'scene' | 'map' | 'player'>, idleMessage = true): Frame | null => {
    if (!e.scene) return null;
    const snapshot = readNativeTravelLease(source), birth = snapshot?.mapBirth, loaded = birth?.frame;
    const manager = own(root, 'SceneManager'), data = own(root, '$dataMap');
    if (!snapshot || snapshot.registry !== source || !object(snapshot.nativeEpoch) || !birth || !loaded || !object(manager) || !object(data)) return null;
    if (birth.manager !== manager || birth.scene !== e.scene || own(manager, '_scene') !== e.scene || own(manager, '_nextScene') !== null
      || loaded.map !== e.map || loaded.player !== e.player || loaded.data !== data || own(e.map, '_mapId') !== loaded.mapId
      || !Number.isSafeInteger(loaded.mapId) || loaded.mapId <= 0 || own(e.player, '_transferring') !== false
      || own(e.scene, '_started') !== true || own(e.scene, '_active') !== true) return null;
    if (idleMessage) {
      const message = own(root, '$gameMessage');
      // Native message state is observed as own data; do not invoke replaceable isBusy while capturing a frame.
      if (!object(message)) return null;
      const texts = own(message, '_texts'), choices = own(message, '_choices');
      if (!object(texts) || !Array.isArray(texts) || own(texts, 'length') !== 0 || !object(choices) || !Array.isArray(choices) || own(choices, 'length') !== 0
        || own(message, '_numInputVariableId') !== 0 || own(message, '_itemChoiceVariableId') !== 0) return null;
    }
    return { epoch: snapshot.nativeEpoch, manager, scene: e.scene, birth: birth.birth, queue: birth.queue,
      map: loaded.map, mapId: loaded.mapId, player: loaded.player, data: loaded.data };
  };
  const frame = (e: Entry): Frame | null => {
    current(e); const result = nativeFrame(e); current(e); return result;
  };
  const currentLoad = (load: LoadObservation): void => {
    if (lastLoad !== load || application() !== load.application || load.application.stateGeneration !== load.generation
      || own(root, '$gameSystem') !== load.system || own(root, '$gameMap') !== load.map || own(root, '$gamePlayer') !== load.player)
      throw Error('blackout-load-observation-stale');
  };
  const observeLoadReady = (): void => {
    const load = lastLoad; if (!load?.observing) return;
    try { currentLoad(load); const ready = nativeFrame(load, false); currentLoad(load); if (ready) load.observing = false; }
    catch { if (lastLoad === load) load.observing = false; }
  };
  const sameFrame = (a: Frame, b: Frame | null): boolean => !!b && a.epoch === b.epoch && a.manager === b.manager && a.scene === b.scene
    && a.birth === b.birth && a.queue === b.queue && a.map === b.map && a.mapId === b.mapId && a.player === b.player && a.data === b.data;
  const observeExplicitRetryScene = (e: Entry): void => {
    current(e);
    const manager = own(root, 'SceneManager');
    if (!object(manager)) return;
    const scene = own(manager, '_scene');
    if (!object(scene) || scene === e.scene) return;
    // Native Menu.pop constructs another Map. Only its current private birth may
    // replace the old load Scene, while all saved timeline/source guards remain.
    const candidate = { scene, map: e.map, player: e.player }, ready = nativeFrame(candidate);
    current(e);
    if (!ready || !sameFrame(ready, nativeFrame(candidate))) return;
    const actual = game(); current(e);
    if (checkpointIdentity(actual) !== e.checkpointIdentity) return;
    e.scene = scene;
  };
  const failed = (e: Entry, reason: string): BlackoutRunResult => {
    if (entry === e) { e.phase = 'stable-failed'; report(e, reason); }
    return { status: 'failed', reason };
  };
  const settledParent = (e: Entry): void => {
    if (e.phase !== 'handed-off') return;
    try {
      current(e);
      if (e.application.saveBlocked || e.application.encounterBlocked) return;
      const actual = game(); current(e);
      if (!actual.world.pendingReturn) e.phase = 'completed';
      else failed(e, 'blackout-load-return-not-completed');
    } catch (error) { failed(e, why(error)); }
  };
  const start = (e: Entry, automatic: boolean): Promise<BlackoutRunResult> | null => {
    if (entry !== e) return null;
    if (e.promise && e.phase !== 'stable-failed' && e.phase !== 'completed') return e.promise;
    if (automatic && e.automaticAttempted) return e.promise;
    let sourceFrame: Frame;
    try {
      const ready = frame(e);
      if (!ready || e.application.saveBlocked || e.application.encounterBlocked) return null;
      const actual = game(); current(e);
      if (!actual.world.pendingReturn) { e.phase = 'completed'; return null; }
      if (checkpointIdentity(actual) !== e.checkpointIdentity) return Promise.resolve(failed(e, 'blackout-load-checkpoint-changed'));
      if (!sameFrame(ready, frame(e))) throw Error('blackout-load-source-changed');
      sourceFrame = ready;
    } catch (error) { return Promise.resolve(failed(e, why(error))); }
    // Publish the one action Promise before any application/provider call may reenter the pump.
    if (automatic) e.automaticAttempted = true;
    e.phase = 'initializing-projection';
    const pending = Promise.resolve().then(async (): Promise<BlackoutRunResult> => {
      try {
        current(e);
        try {
          const initialized = await Reflect.apply(e.initialize, e.application, []);
          if (initialized.status === 'failed') report(e, `blackout-load-projection:${initialized.reason}`);
        } catch (error) { report(e, `blackout-load-projection:${why(error)}`); }
        current(e);
        if (!sameFrame(sourceFrame, frame(e))) throw Error('blackout-load-source-changed');
        if (e.application.saveBlocked || e.application.encounterBlocked) throw Error('blackout-load-operation-active');
        const actual = game(); current(e);
        if (!actual.world.pendingReturn || checkpointIdentity(actual) !== e.checkpointIdentity) throw Error('blackout-load-checkpoint-changed');
        if (!sameFrame(sourceFrame, frame(e))) throw Error('blackout-load-source-changed');
        // Release this scheduler's presentation gate before the real parent can complete and drain a save.
        // Actual F synchronously establishes its private owner/save gate; this is not an admission acknowledgement.
        e.phase = 'handed-off';
        const result = await Reflect.apply(e.recover, e.application, []);
        if (entry !== e || application() !== e.application || e.application.stateGeneration !== e.generation) return result;
        if (result.status === 'failed' || result.status === 'cancelled') return failed(e, result.status === 'failed' ? result.reason : 'blackout-load-cancelled');
        if (result.status === 'completed' || result.status === 'arrived') e.phase = 'completed';
        return result;
      } catch (error) { return failed(e, why(error)); }
    });
    e.promise = pending; return pending;
  };
  return Object.freeze({
    loaded(): void {
      const previous = entry, token = {}; epoch = token; entry = null; capturing = true;
      try {
        const app = application(), system = own(root, '$gameSystem'), map = own(root, '$gameMap'), player = own(root, '$gamePlayer');
        if (!app || !object(system) || !object(map) || !object(player)) throw Error('blackout-load-application-unavailable');
        const generation = app.stateGeneration, actual = game(), actualContent = content();
        const initialize = app.initializeBlackoutCompanions, recover = app.recoverBlackoutReturn;
        if (epoch !== token || !Number.isSafeInteger(generation) || generation < 0 || app.stateGeneration !== generation || application() !== app) return;
        if (lastLoad?.application === app && lastLoad.generation === generation) { entry = previous; return; }
        lastLoad = { application: app, generation, system, map, player, scene: null, observing: true };
        const checkpoint = checkpointIdentity(actual);
        if (checkpoint === null) return;
        if (typeof initialize !== 'function' || typeof recover !== 'function') throw Error('blackout-load-recovery-unavailable');
        const candidate: Entry = { application: app, generation, system, map, player, content: actualContent,
          contentIdentity: semanticFingerprint(actualContent), checkpointIdentity: checkpoint,
          initialize, recover, phase: 'waiting-map', scene: null, automaticAttempted: false, reason: null, promise: null };
        if (epoch === token && application() === app && app.stateGeneration === generation) entry = candidate;
      } catch (error) { if (epoch === token) { try { diagnostic(why(error)); } catch { /* Diagnostic only. */ } } }
      finally { if (epoch === token) capturing = false; }
    },
    invalidate(): void { epoch = {}; entry = null; lastLoad = null; capturing = false; },
    isCurrentLoad(app: object): boolean {
      const load = lastLoad; if (!load?.observing || load.application !== app) return false;
      try { currentLoad(load); return lastLoad === load && load.observing; } catch { return false; }
    },
    entered(app: object, scene: object, outcome: WorldOperationOutcome | null): void {
      // Ignore late former-Scene observations before they can replace a successor's wait.
      if (!object(scene)) return;
      try {
        const manager = own(root, 'SceneManager'), birth = readNativeTravelLease(source)?.mapBirth;
        if (!object(manager) || own(manager, '_scene') !== scene || birth?.scene !== scene) return;
      } catch { return; }
      const load = lastLoad;
      if (load && load.application === app && outcome && outcome.status !== 'refused') {
        try {
          currentLoad(load);
          if (load.scene !== null && load.scene !== scene) load.observing = false;
          else load.scene = scene;
        } catch { /* Old observations cannot change the current load marker. */ }
      }
      const e = entry;
      if (!e || e.application !== app || e.phase === 'completed' || e.phase === 'initializing-projection') return;
      try {
        current(e);
        if (outcome?.status === 'refused') { failed(e, `blackout-load-entry:${outcome.reason}`); return; }
        if (!outcome) return;
        if (e.scene !== null && e.scene !== scene && e.phase === 'waiting-map') { failed(e, 'blackout-load-source-changed'); return; }
        // The actual entry result is a scheduling observation. F still authenticates its own current Map source.
        e.scene = scene;
      } catch (error) { failed(e, why(error)); }
    },
    pending(): boolean { return capturing || entry?.phase === 'waiting-map' || entry?.phase === 'initializing-projection'; },
    pump(): Promise<BlackoutRunResult> | null {
      observeLoadReady();
      const e = entry; if (e) settledParent(e);
      return e?.phase === 'waiting-map' || e?.phase === 'initializing-projection' ? start(e, true) : e?.promise ?? null;
    },
    retry(): Promise<BlackoutRunResult> | null {
      const e = entry; if (e) settledParent(e);
      if (!e || e.phase !== 'stable-failed') return e?.promise ?? null;
      return start(e, false);
    },
    retryForApplication(app: object): BlackoutLoadRetryRoute {
      const observed = entry, token = epoch;
      let actual: Application | null, generation: number;
      try {
        actual = application();
        if (actual !== app) return { kind: 'refused', reason: 'blackout-load-retry-foreign-application' };
        generation = actual.stateGeneration;
        if (epoch !== token || entry !== observed || !Number.isSafeInteger(generation) || generation < 0)
          return { kind: 'refused', reason: 'blackout-load-retry-superseded' };
      } catch (error) { return { kind: 'refused', reason: `blackout-load-retry:${why(error)}` }; }
      // CP-null technical load observations do not own F. Retired generations and a
      // completed load cannot capture a later legitimate live F in the same App.
      if (!observed || observed.application !== actual || observed.generation !== generation || observed.phase === 'completed')
        return { kind: 'unowned' };
      if (observed.phase !== 'stable-failed') return { kind: 'refused', reason: `blackout-load-retry-${observed.phase}` };
      try { observeExplicitRetryScene(observed); }
      catch (error) {
        const reason = why(error); failed(observed, reason);
        return { kind: 'refused', reason };
      }
      // This is precisely the existing explicit retry path. A missing ready frame is
      // still an owned refusal, never permission to bypass it through App.recover.
      const result = start(observed, false);
      return result ? { kind: 'owned', result } : { kind: 'refused', reason: 'blackout-load-retry-not-ready' };
    },
    view(): BlackoutLoadRecoveryView { const e = entry; return Object.freeze({ phase: e?.phase ?? 'idle', generation: e?.generation ?? null,
      automaticAttempted: e?.automaticAttempted ?? false, reason: e?.reason ?? null }); },
  });
}
