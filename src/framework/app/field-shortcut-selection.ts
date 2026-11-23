import { shortcutRecoverySnapshot, shortcutRecoveryReason } from './field-shortcut-recovery';
import type { FieldShortcutRecoverySnapshot, FieldShortcutRecoveryActionOutcome } from './field-shortcut-recovery';
/** Issued UI requests own once handling. The real World parent remains the only effect/admission owner. */
import { fieldShortcutSelection } from './field-shortcut-query';
import type { FieldShortcutQueries, FieldShortcutSelection } from './field-shortcut-query';
import { FIELD_MOVE_IDS } from '../rules/field-moves';
import type { FieldMoveAction } from './field-move-operation';
import type { FieldItemRunOutcome, FieldMoveRunOutcome } from './world-operation';
import type { WorldBattleAdmission, FieldShortcutContext, FieldShortcutAdmission } from './ports';
import { readWorldTravelRequest } from './world-travel-application';
import type { WorldTravelOutcome } from './world-travel-ports';
import type { FlyDestination } from '../rules/region-map';
import { semanticFingerprint } from '../rules/semantic';
export type FieldShortcutEntry = 'shortcut' | 'party';
/** A candidate from the region UI; the actual travel parent re-derives it at admission. */
export interface FieldShortcutExecutionOptions { readonly flySelection?: FlyDestination | null }
export interface FieldShortcutRequest { readonly kind: 'field-shortcut'; readonly token: string; readonly generation: number }
export type FieldShortcutPreparation = { readonly status: 'prepared'; readonly request: FieldShortcutRequest } | { readonly status: 'refused'; readonly reason: string };
type Result = FieldItemRunOutcome | FieldMoveRunOutcome | WorldTravelOutcome;
export type FieldShortcutExecutionOutcome = { readonly status: 'completed' | 'accepted'; readonly result: Result; readonly admission?: WorldBattleAdmission }
  | { readonly status: 'cancelled'; readonly result?: Result }
  | { readonly status: 'refused' | 'failed'; readonly reason: string; readonly result?: Result };
