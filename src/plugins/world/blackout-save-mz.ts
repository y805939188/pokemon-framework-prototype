/** F save release. Native requests remain in the installed collector's one private slot. */
import type { BlackoutTransferAncestor, BlackoutNonTransferCompletion } from '../../framework/app/blackout-ports';
import type { TravelEffectResult, TravelReceipt } from '../../framework/app/world-travel-operation';
import type { WorldTravelLeaseCurrent, WorldMapBirthLifecycle, WorldBlackoutSourceLifecycle } from '../../framework/app/ports';
import type { BlackoutSaveApplication, BlackoutNativeSaveRequest, BlackoutNativeSaveOptions, BlackoutNativeSaveCoordinator } from './blackout-save-collector';
import { readNativeTravelLease } from './travel-lease-registry-mz';

/** Historical technical completion only. The caller must separately validate its current
 * App/generation, terminal receipt and exact native loaded/transfer-end boundary before retiring
 * anything. Unknown identity inputs are compared without reading their properties. */
export type BlackoutSaveScopeCompletionQuery = (application: unknown, generation: unknown, owner: unknown, receipt: unknown) => boolean;

interface ScopeCompletion { readonly app: object; readonly generation: number; readonly owner: object }
const scopeCompletions = new WeakMap<object, ScopeCompletion>();
export const isBlackoutSaveScopeCompleteForMZ: BlackoutSaveScopeCompletionQuery = (application, generation, owner, receipt) => {
  if (application === null || typeof application !== 'object' || owner === null || typeof owner !== 'object'
    || receipt === null || typeof receipt !== 'object' || typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 0) return false;
  const completion = scopeCompletions.get(receipt);
  return completion !== undefined && completion.app === application && completion.generation === generation && completion.owner === owner;
};

interface Application {
  readonly app: BlackoutSaveApplication; readonly generation: number;
  readonly owner: (owner: object) => boolean;
  readonly context: (owner: object, context: unknown) => boolean;
  readonly ancestor: (owner: object, parent: object, receipt: object) => boolean;
  readonly complete: (owner: object, receipt: object) => boolean;
  readonly nonTransfer?: (owner: object, completion: object) => boolean;
  readonly deferred: () => boolean;
}
interface Frame {
  readonly manager: object; readonly scene: object; readonly player: object;
  readonly map: object; readonly mapId: number; readonly data: object; readonly x: number; readonly y: number;
  readonly birth: WorldMapBirthLifecycle; readonly epoch: () => void;
}
interface Boundary { readonly frame: Frame; depth: number; status: 'running' | 'completed' | 'failed' }
interface Adoption {
  readonly app: Application; readonly owner: object; readonly parent: object; readonly receipt: object;
  readonly request: BlackoutNativeSaveRequest;
  readonly source: WorldBlackoutSourceLifecycle;
}
interface GrantBase {
  readonly app: Application; readonly owner: object; readonly frame: Frame;
  readonly physical: WorldTravelLeaseCurrent | null; readonly inherited: Adoption | null;
}
interface TransferGrant extends GrantBase {
  readonly kind: 'transfer';
  readonly app: Application; readonly owner: object; readonly receipt: TravelReceipt; readonly frame: Frame;
  readonly cold: WorldBlackoutSourceLifecycle | null;
}
interface ReturnedBoundary {
  readonly request: object; readonly previousScene: object; readonly scene: object;
  readonly guard: () => void;
}
interface NonTransferGrant extends GrantBase {
  readonly kind: 'non-transfer'; readonly completion: BlackoutNonTransferCompletion;
  readonly source: Readonly<{ handoff: WorldBlackoutSourceLifecycle; guard: () => void; returnedReceiver?: ReturnedBoundary }>;
  readonly inherited: Adoption;
}
type Grant = TransferGrant | NonTransferGrant;
const grantKey = (entry: Grant): object => entry.kind === 'transfer' ? entry.receipt : entry.completion;
const done = (): TravelEffectResult => ({ status: 'done' });
const failed = (reason: string): TravelEffectResult => ({ status: 'failed', reason });
const reason = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** Composition supplies the actual application getter, canonical producer and collector closures.
 * Methods are captured once per actual App; later property replacement cannot supply authority. */
