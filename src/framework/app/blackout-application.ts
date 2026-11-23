import { CompanionProjectionReset } from './event-companion-projection-reset';
import type { CompanionResetOutcome, CompanionResetTerminal } from './event-companion-projection-reset';
import type { BlackoutProjectionOutcome } from './blackout-projection-ports';
const resetRun = CompanionProjectionReset.prototype.run, resetTerminal = CompanionProjectionReset.prototype.prepareTerminal;
const resetCommit = CompanionProjectionReset.prototype.committed, resetAbort = CompanionProjectionReset.prototype.abort;
const resetRecover = CompanionProjectionReset.prototype.recoverPending, resetCancel = CompanionProjectionReset.prototype.cancel;
const resetInvalidate = CompanionProjectionReset.prototype.invalidate;
/** Actual F parent. Only GameApplication settlement and WorldOperation's real D owner admit work. */
import { BlackoutOperation, readBlackoutCheckpoint } from './blackout-operation';
import type { BlackoutAdmission, BlackoutObservation, BlackoutRunResult, BlackoutWrite } from './blackout-operation';
import type { BlackoutSourceContext, BlackoutTransferAncestor, BlackoutNonTransferCompletion, WorldBlackoutHost } from './blackout-ports';
import type { AtomicFieldQueryState, AtomicStateResult, WorldHostLifecycle, WorldTravelLeaseCurrent, WorldTravelLeaseSource } from './ports';
import type { TravelAtomicPort, WorldTravelHost, PreparedTravelEntry } from './world-travel-ports';
import type { TravelReceipt, TravelArrival, TravelMap, TravelCheckpoint } from './world-travel-operation';
import type { BlackoutCheckpoint, BlackoutOrigin } from '../rules/blackout-checkpoint';
import type { WorldMapEntry } from '../rules/world-state';
import type { GameState } from '../rules/state';
import type { Content } from '../rules/types';
import { clone } from '../rules/value';
import { semanticFingerprint } from '../rules/semantic';
import { validateGameContent } from '../rules/save-schema';
import { isTravelLocation, validateTravelTarget } from '../rules/world-travel';

interface Options {
  readonly host?: WorldBlackoutHost; readonly travel?: WorldTravelHost; readonly atomic?: TravelAtomicPort;
  generation(): number;
  /** These closures belong to the actual World/App, not a host-provided predicate. */
  prepareEntry(checkpoint: TravelCheckpoint, game: GameState, content: Content, current: () => void): PreparedTravelEntry;
  sourceEntries(sync: { before(game: GameState): void; applied(game: GameState): void; install(next: GameState, current: () => void, content: Content): void }): void;
  released(): void;
  projectionReset?(): void;
  projectionRestore?(): boolean;
}
interface ProjectionChild {
  readonly attempt: object; readonly generation: number; readonly promise: Promise<BlackoutProjectionOutcome>;
  outcome: CompanionResetOutcome | null; terminal: CompanionResetTerminal | null;
  committedRevision: number | null; aborted: object | null; restoreRequested: boolean;
}
const unknownProjection = Object.freeze({ hadSurface: null, spritesRemaining: null, charactersRemaining: null, motionsRemaining: null, maskDetached: null });
interface Entry {
  readonly owner: object; readonly generation: number; readonly context: BlackoutSourceContext;
  readonly admission: BlackoutAdmission | null; readonly initial: WorldHostLifecycle; readonly contentIdentity: string;
  expectedGame: string; source: WorldHostLifecycle | null; lease: WorldTravelLeaseCurrent | null;
  operation: BlackoutOperation | null; receipt: TravelReceipt | null; map: TravelMap | null; arrival: TravelArrival | null; arrivalFrame: WorldHostLifecycle | null;
  status: 'active' | 'failed' | 'cancelled' | 'completed'; cleanupFailed: boolean; sourceBound: boolean; preparing: boolean; entering: boolean;
  projection: ProjectionChild | null;
  completion: BlackoutNonTransferCompletion | null; completionBranch: 'no-home' | 'home-map-missing' | null;
  promise: Promise<BlackoutRunResult> | null; result: BlackoutRunResult | null; notified: boolean;
  presentationCleanupFailed: boolean;
}
const why = (e: unknown): string => e instanceof Error ? e.message : String(e);
const same = (a: unknown, b: unknown): boolean => semanticFingerprint(a) === semanticFingerprint(b);
const done = (r: { readonly status: string; readonly reason?: string }): void => { if (r.status !== 'done') throw Error(r.reason ?? 'invalid-blackout-effect-result'); };
const at = (life: WorldHostLifecycle, receipt: TravelReceipt): boolean => life.mapId === receipt.target.mapId && life.playerPosition?.x === receipt.target.x && life.playerPosition.y === receipt.target.y;
function sameFrame(a: WorldHostLifecycle, b: WorldHostLifecycle): boolean {
  return a.map === b.map && a.mapId === b.mapId && a.player === b.player && a.scene === b.scene && a.mapData === b.mapData
    && a.playerPosition?.x === b.playerPosition?.x && a.playerPosition?.y === b.playerPosition?.y;
}

