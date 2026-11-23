/** Real companion operation ownership and atomic records. GameApplication thin admission is separate. */
import { EventCompanionOperation } from './event-companion-operation';
import type { CompanionAction, CompanionHost, CompanionObservation, CompanionResult, CompanionWrite } from './event-companion-operation';
import type { CompanionApplicationBinding, CompanionApplicationLease, CompanionProjectionRepair, CompanionRepairResult,
  EventCompanionApplicationOptions, EventCompanionApplicationService } from './event-companion-ports';
import type { AtomicFieldQueryState, AtomicStateResult, WorldHostLifecycle } from './ports';
import type { GameState } from '../rules/state';
import type { Content } from '../rules/types';
import type { EventCompanionState } from '../rules/world-state';
import { clone } from '../rules/value';
import { semanticFingerprint } from '../rules/semantic';
import { validateGameContent } from '../rules/save-schema';
import { isEventCompanion } from '../rules/event-companions';
import { isTravelLocation } from '../rules/world-travel';
import { CompanionLifecycle } from './event-companion-lifecycle';
import type { CompanionRuntimePresentation } from './companion-lifecycle-data';
const lifecyclePresentation = CompanionLifecycle.prototype.presentation;
const lifecycleRetained = CompanionLifecycle.prototype.retainedHidden;

