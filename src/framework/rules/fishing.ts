/** WP60: one fishing loop, driven by acknowledged presentation effects and an injected monotonic clock.
 * The caller owns operation identity, statistics, presentation and any later encounter request.
 */
import type { Member } from './types';
import type { WorldFact } from './world-data';

export type FishingRod = 1 | 2 | 3;
export type FishingEncounterType = 'OldRod' | 'GoodRod' | 'SuperRod';
export type FishingRandom = (upperExclusive: number) => number;
export const fishingEncounterType = (rod: FishingRod): FishingEncounterType => {
  checkRod(rod);
  return rod === 1 ? 'OldRod' : rod === 2 ? 'GoodRod' : 'SuperRod';
};
function checkRod(rod: FishingRod): void {
  if (rod !== 1 && rod !== 2 && rod !== 3) throw new RangeError('invalid-fishing-rod');
}
export function fishingAccelerated(party: readonly Pick<Member, 'isEgg' | 'ability'>[]): boolean {
  const first = party.find(member => !member.isEgg);
  return first !== undefined && ['stickyhold', 'suctioncups'].includes(first.ability.toLowerCase().replace(/[^a-z0-9]/g, ''));
}
export function fishingBiteThreshold(rod: FishingRod, accelerated: boolean): number {
  checkRod(rod);
  return (20 + 25 * rod) * (accelerated ? 1.5 : 1);
}
export function fishingBite(rod: FishingRod, accelerated: boolean, roll: number): boolean {
  if (!Number.isInteger(roll) || roll < 0 || roll >= 100) throw new RangeError('invalid-fishing-roll');
  return roll < fishingBiteThreshold(rod, accelerated);
}
export interface FishingEligibilityFacts {
  facingFishable: WorldFact<boolean>;
  /** The current tile's outgoing edge, never the target tile's incoming edge. */
  currentExitPassable: WorldFact<boolean>;
  surfing: WorldFact<boolean>;
}
export type FishingEligibility = { allowed: true } | { allowed: false; reason: 'not-fishable' | 'exit-blocked' | 'facts-unavailable' | 'facts-invalid' };
export function fishingEligibility(facts: FishingEligibilityFacts): FishingEligibility {
  const facing = facts.facingFishable;
  if (facing.status !== 'value') return { allowed: false, reason: facing.status === 'invalid' ? 'facts-invalid' : 'facts-unavailable' };
  if (typeof facing.value !== 'boolean') return { allowed: false, reason: 'facts-invalid' };
  if (!facing.value) return { allowed: false, reason: 'not-fishable' };
  const surf = facts.surfing;
  if (surf.status !== 'value') return { allowed: false, reason: surf.status === 'invalid' ? 'facts-invalid' : 'facts-unavailable' };
  if (typeof surf.value !== 'boolean') return { allowed: false, reason: 'facts-invalid' };
  if (surf.value) return { allowed: true };
  const exit = facts.currentExitPassable;
  if (exit.status !== 'value') return { allowed: false, reason: exit.status === 'invalid' ? 'facts-invalid' : 'facts-unavailable' };
  if (typeof exit.value !== 'boolean') return { allowed: false, reason: 'facts-invalid' };
  return exit.value ? { allowed: true } : { allowed: false, reason: 'exit-blocked' };
}

export interface FishingClockSample { readonly monotonicMs: number; readonly active: boolean }
export interface FishingClock extends FishingClockSample { readonly elapsedMs: number }
/** Sample once on blur and once on resume. The interval following a blur sample contributes zero. */
export function sampleFishingClock(previous: FishingClock, sample: FishingClockSample): FishingClock {
  checkSample(sample);
  if (sample.monotonicMs < previous.monotonicMs) throw new RangeError('non-monotonic-fishing-clock');
  const elapsedMs = previous.elapsedMs + (previous.active ? sample.monotonicMs - previous.monotonicMs : 0);
  if (!Number.isFinite(elapsedMs)) throw new RangeError('invalid-fishing-elapsed-time');
  return { ...sample, elapsedMs };
}
function checkSample(sample: FishingClockSample): void {
  if (!Number.isFinite(sample.monotonicMs) || sample.monotonicMs < 0 || typeof sample.active !== 'boolean') throw new RangeError('invalid-fishing-clock');
}
export function fishingShakeFrame(elapsedMs: number): 0 | 1 {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new RangeError('invalid-fishing-elapsed-time');
  const slot = Math.floor(elapsedMs / 200) % 8;
  return slot === 0 || slot === 2 ? 1 : 0;
}
export interface FishingOptions {
  readonly rod: FishingRod;
  /** A missing or empty rod table supplies false; it does not prevent the waiting performance. */
  readonly allowBite: boolean;
  readonly accelerated: boolean;
  readonly autoHook: boolean;
  readonly surfing: boolean;
  readonly exclamationAnimationId?: number;
}
export type FishingResult = 'no-bite' | 'escaped' | 'caught';
export type FishingInterruption = 'scene-closed' | 'host-failed' | 'cancelled';
export type FishingPhase = 'starting' | 'waiting' | 'bite-check' | 'bite-window' | 'hook-check' | 'ending' | 'restoring' | 'done';
export type FishingBlockingEffect =
  | { readonly id: number; readonly kind: 'begin-presentation'; readonly surfing: boolean }
  | { readonly id: number; readonly kind: 'open-message' }
  | { readonly id: number; readonly kind: 'dots'; readonly dots: number }
  | { readonly id: number; readonly kind: 'exclamation'; readonly animationId: number }
  | { readonly id: number; readonly kind: 'bite-message' }
  | { readonly id: number; readonly kind: 'end-presentation'; readonly surfing: boolean }
  | { readonly id: number; readonly kind: 'result-message'; readonly result: FishingResult }
  | { readonly id: number; readonly kind: 'restore'; readonly surfing: boolean; readonly interrupted: boolean };
