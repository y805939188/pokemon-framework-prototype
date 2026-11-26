import { isolatedTestScope, testStorageStillBound } from "./isolated-test-scope";
/** MZ lifecycle/command adapter. Framework owns business state; this module never replaces it. */
import { createWorldEntryCoordinator } from './world/world-entry-mz';
import { createFieldItemHost } from './world/field-item-host';
import { hostRecord, invoke, isWorldApplication, errorText } from './world/world-host';
import type { WorldApplication, WorldPlugin } from './world/world-host';
import { createWorldNoticeHost } from './world/world-notice-mz';
import { runWeatherCommand } from './world/world-weather-mz';
import { createCompletedStepMZ, isStepApplication } from './world/completed-step-mz';
import { installFieldStepHost } from './world/step-host';
import type { FieldStepHost } from './world/step-host';
import { installEncounterModeHost, resolveMZEncounterMode } from './world/encounter-mode-host';
import { installFieldOperationMZ } from './world/field-operation-mz';
import { createFishingMZ } from './world/fishing-mz';
import { readFishingHostFacts } from './world/fishing-host';
import { createRuntimeInputsMZ, parseTerrainMeanings, worldHostInput } from './world/runtime-inputs-mz';
import { createTerminalEncounterMZ } from './world/terminal-encounter-mz';
import { createFieldMoveMZ } from './world/field-move-mz';

