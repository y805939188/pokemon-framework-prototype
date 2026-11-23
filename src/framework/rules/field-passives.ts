/** WP06 §4 / WP61 §3–5. Pure plans; the application owns installation and every UI continuation. */
import { planFriendshipChange } from './friendship';
import type { FriendshipContext } from './friendship';
import { clearEvolutionReadiness } from './evolution-readiness';
import { addSteps, STEP_MODULUS } from './stats';
import type { Member } from './types';
import type { WorldState } from './world-state';

export type FieldPassiveState = Pick<WorldState, 'happinessSteps' | 'repelSteps'>;
export type FieldRandom = (upperBound: number) => number;

export interface CompletedFieldStepInput {
  readonly steps: number;
  readonly world: Readonly<FieldPassiveState>;
  readonly party: readonly Member[];
  readonly ice: boolean;
  readonly hasRepelItems: boolean;
  readonly friendship: FriendshipContext;
}

export interface CompletedFieldStepPrefix {
  readonly kind: 'completed-step-prefix';
  readonly steps: number;
  readonly world: FieldPassiveState;
  readonly party: Member[];
  /** Latched before decrement and before any renewal UI; C uses this value for this step's repel gate. */
  readonly repelActiveAtStart: boolean;
  /** Present only after the application commits this prefix, before continuing to poison or arrival events. */
  readonly repelExpiry: 'none' | 'notice' | 'renewal-choice';
}

function usable(member: Member): boolean { return !member.isEgg && member.hp > 0; }