export interface FishingCompletion {
  readonly status: 'completed' | 'interrupted';
  readonly caught: boolean;
  readonly encounterType: FishingEncounterType;
  readonly reason?: FishingInterruption;
  readonly cleanupFailed: boolean;
}
export type FishingEffect = FishingBlockingEffect
  | { readonly kind: 'started' }
  | { readonly kind: 'shake'; readonly frame: 0 | 1 }
  | { readonly kind: 'finished'; readonly completion: FishingCompletion };
export interface FishingState {
  readonly options: FishingOptions;
  readonly clock: FishingClock;
  readonly phase: FishingPhase;
  readonly pending: FishingBlockingEffect | null;
  /** A one-shot completion may arrive while paused; consume it once when focus returns. */
  readonly pendingCompleted: boolean;
  readonly nextEffectId: number;
  readonly segmentCount: number;
  readonly segmentIndex: number;
  readonly stageStartedMs: number;
  readonly windowMs: number;
  readonly shakeFrame: 0 | 1;
  readonly result: FishingResult | null;
  readonly interruption: FishingInterruption | null;
  readonly completion: FishingCompletion | null;
}
export interface FishingAdvance {
  readonly sample: FishingClockSample;
  readonly confirm?: boolean;
  readonly cancel?: boolean;
  readonly effect?: { readonly id: number; readonly status: 'completed' | 'failed' };
  readonly interrupt?: FishingInterruption;
}
export interface FishingTransition { readonly state: FishingState; readonly effects: readonly FishingEffect[] }
type EffectRequest =
  | { kind: 'begin-presentation' | 'end-presentation'; surfing: boolean }
  | { kind: 'open-message' | 'bite-message' }
  | { kind: 'dots'; dots: number }
  | { kind: 'exclamation'; animationId: number }
  | { kind: 'result-message'; result: FishingResult }
  | { kind: 'restore'; surfing: boolean; interrupted: boolean };
function request(state: FishingState, effect: EffectRequest): FishingTransition {
  const pending: FishingBlockingEffect = { ...effect, id: state.nextEffectId };
  return { state: { ...state, pending, pendingCompleted: false, nextEffectId: state.nextEffectId + 1 }, effects: [pending] };
}
function draw(random: FishingRandom, upperExclusive: number): number {
  const value = random(upperExclusive);
  if (!Number.isInteger(value) || value < 0 || value >= upperExclusive) throw new RangeError('invalid-fishing-random');
  return value;
}
export function startFishing(options: FishingOptions, sample: FishingClockSample): FishingTransition {
  checkRod(options.rod); checkSample(sample);
  for (const value of [options.allowBite, options.accelerated, options.autoHook, options.surfing]) if (typeof value !== 'boolean') throw new RangeError('invalid-fishing-options');
  if (options.exclamationAnimationId !== undefined && (!Number.isSafeInteger(options.exclamationAnimationId) || options.exclamationAnimationId < 0)) throw new RangeError('invalid-fishing-animation');
  const state: FishingState = { options: { ...options }, clock: { ...sample, elapsedMs: 0 }, phase: 'starting', pending: null, pendingCompleted: false, nextEffectId: 1,
    segmentCount: 0, segmentIndex: 0, stageStartedMs: 0, windowMs: 0, shakeFrame: 0, result: null, interruption: null, completion: null };
  const next = request(state, { kind: 'begin-presentation', surfing: options.surfing });
  return { ...next, effects: [{ kind: 'started' }, ...next.effects] };
}
function restore(state: FishingState): FishingTransition {
  return request({ ...state, phase: 'restoring', pending: null }, { kind: 'restore', surfing: state.options.surfing, interrupted: state.interruption !== null });
}
function end(state: FishingState, result: FishingResult): FishingTransition {
  return request({ ...state, phase: 'ending', result }, { kind: 'end-presentation', surfing: state.options.surfing });
}
function finish(state: FishingState, cleanupFailed: boolean): FishingTransition {
  const completion: FishingCompletion = { status: state.interruption ? 'interrupted' : 'completed', caught: state.interruption === null && state.result === 'caught',
    encounterType: fishingEncounterType(state.options.rod), cleanupFailed, ...(state.interruption ? { reason: state.interruption } : {}) };
  return { state: { ...state, phase: 'done', pending: null, pendingCompleted: false, completion }, effects: [{ kind: 'finished', completion }] };
}
/** No catch-up loop: every dot/message/animation must complete before a later stage can draw RNG.
 * The five loop gates are waiting segments, waiting cancellation, bite check, input window, hook check.
 * A failed effect or scene close requests owned presentation cleanup, preserving the reached prefix.
 */
