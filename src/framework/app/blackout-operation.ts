/** F's internal control leaf. Its trusted parent owns admission, writes, leases and save gating.
 * Schema-11 checkpoints are persistent work; the actual parent still owns production integration.
 * No constructor/run argument from a host can authenticate a battle or completed step.
 */
import { planBlackoutReturn, selectBlackoutDestination, confirmBlackoutArrival, planBlackoutResume, validateBlackoutTarget } from '../rules/blackout';
import type { BlackoutMapResource, BlackoutDestination, BlackoutSelection, BlackoutTransferObservation } from '../rules/blackout';
import type { PendingBlackoutReturn } from '../rules/world-state';
import { readBlackoutCheckpoint } from '../rules/blackout-checkpoint';
import type { BlackoutOrigin, BlackoutCheckpoint } from '../rules/blackout-checkpoint';
import type { WorldLocation } from '../rules/world-data';
import type { Content } from '../rules/types';
import type { GameState } from '../rules/state';
import { healParty } from '../rules/heal';
import { bumpStat } from '../rules/stats';
import { clone } from '../rules/value';
import { semanticFingerprint } from '../rules/semantic';

export type { BlackoutPhase, BlackoutCheckpoint } from '../rules/blackout-checkpoint';
export { readBlackoutCheckpoint } from '../rules/blackout-checkpoint';
export interface BlackoutAdmission {
  /** Issued by the existing parent from its consumed outcome/completed-step context. */
  origin: BlackoutOrigin;
  returnId: string;
  characterHome: WorldLocation | null;
  globalHome: WorldLocation | null;
}
export interface BlackoutObservation {
  owner: object | null;
  generation: number;
  game: GameState;
  content: Content;
  checkpoint: BlackoutCheckpoint | null;
  /** Null for resume. Battle issuance requires ledger + final outcome + no pending lateHeal/evolution/reception;
   * field issuance requires the actual current completed-step/poison parent. Never construct from host IDs. */
  admission: BlackoutAdmission | null;
}
export interface BlackoutTransferReceipt {
  readonly token: string;
  readonly generation: number;
  readonly target: Readonly<WorldLocation>;
}
export interface BlackoutWrite {
  game: GameState;
  checkpoint: BlackoutCheckpoint | null;
  /** 'arrived' also applies the deduplicated owned map-entry transition in the same parent boundary. */
  terminal: 'arrived' | 'complete' | null;
}
export interface BlackoutLease { readonly owner: object; readonly generation: number }
export interface BlackoutParent {
  /** Materialized joint facts after all reentrant providers/lifetime checks, never getter-backed facts. */
  observe(): BlackoutObservation;
  /** The actual state writer invokes this PURE transform on its final joint facts. No reentrant work
   * between transform, install and synchronous retirement of the ENTIRE parent chain. Throw => no install.
   * An arrived write uses the issued E3 receipt/entry dedupe gate; PSWorld stays the sole enter producer.
   * Parent returns the actual installed snapshot (owner=null on a terminal write). */
  commitBlackout(transform: (actual: BlackoutObservation) => BlackoutWrite): BlackoutObservation;
  /** Registers an immutable receipt in the EXISTING owner/transfer registry; receipt shape conveys no permission. */
  issueTransfer(owner: object, generation: number, checkpoint: BlackoutCheckpoint): BlackoutTransferReceipt;
  /** Nonthrowing, idempotent retirement of only this execution and its children, retaining any checkpoint for saving. */
  release(owner: object, generation: number): void;
}
export type BlackoutEffectResult = { status: 'done' } | { status: 'failed'; reason: string };
export interface BlackoutHost {
  /** Independent preload, no current-map replacement. E3 adapter retains its loaded handle. */
  preload(target: Readonly<WorldLocation>): Promise<BlackoutMapResource>;
  announce(kind: 'show-return-message' | 'debug-missing-home', checkpoint: Readonly<BlackoutCheckpoint>): Promise<BlackoutEffectResult>;
  /** Idempotent ordered prefix: cancel vehicles, clear companion projection, starting-over,
   * set transfer target, get off vehicle. Does not reserve, refresh, enter, or clear escapePoint. */
  prepare(checkpoint: Readonly<BlackoutCheckpoint>): Promise<BlackoutEffectResult>;
  observe(returnId: string): BlackoutTransferObservation;
  /** E3's existing pending-transfer gate and issued receipt are mandatory. */
  reserve(receipt: BlackoutTransferReceipt): BlackoutEffectResult;
  /** Synchronous request-map-refresh after real transfer, before the terminal state write. */
  refresh(receipt: BlackoutTransferReceipt): BlackoutEffectResult;
}
export type BlackoutRunResult =
  | { status: 'awaiting-arrival'; receipt: BlackoutTransferReceipt }
  | { status: 'completed' | 'arrived' | 'cancelled' }
  | { status: 'failed'; reason: string };
