/** Internal field-item child. Its issuing WorldOperation owns authorization, lifetime and any later battle offer. */
import { advanceFishing, fishingAccelerated, fishingEligibility, fishingEncounterType, startFishing } from '../rules/fishing';
import type { FishingAdvance, FishingClockSample, FishingCompletion, FishingEffect, FishingEncounterType, FishingInterruption, FishingState } from '../rules/fishing';
import type { NoTargetFieldItemAction } from '../rules/field-items';
import { resolveConfig } from '../rules/config';
import { ENVIRONMENT } from '../rules/initial-field';
import { semanticFingerprint } from '../rules/semantic';
import type { GameState } from '../rules/state';
import type { Content } from '../rules/types';
import { clone } from '../rules/value';
import type { WorldFact } from '../rules/world-data';
import type { WorldBusinessFacts } from '../rules/world-state';

export interface FishingPresentationSession {
  run(effect: FishingEffect): void;
  sample(): FishingClockSample;
  dispose(): void;
}
export interface FishingPresentationPort {
  begin(owner: object, emit: (advance: FishingAdvance) => void, config: Readonly<{ beginCommonEventId: number; endCommonEventId: number }>): FishingPresentationSession;
}
export interface FishingOperationFacts {
  readonly facingFishable: WorldFact<boolean>;
  readonly currentExitPassable: WorldFact<boolean>;
  readonly facingEnvironment: WorldFact<keyof typeof ENVIRONMENT>;
  readonly business: WorldBusinessFacts;
}
/** Joint facts from the parent's existing owner registry and state writer, not a transferable permit. */
export interface FishingObservation {
  readonly owner: object | null;
  readonly generation: number;
  readonly game: GameState;
  readonly content: Content;
}
export type FishingStat = 'fishing_count' | 'fishing_battles';
export interface FishingOperationOptions {
  /** Identity supplied by the real parent registry; no structural tag in this module grants authority. */
  readonly owner: object;
  readonly generation: number;
  readonly action: Readonly<Extract<NoTargetFieldItemAction, { kind: 'fishing' }>>;
  /**
   * The parent observes its actual owner/generation, state and content together, after all reentrant
   * providers and its map/lifetime checks. These are materialized data, with no provider-backed getters.
   */
  observe(): FishingObservation;
  /**
   * The sole parent writer increments this stat on its latest state. At its final synchronous install
   * boundary it calls current with the actual pre-install observation. From that call through returning
   * the installed state it invokes no external callbacks/providers. A throw leaves this stat uncommitted.
   * current only inspects these joint facts and this child's local cancellation; it does not call ports.
   */
  commitStat(key: FishingStat, current: (actual: FishingObservation) => void): GameState;
  facts(): FishingOperationFacts;
  /** The parent checks its currently loaded map/version tables; the presentation host never chooses this gate. */
  hasEncounterType(type: FishingEncounterType, game: GameState, content: Content): boolean;
  readonly host: FishingPresentationPort;
  readonly random?: (upperExclusive: number) => number;
}
export interface FishingOperationPrefix { readonly countCommitted: boolean; readonly battlesCommitted: boolean }
/** Data for the parent's internal C consumer. This is neither a battle capability nor a field-effect receipt. */
export interface FishingEncounterIntent {
  readonly kind: 'fishing';
  readonly type: FishingEncounterType;
  readonly rod: 1 | 2 | 3;
  readonly mapId: number;
  readonly facingEnvironment: WorldFact<keyof typeof ENVIRONMENT>;
  readonly business: WorldBusinessFacts;
}
export type FishingOperationOutcome = {
  readonly status: 'completed' | 'cancelled' | 'refused' | 'failed';
  readonly prefix: FishingOperationPrefix;
  readonly cleanup: 'not-started' | 'completed' | 'failed';
  readonly reason?: string;
  readonly completion?: FishingCompletion;
  readonly encounter?: FishingEncounterIntent;
};
const why = (error: unknown): string => error instanceof Error ? error.message : String(error);
function frozen<T>(value: T): T {
  if (value !== null && typeof value === 'object') { for (const child of Object.values(value)) frozen(child); Object.freeze(value); }
  return value;
}
function mapId(facts: FishingOperationFacts): number {
  const map = facts.business.mapId;
  if (map.status !== 'value' || !Number.isSafeInteger(map.value) || map.value <= 0) throw Error('fishing-map-unavailable');
  return map.value;
}
function environment(fact: WorldFact<keyof typeof ENVIRONMENT>): WorldFact<keyof typeof ENVIRONMENT> {
  if (!fact || typeof fact !== 'object') throw Error('invalid-fishing-environment');
  if (fact.status === 'value') {
    if (typeof fact.value !== 'string' || !Object.hasOwn(ENVIRONMENT, fact.value)) throw Error('invalid-fishing-environment');
  } else if (!['absent', 'unavailable', 'invalid'].includes(fact.status)) throw Error('invalid-fishing-environment');
  return clone(fact);
}