export function advanceFishing(previous: FishingState, input: FishingAdvance, random: FishingRandom): FishingTransition {
  if ((input.confirm !== undefined && typeof input.confirm !== 'boolean') || (input.cancel !== undefined && typeof input.cancel !== 'boolean')) throw new RangeError('invalid-fishing-input');
  let state: FishingState = { ...previous, clock: sampleFishingClock(previous.clock, input.sample) };
  if (state.phase === 'done') return { state, effects: [] };
  if (input.interrupt !== undefined && !['scene-closed', 'host-failed', 'cancelled'].includes(input.interrupt)) throw new RangeError('invalid-fishing-interruption');
  if (input.interrupt) {
    state = { ...state, interruption: state.interruption ?? input.interrupt };
    if (state.phase !== 'restoring') return restore(state);
  }
  const pending = state.pending;
  if (input.effect) {
    if (input.effect.status !== 'completed' && input.effect.status !== 'failed') throw new RangeError('invalid-fishing-acknowledgement');
    if (!pending || input.effect.id !== pending.id) {
      if (!state.pendingCompleted) return { state, effects: [] };
    } else if (!state.pendingCompleted) {
      if (input.effect.status === 'failed') {
        if (pending.kind === 'restore') return finish({ ...state, interruption: state.interruption ?? 'host-failed' }, true);
        return restore({ ...state, interruption: 'host-failed' });
      }
      state = { ...state, pendingCompleted: true };
    }
  }
  if (pending && state.pendingCompleted) {
    if (!state.clock.active && pending.kind !== 'restore') return { state, effects: [] };
    const ready = { ...state, pending: null, pendingCompleted: false };
    switch (pending.kind) {
      case 'begin-presentation': return request(ready, { kind: 'open-message' });
      case 'open-message': {
        const first = 5 + draw(random, 6), second = state.options.accelerated ? 5 + draw(random, 6) : first;
        return request({ ...ready, phase: 'waiting', segmentCount: Math.min(first, second) + 1 }, { kind: 'dots', dots: 0 });
      }
      case 'dots': return { state: { ...ready, stageStartedMs: state.clock.elapsedMs }, effects: [] };
      case 'exclamation': return request({ ...ready, windowMs: (5 + draw(random, 6)) * 100 }, { kind: 'bite-message' });
      case 'bite-message': return { state: { ...ready, phase: 'bite-window', stageStartedMs: state.clock.elapsedMs }, effects: [] };
      case 'end-presentation': return state.result === 'caught' && state.options.autoHook ? restore(ready)
        : request(ready, { kind: 'result-message', result: state.result ?? 'no-bite' });
      case 'result-message': return restore(ready);
      case 'restore': return finish(ready, false);
    }
  }
  if (pending || !state.clock.active) return { state, effects: [] };
  const pressed = input.confirm === true || input.cancel === true;
  if (state.phase === 'waiting') {
    if (pressed) return end(state, 'no-bite');
    if (state.clock.elapsedMs - state.stageStartedMs < 400) return { state, effects: [] };
    const segmentIndex = state.segmentIndex + 1;
    if (segmentIndex < state.segmentCount) return request({ ...state, segmentIndex }, { kind: 'dots', dots: segmentIndex });
    const checked = { ...state, phase: 'bite-check' as const };
    if (!state.options.allowBite || !fishingBite(state.options.rod, state.options.accelerated, draw(random, 100))) return end(checked, 'no-bite');
    return request(checked, { kind: 'exclamation', animationId: state.options.exclamationAnimationId ?? 3 });
  }
  if (state.phase === 'bite-window') {
    const elapsed = state.clock.elapsedMs - state.stageStartedMs;
    const frame = fishingShakeFrame(elapsed), effects: FishingEffect[] = [{ kind: 'shake', frame }];
    const shaken = { ...state, shakeFrame: frame };
    if (pressed) {
      const hooked = { ...shaken, phase: 'hook-check' as const, shakeFrame: 0 as const };
      if (!state.options.autoHook) draw(random, 100); // The current hook threshold is 100, but the draw is required.
      const next = end(hooked, 'caught');
      return { state: next.state, effects: [...effects, { kind: 'shake', frame: 0 }, ...next.effects] };
    }
    if (!state.options.autoHook && elapsed > state.windowMs) {
      const next = end(shaken, 'escaped');
      return { state: next.state, effects: [...effects, ...next.effects] };
    }
    return { state: shaken, effects };
  }
  return { state, effects: [] };
}