export type BlackoutArrivalResult = { status: 'arrived' | 'duplicate' } | { status: 'refused'; reason: string };
const why = (error: unknown): string => error instanceof Error ? error.message : String(error);
const same = (a: unknown, b: unknown): boolean => semanticFingerprint(a) === semanticFingerprint(b);

function data(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid-blackout-checkpoint');
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) throw Error('invalid-blackout-checkpoint');
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) throw Error('invalid-blackout-checkpoint');
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !d.enumerable || !('value' in d)) throw Error('invalid-blackout-checkpoint');
    Object.defineProperty(result, key, { value: d.value, enumerable: true });
  }
  return result;
}
function pending(c: BlackoutCheckpoint): PendingBlackoutReturn {
  if (c.selection.branch === 'no-home' || c.branch !== 'center' && c.branch !== 'home' || c.phase !== 'ready' && c.phase !== 'awaiting-arrival') throw Error('blackout-transfer-not-ready');
  return { id: c.id, origin: clone(c.origin), branch: c.branch, target: clone(c.selection.target), stage: c.phase };
}
function done(result: BlackoutEffectResult): void {
  const r = data(result, Object.getOwnPropertyDescriptor(result ?? {}, 'status')?.value === 'failed' ? ['status', 'reason'] : ['status']);
  if (r.status === 'done') return;
  throw Error(r.status === 'failed' && typeof r.reason === 'string' ? r.reason : 'invalid-blackout-host-result');
}

export class BlackoutOperation {
  private readonly owner: object;
  private readonly generation: number;
  private expected: BlackoutObservation | null = null;
  private promise: Promise<BlackoutRunResult> | null = null;
  private terminal: BlackoutRunResult | null = null;
  private receipt: BlackoutTransferReceipt | null = null;
  private confirming = false;
  private arrivedReceipt: BlackoutTransferReceipt | null = null;
  private readonly parent: BlackoutParent;
  private readonly host: BlackoutHost;
  /** Parent supplies its already-issued lease, captured before run may queue. Never adopt a later owner. */
  constructor(parent: BlackoutParent, host: BlackoutHost, lease: BlackoutLease) {
    this.parent = parent; this.host = host; this.owner = lease.owner; this.generation = lease.generation;
  }

