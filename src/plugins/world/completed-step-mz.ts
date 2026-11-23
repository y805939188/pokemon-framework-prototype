import type { OwnedSurfLandingHold, OwnedSurfLandingStepScope } from '../../framework/app/surf-landing-ports';
import type { WorldMovementStartLifecycle } from '../../framework/app/movement-start-ports';
import type { TravelReceipt } from '../../framework/app/world-travel-operation';
import type { WorldBattleAdmission } from '../../framework/app/ports';
import type { EncounterModeResolution } from './encounter-mode-host';
import type { HostApplication } from '../application-host';
import type { CompletedStepHostPort, CompletedStepLocation, CompletedStepPermit, CompletedStepPresentationAck, CompletedWorldStep, OwnedRepelSelection, OwnedRepelSceneHooks, RepelSelectionReply, CompletedWorldStepOutcome } from '../../framework/app/ports';
import type { CompletedHostStep, FieldStepHost, FieldStepCompletion, AdoptedFieldStep } from './step-host';
import { hostRecord, invoke } from './host-access';

export type StepApplication = Pick<HostApplication, 'stateGeneration' | 'completeWorldStep' | 'cancelCompletedWorldStep' | 'isOwnedRepelSelection'> & Partial<Pick<HostApplication, 'ownedRepelSceneHooks' | 'isWorldTravelStepPending' | 'isOwnedCompletedStepArrival' | 'isOwnedSurfLandingTerminalArrival'>>;
export function isStepApplication(value: unknown): value is StepApplication {
  const record = hostRecord(value);
  return !!record && Number.isSafeInteger(record.stateGeneration) && ['completeWorldStep', 'cancelCompletedWorldStep', 'isOwnedRepelSelection'].every(key => typeof record[key] === 'function');
}
interface RunningStep { application: StepApplication; step: Readonly<CompletedHostStep>; owner: CompletedStepPermit | null; returnedScene?: ConnectionStepReturn }
export interface ConnectionStepReturn {
  readonly scene: object; readonly player: object; readonly map: object; readonly mapId: number;
  readonly x: number; readonly y: number; readonly generation: number;
}
export interface ConnectionStepReservation {
  activate(facts: Readonly<{ regionId: number; terrainTag: number; sceneActive: boolean }>): void;
  finish(outcome: CompletedWorldStepOutcome): ConnectionStepReturn | null;
  cancel(): void;
}
export interface ConnectionStepGateway {
  reserve(owner: object, receipt: TravelReceipt, stepId: string): ConnectionStepReservation;
}
interface SelectionWait { owner: CompletedStepPermit; selection: OwnedRepelSelection; scene: object; resolve(reply: RepelSelectionReply): void }
interface PresentationWait { id: number; kind: 'message' | 'flash'; resolve(ack: CompletedStepPresentationAck): void }
function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`completed-step-invalid:${label}`);
  return value;
}
function object(value: unknown, label: string): object { const record = hostRecord(value); if (!record) throw new Error(`completed-step-unavailable:${label}`); return record; }

/** Host effects only. App remains the sole writer and validates every continuation against actual host identities. */
export interface CompletedStepMZOptions {
  readonly nativeIsProxy?: (value: unknown) => boolean; readonly iceTerrainTags?: readonly number[]; readonly encounterMode?: () => EncounterModeResolution; readonly openBattle?: (app: StepApplication, admission: WorldBattleAdmission) => void }
