/** Ordered event companions, under the real parent's existing lease/atomic writer.
 * Native follower visibility is derived from CURRENT author intent; native gather stays native-only.
 */
import { clone } from '../rules/value';
import { ownedImmutableFingerprint, semanticFingerprint } from '../rules/semantic';
import { companionFollowerPolicy, companionIdentity, companionVisible, isEventCompanion, planCompanionRecovery, planCompanionTrailEntry, recordCompanionLocation, registerEventCompanion, removeEventCompanions } from '../rules/event-companions';
import type { CompanionOrigin, CompanionRecovery, CompanionRemoval, CompanionSource, CompanionTrailEntry, CompanionTrailPorts } from '../rules/event-companions';
import { isTravelLocation } from '../rules/world-travel';
import type { GameState } from '../rules/state';
import type { Content } from '../rules/types';
import type { WorldLocation } from '../rules/world-data';
import type { EventCompanionState } from '../rules/world-state';
import type { TravelLease } from './world-travel-operation';

export type CompanionAction = { readonly kind: 'register'; readonly candidate: unknown }
  | { readonly kind: 'remove'; readonly removal: CompanionRemoval }
  | { readonly kind: 'recover' } | { readonly kind: 'player-moved'; readonly player: WorldLocation; readonly instant: boolean };
export interface CompanionObservation {
  readonly owner: object | null; readonly generation: number; readonly game: GameState; readonly content: Content;
  readonly action: CompanionAction; readonly authorVisible: boolean; readonly transferHidden: readonly string[];
}
export interface CompanionWrite { readonly game: GameState; readonly transferHidden: readonly string[]; readonly terminal: boolean }
export interface CompanionParent {
  observe(): CompanionObservation;
  /** Pure final joint guard + native atomic install; no fallback to read/assert/legacy replace. */
  commitCompanions(transform: (actual: CompanionObservation) => CompanionWrite): CompanionObservation;
  release(owner: object, generation: number): void;
}
export interface CompanionProjection {
  readonly companions: readonly EventCompanionState[]; readonly recovery: CompanionRecovery['instances'];
  readonly visibility: readonly { readonly identity: string; readonly visible: boolean }[];
  /** Install this mask separately from the author's native show/hide bit. Effective visibility must
   * always derive CURRENT author intent AND !mask, including when intent changes during projection. */
  readonly maskNativeFollowers: boolean;
  /** Informational snapshot only; never assign this to MZ's persisted author visibility switch. */
  readonly nativeVisible: boolean; readonly gatherMembers: 'native-only';
}
export interface CompanionHost {
  source(origin: CompanionOrigin): Promise<CompanionSource>;
  trail: CompanionTrailPorts;
  /** Returns ACTUAL observed position after the requested movement, not the intended landing. */
  move(entry: CompanionTrailEntry): Promise<WorldLocation>;
  /** Rebuild/project only; never rewrite author show/hide, actor party, native gather membership or player steps. */
  project(projection: CompanionProjection): Promise<void>;
}
export type CompanionResult = { readonly status: 'completed' | 'duplicate' | 'cancelled'; readonly diagnostics: readonly string[] }
  | { readonly status: 'failed'; readonly reason: string };