export class FishingOperation {
  private readonly options: FishingOperationOptions;
  private readonly queue: FishingAdvance[] = [];
  private readonly prefix = { countCommitted: false, battlesCommitted: false };
  private state: FishingState | null = null;
  private session: FishingPresentationSession | null = null;
  private promise: Promise<FishingOperationOutcome> | null = null;
  private resolve: ((outcome: FishingOperationOutcome) => void) | null = null;
  private stateIdentity: string | undefined;
  private contentIdentity: string | undefined;
  private invalid: string | null = null;
  private interruption: FishingInterruption | null = null;
  private initialMapId = 0;
  private driving = false;
  private done = false;
  constructor(options: FishingOperationOptions) { this.options = { ...options, action: Object.freeze({ ...options.action }) }; }
  private active(): void {
    if (this.interruption) throw Error(`fishing-${this.interruption}`);
    if (this.invalid) throw Error(this.invalid);
  }
  private check(actual: FishingObservation): { game: GameState; content: Content } {
    try {
      this.active();
      if (actual.owner !== this.options.owner || actual.generation !== this.options.generation) throw Error('stale-fishing-parent');
      const { game, content } = actual;
      const stateIdentity = semanticFingerprint(game), contentIdentity = semanticFingerprint(content);
      if (this.stateIdentity !== undefined && this.stateIdentity !== stateIdentity) throw Error('fishing-state-changed');
      if (this.contentIdentity !== undefined && this.contentIdentity !== contentIdentity) throw Error('fishing-content-changed');
      this.stateIdentity = stateIdentity; this.contentIdentity = contentIdentity;
      return { game, content };
    } catch (error) { this.invalid ??= why(error); throw error; }
  }
  private assertCurrent(): { game: GameState; content: Content } {
    this.active();
    return this.check(this.options.observe());
  }
  private commit(key: FishingStat): void {
    this.assertCurrent();
    const next = this.options.commitStat(key, actual => { this.check(actual); });
    this.stateIdentity = semanticFingerprint(next);
    this.prefix[key === 'fishing_count' ? 'countCommitted' : 'battlesCommitted'] = true;
    this.assertCurrent();
  }
  run(): Promise<FishingOperationOutcome> {
    if (this.promise) return this.promise;
    this.promise = new Promise(resolve => { this.resolve = resolve; });
    Promise.resolve().then(() => this.start()).catch(error => this.abort(error));
    return this.promise;
  }
  cancel(reason: 'cancelled' | 'scene-closed' = 'cancelled'): Promise<FishingOperationOutcome> {
    if (!this.done) {
      this.interruption ??= reason;
      if (this.state) this.receive({ sample: this.clockSample(), interrupt: reason });
    }
    return this.run();
  }
  private clockSample(): FishingClockSample {
    try { if (this.session) return this.session.sample(); } catch { /* A failing presentation can still receive owned restoration using the reached rule sample. */ }
    return this.state ? { monotonicMs: this.state.clock.monotonicMs, active: this.state.clock.active } : { monotonicMs: 0, active: false };
  }
  private start(): void {
    if (this.done) return;
    if (this.interruption) { this.finish({ status: 'cancelled', cleanup: 'not-started', reason: this.interruption }); return; }
    const options = this.options, { game, content } = this.assertCurrent();
    if (options.action.kind !== 'fishing') throw Error('not-a-fishing-action');
    const type = fishingEncounterType(options.action.rod), facts = options.facts(); this.assertCurrent();
    this.initialMapId = mapId(facts);
    const eligibility = fishingEligibility({ facingFishable: facts.facingFishable, currentExitPassable: facts.currentExitPassable,
      surfing: { status: 'value', value: game.world.surfing } });
    if (!eligibility.allowed) { this.finish({ status: 'refused', reason: eligibility.reason, cleanup: 'not-started' }); return; }
    const allowBite = options.hasEncounterType(type, game, content); this.assertCurrent();
    if (typeof allowBite !== 'boolean') throw Error('invalid-fishing-table-gate');
    const config = resolveConfig(content.settings);
    const ruleOptions = { rod: options.action.rod, allowBite, accelerated: fishingAccelerated(game.party), autoHook: config.FISHING_AUTO_HOOK,
      surfing: game.world.surfing, exclamationAnimationId: config.EXCLAMATION_ANIMATION_ID };
    this.commit('fishing_count');
    this.session = options.host.begin(options.owner, input => this.receive(input), Object.freeze({ beginCommonEventId: config.FISHING_BEGIN_COMMON_EVENT, endCommonEventId: config.FISHING_END_COMMON_EVENT }));
    this.assertCurrent();
    const transition = startFishing(ruleOptions, this.session.sample()); this.state = transition.state;
    this.publish(transition.effects);
    this.drain();
  }
  private receive(input: FishingAdvance): void {
    if (this.done) return;
    this.queue.push(input); this.drain();
  }
  private drain(): void {
    if (this.driving || !this.state || this.done) return;
    this.driving = true;
    try {
      while (this.queue.length && !this.done) {
        const input = this.queue.shift()!;
        if (this.state.phase !== 'restoring') {
          try { this.assertCurrent(); }
          catch (error) { this.invalid ??= why(error); this.interruption ??= 'scene-closed'; }
        }
        const advance = this.interruption && this.state.phase !== 'restoring' ? { sample: input.sample, interrupt: this.interruption }
          : this.state.phase === 'restoring' ? { sample: input.sample, effect: input.effect } : input;
        const next = advanceFishing(this.state, advance, upper => {
          this.assertCurrent(); if (!this.options.random) throw Error('no-random');
          const value = this.options.random(upper); this.assertCurrent(); return value;
        });
        this.state = next.state; this.publish(next.effects);
      }
    } catch (error) { this.abort(error); }
    finally { this.driving = false; }
    if (this.queue.length && !this.done) this.drain();
  }
  private publish(effects: readonly FishingEffect[]): void {
    for (const effect of effects) {
      if (this.done) return;
      if (effect.kind === 'finished') { this.completed(effect.completion); return; }
      if (!this.session) throw Error('fishing-presentation-unavailable');
      try { this.session.run(frozen(clone(effect))); }
      catch (error) {
        if ('id' in effect) this.receive({ sample: this.clockSample(), effect: { id: effect.id, status: 'failed' } });
        else throw error;
      }
    }
  }
  private abort(error: unknown): void {
    if (this.done) return;
    this.invalid ??= why(error);
    if (!this.state || !this.session) {
      let cleanup: FishingOperationOutcome['cleanup'] = 'not-started';
      if (this.session) { try { this.session.dispose(); cleanup = 'completed'; } catch { cleanup = 'failed'; } }
      this.finish({ status: this.interruption === 'cancelled' ? 'cancelled' : 'failed', reason: this.invalid, cleanup }); return;
    }
    if (this.state.phase === 'restoring') {
      const pending = this.state.pending;
      if (pending) {
        const next = advanceFishing(this.state, { sample: { monotonicMs: this.state.clock.monotonicMs, active: this.state.clock.active }, effect: { id: pending.id, status: 'failed' } }, () => { throw Error('restore-must-not-draw'); });
        this.state = next.state; this.publish(next.effects); return;
      }
    }
    const next = advanceFishing(this.state, { sample: { monotonicMs: this.state.clock.monotonicMs, active: this.state.clock.active }, interrupt: 'host-failed' }, () => { throw Error('interrupt-must-not-draw'); });
    this.state = next.state; this.publish(next.effects);
    // publish may synchronously queue a failed restoration while drain owns the loop.
    if (!this.driving) this.drain();
  }
  private completed(completion: FishingCompletion): void {
    let cleanupFailed = completion.cleanupFailed;
    try { this.session?.run({ kind: 'finished', completion }); } catch { cleanupFailed = true; }
    try { this.session?.dispose(); } catch { cleanupFailed = true; }
    const cleanup = cleanupFailed ? 'failed' as const : 'completed' as const;
    if (completion.status !== 'completed' || cleanupFailed || this.interruption || this.invalid) {
      this.finish({ status: this.interruption === 'cancelled' || completion.reason === 'cancelled' ? 'cancelled' : 'failed',
        reason: this.invalid ?? this.interruption ?? completion.reason ?? 'fishing-cleanup-failed', completion, cleanup }); return;
    }
    try {
      this.assertCurrent();
      if (!completion.caught) { this.finish({ status: 'completed', completion, cleanup }); return; }
      this.commit('fishing_battles');
      const facts = this.options.facts(); this.assertCurrent();
      if (mapId(facts) !== this.initialMapId) throw Error('fishing-map-changed');
      const encounter: FishingEncounterIntent = frozen({ kind: 'fishing', type: completion.encounterType, rod: this.options.action.rod, mapId: this.initialMapId,
        facingEnvironment: environment(facts.facingEnvironment), business: clone(facts.business) });
      this.finish({ status: 'completed', completion, cleanup, encounter });
    } catch (error) { this.finish({ status: this.interruption === 'cancelled' ? 'cancelled' : 'failed', reason: why(error), completion, cleanup }); }
  }
  private finish(outcome: Omit<FishingOperationOutcome, 'prefix'>): void {
    if (this.done) return;
    this.done = true; this.queue.length = 0;
    this.resolve?.(frozen({ ...outcome, prefix: { ...this.prefix } }));
  }
}
