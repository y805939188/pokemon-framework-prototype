/** Production presentation. Only exact requests issued by the actual App can execute effects. */
import type { HostApplication } from '../application-host';
import type { FieldShortcutSelection, FieldShortcutRequest, FieldShortcutExecutionOutcome } from '../../framework/app';
import type { WorldBattleAdmission } from '../../framework/app/ports';
import type { FlyDestination } from '../../framework/rules/region-map';
import type { InputFrame } from '../management/model';
import { createFieldShortcutMenus } from './field-shortcut-menu';
import type { FieldMenuHandle, FieldMenuView } from './field-shortcut-menu';
import { createPartyFieldActions } from './party-field-actions';
import { hostRecord, invoke } from './host-access';
import { createFlyDestinationMenus } from './field-fly-menu';
import type { FlyMenuHandle, FlyMenuView } from './field-fly-menu';
import { createFieldTravelRecoveryUI } from './field-travel-recovery-ui-mz';
import type { RecoveryView } from './field-travel-recovery-ui-mz';
import { fishingMessage, ordinaryFishingRefusal, completedFishingPresentationFailure } from './fishing-messages';

export type ShortcutUIApplication = Pick<HostApplication, 'stateGeneration' | 'encounterBlocked' | 'saveBlocked'
  | 'fieldShortcutQueries' | 'prepareFieldShortcutSelection' | 'executeFieldShortcut' | 'cancelFieldShortcut'
  | 'abortAdmittedWorldBattle' | 'worldFlyDestinations' | 'fieldShortcutRecovery'>;