export function createBlackoutSaveMZ(options: BlackoutNativeSaveOptions): BlackoutNativeSaveCoordinator {
  const { root, application, source, isProxy, captureNativeEpoch, captureNonTransferSource, collector, diagnostic } = options;
  const applications = new WeakMap<object, Omit<Application, 'generation'>>();
  const boundaries = new WeakMap<object, Boundary>();
  const completed = new WeakMap<object, { readonly app: object; readonly generation: number; readonly owner: object }>();
  const retiredScenes = new WeakMap<object, Pick<Grant, 'app' | 'frame'>>();
  let adoption: Adoption | null = null, grant: Grant | null = null, executing: Grant | null = null;
  let revision = 0;
  const diagnose = (message: string): void => { try { diagnostic(message); } catch { /* Diagnostics never replay a save. */ } };
  const object = (value: unknown): object => {
    if (value === null || typeof value !== 'object' || isProxy(value)) throw Error('blackout-save-own-object-required');
    return value;
  };
  const own = (value: object, key: string): unknown => {
    const descriptor = Object.getOwnPropertyDescriptor(object(value), key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw Error('blackout-save-own-data-required');
    return descriptor.value;
  };
  const managerNow = (): { readonly manager: object; readonly scene: unknown; readonly nextScene: unknown } => {
    // MZ's SceneManager is a static function namespace. Only this native namespace accepts
    // that shape; player/map/data/Scene values still use the ordinary object-only gate.
    const manager = own(root, 'SceneManager');
    if (manager === null || typeof manager !== 'object' && typeof manager !== 'function' || isProxy(manager)) throw Error('blackout-save-native-manager-required');
    const slot = (key: '_scene' | '_nextScene'): unknown => {
      const descriptor = Object.getOwnPropertyDescriptor(manager, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw Error('blackout-save-own-data-required');
      return descriptor.value;
    };
    return { manager, scene: slot('_scene'), nextScene: slot('_nextScene') };
  };
  const number = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw Error('blackout-save-native-number-invalid');
    return value;
  };
  const appNow = (): Application => {
    const app = application();
    if (!app) throw Error('blackout-save-application-unavailable');
    let captured = applications.get(app);
    if (!captured) {
      const owner = app.isBlackoutOwner, context = app.isBlackoutSourceContext, ancestor = app.isBlackoutTransferAncestor;
      const complete = app.isBlackoutReturnComplete, deferred = app.deferWorldTravelSave;
      const nonTransfer = app.isBlackoutNonTransferComplete;
      if ([owner, context, ancestor, complete, deferred].some(method => typeof method !== 'function')) throw Error('blackout-save-application-queries-unavailable');
      captured = { app, owner: owner.bind(app), context: context.bind(app), ancestor: ancestor.bind(app), complete: complete.bind(app), deferred: deferred.bind(app),
        ...(typeof nonTransfer === 'function' ? { nonTransfer: nonTransfer.bind(app) } : {}) };
      applications.set(app, captured);
    }
    const generation = app.stateGeneration;
    if (!Number.isSafeInteger(generation) || generation < 0 || application() !== app || app.stateGeneration !== generation) throw Error('blackout-save-application-changed');
    return { ...captured, generation };
  };
  const sameApp = (captured: Application): void => {
    if (application() !== captured.app || captured.app.stateGeneration !== captured.generation) throw Error('blackout-save-application-stale');
  };
  const frameNow = (scene: object, loaded = true): Frame => {
    const { manager, scene: currentScene, nextScene } = managerNow(), player = object(own(root, '$gamePlayer'));
    const map = object(own(root, '$gameMap')), data = object(own(root, '$dataMap'));
    if (currentScene !== scene || nextScene !== null || own(player, '_transferring') !== false) throw Error('blackout-save-native-not-stable');
    const mapId = number(own(map, '_mapId')), x = number(own(player, '_x')), y = number(own(player, '_y'));
    const birth = readNativeTravelLease(source)?.mapBirth;
    if (!birth || birth.manager !== manager || birth.scene !== scene || loaded && !birth.frame || birth.frame && (birth.frame.map !== map || birth.frame.mapId !== mapId || birth.frame.player !== player || birth.frame.data !== data)) throw Error('blackout-save-genuine-map-boundary-required');
    const epoch = captureNativeEpoch(player);
    epoch();
    return { manager, scene, player, map, mapId, data, x, y, birth, epoch };
  };
  const sameFrame = (expected: Frame, actual: Frame): boolean => expected.manager === actual.manager && expected.scene === actual.scene && expected.player === actual.player
    && expected.map === actual.map && expected.mapId === actual.mapId && expected.data === actual.data && expected.x === actual.x && expected.y === actual.y
    && (expected.birth === actual.birth || expected.birth.frame === null && actual.birth.frame !== null && expected.birth.birth === actual.birth.birth && expected.birth.queue === actual.birth.queue);
  const checkFrame = (expected: Frame): void => {
    expected.epoch();
    if (!sameFrame(expected, frameNow(expected.scene, expected.birth.frame !== null))) throw Error('blackout-save-native-epoch-stale');
    expected.epoch();
  };
  const physicalSame = (a: WorldTravelLeaseCurrent | null, b: WorldTravelLeaseCurrent | null): boolean => a === b || !!a && !!b && a.lease === b.lease && a.owner === b.owner && a.receipt === b.receipt
    && a.player === b.player && a.serial === b.serial && a.sourceScene === b.sourceScene && a.scene === b.scene && a.phase === b.phase;
  const retiredScene = (scene: object): boolean => {
    const retired = retiredScenes.get(scene);
    if (!retired) return false;
    const birth = readNativeTravelLease(source)?.mapBirth;
    if (birth?.scene === scene && (birth.birth !== retired.frame.birth.birth || birth.queue !== retired.frame.birth.queue)) {
      if (retiredScenes.get(scene) === retired) retiredScenes.delete(scene);
      return false;
    }
    return true;
  };
  const sourceOwner = (app: Application, scene: object): object | null => {
    const snapshot = readNativeTravelLease(source), physical = snapshot?.current, handoff = snapshot?.sourceHandoff;
    if (physical?.phase === 'arrived' && physical.scene === scene && app.owner(physical.owner) === true) return physical.owner;
    if (handoff?.phase === 'ready' && handoff.target === snapshot?.mapBirth && handoff.target?.scene === scene && handoff.generation === app.generation
      && app.owner(handoff.owner) === true && app.context(handoff.owner, handoff.context) === true) return handoff.owner;
    return null;
  };
  const requestForGrant = (entry: Grant, request: BlackoutNativeSaveRequest): boolean => {
    if (request.application !== entry.app.app || request.generation !== entry.app.generation) return false;
    if (entry.inherited?.request === request) return true;
    if (entry.kind === 'non-transfer') return false;
    const frame = entry.frame;
    return request.manager === frame.manager && request.scene === frame.scene && request.player === frame.player && request.map === frame.map
      && request.mapId === frame.mapId && request.data === frame.data && request.x === frame.x && request.y === frame.y
      && physicalSame(request.physical, entry.physical);
  };
  const checkGrant = (entry: Grant): void => {
    sameApp(entry.app);
    if (entry.kind === 'transfer' ? entry.app.complete(entry.owner, entry.receipt) !== true : entry.app.nonTransfer?.(entry.owner, entry.completion) !== true) throw Error('blackout-save-terminal-unissued');
    if (entry.kind === 'non-transfer') {
      entry.source.guard(); entry.source.returnedReceiver?.guard(); sameApp(entry.app);
    }
    sameApp(entry.app); checkFrame(entry.frame);
    const snapshot = readNativeTravelLease(source);
    if (entry.kind === 'non-transfer') {
      const returned = entry.source.returnedReceiver;
      if (returned && (returned.request !== entry.inherited.request || returned.previousScene !== entry.inherited.request.scene
        || returned.scene !== entry.frame.scene || returned.scene === returned.previousScene)) throw Error('blackout-save-nontransfer-receiver-unissued');
      if (!snapshot || snapshot.mapBirth !== entry.source.handoff.target || snapshot.current !== entry.physical && snapshot.current !== null
        || snapshot.sourceHandoff !== entry.source.handoff && snapshot.sourceHandoff !== null) throw Error('blackout-save-nontransfer-source-changed');
      return;
    }
    if (!snapshot || snapshot.current !== entry.physical) throw Error('blackout-save-terminal-native-changed');
    if (entry.cold) {
      if (snapshot.sourceHandoff !== entry.cold || entry.cold.target !== snapshot.mapBirth || entry.cold.target !== entry.frame.birth) throw Error('blackout-save-cold-source-changed');
    } else if (!snapshot.current || snapshot.current.owner !== entry.owner || snapshot.current.receipt !== entry.receipt || snapshot.current.phase !== 'arrived' || snapshot.current.scene !== entry.frame.scene || snapshot.current.player !== entry.frame.player) throw Error('blackout-save-terminal-receipt-stale');
  };
  const drain = (entry: Grant): void => {
    if (grant !== entry) return;
    try {
      checkGrant(entry);
      const returned = entry.kind === 'non-transfer' ? entry.source.returnedReceiver : undefined;
      const boundary = boundaries.get(returned ? returned.previousScene : entry.frame.scene);
      if (!boundary || boundary.status !== 'completed') return;
      if (returned && entry.kind === 'non-transfer') {
        // The new C1 Map has no transfer boundary. Inherit only the old boundary that this
        // helper actually observed for this immutable adopted request; never label the new
        // Scene completed or replace its genuine current frame with the old frame.
        const request = entry.inherited.request, frame = boundary.frame;
        if (frame.manager !== request.manager || frame.scene !== request.scene || frame.player !== request.player
          || frame.map !== request.map || frame.mapId !== request.mapId || frame.data !== request.data || frame.x !== request.x || frame.y !== request.y) throw Error('blackout-save-nontransfer-old-boundary-mismatch');
      } else if (!sameFrame(entry.frame, boundary.frame)) return;
      try { boundary.frame.epoch(); }
      catch { boundary.status = 'failed'; return; }
      const request = collector.current();
      if (grant !== entry) return;
      checkGrant(entry);
      if (grant !== entry) return;
      if (request && !requestForGrant(entry, request)) throw Error('blackout-save-retained-request-stale');
      // Revoke our grant before exact-take and before invoking the unknown original save.
      grant = null; revision++;
      if (returned) retiredScenes.set(returned.previousScene, { app: entry.app, frame: boundary.frame });
      completed.set(grantKey(entry), { app: entry.app.app, generation: entry.app.generation, owner: entry.owner });
      const consumedRevision = revision;
      const recordScopeCompletion = (): void => {
        // Unknown native code may replace the App, reserve again, or publish a successor.
        // A spent deduplication marker alone does not prove normal technical completion.
        checkGrant(entry);
        if (collector.current() !== null || revision !== consumedRevision || grant !== null) return;
        scopeCompletions.set(grantKey(entry), { app: entry.app.app, generation: entry.app.generation, owner: entry.owner });
      };
      if (!request) { recordScopeCompletion(); return; }
      const original = collector.take(request, entry.frame.scene);
      if (!original) return;
      checkGrant(entry);
      executing = entry;
      try { original(); }
      finally { if (executing === entry) executing = null; }
      recordScopeCompletion();
    } catch (error) {
      if (grant === entry) {
        grant = null; revision++;
        completed.set(grantKey(entry), { app: entry.app.app, generation: entry.app.generation, owner: entry.owner });
        retiredScenes.set(entry.frame.scene, { app: entry.app, frame: entry.frame });
      }
      diagnose(`blackout-save-release-failed:${reason(error)}`);
    }
  };
  return Object.freeze({
    adoptDeferredSave(owner: object, ancestor: BlackoutTransferAncestor): TravelEffectResult {
      const start = revision;
      try {
        const app = appNow();
        if (app.owner(owner) !== true || app.ancestor(owner, ancestor.owner, ancestor.receipt) !== true) throw Error('blackout-save-ancestor-unissued');
        sameApp(app);
        const snapshot = readNativeTravelLease(source), handoff = snapshot?.sourceHandoff;
        if (!handoff || handoff.owner !== owner || handoff.generation !== app.generation || app.context(owner, handoff.context) !== true) throw Error('blackout-save-ancestor-source-unissued');
        sameApp(app);
        const request = collector.current(), physical = snapshot?.current;
        if (request && (request.application !== app.app || request.generation !== app.generation || !physical || !request.physical || !physicalSame(physical, request.physical)
          || physical.owner !== ancestor.owner || physical.receipt !== ancestor.receipt || physical.phase !== 'arrived')) throw Error('blackout-save-ancestor-request-stale');
        sameApp(app);
        if (revision !== start || readNativeTravelLease(source) !== snapshot) throw Error('blackout-save-ancestor-changed');
        adoption = request ? { app, owner, parent: ancestor.owner, receipt: ancestor.receipt, request, source: handoff } : null;
        revision++; return done();
      } catch (error) { return failed(reason(error)); }
    },
    transferCompleted(owner: object, receipt: TravelReceipt): TravelEffectResult {
      const start = revision;
      try {
        const app = appNow();
        if (app.complete(owner, receipt) !== true) throw Error('blackout-save-terminal-unissued');
        sameApp(app);
        const previous = completed.get(receipt);
        if (previous?.app === app.app && previous.generation === app.generation && previous.owner === owner) return done();
        if (grant?.kind === 'transfer' && grant.owner === owner && grant.receipt === receipt && grant.app.app === app.app && grant.app.generation === app.generation) return done();
        const snapshot = readNativeTravelLease(source), physical = snapshot?.current ?? null;
        const scene = object(managerNow().scene), player = object(own(root, '$gamePlayer'));
        // App completion runs inside performTransfer, before onMapLoaded returns. Only its exact
        // arrived receipt may keep a provisional genuine birth; consumption still needs loaded
        // onTransferEnd evidence. Cold recovery never receives this unloaded allowance.
        const nativeArrival = physical?.owner === owner && physical.receipt === receipt && physical.phase === 'arrived' && physical.scene === scene && physical.player === player;
        const frame = frameNow(scene, !nativeArrival);
        if (receipt.generation !== app.generation || frame.mapId !== receipt.target.mapId || frame.x !== receipt.target.x || frame.y !== receipt.target.y) throw Error('blackout-save-terminal-target-mismatch');
        const arrived = physical?.owner === owner && physical.receipt === receipt && physical.phase === 'arrived' && physical.scene === scene && physical.player === frame.player;
        const handoff = snapshot?.sourceHandoff;
        const cold = !arrived && handoff?.owner === owner && handoff.generation === app.generation && handoff.phase === 'ready' && handoff.target === frame.birth ? handoff : null;
        if (!arrived && !cold) throw Error('blackout-save-terminal-native-proof-required');
        const inherited = adoption?.owner === owner && adoption.app.app === app.app && adoption.app.generation === app.generation ? adoption : null;
        const entry: TransferGrant = { kind: 'transfer', app, owner, receipt, frame, physical, cold, inherited };
        checkGrant(entry);
        if (revision !== start) throw Error('blackout-save-terminal-changed');
        grant = entry;
        if (adoption === inherited) adoption = null;
        revision++; drain(entry); return done();
      } catch (error) { return failed(reason(error)); }
    },
    nonTransferCompleted(owner: object, completion: BlackoutNonTransferCompletion): TravelEffectResult {
      const start = revision;
      try {
        const app = appNow();
        if (!app.nonTransfer) throw Error('blackout-save-nontransfer-query-unavailable');
        if (app.nonTransfer(owner, completion) !== true) throw Error('blackout-save-nontransfer-unissued');
        sameApp(app);
        const previous = completed.get(completion);
        if (previous?.app === app.app && previous.generation === app.generation && previous.owner === owner) return done();
        if (grant?.kind === 'non-transfer' && grant.owner === owner && grant.completion === completion && grant.app.app === app.app && grant.app.generation === app.generation) { checkGrant(grant); return done(); }
        if (!captureNonTransferSource) throw Error('blackout-save-nontransfer-source-unavailable');
        const inherited = adoption?.owner === owner && adoption.app.app === app.app && adoption.app.generation === app.generation ? adoption : null;
        const observation = object(captureNonTransferSource(owner)), snapshot = readNativeTravelLease(source), handoff = snapshot?.sourceHandoff;
        const guard = own(observation, 'guard');
        if (!handoff || own(observation, 'handoff') !== handoff || handoff.owner !== owner || handoff.generation !== app.generation || handoff.phase !== 'ready' || !handoff.target
          || typeof guard !== 'function' || isProxy(guard)) throw Error('blackout-save-nontransfer-source-unissued');
        // Optional relocation is read only from the producer's captured observation. Accessors,
        // Proxies and copied/borrowed issued proofs cannot replace its private guard.
        const descriptor = Object.getOwnPropertyDescriptor(observation, 'returnedReceiver');
        let returnedReceiver: ReturnedBoundary | undefined;
        if (descriptor) {
          if (!Object.hasOwn(descriptor, 'value')) throw Error('blackout-save-own-data-required');
          if (descriptor.value !== undefined) {
            const returned = object(descriptor.value), receiverGuard = own(returned, 'guard');
            if (typeof receiverGuard !== 'function' || isProxy(receiverGuard)) throw Error('blackout-save-nontransfer-receiver-unissued');
            returnedReceiver = { request: object(own(returned, 'request')), previousScene: object(own(returned, 'previousScene')), scene: object(own(returned, 'scene')),
              guard: (): void => { Reflect.apply(receiverGuard, returned, []); } };
          }
        }
        const observed = { handoff, guard: (): void => { Reflect.apply(guard, observation, []); }, ...(returnedReceiver ? { returnedReceiver } : {}) };
        observed.guard(); returnedReceiver?.guard(); sameApp(app);
        const frame = frameNow(handoff.target.scene);
        if (frame.birth !== handoff.target) throw Error('blackout-save-nontransfer-birth-stale');
        const request = collector.current();
        if (app.nonTransfer(owner, completion) !== true) throw Error('blackout-save-nontransfer-unissued');
        sameApp(app); observed.guard(); checkFrame(frame);
        if (revision !== start || readNativeTravelLease(source)?.sourceHandoff !== handoff) throw Error('blackout-save-nontransfer-changed');
        const replaceGrant = (): void => {
          const old = grant;
          if (old) {
            completed.set(grantKey(old), { app: old.app.app, generation: old.app.generation, owner: old.owner });
            retiredScenes.set(old.frame.scene, { app: old.app, frame: old.frame });
            grant = null;
          }
        };
        if (!request) {
          // An already taken original can still be on the stack; null collector
          // alone does not prove there is nothing left to deliver or preserve.
          if (!returnedReceiver && adoption === null && grant === null && executing === null && collector.current() === null) {
            const retirement = Object.getOwnPropertyDescriptor(observation, 'retireIdleBattleSource');
            if (retirement) {
              if (!('value' in retirement) || typeof retirement.value !== 'function' || isProxy(retirement.value))
                throw Error('blackout-save-no-request-source-retire-invalid');
              Reflect.apply(retirement.value, observation, [completion]);
            }
          }
          replaceGrant();
          completed.set(completion, { app: app.app, generation: app.generation, owner });
          if (adoption === inherited) adoption = null;
          revision++; return done();
        }
        if (!inherited || request !== inherited.request || !request.physical || own(observation, 'physical') !== request.physical
          || inherited.source.context !== handoff.context || inherited.source.serial !== handoff.serial || inherited.source.sourceScene !== handoff.sourceScene) throw Error('blackout-save-nontransfer-request-not-adopted');
        const entry: NonTransferGrant = { kind: 'non-transfer', app, owner, completion, frame, physical: request.physical, inherited, source: observed };
        checkGrant(entry);
        if (revision !== start) throw Error('blackout-save-nontransfer-changed');
        replaceGrant();
        grant = entry; if (adoption === inherited) adoption = null;
        revision++; drain(entry); return done();
      } catch (error) { return failed(reason(error)); }
    },
    observeTransferEnd(scene: object, phase: 'running' | 'completed' | 'failed'): void {
      try {
        const prior = boundaries.get(scene);
        if (phase === 'running') {
          if (prior?.depth) { prior.depth++; prior.status = 'failed'; return; }
          boundaries.set(scene, { frame: frameNow(scene), depth: 1, status: 'running' }); return;
        }
        if (!prior || prior.depth === 0) return;
        prior.depth--;
        if (phase === 'failed') prior.status = 'failed';
        if (prior.depth) return;
        if (prior.status !== 'running' || phase !== 'completed') { prior.status = 'failed'; return; }
        checkFrame(prior.frame); prior.status = 'completed';
        const entry = grant; if (entry?.frame.scene === scene) drain(entry);
      } catch (error) {
        const prior = boundaries.get(scene); if (prior) { prior.status = 'failed'; prior.depth = 0; }
        diagnose(`blackout-save-boundary-rejected:${reason(error)}`);
      }
    },
    beforeRequest(scene: object): 'retain' | 'pass' | 'refused' {
      try {
        const app = appNow(), active = app.deferred(); sameApp(app);
        const running = executing;
        if (running?.frame.scene === scene) {
          if (running.app.app === app.app && running.app.generation === app.generation) checkGrant(running);
          else retiredScenes.set(scene, { app: running.app, frame: running.frame });
          return 'refused';
        }
        const entry = grant;
        if (entry && entry.app.app === app.app && entry.app.generation === app.generation) {
          checkGrant(entry);
          if (entry.frame.scene !== scene) return 'refused';
          if (entry.kind === 'non-transfer') {
            const request = collector.current(); checkGrant(entry);
            if (grant !== entry || request !== entry.inherited.request) return 'refused';
          }
          return 'retain';
        }
        if (entry) {
          if (grant === entry) {
            grant = null; revision++;
            completed.set(grantKey(entry), { app: entry.app.app, generation: entry.app.generation, owner: entry.owner });
            retiredScenes.set(entry.frame.scene, { app: entry.app, frame: entry.frame });
          }
          if (entry.frame.scene === scene) return 'refused';
        }
        if (!active) return retiredScene(scene) ? 'refused' : 'pass';
        const snapshot = readNativeTravelLease(source), physical = snapshot?.current, handoff = snapshot?.sourceHandoff;
        const activeF = !!physical && app.owner(physical.owner) === true || !!handoff && app.owner(handoff.owner) === true;
        sameApp(app);
        // Ordinary E3 still uses the installer's existing defer/collector branch.
        if (!activeF) return retiredScene(scene) ? 'refused' : 'pass';
        frameNow(scene);
        const owner = sourceOwner(app, scene); sameApp(app);
        if (!owner) throw Error('blackout-save-active-source-unissued');
        frameNow(scene); sameApp(app); return 'retain';
      } catch (error) { diagnose(`blackout-save-request-rejected:${reason(error)}`); return 'refused'; }
    },
    requestRetained(request: BlackoutNativeSaveRequest): void {
      const entry = grant;
      if (!entry) return;
      try { if (collector.current() !== request || !requestForGrant(entry, request)) throw Error('blackout-save-retained-request-unissued'); drain(entry); }
      catch (error) { diagnose(`blackout-save-retained-request-rejected:${reason(error)}`); }
    },
  });
}
