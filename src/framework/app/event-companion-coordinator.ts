/** Actual App-owned opaque intent book, preparation and bounded projection repair. */
import { semanticFingerprint } from '../rules/semantic';
import { clone } from '../rules/value';
import { isEventCompanion } from '../rules/event-companions';
import type { GameState } from '../rules/state';
import type { Content } from '../rules/types';
import type { AtomicFieldQueryState, WorldHostLifecycle, WorldCompanionPreparedOriginLifecycle } from './ports';
import type { CompanionAction, CompanionResult } from './event-companion-operation';
import type { CompanionApplicationLease, CompanionRepairResult } from './event-companion-ports';
import type { EventCompanionIntent, EventCompanionPreparationIntent, EventCompanionIntentReceipt, EventCompanionPrepared, EventCompanionProductionChannel } from './event-companion-public-ports';
import { EventCompanionApplication } from './event-companion-application';
const perform = EventCompanionApplication.prototype.perform, cancel = EventCompanionApplication.prototype.cancel;
const recover = EventCompanionApplication.prototype.recoverPending;
const repairReader = Object.getOwnPropertyDescriptor(EventCompanionApplication.prototype, 'projectionRepair')!.get!;
interface Ordinary {
  kind: EventCompanionPreparationIntent['kind'] | null; prepared: EventCompanionPrepared | null;
  origin: WorldCompanionPreparedOriginLifecycle | null; actionIdentity: string | null;
}
export interface CompanionAppAdmission {
  readonly generation: number; lease: CompanionApplicationLease | null; source: WorldHostLifecycle | null;
  readonly ordinary?: Ordinary;
}
type Actual = AtomicFieldQueryState & { readonly generation: number };
interface Entry {
  readonly handle: object; readonly admission: CompanionAppAdmission; readonly id: string;
  readonly promise: Promise<CompanionResult>; readonly resolve: (outcome: CompanionResult) => void;
  phase: 'preparing' | 'running' | 'settling' | 'completed' | 'failed' | 'cancelled'; cancelled: boolean;
  service: EventCompanionApplication | null; channel: EventCompanionProductionChannel | null; originHandle: WorldCompanionPreparedOriginLifecycle | null;
  cleanupDone: boolean; before: Actual | null; gameIdentity: string; contentIdentity: string; movement: boolean; instant: boolean; result: CompanionResult | null;
}
interface Options {
  readonly application: object;
  available(): boolean;
  generation(): number;
  claim(admission: CompanionAppAdmission): boolean;
  connect(): { readonly service: EventCompanionApplication; readonly channel: EventCompanionProductionChannel };
  observe(): Actual;
  writing(admission: CompanionAppAdmission, active: boolean): void;
  release(admission: CompanionAppAdmission): void;
}
const failed = (reason: string): CompanionResult => ({ status: 'failed', reason });
const cancelled = (): CompanionResult => ({ status: 'cancelled', diagnostics: [] });
const why = (error: unknown): string => error instanceof Error ? error.message : String(error);
const keys = (value: object, allowed: readonly string[]): void => {
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key))) throw Error('invalid-companion-intent-field');
};
export function readCompanionIntent(raw: unknown): EventCompanionIntent {
  semanticFingerprint(raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('invalid-companion-intent');
  const r = raw as Record<string, unknown>;
  if (r.kind === 'recover') { keys(r, ['kind']); return { kind: 'recover' }; }
  if (r.kind === 'register') {
    keys(r, ['kind', 'eventId', 'name', 'commonEventId']);
    if (typeof r.eventId !== 'number' || !Number.isSafeInteger(r.eventId) || r.eventId < 1 || r.name !== undefined && typeof r.name !== 'string'
      || r.commonEventId !== undefined && (typeof r.commonEventId !== 'number' || !Number.isSafeInteger(r.commonEventId) || r.commonEventId < 1)) throw Error('invalid-companion-registration');
    return { kind: 'register', eventId: r.eventId, ...(r.name === undefined ? {} : { name: r.name }), ...(r.commonEventId === undefined ? {} : { commonEventId: r.commonEventId }) };
  }
  if (r.kind !== 'remove' || !r.removal || typeof r.removal !== 'object' || Array.isArray(r.removal)) throw Error('invalid-companion-removal');
  keys(r, ['kind', 'removal']); const removal = r.removal as Record<string, unknown>;
  if (removal.kind === 'all') { keys(removal, ['kind']); return { kind: 'remove', removal: { kind: 'all' } }; }
  if (removal.kind === 'name' && typeof removal.name === 'string') { keys(removal, ['kind', 'name']); return { kind: 'remove', removal: { kind: 'name', name: removal.name } }; }
  if (removal.kind === 'origin' && typeof removal.originMapId === 'number' && Number.isSafeInteger(removal.originMapId) && removal.originMapId > 0
    && typeof removal.originEventId === 'number' && Number.isSafeInteger(removal.originEventId) && removal.originEventId > 0) {
    keys(removal, ['kind', 'originMapId', 'originEventId']); return { kind: 'remove', removal: { kind: 'origin', originMapId: removal.originMapId, originEventId: removal.originEventId } };
  }
  throw Error('invalid-companion-removal');
}
export function sameCompanionFrame(a: WorldHostLifecycle, b: WorldHostLifecycle): boolean {
  const x = a.sceneTransition, y = b.sceneTransition, p = a.travelLease, q = b.travelLease;
  return a.map === b.map && a.mapId === b.mapId && a.player === b.player && a.scene === b.scene && a.mapData === b.mapData
    && a.playerPosition?.x === b.playerPosition?.x && a.playerPosition?.y === b.playerPosition?.y && a.travelPlayer?.direction === b.travelPlayer?.direction
    && a.travelPlayer?.transferring === false && b.travelPlayer?.transferring === false
    && x?.manager === y?.manager && x?.prototype === y?.prototype && x?.started === true && y?.started === true && x.nextScene === null && y.nextScene === null
    && !!p?.nativeEpoch && p.registry === q?.registry && p.nativeEpoch === q.nativeEpoch && p.current === q.current
    && p.mapBirth?.birth === q.mapBirth?.birth && p.mapBirth?.queue === q.mapBirth?.queue;
}
export function sameCompanionOrigin(a: WorldCompanionPreparedOriginLifecycle | null | undefined, b: WorldCompanionPreparedOriginLifecycle | null | undefined): boolean {
  return !!a && !!b && a.source === b.source && a.origin === b.origin && a.prepared === b.prepared && a.epoch === b.epoch
    && a.application === b.application && a.generation === b.generation && a.actionIdentity === b.actionIdentity
    && a.manager === b.manager && a.scene === b.scene && a.birth === b.birth && a.queue === b.queue
    && a.map === b.map && a.mapId === b.mapId && a.player === b.player && a.data === b.data;
}
export class EventCompanionCoordinator {
  readonly #options: Options; readonly #issued = new WeakMap<object, Entry>();
  #entry: Entry | null = null; #sequence = 0;
  #repairing: Promise<CompanionRepairResult> | null = null;
  readonly #repairAttempts = new Set<string>();
  constructor(options: Options) { this.#options = options; }
  /** Known CJS class book only; no provider/native/source query may enter the App pure finisher. */
  isCurrent(admission: CompanionAppAdmission, generation: number): boolean {
    const e = this.#entry;
    return !!e && this.#issued.get(e.handle) === e && e.admission === admission && admission.generation === generation && !e.cancelled
      && (e.phase === 'preparing' || e.phase === 'running' || e.phase === 'settling');
  }
  private current(e: Entry): void { if (!this.isCurrent(e.admission, this.#options.generation())) throw Error('companion-intent-stale'); }
  private check(e: Entry, actual: Actual): void {
    const before = e.before; this.current(e);
    if (!before || actual.generation !== before.generation || actual.game !== before.game || actual.content !== before.content
      || semanticFingerprint(actual.game) !== e.gameIdentity || semanticFingerprint(actual.content) !== e.contentIdentity
      || !sameCompanionFrame(actual.lifecycle, before.lifecycle)) throw Error('companion-preparation-source-changed');
  }
  private validate(intent: EventCompanionPreparationIntent, prepared: EventCompanionPrepared): CompanionAction {
    semanticFingerprint(prepared.action); const action = clone(prepared.action);
    if (action.kind !== intent.kind) throw Error('companion-preparation-kind-changed');
    if (action.kind === 'register' && intent.kind === 'register') {
      if (!isEventCompanion(action.candidate) || action.candidate.originEventId !== intent.eventId
        || intent.name !== undefined && action.candidate.name !== intent.name || action.candidate.commonEventId !== intent.commonEventId) throw Error('companion-preparation-candidate-changed');
    } else if (action.kind === 'remove' && intent.kind === 'remove' && semanticFingerprint(action.removal) !== semanticFingerprint(intent.removal)) throw Error('companion-preparation-removal-changed');
    else if (action.kind === 'player-moved' && intent.kind === 'player-moved' && (semanticFingerprint(action.player) !== semanticFingerprint(intent.player) || action.instant !== intent.instant)) throw Error('companion-preparation-player-changed');
    return action;
  }
  private close(e: Entry): void {
    if (e.cleanupDone) return; e.cleanupDone = true;
    const origin = e.originHandle, prepared = e.admission.ordinary?.prepared;
    e.originHandle = null;
    if (e.admission.ordinary) { e.admission.ordinary.origin = null; e.admission.ordinary.prepared = null; }
    if (e.channel && origin) { try { e.channel.retireOrigin(origin); } catch { /* Exact stale metadata cannot revoke a successor. */ } }
    if (e.channel && prepared) { try { e.channel.close(prepared); } catch { /* A closed App intent cannot reuse this native observation. */ } }
  }
  private start(raw: unknown, automaticRepair = false, movement = false, instant = false): EventCompanionIntentReceipt {
    const generation = this.#options.generation(), handle = Object.freeze({}); let resolve!: (result: CompanionResult) => void;
    const promise = new Promise<CompanionResult>(done => { resolve = done; });
    const admission: CompanionAppAdmission = { generation, lease: null, source: null, ordinary: { kind: null, prepared: null, origin: null, actionIdentity: null } };
    const e: Entry = { handle, admission, id: `companion-app:${generation}:${++this.#sequence}`, promise, resolve, phase: 'preparing', cancelled: false, service: null, channel: null, originHandle: null, cleanupDone: false, before: null, gameIdentity: '', contentIdentity: '', movement, instant, result: null };
    this.#issued.set(handle, e);
    if (this.#entry && !this.#entry.cancelled || !this.#options.claim(admission)) { e.phase = 'failed'; e.result = failed('operation-active'); resolve(e.result); return Object.freeze({ handle, result: promise }); }
    this.#entry = e;
    void Promise.resolve().then(async () => {
      let outcome: CompanionResult;
      try {
        const intent = movement ? null : readCompanionIntent(raw);
        admission.ordinary!.kind = movement ? 'player-moved' : intent!.kind;
        const connected = this.#options.connect(); e.service = connected.service; e.channel = connected.channel; this.current(e);
        const before = this.#options.observe(); e.before = before; e.gameIdentity = semanticFingerprint(before.game); e.contentIdentity = semanticFingerprint(before.content); admission.source = before.lifecycle;
        const life = before.lifecycle, birth = life.travelLease?.mapBirth;
        if (!life.travelLease?.nativeEpoch || !birth?.frame || life.mapData === undefined || birth.frame.data !== life.mapData) throw Error('companion-native-lineage-unavailable');
        const point = life.playerPosition, player = life.travelPlayer;
        if (movement && (!point || !player)) throw Error('companion-player-unavailable');
        const request: EventCompanionPreparationIntent = movement ? { kind: 'player-moved', player: { mapId: life.mapId, x: point!.x, y: point!.y, direction: player!.direction }, instant } : intent!;
        if (request.kind === 'remove') Object.freeze(request.removal);
        if (request.kind === 'player-moved') Object.freeze(request.player);
        Object.freeze(request);
        const records = clone(before.game.world.companions), facts = await connected.channel.prepare(request, records); this.current(e);
        if (facts.status !== 'value') throw Error(`companion-preparation-${facts.status}`);
        const prepared = facts.value; admission.ordinary!.prepared = prepared;
        const action = this.validate(request, prepared), actionIdentity = semanticFingerprint(action); admission.ordinary!.actionIdentity = actionIdentity;
        const current = this.#options.observe(); this.check(e, current);
        admission.source = current.lifecycle;
        if (request.kind === 'register') {
          if (action.kind !== 'register' || !isEventCompanion(action.candidate) || action.candidate.originMapId !== life.mapId) throw Error('companion-origin-map-changed');
          const publication = connected.channel.publishOrigin(prepared); this.current(e); e.originHandle = publication;
          const installed = this.#options.observe(); this.check(e, installed);
          const origin = installed.lifecycle.travelLease?.companionPreparedOrigin;
          // Expected final values come only from the actual materialized native record, not a
          // returned DTO/Proxy/getter. The provider's publication object is used only outside-final.
          if (!origin || !sameCompanionOrigin(origin, publication) || origin.prepared !== prepared || origin.application !== this.#options.application
            || origin.generation !== generation || origin.actionIdentity !== actionIdentity || origin.epoch !== life.travelLease!.nativeEpoch) throw Error('companion-origin-unissued');
          admission.ordinary!.origin = Object.freeze({ ...origin });
          admission.source = installed.lifecycle;
        }
        this.current(e); e.phase = 'running'; this.#options.writing(admission, true);
        if (automaticRepair) {
          const repair = await Reflect.apply(recover, connected.service, []) as CompanionRepairResult;
          outcome = repair.status === 'failed' || 'diagnostics' in repair ? repair : failed(`companion-recovery-${repair.status}`);
        } else outcome = await Reflect.apply(perform, connected.service, [e.id, action]) as CompanionResult;
        this.#options.writing(admission, false);
        e.phase = e.cancelled ? 'cancelled' : 'settling';
      } catch (error) { outcome = e.cancelled ? cancelled() : failed(why(error)); }
      finally {
        this.#options.writing(admission, false);
        this.close(e);
        if (this.#entry === e) { this.#entry = null; this.#options.release(admission); }
      }
      e.result = outcome!; e.phase = outcome!.status === 'failed' ? 'failed' : outcome!.status === 'cancelled' ? 'cancelled' : 'completed';
      // An actual committed removal's dirty revision is repaired before its promise returns when idle.
      if (!automaticRepair && e.service) await this.ready(e.service);
      e.resolve(e.result);
    });
    return Object.freeze({ handle, result: promise });
  }
  begin(raw: unknown): EventCompanionIntentReceipt { return this.start(raw); }
  cancel(handle: object): CompanionResult {
    const e = this.#issued.get(handle); if (!e) return failed('companion-handle-unissued');
    if (e.result) return e.result;
    if (e.cancelled) return cancelled();
    this.close(e);
    if (e.service && e.phase === 'running') {
      const result = Reflect.apply(cancel, e.service, [e.id]) as CompanionResult;
      // A service terminal already being published is not a newly cancellable owner.
      if (result.status !== 'cancelled') return result;
    }
    e.cancelled = true; e.phase = 'cancelled'; this.#options.release(e.admission);
    return cancelled();
  }
  ready(service?: EventCompanionApplication): Promise<CompanionRepairResult> {
    if (this.#repairing) return this.#repairing;
    if (this.#entry || !this.#options.available()) return Promise.resolve({ status: 'blocked' });
    let actual = service;
    try { actual ??= this.#options.connect().service; } catch { return Promise.resolve({ status: 'blocked' }); }
    const repair = Reflect.apply(repairReader, actual, []) as EventCompanionApplication['projectionRepair'];
    if (repair.status === 'clean') return Promise.resolve({ status: 'idle' });
    const key = `${repair.generation}:${repair.revision}`;
    if (repair.status === 'failed' || repair.attempts === 1 || this.#repairAttempts.has(key)) return Promise.resolve({ status: 'exhausted' });
    // Claim synchronously; busy refusal does not consume the revision's one preparation attempt.
    const receipt = this.start({ kind: 'recover' }, true); const e = this.#issued.get(receipt.handle)!;
    if (e.result?.status === 'failed') return Promise.resolve({ status: 'blocked' });
    this.#repairAttempts.add(key);
    const promise: Promise<CompanionRepairResult> = receipt.result;
    this.#repairing = promise; void promise.finally(() => { if (this.#repairing === promise) this.#repairing = null; }); return promise;
  }
  moved(instant = false): Promise<CompanionResult> {
    if (typeof instant !== 'boolean') return Promise.resolve(failed('invalid-companion-instant'));
    const current = this.#entry;
    if (current?.movement && !current.cancelled) return current.instant === instant ? current.promise : Promise.resolve(failed('companion-movement-conflict'));
    return this.start(null, false, true, instant).result;
  }
  invalidate(): void {
    const e = this.#entry; this.#entry = null; this.#repairAttempts.clear(); this.#repairing = null;
    if (e) { e.cancelled = true; e.phase = 'cancelled'; this.close(e); this.#options.release(e.admission); }
  }
}
