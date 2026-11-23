/** Caller-owned recovery presentation. Only the actual App's exact-request facade can act. */
import type { FieldShortcutRecoveryActionOutcome, FieldShortcutRecoveryFacade, FieldShortcutRecoverySnapshot,
  FieldShortcutRecoveryReason } from '../../framework/app/field-shortcut-recovery';
import type { InputFrame } from '../management/model';
import { InputLatch } from '../management/model';

export interface RecoveryApplication { readonly stateGeneration: number; readonly encounterBlocked: boolean; readonly saveBlocked: boolean }
export type RecoveryChoice = 'retry' | 'cancel' | 'hide';
export interface RecoveryViewModel { readonly snapshot: FieldShortcutRecoverySnapshot; readonly choices: readonly RecoveryChoice[]; readonly row: number; readonly actionReason?: FieldShortcutRecoveryReason }
export interface RecoveryView { show(model: RecoveryViewModel): void; dispose(): void }
export interface RecoveryUIOptions {
  currentApplication(): RecoveryApplication | null;
  /** Current started native Map, idle interpreter/message, no other presenter. No old Scene is re-signed. */
  presentation(application: RecoveryApplication): object | null;
  input(): InputFrame;
  view(scene: object): RecoveryView;
  diagnose(reason: string): void;
}
type Method = (this: unknown, ...args: unknown[]) => unknown;
const method = (value: unknown): value is Method => typeof value === 'function';
function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function own(value: unknown, key: string): unknown { const row = record(value), d = row && Object.getOwnPropertyDescriptor(row, key); return d && 'value' in d ? d.value : undefined; }
/** Real class methods live on the prototype. Accessors are rejected without evaluation. */
function dataMethod(value: unknown, key: string): Method | null {
  let cursor: object | null = record(value); const seen = new Set<object>();
  for (let depth = 0; cursor && depth < 24 && !seen.has(cursor); depth++) {
    seen.add(cursor); const d = Object.getOwnPropertyDescriptor(cursor, key);
    if (d) return 'value' in d && method(d.value) ? d.value : null;
    const next: unknown = Object.getPrototypeOf(cursor); cursor = record(next);
  }
  return null;
}
const reasons: readonly Exclude<FieldShortcutRecoveryReason, null>[] = ['request-unavailable', 'executing', 'operation-active', 'load-failed',
  'travel-failed', 'tail-failed', 'source-changed', 'arrival-unconfirmed', 'not-retryable', 'not-cancellable'];