export function createCompletedStepMZ(root: Record<string, unknown>, current: () => StepApplication | null, host: () => FieldStepHost | null, diagnose: (reason: string) => void, options: CompletedStepMZOptions = {}) {
  const iceTerrainTags = options.iceTerrainTags ?? [];
  if (!Array.isArray(iceTerrainTags) || iceTerrainTags.some(tag => !Number.isSafeInteger(tag) || tag < 0 || tag > 7)) throw new Error('invalid-ice-terrain-tags');
  interface ArrivalDispatch { readonly active: RunningStep; readonly owner: CompletedStepPermit; readonly manager: object; readonly scene: object; readonly data: object }
  let arrivalDispatch: ArrivalDispatch | null = null;
  let running: RunningStep | null = null, selection: SelectionWait | null = null, presentation: PresentationWait | null = null;
  const location = (): CompletedStepLocation => {
    const app = current(); if (!app) throw new Error('completed-step-application-unavailable');
    const player = object(root.$gamePlayer, 'player'), map = object(root.$gameMap, 'map'), record = hostRecord(player)!;
    const mapId = integer(invoke(map, 'mapId'), 'mapId'); if (!mapId) throw new Error('completed-step-invalid:mapId');
    return { hostOwner: app, generation: app.stateGeneration, player, map, mapId, x: integer(record.x, 'x'), y: integer(record.y, 'y') };
  };
  const ownerCurrent = (owner: CompletedStepPermit): RunningStep => {
    const active = running, now = location();
    if (!active || active.application !== now.hostOwner || active.step.id === '' || owner.generation !== now.generation ||
      active.step.player !== now.player || active.step.owner.map !== now.map || active.step.owner.mapId !== now.mapId || active.step.x !== now.x || active.step.y !== now.y ||
      active.owner !== null && active.owner !== owner) throw new Error('stale-completed-step');
    active.owner = owner; return active;
  };
  const cancelEffects = (): void => {
    const oldSelection = selection, oldPresentation = presentation; selection = null; presentation = null;
    if (oldSelection) { try { invoke(root.PSInventory, 'cancelOwnedRepel', [oldSelection.owner, oldSelection.selection]); } catch (error) { diagnose(String(error)); } oldSelection.resolve({ status: 'cancelled' }); }
    oldPresentation?.resolve({ id: oldPresentation.id, status: 'failed', reason: 'completed-step-cancelled' });
  };
  const memberName = (memberId: string): string => {
    const game = hostRecord(invoke(root.PSFlow, 'game')), party = game?.party;
    const member = Array.isArray(party) ? hostRecord(party.find((value: unknown) => hostRecord(value)?.id === memberId)) : null;
    if (!member) throw new Error('poison-message-member-unavailable');
    if (typeof member.nickname === 'string' && member.nickname) return member.nickname;
    if (typeof member.species !== 'string' || !Number.isSafeInteger(member.form)) throw new Error('poison-message-member-invalid');
    const name = invoke(root.PSFlow, 'speciesName', [member.species, member.form]);
    if (typeof name !== 'string') throw new Error('poison-message-name-invalid');
    return name;
  };
  const finishOutcome = (active: RunningStep, done: (result: FieldStepCompletion) => void, native: boolean, outcome: CompletedWorldStepOutcome): void => {
        if (running !== active) return;
        if (outcome.status === 'ordinary-unhandled') diagnose(outcome.reason);
        else if (outcome.status === 'blackout-required' && outcome.blackoutAdmitted !== true) diagnose('field-blackout-handler-unavailable');
        else if (outcome.status === 'refused' || outcome.status === 'failed') diagnose(outcome.reason);
        const success = ['completed', 'no-encounter', 'unsupported', 'ordinary-unhandled'].includes(outcome.status);
        const noticeBlocked = outcome.status === 'no-encounter' && outcome.reason === 'world-notice-pending';
        const result: FieldStepCompletion = outcome.status === 'refused' || outcome.status === 'failed' ? 'arrival-only'
          : !noticeBlocked && (outcome.status === 'ordinary-unhandled' || native && success) ? 'ordinary' : 'handled';
        running = null; cancelEffects(); done(result);
        if (outcome.status === 'battle-admitted') {
          try { invoke(root.$gameTemp, 'clearDestination'); if (!options.openBattle) throw Error('world-battle-presentation-unavailable'); options.openBattle(active.application, outcome.admission); }
          catch (error) { invoke(active.application, 'abortAdmittedWorldBattle', [outcome.admission, String(error)]); diagnose(String(error)); }
        }
  };
  const ownData = (raw: unknown, key: string): unknown => {
    if (!raw || typeof raw !== 'object' && typeof raw !== 'function' || !options.nativeIsProxy || options.nativeIsProxy(raw)) return undefined;
    const d = Object.getOwnPropertyDescriptor(raw, key); return d && 'value' in d ? d.value : undefined;
  };
  const sourceCurrent = (scope: Omit<ArrivalDispatch, 'owner'>): boolean =>
    ownData(root, 'SceneManager') === scope.manager && ownData(scope.manager, '_scene') === scope.scene && ownData(scope.manager, '_nextScene') === null &&
    ownData(root, '$dataMap') === scope.data && ownData(root, '$gamePlayer') === scope.active.step.player && ownData(root, '$gameMap') === scope.active.step.owner.map;
  const ownsArrival = (player: object): boolean => {
    const scope = arrivalDispatch, checkProxy = options.nativeIsProxy;
    if (!scope || running !== scope.active || scope.active.step.player !== player || !checkProxy || !sourceCurrent(scope)) return false;
    const app = scope.active.application;
    if (checkProxy(app) || checkProxy(scope.owner)) return false;
    let query: ((owner: CompletedStepPermit, id: string) => boolean) | null = null;
    for (let at: object | null = app, depth = 0; at && depth < 32; at = Object.getPrototypeOf(at) as object | null, depth++) {
      if (checkProxy(at)) return false;
      const d = Object.getOwnPropertyDescriptor(at, 'isOwnedCompletedStepArrival');
      if (!d) continue;
      if ('value' in d && typeof d.value === 'function' && !checkProxy(d.value)) query = d.value as (owner: CompletedStepPermit, id: string) => boolean;
      break;
    }
    if (!query || current() !== app) return false;
    let accepted: unknown;
    try { accepted = Reflect.apply(query, app, [scope.owner, scope.active.step.id]); } catch { return false; }
    return accepted === true && current() === app && arrivalDispatch === scope && running === scope.active && sourceCurrent(scope);
  };
  const execution: CompletedStepHostPort = {
    current: location,
    openRepelSelection(request) {
      const active = ownerCurrent(request.owner);
      if (!active.application.isOwnedRepelSelection(request.owner, request.selection) || running !== active || selection || presentation) return Promise.resolve({ status: 'cancelled' });
      return new Promise<RepelSelectionReply>((resolve, reject) => {
        try {
          const hooks = active.application.ownedRepelSceneHooks?.(request.owner, request.selection);
          let issued: { handle: object; scene: object } | null = null;
          const technical: OwnedRepelSceneHooks | undefined = hooks ? Object.freeze({
            opened(handle: object, scene: object) { if (issued || !hooks.opened(handle, scene)) return false; issued = { handle, scene }; return true; },
            beforeReturn: (handle: object, scene: object) => !!issued && handle === issued.handle && scene === issued.scene && hooks.beforeReturn(handle, scene),
            returnQueued: (handle: object) => !!issued && handle === issued.handle && hooks.returnQueued(handle),
            returned: (handle: object) => {
              if (!issued || handle !== issued.handle || !hooks.returned(handle)) return false;
              if (running !== active) return false;
              const own = (value: unknown, key: string): unknown => { const record = hostRecord(value); if (!record) return undefined; const d = Object.getOwnPropertyDescriptor(record, key); return d && Object.hasOwn(d, 'value') ? d.value : undefined; };
              const manager = own(root, 'SceneManager'), scene = own(manager, '_scene'), player = own(root, '$gamePlayer'), map = own(root, '$gameMap');
              const generation = active.application.stateGeneration;
              if (running !== active || !scene || typeof scene !== 'object' || generation !== request.owner.generation || player !== active.step.player || map !== active.step.owner.map || own(map, '_mapId') !== active.step.owner.mapId || own(player, '_x') !== active.step.x || own(player, '_y') !== active.step.y) return false;
              active.returnedScene = Object.freeze({ scene, player: active.step.player, map: active.step.owner.map, mapId: active.step.owner.mapId, x: active.step.x, y: active.step.y, generation });
              return true;
            },
          }) : undefined;
          const result = invoke(root.PSInventory, 'selectOwnedRepel', [request.owner, request.selection, (reply: RepelSelectionReply) => {
            const wait = selection; if (!wait || wait.owner !== request.owner || wait.selection !== request.selection) return;
            selection = null; resolve(reply);
          }, technical]);
          if (running !== active || selection || presentation) throw Error('stale-repel-selection-presentation');
          if (hooks) {
            const binding = issued as { handle: object; scene: object } | null;
            if (!binding || result !== binding.handle) throw Error('repel-selection-native-binding-unavailable');
            selection = { owner: request.owner, selection: request.selection, scene: binding.scene, resolve }; return;
          }
          const scene = hostRecord(result)?.scene;
          if (!hostRecord(scene)) { reject(new Error('repel-selection-presentation-unavailable')); return; }
          selection = { owner: request.owner, selection: request.selection, scene: object(scene, 'repel-scene'), resolve };
        } catch (error) { reject(error); }
      });
    },
    present(request) {
      ownerCurrent(request.owner);
      if (presentation || selection) return Promise.resolve({ id: request.effect.id, status: 'failed', reason: 'completed-step-presentation-active' });
      const effect = request.effect;
      return new Promise<CompletedStepPresentationAck>((resolve, reject) => {
        try {
          if (effect.kind === 'poison-feedback') {
            invoke(root.SoundManager, 'playActorDamage'); invoke(root.$gameScreen, 'startFlash', [[255, 0, 0, 128], 8]);
            presentation = { id: effect.id, kind: 'flash', resolve };
          } else {
            const flow = root.PSFlow, translator = invoke(flow, 'translator');
            const message = effect.kind === 'poison-message' ? effect.message : null;
            const key = message === null ? 'world.repelExpired' : `world.${message}`;
            const name = effect.kind === 'poison-message' ? memberName(effect.memberId) : '';
            const fallback = message === null ? 'Repel wore off.' : message === 'fainted' ? `${name} fainted!` : `${name} survived the poisoning!`;
            const text = invoke(translator, 'tOr', [key, fallback]); if (typeof text !== 'string') throw new Error('completed-step-message-invalid');
            invoke(root.$gameMessage, 'add', [text]); presentation = { id: effect.id, kind: 'message', resolve };
          }
        } catch (error) { reject(error); }
      });
    },
    dispatchArrival(request) {
      const active = ownerCurrent(request.owner);
      if (request.step.id !== active.step.id) return { status: 'failed', reason: 'completed-step-arrival-mismatch' };
      const manager = ownData(root, 'SceneManager'), scene = ownData(manager, '_scene'), data = ownData(root, '$dataMap');
      const previous = arrivalDispatch, scope: ArrivalDispatch | null = manager && (typeof manager === 'object' || typeof manager === 'function') && scene && typeof scene === 'object' && data && typeof data === 'object'
        ? { active, owner: request.owner, manager, scene, data } : null;
      arrivalDispatch = scope;
      try { return host()?.dispatchArrival(active.step.id) ?? { status: 'failed', reason: 'completed-step-host-unavailable' }; }
      finally { if (arrivalDispatch === scope) arrivalDispatch = previous; }
    },
  };
  const connectionSteps: ConnectionStepGateway = {
    reserve(owner, receipt, stepId) {
      if (!stepId || running) throw Error('connection-step-presentation-active');
      const app = current(), target = location(), nativeHost = host();
      if (!app || !nativeHost || target.hostOwner !== app || app.isWorldTravelStepPending?.(owner, receipt) !== true) throw Error('connection-step-owner-stale');
      const player = hostRecord(target.player)!;
      const step: Readonly<CompletedHostStep> = Object.freeze({ id: stepId,
        owner: Object.freeze({ owner: app, generation: target.generation, map: target.map, mapId: target.mapId }), player: target.player,
        x: target.x, y: target.y, regionId: integer(invoke(player, 'regionId'), 'regionId'), terrainTag: integer(invoke(player, 'terrainTag'), 'terrainTag'), sceneActive: false });
      if (running || app.isWorldTravelStepPending?.(owner, receipt) !== true) throw Error('connection-step-owner-stale');
      const active: RunningStep = { application: app, step, owner: null }; running = active;
      let adopted: AdoptedFieldStep | null = null, closed = false;
      const cancel = (): void => {
        if (closed || running !== active) return;
        closed = true; running = null; cancelEffects();
        app.cancelCompletedWorldStep(stepId);
      };
      try { adopted = nativeHost.adoptConnection(step, cancel); }
      catch (error) { if (running === active) { running = null; cancelEffects(); } throw error; }
      return Object.freeze({
        activate(facts: Readonly<{ regionId: number; terrainTag: number; sceneActive: boolean }>): void {
          if (closed || running !== active || app.isWorldTravelStepPending?.(owner, receipt) !== true) throw Error('connection-step-owner-stale');
          const actual = location();
          if (actual.hostOwner !== app || actual.generation !== target.generation || actual.player !== target.player || actual.map !== target.map || actual.mapId !== target.mapId || actual.x !== target.x || actual.y !== target.y || facts.sceneActive !== true || !Number.isSafeInteger(facts.regionId) || facts.regionId < 0 || !Number.isSafeInteger(facts.terrainTag) || facts.terrainTag < 0 || facts.terrainTag > 7) throw Error('connection-step-target-stale');
          const activated = Object.freeze({ ...step, regionId: facts.regionId, terrainTag: facts.terrainTag, sceneActive: facts.sceneActive });
          adopted!.activate(activated);
          if (closed || running !== active) throw Error('connection-step-owner-stale');
          active.step = activated;
        },
        finish(outcome: CompletedWorldStepOutcome): ConnectionStepReturn | null {
          if (closed || running !== active) return null;
          const returned = active.returnedScene ?? null;
          const mode = options.encounterMode?.(), native = mode?.status === 'ready' && (mode.mode === 'legacy-note' || mode.mode === 'mz-native');
          finishOutcome(active, adopted!.done, native, outcome); closed = true;
          // A real C1 return also belongs to a completed poison step that handed off to F.
          // finishOutcome still handles that step without dispatching arrival/encounters.
          return ['completed', 'duplicate', 'no-encounter', 'unsupported', 'ordinary-unhandled', 'blackout-required'].includes(outcome.status) ? returned : null;
        },
        cancel(): void { if (closed || running !== active) return; adopted!.cancel(); cancel(); },
      });
    },
  };
  let surfSequence = 0;
  const surfLandings = {
    hold(proof: Extract<WorldMovementStartLifecycle, { kind: 'jump' }>, retiredLanding: () => void, sameMotion: () => boolean): OwnedSurfLandingHold {
      if (running) throw Error('completed-step-presentation-active');
      // This is mechanical native arrival ownership, not an App permit. No native
      // reader/provider is called before claim has installed the hold.
      const app = proof.application as StepApplication;
      const step: Readonly<CompletedHostStep> = Object.freeze({ id: `mz-surf-land:${proof.generation}:${++surfSequence}`,
        owner: Object.freeze({ owner: app, generation: proof.generation, map: proof.map, mapId: proof.mapId }),
        player: proof.player, x: proof.to.x, y: proof.to.y, regionId: 0, terrainTag: 0, sceneActive: true });
      const active: RunningStep = { application: app, step, owner: null }; running = active;
      const nativeHost = host();
      if (!nativeHost) { if (running === active) running = null; throw Error('surf-landing-native-host-unavailable'); }
      const held = nativeHost.holdSurfLanding(step, () => { if (running === active) { running = null; cancelEffects(); } }, sameMotion);
      let closed = false, prepared = false;
      const terminalQuery = (() => {
        for (let at: object | null = app, depth = 0; at && depth < 32; at = Object.getPrototypeOf(at) as object | null, depth++) {
          if (!options.nativeIsProxy || options.nativeIsProxy(at)) return null;
          const d = Object.getOwnPropertyDescriptor(at, 'isOwnedSurfLandingTerminalArrival'); if (!d) continue;
          return 'value' in d && typeof d.value === 'function' && !options.nativeIsProxy(d.value) ? d.value as (ticket: object, entry: object) => boolean : null;
        }
        return null;
      })();
      const same = (): boolean => {
        const actual = location();
        return !closed && running === active && current() === app && actual.hostOwner === app && actual.generation === proof.generation
          && actual.map === proof.map && actual.mapId === proof.mapId && actual.player === proof.player && actual.x === proof.to.x && actual.y === proof.to.y;
      };
      return Object.freeze({ entry: held.entry,
        prepare(id: string): OwnedSurfLandingStepScope {
          if (prepared || !isStepApplication(app) || !same()) throw Error('surf-landing-native-scope-stale'); prepared = true;
          const player = hostRecord(proof.player)!, terrainTag = integer(invoke(proof.player, 'terrainTag'), 'terrainTag'), regionId = integer(invoke(proof.player, 'regionId'), 'regionId');
          if (terrainTag > 7) throw Error('invalid-native-terrain-tag');
          const iceMethod = player.isOnIce, ice = typeof iceMethod === 'function' ? invoke(proof.player, 'isOnIce') : iceMethod === undefined ? iceTerrainTags.includes(terrainTag) : undefined;
          if (typeof ice !== 'boolean' || !same() || invoke(proof.scene, 'isActive') !== true) throw Error('surf-landing-native-facts-stale');
          const activated = Object.freeze({ ...step, id, terrainTag, regionId, sceneActive: true }); held.activate(activated);
          if (!same()) throw Error('surf-landing-native-scope-stale'); active.step = activated; retiredLanding();
          const input: CompletedWorldStep = Object.freeze({ ...location(), id, ice, regionId, terrainTag, sceneActive: true });
          return Object.freeze({ step: input,
            finish(outcome: CompletedWorldStepOutcome): void {
              if (closed || running !== active) return;
              const mode = options.encounterMode?.(), native = mode?.status === 'ready' && (mode.mode === 'legacy-note' || mode.mode === 'mz-native');
              finishOutcome(active, held.done, native, outcome); closed = true;
            },
            cancel(): void { if (closed || running !== active) return; held.cancel(); closed = true; if (running === active) { running = null; cancelEffects(); } },
          });
        },
        arrivalOnly(ticket: object): void {
          if (closed || running !== active) return;
          try {
            // Materialize before location()/native callbacks. The final guard uses
            // only own data and the original Core ticket query, never a provider.
            const flow = ownData(root, 'PSFlow'), system = ownData(root, '$gameSystem'), game = ownData(system, '_psGame');
            const scope = { active, manager: proof.manager, scene: proof.scene, data: proof.data };
            const content = proof.content, contentCells: { owner: object; prototype: object | null; keys: readonly PropertyKey[]; descriptors: readonly PropertyDescriptor[] }[] = [];
            const visited = new Set<object>();
            const capture = (value: unknown): void => {
              if (value === null || typeof value !== 'object') return;
              if (!options.nativeIsProxy || options.nativeIsProxy(value)) throw Error('surf-landing-terminal-content-unsafe');
              if (visited.has(value)) return; visited.add(value);
              const keys = Reflect.ownKeys(value), descriptors = keys.map(key => Object.getOwnPropertyDescriptor(value, key)!);
              if (descriptors.some(d => !('value' in d))) throw Error('surf-landing-terminal-content-accessor');
              contentCells.push({ owner: value, prototype: Object.getPrototypeOf(value) as object | null, keys, descriptors });
              for (const descriptor of descriptors) capture(descriptor.value);
            };
            capture(content);
            const source = (): boolean => {
              if (!flow || !system || !game || !sourceCurrent(scope) || ownData(root, 'PSFlow') !== flow || ownData(flow, '_app') !== app
                || ownData(flow, '_content') !== content || ownData(root, '$gameSystem') !== system || ownData(system, '_psGame') !== game
                || ownData(proof.scene, '_started') !== true || ownData(proof.scene, '_active') !== true
                || ownData(proof.map, '_mapId') !== proof.mapId || ownData(proof.player, '_x') !== proof.to.x || ownData(proof.player, '_y') !== proof.to.y
                || ownData(proof.player, '_transferring') !== false || ownData(proof.player, '_jumpCount') !== 0
                || ownData(proof.player, '_realX') !== proof.to.x || ownData(proof.player, '_realY') !== proof.to.y
                || ownData(proof.data, 'width') !== proof.geometry.width || ownData(proof.data, 'height') !== proof.geometry.height || ownData(proof.data, 'scrollType') !== proof.geometry.scrollType) return false;
              for (const cell of contentCells) {
                if (Object.getPrototypeOf(cell.owner) !== cell.prototype) return false;
                const keys = Reflect.ownKeys(cell.owner);
                if (keys.length !== cell.keys.length || keys.some((key, index) => key !== cell.keys[index])) return false;
                for (let index = 0; index < keys.length; index++) {
                  const d = Object.getOwnPropertyDescriptor(cell.owner, keys[index]!), before = cell.descriptors[index]!;
                  if (!d || !('value' in d) || !Object.is(d.value, before.value) || d.writable !== before.writable || d.enumerable !== before.enumerable || d.configurable !== before.configurable) return false;
                }
              }
              return true;
            };
            const pure = (): boolean => !closed && running === active && source() && terminalQuery !== null
              && Reflect.apply(terminalQuery, app, [ticket, held.entry]) === true && !closed && running === active && source();
            if (!same() || !pure()) { held.cancel(); return; } held.terminal(pure);
          }
          catch (error) { diagnose(error instanceof Error ? error.message : String(error)); held.cancel(); }
          finally { closed = true; if (running === active) { running = null; cancelEffects(); } }
        },
        cancel(): void { if (closed || running !== active) return; held.cancel(); closed = true; if (running === active) { running = null; cancelEffects(); } },
      });
    },
  };
  return { surfLandings, ownsArrival, dispatchingArrival: (player: object): boolean => arrivalDispatch?.active.step.player === player,
    execution, connectionSteps,
    location,
    run(step: Readonly<CompletedHostStep>, done: (result: FieldStepCompletion) => void): () => void {
      if (running) throw new Error('completed-step-presentation-active');
      const app = current(); if (!app || app !== step.owner.owner) throw new Error('completed-step-application-unavailable');
      const player = hostRecord(step.player)!, iceMethod = player.isOnIce;
      if (!Number.isSafeInteger(step.terrainTag) || step.terrainTag < 0 || step.terrainTag > 7) throw new Error('invalid-native-terrain-tag');
      // Native MZ has no ice ability by default. Custom meanings are opt-in, never inferred from reference tag ids.
      const ice = typeof iceMethod === 'function' ? invoke(player, 'isOnIce') : iceMethod === undefined ? iceTerrainTags.includes(step.terrainTag) : undefined;
      if (typeof ice !== 'boolean') throw new Error('terrain-ice-fact-unavailable');
      const mode = options.encounterMode?.();
      const native = mode?.status === 'ready' && (mode.mode === 'legacy-note' || mode.mode === 'mz-native');
      const active: RunningStep = { application: app, step, owner: null }; running = active;
      const input: CompletedWorldStep = { ...location(), id: step.id, ice, regionId: step.regionId, terrainTag: step.terrainTag, sceneActive: step.sceneActive };
      const failed = (error: unknown): void => { if (running !== active) return; running = null; cancelEffects(); diagnose(error instanceof Error ? error.message : String(error)); done('arrival-only'); };
      let pending: ReturnType<StepApplication['completeWorldStep']>;
      try { pending = app.completeWorldStep(input); }
      catch (error) { failed(error); return () => {}; }
      void pending.then(outcome => {
        finishOutcome(active, done, native, outcome);
      }, failed);
      return () => { if (running !== active) return; running = null; app.cancelCompletedWorldStep(step.id); cancelEffects(); };
    },
    update(onMap: boolean, changing: boolean, scene: unknown, nextScene: unknown): void {
      const active = running; if (!active) return;
      const wait = selection;
      const selectionCurrent = !!wait && active.application.isOwnedRepelSelection(wait.owner, wait.selection);
      if (running !== active || selection !== wait) return;
      const ownedScene = selectionCurrent && (scene === wait!.scene || nextScene === wait!.scene);
      if ((!!wait && !selectionCurrent || !onMap && !ownedScene) && !changing) { host()?.cancel('scene-closed'); return; }
      if (presentation) {
        const effect = presentation;
        try {
          const complete = effect.kind === 'message' ? invoke(root.$gameMessage, 'isBusy') === false : integer(hostRecord(root.$gameScreen)?._flashDuration, 'flashDuration') === 0;
          if (complete) { presentation = null; effect.resolve({ id: effect.id, status: 'completed' }); }
        } catch (error) { presentation = null; effect.resolve({ id: effect.id, status: 'failed', reason: error instanceof Error ? error.message : String(error) }); }
      }
    },
    cancel: cancelEffects,
  };
}