export interface ShortcutItemControl { assertCurrent(): void; enterAdmission(): void; issued(token: string): void }
interface Options {
  generation(): number; context(): FieldShortcutContext; query(): FieldShortcutQueries;
  move(request: FieldShortcutRequest, action: Extract<FieldMoveAction, { kind: 'use' }>): Promise<FieldMoveRunOutcome>;
  item(request: FieldShortcutRequest, itemId: string, control: ShortcutItemControl): Promise<FieldItemRunOutcome>;
  travel?(request: FieldShortcutRequest, kind: 'fly' | 'dig' | 'teleport', memberId: string, selection: FlyDestination | null): Promise<WorldTravelOutcome>;
  cancelTravel?(request: FieldShortcutRequest): void;
  recovery(request: FieldShortcutRequest): FieldShortcutRecoverySnapshot;
  recover(request: FieldShortcutRequest, action: 'retry' | 'cancel', onRetired?: (current: () => boolean) => void): Promise<WorldTravelOutcome | FieldItemRunOutcome>;
  cancelMove(request: FieldShortcutRequest): void; cancelItem(token: string): void;
  admitted(admission: WorldBattleAdmission): boolean;
  abort(admission: WorldBattleAdmission): void;
}
interface Owner {
  readonly request: FieldShortcutRequest; readonly entry: FieldShortcutEntry; readonly selection: FieldShortcutSelection; readonly memberId?: string;
  source: FieldShortcutContext | null; cancelled: boolean; done: boolean;
  stage: 'ready' | 'query' | 'inventory' | 'admitting-move' | 'admitting-item' | 'admitting-travel' | 'running';
  recovery?: { readonly action: 'retry' | 'cancel'; readonly promise: Promise<FieldShortcutRecoveryActionOutcome> };
  itemToken?: string; moveStarted: boolean; travelStarted?: boolean; flySelection?: FlyDestination | null; promise?: Promise<FieldShortcutExecutionOutcome>;
}
const why = (error: unknown): string => error instanceof Error ? error.message : String(error);
function sameContext(a: FieldShortcutContext, b: FieldShortcutContext): boolean {
  return a.generation === b.generation && a.map === b.map && a.mapId === b.mapId && a.player === b.player && a.x === b.x && a.y === b.y;
}
export class FieldShortcutSelections {
  private readonly options: Options;
  private sequence = 0;
  private readonly requests = new WeakMap<object, Owner>();
  constructor(options: Options) { this.options = options; }
  prepare(entry: FieldShortcutEntry, value: unknown, memberId?: string): FieldShortcutPreparation {
    try {
      if (!['shortcut', 'party'].includes(entry)) throw Error('invalid-shortcut-entry');
      const source = Object.freeze(this.options.context()), selection = fieldShortcutSelection(value);
      if (!selection || entry === 'party' && (typeof memberId !== 'string' || selection.kind !== 'move' || selection.memberId !== memberId)) throw Error('invalid-shortcut-selection');
      if (!sameContext(source, this.options.context())) throw Error('shortcut-source-changed');
      if (!Number.isSafeInteger(this.sequence + 1)) throw Error('shortcut-request-sequence-exhausted');
      const request: FieldShortcutRequest = Object.freeze({ kind: 'field-shortcut', generation: source.generation, token: `field-shortcut:${source.generation}:${++this.sequence}` });
      this.requests.set(request, { request, entry, selection: Object.freeze(selection), ...(memberId !== undefined ? { memberId } : {}), source, cancelled: false, done: false, stage: 'ready', moveStarted: false });
      return { status: 'prepared', request };
    } catch (error) { return { status: 'refused', reason: why(error) }; }
  }
  /** The World obtains this exact private selection only for its registered request, never from token fields. */
  selection(candidate: object, admitting: boolean): FieldShortcutSelection | null {
    const owner = this.requests.get(candidate);
    if (!owner || owner.done || owner.cancelled || owner.request.generation !== this.options.generation() || !owner.promise) return null;
    if (admitting && owner.stage !== 'admitting-move' && owner.stage !== 'admitting-item' && owner.stage !== 'admitting-travel') return null;
    return owner.selection;
  }
  admission(candidate: object): FieldShortcutAdmission | null {
    const owner = this.requests.get(candidate), selection = this.selection(candidate, true);
    return owner?.source && selection ? Object.freeze({ selection, source: owner.source }) : null;
  }
  /** Internal association only. Never returns a token or World authority to a UI caller. */
  recoveryAssociation(candidate: object): { readonly kind: 'move' } | { readonly kind: 'item'; readonly itemToken: string } | null {
    const o = this.requests.get(candidate);
    if (!o || !o.promise || o.request.generation !== this.options.generation()) return null;
    if (o.travelStarted && o.selection.kind === 'move' && ['fly', 'dig', 'teleport'].includes(o.selection.moveId)) return { kind: 'move' };
    return o.itemToken ? { kind: 'item', itemToken: o.itemToken } : null;
  }
  recovery(candidate: unknown): FieldShortcutRecoverySnapshot {
    const o = candidate !== null && typeof candidate === 'object' ? this.requests.get(candidate) : undefined;
    if (!o || !o.promise || o.request.generation !== this.options.generation()) return shortcutRecoverySnapshot('unavailable', 'unavailable', 'unavailable', 'request-unavailable', false, false, 'request-unavailable');
    const result = this.options.recovery(o.request);
    return !o.done && result.status === 'unavailable' ? shortcutRecoverySnapshot('pending', 'unavailable', 'unavailable', 'executing', false, false, 'executing') : result;
  }
  recover(candidate: unknown, action: 'retry' | 'cancel'): Promise<FieldShortcutRecoveryActionOutcome> {
    const o = candidate !== null && typeof candidate === 'object' ? this.requests.get(candidate) : undefined;
    const refused = (snapshot: FieldShortcutRecoverySnapshot, reasonCode = snapshot.reasonCode): Promise<FieldShortcutRecoveryActionOutcome> => Promise.resolve({ status: 'refused', snapshot, reasonCode });
    if (!o || !o.promise || o.request.generation !== this.options.generation()) return refused(this.recovery(candidate));
    if (o.recovery) return o.recovery.action === action ? o.recovery.promise : refused(this.recovery(candidate), 'operation-active');
    // Publish the one action before any native/content/state provider can reenter.
    const promise = Promise.resolve().then(async (): Promise<FieldShortcutRecoveryActionOutcome> => {
      try {
        const before = this.recovery(o.request), button = action === 'retry' ? before.retry : before.cancel;
        if (!button.enabled) return { status: 'refused', snapshot: before, reasonCode: button.disabledReason };
        let retired: (() => boolean) | undefined;
        const result = await this.options.recover(o.request, action, current => { retired = current; });
        let snapshot = this.recovery(o.request);
        // A consumed cleanup can make the old request unavailable behind a lawful terminal
        // successor. Only this invocation's authenticated post-await check can report success.
        if (o.recovery?.promise === promise && o.request.generation === this.options.generation()
          && action === 'retry' && result.status === 'completed' && snapshot.status === 'unavailable' && retired?.()) {
          if (o.recovery?.promise === promise && o.request.generation === this.options.generation()) snapshot = shortcutRecoverySnapshot('completed', 'after-arrival', 'arrived');
        }
        if (o.request.generation !== this.options.generation() || snapshot.status === 'unavailable') return { status: 'refused', snapshot, reasonCode: 'request-unavailable' };
        return { status: snapshot.status === 'completed' ? 'completed' : snapshot.status === 'cancelled' ? 'cancelled'
          : result.status === 'failed' || result.status === 'refused' ? 'failed' : 'accepted', snapshot, reasonCode: shortcutRecoveryReason('reason' in result ? result.reason : undefined, snapshot.reasonCode) };
      } catch { return { status: 'failed', snapshot: this.recovery(o.request), reasonCode: 'travel-failed' }; }
      finally { if (o.recovery?.promise === promise) delete o.recovery; }
    });
    o.recovery = { action, promise }; return promise;
  }
  private current(owner: Owner, location: boolean): void {
    if (owner.cancelled) throw Error('shortcut-cancelled');
    if (owner.request.generation !== this.options.generation()) throw Error('stale-field-shortcut');
    if (location && (!owner.source || !sameContext(owner.source, this.options.context()))) throw Error('shortcut-source-changed');
  }
  execute(candidate: unknown, options: FieldShortcutExecutionOptions = {}): Promise<FieldShortcutExecutionOutcome> {
    const owner = candidate !== null && typeof candidate === 'object' ? this.requests.get(candidate) : undefined;
    if (!owner) return Promise.resolve({ status: 'refused', reason: 'stale-field-shortcut' });
    if (owner.promise) return owner.promise;
    try {
      semanticFingerprint(options);
      if (!options || typeof options !== 'object' || Array.isArray(options) || Reflect.ownKeys(options).some(key => key !== 'flySelection')) throw Error('invalid-shortcut-execution-options');
      const choice = Object.getOwnPropertyDescriptor(options, 'flySelection');
      if (choice) {
        if (!('value' in choice) || owner.selection.kind !== 'move' || owner.selection.moveId !== 'fly') throw Error('invalid-shortcut-execution-options');
        const parsed = readWorldTravelRequest({ kind: 'fly', selection: choice.value });
        if (parsed.kind !== 'fly') throw Error('invalid-shortcut-execution-options');
        owner.flySelection = parsed.selection ?? null;
      }
    } catch (error) { return Promise.resolve({ status: 'refused', reason: why(error) }); }
    // Reserve before query, Content, identity parsing or any actual effect provider can reenter.
    owner.promise = Promise.resolve().then(() => this.run(owner));
    return owner.promise;
  }
  private cancelChild(owner: Owner): void {
    if (owner.request.generation !== this.options.generation()) return;
    if (owner.moveStarted) this.options.cancelMove(owner.request);
    if (owner.travelStarted) this.options.cancelTravel?.(owner.request);
    if (owner.itemToken) this.options.cancelItem(owner.itemToken);
  }
  cancel(candidate: unknown): { status: 'cancelled' | 'duplicate' | 'refused'; reason?: string } {
    const owner = candidate !== null && typeof candidate === 'object' ? this.requests.get(candidate) : undefined;
    if (!owner || owner.request.generation !== this.options.generation()) return { status: 'refused', reason: 'stale-field-shortcut' };
    if (owner.done || owner.cancelled) return { status: 'duplicate' };
    owner.cancelled = true; this.cancelChild(owner); return { status: 'cancelled' };
  }
  private async run(owner: Owner): Promise<FieldShortcutExecutionOutcome> {
    let result: Result | undefined;
    try {
      this.current(owner, true); owner.stage = 'query';
      const query = this.options.query(); this.current(owner, true);
      const resolved = query.resolve(owner.selection, owner.entry === 'party' ? owner.memberId : undefined);
      this.current(owner, true);
      if (resolved.status !== 'available') return resolved;
      const selection = owner.selection;
      if (selection.kind === 'move') {
        if (selection.moveId === 'fly' || selection.moveId === 'dig' || selection.moveId === 'teleport') {
          if (!this.options.travel) return { status: 'refused', reason: 'travel-parent-not-ready' };
          owner.stage = 'admitting-travel'; owner.travelStarted = true;
          const pending = this.options.travel(owner.request, selection.moveId, selection.memberId, owner.flySelection ?? null);
          owner.stage = 'running'; owner.source = null;
          if (owner.cancelled) this.cancelChild(owner);
          result = await pending;
        } else {
        const moveId = FIELD_MOVE_IDS.find(id => id === selection.moveId);
        if (!moveId) return { status: 'refused', reason: 'travel-parent-not-ready' };
        owner.stage = 'admitting-move'; owner.moveStarted = true;
        const pending = this.options.move(owner.request, { kind: 'use', moveId, entry: owner.entry, memberId: selection.memberId });
        owner.stage = 'running'; owner.source = null;
        if (owner.cancelled) this.cancelChild(owner);
        result = await pending;
        }
      } else {
        owner.stage = 'inventory';
        const pending = this.options.item(owner.request, selection.itemId, {
          assertCurrent: () => this.current(owner, true),
          enterAdmission: () => { this.current(owner, true); if (owner.stage !== 'inventory') throw Error('shortcut-admission-phase'); owner.stage = 'admitting-item'; },
          issued: token => { owner.itemToken = token; owner.stage = 'running'; owner.source = null; if (owner.cancelled) this.cancelChild(owner); },
        });
        owner.stage = 'running'; owner.source = null;
        if (owner.cancelled) this.cancelChild(owner);
        result = await pending;
      }
      const admission = 'admission' in result ? result.admission : undefined;
      if (owner.cancelled || owner.request.generation !== this.options.generation()) {
        if (admission && owner.request.generation === this.options.generation()) this.options.abort(admission);
        return owner.cancelled ? { status: 'cancelled', result } : { status: 'refused', reason: 'stale-field-shortcut', result };
      }
      if (admission && !this.options.admitted(admission)) return { status: 'failed', reason: 'stale-world-battle-admission', result };
      if (result.status === 'battle-admitted' || result.status === 'completed' && admission) return { status: 'accepted', result, ...(admission ? { admission } : {}) };
      if (result.status === 'awaiting-arrival' || result.status === 'tail-pending' || result.status === 'travel-admitted') return { status: 'accepted', result };
      if (result.status === 'completed' || result.status === 'duplicate') return { status: 'completed', result };
      if (result.status === 'cancelled') return { status: 'cancelled', result };
      return { status: result.status === 'refused' ? 'refused' : 'failed', reason: 'reason' in result && result.reason ? result.reason : 'field-shortcut-failed', result };
    } catch (error) { return owner.cancelled ? { status: 'cancelled', ...(result ? { result } : {}) } : { status: 'failed', reason: why(error), ...(result ? { result } : {}) }; }
    finally { owner.done = true; owner.source = null; }
  }
}
