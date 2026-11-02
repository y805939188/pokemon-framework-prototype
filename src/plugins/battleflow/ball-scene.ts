import { ballFeedbackPlan, BallFeedbackClock, readBallFeedback } from './ball-feedback';
import type { BallFeedbackPlan, BallFeedbackFrame, PublishedBallEvent } from './ball-feedback';
import { BasicPictureGroup } from './visual-timing';
import type { BattleSceneVisualStep } from './controller';

export interface BallPose { flight: number; lift: number; drop: number; rotation: number; opacity: number; scale: number; }
export interface BallScenePorts<T> {
  current(): boolean;
  updateOrdinal(): number;
  create(plan: BallFeedbackPlan): T;
  paint(handle: T, pose: Readonly<BallPose>): void;
  release(handle: T): void;
  target(scale: number): boolean;
  box(opacity: number): boolean;
}
/** Simple replaceable UI preset, not a claim to reproduce the reference animation database. */
export function simpleBallPlan(event: PublishedBallEvent): BallFeedbackPlan | null {
  const value = readBallFeedback(event); if (!value) return null;
  const wiggles = value.critical ? 1 : Math.min(value.checks ?? 0, 3);
  return ballFeedbackPlan(event, { throwUnits: 10, absorbUnits: 4, shakeUnits: wiggles * 6, settleUnits: 4, blockUnits: 6 });
}

/** Transient visuals only. A caught ball is retained through ME/growth until its separately queued hide. */
export class BallScenePresentation<T> implements BattleSceneVisualStep {
  readonly kind = 'visual' as const;
  private readonly clock: BallFeedbackClock;
  private handle: T | null = null;
  private animationDone = false;
  private closed = false;
  private cancelled = false;
  private advancing = false;
  private sampled = -1;
  private hideSampled = -1;
  private hideClock: BasicPictureGroup | null = null;
  private frame: BallFeedbackFrame | null = null;
  private pose: BallPose = { flight: 0, lift: 0, drop: 0, rotation: 0, opacity: 1, scale: 1 };
  private error: string | null = null;
  readonly cleanupErrors: string[] = [];
  constructor(private readonly plan: BallFeedbackPlan, effects: boolean, private readonly ports: BallScenePorts<T>) {
    this.clock = new BallFeedbackClock(plan, effects);
  }
  pending(): boolean { return !this.closed && !this.cancelled; }
  private live(): boolean { return !this.cancelled && this.ports.current(); }
  private release(): void {
    const handle = this.handle; this.handle = null;
    if (handle !== null) this.ports.release(handle);
  }
  cancel(): void {
    if (this.closed || this.cancelled) return;
    this.cancelled = true; this.clock.cancel(); this.hideClock?.cancel();
    try { this.release(); } catch (error) { this.cleanupErrors.push(String(error)); this.error ??= String(error); }
  }
  advance(now: number): boolean {
    if (this.advancing) return false;
    if (!this.live()) { this.cancel(); return false; }
    if (this.animationDone) return true;
    this.advancing = true;
    try {
      const update = this.ports.updateOrdinal(); if (!this.live()) { this.cancel(); return false; }
      if (update === this.sampled) return false;
      const frame = this.clock.sample(now, update); this.sampled = update; this.frame = frame;
      if (this.handle === null) {
        const handle = this.ports.create(this.plan);
        if (!this.live()) { this.ports.release(handle); this.cancel(); return false; }
        this.handle = handle;
      }
      const p = (id: string) => frame.frames.find(track => track.id === id)?.progress ?? 0;
      const flight = p('throw'), absorb = p('absorb'), burst = p('burst'), block = p('block'), shake = p('shake');
      const wiggles = this.plan.critical ? 1 : Math.min(this.plan.checks ?? 0, 3);
      this.pose = { flight: flight - block * .25, lift: flight < 1 ? 4 * flight * (1 - flight) : 0,
        drop: this.plan.outcome === 'blocked' ? block * 2 : absorb,
        rotation: shake > 0 && shake < 1 ? Math.sin(shake * Math.PI * 2 * wiggles) * .3 : 0,
        opacity: 1 - Math.max(block, burst), scale: 1 - burst };
      if (this.plan.target !== null && !this.ports.target(Math.min(1, 1 - absorb + burst))) {
        if (!this.live()) { this.cancel(); return false; }
        throw new Error('ball presentation target unavailable');
      }
      if (!this.live()) { this.cancel(); return false; }
      this.ports.paint(this.handle, { ...this.pose });
      if (!this.live()) { this.cancel(); return false; }
      if (!frame.resultReady) return false;
      if (this.plan.outcome !== 'caught') { this.release(); this.closed = true; }
      this.animationDone = true; return true;
    } catch (error) { this.error ??= String(error); this.cancel(); throw error; }
    finally { this.advancing = false; }
  }
  /** Called only after the normal capture ME and growth queue; its one second starts on first advance. */
  hide(): BattleSceneVisualStep {
    return { kind: 'visual', cancel: () => this.cancel(), advance: now => {
      if (this.advancing) return false;
      if (!this.live()) { this.cancel(); return false; }
      if (this.closed) return true;
      if (!this.animationDone || this.plan.outcome !== 'caught') throw new Error('capture hide before capture animation');
      this.advancing = true;
      try {
        const update = this.ports.updateOrdinal(); if (update === this.hideSampled) return false;
        this.hideClock ??= new BasicPictureGroup([{ id: 'ball', kind: 'capture', startUnits: 0, durationUnits: 20 },
          { id: 'box', kind: 'capture', startUnits: 0, durationUnits: 5 }], true);
        const frame = this.hideClock.sample(now, update); this.hideSampled = update;
        const ball = frame.frames.find(track => track.id === 'ball')!.progress, box = frame.frames.find(track => track.id === 'box')!.progress;
        if (!this.ports.box(1 - box)) { if (!this.live()) { this.cancel(); return false; } throw new Error('captured data box unavailable'); }
        if (!this.live()) { this.cancel(); return false; }
        this.ports.paint(this.handle!, { ...this.pose, opacity: 1 - ball });
        if (!this.live()) { this.cancel(); return false; }
        if (!frame.complete) return false;
        this.release(); this.closed = true; return true;
      } catch (error) { this.error ??= String(error); this.cancel(); throw error; }
      finally { this.advancing = false; }
    } };
  }
  snapshot() {
    return { version: 'ball-feedback-scene-v1' as const, preset: 'simple-ball-feedback-v1', plan: this.clock.snapshot(),
      animationDone: this.animationDone, closed: this.closed, cancelled: this.cancelled, pending: this.pending(),
      sampledUpdate: this.sampled, hideSampledUpdate: this.hideSampled, pose: { ...this.pose },
      frame: this.frame ? { ...this.frame, frames: this.frame.frames.map(track => ({ ...track })) } : null,
      error: this.error, cleanupErrors: [...this.cleanupErrors] };
  }
}