function reason(value: unknown): value is FieldShortcutRecoveryReason { return value === null || reasons.some(row => row === value); }
function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T { return values.some(row => row === value); }
function button(value: unknown) {
  const enabled = own(value, 'enabled'), disabledReason = own(value, 'disabledReason');
  if (typeof enabled !== 'boolean' || !reason(disabledReason)) throw Error('recovery-button-invalid');
  return Object.freeze({ enabled, disabledReason });
}
function snapshot(value: unknown): FieldShortcutRecoverySnapshot {
  const status = own(value, 'status'), phase = own(value, 'phase'), physical = own(value, 'physical'), reasonCode = own(value, 'reasonCode');
  if (!oneOf(status, ['unavailable', 'pending', 'failed', 'completed', 'cancelled'] as const)
    || !oneOf(phase, ['preparing', 'ready', 'awaiting-arrival', 'after-arrival', 'unavailable'] as const)
    || !oneOf(physical, ['not-started', 'reserved', 'arrived', 'unavailable'] as const) || !reason(reasonCode)) throw Error('recovery-snapshot-invalid');
  return Object.freeze({ status, phase, physical, reasonCode, retry: button(own(value, 'retry')), cancel: button(own(value, 'cancel')) });
}
function outcome(value: unknown): FieldShortcutRecoveryActionOutcome {
  const status = own(value, 'status'), reasonCode = own(value, 'reasonCode');
  if (!oneOf(status, ['accepted', 'completed', 'cancelled', 'refused', 'failed'] as const) || !reason(reasonCode)) throw Error('recovery-outcome-invalid');
  return Object.freeze({ status, reasonCode, snapshot: snapshot(own(value, 'snapshot')) });
}
function dataPromise(value: unknown): Promise<unknown> {
  const then = dataMethod(value, 'then');
  if (!then) return Promise.reject(Error('recovery-promise-required'));
  return new Promise((resolve, reject) => { try { Reflect.apply(then, value, [resolve, reject]); } catch (error) { reject(error); } });
}
/** No stub or fallback capability: absent actual facade methods produce no execution port. */
export function readRecoveryFacade(application: RecoveryApplication): FieldShortcutRecoveryFacade | null {
  const query = dataMethod(application, 'fieldShortcutRecovery'), retry = dataMethod(application, 'retryFieldShortcutRecovery'), cancel = dataMethod(application, 'cancelFieldShortcutRecovery');
  if (!query || !retry || !cancel) return null;
  return {
    fieldShortcutRecovery(request) { return snapshot(Reflect.apply(query, application, [request])); },
    async retryFieldShortcutRecovery(request) { return outcome(await dataPromise(Reflect.apply(retry, application, [request]))); },
    async cancelFieldShortcutRecovery(request) { return outcome(await dataPromise(Reflect.apply(cancel, application, [request]))); },
  };
}
export function recoveryChoices(value: FieldShortcutRecoverySnapshot): readonly RecoveryChoice[] {
  const cancellablePhase = value.phase === 'preparing' || value.phase === 'ready';
  return value.status === 'failed' && cancellablePhase && value.physical === 'not-started' && value.cancel.enabled ? ['retry', 'cancel', 'hide'] : ['retry', 'hide'];
}
interface Entry {
  readonly owner: object; readonly application: RecoveryApplication; readonly generation: number; readonly request: object;
  initialSettled: boolean; initialFailed: boolean; actionReason: FieldShortcutRecoveryReason; retired: boolean; value: FieldShortcutRecoverySnapshot | null;
  wantOpen: boolean; observedStatus: string | null; diagnostic: string | null; epoch: number;
  attemptedScenes: WeakSet<object>; action: { readonly kind: 'retry' | 'cancel'; readonly promise: Promise<boolean> } | null;
}
interface Shown { readonly entry: Entry; readonly scene: object; readonly view: RecoveryView; readonly epoch: number; readonly latch: InputLatch; row: number }
const why = (error: unknown): string => error instanceof Error ? error.message : String(error);
export function createFieldTravelRecoveryUI(options: RecoveryUIOptions) {
  const handles = new WeakMap<object, Entry>(); let candidate: Entry | null = null, retained: Entry | null = null, shown: Shown | null = null, updating = false, intentSerial = 0;
  const current = (entry: Entry): boolean => !entry.retired && options.currentApplication() === entry.application && entry.application.stateGeneration === entry.generation;
  const belongs = (entry: Entry): boolean => candidate === entry || retained === entry;
  function diagnose(entry: Entry, message: string): void { if (entry.diagnostic !== message) { entry.diagnostic = message; options.diagnose(message); } }
  function detach(entry: Entry): void {
    const visible = shown; if (!visible || visible.entry !== entry) return;
    shown = null; // Clear only our slot before disposal can reenter and present another owner.
    try { visible.view.dispose(); } catch (error) { diagnose(entry, why(error)); }
  }
  function retire(entry: Entry): void {
    entry.retired = true; entry.epoch++; if (candidate === entry) candidate = null; if (retained === entry) retained = null; detach(entry);
  }
  function inspect(entry: Entry): FieldShortcutRecoverySnapshot | null {
    if (!current(entry) || !belongs(entry)) { retire(entry); return null; }
    try {
      const facade = readRecoveryFacade(entry.application);
      if (!facade) { entry.value = null; diagnose(entry, 'field-recovery-interface-unavailable'); return null; }
      const value = facade.fieldShortcutRecovery(entry.request);
      if (!current(entry) || !belongs(entry)) { retire(entry); return null; }
      entry.value = value;
      if (value.reasonCode) diagnose(entry, 'field-recovery:' + value.reasonCode);
      return value;
    } catch (error) { entry.value = null; diagnose(entry, why(error)); return null; }
  }
  function notice(entry: Entry): boolean {
    const value = entry.value;
    return entry.initialSettled && !!value && (value.status === 'failed' || value.status === 'unavailable' && entry.initialFailed
      && !entry.application.encounterBlocked && !entry.application.saveBlocked);
  }
  function selectEntry(): Entry | null { return candidate?.initialSettled && (candidate.value === null || notice(candidate)) ? candidate : retained; }
  function hide(entry: Entry): void { entry.wantOpen = false; entry.epoch++; detach(entry); if (candidate === entry && entry.value?.status === 'unavailable') retire(entry); }
  function perform(entry: Entry, kind: 'retry' | 'cancel', epoch: number): Promise<boolean> {
    if (entry.action) return entry.action.kind === kind ? entry.action.promise : Promise.resolve(false);
    if (!current(entry) || !belongs(entry) || entry.epoch !== epoch || candidate && candidate !== entry) return Promise.resolve(false);
    let resolve!: (result: boolean) => void; const pending = new Promise<boolean>(done => { resolve = done; });
    const action = { kind, promise: pending }; entry.action = action; entry.epoch++;
    const actionEpoch = entry.epoch, serial = intentSerial;
    const ownAction = (): boolean => current(entry) && belongs(entry) && intentSerial === serial && entry.epoch === actionEpoch
      && entry.action === action && (!candidate || candidate === entry);
    const refused = (): false => { if (ownAction()) { entry.wantOpen = notice(entry); entry.attemptedScenes = new WeakSet(); } return false; };
    void (async (): Promise<boolean> => {
      try {
        entry.wantOpen = false; detach(entry); // Publish first, then release presentation pending before providers.
        if (!ownAction()) return false;
        const value = inspect(entry);
        if (!value || value.status !== 'failed' || !ownAction() || !(kind === 'retry' ? value.retry.enabled : recoveryChoices(value).includes('cancel'))) return refused();
        const facade = readRecoveryFacade(entry.application); if (!facade || !ownAction()) return refused();
        const result = await (kind === 'retry' ? facade.retryFieldShortcutRecovery(entry.request) : facade.cancelFieldShortcutRecovery(entry.request));
        if (!ownAction()) return false;
        entry.actionReason = result.reasonCode;
        if (result.reasonCode) diagnose(entry, 'field-recovery:' + result.reasonCode);
        // A fresh query is authoritative; the action's earlier snapshot never grants a new action.
        const next = inspect(entry); if (!ownAction()) return false;
        entry.observedStatus = next?.status ?? null;
        if (next?.status === 'completed' || next?.status === 'cancelled') retire(entry);
        else { entry.wantOpen = next?.status === 'failed' || next?.status === 'unavailable' && entry.initialFailed; entry.attemptedScenes = new WeakSet(); }
        return result.status !== 'refused' && result.status !== 'failed';
      } catch (error) {
        if (ownAction()) { diagnose(entry, why(error)); inspect(entry); entry.wantOpen = notice(entry); entry.attemptedScenes = new WeakSet(); }
        return false;
      } finally { if (entry.action === action) entry.action = null; }
    })().then(resolve, () => resolve(false));
    return pending;
  }
  return {
    /** The production caller invokes this only with the exact request just issued by the real App. */
    capture(application: RecoveryApplication, request: object): object | null {
      const serial = ++intentSerial;
      try {
        if (options.currentApplication() !== application) return null;
        const owner = {}, entry: Entry = { owner, application, generation: application.stateGeneration, request, initialSettled: false,
          initialFailed: false, actionReason: null, retired: false, value: null, wantOpen: false, observedStatus: null, diagnostic: null, epoch: 0,
          attemptedScenes: new WeakSet(), action: null };
        if (!current(entry) || intentSerial !== serial) return null;
        const previous = candidate, prior = retained; candidate = entry; handles.set(owner, entry);
        if (previous) retire(previous);
        if (prior) { prior.wantOpen = false; prior.epoch++; detach(prior); }
        if (!current(entry) || candidate !== entry || intentSerial !== serial) { retire(entry); return null; }
        return owner;
      } catch (error) { options.diagnose(why(error)); return null; }
    },
    settle(handle: object | null, status: string, battleAdmission = false): void {
      const entry = handle && handles.get(handle); if (!entry) return;
      // Preserve a settled initial handshake even when a transient source observer throws.
      entry.initialSettled = true; entry.initialFailed = status === 'failed' || status === 'refused';
      if (!current(entry) || !belongs(entry)) { retire(entry); return; }
      if (battleAdmission) { retire(entry); return; }
      const value = inspect(entry);
      if (value?.status === 'completed' || value?.status === 'cancelled') { retire(entry); return; }
      if (value && value.status !== 'unavailable') {
        const previous = retained; retained = entry; if (candidate === entry) candidate = null; if (previous && previous !== entry) retire(previous);
        entry.wantOpen = notice(entry);
      } else if (value && entry.initialFailed) {
        if (!retained) { retained = entry; if (candidate === entry) candidate = null; }
        entry.wantOpen = notice(entry);
      } else if (!value) { if (!retained) { retained = entry; if (candidate === entry) candidate = null; } }
      else { retire(entry); }
    },
    discard(handle: object | null): void { const entry = handle && handles.get(handle); if (entry) retire(entry); },
    hasNotice(request: object | null): boolean {
      const entry = selectEntry(); return !!request && !!entry && current(entry) && entry.request === request && notice(entry);
    },
    open(): boolean {
      const entry = selectEntry(); if (!entry || !current(entry) || !entry.initialSettled) return false;
      const value = inspect(entry); if (!value || value.status === 'pending' || value.status === 'completed' || value.status === 'cancelled') return false;
      entry.wantOpen = true; entry.attemptedScenes = new WeakSet(); return true;
    },
    pending: (): boolean => shown !== null,
    update(): void {
      if (updating) return; updating = true;
      try {
        for (const entry of [candidate, retained]) if (entry && !current(entry)) retire(entry);
        const entry = selectEntry(); if (!entry || !entry.initialSettled) return;
        if (candidate && candidate !== entry && !candidate.initialSettled) { detach(entry); return; }
        const value = inspect(entry);
        if (!value) { detach(entry); return; }
        if (candidate === entry && value.status !== 'unavailable') {
          const previous = retained; retained = entry; candidate = null; if (previous && previous !== entry) retire(previous);
        }
        if (value.status === 'completed' || value.status === 'cancelled') { retire(entry); return; }
        if (value.status === 'unavailable' && !entry.initialFailed) { retire(entry); return; }
        if (value.status === 'failed' && entry.observedStatus !== 'failed') entry.wantOpen = true;
        entry.observedStatus = value.status;
        if (value.status === 'pending' || entry.action) { detach(entry); return; }
        const scene = options.presentation(entry.application);
        if (!scene) { detach(entry); return; }
        if (shown && (shown.entry !== entry || shown.scene !== scene)) detach(shown.entry);
        if (!shown && entry.wantOpen && !entry.attemptedScenes.has(scene)) {
          entry.attemptedScenes.add(scene); const epoch = ++entry.epoch, latch = new InputLatch(); latch.arm(options.input().pressed);
          const view = options.view(scene);
          if (!current(entry) || !belongs(entry) || selectEntry() !== entry || candidate && candidate !== entry || entry.epoch !== epoch) { view.dispose(); return; }
          shown = { entry, scene, view, epoch, latch, row: 0 };
        }
        const visible = shown; if (!visible || visible.entry !== entry || visible.scene !== scene || visible.epoch !== entry.epoch) return;
        const choices = recoveryChoices(value); visible.row = Math.min(visible.row, choices.length - 1);
        visible.view.show({ snapshot: value, choices, row: visible.row, actionReason: entry.actionReason });
        if (shown !== visible) return;
        if (!current(entry) || selectEntry() !== entry || entry.epoch !== visible.epoch) { detach(entry); return; }
        const input = visible.latch.filter(options.input());
        if (input.triggered.back) { hide(entry); return; }
        if (input.repeated.up) visible.row = Math.max(0, visible.row - 1);
        else if (input.repeated.down) visible.row = Math.min(choices.length - 1, visible.row + 1);
        else if (input.triggered.use) {
          const selected = choices[visible.row];
          if (selected === 'hide') hide(entry);
          else if (selected === 'retry' && value.retry.enabled || selected === 'cancel') void perform(entry, selected, visible.epoch);
        }
      } catch (error) {
        const visible = shown; if (visible) detach(visible.entry); options.diagnose(why(error));
      } finally { updating = false; }
    },
  };
}
