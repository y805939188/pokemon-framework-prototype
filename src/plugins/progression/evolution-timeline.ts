/** Monotonic presentation clock, no domain writes. BACK is sampled before the final animation completion check. */
export class EvolutionTimeline {
  phase: 'what' | 'intro' | 'animation' | 'flash' | 'success' | 'cancelled' | 'ended' = 'what';
  cancelled = false;
  private now: number;
  private since: number;
  readonly cancellable: boolean;
  constructor(cancellable: boolean, now: number) { this.cancellable = cancellable; this.now = this.since = now; }
  get successReady() { return this.phase === 'success' && this.now - this.since >= 4000; }
  update(now: number, input: { use?: boolean; back?: boolean }): 'complete' | 'cancel' | null {
    this.now = Math.max(this.now, now);
    const elapsed = this.now - this.since;
    if (this.phase === 'what' && (input.use || input.back)) { this.phase = 'intro'; this.since = this.now; }
    else if (this.phase === 'intro' && elapsed >= 1000) { this.phase = 'animation'; this.since = this.now; }
    else if (this.phase === 'animation') {
      if (input.back && this.cancellable) { this.cancelled = true; this.phase = 'flash'; this.since = this.now; }
      else if (elapsed >= 9000) { this.phase = 'flash'; this.since = this.now; }
    } else if (this.phase === 'flash' && elapsed >= 400) {
      this.since = this.now;
      if (this.cancelled) { this.phase = 'cancelled'; return 'cancel'; }
      this.phase = 'success';
    } else if (this.successReady && (input.use || input.back)) { this.phase = 'ended'; return 'complete'; }
    return null;
  }
  get picture() {
    const elapsed = this.now - this.since;
    if (this.phase === 'animation') {
      const growth = Math.min(1, Math.max(0, (elapsed - 2000) / 600));
      const beat = Math.abs(Math.sin(Math.PI * Math.pow(elapsed / 1800, 1.7)));
      return { oldScale: 1 - beat * growth, targetScale: beat * growth, targetVisible: true, targetWhite: true, white: 0 };
    }
    const target = !this.cancelled && ['success', 'ended'].includes(this.phase);
    return { oldScale: target ? 0 : 1, targetScale: target ? 1 : 0,
      targetVisible: target, targetWhite: false, white: this.phase === 'flash' ? 1 - Math.abs(2 * Math.min(1, elapsed / 400) - 1) : 0 };
  }
}