function count(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a nonnegative safe integer`);
}

function friendshipAfter(member: Member, method: 'walking' | 'faint', context: FriendshipContext): number {
  const plan = planFriendshipChange(member, method, context);
  if (plan.status !== 'ready') throw new Error(`field-${method}: ${plan.reason}`);
  return plan.after;
}

/**
 * One completed ordinary step. The host applies forced-route/interpreter guards and completion deduplication first.
 * No state is installed here: failure while making the prefix leaves the caller's input unchanged. Once installed,
 * cancellation of renewal or failure of a later stage must retain this prefix rather than replay or roll it back.
 */
export function planCompletedFieldStep(input: CompletedFieldStepInput, random: FieldRandom): CompletedFieldStepPrefix {
  count(input.steps, 'steps');
  if (input.steps >= STEP_MODULUS) throw new RangeError('steps must be below 2^31');
  count(input.world.happinessSteps, 'happinessSteps');
  count(input.world.repelSteps, 'repelSteps');
  const party = input.party.slice();
  const friendshipDue = input.world.happinessSteps >= 127;
  if (friendshipDue) {
    for (let index = 0; index < party.length; index++) {
      const member = party[index]!;
      if (!usable(member)) continue;
      // R09: every usable member draws, including friendship 255 and zero-delta soft-cap results.
      const roll = random(2);
      if (!Number.isInteger(roll) || roll < 0 || roll >= 2) throw new RangeError('field-walking random(2) returned an invalid value');
      if (roll === 0) party[index] = { ...member, friendship: friendshipAfter(member, 'walking', input.friendship) };
    }
  }
  const repelActiveAtStart = input.world.repelSteps > 0;
  const repelSteps = repelActiveAtStart && !input.ice ? input.world.repelSteps - 1 : input.world.repelSteps;
  const expired = repelActiveAtStart && repelSteps === 0;
  return {
    kind: 'completed-step-prefix', steps: addSteps(input.steps), party,
    world: { happinessSteps: friendshipDue ? 0 : input.world.happinessSteps + 1, repelSteps },
    repelActiveAtStart, repelExpiry: expired ? input.hasRepelItems ? 'renewal-choice' : 'notice' : 'none',
  };
}

export interface FieldPoisonConfig {
  readonly POISON_IN_FIELD: boolean;
  readonly POISON_FAINT_IN_FIELD: boolean;
}

/** A process-local continuation, never a save field or authority to install into another application generation. */
export interface FieldPoisonContinuation {
  readonly partyIds: readonly string[];
  /** The usable-member set at the beginning of the poison batch, in party order. */
  readonly memberIds: readonly string[];
  readonly index: number;
  readonly feedbackIssued: boolean;
  readonly handled: boolean;
  readonly allowFaint: boolean;
}

export interface FieldPoisonFinished {
  readonly kind: 'finished';
  readonly handled: boolean;
  readonly reason: 'already-handled' | 'disabled' | 'not-poison-tick' | 'complete';
}

export type FieldPoisonStart = FieldPoisonFinished | {
  readonly kind: 'active';
  readonly continuation: FieldPoisonContinuation;
};

export type FieldPoisonStage = FieldPoisonFinished | {
  readonly kind: 'feedback';
  /** Semantic intents; the MZ adapter chooses the asset and applies one sound and one red flash. */
  readonly feedback: { readonly sound: 'poison-step'; readonly flash: 'red' };
  /** Accept after feedback succeeds; on failure retain the already installed step prefix and stop this batch. */
  readonly continuation: FieldPoisonContinuation;
} | {
  readonly kind: 'member';
  readonly memberId: string;
  readonly party: Member[];
  readonly message: 'none' | 'survived-poison' | 'fainted';
  /** After installing this member plan and presenting its message, hand off to field blackout without battle money. */
  readonly blackout: boolean;
  readonly continuation: FieldPoisonContinuation;
};

/** WP61 §5.3 also permits the direct empty/all-ineligible-party check. It does not settle money or heal anyone. */
export function fieldBlackoutRequired(party: readonly Member[]): boolean { return !party.some(usable); }

/** Called after prefix/renewal: a previously handled transfer skips the entire poison consumer. */
export function beginFieldPoison(
  steps: number, party: readonly Member[], config: FieldPoisonConfig, handled = false,
): FieldPoisonStart {
  if (handled) return { kind: 'finished', handled, reason: 'already-handled' };
  if (!config.POISON_IN_FIELD) return { kind: 'finished', handled, reason: 'disabled' };
  count(steps, 'steps');
  if (steps >= STEP_MODULUS) throw new RangeError('steps must be below 2^31');
  if (steps % 4 !== 0) return { kind: 'finished', handled, reason: 'not-poison-tick' };
  return { kind: 'active', continuation: {
    partyIds: party.map(member => member.id), memberIds: party.filter(usable).map(member => member.id),
    index: 0, feedbackIssued: false, handled: false, allowFaint: config.POISON_FAINT_IN_FIELD,
  } };
}

/**
 * Produce one feedback or member stage. Resume against the current party after UI/blackout healing; do not retain
 * old poison booleans. A party identity/order change requires the application to stop or explicitly restart its work.
 * The application checks generation and accepts each continuation once. Repeating this pure query is not a commit.
 */
export function planNextFieldPoison(
  continuation: FieldPoisonContinuation, party: readonly Member[], context: FriendshipContext,
): FieldPoisonStage {
  if (party.length !== continuation.partyIds.length || party.some((member, index) => member.id !== continuation.partyIds[index])) {
    throw new Error('field-poison-party-changed');
  }
  for (let index = continuation.index; index < continuation.memberIds.length; index++) {
    const memberId = continuation.memberIds[index]!;
    const partyIndex = party.findIndex(member => member.id === memberId);
    const member = party[partyIndex]!;
    if (member.status !== 'psn' || member.ability.toLowerCase() === 'immunity') continue;
    if (!continuation.feedbackIssued) return {
      kind: 'feedback', feedback: { sound: 'poison-step', flash: 'red' },
      continuation: { ...continuation, index, feedbackIssued: true },
    };
    const hp = member.hp > 1 || continuation.allowFaint ? Math.max(0, member.hp - 1) : member.hp;
    let next = { ...member, hp };
    let message: 'none' | 'survived-poison' | 'fainted' = 'none';
    if (hp === 1 && !continuation.allowFaint) {
      next = { ...next, status: '', statusCount: 0 };
      message = 'survived-poison';
    } else if (hp === 0) {
      next = { ...clearEvolutionReadiness(next), status: '', statusCount: 0, friendship: friendshipAfter(member, 'faint', context) };
      message = 'fainted';
    }
    const updated = party.slice(); updated[partyIndex] = next;
    const blackout = fieldBlackoutRequired(updated);
    return {
      kind: 'member', memberId, party: updated, message, blackout,
      continuation: { ...continuation, index: index + 1, handled: continuation.handled || blackout },
    };
  }
  return { kind: 'finished', handled: continuation.handled, reason: 'complete' };
}
