import { BasicPictureGroup, pictureUnitsToMilliseconds } from './visual-timing';
import type { PictureGroupFrame } from './visual-timing';

/** Published presentation data only. Capture chances, rolls and consumption remain with the Session. */
export interface PublishedBallEvent { readonly type: string; readonly args: readonly string[]; }
export interface BallFeedback {
  readonly ball: string;
  readonly target: string | null;
  readonly outcome: 'blocked' | 'escaped' | 'caught';
  /** Engine capture checks, not a claim about the number of visible sprite wiggles. */
  readonly checks: number | null;
  readonly critical: boolean;
}
export type BallFeedbackPhase = 'throw' | 'absorb' | 'shake' | 'seal' | 'burst' | 'block';
export interface BallFeedbackTiming {
  readonly throwUnits: number;
  readonly absorbUnits: number;
  /** One aggregate shake phase; the future visual adapter chooses its sprite pattern. */
  readonly shakeUnits: number;
  readonly settleUnits: number;
  readonly blockUnits: number;
}
export interface BallFeedbackPlan extends BallFeedback {
  readonly version: 'ball-feedback-plan-v1';
  readonly phases: readonly Readonly<{ id: BallFeedbackPhase; startUnits: number; durationUnits: number }>[];
  readonly endUnits: number;
}

/** Ordinary player-side published results. Legacy/incomplete or unsupported events retain text fallback. */
export function readBallFeedback(event: PublishedBallEvent): BallFeedback | null {
  if (event.type !== 'rpg' || event.args[0] !== 'ball' || event.args[1] !== 'p1') return null;
  const [, , ball, target, outcome, rawChecks, rawCritical] = event.args;
  if (typeof ball !== 'string' || !ball) return null;
  if (outcome === 'blocked') return Object.freeze({ ball, target: null, outcome, checks: null, critical: false });
  if (outcome !== 'caught' && outcome !== 'escaped' || typeof target !== 'string' || !target || target === '-') return null;
  if (!/^[0-4]$/.test(rawChecks ?? '') || !/^[01]$/.test(rawCritical ?? '')) return null;
  const checks = Number(rawChecks);
  if (outcome === 'caught' ? checks !== 4 : checks === 4) return null;
  return Object.freeze({ ball, target, outcome, checks, critical: rawCritical === '1' });
}

/** WP67-A §8.1/9.3 ordering; durations are explicit presentation inputs, not invented capture rules. */
export function ballFeedbackPlan(event: PublishedBallEvent, timing: BallFeedbackTiming): BallFeedbackPlan | null {
  const result = readBallFeedback(event); if (!result) return null;
  const times = { ...timing };
  for (const key of ['throwUnits', 'absorbUnits', 'shakeUnits', 'settleUnits', 'blockUnits'] as const) pictureUnitsToMilliseconds(times[key]);
  const phases: { id: BallFeedbackPhase; startUnits: number; durationUnits: number }[] = [];
  let endUnits = 0;
  const add = (id: BallFeedbackPhase, durationUnits: number) => {
    const next = endUnits + durationUnits; pictureUnitsToMilliseconds(next);
    phases.push({ id, startUnits: endUnits, durationUnits }); endUnits = next;
  };
  add('throw', times.throwUnits);
  if (result.outcome === 'blocked') add('block', times.blockUnits);
  else {
    add('absorb', times.absorbUnits);
    if (result.checks! > 0) add('shake', times.shakeUnits);
    add(result.outcome === 'caught' ? 'seal' : 'burst', times.settleUnits);
  }
  return Object.freeze({ ...result, version: 'ball-feedback-plan-v1', phases: Object.freeze(phases.map(phase => Object.freeze(phase))), endUnits });
}

export interface BallFeedbackFrame extends PictureGroupFrame {
  readonly phase: BallFeedbackPhase | null;
  readonly phaseProgress: number;
  /** Cancellation completes cleanup, never authorizes a result message/ME/receiving continuation. */
  readonly resultReady: boolean;
}

/** Internal reusable clock. No renderer, audio, callbacks, RNG, application or state writes. */
export class BallFeedbackClock {
  private readonly group: BasicPictureGroup;
  private readonly plan: BallFeedbackPlan;
  constructor(plan: BallFeedbackPlan, effects: boolean) {
    this.plan = { ...plan, phases: plan.phases.map(phase => ({ ...phase })) };
    const kind = plan.outcome === 'blocked' ? 'blocked-ball' : 'capture';
    this.group = new BasicPictureGroup(this.plan.phases.map(phase => ({ ...phase, kind })), effects);
  }
  snapshot(): BallFeedbackPlan { return { ...this.plan, phases: this.plan.phases.map(phase => ({ ...phase })) }; }
  sample(now: number, sceneUpdate: number): BallFeedbackFrame {
    const frame = this.group.sample(now, sceneUpdate);
    const active = frame.frames.filter(track => track.started).at(-1);
    return { ...frame, phase: active ? active.id as BallFeedbackPhase : null, phaseProgress: active?.progress ?? 0,
      resultReady: frame.complete && !frame.cancelled };
  }
  cancel(): void { this.group.cancel(); }
}