export interface PartyFieldCaller {
  readonly owner: object; readonly application: ShortcutUIApplication; readonly generation: number; readonly scene: object;
  isCurrent(): boolean;
  pause(): () => void;
  /** End this exact Management owner and perform the genuine native pop. */
  close(): boolean;
}
export interface FieldShortcutUIOptions {
  currentApplication(): ShortcutUIApplication | null;
  application(): ShortcutUIApplication;
  input(): InputFrame;
  view(scene: object): FieldMenuView;
  flyView(scene: object): FlyMenuView;
  recoveryView(scene: object): RecoveryView;
  managementIdle(): boolean;
  openBattle(application: ShortcutUIApplication, admission: WorldBattleAdmission): boolean;
  diagnose(reason: string): void;
}
interface Anchor {
  readonly application: ShortcutUIApplication; readonly generation: number;
  readonly map: object; readonly player: object; readonly mapId: number;
}
interface Context extends Anchor { readonly scene: object; readonly x: number; readonly y: number }
interface PartyOrigin extends Anchor {
  readonly scene: object; readonly constructor: Function; readonly stack: object; readonly entries: readonly unknown[];
  readonly viaMenu: boolean;
}
interface MapMenu { readonly context: Context; handle: FieldMenuHandle | null; showing: boolean; request: FieldShortcutRequest | null }
interface FlyPicker { readonly context: Context; handle: FlyMenuHandle | null }
interface ReturnIntent extends Anchor {
  readonly x: number; readonly y: number; readonly selection: FieldShortcutSelection; readonly memberId: string;
  expected: object; readonly entries: readonly unknown[]; readonly stack: object;
  stage: 'menu' | 'map' | 'executing';
  request: FieldShortcutRequest | null;
}
const why = (error: unknown): string => error instanceof Error ? error.message : String(error);
function own(value: unknown, key: string): unknown {
  const record = hostRecord(value), descriptor = record && Object.getOwnPropertyDescriptor(record, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
function constructorOf(value: object): Function | null {
  const prototype: unknown = Object.getPrototypeOf(value), candidate = own(prototype, 'constructor');
  return typeof candidate === 'function' ? candidate : null;
}

export function createFieldShortcutUIMZ(root: Record<string, unknown>, options: FieldShortcutUIOptions) {
  const menus = createFieldShortcutMenus();
  const flyMenus = createFlyDestinationMenus();
  const origins = new WeakMap<object, PartyOrigin>();
  let queued: Anchor | null = null, active: MapMenu | null = null, returning: ReturnIntent | null = null;
  let partyCaller: PartyFieldCaller | null = null, partyHandle: FieldMenuHandle | null = null;
  let fly: FlyPicker | null = null;
  let updating = false;
  const manager = (): Record<string, unknown> | null => hostRecord(own(root, 'SceneManager'));
  const currentScene = (): object | null => hostRecord(own(manager(), '_scene'));
  const onScene = (scene: object, name: 'Scene_Map' | 'Scene_Menu'): boolean => {
    const type = own(root, name); return typeof type === 'function' && scene instanceof type;
  };
  const capture = (application: ShortcutUIApplication): Anchor => {
    const map = hostRecord(own(root, '$gameMap')), player = hostRecord(own(root, '$gamePlayer')), mapId = own(map, '_mapId');
    if (!map || !player || !integer(mapId) || mapId <= 0 || options.currentApplication() !== application) throw Error('shortcut-native-source-unavailable');
    return { application, generation: application.stateGeneration, map, player, mapId };
  };
  const sameAnchor = (source: Anchor): boolean => options.currentApplication() === source.application && source.application.stateGeneration === source.generation
    && own(root, '$gameMap') === source.map && own(root, '$gamePlayer') === source.player && own(source.map, '_mapId') === source.mapId;
  const point = (source: Anchor): { x: number; y: number } => {
    const x = own(source.player, '_x'), y = own(source.player, '_y');
    if (!integer(x) || !integer(y) || x < 0 || y < 0) throw Error('shortcut-native-position-unavailable');
    return { x, y };
  };
  const sameContext = (context: Context): boolean => sameAnchor(context) && currentScene() === context.scene
    && own(context.player, '_x') === context.x && own(context.player, '_y') === context.y && !own(manager(), '_nextScene');
  const ready = (source: Anchor): Context | null => {
    if (!sameAnchor(source)) return null;
    const scene = currentScene(), host = manager();
    if (!scene || !host || !onScene(scene, 'Scene_Map') || own(host, '_nextScene') || invoke(host, 'isSceneChanging') !== false
      || invoke(scene, 'isStarted') !== true || invoke(source.player, 'isTransferring') !== false || invoke(source.player, 'isMoving') !== false
      || invoke(root.$gameMessage, 'isBusy') !== false || invoke(source.map, 'isEventRunning') !== false
      || source.application.encounterBlocked || source.application.saveBlocked) return null;
    const context: Context = { ...source, scene, ...point(source) };
    return sameContext(context) ? context : null;
  };
  const recoveries = createFieldTravelRecoveryUI({
    currentApplication: options.currentApplication, input: options.input, view: options.recoveryView, diagnose: options.diagnose,
    presentation(application) {
      if (options.currentApplication() !== application || !options.managementIdle() || active || returning || fly || party.pending()) return null;
      const scene = currentScene(), host = manager(), map = own(root, '$gameMap'), player = own(root, '$gamePlayer');
      if (!scene || !host || !onScene(scene, 'Scene_Map') || own(host, '_nextScene') || invoke(host, 'isSceneChanging') !== false
        || invoke(scene, 'isStarted') !== true || invoke(player, 'isTransferring') !== false || invoke(player, 'isMoving') !== false
        || invoke(root.$gameMessage, 'isBusy') !== false || invoke(map, 'isEventRunning') !== false) return null;
      return options.currentApplication() === application ? scene : null;
    },
  });
  const notifyRecovery = (handle: object | null, status: string, battleAdmission = false): void => {
    try { recoveries.settle(handle, status, battleAdmission); }
    catch (error) {
      if (battleAdmission) { try { recoveries.discard(handle); } catch { /* Only this UI observer is retired. */ } }
      try { options.diagnose(why(error)); } catch { /* A diagnostic hook cannot interrupt admitted-parent cleanup. */ }
    }
  };
  const stackMatches = (stack: object, entries: readonly unknown[]): boolean => {
    const actual = own(manager(), '_stack');
    return actual === stack && Array.isArray(actual) && actual.length === entries.length && entries.every((entry, index) => actual[index] === entry);
  };
  const cancelRequest = (source: Anchor, request: FieldShortcutRequest | null): void => {
    if (request && options.currentApplication() === source.application && source.application.stateGeneration === source.generation) source.application.cancelFieldShortcut(request);
  };
  const retireMenu = (menu: MapMenu, cancel = false): void => {
    if (active !== menu) return;
    active = null;
    try { if (cancel) cancelRequest(menu.context, menu.request); }
    finally { menu.handle?.dispose(); }
  };
  const present = (source: Context, outcome: FieldShortcutExecutionOutcome, current: () => boolean): void => {
    if (outcome.status !== 'accepted' || !outcome.admission) return;
    let available = false, staleReason = 'shortcut-battle-presentation-stale';
    try { available = current() && sameContext(source); }
    catch (error) { staleReason = why(error); }
    if (!available) {
      // The view can be stale while this genuine App reservation still owns both barriers.
      // App membership/generation/current-operation checks retire only this exact admission.
      source.application.abortAdmittedWorldBattle(outcome.admission, staleReason);
      return;
    }
    try { if (options.openBattle(source.application, outcome.admission)) return; }
    catch (error) {
      source.application.abortAdmittedWorldBattle(outcome.admission, why(error)); throw error;
    }
    {
      source.application.abortAdmittedWorldBattle(outcome.admission, 'shortcut-battle-presentation-refused');
      throw Error('shortcut-battle-presentation-refused');
    }
  };
  async function selectFly(context: Context, current: () => boolean): Promise<FlyDestination | null> {
    // No UI request has been issued yet. The real App alone derives region/visited/first-point/switch facts.
    const offered = context.application.worldFlyDestinations();
    if (!current() || !sameContext(context)) return null;
    if (offered.status !== 'ready') throw Error(offered.reason);
    if (fly || flyMenus.pending()) throw Error('fly-presentation-active');
    const picker: FlyPicker = { context, handle: null }; fly = picker;
    try {
      picker.handle = flyMenus.open({ regionId: offered.regionId, destinations: offered.destinations,
        view: options.flyView(context.scene), initialInput: options.input(),
        isCurrent: () => fly === picker && current() && sameContext(context) });
      if (!picker.handle) return null;
      const result = await picker.handle.result;
      if (result.status !== 'selected' || !current() || !sameContext(context)) return null;
      return result.destination;
    } finally {
      // An old picker completion cannot retire a reentrant successor presentation.
      if (fly === picker) fly = null;
      picker.handle?.dispose();
    }
  }
  async function execute(context: Context, selection: FieldShortcutSelection, entry: 'shortcut' | 'party', memberId: string | undefined,
    current: () => boolean, issued: (request: FieldShortcutRequest) => void): Promise<FieldShortcutExecutionOutcome> {
    if (!current() || !sameContext(context) || !ready(context)) return { status: 'refused', reason: 'shortcut-source-changed' };
    const flySelection = selection.kind === 'move' && selection.moveId === 'fly' ? await selectFly(context, current) : undefined;
    if (flySelection === null) return { status: 'cancelled' };
    // The picker has closed and released its native presentation gate before the fresh admission.
    if (!current() || !sameContext(context) || !ready(context)) return { status: 'refused', reason: 'shortcut-source-changed' };
    const resolved = context.application.fieldShortcutQueries().resolve(selection, memberId);
    if (!current() || !sameContext(context)) return { status: 'refused', reason: 'shortcut-source-changed' };
    if (resolved.status !== 'available') return resolved;
    const preparation = context.application.prepareFieldShortcutSelection(entry, selection, memberId);
    if (preparation.status !== 'prepared') return preparation;
    issued(preparation.request);
    if (!current() || !sameContext(context)) {
      cancelRequest(context, preparation.request); return { status: 'cancelled' };
    }
    const recovery = selection.kind === 'item' || selection.moveId === 'fly' || selection.moveId === 'dig' || selection.moveId === 'teleport'
      ? recoveries.capture(context.application, preparation.request) : null;
    let battleAdmission = false;
    try {
      const result = await context.application.executeFieldShortcut(preparation.request, flySelection ? { flySelection } : undefined);
      battleAdmission = 'admission' in result && !!result.admission;
      if (result.status === 'refused' && result.result && 'reason' in result.result && result.reason === result.result.reason && ordinaryFishingRefusal(result.result)
        && current() && sameContext(context)) {
        const text = fishingMessage(root, 'cannotUseHere');
        if (current() && sameContext(context)) {
          recoveries.discard(recovery);
          invoke(root.$gameMessage, 'add', [text]);
          return result;
        }
      }
      // This is the actual App result for this exact prepared request, not a displayed DTO.
      // Ask the existing request association whether any recovery remains before retiring its observer.
      if (selection.kind === 'item' && result.status === 'failed' && result.reason === 'host-failed' && result.result
        && completedFishingPresentationFailure(result.result) && current() && sameContext(context)) {
        const snapshot = context.application.fieldShortcutRecovery(preparation.request);
        const terminal = snapshot.status === 'unavailable' && snapshot.phase === 'unavailable' && snapshot.physical === 'unavailable'
          && snapshot.reasonCode === 'request-unavailable' && !snapshot.retry.enabled && !snapshot.cancel.enabled;
        if (terminal && current() && sameContext(context)) {
          const available = (): boolean => current() && sameContext(context) && !context.application.saveBlocked && !context.application.encounterBlocked;
          const text = available() ? fishingMessage(root, 'unavailable') : null;
          // This handle belongs only to preparation.request. A reentrant successor keeps its own observer.
          recoveries.discard(recovery);
          if (text !== null && available()) {
            invoke(root.$gameMessage, 'add', [text]);
            if (!available()) return result; // Message hooks can reenter; no later UI work owns their successor.
          }
          return result;
        }
      }
      if (result.status === 'failed' || result.status === 'refused') options.diagnose(result.reason);
      // Preserve the original parent's exact presentation/abort before any new recovery observer.
      present(context, result, current);
      notifyRecovery(recovery, result.status, battleAdmission);
      return result;
    } catch (error) { notifyRecovery(recovery, 'failed', battleAdmission); throw error; }
  }
  function showMap(source: Anchor): boolean {
    const context = ready(source); if (!context || active || returning || fly || party.pending()) return false;
    const menu: MapMenu = { context, handle: null, showing: true, request: null };
    active = menu;
    try {
      const view = options.view(context.scene);
      menu.handle = menus.open({ entry: 'shortcut', query: context.application.fieldShortcutQueries(), view,
        initialInput: options.input(), isCurrent: () => active === menu && sameContext(context),
        async admit(selection) {
          if (active !== menu || !sameContext(context)) return { status: 'refused', reason: 'shortcut-source-changed' };
          // A display choice becomes only a private intent. Release our native input gate before App admission.
          menu.showing = false;
          try { return await execute(context, selection, 'shortcut', undefined, () => active === menu, request => { menu.request = request; }); }
          finally {
            const issuedRequest = menu.request; menu.request = null;
            if (active === menu) {
              let resume = false;
              try { resume = !recoveries.hasNotice(issuedRequest) && sameContext(context) && ready(context) !== null; }
              finally {
                // A rejected old intent cannot repaint a view after its native caller became unavailable.
                // Dispose only this slot, before leaf refresh can run; never cancel the App's successor.
                if (active === menu) { if (resume) menu.showing = true; else retireMenu(menu); }
              }
            }
          }
        },
        onClose() { if (active === menu) active = null; },
      });
      if (!menu.handle) { view.dispose(); if (active === menu) active = null; return false; }
      return true;
    } catch (error) { retireMenu(menu); throw error; }
  }
  const party = createPartyFieldActions({
    currentCaller: () => partyCaller?.owner ?? null,
    pause(caller) {
      if (!partyCaller || partyCaller.owner !== caller || !partyCaller.isCurrent()) throw Error('stale-party-field-caller');
      return partyCaller.pause();
    },
  });
  return {
    /** Waiting for the command's own event to finish owns neither a save barrier nor an interpreter pause. */
    openMap(): boolean {
      if (queued || active || returning || fly || party.pending() || recoveries.pending()) return false;
      try { queued = capture(options.application()); return true; }
      catch (error) { options.diagnose(why(error)); return false; }
    },
    capturePartyReturn(): object | null {
      try {
        const application = options.currentApplication(), scene = currentScene(), host = manager(), entries = own(host, '_stack');
        if (!application || !scene || !host || !Array.isArray(entries) || own(host, '_nextScene')) return null;
        const viaMenu = onScene(scene, 'Scene_Menu');
        if (!onScene(scene, 'Scene_Map') && !viaMenu) return null;
        if (viaMenu) {
          const map = own(root, 'Scene_Map'), last = entries.at(-1);
          if (typeof map !== 'function' || typeof last !== 'function' || last.prototype !== map.prototype) return null;
        }
        const constructor = constructorOf(scene); if (!constructor) return null;
        const token = {};
        origins.set(token, { ...capture(application), scene, constructor, stack: entries, entries: [...entries], viaMenu });
        return token;
      } catch (error) { options.diagnose(why(error)); return null; }
    },
    openParty(caller: PartyFieldCaller, originToken: object | null, memberId: string): FieldMenuHandle | null {
      const origin = originToken && origins.get(originToken);
      if (!origin || active || returning || fly || party.pending() || !sameAnchor(origin) || caller.application !== origin.application
        || caller.generation !== origin.generation || !caller.isCurrent()) return null;
      const selectedAt = point(origin); let selection: FieldShortcutSelection | null = null;
      partyCaller = caller;
      const isCurrent = (): boolean => partyCaller === caller && sameAnchor(origin) && caller.isCurrent() && currentScene() === caller.scene && !own(manager(), '_nextScene');
      const view = options.view(caller.scene);
      try {
        const handle = party.open(caller.owner, memberId, {
          query: caller.application.fieldShortcutQueries(), view, initialInput: options.input(), isCurrent,
          admit(value) { if (!isCurrent()) return { status: 'refused', reason: 'stale-party-field-caller' }; selection = value; return { status: 'handoff' }; },
          onAccepted() {
            if (!selection || !isCurrent()) return;
            const chosen = selection;
            // close() releases only the real caller token. Native pop creates the expected new Scene.
            if (!caller.close() || !sameAnchor(origin)) return;
            const expected = hostRecord(own(manager(), '_nextScene'));
            if (!expected || constructorOf(expected) !== origin.constructor || !stackMatches(origin.stack, origin.entries)) {
              options.diagnose('shortcut-return-scene-unavailable'); return;
            }
            returning = { ...origin, ...selectedAt, selection: chosen, memberId, expected, entries: origin.entries,
              stage: origin.viaMenu ? 'menu' : 'map', request: null };
            if (partyCaller === caller) { partyCaller = null; partyHandle = null; }
          },
        });
        if (partyCaller === caller) partyHandle = handle;
        if (!handle) { view.dispose(); if (partyCaller === caller) partyCaller = null; }
        return handle;
      } catch (error) { if (partyCaller === caller) { partyCaller = null; partyHandle = null; } throw error; }
    },
    partyPending: party.pending,
    releaseParty(caller: object): void {
      if (partyCaller?.owner !== caller) return;
      const handle = partyHandle; partyCaller = null; partyHandle = null; handle?.dispose();
    },
    openRecovery: recoveries.open,
    fieldPresentationPending(): boolean { return !!active?.showing || fly !== null || party.pending() || recoveries.pending(); },
    cancel(): void {
      queued = null;
      const picker = fly; if (picker) { fly = null; picker.handle?.cancel(); }
      const intent = returning; if (intent) { returning = null; cancelRequest(intent, intent.request); }
      const menu = active; if (menu) retireMenu(menu, true);
    },
    update(): void {
      if (updating) return;
      updating = true;
      try {
        const picker = fly;
        if (picker) {
          if (!sameContext(picker.context)) picker.handle?.cancel();
          else picker.handle?.update(options.input());
          return;
        }
        const menu = active;
        if (menu) {
          // Once admitted, the real parent owns legitimate Surf movement/travel and its native guards.
          if (!sameContext(menu.context)) { retireMenu(menu, menu.showing); return; }
          if (menu.showing) menu.handle?.update(options.input());
          return;
        }
        const intent = returning;
        if (intent) {
          // UI coordinates hold an unsubmitted choice; they do not grant movement authority.
          // Once this intent publishes its request, the original Core/World/native
          // guards still decide admission and own any legitimate Surf displacement.
          const holdSelectionPosition = intent.stage !== 'executing' || intent.request === null;
          if (!sameAnchor(intent) || holdSelectionPosition && (own(intent.player, '_x') !== intent.x || own(intent.player, '_y') !== intent.y)) {
            if (returning === intent) { returning = null; cancelRequest(intent, intent.request); } return;
          }
          if (intent.stage === 'executing') return;
          const host = manager(), scene = currentScene(), next = own(host, '_nextScene');
          if (scene !== intent.expected) {
            if (next !== intent.expected && returning === intent) returning = null;
            return;
          }
          if (next || invoke(host, 'isSceneChanging') !== false) { if (returning === intent) returning = null; return; }
          if (invoke(scene, 'isStarted') !== true) return;
          if (intent.stage === 'menu') {
            if (!stackMatches(intent.stack, intent.entries)) { returning = null; return; }
            if (!onScene(scene, 'Scene_Menu') || !intent.entries.length) { returning = null; return; }
            const expectedConstructor = intent.entries.at(-1);
            invoke(host, 'pop');
            const target = hostRecord(own(host, '_nextScene')), entries = intent.entries.slice(0, -1);
            if (!target || constructorOf(target) !== expectedConstructor || !stackMatches(intent.stack, entries) || !sameAnchor(intent)) {
              if (returning === intent) returning = null; return;
            }
            if (returning === intent) returning = { ...intent, expected: target, entries, stage: 'map' };
            return;
          }
          // Genuine Scene_Map.start replaces the stack array with a new empty array.
          // The exact Scene captured after our native pop, rather than that public array, is the proof.
          const mapStack = own(host, '_stack');
          if (!Array.isArray(mapStack) || mapStack.length !== 0) { returning = null; return; }
          const context = ready(intent); if (!context) return;
          intent.stage = 'executing';
          void execute(context, intent.selection, 'party', intent.memberId, () => returning === intent,
            request => { intent.request = request; }).then(result => {
              if (result.status === 'failed' || result.status === 'refused') options.diagnose(result.reason);
            }, error => options.diagnose(why(error))).finally(() => { if (returning === intent) returning = null; });
          return;
        }
        const source = queued;
        if (source) {
          if (!sameAnchor(source)) { if (queued === source) queued = null; return; }
          if (ready(source)) { if (queued === source) queued = null; showMap(source); }
        }
      } catch (error) { options.diagnose(why(error)); }
      finally { try { recoveries.update(); } finally { updating = false; } }
    },
  };
}