  /** Runtime execution state only: the existing parent decides save gating. */
  run(): Promise<BlackoutRunResult> {
    if (this.terminal) return Promise.resolve(this.terminal);
    if (!this.promise) this.promise = Promise.resolve().then(() => this.execute());
    return this.promise;
  }
  cancel(): BlackoutRunResult {
    if (this.terminal) return this.terminal;
    this.terminal = { status: 'cancelled' };
    if (this.owner) this.parent.release(this.owner, this.generation);
    return this.terminal;
  }
  /** Used by the E3 owner's receipt gate; no host may authorize by copying its fields. */
  isCurrent(receipt: BlackoutTransferReceipt): boolean {
    if (this.terminal || this.receipt !== receipt) return false;
    try { this.observe(); return true; } catch { return false; }
  }
  private check(actual: BlackoutObservation): void {
    if (this.terminal) throw Error('blackout-execution-ended');
    if (!this.owner || actual.owner !== this.owner || actual.generation !== this.generation) throw Error('blackout-owner-stale');
    if (!this.expected || !same(actual.game, this.expected.game)) throw Error('blackout-state-changed');
    if (!same(actual.content, this.expected.content)) throw Error('blackout-content-changed');
    if (!same(actual.checkpoint, this.expected.checkpoint) || !same(actual.admission, this.expected.admission)) throw Error('blackout-context-changed');
  }
  private observe(): BlackoutObservation { const actual = this.parent.observe(); this.check(actual); return actual; }
  private remember(actual: BlackoutObservation): void {
    this.expected = { ...actual, game: clone(actual.game), content: clone(actual.content), checkpoint: actual.checkpoint ? readBlackoutCheckpoint(actual.checkpoint) : null, admission: clone(actual.admission) };
  }
  private commit(update: (actual: BlackoutObservation) => BlackoutWrite): void {
    const installed = this.parent.commitBlackout(actual => { this.check(actual); return update(actual); });
    this.remember(installed);
  }
  private fail(reason: string): BlackoutRunResult {
    if (this.terminal) return this.terminal;
    this.terminal = { status: 'failed', reason };
    if (this.owner) this.parent.release(this.owner, this.generation);
    return this.terminal;
  }
  private checkpoint(): BlackoutCheckpoint {
    const c = this.observe().checkpoint;
    if (!c) throw Error('missing-blackout-checkpoint');
    return readBlackoutCheckpoint(c);
  }
  private async load(c: BlackoutCheckpoint): Promise<BlackoutMapResource> {
    if (c.selection.branch === 'no-home') throw Error('blackout-has-no-target');
    this.observe();
    const resource = await this.host.preload(clone(c.selection.target));
    this.observe();
    return resource;
  }
  private hostObservation(c: BlackoutCheckpoint): BlackoutTransferObservation {
    const observed = this.host.observe(c.id); this.observe();
    if (observed.returnId !== c.id) throw Error('return-id-mismatch');
    if (typeof observed.transferPending !== 'boolean') throw Error('invalid-transfer-observation');
    if (observed.transferPending) throw Error('host-transfer-pending');
    // This geometry belongs to the current map. Never validate a different destination against it.
    const actual = validateBlackoutTarget(observed.actual, observed.targetMap);
    if (actual.status === 'refused') throw Error(actual.reason);
    return observed;
  }
  private issue(c: BlackoutCheckpoint): BlackoutTransferReceipt {
    if (!this.owner) throw Error('blackout-owner-stale');
    const receipt = this.parent.issueTransfer(this.owner, this.generation, clone(c));
    this.observe();
    const p = pending(c);
    if (typeof receipt.token !== 'string' || !receipt.token.length || receipt.generation !== this.generation || !same(receipt.target, p.target)) throw Error('invalid-blackout-transfer-receipt');
    this.receipt = receipt;
    return receipt;
  }
  /** Persist the initial announce checkpoint synchronously before a native Scene handoff.
   * Repeated calls observe the same work and never replay field healing/statistics. */
  prime(): BlackoutRunResult | null {
    if (this.terminal) return this.terminal;
    try {
      const initial = this.parent.observe();
      if (initial.owner !== this.owner || initial.generation !== this.generation || !Number.isSafeInteger(this.generation) || this.generation < 0) throw Error('blackout-not-admitted');
      this.remember(initial);
      if (!initial.checkpoint) {
        this.commit(actual => {
          const a = actual.admission;
          if (!a) throw Error('blackout-not-admitted');
          const selection = selectBlackoutDestination({ world: actual.game.world, characterHome: a.characterHome, globalHome: a.globalHome });
          if (selection.status === 'refused') throw Error(selection.reason);
          const c = readBlackoutCheckpoint({ id: a.returnId, origin: a.origin, selection: selection.selection, phase: 'announce', branch: null });
          let game = actual.game;
          if (c.origin.kind === 'battle') {
            const ledger = Object.hasOwn(game.appliedBattles, c.origin.battleId) ? game.appliedBattles[c.origin.battleId] : undefined;
            if (!ledger || ledger.hash !== c.origin.rawHash) throw Error('blackout-ledger-mismatch');
          } else {
            // WP61 includes an empty party. Zero capable members is the invariant;
            // the actual current World, not caller DTOs, admits this field check.
            if (game.party.some(m => !m.isEgg && m.hp > 0)) throw Error('blackout-party-capable');
            game = healParty(game, actual.content);
            game.stats = bumpStat(game.stats, 'blacked_out_count');
          }
          return { game, checkpoint: c, terminal: null };
        });
      }
      return null;
    } catch (error) { return this.fail(why(error)); }
  }
  private async execute(): Promise<BlackoutRunResult> {
    if (this.terminal) return this.terminal;
    try {
      const primed = this.prime();
      if (primed) return primed;
      let c = this.checkpoint();
      if (c.origin.kind === 'battle') {
        const game = this.observe().game;
        const ledger = Object.hasOwn(game.appliedBattles, c.origin.battleId) ? game.appliedBattles[c.origin.battleId] : undefined;
        if (!ledger || ledger.hash !== c.origin.rawHash) throw Error('blackout-ledger-mismatch');
      }
      if (c.phase === 'announce') {
        const resource = c.selection.branch === 'no-home' ? null : await this.load(c);
        const plan = planBlackoutReturn({ origin: c.origin, world: { recentCenter: c.selection.branch === 'center' ? c.selection.target : null }, characterHome: c.selection.branch === 'home' ? c.selection.target : null, mapResource: () => resource ?? { status: 'unavailable' } });
        if (plan.status === 'refused') throw Error(plan.reason);
        const branch = plan.plan.destination.branch;
        const result = await this.host.announce(branch === 'home-map-missing' ? 'debug-missing-home' : 'show-return-message', clone(c));
        this.observe(); done(result);
        this.commit(actual => ({ game: actual.game, checkpoint: { ...c, phase: 'prepare', branch }, terminal: null }));
        c = this.checkpoint();
      }
      if (c.phase === 'prepare') {
        if (c.branch === 'no-home' || c.branch === 'home-map-missing') {
          this.commit(actual => {
            const game = clone(actual.game);
            if (c.branch === 'no-home') game.world.escapePoint = null;
            // The pure field branch's second heal is idempotent: our guard disallows intervening state changes.
            return { game, checkpoint: null, terminal: 'complete' };
          });
          this.terminal = { status: 'completed' }; return this.terminal;
        }
        const result = await this.host.prepare(clone(c));
        this.observe(); done(result);
        this.commit(actual => {
          const game = clone(actual.game); game.world.surfing = false; game.world.companions = [];
          return { game, checkpoint: { ...c, phase: 'ready' }, terminal: null };
        });
        c = this.checkpoint();
      }
      const observed = this.hostObservation(c);
      const receipt = this.issue(c);
      if (c.phase === 'awaiting-arrival' && same(observed.actual, receipt.target)) {
        const confirmed = this.confirmArrival(receipt, observed);
        if (confirmed.status === 'refused') throw Error(confirmed.reason);
        return { status: 'arrived' };
      }
      // A new process needs a new E3 preload/handle even when its checkpoint says ready.
      const resource = await this.load(c);
      const plan = planBlackoutReturn({ origin: c.origin, world: { recentCenter: c.selection.branch === 'center' ? c.selection.target : null }, characterHome: c.selection.branch === 'home' ? c.selection.target : null, mapResource: () => resource });
      if (plan.status === 'refused' || plan.plan.destination.branch !== c.branch) throw Error(plan.status === 'refused' ? plan.reason : 'blackout-target-changed');
      const beforeReserve = this.hostObservation(c);
      // At the destination use actual loaded geometry; otherwise the independent target preload is authoritative.
      const checked = planBlackoutResume(pending(c), { ...beforeReserve, targetMap: same(beforeReserve.actual, receipt.target) ? beforeReserve.targetMap : resource });
      if (checked.status === 'refused') throw Error(checked.reason);
      if (checked.status === 'arrived') {
        const confirmed = this.confirmArrival(receipt, beforeReserve);
        if (confirmed.status === 'refused') throw Error(confirmed.reason);
        return { status: 'arrived' };
      }
      done(this.host.reserve(receipt)); this.observe();
      if (c.phase === 'ready') this.commit(actual => ({ game: actual.game, checkpoint: { ...c, phase: 'awaiting-arrival' }, terminal: null }));
      return { status: 'awaiting-arrival', receipt };
    } catch (error) { return this.fail(why(error)); }
  }
  /** Called synchronously ONLY by E3's authenticated receipt callback, or trusted cold resume observation.
   * Parent atomically clears checkpoint/escape, applies owned entry once, and retires all ancestors before return.
   * No promise/microtask stands between this return and onTransferEnd/autosave. */
  confirmArrival(receipt: BlackoutTransferReceipt, observation: BlackoutTransferObservation): BlackoutArrivalResult {
    if (this.arrivedReceipt === receipt) return { status: 'duplicate' };
    if (this.confirming || this.terminal || this.receipt !== receipt) return { status: 'refused', reason: 'stale-blackout-receipt' };
    this.confirming = true;
    try {
      const c = this.checkpoint();
      const result = confirmBlackoutArrival(pending(c), observation);
      if (result.status !== 'arrived') throw Error(result.status === 'refused' ? result.reason : 'arrival-not-confirmed');
      done(this.host.refresh(receipt)); this.observe();
      this.commit(actual => {
        const game = clone(actual.game); game.world.escapePoint = null;
        return { game, checkpoint: null, terminal: 'arrived' };
      });
      this.arrivedReceipt = receipt; this.terminal = { status: 'arrived' };
      return { status: 'arrived' };
    } catch (error) { this.fail(why(error)); return { status: 'refused', reason: why(error) }; }
    finally { this.confirming = false; }
  }
  /** E3 reports perform/confirmation failure; an actual observation never authorizes moving again here. */
  transferFailed(receipt: BlackoutTransferReceipt, reason: string): BlackoutRunResult {
    if (this.receipt !== receipt) return { status: 'failed', reason: 'stale-blackout-receipt' };
    return this.fail(reason);
  }
}