/** Preserve E3's loaded-map identity check before projecting to F's narrower resource shape. */
function readArrival(value: TravelArrival): TravelArrival {
  semanticFingerprint(value);
  const checked = validateTravelTarget(value.actual, { status: 'value', value: value.loadedGeometry });
  if (checked.status !== 'ready' || typeof value.transferPending !== 'boolean') throw Error(`blackout-native-geometry:${checked.status === 'ready' ? 'invalid-pending' : checked.reason}`);
  return clone(value);
}

export class BlackoutApplication {
  private readonly options: Options;
  private readonly registry: WorldTravelLeaseSource | null;
  private entry: Entry | null = null;
  private starting: object | null = null;
  private accessing = false;
  private sequence = 0;
  private projectionController: CompanionProjectionReset | null = null;
  private projectionRevision = 0;
  private readonly issued = new WeakMap<object, Entry>();
  private readonly completions = new WeakMap<object, Entry>();
  private readonly owners = new WeakMap<object, Entry>();
  constructor(options: Options) { this.options = options; this.registry = options.travel?.nativeLeaseSource ?? null; }
  get active(): boolean { return this.starting !== null || this.entry?.status === 'active' || this.entry?.cleanupFailed === true; }
  get enabled(): boolean { return !!this.options.host && !!this.options.travel && !!this.options.atomic; }
  private current(e: Entry): void {
    if (this.entry !== e || e.status !== 'active' || e.generation !== this.options.generation()) throw Error('blackout-owner-stale');
  }
  private native(e: Entry, life: WorldHostLifecycle): void {
    const snapshot = life.travelLease;
    if (!snapshot || snapshot.registry !== this.registry || life.mapData === undefined || !life.travelPlayer || !life.playerPosition) throw Error('blackout-native-source-unavailable');
    if (!e.sourceBound) {
      if (!sameFrame(life, e.initial)) throw Error('blackout-source-changed');
      return;
    }
    const source = e.source!;
    const lease = snapshot.current;
    if (e.receipt && lease?.owner === e.owner && lease.receipt === e.receipt) {
      if (lease.player !== source.player || lease.sourceScene !== source.scene || lease.scene !== life.scene || life.player !== source.player || life.map !== source.map) throw Error('blackout-native-lease-source-changed');
      const bound = e.lease;
      if (bound && (bound.lease !== lease.lease || bound.serial !== lease.serial || bound.player !== lease.player || bound.sourceScene !== lease.sourceScene)) throw Error('blackout-native-lease-changed');
      if (bound && ({ reserved: 0, performing: 1, arrived: 2 }[lease.phase] < { reserved: 0, performing: 1, arrived: 2 }[bound.phase])) throw Error('blackout-native-phase-regressed');
      if (e.arrival ? lease.phase !== 'arrived' || !at(life, e.receipt) || !e.arrivalFrame || !sameFrame(life, e.arrivalFrame) : lease.phase === 'arrived' || life.mapId !== source.mapId || life.playerPosition.x !== source.playerPosition?.x || life.playerPosition.y !== source.playerPosition?.y) throw Error('blackout-native-arrival-mismatch');
      if (life.travelPlayer.transferring && !same(life.travelPlayer.target, e.receipt.target)) throw Error('blackout-native-transfer-changed');
      e.lease = lease;
      return;
    }
    if (e.lease || !sameFrame(life, source) || life.travelPlayer.transferring || life.sceneTransition?.nextScene !== null) throw Error('blackout-native-source-changed');
    const birth = snapshot.mapBirth, original = source.travelLease?.mapBirth;
    if (!birth || !original || birth.birth !== original.birth || birth.queue !== original.queue || birth.scene !== life.scene
      || birth.frame?.map !== life.map || birth.frame.mapId !== life.mapId || birth.frame.player !== life.player || birth.frame.data !== life.mapData) throw Error('blackout-native-map-birth-changed');
  }
  private access<T>(e: Entry, prepare: () => (actual: AtomicFieldQueryState & { readonly generation: number }) => AtomicStateResult<T>): T {
    if (!this.options.atomic || this.accessing) throw Error('blackout-atomic-unavailable-or-reentrant');
    this.accessing = true;
    try { return this.options.atomic(() => {
      this.current(e); const finish = prepare();
      return actual => {
        this.current(e);
        if (actual.generation !== e.generation || semanticFingerprint(actual.game) !== e.expectedGame || semanticFingerprint(actual.content) !== e.contentIdentity) throw Error('blackout-state-or-content-changed');
        this.native(e, actual.lifecycle);
        return finish(actual);
      };
    }); } finally { this.accessing = false; }
  }
  private observation(e: Entry, actual: AtomicFieldQueryState): BlackoutObservation {
    return { owner: e.status === 'active' ? e.owner : null, generation: e.generation, game: actual.game, content: actual.content,
      checkpoint: actual.game.world.pendingReturn, admission: e.admission };
  }
  private observe(e: Entry): BlackoutObservation { return this.access(e, () => actual => ({ value: this.observation(e, actual) })); }
  private commit(e: Entry, transform: (actual: BlackoutObservation) => BlackoutWrite): BlackoutObservation {
    let completedBranch: 'no-home' | 'home-map-missing' | null = null;
    let installedProjection: ProjectionChild | null = null;
    const installed = this.access(e, () => {
      const preparedProjection = e.projection, preparedAttempt = preparedProjection?.attempt, preparedTerminal = preparedProjection?.terminal;
      let prepared: PreparedTravelEntry | undefined;
      if (e.arrival && e.receipt) {
        const actual = this.options.atomic!(() => observed => ({ value: observed })); this.current(e);
        if (semanticFingerprint(actual.game) !== e.expectedGame || semanticFingerprint(actual.content) !== e.contentIdentity) throw Error('blackout-entry-source-changed');
        this.native(e, actual.lifecycle);
        const source = e.source!;
        const checkpoint: TravelCheckpoint = { id: actual.game.world.pendingReturn!.id, kind: 'transfer', source: { mapId: source.mapId, x: source.playerPosition!.x, y: source.playerPosition!.y, direction: source.travelPlayer!.direction },
          target: clone(e.receipt.target), phase: 'after-arrival', cursor: 3, preserveSurfing: false, stepId: null };
        prepared = this.options.prepareEntry(checkpoint, actual.game, actual.content, () => this.current(e));
      }
      return actual => {
        const write = transform(this.observation(e, actual));
        let next = clone(write.game); next.world.pendingReturn = write.checkpoint ? readBlackoutCheckpoint(write.checkpoint) : null;
        if (write.terminal === 'arrived') {
          if (!e.arrival || !e.receipt || this.issued.get(e.receipt) !== e || !prepared) throw Error('blackout-unissued-arrival');
          next = prepared.apply(next);
        }
        if (actual.game.world.pendingReturn?.phase === 'prepare' && write.checkpoint?.phase === 'ready') {
          const child = preparedProjection, terminal = preparedTerminal;
          if (!child || child.generation !== e.generation || child !== e.projection || child.attempt !== preparedAttempt || child.terminal !== terminal || !child.outcome || !terminal
            || child.outcome.receipt !== terminal.outcome.receipt || terminal.owner !== e.owner || terminal.generation !== e.generation
            || child.committedRevision !== null || child.aborted !== null || !terminal.accept(e.owner, e.generation)) throw Error('blackout-projection-terminal-unissued');
          if (next.world.companions.length !== 0) throw Error('blackout-projection-business-clear-missing');
          installedProjection = child;
        }
        if (validateGameContent(next, actual.content).length) throw Error('invalid-blackout-state');
        e.expectedGame = semanticFingerprint(next);
        if (write.terminal === 'complete') {
          const branch = actual.game.world.pendingReturn?.branch;
          if (branch !== 'no-home' && branch !== 'home-map-missing' || e.receipt) throw Error('blackout-nontransfer-branch-invalid');
          completedBranch = branch;
        }
        if (write.terminal) { e.status = 'completed'; e.result = { status: write.terminal === 'arrived' ? 'arrived' : 'completed' }; }
        if (write.terminal === 'arrived') prepared!.installed(next);
        return { value: { ...this.observation(e, actual), game: next, checkpoint: next.world.pendingReturn }, next };
      };
    });
    // Issue only after the real atomic assignment returned. It cannot be pre-created by a host.
    if (completedBranch && this.entry === e && e.status === 'completed' && e.generation === this.options.generation()) {
      const completion = Object.freeze({}) as BlackoutNonTransferCompletion;
      e.completion = completion; e.completionBranch = completedBranch; this.completions.set(completion, e);
    }
    if (installedProjection && this.entry === e && e.generation === this.options.generation()) {
      const child: ProjectionChild = installedProjection;
      child.committedRevision = ++this.projectionRevision;
      const controller = this.projectionController;
      this.options.projectionReset?.();
      if (controller && child.outcome && Reflect.apply(resetCommit, controller, [child.outcome.receipt, child.committedRevision])) {
        Reflect.apply(resetRecover, controller, []);
      }
    }
    return installed;
  }
  private issue(e: Entry, owner: object, generation: number, checkpoint: BlackoutCheckpoint): TravelReceipt {
    this.observe(e);
    if (owner !== e.owner || generation !== e.generation || checkpoint.selection.branch === 'no-home' || checkpoint.phase !== 'ready' && checkpoint.phase !== 'awaiting-arrival') throw Error('blackout-transfer-not-ready');
    if (e.receipt) return e.receipt;
    const receipt: TravelReceipt = Object.freeze({ token: `blackout-transfer:${e.generation}:${++this.sequence}`, generation: e.generation, target: Object.freeze(clone(checkpoint.selection.target)) });
    e.receipt = receipt; this.issued.set(receipt, e); return receipt;
  }
  private makeOperation(e: Entry): BlackoutOperation {
    const host = this.options.host!, travel = this.options.travel!;
    return new BlackoutOperation({ observe: () => this.observe(e), commitBlackout: f => this.commit(e, f),
      issueTransfer: (owner, generation, checkpoint) => this.issue(e, owner, generation, checkpoint), release: () => this.release(e) }, {
      preload: async target => {
        const map = await travel.preload(e.owner, target); this.observe(e);
        if (map.status === 'ready') {
          if (map.mapId !== target.mapId || !map.handle || typeof map.handle !== 'object') throw Error('blackout-map-handle-invalid');
          e.map = map; return { status: 'exists', width: map.width, height: map.height };
        }
        if (map.status === 'missing') return { status: 'missing' };
        return { status: 'unavailable' };
      },
      announce: (kind, checkpoint) => host.announce(kind, checkpoint, e.owner), prepare: async checkpoint => { this.current(e); e.preparing = true; try { return await host.prepare(checkpoint, e.owner); } finally { e.preparing = false; } },
      observe: id => {
        const observed = travel.observeNow(); this.observe(e);
        if (observed.status !== 'value') throw Error(`blackout-observation-${observed.status}`);
        readArrival(observed.value);
        return { returnId: id, actual: clone(observed.value.actual), transferPending: observed.value.transferPending, targetMap: { status: 'exists', width: observed.value.loadedGeometry.width, height: observed.value.loadedGeometry.height } };
      },
      reserve: receipt => {
        if (this.issued.get(receipt) !== e || !e.map) throw Error('blackout-transfer-unissued-or-unloaded');
        const result = travel.reserve(e.owner, receipt, e.map);
        return result.status === 'reserved' ? { status: 'done' } : result;
      },
      refresh: receipt => {
        if (!e.arrival) {
          const observed = travel.observeNow(); this.observe(e);
          if (e.admission !== null || this.issued.get(receipt) !== e || observed.status !== 'value' || observed.value.transferPending || !same(observed.value.actual, receipt.target)) throw Error('blackout-cold-arrival-proof-required');
          const actual = this.options.atomic!(() => state => ({ value: state })); this.current(e); this.native(e, actual.lifecycle);
          if (actual.game.world.pendingReturn?.phase !== 'awaiting-arrival' || !at(actual.lifecycle, receipt)) throw Error('blackout-cold-arrival-not-awaited');
          e.arrival = readArrival(observed.value); e.arrivalFrame = actual.lifecycle;
        }
        return host.requestMapRefresh(e.owner, receipt);
      },
    }, { owner: e.owner, generation: e.generation });
  }
  attachProjection(controller: CompanionProjectionReset): void {
    if (this.projectionController) throw Error('blackout-projection-already-connected');
    // Real # slots reject DTOs, borrowed prototypes and another bundled class before attachment.
    Reflect.apply(resetTerminal, controller, [{}]); this.projectionController = controller;
  }
  clearProjection(owner: object): Promise<BlackoutProjectionOutcome> {
    const e = this.owners.get(owner);
    const rejected = (reason: string): Promise<BlackoutProjectionOutcome> => Promise.resolve(Object.freeze({ status: 'rejected', receipt: Object.freeze({}), resources: unknownProjection, diagnostics: [], reason }));
    if (!e || !this.isPreparing(owner)) return rejected('blackout-projection-parent-unissued');
    if (e.projection) return e.projection.promise;
    const controller = this.projectionController;
    if (!controller) return rejected('blackout-projection-capability-unavailable');
    const child: ProjectionChild = { attempt: Object.freeze({}), generation: e.generation, promise: Promise.resolve().then(async () => {
      this.observe(e);
      const oldCleanup = Reflect.apply(resetRecover, controller, [owner]); this.current(e);
      const outcome = await Reflect.apply(resetRun, controller, [owner]);
      child.outcome = outcome;
      this.observe(e);
      child.terminal = Reflect.apply(resetTerminal, controller, [outcome.receipt]);
      if ((outcome.status === 'cleared' || outcome.status === 'fallback') && !child.terminal) throw Error('blackout-projection-terminal-unavailable');
      const diagnostics = [...outcome.diagnostics, ...oldCleanup.flatMap(item => item.diagnostics)];
      const pending = oldCleanup.some(item => item.status !== 'cleared');
      return Object.freeze({ ...outcome, status: pending && outcome.status === 'cleared' ? 'fallback' as const : outcome.status, diagnostics: Object.freeze(diagnostics) });
    }).finally(() => { if (e.status === 'failed' || e.status === 'cancelled') this.recoverProjectionAbort(); }), outcome: null, terminal: null, committedRevision: null, aborted: null, restoreRequested: false };
    e.projection = child; this.options.projectionReset?.(); return child.promise;
  }
  projectionCommitted(owner: object, receipt: object, revision: number): boolean {
    const e = this.owners.get(owner), child = e?.projection;
    return !!e && !!child && this.entry === e && e.generation === this.options.generation() && child.generation === e.generation
      && child.outcome?.receipt === receipt && child.committedRevision === revision && child.aborted === null;
  }
  projectionAborted(owner: object, receipt: object, recovery: object): boolean {
    const e = this.owners.get(owner), child = e?.projection;
    return !!e && !!child && this.entry === e && e.generation === this.options.generation() && child.generation === e.generation
      && e.status !== 'active' && e.status !== 'completed' && child.committedRevision === null && child.outcome?.receipt === receipt && child.aborted === recovery;
  }
  recoverProjectionAbort(): boolean {
    const e = this.entry, child = e?.projection, controller = this.projectionController;
    if (!e || !child || !controller || !child.outcome || child.committedRevision !== null || e.status === 'active' || e.status === 'completed' || e.generation !== this.options.generation() || e.cleanupFailed) return false;
    if (child.aborted) {
      if (child.restoreRequested) return false;
      child.restoreRequested = this.options.projectionRestore?.() === true; return child.restoreRequested;
    }
    try {
      const actual = this.options.atomic!(() => snapshot => ({ value: snapshot }));
      if (this.entry !== e || e.generation !== this.options.generation() || actual.generation !== e.generation
        || semanticFingerprint(actual.game) !== e.expectedGame || semanticFingerprint(actual.content) !== e.contentIdentity
        || !actual.lifecycle.mapData || !actual.lifecycle.sceneTransition?.started || actual.lifecycle.sceneTransition.nextScene !== null || actual.lifecycle.travelPlayer?.transferring !== false) return false;
      child.aborted = Object.freeze({});
      if (!Reflect.apply(resetAbort, controller, [child.outcome.receipt, child.aborted])) { child.aborted = null; return false; }
      Reflect.apply(resetRecover, controller, []);
      if (this.entry !== e || e.generation !== this.options.generation()) return false;
      child.restoreRequested = this.options.projectionRestore?.() === true; return true;
    } catch { return false; }
  }
  /** Known parent-book query. This records admission history, including a failed/terminal child;
   * no provider, native observation or pending-checkpoint data can manufacture this membership. */
  hasBattleAdmission(handle: object, battleId: string, rawHash: string, generation: number): boolean {
    const e = this.entry, origin = e?.admission?.origin;
    return !!e && this.owners.get(e.owner) === e && e.generation === generation && e.context.battleHandle === handle
      && e.context.kind === 'battle' && origin?.kind === 'battle' && origin.battleId === battleId && origin.rawHash === rawHash;
  }
  /** Only this parent's issued record proves that a consumed D source was admitted. */
  hasFieldAdmission(sourceId: string, generation: number): boolean {
    const e = this.entry, origin = e?.admission?.origin;
    return !!e && this.owners.get(e.owner) === e && e.generation === generation
      && e.context.kind === 'field' && origin?.kind === 'field' && origin.sourceId === sourceId;
  }
  /** Called synchronously by the actual parent while it still owns its consumed settlement/step. */
  admit(origin: BlackoutOrigin, battleHandle: object | null, ancestor: BlackoutTransferAncestor | null = null): BlackoutRunResult | null {
    return this.start(origin, battleHandle, ancestor, false);
  }
  /** World checked its actual idle joint observation; callers get a result, never this owner. */
  checkField(sourceId: string): Promise<BlackoutRunResult> {
    const result = this.start({ kind: 'field', sourceId }, null, null, false);
    return result ? Promise.resolve(result) : this.entry?.promise ?? Promise.resolve({ status: 'failed', reason: 'blackout-not-started' });
  }
  recover(): Promise<BlackoutRunResult> {
    const completed = this.entry;
    if (completed?.status === 'completed' && completed.presentationCleanupFailed && completed.generation === this.options.generation()) {
      try {
        done(this.options.host!.leaveField?.(completed.owner) ?? { status: 'done' });
        completed.presentationCleanupFailed = false;
        completed.result = { status: completed.receipt ? 'arrived' : 'completed' }; return Promise.resolve(completed.result);
      } catch (error) { return Promise.resolve({ status: 'failed', reason: `blackout-presentation-cleanup:${why(error)}` }); }
    }
    if (this.entry?.cleanupFailed) { this.release(this.entry); if (this.entry?.cleanupFailed) return Promise.resolve({ status: 'failed', reason: 'blackout-native-retirement-failed' }); }
    if (this.entry?.status === 'active') return this.entry.promise ?? Promise.resolve({ status: 'failed', reason: 'blackout-starting' });
    const started = this.start(null, null, null, true);
    return this.entry?.promise ?? Promise.resolve(started ?? { status: 'failed', reason: 'blackout-not-started' });
  }
  private start(origin: BlackoutOrigin | null, battleHandle: object | null, ancestor: BlackoutTransferAncestor | null, resume: boolean): BlackoutRunResult | null {
    if (this.active) return { status: 'failed', reason: 'blackout-operation-active' };
    if (!this.enabled) return { status: 'failed', reason: 'blackout-host-or-atomic-unavailable' };
    const starting = {}, generation = this.options.generation(); this.starting = starting;
    try {
      const first = this.options.atomic!(() => actual => ({ value: actual }));
      if (this.starting !== starting || generation !== this.options.generation()) throw Error('blackout-admission-stale');
      const life = first.lifecycle, point = life.playerPosition;
      if (!point || !life.travelPlayer || life.mapData === undefined || life.travelLease?.registry !== this.registry) throw Error('blackout-native-source-unavailable');
      if (resume ? !first.game.world.pendingReturn : first.game.world.pendingReturn !== null) throw Error('blackout-checkpoint-conflict');
      if (origin?.kind === 'field' && first.game.party.some(member => !member.isEgg && member.hp > 0)) throw Error('blackout-party-capable');
      const configuration = this.options.host!.configuration();
      semanticFingerprint(configuration);
      if (!configuration || !Object.hasOwn(configuration, 'characterHome') || !Object.hasOwn(configuration, 'globalHome')
        || configuration.characterHome !== null && !isTravelLocation(configuration.characterHome) || configuration.globalHome !== null && !isTravelLocation(configuration.globalHome)) throw Error('blackout-configuration-invalid');
      const owner = Object.freeze({});
      const context: BlackoutSourceContext = Object.freeze({ generation, kind: resume ? 'resume' : origin!.kind, map: life.map, mapId: life.mapId, player: life.player, scene: life.scene, x: point.x, y: point.y,
        data: life.mapData, birth: life.travelLease.mapBirth?.birth ?? null, battleHandle, ancestor: ancestor ? Object.freeze({ ...ancestor }) : null });
      const admission: BlackoutAdmission | null = resume ? null : { origin: clone(origin!), returnId: `blackout:${generation}:${++this.sequence}`, characterHome: clone(configuration.characterHome), globalHome: clone(configuration.globalHome) };
      const e: Entry = { owner, generation, context, admission, initial: life, contentIdentity: semanticFingerprint(first.content), expectedGame: semanticFingerprint(first.game), source: null, lease: null,
        operation: null, receipt: null, map: null, arrival: null, arrivalFrame: null, status: 'active', cleanupFailed: false, sourceBound: false, preparing: false, entering: false, projection: null, completion: null, completionBranch: null, promise: null, result: null, notified: false, presentationCleanupFailed: false };
      this.entry = e; this.owners.set(owner, e); e.operation = this.makeOperation(e);
      // A fresh field entry has not settled yet. Runtime ownership blocks saves while
      // its messages/fade wait; never serialize it as an already-settled schema-11 CP.
      if (context.kind !== 'field') {
        const primed = e.operation!.prime();
        if (primed) { e.result = primed; return primed; }
      }
      done(this.options.host!.armSource(owner, context)); this.observe(e);
      if (context.ancestor) { done(this.options.host!.adoptDeferredSave(owner, context.ancestor)); this.observe(e); }
      e.promise = this.execute(e); return null;
    } catch (error) {
      const e = this.entry;
      if (e && e.generation === generation && e.status === 'active') { e.result = { status: 'failed', reason: why(error) }; e.operation!.cancel(); }
      return { status: 'failed', reason: why(error) };
    } finally { if (this.starting === starting) this.starting = null; }
  }
  private async execute(e: Entry): Promise<BlackoutRunResult> {
    try {
      done(await this.options.host!.waitSource(e.owner, e.context)); this.current(e);
      this.bindSource(e);
      if (e.context.kind === 'field') {
        const enter = this.options.host!.enterField;
        if (!enter) throw Error('blackout-field-presentation-unavailable');
        e.entering = true;
        try { done(await Reflect.apply(enter, this.options.host, [e.owner])); this.observe(e); }
        finally { e.entering = false; }
        const primed = e.operation!.prime();
        if (primed) return primed;
      }
      this.options.sourceEntries({ before: game => { this.current(e); if (semanticFingerprint(game) !== e.expectedGame) throw Error('blackout-source-prefix-changed'); },
        install: (next, current, content) => this.access(e, () => actual => {
          current();
          if (semanticFingerprint(content) !== e.contentIdentity || validateGameContent(next, actual.content).length) throw Error('blackout-source-prefix-invalid');
          e.expectedGame = semanticFingerprint(next); return { value: undefined, next };
        }),
        applied: game => { this.current(e); if (semanticFingerprint(game) !== e.expectedGame) throw Error('blackout-source-prefix-install-mismatch'); this.observe(e); } });
      const result = await e.operation!.run();
      if (this.entry === e && e.generation === this.options.generation() && !e.result) e.result = result;
      if (e.status === 'completed') this.notifyComplete(e);
      return e.result ?? result;
    } catch (error) {
      if (this.entry === e && e.generation === this.options.generation() && e.status === 'active') { e.result = { status: 'failed', reason: why(error) }; e.operation!.cancel(); }
      return e.result ?? { status: 'failed', reason: why(error) };
    }
  }
  private bindSource(e: Entry): void {
    this.options.atomic!(() => { this.current(e); return actual => {
      this.current(e);
      if (semanticFingerprint(actual.game) !== e.expectedGame || semanticFingerprint(actual.content) !== e.contentIdentity || actual.generation !== e.generation) throw Error('blackout-source-state-changed');
      const life = actual.lifecycle, snapshot = life.travelLease, birth = snapshot?.mapBirth, frame = birth?.frame, handoff = snapshot?.sourceHandoff;
      if (snapshot?.registry !== this.registry || !birth || !frame || frame.map !== life.map || frame.mapId !== life.mapId || frame.player !== life.player || frame.data !== life.mapData || birth.scene !== life.scene
        || !life.playerPosition || !life.travelPlayer || life.travelPlayer.transferring || !life.sceneTransition?.started || life.sceneTransition.nextScene !== null) throw Error('blackout-source-map-not-ready');
      const existing = sameFrame(life, e.initial) && e.context.birth === birth.birth && e.initial.travelLease?.mapBirth?.queue === birth.queue;
      const handed = handoff?.owner === e.owner && handoff.context === e.context && handoff.generation === e.generation && handoff.sourceScene === e.context.scene && handoff.phase === 'ready'
        && handoff.target?.birth === birth.birth && handoff.target.queue === birth.queue && handoff.target.scene === birth.scene && handoff.target.frame?.data === life.mapData;
      if (!existing && !handed) throw Error('blackout-source-handoff-unissued');
      e.source = life; e.sourceBound = true; return { value: undefined };
    }; });
  }
  private release(e: Entry): void {
    if (this.entry !== e || e.generation !== this.options.generation() || e.status === 'completed') return;
    if (this.projectionController) Reflect.apply(resetCancel, this.projectionController, [e.owner]);
    let failed = false;
    try { if (e.context.kind === 'field') done(this.options.host!.leaveField?.(e.owner) ?? { status: 'done' }); } catch { failed = true; }
    e.status = e.result?.status === 'cancelled' ? 'cancelled' : 'failed';
    try { if (e.receipt) done(this.options.travel!.retireTransfer(e.owner, e.receipt)); } catch { failed = true; }
    if (this.entry !== e || e.generation !== this.options.generation()) return;
    try { done(this.options.host!.retireSource(e.owner, e.context)); } catch { failed = true; }
    if (this.entry !== e || e.generation !== this.options.generation()) return;
    e.cleanupFailed = failed;
    if (!failed) { this.options.released(); this.recoverProjectionAbort(); }
  }
  private notifyComplete(e: Entry): void {
    if (e.notified || this.entry !== e || e.generation !== this.options.generation() || e.status !== 'completed') return;
    e.notified = true;
    // A visual/audio cleanup exception cannot consume or suppress the genuine
    // native terminal/save notification. Explicit recovery retries only cleanup.
    try { if (e.context.kind === 'field') done(this.options.host!.leaveField?.(e.owner) ?? { status: 'done' }); }
    catch (error) { e.presentationCleanupFailed = true; e.result = { status: 'failed', reason: `blackout-presentation-cleanup:${why(error)}` }; }
    try {
      if (e.receipt) done(this.options.host!.transferCompleted(e.owner, e.receipt));
      else {
        if (!e.completion || !this.isNonTransferComplete(e.owner, e.completion)) throw Error('blackout-nontransfer-completion-unissued');
        const notify = this.options.host!.nonTransferCompleted;
        if (typeof notify !== 'function') throw Error('blackout-nontransfer-notification-unavailable');
        done(Reflect.apply(notify, this.options.host, [e.owner, e.completion]));
      }
    } catch (error) { e.result = { status: 'failed', reason: `blackout-terminal-notification:${why(error)}` }; }
    this.options.released();
  }
  isOwner(owner: object): boolean { const e = this.owners.get(owner); return !!e && this.entry === e && e.status === 'active' && e.generation === this.options.generation(); }
  hasReceipt(receipt: object): boolean { return this.issued.has(receipt); }
  /** Membership remains valid in the native-arrived/confirm-not-yet-called interval.
   * Movement preflight and arrival commit retain their separate full atomic observations. */
  isReceipt(owner: object, receipt: object): boolean { const e = this.issued.get(receipt); return !!e && e.owner === owner && e.receipt === receipt && this.isOwner(owner); }
  isPreparing(owner: object): boolean { const e = this.owners.get(owner); return !!e && e.preparing && this.isOwner(owner); }
  isFieldCheckPending(sourceId: string): boolean { const e = this.entry; return !!e && e.admission?.origin.kind === 'field' && e.admission.origin.sourceId === sourceId && this.isOwner(e.owner); }
  isEntering(owner: object): boolean {
    const e = this.owners.get(owner);
    if (!e || !e.entering || e.context.kind !== 'field' || !this.isOwner(owner)) return false;
    try { this.observe(e); return true; } catch { return false; }
  }
  isSourceContext(owner: object, context: unknown): boolean { const e = this.owners.get(owner); return !!e && e.context === context && this.isOwner(owner); }
  isAncestor(owner: object, parent: object, receipt: object): boolean { const e = this.owners.get(owner); return !!e && this.isOwner(owner) && e.context.ancestor?.owner === parent && e.context.ancestor.receipt === receipt; }
  isComplete(owner: object, receipt: object): boolean { const e = this.issued.get(receipt); return !!e && e.owner === owner && this.entry === e && e.status === 'completed' && e.generation === this.options.generation(); }
  isNonTransferComplete(owner: object, completion: object): boolean {
    const e = this.completions.get(completion);
    return !!e && e.owner === owner && e.completion === completion && this.entry === e && e.status === 'completed'
      && e.receipt === null && (e.completionBranch === 'no-home' || e.completionBranch === 'home-map-missing')
      && e.generation === this.options.generation();
  }
  canPerform(owner: object, receipt: TravelReceipt): boolean {
    const e = this.issued.get(receipt);
    if (!e || e.owner !== owner || !this.isOwner(owner)) return false;
    try { const actual = this.observe(e); return actual.checkpoint?.phase === 'awaiting-arrival' && e.receipt === receipt; } catch { return false; }
  }
  confirm(owner: object, receipt: TravelReceipt, observed: TravelArrival) {
    const e = this.issued.get(receipt);
    if (!e || e.owner !== owner || e.generation !== this.options.generation() || this.entry !== e) return { status: 'refused' as const, reason: 'blackout-unissued-arrival' };
    if (e.status === 'completed') return { status: 'duplicate' as const };
    if (!this.isOwner(owner)) return { status: 'refused' as const, reason: 'blackout-owner-stale' };
    try {
      readArrival(observed);
      const native = this.options.travel!.observeNow(); this.current(e);
      if (native.status !== 'value' || !same(readArrival(native.value), observed)) throw Error('blackout-native-observation-mismatch');
      const actual = this.options.atomic!(() => facts => ({ value: facts })); this.current(e);
      if (semanticFingerprint(actual.game) !== e.expectedGame || semanticFingerprint(actual.content) !== e.contentIdentity || actual.generation !== e.generation) throw Error('blackout-arrival-state-changed');
      const lease = actual.lifecycle.travelLease?.current;
      if (!lease || actual.lifecycle.travelLease?.registry !== this.registry || lease.owner !== owner || lease.receipt !== receipt || lease.phase !== 'arrived' || lease.sourceScene !== e.source?.scene || lease.scene !== actual.lifecycle.scene
        || lease.player !== actual.lifecycle.player || !at(actual.lifecycle, receipt) || observed.transferPending || !same(observed.actual, receipt.target) || actual.lifecycle.travelPlayer?.transferring) throw Error('blackout-native-arrival-proof-required');
      if (e.lease && (e.lease.serial !== lease.serial || e.lease.lease !== lease.lease)) throw Error('blackout-native-arrival-lease-changed');
      e.lease = lease; e.arrival = clone(observed); e.arrivalFrame = actual.lifecycle;
      const result = e.operation!.confirmArrival(receipt, { returnId: actual.game.world.pendingReturn!.id, actual: clone(observed.actual), transferPending: observed.transferPending, targetMap: { status: 'exists', width: observed.loadedGeometry.width, height: observed.loadedGeometry.height } });
      if (result.status !== 'refused') this.notifyComplete(e);
      return result;
    } catch (error) { e.result = { status: 'failed', reason: why(error) }; e.operation!.transferFailed(receipt, why(error)); return { status: 'refused' as const, reason: why(error) }; }
  }
  finish(receipt: TravelReceipt): Promise<BlackoutRunResult> { const e = this.issued.get(receipt); return e && e.generation === this.options.generation() ? e.status !== 'active' && e.result ? Promise.resolve(e.result) : e.promise ?? Promise.resolve({ status: 'failed', reason: 'blackout-not-started' }) : Promise.resolve({ status: 'failed', reason: 'blackout-unissued-receipt' }); }
  transferFailed(owner: object, receipt: TravelReceipt, reason: string): void { const e = this.issued.get(receipt); if (e && e.owner === owner && this.isOwner(owner)) { e.result = { status: 'failed', reason }; e.operation!.transferFailed(receipt, reason); } }
  deferSave(): boolean { return !!this.entry && this.isOwner(this.entry.owner); }
  ownsEntry(entry: WorldMapEntry, scene: object): boolean {
    const e = this.entry;
    if (!e || e.generation !== this.options.generation()) return false;
    try { semanticFingerprint(entry); } catch { return false; }
    if (e.receipt && e.arrival && e.status === 'completed') return e.lease?.scene === scene && entry.mapId === e.receipt.target.mapId && entry.previousMapId === e.source?.mapId;
    return false;
  }
  cancel(): BlackoutRunResult { const e = this.entry; if (!e || e.status !== 'active') return e?.result ?? { status: 'cancelled' }; e.result = { status: 'cancelled' }; e.operation!.cancel(); return e.result; }
  invalidate(): void {
    const e = this.entry; this.entry = null;
    if (this.projectionController) Reflect.apply(resetInvalidate, this.projectionController, []);
    this.options.projectionReset?.(); this.starting = null;
    if (!e) return;
    // The host checks its captured generation/native lease; a replacement game's
    // screen/audio are never cleanup targets for this revoked entry.
    try { if (e.context.kind === 'field') this.options.host?.leaveField?.(e.owner, 'timeline-replaced'); } catch { /* new generation remains authoritative */ }
    e.status = 'cancelled';
    // Revoke App authority first, then retire only the real old native receipt. Never clear by coordinates.
    if (e.receipt) { try { this.options.travel?.retireTransfer(e.owner, e.receipt); } catch { /* the old native producer still rejects its revoked owner */ } }
    try { this.options.host?.retireSource(e.owner, e.context); } catch { /* new generation remains authoritative */ }
  }
}