(() => {
  const root = hostRecord(globalThis);
  if (!root) return;
  const diagnostics: string[] = [];
  const diagnose = (reason: string): void => { diagnostics.push(reason); if (diagnostics.length > 64) diagnostics.shift(); console.warn('PS_World:', reason); };
  const flow = () => hostRecord(root.PSFlow);
  const recoveryCall = (method: string, args: readonly unknown[] = []): unknown => {
    const owner = flow(), fn = owner?.[method]; return typeof fn === 'function' ? Reflect.apply(fn, owner, args) : undefined;
  };
  const recoveryPending = (): boolean => recoveryCall('blackoutLoadPending') === true;
  const companionPending = (): boolean => recoveryCall('companionNativePending') === true;
  const authorPending = (): boolean => recoveryCall('worldAuthorInputPending') === true;
  const current = (): WorldApplication | null => { const value = flow()?._app; return isWorldApplication(value) ? value : null; };
  const application = (): WorldApplication => { const value = invoke(flow(), 'app'); if (!isWorldApplication(value)) throw new Error('world-application-unavailable'); return value; };
  let steps: FieldStepHost | null = null;
  const entry = createWorldEntryCoordinator(() => { if (typeof flow()?.ownsWorldTravelArrival !== 'function' || invoke(flow(), 'ownsWorldTravelArrival') !== true) steps?.mapEntered(); }), fields = createFieldItemHost(current, (app, admission) => {
    if (current() !== app || invoke(flow(), 'openAdmittedWorldBattle', [app, admission]) !== true) throw Error('field-battle-presentation-refused');
  });
  const stepApplication = () => { const app = current(); return isStepApplication(app) ? app : null; };
  const mode = () => resolveMZEncounterMode(invoke(root.$gameMap, 'mapId'), invoke(flow(), 'content'), root.$dataMap);
  const parameters = hostRecord(invoke(root.PluginManager, 'parameters', ['PS_World'])) ?? {};
  const meanings = (() => { try { return parseTerrainMeanings(parameters.TerrainTags); } catch (error) { diagnose(errorText(error)); return parseTerrainMeanings(undefined); } })();
  const testScope = isolatedTestScope(globalThis);
  const allowTestDebug = () => testStorageStillBound(globalThis, testScope);
  const inputs = createRuntimeInputsMZ(root, meanings, () => { const value = mode(); return value.status === 'ready' && value.mode === 'framework'; }, allowTestDebug);
  const fieldMoves = createFieldMoveMZ(root, meanings, parameters, diagnose);
  const fishing = createFishingMZ(root, () => worldHostInput(root), owner => { invoke(current(), 'assertFishingOwner', [owner]); }, parameters, diagnose);
  let nativeIsProxy: ((value: unknown) => boolean) | undefined;
  try {
    const util = hostRecord(invoke(root, 'require', ['node:util']));
    const check = hostRecord(util?.types)?.isProxy;
    if (typeof check === 'function') nativeIsProxy = check as (value: unknown) => boolean;
  } catch { /* No verified detector means no owned-arrival exception. */ }
  const completed = createCompletedStepMZ(root, stepApplication, () => steps, diagnose, {
    nativeIsProxy, iceTerrainTags: inputs.iceTerrainTags, encounterMode: mode,
    openBattle: (app, admission) => { if (stepApplication() !== app || invoke(flow(), 'openAdmittedWorldBattle', [app, admission]) !== true) throw Error('world-battle-presentation-refused'); },
  });
  const terminal = createTerminalEncounterMZ(root);
  if (hostRecord(root.Game_Player)) {
    steps = installFieldStepHost(root, {
      current: () => { const app = stepApplication(); if (!app) return null; const now = completed.location(); return { owner: app, generation: now.generation, map: now.map, mapId: now.mapId }; },
      movementStarted: player => {
        const owner = flow(), descriptor = owner && Object.getOwnPropertyDescriptor(owner, 'observeNativeMovementIncrease');
        const observe = descriptor && 'value' in descriptor ? descriptor.value : undefined;
        if (typeof observe === 'function') Reflect.apply(observe, owner, [player]);
      },
      movementTracked: (player, id) => { recoveryCall('companionMovementTracked', [player, id]); },
      movementSettled: (player, id) => { recoveryCall('companionMovementSettled', [player, id]); },
      movementCancelled: (player, id) => { recoveryCall('companionMovementCancelled', [player, id]); },
      runCompletedStep: completed.run,
      retireEncounter: terminal.retire,
      dispatchEncounter: step => {
        const manager = hostRecord(root.SceneManager), scene = manager?._scene, mapConstructor = root.Scene_Map;
        if (typeof mapConstructor !== 'function' || !(scene instanceof mapConstructor)) { terminal.retire(step); return; }
        terminal.run(step, scene, () => {
          const mode = resolveMZEncounterMode(invoke(root.$gameMap, 'mapId'), invoke(flow(), 'content'), root.$dataMap);
          if (mode.status !== 'ready') return 'refused';
          if (mode.mode !== 'mz-native' && mode.mode !== 'legacy-note') return 'completed';
          if (invoke(scene, 'isActive') !== true ||
            invoke(manager, 'isSceneChanging') !== false || invoke(root.$gamePlayer, 'isTransferring') !== false ||
            invoke(root.$gameMessage, 'isBusy') !== false) return 'deferred';
          if (invoke(flow(), 'operationPending') === true || hostRecord(flow()?._app)?.encounterBlocked === true || !terminal.allowed(step.player)) return 'refused';
          invoke(scene, 'updateEncounter');
          return 'completed';
        });
      },
      failed: (_step, error) => diagnose(errorText(error)),
    });
    const native = () => { const value = hostRecord(flow()?.encounterHost); if (!value) throw new Error('native-encounter-bindings-unavailable'); return value; };
    installEncounterModeHost(root, {
      mode: () => resolveMZEncounterMode(invoke(root.$gameMap, 'mapId'), invoke(flow(), 'content'), root.$dataMap),
      takeCompletedStep: player => steps?.takeEncounterStep(player) ?? null,
      // C is admitted by the completed-step App parent; native count dispatch must not call it again.
      frameworkStep: () => false,
      nativeEncounter: player => invoke(native(), 'nativeEncounter', [player]) === true,
      legacyEncounter: player => invoke(native(), 'legacyEncounter', [player]) === true,
      nativeMakeCount: (player, args) => invoke(native(), 'makeCount', [player, args]),
      nativeUpdateCount: (player, args) => invoke(native(), 'updateCount', [player, args]),
      randomBlocked: () => invoke(flow(), 'operationPending') === true || hostRecord(flow()?._app)?.encounterBlocked === true,
      terminalAllowed: terminal.allowed, terminalCountAllowed: terminal.countAllowed, countReset: terminal.countReset,
      diagnostic: diagnose, failed: (_step, error) => diagnose(errorText(error)),
    });
  }
  const notices = createWorldNoticeHost(current, (type, power, duration) => { invoke(root.$gameScreen, 'changeWeather', [type, power, duration]); }, diagnose);
  const service: WorldPlugin & { readonly diagnostics: string[] } = {
    diagnostics,
    loadSucceeded: () => { entry.loaded(); recoveryCall('blackoutLoadSucceeded'); },
    pending: () => recoveryPending() || fields.pending() || !!steps?.pending() || fishing.pending() || fieldMoves.pending(),
    queueFieldItem: fields.queue,
    cancelFieldItem: fields.cancel,
    fieldItems: fields.execution,
    fieldMoves: fieldMoves.execution,
    completedSteps: completed.execution,
    connectionSteps: completed.connectionSteps,
    surfLandings: completed.surfLandings,
    retireSurfLanding: fieldMoves.retireLanding,
    runtimeInputs: { ordinary: inputs.ordinary, field: inputs.field, generation: inputs.generation, fishing: { presentation: fishing.presentation,
      facts: () => readFishingHostFacts(root, inputs.terrain, () => {
        const game = hostRecord(invoke(flow(), 'game')), world = hostRecord(game?.world);
        if (typeof world?.surfing !== 'boolean') throw Error('surfing-fact-unavailable'); return world.surfing;
      }),
    } },
    stepStateReplaced: () => { fishing.stateReplaced(); steps?.stateReplaced(); fieldMoves.stateReplaced(); },
  };
  root.PSWorld = service;
  const fieldPresentationPending = (): boolean => {
    const ui = hostRecord(root.PSManagement), descriptor = ui && Object.getOwnPropertyDescriptor(ui, 'fieldPresentationPending');
    const pending: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    return typeof pending === 'function' && Reflect.apply(pending, ui, []) === true;
  };
  installFieldOperationMZ(root, () => recoveryPending() || companionPending() || authorPending() || fields.pending() || fishing.pending() || fieldMoves.pending() || hostRecord(flow()?._app)?.saveBlocked === true || fieldPresentationPending(),
    player => steps?.ownsTerminalArrival(player) ? true : !completed.dispatchingArrival(player) ? null : !recoveryPending() && !companionPending() && !authorPending() && !fields.pending() && !fishing.pending() && !fieldMoves.pending() && !fieldPresentationPending() && completed.ownsArrival(player),
    () => hostRecord(flow()?._app)?.blackoutRecoveryPending === true);

  const dataManager = hostRecord(root.DataManager), baseSetup = dataManager?.setupNewGame;
  if (dataManager && typeof baseSetup === 'function') dataManager.setupNewGame = function(this: unknown, ...args: unknown[]): unknown {
    const result = Reflect.apply(baseSetup, this, args); entry.newGame(); recoveryCall('blackoutLoadInvalidated'); return result;
  };
  const interpreter = hostRecord(hostRecord(root.Game_Interpreter)?.prototype), command = interpreter?.command236;
  if (interpreter && typeof command === 'function') interpreter.command236 = function(this: unknown, params: unknown): unknown {
    const values: readonly unknown[] = Array.isArray(params) ? params : [];
    const battle = invoke(root.$gameParty, 'inBattle') === true;
    const observed = current(), generation = observed?.stateGeneration, system = root.$gameSystem;
    const result = runWeatherCommand({ inBattle: () => battle, changeBusiness: intent => {
      if (root.$gameSystem !== system || observed && (current() !== observed || observed.stateGeneration !== generation)) return { status: 'refused', reason: 'stale-world-command' };
      const app = application(), outcome = app.setWorldWeather(intent);
      if (outcome.status !== 'refused') notices.commandObserved(app);
      return outcome;
    }, diagnose }, values, () => Reflect.apply(command, this, [params]));
    if (!battle) notices.flush(); return result;
  };
  const mapPrototype = hostRecord(hostRecord(root.Scene_Map)?.prototype), onMapLoaded = mapPrototype?.onMapLoaded;
  if (mapPrototype && typeof onMapLoaded === 'function') mapPrototype.onMapLoaded = function(this: unknown, ...args: unknown[]): unknown {
    const rebuilt = hostRecord(this)?._transfer === true;
    const result = Reflect.apply(onMapLoaded, this, args);
    try {
      if (hostRecord(root.$gameSystem)?._psSaveError) throw new Error('state-unusable');
      if (!hostRecord(root.$dataMap)) throw new Error('current-map-unavailable');
      const mapId = invoke(root.$gameMap, 'mapId'), transferring = invoke(root.$gamePlayer, 'isTransferring');
      if (typeof mapId !== 'number' || typeof transferring !== 'boolean') throw new Error('map-entry-facts-invalid');
      const app = application();
      const outcome = entry.mapLoaded(app, mapId, transferring, rebuilt, hostRecord(this) ?? undefined);
      if (hostRecord(this)) recoveryCall('blackoutLoadEntered', [app, this, outcome]);
      if (outcome?.status === 'refused') diagnose(outcome.reason);
      notices.flush();
    } catch (error) { diagnose(errorText(error)); }
    return result;
  };
  const mapReady = mapPrototype?.isReady;
  if (mapPrototype && typeof mapReady === 'function') mapPrototype.isReady = function(this: unknown, ...args: unknown[]): unknown {
    const result = Reflect.apply(mapReady, this, args);
    if (result === true && hostRecord(root.SceneManager)?._scene === this) recoveryCall('companionNativeMapReady');
    return result;
  };
  // Pre-update gate is armed before Game_Map input/interpreter/parallel work; messages/native ticks continue.
  const mapUpdate = mapPrototype?.update;
  if (mapPrototype && typeof mapUpdate === 'function') mapPrototype.update = function(this: unknown, ...args: unknown[]): unknown {
    const manager = hostRecord(root.SceneManager);
    if (manager?._scene === this) recoveryCall('companionNativeMapFrame');
    return Reflect.apply(mapUpdate, this, args);
  };
  const terminateMap = mapPrototype?.terminate;
  if (mapPrototype && typeof terminateMap === 'function') mapPrototype.terminate = function(this: object, ...args: unknown[]): unknown {
    try { return Reflect.apply(terminateMap, this, args); } finally { fieldMoves.releaseScene(this); }
  };
  const manager = hostRecord(root.SceneManager), updateScene = manager?.updateScene;
  if (manager && typeof updateScene === 'function') manager.updateScene = function(this: unknown, ...args: unknown[]): unknown {
    const result = Reflect.apply(updateScene, this, args);
    const scene = manager._scene, mapConstructor = root.Scene_Map;
    const onMap = typeof mapConstructor === 'function' && scene instanceof mapConstructor;
    const changing = invoke(manager, 'isSceneChanging') === true;
    const sceneRecord = hostRecord(scene), started = typeof sceneRecord?.isStarted === 'function' && invoke(scene, 'isStarted') === true;
    const ready = onMap && started && !changing && hostRecord(root.$dataMap) !== null && invoke(root.$gamePlayer, 'isTransferring') === false && invoke(root.$gameMessage, 'isBusy') === false;
    recoveryCall('pumpBlackoutLoadRecovery');
    if (ready) {
      notices.flush();
      const initialize = flow()?.initializeBlackoutCompanions;
      if (typeof flow()?.companionNativeMapFrame !== 'function' && !recoveryPending() && !companionPending() && typeof initialize === 'function') Reflect.apply(initialize, flow(), []);
    }
    fields.update(ready, !onMap && !changing && sceneRecord?._psInventory !== true);
    completed.update(onMap, changing, scene, manager._nextScene);
    // MZ pauses Scene_Map updates while unfocused. This independent pump observes its real focus clock
    // and advances only the fishing session's child interpreter, never the parent map interpreter.
    fishing.update();
    fieldMoves.update();
    return result;
  };
})();