type Actual = AtomicFieldQueryState & { readonly generation: number };
interface Entry {
  readonly owner: object; readonly requestId: string; readonly key: string; readonly action: CompanionAction; readonly epoch: number;
  readonly generation: number; readonly lease: CompanionApplicationLease; readonly binding: CompanionApplicationBinding;
  readonly promise: Promise<CompanionResult>; readonly resolve: (result: CompanionResult) => void; readonly automatic: boolean;
  phase: 'preparing' | 'running' | 'retiring' | 'completed' | 'failed' | 'cancelled';
  game: GameState | null; content: Content | null; gameHash: string; contentHash: string; native: WorldHostLifecycle | null;
  operation: EventCompanionOperation | null; hasBound: boolean; projecting: boolean; committed: boolean; cancelled: boolean;
  revision: number; outcome?: CompanionResult;
}
const why = (error: unknown): string => error instanceof Error ? error.message : String(error);
const failed = (reason: string): CompanionResult => ({ status: 'failed', reason });
function action(raw: unknown): CompanionAction {
  semanticFingerprint(raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('invalid-companion-action');
  const input = raw as Record<string, unknown>, kind = input.kind;
  const fields = kind === 'register' ? ['kind', 'candidate'] : kind === 'remove' ? ['kind', 'removal'] : kind === 'recover' ? ['kind'] : ['kind', 'player', 'instant'];
  if (Reflect.ownKeys(input).some(key => typeof key !== 'string' || !fields.includes(key))) throw Error('invalid-companion-action-field');
  if (kind === 'register') { if (!isEventCompanion(input.candidate)) throw Error('invalid-companion'); return { kind, candidate: clone(input.candidate) }; }
  if (kind === 'recover') return { kind };
  if (kind === 'player-moved') {
    if (!isTravelLocation(input.player) || typeof input.instant !== 'boolean') throw Error('invalid-companion-player-move');
    return { kind, player: clone(input.player), instant: input.instant };
  }
  if (kind !== 'remove' || !input.removal || typeof input.removal !== 'object' || Array.isArray(input.removal)) throw Error('invalid-companion-removal');
  const removal = input.removal as Record<string, unknown>;
  if (removal.kind === 'all' && Object.keys(removal).length === 1) return { kind, removal: { kind: 'all' } };
  if (removal.kind === 'name' && typeof removal.name === 'string' && Object.keys(removal).sort().join(',') === 'kind,name') return { kind, removal: { kind: 'name', name: removal.name } };
  if (removal.kind === 'origin' && Object.keys(removal).sort().join(',') === 'kind,originEventId,originMapId'
    && typeof removal.originMapId === 'number' && Number.isSafeInteger(removal.originMapId) && removal.originMapId > 0
    && typeof removal.originEventId === 'number' && Number.isSafeInteger(removal.originEventId) && removal.originEventId > 0) return { kind, removal: { kind: 'origin', originMapId: removal.originMapId, originEventId: removal.originEventId } };
  throw Error('invalid-companion-removal');
}
function sameNative(a: WorldHostLifecycle, b: WorldHostLifecycle): boolean {
  const x = a.sceneTransition, y = b.sceneTransition;
  return a.map === b.map && a.mapId === b.mapId && a.player === b.player && a.scene === b.scene
    && a.playerPosition?.x === b.playerPosition?.x && a.playerPosition?.y === b.playerPosition?.y
    && a.travelPlayer?.direction === b.travelPlayer?.direction && a.travelPlayer?.transferring === b.travelPlayer?.transferring
    && (!!x === !!y) && (!x || !y || x.manager === y.manager && x.prototype === y.prototype && x.started === y.started && x.nextScene === y.nextScene && x.nextPrototype === y.nextPrototype);
}

export class EventCompanionApplication implements EventCompanionApplicationService {
  private readonly options: EventCompanionApplicationOptions;
  private readonly issued = new WeakMap<object, Entry>();
  private readonly requests = new Map<string, Entry>();
  /** One private recovery receipt; its diagnostic requestId never enters the caller namespace. */
  private automaticRepair: Entry | null = null;
  private entry: Entry | null = null;
  private preparing = false;
  private accessing = false;
  private invalidating = false;
  private epoch = 0;
  private generation: number;
  private hidden: readonly string[] = [];
  readonly #lifecycle: CompanionLifecycle | undefined;
  private repair: CompanionProjectionRepair;
  constructor(options: EventCompanionApplicationOptions) {
    const { lifecycle, ...providers } = options;
    this.#lifecycle = lifecycle; this.options = providers; this.generation = options.generation();
    if (!Number.isSafeInteger(this.generation) || this.generation < 0) throw Error('invalid-companion-generation');
    this.repair = { status: 'clean', generation: this.generation, revision: 0 };
  }
  get active(): boolean { return this.preparing || this.invalidating || this.entry !== null; }
  get currentLease(): CompanionApplicationLease | null { return this.entry?.lease ?? null; }
  get projectionRepair(): CompanionProjectionRepair { return Object.freeze({ ...this.repair }); }
  runtimePresentation(): CompanionRuntimePresentation { return this.#lifecycle
    ? Reflect.apply(lifecyclePresentation, this.#lifecycle, []) as CompanionRuntimePresentation
    : Object.freeze({ generation: this.generation, revision: this.repair.revision, transferHidden: Object.freeze([...this.hidden]), turnTowardPlayer: false }); }
  isBindingIssued(candidate: unknown): boolean {
    const entry = this.entry;
    return !!entry && candidate === entry.binding && this.issued.get(entry.owner) === entry
      && (entry.phase === 'retiring' || entry.phase === 'running' && entry.epoch === this.epoch);
  }
  private outside(entry: Entry): void {
    const generation = this.options.generation();
    if (this.entry !== entry || entry.phase !== 'running' && entry.phase !== 'preparing' || entry.epoch !== this.epoch || entry.cancelled || generation !== entry.generation) throw Error('companion-owner-stale');
  }
  private current(entry: Entry, actual: Actual): void {
    if (this.entry !== entry || entry.phase !== 'running' || entry.epoch !== this.epoch || entry.cancelled
      || this.issued.get(entry.owner) !== entry || actual.generation !== entry.generation) throw Error('companion-owner-stale');
    if (actual.game !== entry.game || actual.content !== entry.content || semanticFingerprint(actual.game) !== entry.gameHash || semanticFingerprint(actual.content) !== entry.contentHash) throw Error('companion-state-or-content-changed');
    if (!entry.native || !sameNative(actual.lifecycle, entry.native)) throw Error('companion-native-source-changed');
  }
  private visible(entry: Entry): boolean {
    this.outside(entry); const visible = this.options.authorVisible(); this.outside(entry);
    if (typeof visible !== 'boolean') throw Error('companion-author-visibility-invalid');
    return visible;
  }
  private observation(entry: Entry, actual: Actual, visible: boolean): CompanionObservation {
    return { owner: entry.owner, generation: actual.generation, game: actual.game, content: actual.content,
      action: entry.action, authorVisible: visible, transferHidden: this.#lifecycle
        ? (Reflect.apply(lifecyclePresentation, this.#lifecycle, []) as CompanionRuntimePresentation).transferHidden : this.hidden };
  }
  private access(entry: Entry, transform?: (actual: CompanionObservation) => CompanionWrite): CompanionObservation {
    if (this.accessing) throw Error('companion-atomic-reentrant');
    this.accessing = true; let terminal = false, installedHidden: readonly string[] | null = null;
    try {
      const result = this.options.atomic(() => {
        const visible = this.visible(entry);
        return actual => {
          this.current(entry, actual);
          const before = this.observation(entry, actual, visible);
          if (!transform) return { value: before };
          // This closure belongs only to the known operation consumer, never an injected host.
          const write = transform(before);
          semanticFingerprint(write.game); semanticFingerprint(write.transferHidden);
          if (validateGameContent(write.game, actual.content).length || !write.transferHidden.every(id => typeof id === 'string')) throw Error('invalid-companion-state');
          if (!write.terminal) {
            if (!Number.isSafeInteger(this.repair.revision + 1)) throw Error('companion-revision-exhausted');
            entry.revision = this.repair.revision + 1; entry.committed = true;
            this.repair = { status: 'pending', generation: entry.generation, revision: entry.revision, attempts: 0, reason: 'records-committed' };
          } else if (this.repair.generation === entry.generation && this.repair.revision === entry.revision) this.repair = { status: 'clean', generation: entry.generation, revision: entry.revision };
          installedHidden = [...write.transferHidden]; entry.game = write.game; entry.gameHash = semanticFingerprint(write.game);
          terminal = write.terminal;
          return { ...(write.game === actual.game ? {} : { next: write.game }), value: { ...before, game: write.game, transferHidden: installedHidden } };
        };
      });
      if (installedHidden) {
        if (this.#lifecycle) Reflect.apply(lifecycleRetained, this.#lifecycle, [installedHidden, entry.generation]);
        else this.hidden = installedHidden;
      }
      if (terminal) this.release(entry, false);
      return result;
    } finally { this.accessing = false; }
  }
  private notify(): void { try { this.options.released(); } catch { /* The operation already ended; this callback cannot own its state. */ } }
  private publish(entry: Entry, result: CompanionResult): void {
    if (!entry.outcome) { entry.outcome = result; entry.resolve(result); }
  }
  private release(entry: Entry, retire: boolean): void {
    if (this.entry !== entry) return;
    entry.phase = retire ? 'retiring' : 'completed';
    let cleanup: string | null = null;
    if (retire && entry.hasBound && (entry.committed || entry.projecting)) {
      try { this.options.retireProjection(entry.binding); }
      catch (error) { cleanup = `companion-projection-retirement-failed:${why(error)}`; }
    }
    if (this.entry !== entry) return;
    if (retire && !this.invalidating && this.repair.status !== 'clean' && this.repair.generation === entry.generation) {
      const attempts = this.repair.attempts;
      this.repair = { ...this.repair, status: cleanup || attempts === 1 ? 'failed' : 'pending', reason: cleanup ?? (entry.cancelled ? 'projection-cancelled' : 'projection-failed') };
    }
    entry.phase = retire ? entry.cancelled ? 'cancelled' : 'failed' : 'completed'; this.entry = null;
    if (cleanup) this.publish(entry, failed(cleanup));
    else if (entry.cancelled) this.publish(entry, { status: 'cancelled', diagnostics: [] });
    if (!this.invalidating) this.notify();
  }
  private start(requestId: string, raw: unknown, automatic: boolean): Promise<CompanionResult> {
    if (typeof requestId !== 'string' || !requestId.length || requestId.length > 128) return Promise.resolve(failed('invalid-companion-request-id'));
    const repair = this.automaticRepair;
    const old = automatic
      ? repair && repair.epoch === this.epoch && repair.generation === this.repair.generation && repair.revision === this.repair.revision ? repair : undefined
      : this.requests.get(requestId);
    if (old) { try { return semanticFingerprint(raw) === old.key ? old.promise : Promise.resolve(failed('companion-request-conflict')); } catch (error) { return Promise.resolve(failed(why(error))); } }
    if (this.active) return Promise.resolve(failed('operation-active'));
    this.preparing = true;
    let entry: Entry | null = null;
    try {
      const parsed = action(raw), generation = this.options.generation();
      if (!Number.isSafeInteger(generation) || generation < 0) throw Error('invalid-companion-generation');
      if (generation !== this.generation) throw Error('companion-invalidate-required');
      let resolve!: (result: CompanionResult) => void;
      const promise = new Promise<CompanionResult>(finish => { resolve = finish; });
      const owner = Object.freeze({}), lease = Object.freeze({ owner, generation });
      let issued!: Entry;
      const binding: CompanionApplicationBinding = Object.freeze({ ...lease,
        isOperationCurrent: (candidate: object, epoch: number) => {
          if (candidate !== owner || epoch !== generation || this.entry !== issued || issued.phase !== 'running' || this.issued.get(owner) !== issued) return false;
          try { this.outside(issued); return true; } catch { return false; }
        },
        isProjectionRetiring: (candidate: object, epoch: number) => candidate === owner && epoch === generation && this.entry === issued && issued.phase === 'retiring' && this.issued.get(owner) === issued,
      });
      issued = { owner, lease, binding, generation, requestId, key: semanticFingerprint(raw), action: parsed, epoch: this.epoch, automatic,
        promise, resolve, phase: 'preparing', game: null, content: null, gameHash: '', contentHash: '', native: null,
        operation: null, hasBound: false, projecting: false, committed: false, cancelled: false, revision: this.repair.revision };
      entry = issued; this.entry = issued;
      this.options.atomic(() => {
        this.outside(issued); const allowed = this.options.canStart(); this.outside(issued);
        if (!allowed) throw Error('operation-active');
        this.visible(issued);
        return actual => {
          if (this.entry !== issued || issued.phase !== 'preparing' || issued.epoch !== this.epoch || issued.cancelled || actual.generation !== generation) throw Error('companion-admission-stale');
          semanticFingerprint(actual.game); semanticFingerprint(actual.content);
          if (validateGameContent(actual.game, actual.content).length) throw Error('invalid-companion-state');
          const native = actual.lifecycle, position = native.playerPosition, player = native.travelPlayer, scene = native.sceneTransition;
          if (!position || !player || player.transferring || !scene?.started || scene.nextScene !== null) throw Error('companion-native-source-unavailable');
          if (parsed.kind === 'player-moved' && (parsed.player.mapId !== native.mapId || parsed.player.x !== position.x || parsed.player.y !== position.y || parsed.player.direction !== player.direction)) throw Error('companion-player-move-unobserved');
          issued.game = actual.game; issued.content = actual.content; issued.gameHash = semanticFingerprint(actual.game); issued.contentHash = semanticFingerprint(actual.content); issued.native = native;
          issued.phase = 'running'; this.issued.set(owner, issued);
          if (automatic && this.repair.status !== 'clean') this.repair = { ...this.repair, attempts: 1 };
          if (automatic) this.automaticRepair = issued;
          else {
            if (this.requests.size >= 256) for (const [id, previous] of this.requests) { if (previous.phase === 'completed' || previous.phase === 'failed' || previous.phase === 'cancelled') { this.requests.delete(id); break; } }
            if (this.requests.size >= 256) throw Error('companion-request-limit');
            this.requests.set(requestId, issued);
          }
          return { value: undefined };
        };
      });
      this.outside(issued);
      const bound = this.options.bind(binding); this.outside(issued); issued.hasBound = true;
      const host: CompanionHost = { source: origin => bound.source(origin), trail: bound.trail, move: movement => bound.move(movement),
        project: projection => { issued.projecting = true; return bound.project(projection); } };
      issued.operation = new EventCompanionOperation({ observe: () => this.access(issued), commitCompanions: change => this.access(issued, change),
        release: (candidate, epoch) => { if (candidate === owner && epoch === generation) this.release(issued, true); } }, host, lease);
      void issued.operation.run().then(result => { if (this.entry === issued) this.release(issued, result.status !== 'completed' && result.status !== 'duplicate'); this.publish(issued, result); }, error => {
        if (this.entry === issued) this.release(issued, true); this.publish(issued, failed(why(error)));
      });
      return promise;
    } catch (error) {
      const result = failed(why(error));
      if (entry) { if (this.entry === entry) this.release(entry, true); this.publish(entry, result); return entry.promise; }
      return Promise.resolve(result);
    } finally { this.preparing = false; }
  }
  perform(requestId: string, intent: unknown): Promise<CompanionResult> { return this.start(requestId, intent, false); }
  cancel(requestId: string): CompanionResult {
    const entry = this.requests.get(requestId) ?? (this.entry && !this.entry.automatic && this.entry.requestId === requestId ? this.entry : null);
    if (!entry || this.entry !== entry) return entry?.outcome ?? failed('stale-companion-request');
    entry.cancelled = true;
    const result = entry.operation?.cancel() ?? { status: 'cancelled' as const, diagnostics: [] };
    if (this.entry === entry) this.release(entry, true);
    return entry.outcome ?? result;
  }
  /** App-owned first projection. Uses the private automatic book, never caller request IDs. */
  bootstrapProjection(): Promise<CompanionResult> { return this.start('companion-bootstrap', { kind: 'recover' }, true); }
  recoverPending(): Promise<CompanionRepairResult> {
    if (this.active) return Promise.resolve({ status: 'blocked' });
    const repair = this.repair;
    if (repair.status === 'clean') return Promise.resolve({ status: 'idle' });
    if (repair.status === 'failed' || repair.attempts === 1) return Promise.resolve({ status: 'exhausted' });
    return this.start(`companion-repair:${repair.generation}:${repair.revision}`, { kind: 'recover' }, true).then(result => result.status === 'failed' && result.reason === 'operation-active' ? { status: 'blocked' as const } : result);
  }
  readRecords(): readonly EventCompanionState[] {
    if (this.accessing) throw Error('companion-atomic-reentrant');
    this.accessing = true;
    try { return this.options.atomic(() => {
      const generation = this.options.generation();
      return actual => {
        if (actual.generation !== generation) throw Error('companion-query-stale');
        semanticFingerprint(actual.game);
        return { value: clone(actual.game.world.companions) };
      };
    }); } finally { this.accessing = false; }
  }
  invalidate(): void {
    if (this.invalidating) return;
    this.invalidating = true; this.epoch++;
    const entry = this.entry;
    this.requests.clear(); this.automaticRepair = null; this.hidden = [];
    const generation = this.options.generation();
    if (Number.isSafeInteger(generation) && generation >= 0) this.generation = generation;
    this.repair = { status: 'clean', generation: this.generation, revision: 0 };
    try {
      if (entry) { entry.cancelled = true; entry.operation?.cancel(); if (this.entry === entry) this.release(entry, true); }
    } finally { this.invalidating = false; this.notify(); }
  }
}