const same = (a: unknown, b: unknown): boolean => semanticFingerprint(a) === semanticFingerprint(b);
const why = (e: unknown): string => e instanceof Error ? e.message : String(e);
export class EventCompanionOperation {
  private readonly parent: CompanionParent;
  private readonly host: CompanionHost;
  private readonly lease: TravelLease;
  private expected: CompanionObservation | null = null;
  private expectedGameSnapshot: { readonly game: GameState; fingerprint: string | null } | null = null;
  private terminal: CompanionResult | null = null;
  private promise: Promise<CompanionResult> | null = null;
  constructor(parent: CompanionParent, host: CompanionHost, lease: TravelLease) { this.parent = parent; this.host = host; this.lease = Object.freeze({ owner: lease.owner, generation: lease.generation }); }
  private remember(actual: CompanionObservation): void {
    // Keep the original observation/copy order. Retain already-owned immutable Content;
    // cloning it would discard its runtime fingerprint ownership.
    const expected = { ...actual, game: clone(actual.game), content: ownedImmutableFingerprint(actual.content) === undefined ? clone(actual.content) : actual.content, action: clone(actual.action), transferHidden: [...actual.transferHidden] };
    // This JSON copy has no aliases to the current mutable state. Only our private expected
    // copy is frozen; the actual game must still be fingerprinted at every original guard.
    const freeze = (part: unknown): void => {
      if (part !== null && typeof part === 'object') { for (const child of Object.values(part)) freeze(child); Object.freeze(part); }
    };
    freeze(expected.game); this.expectedGameSnapshot = { game: expected.game, fingerprint: null };
    this.expected = expected;
  }
  private check(actual: CompanionObservation): void {
    if (this.terminal || actual.owner !== this.lease.owner || actual.generation !== this.lease.generation) throw Error('companion-owner-stale');
    if (!this.expected) throw Error('companion-context-changed');
    const actualGame = actual.game, expectedGame = this.expected.game, snapshot = this.expectedGameSnapshot;
    const actualGameIdentity = semanticFingerprint(actualGame);
    const expectedGameIdentity = snapshot && snapshot.game === expectedGame
      ? (snapshot.fingerprint ??= semanticFingerprint(snapshot.game)) : semanticFingerprint(expectedGame);
    if (actualGameIdentity !== expectedGameIdentity || !same(actual.content, this.expected.content) || !same(actual.action, this.expected.action) || !same(actual.transferHidden, this.expected.transferHidden)) throw Error('companion-context-changed');
    // Author intent may legally change during a wait; project the new intent, never restore a saved old value.
    if (typeof actual.authorVisible !== 'boolean') throw Error('companion-author-visibility-invalid');
  }
  private observe(): CompanionObservation { const actual = this.parent.observe(); this.check(actual); return actual; }
  private commit(transform: (actual: CompanionObservation) => CompanionWrite): void { this.remember(this.parent.commitCompanions(actual => { this.check(actual); return transform(actual); })); }
  cancel(): CompanionResult { if (!this.terminal) { this.terminal = { status: 'cancelled', diagnostics: [] }; this.parent.release(this.lease.owner, this.lease.generation); } return this.terminal; }
  run(): Promise<CompanionResult> { if (this.terminal) return Promise.resolve(this.terminal); if (!this.promise) this.promise = Promise.resolve().then(() => this.execute()); return this.promise; }
  private async source(origin: CompanionOrigin): Promise<CompanionSource> {
    let source: CompanionSource;
    try { source = await this.host.source(clone(origin)); } catch { source = { status: 'unavailable', reason: 'source-read-failed' }; }
    this.observe();
    try { semanticFingerprint(source); return source; } catch { return { status: 'invalid', reason: 'source-invalid' }; }
  }
  private async execute(): Promise<CompanionResult> {
    try {
      const initial = this.parent.observe();
      if (this.terminal) return this.terminal;
      if (initial.owner !== this.lease.owner || initial.generation !== this.lease.generation || !Number.isSafeInteger(initial.generation) || initial.generation < 0 || typeof initial.authorVisible !== 'boolean') throw Error('companion-not-admitted');
      // Registration candidates are unknown external data. Reject accessors before JSON cloning the action.
      semanticFingerprint(initial.action); this.remember(initial);
      const action = initial.action; let duplicate = false;
      if (action.kind === 'register') {
        if (!isEventCompanion(action.candidate)) throw Error('invalid-companion');
        const candidate = clone(action.candidate), old = initial.game.world.companions.some(c => companionIdentity(c) === companionIdentity(candidate));
        const source = old ? { status: 'unavailable' as const } : await this.source(candidate);
        const plan = registerEventCompanion(initial.game.world.companions, candidate, source);
        if (plan.status === 'refused') throw Error(plan.reason);
        duplicate = plan.status === 'duplicate';
        this.commit(actual => { const game = clone(actual.game); game.world.companions = plan.companions; return { game, transferHidden: actual.transferHidden, terminal: false }; });
      } else if (action.kind === 'remove') {
        if (!action.removal || action.removal.kind !== 'all' && action.removal.kind !== 'name' && action.removal.kind !== 'origin') throw Error('invalid-companion-removal');
        if (action.removal.kind === 'name' && typeof action.removal.name !== 'string' || action.removal.kind === 'origin' && (!Number.isSafeInteger(action.removal.originMapId) || action.removal.originMapId < 1 || !Number.isSafeInteger(action.removal.originEventId) || action.removal.originEventId < 1)) throw Error('invalid-companion-removal');
        this.commit(actual => {
          const game = clone(actual.game); game.world.companions = removeEventCompanions(game.world.companions, action.removal);
          const identities = new Set(game.world.companions.map(companionIdentity));
          return { game, transferHidden: actual.transferHidden.filter(id => identities.has(id)), terminal: false };
        });
      } else if (action.kind === 'player-moved') {
        if (!isTravelLocation(action.player) || typeof action.instant !== 'boolean') throw Error('invalid-companion-player-move');
        // The actual player's accepted START clears transfer hiding. A manual follow request
        // alone is not a substitute for that native lifecycle observation.
        this.commit(actual => ({ game: actual.game, transferHidden: actual.transferHidden, terminal: false }));
        for (let index = 0; index < initial.game.world.companions.length; index++) {
          const current = this.observe();
          const companion = current.game.world.companions[index], leader = index === 0 ? action.player : current.game.world.companions[index - 1]?.location;
          if (!companion || !leader) throw Error('companion-chain-changed');
          const entry = planCompanionTrailEntry(companion, leader, action.player, this.host.trail, action.instant); this.observe();
          if (entry.motion.kind === 'blocked') throw Error(`companion-trail-${entry.motion.reason}`);
          if (entry.motion.kind === 'stay' || entry.motion.kind === 'forced-route') continue;
          const actual = await this.host.move(clone(entry)); this.observe();
          if (!isTravelLocation(actual)) throw Error('invalid-companion-observed-location');
          this.commit(observed => { const game = clone(observed.game); game.world.companions = recordCompanionLocation(game.world.companions, entry.origin, actual); return { game, transferHidden: observed.transferHidden, terminal: false }; });
        }
      } else if (action.kind !== 'recover') throw Error('invalid-companion-action');
      const companions = this.observe().game.world.companions, sources = new Map<string, CompanionSource>();
      for (const c of companions) sources.set(companionIdentity(c), await this.source(c));
      const recovery = planCompanionRecovery(companions, origin => sources.get(companionIdentity(origin)) ?? { status: 'unavailable' });
      const actual = this.observe(), policy = companionFollowerPolicy(actual.authorVisible, actual.game.world.companions);
      await this.host.project({ companions: clone(actual.game.world.companions), recovery: recovery.instances, visibility: actual.game.world.companions.map(c => ({ identity: companionIdentity(c), visible: companionVisible(c, actual.transferHidden) })), maskNativeFollowers: actual.game.world.companions.length > 0, ...policy });
      this.observe();
      this.commit(observed => ({ game: observed.game, transferHidden: observed.transferHidden, terminal: true }));
      this.terminal = { status: duplicate ? 'duplicate' : 'completed', diagnostics: recovery.instances.filter(i => i.action === 'retain-unavailable').map(i => `${companionIdentity(i.origin)}:${i.reason}`) };
      return this.terminal;
    } catch (error) {
      if (!this.terminal) { this.terminal = { status: 'failed', reason: why(error) }; this.parent.release(this.lease.owner, this.lease.generation); }
      return this.terminal;
    }
  }
}
