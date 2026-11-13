import { CaptureMelodyWait } from './capture-melody';
import type { CaptureMelodyPlan } from './capture-melody';
import type { CaptureMELease } from './capture-me-mz';

/** One transient presentation step, never a battle result or a save-lock owner. */
export class CaptureMelodySceneStep {
  readonly kind = 'visual' as const;
  private readonly wait = new CaptureMelodyWait();
  private lease: CaptureMELease | null = null;
  private started = false;
  private completed = false;
  private cancelled = false;
  private advancing = false;
  private error: string | null = null;
  constructor(private readonly plan: CaptureMelodyPlan, private readonly ports: {
    current(): boolean;
    request: (track: CaptureMelodyPlan['track'], phaseStartedAt: number) => CaptureMELease;
  }) {}
  pending(): boolean { return !this.completed && !this.cancelled; }
  snapshot() { return { version: 'capture-me-scene-v1' as const, started: this.started, completed: this.completed,
    cancelled: this.cancelled, error: this.error, track: { ...this.plan.track }, wait: this.wait.snapshot(), lease: this.lease?.snapshot() ?? null }; }
  private remember(error: unknown): void { this.error ??= String(error instanceof Error ? error.message : error); }
  cancel(): void {
    if (this.completed) return;
    this.cancelled = true; this.wait.cancel(); // revoke playback permission before reentrant cleanup
    try {
      const view = this.lease?.release();
      if (view && (view.fault !== null || !view.stopConfirmed)) this.remember(view.fault ?? 'capture ME stop unconfirmed');
      else if ((!this.started || this.lease !== null) && this.wait.snapshot().stopRequired) this.wait.acknowledgeStop();
    } catch (error) { this.remember(error); }
  }
  advance(now: number): boolean {
    if (this.advancing) return false;
    if (this.completed) return true;
    if (this.cancelled || !this.ports.current()) { this.cancel(); return false; }
    if (this.error !== null) throw new Error(this.error);
    this.advancing = true;
    try {
      if (!this.started) {
        this.wait.begin(now); this.started = true;
        this.lease = this.ports.request(this.plan.track, now);
        if (this.cancelled || !this.ports.current()) { this.cancel(); return false; }
      }
      const view = this.lease!.snapshot();
      if (view.fault !== null) throw new Error(view.fault);
      const wait = this.wait.advance(now);
      if (!wait.stopRequired) return false;
      const released = this.lease!.release();
      if (this.cancelled || !this.ports.current()) { this.cancel(); return false; }
      if (released.fault !== null || !released.stopConfirmed) throw new Error(released.fault ?? 'capture ME stop unconfirmed');
      this.wait.acknowledgeStop(); this.completed = true; return true;
    } catch (error) { this.remember(error); throw error; }
    finally { this.advancing = false; }
  }
}
