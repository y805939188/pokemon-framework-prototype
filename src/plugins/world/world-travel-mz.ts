import { releaseRecoveredArrivalMZ } from './recovered-arrival-mz';
import { parseMZHomeConfiguration } from './world-home-mz';
import { createBlackoutSaveMZ, isBlackoutSaveScopeCompleteForMZ } from './blackout-save-mz';
import { createBlackoutPresentationMZ } from './blackout-presentation-mz';
import { createFieldBlackoutEntryMZ } from './field-blackout-entry-mz';
import { createFieldMoveDataMZ } from './field-move-data-mz';
import type { BlackoutNativeSaveRequest, BlackoutSaveApplication, BlackoutNonTransferSourceObservation, BlackoutNonTransferReturnedReceiver } from './blackout-save-collector';
import type { BlackoutApplicationQueries, BlackoutNonTransferCompletion, WorldBlackoutHost } from '../../framework/app/blackout-ports';
/** Production E3 native UI/transfer/save composition. Business state remains in GameApplication. */
import type { HostApplication } from '../application-host';
import type { WorldTravelHost } from '../../framework/app/world-travel-ports';
import type { TravelEffectResult, TravelHostEffect } from '../../framework/app/world-travel-operation';
import { isTravelLocation } from '../../framework/rules/world-travel';
import type { WorldTravelLeaseCurrent, WorldMapBirthLifecycle } from '../../framework/app/ports';
import type { WorldLocation } from '../../framework/rules/world-data';
import type { MZTerrainMeanings } from './runtime-inputs-mz';
import { createConfiguredTransferMZ, parseSurfPassageMode } from './configured-transfer-mz';
import { createFieldMoveFramesMZ } from './field-move-frames-mz';
import { readNativeTravelLease } from './travel-lease-registry-mz';
import { worldPlugin } from './world-host';
import type { ConnectionStepReservation } from './completed-step-mz';
import type { TravelReceipt } from '../../framework/app/world-travel-operation';
import { hostRecord, invoke } from './host-access';
import { travelText } from './field-presentation-messages';
import type { FieldPresentationText } from './field-presentation-messages';
type Application = Pick<HostApplication, 'stateGeneration' | 'isWorldTravelOwner' | 'isWorldTravelReceipt' | 'canPerformWorldTravel' | 'confirmWorldTravelArrival' | 'failWorldTravelTransfer' | 'finishWorldTravelArrival' | 'deferWorldTravelSave' | 'runWorldTravel' | 'isWorldTravelStepPending' | 'clearBlackoutCompanionProjection'> & BlackoutApplicationQueries;
export interface WorldTravelPresentation {
  animate?(kind: 'fly' | 'teleport', owner: object, guard: () => void): Promise<void>;
  flyCallback?(owner: object, guard: () => void): Promise<void> | void;
  cleanupFlight?(owner: object, guard: () => void): Promise<void> | void;
}
const reason = (error: unknown): string => error instanceof Error ? error.message : String(error);
const method = (value: unknown): value is (this: unknown, ...args: unknown[]) => unknown => typeof value === 'function';
const natural = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export function createWorldTravelMZ(root: Record<string, unknown>, current: () => Application | null, meanings: MZTerrainMeanings,
  parameters: Record<string, unknown>, diagnose: (reason: string) => void, nativeIsProxy: (value: unknown) => boolean, initialPresentation: WorldTravelPresentation = {}, nodeRecordPrototype: object | null = null) {
  const homes = parseMZHomeConfiguration(parameters, nativeIsProxy);
  if (!homes.blackout.characterHome && !homes.blackout.globalHome) {
    const manager = hostRecord(root.PluginManager);
    const legacyMapId = typeof manager?.parameters === 'function' ? hostRecord(invoke(manager, 'parameters', ['PS_BattleFlow']))?.homeMapId : undefined;
    if (typeof legacyMapId === 'string' && Number(legacyMapId) > 0) {
      diagnose('legacy-home-configuration-not-migrated: set PS_World.CharacterHome or PS_World.GlobalHome; PS_BattleFlow.homeMapId is ignored');
    }
  }
  // Only serialized checkpoint DTOs cross this copier. Owners, receipts and native proofs retain identity.
  const checkpointData = createFieldMoveDataMZ(nativeIsProxy, nodeRecordPrototype);
  const frames = createFieldMoveFramesMZ(root);
  let presentation: Readonly<WorldTravelPresentation> = Object.freeze({ ...initialPresentation });
  const presentations = new WeakMap<object, Readonly<WorldTravelPresentation>>();
  const presentationFor = (owner: object): Readonly<WorldTravelPresentation> => {
    const previous = presentations.get(owner); if (previous) return previous;
    const physical = readNativeTravelLease(transfer.nativeLeaseSource)?.current;
    const chosen = physical?.phase === 'arrived' ? presentations.get(physical.owner) ?? presentation : presentation;
    presentations.set(owner, chosen); return chosen;
  };
  const configurePresentation = (raw: unknown): void => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || nativeIsProxy(raw)) throw Error('travel-presentation-own-data-required');
    const functions: Record<string, (this: unknown, ...args: unknown[]) => unknown> = Object.create(null) as Record<string, (this: unknown, ...args: unknown[]) => unknown>;
    for (const key of Reflect.ownKeys(raw)) {
      const descriptor = Object.getOwnPropertyDescriptor(raw, key);
      if (typeof key !== 'string' || !['animate', 'flyCallback', 'cleanupFlight'].includes(key) || !descriptor || !Object.hasOwn(descriptor, 'value') || !method(descriptor.value) || nativeIsProxy(descriptor.value)) throw Error('travel-presentation-own-data-required');
      functions[key] = descriptor.value;
    }
    const animate = functions.animate, callback = functions.flyCallback, cleanup = functions.cleanupFlight;
    presentation = Object.freeze({
      ...(animate ? { animate: async (kind: 'fly' | 'teleport', owner: object, guard: () => void): Promise<void> => { await Reflect.apply(animate, undefined, [kind, owner, guard]); } } : {}),
      ...(callback ? { flyCallback: async (owner: object, guard: () => void): Promise<void> => { await Reflect.apply(callback, undefined, [owner, guard]); } } : {}),
      ...(cleanup ? { cleanupFlight: async (owner: object, guard: () => void): Promise<void> => { await Reflect.apply(cleanup, undefined, [owner, guard]); } } : {}),
    });
  };
  const guardFor = (owner: object): (() => void) => {
    const app = current(), generation = app?.stateGeneration;
    return () => { if (!app || current() !== app || app.stateGeneration !== generation || app.isWorldTravelOwner(owner) !== true) throw Error('travel-presentation-owner-stale'); };
  };
  const blackoutApplication = (): BlackoutApplicationQueries | null => {
    const app: unknown = current(), value = hostRecord(app);
    if (!value || nativeIsProxy(value)) return null;
    for (const key of ['isBlackoutOwner', 'isBlackoutPreparing', 'isBlackoutEntering', 'isBlackoutSourceContext', 'isBlackoutTransferAncestor', 'isBlackoutReturnComplete', 'isBlackoutNonTransferComplete', 'ownsBlackoutNativeEntry']) {
      let at: object | null = value, found = false;
      for (let depth = 0; at && depth < 32; depth++) {
        if (nativeIsProxy(at)) return null;
        const descriptor = Object.getOwnPropertyDescriptor(at, key);
        if (descriptor) { if (!('value' in descriptor) || typeof descriptor.value !== 'function') return null; found = true; break; }
        at = Object.getPrototypeOf(at);
      }
      if (!found) return null;
    }
    return app as BlackoutApplicationQueries;
  };
  const transfer = createConfiguredTransferMZ(root, {
    nativeIsProxy, blackoutApplication,
    isOwnerCurrent: owner => current()?.isWorldTravelOwner(owner) === true,
    isCurrent: (owner, receipt) => current()?.isWorldTravelReceipt(owner, receipt) === true,
    beforePerform: (owner, receipt) => current()?.canPerformWorldTravel(owner, receipt) === true,
    confirmArrival(owner, receipt, observation) {
      const app = current(); if (!app) return { status: 'refused', reason: 'travel-application-unavailable' };
      const outcome = app.confirmWorldTravelArrival(owner, receipt, observation);
      if (outcome.status === 'arrived' || outcome.status === 'duplicate') {
        void app.finishWorldTravelArrival(receipt).then(result => {
          if (result.status === 'completed') transfer.releaseArrival(owner, receipt);
          else if (result.status === 'failed') diagnose(result.reason);
        }, error => diagnose(reason(error)));
      }
      return outcome;
    },
    transferFailed: (owner, receipt, why, observation) => { current()?.failWorldTravelTransfer(owner, receipt, why, observation); },
    diagnostic: diagnose,
  }, meanings, parseSurfPassageMode(parameters.SurfPassage));
  const playerPrototype = hostRecord(hostRecord(root.Game_Player)?.prototype);
  const performTransfer = playerPrototype?.performTransfer, reserveTransfer = playerPrototype?.reserveTransfer;
  if (!playerPrototype || !method(performTransfer) || !method(reserveTransfer)) throw Error('travel-native-player-unavailable');
  transfer.install({ playerPrototype, performTransfer, reserveTransfer });
  frames.install();
  const scenePrototype = hostRecord(hostRecord(root.Scene_Map)?.prototype), manager = hostRecord(root.SceneManager);
  if (!scenePrototype || !manager) throw Error('travel-map-scene-unavailable');
  const requestAutosave = scenePrototype.requestAutosave, onTransferEnd = scenePrototype.onTransferEnd, updateScene = manager.updateScene;
  if (typeof requestAutosave !== 'function' || typeof onTransferEnd !== 'function' || typeof updateScene !== 'function') throw Error('travel-native-map-hooks-unavailable');
  interface NativeTick { readonly serial: number; readonly guard: () => void; resolve(): void; reject(error: unknown): void }
  const ticks = new Set<NativeTick>(); let serial = 0, updating = 0;
  const nativeTick = (guard: () => void): Promise<void> => new Promise<void>((resolve, reject) => { try { guard(); ticks.add({ serial: serial + updating, guard, resolve, reject }); } catch (error) { reject(error); } });
  const blackoutSourceHost: Pick<WorldBlackoutHost, 'armSource' | 'waitSource' | 'retireSource'> = {
    armSource: (owner, context) => transfer.blackoutSource?.armSource(owner, context) ?? { status: 'failed', reason: 'blackout-native-source-unavailable' },
    waitSource: (owner, context) => transfer.blackoutSource ? transfer.blackoutSource.waitSource(owner, context, nativeTick) : Promise.resolve({ status: 'failed', reason: 'blackout-native-source-unavailable' }),
    retireSource: (owner, context) => transfer.blackoutSource?.retireSource(owner, context) ?? { status: 'failed', reason: 'blackout-native-source-unavailable' },
  };
  type TransferEnd = { readonly lease: object; readonly scene: object; status: 'running' | 'completed' | 'failed'; error?: string };
  let ended: TransferEnd | null = null;
  interface Deferred extends BlackoutNativeSaveRequest {
    readonly app: Application; readonly target: Readonly<WorldLocation> | null;
    readonly invoke: (scene: object) => unknown;
  }
  let deferred: Deferred | null = null;
  // Restriction bookkeeping only: these are actual receivers observed by this collector,
  // not permissions or another save queue. Current unmanaged native requests remain normal.
  const retainedReceivers = new WeakSet<object>();
  // Execution receiver metadata belongs to this same one slot. The original frozen observation
  // is never copied/reissued when genuine C1 hands its native Map back to the parent.
  interface ReturnedReceiver {
    readonly request: Deferred; readonly app: Application; readonly generation: number;
    readonly previousScene: object; readonly scene: object; readonly player: object; readonly map: object;
    readonly mapId: number; readonly data: object; readonly x: number; readonly y: number;
    readonly flow: object; readonly content: object; readonly birth: WorldMapBirthLifecycle; readonly epoch: () => void;
    taken: boolean;
  }
  let delivery: { readonly request: Deferred; readonly scene: object; readonly data: object; readonly blackoutOwner?: object; readonly returned?: ReturnedReceiver } | null = null;
  const actualSaveApplication = (): BlackoutSaveApplication | null => {
    const app = current(); const f: unknown = blackoutApplication();
    return app && app === f ? app as Application & BlackoutApplicationQueries : null;
  };
  const takeDeferred = (expected: BlackoutNativeSaveRequest, scene: object): (() => unknown) | null => {
    if (deferred !== expected) return null;
    // Pure exact-take observation only. A bare null/clear or another request cannot set it.
    if (delivery?.request === expected && delivery.returned) delivery.returned.taken = true;
    const request = deferred; deferred = null; delivery = null;
    return () => request.invoke(scene);
  };
  const captureNonTransferSource = (owner: object): BlackoutNonTransferSourceObservation => {
    if (!transfer.blackoutSource) throw Error('blackout-native-source-unavailable');
    const source = transfer.blackoutSource.captureNonTransferSource(owner), receiver = delivery, record = receiver?.returned;
    if (!receiver || !record || receiver.request !== record.request || deferred !== record.request || record.scene !== source.handoff.target?.scene) return source;
    const guard = (self: object): void => {
      if (self !== observed) throw Error('blackout-returned-receiver-unissued');
      source.guard(); record.epoch();
      const app = current(), generation = record.app.stateGeneration;
      if (app !== record.app || generation !== record.generation) throw Error('blackout-returned-receiver-generation-stale');
      source.guard(); record.epoch();
      const active = delivery?.returned === record && delivery.request === record.request && deferred === record.request && delivery.scene === record.scene && delivery.data === record.data;
      const consumed = record.taken && delivery === null && deferred === null;
      const birth = readNativeTravelLease(transfer.nativeLeaseSource)?.mapBirth, frame = birth?.frame;
      if ((!active && !consumed) || birth !== record.birth || !frame || frame.map !== record.map || frame.mapId !== record.mapId || frame.player !== record.player || frame.data !== record.data ||
        ownData(root, 'PSFlow') !== record.flow || ownData(record.flow, '_content') !== record.content ||
        ownData(root, 'SceneManager') !== manager || ownData(manager, '_scene') !== record.scene || ownData(manager, '_nextScene') !== null ||
        ownData(record.scene, '_started') !== true || ownData(record.scene, '_active') !== true ||
        ownData(root, '$gameMap') !== record.map || ownData(record.map, '_mapId') !== record.mapId || ownData(root, '$gamePlayer') !== record.player || ownData(root, '$dataMap') !== record.data ||
        ownData(record.player, '_x') !== record.x || ownData(record.player, '_y') !== record.y || ownData(record.player, '_transferring') !== false)
        throw Error('blackout-returned-receiver-stale');
    };
    const observed: BlackoutNonTransferReturnedReceiver = Object.freeze({ request: record.request, previousScene: record.previousScene, scene: record.scene,
      guard(this: BlackoutNonTransferReturnedReceiver): void { guard(this); } });
    observed.guard(); return Object.freeze({ ...source, returnedReceiver: observed });
  };
  const blackoutSave = createBlackoutSaveMZ({ root, application: actualSaveApplication, source: transfer.nativeLeaseSource,
    isProxy: nativeIsProxy, captureNativeEpoch: player => transfer.captureNativeReservationGuard(player),
    captureNonTransferSource, diagnostic: diagnose,
    collector: { current: () => deferred, take: takeDeferred } });
  const ownData = (value: object, key: string): unknown => {
    if (nativeIsProxy(value)) throw Error('travel-save-own-data-required');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) throw Error('travel-save-own-data-required');
    return descriptor.value;
  };
  interface NativeSaveBoundary { readonly scene: object; guard(): void }
  let nativeSaveBoundary: NativeSaveBoundary | null = null;
  const captureNativeSaveBoundary = (scene: object): (() => void) => {
    const app = current(), generation = app?.stateGeneration;
    const map = ownData(root, '$gameMap'), player = ownData(root, '$gamePlayer'), data = ownData(root, '$dataMap');
    if (!map || typeof map !== 'object' || !player || typeof player !== 'object' || !data || typeof data !== 'object' || [map, player, data, scene].some(nativeIsProxy)) throw Error('travel-autosave-boundary-unavailable');
    const mapId = ownData(map, '_mapId'), x = ownData(player, '_x'), y = ownData(player, '_y');
    const epoch = transfer.captureNativeReservationGuard(player);
    const guard = (): void => {
      const actualApp = current(), actualGeneration = app?.stateGeneration;
      epoch();
      if (actualApp !== app || actualGeneration !== generation || ownData(root, 'SceneManager') !== manager || ownData(manager, '_scene') !== scene || ownData(manager, '_nextScene') !== null ||
        ownData(root, '$gameMap') !== map || ownData(map, '_mapId') !== mapId || ownData(root, '$gamePlayer') !== player || ownData(root, '$dataMap') !== data ||
        ownData(player, '_x') !== x || ownData(player, '_y') !== y || ownData(player, '_transferring') !== false ||
        ownData(scene, '_started') !== true || ownData(scene, '_active') !== true) throw Error('travel-autosave-boundary-stale');
    };
    guard(); return guard;
  };
  const nativeSaveAllowed = (scene: object): boolean => {
    try {
      if (retainedReceivers.has(scene) && ownData(manager, '_scene') !== scene) throw Error('travel-autosave-old-receiver');
      if (nativeSaveBoundary?.scene === scene) nativeSaveBoundary.guard();
      return true;
    } catch (error) {
      try { diagnose(`travel-autosave-refused:${reason(error)}`); } catch { /* An observation cannot grant a refused native save. */ }
      return false;
    }
  };
  const releaseCompletedBlackout = (physical: WorldTravelLeaseCurrent | null | undefined, entry: TransferEnd | null, boundary: NativeSaveBoundary): void => {
    if (!physical || !entry || entry.status !== 'completed' || ended !== entry || entry.lease !== physical.lease || entry.scene !== physical.scene || physical.phase !== 'arrived') return;
    try {
      const app = current(), generation = app?.stateGeneration;
      if (!app || typeof generation !== 'number' || app.isBlackoutReturnComplete(physical.owner, physical.receipt) !== true ||
        !isBlackoutSaveScopeCompleteForMZ(app, generation, physical.owner, physical.receipt)) return;
      if (nativeIsProxy(physical.receipt)) throw Error('travel-terminal-receipt-unsafe');
      const target = ownData(physical.receipt, 'target');
      if (!target || typeof target !== 'object' || nativeIsProxy(target)) throw Error('travel-terminal-target-unavailable');
      const mapId = ownData(target, 'mapId'), x = ownData(target, 'x'), y = ownData(target, 'y');
      if (!natural(mapId) || mapId === 0 || !natural(x) || !natural(y)) throw Error('travel-terminal-target-invalid');
      boundary.guard();
      const snapshot = readNativeTravelLease(transfer.nativeLeaseSource), birth = snapshot?.mapBirth, frame = birth?.frame;
      if (nativeSaveBoundary !== boundary || deferred !== null || delivery !== null ||
        snapshot?.current !== physical || !frame || birth?.scene !== physical.scene ||
        birth.manager !== manager || frame.player !== physical.player || frame.map !== ownData(root, '$gameMap') || frame.mapId !== mapId || frame.mapId !== ownData(frame.map, '_mapId') ||
        ownData(physical.player, '_x') !== x || ownData(physical.player, '_y') !== y || frame.data !== ownData(root, '$dataMap')) return;
      // The helper has observed this exact scope after revoking its grant: either no
      // request existed, or the actual original returned (including a disabled native gate).
      // Exact private owner/receipt/serial retirement preserves any later native request.
      transfer.releaseArrival(physical.owner, physical.receipt);
    } catch (error) { try { diagnose(`travel-terminal-retirement-refused:${reason(error)}`); } catch { /* Native prefix remains authoritative. */ } }
  };
  const retainDeferred = (app: Application, scene: object, args: readonly unknown[], allowCold: boolean): Deferred => {
    const snapshot = readNativeTravelLease(transfer.nativeLeaseSource), physical = snapshot?.current ?? null;
    const receipt = hostRecord(physical?.receipt), target = receipt?.target;
    const player = hostRecord(ownData(root, '$gamePlayer')), map = hostRecord(ownData(root, '$gameMap')), data = hostRecord(ownData(root, '$dataMap'));
    if (!player || !map || !data || typeof data !== 'object' || Array.isArray(data) || ownData(manager, '_scene') !== scene) throw Error('travel-deferred-save-frame-unavailable');
    const mapId = ownData(map, '_mapId'), x = ownData(player, '_x'), y = ownData(player, '_y');
    if (!natural(mapId) || mapId === 0 || !natural(x) || !natural(y)) throw Error('travel-deferred-save-position-invalid');
    if (!allowCold && (!physical || physical.phase !== 'arrived' || physical.scene !== scene || physical.player !== player || !isTravelLocation(target))) throw Error('travel-deferred-save-proof-unavailable');
    const generation = app.stateGeneration;
    const old = deferred;
    const close = (): void => {
      const actualApp = current(), actualGeneration = app.stateGeneration;
      // Unknown App/diagnostic providers have returned. The comparison/store below uses only
      // captured own native slots and the known pure canonical reader; a successor slot wins.
      if (actualApp !== app || actualGeneration !== generation || readNativeTravelLease(transfer.nativeLeaseSource) !== snapshot || deferred !== old ||
        ownData(root, '$gamePlayer') !== player || ownData(root, '$gameMap') !== map || ownData(root, '$dataMap') !== data || ownData(manager, '_scene') !== scene ||
        ownData(map, '_mapId') !== mapId || ownData(player, '_x') !== x || ownData(player, '_y') !== y) throw Error('travel-deferred-save-source-changed');
    };
    if (old && old.app === app && old.generation === generation && old.physical?.lease === physical?.lease && old.physical?.serial === physical?.serial) { close(); retainedReceivers.add(scene); return old; }
    const receiver = delivery;
    if (allowCold && old && receiver?.request === old && receiver.blackoutOwner === physical?.owner && physical?.phase === 'arrived' &&
      old.app === app && old.generation === generation && app.isBlackoutReturnComplete(physical.owner, physical.receipt) === true) {
      // The actual helper already authenticated this inherited request during adoption and
      // returned retain for its terminal grant. Coalesce the new raw request into the same slot;
      // keep the originating function, arguments and immutable observation identity.
      close();
      if (delivery !== receiver) throw Error('blackout-deferred-save-receiver-changed');
      delivery = Object.freeze({ ...receiver, scene, data }); retainedReceivers.add(scene); return old;
    }
    if (old) diagnose('travel-deferred-save-replaced-stale-request');
    const nativeArgs = Object.freeze([...args]);
    const request: Deferred = Object.freeze({ identity: Object.freeze({}), application: app, app, generation,
      physical, target: isTravelLocation(target) ? Object.freeze({ ...target }) : null,
      manager, scene, player, map, mapId, data, x, y,
      invoke: (targetScene: object): unknown => Reflect.apply(requestAutosave, targetScene, nativeArgs) });
    close(); deferred = request; delivery = Object.freeze({ request, scene, data }); retainedReceivers.add(scene); return request;
  };
  scenePrototype.requestAutosave = function(this: object, ...args: unknown[]): unknown {
    if (!nativeSaveAllowed(this)) return;
    const disposition = blackoutSave.beforeRequest(this);
    if (disposition === 'refused') return;
    const app = current();
    if (disposition === 'retain') {
      if (!nativeSaveAllowed(this)) return;
      if (!app) { diagnose('blackout-save-application-unavailable'); return; }
      try { blackoutSave.requestRetained(retainDeferred(app, this, args, true)); }
      catch (error) { diagnose(`blackout-deferred-save-failed:${reason(error)}`); }
      return;
    }
    // The F helper's pass continues the existing E3 admission/collector path.
    if (app?.deferWorldTravelSave() === true) {
      if (!nativeSaveAllowed(this)) return;
      try { retainDeferred(app, this, args, false); }
      catch (error) { diagnose(reason(error)); }
      return;
    }
    if (nativeSaveAllowed(this)) return Reflect.apply(requestAutosave, this, args);
    return undefined;
  };
  scenePrototype.onTransferEnd = function(this: object, ...args: unknown[]): unknown {
    const previousBoundary = nativeSaveBoundary;
    const callback: NativeSaveBoundary = { scene: this, guard: () => { throw Error('travel-autosave-boundary-reentrant'); } };
    nativeSaveBoundary = callback;
    try { if (previousBoundary?.scene !== this) callback.guard = captureNativeSaveBoundary(this); }
    catch (error) { const why = reason(error); callback.guard = () => { throw Error(why); }; }
    const actual = readNativeTravelLease(transfer.nativeLeaseSource)?.current;
    const entry: TransferEnd | null = actual?.phase === 'arrived' && actual.scene === this ? { lease: actual.lease, scene: this, status: 'running' } : null;
    if (entry) ended = entry;
    blackoutSave.observeTransferEnd(this, 'running');
    try {
      const result = Reflect.apply(onTransferEnd, this, args); if (entry) entry.status = 'completed';
      blackoutSave.observeTransferEnd(this, 'completed');
      releaseCompletedBlackout(actual, entry, callback);
      return result;
    } catch (error) {
      if (entry) { entry.status = 'failed'; entry.error = reason(error); }
      blackoutSave.observeTransferEnd(this, 'failed'); throw error;
    } finally {
      if (nativeSaveBoundary === callback) nativeSaveBoundary = previousBoundary;
    }
  };
  manager.updateScene = function(this: unknown, ...args: unknown[]): unknown {
    let result: unknown; updating++;
    try { result = Reflect.apply(updateScene, this, args); }
    catch (error) { for (const wait of [...ticks]) { ticks.delete(wait); wait.reject(error); } throw error; }
    finally { updating--; }
    serial++; frames.update();
    for (const wait of [...ticks]) {
      try { wait.guard(); if (serial > wait.serial && ticks.delete(wait)) wait.resolve(); }
      catch (error) { if (ticks.delete(wait)) wait.reject(error); }
    }
    return result;
  };
  const text = async (message: string | ((guard: () => void) => FieldPresentationText), owner: object, choice = false): Promise<'confirmed' | 'cancelled'> => {
    const guard = guardFor(owner); guard(); const messages = root.$gameMessage;
    const visible = typeof message === 'string' ? { message, assertCurrent: guard } : message(guard);
    const check = visible.assertCurrent; check();
    const initiallyBusy = invoke(messages, 'isBusy'); check();
    if (initiallyBusy !== false) throw Error('travel-message-active');
    let answer: number | undefined;
    invoke(messages, 'add', [visible.message]); check();
    if (choice) {
      invoke(messages, 'setChoices', [visible.choices, 1, 1]); check();
      invoke(messages, 'setChoiceCallback', [(value: unknown) => { try { check(); if (answer === undefined && (value === 0 || value === 1)) answer = value; } catch { /* Late UI reply has no authority. */ } }]); check();
    }
    for (;;) {
      check(); if (root.$gameMessage !== messages) throw Error('travel-message-replaced');
      const busy = invoke(messages, 'isBusy'); check(); if (typeof busy !== 'boolean') throw Error('travel-message-invalid');
      if (!busy && (!choice || answer !== undefined)) return !choice || answer === 0 ? 'confirmed' : 'cancelled';
      await frames.nextFrame(check);
    }
  };
  const effect = async (kind: TravelHostEffect, owner: object): Promise<TravelEffectResult> => {
    const guard = guardFor(owner);
    try {
      guard(); const selected = presentationFor(owner);
      if (kind === 'escape-rope-message') await text(check => travelText(root, 'escape-rope', check, nativeIsProxy), owner);
      else if (kind === 'fly-animation' || kind === 'teleport-animation') {
        const move = kind === 'fly-animation' ? 'fly' : 'teleport';
        if (selected.animate) { await selected.animate(move, owner, guard); guard(); }
        else await text(check => travelText(root, move, check, nativeIsProxy), owner);
      } else if (kind === 'cancel-vehicles') {
        const player = hostRecord(root.$gamePlayer), map = hostRecord(root.$gameMap);
        if (!player || nativeIsProxy(player)) throw Error('travel-native-player-invalid');
        if (!map || nativeIsProxy(map)) throw Error('travel-native-map-invalid');
        const mapId: unknown = Object.getOwnPropertyDescriptor(map, '_mapId')?.value;
        const sourceData: unknown = Object.getOwnPropertyDescriptor(root, '$dataMap')?.value;
        if (!natural(mapId) || mapId === 0 || !sourceData || typeof sourceData !== 'object' || Array.isArray(sourceData) || nativeIsProxy(sourceData)) throw Error('travel-native-map-source-invalid');
        const idle = transfer.captureIdleNativeGuard(owner, player);
        const check = (): void => {
          guard(); idle();
          if (Object.getOwnPropertyDescriptor(root, '$gameMap')?.value !== map || Object.getOwnPropertyDescriptor(map, '_mapId')?.value !== mapId ||
            Object.getOwnPropertyDescriptor(root, '$dataMap')?.value !== sourceData) throw Error('travel-native-map-changed');
        };
        check(); const inVehicle = invoke(player, 'isInVehicle'); check();
        if (typeof inVehicle !== 'boolean') throw Error('travel-native-vehicle-invalid');
        if (inVehicle) {
          // getOffVehicle is a shore movement: it tests landing, advances the player and draws
          // an encounter counter. A transfer instead releases the existing vehicle in place.
          const own = (key: string): unknown => {
            const descriptor = Object.getOwnPropertyDescriptor(player, key);
            if (!descriptor || !('value' in descriptor) || !descriptor.writable) throw Error('travel-native-player-own-data-required');
            return descriptor.value;
          };
          const type = own('_vehicleType');
          if (type !== 'boat' && type !== 'ship' && type !== 'airship') throw Error('travel-native-vehicle-invalid');
          const stateValid = (): void => {
            if (typeof own('_vehicleGettingOn') !== 'boolean' || typeof own('_vehicleGettingOff') !== 'boolean' ||
              typeof own('_transparent') !== 'boolean' || typeof own('_through') !== 'boolean' || (typeof own('_moveSpeed') !== 'number' || !Number.isFinite(own('_moveSpeed')))) throw Error('travel-native-vehicle-state-invalid');
          };
          stateValid();
          const vehicle = hostRecord(invoke(player, 'vehicle')); check();
          if (!vehicle || nativeIsProxy(vehicle)) throw Error('travel-native-vehicle-source-invalid');
          const mapVehicle = invoke(map, type); check();
          if (mapVehicle !== vehicle) throw Error('travel-native-vehicle-source-invalid');
          invoke(vehicle, 'getOff'); check();
          const currentVehicle = invoke(player, 'vehicle'); check();
          const driving = Object.getOwnPropertyDescriptor(vehicle, '_driving');
          if (currentVehicle !== vehicle || own('_vehicleType') !== type || !driving || !('value' in driving) || driving.value !== false) throw Error('travel-native-vehicle-source-changed');
          stateValid();
          // No provider calls between final identity validation and these native own-data writes.
          player._vehicleType = 'walk'; player._vehicleGettingOn = false; player._vehicleGettingOff = false;
          player._transparent = false; player._through = false; player._moveSpeed = 4;
        }
        const bike = player.isOnBicycle; check();
        if (typeof bike === 'function') {
          const riding = Reflect.apply(bike, player, []); check();
          if (riding === true) { invoke(player, 'getOffBicycle'); check(); const remaining = Reflect.apply(bike, player, []); check(); if (remaining !== false) throw Error('travel-bicycle-cancel-failed'); }
        }
        invoke(player, 'refresh'); check();
      } else if (kind === 'map-bgm') {
        const physical = readNativeTravelLease(transfer.nativeLeaseSource)?.current;
        if (!physical || physical.phase !== 'arrived') throw Error('travel-native-arrival-proof-unavailable');
        for (;;) {
          guard(); const actual = readNativeTravelLease(transfer.nativeLeaseSource)?.current;
          if (!actual || actual.lease !== physical.lease || actual.serial !== physical.serial || actual.phase !== 'arrived') throw Error('travel-native-arrival-proof-stale');
          if (ended?.lease === physical.lease && ended.scene === actual.scene) {
            if (ended.status === 'failed') throw Error(ended.error ?? 'travel-transfer-end-failed');
            if (ended.status === 'completed') break;
          }
          await nativeTick(guard);
        }
      } else if (kind === 'refresh') invoke(root.$gamePlayer, 'refresh');
      else if (kind === 'fly-callback') { await selected.flyCallback?.(owner, guard); guard(); }
      guard(); return { status: 'done' };
    } catch (error) { return { status: 'failed', reason: reason(error) }; }
  };
  const blackoutMessage = async (message: string, owner: object): Promise<TravelEffectResult> => {
    try { if (typeof message !== 'string') throw Error('blackout-message-invalid'); await text(message, owner); return { status: 'done' }; }
    catch (error) { return { status: 'failed', reason: reason(error) }; }
  };
  type Connection = { readonly owner: object; readonly receipt: TravelReceipt; readonly physical: WorldTravelLeaseCurrent; readonly app: Application; readonly generation: number; readonly native: ConnectionStepReservation };
  const connections = new WeakMap<object, Connection>();
  let connectionRetirement: { readonly record: Connection; readonly request: Deferred } | null = null;
  const retireConnection = (record: Connection): void => {
    if (current() === record.app && record.app.stateGeneration === record.generation)
      transfer.releaseArrival(record.physical.owner, record.physical.receipt);
  };
  const host: WorldTravelHost = {
    ...transfer,
    preload(owner, target) { if (!presentations.has(owner)) presentations.set(owner, presentation); return transfer.preload(owner, target); },
    facts() {
      const player = root.$gamePlayer, bypass = invoke(player, 'isDebugThrough');
      if (typeof bypass !== 'boolean') throw Error('travel-debug-through-invalid');
      return { ...homes.travel, debug: parameters.TravelDebug === 'true', connectionBypass: bypass };
    },
    confirm: (kind, target, owner) => text(check => travelText(root, kind, check, nativeIsProxy, target.mapId), owner, true),
    effect,
    async waitFlyTail(milliseconds, owner) {
      const guard = guardFor(owner);
      try {
        guard(); const clock = root.performance, start = invoke(clock, 'now'); guard();
        if (milliseconds !== 250 || typeof start !== 'number' || !Number.isFinite(start)) throw Error('travel-tail-clock-invalid');
        for (;;) { await frames.nextFrame(guard); guard(); const now = invoke(clock, 'now'); guard(); if (typeof now !== 'number' || !Number.isFinite(now) || now < start) throw Error('travel-tail-clock-invalid'); if (now - start >= milliseconds) break; }
        await presentationFor(owner).cleanupFlight?.(owner, guard); guard(); return { status: 'done' };
      } catch (error) { return { status: 'failed', reason: reason(error) }; }
    },
    connectionStepFacts(owner, receipt, physicalLease, stepId) {
      const app = current(); if (!app) throw Error('connection-application-unavailable');
      const generation = app.stateGeneration;
      const guard = (): void => {
        if (!app || current() !== app || app.stateGeneration !== generation || app.isWorldTravelStepPending(owner, receipt) !== true || readNativeTravelLease(transfer.nativeLeaseSource)?.current !== physicalLease || physicalLease.phase !== 'arrived' || manager._scene !== physicalLease.scene || root.$gamePlayer !== physicalLease.player) throw Error('connection-native-arrival-proof-stale');
      };
      guard();
      const gateway = worldPlugin(root.PSWorld)?.connectionSteps;
      if (!gateway) throw Error('connection-completed-step-gateway-unavailable');
      // This reservation executes synchronously before the first await: real D pending gates
      // protect native first-start/update/autorun, while the App remains the only prefix writer.
      const reservation = gateway.reserve(owner, receipt, stepId), record: Connection = { owner, receipt, physical: physicalLease, app, generation, native: reservation };
      connections.set(receipt, record);
      return (async () => {
        for (;;) {
          guard(); const started = invoke(manager._scene, 'isStarted'), active = invoke(manager._scene, 'isActive'), changing = invoke(manager, 'isSceneChanging'); guard();
          if (typeof started !== 'boolean' || typeof active !== 'boolean' || typeof changing !== 'boolean') throw Error('connection-scene-state-invalid');
          if (started && active && !changing) break;
          await nativeTick(guard);
        }
        const observed = transfer.observeNow(); guard(); if (observed.status !== 'value') throw Error('connection-target-unavailable');
        const map = root.$gameMap, { x, y } = observed.value.actual;
        const regionId = invoke(map, 'regionId', [x, y]), terrainTag = invoke(map, 'terrainTag', [x, y]); guard();
        if (!natural(regionId) || !natural(terrainTag) || terrainTag > 7) throw Error('connection-target-facts-invalid');
        const facts = { ice: meanings.get(terrainTag)?.ice === true, regionId, terrainTag, sceneActive: true };
        reservation.activate(facts); guard(); return facts;
      })();
    },
    finishConnectionStep(owner, receipt, outcome) {
      const record = connections.get(receipt); if (!record || record.owner !== owner) return;
      const returned = record.native.finish(outcome), request = deferred;
      if (returned && request?.physical && request.target && request.app === record.app && request.generation === record.generation && request.physical.lease === record.physical.lease && request.physical.serial === record.physical.serial && request.physical.owner === record.physical.owner && request.physical.receipt === record.physical.receipt && request.player === returned.player && request.target.mapId === returned.mapId && request.target.x === returned.x && request.target.y === returned.y && returned.generation === record.generation && manager._scene === returned.scene && root.$gamePlayer === returned.player && root.$gameMap === returned.map) {
        const data = ownData(root, '$dataMap');
        if (!data || typeof data !== 'object' || Array.isArray(data) || nativeIsProxy(data)) throw Error('travel-deferred-save-returned-data-invalid');
        const birth = readNativeTravelLease(transfer.nativeLeaseSource)?.mapBirth, frame = birth?.frame;
        const flow = ownData(root, 'PSFlow');
        if (!flow || typeof flow !== 'object' || nativeIsProxy(flow)) throw Error('travel-deferred-save-returned-flow-invalid');
        const content = ownData(flow, '_content');
        if (!content || typeof content !== 'object' || nativeIsProxy(content)) throw Error('travel-deferred-save-returned-content-invalid');
        if (!birth || !frame || birth.manager !== manager || birth.scene !== returned.scene || frame.map !== returned.map || frame.mapId !== returned.mapId || frame.player !== returned.player || frame.data !== data ||
          ownData(returned.map, '_mapId') !== returned.mapId || ownData(returned.player, '_x') !== returned.x || ownData(returned.player, '_y') !== returned.y || ownData(returned.player, '_transferring') !== false || ownData(manager, '_nextScene') !== null ||
          ownData(returned.scene, '_started') !== true || ownData(returned.scene, '_active') !== true) throw Error('travel-deferred-save-returned-birth-invalid');
        const epoch = transfer.captureNativeReservationGuard(returned.player); epoch();
        const relocated: ReturnedReceiver | undefined = returned.scene === request.scene ? undefined : { request, app: record.app, generation: record.generation,
          previousScene: request.scene, scene: returned.scene, player: returned.player, map: returned.map, mapId: returned.mapId, data, x: returned.x, y: returned.y, flow, content, birth, epoch, taken: false };
        if (current() === record.app && record.app.stateGeneration === record.generation && connections.get(receipt) === record && deferred === request &&
          ownData(root, 'PSFlow') === flow && ownData(flow, '_content') === content && ownData(root, '$dataMap') === data && ownData(manager, '_scene') === returned.scene && ownData(manager, '_nextScene') === null &&
          ownData(returned.map, '_mapId') === returned.mapId && ownData(returned.player, '_x') === returned.x && ownData(returned.player, '_y') === returned.y && ownData(returned.player, '_transferring') === false &&
          readNativeTravelLease(transfer.nativeLeaseSource)?.mapBirth === birth)
          delivery = Object.freeze({ request, scene: returned.scene, data, ...(delivery?.request === request && delivery.blackoutOwner ? { blackoutOwner: delivery.blackoutOwner } : {}), ...(relocated ? { returned: relocated } : {}) });
      }
      if (connections.get(receipt) === record) {
        connections.delete(receipt);
        // A successful connection Retry has a replacement App owner/receipt,
        // while the consumed native arrival still belongs to the original tuple.
        // Its original confirm callback already ended on the first failure.
        if (outcome.prefix.stepCommitted && (record.physical.owner !== owner || record.physical.receipt !== receipt)) {
          const request = deferred;
          // A deferred native save still authenticates this exact consumed proof.
          // Retire it only after its original guarded invocation has returned.
          if (request?.physical && request.app === record.app && request.generation === record.generation
            && request.physical.lease === record.physical.lease && request.physical.serial === record.physical.serial
            && request.physical.owner === record.physical.owner && request.physical.receipt === record.physical.receipt)
            connectionRetirement = { record, request };
          else if (!request) retireConnection(record);
        }
      }
    },
    cancelConnectionStep(owner, receipt) {
      const record = connections.get(receipt); if (!record || record.owner !== owner) return;
      record.native.cancel();
      if (connections.get(receipt) === record) connections.delete(receipt);
      for (const wait of [...ticks]) { try { wait.guard(); } catch (error) { if (ticks.delete(wait)) wait.reject(error); } }
    },
    releaseRecoveredArrival(_owner, physical, birth, guard) {
      return releaseRecoveredArrivalMZ(root, current, transfer, physical, birth, guard, nativeIsProxy);
    },
    resumeDeferredSave() {
      const request = deferred, destination = delivery; deferred = null; delivery = null;
      if (!request) return;
      if (!request.physical || !destination || destination.request !== request) { diagnose('travel-deferred-save-proof-unavailable'); return; }
      const app = current();
      if (app !== request.app || app.stateGeneration !== request.generation || manager._scene !== destination.scene || ownData(root, '$dataMap') !== destination.data || root.$gamePlayer !== request.player || readNativeTravelLease(transfer.nativeLeaseSource)?.current?.lease !== request.physical.lease || readNativeTravelLease(transfer.nativeLeaseSource)?.current?.serial !== request.physical.serial) { diagnose('travel-deferred-save-stale'); return; }
      const retirement = connectionRetirement;
      try { request.invoke(destination.scene); }
      catch (error) { diagnose(`travel-deferred-save-failed:${reason(error)}`); return; }
      if (retirement?.request === request && connectionRetirement === retirement && deferred === null && delivery === null) {
        connectionRetirement = null;
        retireConnection(retirement.record);
      }
    },
  };
  const ownValue = (value: unknown, key: string): unknown => { const record = hostRecord(value); if (!record) return undefined; const slot = Object.getOwnPropertyDescriptor(record, key); return slot && Object.hasOwn(slot, 'value') ? slot.value : undefined; };
  const ownsArrival = (): boolean => {
    const physical = readNativeTravelLease(transfer.nativeLeaseSource)?.current, app = current();
    if (!physical || !app || physical.phase !== 'arrived' || physical.player !== ownValue(root, '$gamePlayer') || physical.scene !== ownValue(manager, '_scene')) return false;
    const generation = ownValue(physical.receipt, 'generation'), target = ownValue(physical.receipt, 'target');
    return generation === app.stateGeneration && ownValue(ownValue(root, '$gameMap'), '_mapId') === ownValue(target, 'mapId') && ownValue(physical.player, '_x') === ownValue(target, 'x') && ownValue(physical.player, '_y') === ownValue(target, 'y');
  };
  const captureBlackoutPresentation = (owner: object, phase: 'announce' | 'prepare' | 'refresh', receipt?: TravelReceipt): (() => void) => {
    const app = current(), generation = app?.stateGeneration;
    if (!app || blackoutApplication() !== app || !app.isBlackoutOwner(owner)) throw Error('blackout-presentation-application-unavailable');
    const map = ownData(root, '$gameMap'), player = ownData(root, '$gamePlayer'), data = ownData(root, '$dataMap'), scene = ownData(manager, '_scene');
    if (!map || typeof map !== 'object' || !player || typeof player !== 'object' || !data || typeof data !== 'object' || !scene || typeof scene !== 'object' || [map, player, data, scene].some(nativeIsProxy)) throw Error('blackout-presentation-frame-unavailable');
    const mapId = ownData(map, '_mapId'), x = ownData(player, '_x'), y = ownData(player, '_y');
    const epoch = transfer.captureNativeReservationGuard(player), initial = readNativeTravelLease(transfer.nativeLeaseSource);
    const physical = initial?.current, handoff = initial?.sourceHandoff, birth = initial?.mapBirth, sourceFrame = birth?.frame;
    const physicalArrival = phase === 'refresh' && receipt !== undefined && physical?.owner === owner && physical.receipt === receipt && physical.phase === 'arrived' && physical.scene === scene && physical.player === player;
    if (!physicalArrival && (!handoff || handoff.owner !== owner || handoff.phase !== 'ready' || !sourceFrame || handoff.target !== birth || birth?.scene !== scene || sourceFrame.map !== map || sourceFrame.mapId !== mapId || sourceFrame.player !== player || sourceFrame.data !== data)) throw Error('blackout-presentation-source-unavailable');
    const guard = (): void => {
      if (current() !== app || app.stateGeneration !== generation || !app.isBlackoutOwner(owner) || phase === 'prepare' && !app.isBlackoutPreparing(owner)) throw Error('blackout-presentation-owner-stale');
      if (phase === 'refresh' && (!receipt || !app.isWorldTravelReceipt(owner, receipt) || !app.canPerformWorldTravel(owner, receipt))) throw Error('blackout-presentation-receipt-stale');
      epoch();
      const snapshot = readNativeTravelLease(transfer.nativeLeaseSource);
      if (current() !== app || app.stateGeneration !== generation || ownData(root, 'SceneManager') !== manager || ownData(manager, '_scene') !== scene || ownData(manager, '_nextScene') !== null || ownData(root, '$gameMap') !== map || ownData(map, '_mapId') !== mapId || ownData(root, '$gamePlayer') !== player || ownData(root, '$dataMap') !== data || ownData(player, '_x') !== x || ownData(player, '_y') !== y || ownData(player, '_transferring') !== false) throw Error('blackout-presentation-frame-changed');
      if (physicalArrival ? snapshot?.current !== physical : snapshot?.sourceHandoff !== handoff || snapshot?.mapBirth !== birth) throw Error('blackout-presentation-proof-changed');
    };
    guard(); return guard;
  };
  const blackoutPresentation = createBlackoutPresentationMZ({ root, application: () => blackoutApplication() ? current() : null,
    callbacks: { capture: captureBlackoutPresentation, message: blackoutMessage, cancelVehicles: owner => effect('cancel-vehicles', owner) },
    debug: parameters.TravelDebug === 'true', startingOverSwitch: homes.startingOverSwitch, isProxy: nativeIsProxy, diagnostic: diagnose });
  const fieldBlackoutEntry = createFieldBlackoutEntryMZ({ root, application: () => blackoutApplication() ? current() : null,
    capture: owner => captureBlackoutPresentation(owner, 'announce'), message: blackoutMessage, nextFrame: nativeTick, isProxy: nativeIsProxy, copy: checkpointData });
  const blackoutHost: WorldBlackoutHost = Object.freeze<WorldBlackoutHost>({ configuration: () => homes.blackout, ...blackoutSourceHost, ...fieldBlackoutEntry,
    announce: async (kind, checkpoint, owner) => checkpointData(await blackoutPresentation.announce(kind, checkpointData(checkpoint), owner)),
    prepare: async (checkpoint, owner) => checkpointData(await blackoutPresentation.prepare(checkpointData(checkpoint), owner)),
    requestMapRefresh: (owner, receipt) => checkpointData(blackoutPresentation.requestMapRefresh(owner, receipt)),
    adoptDeferredSave(owner, ancestor) {
      const app = current(), generation = app?.stateGeneration, request = deferred, receiver = delivery;
      const result = blackoutSave.adoptDeferredSave(owner, ancestor);
      if (result.status === 'done' && app && request && receiver?.request === request &&
        app.isBlackoutTransferAncestor(owner, ancestor.owner, ancestor.receipt) === true && current() === app && app.stateGeneration === generation &&
        deferred === request && delivery === receiver && readNativeTravelLease(transfer.nativeLeaseSource)?.current === request.physical) {
        delivery = Object.freeze({ ...receiver, blackoutOwner: owner });
      }
      return result;
    }, transferCompleted: blackoutSave.transferCompleted,
    nonTransferCompleted: (owner: object, completion: BlackoutNonTransferCompletion) => blackoutSave.nonTransferCompleted?.(owner, completion) ?? { status: 'failed', reason: 'blackout-nontransfer-save-unavailable' } });
  const executeMove = playerPrototype.executeMove;
  let connectionSequence = 0n;
  if (typeof executeMove === 'function') playerPrototype.executeMove = function(this: unknown, direction: unknown): unknown {
    const result = Reflect.apply(executeMove, this, [direction]);
    if (this !== root.$gamePlayer || ![2, 4, 6, 8].includes(typeof direction === 'number' ? direction : 0) || invoke(this, 'isMovementSucceeded') !== false) return result;
    const observed = transfer.observeNow(), app = current();
    if (!app || observed.status !== 'value' || observed.value.transferPending || observed.value.actual.direction !== direction) return result;
    const { actual, loadedGeometry } = observed.value;
    const x = actual.x + (direction === 6 ? 1 : direction === 4 ? -1 : 0), y = actual.y + (direction === 2 ? 1 : direction === 8 ? -1 : 0);
    if (x >= 0 && y >= 0 && x < loadedGeometry.width && y < loadedGeometry.height) return result;
    if (direction === 4 || direction === 6) { if (invoke(root.$gameMap, 'isLoopHorizontal') === true) return result; }
    else if (invoke(root.$gameMap, 'isLoopVertical') === true) return result;
    const generation = app.stateGeneration;
    if (invoke(manager._scene, 'isActive') !== true || invoke(manager, 'isSceneChanging') !== false || current() !== app || generation !== app.stateGeneration) return result;
    void app.runWorldTravel(`mz-connection:${generation}:${++connectionSequence}`, { kind: 'connection' }).then(outcome => {
      if (outcome.status === 'failed' && outcome.reason !== 'no-connection' && outcome.reason !== 'operation-active') diagnose(outcome.reason);
    }, error => diagnose(reason(error)));
    return result;
  };
  return Object.freeze({ host, transfer, blackoutHost, blackoutConfiguration: () => homes.blackout, startingOverSwitch: homes.startingOverSwitch, blackoutSourceHost, blackoutMessage, blackoutSaveHost: Object.freeze({ adoptDeferredSave: blackoutSave.adoptDeferredSave, transferCompleted: blackoutSave.transferCompleted, nonTransferCompleted: blackoutSave.nonTransferCompleted }), configurePresentation, ownsArrival, pending: () => frames.pending() > 0 || ticks.size > 0 });
}
